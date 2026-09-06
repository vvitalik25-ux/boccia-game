function realismSoftnessFactor(hardnessId=null){
  const map={superHard:.45,hard:.58,medium:.72,mediumSoft:.87,soft:1.02,superSoft:1.18};
  return map[hardnessId||'soft']??1.02;
}
function createRealismProfile(kind,hardnessId=null){
  if(!realisticMode)return null;
  const softness=realismSoftnessFactor(hardnessId||(kind==='jack'?'soft':'medium'));
  return{
    seed:Math.random()*Math.PI*2,
    phase:Math.random()*Math.PI*2,
    phaseSpeed:.08+softness*.05+Math.random()*.025,
    floorBias:(Math.random()-.5)*.0075*softness,
    wobble:.0034*softness+Math.random()*.0026*softness,
    forward:.0018*softness+Math.random()*.0014*softness,
    decelBias:1+(Math.random()-.5)*.18*softness,
    decelWave:.070*softness+Math.random()*.042*softness,
    releaseAngle:(Math.random()-.5)*(0.016+0.031*softness),
    releaseSpeed:1+((Math.random()-.5)*(0.020+0.038*softness)),
    slowThreshold:.62+Math.random()*.18,
    slipChance:.010*softness+Math.random()*.010*softness,
    slipStrength:.0038*softness+Math.random()*.0042*softness,
    holdFrames:0,
    holdDir:(Math.random()<.5?-1:1)
  };
}
function applyRealismToLaunch(vx,vy,kind,hardnessId=null){
  if(!realisticMode)return {vx,vy};
  const p=createRealismProfile(kind,hardnessId)||{releaseAngle:0,releaseSpeed:1};
  const angle=p.releaseAngle,cos=Math.cos(angle),sin=Math.sin(angle);
  const speed=p.releaseSpeed;
  return{
    vx:(vx*cos-vy*sin)*speed,
    vy:(vx*sin+vy*cos)*speed
  };
}

const FORMAT_CONFIGS={
  individual:{id:'individual',label:'1 × 1',redBoxes:[3],blueBoxes:[4],perPlayer:6,totalEnds:4,jackOrder:[3,4,3,4]},
  pairs:{id:'pairs',label:'Пары',redBoxes:[2,4],blueBoxes:[3,5],perPlayer:3,totalEnds:4,jackOrder:[2,3,4,5]},
  teams:{id:'teams',label:'Тройки',redBoxes:[1,3,5],blueBoxes:[2,4,6],perPlayer:2,totalEnds:6,jackOrder:[1,2,3,4,5,6]}
};
function botProfile(){return BOT_LEVELS[botDifficulty]||BOT_LEVELS.expert}
function setBotDifficulty(id){
  if(!BOT_LEVELS[id])return;
  botDifficulty=id;
  renderFormatButtons();
  if(setupOverlay.classList.contains('show'))showToast(`ИИ: ${BOT_LEVELS[id].label}`);
}
function formatConfig(){return FORMAT_CONFIGS[matchFormat]||FORMAT_CONFIGS.individual}
function sideBoxes(side){return side==='red'?formatConfig().redBoxes:formatConfig().blueBoxes}
function sideForBox(box){return formatConfig().redBoxes.includes(box)?'red':'blue'}
function totalSideBalls(){return formatConfig().perPlayer*sideBoxes('red').length}
function jackBoxForEnd(n){const a=formatConfig().jackOrder;return a[(Math.max(1,n)-1)%a.length]}
function nextJackBoxAfter(box){
  const a=formatConfig().jackOrder;
  const i=a.indexOf(box);
  return a[(i>=0?i+1:0)%a.length];
}
function setFormat(id){
  matchFormat=id;
  totalEnds=formatConfig().totalEnds;
  renderFormatButtons();
}

function renderFieldOrientation(){
  fieldVerticalBtn?.classList.toggle('selected',fieldOrientation==='vertical');
  fieldHorizontalBtn?.classList.toggle('selected',fieldOrientation==='horizontal');
  if(orientationInfoEl){
    orientationInfoEl.textContent=fieldOrientation==='horizontal'
      ?'Поле показано горизонтально. Управление и кнопки остаются на прежних местах.'
      :'Меняется только ориентация поля. Управление остаётся как сейчас.';
  }
}
function setFieldOrientation(value){
  if(value!=='vertical'&&value!=='horizontal')return;
  if(fieldOrientation===value){
    renderFieldOrientation();
    return;
  }
  fieldOrientation=value;
  renderFieldOrientation();
  resize();
  relayoutSoon();
}

function renderFormatButtons(){
  formatIndividualBtn.classList.toggle('selected',matchFormat==='individual');
  formatPairsBtn.classList.toggle('selected',matchFormat==='pairs');
  formatTeamsBtn.classList.toggle('selected',matchFormat==='teams');
  aimPanel?.classList.toggle('multiPlayerFormat',matchFormat!=='individual');
  const c=formatConfig();
  if(c.id==='individual')formatHelp.textContent='1 × 1 · красный бокс 3 · синий бокс 4 · по 6 мячей';
  else if(c.id==='pairs')formatHelp.textContent='Пары · красные 2/4 · синие 3/5 · по 3 мяча каждому';
  else formatHelp.textContent='Тройки · красные 1/3/5 · синие 2/4/6 · по 2 мяча каждому';

  if(realismToggleBtn){
    realismToggleBtn.classList.toggle('on',realisticMode);
    realismToggleBtn.textContent=realisticMode?'ВКЛ':'ВЫКЛ';
  }
  if(realismInfoEl){
    realismInfoEl.textContent=realisticMode
      ?'Режим включён: мячи могут немного уводить из-за неровного пола и формы мяча. Мягкие мячи чувствительнее, жёсткие стабильнее.'
      :'Без случайных уходов. В реалистичном режиме мячи могут немного отклоняться.';
  }

  aiEasyBtn?.classList.toggle('selected',botDifficulty==='easy');
  aiMediumBtn?.classList.toggle('selected',botDifficulty==='medium');
  aiHardBtn?.classList.toggle('selected',botDifficulty==='hard');
  aiExpertBtn?.classList.toggle('selected',botDifficulty==='expert');

  if(aiInfoEl){
    const p=botProfile();
    aiInfoEl.textContent=`${p.label}: ${p.desc}`;
  }

  renderFieldOrientation();
}

