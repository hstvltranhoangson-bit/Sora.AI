import { Sora } from './sora.js';
import { FxLayer, GRAB_FRAMES } from './fx.js';
import { Chip, Mask } from './chip.js';
import { Panel } from './panel.js';
import { Voice } from './voice.js';
import { Brain } from './brain.js';
import { Guide } from './guide.js';
import { Mission } from './mission.js';
import { Chat } from './chat.js';
import { Setup } from './setup.js';
import { Custom } from './custom.js';
import { linesFor } from './lines.js';
import { pick, fmt, reducedMotion } from './util.js';
import { createSoraFeatures } from './sora-features.mjs'; // SORA-FEATURES-INTEGRATION

const host = window.host;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Không tải được tài nguyên ảnh RT: ${src}`));
    img.src = src;
  });
}

// Fonts are cosmetic. A failed/missing font must never stop the character's
// WebGL initialization or make the transparent overlay look completely empty.
function loadOptionalFont(specification) {
  return Promise.race([
    document.fonts.load(specification).catch((error) => {
      console.warn('[Sora] Font RT không tải được, dùng font hệ thống:', specification, error);
      return [];
    }),
    new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
  ]);
}

// close-ups of her for the cut-ins, frames of the show (tools/build-cutins.py)
const CUTINS = ['grin', 'laugh', 'eyes', 'many', 'look'];
const WATCH_MS = 140; // dự phòng khi Windows không chuyển tiếp sự kiện chuột

// Lời chào đầu phiên: đa dạng sắc thái, không lặp một thông báo máy móc.
// Mỗi lần khởi động chọn một lời; face dùng chính bộ nét mặt RT hiện có.
const SORA_OPENERS = [
  { face:'grin',  line:'Hey! Em ở đây cơ mà! Anh định quên em thật đấy à? ♡' },
  { face:'aside', line:'Chán quá, anh đang làm gì thế? Cho em hóng với nào!' },
  { face:'laugh', line:'Em mới tìm được thứ hay ho lắm này!? (≧∀≦)ゞ Anh muốn xem không?' },
  { face:'look',  line:'Ồ, anh đến rồi! Em cứ tưởng phải ngồi đợi thêm một chút nữa cơ.' },
  { face:'grin',  line:'Này anh, nhìn em một cái đi! Em có chuyện rất nghiêm túc... để trêu anh.' },
  { face:'aside', line:'Hừm... Anh cứ chăm chú vào màn hình mãi. Em dỗi đúng ba giây thôi đấy!' },
  { face:'laugh', line:'A ha! Hôm nay trông anh có vẻ sẵn sàng cho một cuộc phiêu lưu rồi nhỉ?' },
  { face:'look',  line:'Anh có mệt không? Nếu có, em ngồi yên cạnh anh một lát nhé. ♡' },
  { face:'grin',  line:'Suỵt... Em vừa nảy ra một trò vui. Nhưng để em giữ bí mật thêm chút!' },
  { face:'wide',  line:'Ối, anh xuất hiện bất ngờ quá! Em còn chưa kịp làm mặt ngầu nữa!' },
  { face:'laugh', line:'Anh ơi, hôm nay em có rất nhiều năng lượng! Chúng mình làm gì trước nhỉ?' },
  { face:'aside', line:'Một chút yên bình cũng hay nhỉ... Miễn là anh vẫn ở quanh đây.' },
];

// what you made her, from the config (custom.js)
const mine = (cfg) => ({ userName: cfg.userName || '', persona: cfg.persona || '', myLines: cfg.myLines || [], memories: cfg.memories || [] });

async function boot() {
  const [config, image, intro, ...cutins] = await Promise.all([
    host.getConfig(),
    loadImage('../../assets/sora/sora-full.png'),
    // her intro: her close-up grabbing the screen, and its drawings with her mouth and arm moving
    Promise.all(GRAB_FRAMES.map((name) => loadImage(`../../assets/sora/intro-${name}.webp`).catch(() => null)))
      // decoded now, not the first time each one shows up (a hitch right on "hi", on the wave)
      .then((cels) => Promise.all(cels.map((cel) => cel && createImageBitmap(cel))))
      .then((cels) => (cels[0] ? Object.fromEntries(GRAB_FRAMES.map((name, i) => [name, cels[i]])) : null)),
    ...CUTINS.map((name) => loadImage(`../../assets/sora/cutin-${name}.png`)),
    loadOptionalFont('600 16px "Chakra Petch"'),
    loadOptionalFont('400 11px "JetBrains Mono"'),
  ]);
  document.documentElement.lang = config.lang;
  // her animations: like Windows, full or reduced (her menu)
  const applyMotion = (setting) => {
    reducedMotion.setting = setting || 'auto';
    document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'full';
  };
  applyMotion(config.motion);
  reducedMotion.onSystemChange(() => applyMotion(reducedMotion.setting));

  const fx = new FxLayer(document.getElementById('fx'), {
    cutins: Object.fromEntries(CUTINS.map((name, i) => [name, cutins[i]])),
    intro,
  });
  fx.resize(innerWidth, innerHeight);
  // how far the top of the taskbar is from the bottom of her window: she covers it too while she
  // rests on it (the floor she stands on stays its top)
  let floorGap = config.floorGap ?? 0;
  const chip = new Chip(document.getElementById('chip'));
  chip.place(innerWidth, innerHeight - floorGap);
  const mask = new Mask(document.getElementById('mask'));

  const voice = new Voice();
  voice.configure(config);
  host.listSounds().then((list) => list.length && voice.loadCustom(list));

  const panel = new Panel({
    panel: document.getElementById('panel'),
    ticker: document.getElementById('ticker'),
    labels: linesFor(config.lang, config.assistant),
  });

  const sora = new Sora({
    root: document.getElementById('sora'),
    canvas: document.getElementById('sprite'),
    image,
    fx,
    voice,
  });
  sora.wander = config.wander;
  sora.possessWindows = config.possess;
  sora.restOn = config.rest || 'corner';
  sora.setView(innerWidth, innerHeight, innerHeight - floorGap);
  sora.setScale(config.scale);

  const mission = new Mission();
  const brain = new Brain({ sora, panel, voice, host, mission, lang: config.lang, assistant: config.assistant });

  // Click-through everywhere except on her body, the panel and her biochip.
  let interactive = false;
  let mouse = null;
  const setInteractive = (on) => {
    if (on === interactive) return;
    interactive = on;
    host.setInteractive(on);
  };
  const onChip = () => Boolean(chip.visible && mouse && chip.contains(mouse.x, mouse.y, 6));
  const onMask = () => Boolean(mask.visible && mouse && mask.contains(mouse.x, mouse.y, 0)); // SORA-ALL-FIX
  const refreshHit = () => {
    if (sora.dragging) return setInteractive(true);
    if (!mouse) return setInteractive(false);
    const r = panel.rect();
    const onPanel = r && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom;
    document.body.style.cursor = (onChip() || onMask()) ? 'pointer' : '';
    return setInteractive(Boolean(onPanel || sora.grabbable(mouse.x, mouse.y) || onChip() || onMask())); // SORA-ALL-FIX
  };
  // Her biochip: her eyes on it follow the pointer over it, and she comes out when you click it
  // (only then, so the pointer passing through that corner doesn't call her back).
  // Her mask, asleep: the pointer coming over it stirs her, and a moment of that wakes her up.
  let wakeTimer = 0;
  const comeOut = () => {
    if (sora.stowed) host.setConfig({ visible: true }); // the tray and Ctrl+Alt+C follow
    sora.unstow();
  };
  const hoverChip = () => {
    chip.pointer = chip.visible && mouse && chip.contains(mouse.x, mouse.y) ? mouse : null;
    const near = mask.visible && mouse && mask.contains(mouse.x, mouse.y, 30);
    mask.pointer = near ? mouse : null;
    if (!near) {
      clearTimeout(wakeTimer);
      wakeTimer = 0;
    } else if (!wakeTimer) {
      wakeTimer = setTimeout(() => {
        wakeTimer = 0;
        if (sora.dormant) sora.wake();
      }, 400);
    }
  };
  let lastMove = 0;
  window.addEventListener('mousemove', (e) => {
    lastMove = performance.now();
    mouse = { x: e.clientX, y: e.clientY };
    refreshHit();
    hoverChip();
  });
  document.addEventListener('mouseleave', () => {
    mouse = null;
    refreshHit();
    hoverChip();
  });
  // Một số phiên Windows ngừng gửi mousemove khi cửa sổ Electron đang click-through.
  // Đọc vị trí thực tế từ hệ điều hành để vùng nhấp/kéo nhân vật luôn được mở lại.
  let seen = null;
  let rearmedAt = -Infinity;
  let cursorRequestPending = false;
  setInterval(async () => {
    if (cursorRequestPending) return;
    cursorRequestPending = true;
    try {
      const at = await host.cursor().catch(() => null);
      if (!at) return;
      const before = seen;
      seen = at;
      const moved = !before || at.x !== before.x || at.y !== before.y || at.inside !== before.inside;
      if (!moved && !sora.dragging) return;
      mouse = at.inside ? { x: at.x, y: at.y } : null;
      refreshHit();
      hoverChip();
      const now = performance.now();
      // Chỉ dựng lại mouse hook nếu chuyển động đã lâu không tới renderer.
      if (at.inside && before?.inside && moved && now - lastMove > 20000 && now - rearmedAt > 20000) {
        rearmedAt = now;
        host.rearm();
      }
    } finally {
      cursorRequestPending = false;
    }
  }, WATCH_MS);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) host.openMenu();
  });
  // SORA-ALL-FIX: pointerdown is reliably delivered even when Windows suppresses click.
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (chip.visible && chip.contains(e.clientX, e.clientY, 6)) {
      e.stopPropagation();
      comeOut();
    } else if (mask.visible && mask.contains(e.clientX, e.clientY, 0)) {
      e.stopPropagation();
      sora.rouse();
    }
  }, { capture: true });

  // wiring
  sora.onMove = (head) => {
    // pointing at something: the panel goes on her other side, so it doesn't cover it
    panel.setAnchor({ ...head, lean: sora.pointing ? -sora.pointing.dir : 0 }, sora.view);
    // she may have moved out from under a still pointer: never leave a dead click zone behind
    refreshHit();
  };
  sora.onTeleport = (phase) => (phase === 'start' ? panel.suspend() : panel.resume());
  sora.chipAt = () => chip.center();
  sora.onStow = () => {
    chip.setMode(sora.mode);
    chip.show();
  };
  sora.onUnstow = () => chip.hide();
  sora.onDoze = (phase, face) => {
    if (phase === 'start') {
      mask.place(face.x, face.y, sora.scale * 1.1);
      mask.show();
    } else if (phase === 'waking') {
      mask.wake();
    } else {
      mask.hide();
    }
  };
  sora.onMode = (mode, prev) => chip.setMode(mode, prev);
  // now and then she says something about the satellite: while she looks at it, or once
  // the red light has gone up (never during, nothing should cover that)
  sora.onGaze = (when) => {
    const lines = when === 'end' ? brain.t.uplink : brain.t.gaze;
    if (!panel.visible && Math.random() < (when === 'end' ? 0.6 : 0.4)) panel.say({ kind: 'info', line: pick(lines), hold: 3800 });
  };
  sora.onClick = () => {
    if (sora.menuOpen) { host.closeMenu?.(); return; } // SORA-ALL-FIX
    if (panel.visible) panel.hide();
    else if (config.soraMode) chat.start();
    else brain.status();
  };
  panel.onChar = (kind) => voice.play('blip', { mood: kind });
  panel.onTalk = (talking) => talking && sora.perform('talk');
  sora.onMenu = () => {
    host.openMenu(sora.menuAnchor()); // menu không được che cả Sora khi đang ngồi/nằm
  };
  sora.onDoubleMenu = () => { // SORA-ALL-FIX
    host.closeMenu?.();
    if (config.soraMode) chat.start();
    else brain.onTalk?.();
  };

  // Her guide (guide.js): her welcome on first launch, and "How does it work?" in her menu,
  // where she takes you to things and points at them.
  const guide = new Guide({ sora, panel, voice, host, brain });
  // Talking to her (chat.js): "Talk to her" in her menu, or the button when you click her idle.
  const chat = new Chat({ sora, panel, voice, host, brain });
  chat.soraFeatures = createSoraFeatures(sora); // SORA-FEATURES-INTEGRATION
  setInterval(() => chat.soraFeatures.tick(), 10000);
  // Nhãn AI phản ánh trạng thái Python/Ollama, không suy từ navigator.onLine.
  // Ollama chạy ngoại tuyến vẫn là AI ONLINE; fallback ký ức mới là AI OFFLINE.
  let statusCheckInFlight = false;
  const updateChatNetwork = async () => {
    if (panel.current?.kind !== 'chat' || statusCheckInFlight) return;
    statusCheckInFlight = true;
    try {
      chat.updateBackendStatus(await host.chatStatus());
    } catch (_) {
      // Keep the last known status during a transient backend restart.
    } finally {
      statusCheckInFlight = false;
    }
  };
  window.addEventListener('online', updateChatNetwork);
  window.addEventListener('offline', updateChatNetwork);
  // Ollama is a local service; starting it does not trigger browser online/offline.
  // Refresh while the dialogue is visible, without opening extra connections at idle.
  setInterval(updateChatNetwork, 10000);
  brain.onTalk = () => chat.start();
  window.addEventListener('keydown', (e) => { // SORA-FUSION
    if (e.key === 'Escape' && chat.turn) host.chatStop(chat.turn);
  });
  // Getting her chat going with buttons (setup.js): Ollama and a model, a key, or an address
  const setup = new Setup({ guide, panel, host, brain, sora, voice });
  guide.setup = setup;
  guide.onTalk = () => chat.start();
  // RT provides character behaviors, but Python Sora is the only LLM.
  chat.onSetup = config.soraMode ? null : (status) => setup.chat(status);
  chat.onBetterModel = config.soraMode ? null : () => setup.better();
  setup.onReady = () => chat.start();
  // What she calls you, how she is, your lines, what she remembers (custom.js)
  const custom = new Custom({ guide, host, brain, sora, voice });
  guide.custom = custom;
  brain.custom = mine(config);
  // the first Claude Code event that ever reaches her: so you know it worked
  brain.linked = config.linked;
  brain.watching = !config.soraMode && config.claude !== false;
  brain.onLinked = () => {
    host.setConfig({ linked: true, welcomed: true });
    voice.play('hello');
    sora.perform('hop');
    panel.say({ kind: 'done', badge: 'LINK', line: brain.t.welcome.linked, hold: 6000 });
  };

  // The demo's second half, after its fake Claude session: everything she does on her own, one
  // after the other, a line before each.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (done, max = 15000) => {
    for (const t0 = Date.now(); !done() && Date.now() - t0 < max;) await wait(100);
  };
  const free = () => !sora.busy && !sora.act && sora.stance !== 'fall';
  brain.onShowcase = async () => {
    const t = brain.t.showcase;
    const caption = (line) => panel.say({ kind: 'info', line, hold: 2200 });
    sora.nextMove = sora.nextGaze = performance.now() + 120000; // nothing of her own in between
    if (sora.stowed) await sora.unstow();
    if (sora.dormant) sora.wake();
    await until(free);
    panel.hide();

    caption(t.minds);
    await wait(1000);
    await sora.perform('split');
    await wait(900);

    caption(t.zap);
    await wait(1000);
    const h = sora.head();
    sora.zap(h.x + sora.towardCenter() * 280, h.y - 170);
    await wait(1800);

    panel.hide();
    if (sora.gaze({ big: true })) await until(() => !sora.sky);
    await wait(2500);

    // a little terminal opens for her to take over, and closes under her once she's done with it
    if (sora.possessWindows && (await host.demoWindow(true))) {
      const top = () => sora.windows.wins.find((w) => sora.canSit(w)); // it opens on top of everything
      await until(top, 4000);
      const win = top();
      const seat = win && { win, dx: win.w * 0.4 };
      if (seat) {
        panel.hide();
        await sora.sitOn(seat);
        await until(free);
        caption(t.possess);
        await wait(1400);
        panel.hide();
        await sora.possess();
        await wait(1800);
      }
      host.demoWindow(false);
      await wait(400);
      await until(free); // she may have fallen off it
      await wait(900);
    }

    caption(t.sleep);
    await wait(1400);
    panel.hide();
    sora.setMode('sleep');
    await wait(2500); // dozing off
    await sora.doze();
    await wait(4500);
    sora.wake();
    await until(free);
    await wait(1200);

    caption(t.chip);
    await wait(1600);
    panel.hide();
    await sora.stow();
    await wait(3500);
    await sora.unstow();
    await wait(600);
    panel.say({ kind: 'info', line: t.end, hold: 5000 });
  };

  if (!config.soraMode) host.onClaudeEvent((evt) => brain.handle(evt));
  if (config.soraMode) {
    // Never draw a second avatar or layer expression images. RT's original
    // cel animations receive cues from the one Sora Python brain.
    let lastMotion = 0;
    host.onSoraEvent((evt) => {
      const animate = (act, minGap = 650) => {
        const now = performance.now();
        if (now - lastMotion < minGap) return;
        lastMotion = now;
        if (act) sora.perform(act, sora.towardCenter());
      };
      switch (evt.event) {
        case 'fusion_hotword': // SORA-FUSION: user opted into wake phrase
        case 'fusion_text': {
          const text = typeof evt.text === 'string' ? evt.text.trim().slice(0,1200) : '';
          void chat.start().then(() => {
            if (text && chat.open && !chat.turn) return chat.send(text);
          }).catch(error => console.warn('[Sora] Không chuyển được lời nói:',error));
          break;
        }
        case 'fusion_voice_error':
          console.warn('[Sora] Micro:',evt.error);
          break;
        case 'thinking':
          sora.attend();
          sora.setMode('work');
          animate('curious');
          break;
        case 'proactive':
          // Short and opt-in; reuse RT's own avatar, no second visual layer.
          if (typeof evt.text === 'string' && evt.text.trim()) {
            sora.attend();
            animate('curious');
            panel.say({ kind: 'info', line: evt.text.slice(0, 420), hold: 14000 });
          }
          break;
        case 'approval_required':
          sora.attend();
          sora.setMode('alert');
          animate('alarm', 0);
          break;
        case 'tool_started':
          sora.setMode('work');
          animate('look');
          break;
        case 'tool_result':
          if (!evt.ok) animate('flinch');
          break;
        case 'completed': {
          sora.setMode('idle');
          if (evt.emotion === 'playful' || evt.emotion === 'annoyed') {
            // Cảm xúc mô phỏng chỉ kích hoạt trò đùa ngắn, không tự ý thao tác máy.
            sora.playfulUntil = performance.now() + 25_000;
          }
          const act = { happy: 'victory', surprised: 'look', concerned: 'curious',
            curious: 'curious', playful: 'victory', annoyed: 'alarm', calm: 'talk' }[evt.emotion] || 'talk';
          animate(evt.tool_succeeded ? 'victory' : act);
          break;
        }
        case 'failed':
          sora.setMode('idle');
          animate('flinch', 0);
          break;
        case 'cancelled':
          sora.setMode('idle');
          break;
        default:
          break;
      }
    });
  }
  host.onWindows((data) => {
    sora.setWindows(data);
    brain.onWindows(data);
    chat.soraFeatures.observe(data); // SORA-FEATURES-INTEGRATION
  });
  // the windows as they are now: the watcher only speaks again when something changes
  host.windowsNow().then((data) => data && sora.setWindows(data));

  host.onResize(({ width, height, gap = 0 }) => {
    floorGap = gap;
    fx.resize(width, height);
    chip.place(width, height - gap);
    sora.setView(width, height, height - gap);
  });
  window.addEventListener('resize', () => {
    fx.resize(innerWidth, innerHeight);
    chip.place(innerWidth, innerHeight - floorGap);
    sora.setView(innerWidth, innerHeight, innerHeight - floorGap);
  });

  host.onConfig((cfg) => {
    voice.configure(cfg);
    sora.wander = cfg.wander;
    sora.possessWindows = cfg.possess;
    const previousRest = sora.restOn;
    sora.restOn = cfg.rest || 'corner';
    if (previousRest !== sora.restOn && sora.mode === 'idle' && !sora.busy) sora.goHome();
    applyMotion(cfg.motion);
    if ((cfg.claude === false && brain.watching) || cfg.assistant !== brain.assistant) {
      guide.answer(null);
      panel.hide();
      sora.stopPointing();
      brain.replyFor = null;
      brain.linked = cfg.linked;
      // no longer watching Claude Code: whatever it was in the middle of is no business of hers
      brain.sessions.clear();
      panel.setTicker(null);
      if (sora.mode === 'work' || sora.mode === 'alert') sora.setMode('idle');
    }
    brain.watching = !cfg.soraMode && cfg.claude !== false;
    brain.custom = mine(cfg);
    brain.assistant = cfg.assistant;
    panel.labels = linesFor(cfg.lang, cfg.assistant);
    if (cfg.scale !== sora.scale) sora.setScale(cfg.scale);
    if (cfg.lang !== brain.lang) {
      brain.lang = cfg.lang;
      panel.labels = linesFor(cfg.lang, cfg.assistant);
      document.documentElement.lang = cfg.lang;
    }
  });

  host.onCommand(async (cmd) => {
    const t = brain.t;
    switch (cmd.name) {
      case 'menu-state':
        sora.setMenuOpen(cmd.open === true);
        // Đợi danh sách cửa sổ ổn định sau khi vòng điều khiển mất focus.
        if (!cmd.open) setTimeout(() => {
          if (!sora.menuOpen) host.windowsNow().then((data) => data && sora.setWindows(data)).catch(() => {});
        }, 1650);
        break;
      case 'game-emotion': {
        // Tiny, nonintrusive reaction from mini-game; same existing RT animation layer.
        const motions={curious:'curious',surprised:'look',happy:'victory',
          playful:'victory',sad:'flinch',focused:'look'};
        const act=motions[cmd.emotion];
        if(act)animate(act);
        break;
      }
      case 'teleport':
        sora.teleport(sora.spot('random'));
        break;
      case 'status':
        brain.status();
        break;
      case 'customize': // "Make her yours" in her menu
        custom.open();
        break;
      case 'setupChat': // "Set it up with her" in her menu's AI model
        if (config.soraMode) chat.start();
        else setup.chat();
        break;
      case 'setupKey': // "API key or address" in her menu's AI model, or a service picked there that needs one
        setup.key();
        break;
      case 'setupFree': // --dev: Claude Code (or Codex) through Ollama
        setup.free();
        break;
      case 'setupStep': // --dev: one step of her setup on its own (pickModel, pull, pickKeyed, address…)
        guide.scene(() => setup[cmd.step]?.(...(cmd.args || [])));
        break;
      case 'rearmed': // a new mouse hook (main.js): click-through until the pointer comes over her again
        mouse = null;
        refreshHit();
        break;
      case 'rearm': // --dev: as if she'd noticed the pointer no longer reaches her
        host.rearm();
        break;
      case 'loseGl': { // --dev: as if the GPU had been reset (waking from sleep): she goes, then comes back
        const lose = sora.sprite.gl.getExtension('WEBGL_lose_context');
        lose?.loseContext();
        setTimeout(() => lose?.restoreContext(), cmd.ms ?? 1500);
        break;
      }
      case 'answer': { // --dev: as if that button of her panel had been clicked (her chat's too)
        const button = document.querySelector(`.panel__action[data-id="${CSS.escape(cmd.id)}"]`);
        if (button) button.click();
        else guide.answer(cmd.id);
        break;
      }
      case 'assistantChanged': // Claude Code, Codex or Antigravity, picked in her menu
        guide.welcome();
        break;
      case 'welcome': // "How does it work?" in her menu
        if (config.soraMode) {
          panel.say({ kind: 'info', badge: 'Sora',
            line: 'Mình là Sora — nhân vật RT và trí tuệ Python cùng hoạt động trong một ứng dụng.',
            quote: 'Hội thoại qua Ollama. /memory để xem ký ức, /remember để ghi nhớ, /do để yêu cầu thao tác có phê duyệt.',
            hold: 12000 });
        } else guide.menu();
        break;
      case 'forget': // "Forget our conversations" in her menu, maybe with her chat open
        chat.history = [];
        break;
      case 'chat': // "Talk to her" in her menu
        chat.start();
        break;
      case 'report': // "Mission report" in her menu
        if (sora.stowed) {
          host.setConfig({ visible: true });
          await sora.unstow();
        }
        sora.wake();
        if (brain.report()) sora.perform('curious', sora.towardCenter());
        break;
      case 'fakeClaude': { // --dev: the topmost window (the test window) is where a prompt was typed, and you're elsewhere
        const win = sora.windows.wins[0];
        if (win) {
          brain.sessions.set('dev', { id: 'dev', project: 'dev', taskStart: Date.now(), count: 0, files: new Set(), log: [], working: true, waiting: false, window: win.id, seen: Date.now() });
          sora.windows = { ...sora.windows, fg: -1 };
        }
        break;
      }
      case 'guide': // --dev: one topic of her guide (welcome, menu, connect, icon, claude, folder)
        if (cmd.topic === 'welcome') guide.welcome();
        else if (cmd.topic === 'menu') guide.menu();
        else if (typeof guide[cmd.topic] === 'function') guide.scene(() => guide[cmd.topic]());
        break;
      case 'stow': // Ctrl+Alt+C: into her biochip, or back out
        if (cmd.on) sora.stow();
        else sora.unstow();
        break;
      case 'lie':
        if (sora.stowed) await sora.unstow();
        if (sora.stance === 'lie') sora.standUp();
        else if (!sora.lieDown()) panel.say({ kind: 'info', line: 'Em chưa nằm được lúc này, anh đợi em một chút nhé.', hold: 3500 });
        else panel.say({ kind: 'info', line: 'Em nằm gối đầu một lát nha anh… Đôi chân cứ muốn đung đưa mãi thôi. ♡', hold: 3800 });
        break;
      case 'satellite': // the whole sequence, on demand (tray)
        if (sora.stowed) {
          host.setConfig({ visible: true });
          await sora.unstow();
        }
        sora.wake();
        if (sora.stance === 'peek') await sora.unpeek();
        if (!sora.gaze({ big: true })) setTimeout(() => sora.gaze({ big: true }), 1500);
        break;
      case 'hooks':
        if (cmd.ok) panel.say({ kind: 'info', line: cmd.action === 'install' ? t.hooksOk : t.hooksRemoved, hold: 6000 });
        else panel.say({ kind: 'error', line: fmt(t.hooksFail, { error: cmd.error }), hold: 9000 });
        break;
      // --dev helpers
      case 'intro': // her intro again, as when she starts (still: as with Windows' animations off)
        panel.hide();
        await sora.intro(sora.spot('post'), { ...(cmd.still ? { still: true } : {}), ...(config.soraMode ? { caption: 'Sora' } : {}) });
        break;
      case 'pose':
        sora.debug = cmd.params || null;
        if (cmd.still) sora.nextMove = sora.nextGaze = Infinity; // no wandering off mid-test
        if (cmd.hush) {
          panel.setTicker(null);
          panel.hide();
        }
        if (cmd.scale) sora.setScale(cmd.scale);
        if (cmd.stance) sora.setStance(cmd.stance, cmd);
        if (cmd.at) sora.pos = cmd.at;
        if (cmd.facing) sora.facing = cmd.facing;
        sora.drawFrame();
        break;
      case 'config': // a setting, as if changed from her menu
        host.setConfig(cmd.patch || {});
        break;
      case 'focus': // as if window `fg` had come to the front
        sora.windows = { ...sora.windows, fg: cmd.fg };
        brain.onWindows(sora.windows);
        break;
      case 'freeze':
        sora.hidden = Boolean(cmd.on);
        break;
      case 'act':
        // behaviours by method name (gaze, celebrate, hurt, shed, peek, fall, wanderStep...) or acts by name
        if (cmd.act === 'sit') {
          // pile: n-th window she could sit on from the top of the pile (0: the --dev test window
          // opened last), instead of the usual choice
          const top = cmd.pile !== undefined && sora.windows.wins.filter((w) => sora.canSit(w))[cmd.pile];
          const seat = top ? { win: top, dx: top.w * 0.4 } : sora.pickSeat();
          if (seat) sora.sitOn(seat);
        } else if (typeof sora[cmd.act] === 'function') sora[cmd.act](...(cmd.args || []));
        else sora.perform(cmd.act, cmd.dir || 0);
        break;
      default:
        break;
    }
  });

  // entrance: her face big in the corner says hi, then she dives down to her spot
  // (put away last time: she starts in her biochip)
  if (config.visible === false) sora.stowNow();
  else if (intro) await sora.intro(sora.spot('post'), config.soraMode ? { caption: 'Sora' } : {});
  else await sora.materialize(sora.spot('post'));
  // Windows has its animations off and she's following it: she barely moves. The first time, she
  // says so and asks whether to move anyway (her menu › Animations changes it later).
  if (reducedMotion.setting === 'auto' && reducedMotion.system && !config.motionAsked) {
    const m = brain.t.motion;
    await new Promise((done) => {
      const asked = panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: m.line,
        quote: m.quote,
        actions: [{ id: 'full', label: m.full, primary: true }, { id: 'reduced', label: m.still }],
        onAction: (id) => {
          host.setConfig({ motion: id, motionAsked: true });
          panel.hide();
          if (id === 'full') sora.perform('hop');
        },
        onLeave: done,
        hold: null,
      });
      if (!asked) done();
    });
  }
  if (config.soraMode) {
    if (!config.welcomed) host.setConfig({ welcomed: true });
    const welcome = pick(SORA_OPENERS);
    panel.say({
      kind: 'info', badge: 'Sora', face: welcome.face,
      line: welcome.line,
      hold: 6800,
    });
  } else {
    const hooks = await host.hooksStatus();
    if (!config.welcomed || (config.claude && !hooks.installed)) guide.welcome();
    else panel.say({ kind: 'info', line: brain.onlineLine(), hold: 4000 });
  }

  // In the evening, after a real day's work, she brings you her report card once, on her own,
  // at a quiet moment.
  setInterval(() => {
    const day = mission.day;
    const quiet = !brain.busySessions.length && !panel.visible && !guide.running && !sora.busy && !sora.act;
    if (new Date().getHours() < 18 || day.reported || day.missions < 3 || !quiet) return;
    if (sora.stowed || sora.dormant || sora.mode === 'sleep') return;
    if (brain.report()) {
      mission.markReported();
      sora.perform('curious', sora.towardCenter());
    }
  }, 60000);
}

boot().catch((err) => {
  console.error('[Sora] RT avatar boot failed', err);
  // A startup error in a transparent full-screen window otherwise looks like
  // Sora did not start at all. Show the real message even without a sprite.
  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert');
  notice.style.cssText = 'position:fixed;bottom:80px;left:28px;z-index:9999;max-width:520px;padding:16px 20px;background:#25172f;color:white;border:2px solid #fe4ca0;font:14px/1.5 Arial,sans-serif;box-shadow:5px 5px 0 #111;pointer-events:none;';
  notice.textContent = `Sora chưa tải được nhân vật RT: ${err?.message || String(err)}. Kiểm tra thư mục assets\\sora và nhật ký logs\\Sora.log.`;
  document.body.append(notice);
  host?.reportStartupError?.(err?.stack || err?.message || String(err));
});
