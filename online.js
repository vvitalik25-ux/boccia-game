function onlineClone(value){
  return value==null?value:JSON.parse(JSON.stringify(value));
}
function onlineNormalizeRoomCode(value){
  const lookalikes={'А':'A','В':'B','С':'C','Е':'E','Н':'H','К':'K','М':'M','О':'O','Р':'P','Т':'T','Х':'X','У':'Y'};
  return String(value||'').toUpperCase().replace(/[АВСЕНКМОРТХУ]/g,c=>lookalikes[c]).replace(/[^A-Z0-9]/g,'').slice(0,8);
}
function onlineSocketOpen(){
  return !!onlineSocket&&onlineSocket.readyState===WebSocket.OPEN;
}
function onlineSend(type,payload={}){
  if(!onlineSocketOpen())return false;
  try{
    onlineSocket.send(JSON.stringify({type,...(type==='restart'?{matchId:onlineMatchId}:{}),...payload}));
    return true;
  }catch{
    return false;
  }
}
async function onlineFetch(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    // Consume the body under the same deadline; response.json() then reads a local copy.
    const body=await response.text();
    return {ok:response.ok,status:response.status,json:async()=>JSON.parse(body)};
  }finally{clearTimeout(timer)}
}
function onlineClearWatchdog(){
  clearTimeout(onlineWatchdogTimer);onlineWatchdogTimer=null;
}
function onlineWatchConnection(ws){
  onlineClearWatchdog();
  onlineWatchdogTimer=setTimeout(()=>{
    if(ws!==onlineSocket)return;
    if(Date.now()-onlineLastResponseAt>=12000){
      onlineConnectionStatus='Связь потеряна · переподключаемся…';
      onlineConnectRoom(onlineRoomCode,true);
      return;
    }
    onlineWatchConnection(ws);
  },2000);
}
function onlineResetPlayback(){
  onlineClearAnimation();onlineClearTransition();onlineClearEventTimers();
  onlineDeferredSnapshot=null;onlineLatestSnapshot=null;
}
function onlineMakeActionId(){
  const p=(onlineClientKey||'c').replace(/[^a-zA-Z0-9]/g,'').slice(-8);
  return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
}
function onlineClearActionRetry(){
  if(onlineActionRetryTimer){
    clearTimeout(onlineActionRetryTimer);
    onlineActionRetryTimer=null;
  }
}
function onlineClearSync(){
  if(onlineSyncTimer){
    clearTimeout(onlineSyncTimer);
    onlineSyncTimer=null;
  }
}
function onlineClearReconnect(){
  if(onlineReconnectTimer){
    clearTimeout(onlineReconnectTimer);
    onlineReconnectTimer=null;
  }
}
function onlineSendPendingAction(){
  if(!onlinePendingAction||!onlineSocketOpen())return;
  onlineSend(onlinePendingAction.type,onlinePendingAction.payload);

  onlineClearActionRetry();
  onlineActionRetryTimer=setTimeout(()=>{
    onlineActionRetryTimer=null;
    if(!onlinePendingAction)return;
    onlineSend('sync',{knownRevision:onlineRevision});
    onlineSendPendingAction();
  },Math.min(4000,500*Math.pow(2,onlinePendingAction.retries++)));
}
function onlineQueueAction(type,payload={}){
  if(!onlineSocketOpen()||onlinePendingAction)return false;
  const actionId=onlineMakeActionId();
  onlinePendingAction={
    type,
    actionId,
    retries:0,
    payload:{...payload,actionId,expectedRevision:onlineRevision,matchId:onlineMatchId}
  };
  onlineSendPendingAction();
  updateUI();
  renderOnlineLobby();
  return true;
}
function onlineAckAction(actionId){
  if(!actionId||!onlinePendingAction)return;
  if(actionId!==onlinePendingAction.actionId)return;
  onlineClearActionRetry();
  onlinePendingAction=null;
  updateUI();
  renderOnlineLobby();
}
function onlineScheduleSync(delay=1000){
  onlineClearSync();
  if(!onlineSocketOpen()||!onlineRoomCode)return;
  onlineSyncTimer=setTimeout(()=>{
    onlineSyncTimer=null;
    if(!onlineSocketOpen()||!onlineRoomCode)return;
    onlineSend('sync',{knownRevision:onlineRevision});
    onlineScheduleSync(1000);
  },delay);
}
function onlineClearAnimation(){
  if(onlineAnimationTimer){
    cancelAnimationFrame(onlineAnimationTimer);
    onlineAnimationTimer=null;
  }
  onlineAnimating=false;
  onlineAnimationRevision=0;
  onlineAnimationMeta=null;
  onlineAnimationEvents=[];
}
function onlineClearTransition(){
  if(onlineTransitionTimer){
    clearTimeout(onlineTransitionTimer);
    onlineTransitionTimer=null;
  }
  onlineTransitioning=false;
}
function onlineClearEventTimers(){
  for(const id of onlineEventTimers)clearTimeout(id);
  onlineEventTimers=[];
}
function onlineMetaObject(meta,coords){
  if(!meta||!coords)return null;
  const c=court();
  return{
    kind:meta.kind,
    side:meta.side,
    x:c.x+(Number(coords[0])||0)*c.w,
    y:c.y+(Number(coords[1])||0)*c.h,
    z:(Number(coords[2])||0)*c.w,
    vx:0,vy:0,vz:0,
    r:ballR(),
    hitCd:0,
    entered:true,
    hardnessId:meta.hardnessId||(meta.kind==='jack'?'soft':'medium'),
    realism:null
  };
}
function onlineApplyAnimationFrame(frame,objects){
  if(!Array.isArray(frame)||!Array.isArray(objects))return;
  let nextJack=null;
  const nextBalls=[];

  for(let i=0;i<objects.length;i++){
    const coords=frame[i];
    if(!coords)continue;
    const obj=onlineMetaObject(objects[i],coords);
    if(!obj)continue;
    if(obj.kind==='jack')nextJack=obj;
    else nextBalls.push(obj);
  }

  jack=nextJack;
  balls=nextBalls;
}
function onlineEventMessage(ev){
  if(!ev)return '';
  if(ev.message)return ev.message;
  if(ev.type==='ball_out')return 'Мяч вне площадки';
  if(ev.type==='ball_not_entered')return 'Мяч не вошёл в игровую зону';
  if(ev.type==='jack_in')return 'Джек в игре';
  if(ev.type==='jack_cross')return 'Джек на кресте';
  if(ev.type==='invalid_jack')return `Недействительный джек — следующий бокс ${ev.nextBox}`;
  if(ev.type==='tiebreak_start')return `Тай-брейк · первым ${sideOwnerName(ev.side)}`;
  if(ev.type==='tiebreak_equal')return 'Тай-брейк равный — ещё один';
  if(ev.type==='tiebreak_winner')return `Тай-брейк выиграл ${sideOwnerName(ev.side)}`;
  return '';
}
function onlineShowAnimationEventsAtFrame(frameIndex){
  for(const ev of onlineAnimationEvents){
    if(ev._shown)continue;
    if(!Number.isFinite(Number(ev.frame))||Number(ev.frame)>frameIndex)continue;
    ev._shown=true;
    const msg=onlineEventMessage(ev);
    if(msg)showToast(msg);
  }
}
function onlineShowResolutionEvents(events=[]){
  for(const ev of events){
    if(ev._shown)continue;
    if(Number.isFinite(Number(ev.frame)))continue;
    ev._shown=true;
    const msg=onlineEventMessage(ev);
    if(msg)showToast(msg);
  }
}
function onlineEndToast(transition){
  if(!transition)return '';
  if(transition.kind==='tiebreak_equal')return 'Тай-брейк равный — ещё один';
  if(transition.kind==='tiebreak_win')return `Тай-брейк выиграл ${sideOwnerName(transition.winner)}`;

  const pts=transition.points||{red:0,blue:0};
  if(pts.red>0&&pts.blue>0)return `Энд: ${pts.red}:${pts.blue}`;
  if(pts.red>0)return `${sideOwnerName('red')}: +${pts.red}`;
  if(pts.blue>0)return `${sideOwnerName('blue')}: +${pts.blue}`;
  return 'Энд без очков';
}
function onlineApplyPostAnimation(finalState,revision,events=[],transition=null){
  onlineClearAnimation();
  onlineShowResolutionEvents(events);

  if(transition?.interimState){
    // Local 1x1 shows phase=end and the new score for exactly 1450 ms.
    onlineTransitioning=true;
    onlineApplyState(transition.interimState,revision);
    showToast(onlineEndToast(transition));

    onlineTransitionTimer=setTimeout(()=>{
      onlineTransitionTimer=null;
      onlineTransitioning=false;

      if(transition.resetAim){
        aimAngle=0;
        aimPower=.50;
      }

      onlineApplyState(finalState,revision);

      if(transition.afterEvent){
        const msg=onlineEventMessage(transition.afterEvent);
        if(msg)showToast(msg);
      }

      onlineScheduleSync(350);
      const deferred=onlineDeferredSnapshot;
      onlineDeferredSnapshot=null;
      if(deferred&&Number(deferred.revision)>Number(revision)){
        onlineApplyState(deferred.state,deferred.revision);
      }
    },1450);
    return;
  }

  onlineApplyState(finalState,revision);
  onlineScheduleSync(350);

  const deferred=onlineDeferredSnapshot;
  onlineDeferredSnapshot=null;
  if(deferred&&Number(deferred.revision)>Number(revision)){
    onlineApplyState(deferred.state,deferred.revision);
  }
}
function onlinePlayAnimation(animation,finalState,revision,events=[],transition=null){
  const frames=Array.isArray(animation?.frames)?animation.frames:[];
  const objects=Array.isArray(animation?.objects)?animation.objects:[];

  if(!frames.length||!objects.length){
    // Never silently teleport on an incompatible animation payload.
    onlineAnimating=false;
    showToast('Ошибка формата анимации');
    if(onlineStatusEl){
      onlineStatusEl.textContent='Worker отдаёт несовместимую анимацию';
    }
    return;
  }

  onlineClearAnimation();
  onlineClearTransition();
  // Keep recovery polling alive during long animations for the connection watchdog.
  onlineScheduleSync(1000);

  onlineAnimating=true;
  onlineAnimationRevision=Number(revision)||0;
  onlineAnimationMeta=objects;
  onlineAnimationEvents=(Array.isArray(events)?events:[]).map(ev=>({...ev,_shown:false}));

  // Server frames represent a fixed 60 Hz simulation, independent of display refresh.
  onlineLatestSnapshot={state:finalState,revision};
  const startedAt=performance.now();
  let lastFrame=-1;
  const step=now=>{
    if(!onlineAnimating)return;
    const elapsed=Math.max(0,now-startedAt);
    const frame=Math.min(frames.length-1,Math.floor(elapsed*60/1000));
    if(frame!==lastFrame){
      onlineApplyAnimationFrame(frames[frame],objects);
      onlineShowAnimationEventsAtFrame(frame);
      lastFrame=frame;
    }
    if(elapsed>=frames.length*1000/60){
      onlineApplyPostAnimation(finalState,revision,onlineAnimationEvents,transition);
      return;
    }
    onlineAnimationTimer=requestAnimationFrame(step);
  };
  onlineAnimationTimer=requestAnimationFrame(step);
}

function renderOnlineLobby(){
  if(!onlineLobbyEl)return;
  const hasRoom=!!onlineRoomCode;
  onlineConnectEl.classList.toggle('hidden',hasRoom);
  onlineLobbyEl.classList.toggle('hidden',!hasRoom);
  onlineRoomCodeEl.textContent=onlineRoomCode||'-----';

  const red=onlinePlayers.find(p=>p.side==='red');
  const blue=onlinePlayers.find(p=>p.side==='blue');
  const label=p=>{
    if(!p)return 'ожидание…';
    const who=p.id&&p.id===onlinePlayerId?'ты':(p.connected?'игрок подключён':'переподключается…');
    return `${who}${p.ready?' · готов':''}`;
  };

  onlineRedPlayerEl.textContent=label(red);
  onlineBluePlayerEl.textContent=label(blue);
  onlineRedDot.classList.toggle('on',!!red?.connected);
  onlineBlueDot.classList.toggle('on',!!blue?.connected);

  if(onlineConnectionStatus){
    onlineStatusEl.textContent=onlineConnectionStatus;
  }else if(onlineCreatingRoom){
    onlineStatusEl.textContent='Сервер создаёт комнату…';
  }else if(onlineMatchActive){
    onlineStatusEl.textContent=onlineAnimating
      ?'Бросок…'
      :onlineTransitioning
        ?'Подсчёт очков…'
        :`Матч работает на сервере · версия ${onlineRevision}`;
  }else if(onlineSide){
    const connected=onlinePlayers.filter(p=>p.connected).length;
    if(connected<2)onlineStatusEl.textContent=`Ты — ${onlineSide==='red'?'красные':'синие'}. Ждём второго игрока.`;
    else if(onlinePlayers.filter(p=>p.side).every(p=>p.ready))onlineStatusEl.textContent='Оба готовы · сервер запускает матч…';
    else onlineStatusEl.textContent='Оба игрока должны нажать «Готов».';
  }else if(hasRoom){
    onlineStatusEl.textContent='Входим в комнату…';
  }

  const twoConnected=onlinePlayers.filter(p=>p.connected).length>=2;
  onlineReadyBtn.disabled=!onlineSide||!twoConnected||!onlineSocketOpen()||onlineMatchActive||!!onlinePendingAction;
  onlineReadyBtn.classList.toggle('ready',onlineReady);
  onlineReadyBtn.textContent=onlinePendingAction?.type==='ready'?'Отправляем…':(onlineReady?'✓ Готов':'Готов');
}
function onlineDeserializeObject(o){
  if(!o)return null;
  const c=court();
  return{
    kind:o.kind,
    side:o.side,
    x:c.x+(Number(o.u)||0)*c.w,
    y:c.y+(Number(o.v)||0)*c.h,
    z:(Number(o.z)||0)*c.w,
    vx:0,vy:0,vz:0,
    r:ballR(),hitCd:0,
    entered:!!o.entered,
    hardnessId:o.hardnessId||(o.kind==='jack'?'soft':'medium'),
    realism:o.realism?onlineClone(o.realism):null
  };
}
function onlineApplyState(s,revision=0){
  if(!s)return false;
  const incoming=Number(revision??s.revision??0)||0;
  if(incoming<onlineRevision)return false;

  const keepSide=onlineSide;
  onlineRevision=incoming;
  onlineMatchId=s.matchId||onlineMatchId;
  onlinePhysicsProfile=s.physicsProfile||onlinePhysicsProfile;
  if(s.endNo!==endNo||!!s.tieBreak!==tieBreak){aimAngle=0;aimPower=.50;}

  matchFormat=s.matchFormat||'individual';
  fieldOrientation=s.fieldOrientation==='horizontal'?'horizontal':'vertical';
  realisticMode=!!s.realisticMode;
  totalEnds=s.totalEnds??formatConfig().totalEnds;
  endNo=s.endNo??1;
  redScore=s.redScore??0;
  blueScore=s.blueScore??0;
  redLeft=s.redLeft??totalSideBalls();
  blueLeft=s.blueLeft??totalSideBalls();
  phase=s.phase||'jackRed';
  currentJackBox=s.currentJackBox??jackBoxForEnd(endNo);
  activePlayerBox=onlineClone(s.activePlayerBox||activePlayerBox);
  firstColourLockedBox=onlineClone(s.firstColourLockedBox||{red:null,blue:null});
  lastColourSide=s.lastColourSide??null;
  jackNeedsCross=!!s.jackNeedsCross;
  tieBreak=!!s.tieBreak;
  tieFirst=s.tieFirst??null;
  equidistantSequence=!!s.equidistantSequence;
  equidistantNextSide=s.equidistantNextSide??null;
  selectedBall=onlineClone(s.selectedBall||selectedBall);
  jackHardness=onlineClone(s.jackHardness||{red:'soft',blue:'soft'});
  currentJackHardness=s.currentJackHardness||'soft';
  kitConfig=onlineClone(s.kitConfig||{red:defaultKitIds(),blue:defaultKitIds()});
  ballAllocation=onlineClone(s.ballAllocation||ballAllocation);
  ballInventory=onlineClone(s.ballInventory||{red:[],blue:[]});
  launcherPositions=onlineClone(s.launcherPositions||launcherPositions);
  jack=onlineDeserializeObject(s.jack);
  balls=(s.balls||[]).map(onlineDeserializeObject);
  matchStarted=s.matchStarted!==false;

  lastShot=null;
  settleFrames=0;
  onlineRemoteMoving=false;
  onlineAuthority=false;
  gameMode='online';
  sideController={red:'p1',blue:'p2'};
  onlineSide=keepSide;

  renderFormatButtons();
  resize();

  if(s.modal){
    modalTitle.textContent=s.modal.title||'Матч окончен';
    modalText.textContent=s.modal.text||'';
    modal.classList.add('show');
  }else{
    modal.classList.remove('show');
  }

  updateUI();
  return true;
}
function onlineEnterMatch(state,revision){
  const resuming=onlineMatchActive&&(!state.matchId||state.matchId===onlineMatchId);
  onlineMatchActive=true;
  onlineGameStartSent=true;
  gameMode='online';
  sideController={red:'p1',blue:'p2'};
  setupOverlay.classList.remove('show');
  startNoticeEl.classList.remove('show');
  preStartPause=false;
  onlineBadge?.classList.add('show');
  onlineApplyState(state,revision);
  relayoutSoon();
  updateUI();

  if(resuming)return;
  aimAngle=0;
  aimPower=.50;
  updateUI();

  showStartNotice(
    'Матч начинается',
    realisticMode
      ? 'Тапни в свой бокс, чтобы выбрать позицию броска. Включён реалистичный режим: мяч может немного уводить.'
      : 'Тапни в свой бокс, чтобы выбрать позицию броска. Затем настрой ползунки и нажми «БРОСОК».'
  );
}
function onlineHandleRoomState(data){
  onlinePlayers=Array.isArray(data.players)?data.players:[];
  const me=onlinePlayers.find(p=>p.id===onlinePlayerId);
  if(me)onlineReady=!!me.ready;

  if(data.config){
    matchFormat=data.config.matchFormat||matchFormat;
    fieldOrientation=data.config.fieldOrientation==='horizontal'?'horizontal':'vertical';
    realisticMode=!!data.config.realisticMode;
    renderFormatButtons();
  }

  onlineAckAction(data.ackActionId);
  renderOnlineLobby();
}
function appVersionedUrl(build,hard=false){
  const u=new URL(location.href);
  u.searchParams.set('v',String(build||APP_BUILD));
  if(hard)u.searchParams.set('_cb',String(Date.now()));
  else u.searchParams.delete('_cb');
  return u;
}
function appMarkFreshUrl(){
  try{
    const u=appVersionedUrl(APP_BUILD,false);
    if(u.href!==location.href)history.replaceState(null,'',u.href);
  }catch{}
}
function appForceFreshReload(serverBuild){
  if(appVersionReloading)return false;
  appVersionReloading=true;

  const target=String(serverBuild||'latest');
  const key=`boccia-cache-reload:${target}`;
  let attempts=0;
  try{attempts=Number(sessionStorage.getItem(key)||0)||0}catch{}

  // Prevent an endless reload loop if GitHub Pages has not propagated the new file yet.
  if(attempts>=3){
    appVersionReloading=false;
    if(onlineStatusEl){
      onlineStatusEl.textContent='Новая версия ещё распространяется · повтори через несколько секунд';
    }
    showToast('Сайт обновляется · попробуй ещё раз через несколько секунд');
    return false;
  }

  try{sessionStorage.setItem(key,String(attempts+1))}catch{}

  const u=appVersionedUrl(target,true);
  // replace() prevents Back from reopening the stale cached copy.
  location.replace(u.href);
  return false;
}
async function appCheckServerVersion(force=false){
  if(appVersionReloading)return false;

  const now=Date.now();
  if(!force&&appLastVersionCheckAt&&now-appLastVersionCheckAt<30000){
    return true;
  }
  if(appVersionCheckPromise)return appVersionCheckPromise;

  appVersionCheckPromise=(async()=>{
    try{
      const r=await onlineFetch(`${VERSION_CHECK_URL}?_=${Date.now()}`,{
        method:'GET',
        cache:'no-store'
      });
      if(!r.ok)throw new Error(`version HTTP ${r.status}`);

      const data=await r.json();
      const serverBuild=String(data?.build||'');
      const serverProtocol=String(data?.protocol||'');

      appLastVersionCheckAt=Date.now();

      if(serverProtocol&&serverProtocol!==ONLINE_PROTOCOL){
        return appForceFreshReload(serverBuild||serverProtocol);
      }
      if(serverBuild&&serverBuild!==APP_BUILD){
        return appForceFreshReload(serverBuild);
      }

      if(serverBuild===APP_BUILD){
        try{sessionStorage.removeItem(`boccia-cache-reload:${serverBuild}`)}catch{}
        appMarkFreshUrl();
      }
      return true;
    }catch(err){
      console.warn('version check failed',err);
      // Local modes remain usable if the server is temporarily unreachable.
      return true;
    }finally{
      appVersionCheckPromise=null;
    }
  })();

  return appVersionCheckPromise;
}
function appCheckBuildFromMessage(data){
  const serverBuild=String(data?.build||'');
  if(serverBuild&&serverBuild!==APP_BUILD){
    appForceFreshReload(serverBuild);
    return false;
  }
  return true;
}
function onlineProtocolOk(data){
  if(!data?.protocol)return false;
  return data.protocol===ONLINE_PROTOCOL;
}
function onlineProtocolMismatch(data=null){
  onlineClearActionRetry();
  onlineClearSync();
  onlinePendingAction=null;
  onlineMatchActive=false;
  appForceFreshReload(data?.build||data?.protocol||'latest');
}
function onlineHandleMessage(data){
  if(!data||typeof data!=='object')return;

  if(['joined','room_state','snapshot','action_error','restart'].includes(data.type)){
    if(!appCheckBuildFromMessage(data))return;
    if(!onlineProtocolOk(data)){
      onlineProtocolMismatch(data);
      return;
    }
  }

  if(data.type==='joined'){
    onlineConnectionStatus='';
    onlineReconnectAttempts=0;
    onlinePlayerId=data.playerId;
    onlineSide=data.side;
    onlineReady=!!data.ready;
    onlineRevision=Number(data.revision)||0;
    if(data.config){
      matchFormat=data.config.matchFormat||matchFormat;
      fieldOrientation=data.config.fieldOrientation==='horizontal'?'horizontal':'vertical';
      realisticMode=!!data.config.realisticMode;
      renderFormatButtons();
    }
    if(Array.isArray(data.players))onlinePlayers=data.players;
    renderOnlineLobby();
    if(data.state)onlineEnterMatch(data.state,data.revision||0);
    onlineSend('sync',{knownRevision:onlineRevision});
    onlineScheduleSync(250);
    if(onlinePendingAction)onlineSendPendingAction();
    return;
  }

  if(data.type==='room_state'){
    onlineHandleRoomState(data);
    return;
  }

  if(data.type==='snapshot'){
    if(Array.isArray(data.players))onlinePlayers=data.players;
    onlineAckAction(data.ackActionId);

    if(data.state){
      const rev=Number(data.revision)||0;

      if(!onlineMatchActive){
        onlineEnterMatch(data.state,rev);
      }else if(rev<onlineRevision||((onlineAnimating||onlineTransitioning)&&rev<onlineAnimationRevision)){
        return;
      }else if(data.animation?.frames?.length){
        if(rev<=Math.max(onlineRevision,onlineAnimationRevision))return;
        onlinePlayAnimation(
          data.animation,
          data.state,
          rev,
          data.events||[],
          data.transition||null
        );
      }else if(onlineAnimating||onlineTransitioning){
        // A recovery poll can return the already-committed final state while
        // the local playback is still running. Do not jump to the end.
        if(rev>onlineAnimationRevision){
          onlineDeferredSnapshot={state:data.state,revision:rev};
        }
      }else{
        onlineApplyState(data.state,rev);
        if(data.transition)onlineApplyPostAnimation(data.state,rev,data.events||[],data.transition);
        else if(data.events?.length)onlineShowResolutionEvents(data.events);
      }
    }
    renderOnlineLobby();
    return;
  }

  if(data.type==='action_error'){
    onlineResetPlayback();
    onlineAckAction(data.ackActionId);
    if(data.state){
      if(!onlineMatchActive)onlineEnterMatch(data.state,data.revision||0);
      else onlineApplyState(data.state,data.revision||0);
    }
    showToast(data.message||'Сервер отклонил действие');
    return;
  }

  if(data.type==='room_full'){
    onlineDisconnect(true);
    showToast('В комнате уже два игрока. Проверь код или создай новую комнату.');
    onlineStatusEl.textContent='В комнате уже два игрока';
    renderOnlineLobby();
    return;
  }

  if(data.type==='restart'){
    onlineResetPlayback();
    onlineClearActionRetry();
    onlinePendingAction=null;
    onlineMatchId=null;
    onlineScheduleSync(250);
    onlineMatchActive=false;
    onlineRevision=0;
    onlineReady=false;
    modal.classList.remove('show');
    setupOverlay.classList.add('show');
    showSetupScreen('online');
    renderOnlineLobby();
    return;
  }
}
function onlineScheduleReconnect(){
  onlineClearReconnect();
  if(onlineManualDisconnect||!onlineRoomCode)return;
  onlineReconnectTimer=setTimeout(()=>{
    onlineReconnectTimer=null;
    if(onlineManualDisconnect||onlineSocketOpen()||!onlineRoomCode)return;
    onlineConnectRoom(onlineRoomCode,true);
  },Math.min(10000,900*Math.pow(2,onlineReconnectAttempts++))+Math.random()*250);
}
function onlineConnectRoom(code,reconnecting=false){
  code=onlineNormalizeRoomCode(code);
  if(code.length<4){showToast('Неверный код комнаты');return}

  onlineRoomCode=code;
  onlineManualDisconnect=false;
  onlineClearWatchdog();
  onlineClearReconnect();
  onlineResetPlayback();
  gameMode='online';
  sideController={red:'p1',blue:'p2'};

  if(!reconnecting){
    onlineClearActionRetry();
    onlineClearSync();
    onlineClearReconnect();
    onlinePendingAction=null;
    onlinePlayerId=null;
    onlineSide=null;
    onlinePlayers=[];
    onlineReady=false;
    onlineMatchActive=false;
    onlineRevision=0;
    onlineMatchId=null;
    onlineReconnectAttempts=0;
  }

  const previous=onlineSocket;
  onlineSocket=null;
  if(previous){
    try{previous.onclose=null;previous.close(1000,'replace')}catch{}
  }

  renderOnlineLobby();

  let ws;
  try{
    ws=new WebSocket(`${ONLINE_SERVER}/room/${encodeURIComponent(code)}`);
  }catch{
    onlineConnectionStatus='Не удалось открыть соединение';
    renderOnlineLobby();
    onlineScheduleReconnect();
    return;
  }

  onlineSocket=ws;
  onlineConnectionStatus=reconnecting?'Переподключение…':'Подключение…';
  onlineLastResponseAt=Date.now();
  onlineWatchConnection(ws);
  renderOnlineLobby();

  ws.onopen=()=>{
    if(ws!==onlineSocket)return;
    onlineSend('join',{clientKey:onlineClientKey,build:APP_BUILD,protocol:ONLINE_PROTOCOL});
  };
  ws.onmessage=e=>{
    if(ws!==onlineSocket)return;
    onlineLastResponseAt=Date.now();
    try{onlineHandleMessage(JSON.parse(e.data))}
    catch(err){console.warn('online message',err)}
  };
  ws.onerror=()=>{
    if(ws!==onlineSocket)return;
    onlineConnectionStatus='Ошибка соединения · пробуем восстановить…';
    renderOnlineLobby();
  };
  ws.onclose=e=>{
    if(ws!==onlineSocket)return;
    onlineSocket=null;
    onlineClearWatchdog();
    if(e.code===4001){
      onlineDisconnect(true);
      showToast('Игра открыта в другой вкладке');
      showSetupScreen('online');
      setupOverlay.classList.add('show');
      return;
    }
    onlineClearActionRetry();
    onlineClearSync();
    onlineClearAnimation();
    onlineClearTransition();
    onlineDeferredSnapshot=null;
    if(!onlineManualDisconnect&&onlineRoomCode){
      onlineConnectionStatus='Связь потеряна · переподключаемся…';
      if(onlineMatchActive)showToast('Связь потеряна · переподключаемся');
      else onlineStatusEl.textContent='Связь потеряна · переподключаемся…';
      renderOnlineLobby();
      onlineScheduleReconnect();
    }
  };
}
async function onlineCreateRoom(){
  if(onlineCreatingRoom)return;
  if(!await appCheckServerVersion(true))return;
  onlineCreatingRoom=true;
  onlineConnectionStatus='';
  gameMode='online';
  sideController={red:'p1',blue:'p2'};
  onlineRoomCode='';
  renderOnlineLobby();

  try{
    // Online is an exact server-hosted copy of local 1 × 1.
    matchFormat='individual';
    renderFormatButtons();

    const pc=court();
    const params=new URLSearchParams({
      clientKey:onlineClientKey,
      format:'individual',
      orientation:fieldOrientation,
      realism:realisticMode?'1':'0',
      physicsW:String(pc.w),
      physicsH:String(pc.h),
      physicsR:String(ballR()),
      build:APP_BUILD,
      protocol:ONLINE_PROTOCOL
    });
    const r=await onlineFetch(`${ONLINE_HTTP}/create-room?${params.toString()}`,{
      method:'GET',cache:'no-store'
    });
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    if(!data?.code)throw new Error('Нет кода комнаты');
    onlineRoomCode=onlineNormalizeRoomCode(data.code);
    onlineConnectRoom(onlineRoomCode,false);
  }catch(err){
    console.warn(err);
    onlineRoomCode='';
    showToast('Не удалось создать комнату');
    onlineConnectionStatus='Сервер недоступен · попробуй ещё раз';
    renderOnlineLobby();
  }finally{
    onlineCreatingRoom=false;
    renderOnlineLobby();
  }
}
async function onlineJoinRoom(code){
  if(!await appCheckServerVersion(true))return;
  code=onlineNormalizeRoomCode(code);
  if(code.length<4){showToast('Неверный код комнаты');return}

  try{
    const r=await onlineFetch(`${ONLINE_HTTP}/room-check/${encodeURIComponent(code)}`,{
      method:'GET',cache:'no-store'
    });
    if(r.status===404){showToast('Комната не найдена');return}
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    onlineConnectRoom(code,false);
  }catch(err){
    console.warn(err);
    showToast('Не удалось проверить комнату');
  }
}
function onlineDisconnect(clearRoom=true){
  onlineManualDisconnect=true;
  onlineClearWatchdog();
  onlineConnectionStatus='';
  onlineMatchId=null;
  onlinePhysicsProfile=null;
  onlineLatestSnapshot=null;
  onlineClearActionRetry();
  onlineClearSync();
  onlineClearReconnect();
  onlineClearAnimation();
  onlineClearTransition();
  onlineClearEventTimers();
  onlineDeferredSnapshot=null;

  const ws=onlineSocket;
  onlineSocket=null;
  if(ws&&ws.readyState===WebSocket.OPEN){
    try{ws.send(JSON.stringify({type:'leave'}))}catch{}
  }
  if(ws){
    try{ws.onclose=null;ws.close(1000,'leave')}catch{}
  }

  onlinePendingAction=null;
  onlinePlayerId=null;
  onlineSide=null;
  onlinePlayers=[];
  onlineReady=false;
  onlineGameStartSent=false;
  onlineMatchActive=false;
  onlineRemoteMoving=false;
  onlineAuthority=false;
  onlineRevision=0;
  if(clearRoom)onlineRoomCode='';

  renderOnlineLobby();
  onlineBadge?.classList.remove('show');
  setTimeout(()=>{onlineManualDisconnect=false},0);
}
function onlineOpenSetup(){
  pushSetupHistory();
  gameMode='online';
  matchFormat='individual';
  renderFormatButtons();
  sideController={red:'p1',blue:'p2'};
  onlineDisconnect(true);
  showSetupScreen('online');
}
function onlineMaybeLiveSync(){
  // Deliberately empty: no online physics/state streaming in the browser.
}
function onlineSendAuthoritativeState(){
  // Legacy compatibility hook. Server owns all online transitions.
}
