// ============================================================
// BOCCIA ONLINE V2 — HTTPS ONLY
// No WebSocket, no transport monkey-patching.
// Server remains authoritative. All actions are idempotent.
// ============================================================

let onlineEntryBusy=false;
let onlineEntryGeneration=0;
let onlineHttpSyncInFlight=false;
let onlineHttpActionInFlight=false;
let onlineHttpSerial=Promise.resolve();
let onlineConnectGeneration=0;

const ONLINE_HTTP_POLL_ACTIVE=700;
const ONLINE_HTTP_POLL_LOBBY=1000;
const ONLINE_HTTP_STALE=12000;
const ONLINE_HTTP_TIMEOUT=15000;

function onlineClone(value){
  return value==null?value:JSON.parse(JSON.stringify(value));
}

function onlineNormalizeRoomCode(value){
  const lookalikes={'А':'A','В':'B','С':'C','Е':'E','Н':'H','К':'K','М':'M','О':'O','Р':'P','Т':'T','Х':'X','У':'Y'};
  return String(value||'')
    .toUpperCase()
    .replace(/[АВСЕНКМОРТХУ]/g,c=>lookalikes[c])
    .replace(/[^A-Z0-9]/g,'')
    .slice(0,8);
}

function onlineSocketOpen(){
  return !!onlineSocket &&
    onlineSocket.readyState===1 &&
    !!onlineRoomCode &&
    Date.now()-onlineLastResponseAt<ONLINE_HTTP_STALE;
}

function onlineSetTransportState(open){
  if(open){
    if(!onlineSocket)onlineSocket={readyState:1,transport:'https'};
    else onlineSocket.readyState=1;
  }else if(onlineSocket){
    onlineSocket.readyState=0;
  }
}

function onlineMarkHealthy(){
  onlineLastResponseAt=Date.now();
  onlineReconnectAttempts=0;
  onlineSetTransportState(true);
  if(onlineConnectionStatus){
    onlineConnectionStatus='';
    updateUI();
    renderOnlineLobby();
  }
}

function onlineMarkOffline(message='Связь потеряна · восстанавливаем…'){
  onlineSetTransportState(false);
  onlineConnectionStatus=message;
  updateUI();
  renderOnlineLobby();
}

async function onlineFetch(url,options={}){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  let timer=null;
  if(controller){
    timer=setTimeout(()=>controller.abort(),ONLINE_HTTP_TIMEOUT);
  }
  try{
    const response=await fetch(url,{
      cache:'no-store',
      credentials:'omit',
      ...options,
      ...(controller?{signal:controller.signal}:{})
    });
    const body=await response.text();
    return{
      ok:response.ok,
      status:response.status,
      text:body,
      json:async()=>{
        try{return JSON.parse(body)}
        catch{throw new Error('Некорректный ответ сервера')}
      }
    };
  }finally{
    if(timer)clearTimeout(timer);
  }
}

function onlineRoomMessageUrl(code=onlineRoomCode){
  const clean=onlineNormalizeRoomCode(code);
  return `${ONLINE_HTTP}/http/room/${encodeURIComponent(clean)}/message`;
}

async function onlineHttpExchange(message,{code=onlineRoomCode,process=true}={}){
  const clean=onlineNormalizeRoomCode(code);
  if(!clean)throw new Error('Нет комнаты');

  const response=await onlineFetch(onlineRoomMessageUrl(clean),{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Cache-Control':'no-cache',
      'Pragma':'no-cache'
    },
    body:JSON.stringify({
      clientKey:onlineClientKey,
      message
    })
  });

  if(!response.ok){
    const err=new Error(`HTTP ${response.status}`);
    err.status=response.status;
    throw err;
  }

  const payload=await response.json();
  onlineMarkHealthy();

  if(process&&Array.isArray(payload?.messages)){
    for(const data of payload.messages){
      onlineHandleMessage(data);
    }
  }
  return payload;
}

function onlineSend(type,payload={}){
  if(!onlineRoomCode)return false;

  const message={
    type,
    ...(type==='restart'?{matchId:onlineMatchId}:{}),
    ...payload
  };

  if(type==='sync'){
    if(onlineHttpSyncInFlight)return true;
    onlineHttpSyncInFlight=true;
    onlineHttpExchange(message)
      .catch(err=>{
        console.warn('online sync',err);
        onlineMarkOffline();
        onlineScheduleReconnect();
      })
      .finally(()=>{
        onlineHttpSyncInFlight=false;
      });
    return true;
  }

  // State-changing commands are serialized so restart/leave/action order
  // cannot change on a slow mobile connection.
  const code=onlineRoomCode;
  onlineHttpSerial=onlineHttpSerial
    .then(()=>onlineHttpExchange(message,{code}))
    .catch(err=>{
      console.warn('online send',type,err);
      onlineMarkOffline();
      onlineScheduleReconnect();
    });
  return true;
}

function onlineClearWatchdog(){
  clearTimeout(onlineWatchdogTimer);
  onlineWatchdogTimer=null;
}

function onlineWatchConnection(){
  onlineClearWatchdog();
  onlineWatchdogTimer=setTimeout(()=>{
    if(gameMode!=='online'||!onlineRoomCode)return;
    if(Date.now()-onlineLastResponseAt>=ONLINE_HTTP_STALE){
      onlineMarkOffline();
      onlineScheduleReconnect();
      return;
    }
    onlineWatchConnection();
  },2500);
}

function onlineResetPlayback(){
  onlineClearAnimation();
  onlineClearTransition();
  onlineClearEventTimers();
  onlineDeferredSnapshot=null;
  onlineLatestSnapshot=null;
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
  if(!onlinePendingAction||onlineHttpActionInFlight||!onlineRoomCode)return;
  const pending=onlinePendingAction;
  const code=onlineRoomCode;
  onlineHttpActionInFlight=true;

  onlineHttpSerial=onlineHttpSerial
    .then(()=>onlineHttpExchange({
      type:pending.type,
      ...pending.payload
    },{code}))
    .catch(err=>{
      console.warn('online action',err);
      onlineMarkOffline();
      onlineScheduleReconnect();
    })
    .finally(()=>{
      onlineHttpActionInFlight=false;
      if(!onlinePendingAction||onlinePendingAction.actionId!==pending.actionId)return;

      onlineClearActionRetry();
      const delay=Math.min(5000,700*Math.pow(1.7,Math.min(6,pending.retries++)));
      onlineActionRetryTimer=setTimeout(()=>{
        onlineActionRetryTimer=null;
        if(!onlinePendingAction)return;
        // First ask for authoritative state. If server already committed
        // the action, sync will acknowledge the new revision/state.
        onlineSend('sync',{knownRevision:onlineRevision});
        onlineSendPendingAction();
      },delay);
    });
}

function onlineQueueAction(type,payload={}){
  if(!onlineSocketOpen()||onlinePendingAction)return false;

  const actionId=onlineMakeActionId();
  onlinePendingAction={
    type,
    actionId,
    retries:0,
    payload:{
      ...payload,
      actionId,
      expectedRevision:onlineRevision,
      matchId:onlineMatchId
    }
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

function onlineScheduleSync(delay=null){
  onlineClearSync();
  if(!onlineRoomCode||onlineManualDisconnect)return;

  const ms=delay??(onlineMatchActive?ONLINE_HTTP_POLL_ACTIVE:ONLINE_HTTP_POLL_LOBBY);
  onlineSyncTimer=setTimeout(()=>{
    onlineSyncTimer=null;
    if(!onlineRoomCode||onlineManualDisconnect)return;

    onlineSend('sync',{knownRevision:onlineRevision});
    onlineScheduleSync();
  },ms);
}

// -------------------- server animation playback --------------------

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
    // Correctness is more important than animation. If the server sent a
    // final state but no usable animation, apply it instead of freezing.
    onlineAnimating=false;
    onlineApplyState(finalState,revision);
    onlineScheduleSync(350);
    return;
  }

  onlineClearAnimation();
  onlineClearTransition();

  onlineAnimating=true;
  onlineAnimationRevision=Number(revision)||0;
  onlineAnimationMeta=objects;
  onlineAnimationEvents=(Array.isArray(events)?events:[]).map(ev=>({...ev,_shown:false}));
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

// -------------------- lobby / state --------------------

function renderOnlineLobby(){
  if(!onlineLobbyEl)return;

  onlineCreateBtn.disabled=onlineEntryBusy;
  onlineJoinBtn.disabled=onlineEntryBusy;
  onlineCreateBtn.textContent=onlineCreatingRoom?'Создаём…':'Создать комнату';
  onlineJoinBtn.textContent=onlineEntryBusy&&!onlineCreatingRoom?'Проверяем…':'Войти';

  const hasRoom=!!onlineRoomCode;
  onlineConnectEl.classList.toggle('hidden',hasRoom);
  onlineLobbyEl.classList.toggle('hidden',!hasRoom);
  onlineRoomCodeEl.textContent=onlineRoomCode||'-----';

  const red=onlinePlayers.find(p=>p.side==='red');
  const blue=onlinePlayers.find(p=>p.side==='blue');

  const label=p=>{
    if(!p)return 'ожидание…';
    const who=p.id&&p.id===onlinePlayerId
      ?'ты'
      :(p.connected?'игрок подключён':'нет связи');
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
        :`HTTPS · сервер на связи · версия ${onlineRevision}`;
  }else if(onlineSide){
    const connected=onlinePlayers.filter(p=>p.connected).length;
    if(connected<2){
      onlineStatusEl.textContent=`Ты — ${onlineSide==='red'?'красные':'синие'}. Ждём второго игрока.`;
    }else if(onlinePlayers.filter(p=>p.side).every(p=>p.ready)){
      onlineStatusEl.textContent='Оба готовы · сервер запускает матч…';
    }else{
      onlineStatusEl.textContent='Оба игрока должны нажать «Готов».';
    }
  }else if(hasRoom){
    onlineStatusEl.textContent='Подключение по HTTPS…';
  }

  const twoConnected=onlinePlayers.filter(p=>p.connected).length>=2;
  onlineReadyBtn.disabled=
    !onlineSide||
    !twoConnected||
    !onlineSocketOpen()||
    onlineMatchActive||
    !!onlinePendingAction;

  onlineReadyBtn.classList.toggle('ready',onlineReady);
  onlineReadyBtn.textContent=
    onlinePendingAction?.type==='ready'
      ?'Отправляем…'
      :(onlineReady?'✓ Готов':'Готов');
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
    r:ballR(),
    hitCd:0,
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

  if(s.endNo!==endNo||!!s.tieBreak!==tieBreak){
    aimAngle=0;
    aimPower=.50;
  }

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
      ?'Тапни в свой бокс, чтобы выбрать позицию броска. Включён реалистичный режим: мяч может немного уводить.'
      :'Тапни в свой бокс, чтобы выбрать позицию броска. Затем настрой ползунки и нажми «БРОСОК».'
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

// -------------------- build freshness --------------------

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

  if(attempts>=2){
    appVersionReloading=false;
    onlineConnectionStatus='Версии клиента и сервера не совпадают · обнови страницу';
    renderOnlineLobby();
    return false;
  }

  try{sessionStorage.setItem(key,String(attempts+1))}catch{}

  const u=appVersionedUrl(target,true);
  location.replace(u.href);
  return false;
}

async function appCheckServerVersion(force=false){
  if(appVersionReloading)return false;

  const now=Date.now();
  if(!force&&appLastVersionCheckAt&&now-appLastVersionCheckAt<30000)return true;
  if(appVersionCheckPromise)return appVersionCheckPromise;

  appVersionCheckPromise=(async()=>{
    try{
      const r=await onlineFetch(`${VERSION_CHECK_URL}?_=${Date.now()}`,{
        method:'GET'
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
  return !!data?.protocol&&data.protocol===ONLINE_PROTOCOL;
}

function onlineProtocolMismatch(data=null){
  onlineClearActionRetry();
  onlineClearSync();
  onlinePendingAction=null;
  onlineMatchActive=false;
  appForceFreshReload(data?.build||data?.protocol||'latest');
}

// -------------------- incoming messages --------------------

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
    onlineMarkHealthy();
    onlineConnectionStatus='';
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

    onlineScheduleSync(200);

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
        if(rev>onlineAnimationRevision){
          onlineDeferredSnapshot={state:data.state,revision:rev};
        }
      }else{
        onlineApplyState(data.state,rev);
        if(data.transition){
          onlineApplyPostAnimation(data.state,rev,data.events||[],data.transition);
        }else if(data.events?.length){
          onlineShowResolutionEvents(data.events);
        }
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
    onlineScheduleSync(250);
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
    onlineMatchActive=false;
    onlineRevision=0;
    onlineReady=false;

    modal.classList.remove('show');
    setupOverlay.classList.add('show');
    showSetupScreen('online');
    renderOnlineLobby();
    onlineScheduleSync(250);
  }
}

// -------------------- connect / reconnect --------------------

function onlineScheduleReconnect(){
  onlineClearReconnect();
  if(onlineManualDisconnect||!onlineRoomCode)return;

  const delay=Math.min(
    8000,
    700*Math.pow(1.7,Math.min(6,onlineReconnectAttempts++))
  );

  onlineReconnectTimer=setTimeout(()=>{
    onlineReconnectTimer=null;
    if(onlineManualDisconnect||!onlineRoomCode)return;
    onlineConnectRoom(onlineRoomCode,true);
  },delay);
}

async function onlineConnectRoom(code,reconnecting=false){
  code=onlineNormalizeRoomCode(code);
  if(code.length<4){
    showToast('Неверный код комнаты');
    return false;
  }

  const generation=++onlineConnectGeneration;

  onlineRoomCode=code;
  onlineManualDisconnect=false;
  onlineClearWatchdog();
  onlineClearReconnect();
  gameMode='online';
  sideController={red:'p1',blue:'p2'};

  if(!reconnecting){
    onlineClearActionRetry();
    onlineClearSync();
    onlinePendingAction=null;
    onlinePlayerId=null;
    onlineSide=null;
    onlinePlayers=[];
    onlineReady=false;
    onlineMatchActive=false;
    onlineRevision=0;
    onlineMatchId=null;
    onlineReconnectAttempts=0;
    onlineResetPlayback();
  }

  onlineSocket={readyState:0,transport:'https'};
  onlineConnectionStatus=reconnecting
    ?'Восстанавливаем связь по HTTPS…'
    :'Подключение по HTTPS…';

  renderOnlineLobby();

  try{
    await onlineHttpExchange({
      type:'join',
      clientKey:onlineClientKey,
      build:APP_BUILD,
      protocol:ONLINE_PROTOCOL
    },{code});

    if(generation!==onlineConnectGeneration)return false;

    onlineMarkHealthy();
    onlineWatchConnection();
    onlineScheduleSync(200);
    return true;
  }catch(err){
    if(generation!==onlineConnectGeneration)return false;

    console.warn('online join',err);

    if(err?.status===404){
      onlineSetTransportState(false);
      onlineConnectionStatus='Комната не найдена. Проверь код.';
      renderOnlineLobby();
      return false;
    }

    onlineMarkOffline(
      navigator.onLine===false
        ?'Нет интернета · ждём сеть…'
        :'Не удалось связаться с сервером · повторяем…'
    );
    onlineScheduleReconnect();
    return false;
  }
}

async function onlineCreateRoom(){
  if(onlineEntryBusy)return;

  const generation=++onlineEntryGeneration;
  onlineEntryBusy=true;
  onlineCreatingRoom=true;
  onlineConnectionStatus='';
  gameMode='online';
  sideController={red:'p1',blue:'p2'};
  onlineRoomCode='';
  renderOnlineLobby();

  try{
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
      method:'GET'
    });

    if(!r.ok)throw Object.assign(new Error(`HTTP ${r.status}`),{status:r.status});

    const data=await r.json();

    if(generation!==onlineEntryGeneration)return;
    if(!appCheckBuildFromMessage(data))return;
    if(!data?.code)throw new Error('Нет кода комнаты');

    onlineRoomCode=onlineNormalizeRoomCode(data.code);
    await onlineConnectRoom(onlineRoomCode,false);
  }catch(err){
    if(generation!==onlineEntryGeneration)return;

    console.warn('create room',err);
    onlineRoomCode='';
    onlineConnectionStatus=onlineEntryError(err);
    showToast('Не удалось создать комнату');
    renderOnlineLobby();
  }finally{
    if(generation===onlineEntryGeneration){
      onlineCreatingRoom=false;
      onlineEntryBusy=false;
      renderOnlineLobby();
    }
  }
}

function onlineEntryError(err){
  if(navigator.onLine===false){
    return 'Нет подключения к интернету. Подключись к сети и повтори.';
  }
  if(err?.name==='AbortError'){
    return 'Сервер не ответил за 15 секунд. Попробуй ещё раз.';
  }
  if(err?.status){
    return `Сервер ответил с ошибкой ${err.status}. Попробуй ещё раз.`;
  }
  return 'Не удалось связаться с сервером. Попробуй ещё раз.';
}

async function onlineJoinRoom(code){
  if(onlineEntryBusy)return;

  code=onlineNormalizeRoomCode(code);
  if(code.length<4){
    onlineConnectionStatus='Введи код комнаты целиком';
    renderOnlineLobby();
    return;
  }

  const generation=++onlineEntryGeneration;
  onlineEntryBusy=true;
  onlineConnectionStatus='Проверяем комнату…';
  renderOnlineLobby();

  try{
    const r=await onlineFetch(
      `${ONLINE_HTTP}/room-check/${encodeURIComponent(code)}`,
      {method:'GET'}
    );

    if(generation!==onlineEntryGeneration)return;

    if(r.status===404){
      onlineConnectionStatus='Комната не найдена. Проверь код у друга.';
      return;
    }
    if(!r.ok)throw Object.assign(new Error(`HTTP ${r.status}`),{status:r.status});

    const data=await r.json();
    if(generation!==onlineEntryGeneration||!appCheckBuildFromMessage(data))return;

    await onlineConnectRoom(code,false);
  }catch(err){
    if(generation===onlineEntryGeneration){
      console.warn('join room',err);
      onlineConnectionStatus=onlineEntryError(err);
    }
  }finally{
    if(generation===onlineEntryGeneration){
      onlineEntryBusy=false;
      renderOnlineLobby();
    }
  }
}

function onlineDisconnect(clearRoom=true){
  onlineEntryGeneration++;
  onlineConnectGeneration++;
  onlineEntryBusy=false;
  onlineCreatingRoom=false;
  onlineManualDisconnect=true;

  onlineClearWatchdog();
  onlineClearActionRetry();
  onlineClearSync();
  onlineClearReconnect();
  onlineClearAnimation();
  onlineClearTransition();
  onlineClearEventTimers();

  const code=onlineRoomCode;
  if(code&&onlineSide){
    // Queue leave behind any already-sent state-changing command.
    onlineHttpSerial=onlineHttpSerial
      .then(()=>onlineHttpExchange({type:'leave'},{code,process:false}))
      .catch(()=>{});
  }

  onlineConnectionStatus='';
  onlineMatchId=null;
  onlinePhysicsProfile=null;
  onlineLatestSnapshot=null;
  onlineDeferredSnapshot=null;

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
  onlineHttpSyncInFlight=false;
  onlineHttpActionInFlight=false;

  onlineSocket=null;

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
  // Browser never simulates online physics.
}

function onlineSendAuthoritativeState(){
  // Compatibility hook. Server is authoritative.
}

// Recover automatically after Wi-Fi/mobile network comes back.
window.addEventListener('online',()=>{
  if(gameMode==='online'&&onlineRoomCode){
    onlineConnectRoom(onlineRoomCode,true);
  }
});
