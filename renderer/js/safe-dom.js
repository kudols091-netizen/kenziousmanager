/**
 * Tiện ích DOM an toàn dùng chung cho mọi tab — nạp TRƯỚC các script khác.
 *
 * CSP của index.html chặn script inline (kể cả onclick="..." / onerror="..."), nên:
 *  - Dữ liệu từ bên ngoài (tiêu đề video, tên kênh/Fanpage, lỗi mạng, CSV clone…) phải qua escHtml()
 *    trước khi ghép vào innerHTML; URL cho src/href qua safeUrl().
 *  - Nút bấm dùng  data-action="tênAction"  (đăng ký bằng KZ.action) thay cho onclick inline.
 *    Thêm data-stop để chặn click lan lên hàng/bảng bên ngoài (thay cho event.stopPropagation()).
 *  - Ảnh lỗi dùng  data-img-fallback="remove | hide-show-next | text | src"  thay cho onerror inline
 *    (kèm data-fallback-text / data-fallback-src).
 *  - Hiệu ứng hover inline dùng  data-hover-style="css khi hover".
 */
(function () {
  'use strict';

  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Chỉ cho phép URL http(s)/file/blob và data:image — chặn javascript:, data:text/html…
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (/^(https?:|file:|blob:)/i.test(s) || /^data:image\//i.test(s)) return escHtml(s);
    return '';
  }

  // src cho ảnh/video: nhận URL hoặc đường dẫn file cục bộ (D:\...\a.jpg, /home/...) → URL đã escape
  function mediaSrc(v) {
    var s = String(v == null ? '' : v).trim();
    if (/^[a-zA-Z]:[\\/]/.test(s) || (s.charAt(0) === '/' && s.charAt(1) !== '/')) {
      s = 'file:///' + encodeURI(s.replace(/\\/g, '/').replace(/^\/+/, '')).replace(/#/g, '%23').replace(/\?/g, '%3F');
    }
    return safeUrl(s);
  }

  var actions = Object.create(null);
  function registerAction(name, fn) { actions[name] = fn; }

  // Capture ở document: chạy trước listener của hàng/bảng, nên data-stop chặn được click lan ra ngoài
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var fn = actions[el.dataset.action];
    if (!fn) return;
    if (el.hasAttribute('data-stop')) e.stopPropagation();
    fn(el, e);
  }, true);

  // Sự kiện 'error' của <img> không nổi bọt → bắt ở pha capture
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    var mode = img.dataset.imgFallback;
    if (!mode) return;
    if (mode === 'src') {
      // Giữ cờ để <img> dùng lại (vd: modal đổi tài khoản) vẫn có ảnh dự phòng; chặn vòng lặp nếu chính ảnh dự phòng lỗi
      var fb = img.dataset.fallbackSrc;
      if (fb && img.getAttribute('src') !== fb) img.src = fb;
      return;
    }
    delete img.dataset.imgFallback; // các chế độ còn lại chỉ xử lý 1 lần
    if (mode === 'remove') {
      img.remove();
    } else if (mode === 'hide-show-next') {
      img.style.display = 'none';
      if (img.nextElementSibling) img.nextElementSibling.style.display = 'flex';
    } else if (mode === 'text') {
      if (img.parentElement) img.parentElement.textContent = img.dataset.fallbackText || '';
    }
  }, true);

  function hoverTarget(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-hover-style]') : null;
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return null;
    return el;
  }
  document.addEventListener('mouseover', function (e) {
    var el = hoverTarget(e);
    if (!el) return;
    if (el.dataset.baseStyle === undefined) el.dataset.baseStyle = el.getAttribute('style') || '';
    el.setAttribute('style', el.dataset.baseStyle + ';' + el.dataset.hoverStyle);
  });
  document.addEventListener('mouseout', function (e) {
    var el = hoverTarget(e);
    if (!el || el.dataset.baseStyle === undefined) return;
    el.setAttribute('style', el.dataset.baseStyle);
  });

  window.KZ = Object.assign(window.KZ || {}, { escHtml: escHtml, safeUrl: safeUrl, mediaSrc: mediaSrc, action: registerAction });
  window.escHtml = escHtml;
})();
