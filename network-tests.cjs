const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=vm.createContext({fetch,AbortController,setTimeout,clearTimeout,console});vm.runInContext(fs.readFileSync(__dirname+'/http-transport.js','utf8')+'\nglobalThis.Transport=BocciaHttpTransport',c);
(async()=>{
let respond;const t=new c.Transport({fetchImpl:()=>new Promise(r=>respond=r)});const pending=t.request('/old');t.reset();respond({ok:true,status:200,text:async()=>'{"old":true}'});await assert.rejects(pending,e=>e.stale);
let executed=false;const queued=t.serial(()=>{executed=true});t.reset();await assert.rejects(queued,e=>e.stale);assert(!executed);
let calls=0;const retry=new c.Transport({fetchImpl:async()=>{calls++;if(calls===1)throw Object.assign(new Error('offline'),{name:'TypeError'});return{ok:true,status:200,text:async()=>'{"code":"SAME"}'}}});const ok=await retry.retryRequest('/create?same-id');assert.equal(calls,2);assert.equal((await ok.json()).code,'SAME');
let order=[];await Promise.all([retry.serial(async()=>{order.push(1);await Promise.resolve();order.push(2)}),retry.serial(()=>order.push(3))]);assert.deepEqual(order,[1,2,3]);
const timeout=new c.Transport({timeout:5,fetchImpl:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'}))))});await assert.rejects(timeout.request('/slow'),e=>e.name==='AbortError');
console.log('PASS: late response rejected, queued request canceled, safe network retry, command order, timeout');
})().catch(e=>{console.error(e);process.exitCode=1});
