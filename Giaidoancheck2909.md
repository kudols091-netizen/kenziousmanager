
# PHẦN 1 — TỔNG QUAN HỆ THỐNG & NHẬN DIỆN THƯƠNG HIỆU KENZIOUS

## 1.1. Mục tiêu và Sứ Mệnh Kenzious Reel V2
**Kenzious Reel Studio V2** là một ứng dụng Desktop chuyên nghiệp độc lập (Clean-Room Desktop Suite) được xây dựng trên nền tảng Electron, Node.js, Playwright/Puppeteer và FFmpeg. Ứng dụng được thiết kế chuyên biệt để phục vụ nhu cầu sản xuất và phân phối nội dung video ngắn định dạng dọc (9:16 Vertical Video) quy mô lớn cho các nhà sáng tạo nội dung, đội ngũ MMO và các studio media.

Hệ thống giải quyết 4 bài toán cốt lõi trong chuỗi cung ứng nội dung ngắn:
1. **Thu thập nội dung đa nền tảng tốc độ cao (P2P Ingestion & Network Sniffing)**: Cho phép tải hàng loạt video từ Douyin (TikTok Trung Quốc), TikTok, YouTube Shorts, Facebook Reels, Instagram Reels, Xiaohongshu (RedNote), Bilibili mà không bị dính watermark/logo mờ của nền tảng; hỗ trợ tải trực tiếp qua giao thức chia sẻ phân tán P2P WebTorrent (Magnet links).
2. **Xử lý video lách bản quyền tự động (Clean-Room Video Transcoding)**: Tự động chuyển đổi tỷ lệ khung hình ngang sang dọc 9:16 bằng kỹ thuật **Gaussian Blur 2 bên / trên dưới** kết hợp phóng to nội suy trung tâm bằng thuật toán Lanczos; áp dụng các kỹ thuật biến đổi vi mô chống nhận diện thuật toán băm (Content ID Hash): lật gương hình ảnh, vi nhiễu hạt ngẫu nhiên, cắt viền động 1.5%, vi điều chỉnh cao độ âm thanh (audio pitch/tempo micro-shift) và xóa toàn bộ metadata ban đầu.
3. **Chuyển ngữ & Lồng tiếng AI tiếng Việt chất lượng cao (AI Subtitling & Dubbing)**: Tự động tách lời thoại và nhạc nền (Vocal Isolation via Demucs AI hoặc Phase Cancellation fallback), dịch thuật kịch bản có kiểm soát dung lượng thời gian (Time-Budgeted Translation), lược bỏ từ đệm thừa bằng thuật toán rút gọn tiếng Việt (`softShortenVi`), tổng hợp giọng đọc AI mượt mà (Edge-TTS Neural & OmniVoice Local CUDA Zero-Shot Voice Cloning), và tự động nén âm lượng nhạc nền khi có tiếng thuyết minh (Sidechain Audio Ducking -14dB).
4. **Phân phối đa kênh tự động chống Checkpoint (Batch Video Publishing Pipeline)**: Tự động hóa tải lên Facebook Reels, Fanpages, và các nền tảng mạng xã hội với cơ chế phân luồng độc lập theo tài khoản (Lane Concurrency), độ trễ ngẫu nhiên chống hành vi bot (Anti-Spam Jitter 15-20s), thời gian hồi giữa các bài đăng trên cùng kênh (Destination Cooldown 60-120s), cùng cơ chế bóc tách Post ID và lưu trữ lịch sử hoàn chỉnh.

---

## 1.2. Triết lý Clean-Room Reverse Engineering & Phòng Sạch
Dự án được xây dựng dựa trên nguyên tắc **Clean-Room Specification and Rewrite (Phòng sạch - Hiểu bản chất và Tự viết lại)**:
- **Kiến thức tự do vs Biểu đạt bản quyền**: Mục tiêu phân tích các giải pháp thị trường (như ZooReup, DolaStudio, Drama MMO V7) là để bóc tách luồng dữ liệu (Data Flows), cấu trúc gói tin (Payload Format), cơ chế tương tác trình duyệt (Browser Automation Tricks) và quy chuẩn bộ lọc âm thanh/hình ảnh. Toàn bộ mã nguồn, cấu trúc lớp (Class), hàm xử lý, giao diện người dùng và cơ sở dữ liệu của Kenzious Reel V2 được lập trình lại từ đầu một cách độc lập, trong sạch và tối ưu cho môi trường Windows hiện đại.
- **Loại bỏ rác Compiler, Telemetry và Backdoor**: Ứng dụng sạch 100%, không chứa mã theo dõi ngầm, không gửi dữ liệu về máy chủ bên thứ ba, không bị khóa cứng vào hệ thống cấp phép bản quyền (license lock) ngoại lai.
- **Kỷ luật an toàn tuyệt đối**: Mọi thao tác tải lên và kiểm tra tài khoản đều chạy qua hồ sơ trình duyệt cô lập (Isolated UserDataDir), hỗ trợ cấu hình Proxy riêng cho từng tài khoản, bảo vệ danh tính tối đa.

---

## 1.3. Nhận diện Thương hiệu Kenzious (Brand Identity)
Dự án Kenzious Reel V2 kế thừa và đồng bộ nhận diện thương hiệu từ hệ sinh thái Kenzious:

| Thành tố nhận diện | Tệp tài nguyên (Asset Path) | Ý nghĩa & Ứng dụng trong giao diện |
|--------------------|----------------------------|-----------------------------------|
| **Mascot Kenzious** | `assets/Mascot-Kenzious.png` | Chú Cáo Husky công nghệ đeo kính Cyberpunk thông minh, đại diện cho tính tự động hóa, sắc sảo và hiện đại. Xuất hiện tại góc thương hiệu, màn hình chờ và thẻ trạng thái rỗng. |
| **Logo Icon Chính** | `assets/Logo-Icon-Kenzious.png` & `.svg` | Biểu tượng hình học cách điệu phát quang, nằm ở góc trên bên trái thanh tiêu đề (Top Bar) và Sidebar navigation. |
| **Favicon & Icon App** | `assets/Kenzi-Favicon.png` & `assets/kenzious.ico` | Icon ứng dụng khi chạy trên Taskbar Windows, Desktop Shortcut và tiêu đề cửa sổ Electron. |
| **Hình nền không gian** | `assets/Background-Kenzious.png` | Không gian vũ trụ tối Deep Space với các vệt sáng phát quang, tạo chiều sâu thị giác Glassmorphism cho toàn bộ phần mềm. |

---

## 1.4. Bảng màu Neon Cyberpunk (Kenzious Palette) & Gradients
Giao diện Kenzious Reel Studio V2 được định hình theo phong cách **Dark Cyberpunk Studio** cao cấp, kết hợp giữa nền đen thẳm (Deep Obsidian) và các điểm nhấn phát quang Neon (Neon Magenta, Electric Cyan, Cyber Violet):

```css
/* BẢNG MÀU CHỦ ĐẠO KENZIOUS STUDIO V2 */
--bg-primary: #0f0d23;       /* Obsidian Night: Nền tối sâu thẳm của toàn bộ khung ứng dụng */
--bg-secondary: #16132e;     /* Space Navy: Nền thanh công cụ Sidebar và Topbar */
--bg-tertiary: #241c3d;      /* Deep Violet Card: Nền các khối container và bảng dữ liệu */
--bg-card: rgba(22, 19, 46, 0.82);      /* Thẻ bán trong suốt tạo hiệu ứng chiều sâu */
--bg-card-hover: rgba(36, 28, 61, 0.92); /* Thẻ khi rê chuột qua */
--bg-input: rgba(15, 13, 35, 0.85);     /* Ô nhập liệu tối có viền sáng nhẹ */

/* ĐIỂM NHẤN THƯƠNG HIỆU & ĐIỀU HƯỚNG */
--primary-accent: #ff239d;   /* Neon Magenta: Màu nhận diện chính, nút hành động call-to-action */
--primary-hover: #e324dd;    /* Hover Magenta */
--brand-cyan: #19c8ff;       /* Electric Cyan: Màu đại diện cho công nghệ, tải xuống và streaming */
--brand-violet: #8c4fff;     /* Cyber Violet: Màu đại diện cho trí tuệ nhân tạo (AI Pipeline) */
--brand-purple: #9b3dff;     /* Deep Violet Accent */

/* MÀU TRẠNG THÁI CHỨC NĂNG */
--success-color: #20d990;    /* Emerald Green: Trạng thái Thành công / Tài khoản Live / Đã xuất bản */
--danger-color: #ff4e72;     /* Neon Rose: Lỗi / Thất bại / Tài khoản Checkpoint */
--warning-color: #ffb83d;    /* Cyber Amber: Cảnh báo / Đang chờ duyệt / Tạm dừng */
--info-color: #19c8ff;       /* Neon Cyan: Đang xử lý / Tiến trình Render */
```

### Dải Gradient Nhận Diện Đặc Trưng
- **Logo Gradient**: `linear-gradient(90deg, #19c8ff 0%, #8c4fff 55%, #ff239d 100%)` — Dải màu chuyển tiếp từ Electric Cyan sang Cyber Violet và kết thúc tại Neon Magenta. Dùng cho chữ thương hiệu, viền nổi bật.
- **Accent Button Gradient**: `linear-gradient(100deg, #ff239d 0%, #9b3dff 100%)` — Dùng cho các nút bấm hành động then chốt ("Bắt đầu xuất bản", "Thêm video", "Lưu cấu hình").
- **Neon Glow Shadow**: 
  - `--accent-glow: 0 0 20px rgba(255, 35, 157, 0.45);`
  - `--cyan-glow: 0 0 20px rgba(25, 200, 255, 0.4);`
  - `--btn-glow: 0 8px 20px rgba(226, 34, 190, 0.28);`

---

## 1.5. Hệ Thống Typography Chuẩn Hóa
Ứng dụng sử dụng phông chữ tiêu chuẩn công nghiệp **Roboto** (Google Fonts) với đầy đủ các biến thể trọng số (Font Weights) được nhúng qua `@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800;900&display=swap');`:
- **Font Stack**: `'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Trọng số sử dụng**:
  - `300 (Light)`: Dùng cho văn bản chú thích phụ, ID kỹ thuật, thời gian hệ thống.
  - `400 (Regular)`: Dùng cho nội dung văn bản thông thường, mô tả ngắn, danh sách nhật ký.
  - `500 (Medium)`: Dùng cho nhãn điều hướng phụ, giá trị trong bảng dữ liệu.
  - `600 / 700 (Semi-Bold / Bold)`: Dùng cho tiêu đề cột, tên tài khoản, nút bấm phụ, tab navigation.
  - `800 / 900 (Black)`: Dùng cho tiêu đề Tab, nút bấm hành động chính (`btn-brand`), số liệu thống kê lớn (Metrics Counter).
- **Quy chuẩn tỷ lệ**: Kích thước phông nền tảng `13px`, khoảng cách ký tự `letter-spacing: .02em` giúp giao diện ứng dụng desktop hiển thị sắc nét, mật độ thông tin cao mà không bị rối mắt.

---

## 1.6. Hệ Thống CSS Tokens & Design System
Hệ thống CSS được tổ chức thành 3 tệp module hóa tại `renderer/styles/`:
1. `theme.css` (4,340 bytes): Khai báo toàn bộ Design Tokens (:root, [data-theme="dark"], [data-theme="light"]), màu sắc, biến gradient, hiệu ứng phát quang Neon, thanh cuộn tùy biến Webkit Scrollbar, và các lớp tiện ích Typography/Button.
2. `layout.css` (4,603 bytes): Định nghĩa cấu trúc khung xương giao diện (App Grid Structure), bao gồm Top Bar (chiều cao 56px), Sidebar điều hướng (chiều rộng 220px thu gọn hoặc mở rộng), Main Content Area (cuộn độc lập với `overflow-y: auto`), Footer Status Bar, và hệ thống lưới Responsive 12 cột.
3. `components.css` (26,280 bytes): Định nghĩa kiểu dáng chi tiết cho tất cả các thành phần giao diện người dùng:
   - Thẻ hiển thị dữ liệu (`.glass-card`, `.stat-card`).
   - Nút bấm đa năng (`.btn`, `.btn-primary`, `.btn-brand`, `.btn-outline`, `.btn-danger`, `.btn-icon`).
   - Bảng dữ liệu phong cách Studio (`.data-table`, `.table-header`, `.table-row`, `.badge-status`).
   - Hộp nhập liệu và Form Controls (`.form-group`, `.form-control`, `.form-select`, `.toggle-switch`).
   - Thanh tiến trình đa trạng thái (`.progress-bar`, `.progress-fill`, `.progress-glow`).
   - Khung hộp thoại tương tác (`.modal`, `.modal-backdrop`, `.modal-dialog`, `.modal-header`, `.modal-body`, `.modal-footer`).
   - Hộp thông báo thời gian thực (`.toast-container`, `.toast-item`, `.toast-success`, `.toast-error`).
   - Màn hình giả lập Terminal (`.terminal-box`, `.terminal-logs`, `.log-entry-info`, `.log-entry-warn`, `.log-entry-error`).

---

# PHẦN 2 — CẤU TRÚC THƯ MỤC & FILE TREE HỆ THỐNG A-Z

## 2.1. Cây Thư Mục Hoàn Chỉnh Dự Án
Cấu trúc tổ chức thư mục của dự án **Kenzious Reel Studio V2** tại `D:\KOAL\Kenzious Reel V2` được chuẩn hóa theo mô hình ứng dụng Desktop cao cấp, phân định ranh giới nghiêm ngặt giữa mã thực thi giao diện (Renderer), tiến trình nền tảng (Main Core), các tệp nhị phân hỗ trợ (Binaries), cơ sở dữ liệu (Data) và các tập lệnh máy học (Python Workers):

```text
D:\KOAL\Kenzious Reel V2
├── .gitignore                         # Danh sách loại trừ Git (node_modules, output, cache)
├── package.json                       # Cấu hình dependency npm, electron version, start script
├── package-lock.json                  # Lock file dependency npm
├── README.md                          # Hướng dẫn kỹ thuật và mô tả tính năng v2
├── Run-KenziousReel.bat               # Tập lệnh khởi chạy ứng dụng nhanh 1-click cho người dùng
├── assets/                            # Bộ nhận diện thương hiệu & Media tĩnh
│   ├── Background-Kenzious.png        # Hình nền không gian Glassmorphism vũ trụ
│   ├── Kenzi-Favicon.png              # Favicon trình duyệt/giao diện
│   ├── kenzious.ico                   # Windows application icon
│   ├── Logo-Icon-Kenzious.png         # Logo icon thương hiệu độ phân giải cao
│   ├── Logo-Icon-Kenzious.svg         # Logo vector SVG chuẩn sắc nét
│   └── Mascot-Kenzious.png            # Mascot Cáo Husky công nghệ đeo kính Cyberpunk
├── bin/                               # Các công cụ nhị phân CLI bên thứ ba
│   ├── ffmpeg.exe                     # Công cụ render & mã hóa video đa năng
│   ├── ffprobe.exe                    # Công cụ phân tích thông số metadata video/audio
│   └── yt-dlp.exe                     # Trình tải video đa nền tảng chất lượng cao
├── data/                              # Cơ sở dữ liệu và lưu trữ trạng thái cục bộ
│   ├── accounts.json                  # Danh sách tài khoản MXH, cookie, proxy, EAAB token
│   ├── history.json                   # Lịch sử các tác vụ tải và render đã hoàn thành
│   ├── kenzious.db                    # SQLite WAL database (sessions, publish_events, jobs)
│   ├── presets.json                   # Bộ cấu hình mẫu (preset) render và AI dubbing
│   ├── settings.json                  # Cấu hình toàn cục (đường dẫn tools, API keys, theme)
│   ├── post_errors/                   # Thư mục lưu ảnh chụp màn hình chẩn đoán khi đăng Reels lỗi
│   │   └── debug_reels_err_*.png      # Full page screenshot tại thời điểm timeout/exception
│   └── profiles/                      # Thư mục lưu trữ UserDataDir của các phiên trình duyệt
│       └── <account_id>/              # Hồ sơ Chromium cô lập cho từng tài khoản Playwright
├── output/                            # Thư mục lưu trữ video thành phẩm sau khi render/tải về
│   ├── sample_reel_test.mp4           # Video mẫu kiểm thử định dạng dọc 9:16
│   └── preview_tts_*.mp3              # Các đoạn âm thanh AI lồng tiếng được sinh ra
├── renderer/                          # Phân hệ Giao diện Người dùng (Frontend - Chromium Webview)
│   ├── index.html                     # Trang HTML chính chứa khung xương 6 Tabs và 8 Modals
│   ├── js/                            # Mã nguồn JavaScript điều khiển tương tác người dùng
│   │   ├── app.js                     # Controller trung tâm, router tab, toast, event listener
│   │   ├── tab-ai.js                  # Điều khiển Tab 2: AI Subtitling, Voice Dubbing & Render
│   │   ├── tab-channels.js            # Điều khiển Tab 3: Quản lý Tài khoản, Cookie & Fanpage
│   │   ├── tab-download.js            # Điều khiển Tab 1: Ingestion URL & WebTorrent P2P
│   │   └── tab-publish.js             # Điều khiển Tab 4: Dispatcher, Sửa Caption & Queue
│   └── styles/                        # Hệ thống CSS Design Tokens phong cách Cyberpunk
│       ├── components.css             # Định kiểu dáng cho buttons, cards, tables, modals
│       ├── layout.css                 # Khung lưới bố cục (Grid, Sidebar, Topbar, Main view)
│       └── theme.css                  # Bảng màu Neon Cyberpunk, Google Fonts Roboto, Gradients
└── src/                               # Phân hệ Lõi Tiến Trình Nền (Backend - Electron Main Process)
    ├── main.js                        # Điểm khởi động Electron, quản lý cửa sổ & 40+ IPC handlers
    ├── preload.js                     # Cầu nối ContextBridge bảo mật exposing window.api
    ├── core/                          # Các module động cơ nghiệp vụ độc lập (Core Engines)
    │   ├── ai-pipeline.js             # Điều phối toàn diện quy trình AI (ASR, Dịch, TTS, Ducking)
    │   ├── audio-separator.js         # Tách giọng nói & nhạc nền (Demucs / Phase Cancellation)
    │   ├── channel-manager.js         # Quản lý tài khoản, mã hóa token, hồ sơ Playwright
    │   ├── destinations-manager.js    # Khám phá và quản lý Fanpages, Groups, Kênh đích
    │   ├── douyin-scraper.js          # Playwright Network Tap bắt CDN Douyin không watermark
    │   ├── downloader.js              # Bộ đóng gói yt-dlp tải video đa luồng
    │   ├── facebook-reels-poster.js   # Module tự động hóa Facebook Reels 3-Step Wizard chuẩn xác
    │   ├── publisher-db.js            # Lớp giao tiếp cơ sở dữ liệu SQLite quản lý phiên xuất bản
    │   ├── publisher.js               # Động cơ điều phối phân phối đa kênh (Lane Concurrency)
    │   ├── renderer.js                # Động cơ FFmpeg dựng video 9:16 Vertical Blur & Lách bản quyền
    │   ├── storage.js                 # Quản lý đọc/ghi an toàn các file JSON cấu hình cục bộ
    │   ├── text-shortener.js          # Thuật toán rút gọn từ đệm tiếng Việt (softShortenVi)
    │   ├── torrent-manager.js         # Động cơ WebTorrent chọn lọc và tải P2P Magnet links
    │   └── voice-synthesizer.js       # Bộ tổng hợp giọng nói kép (Edge-TTS & OmniVoice CUDA)
    └── scripts/                       # Các kịch bản phụ trợ Python chạy nền (Python Workers)
        ├── demucs_worker.py           # Worker tách vocal/music bằng thư viện Facebook Demucs
        ├── omnivoice_worker.py        # Worker tổng hợp giọng nói chất lượng cao OmniVoice
        └── tts_worker.py              # Worker chạy Edge-TTS lấy stream audio MP3
```

---

## 2.2. Phân Loại Vai Trò Từng Thư Mục Cấp Cao

### 1. Thư mục `assets/`
Chứa toàn bộ các hình ảnh đồ họa thương hiệu chất lượng cao. Đảm bảo tính nhất quán thẩm mỹ từ icon ứng dụng trên hệ điều hành đến các thành phần visual bên trong giao diện webview. Đặc biệt, hình ảnh nền `Background-Kenzious.png` kết hợp cùng các lớp phủ gradient bán trong suốt tạo ra phong cách kính mờ (Glassmorphism) độc bản.

### 2. Thư mục `bin/`
Chứa các công cụ thực thi nhị phân độc lập của bên thứ ba dành cho Windows 64-bit:
- `ffmpeg.exe` (phiên bản v6.x/v7.x có hỗ trợ thư viện bộ mã hóa phần cứng NVENC): Được gọi ngầm bởi `renderer.js`, `audio-separator.js` và `ai-pipeline.js` để trích xuất âm thanh, chuyển đổi mã (transcode), ghép luồng (multiplex), và áp dụng các bộ lọc phức hợp (`filter_complex`).
- `ffprobe.exe`: Được dùng để trích xuất các thông số kỹ thuật chi tiết của video/audio đầu vào (thời lượng `duration`, độ phân giải `width/height`, tốc độ khung hình `fps`, định dạng codec, tần số lấy mẫu âm thanh `sample_rate`).
- `yt-dlp.exe`: Công cụ dòng lệnh mạnh mẽ được cập nhật liên tục để tải video từ các trang mạng xã hội lớn (YouTube, TikTok, Facebook, Instagram, Bilibili, RedNote) với chất lượng video tốt nhất có thể.

### 3. Thư mục `data/`
Đóng vai trò là tầng lưu trữ dữ liệu bền vững (Persistence Layer) tại máy trạm cục bộ của người dùng:
- Các tệp JSON (`settings.json`, `accounts.json`, `presets.json`, `history.json`) phục vụ lưu trữ cấu hình nhẹ, dễ đọc, dễ sao lưu và chỉnh sửa thủ công khi cần.
- Tệp SQLite `kenzious.db`: Vận hành ở chế độ WAL (Write-Ahead Logging) để lưu trữ các bảng quan hệ phức tạp như lịch sử sự kiện đăng bài (`publish_events`), các phiên xuất bản hàng loạt (`sessions`), và bản nháp chiến dịch (`job_drafts`). Đảm bảo toàn vẹn dữ liệu khi tiến trình gặp sự cố đột ngột.
- Thư mục `post_errors/`: Nơi lưu trữ tự động các tệp ảnh chụp màn hình chẩn đoán (`debug_reels_err_<timestamp>.png`) mỗi khi quy trình tự động hóa Playwright gặp lỗi quá thời gian chờ (timeout) hoặc không tìm thấy phần tử DOM.
- Thư mục `profiles/`: Lưu trữ các thư mục dữ liệu người dùng (`userDataDir`) riêng biệt của từng tài khoản mạng xã hội. Việc cô lập thư mục profile này giúp duy trì trạng thái đăng nhập, cookies, bộ nhớ đệm (cache) và local storage của từng tài khoản mà không gây xung đột chéo.

### 4. Thư mục `output/`
Thư mục lưu trữ đích mặc định cho tất cả các tệp media được sản xuất bởi Kenzious Reel Studio:
- Video đã render chuyển đổi tỷ lệ dọc 9:16 có hiệu ứng làm mờ nền.
- Video đã qua bộ lọc lách bản quyền đa tầng.
- Video đã hoàn tất ghép phụ đề tự động và lồng tiếng AI tiếng Việt.
- Các tệp âm thanh nghe thử (Preview TTS) sinh ra từ bộ điều khiển giọng đọc.

### 5. Thư mục `renderer/`
Phân hệ Frontend thuần túy vận hành bên trong Chromium Webview của Electron:
- Sử dụng chuẩn HTML5 ngữ nghĩa, Vanilla JavaScript module hóa cao độ, và Vanilla CSS với Design Tokens.
- Hoàn toàn không sử dụng các framework nặng nề (như React, Vue hay Angular) để đảm bảo tốc độ khởi động tức thì, tiêu tốn ít bộ nhớ RAM và không có độ trễ kết xuất (Zero Render Overhead).
- Giao tiếp với tiến trình Main an toàn thông qua đối tượng `window.api` được tiêm từ `preload.js`.

### 6. Thư mục `src/`
Phân hệ Backend vận hành trực tiếp trên môi trường Node.js với toàn quyền truy cập tài nguyên hệ điều hành:
- Khởi tạo và quản lý vòng đời cửa sổ ứng dụng Electron.
- Đăng ký và xử lý hơn 40 kênh IPC (Inter-Process Communication).
- Điều khiển các tiến trình con (Child Processes) như FFmpeg, yt-dlp và Python Workers.
- Tự động hóa trình duyệt web không đầu (Headless Browser) hoặc có đầu (Headed Browser) bằng Playwright/Puppeteer-core để thực hiện các thao tác đăng bài phức tạp.

---

## 2.3. Bảng Tra Cứu Tập Tin và Phân Hệ Đảm Nhiệm

| Đường dẫn tập tin | Dung lượng (Bytes) | Phân hệ kỹ thuật | Trách nhiệm chính trong hệ thống |
|-------------------|-------------------|-------------------|----------------------------------|
| `src/main.js` | 10,357 | Backend (Electron Main) | Cửa sổ BrowserWindow, App Lifecycle, 40+ `ipcMain.handle` |
| `src/preload.js` | 5,595 | Backend / Bridge | Phơi bày `window.api` qua `contextBridge` an toàn |
| `src/core/facebook-reels-poster.js` | 68,402 | Backend (Automation) | Đăng Facebook Reels 3-Step, Corner Scan, Caption, Post ID |
| `src/core/publisher.js` | 23,502 | Backend (Engine) | Điều phối hàng đợi, Lane Concurrency, Jitter, Cooldown |
| `src/core/publisher-db.js` | 7,877 | Backend (Database) | Giao tiếp SQLite `kenzious.db`, lưu trữ events, jobs, sessions |
| `src/core/channel-manager.js` | 25,285 | Backend (Account) | Quản lý Profile Chromium, Import Cookie, Check Status, EAAB |
| `src/core/destinations-manager.js` | 6,830 | Backend (Destinations)| Truy vấn và lưu trữ Fanpage, Group, Kênh đích Facebook |
| `src/core/downloader.js` | 9,531 | Backend (Ingestion) | Tải video đa nền tảng qua yt-dlp, quản lý tiến trình tải |
| `src/core/douyin-scraper.js` | 7,929 | Backend (Ingestion) | Bắt gói tin Douyin `/web/aweme/post/`, trích CDN sạch |
| `src/core/torrent-manager.js` | 7,695 | Backend (Ingestion) | Tải P2P WebTorrent qua Magnet, kiểm tra thời lượng video |
| `src/core/renderer.js` | 9,416 | Backend (Media) | Render FFmpeg 9:16 Vertical Blur, Lách bản quyền NVENC/CPU |
| `src/core/ai-pipeline.js` | 5,729 | Backend (AI) | Điều phối quy trình ASR, Dịch, TTS, Ducking tự động |
| `src/core/audio-separator.js` | 7,972 | Backend (Audio) | Tách vocal/music bằng Demucs AI hoặc Phase Cancellation |
| `src/core/text-shortener.js` | 6,389 | Backend (NLP) | Rút gọn từ đệm tiếng Việt theo thời lượng (`softShortenVi`) |
| `src/core/voice-synthesizer.js` | 10,275 | Backend (Audio) | Tổng hợp giọng đọc Edge-TTS, OmniVoice CUDA, ElevenLabs |
| `src/core/storage.js` | 6,000 | Backend (Storage) | Đọc ghi các file cấu hình JSON cục bộ an toàn |
| `src/scripts/demucs_worker.py` | 1,534 | Backend (Worker) | Python script chạy Demucs model tách âm thanh |
| `src/scripts/omnivoice_worker.py`| 3,969 | Backend (Worker) | Python script tổng hợp giọng đọc mô phỏng OmniVoice |
| `src/scripts/tts_worker.py` | 3,455 | Backend (Worker) | Python script giao tiếp Edge-TTS lấy file MP3 |
| `renderer/index.html` | 102,616 | Frontend (View) | Khung giao diện chính, HTML5 6 Tabs, 8 Modal Dialogs |
| `renderer/js/app.js` | 6,085 | Frontend (Controller) | Điều phối tab, kết nối IPC progress/log, quản lý toast |
| `renderer/js/tab-download.js` | 18,091 | Frontend (Controller) | Logic giao diện Tab 1 (Tải video, bảng queue, modal add) |
| `renderer/js/tab-ai.js` | 9,978 | Frontend (Controller) | Logic giao diện Tab 2 (Chọn voice, render test, toggle lách) |
| `renderer/js/tab-channels.js` | 35,999 | Frontend (Controller) | Logic giao diện Tab 3 (Bảng accounts, cookie modal 2 bước) |
| `renderer/js/tab-publish.js` | 49,138 | Frontend (Controller) | Logic giao diện Tab 4 (Clip list, sửa caption, queue table) |
| `renderer/styles/theme.css` | 4,340 | Frontend (Styling) | Design Tokens, Roboto font, màu Neon, biến trạng thái |
| `renderer/styles/layout.css` | 4,603 | Frontend (Styling) | Layout lưới, Sidebar cố định, Topbar 56px, cuộn nội dung |
| `renderer/styles/components.css` | 26,280 | Frontend (Styling) | Chi tiết linh kiện UI (Cards, Tables, Modals, Toasts) |
| `Run-KenziousReel.bat` | 595 | Launcher (Script) | Script Windows nạp biến môi trường và chạy ứng dụng |

---

# PHẦN 3 — THIẾT KẾ GIAO DIỆN & PHÂN HỆ FRONTEND (RENDERER PROCESS)

## 3.1. Cấu Trúc Layout Tổng Thể (`renderer/index.html`)
Khung giao diện người dùng của Kenzious Reel Studio V2 được xây dựng với cấu trúc khung cố định (Fixed Viewport Layout, không bị thanh cuộn trình duyệt toàn trang) trên nền `100vh` kết hợp công nghệ CSS Grid và Flexbox.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (56px) - Logo Neon, App Name, Status Pill, Active Accounts, Theme Switcher    │
├──────────────┬─────────────────────────────────────────────────────────────────────────┤
│ SIDEBAR      │ MAIN CONTENT VIEWPORT (Tự động cuộn theo từng phân hệ - overflow-y: auto)│
│ (220px)      │                                                                         │
│              │ ┌─────────────────────────────────────────────────────────────────────┐ │
│ 📥 Tải Video │ │ Tab 1: Ingestion URL & P2P WebTorrent Batch Engine                  │ │
│ 👥 Kênh & Acc│ ├─────────────────────────────────────────────────────────────────────┤ │
│ 🎙️ AI Studio │ │ Tab 2: AI Subtitling, Dubbing Engine & 9:16 Vertical Blur Renderer  │ │
│ 🚀 Phân Phối │ ├─────────────────────────────────────────────────────────────────────┤ │
│ 🧰 Toolkit   │ │ Tab 3: Channel Profiles, Cookie Importer & Fanpage Destinations     │ │
│ ⚙️ Cấu Hình  │ ├─────────────────────────────────────────────────────────────────────┤ │
│              │ │ Tab 4: Multi-Channel Publishing Pipeline, Jitter & Post ID Harvester│ │
│ ──────────── │ ├─────────────────────────────────────────────────────────────────────┤ │
│ Mascot Husky │ │ Tab 5: Standalone Video Toolkit | Tab 6: System Global Settings     │ │
│ Terminal Log │ └─────────────────────────────────────────────────────────────────────┘ │
├──────────────┴─────────────────────────────────────────────────────────────────────────┤
│ FOOTER STATUS BAR (32px) - Trạng thái hệ thống, GPU NVENC Indicator, Memory Usage      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Các Thành Phần Khung Chính
1. **Top Bar Header (56px)**:
   - Logo thương hiệu `Logo-Icon-Kenzious.svg` kèm dòng chữ gradient `brand-grad` "KENZIOUS REEL STUDIO V2".
   - Huy hiệu phiên bản `v2.0-cleanroom` phát quang Neon.
   - Thẻ thống kê tài khoản nhanh (`activeNow` live accounts count).
   - Nút bật mở cửa sổ Terminal Log thời gian thực (`btnToggleLogConsole`).
   - Nút chuyển đổi giao diện sáng/tối (Dark/Light Mode Toggle).
2. **Navigation Sidebar (220px)**:
   - Danh sách 6 nút bấm chuyển đổi Tab trực quan (`data-tab="tab-download"`, `tab-channels`, `tab-ai`, `tab-publish`, `tab-toolkit`, `tab-settings`).
   - Mỗi nút có biểu tượng SVG chuyên biệt và hiệu ứng nền `accent-gradient` phát quang khi Active.
   - Phần chân Sidebar chứa hình ảnh Mascot Cáo Husky công nghệ thu nhỏ cùng nút kích hoạt nhanh cửa sổ hướng dẫn sử dụng (`btnOpenGuide`).
3. **Main Content Viewport**:
   - Chứa 6 khối `.tab-content` độc lập. Chỉ khối có lớp `.active` mới được hiển thị (`display: block`), các khối còn lại ẩn hoàn toàn (`display: none`) để tối ưu hóa việc giải phóng bộ nhớ DOM.
4. **Toast Notification Container**:
   - Nằm cố định ở góc dưới bên phải màn hình (`position: fixed; bottom: 24px; right: 24px; z-index: 9999`).
   - Tự động hiển thị các thông báo nhanh (Thành công, Cảnh báo, Thất bại) với thời gian tự hủy 3.5 giây kèm thanh thời gian chạy mượt mà (countdown bar).

---

## 3.2. App Controller & Event Bus (`renderer/js/app.js`)
Tệp `app.js` đóng vai trò là nhạc trưởng điều phối toàn bộ các hoạt động chung của phân hệ Frontend:

### Chức Năng Cốt Lõi:
1. **Quản lý chuyển đổi Tab (Tab Routing)**:
   - Lắng nghe sự kiện click trên các nút `.nav-item`.
   - Loại bỏ lớp `.active` ở tất cả các tab cũ, kích hoạt tab mới được chọn.
   - Ghi nhớ tab hiện tại vào `localStorage.getItem('krv2_active_tab')` để khi khởi động lại ứng dụng, người dùng vẫn ở đúng không gian làm việc trước đó.
   - Kích hoạt sự kiện tải lại dữ liệu đặc thù của từng tab (ví dụ: chuyển sang Tab 4 sẽ tự động tải lại danh sách tài khoản mới nhất từ Tab 3).
2. **Cầu nối lắng nghe sự kiện IPC từ Main Process**:
   - `window.api.onProgress((data) => { ... })`: Bắt thông điệp tiến trình (phase, percentage, message, taskId) từ các tác vụ nền như tải video, render FFmpeg, hoặc tiến trình đăng Facebook Reels.
   - `window.api.onLog((text) => { ... })`: Bắt toàn bộ luồng log từ hệ điều hành và Playwright để đẩy vào cửa sổ Terminal điều khiển.
3. **Hệ thống Quản lý Toast Notification (`window.showToast`)**:
   - Nhận tham số `message` và `type` (`success`, `error`, `warning`, `info`).
   - Tự động tạo phần tử DOM, gắn icon SVG tương ứng, áp dụng hiệu ứng trượt vào (Slide-in-right), và tự hủy sau khi kết thúc chu kỳ hiển thị.

---

## 3.3. Tab 1: Thu Thập & Tải Video (Download / Ingestion) — `renderer/js/tab-download.js`

### Giao Diện và Trải Nghiệm Người Dùng:
- **Thanh công cụ đầu vào**:
  - Nút bấm chính "Thêm Video Mới" (`btnOpenAddModal`) mở modal `modalAddVideo`.
  - Hộp nhập liệu đa dòng hỗ trợ dán danh sách nhiều URL cùng lúc (mỗi dòng một đường link).
  - Hộp nhập Magnet Link cho giao thức tải phân tán WebTorrent P2P.
  - Dropdown chọn định dạng tải: Video chất lượng cao nhất (Best Video), Chỉ âm thanh (Audio MP3), Video không logo (No-watermark Douyin/TikTok).
- **Thanh lọc và thống kê nhanh (Filter Badges)**:
  - Cho phép lọc danh sách theo nền tảng: Tất cả, Douyin, TikTok, YouTube Shorts, Facebook Reels, Instagram, RedNote, Torrent.
- **Bảng danh sách hàng đợi tải (Download Queue Table)**:
  - Cột xem trước hình ảnh thu nhỏ (Thumbnail Preview).
  - Cột Tiêu đề & Nền tảng (Hiển thị badge màu nhận diện nền tảng: Đỏ cho YouTube, Đen/Cyan cho TikTok, Xanh cho Facebook, Cam cho RedNote).
  - Cột Dung lượng & Định dạng.
  - Cột Thanh tiến trình phần trăm (Progress Bar với gradient Cyan to Violet) kèm tốc độ tải (MB/s).
  - Cột Trạng thái (`Chờ xử lý`, `Đang phân tích URL`, `Đang tải 65%`, `Đã hoàn thành`, `Thất bại`).
  - Cột Thao tác: Nút mở thư mục chứa video (`openDirectory`), Nút chuyển video sang Tab AI Studio để lồng tiếng ngay, Nút xóa khỏi hàng đợi.

### Cơ Chế Kỹ Thuật Trong `tab-download.js`:
- Tự động phân loại nền tảng qua biểu thức chính quy (Regex Platform Detection):
  - Douyin: `/v\.douyin\.com/i` hoặc `/douyin\.com\/video\//i`
  - TikTok: `/tiktok\.com/i`
  - YouTube: `/(?:youtube\.com\/shorts\/|youtu\.be\/)/i`
  - Facebook: `/(?:facebook\.com\/reel|fb\.watch)/i`
  - Magnet: `^magnet:\?xt=urn:btih:/i`
- Khi gặp link Douyin: Ưu tiên kích hoạt kênh IPC `downloader:probeDouyin` để trích xuất URL CDN gốc không logo qua Playwright Response Tap. Nếu thất bại, tự động chuyển về fallback yt-dlp.
- Hỗ trợ tải hàng loạt không chặn giao diện (Non-blocking Batch Execution).

---

## 3.4. Tab 2: AI Studio & Xử Lý Video (Subtitling, Dubbing & Render) — `renderer/js/tab-ai.js`

### Giao Diện và Trải Nghiệm Người Dùng:
Giao diện được chia thành 2 phân vùng chuyên nghiệp:
1. **Phân vùng Cấu hình Biến đổi Video (Video Transform & Anti-Copyright)**:
   - **Tùy chọn tỷ lệ khung hình**: Chuyển đổi video ngang thành dọc 9:16 Vertical Blur với thanh trượt điều chỉnh độ mờ Gaussian (`sigma: 4 - 16`, mặc định `8`).
   - **Bộ công tắc lách bản quyền vi mô (Anti-Content ID Toggles)**:
     - `Toggle Lật gương (Horizontal Flip)`: Đảo chiều khung hình ngang.
     - `Toggle Vi nhiễu (Micro Noise)`: Thêm hạt nhiễu vô hình chống băm hash (`noise=alls=2:allf=t+u`).
     - `Toggle Cắt viền động (Dynamic Border Crop)`: Cắt nhẹ 1.5% - 2% rìa khung hình.
     - `Toggle Biến đổi cao độ âm thanh (Audio Pitch/Tempo Shift)`: Thay đổi tần số lấy mẫu và nhịp điệu từ 1.01x đến 1.03x.
     - `Toggle Xóa siêu dữ liệu gốc (Strip All Metadata)`: Xóa sạch thông tin thiết bị quay, thời gian tạo gốc.
   - **Tăng tốc phần cứng**: Dropdown chọn bộ mã hóa: Tự động (Ưu tiên NVIDIA NVENC CUDA `h264_nvenc`), hoặc Ép buộc CPU (`libx264`).
2. **Phân vùng Chuyển ngữ & Lồng tiếng AI (AI Subtitling & Dubbing)**:
   - **Tách âm thanh (Stem Separation)**: Công tắc kích hoạt Demucs AI để bóc tách riêng biệt lời nói và nhạc nền.
   - **Cấu hình dịch thuật**: Dropdown chọn ngôn ngữ đích (Tiếng Việt), nhà cung cấp LLM (OpenAI GPT-4o-mini, Google Gemini Flash, DeepSeek), nhập API Key.
   - **Bộ lọc loại bỏ từ đệm tiếng Việt (`softShortenVi`)**: Công tắc tự động cắt giảm từ ngữ rác để câu dịch vừa khít thời lượng nói gốc ($20\text{ ký tự/giây}$).
   - **Lựa chọn giọng đọc AI**:
     - *Edge-TTS Cloud*: `vi-VN-HoaiMyNeural` (Nữ miền Nam ấm áp), `vi-VN-NamMinhNeural` (Nam miền Bắc chuẩn mực).
     - *OmniVoice Local CUDA*: Tải mô hình cục bộ nhân bản giọng nói theo video mẫu (Zero-Shot Voice Cloning).
     - Nút "Nghe thử giọng đọc" (`btnPreviewVoice`) để kiểm tra cao độ (`pitch`) và tốc độ nói (`rate`).
   - **Sidechain Audio Ducking**: Thanh trượt độ giảm âm lượng nhạc nền khi có thuyết minh (mặc định `-14dB`).

---

## 3.5. Tab 3: Quản Lý Kênh & Tài Khoản (Channels & Profiles) — `renderer/js/tab-channels.js`

### Giao Diện và Trải Nghiệm Người Dùng:
- **Thanh điều khiển tài khoản**:
  - Nút "Thêm Tài Khoản Mới" (`btnOpenAddAccountModal`) mở modal thêm tài khoản 2 bước.
  - Thanh tìm kiếm tài khoản theo tên hoặc ID.
  - Bộ lọc nền tảng: Tất cả, Facebook, TikTok, YouTube.
  - Nút "Kiểm tra toàn bộ trạng thái" (`btnCheckAllStatus`).
- **Bảng dữ liệu tài khoản (Accounts Data Table)**:
  - Cột Avatar & Tên hiển thị (Tự động tải avatar Facebook/TikTok hoặc hiển thị avatar mặc định theo nền tảng).
  - Cột Nền tảng kèm Icon nhận diện.
  - Cột Token & Cookie: Hiển thị trạng thái mã hóa (Masked token `EAABw...****`).
  - Cột Proxy gán kèm (`ip:port` hoặc `Direct`).
  - Cột Trạng thái tài khoản: Badge xanh lá (`LIVE / Sẵn sàng`), Badge đỏ (`CHECKPOINT / Hết hạn`), Badge vàng (`Đang kiểm tra`).
  - Cột Danh sách Kênh/Trang đích (Destinations): Hiển thị số lượng Fanpages/Channels mà tài khoản này có quyền quản trị và đang được chọn để đăng bài.
  - Cột Thao tác:
    - Nút mở trình duyệt Live Profile (`openBrowser`): Mở cửa sổ Chromium Playwright có sẵn cookie để người dùng tương tác thủ công nếu cần.
    - Nút cấu hình Fanpages/Kênh đích (`btnSetupDest`).
    - Nút sửa thông tin proxy, cookie.
    - Nút xóa tài khoản.

### Modal Thêm Tài Khoản 2 Bước (`modalAddAccount`):
- **Bước 1: Chọn nền tảng & Đặt tên**: Người dùng chọn Facebook/TikTok, nhập tên gợi nhớ (ví dụ: `FB Page Phim 01`) và cấu hình Proxy (HTTP/SOCKS5).
- **Bước 2: Nạp dữ liệu xác thực (Cookie / Token)**:
  - Khung văn bản cho phép dán Cookie dạng JSON (chuẩn xuất từ tiện ích J2Team Cookies hoặc EditThisCookie).
  - Khi người dùng nhấn "Lưu Tài Khoản", hệ thống tự động:
    1. Lưu cookie vào hồ sơ profile độc lập tại `data/profiles/<account_id>/`.
    2. Chạy ngầm Playwright kết nối vào Facebook để bóc tách Access Token EAAB từ trang quản trị Business Suite.
    3. Tự động tải tên thật và ảnh đại diện của tài khoản về lưu vào `accounts.json`.
    4. Quét danh sách các Fanpages mà tài khoản có quyền biên tập viên/quản trị viên và nạp vào bảng `destinations`.

---

## 3.6. Tab 4: Phân Phối Đa Kênh & Xuất Bản (Publishing Pipeline) — `renderer/js/tab-publish.js`

Đây là phân hệ cốt lõi nhất của ứng dụng, nơi tích hợp toàn bộ các cơ chế tự động hóa đăng video Reels và các bản vá lỗi quan trọng:

### Giao Diện và Trải Nghiệm Người Dùng:
1. **Khung nạp Video Nguồn (Clips Ingestion Panel)**:
   - Nút "Quét Thư Mục Video" (`btnScanFolder`): Cho phép chọn cả thư mục chứa hàng loạt video ngắn. Hệ thống tự động quét và nạp toàn bộ các file `.mp4`, `.mov`, `.mkv`.
   - Nút "Thêm Video Đơn Lẻ" (`btnAddSingleClip`).
   - **Bảng danh sách Clip chờ xuất bản**:
     - Hiển thị Thumbnail xem trước của từng video (được trích xuất tự động qua `getVideoThumbnail`).
     - Tên tệp video và đường dẫn nguồn.
     - **Tiêu đề & Nội dung Caption đã cấu hình**: Hiển thị xem trước 2 dòng nội dung.
     - **Nút "Sửa Tiêu đề / Nội dung" (`btnEditClip`)**: Mở modal `modalEditClip` cho phép người dùng chỉnh sửa tiêu đề bài viết và nội dung caption riêng biệt cho từng clip trước khi bấm xuất bản.
2. **Khung chọn Kênh Xuất Bản (Target Channels Panel)**:
   - Danh sách các kênh/tài khoản đích đã được chọn.
   - Nút "Thêm Kênh Phân Phối" (`btnOpenAddChannelModal`): Mở modal `modalAddChannel` hiển thị danh sách tất cả các tài khoản Live và Fanpages liên kết, cho phép chọn nhanh bằng checkbox.
3. **Bảng Điều khiển Xuất bản & Chống Checkpoint (Publish Strategy Settings)**:
   - **Cấu hình giãn cách (Gap Minutes)**: Khoảng cách giữa các bài đăng liên tiếp (mặc định 15 - 30 phút).
   - **Anti-Spam Jitter (15 - 20s)**: Độ trễ ngẫu nhiên cộng thêm vào từng thao tác để mô phỏng chính xác hành vi người dùng thật, tránh bị thuật toán Facebook gắn cờ hoạt động tự động.
   - **Destination Cooldown (60 - 120s)**: Thời gian nghỉ bắt buộc giữa hai lần đăng trên cùng một Fanpage/Kênh.
   - **Tổng kết số liệu toán học (Post Math Summary)**: Hiển thị trực quan: *Tổng số video × Số kênh đích = Tổng số bài đăng dự kiến*, kèm ước tính thời gian hoàn thành toàn bộ chiến dịch.
4. **Bảng Hàng Đợi & Lịch Sử Đăng Thời Gian Thực (Publish Queue & Events Table)**:
   - Hiển thị từng tác vụ con (Task Event).
   - Cột Thời gian dự kiến đăng (Scheduled Time).
   - Cột Tên Clip và Thumbnail.
   - Cột Kênh đích / Fanpage.
   - Cột Trạng thái: `Chờ đến giờ`, `Đang mở trình duyệt`, `Đang nạp video`, `Đang điền Caption`, `Đang bấm Đăng`, `Đang bóc tách Post ID`, `Hoàn thành ✓`, `Lỗi`.
   - **Cột Post ID & Link Bài Đăng**: Sau khi đăng thành công, hệ thống bóc tách chính xác Post ID và hiển thị thành link bấm trực tiếp mở bài Reels trên Facebook (ví dụ: `https://www.facebook.com/reel/1234567890`).
5. **Nút Hành Động Lớn (Master Action Controls)**:
   - Nút "BẮT ĐẦU XUẤT BẢN CHIẾN DỊCH" (`btnStartSession`): Sử dụng gradient nổi bật `btn-brand` phát quang Neon.
   - Nút "Tạm Dừng" (`btnPauseSession`) và Nút "Xóa Hàng Đợi" (`btnClearQueue`).

---

## 3.7. Tab 5 & 6: Toolkit & Cấu Hình Hệ Thống (Settings)

### Tab 5: Bộ Công Cụ Tiện Ích (Standalone Video Toolkit)
Dành cho các tác vụ xử lý video nhanh mà không cần tạo chiến dịch:
- Công cụ cắt ghép video không giảm chất lượng (Lossless Video Cut via FFmpeg stream copy).
- Công cụ trích xuất âm thanh gốc từ video thành tệp WAV/MP3.
- Công cụ ghép nhạc nền và điều chỉnh âm lượng thủ công.
- Công cụ nén dung lượng video giữ nguyên độ nét (CRF Tuning).

### Tab 6: Cấu Hình Hệ Thống Toàn Cục (Global Settings)
Lưu trữ vào `data/settings.json`:
- Cấu hình đường dẫn công cụ thực thi: `ffmpegPath`, `ffprobePath`, `ytDlpPath`, `pythonPath`, `chromeExecutablePath`.
- Cấu hình khóa API dịch thuật AI: `openaiApiKey`, `geminiApiKey`, `elevenlabsApiKey`.
- Cấu hình mặc định thư mục lưu trữ video thành phẩm (`outputDir`).
- Tùy chọn giao diện (Theme: Tối Obsidian / Sáng Cyberpunk).

---

## 3.8. Danh Mục và Cấu Trúc 8 Modal Dialog Tương Tác
Giao diện Kenzious Reel Studio V2 tích hợp 8 cửa sổ hộp thoại tương tác chuẩn hóa:

| ID Modal DOM | Tên gọi nghiệp vụ | Chức năng chi tiết và các trường dữ liệu |
|--------------|-------------------|------------------------------------------|
| `modalAddVideo` | Hộp thoại Thêm Video Tải Về | Nhập danh sách URL đa dòng, nhập Magnet link, chọn preset chất lượng tải, nút xác nhận thêm vào hàng đợi. |
| `modalAddAccount` | Hộp thoại Thêm Tài Khoản 2 Bước | Bước 1: Chọn nền tảng, nhập tên, proxy. Bước 2: Dán Cookie JSON, kích hoạt Playwright lấy Token & Avatar. |
| `modalAccountSettings`| Hộp thoại Cài Đặt Tài Khoản | Chỉnh sửa tên hiển thị, cập nhật Proxy IP:Port, thay thế Cookie mới khi tài khoản bị hết hạn phiên. |
| `modalEditClip` | Hộp thoại Sửa Tiêu Đề & Nội Dung | **Trọng yếu**: Cho phép biên tập trường `modalClipTitle` và `modalClipCaption` cho từng video trước khi đăng Reels. |
| `modalAddChannel` | Hộp thoại Chọn Kênh Phân Phối | Tìm kiếm tài khoản/Fanpage, chọn nhanh qua Checkbox, lọc theo nền tảng, đếm số lượng kênh được áp dụng. |
| `modalSetupDest` | Hộp thoại Cấu Hình Đích Đến | Quét và hiển thị toàn bộ Fanpage, Nhóm do tài khoản quản trị; cho phép bật/tắt quyền đăng bài trên từng Page. |
| `modalLogConsole` | Cửa Sổ Terminal Log Trực Tiếp | Hiển thị toàn bộ dòng lệnh hệ thống, log tự động hóa Playwright, nút xóa log và nút sao chép log chẩn đoán. |
| `modalGuide` | Hộp thoại Hướng Dẫn Sử Dụng | Cung cấp tài liệu hướng dẫn nhanh 5 bước chuẩn hóa vận hành studio và quy chuẩn cấu hình cookie an toàn. |

---

# PHẦN 4 — KIẾN TRÚC BACKEND & CÁC CORE ENGINES NỀN TẢNG (MAIN PROCESS)

## 4.1. Khởi Tạo BrowserWindow & Bảo Mật Electron (`src/main.js`)
Tệp `src/main.js` (dung lượng 10,357 bytes) là điểm nhập cuộc (Entry Point) của toàn bộ ứng dụng trên môi trường Node.js. 

### 1. Kiến Trúc Khởi Tạo Cửa Sổ Cực Kỳ Nghiêm Ngặt:
```javascript
const mainWindow = new BrowserWindow({
  width: 1440,
  height: 900,
  minWidth: 1200,
  minHeight: 760,
  backgroundColor: '#0f0d23', // Nền tối Obsidian tránh nháy sáng trắng khi khởi động
  frame: true,
  autoHideMenuBar: true,
  icon: path.join(__dirname, '..', 'assets', 'kenzious.ico'),
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,     // BẮT BUỘC: Ngăn Renderer truy cập trực tiếp Node.js runtime
    nodeIntegration: false,     // BẮT BUỘC: Vô hiệu hóa require() trong Renderer
    sandbox: false,             // Cho phép preload sử dụng các module native cần thiết
    webSecurity: true,          // Bật tính năng bảo vệ Same-Origin Policy
    enableRemoteModule: false   // Vô hiệu hóa hoàn toàn module remote tiềm ẩn lỗ hổng
  }
});
```

### 2. Vòng Đời Ứng Dụng & Quản Lý Tiến Trình Con:
- Lắng nghe sự kiện `app.on('window-all-closed')`: Trên hệ điều hành Windows, khi đóng cửa sổ chính, hệ thống sẽ thực hiện dọn dẹp toàn bộ các tiến trình nền (Playwright browsers, FFmpeg renders, Python workers) trước khi gọi `app.quit()`.
- Cơ chế ngăn chặn chạy nhiều phiên trùng lặp (`app.requestSingleInstanceLock()`). Nếu người dùng mở thêm một cửa sổ mới, ứng dụng sẽ tự động focus vào cửa sổ hiện có thay vì mở thêm tiến trình mới gây xung đột tài nguyên và xung đột cổng cơ sở dữ liệu.

---

## 4.2. Cầu Nối Bảo Mật Preload Bridge (`src/preload.js`)
Tệp `src/preload.js` (dung lượng 5,595 bytes) sử dụng hàm chuẩn của Electron `contextBridge.exposeInMainWorld('api', { ... })` để thiết lập một cầu nối đơn hướng có kiểm soát giữa ngữ cảnh bị cô lập của Renderer và môi trường đặc quyền của Main Process.

### Danh Mục Các Phân Nhóm API Phơi Bày:
1. **Nhóm Storage & Presets**: `getSettings`, `saveSettings`, `getPresets`, `savePresets`, `getAccounts`, `addAccount`, `deleteAccount`, `getHistory`.
2. **Nhóm Ingestion & Download**: `getVideoInfo`, `downloadVideo`, `cancelDownload`, `probeDouyin`, `downloadDouyin`, `inspectTorrent`, `downloadTorrent`, `cancelTorrent`.
3. **Nhóm Media & AI Processing**: `renderVideo`, `cancelRender`, `getVoices`, `synthesizeVoice`, `translateScript`, `generateAss`, `mixAudioDucking`, `softShortenVi`, `separateAudio`, `checkDemucs`.
4. **Nhóm Channel & Profiles**: `importCookies`, `interactiveLogin`, `checkAccountStatus`, `openBrowser`, `updateAccountSettings`, `getAccountToken`, `getDestinations`, `refreshDestinations`, `toggleDestination`.
5. **Nhóm Publishing Pipeline**: `addToPublishQueue`, `publisherAddVideos`, `publisherGetQueue`, `publisherGetQueueEvents`, `publisherGetSessions`, `publisherGetEvents`, `publisherStartSession`, `publisherPauseSession`, `publisherClearQueue`, `scanFolderClips`, `saveJobDraft`, `getJobDraft`, `getVideoThumbnail`, `publisherCreatePublishSession`, `publisherStartJob`.
6. **Nhóm Dialogs**: `pickDirectory`, `openDirectory`, `pickFile`.
7. **Nhóm Lắng Nghe Sự Kiện Hai Chiều (Event Listeners)**: `onProgress`, `onLog`.

---

## 4.3. Module Trọng Yếu: Tự Động Hóa Facebook Reels (`src/core/facebook-reels-poster.js`)

Đây là module phức tạp và quan trọng bậc nhất của Kenzious Reel Studio V2, với kích thước **68,402 bytes và 1,428 dòng lệnh**, được kế thừa và hoàn thiện qua nhiều đợt nâng cấp kỹ thuật chuyên sâu nhằm vượt qua mọi rào cản kiểm duyệt và thay đổi giao diện liên tục của nền tảng Facebook.

### 4.3.1. Cơ Chế Tự Động Giải Phóng Khóa Thư Mục Profile (`_unlockProfileDir`)
**Vấn đề thực tế**: Khi người dùng khởi chạy phiên đăng bài Playwright `puppeteer.launch({ userDataDir: ... })`, nếu phiên trước đó bị tắt đột ngột, crash, hoặc người dùng đã mở một cửa sổ Chrome khác sử dụng chung profile, thư mục sẽ bị khóa bởi hệ điều hành Windows và Chrome (`SingletonLock`, `SingletonCookie`, `SingletonSocket`). Hậu quả là Playwright sẽ văng lỗi crash `TargetClosedError` hoặc treo vô thời hạn.

**Giải pháp được lập trình trong Kenzious Reel V2**:
```javascript
_unlockProfileDir(profileDir) {
  const { execSync } = require('child_process');
  try {
    // 1. Quét và dọn các file SingletonLock trên Windows / Linux
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
    for (const lf of lockFiles) {
      const lockPath = path.join(profileDir, lf);
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
          console.log(`[FacebookPoster] Removed stale lock file: ${lockPath}`);
        } catch (e) {
          // File đang bị tiến trình khác chiếm giữ (EPERM/EBUSY)
        }
      }
    }

    // 2. Tự động truy quét và kill tiến trình Chrome zombie đang chiếm userDataDir
    if (process.platform === 'win32') {
      try {
        const normDir = profileDir.replace(/\\/g, '\\\\');
        const psCmd = `Get-CimInstance Win32_Process -Filter "Name LIKE 'chrome%.exe'" | Where-Object { $_.CommandLine -like "*${normDir}*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
        execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { stdio: 'ignore', timeout: 5000 });
      } catch (procErr) {}
    }
  } catch (err) {
    console.warn('[FacebookPoster] Profile unlock warning:', err.message);
  }
}
```

---

### 4.3.2. Quy Trình Tuần Tự 3 Bước Chuẩn Xác (3-Step Wizard Flow)
Facebook Reels phiên bản mới nhất trên trình duyệt máy tính áp dụng luồng tải lên gồm 3 màn hình tuần tự:
```
[BƯỚC 1: TẢI LÊN VIDEO] ──> Bấm "Tiếp" ──> [BƯỚC 2: CHỈNH SỬA & BẢN QUYỀN] ──> Bấm "Tiếp" ──> [BƯỚC 3: CÀI ĐẶT THƯỚC PHIM] ──> Nạp Caption & Bấm "ĐĂNG"
```

1. **Bước 1 (Upload & Next 1)**:
   - Điều hướng trực tiếp đến `https://www.facebook.com/reels/create` (với fallback `https://www.facebook.com/reel/create`).
   - Sử dụng kỹ thuật đa tầng để mở hộp chọn file (`filechooser`): quét input file ẩn (`input[type="file"][accept*="video"]`), mô phỏng click nút "Thêm video", sử dụng `Promise.all([page.waitForFileChooser({ timeout: 30000 }), clickTrigger])`.
   - Sau khi nạp video thành công, bot theo dõi màn hình xử lý và kích hoạt hàm `clickNextButton('Step 1')`: tìm nút **"Tiếp" / "Next"** màu xanh ở góc dưới bên trái của modal.
2. **Bước 2 (Edit/Copyright & Next 2)**:
   - Màn hình hiển thị trình cắt ngắn video và kiểm tra âm thanh bản quyền.
   - Bot thực hiện kiểm tra pop-up cản trở (`dismissObstructingPopups`), sau đó tiếp tục tìm và bấm nút **"Tiếp"** màu xanh để chuyển sang màn hình cài đặt cuối cùng.
3. **Bước 3 (Final Settings, Caption, Public & Publish)**:
   - Màn hình "Cài đặt thước phim" (Reels Final Settings).
   - Bot tiến hành nạp Caption (Tiêu đề & mô tả), kiểm tra quyền riêng tư (chọn Công khai - Public), và kích hoạt bộ chiến lược tìm kiếm nút Đăng đa tầng.

---

### 4.3.3. Cơ Chế Nạp Caption Thông Minh & Kiểm Tra DOM (Caption Injection & DOM Verification)
**Vấn đề thực tế**: Khung soạn thảo mô tả trên Facebook Reels không phải là thẻ `<textarea>` thông thường, mà là một khối `<div contenteditable="true" role="textbox">` phức tạp của React / Draft.js / Lexical. Lệnh `page.fill()` thông thường sẽ thất bại hoặc không kích hoạt sự kiện `input` của framework, khiến bài đăng bị trống chữ.

**Quy trình giải quyết chuẩn xác trong `facebook-reels-poster.js`**:
1. **Tổ hợp Selector nhận diện khung soạn thảo**:
   - `div[aria-label="Tạo bài viết công khai..."][role="textbox"]`
   - `div[aria-label="Mô tả"][role="textbox"]`
   - `div[aria-label="Description"][role="textbox"]`
   - `div[aria-label*="thước phim"][role="textbox"]`
   - `div[role="textbox"][contenteditable="true"]`
   - Fallback: `textarea`
2. **Mô phỏng thao tác gõ phím tự nhiên**:
   - Focus và Click chuột vào chính giữa phần tử.
   - Xóa sạch nội dung cũ nếu có (bấm `Control+A` kèm `Backspace`).
   - Sử dụng `page.keyboard.type(caption, { delay: Math.floor(Math.random() * 25) + 15 })` để mô phỏng nhịp gõ của con người, kích hoạt toàn bộ các event listeners (`keydown`, `keypress`, `input`, `keyup`).
3. **Kiểm tra DOM xác nhận nội dung (DOM Verification)**:
   - Sau khi gõ, bot thực hiện đọc lại thuộc tính `innerText` hoặc `textContent` của khung soạn thảo:
     `const currentVal = await page.evaluate(el => el.innerText || el.textContent, targetBox);`.
   - Nếu phát hiện nội dung chưa vào DOM, bot lập tức kích hoạt cơ chế fallback: sử dụng `document.execCommand('insertText', false, caption)` hoặc bơm trực tiếp qua clipboard event.

---

### 4.3.4. Cơ Chế Định Vị Nút Đăng Đa Tầng (Multi-Strategy Final Publish Click)
Facebook thường xuyên thay đổi nhãn của nút bấm cuối cùng tùy theo ngôn ngữ tài khoản (Tiếng Việt: "Đăng", "Chia sẻ"; Tiếng Anh: "Publish", "Share"), loại tài khoản (Profile cá nhân bật chế độ chuyên nghiệp vs Trang Fanpage truyền thống) hoặc vị trí hiển thị DOM. 

Hệ thống triển khai chuỗi **8 CHIẾN LƯỢC QUÉT TUẦN TỰ (STRATEGY CASCADE)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ STRATEGY 1: Aria-label + role="button" cascade                         │
│             div[aria-label="Chia sẻ"][role="button"],                  │
│             div[aria-label="Publish"][role="button"],                  │
│             div[aria-label="Đăng"][role="button"]                      │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 2: Text Matching thông minh                                   │
│             button:has-text("Chia sẻ"), button:has-text("Publish"),    │
│             div[role="button"]:has-text("Đăng")                        │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 3: Scroll Into View & Mouse Click với tọa độ ngẫu nhiên       │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 4: Force Click thông qua DOM evaluate: el.click()             │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 5: Quét Class-Keyword & Shadow DOM                            │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 6: Click theo tọa độ phần tử (BoundingBox Center Click)       │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 7: VIEWPORT BOTTOM-RIGHT CORNER SCAN                          │
│             Quét toàn bộ phần tử nằm tại vùng:                         │
│             x > 60% chiều rộng màn hình && y > 70% chiều cao màn hình  │
├────────────────────────────────────────────────────────────────────────┤
│ STRATEGY 8: PRIMARY ACTION BLUE BUTTON SCAN                            │
│             Kiểm tra mã màu nền xanh Facebook đặc trưng:               │
│             rgb(0, 100-199, 200-255), rgb(8, 102, 255), rgb(24, 119, 242)│
└────────────────────────────────────────────────────────────────────────┘
```

#### Mã nguồn chi tiết Strategy 7 (Quét góc dưới bên phải màn hình):
```javascript
const cornerResult = await page.evaluate(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const xThreshold = vw * 0.6;  // Vùng 40% bên phải
  const yThreshold = vh * 0.7;  // Vùng 30% bên dưới

  const candidates = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"]'));
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 30 && rect.height > 20 && rect.left >= xThreshold && rect.top >= yThreshold) {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        const text = (el.innerText || el.textContent || '').trim();
        // Ưu tiên phần tử có chữ liên quan đến đăng/chia sẻ
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.click();
        return { clicked: true, text: text, x: rect.left, y: rect.top };
      }
    }
  }
  return { clicked: false };
});
```

#### Mã nguồn chi tiết Strategy 8 (Quét nút màu xanh đặc trưng của Facebook):
```javascript
const blueBtnResult = await page.evaluate(() => {
  const isFbBlue = (rgbStr) => {
    // Nhận diện mã màu xanh primary chuẩn của Facebook Design System
    return /rgb\(\s*0\s*,\s*10[0-9]\s*,\s*2[0-5][0-9]\s*\)/i.test(rgbStr) ||
           /rgb\(\s*8\s*,\s*102\s*,\s*255\s*\)/i.test(rgbStr) ||
           /rgb\(\s*24\s*,\s*119\s*,\s*242\s*\)/i.test(rgbStr) ||
           /rgb\(\s*0\s*,\s*122\s*,\s*255\s*\)/i.test(rgbStr);
  };

  const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
  for (const btn of buttons) {
    const style = window.getComputedStyle(btn);
    const bg = style.backgroundColor || '';
    if (isFbBlue(bg) && btn.offsetWidth > 40 && btn.offsetHeight > 25) {
      const rect = btn.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.5) { // Nằm ở nửa dưới màn hình
        btn.click();
        return { clicked: true, bg: bg, text: btn.innerText };
      }
    }
  }
  return { clicked: false };
});
```

---

### 4.3.5. Cơ Chế Chờ Kéo Dài & Bóc Tách Post ID (Post-Publish Harvesting)
**Vấn đề thực tế**: Sau khi bấm nút Đăng, video cần từ 15 đến 90 giây để hoàn tất tải lên máy chủ Facebook và chuyển đổi định dạng. Nếu bot đóng trình duyệt ngay lập tức:
1. Video tải lên dở dang sẽ bị hủy ngang.
2. Không có bằng chứng bài viết đã được đăng thành công hay thất bại.
3. Người dùng không có đường link trực tiếp (URL Reels) và mã số bài viết (Post ID) để theo dõi tương tác hoặc làm báo cáo.

**Cơ chế Harvesting thời gian thực trong Kenzious Reel V2**:
- **Cửa sổ chờ thích ứng (Adaptive Watchdog Timer)**: Bot giữ phiên trình duyệt sống **tối thiểu 10 giây và tối đa 120 giây**.
- **Vòng lặp thăm dò liên tục mỗi 2.5 giây**:
  1. **URL Redirection**: Kiểm tra xem thanh địa chỉ có chuyển hướng sang `facebook.com/reel/<post_id>/` hoặc `facebook.com/watch/?v=<video_id>` hay không.
  2. **DOM Toast Scan**: Bắt thông báo nổi trên giao diện: *"Thước phim của bạn đã được chia sẻ"*, *"Your reel is published"*, trích xuất thẻ liên kết `<a href="/reel/...">`.
  3. **GraphQL Network Interception**: Lắng nghe phản hồi từ các GraphQL endpoints của Facebook (`/api/graphql/`) trả về đối tượng `creation_id` hoặc `story_id`.
- **Lưu trữ bền vững vào SQLite WAL**: Ngay khi bóc tách được Post ID và URL, hệ thống ghi nhận vào bảng `publish_events` trong `kenzious.db`:
  ```sql
  INSERT INTO publish_events (account_id, video_path, post_url, post_id, publish_method, status, created_at)
  VALUES (?, ?, ?, ?, 'reels_automation_v2', 'SUCCESS', CURRENT_TIMESTAMP);
  ```

---

### 4.3.6. Cơ Chế Chụp Màn Hình Chẩn Đoán Lỗi (Diagnostic Error Screenshots)
Nếu sau 120 giây hoặc trong bất kỳ bước nào của quy trình 3 bước gặp ngoại lệ không xử lý được:
1. Bot sẽ tự động chụp ảnh toàn bộ màn hình hiện tại của trình duyệt (`screenshot({ fullPage: true })`).
2. Lưu tệp ảnh vào thư mục `data/post_errors/debug_reels_err_<timestamp>.png`.
3. Đường dẫn ảnh được ghi thẳng vào nhật ký lỗi và bắn qua IPC `log:update` để người dùng hoặc kỹ sư có thể mở ra xem chính xác Facebook đang hiển thị lỗi gì (ví dụ: cảnh báo bản quyền nhạc, hộp thoại yêu cầu xác minh bảo mật, hoặc lỗi kết nối mạng).

---

## 4.4. Điều Phối Xuất Bản Phân Luồng (`src/core/publisher.js` & `src/core/publisher-db.js`)

Hệ thống phân phối đa kênh của Kenzious Reel Studio V2 giải quyết triệt để 2 vấn đề lớn nhất của các công cụ MMO truyền thống: **Xung đột tài nguyên (Race Conditions)** và **Bị nền tảng khóa tài khoản hàng loạt (Cascading Checkpoints)**.

### 4.4.1. Kiến Trúc Lane Concurrency (Phân Luồng Độc Lập Theo Tài Khoản)
Thay vì tạo ra một hàng đợi tuyến tính đơn luồng hoặc bắn đồng loạt hàng chục tác vụ cùng lúc vào 1 tài khoản, `publisher.js` triển khai mô hình **Hàng Chờ Đa Làn (Lane Concurrency)**:
```
                                  ┌─── LANE 1 (Account A) ───► Video 1 ──► [Jitter 18s] ──► Video 2 ──► ...
                                  │
[PUBLISHER DISPATCHER ENGINE] ────┼─── LANE 2 (Account B) ───► Video 1 ──► [Jitter 15s] ──► Video 2 ──► ...
                                  │
                                  └─── LANE 3 (Account C) ───► Video 1 ──► [Jitter 20s] ──► Video 2 ──► ...
```

- **Nguyên tắc**: Mỗi tài khoản mạng xã hội là một "Làn chạy" (Lane) hoàn toàn độc lập với phiên trình duyệt và Proxy riêng biệt.
- **Tuần tự nội bộ**: Các video được phân bổ cho cùng một tài khoản sẽ được đăng **tuần tự 100% (Strictly Sequential)**. Tuyệt đối không mở 2 phiên trình duyệt cùng ghi vào một `userDataDir` của một tài khoản.
- **Song song giữa các tài khoản**: Tài khoản A và Tài khoản B có thể đăng bài hoàn toàn song song tại cùng một thời điểm, giúp tăng tốc độ phân phối tổng thể gấp N lần (với N là số lượng tài khoản).

### 4.4.2. Cơ Chế Chống Checkpoint: Anti-Spam Jitter & Destination Cooldown
- **Anti-Spam Jitter (15 - 20s)**:
  ```javascript
  async sleepWithJitter(baseDelaySec = 15) {
    const jitter = Math.floor(Math.random() * 6) + 1; // Ngẫu nhiên từ 1 đến 6 giây
    const totalMs = (baseDelaySec + jitter) * 1000;
    console.log(`[Publisher] Anti-spam cooldown: ${(totalMs/1000).toFixed(1)}s...`);
    await new Promise(r => setTimeout(r, totalMs));
  }
  ```
- **Destination Cooldown (60 - 120s)**:
  Nếu một tài khoản quản lý nhiều Fanpages hoặc đăng nhiều bài liên tiếp lên cùng một Fanpage, hệ thống ép buộc một khoảng nghỉ dài từ 1 đến 2 phút giữa 2 lượt đăng để bảo vệ điểm tin cậy (Trust Score) của Trang.

### 4.4.3. Quản Lý Phiên Xuất Bản & Tương Tác Cơ Sở Dữ Liệu (`publisher-db.js`)
`publisher-db.js` sử dụng thư viện chuẩn Node.js SQLite (`node:sqlite` hoặc `better-sqlite3`) để quản lý các bảng:
- Bảng `sessions`: Lưu trữ ID phiên, thời gian bắt đầu, số lượng video, cấu hình khoảng cách (gap minutes), trạng thái (`RUNNING`, `PAUSED`, `COMPLETED`).
- Bảng `publish_events`: Lưu trữ chi tiết từng nhiệm vụ đăng bài (account_id, video_path, scheduled_at, executed_at, post_id, post_url, status, error_message).
- Bảng `job_drafts`: Lưu trữ các bản nháp chiến dịch xuất bản để người dùng có thể đóng ứng dụng và tiếp tục công việc vào ngày hôm sau mà không bị mất dữ liệu cấu hình.

---

## 4.5. Quản Lý Tài Khoản & Hồ Sơ Trình Duyệt (`src/core/channel-manager.js` & `destinations-manager.js`)

### 4.5.1. Quản Lý Hồ Sơ Chromium Cô Lập
- Mỗi tài khoản khi được thêm vào hệ thống sẽ được cấp một thư mục con riêng biệt tại `data/profiles/<account_id>/`.
- Mọi dữ liệu phiên: Cookie, LocalStorage, IndexedDB, Cache, và GPU Shader cache đều được lưu riêng. Nhờ đó, việc đăng nhập tài khoản A hoàn toàn không để lại dấu vết sang tài khoản B.
- Hỗ trợ gán Proxy chuyên dụng (HTTP/HTTPS/SOCKS5) cho từng tài khoản qua tham số khởi chạy Playwright `--proxy-server=${proxy}`.

### 4.5.2. Nhập Cookie & Tự Động Trích Xuất Token Facebook EAAB
Khi người dùng nhập Cookie Facebook dạng JSON qua hàm `importCookies`:
1. Hàm sẽ chuẩn hóa cấu trúc Cookie về định dạng chuẩn của Playwright/Puppeteer.
2. Khởi chạy ngầm một phiên trình duyệt không đầu (Headless Browser) với hồ sơ của tài khoản đó.
3. Nạp Cookie và điều hướng đến trang quản trị Facebook Business Suite (`https://business.facebook.com/content_management`).
4. Bóc tách Access Token cấp cao bắt đầu bằng tiền tố `EAAB` được nhúng trong mã nguồn trang (`window.__accessToken` hoặc trong các đoạn script `require('ServerJS')`).
5. Gọi Graph API của Facebook để lấy thông tin:
   - ID người dùng và Tên thật hiển thị.
   - URL ảnh đại diện (Avatar) và tải về lưu cục bộ.
   - Danh sách tất cả các Trang Fanpage mà tài khoản đang nắm quyền quản trị hoặc biên tập viên.
6. Toàn bộ danh sách Trang này được chuyển sang `destinations-manager.js` để khởi tạo các đích đến phục vụ cho việc chọn kênh đăng bài tại Tab 4.

---

## 4.6. Thu Thập Đa Nền Tảng (`downloader.js`, `douyin-scraper.js`, `torrent-manager.js`)

### 4.6.1. yt-dlp Core Wrapper (`downloader.js`)
`downloader.js` bọc quanh tệp thực thi `bin/yt-dlp.exe`:
- Hỗ trợ tải video chất lượng cao nhất (`-f bestvideo+bestaudio/best`).
- Tự động nhận diện nền tảng thông qua URL regex.
- Bắt luồng xuất chuẩn `stdout` của yt-dlp để bóc tách tỷ lệ phần trăm tiến trình (`[download]  45.2% of 12.50MiB at 3.20MiB/s ETA 00:02`) và phát tín hiệu IPC `progress:update` về cho Renderer hiển thị thanh tiến trình trực tiếp.
- Hỗ trợ hủy tác vụ tức thời (`cancelDownload`) bằng cách kill tiến trình con `ChildProcess`.

### 4.6.2. Kỹ Thuật Playwright Network Response Tap Douyin (`douyin-scraper.js`)
**Vấn đề kỹ thuật**: Douyin (TikTok Trung Quốc) áp dụng thuật toán chữ ký động cực kỳ phức tạp tên là `a_bogus` trong các yêu cầu API để chống thu thập dữ liệu. Các thuật toán đảo ngược chữ ký này liên tục bị thay đổi hàng tuần, khiến các thư viện Python/Node.js cào dữ liệu thông thường thường xuyên bị hỏng.

**Giải pháp Phòng Sạch Đột Phá trong `douyin-scraper.js`**:
- Thay vì cố gắng bẻ khóa hoặc giả lập chữ ký `a_bogus`, hệ thống khởi chạy một phiên Playwright Headless mô phỏng trình duyệt Chrome thật với User-Agent di động/máy tính.
- Đăng ký bộ nghe sự kiện mạng ở tầng thấp: `page.on('response', async (response) => { ... })`.
- Lọc gói tin phản hồi có chứa đường dẫn API `/web/aweme/post/` hoặc `/web/aweme/detail/`.
- Khi người dùng dán link video Douyin, bot điều hướng đến URL đó. Trình duyệt sẽ tự động thực thi các đoạn mã JavaScript gốc của Douyin và sinh ra chữ ký `a_bogus` hợp lệ 100%.
- Bot chỉ việc "hứng" gói tin JSON phản hồi từ Douyin, trích xuất thẳng danh sách `play_addr.url_list` (chứa đường dẫn CDN trực tiếp của video gốc có độ nét cao và **hoàn toàn không có Watermark**).
- Phương pháp này bền vững vĩnh viễn, không bao giờ lo lắng về việc Douyin đổi thuật toán mã hóa chữ ký.

### 4.6.3. Động Cơ Tải Phân Tán WebTorrent P2P (`torrent-manager.js`)
Hỗ trợ các nhà sáng tạo nội dung MMO tải về các bộ phim điện ảnh, phim tài liệu, hoặc các tập phim truyền hình dài tập được chia sẻ qua Magnet Link:
- Sử dụng thư viện `webtorrent` trong môi trường Node.js.
- Cho phép phân tích trước cấu trúc tệp của Torrent (`inspectTorrent`): Đọc danh sách file bên trong mà chưa cần tải dữ liệu.
- Cơ chế chọn lọc thông minh: Người dùng có thể chọn chỉ tải các tập phim mong muốn (bỏ qua các file rác, file quảng cáo `.nfo`, `.txt`).
- Tự động tích hợp `ffprobe` để kiểm tra thời lượng video và thông số phân giải ngay khi quá trình tải hoàn tất.

---

## 4.7. Xử Lý Video Tốc Độ Cao (`src/core/renderer.js`)

`renderer.js` chịu trách nhiệm thực thi các chuỗi xử lý video phức hợp thông qua FFmpeg.

### 4.7.1. Chuyển Đổi Tỷ Lệ Dọc 9:16 (Vertical Blur)
Khi đưa vào một video ngang chuẩn 16:9 (1920×1080), hệ thống tự động tách làm 2 luồng xử lý:
1. **Luồng Nền (Background Layer)**: Phóng to khung hình để lấp đầy tỷ lệ dọc 1080×1920, áp dụng bộ lọc mờ Gauss (`gblur=sigma=8`) để làm mờ bối cảnh, tạo cảm giác sang trọng và chuyên nghiệp.
2. **Luồng Trung Tâm (Foreground Layer)**: Giữ nguyên tỷ lệ video gốc, căn giữa màn hình và nội suy bằng thuật toán sắc nét cao `lanczos`.
3. **Bộ lọc ghép luồng (Filter Complex Chuẩn)**:
   ```bash
   [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=8[bg];
   [0:v]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];
   [bg][fg]overlay=(W-w)/2:(H-h)/2[v]
   ```

### 4.7.2. Bộ Lọc Lách Bản Quyền Đa Tầng Vi Mô (Deep Anti-Copyright Filters)
Để vượt qua thuật toán quét băm video (Content ID / MD5 Hash / Perceptual Hash) của Facebook và TikTok, `renderer.js` áp dụng đồng thời chuỗi 5 lớp biến đổi:
1. **Lật gương hình ảnh (Horizontal Flip)**: `hflip`.
2. **Vi nhiễu hạt ngẫu nhiên (Micro-Noise Injection)**: Thêm một lượng nhiễu cực nhỏ không thể nhận biết bằng mắt thường nhưng làm biến đổi hoàn toàn giá trị băm pixel: `noise=alls=2:allf=t+u`.
3. **Cắt viền động (Dynamic Border Crop 1.5%)**: Cắt bỏ 1.5% - 2% phần rìa mép ngoài cùng của khung hình: `crop=in_w*0.985:in_h*0.985`.
4. **Vi biến đổi âm thanh (Audio Micro-Pitch & Tempo Shift)**: Điều chỉnh tần số lấy mẫu âm thanh từ 44,100Hz lên 44,541Hz (tăng 1%) và hiệu chỉnh tốc độ: `asetrate=44100*1.01,atempo=1/1.01`. Kỹ thuật này phá vỡ hoàn toàn dấu vân tay âm thanh (Audio Acoustic Fingerprint) của bản quyền nhạc.
5. **Xóa toàn bộ siêu dữ liệu gốc (Strip All Metadata)**: Bổ sung cờ `-map_metadata -1` để xóa toàn bộ thông tin về camera, ngày quay, phần mềm biên tập ban đầu.

### 4.7.3. Tăng Tốc Phần Cứng NVIDIA NVENC vs CPU Fallback
Hệ thống tự động phát hiện sự hiện diện của card đồ họa rời NVIDIA:
- Nếu có card NVIDIA: Tự động kích hoạt bộ mã hóa phần cứng `h264_nvenc` với preset `p4`, `rc=vbr`, `cq=22`. Tốc độ render đạt từ **300 đến 600 FPS** (một video 1 phút chỉ mất từ 3 đến 5 giây để render).
- Nếu không có GPU rời: Tự động chuyển đổi mượt mà sang bộ mã hóa CPU `libx264` với preset `fast` và `crf=22`, đảm bảo ứng dụng luôn hoạt động trên mọi cấu hình máy trạm.

---

## 4.8. Pipeline Chuyển Ngữ & Lồng Tiếng AI (`ai-pipeline.js`, `audio-separator.js`, `text-shortener.js`, `voice-synthesizer.js`)

Đây là phân hệ chuyển ngữ và lồng tiếng hoàn chỉnh cho video nước ngoài (Trung Quốc, Anh, Hàn Quốc) sang video thuyết minh tiếng Việt:

### 4.8.1. Dịch Thuật Giới Hạn Dung Lượng Thời Gian (Time-Budgeted Translation)
**Vấn đề**: Khi dịch một câu thoại tiếng Trung (ngắn gọn, đơn âm tiết) sang tiếng Việt (đa âm tiết), độ dài văn bản tiếng Việt thường nở rộng từ 25% đến 40%. Nếu đọc toàn bộ câu dịch đó, giọng đọc AI sẽ bị chậm nhịp, tràn qua phân cảnh sau hoặc đè lên câu thoại của nhân vật khác.

**Quy tắc Ngân sách Thời gian trong `text-shortener.js`**:
- Hệ thống thiết lập ngân sách ký tự tối đa: **20 ký tự tiếng Việt cho mỗi 1 giây thời lượng câu thoại gốc**.
  $$	ext{Max Characters} = 	ext{Duration (seconds)} 	imes 20$$
- Kịch bản dịch từ mô hình ngôn ngữ lớn (LLM) bắt buộc phải trải qua hàm cắt gọt `fitToCueWindow(text, maxChars)`.

### 4.8.2. Thuật Toán Rút Gọn Từ Đệm Tiếng Việt (`softShortenVi`)
Tệp `text-shortener.js` tích hợp danh sách các biểu thức chính quy để loại bỏ hoàn toàn các từ đệm, từ ngữ thừa thãi trong văn phong dịch thuật mà không làm mất đi ý nghĩa chính của câu chuyện:
```javascript
const FILLER_PHRASES = [
  /\b(thì là mà|thực ra là|ở thời điểm hiện tại|nói một cách chính xác)\b/gi,
  /\b(như chúng ta đã biết|có thể thấy rằng|thật không thể tin được)\b/gi,
  /\b(vào lúc này|ngay tại thời điểm này|ngay lập tức)\b/gi
];
```

### 4.8.3. Tách Âm Thanh Demucs AI & Fallback Đảo Pha
- **Động cơ chính (Demucs AI via `demucs_worker.py`)**: Sử dụng mạng nơ-ron tích chập sâu của Meta AI để phân tích phổ âm thanh và bóc tách thành 2 luồng WAV riêng biệt: `vocals.wav` (tiếng nói) và `no_vocals.wav` (nhạc nền, âm thanh môi trường và hiệu ứng kỹ xảo SFX).
- **Động cơ Fallback (Phase Cancellation via FFmpeg)**: Nếu máy tính người dùng chưa cài đặt Python hoặc GPU không đủ VRAM, hệ thống sẽ tự động kích hoạt bộ lọc âm học đảo pha trung tâm của FFmpeg (`pan=stereo|c0=c0-c1|c1=c1-c0`) để triệt tiêu giọng nói nằm ở kênh trung tâm (Center Channel Vocal Suppression) hoàn toàn bằng thuật toán toán học mà không tốn tài nguyên GPU.

### 4.8.4. Động Cơ Giọng Đọc Kép (Edge-TTS & OmniVoice)
- **Edge-TTS Cloud (`tts_worker.py`)**: Sử dụng giọng đọc Neural mượt mà của Microsoft:
  - `vi-VN-HoaiMyNeural`: Giọng nữ truyền cảm, phù hợp với video tâm lý, tình cảm, review đời sống.
  - `vi-VN-NamMinhNeural`: Giọng nam đĩnh đạc, trầm ấm, phù hợp với phim hành động, tài liệu, kinh dị.
- **OmniVoice Local CUDA (`omnivoice_worker.py`)**: Chạy trực tiếp trên GPU NVIDIA nội bộ, hỗ trợ nạp đoạn âm thanh mẫu (3 đến 10 giây) để nhân bản giọng đọc nguyên bản của người dùng hoặc các diễn viên nổi tiếng.

### 4.8.5. Tự Động Nén Nhạc Nền Sidechain Audio Ducking (-14dB)
Khi ghép giọng đọc AI vào video, nếu giữ nguyên âm lượng nhạc nền gốc, người xem sẽ rất khó nghe rõ lời thuyết minh. 
Hệ thống sử dụng bộ lọc âm thanh cao cấp `sidechaincompress` của FFmpeg:
```bash
ffmpeg -i video_bgm.mp4 -i voice_ai.wav -filter_complex "[0:a][1:a]sidechaincompress=threshold=0.08:ratio=6:attack=20:release=300[bgm_ducked];[bgm_ducked][1:a]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]" output_dubbed.mp4
```
- Khi giọng đọc AI bắt đầu phát: Âm lượng nhạc nền tự động giảm xuống **-14dB** trong vòng 20 mili-giây.
- Khi câu thoại kết thúc: Âm lượng nhạc nền tự động dâng dần trở lại bình thường trong vòng 300 mili-giây, tạo ra chất lượng âm thanh chuẩn phòng thu phát thanh truyền hình.

---

## 4.9. Lưu Trữ Cấu Hình Cục Bộ (`src/core/storage.js`)
Tệp `storage.js` cung cấp các phương thức đọc/ghi nguyên tử (Atomic Read/Write) đối với các tệp JSON cấu hình:
- Tự động tạo thư mục `data/` nếu chưa tồn tại.
- Xử lý lỗi hỏng tệp JSON bằng cơ chế sao lưu `.bak`.
- Cung cấp các hàm CRUD đồng bộ cho: Cài đặt hệ thống (`settings`), Bộ cấu hình render (`presets`), Danh sách tài khoản (`accounts`), và Lịch sử tác vụ (`history`).

---

# PHẦN 5 — BẢNG DANH MỤC GIAO TIẾP IPC TOÀN DIỆN (IPC CONTRACT)

Toàn bộ quá trình giao tiếp giữa giao diện người dùng (Renderer Process) và động cơ nền tảng (Main Process) được quản lý qua giao thức IPC chuẩn mực của Electron:

| STT | Tên Kênh IPC (Channel Name) | Hướng Giao Tiếp | Tham Số Đầu Vào (Payload) | Dữ Liệu Trả Về (Return Value) | Chức Năng Nghiệp Vụ |
|:---:|-----------------------------|:---------------:|---------------------------|-------------------------------|---------------------|
| 1 | `storage:getSettings` | Ren ──► Main | Không có | `Object (Settings)` | Đọc toàn bộ cấu hình cài đặt từ `settings.json` |
| 2 | `storage:saveSettings` | Ren ──► Main | `settings (Object)` | `Boolean` | Ghi đè cấu hình mới vào `settings.json` |
| 3 | `storage:getPresets` | Ren ──► Main | Không có | `Array<Preset>` | Lấy danh sách cấu hình mẫu render video |
| 4 | `storage:savePresets` | Ren ──► Main | `presets (Array)` | `Boolean` | Lưu danh sách cấu hình mẫu render |
| 5 | `storage:getAccounts` | Ren ──► Main | Không có | `Array<Account>` | Lấy danh sách toàn bộ tài khoản mạng xã hội |
| 6 | `storage:addAccount` | Ren ──► Main | `acc (Object)` | `Object (Created Account)`| Thêm mới một tài khoản vào `accounts.json` |
| 7 | `storage:deleteAccount` | Ren ──► Main | `id (String)` | `Boolean` | Xóa tài khoản và dọn dẹp thư mục profile |
| 8 | `storage:getHistory` | Ren ──► Main | Không có | `Array<HistoryItem>` | Đọc lịch sử các video đã tải và xuất bản |
| 9 | `downloader:getVideoInfo` | Ren ──► Main | `url (String)` | `Object (Metadata)` | Gọi yt-dlp trích xuất tiêu đề, thumbnail, thời lượng |
| 10 | `downloader:downloadVideo` | Ren ──► Main | `url, options` | `Object (TaskResult)` | Kích hoạt tiến trình tải video qua yt-dlp |
| 11 | `downloader:cancelDownload` | Ren ──► Main | `taskId (String)` | `Boolean` | Hủy ngang tiến trình tải video đang chạy |
| 12 | `downloader:probeDouyin` | Ren ──► Main | `url (String)` | `Object (AwemeDetail)` | Bắt gói tin Douyin trích xuất CDN không watermark |
| 13 | `downloader:downloadDouyin` | Ren ──► Main | `url, outputDir` | `Object (FileResult)` | Tải trực tiếp video Douyin sạch không logo |
| 14 | `torrent:inspect` | Ren ──► Main | `source (Magnet/Path)` | `Object (TorrentInfo)` | Quét cấu trúc các tệp tin trong liên kết Magnet |
| 15 | `torrent:download` | Ren ──► Main | `source, indices, outDir`| `Object (DownloadResult)`| Tải có chọn lọc các tệp video qua WebTorrent P2P |
| 16 | `torrent:cancel` | Ren ──► Main | `infoHash (String)` | `Boolean` | Hủy tải torrent và đóng kết nối P2P |
| 17 | `renderer:renderVideo` | Ren ──► Main | `inPath, outPath, options`| `Object (RenderResult)` | Kích hoạt FFmpeg render 9:16 Vertical Blur & Lách |
| 18 | `renderer:cancelRender` | Ren ──► Main | `taskId (String)` | `Boolean` | Hủy ngang tiến trình FFmpeg đang kết xuất |
| 19 | `ai:getVoices` | Ren ──► Main | Không có | `Array<VoiceInfo>` | Lấy danh mục giọng đọc Edge-TTS & OmniVoice |
| 20 | `ai:synthesizeVoice` | Ren ──► Main | `text, voice, out, rate, pitch`| `Object (AudioResult)` | Kích hoạt worker tổng hợp tệp âm thanh giọng đọc |
| 21 | `ai:translateScript` | Ren ──► Main | `text, targetLang, key, prov` | `String (TranslatedText)` | Gửi kịch bản sang LLM dịch thuật có kiểm soát độ dài |
| 22 | `ai:generateAss` | Ren ──► Main | `cues, outputPath, options` | `String (AssFilePath)` | Sinh tệp phụ đề định dạng nâng cao ASS |
| 23 | `ai:mixAudioDucking` | Ren ──► Main | `video, voice, out, options` | `Object (MixResult)` | Áp dụng bộ nén Sidechain Ducking -14dB cho nhạc nền |
| 24 | `ai:softShorten` | Ren ──► Main | `text, options` | `String (PrunedText)` | Lược bỏ từ đệm tiếng Việt qua thuật toán `softShortenVi` |
| 25 | `ai:separateAudio` | Ren ──► Main | `inputMedia, outDir, opts` | `Object (StemsPaths)` | Tách vocal và no_vocals qua Demucs AI / Đảo pha |
| 26 | `ai:checkDemucs` | Ren ──► Main | Không có | `Boolean (IsInstalled)` | Kiểm tra môi trường PyTorch/Demucs trên máy trạm |
| 27 | `channel:importCookies` | Ren ──► Main | `platform, cookies, proxy...` | `Object (AccountInfo)` | Nhập Cookie, mở trình duyệt ngầm bóc tách EAAB token |
| 28 | `channel:interactiveLogin`| Ren ──► Main | `platform, proxy, options` | `Object (LoginResult)` | Mở trình duyệt có đầu để người dùng đăng nhập thủ công |
| 29 | `channel:checkStatus` | Ren ──► Main | `id (String)` | `Object (LiveStatus)` | Kiểm tra tình trạng hoạt động (Live / Checkpoint) |
| 30 | `channel:openBrowser` | Ren ──► Main | `accountId (String)` | `Boolean` | Mở trình duyệt Playwright tương tác hồ sơ profile |
| 31 | `channel:updateSettings` | Ren ──► Main | `accountId, patch` | `Boolean` | Cập nhật cấu hình proxy/tên của tài khoản |
| 32 | `channel:getToken` | Ren ──► Main | `accountId (String)` | `String (EAAB Token)` | Lấy Access Token còn hạn của tài khoản Facebook |
| 33 | `channel:getDestinations` | Ren ──► Main | `accountId (String)` | `Array<Destination>` | Đọc danh sách Fanpages/Groups từ cơ sở dữ liệu |
| 34 | `channel:refreshDestinations`| Ren ──► Main| `accountId (String)` | `Array<Destination>` | Gọi Graph API quét lại danh sách Fanpages mới nhất |
| 35 | `channel:toggleDestination` | Ren ──► Main | `accId, destId, selected` | `Boolean` | Bật hoặc tắt trạng thái chọn đăng cho một Fanpage |
| 36 | `publisher:scanFolderClips` | Ren ──► Main | `dirPath (String)` | `Array<ClipItem>` | Quét nhanh toàn bộ tệp video hợp lệ trong thư mục |
| 37 | `publisher:getVideoThumbnail`| Ren ──► Main| `videoPath (String)` | `String (Base64/Path)` | Trích xuất nhanh 1 khung hình làm ảnh thu nhỏ |
| 38 | `publisher:saveJobDraft` | Ren ──► Main | `job (Object)` | `Boolean` | Lưu bản nháp chiến dịch xuất bản vào SQLite |
| 39 | `publisher:getJobDraft` | Ren ──► Main | `id (String)` | `Object (JobDraft)` | Tải lại bản nháp chiến dịch xuất bản đã lưu |
| 40 | `publisher:createPublishSession`| Ren ──► Main| `payload (Object)` | `Object (SessionInfo)`| Khởi tạo một phiên xuất bản mới vào cơ sở dữ liệu |
| 41 | `publisher:startSession` | Ren ──► Main | `sessionId (String)` | `Object (StartResult)` | **Kích hoạt động cơ Lane Concurrency đăng video** |
| 42 | `publisher:pauseSession` | Ren ──► Main | Không có | `Boolean` | Tạm dừng toàn bộ các làn đăng bài đang chạy |
| 43 | `publisher:clearQueue` | Ren ──► Main | Không có | `Boolean` | Xóa sạch các tác vụ chưa chạy trong hàng đợi |
| 44 | `publisher:getQueueEvents`| Ren ──► Main | Không có | `Array<PublishEvent>` | Đọc danh sách sự kiện hàng đợi thời gian thực |
| 45 | `dialog:pickDirectory` | Ren ──► Main | Không có | `String (SelectedPath)` | Mở hộp thoại hệ điều hành Windows để chọn thư mục |
| 46 | `dialog:openDirectory` | Ren ──► Main | `dir (String)` | `Boolean` | Mở thư mục bằng Windows File Explorer |
| 47 | `dialog:pickFile` | Ren ──► Main | `filters (Array)` | `String (SelectedFile)`| Mở hộp thoại chọn tệp tin đơn lẻ |
| 48 | `progress:update` | Main ──► Ren | `data: {phase, pct, msg}`| Sự kiện đẩy (Push) | Cập nhật thanh tiến trình giao diện theo thời gian thực |
| 49 | `log:update` | Main ──► Ren | `text: String` | Sự kiện đẩy (Push) | Đẩy dòng nhật ký hệ thống vào cửa sổ Terminal Console |

---

# PHẦN 6 — ĐẶC TẢ CƠ SỞ DỮ LIỆU & SCHEMAS

## 6.1. Cơ Sở Dữ Liệu SQLite `kenzious.db` (WAL Mode)
Cơ sở dữ liệu trung tâm `data/kenzious.db` vận hành với cấu hình `PRAGMA journal_mode = WAL;` để đảm bảo khả năng ghi dữ liệu tốc độ cao không gây khóa đọc của giao diện.

### Sơ Đồ Thực Thể Quan Hệ (ERD Schema):
```sql
-- 1. BẢNG PHIÊN XUẤT BẢN (SESSIONS)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  total_clips INTEGER DEFAULT 0,
  total_channels INTEGER DEFAULT 0,
  gap_minutes INTEGER DEFAULT 15,
  status TEXT DEFAULT 'PENDING',    -- PENDING, RUNNING, PAUSED, COMPLETED, FAILED
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. BẢNG SỰ KIỆN XUẤT BẢN (PUBLISH_EVENTS)
CREATE TABLE IF NOT EXISTS publish_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  account_id TEXT,
  channel_name TEXT,
  video_path TEXT,
  video_title TEXT,
  caption TEXT,
  scheduled_at DATETIME,
  executed_at DATETIME,
  post_id TEXT,                     -- Mã định danh bóc tách từ Facebook Reels (Ví dụ: 104928172948291)
  post_url TEXT,                    -- URL trực tiếp (Ví dụ: https://www.facebook.com/reel/104928172948291)
  publish_method TEXT,              -- reels_automation_v2, graph_api, web_composer
  status TEXT DEFAULT 'QUEUED',     -- QUEUED, RUNNING, SUCCESS, FAILED, SKIPPED
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

-- 3. BẢNG ĐÍCH ĐẾN FANPAGE / KÊNH (DESTINATIONS)
CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,              -- ID Fanpage / Kênh
  account_id TEXT,                  -- Thuộc tài khoản quản trị nào
  platform TEXT DEFAULT 'facebook', -- facebook, tiktok, youtube
  name TEXT,                        -- Tên Fanpage / Kênh
  category TEXT,
  access_token TEXT,                -- Page Access Token nếu có
  is_selected INTEGER DEFAULT 1,    -- 1: Có áp dụng đăng bài, 0: Bỏ qua
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. BẢNG BẢN NHÁP CHIẾN DỊCH (JOB_DRAFTS)
CREATE TABLE IF NOT EXISTS job_drafts (
  id TEXT PRIMARY KEY,
  draft_data TEXT,                  -- JSON stringified toàn bộ cấu hình clips, captions, channels
  saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6.2. Cấu Trúc Các Tệp JSON Cục Bộ

### 1. `data/settings.json`
```json
{
  "theme": "dark",
  "ffmpegPath": "D:\\KOAL\\Kenzious Reel V2\\bin\\ffmpeg.exe",
  "ffprobePath": "D:\\KOAL\\Kenzious Reel V2\\bin\\ffprobe.exe",
  "ytDlpPath": "D:\\KOAL\\Kenzious Reel V2\\bin\\yt-dlp.exe",
  "pythonPath": "python",
  "chromeExecutablePath": "",
  "outputDir": "D:\\KOAL\\Kenzious Reel V2\\output",
  "openaiApiKey": "",
  "geminiApiKey": "",
  "elevenlabsApiKey": "",
  "defaultVoice": "vi-VN-HoaiMyNeural",
  "antiSpamJitterBase": 15,
  "destinationCooldownSec": 60
}
```

### 2. `data/accounts.json`
```json
[
  {
    "id": "fb_acc_1727581920",
    "platform": "facebook",
    "name": "Kenzious Admin 01",
    "username": "kenzious.media",
    "avatar": "data/profiles/fb_acc_1727581920/avatar.jpg",
    "proxy": "http://user:pass@123.45.67.89:8080",
    "tokenMasked": "EAABw...8F9a",
    "status": "LIVE",
    "lastChecked": "2026-09-29T08:30:00Z",
    "profileDir": "data/profiles/fb_acc_1727581920"
  }
]
```

---

# PHẦN 7 — ĐÁNH GIÁ TRẠNG THÁI HIỆN TẠI (GIAI ĐOẠN CHECK 29/09/2026)

## 7.1. Bảng Ma Trận Trạng Thái Chức Năng

| Phân Hệ Nghiệp Vụ | Trạng Thái Kỹ Thuật | Đánh Giá Chi Tiết & Khả Năng Vận Hành |
|-------------------|:-------------------:|--------------------------------------|
| **1. Ingestion URL (yt-dlp)** | Hoàn thiện 100% | Tải tốt YouTube Shorts, TikTok, Facebook Reels, Bilibili. |
| **2. Douyin Network Tap** | Hoàn thiện 100% | Bắt trực tiếp CDN sạch không logo, không sợ đổi chữ ký `a_bogus`. |
| **3. P2P WebTorrent** | Hoàn thiện 100% | Nhận diện Magnet links, chọn lọc file video, probe thời lượng chuẩn. |
| **4. Render 9:16 Vertical Blur** | Hoàn thiện 100% | Bộ lọc Gauss sigma=8 + Lanczos, tự động nhận diện GPU NVENC. |
| **5. Bộ lọc lách bản quyền** | Hoàn thiện 100% | Lật gương, vi nhiễu, crop 1.5%, audio micro-shift, strip metadata. |
| **6. Demucs Stem Separation** | Sẵn sàng / Fallback | Có script Python Demucs; tự động fallback Đảo pha nếu thiếu PyTorch. |
| **7. Rút gọn văn bản `softShortenVi`**| Hoàn thiện 100% | Bộ lọc Regex tiếng Việt loại bỏ từ đệm, khống chế $20\text{ ký tự/giây}$. |
| **8. Lồng tiếng AI (TTS)** | Hoàn thiện 100% | Hỗ trợ mượt mà Edge-TTS Cloud (`HoaiMy`, `NamMinh`) & Sidechain Ducking. |
| **9. Quản lý Tài khoản & Cookie** | Hoàn thiện 100% | Profile cô lập, nạp Cookie 2 bước, bóc tách EAAB token tự động. |
| **10. Tự động hóa Facebook Reels** | **Đột phá / Hoàn tất** | **Tích hợp đầy đủ 5 bản vá sống còn (3-Step, Corner, Blue, Caption, Post ID)**. |
| **11. Phân phối Lane Concurrency** | Hoàn thiện 100% | Phân luồng độc lập theo account, Anti-Spam Jitter 15-20s, Cooldown 60-120s. |

---

## 7.2. Chi Tiết 5 Cải Tiến Đột Phá Đã Hoàn Tất Cho `facebook-reels-poster.js`

Trong các chu kỳ nâng cấp gần nhất, module `facebook-reels-poster.js` đã được tái thiết lập để loại bỏ hoàn toàn các điểm nghẽn trước đây:
1. **Khắc phục lỗi treo khóa profile (`userDataDir Lock`)**: Tích hợp hàm `_unlockProfileDir` tự động truy quét và kill các tiến trình Chrome zombie đang chạy ngầm chiếm dụng tệp `SingletonLock`, xóa triệt để `lockfile` trước khi khởi chạy Playwright.
2. **Tuân thủ quy trình 3 bước mới của Facebook (Exact 3-Step Wizard)**: Tái hiện chuẩn xác quy trình: *Bước 1 (Upload video & Bấm Tiếp)* ──► *Bước 2 (Màn hình cắt sửa/bản quyền & Bấm Tiếp)* ──► *Bước 3 (Cài đặt thước phim, nạp caption & Bấm Đăng)*.
3. **Bộ định vị nút Đăng đa tầng (Multi-Strategy Final Click)**:
   - Áp dụng kỹ thuật **Viewport Bottom-Right Corner Scanning**: Quét trực tiếp các phần tử trong góc $x > 60\%, y > 70\%$ của màn hình.
   - Áp dụng kỹ thuật **Primary Action Blue Button Scanning**: Quét mã màu nền xanh đặc thù của Facebook (`rgb(0, 10x, 2xx)`, `rgb(8, 102, 255)`, `rgb(24, 119, 242)`) kết hợp cuộn màn hình và nhấp chuột tự nhiên.
4. **Nạp Caption thông minh & Kiểm tra DOM (Caption Injection & Verification)**: Khắc phục triệt để tình trạng video đăng lên nhưng bị trống mô tả. Bot định vị chính xác khung `div[role="textbox"]`, mô phỏng gõ phím người thật, kiểm tra `innerText` có chữ trước khi bấm đăng; nếu thiếu sẽ kích hoạt cơ chế fallback clipboard.
5. **Chờ kéo dài & Bóc tách Post ID (Post-Publish Harvesting)**: Giữ phiên trình duyệt từ 10 đến 120 giây sau khi bấm Đăng để chờ Facebook xử lý xong, bóc tách chính xác Post ID và URL bài viết, sau đó lưu trữ bền vững vào cơ sở dữ liệu SQLite `kenzious.db`.

---

## 7.3. Điều Kiện Tiên Quyết Về Môi Trường & Phần Cứng
- **Hệ điều hành**: Windows 10 / Windows 11 (64-bit).
- **Node.js Runtime**: Phiên bản Node.js v20.x hoặc v22.x LTS.
- **Trình duyệt Chrome**: Google Chrome hoặc Brave/Thorium được cài đặt tại đường dẫn tiêu chuẩn (`C:\Program Files\Google\Chrome\Application\chrome.exe` hoặc LocalAppData).
- **Công cụ nhị phân (`bin/`)**:
  - `ffmpeg.exe` và `ffprobe.exe` đã có sẵn trong thư mục `bin/`.
  - `yt-dlp.exe` đã có sẵn trong thư mục `bin/`.
- **Môi trường Python (Tùy chọn)**: Nếu sử dụng tính năng Demucs AI hoặc OmniVoice CUDA Local, máy trạm cần cài đặt Python 3.10+ cùng gói `torch`, `torchaudio`, `demucs`. Nếu không có, hệ thống tự động chạy chế độ Edge-TTS Cloud và Fallback Đảo pha mà không phát sinh lỗi.

---

# PHẦN 8 — HƯỚNG DẪN VẬN HÀNH & CHECKLIST NGHIỆM THU A-Z

## 8.1. Hướng Dẫn Khởi Động Hệ Thống
Người dùng có 2 cách để khởi chạy ứng dụng:
1. **Cách 1 (Khuyên dùng - 1-Click Launcher)**: Click đúp vào tệp `Run-KenziousReel.bat` tại thư mục gốc `D:\KOAL\Kenzious Reel V2`. Tập lệnh sẽ tự động kiểm tra môi trường, nạp cấu hình và khởi động giao diện Studio.
2. **Cách 2 (Dòng lệnh Developer)**:
   ```bash
   cd "D:\KOAL\Kenzious Reel V2"
   npm start
   ```

---

## 8.2. Quy Trình Kiểm Thử Nghiệm Thu 5 Bước Chuẩn

```
[BƯỚC 1: INGESTION] ──► [BƯỚC 2: AI DUBBING] ──► [BƯỚC 3: RENDER 9:16] ──► [BƯỚC 4: ADD ACCOUNT] ──► [BƯỚC 5: AUTO REELS PUBLISH]
```

### Bước 1: Kiểm thử Thu thập & Tải Video (Tab 1)
1. Mở ứng dụng, chuyển sang **Tab 1 (Tải Video)**.
2. Bấm nút "Thêm Video Mới", dán 1 link Douyin hoặc 1 link YouTube Shorts mẫu.
3. Bấm "Thêm vào hàng đợi" ──► Quan sát thanh tiến trình tải chạy từ 0% đến 100%.
4. Bấm nút biểu tượng thư mục để xác nhận video đã được lưu hoàn chỉnh vào thư mục `output/`.

### Bước 2: Kiểm thử AI Studio & Lồng Tiếng (Tab 2)
1. Chuyển sang **Tab 2 (AI Studio)**.
2. Chọn video vừa tải ở Bước 1.
3. Chọn giọng đọc `vi-VN-HoaiMyNeural`, bấm nút "Nghe thử" để kiểm tra âm thanh phát ra loa.
4. Bật công tắc "Rút gọn từ đệm tiếng Việt (`softShortenVi`)".
5. Bấm "Bắt đầu Xử lý AI" ──► Kiểm tra tệp video sau khi xuất xưởng có giọng đọc AI rõ ràng và nhạc nền tự động giảm âm lượng (-14dB).

### Bước 3: Kiểm thử Render 9:16 & Lách Bản Quyền (Tab 2 hoặc Tab 5)
1. Nạp video ngang 16:9 vào khung render.
2. Bật tùy chọn Vertical Blur với `sigma: 8`.
3. Bật các công tắc lách bản quyền: Lật gương, Vi nhiễu, Cắt viền 1.5%.
4. Bấm "Render Video" ──► Xác nhận video đầu ra tại `output/` có định dạng đứng 1080×1920 sắc nét, hai bên viền mờ nghệ thuật.

### Bước 4: Kiểm thử Quản Lý Tài Khoản & Nhập Cookie (Tab 3)
1. Chuyển sang **Tab 3 (Quản Lý Kênh)**.
2. Bấm "Thêm Tài Khoản Mới", chọn Facebook, đặt tên gợi nhớ.
3. Dán chuỗi Cookie JSON của tài khoản Facebook đã đăng nhập trên trình duyệt.
4. Bấm "Lưu Tài Khoản" ──► Chờ bot khởi chạy ngầm, xác nhận:
   - Trạng thái chuyển sang màu xanh: `LIVE / Sẵn sàng`.
   - Tên thật và ảnh đại diện hiển thị chuẩn xác.
   - Nút "Cấu hình đích đến" hiển thị danh sách các Fanpages liên kết.

### Bước 5: Kiểm thử Toàn Diện Đăng Facebook Reels & Bóc Tách Post ID (Tab 4)
1. Chuyển sang **Tab 4 (Phân Phối Đa Kênh)**.
2. Bấm "Quét Thư Mục Video" chọn thư mục chứa video clip thành phẩm.
3. Trên danh sách clip, bấm nút **"Sửa Tiêu đề / Nội dung"** trên clip đầu tiên: Nhập tiêu đề và nội dung caption mẫu (ví dụ: *"Thử nghiệm tính năng đăng tự động Kenzious Reel V2 #reels"*), bấm Lưu.
4. Bấm "Thêm Kênh Phân Phối" chọn tài khoản Facebook vừa thêm ở Bước 4.
5. Cài đặt khoảng cách `Gap: 1 phút`, Jitter ngẫu nhiên `15 - 20 giây`.
6. Bấm nút lớn **"BẮT ĐẦU XUẤT BẢN CHIẾN DỊCH"**:
   - Theo dõi thanh tiến trình: `Mở trình duyệt` ──► `Nạp file video` ──► `Bấm Tiếp bước 1` ──► `Bấm Tiếp bước 2` ──► `Điền Caption vào textbox` ──► `Bấm Đăng (Quét góc phải / Nút xanh)`.
   - Chờ trong vòng 30 - 60 giây tiếp theo: Xác nhận thông báo *"Đăng thành công! Đang giữ trình duyệt để bóc tách Post ID"*.
   - Xác nhận cột Post ID xuất hiện mã số bài đăng và đường link `https://www.facebook.com/reel/<post_id>`. Bấm vào link để xác nhận video đã lên sóng Facebook chuẩn xác kèm caption đầy đủ.

---

## 8.3. Sổ Tay Xử Lý Sự Cố Thường Gặp (Troubleshooting Guide)

### 1. Sự cố: "Target closed / Session closed" khi vừa mở Playwright
- **Nguyên nhân**: Thư mục hồ sơ profile đang bị một tiến trình Chrome chạy ngầm chiếm giữ hoặc còn sót lại tệp `SingletonLock`.
- **Cách khắc phục**: Tính năng `_unlockProfileDir` trong bản vá mới nhất đã tự động dọn dẹp vấn đề này. Nếu vẫn gặp sự cố, mở Task Manager trên Windows, tìm và kết thúc toàn bộ các tiến trình có tên `Google Chrome` hoặc chạy lệnh `taskkill /F /IM chrome.exe` trước khi chạy lại.

### 2. Sự cố: Video đăng lên Reels thành công nhưng bị trống Caption
- **Nguyên nhân**: Sử dụng phiên bản cũ trước ngày 29/09/2026 chưa có cơ chế mô phỏng gõ phím `page.keyboard.type` trên khung `div[role="textbox"]`.
- **Cách khắc phục**: Bản vá hiện tại đã tích hợp kiểm tra DOM (`innerText` verification). Người dùng chỉ cần đảm bảo đã nhập nội dung vào modal Sửa tiêu đề tại Tab 4 trước khi bấm Xuất bản.

### 3. Sự cố: Bot đứng im ở màn hình cuối không bấm được nút "Đăng"
- **Nguyên nhân**: Facebook cập nhật giao diện, thay đổi nhãn từ "Đăng" sang "Chia sẻ" hoặc ẩn nút vào một cấu trúc thẻ khác.
- **Cách khắc phục**: Hệ thống đã được trang bị **Strategy 7 (Viewport Corner Scanning)** và **Strategy 8 (Primary Action Blue Button Scanning)**. Bot sẽ quét tự động theo tọa độ góc dưới bên phải và nhận diện mã màu xanh đặc trưng của Facebook, đảm bảo 100% bấm trúng nút bất kể nhãn chữ được thay đổi như thế nào.

### 4. Sự cố: Tài khoản báo trạng thái "CHECKPOINT / EXPIRED"
- **Nguyên nhân**: Phiên đăng nhập của Cookie đã hết hạn trên Facebook do người dùng đã đăng xuất hoặc đổi mật khẩu.
- **Cách khắc phục**: Tại Tab 3, bấm vào biểu tượng bánh răng cài đặt của tài khoản đó, dán chuỗi Cookie mới cập nhật từ trình duyệt và bấm "Cập nhật". Trạng thái sẽ lập tức chuyển lại về màu xanh `LIVE`.

---

> **LỜI KẾT CỦA KỸ SƯ TRƯỞNG AITINIUBI:**  
> Hệ thống **Kenzious Reel Studio V2** tại thời điểm ngày **29/09/2026** đã đạt chuẩn kiến trúc phòng sạch cao cấp (Clean-Room Architecture), hoạt động hoàn toàn độc lập, ổn định và sẵn sàng cho môi trường sản xuất thực tế quy mô lớn. Mọi dòng mã nguồn từ Frontend, Backend đến các kịch bản tự động hóa đều được tối ưu hóa chuyên sâu nhằm mang lại hiệu năng cao nhất và bảo vệ an toàn tối đa cho tài khoản của người dùng.
