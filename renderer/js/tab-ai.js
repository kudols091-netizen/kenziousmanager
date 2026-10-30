// Tab 3: AI Voice & Subtitles & Toolkit Controller (Clean-Room Engine)

document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedAiSettings();
  initAiStudio();
});

async function loadSavedAiSettings() {
  if (!window.api || !window.api.getSettings) return;
  try {
    const s = await window.api.getSettings();
    if (!s) return;

    // Load TTS Settings
    const selectEngine = document.getElementById('selectVoiceEngine');
    const voiceSelect = document.getElementById('aiVoiceSelector');
    const speedRange = document.getElementById('voiceSpeedRange');
    const speedVal = document.getElementById('voiceSpeedVal');
    const pitchRange = document.getElementById('voicePitchRange');
    const pitchVal = document.getElementById('voicePitchVal');
    const duckingRange = document.getElementById('duckingVolumeRange');
    const duckingVal = document.getElementById('duckingVolumeVal');

    if (s.ttsEngine && selectEngine) selectEngine.value = s.ttsEngine;
    if (s.ttsVoice && voiceSelect) voiceSelect.value = s.ttsVoice;
    if (s.ttsSpeed !== undefined && speedRange && speedVal) {
      speedRange.value = s.ttsSpeed;
      const num = parseInt(s.ttsSpeed, 10) || 0;
      speedVal.innerText = num >= 0 ? `+${num}%` : `${num}%`;
    }
    if (s.ttsPitch !== undefined && pitchRange && pitchVal) {
      pitchRange.value = s.ttsPitch;
      const num = parseInt(s.ttsPitch, 10) || 0;
      pitchVal.innerText = num >= 0 ? `+${num}Hz` : `${num}Hz`;
    }
    if (s.duckingVolume !== undefined && duckingRange && duckingVal) {
      duckingRange.value = s.duckingVolume;
      duckingVal.innerText = `${s.duckingVolume}%`;
    }

    // Load Subtitle Config
    const subFontSize = document.getElementById('subFontSize');
    const subPrimaryColor = document.getElementById('subPrimaryColor');
    const subHighlightColor = document.getElementById('subHighlightColor');

    if (s.subtitleConfig) {
      if (s.subtitleConfig.fontSize && subFontSize) subFontSize.value = s.subtitleConfig.fontSize;
      if (s.subtitleConfig.primaryColor && subPrimaryColor) subPrimaryColor.value = s.subtitleConfig.primaryColor;
      if (s.subtitleConfig.highlightColor && subHighlightColor) subHighlightColor.value = s.subtitleConfig.highlightColor;
    }

    // Load LLM AI Config
    const selectAi = document.getElementById('selectAiProvider');
    const inputKey = document.getElementById('inputAiApiKey');
    if (s.aiProvider && selectAi) selectAi.value = s.aiProvider;
    if (s.apiKey && inputKey) inputKey.value = s.apiKey;

  } catch (err) {
    console.warn('Lỗi load settings AI:', err);
  }
}

function initAiStudio() {
  const speedRange = document.getElementById('voiceSpeedRange');
  const speedVal = document.getElementById('voiceSpeedVal');
  const pitchRange = document.getElementById('voicePitchRange');
  const pitchVal = document.getElementById('voicePitchVal');
  const duckingRange = document.getElementById('duckingVolumeRange');
  const duckingVal = document.getElementById('duckingVolumeVal');

  if (speedRange && speedVal) {
    speedRange.addEventListener('input', (e) => {
      const num = parseInt(e.target.value, 10) || 0;
      speedVal.innerText = num >= 0 ? `+${num}%` : `${num}%`;
    });
    speedRange.addEventListener('change', async (e) => {
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings({ ttsSpeed: parseInt(e.target.value, 10) || 0 });
      }
    });
  }

  if (pitchRange && pitchVal) {
    pitchRange.addEventListener('input', (e) => {
      const num = parseInt(e.target.value, 10) || 0;
      pitchVal.innerText = num >= 0 ? `+${num}Hz` : `${num}Hz`;
    });
    pitchRange.addEventListener('change', async (e) => {
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings({ ttsPitch: parseInt(e.target.value, 10) || 0 });
      }
    });
  }

  if (duckingRange && duckingVal) {
    duckingRange.addEventListener('input', (e) => {
      duckingVal.innerText = `${e.target.value}%`;
    });
    duckingRange.addEventListener('change', async (e) => {
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings({ duckingVolume: parseInt(e.target.value, 10) || 18 });
      }
    });
  }

  // Engine selector dynamic voice list
  const selectEngine = document.getElementById('selectVoiceEngine');
  const voiceSelect = document.getElementById('aiVoiceSelector');

  if (selectEngine && voiceSelect) {
    selectEngine.addEventListener('change', async () => {
      const eng = selectEngine.value;
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings({ ttsEngine: eng });
      }

      if (eng === 'omnivoice') {
        voiceSelect.innerHTML = `
          <option value="ov_nu_am">OmniVoice: Nữ ấm áp (Truyền cảm, giọng phim)</option>
          <option value="ov_nam_tuong">OmniVoice: Nam tướng/trầm (Hùng tráng, uy quyền)</option>
          <option value="ov_nam_tre">OmniVoice: Nam trẻ (Năng động, review phim)</option>
          <option value="ov_phim_tai_lieu">OmniVoice: Giọng tài liệu (Điện ảnh, chiều sâu)</option>
        `;
      } else if (eng === 'elevenlabs') {
        voiceSelect.innerHTML = `
          <option value="21m00Tcm4TlvDq8ikWAM">ElevenLabs: Rachel (Nữ nhẹ nhàng tự nhiên)</option>
          <option value="AZnzlk1XvdvUeBnXmlld">ElevenLabs: Domi (Nữ mạnh mẽ dứt khoát)</option>
          <option value="ErXwobaYiN019PkySvjV">ElevenLabs: Antoni (Nam trầm ấm podcast)</option>
          <option value="pNInz6obpgDQGcFmaJgB">ElevenLabs: Adam (Nam tường thuật sâu lắng)</option>
        `;
      } else {
        voiceSelect.innerHTML = `
          <option value="vi-VN-HoaiMyNeural">Hoài My (Nữ - Truyền cảm, ngọt ngào, phù hợp kể chuyện/reels)</option>
          <option value="vi-VN-NamMinhNeural">Nam Minh (Nam - Trầm ấm, dứt khoát, bắt tai, tin tức/viral)</option>
        `;
      }
    });

    voiceSelect.addEventListener('change', async () => {
      if (window.api && window.api.saveSettings) {
        await window.api.saveSettings({ ttsVoice: voiceSelect.value });
      }
    });
  }

  // Voice Synthesize Live Preview
  const btnPlayPreview = document.getElementById('btnPlayTtsPreview');
  const previewText = document.getElementById('previewTtsText');
  const audioPlayer = document.getElementById('audioPreviewPlayer');

  if (btnPlayPreview && previewText && voiceSelect) {
    btnPlayPreview.addEventListener('click', async () => {
      const text = previewText.value.trim();
      if (!text) {
        alert('Vui lòng nhập văn bản cần nói thử!');
        return;
      }

      btnPlayPreview.disabled = true;
      btnPlayPreview.innerHTML = `
        <svg width="15" height="15" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg> Đang tạo giọng nói...`;

      try {
        const voice = voiceSelect.value;
        const sVal = parseInt(speedRange ? speedRange.value : 0, 10) || 0;
        const pVal = parseInt(pitchRange ? pitchRange.value : 0, 10) || 0;
        const rate = sVal >= 0 ? `+${sVal}%` : `${sVal}%`;
        const pitch = pVal >= 0 ? `+${pVal}Hz` : `${pVal}Hz`;
        const settings = await window.api.getSettings();
        const outputDir = settings && settings.outputDir;
        if (!outputDir) throw new Error('Chưa đặt Thư mục xuất trong Cài đặt — hãy chọn thư mục xuất trước khi nghe thử.');
        const tempAudioPath = `${outputDir}\\preview_tts_${Date.now()}.mp3`;

        const engine = selectEngine ? selectEngine.value : 'edge-tts';
        const res = await window.api.synthesizeVoice(text, {
          engine: engine,
          voice: voice,
          outputFile: tempAudioPath,
          rate: rate,
          pitch: pitch
        });
        const audioSrc = (res && res.dataUrl) 
          || (res && res.outputFile && `file:///${res.outputFile.replace(/\\/g, '/')}`)
          || (res && res.filePath && `file:///${res.filePath.replace(/\\/g, '/')}`);

        if (audioSrc) {
          audioPlayer.src = audioSrc;
          audioPlayer.style.display = 'inline-block';
          audioPlayer.currentTime = 0;
          try {
            await audioPlayer.play();
          } catch (e) {
            console.warn('[AudioPreview] Tự động phát bị chặn, người dùng có thể bấm play trên audio player:', e);
            // Fallback trực tiếp bằng Audio element mới nếu audioPlayer bị vướng
            try {
              const fallbackAudio = new Audio(audioSrc);
              await fallbackAudio.play();
            } catch (err2) {
              console.warn('[AudioPreview] Fallback play error:', err2);
            }
          }
        } else {
          throw new Error('Không nhận được dữ liệu âm thanh từ Edge-TTS.');
        }
      } catch (err) {
        alert(`Lỗi phát giọng đọc: ${err.message}`);
      } finally {
        btnPlayPreview.disabled = false;
        btnPlayPreview.innerHTML = `
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Nghe thử giọng đọc
        `;
      }
    });
  }

  // softShortenVi Interactive Tester
  const btnTestShorten = document.getElementById('btnTestSoftShorten');
  const shortenBadge = document.getElementById('badgeShortenRatio');
  const shortenStats = document.getElementById('shortenResultStats');

  if (btnTestShorten && previewText) {
    btnTestShorten.addEventListener('click', async () => {
      const text = previewText.value.trim();
      if (!text) {
        alert('Vui lòng nhập văn bản vào ô kịch bản nói thử bên trên!');
        return;
      }
      try {
        const res = await window.api.softShortenVi(text, { targetDuration: 3.5 });
        previewText.value = res.shortenedText;
        if (shortenBadge) {
          shortenBadge.innerText = `-${res.reductionPercent}% co gọn`;
          shortenBadge.className = 'badge badge-success';
        }
        if (shortenStats) {
          shortenStats.innerText = `Từ ${res.originalLength} ký tự xuống ${res.shortenedLength} ký tự (${res.fitsBudget ? 'Vừa khít time-budget' : 'Đã tối ưu'})`;
        }
      } catch (err) {
        alert('Lỗi gọt từ đệm: ' + err.message);
      }
    });
  }

  // Subtitle Configuration Auto-Save
  const subFontSize = document.getElementById('subFontSize');
  const subPrimaryColor = document.getElementById('subPrimaryColor');
  const subHighlightColor = document.getElementById('subHighlightColor');

  async function saveSubtitleConfig() {
    if (!window.api || !window.api.saveSettings) return;
    const cfg = {
      fontName: 'Roboto',
      fontSize: parseInt(subFontSize ? subFontSize.value : 38, 10) || 38,
      primaryColor: subPrimaryColor ? subPrimaryColor.value : '#ffffff',
      highlightColor: subHighlightColor ? subHighlightColor.value : '#f43f5e'
    };
    await window.api.saveSettings({ subtitleConfig: cfg });
  }

  if (subFontSize) subFontSize.addEventListener('change', saveSubtitleConfig);
  if (subPrimaryColor) subPrimaryColor.addEventListener('change', saveSubtitleConfig);
  if (subHighlightColor) subHighlightColor.addEventListener('change', saveSubtitleConfig);

  // Save AI Provider & API Key
  const btnSaveAi = document.getElementById('btnSaveAiConfig');
  if (btnSaveAi) {
    btnSaveAi.addEventListener('click', async () => {
      const selectAi = document.getElementById('selectAiProvider');
      const inputKey = document.getElementById('inputAiApiKey');
      const provider = selectAi ? selectAi.value : 'gemini';
      const apiKey = inputKey ? inputKey.value.trim() : '';

      if (!apiKey) {
        alert('Vui lòng nhập API Key trước khi lưu!');
        return;
      }

      btnSaveAi.disabled = true;
      btnSaveAi.innerText = 'Đang lưu...';

      try {
        await window.api.saveSettings({ aiProvider: provider, apiKey });
        alert('✅ Đã lưu cấu hình AI dịch thuật thành công!');
      } catch (e) {
        alert('Lỗi lưu cấu hình: ' + e.message);
      } finally {
        btnSaveAi.disabled = false;
        btnSaveAi.innerText = 'Lưu cấu hình AI';
      }
    });
  }

  // Google Gemini Web Interactive CDP Login
  const btnLoginGemini = document.getElementById('btnLoginGeminiWeb');
  const geminiStatus = document.getElementById('geminiWebStatus');

  if (btnLoginGemini) {
    btnLoginGemini.addEventListener('click', async () => {
      btnLoginGemini.disabled = true;
      btnLoginGemini.innerHTML = `
        <svg width="15" height="15" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Đang mở Chrome/Edge đăng nhập Gemini...
      `;
      if (geminiStatus) {
        geminiStatus.style.display = 'block';
        geminiStatus.style.color = '#60a5fa';
        geminiStatus.innerText = 'Vui lòng đăng nhập Google tài khoản của bạn trên cửa sổ vừa mở...';
      }

      try {
        const res = await window.api.loginGeminiInteractive({ timeoutMs: 180000 });
        if (res && res.ok) {
          if (geminiStatus) {
            geminiStatus.style.color = '#10b981';
            geminiStatus.innerText = `✅ ${res.message}`;
          }
          alert(`✅ Đăng nhập Gemini Web thành công!\nĐã trích xuất ${res.cookiesCount || 0} cookies.`);
        } else {
          if (geminiStatus) {
            geminiStatus.style.color = '#ef4444';
            geminiStatus.innerText = `❌ ${res ? res.message : 'Đăng nhập thất bại'}`;
          }
          alert(`❌ Đăng nhập thất bại: ${res ? res.message : 'Timeout'}`);
        }
      } catch (err) {
        if (geminiStatus) {
          geminiStatus.style.color = '#ef4444';
          geminiStatus.innerText = `❌ Lỗi: ${err.message}`;
        }
        alert(`❌ Lỗi kết nối CDP: ${err.message}`);
      } finally {
        btnLoginGemini.disabled = false;
        btnLoginGemini.innerHTML = `
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Đăng nhập Gemini Web qua Chrome/Edge CDP
        `;
      }
    });
  }
}
