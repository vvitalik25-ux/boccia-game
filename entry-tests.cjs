const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'online.js'),'utf8');
function fn(name){const at=source.indexOf('function '+name+'(');const start=source.slice(at-6,at)==='async '?at-6:at;const tail=source.slice(start);const end=tail.slice(10).search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end+10)}
function setup(){let resolve;const c=vm.createContext({console:{warn(){}},navigator:{onLine:true},URLSearchParams,encodeURIComponent,onlineEntryBusy:false,onlineEntryGeneration:0,onlineCreatingRoom:false,onlineConnectionStatus:'',onlineClientKey:'test',APP_BUILD:'b',ONLINE_PROTOCOL:'p',ONLINE_HTTP:'https://test',fieldOrientation:'vertical',realisticMode:false,renderOnlineLobby(){},renderFormatButtons(){},court:()=>({w:288,h:600}),ballR:()=>9,appCheckBuildFromMessage:()=>true,onlineConnectRoom:code=>c.connected=code,showToast(){},onlineFetch:()=>new Promise(r=>resolve=r)});vm.runInContext(['onlineNormalizeRoomCode','onlineEntryError','onlineCreateRoom','onlineJoinRoom'].map(fn).join('\n'),c);return{c,answer:r=>resolve(r)}}
(async()=>{
let{c,answer}=setup();const first=c.onlineCreateRoom();assert(c.onlineEntryBusy);await c.onlineCreateRoom();await c.onlineJoinRoom('ABCDE');answer({ok:true,json:async()=>({code:'ABCDE'})});await first;assert.equal(c.connected,'ABCDE');assert(!c.onlineEntryBusy);
({c,answer}=setup());const late=c.onlineCreateRoom();c.onlineEntryGeneration++;c.onlineEntryBusy=false;answer({ok:true,json:async()=>({code:'LATE1'})});await late;assert(!c.connected);
({c,answer}=setup());const missing=c.onlineJoinRoom('ABCDE');answer({status:404});await missing;assert(c.onlineConnectionStatus.includes('не найдена'));assert(!c.onlineEntryBusy);
({c,answer}=setup());c.onlineFetch=async()=>{throw new TypeError('fetch failed')};await c.onlineJoinRoom('ABCDE');assert(c.onlineConnectionStatus.includes('другую сеть'));assert(!c.onlineEntryBusy);await c.onlineCreateRoom();assert(!c.onlineCreatingRoom);
assert(c.onlineEntryError({name:'AbortError'}).includes('15 секунд'));
console.log('PASS: immediate lock, duplicate/mixed clicks, stale response, missing room, failed requests, timeout feedback');
})();
