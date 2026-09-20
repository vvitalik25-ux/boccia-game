const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
function fn(file,name){const s=fs.readFileSync(__dirname+'/'+file,'utf8');const start=s.indexOf('function '+name+'(');assert(start>=0,name);const end=s.indexOf('\nfunction ',start+10);return s.slice(start,end<0?undefined:end);}
function harness(){
 let timers=[],id=0;
 const c=vm.createContext({console,gameMode:'bot',phase:'moving',tieBreak:false,tieFirst:null,redScore:1,blueScore:0,endNo:4,totalEnds:4,redLeft:0,blueLeft:0,botTimer:null,matchStarted:true,ballInventory:{red:[],blue:[]},jack:{},scoreCurrentEnd:()=>({red:0,blue:1}),updateUI(){},showToast(){},sideOwnerName:s=>s==='blue'?'Бот':'Ты',setBallsLeft(s,n){c[s+'Left']=n},placeJackOnCross(){},setTimeout(f){const t={id:++id,f};timers.push(t);return t.id},clearTimeout(n){timers=timers.filter(t=>t.id!==n)},startTieBreak(side){c.ties=(c.ties||0)+1;c.phase=side;c.tieBreak=true},finishMatch(side){c.winner=side;c.phase='finished'},startRegulationEnd(){c.phase='jackRed'}});
 const rules=fs.readFileSync(__dirname+'/rules.js','utf8');
 if(rules.includes('function cancelEndTransition('))vm.runInContext(rules.slice(0,rules.indexOf('function isInsideBoundary(')),c);
 vm.runInContext(fn('rules.js','finishEnd')+'\n'+fn('match-clock.js','expireLocalSide'),c);
 return {c,run(){const pending=timers;timers=[];for(const t of pending)t.f()},count:()=>timers.length};
}
// Last pair's ball settles as its six-minute clock expires. Both paths resolve the end.
let h=harness();h.c.finishEnd();h.c.expireLocalSide('blue');
assert.equal(h.c.blueScore,1,'end must be scored once');assert.equal(h.count(),1,'one end transition');h.run();
assert.equal(h.c.ties,1,'draw starts tie-break');assert.equal(h.c.winner,undefined,'bot must not win without tie-break');
// Going to menu / resetting a match invalidates a queued result.
h=harness();h.c.finishEnd();h.c.cancelEndTransition();h.run();assert.equal(h.c.ties,undefined);
// A late second finishEnd during the result delay cannot queue a winner.
h=harness();h.c.tieBreak=true;h.c.finishEnd();h.c.finishEnd();assert.equal(h.count(),1);
console.log('PASS: timed pairs last-ball race, score counted once, tie-break starts, stale result canceled');
// Use the real pair tie-break initializer with exhausted inventories from the final end.
const start=vm.createContext({phase:'end',redLeft:0,blueLeft:0,balls:[{side:'blue'}],lastShot:{},clearTimeout(){},botTimer:null,cancelEndTransition(){},resetLocalClock(){start.clock={red:360000,blue:360000}},totalSideBalls:()=>6,resetBallInventory(){start.inventory={red:[1,1,1,1,1,1],blue:[1,1,1,1,1,1]}},crossPoint:()=>({x:10,y:20}),jackHardness:{red:'soft',blue:'soft'},ballR:()=>9,createRealismProfile:()=>null,sideOwnerName:s=>s,updateUI(){},showToast(){},scheduleBotIfNeeded(){start.scheduled=true}});
vm.runInContext(fn('match-setup.js','startTieBreak'),start);
for(const side of ['red','blue']){
 start.startTieBreak(side);assert.equal(start.phase,side);assert.equal(start.balls.length,0);assert.equal(start.redLeft,6);assert.equal(start.blueLeft,6);assert.equal(start.lastShot,null);assert.equal(start.clock.red,360000);assert.equal(start.tieBreak,true);
}
console.log('PASS: real tie-break starts with six fresh balls per side, reset clock, empty court and jack on cross');
// No timer: a delayed winner from the previous end reaches a cleared pair tie-break.
const verdict=vm.createContext({phase:'red',tieBreak:true,redLeft:6,blueLeft:6,endNo:4,totalEnds:4,redScore:3,blueScore:3,updateUI(){},tone(){},sideOwnerName:s=>s,modalTitle:{},modalText:{},modal:{classList:{add(){verdict.shown=true}}},scoreCurrentEnd:()=>({red:0,blue:0})});
vm.runInContext(fn('rules.js','finishMatch'),verdict);
verdict.finishMatch('blue',true);assert.equal(verdict.shown,undefined);assert.equal(verdict.phase,'red');
verdict.phase='end';verdict.redLeft=0;verdict.blueLeft=0;
verdict.finishMatch('blue',true);assert.equal(verdict.shown,undefined,'empty tie-break is not a win');
verdict.scoreCurrentEnd=()=>({red:1,blue:0});verdict.finishMatch('blue',true);assert.equal(verdict.shown,undefined,'stale winner rejected');
verdict.finishMatch('red',true);assert.equal(verdict.shown,true,'legitimate completed tie-break wins');
console.log('PASS: untimed cleared tie-break rejects stale victory; empty or mismatched result rejected; real winner accepted');
