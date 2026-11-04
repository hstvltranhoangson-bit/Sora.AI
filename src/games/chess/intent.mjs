// Luật kết thúc bằng hội thoại: chỉ nhận ý định rõ ràng, tránh nhầm câu phủ định.
const plain = (value) => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

// Trả về ý định chơi cờ, không cần gọi mô hình AI hay có Internet.
// Luôn ưu tiên phủ định và lời khích tướng hơn từ "nhường" xuất hiện riêng lẻ.
export function chessChatIntent(message) {
  const text = plain(message).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 240) return null;
  const negation = /\b(khong|ko|khoi|dung|chua|chang)\s+(?:(?:co|can|muon|nen)\s+)?(?:choi lai|van moi|xep lai|dau lai|bat dau lai|danh lai)\b/;
  const replay = /\b(van moi|choi lai|danh lai|dau lai|tai dau|lam van (?:moi|khac)|choi van khac|bat dau lai|xep lai ban co|reset ban co|lai nao|van khac nao|rematch)\b/;
  if (replay.test(text) && !negation.test(text) &&
      !/\b(lan truoc|hom truoc|nhac lai|ke lai|nhac den)\b/.test(text)) return 'rematch';

  const serious = /\b(khong (?:can|muon) (?:em )?nhuong|ko (?:can|muon) (?:em )?nhuong|dung (?:co )?nhuong|khoi nhuong|khong can de|khong choi de|khong phai nhuong|choi that|choi het suc|danh het suc|danh that|choi dung suc|choi nghiem tuc|danh nghiem tuc|danh manh|dung nuong tay|khong can nuong tay|ngon thi|dam dau|chi co the thoi|yeu the|yeu lam|nhat qua|choi kem|danh kem|the ma doi thang|thua chac|thua anh di)\b/;
  if (serious.test(text)) return 'serious';

  const gentle = /\b(nhuong (?:anh|toi|mot chut)|em nhuong|choi nhe|di nhe|danh nhe|de thoi|de di|de mot chut|de hon|nhe tay|nuong tay|tha anh|cho anh thang|choi de|em di de|anh muon (?:de|nhuong)|danh de|lam on nhuong)\b/;
  if (gentle.test(text) && !/\b(khong|ko|dung|chua|chang|khoi)\s+(?:can\s+|muon\s+)?(?:em\s+)?(?:nhuong|choi nhe|di nhe|nuong tay|danh nhe)\b/.test(text)) return 'gentle';
  return null;
}

export function wantsToConcede(message) {
  const text = plain(message).replace(/\s+/g, ' ').trim();
  if (!text || text.length > 280 || text.includes('?')) return false;
  const expressions = /\b(dau hang|chiu thua|xin thua|bo cuoc|em thang roi|anh thua roi|anh xin thua)\b/g;
  for (const match of text.matchAll(expressions)) {
    const prefix = text.slice(Math.max(0, match.index - 26), match.index);
    if (/\b(khong|chua|dung|chẳng|chang|ko|khong muon|noi|đừng)\b/.test(prefix)) continue;
    return true;
  }
  return false;
}

export function moodBasedConcession(mood, confidence = 0.5) {
  // Ván chơi đặc biệt: em có thể nhường thắng vì đang dịu dàng/lo lắng.
  if (['worried', 'sad', 'calm'].includes(mood) ||
      (mood === 'playful' && confidence < 0.5)) {
    return { winner:'w', reason:'sora-yields',
      line:'Anh muốn đầu hàng à? Thôi, ván này em nhường anh thắng. Đừng tưởng lần sau cũng dễ nhé! ♡' };
  }
  return { winner:'b', reason:'user-concedes',
    line:'Anh đầu hàng thật sao? Vậy em xin nhận chiến thắng này nhé! Lần tới em chờ anh phục thù đó. ♡' };
}
