const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

class DouyinScraper {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  }

  getExecutablePath() {
    // 0. Uu tien Chromium noi bo cua Boss Kudo tai Kenzious Reel V2/Chromium
    const localChromium = require('./paths').resourcePath('Chromium', 'bin', 'chrome.exe');
    if (fs.existsSync(localChromium)) return localChromium;

    const localAppData = process.env.LOCALAPPDATA || '';
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    for (const p of chromePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // 1. Phân giải link rút gọn (v.douyin.com)
  async resolveDouyinUrl(shortUrl) {
    try {
      const res = await fetch(shortUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': this.userAgent
        }
      });
      return res.url || shortUrl;
    } catch {
      return shortUrl;
    }
  }

  extractAwemeId(url) {
    const m = url.match(/\/video\/(\d+)/) || url.match(/modal_id=(\d+)/) || url.match(/\/note\/(\d+)/);
    return m ? m[1] : null;
  }

  // Chuyển link có logo (playwm) thành link sạch không logo (play)
  cleanPlayUrl(rawUrl) {
    if (!rawUrl) return '';
    return rawUrl.replace(/playwm/g, 'play');
  }

  // 2. Playwright/Puppeteer Response Tapping Engine
  async probeDouyinVideo(inputUrl) {
    const canonicalUrl = await this.resolveDouyinUrl(inputUrl);
    const videoId = this.extractAwemeId(canonicalUrl);

    // Chiến lược 1: Thử cào nhanh qua SSR JSON của Douyin Mobile / Web
    if (videoId) {
      try {
        const apiRes = await fetch(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`, {
          headers: {
            'User-Agent': this.userAgent,
            'Referer': 'https://www.douyin.com/',
            'Accept': 'application/json'
          }
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json.aweme_detail) {
            return this.formatAwemeDetail(json.aweme_detail, canonicalUrl);
          }
        }
      } catch (e) {}
    }

    // Chiến lược 2: Playwright / Puppeteer Response Tapping
    const execPath = this.getExecutablePath();
    if (!execPath) throw new Error('Không tìm thấy trình duyệt Chrome/Edge trên máy để chạy Response Tapping.');

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--lang=zh-CN,zh'
      ]
    });

    let tappedData = null;

    try {
      const page = await browser.newPage();
      await page.setUserAgent(this.userAgent);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.douyin.com/'
      });

      // Lắng nghe Response Tapping các API của Douyin
      page.on('response', async (res) => {
        const u = res.url();
        if (u.includes('/web/aweme/detail/') || u.includes('/web/aweme/post/') || u.includes('/aweme/v1/web/aweme/detail/')) {
          try {
            const data = await res.json();
            if (data.aweme_detail) {
              tappedData = data.aweme_detail;
            } else if (data.aweme_list && data.aweme_list.length > 0) {
              tappedData = data.aweme_list[0];
            }
          } catch {}
        }
      });

      await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});

      // Chờ tối đa 8 giây để Response Tapping bắt được gói tin JSON
      for (let i = 0; i < 16; i++) {
        if (tappedData) break;
        await new Promise(r => setTimeout(r, 500));
      }

      // Nếu Response Tapping chưa bắt được, fallback đọc biến Router trên DOM
      if (!tappedData) {
        tappedData = await page.evaluate(() => {
          try {
            const renderData = document.querySelector('#RENDER_DATA');
            if (renderData && renderData.textContent) {
              const decoded = decodeURIComponent(renderData.textContent);
              const json = JSON.parse(decoded);
              return json.app?.videoDetail || null;
            }
          } catch {}
          return null;
        }).catch(() => null);
      }
    } finally {
      await browser.close().catch(() => {});
    }

    if (!tappedData) {
      throw new Error(`Không thể trích xuất video Douyin từ link: ${inputUrl}. Có thể video bị riêng tư hoặc Douyin yêu cầu captcha.`);
    }

    return this.formatAwemeDetail(tappedData, canonicalUrl);
  }

  formatAwemeDetail(aweme, originalUrl) {
    const video = aweme.video || {};
    const playList = video.play_addr?.url_list || video.play_addr_h264?.url_list || [];
    let cleanPlayUrl = '';

    for (const u of playList) {
      if (u) {
        cleanPlayUrl = this.cleanPlayUrl(u);
        break;
      }
    }

    const stats = aweme.statistics || {};
    const author = aweme.author || {};

    return {
      id: aweme.aweme_id || aweme.id,
      title: aweme.desc || 'Video Douyin không tiêu đề',
      desc: aweme.desc || '',
      duration: Math.round((video.duration || 0) / 1000),
      playUrl: cleanPlayUrl,
      coverUrl: video.cover?.url_list?.[0] || '',
      originalUrl,
      stats: {
        likes: stats.digg_count || 0,
        comments: stats.comment_count || 0,
        shares: stats.share_count || 0,
        collects: stats.collect_count || 0
      },
      author: {
        nickname: author.nickname || 'Douyin Creator',
        uid: author.unique_id || author.short_id || author.uid || '',
        avatar: author.avatar_thumb?.url_list?.[0] || ''
      }
    };
  }

  // 3. Tải video Douyin không logo về thư mục
  async downloadDouyinVideo(inputUrl, outputDir = '', onProgress = () => {}) {
    onProgress({ phase: 'probing', message: 'Đang phân tích link Douyin & Response Tapping...' });
    const metadata = await this.probeDouyinVideo(inputUrl);

    if (!metadata.playUrl) {
      throw new Error('Không tìm thấy link stream video sạch không logo!');
    }

    const destDir = outputDir || require('./paths').getDefaultOutputDir();
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const safeAuthor = (metadata.author.nickname || 'douyin').replace(/[\\/:*?"<>|]/g, '_');
    const safeTitle = (metadata.title || metadata.id).slice(0, 40).replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${safeAuthor}_${metadata.id}_clean.mp4`;
    const outputPath = path.join(destDir, fileName);

    onProgress({ phase: 'downloading', message: `Bắt đầu tải video không logo: ${fileName}...`, percent: 5 });

    const res = await fetch(metadata.playUrl, {
      headers: {
        'User-Agent': this.userAgent,
        'Referer': 'https://www.douyin.com/'
      }
    });

    if (!res.ok) {
      throw new Error(`Tải video Douyin thất bại (HTTP ${res.status})`);
    }

    const totalBytes = Number(res.headers.get('content-length')) || 0;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(outputPath, buffer);

    onProgress({ phase: 'completed', percent: 100, message: 'Đã tải xong video Douyin không watermark!' });

    return {
      success: true,
      filePath: outputPath,
      fileName,
      fileSize: buffer.length,
      metadata
    };
  }
}

module.exports = new DouyinScraper();
