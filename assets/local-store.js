/* M Siddique Nihari House - Offline Local Store
   Data is saved in a folder chosen by the user (File System Access API).
   A mirror copy is kept in the browser (IndexedDB) as a safety net.
   No internet / no Firebase / no cloud database is used anywhere. */
(function () {
  'use strict';
  var DB_NAME = 'ms_nihari_pos', STORE = 'kv';
  var supported = typeof window.showDirectoryPicker === 'function';
  var dirHandle = null, folderName = '', state = supported ? 'nofolder' : 'unsupported', lastError = '';
  var listeners = [], chain = Promise.resolve(), written = {}, monthsOnDisk = {};

  function setState(s, err) { state = s; lastError = err || ''; listeners.forEach(function (f) { try { f(info()); } catch (e) {} }); }
  function info() { return { state: state, folder: folderName, error: lastError, supported: supported }; }

  /* ---------- IndexedDB (browser mirror + folder handle) ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(k) {
    return idb().then(function (db) { return new Promise(function (res) {
      var q = db.transaction(STORE).objectStore(STORE).get(k);
      q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); };
    }); }).catch(function () { return undefined; });
  }
  function idbSet(k, v) {
    return idb().then(function (db) { return new Promise(function (res) {
      var tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k);
      tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); };
    }); }).catch(function () { return false; });
  }

  /* ---------- Folder helpers ---------- */
  function monthOf(o) { return (o && o.date && /^\d{4}-\d{2}/.test(o.date)) ? o.date.slice(0, 7) : 'unknown'; }
  function readJSON(name) {
    return dirHandle.getFileHandle(name).then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); }).then(function (t) { return JSON.parse(t); })
      .catch(function (e) { if (e && e.name === 'NotFoundError') return undefined; if (e instanceof SyntaxError) return undefined; throw e; });
  }
  function writeFile(name, text) {
    return dirHandle.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(text).then(function () { return w.close(); }); });
  }
  async function readFolder() {
    var out = { found: false, menu: undefined, orders: [], cash: undefined };
    var m = await readJSON('menu.json'); if (m) { out.menu = m; out.found = true; }
    var s = await readJSON('settings.json'); if (s && s.openingCash !== undefined) { out.cash = s.openingCash; out.found = true; }
    monthsOnDisk = {};
    for await (var entry of dirHandle.entries()) {
      var name = entry[0];
      if (entry[1].kind === 'file' && /^orders_(\d{4}-\d{2}|unknown)\.json$/.test(name)) {
        var arr = await readJSON(name);
        if (Array.isArray(arr)) { out.orders = out.orders.concat(arr); out.found = true; monthsOnDisk[name.slice(7, -5)] = true; written[name] = JSON.stringify(arr); }
      }
    }
    return out;
  }
  function mergeOrders(a, b) {
    var seen = {}, res = [];
    (a || []).concat(b || []).forEach(function (o) { var k = String(o.id); if (!seen[k]) { seen[k] = 1; res.push(o); } });
    return res;
  }
  function enqueue(fn) { chain = chain.then(fn).catch(function (e) { handleErr(e); }); return chain; }
  function handleErr(e) {
    console.warn('Folder write failed', e);
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) setState('needperm');
    else setState('error', (e && e.message) || 'Write failed');
  }
  async function writeIfChanged(name, text) {
    if (written[name] === text) return;
    await writeFile(name, text); written[name] = text;
  }
  async function writeAll(menu, orders, cash) {
    if (!dirHandle) return;
    if (menu) await writeIfChanged('menu.json', JSON.stringify(menu));
    await writeIfChanged('settings.json', JSON.stringify({ openingCash: cash || 0 }));
    await writeOrdersFiles(orders || []);
  }
  async function writeOrdersFiles(orders) {
    var groups = {};
    orders.forEach(function (o) { var m = monthOf(o); (groups[m] = groups[m] || []).push(o); });
    Object.keys(monthsOnDisk).forEach(function (m) { if (!groups[m]) groups[m] = []; });
    for (var m in groups) {
      var name = 'orders_' + m + '.json', text = JSON.stringify(groups[m]);
      if (groups[m].length === 0 && !monthsOnDisk[m]) continue;
      await writeIfChanged(name, text); monthsOnDisk[m] = true;
    }
  }
  async function dailyBackup(menu, orders, cash) {
    try {
      var d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var bdir = await dirHandle.getDirectoryHandle('backup', { create: true });
      try { await bdir.getFileHandle('backup_' + day + '.json'); return; } catch (e) {}
      var fh = await bdir.getFileHandle('backup_' + day + '.json', { create: true });
      var w = await fh.createWritable(); await w.write(JSON.stringify({ menu: menu, orders: orders, openingCash: cash })); await w.close();
    } catch (e) { console.warn('backup skipped', e); }
  }

  /* ---------- Public API ---------- */
  var mem = { menu: null, orders: [], cash: 0 };

  async function loadAfterConnect(isPick) {
    var cached = { menu: await idbGet('menu'), orders: (await idbGet('orders')) || [], cash: await idbGet('cash') };
    var f = await readFolder();
    if (f.found) {
      mem.menu = f.menu || cached.menu || null;
      mem.orders = isPick ? mergeOrders(f.orders, cached.orders) : f.orders;
      mem.cash = f.cash !== undefined ? f.cash : (cached.cash || 0);
    } else {
      mem.menu = cached.menu || null; mem.orders = cached.orders; mem.cash = cached.cash || 0;
    }
    await idbSet('menu', mem.menu); await idbSet('orders', mem.orders); await idbSet('cash', mem.cash);
    await enqueue(function () { return writeAll(mem.menu, mem.orders, mem.cash); });
    dailyBackup(mem.menu, mem.orders, mem.cash);
    folderName = dirHandle.name; setState('connected');
    return { found: f.found, data: mem };
  }

  var api = {
    supported: supported,
    onStatus: function (fn) { listeners.push(fn); fn(info()); },
    info: info,
    async init() {
      var h = supported ? await idbGet('dirHandle') : null;
      if (h) {
        folderName = h.name;
        try {
          var p = await h.queryPermission({ mode: 'readwrite' });
          if (p === 'granted') { dirHandle = h; var r = await loadAfterConnect(false); return r.data; }
        } catch (e) { console.warn(e); }
        setState('needperm');
      }
      mem.menu = (await idbGet('menu')) || null; mem.orders = (await idbGet('orders')) || []; mem.cash = (await idbGet('cash')) || 0;
      return mem;
    },
    async reconnect() {          // must be called from a click
      var h = await idbGet('dirHandle'); if (!h) return api.pickFolder();
      var p = await h.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') return null;
      dirHandle = h; return (await loadAfterConnect(false)).data;
    },
    async pickFolder() {         // must be called from a click
      if (!supported) return null;
      var h;
      try { h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'ms-nihari-pos' }); }
      catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
      dirHandle = h; written = {}; await idbSet('dirHandle', h);
      var r = await loadAfterConnect(true); r.data.foundExisting = r.found; return r.data;
    },
    saveMenu: function (menu) {
      mem.menu = menu; idbSet('menu', menu);
      return enqueue(function () { return dirHandle && state !== 'needperm' ? writeIfChanged('menu.json', JSON.stringify(menu)) : null; });
    },
    saveCash: function (cash) {
      mem.cash = cash; idbSet('cash', cash);
      return enqueue(function () { return dirHandle && state !== 'needperm' ? writeIfChanged('settings.json', JSON.stringify({ openingCash: cash })) : null; });
    },
    saveOrders: function (orders) {
      mem.orders = orders; idbSet('orders', orders);
      return enqueue(function () { return dirHandle && state !== 'needperm' ? writeOrdersFiles(orders) : null; });
    },
    exportBackup: function () {
      var blob = new Blob([JSON.stringify({ menu: mem.menu, orders: mem.orders, openingCash: mem.cash })], { type: 'application/json' });
      var a = document.createElement('a'), d = new Date();
      a.href = URL.createObjectURL(blob); a.download = 'ms_pos_backup_' + d.toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    async importBackup(file) {
      var j = JSON.parse(await file.text());
      mem.menu = j.menu || mem.menu; mem.orders = mergeOrders(mem.orders, j.orders || []); mem.cash = j.openingCash !== undefined ? j.openingCash : mem.cash;
      await idbSet('menu', mem.menu); await idbSet('orders', mem.orders); await idbSet('cash', mem.cash);
      if (dirHandle) await enqueue(function () { return writeAll(mem.menu, mem.orders, mem.cash); });
      return mem;
    }
  };
  window.LocalStore = api;
})();
