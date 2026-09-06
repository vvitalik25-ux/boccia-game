function physics(){
  if(phase==='trainingEdit')return;
  if(gameMode==='online')return;
  const c=court(),throwY=throwingY();

  for(const b of allObjects()){
    b.x+=b.vx;b.y+=b.vy;
    applyGravityAndFloor(b);
    if(b.y-b.r<throwY)b.entered=true;

    const s=Math.hypot(b.vx,b.vy);
    if(s>0){
      const pp=physicsFor(b);
      if(realisticMode && b.realism && (b.z||0)===0){
        if(!b.realism.startSpeed||s>b.realism.startSpeed)b.realism.startSpeed=s;
        const ux=b.vx/s,uy=b.vy/s,px=-uy,py=ux;
        const startSpeed=Math.max(.001,b.realism.startSpeed||s);
        const speedRatio=Math.max(0,Math.min(1,s/startSpeed));
        // Чем медленнее катится мяч, тем меньше стабильность.
        // На высокой скорости увод маловероятен, а при замедлении
        // шанс и сила случайного сваливания растут.
        const instability=Math.pow(1-speedRatio,1.65);
        const lowSpeedBoost=s<=b.realism.slowThreshold ? 1+((b.realism.slowThreshold-s)/Math.max(.08,b.realism.slowThreshold))*1.35 : 1;
        const driftScale=.05 + instability*1.45*lowSpeedBoost;

        b.realism.phase+=b.realism.phaseSpeed*(.8+instability*.9);

        const sideDrift=(b.realism.floorBias+Math.sin(b.realism.phase+b.realism.seed)*b.realism.wobble)*driftScale;
        b.vx+=px*sideDrift;
        b.vy+=py*sideDrift;

        if(b.realism.holdFrames>0){
          const burst=b.realism.slipStrength*instability*lowSpeedBoost*b.realism.holdDir;
          b.vx+=px*burst;
          b.vy+=py*burst;
          b.realism.holdFrames--;
        }else{
          const triggerChance=b.realism.slipChance*instability*lowSpeedBoost;
          if(Math.random()<triggerChance){
            b.realism.holdDir=Math.random()<.5?-1:1;
            b.realism.holdFrames=1+Math.floor(Math.random()*3);
          }
        }

        const forwardAdjust=1+Math.sin(b.realism.phase*.67+b.realism.seed)*b.realism.forward*instability*lowSpeedBoost;
        b.vx*=forwardAdjust;
        b.vy*=forwardAdjust;
      }
      const decelBase=pp.decel*(b.realism?.decelBias??1);
      const decelWave=realisticMode&&b.realism ? (1+Math.sin((b.realism.phase||0)*.53+b.realism.seed)*(b.realism.decelWave||0)) : 1;
      const decel=Math.max(pp.decel*.55,decelBase*decelWave);
      const ns=Math.max(0,s-decel),k=ns/s;b.vx*=k;b.vy*=k;
    }
    if(Math.hypot(b.vx,b.vy)<minSpeed){
      b.vx=0;b.vy=0;
      if(b.kind==='jack'&&b.expertJackTarget){
        const t=botSafeJackTarget(b.expertJackTarget.x,b.expertJackTarget.y);
        b.x=t.x;b.y=t.y;
        b.expertJackTarget=null;
      }
    }
    if(b.hitCd>0)b.hitCd--;
  }

  const objs=allObjects();
  resolveMultiSupportStacking(objs);
  for(let i=0;i<objs.length;i++)for(let j=i+1;j<objs.length;j++){
    const a=objs[i],b=objs[j];
    if(resolve3DBallContact(a,b,false)){
      if(a.hitCd===0&&b.hitCd===0){
        const rel=Math.hypot(b.vx-a.vx,b.vy-a.vy);
        tone(250+Math.min(230,rel*23),.028,.014);
        a.hitCd=b.hitCd=4;
      }
    }
  }
  resolveMultiSupportStacking(objs);

  // Official-style boundary handling: touching or crossing an exterior line = out.
  for(const b of [...allObjects()]){
    const out=b.x-b.r<=c.x||b.x+b.r>=c.x+c.w||b.y-b.r<=c.y||b.y+b.r>=c.y+c.h;
    if(!out)continue;

    b.vx=b.vy=0;
    if(b.kind==='jack'){
      if(lastShot&&lastShot.kind==='jack'){
        lastShot.fouled=true;jack=null;
      }else{
        jack=null;jackNeedsCross=true;
      }
    }else{
      const idx=balls.indexOf(b);if(idx>=0)balls.splice(idx,1);
      showToast('Мяч вне площадки');
    }
  }

  if(phase==='moving'){
    onlineMaybeLiveSync();
    if(!moving())settleFrames++;else settleFrames=0;
    if(settleFrames>13){
      settleFrames=0;

      // A propelled ball that never enters the playing area is dead / a fouled jack.
      if(lastShot&&lastShot.ball&&!lastShot.ball.entered){
        if(lastShot.kind==='jack'){
          lastShot.fouled=true;jack=null;
        }else{
          const idx=balls.indexOf(lastShot.ball);if(idx>=0)balls.splice(idx,1);
          showToast('Мяч не вошёл в игровую зону');
        }
      }
      resolveStoppedShot();
    }
  }
}

