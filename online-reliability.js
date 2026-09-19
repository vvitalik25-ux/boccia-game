/*
  Boccia hybrid transport
  -----------------------
  The game itself still speaks its existing WebSocket protocol.
  This adapter tries a native WebSocket first and automatically falls back
  to normal HTTPS POST requests when WebSocket is blocked, stalls or drops.

  It intentionally implements only the WebSocket surface used by game.js:
  readyState, send(), close(), onopen/onmessage/onerror/onclose and listeners.
*/
(function(){
  'use strict';

  if(window.__BOCCIA_HYBRID_TRANSPORT__) return;
  window.__BOCCIA_HYBRID_TRANSPORT__ = true;

  var NativeWebSocket = window.WebSocket;
  var FALLBACK_MS = 15 * 60 * 1000;
  var HANDSHAKE_MS = 6500;
  var HTTP_TIMEOUT_MS = 14000;
  var FALLBACK_KEY = 'boccia-http-fallback-until';

  function now(){ return Date.now(); }

  function safeSessionGet(key){
    try{return sessionStorage.getItem(key)}catch(_){return null}
  }
  function safeSessionSet(key,value){
    try{sessionStorage.setItem(key,String(value))}catch(_){}
  }
  function fallbackPreferred(){
    return Number(safeSessionGet(FALLBACK_KEY)||0) > now();
  }
  function rememberFallback(){
    safeSessionSet(FALLBACK_KEY, now()+FALLBACK_MS);
  }

  function isTarget(url){
    try{
      var u = new URL(url, location.href);
      return /^wss?:$/.test(u.protocol) &&
        /boccia-online\.v-vitalik25\.workers\.dev$/i.test(u.hostname) &&
        /^\/room\/[A-Z0-9]+\/?$/i.test(u.pathname);
    }catch(_){
      return false;
    }
  }

  function toHttpEndpoint(url){
    var u = new URL(url, location.href);
    var code = (u.pathname.split('/')[2]||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    return 'https://' + u.host + '/http/room/' + encodeURIComponent(code) + '/message';
  }

  function asEvent(type, extra){
    var e = {type:type, target:null, currentTarget:null};
    if(extra){
      Object.keys(extra).forEach(function(k){ e[k]=extra[k]; });
    }
    return e;
  }

  function HybridSocket(url, protocols){
    if(!(this instanceof HybridSocket)) return new HybridSocket(url, protocols);

    // Do not interfere with unrelated WebSocket users.
    if(!isTarget(url)){
      if(!NativeWebSocket) throw new Error('WebSocket is not supported');
      return protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
    }

    this.url = String(url);
    this.protocol = '';
    this.extensions = '';
    this.binaryType = 'blob';
    this.bufferedAmount = 0;

    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;

    this.readyState = 0;

    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;

    this._listeners = {open:[],message:[],error:[],close:[]};
    this._native = null;
    this._mode = 'starting';
    this._manualClose = false;
    this._openedEventSent = false;
    this._receivedServerMessage = false;
    this._lastNativeMessageAt = 0;
    this._joinMessage = null;
    this._handshakeTimer = null;
    this._httpEndpoint = toHttpEndpoint(url);
    this._httpSyncInFlight = false;
    this._httpActionChain = Promise.resolve();
    this._closedEventSent = false;
    this._joinRetryTimer = null;

    var self=this;
    this._onlineHandler=function(){
      if(self._manualClose || self.readyState===3) return;
      if(self._mode==='http' && self._joinMessage){
        self._httpRequest(self._joinMessage, true);
      }
    };
    try{window.addEventListener('online',this._onlineHandler)}catch(_){}

    if(!NativeWebSocket || fallbackPreferred()){
      setTimeout(function(){ self._activateHttp('preferred'); },0);
    }else{
      this._startNative(protocols);
    }
  }

  HybridSocket.CONNECTING = 0;
  HybridSocket.OPEN = 1;
  HybridSocket.CLOSING = 2;
  HybridSocket.CLOSED = 3;

  HybridSocket.prototype.addEventListener=function(type,fn){
    if(this._listeners[type] && typeof fn==='function') this._listeners[type].push(fn);
  };
  HybridSocket.prototype.removeEventListener=function(type,fn){
    if(!this._listeners[type]) return;
    this._listeners[type]=this._listeners[type].filter(function(x){return x!==fn});
  };
  HybridSocket.prototype._emit=function(type,event){
    event=event||asEvent(type);
    event.target=this;
    event.currentTarget=this;

    var prop=this['on'+type];
    if(typeof prop==='function'){
      try{prop.call(this,event)}catch(err){setTimeout(function(){throw err},0)}
    }
    var arr=(this._listeners[type]||[]).slice();
    for(var i=0;i<arr.length;i++){
      try{arr[i].call(this,event)}catch(err){setTimeout(function(){throw err},0)}
    }
  };
  HybridSocket.prototype._emitOpen=function(){
    if(this._openedEventSent || this._manualClose) return;
    this._openedEventSent=true;
    this.readyState=1;
    this._emit('open',asEvent('open'));
  };
  HybridSocket.prototype._emitClose=function(code,reason,clean){
    if(this._closedEventSent) return;
    this._closedEventSent=true;
    this.readyState=3;
    this._cleanupTimers();
    try{window.removeEventListener('online',this._onlineHandler)}catch(_){}
    this._emit('close',asEvent('close',{
      code:Number(code)||1006,
      reason:String(reason||''),
      wasClean:!!clean
    }));
  };
  HybridSocket.prototype._cleanupTimers=function(){
    clearTimeout(this._handshakeTimer);
    clearTimeout(this._joinRetryTimer);
    this._handshakeTimer=null;
    this._joinRetryTimer=null;
  };

  HybridSocket.prototype._startNative=function(protocols){
    var self=this, ws;
    this._mode='ws';
    try{
      ws = protocols === undefined
        ? new NativeWebSocket(this.url)
        : new NativeWebSocket(this.url,protocols);
    }catch(err){
      this._activateHttp('constructor');
      return;
    }
    this._native=ws;

    ws.onopen=function(){
      if(self._manualClose || ws!==self._native) return;
      self.readyState=1;
      self._lastNativeMessageAt=now();
      self._emitOpen();
    };
    ws.onmessage=function(ev){
      if(self._manualClose || ws!==self._native) return;
      self._receivedServerMessage=true;
      self._lastNativeMessageAt=now();
      clearTimeout(self._handshakeTimer);
      self._handshakeTimer=null;
      self._emit('message',asEvent('message',{data:ev.data}));
    };
    ws.onerror=function(){
      if(self._manualClose || ws!==self._native) return;
      self._emit('error',asEvent('error'));
      // Some browsers fire error long before close. If join is already known,
      // don't wait forever for an onclose that may never arrive.
      if(self._joinMessage){
        setTimeout(function(){
          if(!self._manualClose && self._mode==='ws' && !self._receivedServerMessage){
            self._activateHttp('native-error');
          }
        },900);
      }
    };
    ws.onclose=function(ev){
      if(ws!==self._native) return;
      self._native=null;

      if(self._manualClose){
        self._emitClose(ev.code,ev.reason,ev.wasClean);
        return;
      }

      // 4001 is deliberately used by the room when the same player opens
      // another tab/device. Preserve the game's existing handling.
      if(ev.code===4001){
        self._emitClose(ev.code,ev.reason,ev.wasClean);
        return;
      }

      self._activateHttp('native-close-'+ev.code);
    };
  };

  HybridSocket.prototype._activateHttp=function(reason){
    if(this._manualClose || this.readyState===3) return;
    if(this._mode==='http'){
      this._emitOpen();
      return;
    }

    rememberFallback();
    this._mode='http';
    this.readyState=1;

    var ws=this._native;
    this._native=null;
    if(ws){
      try{
        ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;
        ws.close(1000,'http-fallback');
      }catch(_){}
    }

    clearTimeout(this._handshakeTimer);
    this._handshakeTimer=null;

    // If native WebSocket had already opened, game.js may already have sent
    // "join". Replay only in that case. On an initial HTTP-only open, the
    // game's onopen handler itself will send join exactly once.
    const wasAlreadyOpen=this._openedEventSent;
    this._emitOpen();

    if(wasAlreadyOpen&&this._joinMessage){
      this._httpRequest(this._joinMessage,true);
    }
  };

  HybridSocket.prototype._scheduleJoinRetry=function(){
    var self=this;
    if(this._manualClose || this._mode!=='http' || !this._joinMessage) return;
    clearTimeout(this._joinRetryTimer);
    this._joinRetryTimer=setTimeout(function(){
      self._joinRetryTimer=null;
      if(!self._manualClose && self._mode==='http' && self._joinMessage){
        self._httpRequest(self._joinMessage,true);
      }
    },1500);
  };

  HybridSocket.prototype._deliverHttpMessages=function(payload){
    var messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
    for(var i=0;i<messages.length;i++){
      this._receivedServerMessage=true;
      this._emit('message',asEvent('message',{data:JSON.stringify(messages[i])}));
    }
  };

  HybridSocket.prototype._httpFetch=function(message){
    var self=this;
    var controller = typeof AbortController!=='undefined' ? new AbortController() : null;
    var timer = setTimeout(function(){
      try{if(controller)controller.abort()}catch(_){}
    },HTTP_TIMEOUT_MS);

    return fetch(this._httpEndpoint,{
      method:'POST',
      mode:'cors',
      cache:'no-store',
      credentials:'omit',
      headers:{
        'Content-Type':'application/json',
        'Cache-Control':'no-cache',
        'Pragma':'no-cache'
      },
      body:JSON.stringify({
        clientKey:(this._joinMessage&&this._joinMessage.clientKey)||'',
        message:message
      }),
      signal:controller ? controller.signal : undefined
    }).then(function(response){
      if(!response.ok) throw new Error('HTTP '+response.status);
      return response.json();
    }).then(function(payload){
      clearTimeout(timer);
      self._deliverHttpMessages(payload);
      return payload;
    }).catch(function(err){
      clearTimeout(timer);
      if(self._manualClose) return null;
      self._emit('error',asEvent('error',{error:err}));
      throw err;
    });
  };

  HybridSocket.prototype._httpRequest=function(message,isJoin){
    var self=this;
    if(this._manualClose || this._mode!=='http') return Promise.resolve(null);

    var isSync = message && message.type==='sync';

    // A slow connection must never accumulate an endless queue of heartbeat
    // sync requests. One in-flight sync is enough.
    if(isSync){
      if(this._httpSyncInFlight) return Promise.resolve(null);
      this._httpSyncInFlight=true;
      return this._httpFetch(message).catch(function(){
        return null;
      }).finally(function(){
        self._httpSyncInFlight=false;
      });
    }

    // Preserve ordering for join/ready/actions/restart/leave.
    this._httpActionChain=this._httpActionChain.then(function(){
      if(self._manualClose || self._mode!=='http') return null;
      return self._httpFetch(message).catch(function(){
        if(isJoin) self._scheduleJoinRetry();
        return null;
      });
    });
    return this._httpActionChain;
  };

  HybridSocket.prototype.send=function(data){
    if(this._manualClose || this.readyState!==1){
      throw new Error('WebSocket is not open');
    }

    var parsed=null;
    try{parsed=typeof data==='string'?JSON.parse(data):data}catch(_){}

    if(parsed && parsed.type==='join'){
      this._joinMessage=parsed;
    }

    if(this._mode==='ws' && this._native && this._native.readyState===NativeWebSocket.OPEN){
      // A mobile browser / proxy can leave WebSocket in OPEN state while the
      // route is already dead. The game's 1-second sync gives us a reliable
      // opportunity to detect that half-open state and move to HTTPS.
      if(
        parsed &&
        parsed.type==='sync' &&
        this._lastNativeMessageAt &&
        now()-this._lastNativeMessageAt>9000
      ){
        this._activateHttp('native-stale');
        this._httpRequest(parsed,false);
        return;
      }

      this._native.send(data);

      if(parsed && parsed.type==='join'){
        var self=this;
        clearTimeout(this._handshakeTimer);
        this._handshakeTimer=setTimeout(function(){
          if(!self._manualClose && self._mode==='ws' && !self._receivedServerMessage){
            self._activateHttp('join-timeout');
          }
        },HANDSHAKE_MS);
      }
      return;
    }

    if(this._mode==='http'){
      if(!parsed) throw new Error('HTTPS fallback accepts JSON messages only');
      this._httpRequest(parsed,parsed.type==='join');
      return;
    }

    throw new Error('WebSocket is not open');
  };

  HybridSocket.prototype.close=function(code,reason){
    if(this._manualClose || this.readyState===3) return;
    this._manualClose=true;
    this.readyState=2;
    this._cleanupTimers();

    var ws=this._native;
    this._native=null;
    if(ws){
      try{
        ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;
        ws.close(code||1000,reason||'');
      }catch(_){}
    }

    this._emitClose(code||1000,reason||'',true);
  };

  window.WebSocket = HybridSocket;
})();
