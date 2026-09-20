// Six minutes per side, shared by all players on that side in pairs/teams.
let timedMode=false,localClock=null,remoteClock=null,remoteClockAt=0,remoteServerNow=0,onlineTimedMode=null,remoteClockRevision=0,remoteClockMatch=null;
try{timedMode=localStorage.getItem('boccia-timed-mode')==='6'}catch{}
const clockPanel=document.getElementById('matchClock');
function clockSide(){return phase==='moving'?lastShot?.side:currentSide();}
function resetLocalClock(){
  localClock=timedMode&&['bot','local'].includes(gameMode)?{remaining:{red:360000,blue:360000},side:null,at:Date.now()}:null;
}
function expireLocalSide(side){
  if(phase==='end'||phase==='finished'||!matchStarted)return;
  clearTimeout(botTimer);
  for(const item of ballInventory[side])item.used=true;
  setBallsLeft(side,0);
  showToast(`${side==='red'?'Красные':'Синие'}: время истекло`);
  if(redLeft<=0&&blueLeft<=0){if(!jack)placeJackOnCross();finishEnd();return;}
  if(currentSide()===side){
    const other=opponent(side);
    if(!jack){
      do{currentJackBox=nextJackBoxAfter(currentJackBox)}while(sideForBox(currentJackBox)!==other);
      activePlayerBox[other]=currentJackBox;phase=sidePhase(other,'jack');
    }else{phase=other;ensureActivePlayer(other);ensureSelectedBall(other);}
  }
  scheduleBotIfNeeded(phase==='jackRed'||phase==='jackBlue'?'jack':'colour',520);
  updateUI();
}
let tickingClock=false;
function tickLocalClock(){
  if(tickingClock||!localClock||gameMode==='online')return;
  tickingClock=true;
  try{
    const c=localClock,now=Date.now();
    if(c.side)c.remaining[c.side]=Math.max(0,c.remaining[c.side]-Math.max(0,now-c.at));
    c.at=now;
    const playing=matchStarted&&!setupOverlay.classList.contains('show')&&!startNoticeEl.classList.contains('show')&&!modal.classList.contains('show');
    c.side=playing?clockSide():null;
    if(playing&&phase!=='moving'&&c.side&&c.remaining[c.side]<=0)expireLocalSide(c.side);
  }finally{tickingClock=false;}
}
function acceptRemoteClock(data){
  if(data?.config)onlineTimedMode=!!data.config.timedMode;
  if(!data)return;
  if(!Object.prototype.hasOwnProperty.call(data,'clock'))return;
  if(data.state?.matchId&&data.state.matchId!==remoteClockMatch){remoteClockMatch=data.state.matchId;remoteClockRevision=0;}
  const revision=Number(data.revision)||0;
  if(revision<remoteClockRevision)return;
  remoteClockRevision=revision;
  remoteClock=data.clock;remoteServerNow=Number(data.serverNow)||Date.now();remoteClockAt=performance.now();
}
function renderMatchClock(){
  tickLocalClock();
  const c=gameMode==='online'?remoteClock:localClock;
  clockPanel.hidden=!c||!matchStarted||setupOverlay.classList.contains('show');
  if(clockPanel.hidden)return;
  const now=gameMode==='online'?remoteServerNow+performance.now()-remoteClockAt:Date.now();
  for(const side of ['red','blue']){
    const value=gameMode==='online'?Math.max(0,c.remaining[side]-(c.side===side?Math.max(0,now-c.activeAt):0)):c.remaining[side];
    const seconds=Math.ceil(value/1000),el=document.getElementById(side+'Clock');
    el.textContent=String(Math.floor(seconds/60))+':'+String(seconds%60).padStart(2,'0');
    el.parentElement.classList.toggle('active',c.side===side);
    el.parentElement.classList.toggle('urgent',seconds<=30);
  }
}
function renderTimeSetting(){
  const locked=matchStarted||!!onlineRoomCode;
  document.querySelectorAll('[data-timed-mode]').forEach(b=>{
    b.disabled=locked;b.setAttribute('aria-pressed',String((b.dataset.timedMode==='6')===timedMode));
  });
  document.getElementById('timeSettingHint').textContent=locked?'Время фиксируется до начала матча или создания комнаты.':'6 минут каждой стороне на энд, включая джек. Оставшиеся мячи снимаются, когда время истекло.';
}
document.querySelectorAll('[data-timed-mode]').forEach(b=>b.addEventListener('click',()=>{
  if(matchStarted||onlineRoomCode)return;
  timedMode=b.dataset.timedMode==='6';
  try{localStorage.setItem('boccia-timed-mode',timedMode?'6':'off')}catch{}
  renderTimeSetting();
}));
document.getElementById('settingsBtn').addEventListener('click',renderTimeSetting);
setInterval(renderMatchClock,100);
