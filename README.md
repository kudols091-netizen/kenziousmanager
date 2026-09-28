# 🎬 Kenzious Reel Studio v2 — All-In-One AI Video Studio & Clean-room Desktop Suite

Ứng dụng Desktop chuyên nghiệp độc lập (Clean-Room Architecture) hỗ trợ tải, xử lý video ngắn 9:16 vertical blur, lách bản quyền, chuyển ngữ & lồng tiếng AI tiếng Việt chất lượng cao (Edge-TTS & OmniVoice CUDA), và phân phối tự động đa kênh với cơ chế chống checkpoint.

---

## 🌟 Nhận Diện Thương Hiệu & Giao Diện (Kenzious Brand System)

- **Bộ biểu tượng & Logo**: Trích xuất đồng bộ từ `D:\KOAL\Kenzious Logo`
  - Logo chính: [Logo-Icon-Kenzious.png](assets/Logo-Icon-Kenzious.png) & [Logo-Icon-Kenzious.svg](assets/Logo-Icon-Kenzious.svg)
  - Mascot: Cáo Husky trí tuệ đeo kính công nghệ [Mascot-Kenzious.png](assets/Mascot-Kenzious.png)
  - Favicon & App Icon: [Kenzi-Favicon.png](assets/Kenzi-Favicon.png) & [kenzious.ico](assets/kenzious.ico)
  - Nền không gian: [Background-Kenzious.png](assets/Background-Kenzious.png)
- **Hệ màu chủ đạo (Kenzious Palette)**:
  - Nền không gian tối (Obsidian & Space Navy): `--bg-primary: #0f0d23`, `--bg-secondary: #16132e`, `--bg-tertiary: #241c3d`
  - Viền & Chia cách: `--border-color: rgba(166, 126, 255, 0.24)`
  - Điểm nhấn thương hiệu: Neon Magenta `--primary-accent: #ff239d` / `#e324dd`
  - Gradient thương hiệu Logo: `linear-gradient(90deg, #19c8ff, #8c4fff 55%, #ff239d)` (Electric Cyan `#19c8ff` → Cyber Violet `#8c4fff` → Neon Magenta `#ff239d`)
  - Nút chính & Tab Active: `linear-gradient(100deg, #ff239d, #9b3dff)` kèm hiệu ứng phát quang Neon Glow
- **Typography**: [Google Fonts Roboto](https://fonts.google.com/specimen/Roboto)
  - Khai báo chuẩn: `'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  - Trọng số nạp: `300 (Light)`, `400 (Regular)`, `500 (Medium)`, `700 (Bold)`, `800/900 (Black)`
  - Cỡ chữ nền `13px`, nhãn `600`, tiêu đề & nút bấm chính `800`, `letter-spacing: .02em`

---

## 🚀 Kiến Trúc 4 Phân Hệ Clean-Room

### 1. Phân hệ Thu Thập & P2P Ingestion (Downloader & Torrent)
- **Playwright Network Response Tap**: Bắt trực tiếp endpoint `/web/aweme/post/` của Douyin, trích xuất URL CDN gốc không đóng dấu mờ (Watermark) mà không cần bẻ thuật toán chữ ký `a_bogus`.
- **WebTorrent Selective Engine**: Hỗ trợ tải phim, tiểu phẩm P2P qua Magnet link, tự động lọc file video và kiểm tra thời lượng (`probeDuration`).
- **yt-dlp Core Wrapper**: Hỗ trợ tải video chất lượng cao từ YouTube Shorts, TikTok, Facebook Reels, Instagram, Douyin, Bilibili, Xiaohongshu (RedNote).

### 2. Phân hệ Xử Lý Video Đa Tầng (FFmpeg & NVENC)
- **Vertical Blur 9:16**: Chia luồng video nền Gaussian Blur (`gblur=sigma=8`) và phóng to trung tâm bằng thuật toán nội suy `lanczos`.
- **Bộ lọc lách bản quyền sâu**: Lật gương (`hflip`), tạo nhiễu vi mô chống hash (`noise=alls=2:allf=t+u`), cắt viền động 1.5%, vi điều chỉnh cao độ âm thanh (`asetrate`, `atempo`), xóa sạch metadata gốc (`-map_metadata -1`).
- **Render Hardware Acceleration**: Tự động nhận diện GPU NVIDIA CUDA NVENC (`h264_nvenc`) hoặc CPU fallback (`libx264`).

### 3. Phân hệ Chuyển Ngữ & Lồng Tiếng AI (AI Subtitling & Dubbing)
- **Time-Budgeted Translation**: Giới hạn số ký tự bản dịch LLM dựa trên thời lượng câu thoại gốc ($20\text{ ký tự/giây}$) để triệt tiêu hiện tượng thoại AI bị chồng lấn.
- **softShortenVi**: Bộ lọc Regex loại bỏ từ đệm thừa tiếng Việt (`thì là mà`, `thực ra là`, `ở thời điểm hiện tại`,...).
- **Dual Voice Engine**:
  - *Edge-TTS Cloud*: Giọng đọc tự nhiên `vi-VN-HoaiMyNeural` & `vi-VN-NamMinhNeural`.
  - *OmniVoice Local CUDA*: Hỗ trợ mô hình Zero-Shot Voice Cloning nội bộ.
- **Auto Audio Ducking**: Tự động hạ âm lượng nhạc nền gốc xuống $-14\text{dB}$ khi có giọng đọc AI bằng bộ lọc `sidechaincompress`.

### 4. Phân hệ Phân Phối Đa Kênh (Batch Video Publishing Pipeline)
- **Lane Concurrency (Hàng chờ theo Account)**: Mỗi tài khoản chạy trên một luồng độc lập, video cùng một tài khoản được đẩy tuần tự để tránh race condition và chặn checkpoint chéo.
- **Anti-Spam Jitter Delay**: Giãn cách ngẫu nhiên từ 15–20 giây giữa các lượt tải lên.
- **Destination Cooldown**: Giữ khoảng nghỉ 60–120 giây giữa các lượt đăng trên cùng một Trang/Kênh.
- **Đa nền tảng**: Hỗ trợ Facebook Pages/Reels (Graph API & Playwright), TikTok Studio, YouTube Studio, Instagram Reels.

---

## 💻 Hướng Dẫn Vận Hành

### Chạy ứng dụng:
```powershell
cd "D:\KOAL\Kenzious Reel V2"
npm start
```
Hoặc click đúp file `Run-KenziousReel.bat` trong thư mục gốc.

---
*Phát triển độc lập theo nguyên tắc Clean-Room Reverse Engineering — Kenzious Team 2026.*
