// Giọng của Sora thống nhất giữa giao diện chính và cờ vua.
// Ưu tiên câu MP3 có sẵn (offline); nếu lời AI mới thì dùng giọng hệ thống.
import { VOICE_PACK } from './sora-voice-pack-index.mjs';

export function normalizeSpeech(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .replace(/[.!?…,:;\s]+$/u, '')
    .trim();
}

export function speechText(text, maxLength = 300) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/[#*~_<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export class SoraSpeech {
  constructor({
    synthesis = globalThis.speechSynthesis,
    utteranceFactory = (text) => new SpeechSynthesisUtterance(text),
    audioFactory = (src) => new Audio(src),
    lines = VOICE_PACK,
  } = {}) {
    this.synthesis = synthesis;
    this.utteranceFactory = utteranceFactory;
    this.audioFactory = audioFactory;
    this.lines = new Map(lines.map(({ text, file }) => [normalizeSpeech(text), file]));
    this.current = null;
    this.volume = 0.85;
  }

  stop() {
    if (this.current) {
      try { this.current.pause(); this.current.currentTime = 0; } catch { /* Audio đã đóng */ }
      this.current = null;
    }
    this.synthesis?.cancel?.();
  }

  speak(text, { maxLength = 300, volume = this.volume } = {}) {
    const source = String(text || '').trim();
    if (!source) return false;
    const spoken = speechText(source, maxLength);
    if (!spoken) return false;
    this.stop();

    // Chỉ phát clip nếu câu trùng hoàn toàn; không dùng một câu soạn sẵn
    // để thay thế câu trả lời mới mà AI vừa tạo ra.
    const file = this.lines.get(normalizeSpeech(source));
    if (file && /^[a-z][a-z0-9_-]*\.mp3$/i.test(file)) {
      try {
        const url = new URL(`../../assets/sora-voices/${file}`, import.meta.url).href;
        const sound = this.audioFactory(url);
        sound.volume = volume;
        this.current = sound;
        Promise.resolve(sound.play()).catch(() => {
          if (this.current === sound) {
            this.current = null;
            this.speakSystem(spoken, volume);
          }
        });
        return true;
      } catch { /* Tệp MP3 không dùng được: chuyển sang giọng hệ thống */ }
    }
    return this.speakSystem(spoken, volume);
  }

  speakSystem(text, volume = this.volume) {
    if (!this.synthesis || !text) return false;
    try {
      const voiceLine = this.utteranceFactory(text);
      voiceLine.lang = 'vi-VN';
      voiceLine.rate = 1.04;
      voiceLine.pitch = 1.13;
      voiceLine.volume = volume;
      const voices = this.synthesis.getVoices?.() || [];
      voiceLine.voice = voices.find((v) => /^vi([-_]|$)/i.test(v.lang) && /hoai|female|nu\b/i.test(v.name))
        || voices.find((v) => /^vi([-_]|$)/i.test(v.lang)) || null;
      this.synthesis.speak(voiceLine);
      return true;
    } catch (error) {
      console.warn('[Sora] Không phát được giọng đọc:', error);
      return false;
    }
  }
}

export const soraSpeech = new SoraSpeech();
