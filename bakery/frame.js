/* Alpha Bakers - frame helper. Every admin page runs INSIDE index.html (the only page with the left menu).
   - opened on its own  -> jumps to index.html#<page> so the menu is always there
   - opened in the frame -> hides its own sidebar / "home" buttons and sends "home" clicks to the dashboard */
(function () {
  var ID = { 'dashboard.html': 'dashboard', 'pos.html': 'pos', 'ordermanage.html': 'online', 'stock.html': 'stock', 'kitchen.html': 'kitchen', 'staffmanage.html': 'staff', 'production.html': 'production', 'suppliers.html': 'suppliers', 'accounts.html': 'accounts', 'reports.html': 'reports', 'settings.html': 'settings' };
  var page = location.pathname.split('/').pop() || 'index.html', framed = true;
  try { framed = window.top !== window; } catch (e) {}
  if (!framed) {
    if (ID[page] && !/[?&]standalone=1/.test(location.search)) { document.documentElement.style.display = 'none'; location.replace('index.html#' + ID[page]); }
    return;
  }
  var st = document.createElement('style');
  st.textContent = 'aside:not(.side-drawer),a[href="index.html"]{display:none!important}body{min-height:100vh}';
  (document.head || document.documentElement).appendChild(st);
  document.documentElement.classList.add('in-frame');
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target === '_blank') return;
    var f = (a.getAttribute('href') || '').split('?')[0].split('#')[0];
    if (f === 'index.html' || f === 'dashboard.html') { e.preventDefault(); try { parent.postMessage({ go: 'dashboard' }, '*'); } catch (x) {} }
    else if (ID[f]) { e.preventDefault(); try { parent.postMessage({ go: ID[f] }, '*'); } catch (x) {} }
  }, true);
})();
