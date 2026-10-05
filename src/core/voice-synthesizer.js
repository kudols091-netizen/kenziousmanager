
function normalizeRate(rate) {
  if (rate === undefined || rate === null) return '+0%';
  let s = String(rate).trim();
  if (!s || s === '0' || s === '0%' || s === '+0' || s === '-0') return '+0%';
  if (!s.endsWith('%')) s += '%';
  if (!s.startsWith('+') && !s.startsWith('-')) s = '+' + s;
  return s;
}

function normalizePitch(pitch) {
  if (pitch === undefined || pitch === null) return '+0Hz';
  let s = String(pitch).trim();
  if (!s || s === '0' || s === '0Hz' || s === '+0' || s === '-0' || s === '+0Hz' || s === '-0Hz') return '+0Hz';
  if (!s.toLowerCase().endsWith('hz')) s += 'Hz';
  if (!s.startsWith('+') && !s.startsWith('-')) s = '+' + s;
  return s;
}
/**
 * Kenzious Reel V2 - Unified Voice Synthesizer
 * Integrates:
 *  - Edge-TTS (High Quality Neural VN Voices, Zero Cost)
 *  - OmniVoice CUDA (Python worker via stdin/stdout with character prompts & refAudio)
 *  - ElevenLabs API (Studio-grade multi-lingual voiceover via REST)
 */

const { spawn } = require('child_process');
const { track, killTree } = require('./process-registry');
const path = require('path');
const fs = require('fs');
const https = require('https');
const storage = require('./storage');
const textShortener = require('./text-shortener');


// Worker Python tự retry 3 lần (mỗi lần tối đa ~70s) → timeout phía JS phải dài hơn, tăng theo độ dài văn bản
function ttsTimeoutMs(text) {
  return Math.min(10 * 60 * 1000, 120 * 1000 + String(text || '').length * 50);
}

function isNonEmptyFile(p) {
  try { return fs.statSync(p).size > 0; } catch (_) { return false; }
}

class VoiceSynthesizer {
  constructor() {}

  getPythonPath() {
    const s = storage.getSettings();
    return s.pythonPath || 'python';
  }

  getElevenLabsKey() {
    const s = storage.getSettings();
    return s.elevenLabsKey || process.env.ELEVENLABS_API_KEY || '';
  }

  /**
   * Get supported voices across all engines
   */
  async getVoices() {
    return [
      // Edge-TTS Voices
      { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ miền Nam, truyền cảm)', lang: 'vi-VN', engine: 'edge-tts' },
      { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Nam miền Bắc, tin tức/phim)', lang: 'vi-VN', engine: 'edge-tts' },
      { id: 'en-US-JennyNeural', name: 'Jenny (Nữ tiếng Anh tự nhiên)', lang: 'en-US', engine: 'edge-tts' },
      { id: 'en-US-GuyNeural', name: 'Guy (Nam tiếng Anh podcast)', lang: 'en-US', engine: 'edge-tts' },
      
      // OmniVoice CUDA Prompt-based Voices
      { id: 'ov_nu_am', name: 'OmniVoice: Nữ ấm áp (Truyền cảm, giọng phim)', lang: 'vi-VN', engine: 'omnivoice' },
      { id: 'ov_nam_tuong', name: 'OmniVoice: Nam tướng/trầm (Hùng tráng, uy quyền)', lang: 'vi-VN', engine: 'omnivoice' },
      { id: 'ov_nam_tre', name: 'OmniVoice: Nam trẻ (Năng động, review phim)', lang: 'vi-VN', engine: 'omnivoice' },
      { id: 'ov_phim_tai_lieu', name: 'OmniVoice: Giọng phim tài liệu (Điện ảnh, chiều sâu)', lang: 'vi-VN', engine: 'omnivoice' },

      // ElevenLabs Studio Voices
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'ElevenLabs: Rachel (Nữ nhẹ nhàng tự nhiên)', lang: 'vi-VN/en', engine: 'elevenlabs' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'ElevenLabs: Domi (Nữ mạnh mẽ dứt khoát)', lang: 'vi-VN/en', engine: 'elevenlabs' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'ElevenLabs: Antoni (Nam trầm ấm podcast)', lang: 'vi-VN/en', engine: 'elevenlabs' },
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'ElevenLabs: Adam (Nam tường thuật sâu lắng)', lang: 'vi-VN/en', engine: 'elevenlabs' }
    ];
  }

  /**
   * Synthesize speech using the appropriate engine with softShortenVi pre-processing
   * @param {string} text Text to synthesize
   * @param {Object} options Configuration options
   * @returns {Promise<{success: boolean, filePath: string, engine: string, cues?: Array}>}
   */
  async synthesizeVoice(text, options = {}) {
    options.rate = normalizeRate(options.rate);
    options.pitch = normalizePitch(options.pitch);
    const voice = options.voice || 'vi-VN-HoaiMyNeural';
    let engine = options.engine;
    // Smart routing: tự động phát hiện engine theo ID giọng nếu bị thiếu hoặc lệch
    if (!engine || engine === 'edge-tts') {
      if (voice && (voice.startsWith('ov_') || voice.includes('OmniVoice'))) {
        engine = 'omnivoice';
      } else if (voice && (['21m00Tcm4TlvDq8ikWAM', 'AZnzlk1XvdvUeBnXmlld', 'ErXwobaYiN019PkySvjV', 'pNInz6obpgDQGcFmaJgB'].includes(voice) || (voice.length === 20 && !voice.includes('-')))) {
        engine = 'elevenlabs';
      } else {
        engine = 'edge-tts';
      }
    }
    const outputFile = options.outputFile;
    const targetDuration = options.targetDuration || 0;

    if (!outputFile) throw new Error('Cần cung cấp đường dẫn outputFile');

    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Step 1: Pre-process with softShortenVi to guarantee time budget compliance
    const shortenResult = textShortener.softShortenVi(text, { targetDuration });
    const optimizedText = shortenResult.shortenedText || text;

    // Step 2: Dispatch to engine
    if (engine === 'elevenlabs') {
      try {
        return await this.synthesizeElevenLabs(optimizedText, voice, outputFile, options);
      } catch (err) {
        console.warn('[VoiceSynthesizer] ElevenLabs failed, falling back to Edge-TTS:', err.message);
        return await this.synthesizeEdgeTts(optimizedText, 'vi-VN-HoaiMyNeural', outputFile, options);
      }
    }

    if (engine === 'omnivoice') {
      try {
        return await this.synthesizeOmniVoice(optimizedText, voice, outputFile, options);
      } catch (err) {
        console.warn('[VoiceSynthesizer] OmniVoice failed, falling back to Edge-TTS:', err.message);
        return await this.synthesizeEdgeTts(optimizedText, 'vi-VN-NamMinhNeural', outputFile, options);
      }
    }

    return await this.synthesizeEdgeTts(optimizedText, voice, outputFile, options);
  }

  /**
   * 1. Edge-TTS Engine
   */
  async synthesizeEdgeTts(text, voice, outputFile, options = {}) {
    const py = this.getPythonPath();
    const script = require('./paths').unpackedPath(path.join(__dirname, '..', 'scripts', 'tts_worker.py'));
    const rate = normalizeRate(options.rate);
    const pitch = normalizePitch(options.pitch);

    const tempTextFile = path.join(path.dirname(outputFile), `prompt_${Date.now()}.txt`);
    fs.writeFileSync(tempTextFile, text, 'utf-8');

    return new Promise((resolve, reject) => {
      const args = [
        script,
        'synthesize',
        tempTextFile,
        voice,
        outputFile,
        rate,
        pitch
      ];

      const proc = track(spawn(py, args, { windowsHide: true }));
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        killTree(proc);
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }
        reject(new Error(`Edge-TTS quá thời gian chờ (${Math.round(ttsTimeoutMs(text) / 1000)}s). Vui lòng kiểm tra lại kết nối mạng.`));
      }, ttsTimeoutMs(text));

      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);

      proc.on('error', err => {
        clearTimeout(timer);
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }
        reject(new Error('Lỗi khởi chạy python worker: ' + err.message));
      });

      proc.on('close', code => {
        clearTimeout(timer);
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }

        if (code === 0 && isNonEmptyFile(outputFile)) {
          let cues = [];
          try {
            const data = JSON.parse(stdout);
            cues = data.cues || [];
          } catch (e) {}

          let dataUrl = null;
          try {
            const buf = fs.readFileSync(outputFile);
            dataUrl = `data:audio/mp3;base64,${buf.toString('base64')}`;
          } catch (_) {}

          resolve({
            success: true,
            filePath: outputFile,
            outputFile: outputFile,
            dataUrl: dataUrl,
            engine: 'edge-tts',
            voice,
            textLength: text.length,
            cues
          });
        } else {
          reject(new Error(`Edge-TTS thất bại: ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * 2. OmniVoice CUDA Engine
   */
  async synthesizeOmniVoice(text, voicePromptId, outputFile, options = {}) {
    const py = this.getPythonPath();
    const script = require('./paths').unpackedPath(path.join(__dirname, '..', 'scripts', 'omnivoice_worker.py'));
    const refAudio = options.refAudio || '';

    const tempTextFile = path.join(path.dirname(outputFile), `omni_prompt_${Date.now()}.txt`);
    fs.writeFileSync(tempTextFile, text, 'utf-8');

    return new Promise((resolve, reject) => {
      const args = [
        script,
        'synthesize',
        tempTextFile,
        voicePromptId,
        outputFile
      ];
      if (refAudio && fs.existsSync(refAudio)) {
        args.push(refAudio);
      }

      const timer = setTimeout(() => {
        killTree(proc);
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }
        reject(new Error(`OmniVoice quá thời gian chờ (${Math.round(ttsTimeoutMs(text) / 1000)}s).`));
      }, ttsTimeoutMs(text));

      const proc = track(spawn(py, args, { windowsHide: true }));
      let stdout = '';
      let stderr = '';

      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);

      proc.on('error', err => {
        clearTimeout(timer);
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }
        reject(new Error('Lỗi khởi chạy python worker OmniVoice: ' + err.message));
      });

      proc.on('close', code => {
        clearTimeout(timer);
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }

        if (code === 0 && isNonEmptyFile(outputFile)) {
          let cues = [];
          try {
            const data = JSON.parse(stdout);
            cues = data.cues || [];
          } catch (e) {}

          let dataUrl = null;
          try {
            const buf = fs.readFileSync(outputFile);
            dataUrl = `data:audio/mp3;base64,${buf.toString('base64')}`;
          } catch (_) {}

          resolve({
            success: true,
            filePath: outputFile,
            outputFile: outputFile,
            dataUrl: dataUrl,
            engine: 'omnivoice',
            voice: voicePromptId,
            textLength: text.length,
            cues
          });
        } else {
          reject(new Error(`OmniVoice thất bại: ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * 3. ElevenLabs API Engine (HTTP REST)
   */
  async synthesizeElevenLabs(text, voiceId, outputFile, options = {}) {
    const apiKey = options.apiKey || this.getElevenLabsKey();
    if (!apiKey) {
      throw new Error('Chưa cấu hình ElevenLabs API Key.');
    }

    const modelId = options.modelId || 'eleven_multilingual_v2';
    const targetVoice = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel

    const payload = JSON.stringify({
      text: text,
      model_id: modelId,
      voice_settings: {
        stability: options.stability || 0.5,
        similarity_boost: options.similarityBoost || 0.85,
        style: 0.0,
        use_speaker_boost: true
      }
    });

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: 'api.elevenlabs.io',
        port: 443,
        path: `/v1/text-to-speech/${targetVoice}`,
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Accept': 'audio/mpeg'
        }
      };

      const req = https.request(reqOptions, (res) => {
        if (res.statusCode !== 200) {
          let errData = '';
          res.on('data', d => errData += d.toString());
          res.on('end', () => reject(new Error(`ElevenLabs HTTP ${res.statusCode}: ${errData}`)));
          return;
        }

        const fileStream = fs.createWriteStream(outputFile);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve({
            success: true,
            filePath: outputFile,
            engine: 'elevenlabs',
            voice: targetVoice,
            textLength: text.length
          });
        });
      });

      req.on('error', (e) => reject(new Error(`ElevenLabs Request Error: ${e.message}`)));
      req.write(payload);
      req.end();
    });
  }
}

module.exports = new VoiceSynthesizer();
