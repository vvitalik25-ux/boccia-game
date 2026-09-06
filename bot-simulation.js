function botTravelForSpeed(speed,decel){
  let s=Math.max(0,speed),travel=0;
  for(let i=0;i<520&&s>0;i++){
    travel+=s;
    const ns=Math.max(0,s-decel);
    s=ns<minSpeed?0:ns;
  }
  return travel;
}
function botCalibratedSpeedForDistance(d,physics,maxSpeed=15.5){
  const decel=Math.max(.001,physics.decel);
  let lo=0,hi=Math.min(maxSpeed,Math.max(4.5,Math.sqrt(2*decel*d)*1.30));
  while(botTravelForSpeed(hi,decel)<d&&hi<maxSpeed)hi=Math.min(maxSpeed,hi*1.12+.08);

  // Return the upper edge of the binary-search bracket, so numerical
  // calibration itself can never finish short of the requested distance.
  for(let i=0;i<30;i++){
    const mid=(lo+hi)/2;
    if(botTravelForSpeed(mid,decel)<d)lo=mid;
    else hi=mid;
  }
  return hi;
}
function botSpeedForDistance(d,hardnessId='medium'){
  return botCalibratedSpeedForDistance(d,ballType(hardnessId),15.5);
}
function cloneStateForBot(){
  return{
    jack:jack?{...jack,_simId:'jack'}:null,
    balls:balls.map((b,i)=>({...b,_simId:`b${i}`}))
  };
}
function simDist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0))}
function simInside(b){
  const c=court();
  return b.x-b.r>c.x&&b.x+b.r<c.x+c.w&&b.y-b.r>c.y&&b.y+b.r<c.y+c.h;
}
function climbFactor(b){
  const p=physicsFor(b);
  // Softer balls deform more and climb/settle into piles a little easier.
  return Math.max(.72,Math.min(1.28,1.18-(p.restitution-.19)*.75));
}
function ballScreenRadius(b){
  return b.r*(1+Math.min(.10,(b.z||0)/(b.r*8)));
}
function applyGravityAndFloor(b){
  if((b.z||0)>0||(b.vz||0)!==0){
    b.vz=(b.vz||0)-.070;
    b.z=(b.z||0)+b.vz;
    if(b.z<0){
      b.z=0;
      if(Math.abs(b.vz)<.15)b.vz=0;
      else b.vz*=-.14;
    }
  }
}

function softCompressionFactor(b){
  const id=b.hardnessId||(b.kind==='jack'?'soft':'medium');
  const map={
    superHard:.992,
    hard:.982,
    medium:.968,
    mediumSoft:.950,
    soft:.932,
    superSoft:.914
  };
  return map[id]??.968;
}
function supportLiftFor(top,support){
  const sumR=top.r+support.r;
  const compression=(softCompressionFactor(top)+softCompressionFactor(support))/2;
  const effective=sumR*compression;
  const dx=top.x-support.x,dy=top.y-support.y;
  const h=Math.hypot(dx,dy);
  if(h>=effective)return null;
  return (support.z||0)+Math.sqrt(Math.max(0,effective*effective-h*h));
}
function resolveMultiSupportStacking(objs){
  // Detect a ball squeezed between 2+ neighbouring balls BEFORE 2D separation.
  // That is the important case for "ball on top of two balls".
  for(const top of objs){
    const speed=Math.hypot(top.vx||0,top.vy||0);
    const candidates=[];

    for(const s of objs){
      if(s===top)continue;
      // A support needs to be on or below the candidate ball.
      if((s.z||0)>(top.z||0)+top.r*.55)continue;

      const dx=s.x-top.x,dy=s.y-top.y;
      const h=Math.hypot(dx,dy);
      const range=(top.r+s.r)*1.03;
      if(h<range){
        const lift=supportLiftFor(top,s);
        if(lift!==null)candidates.push({s,dx,dy,h,lift});
      }
    }

    if(candidates.length<2)continue;

    let bestPair=null,bestQuality=-Infinity;
    for(let i=0;i<candidates.length;i++){
      for(let j=i+1;j<candidates.length;j++){
        const a=candidates[i],b=candidates[j];
        const la=Math.max(.001,a.h),lb=Math.max(.001,b.h);
        const dot=(a.dx*b.dx+a.dy*b.dy)/(la*lb);
        // dot=-1 means supports are opposite each other around the incoming ball.
        // Wider "V" = more plausible bridge / stack support.
        const spread=(1-dot)/2;
        if(spread<.34)continue;

        const supportGap=Math.hypot(a.s.x-b.s.x,a.s.y-b.s.y);
        const maxGap=(a.s.r+b.s.r)*1.32;
        if(supportGap>maxGap)continue;

        const target=Math.max(a.lift,b.lift);
        const quality=spread*2.2 - Math.abs(a.lift-b.lift)/(top.r*2) - supportGap/(maxGap*8);
        if(quality>bestQuality){
          bestQuality=quality;
          bestPair={a,b,target,spread};
        }
      }
    }
    if(!bestPair)continue;

    const cf=climbFactor(top);
    const relativeLift=Math.max(0,bestPair.target-(top.z||0));

    // For a moving ball entering a wedge, kinetic energy is converted into climb.
    if(speed>.55){
      const climbThreshold=.62/cf;
      if(speed>climbThreshold){
        const energy=Math.min(1.8,speed/5.2);
        const desired=Math.min(
          bestPair.target,
          (top.z||0)+relativeLift*(.48+.38*Math.min(1,energy))
        );
        top.z=Math.max(top.z||0,desired);

        // Full-power throws can crest the two-ball bridge and hop over it.
        if(speed>4.0){
          top.vz=Math.max(top.vz||0,Math.min(1.70,(speed-2.0)*.17*cf));
          const keep=0.88+Math.min(.08,speed*.008);
          top.vx*=keep;
          top.vy*=keep;
        }else{
          // Moderate shot tends to settle on the supports.
          top.vz=Math.max(top.vz||0,.12*cf);
          top.vx*=.78;
          top.vy*=.78;
        }
      }
    }

    // If it is already above the two supports and slow, let it rest as a bridge
    // instead of gravity immediately dropping it between them.
    if((top.z||0)>top.r*.28 && speed<1.25){
      const stableTarget=bestPair.target*.965;
      if(top.z<stableTarget){
        top.z+=(stableTarget-top.z)*.42;
      }else if(top.z>stableTarget+top.r*.18){
        top.z+=(stableTarget-top.z)*.12;
      }
      if(Math.abs(top.vz||0)<.24)top.vz=0;
      top.vx*=.90;
      top.vy*=.90;
    }
  }
}

function resolve3DBallContact(a,b,sim=false){
  const pa=physicsFor(a),pb=physicsFor(b);
  let dx=b.x-a.x,dy=b.y-a.y;
  const dz=(b.z||0)-(a.z||0);
  const horiz=Math.hypot(dx,dy);
  const d3=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const min=a.r+b.r;
  if(d3<=0||d3>=min)return false;

  const nx=dx/(horiz||1),ny=dy/(horiz||1);
  const ma=pa.mass,mb=pb.mass,total=ma+mb;
  const overlap=min-d3;

  // If centres are already vertically offset, keep part of the overlap as height.
  const verticalShare=Math.min(.92,Math.abs(dz)/(min*.74));
  const elevated=Math.min(1,Math.max(a.z||0,b.z||0)/(min*.72));
  const horizontalPush=overlap*(1-verticalShare*.78)*(1-elevated*.58);
  a.x-=nx*horizontalPush*(mb/total);a.y-=ny*horizontalPush*(mb/total);
  b.x+=nx*horizontalPush*(ma/total);b.y+=ny*horizontalPush*(ma/total);

  const rvx=b.vx-a.vx,rvy=b.vy-a.vy;
  const along=rvx*nx+rvy*ny;

  if(along<0){
    const rel=Math.abs(along);
    const e=(pa.restitution+pb.restitution)/2;

    // Enough closing speed + tight horizontal overlap can lift the incoming ball.
    // This gives real top-down "climbing" / piling instead of forcing all balls apart.
    const compact=horiz<min*.94;
    const climbThreshold=.55+((pa.restitution+pb.restitution)/2)*.45;
    if(compact&&rel>climbThreshold){
      const aSpeed=Math.hypot(a.vx,a.vy),bSpeed=Math.hypot(b.vx,b.vy);
      const mover=aSpeed>=bSpeed?a:b;
      const support=mover===a?b:a;
      const cf=climbFactor(mover);
      const contactLift=supportLiftFor(mover,support);
      const maxStableZ=(mover.r+support.r)*.92;

      if(contactLift!==null){
        const gain=Math.min(1,rel/4.5);
        mover.z=Math.max(
          mover.z||0,
          Math.min(maxStableZ,(mover.z||0)+(contactLift-(mover.z||0))*(.30+.42*gain))
        );
      }

      // High relative speed = actual hop/roll-over, not just a tiny visual lift.
      if(rel>3.2){
        mover.vz=Math.max(mover.vz||0,Math.min(1.55,(rel-1.7)*.16*cf));
      }else{
        mover.vz=Math.max(mover.vz||0,Math.min(.58,rel*.10*cf));
      }
    }

    const imp=-(1+e)*along/(1/ma+1/mb);
    a.vx-=imp*nx/ma;a.vy-=imp*ny/ma;
    b.vx+=imp*nx/mb;b.vy+=imp*ny/mb;
    const damp=Math.sqrt(pa.damping*pb.damping);
    a.vx*=damp;a.vy*=damp;b.vx*=damp;b.vy*=damp;
  }

  // Stable partial stacking: if a raised ball has another ball under it,
  // don't let gravity instantly flatten the pile.
  const top=(a.z||0)>=(b.z||0)?a:b;
  const bottom=top===a?b:a;
  const h=Math.hypot(top.x-bottom.x,top.y-bottom.y);
  if(h<min*.78&&(top.z||0)>0){
    const allowedZ=Math.sqrt(Math.max(0,min*min-h*h));
    const target=(bottom.z||0)+allowedZ*.72;
    if(top.z<target){
      top.z=Math.min(target,top.z+overlap*.32);
      top.vz=Math.max(0,top.vz||0);
    }
  }
  return true;
}
function simulateBotCandidate(candidate,side,steps=260){
  const st=cloneStateForBot(),pos=launcherFor(side);
  const b={kind:side,side,x:pos.x,y:pos.y,z:0,vx:candidate.vx,vy:candidate.vy,vz:0,r:ballR(),hitCd:0,entered:false,hardnessId:candidate.hardnessId||'medium',_simId:'new'};
  st.balls.push(b);

  for(let step=0;step<steps;step++){
    const objs=st.jack?[st.jack,...st.balls]:[...st.balls];
    let any=false;

    for(const o of objs){
      o.x+=o.vx;o.y+=o.vy;
      applyGravityAndFloor(o);
      if(o.y-o.r<throwingY())o.entered=true;
      const s=Math.hypot(o.vx,o.vy);
      if(s>0){
        const pp=physicsFor(o);
        const ns=Math.max(0,s-pp.decel),k=ns/s;
        o.vx*=k;o.vy*=k;
      }
      if(Math.hypot(o.vx,o.vy)<minSpeed){o.vx=0;o.vy=0}
      if(Math.hypot(o.vx,o.vy)>.06||Math.abs(o.vz||0)>.05)any=true;
    }

    resolveMultiSupportStacking(objs);
    for(let i=0;i<objs.length;i++)for(let j=i+1;j<objs.length;j++){
      resolve3DBallContact(objs[i],objs[j],true);
    }
    resolveMultiSupportStacking(objs);

    for(const o of [...st.balls]){
      if(!simInside(o)){
        const idx=st.balls.indexOf(o);
        if(idx>=0)st.balls.splice(idx,1);
      }
    }
    if(st.jack&&!simInside(st.jack)){
      const p=crossPoint();
      st.jack.x=p.x;st.jack.y=p.y;st.jack.vx=0;st.jack.vy=0;
    }
    if(!any&&step>8)break;
  }
  return st;
}
