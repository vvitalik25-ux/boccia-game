function clearSetupTimers(){
  for(const id of setupTimers)clearTimeout(id);
  setupTimers=[];
}
function scheduleSetup(fn,delay){
  const id=setTimeout(()=>{
    setupTimers=setupTimers.filter(x=>x!==id);
    fn();
  },delay);
  setupTimers.push(id);
  return id;
}
function currentSetupScreen(){
  if(!setupOverlay.classList.contains('show')){
    if(trainingEditing&&!trainingPanel.classList.contains('hidden'))return 'trainingEditor';
    return 'game';
  }
  if(!modeStep.classList.contains('hidden'))return 'mode';
  if(!onlineStep.classList.contains('hidden'))return 'online';
  if(!tossStep.classList.contains('hidden'))return 'toss';
  if(!kitStep.classList.contains('hidden'))return 'kit';
  if(!allocationStep.classList.contains('hidden'))return 'allocation';
  return 'mode';
}
function showSetupScreen(screen){
  modeStep.classList.toggle('hidden',screen!=='mode');
  onlineStep.classList.toggle('hidden',screen!=='online');
  tossStep.classList.toggle('hidden',screen!=='toss');
  kitStep.classList.toggle('hidden',screen!=='kit');
  allocationStep.classList.toggle('hidden',screen!=='allocation');
  setupBackBtn.classList.toggle('hidden',screen==='mode');
  if(screen==='online')renderOnlineLobby();
  relayoutSoon();
}
function copyAllocationState(src){
  const out={};
  for(const [k,v] of Object.entries(src||{}))out[k]=Array.isArray(v)?[...v]:v;
  return out;
}
function captureSetupState(){
  return{
    screen:currentSetupScreen(),
    matchFormat,
    gameMode,
    sideController:{...sideController},
    tossWinner,
    afterKitSelectionAction,
    pendingKitSide,
    pendingKitMode,
    pendingKitCounts:{...pendingKitCounts},
    pendingJackHardness,
    jackHardness:{...jackHardness},
    kitQueue:[...kitQueue],
    kitConfig:{red:[...(kitConfig.red||[])],blue:[...(kitConfig.blue||[])],},
    allocationQueue:[...allocationQueue],
    allocationSide,
    allocationSelectedBox,
    allocationWorking:copyAllocationState(allocationWorking),
    ballAllocation:{
      red:copyAllocationState(ballAllocation.red),
      blue:copyAllocationState(ballAllocation.blue)
    },
    tossText:tossText.textContent,
    colourChoicesHidden:colourChoices.classList.contains('hidden'),
    coinSpin:coin.classList.contains('spin')
  };
}
function pushSetupHistory(){
  const s=captureSetupState();
  if(s.screen==='game')return;
  setupHistory.push(s);
  if(setupHistory.length>30)setupHistory.shift();
}
function restoreSetupState(s){
  if(!s)return;
  clearSetupTimers();

  matchFormat=s.matchFormat;
  gameMode=s.gameMode;
  sideController={...s.sideController};
  tossWinner=s.tossWinner;
  afterKitSelectionAction=s.afterKitSelectionAction;

  pendingKitSide=s.pendingKitSide;
  pendingKitMode=s.pendingKitMode;
  pendingKitCounts={...s.pendingKitCounts};
  pendingJackHardness=s.pendingJackHardness||'soft';
  jackHardness={...(s.jackHardness||{red:'soft',blue:'soft'})};
  kitQueue=[...s.kitQueue];
  kitConfig={red:[...s.kitConfig.red],blue:[...s.kitConfig.blue]};

  allocationQueue=[...s.allocationQueue];
  allocationSide=s.allocationSide;
  allocationSelectedBox=s.allocationSelectedBox;
  allocationWorking=copyAllocationState(s.allocationWorking);
  ballAllocation={
    red:copyAllocationState(s.ballAllocation.red),
    blue:copyAllocationState(s.ballAllocation.blue)
  };

  clearTrainingStageSizeLock();
  trainingEditing=false;
  trainingPanel.classList.add('hidden');
  aimPanel.classList.remove('hidden');
  setupOverlay.classList.add('show');

  renderFormatButtons();
  showSetupScreen(s.screen);

  if(s.screen==='toss'){
    tossText.textContent=s.tossText;
    colourChoices.classList.toggle('hidden',s.colourChoicesHidden);
    coin.classList.toggle('spin',s.coinSpin);
  }else if(s.screen==='kit'){
    kitTitle.textContent=`Комплект: ${sideOwnerName(pendingKitSide)}`;
    kitSubtitle.textContent=`${pendingKitSide==='red'?'Красный':'Синий'} цвет · выбери 6 мячей`;
    standardKitBtn.classList.toggle('selected',pendingKitMode==='standard');
    customKitBtn.classList.toggle('selected',pendingKitMode==='custom');
    kitGrid.classList.toggle('hidden',pendingKitMode!=='custom');
    kitTotal.classList.toggle('hidden',pendingKitMode!=='custom');
    renderKitGrid();
    renderJackHardnessChoices();
  }else if(s.screen==='allocation'){
    const boxes=sideBoxes(allocationSide),per=formatConfig().perPlayer;
    allocationTitle.textContent=`Распределение: ${sideOwnerName(allocationSide)}`;
    allocationSubtitle.textContent=`${allocationSide==='red'?'Красные':'Синие'} · по ${per} мяча в каждый бокс`;
    allocationHelp.textContent=matchFormat==='pairs'
      ?'По правилам пары: спортсмены играют из своих боксов весь матч, по 3 мяча у каждого.'
      :'По правилам команды: спортсмены играют из своих боксов весь матч, по 2 мяча у каждого.';
    renderAllocation();
  }
}
function setupGoBack(){
  clearSetupTimers();
  if(currentSetupScreen()==='online')onlineDisconnect(false);
  const prev=setupHistory.pop();
  if(!prev)return;
  restoreSetupState(prev);
}

function defaultKitIds(){
  return BALL_TYPES.map(t=>t.id);
}
function initPendingCounts(side){
  pendingKitCounts={};
  const current=kitConfig[side]||defaultKitIds();
  for(const t of BALL_TYPES)pendingKitCounts[t.id]=current.filter(id=>id===t.id).length;
}
function pendingKitTotal(){
  return Object.values(pendingKitCounts).reduce((a,b)=>a+b,0);
}
function renderJackHardnessChoices(){
  if(!jackHardnessChoicesEl)return;
  jackHardnessChoicesEl.innerHTML='';
  for(const t of BALL_TYPES){
    const btn=document.createElement('button');
    btn.textContent=t.short;
    btn.title=t.label;
    btn.classList.toggle('selected',pendingJackHardness===t.id);
    btn.addEventListener('click',()=>{
      pendingJackHardness=t.id;
      renderJackHardnessChoices();
    });
    jackHardnessChoicesEl.appendChild(btn);
  }
  if(jackHardnessTextEl)jackHardnessTextEl.textContent=ballType(pendingJackHardness).label;
}

function renderKitGrid(){
  kitGrid.innerHTML='';
  for(const t of BALL_TYPES){
    const row=document.createElement('div');
    row.className='kitRow';

    const label=document.createElement('div');
    label.className='kitLabel';
    label.textContent=t.label;

    const minus=document.createElement('button');
    minus.textContent='−';
    minus.disabled=pendingKitMode!=='custom'||(pendingKitCounts[t.id]||0)<=0;
    minus.addEventListener('click',()=>{
      if(pendingKitMode!=='custom')return;
      pendingKitCounts[t.id]=Math.max(0,(pendingKitCounts[t.id]||0)-1);
      renderKitGrid();
    });

    const count=document.createElement('div');
    count.className='kitCount';
    count.textContent=pendingKitCounts[t.id]||0;

    const plus=document.createElement('button');
    plus.textContent='+';
    plus.disabled=pendingKitMode!=='custom'||pendingKitTotal()>=6;
    plus.addEventListener('click',()=>{
      if(pendingKitMode!=='custom'||pendingKitTotal()>=6)return;
      pendingKitCounts[t.id]=(pendingKitCounts[t.id]||0)+1;
      renderKitGrid();
    });

    row.append(label,minus,count,plus);
    kitGrid.appendChild(row);
  }

  const total=pendingKitTotal();
  kitTotal.innerHTML=`Выбрано: <b>${total} / 6</b>`;
  kitContinueBtn.disabled=pendingKitMode==='custom'&&total!==6;
  renderJackHardnessChoices();
}
function setPendingKitMode(mode){
  pendingKitMode=mode;
  standardKitBtn.classList.toggle('selected',mode==='standard');
  customKitBtn.classList.toggle('selected',mode==='custom');
  kitGrid.classList.toggle('hidden',mode!=='custom');
  kitTotal.classList.toggle('hidden',mode!=='custom');

  if(mode==='standard'){
    pendingKitCounts={};
    for(const t of BALL_TYPES)pendingKitCounts[t.id]=1;
    pendingJackHardness='soft';
  }else if(pendingKitTotal()!==6){
    initPendingCounts(pendingKitSide);
  }
  renderKitGrid();
}
function openKitStep(side){
  pendingKitSide=side;
  pendingJackHardness=jackHardness[side]||'soft';
  showSetupScreen('kit');

  kitTitle.textContent=`Комплект: ${sideOwnerName(side)}`;
  kitSubtitle.textContent=`${side==='red'?'Красный':'Синий'} цвет · выбери 6 мячей`;
  initPendingCounts(side);
  setPendingKitMode('standard');
}
function commitPendingKit(){
  let ids=[];
  if(pendingKitMode==='standard'){
    ids=defaultKitIds();
  }else{
    for(const t of BALL_TYPES){
      for(let i=0;i<(pendingKitCounts[t.id]||0);i++)ids.push(t.id);
    }
  }
  if(ids.length!==6)return;
  pushSetupHistory();
  kitConfig[pendingKitSide]=ids;
  jackHardness[pendingKitSide]=pendingJackHardness||'soft';

  const next=kitQueue.shift();
  if(next){
    openKitStep(next);
  }else{
    kitStep.classList.add('hidden');
    if(typeof afterKitSelectionAction==='function'){
      const fn=afterKitSelectionAction;
      afterKitSelectionAction=null;
      fn();
    }else{
      startAssignedMatch();
    }
  }
}
function startKitSelection(){
  kitQueue=[];
  const humanSides=['red','blue'].filter(side=>!isBotSide(side));
  // Bot keeps a balanced standard six-ball set and chooses exactly
  // one Jack for its colour for the entire match.
  for(const side of ['red','blue']){
    if(isBotSide(side)){
      kitConfig[side]=defaultKitIds();
      jackHardness[side]=chooseBotMatchJackHardness(side,botProfile());
    }
  }
  kitQueue=humanSides.slice(1);
  openKitStep(humanSides[0]||'red');
}

