/**
 * Kenzious Get Cookie - Clone Post Modal
 * Renders the clean-room Kenzious Clone Post modal for editing, downloading, and reposting.
 */

window.ClonePostModal = {
  currentData: null,

  open(postData) {
    this.currentData = postData || {
      caption: '',
      images: [],
      videos: [],
      author: 'Facebook User',
      postUrl: window.location.href
    };

    let modal = document.getElementById('kz-clone-post-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'kz-clone-post-modal';
      modal.className = 'kz-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="kz-modal-container">
        <div class="kz-modal-header">
          <div class="kz-modal-title">
            <span>✨ Clone Bài Viết Facebook</span>
            <span class="kz-brand-badge">KENZIOUS</span>
          </div>
          <button class="kz-modal-close-btn" id="kz-clone-close">&times;</button>
        </div>

        <div class="kz-modal-body">
          <div class="kz-field-group">
            <label class="kz-field-label">Tác giả gốc:</label>
            <div style="font-size:12px;color:#FAC0FA;margin-bottom:6px;">
              👤 <b>${this.escapeHtml(this.currentData.author)}</b> 
              <span style="color:#94A3B8;margin-left:8px;">(<a href="${this.escapeHtml(this.currentData.postUrl)}" target="_blank" style="color:#9950FA;text-decoration:none;">Xem bài gốc</a>)</span>
            </div>
          </div>

          <div class="kz-field-group">
            <label class="kz-field-label">Nội dung Caption (Có thể chỉnh sửa lại):</label>
            <textarea class="kz-field-textarea" id="kz-clone-caption">${this.escapeHtml(this.currentData.caption)}</textarea>
          </div>

          <div class="kz-field-group">
            <label class="kz-field-label">Media phát hiện (${this.currentData.images.length} ảnh, ${this.currentData.videos.length} video):</label>
            <div class="kz-media-preview-container" id="kz-clone-media-list">
              ${this.renderMediaPreviews()}
            </div>
          </div>

          <div class="kz-field-group">
            <label class="kz-field-label">Mục tiêu Re-up:</label>
            <select class="kz-field-input" id="kz-repost-target" style="padding:8px 10px;">
              <option value="profile">Đăng lên Trang cá nhân (Profile)</option>
              <option value="fanpage">Đăng lên Fanpage sở hữu</option>
              <option value="group">Đăng vào Group quản trị</option>
            </select>
          </div>
        </div>

        <div class="kz-modal-footer">
          <button class="kz-btn kz-btn-secondary" id="kz-btn-download-media">
            📥 Tải Tất Cả Media
          </button>
          <button class="kz-btn kz-btn-secondary" id="kz-btn-copy-clone">
            📋 Copy Nội Dung & Link
          </button>
          <button class="kz-btn kz-btn-primary" id="kz-btn-confirm-repost">
            🚀 Tiến Hành Đăng Bài
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    this.bindEvents(modal);
  },

  renderMediaPreviews() {
    let html = '';
    this.currentData.images.forEach((imgUrl, i) => {
      html += `
        <div class="kz-media-item" title="Ảnh ${i + 1}">
          <img src="${this.escapeHtml(imgUrl)}" alt="Preview">
        </div>
      `;
    });

    this.currentData.videos.forEach((vidUrl, i) => {
      html += `
        <div class="kz-media-item" title="Video ${i + 1}">
          <video src="${this.escapeHtml(vidUrl)}"></video>
          <span style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.7);font-size:9px;padding:1px 4px;border-radius:3px;">MP4</span>
        </div>
      `;
    });

    if (!html) {
      html = '<div style="color:#64748B;font-size:11.5px;padding:10px;">Bài viết dạng văn bản thuần (Không kèm ảnh/video).</div>';
    }

    return html;
  },

  bindEvents(modal) {
    // Close
    const closeBtn = modal.querySelector('#kz-clone-close');
    closeBtn.onclick = () => { modal.style.display = 'none'; };

    // Download media
    const btnDownload = modal.querySelector('#kz-btn-download-media');
    btnDownload.onclick = () => {
      const allUrls = [...this.currentData.images, ...this.currentData.videos];
      if (allUrls.length === 0) {
        alert('Bài viết không có file media để tải!');
        return;
      }

      allUrls.forEach((url, idx) => {
        const ext = url.includes('.mp4') ? 'mp4' : 'jpg';
        const a = document.createElement('a');
        a.href = url;
        a.download = `kenzious_clone_${Date.now()}_${idx + 1}.${ext}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 200);
      });
    };

    // Copy Content
    const btnCopy = modal.querySelector('#kz-btn-copy-clone');
    btnCopy.onclick = () => {
      const caption = modal.querySelector('#kz-clone-caption').value;
      const mediaUrls = [...this.currentData.images, ...this.currentData.videos].join('\n');
      const textToCopy = `${caption}\n\n--- Media Links ---\n${mediaUrls}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert('Đã sao chép nội dung & link media vào Clipboard!');
      });
    };

    // Confirm Repost
    const btnRepost = modal.querySelector('#kz-btn-confirm-repost');
    btnRepost.onclick = () => {
      const target = modal.querySelector('#kz-repost-target').value;
      alert(`Đã chuẩn bị nội dung để đăng lên [${target}]. Bạn có thể dán vào khung đăng bài Facebook ngay bây giờ!`);
      modal.style.display = 'none';
    };
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m]);
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_CLONE_POST_MODAL') {
    window.ClonePostModal.open();
    sendResponse({ success: true });
    return true;
  }
});
