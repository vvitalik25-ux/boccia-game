function puzzlePoint(xf,yf){
  const c=court();
  return{x:c.x+c.w*xf,y:c.y+c.h*yf};
}
function puzzleMakeBall(side,x,y,hardnessId='medium'){
  return{
    kind:side,side,x,y,z:0,vx:0,vy:0,vz:0,r:ballR(),hitCd:0,entered:true,
    hardnessId,realism:createRealismProfile(side,hardnessId)
  };
}
function puzzleMakeJack(x,y){
  currentJackHardness='soft';
  return{
    kind:'jack',side:'neutral',x,y,z:0,vx:0,vy:0,vz:0,r:ballR(),hitCd:0,entered:true,
    hardnessId:'soft',realism:createRealismProfile('jack','soft')
  };
}
function puzzleRandomHardnessSet(count,kind){
  const pools={
    draw:['superSoft','soft','mediumSoft','medium'],
    attack:['superHard','hard','medium','mediumSoft'],
    mixed:['hard','medium','mediumSoft','soft','superSoft']
  };
  const pool=pools[kind]||pools.mixed;
  const out=[];
  for(let i=0;i<count;i++)out.push(pool[Math.floor(Math.random()*pool.length)]);
  if(kind==='attack'&&count>0&&!out.some(x=>x==='superHard'||x==='hard'))out[0]='hard';
  return out;
}
function puzzleAddRelative(side,angle,distR,hardness='medium'){
  const r=ballR();
  return puzzleMakeBall(
    side,
    jack.x+Math.cos(angle)*r*distR,
    jack.y+Math.sin(angle)*r*distR,
    hardness
  );
}
function preparePuzzleInventory(side,ids,oppRemaining=1){
  const opp=opponent(side);
  ballInventory={red:[],blue:[]};
  const ownBox=sideBoxes(side)[0],oppBox=sideBoxes(opp)[0];

  ballInventory[side]=ids.map(id=>({id,used:false,ownerBox:ownBox}));
  const oppIds=['medium','hard','soft','mediumSoft','superSoft','superHard'].slice(0,Math.max(1,oppRemaining));
  ballInventory[opp]=oppIds.map(id=>({id,used:false,ownerBox:oppBox}));

  selectedBall[side]=ids[0]||'medium';
  selectedBall[opp]=oppIds[0]||'medium';
  activePlayerBox[side]=ownBox;
  activePlayerBox[opp]=oppBox;
  firstColourLockedBox={red:null,blue:null};

  setBallsLeft(side,ids.length);
  setBallsLeft(opp,Math.max(1,oppRemaining));
}
function capturePuzzleSnapshot(){
  return{
    puzzle:{...puzzle,remainingIds:[...(puzzle.remainingIds||[])]},
    jack:jack?JSON.parse(JSON.stringify(jack)):null,
    balls:JSON.parse(JSON.stringify(balls)),
    redLeft,blueLeft,
    ballInventory:JSON.parse(JSON.stringify(ballInventory)),
    selectedBall:{...selectedBall},
    activePlayerBox:{...activePlayerBox},
    launcherPositions:JSON.parse(JSON.stringify(launcherPositions)),
    lastColourSide
  };
}
function restorePuzzleSnapshot(){
  if(!puzzleSnapshot)return;
  puzzle={...puzzleSnapshot.puzzle,remainingIds:[...(puzzleSnapshot.puzzle.remainingIds||[])]};
  jack=puzzleSnapshot.jack?JSON.parse(JSON.stringify(puzzleSnapshot.jack)):null;
  balls=JSON.parse(JSON.stringify(puzzleSnapshot.balls));
  redLeft=puzzleSnapshot.redLeft;
  blueLeft=puzzleSnapshot.blueLeft;
  ballInventory=JSON.parse(JSON.stringify(puzzleSnapshot.ballInventory));
  selectedBall={...puzzleSnapshot.selectedBall};
  activePlayerBox={...puzzleSnapshot.activePlayerBox};
  launcherPositions=JSON.parse(JSON.stringify(puzzleSnapshot.launcherPositions));
  lastColourSide=puzzleSnapshot.lastColourSide;
  lastShot=null;
  settleFrames=0;
  jackNeedsCross=false;
  phase=puzzle.side;
  matchStarted=true;
  trainingEditing=false;
  trainingPanel.classList.add('hidden');
  aimPanel.classList.remove('hidden');
  modal.classList.remove('show');
  restartBtn.textContent='↻ Новая задача';
  updateUI();
}
function buildRandomPuzzle(){
  setFormat('individual');
  gameMode='puzzle';
  sideController={red:'p1',blue:'p2'};
  setupOverlay.classList.remove('show');
  trainingPanel.classList.add('hidden');
  aimPanel.classList.remove('hidden');
  modal.classList.remove('show');
  clearTimeout(botTimer);
  resetLauncherPositions();

  balls=[];jack=null;
  redScore=0;blueScore=0;
  tieBreak=false;tieFirst=null;
  lastShot=null;lastColourSide=null;jackNeedsCross=false;
  settleFrames=0;
  matchStarted=true;
  equidistantSequence=false;equidistantNextSide=null;

  const side=Math.random()<.5?'red':'blue';
  const opp=opponent(side);
  const c=court(),r=ballR();

  const jx=.42+Math.random()*.16;
  const jy=.28+Math.random()*.20;
  const jp=puzzlePoint(jx,jy);
  jack=puzzleMakeJack(jp.x,jp.y);

  const variant=Math.floor(Math.random()*4);
  const baseAngle=Math.random()*Math.PI*2;
  const difficultyRoll=Math.random();
  let remainingIds=[],objective='',short='',type='',target=1,difficulty='Легко';

  if(variant===0){
    type='transition';
    const count=difficultyRoll<.55?1:2;
    difficulty=count===1?'Легко':'Средне';
    remainingIds=puzzleRandomHardnessSet(count,'draw');

    balls.push(puzzleAddRelative(opp,baseAngle,2.35,'mediumSoft'));
    if(count===2){
      balls.push(puzzleAddRelative(side,baseAngle+Math.PI*.88,4.8,'medium'));
    }

    objective='Сделай так, чтобы после твоего броска ход перешёл к сопернику.';
    short='Передай ход сопернику';
  }else if(variant===1){
    type='score';
    target=difficultyRoll<.55?2:3;
    difficulty=target===2?'Средне':'Сложно';
    const count=target===2?2:3;
    remainingIds=puzzleRandomHardnessSet(count,'attack');

    balls.push(puzzleAddRelative(opp,baseAngle,2.05,'medium'));
    for(let i=0;i<target;i++){
      const a=baseAngle+Math.PI+(i-(target-1)/2)*.42;
      balls.push(puzzleAddRelative(side,a,2.85+i*.32,i===0?'soft':'mediumSoft'));
    }

    objective=`Заработай минимум ${target} очка${target===2?'':'ов'}.`;
    short=`Набери ${target}+ очка`;
  }else if(variant===2){
    type='swing';
    target=difficultyRoll<.6?1:2;
    difficulty=target===1?'Средне':'Сложно';
    const count=target===1?2:3;
    remainingIds=puzzleRandomHardnessSet(count,'attack');

    const oppCount=target===1?2:3;
    for(let i=0;i<oppCount;i++){
      balls.push(puzzleAddRelative(opp,baseAngle+i*.40,2.05+i*.34,i===0?'mediumSoft':'medium'));
    }
    for(let i=0;i<Math.max(1,target);i++){
      balls.push(puzzleAddRelative(side,baseAngle+Math.PI+i*.48,3.35+i*.38,'soft'));
    }

    objective=`Убери очки соперника и заработай минимум ${target} ${target===1?'своё очко':'своих очка'}.`;
    short=`Сними очки и сделай +${target}`;
  }else{
    type='remove';
    const oppCount=difficultyRoll<.55?2:3;
    difficulty=oppCount===2?'Средне':'Сложно';
    remainingIds=puzzleRandomHardnessSet(oppCount===2?2:3,'attack');

    for(let i=0;i<oppCount;i++){
      balls.push(puzzleAddRelative(opp,baseAngle+i*.35,2.0+i*.33,i===0?'soft':'mediumSoft'));
    }
    balls.push(puzzleAddRelative(side,baseAngle+Math.PI,4.15,'mediumSoft'));

    objective='Убери все очки соперника. После решения соперник не должен набирать очков.';
    short='Убери очки соперника';
  }

  puzzle={
    id:++puzzleSerial,
    side,opp,type,target,difficulty,objective,short,
    remainingIds:[...remainingIds],
    startBalls:remainingIds.length,
    shotsUsed:0
  };

  preparePuzzleInventory(side,remainingIds,1);
  lastColourSide=opp;
  phase=side;
  puzzleSnapshot=capturePuzzleSnapshot();
  puzzleLastSuccess=false;

  restartBtn.textContent='↻ Новая задача';
  updateUI();

  const n=remainingIds.length;
  showStartNotice(
    `Задача · ${difficulty}`,
    `${objective} У тебя ${n} ${n===1?'мяч':'мяча'}.`
  );
}
function startRandomPuzzle(){
  clearTimeout(botTimer);
  buildRandomPuzzle();
}
function repeatPuzzle(){
  restorePuzzleSnapshot();
  const n=ballsLeft(puzzle.side);
  showStartNotice(
    `Повтори задачу · ${puzzle.difficulty}`,
    `${puzzle.objective} У тебя ${n} ${n===1?'мяч':'мяча'}.`
  );
}
function puzzleSucceeded(nextSide,pts){
  if(!puzzle)return false;
  if(puzzle.type==='transition')return nextSide===puzzle.opp;
  if(puzzle.type==='score')return pts[puzzle.side]>=puzzle.target;
  if(puzzle.type==='swing')return pts[puzzle.opp]===0&&pts[puzzle.side]>=puzzle.target;
  if(puzzle.type==='remove')return pts[puzzle.opp]===0&&pts[puzzle.side]>0;
  return false;
}
function finishPuzzle(success,reason=''){
  if(!puzzle)return;
  puzzleLastSuccess=success;
  phase='finished';
  updateUI();

  const pts=scoreCurrentEnd();
  modalTitle.textContent=success?'Задача решена ✓':'Не получилось';
  if(success){
    modalText.textContent=`${puzzle.objective} Результат позиции: ${pts[puzzle.side]}:${pts[puzzle.opp]}.`;
    againBtn.textContent='Следующая задача';
  }else{
    modalText.textContent=reason||`Цель не выполнена. Попробуй ещё раз.`;
    againBtn.textContent='Повторить задачу';
  }
  modal.classList.add('show');
}
function resolvePuzzleThrow(){
  if(jackNeedsCross||!jack||!isJackValid(jack)){
    placeJackOnCross();
  }

  puzzle.shotsUsed++;
  const pts=scoreCurrentEnd();
  const next=sideToPlay();

  if(puzzleSucceeded(next,pts)){
    finishPuzzle(true);
    return;
  }

  if(ballsLeft(puzzle.side)<=0){
    finishPuzzle(false,'Мячи закончились, а цель не выполнена.');
    return;
  }

  if(next===puzzle.opp){
    finishPuzzle(false,'Ход перешёл к сопернику раньше, чем была выполнена цель.');
    return;
  }

  phase=puzzle.side;
  updateUI();
  showToast(`Осталось мячей: ${ballsLeft(puzzle.side)}`);
}

