import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeech, speechText, SoraSpeech } from '../src/shared/sora-voice-pack.mjs';

test('chuẩn hóa câu thoại tiếng Việt khi dò MP3', () => {
  assert.equal(normalizeSpeech('  Hey! Em ở đây cơ mà!  '), normalizeSpeech('hey! em ở đây cơ mà'));
  assert.equal(speechText('Anh xem `x = 1` và https://example.com nhé.'), 'Anh xem và nhé.');
});

test('ưu tiên MP3 nếu lời nói khớp nguyên câu', async () => {
  const events = [];
  const synthesizer = { cancel: () => events.push('cancel'), speak: () => events.push('synthesis') };
  const player = new SoraSpeech({
    synthesis: synthesizer,
    lines: [{ text: 'Hey! Em ở đây cơ mà!', file: 'hello01.mp3' }],
    audioFactory: (url) => ({
      url, volume: 0, play: () => { events.push('audio'); return Promise.resolve(); },
      pause: () => events.push('pause'), currentTime: 1,
    }),
  });
  assert.equal(player.speak('Hey! Em ở đây cơ mà!'), true);
  assert.ok(player.current.url.endsWith('/assets/sora-voices/hello01.mp3'));
  assert.deepEqual(events, ['cancel', 'audio']);
  player.stop();
  assert.deepEqual(events, ['cancel', 'audio', 'pause', 'cancel']);
});

test('lời thoại chưa thu âm vẫn nói bằng TTS; không giả vờ phát clip khác', () => {
  const spoken = [];
  const synthesizer = {
    cancel() {}, getVoices: () => [{ name: 'Vietnamese Female', lang: 'vi-VN' }],
    speak: (utterance) => spoken.push(utterance),
  };
  const player = new SoraSpeech({
    synthesis: synthesizer,
    lines: [{ text: 'Chào anh', file: 'hello.mp3' }],
    utteranceFactory: (text) => ({ text }),
    audioFactory: () => { throw Error('Không nên mở MP3'); },
  });
  assert.equal(player.speak('Anh hôm nay có vui không?'), true);
  assert.equal(spoken[0].text, 'Anh hôm nay có vui không?');
  assert.equal(spoken[0].lang, 'vi-VN');
});
