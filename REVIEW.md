# Code Review — Kenzious Reel V2

**Reviewer:** glaucus
**Date:** 2026-10-17T23:10:00+07:00
**Commit reviewed:** 54613c3

## Executive Summary (cho Boss Man)

1. **Trạng thái kiểm tra tự động (`npm run check`):** ESLint đạt **0 errors, 350 warnings** (`no-unused-vars`), và Smoke Test (`scripts/smoke-test.js`) **PASS** (Electron khởi chạy ổn định sau 5s không crash).
2. **Kiến trúc nền tảng:** Các lớp lõi mới được gia cố rất tốt — ghi file JSON nguyên tử (`atomicWriteJsonSync`), mã hóa DPAPI (`safeStorage`) cho cookie/token/API key, quản lý tiến trình con (`process-registry.js`), và chặn rò rỉ IP thật khi có proxy (`proxy-net.js`).
3. **Vấn đề nghiêm trọng nhất (🔴 BLOCKER):** Phát hiện **4 lỗi gãy luồng chức năng cốt lõi** do lệch hợp đồng dữ liệu (data contract mismatch) giữa `main` và `renderer`: (1) Chọn thư mục video ở Tab 1 bị crash `TypeError` do lệch `mediaPath` vs `filePath`, (2) Đăng nhập Gemini Web ở Settings luôn báo lỗi giả do check `res.success` thay vì `res.ok`, (3) ElevenLabs TTS không bao giờ đọc được API key do lệch `elevenLabsKey` vs `elevenLabsApiKey`, (4) Lưu lại Cookie trong cài đặt kênh làm ghi đè `accountId`/`profileDir` hoặc nhân bản tài khoản.
4. **Rủi ro bảo mật & hiệu năng (🟡 MAJOR):** Lộ `HMAC_SECRET` đối xứng trong `license-guard.js` (cho phép tự ký `license.dat` giả mạo khi giải nén `app.asar`), rò rỉ bộ nhớ `reelBuffers` trong `fbreel-bridge.js`, rò rỉ IP thật khi check UID/resolve link FB qua `id.traodoisub.net`, và cấu hình GPU render bị bỏ qua hoàn toàn.
5. **Khuyến nghị hành động:** Giao **Soldier** xử lý ngay 4 task 🔴 BLOCKER trong vòng lặp đầu tiên (tất cả đều dễ sửa, phạm vi cô lập, rủi ro hồi quy thấp), sau đó xử lý tiếp nhóm 🟡 MAJOR về bảo mật License, rò rỉ bộ nhớ và tôn trọng cấu hình phần cứng.

## Điểm mạnh

- **Lưu trữ nguyên tử & chống hỏng dữ liệu (`src/core/paths.js`, `src/core/storage.js`):** Sử dụng `atomicWriteJsonSync` (ghi ra `.tmp` rồi `renameSync`) kèm cơ chế tự động sao lưu file `.corrupt.<timestamp>` khi JSON lỗi, ngăn chặn mất trắng cấu hình khi tắt máy đột ngột.
- **Bảo mật thông tin nhạy cảm trên đĩa (`src/core/secure-store.js`, `src/core/storage.js`):** Tích hợp Electron `safeStorage` (Windows DPAPI) để mã hóa `enc:v1:...` cho toàn bộ API keys, cookies, access tokens trong `settings.json`, `accounts.json` và `secure-kv.json`, đồng thời ẩn secret khỏi IPC payload trả về cho `renderer`.
- **Quản lý vòng đời tiến trình con (`src/core/process-registry.js`):** Theo dõi toàn bộ tiến trình `ffmpeg`, `yt-dlp`, `python` và dọn sạch bằng `taskkill /T /F` khi đóng ứng dụng, tránh treo tiến trình ngầm ngốn RAM/GPU.
- **Chống rò rỉ IP thật qua Proxy (`src/core/proxy-net.js`, `src/core/fbreel-bridge.js`):** Tự động stripping credentials khỏi header khi redirect khác domain, ép mọi request mang cookie/token của clone phải đi qua đúng proxy đã gán và fail-closed (không fallback về IP máy chủ khi proxy chết).
- **Cơ chế hàng đợi xuất bản bền bỉ (`src/core/publisher.js`, `src/core/publisher-db.js`):** Chạy theo từng lane tài khoản độc lập, có khóa chống nhân bản video (`hasDuplicateSuccess` bằng `mediaSig` + `contentSig`) và trạng thái `unverified` khi trình duyệt mất kết nối sau bước bấm nút Đăng (ngăn đăng lặp video lên Page).
- **Chống XSS ở tầng giao diện (`renderer/js/safe-dom.js`):** Cung cấp `KZ.html`, `KZ.safeUrl`, và event delegation `KZ.action` giúp giảm thiểu rủi ro DOM XSS từ dữ liệu mạng xã hội.

## Task List

### TASK-001: Sửa lỗi crash `TypeError` khi chọn thư mục video ở Tab 1 (Download & Render) 🔴
- **File:** `renderer/js/tab-download.js:549` (liên đới `src/core/publisher.js:266`)
- **Vấn đề:** `window.api.scanFolderClips(dir)` trả về mảng object có thuộc tính `mediaPath`, nhưng `addLocalClipsToQueue(clips)` lại đọc `clip.filePath` (bị `undefined`) rồi gọi `.split(/[\\/]/)` gây crash ngay lập tức.
- **Strike:** 0/2
- **Status:** done

**🔴 BLOCKER — Crash khi nạp thư mục video cục bộ vào hàng đợi Render**
- **File:** `renderer/js/tab-download.js:549`
- **Scenario:** Người dùng vào Tab 1 (`Download & Render`), bấm nút chọn thư mục video (`btnSelectFolder` tại `tab-download.js:346`) và chọn một thư mục có chứa file `.mp4`.
- **Expected:** Danh sách video trong thư mục được thêm vào `queueData` và hiển thị lên bảng hàng đợi để render.
- **Actual:** Quá trình nạp dừng đột ngột, ném ngoại lệ `TypeError: Cannot read properties of undefined (reading 'split')` tại `tab-download.js:550` và nhảy vào `catch` báo lỗi alert.
- **Test case:**
  ```javascript
  // src/core/publisher.js:266 trả về:
  const scannedClips = [{ itemId: 'clip_1', mediaPath: 'C:\\videos\\demo.mp4', title: 'demo' }];
  // renderer/js/tab-download.js:549 thực thi:
  const clip = scannedClips[0];
  const filePath = typeof clip === 'string' ? clip : clip.filePath; // -> undefined
  filePath.split(/[\\/]/).pop(); // -> TypeError: Cannot read properties of undefined (reading 'split')
  ```
- **Đề xuất:** Tại `renderer/js/tab-download.js:549`, đọc `const filePath = typeof clip === 'string' ? clip : (clip.filePath || clip.mediaPath || '');` và kiểm tra `if (!filePath) return;` trước khi gọi `filePath.split(/[\\/]/)`.

---

### TASK-002: Sửa lỗi đăng nhập Gemini Web trong Settings luôn báo thất bại giả 🔴
- **File:** `renderer/js/tab-settings.js:605` (liên đới `src/core/ai-pipeline.js:365`)
- **Vấn đề:** `aiPipeline.loginGeminiInteractive()` trả về `{ ok: true, message, cookiesCount }`, nhưng `tab-settings.js:605` lại kiểm tra `if (res && res.success)` khiến người dùng đăng nhập thành công vẫn luôn bị báo lỗi thất bại.
- **Strike:** 0/2
- **Status:** done

**🔴 BLOCKER — Đăng nhập Gemini Web ở Settings Studio luôn báo lỗi dù đã lấy được cookie**
- **File:** `renderer/js/tab-settings.js:605`
- **Scenario:** Người dùng vào `Settings` -> `Cấu Hình A.I`, bấm nút `btnGeminiLogin` ("Đăng nhập Gemini Web"), đăng nhập tài khoản Google thành công trên cửa sổ trình duyệt bật lên.
- **Expected:** Ứng dụng hiển thị thông báo đăng nhập thành công kèm số lượng cookie đã lưu và cập nhật trạng thái phiên Gemini.
- **Actual:** Dù `src/core/ai-pipeline.js:365` đã lưu cookie và trả về `{ ok: true, message: '...', cookiesCount: cookies.length }`, `tab-settings.js:605` kiểm tra `if (res && res.success)` (luôn `undefined`) nên rơi vào nhánh `else` và hiện alert `"❌ Lỗi đăng nhập Gemini: Không nhận diện được phiên đăng nhập"`.
- **Test case:**
  ```javascript
  // Kết quả trả về từ src/core/ai-pipeline.js:365:
  const res = { ok: true, message: 'Đăng nhập và trích xuất phiên Gemini thành công!', cookiesCount: 18 };
  // Logic hiện tại ở renderer/js/tab-settings.js:605:
  if (res && res.success) {
    console.log('Success');
  } else {
    console.log('Fail:', res?.error || 'Không nhận diện được phiên đăng nhập'); // -> Luôn chạy vào đây!
  }
  ```
- **Đề xuất:** Tại `renderer/js/tab-settings.js:605-607`, sửa điều kiện thành `if (res && (res.ok || res.success))` và lấy số lượng cookie qua `res.cookiesCount ?? (res.cookies ? res.cookies.length : 0)` (đồng bộ với `renderer/js/tab-ai.js:314`).

---

### TASK-003: Đồng bộ tên trường `elevenLabsApiKey` để khôi phục tính năng giọng đọc ElevenLabs TTS 🔴
- **File:** `src/core/voice-synthesizer.js:55` (liên đới `src/core/storage.js:8,148` và `renderer/js/tab-settings.js:176,772,893`)
- **Vấn đề:** Giao diện Settings và `storage.js` lưu và mã hóa khóa API dưới tên `settings.elevenLabsApiKey`, nhưng `VoiceSynthesizer.getElevenLabsKey()` lại đọc `s.elevenLabsKey`, dẫn đến hàm luôn trả về chuỗi rỗng `''` và ElevenLabs TTS không bao giờ hoạt động.
- **Strike:** 0/2
- **Status:** done

**🔴 BLOCKER — ElevenLabs TTS luôn báo thiếu API Key do đọc sai tên thuộc tính trong `settings.json`**
- **File:** `src/core/voice-synthesizer.js:55`
- **Scenario:** Người dùng nhập ElevenLabs API Key hợp lệ trong `Settings`, bấm "Kiểm tra kết nối" báo thành công (`elevenLabsApiKey` được lưu vào `settings.json`), sau đó dùng giọng đọc `elevenlabs:*` để tổng hợp giọng nói.
- **Expected:** `VoiceSynthesizer.getElevenLabsKey()` lấy được API key đã lưu và gọi API ElevenLabs thành công.
- **Actual:** `getElevenLabsKey()` luôn trả về `''`, khiến `synthesizeElevenLabs()` tại `src/core/voice-synthesizer.js:116` ném lỗi `'Chưa cấu hình ElevenLabs API Key.'` và bị ép fallback về giọng đọc Edge-TTS.
- **Test case:**
  ```javascript
  // src/core/storage.js:8 & 148 lưu:
  const s = { elevenLabsApiKey: 'sk_live_123456', elevenLabsEnabled: true };
  // src/core/voice-synthesizer.js:55 hiện tại:
  const key = s.elevenLabsKey || ''; // -> '' (mất key!)
  ```
- **Đề xuất:** Tại `src/core/voice-synthesizer.js:55`, sửa `return s.elevenLabsKey || process.env.ELEVENLABS_API_KEY || '';` thành `return s.elevenLabsApiKey || s.elevenLabsKey || process.env.ELEVENLABS_API_KEY || '';`.

---

### TASK-004: Sửa lỗi "Lưu Cookie" trong Cài đặt Kênh tạo tài khoản trùng hoặc làm hỏng `accountId`/`profileDir` 🔴
- **File:** `renderer/js/tab-channels.js:534` và `src/core/channel-manager.js:306-352` (liên đới `src/core/storage.js:358-375`)
- **Vấn đề:** Khi cập nhật cookie cho một tài khoản hiện có trong modal Cài đặt kênh (`btnActionSaveCookie`), code gọi `importCookies(...)` mà không truyền `existingAccountId`. `importCookies` luôn sinh `accountId = acc_${Date.now()}` mới và `profileDir` mới; khi gọi `storage.addAccount()`, nếu `username` đổi sẽ tạo bản ghi tài khoản trùng lặp, còn nếu `username` trùng thì ghi đè mất `id` và `profileDir` cũ của tài khoản, làm đứt toàn bộ liên kết lịch đăng bài (`publisher_data.json`) và nhóm kênh (`destinations_store.json`).
- **Strike:** 0/2
- **Status:** pending

**🔴 BLOCKER — Cập nhật Cookie cho kênh hiện có làm mất ID kênh hoặc nhân bản kênh**
- **File:** `renderer/js/tab-channels.js:534`
- **Scenario:** Người dùng mở phần Cài đặt của một kênh đã kết nối (ví dụ có `id: "acc_1700000001"` đang gắn trong Chiến dịch đăng bài), dán Cookie mới vào ô và bấm nút "Lưu Cookie" (`btnActionSaveCookie`).
- **Expected:** Tài khoản `"acc_1700000001"` giữ nguyên `id` và `profileDir`, chỉ cập nhật `cookies`, `accessToken`, `uid`, `displayName` và `status: 'connected'`.
- **Actual:** `channelManager.importCookies` tạo `id: "acc_1729200000"` mới. Trong `storage.addAccount(acc)` (`src/core/storage.js:367`), lệnh `{ ...accounts[existingIndex], ...acc }` ghi đè `id` và `profileDir` bằng giá trị mới (hoặc `accounts.push(acc)` tạo thêm 1 kênh mới nếu tên hiển thị/UID thay đổi).
- **Test case:**
  ```javascript
  // Giả sử tài khoản cũ trong accounts.json:
  const existing = { id: 'acc_100', platform: 'facebook', username: 'Old Name', profileDir: 'C:\\profiles\\acc_100' };
  // Khi importCookies tạo newAccount:
  const newAcc = { id: 'acc_999', platform: 'facebook', username: 'Old Name', profileDir: 'C:\\profiles\\acc_999' };
  // storage.addAccount:
  const merged = { ...existing, ...newAcc };
  // merged.id === 'acc_999' (Mất ID gốc 'acc_100' mà publisher_data.json đang tham chiếu!)
  ```
- **Đề xuất:**
  1. Cho phép `channelManager.importCookies(platform, rawCookieInput, proxy, customTitle, existingAccountId)` nhận tham số `existingAccountId` (hoặc giữ nguyên `id` và `profileDir` của `existingAccount` trong `storage.addAccount` khi tìm thấy tài khoản trùng).
  2. Tại `renderer/js/tab-channels.js:534`, truyền `currentEditingAccount.id` vào `window.api.importCookies` (cập nhật `preload.js` và `src/main.js:542` để chuyển tiếp `existingAccountId`), và trong `storage.addAccount` (`src/core/storage.js:367`), bảo toàn `id: accounts[existingIndex].id` và `profileDir: accounts[existingIndex].profileDir || acc.profileDir`.

---

### TASK-005: Loại bỏ `HMAC_SECRET` đối xứng hardcoded khỏi mã nguồn client (`license-guard.js`) 🟡
- **File:** `src/core/license-guard.js:25` (và `src/core/license-guard.js:116-123`)
- **Vấn đề:** Khóa bí mật `HMAC_SECRET` được lưu dạng明文 (plaintext) ngay trong `src/core/license-guard.js` đóng gói trong `app.asar`.
- **Strike:** 0/2
- **Status:** pending

**🟡 MAJOR — Lộ khóa bí mật `HMAC_SECRET` ở client cho phép giả mạo `license.dat` offline**
- **File:** `src/core/license-guard.js:25`
- **Scenario:** Người dùng giải nén `resources/app.asar`, đọc hằng số `HMAC_SECRET = 'mYVvtx4eqXfGrGo+Bw9s6xu4FMrqdLSv4pTeb4WTII0='` tại dòng 25, sau đó tự tạo payload JSON `{ key, hwid, expiresAt: "2099-12-31", isLifetime: true, lastOnlineOk: Date.now() }` và ký HMAC-SHA256 bằng chính secret này rồi ghi vào `license.dat`.
- **Impact:** Toàn bộ cơ chế bảo vệ bản quyền `verifyLocalLicense()` bị vượt qua hoàn toàn trong thời gian `OFFLINE_GRACE_MS` (7 ngày) hoặc vĩnh viễn nếu chặn domain `virals.kenzious.com` / giả lập phản hồi local.
- **Đề xuất:** Chuyển xác thực chữ ký `license.dat` ở client sang chữ ký bất đối xứng **Ed25519 / RSA** (`crypto.verify` với **Public Key** đặt ở client, còn **Private Key** chỉ nằm trên server `virals.kenzious.com`), hoặc mã hóa/ràng buộc chữ ký từ phía server trả về.

---

### TASK-006: Chặn rò rỉ bộ nhớ (Memory Leak) trong `reelBuffers` khi upload video ở `fbreel-bridge.js` 🟡
- **File:** `src/core/fbreel-bridge.js:74` và `src/core/fbreel-bridge.js:491-507`
- **Vấn đề:** Map `reelBuffers` tích trữ các chunk Buffer 12MB theo `uploadId`, nhưng chỉ xóa `uploadId` khi nhận được gói tin cuối cùng (`last: true`). Nếu quá trình đọc/gửi chunk ở renderer bị lỗi giữa chừng, người dùng F5/đóng cửa sổ hoặc hủy đăng bài, các Buffer này nằm vĩnh viễn trong RAM của Main Process.
- **Strike:** 0/2
- **Status:** pending

**🟡 MAJOR — Rò rỉ hàng trăm MB RAM trong `reelBuffers` khi phiên upload chunk bị ngắt giữa chừng**
- **File:** `src/core/fbreel-bridge.js:491-507`
- **Scenario:** Người dùng đăng hàng loạt video lớn ở tab Đăng Reel, sau đó bấm Dừng / tải lại trang hoặc 1 chunk bị lỗi khi đang truyền qua IPC `eb:uploadReelChunk` trước khi gói `last: true` được gửi.
- **Impact:** Các mảng `Buffer` trong `reelBuffers` không bao giờ được giải phóng cho đến khi tắt hẳn ứng dụng; ngoài ra `Buffer.concat(chunks)` nhân đôi đỉnh bộ nhớ cho mỗi video.
- **Đề xuất:** Thêm timestamp `createdAt`/`updatedAt` cho mỗi mục trong `reelBuffers` và chạy bộ dọn dẹp tự động (TTL 5 phút) để xóa các `uploadId` bị treo, đồng thời bọc `try / finally` tại nhánh `if (p && p.last)` để luôn đảm bảo `reelBuffers.delete(id)` ngay cả khi `Buffer.concat` hoặc `fetch` ném lỗi.

---

### TASK-007: Sửa rò rỉ IP thật khi kiểm tra UID (`checkUidLive`) và khi phân giải link qua bên thứ ba (`facebook-toolkit.js`) 🟡
- **File:** `src/core/fbreel-bridge.js:393-409` và `src/core/facebook-toolkit.js:346-358`
- **Vấn đề:**
  1. `checkUidLive` trong `fbreel-bridge.js:396` gọi trực tiếp `fetch('https://graph.facebook.com/...')` bằng IP máy chủ thay vì đi qua proxy của clone (`renderer/js/fbreel-clone.js:234`).
  2. `resolveSingleUrlToUid` trong `src/core/facebook-toolkit.js:349-350` gửi thẳng URL Facebook mục tiêu tới server bên thứ ba `https://id.traodoisub.net/api.php` mà không truyền tham số `proxy` vào `this.httpGet(publicApiUrl, {}, 2)`.
- **Strike:** 0/2
- **Status:** pending

**🟡 MAJOR — Rò rỉ IP thật của máy chủ khi Check Live UID và khi Convert Link sang UID**
- **File:** `src/core/fbreel-bridge.js:396`
- **Scenario:** Người dùng cấu hình Proxy riêng cho từng Via ở tab Quản lý Clone rồi bấm "Check Live", hoặc dùng công cụ Convert Link sang UID khi tài khoản Facebook đã gắn Proxy.
- **Impact:** Mọi request `checkUidLive` và fallback `id.traodoisub.net` đều đi thẳng bằng IP thật của máy, làm lộ IP máy chủ với Facebook (dễ dẫn tới khóa hàng loạt Via hoặc rate-limit IP) và lộ danh sách link đang nghiên cứu cho bên thứ ba.
- **Đề xuất:**
  1. Tại `src/core/fbreel-bridge.js:393`, nhận thêm tham số `proxy` (hoặc tra từ `cloneProxyByUid.get(cleanUid)`) và sử dụng `proxyFetch` thay cho `fetch` mặc định; truyền `c.proxy` vào `window.EB.checkUidLive(c.uid, c.proxy)` tại `renderer/js/fbreel-clone.js:234`.
  2. Tại `src/core/facebook-toolkit.js:350`, truyền `proxy` vào `this.httpGet(publicApiUrl, {}, 2, proxy)`.

---

### TASK-008: Tôn trọng cài đặt `renderEngine` (GPU NVENC/QSV/AMF vs CPU) và `deleteOriginalAfterRender` trong `renderer.js` 🟡
- **File:** `src/core/renderer.js:292-300` (liên đới `renderer/js/tab-settings.js:152,784` và `renderer/js/tab-download.js:948`)
- **Vấn đề:** Trong Settings Studio, người dùng có thể chọn `renderEngine` (`auto_gpu`, `gpu_only`, `cpu_only`) và bật `deleteOriginalAfterRender`. Tuy nhiên `src/core/renderer.js:293` luôn hardcode `-c:v libx264` (chỉ chạy CPU), bỏ qua hoàn toàn cấu hình GPU và cờ xóa file gốc sau khi render.
- **Strike:** 0/2
- **Status:** pending

**🟡 MAJOR — Cấu hình Render Engine (GPU/CPU) và tự xóa video gốc sau render không có tác dụng**
- **File:** `src/core/renderer.js:292-300`
- **Scenario:** Người dùng chọn chế độ `Ưu tiên GPU (NVIDIA NVENC / AMD AMF)` hoặc `Chỉ dùng GPU` và bật `Tự động xóa video gốc sau khi Render xong` trong tab Cài đặt, sau đó chạy Render ở Tab 1.
- **Impact:** FFmpeg vẫn ép chạy `libx264` bằng CPU 100% khiến tốc độ render chậm hơn nhiều lần trên máy có card rời, và các file video gốc trong thư mục `temp` không được xóa sau khi xuất bản xong, gây đầy ổ cứng.
- **Đề xuất:** Trong `src/core/renderer.js`, đọc `storage.getSettings().renderEngine` để chọn codec phù hợp (ví dụ thử `h264_nvenc` / `h264_qsv` / `h264_amf` khi `auto_gpu` hoặc `gpu_only`, fallback về `libx264` nếu `auto_gpu` gặp lỗi khởi tạo encoder), và kiểm tra `settings.deleteOriginalAfterRender` để xóa `inputPath` sau khi file output đã tạo thành công.

---

### TASK-009: Dọn dẹp tiến trình Chrome tách rời (`detached`) khi `puppeteer.connect` thất bại trong `channel-manager.js` 🟡
- **File:** `src/core/channel-manager.js:404-425`, `src/core/channel-manager.js:700-720`, `src/core/channel-manager.js:768-776`
- **Vấn đề:** Các hàm `interactiveLogin`, `openProfileBrowser`, và `openViaBrowser` khởi chạy `chrome.exe` với `{ detached: true, stdio: 'ignore' }` rồi chờ kết nối cổng debug (`puppeteer.connect`). Nếu kết nối thất bại sau 25 lần thử, hàm ném lỗi hoặc thoát mà không kill `child.pid`, để lại tiến trình Chrome mồ côi giữ khóa thư mục profile (`SingletonLock`), khiến các lần mở trình duyệt hoặc đăng bài sau đó bị kẹt.
- **Strike:** 0/2
- **Status:** pending

**🟡 MAJOR — Tiến trình Chrome mồ côi giữ khóa profile khi kết nối CDP thất bại**
- **File:** `src/core/channel-manager.js:420-425`
- **Scenario:** Người dùng bấm "Mở trình duyệt" hoặc "Đăng nhập tương tác", nhưng Chrome khởi động chậm hoặc cổng debug gặp sự cố khiến `browser` vẫn là `null` sau vòng lặp 25 lần thử.
- **Impact:** Hàm ném lỗi `'Không thể kết nối cổng điều khiển trình duyệt...'`, nhưng tiến trình `child` (`detached: true`) vẫn chạy ngầm và giữ khóa `profileDir`, làm mọi thao tác Puppeteer tiếp theo trên kênh đó đều báo lỗi profile đang được sử dụng.
- **Đề xuất:** Lưu `const child = spawn(...)` và nếu `!browser` sau vòng lặp kết nối trong `interactiveLogin` (`line 424`) và `openProfileBrowser` (`line 720`), gọi `taskkill /PID ${child.pid} /T /F` (hoặc `child.kill()`) trước khi throw error.

---

### TASK-010: Thay thế kịch bản lồng tiếng A.I giả định (hardcoded text) ở Tab 1 bằng luồng trích xuất/dịch thực tế 🟡
- **File:** `renderer/js/tab-download.js:895-906` và `src/main.js:304-308`
- **Vấn đề:** Khi người dùng bật `chkAiDubbing` (Lồng tiếng A.I) ở Tab 1, `tab-download.js:905` không trích xuất lời thoại hay phụ đề của video mà ghép cứng câu mẫu: `` `${item.title}. Khám phá ngay video này để biết thêm chi tiết thú vị!` `` để đọc TTS. Ngoài ra IPC `ai:translate` (`src/main.js:305`) gọi `aiPipeline.translateScript` nhưng phương thức này chưa tồn tại trong `src/core/ai-pipeline.js`.
- **Strike:** 0/2
- **Status:** pending

**🟡 MAJOR — Tính năng Lồng tiếng A.I ở Tab 1 chỉ đọc câu quảng cáo mẫu cố định thay vì nội dung video**
- **File:** `renderer/js/tab-download.js:905`
- **Scenario:** Người dùng tích chọn "Lồng tiếng A.I (Tự động dịch & đọc)" ở Tab 1 và bấm Render hàng loạt.
- **Expected:** Hệ thống lấy kịch bản đã phân tích/dịch từ A.I (hoặc gọi `aiPipeline` tạo lời bình từ tiêu đề/phụ đề video theo ngôn ngữ đích) rồi tổng hợp giọng nói khớp nội dung.
- **Actual:** Mọi video đều chỉ đọc đúng câu cố định `"<Tiêu đề>. Khám phá ngay video này để biết thêm chi tiết thú vị!"`.
- **Đề xuất:** Bổ sung hàm `translateScript(text, targetLang)` vào `src/core/ai-pipeline.js` (sử dụng tầng AI đang cấu hình trong `ai-pipeline.js`), và tại `renderer/js/tab-download.js:900-910`, ưu tiên lấy kịch bản AI đã sinh (nếu có) hoặc gọi `window.api.translateScript` trước khi đưa vào `window.api.synthesizeSpeech`.

---

### TASK-011: Đồng bộ tiến trình `toolkit:uidProgress` cho tất cả cửa sổ Reup Studio 🟢
- **File:** `src/main.js:334`
- **Vấn đề:** Handler `toolkit:convertUrlsToUid` chỉ gửi sự kiện `mainWindow.webContents.send('toolkit:uidProgress', p)` về cửa sổ chính thay vì dùng `broadcastToAppWindows('toolkit:uidProgress', p)` như các handler khác.
- **Strike:** 0/2
- **Status:** pending

**🟢 NITPICK — Cửa sổ Reup Studio phụ không nhận được tiến độ phân giải UID**
- **File:** `src/main.js:334`
- **Gợi ý:** Thay `if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toolkit:uidProgress', p);` bằng `broadcastToAppWindows('toolkit:uidProgress', p);` để các cửa sổ mở thêm từ Workspace Hub cũng cập nhật được badge tiến độ `0/N`.

---

### TASK-012: Dọn dẹp 350 cảnh báo ESLint `no-unused-vars` và các nút giả lập trong `tab-settings.js` 🟢
- **File:** `renderer/js/tab-settings.js:963-976` (và các file báo warning khi chạy `npm run lint`)
- **Vấn đề:** Hai nút `btnOptimizeDatabase` và `btnClearDatabaseCache` tại `tab-settings.js:965-975` chỉ hiển thị `alert('✅ Đã tối ưu hóa và VACUUM SQLite Database thành công!')` mà không gọi IPC dọn dẹp thực sự; đồng thời codebase có 350 cảnh báo biến không sử dụng (`no-unused-vars`).
- **Strike:** 0/2
- **Status:** pending

**🟢 NITPICK — Nút tối ưu Database/xóa Cache chỉ hiện alert tĩnh và nhiều cảnh báo `no-unused-vars`**
- **File:** `renderer/js/tab-settings.js:965-975`
- **Gợi ý:** Nối `btnClearDatabaseCache` với IPC xóa các file tạm trong thư mục `temp` (`paths.getTempDir()`), đổi nhãn nút VACUUM cho đúng với cơ chế JSON Store hiện tại, và dọn dẹp dần các biến thừa/catch parameter không dùng.

## Khuyến nghị

- **Nên phát triển tiếp (Develop further):**
  - **Hệ thống FB Reel & Quản lý Clone/Via (`fbreel-bridge.js`, `fbreel-reel.js`, `fbreel-clone.js`)** và **Publisher Queue (`publisher.js`, `facebook-reels-poster.js`)**: Đã có độ hoàn thiện nghiệp vụ rất cao (tự động xoay vòng nội dung, cách ly proxy theo từng clone, lưu trữ DPAPI, xử lý trạng thái `unverified` chống đăng trùng). Chỉ cần vá lỗ hổng rò rỉ bộ nhớ `reelBuffers` (TASK-006) và proxy cho `checkUidLive` (TASK-007) là đạt chuẩn vận hành quy mô lớn.
  - **Tích hợp AI 3 tầng (`ai-pipeline.js`) & Lồng tiếng (`voice-synthesizer.js`, `omnivoice_worker.py`)**: Kiến trúc fallback Local Ollama -> Cloud API -> Browser Gemini rất linh hoạt; sau khi sửa lỗi lệch tên biến ở TASK-002 và TASK-003 sẽ phát huy tối đa hiệu quả.
- **Nên ngưng hoặc tinh giản (Stop / Clean up):**
  - **Các mục mô phỏng không có thật trong Settings Studio (`tab-settings.js`):** Nút "VACUUM SQLite Database" (ứng dụng thực tế dùng JSON nguyên tử, không dùng SQLite) và các gói cài đặt mô phỏng (`whisper-cpp`, `rife-ncnn`, `realesrgan-ncnn` trong `PACKAGES_SPEC` chỉ tải file hoặc giải nén mà chưa được nối vào luồng render thực tế) nên được ẩn hoặc ghi chú rõ là tính năng thử nghiệm để tránh gây hiểu nhầm cho người dùng.
  - **Phụ thuộc vào API bên thứ ba không chính thức (`id.traodoisub.net` trong `facebook-toolkit.js`):** Nên loại bỏ hoặc đặt sau một tùy chọn bật/tắt tường minh vì vừa không ổn định vừa làm lộ dữ liệu URL khách hàng.
- **Kiến trúc cần thay đổi (Architectural improvements):**
  - **Xác thực License bất đối xứng (`license-guard.js`):** Bắt buộc chuyển từ HMAC-SHA256 (dùng chung secret giữa server và client) sang chữ ký số Ed25519/RSA (client chỉ giữ Public Key) để ngăn chặn triệt để việc giải nén `app.asar` tự ký license.
  - **Chuẩn hóa hợp đồng IPC (IPC Schema / Type Definitions):** Bốn lỗi 🔴 BLOCKER hiện tại đều xuất phát từ việc Main Process trả về `{ ok, mediaPath, elevenLabsApiKey }` nhưng Renderer lại đọc `{ success, filePath, elevenLabsKey }`. Nên tạo một module hằng số hoặc JSDoc `@typedef` dùng chung cho các response IPC để tránh tái diễn lỗi lệch tên trường.
