/**
 * Clean-Room Profile & Browser Manager (Playwright Engine)
 * Manages profile directory locks, zombie processes, proxies, and launch context.
 */

const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * Lệnh PowerShell (base64 UTF-16LE cho -EncodedCommand) dừng chrome/msedge đang giữ đúng profile này.
 * Tên thư mục được truyền dưới dạng chuỗi PowerShell nháy đơn + [regex]::Escape nên không thể chèn lệnh,
 * và so khớp nguyên tên thư mục (acc_1 không dính acc_12).
 */
function buildKillProfileProcessesCmd(profileDir) {
  const folderName = path.basename(profileDir).replace(/'/g, "''");
  const ps = [
    `$name = '${folderName}'`,
    `$pattern = '[\\\\/]' + [regex]::Escape($name) + '(["\\s]|$)'`,
    `Get-CimInstance Win32_Process -Filter "name = 'chrome.exe' or name = 'msedge.exe'" |`,
    `  Where-Object { $_.CommandLine -and $_.CommandLine -match $pattern } |`,
    `  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  ].join('\n');
  return Buffer.from(ps, 'utf16le').toString('base64');
}

class ProfileManager {
  /**
   * Find available Chrome or Edge installation
   */
  getExecutablePath() {
    // 0. Ưu tiên Chromium nội bộ của Boss Kudo tại Kenzious Reel V2/Chromium
    const localChromium = require('../paths').resourcePath('Chromium', 'bin', 'chrome.exe');
    if (fs.existsSync(localChromium)) return localChromium;

    const localAppData = process.env.LOCALAPPDATA || '';
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    for (const p of chromePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Unlock profile dir by killing zombie browser instances and deleting SingletonLock
   */
  unlockProfile(profileDir) {
    if (!profileDir || !fs.existsSync(profileDir)) return;

    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];

    // 1. Remove existing lock files
    for (const lockName of lockFiles) {
      const lockPath = path.join(profileDir, lockName);
      try {
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      } catch (_) {}
    }

    // 2. Terminate zombie chrome/edge processes tied to this profile dir (Windows 10/11 Compatible)
    try {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', buildKillProfileProcessesCmd(profileDir)], {
        timeout: 5000,
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (_) {}

    // 3. Clean lock files again after kill
    for (const lockName of lockFiles) {
      const lockPath = path.join(profileDir, lockName);
      try {
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      } catch (_) {}
    }
  }

  /**
   * Launch a persistent Playwright browser context
   */
  async launchBrowser(profileDir, options = {}) {
    const execPath = this.getExecutablePath();
    if (!execPath) throw new Error('Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy');

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    this.unlockProfile(profileDir);

    const args = [
      '--no-sandbox',
      '--disable-notifications',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--lang=vi-VN,vi,en-US,en'
    ];

    const launchOptions = {
      executablePath: execPath,
      headless: options.headless !== undefined ? options.headless : false,
      args,
      viewport: null,
      ignoreDefaultArgs: ['--enable-automation']
    };

    // Có proxy → truyền đủ server + user/pass (trước đây chỉ có server nên proxy có mật khẩu bị 407 hoặc sai định dạng)
    const proxy = require('../proxy-net').toPlaywrightProxy(options.proxy);
    if (proxy) launchOptions.proxy = proxy;

    const context = await chromium.launchPersistentContext(profileDir, launchOptions);
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    return { context, page };
  }
}

module.exports = new ProfileManager();
