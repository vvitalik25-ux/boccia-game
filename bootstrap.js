function loop(){physics();draw();requestAnimationFrame(loop)}

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