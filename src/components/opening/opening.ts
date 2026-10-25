// オープニング演出: 雨の交差点の人混み → その中の一人にピントが合う → ネオン街を歩く
// → 路地裏の外階段を上がってドアの中へ → 薄暗い部屋のラジオとブラウン管テレビ → テレビに寄って砂嵐。
// ここまでは動画（public/opening/、元は3DCG）。砂嵐がそのままトップページに変わるところはページの上で描く。

export const STORAGE_KEY = 'ossan-opening-seen';

// ---- 動画の時間割（秒） ----
const V = {
  rainEnd: 12.6, // 外の場面（雨の音）がここまで
  slam: 12.1, // ドアが閉まる
  roomIn: 13.0, // 部屋の場面
  dive: [15.65, 17.55], // テレビへ飛び込む
  full: 17.5, // 画面が砂嵐で埋まる → ここからページの上で続ける
} as const;
// 砂嵐 → トップページ（秒、動画のあと）
const REVEAL = 2.4;
const END = 2.6;

// ---- 小さな道具 ----
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// ---- 砂嵐 ----
let seed = 1234567;
const rnd = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
function noise(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, gain = 1) {
  const img = ctx.createImageData(w, h);
  const d = new Uint32Array(img.data.buffer);
  const roll = ((t * 0.35) % 1) * h; // ゆっくり下がっていく明るい帯
  for (let y = 0; y < h; y++) {
    const band = Math.abs(y - roll) < h * 0.06 ? 1.35 : 1;
    const tear = rnd() < 0.015 ? 0.5 : 1;
    for (let x = 0; x < w; x++) {
      let v = rnd() * 255 * band * tear * gain;
      v = v > 255 ? 255 : v | 0;
      d[y * w + x] = 0xff000000 | (((v * 0.97) | 0) << 16) | (v << 8) | ((v * 0.95) | 0);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---- 音（ボタンを押したときだけ。WebAudio でその場で作る） ----
class Sound {
  ctx: AudioContext | null = null;
  on = false;
  private master!: GainNode;
  private buf!: AudioBuffer;
  private g: Record<string, GainNode> = {};

  private init() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const ctx = (this.ctx = new AC());
    const buf = (this.buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate));
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const chain = (name: string, type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      this.g[name] = g;
    };
    chain('rain', 'bandpass', 5000, 0.4);
    chain('hum', 'lowpass', 160);
    chain('radio', 'bandpass', 1500, 1.4);
    chain('tv', 'highpass', 700);
    src.start();
    return true;
  }
  toggle() {
    if (!this.ctx && !this.init()) return false;
    const ctx = this.ctx!;
    this.on = !this.on;
    if (ctx.state === 'suspended') void ctx.resume();
    this.master.gain.setTargetAtTime(this.on ? 1 : 0, ctx.currentTime, 0.05);
    return this.on;
  }
  set(name: string, v: number) {
    if (this.ctx) this.g[name].gain.setTargetAtTime(v, this.ctx.currentTime, 0.06);
  }
  burst(freq: number, type: BiquadFilterType, dur: number, vol: number) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now, Math.random());
    src.stop(now + dur + 0.05);
  }
  /** ドアが閉まる音 */
  thump() {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.35);
    this.burst(700, 'lowpass', 0.18, 0.7);
  }
  stop() {
    for (const k in this.g) this.set(k, 0);
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    window.setTimeout(() => void this.ctx?.close(), 800);
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* 保存できない環境では次回も再生される（仕様どおり） */
  }
}


// =====================================================================
export function runOpening(root: HTMLElement) {
  // 確認用: ?opening=1&ot=15 で動画のその秒から、&oreduce で動きを減らした版（動画なしで砂嵐だけ）
  const params = new URLSearchParams(location.search);
  const reduce = params.has('oreduce') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const video = $<HTMLVideoElement>('.op__video');
  const fullC = $<HTMLCanvasElement>('.op__static');
  const scan = $<HTMLElement>('.op__scan');
  const skip = $<HTMLButtonElement>('.op__skip');
  const soundBtn = $<HTMLButtonElement>('.op__sound');
  const fullX = fullC.getContext('2d')!;

  // オープニングの下にあるページ本体（最後に砂嵐から浮かび上がる）
  const others = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el !== root && el instanceof HTMLElement && el.tagName !== 'SCRIPT',
  );

  function resize() {
    fullC.width = Math.ceil(window.innerWidth / 3);
    fullC.height = Math.ceil(window.innerHeight / 3);
  }

  // ---- 進行 ----
  // 動画のあいだは video.currentTime が時計。動画が終わったら（または再生できなかったら）r が砂嵐→ページの時計。
  const sound = new Sound();
  let phase: 'video' | 'reveal' = reduce ? 'reveal' : 'video';
  let r = 0;
  let last = performance.now();
  let raf = 0;
  let done = false;
  let slammed = false;
  let staticTick = 0;
  let lastVt = -1;
  let stallSince = performance.now();

  function toReveal() {
    if (phase === 'reveal') return;
    phase = 'reveal';
    video.pause();
  }

  if (phase === 'video') {
    // 大きい画面には 1080p、それ以外とデータ節約モードには 720p
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const big = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1) >= 1600;
    video.src = (big && !conn?.saveData ? video.dataset.srcHd : video.dataset.srcSd) || '';
    const start = Number(params.get('ot')) || 0;
    if (start) video.currentTime = start;
    video.addEventListener('ended', toReveal);
    video.addEventListener('error', toReveal);
    // 自動再生できない環境（省電力モードなど）では、砂嵐からページへの切り替えだけ見せる
    video.play().catch(toReveal);
  }

  function frame(now: number) {
    // タブが裏に回ったときなどに時間が飛ばないよう、1フレームの進みに上限を設ける
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      if (phase === 'video') {
        const vt = video.currentTime;
        if (vt !== lastVt) {
          lastVt = vt;
          stallSince = now;
        } else if (now - stallSince > 4000) {
          // 読み込みが止まったまま進まないときは先へ
          toReveal();
        }
        if (vt >= V.full) toReveal();
        drawVideoPhase(vt);
      }
      if (phase === 'reveal') {
        r += dt;
        if (r >= END) return finish();
        drawReveal(r, now);
      }
    } catch (err) {
      // 何か起きても、ページが使えなくならないようにすぐ終える
      console.error(err);
      return finish();
    }
    raf = requestAnimationFrame(frame);
  }

  function drawVideoPhase(vt: number) {
    if (vt >= V.slam && !slammed) {
      slammed = true;
      sound.thump();
    }
    if (sound.on) {
      const inRoom = vt >= V.roomIn;
      sound.set('rain', vt < V.rainEnd ? 0.05 : 0);
      sound.set('hum', vt < V.rainEnd ? 0.12 : 0);
      sound.set('radio', inRoom ? 0.05 + 0.02 * Math.sin(vt * 3) : 0);
      sound.set('tv', inRoom ? 0.04 + 0.22 * prog(vt, V.dive) : 0);
    }
  }

  function drawReveal(t: number, now: number) {
    root.classList.add('is-thin');
    const tick = now - staticTick > 33; // 砂嵐は 30 コマ/秒で十分
    if (tick) staticTick = now;
    const p = prog(t, [0, REVEAL]);
    let fs = 1 - easeInOut(p);
    if (p > 0.35 && p < 0.42) fs = Math.max(fs, 0.85); // 一瞬ぶり返す
    if (p > 0.62 && p < 0.66) fs = Math.max(fs, 0.55);
    const j = fs > 0.1 && !reduce ? (Math.random() - 0.5) * 14 * fs : 0;
    const filter = `contrast(${(1 + fs * 0.6).toFixed(2)}) brightness(${(1 + fs * 0.5).toFixed(2)}) saturate(${(1 - fs * 0.7).toFixed(2)})`;
    others.forEach((el) => {
      el.style.transform = j ? `translateX(${j.toFixed(1)}px)` : '';
      el.style.filter = filter;
    });
    scan.style.opacity = ((0.15 + 0.85 * fs) * (1 - prog(t, [REVEAL - 0.4, REVEAL]))).toFixed(3);
    fullC.style.opacity = fs.toFixed(3);
    if (fs > 0.01 && tick) noise(fullX, fullC.width, fullC.height, t, 1.1);
    if (sound.on) {
      sound.set('radio', 0);
      sound.set('tv', 0.26 * fs);
    }
  }

  // ---- 開始と終了 ----
  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    markSeen();
    sound.stop();
    video.pause();
    video.removeAttribute('src');
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    others.forEach((el) => {
      el.inert = false;
      el.style.transform = '';
      el.style.filter = '';
    });
    document.documentElement.classList.remove('op-play');
    root.remove();
    if (new URLSearchParams(location.search).has('opening')) {
      const u = new URL(location.href);
      u.searchParams.delete('opening');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function skipNow() {
    if (done || root.classList.contains('is-leaving')) return;
    root.classList.add('is-leaving');
    cancelAnimationFrame(raf);
    video.pause();
    others.forEach((el) => {
      el.style.transform = '';
      el.style.filter = '';
    });
    root.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 600); // transitionend が来ない環境の保険
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') skipNow();
  }

  function syncSound() {
    soundBtn.setAttribute('aria-pressed', String(sound.on));
    soundBtn.textContent = sound.on ? 'SOUND OFF' : 'SOUND ON';
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('keydown', onKey);
  skip.addEventListener('click', skipNow);
  soundBtn.addEventListener('click', () => {
    sound.toggle();
    syncSound();
  });
  others.forEach((el) => (el.inert = true));
  root.classList.add('is-running');
  skip.focus({ preventScroll: true });
  raf = requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
}
