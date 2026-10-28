// オープニングのドット絵（マザー2がコンセプト）。全部その場で小さなキャンバスに描き、拡大して見せる。
// 宇宙から見た地球 → ネオンの街（斜め上から見た街） → 路地裏の外階段とドア → 部屋のジュークボックス。

type Ctx = CanvasRenderingContext2D;

// ---- 小さな道具 ----
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const smooth = (a: number, b: number, v: number) => {
  const p = clamp((v - a) / (b - a));
  return p * p * (3 - 2 * p);
};
/** 座標から決まる 0〜1 の値（毎フレーム同じ場所に同じものを置くため） */
export const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function dot(c: Ctx, x: number, y: number, col: string) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), 1, 1);
}
/** にじまない1ドットの線 */
function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  c.fillStyle = col;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2000; i++) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
function poly(c: Ctx, pts: number[][], col: string) {
  c.fillStyle = col;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

// ---- 網かけ（ドット絵の半透明のかわり） ----
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const patterns = new WeakMap<Ctx, Map<string, CanvasPattern>>();
/** p（0〜1）の割合で col の網をかける */
export function dither(c: Ctx, p: number, col: string, x = 0, y = 0, w = c.canvas.width, h = c.canvas.height) {
  const lv = Math.round(clamp(p) * 16);
  if (lv <= 0) return;
  if (lv >= 16) return rect(c, x, y, w, h, col);
  let m = patterns.get(c);
  if (!m) patterns.set(c, (m = new Map()));
  const key = col + lv;
  let pat = m.get(key);
  if (!pat) {
    const t = document.createElement('canvas');
    t.width = t.height = 4;
    const tc = t.getContext('2d')!;
    tc.fillStyle = col;
    BAYER.forEach((b, i) => b < lv && tc.fillRect(i % 4, (i / 4) | 0, 1, 1));
    pat = c.createPattern(t, 'repeat')!;
    m.set(key, pat);
  }
  c.fillStyle = pat;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// ---- 3×5 のドット文字（看板用。英語だけ） ----
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '4': '101101111001001', '7': '111001010010010', ' ': '000000000000000',
};
function text(c: Ctx, s: string, x: number, y: number, col: string, k = 1, vertical = false) {
  c.fillStyle = col;
  [...s].forEach((ch, i) => {
    const g = FONT[ch] ?? FONT[' '];
    const ox = Math.round(x + (vertical ? 0 : i * 4 * k));
    const oy = Math.round(y + (vertical ? i * 6 * k : 0));
    for (let b = 0; b < 15; b++) if (g[b] === '1') c.fillRect(ox + (b % 3) * k, oy + ((b / 3) | 0) * k, k, k);
  });
}
/** ネオン管の看板: まわりに暗い光、本体は明るい色。off のときは消えかけ */
function neon(c: Ctx, s: string, x: number, y: number, col: string, glow: string, on = true, k = 1, vertical = false) {
  if (on) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(c, s, x + dx, y + dy, glow, k, vertical);
  text(c, s, x, y, on ? col : glow, k, vertical);
}

/** 文字で描いたドット絵を置く（. は透明） */
function sprite(c: Ctx, rows: string[], pal: Record<string, string>, x: number, y: number, flip = false) {
  x = Math.round(x);
  y = Math.round(y);
  const w = rows[0].length;
  rows.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const col = pal[row[i]];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x + (flip ? w - 1 - i : i), y + j, 1, 1);
    }
  });
}

// =====================================================================
// 1. 地球（宇宙から。添付の写真のように、アフリカが見えるところから回り始める）
// =====================================================================
type V2 = [number, number];
// 大陸のおおまかな形（経度, 緯度）。ドットで見るので粗くてよい
const LANDS: V2[][] = [
  // アフリカ
  [[-17, 15], [-17, 21], [-13, 27], [-9, 32], [-5, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [39, 16], [43, 12], [51, 12], [48, 4], [41, -2], [40, -11], [35, -24], [32, -29], [27, -34], [20, -35], [18, -30], [12, -17], [13, -6], [9, -1], [9, 4], [3, 6], [-8, 4], [-13, 8]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  // アラビア半島
  [[34, 28], [35, 32], [39, 32], [48, 30], [56, 26], [60, 22], [52, 16], [44, 12], [43, 14], [39, 20]],
  // ユーラシア
  [[-10, 36], [-9, 43], [-2, 44], [-4, 48], [3, 51], [8, 54], [10, 58], [5, 62], [14, 67], [25, 71], [40, 68], [60, 70], [80, 73], [105, 77], [140, 72], [170, 70], [180, 66], [175, 62], [160, 58], [155, 50], [142, 46], [135, 43], [128, 40], [126, 35], [121, 31], [121, 25], [110, 20], [108, 12], [104, 9], [100, 13], [98, 8], [93, 17], [90, 22], [85, 20], [80, 14], [77, 8], [73, 17], [68, 24], [60, 25], [57, 26], [50, 30], [48, 30], [39, 32], [35, 36], [27, 37], [26, 40], [23, 36], [20, 40], [14, 41], [16, 38], [12, 44], [7, 44], [3, 42], [-2, 37]],
  [[-5, 50], [1, 51], [0, 53], [-2, 57], [-5, 58], [-6, 55], [-3, 54], [-5, 52]],
  // 日本
  [[130, 31], [132, 34], [136, 34], [140, 35], [141, 38], [142, 41], [141, 43], [145, 44], [142, 46], [140, 42], [139, 39], [137, 37], [133, 36], [130, 34]],
  // 東南アジアの島
  [[95, 5], [105, -6], [115, -8], [120, -9], [125, -8], [119, -5], [118, 0], [110, 2], [104, 1], [98, 4]],
  [[131, -1], [141, -3], [150, -10], [142, -9], [137, -5]],
  [[118, 18], [122, 18], [126, 8], [122, 7]],
  // オーストラリア、ニュージーランド
  [[114, -22], [114, -34], [118, -35], [123, -34], [131, -31], [138, -35], [141, -38], [147, -38], [150, -37], [153, -28], [153, -25], [146, -19], [142, -11], [141, -17], [136, -12], [131, -12], [126, -14], [122, -18]],
  [[172, -34], [175, -37], [178, -38], [174, -41], [171, -44], [167, -46], [172, -41]],
  // 北アメリカ、グリーンランド
  [[-168, 66], [-162, 70], [-140, 70], [-125, 70], [-100, 70], [-85, 70], [-80, 63], [-90, 57], [-80, 52], [-75, 60], [-65, 60], [-55, 52], [-60, 47], [-67, 45], [-70, 42], [-76, 38], [-76, 35], [-80, 32], [-81, 27], [-80, 25], [-83, 29], [-90, 30], [-97, 27], [-97, 22], [-92, 19], [-88, 21], [-87, 16], [-83, 15], [-82, 9], [-79, 9], [-80, 7], [-86, 12], [-92, 15], [-105, 20], [-110, 24], [-112, 30], [-117, 32], [-121, 35], [-124, 40], [-124, 48], [-130, 54], [-140, 60], [-152, 59], [-158, 57], [-165, 60]],
  [[-73, 78], [-60, 82], [-30, 83], [-20, 75], [-22, 70], [-42, 60], [-50, 64], [-55, 70], [-70, 76]],
  // 南アメリカ
  [[-80, 8], [-77, 9], [-72, 12], [-62, 10], [-52, 5], [-50, 0], [-35, -5], [-35, -9], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -41], [-65, -47], [-68, -52], [-72, -54], [-75, -50], [-74, -42], [-72, -30], [-70, -18], [-76, -14], [-81, -6], [-80, -2], [-78, 2]],
];
function inPoly(x: number, y: number, p: V2[]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 経度方向につながる、なめらかなノイズ（雲の形）
function vnoise(x: number, y: number, period: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const g = (a: number, b: number) => hash(((a % period) + period) % period, b, 7);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(g(ix, iy), g(ix + 1, iy), sx), lerp(g(ix, iy + 1), g(ix + 1, iy + 1), sx), sy);
}

const MW = 512;
const MH = 256;
let land: Uint8Array | null = null; // 0 海, 1 砂漠, 2 緑, 3 氷
let cloud: Float32Array;
function buildMaps() {
  land = new Uint8Array(MW * MH);
  cloud = new Float32Array(MW * MH);
  const boxes = LANDS.map((p) => {
    const xs = p.map((q) => q[0]);
    const ys = p.map((q) => q[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  });
  for (let j = 0; j < MH; j++) {
    const lat = 90 - ((j + 0.5) * 180) / MH;
    for (let i = 0; i < MW; i++) {
      const lon = -180 + ((i + 0.5) * 360) / MW;
      let t = 0;
      if (lat < -66 || lat > 80) t = 3;
      else
        for (let k = 0; k < LANDS.length; k++) {
          const b = boxes[k];
          if (lon < b[0] || lon > b[1] || lat < b[2] || lat > b[3] || !inPoly(lon, lat, LANDS[k])) continue;
          const dry = Math.abs(lat) > 13 && Math.abs(lat) < 34 && vnoise(lon / 13, lat / 13, 360 / 13) > 0.32;
          t = lat > 62 ? 3 : dry ? 1 : 2;
          break;
        }
      land[j * MW + i] = t;
      // 雲: 南の海と赤道あたりに多い、渦を巻いた白
      const u = (i / MW) * 32 + Math.sin(j / 10) * 1.3;
      const v = (j / MH) * 21;
      const n = vnoise(u, v, 32) * 0.5 + vnoise(u * 2, v * 2, 64) * 0.3 + vnoise(u * 5, v * 5, 160) * 0.2;
      const bias = 0.16 * Math.exp(-(((lat + 48) / 13) ** 2)) + 0.09 * Math.exp(-((lat / 7) ** 2)) + 0.1 * Math.exp(-(((lat - 55) / 12) ** 2));
      cloud[j * MW + i] = smooth(0.6 - bias, 0.7 - bias, n);
    }
  }
}

const hex = (s: string) => {
  const n = parseInt(s.slice(1), 16);
  return 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16); // ImageData 用（ABGR）
};
const RAMP = {
  sea: ['#030818', '#0a1f52', '#17489a', '#2f70c4', '#5a9ae0'].map(hex),
  sand: ['#140a06', '#4a2a14', '#8a5a2c', '#b8844a', '#dcae74'].map(hex),
  green: ['#07100a', '#1c3418', '#3a5a26', '#62803e', '#8aa25a'].map(hex),
  ice: ['#141a2a', '#5a6a8a', '#a8b6d0', '#dce6f4', '#ffffff'].map(hex),
  cloud: ['#161a28', '#5a6684', '#aab4c8', '#e2e8f2', '#ffffff'].map(hex),
};
const SPACE = hex('#04020a');
const RIM = [hex('#14306a'), hex('#3a7ad8'), hex('#8ac8ff')];
const CITY = [hex('#ffcf5a'), hex('#ff5c8a'), hex('#5ae0ff')];

export interface EarthView {
  lon: number; // 画面の真ん中に来る経度
  lat: number;
  r: number; // 半径（ドット）
  night: number; // 0 昼 〜 1 夜
  t: number;
  target: V2; // 夜になったとき明るくなる場所
}
let img: ImageData | null = null;
export function drawEarth(c: Ctx, W: number, H: number, e: EarthView) {
  if (!land) buildMaps();
  if (!img || img.width !== W || img.height !== H) img = c.createImageData(W, H);
  const d = new Uint32Array(img.data.buffer);
  const cx = W / 2;
  const cy = H / 2;
  const R = e.r;
  const la = (e.lat * Math.PI) / 180;
  const cl = Math.cos(la);
  const sl = Math.sin(la);
  // 光は左上の手前から。夜になるにつれて右へ回り込んで暗くなる
  const ang = -0.5 + e.night * 2.2;
  const L = [Math.sin(ang) * 0.85, 0.35, Math.cos(ang) * 0.85];
  const ln = Math.hypot(L[0], L[1], L[2]);
  const tl = (e.target[0] * Math.PI) / 180;
  const tp = (e.target[1] * Math.PI) / 180;
  const T = [Math.cos(tp) * Math.sin(tl), Math.sin(tp), Math.cos(tp) * Math.cos(tl)];
  const cloudShift = e.t * 1.6;
  const tw = (e.t * 3) | 0;
  for (let y = 0; y < H; y++) {
    const dy = (y + 0.5 - cy) / R;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = (x + 0.5 - cx) / R;
      const d2 = dx * dx + dy * dy;
      const bay = BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
      if (d2 > 1) {
        // 星
        const h = hash(x, y, 3);
        d[i] = h > 0.994 ? (hash(x, y, tw) > 0.25 ? hex(h > 0.998 ? '#ffffff' : '#7a86b8') : SPACE) : SPACE;
        // 大気のうすい光
        if (d2 < 1.06 && R > 8) d[i] = bay + (1.06 - d2) * 14 * (1 - e.night) > 0.6 ? RIM[0] : d[i];
        continue;
      }
      const nz = Math.sqrt(1 - d2);
      const py = -dy;
      const wy = py * cl + nz * sl;
      const wz = -py * sl + nz * cl;
      const lat = Math.asin(wy);
      const lon = e.lon + (Math.atan2(dx, wz) * 180) / Math.PI;
      // 光の当たり方
      const lam = Math.max(0, (dx * L[0] + py * L[1] + nz * L[2]) / ln);
      let lv = Math.floor(lam * 4.2 + bay + 0.15);
      lv = lv < 0 ? 0 : lv > 4 ? 4 : lv;
      const mi = (((((lon + 180) / 360) * MW) | 0) % MW + MW) % MW;
      const mj = Math.min(MH - 1, (((90 - (lat * 180) / Math.PI) / 180) * MH) | 0);
      const ci = ((((((lon + 180 - cloudShift) / 360) * MW) | 0) % MW) + MW) % MW;
      const t = land![mj * MW + mi];
      const clat = Math.cos(lat);
      const lr = (lon * Math.PI) / 180;
      const near = 1 - Math.min(1, Math.hypot(clat * Math.sin(lr) - T[0], wy - T[1], clat * Math.cos(lr) - T[2]) * 5);
      const cv = cloud[mj * MW + ci] * (1 - near * 0.9);
      let col: number;
      if (cv + bay * 0.12 > 0.5) col = RAMP.cloud[lv];
      else col = (t === 0 ? RAMP.sea : t === 1 ? RAMP.sand : t === 2 ? RAMP.green : RAMP.ice)[lv];
      // 夜の街の灯り（目的地のまわりほど多く、ネオンの色）
      if (e.night > 0.2 && t > 0 && t < 3 && lv <= 1 && cv < 0.5) {
        const h = hash(mi * 3 + ((x / Math.max(1, R / 60)) | 0), mj * 3 + ((y / Math.max(1, R / 60)) | 0), 11);
        if (h > 0.97 - near * 0.5 * e.night) col = CITY[near > 0.4 ? ((h * 97) | 0) % 3 : 0];
      }
      // ふちの青い光
      if (d2 > 0.9 && lam > 0.15) col = RIM[d2 > 0.965 ? 2 : 1];
      d[i] = col;
    }
  }
  c.putImageData(img, 0, 0);
}

/** 雲を突き抜ける: 夜の雲のかたまりが真ん中から外へ流れていく（p: 0〜1） */
export function drawClouds(c: Ctx, W: number, H: number, p: number) {
  const cx = W / 2;
  const cy = H / 2;
  const span = Math.hypot(W, H) * 0.75;
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1, 41) * Math.PI * 2;
    const k = clamp(p * 1.4 - hash(i, 2, 41) * 0.4); // ひとつずつ時間をずらす
    if (k <= 0 || k >= 1) continue;
    const dist = Math.pow(k, 1.6) * span;
    const r = (0.15 + k * 1.1) * Math.min(W, H) * (0.25 + hash(i, 3, 41) * 0.2);
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist * 0.8;
    puff(c, x, y, r);
  }
}
function puff(c: Ctx, x: number, y: number, r: number) {
  // 丸を3つ重ねた雲。下側に影
  const parts: [number, number, number][] = [
    [0, 0, r],
    [-r * 0.75, r * 0.2, r * 0.7],
    [r * 0.8, r * 0.25, r * 0.65],
  ];
  for (const [col, dy] of [['#5a6488', 3], ['#8e98bc', 1], ['#c4cce4', 0]] as const)
    for (const [ox, oy, rr] of parts) {
      const R = rr - (col === '#c4cce4' ? 2 : 0);
      for (let j = -R; j <= R; j++) {
        const hw = Math.round(Math.sqrt(R * R - j * j));
        rect(c, x + ox - hw, y + oy + j + dy - (col === '#c4cce4' ? 1 : 0), hw * 2, 1, col);
      }
    }
}

// =====================================================================
// 2. ネオンの街（斜め上から。黒地にネオンの線で描いた建物）
// =====================================================================
export const CITY_W = 460;
export const CITY_H = 470;
const OX = 230;
const OY = 175;
const iso = (u: number, v: number, z = 0): V2 => [OX + u - v, OY + (u + v) / 2 - z];

interface Bldg {
  u: number;
  v: number;
  w: number;
  d: number;
  h: number;
  col: string;
  dim: string;
  tiers?: number;
  spire?: boolean;
  stairs?: boolean;
  sign?: [string, string, string];
}
const BLDGS: Bldg[] = [
  { u: 8, v: 10, w: 46, d: 42, h: 128, col: '#b04cff', dim: '#4a1a78', tiers: 2 },
  { u: 88, v: 8, w: 46, d: 46, h: 52, col: '#ff3a7a', dim: '#6a1434', tiers: 3, sign: ['CLUB', '#ffb0c8', '#6a1434'] },
  { u: 166, v: 10, w: 42, d: 46, h: 84, col: '#3aff6a', dim: '#126a28', tiers: 2, stairs: true },
  { u: 10, v: 90, w: 46, d: 42, h: 62, col: '#3ad6d0', dim: '#125854', tiers: 2 },
  { u: 92, v: 92, w: 42, d: 42, h: 168, col: '#ff2a55', dim: '#6a1024', tiers: 3, spire: true, sign: ['HOTEL', '#ffd0d8', '#6a1024'] },
  { u: 168, v: 90, w: 38, d: 38, h: 40, col: '#8a5aff', dim: '#34206a', tiers: 3 },
  { u: 12, v: 170, w: 42, d: 40, h: 44, col: '#ffd23a', dim: '#6a5414', tiers: 3, sign: ['VINYL', '#fff0b0', '#6a5414'] },
  { u: 86, v: 170, w: 28, d: 40, h: 30, col: '#ff5ab0', dim: '#6a1c48', tiers: 1, sign: ['BAR', '#ffc8e8', '#6a1c48'] },
  { u: 126, v: 170, w: 22, d: 40, h: 36, col: '#46a8ff', dim: '#163e6a', tiers: 1, sign: ['FM24', '#c8e8ff', '#163e6a'] },
  { u: 176, v: 176, w: 30, d: 30, h: 26, col: '#ffd23a', dim: '#6a5414', tiers: 2 },
];
// 行き着く先: BAR と FM24 のあいだの路地
const ALLEY_UV: V2 = [120, 214];
export const CITY_TARGET = iso(ALLEY_UV[0], ALLEY_UV[1], 8);
const ROADS = [70, 150];
const TREES: V2[] = [];
for (let u = 4; u < 220; u += 13)
  for (let v = 4; v < 225; v += 13) {
    const inRoad = ROADS.some((r) => Math.abs(u - r) < 9 || Math.abs(v - r) < 9);
    const inB = BLDGS.some((b) => u > b.u - 8 && u < b.u + b.w + 4 && v > b.v - 8 && v < b.v + b.d + 4);
    if (!inRoad && !inB && hash(u, v, 5) > 0.35) TREES.push([u + hash(u, v, 6) * 5, v + hash(u, v, 8) * 5]);
  }

const TREE = ['..kggk..', '.kgGgggk', 'kgGgggGk', 'kggggggk', 'kgggGggk', '.kgggggk', '..kkgkk.', '....k...', '...kkk..'];
const TREE_PAL = { k: '#0a5a1c', g: '#000000', G: '#2aff5a' };

function isoLine(c: Ctx, a: V2, b: V2, col: string) {
  line(c, a[0], a[1], b[0], b[1], col);
}

function building(c: Ctx, b: Bldg, t: number) {
  const tiers = b.tiers ?? 1;
  let { u, v, w, d } = b;
  let z0 = 0;
  for (let k = 0; k < tiers; k++) {
    const h = k === 0 ? b.h : 5 - k;
    box(c, u, v, w, d, z0, z0 + h, b, k === 0, t);
    z0 += h;
    u += 4;
    v += 4;
    w -= 8;
    d -= 8;
    if (w < 8 || d < 8) break;
  }
  const top = iso(b.u + b.w / 2, b.v + b.d / 2, z0);
  if (b.spire) {
    line(c, top[0], top[1], top[0], top[1] - 46, b.col);
    rect(c, top[0] - 2, top[1] - 18, 5, 12, '#000');
    line(c, top[0] - 2, top[1] - 18, top[0] - 2, top[1] - 6, b.col);
    line(c, top[0] + 2, top[1] - 18, top[0] + 2, top[1] - 6, b.col);
    if ((t * 1.5) % 1 < 0.6) rect(c, top[0] - 1, top[1] - 49, 3, 3, '#ff8080');
  }
  if (b.sign) {
    const [s, on, off] = b.sign;
    const p = iso(b.u + b.w, b.v + b.d - 6, b.h - 6);
    const blink = hash(s.length, (t * 4) | 0, 9) > 0.08;
    rect(c, p[0] + 2, p[1] - 1, 7, s.length * 6 + 2, '#000');
    line(c, p[0] + 2, p[1] - 1, p[0] + 2, p[1] + s.length * 6, b.col);
    neon(c, s, p[0] + 4, p[1] + 1, on, off, blink, 1, true);
  }
}

function box(c: Ctx, u: number, v: number, w: number, d: number, z0: number, z1: number, b: Bldg, windows: boolean, t: number) {
  const ch = Math.min(7, w / 4, d / 4);
  const cs: V2[] = [[ch, 0], [w - ch, 0], [w, ch], [w, d - ch], [w - ch, d], [ch, d], [0, d - ch], [0, ch]];
  const at = (i: number, z: number) => iso(u + cs[i][0], v + cs[i][1], z);
  // 後ろのものを隠す
  for (let i = 1; i <= 5; i++) poly(c, [at(i, z0), at(i + 1, z0), at(i + 1, z1), at(i, z1)], '#000');
  poly(c, cs.map((_, i) => at(i, z1)), '#000');
  // 窓（前に見える3面）
  if (windows) {
    for (let f = 2; f <= 4; f++) {
      const len = Math.hypot(cs[f + 1][0] - cs[f][0], cs[f + 1][1] - cs[f][1]);
      const n = Math.floor(len / 5);
      for (let k = 1; k < n; k++) {
        const q = k / n;
        const pu = u + lerp(cs[f][0], cs[f + 1][0], q);
        const pv = v + lerp(cs[f][1], cs[f + 1][1], q);
        for (let z = z0 + 7; z < z1 - 5; z += 7) {
          const h = hash(pu * 7 + f, z, 2);
          const lit = h > 0.55 && !(h > 0.93 && (t * 2 + h * 10) % 3 < 1);
          const [x, y] = iso(pu, pv, z);
          rect(c, x, y - 2, 1, 3, lit ? b.col : b.dim);
        }
      }
      if (b.stairs && f === 4) {
        // 外の非常階段（ジグザグ）
        for (let z = z0 + 4, s = 0; z < z1 - 8; z += 9, s++) {
          const a = iso(u + w - ch - 6 - (s % 2) * 18, v + d, z);
          const e = iso(u + w - ch - 6 - ((s + 1) % 2) * 18, v + d, z + 9);
          isoLine(c, a, e, b.col);
          isoLine(c, [a[0], a[1] + 2], [e[0], e[1] + 2], b.dim);
        }
      }
    }
  }
  // 輪郭
  for (let i = 0; i < 8; i++) isoLine(c, at(i, z1), at((i + 1) % 8, z1), b.col);
  for (let i = 1; i <= 5; i++) isoLine(c, at(i, z0), at(i + 1, z0), b.col);
  for (let i = 2; i <= 6; i++) isoLine(c, at(i, z0), at(i, z1), b.col);
}

export function drawCity(c: Ctx, t: number) {
  rect(c, 0, 0, CITY_W, CITY_H, '#000');
  // 地面のちらちらした点
  for (let y = 0; y < CITY_H; y += 3)
    for (let x = (y * 7) % 5; x < CITY_W; x += 5) {
      const h = hash(x, y, 1);
      if (h > 0.93) dot(c, x, y, h > 0.985 ? '#5a2a8a' : h > 0.965 ? '#1a4a2a' : '#2a1a4a');
    }
  // 道路（黄色の二重線。交差点の中は黒で消す）
  const R0 = -4;
  const R1 = 232;
  for (const r of ROADS)
    for (const o of [-7, 7]) {
      isoLine(c, iso(r + o, R0), iso(r + o, R1), '#d8c020');
      isoLine(c, iso(R0, r + o), iso(R1, r + o), '#d8c020');
    }
  for (const r of ROADS) {
    poly(c, [iso(r - 6, R0 - 2), iso(r + 6, R0 - 2), iso(r + 6, R1 + 2), iso(r - 6, R1 + 2)], '#000');
    poly(c, [iso(R0 - 2, r - 6), iso(R0 - 2, r + 6), iso(R1 + 2, r + 6), iso(R1 + 2, r - 6)], '#000');
  }
  // 中央線（点線）
  for (const r of ROADS)
    for (let s = R0; s < R1; s += 8) {
      if (ROADS.some((q) => Math.abs(s + 2 - q) < 10)) continue;
      isoLine(c, iso(r, s), iso(r, s + 3), '#6a5a10');
      isoLine(c, iso(s, r), iso(s + 3, r), '#6a5a10');
    }
  // 路地の入り口（行き着く先）に赤い灯り
  const al = iso(ALLEY_UV[0], ALLEY_UV[1]);
  if ((t * 2) % 1 < 0.7) rect(c, al[0] - 1, al[1] - 12, 2, 2, '#ff5c8a');
  // 木と建物を奥から順に
  const items: { k: number; draw: () => void }[] = [
    ...TREES.map(([u, v]) => ({
      k: u + v,
      draw: () => {
        const [x, y] = iso(u, v);
        sprite(c, TREE, TREE_PAL, x - 4, y - 9);
      },
    })),
    ...BLDGS.map((b) => ({ k: b.u + b.v + (b.w + b.d) / 2, draw: () => building(c, b, t) })),
  ];
  items.sort((a, b) => a.k - b.k).forEach((it) => it.draw());
  // 走る車のライト
  for (let i = 0; i < 4; i++) {
    const r = ROADS[i % 2];
    const s = ((t * 22 + i * 61) % 240) - 6;
    const [x, y] = i < 2 ? iso(r - 3, s) : iso(232 - s, r + 3);
    rect(c, x, y - 1, 2, 1, i < 2 ? '#fff6c0' : '#ff4a4a');
  }
}

// =====================================================================
// 3. 路地裏（壁の落書きとネオン、雨。帽子とコートの男が外階段を上がってドアに入る）
// =====================================================================
const MAN_PAL: Record<string, string> = {
  k: '#07040c',
  h: '#3a2c48',
  H: '#5a4a6e',
  b: '#c03050',
  s: '#e0a07a',
  S: '#a86a50',
  c: '#3e3650',
  C: '#625878',
  l: '#1c1626',
  o: '#2a1a14',
};
const MAN_TOP = [
  '....kkkkk....',
  '...kHhhhhk...',
  '...khhhhhk...',
  '...kbbbbbk...',
  '.kkhhhhhhhkk.',
  '....ksssSk...',
  '....kskssk...',
  '....kssSk....',
  '...kkccckk...',
  '..kcCCccccck.',
  '..kcCCcccck..',
  '..kcCcccsck..',
  '..kcCccccck..',
  '..kcCcccccck.',
  '..kcCccccck..',
  '..kcCcccccck.',
  '..kccccccccck',
  '..kkkcccckkk.',
];
const MAN_LEGS = [
  ['...klk.klk...', '...klk..klk..', '..kook..kook.', '..kkk....kkk.'],
  ['....klkkk....', '....kllk.....', '....kook.....', '....kkkk.....'],
];
function man(c: Ctx, x: number, y: number, frame: number, flip = false) {
  // x, y は足もと
  sprite(c, MAN_TOP, MAN_PAL, x - 6, y - 22, flip);
  sprite(c, MAN_LEGS[frame % 2], MAN_PAL, x - 6, y - 4, flip);
}

/** 路地の場面。p は男の動き（歩く→階段→ドア）。返り値はドアの位置（ズーム用） */
export function drawAlley(c: Ctx, W: number, H: number, t: number, s: { walk: number; climb: number; landing: number; door: number; entered: boolean }) {
  const cx = Math.round(W / 2);
  const gy = Math.round(H - Math.max(28, H * 0.2));
  // 壁（暗いレンガ）
  rect(c, 0, 0, W, gy, '#170c20');
  for (let y = gy - 4, row = 0; y > -4; y -= 4, row++) {
    line(c, 0, y, W, y, '#0f0716');
    for (let x = (row % 2) * 4; x < W; x += 8) {
      dot(c, x, y + 1, '#0f0716');
      if (hash(x, y, 4) > 0.86) rect(c, x + 1, y + 1, 7, 3, '#1f1229');
    }
  }
  // 上の階の窓
  for (let i = -3; i <= 3; i++) {
    const wx = cx + i * 34 - 6;
    for (let j = 1; j < 6; j++) {
      const wy = gy - 92 - j * 30;
      if (wy < -20) break;
      const lit = hash(i, j, 12) > 0.5;
      rect(c, wx - 1, wy - 1, 14, 16, '#0a0510');
      rect(c, wx, wy, 12, 14, lit ? '#3a2a1a' : '#0c0a1a');
      if (lit) dither(c, 0.5, '#7a5a2a', wx, wy, 12, 14);
      line(c, wx + 6, wy, wx + 6, wy + 13, '#0a0510');
    }
  }
  // 配管
  line(c, cx - 50, 0, cx - 50, gy - 1, '#2a1e34');
  line(c, cx - 49, 0, cx - 49, gy - 1, '#120a18');
  // ネオン看板
  const fl = (k: number) => hash(k, (t * 6) | 0, 13) > 0.07;
  rect(c, cx - 78, gy - 96, 30, 11, '#08040c');
  neon(c, 'LIQUOR', cx - 76, gy - 93, '#c8f0ff', '#1e4a6a', fl(1));
  dither(c, 0.25, '#2a6a9a', cx - 84, gy - 102, 42, 23);
  neon(c, 'BAR', cx - 34, gy - 84, '#ffb0d0', '#6a1438', fl(2), 1, true);
  neon(c, '24', cx - 24, gy - 64, '#ff8a8a', '#6a1a1a', fl(3), 2);
  // 落書き
  neon(c, 'FM24', cx - 80, gy - 30, '#ff5ab0', '#2a0a20', true, 2);
  text(c, 'IK', cx - 42, gy - 44, '#3aff8a', 2);
  text(c, 'IK', cx - 41, gy - 43, '#0a3a1a', 2);
  text(c, 'VHS', cx - 28, gy - 24, '#ffd23a', 1);
  text(c, 'NITE', cx + 20, gy - 18, '#8a7aff', 1);
  // 閉まった店のシャッター
  rect(c, cx - 78, gy - 14, 40, 14, '#241c2c');
  for (let y = gy - 13; y < gy; y += 2) line(c, cx - 78, y, cx - 39, y, '#16101c');
  // 外階段と踊り場とドア
  const sx = cx - 6; // 階段の下
  const lx = cx + 34; // 踊り場の左
  const ly = gy - 42; // 踊り場の高さ
  const dx = cx + 44; // ドア
  rect(c, dx - 2, ly - 26, 16, 26, '#0a0610');
  const open = s.door;
  rect(c, dx, ly - 24, 12, 24, '#1a0e08');
  if (open > 0) {
    rect(c, dx, ly - 24, Math.round(12 * open), 24, '#ffb04a');
    dither(c, 0.5, '#ffe0a0', dx, ly - 24, Math.round(12 * open), 24);
    dither(c, 0.35 * open, '#ff9a3a', dx - 10, ly - 30, 34, 34);
  } else {
    rect(c, dx + 2, ly - 22, 8, 6, '#3a2010');
    dot(c, dx + 9, ly - 12, '#c8a040');
  }
  // 灯り
  rect(c, dx + 15, ly - 30, 3, 2, '#ffd080');
  dither(c, 0.25, '#ffb04a', dx + 13, ly - 32, 9, 32);
  // 男（ドアに入ったら見えない）
  const climbing = s.climb > 0 && s.landing === 0;
  let mx: number;
  let my: number;
  if (s.climb === 0) {
    mx = lerp(-12, sx - 4, s.walk);
    my = gy;
  } else if (climbing) {
    mx = lerp(sx - 4, lx + 2, s.climb);
    my = lerp(gy, ly, s.climb);
  } else {
    mx = lerp(lx + 2, dx + 6, s.landing);
    my = ly;
  }
  const frame = Math.floor(t * 6);
  if (!s.entered) man(c, mx, my, s.walk >= 1 && !climbing && s.landing >= 1 ? 1 : frame);
  // 階段（男の手前に手すり）
  for (let i = 0; i < 14; i++) {
    const x = lerp(sx, lx, i / 14);
    const y = lerp(gy, ly, i / 14);
    rect(c, x, y - 1, 4, 1, '#5a4a6a');
  }
  line(c, sx, gy - 1, lx, ly, '#3a2e48');
  line(c, sx, gy - 10, lx, ly - 9, '#8a7a9a');
  rect(c, lx, ly, cx + 74 - lx, 2, '#5a4a6a');
  line(c, lx, ly - 9, cx + 74, ly - 9, '#8a7a9a');
  for (let x = lx; x <= cx + 74; x += 6) line(c, x, ly - 9, x, ly, '#3a2e48');
  line(c, cx + 72, ly + 2, cx + 72, gy - 1, '#3a2e48');
  if (s.entered) dither(c, 0.25, '#ffb04a', dx - 2, ly - 26, 16, 26);
  // 地面（濡れたアスファルトに看板が映る）
  rect(c, 0, gy, W, H - gy, '#0a0710');
  line(c, 0, gy, W, gy, '#2a2034');
  const shimmer = (x: number, w: number, col: string) => {
    for (let y = gy + 2; y < H; y += 2) {
      const o = Math.round(Math.sin(y * 0.7 + t * 5) * 1.5);
      if (hash(y, (t * 8) | 0, x) > 0.25) rect(c, x + o, y, w * (1 - (y - gy) / (H - gy + 20)), 1, col);
    }
  };
  shimmer(cx - 76, 24, '#1e4a6a');
  shimmer(cx - 34, 3, '#6a1438');
  shimmer(dx, 12, open > 0 ? '#6a4020' : '#1a1018');
  // 雨
  for (let i = 0; i < Math.round((W * H) / 450); i++) {
    const x = (hash(i, 0, 21) * (W + 40) + t * 30) % (W + 40) - 20;
    const y = (hash(i, 1, 21) * H + t * (150 + hash(i, 2, 21) * 60)) % (H + 10) - 5;
    const col = hash(i, 3, 21) > 0.5 ? '#4a5a8a' : '#2e3658';
    rect(c, x, y, 1, 3, col);
    if (y > gy && hash(i, (t * 10) | 0, 22) > 0.85) rect(c, x - 1, y + 2, 3, 1, '#3a4670');
  }
}

// =====================================================================
// 4. 部屋（ラジオと、光るジュークボックス）
// =====================================================================
const NOTE = ['..kk', '..kK', '..k.', '..k.', 'kkk.', 'kkk.'];
export function drawRoom(c: Ctx, W: number, H: number, t: number): V2 {
  const cx = Math.round(W / 2);
  const fy = Math.round(H - Math.max(44, H * 0.3)); // 床と壁の境目
  // 壁紙（縦じま）
  rect(c, 0, 0, W, fy, '#1a0f22');
  for (let x = (cx % 8) - 8; x < W; x += 8) rect(c, x, 0, 2, fy, '#22142c');
  for (let y = 6; y < fy - 6; y += 12) for (let x = (cx % 8) - 4; x < W; x += 8) dot(c, x, y + ((x / 8) % 2) * 6, '#2c1a38');
  rect(c, 0, fy - 4, W, 4, '#2c1a30');
  line(c, 0, fy - 5, W, fy - 5, '#4a2a48');
  // 床（板張り）
  rect(c, 0, fy, W, H - fy, '#2a160e');
  for (let y = fy + 4, r = 0; y < H; y += 5, r++) {
    line(c, 0, y, W, y, '#1c0e08');
    for (let x = ((r * 13) % 24) - 24; x < W; x += 24) line(c, x, y - 4, x, y - 1, '#1c0e08');
  }
  // 窓（外のネオンがにじむ）
  const wx = cx - 92;
  const wy = fy - 92;
  rect(c, wx - 3, wy - 3, 50, 42, '#3a2238');
  rect(c, wx, wy, 44, 36, '#08061a');
  const cols = ['#ff3a7a', '#3ad6ff', '#b04cff', '#ffd23a', '#3aff6a'];
  for (let i = 0; i < 14; i++) {
    const on = hash(i, (t * 2 + i) | 0, 31) > 0.3;
    const bx = wx + 2 + hash(i, 0, 32) * 38;
    const by = wy + 2 + hash(i, 1, 32) * 30;
    if (on) {
      dither(c, 0.5, cols[i % 5], bx - 2, by - 2, 6, 6);
      rect(c, bx, by, 2, 2, cols[i % 5]);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = wx + 3 + hash(i, 4, 33) * 38;
    const y = wy + ((hash(i, 5, 33) * 36 + t * 14) % 34);
    rect(c, x, y, 1, 2, '#5a6a9a');
  }
  line(c, wx + 22, wy, wx + 22, wy + 35, '#3a2238');
  line(c, wx, wy + 18, wx + 43, wy + 18, '#3a2238');
  // ポスター
  rect(c, cx - 38, fy - 84, 22, 30, '#0c0814');
  rect(c, cx - 37, fy - 83, 20, 28, '#2a0e2a');
  neon(c, 'FM', cx - 33, fy - 78, '#ff5ab0', '#5a1440', true);
  neon(c, '24', cx - 33, fy - 70, '#5ae0ff', '#14405a', true);
  // 小さなテーブルとラジオ
  const tx = cx - 74;
  rect(c, tx, fy - 14, 30, 3, '#5a3020');
  line(c, tx, fy - 14, tx + 29, fy - 14, '#8a5034');
  rect(c, tx + 3, fy - 11, 2, 14, '#3a2014');
  rect(c, tx + 25, fy - 11, 2, 14, '#3a2014');
  rect(c, tx + 5, fy - 27, 20, 13, '#8a4a24');
  rect(c, tx + 6, fy - 26, 18, 11, '#b06a34');
  rect(c, tx + 7, fy - 25, 8, 9, '#3a2014');
  for (let y = fy - 24; y < fy - 16; y += 2) line(c, tx + 7, y, tx + 14, y, '#5a3420');
  rect(c, tx + 16, fy - 25, 7, 4, '#e8d8a0');
  dot(c, tx + 17 + ((t * 2) | 0) % 5, fy - 24, '#c03030');
  rect(c, tx + 17, fy - 19, 2, 2, '#2a1a10');
  rect(c, tx + 20, fy - 19, 2, 2, '#2a1a10');
  line(c, tx + 22, fy - 27, tx + 34, fy - 52, '#a8a8b8');
  // ジュークボックス
  const jx = cx + 14;
  const jw = 40;
  const jh = 66;
  const jy = fy - jh + 4;
  const jc = jx + jw / 2;
  const hue = (k: number) => ['#ff3a3a', '#ff9a2a', '#ffe23a', '#3aff6a', '#3ad6ff', '#b04cff'][(((k + t * 6) | 0) % 6 + 6) % 6];
  // 壁に映る光
  dither(c, 0.22, '#ff5a8a', jx - 14, jy - 14, jw + 28, jh + 10);
  dither(c, 0.12, '#ffb04a', jx - 24, jy - 22, jw + 48, jh + 22);
  // 本体
  rect(c, jx, jy + 14, jw, jh - 14, '#4a1e12');
  for (let i = 0; i < 20; i++) {
    // てっぺんのアーチ
    const a = (i / 19) * Math.PI;
    const ax = jc - Math.cos(a) * (jw / 2);
    const ay = jy + 16 - Math.sin(a) * 16;
    rect(c, ax - 2, ay - 1, 4, jy + 18 - ay, '#4a1e12');
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 39) * Math.PI;
    dot(c, jc - Math.cos(a) * (jw / 2 - 2), jy + 16 - Math.sin(a) * 15, hue(i / 4));
    dot(c, jc - Math.cos(a) * (jw / 2 - 3), jy + 16 - Math.sin(a) * 14, hue(i / 4 + 1));
  }
  // 横の光る柱
  for (let y = jy + 16; y < jy + jh - 4; y++) {
    const col = hue((jy + jh - y) / 4);
    rect(c, jx + 1, y, 3, 1, col);
    rect(c, jx + jw - 4, y, 3, 1, col);
  }
  // 泡（ぶくぶく）
  for (let i = 0; i < 6; i++) {
    const by = jy + jh - 6 - ((t * 18 + i * 9) % (jh - 22));
    dot(c, jx + 2, by, '#ffffff');
    dot(c, jx + jw - 3, by + 4, '#ffffff');
  }
  // レコードの見える窓
  const rx = jc - 12;
  const ry = jy + 6;
  rect(c, rx, ry, 24, 16, '#1a0a14');
  rect(c, rx + 1, ry + 1, 22, 14, '#2a1424');
  for (let y = ry + 3; y < ry + 14; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 36 - (y - ry - 8.5) ** 2)));
    line(c, jc - half - 1, y, jc + half - 1, y, '#08040a');
  }
  const ang = t * 7;
  dot(c, jc - 1 + Math.round(Math.cos(ang) * 4), ry + 8 + Math.round(Math.sin(ang) * 3), '#5a4a5a');
  rect(c, jc - 2, ry + 7, 3, 3, '#ff3a7a');
  dot(c, jc - 1, ry + 8, '#ffe0e8');
  line(c, rx + 20, ry + 2, jc + 3, ry + 7, '#c8c8d8');
  // 選曲ボタンとスピーカーの格子
  rect(c, jx + 6, jy + 25, jw - 12, 8, '#d8d0c0');
  for (let x = jx + 7; x < jx + jw - 6; x += 3) rect(c, x, jy + 26, 2, 2, hash(x, (t * 3) | 0, 34) > 0.8 ? '#ff3a7a' : '#5a4a3a');
  for (let x = jx + 7; x < jx + jw - 6; x += 3) rect(c, x, jy + 29, 2, 3, '#8a7a6a');
  rect(c, jx + 6, jy + 35, jw - 12, jh - 41, '#1a0a08');
  for (let x = jx + 7; x < jx + jw - 6; x += 2) line(c, x, jy + 36, x, jy + jh - 7, x % 4 ? '#c89a4a' : '#6a4a20');
  for (let i = 0; i < 3; i++) dot(c, jc - 4 + i * 4, jy + jh - 5, hue(i * 2));
  rect(c, jx, jy + jh - 4, jw, 4, '#2a0e08');
  // 音符がふわふわ
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.6 + i / 3) % 1;
    const x = jc + Math.sin(p * 8 + i) * 10 + (i - 1) * 12;
    const y = jy - 4 - p * 30;
    if (p < 0.85) sprite(c, NOTE, { k: hue(i * 2), K: '#ffffff' }, x, y);
  }
  // 床に映る光
  dither(c, 0.3, '#ff5a8a', jx - 8, fy, jw + 16, 8);
  dither(c, 0.18, '#ffb04a', jx - 18, fy + 8, jw + 36, 10);
  return [jc, ry + 8];
}
