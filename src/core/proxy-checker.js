/**
 * Kenzious Reel V2 - Proxy Health Checker
 *
 * Gửi request thật qua proxy (HTTP CONNECT hoặc SOCKS4/5, có user/pass) tới api.ipify.org.
 * Chỉ coi là OK khi nhận HTTP 200 với một địa chỉ IP hợp lệ — trang captive portal, 3xx,
 * 407, 502… đều là lỗi. Cảnh báo nếu IP ra ngoài vẫn trùng IP máy.
 */

const net = require('net');
const proxyNet = require('./proxy-net');

const PROXY_PROBE_TIMEOUT_MS = 25000;
const IPIFY_URL = 'https://api.ipify.org?format=json';

function parseIpResponse(res) {
  if (!res || res.status !== 200) return null;
  try {
    const ip = JSON.parse(res.body.toString('utf8')).ip;
    return net.isIP(String(ip || '')) ? String(ip) : null;
  } catch (_) {
    return null;
  }
}

async function fetchDirectIp(timeoutMs = 8000) {
  try {
    return parseIpResponse(await proxyNet.request(IPIFY_URL, { timeoutMs, maxRedirects: 0 }));
  } catch (_) {
    return null;
  }
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err);
  if (/ECONNREFUSED/.test(msg)) return 'Không thể kết nối tới Proxy (Connection Refused)';
  if (/ETIMEDOUT|Hết thời gian chờ/.test(msg)) return 'Proxy không phản hồi (timeout)';
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Không tìm thấy host proxy (DNS Error)';
  if (/407|xác thực|authentication/i.test(msg)) return 'Proxy từ chối xác thực (sai user/pass)';
  if (/Socks5 Authentication failed|authentication failed/i.test(msg)) return 'Proxy SOCKS từ chối user/pass';
  return msg.replace(/^Lỗi proxy [^:]+: /, '');
}

async function checkProxyHealth(rawProxy, timeoutMs = PROXY_PROBE_TIMEOUT_MS) {
  const parsed = proxyNet.parseProxy(rawProxy);
  if (!parsed) {
    return { ok: false, message: 'Định dạng Proxy không hợp lệ (hỗ trợ host:port, host:port:user:pass, user:pass@host:port, socks5://…)' };
  }

  const startTime = Date.now();
  try {
    const [directIp, res] = await Promise.all([
      fetchDirectIp(Math.min(8000, timeoutMs)),
      proxyNet.request(IPIFY_URL, { proxy: parsed, timeoutMs, maxRedirects: 0 })
    ]);
    const latencyMs = Date.now() - startTime;
    const ip = parseIpResponse(res);

    if (!ip) {
      const why = res.status === 200 ? 'nội dung trả về không phải IP' : `mã HTTP ${res.status}`;
      return { ok: false, latencyMs, statusCode: res.status, message: `Proxy không chuyển tiếp đúng (${why})` };
    }

    if (directIp && directIp === ip) {
      return {
        ok: true,
        ip,
        latencyMs,
        warning: true,
        message: `Proxy kết nối được nhưng không đổi IP (vẫn IP gốc ${ip})`
      };
    }

    return { ok: true, ip, latencyMs, message: `Kết nối OK · IP ${ip} (${latencyMs}ms)` };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - startTime, message: friendlyError(err) };
  }
}

module.exports = {
  PROXY_PROBE_TIMEOUT_MS,
  parseProxyString: proxyNet.parseProxy,
  checkProxyHealth
};
