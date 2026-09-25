const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const strategy=fs.readFileSync(__dirname+'/bot-strategy.js','utf8');const rules=fs.readFileSync(__dirname+'/rules.js','utf8');const state=fs.readFileSync(__dirname+'/state.js','utf8');
const c=vm.createContext({console,Math, tieBreak:false,minSpeed:.045,botTargetHistory:{red:[],blue:[]},botProfile:()=>({id:'normal',drawTake:4,hitTake:3,blockTake:2,recoveryTake:0,refinePasses:0,evalNoise:0}),availableBallIds:()=>['superHard','hard','medium','mediumSoft','soft','superSoft'],opponent:s=>s==='red'?'blue':'red',court:()=>({x:0,y:0,w:288,h:600}),ballR:()=>9.216,launcherFor:()=>({x:144,y:550}),throwingY:()=>480,crossPoint:()=>({x:144,y:240}),dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mx:x=>x*48,my:y=>y*48});
vm.runInContext(state.match(/const BALL_TYPES\s*=\s*\[[\s\S]*?\];/)[0]+'const BALL_TYPE_MAP=Object.fromEntries(BALL_TYPES.map(t=>[t.id,t]));function ballType(id){return BALL_TYPE_MAP[id]}function physicsFor(b){return ballType(b.hardnessId)}'+fs.readFileSync(__dirname+'/bot-simulation.js','utf8')+strategy+rules.slice(rules.indexOf('function simulatedScoreCurrentEnd'),rules.indexOf('function finishEnd')),c);
const ball=(kind,x,y,hardnessId)=>({kind,side:kind,x,y,z:0,vx:0,vy:0,vz:0,r:9.216,hardnessId});
for(const y of [180,260,340]){c.jack=ball('jack',144,y,'soft');c.balls=[ball('red',144,y+18.5,'superSoft')];const out=vm.runInContext(`(()=>{const ctx=botContext('blue'),profile=botProfile();const draw=makeCandidateTo(144,jack.y,1,'blue','superSoft');const hit=makeCandidateTo(144,jack.y+18.5,1.12,'blue','superHard');const scores=[draw,hit].map(x=>scoreBotCandidate(simulateBotCandidate(x,'blue'),'blue',x,ctx,profile));const chosen=chooseBestBotShot('blue');const after=simulateBotCandidate(chosen,'blue');return {scores,chosen,selectedScore:scoreBotCandidate(after,"blue",chosen,ctx,profile),points:simulatedScoreCurrentEnd(after),moved:Math.hypot((after.balls.find(b=>b._simId==='b0')||{x:999,y:999}).x-balls[0].x,(after.balls.find(b=>b._simId==='b0')||{x:999,y:999}).y-balls[0].y)};})()`,c);assert(out.scores.every(Number.isFinite));assert.notEqual(out.scores[0],out.scores[1]);assert(out.selectedScore>=Math.max(...out.scores));assert(out.moved>9.216*.1||out.points.blue>out.points.red);console.log("PASS: finite ranking and successful displacement or winning position at",y);}

// An empty end is an opening draw, never a losing position needing a drive.
for(const y of [180,260,340]){
  c.jack=ball('jack',144,y,'soft');c.balls=[];
  assert.equal(vm.runInContext("botContext('blue').losing",c),false);
  const chosen=vm.runInContext("chooseBestBotShot('blue')",c);
  assert(['superSoft','soft','mediumSoft','medium'].includes(chosen.hardnessId));
  console.log('PASS: opening draw uses',chosen.hardnessId,'at',y);
}
c.availableBallIds=()=>['hard','superHard'];
assert.equal(vm.runInContext("chooseBestBotShot('blue').hardnessId",c),'hard');
console.log('PASS: hard-only inventory can still draw');
const levels=vm.runInContext('('+state.match(/const BOT_LEVELS=(\{[\s\S]*?\n\})/)[1]+')',c);
c.availableBallIds=()=>['superHard','hard','medium','mediumSoft','soft','superSoft'];
for(const profile of Object.values(levels)){
  c.botProfile=()=>({...profile,evalNoise:0});
  const shot=vm.runInContext("chooseBestBotShot('blue')",c);
  assert(['superSoft','soft','mediumSoft','medium'].includes(shot.hardnessId));
  console.log('PASS: opening draw at difficulty',profile.id,shot.hardnessId);
}
