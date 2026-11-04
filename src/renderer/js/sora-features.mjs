// Tích hợp tính năng gợi ý từ ba nhánh Sora vào hành vi SORA RT hiện tại.
// Không nhập sprite Sora / nội dung website; không đọc màn hình hoặc gửi tiêu đề cửa sổ đi đâu.
const MAX_FOCUS_MINUTES = 120;

export function createSoraFeatures(sora, { now = () => Date.now() } = {}) {
  let watching = false;
  let previous = null;
  let lastCategory = '';
  let lastReaction = 0;
  let focusingUntil = 0;
  let restoreWander = null;

  const canAct = () => !sora.stowed && !sora.dormant && !sora.hidden
    && !sora.dragging && !sora.busy && !sora.act && sora.mode !== 'sleep';
  const act = (name) => { // SORA-ALL-FIX: respect lying/sitting before animation
    if (typeof sora.playRequestedAct === 'function') {
      void Promise.resolve(sora.playRequestedAct(name, sora.towardCenter())).catch(error => console.warn('[Sora] Hoạt ảnh lỗi:', error));
    } else if (canAct()) sora.perform(name, sora.towardCenter()); // compatible with old test stubs
  };

  function tick() {
    if (focusingUntil && now() >= focusingUntil) {
      focusingUntil = 0;
      if (restoreWander !== null) sora.wander = restoreWander;
      restoreWander = null;
    }
  }

  function observe(data) {
    tick();
    if (!watching || !data || !Array.isArray(data.wins)) return;
    // Windows watcher chỉ gửi category code/game, không đọc tiêu đề cửa sổ.
    const category = data.kind === 'code' || data.kind === 'game' ? data.kind : '';
    if (category === lastCategory) return;
    lastCategory = category;
    if (!category || now() - lastReaction < 30000) return;
    lastReaction = now();
    act(category === 'code' ? 'listen' : 'dance');
  }

  function command(message) {
    tick();
    const s = String(message || '').trim().toLowerCase();
    if (s === '/sora') {
      return 'Sora có thêm: /nhay, /vaytay, /langnghe, /tomo, /phantan, /giatminh, /xoay; /theodoi bat hoặc /theodoi tat (chỉ phản ứng khi đổi ứng dụng); /taptrung 15 hoặc /taptrung tat (giữ Sora ngồi yên). Lời nhắc SQLite: /nhac 15 nghỉ giải lao, /lichnhac, /huy-nhac 1.';
    }
    const animations = {'/nhay':['dance','Em nhảy một điệu nhé!'],
      '/vaytay':['wave','A ha, em chào anh!'],
      '/langnghe':['listen','Em đang chú ý nghe đây.'],
      '/tomo':['curious','Em đang tò mò nhìn anh đấy!'],
      '/to_mo':['curious','Em đang tò mò nhìn anh đấy!'],
      '/phantan':['split','Em thử phân thân một chút nhé!'],
      '/giatminh':['flinch','Ối! Anh làm em giật mình!'],
      '/xoay':['spin','Em xoay một vòng đây!']}; // SORA-ALL-FIX
    if (animations[s]) {
      act(animations[s][0]);
      return animations[s][1];
    }
    if (s === '/theodoi bat') {
      watching = true;
      lastCategory = '';
      return 'Em sẽ phản ứng nhẹ khi anh đổi giữa ứng dụng code và trò chơi. Không chụp hay đọc nội dung màn hình.';
    }
    if (s === '/theodoi tat') {
      watching = false;
      lastCategory = '';
      return 'Em đã ngừng theo dõi loại cửa sổ, anh nhé.';
    }
    if (s === '/taptrung tat') {
      if (focusingUntil && restoreWander !== null) sora.wander = restoreWander;
      focusingUntil = 0;
      restoreWander = null;
      return 'Em có thể di chuyển tự nhiên trở lại rồi!';
    }
    const focus = /^\/taptrung\s+(\d{1,3})$/.exec(s);
    if (focus) {
      const minutes = Number(focus[1]);
      if (minutes < 1 || minutes > MAX_FOCUS_MINUTES)
        return 'Anh chọn từ 1 đến 120 phút nhé.';
      if (!focusingUntil) restoreWander = Boolean(sora.wander);
      sora.wander = false;
      focusingUntil = now() + minutes * 60000;
      act('listen');
      return `Em sẽ hạn chế di chuyển trong ${minutes} phút, nhưng anh vẫn có thể kéo em đi.`;
    }
    return null;
  }

  return {command,observe,tick,get watching(){return watching;},get focusing(){return Boolean(focusingUntil);}};
}
