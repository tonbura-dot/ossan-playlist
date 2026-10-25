// ビルド結果（dist/）の自動チェック。`npm test` で ビルド → このチェック の順に動く。
// - 必要なページがそろっているか
// - 各ページにタイトル・説明・スマホ用の設定・見出しがあるか
// - サイト内のリンクや画像が、すべて実在するファイルを指しているか（リンク切れがないか）
// - オープニング演出の部品がトップページに入っているか

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = '/' + (process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '');
const basePrefix = base === '/' ? '/' : base + '/';

const errors = [];
const fail = (msg) => errors.push(msg);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** サイト内の URL を dist/ のファイルに変換。サイト外なら null */
function toFile(url, fromFile) {
  if (/^(https?:)?\/\//.test(url) || /^(mailto|tel|data|javascript):/.test(url)) return null;
  const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (clean === '') return null; // ページ内リンク
  let path;
  if (clean.startsWith('/')) {
    if (!clean.startsWith(basePrefix) && clean !== base) {
      return { bad: `base（${basePrefix}）の外を指している` };
    }
    path = clean.slice(basePrefix.length);
  } else {
    const dirOf = relative(root, fromFile).split(sep).slice(0, -1).join('/');
    path = [dirOf, clean].filter(Boolean).join('/');
  }
  if (path === '' || path.endsWith('/')) path += 'index.html';
  return { file: join(root, path) };
}

const files = await walk(root);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => relative(root, f).split(sep).join('/');

// ---- 必要なページ ----
const required = ['index.html', 'posts/index.html', 'profile/index.html', 'contact/index.html', 'privacy/index.html', '404.html'];
for (const r of required) {
  if (!(await exists(join(root, r)))) fail(`必要なページがない: ${r}`);
}
const postPages = htmlFiles.filter((f) => /^posts\/[^/]+\/index\.html$/.test(rel(f)));
if (postPages.length < 3) fail(`記事ページが3本未満: ${postPages.length}本`);

// ---- ページごとのチェック ----
let linkCount = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const name = rel(file);

  if (!/<html[^>]*\slang="ja"/.test(html)) fail(`${name}: <html lang="ja"> がない`);
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${name}: <title> がない`);
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1[",]/.test(html)) fail(`${name}: スマホ用 viewport がない`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`${name}: description がない`);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(`${name}: h1 が ${h1} 個（1個であるべき）`);
  if (/\bundefined\b|\[object Object\]|NaN年/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) {
    fail(`${name}: 表示に undefined / [object Object] / NaN が混ざっている`);
  }

  // リンク・画像
  const urls = [];
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) urls.push(m[1]);
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) urls.push(part.trim().split(/\s+/)[0]);
  }
  for (const u of urls) {
    const target = toFile(u.replaceAll('&amp;', '&'), file);
    if (!target) continue;
    linkCount++;
    if (target.bad) fail(`${name}: ${u} — ${target.bad}`);
    else if (!(await exists(target.file))) fail(`${name}: リンク切れ ${u}`);
  }

  // 画像には alt を付ける（飾りなら空でよい）
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt(=|[\s>])/.test(m[0])) fail(`${name}: alt のない画像 ${m[0].slice(0, 80)}…`);
  }
}

// ---- トップページのオープニング ----
const index = await readFile(join(root, 'index.html'), 'utf8');
for (const part of ['id="opening"', 'op__skip', 'op__video', 'opening/opening-1080.mp4', 'opening/opening-720.mp4', 'op__static', 'ossan-opening-seen']) {
  if (!index.includes(part)) fail(`index.html: オープニングの部品 ${part} がない`);
}
// アクセスカウンター
if (!index.includes('id="access-counter"')) fail('index.html: アクセスカウンターがない');
// オープニング以外のページには演出を入れない
for (const file of htmlFiles) {
  if (rel(file) !== 'index.html' && (await readFile(file, 'utf8')).includes('id="opening"')) {
    fail(`${rel(file)}: トップ以外にオープニングが入っている`);
  }
}

// ---- 結果 ----
console.log(`base: ${basePrefix}`);
console.log(`ページ: ${htmlFiles.length}（記事 ${postPages.length} 本）、確認したリンク: ${linkCount}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} 件の問題:`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ 問題なし');
