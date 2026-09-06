function syncAimFromSliders(){
  if(!humanTurn())return;
  aimAngle=sliderValueToAngle(Number(angleSlider.value)||0);
  aimPower=sliderValueToPower(Number(powerSlider.value)||0);
  updateUI();
}
angleSlider.addEventListener('input',syncAimFromSliders);
powerSlider.addEventListener('input',syncAimFromSliders);

function canvasPoint(e){
  const r=canvas.getBoundingClientRect();
  const px=(e.clientX-r.left)*(displayW/Math.max(1,r.width));
  const py=(e.clientY-r.top)*(displayH/Math.max(1,r.height));
  if(fieldOrientation==='horizontal'){
    return{x:py,y:H-px};
  }
  return{x:px,y:py};
}
canvas.addEventListener('pointerdown',e=>{
  if(phase!=='trainingEdit'){
    if(!humanTurn()||phase==='moving')return;
    const p=canvasPoint(e);
    if(moveLauncherToPoint(p)){
      e.preventDefault();
      updateUI();
    }
    return;
  }
  e.preventDefault();
  const p=canvasPoint(e);
  trainingPointerDown=p;
  const hit=findTrainingObject(p);

  if(trainingTool==='delete'){
    if(hit){
      pushTrainingHistory();
      removeTrainingObject(hit);
      renderTrainingEditorUI();
    }
    return;
  }

  if(hit){
    pushTrainingHistory();
    trainingDrag={obj:hit,start:{x:hit.x,y:hit.y,z:hit.z||0},moved:false};
    canvas.setPointerCapture?.(e.pointerId);
  }
});
canvas.addEventListener('pointermove',e=>{
  if(phase!=='trainingEdit'||!trainingDrag)return;
  e.preventDefault();
  const p=canvasPoint(e);
  if(!isTrainingPointLegal(p,trainingDrag.obj.r))return;
  trainingDrag.obj.x=p.x;
  trainingDrag.obj.y=p.y;
  trainingDrag.obj.z=0;
  trainingDrag.obj.vx=trainingDrag.obj.vy=trainingDrag.obj.vz=0;
  if(trainingPointerDown&&Math.hypot(p.x-trainingPointerDown.x,p.y-trainingPointerDown.y)>3)trainingDrag.moved=true;
});
canvas.addEventListener('pointerup',e=>{
  if(phase!=='trainingEdit')return;
  e.preventDefault();
  const p=canvasPoint(e);
  if(trainingDrag){
    const wasMoved=trainingDrag.moved;
    trainingDrag=null;
    trainingPointerDown=null;
    if(wasMoved)renderTrainingEditorUI();
    return;
  }
  if(trainingTool!=='delete')placeTrainingObject(p);
  trainingPointerDown=null;
});
canvas.addEventListener('pointercancel',()=>{
  if(phase!=='trainingEdit')return;
  trainingDrag=null;trainingPointerDown=null;
});

throwBtn.addEventListener('click',launchHuman);
startNoticeEl.addEventListener('click',finishPreStartPause);
startNoticeEl.addEventListener('pointerdown',e=>e.stopPropagation());
declineBtn.addEventListener('click',declineRemaining);

vsBotBtn.addEventListener('click',()=>{
  beginColourToss('bot');
});
localBtn.addEventListener('click',()=>beginColourToss('local'));
onlineBtn?.addEventListener('click',onlineOpenSetup);
onlineCreateBtn?.addEventListener('click',onlineCreateRoom);
onlineJoinBtn?.addEventListener('click',()=>onlineJoinRoom(onlineRoomInput.value));
onlineRoomInput?.addEventListener('input',e=>{if(!e.isComposing)onlineRoomInput.value=onlineNormalizeRoomCode(onlineRoomInput.value)});
onlineRoomInput?.addEventListener('compositionend',()=>{onlineRoomInput.value=onlineNormalizeRoomCode(onlineRoomInput.value)});
onlineRoomInput?.addEventListener('keydown',e=>{if(e.key==='Enter')onlineJoinRoom(onlineRoomInput.value)});
onlineCopyBtn?.addEventListener('click',async()=>{
  if(!onlineRoomCode)return;
  try{await navigator.clipboard.writeText(onlineRoomCode);showToast('Код скопирован')}
  catch{showToast(`Код: ${onlineRoomCode}`)}
});
onlineReadyBtn?.addEventListener('click',()=>{
  if(!onlineSide||!onlineSocketOpen()||onlineMatchActive||onlinePendingAction)return;
  onlineQueueAction('ready',{ready:!onlineReady});
});
trainingBtn.addEventListener('click',()=>{
  pushSetupHistory();
  setFormat('individual');
  startTrainingMode();
});
puzzleBtn.addEventListener('click',()=>{
  setFormat('individual');
  startRandomPuzzle();
});
setupBackBtn.addEventListener('click',setupGoBack);
trainingBackBtn.addEventListener('click',setupGoBack);
realismToggleBtn?.addEventListener('click',()=>{
  realisticMode=!realisticMode;
  renderFormatButtons();
});
aiEasyBtn?.addEventListener('click',()=>setBotDifficulty('easy'));
aiMediumBtn?.addEventListener('click',()=>setBotDifficulty('medium'));
aiHardBtn?.addEventListener('click',()=>setBotDifficulty('hard'));
aiExpertBtn?.addEventListener('click',()=>setBotDifficulty('expert'));
fieldVerticalBtn?.addEventListener('click',()=>setFieldOrientation('vertical'));
fieldHorizontalBtn?.addEventListener('click',()=>setFieldOrientation('horizontal'));
formatIndividualBtn.addEventListener('click',()=>setFormat('individual'));
formatPairsBtn.addEventListener('click',()=>setFormat('pairs'));
formatTeamsBtn.addEventListener('click',()=>setFormat('teams'));
pickRedBtn.addEventListener('click',()=>chooseTossColour('red'));
pickBlueBtn.addEventListener('click',()=>chooseTossColour('blue'));
standardKitBtn.addEventListener('click',()=>setPendingKitMode('standard'));
customKitBtn.addEventListener('click',()=>setPendingKitMode('custom'));
kitContinueBtn.addEventListener('click',commitPendingKit);
allocationResetBtn.addEventListener('click',resetAllocation);
allocationContinueBtn.addEventListener('click',commitAllocation);

toolJackBtn.addEventListener('click',()=>{trainingTool='jack';trainingHardness='soft';renderTrainingEditorUI()});
toolRedBtn.addEventListener('click',()=>{trainingTool='red';renderTrainingEditorUI()});
toolBlueBtn.addEventListener('click',()=>{trainingTool='blue';renderTrainingEditorUI()});
toolDeleteBtn.addEventListener('click',()=>{trainingTool='delete';renderTrainingEditorUI()});
trainRedTurnBtn.addEventListener('click',()=>{trainingActiveSide='red';renderTrainingEditorUI()});
trainBlueTurnBtn.addEventListener('click',()=>{trainingActiveSide='blue';renderTrainingEditorUI()});
trainRedMinus.addEventListener('click',()=>{clampTrainingRemaining('red',trainingRemaining.red-1);renderTrainingEditorUI()});
trainRedPlus.addEventListener('click',()=>{clampTrainingRemaining('red',trainingRemaining.red+1);renderTrainingEditorUI()});
trainBlueMinus.addEventListener('click',()=>{clampTrainingRemaining('blue',trainingRemaining.blue-1);renderTrainingEditorUI()});
trainBluePlus.addEventListener('click',()=>{clampTrainingRemaining('blue',trainingRemaining.blue+1);renderTrainingEditorUI()});
trainingUndoBtn.addEventListener('click',()=>{
  const s=trainingHistory.pop();
  if(s)restoreTrainingState(s);
});
trainingClearBtn.addEventListener('click',()=>{
  pushTrainingHistory();
  balls=[];jack=null;trainingRemaining={red:6,blue:6};
  renderTrainingEditorUI();
});
trainingStartBtn.addEventListener('click',beginTrainingSituation);


puzzleExitBtn?.addEventListener('click',()=>{
  modal.classList.remove('show');
  startNoticeEl.classList.remove('show');
  preStartPause=false;
  showSetup();
});
restartBtn.addEventListener('click',()=>{
  if(gameMode==='online'){
    onlineSend('restart',{actionId:onlineMakeActionId()});
    setTimeout(()=>{onlineDisconnect(true);showSetup()},120);
    return;
  }
  if(gameMode==='training'&&phase!=='trainingEdit')restoreTrainingEditor();
  else if(gameMode==='puzzle')startRandomPuzzle();
  else showSetup();
});
againBtn.addEventListener('click',()=>{
  modal.classList.remove('show');
  if(gameMode==='training'&&trainingSnapshot)repeatTrainingSituation();
  else if(gameMode==='online'){
    onlineSend('restart',{actionId:onlineMakeActionId()});
    setTimeout(()=>{onlineDisconnect(true);showSetup()},120);
  }
  else if(gameMode==='puzzle'){
    if(puzzleLastSuccess)startRandomPuzzle();
    else repeatPuzzle();
  }else showSetup();
});


// Prevent text/object selection, image dragging, long-press callouts and context menus.
document.addEventListener('selectstart',e=>{if(!e.target.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault()},{passive:false});
document.addEventListener('dragstart',e=>{if(!e.target.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',e=>{if(!e.target.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault()},{passive:false});
document.addEventListener('gesturestart',e=>{if(!e.target.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault()},{passive:false});

