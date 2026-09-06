function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0))}
function allObjects(){return jack?[jack,...balls]:[...balls]}
function moving(){return allObjects().some(b=>Math.hypot(b.vx,b.vy)>.06||Math.abs(b.vz||0)>.05)}
function ballType(id){return BALL_TYPE_MAP[id]||BALL_TYPE_MAP.medium}
function physicsFor(b){
  return ballType(b.hardnessId||(b.kind==='jack'?'soft':'medium'));
}
function defaultAllocationForSide(side){
  const boxes=sideBoxes(side),per=formatConfig().perPlayer;
  const kit=(kitConfig[side]||BALL_TYPES.map(t=>t.id)).slice();
  const out={};
  boxes.forEach(b=>out[b]=[]);
  let n=0;
  for(const id of kit){
    const b=boxes[Math.floor(n/per)%boxes.length];
    if(out[b].length<per)out[b].push(id);
    n++;
  }
  return out;
}
function resetBallInventory(){
  for(const side of ['red','blue']){
    const allocated=ballAllocation[side]
      ?Object.values(ballAllocation[side]).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0)
      :0;
    if(!ballAllocation[side]||Object.keys(ballAllocation[side]).length!==sideBoxes(side).length||allocated!==totalSideBalls()){
      ballAllocation[side]=defaultAllocationForSide(side);
    }
  }
  ballInventory={red:[],blue:[]};
  for(const side of ['red','blue']){
    for(const box of sideBoxes(side)){
      for(const id of (ballAllocation[side][box]||[])){
        ballInventory[side].push({id,used:false,ownerBox:Number(box)});
      }
    }
  }
  selectedBall.red='medium';selectedBall.blue='medium';
  activePlayerBox.red=sideBoxes('red')[0];activePlayerBox.blue=sideBoxes('blue')[0];
  ensureActivePlayer('red');ensureActivePlayer('blue');
}
function unusedItemsForBox(side,box){
  return ballInventory[side].filter(x=>!x.used&&x.ownerBox===Number(box));
}
function remainingForBox(side,box){return unusedItemsForBox(side,box).length}
function availableBoxes(side){return sideBoxes(side).filter(b=>remainingForBox(side,b)>0)}
function ensureActivePlayer(side){
  if(firstColourLockedBox[side]&&remainingForBox(side,firstColourLockedBox[side])>0){
    activePlayerBox[side]=firstColourLockedBox[side];
    return activePlayerBox[side];
  }
  if(remainingForBox(side,activePlayerBox[side])>0)return activePlayerBox[side];
  activePlayerBox[side]=availableBoxes(side)[0]??sideBoxes(side)[0];
  return activePlayerBox[side];
}
function availableBallIds(side){
  const box=ensureActivePlayer(side);
  return unusedItemsForBox(side,box).map(x=>x.id);
}
function isBallAvailable(side,id){
  const box=ensureActivePlayer(side);
  return unusedItemsForBox(side,box).some(x=>x.id===id);
}
function consumeBall(side,id){
  const box=ensureActivePlayer(side);
  const item=ballInventory[side].find(x=>x.id===id&&!x.used&&x.ownerBox===box);
  if(item)item.used=true;
}
function ensureSelectedBall(side){
  ensureActivePlayer(side);
  if(isBallAvailable(side,selectedBall[side]))return selectedBall[side];
  const pref=['medium','mediumSoft','soft','hard','superSoft','superHard'];
  selectedBall[side]=pref.find(id=>isBallAvailable(side,id))||availableBallIds(side)[0]||'medium';
  return selectedBall[side];
}
function spawnBall(kind,side,x,y,vx,vy,hardnessId=null){
  const actualHardness=hardnessId||(kind==='jack'?'soft':'medium');
  if(kind==='jack')currentJackHardness=actualHardness;
  const realism=createRealismProfile(kind,actualHardness);
  if(realism)realism.startSpeed=Math.hypot(vx,vy);
  const b={
    kind,side,x,y,z:0,vx,vy,vz:0,r:ballR(),hitCd:0,entered:false,
    hardnessId:actualHardness,
    realism
  };
  if(kind==='jack')jack=b;else balls.push(b);
  return b;
}
function opponent(side){return side==='red'?'blue':'red'}
function controllerName(id){
  if(id==='bot')return 'Бот';
  if(id==='p2')return 'Игрок 2';
  return gameMode==='bot'?'Ты':'Игрок 1';
}
function sideOwnerName(side){
  if(gameMode==='training')return side==='red'?'Красный':'Синий';
  if(gameMode==='puzzle'&&puzzle)return side===puzzle.side?'Ты':'Соперник';
  if(gameMode==='online')return side===onlineSide?'Ты':'Соперник';
  return controllerName(sideController[side]);
}
function isBotSide(side){return gameMode!=='training'&&sideController[side]==='bot'}
function currentSide(){
  if(phase==='red'||phase==='jackRed')return 'red';
  if(phase==='blue'||phase==='jackBlue')return 'blue';
  return null;
}
function humanTurn(){
  const s=currentSide();
  if(gameMode==='online'){
    return !!s&&s===onlineSide&&!preStartPause&&onlineMatchActive&&onlineSocketOpen()&&!onlineConnectionStatus&&!onlinePendingAction&&!onlineAnimating&&!onlineTransitioning;
  }
  return !!s && !isBotSide(s) && !preStartPause;
}
function sidePhase(side,kind='colour'){return kind==='jack'?(side==='red'?'jackRed':'jackBlue'):side}
function launcherFor(side){
  const box=(phase==='jackRed'||phase==='jackBlue')?currentJackBox:ensureActivePlayer(side);
  if(isBotSide(side))return boxCenter(box);
  return launcherPointForBox(box);
}
function ballsLeft(side){return side==='red'?redLeft:blueLeft}
function setBallsLeft(side,n){if(side==='red')redLeft=n;else blueLeft=n}
function sideScore(side){return side==='red'?redScore:blueScore}
function shortOwner(side){
  if(gameMode==='training')return side==='red'?'КР':'СИН';
  const id=sideController[side];
  if(id==='bot')return 'БОТ';
  if(gameMode==='bot')return 'ТЫ';
  if(gameMode==='online')return side===onlineSide?'ТЫ':'СОП';
  return id==='p1'?'И1':'И2';
}
function scheduleBotIfNeeded(kind='colour',delay=560){
  const s=currentSide();
  if(preStartPause||!s||!isBotSide(s))return;
  clearTimeout(botTimer);
  botTimer=setTimeout(()=>{
    if(preStartPause)return;
    if(kind==='jack'||phase==='jackRed'||phase==='jackBlue')botThrowJack(s);
    else botThrowColour(s);
  },delay);
}



