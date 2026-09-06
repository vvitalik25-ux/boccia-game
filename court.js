function court(){
  const ratio=12.5/6,pad=7,aw=W-pad*2,ah=H-pad*2;
  let cw=aw,ch=cw*ratio;
  if(ch>ah){ch=ah;cw=ch/ratio}
  return{x:(W-cw)/2,y:(H-ch)/2,w:cw,h:ch};
}
function mx(m){const c=court();return c.x+c.w*(m/6)}
function my(m){const c=court();return c.y+c.h*(m/12.5)}
function ballR(){
  if(gameMode==='online'&&onlinePhysicsProfile)return court().w*onlinePhysicsProfile.r/onlinePhysicsProfile.w;
  return Math.max(7.8,Math.min(12.5,court().w*.032));
}
function throwingY(){return my(10)}
function boxCenter(boxNo){
  const c=court(),bw=c.w/6;
  return{x:c.x+bw*(boxNo-.5),y:my(11.35)};
}
function resetLauncherPositions(){
  launcherPositions={1:{u:.5,v:.54},2:{u:.5,v:.54},3:{u:.5,v:.54},4:{u:.5,v:.54},5:{u:.5,v:.54},6:{u:.5,v:.54}};
}
function launcherPointForBox(boxNo){
  const c=court(),bw=c.w/6;
  const p=launcherPositions[boxNo]||{u:.5,v:.54};
  const top=throwingY(),bottom=my(12.5);
  return{
    x:c.x+bw*(boxNo-1)+bw*p.u,
    y:top+(bottom-top)*p.v
  };
}
function activeThrowingBox(){
  const side=currentSide();
  if(!side)return null;
  if(phase==='jackRed'||phase==='jackBlue')return currentJackBox;
  if(phase==='red'||phase==='blue')return ensureActivePlayer(side);
  return null;
}
function pointInsideThrowingBox(p,boxNo){
  const c=court(),bw=c.w/6,top=throwingY(),bottom=my(12.5),r=Math.max(4,ballR()-1);
  const left=c.x+bw*(boxNo-1),right=left+bw;
  return p.x>=left+r&&p.x<=right-r&&p.y>=top+r&&p.y<=bottom-r;
}
function moveLauncherToPoint(p){
  if(!humanTurn()||phase==='moving'||phase==='trainingEdit')return false;
  const box=activeThrowingBox();
  if(!box||!pointInsideThrowingBox(p,box))return false;

  const c=court(),bw=c.w/6,top=throwingY(),bottom=my(12.5);
  const left=c.x+bw*(box-1);
  const u=Math.max(0,Math.min(1,(p.x-left)/bw));
  const v=Math.max(0,Math.min(1,(p.y-top)/(bottom-top)));
  if(gameMode==='online'){
    return onlineQueueAction('set_launcher',{box,u,v});
  }
  launcherPositions[box]={u,v};
  showToast(`Позиция бокса ${box} обновлена`);
  return true;
}
function crossPoint(){return{x:mx(3),y:my(5)}}
function vYAtX(x){
  const c=court(),leftY=my(7),vertexY=my(8.5),mid=c.x+c.w/2;
  if(x<=mid){
    const t=Math.max(0,Math.min(1,(x-c.x)/(c.w/2)));
    return leftY+(vertexY-leftY)*t;
  }else{
    const t=Math.max(0,Math.min(1,(x-mid)/(c.w/2)));
    return vertexY+(leftY-vertexY)*t;
  }
}
function applyCanvasTransform(){
  if(fieldOrientation==='horizontal'){
    // Same UI layout, only the field itself is rotated counter-clockwise.
    ctx.setTransform(0,DPR,-DPR,0,H*DPR,0);
  }else{
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
}
function clearCanvasForDraw(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  applyCanvasTransform();
}
function rescaleBallGeometry(o,oldC,newC){
  if(!o)return;
  const sx=newC.w/oldC.w,sy=newC.h/oldC.h;
  const scale=(sx+sy)/2;
  o.x=newC.x+(o.x-oldC.x)*sx;
  o.y=newC.y+(o.y-oldC.y)*sy;
  o.z=(o.z||0)*scale;
  o.vx=(o.vx||0)*scale;
  o.vy=(o.vy||0)*scale;
  o.vz=(o.vz||0)*scale;
  o.r=gameMode==='online'&&onlinePhysicsProfile
    ?newC.w*onlinePhysicsProfile.r/onlinePhysicsProfile.w
    :Math.max(7.8,Math.min(12.5,newC.w*.032));
  if(o.realism?.startSpeed)o.realism.startSpeed*=scale;
}
function rescaleSnapshotGeometry(s,oldC,newC){
  if(!s)return;
  rescaleBallGeometry(s.jack,oldC,newC);
  (s.balls||[]).forEach(o=>rescaleBallGeometry(o,oldC,newC));
}
function rescaleStoredGeometry(oldC,newC){
  rescaleBallGeometry(jack,oldC,newC);
  balls.forEach(o=>rescaleBallGeometry(o,oldC,newC));
  rescaleSnapshotGeometry(trainingSnapshot,oldC,newC);
  rescaleSnapshotGeometry(puzzleSnapshot,oldC,newC);
  trainingHistory.forEach(s=>rescaleSnapshotGeometry(s,oldC,newC));
  trainingDrag=null;
  trainingPointerDown=null;
}
function resize(){
  let oldC=null;
  if(W>0&&H>0)oldC=court();

  const r=wrap.getBoundingClientRect();
  DPR=Math.min(window.devicePixelRatio||1,2);
  displayW=Math.max(1,Math.floor(r.width));
  displayH=Math.max(1,Math.floor(r.height));

  canvas.width=Math.floor(displayW*DPR);
  canvas.height=Math.floor(displayH*DPR);

  if(fieldOrientation==='horizontal'){
    W=displayH;
    H=displayW;
  }else{
    W=displayW;
    H=displayH;
  }

  if(oldC){
    const newC=court();
    if(Math.abs(newC.w-oldC.w)>.1||Math.abs(newC.h-oldC.h)>.1||
       Math.abs(newC.x-oldC.x)>.1||Math.abs(newC.y-oldC.y)>.1){
      rescaleStoredGeometry(oldC,newC);
    }
  }
  applyCanvasTransform();
}
function relayoutSoon(){requestAnimationFrame(()=>requestAnimationFrame(resize))}
window.addEventListener('resize',resize);
if(window.ResizeObserver)new ResizeObserver(()=>resize()).observe(wrap);

function tone(){/* звук отключён */}
function showToast(t){
  toastEl.textContent=t;toastEl.classList.add('show');
  clearTimeout(showToast.t);showToast.t=setTimeout(()=>toastEl.classList.remove('show'),1250);
}
function finishPreStartPause(){
  if(!preStartPause)return;
  preStartPause=false;
  startNoticeEl.classList.remove('show');
  updateUI();
  if(phase==='jackRed'||phase==='jackBlue')scheduleBotIfNeeded('jack',420);
  else if(phase==='red'||phase==='blue')scheduleBotIfNeeded('colour',420);
}
function showStartNotice(title,text){
  preStartPause=true;
  startNoticeTitleEl.textContent=title;
  startNoticeTextEl.textContent=text;
  startNoticeHintEl.textContent='Нажми, чтобы начать';
  startNoticeEl.classList.add('show');
}
function showTimedNotice(title,text,duration=1750){
  clearTimeout(showTimedNotice.t);
  preStartPause=true;
  startNoticeTitleEl.textContent=title;
  startNoticeTextEl.textContent=text;
  startNoticeHintEl.textContent='Нажми, чтобы продолжить';
  startNoticeEl.classList.add('show');

  showTimedNotice.t=setTimeout(()=>{
    showTimedNotice.t=null;
    if(startNoticeEl.classList.contains('show'))finishPreStartPause();
  },duration);
}

