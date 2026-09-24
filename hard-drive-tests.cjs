const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/controls.js','utf8');const c=vm.createContext({aimPower:1,court:()=>({h:600}),BALL_TYPE_MAP:{medium:{decel:.085}}});
vm.runInContext(source.slice(source.indexOf('function speedFromPower('),source.indexOf('function launchHuman(')),c);
for(const h of [250,400,600,900,1200]){c.court=()=>({h});c.aimPower=1;const base=c.speedFromPower();assert(Math.abs(c.speedFromPower('superHard')/base-1.18)<1e-10);assert(Math.abs(c.speedFromPower('hard')/base-1.12)<1e-10);for(const id of ['medium','mediumSoft','soft','superSoft'])assert.equal(c.speedFromPower(id),base);c.aimPower=0;assert.equal(c.speedFromPower('superHard'),4.3);assert.equal(c.speedFromPower('hard'),4.3);}
console.log('PASS: SH +18%, H +12% maximum speed; low-power baseline and other ball types unchanged');
