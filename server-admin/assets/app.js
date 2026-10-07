/* Kenzious Admin - app.js
   Copy, toast, quick-days, extend dropdown, bulk select, theme. Không phụ thuộc thư viện ngoài. */
(function () {
  'use strict';

  function toast(msg) {
    var wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 250); }, 1800);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }

  document.addEventListener('click', function (ev) {
    var copyBtn = ev.target.closest('.copy-btn');
    if (copyBtn) {
      ev.preventDefault();
      copyText(copyBtn.getAttribute('data-copy') || '')
        .then(function () { toast('Đã copy'); }).catch(function () { toast('Không copy được'); });
      return;
    }
    var chip = ev.target.closest('.chip[data-days]');
    if (chip) {
      ev.preventDefault();
      var inp = document.getElementById('createExpired');
      if (inp) {
        var d = new Date();
        d.setDate(d.getDate() + parseInt(chip.getAttribute('data-days'), 10));
        inp.value = d.toISOString().slice(0, 10);
        chip.parentNode.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
      }
      return;
    }
    var tgl = ev.target.closest('.ext-toggle');
    document.querySelectorAll('.ext.open').forEach(function (m) { if (!tgl || m !== tgl.closest('.ext')) m.classList.remove('open'); });
    if (tgl) {
      ev.preventDefault();
      var box = tgl.closest('.ext');
      box.classList.toggle('open');
      if (box.classList.contains('open')) {
        var menu = box.querySelector('.ext-menu'); var wrap = box.closest('.table-wrap');
        if (menu) { menu.classList.remove('up'); if (wrap) {
          var m = menu.getBoundingClientRect(), w = wrap.getBoundingClientRect(), t = tgl.getBoundingClientRect();
          if (m.bottom > w.bottom && (t.top - w.top) > (w.bottom - t.bottom)) menu.classList.add('up');
        } }
      }
    }
  });

  var toggle = document.getElementById('navToggle');
  var overlay = document.getElementById('navOverlay');
  if (toggle) toggle.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  if (overlay) overlay.addEventListener('click', function () { document.body.classList.remove('nav-open'); });

  // Bulk select
  var checkAll = document.getElementById('checkAll');
  var bulkBtn = document.getElementById('bulkDelBtn');
  var bulkCount = document.getElementById('bulkCount');
  function rowChks() { return Array.prototype.slice.call(document.querySelectorAll('.rowchk')); }
  function refreshBulk() {
    var n = rowChks().filter(function (c) { return c.checked; }).length;
    if (bulkCount) bulkCount.textContent = String(n);
    if (bulkBtn) bulkBtn.disabled = n === 0;
    if (checkAll) { var all = rowChks(); checkAll.checked = all.length > 0 && n === all.length; checkAll.indeterminate = n > 0 && n < all.length; }
  }
  if (checkAll) checkAll.addEventListener('change', function () { rowChks().forEach(function (c) { c.checked = checkAll.checked; }); refreshBulk(); });
  document.addEventListener('change', function (ev) { if (ev.target.classList && ev.target.classList.contains('rowchk')) refreshBulk(); });
  refreshBulk();
})();

/* Đổi Tối / Sáng — lưu localStorage, đọc lại ở <head> để không nháy. Mặc định TỐI. */
(function () {
  var btn = document.getElementById('themeBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var root = document.documentElement;
    var sang = root.getAttribute('data-theme') === 'sang';
    if (sang) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'sang');
    try { localStorage.setItem('kenzious-theme', sang ? 'toi' : 'sang'); } catch (e) {}
  });
})();
