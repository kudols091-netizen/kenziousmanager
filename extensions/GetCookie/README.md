# Kenzious Get Cookie (Manifest V3 Clean-Room)

Tiện ích mở rộng Chrome Extension chuyên nghiệp được phát triển độc lập theo tiêu chuẩn **Manifest V3**, áp dụng hệ thống nhận diện thương hiệu **Kenzious** (Cyber Neon Violet & Dark Indigo Glassmorphism).

---

## 📁 Thư mục mã nguồn
```text
D:\Vscode - Jobs\PinkAgc - Final 2508\Kenzi\GetCookie\
```

---

## 🚀 Hướng dẫn Cài đặt vào Chrome / Cốc Cốc / Edge / Brave

1. Mở trình duyệt Chrome hoặc Cốc Cốc, truy cập đường dẫn:
   ```text
   chrome://extensions
   ```
   *(Hoặc `coccoc://extensions`, `edge://extensions`)*
2. Bật công tắc **Chế độ dành cho nhà phát triển** (Developer mode) ở góc trên bên phải màn hình.
3. Bấm nút **Tải tiện ích đã giải nén** (Load unpacked) ở góc trên bên trái.
4. Chọn đường dẫn thư mục:
   ```text
   D:\Vscode - Jobs\PinkAgc - Final 2508\Kenzi\GetCookie
   ```
5. Tiện ích **Kenzious Get Cookie** với biểu tượng Mascot Kenzious sẽ xuất hiện ngay trên thanh công cụ tiện ích của bạn! Hãy ghim (Pin) tiện ích lên thanh trình duyệt để tiện sử dụng.

---

## ✨ Chi tiết Các Tính Năng & Mô-đun

### 1. Quản lý & Xuất/Nhập Cookie (Cookie Tab)
- **Tự động nhận diện nền tảng**: Tự động nhận diện các trang Facebook, ChatGPT, OpenAI, Gemini Google, Grok / X, TikTok, YouTube, Instagram, Threads...
- **4 Định dạng Cookie**:
  - `cURL String`: Chuỗi header cURL tiêu chuẩn (`c_user=...; xs=...; datr=...`).
  - `JSON`: Định dạng JSON mảng đầy đủ thông số domain, path, expirationDate, secure...
  - `Netscape`: Định dạng Netscape HTTP Cookie File chuẩn cho `curl`, `wget`, `yt-dlp`.
  - `Base64`: Mã hóa chuỗi Base64 1 dòng gọn nhẹ.
- **Copy 1-Click & Tải File**: Sao chép tức thì vào bộ nhớ tạm hoặc tải file `.txt`/`.json`.
- **Import Cookie Mới**: Hộp thoại nạp cookie vào tab hiện tại với tùy chọn xóa phiên cũ và tự động F5 vào tài khoản mới.

### 2. Định Danh & Bóc Tách Facebook (Facebook Tab)
- **Lấy UID Tab Hiện Tại**: Bóc tách chính xác ID dạng số của Profile cá nhân, Fanpage, Hội nhóm hoặc Bài viết/Reels đang mở.
- **Convert Hàng Loạt Link sang UID**: Dán danh sách link Facebook bất kỳ (mỗi dòng 1 link) ➔ Nhấn chuyển đổi để bóc tách toàn bộ ra danh sách UID số và copy 1-click.
- **Quét UID Trên Trang**: Kích hoạt bộ quét trực tiếp trên Facebook.
- **Clone Post Bài Này**: Mở nhanh trình bóc tách media và caption của bài viết hiện tại.

### 3. Trích Xuất Token (Tokens Tab)
- **Token Ads Manager (EAAB)**: Lấy token quyền cao phục vụ quản lý chiến dịch quảng cáo, đọc fanpage.
- **Token Pancake**: Trích xuất token phiên làm việc trên `pancake.vn` phục vụ kết nối tool & CRM.

### 4. Clone Bài Viết Facebook 1-Click (Injected)
- Tự động gắn nút **Clone Post** trực quan trên từng bài viết trên Bảng tin (Feed) và Video Reels.
- Tự động bóc tách:
  - Toàn bộ nội dung caption (cho phép chỉnh sửa trực tiếp).
  - Toàn bộ ảnh gốc chất lượng cao và video MP4.
  - Hỗ trợ tải toàn bộ media về máy chỉ với 1 click hoặc sao chép sẵn sàng để đăng lại.

### 5. Quét UID Tương Tác & Xuất Excel (.xls / .csv)
- Quét danh sách người Like, Love, Haha, Thả cảm xúc.
- Quét danh sách người bình luận (Comments) và **tự động phát hiện số điện thoại (SĐT)** trong bình luận.
- Quét thành viên Group Facebook.
- **Xuất dữ liệu 2 định dạng**:
  - **Excel (`.xls`)**: Bảng tính chuẩn màu thương hiệu Kenzious, bảo vệ số UID lớn không bị lỗi `1E+14`.
  - **CSV (UTF-8 BOM)**: Tương thích 100% hiển thị tiếng Việt có dấu trong Excel.

### 6. Auto Nuôi Nick Tương Tác (Floating Sidebar)
- Thanh công cụ nổi Kenzious có thể kéo thả bất kỳ vị trí nào trên màn hình Facebook:
  - Tự động lướt Newsfeed mượt mà.
  - Tự động thả cảm xúc (Like/Love) ngẫu nhiên mô phỏng người dùng thật.
  - Tự động xem video Reels và chuyển video ngẫu nhiên sau 5 - 15 giây.
  - Cơ chế random delay 3s - 8s chống Checkpoint tài khoản.
  - Hộp log hoạt động thời gian thực.

---

## 🎨 Thông Số Thiết Kế Thương Hiệu (Brand System)
- **Canvas Background**: Deep Space Dark Navy (`#02041A` / `#080D2B`)
- **Card & Modal**: Dark Indigo Glassmorphism (`#0F1642` kèm border viền tím `#9950FA38`)
- **Primary Brand Accent**: Neon Cyber Violet (`#9950FA` / `#7C3AED`)
- **Highlight Accent**: Cyber Pink / Lavender (`#FAC0FA` / `#F472B6`)
- **Status Colors**: Success Emerald (`#10B981`), Warning Amber (`#F59E0B`), Danger Rose (`#F43F5E`)
- **Icons**: Mascot Kenzious chuẩn PNG (16x16, 32x32, 48x48, 128x128).
