/* POS Settings: business info, logo, receipt, printer, feature on/off. Saved locally + synced online via cloud.js */
(function () {
  var KEY = 'ms_settings_v1';
  var DEF = {
    name: 'Scalesoft', tagline: '', address: '',
    phone: '', thanks: 'Thank You for Your Order!', footer: '', logo: '', lockPin: '', locks: {},
    showLogo: true, showCopy: true, showDev: true, showInv: true, showDate: true, showType: true, showCust: true, showPhone: true, showAddr: true, showKitchen: true,
    paper: '80', scale: 100, copies: 1, autoPrint: false, bottomGap: 18,
    fDiscount: true, fDelivery: true, fCustName: true, fType: true, fPay: true, fOwnerPhone: true
  };
  var $ = function (i) { return document.getElementById(i); };
  function get() { var o = {}; try { o = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {} return Object.assign({}, DEF, o); }
  function put(s) { localStorage.setItem(KEY, JSON.stringify(s)); if (window.CloudBridge) CloudBridge.settingsSaved(s); applyAll(); }
  var deliveryOpt = null, flag = false;

  function show(el, on) { if (el) { if (on) el.style.removeProperty('display'); else el.style.setProperty('display', 'none', 'important'); } }
  function applyFeatures() {
    var s = get();
    show($('row-discount'), s.fDiscount); if (!s.fDiscount && $('discount-input') && $('discount-input').value !== '0') { $('discount-input').value = 0; if (window.updateCartCalculations) updateCartCalculations(); }
    var sel = $('bill-type-select');
    if (sel) {
      var opt = sel.querySelector('option[value="Delivery"]');
      if (opt) deliveryOpt = opt;
      if (!s.fDelivery) {
        if (opt) { if (sel.value === 'Delivery') sel.value = 'Takeaway'; opt.remove(); }
        if ($('delivery-charge-input')) $('delivery-charge-input').value = 0;
        show($('delivery-charge-row'), false); if (window.updateCartCalculations) updateCartCalculations();
      } else {
        show($('delivery-charge-row'), true);
        if (!opt && deliveryOpt) sel.insertBefore(deliveryOpt, sel.querySelector('option[value="Catering"]'));
      }
    }
    show($('cust-name-input'), s.fCustName); show($('bill-type-select'), s.fType); show($('payment-method-select'), s.fPay);
    show($('row-type-pay'), s.fType || s.fPay); show($('row-owner-phone'), s.fOwnerPhone);
    if ($('header-title')) $('header-title').textContent = s.name.toUpperCase(); document.title = s.name + ' - POS';
    if ($('owner-phone-input')) $('owner-phone-input').value = s.phone;
    var lg = $('main-brand-logo'); if (lg) lg.src = s.logo || 'logo.svg';
  }
  function applyReceipt() {
    var s = get(), t = function (id, v) { if ($(id)) $(id).textContent = v; };
    t('slip-name', s.name); t('slip-tag', s.tagline); t('slip-addr', s.address); t('slip-thanks', s.thanks); t('slip-foot', s.footer);
    if ($('slip-logo')) $('slip-logo').src = s.logo || 'logo.svg';
    show($('slip-logo'), s.showLogo); show($('slip-tag'), !!s.tagline); show($('slip-addr'), s.showAddr && !!s.address); show($('slip-copy'), s.showCopy); show($('slip-dev'), s.showDev);
    show($('slip-foot'), !!s.footer); show($('slip-thanks'), !!s.thanks);
    if ($('slip-owner-phone')) { $('slip-owner-phone').textContent = 'Ph: ' + s.phone; show($('slip-owner-phone'), s.showPhone && !!s.phone); }
    show($('slip-r-inv'), s.showInv); show($('slip-r-date'), s.showDate); show($('slip-r-type'), s.showType); show($('slip-r-cust'), s.showCust);
    show($('slip-r-disc'), s.fDiscount); show($('slip-kitchen-tokens-container'), s.showKitchen);
    var c = $('modal-invoice-content');
    if (c) {
      c.style.width = s.paper === '58' ? '236px' : ''; c.style.margin = s.paper === '58' ? '0 auto' : '';
      c.querySelectorAll('td,th').forEach(function (e) { if (/padding-right:\s*(8mm|2mm)|padding:\s*2px (8mm|2mm) 2px 0/.test(e.getAttribute('style') || '')) e.setAttribute('style', e.getAttribute('style').replace(/(8mm|2mm)/g, s.paper === '58' ? '2mm' : '8mm')); });
    }
  }
  function applyAll() { applyFeatures(); applyReceipt(); applyLocks(); }

  function doPrint() {
    applyReceipt(); var s = get(), w = s.paper === '58' ? 48 : 72, html = $('modal-invoice-content').innerHTML, parts = [];
    for (var i = 0; i < (+s.copies || 1); i++) parts.push('<div>' + html + '</div>');
    var win = window.open('', '_blank', 'width=380,height=600');
    if (!win) { window.print(); return; }
    win.document.open();
    win.document.write('<!DOCTYPE html><html><head><title>Receipt</title><style>*{box-sizing:border-box!important;margin:0;padding:0}html,body{width:' + w + 'mm;margin:0 auto;padding:1mm 2mm ' + s.bottomGap + 'mm 2mm;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;line-height:1.25;zoom:' + (s.scale / 100) + ';-webkit-print-color-adjust:exact}img{max-width:44px;height:auto;display:block;margin:0 auto;border-radius:9999px}.text-center{text-align:center}.text-right{text-align:right}.text-left{text-align:left}.receipt-table{width:100%;border-collapse:collapse;margin:2px 0;font-size:10px;font-weight:bold;color:#000}.receipt-table td,.receipt-table th{padding:2px 0;vertical-align:top}.hidden{display:none!important}.page-break{display:block;page-break-after:always;break-after:page;height:0;margin:10px 0;border-bottom:1px dashed #000}.copy-break{page-break-after:always;break-after:page;height:0}@media print{.page-break{margin:0;border:none}@page{size:' + s.paper + 'mm auto;margin:0}}</style></head><body>' + parts.join('<div class="copy-break"></div>') + '<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close()},500)}<\/script></body></html>');
    win.document.close();
  }


  /* ---------- LOCK SYSTEM (PIN) ---------- */
  var LOCKS = [
    { k: 'stats', n: 'Sales stats (upar ka section)', sel: '#stats-section-row' },
    { k: 'detail', n: 'Detail stats panel', sel: '#detailed-stats-panel' },
    { k: 'stock', n: 'New stock / Prepared stock board', sel: '#modal-prep-board' },
    { k: 'report', n: 'Daily / Monthly detail report', sel: '#modal-detail-report' },
    { k: 'saman', n: 'Daily Saman list', sel: '#daily-saman-summary-card' },
    { k: 'ledger', n: 'Printed bills list (Ledger)', sel: '#ledger-section-card' },
    { k: 'reset', n: 'Reset Stock button', sel: 'button[onclick="triggerEODStockClear()"]' },
    { k: 'folder', n: 'Data folder / backup', sel: '#select-folder-btn' }
  ], unlocked = {}, RELOCK = 10 * 60 * 1000;
  function isOpen(k) { return unlocked[k] && Date.now() - unlocked[k] < RELOCK; }
  function askPin(cb) {
    var s = get(), d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483004;background:#020617cc;backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:14px';
    d.innerHTML = '<div style="background:#fff;border-radius:18px;padding:22px;max-width:320px;width:100%;text-align:center;font-family:sans-serif;animation:mpop .25s"><div style="font-size:38px">🔒</div><h3 style="margin:4px 0 10px">Locked</h3><input type="password" inputmode="numeric" placeholder="PIN likhein" style="width:100%;padding:11px;border:2px solid #cbd5e1;border-radius:10px;text-align:center;font-size:18px;letter-spacing:6px"><p class="e" style="color:#e11d48;font-weight:700;min-height:18px;margin:6px 0"></p><button class="ok" style="background:#059669;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:800;cursor:pointer">Unlock</button> <button class="no" style="background:#e2e8f0;border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer">Cancel</button></div>';
    document.body.appendChild(d); var i = d.querySelector('input'); i.focus();
    function go() { if (i.value === s.lockPin) { d.remove(); cb(); } else { d.querySelector('.e').textContent = 'Galat PIN'; i.value = ''; d.firstChild.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], { duration: 250 }); } }
    d.querySelector('.ok').onclick = go; d.querySelector('.no').onclick = function () { d.remove(); }; i.onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }
  function applyLocks() {
    var s = get(), lk = s.locks || {}, has = !!s.lockPin;
    LOCKS.forEach(function (L) {
      var on = has && lk[L.k] && !isOpen(L.k);
      document.querySelectorAll(L.sel).forEach(function (el) {
        var ov = el.querySelector(':scope > .ms-lockov');
        if (on && !ov) {
          if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
          ov = document.createElement('div'); ov.className = 'ms-lockov';
          var small = el.offsetWidth && el.offsetWidth < 150;
          ov.style.cssText = 'position:absolute;inset:0;z-index:60;background:rgba(15,23,42,.38);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;color:#fff;font:800 ' + (small ? '11' : '15') + 'px sans-serif;border-radius:inherit;text-shadow:0 2px 8px #000a;animation:mpop .3s';
          ov.innerHTML = '<span style="font-size:' + (small ? 14 : 30) + 'px">🔒</span>' + (small ? '' : '<span>LOCK</span><span style="font-size:11px;font-weight:600;opacity:.85">Click karke PIN likhein</span>');
          ov.onclick = function (e) { e.stopPropagation(); e.preventDefault(); askPin(function () { unlocked[L.k] = Date.now(); applyLocks(); }); };
          el.appendChild(ov);
        } else if (!on && ov) ov.remove();
      });
    });
  }
  setInterval(applyLocks, 1500);

  /* ---------- UI ---------- */
  var css = '#mss{position:fixed;inset:0;background:#020617b3;backdrop-filter:blur(4px);z-index:100000;display:none;align-items:center;justify-content:center;padding:12px}#mss.on{display:flex}#mss .bx{background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;animation:mpop .25s ease}@keyframes mpop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}#mss .hd{background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:14px 18px;font-weight:800;display:flex;justify-content:space-between;align-items:center}#mss .tb{display:flex;gap:4px;padding:8px 10px 0;background:#f1f5f9;overflow-x:auto}#mss .tb button{border:0;background:none;padding:9px 14px;font-weight:800;font-size:12px;color:#64748b;cursor:pointer;border-radius:10px 10px 0 0;white-space:nowrap}#mss .tb button.on{background:#fff;color:#1e3a8a}#mss .bd{padding:14px 18px;overflow:auto;flex:1}#mss label.f{display:block;font-size:11px;font-weight:800;color:#475569;margin-top:10px;text-transform:uppercase}#mss input[type=text],#mss input[type=number],#mss select{width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-top:3px}#mss .sw{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a}#mss .sw input{appearance:none;width:42px;height:24px;background:#cbd5e1;border-radius:99px;position:relative;cursor:pointer;transition:.2s;flex:none}#mss .sw input:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s}#mss .sw input:checked{background:#059669}#mss .sw input:checked:after{left:21px}#mss .ft{padding:12px 18px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #e2e8f0;flex-wrap:wrap}#mss .ft button{border:0;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer;font-size:13px}#mss .pn{display:none;animation:mpop .2s}#mss .pn.on{display:block}#mss small{color:#64748b}';
  var SW = function (k, label) { return '<div class="sw"><span>' + label + '</span><input type="checkbox" data-k="' + k + '"></div>'; };
  var TX = function (k, label) { return '<label class="f">' + label + '<input type="text" data-k="' + k + '"></label>'; };
  function build() {
    if ($('mss')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'mss';
    d.innerHTML = '<div class="bx"><div class="hd"><span><i class="fa-solid fa-gear"></i> POS Settings</span><button onclick="MSSettings.close()" style="background:none;border:0;color:#fff;font-size:22px;cursor:pointer">&times;</button></div>' +
      '<div class="tb"><button data-p="0" class="on">Business</button><button data-p="1">Receipt</button><button data-p="2">Printer</button><button data-p="3">Features</button><button data-p="4">Locks</button></div><div class="bd">' +
      '<div class="pn on" data-p="0">' + TX('name', 'Restaurant name') + TX('tagline', 'Tagline') + TX('address', 'Address') + TX('phone', 'Phone number(s)') +
      '<label class="f">Logo (image upload)<input type="file" id="mss-logo" accept="image/*" style="margin-top:4px"></label><div style="display:flex;gap:10px;align-items:center;margin-top:8px"><img id="mss-lp" style="height:56px;width:56px;border-radius:50%;border:2px solid #cbd5e1;object-fit:contain"><button type="button" id="mss-lr" style="border:0;background:#fee2e2;color:#991b1b;border-radius:8px;padding:6px 10px;font-weight:800;cursor:pointer;font-size:12px">Default logo</button></div></div>' +
      '<div class="pn" data-p="1">' + TX('thanks', 'Thank-you line') + TX('footer', 'Footer line') + SW('showLogo', 'Logo dikhayen') + SW('showAddr', 'Address dikhayen') + SW('showPhone', 'Phone dikhayen') + SW('showCopy', '"Customer Copy" badge') + SW('showInv', 'Invoice no') + SW('showDate', 'Date / time') + SW('showType', 'Order type & payment') + SW('showCust', 'Customer name') + SW('showKitchen', 'Kitchen token print karein') + SW('showDev', 'Developer line (Scale Soft Group)') + '</div>' +
      '<div class="pn" data-p="2"><label class="f">Paper size<select data-k="paper"><option value="80">80 mm (BIXOLON / standard)</option><option value="58">58 mm (small)</option></select></label>' +
      '<label class="f">Text size (%)<input type="number" data-k="scale" min="70" max="150" step="5"></label><label class="f">Copies<input type="number" data-k="copies" min="1" max="5"></label><label class="f">Neeche khali jagah (mm)<input type="number" data-k="bottomGap" min="0" max="40"></label>' + SW('autoPrint', 'Bill banate hi auto print') + '<p><small>Printer ka naam Chrome print dialog mein chunein. "Test Receipt" se preview dekhein.</small></p></div>' +
      '<div class="pn" data-p="3"><p><small>Jo band karenge wo billing screen aur receipt se hat jayega.</small></p>' + SW('fDiscount', 'Discount') + SW('fDelivery', 'Delivery charges / Delivery order') + SW('fCustName', 'Customer name box') + SW('fType', 'Order type (Takeaway / Dine-In...)') + SW('fPay', 'Payment method') + SW('fOwnerPhone', 'Owner contact box') + '</div>' +
      '<div class="pn" data-p="4"><p><small>PIN set karke jo sections lock karne hain chunein. Lock wale hisse blur ho jate hain aur click par PIN mangta hai (10 minute baad dobara lock). Settings kholne ke liye bhi yehi PIN chahiye hoga.</small></p>' + TX('lockPin', 'Lock PIN (kam az kam 4 digits)') + LOCKS.map(function (l) { return SW('lock_' + l.k, l.n); }).join('') + '</div>' +
      '</div><div class="ft"><button style="background:#f1f5f9" onclick="MSSettings.reset()">Reset</button><button style="background:#e0e7ff;color:#3730a3" onclick="MSSettings.test()">Test Receipt</button><button style="background:#059669;color:#fff" onclick="MSSettings.save()">Save</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('.tb').onclick = function (e) { var p = e.target.dataset.p; if (p == null) return; d.querySelectorAll('.tb button,.pn').forEach(function (x) { x.classList.toggle('on', x.dataset.p === p); }); };
    $('mss-logo').onchange = function () {
      var f = this.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { var im = new Image(); im.onload = function () { var m = 240, k = Math.min(1, m / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); d._logo = c.toDataURL('image/png'); $('mss-lp').src = d._logo; }; im.src = r.result; }; r.readAsDataURL(f);
    };
    $('mss-lr').onclick = function () { d._logo = ''; $('mss-lp').src = 'logo.svg'; };
  }
  function fill() { var s = get(), d = $('mss'); d._logo = s.logo; $('mss-lp').src = s.logo || 'logo.svg'; d.querySelectorAll('[data-k]').forEach(function (e) { var k = e.dataset.k, v = k.indexOf('lock_') === 0 ? (s.locks || {})[k.slice(5)] : s[k]; if (e.type === 'checkbox') e.checked = !!v; else e.value = v == null ? '' : v; }); }
  window.MSSettings = {
    get: get,
    open: function () { var self = this, go = function () { build(); fill(); $('mss').classList.add('on'); }; if (get().lockPin && !isOpen('settings')) askPin(function () { unlocked.settings = Date.now(); go(); }); else go(); },
    close: function () { if ($('mss')) $('mss').classList.remove('on'); },
    save: function () {
      var s = get(), d = $('mss'); s.locks = {}; d.querySelectorAll('[data-k]').forEach(function (e) { var k = e.dataset.k, v = e.type === 'checkbox' ? e.checked : (e.type === 'number' ? +e.value : e.value); if (k.indexOf('lock_') === 0) { if (v) s.locks[k.slice(5)] = true; } else s[k] = v; });
      if (Object.keys(s.locks).length && String(s.lockPin || '').length < 4) { alert('Lock lagane ke liye kam az kam 4 digits ka PIN likhein'); return; }
      s.logo = d._logo || ''; put(s); unlocked = {}; this.close();
    },
    reset: function () { if (confirm('Sab settings default par wapas?')) { put(Object.assign({}, DEF)); fill(); } },
    test: function () {
      this.save(); var o = { id: 1, invoiceNum: 'EDH-TEST', customer: 'Test Customer', orderType: 'Takeaway', paymentMethod: 'Cash', ownerPhone: get().phone, items: [{ name: 'Sample Item', qty: 2, price: 500 }], grossPrice: 1000, discount: 50, deliveryCharge: 0, netPayable: 950, date: new Date().toISOString().slice(0, 10) };
      if (window.loadInvoiceReceipt) { flag = false; loadInvoiceReceipt(o); var ov = $('modal-invoice-overlay'); if (ov) ov.classList.remove('hidden'); }
    }
  };
  document.addEventListener('DOMContentLoaded', applyAll);
  window.addEventListener('ms-settings-changed', applyAll);
  window.addEventListener('load', function () {
    applyAll();
    var ht = $('header-title'); if (ht) new MutationObserver(function () { var v = get().name.toUpperCase(); if (ht.textContent !== v) ht.textContent = v; }).observe(ht, { childList: true, characterData: true, subtree: true });
    var list = $('slip-items-list');
    if (list) new MutationObserver(function () { applyReceipt(); if (flag && get().autoPrint) { flag = false; setTimeout(doPrint, 400); } }).observe(list, { childList: true });
    if (window.processCheckoutBill) { var o = window.processCheckoutBill; window.processCheckoutBill = function () { flag = true; setTimeout(function () { flag = false; }, 1500); return o.apply(this, arguments); }; }
    window.executeSystemPrint = doPrint;
  });
})();
