function draw(){
  clearCanvasForDraw();const c=court(),bw=c.w/6,boxTop=my(10),boxBottom=my(12.5);
  const redBoxes=sideBoxes('red'),blueBoxes=sideBoxes('blue');
  const active=currentSide();
  const activeBox=active&&phase!=='moving'?(phase==='jackRed'||phase==='jackBlue'?currentJackBox:activePlayerBox[active]):null;

  const g=ctx.createLinearGradient(0,c.y,0,c.y+c.h);g.addColorStop(0,'#bb9168');g.addColorStop(1,'#906a4b');
  ctx.fillStyle=g;ctx.fillRect(c.x,c.y,c.w,c.h);

  if(gameMode==='training'){
    ctx.save();ctx.beginPath();ctx.rect(c.x,c.y,c.w,c.h);ctx.clip();
    ctx.globalAlpha=.065;ctx.strokeStyle='#fff';ctx.lineWidth=1;
    for(let y=c.y+18;y<c.y+c.h;y+=32){
      ctx.beginPath();ctx.moveTo(c.x,y);ctx.bezierCurveTo(c.x+c.w*.3,y-3,c.x+c.w*.7,y+4,c.x+c.w,y);ctx.stroke();
    }
    ctx.restore();
  }

  // Active throwing boxes for the selected division.
  for(const box of redBoxes){
    ctx.fillStyle=box===activeBox&&active==='red'?'rgba(239,77,91,.22)':'rgba(239,77,91,.10)';
    ctx.fillRect(c.x+bw*(box-1),boxTop,bw,boxBottom-boxTop);
  }
  for(const box of blueBoxes){
    ctx.fillStyle=box===activeBox&&active==='blue'?'rgba(79,137,255,.22)':'rgba(79,137,255,.10)';
    ctx.fillRect(c.x+bw*(box-1),boxTop,bw,boxBottom-boxTop);
  }

  const wide=Math.max(2.2,c.w*(.04/6));   // visual equivalent of wide tape
  const narrow=Math.max(1.1,c.w*(.022/6));

  // Exterior boundary.
  ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=wide;ctx.strokeRect(c.x,c.y,c.w,c.h);

  // Throwing line: 10m from the front, leaving 2.5m throwing boxes.
  ctx.lineWidth=wide;ctx.beginPath();ctx.moveTo(c.x,boxTop);ctx.lineTo(c.x+c.w,boxTop);ctx.stroke();

  // Six 1m x 2.5m throwing boxes.
  ctx.lineWidth=narrow;
  for(let i=1;i<6;i++){
    const x=c.x+bw*i;ctx.beginPath();ctx.moveTo(x,boxTop);ctx.lineTo(x,boxBottom);ctx.stroke();
  }

  // V-line: side points 3m in front of throwing line; central vertex 1.5m in front.
  const sideVY=my(7),vertexY=my(8.5);
  ctx.lineWidth=wide;ctx.beginPath();
  ctx.moveTo(c.x,sideVY);ctx.lineTo(c.x+c.w/2,vertexY);ctx.lineTo(c.x+c.w,sideVY);ctx.stroke();

  // Target box and cross use ONE metric scale, so the 35 cm square stays square on-screen.
  const cp=crossPoint(),pxPerM=c.w/6;
  const targetSize=pxPerM*.35;
  ctx.lineWidth=narrow;
  ctx.strokeRect(cp.x-targetSize/2,cp.y-targetSize/2,targetSize,targetSize);

  // Full cross is 35 cm × 35 cm here: each leg is 17.5 cm from the centre.
  const crossArm=pxPerM*.175;
  ctx.beginPath();
  ctx.moveTo(cp.x-crossArm,cp.y);ctx.lineTo(cp.x+crossArm,cp.y);
  ctx.moveTo(cp.x,cp.y-crossArm);ctx.lineTo(cp.x,cp.y+crossArm);ctx.stroke();

  // Box numbers and athletes.
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${Math.max(8,c.w*.032)}px system-ui`;
  for(let i=1;i<=6;i++){
    const x=c.x+bw*(i-.5),y=my(12.05);
    ctx.fillStyle=redBoxes.includes(i)?'rgba(255,235,238,.95)':blueBoxes.includes(i)?'rgba(232,240,255,.95)':'rgba(255,255,255,.55)';
    fillWorldText(String(i),x,y);
  }
  ctx.font=`900 ${Math.max(7,c.w*.024)}px system-ui`;
  for(const box of redBoxes){
    const n=redBoxes.indexOf(box)+1;
    ctx.fillStyle='#ffd6da';fillWorldText(redBoxes.length===1?shortOwner('red'):`R${n}`,c.x+bw*(box-.5),my(10.3));
  }
  for(const box of blueBoxes){
    const n=blueBoxes.indexOf(box)+1;
    ctx.fillStyle='#d8e6ff';fillWorldText(blueBoxes.length===1?shortOwner('blue'):`B${n}`,c.x+bw*(box-.5),my(10.3));
  }

  for(const side of ['red','blue']){
    for(const box of sideBoxes(side)){
      const selected=side===active&&box===activeBox;
      const pos=selected?launcherFor(side):(isBotSide(side)?boxCenter(box):launcherPointForBox(box));
      drawPlayerIcon(side,pos,!selected||!humanTurn(),box);
    }
  }

  if(jack){
    const glow=ctx.createRadialGradient(jack.x,jack.y,0,jack.x,jack.y,34);
    glow.addColorStop(0,'rgba(255,255,255,.12)');glow.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(jack.x,jack.y,34,0,Math.PI*2);ctx.fill();
  }

  const drawObjects=(jack?[jack,...balls]:[...balls]).slice().sort((a,b)=>(a.y-(a.z||0))-(b.y-(b.z||0)));
  drawObjects.forEach(drawBall);

  if(phase==='trainingEdit'&&trainingDrag?.obj){
    const o=trainingDrag.obj,sy=o.y-(o.z||0)*.62;
    ctx.save();
    ctx.strokeStyle='rgba(223,255,104,.95)';
    ctx.lineWidth=2;
    ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.arc(o.x,sy,o.r+5,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }

  if(active){
    if(humanTurn())drawAim(active);
  }
}
function worldToScreen(x,y){
  if(fieldOrientation==='horizontal')return{x:H-y,y:x};
  return{x,y};
}
function fillWorldText(textValue,x,y){
  if(fieldOrientation!=='horizontal'){
    ctx.fillText(textValue,x,y);
    return;
  }
  const p=worldToScreen(x,y);
  ctx.save();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillText(textValue,p.x,p.y);
  ctx.restore();
}

function drawBall(b){
  const screenY=b.y-(b.z||0)*.62;
  const rr=ballScreenRadius(b);
  const cols=b.kind==='red'?['#ff727b','#b91931']:b.kind==='blue'?['#78a8ff','#2451b9']:['#fffef9','#c9c6bc'];

  // Ground shadow stays on the floor, so raised / stacked balls are obvious.
  ctx.save();
  const lift=Math.min(1,(b.z||0)/(b.r*1.5));
  ctx.globalAlpha=.17+.16*(1-lift);
  ctx.fillStyle='#000';
  ctx.beginPath();
  ctx.ellipse(b.x,b.y+2,rr*(.82-.18*lift),rr*(.42-.12*lift),0,0,Math.PI*2);
  ctx.fill();
  ctx.restore();

  const g=ctx.createRadialGradient(b.x-rr*.35,screenY-rr*.42,rr*.08,b.x,screenY,rr*1.05);
  g.addColorStop(0,cols[0]);g.addColorStop(1,cols[1]);

  ctx.save();
  ctx.shadowColor='rgba(0,0,0,.26)';
  ctx.shadowBlur=5+(b.z||0)*.12;
  ctx.shadowOffsetY=3;
  ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(b.x,screenY,rr,0,Math.PI*2);ctx.fill();
  ctx.shadowColor='transparent';

  ctx.strokeStyle='rgba(0,0,0,.18)';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(b.x,screenY,rr*.62,0,Math.PI*2);ctx.stroke();

  if(b.kind!=='jack'&&b.hardnessId){
    const t=ballType(b.hardnessId);
    ctx.fillStyle='rgba(255,255,255,.76)';
    ctx.font=`900 ${Math.max(5,rr*.56)}px system-ui`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    fillWorldText(t.short,b.x,screenY+.3);
  }
  ctx.restore();
}
function drawAim(side){
  if(realisticMode)return;
  const pos=playerPreviewBallPosition(side,false),a=aimAngle*Math.PI/180,nx=Math.sin(a),ny=-Math.cos(a),len=46+aimPower*90;
  ctx.save();ctx.setLineDash([6,6]);ctx.strokeStyle='rgba(255,255,255,.84)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(pos.x,pos.y);ctx.lineTo(pos.x+nx*len,pos.y+ny*len);ctx.stroke();ctx.setLineDash([]);
  const ex=pos.x+nx*len,ey=pos.y+ny*len;ctx.fillStyle='rgba(255,255,255,.92)';ctx.beginPath();
  ctx.moveTo(ex,ey);ctx.lineTo(ex-nx*12-ny*6,ey-ny*12+nx*6);ctx.lineTo(ex-nx*12+ny*6,ey-ny*12-nx*6);ctx.closePath();ctx.fill();ctx.restore();
}

// Top-down chair scaled against the one-metre throwing box.
function drawPlayerIcon(side,pos,dim,box){
  const pose=playerIconPose(pos,dim,box);
  ctx.save();ctx.globalAlpha=dim?.70:1;ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(pose.scale,pose.scale);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=.08;
  ctx.fillStyle='#263342';ctx.strokeStyle='#dae3e9';
  // Wheels, seat and backrest.
  ctx.fillRect(-.62,-.55,.16,1.15);ctx.strokeRect(-.62,-.55,.16,1.15);
  ctx.fillRect(.46,-.55,.16,1.15);ctx.strokeRect(.46,-.55,.16,1.15);
  ctx.fillStyle=side==='red'?'#ec5265':'#568ff4';ctx.fillRect(-.38,-.28,.76,.68);
  ctx.strokeStyle='#172333';ctx.beginPath();ctx.moveTo(-.39,.46);ctx.lineTo(.39,.46);ctx.stroke();
  // Footrest and small front casters complete the chair silhouette.
  ctx.fillStyle='#354454';ctx.fillRect(-.27,-.92,.54,.35);
  ctx.fillStyle='#172333';ctx.fillRect(-.42,-1.0,.12,.28);ctx.fillRect(.30,-1.0,.12,.28);
  // Shoulders and hands identify the forward direction without an aim line.
  ctx.strokeStyle='#efc7a1';ctx.lineWidth=.13;
  ctx.beginPath();ctx.moveTo(-.27,-.17);ctx.lineTo(-.37,-.52);ctx.moveTo(.27,-.17);ctx.lineTo(.37,-.52);ctx.stroke();
  if(playerAppearance==='ramp'){
    ctx.fillStyle='#e1bc76';ctx.strokeStyle='#503d23';ctx.lineWidth=.07;
    ctx.beginPath();ctx.moveTo(-.22,-.72);ctx.lineTo(-.20,-1.52);ctx.lineTo(.20,-1.52);ctx.lineTo(.22,-.72);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#fff0bd';ctx.lineWidth=.05;ctx.beginPath();ctx.moveTo(-.14,-.76);ctx.lineTo(-.12,-1.48);ctx.moveTo(.14,-.76);ctx.lineTo(.12,-1.48);ctx.stroke();
  }
  ctx.fillStyle='#efc7a1';ctx.strokeStyle='#493b34';ctx.lineWidth=.035;
  ctx.beginPath();ctx.arc(0,-.24,.22,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.restore();
}

function playerIconPose(pos,dim,box){
  const c=court(),bw=c.w/6,left=c.x+bw*(box-1),angle=dim?0:aimAngle*Math.PI/180;
  // Side bounds constrain the chair only; the front line also constrains the ramp.
  const co=Math.cos(angle),si=Math.sin(angle);
  const corners=[[-.66,-.59],[.66,-.59],[-.66,.64],[.66,.64],[-.46,-1.04],[.46,-1.04]];
  const xs=corners.map(([x,y])=>x*co-y*si),ys=corners.map(([x,y])=>x*si+y*co);
  const scale=bw*.48;
  const minX=Math.min(...xs)*scale,maxX=Math.max(...xs)*scale;
  const rampYs=playerAppearance==='ramp'
    ?[[-.255,-.755],[.255,-.755],[-.235,-1.555],[.235,-1.555]].map(([x,y])=>x*si+y*co):[];
  const minY=Math.min(...ys,...rampYs)*scale,maxY=Math.max(...ys)*scale;
  return{x:Math.max(left-minX,Math.min(left+bw-maxX,pos.x)),
    y:Math.max(my(10)-minY,Math.min(my(12.5)-maxY,pos.y+bw*.35)),scale,angle};
}
function playerPreviewBallPosition(side,dim=false){
  const box=(phase==='jackRed'||phase==='jackBlue')?currentJackBox:activePlayerBox[side];
  const pose=playerIconPose(launcherFor(side),dim,box);
  const reach=pose.scale*(playerAppearance==='ramp'?1.52:.85);
  return{x:pose.x+Math.sin(pose.angle)*reach,y:pose.y-Math.cos(pose.angle)*reach};
}
