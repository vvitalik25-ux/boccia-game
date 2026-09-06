const canvas=document.getElementById('game'),ctx=canvas.getContext('2d'),wrap=document.getElementById('stageWrap');
const statusEl=document.getElementById('status'),roundEl=document.getElementById('roundText');
const redScoreEl=document.getElementById('redScore'),blueScoreEl=document.getElementById('blueScore');
const redNameEl=document.getElementById('redName'),blueNameEl=document.getElementById('blueName');
const hintEl=document.getElementById('hint'),toastEl=document.getElementById('toast');
const startNoticeEl=document.getElementById('startNotice'),startNoticeTitleEl=document.getElementById('startNoticeTitle'),startNoticeTextEl=document.getElementById('startNoticeText'),startNoticeHintEl=document.getElementById('startNoticeHint');
const angleSlider=document.getElementById('angleSlider'),powerSlider=document.getElementById('powerSlider');
const ballTypeText=document.getElementById('ballTypeText'),ballSelectEl=document.getElementById('ballSelect');
const playerChoiceWrap=document.getElementById('playerChoiceWrap'),playerChoicesEl=document.getElementById('playerChoices'),playerChoiceText=document.getElementById('playerChoiceText');
const throwBtn=document.getElementById('throwBtn');
const declineBtn=document.getElementById('declineBtn');
const puzzleExitBtn=document.getElementById('puzzleExitBtn');
const restartBtn=document.getElementById('restartBtn'),againBtn=document.getElementById('againBtn');
const setupOverlay=document.getElementById('setupOverlay'),setupBackBtn=document.getElementById('setupBackBtn'),modeStep=document.getElementById('modeStep'),onlineStep=document.getElementById('onlineStep'),tossStep=document.getElementById('tossStep');
const kitStep=document.getElementById('kitStep'),kitTitle=document.getElementById('kitTitle'),kitSubtitle=document.getElementById('kitSubtitle');
const standardKitBtn=document.getElementById('standardKitBtn'),customKitBtn=document.getElementById('customKitBtn');
const kitGrid=document.getElementById('kitGrid'),kitTotal=document.getElementById('kitTotal'),kitContinueBtn=document.getElementById('kitContinueBtn');
const jackHardnessChoicesEl=document.getElementById('jackHardnessChoices'),jackHardnessTextEl=document.getElementById('jackHardnessText');
const coin=document.getElementById('coin'),tossText=document.getElementById('tossText'),colourChoices=document.getElementById('colourChoices');
const vsBotBtn=document.getElementById('vsBotBtn'),localBtn=document.getElementById('localBtn'),onlineBtn=document.getElementById('onlineBtn'),trainingBtn=document.getElementById('trainingBtn'),puzzleBtn=document.getElementById('puzzleBtn');
const onlineConnectEl=document.getElementById('onlineConnect'),onlineLobbyEl=document.getElementById('onlineLobby'),onlineCreateBtn=document.getElementById('onlineCreateBtn'),onlineJoinBtn=document.getElementById('onlineJoinBtn'),onlineRoomInput=document.getElementById('onlineRoomInput'),onlineRoomCodeEl=document.getElementById('onlineRoomCode'),onlineCopyBtn=document.getElementById('onlineCopyBtn'),onlineStatusEl=document.getElementById('onlineStatus'),onlineReadyBtn=document.getElementById('onlineReadyBtn'),onlineRedPlayerEl=document.getElementById('onlineRedPlayer'),onlineBluePlayerEl=document.getElementById('onlineBluePlayer'),onlineRedDot=document.getElementById('onlineRedDot'),onlineBlueDot=document.getElementById('onlineBlueDot'),onlineBadge=document.getElementById('onlineBadge');
const formatIndividualBtn=document.getElementById('formatIndividualBtn'),formatPairsBtn=document.getElementById('formatPairsBtn'),formatTeamsBtn=document.getElementById('formatTeamsBtn'),formatHelp=document.getElementById('formatHelp');
const fieldVerticalBtn=document.getElementById('fieldVerticalBtn'),fieldHorizontalBtn=document.getElementById('fieldHorizontalBtn'),orientationInfoEl=document.getElementById('orientationInfo');
const realismToggleBtn=document.getElementById('realismToggleBtn'),realismInfoEl=document.getElementById('realismInfo');
const aiEasyBtn=document.getElementById('aiEasyBtn'),aiMediumBtn=document.getElementById('aiMediumBtn'),aiHardBtn=document.getElementById('aiHardBtn'),aiExpertBtn=document.getElementById('aiExpertBtn'),aiInfoEl=document.getElementById('aiInfo');
const allocationStep=document.getElementById('allocationStep'),allocationTitle=document.getElementById('allocationTitle'),allocationSubtitle=document.getElementById('allocationSubtitle');
const allocationPlayersEl=document.getElementById('allocationPlayers'),allocationBallsEl=document.getElementById('allocationBalls'),allocationContinueBtn=document.getElementById('allocationContinueBtn'),allocationHelp=document.getElementById('allocationHelp');
const allocationResetBtn=document.getElementById('allocationResetBtn');
const pickRedBtn=document.getElementById('pickRedBtn'),pickBlueBtn=document.getElementById('pickBlueBtn');
const modal=document.getElementById('modal'),modalTitle=document.getElementById('modalTitle'),modalText=document.getElementById('modalText');
const aimPanel=document.getElementById('aimPanel'),trainingPanel=document.getElementById('trainingPanel');
const trainingObjectText=document.getElementById('trainingObjectText'),trainingHardnessEl=document.getElementById('trainingHardness');
const toolJackBtn=document.getElementById('toolJackBtn'),toolRedBtn=document.getElementById('toolRedBtn'),toolBlueBtn=document.getElementById('toolBlueBtn'),toolDeleteBtn=document.getElementById('toolDeleteBtn');
const trainRedTurnBtn=document.getElementById('trainRedTurnBtn'),trainBlueTurnBtn=document.getElementById('trainBlueTurnBtn');
const trainRedRemainText=document.getElementById('trainRedRemainText'),trainBlueRemainText=document.getElementById('trainBlueRemainText');
const trainRedMinus=document.getElementById('trainRedMinus'),trainRedPlus=document.getElementById('trainRedPlus');
const trainBlueMinus=document.getElementById('trainBlueMinus'),trainBluePlus=document.getElementById('trainBluePlus');
const trainingUndoBtn=document.getElementById('trainingUndoBtn'),trainingClearBtn=document.getElementById('trainingClearBtn'),trainingStartBtn=document.getElementById('trainingStartBtn'),trainingBackBtn=document.getElementById('trainingBackBtn');

let W=0,H=0,DPR=1,displayW=0,displayH=0;
let fieldOrientation='vertical';
let balls=[],jack=null,phase='jackRed';
let redLeft=6,blueLeft=6,redScore=0,blueScore=0,endNo=1,totalEnds=4,matchFormat='individual',currentJackBox=3;
let activePlayerBox={red:3,blue:4};
let firstColourLockedBox={red:null,blue:null};
let settleFrames=0,botTimer=null;
let aimAngle=0,aimPower=.50,lastShot=null,lastColourSide=null,jackNeedsCross=false;
let equidistantSequence=false,equidistantNextSide=null;
let tieBreak=false,tieFirst=null;
let botJackHistory=[];
let botTargetHistory={red:[],blue:[]};
let gameMode='bot';
let sideController={red:'p1',blue:'bot'};
const ONLINE_SERVER='wss://boccia-online.v-vitalik25.workers.dev';
const ONLINE_HTTP='https://boccia-online.v-vitalik25.workers.dev';
const ONLINE_PROTOCOL='exact-1v1-v4';
const APP_BUILD='2026-09-06-online-stability-1';
const VERSION_CHECK_URL=`${ONLINE_HTTP}/version`;
let appVersionCheckPromise=null;
let appLastVersionCheckAt=0;
let appVersionReloading=false;
let onlineSocket=null;
let onlineConnectionStatus='';
let onlineWatchdogTimer=null;
let onlineLastResponseAt=0;
let onlineReconnectAttempts=0;
let onlineMatchId=null;
let onlinePhysicsProfile=null;
let onlineLatestSnapshot=null;
let onlineRoomCode='';
let onlinePlayerId=null;
let onlineSide=null;
let onlinePlayers=[];
let onlineReady=false;
let onlineGameStartSent=false;
let onlineMatchActive=false;
let onlineRemoteMoving=false;
let onlineAuthority=false;

// SERVER GAME: browser = controller + renderer only.
let onlineRevision=0;
let onlinePendingAction=null;
let onlineActionRetryTimer=null;
let onlineSyncTimer=null;
let onlineReconnectTimer=null;
let onlineManualDisconnect=false;
let onlineCreatingRoom=false;

// Server-driven playback only. This never changes game rules.
let onlineAnimating=false;
let onlineAnimationTimer=null; // requestAnimationFrame id
let onlineAnimationRevision=0;
let onlineDeferredSnapshot=null;
let onlineEventTimers=[];
let onlineTransitioning=false;
let onlineTransitionTimer=null;
let onlineAnimationMeta=null;
let onlineAnimationEvents=[];

let onlineClientKey=(()=>{
  try{
    let k=localStorage.getItem('bocciaOnlineClientKey');
    if(!k){
      k=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
      localStorage.setItem('bocciaOnlineClientKey',k);
    }
    return k;
  }catch{
    return crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
  }
})();

let tossWinner='p1';
let matchStarted=false;
let afterKitSelectionAction=null;
let trainingEditing=false;
let trainingTool='red';
let trainingHardness='medium';
let trainingActiveSide='red';
let trainingRemaining={red:6,blue:6};
let trainingHistory=[];
let trainingDrag=null;
let trainingPointerDown=null;
let trainingSnapshot=null;
let trainingStageHeight=null;
let setupHistory=[];
let setupTimers=[];
let launcherPositions={1:{u:.5,v:.54},2:{u:.5,v:.54},3:{u:.5,v:.54},4:{u:.5,v:.54},5:{u:.5,v:.54},6:{u:.5,v:.54}};
let preStartPause=false;
let realisticMode=false;
let botDifficulty='expert';
const BOT_LEVELS={
  easy:{
    id:'easy',label:'Легко',
    desc:'Огромный разброс: частые недокаты, перекаты и сильные ошибки по направлению.',
    drawTake:2,hitTake:1,blockTake:1,recoveryTake:1,
    topRefine:1,refinePasses:0,evalNoise:8,
    angleError:.17,speedError:.26,speedBias:1.00,
    grossMissChance:.44,grossAngleError:.34,grossSpeedError:.48,
    jackJitterX:.120,jackJitterY:.105,
    sameScoreImprove:95
  },
  medium:{
    id:'medium',label:'Средне',
    desc:'Заметный разброс: иногда недокатывает, перекатывает или уходит в сторону.',
    drawTake:3,hitTake:2,blockTake:2,recoveryTake:1,
    topRefine:4,refinePasses:1,evalNoise:3.5,
    angleError:.080,speedError:.13,speedBias:1.005,
    grossMissChance:.20,grossAngleError:.17,grossSpeedError:.26,
    jackJitterX:.060,jackJitterY:.050,
    sameScoreImprove:58
  },
  hard:{
    id:'hard',label:'Сложно',
    desc:'Сильный игрок: хорошая тактика и небольшие ошибки исполнения.',
    drawTake:4,hitTake:3,blockTake:2,recoveryTake:2,
    topRefine:7,refinePasses:2,evalNoise:1.0,
    angleError:.032,speedError:.050,speedBias:1.015,
    grossMissChance:.055,grossAngleError:.080,grossSpeedError:.11,
    jackJitterX:.026,jackJitterY:.022,
    sameScoreImprove:32
  },
  expert:{
    id:'expert',label:'Эксперт',
    desc:'Топ-уровень: глубокий просчёт, точное исполнение, силовые разбивания и не более 4% небольших ошибок.',
    drawTake:4,hitTake:3,blockTake:3,recoveryTake:3,
    topRefine:9,refinePasses:4,evalNoise:0,
    angleError:0,speedError:0,speedBias:1.00,
    executionErrorChance:.04,
    grossMissChance:0,grossAngleError:.008,grossSpeedError:.012,
    jackJitterX:0,jackJitterY:0,
    sameScoreImprove:6
  }
}
let puzzle=null;
let puzzleSnapshot=null;
let puzzleLastSuccess=false;
let puzzleSerial=0;

const BALL_TYPES=[
  {id:'superHard', label:'Super Hard', short:'SH', decel:.060, restitution:.58, damping:.95, mass:1.14},
  {id:'hard', label:'Hard', short:'H', decel:.071, restitution:.51, damping:.93, mass:1.09},
  {id:'medium', label:'Medium', short:'M', decel:.085, restitution:.43, damping:.89, mass:1.03},
  {id:'mediumSoft', label:'Medium Soft', short:'MS', decel:.098, restitution:.35, damping:.85, mass:.99},
  {id:'soft', label:'Soft', short:'S', decel:.113, restitution:.27, damping:.80, mass:.95},
  {id:'superSoft', label:'Super Soft', short:'SS', decel:.130, restitution:.19, damping:.75, mass:.91}
];
const BALL_TYPE_MAP=Object.fromEntries(BALL_TYPES.map(t=>[t.id,t]));
let ballInventory={red:[],blue:[]};
let selectedBall={red:'medium',blue:'medium'};
let kitConfig={red:BALL_TYPES.map(t=>t.id),blue:BALL_TYPES.map(t=>t.id)};
let pendingKitSide='red';
let pendingKitMode='standard';
let pendingKitCounts={};
let jackHardness={red:'soft',blue:'soft'};
let pendingJackHardness='soft';
let currentJackHardness='soft';
let kitQueue=[];
let allocationQueue=[];
let allocationSide='red';
let allocationSelectedBox=null;
let allocationWorking={};
let ballAllocation={red:{3:[]},blue:{4:[]}};
const minSpeed=.045;

