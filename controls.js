function playerSelectionLocked(side){
  return !!firstColourLockedBox[side] && phase===side;
}
function selectPlayerBox(side,box){
  if(!humanTurn()||currentSide()!==side)return;
  if(playerSelectionLocked(side))return;
  if(remainingForBox(side,box)<=0)return;
  if(gameMode==='online'){
    onlineQueueAction('select_player',{box});
    return;
  }
  activePlayerBox[side]=box;
  ensureSelectedBall(side);
  updateUI();
}
function renderPlayerChoices(){
  const side=currentSide();
  const colourTurn=side&&(phase==='red'||phase==='blue');
  const multi=side&&sideBoxes(side).length>1;
  playerChoiceWrap.classList.toggle('hidden',!(colourTurn&&multi));
  playerChoicesEl.innerHTML='';
  if(!(colourTurn&&multi))return;

  ensureActivePlayer(side);
  const locked=playerSelectionLocked(side);
  playerChoiceText.textContent=locked
    ?`Бокс ${activePlayerBox[side]} · первый после джека`
    :`Бокс ${activePlayerBox[side]}`;

  for(const box of sideBoxes(side)){
    const btn=document.createElement('button');
    const remaining=remainingForBox(side,box);
    btn.textContent=`Бокс ${box} · ${remaining}`;
    if(box===activePlayerBox[side])btn.classList.add('active');
    if(locked&&box===activePlayerBox[side])btn.classList.add('locked');
    btn.disabled=!humanTurn()||remaining<=0||(locked&&box!==activePlayerBox[side]);
    btn.addEventListener('click',()=>selectPlayerBox(side,box));
    playerChoicesEl.appendChild(btn);
  }
}

function renderBallSelector(){
  const side=currentSide();
  const colourTurn=side&&(phase==='red'||phase==='blue');
  const humanColour=colourTurn&&humanTurn();
  ballSelectEl.innerHTML='';

  if(!side||!colourTurn){
    if(phase==='jackRed'||phase==='jackBlue'){
      ballTypeText.textContent=isBotSide(side)
        ?'Джек · ИИ'
        :`Джек · ${ballType(jackHardness[side]||'soft').label}`;
    }else ballTypeText.textContent='—';
  }else{
    const id=ensureSelectedBall(side);
    ballTypeText.textContent=ballType(id).label;
  }

  for(const t of BALL_TYPES){
    const all=side?ballInventory[side].filter(x=>x.id===t.id):[];
    const remaining=all.filter(x=>!x.used).length;
    const total=all.length;

    const btn=document.createElement('button');
    btn.className='ballChoice';

    // During moving/end phases currentSide() is null. Keep the exact same six
    // controls in the DOM so the panel and therefore the court never resize.
    if(!side){
      btn.textContent=t.short;
      btn.disabled=true;
      btn.style.visibility='hidden';
      ballSelectEl.appendChild(btn);
      continue;
    }

    if(total===0){
      btn.textContent=t.short;
      btn.disabled=true;
      btn.style.visibility='hidden';
      ballSelectEl.appendChild(btn);
      continue;
    }

    btn.textContent=total>1?`${t.short}×${remaining}`:t.short;
    btn.title=`${t.label}: осталось ${remaining} из ${total}`;
    const used=remaining===0;
    if(used)btn.classList.add('used');
    if(selectedBall[side]===t.id&&!used)btn.classList.add('active');
    btn.disabled=!humanColour||used;
    btn.addEventListener('click',()=>{
      if(!humanColour||used)return;
      if(gameMode==='online'){
        if(onlineQueueAction('select_ball',{hardnessId:t.id}))tone(545,.018,.007);
        return;
      }
      selectedBall[side]=t.id;
      tone(545,.018,.007);
      updateUI();
    });
    ballSelectEl.appendChild(btn);
  }
}
function angleToSliderValue(angle){
  return Math.max(0,Math.min(1000,((angle+58)/116)*1000));
}
function sliderValueToAngle(value){
  return -58+(Math.max(0,Math.min(1000,value))/1000)*116;
}
function powerToSliderValue(power01){
  const percent=Math.max(8,Math.min(100,power01*100));
  return ((percent-8)/92)*1000;
}
function sliderValueToPower(value){
  const percent=8+(Math.max(0,Math.min(1000,value))/1000)*92;
  return percent/100;
}

function updateUI(){
  renderAimControls();
  puzzleExitBtn?.classList.toggle('hidden',gameMode!=='puzzle');
  onlineBadge?.classList.toggle('show',gameMode==='online'&&onlineMatchActive);
  aimPanel.classList.toggle('multiPlayerFormat',matchFormat!=='individual');
  redScoreEl.textContent=redScore;blueScoreEl.textContent=blueScore;
  redNameEl.textContent=`${sideOwnerName('red')} · ${sideBoxes('red').join('/')}`;
  blueNameEl.textContent=`${sideOwnerName('blue')} · ${sideBoxes('blue').join('/')}`;
  roundEl.textContent=gameMode==='training'
    ?(phase==='trainingEdit'?'ТРЕНИРОВКА · РЕДАКТОР':'ТРЕНИРОВКА')
    :gameMode==='puzzle'&&puzzle
      ?`ЗАДАЧА · ${puzzle.difficulty}`
      :(tieBreak?'ТАЙ-БРЕЙК':`${formatConfig().label} · энд ${endNo} / ${totalEnds}`);

  if(gameMode==='online'&&onlineConnectionStatus){
    statusEl.textContent=onlineConnectionStatus;
  }else if(gameMode==='online'&&onlineTransitioning){
    statusEl.textContent='Подсчёт очков';
  }else if(gameMode==='online'&&onlineAnimating){
    statusEl.textContent='Мяч катится…';
  }else if(gameMode==='online'&&onlinePendingAction){
    statusEl.textContent=onlinePendingAction.type==='throw'?'Сервер рассчитывает бросок…':'Сервер подтверждает действие…';
  }else if(phase==='trainingEdit'){
    statusEl.textContent='Расставь ситуацию';
  }else if(phase==='jackRed'||phase==='jackBlue'){
    const s=currentSide();statusEl.textContent=`${sideOwnerName(s)} · бокс ${currentJackBox} · джек`;
  }else if(phase==='red'||phase==='blue'){
    const s=currentSide();ensureActivePlayer(s);
    const hardness=isBotSide(s)?'':` · ${ballType(ensureSelectedBall(s)).short}`;
    statusEl.textContent=gameMode==='puzzle'&&puzzle
      ?`${puzzle.short} · ${ballsLeft(puzzle.side)} мяч.`
      :`${sideOwnerName(s)} · бокс ${activePlayerBox[s]} · ${ballsLeft(s)}${hardness}`;
  }else if(phase==='moving')statusEl.textContent=gameMode==='online'&&onlineRemoteMoving?'Соперник бросает…':'Мяч катится…';
  else if(phase==='end')statusEl.textContent='Подсчёт очков';
  else statusEl.textContent='Матч окончен';

  const h=humanTurn();
  hintEl.textContent=phase==='trainingEdit'
    ?'Тап — поставить · потяни — переместить'
    :'Тапни в свой бокс, чтобы передвинуться';
  hintEl.style.opacity=(h||phase==='trainingEdit')?'1':'0';
  angleSlider.value=String(Math.round(angleToSliderValue(aimAngle)));
  powerSlider.value=String(Math.round(powerToSliderValue(aimPower)));
  angleSlider.disabled=!h;
  powerSlider.disabled=!h;
  throwBtn.disabled=!h;

  const s=currentSide();
  const colourTurn=s&&(phase==='red'||phase==='blue');
  declineBtn.disabled=!(h&&colourTurn&&ballsLeft(s)>0);
  throwBtn.textContent=(phase==='jackRed'||phase==='jackBlue')?'ДЖЕК':'БРОСОК';
  renderPlayerChoices();
  renderBallSelector();
  if(phase==='trainingEdit')renderTrainingEditorUI();
}
function speedFromPower(){
  const c=court();
  const baselineDecel=BALL_TYPE_MAP.medium.decel;
  const min=4.3,max=Math.sqrt(2*baselineDecel*c.h*.96)*1.12;
  return min+(max-min)*aimPower;
}
function launchHuman(){
  if(!humanTurn())return;
  const side=currentSide();
  const kind=(phase==='jackRed'||phase==='jackBlue')?'jack':'colour';

  if(gameMode==='online'){
    if(onlineQueueAction('throw',{angle:aimAngle,power:aimPower})){
      tone(kind==='jack'?520:(side==='red'?260:190),.06,.03);
      updateUI();
    }
    return;
  }

  const pos=launcherFor(side),a=aimAngle*Math.PI/180,speed=speedFromPower();
  const hardnessId=kind==='colour'?ensureSelectedBall(side):(jackHardness[side]||'soft');
  const launch=applyRealismToLaunch(Math.sin(a)*speed,-Math.cos(a)*speed,kind==='jack'?'jack':side,hardnessId);
  const b=spawnBall(kind==='jack'?'jack':side,side,pos.x,pos.y,launch.vx,launch.vy,hardnessId);

  if(kind==='colour'){
    consumeBall(side,hardnessId);
    setBallsLeft(side,ballsLeft(side)-1);
    lastColourSide=side;
    if(firstColourLockedBox[side])firstColourLockedBox[side]=null;
    ensureActivePlayer(side);
    ensureSelectedBall(side);
  }
  lastShot={kind,side,ball:b,fouled:false};
  phase='moving';
  tone(kind==='jack'?520:(side==='red'?260:190),.06,.03);updateUI();
}
function declineRemaining(){
  if(!humanTurn())return;
  const side=currentSide();
  if(!(phase==='red'||phase==='blue')||ballsLeft(side)<=0)return;

  const count=ballsLeft(side);
  if(!window.confirm(`Отказаться от ${count} оставшихся мячей? Они станут Dead Ball.`))return;

  if(gameMode==='online'){
    onlineQueueAction('decline',{});
    return;
  }

  for(const item of ballInventory[side])item.used=true;
  setBallsLeft(side,0);
  showToast(`${sideOwnerName(side)}: оставшиеся мячи не играются`);

  const other=opponent(side);
  if(ballsLeft(other)>0){
    phase=other;updateUI();scheduleBotIfNeeded('colour',520);
  }else{
    finishEnd();
  }
}

