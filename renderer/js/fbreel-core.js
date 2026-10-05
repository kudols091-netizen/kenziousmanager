/* kenzi-core.js — lớp nền cho tab Đăng Reel (nạp TRƯỚC reel-tab.js).
 * Cung cấp đúng những phụ thuộc bên ngoài mà reel-tab.js port từ APP đang cần:
 *   1) window.fetch wrapper: ép credentials:'include' cho *.facebook.com NHƯNG chừa graph.facebook.com
 *      (đường upload video reel bắn thẳng graph-video/graph — bọc credentials sẽ hỏng CORS wildcard).
 *   2) window.cloneClaimBMLink: chế độ "Nhận Link BM" của công cụ Sửa Page (port gọn từ dashboard.js).
 *   3) Khởi tạo theme sáng/tối (data-theme + localStorage 'kenzi_theme').
 * Kenzi độc lập với PinkAgc — không dùng chung namespace, key hay backend.
 */
(function () {
  'use strict';

  /* ── 1) Global fetch wrapper (giống dashboard.js APP) ───────────────────── */
  (function () {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      let url = '';
      if (typeof input === 'string') url = input;
      else if (input && typeof input === 'object' && input.url) url = input.url;
      else if (input && typeof input.toString === 'function') url = input.toString();
      if (url && url.includes('facebook.com') && !url.includes('graph.facebook.com')) {
        init = init || {};
        init.credentials = 'include';
      }
      return originalFetch.call(this, input, init);
    };
  })();

  /* ── 2) cloneClaimBMLink (Nhận Link BM cho clone) ───────────────────────── */
  // doc_id của claimBMLink (chốt theo docmap APP: d19639cfa6 -> 6857625997606127).
  const CLAIM_BM_DOC = '6857625997606127';
  async function cloneFetchReq(url, cookie, opts) {
    if (!(window.EB && window.EB.cloneFetch)) throw new Error('Thiếu cầu tiện ích (EB.cloneFetch)');
    return await window.EB.cloneFetch(url, cookie || '', opts || {});
  }
  async function cloneClaimBMLink(c, link, firstName, lastName) {
    let clean = String(link || '').trim();
    if (clean.includes('|')) clean = clean.split('|')[1].trim();
    const m = clean.match(/token=([^&\s"]+)/);
    if (!m) return 'Link Ko Có Token';
    const token = m[1];
    const url = 'https://b-graph.facebook.com/graphql?locale=en_US';
    const body = 'access_token=' + encodeURIComponent(c.token || '') +
      '&variables=' + encodeURIComponent(JSON.stringify({ input: { first_name: firstName || 'Via', invitation_token: token, last_name: lastName || c._uid || 'User', receive_marketing_messages: false, user_preferred_business_email: (c._uid || '') + '@facebook.com' } })) +
      '&doc_id=' + CLAIM_BM_DOC;
    try {
      const r = await cloneFetchReq(url, c.cookie || '', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body });
      const text = (r && r.text) || '';
      if (/restricted|hạn chế/i.test(text)) return 'BM Die';
      if (text.includes(token)) return 'OK';
      let err = ''; try { err = text.split('description":"')[1].split('"')[0]; } catch (e) { try { err = text.split('message":"')[1].split('"')[0]; } catch (e2) {} }
      return err ? err.replace(/\\u[\dA-Fa-f]{4}/g, '').slice(0, 60) : 'Lỗi';
    } catch (e) { return 'Lỗi Fetch'; }
  }
  window.cloneClaimBMLink = cloneClaimBMLink;

  /* ── 2b) kenziPxFetch: fetch FB QUA PROXY của via ──
   * Main process gửi request qua proxy (HTTP/SOCKS, có user/pass); proxy lỗi → trả lỗi, KHÔNG đi IP máy.
   * Trả về CÙNG SHAPE với EB.cloneFetch: {ok,status,text,json,url}. */
  window.kenziPxFetch = async function (url, cookie, opts, proxy) {
    if (!(window.EB && window.EB.cloneFetch)) throw new Error('Thiếu cầu tiện ích (EB.cloneFetch)');
    var o = Object.assign({}, opts || {});
    if (proxy) o.proxy = proxy;
    return await window.EB.cloneFetch(url, cookie || '', o);
  };

  /* ── 2b') Kho mã hoá cho dữ liệu clone nhạy cảm (mật khẩu, 2FA, cookie, token, proxy) ──
   * Các khoá dưới đây lưu qua KZSecure (DPAPI, file data/secure-kv.json) thay vì localStorage plaintext.
   * Lần đọc đầu: chuyển dữ liệu cũ từ localStorage sang kho mã hoá rồi xoá bản plaintext.
   * Lỗi kho mã hoá → dùng localStorage, KHÔNG trả rỗng (tránh lần lưu sau ghi đè mất dữ liệu clone). */
  window.kzSecureStore = (function () {
    var SECURE_KEYS = { 'reel-clones': 1, 'kenzi-clone-meta': 1, 'reel-ppages': 1, 'reel-clone-proxies': 1 };
    function useSecure(key) { return SECURE_KEYS[key] && window.KZSecure && typeof window.KZSecure.getItem === 'function'; }
    return {
      getItem: function (key) {
        if (!useSecure(key)) return localStorage.getItem(key);
        try {
          var v = window.KZSecure.getItem(key);
          if (v !== null && v !== undefined) return v;
          var legacy = localStorage.getItem(key);
          if (legacy !== null) {
            window.KZSecure.setItem(key, legacy);
            localStorage.removeItem(key);
          }
          return legacy;
        } catch (e) {
          console.warn('[Kenzi] Kho mã hoá lỗi, dùng localStorage:', e.message);
          return localStorage.getItem(key);
        }
      },
      setItem: function (key, value) {
        if (!useSecure(key)) return localStorage.setItem(key, value);
        try {
          window.KZSecure.setItem(key, value);
          localStorage.removeItem(key);
        } catch (e) {
          console.warn('[Kenzi] Kho mã hoá lỗi, tạm lưu localStorage:', e.message);
          localStorage.setItem(key, value);
        }
      },
      removeItem: function (key) {
        if (useSecure(key)) { try { window.KZSecure.removeItem(key); } catch (e) {} }
        localStorage.removeItem(key);
      }
    };
  })();

  /* ── 2c) Đồng bộ proxy của clone sang main process ──
   * Mọi request mang cookie c_user / access token của clone (kể cả chỗ gọi EB.cloneFetch không truyền proxy)
   * sẽ tự đi qua proxy của clone đó. Gọi lại mỗi khi danh sách clone, proxy hoặc token thay đổi. */
  window.kenziSyncCloneProxies = function (source, clones, getProxy) {
    if (!(window.EB && window.EB.syncCloneProxies)) return;
    var entries = [];
    (clones || []).forEach(function (c) {
      var proxy = getProxy ? getProxy(c) : c.proxy;
      if (!c || !proxy) return;
      var uid = /^\d{5,}$/.test(c.uid || '') ? c.uid : ((String(c.cookie || '').match(/c_user=(\d+)/) || [])[1] || '');
      var pageTokens = c.ptok ? Object.keys(c.ptok).map(function (k) { return c.ptok[k]; }) : [];
      var tokens = [c.token, c.eaab, c.eaag, c.eaaaau].concat(pageTokens).filter(Boolean);
      entries.push({ uid: uid, proxy: proxy, tokens: tokens });
    });
    window.EB.syncCloneProxies(source, entries).catch(function () {});
  };

  /* ── 3) Theme ───────────────────────────────────────────────────────────── */
  const savedTheme = (function () { try { return localStorage.getItem('kenzi_theme'); } catch (e) { return null; } }) () || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  window.kenziToggleTheme = function () {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('kenzi_theme', next); } catch (e) {}
    return next;
  };

  console.log('[Kenzi] core sẵn sàng (fetch wrapper + claimBM + theme).');
})();
