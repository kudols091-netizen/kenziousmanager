/**
 * Kenzious Reel Studio v2 - Admin License Key Generator (Keygen)
 * Exclusively for Boss Kudo
 * Usage: node scripts/keygen.js [HWID|self] [1-5|số ngày|LIFETIME]
 *
 * Ký key bằng khoá BÍ MẬT Ed25519 nằm NGOÀI repo/app:
 *   mặc định %USERPROFILE%\.kenzious-license\private.pem  (hoặc đặt biến môi trường KZ_LICENSE_PRIVATE_KEY)
 * App chỉ chứa khoá công khai tương ứng (src/core/license-guard.js).
 * ⚠ Sao lưu private.pem cẩn thận: mất file này thì không cấp được key cho các bản đã phát hành;
 *   lộ file này thì ai cũng tự sinh được key.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const licenseGuard = require('../src/core/license-guard');

const PRIVATE_KEY_PATH = process.env.KZ_LICENSE_PRIVATE_KEY || path.join(os.homedir(), '.kenzious-license', 'private.pem');
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`\n[!] Không tìm thấy khoá bí mật để ký key tại:\n    ${PRIVATE_KEY_PATH}\n` +
    '    Chép file private.pem đã sao lưu vào đó (hoặc đặt biến môi trường KZ_LICENSE_PRIVATE_KEY).\n');
  process.exit(1);
}
const PRIVATE_KEY_PEM = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('========================================================');
  console.log('       KENZIOUS STUDIO V2 - ADMIN KEY GENERATOR         ');
  console.log('                 Bản quyền cho Boss Kudo                ');
  console.log('========================================================\n');

  const localHwid = licenseGuard.getHWID();
  const args = process.argv.slice(2);

  let hwid = '';
  let choice = '';
  let customDaysVal = null;

  if (args.length > 0) {
    if (args[0].toLowerCase() === 'self' || args[0].toLowerCase() === '--self') {
      hwid = localHwid;
    } else {
      hwid = args[0].trim().toUpperCase();
    }
    if (args[1]) {
      const a1 = args[1].trim();
      if (['1', '2', '3', '4', '5'].includes(a1)) {
        choice = a1;
      } else if (!isNaN(parseInt(a1, 10))) {
        choice = '6';
        customDaysVal = parseInt(a1, 10);
      } else if (a1.toUpperCase() === 'LIFETIME' || a1.toUpperCase() === 'PERMANENT') {
        choice = '5';
      }
    } else {
      choice = '5'; // default lifetime
    }
    console.log(`-> Nhận từ tham số dòng lệnh: HWID = ${hwid}, Gói = ${choice}`);
  }

  // 1. Nhập HWID nếu chưa có từ tham số
  if (!hwid) {
    const hwidPrompt = `[?] Nhập mã máy HWID của khách\n    (Bấm Enter để lấy mã máy hiện tại [${localHwid}]): `;
    const hwidInput = await ask(hwidPrompt);
    hwid = hwidInput.trim().toUpperCase();

    if (!hwid) {
      hwid = localHwid;
      console.log(`-> Sử dụng HWID máy hiện tại: ${hwid}`);
    }
  }

  if (!hwid.startsWith('KZ-')) {
    console.error('\n[!] LỖI: Mã máy HWID không đúng định dạng (phải bắt đầu bằng KZ-)!\n');
    rl.close();
    return;
  }

  // 2. Chọn loại thời hạn nếu chưa có
  if (!choice) {
    console.log('\n[?] Chọn gói bản quyền:');
    console.log('  [1] 30 Ngày   (Gói Tháng)');
    console.log('  [2] 90 Ngày   (Gói 3 Tháng)');
    console.log('  [3] 180 Ngày  (Gói 6 Tháng)');
    console.log('  [4] 365 Ngày  (Gói 1 Năm)');
    console.log('  [5] VĨNH VIỄN (Lifetime - Khuyên Dùng)');
    console.log('  [6] Tùy chỉnh số ngày');
    
    choice = (await ask('\nNhập lựa chọn [1-6] (Mặc định 5): ')).trim() || '5';
  }

  let expiryStr = 'PERMANENT';
  let labelExpiry = 'Vĩnh viễn (LIFETIME)';

  const now = new Date();

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function formatDisplayDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
  }

  if (choice === '1') {
    const exp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expiryStr = formatDate(exp);
    labelExpiry = `30 Ngày (Hết hạn: ${formatDisplayDate(exp)})`;
  } else if (choice === '2') {
    const exp = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    expiryStr = formatDate(exp);
    labelExpiry = `90 Ngày (Hết hạn: ${formatDisplayDate(exp)})`;
  } else if (choice === '3') {
    const exp = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    expiryStr = formatDate(exp);
    labelExpiry = `180 Ngày (Hết hạn: ${formatDisplayDate(exp)})`;
  } else if (choice === '4') {
    const exp = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    expiryStr = formatDate(exp);
    labelExpiry = `1 Năm (Hết hạn: ${formatDisplayDate(exp)})`;
  } else if (choice === '6') {
    const customDays = parseInt(await ask('Nhập số ngày cấp phép: '), 10) || 30;
    const exp = new Date(now.getTime() + customDays * 24 * 60 * 60 * 1000);
    expiryStr = formatDate(exp);
    labelExpiry = `${customDays} Ngày (Hết hạn: ${formatDisplayDate(exp)})`;
  } else {
    expiryStr = 'PERMANENT';
    labelExpiry = 'Vĩnh viễn (LIFETIME)';
  }

  // 3. Sinh Key
  const licenseKey = licenseGuard.signLicenseKey(PRIVATE_KEY_PEM, hwid, expiryStr, 'PRO');

  // Tự kiểm tra: key vừa ký phải được khoá công khai trong app chấp nhận (phát hiện nhầm cặp khoá)
  const selfCheck = licenseGuard.verifyKey(licenseKey, hwid);
  if (!selfCheck.valid) {
    console.error(`\n[!] LỖI: Key vừa sinh KHÔNG được app chấp nhận (${selfCheck.reason}).\n` +
      '    private.pem không khớp với khoá công khai trong src/core/license-guard.js.\n');
    rl.close();
    return;
  }

  // 4. In thông tin sẵn sàng gửi khách
  const message = `
========================================================
🎉 THÔNG TIN BẢN QUYỀN KENZIOUS REEL STUDIO V2
--------------------------------------------------------
👤 Mã máy (HWID): ${hwid}
⏳ Thời hạn: ${labelExpiry}
🔑 KEY KÍCH HOẠT: ${licenseKey}
--------------------------------------------------------
👉 Hướng dẫn kích hoạt:
1. Mở phần mềm Kenzious Reel Studio v2
2. Dán mã KEY ở trên vào ô "Nhập mã kích hoạt"
3. Bấm nút "⚡ Kích hoạt ngay" để mở khóa toàn bộ tính năng!
========================================================
`;

  console.log(message);

  // Copy vào clipboard Windows nếu có clip.exe
  try {
    const { execSync } = require('child_process');
    execSync('clip', { input: message, encoding: 'utf8' });
    console.log('📋 ĐÃ TỰ ĐỘNG SAO CHÉP TOÀN BỘ NỘI DUNG VÀO CLIPBOARD!');
    console.log('👉 Bạn chỉ cần bấm Ctrl+V để gửi ngay cho khách hàng qua Zalo/Telegram.\n');
  } catch (_) {}

  rl.close();
}

main().catch(err => {
  console.error('Lỗi:', err.message);
  rl.close();
});
