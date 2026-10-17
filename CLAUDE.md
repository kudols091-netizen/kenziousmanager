# Kenzious Reel Studio v2

Ứng dụng Electron desktop "All-In-One AI Video Studio" — tải video, reup bằng AI (dịch, TTS, tách nhạc), đăng lên nhiều kênh (Facebook Reels, TikTok, YouTube Shorts, Instagram).

## Folder Structure

```
src/
  main.js              — Electron main process (entry point)
  preload.js           — preload bridge (contextBridge → renderer)
  core/                — business logic modules
    ai-pipeline.js       — AI xử lý video (dịch, phụ đề, rút gọn text)
    downloader.js        — tải video (yt-dlp wrapper)
    voice-synthesizer.js — TTS
    audio-separator.js   — tách vocal/nhạc (demucs)
    publisher.js         — đăng bài lên các nền tảng
    publisher-db.js      — SQLite DB theo dõi bài đã đăng
    channel-manager.js   — quản lý kênh/tài khoản
    destinations-manager.js — quản lý đích đăng
    facebook-toolkit.js  — FB toolkit (tạo page, seeding, clone)
    facebook-reels-poster.js — đăng FB Reels
    fbreel-bridge.js     — bridge giữa main ↔ renderer cho FB Reel
    torrent-manager.js   — WebTorrent P2P
    proxy-checker.js     — kiểm tra proxy
    proxy-net.js         — proxy networking (HTTP/SOCKS)
    license-guard.js     — xác thực license key
    secure-store.js      — lưu trữ mã hoá
    storage.js           — file-based storage
    updater.js           — auto-update (electron-updater)
    renderer.js          — render video bằng ffmpeg
    paths.js             — đường dẫn (bin, data, resources)
    process-registry.js  — quản lý child processes
    browser/             — Chromium profile manager
    automation/          — browser automation helpers
    platforms/           — platform-specific posters (facebook-poster.js)
  scripts/             — Python workers (TTS, demucs, omnivoice)
renderer/
  index.html           — UI chính
  js/                  — frontend modules
    app.js               — khởi tạo app, routing tabs
    workspace-hub.js     — hub chọn workspace
    tab-ai.js            — tab AI pipeline
    tab-download.js      — tab tải video
    tab-publish.js       — tab đăng bài
    tab-channels.js      — tab quản lý kênh
    tab-settings.js      — tab cài đặt
    tab-toolkit.js       — tab FB toolkit
    fbreel-core.js       — FB Reel core UI
    fbreel-reel.js       — FB Reel reup UI
    fbreel-clone.js      — FB Reel clone UI
    safe-dom.js          — DOM sanitization helpers
  styles/              — CSS (theme.css, layout.css, components.css, ...)
bin/                   — external tools (ffmpeg DLLs, yt-dlp, ffprobe — NOT committed, setup manually)
data/                  — runtime data (presets.json committed, DB/profiles gitignored)
assets/                — icons, logos, backgrounds
extensions/            — Chrome extension "GetCookie"
GetCookie/             — legacy cookie extractor
scripts/               — build/deploy scripts (keygen.js, make-zip.ps1, setup-ig-python.ps1)
server-admin/          — PHP admin panel (license management)
```

## Commands

```bash
npm start          # chạy app (= electron .)
npm run dev        # chạy app dev mode (= electron .)
npm run build      # build installer (electron-builder → dist/)
```

## Tech Stack

- **Electron 31** — main + renderer process
- **Vanilla JS** — không framework frontend, DOM thủ công
- **puppeteer-core / playwright-core** — browser automation
- **ffmpeg** — render/xử lý video (DLLs trong bin/)
- **yt-dlp** — tải video
- **Python workers** — TTS, demucs (chạy qua child_process)
- **SQLite** (via better-sqlite3 runtime) — publisher DB
- **electron-updater** — auto-update từ virals.kenzious.com/reel/
- **WebTorrent** — P2P file sharing

## Coding Rules

- Vanilla JS toàn bộ, không dùng framework (React, Vue, etc.)
- Main process (`src/`) giao tiếp với renderer qua `ipcMain`/`ipcRenderer` thông qua `preload.js` (contextBridge)
- Frontend modules trong `renderer/js/` — mỗi tab một file, export hàm `init()`
- CSS thuần trong `renderer/styles/`, theme qua CSS custom properties trong `theme.css`
- Không commit: node_modules, dist, bin/*.exe, data/*.db, Chromium/, .env, cookies
- File backup đặt tên `*.bak.js` (gitignored)
- Python scripts đặt trong `src/scripts/`, chạy qua child_process spawn
- Deploy: build xong upload 3 file (installer + latest.yml + blockmap) lên virals.kenzious.com/reel/ qua FTP
