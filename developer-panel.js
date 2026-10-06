/* Read-only developer HUD. Credentials and Cloudflare tokens exist only on the server. */
(() => {
  'use strict';
  const api='https://boccia-online-dev.40-burrito-swisher.workers.dev/monitor/';
  const channel=location.pathname.includes('boccia-stable')?'stable':'dev';
  const server=channel==='stable'?'https://boccia-online.v-vitalik25.workers.dev':'https://boccia-online-dev.40-burrito-swisher.workers.dev';
  let id;try{id=localStorage.getItem('boccia-monitor-id');if(!/^[-\w]{16,64}$/.test(id||'')){id=crypto.randomUUID();localStorage.setItem('boccia-monitor-id',id);}}catch{id=crypto.randomUUID();}
  async function call(path,body={},token='') {
    const response=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:'no-store',credentials:'omit'});
    const data=await response.json();if(!response.ok){const error=new Error(data.error||'network');error.status=response.status;throw error;}return data;
  }
  let lastBeat=0;
  function heartbeat(){if(document.hidden||Date.now()-lastBeat<29000)return;lastBeat=Date.now();call('heartbeat',{id,channel}).catch(()=>{});}
  heartbeat();setInterval(heartbeat,30000);document.addEventListener('visibilitychange',heartbeat);
  const desktop=matchMedia('(hover: hover) and (pointer: fine)');
  const host=document.createElement('div');host.id='boccia-developer-panel';document.body.append(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
    :host{font:12px system-ui,sans-serif;color:#dce9ed}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:1px solid #53717d;border-radius:6px;color:#e5f4fa;background:#203a46;padding:7px 10px}button:focus-visible,input:focus-visible{outline:2px solid #78d5ff;outline-offset:2px}
    #toggle{position:fixed;right:12px;bottom:8px;z-index:2147483646;font-size:10px;padding:5px 8px;color:#9daeb5;background:#14222ae6;opacity:.7}#toggle:hover,#toggle:focus{opacity:1}
    dialog{border:1px solid #587381;border-radius:12px;background:#13242e;color:#e5f4fa;width:min(350px,90vw);padding:20px}dialog::backdrop{background:#0009}h2{font-size:16px;margin:0 0 15px}label,input{display:block;width:100%}input{margin:7px 0 12px;padding:10px;color:#fff;background:#071921;border:1px solid #587381;border-radius:6px}.actions{display:flex;gap:10px}#error{min-height:32px;color:#ffc5b9}
    #hud{position:fixed;inset:12px 12px auto auto;margin:0;width:310px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;border:1px solid #45616e;border-radius:9px;background:#07151eec;color:#dcf4fa;padding:12px;z-index:2147483647;box-shadow:0 4px 24px #0007;font:12px/1.5 ui-monospace,monospace;pointer-events:auto}#hud[hidden]{display:none}header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}header button{font-size:11px;padding:3px 7px}p{margin:5px 0}.muted{color:#9cb2bd;font-size:10px}#metrics{white-space:pre-wrap}hr{border:0;border-top:1px solid #334955;margin:9px 0}
    @media(hover:none),(pointer:coarse){#toggle,#hud{display:none!important}}
  </style><button id="toggle" type="button">Режим разработчика</button>
  <dialog><form><h2>Режим разработчика</h2><label>Пароль<input type="password" autocomplete="off" maxlength="256" required></label><p id="error" role="status"></p><div class="actions"><button type="submit">Войти</button><button id="cancel" type="button">Отмена</button></div></form></dialog>
  <section id="hud" popover="manual" hidden aria-label="Статистика разработчика"><header><b>Boccia · DEV HUD</b><button id="close" type="button">Выйти ×</button></header><p id="status">Подключение…</p><div id="metrics"></div><hr><p id="local"></p><p class="muted">Посетители: активные браузеры за 90 с, приблизительно. Квота: запросы всего аккаунта за сутки UTC; аналитика Cloudflare может запаздывать. Обновление: 10 с / квота 60 с.</p></section>`;
  const $=s=>root.querySelector(s),dialog=$('dialog'),hud=$('#hud'),input=$('input');
  let token='',timer=0,busy=false,errors=0,frames=0,frameStart=0,fps=0,raf=0,generation=0;
  window.addEventListener('error',()=>errors++);window.addEventListener('unhandledrejection',()=>errors++);
  // Capture controls before the game's keyboard shortcuts; typing must never throw a ball.
  for(const event of ['keydown','keyup','keypress'])window.addEventListener(event,e=>{if(dialog.open||e.composedPath().includes(host)){e.stopImmediatePropagation();}},true);
  $('#toggle').onclick=()=>{if(token){hud.hidden=false;if(hud.showPopover&&!hud.matches(':popover-open'))hud.showPopover();return;}$('#error').textContent='';dialog.showModal();input.focus();};
  $('#cancel').onclick=()=>{dialog.close();input.value='';};dialog.addEventListener('close',()=>{input.value='';});
  function frame(time){frames++;if(time-frameStart>=1000){fps=Math.round(frames*1000/(time-frameStart));frames=0;frameStart=time;}raf=requestAnimationFrame(frame);}
  function close(){const old=token;token='';generation++;clearTimeout(timer);cancelAnimationFrame(raf);if(hud.hidePopover&&hud.matches(':popover-open'))hud.hidePopover();hud.hidden=true;$('#metrics').textContent='';if(old)call('logout',{},old).catch(()=>{});}
  $('#close').onclick=close;desktop.addEventListener('change',()=>{if(!desktop.matches){close();dialog.close();}});
  const format=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
  async function update(){if(!token||busy)return;busy=true;const current=generation;
    try{const [data,latency]=await Promise.all([call('stats',{},token),(async()=>{const start=performance.now();try{const r=await fetch(server+'/version',{cache:'no-store',signal:AbortSignal.timeout(5000)});return r.ok?Math.round(performance.now()-start)+' мс':'HTTP '+r.status;}catch{return 'недоступен';}})()]);
      if(current!==generation)return;
      $('#status').textContent='Обновлено '+new Date(data.now).toLocaleTimeString('ru-RU');
      const lines=[`На сайте: ${data.visitors.stable+data.visitors.dev}`,`Основная: ${data.visitors.stable} · Тестовая: ${data.visitors.dev}`,`Ответ игрового сервера: ${latency}`];
      for(const q of data.quota){lines.push('',q.channel==='stable'?'ОСНОВНОЙ АККАУНТ':'ТЕСТОВЫЙ АККАУНТ');if(q.error){lines.push(q.error==='not_configured'?'Квота: требуется подключение':'Квота: статистика недоступна');continue;}lines.push(`Квота запросов: ≈ ${format(q.percent)}%`,`${format(q.requests)} / ${format(q.limit)}`,`Ошибки Workers: ${format(q.errors)}`,`Данные: ${new Date(q.checkedAt).toLocaleTimeString('ru-RU')}`,`Сброс: ${new Date(q.resetAt).toLocaleString('ru-RU')}`);}
      $('#metrics').textContent=lines.join('\n');
    }catch(error){if(current!==generation)return;if(error.status===401){close();$('#error').textContent='Сеанс закончился. Войдите снова.';dialog.showModal();}else{$('#status').textContent='Нет связи · данные ниже устарели';}}
    finally{busy=false;if(token){const nav=performance.getEntriesByType('navigation')[0];$('#local').textContent=`Этот браузер: ${fps} FPS · JS-ошибки: ${errors}\nЗагрузка страницы: ${nav?.loadEventEnd?Math.round(nav.loadEventEnd)+' мс':'—'}`;timer=setTimeout(update,10000);}}
  }
  $('form').onsubmit=async e=>{e.preventDefault();const button=$('button[type=submit]');button.disabled=true;$('#error').textContent='Проверка…';try{const data=await call('login',{password:input.value});token=data.token;generation++;dialog.close();hud.hidden=false;if(hud.showPopover)hud.showPopover();frameStart=performance.now();frames=0;raf=requestAnimationFrame(frame);update();}catch(error){$('#error').textContent=error.status===401?'Неверный пароль':error.status===429?'Слишком много попыток. Подождите минуту.':error.message==='not_configured'?'Вход ещё не настроен на сервере.':'Сервер недоступен. Попробуйте позже.';}finally{input.value='';button.disabled=false;}};
})();
