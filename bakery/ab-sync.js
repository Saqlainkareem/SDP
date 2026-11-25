/* Alpha Bakers - page bootstrap (login gate + localStorage <-> Firebase sync)
   Usage in <head>:  <script src="ab-sync.js" data-pos="0"></script>
     data-pos="1"   POS page (syncs only 'hub' keys, POS handles orders/menu itself)
     data-login="1" login page (no gate, only defines window.__fbReady)
     data-sync="0"  gate only, no localStorage sync (ordermanage)           */
(function () {
  var cs = document.currentScript;
  var attr = function (n) { return cs ? cs.getAttribute(n) : null; };
  var POS = attr('data-pos') === '1', LOGIN = attr('data-login') === '1', SYNC = attr('data-sync') !== '0';
  window.__fbReady = new Promise(function (res) { window.__fbResolve = res; });

  /* ---------- diagnostics: every error is kept (localStorage 'diag_log', never synced) so it can be copied from Settings ---------- */
  if (!window.abDiag) {
    var DK = 'diag_log', DMAX = 300;
    var dRead = function () { try { return JSON.parse(localStorage.getItem(DK) || '[]'); } catch (e) { return []; } };
    var dRecent = {};
    window.abDiag = {
      log: function (type, msg, extra) {
        try {
          msg = String(msg == null ? '' : msg).slice(0, 600);
          var key = type + '|' + msg, now = Date.now();
          if (dRecent[key] && now - dRecent[key] < 3000) return;     // do not flood the log with the same line
          dRecent[key] = now;
          var a = dRead();
          a.push({ t: new Date().toISOString(), page: (location.pathname.split('/').pop() || 'index.html'), type: type, msg: msg, extra: extra ? String(extra).slice(0, 400) : '' });
          if (a.length > DMAX) a = a.slice(a.length - DMAX);
          localStorage.setItem(DK, JSON.stringify(a));
        } catch (e) {}
      },
      get: dRead,
      clear: function () { try { localStorage.removeItem(DK); } catch (e) {} },
      report: function () {
        var L = [], ls = window.localStorage, tot = 0, rows = [];
        try { Object.keys(ls).forEach(function (k) { var n = (ls.getItem(k) || '').length; tot += n; if (k.indexOf('ab_') === 0 || k.indexOf('alphabakers_') === 0) rows.push(k + ': ' + n + ' chars'); }); } catch (e) {}
        var net = window.abNet || {};
        L.push('=== ALPHA BAKERS DIAGNOSTIC REPORT ===');
        L.push('Time      : ' + new Date().toString());
        L.push('Page      : ' + location.href);
        L.push('User      : ' + (function () { try { return ls.getItem('fb_user') || '-'; } catch (e) { return '?'; } })());
        L.push('Browser   : ' + navigator.userAgent);
        L.push('Online    : ' + navigator.onLine + '   Net state: ' + (net.state || '?') + '   Ping: ' + (net.ms == null ? '--' : net.ms + ' ms') + '   Loss: ' + (net.loss == null ? '?' : net.loss + '%'));
        L.push('Firebase  : ' + (window.FB ? 'loaded' : 'NOT LOADED (check internet / open via http, not file://)') + '   Protocol: ' + location.protocol);
        L.push('Cloud sync: pending writes = ' + (window.__abPending || 0));
        L.push('Storage   : ' + Math.round(tot / 1024) + ' KB used in this browser (limit is about 5000 KB)');
        L.push('--- data keys ---'); rows.sort().forEach(function (r) { L.push(r); });
        var a = dRead();
        L.push('--- last ' + Math.min(a.length, 120) + ' log lines (oldest first) ---');
        a.slice(-120).forEach(function (x) { L.push(x.t + ' [' + x.page + '] ' + x.type.toUpperCase() + ': ' + x.msg + (x.extra ? ' | ' + x.extra : '')); });
        if (!a.length) L.push('(no errors logged)');
        return L.join('\n');
      }
    };
    window.addEventListener('error', function (e) { window.abDiag.log('error', (e.message || 'script error'), (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || '')); });
    window.addEventListener('unhandledrejection', function (e) { var r = e.reason; window.abDiag.log('promise', (r && (r.message || r.code)) || r, r && r.stack ? String(r.stack).split('\n').slice(0, 3).join(' / ') : ''); });
    ['error', 'warn'].forEach(function (lv) {
      var o = console[lv];
      console[lv] = function () {
        try { window.abDiag.log(lv === 'error' ? 'console' : 'warn', Array.prototype.slice.call(arguments).map(function (x) { return x && x.message ? x.message : (typeof x === 'object' ? JSON.stringify(x) : String(x)); }).join(' ')); } catch (e) {}
        return o.apply(console, arguments);
      };
    });
    window.abNet = window.abNet || { state: 'unknown', ms: null, loss: null };
    /* resolves when the connection is stable (or after maxMs) - used before cloud writes */
    window.abWaitNet = function (maxMs) {
      return new Promise(function (res) {
        var t0 = Date.now();
        (function chk() {
          var tn = null; try { tn = window.top.abNet; } catch (e) {} var st = (tn || window.abNet || {}).state;
          if (st === 'good' || st === 'unknown' || Date.now() - t0 > (maxMs || 90000)) return res();
          setTimeout(chk, 1500);
        })();
      });
    };
  }

  var _s = Storage.prototype.setItem, _r = Storage.prototype.removeItem, _g = Storage.prototype.getItem;
  var ls = window.localStorage;
  function toLogin() {
    var framed = false; try { framed = window.top !== window; } catch (e) { framed = true; }
    var n = framed ? 'index.html' : ((location.pathname.split('/').pop() || 'index.html') + location.search);
    (framed ? window.top : window).location.replace('login.html?next=' + encodeURIComponent(n));
  }
  if (LOGIN) return;
  if (!_g.call(ls, 'fb_user')) { document.documentElement.style.display = 'none'; toLogin(); return; }

  window.addEventListener('fb-ready', function () {});
  if (!SYNC) {
    window.__fbReady.then(function (FB) { return FB.authReady; }).then(function (u) {
      if (!u) { _r.call(ls, 'fb_user'); toLogin(); }
    });
    return;
  }

  var firstTime = !_g.call(ls, 'fb_synced');
  var st = document.createElement('style');
  st.textContent = 'html.ab-wait body{visibility:hidden}';
  document.head.appendChild(st);
  if (firstTime) document.documentElement.classList.add('ab-wait');
  function reveal() { document.documentElement.classList.remove('ab-wait'); }
  setTimeout(reveal, 6000);

  var pulled = false, queue = {}, cloud = {}, base = {}, chain = {};

  /* ---- merge: two devices editing the same list (stock, suppliers ...) must not wipe each other ----
     3-way merge by item id: base = what THIS page last knew, local = what it wants to save, remote = cloud now.
     Only the fields/items this page changed are applied on top of the cloud copy.                        */
  function parseList(str) {
    try { var a = JSON.parse(str); return Array.isArray(a) ? a : null; } catch (e) { return null; }
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function isRec(x) { return x && typeof x === 'object' && !Array.isArray(x) && x.id !== undefined && x.id !== null; }
  /* identity of a list element: its id, or (for id-less rows such as stock movements) its content + occurrence number */
  function keyed(a) {
    var cnt = {}, list = [], map = {};
    a.forEach(function (x) {
      var k;
      if (isRec(x)) k = 'i:' + x.id; else { var h = 'h:' + JSON.stringify(x); cnt[h] = (cnt[h] || 0) + 1; k = h + '#' + cnt[h]; }
      list.push({ k: k, v: x }); map[k] = x;
    });
    return { list: list, map: map };
  }
  function mergeLists(baseA, localA, remoteA) {
    var B = keyed(baseA), L = keyed(localA), R = keyed(remoteA), out = [], seen = {};
    R.list.forEach(function (e) {
      var k = e.k, r = e.v; seen[k] = 1;
      var inB = k in B.map, inL = k in L.map, b = B.map[k], l = L.map[k];
      if (inB && !inL) return;                               // deleted on this device
      if (!inB || !inL) { out.push(r); return; }             // untouched here (or added elsewhere)
      if (same(b, l) || !isRec(r) || !isRec(l) || !isRec(b)) { out.push(same(b, l) ? r : l); return; }   // not changed here: keep cloud copy
      var m = {}; Object.keys(r).forEach(function (f) { m[f] = r[f]; });
      Object.keys(l).forEach(function (f) {
        if (same(l[f], b[f])) return;                        // field not changed here
        if ((f === 'qty' || f === 'pieces') && typeof l[f] === 'number' && typeof b[f] === 'number' && typeof r[f] === 'number') m[f] = Math.round((r[f] + (l[f] - b[f]) + Number.EPSILON) * 1e6) / 1e6;  // both changed stock: add the difference
        else m[f] = l[f];
      });
      Object.keys(b).forEach(function (f) { if (!(f in l)) delete m[f]; });
      out.push(m);
    });
    L.list.forEach(function (e) { if (!seen[e.k] && !(e.k in B.map)) out.push(e.v); });   // new here
    return out;
  }
  function doSend(k, v) {
    return window.__fbReady.then(function (FB) {
      if (v === null) { delete base[k]; return FB.remove('hub/' + k); }
      var localA = parseList(v), baseA = base[k] !== undefined ? parseList(base[k]) : null;
      if (!localA || !baseA) { base[k] = v; return FB.set('hub/' + k, v); }
      return FB.node('hub/' + k).then(function (cur) {
        var remoteA = typeof cur === 'string' ? parseList(cur) : null;
        var out = v;
        if (remoteA && !same(remoteA, baseA)) out = JSON.stringify(mergeLists(baseA, localA, remoteA));
        base[k] = v;                                         // base = what this page holds (it does not reload merged data)
        return FB.set('hub/' + k, out);
      });
    });
  }
  window.__abPending = 0;
  window.addEventListener('beforeunload', function (e) { if (window.__abPending > 0) { e.preventDefault(); e.returnValue = ''; return ''; } });
  function send(k, v) {
    window.__abPending++;
    chain[k] = (chain[k] || Promise.resolve())
      .then(function () { return window.abWaitNet(90000); })         // wait for a stable connection before writing
      .then(function () { return doSend(k, v); })
      .catch(function (e) { window.abDiag.log('sync', 'cloud save failed for ' + k + ': ' + (e && e.message || e), 'will retry on next save'); })
      .then(function () { window.__abPending = Math.max(0, window.__abPending - 1); });
  }
  function push(k, v) {
    if (k.indexOf('ab_') !== 0) return;
    if (!pulled) { queue[k] = v; return; }
    send(k, v);
  }
  Storage.prototype.setItem = function (k, v) { _s.call(this, k, v); if (this === ls) push(k, String(v)); };
  Storage.prototype.removeItem = function (k) { _r.call(this, k); if (this === ls) push(k, null); };

  window.__fbReady.then(function (FB) { return FB.authReady; }).then(function (u) {
    if (!u) { _r.call(ls, 'fb_user'); toLogin(); return; }
    return window.__fbReady.then(function (FB) { return FB.pull(POS); }).then(function (d) {
      var changed = false;
      function put(k, v) { if (_g.call(ls, k) !== v) { _s.call(ls, k, v); changed = true; } }
      Object.keys(d.hub || {}).forEach(function (k) { cloud[k] = 1; base[k] = d.hub[k]; put(k, d.hub[k]); });
      if (!POS) {
        if (d.orders) put('alphabakers_pos_orders_v1', JSON.stringify(Object.keys(d.orders).map(function (k) { return d.orders[k]; })));
        if (d.menu) put('alphabakers_pos_menu_v1', JSON.stringify(d.menu));
      }
      pulled = true;
      Object.keys(queue).forEach(function (k) { if (!cloud[k]) send(k, queue[k]); });   // new keys only - cloud data is never overwritten by seed data
      queue = {};
      _s.call(ls, 'fb_synced', '1');
      var last = +(_g.call(ls, 'fb_reload_t') || 0);
      if (changed && Date.now() - last > 20000) { _s.call(ls, 'fb_reload_t', String(Date.now())); location.reload(); }
      else reveal();
    });
  }).catch(function (e) { window.abDiag.log('sync', 'initial sync failed: ' + (e && e.message || e)); pulled = true; Object.keys(queue).forEach(function (k) { send(k, queue[k]); }); queue = {}; reveal(); });
})();
