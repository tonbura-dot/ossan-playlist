// オープニング演出: 雨のネオン街 → 人影が2階建ての家へ（カット割り）→ ドアが閉まる
// → 薄暗い部屋のラジオとブラウン管テレビ → テレビに寄って砂嵐 → 砂嵐がそのままトップページに。
// 全体を1本の時間軸（秒）で管理し、各レイヤーの見た目を毎フレーム時間から計算する。
// 絵そのものは scenes.ts。

import { VX, VY, EYE } from './scenes';

export const STORAGE_KEY = 'ossan-opening-seen';

// ---- 時間割（秒） ----
const TL = {
  // 人影はカット割り：通りに立つ → 消える → 階段の前にぼんやり → 消える → 登りはじめ
  standOut: [1.7, 2.5],
  stairsIn: [2.75, 3.3],
  stairsOut: [3.75, 4.15],
  climb: [4.25, 5.4],
  climbIn: [4.25, 4.45],
  landing: [5.4, 5.8],
  doorOpen: [5.65, 5.9],
  enter: [5.9, 6.3],
  slam: 6.38,
  black: [6.95, 7.35],
  roomIn: [7.4, 8.4],
  push: [7.3, 10.1], // 部屋の中をゆっくり寄る
  dive: [10.0, 12.0], // テレビの画面へ飛び込む
  fullStatic: [11.35, 11.95],
  reveal: [12.0, 14.4], // 砂嵐がトップページに変わる
  end: 14.6,
} as const;
type Range = readonly [number, number];

// ---- 小さな道具 ----
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t: number, [a, b]: Range) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const zlerp = (a: number, b: number, p: number) => a * Math.pow(b / a, p);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** ネオンのちらつき（ときどき一瞬暗くなる） */
function flick(t: number, k = 0) {
  let f = 0.9 + 0.06 * Math.sin(t * 2.3 + k) + 0.04 * Math.sin(t * 17 + k * 3);
  if (((t + k) * 1.7) % 3.1 < 0.07) f *= 0.35;
  return f;
}

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
  // 確認用: ?opening=1&ot=7.5 でその秒から、&ofreeze でその場で止める、&oreduce で動きを減らした版
  const params = new URLSearchParams(location.search);
  const reduce = params.has('oreduce') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = <T extends Element = SVGElement>(sel: string) => root.querySelector(sel) as T;
  const stage = $<HTMLElement>('.op__stage');
  const street = $<HTMLElement>('.op__street');
  const room = $<HTMLElement>('.op__room');
  const rainC = $<HTMLCanvasElement>('.op__rain');
  const fullC = $<HTMLCanvasElement>('.op__static');
  const tvC = $<HTMLCanvasElement>('.op__tv-static');
  const scan = $<HTMLElement>('.op__scan');
  const black = $<HTMLElement>('.op__black');
  const skip = $<HTMLButtonElement>('.op__skip');
  const soundBtn = $<HTMLButtonElement>('.op__sound');
  const rainX = rainC.getContext('2d')!;
  const fullX = fullC.getContext('2d')!;
  const tvX = tvC.getContext('2d')!;

  const fig = $('#op-fig');
  const figblur = $('#op-figblur');
  const legL = $('#op-legL');
  const legR = $('#op-legR');
  const door = $('#op-door');
  const doorLight = $('#op-door-light');
  const win2 = $('#op-win2');
  const onairSmall = $('#op-onair-small');
  const signs = ['#op-sign-l1', '#op-sign-l2', '#op-sign-r1', '#op-sign-back'].map((s) => $(s));
  const outside = ['#op-out-pink', '#op-out-orange', '#op-out-blue'].map((s) => $(s));
  const spill = $('#op-spill');
  const tvglow = $('#op-tvglow');
  const needle = $('#op-needle');
  const waves = $('#op-waves');
  const dialLight = $('#op-dial-light');

  // オープニングの下にあるページ本体（最後に砂嵐から浮かび上がる）
  const others = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el !== root && el instanceof HTMLElement && el.tagName !== 'SCRIPT',
  );

  // ---- 画面サイズ ----
  let vw = 0;
  let vh = 0;
  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    rainC.width = vw;
    rainC.height = vh;
    fullC.width = Math.ceil(vw / 3);
    fullC.height = Math.ceil(vh / 3);
  }

  // ---- 雨 ----
  const drops = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), l: 0.02 + Math.random() * 0.04, v: 0.9 + Math.random() * 0.8 }));
  function drawRain(dt: number, alpha: number) {
    rainX.clearRect(0, 0, vw, vh);
    if (alpha <= 0) return;
    rainX.strokeStyle = `rgba(255,190,215,${0.28 * alpha})`;
    rainX.lineWidth = 1;
    rainX.beginPath();
    for (const d of drops) {
      d.y += d.v * dt;
      d.x += 0.08 * dt;
      if (d.y > 1.05) {
        d.y = -0.05;
        d.x = Math.random();
      }
      rainX.moveTo(d.x * vw, d.y * vh);
      rainX.lineTo(d.x * vw + d.l * vh * 0.12, (d.y + d.l) * vh);
    }
    rainX.stroke();
  }

  // ---- カメラ（絵の座標 1600×900 のどこを、どの倍率で画面の真ん中に置くか） ----
  function camera(t: number) {
    if (t < 7.2) {
      if (reduce) return { x: 860, y: 460, z: 1.6 };
      const p1 = easeInOut(prog(t, [1.0, 4.6]));
      const p2 = easeInOut(prog(t, [4.2, 5.8]));
      const p3 = prog(t, [5.8, 7.2]);
      let c = { x: lerp(800, 875, p1), y: lerp(500, 470, p1), z: zlerp(1, 1.9, p1) };
      c = { x: lerp(c.x, 838, p2), y: lerp(c.y, 438, p2), z: zlerp(c.z, 2.8, p2) };
      c.z = zlerp(c.z, 3.05, p3);
      return c;
    }
    if (reduce) return { x: 1000, y: 480, z: 1.15 };
    const p = easeOut(prog(t, TL.push));
    let c = { x: lerp(900, 1090, p), y: lerp(470, 492, p), z: zlerp(1, 1.4, p) };
    const d = Math.pow(prog(t, TL.dive), 2.4);
    const k = Math.min(1, d * 3);
    c = { x: lerp(c.x, 1153, k), y: lerp(c.y, 496, k), z: zlerp(c.z, 17, d) };
    return c;
  }

  // ---- 人影 ----
  type Pose = { x: number; y: number; h: number; phase: number; swing: number; op: number; blur: number };
  function figurePose(t: number): Pose | null {
    let x: number, y: number, h: number;
    let phase = 0, swing = 0, op = 1, blur = 0;
    if (t < TL.standOut[1]) {
      // 通りの手前に立っている → 薄く消えていく
      const p = prog(t, TL.standOut);
      const z = 1.2;
      x = VX - 150 / z;
      y = VY + EYE / z;
      h = 230 / z;
      op = 1 - easeInOut(p);
      blur = 4 * p;
    } else if (t < TL.stairsIn[0]) {
      return null;
    } else if (t < TL.stairsOut[1]) {
      // 階段の前にぼんやり出てきて、また消える
      const pin = prog(t, TL.stairsIn);
      const pout = prog(t, TL.stairsOut);
      x = 960;
      y = 566;
      h = 46;
      op = 0.85 * easeInOut(pin) * (1 - easeInOut(pout));
      blur = 3.5 - 2.2 * pin + 3 * pout;
    } else if (t < TL.climb[0]) {
      return null;
    } else if (t < TL.climb[1]) {
      // 階段を登りはじめたところから
      const p = lerp(0.12, 1, prog(t, TL.climb));
      const pin = prog(t, TL.climbIn);
      x = lerp(945, 850, p);
      y = lerp(565, 456, p);
      h = 46;
      phase = t * 10;
      swing = 30;
      op = pin;
      blur = 2.5 * (1 - pin);
    } else if (t < TL.landing[1]) {
      const p = easeOut(prog(t, TL.landing));
      x = lerp(850, 818, p);
      y = 456;
      h = 46;
      phase = t * 8;
      swing = 18 * (1 - p);
    } else if (t < TL.enter[1] + 0.05) {
      // ドアの中へ
      const p = prog(t, TL.enter);
      x = 818;
      y = 456 - p * 1.5;
      h = 46 * (1 - 0.08 * p);
      op = 1 - p;
    } else return null;
    return { x, y, h, phase, swing, op, blur };
  }
  function drawFigure(pose: Pose | null, t: number) {
    if (!pose || pose.op <= 0.001) {
      fig.setAttribute('opacity', '0');
      return;
    }
    const s = pose.h / 100;
    const a = Math.sin(pose.phase) * pose.swing;
    const bob = pose.swing ? -Math.abs(Math.sin(pose.phase)) * 2 : Math.sin(t * 2.2) * 0.4; // 立っているときは呼吸だけ
    fig.setAttribute('opacity', pose.op.toFixed(3));
    figblur.setAttribute('stdDeviation', pose.blur.toFixed(2));
    fig.setAttribute('transform', `translate(${pose.x.toFixed(2)},${pose.y.toFixed(2)}) scale(${s.toFixed(4)}) translate(0,${bob.toFixed(2)})`);
    legL.setAttribute('transform', `translate(-4,-47) rotate(${(a + 1.5).toFixed(1)})`);
    legR.setAttribute('transform', `translate(4,-47) rotate(${(-a - 1.5).toFixed(1)})`);
  }

  // ---- 進行 ----
  const sound = new Sound();
  const freeze = params.has('ofreeze');
  let t = clamp(Number(params.get('ot')) || 0, 0, TL.reveal[1]);
  let last = performance.now();
  let raf = 0;
  let done = false;
  let lastStep = 0;
  let slammed = t > TL.slam;
  let staticTick = 0;

  function frame(now: number) {
    // タブが裏に回ったときなどに時間が飛ばないよう、1フレームの進みに上限を設ける
    const dt = freeze ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    if (t >= TL.end) return finish();

    try {
      draw(t, dt, now);
    } catch (err) {
      // 描画で何か起きても、ページが使えなくならないようにすぐ終える
      console.error(err);
      return finish();
    }
    raf = requestAnimationFrame(frame);
  }

  function draw(t: number, dt: number, now: number) {
    const inStreet = t < 7.35;
    const inRoom = t >= 7.3 && t < TL.reveal[0];
    street.style.display = inStreet ? '' : 'none';
    room.style.display = inRoom ? '' : 'none';
    stage.style.display = t < TL.reveal[0] ? '' : 'none';
    // テレビに飛び込むときだけ、拡大を画像として扱って軽くする
    stage.style.willChange = t > TL.dive[0] ? 'transform' : 'auto';
    const tick = now - staticTick > 33; // 砂嵐は 30 コマ/秒で十分
    if (tick) staticTick = now;

    // 黒の幕
    let b = 0;
    if (t < 1.1) b = 1 - prog(t, [0, 1.1]);
    else if (t < 7.4) b = prog(t, TL.black);
    else if (t < TL.roomIn[1]) b = 1 - prog(t, TL.roomIn);
    black.style.opacity = b.toFixed(3);

    // カメラ（+ ドアが閉まったときの揺れ）
    const c = camera(t);
    const base = Math.max(vw / 1600, Math.min(vh / 900, vw / 760));
    const S = base * c.z;
    let sx = 0;
    let sy = 0;
    const sh = prog(t, [TL.slam, TL.slam + 0.3]);
    if (!reduce && sh > 0 && sh < 1) {
      const k = (1 - sh) * 7;
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
    }
    stage.style.transform = `translate(${(vw / 2 - c.x * S + sx).toFixed(2)}px,${(vh / 2 - c.y * S + sy).toFixed(2)}px) scale(${S.toFixed(5)})`;

    if (inStreet) {
      signs.forEach((el, i) => el.setAttribute('opacity', flick(t, i * 1.9).toFixed(3)));
      const pose = figurePose(t);
      drawFigure(pose, t);
      if (pose && pose.swing > 0) {
        const n = Math.floor(pose.phase / Math.PI);
        if (n !== lastStep) {
          lastStep = n;
          const metal = t < TL.climb[1]; // 鉄の外階段の足音
          sound.burst(metal ? 2600 : 900, 'bandpass', 0.07, metal ? 0.35 : 0.22);
        }
      }
      // ドア：開く → 入る → 閉まる
      const open = prog(t, TL.doorOpen);
      const close = prog(t, [TL.slam - 0.08, TL.slam]);
      const w = 1 - 0.85 * open * (1 - close);
      door.setAttribute('transform', `translate(800,0) scale(${w.toFixed(3)},1) translate(-800,0)`);
      doorLight.setAttribute('opacity', (0.55 * open * (1 - close)).toFixed(3));
      if (t >= TL.slam && !slammed) {
        slammed = true;
        sound.thump();
      }
      // 部屋のテレビの光が窓に映り、ドアの上の ON AIR が点く
      win2.setAttribute('opacity', (prog(t, [6.55, 6.9]) * (0.28 + 0.12 * Math.sin(t * 40))).toFixed(3));
      onairSmall.setAttribute('opacity', (0.25 + 0.75 * prog(t, [6.6, 6.75]) * flick(t, 4)).toFixed(3));
    }
    drawRain(dt, inStreet && !reduce ? 1 - prog(t, [6.6, 7.2]) : 0);

    if (inRoom) {
      spill.setAttribute('opacity', (0.75 * flick(t, 0.7)).toFixed(3));
      outside.forEach((el, i) => el.setAttribute('opacity', flick(t, i * 2.3).toFixed(3)));
      tvglow.setAttribute('opacity', (0.75 + Math.random() * 0.25).toFixed(3));
      needle.setAttribute('transform', `translate(${(Math.sin(t * 1.3) * 18 + Math.sin(t * 7) * 2).toFixed(2)},0)`);
      dialLight.setAttribute('opacity', (0.45 + Math.random() * 0.12).toFixed(3));
      waves.setAttribute('opacity', (0.25 + 0.25 * Math.sin(t * 9)).toFixed(3));
      if (tick) noise(tvX, tvC.width, tvC.height, t);
    }

    // 画面いっぱいの砂嵐 → トップページへ
    let fs = prog(t, TL.fullStatic);
    if (t >= TL.reveal[0]) {
      root.classList.add('is-thin');
      const r = prog(t, TL.reveal);
      fs = 1 - easeInOut(r);
      if (r > 0.35 && r < 0.42) fs = Math.max(fs, 0.85); // 一瞬ぶり返す
      if (r > 0.62 && r < 0.66) fs = Math.max(fs, 0.55);
      const j = fs > 0.1 && !reduce ? (Math.random() - 0.5) * 14 * fs : 0;
      const filter = `contrast(${(1 + fs * 0.6).toFixed(2)}) brightness(${(1 + fs * 0.5).toFixed(2)}) saturate(${(1 - fs * 0.7).toFixed(2)})`;
      others.forEach((el) => {
        el.style.transform = j ? `translateX(${j.toFixed(1)}px)` : '';
        el.style.filter = filter;
      });
      scan.style.opacity = ((0.15 + 0.85 * fs) * (1 - prog(t, [14.0, 14.4]))).toFixed(3);
    } else {
      root.classList.remove('is-thin');
      scan.style.opacity = (fs * 0.9).toFixed(3);
    }
    fullC.style.opacity = fs.toFixed(3);
    if (fs > 0.01 && tick) noise(fullX, fullC.width, fullC.height, t, 1.1);

    if (sound.on) {
      sound.set('rain', inStreet ? 0.05 * (1 - prog(t, [6.4, 6.6])) : 0);
      sound.set('hum', inStreet ? 0.12 : 0);
      sound.set('radio', inRoom ? 0.05 + 0.02 * Math.sin(t * 3) : 0);
      sound.set('tv', t >= 7.4 ? 0.04 + 0.22 * Math.max(prog(t, TL.dive), fs) : 0);
    }
  }

  // ---- 開始と終了 ----
  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    markSeen();
    sound.stop();
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
    soundBtn.textContent = sound.on ? '音を消す' : '音をつける';
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
