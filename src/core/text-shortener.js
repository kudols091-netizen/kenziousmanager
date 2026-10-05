/**
 * Kenzious Reel V2 - Vietnamese Text Shortener (softShortenVi)
 * Clean-Room Specification Reference: _notes/zooreup-movie-hub-ai-ocr.md Section 2.3
 * 
 * Solves LLM translation expansion: Vietnamese text is typically 20%-40% longer 
 * than original Chinese/English dialogue. This module prunes non-essential filler
 * words and phrases to fit strictly within the subtitle cue's time budget.
 */

// Tier 1: Multi-word Vietnamese conversational filler phrases (Unicode-safe boundaries)
const FILLER_PHRASES = [
  { regex: /(?:^|[\s,])(thì là mà|thì là)(?=[\s,.:;?!]|$)/gi, replacement: '' },
  { regex: /(?:^|[\s,])(nói chung là|nói một cách khác là)(?=[\s,.:;?!]|$)/gi, replacement: '' },
  { regex: /(?:^|[\s,])(thực ra là|thực chất là|trên thực tế là)(?=[\s,.:;?!]|$)/gi, replacement: 'thực tế' },
  { regex: /(?:^|[\s,])(có thể thấy là|chúng ta có thể thấy rằng|dễ dàng nhận thấy)(?=[\s,.:;?!]|$)/gi, replacement: 'thấy rằng' },
  { regex: /(?:^|[\s,])(ở thời điểm hiện tại|vào thời điểm này|ngay tại lúc này)(?=[\s,.:;?!]|$)/gi, replacement: 'hiện tại' },
  { regex: /(?:^|[\s,])(bởi vì một lý do là|chính vì điều đó cho nên|do đó mà)(?=[\s,.:;?!]|$)/gi, replacement: 'vì thế' },
  { regex: /(?:^|[\s,])(được coi như là|được xem như là|được mệnh danh là)(?=[\s,.:;?!]|$)/gi, replacement: 'là' },
  { regex: /(?:^|[\s,])(một cách rất là|một cách vô cùng|một cách cực kỳ)(?=[\s,.:;?!]|$)/gi, replacement: 'rất' },
  { regex: /(?:^|[\s,])(cho chúng ta biết được rằng|cho thấy rằng là)(?=[\s,.:;?!]|$)/gi, replacement: 'cho thấy' },
  { regex: /(?:^|[\s,])(không có gì khác hơn ngoài việc)(?=[\s,.:;?!]|$)/gi, replacement: 'chỉ là' },
  { regex: /(?:^|[\s,])(cần phải lưu ý một điều là)(?=[\s,.:;?!]|$)/gi, replacement: 'lưu ý' }
];

// Tier 2: Grammatical tokens that can be safely pruned when exceeding time budget
const FILLER_TOKENS = new Set([
  'thì', 'là', 'mà', 'rất', 'những', 'các', 'được', 'đã', 'sẽ', 
  'đang', 'ở', 'nhé', 'thôi', 'này', 'như', 'rằng', 'cái', 'chiếc', 
  'sự', 'việc', 'quá', 'lắm', 'luôn', 'kia', 'hết', 'với'
]);

class TextShortener {
  constructor() {
    this.defaultCharsPerSecond = 19; // Natural conversational Vietnamese speaking speed
  }

  calculateTimeBudget(durationSeconds, charsPerSecond = this.defaultCharsPerSecond) {
    if (!durationSeconds || durationSeconds <= 0) return 60;
    return Math.max(12, Math.floor(durationSeconds * charsPerSecond));
  }

  softShortenVi(rawText, optionsOrDuration = {}) {
    if (!rawText || typeof rawText !== 'string') {
      return {
        originalText: '',
        shortenedText: '',
        charReduction: 0,
        reductionPercent: 0,
        fitsBudget: true
      };
    }

    const options = typeof optionsOrDuration === 'number' 
      ? { targetDuration: optionsOrDuration } 
      : optionsOrDuration;

    const targetDuration = options.targetDuration || 0;
    const charsPerSecond = options.charsPerSecond || this.defaultCharsPerSecond;
    const maxChars = options.maxChars || (targetDuration > 0 ? this.calculateTimeBudget(targetDuration, charsPerSecond) : 9999);

    let text = rawText
      .replace(/\.{3,}$/, '') // Remove trailing ellipsis (...)
      .replace(/\s+/g, ' ')
      .trim();

    const originalLength = text.length;

    // Step 0: If already within budget, return cleanly
    if (text.length <= maxChars && !options.forcePrune) {
      return {
        originalText: rawText,
        shortenedText: text,
        charReduction: 0,
        reductionPercent: 0,
        fitsBudget: true,
        maxChars
      };
    }

    // Step 1: Prune multi-word conversational filler phrases
    for (const phrase of FILLER_PHRASES) {
      text = text.replace(phrase.regex, (match, p1) => {
        return phrase.replacement ? ' ' + phrase.replacement + ' ' : ' ';
      }).replace(/\s+/g, ' ').trim();
      if (text.length <= maxChars && !options.forcePrune) break;
    }

    // Step 2: Prune individual filler tokens if text still exceeds budget
    if (text.length > maxChars || options.forcePrune) {
      const words = text.split(/\s+/);
      const keptWords = [];
      // Độ dài hiện tại sau mỗi lần bỏ từ — dừng cắt ngay khi đã vừa ngân sách
      // (trước đây so với độ dài ban đầu nên vượt 1 ký tự cũng bỏ sạch mọi từ đệm như đã/sẽ/đang/rất/được)
      let currentLength = text.length;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const lower = word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

        // Preserve first word of sentence, and preserve words with trailing major punctuation
        const isFirst = (i === 0);
        const hasMajorPunct = /[.!?]$/.test(word);

        if (!isFirst && !hasMajorPunct && FILLER_TOKENS.has(lower) && (currentLength > maxChars || options.forcePrune)) {
          // Omit token
          currentLength -= word.length + 1;
          continue;
        }

        keptWords.push(word);
      }

      text = keptWords.join(' ').replace(/\s+/g, ' ').trim();

    // Deduplicate repeated replacement connectors (e.g. 'vì thế vì thế' -> 'vì thế')
    text = text.replace(/\b(vì thế|hiện tại|thực tế|cho thấy|lưu ý|thấy rằng)\s+\1\b/gi, '$1');
    }

    // Step 3: Clean up punctuation and capitalize first character
    text = text
      .replace(/\s+([,.?!:;])/g, '$1')
      .replace(/([,.?!:;]){2,}/g, '$1')
      .trim();

    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    const shortenedLength = text.length;
    const charReduction = originalLength - shortenedLength;
    const reductionPercent = originalLength > 0 ? Math.round((charReduction / originalLength) * 100) : 0;

    return {
      originalText: rawText,
      shortenedText: text,
      originalLength,
      shortenedLength,
      charReduction,
      reductionPercent,
      fitsBudget: shortenedLength <= maxChars,
      maxChars
    };
  }

  fitToCueWindow(cues, options = {}) {
    if (!Array.isArray(cues)) return [];

    return cues.map(cue => {
      const duration = Math.max(0.5, (cue.end - cue.start) / 1000);
      const res = this.softShortenVi(cue.text, { targetDuration: duration, ...options });
      return {
        ...cue,
        originalText: cue.text,
        text: res.shortenedText,
        fitsBudget: res.fitsBudget,
        reductionPercent: res.reductionPercent
      };
    });
  }
}

module.exports = new TextShortener();
