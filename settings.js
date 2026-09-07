// Local input preferences; online simulation and room configuration remain authoritative.
const settingsDialog=document.getElementById('settingsDialog');
const settingsButton=document.getElementById('settingsBtn');
const joystickControl=document.getElementById('joystickControl');
const joystickKnob=document.getElementById('joystickKnob');
const aimValue=document.getElementById('aimValue');
let controlMode='joystick',aimFrame=0,aimLastTime=0,joystickPointer=null;
let joystickVector={x:0,y:0};
const heldAimKeys=new Set(),heldAimPointers=new Map();
try{
  const saved=JSON.parse(localStorage.getItem('boccia-settings')||'{}');
  if(['joystick','buttons','keyboard'].includes(saved.controlMode))controlMode=saved.controlMode;
  if(['vertical','horizontal'].includes(saved.fieldOrientation))fieldOrientation=saved.fieldOrientation;
  if(BOT_LEVELS[saved.botDifficulty])botDifficulty=saved.botDifficulty;
}catch{}
function saveSettings(){
  try{localStorage.setItem('boccia-settings',JSON.stringify({controlMode,fieldOrientation,botDifficulty}));}catch{}
}
function canAdjustAim(){
  return humanTurn()&&!settingsDialog.open&&!setupOverlay.classList.contains('show')&&!modal.classList.contains('show')&&!document.hidden;
}
function stopAimInput(){
  pressedAimCodes.clear();heldAimKeys.clear();heldAimPointers.clear();joystickPointer=null;joystickVector={x:0,y:0};
  joystickKnob.style.transform='translate(0px,0px)';
  cancelAnimationFrame(aimFrame);aimFrame=0;aimLastTime=0;
}
function renderAimControls(){
  document.getElementById('joystickControl').hidden=controlMode!=='joystick';
  document.getElementById('buttonControl').hidden=controlMode!=='buttons';
  document.getElementById('keyboardControl').hidden=controlMode!=='keyboard';
  aimValue.textContent=`${Math.round(aimAngle)}° · ${Math.round(aimPower*100)}%`;
  document.querySelectorAll('[data-aim]').forEach(b=>b.disabled=!canAdjustAim());
  joystickControl.setAttribute('aria-disabled',String(!canAdjustAim()));
  if(!canAdjustAim())stopAimInput();
}
function aimInputTick(now){
  aimFrame=0;
  if(!canAdjustAim()){stopAimInput();return;}
  const dt=Math.min(.05,(now-aimLastTime)/1000);aimLastTime=now;
  const directions=new Set([...heldAimKeys,...heldAimPointers.values()]);
  const x=joystickVector.x+Number(directions.has('right'))-Number(directions.has('left'));
  const y=joystickVector.y+Number(directions.has('up'))-Number(directions.has('down'));
  aimAngle=Math.max(-58,Math.min(58,aimAngle+x*30*dt));
  aimPower=Math.max(.08,Math.min(1,aimPower+y*.3*dt));
  updateUI();
  if(heldAimKeys.size||heldAimPointers.size||joystickPointer!==null)aimFrame=requestAnimationFrame(aimInputTick);
}
function startAimInput(){if(!aimFrame){aimLastTime=performance.now();aimFrame=requestAnimationFrame(aimInputTick);}}
function updateJoystick(e){
  const r=joystickControl.getBoundingClientRect();
  let x=(e.clientX-r.left-r.width/2)/24,y=(r.top+r.height/2-e.clientY)/24;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  joystickVector={x:Math.abs(x)<.12?0:x,y:Math.abs(y)<.12?0:y};
  joystickKnob.style.transform=`translate(${x*20}px,${-y*20}px)`;
}
joystickControl.addEventListener('pointerdown',e=>{
  if(controlMode!=='joystick'||!canAdjustAim()||joystickPointer!==null||e.button!==0)return;
  e.preventDefault();joystickPointer=e.pointerId;joystickControl.setPointerCapture(e.pointerId);updateJoystick(e);startAimInput();
});
joystickControl.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)updateJoystick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystickControl.addEventListener(event,e=>{if(e.pointerId===joystickPointer)stopAimInput();});
document.querySelectorAll('[data-aim]').forEach(button=>{
  let pointerHandled=false;
  button.addEventListener('pointerdown',e=>{
    if(controlMode!=='buttons'||!canAdjustAim()||e.button!==0)return;
    pointerHandled=true;e.preventDefault();button.setPointerCapture(e.pointerId);heldAimPointers.set(e.pointerId,button.dataset.aim);
    const d=button.dataset.aim;
    aimAngle=Math.max(-58,Math.min(58,aimAngle+(d==='right'?1:d==='left'?-1:0)));
    aimPower=Math.max(.08,Math.min(1,aimPower+(d==='up'?.01:d==='down'?-.01:0)));
    updateUI();startAimInput();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>heldAimPointers.delete(e.pointerId));
  button.addEventListener('click',e=>{
    if(pointerHandled){pointerHandled=false;return;}
    if(controlMode!=='buttons'||!canAdjustAim())return;
    const d=button.dataset.aim;
    aimAngle=Math.max(-58,Math.min(58,aimAngle+(d==='right'?1:d==='left'?-1:0)));
    aimPower=Math.max(.08,Math.min(1,aimPower+(d==='up'?.01:d==='down'?-.01:0)));updateUI();
  });
});
const aimKeyDirections={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down'};
const pressedAimCodes=new Set();
window.addEventListener('keydown',e=>{
  const direction=aimKeyDirections[e.code];
  if(!direction||controlMode!=='keyboard'||!canAdjustAim()||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]'))return;
  e.preventDefault();
  if(!pressedAimCodes.has(e.code)){
    aimAngle=Math.max(-58,Math.min(58,aimAngle+(direction==='right'?1:direction==='left'?-1:0)));
    aimPower=Math.max(.08,Math.min(1,aimPower+(direction==='up'?.01:direction==='down'?-.01:0)));
    updateUI();
  }
  pressedAimCodes.add(e.code);heldAimKeys.add(direction);startAimInput();
});
window.addEventListener('keyup',e=>{
  pressedAimCodes.delete(e.code);heldAimKeys.clear();
  for(const code of pressedAimCodes)heldAimKeys.add(aimKeyDirections[code]);
});
function resetControls(){pressedAimCodes.clear();stopAimInput();}
window.addEventListener('blur',resetControls);
document.addEventListener('visibilitychange',resetControls);
settingsButton.addEventListener('click',()=>{
  resetControls();
  const locked=gameMode==='online'&&!!onlineRoomCode;
  fieldVerticalBtn.disabled=locked;fieldHorizontalBtn.disabled=locked;
  document.getElementById('orientationLock').hidden=!locked;
  document.querySelectorAll('[data-control-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.controlMode===controlMode)));
  settingsDialog.showModal();renderAimControls();
});
document.getElementById('settingsCloseBtn').addEventListener('click',()=>settingsDialog.close());
settingsDialog.addEventListener('close',()=>{resetControls();saveSettings();renderAimControls();settingsButton.focus();});
document.querySelectorAll('[data-control-mode]').forEach(button=>button.addEventListener('click',()=>{
  resetControls();controlMode=button.dataset.controlMode;saveSettings();
  document.querySelectorAll('[data-control-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  renderAimControls();
}));
for(const button of [fieldVerticalBtn,fieldHorizontalBtn,aiEasyBtn,aiMediumBtn,aiHardBtn,aiExpertBtn])button.addEventListener('click',saveSettings);
