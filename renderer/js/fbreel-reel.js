/* reel-tab.js — TAB ĐĂNG REEL HÀNG LOẠT (mô hình CLONE, dựng theo mẫu "MilkMAX Reels").
 * ────────────────────────────────────────────────────────────────────────────
 * ĐƠN VỊ = CLONE (cookie + token). Mỗi clone ÔM PAGE RIÊNG của nó.
 *   - Nhập clone: mỗi dòng `uid|pass|2fa|cookie[|token]` HOẶC cookie thuần. Thiếu token -> tự
 *     scrape EAAB/EAAG từ cookie (giống tab CLONE của dashboard: EB.cloneFetch, cookie riêng qua DNR).
 *   - Load page của clone: /me/accounts?fields=id,name,access_token bằng token clone -> page + PAGE TOKEN.
 *   - Đăng: mỗi clone = 1 luồng, chạy TUẦN TỰ page của chính nó; Luồng = số clone song song.
 *   - Delay giây/bài; tự NGƯNG clone khi lỗi liên tục N page; Số Vòng lặp lại toàn bộ page.
* Engine đăng: /{page}/videos qua graph-video.facebook.com — 3 pha start/transfer/finish (đúng cách ViaManager Reup Real).
 *   bản đã chạy live (postOne/classify/shortErr/getPageToken).
 * Không trùng video: cột Lượt (done) bền theo từng page (localStorage); video = (done+offset)%nfiles.
 * Tabs trong panel: Clone · Page + Token · Cấu Hình · Cột.
 */
(function () {
  'use strict';
  if (window.__kzReelTab) return;
  window.__kzReelTab = true;

  var VER = 'v20.0';                // engine graph api version cho reel (v18.0 cũ vẫn ok, giữ)
  var GVER = 'v19.0';               // version cho các call graph phụ (me/accounts…)
  var REEL_DEBUG = false;           // in chi tiết start/transfer để chẩn đoán; bật khi cần soi lỗi upload.

  /* ───────────────────────── STATE ───────────────────────── */
  // Clone: đơn vị chạy. Page thuộc clone (clone.pages).
  var CLONES = [];   // [{_cid,raw,uid,pass,twofa,cookie,token,uidName,status,pages:[],byId:{},ptok:{},
                     //   thr,okBai,errBai,tStart,tEnd,restMs,restUntil,consec,proc,det}]
                     // status: idle|run|rest|done|dead|checkpoint|spam
  var DONEMAP = {};  // pageId -> số reel đã đăng OK (bền)
  var CLPAGES = {};  // uid(hoặc _cid) -> "id\nid…" (bền) — page id của clone
  var PPAGES = {};   // uid(hoặc _cid) -> { tok, kind, pg:{pageId:{n:name,t:token}} } — bền qua F5, khỏi Load lại
  var CLONE_PROXIES = {};  // uid(hoặc _cid) -> proxy string (bền qua F5)
  try { CLONE_PROXIES = JSON.parse(kzSecureStore.getItem('reel-clone-proxies') || '{}') || {}; } catch (e) {}
  var PSTATS = {};   // pageId -> {fans,reach,eng,t} — số liệu Facebook (follower/reach/tương tác), có cache
  var FBSTATRUN = false, FBSTATSTOP = false;
  var POSTLOG = {};  // 'YYYY-MM-DD' -> số bài đăng OK trong ngày (bền) — vẽ biểu đồ hiệu suất
  var STATC = { fail: 0, cmt: 0 };  // tổng lỗi + tổng comment (bền) — cho donut + thẻ Comment
  var PHIST = [];    // lịch sử bài đã đăng QUA TOOL (bền): [{id,pid,pn,ty,cap,cl,url,t}]
  var FBPOSTS = [];  // bài kéo từ page (feed) — cache bền qua F5 để Quản lý bài không phải tải lại
  var TPL = [];      // mảng mẫu nội dung (chip)
  var CFG = { delay: 10, luong: 11, rounds: 1, stopFail: 8, rlRest: 60, vidOrder: 'rotate', roundRest: 0, logKeep: 500,
    maxPerClone: 0, maxPerPage: 0, delayMax: 0, longEvery: 0, longRest: 0, descOrder: 'rotate', autoComment: 0,
    cmtDelay: 0, cmtOrder: 'rotate', pairMode: 'linked',
    affiliate: 0, subId: 'page',
    postType: 'video', photoPer: 1,
    seedPerPost: 0, seedDelay: 15, seedLike: 0, seedMaxPerPage: 0,
    seedReactOn: 0, seedReactType: 'random', seedSelf: 0, seedMap: {} };
  var CMT = [];      // mảng mẫu BÌNH LUẬN (chip riêng)
  var SEED = [];     // mảng mẫu bình luận SEEDING (chip riêng)
  var PRODUCTS = []; // Chế độ Affiliate: [{vid,cap,link,gia,ma,_file}] — ghép cặp video↔caption↔link cho từng sản phẩm.
  var POSTED = [];   // Reel vừa đăng trong phiên: [{id, owner}] — để "Lấy reel vừa đăng" khi seeding.
  var SEEDING = false, SEEDSTOP = false;
  var SCHEDULES = [];   // Lịch Seeding (bền, localStorage): mỗi lịch là 1 snapshot cấu hình + thời điểm chạy.
  var TABID = 'tab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);  // để khoá chạy 1 lần giữa nhiều tab
  var editSchId = null; // đang sửa lịch nào (null = tạo mới)
  var schTimer = null;
  var COLS = { uid: 1, cookie: 1, token: 1, proxy: 1, status: 1, proc: 1, ok: 1, err: 1, tstart: 1, tend: 1, trest: 1 };

  var FILES = [];    // [{name, file?|handle?}] video
  var BUF = {};      // idx -> {b64,size}
  // ── PostItem (Giai đoạn 1): mỗi media GẮN CỨNG 1 caption. Engine lấy media+caption từ CÙNG 1 POST
  //    (bỏ 2 chỉ số độc lập). POSTS[i].media trỏ tới object trong FILES nên đổi thứ tự/ xoá media -> caption đi theo.
  var POSTS = [];    // [{ id, media:<FILES obj>, cap:string, custom:bool }]
  // Fanpage mặc định: bài THÊM MỚI tự gán danh sách này (đỡ phải chọn từng bài).
  var DEFAULT_PAGES = [];
  try { var _dp = JSON.parse(localStorage.getItem('kz_reel_defpages') || '[]'); if (Array.isArray(_dp)) DEFAULT_PAGES = _dp; } catch (e) {}
  function saveDefaultPages() { try { localStorage.setItem('kz_reel_defpages', JSON.stringify(DEFAULT_PAGES)); } catch (e) {} }
  var _postSeq = 0;
  function capForIndex(i) {
    var caps = TPL.map(function (s) { return String(s || ''); });
    var ne = caps.filter(function (s) { return s.trim(); });
    if (CFG.pairMode === 'shared') return ne[0] || '';
    if (CFG.pairMode === 'rotated') return ne.length ? ne[i % ne.length] : '';
    return caps[i] || '';   // 'linked' (mặc định): media i ↔ caption i, KHÔNG quay vòng
  }
  // Đồng bộ POSTS theo FILES + TPL + chế độ ghép. Giữ post custom (đã sửa tay) + caption đi theo media khi đổi thứ tự.
  // POSTS là NGUỒN CHÍNH (mỗi bài tự giữ media/cap/pages/comment/schedule). FILES = view các media hợp lệ
  // để engine (bufAt theo index) + thumbnail dùng lại. Cho phép bài media=null (dòng trống "+ Thêm bài").
  function syncPosts() {
    POSTS.forEach(function (p) { if (!p.pages) p.pages = []; });
    FILES = POSTS.map(function (p) { return p.media; }).filter(function (m) { return m && (m.file || m.handle || (m.files && m.files.length)) && m.name; });
  }
  // Thêm bài từ danh sách File (input/kéo-thả) — mỗi file 1 bài mới ở CUỐI danh sách (không đụng bài cũ).
  function addMediaFiles(list) {
    var added = 0;
    Array.prototype.forEach.call(list || [], function (file) {
      if (!(PHOTO_EXT.test(file.name) || VIDEO_EXT.test(file.name))) return;
      POSTS.push({ id: 'ps' + (++_postSeq), media: { name: file.name, file: file, _size: file.size }, cap: '', custom: false, pages: DEFAULT_PAGES.slice(), commentMode: 'global', schedMode: 'global' });
      added++;
    });
    if (added) { BUF = {}; updateVidInfo(); }
    return added;
  }
  // Thêm bài từ FileSystem handles (chọn cả thư mục).
  function addMediaHandles(handles) {
    var added = 0;
    handles.forEach(function (h) { POSTS.push({ id: 'ps' + (++_postSeq), media: { name: h.name, handle: h }, cap: '', custom: false, pages: DEFAULT_PAGES.slice(), commentMode: 'global', schedMode: 'global' }); added++; });
    if (added) { BUF = {}; updateVidInfo(); }
    return added;
  }
  // Thêm 1 bài trống (chưa có media) — người dùng bấm "+ Thêm bài đăng".
  function addEmptyPost() {
    POSTS.push({ id: 'ps' + (++_postSeq), media: null, cap: '', custom: false, pages: DEFAULT_PAGES.slice(), commentMode: 'global', schedMode: 'global' });
    renderPostList(); updateSummary();
  }
  // Thêm 1 bài ẢNH (album) — nhiều ảnh = 1 bài. media.files là mảng File.
  function addAlbumPost() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = function () {
      var imgs = Array.prototype.filter.call(this.files, function (f) { return PHOTO_EXT.test(f.name); });
      if (!imgs.length) { log('Chưa chọn ảnh hợp lệ.', 'err'); return; }
      var size = imgs.reduce(function (a, f) { return a + f.size; }, 0);
      POSTS.push({ id: 'ps' + (++_postSeq), media: { name: 'Album (' + imgs.length + ' ảnh)', files: imgs, isAlbum: true, _size: size, _n: imgs.length }, cap: '', custom: false, pages: DEFAULT_PAGES.slice(), commentMode: 'global', schedMode: 'global' });
      BUF = {}; updateVidInfo(); log('Đã thêm 1 bài ảnh (' + imgs.length + ' ảnh).', 'ok');
    };
    inp.click();
  }
  // Gắn/đổi media cho 1 bài (bấm "Chọn media" trong dòng).
  function pickMediaFor(idx) {
    var post = POSTS[idx]; if (!post) return;
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*,image/*';
    inp.onchange = function () { var file = this.files && this.files[0]; if (!file) return; post.media = { name: file.name, file: file, _size: file.size }; BUF = {}; updateVidInfo(); };
    inp.click();
  }
  // Tất cả page đang có (từ mọi clone) — cho modal chọn Fanpage. Trả [{id,name,clone,cloneName,tok,perm}].
  function allPagesFlat() {
    var out = [], seen = {};
    CLONES.forEach(function (c) {
      (c.pages || []).forEach(function (p) {
        if (seen[p.id]) return; seen[p.id] = 1;
        out.push({ id: p.id, name: p.name || '', clone: c, cloneName: c.uidName || c.uid || '', tok: !!(c.ptok && c.ptok[p.id]), perm: p.kind === 'perm' ? 'perm' : p.kind === 'noperm' ? 'noperm' : '' });
      });
    });
    return out;
  }
  function pageNameById(id) { for (var i = 0; i < CLONES.length; i++) { var p = CLONES[i].byId && CLONES[i].byId[id]; if (p) return p.name || id; } return id; }
  // Thống kê nhóm: số nội dung · lượt đăng (tổng page đã chọn) · fanpage khác nhau.
  function groupStats() {
    var n = POSTS.length, luot = 0, uniq = {};
    POSTS.forEach(function (p) { (p.pages || []).forEach(function (id) { luot++; uniq[id] = 1; }); });
    return { n: n, luot: luot, pages: Object.keys(uniq).length };
  }
  function postStatus(post) {
    if (!post || !post.media) return { cls: 'invalid', t: 'Thiếu media' };
    var f = post.media, RX = /\.(mp4|mov|m4v|webm|avi|mkv)$/i, isImgM = f.isAlbum || PHOTO_EXT.test(f.name || '');
    if (!isImgM && f.name && !RX.test(f.name)) return { cls: 'invalid', t: 'Media không hợp lệ' };
    if (!(post.pages && post.pages.length)) return { cls: 'warning', t: 'Chưa chọn Fanpage' };
    if (!String(post.cap || '').trim()) return { cls: 'warning', t: 'Thiếu caption' };
    return { cls: 'ready', t: 'Sẵn sàng' };
  }
  var RUNNING = false, STOP = false;
  var DONE = 0, TOTAL = 0, TOTPAGES = 0, CURROUND = 0, OKIDS = [], FAILIDS = [];
  var CQ = [];       // hàng đợi clone (idx) cho worker pool
  var activeTab = 'clone';   // clone|pages|config|cols
  var saveTimer = null, statTimer = null;

  /* ───────────────────────── HELPERS ───────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var shortProxy = function (px) {
    if (!px) return '';
    var s = String(px).replace(/^https?:\/\//i, '').replace(/^socks[45]:\/\//i, '');
    if (s.includes('@')) s = s.split('@')[1] || s;
    var parts = s.split(':');
    if (parts.length >= 2) return parts[0] + ':' + parts[1];
    return s;
  };
  var enc = encodeURIComponent;
  var now = function () { return new Date().toTimeString().slice(0, 8); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var num = function (n) { return n == null ? '0' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var mask = function (t) { t = String(t || ''); return t.length > 18 ? (t.slice(0, 9) + '…' + t.slice(-6)) : t; };
  var errStr = function (j) { try { return String((j && j.error && (j.error.message || j.error.error_user_msg)) || JSON.stringify(j)).slice(0, 200); } catch (e) { return String(j); } };
  function fmtDur(ms) { if (!ms || ms < 0) return '—'; var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + 'h' : '') + (h || m ? (m < 10 && h ? '0' : '') + m + 'm' : '') + (r < 10 && (h || m) ? '0' : '') + r + 's'; }
  function fmtClock(ts) { if (!ts) return '—'; var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }

  function log(msg, kind) {
    var el = $('reel-log'); if (!el) return;
    var c = kind === 'err' ? 'var(--danger-color)' : kind === 'ok' ? 'var(--success-color)' : 'var(--text-primary)';
    el.insertAdjacentHTML('afterbegin', '<div style="color:' + c + '">[' + now() + '] ' + esc(msg) + '</div>');
    var keep = CFG.logKeep || 500; while (el.childNodes.length > keep) el.removeChild(el.lastChild);
    // Dòng xem nhanh trên nắp ngăn kéo (khi ngăn kéo đang đóng vẫn thấy dòng mới nhất).
    var pk = $('reel-logpeek');
    if (pk) pk.textContent = el.childNodes.length + ' dòng · mới nhất [' + now() + '] ' + msg;
  }

  /* ───────────────────────── PERSIST (localStorage, debounce) ───────────────────────── */
  function loadState() {
    try { DONEMAP = JSON.parse(localStorage.getItem('reel-donemap') || '{}') || {}; } catch (e) { DONEMAP = {}; }
    try { CLPAGES = JSON.parse(localStorage.getItem('reel-clpages') || '{}') || {}; } catch (e) { CLPAGES = {}; }
    try { PPAGES = JSON.parse(kzSecureStore.getItem('reel-ppages') || '{}') || {}; } catch (e) { PPAGES = {}; }
    try { PSTATS = JSON.parse(localStorage.getItem('reel-pstats') || '{}') || {}; } catch (e) { PSTATS = {}; }
    try { POSTLOG = JSON.parse(localStorage.getItem('reel-postlog') || '{}') || {}; } catch (e) { POSTLOG = {}; }
    try { var sc = JSON.parse(localStorage.getItem('reel-statc') || 'null'); if (sc) Object.assign(STATC, sc); } catch (e) {}
    try { var ph = JSON.parse(localStorage.getItem('reel-posts') || 'null'); if (Array.isArray(ph)) PHIST = ph; } catch (e) {}
    try { var fp = JSON.parse(localStorage.getItem('reel-fbposts') || 'null'); if (Array.isArray(fp)) FBPOSTS = fp; } catch (e) {}
    try { var t = JSON.parse(localStorage.getItem('reel-tpl') || 'null'); if (Array.isArray(t)) TPL = t; } catch (e) {}
    try { var cm = JSON.parse(localStorage.getItem('reel-cmt') || 'null'); if (Array.isArray(cm)) CMT = cm; } catch (e) {}
    try { var pr = JSON.parse(localStorage.getItem('reel-products') || 'null'); if (Array.isArray(pr)) PRODUCTS = pr.map(function (x) { return { vid: x.vid || '', cap: x.cap || '', link: x.link || '', gia: x.gia || '', ma: x.ma || '', _file: null }; }); } catch (e) {}
    try { var sd = JSON.parse(localStorage.getItem('reel-seed') || 'null'); if (Array.isArray(sd)) SEED = sd.map(seedNorm); } catch (e) {}
    if (!SEED.length) SEED = [seedNorm('')];
    reloadSchedules();
    try { var c = JSON.parse(localStorage.getItem('reel-cfg') || 'null'); if (c) Object.assign(CFG, c); } catch (e) {}
    try { var k = JSON.parse(localStorage.getItem('reel-cols') || 'null'); if (k) { Object.assign(COLS, k); COLS.proxy = 1; } } catch (e) {}
    // Nội dung cũ (textarea, cách nhau ===) -> tách thành mẫu, giữ tương thích bản v18.
    if (!TPL.length) { try { var old = localStorage.getItem('reel-desc') || ''; if (old.trim()) TPL = old.split(/\r?\n\s*={3,}\s*(?:\r?\n|$)/).map(function (s) { return s.trim(); }).filter(Boolean); } catch (e) {} }
    if (!TPL.length) TPL = [''];
    if (!CMT.length) CMT = [''];
  }
  function saveSoon() { if (saveTimer) return; saveTimer = setTimeout(function () { saveTimer = null; saveNow(); }, 1200); }
  function saveNow() {
    try { localStorage.setItem('reel-donemap', JSON.stringify(DONEMAP)); } catch (e) {}
    try { localStorage.setItem('reel-clpages', JSON.stringify(CLPAGES)); } catch (e) {}
    try { localStorage.setItem('reel-postlog', JSON.stringify(POSTLOG)); } catch (e) {}
    try { localStorage.setItem('reel-statc', JSON.stringify(STATC)); } catch (e) {}
  }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function bumpPost() { var k = todayKey(); POSTLOG[k] = (POSTLOG[k] || 0) + 1; saveSoon(); }
  function recordPost(rec) { PHIST.unshift(rec); if (PHIST.length > 5000) PHIST.length = 5000; try { localStorage.setItem('reel-posts', JSON.stringify(PHIST)); } catch (e) {} }
  function bumpFail() { STATC.fail = (STATC.fail || 0) + 1; saveSoon(); }
  function bumpCmt(n) { STATC.cmt = (STATC.cmt || 0) + (n || 1); saveSoon(); }
  function saveClones() { try { kzSecureStore.setItem('reel-clones', CLONES.map(function (c) { return c.raw; }).join('\n')); } catch (e) {} syncProxies(); if (!syncingFromOtherTab && window.kzNotifyClonesChanged) window.kzNotifyClonesChanged('reel'); }
  var syncingFromOtherTab = false;
  // Báo cho main process proxy + token (kể cả token page) của từng clone → mọi request của clone tự đi đúng proxy
  function syncProxies() { if (window.kenziSyncCloneProxies) window.kenziSyncCloneProxies('reel', CLONES, function (c) { return c.proxy || CLONE_PROXIES[clKey(c)] || ''; }); }
  // Lưu tên page + token page + user token của clone (bền qua F5) — khỏi phải Load Page/Check lại mỗi lần.
  function savePagesData(c) {
    try {
      var key = clKey(c); if (!key) return;
      var pg = {}; c.ptok = c.ptok || {};
      (c.pages || []).forEach(function (p) { pg[p.id] = { n: p.name || '', t: c.ptok[p.id] || '' }; });
      PPAGES[key] = { tok: c.token || '', kind: c.tokKind || '', pg: pg };
      kzSecureStore.setItem('reel-ppages', JSON.stringify(PPAGES));
      syncProxies();
    } catch (e) {}
  }
  // Khôi phục tên page + token page + user token đã lưu cho clone (gọi khi dựng lại danh sách page).
  function restorePagesData(c) {
    try {
      var rec = PPAGES[clKey(c)]; if (!rec) return;
      if (!c.token && rec.tok) { c.token = rec.tok; if (rec.kind) c.tokKind = rec.kind; }
      c.ptok = c.ptok || {};
      (c.pages || []).forEach(function (p) {
        var d = rec.pg && rec.pg[p.id]; if (!d) return;
        if (d.n && !p.name) p.name = d.n;
        if (d.t && !c.ptok[p.id]) c.ptok[p.id] = d.t;
      });
    } catch (e) {}
  }
  function saveTpl() { try { localStorage.setItem('reel-tpl', JSON.stringify(TPL)); } catch (e) {} try { syncPosts(); renderPostList(); } catch (e) {} }
  function saveCmt() { try { localStorage.setItem('reel-cmt', JSON.stringify(CMT)); } catch (e) {} }
  function saveProd() { try { localStorage.setItem('reel-products', JSON.stringify(PRODUCTS.map(function (x) { return { vid: x.vid, cap: x.cap, link: x.link, gia: x.gia, ma: x.ma }; }))); } catch (e) {} }
  function saveSeed() { try { localStorage.setItem('reel-seed', JSON.stringify(SEED)); } catch (e) {} }
  // Mẫu seed = {t:'chữ', imgs:['dataURL',...]}. Chuẩn hoá từ chuỗi cũ (tương thích ngược với bản chỉ có chữ).
  function seedNorm(x) {
    if (x && typeof x === 'object') return { t: String(x.t || ''), imgs: Array.isArray(x.imgs) ? x.imgs.slice() : [] };
    return { t: String(x || ''), imgs: [] };
  }
  function seedHasContent() { return SEED.some(function (x) { var n = seedNorm(x); return n.t.trim() || n.imgs.length; }); }
  // Chọn 1 mẫu seed THÔ (chưa spin) theo lượt xoay vòng — trả {t, imgs}.
  // seq=true: LUÔN xoay vòng tuần tự theo offset (dùng cho seeding: page 1→mẫu 1, page 2→mẫu 2…), bỏ qua random.
  function pickSeedRaw(arr, p, seq) {
    var parts = (arr || []).map(seedNorm).filter(function (n) { return n.t.trim() || n.imgs.length; });
    if (!parts.length) return { t: '', imgs: [] };
    var idx = (!seq && CFG.descOrder === 'random') ? Math.floor(Math.random() * parts.length) : (((p ? ((p.done || 0) + (p.offset || 0)) : 0)) % parts.length);
    return parts[idx];
  }
  // Đọc 1 file ảnh -> dataURL đã thu nhỏ (max cạnh 1080, JPEG 0.85) để lưu localStorage gọn.
  function readImgSmall(file, cb) {
    try {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var mx = 1080, w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, mx / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
            var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
            cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
            cb(cv.toDataURL('image/jpeg', 0.85));
          } catch (e) { cb(fr.result); }
        };
        img.onerror = function () { cb(fr.result); };
        img.src = fr.result;
      };
      fr.onerror = function () { cb(''); };
      fr.readAsDataURL(file);
    } catch (e) { cb(''); }
  }
  function saveCfg() { try { localStorage.setItem('reel-cfg', JSON.stringify(CFG)); } catch (e) {} }
  function saveCols() { try { localStorage.setItem('reel-cols', JSON.stringify(COLS)); } catch (e) {} }
  function clKey(c) { return c.uid && /^\d{5,}$/.test(c.uid) ? c.uid : c._cid; }

  /* ───────────────────────── PARSE CLONE (port từ dashboard.parseCloneLine) ───────────────────────── */
  var _cidSeq = 0;
  function parseCloneLine(raw) {
    raw = (raw || '').trim();
    var c = { _cid: 'rc' + (++_cidSeq), raw: raw, uid: '', pass: '', twofa: '', cookie: '', token: '', bmId: '', su: false, proxy: '',
      uidName: '', status: 'idle', pages: [], byId: {}, ptok: {}, thr: 0, okBai: 0, errBai: 0,
      tStart: 0, tEnd: 0, restMs: 0, restUntil: 0, consec: 0, proc: '', det: '' };
    if (!raw) return c;
    if (/c_user=\d+/.test(raw) && /[;=]/.test(raw) && !raw.includes('|')) {
      c.cookie = raw;
    } else if (raw.includes('|')) {
      var p = raw.split('|').map(function (s) { return s.trim(); });
      // Định dạng System User (đăng bằng TOKEN PAGE, không cần nick/cookie): UID|IdBM|TokenSystemUser
      // 3 phần: uid số, id BM số, token EAA — không có cookie. Lấy page + token page từ BM qua SU token.
      if (p.length === 3 && /^\d{6,}$/.test(p[0]) && /^\d{6,}$/.test(p[1]) && /^EAA/.test(p[2] || '') && p[2].length > 40) {
        c.uid = p[0]; c.bmId = p[1]; c.token = p[2]; c.su = true; c.tokKind = /^EAAB/.test(p[2]) ? 'EAAB' : 'EAAG';
      } else {
        c.uid = p[0] || ''; c.pass = p[1] || ''; c.twofa = p[2] || '';
        var ck = p.find(function (x) { return /c_user=\d+/.test(x) || /(^|;)\s*(datr|sb|xs)=/.test(x); });
        if (ck) c.cookie = ck;
        var tokens = p.filter(function (x) { return /^EAA[A-Za-z0-9]/.test(x) && x.length > 40; });
        if (tokens.length) {
          var eau = tokens.find(function (x) { return /^EAAAAU/.test(x); });
          var eab = tokens.find(function (x) { return /^EAAB/.test(x); });
          var eag = tokens.find(function (x) { return /^EAAG/.test(x); });
          c.eaaaau = eau || ''; c.eaab = eab || ''; c.eaag = eag || '';
          c.token = eau || eab || eag || tokens[0];
          c.tokKind = /^EAAAAU/.test(c.token) ? 'EAAAAU' : /^EAAB/.test(c.token) ? 'EAAB' : /^EAAG/.test(c.token) ? 'EAAG' : 'other';
        }
      }
    } else if (/^EAA/.test(raw) && raw.length > 40) {
      c.token = raw;   // token thuần (tương thích bản token-app cũ)
    } else {
      c.cookie = raw;
    }
    // Proxy đính trong dòng (ip:port hoặc host:port:user:pass) — dùng cho fetch qua /api/px.php.
    if (raw.includes('|')) {
      var pxp = raw.split('|').map(function (s) { return s.trim(); }).find(function (x) { return /^\d{1,3}(\.\d{1,3}){3}:\d+/.test(x) || /^[\w.-]+:\d+:[^:|]+:[^:|]+$/.test(x); });
      if (pxp) c.proxy = pxp;
    }
    var m = (c.cookie || raw).match(/c_user=(\d+)/);
    if (m && !/^\d{5,}$/.test(c.uid)) c.uid = m[1];
    return c;
  }

  function applyClones() {
    var text = ($('reel-clones') && $('reel-clones').value) || '';
    var lines = text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var oldByRaw = {}; CLONES.forEach(function (c) { oldByRaw[c.raw] = c; });
    var seen = {};
    CLONES = [];
    lines.forEach(function (ln) {
      if (seen[ln]) return; seen[ln] = 1;
      var c = oldByRaw[ln] || parseCloneLine(ln);
      var k = clKey(c);
      if (!c.proxy && CLONE_PROXIES[k]) c.proxy = CLONE_PROXIES[k];
      else if (c.proxy) CLONE_PROXIES[k] = c.proxy;
      // nạp lại page đã lưu của clone
      if (!c.pages.length) setClonePagesFromText(c, CLPAGES[k] || '');
      CLONES.push(c);
    });
    try { kzSecureStore.setItem('reel-clone-proxies', JSON.stringify(CLONE_PROXIES)); } catch (e) {}
    saveClones();
    renderClones(); renderPages(); updateSummary();
  }
  // Tab Clone vừa lưu danh sách → nạp lại (giữ token/page đang có theo từng dòng clone), không báo ngược lại
  window.addEventListener('kz-clones-changed', function (e) {
    if (e.detail && e.detail.source === 'reel') return;
    var ta = $('reel-clones'); if (!ta) return;
    ta.value = kzSecureStore.getItem('reel-clones') || '';
    syncingFromOtherTab = true;
    try { applyClones(); } finally { syncingFromOtherTab = false; }
  });
  function applyPasteClones(txt, mode) {
    var ta = $('reel-clones'); if (!ta) return;
    ta.value = (mode === 'replace') ? txt : ((ta.value ? ta.value + '\n' : '') + txt);
    applyClones();
    log('Đã dán clone' + (mode === 'replace' ? ' (xoá cũ).' : ' (thêm).'), 'ok');
    ensureTokensSoon();
  }

  // Gán page cho clone từ text id (giữ done bền).
  function setClonePagesFromText(c, text) {
    var ids = String(text || '').split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\d{5,}$/.test(s); });
    var seen = {}, out = []; ids.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    var oldById = c.byId || {}; c.pages = []; c.byId = {};
    out.forEach(function (id) {
      var old = oldById[id];
      var p = old || { id: id, name: '', kind: 'wait', vid: '', link: '', err: '', note: '', pin: false, time: '', offset: 0, okCount: 0, target: 1, done: 0, det: '' };
      p.done = DONEMAP[id] || 0; p._cl = c;
      c.pages.push(p); c.byId[id] = p;
    });
    CLPAGES[clKey(c)] = out.join('\n'); saveSoon();
    restorePagesData(c);   // khôi phục tên + token page + user token đã lưu (bền qua F5)
  }

  /* ───────────────────────── LẤY TOKEN TỪ COOKIE (port cloneEnsureToken) ───────────────────────── */
  function cloneFetch(url, cookie) {
    if (!(window.EB && window.EB.cloneFetch)) return Promise.reject(new Error('Thiếu cầu tiện ích (EB.cloneFetch)'));
    return window.EB.cloneFetch(url, cookie || '', {});
  }
  async function ensureToken(c) {
    if (c.token && c.token.length >= 30) { if (!c.tokKind) c.tokKind = /^EAAB/.test(c.token) ? 'EAAB' : /^EAAG/.test(c.token) ? 'EAAG' : 'other'; return true; }
    if (!c.cookie) return false;
    try { var m = String(c.cookie).match(/c_user=(\d+)/); if (m && !c.uid) c.uid = m[1]; } catch (e) {}
    // EAAB (app Ads/Business) mới có quyền quản lý Page. EAAG (app khác) KHÔNG liệt kê /me/accounts được
    // → quét EAAB ở TẤT CẢ nguồn trước, chỉ nhận EAAG khi hết cách (và đánh dấu để cảnh báo).
    var urls = ['https://adsmanager.facebook.com/adsmanager/manage/campaigns', 'https://business.facebook.com/content_management', 'https://business.facebook.com/latest/home', 'https://www.facebook.com/adsmanager/manage/campaigns'];
    var eaag = '';
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await cloneFetch(urls[i], c.cookie);
        var t = (r && r.text) || '';
        var b = t.match(/EAAB[0-9A-Za-z]+/g);
        if (b) { c.token = b.sort(function (x, y) { return y.length - x.length; })[0]; c.tokKind = 'EAAB'; saveClones(); return true; }
        if (!eaag) { var g = t.match(/EAAG[0-9A-Za-z]+/g); if (g) { var best = g.sort(function (x, y) { return y.length - x.length; })[0]; if (best.length >= 100) eaag = best; } }
      } catch (e) {}
    }
    // Fallback mạnh (port dashboard.js): mint token qua bizkit mutation — ăn cả khi via dính 2FA/verify,
    // và cho token dài hợp lệ hơn chuỗi EAAG rác cào từ HTML.
    var minted = await mintTokenBizkit(c);
    if (minted) { c.token = minted; c.tokKind = /^EAAB/.test(minted) ? 'EAAB' : 'EAAG'; saveClones(); return true; }
    if (eaag) { c.token = eaag; c.tokKind = 'EAAG'; saveClones(); return true; }
    return !!c.token;
  }
  // Mint token qua bizkit mutation (port dashboard.js fetchTokenFromFB PASS 1.5): dùng dtsg+lsd của clone,
  // businessID cố định của FB — trả apiAccessToken (EAAG/EAAB) kể cả khi via 2FA/verify. Ưu tiên EAAB.
  async function mintTokenBizkit(c) {
    try {
      if (!(await cloneUserAuth(c))) return '';
      var ck = String(c.cookie).replace(/;?\s*i_user=\d+/g, '');
      var body = 'fb_dtsg=' + enc(c._udtsg) + '&jazoest=' + jazoest(c._udtsg) + (c._ulsd ? ('&lsd=' + enc(c._ulsd)) : '')
        + '&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=PageContentTabUpdateBizKitWaitlistStatusMutation'
        + '&variables=' + enc('{"businessID":"1084522998946240"}') + '&server_timestamps=true&doc_id=5231097136973377';
      var r = await window.EB.cloneFetch('https://business.facebook.com/api/graphql/', ck, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-friendly-name': 'PageContentTabUpdateBizKitWaitlistStatusMutation', 'x-fb-lsd': c._ulsd || '', 'x-asbd-id': '129477' }, body: body });
      var t = (r && r.text) || '';
      var b = (t.match(/EAAB[a-zA-Z0-9]+/g) || []).sort(function (x, y) { return y.length - x.length; })[0] || '';
      if (b && b.length >= 100) return b;
      var g = (t.match(/EAAG[a-zA-Z0-9]+/g) || []).sort(function (x, y) { return y.length - x.length; })[0] || '';
      if (g && g.length >= 100) return g;
    } catch (e) {}
    return '';
  }
  var _tokTimer = null;
  function ensureTokensSoon() { if (_tokTimer) return; _tokTimer = setTimeout(function () { _tokTimer = null; ensureAllTokens(); }, 400); }
  async function ensureAllTokens() {
    for (var i = 0; i < CLONES.length; i++) {
      var c = CLONES[i]; if (c.token || !c.cookie) continue;
      var ok = await ensureToken(c);
      c.proc = ok ? 'có token' : 'thiếu token'; updateCloneRow(i);
    }
    updateSummary();
  }
  // Lấy tên FB clone (hiển thị).
  async function fetchName(c) {
    if (c.uidName || !c.token) return;
    try {
      var r = await graph('GET', GVER + '/me?fields=id,name&access_token=' + enc(c.token));
      if (r.json && r.json.name) { c.uidName = r.json.name; if (r.json.id) c.uid = r.json.id; }
    } catch (e) {}
  }

  /* ───────────────────────── LOAD PAGE + PAGE TOKEN ───────────────────────── */
  // fetch FB: có proxy -> qua server /api/px.php (mỗi via 1 IP, song song); không -> EB.cloneFetch (IP máy).
  function ebFetchP(url, cookie, opts, proxy) {
    if (proxy && window.kenziPxFetch) return window.kenziPxFetch(url, cookie || '', opts || {}, proxy);
    if (window.EB && window.EB.cloneFetch) return window.EB.cloneFetch(url, cookie || '', opts || {});
    return Promise.reject(new Error('Thiếu cầu tiện ích (EB.cloneFetch)'));
  }
  async function graph(method, path, proxy) {
    var url = 'https://graph.facebook.com/' + path;
    // Ưu tiên fetch NỀN qua extension (không dính CORS của trang) — cần cho domain khác milkmax (vd Kenzi).
    if ((proxy && window.kenziPxFetch) || (window.EB && window.EB.cloneFetch)) {
      try {
        var r = await ebFetchP(url, '', { method: method }, proxy);
        var j = r && r.json; if (!j && r && r.text) { try { j = JSON.parse(r.text); } catch (e) { j = { _raw: r.text }; } }
        return { json: j || {}, status: (r && r.status) || 0 };
      } catch (e) { return { json: { error: { message: (e && e.message) || 'EB fetch lỗi' } }, status: 0 }; }
    }
    var res = await fetch(url, { method: method }); var txt = await res.text(); var j; try { j = JSON.parse(txt); } catch (e) { j = { _raw: txt }; } return { json: j, status: res.status };
  }
  // graph có timeout: FB đôi khi treo (vd client_pages BM khủng) — không để đứng hình vô hạn.
  function graphT(method, path, ms) {
    return Promise.race([graph(method, path), new Promise(function (res) { setTimeout(function () { res({ json: { error: { message: 'timeout' } }, _timeout: true, status: 0 }); }, ms || 12000); })]);
  }
  // graph GET qua FETCH NỀN của extension (EB.cloneFetch) — đường đăng reel vẫn chạy ổn, tránh trường hợp
  // fetch của TRANG tới graph.facebook.com bị treo trong 1 số trình duyệt clone. Có timeout, fallback về graphT.
  async function graphEB(path, ms, proxy) {
    if ((proxy && window.kenziPxFetch) || (window.EB && window.EB.cloneFetch)) {
      var run = ebFetchP('https://graph.facebook.com/' + path, '', {}, proxy)
        .then(function (res) { var j = res && res.json; if (!j && res && res.text) { try { j = JSON.parse(res.text); } catch (e) {} } return { json: j || {}, status: (res && res.status) || 0 }; })
        .catch(function (e) { return { json: { error: { message: (e && e.message) || 'EB fetch lỗi' } } }; });
      return Promise.race([run, new Promise(function (res) { setTimeout(function () { res({ json: { error: { message: 'timeout' } }, _timeout: true, status: 0 }); }, ms || 12000); })]);
    }
    return graphT('GET', path, ms);
  }

  // Load page + token page từ BM qua System User token (UID|IdBM|TokenSU) — KHÔNG cần cookie/nick.
  // Gộp CẢ page BM sở hữu (owned_pages) LẪN page được share vào BM (client_pages).
  async function loadPagesSU(ci, c) {
    if (!c.token || !c.bmId) { log('Clone#' + (ci + 1) + ': thiếu token/BM (định dạng UID|IdBM|TokenSystemUser).', 'err'); return 0; }
    c.ptok = c.ptok || {};
    log('Clone#' + (ci + 1) + ' (BM ' + c.bmId + '): đang lấy page trong BM…');
    var ids = [], names = {}, seen = {}, nTok = 0, edgeErr = '', MAXP = 300, incShare = false;
    function absorb(arr) {
      for (var k = 0; k < arr.length; k++) {
        var it = arr[k]; if (!it || !it.id) continue; var id = String(it.id);
        if (!seen[id]) { if (ids.length >= MAXP) break; seen[id] = 1; ids.push(id); }
        if (it.name) names[id] = it.name;
        if (it.access_token && !c.ptok[id]) { c.ptok[id] = it.access_token; nTok++; }
      }
    }
    // owned_pages xin kèm access_token (nhanh, ít). client_pages CHỈ id+name (xin token inline rất chậm).
    // Có timeout mỗi request + ngân sách thời gian tổng để không treo với BM nhiều page share.
    async function pullEdge(edge, fields, budgetMs) {
      var next = GVER + '/' + c.bmId + '/' + edge + '?fields=' + fields + '&limit=100&access_token=' + enc(c.token), guard = 0, dl = Date.now() + (budgetMs || 20000);
      while (next && guard < 60 && ids.length < MAXP && Date.now() < dl) {
        guard++;
        var r = await graphEB(next, 12000);
        if (r._timeout) { if (!edgeErr) edgeErr = edge + ' phản hồi chậm (bỏ bớt)'; break; }
        if (r.json && r.json.error) { if (!edgeErr) edgeErr = errStr(r.json); break; }
        absorb((r.json && r.json.data) || []);
        var pg = (r.json && r.json.paging && r.json.paging.next) || ''; next = pg ? pg.replace('https://graph.facebook.com/', '') : '';
      }
    }
    try {
      await pullEdge('owned_pages', 'id,name,access_token', 15000);
      // owned ít page, quan trọng → nếu chậm/timeout mà chưa có gì thì thử lại 1 lần.
      if (!ids.length) { edgeErr = ''; await sleep(1500); await pullEdge('owned_pages', 'id,name,access_token', 15000); }
      // Hiện owned trước cho nhanh, rồi mới nạp share.
      if (ids.length) { setClonePagesFromText(c, ids.join('\n')); c.pages.forEach(function (p) { if (names[p.id]) p.name = names[p.id]; }); renderPages(); updateSummary(); }
      // Page SHARE (client_pages) chỉ kéo khi bật ô "Gồm page share" — mặc định tắt cho nhẹ/nhanh.
      incShare = !!($('reel-inc-share') && $('reel-inc-share').checked);
      if (incShare) await pullEdge('client_pages', 'id,name', 20000);
    } catch (e) {}
    // Token page: page nào FB chưa trả access_token thì lấy thêm — SONG SONG (chunk 8) + GIỚI HẠN 60 page
    // để KHÔNG treo khi BM có rất nhiều page share; phần còn lại lấy LAZY lúc đăng (getPageToken).
    var need = ids.filter(function (id) { return !c.ptok[id]; }).slice(0, 60);
    for (var s = 0; s < need.length; s += 8) {
      var batch = need.slice(s, s + 8);
      var res = await Promise.all(batch.map(function (id) {
        return graphEB(GVER + '/' + id + '?fields=access_token&access_token=' + enc(c.token), 10000)
          .then(function (rr) { return { id: id, tok: (rr.json && rr.json.access_token) || '' }; })
          .catch(function () { return { id: id, tok: '' }; });
      }));
      res.forEach(function (x) { if (x.tok) { c.ptok[x.id] = x.tok; nTok++; } });
    }
    if (ids.length) {
      setClonePagesFromText(c, ids.join('\n'));
      c.pages.forEach(function (p) { if (names[p.id]) p.name = names[p.id]; });
      log('Clone#' + (ci + 1) + ' (BM ' + c.bmId + '): ' + ids.length + ' page' + (ids.length >= MAXP ? ' (giới hạn ' + MAXP + ')' : '') + ' (' + (incShare ? 'owned + share' : 'owned') + ' · token page ' + nTok + (nTok < ids.length ? ', còn lại lấy khi đăng' : '') + ')' + (edgeErr ? ' · lưu ý: ' + edgeErr : '') + '.', nTok ? 'ok' : 'err');
    } else log('Clone#' + (ci + 1) + ' (BM ' + c.bmId + '): không lấy được page' + (/chậm|timeout/i.test(edgeErr) ? ' — Facebook phản hồi chậm (có thể bị rate-limit do load nhiều lần). Đợi 1–2 phút rồi Load lại.' : (edgeErr ? (' — ' + edgeErr) : ' (SU token thiếu quyền pages_* hoặc sai id BM).')), 'err');
    savePagesData(c); updateCloneRow(ci); renderPages(); updateSummary();
    return ids.length;
  }
  async function loadPagesOf(ci) {
    var c = CLONES[ci]; if (!c) return 0;
    if (c.su) return loadPagesSU(ci, c);
    // Clone dạng UID|MẬT_KHẨU|2FA: login FB4A lấy token EAAAAU + cookie phiên mới (đầy đủ quyền, khỏi lệ thuộc cookie cũ).
    if (c.pass && c.uid && (!c.token || c.tokKind === 'EAAG') && window.EB && window.EB.fbLogin) {
      log('Clone#' + (ci + 1) + ': đang login FB4A lấy token EAAAAU…');
      try {
        var lr = await window.EB.fbLogin(c.uid, c.pass, c.twofa || '');
        if (lr && lr.token) {
          c.token = lr.token; c.tokKind = /^EAAB/.test(lr.token) ? 'EAAB' : /^EAAG/.test(lr.token) ? 'EAAG' : 'other';
          if (lr.cookie) c.cookie = lr.cookie;
          saveClones(); updateCloneRow(ci);
          log('Clone#' + (ci + 1) + ': login OK · token ' + String(lr.token).slice(0, 10) + '…' + (lr.cookie ? ' + cookie mới' : '') + '.', 'ok');
        } else log('Clone#' + (ci + 1) + ' login FB4A: không nhận được token.', 'err');
      } catch (e) { log('Clone#' + (ci + 1) + ' login FB4A lỗi: ' + ((e && e.message) || e), 'err'); }
    }
    if (!c.token) { var got = await ensureToken(c); if (!got) { log('Clone#' + (ci + 1) + ': chưa có token (cookie hỏng?)', 'err'); return 0; } }
    c.ptok = c.ptok || {};
    var ids = [], names = {}, nTok = 0, upgraded = false, lastRaw = '', _hadErr = false;
    async function runOnce() {
      ids = []; names = {}; nTok = 0;
      var next = GVER + '/me/accounts?fields=id,name,access_token&limit=200&access_token=' + enc(c.token), guard = 0;
      while (next && guard < 200) {
        guard++;
        // Gọi qua FETCH NỀN của extension (graphEB) thay vì fetch của trang — trang Kenzi khác origin bị
        // chặn CORS khi gọi thẳng graph.facebook.com; fetch nền không dính CORS nên chạy ở mọi domain.
        var r = await graphEB(next, 12000, c.proxy);
        if (guard === 1) { try { lastRaw = JSON.stringify(r.json || {}).slice(0, 350); } catch (e) { lastRaw = 'status ' + (r && r.status); } }
        if (r.json && r.json.error) {
          var es = errStr(r.json);
          // Token yếu (EAAG app không quản lý Page) → tự nâng cấp: mint EAAB qua bizkit rồi chạy lại 1 lần.
          if (!upgraded && (c.tokKind === 'EAAG' || /error loading application|\b2500\b/i.test(es))) {
            var better = await mintTokenBizkit(c);
            if (better && better !== c.token) { c.token = better; c.tokKind = /^EAAB/.test(better) ? 'EAAB' : 'EAAG'; saveClones(); upgraded = true; log('Clone#' + (ci + 1) + ': token yếu → đã nâng cấp, thử lại…'); return 'retry'; }
            es = 'token EAAG (app không có quyền quản lý Page) — cần token EAAB: đăng nhập Business/Ads Manager cho clone rồi Load lại, hoặc dán clone kèm token EAAB.';
          }
          var _e = r.json.error || {}; var _x = ' [code=' + (_e.code || '?') + (_e.error_subcode ? (' sub=' + _e.error_subcode) : '') + ']';
          _hadErr = true;   // có lỗi thực (token hỏng/thiếu quyền) — khác với "trả về rỗng" (via không có Page)
          log('Clone#' + (ci + 1) + ' load lỗi: ' + es + _x, 'err'); return 'err';
        }
        var arr = (r.json && r.json.data) || [];
        for (var k = 0; k < arr.length; k++) {
          var it = arr[k]; if (!it || !it.id) continue;
          ids.push(String(it.id)); if (it.name) names[String(it.id)] = it.name;
          if (it.access_token) { c.ptok[String(it.id)] = it.access_token; nTok++; }
        }
        var pg = (r.json && r.json.paging && r.json.paging.next) || ''; next = pg ? pg.replace('https://graph.facebook.com/', '') : '';
      }
      return 'ok';
    }
    try { if ((await runOnce()) === 'retry') await runOnce(); } catch (e) {}
    // Tự NÂNG CẤP token khi /me/accounts trả 0 page (token cào được thiếu pages_show_list). Chỉ chạy khi 0 page
    // + có cookie → không làm chậm tải hàng loạt. Thử theo thứ tự token MẠNH dần:
    // KHÔNG GHI ĐÈ token đang có nếu token thay thế cũng không ra page: thử token ứng viên, chỉ GIỮ khi nó
    // thực sự liệt kê được page; nếu không thì KHÔI PHỤC token gốc (tránh làm hỏng token tốt vừa dán tay).
    // Chỉ chạy vòng cứu token khi CÓ lỗi thực (token hỏng/thiếu quyền). Nếu /me/accounts trả rỗng KHÔNG lỗi
    // (via sống nhưng không có Page nào) thì đừng login lại vô ích.
    if (!ids.length && window.EB && _hadErr) {
      var _origTok = c.token, _origKind = c.tokKind, _origCk = c.cookie;
      async function tryCand(cand, kind, label, newCookie) {
        if (ids.length || !cand || cand === c.token) return;
        log('Clone#' + (ci + 1) + ': token 0 page → thử ' + label + '…');
        var savT = c.token, savK = c.tokKind, savC = c.cookie;
        c.token = cand; c.tokKind = kind; if (newCookie) c.cookie = newCookie;
        try { await runOnce(); } catch (e) {}
        if (ids.length) { saveClones(); }              // ứng viên ra page -> giữ (cả cookie mới nếu có)
        else { c.token = savT; c.tokKind = savK; c.cookie = savC; } // không ra -> trả nguyên trạng
      }
      // (0) LOGIN FB4A LẠI (uid+pass+2fa) — mạnh nhất, ăn cả khi token/cookie cũ đã CHẾT (190 sub=452:
      //     đổi mật khẩu / FB đổi phiên). bizkit & OAuth-tab đều dựa cookie cũ nên vô ích ở ca này.
      if (c.pass && c.uid && window.EB.fbLogin) {
          try {
            log('Clone#' + (ci + 1) + ': token 0 page → login FB4A lại lấy phiên mới…');
            var lrr = await window.EB.fbLogin(c.uid, c.pass, c.twofa || '');
            if (lrr && lrr.token) {
              c.token = lrr.token;
              c.tokKind = 'EAAAAU';
              if (lrr.cookie) c.cookie = lrr.cookie;
              saveClones();
              updateCloneRow(ci);
              log('Clone#' + (ci + 1) + ': login FB4A thành công → token EAAAAU phiên mới.', 'ok');
              await runOnce();
              if (ids.length) { saveClones(); }
            } else {
              log('Clone#' + (ci + 1) + ': login FB4A lại không nhận được token.', 'err');
            }
          } catch (eL) {
            log('Clone#' + (ci + 1) + ': login FB4A lại lỗi (' + ((eL && eL.message) || eL) + ') — kiểm tra mật khẩu/2FA.', 'err');
          }
        }
        // (1) Nếu vẫn 0 page và có EAAB từ clone đã parse: thử EAAB
        if (!ids.length && c.eaab && c.eaab !== c.token) {
          c.token = c.eaab; c.tokKind = 'EAAB';
          try { await runOnce(); if (ids.length) saveClones(); } catch (e) {}
        }
        // (2) bizkit & EAAAAU qua cookie
        if (!ids.length && c.cookie && c.tokKind !== 'EAAAAU') {
          try {
            var mb = await mintTokenBizkit(c);
            if (mb && mb !== c.token) {
              c.token = mb; c.tokKind = /^EAAB/.test(mb) ? 'EAAB' : 'EAAG';
              await runOnce(); if (ids.length) saveClones();
            }
          } catch (eB) {}
        }
        if (!ids.length && c.cookie && c.tokKind !== 'EAAAAU' && window.EB.getTokenFromCookie) {
          try {
            var kt = await window.EB.getTokenFromCookie(c.cookie);
            if (kt && kt !== c.token) {
              c.token = kt; c.tokKind = 'EAAAAU';
              await runOnce(); if (ids.length) saveClones();
            }
          } catch (eK) { log('Clone#' + (ci + 1) + ': lấy EAAAAU lỗi (' + ((eK && eK.message) || eK) + ').'); }
        } // vẫn 0 -> giữ nguyên
    }
    if (ids.length) {
      setClonePagesFromText(c, ids.join('\n'));
      c.pages.forEach(function (p) { if (names[p.id]) p.name = names[p.id]; });
      log('Clone#' + (ci + 1) + ': ' + ids.length + ' page (token page cho ' + nTok + ').', nTok ? 'ok' : 'err');
    } else {
      // Probe /me để phân biệt: token hỏng vs token OK nhưng /me/accounts bị chặn (via quản page qua BM, không admin trực tiếp).
      var msg = ' (token thiếu quyền liệt kê).', isLiveNoPage = false;
      if (c.tokKind === 'EAAG') msg = ' — token EAAG thiếu quyền quản lý Page, cần token EAAB (đăng nhập Business/Ads Manager cho clone).';
      else {
        try {
          var tk = String(c.token || ''), tkInfo = ' · token ' + tk.slice(0, 8) + '…(' + tk.length + ' ký tự, ' + (c.tokKind || '?') + ')';
          var rm = await graphEB(GVER + '/me?fields=id,name&access_token=' + enc(c.token), 12000, c.proxy);
          if (rm.json && rm.json.id) {
            msg = ' — Via SỐNG (' + (rm.json.name ? (rm.json.name + ' · ') : '') + 'UID ' + rm.json.id + ') nhưng nick này KHÔNG CÓ PAGE NÀO (0 Page).';
            isLiveNoPage = true;
          } else if (rm.json && rm.json.error) {
            var em = rm.json.error || {};
            var meta = ' [code=' + (em.code || '?') + (em.error_subcode ? (' sub=' + em.error_subcode) : '') + (em.type ? (' ' + em.type) : '') + ']';
            msg = ' — /me lỗi: ' + (em.message || '') + meta + tkInfo
              + (em.code === 1 || em.code === 2 ? ' → code 1/2 = FB tạm nghẽn/chặn IP: thử lại sau vài phút hoặc đổi IP/proxy. Nếu vẫn lỗi → token/cookie hỏng, Lấy Token lại (cookie đủ c_user/xs).'
                : em.code === 190 ? ' → token hết hạn/sai: Lấy Token lại.' : ' → token/cookie hỏng, Lấy Token lại.');
          }
        } catch (e) {}
      }
      log('Clone#' + (ci + 1) + (isLiveNoPage ? '' : ': không load được page') + msg, isLiveNoPage ? 'warn' : 'err');
      if (lastRaw) log('Clone#' + (ci + 1) + ' · /me/accounts trả về: ' + lastRaw);
    }
    savePagesData(c); updateCloneRow(ci); renderPages(); updateSummary();
    return ids.length;
  }
  // Đổi 1 token bất kỳ sang token Android Katana (EAAAAU) qua auth.getSessionforApp (app FB4A 350685531728).
  // Đi qua fetch nền extension (api.facebook.com). Trả token EAAAAU hoặc '' nếu không đổi được.
  async function convertToKatana(token) {
    if (!token || !(window.EB && window.EB.cloneFetch)) return '';
    var body = 'access_token=' + enc(token) + '&format=json&new_app_id=350685531728&generate_session_cookies=1';
    try {
      var r = await window.EB.cloneFetch('https://api.facebook.com/method/auth.getSessionforApp', '', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body });
      var t = (r && r.text) || ''; var j = {}; try { j = JSON.parse(t); } catch (e) {}
      if (j && j.access_token) return j.access_token;
    } catch (e) {}
    return '';
  }
  // Lấy token cho clone: ưu tiên EAAAAU (Katana). Đường 1: OAuth-tab (extension). Đường 2 (fallback, không cần tab):
  // lấy token nền từ cookie (ensureToken/bizkit) rồi convert sang EAAAAU. Đặt được EAAAAU thì rút page token dễ.
  async function getTokensFor(idxs) {
    var run = (idxs && idxs.length) ? idxs : CLONES.map(function (_, i) { return i; });
    if (!run.length) { log('Chưa có clone.', 'err'); return; }
    var btn = $('reel-gettoken'); if (btn) { btn.disabled = true; btn.textContent = 'Đang lấy…'; }
    var ok = 0, er = 0;
    for (var k = 0; k < run.length; k++) {
      var c = CLONES[run[k]]; if (!c) continue;
      if (!c.cookie && !c.token) { er++; log('Clone#' + (run[k] + 1) + ': không có cookie/token.', 'err'); continue; }
      log('Clone#' + (run[k] + 1) + ': đang lấy token…');
      var t = '', via = '';
      try {
        // Đường 1 (ưu tiên): token Katana EAAAAU qua OAuth-tab ẩn (fb_get_token) — full quyền, list page tốt nhất.
        if (c.cookie && window.EB && window.EB.getTokenFromCookie) {
          try {
            var kt0 = await window.EB.getTokenFromCookie(c.cookie);
            if (kt0 && kt0.length >= 30) { t = kt0; via = 'EAAAAU (oauth)'; }
          } catch (e0) { log('Clone#' + (run[k] + 1) + ': OAuth-tab lỗi (' + ((e0 && e0.message) || e0) + ') → thử token nền…'); }
        }
        // Đường 2 (fallback nếu OAuth-tab không ra): token nền từ cookie (EAAB/EAAG qua bizkit), thử convert Katana.
        if (!t) {
          if (!c.token && c.cookie) { try { await ensureToken(c); } catch (e2) {} }
          var base = c.token || '';
          if (base) {
            var kt = await convertToKatana(base);
            if (kt && kt.length >= 30) { t = kt; via = 'EAAAAU'; }
            else { t = base; via = /^EAAB/.test(base) ? 'EAAB (đủ dùng)' : 'nền'; }
          }
        }
      } catch (e) { log('Clone#' + (run[k] + 1) + ': lỗi ' + ((e && e.message) || e), 'err'); }
      if (t && t.length >= 30) {
        c.token = t; c.tokKind = /^EAAB/.test(t) ? 'EAAB' : /^EAAAAU/.test(t) ? 'EAAAAU' : 'other'; c._udtsg = ''; saveClones();
        c.proc = 'có token'; updateCloneRow(run[k]); ok++; savePagesData(c);
        log('Clone#' + (run[k] + 1) + ': ✓ ' + (c.tokKind) + ' ' + t.slice(0, 12) + '… (' + t.length + ' ký tự · ' + via + ')', 'ok');
      } else { er++; log('Clone#' + (run[k] + 1) + ': không lấy được token (cookie hỏng / bị chặn IP / cần proxy).', 'err'); }
    }
    if (btn) { btn.disabled = false; btn.textContent = '🔑 Lấy Token'; }
    updateSummary();
    log('Lấy token xong: ' + ok + ' OK · ' + er + ' lỗi.', er ? 'err' : 'ok');
  }
  async function loadPagesAll(onlySel) {
    var idxs = onlySel ? selCloneIdx() : CLONES.map(function (_, i) { return i; });
    if (!idxs.length) idxs = CLONES.map(function (_, i) { return i; });
    var btn = $('reel-loadpages'); if (btn) { btn.disabled = true; btn.textContent = 'Đang load…'; }
    var total = 0, done = 0;
    // song song nhẹ (5) để nhanh mà không sốc
    var q = idxs.slice();
    async function w() { while (q.length) { var ci = q.shift(); var n = await loadPagesOf(ci); total += n; done++; if (btn) btn.textContent = 'Đang load ' + done + '/' + idxs.length + '…'; } }
    var pool = []; for (var i = 0; i < 5; i++) pool.push(w()); await Promise.all(pool);
    if (btn) { btn.disabled = false; btn.textContent = '🔽 Load Page Từ Clone'; }
    log('Đã load tổng ' + total + ' page từ ' + idxs.length + ' clone.', 'ok');
  }
  async function getPageToken(c, pageId) {
    c.ptok = c.ptok || {};
    if (c.ptok[pageId]) return c.ptok[pageId];
    try { var r = await graph('GET', GVER + '/' + pageId + '?fields=access_token&access_token=' + enc(c.token)); if (r.json && r.json.access_token) { c.ptok[pageId] = r.json.access_token; return r.json.access_token; } } catch (e) {}
    return c.token;
  }

  /* ───────────────────────── ENGINE ĐĂNG REEL (giữ nguyên bản live) ───────────────────────── */
  // Spintax: {a|b|c} -> chọn ngẫu nhiên 1 nhánh (xử lý cả lồng nhau). 22 mẫu + spintax = hàng nghìn biến thể.
  function spin(s) {
    s = String(s || ''); var g = 0;
    while (/\{[^{}]*\}/.test(s) && g < 30) { g++; s = s.replace(/\{([^{}]*)\}/g, function (_, body) { var opts = body.split('|'); return opts[Math.floor(Math.random() * opts.length)]; }); }
    return s;
  }
  // Chọn 1 mẫu từ mảng theo thứ tự (xoay vòng theo page hoặc ngẫu nhiên) rồi spin.
  function pickFrom(arr, p) {
    var parts = arr.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    if (!parts.length) return '';
    var idx = (CFG.descOrder === 'random') ? Math.floor(Math.random() * parts.length) : (((p ? ((p.done || 0) + (p.offset || 0)) : 0)) % parts.length);
    return spin(parts[idx]);
  }
  // Chọn 1 mẫu THÔ (chưa spin) — để điền {{link}} trước rồi mới spin (spin sẽ nuốt {{...}} nếu chạy trước).
  function pickRaw(arr, p, order) {
    var parts = arr.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    if (!parts.length) return '';
    var ord = order || CFG.descOrder;
    var idx = (ord === 'random') ? Math.floor(Math.random() * parts.length) : (((p ? ((p.done || 0) + (p.offset || 0)) : 0)) % parts.length);
    return parts[idx];
  }
  function pickDesc(p) { return pickFrom(TPL, p); }
  function pickComment(p) { return pickFrom(CMT, p); }
  // Affiliate: link sản phẩm + gắn sub_id (theo page hoặc clone) để biết nguồn ra đơn trên dashboard Shopee.
  function affLink(product, p, c) {
    var link = String((product && product.link) || '').trim();
    if (!link) return '';
    var sid = CFG.subId === 'page' ? (p && p.id) : CFG.subId === 'clone' ? (c && (c.uid || c._cid)) : '';
    if (sid) link += (link.indexOf('?') >= 0 ? '&' : '?') + 'sub_id1=' + enc(sid);
    return link;
  }
  // Điền {{gia}} {{ma}} {{link}} theo sản phẩm, RỒI mới spin (để spintax {a|b} không nuốt {{...}}).
  function fillVars(text, product, p, c) {
    text = String(text || '');
    if (product) {
      text = text.replace(/\{\{\s*gia\s*\}\}/gi, product.gia || '')
                 .replace(/\{\{\s*ma\s*\}\}/gi, product.ma || '')
                 .replace(/\{\{\s*link\s*\}\}/gi, affLink(product, p, c));
    } else {
      text = text.replace(/\{\{\s*(gia|ma|link)\s*\}\}/gi, '');
    }
    return spin(text);
  }
  // Chọn sản phẩm cho page (xoay vòng theo lượt) — chỉ tính sản phẩm ĐÃ có video.
  function pickProduct(p) {
    if (!CFG.affiliate) return null;
    var list = PRODUCTS.filter(function (x) { return x._file; });
    if (!list.length) return null;
    var idx = (CFG.descOrder === 'random') ? Math.floor(Math.random() * list.length) : (((p ? ((p.done || 0) + (p.offset || 0)) : 0)) % list.length);
    return list[idx];
  }
  // Đọc file thành BYTES (ArrayBuffer) — engine mới đẩy chunk nhị phân trực tiếp, không dùng base64.
  function readFileBytes(file) { return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve({ bytes: new Uint8Array(r.result), size: file.size }); }; r.onerror = function () { reject(new Error('Đọc file lỗi')); }; r.readAsArrayBuffer(file); }); }
  async function fileAt(i) {
    var f = FILES[i]; if (!f) return null;
    if (f.file) return f.file;
    if (f.handle) { try { return await f.handle.getFile(); } catch (e) { return null; } }
    return null;
  }
  async function bufAt(i) {
    if (BUF[i]) return BUF[i];
    var f = await fileAt(i); if (!f) throw new Error('Không đọc được tệp #' + (i + 1));
    BUF[i] = await readFileBytes(f); return BUF[i];
  }
  function mimeOf(name) {
    var m = String(name || '').toLowerCase().match(/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/), e = m ? m[1] : 'jpg';
    return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : e === 'gif' ? 'image/gif' : e === 'bmp' ? 'image/bmp' : (e === 'heic' || e === 'heif') ? 'image/heic' : 'image/jpeg';
  }
  // Gom `need` ảnh cho 1 bài (album nếu >1), xoay vòng theo lượt đã đăng của page.
  async function gatherPhotos(p, need) {
    var out = []; if (!FILES.length) return out;
    var start = (CFG.vidOrder === 'random') ? Math.floor(Math.random() * FILES.length) : (((p.done || 0) + (p.offset || 0)) % FILES.length);
    for (var k = 0; k < need && k < FILES.length; k++) {
      var idx = (start + k) % FILES.length, b = await bufAt(idx), f = FILES[idx];
      out.push({ bytes: b.bytes, name: f.name, type: mimeOf(f.name) });
    }
    return out;
  }
  // Host upload video (KHÁC graph thường): dùng cho /videos resumable start/transfer/finish.
  var GVHOST = 'https://graph-video.facebook.com/';
  function bytesToB64(u8) { var CH = 0x8000, s = ''; for (var i = 0; i < u8.length; i += CH) { s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); } return btoa(s); }
  async function gvPost(path, body, headers) {
    var url = GVHOST + path;
    // start/finish reel (không có body multipart) — đi qua fetch nền extension để né CORS trang ở domain khác.
    if (window.EB && window.EB.cloneFetch) {
      try {
        var opt = { method: 'POST' }; if (body != null) opt.body = body; if (headers) opt.headers = headers;
        var r = await window.EB.cloneFetch(url, '', opt);
        var j = r && r.json; if (!j && r && r.text) { try { j = JSON.parse(r.text); } catch (e) { j = { _raw: r.text }; } }
        return { json: j || {}, status: (r && r.status) || 0 };
      } catch (e) { return { json: { error: { message: (e && e.message) || 'EB fetch lỗi' } }, status: 0 }; }
    }
    var init = { method: 'POST' }; if (body != null) init.body = body; if (headers) init.headers = headers; var res = await fetch(url, init); var txt = await res.text(); var j; try { j = JSON.parse(txt); } catch (e) { j = { _raw: txt }; } return { json: j, status: res.status };
  }

  // ĐĂNG REEL theo ĐÚNG cách ViaManager "Reup Real": POST /{page}/videos qua graph-video, 3 pha
  // start (lấy upload_session_id) -> transfer (đẩy chunk multipart 'video_file_chunk', lặp theo start/end_offset)
  // -> finish (upload_session_id + description). Token app hiện tại ĐĂNG /videos được (video_reels bị app chặn #10).
  async function postOne(pageId, data, schedUnix, token, onPhase, descText) {
    var base = VER + '/' + pageId + '/videos';
    if (onPhase) onPhase('prep');
    // START
    var st = await gvPost(base + '?upload_phase=start&file_size=' + data.size + '&access_token=' + enc(token));
    if (st.json && st.json.error) throw new Error('start: ' + errStr(st.json));
    var sid = st.json && st.json.upload_session_id;
    var vid = (st.json && st.json.video_id) || '';
    if (!sid) throw new Error('start: không có upload_session_id (' + errStr(st.json) + ')');
    var off = parseInt((st.json && st.json.start_offset) || '0', 10);
    var end = parseInt((st.json && st.json.end_offset) || String(data.size), 10);
    if (REEL_DEBUG) log('🧪 start OK: video_id=' + (vid || '—') + ' start_offset=' + off + ' end_offset=' + end + ' file=' + data.size + 'B · raw=' + JSON.stringify(st.json).slice(0, 220));
    // TRANSFER (lặp theo offset FB trả về)
    if (onPhase) onPhase('up', '0%');
    var guard = 0;
    while (off < data.size && guard < 100000) {
      guard++;
      if (!(end > off)) end = data.size;
      var chunk = data.bytes.subarray(off, end);
      // Ghép multipart (field video_file_chunk như ViaManager) thành BYTES, ĐẨY QUA EXTENSION (background fetch)
      // — KHÔNG qua fetch của trang: fetch trang bị bọc ép credentials:include (gửi cookie) làm FB lỗi upload (sub 1363030).
      var boundary = '----FBReup' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      var te = new TextEncoder();
      var preU = te.encode('--' + boundary + '\r\nContent-Disposition: form-data; name="video_file_chunk"; filename="chunk"\r\nContent-Type: application/octet-stream\r\n\r\n');
      var postU = te.encode('\r\n--' + boundary + '--\r\n');
      var mp = new Uint8Array(preU.length + chunk.length + postU.length);
      mp.set(preU, 0); mp.set(chunk, preU.length); mp.set(postU, preU.length + chunk.length);
      var tUrl = GVHOST + base + '?upload_phase=transfer&upload_session_id=' + enc(sid) + '&start_offset=' + off + '&access_token=' + enc(token);
      var tj = {};
      if (window.EB && window.EB.uploadReel) {
        var up = await window.EB.uploadReel(tUrl, { 'Content-Type': 'multipart/form-data; boundary=' + boundary }, bytesToB64(mp), function (i, tt) { if (onPhase) onPhase('up', Math.min(99, Math.round((off + (tt ? (end - off) * i / tt : 0)) * 100 / Math.max(1, data.size))) + '%'); });
        try { tj = JSON.parse((up && up.text) || '{}'); } catch (e) { tj = {}; }
        if (up && up.ok === false && !tj.start_offset && !tj.success) throw new Error('transfer HTTP ' + (up && up.status) + ': ' + String((up && up.text) || '').slice(0, 200));
      } else {
        var tr = await gvPost(base + '?upload_phase=transfer&upload_session_id=' + enc(sid) + '&start_offset=' + off + '&access_token=' + enc(token), new Blob([mp]), { 'Content-Type': 'multipart/form-data; boundary=' + boundary });
        tj = tr.json || {};
      }
      if (tj && tj.error) {
        var er = tj.error || {};
        throw new Error('transfer: ' + (er.message || '') + (er.error_subcode ? (' [sub ' + er.error_subcode + ']') : '') + (er.error_user_msg ? (' — ' + er.error_user_msg) : '') + ' · chunk ' + (end - off) + 'B @off ' + off + '/' + data.size);
      }
      var nextOff = parseInt((tj && tj.start_offset != null) ? tj.start_offset : data.size, 10);
      if (isNaN(nextOff) || nextOff <= off) nextOff = end;      // tránh kẹt vòng lặp
      off = nextOff;
      end = parseInt((tj && tj.end_offset) || String(data.size), 10);
      if (onPhase) onPhase('up', Math.min(100, Math.round(off * 100 / Math.max(1, data.size))) + '%');
    }
    // FINISH (Smart Retry 3 lần & Transcode Monitor chống timeout giả từ Meta)
    if (onPhase) onPhase('fin');
    var desc = descText || '';
    var sch = (schedUnix && schedUnix > 0) ? '&published=false&scheduled_publish_time=' + schedUnix : '';
    var finUrl = base + '?upload_phase=finish&upload_session_id=' + enc(sid) + '&description=' + enc(desc) + sch + '&access_token=' + enc(token);
    
    var fin = null, finErr = '';
    for (var att = 1; att <= 3; att++) {
      try {
        fin = await gvPost(finUrl);
        if (fin && fin.json && !fin.json.error) break;
        if (fin && fin.json && fin.json.error) {
          finErr = errStr(fin.json);
          if (att < 3 && (/timeout|network|500|502|503|504|transcode/i.test(finErr) || (fin.json.error.code === 1 || fin.json.error.code === 2))) {
            if (onPhase) onPhase('fin', 'đợi máy chủ FB (' + att + '/3)…');
            await new Promise(function (res) { setTimeout(res, att * 3000); });
            continue;
          }
        }
      } catch (ex) {
        finErr = (ex && ex.message) || String(ex);
        if (att < 3) await new Promise(function (res) { setTimeout(res, att * 3000); });
      }
    }

    var finalVid = (fin && fin.json && fin.json.video_id) || vid;
    if (!finalVid && fin && fin.json && fin.json.success) finalVid = sid;

    // Transcode Monitor: nếu finish báo lỗi nhưng Meta đã cấp video_id từ pha start, probe kiểm tra trạng thái video thực tế
    if ((!fin || (fin.json && fin.json.error)) && vid) {
      if (onPhase) onPhase('fin', 'kiểm tra trạng thái Meta transcode…');
      try {
        var chk = await graphEB(GVER + '/' + vid + '?fields=status,published&access_token=' + enc(token), 10000);
        if (chk && chk.json && (chk.json.published || (chk.json.status && chk.json.status.video_status === 'ready'))) {
          log('Meta đã xử lý video ' + vid + ' thành công dù pha finish phản hồi chậm.', 'ok');
          return vid;
        }
      } catch (_) {}
    }

    if (fin && fin.json && fin.json.error) throw new Error('finish: ' + errStr(fin.json));
    return finalVid || sid;
  }

  /* ───────────────────────── ĐĂNG ẢNH lên Page ─────────────────────────
     Ảnh đơn: POST /{page}/photos (published, kèm caption). Album: up từng ảnh unpublished lấy media_fbid
     rồi POST /{page}/feed với attached_media[]. Nhị phân đẩy qua EB.uploadReel (background fetch, KHÔNG kèm
     cookie) tới graph.facebook.com — host này không bị wrapper của dashboard ép credentials. */
  async function photoUpload(pageId, img, token, published, extra) {
    var boundary = '----FBPhoto' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    var te = new TextEncoder(), chunks = [];
    function fld(name, val) { chunks.push(te.encode('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + val + '\r\n')); }
    fld('access_token', token);
    fld('published', published ? 'true' : 'false');
    if (extra) for (var k in extra) { if (extra[k] != null && extra[k] !== '') fld(k, String(extra[k])); }
    chunks.push(te.encode('--' + boundary + '\r\nContent-Disposition: form-data; name="source"; filename="' + String(img.name || 'photo.jpg').replace(/"/g, '') + '"\r\nContent-Type: ' + (img.type || 'image/jpeg') + '\r\n\r\n'));
    chunks.push(img.bytes);
    chunks.push(te.encode('\r\n--' + boundary + '--\r\n'));
    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0), mp = new Uint8Array(total), off = 0;
    chunks.forEach(function (c) { mp.set(c, off); off += c.length; });
    var url = 'https://graph.facebook.com/' + VER + '/' + pageId + '/photos';
    if (window.EB && window.EB.uploadReel) {
      var up = await window.EB.uploadReel(url, { 'Content-Type': 'multipart/form-data; boundary=' + boundary }, bytesToB64(mp));
      var j = {}; try { j = JSON.parse((up && up.text) || '{}'); } catch (e) {}
      if (j.error) throw new Error(errStr(j));
      if (!(up && up.ok) && !j.id) throw new Error('HTTP ' + (up && up.status) + ': ' + String((up && up.text) || '').slice(0, 200));
      return j;
    }
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body: new Blob([mp]) });
    var t = await r.text(), jj = {}; try { jj = JSON.parse(t); } catch (e) {}
    if (jj.error) throw new Error(errStr(jj));
    if (!r.ok && !jj.id) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200));
    return jj;
  }
  // imgs: [{bytes,name,type}]. Trả về id bài (post_id) để dựng link + auto-comment.
  async function postPhoto(pageId, imgs, schedUnix, token, onPhase, caption) {
    if (onPhase) onPhase('prep');
    var pub = !(schedUnix && schedUnix > 0);
    if (imgs.length === 1) {
      if (onPhase) onPhase('up', '');
      var extra = { caption: caption || '' };
      if (!pub) extra.scheduled_publish_time = schedUnix;
      var res = await photoUpload(pageId, imgs[0], token, pub, extra);
      if (onPhase) onPhase('fin');
      return String(res.post_id || res.id || '');
    }
    // ALBUM
    var ids = [];
    for (var i = 0; i < imgs.length; i++) {
      if (onPhase) onPhase('up', (i + 1) + '/' + imgs.length);
      var r = await photoUpload(pageId, imgs[i], token, false);
      if (!r.id) throw new Error('upload ảnh ' + (i + 1) + ' lỗi');
      ids.push(r.id);
    }
    if (onPhase) onPhase('fin');
    var q = GVER + '/' + pageId + '/feed?access_token=' + enc(token);
    if (caption) q += '&message=' + enc(caption);
    ids.forEach(function (id, k) { q += '&attached_media[' + k + ']=' + enc(JSON.stringify({ media_fbid: id })); });
    if (!pub) q += '&published=false&scheduled_publish_time=' + schedUnix;
    var fr = await graph('POST', q);
    if (fr.json && fr.json.error) throw new Error(errStr(fr.json));
    return String((fr.json && (fr.json.id || fr.json.post_id)) || ids[0]);
  }

  function classify(m) {
    m = String(m || '');
    if (/message port closed|Extension context invalidated|Receiving end does not exist|Could not establish connection|Thiếu cầu tiện ích/i.test(m)) return 'bridge';
    if (/\b190\b|validating access token|session has expired|access token.*(expire|invalid)|invalid.*access token|malformed access token/i.test(m)) return 'dead';
    if (/checkpoint|temporarily blocked|1390008|account.*restricted from|API access blocked|security check is required|kiểm tra bảo mật|xác minh bảo mật/i.test(m)) return 'checkpoint';
    if (/vi phạm|violat|copyright|bản quyền|not eligible|restricted|hạn chế|not authorized|1404006|permission|368|confirm your identity|xác minh|\bidentity\b|#200/i.test(m)) return 'page';
    if (/limit how often|often you can post|too many|rate limit|try again later|request limit reached|\b#?17\b|\b#?32\b|\b#?4\b/i.test(m)) return 'ratelimit';
    return 'page';
  }
  function shortErr(m, kind) {
    m = String(m || '');
    if (kind === 'bridge') return 'Mất cầu tiện ích — F5 lại trang';
    if (kind === 'checkpoint' || /security check is required|bảo mật/i.test(m)) return 'Tài khoản cần xác minh bảo mật (checkpoint)';
    if (kind === 'ratelimit') return 'Page hạn chế / rate-limit';
    if (/vi phạm|violat|copyright|bản quyền/i.test(m)) return 'Video vi phạm bản quyền';
    if (/#200|not have permission|thiếu quyền/i.test(m)) return 'Chưa có quyền đăng (#200)';
    if (/restricted|hạn chế|not authorized|1404006/i.test(m)) return 'Page hạn chế / thiếu quyền';
    if (/identity|xác minh|confirm/i.test(m)) return 'Page cần xác minh';
    return m.replace(/^(start|finish|upload)[:\s]*/i, '').slice(0, 40);
  }

  /* ───────────────────────── CHẠY (worker theo CLONE) ───────────────────────── */
  function setPage(p, kind, det) { p.kind = kind; if (det != null) p.det = det; updatePageRow(p); }
  function failPage(p, msg) { p.kind = 'fail'; p.err = msg; p.note = ''; DONE += Math.max(0, p.target - p.okCount); if (FAILIDS.indexOf(p.id) < 0) FAILIDS.push(p.id); prog(); updatePageRow(p); }

  async function cloneWorker(schedUnix) {
    while (!STOP) {
      var ci = CQ.shift(); if (ci == null) break;
      var c = CLONES[ci]; if (!c) continue;
      if (!c.pages.length) { c.status = 'done'; c.proc = 'không có page'; updateCloneRow(ci); continue; }
      if (!c.token) { var got = await ensureToken(c); if (!got) { c.status = 'dead'; c.proc = 'cookie/token hỏng'; failAllPages(c, 'clone#' + (ci + 1) + ' không có token'); updateCloneRow(ci); continue; } }
      c.status = 'run'; c.tStart = c.tStart || Date.now(); c.consec = 0; c.thr = 0; updateCloneRow(ci);
      var rounds = c.target = CFG.rounds;
      var sinceLong = 0, capped = false;
      outer:
      for (var r = 0; r < rounds; r++) {
        for (var pi = 0; pi < c.pages.length; pi++) {
          if (STOP) break outer;
          if (c.status === 'dead' || c.status === 'checkpoint' || c.status === 'spam') break outer;
          var p = c.pages[pi];
          // Giới hạn TỔNG bài mỗi page: đăng đủ rồi thì bỏ qua (không tính lỗi).
          if (CFG.maxPerPage > 0 && p.done >= CFG.maxPerPage) { skipPageRest(p, 'đủ ' + CFG.maxPerPage + ' bài/page'); continue; }
          var before = c.okBai;
          await postPage(c, ci, p, schedUnix, r);
          if (c.status === 'dead' || c.status === 'checkpoint' || c.status === 'spam') break outer;
          if (c.okBai > before) sinceLong++;
          // Giới hạn bài mỗi clone trong phiên: đủ thì dừng clone.
          if (CFG.maxPerClone > 0 && c.okBai >= CFG.maxPerClone) { capped = true; c.proc = 'Đủ ' + CFG.maxPerClone + ' bài (giới hạn)'; updateCloneRow(ci); break outer; }
          // Delay mỗi bài (cố định hoặc ngẫu nhiên [Delay, Delay tối đa]).
          if (!STOP && (CFG.delay > 0 || CFG.delayMax > 0)) { await restClone(c, ci, pickDelayMs(), 'Nghỉ'); }
          // Nghỉ dài định kỳ sau mỗi N bài (chống chạy liên tục quá lâu).
          if (!STOP && CFG.longEvery > 0 && CFG.longRest > 0 && sinceLong >= CFG.longEvery) { sinceLong = 0; await restClone(c, ci, CFG.longRest * 60000, 'Nghỉ dài'); }
        }
        if (!STOP && CFG.roundRest > 0 && r < rounds - 1) await restClone(c, ci, CFG.roundRest * 1000, 'Nghỉ vòng');
      }
      if (c.status === 'run') { c.status = 'done'; }
      // Page dở của clone (do đạt giới hạn / dừng tay) -> đánh dấu bỏ qua, KHÔNG tính là lỗi.
      var skipNote = STOP ? 'đã dừng' : (capped ? 'clone đủ giới hạn' : 'bỏ qua');
      c.pages.forEach(function (p) { skipPageRest(p, skipNote); });
      c.tEnd = Date.now(); c.proc = capped ? c.proc : (c.status === 'done' ? 'Xong' : c.proc);
      updateCloneRow(ci); updateSummary();
    }
  }
  // Delay mỗi bài: nếu có "Delay tối đa" > Delay -> ngẫu nhiên trong [delay, delayMax] (né FB nhận diện đều đặn).
  function pickDelayMs() {
    var lo = Math.max(0, CFG.delay), hi = Math.max(lo, CFG.delayMax || 0);
    var s = hi > lo ? (lo + Math.random() * (hi - lo)) : lo;
    return Math.round(s * 1000);
  }
  // Bỏ qua phần lượt còn lại của page (do đạt giới hạn an toàn hoặc dừng tay) — KHÔNG tính là lỗi.
  function skipPageRest(p, note) {
    if (p.kind === 'ok' || p.kind === 'fail' || p.kind === 'skip') return;
    var rem = (p.target || 1) - (p.okCount || 0); if (rem > 0) DONE += rem;
    p.kind = 'skip'; p.note = note || 'bỏ qua';
    if (p.okCount > 0 && OKIDS.indexOf(p.id) < 0) OKIDS.push(p.id);
    prog(); updatePageRow(p);
  }
  async function restClone(c, ci, ms, label) {
    c.restUntil = Date.now() + ms;
    var end = c.restUntil;
    while (Date.now() < end && !STOP) {
      var left = Math.ceil((end - Date.now()) / 1000);
      c.proc = label + ' ' + left + 's'; c.det = ''; updateCloneRow(ci);
      await sleep(Math.min(500, end - Date.now()));
    }
    c.restMs += ms; c.restUntil = 0;
  }
  async function postPage(c, ci, p, schedUnix, round) {
    if (p.kind === 'ok' && CFG.rounds === 1) { /* đã ok 1 vòng thì bỏ qua ở chế độ 1 vòng */ }
    var isImg = isPhoto();
    var product = isImg ? null : pickProduct(p);   // Affiliate chỉ áp cho video (sản phẩm gắn video)
    var fi = 0, boundCap = null;
    if (!isImg && !product && FILES.length) {
      // Lấy media + caption từ CÙNG 1 PostItem (gắn cứng). Chỉ xoay vòng các bài CÓ media.
      var vposts = POSTS.filter(function (x) { return x.media; });
      if (vposts.length) {
        var k = (CFG.vidOrder === 'random') ? Math.floor(Math.random() * vposts.length) : ((p.done + p.offset) % vposts.length);
        var post = vposts[k], mi = FILES.indexOf(post.media);
        fi = mi >= 0 ? mi : ((p.done + p.offset) % FILES.length);
        boundCap = post.cap;   // caption đi cặp với đúng media này
      } else {
        fi = (CFG.vidOrder === 'random') ? Math.floor(Math.random() * FILES.length) : ((p.done + p.offset) % FILES.length);
      }
    }
    c.proc = 'Chuẩn bị · ' + p.id; c.det = ''; updateCloneRow(ci);
    setPage(p, 'run');
    try {
      var ptk = await getPageToken(c, p.id);
      var buf = null, imgs = null, descText;
      if (isImg) {
        imgs = await gatherPhotos(p, Math.max(1, Math.min(10, CFG.photoPer || 1)));
        if (!imgs.length) throw new Error('Chưa chọn ảnh (bấm Chọn Thư Mục).');
        descText = pickDesc(p);
      } else {
        if (product) { if (!product._buf) product._buf = await readFileBytes(product._file); buf = product._buf; }
        else buf = await bufAt(fi);
        descText = product ? fillVars(product.cap, product, p, c) : (boundCap != null ? spin(boundCap) : pickDesc(p));   // caption GẮN CỨNG với media (PostItem) / sản phẩm / fallback xoay vòng
      }
      var vid = null, lastE = null;
      var phaseCb = function (ph, det) {
        p.kind = ph; p.det = det || ''; updatePageRow(p);
        var upWord = isImg ? ('Tải ảnh ' + (det || '')) : ('Tải video ' + (det || ''));
        c.proc = (ph === 'up' ? upWord : ph === 'fin' ? 'Đăng bài · chờ link' : ph === 'prep' ? 'Chuẩn bị' : 'Đăng bài') + ' · ' + p.id;
        updateCloneRow(ci);
      };
      for (var att = 0; att < 3; att++) {
        try {
          if (isImg) vid = await postPhoto(p.id, imgs, schedUnix, ptk, phaseCb, descText);
          else vid = await postOne(p.id, buf, schedUnix, ptk, phaseCb, descText);
          lastE = null; break;
        } catch (e2) {
          lastE = e2;
          if (classify((e2 && e2.message) || '') !== 'bridge' || att === 2) break;
          p.note = 'mất cầu tiện ích — thử lại ' + (att + 1) + '/2'; setPage(p, 'wait');
          try { if (window.EB && window.EB.ping) await window.EB.ping(); } catch (e3) {}
          await sleep(1200);
        }
      }
      if (lastE) throw lastE;
      p.okCount++; p.done++; DONEMAP[p.id] = p.done; saveSoon(); bumpPost();
      if (vid) recordPost({ id: String(vid), pid: p.id, pn: p.name || '', ty: isImg ? 'Ảnh' : 'Reel', mn: (!isImg && FILES[fi] && FILES[fi].name) || (isImg ? 'Ảnh' : ''), cap: descText || '', cl: (c && (c.uid || c._cid)) || '', url: p.link, t: Date.now() });
      p.vid = vid; p.link = isImg ? ('https://www.facebook.com/' + vid) : ('https://www.facebook.com/reel/' + vid);
      if (vid) { POSTED.push({ id: String(vid), owner: p.id, url: p.link }); if (POSTED.length > 20000) POSTED.splice(0, POSTED.length - 20000); }
      c.okBai++; c.consec = 0; DONE++; prog();
      setPage(p, 'ok'); if (OKIDS.indexOf(p.id) < 0) OKIDS.push(p.id);
      log('✓ clone#' + (ci + 1) + ' ' + p.id + ' lượt ' + p.done + (schedUnix ? ' ⏰ ' : (isImg ? ' → bài ' : ' → reel ')) + vid, 'ok');
      // Bình luận tự động (nếu bật): thả 1 comment vào chính reel vừa đăng. Lỗi comment KHÔNG làm hỏng bài.
      if (CFG.autoComment && vid) {
        if (CFG.cmtDelay > 0) { await new Promise(function (r) { setTimeout(r, CFG.cmtDelay * 1000); }); }   // chờ trước khi bình luận
        var cmt = fillVars(pickRaw(CMT, p, CFG.cmtOrder), product, p, c);   // bình luận: điền {{link}} rồi spin, phân phối theo cmtOrder
        if (cmt) {
          try {
            var cr = await graph('POST', GVER + '/' + vid + '/comments?message=' + enc(cmt) + '&access_token=' + enc(ptk));
            if (cr.json && cr.json.id) { log('💬 ' + p.id + ' đã bình luận', 'ok'); bumpCmt(1); }
            else log('💬 ' + p.id + ' bình luận lỗi: ' + errStr(cr.json), 'err');
          } catch (ec) { log('💬 ' + p.id + ' bình luận lỗi: ' + ((ec && ec.message) || ec), 'err'); }
        }
      }
      updateCloneRow(ci);
    } catch (e) {
      var m = (e && e.message) || 'lỗi'; var kind = classify(m);
      if (kind === 'bridge') { failPage(p, shortErr(m, kind)); log('🔌 ' + p.id + ': mất cầu tiện ích — F5 lại trang', 'err'); }
      else {
        c.errBai++; c.consec++; bumpFail();
        if (kind === 'dead' || kind === 'checkpoint') { c.status = kind; c.proc = kind === 'dead' ? 'Cookie/Token Die' : 'Checkpoint'; failAllPages(c, 'clone#' + (ci + 1) + ' ' + kind); log((kind === 'dead' ? '❌' : '⚠️') + ' clone#' + (ci + 1) + ' ' + kind + ' — ' + m, 'err'); }
        else if (kind === 'ratelimit') {
          c.thr++; failPage(p, 'rate-limit');
          if (c.thr >= 3) { await restClone(c, ci, (CFG.rlRest || 60) * 1000, 'Hạn chế · nghỉ'); c.thr = 0; }
        } else { failPage(p, shortErr(m, kind)); log('✗ clone#' + (ci + 1) + ' ' + p.id + ': ' + m, 'err'); }
        // Tự NGƯNG clone khi lỗi liên tục N page
        if (c.status === 'run' && CFG.stopFail > 0 && c.consec >= CFG.stopFail) {
          c.status = 'spam'; c.proc = 'lỗi ' + c.consec + ' page liên tục → ngưng'; failAllPages(c, 'clone#' + (ci + 1) + ' ngưng (lỗi liên tục)');
          log('🔴 clone#' + (ci + 1) + ' ngưng: lỗi ' + c.consec + ' page liên tục.', 'err');
        }
      }
      updateCloneRow(ci);
    }
    updateSummary();
  }
  function failAllPages(c, msg) { c.pages.forEach(function (p) { if (p.kind !== 'ok' && p.kind !== 'fail') failPage(p, msg); }); }

  function prog(finalTxt) {
    var pct = TOTAL > 0 ? Math.round(DONE * 100 / TOTAL) : 0;
    var b = $('reel-prog-bar'), p = $('reel-pct'), t = $('reel-prog-txt'), e;
    if (b) b.style.width = pct + '%'; if (p) p.textContent = pct + '%';
    CURROUND = TOTPAGES > 0 ? Math.min(CFG.rounds, Math.floor(DONE / TOTPAGES) + 1) : 0;
    if ((e = $('reel-f-round'))) e.textContent = (TOTAL > 0 ? CURROUND : 0) + '/' + CFG.rounds;
    if ((e = $('reel-f-posts'))) e.textContent = num(DONE) + ' / ' + num(TOTAL);
    if ((e = $('reel-f-pok'))) e.textContent = num(OKIDS.length);
    if ((e = $('reel-f-perr'))) e.textContent = num(FAILIDS.length);
    if (t) t.textContent = finalTxt || (RUNNING ? 'Đang chạy' : (TOTAL > 0 ? 'Đã dừng' : 'Sẵn sàng'));
  }
  // Gập / mở vùng cấu hình (giữ đủ 6 ô, gập lại để bảng cao thêm).
  function foldCfg(folded) {
    var f = $('reel-cfgfull'), s = $('reel-cfgsum');
    if (!f || !s) return;
    f.style.display = folded ? 'none' : '';
    s.style.display = folded ? 'flex' : 'none';
    var a = $('reel-cfgfold'), o = $('reel-cfgopen');
    if (a) a.setAttribute('aria-expanded', folded ? 'false' : 'true');
    if (o) o.setAttribute('aria-expanded', folded ? 'false' : 'true');
  }
  function updateCfgSum() {
    var e, n = TPL.filter(function (s) { return String(s || '').trim(); }).length;
    if ((e = $('reel-sum-vid'))) e.innerHTML = '📁 <b>' + FILES.length + '</b> ' + (isPhoto() ? 'ảnh' : 'video');
    if ((e = $('reel-sum-cap'))) e.innerHTML = '📝 <b>' + (n || 1) + '</b> mẫu nội dung';
    if ((e = $('reel-sum-round'))) e.textContent = CFG.rounds;
    if ((e = $('reel-sum-thr'))) e.textContent = CFG.luong;
    if ((e = $('reel-sum-delay'))) e.textContent = CFG.delay + 's';
    var sv = ($('reel-schedule') && $('reel-schedule').value) || '';
    if ((e = $('reel-sum-sch'))) e.innerHTML = '⏰ <b>' + (sv ? esc(new Date(sv).toLocaleString()) : 'Đăng ngay') + '</b>';
  }

  /* ───────── PHASE 2: đăng theo TỪNG NHÓM → Fanpage đã chọn ───────── */
  function ownerCloneOf(pid) { for (var i = 0; i < CLONES.length; i++) { var c = CLONES[i]; if (c.byId && c.byId[pid]) return c; if (c.ptok && c.ptok[pid]) return c; } return null; }
  async function readMediaBytes(media) {
    if (media.file) return await readFileBytes(media.file);
    if (media.handle) { var fl = await media.handle.getFile(); return await readFileBytes(fl); }
    return null;
  }
  async function readAlbumImgs(media) {
    var out = [], files = media.files || [];
    for (var i = 0; i < files.length; i++) { var b = await readFileBytes(files[i]); out.push({ bytes: b.bytes, name: files[i].name, type: mimeOf(files[i].name) }); }
    return out;
  }
  async function postGroupToPage(post, c, pid, pobj, globalSched) {
    var media = post.media, isImg = media.isAlbum || PHOTO_EXT.test(media.name || '');
    var sched = globalSched;
    if (post.schedMode === 'now') sched = 0;
    else if (post.schedMode === 'custom' && post.schedAt) { var d = new Date(post.schedAt); if (!isNaN(d.getTime())) sched = Math.floor(d.getTime() / 1000); }
    if (pobj) setPage(pobj, 'run');
    try {
      var ptk = await getPageToken(c, pid);
      var descText = post.cap ? spin(post.cap) : '';
      var phaseCb = function (ph, det) { if (pobj) setPage(pobj, ph, det || ''); };
      var vid = null;
      for (var att = 0; att < 3; att++) {
        try {
          if (isImg) {
            var imgs;
            if (media.isAlbum) imgs = await readAlbumImgs(media);
            else { var b = await readMediaBytes(media); imgs = [{ bytes: b.bytes, name: media.name, type: mimeOf(media.name) }]; }
            vid = await postPhoto(pid, imgs, sched, ptk, phaseCb, descText);
          } else {
            var data = await readMediaBytes(media);
            vid = await postOne(pid, data, sched, ptk, phaseCb, descText);
          }
          break;
        } catch (e2) { if (classify((e2 && e2.message) || '') !== 'bridge' || att === 2) throw e2; try { if (window.EB && window.EB.ping) await window.EB.ping(); } catch (e3) {} await sleep(1200); }
      }
      var link = isImg ? ('https://www.facebook.com/' + vid) : ('https://www.facebook.com/reel/' + vid);
      if (pobj) { pobj.vid = vid; pobj.link = link; pobj.okCount = (pobj.okCount || 0) + 1; setPage(pobj, 'ok'); }
      if (vid) POSTED.push({ id: String(vid), owner: pid, url: link });
      if (OKIDS.indexOf(pid) < 0) OKIDS.push(pid);
      bumpPost();
      recordPost({ id: String(vid), pid: pid, pn: (pobj && pobj.name) || '', ty: isImg ? 'Ảnh' : 'Reel', mn: media.name, cap: descText, cl: (c && (c.uid || c._cid)) || '', url: link, t: Date.now() });
      log('✓ ' + pid + (isImg ? ' → bài ' : ' → reel ') + vid, 'ok');
      var cmtOn = post.commentMode === 'off' ? false : (post.commentMode === 'custom' ? true : !!CFG.autoComment);
      if (cmtOn && vid) {
        if (CFG.cmtDelay > 0) await sleep(CFG.cmtDelay * 1000);
        var cmt = post.commentMode === 'custom' ? spin(post.commentText || '') : spin(pickRaw(CMT, pobj || { done: 0, offset: 0 }, CFG.cmtOrder));
        if (cmt) { try { var cr = await graph('POST', GVER + '/' + vid + '/comments?message=' + enc(cmt) + '&access_token=' + enc(ptk)); if (cr.json && cr.json.id) { log('💬 ' + pid + ' đã bình luận', 'ok'); bumpCmt(1); } else log('💬 ' + pid + ' bình luận lỗi: ' + errStr(cr.json), 'err'); } catch (ec) { log('💬 ' + pid + ' bình luận lỗi: ' + ((ec && ec.message) || ec), 'err'); } }
      }
    } catch (e) {
      var msg = (e && e.message) || 'lỗi';
      if (pobj) { pobj.err = shortErr(msg, classify(msg)); setPage(pobj, 'fail'); }
      if (FAILIDS.indexOf(pid) < 0) FAILIDS.push(pid);
      log('✗ ' + pid + ' lỗi: ' + msg, 'err');
    }
  }
  async function doStartGroups() {
    var groups = POSTS.filter(function (p) { return p.media && p.pages && p.pages.length; });
    var byPage = {}, order = [];
    groups.forEach(function (post) { post.pages.forEach(function (pid) { if (!byPage[pid]) { byPage[pid] = []; order.push(pid); } byPage[pid].push(post); }); });
    if (!order.length) { log('Chưa bài nào chọn Fanpage.', 'err'); return; }
    var luot = 0; order.forEach(function (pid) { luot += byPage[pid].length; });
    TOTAL = luot * CFG.rounds; DONE = 0; OKIDS = []; FAILIDS = [];
    CLONES.forEach(function (c) { c.pages.forEach(function (p) { if (byPage[p.id]) { p.kind = 'wait'; p.vid = ''; p.link = ''; p.err = ''; p.note = ''; p.okCount = 0; p.target = byPage[p.id].length * CFG.rounds; } }); });
    var sched = 0, svRaw = ($('reel-schedule') && $('reel-schedule').value) || ''; if (svRaw) { var sd = new Date(svRaw); if (!isNaN(sd.getTime())) sched = Math.floor(sd.getTime() / 1000); }
    STOP = false; RUNNING = true; BUF = {}; $('reel-start').disabled = true;
    prog(); renderPages();
    log('Bắt đầu (theo nhóm): ' + groups.length + ' nội dung · ' + order.length + ' Fanpage · ' + luot + ' lượt/vòng · ' + CFG.luong + ' luồng · delay ' + CFG.delay + 's' + (sched ? (' · ⏰ ' + new Date(sched * 1000).toLocaleString()) : ''));
    startStatTimer();
    var PQ = order.slice();
    async function pageWorker() {
      while (!STOP) {
        var pid = PQ.shift(); if (pid == null) break;
        var c = ownerCloneOf(pid), pobj = c && c.byId && c.byId[pid];
        for (var r = 0; r < CFG.rounds && !STOP; r++) {
          var list = byPage[pid];
          for (var gi = 0; gi < list.length && !STOP; gi++) {
            if (!c) { if (pobj) { pobj.err = 'Page không thuộc clone nào — Load Page lại.'; setPage(pobj, 'fail'); } if (FAILIDS.indexOf(pid) < 0) FAILIDS.push(pid); DONE++; prog(); continue; }
            await postGroupToPage(list[gi], c, pid, pobj, sched);
            DONE++; prog();
            if (CFG.delay > 0 && !STOP && (gi < list.length - 1 || r < CFG.rounds - 1)) await sleep(CFG.delay * 1000);
          }
        }
      }
    }
    try {
      var luong = Math.max(1, Math.min(CFG.luong, order.length));
      var pool = []; for (var w = 0; w < luong; w++) pool.push(pageWorker());
      await Promise.all(pool);
    } finally {
      RUNNING = false; stopStatTimer(); $('reel-start').disabled = false;
      saveNow(); prog('Xong · ' + OKIDS.length + ' Fanpage OK / ' + FAILIDS.length + ' lỗi');
      renderPages(); updateSummary();
      log((STOP ? 'Đã dừng. ' : 'Hoàn tất. ') + 'Tổng ' + num(DONE) + ' lượt đăng.', FAILIDS.length ? 'err' : 'ok');
    }
  }
  async function doStart() {
    if (RUNNING) { log('Đang chạy rồi.'); return; }
    applyClones();
    try { syncPosts(); } catch (e) {}
    // Nếu có bài đã chọn Fanpage riêng -> đăng theo TỪNG NHÓM (đúng Fanpage của từng bài).
    if (POSTS.some(function (p) { return p.media && p.pages && p.pages.length; })) { return doStartGroups(); }
    if (!CLONES.length) { log('Chưa có clone (chuột phải → Dán).', 'err'); return; }
    if (isPhoto()) {
      if (!FILES.length) { log('Chưa chọn ảnh (bấm Chọn Thư Mục).', 'err'); return; }
    } else if (CFG.affiliate) {
      if (!PRODUCTS.filter(function (x) { return x._file; }).length) { log('Chế độ Affiliate: chưa có sản phẩm nào có video. Vào tab Sản Phẩm thêm sản phẩm + chọn video.', 'err'); return; }
    } else if (!FILES.length) { log('Chưa chọn video (bấm Chọn Thư Mục).', 'err'); return; }
    // clone chạy = bôi đen, hoặc tất cả
    var run = selCloneIdx(); if (!run.length) run = CLONES.map(function (_, i) { return i; });
    // đảm bảo mọi clone có page
    var withPages = run.filter(function (i) { return CLONES[i].pages.length; });
    if (!withPages.length) { log('Clone chưa có page — bấm "Load Page Từ Clone" hoặc dán ID page.', 'err'); return; }
    var sched = 0, svRaw = ($('reel-schedule') && $('reel-schedule').value) || '';
    if (svRaw) { var sd = new Date(svRaw); if (!isNaN(sd.getTime())) sched = Math.floor(sd.getTime() / 1000); }
    // reset đếm
    TOTPAGES = 0; withPages.forEach(function (i) { TOTPAGES += CLONES[i].pages.length; });
    TOTAL = TOTPAGES * CFG.rounds; DONE = 0; OKIDS = []; FAILIDS = [];
    withPages.forEach(function (i) { var c = CLONES[i]; c.status = 'idle'; c.okBai = 0; c.errBai = 0; c.thr = 0; c.consec = 0; c.tStart = 0; c.tEnd = 0; c.restMs = 0; c.proc = ''; c.pages.forEach(function (p) { p.kind = 'wait'; p.vid = ''; p.link = ''; p.err = ''; p.note = ''; p.okCount = 0; p.target = CFG.rounds; p.offset = 0; }); });
    // gán offset video theo thứ tự page toàn cục để đỡ trùng
    var off = 0; withPages.forEach(function (i) { CLONES[i].pages.forEach(function (p) { p.offset = off++; }); });
    CQ = withPages.slice();
    STOP = false; RUNNING = true; BUF = {};
    $('reel-start').disabled = true;
    prog(); renderClones(); renderPages();
    log('Bắt đầu: ' + withPages.length + ' clone · ' + num(TOTPAGES) + ' page · ' + CFG.rounds + ' vòng · ' + CFG.luong + ' luồng · delay ' + CFG.delay + 's' + (sched ? ' · ⏰ ' + new Date(sched * 1000).toLocaleString() : ''));
    startStatTimer();
    try {
      var luong = Math.max(1, Math.min(CFG.luong, withPages.length));
      var pool = []; for (var w = 0; w < luong; w++) pool.push(cloneWorker(sched));
      await Promise.all(pool);
    } finally {
      RUNNING = false; stopStatTimer(); $('reel-start').disabled = false;
      // đóng các page treo
      withPages.forEach(function (i) { CLONES[i].pages.forEach(function (p) { skipPageRest(p, STOP ? 'đã dừng' : 'chưa xong'); }); if (CLONES[i].status === 'run') CLONES[i].status = 'done'; });
      saveNow(); prog('Xong · ' + OKIDS.length + ' page OK / ' + FAILIDS.length + ' page lỗi');
      renderClones(); renderPages(); updateSummary();
      log((STOP ? 'Đã dừng. ' : 'Hoàn tất. ') + 'Tổng ' + num(DONE) + ' bài đăng.', FAILIDS.length ? 'err' : 'ok');
    }
  }
  function doReset() {
    if (RUNNING) { log('Đang chạy — bấm Dừng trước.', 'err'); return; }
    CLONES.forEach(function (c) { c.status = 'idle'; c.okBai = 0; c.errBai = 0; c.thr = 0; c.consec = 0; c.tStart = 0; c.tEnd = 0; c.restMs = 0; c.proc = ''; c.pages.forEach(function (p) { p.kind = 'wait'; p.vid = ''; p.link = ''; p.err = ''; p.note = ''; p.time = ''; p.okCount = 0; }); });
    DONE = 0; TOTAL = 0; TOTPAGES = 0; OKIDS = []; FAILIDS = []; prog();
    renderClones(); renderPages(); updateSummary(); var lg = $('reel-log'); if (lg) lg.innerHTML = '';
    log('Đã reset trạng thái (giữ clone + page + lượt đã đăng).', 'ok');
  }
  function startStatTimer() { if (statTimer) return; statTimer = setInterval(function () { CLONES.forEach(function (c, i) { if (c.status === 'run' || c.restUntil) updateCloneRow(i); }); }, 1000); }
  function stopStatTimer() { if (statTimer) { clearInterval(statTimer); statTimer = null; } }

  /* ───────────────────────── UI: build ───────────────────────── */
  var CSS = buildCSS();
  function buildCSS() {
    return ''
    + '#reel-panel{display:none;flex-direction:column;gap:10px;padding:12px 14px;color:var(--text-primary);box-sizing:border-box;flex:1 1 100%;width:100%;max-width:100%;height:100%;min-height:0;overflow-y:auto;overflow-x:hidden}'
    + '#reel-panel.on{display:flex}'
    + '#reel-panel .card{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px}'
    + '#reel-panel label{font-size:11.5px;opacity:.8;display:block;margin-bottom:5px;font-weight:600}'
    + '#reel-panel input,#reel-panel textarea{background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;padding:8px 10px;font-size:13px;width:100%;box-sizing:border-box;font-family:inherit}'
    + '#reel-panel textarea{resize:vertical;line-height:1.4}'
    + '#reel-panel input:focus,#reel-panel textarea:focus{outline:none;border-color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .vbtn-mini{background:rgba(190,24,93,0.22);color:#f472b6;border:1px solid rgba(190,24,93,0.45);border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all .15s ease}'
    + '#reel-panel .vbtn-mini:hover{background:#be185d;color:#fff;border-color:#be185d;box-shadow:0 0 10px rgba(190,24,93,0.5)}'
    + '#reel-panel .vbtn{background:#be185d;color:#fff;border:1px solid transparent;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,color .15s ease,border-color .15s ease}'
    + '#reel-panel .vbtn:not(:disabled):hover{background:#9d174d}'
    + '#reel-panel .vbtn:focus-visible{outline:2px solid var(--primary-accent,#ff5cb3);outline-offset:2px}'
    + '#reel-panel .vbtn:disabled{opacity:.5;cursor:not-allowed}'
    + '#reel-panel .vbtn.ok{background:#be185d;color:#fff;border-color:transparent} #reel-panel .vbtn.ok:not(:disabled):hover{background:#9d174d}'
    + '#reel-panel .vbtn.danger{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca} #reel-panel .vbtn.danger:not(:disabled):hover{background:#fee2e2}'
    + '#reel-panel .vbtn.grey{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1} #reel-panel .vbtn.grey:not(:disabled):hover{background:#e2e8f0}'
    + '#reel-panel .vbtn.sec{background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);font-weight:600} #reel-panel .vbtn.sec:not(:disabled):hover{background:var(--bg-primary);border-color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .vbtn.seed{background:#ecfdf5;color:#0f8a5f;border:1px solid #a7f3d0} #reel-panel .vbtn.seed:not(:disabled):hover{background:#d1fae5}'
    + '#reel-panel .vbtn.sm{padding:6px 11px;font-size:11.5px;border-radius:7px} #reel-panel .vbtn.big{width:100%;padding:13px;font-size:14.5px;display:block;text-align:center}'
    // ── Dải lệnh: 4 pill số liệu + 3 nút chạy ──
    + '#reel-panel .cmdbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex:none;padding:10px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px}'
    + '#reel-panel .pills{display:flex;gap:8px;flex-wrap:wrap}'
    + '#reel-panel .pill{display:flex;align-items:baseline;gap:8px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:9px;padding:7px 13px}'
    + '#reel-panel .pill .v{font-size:16px;font-weight:800;line-height:1.1;letter-spacing:-.01em}'
    + '#reel-panel .pill .k{font-size:11px;opacity:.7}'
    + '#reel-panel .pill.ok .v{color:var(--success-color,#16a34a)} #reel-panel .pill.err .v{color:var(--danger-color,#dc2626)}'
    + '#reel-panel .cmdacts{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}'
    // ── Dải tiến độ ──
    + '#reel-panel .progstrip{display:flex;align-items:center;gap:16px;flex-wrap:wrap;flex:none;padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px}'
    + '#reel-panel .pmid{flex:1;min-width:220px}'
    + '#reel-panel .facts{display:flex;gap:16px;flex-wrap:wrap;margin-top:7px;font-size:11.5px;opacity:.8}'
    + '#reel-panel .facts b{font-weight:700;opacity:1} #reel-panel .facts b.ok{color:var(--success-color,#16a34a)} #reel-panel .facts b.er{color:var(--danger-color,#dc2626)}'
    + '#reel-panel .eta{font-size:11.5px;opacity:.6;font-weight:600}'
    // ── Vùng cấu hình (giữ nguyên 6 ô, thu gọn được) ──
    + '#reel-panel .cfgzone{flex:none}'
    + '#reel-panel .rtop{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;flex:none}'
    + '#reel-panel .cfgfoot{display:flex;align-items:center;margin-top:6px}'
    + '#reel-panel .fold{margin-left:auto;font:inherit;font-size:11.5px;font-weight:700;color:var(--text-secondary,#94a3b8);background:none;border:0;cursor:pointer;padding:4px 7px;border-radius:7px}'
    + '#reel-panel .fold:hover{color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .fold:focus-visible{outline:2px solid var(--primary-accent,#ff5cb3);outline-offset:2px}'
    + '#reel-panel .cfgsum{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px}'
    + '#reel-panel .sumchip{font-size:11.5px;opacity:.85;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:5px 11px;white-space:nowrap}'
    + '#reel-panel .sumchip b{font-weight:700}'
    + '#reel-panel .tcard{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:9px 11px;display:flex;flex-direction:column;justify-content:center;min-width:0}'
    + '#reel-panel .tc-vid{width:200px;flex:none} #reel-panel .tc-cap{flex:1;min-width:220px} #reel-panel .tc-sch{width:172px;flex:none} #reel-panel .tc-n{width:78px;flex:none}'
    + '#reel-panel .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-height:56px;overflow:auto}'
    + '#reel-panel .chip{background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:999px;padding:5px 10px;font-size:11.5px;cursor:pointer;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}'
    + '#reel-panel .chip:hover{border-color:var(--primary-accent,#ff5cb3)} #reel-panel .chip.add{border-style:dashed;font-weight:700}'
    + '#reel-panel .rmid{display:flex;gap:10px;flex:1 0 auto;min-height:360px;position:relative}'
    + '#reel-panel .rpane{display:flex;flex-direction:column;min-height:0;overflow:hidden;flex:1;min-width:0}'
    + '#reel-panel .rtabs{display:flex;flex-wrap:wrap;gap:6px;row-gap:6px;padding:6px 10px;min-height:44px;align-items:center;flex:none;border-bottom:1px solid var(--border-color)}'
    + '#reel-panel .rtab{padding:7px 14px;font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;opacity:.7;border:1px solid transparent;transition:background-color .15s ease,color .15s ease,border-color .15s ease}'
    + '#reel-panel .rtab:hover{opacity:1;border-color:var(--border-color)}'
    + '#reel-panel .rtab.on{opacity:1;background:rgba(190,24,93,.10);color:var(--primary-accent,#ff5cb3);border-color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .rtab:focus-visible{outline:2px solid var(--primary-accent,#ff5cb3);outline-offset:2px}'
    + '#reel-panel .rtab-actions{margin-left:auto;display:flex;gap:6px;align-items:center}'
    + '#reel-panel .rtab .cnt{opacity:.6;font-weight:600;font-size:11px}'
    + '#reel-panel .rtbl{flex:1;min-height:0;overflow:auto}'
    + '#reel-panel table{width:100%;border-collapse:collapse;font-size:12px}'
    + '#reel-panel thead th{position:sticky;top:0;background:var(--bg-tertiary);text-align:left;padding:0 9px;height:38px;font-weight:700;font-size:12px;border-bottom:1px solid var(--border-color);white-space:nowrap;z-index:1;box-sizing:border-box}'
    + '#reel-panel tbody td{padding:0 9px;height:36px;font-size:12px;line-height:1.3;border-bottom:1px solid var(--border-color);vertical-align:middle;box-sizing:border-box}'
    + '#reel-panel thead th,#reel-panel tbody td{border-right:1px solid var(--border-color)} #reel-panel thead th:last-child,#reel-panel tbody td:last-child{border-right:0}'
    + '#reel-panel tbody tr:hover{background:rgba(194,24,107,.06)} #reel-panel tbody tr.sel{background:rgba(59,130,246,.18)} #reel-panel tbody tr{cursor:pointer} #reel-panel tbody{user-select:none}'
    + '#reel-panel .lnk{color:var(--primary-accent,#ff5cb3);text-decoration:none} #reel-panel .lnk:hover{text-decoration:underline}'
    + '#reel-panel .ell{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom}'
    + '#reel-panel .selchk{width:15px;height:15px;margin:0;cursor:pointer;vertical-align:middle}'
    + '#reel-panel .rpct{font-size:24px;font-weight:800;line-height:1;min-width:58px}'
    + '#reel-panel .rbar{height:8px;border-radius:7px;background:var(--bg-primary);border:1px solid var(--border-color);overflow:hidden}'
    + '#reel-panel .rbar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#be185d,var(--primary-accent,#ff5cb3));transition:width .3s ease}'
    + '#reel-panel .idbox{width:100%;height:92px;font:11px Consolas,monospace;margin-top:3px}'
    // ── Ngăn kéo nhật ký ──
    + '#reel-panel .drawer{flex:none;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;overflow:hidden}'
    + '#reel-panel .dhd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:100%;padding:9px 13px;background:none;border:0;font:inherit;color:inherit;cursor:pointer;text-align:left}'
    + '#reel-panel .dhd:hover{background:var(--bg-tertiary)}'
    + '#reel-panel .dhd:focus-visible{outline:2px solid var(--primary-accent,#ff5cb3);outline-offset:-2px}'
    + '#reel-panel .dhd .lbl{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;opacity:.6;font-weight:700}'
    + '#reel-panel .dhd .peek{font:11px Consolas,monospace;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}'
    + '#reel-panel .dhd .caret{margin-left:auto;font-size:11.5px;font-weight:700;color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .dbody{padding:0 13px 12px;border-top:1px solid var(--border-color)}'
    + '#reel-panel .dcols{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap;margin-top:10px}'
    + '#reel-panel .dlog{flex:1;min-width:260px;display:flex;flex-direction:column}'
    + '#reel-panel .dids{width:190px;flex:none}'
    + '#reel-panel .rloghd{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}'
    + '#reel-panel .rlog{background:var(--bg-primary);border:1px solid var(--border-color);border-radius:9px;padding:8px 10px;height:120px;overflow:auto;font:11px/1.55 Consolas,monospace;word-break:break-word}'
    + '#reel-panel .toktot{font-size:11px;opacity:.7;margin-top:7px;font-weight:600}'
    + '#reel-panel .foot{font-size:11px;opacity:.65;padding:4px 10px;flex:none}'
    + '#reel-panel .cfgrow{display:flex;gap:12px;flex-wrap:wrap;padding:12px}'
    + '#reel-panel .cfgcell{width:200px} #reel-panel .cfgcell select{width:100%;padding:8px 10px;border-radius:8px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-color);font-size:13px}'
    + '#reel-panel .colwrap{padding:18px 20px}'
    + '#reel-panel .colhint{font-size:12.5px;color:var(--text-secondary,#7a7a8a);margin:0 0 16px;line-height:1.4}'
    + '#reel-panel .colgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:24px}'
    + '#reel-panel .colgroup{display:flex;flex-direction:column;min-width:0}'
    + '#reel-panel .colgroup h4{margin:0 0 8px;font-size:13.5px;font-weight:600;color:var(--text-secondary,#7a7a8a)}'
    + '#reel-panel .colopt{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 2px;font-size:13.5px;font-weight:400;cursor:pointer;line-height:1.35;color:var(--text-primary)}'
    + '#reel-panel .colopt input{width:16px;height:16px;margin:0;flex:none;cursor:pointer;accent-color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .colopt input:focus-visible{outline:2px solid var(--primary-accent,#ff5cb3);outline-offset:2px}'
    + '#reel-panel .colopt span{overflow-wrap:break-word}'
    + '#reel-panel .st-wait{color:var(--text-secondary,#94a3b8)} #reel-panel .st-run{color:#3b82f6} #reel-panel .st-up{color:#8b5cf6} #reel-panel .dim{color:var(--text-secondary,#94a3b8);opacity:.85}'
    + '#reel-panel .st-ok{color:var(--success-color,#16a34a)} #reel-panel .st-fail{color:var(--danger-color,#dc2626)}'
    + '#reel-panel .cl-run{color:#3b82f6} #reel-panel .cl-done{color:var(--success-color,#16a34a)} #reel-panel .cl-rest{color:#d97706} #reel-panel .cl-dead{color:var(--danger-color,#dc2626)} #reel-panel .cl-spam{color:#dc2626}'
    + '#reel-ctx{position:fixed;z-index:100000;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:5px;min-width:180px;box-shadow:0 10px 30px rgba(0,0,0,.28);display:none}'
    + '#reel-ctx.on{display:block} #reel-ctx .it{padding:8px 12px;font-size:13px;border-radius:7px;cursor:pointer;display:flex;gap:12px;align-items:center;white-space:nowrap}'
    + '#reel-ctx .it .sc{margin-left:auto;opacity:.5;font-size:11.5px} #reel-ctx .it:hover{background:var(--primary-accent,#ff5cb3);color:#fff} #reel-ctx .it:hover .sc{opacity:.85;color:#fff} #reel-ctx .sep{height:1px;background:var(--border-color);margin:4px 6px}'
    // Theme SÁNG: nền giấy ám hồng của PinkAgc (#fffafd) thay cho nền xám xanh cũ.
    // Thẻ để trắng, phân tách bằng đường kẻ 1px ám hồng — không dùng đổ bóng.
    + '[data-theme="light"] #reel-panel{--bg-primary:#faf3f8;--bg-secondary:#ffffff;--bg-tertiary:#f6ecf2;--border-color:#e9dce5;--primary-accent:#ff5cb3;--primary-hover:#ff3da2;background:#fffafd}'
    // ── MODAL Cấu hình Seeding ──
    + '#reel-panel .reel-modal-ov{position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}'
    + '#reel-panel .reel-modal-card{width:1150px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45)}'
    + '[data-theme="light"] #reel-panel .reel-modal-card{background:#ffffff}'
    + '#reel-panel .rsm-head{flex:none;display:flex;align-items:flex-start;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border-color)}'
    + '#reel-panel .rsm-title{font-size:16px;font-weight:800}'
    + '#reel-panel .rsm-desc{font-size:12px;color:var(--text-secondary);margin-top:3px;line-height:1.4}'
    + '#reel-panel .rsm-x{margin-left:auto;flex:none;width:32px;height:32px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:14px}'
    + '#reel-panel .rsm-x:hover{border-color:var(--danger-color);color:var(--danger-color)}'
    + '#reel-panel .rsm-body{flex:1;min-height:0;overflow:auto;padding:20px}'
    + '#reel-panel .rsm-cols{display:flex;gap:20px;flex-wrap:wrap}'
    + '#reel-panel .rsm-col-l{flex:0 1 55%;min-width:300px;display:flex;flex-direction:column}'
    + '#reel-panel .rsm-col-r{flex:0 1 42%;min-width:300px;display:flex;flex-direction:column}'
    + '#reel-panel .rsm-lbl{font-size:13px;font-weight:700;margin-bottom:4px}'
    + '#reel-panel .rsm-hint{font-size:11.5px;color:var(--text-secondary);margin-bottom:8px}'
    + '#reel-panel .rsm-ta{width:100%;min-height:200px;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12px Consolas,monospace;resize:vertical}'
    + '#reel-panel .rsm-ta:focus{outline:none;border-color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .rsm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px}'
    + '#reel-panel .rsm-cnt{font-size:11.5px;color:var(--text-secondary)}'
    + '#reel-panel .rsm-setup{margin-top:20px;padding-top:16px;border-top:1px solid var(--border-color)}'
    + '#reel-panel .rsm-setup-title{font-size:13px;font-weight:700;margin-bottom:12px}'
    + '#reel-panel .rsm-fields{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end}'
    + '#reel-panel .rsm-f{display:flex;flex-direction:column;width:170px}'
    + '#reel-panel .rsm-f label{font-size:11.5px;font-weight:600;margin-bottom:5px}'
    + '#reel-panel .rsm-f input{height:38px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:13px}'
    + '#reel-panel .rsm-chk{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;cursor:pointer;height:38px}'
    + '#reel-panel .rsm-chk input{width:16px;height:16px;margin:0;accent-color:var(--primary-accent,#ff5cb3)}'
    + '#reel-panel .rsm-foot{flex:none;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 20px;border-top:1px solid var(--border-color);background:var(--bg-secondary)}'
    + '[data-theme="light"] #reel-panel .rsm-foot{background:#ffffff}'
    + '#reel-panel .rsm-status{font-size:12.5px;color:var(--text-secondary);font-weight:600}'
    + '#reel-panel .rsm-foot-btns{margin-left:auto;display:flex;gap:9px}'
    + '@media(max-width:820px){#reel-panel .rsm-col-l,#reel-panel .rsm-col-r{flex:1 1 100%}}'
    + 'body.reel-active .toolbar-section{display:none!important}'
    + '[data-theme="light"] #reel-ctx{background:#ffffff;border-color:#e9dce5}'
    // ── Đợt 1: thẻ loại bài đăng (Reel/Ảnh) — xếp DỌC cho rộng, mỗi thẻ 1 hàng ──
    + '#reel-panel .ptcards{display:flex;flex-direction:column;gap:7px;margin-bottom:8px}'
    + '#reel-panel .ptcard{display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin:0;padding:9px 11px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-primary);transition:border-color .15s,background .15s}'
    + '#reel-panel .ptcard input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}'
    + '#reel-panel .ptcard .ic{font-size:20px;line-height:1.1;flex:none}'
    + '#reel-panel .ptcard .bd{display:flex;flex-direction:column;min-width:0}'
    + '#reel-panel .ptcard .tt{display:block;font-weight:700;font-size:13px}'
    + '#reel-panel .ptcard .ds{display:block;font-size:10.5px;color:var(--text-secondary);line-height:1.35;margin-top:2px}'
    + '#reel-panel .ptcard:hover{border-color:var(--primary-accent)}'
    + '#reel-panel .ptcard.sel,#reel-panel .ptcard:has(input:checked){border-color:var(--primary-accent);background:rgba(190,24,93,.08)}'
    + '#reel-panel .ptcard.sel .tt,#reel-panel .ptcard:has(input:checked) .tt{color:var(--primary-accent)}'
    + '#reel-panel .ptcard .tick{margin-left:auto;font-weight:800;color:var(--primary-accent);opacity:0;flex:none}'
    + '#reel-panel .ptcard.sel .tick,#reel-panel .ptcard:has(input:checked) .tick{opacity:1}'
    // ── Bố cục 2 hàng: hàng 1 (Video/ảnh · Nội dung · Bình luận) rộng theo tỉ lệ; hàng 2 = Thiết lập đăng bài ──
    + '#reel-panel .rtop .tc-vid{flex:0 1 28%;min-width:230px}'
    + '#reel-panel .rtop .tc-cap:nth-of-type(2){flex:0 1 40%}'
    + '#reel-panel .rtop .tc-cap:nth-of-type(3){flex:0 1 30%}'
    + '#reel-panel .rrow2{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px;padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px}'
    + '#reel-panel .rrow2 .r2h{font-size:12px;font-weight:700;color:var(--text-secondary);letter-spacing:.02em}'
    + '#reel-panel .rrow2 .r2f{display:flex;flex-direction:column;gap:3px}'
    + '#reel-panel .rrow2 .r2f label{font-size:10.5px;font-weight:600;opacity:.8;margin:0}'
    + '#reel-panel .rrow2 .r2f input{width:150px;padding:7px 9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:13px inherit}'
    + '#reel-panel .rrow2 .r2f.sm input{width:70px}'
    + '#reel-panel .rrow2 .r2adv{margin-left:auto;font:inherit;font-size:11.5px;font-weight:700;color:var(--text-secondary);background:none;border:0;cursor:pointer;padding:5px 8px;border-radius:7px}'
    + '#reel-panel .rrow2 .r2adv:hover{color:var(--primary-accent)}'
    + '#reel-panel .rrow2 .r2advbox{display:none;gap:14px;align-items:flex-end}'
    + '#reel-panel .rrow2.adv .r2advbox{display:flex}'
    // ── Đợt 2: danh sách tệp đã chọn (thumbnail · tên · dung lượng · thời lượng/tỷ lệ · trạng thái · xoá/thay · kéo sắp xếp) ──
    + '#reel-panel .filelist{margin-top:7px;max-height:170px;overflow:auto;display:flex;flex-direction:column;gap:5px}'
    + '#reel-panel .fitem{display:flex;gap:8px;align-items:center;padding:5px 7px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-secondary)}'
    + '#reel-panel .fitem.dragover{border-color:var(--primary-accent);background:rgba(190,24,93,.06)}'
    + '#reel-panel .fitem .drag{cursor:grab;color:var(--text-secondary);font-size:13px;flex:none;user-select:none}'
    + '#reel-panel .fitem .th{width:40px;height:40px;border-radius:7px;background:var(--bg-tertiary);flex:none;display:flex;align-items:center;justify-content:center;font-size:17px;overflow:hidden}'
    + '#reel-panel .fitem .th img{width:100%;height:100%;object-fit:cover;display:block}'
    + '#reel-panel .fitem .meta{flex:1;min-width:0}'
    + '#reel-panel .fitem .fn{font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#reel-panel .fitem .fi{font-size:10px;color:var(--text-secondary);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#reel-panel .fitem .fi .st{font-weight:700} #reel-panel .fitem .fi .st.ok{color:var(--success-color)} #reel-panel .fitem .fi .st.err{color:var(--danger-color)} #reel-panel .fitem .fi .st.warn{color:#d97706}'
    + '#reel-panel .fitem .facts2{display:flex;gap:4px;flex:none}'
    + '#reel-panel .fitem .fx{flex:none;cursor:pointer;border:0;background:none;color:var(--text-secondary);font-size:13px;padding:3px 5px;border-radius:6px}'
    + '#reel-panel .fitem .fx:hover{background:var(--bg-tertiary)} #reel-panel .fitem .fx.del:hover{color:var(--danger-color)} #reel-panel .fitem .fx.rep:hover{color:var(--primary-accent)}'
    + '#reel-panel .distrow{margin-top:8px;font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:6px}'
    + '#reel-panel .distrow select{flex:1;padding:6px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:11.5px inherit}'
    + '#reel-panel .fhint{font-size:10.5px;color:var(--text-secondary);margin-top:6px;line-height:1.4}'
    + '#reel-panel .fdrop{margin-top:7px;border:1.5px dashed var(--border-color);border-radius:9px;padding:7px;text-align:center;font-size:10.5px;color:var(--text-secondary);cursor:pointer}'
    + '#reel-panel .fdrop.dragover{border-color:var(--primary-accent);background:rgba(190,24,93,.06);color:var(--primary-accent)}'
    // ── Danh sách bài đăng (PostItem) ──
    + '#reel-panel #reel-view-posts td{padding:7px 10px}'
    + '#reel-panel .pst{font-weight:700;font-size:11.5px;white-space:nowrap}'
    + '#reel-panel .pst.ready{color:var(--success-color)} #reel-panel .pst.ready:before{content:"✓ "}'
    + '#reel-panel .pst.warning{color:#d97706} #reel-panel .pst.warning:before{content:"⚠ "}'
    + '#reel-panel .pst.invalid{color:var(--danger-color)} #reel-panel .pst.invalid:before{content:"✕ "}'
    + '#reel-panel .pgchip{font-size:10.5px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:999px;padding:1px 8px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis}'
    // ── Hợp nhất: ẩn 3 khối nhập liệu trên (media/content/bình luận) — mọi thao tác gom vào tab Bài đăng ──
    + '#reel-panel .rtop{display:none!important}'
    + '#reel-panel .pbtoolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid var(--border-color)}'
    + '#reel-panel .pbtoolbar .sp{margin-left:auto}'
    + '#reel-panel .pbbulk{display:none;align-items:center;gap:7px;flex-wrap:wrap;padding:8px 12px;background:rgba(190,24,93,.06);border-bottom:1px solid var(--border-color)}'
    + '#reel-panel .pbbulk.on{display:flex}'
    // ── Công tắc bật/tắt bình luận ──
    + '#reel-panel .kzsw{position:relative;display:inline-block;width:38px;height:21px;flex:none}'
    + '#reel-panel .kzsw input{opacity:0;width:0;height:0}'
    + '#reel-panel .kzsw .sl{position:absolute;inset:0;border-radius:999px;background:var(--border-color);transition:.15s;cursor:pointer}'
    + '#reel-panel .kzsw .sl:before{content:"";position:absolute;width:15px;height:15px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.15s}'
    + '#reel-panel .kzsw input:checked + .sl{background:var(--primary-accent)}'
    + '#reel-panel .kzsw input:checked + .sl:before{transform:translateX(17px)}'
    + '#reel-panel .cmt-wrap.off{opacity:.45;pointer-events:none}'
    + '#reel-panel .cmt-state{font-size:11px;font-weight:600;color:var(--text-secondary)}'
    // ── Nút hành động trạng thái "Kiểm tra lại" (còn lỗi) ──
    + '#reel-panel .vbtn.check{background:#fffbeb;color:#b45309;border:1px solid #fde68a} #reel-panel .vbtn.check:not(:disabled):hover{background:#fef3c7}'
    // Hộp sửa mẫu nằm NGOÀI #reel-panel (gắn body) nên CSS nút trong panel không với tới -> style riêng ở đây,
    // đồng bộ font + kiểu nút với phần còn lại (Lưu = hồng, Xoá = đỏ nhạt, Huỷ = xám).
    + '.reel-modal,.reel-modal *{font-family:Roboto,system-ui,-apple-system,"Segoe UI",sans-serif}'
    + '.reel-modal .vbtn{font-family:inherit;background:#be185d;color:#fff;border:1px solid transparent;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease}'
    + '.reel-modal .vbtn:hover{background:#9d174d}'
    + '.reel-modal .vbtn.sm{padding:7px 13px;font-size:12px;border-radius:7px}'
    + '.reel-modal .vbtn.danger{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca} .reel-modal .vbtn.danger:hover{background:#fee2e2}'
    + '.reel-modal .vbtn.sec{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1} .reel-modal .vbtn.sec:hover{background:#e2e8f0}'
    + '.reel-modal .vbtn:focus-visible{outline:2px solid #ff5cb3;outline-offset:2px}';
  }

  function buildHTML() {
    return ''
    // ① DẢI LỆNH — 4 pill số liệu + 3 nút chạy
    + '<div class="cmdbar">'
    + '  <div class="pills">'
    + '    <span class="pill"><span class="v" id="rs-clone">0</span><span class="k">Tổng Clone</span></span>'
    + '    <span class="pill"><span class="v" id="rs-page">0</span><span class="k">Tổng Page</span></span>'
    + '    <span class="pill ok"><span class="v" id="rs-ok">0</span><span class="k">Đã Đăng OK</span></span>'
    + '    <span class="pill err"><span class="v" id="rs-fail">0</span><span class="k">Lỗi</span></span>'
    + '  </div>'
    + '  <div class="cmdacts">'
    + '    <div style="position:relative">'
    + '      <button class="vbtn sec" id="reel-tools">🧰 Công cụ ▾</button>'
    + '      <div id="reel-tools-menu" style="display:none;position:absolute;top:calc(100% + 5px);right:0;z-index:60;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:11px;box-shadow:0 12px 34px rgba(0,0,0,.22);min-width:190px;padding:7px">'
    + '        <button class="vbtn sec sm" id="reel-statsbtn" style="width:100%;justify-content:flex-start;margin:2px 0">📊 Thống Kê</button>'
    + '        <button class="vbtn sec sm" id="reel-posts-view" style="width:100%;justify-content:flex-start;margin:2px 0">📝 Bài đăng</button>'
    + '        <button class="vbtn sec sm" id="reel-posts-mng" style="width:100%;justify-content:flex-start;margin:2px 0">🗂️ Quản lý bài</button>'
    + '        <button class="vbtn sec sm" id="reel-pgedit" style="width:100%;justify-content:flex-start;margin:2px 0">✏️ Sửa Page</button>'
    + '        <button class="vbtn sec sm" id="reel-cmts" style="width:100%;justify-content:flex-start;margin:2px 0">📨 Comment khách</button>'
    + '        <button class="vbtn sec sm" id="reel-pgtool" style="width:100%;justify-content:flex-start;margin:2px 0">🏭 Tạo Page / BM</button>'
    + '        <button class="vbtn sec sm" id="reel-preview" style="width:100%;justify-content:flex-start;margin:2px 0">🔎 Xem trước phân phối</button>'
    + '        <button class="vbtn sec sm" id="reel-seed-go" style="width:100%;justify-content:flex-start;margin:2px 0">🌱 Seeding</button>'
    + '      </div>'
    + '    </div>'
    + '    <button class="vbtn ok" id="reel-start">🎬 Đăng Reel</button>'
    + '    <button class="vbtn danger" id="reel-stop">■ Dừng</button>'
    + '    <button class="vbtn grey" id="reel-reset">↺ Reset</button>'
    + '  </div>'
    + '</div>'
    // ② DẢI TIẾN ĐỘ
    + '<div class="progstrip">'
    + '  <span class="rpct" id="reel-pct">0%</span>'
    + '  <div class="pmid">'
    + '    <div class="rbar"><i id="reel-prog-bar"></i></div>'
    + '    <div class="facts">'
    + '      <span>Vòng <b id="reel-f-round">0/1</b></span>'
    + '      <span>Bài <b id="reel-f-posts">0 / 0</b></span>'
    + '      <span>Page OK <b class="ok" id="reel-f-pok">0</b></span>'
    + '      <span>Page lỗi <b class="er" id="reel-f-perr">0</b></span>'
    + '    </div>'
    + '  </div>'
    + '  <span class="eta" id="reel-prog-txt">Sẵn sàng</span>'
    + '</div>'
    // ③ VÙNG CẤU HÌNH — giữ nguyên 6 ô, thu gọn được
    + '<div class="cfgzone">'
    + '<div id="reel-cfgfull">'
    + '<div class="rtop">'
    + '  <div class="tcard tc-vid"><label id="reel-vidlabel">🎬 Video hoặc ảnh cần đăng</label>'
    + '    <div class="ptcards">'
    + '      <label class="ptcard" id="reel-pt-video"><input type="radio" name="reel-ptype" value="video" checked><span class="ic">🎬</span><span class="bd"><span class="tt">Video Reel</span><span class="ds">Video dọc · tỷ lệ 9:16 · MP4</span></span><span class="tick">✓</span></label>'
    + '      <label class="ptcard" id="reel-pt-photo"><input type="radio" name="reel-ptype" value="photo"><span class="ic">🖼️</span><span class="bd"><span class="tt">Bài đăng ảnh</span><span class="ds">Một hoặc nhiều ảnh · JPG, PNG</span></span><span class="tick">✓</span></label>'
    + '    </div>'
    + '    <button class="vbtn sec sm" id="reel-pickdir" style="width:100%">📁 Chọn video từ máy tính</button>'
    + '    <button class="vbtn sec sm" id="reel-pickfolder" style="width:100%;margin-top:5px">📂 Chọn cả thư mục</button>'
    + '    <div class="fdrop" id="reel-fdrop">Kéo & thả video/ảnh vào đây</div>'
    + '    <div id="reel-vidinfo" style="font-size:11.5px;margin-top:7px;font-weight:700">Chưa chọn nội dung</div>'
    + '    <div class="filelist" id="reel-filelist"></div>'
    + '    <div class="distrow"><span>Phân phối:</span><select id="reel-distmode"><option value="rotate">Theo thứ tự</option><option value="random">Ngẫu nhiên</option></select></div>'
    + '    <div class="fhint">Mỗi Page nhận 1 nội dung theo thứ tự. Nếu số nội dung ít hơn số Page, hệ thống dùng lại từ đầu.</div>'
    + '    <div id="reel-photobox" style="display:none;margin-top:6px">'
    + '      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:3px">Số ảnh / bài <span style="opacity:.55;font-weight:400">(1 = ảnh đơn · &gt;1 = album)</span></label>'
    + '      <input id="reel-photoper" type="number" value="1" min="1" max="10" style="width:100%;box-sizing:border-box;padding:5px 8px;border-radius:8px;border:1px solid var(--border-color,#ddd);background:var(--bg-primary,#fff);color:var(--text-primary,#000);font:12px inherit">'
    + '    </div>'
    + '    <input type="file" id="reel-vidfile" accept="video/*" multiple style="display:none">'
    + '  </div>'
    + '  <div class="tcard tc-cap"><label>📝 Nội dung bài viết <span style="opacity:.55;font-weight:400" title="Bấm chip để sửa. Spintax {Chào|Xin chào} tạo nhiều biến thể từ 1 câu.">(bấm chip → sửa · Spintax ⓘ)</span></label><div class="chips" id="reel-chips"></div>'
    + '    <div style="margin-top:7px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary)"><span style="white-space:nowrap">Cách ghép:</span><select id="reel-pairmode" style="flex:1;min-width:0;padding:5px 7px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:11.5px inherit"><option value="linked">Ghép riêng từng bài (1 video ↔ 1 caption)</option><option value="shared">Dùng chung 1 nội dung</option><option value="rotated">Xoay vòng caption</option></select></div>'
    + '    <div id="reel-dup-warn" style="font-size:10.5px;margin-top:5px;line-height:1.35;color:var(--text-secondary)"></div></div>'
    + '  <div class="tcard tc-cap"><label style="display:flex;align-items:center;gap:9px">💬 Bình luận tự động <span class="kzsw"><input type="checkbox" id="reel-cmt-on"><span class="sl"></span></span> <span class="cmt-state" id="reel-cmt-state">Đang tắt</span></label><div class="cmt-wrap off" id="reel-cmt-wrap"><div class="chips" id="reel-cmt-chips"></div><div style="display:flex;gap:10px;margin-top:7px;flex-wrap:wrap;align-items:flex-end"><label style="font-size:10.5px;font-weight:600;display:flex;flex-direction:column;gap:3px">Chờ trước bình luận (giây)<input id="reel-cmt-delay" type="number" min="0" value="0" style="width:110px;padding:5px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12px inherit"></label><label style="font-size:10.5px;font-weight:600;display:flex;flex-direction:column;gap:3px">Phân phối<select id="reel-cmt-order" style="padding:5px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12px inherit"><option value="rotate">Theo thứ tự</option><option value="random">Ngẫu nhiên</option></select></label></div><div style="font-size:10.5px;margin-top:5px;color:var(--text-secondary)">Tự đăng 1 bình luận sau khi bài đăng thành công.</div></div></div>'
    + '</div>'
    // ── HÀNG 2: Thiết lập đăng bài (Đăng lúc · Số vòng · nâng cao: Luồng · Khoảng nghỉ) ──
    + '<div class="rrow2" id="reel-rrow2">'
    + '  <span class="r2h">🛠 Thiết lập đăng bài</span>'
    + '  <div class="r2f"><label>Đăng lúc (trống = đăng ngay)</label><input id="reel-schedule" type="datetime-local"></div>'
    + '  <div class="r2f sm"><label>Số vòng</label><input id="reel-rounds" type="number" value="1" min="1"></div>'
    + '  <div class="r2advbox">'
    + '    <div class="r2f sm"><label>Số luồng</label><input id="reel-threads" type="number" value="11" min="1" max="50"></div>'
    + '    <div class="r2f sm"><label>Khoảng nghỉ (giây)</label><input id="reel-delay" type="number" value="10" min="0"></div>'
    + '  </div>'
    + '  <button class="r2adv" id="reel-r2adv" type="button">⚙ Cài đặt nâng cao ▾</button>'
    + '</div>'
    + '<div class="cfgfoot"><button class="fold" id="reel-cfgfold" type="button" aria-expanded="true" aria-controls="reel-cfgfull">Thu gọn ▴</button></div>'
    + '</div>'
    + '<div class="cfgsum" id="reel-cfgsum" style="display:none">'
    + '  <span class="sumchip" id="reel-sum-vid">📁 <b>0</b> video</span>'
    + '  <span class="sumchip" id="reel-sum-cap">📝 <b>1</b> mẫu nội dung</span>'
    + '  <span class="sumchip" id="reel-sum-sch">⏰ <b>Đăng ngay</b></span>'
    + '  <span class="sumchip">Vòng <b id="reel-sum-round">1</b></span>'
    + '  <span class="sumchip">Luồng <b id="reel-sum-thr">11</b></span>'
    + '  <span class="sumchip">Delay <b id="reel-sum-delay">10s</b></span>'
    + '  <button class="fold" id="reel-cfgopen" type="button" aria-expanded="false" aria-controls="reel-cfgfull">Mở rộng ▾</button>'
    + '</div>'
    + '</div>'
    // ④ BẢNG — chiếm trọn chiều ngang
    + '<div class="rmid">'
    + '  <div class="card rpane" id="reel-pane">'
    + '    <div class="rtabs">'
    + '      <div class="rtab on" data-tab="clone" role="tab" tabindex="0">🔑 Clone <span class="cnt" id="reel-tab-clone">(0)</span></div>'
    + '      <div class="rtab" data-tab="pages" role="tab" tabindex="0">📄 Page + Token <span class="cnt" id="reel-tab-pages">(0)</span></div>'
    + '      <div class="rtab" data-tab="posts" role="tab" tabindex="0">📋 Bài đăng <span class="cnt" id="reel-tab-posts">(0)</span></div>'
    + '      <div class="rtab" data-tab="prod" role="tab" tabindex="0">🛒 Sản Phẩm <span class="cnt" id="reel-tab-prod">(0)</span></div>'
    + '      <div class="rtab" data-tab="cmt" role="tab" tabindex="0">💬 Bình luận</div>'
    + '      <div class="rtab" data-tab="sched" role="tab" tabindex="0">📅 Lịch <span class="cnt" id="reel-tab-sched">(0)</span></div>'
    + '      <div class="rtab" data-tab="config" role="tab" tabindex="0">⚙️ Cấu Hình</div>'
    + '      <div class="rtab" data-tab="cols" role="tab" tabindex="0">🧱 Hiển thị cột</div>'
    + '      <span class="rtab-actions">'
    + '        <label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;cursor:pointer;margin-right:6px;color:var(--text-secondary)" title="Chỉ dùng cho nguồn System User: cũng kéo cả page được share vào BM (chậm hơn nếu BM nhiều page)."><input type="checkbox" id="reel-inc-share" style="width:14px;height:14px;margin:0;accent-color:var(--primary-accent,#ff5cb3)"> Gồm page share</label>'
    + '        <button class="vbtn sec sm" id="reel-gettoken" title="Lấy token (Katana/EAAAAU) từ cookie clone — chạy nội bộ, không qua bên thứ ba. Chọn clone hoặc để trống = tất cả.">🔑 Lấy Token</button>'
    + '        <button class="vbtn sec sm" id="reel-loadpages">🔽 Load Page Từ Clone</button>'
    + '        <button class="vbtn sec sm" id="reel-checkperm">🔍 Check Quyền</button>'
    + '      </span>'
    + '    </div>'
    + '    <div class="rtbl" id="reel-view-clone"><table><thead><tr id="reel-clone-head"></tr></thead><tbody id="reel-clone-body"></tbody></table></div>'
    + '    <div class="rtbl" id="reel-view-pages" style="display:none"><table><thead><tr>'
    + '      <th style="width:26px"><input type="checkbox" id="reel-pall" class="selchk"></th>'
    + '      <th style="width:44px">STT</th><th style="width:150px">ID Page</th><th>Tên Page</th>'
    + '      <th style="width:120px">Clone</th><th style="width:130px">Proxy Via</th><th style="width:150px">Token Page</th>'
    + '      <th style="width:50px">Lượt</th><th style="width:200px">Trạng Thái</th><th style="width:180px">Kết Quả</th><th style="width:120px;text-align:center">Thao tác</th>'
    + '    </tr></thead><tbody id="reel-pages-body"></tbody></table></div>'
    + '    <div id="reel-view-config" style="display:none;overflow:auto"></div>'
    + '    <div id="reel-view-cols" style="display:none;overflow:auto"></div>'
    + '    <div id="reel-view-cmt" style="display:none;overflow:auto"></div>'
    + '    <div id="reel-view-sched" style="display:none;overflow:auto"></div>'
    + '    <div id="reel-view-stats" style="display:none;overflow:auto"></div>'
    + '    <div class="rtbl" id="reel-view-posts" style="display:none;flex-direction:column">'
    + '      <div class="pbtoolbar">'
    + '        <b style="font-size:13px">📋 Danh sách nội dung đăng</b>'
    + '        <button class="vbtn ok sm" id="reel-pb-addmedia">📁 Chọn video/ảnh</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-addpost">＋ Thêm bài đăng</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-addalbum">🖼️ Thêm bài ảnh (album)</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-folder">📂 Chọn thư mục</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-cmtcfg">💬 Cấu hình bình luận</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-import">📄 Nhập caption</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-precheck">🔎 Kiểm tra trước khi đăng</button>'
    + '        <span class="sp"></span>'
    + '        <span id="reel-posts-stat" style="font-size:12px;font-weight:600"></span>'
    + '      </div>'
    + '      <div class="pbbulk" id="reel-pb-bulk">'
    + '        <span id="reel-pb-selinfo" style="font-size:12px;font-weight:700"></span>'
    + '        <button class="vbtn sec sm" id="reel-pb-bulkpage">Gán Fanpage cho các bài chọn</button>'
    + '        <button class="vbtn sec sm" id="reel-pb-copypage">⧉ Sao chép Fanpage từ bài đầu</button>'
    + '        <button class="vbtn danger sm" id="reel-pb-bulkdel">🗑 Xóa bài đã chọn</button>'
    + '      </div>'
    + '      <div style="flex:1;min-height:0;overflow:auto"><table><thead><tr><th style="width:34px;text-align:center"><input type="checkbox" id="reel-pb-all"></th><th style="width:40px">STT</th><th style="width:240px">Video / Ảnh</th><th>Nội dung bài viết</th><th style="width:210px">Fanpage đăng</th><th style="width:120px">Trạng thái</th><th style="width:64px">Sửa</th></tr></thead><tbody id="reel-posts-body"></tbody></table></div>'
    + '    </div>'
    + '    <div class="rtbl" id="reel-view-prod" style="display:none">'
    + '      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--border-color)">'
    + '        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;cursor:pointer;margin:0"><input type="checkbox" id="reel-aff-on" style="width:15px;height:15px;margin:0;accent-color:var(--primary-accent,#ff5cb3)"> Bật chế độ Affiliate</label>'
    + '        <span style="font-size:11px;opacity:.6">Bật thì đăng theo SẢN PHẨM (video+caption+link ghép cặp) thay cho thư mục video chung.</span>'
    + '        <button class="vbtn ok sm" id="reel-prod-add" style="margin-left:auto">＋ Thêm sản phẩm</button>'
    + '      </div>'
    + '      <table><thead><tr><th style="width:44px">STT</th><th style="width:180px">Video</th><th>Caption</th><th style="width:210px">Link Shopee</th><th style="width:90px">Giá</th><th style="width:90px">Mã</th><th style="width:110px"></th></tr></thead><tbody id="reel-prod-body"></tbody></table>'
    + '    </div>'
    + '    <div class="foot" id="reel-foot">Tổng: 0 · Đang Chọn: 0</div>'
    + '  </div>'
    + '</div>'
    // ⑤ NGĂN KÉO NHẬT KÝ + danh sách page OK / lỗi
    + '<div class="drawer">'
    + '  <button class="dhd" id="reel-logtoggle" type="button" aria-expanded="false" aria-controls="reel-logbody">'
    + '    <span class="lbl">Nhật Ký</span>'
    + '    <span class="peek" id="reel-logpeek">Chưa có dòng nào</span>'
    + '    <span class="caret" id="reel-logcaret">Mở ▴</span>'
    + '  </button>'
    + '  <div class="dbody" id="reel-logbody" style="display:none">'
    + '    <div class="dcols">'
    + '      <div class="dlog">'
    + '        <div class="rloghd"><b style="font-size:12px">Nhật ký chạy</b><button class="vbtn sec sm" id="reel-logclr">🗑 Xoá Log</button></div>'
    + '        <div class="rlog" id="reel-log"></div>'
    + '      </div>'
    + '      <div class="dids"><label style="color:var(--success-color)">Page Đăng OK</label><textarea class="idbox" id="reel-okids" readonly></textarea></div>'
    + '      <div class="dids"><label style="color:var(--danger-color)">Page Lỗi</label><textarea class="idbox" id="reel-failids" readonly></textarea></div>'
    + '    </div>'
    + '    <div class="toktot" id="reel-sum">Clone: 0 · Page: 0 · Video: 0</div>'
    + '  </div>'
    + '</div>'
    // ⑤b MODAL Cấu hình Seeding — gom toàn bộ cấu hình seeding (dùng chung element/id, 1 bộ duy nhất)
    + '<div id="reel-seed-modal" class="reel-modal-ov" style="display:none">'
    + '  <div class="reel-modal-card">'
    + '    <div class="rsm-head">'
    + '      <div><div class="rsm-title">🌱 Cấu hình Seeding</div><div class="rsm-desc">Fanpage đã load bình luận chéo vào bài — kể cả bài của Page NGƯỜI KHÁC (qua GraphQL, đóng vai Page); không Page nào tự seed bài của mình.</div></div>'
    + '      <button class="rsm-x" id="reel-seed-close-x" title="Đóng">✕</button>'
    + '    </div>'
    + '    <div class="rsm-body">'
    + '      <div class="rsm-cols">'
    + '        <div class="rsm-col-l">'
    + '          <label class="rsm-lbl">Danh sách bài cần seed</label>'
    + '          <div class="rsm-hint">Chọn bài từ bảng (như tab Đăng bài) hoặc dán link/ID, mỗi dòng một bài</div>'
    + '          <textarea id="reel-seed-posts" class="rsm-ta" placeholder="https://www.facebook.com/reel/123456…&#10;789012…"></textarea>'
    + '          <div class="rsm-row"><button class="vbtn sm" id="reel-seed-pick">📋 Chọn bài (bảng)</button><button class="vbtn sec sm" id="reel-seed-getposted">🎬 Lấy reel vừa đăng</button><button class="vbtn sec sm" id="reel-seed-clear">🗑 Xóa danh sách</button><span id="reel-seed-cnt" class="rsm-cnt"></span></div>'
    + '        </div>'
    + '        <div class="rsm-col-r">'
    + '          <label class="rsm-lbl">Nội dung bình luận seed</label>'
    + '          <div class="rsm-hint">Bấm chip để sửa · spintax {a|b|c} · đính kèm ảnh 📷 · <b>mỗi page 1 mẫu xoay vòng</b> (page 1→mẫu 1, page 2→mẫu 2…)</div>'
    + '          <div class="chips" id="reel-seed-chips"></div>'
    + '          <label class="rsm-lbl" style="margin-top:16px">Fanpage dùng để seed <span style="font-weight:400;opacity:.6">(trống = tất cả page đã Load)</span></label>'
    + '          <div class="rsm-hint">Dán ID Page, mỗi dòng một page. Chịu được rất nhiều page vì chỉ lọc theo id.</div>'
    + '          <textarea id="reel-seed-pages" style="width:100%;min-height:90px;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:11.5px Consolas,monospace;resize:vertical" placeholder="1320415961149450&#10;1323793390820591"></textarea>'
    + '          <div class="rsm-row"><button class="vbtn sec sm" id="reel-seed-getsel">☑ Lấy page đã tick (bảng Page + Token)</button><button class="vbtn sec sm" id="reel-seed-pgclear">🗑 Xoá</button></div>'
    + '          <div class="rsm-row"><button class="vbtn sm" id="reel-seed-map">🎯 Gán mẫu cho từng page</button><span id="reel-seed-map-cnt" class="rsm-cnt"></span></div>'
    + '        </div>'
    + '      </div>'
    + '      <div class="rsm-setup">'
    + '        <div class="rsm-setup-title">Thiết lập chạy</div>'
    + '        <div class="rsm-fields">'
    + '          <div class="rsm-f"><label>Comment / bài <span style="font-weight:400;opacity:.55">(0 = tất cả Page)</span></label><input id="reel-seed-per" type="number" min="0" value="0"></div>'
    + '          <div class="rsm-f"><label>Delay (giây)</label><input id="reel-seed-delay" type="number" min="0" value="15"></div>'
    + '          <div class="rsm-f"><label>Max comment / page / bài</label><input id="reel-seed-max" type="number" min="0" value="0" title="Số comment tối đa mỗi page trên MỖI bài (0 = không giới hạn). Áp dụng riêng từng bài, không phải tổng cả phiên."></div>'
    + '          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><label class="rsm-chk" style="height:auto"><input type="checkbox" id="reel-seed-react-on"> Thả cảm xúc trước khi comment</label><select id="reel-seed-react-type" style="height:32px;padding:4px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:12px"><option value="random">🎲 Ngẫu nhiên</option><option value="like">👍 Thích</option><option value="love">❤️ Yêu thích</option><option value="care">🥰 Thương thương</option><option value="haha">😆 Haha</option><option value="wow">😮 Wow</option><option value="sad">😢 Buồn</option><option value="angry">😡 Phẫn nộ</option></select></div>'
    + '          <label class="rsm-chk"><input type="checkbox" id="reel-seed-self"> Cho Page bình luận cả bài của chính mình <span style="font-weight:400;opacity:.55">(bật nếu muốn mọi page seed, kể cả page chủ bài)</span></label>'
    + '        </div>'
    + '        <div style="margin-top:16px">'
    + '          <div style="font-size:12px;font-weight:700;margin-bottom:8px">Thời gian chạy</div>'
    + '          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">'
    + '            <label class="rsm-chk" style="height:auto"><input type="radio" name="reel-tm" id="reel-tm-now" checked style="accent-color:var(--primary-accent,#ff5cb3)"> Chạy ngay</label>'
    + '            <label class="rsm-chk" style="height:auto"><input type="radio" name="reel-tm" id="reel-tm-sched" style="accent-color:var(--primary-accent,#ff5cb3)"> Hẹn giờ</label>'
    + '            <div id="reel-seed-when-box" style="display:none;align-items:center;gap:10px;flex-wrap:wrap">'
    + '              <input id="reel-seed-when" type="datetime-local" style="height:38px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:13px">'
    + '              <select id="reel-seed-tz" style="height:38px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:13px"><option value="Asia/Ho_Chi_Minh">Giờ Việt Nam (UTC+7)</option><option value="local">Giờ máy tính</option></select>'
    + '            </div>'
    + '          </div>'
    + '          <div id="reel-seed-when-confirm" style="font-size:12px;margin-top:8px;font-weight:600"></div>'
    + '          <div id="reel-seed-when-warn" style="display:none;font-size:11.5px;margin-top:6px;color:var(--warn,#b45309)">⚠️ Lịch chạy trong trình duyệt — cần GIỮ trình duyệt và tiện ích mở đúng giờ. Nếu đóng trang, lịch sẽ bị đánh “Lỡ lịch”.</div>'
    + '        </div>'
    + '        <div id="reel-sch-wrap" style="margin-top:16px;border-top:1px solid var(--border-color);padding-top:12px">'
    + '          <button type="button" id="reel-sch-toggle" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;cursor:pointer;font:inherit;font-size:12.5px;font-weight:700;color:var(--text-primary);text-align:left;padding:0">📋 Lịch Seeding <span class="cnt" id="reel-sch-count" style="opacity:.6;font-weight:600">(0)</span> <span id="reel-sch-caret" style="margin-left:auto;color:var(--primary-accent,#ff5cb3)">Mở ▾</span></button>'
    + '          <div id="reel-sch-list" style="display:none;margin-top:8px"></div>'
    + '        </div>'
    + '      </div>'
    + '    </div>'
    + '    <div class="rsm-foot">'
    + '      <span id="reel-seed-status" class="rsm-status">0 bài · 0 fanpage</span>'
    + '      <span id="reel-seed-msg" style="font-size:12px;flex:1 1 100%;min-width:0;order:9;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>'
    + '      <span class="rsm-foot-btns"><button class="vbtn sec" id="reel-seed-close">Đóng</button><button class="vbtn danger" id="reel-seed-stop">■ Dừng</button><button class="vbtn ok" id="reel-seed-start">🌱 Bắt đầu Seeding</button></span>'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<textarea id="reel-clones" style="display:none"></textarea>'
    + '<div id="reel-ctx"></div>';
  }

  var CLONE_COLS = [
    { key: '_stt', label: 'STT', w: 44, always: 1 },
    { key: 'uid', label: 'User / UID' },
    { key: 'cookie', label: 'Cookie' },
    { key: 'token', label: 'Token' },
    { key: 'proxy', label: 'Proxy', w: 120, always: 1 },
    { key: 'status', label: 'Trạng Thái' },
    { key: 'proc', label: 'Tiến Trình' },
    { key: 'ok', label: 'Bài Đã Đăng' },
    { key: 'err', label: 'Bài Đăng Lỗi' },
    { key: 'tstart', label: 'TG Bắt Đầu' },
    { key: 'tend', label: 'TG Kết Thúc' },
    { key: 'trest', label: 'TG Đã Nghỉ' },
    { key: '_detail', label: 'Chi Tiết', always: 1 },
    { key: '_action', label: 'Mở Via', w: 80, always: 1 }
  ];

  function build() {
    var host = $('reel-panel');
    if (!host || host.getAttribute('data-built')) return host;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    loadState();
    host.innerHTML = buildHTML(); host.setAttribute('data-built', '1');

    // nạp clone đã lưu
    try { var cv = kzSecureStore.getItem('reel-clones'); if (cv) $('reel-clones').value = cv; } catch (e) {}
    // config -> input
    $('reel-rounds').value = CFG.rounds; $('reel-threads').value = CFG.luong; $('reel-delay').value = CFG.delay;

    $('reel-start').onclick = doStart;
    $('reel-stop').onclick = function () { STOP = true; log('Đã yêu cầu dừng.'); };
    $('reel-reset').onclick = doReset;
    var pgt = $('reel-pgtool'); if (pgt) pgt.onclick = openPgTool;
    var sbt = $('reel-statsbtn'); if (sbt) sbt.onclick = openStatsModal;
    var pv = $('reel-posts-view'); if (pv) pv.onclick = function () { openPostsModal('view'); };
    var pm = $('reel-posts-mng'); if (pm) pm.onclick = function () { openPostsModal('manage'); };
    var pe = $('reel-pgedit'); if (pe) pe.onclick = function () { openPageEditModal(); };
    var cmb = $('reel-cmts'); if (cmb) cmb.onclick = openCommentsModal;
    var tbtn = $('reel-tools'), tmenu = $('reel-tools-menu');
    if (tbtn && tmenu) {
      tbtn.onclick = function (e) { e.stopPropagation(); tmenu.style.display = (tmenu.style.display === 'none') ? '' : 'none'; };
      tmenu.addEventListener('click', function () { tmenu.style.display = 'none'; });
      document.addEventListener('click', function (e) { if (tmenu.style.display !== 'none' && !tmenu.contains(e.target) && e.target !== tbtn) tmenu.style.display = 'none'; });
    }
    $('reel-logclr').onclick = function () { $('reel-log').innerHTML = ''; var pk = $('reel-logpeek'); if (pk) pk.textContent = 'Chưa có dòng nào'; };
    $('reel-cfgfold').onclick = function () { foldCfg(true); };
    $('reel-cfgopen').onclick = function () { foldCfg(false); };
    $('reel-logtoggle').onclick = function () {
      var body = $('reel-logbody'), open = body.style.display === 'none';
      body.style.display = open ? '' : 'none';
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      $('reel-logcaret').textContent = open ? 'Thu ▾' : 'Mở ▴';
    };
    $('reel-schedule').onchange = function () { updateCfgSum(); updateSummary(); };
    $('reel-loadpages').onclick = function () { loadPagesAll(selCloneIdx().length > 0); };
    $('reel-checkperm').onclick = checkPerm;
    // Kenzi: token chuẩn bị ở tab CLONE/VIA (ưu tiên EAAAAU) -> ẩn nút Lấy Token ở Đăng Reel cho gọn.
    var gtBtn = $('reel-gettoken'); if (gtBtn) { gtBtn.style.display = 'none'; gtBtn.onclick = function () { applyClones(); getTokensFor(selCloneIdx()); }; }
    $('reel-pall').onchange = function (e) { document.querySelectorAll('#reel-pages-body .selchk').forEach(function (c) { c.checked = e.target.checked; var tr = c.closest('tr'); if (tr) tr.classList.toggle('sel', e.target.checked); }); updateFoot(); };
    $('reel-pickdir').onclick = pickVideos;
    var pf = $('reel-pickfolder'); if (pf) pf.onclick = pickFolder;
    // Kéo-thả video/ảnh vào ô drop (thêm vào danh sách hiện có).
    var fd = $('reel-fdrop');
    if (fd) {
      fd.onclick = function () { pickVideos(); };
      ['dragover', 'dragenter'].forEach(function (ev) { fd.addEventListener(ev, function (e) { e.preventDefault(); fd.classList.add('dragover'); }); });
      ['dragleave', 'dragend'].forEach(function (ev) { fd.addEventListener(ev, function () { fd.classList.remove('dragover'); }); });
      fd.addEventListener('drop', function (e) {
        e.preventDefault(); fd.classList.remove('dragover');
        var ph = isPhoto(), RX = ph ? PHOTO_EXT : VIDEO_EXT;
        var dropped = Array.prototype.filter.call((e.dataTransfer && e.dataTransfer.files) || [], function (f) { return RX.test(f.name); }).map(function (f) { return { name: f.name, file: f, _size: f.size }; });
        if (!dropped.length) { log('Không có tệp đúng định dạng trong nội dung kéo vào.', 'err'); return; }
        dropped.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
        FILES = FILES.concat(dropped); BUF = {}; updateVidInfo();
        log('Đã thêm ' + dropped.length + ' ' + (ph ? 'ảnh' : 'video') + ' (kéo-thả).', 'ok');
      });
    }
    // Chế độ phân phối nội dung (theo thứ tự / ngẫu nhiên).
    var dm = $('reel-distmode'); if (dm) { dm.value = (CFG.vidOrder === 'random') ? 'random' : 'rotate'; dm.onchange = function () { CFG.vidOrder = this.value; saveCfg(); }; }
    var r2adv = $('reel-r2adv'); if (r2adv) r2adv.onclick = function () { var r = $('reel-rrow2'); if (r) { r.classList.toggle('adv'); this.textContent = r.classList.contains('adv') ? '⚙ Cài đặt nâng cao ▴' : '⚙ Cài đặt nâng cao ▾'; } };
    $('reel-vidfile').onchange = function () {
      var files = Array.prototype.slice.call(this.files);
      files.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
      var n = addMediaFiles(files);
      log('Đã thêm ' + n + ' media (mỗi media = 1 bài).', n ? 'ok' : 'err');
      try { this.value = ''; } catch (e) {}
    };
    // Công tắc loại nội dung: Video ↔ Ảnh
    host.querySelectorAll('input[name="reel-ptype"]').forEach(function (r) {
      r.onchange = function () { if (this.checked) { CFG.postType = this.value; saveCfg(); applyPostType(); } };
    });
    var pp = $('reel-photoper'); if (pp) pp.oninput = function () { CFG.photoPer = Math.min(10, Math.max(1, parseInt(this.value, 10) || 1)); saveCfg(); };
    applyPostType();

    ['reel-rounds', 'reel-threads', 'reel-delay'].forEach(function (id) {
      $(id).oninput = function () {
        CFG.rounds = Math.max(1, parseInt($('reel-rounds').value, 10) || 1);
        CFG.luong = Math.max(1, parseInt($('reel-threads').value, 10) || 1);
        CFG.delay = Math.max(0, parseInt($('reel-delay').value, 10) || 0);
        saveCfg(); updateDupWarn();
      };
    });

    // tab switch
    host.querySelectorAll('.rtab').forEach(function (t) {
      t.onclick = function () { var tb = this.getAttribute('data-tab'); if (tb === 'stats') { openStatsModal(); return; } switchTab(tb); };
      t.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); var tb = this.getAttribute('data-tab'); if (tb === 'stats') { openStatsModal(); return; } switchTab(tb); } };
    });

    // grid select + context menu (clone & pages)
    bindGridSelect($('reel-clone-body'), 'clone');
    bindGridSelect($('reel-pages-body'), 'pages');
    $('reel-view-clone').addEventListener('contextmenu', function (e) {
      if (e.target.closest('button,a,input')) return; e.preventDefault();
      // Chuột phải vào 1 dòng chưa bôi đen -> chọn đúng dòng đó (để Sửa/Dán Token tác động đúng clone).
      var tr = e.target.closest('tr');
      if (tr && /^reel-c-/.test(tr.id || '') && !tr.classList.contains('sel')) {
        document.querySelectorAll('#reel-clone-body tr.sel').forEach(function (r) { r.classList.remove('sel'); });
        tr.classList.add('sel'); updateSummary();
      }
      openCtx(e.clientX, e.clientY, 'clone');
    });
    $('reel-view-pages').addEventListener('contextmenu', function (e) { if (e.target.closest('button,a,input')) return; e.preventDefault(); openCtx(e.clientX, e.clientY, 'pages'); });
    document.addEventListener('click', function () { var m = $('reel-ctx'); if (m) m.classList.remove('on'); });
    document.addEventListener('paste', function (e) {
      if (!$('reel-panel') || !$('reel-panel').classList.contains('on')) return;
      if (activeTab !== 'clone') return;
      var t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      var txt = ''; try { txt = (e.clipboardData || window.clipboardData).getData('text'); } catch (x) {}
      if (!txt) return; e.preventDefault(); applyPasteClones(txt, 'add');
    });

    renderCloneHead(); buildConfigView(); buildColsView();
    // Bình luận: nạp trạng thái bật/tắt + bind.
    var cmtOn = $('reel-cmt-on'); if (cmtOn) { cmtOn.checked = !!CFG.autoComment; reflectCmtState(!!CFG.autoComment); cmtOn.onchange = function () { CFG.autoComment = this.checked ? 1 : 0; saveCfg(); reflectCmtState(this.checked); }; }
    var cmtDl = $('reel-cmt-delay'); if (cmtDl) { cmtDl.value = CFG.cmtDelay || 0; cmtDl.onchange = function () { CFG.cmtDelay = Math.max(0, parseInt(this.value, 10) || 0); saveCfg(); }; }
    var cmtOrd = $('reel-cmt-order'); if (cmtOrd) { cmtOrd.value = CFG.cmtOrder || 'rotate'; cmtOrd.onchange = function () { CFG.cmtOrder = this.value; saveCfg(); }; }
    var pmSel = $('reel-pairmode'); if (pmSel) { pmSel.value = CFG.pairMode || 'linked'; pmSel.onchange = function () { CFG.pairMode = this.value; saveCfg(); try { syncPosts(); renderPostList(); } catch (e) {} }; }
    // Affiliate: bật/tắt + thêm sản phẩm.
    var affOn = $('reel-aff-on'); if (affOn) { affOn.checked = !!CFG.affiliate; affOn.onchange = function () { CFG.affiliate = this.checked ? 1 : 0; saveCfg(); updateDupWarn(); }; }
    var addP = $('reel-prod-add'); if (addP) addP.onclick = function () { editProd(-1); };
    // Seeding: bind (modal).
    if ($('reel-seed-go')) $('reel-seed-go').onclick = openSeedModal;
    if ($('reel-preview')) $('reel-preview').onclick = openPreviewModal;
    if ($('reel-seed-close')) $('reel-seed-close').onclick = closeSeedModal;
    if ($('reel-seed-close-x')) $('reel-seed-close-x').onclick = closeSeedModal;
    if ($('reel-seed-modal')) $('reel-seed-modal').addEventListener('mousedown', function (e) { if (e.target === this) closeSeedModal(); });
    if ($('reel-seed-start')) $('reel-seed-start').onclick = function () { if (timeMode() === 'sched') saveSchedule(); else seedRun(); };
    if ($('reel-seed-stop')) $('reel-seed-stop').onclick = function () { SEEDSTOP = true; log('Đã yêu cầu dừng seeding.'); };
    // Hẹn giờ.
    if ($('reel-tm-now')) $('reel-tm-now').onchange = function () { setTimeMode('now'); toggleWhenWarn(); };
    if ($('reel-tm-sched')) $('reel-tm-sched').onchange = function () { setTimeMode('sched'); toggleWhenWarn(); };
    if ($('reel-seed-when')) $('reel-seed-when').oninput = function () { this.style.borderColor = ''; updateWhenConfirm(); };
    if ($('reel-seed-tz')) $('reel-seed-tz').onchange = updateWhenConfirm;
    if ($('reel-sch-toggle')) $('reel-sch-toggle').onclick = function () { var l = $('reel-sch-list'), open = l.style.display === 'none'; l.style.display = open ? '' : 'none'; $('reel-sch-caret').textContent = open ? 'Thu ▴' : 'Mở ▾'; if (open) renderSchedules(); };
    if ($('reel-seed-react-on')) { $('reel-seed-react-on').checked = !!CFG.seedReactOn; $('reel-seed-react-on').onchange = function () { CFG.seedReactOn = this.checked ? 1 : 0; saveCfg(); }; }
    if ($('reel-seed-react-type')) { $('reel-seed-react-type').value = CFG.seedReactType || 'random'; $('reel-seed-react-type').onchange = function () { CFG.seedReactType = this.value; saveCfg(); }; }
    if ($('reel-seed-self')) { $('reel-seed-self').checked = !!CFG.seedSelf; $('reel-seed-self').onchange = function () { CFG.seedSelf = this.checked ? 1 : 0; saveCfg(); }; }
    if ($('reel-seed-pick')) $('reel-seed-pick').onclick = openSeedPicker;
    if ($('reel-seed-map')) $('reel-seed-map').onclick = openSeedMapModal;
    if ($('reel-seed-getposted')) $('reel-seed-getposted').onclick = function () {
      var ids = POSTED.map(function (o) { return o.id; }); if (!ids.length) { log('Chưa có reel nào đăng trong phiên này.', 'err'); return; }
      var ta = $('reel-seed-posts'); var cur = (ta.value || '').trim();
      ta.value = (cur ? cur + '\n' : '') + ids.join('\n'); updateSeedCnt(); log('Đã lấy ' + ids.length + ' reel vừa đăng vào danh sách.', 'ok');
    };
    if ($('reel-seed-clear')) $('reel-seed-clear').onclick = function () { $('reel-seed-posts').value = ''; updateSeedCnt(); };
    if ($('reel-seed-posts')) $('reel-seed-posts').oninput = updateSeedCnt;
    if ($('reel-seed-pages')) $('reel-seed-pages').oninput = updateSeedCnt;
    if ($('reel-seed-getsel')) $('reel-seed-getsel').onclick = function () {
      var ids = selPageIds(); if (!ids.length) { log('Chưa tick page nào ở bảng Page + Token.', 'err'); return; }
      var ta = $('reel-seed-pages'); var cur = (ta.value || '').trim(); var seen = {}; cur.split(/[\s,]+/).forEach(function (x) { if (x) seen[x] = 1; });
      ids.forEach(function (id) { if (!seen[id]) { ta.value = (ta.value ? ta.value + '\n' : '') + id; seen[id] = 1; } });
      updateSeedCnt(); log('Đã lấy ' + ids.length + ' page đã tick vào danh sách seed.', 'ok');
    };
    if ($('reel-seed-pgclear')) $('reel-seed-pgclear').onclick = function () { $('reel-seed-pages').value = ''; updateSeedCnt(); };
    ['reel-seed-per', 'reel-seed-delay', 'reel-seed-max'].forEach(function (id) {
      var el = $(id); if (el) el.value = (id === 'reel-seed-per' ? CFG.seedPerPost : id === 'reel-seed-delay' ? CFG.seedDelay : CFG.seedMaxPerPage);
      if (el) el.oninput = function () { CFG.seedPerPost = Math.max(0, parseInt($('reel-seed-per').value, 10) || 0); CFG.seedDelay = Math.max(0, parseInt($('reel-seed-delay').value, 10) || 0); CFG.seedMaxPerPage = Math.max(0, parseInt($('reel-seed-max').value, 10) || 0); saveCfg(); };
    });
    applyClones();
    renderChips(); renderCmtChips(); renderProd(); renderSeedChips(); updateDupWarn();
    startSchedTimer();   // bộ hẹn giờ lịch seeding (client-side)
    updateVidInfo();
    ensureTokensSoon();
    return host;
  }

  function switchTab(tab) {
    activeTab = tab;
    $('reel-view-clone').style.display = tab === 'clone' ? '' : 'none';
    $('reel-view-pages').style.display = tab === 'pages' ? '' : 'none';
    $('reel-view-config').style.display = tab === 'config' ? '' : 'none';
    $('reel-view-cols').style.display = tab === 'cols' ? '' : 'none';
    var vp = $('reel-view-prod'); if (vp) vp.style.display = tab === 'prod' ? '' : 'none';
    var vs = $('reel-view-stats'); if (vs) vs.style.display = tab === 'stats' ? '' : 'none';
    var vc = $('reel-view-cmt'); if (vc) vc.style.display = tab === 'cmt' ? '' : 'none';
    var vsc = $('reel-view-sched'); if (vsc) vsc.style.display = tab === 'sched' ? '' : 'none';
    var vpo = $('reel-view-posts'); if (vpo) vpo.style.display = tab === 'posts' ? 'flex' : 'none';
    var pane = $('reel-pane'); pane.querySelectorAll('.rtab').forEach(function (t) { var on = t.getAttribute('data-tab') === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (tab === 'posts') renderPostList();
    if (tab === 'pages') renderPages();
    if (tab === 'prod') renderProd();
    if (tab === 'stats') renderStats();
    if (tab === 'cmt') renderCmtTab();
    if (tab === 'sched') renderSchedTab();
    updateFoot();
  }
  // Tab 💬 Bình luận — gom mẫu comment tự động (sau đăng) + mẫu seed 1 chỗ.
  function renderCmtTab() {
    var v = $('reel-view-cmt'); if (!v) return;
    var box = 'background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:14px;padding:16px;margin-bottom:14px';
    v.innerHTML = ''
      + '<div style="' + box + '">'
      + '<label style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;margin-bottom:8px">💬 Bình luận tự động sau khi đăng '
      + '<label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;font-size:12px;cursor:pointer;margin:0"><input type="checkbox" id="reel-cmttab-on" style="width:15px;height:15px;accent-color:var(--primary-accent,#ff5cb3)"> bật</label></label>'
      + '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px">Sau khi đăng reel/ảnh, tự thả 1 bình luận (xoay vòng mẫu · spintax {a|b} · điền {{link}} nếu bật Affiliate).</div>'
      + '<div class="chips" id="reel-cmttab-auto"></div>'
      + '</div>'
      + '<div style="' + box + '">'
      + '<div style="font-weight:700;font-size:14px;margin-bottom:8px">🌱 Mẫu bình luận Seeding</div>'
      + '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px">Mẫu bình luận khi Seeding chéo vào bài. Cấu hình chạy chi tiết ở nút <b>🌱 Seeding</b> (thanh lệnh).</div>'
      + '<div class="chips" id="reel-cmttab-seed"></div>'
      + '</div>';
    var on = $('reel-cmttab-on'); if (on) { on.checked = !!CFG.autoComment; on.onchange = function () { CFG.autoComment = this.checked ? 1 : 0; saveCfg(); var o2 = $('reel-cmt-on'); if (o2) o2.checked = this.checked; reflectCmtState(this.checked); }; }
    renderChipsG('reel-cmttab-auto', CMT, 'Bình luận', function () { saveCmt(); renderCmtChips(); }, renderCmtTab);
    renderSeedChipsInto('reel-cmttab-seed');
  }
  // Tab 📅 Lịch — tất cả lịch (seeding/đăng hẹn giờ) 1 chỗ.
  function renderSchedTab() {
    var v = $('reel-view-sched'); if (!v) return;
    reloadSchedules();
    var arr = SCHEDULES.slice().sort(function (a, b) { return a.runAt - b.runAt; });
    var cnt = $('reel-tab-sched'); if (cnt) cnt.textContent = '(' + arr.length + ')';
    var box = 'background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:14px;padding:16px';
    if (!arr.length) { v.innerHTML = '<div style="' + box + ';font-size:12px;color:var(--text-secondary)">Chưa có lịch nào. Tạo lịch ở <b>🌱 Seeding → Hẹn giờ</b>, hoặc dùng ô <b>⏰ Đăng Lúc</b> để hẹn giờ đăng reel.</div>'; return; }
    var rows = arr.map(function (s) {
      var nClone = {}; (s.seeders || []).forEach(function (x) { nClone[x.clone] = 1; });
      var acts = '';
      if (s.status === 'waiting') acts = '<button class="vbtn sec sm sch-edit" data-id="' + s.id + '">✏ Sửa</button><button class="vbtn sec sm sch-cancel" data-id="' + s.id + '">✕ Huỷ</button>';
      else if (s.status === 'running') acts = '<button class="vbtn danger sm sch-stop" data-id="' + s.id + '">■ Dừng</button>';
      else if (s.status === 'missed') acts = '<button class="vbtn ok sm sch-now" data-id="' + s.id + '">▶ Chạy ngay</button><button class="vbtn sec sm sch-edit" data-id="' + s.id + '">↻ Đặt lại giờ</button><button class="vbtn sec sm sch-cancel" data-id="' + s.id + '">✕ Huỷ</button>';
      var res = s.result ? (' · ' + s.result.ok + ' OK/' + s.result.err + ' lỗi') : '';
      return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 4px;border-bottom:1px solid var(--border-color)">'
        + '<span style="font-weight:700;font-size:13px;min-width:170px">⏰ ' + fmtWhen(s.runAt, s.tz) + '</span>'
        + '<span style="font-size:12px;color:var(--text-secondary)">' + (s.posts ? s.posts.length : 0) + ' bài · ' + Object.keys(nClone).length + ' clone · ' + (s.seeders ? s.seeders.length : 0) + ' fanpage' + res + '</span>'
        + '<span class="' + (SCH_CLS[s.status] || 'st-wait') + '" style="font-size:12px;font-weight:700">' + (SCH_LABEL[s.status] || s.status) + '</span>'
        + '<span style="margin-left:auto;display:flex;gap:6px">' + acts + '</span>'
        + '</div>';
    }).join('');
    v.innerHTML = '<div style="' + box + '"><div style="font-weight:700;font-size:14px;margin-bottom:8px">📅 Tất cả lịch (' + arr.length + ')</div>' + rows + '</div>';
    v.querySelectorAll('.sch-cancel').forEach(function (el) { el.onclick = function () { schAction(this.getAttribute('data-id'), 'cancel'); renderSchedTab(); }; });
    v.querySelectorAll('.sch-edit').forEach(function (el) { el.onclick = function () { schAction(this.getAttribute('data-id'), 'edit'); if (typeof openSeedModal === 'function') openSeedModal(); }; });
    v.querySelectorAll('.sch-stop').forEach(function (el) { el.onclick = function () { SEEDSTOP = true; seedLog('Đã yêu cầu dừng lịch đang chạy.'); }; });
    v.querySelectorAll('.sch-now').forEach(function (el) { el.onclick = function () { schAction(this.getAttribute('data-id'), 'now'); }; });
  }
  // ── QUẢN LÝ BÀI ĐĂNG: lịch sử bài + mở link + xoá (qua token page) ──
  function pageTokenFor(pid) {
    for (var i = 0; i < CLONES.length; i++) { var c = CLONES[i]; if (c.ptok && c.ptok[pid]) return { c: c, tok: c.ptok[pid] }; }
    for (var j = 0; j < CLONES.length; j++) { var c2 = CLONES[j]; if (c2.byId && c2.byId[pid]) return { c: c2, tok: '' }; }
    return null;
  }
  async function deletePost(id, pid) {
    var pt = pageTokenFor(pid), token = pt && pt.tok;
    if (!token && pt && pt.c) { try { token = await getPageToken(pt.c, pid); } catch (e) {} }
    // ① Graph API (chỉ xoá được bài do CHÍNH app đăng — vd reel do tool bắn lên).
    var gErr = '';
    if (token) {
      try {
        var r = await graphEB(GVER + '/' + id + '?method=delete&access_token=' + enc(token), 12000);
        if (r && r._timeout) gErr = 'Graph timeout/chặn IP';
        else if (r.json === true || (r.json && r.json.success)) return { ok: true };
        else if (r.json && r.json.error) gErr = errStr(r.json);
        else gErr = 'phản hồi lạ ' + (r && r.status ? ('HTTP ' + r.status) : '');
      } catch (e) { gErr = (e && e.message) || String(e); }
    }
    // ② Đóng-vai-Page bằng cookie (xoá được MỌI bài, kể cả đăng tay / app khác — #200 wasn't created by the application).
    var r2 = await deletePostAsPage(pid, id);
    if (r2.ok) return { ok: true };
    var why = r2.err || 'lỗi';
    if (gErr) why += ' · (Graph: ' + gErr + ')';
    return { ok: false, err: why };
  }
  // Xoá 1 bài đóng vai Page (giống nút "Chuyển vào thùng rác" web FB). Thử 2 chiến lược:
  //  ① Đóng vai PAGE (page NPE/own, hoá-thân được): av=__user=i_user=actor_id=pageId (recipe capture 15/09).
  //  ② Đóng vai USER quản (page classic / BM-only, KHÔNG hoá-thân): av=__user=i_user=user, actor_id vẫn=pageId.
  async function deletePostAsPage(pid, id) {
    var pt = pageTokenFor(pid), c = pt && pt.c;
    if (!c || !c.cookie) return { ok: false, err: 'thiếu cookie clone quản page ' + pid + ' (Load Page lại)' };
    var parts = String(id).split('_'), classicId = parts[0] || pid, postNum = parts[1] || parts[0];
    var errs = [];
    // ① Đóng vai PAGE bằng id ACTOR NPE. Page mới có 2 id: classic (<pid>, dùng cho token & {pid}_{post})
    //    và actor NPE (dùng cho story_id + đóng-vai). seederAuth resolve đúng actor NPE khi nạp fb.com/<pid>/.
    c._delSeed = c._delSeed || {};
    var s = c._delSeed[pid] || (c._delSeed[pid] = { id: classicId, cl: c, cookie: c.cookie });
    if ((await seederAuth(s)) && s.actorId) {
      // story_id thật (resolve từ permalink) chuẩn hơn tự dựng — bài cũ/reel có story_id khác S:_I{npe}:{post}:{post}.
      var storyReal = await resolveStoryId(c, s.actorId, classicId, postNum);
      var cands = [];
      if (storyReal) cands.push(storyReal);
      cands.push(b64u('S:_I' + s.actorId + ':' + postNum + ':' + postNum));
      var r1;
      for (var k = 0; k < cands.length; k++) {
        r1 = await trashTry(c, s.actorId, s.actorId, s.dtsg, s.lsd, cands[k]);
        if (r1.ok) return { ok: true };
        if (/1357\d{3}/.test(r1.raw || '')) { s._authOk = false; break; }
      }
      errs.push('npe(' + s.actorId + (storyReal ? '' : ' storyId dựng') + '):' + r1.err);
    } else errs.push('npe:auth fail ' + (s._authErr || ''));
    // ② Fallback: đóng vai USER quản, story_id trỏ id classic (page cấu trúc cũ không có actor NPE).
    if (await cloneUserAuth(c)) {
      var storyCl = b64u('S:_I' + classicId + ':' + postNum + ':' + postNum);
      var r2 = await trashTry(c, c.uid, classicId, c._udtsg, c._ulsd, storyCl);
      if (r2.ok) return { ok: true };
      if (/1357\d{3}/.test(r2.raw || '')) c._udtsg = '';
      errs.push('user:' + r2.err);
    } else errs.push('user:auth fail ' + (c._uauthErr || ''));
    return { ok: false, err: 'cookie: ' + errs.join(' · ') + ' [pid=' + pid + ']' };
  }
  // Resolve story_id THẬT của bài (nạp permalink đóng-vai-page, trích id story base64 "UzpfS…" = "S:_I…").
  async function resolveStoryId(c, npeActor, classicId, postNum) {
    var ck = String(c.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + npeActor;
    var urls = [
      'https://www.facebook.com/' + npeActor + '/posts/' + postNum + '/',
      'https://www.facebook.com/' + classicId + '/posts/' + postNum + '/',
      'https://www.facebook.com/story.php?story_fbid=' + postNum + '&id=' + classicId,
      'https://www.facebook.com/reel/' + postNum
    ];
    for (var i = 0; i < urls.length; i++) {
      try {
        var t = await fbDoc(urls[i], ck);
        // story_id (base64 của "S:_I…") xuất hiện trong Relay payload của trang.
        var m = t.match(/"(UzpfS[A-Za-z0-9+/=]{12,})"/);
        if (m) return m[1];
      } catch (e) {}
    }
    return '';
  }
  // Gửi mutation trash với 1 danh tính (iuser = av/__user & cookie i_user) + actor_id; tự thử TIMELINE→PERMALINK→GROUP khi field_exception.
  async function trashTry(c, iuser, actorId, dtsg, lsd, storyId) {
    if (!dtsg) return { ok: false, err: 'thiếu dtsg' };
    var ck = String(c.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + iuser;
    var locs = ['TIMELINE', 'PERMALINK', 'GROUP'], last = null;
    for (var i = 0; i < locs.length; i++) {
      var vars = { input: { story_id: storyId, story_location: locs[i], actor_id: actorId, client_mutation_id: '1' } };
      var body = new URLSearchParams();
      body.set('av', iuser); body.set('__user', iuser); body.set('__a', '1');
      body.set('fb_dtsg', dtsg); body.set('jazoest', jazoest(dtsg)); if (lsd) body.set('lsd', lsd);
      body.set('fb_api_caller_class', 'RelayModern');
      body.set('fb_api_req_friendly_name', TRASH_FN);
      body.set('variables', JSON.stringify(vars)); body.set('server_timestamps', 'true');
      body.set('doc_id', TRASH_DOC);
      var r;
      try {
        r = await window.EB.cloneFetch('https://www.facebook.com/api/graphql/', ck, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-friendly-name': TRASH_FN, 'x-fb-lsd': lsd || '', 'x-asbd-id': '129477' },
          body: body.toString()
        });
      } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
      var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, '');
      var j = null; try { j = JSON.parse(txt); } catch (e) {}
      if (j && j.data && !j.errors) return { ok: true };
      last = { r: r, txt: txt };
      if (!/field_exception/i.test(txt)) break;   // lỗi khác surface -> dừng
    }
    var txt = (last && last.txt) || '';
    var em = pgErr(txt);
    if (!em && /^\s*(?:<!doctype html|<html)/i.test(txt)) em = 'HTML(không hoá-thân)';
    return { ok: false, err: (em || 'HTTP ' + ((last && last.r && last.r.status) || '?')) + ' raw:' + txt.replace(/\s+/g, ' ').slice(0, 110), raw: txt };
  }
  // Lấy dtsg/lsd/actorID trong NGỮ CẢNH đóng-vai-page: nạp facebook.com/<pageId>/ với cookie có i_user=<pageId>.
  async function pageActAuth(c, pageId) {
    c._pgAuth = c._pgAuth || {};
    if (c._pgAuth[pageId] && c._pgAuth[pageId].dtsg) return c._pgAuth[pageId];
    var a = { dtsg: '', lsd: '', actorID: pageId, err: '' };
    try {
      var ck = String(c.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + pageId;
      var t = await fbDoc('https://www.facebook.com/' + pageId + '/', ck);
      a.dtsg = (t.match(/DTSGInitialData"[^}]*?"token":"([^"]+)"/) || t.match(/"dtsg":\{"token":"([^"]+)"/) || [])[1] || '';
      a.lsd = (t.match(/"LSD",\[\],\{"token":"([^"]+)"/) || [])[1] || '';
      // Trong ngữ cảnh đóng-vai-page, actorID/userID FB trả về = id page.
      a.actorID = (t.match(/"actorID":"(\d+)"/) || t.match(/"userID":"(\d+)"/) || [])[1] || pageId;
      if (!a.dtsg) a.err = 'không scrape được dtsg (cookie hỏng / không quản page này?)';
    } catch (e) { a.err = (e && e.message) || String(e); }
    c._pgAuth[pageId] = a;
    return a;
  }
  async function addCommentToPost(id, pid, msg) {
    var pt = pageTokenFor(pid), token = pt && pt.tok;
    if (!token && pt && pt.c) { try { token = await getPageToken(pt.c, pid); } catch (e) {} }
    if (!token) return { ok: false, err: 'thiếu token page ' + pid };
    try { var r = await graph('POST', GVER + '/' + id + '/comments?message=' + enc(msg) + '&access_token=' + enc(token)); if (r.json && r.json.id) return { ok: true }; return { ok: false, err: errStr(r.json) }; }
    catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
  }
  // 📨 Messages & Comments — kéo comment khách từ các bài đã đăng (theo POSTS), mở/ẩn spam.
  async function fetchAllComments(limitPosts, onProg) {
    var posts = PHIST.slice(0, limitPosts || 40), out = [];
    for (var i = 0; i < posts.length; i++) {
      if (onProg) onProg(i + 1, posts.length);
      var p = posts[i], pt = pageTokenFor(p.pid), token = pt && pt.tok;
      if (!token && pt && pt.c) { try { token = await getPageToken(pt.c, p.pid); } catch (e) {} }
      if (!token) continue;
      try {
        var r = await graphEB(GVER + '/' + p.id + '/comments?fields=id,from,message,created_time&limit=50&access_token=' + enc(token), 12000);
        var arr = (r.json && r.json.data) || [];
        arr.forEach(function (cm) { out.push({ id: cm.id, from: (cm.from && cm.from.name) || '', msg: cm.message || '', page: p.pn || p.pid, pid: p.pid, postUrl: p.url, t: cm.created_time ? Date.parse(cm.created_time) : 0 }); });
      } catch (e) {}
      await sleep(350);
    }
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }
  async function hideComment(cid, pid, hide) {
    var pt = pageTokenFor(pid), token = pt && pt.tok;
    if (!token && pt && pt.c) { try { token = await getPageToken(pt.c, pid); } catch (e) {} }
    if (!token) return { ok: false };
    try { var r = await graph('POST', GVER + '/' + cid + '?is_hidden=' + (hide ? 'true' : 'false') + '&access_token=' + enc(token)); return { ok: !(r.json && r.json.error), err: r.json && errStr(r.json) }; }
    catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
  }
  function openCommentsModal() {
    var data = [], loading = false;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100006;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    ov.innerHTML = '<div class="reel-modal" style="width:min(1150px,97vw);height:90vh;overflow:hidden;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:18px;box-shadow:0 16px 48px rgba(0,0,0,.4);display:flex;flex-direction:column">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex:0 0 auto"><div style="font-weight:800;font-size:16px">📨 Comment khách <span id="reel-cm-cnt" style="font-weight:400;color:var(--text-secondary);font-size:12px"></span></div><span style="display:flex;gap:8px"><button class="vbtn sm" id="reel-cm-sync">🔄 Đồng bộ</button><button class="vbtn sec sm" id="reel-cm-x">✕</button></span></div>'
      + '<input id="reel-cm-q" placeholder="🔍 Tìm nội dung / tên người…" style="margin-bottom:10px;flex:0 0 auto;padding:7px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit">'
      + '<div id="reel-cm-body" style="flex:1 1 auto;overflow:auto"><div style="font-size:12px;color:var(--text-secondary);padding:12px">Bấm 🔄 Đồng bộ để kéo comment từ các bài đã đăng gần đây.</div></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    q('reel-cm-x').onclick = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !loading) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    function render() {
      var kw = (q('reel-cm-q').value || '').toLowerCase().trim();
      var arr = kw ? data.filter(function (x) { return ((x.msg || '') + ' ' + (x.from || '')).toLowerCase().indexOf(kw) >= 0; }) : data;
      q('reel-cm-cnt').textContent = '(' + arr.length + ' comment)';
      var body = q('reel-cm-body');
      if (!arr.length) { body.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:12px">' + (data.length ? 'Không có comment khớp.' : 'Chưa có comment. Bấm 🔄 Đồng bộ.') + '</div>'; return; }
      var th = 'text-align:left;padding:7px 8px;border-bottom:2px solid var(--border-color,#eee);font-size:11px;color:var(--text-secondary);position:sticky;top:0;background:var(--bg-secondary,#fff)';
      var td = 'padding:7px 8px;border-bottom:1px solid var(--border-color,#f0f0f0);font-size:12px;vertical-align:top';
      body.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + th + ';width:44px">#</th><th style="' + th + ';width:150px">Người bình luận</th><th style="' + th + '">Nội dung</th><th style="' + th + ';width:150px">Page</th><th style="' + th + ';width:140px">Thời gian</th><th style="' + th + ';width:90px">Thao tác</th></tr></thead><tbody>'
        + arr.slice(0, 3000).map(function (x, i) {
          return '<tr><td style="' + td + ';text-align:center;color:var(--text-secondary)">' + (i + 1) + '</td>'
            + '<td style="' + td + '">' + esc(x.from) + '</td>'
            + '<td style="' + td + ';max-width:380px">' + esc(x.msg) + '</td>'
            + '<td style="' + td + '">' + esc(x.page) + '</td>'
            + '<td style="' + td + '">' + (x.t ? new Date(x.t).toLocaleString('vi-VN') : '—') + '</td>'
            + '<td style="' + td + '"><a href="' + esc(x.postUrl || ('https://www.facebook.com/' + x.id)) + '" target="_blank" style="color:var(--primary-accent,#BE185D)">Mở</a> · <button class="vbtn sec sm cm-hide" data-id="' + esc(x.id) + '" data-pid="' + esc(x.pid) + '">Ẩn</button></td></tr>';
        }).join('') + '</tbody></table>';
      body.querySelectorAll('.cm-hide').forEach(function (el) { el.onclick = async function () { var b = this; b.disabled = true; var r = await hideComment(b.getAttribute('data-id'), b.getAttribute('data-pid'), true); b.textContent = r.ok ? '✓ Đã ẩn' : 'Lỗi'; if (!r.ok) b.disabled = false; }; });
    }
    q('reel-cm-q').oninput = render;
    q('reel-cm-sync').onclick = async function () {
      if (loading) return; loading = true; var btn = this; btn.textContent = '⏳ Đang kéo…';
      try { data = await fetchAllComments(40, function (i, n) { btn.textContent = '⏳ ' + i + '/' + n; }); } catch (e) {}
      loading = false; btn.textContent = '🔄 Đồng bộ'; render();
    };
  }
  // Kéo bài THẬT đang có trên các page (feed) — để Quản lý bài hiện cả bài không đăng qua tool.
  async function fetchPagePosts(limitPages, onProg) {
    var jobs = [];
    CLONES.forEach(function (c) { c.ptok = c.ptok || {}; (c.pages || []).forEach(function (p) { var t = c.ptok[p.id]; if (t) jobs.push({ pid: p.id, pn: p.name || '', cl: c.uid || c._cid, tok: t }); }); });
    jobs = jobs.slice(0, limitPages || 30);
    var out = [];
    for (var i = 0; i < jobs.length && !FBSTATSTOP; i++) {
      if (onProg) onProg(i + 1, jobs.length);
      var j = jobs[i];
      try {
        var r = await graphEB(GVER + '/' + j.pid + '/feed?fields=id,message,created_time,permalink_url,attachments{media_type,type}&limit=25&access_token=' + enc(j.tok), 12000);
        var arr = (r.json && r.json.data) || [];
        arr.forEach(function (po) {
          var mt = ''; try { mt = po.attachments.data[0].media_type || po.attachments.data[0].type || ''; } catch (e) {}
          var ty = /video|reel/i.test(mt) ? 'Reel' : /photo|image/i.test(mt) ? 'Ảnh' : 'Bài';
          out.push({ id: po.id, pid: j.pid, pn: j.pn, cl: j.cl, ty: ty, cap: po.message || '', url: po.permalink_url || ('https://www.facebook.com/' + po.id), t: po.created_time ? Date.parse(po.created_time) : 0, src: 'fb' });
        });
      } catch (e) {}
      await sleep(350);
    }
    return out;
  }
  /* ───────── ✏️ SỬA PAGE hàng loạt (đổi tên / bio / avatar / banner) ───────── */
  function pgSpin(s) { return String(s || '').replace(/\{([^{}]*)\}/g, function (_, g) { var a = g.split('|'); return a[Math.floor(Math.random() * a.length)]; }); }
  // Đổi Bio page — ProfileCometBioFieldSaveMutation (capture 16/09). Đóng vai actor NPE của page; resolve collection/sectionToken từ trang About.
  async function setPageBio(c, pid, bioText) {
    c._delSeed = c._delSeed || {};
    var s = c._delSeed[pid] || (c._delSeed[pid] = { id: pid, cl: c, cookie: c.cookie });
    if (!(await seederAuth(s)) || !s.actorId) return { ok: false, err: 'auth: ' + (s._authErr || '?') };
    var npe = s.actorId, ck = String(c.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + npe;
    var sec = '', col = '';
    try {
      var t = await fbDoc('https://www.facebook.com/profile.php?id=' + npe + '&sk=about', ck);
      sec = (t.match(/"(YXBwX3NlY3Rpb246[A-Za-z0-9+/=]+)"/) || [])[1] || '';
      col = (t.match(/"(YXBwX2NvbGxlY3Rpb246[A-Za-z0-9+/=]+)"/) || [])[1] || '';
    } catch (e) {}
    var vars = { collectionToken: col, input: { bio: bioText, profile_field_section_type: 'DIRECTORY_BIO', actor_id: npe, client_mutation_id: '3' }, scale: 1, sectionToken: sec };
    var body = new URLSearchParams();
    body.set('av', npe); body.set('__user', npe); body.set('__a', '1');
    body.set('fb_dtsg', s.dtsg); body.set('jazoest', jazoest(s.dtsg)); if (s.lsd) body.set('lsd', s.lsd);
    body.set('fb_api_caller_class', 'RelayModern'); body.set('fb_api_req_friendly_name', 'ProfileCometBioFieldSaveMutation');
    body.set('variables', JSON.stringify(vars)); body.set('server_timestamps', 'true'); body.set('doc_id', '28830271826608945');
    var r; try {
      r = await window.EB.cloneFetch('https://www.facebook.com/api/graphql/', ck, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-friendly-name': 'ProfileCometBioFieldSaveMutation', 'x-fb-lsd': s.lsd || '', 'x-asbd-id': '129477' }, body: body.toString() });
    } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, ''); var j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.data && !j.errors) return { ok: true };
    if (/1357\d{3}/.test(txt)) s._authOk = false;
    return { ok: false, err: pgErr(txt) || ('lạ ' + txt.slice(0, 110)) };
  }
  // Đổi TÊN page — name.php (pseudonymous_name). Cần mật khẩu FB của via; addId = actor NPE (đóng vai page).
  async function renamePage(c, pid, newName, pass) {
    if (!pass) return { ok: false, err: 'thiếu mật khẩu FB' };
    c._delSeed = c._delSeed || {};
    var s = c._delSeed[pid] || (c._delSeed[pid] = { id: pid, cl: c, cookie: c.cookie });
    if (!(await seederAuth(s)) || !s.actorId) return { ok: false, err: 'auth: ' + (s._authErr || '?') };
    var addId = s.actorId, ck = String(c.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + addId;
    var body = new URLSearchParams();
    body.set('fb_dtsg', s.dtsg); body.set('jazoest', jazoest(s.dtsg));
    body.set('save_password', pass); body.set('pseudonymous_name', newName);
    body.set('__user', String(addId)); body.set('__a', '1'); body.set('__req', '5');
    body.set('cquick', 'jsc_c_2'); body.set('ctarget', 'https://www.facebook.com');
    var url = 'https://www.facebook.com/ajax/settings/account/name.php?ads_manager_write_regions=true';
    var r; try {
      r = await window.EB.cloneFetch(url, ck, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, ''); var j = null; try { j = JSON.parse(txt); } catch (e) {}
    // FB trả lỗi rõ -> báo lỗi.
    var low = txt.toLowerCase();
    if (!(j && j.payload === true) &&
        (/checkpoint|xác minh|verify|confirm|đang xem xét|incorrect|not allowed|too many|limit/.test(low) || /"error"/.test(txt)))
      return { ok: false, err: (pgErr(txt) || txt.slice(0, 180) || 'cần xác minh') };
    if (!(j && j.payload === true))
      return { ok: false, err: 'FB không nhận yêu cầu · phản hồi: ' + (txt.slice(0, 180) || '(rỗng)') };
    // payload:true = FB NHẬN yêu cầu, NHƯNG page kiểu mới (NPE) thường chỉ đổi sau khi FB DUYỆT.
    // Xác minh THẬT: đọc lại tên page. Đổi rồi -> ✅; chưa -> báo "chờ duyệt", không báo OK giả.
    try {
      await sleep(1500);
      var tok = pgTokenOf(pid, c) || c.token || '';
      var chk = await graph('GET', GVER + '/' + pid + '?fields=name&access_token=' + enc(tok));
      var cur = chk && chk.json && chk.json.name;
      if (cur && cur === newName) return { ok: true };
      if (cur && cur !== newName) return { ok: false, err: 'FB nhận yêu cầu nhưng tên CHƯA đổi (vẫn «' + cur + '») — page kiểu mới thường phải CHỜ FACEBOOK DUYỆT (vài giờ–vài ngày) hoặc bị chặn. Xem Cài đặt Page → Tên.', pending: true };
    } catch (e) {}
    return { ok: false, err: 'FB đã nhận yêu cầu đổi tên nhưng chưa xác minh được kết quả — kiểm tra lại sau (có thể chờ duyệt).', pending: true };
  }
  // Lấy token PAGE của 1 pid (ưu tiên token page đã load) để đọc/ghi đúng ngữ cảnh page.
  function pgTokenOf(pid, c) {
    try {
      if (c && c.ptok && c.ptok[pid]) return c.ptok[pid];
      var rec = PPAGES[clKey(c)];
      if (rec && rec.pg && rec.pg[pid] && rec.pg[pid].t) return rec.pg[pid].t;
    } catch (e) {}
    return '';
  }
  // ── Avatar / Banner: upload ảnh bằng cookie clone (đóng vai page NPE) rồi set qua mutation. Port dashboard.js + capture 16/09. ──
  function fileToB64(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { var s = String(r.result || ''); var i = s.indexOf(','); res(i >= 0 ? s.slice(i + 1) : s); }; r.onerror = function () { rej(new Error('đọc file lỗi')); }; r.readAsDataURL(file); }); }
  // Upload ảnh -> fbid. kind = 'avatar' | 'cover'. Endpoint profile/picture|cover, identity = actor NPE.
  async function pgUploadImg(s, npe, file, kind) {
    var dtsg = s.dtsg, jaz = jazoest(dtsg), lsd = s.lsd || '';
    var q = new URLSearchParams();
    q.set('profile_id', npe); q.set('av', npe); q.set('__aaid', '0');
    if (kind === 'avatar') q.set('photo_source', '57');
    q.set('__user', npe); q.set('__a', '1'); q.set('__comet_req', '15');
    q.set('fb_dtsg', dtsg); q.set('jazoest', jaz); if (lsd) q.set('lsd', lsd);
    var base = kind === 'avatar' ? 'https://www.facebook.com/profile/picture/upload/?' : 'https://www.facebook.com/profile/cover/comet_upload/?';
    var b64 = await fileToB64(file);
    var ck = String(s.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + npe;
    if (!(window.EB && window.EB.cloneUploadPhoto)) throw new Error('Extension chưa có cloneUploadPhoto — cập nhật Extension + F5.');
    var r = await window.EB.cloneUploadPhoto(base + q.toString(), ck, b64, file.name || 'photo.jpg', file.type || 'image/jpeg');
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, '');
    var jj = null; try { jj = JSON.parse(txt); } catch (e) {}
    var fbid = jj && jj.payload && (jj.payload.fbid || jj.payload.photo_id);
    if (!fbid) { var m = txt.match(/"fbid"\s*:\s*"?(\d+)"?/); fbid = m ? m[1] : null; }
    if (!fbid) {
      // FB trả lỗi có cấu trúc {error, errorSummary, errorDescription} → hiện đủ để biết FB chặn vì gì
      var code = jj && jj.error, sum = (jj && (jj.errorSummary || (jj.errorDescription))) || '';
      sum = String(sum).replace(/<[^>]+>/g, '').trim(); // bỏ thẻ html trong errorDescription
      if (code === 1357032 || code === 1357054 || /1357032|1357054|Something Went Wrong/i.test(txt)) {
        throw new Error('FB chặn đổi ảnh page (mã ' + (code || '1357xxx') + ')' + (sum ? ' — ' + sum.slice(0, 180) : '') + '. Thường do clone bị hạn chế/chưa đủ quyền admin, hoặc đổi ảnh quá nhiều. Thử clone khác hoặc đổi tay.');
      }
      throw new Error('không lấy được fbid' + (code ? ' (mã ' + code + ')' : '') + ': ' + ((sum || txt).slice(0, 180) || '(rỗng)'));
    }
    return String(fbid);
  }
  // POST 1 mutation graphql đóng vai page (dùng cho avatar/cover set).
  async function pgGraphMut(s, npe, fn, docId, vars) {
    var ck = String(s.cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + npe;
    var body = new URLSearchParams();
    body.set('av', npe); body.set('__user', npe); body.set('__a', '1');
    body.set('fb_dtsg', s.dtsg); body.set('jazoest', jazoest(s.dtsg)); if (s.lsd) body.set('lsd', s.lsd);
    body.set('fb_api_caller_class', 'RelayModern'); body.set('fb_api_req_friendly_name', fn);
    body.set('variables', JSON.stringify(vars)); body.set('server_timestamps', 'true'); body.set('doc_id', docId);
    var r; try {
      r = await window.EB.cloneFetch('https://www.facebook.com/api/graphql/', ck, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-friendly-name': fn, 'x-fb-lsd': s.lsd || '', 'x-asbd-id': '129477' }, body: body.toString() });
    } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, ''); var j = null; try { j = JSON.parse(txt.split('\n')[0]); } catch (e) {}
    if (j && j.data && !j.errors) return { ok: true };
    if (/1357\d{3}/.test(txt)) s._authOk = false;
    return { ok: false, err: pgErr(txt) || ('lạ ' + txt.slice(0, 110)) };
  }
  function pgSeed(c, pid) { c._delSeed = c._delSeed || {}; return c._delSeed[pid] || (c._delSeed[pid] = { id: pid, cl: c, cookie: c.cookie }); }
  async function setPageAvatar(c, pid, file) {
    var s = pgSeed(c, pid);
    if (!(await seederAuth(s)) || !s.actorId) return { ok: false, err: 'auth: ' + (s._authErr || '?') };
    var npe = s.actorId, fbid; try { fbid = await pgUploadImg(s, npe, file, 'avatar'); } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
    var vars = { input: { caption: '', existing_photo_id: fbid, expiration_time: null, profile_id: npe, profile_pic_method: 'EXISTING', profile_pic_source: 'TIMELINE', scaled_crop_rect: { height: 1, width: 1, x: 0, y: 0 }, skip_cropping: true, actor_id: npe, client_mutation_id: '1' }, isPage: false, isProfile: true, scale: 1, __relay_internal__pv__ProfileGeminiIsCoinFlipEnabledrelayprovider: false };
    return await pgGraphMut(s, npe, 'ProfileCometProfilePictureSetMutation', '27326177573748994', vars);
  }
  async function setPageCover(c, pid, file) {
    var s = pgSeed(c, pid);
    if (!(await seederAuth(s)) || !s.actorId) return { ok: false, err: 'auth: ' + (s._authErr || '?') };
    var npe = s.actorId, fbid; try { fbid = await pgUploadImg(s, npe, file, 'cover'); } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
    var vars = { input: { cover_photo_id: fbid, focus: { x: 0.5, y: 0.5 }, target_user_id: npe, actor_id: npe, client_mutation_id: '2' }, scale: 1, contextualProfileContext: null };
    return await pgGraphMut(s, npe, 'ProfileCometCoverPhotoUpdateMutation', '26648951184714383', vars);
  }
  function allPagesList() { var out = []; CLONES.forEach(function (c) { (c.pages || []).forEach(function (p) { out.push({ pid: p.id, name: p.name || p.id, c: c, cl: c.uid || c._cid || '' }); }); }); return out; }
  function openPageEditModal() {
    var pages = allPagesList();
    var chosen = {}; var avFile = null, cvFile = null, filter = '';
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100006;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    var inp = 'width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color,#ddd);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit';
    ov.innerHTML = '<style>'
      + '.pe-wrap *{box-sizing:border-box}'
      + '.pe-wrap label{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;text-align:left!important;gap:8px!important;margin:0!important;cursor:pointer}'
      + '.pe-wrap input[type=checkbox]{width:18px;height:18px;margin:0!important;float:none!important;accent-color:var(--primary-accent,#BE185D);cursor:pointer}'
      + '.pe-wrap .pe-row{position:relative;display:grid;grid-template-columns:24px 44px minmax(0,1fr);align-items:center;column-gap:12px;width:100%;min-width:0;min-height:60px;padding:8px 10px;border-radius:10px;cursor:pointer;margin-bottom:2px;border:1px solid transparent;overflow:hidden}'
      + '.pe-wrap .pe-row:hover{background:var(--bg-primary,#f7f7f8)}'
      + '.pe-wrap .pe-row.on{background:var(--primary-accent-weak,#fdf2f8);border-color:var(--primary-accent-weak,#fbcfe8)}'
      + '.pe-wrap .pe-cb{position:static!important;justify-self:center}'
      + '.pe-wrap .pe-av{position:static!important;display:block;width:44px;height:44px;min-width:44px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#f9a8d4,#c084fc)}'
      + '.pe-wrap .pe-av img{width:100%;height:100%;object-fit:cover;display:block}'
      + '.pe-wrap .pe-t{min-width:0;width:100%;overflow:hidden;text-align:left}'
      + '.pe-wrap .pe-name{display:block;width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--text-primary);font-size:14px;font-weight:600;line-height:20px}'
      + '.pe-wrap .pe-id{display:block;width:100%;margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--text-secondary);font:11px/16px Consolas,monospace}'
      + '.pe-wrap .pe-card{border:1px solid var(--border-color,#eee);border-radius:12px;padding:14px;margin-bottom:12px}'
      + '.pe-wrap .pe-fh{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}'
      + '.pe-wrap .pe-fh b{font-size:14px}'
      + '.pe-wrap .pe-ap{font-size:12px;color:var(--text-secondary)}'
      + '.pe-wrap .pe-up{flex:1;border:1.5px dashed var(--border-color,#ddd);border-radius:11px;padding:14px;text-align:center}'
      + '.pe-wrap .pe-thumb{width:64px;height:64px;border-radius:10px;object-fit:cover;margin:0 auto 8px;display:block}'
      + '</style>'
      + '<div class="reel-modal pe-wrap" style="width:min(1080px,97vw);height:88vh;overflow:hidden;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:16px;padding:20px;box-shadow:0 18px 52px rgba(0,0,0,.4);display:flex;flex-direction:column">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex:0 0 auto"><div style="display:flex;align-items:center;gap:10px"><span style="font-weight:800;font-size:18px">✏️ Sửa Page hàng loạt</span><span style="background:var(--primary-accent-weak,#fdf2f8);color:var(--primary-accent,#BE185D);font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px">' + pages.length + ' page</span></div><button class="vbtn sec sm" id="pe-x">✕</button></div>'
      + '<div style="display:flex;gap:18px;flex:1 1 auto;overflow:hidden">'
      // ── cột trái: chọn page ──
      + '<div style="flex:0 0 340px;min-width:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border-color,#eee);border-radius:13px;padding:12px">'
      + '<input id="pe-search" placeholder="🔍 Tìm kiếm Page" style="' + inp + ';flex:0 0 auto;margin-bottom:10px">'
      + '<label style="flex:0 0 auto;font-size:13px;font-weight:700;padding:0 4px 10px;margin-bottom:6px;border-bottom:1px solid var(--border-color,#eee)"><input type="checkbox" id="pe-all"><span id="pe-all-lbl">Chọn tất cả (' + pages.length + ')</span></label>'
      + '<div id="pe-pages" style="flex:1 1 auto;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden"></div></div>'
      // ── cột phải: cấu hình ──
      + '<div style="flex:1 1 auto;overflow:auto;padding-right:2px">'
      + '<div style="font-weight:800;font-size:16px">Thông tin cần cập nhật</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin:3px 0 14px">Thiết lập một lần và áp dụng cho các Page đã chọn</div>'
      // Tên Page
      + '<div class="pe-card"><div class="pe-fh"><b>Tên Page</b><label class="pe-ap"><input type="checkbox" id="pe-name-ap"><span>Áp dụng</span></label></div>'
      + '<input id="pe-name-val" placeholder="Nhập tên Page mới… (spintax {Shop|Store} được)" style="' + inp + '">'
      + '<input id="pe-name-pass" type="password" placeholder="🔑 Mật khẩu FB của via (bắt buộc để đổi tên)" style="' + inp + ';margin-top:8px">'
      + '<div style="font-size:11px;color:var(--text-secondary);margin-top:5px">FB giới hạn số lần đổi tên — tránh đổi quá thường xuyên.</div></div>'
      // Mô tả (Bio)
      + '<div class="pe-card"><div class="pe-fh"><b>Mô tả (Bio)</b><label class="pe-ap"><input type="checkbox" id="pe-bio-ap"><span>Áp dụng</span></label></div>'
      + '<textarea id="pe-bio-val" placeholder="Nhập mô tả Page… (spintax {sỉ|lẻ} được)" style="' + inp + ';min-height:84px;resize:vertical"></textarea></div>'
      // Ảnh
      + '<div class="pe-card"><b style="font-size:14px">Ảnh đại diện &amp; ảnh bìa</b>'
      + '<div style="display:flex;gap:12px;margin-top:10px">'
      + '<div class="pe-up"><div style="font-size:12px;font-weight:600;margin-bottom:8px">Ảnh đại diện</div><div id="pe-av-prev"></div><button class="vbtn sec sm" id="pe-av-btn">Chọn ảnh</button><input type="file" id="pe-av-file" accept="image/*" style="display:none"><div style="font-size:10px;color:var(--text-secondary);margin-top:7px">JPG, PNG • Tối đa 5 MB</div></div>'
      + '<div class="pe-up"><div style="font-size:12px;font-weight:600;margin-bottom:8px">Ảnh bìa</div><div id="pe-cv-prev"></div><button class="vbtn sec sm" id="pe-cv-btn">Chọn ảnh</button><input type="file" id="pe-cv-file" accept="image/*" style="display:none"><div style="font-size:10px;color:var(--text-secondary);margin-top:7px">JPG, PNG • Tối đa 5 MB</div></div>'
      + '</div><div style="font-size:11px;color:#b45309;margin-top:9px">⚠ FB có thể chặn đổi ảnh page kiểu mới bằng công cụ (lỗi anti-bot 1357032). Nếu báo lỗi đó nghĩa là FB chặn, cần đổi tay.</div></div>'
      // banner + log
      + '<div id="pe-banner" style="display:flex;align-items:center;gap:11px;background:var(--primary-accent-weak,#fdf2f8);border-radius:12px;padding:12px 14px;margin-bottom:10px"><span style="font-size:20px">👥</span><div><div style="font-weight:700;font-size:13px" id="pe-banner-t">Chưa chọn Page nào</div><div style="font-size:12px;color:var(--text-secondary)">Các thay đổi sẽ áp dụng cho tất cả Page đã chọn.</div></div></div>'
      + '<div id="pe-log" style="font:11px Consolas,monospace;color:var(--text-secondary);white-space:pre-wrap;max-height:150px;overflow:auto;border:1px solid var(--border-color,#f0f0f0);border-radius:10px;padding:9px;display:none"></div>'
      + '</div></div>'
      // footer
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;flex:0 0 auto"><div id="pe-prog" style="font-size:12px;color:var(--text-secondary)"></div><div style="display:flex;gap:10px"><button class="vbtn sec" id="pe-cancel">Hủy</button><button class="vbtn" id="pe-run" style="min-width:170px">▶ Áp dụng thay đổi</button></div></div>'
      + '</div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    q('pe-x').onclick = close; q('pe-cancel').onclick = close; ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    var pl = q('pe-pages');
    function nSel() { var n = 0; pages.forEach(function (p) { if (chosen[p.pid]) n++; }); return n; }
    function updBanner() { var n = nSel(); q('pe-banner-t').textContent = n ? ('Đã chọn ' + n + '/' + pages.length + ' Page') : 'Chưa chọn Page nào'; }
    function visPages() { var f = filter.toLowerCase(); return pages.filter(function (p) { return !f || (p.name + ' ' + p.pid).toLowerCase().indexOf(f) >= 0; }); }
    function renderList() {
      var arr = visPages();
      if (!pages.length) { pl.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px">Chưa có page. Bấm <b>Load Page Từ Clone</b> trước.</div>'; return; }
      if (!arr.length) { pl.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px">Không có page khớp tìm kiếm.</div>'; return; }
      pl.innerHTML = arr.map(function (p) {
        return '<div class="pe-row' + (chosen[p.pid] ? ' on' : '') + '" data-pid="' + esc(p.pid) + '">'
          + '<input type="checkbox" class="pe-pg pe-cb"' + (chosen[p.pid] ? ' checked' : '') + '>'
          + '<span class="pe-av"><img src="https://graph.facebook.com/' + esc(p.pid) + '/picture?type=square&width=88" referrerpolicy="no-referrer" data-img-fallback="remove"></span>'
          + '<div class="pe-t"><span class="pe-name">' + (esc(p.name) || 'Page chưa có tên') + '</span><span class="pe-id">ID: ' + esc(p.pid) + '</span></div></div>';
      }).join('');
      pl.querySelectorAll('.pe-row').forEach(function (row) {
        row.onclick = function () { var pid = row.getAttribute('data-pid'); chosen[pid] = !chosen[pid]; row.classList.toggle('on', chosen[pid]); row.querySelector('.pe-pg').checked = chosen[pid]; updBanner(); syncAll(); };
      });
    }
    function syncAll() { var vis = visPages(); var all = vis.length && vis.every(function (p) { return chosen[p.pid]; }); q('pe-all').checked = !!all; }
    q('pe-search').oninput = function () { filter = this.value.trim(); renderList(); syncAll(); };
    q('pe-all').onchange = function () { var v = this.checked; visPages().forEach(function (p) { chosen[p.pid] = v; }); renderList(); updBanner(); };
    // file pickers + preview
    function wireFile(btnId, fileId, prevId, set) {
      q(btnId).onclick = function () { q(fileId).click(); };
      q(fileId).onchange = function () { var f = this.files && this.files[0]; set(f || null); q(prevId).innerHTML = f ? '<img class="pe-thumb" src="' + URL.createObjectURL(f) + '">' : ''; };
    }
    wireFile('pe-av-btn', 'pe-av-file', 'pe-av-prev', function (f) { avFile = f; });
    wireFile('pe-cv-btn', 'pe-cv-file', 'pe-cv-prev', function (f) { cvFile = f; });
    // Gõ vào ô nào thì TỰ bật "Áp dụng" mục đó (khỏi phải tick tay).
    q('pe-name-val').oninput = function () { if (this.value.trim()) q('pe-name-ap').checked = true; };
    q('pe-name-pass').oninput = function () { if (this.value) q('pe-name-ap').checked = true; };
    q('pe-bio-val').oninput = function () { if (this.value.trim()) q('pe-bio-ap').checked = true; };
    renderList(); updBanner();
    q('pe-run').onclick = async function () {
      var picks = pages.filter(function (p) { return chosen[p.pid]; });
      if (!picks.length) { alert('Chưa chọn Page nào.'); return; }
      var doName = q('pe-name-ap').checked, doBio = q('pe-bio-ap').checked, doAv = !!avFile, doCv = !!cvFile;
      var nameVal = q('pe-name-val').value.trim(), bioVal = q('pe-bio-val').value, pass = q('pe-name-pass').value;
      if (!doName && !doBio && !doAv && !doCv) { alert('Chưa bật mục nào để áp dụng (tick "Áp dụng" hoặc chọn ảnh).'); return; }
      if (doName && !nameVal) { alert('Đã bật Áp dụng Tên nhưng chưa nhập tên.'); return; }
      if (doName && !pass) { alert('Đổi tên cần nhập mật khẩu FB của via.'); return; }
      var lg = q('pe-log'); lg.style.display = 'block'; lg.textContent = '';
      function plog(m) { lg.textContent += m + '\n'; lg.scrollTop = lg.scrollHeight; }
      this.disabled = true; var okN = 0, erN = 0, okB = 0, erB = 0, okA = 0, erA = 0, okC = 0, erC = 0;
      for (var k = 0; k < picks.length; k++) {
        var p = picks[k]; q('pe-prog').textContent = 'Đang xử lý ' + (k + 1) + '/' + picks.length + ': ' + p.name;
        if (doName) { var nm = pgSpin(nameVal); var rn = await renamePage(p.c, p.pid, nm, pass); if (rn.ok) { okN++; plog('✅ Tên «' + p.name + '» → «' + nm + '»'); p.name = nm; } else if (rn.pending) { plog('⏳ Tên «' + p.name + '»: ' + rn.err); } else { erN++; plog('❌ Tên «' + p.name + '»: ' + rn.err); } await sleep(600); }
        if (doBio) { var bi = pgSpin(bioVal); var rb = await setPageBio(p.c, p.pid, bi); if (rb.ok) { okB++; plog('✅ Bio «' + p.name + '»'); } else { erB++; plog('❌ Bio «' + p.name + '»: ' + rb.err); } await sleep(500); }
        if (doAv) { var ra = await setPageAvatar(p.c, p.pid, avFile); if (ra.ok) { okA++; plog('✅ Avatar «' + p.name + '»'); } else { erA++; plog('❌ Avatar «' + p.name + '»: ' + ra.err); } await sleep(800); }
        if (doCv) { var rc = await setPageCover(p.c, p.pid, cvFile); if (rc.ok) { okC++; plog('✅ Banner «' + p.name + '»'); } else { erC++; plog('❌ Banner «' + p.name + '»: ' + rc.err); } await sleep(800); }
      }
      q('pe-prog').textContent = 'Xong. ' + (doName ? ('Tên ' + okN + '✓/' + erN + '✗ ') : '') + (doBio ? ('Bio ' + okB + '✓/' + erB + '✗ ') : '') + (doAv ? ('Avatar ' + okA + '✓/' + erA + '✗ ') : '') + (doCv ? ('Banner ' + okC + '✓/' + erC + '✗') : '');
      log('✏️ Sửa page: ' + (doName ? ('tên ' + okN + '/' + erN + ' · ') : '') + (doBio ? ('bio ' + okB + '/' + erB + ' · ') : '') + (doAv ? ('avatar ' + okA + '/' + erA + ' · ') : '') + (doCv ? ('banner ' + okC + '/' + erC) : ''), (erN || erB || erA || erC) ? 'err' : 'ok');
      this.disabled = false; renderList();
    };
  }

  function openPostsModal(mode) {
    var manage = (mode === 'manage');
    var flt = { page: '', ty: '', q: '', from: '', to: '' };
    var extra = FBPOSTS.slice();   // bài kéo từ Facebook (feed) — dùng cache bền, F5 vẫn còn
    function allData() { var seen = {}, out = []; PHIST.concat(extra).forEach(function (x) { if (seen[x.id]) return; seen[x.id] = 1; out.push(x); }); out.sort(function (a, b) { return (b.t || 0) - (a.t || 0); }); return out; }
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100006;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    ov.innerHTML = '<div class="reel-modal" style="width:min(1200px,97vw);height:90vh;overflow:hidden;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:18px;box-shadow:0 16px 48px rgba(0,0,0,.4);display:flex;flex-direction:column">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex:0 0 auto">'
      + '<div style="font-weight:800;font-size:16px">' + (manage ? '🗂️ Quản lý bài đăng' : '📝 Bài đăng') + ' <span id="reel-posts-cnt" style="font-weight:400;color:var(--text-secondary);font-size:12px"></span></div>'
      + '<span style="display:flex;gap:8px"><button class="vbtn sm" id="reel-posts-sync">🔄 Tải bài từ Page</button><button class="vbtn sec sm" id="reel-posts-dup">🧹 Dọn bài trùng</button><button class="vbtn sec sm" id="reel-posts-exp">⬇ Xuất Excel</button><button class="vbtn sec sm" id="reel-posts-x">✕</button></span>'
      + '</div>'
      // filter bar
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;flex:0 0 auto">'
      + '<input id="reel-posts-q" placeholder="🔍 Tìm nội dung / tên page…" style="flex:1;min-width:200px;padding:7px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit">'
      + '<select id="reel-posts-fpage" style="padding:7px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit"></select>'
      + '<select id="reel-posts-fty" style="padding:7px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit"><option value="">Mọi loại</option><option value="Reel">Reel</option><option value="Ảnh">Ảnh</option></select>'
      + '<input id="reel-posts-from" type="date" style="padding:6px 8px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:12px inherit" title="Từ ngày">'
      + '<input id="reel-posts-to" type="date" style="padding:6px 8px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:12px inherit" title="Đến ngày">'
      + '</div>'
      + (manage ? '<div id="reel-posts-bulk" style="display:none;gap:8px;align-items:center;margin-bottom:10px;flex:0 0 auto;background:var(--primary-accent-weak,#fdf2f8);border:1px solid var(--border-color,#eee);border-radius:9px;padding:8px 10px"><b id="reel-posts-nsel" style="font-size:12px"></b><button class="vbtn sm" id="reel-posts-cmt">💬 Thêm comment</button><button class="vbtn danger sm" id="reel-posts-del">🗑 Xoá bài đã chọn</button></div>' : '')
      + '<div id="reel-posts-body" style="flex:1 1 auto;overflow:auto"></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    var q = function (id) { return ov.querySelector('#' + id); };
    q('reel-posts-x').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    var body = q('reel-posts-body');
    // dropdown page (dựng lại theo dữ liệu hiện có, giữ lựa chọn)
    function rebuildPages() {
      var pset = {}; allData().forEach(function (x) { if (x.pid) pset[x.pid] = x.pn || x.pid; });
      q('reel-posts-fpage').innerHTML = '<option value="">Mọi page</option>' + Object.keys(pset).map(function (id) { return '<option value="' + esc(id) + '"' + (flt.page === id ? ' selected' : '') + '>' + esc(pset[id]) + '</option>'; }).join('');
    }
    function filtered() {
      return allData().filter(function (x) {
        if (flt.page && x.pid !== flt.page) return false;
        if (flt.ty && x.ty !== flt.ty) return false;
        if (flt.from && x.t < Date.parse(flt.from)) return false;
        if (flt.to && x.t > Date.parse(flt.to) + 86400000) return false;
        if (flt.q) { var s = (x.cap || '') + ' ' + (x.pn || ''); if (s.toLowerCase().indexOf(flt.q.toLowerCase()) < 0) return false; }
        return true;
      });
    }
    function selPicks() { return Array.prototype.slice.call(body.querySelectorAll('.pchk:checked')); }
    function updBulk() { if (!manage) return; var n = selPicks().length; var bar = q('reel-posts-bulk'); bar.style.display = n ? 'flex' : 'none'; q('reel-posts-nsel').textContent = 'Đã chọn ' + n + ' bài'; }
    function fill() {
      rebuildPages();
      var arr = filtered(), total = allData().length;
      q('reel-posts-cnt').textContent = '(' + arr.length + '/' + total + ' bài)';
      if (!arr.length) { body.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:12px">' + (total ? 'Không có bài khớp bộ lọc.' : 'Chưa có bài. Bấm <b>🔄 Tải bài từ Page</b> để kéo bài đang có trên các page về.') + '</div>'; updBulk(); return; }
      var th = 'text-align:left;padding:7px 8px;border-bottom:2px solid var(--border-color,#eee);font-size:11px;color:var(--text-secondary);position:sticky;top:0;background:var(--bg-secondary,#fff)';
      var td = 'padding:7px 8px;border-bottom:1px solid var(--border-color,#f0f0f0);font-size:12px;vertical-align:top';
      var rows = arr.slice(0, 3000).map(function (x, i) {
        return '<tr>'
          + (manage ? '<td style="' + td + '"><input type="checkbox" class="pchk" data-id="' + esc(x.id) + '" data-pid="' + esc(x.pid) + '"></td>' : '')
          + '<td style="' + td + ';text-align:center;color:var(--text-secondary)">' + (i + 1) + '</td>'
          + '<td style="' + td + ';max-width:320px"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.cap || '') + '">' + (esc(x.cap || '') || '<span style="color:var(--text-secondary)">(không caption)</span>') + '</span></td>'
          + '<td style="' + td + '">' + esc(x.pn || x.pid) + '<br><span style="font:10px Consolas,monospace;color:var(--text-secondary)">' + esc(x.pid) + '</span></td>'
          + '<td style="' + td + ';font:11px Consolas,monospace;color:var(--text-secondary)">' + esc(x.cl || '—') + '</td>'
          + '<td style="' + td + '">' + esc(x.ty || '') + '</td>'
          + '<td style="' + td + '"><span style="color:#16a34a;font-weight:600">● Đã đăng</span></td>'
          + '<td style="' + td + '">' + (x.t ? new Date(x.t).toLocaleString('vi-VN') : '—') + '</td>'
          + '<td style="' + td + '"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><a href="' + esc(x.url || ('https://www.facebook.com/' + x.id)) + '" target="_blank" style="color:var(--primary-accent,#BE185D);white-space:nowrap">🔗 Mở</a><button class="vbtn sec sm pcopy" data-u="' + esc(x.url || ('https://www.facebook.com/' + x.id)) + '" title="Copy link">📋</button>'
          + (manage ? '<button class="vbtn danger sm pdel1" data-id="' + esc(x.id) + '" data-pid="' + esc(x.pid) + '">🗑</button>' : '')
          + '</div></td></tr>';
      }).join('');
      body.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
        + (manage ? '<th style="' + th + ';width:30px"><input type="checkbox" id="reel-posts-all"></th>' : '')
        + '<th style="' + th + ';width:40px">#</th><th style="' + th + '">Nội dung</th><th style="' + th + ';width:170px">Trang / Nhóm</th><th style="' + th + ';width:110px">Token/Clone</th><th style="' + th + ';width:56px">Loại</th><th style="' + th + ';width:90px">Trạng thái</th><th style="' + th + ';width:150px">Đăng lúc</th><th style="' + th + ';width:120px">URL</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>';
      body.querySelectorAll('.pcopy').forEach(function (el) { el.onclick = function () { try { navigator.clipboard.writeText(this.getAttribute('data-u')); this.textContent = '✓'; var b = this; setTimeout(function () { b.textContent = '📋'; }, 900); } catch (e) {} }; });
      if (manage) {
        var all = q('reel-posts-all'); if (all) all.onchange = function () { body.querySelectorAll('.pchk').forEach(function (c) { c.checked = all.checked; }); updBulk(); };
        body.querySelectorAll('.pchk').forEach(function (c) { c.onchange = updBulk; });
        body.querySelectorAll('.pdel1').forEach(function (el) { el.onclick = function () { delOne(this.getAttribute('data-id'), this.getAttribute('data-pid')); }; });
      }
      updBulk();
    }
    // filter events
    q('reel-posts-q').oninput = function () { flt.q = this.value.trim(); fill(); };
    q('reel-posts-fpage').onchange = function () { flt.page = this.value; fill(); };
    q('reel-posts-fty').onchange = function () { flt.ty = this.value; fill(); };
    q('reel-posts-from').onchange = function () { flt.from = this.value; fill(); };
    q('reel-posts-to').onchange = function () { flt.to = this.value; fill(); };
    // tải bài từ page (feed) — gộp vào danh sách
    var syncing = false;
    async function syncPagePosts() {
      if (syncing) { FBSTATSTOP = true; return; }
      syncing = true; FBSTATSTOP = false; var btn = q('reel-posts-sync');
      try { var got = await fetchPagePosts(30, function (i, n) { if (btn) btn.textContent = '⏳ ' + i + '/' + n; }); if (got && got.length) { extra = got; FBPOSTS = got; try { localStorage.setItem('reel-fbposts', JSON.stringify(FBPOSTS)); } catch (e) {} } }
      catch (e) {}
      syncing = false; if (btn) btn.textContent = '🔄 Tải bài từ Page'; fill();
    }
    q('reel-posts-sync').onclick = syncPagePosts;
    // dọn bài trùng (khử id trùng trong lịch sử)
    q('reel-posts-dup').onclick = function () {
      var seen = {}, out = [], dup = 0;
      PHIST.forEach(function (x) { if (seen[x.id]) { dup++; return; } seen[x.id] = 1; out.push(x); });
      if (!dup) { log('Không có bài trùng trong lịch sử.', 'ok'); return; }
      PHIST = out; try { localStorage.setItem('reel-posts', JSON.stringify(PHIST)); } catch (e) {}
      log('🧹 Đã dọn ' + dup + ' bài trùng khỏi lịch sử.', 'ok'); fill();
    };
    // export
    q('reel-posts-exp').onclick = function () {
      var arr = filtered(); function c(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s; }
      var lines = ['STT,Page,PageID,Loại,Nội dung,Thời gian,Link'].concat(arr.map(function (x, i) { return [i + 1, c(x.pn), x.pid, x.ty, c(x.cap || ''), x.t ? new Date(x.t).toLocaleString('vi-VN') : '', x.url || ''].join(','); }));
      var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bai-dang-' + Date.now() + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    function dropId(id) { PHIST = PHIST.filter(function (x) { return x.id !== id; }); extra = extra.filter(function (x) { return x.id !== id; }); FBPOSTS = FBPOSTS.filter(function (x) { return x.id !== id; }); }
    function persistPosts() { try { localStorage.setItem('reel-posts', JSON.stringify(PHIST)); localStorage.setItem('reel-fbposts', JSON.stringify(FBPOSTS)); } catch (e) {} }
    async function delOne(id, pid) {
      if (!confirm('Xoá bài ' + id + ' khỏi Facebook? Không hoàn tác được.')) return;
      var r = await deletePost(id, pid);
      if (r.ok) { dropId(id); persistPosts(); log('🗑 Đã xoá bài ' + id, 'ok'); fill(); }
      else log('🗑 Xoá bài ' + id + ' lỗi: ' + r.err, 'err');
    }
    if (manage) {
      q('reel-posts-del').onclick = async function () {
        var picks = selPicks(); if (!picks.length) return;
        if (!confirm('Xoá ' + picks.length + ' bài khỏi Facebook? Không hoàn tác được.')) return;
        this.disabled = true; var ok = 0, er = 0;
        for (var i = 0; i < picks.length; i++) { var id = picks[i].getAttribute('data-id'), pid = picks[i].getAttribute('data-pid'); var r = await deletePost(id, pid); if (r.ok) { ok++; dropId(id); } else er++; await sleep(400); }
        persistPosts();
        this.disabled = false; log('🗑 Xoá bài: ' + ok + ' OK · ' + er + ' lỗi', er ? 'err' : 'ok'); fill();
      };
      q('reel-posts-cmt').onclick = async function () {
        var picks = selPicks(); if (!picks.length) return;
        var msg = prompt('Nhập comment thả vào ' + picks.length + ' bài đã chọn:'); if (!msg) return;
        this.disabled = true; var ok = 0, er = 0;
        for (var i = 0; i < picks.length; i++) { var r = await addCommentToPost(picks[i].getAttribute('data-id'), picks[i].getAttribute('data-pid'), spin(msg)); if (r.ok) { ok++; bumpCmt(1); } else er++; await sleep(500); }
        this.disabled = false; log('💬 Thêm comment: ' + ok + ' OK · ' + er + ' lỗi', er ? 'err' : 'ok');
      };
    }
    fill();
    // Có page (token) mà chưa có bài nào -> tự kéo bài từ Facebook cho khỏi trống.
    if (!allData().length) { var hasTok = false; CLONES.forEach(function (c) { c.ptok = c.ptok || {}; (c.pages || []).forEach(function (p) { if (c.ptok[p.id]) hasTok = true; }); }); if (hasTok) syncPagePosts(); }
  }

  // Dashboard Thống kê (Tầng 1) — CHỈ số liệu từ tool, không gọi API Facebook. Mở dạng MODAL LỚN cho dễ nhìn.
  // ── Đợt 4: Xem trước phân phối — nội dung sẽ gửi tới từng Page (vòng 1), khớp logic offset tuần tự của engine ──
  function openPreviewModal() {
    var capPool = TPL.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    var cmtPool = CMT.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    var nF = FILES.length, nC = capPool.length, nM = cmtPool.length;
    var vidR = CFG.vidOrder === 'random', capR = CFG.descOrder === 'random', cmtR = CFG.cmtOrder === 'random';
    var rows = [], k = 0;
    CLONES.forEach(function (c) {
      (c.pages || []).forEach(function (p) {
        rows.push({
          pg: (p.name || p.id),
          vid: !nF ? '—' : (vidR ? '(ngẫu nhiên)' : FILES[k % nF].name),
          cap: !nC ? '(không caption)' : (capR ? '(ngẫu nhiên)' : capPool[k % nC]),
          cmt: !CFG.autoComment ? '—' : (!nM ? '(trống)' : (cmtR ? '(ngẫu nhiên)' : cmtPool[k % nM]))
        });
        k++;
      });
    });
    var MAX = 300, shown = rows.slice(0, MAX);
    var td = 'padding:6px 9px;border-bottom:1px solid var(--border-color)';
    var tdEll = td + ';max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    ov.innerHTML = '<div class="reel-modal-card">'
      + '<div class="rsm-head"><div><div class="rsm-title">🔎 Xem trước phân phối</div><div class="rsm-desc">Nội dung sẽ gửi tới từng Page (vòng 1). ' + ((vidR || capR || cmtR) ? 'Có mục đang để <b>Ngẫu nhiên</b> — kết quả thực tế có thể khác bản xem trước.' : 'Phân phối theo thứ tự Page.') + '</div></div><button class="rsm-x" id="reel-pv-x">✕</button></div>'
      + '<div class="rsm-body">' + (rows.length
        ? ('<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
          + ['Page', 'Video/Ảnh', 'Caption', 'Bình luận'].map(function (h) { return '<th style="text-align:left;padding:7px 9px;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:var(--bg-tertiary);z-index:1">' + h + '</th>'; }).join('')
          + '</tr></thead><tbody>'
          + shown.map(function (r) { return '<tr><td style="' + td + '">' + esc(r.pg) + '</td><td style="' + tdEll + '" title="' + esc(r.vid) + '">' + esc(r.vid) + '</td><td style="' + tdEll + '" title="' + esc(r.cap) + '">' + esc(r.cap) + '</td><td style="' + tdEll + '" title="' + esc(r.cmt) + '">' + esc(r.cmt) + '</td></tr>'; }).join('')
          + '</tbody></table>' + (rows.length > MAX ? ('<div style="padding:8px;color:var(--text-secondary);font-size:11.5px">… và ' + (rows.length - MAX) + ' page nữa</div>') : ''))
        : '<div style="padding:16px;color:var(--text-secondary)">Chưa có Page. Chuẩn bị via + Load Page ở tab CLONE/VIA trước.</div>') + '</div>'
      + '<div class="rsm-foot"><span class="rsm-status">' + rows.length + ' page · ' + nF + ' nội dung · ' + nC + ' caption' + (CFG.autoComment ? (' · ' + nM + ' bình luận') : '') + '</span><span class="rsm-foot-btns"><button class="vbtn sec sm" id="reel-pv-close">Đóng</button></span></div>'
      + '</div>';
    ($('reel-panel') || document.body).appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#reel-pv-x').onclick = close; ov.querySelector('#reel-pv-close').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
  }
  function openStatsModal() {
    if ($('reel-stats-ov')) { statsFill(); return; }
    var ov = document.createElement('div');
    ov.id = 'reel-stats-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100006;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    ov.innerHTML = '<div class="reel-modal" style="width:97vw;height:90vh;overflow:auto;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:20px;box-shadow:0 16px 48px rgba(0,0,0,.4);display:flex;flex-direction:column">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex:0 0 auto">'
      + '<div style="font-weight:800;font-size:16px">📊 Thống kê hoạt động</div>'
      + '<span style="display:flex;gap:8px"><button class="vbtn sm" id="reel-stats-fb" title="Kéo Follower / Reach 7 ngày / Tương tác từ Facebook cho các page có token (gọi API insights, có cache).">📈 Số liệu Facebook</button><button class="vbtn sec sm" id="reel-stats-refresh">↻ Làm mới</button><button class="vbtn sec sm" id="reel-stats-x">✕</button></span>'
      + '</div><div id="reel-stats-body" style="flex:1 1 auto;overflow:auto"></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#reel-stats-x').onclick = close;
    ov.querySelector('#reel-stats-refresh').onclick = statsFill;
    ov.querySelector('#reel-stats-fb').onclick = fetchFbStats;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !FBSTATRUN) close(); });
    statsFill();
  }
  function renderStats() { if ($('reel-stats-ov')) statsFill(); }   // giữ tương thích
  function statsFill() {
    var v = document.getElementById('reel-stats-body'); if (!v) return;
    // Gom số liệu
    var nClone = CLONES.length, nPage = 0, nTokPage = 0, doneAll = 0;
    var byKind = { ok: 0, fail: 0, wait: 0, run: 0 };
    var pageRows = [], fbFans = 0, fbReach = 0, fbEng = 0, fbN = 0, fbAge = 0;
    CLONES.forEach(function (c) {
      c.ptok = c.ptok || {};
      (c.pages || []).forEach(function (p) {
        nPage++;
        if (c.ptok[p.id]) nTokPage++;
        var d = DONEMAP[p.id] || 0; doneAll += d;
        var k = (p.kind === 'ok') ? 'ok' : (p.kind === 'fail') ? 'fail' : (p.kind === 'run' || p.kind === 'up' || p.kind === 'fin' || p.kind === 'prep') ? 'run' : 'wait';
        byKind[k] = (byKind[k] || 0) + 1;
        var st = PSTATS[p.id] || null;
        if (st) { fbFans += st.fans || 0; fbReach += st.reach || 0; fbEng += st.eng || 0; fbN++; if (st.t > fbAge) fbAge = st.t; }
        pageRows.push({ id: p.id, name: p.name || '', n: d, fans: st ? st.fans : '', reach: st ? st.reach : '', eng: st ? st.eng : '' });
      });
    });
    pageRows.sort(function (a, b) { return (b.n - a.n) || ((b.fans || 0) - (a.fans || 0)); });
    var okS = OKIDS.length, errS = FAILIDS.length, doneS = DONE, totS = TOTAL;
    var nSched = 0; try { nSched = SCHEDULES.filter(function (s) { return s.status === 'waiting'; }).length; } catch (e) {}
    var postedSess = POSTED.length;
    // Donut TRẠNG THÁI BÀI VIẾT: Đã đăng / Hẹn lịch / Thất bại / Đang xử lý
    var dcats = [{ l: 'Đã đăng', v: doneAll, c: '#22c55e' }, { l: 'Hẹn lịch', v: nSched, c: '#3b82f6' }, { l: 'Thất bại', v: STATC.fail || 0, c: '#ef4444' }, { l: 'Đang xử lý', v: byKind.run, c: '#f59e0b' }];
    var dtot = dcats.reduce(function (a, x) { return a + x.v; }, 0), acc0 = 0;
    var segs = dcats.map(function (x) { var st = acc0 / Math.max(1, dtot) * 360; acc0 += x.v; return x.c + ' ' + st.toFixed(1) + 'deg ' + (acc0 / Math.max(1, dtot) * 360).toFixed(1) + 'deg'; });
    var donut = 'background:conic-gradient(' + (dtot ? segs.join(',') : '#e5e7eb 0 360deg') + ')';
    var donutLegend = dcats.map(function (x) { var pct = dtot ? Math.round(x.v * 100 / dtot) : 0; return '<div style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px"><span style="width:11px;height:11px;border-radius:3px;background:' + x.c + '"></span><span style="flex:1">' + x.l + '</span><b>' + num(x.v) + '</b><span style="color:var(--text-secondary);width:42px;text-align:right">' + pct + '%</span></div>'; }).join('');
    // Biểu đồ hiệu suất đăng bài (14 ngày) — SVG area, không thư viện
    var days = [], _tn = new Date();
    for (var di = 13; di >= 0; di--) { var _d = new Date(_tn.getTime() - di * 86400000); var _k = _d.getFullYear() + '-' + ('0' + (_d.getMonth() + 1)).slice(-2) + '-' + ('0' + _d.getDate()).slice(-2); days.push({ lbl: ('0' + _d.getDate()).slice(-2) + '/' + ('0' + (_d.getMonth() + 1)).slice(-2), v: POSTLOG[_k] || 0 }); }
    var maxV = Math.max(1, days.reduce(function (a, x) { return Math.max(a, x.v); }, 0)), postTotal14 = days.reduce(function (a, x) { return a + x.v; }, 0);
    var W = 560, H = 170, pad = 26;
    var pts = days.map(function (x, i) { return [pad + i * (W - 2 * pad) / 13, H - pad - x.v * (H - 2 * pad) / maxV]; });
    var lineP = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var areaP = 'M' + pad + ' ' + (H - pad) + ' ' + pts.map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' L' + (W - pad) + ' ' + (H - pad) + ' Z';
    var chartSvg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;max-height:220px">'
      + '<defs><linearGradient id="rgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BE185D" stop-opacity="0.30"/><stop offset="1" stop-color="#BE185D" stop-opacity="0"/></linearGradient></defs>'
      + '<path d="' + areaP + '" fill="url(#rgrad)"/><path d="' + lineP + '" fill="none" stroke="#BE185D" stroke-width="2"/>'
      + pts.map(function (p, i) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5" fill="#BE185D"/>' + (i % 2 === 0 ? '<text x="' + p[0].toFixed(1) + '" y="' + (H - 8) + '" font-size="9" fill="#9aa" text-anchor="middle">' + days[i].lbl + '</text>' : ''); }).join('')
      + '</svg>';
    function card(ic, val, label, col) {
      return '<div style="flex:1;min-width:150px;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">'
        + '<div style="display:flex;align-items:center;gap:8px"><span style="width:30px;height:30px;border-radius:9px;background:' + col + '22;color:' + col + ';display:flex;align-items:center;justify-content:center;font-size:15px">' + ic + '</span><span style="font-size:11px;color:var(--text-secondary)">' + label + '</span></div>'
        + '<div style="font-size:26px;font-weight:800;color:' + col + '">' + val + '</div></div>';
    }
    // Bảng page: số bài (tool) + Follower/Reach/Tương tác (Facebook, nếu đã kéo)
    var th = 'text-align:left;padding:6px 8px;border-bottom:2px solid var(--border-color,#eee);font-size:11px;color:var(--text-secondary);position:sticky;top:0;background:var(--bg-secondary,#fff)';
    var td = 'padding:6px 8px;border-bottom:1px solid var(--border-color,#f0f0f0);font-size:12px';
    var rowsHtml = pageRows.map(function (x) {
      return '<tr>'
        + '<td style="' + td + '"><span style="display:block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.name || x.id) + '">' + esc(x.name || x.id) + '</span><span style="font:10px Consolas,monospace;color:var(--text-secondary)">' + esc(x.id) + '</span></td>'
        + '<td style="' + td + ';text-align:right;font-weight:700">' + num(x.n) + '</td>'
        + '<td style="' + td + ';text-align:right">' + (x.fans !== '' ? num(x.fans) : '—') + '</td>'
        + '<td style="' + td + ';text-align:right">' + (x.reach !== '' ? num(x.reach) : '—') + '</td>'
        + '<td style="' + td + ';text-align:right">' + (x.eng !== '' ? num(x.eng) : '—') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td style="' + td + '" colspan="5">Chưa có page.</td></tr>';
    var pageTable = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
      + '<th style="' + th + '">Page</th><th style="' + th + ';text-align:right">Bài</th><th style="' + th + ';text-align:right">Follower</th><th style="' + th + ';text-align:right">Reach 7d</th><th style="' + th + ';text-align:right">Tương tác</th>'
      + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';

    function pill(v2, k, col) {
      return '<div style="flex:1;min-width:120px;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:12px;padding:12px 14px">'
        + '<div style="font-size:22px;font-weight:800;color:' + (col || 'var(--text-primary,#111)') + '">' + v2 + '</div>'
        + '<div style="font-size:11px;color:var(--text-secondary,#888);margin-top:2px">' + k + '</div></div>';
    }
    var lg = function (c, t) { return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;margin-right:12px"><span style="width:10px;height:10px;border-radius:3px;background:' + c + '"></span>' + t + '</span>'; };

    var tongBai = doneAll + nSched + (STATC.fail || 0);
    v.innerHTML = ''
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">'
      + card('📄', num(nPage), 'Tổng Fanpage', '#3b82f6')
      + card('🗂️', num(tongBai), 'Tổng bài', '#8b5cf6')
      + card('✅', num(doneAll), 'Đã đăng', '#22c55e')
      + card('⏰', num(nSched), 'Hẹn lịch', '#0ea5e9')
      + card('💬', num(STATC.cmt || 0), 'Comment', '#f59e0b')
      + (fbN ? (card('👥', num(fbFans), 'Follower', '#2563eb') + card('📡', num(fbReach), 'Reach 7 ngày', '#7c3aed') + card('❤️', num(fbEng), 'Tương tác', '#db2777')) : '')
      + '</div>'
      + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:stretch;margin-bottom:14px">'
      + '  <div style="flex:2;min-width:340px;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:14px;padding:16px">'
      + '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:700;font-size:13px">📈 Hiệu suất đăng bài <span style="font-weight:400;color:var(--text-secondary)">(14 ngày)</span></div><div style="font-size:11px;color:var(--text-secondary)">Tổng 14 ngày: <b style="color:#BE185D">' + num(postTotal14) + '</b> bài</div></div>'
      + chartSvg
      + '  </div>'
      + '  <div style="flex:1;min-width:280px;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:14px;padding:16px">'
      + '    <div style="font-weight:700;font-size:13px;margin-bottom:12px">📊 Phân bổ trạng thái bài viết</div>'
      + '    <div style="display:flex;align-items:center;gap:18px">'
      + '      <div style="position:relative;width:130px;height:130px;border-radius:50%;flex:0 0 auto;' + donut + '"><div style="position:absolute;inset:20px;border-radius:50%;background:var(--bg-secondary,#fff);display:flex;flex-direction:column;align-items:center;justify-content:center"><b style="font-size:22px">' + num(dtot) + '</b><span style="font-size:10px;color:var(--text-secondary)">Tổng bài</span></div></div>'
      + '      <div style="flex:1">' + donutLegend + '</div>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '<div style="background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#eee);border-radius:14px;padding:16px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-weight:700;font-size:13px">📋 Chi tiết theo page</div>' + (fbN ? '<div style="font-size:10.5px;color:var(--text-secondary)">Số liệu FB: ' + (fbAge ? new Date(fbAge).toLocaleString('vi-VN') : '—') + '</div>' : '<div style="font-size:11px;color:var(--text-secondary)">Bấm 📈 Số liệu Facebook để có Follower/Reach/Tương tác</div>') + '</div>'
      + pageTable
      + '</div>';
  }
  // ── TẦNG 2: số liệu Facebook (follower/reach/tương tác) qua API insights — chỉ chạy khi bấm, có cache + delay. ──
  async function fetchPageStat(pageId, token) {
    var out = { fans: 0, reach: 0, eng: 0, ok: false };
    try {
      var r = await graphEB(GVER + '/' + pageId + '?fields=followers_count,fan_count&access_token=' + enc(token), 12000);
      if (r.json && !r.json.error) { out.fans = r.json.followers_count || r.json.fan_count || 0; out.ok = true; }
      var r2 = await graphEB(GVER + '/' + pageId + '/insights?metric=page_impressions_unique,page_post_engagements&period=week&access_token=' + enc(token), 14000);
      if (r2.json && r2.json.data) {
        r2.json.data.forEach(function (m) {
          var val = (m.values && m.values.length) ? (m.values[m.values.length - 1].value || 0) : 0;
          if (m.name === 'page_impressions_unique') out.reach = val;
          if (m.name === 'page_post_engagements') out.eng = val;
        });
        out.ok = true;
      }
    } catch (e) {}
    return out;
  }
  async function fetchFbStats() {
    if (FBSTATRUN) { FBSTATSTOP = true; return; }
    // Gom (pageId, token) từ mọi clone — chỉ page CÓ token page.
    var jobs = [];
    CLONES.forEach(function (c) { c.ptok = c.ptok || {}; (c.pages || []).forEach(function (p) { var t = c.ptok[p.id]; if (t) jobs.push({ id: p.id, tok: t }); }); });
    var btn = document.getElementById('reel-stats-fb');
    if (!jobs.length) { if (btn) btn.textContent = '📈 (chưa có page có token)'; setTimeout(function () { if (btn) btn.textContent = '📈 Số liệu Facebook'; }, 2000); return; }
    FBSTATRUN = true; FBSTATSTOP = false;
    var done = 0, okc = 0;
    for (var i = 0; i < jobs.length && !FBSTATSTOP; i++) {
      if (btn) btn.textContent = '⏳ Đang kéo ' + (done + 1) + '/' + jobs.length + ' (bấm để dừng)';
      var s = await fetchPageStat(jobs[i].id, jobs[i].tok);
      if (s.ok) { PSTATS[jobs[i].id] = { fans: s.fans, reach: s.reach, eng: s.eng, t: Date.now() }; okc++; }
      done++;
      try { localStorage.setItem('reel-pstats', JSON.stringify(PSTATS)); } catch (e) {}
      if (document.getElementById('reel-stats-body')) statsFill();   // cập nhật dần
      if (!FBSTATSTOP && i < jobs.length - 1) await sleep(700 + Math.random() * 500);   // giãn cách tránh rate-limit
    }
    FBSTATRUN = false;
    if (btn) btn.textContent = '📈 Số liệu Facebook';
    log('📈 Số liệu Facebook: ' + okc + '/' + jobs.length + ' page' + (FBSTATSTOP ? ' (đã dừng)' : ''), okc ? 'ok' : 'err');
    if (document.getElementById('reel-stats-body')) statsFill();
  }

  /* ───────────────────────── Video picker ───────────────────────── */
  var PHOTO_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i, VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
  function isPhoto() { return CFG.postType === 'photo'; }
  // Áp dụng loại nội dung (Video/Ảnh) lên giao diện: nhãn, ô số ảnh, accept của input, dọn danh sách khi đổi loại.
  function applyPostType() {
    var ph = isPhoto();
    var rV = document.querySelector('input[name="reel-ptype"][value="video"]'), rP = document.querySelector('input[name="reel-ptype"][value="photo"]');
    if (rV) rV.checked = !ph; if (rP) rP.checked = ph;
    var lb = $('reel-vidlabel'); if (lb) lb.innerHTML = ph ? '🖼️ Ảnh cần đăng <span style="opacity:.55;font-weight:400">(1 hoặc nhiều ảnh)</span>' : '🎬 Video hoặc ảnh cần đăng';
    var box = $('reel-photobox'); if (box) box.style.display = ph ? '' : 'none';
    var pd = $('reel-pickdir'); if (pd) pd.textContent = ph ? '📁 Chọn ảnh từ máy tính' : '📁 Chọn video từ máy tính';
    var pp = $('reel-photoper'); if (pp) pp.value = CFG.photoPer || 1;
    var inp = $('reel-vidfile'); if (inp) inp.setAttribute('accept', 'video/*,image/*');
    // Đổi loại thì danh sách cũ không dùng được (video↔ảnh) → dọn để tránh nhầm.
    if ((ph && FILES.some(function (f) { return VIDEO_EXT.test(f.name); })) || (!ph && FILES.some(function (f) { return PHOTO_EXT.test(f.name); }))) { FILES = []; BUF = {}; }
    updateVidInfo();
  }
  // Chọn THẲNG file (đa chọn) — thấy file ngay, chọn nhiều bằng Ctrl/Shift hoặc Ctrl+A. Rõ ràng cho cả video lẫn ảnh.
  async function pickVideos() {
    var inp = $('reel-vidfile'); if (inp) { try { inp.value = ''; } catch (e) {} inp.click(); }
  }
  // Chọn CẢ THƯ MỤC (tuỳ chọn — cho ai có sẵn 1 thư mục nhiều video). Đọc mọi file đúng định dạng bên trong.
  async function pickFolder() {
    if (!window.showDirectoryPicker) { pickVideos(); return; }
    try {
      var dir = await window.showDirectoryPicker();
      var out = [];
      for await (var ent of dir.values()) { if (ent.kind === 'file' && (PHOTO_EXT.test(ent.name) || VIDEO_EXT.test(ent.name))) out.push(ent); }
      out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
      var n = addMediaHandles(out);
      log('Đã thêm từ thư mục: ' + n + ' media (mỗi media = 1 bài).', n ? 'ok' : 'err');
    } catch (e) { if (e && e.name === 'AbortError') return; log('Chọn thư mục lỗi: ' + ((e && e.message) || e), 'err'); }
  }
  /* ── Đợt 2: danh sách tệp (thumbnail · dung lượng · thời lượng/tỷ lệ · trạng thái · xoá/thay · kéo sắp xếp) ── */
  function fmtBytes(n) { if (n == null) return '—'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; }
  function fmtDur(s) { if (s == null) return ''; s = Math.round(s); var m = Math.floor(s / 60), ss = s % 60; return m + ':' + (ss < 10 ? '0' : '') + ss; }
  function _gcd(a, b) { return b ? _gcd(b, a % b) : a; }
  function aspectStr(w, h) { if (!w || !h) return ''; var g = _gcd(w, h) || 1; return (w / g) + ':' + (h / g); }
  var _FILE_WARN = 300 * 1048576; // >300MB: cảnh báo tệp lớn
  function fileStatus(f) {
    var RX = isPhoto() ? PHOTO_EXT : VIDEO_EXT;
    if (!RX.test(f.name)) return { cls: 'err', t: 'Sai định dạng' };
    if (f._size != null && f._size > _FILE_WARN) return { cls: 'warn', t: 'Tệp lớn' };
    return { cls: 'ok', t: 'Hợp lệ' };
  }
  function fileInfoText(f) {
    var st = fileStatus(f);
    return (f._size != null ? fmtBytes(f._size) : '…') + (f._dur ? (' · ' + fmtDur(f._dur)) : '') + (f._w && f._h ? (' · ' + aspectStr(f._w, f._h)) : '') + ' · <span class="st ' + st.cls + '">' + st.t + '</span>';
  }
  function updateVidInfo() {
    var word = isPhoto() ? 'ảnh' : 'video', tot = 0, known = 0;
    FILES.forEach(function (f) { if (f._size != null) { tot += f._size; known++; } });
    var e = $('reel-vidinfo');
    if (e) e.textContent = FILES.length ? ('Đã chọn ' + FILES.length + ' ' + word + (known ? (' · ' + fmtBytes(tot)) : '')) : ('Chưa chọn ' + word);
    try { syncPosts(); } catch (er) {}
    renderFileList(); renderPostList(); updateSummary();
  }
  // ── Danh sách bài đăng (PostItem): media + caption gắn cặp, sửa/xoá/kéo theo bài ──
  function renderPostList() {
    var tb = $('reel-posts-body'); if (!tb) return;
    try { syncPosts(); } catch (e) {}   // luôn dọn bài rác (media không hợp lệ) trước khi vẽ
    var ready = 0, warn = 0, bad = 0;
    tb.innerHTML = POSTS.length ? POSTS.map(function (post, i) {
      var f = post.media, st = postStatus(post);
      if (st.cls === 'ready') ready++; else if (st.cls === 'warning') warn++; else bad++;
      var isImgM = f && (f.isAlbum || PHOTO_EXT.test(f.name));
      var thumb = f && f._thumb ? '<img src="' + f._thumb + '" style="width:100%;height:100%;object-fit:cover">' : (isImgM ? '🖼️' : '🎬');
      var info = f ? (f.isAlbum ? ('Album · ' + (f._n || (f.files || []).length) + ' ảnh' + (f._size != null ? (' · ' + fmtBytes(f._size)) : '')) : ((isImgM ? 'Ảnh' : 'Reel') + (f._dur ? (' · ' + fmtDur(f._dur)) : '') + (f._w && f._h ? (' · ' + aspectStr(f._w, f._h)) : '') + (f._size != null ? (' · ' + fmtBytes(f._size)) : ''))) : '';
      var cap = String(post.cap || '').trim();
      var capHtml = cap ? esc(cap.length > 80 ? cap.slice(0, 80) + '…' : cap) : '<span style="color:var(--danger-color)">Chưa có nội dung</span>';
      var np = (post.pages || []).length;
      var pgHtml;
      if (np) {
        var names = post.pages.slice(0, 2).map(function (id) { return '<span class="pgchip">' + esc(pageNameById(id)) + '</span>'; }).join('');
        pgHtml = '<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center"><b style="font-size:11.5px">' + np + ' Page</b>' + names + (np > 2 ? ('<span class="pgchip">+' + (np - 2) + '</span>') : '') + '<button class="vbtn sec sm" data-pg="' + i + '" style="margin-left:auto">Sửa</button></div>';
      } else {
        pgHtml = '<button class="vbtn sec sm" data-pg="' + i + '">＋ Chọn Fanpage</button>';
      }
      return '<tr data-i="' + i + '" draggable="true">'
        + '<td class="tc"><input type="checkbox" class="pbck" data-i="' + i + '"' + (post._sel ? ' checked' : '') + '></td>'
        + '<td class="tc">' + (i + 1) + '</td>'
        + '<td>' + (f
          ? ('<div style="display:flex;gap:9px;align-items:center"><span class="drag" title="Kéo để sắp xếp" style="cursor:grab;color:var(--text-secondary)">⠿</span><span style="width:46px;height:46px;border-radius:8px;background:var(--bg-tertiary);flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px">' + thumb + '</span><div style="min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">' + esc(f.name) + '</div><div style="font-size:10.5px;color:var(--text-secondary)">' + info + '</div></div><button class="vbtn sec sm" data-media="' + i + '" title="Thay media" style="margin-left:auto">↻</button></div>')
          : ('<div style="display:flex;gap:9px;align-items:center"><span class="drag" style="cursor:grab;color:var(--text-secondary)">⠿</span><button class="vbtn sec sm" data-media="' + i + '">＋ Chọn video/ảnh</button></div>')) + '</td>'
        + '<td style="max-width:320px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">' + capHtml + '</div><button class="vbtn sec sm" data-edit="' + i + '">✏️ Sửa content</button></td>'
        + '<td>' + pgHtml + '</td>'
        + '<td><span class="pst ' + st.cls + '">' + st.t + '</span></td>'
        + '<td style="white-space:nowrap"><button class="vbtn sec sm" data-prev="' + i + '" title="Xem trước">👁</button> <button class="vbtn sec sm" data-edit="' + i + '" title="Sửa bài">✏️</button> <button class="vbtn sec sm" data-dup="' + i + '" title="Nhân đôi bài">⧉</button> <button class="vbtn sec sm" data-del="' + i + '" title="Xóa bài">🗑</button></td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="7" style="padding:16px;color:var(--text-secondary)">Chưa có bài đăng. Bấm <b>📁 Chọn video/ảnh</b> phía trên để thêm.</td></tr>';
    tb.querySelectorAll('[data-edit]').forEach(function (el) { el.onclick = function () { editPost(+this.getAttribute('data-edit')); }; });
    tb.querySelectorAll('[data-pg]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); pickPages([POSTS[+this.getAttribute('data-pg')]]); }; });
    tb.querySelectorAll('.pbck').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); POSTS[+this.getAttribute('data-i')]._sel = this.checked; updatePbBulk(); }; });
    // Thanh công cụ tab Bài đăng.
    var addb = $('reel-pb-addmedia'); if (addb) addb.onclick = pickVideos;
    var fdb = $('reel-pb-folder'); if (fdb) fdb.onclick = pickFolder;
    var ccb = $('reel-pb-cmtcfg'); if (ccb) ccb.onclick = openCmtConfig;
    var allck = $('reel-pb-all'); if (allck) { allck.checked = POSTS.length > 0 && POSTS.every(function (p) { return p._sel; }); allck.onclick = function () { var v = this.checked; POSTS.forEach(function (p) { p._sel = v; }); renderPostList(); }; }
    var bd = $('reel-pb-bulkdel'); if (bd) bd.onclick = function () { var sel = POSTS.filter(function (p) { return p._sel; }); if (!sel.length) { log('Chưa chọn bài.', 'err'); return; } if (!confirm('Xóa ' + sel.length + ' bài đã chọn?')) return; POSTS = POSTS.filter(function (p) { return !p._sel; }); BUF = {}; updateVidInfo(); };
    var bp = $('reel-pb-bulkpage'); if (bp) bp.onclick = function () { var sel = POSTS.filter(function (p) { return p._sel; }); if (!sel.length) { log('Chưa chọn bài.', 'err'); return; } pickPages(sel); };
    tb.querySelectorAll('[data-prev]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); openPreviewPost(+this.getAttribute('data-prev')); }; });
    tb.querySelectorAll('[data-media]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); pickMediaFor(+this.getAttribute('data-media')); }; });
    tb.querySelectorAll('[data-del]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); var i = +this.getAttribute('data-del'); if (!confirm('Xóa bài ' + (i + 1) + '?')) return; POSTS.splice(i, 1); BUF = {}; updateVidInfo(); }; });
    // Nhân đôi bài: copy media (dùng chung file) + caption + Fanpage + cấu hình, chèn ngay dưới.
    tb.querySelectorAll('[data-dup]').forEach(function (el) { el.onclick = function (e) {
      e.stopPropagation(); var i = +this.getAttribute('data-dup'); var src = POSTS[i]; if (!src) return;
      var c = {}; for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) c[k] = src[k];
      c.pages = (src.pages || []).slice(); c._sel = false;
      POSTS.splice(i + 1, 0, c); BUF = {}; updateVidInfo();
      log('Đã nhân đôi bài #' + (i + 1) + '.', 'ok');
    }; });
    var addp = $('reel-pb-addpost'); if (addp) addp.onclick = addEmptyPost;
    var adalb = $('reel-pb-addalbum'); if (adalb) adalb.onclick = addAlbumPost;
    var pc = $('reel-pb-precheck'); if (pc) pc.onclick = openPrecheckModal;
    var imb = $('reel-pb-import'); if (imb) imb.onclick = openImportCaption;
    var cp = $('reel-pb-copypage'); if (cp) cp.onclick = function () {
      var src = POSTS.find(function (p) { return p.pages && p.pages.length; });
      if (!src) { log('Chưa có bài nào chọn Fanpage để sao chép.', 'err'); return; }
      var sel = POSTS.filter(function (p) { return p._sel && p !== src; });
      if (!sel.length) { log('Chọn (tick) các bài muốn áp dụng Fanpage của bài đầu.', 'err'); return; }
      if (!confirm('Sao chép ' + src.pages.length + ' Fanpage của bài #' + (POSTS.indexOf(src) + 1) + ' cho ' + sel.length + ' bài đã chọn (thay danh sách hiện có)?')) return;
      sel.forEach(function (p) { p.pages = src.pages.slice(); }); renderPostList(); updateSummary();
      log('Đã sao chép Fanpage cho ' + sel.length + ' bài.', 'ok');
    };
    updatePbBulk();
    // Kéo sắp xếp: đổi thứ tự POSTS (media + caption + Fanpage + cấu hình đi CÙNG bài).
    var dragI = null;
    tb.querySelectorAll('tr[data-i]').forEach(function (row) {
      row.addEventListener('dragstart', function () { dragI = +this.getAttribute('data-i'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); });
      row.addEventListener('drop', function (e) {
        e.preventDefault(); var to = +this.getAttribute('data-i'); if (dragI == null || dragI === to) return;
        var mv = POSTS.splice(dragI, 1)[0]; POSTS.splice(to, 0, mv); BUF = {}; updateVidInfo();
      });
    });
    var e2 = $('reel-tab-posts'); if (e2) e2.textContent = '(' + POSTS.length + ')';
    var gs = groupStats();
    var s = $('reel-posts-stat'); if (s) s.innerHTML = '<b>' + gs.n + '</b> nội dung · <b style="color:var(--primary-accent)">' + gs.luot + '</b> lượt đăng · <b>' + gs.pages + '</b> Fanpage' + (warn ? (' · <span style="color:#d97706">' + warn + ' cần bổ sung</span>') : '') + (bad ? (' · <span style="color:var(--danger-color)">' + bad + ' lỗi</span>') : '');
  }
  // Modal chọn Fanpage cho 1 bài (PostGroup). Lưu danh sách pageId vào post.pages.
  function pickPages(posts, opts) {
    opts = opts || {}; posts = posts || [];
    if (!posts.length && !opts.onSave) return;
    var multi = posts.length > 1, post = posts[0] || null;
    var all = allPagesFlat();
    var sel = {};
    if (opts.preset) opts.preset.forEach(function (id) { sel[id] = 1; });
    else if (!multi && post) (post.pages || []).forEach(function (id) { sel[id] = 1; });
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    function rowsHtml(filter) {
      var q = (filter || '').toLowerCase();
      var list = all.filter(function (p) { return !q || (p.name.toLowerCase().indexOf(q) >= 0 || p.id.indexOf(q) >= 0 || (p.cloneName + '').toLowerCase().indexOf(q) >= 0); });
      if (!list.length) return '<tr><td colspan="6" style="padding:14px;color:var(--text-secondary)">Không có Page. Load Page ở tab "Tài khoản & Page" trước.</td></tr>';
      return list.map(function (p) {
        var bad = p.perm === 'noperm';
        return '<tr data-id="' + p.id + '"' + (bad ? '' : ' style="cursor:pointer;user-select:none"') + '>'
          + '<td class="tc"><input type="checkbox" class="pgck" data-id="' + p.id + '"' + (sel[p.id] ? ' checked' : '') + (bad ? ' disabled title="Thiếu quyền đăng"' : '') + '></td>'
          + '<td>' + esc(p.name || '(chưa có tên)') + '</td>'
          + '<td style="font:11px Consolas,monospace;color:var(--text-secondary)">' + esc(p.id) + '</td>'
          + '<td>' + esc(p.cloneName) + '</td>'
          + '<td><span class="pst ' + (p.tok ? 'ready' : 'warning') + '">' + (p.tok ? 'Có token' : 'Chưa có token') + '</span></td>'
          + '<td><span class="pst ' + (bad ? 'invalid' : 'ready') + '">' + (bad ? 'Thiếu quyền' : (p.perm === 'perm' ? 'Có quyền' : 'Chưa kiểm tra')) + '</span></td>'
          + '</tr>';
      }).join('');
    }
    ov.innerHTML = '<div class="reel-modal-card" style="width:min(760px,94vw)">'
      + '<div class="rsm-head"><div><div class="rsm-title">' + (opts.title || (multi ? ('Gán Fanpage cho ' + posts.length + ' bài đã chọn') : ('Chọn Fanpage cho bài đăng ' + (POSTS.indexOf(post) + 1)))) + '</div><div class="rsm-desc">' + (opts.desc || (multi ? 'Danh sách chọn sẽ THAY THẾ Fanpage hiện có của các bài này.' : (post ? (esc(post.media ? post.media.name : '—') + ' · ' + esc((String(post.cap || '').trim().slice(0, 50)) || 'chưa có content')) : ''))) + '</div></div><button class="rsm-x" id="pg-x">✕</button></div>'
      + '<div style="padding:10px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border-color)"><input id="pg-search" placeholder="Tìm theo tên / ID / clone…" style="flex:1;min-width:180px;padding:7px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit"><button class="vbtn sec sm" id="pg-all">Chọn tất cả</button><button class="vbtn sec sm" id="pg-none">Bỏ chọn</button></div>'
      + '<div class="rsm-body" style="padding:0"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
      + ['', 'Fanpage', 'Page ID', 'Clone/Via', 'Token', 'Quyền đăng'].map(function (h, k) { return '<th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:var(--bg-tertiary)' + (k === 0 ? ';width:38px;text-align:center' : '') + '">' + h + '</th>'; }).join('')
      + '</tr></thead><tbody id="pg-body">' + rowsHtml('') + '</tbody></table></div>'
      + '<div class="rsm-foot"><span class="rsm-status" id="pg-count"></span><span class="rsm-foot-btns" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">'
      + (opts.onSave ? '' : '<button class="vbtn sec sm" id="pg-setdef" title="Lưu danh sách đang tick làm Fanpage mặc định cho bài thêm mới">⭐ Đặt làm mặc định</button><button class="vbtn sec sm" id="pg-applyall" title="Áp danh sách đang tick cho TẤT CẢ bài">⚡ Gán cho tất cả bài</button>')
      + '<button class="vbtn sec sm" id="pg-cancel">Hủy</button><button class="vbtn sm" id="pg-save">Lưu Fanpage' + (multi || opts.onSave ? '' : ' (bài này)') + '</button></span></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var body = ov.querySelector('#pg-body'), cnt = ov.querySelector('#pg-count');
    function updCount() { var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length; cnt.textContent = 'Đã chọn ' + n + '/' + all.length + ' Fanpage'; }
    updCount();
    body.addEventListener('change', function (e) { var ck = e.target.closest('.pgck'); if (ck) { if (ck.checked) sel[ck.getAttribute('data-id')] = 1; else delete sel[ck.getAttribute('data-id')]; updCount(); } });
    // Bấm vào cả DÒNG là tự tích/bỏ tích ô (đỡ phải trúng ô nhỏ).
    body.addEventListener('click', function (e) {
      if (e.target.closest('.pgck') || e.target.tagName === 'INPUT') return;
      var tr = e.target.closest('tr[data-id]'); if (!tr) return;
      var ck = tr.querySelector('.pgck'); if (!ck || ck.disabled) return;
      ck.checked = !ck.checked; ck.dispatchEvent(new Event('change', { bubbles: true }));
    });
    ov.querySelector('#pg-search').addEventListener('input', function () { body.innerHTML = rowsHtml(this.value); });
    ov.querySelector('#pg-all').onclick = function () { all.forEach(function (p) { if (p.perm !== 'noperm') sel[p.id] = 1; }); body.querySelectorAll('.pgck:not([disabled])').forEach(function (c) { c.checked = true; }); updCount(); };
    ov.querySelector('#pg-none').onclick = function () { sel = {}; body.querySelectorAll('.pgck').forEach(function (c) { c.checked = false; }); updCount(); };
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#pg-x').onclick = close; ov.querySelector('#pg-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#pg-save').onclick = function () {
      var chosen = Object.keys(sel).filter(function (k) { return sel[k]; });
      if (opts.onSave) { opts.onSave(chosen); close(); return; }
      if (multi) { if (!confirm('Thay danh sách Fanpage của ' + posts.length + ' bài bằng ' + chosen.length + ' Fanpage đã chọn?')) return; posts.forEach(function (p) { p.pages = chosen.slice(); }); }
      else post.pages = chosen;
      renderPostList(); updateSummary(); close();
    };
    var applyAll = ov.querySelector('#pg-applyall');
    if (applyAll) applyAll.onclick = function () {
      var chosen = Object.keys(sel).filter(function (k) { return sel[k]; });
      if (!POSTS.length) { log('Chưa có bài nào.', 'err'); return; }
      if (!confirm('Áp ' + chosen.length + ' Fanpage đang chọn cho TẤT CẢ ' + POSTS.length + ' bài (thay danh sách hiện có)?')) return;
      POSTS.forEach(function (p) { p.pages = chosen.slice(); });
      renderPostList(); updateSummary(); close();
      log('Đã gán ' + chosen.length + ' Fanpage cho ' + POSTS.length + ' bài.', 'ok');
    };
    var setDef = ov.querySelector('#pg-setdef');
    if (setDef) setDef.onclick = function () {
      var chosen = Object.keys(sel).filter(function (k) { return sel[k]; });
      DEFAULT_PAGES = chosen; saveDefaultPages();
      log(chosen.length ? ('Đã đặt ' + chosen.length + ' Fanpage mặc định cho bài thêm mới.') : 'Đã tắt Fanpage mặc định.', 'ok');
    };
  }
  // Modal "Kiểm tra trước khi đăng": tổng hợp trạng thái + lỗi theo từng bài.
  function openPrecheckModal() {
    var ready = 0, warn = 0, bad = 0, issues = [];
    var td = 'padding:6px 9px;border-bottom:1px solid var(--border-color)';
    var body = POSTS.map(function (p, i) {
      var st = postStatus(p), n = i + 1, np = (p.pages || []).length;
      if (st.cls === 'ready') ready++; else if (st.cls === 'warning') warn++; else bad++;
      if (!p.media) issues.push('✕ Bài ' + n + ': chưa có media (video/ảnh) — không thể đăng.');
      if (!np) issues.push('✕ Bài ' + n + ': chưa chọn Fanpage — không thể đăng.');
      if (p.media && !String(p.cap || '').trim()) issues.push('⚠ Bài ' + n + ': chưa có nội dung (vẫn đăng được, không caption).');
      return '<tr><td class="tc" style="' + td + '">' + n + '</td>'
        + '<td style="' + td + ';max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.media ? p.media.name : '— chưa có') + '</td>'
        + '<td style="' + td + '">' + (String(p.cap || '').trim() ? 'Đã có' : '<span style="color:#d97706">Chưa có</span>') + '</td>'
        + '<td class="tc" style="' + td + '">' + (np || '<span style="color:var(--danger-color)">0</span>') + '</td>'
        + '<td class="tc" style="' + td + '">' + np + '</td>'
        + '<td style="' + td + '"><span class="pst ' + st.cls + '">' + st.t + '</span></td></tr>';
    }).join('') || '<tr><td colspan="6" style="padding:14px;color:var(--text-secondary)">Chưa có bài đăng.</td></tr>';
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    ov.innerHTML = '<div class="reel-modal-card" style="width:min(820px,94vw)">'
      + '<div class="rsm-head"><div><div class="rsm-title">🔎 Kiểm tra trước khi đăng</div><div class="rsm-desc">Tổng <b>' + POSTS.length + '</b> bài · <b style="color:var(--success-color)">' + ready + '</b> sẵn sàng · <b style="color:#d97706">' + warn + '</b> cảnh báo · <b style="color:var(--danger-color)">' + bad + '</b> không hợp lệ</div></div><button class="rsm-x" id="pc-x">✕</button></div>'
      + '<div class="rsm-body">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
      + ['STT', 'Video/Ảnh', 'Content', 'Fanpage', 'Lượt', 'Trạng thái'].map(function (h, k) { return '<th style="text-align:' + (k === 0 || k === 3 || k === 4 ? 'center' : 'left') + ';padding:7px 9px;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:var(--bg-tertiary)">' + h + '</th>'; }).join('')
      + '</tr></thead><tbody>' + body + '</tbody></table>'
      + (issues.length ? ('<div style="margin-top:14px"><div style="font-weight:700;font-size:12.5px;margin-bottom:6px">Chi tiết cần xử lý</div>' + issues.map(function (m) { return '<div style="font-size:12px;padding:4px 0;color:' + (m[0] === '✕' ? 'var(--danger-color)' : '#d97706') + '">' + esc(m) + '</div>'; }).join('') + '</div>') : '<div style="margin-top:14px;color:var(--success-color);font-weight:600">✓ Tất cả bài đều hợp lệ.</div>')
      + '</div>'
      + '<div class="rsm-foot"><span class="rsm-status">Bài không có media hoặc chưa chọn Fanpage sẽ bị bỏ qua khi đăng.</span><span class="rsm-foot-btns"><button class="vbtn sec sm" id="pc-close">Đóng</button></span></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#pc-x').onclick = close; ov.querySelector('#pc-close').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
  }
  // Modal "Xem trước bài" — mô phỏng bài Facebook (page + caption + media + bình luận). Có Bài trước/sau.
  function openPreviewPost(i) {
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    function render(idx) {
      var p = POSTS[idx]; if (!p) return;
      var f = p.media, pgId = (p.pages || [])[0], pgName = pgId ? pageNameById(pgId) : '(chưa chọn Fanpage)';
      var cap = String(p.cap || '').trim() || '(chưa có nội dung)';
      var media = f && f._thumb ? '<img src="' + f._thumb + '" style="width:100%;max-height:420px;object-fit:contain;background:#000;border-radius:10px">' : '<div style="height:260px;display:flex;align-items:center;justify-content:center;background:var(--bg-tertiary);border-radius:10px;font-size:34px">' + (isPhoto() ? '🖼️' : '🎬') + '</div>';
      var cmt = (CFG.autoComment && (CMT || []).some(function (s) { return String(s || '').trim(); })) ? esc((CMT.filter(function (s) { return String(s || '').trim(); })[0] || '').slice(0, 120)) : '';
      ov.querySelector('#pv-card').innerHTML =
        '<div class="rsm-head"><div><div class="rsm-title">Xem trước bài đăng ' + (idx + 1) + ' / ' + POSTS.length + '</div><div class="rsm-desc">' + esc(f ? f.name : '— chưa có media') + '</div></div><button class="rsm-x" id="pv-x">✕</button></div>'
        + '<div class="rsm-body"><div style="max-width:420px;margin:0 auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:12px">'
        + '<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px"><div style="width:38px;height:38px;border-radius:50%;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center">📄</div><div><div style="font-weight:700;font-size:13px">' + esc(pgName) + '</div><div style="font-size:10.5px;color:var(--text-secondary)">' + (p.schedule && p.schedule.publishAt ? esc(p.schedule.publishAt) : 'Đăng ngay') + ' · 🌐</div></div></div>'
        + '<div style="font-size:13px;line-height:1.5;white-space:pre-wrap;margin-bottom:9px">' + esc(cap) + '</div>'
        + media
        + '<div style="display:flex;gap:22px;justify-content:space-around;color:var(--text-secondary);font-size:12.5px;padding:9px 0 3px;margin-top:8px;border-top:1px solid var(--border-color)"><span>👍 Thích</span><span>💬 Bình luận</span><span>↗ Chia sẻ</span></div>'
        + (cmt ? ('<div style="margin-top:8px;background:var(--bg-tertiary);border-radius:9px;padding:7px 10px;font-size:12px"><b>' + esc(pgName) + '</b> ' + cmt + '</div>') : '')
        + (p.pages && p.pages.length > 1 ? ('<div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">+ đăng lên ' + (p.pages.length - 1) + ' Fanpage khác</div>') : '')
        + '</div></div>'
        + '<div class="rsm-foot"><span class="rsm-status">Fanpage: ' + ((p.pages || []).length) + '</span><span class="rsm-foot-btns"><button class="vbtn sec sm" id="pv-prev"' + (idx <= 0 ? ' disabled' : '') + '>← Bài trước</button><button class="vbtn sec sm" id="pv-next"' + (idx >= POSTS.length - 1 ? ' disabled' : '') + '>Bài tiếp →</button></span></div>';
      ov.querySelector('#pv-x').onclick = close;
      var pv = ov.querySelector('#pv-prev'); if (pv) pv.onclick = function () { render(idx - 1); };
      var nx = ov.querySelector('#pv-next'); if (nx) nx.onclick = function () { render(idx + 1); };
    }
    ov.innerHTML = '<div class="reel-modal-card" id="pv-card" style="width:min(520px,94vw)"></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    render(i);
  }
  // Nhập caption cho các bài: (1) dán CSV "tên_file,caption[,bình luận]"; (2) chọn nhiều .txt theo tên file.
  // Ghép theo TÊN MEDIA (bỏ đuôi). Không tự ghép caption không khớp.
  function baseName(s) { return String(s || '').replace(/\.[^.]+$/, '').trim().toLowerCase(); }
  function applyCaptionMap(map) {
    // map: { baseName -> {cap, cmt?} }
    var matched = 0, unmatched = [];
    var byBase = {}; POSTS.forEach(function (p) { if (p.media) byBase[baseName(p.media.name)] = p; });
    Object.keys(map).forEach(function (bn) {
      var p = byBase[bn];
      if (p) { p.cap = map[bn].cap; p.custom = true; if (map[bn].cmt) { p.commentMode = 'custom'; p.commentText = map[bn].cmt; } matched++; }
      else unmatched.push(bn);
    });
    renderPostList(); updateSummary();
    return { matched: matched, unmatched: unmatched };
  }
  function openImportCaption() {
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    ov.innerHTML = '<div class="reel-modal-card" style="width:min(640px,94vw);height:auto;max-height:90vh">'
      + '<div class="rsm-head"><div><div class="rsm-title">📄 Nhập caption cho các bài</div><div class="rsm-desc">Ghép theo TÊN media (bỏ đuôi). Caption không khớp tên sẽ không được ghép.</div></div><button class="rsm-x" id="im-x">✕</button></div>'
      + '<div class="rsm-body">'
      + '<div style="font-weight:700;font-size:12.5px;margin-bottom:5px">Cách 1 — Dán CSV / Excel (mỗi dòng: <code>tên_file,caption,bình luận</code>)</div>'
      + '<textarea id="im-csv" style="width:100%;height:130px;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12px Consolas,monospace" placeholder="video_01.mp4,Nội dung bài 1,Bình luận 1&#10;video_02.mp4,Nội dung bài 2&#10;(ngăn cách bằng dấu phẩy hoặc TAB · dòng đầu có thể là tiêu đề media_file,caption sẽ tự bỏ qua)"></textarea>'
      + '<div style="margin-top:7px;display:flex;gap:7px;flex-wrap:wrap"><button class="vbtn sm" id="im-csv-go">Ghép từ CSV</button><button class="vbtn sec sm" id="im-fill">Điền mẫu vào ô</button><button class="vbtn sec sm" id="im-dl">📥 Tải file mẫu (.csv)</button></div>'
      + '<div style="font-weight:700;font-size:12.5px;margin:16px 0 5px;padding-top:12px;border-top:1px solid var(--border-color)">Cách 2 — Chọn nhiều file .txt (mỗi .txt ↔ media cùng tên)</div>'
      + '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:7px">VD: <code>san_pham_001.mp4</code> ↔ <code>san_pham_001.txt</code>. Nội dung .txt = caption của bài đó.</div>'
      + '<button class="vbtn sm" id="im-txt-go">📁 Chọn file .txt</button>'
      + '<div id="im-report" style="margin-top:12px;font-size:12px"></div>'
      + '</div>'
      + '<div class="rsm-foot"><span class="rsm-status"></span><span class="rsm-foot-btns"><button class="vbtn sec sm" id="im-close">Đóng</button></span></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var rep = ov.querySelector('#im-report');
    function report(r) { rep.innerHTML = '<span style="color:var(--success-color);font-weight:700">✓ Ghép ' + r.matched + ' bài</span>' + (r.unmatched.length ? ('<div style="color:#d97706;margin-top:5px">Không tìm thấy media khớp (' + r.unmatched.length + '): ' + r.unmatched.slice(0, 20).map(esc).join(', ') + (r.unmatched.length > 20 ? '…' : '') + '</div>') : ''); }
    ov.querySelector('#im-csv-go').onclick = function () {
      var text = ov.querySelector('#im-csv').value, map = {};
      text.split(/\r?\n/).forEach(function (ln) {
        ln = ln.trim(); if (!ln) return;
        var sepIdx = ln.search(/[,\t]/); if (sepIdx < 0) return;
        var mf = ln.slice(0, sepIdx).trim().replace(/^"|"$/g, ''); var rest = ln.slice(sepIdx + 1);
        if (/^media_?file$/i.test(mf)) return; // bỏ dòng tiêu đề
        // caption tới dấu phẩy/tab tiếp theo là bình luận (tùy chọn)
        var sep2 = rest.search(/[,\t]/); var cap, cmt = '';
        if (sep2 >= 0) { cap = rest.slice(0, sep2); cmt = rest.slice(sep2 + 1).replace(/[,\t].*$/, ''); } else cap = rest;
        cap = cap.trim().replace(/^"|"$/g, ''); cmt = cmt.trim().replace(/^"|"$/g, '');
        if (mf) map[baseName(mf)] = { cap: cap, cmt: cmt };
      });
      if (!Object.keys(map).length) { rep.innerHTML = '<span style="color:var(--danger-color)">Không đọc được dòng nào. Định dạng: tên_file,caption</span>'; return; }
      report(applyCaptionMap(map));
    };
    ov.querySelector('#im-txt-go').onclick = function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.txt,text/plain'; inp.multiple = true;
      inp.onchange = async function () {
        var map = {};
        for (var i = 0; i < this.files.length; i++) { var file = this.files[i]; try { var t = await file.text(); map[baseName(file.name)] = { cap: t.trim() }; } catch (e) {} }
        if (!Object.keys(map).length) { rep.innerHTML = '<span style="color:var(--danger-color)">Không đọc được file .txt nào.</span>'; return; }
        report(applyCaptionMap(map));
      };
      inp.click();
    };
    // File mẫu: lấy theo TÊN media thật đang có (nếu có) để người dùng dễ hình dung.
    function sampleText() {
      var names = POSTS.map(function (p) { return p.media && p.media.name; }).filter(Boolean).slice(0, 3);
      if (!names.length) names = ['video_01.mp4', 'video_02.mp4', 'video_03.mp4'];
      return 'media_file,caption,comment\n' + names.map(function (n, i) { return n + ',Nội dung bài ' + (i + 1) + ' #hashtag,Bình luận ' + (i + 1); }).join('\n');
    }
    ov.querySelector('#im-fill').onclick = function () { ov.querySelector('#im-csv').value = sampleText(); };
    ov.querySelector('#im-dl').onclick = function () {
      try { var blob = new Blob(['﻿' + sampleText()], { type: 'text/csv;charset=utf-8' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kenzi-caption-mau.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); } catch (e) { log('Tải mẫu lỗi.', 'err'); }
    };
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#im-x').onclick = close; ov.querySelector('#im-close').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
  }
  function updatePbBulk() {
    var n = POSTS.filter(function (p) { return p._sel; }).length;
    var bar = $('reel-pb-bulk'); if (bar) bar.classList.toggle('on', n > 0);
    var si = $('reel-pb-selinfo'); if (si) si.textContent = 'Đã chọn ' + n + ' bài';
  }
  // Cấu hình bình luận mặc định (dùng chung cho các bài) — modal gọn.
  function openCmtConfig() {
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    ov.innerHTML = '<div class="reel-modal-card" style="width:min(520px,92vw);height:auto">'
      + '<div class="rsm-head"><div><div class="rsm-title">💬 Cấu hình bình luận</div><div class="rsm-desc">Tự đăng 1 bình luận sau khi bài đăng thành công (áp dụng chung cho các bài).</div></div><button class="rsm-x" id="cc-x">✕</button></div>'
      + '<div class="rsm-body">'
      + '<label style="display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:13px;margin-bottom:10px"><span class="kzsw"><input type="checkbox" id="cc-on"><span class="sl"></span></span> <span id="cc-state">Đang tắt</span></label>'
      + '<div id="cc-body">'
      + '<label style="font-size:12px;font-weight:700;display:block;margin:6px 0 4px">Nội dung bình luận (mỗi dòng 1 mẫu · phân phối xoay vòng)</label>'
      + '<textarea id="cc-text" style="width:100%;height:110px;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit" placeholder="VD: Xem thêm ở đây nhé!&#10;Inbox shop để đặt hàng…"></textarea>'
      + '<div style="display:flex;gap:12px;margin-top:9px;flex-wrap:wrap"><label style="font-size:11.5px;font-weight:600;display:flex;flex-direction:column;gap:3px">Chờ trước bình luận (giây)<input id="cc-delay" type="number" min="0" value="0" style="width:130px;padding:6px 9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit"></label><label style="font-size:11.5px;font-weight:600;display:flex;flex-direction:column;gap:3px">Phân phối<select id="cc-order" style="padding:6px 9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit"><option value="rotate">Theo thứ tự</option><option value="random">Ngẫu nhiên</option></select></label></div>'
      + '</div></div>'
      + '<div class="rsm-foot"><span class="rsm-status"></span><span class="rsm-foot-btns"><button class="vbtn sec sm" id="cc-cancel">Hủy</button><button class="vbtn sm" id="cc-save">Lưu</button></span></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var on = ov.querySelector('#cc-on'), body = ov.querySelector('#cc-body'), stt = ov.querySelector('#cc-state');
    var txt = ov.querySelector('#cc-text'), dl = ov.querySelector('#cc-delay'), ord = ov.querySelector('#cc-order');
    on.checked = !!CFG.autoComment; txt.value = (CMT || []).filter(function (s) { return String(s || '').trim(); }).join('\n'); dl.value = CFG.cmtDelay || 0; ord.value = CFG.cmtOrder || 'rotate';
    function refl() { body.style.opacity = on.checked ? '1' : '.45'; body.style.pointerEvents = on.checked ? '' : 'none'; stt.textContent = on.checked ? 'Đang bật' : 'Đang tắt'; }
    refl(); on.onchange = refl;
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#cc-x').onclick = close; ov.querySelector('#cc-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#cc-save').onclick = function () {
      CFG.autoComment = on.checked ? 1 : 0;
      var arr = txt.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); CMT = arr.length ? arr : [''];
      CFG.cmtDelay = Math.max(0, parseInt(dl.value, 10) || 0); CFG.cmtOrder = ord.value;
      saveCfg(); saveCmt(); try { if (typeof renderCmtChips === 'function') renderCmtChips(); } catch (e) {}
      log('Đã lưu cấu hình bình luận.', 'ok'); close();
    };
  }
  function editPost(i) {
    var post = POSTS[i]; if (!post) return; var f = post.media;
    var ov = document.createElement('div'); ov.className = 'reel-modal-ov';
    ov.innerHTML = '<div class="reel-modal-card" style="width:min(560px,92vw);height:auto;max-height:88vh">'
      + '<div class="rsm-head"><div><div class="rsm-title">Chỉnh sửa bài đăng ' + (i + 1) + '</div><div class="rsm-desc">' + esc(f ? f.name : '—') + '</div></div><button class="rsm-x" id="ep-x">✕</button></div>'
      + '<div class="rsm-body"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:5px">Nội dung bài viết</label>'
      + '<textarea id="ep-ta" style="width:100%;height:180px;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:13px/1.5 inherit" placeholder="Viết nội dung cho bài này (gắn cứng với media này)…"></textarea>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px"><div id="ep-emoji" style="display:flex;gap:3px;flex-wrap:wrap"></div><span id="ep-cnt" style="font-size:11px;color:var(--text-secondary)">0 ký tự</span></div>'
      + '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color)"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:5px">💬 Bình luận cho bài này</label>'
      + '<select id="ep-cmtmode" style="width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit"><option value="global">Dùng cấu hình bình luận chung</option><option value="off">Tắt bình luận cho bài này</option><option value="custom">Bình luận riêng cho bài này</option></select>'
      + '<textarea id="ep-cmttext" style="display:none;width:100%;height:70px;box-sizing:border-box;margin-top:7px;padding:9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit" placeholder="Nội dung bình luận riêng…"></textarea></div>'
      + '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)"><label style="font-size:12px;font-weight:700;display:block;margin-bottom:5px">🕐 Lịch đăng bài này</label>'
      + '<select id="ep-schmode" style="width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit"><option value="global">Dùng lịch chung</option><option value="now">Đăng ngay</option><option value="custom">Đặt lịch riêng</option></select>'
      + '<input id="ep-schat" type="datetime-local" style="display:none;width:100%;box-sizing:border-box;margin-top:7px;padding:7px 9px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:12.5px inherit"></div></div>'
      + '<div class="rsm-foot"><span class="rsm-status">Caption/Fanpage/lịch gắn cứng với bài này</span><span class="rsm-foot-btns"><button class="vbtn sec sm" id="ep-cancel">Hủy</button><button class="vbtn sm" id="ep-save">Lưu thay đổi</button><button class="vbtn sm" id="ep-savenext">Lưu & bài tiếp →</button></span></div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var ta = ov.querySelector('#ep-ta'); ta.value = post.cap || ''; ta.focus();
    var cnt = ov.querySelector('#ep-cnt'); function rf() { cnt.textContent = ta.value.length + ' ký tự'; } rf(); ta.addEventListener('input', rf);
    var eb = ov.querySelector('#ep-emoji'); ['😀', '😍', '🔥', '✅', '🎉', '💯', '👉', '❤️', '⭐', '🛒'].forEach(function (ch) { var b = document.createElement('button'); b.type = 'button'; b.textContent = ch; b.style.cssText = 'border:0;background:var(--bg-tertiary);border-radius:6px;cursor:pointer;font-size:15px;padding:2px 5px'; b.onclick = function () { var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value; ta.value = v.slice(0, s) + ch + v.slice(e); ta.selectionStart = ta.selectionEnd = s + ch.length; ta.focus(); rf(); }; eb.appendChild(b); });
    var cmtMode = ov.querySelector('#ep-cmtmode'), cmtText = ov.querySelector('#ep-cmttext');
    cmtMode.value = post.commentMode || 'global'; cmtText.value = post.commentText || '';
    function reflCmt() { cmtText.style.display = cmtMode.value === 'custom' ? '' : 'none'; } reflCmt(); cmtMode.onchange = reflCmt;
    var schMode = ov.querySelector('#ep-schmode'), schAt = ov.querySelector('#ep-schat');
    schMode.value = post.schedMode || 'global'; schAt.value = post.schedAt || '';
    function reflSch() { schAt.style.display = schMode.value === 'custom' ? '' : 'none'; } reflSch(); schMode.onchange = reflSch;
    function save() { post.cap = ta.value; post.custom = true; post.commentMode = cmtMode.value; post.commentText = cmtText.value; post.schedMode = schMode.value; post.schedAt = schAt.value; renderPostList(); updateSummary(); }
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#ep-x').onclick = close; ov.querySelector('#ep-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#ep-save').onclick = function () { save(); close(); };
    ov.querySelector('#ep-savenext').onclick = function () { save(); close(); if (i + 1 < POSTS.length) editPost(i + 1); };
  }
  function renderFileList() {
    var box = $('reel-filelist'); if (!box) return;
    box.innerHTML = FILES.map(function (f, i) {
      return '<div class="fitem" draggable="true" data-i="' + i + '">'
        + '<span class="drag" title="Kéo để sắp xếp">⠿</span>'
        + '<span class="th">' + (isPhoto() ? '🖼️' : '🎬') + '</span>'
        + '<span class="meta"><div class="fn" title="' + esc(f.name) + '">' + esc(f.name) + '</div><div class="fi">' + fileInfoText(f) + '</div></span>'
        + '<span class="facts2"><button class="fx rep" data-rep="' + i + '" title="Thay tệp khác">↻</button><button class="fx del" data-del="' + i + '" title="Xoá">✕</button></span>'
        + '</div>';
    }).join('');
    box.querySelectorAll('[data-del]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); FILES.splice(+this.getAttribute('data-del'), 1); BUF = {}; updateVidInfo(); }; });
    box.querySelectorAll('[data-rep]').forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); replaceFile(+this.getAttribute('data-rep')); }; });
    var dragI = null;
    box.querySelectorAll('.fitem').forEach(function (row) {
      row.addEventListener('dragstart', function () { dragI = +this.getAttribute('data-i'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('dragover'); });
      row.addEventListener('dragleave', function () { this.classList.remove('dragover'); });
      row.addEventListener('drop', function (e) { e.preventDefault(); this.classList.remove('dragover'); var to = +this.getAttribute('data-i'); if (dragI == null || dragI === to) return; var m = FILES.splice(dragI, 1)[0]; FILES.splice(to, 0, m); BUF = {}; updateVidInfo(); });
    });
    ensureThumbs();
  }
  function replaceFile(i) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = isPhoto() ? 'image/*' : 'video/*';
    inp.onchange = function () { var file = this.files && this.files[0]; if (!file) return; FILES[i] = { name: file.name, file: file, _size: file.size }; BUF = {}; updateVidInfo(); };
    inp.click();
  }
  var _thumbBusy = false;
  async function ensureThumbs() {
    if (_thumbBusy) return; _thumbBusy = true;
    try {
      for (var i = 0; i < FILES.length && i < 80; i++) {
        var f = FILES[i]; if (f._thumbDone) continue;
        var isImgM = f.isAlbum || PHOTO_EXT.test(f.name || '');
        var file = f.isAlbum ? (f.files && f.files[0]) : (f.file || (f.handle && await f.handle.getFile().catch(function () { return null; }))); if (!file) { f._thumbDone = 1; continue; }
        if (!f.isAlbum) f._size = file.size;
        var row = document.querySelector('#reel-filelist .fitem[data-i="' + i + '"]');
        var url = URL.createObjectURL(file);
        try {
          if (isImgM) {
            await new Promise(function (res) { var img = new Image(); img.onload = function () { f._w = img.naturalWidth; f._h = img.naturalHeight; f._thumb = url; var th = row && row.querySelector('.th'); if (th) th.innerHTML = '<img src="' + url + '">'; res(); }; img.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) {} res(); }; img.src = url; });
          } else {
            await new Promise(function (res) {
              var v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; var done = false; var fin = function () { if (done) return; done = true; res(); };
              v.onloadedmetadata = function () { f._dur = v.duration; f._w = v.videoWidth; f._h = v.videoHeight; try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch (e) { fin(); } };
              v.onseeked = function () { try { var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; cv.getContext('2d').drawImage(v, 0, 0, 64, 64); var dataUrl = cv.toDataURL('image/jpeg', 0.6); f._thumb = dataUrl; var th = row && row.querySelector('.th'); if (th) th.innerHTML = '<img src="' + dataUrl + '">'; } catch (e) {} try { URL.revokeObjectURL(url); } catch (e) {} fin(); };
              v.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) {} fin(); };
              setTimeout(fin, 4000); v.src = url;
            });
          }
        } catch (e) {}
        f._thumbDone = 1;
        var fi = row && row.querySelector('.fi'); if (fi) fi.innerHTML = fileInfoText(f);
      }
      var e = $('reel-vidinfo');
      if (e && FILES.length) { var tot = 0, known = 0; FILES.forEach(function (f) { if (f._size != null) { tot += f._size; known++; } }); e.textContent = 'Đã chọn ' + FILES.length + ' ' + (isPhoto() ? 'ảnh' : 'video') + (known ? (' · ' + fmtBytes(tot)) : ''); }
      try { renderPostList(); } catch (er) {}   // cập nhật thumbnail vào bảng bài đăng
    } finally { _thumbBusy = false; }
  }

  /* ───────────────────────── Chips nội dung ───────────────────────── */
  // Bộ chip tổng quát dùng cho CẢ Nội Dung lẫn Bình Luận.
  function renderChipsG(boxId, arr, label, saveFn, renderFn) {
    var box = $(boxId); if (!box) return;
    var html = arr.map(function (t, i) {
      // Chip trống: hiện rõ "chưa nhập" thay vì "Trống N" (theo yêu cầu UX).
      var emptySuffix = (/Bình luận/i.test(label) || /Caption/i.test(label)) ? ' — Chưa nhập nội dung' : /Nội dung/i.test(label) ? ' — Chưa nhập caption' : ' — Chưa nhập';
      var lbl = (t || '').trim() ? (label + ' ' + (i + 1)) : (label + ' ' + (i + 1) + emptySuffix);
      return '<span class="chip" data-i="' + i + '" title="' + esc(t) + '">📝 ' + esc(lbl) + '</span>';
    }).join('');
    var addTxt = /Caption/i.test(label) ? '＋ Thêm caption' : /Bình luận/i.test(label) ? '＋ Thêm bình luận' : '＋ Thêm';
    html += '<span class="chip add" data-add="1">' + addTxt + '</span>';
    box.innerHTML = html;
    box.querySelectorAll('.chip[data-i]').forEach(function (el) { el.onclick = function () { editChip(arr, +this.getAttribute('data-i'), label, saveFn, renderFn); }; });
    var addEl = box.querySelector('.chip.add'); if (addEl) addEl.onclick = function () { arr.push(''); saveFn(); renderFn(); editChip(arr, arr.length - 1, label, saveFn, renderFn); };
  }
  function renderChips() { renderChipsG('reel-chips', TPL, 'Caption', function () { saveTpl(); updateDupWarn(); }, renderChips); }
  function renderCmtChips() { renderChipsG('reel-cmt-chips', CMT, 'Bình luận', saveCmt, renderCmtChips); }
  // Chip mẫu seed (chữ + ảnh). Hiện 📷 kèm số ảnh; bấm để mở trình sửa có đính ảnh.
  function renderSeedChipsInto(boxId) {
    var box = $(boxId); if (!box) return;
    var html = SEED.map(function (x, i) {
      var n = seedNorm(x), has = n.t.trim() || n.imgs.length;
      var lbl = 'Seed ' + (i + 1) + (has ? '' : ' — Chưa nhập');
      var badge = n.imgs.length ? (' <b style="color:var(--primary-accent,#ff5cb3)">📷' + n.imgs.length + '</b>') : '';
      return '<span class="chip" data-i="' + i + '" title="' + esc(n.t) + '">🌱 ' + esc(lbl) + badge + '</span>';
    }).join('');
    html += '<span class="chip add" data-add="1">＋ Thêm mẫu</span>';
    box.innerHTML = html;
    box.querySelectorAll('.chip[data-i]').forEach(function (el) { el.onclick = function () { editSeed(+this.getAttribute('data-i')); }; });
    var addEl = box.querySelector('.chip.add'); if (addEl) addEl.onclick = function () { SEED.push(seedNorm('')); saveSeed(); renderSeedChips(); editSeed(SEED.length - 1); };
  }
  function renderSeedChips() { renderSeedChipsInto('reel-seed-chips'); renderSeedChipsInto('reel-cmttab-seed'); }
  // Trình sửa 1 mẫu seed: nội dung chữ (spintax) + đính kèm nhiều ảnh (comment kèm ảnh).
  function editSeed(i) {
    if (i < 0 || i >= SEED.length) return;
    var n = seedNorm(SEED[i]), imgs = n.imgs.slice();
    var inp = 'width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary,#000);font:13px inherit';
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100011;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    ov.innerHTML = '<div class="reel-modal" style="width:min(560px,94vw);max-height:92vh;overflow:auto;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.4)">'
      + '<div style="font-weight:800;font-size:15px;margin-bottom:12px">🌱 Mẫu bình luận seed ' + (i + 1) + '</div>'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">Nội dung <span style="font-weight:400;opacity:.6">(spintax {a|b|c} · có thể để trống nếu chỉ gửi ảnh)</span></label>'
      + '<textarea id="reel-sd-txt" style="' + inp + ';height:110px;margin-bottom:12px" placeholder="Nội dung bình luận…"></textarea>'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">📷 Ảnh đính kèm <span style="font-weight:400;opacity:.6">(gửi kèm khi comment · nhiều ảnh được)</span></label>'
      + '<div id="reel-sd-imgs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"></div>'
      + '<div style="margin-bottom:14px"><button class="vbtn sec sm" id="reel-sd-add">📁 Thêm ảnh</button><input type="file" id="reel-sd-file" accept="image/*" multiple style="display:none"></div>'
      + '<div style="display:flex;gap:8px;justify-content:space-between">'
      + '<button class="vbtn danger sm" id="reel-sd-del">🗑 Xoá mẫu</button>'
      + '<span style="display:flex;gap:8px"><button class="vbtn sec sm" id="reel-sd-cancel">Huỷ</button><button class="vbtn sm" id="reel-sd-save">Lưu</button></span>'
      + '</div></div>';
    document.body.appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    q('reel-sd-txt').value = n.t;
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function paint() {
      q('reel-sd-imgs').innerHTML = imgs.length ? imgs.map(function (d, k) {
        return '<span style="position:relative;display:inline-block"><img src="' + d + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color)"><button data-k="' + k + '" class="reel-sd-rm" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:var(--danger-color,#e11);color:#fff;cursor:pointer;font-size:12px;line-height:1">✕</button></span>';
      }).join('') : '<span style="font-size:11.5px;color:var(--text-secondary)">Chưa có ảnh</span>';
      q('reel-sd-imgs').querySelectorAll('.reel-sd-rm').forEach(function (el) { el.onclick = function () { imgs.splice(+this.getAttribute('data-k'), 1); paint(); }; });
    }
    paint();
    q('reel-sd-add').onclick = function () { q('reel-sd-file').click(); };
    q('reel-sd-file').onchange = function () {
      var fs = Array.prototype.slice.call(this.files || []); this.value = ''; var left = fs.length; if (!left) return;
      fs.forEach(function (f) { readImgSmall(f, function (d) { if (d) imgs.push(d); if (--left === 0) paint(); }); });
    };
    q('reel-sd-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    q('reel-sd-del').onclick = function () { SEED.splice(i, 1); if (!SEED.length) SEED = [seedNorm('')]; saveSeed(); renderSeedChips(); updateSeedCnt(); close(); };
    q('reel-sd-save').onclick = function () { SEED[i] = { t: q('reel-sd-txt').value, imgs: imgs.slice() }; saveSeed(); renderSeedChips(); updateSeedCnt(); close(); };
  }
  /* ───────────────────────── SEEDING chéo bằng Fanpage ───────────────────────── */
  // Bài để seed: từ ô dán (link/id) + reel vừa đăng trong phiên. -> [{id, owner}]
  function collectSeedTargets() {
    var out = [], seen = {};
    // Bản đồ id -> page chủ (owner) từ reel vừa đăng, để loại page chủ ra khi seed chéo,
    // kể cả khi id đã đổ vào ô danh sách (mất owner).
    var ownerOf = {}; POSTED.forEach(function (o) { if (o.id && o.owner) ownerOf[o.id] = o.owner; });
    var raw = ($('reel-seed-posts') && $('reel-seed-posts').value) || '';
    // Nhận diện id bài từ nhiều dạng link FB (ưu tiên đúng id BÀI, không lấy nhầm album/set).
    var PATS = [/[?&]fbid=(\d+)/, /story_fbid=(\d+)/, /[?&]v=(\d+)/, /\/reel\/(\d+)/, /\/reels\/(\d+)/, /\/videos\/(\d+)/, /\/posts\/(\d+)/, /\/permalink\/(\d+)/, /\/photos\/[^\/]+\/(\d+)/, /\/(\d{6,})(?:[\/?]|$)/, /^(\d{6,})$/];
    raw.split(/[\s,]+/).forEach(function (tk) {
      tk = String(tk || '').trim(); if (!tk) return;
      var id = '';
      for (var pi = 0; pi < PATS.length; pi++) { var m = tk.match(PATS[pi]); if (m) { id = m[1]; break; } }
      if (id && !seen[id]) { seen[id] = 1; out.push({ id: id, owner: ownerOf[id] || '', url: /^https?:/i.test(tk) ? tk : '' }); }
    });
    POSTED.forEach(function (o) { if (o.id && !seen[o.id]) { seen[o.id] = 1; out.push({ id: o.id, owner: o.owner, url: o.url || '' }); } });
    return out;
  }
  // Người seed: mọi fanpage đã Load (có page token). Trộn ngẫu nhiên để phân bố đều.
  // Lọc page seed theo ô "Fanpage dùng để seed" (dán id). Trống -> null = dùng tất cả.
  function seedPageFilter() {
    var raw = ($('reel-seed-pages') && $('reel-seed-pages').value) || '';
    var ids = raw.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\d{5,}$/.test(s); });
    if (!ids.length) return null;
    var set = {}; ids.forEach(function (id) { set[id] = 1; }); return set;
  }
  // Chẩn đoán vì sao < 2 fanpage. Seed qua GraphQL chỉ cần COOKIE clone (bền qua F5), KHÔNG cần token page.
  function seedWhyFew() {
    var withCk = 0; CLONES.forEach(function (c) { if (c.cookie) withCk += (c.pages ? c.pages.length : 0); });
    if (withCk < 2) return 'Chưa có đủ fanpage. Dán clone (có cookie) và bấm "Load Page Từ Clone" ít nhất 1 lần để app nhớ danh sách page (danh sách page + cookie được lưu qua F5; chỉ token là phải load lại).';
    if (seedPageFilter()) return 'Các ID trong ô "Fanpage dùng để seed" không khớp page nào đã lưu. Kiểm tra lại ID, hoặc XOÁ ô đó để dùng tất cả page đã Load.';
    return 'Cần ≥2 fanpage (đã lưu danh sách page + cookie clone) để seed chéo.';
  }
  // Seeder = page đã biết (có trong danh sách) + clone của nó CÓ COOKIE. Token page chỉ để fallback (không bắt buộc).
  // Nhờ vậy sau F5 vẫn seed được: cookie clone + danh sách page đều bền, chỉ token là mất.
  function collectSeeders() {
    var pick = seedPageFilter(), out = [], seen = {};
    CLONES.forEach(function (c) {
      c.ptok = c.ptok || {};
      (c.pages || []).forEach(function (p) {
        if (pick && !pick[p.id]) return;
        if (seen[p.id]) return;
        var token = c.ptok[p.id] || '';
        if (!c.cookie && !token) return;              // không có gì để đóng vai page
        seen[p.id] = 1;
        out.push({ id: p.id, token: token, clone: c.uid || c._cid, name: p.name || '', cl: c, cookie: c.cookie || '' });
      });
    });
    for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }
  function seedLog(m, k) { log(m, k); var el = $('reel-seed-msg'); if (el) { el.textContent = m; el.title = m; el.style.color = k === 'err' ? 'var(--danger-color)' : k === 'ok' ? 'var(--success-color)' : 'var(--text-secondary)'; } }
  function updateSeedCnt() {
    var nt = collectSeedTargets().length, ns = collectSeeders().length;
    var el = $('reel-seed-cnt'); if (el) el.textContent = nt + ' bài · ' + ns + ' fanpage seed';
    var st = $('reel-seed-status'); if (st) st.textContent = nt + ' bài · ' + ns + ' fanpage' + (SEEDING ? ' · 🌱 đang chạy…' : '');
  }
  function updateSeedBtns() {
    var st = $('reel-seed-start'); if (st) st.disabled = SEEDING;
    var sp = $('reel-seed-stop'); if (sp) sp.disabled = !SEEDING;
  }
  // Bảng chọn bài để seed — như cách chọn bài ở tab Đăng bài (tick chọn) thay vì dán ID.
  // Nguồn: lịch sử đăng qua tool (PHIST) + bài kéo từ Page (FBPOSTS) + reel vừa đăng trong phiên (POSTED).
  function openSeedPicker() {
    var seen = {}, rows = [];
    function add(x) { if (!x || !x.id || seen[x.id]) return; seen[x.id] = 1; rows.push(x); }
    PHIST.forEach(add);
    (FBPOSTS || []).forEach(add);
    POSTED.forEach(function (o) { add({ id: o.id, pid: o.owner || '', pn: pageNameById(o.owner || ''), ty: 'Reel', cap: '', url: o.url || '', t: 0 }); });
    rows.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    // id đã có trong ô -> tick sẵn
    var already = {}; ((($('reel-seed-posts') || {}).value) || '').split(/[\s,]+/).forEach(function (tk) { var m = String(tk).match(/(\d{6,})/); if (m) already[m[1]] = 1; });
    var flt = { q: '', ty: '' };
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100012;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    ov.innerHTML = '<div class="reel-modal" style="width:min(1040px,97vw);height:88vh;overflow:hidden;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.4);display:flex;flex-direction:column">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex:0 0 auto"><div style="font-weight:800;font-size:16px">📋 Chọn bài để seed <span id="reel-spk-cnt" style="font-weight:400;color:var(--text-secondary);font-size:12px"></span></div><button class="vbtn sec sm" id="reel-spk-x">✕</button></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;flex:0 0 auto">'
      + '<input id="reel-spk-q" placeholder="🔍 Tìm nội dung / tên page…" style="flex:1;min-width:200px;padding:7px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit">'
      + '<select id="reel-spk-fty" style="padding:7px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary);font:13px inherit"><option value="">Mọi loại</option><option value="Reel">Reel</option><option value="Ảnh">Ảnh</option></select>'
      + '<label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="reel-spk-all"> Chọn tất cả (đang lọc)</label>'
      + '<span style="font-size:11px;color:var(--text-secondary)">💡 Giữ &amp; rê chuột để quét chọn nhiều bài</span>'
      + '</div>'
      + '<div id="reel-spk-body" style="flex:1 1 auto;overflow:auto"></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;flex:0 0 auto;border-top:1px solid var(--border-color);padding-top:12px"><span id="reel-spk-sel" style="font-size:12px;color:var(--text-secondary)"></span><span style="display:flex;gap:8px"><button class="vbtn sec sm" id="reel-spk-cancel">Huỷ</button><button class="vbtn sm" id="reel-spk-apply">✔ Áp dụng vào danh sách</button></span></div>'
      + '</div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    function endDrag() { _dsel.on = false; }
    function close() { try { window.removeEventListener('mouseup', endDrag); } catch (e) {} if (ov.parentNode) ov.parentNode.removeChild(ov); }
    var body = q('reel-spk-body');
    var _dsel = { on: false, mode: false };
    function filtered() {
      return rows.filter(function (x) {
        if (flt.ty && x.ty !== flt.ty) return false;
        if (flt.q) { var s = ((x.cap || '') + ' ' + (x.pn || '') + ' ' + x.id).toLowerCase(); if (s.indexOf(flt.q.toLowerCase()) < 0) return false; }
        return true;
      });
    }
    function selCount() { return body.querySelectorAll('.spk:checked').length; }
    function updSel() { q('reel-spk-sel').textContent = 'Đã chọn ' + selCount() + ' bài'; }
    function fill() {
      var arr = filtered();
      q('reel-spk-cnt').textContent = '(' + arr.length + '/' + rows.length + ' bài)';
      if (!arr.length) { body.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:12px">' + (rows.length ? 'Không có bài khớp bộ lọc.' : 'Chưa có bài nào. Hãy đăng reel/ảnh trước, hoặc dùng “Quản lý bài → 🔄 Tải bài từ Page” để kéo bài về.') + '</div>'; updSel(); return; }
      var th = 'text-align:left;padding:7px 8px;border-bottom:2px solid var(--border-color,#eee);font-size:11px;color:var(--text-secondary);position:sticky;top:0;background:var(--bg-secondary,#fff)';
      var td = 'padding:7px 8px;border-bottom:1px solid var(--border-color,#f0f0f0);font-size:12px;vertical-align:top';
      body.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
        + '<th style="' + th + ';width:34px"></th><th style="' + th + ';width:52px">Loại</th><th style="' + th + '">Nội dung</th><th style="' + th + ';width:180px">Trang</th><th style="' + th + ';width:150px">Đăng lúc</th><th style="' + th + ';width:130px">Link bài viết</th></tr></thead><tbody>'
        + arr.map(function (x) {
          var icon = x.ty === 'Ảnh' ? '🖼️' : '🎬';
          var link = x.url || ('https://www.facebook.com/' + x.id);
          return '<tr class="spkrow" style="cursor:pointer;user-select:none"><td style="' + td + '"><input type="checkbox" class="spk" style="pointer-events:none" data-id="' + esc(x.id) + '" data-url="' + esc(x.url || '') + '"' + (already[x.id] ? ' checked' : '') + '></td>'
            + '<td style="' + td + ';text-align:center;font-size:16px">' + icon + '</td>'
            + '<td style="' + td + ';max-width:360px"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.cap || '') + '">' + (esc(x.cap || '') || '<span style="color:var(--text-secondary)">(không caption)</span>') + '</span><span style="font:10px Consolas,monospace;color:var(--text-secondary)">' + esc(x.id) + '</span></td>'
            + '<td style="' + td + '">' + esc(x.pn || x.pid || '—') + '</td>'
            + '<td style="' + td + ';color:var(--text-secondary)">' + (x.t ? new Date(x.t).toLocaleString('vi-VN') : 'phiên này') + '</td>'
            + '<td style="' + td + '"><div style="display:flex;align-items:center;gap:6px"><a href="' + esc(link) + '" target="_blank" style="color:var(--primary-accent,#BE185D);white-space:nowrap;text-decoration:none">🔗 Mở</a><button class="vbtn sec sm spk-copy" data-u="' + esc(link) + '" title="Copy link">📋</button></div></td></tr>';
        }).join('') + '</tbody></table>';
      body.querySelectorAll('.spk').forEach(function (c) { c.onchange = updSel; });
      body.querySelectorAll('.spk-copy').forEach(function (el) { el.onclick = function () { try { navigator.clipboard.writeText(this.getAttribute('data-u')); var b = this; b.textContent = '✓'; setTimeout(function () { b.textContent = '📋'; }, 900); } catch (e) {} }; });
      updSel();
    }
    fill();
    // Kéo-thả quét chọn: giữ chuột trên 1 dòng rồi rê qua các dòng để chọn/bỏ hàng loạt.
    function _spkOf(t) { if (!t || !t.closest) return null; if (t.closest('a,button')) return null; var tr = t.closest('tr.spkrow'); return tr ? tr.querySelector('.spk') : null; }
    body.addEventListener('mousedown', function (e) { if (e.button !== 0) return; var chk = _spkOf(e.target); if (!chk) return; e.preventDefault(); _dsel.on = true; _dsel.mode = !chk.checked; chk.checked = _dsel.mode; updSel(); });
    body.addEventListener('mouseover', function (e) { if (!_dsel.on) return; var chk = _spkOf(e.target); if (!chk) return; if (chk.checked !== _dsel.mode) { chk.checked = _dsel.mode; updSel(); } });
    window.addEventListener('mouseup', endDrag);
    q('reel-spk-q').oninput = function () { flt.q = this.value.trim(); fill(); };
    q('reel-spk-fty').onchange = function () { flt.ty = this.value; fill(); };
    q('reel-spk-all').onchange = function () { var on = this.checked; body.querySelectorAll('.spk').forEach(function (c) { c.checked = on; }); updSel(); };
    q('reel-spk-x').onclick = close; q('reel-spk-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    q('reel-spk-apply').onclick = function () {
      var cur = ($('reel-seed-posts').value || '').trim();
      var seenLine = {}; cur.split(/\s+/).forEach(function (l) { var m = l.match(/(\d{6,})/); if (m) seenLine[m[1]] = 1; });
      var addLines = [];
      body.querySelectorAll('.spk:checked').forEach(function (c) { var id = c.getAttribute('data-id'), u = c.getAttribute('data-url'); if (id && !seenLine[id]) { seenLine[id] = 1; addLines.push(u || id); } });
      if (!addLines.length && !cur) { seedLog('Chưa chọn bài nào.', 'err'); return; }
      $('reel-seed-posts').value = (cur ? cur + '\n' : '') + addLines.join('\n');
      updateSeedCnt(); close();
      seedLog('📋 Đã thêm ' + addLines.length + ' bài vào danh sách seed.', 'ok');
    };
  }
  // Số page đã gán cứng mẫu (để hiện cạnh nút).
  function updateSeedMapCnt() {
    var el = $('reel-seed-map-cnt'); if (!el) return;
    var n = 0, mp = CFG.seedMap || {}; for (var k in mp) { if (mp[k] != null && mp[k] >= 0) n++; }
    el.textContent = n ? (n + ' page gán cứng') : 'chưa gán · đang xoay vòng';
  }
  // Modal gán cứng: mỗi page seed chọn ĐÚNG 1 mẫu (hoặc Tự động = xoay vòng).
  function openSeedMapModal() {
    var seeders = collectSeeders();
    // gộp trùng theo page id, giữ tên
    var seen = {}, pages = [];
    seeders.forEach(function (s) { if (seen[s.id]) return; seen[s.id] = 1; pages.push({ id: s.id, name: s.name || s.id }); });
    CFG.seedMap = CFG.seedMap || {};
    var opts = '<option value="-1">🔁 Tự động (xoay vòng)</option>' + SEED.map(function (x, i) {
      var n = seedNorm(x); var t = (n.t || '').trim().slice(0, 30); var badge = n.imgs.length ? (' 📷' + n.imgs.length) : '';
      return '<option value="' + i + '">Seed ' + (i + 1) + (t ? (' — ' + esc(t)) : '') + badge + '</option>';
    }).join('');
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100012;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px';
    ov.innerHTML = '<div class="reel-modal" style="width:min(680px,95vw);max-height:88vh;overflow:hidden;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.4);display:flex;flex-direction:column">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex:0 0 auto"><div style="font-weight:800;font-size:16px">🎯 Gán mẫu cho từng page</div><button class="vbtn sec sm" id="reel-sm-x">✕</button></div>'
      + '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px;flex:0 0 auto">Chọn mẫu cố định cho từng page. Để <b>Tự động</b> thì page đó xoay vòng như bình thường. Danh sách theo page seed đang lọc (' + pages.length + ' page).</div>'
      + '<div id="reel-sm-body" style="flex:1 1 auto;overflow:auto">' + (pages.length ? '' : '<div style="font-size:12px;color:var(--text-secondary);padding:12px">Chưa có page seed. Load Page Từ Clone và/hoặc điền ô "Fanpage dùng để seed" trước.</div>') + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;flex:0 0 auto;border-top:1px solid var(--border-color);padding-top:12px"><button class="vbtn sec sm" id="reel-sm-reset">↺ Bỏ gán tất cả</button><button class="vbtn sm" id="reel-sm-save">✔ Lưu</button></div>'
      + '</div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    if (pages.length) {
      var td = 'padding:7px 8px;border-bottom:1px solid var(--border-color,#f0f0f0);font-size:12px;vertical-align:middle';
      q('reel-sm-body').innerHTML = '<table style="width:100%;border-collapse:collapse"><tbody>' + pages.map(function (p, i) {
        var cur = (CFG.seedMap[p.id] != null) ? CFG.seedMap[p.id] : -1;
        return '<tr><td style="' + td + ';width:34px;color:var(--text-secondary)">' + (i + 1) + '</td>'
          + '<td style="' + td + '"><b>' + esc(p.name) + '</b><br><span style="font:10px Consolas,monospace;color:var(--text-secondary)">' + esc(p.id) + '</span></td>'
          + '<td style="' + td + ';width:280px"><select class="reel-sm-sel" data-id="' + esc(p.id) + '" style="width:100%;height:32px;padding:4px 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:12px">' + opts.replace('value="' + cur + '"', 'value="' + cur + '" selected') + '</select></td></tr>';
      }).join('') + '</tbody></table>';
    }
    q('reel-sm-x').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    q('reel-sm-reset').onclick = function () { ov.querySelectorAll('.reel-sm-sel').forEach(function (s) { s.value = '-1'; }); };
    q('reel-sm-save').onclick = function () {
      var mp = {}; ov.querySelectorAll('.reel-sm-sel').forEach(function (s) { var v = parseInt(s.value, 10); if (v >= 0) mp[s.getAttribute('data-id')] = v; });
      CFG.seedMap = mp; saveCfg(); updateSeedMapCnt(); close();
      seedLog('🎯 Đã lưu gán mẫu cho ' + Object.keys(mp).length + ' page.', 'ok');
    };
  }
  function openSeedModal() {
    var m = $('reel-seed-modal'); if (!m) return;
    m.style.display = 'flex'; try { document.body.style.overflow = 'hidden'; } catch (e) {}
    renderSeedChips(); updateSeedCnt(); updateSeedBtns(); renderSchedules(); toggleWhenWarn(); updateWhenConfirm(); updateSeedMapCnt();
  }
  function toggleWhenWarn() { var w = $('reel-seed-when-warn'); if (w) w.style.display = timeMode() === 'sched' ? '' : 'none'; }
  function closeSeedModal() {   // đóng KHÔNG dừng tác vụ, KHÔNG mất cấu hình, KHÔNG huỷ lịch
    var m = $('reel-seed-modal'); if (!m) return;
    m.style.display = 'none'; try { document.body.style.overflow = ''; } catch (e) {}
  }

  /* ───────────────────────── LỊCH SEEDING (client-side, bền localStorage) ───────────────────────── */
  function reloadSchedules() { try { var a = JSON.parse(localStorage.getItem('reel-schedules') || '[]'); if (Array.isArray(a)) SCHEDULES = a; } catch (e) { SCHEDULES = []; } }
  function saveSchedules() { try { localStorage.setItem('reel-schedules', JSON.stringify(SCHEDULES)); } catch (e) {} }
  // Snapshot fanpage đang có (id + token + clone) — lịch dùng ĐÚNG page này, không tự thêm page tải sau.
  function seederSnapshot() { return collectSeeders(); }   // lịch dùng ĐÚNG nhóm page đã lọc (không tự thêm page tải sau)
  var TZ_OFF = { 'Asia/Ho_Chi_Minh': 7 };
  // Đổi giá trị datetime-local ("2026-09-15T20:30") theo múi giờ đã chọn -> unix ms.
  function parseWhen(val, tz) {
    if (!val) return 0;
    if (tz === 'local') { var d = new Date(val); return isNaN(d.getTime()) ? 0 : d.getTime(); }
    var off = TZ_OFF[tz] != null ? TZ_OFF[tz] : 7;
    var sign = off >= 0 ? '+' : '-'; var ah = Math.abs(off);
    var iso = val + ':00' + sign + (ah < 10 ? '0' : '') + ah + ':00';
    var t = Date.parse(iso); return isNaN(t) ? 0 : t;
  }
  function fmtWhen(ms, tz) {
    if (!ms) return '—';
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    if (tz === 'local') { var d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ngày ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(); }
    var off = (tz && TZ_OFF[tz] != null) ? TZ_OFF[tz] : 7;
    var u = new Date(ms + off * 3600000);   // dịch sang mốc để đọc phần UTC = giờ tường tại múi off
    return p2(u.getUTCHours()) + ':' + p2(u.getUTCMinutes()) + ' ngày ' + p2(u.getUTCDate()) + '/' + p2(u.getUTCMonth() + 1) + '/' + u.getUTCFullYear();
  }
  var SCH_LABEL = { waiting: 'Chờ chạy', running: 'Đang chạy', done: 'Hoàn tất', done_err: 'Hoàn tất có lỗi', failed: 'Thất bại', canceled: 'Đã huỷ', missed: 'Lỡ lịch' };
  var SCH_CLS = { waiting: 'cl-rest', running: 'cl-run', done: 'cl-done', done_err: 'cl-rest', failed: 'cl-dead', canceled: 'st-wait', missed: 'cl-dead' };

  // Lưu / cập nhật lịch từ form hiện tại.
  function saveSchedule() {
    var targets = collectSeedTargets();
    var ta = $('reel-seed-posts');
    if (!targets.length) { if (ta) { ta.style.borderColor = 'var(--danger-color)'; ta.focus(); } seedLog('Chưa có bài để lưu lịch.', 'err'); return; }
    if (ta) ta.style.borderColor = '';
    if (!seedHasContent()) { seedLog("Chưa có mẫu bình luận seed (chữ hoặc ảnh).", "err"); return; }
    var seeders = seederSnapshot();
    if (seeders.length < 2) { seedLog('Cần ≥2 fanpage đã Load để lưu lịch seed chéo.', 'err'); return; }
    var wEl = $('reel-seed-when'), tzEl = $('reel-seed-tz');
    var tz = (tzEl && tzEl.value) || 'Asia/Ho_Chi_Minh';
    var runAt = parseWhen(wEl && wEl.value, tz);
    if (!runAt) { if (wEl) { wEl.style.borderColor = 'var(--danger-color)'; wEl.focus(); } seedLog('Chưa chọn thời điểm chạy.', 'err'); return; }
    if (runAt <= Date.now() + 5000) { if (wEl) { wEl.style.borderColor = 'var(--danger-color)'; wEl.focus(); } seedLog('⏰ Thời điểm chạy đã ở quá khứ — chọn giờ trong tương lai.', 'err'); return; }
    if (wEl) wEl.style.borderColor = '';
    reloadSchedules();
    var snap = { posts: targets, seed: SEED.slice(), seeders: seeders, cfg: { seedPerPost: CFG.seedPerPost, seedDelay: CFG.seedDelay, seedLike: CFG.seedLike, seedMaxPerPage: CFG.seedMaxPerPage, seedReactOn: CFG.seedReactOn, seedReactType: CFG.seedReactType, seedSelf: CFG.seedSelf, seedMap: CFG.seedMap || {} }, runAt: runAt, tz: tz };
    if (editSchId) {
      var found = SCHEDULES.filter(function (x) { return x.id === editSchId; })[0];
      if (found && found.status === 'waiting') { Object.assign(found, snap); seedLog('⏰ Đã cập nhật lịch.', 'ok'); }
      else { seedLog('Lịch không còn ở trạng thái chờ, không sửa được.', 'err'); }
      editSchId = null;
    } else {
      var sch = Object.assign({ id: 'sch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), status: 'waiting', result: null, lockTab: '', lockTs: 0 }, snap);
      SCHEDULES.push(sch);
      seedLog('⏰ Đã lưu lịch: chạy lúc ' + fmtWhen(runAt, tz) + ' — giờ Việt Nam · ' + targets.length + ' bài · ' + seeders.length + ' fanpage. GIỮ TRÌNH DUYỆT MỞ để chạy đúng giờ.', 'ok');
    }
    saveSchedules(); renderSchedules(); updateSchOpen();
  }

  function renderSchedules() {
    var b = $('reel-sch-list'); if (!b) return;
    reloadSchedules();
    var arr = SCHEDULES.slice().sort(function (a, b) { return a.runAt - b.runAt; });
    var cnt = $('reel-sch-count'); if (cnt) cnt.textContent = '(' + arr.length + ')';
    if (!arr.length) { b.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 2px">Chưa có lịch nào.</div>'; return; }
    b.innerHTML = arr.map(function (s) {
      var nClone = {}; (s.seeders || []).forEach(function (x) { nClone[x.clone] = 1; });
      var acts = '';
      if (s.status === 'waiting') acts = '<button class="vbtn sec sm sch-edit" data-id="' + s.id + '">✏ Sửa</button><button class="vbtn sec sm sch-cancel" data-id="' + s.id + '">✕ Huỷ</button>';
      else if (s.status === 'running') acts = '<button class="vbtn danger sm sch-stop" data-id="' + s.id + '">■ Dừng</button>';
      else if (s.status === 'missed') acts = '<button class="vbtn ok sm sch-now" data-id="' + s.id + '">▶ Chạy ngay</button><button class="vbtn sec sm sch-edit" data-id="' + s.id + '">↻ Đặt lại giờ</button><button class="vbtn sec sm sch-cancel" data-id="' + s.id + '">✕ Huỷ</button>';
      var res = s.result ? (' · ' + s.result.ok + ' OK/' + s.result.err + ' lỗi') : '';
      return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 2px;border-bottom:1px solid var(--border-color)">'
        + '<span style="font-weight:700;font-size:12.5px;min-width:150px">⏰ ' + fmtWhen(s.runAt, s.tz) + '</span>'
        + '<span style="font-size:11.5px;color:var(--text-secondary)">' + (s.posts ? s.posts.length : 0) + ' bài · ' + Object.keys(nClone).length + ' clone · ' + (s.seeders ? s.seeders.length : 0) + ' fanpage' + res + '</span>'
        + '<span class="' + (SCH_CLS[s.status] || 'st-wait') + '" style="font-size:11.5px;font-weight:700">' + (SCH_LABEL[s.status] || s.status) + '</span>'
        + '<span style="margin-left:auto;display:flex;gap:6px">' + acts + '</span>'
        + '</div>';
    }).join('');
    b.querySelectorAll('.sch-cancel').forEach(function (el) { el.onclick = function () { schAction(this.getAttribute('data-id'), 'cancel'); }; });
    b.querySelectorAll('.sch-edit').forEach(function (el) { el.onclick = function () { schAction(this.getAttribute('data-id'), 'edit'); }; });
    b.querySelectorAll('.sch-stop').forEach(function (el) { el.onclick = function () { SEEDSTOP = true; seedLog('Đã yêu cầu dừng lịch đang chạy.'); }; });
    b.querySelectorAll('.sch-now').forEach(function (el) { el.onclick = function () { schAction(this.getAttribute('data-id'), 'now'); }; });
  }
  function schAction(id, act) {
    reloadSchedules();
    var s = SCHEDULES.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    if (act === 'cancel') {
      if (s.status === 'running') { seedLog('Lịch đang chạy — bấm Dừng.', 'err'); return; }
      s.status = 'canceled'; saveSchedules(); renderSchedules(); seedLog('⏰ Đã huỷ lịch.', 'ok');
    } else if (act === 'edit') {
      if (s.status !== 'waiting' && s.status !== 'missed') { seedLog('Chỉ sửa được lịch đang chờ / lỡ lịch.', 'err'); return; }
      // Nạp snapshot lịch vào form để sửa.
      if ($('reel-seed-posts')) $('reel-seed-posts').value = (s.posts || []).map(function (o) { return o.id; }).join('\n');
      SEED = (s.seed && s.seed.length) ? s.seed.slice() : ['']; saveSeed(); renderSeedChips();
      CFG.seedPerPost = s.cfg.seedPerPost; CFG.seedDelay = s.cfg.seedDelay; CFG.seedLike = s.cfg.seedLike; CFG.seedMaxPerPage = s.cfg.seedMaxPerPage;
      CFG.seedReactOn = s.cfg.seedReactOn || 0; CFG.seedReactType = s.cfg.seedReactType || 'random'; CFG.seedSelf = s.cfg.seedSelf || 0; CFG.seedMap = s.cfg.seedMap || {}; saveCfg();
      if ($('reel-seed-per')) $('reel-seed-per').value = CFG.seedPerPost;
      if ($('reel-seed-delay')) $('reel-seed-delay').value = CFG.seedDelay;
      if ($('reel-seed-max')) $('reel-seed-max').value = CFG.seedMaxPerPage;
      if ($('reel-seed-react-on')) $('reel-seed-react-on').checked = !!CFG.seedReactOn;
      if ($('reel-seed-react-type')) $('reel-seed-react-type').value = CFG.seedReactType || 'random';
      if ($('reel-seed-self')) $('reel-seed-self').checked = !!CFG.seedSelf;
      setTimeMode('sched');
      editSchId = s.id; updateSeedCnt(); seedLog('⏰ Đang sửa lịch — chỉnh xong bấm "Lưu lịch Seeding".', 'ok');
    } else if (act === 'now') {
      if (SEEDING) { seedLog('Đang chạy tác vụ khác — thử lại sau.', 'err'); return; }
      s.status = 'waiting'; s.runAt = Date.now(); saveSchedules(); renderSchedules();
      runSchedule(s);
    }
  }
  function updateSchOpen() { var w = $('reel-sch-wrap'); if (w) w.style.display = ''; }

  // Bộ hẹn giờ client-side: kiểm mỗi 15s. Tới giờ + tab đang mở -> chạy (khoá 1 lần). Quá giờ >90s -> Lỡ lịch.
  function startSchedTimer() { if (schTimer) return; schTimer = setInterval(checkSchedules, 15000); setTimeout(checkSchedules, 2000); }
  function checkSchedules() {
    if (SEEDING || RUNNING) return;
    reloadSchedules();
    var now = Date.now(), changed = false;
    for (var i = 0; i < SCHEDULES.length; i++) {
      var s = SCHEDULES[i];
      if (s.status !== 'waiting') continue;
      if (s.runAt > now) continue;
      if (now - s.runAt > 90000) { s.status = 'missed'; changed = true; continue; }   // lỡ lịch
      // Tới giờ: khoá rồi chạy (1 lần, kể cả nhiều tab).
      reloadSchedules();
      var fresh = SCHEDULES.filter(function (x) { return x.id === s.id; })[0];
      if (!fresh || fresh.status !== 'waiting') continue;
      fresh.status = 'running'; fresh.lockTab = TABID; fresh.lockTs = now; saveSchedules(); renderSchedules();
      runSchedule(fresh);
      return;
    }
    if (changed) { saveSchedules(); renderSchedules(); }
  }
  async function runSchedule(sch) {
    if (SEEDING) return;
    SEEDING = true; SEEDSTOP = false; updateSeedBtns();
    seedLog('⏰ Chạy lịch seeding (' + fmtWhen(sch.runAt, sch.tz) + '): ' + (sch.posts ? sch.posts.length : 0) + ' bài · ' + (sch.seeders ? sch.seeders.length : 0) + ' fanpage.');
    // Gắn lại cookie clone sống (theo id page) để đường GraphQL đóng-vai-Page dùng được sau khi mở lại trình duyệt.
    var res, seeders = (sch.seeders || []).filter(function (x) { return x.token; }).map(function (x) {
      var cl = null; for (var ci = 0; ci < CLONES.length; ci++) { var c = CLONES[ci]; if ((c.ptok && c.ptok[x.id]) || (c.byId && c.byId[x.id])) { cl = c; break; } }
      return { id: x.id, token: (cl && cl.ptok && cl.ptok[x.id]) || x.token, name: x.name || '', clone: x.clone, cl: cl, cookie: (cl && cl.cookie) || '' };
    });
    try {
      if (seeders.length < 2) { sch.status = 'failed'; sch.result = { ok: 0, err: 0 }; seedLog('⏰ Lịch THẤT BẠI: không còn đủ fanpage hợp lệ.', 'err'); }
      else {
        var _schReact = sch.cfg.seedReactOn ? (sch.cfg.seedReactType || 'random') : (sch.cfg.seedLike ? 'like' : 'off');
        res = await doSeed({ targets: (sch.posts || []).map(function (o) { return { id: o.id, owner: o.owner || '', url: o.url || '' }; }), seeders: seeders, seed: sch.seed || [], per: sch.cfg.seedPerPost, delayMs: (sch.cfg.seedDelay || 0) * 1000, maxPer: sch.cfg.seedMaxPerPage || 0, react: _schReact, self: sch.cfg.seedSelf || 0, map: sch.cfg.seedMap || {} });
        sch.result = res;
        if (res.skipped && res.skipped.length) seedLog('⏰ Bỏ qua ' + res.skipped.length + ' page (token die): ' + res.skipped.join(', '), 'err');
        sch.status = SEEDSTOP ? 'canceled' : (res.err ? 'done_err' : 'done');
      }
    } catch (e) { sch.status = 'failed'; seedLog('⏰ Lịch lỗi: ' + ((e && e.message) || e), 'err'); }
    finally {
      SEEDING = false; updateSeedBtns();
      reloadSchedules(); var f = SCHEDULES.filter(function (x) { return x.id === sch.id; })[0]; if (f) { f.status = sch.status; f.result = sch.result; } saveSchedules(); renderSchedules();
      seedLog('⏰ Xong lịch: ' + (res ? res.ok : 0) + ' OK · ' + (res ? res.err : 0) + ' lỗi · ' + (SCH_LABEL[sch.status] || sch.status), (res && res.err) ? 'err' : 'ok');
    }
  }
  // Chạy ngay hay lưu lịch tuỳ chế độ thời gian.
  function setTimeMode(mode) {
    var box = $('reel-seed-when-box'); if (box) box.style.display = mode === 'sched' ? '' : 'none';
    var st = $('reel-seed-start'); if (st) st.textContent = mode === 'sched' ? '💾 Lưu lịch Seeding' : '🌱 Bắt đầu Seeding';
    var rn = $('reel-tm-now'), rs = $('reel-tm-sched'); if (rn) rn.checked = mode !== 'sched'; if (rs) rs.checked = mode === 'sched';
    updateWhenConfirm();
  }
  function timeMode() { var rs = $('reel-tm-sched'); return (rs && rs.checked) ? 'sched' : 'now'; }
  function updateWhenConfirm() {
    var el = $('reel-seed-when-confirm'); if (!el) return;
    var wEl = $('reel-seed-when'), tz = ($('reel-seed-tz') && $('reel-seed-tz').value) || 'Asia/Ho_Chi_Minh';
    var ms = parseWhen(wEl && wEl.value, tz);
    if (timeMode() !== 'sched' || !ms) { el.textContent = ''; return; }
    var past = ms <= Date.now();
    el.textContent = (past ? '⚠️ ' : '') + 'Chạy lúc ' + fmtWhen(ms, tz) + ' — giờ Việt Nam' + (past ? ' (đã ở quá khứ!)' : '');
    el.style.color = past ? 'var(--danger-color)' : 'var(--text-secondary)';
  }
  /* ───────────────────────── SEEDING QUA GRAPHQL (đóng vai Page) ─────────────────────────
     Token page của Graph API CHỈ bình luận được bài do chính tài khoản/business đó sở hữu, KHÔNG
     bình luận được bài của page người khác (trả "does not exist"). Để seed chéo bài NGƯỜI KHÁC ta
     phải bình luận như trên web: POST /api/graphql/ mutation useCometUFICreateCommentMutation, đóng
     vai Page bằng cookie clone + i_user=<actorId NPE>. Recipe lấy từ capture request thật:
       - av = __user = actorId (id "New Pages Experience" của page, KHÁC id Graph có token)
       - fb_dtsg = dtsg của phiên đóng-vai-page (scrape khi tải chính trang page — FB tự chuyển ngữ cảnh)
       - jazoest = '2' + tổng charCode của fb_dtsg ; lsd scrape kèm ; header x-fb-lsd/x-fb-friendly-name
       - variables.input.feedback_id = base64("feedback:"+post_id) ; post_id lấy từ trang bài (Accept:text/html) */
  var COMMENT_DOC = '28882491998025365', COMMENT_FN = 'useCometUFICreateCommentMutation';
  // Xoá bài đóng-vai-Page (capture 15/09 từ nút "Chuyển vào thùng rác" của FB web).
  // story_id = base64("S:_I<pageId>:<postNum>:<postNum>"); actor_id = pageId; story_location = TIMELINE.
  var TRASH_DOC = '26146132388368957', TRASH_FN = 'useCometTrashPostMutation';
  function b64u(s) { try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return btoa(s); } }
  function jazoest(dtsg) { var n = 0; for (var i = 0; i < dtsg.length; i++) n += dtsg.charCodeAt(i); return '2' + n; }
  function uuid4() { try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {} return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
  // Tải 1 trang FB ở dạng "document" (kèm Accept:text/html) để có post_id / DTSGInitialData / LSD.
  async function fbDoc(url, cookie, proxy) {
    var r = await ebFetchP(url, cookie || '', { headers: { 'Accept': 'text/html,application/xhtml+xml' } }, proxy);
    return (r && r.text) || '';
  }
  // Lấy actorId (i_user NPE) + fb_dtsg + lsd cho 1 seeder page — cache trên object seeder.
  async function seederAuth(s) {
    if (s._authOk) return true;
    var cookie = (s.cl && s.cl.cookie) || s.cookie; if (!cookie) { s._authErr = 'clone thiếu cookie'; return false; }
    var proxy = (s.cl && s.cl.proxy) || '';
    try {
      var t = await fbDoc('https://www.facebook.com/' + s.id + '/', cookie, proxy);
      // actorId (id NPE để đóng vai) = userID mà FB trả khi tải chính trang Page (đã kiểm chứng đúng theo page).
      s.actorId = (t.match(/"userID":"(\d+)"/) || t.match(/"actorID":"(\d+)"/) || t.match(/"USER_ID":"(\d+)"/) || [])[1] || s.id;
      s.dtsg = (t.match(/DTSGInitialData"[^}]*?"token":"([^"]+)"/) || t.match(/"dtsg":\{"token":"([^"]+)"/) || [])[1] || '';
      s.lsd = (t.match(/"LSD",\[\],\{"token":"([^"]+)"/) || [])[1] || '';
      // doc_id mutation cảm xúc (nếu FB nhúng sẵn trong trang) để thả Love/Haha/… đóng-vai-Page.
      if (!s.reactDoc) s.reactDoc = (t.match(/CometUFIFeedbackReactMutation[\s\S]{0,600}?"id":"(\d{6,})"/) || t.match(/"(\d{6,})"[\s\S]{0,120}?CometUFIFeedbackReactMutation/) || [])[1] || '';
      s._authOk = !!(s.dtsg && s.actorId);
      if (!s._authOk) s._authErr = 'không scrape được dtsg/actor';
    } catch (e) { s._authErr = (e && e.message) || String(e); s._authOk = false; }
    return s._authOk;
  }
  // Resolve feedback_id của bài (base64 "feedback:<post_id>") — cache trên object target.
  async function feedbackIdOf(tg, cookie, proxy) {
    if (tg._fb) return tg._fb;
    var urls = [];
    if (tg.url) urls.push(tg.url);
    urls.push('https://www.facebook.com/' + tg.id, 'https://www.facebook.com/reel/' + tg.id, 'https://www.facebook.com/photo/?fbid=' + tg.id);
    for (var i = 0; i < urls.length; i++) {
      try {
        var t = await fbDoc(urls[i], cookie, proxy);
        // 1) feedback đã encode sẵn trong trang (ảnh/post thường hay có sẵn)
        var b = t.match(/"feedback":\s*\{\s*"id":"(ZmVlZGJhY2s6[A-Za-z0-9+/=]+)"/);
        if (b) { tg._fb = b[1]; return tg._fb; }
        // 2) post_id (video/reel) hoặc subscription_target_id -> feedback:<id>
        var m = t.match(/"post_id":"(\d+)"/) || t.match(/"subscription_target_id":"(\d+)"/);
        if (m) { tg._fb = b64u('feedback:' + m[1]); return tg._fb; }
      } catch (e) {}
    }
    // 3) fallback: dùng chính fbid trong link/id (nhiều bài ảnh có feedback_target = fbid)
    var fbid = (tg.url && (tg.url.match(/[?&]fbid=(\d+)/) || tg.url.match(/story_fbid=(\d+)/) || [])[1]) || tg.id;
    if (fbid) { tg._fb = b64u('feedback:' + fbid); return tg._fb; }
    return '';
  }
  // Bình luận đóng vai Page qua GraphQL. Trả {ok,id} hoặc {ok:false,err}.
  // dataURL -> {bytes,name,type} cho photoUpload.
  function dataUrlToImg(dataUrl) {
    try {
      var s = String(dataUrl || ''), comma = s.indexOf(','); if (comma < 0) return null;
      var type = (s.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
      var bin = atob(s.slice(comma + 1)), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return { bytes: u8, name: 'seed.jpg', type: type };
    } catch (e) { return null; }
  }
  // Upload 1 ảnh (dataURL) để đính vào comment. Dùng ĐÚNG đường ảnh đã chạy tốt (album):
  // Graph POST /{pageId}/photos?published=false (token page) qua EB.uploadReel -> trả photo id.
  async function uploadCommentPhoto(s, dataUrl) {
    var img = dataUrlToImg(dataUrl); if (!img) return '';
    if (!s.token) { seedLog('📷 page ' + (s.name || s.id) + ' chưa có token page — không upload được ảnh comment. Bấm "Load Page Từ Clone" để lấy token rồi seed lại.', 'err'); return ''; }
    try {
      var r = await photoUpload(s.id, img, s.token, false);
      if (r && r.id) return String(r.id);
      seedLog('📷 upload ảnh comment (page ' + s.id + ') không có id: ' + JSON.stringify(r).slice(0, 140), 'err');
    } catch (e) { seedLog('📷 upload ảnh comment lỗi (page ' + s.id + '): ' + ((e && e.message) || e), 'err'); }
    return '';
  }
  // Cảm xúc FB (feedback_reaction_id) — capture thật 17/09/2026 từ CometUFIFeedbackReactMutation.
  var REACT_IDS = { like: '1635855486666999', love: '1678524932434102', care: '613557422527858', haha: '115940658764963', wow: '478547315650144', sad: '908563459236466', angry: '444813342392137' };
  var REACT_DOC = '27646120298312844';   // doc_id CometUFIFeedbackReactMutation (capture thật; s.reactDoc scrape được thì ưu tiên)
  var REACT_EMO = { like: '👍', love: '❤️', care: '🥰', haha: '😆', wow: '😮', sad: '😢', angry: '😡' };
  var REACT_NAMES = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'];
  // Thả cảm xúc đóng-vai-Page. Ưu tiên GraphQL (mọi cảm xúc) nếu scrape được doc_id; nếu không thì lùi Graph /likes (chỉ Thích).
  async function reactAsPage(s, tg, name) {
    var rid = REACT_IDS[name] || REACT_IDS.like;
    var doc = s.reactDoc || REACT_DOC;
    var proxy = (s.cl && s.cl.proxy) || '';
    if (doc && (await seederAuth(s))) {
      var cookie = (s.cl && s.cl.cookie) || s.cookie;
      var fb = await feedbackIdOf(tg, cookie, proxy);
      if (fb) {
        // Định dạng capture thật: cần feedback_source NEWS_FEED + biến relay provider bắt buộc.
        var vars = {
          input: { attribution_id_v2: null, feedback_id: fb, feedback_reaction_id: rid, feedback_source: 'NEWS_FEED', session_id: uuid4(), actor_id: s.actorId, client_mutation_id: '1' },
          scale: 1, canUseNicknameOnComet: false, useDefaultActor: false,
          __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false
        };
        var body = new URLSearchParams();
        body.set('av', s.actorId); body.set('__user', s.actorId); body.set('__a', '1');
        body.set('fb_dtsg', s.dtsg); body.set('jazoest', jazoest(s.dtsg)); if (s.lsd) body.set('lsd', s.lsd);
        body.set('fb_api_caller_class', 'RelayModern'); body.set('fb_api_req_friendly_name', 'CometUFIFeedbackReactMutation');
        body.set('variables', JSON.stringify(vars)); body.set('server_timestamps', 'true'); body.set('doc_id', doc);
        var ck = String(cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + s.actorId;
        try {
          var r = await ebFetchP('https://www.facebook.com/api/graphql/', ck, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-friendly-name': 'CometUFIFeedbackReactMutation', 'x-fb-lsd': s.lsd || '', 'x-asbd-id': '129477' }, body: body.toString() }, proxy);
          var txt = ((r && r.text) || '').replace(/^for \(;;\);/, '');
          var j = null; try { j = JSON.parse(txt); } catch (e) {}
          if (j && j.data && !j.errors) return { ok: true, name: name };
          if (!j && !/"errors"|"errorSummary"|missing_required/.test(txt) && /feedback|reaction/.test(txt)) return { ok: true, name: name };
        } catch (e) {}
      }
    }
    // Fallback: Graph /likes (chỉ LIKE) bằng token page.
    if (s.token) { try { var lr = await graph('POST', GVER + '/' + tg.id + '/likes?access_token=' + enc(s.token), proxy); if (lr.json === true || (lr.json && lr.json.success)) return { ok: true, name: 'like', fell: 1 }; } catch (e) {} }
    return { ok: false };
  }
  // Comment kèm ẢNH bằng Graph API: upload ảnh unpublished lấy id -> POST /{post}/comments?attachment_id=…
  // Đăng đóng-vai-Page bằng token page. Graph chỉ gắn 1 ảnh/comment nên lấy ảnh đầu.
  async function commentPhotoViaGraph(s, tg, msg, imgs) {
    if (!s.token) return { ok: false, err: 'cần token page để comment ảnh — bấm "Load Page Từ Clone"' };
    var pid = await uploadCommentPhoto(s, imgs[0]);
    if (!pid) return { ok: false, err: 'không upload được ảnh comment (page ' + s.id + ')' };
    if (imgs.length > 1) seedLog('📷 Graph chỉ gắn 1 ảnh/comment — dùng ảnh đầu (bỏ ' + (imgs.length - 1) + ' ảnh).');
    var q = GVER + '/' + tg.id + '/comments?attachment_id=' + enc(pid) + '&access_token=' + enc(s.token);
    if (msg) q += '&message=' + enc(msg);
    var r = await graph('POST', q, (s.cl && s.cl.proxy) || '');
    if (r.json && r.json.id) return { ok: true, id: r.json.id };
    return { ok: false, err: errStr(r.json) || ('HTTP ' + ((r && r.status) || '?')) };
  }
  async function commentAsPage(s, tg, msg, imgs) {
    if (!(await seederAuth(s))) return { ok: false, err: 'auth page ' + s.id + ': ' + (s._authErr || '?') };
    var cookie = (s.cl && s.cl.cookie) || s.cookie;
    var proxy = (s.cl && s.cl.proxy) || '';
    var fb = await feedbackIdOf(tg, cookie, proxy); if (!fb) return { ok: false, err: 'không resolve feedback_id bài ' + tg.id };
    var vars = {
      feedLocation: 'TAHOE', feedbackSource: 41, groupID: null,
      input: {
        client_mutation_id: '1', attachments: null, feedback_id: fb,
        message: { ranges: [], text: msg }, feedback_source: 'TAHOE',
        idempotence_token: 'client:' + uuid4(), session_id: uuid4()
      },
      scale: 1, useDefaultActor: false
    };
    var body = new URLSearchParams();
    body.set('av', s.actorId); body.set('__user', s.actorId); body.set('__a', '1');
    body.set('fb_dtsg', s.dtsg); body.set('jazoest', jazoest(s.dtsg)); if (s.lsd) body.set('lsd', s.lsd);
    body.set('fb_api_caller_class', 'RelayModern');
    body.set('fb_api_req_friendly_name', COMMENT_FN);
    body.set('variables', JSON.stringify(vars)); body.set('server_timestamps', 'true');
    body.set('doc_id', COMMENT_DOC);
    var ck = String(cookie).replace(/;?\s*i_user=\d+/g, '') + '; i_user=' + s.actorId;
    var r = await ebFetchP('https://www.facebook.com/api/graphql/', ck, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-friendly-name': COMMENT_FN, 'x-fb-lsd': s.lsd || '', 'x-asbd-id': '129477' },
      body: body.toString()
    }, proxy);
    var txt = ((r && r.text) || '').replace(/^for \(;;\);/, '');
    var j = null; try { j = JSON.parse(txt); } catch (e) {}
    var cid = (txt.match(/"legacy_fbid":"(\d+)"/) || txt.match(/"id":"(Y29tbWVud[^"]+)"/) || [])[1] || '';
    if (cid) return { ok: true, id: cid };
    // Trích thông báo lỗi từ nhiều dạng: {error,errorSummary} | {errors:[{message,description,summary}]} | payload.error
    var em = '';
    if (j && j.errorSummary) em = j.errorSummary + (j.errorDescription ? (' — ' + j.errorDescription) : '');
    else if (j && j.errors && j.errors[0]) { var e0 = j.errors[0]; em = (e0.summary ? e0.summary + ': ' : '') + (e0.description || e0.message || JSON.stringify(e0)); }
    else if (j && j.payload && j.payload.error) em = String(j.payload.error);
    if (!em) em = (txt.match(/"(?:message|description)":"([^"]{0,180})"/) || [])[1] || '';
    // FB trả HTML thay vì JSON = request KHÔNG được xử lý như GraphQL (sai i_user/dtsg → trang login/checkpoint).
    if (!em && /^\s*(?:<!doctype html|<html)/i.test(txt)) {
      var ttl = (txt.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
      var kind = /log ?in|đăng nhập|you must log in/i.test(txt) ? 'LOGIN' : /checkpoint|xác nhận danh tính|confirm your identity|tạm khoá|temporarily/i.test(txt) ? 'CHECKPOINT' : 'HTML';
      em = 'FB trả trang ' + kind + (ttl ? (' "' + ttl.trim() + '"') : '') + ' — sai phiên đóng-vai-Page (actor=' + s.actorId + ', dtsg=' + (s.dtsg ? 'có' : 'THIẾU') + ')';
      s._authOk = false;
    }
    if (!em) em = 'GraphQL ' + ((j && j.error) || (r && r.status) || '?') + ' · ' + txt.slice(0, 160);
    if (/1357\d{3}/.test(txt) || /dtsg|expired/i.test(em)) s._authOk = false;   // dtsg hết hạn -> lấy lại
    return { ok: false, err: em, raw: txt.slice(0, 300) };
  }

  /* ───────────────────────── TẠO PAGE (Via) & TẠO PAGE TRONG BM ─────────────────────────
     Port từ agency.js (mutation thật capture 02/09), nhưng chạy ĐÓNG VAI USER của TỪNG CLONE
     bằng cookie clone (cloneFetch) thay vì tab đăng nhập chung:
       ① Via: AdditionalProfilePlusCreationMutation @ www.facebook.com/api/graphql (doc_id 23863457623296585)
       ② BM : BizKitSettingsCreateAdditionalProfilePlusMutation @ business.facebook.com/api/graphql (doc_id 37911097395202007)
     Cần fb_dtsg của NGỮ CẢNH USER (scrape www.facebook.com với cookie clone, KHÔNG i_user). */
  var PGSTOP = false, PGRUN = false;
  // Lấy uid + fb_dtsg + lsd (ngữ cảnh user) cho clone. Cache trên c.
  async function cloneUserAuth(c) {
    if (c._udtsg && c.uid) return true;
    if (!c.cookie) { c._uauthErr = 'clone thiếu cookie'; return false; }
    if (!c.uid) { var mm = String(c.cookie).match(/c_user=(\d+)/); if (mm) c.uid = mm[1]; }
    try {
      var t = await fbDoc('https://www.facebook.com/', String(c.cookie).replace(/;?\s*i_user=\d+/g, ''));
      c._udtsg = (t.match(/DTSGInitialData"[^}]*?"token":"([^"]+)"/) || t.match(/"dtsg":\{"token":"([^"]+)"/) || [])[1] || '';
      c._ulsd = (t.match(/"LSD",\[\],\{"token":"([^"]+)"/) || [])[1] || '';
      if (!c._udtsg) c._uauthErr = 'không lấy được dtsg (cookie hỏng?)';
    } catch (e) { c._uauthErr = (e && e.message) || String(e); }
    return !!(c._udtsg && c.uid);
  }
  function pgErr(txt) {
    txt = String(txt || '').replace(/^for\s*\(;;\);\s*/, '');
    var j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.errors && j.errors[0]) return (j.errors[0].message || j.errors[0].description || 'lỗi');
    if (j && j.error) return (j.error.error_user_msg || j.error.message || 'lỗi');
    var m = txt.match(/"(?:description|message)":"([^"]{0,160})"/); if (m) return m[1];
    if (/^\s*(?:<!doctype|<html)/i.test(txt)) return 'FB trả HTML (sai dtsg/cookie hoặc bị chặn)';
    return '';
  }
  async function createPageVia(c, name, cat, bio) {
    if (!(await cloneUserAuth(c))) return { ok: false, err: 'auth clone ' + (c.uid || '?') + ': ' + (c._uauthErr || '?') };
    var input = { bio: bio || '', categories: [cat], creation_source: 'comet', name: name, off_platform_creator_reachout_id: null, page_referrer: 'null', actor_id: c.uid, client_mutation_id: '1' };
    var body = new URLSearchParams({ av: c.uid, __user: c.uid, __a: '1', fb_dtsg: c._udtsg, jazoest: jazoest(c._udtsg), lsd: c._ulsd || '', fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'AdditionalProfilePlusCreationMutation', variables: JSON.stringify({ input: input }), doc_id: '23863457623296585', server_timestamps: 'true' }).toString();
    var r = await window.EB.cloneFetch('https://www.facebook.com/api/graphql/', String(c.cookie).replace(/;?\s*i_user=\d+/g, ''), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': c._ulsd || '', 'x-fb-friendly-name': 'AdditionalProfilePlusCreationMutation', 'x-asbd-id': '129477' }, body: body });
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, ''); var j = {}; try { j = JSON.parse(txt); } catch (e) {}
    if (j && (j.errors || j.error)) { if (/1357\d{3}/.test(txt)) c._udtsg = ''; return { ok: false, err: pgErr(txt) }; }
    if (!j || !j.data) { c._udtsg = ''; return { ok: false, err: pgErr(txt) || ('phản hồi lạ (' + (r && r.status) + ')') }; }
    var pid = ''; try { pid = j.data.additional_profile_plus_creation.additional_profile.id; } catch (e) {}
    return { ok: true, id: pid };
  }
  async function createPageBM(c, bmId, name, cat, bio) {
    if (!(await cloneUserAuth(c))) return { ok: false, err: 'auth clone ' + (c.uid || '?') + ': ' + (c._uauthErr || '?') };
    var input = { actor_id: c.uid, client_mutation_id: '1', business_id: bmId, categories: [cat], creation_source: 'meta_business_suite', bio: bio || null, name: name, casd_bl_disclosure_acceptance_data: null, qpl_join_id: uuid4() };
    var body = new URLSearchParams({ av: c.uid, __user: c.uid, __a: '1', fb_dtsg: c._udtsg, jazoest: jazoest(c._udtsg), lsd: c._ulsd || '', fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'BizKitSettingsCreateAdditionalProfilePlusMutation', variables: JSON.stringify({ input: input }), doc_id: '37911097395202007', server_timestamps: 'true' }).toString();
    var r = await window.EB.cloneFetch('https://business.facebook.com/api/graphql/', String(c.cookie).replace(/;?\s*i_user=\d+/g, ''), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': c._ulsd || '', 'x-fb-friendly-name': 'BizKitSettingsCreateAdditionalProfilePlusMutation', 'x-asbd-id': '129477' }, body: body });
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, ''); var j = {}; try { j = JSON.parse(txt); } catch (e) {}
    if (j && (j.errors || j.error)) { if (/1357\d{3}/.test(txt)) c._udtsg = ''; return { ok: false, err: pgErr(txt) }; }
    if (!j || !j.data) { c._udtsg = ''; return { ok: false, err: pgErr(txt) || ('phản hồi lạ (' + (r && r.status) + ')') }; }
    var pid = ''; try { pid = j.data.bizkit_create_additional_profile_plus.additional_profile.id; } catch (e) {}
    return { ok: true, id: pid || '' };
  }
  // BM (id) mà clone sở hữu — dùng khi user không nhập id BM.
  async function cloneBusinesses(c) {
    try {
      if (!c.token) await ensureToken(c);
      if (!c.token) return [];
      var r = await graph('GET', GVER + '/me/businesses?fields=id&limit=100&access_token=' + enc(c.token));
      return (r.json && r.json.data) ? r.json.data.map(function (b) { return String(b.id); }) : [];
    } catch (e) { return []; }
  }

  // Modal "Tạo Page / BM" — chạy theo clone đang bôi đen (không chọn = tất cả).
  function openPgTool() {
    if ($('reel-pgtool-ov')) return;
    var inp = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary,#000);font:13px inherit';
    var lab = 'font-size:12px;font-weight:600;display:block;margin-bottom:4px';
    var radio = 'flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:600;font-size:12.5px;line-height:1;cursor:pointer;margin:0;padding:11px 8px;border-radius:10px;border:1.5px solid var(--border-color,#e5d5df);white-space:nowrap;transition:border-color .12s,background .12s,color .12s;color:var(--text-secondary)';
    var ov = document.createElement('div');
    ov.id = 'reel-pgtool-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100005;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:auto;padding:20px';
    ov.innerHTML = '<div class="reel-modal" style="width:min(680px,96vw);max-height:92vh;overflow:auto;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:18px;box-shadow:0 16px 48px rgba(0,0,0,.4)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-weight:800;font-size:16px">🏭 Tạo Page / BM</div><button class="vbtn sec sm" id="reel-pg-x">✕</button></div>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Chạy theo <b>clone đang bôi đen</b> (không chọn = tất cả clone). Mỗi clone đóng vai chính nó bằng cookie — không cần đăng nhập tay.</div>'
      + '<div style="display:flex;gap:8px;margin-bottom:14px">'
      + '  <label style="' + radio + '"><input type="radio" name="reel-pg-mode" value="via" checked style="display:none"> ➕ Tạo Page (Via)</label>'
      + '  <label style="' + radio + '"><input type="radio" name="reel-pg-mode" value="bm" style="display:none"> 🏢 Tạo Page BM</label>'
      + '  <label style="' + radio + '"><input type="radio" name="reel-pg-mode" value="nhanbm" style="display:none"> 🔗 Nhận Link BM</label>'
      + '  <label style="' + radio + '"><input type="radio" name="reel-pg-mode" value="tokenbm" style="display:none"> 🔑 Token BM</label>'
      + '</div>'
      + '<div id="reel-pg-pagefields">'
      + '  <label style="' + lab + '">Danh sách tên Page <span style="font-weight:400;opacity:.6">(mỗi dòng 1 tên · mỗi clone tạo tất cả tên này)</span></label>'
      + '  <textarea id="reel-pg-names" style="' + inp + ';height:120px;margin-bottom:10px" placeholder="Tên Page 1&#10;Tên Page 2&#10;…"></textarea>'
      + '  <div id="reel-pg-bmbox" style="display:none;margin-bottom:10px"><label style="' + lab + '">ID BM <span style="font-weight:400;opacity:.6">(mỗi dòng/cách nhau 1 id · TRỐNG = tự lấy BM của clone)</span></label><textarea id="reel-pg-bms" style="' + inp + ';height:56px" placeholder="Dán ID BM… (để trống nếu muốn dùng BM của chính clone)"></textarea></div>'
      + '  <div style="display:flex;gap:10px;margin-bottom:10px"><div style="flex:2"><label style="' + lab + '">Category ID</label><input id="reel-pg-cat" value="200600219953504" style="' + inp + '"></div>'
      + '  <div style="flex:1"><label style="' + lab + '">Delay tối thiểu (s)</label><input id="reel-pg-dmin" type="number" min="0" step="1" style="' + inp + '"></div>'
      + '  <div style="flex:1"><label style="' + lab + '">Delay tối đa (s)</label><input id="reel-pg-dmax" type="number" min="0" step="1" style="' + inp + '"></div></div>'
      + '  <label style="' + lab + '">Mô tả / Bio <span style="font-weight:400;opacity:.6">(tuỳ chọn)</span></label><textarea id="reel-pg-bio" style="' + inp + ';height:52px;margin-bottom:12px"></textarea>'
      + '  <label style="' + lab + '">Ảnh đại diện Page <span style="font-weight:400;opacity:.6">(tuỳ chọn · JPG/PNG)</span></label>'
      + '  <input id="reel-pg-avatar" type="file" accept="image/*" style="' + inp + ';margin-bottom:6px;padding:6px">'
      + '  <label style="' + lab + '">…hoặc cả THƯ MỤC avatar <span style="font-weight:400;opacity:.6">(mỗi page 1 ảnh khác nhau · theo thứ tự tên file · hết thì quay vòng)</span></label>'
      + '  <input id="reel-pg-avdir" type="file" accept="image/*" webkitdirectory multiple style="' + inp + ';margin-bottom:12px;padding:6px">'
      + '</div>'
      + '<div id="reel-pg-linkbox" style="display:none;margin-bottom:12px"><label style="' + lab + '">Link mời BM <span style="font-weight:400;opacity:.6">(mỗi dòng 1 link · ghép lần lượt: clone 1 ← link 1, clone 2 ← link 2…)</span></label><textarea id="reel-pg-links" style="' + inp + ';height:120px" placeholder="https://business.facebook.com/...token=...&#10;…"></textarea></div>'
      + '<div id="reel-pg-tokbox" style="display:none">'
      + '  <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Chạy bằng <b>clone BM admin đang bôi đen</b> (cookie chính chủ). Với mỗi App → tạo <b>System User token</b>, rồi gán Page cho System User theo lô.</div>'
      + '  <div style="display:flex;gap:10px;margin-bottom:10px"><div style="flex:1"><label style="' + lab + '">ID BM</label><input id="reel-tb-bm" style="' + inp + '" placeholder="548116425053922"></div><div style="flex:1"><label style="' + lab + '">System User ID <span style="font-weight:400;opacity:.6">(Nhận Bởi)</span></label><input id="reel-tb-su" style="' + inp + '" placeholder="61594707963854"></div></div>'
      + '  <label style="' + lab + '">List App ID <span style="font-weight:400;opacity:.6">(mỗi dòng 1 app · mỗi app tạo 1 token)</span></label>'
      + '  <textarea id="reel-tb-apps" style="' + inp + ';height:90px;margin-bottom:10px" placeholder="987485567053443&#10;…"></textarea>'
      + '  <label style="' + lab + '">Scopes <span style="font-weight:400;opacity:.6">(cách nhau dấu phẩy)</span></label>'
      + '  <input id="reel-tb-scopes" style="' + inp + ';margin-bottom:10px" value="pages_show_list,pages_read_engagement,pages_manage_ads">'
      + '  <label style="' + lab + '">Page ID cần gán <span style="font-weight:400;opacity:.6">(mỗi dòng 1 id · TRỐNG = dùng page đã load ở bảng Page+Token)</span></label>'
      + '  <textarea id="reel-tb-pages" style="' + inp + ';height:90px;margin-bottom:10px" placeholder="Trống = tự lấy page đã load…"></textarea>'
      + '  <div style="display:flex;gap:10px;margin-bottom:6px"><div style="width:160px"><label style="' + lab + '">Số page / lô gán</label><input id="reel-tb-per" type="number" value="50" min="1" style="' + inp + '"></div></div>'
      + '</div>'
      + '<div id="reel-pg-log" style="font-size:12px;line-height:1.5;max-height:170px;overflow:auto;background:var(--bg-primary,#fffafd);border:1px solid var(--border-color,#eee);border-radius:9px;padding:8px;margin-bottom:12px;white-space:pre-wrap"></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '  <span id="reel-pg-stat" style="font-size:12px;font-weight:600;color:var(--text-secondary)"></span>'
      + '  <span style="display:flex;gap:8px"><button class="vbtn danger sm" id="reel-pg-stop" disabled>■ Dừng</button><button class="vbtn sm" id="reel-pg-run">▶ Bắt đầu</button></span>'
      + '</div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    function close() { if (PGRUN) { PGSTOP = true; return; } if (ov.parentNode) ov.parentNode.removeChild(ov); }
    q('reel-pg-x').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !PGRUN) close(); });
    function paintModes() {
      ov.querySelectorAll('input[name="reel-pg-mode"]').forEach(function (r) {
        var lb = r.closest('label'); if (!lb) return;
        if (r.checked) { lb.style.borderColor = 'var(--primary-accent,#BE185D)'; lb.style.background = 'var(--primary-accent-weak,#fdf2f8)'; lb.style.color = 'var(--primary-accent,#BE185D)'; }
        else { lb.style.borderColor = 'var(--border-color,#e5d5df)'; lb.style.background = 'transparent'; lb.style.color = 'var(--text-secondary)'; }
      });
    }
    ov.querySelectorAll('input[name="reel-pg-mode"]').forEach(function (r) {
      r.onchange = function () {
        if (!this.checked) return;
        var m = this.value;
        q('reel-pg-pagefields').style.display = (m === 'nhanbm' || m === 'tokenbm') ? 'none' : '';
        q('reel-pg-linkbox').style.display = (m === 'nhanbm') ? '' : 'none';
        q('reel-pg-bmbox').style.display = (m === 'bm') ? '' : 'none';
        q('reel-pg-tokbox').style.display = (m === 'tokenbm') ? '' : 'none';
        paintModes();
      };
    });
    paintModes();
    var _pd = {}; try { _pd = JSON.parse(localStorage.getItem('kz_reel_pgdelay') || '{}') || {}; } catch (e) {}
    q('reel-pg-dmin').value = (_pd.min != null) ? _pd.min : 30;
    q('reel-pg-dmax').value = (_pd.max != null) ? _pd.max : 60;
    var logEl = q('reel-pg-log');
    function plog(m) { logEl.textContent += (logEl.textContent ? '\n' : '') + m; logEl.scrollTop = logEl.scrollHeight; }
    q('reel-pg-run').onclick = async function () {
      if (PGRUN) return;
      var mode = (ov.querySelector('input[name="reel-pg-mode"]:checked') || {}).value || 'via';
      if (mode === 'tokenbm') {
        var tbBm = (q('reel-tb-bm').value || '').trim();
        var tbSu = (q('reel-tb-su').value || '').trim();
        var tbApps = (q('reel-tb-apps').value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\d{5,}$/.test(s); });
        var tbScopes = (q('reel-tb-scopes').value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        var tbPages = (q('reel-tb-pages').value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\d{5,}$/.test(s); });
        var tbPer = Math.max(1, parseInt(q('reel-tb-per').value, 10) || 50);
        if (!/^\d{5,}$/.test(tbBm)) { plog('⚠️ Thiếu/sai ID BM.'); return; }
        if (!/^\d{5,}$/.test(tbSu)) { plog('⚠️ Thiếu/sai System User ID.'); return; }
        if (!tbApps.length) { plog('⚠️ Chưa nhập List App ID.'); return; }
        PGRUN = true; PGSTOP = false; q('reel-pg-run').disabled = true; q('reel-pg-stop').disabled = false;
        try { await runTokenBM({ bmId: tbBm, suId: tbSu, apps: tbApps, scopes: tbScopes, pageIds: tbPages, per: tbPer }, plog, q('reel-pg-stat')); }
        catch (e) { plog('✗ Lỗi: ' + ((e && e.message) || e)); }
        finally { PGRUN = false; q('reel-pg-run').disabled = false; q('reel-pg-stop').disabled = true; }
        return;
      }
      var names = (q('reel-pg-names').value || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      var links = (q('reel-pg-links').value || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (mode === 'nhanbm') { if (!links.length) { plog('⚠️ Chưa dán link mời BM.'); return; } }
      else if (!names.length) { plog('⚠️ Chưa nhập tên Page.'); return; }
      var cat = (q('reel-pg-cat').value || '').trim() || '200600219953504';
      var bio = (q('reel-pg-bio').value || '').trim();
      // Avatar: ưu tiên cả thư mục (mỗi page 1 ảnh khác, sắp theo tên); không có thì dùng 1 ảnh lẻ cho mọi page
      var avFiles = Array.from(q('reel-pg-avdir').files || []).filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name); });
      avFiles.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }); });
      if (!avFiles.length) { var one = (q('reel-pg-avatar').files || [])[0]; if (one) avFiles = [one]; }
      var bmIds = (q('reel-pg-bms').value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\d{5,}$/.test(s); });
      var dmin = Math.max(0, parseInt(q('reel-pg-dmin').value, 10) || 0), dmax = Math.max(0, parseInt(q('reel-pg-dmax').value, 10) || 0);
      if (dmax < dmin) { var _t = dmin; dmin = dmax; dmax = _t; }
      q('reel-pg-dmin').value = dmin; q('reel-pg-dmax').value = dmax;
      try { localStorage.setItem('kz_reel_pgdelay', JSON.stringify({ min: dmin, max: dmax })); } catch (e) {}
      PGRUN = true; PGSTOP = false; q('reel-pg-run').disabled = true; q('reel-pg-stop').disabled = false;
      try { await runPgTool(mode, names, cat, bio, bmIds, plog, q('reel-pg-stat'), links, { min: dmin, max: dmax }, avFiles); }
      catch (e) { plog('✗ Lỗi: ' + ((e && e.message) || e)); }
      finally { PGRUN = false; q('reel-pg-run').disabled = false; q('reel-pg-stop').disabled = true; }
    };
    q('reel-pg-stop').onclick = function () { PGSTOP = true; plog('⏹ Đang dừng…'); };
  }
  async function runPgTool(mode, names, cat, bio, bmIds, plog, statEl, links, delay, avatarFiles) {
    delay = delay || { min: 0, max: 0 };
    avatarFiles = avatarFiles || [];
    // Mỗi page lấy 1 avatar khác nhau theo thứ tự; hết danh sách thì quay vòng. Lỗi avatar không tính là lỗi tạo page.
    var avIdx = 0;
    async function applyAvatar(c, pid, label) {
      if (!avatarFiles.length || !pid) return;
      var file = avatarFiles[avIdx++ % avatarFiles.length];
      await sleep(3000); // chờ Page mới tạo sẵn sàng hẳn, tránh FB từ chối (1357054)
      for (var attempt = 1; attempt <= 3 && !PGSTOP; attempt++) {
        try {
          var ra = await setPageAvatar(c, pid, file);
          if (ra && ra.ok) { plog('    🖼️ avatar OK (' + file.name + ')'); return; }
          if (attempt < 3) { plog('    … avatar thử lại lần ' + attempt + ' (' + (ra && ra.err) + ')'); if (c._delSeed) delete c._delSeed[pid]; await sleep(4000); continue; }
          plog('    ⚠️ avatar lỗi: ' + (ra && ra.err));
        } catch (e) {
          if (attempt < 3) { if (c._delSeed) delete c._delSeed[pid]; await sleep(4000); continue; }
          plog('    ⚠️ avatar lỗi: ' + ((e && e.message) || e));
        }
      }
    }
    // Chờ ngẫu nhiên [min,max] giây giữa 2 lần tạo Page — chia nhỏ để bấm Dừng có hiệu lực ngay.
    async function pgWait() {
      var ms = Math.round((delay.min + Math.random() * (delay.max - delay.min)) * 1000);
      if (ms <= 0) { await sleep(500); return; }
      plog('  ⏳ chờ ' + Math.round(ms / 1000) + 's…');
      var end = Date.now() + ms;
      while (!PGSTOP && Date.now() < end) await sleep(Math.min(500, end - Date.now()));
    }
    applyClones();
    var idxs = selCloneIdx(); if (!idxs.length) idxs = CLONES.map(function (_, i) { return i; });
    if (!idxs.length) { plog('⚠️ Chưa có clone (dán clone ở tab Clone trước).'); return; }
    if (mode === 'nhanbm' && !window.cloneClaimBMLink) { plog('⚠️ Nhận Link BM chưa sẵn sàng (dashboard.js chưa nạp) — Ctrl+F5 lại.'); return; }
    var ok = 0, err = 0;
    function setStat() { if (statEl) statEl.textContent = 'OK ' + ok + ' · Lỗi ' + err; }
    plog('▶ Bắt đầu · ' + idxs.length + ' clone · ' + (mode === 'bm' ? 'Tạo Page trong BM' : mode === 'nhanbm' ? 'Nhận Link BM' : 'Tạo Page (Via)')
      + ((mode === 'bm' || mode === 'via') ? ' · delay ' + delay.min + '–' + delay.max + 's' : ''));
    for (var k = 0; k < idxs.length && !PGSTOP; k++) {
      var c = CLONES[idxs[k]]; if (!c) continue;
      var tag = 'clone#' + (idxs[k] + 1) + ' (' + (c.uid || '?') + ')';
      if (mode === 'nhanbm') {
        var link = (links || [])[k];
        if (!link) { plog('  – ' + tag + ': hết link (chỉ có ' + (links || []).length + ' link cho ' + idxs.length + ' clone).'); break; }
        if (!c.token) { try { await ensureToken(c); } catch (e) {} }
        try {
          var res = await window.cloneClaimBMLink({ token: c.token || '', cookie: c.cookie || '', _uid: c.uid || '' }, link, 'Via', c.uid || 'User');
          if (res === 'OK') { ok++; plog('  ✓ ' + tag + ' nhận BM ok'); }
          else { err++; plog('  ✗ ' + tag + ': ' + res); }
        } catch (e) { err++; plog('  ✗ ' + tag + ': ' + ((e && e.message) || e)); }
        setStat(); if (!PGSTOP) await sleep(600);
        continue;
      }
      if (mode === 'bm') {
        var bms = bmIds.length ? bmIds : await cloneBusinesses(c);
        if (!bms.length) { plog('  – ' + tag + ': không có BM (nhập ID BM, hoặc clone chưa có BM/token).'); continue; }
        for (var bi = 0; bi < bms.length && !PGSTOP; bi++) {
          for (var ni = 0; ni < names.length && !PGSTOP; ni++) {
            var r = await createPageBM(c, bms[bi], names[ni], cat, bio);
            if (r.ok) { ok++; plog('  ✓ ' + tag + ' · BM ' + bms[bi] + ' → "' + names[ni] + '"' + (r.id ? (' · id ' + r.id) : '')); await applyAvatar(c, r.id, names[ni]); }
            else { err++; plog('  ✗ ' + tag + ' · BM ' + bms[bi] + ' → "' + names[ni] + '": ' + r.err); }
            setStat();
            if (!PGSTOP && !(k === idxs.length - 1 && bi === bms.length - 1 && ni === names.length - 1)) await pgWait();
          }
        }
      } else {
        for (var vi = 0; vi < names.length && !PGSTOP; vi++) {
          var rr = await createPageVia(c, names[vi], cat, bio);
          if (rr.ok) { ok++; plog('  ✓ ' + tag + ' → "' + names[vi] + '"' + (rr.id ? (' · id ' + rr.id) : '')); await applyAvatar(c, rr.id, names[vi]); }
          else { err++; plog('  ✗ ' + tag + ' → "' + names[vi] + '": ' + rr.err); }
          setStat();
          if (!PGSTOP && !(k === idxs.length - 1 && vi === names.length - 1)) await pgWait();
        }
      }
    }
    plog((PGSTOP ? '⏹ Đã dừng. ' : '✅ Xong. ') + 'Tổng: OK ' + ok + ' · Lỗi ' + err);
    setStat();
  }

  /* ───────── 🔑 TOKEN BM: tạo System User token + gán Page (capture 25/09, xem SPEC-TaoToken-GanPage.md) ───────── */
  var TB_TASKS = ['556750461849806','275298030109664','696659004201852','270956550540539','794616964377599','997951390947110','967977242754531','1370797498202499','1646638482463332','461340961883703','2565488997052663','290727579301631'];
  var TB_ASSETTYPES = ['PAGE','AD_ACCOUNT','PRODUCT_CATALOG','APP','PIXEL','INSTAGRAM_ACCOUNT_V2','OFFLINE_CONVERSION_DATA_SET','BLOCK_LIST','OWNED_DOMAIN','WHATSAPP_BUSINESS_ACCOUNT','BUSINESS_RESOURCE_GROUP','BUSINESS_CREATIVE_FOLDER','EVENTS_DATASET_NEW'];
  // POST 1 mutation graphql business.facebook.com bằng clone actor (BM admin), đóng vai chính chủ.
  async function tbGraph(c, friendly, docId, vars) {
    if (!(await cloneUserAuth(c))) return { ok: false, err: 'auth clone ' + (c.uid || '?') + ': ' + (c._uauthErr || '?') };
    var body = new URLSearchParams({ av: c.uid, __user: c.uid, __a: '1', fb_dtsg: c._udtsg, jazoest: jazoest(c._udtsg), lsd: c._ulsd || '', fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: friendly, variables: JSON.stringify(vars), doc_id: docId, server_timestamps: 'true' }).toString();
    var r = await window.EB.cloneFetch('https://business.facebook.com/api/graphql/', String(c.cookie).replace(/;?\s*i_user=\d+/g, ''), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': c._ulsd || '', 'x-fb-friendly-name': friendly, 'x-asbd-id': '129477' }, body: body });
    var txt = ((r && r.text) || '').replace(/^for\s*\(;;\);\s*/, ''); var j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (/1357\d{3}/.test(txt)) c._udtsg = '';   // dtsg hỏng -> buộc lấy lại lần sau
    return { ok: !!(j && j.data && !j.errors), json: j, txt: txt };
  }
  async function genSysUserToken(c, bmId, suId, appId, scopes) {
    var vars = { input: { system_user_id: suId, app_id: appId, set_token_expires_in_60_days: false, scopes: scopes } };
    var r = await tbGraph(c, 'BizKitSettingsSystemUserAccessTokenGenerationStepperModalMutation', '24017239884555932', vars);
    var tok = ''; try { var m = r.txt.match(/"access_token":"([^"]+)"/) || r.txt.match(/(EAA[A-Za-z0-9]{40,})/); if (m) tok = m[1]; } catch (e) {}
    if (tok) return { ok: true, token: tok };
    return { ok: false, err: pgErr(r.txt) || ('không lấy được token (' + (r.txt.slice(0, 120) || 'rỗng') + ')') };
  }
  async function assignPagesToUser(c, bmId, suId, pageIds) {
    var vars = { businessID: bmId, assetIDs: pageIds, userID: suId, taskIDs: TB_TASKS, assetTypes: TB_ASSETTYPES, countLimit: 51, shouldRecommendAssets: true, shouldSkipAssignedAssetsConnection: false };
    var r = await tbGraph(c, 'useBulkAssignAssetsToUsersMutation', '27323734427230655', vars);
    if (r.ok) return { ok: true };
    return { ok: false, err: pgErr(r.txt) || 'gán page lỗi' };
  }
  async function runTokenBM(opts, plog, statEl) {
    applyClones();
    var idxs = selCloneIdx(); if (!idxs.length) idxs = CLONES.map(function (_, i) { return i; });
    if (!idxs.length) { plog('⚠️ Chưa có clone BM admin (dán clone ở tab Clone, bôi đen clone admin của BM).'); return; }
    var c = CLONES[idxs[0]];   // actor = clone BM admin đầu tiên đang bôi đen
    if (!c || !c.cookie) { plog('⚠️ Clone actor thiếu cookie.'); return; }
    var pageIds = (opts.pageIds || []).slice();
    if (!pageIds.length) { var seen = {}; CLONES.forEach(function (cl) { (cl.pages || []).forEach(function (p) { if (p && p.id && !seen[p.id]) { seen[p.id] = 1; pageIds.push(String(p.id)); } }); }); }
    var scopes = (opts.scopes && opts.scopes.length) ? opts.scopes : ['pages_show_list', 'pages_read_engagement', 'pages_manage_ads'];
    plog('▶ BM ' + opts.bmId + ' · SU ' + opts.suId + ' · ' + opts.apps.length + ' app · ' + pageIds.length + ' page · actor clone#' + (idxs[0] + 1) + ' (' + (c.uid || '?') + ')');
    // 1) tạo token cho từng app
    var tokOk = 0, tokErr = 0, tokens = [];
    function setStat() { if (statEl) statEl.textContent = 'Token OK ' + tokOk + ' · Lỗi ' + tokErr + (pageIds.length ? (' · Page ' + assignedCnt + '/' + pageIds.length) : ''); }
    var assignedCnt = 0;
    for (var a = 0; a < opts.apps.length && !PGSTOP; a++) {
      var rt = await genSysUserToken(c, opts.bmId, opts.suId, opts.apps[a], scopes);
      if (rt.ok) { tokOk++; tokens.push(opts.apps[a] + '|' + rt.token); plog('  ✓ Token app ' + opts.apps[a] + ': ' + rt.token.slice(0, 20) + '… (' + rt.token.length + ')'); }
      else { tokErr++; plog('  ✗ Token app ' + opts.apps[a] + ': ' + rt.err); }
      setStat(); if (!PGSTOP) await sleep(700);
    }
    // 2) gán page cho System User theo lô (mỗi page gán 1 lần cho SU; tất cả token dùng chung)
    for (var i = 0; i < pageIds.length && !PGSTOP; i += opts.per) {
      var lot = pageIds.slice(i, i + opts.per);
      var ra = await assignPagesToUser(c, opts.bmId, opts.suId, lot);
      if (ra.ok) { assignedCnt += lot.length; plog('  ✓ Gán ' + lot.length + ' page (lô ' + (Math.floor(i / opts.per) + 1) + ')'); }
      else { plog('  ✗ Gán lô ' + (Math.floor(i / opts.per) + 1) + ' (' + lot.length + ' page): ' + ra.err); }
      setStat(); if (!PGSTOP) await sleep(800);
    }
    if (tokens.length) plog('\n📋 TOKENS (app|token) — copy lại để dùng:\n' + tokens.join('\n'));
    plog((PGSTOP ? '⏹ Đã dừng. ' : '✅ Xong. ') + 'Token OK ' + tokOk + '/' + opts.apps.length + ' · Page gán ' + assignedCnt + '/' + pageIds.length);
    setStat();
  }

  // Lõi seeding dùng chung cho CHẠY NGAY và CHẠY THEO LỊCH. opts:{targets,seeders,seed,per,delayMs,maxPer,like}
  async function doSeed(opts) {
    var targets = opts.targets, seeders = opts.seeders, seed = opts.seed || [];
    var per = (opts.per > 0) ? opts.per : seeders.length;
    var delayMs = Math.max(0, opts.delayMs || 0), maxPer = opts.maxPer || 0;
    var okc = 0, errc = 0, ptr = 0, cnt = {}, skipped = {};
    // Gán chỉ số ổn định cho từng page seed để xoay vòng mẫu: page thứ 1 → mẫu 1, page 2 → mẫu 2…
    var _pi = 0, _seen = {}; seeders.forEach(function (s) { if (_seen[s.id] == null) { _seen[s.id] = _pi++; } s._si = _seen[s.id]; });
    // Bài chưa biết page chủ -> hỏi Facebook (bằng 1 token bất kỳ) để không cho page tự seed bài mình.
    // Sau F5 có thể KHÔNG còn token nào (chỉ còn cookie) -> bỏ qua bước này, dựa vào ownerOf từ POSTED.
    var probeTok = ''; for (var st = 0; st < seeders.length; st++) { if (seeders[st].token) { probeTok = seeders[st].token; break; } }
    if (probeTok) for (var oi = 0; oi < targets.length && !SEEDSTOP; oi++) {
      if (targets[oi].owner) continue;
      try {
        var fr = await graph('GET', GVER + '/' + targets[oi].id + '?fields=from&access_token=' + enc(probeTok));
        if (fr.json && fr.json.from && fr.json.from.id) { targets[oi].owner = String(fr.json.from.id); seedLog('🔎 bài ' + targets[oi].id + ' của page ' + (fr.json.from.name || targets[oi].owner)); }
        else seedLog('🔎 bài ' + targets[oi].id + ': bài của Page khác — sẽ seed qua GraphQL (đóng vai Page).');
      } catch (e) {}
    }
    for (var ti = 0; ti < targets.length && !SEEDSTOP; ti++) {
      var tg = targets[ti], done = 0, tries = 0, cntPost = {};
      while (done < per && tries < seeders.length && !SEEDSTOP) {
        var s = seeders[ptr % seeders.length]; ptr++; tries++;
        if (!opts.self && s.id === tg.owner) continue;
        // maxPer = số comment tối đa mỗi page TRÊN MỖI BÀI (cntPost reset theo từng bài),
        // không phải tổng cả phiên — nếu không bài sau sẽ bị bỏ khi page đã đạt quota ở bài trước.
        if (maxPer > 0 && (cntPost[s.id] || 0) >= maxPer) continue;
        // Gán cứng page→mẫu (nếu có) → dùng đúng mẫu đó; nếu không thì xoay vòng theo page (s._si) + bài (ti).
        var pk = null, _mi = (opts.map && opts.map[s.id] != null) ? opts.map[s.id] : -1;
        if (_mi >= 0 && seed[_mi]) { var _nm = seedNorm(seed[_mi]); if (_nm.t.trim() || _nm.imgs.length) pk = _nm; }
        if (!pk) pk = pickSeedRaw(seed, { done: cnt[s.id] || 0, offset: (s._si || 0) + ti }, true);
        var msg = spin(pk.t), imgs = pk.imgs || [];
        if (!msg && !imgs.length) { SEEDSTOP = true; break; }
        try {
          if (opts.react && opts.react !== 'off') {
            var rn = (opts.react === 'random') ? REACT_NAMES[Math.floor(Math.random() * REACT_NAMES.length)] : opts.react;
            try { var rr = await reactAsPage(s, tg, rn); if (rr.ok) seedLog((REACT_EMO[rr.name] || '👍') + ' ' + (s.name || s.id) + ' → bài ' + tg.id); } catch (el) {}
          }
          var cg;
          if (imgs.length) {
            // COMMENT KÈM ẢNH: Graph API /comments với attachment_id (ảnh unpublished) — đường FB hỗ trợ chính thức.
            cg = await commentPhotoViaGraph(s, tg, msg, imgs);
            if (cg.ok) { okc++; done++; cnt[s.id] = (cnt[s.id] || 0) + 1; cntPost[s.id] = (cntPost[s.id] || 0) + 1; bumpCmt(1); seedLog('🌱📷 ' + (s.name || s.id) + ' → bài ' + tg.id + ' ✓', 'ok'); }
            else { errc++; seedLog('🌱📷 ' + (s.name || s.id) + ' → bài ' + tg.id + ' lỗi ảnh: ' + cg.err, 'err'); if (/\b190\b|session|expired|malformed|access token/i.test(cg.err || '')) skipped[s.id] = 'token die'; }
          } else {
            // COMMENT CHỮ: ƯU TIÊN GraphQL đóng-vai-Page (seed được bài NGƯỜI KHÁC). Lỗi thì lùi về token Graph.
            cg = await commentAsPage(s, tg, msg, null);
            if (cg.ok) { okc++; done++; cnt[s.id] = (cnt[s.id] || 0) + 1; cntPost[s.id] = (cntPost[s.id] || 0) + 1; bumpCmt(1); seedLog('🌱 ' + (s.name || s.id) + ' → bài ' + tg.id + ' ✓', 'ok'); }
            else if (!s.token) { errc++; seedLog('🌱 ' + (s.name || s.id) + ' → bài ' + tg.id + ' lỗi: ' + cg.err, 'err'); }
            else {
              var r = await graph('POST', GVER + '/' + tg.id + '/comments?message=' + enc(msg) + '&access_token=' + enc(s.token), (s.cl && s.cl.proxy) || '');
              if (r.json && r.json.id) { okc++; done++; cnt[s.id] = (cnt[s.id] || 0) + 1; cntPost[s.id] = (cntPost[s.id] || 0) + 1; bumpCmt(1); seedLog('🌱 ' + (s.name || s.id) + ' → bài ' + tg.id + ' ✓', 'ok'); }
              else { errc++; var em = errStr(r.json); seedLog('🌱 ' + (s.name || s.id) + ' → bài ' + tg.id + ' lỗi: ' + cg.err + (r.json ? (' | token: ' + em) : ''), 'err'); if (/\b190\b|session|expired|malformed|access token/i.test(em)) skipped[s.id] = 'token die'; }
            }
          }
        } catch (e) { errc++; seedLog('🌱 ' + (s.name || s.id) + ' → bài ' + tg.id + ' lỗi: ' + ((e && e.message) || e), 'err'); }
        if (!SEEDSTOP && delayMs > 0) await sleep(delayMs + Math.random() * 400);
      }
    }
    return { ok: okc, err: errc, skipped: Object.keys(skipped) };
  }
  async function seedRun() {
    if (SEEDING) { seedLog('Đang seeding rồi.'); return; }
    if (RUNNING) { seedLog('Đang đăng reel — seeding sau.', 'err'); return; }
    var targets = collectSeedTargets();
    var ta = $('reel-seed-posts');
    if (!targets.length) { if (ta) { ta.style.borderColor = 'var(--danger-color)'; ta.focus(); } seedLog('Chưa có bài để seed — dán link/id vào ô "Danh sách bài cần seed", hoặc bấm "Lấy reel vừa đăng".', 'err'); return; }
    if (ta) ta.style.borderColor = '';
    if (!seedHasContent()) { seedLog("Chưa có mẫu bình luận seed (chữ hoặc ảnh).", "err"); return; }
    var seeders = collectSeeders();
    if (seeders.length < 2) { seedLog(seedWhyFew(), 'err'); return; }
    SEEDING = true; SEEDSTOP = false; updateSeedBtns(); updateSeedCnt();
    var _react = CFG.seedReactOn ? (CFG.seedReactType || 'random') : 'off';
    seedLog('🌱 Bắt đầu seeding: ' + targets.length + ' bài · ' + seeders.length + ' fanpage · ' + (CFG.seedPerPost > 0 ? CFG.seedPerPost : seeders.length) + ' comment/bài · delay ' + (CFG.seedDelay) + 's' + (_react !== 'off' ? (' · cảm xúc ' + (_react === 'random' ? 'ngẫu nhiên' : _react)) : '') + (CFG.seedSelf ? ' · seed cả bài chính mình' : ''));
    var res;
    try { res = await doSeed({ targets: targets, seeders: seeders, seed: SEED.slice(), per: CFG.seedPerPost, delayMs: (CFG.seedDelay || 0) * 1000, maxPer: CFG.seedMaxPerPage || 0, react: _react, self: CFG.seedSelf, map: CFG.seedMap || {} }); }
    finally { SEEDING = false; updateSeedBtns(); updateSeedCnt(); }
    seedLog((SEEDSTOP ? 'Đã dừng seeding. ' : 'Xong seeding. ') + (res ? res.ok : 0) + ' comment OK · ' + (res ? res.err : 0) + ' lỗi.', (res && res.err) ? 'err' : 'ok');
  }
  // ── Chế độ Affiliate: bảng sản phẩm (video↔caption↔link) ──
  function renderProd() {
    var b = $('reel-prod-body'); if (!b) return;
    b.innerHTML = PRODUCTS.map(function (x, i) {
      var vid = x._file ? ('✅ ' + esc(x.vid || x._file.name)) : (x.vid ? ('<span class="st-fail">⚠️ ' + esc(x.vid) + ' — chọn lại video</span>') : '<span class="dim">chưa có video</span>');
      return '<tr>'
        + '<td style="text-align:center">' + (i + 1) + '</td>'
        + '<td><span class="ell" title="' + esc(x.vid) + '">' + vid + '</span></td>'
        + '<td><span class="ell" title="' + esc(x.cap) + '">' + esc(x.cap || '—') + '</span></td>'
        + '<td><span class="ell" style="font:11px Consolas,monospace" title="' + esc(x.link) + '">' + esc(x.link || '—') + '</span></td>'
        + '<td style="text-align:center">' + esc(x.gia || '—') + '</td><td style="text-align:center">' + esc(x.ma || '—') + '</td>'
        + '<td><button class="vbtn sec sm reel-prod-edit" data-i="' + i + '">✏ Sửa</button></td>'
        + '</tr>';
    }).join('');
    b.querySelectorAll('.reel-prod-edit').forEach(function (el) { el.onclick = function () { editProd(+this.getAttribute('data-i')); }; });
    var cnt = $('reel-tab-prod'); if (cnt) cnt.textContent = '(' + PRODUCTS.length + ')';
    var onc = $('reel-aff-on'); if (onc) onc.checked = !!CFG.affiliate;
  }
  function editProd(i) {
    var isNew = (i < 0 || i >= PRODUCTS.length);
    var x = isNew ? { vid: '', cap: '', link: '', gia: '', ma: '', _file: null } : PRODUCTS[i];
    var tmpFile = x._file || null;
    var inp = 'width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary,#000);font:13px inherit';
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:auto';
    ov.innerHTML = '<div class="reel-modal" style="width:min(640px,94vw);max-height:92vh;overflow:auto;background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.4)">'
      + '<div style="font-weight:800;font-size:15px;margin-bottom:12px">🛒 Sản phẩm ' + (isNew ? 'mới' : (i + 1)) + '</div>'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">🎥 Video sản phẩm</label>'
      + '<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px"><button class="vbtn sec sm" id="reel-prod-vbtn">📁 Chọn video</button><span id="reel-prod-vname" style="font-size:12px;opacity:.75">' + (tmpFile ? esc(tmpFile.name) : (x.vid ? esc(x.vid) + ' (chọn lại)' : 'chưa chọn')) + '</span><input type="file" id="reel-prod-vfile" accept="video/*" style="display:none"></div>'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">Caption <span style="font-weight:400;opacity:.6">(dùng {{gia}} {{ma}} · spintax {a|b})</span></label>'
      + '<textarea id="reel-prod-cap" style="' + inp + ';height:90px;margin-bottom:12px" placeholder="Nội dung reel cho sản phẩm này…"></textarea>'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">🔗 Link Shopee <span style="font-weight:400;opacity:.6">(dán {{link}} vào Bình Luận để tự chèn)</span></label>'
      + '<input id="reel-prod-link" style="' + inp + ';margin-bottom:12px" placeholder="https://shope.ee/…">'
      + '<div style="display:flex;gap:10px;margin-bottom:14px"><div style="flex:1"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">Giá</label><input id="reel-prod-gia" style="' + inp + '" placeholder="199k"></div><div style="flex:1"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px">Mã giảm</label><input id="reel-prod-ma" style="' + inp + '" placeholder="SALE50"></div></div>'
      + '<div style="display:flex;gap:8px;justify-content:space-between">'
      + (isNew ? '<span></span>' : '<button class="vbtn danger sm" id="reel-prod-del">🗑 Xoá</button>')
      + '<span style="display:flex;gap:8px"><button class="vbtn sec sm" id="reel-prod-cancel">Huỷ</button><button class="vbtn sm" id="reel-prod-save">Lưu</button></span>'
      + '</div></div>';
    document.body.appendChild(ov);
    var q = function (id) { return ov.querySelector('#' + id); };
    q('reel-prod-cap').value = x.cap || ''; q('reel-prod-link').value = x.link || ''; q('reel-prod-gia').value = x.gia || ''; q('reel-prod-ma').value = x.ma || '';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    q('reel-prod-vbtn').onclick = function () { q('reel-prod-vfile').click(); };
    q('reel-prod-vfile').onchange = function () { if (this.files && this.files[0]) { tmpFile = this.files[0]; q('reel-prod-vname').textContent = tmpFile.name; } };
    q('reel-prod-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    q('reel-prod-save').onclick = function () {
      x.cap = q('reel-prod-cap').value; x.link = q('reel-prod-link').value.trim(); x.gia = q('reel-prod-gia').value.trim(); x.ma = q('reel-prod-ma').value.trim();
      if (tmpFile) { x._file = tmpFile; x._buf = null; x.vid = tmpFile.name; }
      if (isNew) PRODUCTS.push(x);
      saveProd(); renderProd(); updateSummary(); close();
    };
    if (!isNew) { var db = q('reel-prod-del'); if (db) db.onclick = function () { PRODUCTS.splice(i, 1); saveProd(); renderProd(); updateSummary(); close(); }; }
  }
  function editChip(arr, i, label, saveFn, renderFn) {
    var ov = document.createElement('div');
    // z-index 100011 > modal Seeding (100003) để hộp sửa mẫu ĐÈ LÊN modal (không làm modal biến mất);
    // gắn vào #reel-panel để cùng ngữ cảnh xếp lớp.
    ov.style.cssText = 'position:fixed;inset:0;z-index:100011;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center';
    var lc = String(label).toLowerCase(), isCap = /Caption/i.test(label);
    ov.innerHTML = '<div class="reel-modal" style="width:min(580px,92vw);background:var(--bg-secondary,#fff);border:1px solid var(--border-color,#ccc);border-radius:14px;padding:18px;box-shadow:0 16px 48px rgba(0,0,0,.4)">'
      + '<div style="font-weight:800;font-size:15px">Chỉnh sửa ' + esc(label) + ' ' + (i + 1) + '</div>'
      + '<div style="font-size:11.5px;color:var(--text-secondary,#888);margin:3px 0 12px">' + (isCap ? 'Nội dung này sẽ được dùng làm mô tả cho bài đăng.' : 'Nội dung sẽ dùng khi đăng.') + '</div>'
      + '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:5px">' + (isCap ? 'Nội dung bài viết' : esc(label)) + '</label>'
      + '<textarea id="reel-chip-edit" style="width:100%;height:210px;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid var(--border-color,#ccc);background:var(--bg-primary,#fff);color:var(--text-primary,#000);font:13px/1.5 inherit" placeholder="Viết nội dung bài đăng, thêm emoji hoặc hashtag…"></textarea>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;gap:8px"><div id="reel-chip-emoji" style="display:flex;gap:3px;flex-wrap:wrap"></div><span id="reel-chip-cnt" style="font-size:11px;color:var(--text-secondary);white-space:nowrap">0 ký tự</span></div>'
      + '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--text-secondary)">Tùy chọn nâng cao</summary>'
      + '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:7px;line-height:1.5">Dùng <b>Spintax</b> để tạo nhiều biến thể từ 1 câu. Ví dụ: <b>{Chào bạn|Xin chào}</b> → mỗi bài chọn ngẫu nhiên 1 nhánh.</div>'
      + '<button class="vbtn sec sm" id="reel-chip-spin" type="button" style="margin-top:8px">🎲 Kiểm tra Spintax</button>'
      + '<div id="reel-chip-spinout" style="margin-top:7px;font-size:11.5px;line-height:1.5"></div></details>'
      + '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">'
      + '<button class="vbtn danger sm" id="reel-chip-del">🗑 Xoá ' + esc(lc) + '</button>'
      + '<span style="display:flex;gap:8px"><button class="vbtn sec sm" id="reel-chip-cancel">Huỷ</button><button class="vbtn sm" id="reel-chip-save" disabled style="opacity:.5">Lưu ' + esc(lc) + '</button></span>'
      + '</div></div>';
    ($('reel-panel') || document.body).appendChild(ov);
    var ta = ov.querySelector('#reel-chip-edit'); ta.value = arr[i] || ''; ta.focus();
    var cnt = ov.querySelector('#reel-chip-cnt'), saveB = ov.querySelector('#reel-chip-save'), orig = arr[i] || '';
    function refresh() { cnt.textContent = ta.value.length + ' ký tự'; var ch = ta.value !== orig; saveB.disabled = !ch; saveB.style.opacity = ch ? '1' : '.5'; }
    refresh(); ta.addEventListener('input', refresh);
    // Emoji: chèn tại con trỏ.
    var eb = ov.querySelector('#reel-chip-emoji');
    if (eb) ['😀', '😍', '🔥', '✅', '🎉', '💯', '👉', '❤️', '⭐', '🎁', '🛒', '📌'].forEach(function (ch) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = ch;
      b.style.cssText = 'border:0;background:var(--bg-tertiary,#eee);border-radius:6px;cursor:pointer;font-size:15px;padding:2px 5px;line-height:1';
      b.onclick = function () { var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value; ta.value = v.slice(0, s) + ch + v.slice(e); ta.selectionStart = ta.selectionEnd = s + ch.length; ta.focus(); refresh(); };
      eb.appendChild(b);
    });
    // Kiểm tra Spintax: hiện 3 biến thể mẫu.
    var sp = ov.querySelector('#reel-chip-spin'), spo = ov.querySelector('#reel-chip-spinout');
    if (sp) sp.onclick = function () { var t = ta.value; if (!t.trim()) { spo.textContent = 'Chưa có nội dung để kiểm tra.'; return; } spo.innerHTML = [1, 2, 3].map(function () { return '• ' + esc(spin(t)); }).join('<br>'); };
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#reel-chip-cancel').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    saveB.onclick = function () { if (saveB.disabled) return; arr[i] = ta.value; saveFn(); renderFn(); close(); };
    ov.querySelector('#reel-chip-del').onclick = function () { arr.splice(i, 1); if (!arr.length) arr.push(''); saveFn(); renderFn(); close(); };
  }
  // Cảnh báo tỉ lệ lặp nội dung: X mẫu cho Y bài -> mỗi mẫu lặp ~Z lần.
  function updateDupWarn() {
    var el = $('reel-dup-warn'); if (!el) return;
    if (CFG.affiliate) { var np = PRODUCTS.filter(function (x) { return x._file; }).length; el.textContent = '🛒 Chế độ Affiliate đang bật · ' + np + ' sản phẩm có video (nội dung lấy từ Sản Phẩm).'; el.style.color = np ? 'var(--text-secondary)' : 'var(--danger-color)'; return; }
    var nmau = TPL.filter(function (s) { return String(s || '').trim(); }).length;
    var totPage = 0; CLONES.forEach(function (c) { totPage += c.pages.length; });
    var totBai = totPage * (CFG.rounds || 1);
    if (!nmau || !totBai) { el.textContent = nmau ? '' : '⚠️ Chưa có nội dung — reel sẽ đăng KHÔNG caption.'; el.style.color = 'var(--danger-color)'; return; }
    var lap = Math.ceil(totBai / nmau);
    el.textContent = nmau + ' mẫu cho ' + num(totBai) + ' bài → mỗi mẫu lặp ~' + num(lap) + ' lần' + (lap > 50 ? ' · nên thêm mẫu hoặc dùng spintax {a|b}' : '');
    el.style.color = lap > 50 ? 'var(--danger-color)' : 'var(--text-secondary)';
  }

  /* ───────────────────────── Render CLONE table ───────────────────────── */
  function visibleCloneCols() { return CLONE_COLS.filter(function (col) { return col.always || COLS[col.key]; }); }
  function renderCloneHead() {
    var tr = $('reel-clone-head'); if (!tr) return;
    tr.innerHTML = visibleCloneCols().map(function (col) { return '<th' + (col.w ? ' style="width:' + col.w + 'px"' : '') + '>' + esc(col.label) + '</th>'; }).join('');
  }
  function cloneStatusHtml(c, i) {
    if (c.status === 'dead') return '<span class="cl-dead">❌ Cookie/Token Die</span>';
    if (c.status === 'checkpoint') return '<span class="cl-rest">⚠️ Checkpoint</span>';
    if (c.status === 'spam') return '<span class="cl-spam">🔴 Ngưng (lỗi)</span>';
    if (c.status === 'rest' || c.restUntil) return '<span class="cl-rest">⏸ Nghỉ</span>';
    if (c.status === 'run') return '<span class="cl-run">🚀 Đang chạy</span>';
    if (c.status === 'done') return '<span class="cl-done">✅ Xong</span>';
    return '<span class="st-wait">Chờ</span>';
  }
  function cloneCell(c, i, key) {
    switch (key) {
      case '_stt': return '<td style="text-align:center">' + (i + 1) + '</td>';
      case 'uid': return '<td><span class="ell" title="' + esc(c.uidName || '') + '">' + esc(c.uid || '—') + (c.uidName ? ' · ' + esc(c.uidName) : '') + '</span></td>';
      case 'cookie': return '<td><span class="ell" style="font:11px Consolas,monospace" title="' + esc(c.cookie) + '">' + esc(c.cookie ? mask(c.cookie) : '—') + '</span></td>';
      case 'token': return '<td><span class="ell" style="font:11px Consolas,monospace" title="' + esc(c.token) + '">' + (c.token ? esc(mask(c.token)) : '<span class="st-wait">—</span>') + '</span></td>';
      case 'proxy':
        var pxColor = c.proxy ? '#38bdf8' : 'var(--text-secondary)';
        var pxTitle = c.proxy ? ('Proxy hiện tại: ' + esc(c.proxy) + ' — Click để xem chi tiết / chỉnh sửa') : 'Chưa có proxy — Click để cấu hình HTTP / HTTPS / SOCKS5';
        return '<td style="text-align:center"><button class="vbtn-mini sec" data-action="kzOpenProxyReel" data-stop data-i="' + i + '" title="' + pxTitle + '" style="color:' + pxColor + ';border-color:' + (c.proxy ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.15)') + ';font-weight:600">🌐 ' + (c.proxy ? esc(shortProxy(c.proxy)) : '+ Gán Proxy') + '</button></td>';
      case 'status': return '<td>' + cloneStatusHtml(c, i) + '</td>';
      case 'proc': return '<td><span class="ell" title="' + esc(c.proc) + '">' + esc(c.proc || '—') + '</span></td>';
      case 'ok': return '<td style="text-align:center;font-weight:700;color:var(--success-color)">' + num(c.okBai) + '</td>';
      case 'err': return '<td style="text-align:center;color:var(--danger-color)">' + num(c.errBai) + '</td>';
      case 'tstart': return '<td style="text-align:center">' + fmtClock(c.tStart) + '</td>';
      case 'tend': return '<td style="text-align:center">' + fmtClock(c.tEnd) + '</td>';
      case 'trest': return '<td style="text-align:center">' + fmtDur(c.restMs + (c.restUntil ? Math.max(0, c.restUntil - Date.now()) : 0)) + '</td>';
      case '_detail': return '<td style="text-align:center;font-weight:700">' + c.pages.length + ' page</td>';
      case '_action': return '<td style="text-align:center"><button class="vbtn-mini" data-action="kzOpenVia" data-i="' + i + '" title="Mở trình duyệt phiên riêng của Via này để kiểm tra">🌐 Mở</button></td>';
      default: return '<td>—</td>';
    }
  }
  function cloneRowInner(c, i) { return visibleCloneCols().map(function (col) { return cloneCell(c, i, col.key); }).join(''); }
  function renderClones() {
    var b = $('reel-clone-body'); if (!b) return;
    renderCloneHead();
    b.innerHTML = CLONES.map(function (c, i) { return '<tr id="reel-c-' + i + '">' + cloneRowInner(c, i) + '</tr>'; }).join('');
    updateFoot();
  }
  function updateCloneRow(i) {
    var tr = $('reel-c-' + i); if (!tr) { return; }
    var wasSel = tr.classList.contains('sel');
    tr.innerHTML = cloneRowInner(CLONES[i], i); tr.classList.toggle('sel', wasSel);
  }

  /* ───────────────────────── Render PAGES table (phẳng) ───────────────────────── */
  function pageStatusHtml(p) {
    if (p.kind === 'run') return '<span class="st-run">🚀 Đang chạy</span>';
    if (p.kind === 'prep') return '<span class="st-up">📤 Chuẩn bị…</span>';
    if (p.kind === 'up') return '<span class="st-up">⬆️ Tải video ' + esc(p.det || '') + '</span>';
    if (p.kind === 'fin') return '<span class="st-up">☁️ Đăng bài · chờ link</span>';
    if (p.kind === 'ok') return '<span class="st-ok">✅ Thành công</span>';
    if (p.kind === 'perm') return '<span class="st-ok">✅ Có quyền đăng</span>';
    if (p.kind === 'noperm') return '<span class="st-fail">⛔ ' + esc(p.err || 'Chưa có quyền') + '</span>';
    if (p.kind === 'fail') return '<span class="st-fail">✗ ' + esc(p.err || 'Lỗi') + '</span>';
    if (p.kind === 'skip') return '<span class="dim">⏭ ' + esc(p.note || 'Bỏ qua') + '</span>';
    return '<span class="st-wait">⏳ ' + esc(p.note || 'Chờ') + '</span>';
  }
  function allPages() { var out = []; CLONES.forEach(function (c, ci) { c.pages.forEach(function (p) { out.push({ p: p, c: c, ci: ci }); }); }); return out; }
  function pageRowInner(o, idx) {
    var p = o.p, c = o.c;
    var link = p.link ? '<a class="lnk ell" href="' + esc(p.link) + '" target="_blank">' + esc(p.link.replace('https://www.facebook.com/', 'fb.com/')) + '</a>' : (p.kind === 'fail' || p.kind === 'noperm' ? '<span class="st-fail">' + esc(p.err || '—') + '</span>' : '—');
    var ptk = c.ptok && c.ptok[p.id];
    return '<td><input type="checkbox" class="selchk" value="' + esc(p.id) + '"></td>'
      + '<td style="text-align:center">' + (idx + 1) + '</td>'
      + '<td style="font:11px Consolas,monospace">' + esc(p.id) + '</td>'
      + '<td><span class="ell" title="' + esc(p.name) + '">' + esc(p.name || '—') + '</span></td>'
      + '<td><span class="ell" title="clone#' + (o.ci + 1) + '">' + esc(c.uid || ('clone#' + (o.ci + 1))) + '</span></td>'
      + '<td><span class="ell" style="font:11px Consolas,monospace;color:' + (c.proxy ? '#38bdf8' : 'var(--text-secondary)') + '" title="Proxy của Via: ' + esc(c.proxy || 'Không dùng proxy') + '">' + (c.proxy ? esc(c.proxy) : '<span style="opacity:.4">—</span>') + '</span></td>'
      + '<td><span class="ell" style="font:11px Consolas,monospace">' + (ptk ? esc(mask(ptk)) : '<span class="st-wait">—</span>') + '</span></td>'
      + '<td style="text-align:center;font-weight:700">' + (p.done || 0) + '</td>'
      + '<td>' + pageStatusHtml(p) + '</td><td>' + link + '</td>'
      + '<td style="text-align:center;white-space:nowrap"><button class="vbtn-mini" data-action="kzOpenPage" data-page-id="' + esc(p.id) + '" data-ci="' + o.ci + '" title="Mở Fanpage này bằng phiên của Clone #' + (o.ci + 1) + '">🌐 Mở</button> <button class="vbtn-mini" data-action="kzDelPage" data-stop data-page-id="' + esc(p.id) + '" title="Xoá page này khỏi danh sách (không ảnh hưởng page thật trên Facebook)" style="color:var(--danger-color);border-color:rgba(255,80,80,0.35)">🗑</button></td>';
  }
  var _pageRowMap = {};   // pageId -> tr
  function renderPages() {
    if (activeTab !== 'pages') { updateSummary(); return; }
    var b = $('reel-pages-body'); if (!b) return;
    var list = allPages(); _pageRowMap = {};
    // Giới hạn vẽ tối đa 4000 dòng thô để không treo DOM; đủ cho thực tế.
    var MAX = 4000; var over = list.length > MAX;
    var rows = (over ? list.slice(0, MAX) : list);
    b.innerHTML = rows.map(function (o, i) { return '<tr id="reel-p-' + o.p.id + '">' + pageRowInner(o, i) + '</tr>'; }).join('');
    rows.forEach(function (o) { _pageRowMap[o.p.id] = $('reel-p-' + o.p.id); });
    var head = $('reel-tab-pages'); if (head) head.textContent = '(' + num(list.length) + (over ? ' · hiện ' + MAX : '') + ')';
    updateFoot(); updateSummary();
  }
  function updatePageRow(p) {
    if (activeTab !== 'pages') return;
    var tr = _pageRowMap[p.id]; if (!tr) return;
    var idxTxt = tr.children[1] ? tr.children[1].textContent : '1';
    var wasChk = (tr.querySelector('.selchk') || {}).checked || tr.classList.contains('sel');
    // tìm object để lấy clone
    var o = null, ci = -1; for (var i = 0; i < CLONES.length; i++) { if (CLONES[i].byId[p.id]) { o = { p: p, c: CLONES[i], ci: i }; break; } }
    if (!o) return;
    tr.innerHTML = pageRowInner(o, (parseInt(idxTxt, 10) || 1) - 1);
    if (wasChk) { var cc = tr.querySelector('.selchk'); if (cc) cc.checked = true; tr.classList.add('sel'); }
  }

  /* ───────────────────────── Config & Cols view ───────────────────────── */
  function buildConfigView() {
    var v = $('reel-view-config'); if (!v) return;
    function sec(title, cells) { return '<div style="margin-bottom:16px"><div style="font-weight:700;font-size:13px;margin:2px 0 9px;padding-bottom:6px;border-bottom:1px solid var(--border-color,#eee)">' + title + '</div><div class="cfgrow">' + cells + '</div></div>'; }
    v.innerHTML = ''
      + sec('🛡️ Giới hạn &amp; an toàn',
        cfgCell('Delay giây/bài', 'num', 'delay', 'Nghỉ bao nhiêu giây sau mỗi bài (né FB bóp). Là mốc TỐI THIỂU nếu có Delay tối đa.')
        + cfgCell('Delay tối đa (s)', 'num', 'delayMax', 'Lớn hơn Delay → mỗi bài nghỉ NGẪU NHIÊN trong khoảng [Delay, Delay tối đa]. 0 = delay cố định.')
        + cfgCell('Max bài / clone', 'num', 'maxPerClone', 'Mỗi clone đăng đủ bấy nhiêu bài trong 1 lần chạy thì tự dừng. 0 = không giới hạn.')
        + cfgCell('Max bài / page', 'num', 'maxPerPage', 'Mỗi page chỉ đăng tối đa bấy nhiêu bài (tính TỔNG đã đăng, bền). Đủ thì bỏ qua. 0 = không giới hạn.')
        + cfgCell('Nghỉ dài sau mỗi (bài)', 'num', 'longEvery', 'Clone đăng đủ bấy nhiêu bài thì nghỉ một đợt dài. 0 = tắt.')
        + cfgCell('Nghỉ dài bao lâu (phút)', 'num', 'longRest', 'Thời gian nghỉ dài mỗi đợt (đi kèm ô trên).')
        + cfgCell('Ngưng clone khi lỗi liên tục', 'num', 'stopFail', 'Số page lỗi liên tiếp thì tự ngưng clone (0 = không ngưng).')
        + cfgCell('Nghỉ khi rate-limit (s)', 'num', 'rlRest', 'Bị hạn chế 3 lần thì clone nghỉ bấy nhiêu giây.')
        + cfgCell('Nghỉ giữa các vòng (s)', 'num', 'roundRest', 'Hết một vòng toàn bộ page thì nghỉ trước vòng sau.'))
      + sec('🔄 Nội dung / xoay vòng',
        cfgCell('Thứ tự video', 'sel', 'vidOrder', 'Xoay vòng theo lượt đã đăng, hoặc chọn ngẫu nhiên.', [['rotate', 'Xoay vòng (không trùng)'], ['random', 'Ngẫu nhiên']])
        + cfgCell('Thứ tự nội dung', 'sel', 'descOrder', 'Xoay vòng mẫu nội dung/bình luận/sản phẩm (đỡ trùng liền nhau), hoặc ngẫu nhiên.', [['rotate', 'Xoay vòng (đỡ trùng)'], ['random', 'Ngẫu nhiên']]))
      + sec('🛒 Affiliate',
        cfgCell('Affiliate: gắn sub_id theo', 'sel', 'subId', 'Chèn sub_id vào link Shopee để biết nguồn ra đơn: theo page hoặc theo clone. Tắt nếu không cần.', [['page', 'ID Page'], ['clone', 'UID Clone'], ['none', 'Không gắn']]))
      + sec('⚙️ Khác',
        cfgCell('Giữ log tối đa (dòng)', 'num', 'logKeep', 'Nhật ký giữ tối đa bao nhiêu dòng.'));
    v.querySelectorAll('[data-cfg]').forEach(function (el) {
      el.onchange = el.oninput = function () {
        var k = this.getAttribute('data-cfg');
        CFG[k] = (this.tagName === 'SELECT') ? this.value : Math.max(0, parseInt(this.value, 10) || 0);
        saveCfg();
        if (k === 'delay') $('reel-delay').value = CFG.delay;
      };
    });
  }
  function cfgCell(label, type, key, hint, opts) {
    var inp = type === 'sel'
      ? '<select data-cfg="' + key + '">' + (opts || []).map(function (o) { return '<option value="' + o[0] + '"' + (CFG[key] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
      : '<input data-cfg="' + key + '" type="number" min="0" value="' + (CFG[key]) + '">';
    return '<div class="cfgcell"><label>' + esc(label) + '</label>' + inp + '<div style="font-size:10.5px;opacity:.55;margin-top:5px">' + esc(hint) + '</div></div>';
  }
  // Nhóm các cột ẩn/hiện (chỉ để TRÌNH BÀY — KHÔNG đổi thứ tự cột trong bảng, thứ tự bảng do CLONE_COLS quyết định).
  var COL_GROUPS = [
    { title: 'Tài khoản', keys: ['uid', 'cookie', 'token', 'proxy'] },
    { title: 'Trạng thái & kết quả', keys: ['status', 'proc', 'ok', 'err'] },
    { title: 'Thời gian', keys: ['tstart', 'tend', 'trest'] }
  ];
  function buildColsView() {
    var v = $('reel-view-cols'); if (!v) return;
    var lblOf = {}; CLONE_COLS.forEach(function (c) { lblOf[c.key] = c.label; });
    var grid = COL_GROUPS.map(function (g) {
      var opts = g.keys.map(function (k) {
        return '<label class="colopt"><input type="checkbox" data-col="' + k + '"' + (COLS[k] ? ' checked' : '') + '><span>' + esc(lblOf[k] || k) + '</span></label>';
      }).join('');
      return '<div class="colgroup"><h4>' + esc(g.title) + '</h4>' + opts + '</div>';
    }).join('');
    v.innerHTML = '<div class="colwrap"><div class="colhint">Chọn các cột muốn hiển thị trong bảng Clone.</div><div class="colgrid">' + grid + '</div></div>';
    v.querySelectorAll('[data-col]').forEach(function (el) { el.onchange = function () { COLS[this.getAttribute('data-col')] = this.checked ? 1 : 0; saveCols(); renderClones(); }; });
  }

  /* ───────────────────────── Summary / foot ───────────────────────── */
  // Phản chiếu trạng thái công tắc Bình luận tự động (mờ/hiện khu nhập + chữ Đang bật/tắt).
  function reflectCmtState(on) {
    var w = $('reel-cmt-wrap'); if (w) w.classList.toggle('off', !on);
    var s = $('reel-cmt-state'); if (s) s.textContent = on ? 'Đang bật' : 'Đang tắt';
  }
  // Nút hành động chính đổi theo cấu hình: đỏ/vàng "⚠ Kiểm tra lại" khi thiếu Page/nội dung;
  // "📅 Lên lịch đăng" khi đã đặt giờ; "🎬 Đăng Reel" khi đăng ngay.
  function updateActionBtn(totPage) {
    var btn = $('reel-start'); if (!btn || RUNNING) return;
    var hasContent = (typeof FILES !== 'undefined' && FILES && FILES.length > 0);
    var hasPage = totPage > 0;
    var schEl = $('reel-schedule'); var sch = (schEl && schEl.value) ? schEl.value : '';
    btn.classList.remove('ok', 'check');
    if (!hasPage || !hasContent) {
      btn.classList.add('check'); btn.textContent = '⚠ Kiểm tra lại';
      btn.title = !hasPage ? 'Chưa có Page — chuẩn bị via + Load Page trước.' : 'Chưa chọn video/ảnh — bấm "Chọn từ máy tính".';
      return;
    }
    btn.classList.add('ok');
    btn.textContent = sch ? '📅 Lên lịch đăng' : '🎬 Đăng Reel';
    var capEmpty = !(TPL || []).some(function (t) { return (t || '').trim(); });
    var cmtEl = $('reel-cmt-on'); var cmtOn = cmtEl ? cmtEl.checked : !!CFG.autoComment;
    var cmtEmpty = cmtOn && !(CMT || []).some(function (t) { return (t || '').trim(); });
    btn.title = (capEmpty ? 'Chưa có caption (vẫn đăng được, không caption). ' : '') + (cmtEmpty ? 'Bình luận đang bật nhưng chưa có nội dung.' : '') || 'Cấu hình hợp lệ.';
  }
  function updateSummary() {
    var e;
    updateCfgSum(); updateDupWarn();
    if ((e = $('reel-okids'))) e.value = OKIDS.join('\n');
    if ((e = $('reel-failids'))) e.value = FAILIDS.join('\n');
    var totPage = 0, totOk = 0, totErr = 0;
    CLONES.forEach(function (c) { totPage += c.pages.length; totOk += c.okBai; totErr += c.errBai; });
    if ((e = $('rs-clone'))) e.textContent = num(CLONES.length);
    if ((e = $('rs-page'))) e.textContent = num(totPage);
    if ((e = $('rs-ok'))) e.textContent = num(totOk);
    if ((e = $('rs-fail'))) e.textContent = num(totErr);
    if ((e = $('reel-sum'))) e.textContent = 'Clone: ' + CLONES.length + ' · Page: ' + num(totPage) + ' · ' + (isPhoto() ? 'Ảnh: ' : 'Video: ') + FILES.length;
    if ((e = $('reel-tab-clone'))) e.textContent = '(' + CLONES.length + ')';
    if ((e = $('reel-tab-pages')) && activeTab !== 'pages') e.textContent = '(' + num(totPage) + ')';
    updateActionBtn(totPage);
  }
  function updateFoot() {
    var e = $('reel-foot'); if (!e) return;
    var tot, sel;
    if (activeTab === 'pages') { tot = allPages().length; sel = document.querySelectorAll('#reel-pages-body tr.sel').length; }
    else { tot = CLONES.length; sel = document.querySelectorAll('#reel-clone-body tr.sel').length; }
    e.textContent = 'Tổng: ' + num(tot) + ' · Đang Chọn: ' + sel;
  }

  /* ───────────────────────── Grid select + Context menu ───────────────────────── */
  function setSel(tr, on, kind) { tr.classList.toggle('sel', on); if (kind === 'pages') { var c = tr.querySelector('.selchk'); if (c) c.checked = on; } }
  function bindGridSelect(tb, kind) {
    if (!tb) return; var pre = kind === 'clone' ? 'reel-c-' : 'reel-p-';
    var dragging = false, startIdx = null, startChecked = false, initStates = [], lastEnd = null, lastClick = null;
    function rowsArr() { return Array.prototype.slice.call(tb.querySelectorAll('tr[id^="' + pre + '"]')); }
    tb.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return; var row = e.target.closest('tr[id^="' + pre + '"]'); if (!row) return;
      if (e.target.closest('button,a')) return;
      var rows = rowsArr(), idx = rows.indexOf(row);
      if (e.shiftKey) { e.preventDefault(); if (lastClick == null) lastClick = 0; var s = Math.min(lastClick, idx), en = Math.max(lastClick, idx); rows.forEach(function (r, i) { setSel(r, i >= s && i <= en, kind); }); dragging = false; updateFoot(); return; }
      e.preventDefault();
      dragging = true; startIdx = idx; startChecked = !row.classList.contains('sel');
      var additive = e.ctrlKey || e.target.tagName === 'INPUT';
      if (additive) setSel(row, startChecked, kind); else { rows.forEach(function (r) { if (r !== row) setSel(r, false, kind); }); setSel(row, startChecked, kind); }
      initStates = rows.map(function (r) { return r.classList.contains('sel'); }); lastEnd = idx; lastClick = idx; updateFoot();
    });
    tb.addEventListener('mouseover', function (e) {
      if (!dragging || startIdx == null) return; if (!(e.buttons & 1)) { dragging = false; return; }
      var row = e.target.closest('tr[id^="' + pre + '"]'); if (!row) return;
      var rows = rowsArr(), idx = rows.indexOf(row); if (lastEnd == null) lastEnd = startIdx;
      var s = Math.min(lastEnd, idx), en = Math.max(lastEnd, idx), mn = Math.min(startIdx, idx), mx = Math.max(startIdx, idx);
      for (var i = s; i <= en; i++) { if (rows[i]) setSel(rows[i], (i >= mn && i <= mx) ? startChecked : initStates[i], kind); }
      lastEnd = idx; updateFoot();
    });
    document.addEventListener('mouseup', function () { dragging = false; startIdx = null; initStates = []; lastEnd = null; });
  }
  function selCloneIdx() { var a = []; document.querySelectorAll('#reel-clone-body tr.sel').forEach(function (r) { var i = +r.id.replace('reel-c-', ''); if (!isNaN(i)) a.push(i); }); return a; }
  function selPageIds() { var a = []; document.querySelectorAll('#reel-pages-body tr.sel').forEach(function (r) { a.push(r.id.replace('reel-p-', '')); }); return a; }

  function pageTokenOf(id) { for (var i = 0; i < CLONES.length; i++) { if (CLONES[i].ptok && CLONES[i].ptok[id]) return CLONES[i].ptok[id]; } return ''; }
  // Nối bằng ", " (không phải \n): dán vào đâu cũng tách rõ (thanh địa chỉ bỏ xuống dòng -> dính); ô Fanpage seed vẫn parse được dấu phẩy.
  function ctxCopy(arr, label) { if (!arr.length) { log('Chưa bôi đen dòng nào.', 'err'); return; } try { navigator.clipboard.writeText(arr.join(', ')); log('Đã copy ' + arr.length + ' ' + label + '.', 'ok'); } catch (e) {} }
  function seedFillPages(ids) { if (!ids.length) { log('Chưa bôi đen page nào.', 'err'); return; } var ta = $('reel-seed-pages'); if (!ta) return; var seen = {}; (ta.value || '').split(/[\s,]+/).forEach(function (x) { if (x) seen[x] = 1; }); ids.forEach(function (id) { if (!seen[id]) { ta.value = (ta.value ? ta.value + '\n' : '') + id; seen[id] = 1; } }); updateSeedCnt(); log('Đã đổ ' + ids.length + ' ID page vào ô "Fanpage dùng để seed" (mở Seeding để dùng).', 'ok'); }
  function openCtx(x, y, kind) {
    var m = $('reel-ctx'); if (!m) return; var W = 'Clone';
    var items;
    if (kind === 'pages') {
      items = [
        { t: '📋 Copy ID Page bôi đen', f: function () { ctxCopy(selPageIds(), 'ID page'); } },
        { t: '📋 Copy tất cả ID Page', f: function () { ctxCopy(allPages().map(function (o) { return o.p.id; }), 'ID page'); } },
        { s: 1 },
        { t: '🔑 Copy Token Page bôi đen', f: function () { ctxCopy(selPageIds().map(pageTokenOf).filter(Boolean), 'token page'); } },
        { s: 1 },
        { t: '🌱 Đổ ID (bôi đen) → ô Fanpage seed', f: function () { seedFillPages(selPageIds()); } }
      ];
    } else items = [
      { t: '➕ Dán ' + W + ' (Thêm)', sc: 'Ctrl+V', f: function () { doPaste('add'); } },
      { t: '🔄 Dán ' + W + ' (Xoá Cũ)', f: function () { doPaste('replace'); } },
      { s: 1 },
      { t: '🔑 Lấy Token (từ cookie)', f: function () { ensureAllTokens(); } },
      { t: '🔽 Load Page các clone bôi đen', f: function () { loadPagesAll(true); } },
      { s: 1 },
      { t: '✏️ Sửa Clone (dòng bôi đen)', f: function () { editCloneLine(); } },
      { t: '🔑 Dán / Thay Token (dòng bôi đen)', f: function () { pasteTokenToSel(); } },
      { s: 1 },
      { t: '📋 Copy Bôi Đen', f: function () { copySel(); } },
      { t: '📋 Copy Tất Cả', f: function () { copyAll(); } },
      { s: 1 },
      { t: '🗑 Xoá Dòng Bôi Đen', f: function () { delSel(); } },
      { t: '🗑 Xoá Tất Cả', f: function () { delAll(); } }
    ];
    m.innerHTML = items.map(function (it, i) { return it.s ? '<div class="sep"></div>' : '<div class="it" data-i="' + i + '">' + it.t + (it.sc ? '<span class="sc">' + it.sc + '</span>' : '') + '</div>'; }).join('');
    m.querySelectorAll('.it').forEach(function (el) { el.onclick = function (ev) { ev.stopPropagation(); m.classList.remove('on'); items[+this.getAttribute('data-i')].f(); }; });
    m.style.left = Math.min(x, window.innerWidth - 230) + 'px'; m.style.top = Math.min(y, window.innerHeight - 340) + 'px'; m.classList.add('on');
  }
  function doPaste(mode) {
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { applyPasteClones(t, mode); }).catch(function () { pastePrompt(mode); }); else pastePrompt(mode);
  }
  function pastePrompt(mode) {
    var ov = document.createElement('textarea');
    ov.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);z-index:100001;width:460px;height:180px;padding:11px;border:2px solid var(--primary-accent,#ff5cb3);border-radius:12px;background:var(--bg-primary);color:var(--text-primary);font:12px Consolas,monospace;box-shadow:0 12px 36px rgba(0,0,0,.4)';
    ov.placeholder = 'Ctrl+V dán clone: uid|pass|2fa|cookie[|token]  ·  cookie thuần  ·  hoặc System User: UID|IdBM|TokenSystemUser (đăng bằng token page, không cần nick) — rồi bấm ra ngoài…';
    document.body.appendChild(ov); ov.focus(); var done = false;
    function fin() { if (done) return; done = true; var v = ov.value; if (ov.parentNode) ov.parentNode.removeChild(ov); if (v) applyPasteClones(v, mode); }
    ov.addEventListener('paste', function () { setTimeout(fin, 40); }); ov.addEventListener('blur', function () { setTimeout(fin, 120); });
  }
  // Dán / thay token thủ công cho 1 clone bôi đen (khi tự cào token yếu — dán token tốt từ nguồn khác vào).
  function pasteTokenToSel() {
    var idxs = selCloneIdx();
    if (idxs.length !== 1) { log('Bôi đen ĐÚNG 1 clone rồi chuột phải → Dán/Thay Token.', 'err'); return; }
    var i = idxs[0], c = CLONES[i];
    var t = window.prompt('Dán token cho clone #' + (i + 1) + ' (EAAB / EAAG / EAAAAU):', c.token || '');
    if (t === null) return;
    t = String(t).trim().replace(/\s+/g, '');
    if (t.length < 20) { log('Token không hợp lệ (quá ngắn).', 'err'); return; }
    c.token = t; c.tokKind = /^EAAB/.test(t) ? 'EAAB' : /^EAAG/.test(t) ? 'EAAG' : /^EAAAAU/.test(t) ? 'EAAAAU' : 'other';
    c.proc = 'có token'; saveClones(); savePagesData(c); updateCloneRow(i); updateSummary();
    log('Clone#' + (i + 1) + ': đã đặt token ' + c.tokKind + ' (' + t.length + ' ký tự). Giờ bấm "Load Page Từ Clone".', 'ok');
  }
  // Sửa nguyên dòng clone bôi đen (cookie/token/định dạng) rồi nạp lại.
  function editCloneLine() {
    var idxs = selCloneIdx();
    if (idxs.length !== 1) { log('Bôi đen ĐÚNG 1 clone rồi chuột phải → Sửa Clone.', 'err'); return; }
    var i = idxs[0], c = CLONES[i];
    var v = window.prompt('Sửa dòng clone #' + (i + 1) + ':\nuid|pass|2fa|cookie[|token]  ·  cookie thuần  ·  UID|IdBM|TokenSU', c.raw || '');
    if (v === null) return; v = String(v).trim(); if (!v) return;
    var raws = CLONES.map(function (cc) { return cc.raw; }); raws[i] = v;
    $('reel-clones').value = raws.join('\n'); applyClones(); log('Đã sửa clone #' + (i + 1) + '.', 'ok');
  }
  function copySel() { var arr = selCloneIdx().map(function (i) { return CLONES[i].raw; }); if (!arr.length) { log('Chưa bôi đen dòng nào.', 'err'); return; } try { navigator.clipboard.writeText(arr.join('\n')); log('Đã copy ' + arr.length + ' clone.', 'ok'); } catch (e) {} }
  function copyAll() { var arr = CLONES.map(function (c) { return c.raw; }); if (!arr.length) return; try { navigator.clipboard.writeText(arr.join('\n')); log('Đã copy ' + arr.length + ' clone.', 'ok'); } catch (e) {} }
  function delSel() {
    var s = {}; selCloneIdx().forEach(function (i) { s[i] = 1; });
    var keep = CLONES.filter(function (c, i) { return !s[i]; });
    if (keep.length === CLONES.length) { log('Chưa bôi đen clone nào.', 'err'); return; }
    $('reel-clones').value = keep.map(function (c) { return c.raw; }).join('\n'); applyClones(); log('Đã xoá clone bôi đen.', 'ok');
  }
  function delAll() { $('reel-clones').value = ''; try { kzSecureStore.removeItem('reel-clones'); } catch (e) {} applyClones(); log('Đã xoá tất cả clone.', 'ok'); }

  /* ───────────────────────── Chẩn đoán token ───────────────────────── */
  // In QUYỀN (scope) thật của token clone + VAI TRÒ (tasks) trên từng page.
  // pages_manage_posts = quyền đăng bài; task CREATE_CONTENT = vai trò đăng trên page.
  async function diagClone(c, i, done, probe) {
    if (!c || (done && done[i])) return; if (done) done[i] = 1;
    if (!c.token) { await ensureToken(c); }
    if (!c.token) { log('🔎 clone#' + (i + 1) + ': KHÔNG có token (cookie hỏng).', 'err'); return; }
    try {
      var r = await graph('GET', GVER + '/me/permissions?access_token=' + enc(c.token));
      var data = (r.json && r.json.data) || [];
      var granted = data.filter(function (x) { return x.status === 'granted'; }).map(function (x) { return x.permission; });
      if (data.length) {
        // Chỉ in vài quyền LIÊN QUAN đăng bài (khỏi rối Nhật Ký với cả trăm quyền).
        var need = ['pages_manage_posts', 'pages_show_list', 'pages_read_engagement', 'publish_video'];
        var have = need.filter(function (p) { return granted.indexOf(p) >= 0; });
        var miss = need.filter(function (p) { return granted.indexOf(p) < 0; });
        log('🔎 clone#' + (i + 1) + ' quyền đăng: ' + (have.join(', ') || '(không có)'));
        if (miss.indexOf('pages_manage_posts') >= 0 && miss.indexOf('publish_video') >= 0) log('⚠️ clone#' + (i + 1) + ' thiếu cả pages_manage_posts lẫn publish_video → khó đăng.', 'err');
      } else if (r.json && r.json.error) {
        log('🔎 clone#' + (i + 1) + ' không đọc được quyền: ' + errStr(r.json), 'err');
      }
    } catch (e) { log('🔎 clone#' + (i + 1) + ' lỗi đọc quyền: ' + ((e && e.message) || e), 'err'); }
    // Vai trò trên từng page (tasks)
    try {
      var r2 = await graph('GET', GVER + '/me/accounts?fields=id,name,tasks&limit=200&access_token=' + enc(c.token));
      var arr = (r2.json && r2.json.data) || [];
      arr.forEach(function (it) {
        var tasks = (it && it.tasks) || [];
        var canPost = tasks.some(function (t) { return /CREATE_CONTENT|MANAGE|FULL_CONTROL/.test(t); });
        log((canPost ? '✅' : '⛔') + ' page ' + it.id + ' (' + (it.name || '') + ') vai trò: ' + (tasks.join(', ') || '(trống)'), canPost ? 'ok' : 'err');
        var pg = c.byId && c.byId[String(it.id)]; if (pg && it.name) { pg.name = it.name; updatePageRow(pg); }   // lưu tên vào bảng
      });
      savePagesData(c);   // lưu tên page bền qua F5
      if (!arr.length && r2.json && r2.json.error) log('🔎 clone#' + (i + 1) + ' /me/accounts lỗi: ' + errStr(r2.json), 'err');
    } catch (e) {}
  }

  /* ───────────────────────── Check quyền ───────────────────────── */
  var CHECKING = false;
  async function checkPerm() {
    if (RUNNING) { log('Đang chạy — check sau.', 'err'); return; }
    if (CHECKING) { CHECKING = false; return; }
    var idxs = selCloneIdx(); if (!idxs.length) idxs = CLONES.map(function (_, i) { return i; });
    var targets = [];
    idxs.forEach(function (i) { var c = CLONES[i]; c.pages.forEach(function (p) { targets.push({ c: c, p: p }); }); });
    if (!targets.length) { log('Không có page để check (Load Page trước).', 'err'); return; }
    var btn = $('reel-checkperm'); if (btn) btn.textContent = '■ Dừng Check';
    CHECKING = true; var idx = 0, okc = 0, noc = 0;
    if (activeTab !== 'pages') switchTab('pages');
    log('🔍 Check quyền ' + targets.length + ' page (thử start reel)…');
    // Chẩn đoán 1 lần/clone: in QUYỀN thật của token + VAI TRÒ (tasks) trên từng page.
    var diagged = {};
    for (var di = 0; di < idxs.length; di++) { if (!CHECKING) break; await diagClone(CLONES[idxs[di]], idxs[di], diagged, di === 0); }
    async function w() {
      while (CHECKING && idx < targets.length) {
        var o = targets[idx++], c = o.c, p = o.p, got = false, err = '';
        try {
          if (!c.token) await ensureToken(c);
          var ptk = await getPageToken(c, p.id);
          // Thử start /videos (graph-video) — chỉ tạo phiên upload, KHÔNG transfer/finish nên không đăng gì.
          var r = await gvPost(VER + '/' + p.id + '/videos?upload_phase=start&file_size=1048576&access_token=' + enc(ptk));
          if (r.json && r.json.upload_session_id) got = true; else err = errStr(r.json);
        } catch (e) { err = (e && e.message) || 'lỗi'; }
        p.kind = got ? 'perm' : 'noperm'; if (!got) p.err = shortErr(err, classify(err)); if (got) okc++; else noc++; updatePageRow(p);
      }
    }
    var pool = []; for (var k = 0; k < 6; k++) pool.push(w()); await Promise.all(pool);
    CHECKING = false; if (btn) btn.textContent = '🔍 Check Quyền';
    log('Quyền: ' + okc + ' CÓ · ' + noc + ' CHƯA.', noc ? 'err' : 'ok');
  }

  /* ───────────────────────── ENTRY ───────────────────────── */
  
  function isProxyStr(s) {
    return /^\d{1,3}(\.\d{1,3}){3}:\d+/.test(s) || /^[\w.-]+:\d+:[^:|]+:[^:|]+$/.test(s) || /^(http|socks5):\/\//.test(s);
  }
  function setCloneProxyRaw(c, proxy) {
    c.proxy = proxy || '';
    if (c.su) return;
    var parts = String(c.raw || '').split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s && !isProxyStr(s); });
    if (proxy) parts.push(proxy);
    c.raw = parts.join('|');
    var ta = $('reel-clones');
    if (ta) {
      var raws = CLONES.map(function (cc) { return cc.raw; });
      ta.value = raws.join('\n');
    }
  }

  window.__kzSetProxy = function (i) {
    var c = CLONES[i];
    if (!c) return;
    var v = window.prompt('Nhập Proxy cho Clone #' + (i + 1) + ' (' + (c.uidName || c.uid) + '):\nĐịnh dạng: ip:port  HOẶC  host:port:user:pass  HOẶC  socks5://ip:port\n(Để trống nếu muốn xoá proxy)', c.proxy || '');
    if (v === null) return;
    c.proxy = String(v).trim();
    setCloneProxyRaw(c, c.proxy);
    saveClones();
    updateCloneRow(i);
    renderPages();
    log('Đã cập nhật Proxy cho Clone #' + (i + 1) + ': ' + (c.proxy || 'Trực tiếp (Không proxy)'), 'ok');
  };

  // Thay cho onclick inline (CSP chặn script inline)
  window.KZ.action('kzOpenProxyReel', function (el) { window.__kzOpenProxyModal(parseInt(el.dataset.i, 10)); });
  window.KZ.action('kzOpenVia', function (el) { window.__kzOpenVia(parseInt(el.dataset.i, 10)); });
  window.KZ.action('kzOpenPage', function (el) { window.__kzOpenPage(el.dataset.pageId, parseInt(el.dataset.ci, 10)); });
  // Xoá 1 page khỏi danh sách tool (không đụng page thật trên FB). Gỡ khỏi pages/byId/ptok + lưu bền (CLPAGES + PPAGES).
  window.KZ.action('kzDelPage', function (el) {
    var pid = el.dataset.pageId; if (!pid) return;
    var nm = pageNameById(pid);
    if (!confirm('Xoá page "' + nm + '" (' + pid + ') khỏi danh sách?\nChỉ xoá trong tool, KHÔNG ảnh hưởng page thật trên Facebook.')) return;
    var c = ownerCloneOf(pid); if (!c) { log('Không tìm thấy page để xoá.', 'err'); return; }
    var remain = (c.pages || []).map(function (p) { return p.id; }).filter(function (id) { return id !== pid; });
    if (c.ptok) delete c.ptok[pid];
    setClonePagesFromText(c, remain.join('\n'));   // dựng lại pages/byId + cập nhật CLPAGES (bền qua F5)
    savePagesData(c);                               // ghi lại PPAGES (tên/token) không còn page đã xoá
    renderPages(); updateSummary();
    log('Đã xoá page ' + nm + ' (' + pid + ') khỏi danh sách.', 'ok');
  });

  window.__kzOpenPage = async function (pageId, ci) {
    var c = CLONES[ci];
    if (!c) return;
    if (!c.cookie && !c.uid) {
      alert('Clone chủ quản chưa có cookie hoặc UID để mở.');
      return;
    }
    if (window.EB && window.EB.openViaBrowser) {
      var pageUrl = 'https://www.facebook.com/' + pageId;
      try {
        log('🌐 Đang mở Fanpage [' + pageId + '] bằng phiên Via ' + (c.uidName || c.uid) + '…', 'ok');
        await window.EB.openViaBrowser({
          uid: c.uid,
          cookie: c.cookie,
          pass: c.pass,
          secret: c.twofa,
          proxy: c.proxy,
          name: (c.uidName || c.uid) + ' · Page ' + pageId,
          targetUrl: pageUrl
        });
      } catch (e) {
        log('Lỗi mở Fanpage: ' + ((e && e.message) || e), 'err');
      }
    } else {
      alert('Tính năng mở Via chưa sẵn sàng trên phiên bản này.');
    }
  };

  /* ───────────────────────── MODAL CẤU HÌNH PROXY VIA / CLONE ───────────────────────── */
  window.__kzOpenProxyModal = function (ci) {
    try {
      var isObj = (typeof ci === 'object' && ci !== null);
      var c = isObj ? (ci.clone || ci) : CLONES[ci];
      var idx = isObj ? (ci.index != null ? ci.index : 0) : ci;
      if (!c) {
        alert('Không tìm thấy thông tin Clone index: ' + idx);
        return;
      }

      var oldOv = document.getElementById('kz-proxy-modal-overlay');
      if (oldOv && oldOv.parentNode) oldOv.parentNode.removeChild(oldOv);

      var ov = document.createElement('div');
      ov.id = 'kz-proxy-modal-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100007;background:rgba(8,7,18,0.82);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

      function parsePx(str) {
        if (!str) return { proto: 'http', host: '', port: '', user: '', pass: '' };
        var s = String(str).trim();
        var proto = 'http';
        if (/^socks5:\/\//i.test(s)) { proto = 'socks5'; s = s.replace(/^socks5:\/\//i, ''); }
        else if (/^socks4:\/\//i.test(s)) { proto = 'socks4'; s = s.replace(/^socks4:\/\//i, ''); }
        else if (/^https:\/\//i.test(s)) { proto = 'https'; s = s.replace(/^https:\/\//i, ''); }
        else if (/^http:\/\//i.test(s)) { proto = 'http'; s = s.replace(/^http:\/\//i, ''); }
        var user = '', pass = '';
        if (s.includes('@')) {
          var at = s.split('@');
          var cr = at[0].split(':');
          user = cr[0] || ''; pass = cr[1] || '';
          s = at[1] || '';
        }
        var p = s.split(':');
        var host = p[0] || '', port = p[1] || '';
        if (p.length >= 4 && !user && !pass) {
          user = p[2] || ''; pass = p[3] || '';
        }
        return { proto: proto, host: host, port: port, user: user, pass: pass };
      }

      function buildPxStr(proto, host, port, user, pass) {
        host = String(host || '').trim();
        port = String(port || '').trim();
        user = String(user || '').trim();
        pass = String(pass || '').trim();
        if (!host || !port) return '';
        var p = (proto || 'http').toLowerCase();
        if (p === 'http') {
          if (user || pass) return host + ':' + port + ':' + user + ':' + pass;
          return host + ':' + port;
        }
        // Cho socks5, socks4, https
        if (user || pass) {
          return p + '://' + host + ':' + port + ':' + user + ':' + pass;
        }
        return p + '://' + host + ':' + port;
      }

      var currentPx = c.proxy || '';
      var initData = parsePx(currentPx);

      ov.innerHTML = `
        <div style="background:linear-gradient(180deg, #181528 0%, #100e1d 100%);border:1px solid rgba(139,92,246,0.35);border-radius:18px;width:100%;max-width:580px;box-shadow:0 24px 60px rgba(0,0,0,0.7),0 0 24px rgba(139,92,246,0.2);color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;">
          <!-- Header -->
          <div style="padding:18px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.02)">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a855f7);display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 12px rgba(168,85,247,0.3)">🌐</div>
              <div>
                <div style="font-weight:700;font-size:16px;color:#fff;letter-spacing:0.3px">Cấu Hình Proxy Cho Clone / Via</div>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px">Clone #${idx + 1} · UID: <span style="color:#38bdf8;font-family:monospace;font-weight:600">${c.uid || 'Chưa có UID'}</span> ${c.uidName ? '· ' + c.uidName : ''}</div>
              </div>
            </div>
            <button id="kz-px-btn-close" style="width:32px;height:32px;border-radius:8px;border:none;background:rgba(255,255,255,0.07);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .15s" data-hover-style="background:rgba(239,68,68,0.2);color:#f87171">✕</button>
          </div>

          <!-- Body -->
          <div style="padding:22px 24px;display:flex;flex-direction:column;gap:18px;max-height:calc(85vh - 140px);overflow-y:auto">
            
            <!-- Quick Input -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
                <label style="font-size:12px;font-weight:600;color:#c084fc;text-transform:uppercase;letter-spacing:0.5px">⚡ Nhập nhanh chuỗi Proxy (Auto Detect)</label>
                <div style="display:flex;gap:6px">
                  <button id="kz-px-btn-paste-clip" type="button" style="padding:4px 10px;font-size:11px;font-weight:600;background:rgba(168,85,247,0.18);border:1px solid rgba(168,85,247,0.4);border-radius:6px;color:#d8b4fe;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all .15s" title="Dán nội dung từ Clipboard vào đây">📋 Dán (Paste)</button>
                  <button id="kz-px-btn-copy-clip" type="button" style="padding:4px 10px;font-size:11px;font-weight:600;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);border-radius:6px;color:#38bdf8;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all .15s" title="Sao chép chuỗi Proxy này ra Clipboard">📄 Sao Chép (Copy)</button>
                </div>
              </div>
              <input id="kz-px-fast" type="text" value="${c.proxy ? c.proxy : ''}" placeholder="Ví dụ: 103.152.12.89:8080 hoặc socks5://user:pass@1.2.3.4:1080" style="width:100%;padding:10px 14px;background:#0d0b18;border:1px solid rgba(168,85,247,0.35);border-radius:8px;color:#38bdf8;font-family:monospace;font-size:13px;outline:none;box-sizing:border-box" />
              <div style="margin-top:6px;font-size:11px;color:#94a3b8">Hỗ trợ các định dạng: <code style="color:#f472b6">ip:port</code>, <code style="color:#f472b6">ip:port:user:pass</code>, <code style="color:#f472b6">user:pass@host:port</code>, <code style="color:#f472b6">protocol://host:port</code></div>
            </div>

            <!-- Detailed Form -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="font-size:12px;font-weight:600;color:#c084fc;text-transform:uppercase;letter-spacing:0.5px">🛠️ Chi tiết thông số Proxy</div>
              
              <div style="display:grid;grid-template-columns:120px 1fr 90px;gap:10px">
                <div>
                  <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">Giao thức</label>
                  <select id="kz-px-proto" style="width:100%;padding:9px 10px;background:#0d0b18;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none">
                    <option value="http" ${initData.proto === 'http' ? 'selected' : ''}>HTTP</option>
                    <option value="https" ${initData.proto === 'https' ? 'selected' : ''}>HTTPS</option>
                    <option value="socks5" ${initData.proto === 'socks5' ? 'selected' : ''}>SOCKS5</option>
                    <option value="socks4" ${initData.proto === 'socks4' ? 'selected' : ''}>SOCKS4</option>
                  </select>
                </div>
                <div>
                  <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">Host / IP</label>
                  <input id="kz-px-host" type="text" value="${initData.host || ''}" placeholder="123.45.67.89 hoặc proxy.host.com" style="width:100%;padding:9px 12px;background:#0d0b18;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;font-family:monospace;box-sizing:border-box" />
                </div>
                <div>
                  <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">Port</label>
                  <input id="kz-px-port" type="text" value="${initData.port || ''}" placeholder="8080" style="width:100%;padding:9px 10px;background:#0d0b18;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;font-family:monospace;box-sizing:border-box" />
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">Tài khoản (Username - Tuỳ chọn)</label>
                  <input id="kz-px-user" type="text" value="${initData.user || ''}" placeholder="Bỏ trống nếu không có" style="width:100%;padding:9px 12px;background:#0d0b18;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;font-family:monospace;box-sizing:border-box" />
                </div>
                <div>
                  <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">Mật khẩu (Password - Tuỳ chọn)</label>
                  <input id="kz-px-pass" type="text" value="${initData.pass || ''}" placeholder="Bỏ trống nếu không có" style="width:100%;padding:9px 12px;background:#0d0b18;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;font-family:monospace;box-sizing:border-box" />
                </div>
              </div>
            </div>

            <!-- Live Test Proxy Area -->
            <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:12px;font-weight:600;color:#94a3b8">KIỂM TRA KẾT NỐI (PING & LIVE IP)</span>
                <button id="kz-px-btn-test" style="padding:6px 14px;border-radius:7px;border:none;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s" data-hover-style="opacity:0.9">
                  <span>⚡</span> Kiểm Tra Ngay
                </button>
              </div>
              <div id="kz-px-test-result" style="padding:10px 12px;background:rgba(15,23,42,0.6);border:1px dashed rgba(255,255,255,0.12);border-radius:8px;font-size:12px;color:#64748b;font-family:monospace;line-height:1.5;min-height:36px;display:flex;align-items:center">
                Chưa kiểm tra. Nhấn "Kiểm Tra Ngay" để đo độ trễ và kiểm tra IP thực tế ra ngoài.
              </div>
            </div>

            <div style="font-size:11px;color:#94a3b8;line-height:1.4">
              💡 <b style="color:#cbd5e1">Cơ chế đồng bộ tự động:</b> Khi lưu Proxy cho Clone này, toàn bộ <b style="color:#a855f7">${c.pages ? c.pages.length : 0} Fanpage</b> trực thuộc sẽ tự động đi qua Proxy tương ứng khi tải dữ liệu hoặc mở trình duyệt kiểm tra!
            </div>

          </div>

          <!-- Footer Actions -->
          <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.25)">
            <div>
              <button id="kz-px-btn-clear" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#fca5a5;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s" data-hover-style="background:rgba(239,68,68,0.2)">
                🗑️ Gỡ Proxy
              </button>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <button id="kz-px-btn-openvia" style="padding:9px 15px;border-radius:8px;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#38bdf8;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s" data-hover-style="background:rgba(56,189,248,0.2)" title="Mở trình duyệt riêng của Via để kiểm tra lướt Facebook ngay">
                🌐 Mở Trình Duyệt Via
              </button>
              <button id="kz-px-btn-save" style="padding:9px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(124,58,237,0.4);transition:all .15s" data-hover-style="transform:translateY(-1px);box-shadow:0 6px 18px rgba(124,58,237,0.6)">
                💾 Lưu & Đồng Bộ
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(ov);

      var btnClose = ov.querySelector('#kz-px-btn-close');
      var inFast = ov.querySelector('#kz-px-fast');
      var selProto = ov.querySelector('#kz-px-proto');
      var inHost = ov.querySelector('#kz-px-host');
      var inPort = ov.querySelector('#kz-px-port');
      var inUser = ov.querySelector('#kz-px-user');
      var inPass = ov.querySelector('#kz-px-pass');
      var btnTest = ov.querySelector('#kz-px-btn-test');
      var boxResult = ov.querySelector('#kz-px-test-result');
      var btnClear = ov.querySelector('#kz-px-btn-clear');
      var btnOpenVia = ov.querySelector('#kz-px-btn-openvia');
      var btnSave = ov.querySelector('#kz-px-btn-save');

      function closeModal() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      }

      // Ngăn chặn nổi bọt sự kiện copy/paste/contextmenu ra document bên ngoài
      ov.addEventListener('paste', function (e) { e.stopPropagation(); });
      ov.addEventListener('copy', function (e) { e.stopPropagation(); });
      ov.addEventListener('contextmenu', function (e) { e.stopPropagation(); });

      var btnPasteClip = ov.querySelector('#kz-px-btn-paste-clip');
      var btnCopyClip = ov.querySelector('#kz-px-btn-copy-clip');

      if (btnPasteClip) {
        btnPasteClip.onclick = async function () {
          try {
            var text = '';
            if (navigator.clipboard && navigator.clipboard.readText) {
              text = await navigator.clipboard.readText();
            }
            if (!text && window.clipboardData) {
              text = window.clipboardData.getData('text');
            }
            if (!text) {
              text = prompt('Dán chuỗi Proxy vào đây (Ctrl+V):');
            }
            if (text && text.trim()) {
              inFast.value = text.trim();
              var parsed = parsePx(inFast.value);
              if (parsed.proto) selProto.value = parsed.proto;
              inHost.value = parsed.host || '';
              inPort.value = parsed.port || '';
              inUser.value = parsed.user || '';
              inPass.value = parsed.pass || '';
              var oldHtml = btnPasteClip.innerHTML;
              btnPasteClip.innerHTML = '✓ Đã dán!';
              btnPasteClip.style.color = '#4ade80';
              setTimeout(function () {
                btnPasteClip.innerHTML = oldHtml;
                btnPasteClip.style.color = '#d8b4fe';
              }, 1200);
            }
          } catch (err) {
            var manual = prompt('Dán chuỗi Proxy vào đây (Ctrl+V):', '');
            if (manual && manual.trim()) {
              inFast.value = manual.trim();
              var parsed = parsePx(inFast.value);
              if (parsed.proto) selProto.value = parsed.proto;
              inHost.value = parsed.host || '';
              inPort.value = parsed.port || '';
              inUser.value = parsed.user || '';
              inPass.value = parsed.pass || '';
            }
          }
        };
      }

      if (btnCopyClip) {
        btnCopyClip.onclick = function () {
          var str = inFast.value.trim() || buildPxStr(selProto.value, inHost.value, inPort.value, inUser.value, inPass.value);
          if (!str) {
            alert('Chưa có thông tin Proxy để sao chép.');
            return;
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(str).then(function () {
              var oldHtml = btnCopyClip.innerHTML;
              btnCopyClip.innerHTML = '✓ Đã chép!';
              btnCopyClip.style.color = '#4ade80';
              setTimeout(function () {
                btnCopyClip.innerHTML = oldHtml;
                btnCopyClip.style.color = '#38bdf8';
              }, 1200);
            }).catch(function () {
              prompt('Sao chép chuỗi proxy:', str);
            });
          } else {
            prompt('Sao chép chuỗi proxy:', str);
          }
        };
      }

      btnClose.onclick = closeModal;
      ov.onclick = function (e) {
        if (e.target === ov) closeModal();
      };

      inFast.oninput = function () {
        var parsed = parsePx(inFast.value);
        if (parsed.proto) selProto.value = parsed.proto;
        inHost.value = parsed.host || '';
        inPort.value = parsed.port || '';
        inUser.value = parsed.user || '';
        inPass.value = parsed.pass || '';
      };

      function syncToFast() {
        var str = buildPxStr(selProto.value, inHost.value, inPort.value, inUser.value, inPass.value);
        inFast.value = str;
      }
      selProto.onchange = syncToFast;
      inHost.oninput = syncToFast;
      inPort.oninput = syncToFast;
      inUser.oninput = syncToFast;
      inPass.oninput = syncToFast;

      btnTest.onclick = async function () {
        var pxStr = inFast.value.trim() || buildPxStr(selProto.value, inHost.value, inPort.value, inUser.value, inPass.value);
        var hostVal = inHost.value.trim();
        var portVal = inPort.value.trim();
        if (!hostVal || !portVal) {
          boxResult.innerHTML = '<span style="color:#f87171">❌ Vui lòng nhập Host và Port trước khi kiểm tra!</span>';
          return;
        }

        btnTest.disabled = true;
        btnTest.innerHTML = '<span>⏳</span> Đang test…';
        boxResult.innerHTML = '<span style="color:#38bdf8">🌐 Đang kiểm tra kết nối qua Proxy ' + (selProto.value || 'HTTP').toUpperCase() + ' tới máy chủ…</span>';

        try {
          if (!window.EB || !window.EB.testProxy) {
            boxResult.innerHTML = '<span style="color:#fbbf24">⚠️ Kenzious Native Bridge chưa sẵn sàng tính năng Test Proxy.</span>';
            return;
          }
          var testPayload = {
            protocol: (selProto.value || 'http').toLowerCase(),
            host: hostVal,
            port: portVal,
            user: inUser.value.trim(),
            pass: inPass.value.trim(),
            proxy: pxStr
          };
          var res = await window.EB.testProxy(testPayload);
          if (res && res.success) {
            var pingColor = res.latency < 100 ? '#4ade80' : (res.latency < 320 ? '#38bdf8' : (res.latency < 600 ? '#facc15' : '#f87171'));
            var pingNote = res.latency < 100 ? 'Siêu nhanh · VN/Asia' : (res.latency < 320 ? 'Tốc độ cao · US/Ngoại' : 'Trung bình');
            boxResult.innerHTML = '<span style="color:#4ade80;font-weight:700">✅ HOẠT ĐỘNG TỐT:</span> '
              + 'IP ra ngoài: <b style="color:#38bdf8">' + esc(res.ip) + '</b> · Độ trễ: <b style="color:' + pingColor + '">' + res.latency + 'ms</b> <span style="color:#94a3b8;font-size:11px">(' + pingNote + ')</span>';
          } else {
            boxResult.innerHTML = '<span style="color:#f87171;font-weight:700">❌ KẾT NỐI THẤT BẠI:</span> ' + esc((res && res.error) || 'Không thể kết nối');
          }
        } catch (err) {
          boxResult.innerHTML = '<span style="color:#f87171;font-weight:700">❌ LỖI:</span> ' + esc(err.message || err);
        } finally {
          btnTest.disabled = false;
          btnTest.innerHTML = '<span>⚡</span> Kiểm Tra Ngay';
        }
      };

      btnClear.onclick = function () {
        if (!confirm('Bạn có chắc chắn muốn gỡ Proxy của Clone #' + (idx + 1) + ' và dùng IP trực tiếp?')) return;
        c.proxy = '';
        var k = clKey(c);
        delete CLONE_PROXIES[k];
        try { kzSecureStore.setItem('reel-clone-proxies', JSON.stringify(CLONE_PROXIES)); } catch (_) {} syncProxies();
        if (PPAGES[k]) {
          delete PPAGES[k].proxy;
          try { kzSecureStore.setItem('reel-ppages', JSON.stringify(PPAGES)); } catch (_) {}
        }

        if (isObj && typeof ci.onClear === 'function') {
          ci.onClear();
        }

        saveClones();
        if (!isObj) {
          updateCloneRow(idx);
          renderPages();
          log('🗑️ Đã gỡ proxy của Clone #' + (idx + 1) + '. Chuyển sang dùng IP gốc.', 'ok');
        } else {
          // Đồng bộ sang tab Reel nếu có clone khớp UID
          window.__kzSyncProxyToReel(k, '');
        }

        if (typeof window.__kzRefreshCloneTab === 'function') {
          window.__kzRefreshCloneTab();
        }

        closeModal();
      };

      btnOpenVia.onclick = async function () {
        var pxStr = inFast.value.trim() || buildPxStr(selProto.value, inHost.value, inPort.value, inUser.value, inPass.value);
        c.proxy = pxStr;
        if (window.EB && window.EB.openViaBrowser) {
          try {
            await window.EB.openViaBrowser({
              uid: c.uid,
              cookie: c.cookie,
              pass: c.pass,
              secret: c.twofa,
              proxy: pxStr,
              name: c.uidName || c.viaName || c.uid
            });
          } catch (e) {
            alert('Lỗi mở trình duyệt Via: ' + ((e && e.message) || e));
          }
        }
      };

      btnSave.onclick = function () {
        var pxStr = inFast.value.trim() || buildPxStr(selProto.value, inHost.value, inPort.value, inUser.value, inPass.value);
        c.proxy = pxStr;

        var k = clKey(c);
        if (pxStr) {
          CLONE_PROXIES[k] = pxStr;
        } else {
          delete CLONE_PROXIES[k];
        }
        try { kzSecureStore.setItem('reel-clone-proxies', JSON.stringify(CLONE_PROXIES)); } catch (_) {} syncProxies();

        if (PPAGES[k]) {
          PPAGES[k].proxy = pxStr;
          try { kzSecureStore.setItem('reel-ppages', JSON.stringify(PPAGES)); } catch (_) {}
        }

        if (isObj && typeof ci.onSave === 'function') {
          ci.onSave(pxStr);
        }

        saveClones();
        if (!isObj) {
          updateCloneRow(idx);
          renderPages();
          log('🌐 Đã gán proxy ' + (pxStr || 'Trực tiếp') + ' cho Clone #' + (idx + 1) + ' và tự động đồng bộ ' + (c.pages ? c.pages.length : 0) + ' Fanpage.', 'ok');
        } else {
          window.__kzSyncProxyToReel(k, pxStr);
        }

        if (typeof window.__kzRefreshCloneTab === 'function') {
          window.__kzRefreshCloneTab();
        }

        closeModal();
      };

    } catch (err) {
      alert('Lỗi khởi tạo Modal Proxy: ' + (err && err.message));
      console.error(err);
    }
  };

  /* Đồng bộ Proxy từ tab Clone/Via sang tab Reel & Fanpage */
  window.__kzSyncProxyToReel = function (key, newProxy) {
    try {
      if (typeof CLONES !== 'undefined' && Array.isArray(CLONES)) {
        CLONES.forEach(function (c, i) {
          if (clKey(c) === key || (c.uid && c.uid === key)) {
            c.proxy = newProxy;
            if (typeof updateCloneRow === 'function') updateCloneRow(i);
          }
        });
        if (typeof renderPages === 'function') renderPages();
      }
    } catch (_) {}
  };

  window.__kzOpenVia = async function (i) {
    var c = CLONES[i];
    if (!c) return;
    if (!c.cookie && !c.uid) {
      alert('Via này chưa có UID hoặc Cookie để mở.');
      return;
    }
    if (window.EB && window.EB.openViaBrowser) {
      try {
        log('🌐 Đang khởi tạo trình duyệt phiên riêng cho Via ' + (c.uidName || c.uid) + '…', 'ok');
        await window.EB.openViaBrowser({
          uid: c.uid,
          cookie: c.cookie,
          pass: c.pass,
          secret: c.twofa,
          proxy: c.proxy,
          name: c.uidName || c.uid
        });
      } catch (e) {
        log('Lỗi mở trình duyệt Via: ' + ((e && e.message) || e), 'err');
      }
    } else {
      alert('Tính năng mở Via chưa sẵn sàng trên phiên bản này.');
    }
  };

  window.kzReelTabShow = function (show) {
    var host = build(); if (!host) return; host.classList.toggle('on', !!show); host.style.display = show ? '' : 'none';
    if (show) {
      // Đồng bộ clone + token từ tab CLONE/VIA (dùng chung localStorage 'reel-clones' + 'reel-ppages').
      try { PPAGES = JSON.parse(kzSecureStore.getItem('reel-ppages') || '{}') || PPAGES; } catch (e) {}
      try {
        var cv = kzSecureStore.getItem('reel-clones') || '';
        var ta = $('reel-clones');
        if (ta && ta.value !== cv) { ta.value = cv; applyClones(); }
        // LUÔN ưu tiên token đã chuẩn bị ở CLONE/VIA (mạnh nhất: EAAAAU>EAAB>EAAG) — GHI ĐÈ token yếu
        // mà Đăng Reel có thể đã cào trước đó, để Load Page/đăng dùng đúng token EAAAAU.
        CLONES.forEach(function (c) {
          var rec = PPAGES[clKey(c)];
          if (rec && rec.tok && rec.tok !== c.token) {
            c.token = rec.tok; c.tokKind = rec.kind || (/^EAAAAU/.test(rec.tok) ? 'EAAAAU' : /^EAAB/.test(rec.tok) ? 'EAAB' : 'EAAG');
          }
        });
        renderClones();
      } catch (e) {}
    }
    try { document.body.classList.toggle('reel-active', !!show); } catch (e) {}
  };
  // Cho khung shell (sidebar) gọi sang 1 sub-tab của Đăng Reel: prod/cmt/sched/config/pages/clone.
  window.kzReelSwitchTab = function (tab) { try { window.kzReelTabShow(true); switchTab(tab); } catch (e) {} };
  // Cho nút ĐĂNG REEL ở topbar shell bấm đăng.
  window.kzReelStart = function () { try { var b = $('reel-start'); if (b) b.click(); } catch (e) {} };
  // Cho mục sidebar "Tạo Page" mở công cụ Tạo Page / BM (đảm bảo panel Đăng Reel đã dựng trước).
  window.kzOpenPgTool = function () { try { window.kzReelTabShow(true); openPgTool(); } catch (e) {} };
})();
