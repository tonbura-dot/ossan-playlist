// オープニングの2つの場面（ネオン街・薄暗い部屋）の絵。ビルド時に SVG の中身を文字列で作る。
// 動きは opening.ts。id はページの他の部分とぶつからないよう、最後に全部 op- を付ける。

type Pt = [number, number];
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const pts = (arr: Pt[]) => arr.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

/** ネオン管の光（色ごとのにじみフィルター） */
const glow = (id: string, color: string, s1 = 4, s2 = 14) => `
  <filter id="${id}" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${s1}" result="a"/><feFlood flood-color="${color}"/><feComposite in2="a" operator="in" result="g1"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="${s2}" result="b"/><feFlood flood-color="${color}" flood-opacity="0.75"/><feComposite in2="b" operator="in" result="g2"/>
    <feMerge><feMergeNode in="g2"/><feMergeNode in="g1"/><feMergeNode in="g1"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

/** 縦書きの看板文字 */
const vtext = (chars: string, x: number, y0: number, step: number, size: number, fill: string, filter: string, family = "'Zen Maru Gothic', sans-serif") =>
  [...chars]
    .map((c, i) => `<text x="${x}" y="${y0 + i * step}" font-size="${size}" font-family="${family}" font-weight="700" text-anchor="middle" fill="${fill}" filter="url(#${filter})">${c}</text>`)
    .join('');

// ---- ネオン街は一点透視。X は左右、z は奥行き（1 が手前の基準）、h は高さ ----
export const VX = 800;
export const VY = 520;
export const EYE = 225;
export const P = (X: number, z: number, h = 0): Pt => [VX + X / z, VY + (EYE - h) / z];
const wallQuad = (X: number, z0: number, z1: number, h0: number, h1: number): Pt[] => [P(X, z0, h0), P(X, z1, h0), P(X, z1, h1), P(X, z0, h1)];

const prefix = (s: string) => s.replace(/\bid="([^"]+)"/g, 'id="op-$1"').replace(/url\(#([^)]+)\)/g, 'url(#op-$1)');

// ---- スプレーの落書き ----
// 架空のタグ（クルー名っぽい英字）を、左右の壁の面に沿ってゆがめて描く。
// 1文字ずつ壁の上の位置を決め、その場所の透視のゆがみ（matrix）で描くので、奥ほど細く小さくなる。
const TAG_FONT = "'Sedgwick Ave Display', 'Permanent Marker', cursive";
const BUBBLE_FONT = "'Rubik Spray Paint', 'Tilt Neon', sans-serif";
const WALL_F = 800; // 壁に沿った長さを奥行き z に直す係数
/** 壁 X の、奥行き z・高さ h の点に、壁に貼りついた向きで描くための transform */
function onWall(X: number, z: number, h: number) {
  const k = X < 0 ? 1 : -1; // 右の壁は、通りから見て手前に向かって読めるよう向きを逆にする
  const a = (-X / (z * z)) * (k / WALL_F);
  const b = (-(EYE - h) / (z * z)) * (k / WALL_F);
  const [e, f] = P(X, z, h);
  return `matrix(${a.toFixed(4)},${b.toFixed(4)},0,${(1 / z).toFixed(4)},${e.toFixed(1)},${f.toFixed(1)})`;
}
/** だいたいの文字幅（em） */
const charW = (c: string, bubble: boolean) => (/[iljI1!.]/.test(c) ? 0.32 : /[mwMW]/.test(c) ? 0.85 : bubble ? 0.68 : 0.55);

function graffiti(): string {
  let sd = 7;
  const R = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  // 壁に沿って1文字ずつ並べる。rot は文字列全体の傾き（度、マイナスで右上がり）
  const along = (X: number, z: number, h: number, text: string, size: number, rot: number, bubble: boolean, draw: (c: string, i: number) => string) => {
    const dir = X < 0 ? 1 : -1;
    const slope = Math.sin((-rot * Math.PI) / 180);
    let u = 0, o = '';
    [...text].forEach((c, i) => {
      const jit = bubble ? 0 : (R() - 0.5) * size * 0.12;
      o += `<g transform="${onWall(X, z + (dir * u) / WALL_F, h + u * slope + jit)}"><g transform="rotate(${(rot + (bubble ? 0 : (R() - 0.5) * 10)).toFixed(1)})">${draw(c, i)}</g></g>`;
      u += charW(c, bubble) * size * (bubble ? 0.86 : 1);
    });
    return o;
  };
  const drip = (size: number, color: string) => {
    if (R() > 0.55) return '';
    const x = ((R() - 0.2) * size * 0.4).toFixed(0), len = (size * (0.15 + R() * 0.5)).toFixed(0), w = (size * 0.025 + 1).toFixed(1);
    return `<rect x="${x}" y="0" width="${w}" height="${len}" rx="${w}" fill="${color}" opacity="0.7"/>`;
  };
  // 手書きのタグ（うすいにじみを太い半透明のふちで出す）
  const tag = (X: number, z: number, h: number, text: string, size: number, color: string, rot = -6) =>
    along(X, z, h, text, size, rot, false, (c) =>
      `<text font-family="${TAG_FONT}" font-size="${size}" fill="${color}" stroke="${color}" stroke-width="${(size * 0.07).toFixed(1)}" stroke-opacity="0.18" paint-order="stroke" opacity="0.88">${c}</text>${drip(size, color)}`);
  // ふくらんだ文字（スローアップ）：黒いふち、塗り、白いハイライト
  const bubble = (X: number, z: number, h: number, text: string, size: number, fill: string, rot = -4) =>
    along(X, z, h, text, size, rot, true, (c) =>
      `<g font-family="${BUBBLE_FONT}" font-size="${size}"><text fill="#000" stroke="#000" stroke-width="${(size * 0.14).toFixed(1)}" stroke-linejoin="round" opacity="0.85">${c}</text><text fill="${fill}" stroke="#0a0408" stroke-width="${(size * 0.05).toFixed(1)}" stroke-linejoin="round">${c}</text><text fill="none" stroke="#fff" stroke-width="${(size * 0.012).toFixed(1)}" opacity="0.55" transform="translate(${(-size * 0.02).toFixed(1)},${(-size * 0.02).toFixed(1)})">${c}</text></g>${drip(size, fill)}`);
  // 破れたステッカーやポスター
  const sticker = (X: number, z: number, h: number, w: number, hh: number, color: string) =>
    `<g transform="${onWall(X, z, h)}"><rect width="${w}" height="${hh}" fill="${color}" opacity="0.55" transform="rotate(${(R() * 10 - 5).toFixed(1)})"/><rect x="${w * 0.15}" y="${hh * 0.3}" width="${w * 0.7}" height="${hh * 0.12}" fill="#0a0408" opacity="0.6"/></g>`;

  let o = '';
  // 落書きの上から塗りつぶした跡（バフ）。落書きより先に描く
  for (const [X, z0, z1, h0, h1] of [[-1200, 2.9, 3.2, 60, 330], [1200, 2.5, 2.9, 80, 360]] as const) {
    o += `<polygon points="${pts(wallQuad(X, z0, z1, h0, h1))}" fill="#3a2a30" opacity="0.5"/>`;
  }
  // 左の壁（看板 CLUB と VINYL のまわりはあけておく）
  o += bubble(-1200, 1.72, 110, 'NITE', 170, '#ff3d7f');
  o += tag(-1200, 1.72, 400, 'IKR', 100, '#b6ff3a', -10);
  o += tag(-1200, 2.05, 620, 'krush', 120, '#f4f1f2');
  o += tag(-1200, 2.4, 1000, 'ZEKE', 140, '#f4f1f2', -3); // 高いところ
  o += tag(-1200, 2.9, 950, 'ghost', 120, '#4fd8ff', -5);
  o += tag(-1200, 2.6, 720, 'lowfi', 110, '#ffd23a', -4);
  o += sticker(-1200, 2.6, 440, 80, 100, '#e8e0d0') + sticker(-1200, 2.75, 380, 60, 60, '#ffd23a');
  o += bubble(-1200, 2.45, 120, 'VHS', 160, '#4fd8ff', -2);
  o += tag(-1200, 3.0, 470, 'dust', 110, '#c08cff', -8);
  o += tag(-1200, 3.2, 140, 'STATIC', 100, '#ff8a2a', -5);
  o += bubble(-1200, 3.9, 230, 'RAW', 150, '#f4f1f2', -3);
  o += tag(-1200, 4.3, 520, 'nosleep', 100, '#ff3d7f', -6);
  o += tag(-1200, 4.6, 260, 'VX', 90, '#b6ff3a', -4);
  // 右の壁（看板 BAR と 24 のまわりはあけておく）
  o += bubble(1200, 2.4, 120, 'SOBR', 170, '#b6ff3a', -3);
  o += tag(1200, 2.1, 560, 'fm24', 120, '#ff3d7f', -9);
  o += tag(1200, 2.4, 900, 'NITE', 150, '#c08cff', -4);
  o += sticker(1200, 2.6, 440, 80, 100, '#e8e0d0');
  o += tag(1200, 2.7, 420, 'ghost', 90, '#f4f1f2', -6);
  o += tag(1200, 2.9, 200, 'krush', 110, '#4fd8ff', -6);
  o += tag(1200, 3.1, 680, 'ikr', 110, '#f4f1f2', -7);
  o += bubble(1200, 4.2, 300, 'ONAIR', 130, '#ff8a2a', -4);
  o += tag(1200, 3.9, 760, 'RAW', 100, '#ffd23a', -5);
  o += tag(1200, 4.6, 180, 'dust', 100, '#ffd23a', -5);
  // 突き当たりの家とビルにも（スマホではここが主役なので多めに）
  const flat = (x: number, y: number, text: string, size: number, color: string, rot = -6) =>
    `<text x="${x}" y="${y}" font-family="${TAG_FONT}" font-size="${size}" fill="${color}" opacity="0.82" transform="rotate(${rot} ${x} ${y})">${text}</text>`;
  const flatBubble = (x: number, y: number, text: string, size: number, fill: string, rot = -3) =>
    `<g font-family="${BUBBLE_FONT}" font-size="${size}" transform="rotate(${rot} ${x} ${y})"><text x="${x}" y="${y}" fill="#000" stroke="#000" stroke-width="${size * 0.15}" stroke-linejoin="round">${text}</text><text x="${x}" y="${y}" fill="${fill}" stroke="#0a0408" stroke-width="${size * 0.06}">${text}</text></g>`;
  o += flat(612, 548, 'nite', 15, '#f4f1f2', -8) + flat(880, 560, 'ikr', 13, '#b6ff3a', -5) + flat(912, 436, 'krsh', 12, '#ff3d7f', 0);
  o += flatBubble(706, 522, 'DUB', 24, '#ff3d7f', -4) + flat(764, 556, 'zeke', 17, '#f4f1f2', -4) + flat(602, 512, 'nosleep', 11, '#ff8a2a', -12);
  o += flat(748, 446, 'VHS', 18, '#4fd8ff', -5) + flat(846, 414, 'fm24', 15, '#ffd23a', -7) + flat(612, 446, 'ghost', 15, '#c08cff', -4);
  o += flatBubble(900, 250, 'RAW', 34, '#4fd8ff') + flatBubble(568, 262, 'IKR', 26, '#b6ff3a', -5);
  o += flat(560, 336, 'STATIC', 22, '#f4f1f2', -5) + flat(958, 318, 'nite', 24, '#ff3d7f', -8) + flat(966, 452, 'dust', 14, '#ffd23a', -14);
  return o;
}

function buildStreet(): string {
  let s = `<defs>
    ${glow('gPink', '#ff3d7f')}${glow('gOrange', '#ff8a2a')}${glow('gIce', '#4fd8ff')}${glow('gRed', '#ff2a4f', 3, 10)}${glow('gWhite', '#bfefff', 5, 18)}
    <filter id="blur10" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="figfx" x="-80%" y="-30%" width="260%" height="160%"><feGaussianBlur id="figblur" in="SourceGraphic" stdDeviation="0" result="s"/><feDropShadow in="s" dx="0" dy="0" stdDeviation="1.2" flood-color="#ff5c9a" flood-opacity="0.85"/></filter>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07030c"/><stop offset="0.7" stop-color="#1d0a24"/><stop offset="1" stop-color="#4a1440"/></linearGradient>
    <linearGradient id="ground" gradientUnits="userSpaceOnUse" x1="0" y1="565" x2="0" y2="1400"><stop offset="0" stop-color="#3e1430"/><stop offset="0.35" stop-color="#20091b"/><stop offset="1" stop-color="#0e040c"/></linearGradient>
    <linearGradient id="wallL" gradientUnits="userSpaceOnUse" x1="560" y1="0" x2="-600" y2="0"><stop offset="0" stop-color="#2a0d25"/><stop offset="0.5" stop-color="#180615"/><stop offset="1" stop-color="#0a0209"/></linearGradient>
    <linearGradient id="wallR" gradientUnits="userSpaceOnUse" x1="1040" y1="0" x2="2200" y2="0"><stop offset="0" stop-color="#2a0d25"/><stop offset="0.5" stop-color="#170615"/><stop offset="1" stop-color="#090208"/></linearGradient>
    <radialGradient id="haze" cx="800" cy="450" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff4f8b" stop-opacity="0.09"/><stop offset="1" stop-color="#ff4f8b" stop-opacity="0"/></radialGradient>
    <linearGradient id="doorSpill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfefff" stop-opacity="0.22"/><stop offset="1" stop-color="#bfefff" stop-opacity="0"/></linearGradient>
  </defs>`;

  // 空と地面
  s += `<rect x="-5000" y="-6000" width="11600" height="6600" fill="url(#sky)"/>`;
  s += `<rect x="-5000" y="560" width="11600" height="5000" fill="url(#ground)"/>`;

  // 突き当たりの奥のビル（看板つき）
  s += `<rect x="540" y="120" width="520" height="460" fill="#160719"/>`;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const lit = (r * 7 + c * 3) % 5 === 0;
    s += `<rect x="${560 + c * 82}" y="${140 + r * 34}" width="44" height="18" fill="${lit ? '#ff9ab8' : '#160817'}" opacity="${lit ? 0.35 : 1}"/>`;
  }
  s += `<text x="780" y="294" font-size="36" font-family="'Tilt Neon', sans-serif" text-anchor="middle" fill="#ffe2c4" filter="url(#gOrange)" letter-spacing="8" id="sign-back">LIQUOR</text>`;
  s += `<text x="780" y="312" font-size="11" font-family="'IBM Plex Mono', monospace" text-anchor="middle" fill="#e6fbff" filter="url(#gIce)" letter-spacing="3">OPEN TIL DAWN</text>`;
  // 奥の路地（家の右）
  s += `<rect x="960" y="330" width="80" height="240" fill="#12050f"/><rect x="990" y="470" width="20" height="95" fill="#ff9ab8" opacity="0.18" filter="url(#blur4)"/>`;

  // 2階建ての家
  s += `<polygon points="${pts([[588, 350], [972, 350], [956, 326], [604, 326]])}" fill="#14060f"/>`;
  s += `<line x1="588" y1="350" x2="972" y2="350" stroke="#ff6fa0" stroke-width="1.5" opacity="0.5"/>`;
  s += `<rect x="606" y="350" width="348" height="105" fill="#2a0f22"/>`;
  s += `<rect x="598" y="455" width="364" height="110" fill="#301127"/>`;
  s += `<rect x="598" y="451" width="364" height="7" fill="#1a0915"/>`;
  // 1階：明るい入口と窓
  s += `<polygon points="${pts([[640, 565], [700, 565], [760, 640], [590, 640]])}" fill="url(#doorSpill)"/>`;
  s += `<rect x="640" y="485" width="60" height="80" fill="#e8f8ff" filter="url(#gWhite)"/>`;
  s += `<rect x="760" y="480" width="172" height="52" fill="#ff8fb4" opacity="0.75" filter="url(#gPink)"/>`;
  s += `<path d="M817 480v52M874 480v52M760 506h172" stroke="#2a0d22" stroke-width="3"/>`;
  // 2階：窓とドア、ON AIR の小さな看板
  s += `<rect x="640" y="372" width="100" height="54" fill="#120810"/>`;
  s += `<rect x="640" y="372" width="100" height="54" fill="#9fdcff" opacity="0" id="win2" filter="url(#gIce)"/>`;
  s += `<path d="M690 372v54" stroke="#2a0d22" stroke-width="3"/>`;
  s += `<rect x="905" y="380" width="38" height="24" fill="#22101c"/><path d="M909 386h30M909 392h30M909 398h30" stroke="#3d2033" stroke-width="2"/>`;
  s += `<rect x="800" y="387" width="36" height="68" fill="#4a1f38" id="door-in"/>`;
  s += `<rect x="800" y="387" width="36" height="68" fill="#ffb3c7" opacity="0" id="door-light" filter="url(#gPink)"/>`;
  s += `<g id="door"><rect x="800" y="387" width="36" height="68" fill="#1e0a18" stroke="#52203f" stroke-width="1.5"/><circle cx="830" cy="423" r="2" fill="#ff9ab8"/></g>`;
  s += `<g id="onair-small" opacity="0.25"><rect x="799" y="368" width="38" height="13" rx="3" fill="none" stroke="#ffe6ee" stroke-width="1.2" filter="url(#gRed)"/><text x="818" y="378" font-size="8.5" font-family="'Tilt Neon', sans-serif" text-anchor="middle" fill="#ffe6ee" filter="url(#gRed)" letter-spacing="0.8">ON AIR</text></g>`;
  // 外階段（家の前を右下から左上へ）と2階の通路
  s += `<rect x="770" y="453" width="110" height="5" fill="#0a0307"/>`;
  s += `<path d="M770 433H880M770 433V455M795 433V455M820 433V455M845 433V455M870 433V455" stroke="#0a0307" stroke-width="2.5" fill="none"/>`;
  s += `<path d="M850 457L945 566" stroke="#0a0307" stroke-width="5"/>`;
  let steps = '';
  for (let i = 1; i < 9; i++) { const x = 850 + i * 10.5, y = 457 + i * 12.1; steps += `M${x - 12} ${y}h16`; }
  s += `<path d="${steps}" stroke="#0a0307" stroke-width="3"/>`;
  s += `<path d="M880 433L962 545M906 466V478M932 499V514M955 535V552" stroke="#0a0307" stroke-width="2.5" fill="none"/>`;
  s += `<path d="M850 457L945 566" stroke="#ff6fa0" stroke-width="0.8" opacity="0.45"/>`;
  // 家の左の小さな青い矢印看板
  s += `<text x="575" y="478" font-size="16" font-family="'IBM Plex Mono', monospace" text-anchor="middle" fill="#e6fbff" filter="url(#gIce)">→</text>`;

  // 左右のビルの壁（遠い順に）
  const wall = (X: number, z0: number, z1: number, h: number, fill: string) => `<polygon points="${pts(wallQuad(X, z0, z1, 0, h))}" fill="${fill}"/>`;
  s += wall(-1200, 2.6, 5, 1900, 'url(#wallL)') + wall(-1200, 0.25, 2.6, 1300, 'url(#wallL)');
  s += wall(1200, 3.0, 5, 1700, 'url(#wallR)') + wall(1200, 0.25, 3.0, 1150, 'url(#wallR)');
  // ビルの窓
  const winGrid = (X: number, z0: number, z1: number, h0: number, h1: number, cols: number, rows: number, seed: number) => {
    let o = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const za = lerp(z0, z1, (c + 0.25) / cols), zb = lerp(z0, z1, (c + 0.75) / cols);
      const ha = lerp(h0, h1, (r + 0.3) / rows), hb = lerp(h0, h1, (r + 0.75) / rows);
      const lit = ((r * 13 + c * 7 + seed) % 6) === 0;
      o += `<polygon points="${pts(wallQuad(X, za, zb, ha, hb))}" fill="${lit ? '#ffa8c4' : '#14050f'}" opacity="${lit ? 0.45 : 0.9}"/>`;
    }
    return o;
  };
  s += winGrid(-1200, 2.7, 4.9, 400, 1800, 5, 6, 1) + winGrid(-1200, 0.6, 2.5, 380, 1250, 4, 4, 3);
  s += winGrid(1200, 3.1, 4.9, 380, 1650, 4, 5, 2) + winGrid(1200, 0.6, 2.9, 380, 1100, 4, 4, 5);
  // 左手前のお店（明かりが漏れている）
  s += `<polygon points="${pts(wallQuad(-1200, 1.15, 1.9, 0, 300))}" fill="#ffd9b0" opacity="0.6" filter="url(#gOrange)"/>`;
  s += `<polygon points="${pts([P(-1200, 1.15, 0), P(-1200, 1.9, 0), P(-700, 1.9, 0), P(-500, 1.15, 0)])}" fill="#ffb27a" opacity="0.12" filter="url(#blur10)"/>`;
  // 右手前の自動販売機
  const vm = [P(1000, 1.6, 360), P(1180, 1.6, 0)];
  s += `<rect x="${vm[0][0]}" y="${vm[0][1]}" width="${vm[1][0] - vm[0][0]}" height="${vm[1][1] - vm[0][1]}" fill="#e9f7ff" filter="url(#gWhite)"/>`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const cols = ['#ff4f6d', '#3aa0ff', '#ffd23a', '#47d18a', '#ff8a2a'];
    s += `<rect x="${vm[0][0] + 9 + c * 19}" y="${vm[0][1] + 14 + r * 30}" width="10" height="18" rx="3" fill="${cols[(r + c) % 5]}"/>`;
  }
  s += `<rect x="${vm[0][0] + 10}" y="${vm[0][1] + 120}" width="${vm[1][0] - vm[0][0] - 20}" height="70" fill="#c7dbe6"/>`;
  s += `<ellipse cx="${(vm[0][0] + vm[1][0]) / 2}" cy="${vm[1][1] + 40}" rx="120" ry="40" fill="#bfefff" opacity="0.18" filter="url(#blur10)"/>`;

  // ---- 壁一面のスプレーの落書き（タギング） ----
  s += graffiti();

  // 地面に映るネオン
  s += `<g id="refl" filter="url(#blur10)">
    <ellipse cx="170" cy="790" rx="34" ry="130" fill="#ff3d7f" opacity="0.3"/>
    <ellipse cx="467" cy="640" rx="14" ry="55" fill="#ff8a2a" opacity="0.3"/>
    <ellipse cx="1272" cy="720" rx="56" ry="90" fill="#4fd8ff" opacity="0.25"/>
    <ellipse cx="780" cy="620" rx="120" ry="40" fill="#ff8a2a" opacity="0.18"/>
    <ellipse cx="846" cy="600" rx="110" ry="30" fill="#ff8fb4" opacity="0.22"/>
  </g>`;

  // 看板：CLUB（縦）、VINYL（縦）、BAR、24（日本語の看板は使わない）
  const neon = "'Tilt Neon', sans-serif";
  s += `<g id="sign-l1"><rect x="139" y="6" width="61" height="389" rx="6" fill="#1a0614" stroke="#ffd6e4" stroke-width="2.5" filter="url(#gPink)"/>${vtext('CLUB', 169.5, 90, 88, 60, '#ffe1ec', 'gPink', neon)}</g>`;
  s += `<g id="sign-l2"><rect x="450" y="321" width="35" height="153" rx="4" fill="#1a0a06"/>${vtext('VINYL', 467.5, 348, 29, 24, '#ffe3c8', 'gOrange', neon)}</g>`;
  s += `<g id="sign-r1"><rect x="1209" y="295" width="127" height="55" rx="8" fill="#06141a" stroke="#d8f7ff" stroke-width="2.5" filter="url(#gIce)"/><text x="1272.5" y="338" font-size="40" font-family="'Tilt Neon', sans-serif" text-anchor="middle" fill="#e6fbff" filter="url(#gIce)" letter-spacing="6">BAR</text></g>`;
  s += `<g id="sign-r2"><circle cx="1150" cy="428" r="22" fill="#14040a" stroke="#ffd6dc" stroke-width="2.5" filter="url(#gRed)"/><text x="1150" y="437" font-size="24" font-family="${neon}" text-anchor="middle" fill="#ffe6ee" filter="url(#gRed)">24</text></g>`;

  // 電線
  s += `<path d="M-400 150Q700 290 2000 70M-400 230Q760 330 2000 190M200 -80Q820 200 1500 250" stroke="#090208" stroke-width="2.5" fill="none"/>`;
  // もや
  s += `<rect x="-5000" y="-6000" width="11600" height="12000" fill="url(#haze)" style="mix-blend-mode:screen" pointer-events="none"/>`;

  // 人影（足元が原点、身長100）
  // 人影：コートのポケットに手を入れたおっさん。足は付け根で回す
  const leg = (id: string) => `<g id="${id}"><path d="M-4.2 0Q-4.6 16 -3.6 28Q-3.1 37 -2.7 43.5L2.9 43.5Q3.3 36 3.7 27Q4.6 14 4.2 0Z"/><path d="M-3.1 43Q-3.5 46.3 -2.6 47L7.4 47Q8.2 45.6 6 44L2.9 43Z"/></g>`;
  s += `<g id="fig" filter="url(#figfx)" opacity="0" fill="#040205">
    ${leg('legL')}${leg('legR')}
    <path d="M-3 -86.5Q-3.4 -84.6 -6 -83.8Q-10.6 -82.8 -12.8 -80.6Q-14.4 -78.6 -14.4 -74Q-14.6 -66 -14.9 -58Q-14.2 -44 -12.9 -30.5Q-6 -29.2 0 -29.6Q6 -29.2 12.9 -30.5Q14.2 -44 14.9 -58Q14.6 -66 14.4 -74Q14.4 -78.6 12.8 -80.6Q10.6 -82.8 6 -83.8Q3.4 -84.6 3 -86.5Z"/>
    <path d="M-14.6 -60Q-15.8 -54 -14.4 -50L-11.6 -50.5Z"/><path d="M14.6 -60Q15.8 -54 14.4 -50L11.6 -50.5Z"/>
    <path d="M0.6 -99.8Q-5.3 -99.8 -5.6 -93.4Q-5.7 -89 -3.8 -87.3Q-1.8 -85.9 0.8 -86Q3.6 -86.2 5.2 -88.2Q6.4 -90 6.3 -93.4Q6.1 -99.8 0.6 -99.8Z"/>
    <path d="M-5.4 -94.5Q-6.4 -100.6 0 -101Q6.6 -101 6.6 -94.8Q4 -97.6 0.4 -97.6Q-3.2 -97.4 -5.4 -94.5Z"/>
  </g>`;
  return s;
}

function buildRoom(): string {
  let s = `<defs>
    ${glow('rOrange', '#ff9a3a', 3, 9)}${glow('rRed', '#ff2a4f', 2, 6)}
    <filter id="rblur3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="rblur14" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
    <linearGradient id="rwall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c0e1d"/><stop offset="0.5" stop-color="#140a16"/><stop offset="1" stop-color="#0b060c"/></linearGradient>
    <linearGradient id="outside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14051a"/><stop offset="1" stop-color="#5a1648"/></linearGradient>
    <linearGradient id="spill" gradientUnits="userSpaceOnUse" x1="700" y1="200" x2="1450" y2="880"><stop offset="0" stop-color="#ff4f8b" stop-opacity="0.34"/><stop offset="0.6" stop-color="#ff4f8b" stop-opacity="0.09"/><stop offset="1" stop-color="#ff4f8b" stop-opacity="0.03"/></linearGradient>
    <linearGradient id="spillB" gradientUnits="userSpaceOnUse" x1="300" y1="640" x2="420" y2="900"><stop offset="0" stop-color="#7fe7ff" stop-opacity="0.22"/><stop offset="1" stop-color="#7fe7ff" stop-opacity="0"/></linearGradient>
    <pattern id="slats" width="40" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(14)"><rect width="40" height="13" fill="#fff"/></pattern>
    <mask id="slatMask" maskUnits="userSpaceOnUse" x="-500" y="-500" width="3000" height="2000"><rect x="-500" y="-500" width="3000" height="2000" fill="url(#slats)"/></mask>
    <radialGradient id="tvGlow" cx="1153" cy="496" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#cfe9ff" stop-opacity="0.32"/><stop offset="1" stop-color="#cfe9ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="tvBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a26"/><stop offset="1" stop-color="#1e1513"/></linearGradient>
    <linearGradient id="radioBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d2430"/><stop offset="1" stop-color="#211219"/></linearGradient>
    <pattern id="grill" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.6" fill="#0d0609"/></pattern>
    <clipPath id="glass"><rect x="315" y="155" width="370" height="310"/></clipPath>
  </defs>`;
  // 壁と床
  s += `<rect x="-5000" y="-6000" width="11600" height="6640" fill="url(#rwall)"/>`;
  s += `<rect x="-5000" y="640" width="11600" height="5000" fill="#0b060c"/>`;
  s += `<rect x="-5000" y="632" width="11600" height="9" fill="#070307"/>`;
  s += `<path d="M-400 700H2000M-400 780H2000M-400 880H2000" stroke="#140b14" stroke-width="2"/>`;
  // 窓の外のネオン街（にじんで見える）
  s += `<rect x="300" y="140" width="400" height="340" fill="#080408"/>`;
  s += `<g clip-path="url(#glass)">
    <rect x="315" y="155" width="370" height="310" fill="url(#outside)"/>
    <g filter="url(#rblur3)">
      <rect x="315" y="300" width="110" height="200" fill="#1a0718"/><rect x="560" y="260" width="140" height="240" fill="#1a0718"/>
      <rect x="360" y="190" width="26" height="170" fill="#ff4f8b" id="out-pink"/>
      <rect x="470" y="230" width="150" height="26" fill="#ff8a2a" id="out-orange"/>
      <rect x="585" y="330" width="60" height="16" fill="#4fd8ff" id="out-blue"/>
      <circle cx="520" cy="400" r="8" fill="#ff2a4f"/><circle cx="545" cy="400" r="8" fill="#ff2a4f"/>
    </g>
  </g>`;
  // ブラインド（すき間からネオンが見える）
  let slats = '';
  for (let y = 155; y < 465; y += 22) slats += `<rect x="315" y="${y}" width="370" height="12" fill="#1c0d19"/>`;
  s += `<g opacity="0.92">${slats}</g>`;
  s += `<rect x="496" y="140" width="8" height="340" fill="#080408"/><rect x="300" y="302" width="400" height="7" fill="#080408"/>`;
  s += `<rect x="290" y="478" width="420" height="10" fill="#0f070e"/>`;
  // 窓から入るネオンの光（ブラインドの縞）
  s += `<g id="spill" style="mix-blend-mode:screen">
    <polygon points="700,160 1180,250 1520,900 700,900" fill="url(#spill)" mask="url(#slatMask)"/>
    <polygon points="300,640 700,640 840,900 250,900" fill="url(#spillB)" mask="url(#slatMask)"/>
  </g>`;
  // 壁のポスター
  s += `<rect x="1400" y="170" width="120" height="170" fill="#170c15" stroke="#241521" stroke-width="3"/>`;
  s += `<text x="1460" y="250" font-size="30" font-family="'Tilt Neon', sans-serif" text-anchor="middle" fill="#3a2433">FM</text><text x="1460" y="280" font-size="11" font-family="'IBM Plex Mono', monospace" text-anchor="middle" fill="#3a2433">24:00</text>`;
  // 机
  s += `<rect x="790" y="612" width="560" height="150" fill="#170d13"/><path d="M800 690H1340M1070 612V762" stroke="#0c060a" stroke-width="3"/>`;
  s += `<circle cx="935" cy="652" r="3" fill="#2b1a22"/><circle cx="1205" cy="652" r="3" fill="#2b1a22"/><circle cx="935" cy="728" r="3" fill="#2b1a22"/><circle cx="1205" cy="728" r="3" fill="#2b1a22"/>`;
  s += `<rect x="776" y="598" width="588" height="15" rx="3" fill="#2a1820"/><path d="M780 598H1360" stroke="#ff6fa0" stroke-width="1.2" opacity="0.4"/>`;
  // ラジオ
  s += `<path d="M845 494V472Q845 466 851 466H984Q990 466 990 472V494" stroke="#2b1820" stroke-width="6" fill="none"/>`;
  s += `<line x1="996" y1="494" x2="1074" y2="358" stroke="#6a5560" stroke-width="2.5"/><circle cx="1074" cy="358" r="3.5" fill="#8a7580"/>`;
  s += `<rect x="820" y="492" width="190" height="106" rx="12" fill="url(#radioBody)" stroke="#4d2c3c" stroke-width="1.5"/>`;
  s += `<circle cx="870" cy="546" r="36" fill="#26141c"/><circle cx="870" cy="546" r="36" fill="url(#grill)"/><circle cx="870" cy="546" r="36" fill="none" stroke="#4d2c3c" stroke-width="2"/>`;
  s += `<rect x="922" y="510" width="74" height="32" rx="4" fill="#2a1505"/>`;
  s += `<rect x="922" y="510" width="74" height="32" rx="4" fill="#ffb060" opacity="0.5" filter="url(#rOrange)" id="dial-light"/>`;
  s += `<path d="M928 534h62M932 534v-6M942 534v-4M952 534v-6M962 534v-4M972 534v-6M982 534v-4" stroke="#5a2f10" stroke-width="1.2"/>`;
  s += `<text x="959" y="524" font-size="7" font-family="'IBM Plex Mono', monospace" text-anchor="middle" fill="#5a2f10">76 80 84 88 90</text>`;
  s += `<line id="needle" x1="950" y1="513" x2="950" y2="540" stroke="#ff2a4f" stroke-width="2" filter="url(#rRed)"/>`;
  s += `<circle cx="940" cy="572" r="9" fill="#120a0e" stroke="#5a3a48"/><circle cx="978" cy="572" r="9" fill="#120a0e" stroke="#5a3a48"/>`;
  s += `<circle cx="1000" cy="503" r="2.5" fill="#ff2a4f" filter="url(#rRed)"/>`;
  s += `<g id="waves" fill="none" stroke="#ffb3c7" stroke-width="1.5"><path d="M800 520Q790 546 800 572"/><path d="M788 510Q774 546 788 582"/><path d="M776 500Q758 546 776 592"/></g>`;
  // カセットとマグ
  s += `<rect x="1013" y="580" width="34" height="9" rx="1.5" fill="#26161d"/><rect x="1015" y="571" width="32" height="9" rx="1.5" fill="#33202a"/><rect x="1018" y="574" width="12" height="3" fill="#ff5c8a" opacity="0.5"/>`;
  s += `<rect x="1318" y="566" width="26" height="32" rx="3" fill="#2a1d22"/><path d="M1344 574Q1354 576 1352 584Q1350 590 1344 590" stroke="#2a1d22" stroke-width="4" fill="none"/>`;
  // 小さなブラウン管テレビ
  s += `<line x1="1180" y1="400" x2="1118" y2="296" stroke="#6a5560" stroke-width="2.5"/><line x1="1186" y1="400" x2="1256" y2="292" stroke="#6a5560" stroke-width="2.5"/><circle cx="1118" cy="296" r="3.5" fill="#8a7580"/><circle cx="1256" cy="292" r="3.5" fill="#8a7580"/>`;
  s += `<rect x="1168" y="392" width="30" height="10" rx="4" fill="#241815"/>`;
  s += `<rect x="1072" y="590" width="20" height="10" fill="#120c0b"/><rect x="1270" y="590" width="20" height="10" fill="#120c0b"/>`;
  s += `<rect x="1050" y="398" width="260" height="196" rx="22" fill="url(#tvBody)" stroke="#4a3631" stroke-width="1.5"/>`;
  s += `<rect x="1068" y="413" width="170" height="166" rx="22" fill="#0b0809"/>`;
  s += `<circle cx="1272" cy="448" r="13" fill="#151010" stroke="#5a4842" stroke-width="1.5"/><line x1="1272" y1="448" x2="1272" y2="437" stroke="#7a6862" stroke-width="2"/>`;
  s += `<circle cx="1272" cy="490" r="9" fill="#151010" stroke="#5a4842" stroke-width="1.5"/>`;
  s += `<path d="M1255 522H1290M1255 532H1290M1255 542H1290M1255 552H1290M1255 562H1290" stroke="#120c0b" stroke-width="3"/>`;
  s += `<circle cx="1290" cy="580" r="2.5" fill="#7fe7ff" opacity="0.8"/>`;
  // テレビの光（机と壁を照らす）
  s += `<rect id="tvglow" x="-5000" y="-6000" width="11600" height="12000" fill="url(#tvGlow)" style="mix-blend-mode:screen" pointer-events="none"/>`;
  return s;
}

export const streetSvg = prefix(buildStreet());
export const roomSvg = prefix(buildRoom());
