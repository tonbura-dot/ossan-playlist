// オープニング演出（マザー2がコンセプトのドット絵）:
// 宇宙でゆっくり回る地球 → だんだん寄って、夜のネオンの街へ → 街の路地へ寄る
// → 路地裏の外階段を上がってドアの中へ → 部屋のジュークボックス → 光にズームしてトップページへ。
// 絵は pixel.ts。小さなキャンバスに描いて、ドットのまま拡大して見せる。

import { CITY_H, CITY_TARGET, CITY_W, clamp, dither, drawAlley, drawCity, drawClouds, drawEarth, drawRoom, ease, lerp } from './pixel';

export const STORAGE_KEY = 'ossan-opening-seen';

// ---- 時間割（秒） ----
const T = {
  earth: [0, 6.0],
  earthZoom: [2.6, 6.0],
  earthTurn: [1.8, 5.4],
  night: [3.4, 5.4],
  clouds: [5.0, 7.0], // 雲を突き抜けて街へ
  city: [6.0, 10.2],
  cityZoom: [6.5, 10.0],
  alley: [10.2, 14.2],
  walk: [10.2, 11.7],
  climb: [11.7, 12.9],
  landing: [12.9, 13.25],
  door: [13.1, 13.3],
  entered: 13.35,
  slam: 13.55,
  room: [14.2, 18.0],
  roomZoom: [15.9, 18.0],
} as const;
const END = 18.0;
const REVEAL = 1.6; // ジュークボックスの光 → トップページ
const FADE = 0.4; // 場面のつなぎ（黒の網かけ）

const prog = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const inside = (t: number, [a, b]: readonly [number, number]) => t >= a && t < b;

// ---- 音（ボタンを押したときだけ。WebAudio でその場で作る） ----
const m2f = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// ジュークボックスの曲（8分音符ごと。0 は休み）
const MELODY = [72, 0, 75, 77, 79, 0, 77, 75, 72, 0, 70, 72, 75, 0, 0, 0, 72, 0, 75, 77, 79, 82, 79, 77, 75, 0, 72, 70, 72, 0, 0, 0];
const BASS = [36, 43, 41, 43, 36, 43, 46, 43];
const STEP = 0.2;

class Sound {
  ctx: AudioContext | null = null;
  on = false;
  private master!: GainNode;
  private g: Record<string, GainNode> = {};
  private next = 0;
  private step = 0;

  private init() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const ctx = (this.ctx = new AC());
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = (name: string, from: AudioNode) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      from.connect(g);
      g.connect(this.master);
      this.g[name] = g;
    };
    const filt = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      src.connect(f);
      return f;
    };
    gain('rain', filt('bandpass', 5000, 0.4));
    gain('hum', filt('lowpass', 160));
    // 宇宙の低い音
    const pad = ctx.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 600;
    for (const m of [45, 52, 57]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = m2f(m);
      o.detune.value = (m % 7) - 3;
      o.connect(pad);
      o.start();
    }
    gain('pad', pad);
    src.start();
    return true;
  }
  toggle() {
    if (!this.ctx && !this.init()) return false;
    const ctx = this.ctx!;
    this.on = !this.on;
    if (ctx.state === 'suspended') void ctx.resume();
    this.master.gain.setTargetAtTime(this.on ? 1 : 0, ctx.currentTime, 0.05);
    this.next = 0;
    return this.on;
  }
  set(name: string, v: number) {
    if (this.ctx) this.g[name].gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }
  private note(type: OscillatorType, f: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  /** ジュークボックスの曲を少し先まで並べる（部屋にいるあいだ毎フレーム呼ぶ） */
  tune() {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.3) {
      const m = MELODY[this.step % MELODY.length];
      if (m) this.note('square', m2f(m), this.next, STEP * 0.9, 0.045);
      if (this.step % 2 === 0) this.note('triangle', m2f(BASS[(this.step / 2) % BASS.length]), this.next, STEP * 1.8, 0.16);
      this.next += STEP;
      this.step++;
    }
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
  // 確認用: ?opening=1&ot=12 でその秒から、&oreduce で動きを減らした版（最後の切り替えだけ）
  const params = new URLSearchParams(location.search);
  const reduce = params.has('oreduce') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const cv = $<HTMLCanvasElement>('.op__px');
  const skip = $<HTMLButtonElement>('.op__skip');
  const soundBtn = $<HTMLButtonElement>('.op__sound');
  const c = cv.getContext('2d')!;
  // 街と部屋はいったん別のキャンバスに描いてから、ドットのまま拡大する
  const cityC = document.createElement('canvas');
  cityC.width = CITY_W;
  cityC.height = CITY_H;
  const cityX = cityC.getContext('2d')!;
  const stage = document.createElement('canvas');
  const stageX = stage.getContext('2d')!;

  // オープニングの下にあるページ本体（最後に光の中から浮かび上がる）
  const others = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el !== root && el instanceof HTMLElement && el.tagName !== 'SCRIPT',
  );

  // 1ドットの大きさ: 画面の短い辺がだいたい180ドットになるように
  let W = 0;
  let H = 0;
  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const px = Math.max(2, Math.round(Math.min(vw, vh) / 180));
    W = Math.ceil(vw / px);
    H = Math.ceil(vh / px);
    cv.width = stage.width = W;
    cv.height = stage.height = H;
    cv.style.width = `${W * px}px`;
    cv.style.height = `${H * px}px`;
    c.imageSmoothingEnabled = false;
  }

  // ---- 進行 ----
  const sound = new Sound();
  let t = reduce ? END : Number(params.get('ot')) || 0;
  let last = performance.now();
  let raf = 0;
  let done = false;
  let slammed = t > T.slam;

  /** 拡大して写す（ドットはぼかさない） */
  function zoomed(src: HTMLCanvasElement, fx: number, fy: number, z: number, ax = 0.5, ay = 0.5) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    const sw = W / z;
    const sh = H / z;
    c.drawImage(src, fx - sw * ax, fy - sh * ay, sw, sh, 0, 0, W, H);
  }
  /** 場面の出入りを黒の網かけでつなぐ */
  function fades(t: number, [a, b]: readonly [number, number]) {
    const p = Math.max(1 - (t - a) / FADE, (t - (b - FADE)) / FADE);
    if (p > 0) dither(c, p, '#000');
  }

  function drawEarthScene(t: number) {
    const z = ease(prog(t, T.earthZoom));
    const turn = ease(prog(t, T.earthTurn));
    drawEarth(c, W, H, {
      lon: lerp(18 + t * 5, 138, turn),
      lat: lerp(-6, 36, turn),
      r: Math.min(W, H) * 0.36 * Math.exp(z * Math.log(6)),
      night: prog(t, T.night),
      t,
      target: [138, 36],
    });
  }

  function drawCityScene(t: number) {
    drawCity(cityX, t);
    const p = ease(prog(t, T.cityZoom));
    const z = Math.exp(lerp(0, Math.log(4), p));
    zoomed(cityC, lerp(CITY_W / 2, CITY_TARGET[0], p), lerp(CITY_H / 2 - 30, CITY_TARGET[1], p), z);
    const out = (t - (T.city[1] - FADE)) / FADE;
    if (out > 0) dither(c, out, '#000');
  }

  function drawAlleyScene(t: number) {
    drawAlley(c, W, H, t, {
      walk: prog(t, T.walk),
      climb: prog(t, T.climb),
      landing: prog(t, T.landing),
      door: t < T.slam ? prog(t, T.door) : 0,
      entered: t >= T.entered,
    });
    // ドアが閉まった瞬間、画面がゆれる
    if (t >= T.slam && t < T.slam + 0.12) c.drawImage(cv, 0, 1);
    fades(t, T.alley);
  }

  function drawRoomScene(t: number) {
    stageX.clearRect(0, 0, W, H);
    const [fx, fy0] = drawRoom(stageX, W, H, t);
    const fy = fy0 - 4;
    const p = reduce ? 0 : ease(prog(t, T.roomZoom));
    const z = Math.exp(lerp(0, Math.log(9), p));
    zoomed(stage, lerp(W / 2, fx, Math.min(1, p * 1.6)), lerp(H / 2, fy, Math.min(1, p * 1.6)), z);
    const a = 1 - (t - T.room[0]) / FADE;
    if (a > 0) dither(c, a, '#000');
  }

  function frame(now: number) {
    // タブが裏に回ったときなどに時間が飛ばないよう、1フレームの進みに上限を設ける
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    try {
      if (t >= END + REVEAL) return finish();
      if (inside(t, T.earth)) drawEarthScene(t);
      else if (inside(t, T.city)) drawCityScene(t);
      else if (inside(t, T.alley)) drawAlleyScene(t);
      else drawRoomScene(Math.min(t, END + REVEAL));
      if (inside(t, T.clouds)) drawClouds(c, W, H, prog(t, T.clouds));
      if (t >= END) reveal(t - END);
      if (t >= T.slam && !slammed) {
        slammed = true;
        sound.thump();
      }
      if (sound.on) {
        const out = inside(t, T.alley);
        sound.set('pad', t < T.alley[0] ? 0.05 * (1 - prog(t, [9.6, 10.2])) : 0);
        sound.set('rain', out && t < T.slam ? 0.05 : 0);
        sound.set('hum', out && t < T.slam ? 0.12 : 0);
        if (t >= T.room[0]) sound.tune();
      }
    } catch (err) {
      // 何か起きても、ページが使えなくならないようにすぐ終える
      console.error(err);
      return finish();
    }
    raf = requestAnimationFrame(frame);
  }

  // ジュークボックスの光の中から、ドットが抜けていくようにページが現れる
  function reveal(r: number) {
    root.classList.add('is-thin');
    const p = ease(clamp(r / REVEAL));
    c.globalCompositeOperation = 'destination-out';
    dither(c, p * 1.05, '#000');
    c.globalCompositeOperation = 'source-over';
    const g = 1 - p;
    others.forEach((el) => {
      el.style.filter = g > 0.02 ? `brightness(${(1 + g * 0.6).toFixed(2)}) saturate(${(1 + g).toFixed(2)})` : '';
    });
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
    others.forEach((el) => (el.style.filter = ''));
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
