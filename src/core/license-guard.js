/**
 * Kenzious Reel Studio v2 - License Guard (ONLINE)
 * Xác thực bản quyền qua server dùng chung với Kenzious Manager:
 *   GET https://virals.kenzious.com/api/license?key=<key>&deviceId=<HWID>
 *   -> { p, s, s2 }  (p = JSON license, s = base64(HMAC-SHA256(p, SECRET)))
 * App verify HMAC (chống response giả) + đọc p.success/expire. Server bind HWID theo deviceId,
 * kiểm hạn, và là nơi KILL-SWITCH (xoá/khoá key trong DB là máy khách hết chạy).
 *
 * license.dat chỉ lưu "bằng chứng" server đã cấp (p + s) + mốc online gần nhất. Có GRACE offline
 * để mạng chập chờn không brick; quá hạn grace mà không gọi được server -> yêu cầu online lại.
 *
 * (Giữ signLicenseKey Ed25519 cho scripts/keygen.js cũ; app KHÔNG còn verify offline nữa.)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');
const paths = require('./paths');

const API_URL = 'https://virals.kenzious.com/api/license';
const HMAC_SECRET = 'mYVvtx4eqXfGrGo+Bw9s6xu4FMrqdLSv4pTeb4WTII0=';
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;   // chạy offline tối đa 7 ngày giữa 2 lần xác thực
const RECHECK_MS = 6 * 60 * 60 * 1000;              // nền: cứ 6h xác thực lại server 1 lần
const STATUS_CACHE_MS = 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 36 * 60 * 60 * 1000;

// ---- Ed25519 (CHỈ còn cho scripts/keygen.js; app không dùng để verify nữa) ----
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function signLicenseKey(privateKeyPem, hwid, expiryStr = 'PERMANENT', type = 'PRO') {
  const cleanHwid = String(hwid || '').trim().toUpperCase();
  const cleanType = String(type || 'PRO').trim().toUpperCase();
  const cleanExpiry = String(expiryStr || 'PERMANENT').trim().toUpperCase();
  const msg = Buffer.from(`KZ2|${cleanHwid}|${cleanType}|${cleanExpiry}`, 'utf8');
  const sig = crypto.sign(null, msg, crypto.createPrivateKey(privateKeyPem));
  const sigGroups = base32Encode(sig).match(/.{1,8}/g).join('-');
  return `KZ2-${cleanType}-${cleanExpiry}-${sigGroups}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDisplay(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

class LicenseGuard {
  constructor() {
    this.dataDir = paths.getDataDir();
    this.licenseFile = path.join(this.dataDir, 'license.dat');
    this.cachedHWID = null;
    this.cachedStatus = null;
    this.cachedStatusAt = 0;
    this._refreshing = false;
  }

  getRawMachineGuid() {
    try {
      const stdout = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore']
      });
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/i);
      if (match && match[1]) return match[1].trim().toLowerCase();
    } catch (_) {}
    const cpus = os.cpus();
    const cpuModel = cpus && cpus[0] ? cpus[0].model : 'CPU_MODEL';
    return `${os.hostname().toLowerCase()}-${cpuModel}-${os.arch()}`;
  }

  getHWID() {
    if (this.cachedHWID) return this.cachedHWID;
    const rawGuid = this.getRawMachineGuid();
    const seed = `KZ_HWID_V2_${rawGuid}_SALT_METAKUDO`;
    const hash = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
    this.cachedHWID = `KZ-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
    return this.cachedHWID;
  }

  // ---- Gọi server + verify HMAC. Trả { net:true/false, data } ; data = JSON license (p đã parse). ----
  _serverCheck(key, hwid) {
    return new Promise((resolve) => {
      let u;
      try {
        u = new URL(API_URL);
        u.searchParams.set('key', key);
        u.searchParams.set('deviceId', hwid);
      } catch (_) { return resolve({ net: false }); }

      const req = https.get(u, { timeout: 15000, headers: { 'User-Agent': 'KenziousReel' } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
        res.on('end', () => {
          try {
            const env = JSON.parse(body);
            const p = typeof env.p === 'string' ? env.p : '';
            const s = typeof env.s === 'string' ? env.s : '';
            if (!p || !s) return resolve({ net: true, data: null, badSig: true });
            const expect = crypto.createHmac('sha256', HMAC_SECRET).update(p, 'utf8').digest('base64');
            if (expect !== s) return resolve({ net: true, data: null, badSig: true });
            const data = JSON.parse(p);
            resolve({ net: true, data, p, s });
          } catch (_) { resolve({ net: true, data: null, badSig: true }); }
        });
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve({ net: false }));
    });
  }

  _readLicenseFile() {
    const rawB64 = fs.readFileSync(this.licenseFile, 'utf-8').trim();
    return JSON.parse(Buffer.from(rawB64, 'base64').toString('utf-8'));
  }
  _writeLicenseFile(payload) {
    fs.writeFileSync(this.licenseFile, Buffer.from(JSON.stringify(payload)).toString('base64'), 'utf-8');
  }

  // Kích hoạt: BẮT BUỘC online. Server bind HWID + kiểm hạn.
  async activate(key) {
    const cleanKey = String(key || '').replace(/\s+/g, '');
    if (!cleanKey) return { success: false, message: 'Vui lòng nhập mã kích hoạt!' };
    const hwid = this.getHWID();

    const r = await this._serverCheck(cleanKey, hwid);
    if (!r.net) return { success: false, message: 'Không kết nối được máy chủ bản quyền. Kiểm tra mạng rồi thử lại.' };
    if (r.badSig || !r.data) return { success: false, message: 'Phản hồi máy chủ không hợp lệ. Thử lại sau giây lát.' };
    if (!r.data.success) return { success: false, message: r.data.message || 'Kích hoạt thất bại.' };

    const expire = String(r.data.expire || '');
    const now = Date.now();
    this._writeLicenseFile({
      key: cleanKey, hwid, note: r.data.note || cleanKey, expire,
      serverTs: Number(r.data.ts) || now, lastOnlineOk: now, activatedAt: now,
      p: r.p, s: r.s
    });
    this.cachedStatus = this._statusFromStored(this._readLicenseFile(), hwid);
    this.cachedStatusAt = now;

    const isLifetime = expire === '';
    return {
      success: true,
      message: isLifetime ? 'Kích hoạt thành công bản quyền VĨNH VIỄN!'
        : `Kích hoạt thành công! Hạn dùng đến ${fmtDisplay(expire)}.`,
      info: this.cachedStatus
    };
  }

  // Dựng status từ license.dat đã lưu (verify HMAC local chống sửa tay + kiểm hạn + grace offline).
  _statusFromStored(data, hwid) {
    try {
      // 1) Bằng chứng phải khớp HMAC (license.dat không thể bịa).
      const expect = crypto.createHmac('sha256', HMAC_SECRET).update(String(data.p || ''), 'utf8').digest('base64');
      if (!data.p || expect !== data.s) return { activated: false, hwid, message: 'Dữ liệu bản quyền không hợp lệ!' };
      const p = JSON.parse(data.p);
      if (!p.success) return { activated: false, hwid, message: p.message || 'Bản quyền không hợp lệ!' };
      // 2) Đúng máy đã bind.
      if (String(p.deviceId || '') !== hwid) return { activated: false, hwid, message: 'Mã kích hoạt thuộc máy khác!' };

      const now = Date.now();
      // 3) Chống lùi đồng hồ để né hạn / né grace.
      const lastSeen = Number(data.lastOnlineOk) || 0;
      if (lastSeen && now + CLOCK_ROLLBACK_TOLERANCE_MS < lastSeen) {
        return { activated: false, hwid, message: 'Đồng hồ hệ thống bị lùi. Vui lòng chỉnh lại ngày giờ máy tính.' };
      }
      // 4) Hết hạn (so với ngày hôm nay — chặn kể cả offline).
      const expire = String(data.expire || '');
      if (expire && todayStr() > expire) {
        return { activated: false, hwid, message: `Bản quyền đã hết hạn ngày ${fmtDisplay(expire)}. Vui lòng gia hạn.` };
      }
      // 5) Grace offline: quá lâu không xác thực được server -> buộc online lại.
      if (lastSeen && now - lastSeen > OFFLINE_GRACE_MS) {
        return { activated: false, hwid, message: 'Cần kết nối mạng để xác thực lại bản quyền.' };
      }

      const isLifetime = expire === '';
      let daysLeft = 99999;
      if (!isLifetime) {
        const exp = new Date(expire + 'T23:59:59');
        daysLeft = Math.max(0, Math.ceil((exp.getTime() - now) / 86400000));
      }
      return {
        activated: true, hwid, key: data.key, note: data.note,
        expiresAt: isLifetime ? 'Vĩnh viễn (Lifetime)' : fmtDisplay(expire),
        isLifetime, daysLeft, activatedAt: data.activatedAt
      };
    } catch (_) {
      return { activated: false, hwid, message: 'Dữ liệu bản quyền bị lỗi!' };
    }
  }

  // Nền: xác thực lại server. Thành công -> gia hạn mốc online. Server từ chối rõ ràng -> KILL (xoá license.dat).
  async _refresh() {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      if (!fs.existsSync(this.licenseFile)) return;
      const data = this._readLicenseFile();
      const hwid = this.getHWID();
      const r = await this._serverCheck(data.key, hwid);
      if (!r.net || r.badSig || !r.data) return; // offline/nghẽn -> để grace lo
      const now = Date.now();
      if (r.data.success) {
        this._writeLicenseFile({ ...data, expire: String(r.data.expire || ''), serverTs: Number(r.data.ts) || now, lastOnlineOk: now, p: r.p, s: r.s });
      } else if (!/máy chủ/i.test(String(r.data.message || ''))) {
        // Từ chối THẬT (key bị xoá/khoá/hết hạn/sai máy) -> gỡ bản quyền ngay.
        // "Lỗi máy chủ" (DB hiccup tạm thời) KHÔNG xoá — để grace lo, tránh khoá oan hàng loạt.
        try { fs.unlinkSync(this.licenseFile); } catch (_) {}
      }
      this.cachedStatus = null; this.cachedStatusAt = 0;
    } catch (_) {} finally { this._refreshing = false; }
  }

  getLicenseStatus() {
    const hwid = this.getHWID();
    this.cachedStatusAt = Date.now();
    if (!fs.existsSync(this.licenseFile)) {
      this.cachedStatus = { activated: false, hwid, message: 'Phần mềm chưa được kích hoạt bản quyền!' };
      return this.cachedStatus;
    }
    let data;
    try { data = this._readLicenseFile(); }
    catch (_) { this.cachedStatus = { activated: false, hwid, message: 'Dữ liệu bản quyền bị lỗi!' }; return this.cachedStatus; }

    this.cachedStatus = this._statusFromStored(data, hwid);

    // Xác thực lại server ở nền nếu đã quá hạn re-check (không chặn UI).
    const lastSeen = Number(data.lastOnlineOk) || 0;
    if (Date.now() - lastSeen > RECHECK_MS) { this._refresh(); }
    return this.cachedStatus;
  }

  isActivated() {
    if (!this.cachedStatus || Date.now() - this.cachedStatusAt > STATUS_CACHE_MS) {
      this.getLicenseStatus();
    }
    return !!(this.cachedStatus && this.cachedStatus.activated);
  }

  deactivate() {
    try {
      if (fs.existsSync(this.licenseFile)) fs.unlinkSync(this.licenseFile);
      this.cachedStatus = null; this.cachedStatusAt = 0;
      return { success: true };
    } catch (err) { return { success: false, message: err.message }; }
  }
}

module.exports = new LicenseGuard();
module.exports.signLicenseKey = signLicenseKey;
