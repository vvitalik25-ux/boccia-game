function isInsideBoundary(b){
  const c=court();
  return b.x-b.r>c.x && b.x+b.r<c.x+c.w && b.y-b.r>c.y && b.y+b.r<c.y+c.h;
}
function isJackValid(b){
  if(!b||!isInsideBoundary(b))return false;
  return b.y+b.r < vYAtX(b.x);
}
function jackCrossPlacementPoint(){
  const p=crossPoint(),r=ballR();
  const blockers=balls.filter(b=>{
    const dx=b.x-p.x,dy=b.y-p.y;
    return Math.hypot(dx,dy)<r+b.r;
  });
  if(!blockers.length)return p;

  // Rule 10.11.2: if the cross is occupied, place the Jack as close as
  // possible in front of the cross, centred between the side-lines.
  const maxY=throwingY()-r-1;
  for(let y=p.y;y<=maxY;y+=.5){
    const clear=balls.every(b=>Math.hypot(p.x-b.x,y-b.y)>=r+b.r-.05);
    if(clear)return{x:p.x,y};
  }
  return{x:p.x,y:Math.min(maxY,p.y+r*2)};
}
function placeJackOnCross(){
  const p=jackCrossPlacementPoint();
  if(!jack){
    jack={
      kind:'jack',side:'neutral',x:p.x,y:p.y,z:0,vx:0,vy:0,vz:0,
      r:ballR(),hitCd:0,entered:true,hardnessId:currentJackHardness||'soft',
      realism:createRealismProfile('jack',currentJackHardness||'soft')
    };
  }else{
    jack.x=p.x;jack.y=p.y;jack.z=0;jack.vx=jack.vy=jack.vz=0;jack.entered=true;
    jack.hardnessId=jack.hardnessId||currentJackHardness||'soft';
    currentJackHardness=jack.hardnessId;
    if(realisticMode&&!jack.realism)jack.realism=createRealismProfile('jack',jack.hardnessId);
  }
  jackNeedsCross=false;
}
function resolveJackThrow(){
  const s=lastShot.side,b=jack;
  if(lastShot.fouled||!b||!isJackValid(b)){
    jack=null;
    currentJackBox=nextJackBoxAfter(currentJackBox);
    const nextSide=sideForBox(currentJackBox);
    showToast(`Недействительный джек — следующий бокс ${currentJackBox}`);
    activePlayerBox[nextSide]=currentJackBox;
    phase=sidePhase(nextSide,'jack');updateUI();
    scheduleBotIfNeeded('jack',650);
    return;
  }
  showToast('Джек в игре');
  firstColourLockedBox[s]=currentJackBox;
  activePlayerBox[s]=currentJackBox;
  phase=s;updateUI();
  scheduleBotIfNeeded('colour',560);
}
function sideToPlay(){
  if(redLeft<=0&&blueLeft<=0){equidistantSequence=false;equidistantNextSide=null;return null}
  const reds=balls.filter(b=>b.kind==='red'),blues=balls.filter(b=>b.kind==='blue');
  if(!reds.length&&redLeft>0){equidistantSequence=false;equidistantNextSide=null;return 'red'}
  if(!blues.length&&blueLeft>0){equidistantSequence=false;equidistantNextSide=null;return 'blue'}
  if(redLeft<=0){equidistantSequence=false;equidistantNextSide=null;return 'blue'}
  if(blueLeft<=0){equidistantSequence=false;equidistantNextSide=null;return 'red'}

  const eps=.55,rd=Math.min(...reds.map(b=>dist(b,jack))),bd=Math.min(...blues.map(b=>dist(b,jack)));
  if(Math.abs(rd-bd)<=eps){
    const rc=reds.filter(b=>Math.abs(dist(b,jack)-rd)<=eps).length;
    const bc=blues.filter(b=>Math.abs(dist(b,jack)-bd)<=eps).length;
    if(rc===bc){
      if(!equidistantSequence){
        // On entering an equal-distance situation, the Side that threw last plays again.
        equidistantSequence=true;
        equidistantNextSide=lastColourSide||'red';
      }else{
        // If equality remains after that shot, alternate Sides until it is broken.
        equidistantNextSide=opponent(equidistantNextSide||lastColourSide||'red');
      }
      return equidistantNextSide;
    }
    equidistantSequence=false;equidistantNextSide=null;
    return rc<bc?'red':'blue';
  }
  equidistantSequence=false;equidistantNextSide=null;
  return rd<bd?'blue':'red';
}
function botShouldDecline(side){
  if(!isBotSide(side)||ballsLeft(side)<=0||!jack)return false;
  const opp=opponent(side),profile=botProfile();
  if(ballsLeft(opp)>0)return false;

  const pts=scoreCurrentEnd();
  if(pts[side]<=0)return false;

  // In a tie-break there is no benefit in adding more points. Once the
  // opponent is out of balls and the bot is ahead, the end is already won.
  if(tieBreak&&pts[side]>pts[opp])return true;

  const shot=chooseBestBotShot(side);
  if(shot){
    const currentEval=evaluateBotState(cloneStateForBot(),side);
    const st=simulateBotCandidate(shot,side);
    const nextPts=simulatedScoreCurrentEnd(st);
    const nextEval=evaluateBotState(st,side);

    if(nextPts[side]>pts[side] && nextPts[opp]===0)return false;
    if(nextPts[side]===pts[side] && nextPts[side]>0 && nextEval>currentEval+profile.sameScoreImprove)return false;
  }
  return true;
}
function botDecline(side){
  for(const item of ballInventory[side])item.used=true;
  setBallsLeft(side,0);
  showToast(`Бот отказывается от оставшихся мячей`);
  finishEnd();
}
function resolveColourThrow(){
  if(gameMode==='puzzle'){
    resolvePuzzleThrow();
    return;
  }
  if(jackNeedsCross||!jack||!isJackValid(jack)){
    placeJackOnCross();showToast('Джек на кресте');
  }
  if(redLeft<=0&&blueLeft<=0){finishEnd();return}
  const next=sideToPlay();
  phase=next;updateUI();
  if(next&&botShouldDecline(next)){setTimeout(()=>botDecline(next),420);return}
  scheduleBotIfNeeded('colour',520);
}
function resolveStoppedShot(){
  if(!lastShot)return;
  if(lastShot.kind==='jack')resolveJackThrow();
  else resolveColourThrow();
}

function scoreCurrentEnd(){
  const eps=.55;
  const reds=balls.filter(b=>b.kind==='red').map(b=>dist(b,jack)).sort((a,b)=>a-b);
  const blues=balls.filter(b=>b.kind==='blue').map(b=>dist(b,jack)).sort((a,b)=>a-b);
  const r0=reds[0]??Infinity,b0=blues[0]??Infinity;
  if(!isFinite(r0)&&!isFinite(b0))return{red:0,blue:0};
  if(Math.abs(r0-b0)<=eps){
    return{
      red:reds.filter(d=>Math.abs(d-r0)<=eps).length,
      blue:blues.filter(d=>Math.abs(d-b0)<=eps).length
    };
  }
  if(r0<b0)return{red:reds.filter(d=>d<b0-eps).length,blue:0};
  return{red:0,blue:blues.filter(d=>d<r0-eps).length};
}
function simulatedScoreCurrentEnd(st){
  const eps=.55;
  const reds=st.balls.filter(b=>b.kind==='red').map(b=>simDist(b,st.jack)).sort((a,b)=>a-b);
  const blues=st.balls.filter(b=>b.kind==='blue').map(b=>simDist(b,st.jack)).sort((a,b)=>a-b);
  const r0=reds[0]??Infinity,b0=blues[0]??Infinity;
  if(!isFinite(r0)&&!isFinite(b0))return{red:0,blue:0};
  if(Math.abs(r0-b0)<=eps){
    return{
      red:reds.filter(d=>Math.abs(d-r0)<=eps).length,
      blue:blues.filter(d=>Math.abs(d-b0)<=eps).length
    };
  }
  if(r0<b0)return{red:reds.filter(d=>d<b0-eps).length,blue:0};
  return{red:0,blue:blues.filter(d=>d<r0-eps).length};
}
function finishEnd(){
  if(gameMode==='training'){
    phase='end';updateUI();
    const pts=scoreCurrentEnd();
    let result='Ситуация завершена.';
    if(pts.red>pts.blue)result=`Красные выигрывают ситуацию: ${pts.red}:${pts.blue}.`;
    else if(pts.blue>pts.red)result=`Синие выигрывают ситуацию: ${pts.blue}:${pts.red}.`;
    else result=`Равная позиция: ${pts.red}:${pts.blue}.`;
    modalTitle.textContent='Тренировка завершена';
    modalText.textContent=result;
    againBtn.textContent='Повторить ситуацию';
    modal.classList.add('show');
    restartBtn.textContent='✎ Редактор';
    return;
  }

  phase='end';updateUI();
  const pts=scoreCurrentEnd();
  if(tieBreak){
    if(pts.red===pts.blue){
      showToast('Тай-брейк равный — ещё один');
      const nextFirst=tieFirst==='red'?'blue':'red';
      setTimeout(()=>startTieBreak(nextFirst),1450);
    }else{
      const winner=pts.red>pts.blue?'red':'blue';
      showToast(`Тай-брейк выиграл ${sideOwnerName(winner)}`);
      setTimeout(()=>finishMatch(winner,true),1450);
    }
    return;
  }

  redScore+=pts.red;blueScore+=pts.blue;updateUI();
  if(pts.red>0&&pts.blue>0)showToast(`Энд: ${pts.red}:${pts.blue}`);
  else if(pts.red>0)showToast(`${sideOwnerName('red')}: +${pts.red}`);
  else if(pts.blue>0)showToast(`${sideOwnerName('blue')}: +${pts.blue}`);
  else showToast('Энд без очков');

  setTimeout(()=>{
    if(endNo>=totalEnds){
      if(redScore===blueScore){
        const first=Math.random()<.5?'red':'blue';
        startTieBreak(first);
      }else finishMatch(redScore>blueScore?'red':'blue',false);
    }else{
      endNo++;startRegulationEnd();
    }
  },1450);
}
function finishMatch(winner,byTieBreak){
  phase='finished';updateUI();
  modalTitle.textContent=`${sideOwnerName(winner)} победил! 🏆`;
  modalText.textContent=byTieBreak
    ?`Основной матч ${redScore}:${blueScore}. Победитель определён в тай-брейке.`
    :`Финальный счёт ${redScore}:${blueScore}.`;
  modal.classList.add('show');tone(640,.16,.04);
}

