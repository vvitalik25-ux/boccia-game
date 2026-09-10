const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'bootstrap.js'),'utf8').split('// Automatic freshness check')[0];
for(const hz of [30,60,90,120,144,240]){let count=0;const c=vm.createContext({document:{hidden:false,addEventListener(){}},performance:{now:()=>0},physics(){count++},draw(){},requestAnimationFrame(){}});vm.runInContext(src,c);for(let i=0;i<=hz*5;i++)c.loop(i*1000/hz);assert.equal(count,300,'Hz '+hz);c.loop(60000);assert.equal(count,300,'No catch-up burst');}
console.log('PASS: equal simulation at 30/60/90/120/144/240 Hz; no background catch-up burst');
