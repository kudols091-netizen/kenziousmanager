/**
 * Kenzious Reel Studio v2 - License Guard & HWID Security Engine
 * Offline Machine-Locked Licensing (chữ ký Ed25519)
 * Developed exclusively for Boss Kudo & Kenzious Team
 *
 * App CHỈ chứa khoá CÔNG KHAI → chỉ kiểm tra được chữ ký, không thể tự sinh key.
 * Khoá BÍ MẬT nằm ngoài repo/app (mặc định %USERPROFILE%\.kenzious-license\private.pem),
 * chỉ scripts/keygen.js dùng tới. Mất khoá bí mật = không cấp được key cho các bản đã phát hành.
 *
 * Định dạng key: KZ2-<TYPE>-<EXPIRY>-<CHỮ KÝ BASE32, nhóm 8 ký tự>
 *   Chữ ký Ed25519 trên chuỗi "KZ2|<HWID>|<TYPE>|<EXPIRY>"; EXPIRY = PERMANENT hoặc YYYYMMDD.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const paths = require('./paths');

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAl9+8fO4edBXZ0LssVrOdtUOlHapTxKTrc0vGxEiACSM=
-----END PUBLIC KEY-----`;

const KEY_PREFIX = 'KZ2';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Cho phép đồng hồ lệch/đổi múi giờ; lùi quá mức này so với lần chạy trước = nghi chỉnh giờ để né hạn
const CLOCK_ROLLBACK_TOLERANCE_MS = 36 * 60 * 60 * 1000;
const STATUS_CACHE_MS = 60 * 1000;

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function signedMessage(hwid, type, expiryStr) {
  return Buffer.from(`${KEY_PREFIX}|${hwid}|${type}|${expiryStr}`, 'utf8');
}

/**
 * Sinh key từ khoá bí mật — CHỈ dùng trong scripts/keygen.js (app không có khoá bí mật).
 */
function signLicenseKey(privateKeyPem, hwid, expiryStr = 'PERMANENT', type = 'PRO') {
  const cleanHwid = String(hwid || '').trim().toUpperCase();
  const cleanType = String(type || 'PRO').trim().toUpperCase();
  const cleanExpiry = String(expiryStr || 'PERMANENT').trim().toUpperCase();
  const sig = crypto.sign(null, signedMessage(cleanHwid, cleanType, cleanExpiry), crypto.createPrivateKey(privateKeyPem));
  const sigGroups = base32Encode(sig).match(/.{1,8}/g).join('-');
  return `${KEY_PREFIX}-${cleanType}-${cleanExpiry}-${sigGroups}`;
}

class LicenseGuard {
  constructor() {
    this.dataDir = paths.getDataDir();
    this.licenseFile = path.join(this.dataDir, 'license.dat');
    this.cachedHWID = null;
    this.cachedStatus = null;
    this.cachedStatusAt = 0;
    this.publicKey = null;
  }

  getPublicKey() {
    if (!this.publicKey) this.publicKey = crypto.createPublicKey(LICENSE_PUBLIC_KEY_PEM);
    return this.publicKey;
  }

  /**
   * Lấy MachineGuid từ Windows Registry (cực nhanh, không cần quyền Admin)
   */
  getRawMachineGuid() {
    try {
      const stdout = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/i);
      if (match && match[1]) return match[1].trim().toLowerCase();
    } catch (_) {}

    // Fallback: CPU info + Hostname
    const cpus = os.cpus();
    const cpuModel = cpus && cpus[0] ? cpus[0].model : 'CPU_MODEL';
    return `${os.hostname().toLowerCase()}-${cpuModel}-${os.arch()}`;
  }

  /**
   * Tạo mã định danh phần cứng duy nhất (HWID) — giữ nguyên cách tính để khách cũ không đổi mã máy.
   * Định dạng chuẩn: KZ-XXXX-XXXX-XXXX-XXXX
   */
  getHWID() {
    if (this.cachedHWID) return this.cachedHWID;

    const rawGuid = this.getRawMachineGuid();
    const seed = `KZ_HWID_V2_${rawGuid}_SALT_METAKUDO`;
    const hash = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();

    this.cachedHWID = `KZ-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
    return this.cachedHWID;
  }

  /**
   * Kiểm tra tính hợp lệ của Key nhập vào
   */
  verifyKey(key, targetHwid = null) {
    if (!key || typeof key !== 'string') {
      return { valid: false, reason: 'Mã kích hoạt không đúng định dạng!' };
    }

    const cleanKey = key.replace(/\s+/g, '').toUpperCase();
    const currentHwid = (targetHwid || this.getHWID()).toUpperCase();

    if (/^KZ-[A-Z0-9]+-[A-Z0-9]+-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(cleanKey)) {
      return { valid: false, reason: 'Đây là mã kích hoạt kiểu cũ, không còn được hỗ trợ. Vui lòng gửi mã máy (HWID) cho Admin để nhận key mới (bắt đầu bằng KZ2-).' };
    }

    const match = cleanKey.match(/^KZ2-([A-Z0-9]+)-([A-Z0-9]+)-([A-Z2-7-]+)$/);
    if (!match) {
      return { valid: false, reason: 'Cú pháp mã kích hoạt không đúng chuẩn Kenzious!' };
    }

    const type = match[1];
    const expiryStr = match[2];
    const sigText = match[3].replace(/-/g, '');
    const sig = base32Decode(sigText);

    let sigOk = false;
    try {
      // Chỉ nhận dạng mã hoá chuẩn (ký tự cuối base32 có bit đệm — không cho nhiều chuỗi khác nhau cùng hợp lệ)
      sigOk = !!sig && sig.length === 64 && base32Encode(sig) === sigText && crypto.verify(null, signedMessage(currentHwid, type, expiryStr), this.getPublicKey(), sig);
    } catch (_) {
      sigOk = false;
    }
    if (!sigOk) {
      return {
        valid: false,
        reason: 'Mã kích hoạt không khớp với mã máy (HWID) này! Mỗi mã chỉ dùng cho 1 máy tính.'
      };
    }

    // Kiểm tra hạn sử dụng
    let isLifetime = false;
    let expiresAtFormatted = 'Vĩnh viễn (Lifetime)';
    let daysLeft = 99999;

    if (expiryStr === 'PERMANENT' || expiryStr === 'LIFETIME') {
      isLifetime = true;
    } else {
      // Định dạng YYYYMMDD
      if (!/^\d{8}$/.test(expiryStr)) {
        return { valid: false, reason: 'Thời hạn bản quyền trong key không hợp lệ!' };
      }
      const year = parseInt(expiryStr.substring(0, 4), 10);
      const month = parseInt(expiryStr.substring(4, 6), 10) - 1;
      const day = parseInt(expiryStr.substring(6, 8), 10);
      const expDate = new Date(year, month, day, 23, 59, 59);

      if (isNaN(expDate.getTime())) {
        return { valid: false, reason: 'Thời hạn bản quyền trong key không hợp lệ!' };
      }

      const now = new Date();
      if (now > expDate) {
        return {
          valid: false,
          reason: `Bản quyền đã hết hạn vào ngày ${day}/${month + 1}/${year}! Vui lòng gia hạn để tiếp tục sử dụng.`
        };
      }

      const diffTime = expDate.getTime() - now.getTime();
      daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      expiresAtFormatted = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    }

    return {
      valid: true,
      hwid: currentHwid,
      type,
      expiryStr,
      expiresAt: expiresAtFormatted,
      daysLeft,
      isLifetime
    };
  }

  _readLicenseFile() {
    const rawB64 = fs.readFileSync(this.licenseFile, 'utf-8').trim();
    return JSON.parse(Buffer.from(rawB64, 'base64').toString('utf-8'));
  }

  _writeLicenseFile(payload) {
    fs.writeFileSync(this.licenseFile, Buffer.from(JSON.stringify(payload)).toString('base64'), 'utf-8');
  }

  /**
   * Kích hoạt bản quyền và lưu vào file
   */
  activate(key) {
    const check = this.verifyKey(key);
    if (!check.valid) {
      return { success: false, message: check.reason };
    }

    try {
      const now = Date.now();
      this._writeLicenseFile({
        key: key.replace(/\s+/g, '').toUpperCase(),
        hwid: check.hwid,
        type: check.type,
        expiryStr: check.expiryStr,
        expiresAt: check.expiresAt,
        activatedAt: now,
        lastSeen: now
      });

      this.cachedStatus = { activated: true, ...check };
      this.cachedStatusAt = now;

      return {
        success: true,
        message: check.isLifetime
          ? 'Kích hoạt thành công bản quyền VĨNH VIỄN!'
          : `Kích hoạt thành công! Hạn dùng đến ngày ${check.expiresAt} (Còn ${check.daysLeft} ngày).`,
        info: this.cachedStatus
      };
    } catch (err) {
      return { success: false, message: 'Lỗi lưu bản quyền: ' + err.message };
    }
  }

  /**
   * Lấy thông tin trạng thái bản quyền hiện tại
   */
  getLicenseStatus() {
    const hwid = this.getHWID();
    this.cachedStatusAt = Date.now();

    if (!fs.existsSync(this.licenseFile)) {
      this.cachedStatus = { activated: false, hwid, message: 'Phần mềm chưa được kích hoạt bản quyền!' };
      return this.cachedStatus;
    }

    try {
      const data = this._readLicenseFile();

      const check = this.verifyKey(data.key, hwid);
      if (!check.valid) {
        this.cachedStatus = { activated: false, hwid, message: check.reason };
        return this.cachedStatus;
      }

      // Key có hạn: chống lùi đồng hồ hệ thống để kéo dài hạn dùng
      const now = Date.now();
      const lastSeen = Number(data.lastSeen) || 0;
      if (!check.isLifetime && lastSeen && now + CLOCK_ROLLBACK_TOLERANCE_MS < lastSeen) {
        this.cachedStatus = {
          activated: false,
          hwid,
          message: 'Thời gian hệ thống bất thường (đồng hồ bị lùi). Vui lòng chỉnh lại ngày giờ máy tính cho đúng.'
        };
        return this.cachedStatus;
      }
      if (now > lastSeen + 60 * 60 * 1000) {
        try { this._writeLicenseFile({ ...data, lastSeen: now }); } catch (_) {}
      }

      this.cachedStatus = {
        activated: true,
        hwid,
        key: data.key,
        type: check.type,
        expiresAt: check.expiresAt,
        daysLeft: check.daysLeft,
        isLifetime: check.isLifetime,
        activatedAt: data.activatedAt
      };

      return this.cachedStatus;
    } catch (err) {
      this.cachedStatus = { activated: false, hwid, message: 'Dữ liệu bản quyền bị lỗi hoặc không hợp lệ!' };
      return this.cachedStatus;
    }
  }

  /**
   * Dùng cho kiểm tra ở main process trước mỗi IPC (có cache ngắn để không đọc file liên tục)
   */
  isActivated() {
    if (!this.cachedStatus || Date.now() - this.cachedStatusAt > STATUS_CACHE_MS) {
      this.getLicenseStatus();
    }
    return !!(this.cachedStatus && this.cachedStatus.activated);
  }

  /**
   * Hủy kích hoạt (Xóa key trên máy)
   */
  deactivate() {
    try {
      if (fs.existsSync(this.licenseFile)) {
        fs.unlinkSync(this.licenseFile);
      }
      this.cachedStatus = null;
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = new LicenseGuard();
module.exports.signLicenseKey = signLicenseKey;
