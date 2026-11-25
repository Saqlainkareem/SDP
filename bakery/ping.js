/* Alpha Bakers - live internet ping badge (wifi icon + ms, like in games) */
(function () {
  try { if (window.top !== window) return; } catch (e) { return; }   /* the badge lives in index.html only */
  var URL = 'https://www.gstatic.com/generate_204';
  var hist = [], lost = 0, total = 0, last = null, busy = false;
  var css = document.createElement('style');
  css.textContent =
    '#ab-ping{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:6px;background:rgba(15,23,42,.92);color:#fff;border-radius:99px;padding:4px 11px 4px 8px;font:700 12px/1 system-ui,Segoe UI,Arial,sans-serif;box-shadow:0 2px 10px #0004;cursor:pointer;user-select:none;-webkit-user-select:none}' +
    '#ab-net-bar{position:fixed;top:0;left:0;right:0;z-index:2147482999;display:none;padding:34px 12px 8px;text-align:center;font:700 13px/1.4 system-ui,Segoe UI,Arial,sans-serif;color:#fff;box-shadow:0 3px 12px #0005}' +
    '#ab-net-bar.slow{display:block;background:#b45309}#ab-net-bar.off{display:block;background:#b91c1c}' +
    '#ab-ping .tip button{display:block;width:100%;margin-top:6px;padding:6px 8px;border:0;border-radius:7px;background:#334155;color:#fff;font:700 11px system-ui;cursor:pointer}' +
    '#ab-ping svg{width:20px;height:20px;display:block}#ab-ping .ms{min-width:44px;text-align:right}' +
    '#ab-ping .tip{display:none;position:absolute;top:34px;left:50%;transform:translateX(-50%);background:#0f172a;color:#e2e8f0;border-radius:10px;padding:9px 12px;font:600 11px/1.6 system-ui,Arial;white-space:nowrap;box-shadow:0 6px 20px #0006}' +
    '#ab-ping.open .tip{display:block}';
  document.head.appendChild(css);
  var el = document.createElement('div');
  el.id = 'ab-ping';
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round">' +
    '<path class="a4" d="M2 8.8a15 15 0 0 1 20 0"/><path class="a3" d="M5 12.2a10.5 10.5 0 0 1 14 0"/><path class="a2" d="M8.5 15.6a5.5 5.5 0 0 1 7 0"/>' +
    '<circle class="a1" cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/><path class="x" d="M4 4l16 16" style="display:none"/></svg>' +
    '<span class="ms">--</span><span class="lbl"></span><div class="tip"></div>';
  el.onclick = function (e) { if (e.target.tagName === 'BUTTON') return; el.classList.toggle('open'); };
  var svg = el.querySelector('svg'), ms = el.querySelector('.ms'), lbl = el.querySelector('.lbl'), tip = el.querySelector('.tip');

  var bar = document.createElement('div'); bar.id = 'ab-net-bar';
  function place() { document.body.appendChild(bar); document.body.appendChild(el); }
  function level(v) {
    if (v === null) return { bars: 0, c: '#ef4444', t: 'Offline', u: 'No internet connection' };
    if (v < 80) return { bars: 4, c: '#22c55e', t: 'Excellent', u: 'Excellent connection' };
    if (v < 160) return { bars: 3, c: '#84cc16', t: 'Good', u: 'Good connection' };
    if (v < 320) return { bars: 2, c: '#f59e0b', t: 'Slow', u: 'Slow connection' };
    return { bars: 1, c: '#ef4444', t: 'Poor', u: 'Poor connection' };
  }
  function draw() {
    var ok = hist.filter(function (x) { return x !== null; });
    var avg = ok.length ? Math.round(ok.reduce(function (a, b) { return a + b; }, 0) / ok.length) : null;
    var shown = last === null ? null : Math.round(ok.slice(-3).reduce(function (a, b) { return a + b; }, 0) / Math.max(1, ok.slice(-3).length));
    var L = level(shown);
    svg.style.color = L.c; svg.setAttribute('stroke', L.c);
    svg.querySelector('.a1').style.opacity = L.bars >= 1 ? 1 : .25;
    svg.querySelector('.a2').style.opacity = L.bars >= 2 ? 1 : .22;
    svg.querySelector('.a3').style.opacity = L.bars >= 3 ? 1 : .22;
    svg.querySelector('.a4').style.opacity = L.bars >= 4 ? 1 : .22;
    svg.querySelector('.x').style.display = shown === null ? 'block' : 'none';
    ms.textContent = shown === null ? 'Offline' : shown + ' ms';
    ms.style.color = L.c; lbl.textContent = '';
    var jit = 0; if (ok.length > 1) { for (var i = 1; i < ok.length; i++) jit += Math.abs(ok[i] - ok[i - 1]); jit = Math.round(jit / (ok.length - 1)); }
    tip.innerHTML = '<b style="color:' + L.c + '">' + L.t + '</b> - ' + L.u + '<br>Ping: ' + (shown === null ? '--' : shown + ' ms') + '<br>Average: ' + (avg === null ? '--' : avg + ' ms') +
      '<br>Jitter: ' + jit + ' ms<br>Packet loss: ' + (total ? Math.round(lost * 100 / total) : 0) + '%' +
      '<button type="button" id="ab-copy-rep">Copy problem report</button>';
    var cb = tip.querySelector('#ab-copy-rep');
    if (cb) cb.onclick = function () { copyText(window.abDiag ? window.abDiag.report() : 'no diagnostics'); cb.textContent = 'Copied \u2713'; setTimeout(function () { cb.textContent = 'Copy problem report'; }, 1500); };
    publish(shown, L, ok);
  }
  function copyText(t) {
    try { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t); } catch (e) {}
    var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }
  var goodRun = 0, prevState = 'unknown';
  function publish(shown, L, ok) {
    if (!total) return;
    var recent = hist.slice(-5), bad = recent.filter(function (x) { return x === null; }).length;
    var st;
    if (shown === null) st = 'offline';
    else if (shown >= 320 || bad >= 2) st = 'slow';
    else st = 'good';
    if (st === 'good') { goodRun++; if (prevState !== 'good' && goodRun < 2 && prevState !== 'unknown') st = prevState; } else goodRun = 0;   // need 2 good probes in a row = stable
    window.abNet = { state: st, ms: shown, loss: total ? Math.round(lost * 100 / total) : 0 };
    if (st !== prevState) {
      if (window.abDiag && prevState !== 'unknown') window.abDiag.log('net', 'connection ' + prevState + ' -> ' + st, 'ping ' + (shown === null ? 'none' : shown + 'ms'));
      prevState = st;
    }
    bar.className = st === 'offline' ? 'off' : st === 'slow' ? 'slow' : '';
    bar.textContent = st === 'offline' ? '\u26A0 No internet. Please wait for a stable connection \u2013 data is kept on this device and will be saved to the cloud automatically when the internet is back.'
      : st === 'slow' ? '\u26A0 Internet is slow / unstable. Please wait for a stable connection before closing this page \u2013 saving to the cloud is on hold until it is stable.' : '';
  }
  function probe() {
    if (busy) return; busy = true;
    if (navigator.onLine === false) { record(null); busy = false; return; }
    var t0 = performance.now(), ctl = ('AbortController' in window) ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch(URL + '?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function () { record(Math.max(1, Math.round(performance.now() - t0))); })
      .catch(function () { record(null); })
      .then(function () { clearTimeout(to); busy = false; });
  }
  function record(v) {
    total++; if (v === null) lost++; last = v; hist.push(v); if (hist.length > 12) hist.shift();
    if (total > 200) { total = 100; lost = Math.round(lost / 2); }
    draw();
  }
  function start() { place(); draw(); probe(); setInterval(probe, 4000);
    window.addEventListener('online', probe); window.addEventListener('offline', function () { record(null); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
