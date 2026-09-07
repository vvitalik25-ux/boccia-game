const PHYSICS_STEP_MS=1000/60;
const MAX_PHYSICS_STEPS_PER_FRAME=6;
let loopLastTime=0;
let loopAccumulator=0;

function loop(now){
  const current=Number.isFinite(now)?now:performance.now();
  if(!loopLastTime)loopLastTime=current;

  const elapsed=Math.max(0,Math.min(100,current-loopLastTime));
  loopLastTime=current;
  loopAccumulator+=elapsed;

  let steps=0;
  while(loopAccumulator>=PHYSICS_STEP_MS&&steps<MAX_PHYSICS_STEPS_PER_FRAME){
    physics();
    loopAccumulator-=PHYSICS_STEP_MS;
    steps++;
  }

  if(steps===MAX_PHYSICS_STEPS_PER_FRAME&&loopAccumulator>=PHYSICS_STEP_MS){
    loopAccumulator=0;
  }

  draw();
  requestAnimationFrame(loop);
}

// Automatic freshness check at boot.
appCheckServerVersion(true);

// Safari/iOS can restore a whole old page from BFCache without networking.
window.addEventListener('pageshow',e=>{
  if(e.persisted)appCheckServerVersion(true);
});

// Also refresh-check an old tab when the player returns to it.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&gameMode==='online'&&onlineRoomCode){
    const latest=onlineDeferredSnapshot||onlineLatestSnapshot;
    onlineResetPlayback();
    if(latest)onlineApplyState(latest.state,latest.revision);
    if(onlineSocketOpen()&&Date.now()-onlineLastResponseAt<12000){
      onlineSend('sync',{knownRevision:onlineRevision});onlineScheduleSync(250);
    }else onlineConnectRoom(onlineRoomCode,true);
  }
  if(document.visibilityState==='visible'&&Date.now()-appLastVersionCheckAt>60000){
    appCheckServerVersion(true);
  }
});

resize();renderFormatButtons();showSetup();loop();
