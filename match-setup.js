function autoAllocateSide(side){
  ballAllocation[side]=defaultAllocationForSide(side);
}
function beginAllocationFlow(){
  allocationQueue=[];
  for(const side of ['red','blue']){
    if(isBotSide(side))autoAllocateSide(side);
    else allocationQueue.push(side);
  }
  if(matchFormat==='individual'){
    for(const side of ['red','blue'])autoAllocateSide(side);
    startAssignedMatch();
    return;
  }
  const first=allocationQueue.shift();
  if(first)openAllocationStep(first);
  else startAssignedMatch();
}
function openAllocationStep(side){
  allocationSide=side;
  showSetupScreen('allocation');
  const boxes=sideBoxes(side),per=formatConfig().perPlayer;
  allocationSelectedBox=boxes[0];
  allocationWorking={};
  boxes.forEach(b=>allocationWorking[b]=[]);
  allocationTitle.textContent=`Распределение: ${sideOwnerName(side)}`;
  allocationSubtitle.textContent=`${side==='red'?'Красные':'Синие'} · по ${per} мяча в каждый бокс`;
  allocationHelp.textContent=matchFormat==='pairs'
    ?'По правилам пары: спортсмены играют из своих боксов весь матч, по 3 мяча у каждого.'
    :'По правилам команды: спортсмены играют из своих боксов весь матч, по 2 мяча у каждого.';
  renderAllocation();
  relayoutSoon();
}
function remainingAllocationTokens(){
  const used=[];
  for(const arr of Object.values(allocationWorking))used.push(...arr);
  const kit=(kitConfig[allocationSide]||defaultKitIds()).slice();
  const remaining=kit.slice();
  for(const id of used){
    const i=remaining.indexOf(id);
    if(i>=0)remaining.splice(i,1);
  }
  return remaining;
}
function renderAllocation(){
  const per=formatConfig().perPlayer;
  allocationPlayersEl.innerHTML='';
  for(const box of sideBoxes(allocationSide)){
    const card=document.createElement('div');
    card.className='allocPlayer'+(box===allocationSelectedBox?' selected':'');
    const arr=allocationWorking[box]||[];

    const head=document.createElement('div');
    head.className='allocPlayerHead';
    head.innerHTML=`<b>Спортсмен · бокс ${box}</b><span>${arr.length} / ${per}</span>`;
    card.appendChild(head);

    const chips=document.createElement('div');
    chips.className='allocAssigned';
    arr.forEach((id,index)=>{
      const chip=document.createElement('button');
      chip.className='allocChip';
      chip.textContent=ballType(id).short;
      chip.title=`${ballType(id).label} · нажми, чтобы вернуть`;
      chip.addEventListener('click',e=>{
        e.stopPropagation();
        allocationWorking[box].splice(index,1);
        allocationSelectedBox=box;
        renderAllocation();
      });
      chips.appendChild(chip);
    });
    card.appendChild(chips);

    card.addEventListener('click',()=>{
      allocationSelectedBox=box;
      renderAllocation();
    });
    allocationPlayersEl.appendChild(card);
  }

  allocationBallsEl.innerHTML='';
  const remaining=remainingAllocationTokens();
  remaining.forEach(id=>{
    const b=document.createElement('button');
    b.textContent=ballType(id).short;
    b.title=ballType(id).label;
    b.addEventListener('click',()=>{
      const arr=allocationWorking[allocationSelectedBox];
      if(arr.length>=per){
        showToast(`В боксе ${allocationSelectedBox} уже ${per} мяча`);
        return;
      }
      arr.push(id);
      renderAllocation();
    });
    allocationBallsEl.appendChild(b);
  });

  const complete=sideBoxes(allocationSide).every(box=>(allocationWorking[box]||[]).length===per)&&remaining.length===0;
  allocationContinueBtn.disabled=!complete;
}
function resetAllocation(){
  for(const b of sideBoxes(allocationSide))allocationWorking[b]=[];
  allocationSelectedBox=sideBoxes(allocationSide)[0];
  renderAllocation();
}
function commitAllocation(){
  if(allocationContinueBtn.disabled)return;
  pushSetupHistory();
  ballAllocation[allocationSide]={};
  for(const box of sideBoxes(allocationSide))ballAllocation[allocationSide][box]=[...allocationWorking[box]];
  const next=allocationQueue.shift();
  if(next)openAllocationStep(next);
  else{
    allocationStep.classList.add('hidden');
    startAssignedMatch();
  }
}

function showSetup(){
  if(gameMode==='online'||onlineSocket)onlineDisconnect(true);
  puzzleExitBtn?.classList.add('hidden');
  clearTrainingStageSizeLock();
  clearTimeout(botTimer);
  clearSetupTimers();
  setupHistory=[];
  puzzle=null;
  puzzleSnapshot=null;
  puzzleLastSuccess=false;
  matchStarted=false;
  trainingEditing=false;
  trainingPanel.classList.add('hidden');
  aimPanel.classList.remove('hidden');
  restartBtn.textContent='↻ Новая игра';
  setupOverlay.classList.add('show');
  showSetupScreen('mode');
  colourChoices.classList.add('hidden');
  tossText.textContent='Жеребьёвка…';
  againBtn.textContent='Сыграть ещё';
}
function beginColourToss(mode){
  pushSetupHistory();
  clearSetupTimers();
  gameMode=mode;
  afterKitSelectionAction=beginAllocationFlow;
  showSetupScreen('toss');
  colourChoices.classList.add('hidden');
  tossText.textContent='Жеребьёвка…';
  coin.classList.remove('spin');
  void coin.offsetWidth;
  coin.classList.add('spin');

  const participants=mode==='bot'?['p1','bot']:['p1','p2'];
  tossWinner=participants[Math.random()<.5?0:1];

  scheduleSetup(()=>{
    if(mode==='bot'&&tossWinner==='bot'){
      const botColour=Math.random()<.5?'red':'blue';
      assignColours(tossWinner,botColour);
      tossText.textContent=`Бот выиграл жеребьёвку и выбрал ${botColour==='red'?'красный':'синий'} цвет.`;
      pushSetupHistory();
      scheduleSetup(startKitSelection,850);
    }else{
      tossText.textContent=`${controllerName(tossWinner)} выиграл жеребьёвку. Выберите цвет.`;
      colourChoices.classList.remove('hidden');
    }
  },760);
}
function assignColours(winner,colour){
  const otherController=gameMode==='bot'
    ?(winner==='p1'?'bot':'p1')
    :(winner==='p1'?'p2':'p1');

  sideController[colour]=winner;
  sideController[opponent(colour)]=otherController;
}
function chooseTossColour(colour){
  pushSetupHistory();
  assignColours(tossWinner,colour);
  tossText.textContent=`${controllerName(tossWinner)} выбрал ${colour==='red'?'красный':'синий'} цвет.`;
  colourChoices.classList.add('hidden');
  scheduleSetup(startKitSelection,450);
}
function startAssignedMatch(){
  setupOverlay.classList.remove('show');
  relayoutSoon();
  resetMatch();
  clearTimeout(botTimer);
  updateUI();
  showStartNotice(
    'Матч начинается',
    realisticMode
      ? 'Тапни в свой бокс, чтобы выбрать позицию броска. Включён реалистичный режим: мяч может немного уводить.'
      : 'Тапни в свой бокс, чтобы выбрать позицию броска. Затем настрой ползунки и нажми «БРОСОК».'
  );
}
function resetMatch(){
  clearTimeout(botTimer);balls=[];jack=null;
  resetLauncherPositions();
  totalEnds=formatConfig().totalEnds;
  redLeft=totalSideBalls();blueLeft=totalSideBalls();redScore=0;blueScore=0;endNo=1;
  aimAngle=0;aimPower=.50;settleFrames=0;lastShot=null;lastColourSide=null;
  jackNeedsCross=false;tieBreak=false;tieFirst=null;botJackHistory=[];botTargetHistory={red:[],blue:[]};matchStarted=true;
  equidistantSequence=false;equidistantNextSide=null;
  firstColourLockedBox={red:null,blue:null};
  resetBallInventory();
  modal.classList.remove('show');
  startRegulationEnd();
}
function startRegulationEnd(){
  clearTimeout(botTimer);balls=[];jack=null;redLeft=totalSideBalls();blueLeft=totalSideBalls();settleFrames=0;
  lastShot=null;lastColourSide=null;jackNeedsCross=false;aimAngle=0;aimPower=.50;tieBreak=false;
  equidistantSequence=false;equidistantNextSide=null;
  firstColourLockedBox={red:null,blue:null};
  resetBallInventory();
  currentJackBox=jackBoxForEnd(endNo);
  const jackSide=sideForBox(currentJackBox);
  activePlayerBox[jackSide]=currentJackBox;
  phase=sidePhase(jackSide,'jack');updateUI();
  scheduleBotIfNeeded('jack',650);
}
function startTieBreak(firstSide){
  clearTimeout(botTimer);balls=[];redLeft=totalSideBalls();blueLeft=totalSideBalls();settleFrames=0;lastShot=null;
  lastColourSide=null;jackNeedsCross=false;tieBreak=true;tieFirst=firstSide;aimAngle=0;aimPower=.50;
  equidistantSequence=false;equidistantNextSide=null;
  firstColourLockedBox={red:null,blue:null};
  resetBallInventory();
  const p=crossPoint();
  currentJackHardness=jackHardness[firstSide]||'soft';
  jack={
    kind:'jack',side:'neutral',x:p.x,y:p.y,z:0,vx:0,vy:0,vz:0,
    r:ballR(),hitCd:0,entered:true,hardnessId:currentJackHardness,
    realism:createRealismProfile('jack',currentJackHardness)
  };
  phase=firstSide;updateUI();
  showToast(`Тай-брейк · первым ${sideOwnerName(firstSide)}`);
  scheduleBotIfNeeded('colour',650);
}
