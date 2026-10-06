/* clone-tab.js — TAB CLONE/VIA (Kenzi). Quản lý via: dán clone, Check Live, lấy token (EAAG/EAAB/EAAAAU),
 * sửa/thay token, xuất. Cột theo thứ tự PinkAgc:
 *   # · Uid · Pass · 2FA · Tên Via · Trạng Thái · Cookie · EAAG · EAAB · EAAAAU · Mail · Pass Mail · Mail Phụ · UA · Note · Proxy
 * DÙNG CHUNG với tab Đăng Reel:
 *   - localStorage 'reel-clones'  : danh sách dòng clone (reel-tab đọc lại khi mở).
 *   - localStorage 'reel-ppages'  : token clone theo uid (reel-tab khôi phục qua restorePagesData).
 *   - localStorage 'kenzi-clone-meta' : token 3 loại + Tên Via (giữ hiển thị qua F5).
 * Mọi lời gọi Facebook đi qua EB (fetch nền extension) để né CORS ở domain Kenzi.
 */
(function () {
  'use strict';
  if (window.__kzCloneTab) return;
  window.__kzCloneTab = true;

  var CLS = [];
  var _seq = 0;
  function $(id) { return document.getElementById(id); }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var shortProxy = function (px) {
    if (!px) return '';
    var s = String(px).replace(/^https?:\/\//i, '').replace(/^socks[45]:\/\//i, '');
    if (s.includes('@')) s = s.split('@')[1] || s;
    var parts = s.split(':');
    if (parts.length >= 2) return parts[0] + ':' + parts[1];
    return s;
  };
  if (!window.__kzCopyText) {
    window.__kzCopyText = function (text, el) {
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        if (el) {
          var oldHtml = el.innerHTML;
          var oldColor = el.style.color;
          el.innerHTML = '✓ Đã chép!';
          el.style.color = '#4ade80';
          setTimeout(function () {
            el.innerHTML = oldHtml;
            el.style.color = oldColor;
          }, 1100);
        }
      }).catch(function () {
        prompt('Sao chép giá trị:', text);
      });
    };
  }
  var HIDE_SENSITIVE = true;
  function cellSecret(v) {
    if (!v) return '<span class="dim">—</span>';
    // data-action thay cho onclick inline: giá trị chứa dấu ' từng phá được chuỗi JS trong onclick
    var safeVal = esc(v);
    if (HIDE_SENSITIVE) {
      return '<span class="kzc-masked" title="Đã ẩn chống hack (Click để sao chép)" data-action="kzCopyText" data-stop data-copy="' + safeVal + '" style="cursor:pointer;font-family:monospace;letter-spacing:2px;color:rgba(255,255,255,0.45);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;user-select:none;font-size:11px">••••••••</span>';
    }
    return '<span class="ell" title="' + safeVal + ' (Click để sao chép)" data-action="kzCopyText" data-stop data-copy="' + safeVal + '" style="cursor:pointer;color:#e2e8f0">' + safeVal + '</span>';
  }
  function cellProxy(c, i) {
    var px = c.proxy || '';
    var pxColor = px ? '#38bdf8' : 'var(--text-secondary)';
    var pxTitle = px ? ('Proxy hiện tại: ' + esc(px) + ' — Click để xem chi tiết / chỉnh sửa') : 'Chưa có proxy — Click để cấu hình HTTP / HTTPS / SOCKS5';
    var shortLabel = px ? esc(shortProxy(px)) : '+ Gán Proxy';
    return '<button class="vbtn-mini sec" data-action="kzOpenProxyClone" data-stop data-i="' + i + '" title="' + pxTitle + '" style="color:' + pxColor + ';border-color:' + (px ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.15)') + ';font-weight:600;white-space:nowrap">🌐 ' + shortLabel + '</button>';
  }

  /* ───────── Parse (heuristic, nhận nhiều định dạng) ───────── */
  function isEmail(s) { return /^[^@\s|]+@[^@\s|]+\.[^@\s|]+$/.test(s); }
  function isCookie(s) { return /c_user=\d+/.test(s) || /(^|;)\s*(datr|sb|xs)=/.test(s); }
  function isTok(s) { return /^EAA[A-Za-z0-9]/.test(s) && s.length > 40; }
  function is2fa(s) { return /^[A-Z2-7 ]{16,}$/i.test(s) && !/\s{2,}/.test(s) && /[A-Z]/i.test(s); }
  function isProxy(s) { return /^(https?|socks[45]):\/\//i.test(s) || /^\d{1,3}(\.\d{1,3}){3}:\d+/.test(s) || /^[\w.-]+:\d+:[^:]+:[^:]+$/.test(s); }
  function isUA(s) { return /Mozilla|Dalvik|FBAN|AppleWebKit/.test(s); }
  function tokKind(t) { return /^EAAAAU/.test(t) ? 'EAAAAU' : /^EAAB/.test(t) ? 'EAAB' : /^EAAG/.test(t) ? 'EAAG' : 'other'; }

  function parseLine(raw) {
    raw = (raw || '').trim();
    var c = { _id: 'kc' + (++_seq), raw: raw, uid: '', pass: '', twofa: '', viaName: '', status: '', cookie: '',
      eaag: '', eaab: '', eaaaau: '', mail: '', passMail: '', mailPhu: '', ua: '', note: '', proxy: '',
      bmId: '', su: false };
    if (!raw) return c;
    // cookie thuần
    if (isCookie(raw) && !raw.includes('|')) { c.cookie = raw; }
    else if (raw.includes('|')) {
      var p = raw.split('|').map(function (s) { return s.trim(); });
      // System User: UID|IdBM|TokenSU
      if (p.length === 3 && /^\d{6,}$/.test(p[0]) && /^\d{6,}$/.test(p[1]) && isTok(p[2])) {
        c.uid = p[0]; c.bmId = p[1]; c.su = true; setTok(c, p[2]);
      } else {
        // Nhặt theo mẫu, phần còn lại gán theo vị trí (pass, passMail, mailPhu).
        var rest = [];
        p.forEach(function (x) {
          if (!x) return;
          if (isCookie(x)) { if (!c.cookie) c.cookie = x; }
          else if (isTok(x)) { setTok(c, x); }
          else if (isEmail(x)) { if (!c.mail) c.mail = x; else if (!c.mailPhu) c.mailPhu = x; }
          else if (isProxy(x)) { if (!c.proxy) c.proxy = x; }
          else if (isUA(x)) { if (!c.ua) c.ua = x; }
          else if (/^\d{6,}$/.test(x) && !c.uid) { c.uid = x; }
          else rest.push(x);
        });
        // rest: [pass, 2fa?, passMail?, mailPhu?...] — gán tuần tự.
        if (rest.length) { c.pass = rest.shift() || ''; }
        if (rest.length && is2fa(rest[0])) { c.twofa = rest.shift(); }
        if (rest.length) { c.passMail = rest.shift() || ''; }
        if (rest.length && !c.mailPhu) { c.mailPhu = rest.shift() || ''; }
      }
    }
    else if (isTok(raw)) { setTok(c, raw); }
    else { c.cookie = raw; }
    var m = (c.cookie || raw).match(/c_user=(\d+)/); if (m && !/^\d{5,}$/.test(c.uid)) c.uid = m[1];
    return c;
  }
  // Đặt token vào đúng cột theo loại + cập nhật token "mạnh nhất" (ưu tiên EAAAAU > EAAB > EAAG).
  function setTok(c, t) {
    var k = tokKind(t);
    if (k === 'EAAAAU') c.eaaaau = t; else if (k === 'EAAB') c.eaab = t; else if (k === 'EAAG') c.eaag = t;
  }
  function bestTok(c) { return c.eaaaau || c.eaab || c.eaag || ''; }
  function bestKind(c) { return c.eaaaau ? 'EAAAAU' : c.eaab ? 'EAAB' : c.eaag ? 'EAAG' : ''; }
  function clKey(c) { return c.uid && /^\d{5,}$/.test(c.uid) ? c.uid : c._id; }

  /* ───────── Persist (chung với reel-tab) ───────── */
  function saveClones() { try { kzSecureStore.setItem('reel-clones', CLS.map(function (c) { return c.raw; }).join('\n')); } catch (e) {} saveMeta(); syncProxies(); if (window.kzNotifyClonesChanged) window.kzNotifyClonesChanged('clone'); }
  // Báo cho main process proxy của từng clone → mọi request mang cookie/token của clone tự đi đúng proxy
  function syncProxies() { if (window.kenziSyncCloneProxies) window.kenziSyncCloneProxies('clone', CLS); }
  function saveMeta() {
    try {
      var mm = {};
      CLS.forEach(function (c) { mm[clKey(c)] = { eaag: c.eaag, eaab: c.eaab, eaaaau: c.eaaaau, viaName: c.viaName, status: c.status, note: c.note }; });
      kzSecureStore.setItem('kenzi-clone-meta', JSON.stringify(mm));
    } catch (e) {}
  }
  function savePPAGESToken(c) {
    try {
      var pp = JSON.parse(kzSecureStore.getItem('reel-ppages') || '{}') || {};
      var k = clKey(c); var rec = pp[k] || { tok: '', kind: '', pg: {} };
      rec.tok = bestTok(c); rec.kind = bestKind(c); if (!rec.pg) rec.pg = {};
      pp[k] = rec; kzSecureStore.setItem('reel-ppages', JSON.stringify(pp));
    } catch (e) {}
  }
  function loadClones() {
    var text = ''; try { text = kzSecureStore.getItem('reel-clones') || ''; } catch (e) {}
    var seen = {}; CLS = [];
    text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (ln) { if (!seen[ln]) { seen[ln] = 1; CLS.push(parseLine(ln)); } });
    var mm = {}; try { mm = JSON.parse(kzSecureStore.getItem('kenzi-clone-meta') || '{}') || {}; } catch (e) {}
    var pxMap = {}; try { pxMap = JSON.parse(kzSecureStore.getItem('reel-clone-proxies') || '{}') || {}; } catch (e) {}
    CLS.forEach(function (c) {
      var k = clKey(c);
      var r = mm[k];
      if (r) {
        if (!c.eaag && r.eaag) c.eaag = r.eaag; if (!c.eaab && r.eaab) c.eaab = r.eaab; if (!c.eaaaau && r.eaaaau) c.eaaaau = r.eaaaau;
        if (r.viaName) c.viaName = r.viaName; if (r.status) c.status = r.status; if (r.note) c.note = r.note;
      }
      if (!c.proxy && pxMap[k]) c.proxy = pxMap[k];
      else if (c.proxy && !pxMap[k]) pxMap[k] = c.proxy;
    });
    try { kzSecureStore.setItem('reel-clone-proxies', JSON.stringify(pxMap)); } catch (e) {}
    syncProxies();
  }

  /* ───────── FB qua EB ───────── */
  // proxy (nếu có) -> đi qua server /api/px.php (mỗi via 1 IP); không proxy -> EB.cloneFetch như cũ.
  function ebFetch(url, cookie, opt, proxy) {
    if (proxy && window.kenziPxFetch) return window.kenziPxFetch(url, cookie || '', opt || {}, proxy);
    if (!(window.EB && window.EB.cloneFetch)) return Promise.reject(new Error('Thiếu cầu tiện ích (EB.cloneFetch) — cài + bật extension Kenzi.'));
    return window.EB.cloneFetch(url, cookie || '', opt || {});
  }
  // Chỉ coi là checkpoint khi có dấu hiệu MẠNH (không quét chữ "checkpoint" trần — nó nằm trong JS trang bình thường).
  function classifyFb(t) {
    if (/CheckpointRoot|checkpointSubmitButton|__isCheckpoint|id="checkpoint|\/checkpoint\/\?|"checkpoint_data"/i.test(t)) return 'checkpoint';
    if (/your account has been (disabled|suspended)|tài khoản của bạn đã bị (vô hiệu|khoá|khóa)|account_disabled|is_disabled":true/i.test(t)) return 'spam';
    return 'die';
  }
  // Trích Tên Via từ HTML trang /me/ (chạy cả khi clone chỉ có cookie, không cần token).
  function extractName(t) {
    var m = t.match(/"NAME":"([^"]{1,80})"/) || t.match(/,"name":"([^"]{1,80})","short_name"/) || t.match(/"actor_name":"([^"]{1,80})"/) || t.match(/"actorName":\{"text":"([^"]{1,80})"/);
    if (m) { try { return JSON.parse('"' + m[1] + '"').trim(); } catch (e) { return m[1].trim(); } }
    var tm = t.match(/<title[^>]*>([^<]{1,90})<\/title>/i);
    if (tm) {
      var s = tm[1].replace(/\s*\|\s*Facebook\s*$/i, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (s && !/^facebook$/i.test(s) && !/log ?in|đăng nhập/i.test(s)) return s;
    }
    return '';
  }
  async function checkLiveOne(c) {
    if (c.su) { c.status = bestTok(c) ? 'Live (SU)' : 'Thiếu token'; return; }
    c.status = 'Đang check…'; render();

    var live = false;

    // LỚP 1: Kiểm tra qua Cookie với /me/ (nếu có cookie)
    if (c.cookie) {
      try {
        var r = await ebFetch('https://www.facebook.com/me/', c.cookie, {}, c.proxy);
        var t = (r && r.text) || '';
        var url = (r && r.url) || '';

        if (/\/checkpoint\//i.test(url) || classifyFb(t) === 'checkpoint') {
          c.status = 'Checkpoint';
        } else if (/"USER_ID":"[1-9]\d+"|"ACCOUNT_ID":"[1-9]\d+"|EAAB[0-9A-Za-z]{20}|EAAG[0-9A-Za-z]{20}/.test(t)) {
          c.status = 'Live';
          live = true;
        } else if (url && !/\/(login|checkpoint|recover|help)\b/i.test(url) && /facebook\.com\/(profile\.php|[^\/?#]+)\/?($|[?#])/i.test(url)) {
          c.status = 'Live';
          live = true;
        }

        if (live && !c.viaName) {
          var nm = extractName(t);
          if (nm) c.viaName = nm;
        }
      } catch (e1) {
        c.note = (e1 && e1.message) || String(e1);
      }
    }

    // LỚP 2: Kiểm tra qua Token Graph API (nếu có Token EAAB / EAAG / EAAAAU)
    if (!live && bestTok(c)) {
      try {
        var tok = bestTok(c);
        var tr = await ebFetch('https://graph.facebook.com/v19.0/me?fields=id,name&access_token=' + encodeURIComponent(tok), '', {}, c.proxy);
        var tj = tr && tr.json;
        if (!tj && tr && tr.text) { try { tj = JSON.parse(tr.text); } catch (_) {} }
        if (tj && (tj.id || tj.name)) {
          c.status = 'Live';
          live = true;
          if (tj.name && !c.viaName) c.viaName = tj.name;
        }
      } catch (e2) {}
    }

    // LỚP 3: Kiểm tra Public UID Avatar Check (Chuẩn MMO Ads Facebook)
    if (!live && c.uid && /^\d{5,}$/.test(String(c.uid).trim())) {
      try {
        if (window.EB && window.EB.checkUidLive) {
          var ur = await window.EB.checkUidLive(c.uid);
          if (ur && ur.live) {
            c.status = 'Live';
            live = true;
          } else if (ur && ur.status === 404) {
            c.status = 'Die';
          }
        }
      } catch (e3) {}
    }

    // Nếu vẫn chưa xác định được và không live
    if (!live && (!c.status || c.status === 'Đang check…')) {
      c.status = c.cookie ? 'Die' : 'Thiếu cookie';
    }

    // Đã Live thì thử lấy tên nếu vẫn chưa có tên
    if (live && !c.viaName) {
      try { await fetchViaName(c); } catch (_) {}
    }
  }

  async function fetchViaName(c) {
    var tok = bestTok(c); if (!tok || c.viaName) return;
    try {
      var r = await ebFetch('https://graph.facebook.com/v19.0/me?fields=name&access_token=' + encodeURIComponent(tok), '', {}, c.proxy);
      var j = r && r.json; if (!j && r && r.text) { try { j = JSON.parse(r.text); } catch (e) {} }
      if (j && j.name) c.viaName = j.name;
    } catch (e) {}
  }
  // Lấy token: ưu tiên EAAAAU (login FB4A bằng pass+2fa — mạnh + ổn nhất), rồi EAAB (scrape),
  // cuối cùng EAAAAU qua OAuth-tab (cho clone chỉ có cookie, không mật khẩu). Điền vào đúng cột.
  async function getTokenOne(c) {
    // 0) EAAAAU Katana: login FB4A bằng uid+pass(+2fa) -> token EAAAAU + cookie phiên mới (đầy đủ quyền).
    if (!c.eaaaau && c.uid && c.pass && window.EB && window.EB.fbLogin) {
      try {
        var lr = await window.EB.fbLogin(c.uid, c.pass, c.twofa || '');
        if (lr && lr.token) { setTok(c, lr.token); if (lr.cookie) c.cookie = lr.cookie; if (lr.uid) c.uid = String(lr.uid); }
      } catch (e) { c.note = 'login FB4A: ' + ((e && e.message) || e); }
    }
    if (!c.cookie && !bestTok(c)) { c.note = 'thiếu cookie/mật khẩu'; return false; }
    // 1) EAAB từ adsmanager/business (dùng cookie — kể cả cookie mới do login trả về)
    if (c.cookie && !c.eaab) {
      var urls = ['https://adsmanager.facebook.com/adsmanager/manage/campaigns', 'https://business.facebook.com/content_management', 'https://business.facebook.com/latest/home'];
      for (var i = 0; i < urls.length; i++) {
        try {
          var r = await ebFetch(urls[i], c.cookie, {}); var t = (r && r.text) || '';
          var b = t.match(/EAAB[0-9A-Za-z]+/g);
          if (b) { c.eaab = b.sort(function (x, y) { return y.length - x.length; })[0]; break; }
          if (!c.eaag) { var g = t.match(/EAAG[0-9A-Za-z]+/g); if (g) { var bg = g.sort(function (x, y) { return y.length - x.length; })[0]; if (bg.length >= 100) c.eaag = bg; } }
        } catch (e) {}
      }
    }
    // 2) EAAAAU qua OAuth-tab ẩn — chỉ khi CHƯA có EAAAAU (vd clone chỉ có cookie, không mật khẩu).
    if (!c.eaaaau && c.cookie && window.EB && window.EB.getTokenFromCookie) {
      try { var kt = await window.EB.getTokenFromCookie(c.cookie); if (kt && kt.length >= 30) setTok(c, kt); }
      catch (e) {}
    }
    await fetchViaName(c);
    var ok = !!bestTok(c);
    c.note = ok ? ('token ' + [c.eaaaau && 'EAAAAU', c.eaab && 'EAAB', c.eaag && 'EAAG'].filter(Boolean).join('+')) : 'không lấy được token (cookie hỏng / cần mật khẩu)';
    return ok;
  }

  /* ───────── UI ───────── */
  function short(s, n) { s = String(s || ''); return s.length > n ? (s.slice(0, n) + '…') : s; }
  function statCls(s) { return /^Live/.test(s) ? 'ok' : /Die|Lỗi|Thiếu/.test(s) ? 'err' : /Checkpoint|Spam/.test(s) ? 'warn' : ''; }
  function cell(v, mono) { return v ? (mono ? '<span class="ell" title="' + esc(v) + '">' + esc(short(v, 16)) + '</span>' : esc(v)) : '<span class="dim">—</span>'; }
  function render() {
    var b = $('kzc-body'); if (!b) return;
    if (!CLS.length) { b.innerHTML = '<tr><td colspan="17" style="padding:16px;color:var(--text-secondary)">Chưa có clone. Bấm "Dán Clone" hoặc Ctrl+V.</td></tr>'; upd(); return; }
    b.innerHTML = CLS.map(function (c, i) {
      return '<tr id="kzc-r-' + i + '"' + (c._sel ? ' class="sel"' : '') + ' style="cursor:pointer">'
        + '<td class="tc"><input type="checkbox" class="kzc-ck" data-i="' + i + '"' + (c._sel ? ' checked' : '') + '></td>'
        + '<td class="tc">' + (i + 1) + '</td>'
        + '<td>' + (c.uid ? esc(c.uid) : '<span class="dim">—</span>') + (c.su ? ' <span class="dim">(SU)</span>' : '') + '</td>'
        + '<td>' + cellSecret(c.pass) + '</td>'
        + '<td>' + cellSecret(c.twofa) + '</td>'
        + '<td>' + cell(c.viaName) + '</td>'
        + '<td class="' + statCls(c.status) + '">' + (c.status ? esc(c.status) : '<span class="dim">Chờ</span>') + '</td>'
        + '<td>' + cell(c.cookie, 1) + '</td>'
        + '<td>' + cell(c.eaag, 1) + '</td>'
        + '<td>' + cell(c.eaab, 1) + '</td>'
        + '<td>' + cell(c.eaaaau, 1) + '</td>'
        + '<td>' + cell(c.mail) + '</td>'
        + '<td>' + cellSecret(c.passMail) + '</td>'
        + '<td>' + cellSecret(c.mailPhu) + '</td>'
        + '<td>' + cell(c.ua, 1) + '</td>'
        + '<td>' + cell(c.note) + '</td>'
        + '<td style="text-align:center">' + cellProxy(c, i) + '</td>'
        + '</tr>';
    }).join('');
    // Bấm ô tích -> tích/bỏ đúng dòng đó.
    b.querySelectorAll('.kzc-ck').forEach(function (ck) {
      ck.onclick = function (e) { e.stopPropagation(); var i = +this.getAttribute('data-i'); if (CLS[i]) { CLS[i]._sel = this.checked; _cPaintSel(); } };
    });
    var paintVal = true;
    b.querySelectorAll('tr').forEach(function (tr) {
      // Bấm cả DÒNG = tích/bỏ tích (chọn nhiều). Giữ chuột + rê để quét nhanh nhiều dòng.
      tr.onmousedown = function (e) {
        if (e.button !== 0 || e.target.closest('input,button,a')) return;
        var i = _cRowIdx(this); if (i < 0) return; e.preventDefault();
        paintVal = !CLS[i]._sel; CLS[i]._sel = paintVal; _cdrag.on = true; _cPaintSel();
      };
      tr.onmouseover = function () { if (!_cdrag.on) return; var i = _cRowIdx(this); if (i < 0) return; if (CLS[i]._sel !== paintVal) { CLS[i]._sel = paintVal; _cPaintSel(); } };
      // Double-click 1 dòng: mở sửa dòng đó.
      tr.ondblclick = function () { var i = _cRowIdx(this); if (i < 0) return; CLS.forEach(function (x) { x._sel = false; }); CLS[i]._sel = true; render(); editLine(); };
    });
    upd();
  }
  var _cdrag = { on: false };
  function _cRowIdx(tr) { var i = +String(tr.id || '').replace('kzc-r-', ''); return isNaN(i) ? -1 : i; }
  function _cPaintSel() {
    var b = $('kzc-body'); if (!b) return;
    b.querySelectorAll('tr').forEach(function (tr) { var i = _cRowIdx(tr); if (i < 0) return; var s = !!(CLS[i] && CLS[i]._sel); tr.classList.toggle('sel', s); var ck = tr.querySelector('.kzc-ck'); if (ck) ck.checked = s; });
    var all = $('kzc-all'); if (all) all.checked = CLS.length > 0 && CLS.every(function (c) { return c._sel; });
    upd();
  }
  function upd() {
    var live = CLS.filter(function (c) { return /^Live/.test(c.status); }).length;
    var tok = CLS.filter(function (c) { return bestTok(c); }).length;
    var sel = CLS.filter(function (c) { return c._sel; }).length;
    var el = $('kzc-stat'); if (el) el.textContent = 'Tổng ' + CLS.length + ' · Live ' + live + ' · Có token ' + tok + ' · Chọn ' + sel;
  }
  function selIdx() { var a = []; CLS.forEach(function (c, i) { if (c._sel) a.push(i); }); return a; }
  function targets() { var s = selIdx(); return s.length ? s : CLS.map(function (_, i) { return i; }); }
  function log(m) { var el = $('kzc-log'); if (el) { var d = new Date(); el.textContent = '[' + d.toLocaleTimeString('vi-VN') + '] ' + m; } }

  async function doCheckLive() {
    var idxs = targets(); if (!idxs.length) { log('Chưa có clone.'); return; }
    var btn = $('kzc-checklive'); if (btn) { btn.disabled = true; btn.textContent = 'Đang check…'; }
    var live = 0;
    for (var k = 0; k < idxs.length; k++) { await checkLiveOne(CLS[idxs[k]]); if (/^Live/.test(CLS[idxs[k]].status)) live++; render(); }
    saveMeta(); if (btn) { btn.disabled = false; btn.textContent = '❤ Check Live'; }
    log('Check Live xong: ' + live + '/' + idxs.length + ' sống.');
  }
  async function doGetToken() {
    var idxs = targets(); if (!idxs.length) { log('Chưa có clone.'); return; }
    var btn = $('kzc-gettoken'); if (btn) { btn.disabled = true; btn.textContent = 'Đang lấy…'; }
    var ok = 0;
    for (var k = 0; k < idxs.length; k++) {
      var c = CLS[idxs[k]]; c.note = 'đang lấy token…'; render();
      try { if (await getTokenOne(c)) { ok++; savePPAGESToken(c); } } catch (e) { c.note = 'lỗi: ' + ((e && e.message) || e); }
      render();
    }
    saveClones();
    if (btn) { btn.disabled = false; btn.textContent = '🔑 Lấy Token'; }
    log('Lấy token xong: ' + ok + '/' + idxs.length + '. (Đã đồng bộ sang tab Đăng Reel.)');
  }

  // Khoá nhận dạng 1 tài khoản để chống trùng: ưu tiên uid, rồi c_user trong cookie, rồi token.
  function dupKey(c) {
    if (c.uid && /^\d{5,}$/.test(c.uid)) return 'u:' + c.uid;
    var m = (c.cookie || '').match(/c_user=(\d+)/); if (m) return 'u:' + m[1];
    var t = bestTok(c); if (t) return 't:' + t;
    return '';   // không xác định danh tính -> chỉ chặn theo raw
  }
  function applyPaste(text, mode) {
    var lines = String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) return;
    if (mode === 'replace') CLS = [];
    var seenRaw = {}, seenKey = {};
    CLS.forEach(function (c) { seenRaw[c.raw] = 1; var k = dupKey(c); if (k) seenKey[k] = 1; });
    var added = 0, dup = 0;
    lines.forEach(function (ln) {
      if (seenRaw[ln]) { dup++; return; }               // trùng y hệt
      var c = parseLine(ln), k = dupKey(c);
      if (k && seenKey[k]) { dup++; return; }            // trùng TÀI KHOẢN (cùng uid/c_user/token) -> bỏ
      seenRaw[ln] = 1; if (k) seenKey[k] = 1;
      CLS.push(c); added++;
    });
    saveClones(); render();
    log('Đã nạp ' + added + ' clone' + (dup ? (' · bỏ ' + dup + ' dòng trùng tài khoản') : '') + '.', dup && !added ? 'err' : 'ok');
  }
  function doPaste(mode) {
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { applyPaste(t, mode); }).catch(function () { pastePrompt(mode); });
    else pastePrompt(mode);
  }
  function pastePrompt(mode) {
    var v = window.prompt('Dán clone (mỗi dòng 1 clone):\nuid|pass|2fa|cookie|token|mail|passmail|... · cookie thuần · UID|IdBM|TokenSU', '');
    if (v) applyPaste(v, mode);
  }
  function editLine() {
    var idxs = selIdx(); if (idxs.length !== 1) { log('Bôi đen ĐÚNG 1 clone để sửa.'); return; }
    var c = CLS[idxs[0]];
    var v = window.prompt('Sửa dòng clone:', c.raw || ''); if (v === null) return; v = v.trim(); if (!v) return;
    CLS[idxs[0]] = parseLine(v); saveClones(); render(); log('Đã sửa clone.');
  }
  function pasteToken() {
    var idxs = selIdx(); if (idxs.length !== 1) { log('Bôi đen ĐÚNG 1 clone để dán token.'); return; }
    var c = CLS[idxs[0]];
    var t = window.prompt('Dán token (EAAB/EAAG/EAAAAU) — tự vào đúng cột:', bestTok(c) || ''); if (t === null) return;
    t = t.trim().replace(/\s+/g, ''); if (t.length < 20) { log('Token không hợp lệ.'); return; }
    setTok(c, t); c.note = 'token dán tay'; savePPAGESToken(c); saveClones(); render();
    log('Đã đặt token ' + tokKind(t) + ' (' + t.length + ' ký tự) + đồng bộ sang Đăng Reel.');
  }
  // Ghi/xoá proxy vào clone + đồng bộ vào raw để lưu bền (loadClones parse lại từ raw).
  function setProxy(c, proxy) {
    c.proxy = proxy || '';
    if (c.su) return;   // SU format UID|IdBM|TokenSU: không đụng raw (tránh vỡ nhận dạng), proxy chỉ áp trong phiên
    var parts = String(c.raw || '').split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s && !isProxy(s); });
    if (proxy) parts.push(proxy);
    c.raw = parts.join('|');
  }
  function openViaSelected() {
    var idxs = selIdx();
    if (!idxs.length) { log('Chưa chọn clone nào để mở.'); return; }
    var c = CLS[idxs[0]];
    if (!c.cookie && !c.uid) { log('Via này chưa có UID hoặc Cookie để mở.'); return; }
    if (window.EB && window.EB.openViaBrowser) {
      window.EB.openViaBrowser({
        uid: c.uid,
        cookie: c.cookie,
        pass: c.pass,
        secret: c.twofa,
        proxy: c.proxy,
        name: c.viaName || c.uid
      });
      log('🌐 Đang mở trình duyệt phiên riêng cho Via ' + (c.viaName || c.uid) + '…', 'ok');
    } else {
      log('Tính năng mở Via chưa sẵn sàng trên phiên bản này.', 'err');
    }
  }

  function pasteProxy() {
    var idxs = selIdx(); if (!idxs.length) { log('Bôi đen ít nhất 1 via để gán proxy.'); return; }
    var cur = idxs.length === 1 ? (CLS[idxs[0]].proxy || '') : '';
    var v = window.prompt('Gán proxy cho ' + idxs.length + ' via bôi đen.\nĐịnh dạng: ip:port  HOẶC  host:port:user:pass\n• 1 proxy = gán cho tất cả\n• nhiều proxy (cách nhau bằng dấu cách / xuống dòng) = gán lần lượt từng via\n• để trống = xoá proxy', cur);
    if (v === null) return;
    var list = v.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!list.length) { idxs.forEach(function (i) { setProxy(CLS[i], ''); }); saveClones(); render(); log('Đã xoá proxy ' + idxs.length + ' via.'); return; }
    var bad = list.filter(function (p) { return !isProxy(p); });
    if (bad.length) { log('Proxy sai định dạng: ' + bad[0] + ' (cần ip:port hoặc host:port:user:pass).'); return; }
    if (list.length > 1 && list.length < idxs.length) { log('Có ' + idxs.length + ' via nhưng chỉ ' + list.length + ' proxy — bổ sung đủ, hoặc dán 1 proxy để dùng chung.'); return; }
    idxs.forEach(function (i, k) { setProxy(CLS[i], list.length === 1 ? list[0] : list[k]); });
    saveClones(); render(); log('Đã gán proxy cho ' + idxs.length + ' via.');
  }
  function copySel() { var arr = selIdx().map(function (i) { return CLS[i].raw; }); if (!arr.length) { log('Chưa bôi đen dòng nào.'); return; } try { navigator.clipboard.writeText(arr.join('\n')); log('Đã copy ' + arr.length + ' clone.'); } catch (e) {} }
  function copyTokens() { var arr = selIdx().map(function (i) { return bestTok(CLS[i]); }).filter(Boolean); if (!arr.length) arr = CLS.map(function (c) { return bestTok(c); }).filter(Boolean); if (!arr.length) { log('Không có token.'); return; } try { navigator.clipboard.writeText(arr.join('\n')); log('Đã copy ' + arr.length + ' token.'); } catch (e) {} }
  function delSel() { var idxs = selIdx(); if (!idxs.length) { log('Chưa bôi đen dòng nào.'); return; } var s = {}; idxs.forEach(function (i) { s[i] = 1; }); CLS = CLS.filter(function (_, i) { return !s[i]; }); saveClones(); render(); log('Đã xoá ' + idxs.length + ' clone.'); }
  function delAll() { if (!CLS.length) return; if (!confirm('Xoá TẤT CẢ clone?')) return; CLS = []; saveClones(); render(); log('Đã xoá tất cả.'); }

  function openCtx(x, y) {
    var m = $('kzc-ctx'); if (!m) return;
    var items = [
      { t: '➕ Dán Clone (Thêm)', f: function () { doPaste('add'); } },
      { t: '🔄 Dán Clone (Xoá Cũ)', f: function () { doPaste('replace'); } },
      { s: 1 },
      { t: '❤ Check Live (bôi đen/tất cả)', f: doCheckLive },
      { t: '🔑 Lấy Token (bôi đen/tất cả)', f: doGetToken },
      { t: '✏️ Sửa Clone (1 dòng)', f: editLine },
      { t: '🔑 Dán / Thay Token (1 dòng)', f: pasteToken },
      { t: '🌐 Gán proxy (bôi đen)', f: pasteProxy },
      { t: '🌐 Mở Via (Trình duyệt riêng)', f: openViaSelected },
      { s: 1 },
      { t: '📋 Copy Clone bôi đen', f: copySel },
      { t: '📋 Copy Token', f: copyTokens },
      { s: 1 },
      { t: '🗑 Xoá bôi đen', f: delSel },
      { t: '🗑 Xoá tất cả', f: delAll }
    ];
    m.innerHTML = items.map(function (it, i) { return it.s ? '<div class="sep"></div>' : '<div class="it" data-i="' + i + '">' + it.t + '</div>'; }).join('');
    m.querySelectorAll('.it').forEach(function (el) { el.onclick = function (ev) { ev.stopPropagation(); m.classList.remove('on'); items[+this.getAttribute('data-i')].f(); }; });
    m.style.left = Math.min(x, window.innerWidth - 250) + 'px'; m.style.top = Math.min(y, window.innerHeight - 380) + 'px'; m.classList.add('on');
  }

  function buildCSS() {
    return ''
      + '#clone-panel{display:none;flex-direction:column;gap:12px;padding:14px 16px;color:var(--text-primary);box-sizing:border-box;flex:1 1 100%;height:100%;min-height:0;overflow:hidden}'
      + '#clone-panel.on{display:flex}'
      + '#clone-panel .kzc-bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;flex:none}'
      + '#clone-panel .kzc-bar .stat{margin-left:auto;font-size:12px;color:var(--text-secondary)}'
      + '#clone-panel .vbtn{background:#be185d;color:#fff;border:1px solid transparent;border-radius:8px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}'
      + '#clone-panel .vbtn:hover{background:#9d174d} #clone-panel .vbtn:disabled{opacity:.5;cursor:not-allowed}'
      + '#clone-panel .vbtn.sec{background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color)} #clone-panel .vbtn.sec:hover{background:var(--bg-primary);border-color:var(--primary-accent)}'
      + '#clone-panel .vbtn-mini{padding:4px 9px;font-size:11px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:var(--text-primary);cursor:pointer;transition:all .15s}'
      + '#clone-panel .vbtn-mini:hover{background:rgba(255,255,255,0.14)}'
      + '#clone-panel .kzc-masked{display:inline-block;transition:all .15s;border:1px solid transparent}'
      + '#clone-panel .kzc-masked:hover{filter:brightness(1.25);border-color:rgba(168,85,247,0.45)!important;background:rgba(168,85,247,0.12)!important}'
      + '#clone-panel .kzc-tbl{flex:1;min-height:0;overflow:auto;border:1px solid var(--border-color);border-radius:12px}'
      + '#clone-panel table{width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap}'
      + '#clone-panel thead th{position:sticky;top:0;background:var(--bg-tertiary);text-align:left;padding:0 10px;height:38px;font-weight:700;border-bottom:1px solid var(--border-color);white-space:nowrap;z-index:1}'
      + '#clone-panel tbody td{padding:0 10px;height:36px;border-bottom:1px solid var(--border-color);vertical-align:middle}'
      + '#clone-panel td.tc{text-align:center}'
      + '#clone-panel tbody tr{cursor:pointer;user-select:none} #clone-panel tbody tr:hover{background:rgba(190,24,93,.06)} #clone-panel tbody tr.sel{background:rgba(59,130,246,.18)}'
      + '#clone-panel .ell{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom;font:11.5px Consolas,monospace}'
      + '#clone-panel .dim{color:var(--text-secondary);opacity:.7} #clone-panel td.ok{color:var(--success-color);font-weight:700} #clone-panel td.err{color:var(--danger-color)} #clone-panel td.warn{color:#d97706;font-weight:700}'
      + '#clone-panel .kzc-foot{flex:none;font-size:11.5px;color:var(--text-secondary);min-height:18px}'
      + '#clone-panel .hint{flex:none;font-size:12px;color:var(--text-secondary);line-height:1.5;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:9px 12px}'
      + '#clone-panel code{background:var(--bg-tertiary);padding:1px 5px;border-radius:5px;font-size:11px}'
      + '#kzc-ctx{position:fixed;z-index:100000;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:5px;min-width:220px;box-shadow:0 10px 30px rgba(0,0,0,.28);display:none}'
      + '#kzc-ctx.on{display:block} #kzc-ctx .it{padding:8px 12px;font-size:13px;border-radius:7px;cursor:pointer;white-space:nowrap} #kzc-ctx .it:hover{background:var(--primary-accent);color:#fff} #kzc-ctx .sep{height:1px;background:var(--border-color);margin:4px 6px}';
  }
  // ── Xuất/Nhập CSV: lấy token 1 lần → tải về → sau import lại (đỡ Check Live/Lấy Token nhiều lần) ──
  var CSV_COLS = ['Uid', 'Pass', '2FA', 'Tên Via', 'Trạng Thái', 'Cookie', 'EAAG', 'EAAB', 'EAAAAU', 'Mail', 'Pass Mail', 'Mail Phụ', 'UA', 'Note', 'Proxy'];
  var CSV_KEYS = ['uid', 'pass', 'twofa', 'viaName', 'status', 'cookie', 'eaag', 'eaab', 'eaaaau', 'mail', 'passMail', 'mailPhu', 'ua', 'note', 'proxy'];
  function csvQ(s) { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportCSV() {
    if (!CLS.length) { log('Chưa có clone nào để xuất.'); return; }
    var lines = [CSV_COLS.map(csvQ).join(',')];
    CLS.forEach(function (c) { lines.push(CSV_KEYS.map(function (k) { return csvQ(c[k]); }).join(',')); });
    var csv = '﻿' + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = 'kenzi-clones-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 800);
    log('Đã tải CSV ' + CLS.length + ' clone (kèm token).');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, ''); var rows = [], row = [], cur = '', inq = false;
    for (var i = 0; i < text.length; i++) { var ch = text[i];
      if (inq) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += ch; }
      else if (ch === '"') inq = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function importCSV(text) {
    var rows = parseCSV(text).filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    if (rows.length < 2) { log('CSV rỗng hoặc thiếu dữ liệu.'); return; }
    var head = rows[0].map(function (h) { return String(h).trim(); }), idx = {};
    head.forEach(function (h, i) { idx[h] = i; });
    function g(r, name) { return idx[name] != null ? String(r[idx[name]] || '').trim() : ''; }
    var added = 0;
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], uid = g(r, 'Uid'), best = g(r, 'EAAAAU') || g(r, 'EAAB') || g(r, 'EAAG');
      var raw = [uid, g(r, 'Pass'), g(r, '2FA'), g(r, 'Cookie'), best, g(r, 'Mail'), g(r, 'Pass Mail'), g(r, 'Mail Phụ')].join('|');
      var c = parseLine(raw), e;
      if ((e = g(r, 'EAAG'))) c.eaag = e; if ((e = g(r, 'EAAB'))) c.eaab = e; if ((e = g(r, 'EAAAAU'))) c.eaaaau = e;
      if ((e = g(r, 'Tên Via'))) c.viaName = e; if ((e = g(r, 'Trạng Thái'))) c.status = e;
      if ((e = g(r, 'UA'))) c.ua = e; if ((e = g(r, 'Note'))) c.note = e; if ((e = g(r, 'Proxy'))) c.proxy = e;
      CLS.push(c); added++;
    }
    saveClones(); render(); log('Đã nhập ' + added + ' clone từ CSV (dùng token có sẵn, không cần lấy lại).');
  }

  function buildHTML() {
    var cols = ['#', 'Uid', 'Pass', '2FA', 'Tên Via', 'Trạng Thái', 'Cookie', 'EAAG', 'EAAB', 'EAAAAU', 'Mail', 'Pass Mail', 'Mail Phụ', 'UA', 'Note', 'Proxy'];
    return ''
      + '<div class="kzc-bar">'
      + '  <button class="vbtn" id="kzc-paste">➕ Dán Clone</button>'
      + '  <button class="vbtn sec" id="kzc-checklive">❤ Check Live</button>'
      + '  <button class="vbtn sec" id="kzc-gettoken">🔑 Lấy Token</button>'
      + '  <button class="vbtn sec" id="kzc-openvia" title="Mở trình duyệt phiên riêng của Via đang chọn để kiểm tra">🌐 Mở Via</button>'
      + '  <button class="vbtn sec" id="kzc-csv" title="Tải toàn bộ clone (kèm token) ra file CSV để dùng lại">⬇ Tải CSV</button>'
      + '  <button class="vbtn sec" id="kzc-csvin" title="Nhập lại clone từ file CSV đã tải">⬆ Nhập CSV</button>'
      + '  <button class="vbtn sec" id="kzc-toggle-mask" title="Ẩn hoặc Hiện thông tin nhạy cảm"><span id="kzc-mask-ico">🔒</span> <span id="kzc-mask-lbl">Bảo Mật: Đang Ẩn</span></button>'
      + '  <input type="file" id="kzc-csvfile" accept=".csv,text/csv" style="display:none">'
      + '  <span class="stat" id="kzc-stat"></span>'
      + '</div>'
      + '<div class="hint">Dán clone → <b>Check Live</b> (sống/chết) → <b>Lấy Token</b>. '
      + '<b>EAAAAU</b> lấy bằng cách <b>login FB4A</b> (cần <b>Uid + Pass + 2FA</b>) → token Katana full quyền + cookie mới; '
      + 'clone chỉ có cookie thì thử qua OAuth-tab (hên xui). <b>EAAB</b> cào từ Ads/Business. '
      + '💡 <b>Kéo chuột</b> để quét chọn nhiều dòng · <b>double-click</b> 1 dòng để sửa · Chuột phải để <b>Sửa / Dán token / Copy / Xoá</b>. Danh sách <b>dùng chung tab Đăng Reel</b>. '
      + 'Định dạng: <code>cookie thuần</code> · <code>uid|pass|2fa|cookie|token|mail|passmail</code> · <code>UID|IdBM|TokenSU</code>.</div>'
      + '<div class="kzc-tbl"><table><thead><tr>'
      + '<th style="width:34px;text-align:center"><input type="checkbox" id="kzc-all" title="Chọn tất cả"></th>'
      + cols.map(function (h, i) { return '<th' + (i === 0 ? ' style="width:42px;text-align:center"' : '') + '>' + h + '</th>'; }).join('')
      + '</tr></thead><tbody id="kzc-body"></tbody></table></div>'
      + '<div class="kzc-foot" id="kzc-log"></div>'
      + '<div id="kzc-ctx"></div>';
  }
  var _built = false;
  function build() {
    var host = $('clone-panel'); if (!host) return null;
    if (_built) return host;
    var st = document.createElement('style'); st.textContent = buildCSS(); document.head.appendChild(st);
    host.innerHTML = buildHTML(); _built = true;
    $('kzc-paste').onclick = function () { doPaste('add'); };
    $('kzc-checklive').onclick = doCheckLive;
    $('kzc-gettoken').onclick = doGetToken;
      var ov = $('kzc-openvia'); if (ov) ov.onclick = openViaSelected;
    $('kzc-csv').onclick = exportCSV;
    var btnMask = $('kzc-toggle-mask');
    if (btnMask) {
      btnMask.onclick = function () {
        HIDE_SENSITIVE = !HIDE_SENSITIVE;
        var ico = $('kzc-mask-ico'), lbl = $('kzc-mask-lbl');
        if (ico) ico.textContent = HIDE_SENSITIVE ? '🔒' : '👁️';
        if (lbl) lbl.textContent = HIDE_SENSITIVE ? 'Bảo Mật: Đang Ẩn' : 'Bảo Mật: Đang Hiện';
        render();
      };
    }
    var allck = $('kzc-all'); if (allck) allck.onclick = function () { var v = this.checked; CLS.forEach(function (c) { c._sel = v; }); _cPaintSel(); };
    $('kzc-csvin').onclick = function () { $('kzc-csvfile').click(); };
    $('kzc-csvfile').onchange = function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importCSV(String(rd.result || '')); }; rd.readAsText(f, 'utf-8'); this.value = ''; };
    host.addEventListener('contextmenu', function (e) {
      if (e.target.closest('input, textarea, select, button, #kz-proxy-modal-overlay')) return;
      e.preventDefault();
      var tr = e.target.closest('tr');
      if (tr && /^kzc-r-/.test(tr.id || '')) { var i = +tr.id.replace('kzc-r-', ''); if (!CLS[i]._sel) { CLS.forEach(function (x) { x._sel = false; }); CLS[i]._sel = true; render(); } }
      openCtx(e.clientX, e.clientY);
    });
    document.addEventListener('click', function () { var m = $('kzc-ctx'); if (m) m.classList.remove('on'); });
    document.addEventListener('mouseup', function () { if (_cdrag.on) { _cdrag.on = false; render(); } });   // kết thúc quét chọn
    document.addEventListener('paste', function (e) {
      if (!host.classList.contains('on')) return;
      var trg = e.target;
      if (trg && (trg.tagName === 'INPUT' || trg.tagName === 'TEXTAREA' || trg.isContentEditable || (trg.closest && trg.closest('#kz-proxy-modal-overlay')))) return;
      try { var t = (e.clipboardData || window.clipboardData).getData('text'); if (t) { applyPaste(t, 'add'); e.preventDefault(); } } catch (x) {}
    });
    return host;
  }

  window.KZ.action('kzCopyText', function (el) { window.__kzCopyText(el.dataset.copy, el); });
  window.KZ.action('kzOpenProxyClone', function (el) { window.__kzOpenProxyModalForCloneTab(parseInt(el.dataset.i, 10)); });

  window.__kzOpenProxyModalForCloneTab = function (i) {
    var c = CLS[i];
    if (!c) {
      alert('Không tìm thấy thông tin Via #' + (i + 1));
      return;
    }
    if (typeof window.__kzOpenProxyModal === 'function') {
      window.__kzOpenProxyModal({
        clone: c,
        index: i,
        uid: c.uid,
        uidName: c.viaName || c.uid,
        proxy: c.proxy || '',
        onSave: function (newProxy) {
          c.proxy = newProxy;
          if (c.raw && c.raw.includes('|')) {
            var parts = c.raw.split('|').map(function (s) { return s.trim(); });
            var lastPart = parts[parts.length - 1];
            var isPx = /^(https?|socks[45]):\/\//i.test(lastPart) || /^\d{1,3}(\.\d{1,3}){3}:\d+/.test(lastPart) || /^[\w.-]+:\d+:[^:]+:[^:]+$/.test(lastPart);
            if (isPx) {
              if (newProxy) parts[parts.length - 1] = newProxy;
              else parts.pop();
            } else if (newProxy) {
              parts.push(newProxy);
            }
            c.raw = parts.join('|');
          }
          var k = clKey(c);
          var pxMap = {};
          try { pxMap = JSON.parse(kzSecureStore.getItem('reel-clone-proxies') || '{}') || {}; } catch (_) {}
          if (newProxy) pxMap[k] = newProxy;
          else delete pxMap[k];
          try { kzSecureStore.setItem('reel-clone-proxies', JSON.stringify(pxMap)); } catch (_) {} syncProxies();

          saveClones();
          render();

          if (typeof window.__kzSyncProxyToReel === 'function') {
            window.__kzSyncProxyToReel(k, newProxy);
          }
        },
        onClear: function () {
          c.proxy = '';
          var k = clKey(c);
          var pxMap = {};
          try { pxMap = JSON.parse(kzSecureStore.getItem('reel-clone-proxies') || '{}') || {}; } catch (_) {}
          delete pxMap[k];
          try { kzSecureStore.setItem('reel-clone-proxies', JSON.stringify(pxMap)); } catch (_) {} syncProxies();
          saveClones();
          render();
          if (typeof window.__kzSyncProxyToReel === 'function') {
            window.__kzSyncProxyToReel(k, '');
          }
        }
      });
    } else {
      alert('Đang tải Modal Proxy, vui lòng bấm lại sau 1 giây.');
    }
  };

  // Tab Reel vừa lưu danh sách clone → nạp lại để không ghi đè bằng bản cũ trong bộ nhớ
  window.addEventListener('kz-clones-changed', function (e) {
    if (e.detail && e.detail.source === 'clone') return;
    loadClones(); render();
  });

  window.__kzRefreshCloneTab = function () {
    loadClones();
    render();
  };

  window.kzCloneTabShow = function (show) {
    var host = build(); if (!host) return;
    host.classList.toggle('on', !!show); host.style.display = show ? '' : 'none';
    if (show) { loadClones(); render(); }
  };
})();
