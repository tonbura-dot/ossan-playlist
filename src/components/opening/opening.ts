// オープニング演出: 宇宙 → 地球 → 日本 → 北海道 → 室蘭 → 白鳥大橋 → 雪でホワイトアウト → 記事一覧
// 全体を1本の時間軸（秒）で管理し、各レイヤーの見た目を毎フレーム時間から計算する。

import { JAPAN, WORLD, MURORAN, BRIDGE, type LonLat } from './geo';

export const STORAGE_KEY = 'ossan-opening-seen';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- 時間割（秒） ----
const TL = {
  earth: [1.3, 3.1], // 地球が近づきながら回る
  dive: [3.1, 4.5], // 地球から日本へ
  hokkaido: [4.8, 6.1],
  muroran: [6.3, 7.8],
  marker: 7.2,
  bridge: [8.0, 8.8], // 橋の場面へ切り替え
  push: [8.0, 11.0], // 橋にゆっくり寄る
  snow: [9.0, 10.4],
  white: [9.9, 10.9],
  list: 10.9,
  out: [13.4, 14.1],
} as const;

// ---- 地図の座標系（経度1度=100、緯度1度=130 の簡易投影） ----
const KX = 100;
const KY = 130;
const proj = ([lon, lat]: LonLat): [number, number] => [(lon - 128) * KX, (46 - lat) * KY];
/** 地球の半径 r（画面の短辺比）と、同じ縮尺になる地図カメラの幅 S の関係 */
const R_TO_S = (KY * 180) / Math.PI;

type Cam = { x: number; y: number; s: number };
const camAt = (lonlat: LonLat, s: number): Cam => {
  const [x, y] = proj(lonlat);
  return { x, y, s };
};
const GLOBE_CENTER: LonLat = [137.5, 38.5];
const CAM_JAPAN = camAt(GLOBE_CENTER, 2000);
const CAM_HOKKAIDO = camAt([142.8, 43.4], 760);
const CAM_MURORAN = camAt(MURORAN, 26);
const R_JAPAN = R_TO_S / CAM_JAPAN.s; // 地図の日本と同じ縮尺になる地球の半径

// ---- 小さな道具 ----
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** 拡大率に比例して中心を動かすカメラ補間（大きく寄っても目標がぶれない） */
function camLerp(a: Cam, b: Cam, p: number): Cam {
  const s = a.s * Math.pow(b.s / a.s, p);
  const k = a.s === b.s ? p : (a.s - s) / (a.s - b.s);
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s };
}

/** 角を丸めた閉じたパス（区間の長さに合わせて制御点を決めるので、点の間隔が不揃いでも暴れない） */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const t1 = norm(p2[0] - p0[0], p2[1] - p0[1]);
    const t2 = norm(p3[0] - p1[0], p3[1] - p1[1]);
    const c1x = p1[0] + (t1[0] * len) / 3;
    const c1y = p1[1] + (t1[1] * len) / 3;
    const c2x = p2[0] - (t2[0] * len) / 3;
    const c2y = p2[1] - (t2[1] * len) / 3;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d + 'Z';
}
function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function seenBefore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
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
  /** 動き（位置・大きさ）の進み具合。視差効果を減らす設定では途中を飛ばして切り替える */
  const motion = (p: number, ease = easeInOut) => (reduce ? (p >= 0.3 ? 1 : 0) : ease(p));

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const starsCanvas = $<HTMLCanvasElement>('.op__stars');
  const snowCanvas = $<HTMLCanvasElement>('.op__snow');
  const globeSvg = $<SVGSVGElement>('.op__globe');
  const mapSvg = $<SVGSVGElement>('.op__map');
  const bridgeLayer = $<HTMLElement>('.op__bridge');
  const bridgeArt = $<HTMLElement>('.op__bridge-art');
  const white = $<HTMLElement>('.op__white');
  const list = $<HTMLElement>('.op__list');
  const skip = $<HTMLButtonElement>('.op__skip');
  const captions = Array.from(root.querySelectorAll<HTMLElement>('.op__caption'));

  const sctx = starsCanvas.getContext('2d')!;
  const nctx = snowCanvas.getContext('2d')!;

  // ---- 画面サイズ ----
  let W = 0;
  let H = 0;
  let M = 0;
  let dpr = 1;
  let stars: { x: number; y: number; z: number; pz: number }[] = [];
  let flakes: { x: number; y: number; r: number; v: number; ph: number }[] = [];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    M = Math.min(W, H);
    const mobile = W < 700;
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    for (const c of [starsCanvas, snowCanvas]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nStars = Math.round(clamp((W * H) / 2600, 120, mobile ? 320 : 650));
    stars = Array.from({ length: nStars }, () => newStar(Math.random()));
    const nFlakes = Math.round(clamp((W * H) / 4500, 70, mobile ? 160 : 280));
    flakes = Array.from({ length: nFlakes }, () => newFlake(true));
  }
  function newStar(z: number) {
    return { x: (Math.random() * 2 - 1) * 1.2, y: (Math.random() * 2 - 1) * 1.2, z, pz: z };
  }
  function newFlake(anywhere: boolean) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -10,
      r: 1 + Math.random() * 2.8,
      v: 50 + Math.random() * 90,
      ph: Math.random() * Math.PI * 2,
    };
  }

  // ---- 地図（一度だけ組み立てる） ----
  const mapLand = mapSvg.querySelector('.op__map-land')!;
  const mapGrid = mapSvg.querySelector('.op__map-grid')!;
  for (let lon = 112; lon <= 164; lon++) {
    const [x] = proj([lon, 0]);
    mapGrid.appendChild(svgEl('line', { x1: x, y1: -3000, x2: x, y2: 6000 }));
  }
  for (let lat = 14; lat <= 70; lat++) {
    const [, y] = proj([0, lat]);
    mapGrid.appendChild(svgEl('line', { x1: -2000, y1: y, x2: 4000, y2: y }));
  }
  for (const poly of JAPAN) {
    mapLand.appendChild(svgEl('path', { d: smoothPath(poly.map(proj)) }));
  }
  const [b1, b2] = BRIDGE.map(proj);
  const bridgeLine = svgEl('line', { class: 'op__map-bridge', x1: b1[0], y1: b1[1], x2: b2[0], y2: b2[1] });
  mapSvg.querySelector('.op__map-marks')!.appendChild(bridgeLine);
  const [mx, my] = proj(MURORAN);
  const marker = mapSvg.querySelector<SVGCircleElement>('.op__marker')!;
  const pings = Array.from(mapSvg.querySelectorAll<SVGCircleElement>('.op__ping'));
  marker.setAttribute('cx', String(mx));
  marker.setAttribute('cy', String(my));
  for (const p of pings) {
    p.setAttribute('cx', String(mx));
    p.setAttribute('cy', String(my));
  }

  // ---- 地球 ----
  const globeOcean = globeSvg.querySelector<SVGCircleElement>('.op__globe-ocean')!;
  const globeClip = globeSvg.querySelector<SVGCircleElement>('.op__globe-clip')!;
  const globeShade = globeSvg.querySelector<SVGCircleElement>('.op__globe-shade')!;
  const globeRim = globeSvg.querySelector<SVGCircleElement>('.op__globe-rim')!;
  const globeLand = globeSvg.querySelector<SVGPathElement>('.op__globe-land')!;
  const globeJapan = globeSvg.querySelector<SVGPathElement>('.op__globe-japan')!;

  function orthoPath(polys: LonLat[][], lon0: number, lat0: number, cx: number, cy: number, r: number) {
    const rad = Math.PI / 180;
    const sin0 = Math.sin(lat0 * rad);
    const cos0 = Math.cos(lat0 * rad);
    let d = '';
    for (const poly of polys) {
      poly.forEach(([lon, lat], i) => {
        const l = (lon - lon0) * rad;
        const p = lat * rad;
        let x = Math.cos(p) * Math.sin(l);
        let y = cos0 * Math.sin(p) - sin0 * Math.cos(p) * Math.cos(l);
        const front = sin0 * Math.sin(p) + cos0 * Math.cos(p) * Math.cos(l);
        if (front < 0) {
          // 裏側の点は地球のふちに寄せる
          const k = Math.hypot(x, y) || 1;
          x /= k;
          y /= k;
        }
        d += `${i ? 'L' : 'M'}${(cx + x * r).toFixed(1)},${(cy - y * r).toFixed(1)}`;
      });
      d += 'Z';
    }
    return d;
  }

  function setCircle(c: SVGCircleElement, cx: number, cy: number, r: number) {
    c.setAttribute('cx', cx.toFixed(1));
    c.setAttribute('cy', cy.toFixed(1));
    c.setAttribute('r', Math.max(0, r).toFixed(1));
  }

  // ---- 1フレームの描画 ----
  function drawStars(t: number, dt: number) {
    // 速さ: 出だしで一気に加速し、地球が見えるころには落ち着く
    const speed = reduce ? 0 : t < 0.9 ? easeOut(t / 0.9) * 1.6 : lerp(1.6, 0.04, easeOut(clamp((t - 0.9) / 2.2)));
    const fade = 1 - prog(t, TL.dive);
    sctx.clearRect(0, 0, W, H);
    if (fade <= 0) return;
    const cx = W / 2;
    const cy = H / 2;
    const f = M * 0.55;
    sctx.lineCap = 'round';
    for (const s of stars) {
      s.pz = s.z;
      s.z -= speed * dt * 0.5;
      if (s.z <= 0.02) {
        Object.assign(s, newStar(1));
        continue;
      }
      const x = cx + (s.x / s.z) * f;
      const y = cy + (s.y / s.z) * f;
      const px = cx + (s.x / s.pz) * f;
      const py = cy + (s.y / s.pz) * f;
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) {
        Object.assign(s, newStar(0.6 + Math.random() * 0.4));
        continue;
      }
      const a = clamp(1.15 - s.z) * fade;
      const w = (1 - s.z) * 2.2 + 0.4;
      sctx.strokeStyle = `rgba(225,235,255,${a.toFixed(3)})`;
      sctx.lineWidth = w;
      sctx.beginPath();
      sctx.moveTo(px, py);
      sctx.lineTo(x + 0.01, y + 0.01);
      sctx.stroke();
    }
  }

  function drawGlobe(t: number) {
    const pIn = prog(t, TL.earth);
    const pDive = prog(t, TL.dive);
    // 地球の半径（短辺比）: 遠くから近づく → 日本に飛び込む
    const rIn = reduce ? 0.36 : lerp(0.015, 0.36, easeOut(pIn));
    // 動きを減らす設定では、地球は大きさも向きも変えず、地図と入れ替わるだけ
    const r = pDive > 0 && !reduce ? rIn * Math.pow(R_JAPAN / rIn, easeInOut(pDive)) : rIn;
    const turn = reduce ? 1 : easeInOut(clamp((t - TL.earth[0]) / (TL.dive[0] + 0.3 - TL.earth[0])));
    const lon0 = lerp(78, GLOBE_CENTER[0], turn);
    const lat0 = lerp(12, GLOBE_CENTER[1], turn);

    const appear = reduce ? easeOut(pIn) : clamp(pIn * 4);
    const vanish = reduce ? 1 - pDive : 1 - clamp((r - 1.0) / 0.8);
    const op = appear * vanish;
    globeSvg.style.opacity = op.toFixed(3);
    if (op <= 0.001) return r;

    const R = r * M;
    const cx = W / 2;
    const cy = H / 2;
    setCircle(globeOcean, cx, cy, R);
    setCircle(globeClip, cx, cy, R);
    setCircle(globeShade, cx, cy, R);
    setCircle(globeRim, cx, cy, R);
    globeLand.setAttribute('d', orthoPath(WORLD, lon0, lat0, cx, cy, R));
    globeJapan.setAttribute('d', orthoPath(JAPAN, lon0, lat0, cx, cy, R));
    return r;
  }

  let lastMapOp = -1;
  function drawMap(t: number, r: number) {
    let cam: Cam;
    if (t < TL.hokkaido[0]) {
      cam = { x: CAM_JAPAN.x, y: CAM_JAPAN.y, s: R_TO_S / Math.max(r, 0.01) };
      if (reduce) cam = CAM_JAPAN;
    } else if (t < TL.muroran[0]) {
      cam = camLerp(CAM_JAPAN, CAM_HOKKAIDO, motion(prog(t, TL.hokkaido)));
    } else {
      cam = camLerp(CAM_HOKKAIDO, CAM_MURORAN, motion(prog(t, TL.muroran)));
    }
    const op = reduce ? prog(t, TL.dive) : clamp((r - 0.85) / 0.6);
    const fadeForBridge = 1 - prog(t, TL.bridge);
    const total = op * fadeForBridge;
    if (total !== lastMapOp) {
      mapSvg.style.opacity = total.toFixed(3);
      lastMapOp = total;
    }
    if (total <= 0.001) return;

    let w: number;
    let h: number;
    if (W >= H) {
      h = cam.s;
      w = (cam.s * W) / H;
    } else {
      w = cam.s;
      h = (cam.s * H) / W;
    }
    mapSvg.setAttribute('viewBox', `${(cam.x - w / 2).toFixed(3)} ${(cam.y - h / 2).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}`);

    // 室蘭の印（画面上の大きさを一定に保つ）
    const unit = cam.s / M; // 1px あたりの地図単位
    const mOn = clamp((t - TL.marker) / 0.4);
    marker.setAttribute('r', (7 * unit).toFixed(4));
    marker.style.opacity = mOn.toFixed(3);
    pings.forEach((p, i) => {
      const ph = reduce ? 0.5 : ((t - TL.marker) * 0.9 + i * 0.5) % 1;
      p.setAttribute('r', ((8 + ph * 34) * unit).toFixed(4));
      p.style.opacity = (mOn * (1 - ph) * 0.8).toFixed(3);
    });
    bridgeLine.style.opacity = clamp((cam.s < 80 ? 1 : 0) * mOn).toFixed(3);
  }

  function drawBridge(t: number) {
    const op = easeInOut(prog(t, TL.bridge));
    bridgeLayer.style.opacity = op.toFixed(3);
    if (op <= 0) return;
    const p = motion(prog(t, TL.push), (x) => x * (2 - x));
    // 縦長の画面では橋が小さくなるので、最初から寄っておく
    const base = W < H ? 1.4 : 1;
    bridgeArt.style.transform = `scale(${(base * (1 + p * 0.14)).toFixed(4)})`;
  }

  function drawSnow(t: number, dt: number) {
    const amount = prog(t, TL.snow);
    const endFade = 1 - clamp((t - TL.list) / 0.6);
    nctx.clearRect(0, 0, W, H);
    if (amount <= 0 || endFade <= 0 || reduce) return;
    const n = Math.round(flakes.length * amount);
    nctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      const f = flakes[i];
      f.y += f.v * dt * (0.6 + amount * 0.6);
      f.x += Math.sin(t * 1.3 + f.ph) * 22 * dt + 18 * dt;
      if (f.y > H + 10 || f.x > W + 10) Object.assign(f, newFlake(false), { x: Math.random() * W * 1.1 - W * 0.1 });
      nctx.globalAlpha = (0.45 + f.r / 6) * endFade;
      nctx.beginPath();
      nctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      nctx.fill();
    }
    nctx.globalAlpha = 1;
  }

  let captionIndex = -1;
  function drawCaptions(t: number) {
    // 各キャプションの data-at（秒）を過ぎたら切り替え
    let idx = -1;
    captions.forEach((c, i) => {
      if (t >= Number(c.dataset.at)) idx = i;
    });
    if (t >= TL.white[0]) idx = -1;
    if (idx !== captionIndex) {
      captions.forEach((c, i) => c.classList.toggle('is-on', i === idx));
      captionIndex = idx;
    }
  }

  // ---- 進行 ----
  const freeze = params.has('ofreeze');
  let t = clamp(Number(params.get('ot')) || 0, 0, TL.out[0]);
  let last = performance.now();
  let raf = 0;
  let done = false;
  let listShown = false;

  function frame(now: number) {
    // タブが裏に回ったときなどに時間が飛ばないよう、1フレームの進みに上限を設ける
    const dt = freeze ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;

    try {
      drawStars(t, dt);
      const r = drawGlobe(t);
      drawMap(t, r);
      drawBridge(t);
      drawSnow(t, dt);
      drawCaptions(t);
    } catch (err) {
      // 描画で何か起きても、ページが使えなくならないようにすぐ終える
      console.error(err);
      return finish();
    }
    white.style.opacity = easeInOut(prog(t, TL.white)).toFixed(3);
    if (!listShown && t >= TL.list) {
      listShown = true;
      list.classList.add('is-on');
    }
    const out = prog(t, TL.out);
    if (out > 0) root.style.opacity = (1 - easeInOut(out)).toFixed(3);
    if (out >= 1) return finish();
    raf = requestAnimationFrame(frame);
  }

  // ---- 開始と終了 ----
  const others = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el !== root && el instanceof HTMLElement && el.tagName !== 'SCRIPT',
  );

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    markSeen();
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    others.forEach((el) => (el.inert = false));
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
    root.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 600); // transitionend が来ない環境の保険
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') skipNow();
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('keydown', onKey);
  skip.addEventListener('click', skipNow);
  list.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => markSeen()));
  others.forEach((el) => (el.inert = true));
  root.classList.add('is-running');
  skip.focus({ preventScroll: true });
  raf = requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
}
