// Owns requests for one room session. Reset invalidates both queued and in-flight work.
class BocciaHttpTransport{
  constructor({fetchImpl=(...args)=>fetch(...args),timeout=15000}={}){
    this.fetchImpl=fetchImpl;this.timeout=timeout;this.generation=0;this.controllers=new Set();this.queue=Promise.resolve();
  }
  stale(){return Object.assign(new Error('Session replaced'),{name:'AbortError',stale:true});}
  reset(){this.generation++;for(const c of this.controllers)c.abort();this.controllers.clear();this.queue=Promise.resolve();}
  async request(url,options={},generation=this.generation){
    if(generation!==this.generation)throw this.stale();
    const controller=new AbortController();this.controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),this.timeout);
    try{
      const response=await this.fetchImpl(url,{cache:'no-store',credentials:'omit',...options,signal:controller.signal});
      const text=await response.text();
      if(generation!==this.generation)throw this.stale();
      return{ok:response.ok,status:response.status,text,json:async()=>{try{return JSON.parse(text)}catch{throw Object.assign(new Error('Invalid JSON'),{code:'INVALID_RESPONSE'})}}};
    }catch(error){if(generation!==this.generation)throw this.stale();throw error;}
    finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
  async retryRequest(url,options={},onRetry=()=>{}){
    const generation=this.generation;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await this.request(url,options,generation);
        if(![429,502,503,504].includes(response.status)||attempt===2)return response;
      }catch(error){if(error.stale||attempt===2||!(error.name==='TypeError'||error.name==='AbortError'))throw error;}
      onRetry(attempt+2);
      await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
      if(generation!==this.generation)throw this.stale();
    }
  }
  serial(task){const generation=this.generation;const result=this.queue.then(()=>{if(generation!==this.generation)throw this.stale();return task(generation)});this.queue=result.catch(()=>{});return result;}
}
