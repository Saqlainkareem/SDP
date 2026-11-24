/* Cloud + subscription layer: Supabase sync, live block/plan check (har 30 sec), blur lock screen, payment panel */
(function(){
  var SB_URL="https://odsynypmpombekhiljhl.supabase.co";
  var SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kc3lueXBtcG9tYmVraGlsamhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyOTIzNzAsImV4cCI6MjEwODg2ODM3MH0.zZpCCPxbgNGYQgV4zduj1hWYnmhan_OrfCYiIvtgpxo";
  var L=window.LocalStore; if(!L){console.warn('LocalStore missing');return}
  document.documentElement.style.visibility='hidden';
  var cl=null; try{cl=window.supabase.createClient(SB_URL,SB_KEY)}catch(e){}
  var U=null,R=null,S={},timer=null,cache={},tsKey='ms_local_ts',curMode='',dismissed='',pendTimer=null,payOpen=false;
  var $=function(i){return document.getElementById(i)};
  var go=function(u){location.replace(u)}, never=new Promise(function(){});
  var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  function days(){return R&&R.expires_at?Math.ceil((new Date(R.expires_at)-Date.now())/864e5):0}
  function modeOf(){ if(R.blocked)return 'blocked'; if(R.is_free)return 'ok'; if(!R.expires_at||new Date(R.expires_at)<=new Date())return 'inactive'; return 'ok' }
  function warnDays(){return S.warn_days||7}

  /* ---------- gate (login check) ---------- */
  var gate=(async function(){
    var s=null; try{s=cl&&(await cl.auth.getSession()).data.session}catch(e){}
    if(!s){go('index.html');return never}
    U=s.user; tsKey='ms_local_ts_'+U.id;
    try{ var last=localStorage.getItem('ms_last_uid');
      if(last&&last!==U.id){
        localStorage.removeItem('ms_settings_v1');
        await new Promise(function(res){ var q=indexedDB.open('ms_nihari_pos',1); q.onupgradeneeded=function(){q.result.createObjectStore('kv')};
          q.onsuccess=function(){ try{ var tx=q.result.transaction('kv','readwrite'); tx.objectStore('kv').clear(); tx.oncomplete=function(){q.result.close();res()}; tx.onerror=function(){q.result.close();res()} }catch(e){res()} };
          q.onerror=function(){res()} });
      }
      localStorage.setItem('ms_last_uid',U.id);
    }catch(e){}
    try{ var r=await cl.from('restaurants').select('*').eq('user_id',U.id).maybeSingle(); if(r.error)throw r.error;
      if(!r.data){go('index.html');return never}
      R=r.data; localStorage.setItem('ms_R_'+U.id,JSON.stringify(R));
      var ps=await cl.from('pay_settings').select('data').eq('id',1).maybeSingle(); if(ps.data&&ps.data.data)S=ps.data.data;
      try{cl.rpc('ping')}catch(e){}
    }catch(e){ try{R=JSON.parse(localStorage.getItem('ms_R_'+U.id))}catch(x){} if(!R){go('index.html');return never} }
    try{S=Object.assign({},JSON.parse(localStorage.getItem('ms_S')||'{}'),S);localStorage.setItem('ms_S',JSON.stringify(S))}catch(e){}
    curMode=modeOf(); style(); render();
    document.documentElement.style.visibility='visible';
    setInterval(poll,30000); window.addEventListener('focus',poll); window.addEventListener('online',poll);
  })();

  /* ---------- live poll: admin ne kuch badla? ---------- */
  async function poll(){
    if(!cl||!U||!R)return;
    try{
      var r=await cl.from('restaurants').select('*').eq('user_id',U.id).maybeSingle(); if(r.error)throw r.error;
      if(!r.data){try{await cl.auth.signOut()}catch(e){} go('index.html');return}
      R=r.data; localStorage.setItem('ms_R_'+U.id,JSON.stringify(R));
      var ps=await cl.from('pay_settings').select('data').eq('id',1).maybeSingle(); if(ps.data&&ps.data.data){S=ps.data.data;localStorage.setItem('ms_S',JSON.stringify(S))}
      try{cl.rpc('ping')}catch(e){}
    }catch(e){}
    var m=modeOf(), prev=curMode; curMode=m;
    if(prev!==m){
      if(m==='ok'&&prev!=='ok'){toast('✔ Plan active ho gaya. Shukriya!');closePay()}
      if(m==='blocked')toast('⛔ Aap ka account block kar diya gaya hai');
      if(m==='inactive'&&prev==='ok')toast('⚠ Aap ka plan khatam ho gaya hai');
    }
    render(); if(m==='ok'&&dirty)push();
  }

  /* ---------- UI ---------- */
  function style(){
    var c=document.createElement('style');
    c.textContent='#cx-days{position:fixed;top:3px;right:10px;z-index:99990;pointer-events:none;font:700 10px/1.6 sans-serif;padding:0 9px;border-radius:99px;background:#0f172ae6;color:#fff;letter-spacing:.2px}#cx-days.warn{background:#d97706}#cx-days.bad{background:#e11d48}'+
    '#cx-note{position:fixed;top:0;left:0;right:0;z-index:99980;background:linear-gradient(90deg,#f59e0b,#f97316);color:#1e1b0b;font:700 13px sans-serif;padding:8px 40px 8px 12px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;animation:cxd .4s}'+
    '#cx-note a{background:#0f172a;color:#fff;padding:4px 14px;border-radius:8px;cursor:pointer;text-decoration:none}#cx-note b.x{position:absolute;right:12px;cursor:pointer;font-size:18px}@keyframes cxd{from{transform:translateY(-100%)}to{transform:none}}'+
    '#cx-lock{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:16px}'+
    '#cx-bar{position:fixed;top:0;left:0;right:0;z-index:2147483001;cursor:pointer;padding:14px 16px;text-align:center;font:800 15px sans-serif;color:#1a1205;background:linear-gradient(90deg,#f59e0b,#fde047,#f97316,#f59e0b);background-size:300% 100%;animation:cxs 3s linear infinite,cxd .6s;box-shadow:0 8px 30px #f59e0baa;letter-spacing:.3px}'+
    '#cx-bar i{display:inline-block;animation:cxb 1s infinite;font-style:normal;margin:0 8px}@keyframes cxs{to{background-position:-300% 0}}@keyframes cxb{50%{transform:translateX(6px)}}'+
    '.cx-card{background:#0f172af2;color:#fff;border:1px solid #334155;border-radius:20px;padding:28px;max-width:400px;width:100%;text-align:center;font-family:sans-serif;animation:cxp .5s}'+
    '.cx-card .ic{font-size:44px;margin-bottom:6px;animation:cxk 2s infinite}@keyframes cxk{50%{transform:scale(1.12) rotate(-6deg)}}@keyframes cxp{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:none}}'+
    '.cx-btn{border:0;border-radius:11px;padding:11px 18px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#f59e0b,#f97316);color:#1a1205;margin-top:12px;font-size:14px}.cx-btn.g{background:linear-gradient(135deg,#059669,#10b981);color:#fff}'+
    '#cx-pay{position:fixed;inset:0;z-index:2147483002;background:#020617b0;backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:12px;overflow:auto}#cx-pay.on{display:flex}'+
    '.cx-pm{background:#fff;color:#0f172a;border-radius:20px;width:100%;max-width:440px;padding:20px;position:relative;font-family:sans-serif;animation:cxp .4s;max-height:96vh;overflow:auto}.cx-pm h2{margin:0 0 10px;font-size:19px}.cx-x{position:absolute;right:14px;top:10px;border:0;background:none;font-size:26px;cursor:pointer;color:#64748b}'+
    '.cx-plan{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.cx-plan div{background:#f1f5f9;border-radius:12px;padding:9px;text-align:center}.cx-plan small{display:block;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase}.cx-plan b{font-size:15px}'+
    '.cx-tabs{display:flex;gap:8px;margin-bottom:8px}.cx-tabs button{flex:1;padding:11px;border-radius:12px;border:2px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer;transition:.2s}.cx-tabs button.on{border-color:#f59e0b;background:#fffbeb;transform:translateY(-2px)}'+
    '.cx-only{text-align:center;font-weight:900;color:#b45309;margin:6px 0}.cx-qr{display:flex;justify-content:center;margin:8px 0}.cx-qr img{max-width:230px;border-radius:10px}.cx-ins{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:12px;padding:10px;font-size:13px;margin:10px 0;white-space:pre-wrap}'+
    '.cx-pm input{width:100%;padding:12px;border:2px solid #cbd5e1;border-radius:12px;font-size:15px;margin-top:8px}.cx-pm input:focus{outline:0;border-color:#f59e0b}'+
    '.cx-ld{text-align:center;padding:22px 6px}.cx-sp{width:54px;height:54px;border:5px solid #e2e8f0;border-top-color:#f59e0b;border-radius:50%;margin:0 auto 12px;animation:cxr .8s linear infinite}@keyframes cxr{to{transform:rotate(360deg)}}'+
    '.cx-ok{width:60px;height:60px;border-radius:50%;background:#10b981;margin:0 auto 12px;display:grid;place-items:center;animation:cxp .5s}.cx-ok svg{stroke:#fff;stroke-width:5;fill:none;stroke-dasharray:40;stroke-dashoffset:40;animation:cxc .6s .2s forwards}@keyframes cxc{to{stroke-dashoffset:0}}'+
    '.cx-wt{width:64px;height:64px;border-radius:50%;background:#fde68a;margin:0 auto 12px;display:grid;place-items:center;font-size:28px;animation:cxw 1.6s infinite}@keyframes cxw{0%{box-shadow:0 0 0 0 #f59e0b88}100%{box-shadow:0 0 0 22px #f59e0b00}}'+
    '.cx-h{font-size:12px;border-top:1px solid #e2e8f0;margin-top:12px;padding-top:8px}.cx-h div{display:flex;justify-content:space-between;padding:3px 0}.cx-bad{background:#fee2e2;color:#991b1b;border-radius:10px;padding:8px 10px;font-weight:700;font-size:13px;margin-bottom:8px}'+
    '#cx-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483005;background:#0f172a;color:#fff;padding:11px 20px;border-radius:12px;font:700 13px sans-serif;box-shadow:0 10px 30px #0008;animation:cxp .3s}';
    document.head.appendChild(c);
  }
  function ensure(id){var e=$(id);if(!e){e=document.createElement('div');e.id=id;document.body.appendChild(e)}return e}
  function toast(t){var e=ensure('cx-toast');e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(function(){e.style.display='none'},5000)}
  function planLabel(){return R.plan_days==7?'Weekly':R.plan_days==30?'Monthly':R.plan_days+' din'}
  function render(){
    if(!R)return; var m=modeOf(), d=days(), w=warnDays();
    var p=ensure('cx-days'); p.className=m!=='ok'?'bad':(!R.is_free&&d<=w?'warn':'');
    p.textContent=m==='blocked'?'Account blocked':m==='inactive'?'Plan active nahi':R.is_free?'Free plan':'Plan: '+d+' din baqi';
    var msgs=[], low=m==='ok'&&!R.is_free&&d<=w, force=m==='ok'&&!R.is_free&&!!R.force_pay;
    if(low||force){ if(low)msgs.push('Aap ka plan '+d+' din mein khatam ho raha hai.'); if(S.notice)msgs.push(S.notice); if(R.notice)msgs.push(R.notice); }
    var key=msgs.join('|')+(R.force_pay?'F':''), n=$('cx-note');
    if((low||force)&&dismissed!==key){
      n=n||ensure('cx-note'); n.style.display='flex';
      n.innerHTML='<span>'+esc(msgs.join('  |  ')||'Plan renew karein')+'</span>'+((low||R.force_pay)&&!R.is_free?'<a id="cx-nb">Pay / Renew</a>':'')+'<b class="x">&times;</b>';
      var b=$('cx-nb'); if(b)b.onclick=openPay; n.querySelector('.x').onclick=function(){dismissed=key;render()};
      document.body.style.paddingTop=n.offsetHeight+'px';
    } else { if(n)n.style.display='none'; document.body.style.paddingTop='' }
    var lk=$('cx-lock'),bar=$('cx-bar');
    if(m==='ok'){ if(lk)lk.remove(); if(bar)bar.remove(); return }
    if(!lk){lk=ensure('cx-lock')}
    var sig=m+(S.notice||'');
    if(lk.dataset.sig!==sig){ lk.dataset.sig=sig;
      if(m==='blocked'){ if(bar)bar.remove();
        lk.innerHTML='<div class="cx-card"><div class="ic">⛔</div><h2 style="margin:6px 0">Account Block Hai</h2><p style="color:#94a3b8;margin:0">Aap ka account admin ne block kar diya hai.<br>Barah-e-karam admin se rabta karein.</p><button class="cx-btn" id="cx-re">Dobara check karein</button></div>';
        $('cx-re').onclick=function(){toast('Check ho raha hai...');poll()};
      } else {
        lk.innerHTML='<div class="cx-card"><div class="ic">🔒</div><h2 style="margin:6px 0">Screen Lock Hai</h2><p style="color:#94a3b8;margin:0">'+(R.expires_at?'Aap ka plan khatam ho gaya hai.':'Abhi koi plan active nahi.')+'<br>POS chalane ke liye plan activate karein.</p><button class="cx-btn" id="cx-go">Plan Activate Karein</button></div>';
        $('cx-go').onclick=openPay;
        if(!bar){bar=ensure('cx-bar')} bar.innerHTML='⚡ <i>➜</i> Plan active nahi hai &mdash; activate karne ke liye yahan click karein <i>⬅</i> ⚡'; bar.onclick=openPay;
      }
    }
  }

  /* ---------- payment panel ---------- */
  var tlv=function(t,v){return t+String(v.length).padStart(2,'0')+v};
  function crc(s){var c=0xFFFF;for(var i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(var j=0;j<8;j++)c=c&0x8000?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
  function emv(till,amt,name,brand){var m=tlv('00','com.'+brand)+tlv('01',till);var s=tlv('00','01')+tlv('01','12')+tlv('26',m)+tlv('52','5812')+tlv('53','586')+tlv('54',Number(amt).toFixed(2))+tlv('58','PK')+tlv('59',(name||'Merchant').slice(0,25))+tlv('60','Pakistan')+'6304';return s+crc(s)}
  function loadQR(cb){ if(window.QRCode)return cb(); var s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload=cb; s.onerror=function(){cb()}; document.head.appendChild(s) }
  var method=null;
  function openPay(){
    if(!R||R.blocked)return; payOpen=true; var P=ensure('cx-pay'); P.classList.add('on');
    var ms=[['easypaisa','Easypaisa'],['jazzcash','JazzCash']].filter(function(m){return S[m[0]]&&(S[m[0]].till||S[m[0]].qr)});
    var ok=ms.length&&R.fee>0;
    P.innerHTML='<div class="cx-pm"><button class="cx-x" id="cx-cl">&times;</button><h2>💳 Plan Activate Karein</h2>'+
      '<div class="cx-plan"><div><small>Plan</small><b>'+esc(planLabel())+'</b></div><div><small>Fee</small><b>Rs '+(R.fee||0)+'</b></div><div><small>Muddat</small><b>'+R.plan_days+' din</b></div></div>'+
      (ok?'<div class="cx-tabs">'+ms.map(function(m){return '<button data-k="'+m[0]+'" data-n="'+m[1]+'">'+m[1]+'</button>'}).join('')+'</div><div id="cx-qa"></div>':'<div class="cx-bad" style="background:#fef3c7;color:#92400e">Payment ki details abhi set nahi hain. Admin se rabta karein.</div>')+
      (S.instructions?'<div class="cx-ins"><b>Admin ki hidayat:</b><br>'+esc(S.instructions)+'</div>':'')+
      '<div id="cx-form"></div><div id="cx-hist" class="cx-h"></div></div>';
    $('cx-cl').onclick=closePay;
    P.querySelectorAll('.cx-tabs button').forEach(function(b){b.onclick=function(){pick(b.dataset.k,b.dataset.n)}});
    if(ok)pick(ms[0][0],ms[0][1]);
    hist();
  }
  function closePay(){payOpen=false;clearInterval(pendTimer);var P=$('cx-pay');if(P){P.classList.remove('on');P.innerHTML=''}}
  function pick(k,n){ method=n; document.querySelectorAll('.cx-tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.k===k)});
    var x=S[k],a=$('cx-qa'); if(!a)return; a.innerHTML='';
    if(x.mode!=='qr'&&x.till){ a.innerHTML='<div class="cx-only">Scan only with '+n+'</div><div class="cx-qr"><div id="cx-q" style="background:#fff;padding:8px;border-radius:10px"></div></div><p style="text-align:center;margin:0">Till ID: <b>'+esc(x.till)+'</b> &middot; Amount: <b>Rs '+R.fee+'</b>'+(x.name?'<br>'+esc(x.name):'')+'</p>';
      loadQR(function(){ if(window.QRCode&&$('cx-q'))new QRCode($('cx-q'),{text:emv(x.till,R.fee,x.name,k),width:210,height:210,correctLevel:QRCode.CorrectLevel.M}); else if($('cx-q'))$('cx-q').textContent='QR load nahi hua (internet check karein)' }) }
    else if(x.qr){ a.innerHTML='<div class="cx-qr"><img src="'+esc(x.qr)+'" alt="QR"></div><p style="text-align:center;margin:0">Amount: <b>Rs '+R.fee+'</b>'+(x.till?'<br>Till ID: <b>'+esc(x.till)+'</b>':'')+'</p>' }
  }
  function form(){ var f=$('cx-form'); if(!f)return; var ok=document.querySelector('.cx-tabs');
    f.innerHTML=ok?'<input id="cx-tid" placeholder="Payment ka TID / Transaction ID likhein"><button class="cx-btn g" id="cx-sub" style="width:100%">Submit Payment</button>':'';
    if($('cx-sub'))$('cx-sub').onclick=submit }
  function waiting(tid){ var f=$('cx-form'); if(!f)return; f.innerHTML='<div class="cx-ld"><div class="cx-wt">⏳</div><b>Admin approval ka intezar...</b><p style="color:#64748b;font-size:13px;margin:6px 0 0">TID: <b>'+esc(tid||'')+'</b><br>Approve hote hi aap ka plan khud active ho jayega.</p></div>';
    clearInterval(pendTimer); pendTimer=setInterval(function(){ if(!payOpen)return clearInterval(pendTimer); poll(); hist(true) },8000) }
  async function hist(quiet){
    try{ var r=await cl.from('payments').select('*').eq('user_id',U.id).order('created_at',{ascending:false}).limit(5); var d=r.data||[], h=$('cx-hist'); if(!h)return;
      h.innerHTML=d.length?'<b>Meri payments</b>'+d.map(function(p){return '<div><span>'+new Date(p.created_at).toLocaleDateString('en-GB')+' · '+esc(p.method)+' · '+esc(p.tid)+'</span><b>Rs '+p.amount+' · '+p.status+'</b></div>'}).join(''):'';
      if(quiet)return; var top=d[0];
      if(top&&top.status==='pending')waiting(top.tid); else { if(top&&top.status==='rejected'&&$('cx-qa'))$('cx-qa').insertAdjacentHTML('beforebegin','<div class="cx-bad">Pichli payment reject hui. TID dobara check karke bhejein.</div>'); form() }
    }catch(e){ form() } }
  async function submit(){
    var t=($('cx-tid').value||'').trim(); if(t.length<4){$('cx-tid').style.borderColor='#e11d48';return}
    var f=$('cx-form'); f.innerHTML='<div class="cx-ld"><div class="cx-sp"></div><b>Payment bheji ja rahi hai...</b><p style="color:#64748b;font-size:13px;margin:6px 0 0">Barah-e-karam window band na karein</p></div>';
    await sleep(1100);
    var r=await cl.from('payments').insert({user_id:U.id,restaurant_name:R.name,method:method,amount:R.fee,tid:t,plan_days:R.plan_days});
    if(r.error){ f.innerHTML='<div class="cx-bad">Error: '+esc(r.error.message)+'</div>'; await sleep(1800); form(); return }
    f.innerHTML='<div class="cx-ld"><div class="cx-ok"><svg width="30" height="30" viewBox="0 0 30 30"><path d="M6 16l6 6 12-13"/></svg></div><b>Payment admin ko bhej di gayi ✔</b></div>';
    await sleep(1600); waiting(t); hist(true);
  }

  /* ---------- online data sync ---------- */
  var dirty=false;
  try{cache.settings=JSON.parse(localStorage.getItem('ms_settings_v1'))}catch(e){}
  window.CloudBridge={settingsSaved:function(s){cache.settings=s;sched()}};
  async function push(){ if(!cl||!U||!R||!R.cloud_sync||modeOf()!=='ok')return;
    try{var ts=+localStorage.getItem(tsKey)||Date.now();
      var r=await cl.from('pos_data').upsert({user_id:U.id,value:{menu:cache.menu,orders:cache.orders,cash:cache.cash,settings:cache.settings,ts:ts},updated_at:new Date().toISOString()});
      if(r.error)throw r.error; dirty=false}catch(e){dirty=true;console.warn('cloud push failed',e)} }
  function sched(){ localStorage.setItem(tsKey,Date.now()); dirty=true; clearTimeout(timer); timer=setTimeout(push,1500) }
  var o={}; ['init','saveMenu','saveOrders','saveCash','pickFolder','reconnect','importBackup'].forEach(function(k){if(typeof L[k]==='function')o[k]=L[k].bind(L)});
  function take(d){ if(d){ if(d.menu)cache.menu=d.menu; if(d.orders)cache.orders=d.orders; if(d.cash!=null)cache.cash=d.cash } return d }
  L.init=async function(){ await gate; var d=await o.init(); var c=null;
    if(R.cloud_sync&&cl){try{var r=await cl.from('pos_data').select('value').eq('user_id',U.id).maybeSingle(); c=r.data&&r.data.value}catch(e){}}
    var lts=+localStorage.getItem(tsKey)||0;
    var empty=!d||(!(d.orders&&d.orders.length)&&!(d.menu&&d.menu.length));
    if(c&&(empty||(c.ts||0)>lts)){
      d=Object.assign({},d||{});
      if(c.menu){d.menu=c.menu;try{await o.saveMenu(c.menu)}catch(e){}}
      if(c.orders){d.orders=c.orders;try{await o.saveOrders(c.orders)}catch(e){}}
      if(c.cash!=null){d.cash=c.cash;try{await o.saveCash(c.cash)}catch(e){}}
      if(c.settings){localStorage.setItem('ms_settings_v1',JSON.stringify(c.settings));cache.settings=c.settings;window.dispatchEvent(new Event('ms-settings-changed'))}
      localStorage.setItem(tsKey,c.ts||Date.now()); take(d);
    } else { take(d); if(!empty&&R.cloud_sync)sched() }
    return d };
  L.saveMenu=function(m){cache.menu=m;sched();return o.saveMenu(m)};
  L.saveOrders=function(x){cache.orders=x;sched();return o.saveOrders(x)};
  L.saveCash=function(x){cache.cash=x;sched();return o.saveCash(x)};
  ['pickFolder','reconnect','importBackup'].forEach(function(k){ if(o[k])L[k]=async function(){var d=await o[k].apply(null,arguments); if(d){take(d);sched()} return d} });
  window.addEventListener('load',function(){
    window.logoutSystem=function(){ if(confirm('Logout karna chahte hain?')){ Promise.resolve(cl&&cl.auth.signOut()).catch(function(){}).then(function(){go('index.html')}) } };
  });
})();