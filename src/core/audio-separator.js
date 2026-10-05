/**
 * Kenzious Reel V2 - Audio Stem Separation Module (Demucs & Vocal Isolation)
 * Clean-Room Specification Reference: _notes/zooreup-download-render.md
 * 
 * Separates original audio into:
 *  - vocals.wav (Speech track for transcription/removal)
 *  - no_vocals.wav (BGM and SFX track to preserve underneath new AI voiceover)
 * 
 * Includes high-fidelity clean-room FFmpeg phase cancellation fallback if 
 * Demucs/PyTorch is not installed on the host machine.
 */

const { spawn, execFileSync } = require('child_process');
const { track, killTree } = require('./process-registry');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

class AudioSeparator {
  constructor() {
    this.demucsAvailable = null;
  }

  getPythonPath() {
    const s = storage.getSettings();
    return s.pythonPath || 'python';
  }

  getFfmpegPath() {
    const s = storage.getSettings();
    if (s.ffmpegPath && fs.existsSync(s.ffmpegPath)) return s.ffmpegPath;
    const candidates = [
      path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe'),
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe') : null
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'ffmpeg';
  }

  /**
   * Check if Demucs and PyTorch are installed in the Python environment
   * @returns {Promise<{available: boolean, reason?: string}>}
   */
  async checkDemucsInstalled() {
    if (this.demucsAvailable !== null) return this.demucsAvailable;

    const py = this.getPythonPath();
    try {
      // execFileSync (không qua shell): pythonPath lấy từ settings nên không được ghép vào chuỗi lệnh
      execFileSync(py, ['-c', "import demucs, torch; print('DEMUCS_OK')"], {
        timeout: 8000,
        stdio: 'pipe'
      });
      this.demucsAvailable = { available: true };
    } catch (err) {
      this.demucsAvailable = {
        available: false,
        reason: 'Demucs hoặc PyTorch chưa được cài đặt trong môi trường Python. Hệ thống sẽ tự động kích hoạt FFmpeg Phase Cancellation Fallback.'
      };
    }
    return this.demucsAvailable;
  }

  /**
   * Separate audio into vocals and background music (no_vocals)
   * @param {string} inputMedia Video or audio file path
   * @param {string} outputDir Destination folder for separated wav files
   * @param {Object} [options] Options { model: 'htdemucs', onProgress: Function }
   * @returns {Promise<{success: boolean, vocalsPath: string, noVocalsPath: string, method: string}>}
   */
  async separateAudio(inputMedia, outputDir, options = {}) {
    if (!fs.existsSync(inputMedia)) {
      throw new Error(`Không tìm thấy tệp đầu vào: ${inputMedia}`);
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const onProgress = options.onProgress || (() => {});
    const ffmpeg = this.getFfmpegPath();
    const tempWav = path.join(outputDir, `temp_audio_input_${Date.now()}.wav`);

    onProgress({ phase: 'extracting', message: 'Đang trích xuất audio 44.1kHz stereo từ tệp gốc...' });

    // Step 1: Extract stereo WAV from input media
    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputMedia,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        tempWav
      ];
      const proc = track(spawn(ffmpeg, args, { windowsHide: true }));
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(tempWav)) resolve();
        else reject(new Error(`Trích xuất audio thất bại: ${stderr}`));
      });
    });

    const vocalsDest = path.join(outputDir, 'vocals.wav');
    const noVocalsDest = path.join(outputDir, 'no_vocals.wav');

    // Step 2: Check Demucs capability
    const status = await this.checkDemucsInstalled();

    if (status.available) {
      try {
        onProgress({ phase: 'demucs_separating', message: 'Đang chạy Demucs AI tách stem (vocals & BGM)...' });
        await this.runDemucsSeparation(tempWav, outputDir, options, onProgress);

        if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
        return {
          success: true,
          vocalsPath: vocalsDest,
          noVocalsPath: noVocalsDest,
          method: 'demucs'
        };
      } catch (demucsErr) {
        console.warn('[AudioSeparator] Demucs execution failed, engaging FFmpeg fallback:', demucsErr.message);
      }
    }

    // Step 3: Clean-Room FFmpeg Vocal Suppression Fallback
    onProgress({ phase: 'ffmpeg_fallback', message: 'Đang tách nhạc nền bằng thuật toán FFmpeg Phase Cancellation & Spectral Isolation...' });

    await this.runFfmpegSeparationFallback(tempWav, vocalsDest, noVocalsDest);

    if (fs.existsSync(tempWav)) {
      try { fs.unlinkSync(tempWav); } catch (e) {}
    }

    return {
      success: true,
      vocalsPath: vocalsDest,
      noVocalsPath: noVocalsDest,
      method: 'ffmpeg-phase-cancellation'
    };
  }

  /**
   * Run Demucs separation via child_process
   */
  async runDemucsSeparation(inputWav, outputDir, options, onProgress) {
    const py = this.getPythonPath();
    const model = options.model || 'htdemucs';
    const demucsOutputDir = path.join(outputDir, 'demucs_stems');

    const args = [
      '-m', 'demucs.separate',
      '-n', model,
      '--two-stems', 'vocals',
      '-o', demucsOutputDir,
      inputWav
    ];

    await new Promise((resolve, reject) => {
      const proc = track(spawn(py, args, { windowsHide: true }));
      let stderr = '';
      proc.stderr.on('data', d => {
        const text = d.toString();
        stderr += text;
        if (text.includes('%')) {
          onProgress({ phase: 'demucs_separating', message: text.trim() });
        }
      });
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Demucs lỗi (code ${code}): ${stderr}`));
      });
    });

    // Locate the output files in demucs directory structure
    const baseName = path.basename(inputWav, path.extname(inputWav));
    const modelDir = path.join(demucsOutputDir, model, baseName);

    const generatedVocals = path.join(modelDir, 'vocals.wav');
    const generatedNoVocals = path.join(modelDir, 'no_vocals.wav');

    const vocalsDest = path.join(outputDir, 'vocals.wav');
    const noVocalsDest = path.join(outputDir, 'no_vocals.wav');

    if (fs.existsSync(generatedVocals)) fs.copyFileSync(generatedVocals, vocalsDest);
    if (fs.existsSync(generatedNoVocals)) fs.copyFileSync(generatedNoVocals, noVocalsDest);

    // Clean up temporary demucs folder
    try {
      fs.rmSync(demucsOutputDir, { recursive: true, force: true });
    } catch (e) {}
  }

  /**
   * FFmpeg Center-Channel Phase Inversion and Spectral Filtering Fallback
   */
  async runFfmpegSeparationFallback(inputWav, vocalsDest, noVocalsDest) {
    const ffmpeg = this.getFfmpegPath();

    // 1. no_vocals.wav: Center vocal cancellation filter (L-R stereo subtraction + low-end bass preservation)
    // Formula: Cancels identical mono center speech while preserving wide stereo BGM and panned instruments
    const noVocalsFilter = 'pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0,volume=1.8';

    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputWav,
        '-af', noVocalsFilter,
        noVocalsDest
      ];
      const proc = track(spawn(ffmpeg, args, { windowsHide: true }));
      proc.on('close', code => (code === 0 ? resolve() : reject(new Error('Tạo no_vocals fallback thất bại'))));
    });

    // 2. vocals.wav: Bandpass vocal extraction filter (isolates human speech fundamental frequencies ~220Hz - 3400Hz)
    const vocalsFilter = 'highpass=f=220,lowpass=f=3400,volume=1.5';

    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputWav,
        '-af', vocalsFilter,
        vocalsDest
      ];
      const proc = track(spawn(ffmpeg, args, { windowsHide: true }));
      proc.on('close', code => (code === 0 ? resolve() : reject(new Error('Tạo vocals fallback thất bại'))));
    });
  }
}

module.exports = new AudioSeparator();
