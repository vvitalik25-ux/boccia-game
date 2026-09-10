// Physics is tuned for 60 steps/second, independently of display refresh rate.
let simulationLastTime=null,simulationRemainder=0;
function loop(now=performance.now()){
  if(simulationLastTime===null)simulationLastTime=now;
  const elapsed=Math.max(0,now-simulationLastTime);simulationLastTime=now;
  if(document.hidden||elapsed>250){simulationRemainder=0;}
  else{
    simulationRemainder+=elapsed;
    const step=1000/60;
    while(simulationRemainder+1e-7>=step){physics();simulationRemainder-=step;}
  }
  draw();requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange',()=>{simulationLastTime=null;simulationRemainder=0;});

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