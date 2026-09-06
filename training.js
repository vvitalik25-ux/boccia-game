function trainingPlacedCount(side){
  return balls.filter(b=>b.kind===side).length;
}
function clampTrainingRemaining(side,n){
  const max=Math.max(0,6-trainingPlacedCount(side));
  trainingRemaining[side]=Math.max(0,Math.min(max,n));
}
function syncTrainingRemainingToPlaced(side){
  // Preserve the user's manually selected number of remaining balls.
  // Only clamp it if the number of balls already on court makes it impossible.
  clampTrainingRemaining(side,trainingRemaining[side]);
}
function trainingStateCopy(){
  return{
    jack:jack?{...jack}:null,
    balls:balls.map(b=>({...b})),
    remaining:{...trainingRemaining},
    activeSide:trainingActiveSide,
    tool:trainingTool,
    hardness:trainingHardness
  };
}
function pushTrainingHistory(){
  trainingHistory.push(trainingStateCopy());
  if(trainingHistory.length>30)trainingHistory.shift();
}
function restoreTrainingState(s){
  if(!s)return;
  jack=s.jack?{...s.jack}:null;
  balls=s.balls.map(b=>({...b}));
  trainingRemaining={...s.remaining};
  trainingActiveSide=s.activeSide;
  trainingTool=s.tool||trainingTool;
  trainingHardness=s.hardness||trainingHardness;
  renderTrainingEditorUI();
}
function renderTrainingEditorUI(){
  const toolNames={jack:'Джек',red:'Красный',blue:'Синий',delete:'Удаление'};
  trainingObjectText.textContent=trainingTool==='red'||trainingTool==='blue'||trainingTool==='jack'
    ?`${toolNames[trainingTool]} · ${ballType(trainingHardness).label}`
    :toolNames[trainingTool];

  [toolJackBtn,toolRedBtn,toolBlueBtn,toolDeleteBtn].forEach(b=>b.classList.remove('active'));
  ({jack:toolJackBtn,red:toolRedBtn,blue:toolBlueBtn,delete:toolDeleteBtn}[trainingTool])?.classList.add('active');

  trainingHardnessEl.innerHTML='';
  for(const t of BALL_TYPES){
    const b=document.createElement('button');
    b.textContent=t.short;
    b.title=t.label;
    if(trainingHardness===t.id)b.classList.add('active');
    b.disabled=!(trainingTool==='red'||trainingTool==='blue'||trainingTool==='jack');
    b.addEventListener('click',()=>{trainingHardness=t.id;renderTrainingEditorUI()});
    trainingHardnessEl.appendChild(b);
  }

  trainRedTurnBtn.classList.toggle('active',trainingActiveSide==='red');
  trainBlueTurnBtn.classList.toggle('active',trainingActiveSide==='blue');

  const rMax=Math.max(0,6-trainingPlacedCount('red'));
  const bMax=Math.max(0,6-trainingPlacedCount('blue'));
  clampTrainingRemaining('red',trainingRemaining.red);
  clampTrainingRemaining('blue',trainingRemaining.blue);
  trainRedRemainText.textContent=`Красных: ${trainingRemaining.red}`;
  trainBlueRemainText.textContent=`Синих: ${trainingRemaining.blue}`;
  trainRedPlus.disabled=trainingRemaining.red>=rMax;
  trainBluePlus.disabled=trainingRemaining.blue>=bMax;
  trainRedMinus.disabled=trainingRemaining.red<=0;
  trainBlueMinus.disabled=trainingRemaining.blue<=0;
}
function lockTrainingStageSize(){
  const h=wrap.getBoundingClientRect().height;
  if(h<=0)return;
  trainingStageHeight=Math.round(h);
  wrap.style.flex=`0 0 ${trainingStageHeight}px`;
  wrap.style.height=`${trainingStageHeight}px`;
  wrap.style.minHeight=`${trainingStageHeight}px`;
  wrap.style.maxHeight=`${trainingStageHeight}px`;
}
function applyTrainingStageSizeLock(){
  if(!trainingStageHeight)return;
  wrap.style.flex=`0 0 ${trainingStageHeight}px`;
  wrap.style.height=`${trainingStageHeight}px`;
  wrap.style.minHeight=`${trainingStageHeight}px`;
  wrap.style.maxHeight=`${trainingStageHeight}px`;
}
function clearTrainingStageSizeLock(){
  trainingStageHeight=null;
  wrap.style.removeProperty('flex');
  wrap.style.removeProperty('height');
  wrap.style.removeProperty('min-height');
  wrap.style.removeProperty('max-height');
}

function startTrainingMode(){
  gameMode='training';
  sideController={red:'p1',blue:'p1'};
  kitConfig={red:defaultKitIds(),blue:defaultKitIds()};
  afterKitSelectionAction=enterTrainingEditor;
  startKitSelection();
}
function enterTrainingEditor(){
  setupOverlay.classList.remove('show');
  clearTimeout(botTimer);
  clearTrainingStageSizeLock();
  resetLauncherPositions();
  trainingEditing=true;
  matchStarted=false;
  phase='trainingEdit';
  balls=[];jack=null;
  redScore=0;blueScore=0;redLeft=0;blueLeft=0;
  trainingRemaining={red:6,blue:6};
  trainingActiveSide='red';
  trainingTool='red';
  trainingHardness='medium';
  trainingHistory=[];
  trainingSnapshot=null;
  lastShot=null;lastColourSide=null;jackNeedsCross=false;
  equidistantSequence=false;equidistantNextSide=null;
  aimPanel.classList.add('hidden');
  trainingPanel.classList.remove('hidden');
  modal.classList.remove('show');
  restartBtn.textContent='↻ Новая игра';
  renderTrainingEditorUI();
  updateUI();
}
function isTrainingPointLegal(p,r=ballR()){
  const c=court();
  return p.x-r>c.x&&p.x+r<c.x+c.w&&p.y-r>c.y&&p.y+r<throwingY();
}
function findTrainingObject(p){
  const objs=jack?[jack,...balls]:[...balls];
  let best=null,bestD=Infinity;
  for(const o of objs){
    const sy=o.y-(o.z||0)*.62;
    const d=Math.hypot(p.x-o.x,p.y-sy);
    if(d<o.r*1.7&&d<bestD){best=o;bestD=d}
  }
  return best;
}
function removeTrainingObject(o){
  if(!o)return;
  if(o===jack)jack=null;
  else{
    const i=balls.indexOf(o);
    if(i>=0){
      const side=o.kind;
      balls.splice(i,1);
      syncTrainingRemainingToPlaced(side);
    }
  }
}
function placeTrainingObject(p){
  if(!isTrainingPointLegal(p)){showToast('Ставь мячи в игровой зоне');return}
  pushTrainingHistory();

  if(trainingTool==='jack'){
    currentJackHardness=trainingHardness||'soft';
    jack={
      kind:'jack',side:'neutral',x:p.x,y:p.y,z:0,vx:0,vy:0,vz:0,
      r:ballR(),hitCd:0,entered:true,hardnessId:currentJackHardness,
      realism:createRealismProfile('jack',currentJackHardness)
    };
  }else if(trainingTool==='red'||trainingTool==='blue'){
    const side=trainingTool;
    if(trainingPlacedCount(side)>=6){
      showToast('На поле уже 6 мячей этого цвета');
      trainingHistory.pop();
      return;
    }
    balls.push({
      kind:side,side,x:p.x,y:p.y,z:0,vx:0,vy:0,vz:0,r:ballR(),
      hitCd:0,entered:true,hardnessId:trainingHardness,
      realism:createRealismProfile(side,trainingHardness)
    });
    syncTrainingRemainingToPlaced(side);
  }
  renderTrainingEditorUI();
}
function prepareTrainingInventory(){
  resetBallInventory();
  for(const side of ['red','blue']){
    // First consume balls matching those already placed, where possible.
    const placed=balls.filter(b=>b.kind===side);
    for(const pb of placed){
      const match=ballInventory[side].find(x=>!x.used&&x.id===pb.hardnessId);
      if(match)match.used=true;
      else{
        const fallback=ballInventory[side].find(x=>!x.used);
        if(fallback)fallback.used=true;
      }
    }
    const targetUsed=6-trainingRemaining[side];
    while(ballInventory[side].filter(x=>x.used).length<targetUsed){
      const next=ballInventory[side].findLast?ballInventory[side].findLast(x=>!x.used):[...ballInventory[side]].reverse().find(x=>!x.used);
      if(!next)break;
      next.used=true;
    }
    trainingRemaining[side]=Math.min(trainingRemaining[side],ballInventory[side].filter(x=>!x.used).length);
    ensureSelectedBall(side);
  }
}
function beginTrainingSituation(){
  if(!jack){showToast('Сначала поставь джек');return}
  if(trainingRemaining[trainingActiveSide]<=0){
    showToast('У стороны, которая ходит, нет мячей');
    return;
  }

  // The editor panel is much taller than the play controls. Without a lock,
  // hiding it gives the freed space to #stageWrap and the court visibly grows.
  // Freeze the court at its editor size for the whole training situation.
  if(phase==='trainingEdit'&&!trainingStageHeight)lockTrainingStageSize();

  trainingSnapshot=trainingStateCopy();
  prepareTrainingInventory();
  redLeft=trainingRemaining.red;
  blueLeft=trainingRemaining.blue;
  phase=trainingActiveSide;
  trainingEditing=false;
  matchStarted=true;
  lastShot=null;lastColourSide=opponent(trainingActiveSide);jackNeedsCross=false;
  equidistantSequence=false;equidistantNextSide=null;
  trainingPanel.classList.add('hidden');
  aimPanel.classList.remove('hidden');
  restartBtn.textContent='✎ Редактор';
  applyTrainingStageSizeLock();
  resize();
  updateUI();
}
function restoreTrainingEditor(){
  if(trainingSnapshot)restoreTrainingState(trainingSnapshot);
  applyTrainingStageSizeLock();
  trainingEditing=true;
  matchStarted=false;
  phase='trainingEdit';
  for(const o of (jack?[jack,...balls]:balls)){
    o.vx=o.vy=o.vz=0;
  }
  trainingPanel.classList.remove('hidden');
  aimPanel.classList.add('hidden');
  modal.classList.remove('show');
  restartBtn.textContent='↻ Новая игра';
  applyTrainingStageSizeLock();
  resize();
  updateUI();
}
function repeatTrainingSituation(){
  if(!trainingSnapshot){restoreTrainingEditor();return}
  restoreTrainingState(trainingSnapshot);
  beginTrainingSituation();
}

