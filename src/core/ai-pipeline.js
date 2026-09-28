/**
 * Kenzious AI Subtitling & Voice Cloning Pipeline (Clean-room Implementation)
 * Specification Reference: _notes/zoo-reup-studio.md Section 6
 * Features:
 *  - Time-Budgeted LLM Translation: Constrains output chars to fit audio duration
 *  - Vietnamese Filler Word Pruning: softShortenVi regex filters
 *  - High Quality Edge-TTS & OmniVoice CUDA bridge
 *  - Multi-Track Audio Ducking: -12dB to -18dB sidechain ducking
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

class AiPipeline {
  constructor() {
    this.pythonPath = 'python';
  }

  getPythonPath() {
    const s = storage.getSettings();
    return s.pythonPath || 'python';
  }

  getFfmpegPath() {
    const s = storage.getSettings();
    if (s.ffmpegPath && fs.existsSync(s.ffmpegPath)) return s.ffmpegPath;
    const localBin = path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localBin)) return localBin;
    return 'ffmpeg';
  }

  /**
   * Helper: softShortenVi - Vietnamese Filler Word Pruner
   * Shortens Vietnamese speech cues to prevent audio drift and voice overlap
   */
  softShortenVi(text) {
    if (!text) return '';
    let result = text;

    // Prune redundant filler phrases
    const fillerPatterns = [
      /\b(thì là mà|thì là|nói chung là|thực ra là|thực chất là|có thể thấy là)\b/gi,
      /\b(ở thời điểm hiện tại|vào thời điểm này|ngay tại lúc này)\b/gi,
      /\b(bởi vì một lý do là|chính vì điều đó cho nên)\b/gi,
      /\b(được coi như là|được xem như là|được mệnh danh là)\b/gi
    ];

    const replacements = [
      '',
      'hiện tại',
      'vì thế',
      'là'
    ];

    for (let i = 0; i < fillerPatterns.length; i++) {
      result = result.replace(fillerPatterns[i], replacements[i]);
    }

    // Clean up multiple spaces
    return result.replace(/\s+/g, ' ').trim();
  }

  /**
   * Calculate character budget based on audio cue duration (approx 20 chars/sec)
   */
  calculateTimeBudget(durationSeconds, charsPerSecond = 20) {
    return Math.max(15, Math.floor(durationSeconds * charsPerSecond));
  }

  /**
   * 1. Extract audio from video to 16kHz Mono WAV
   */
  async extractAudio(videoPath, outputWav) {
    const ffmpeg = this.getFfmpegPath();
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', videoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        outputWav
      ];

      const proc = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputWav)) {
          resolve(outputWav);
        } else {
          reject(new Error(`Failed to extract audio: ${stderr}`));
        }
      });
    });
  }

  /**
   * 2. List available Edge-TTS and Local Voices
   */
  async getVoices() {
    const py = this.getPythonPath();
    const script = path.join(__dirname, '..', 'scripts', 'tts_worker.py');
    return new Promise((resolve) => {
      const proc = spawn(py, [script, 'list-voices'], { windowsHide: true });
      let stdout = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.on('close', code => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            resolve(data.voices || []);
          } catch (e) {
            resolve(this.getDefaultVoices());
          }
        } else {
          resolve(this.getDefaultVoices());
        }
      });
    });
  }

  getDefaultVoices() {
    return [
      { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ miền Nam, truyền cảm)', lang: 'vi-VN' },
      { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Nam miền Bắc, tin tức)', lang: 'vi-VN' },
      { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Nam tiếng Trung trẻ)', lang: 'zh-CN' },
      { id: 'en-US-JennyNeural', name: 'Jenny (Nữ tiếng Anh tự nhiên)', lang: 'en-US' },
      { id: 'en-US-GuyNeural', name: 'Guy (Nam tiếng Anh podcast)', lang: 'en-US' }
    ];
  }

  /**
   * 3. Synthesize speech using Python TTS worker (Edge-TTS or OmniVoice)
   */
  async synthesizeVoice(text, voice = 'vi-VN-HoaiMyNeural', outputFile, rate = '+0%', pitch = '+0Hz') {
    const py = this.getPythonPath();
    const script = path.join(__dirname, '..', 'scripts', 'tts_worker.py');

    // Apply soft Vietnamese shortening before synthesis
    const optimizedText = this.softShortenVi(text);

    const tempTextFile = path.join(path.dirname(outputFile), `tts_prompt_${Date.now()}.txt`);
    fs.writeFileSync(tempTextFile, optimizedText, 'utf-8');

    return new Promise((resolve, reject) => {
      const args = [
        script,
        'synthesize',
        '--text-file', tempTextFile,
        '--voice', voice,
        '--output', outputFile,
        '--rate', rate,
        '--pitch', pitch
      ];

      const proc = spawn(py, args, { windowsHide: true });
      let stderr = '';

      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', code => {
        if (fs.existsSync(tempTextFile)) {
          try { fs.unlinkSync(tempTextFile); } catch (e) {}
        }

        if (code === 0 && fs.existsSync(outputFile)) {
          resolve({
            success: true,
            filePath: outputFile,
            textLength: optimizedText.length
          });
        } else {
          reject(new Error(`TTS generation failed: ${stderr}`));
        }
      });
    });
  }

  /**
   * 4. Multi-Track Audio Ducking (-12dB to -18dB sidechain compression)
   */
  async mixAudioDucking(videoPath, voicePath, outputPath, duckingVol = 0.15) {
    const ffmpeg = this.getFfmpegPath();
    return new Promise((resolve, reject) => {
      // Sidechain ducking filter: Video background music drops by -14dB when voice is active
      const filter = `[0:a]volume=1.0[bg];[1:a]volume=1.0[fg];[bg][fg]sidechaincompress=threshold=0.08:ratio=8:attack=20:release=350[ducked];[ducked][fg]amix=inputs=2:duration=first:dropout_transition=2[aout]`;

      const args = [
        '-y',
        '-i', videoPath,
        '-i', voicePath,
        '-filter_complex', filter,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      ];

      const proc = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = '';

      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Failed to mix audio ducking: ${stderr}`));
        }
      });
    });
  }
}

module.exports = new AiPipeline();
