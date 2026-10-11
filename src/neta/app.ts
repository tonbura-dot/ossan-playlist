// ネタ帳の画面の動き。
import {
  available,
  listNeta,
  getPhoto,
  saveNeta,
  deleteNeta,
  setDone,
  exportBackup,
  importBackup,
  type Neta,
  type Photo,
} from './db';
import { toMarkdown, toRequest, photoName, folderName, type ExportFile } from './export';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MAX_SIDE = 1600;
const MAX_PHOTOS = 6;

// ---- 小さな道具 ----
const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');

function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $('nt-toast');
  // 開いているダイアログの上に出すため、ダイアログの中へ移す
  const host = document.querySelector('dialog[open]') ?? document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 2400);
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}をコピーしました`);
  } catch {
    // クリップボードが使えないときは、選択状態にして手でコピーしてもらう
    const ta = $<HTMLTextAreaElement>('ex-md');
    ta.value = text;
    ta.select();
    toast('コピーできませんでした。選択した文字を長押しでコピーしてください');
  }
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** 写真を長辺 1600px の JPEG に縮める（スマホの写真は大きすぎるので） */
async function shrink(file: File): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number };
  let cleanup = () => {};
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    cleanup = () => (source as ImageBitmap).close();
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    source = img;
    cleanup = () => URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(source, 0, 0, w, h);
  cleanup();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
  );
}

// 表示用の画像 URL（使い回し、不要になったら解放）
const urlCache = new Map<string, string>();
async function photoUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const p = await getPhoto(id);
  if (!p) return null;
  const u = URL.createObjectURL(p.blob);
  urlCache.set(id, u);
  return u;
}
function forgetPhoto(id: string) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
}

// ---- 一覧 ----
let all: Neta[] = [];
let filter: 'all' | 'todo' | 'done' = 'todo';

async function refresh() {
  all = await listNeta();
  render();
}

function render() {
  const list = $<HTMLUListElement>('nt-list');
  const shown = all.filter((n) => (filter === 'all' ? true : filter === 'done' ? n.done : !n.done));
  const counts = { all: all.length, todo: all.filter((n) => !n.done).length, done: all.filter((n) => n.done).length };
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
    const f = b.dataset.filter as keyof typeof counts;
    b.setAttribute('aria-pressed', String(f === filter));
    b.querySelector('span')!.textContent = String(counts[f]);
  });
  $('nt-empty').hidden = shown.length > 0;
  $('nt-empty').textContent = all.length === 0 ? 'まだネタがありません。何か見つけたら「＋ ネタを追加」から。' : 'ここに入るネタはありません。';

  list.replaceChildren(
    ...shown.map((n) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nt-card' + (n.done ? ' is-done' : '');
      btn.addEventListener('click', () => openEditor(n));

      const thumb = document.createElement('span');
      thumb.className = 'nt-card__thumb';
      if (n.photoIds[0]) {
        const img = document.createElement('img');
        img.alt = '';
        photoUrl(n.photoIds[0]).then((u) => u && (img.src = u));
        thumb.append(img);
        if (n.photoIds.length > 1) {
          const more = document.createElement('span');
          more.className = 'nt-card__more';
          more.textContent = `+${n.photoIds.length - 1}`;
          thumb.append(more);
        }
      } else {
        thumb.textContent = n.category;
      }

      const body = document.createElement('span');
      body.className = 'nt-card__body';
      const meta = document.createElement('span');
      meta.className = 'nt-card__meta';
      meta.textContent = [formatDate(n.date), n.category, n.place.trim()].filter(Boolean).join('・');
      const title = document.createElement('span');
      title.className = 'nt-card__title';
      title.textContent = n.title.trim() || n.memo.trim().split('\n')[0] || '（メモなし）';
      body.append(meta, title);
      if (n.title.trim() && n.memo.trim()) {
        const memo = document.createElement('span');
        memo.className = 'nt-card__memo';
        memo.textContent = n.memo.trim();
        body.append(memo);
      }
      if (n.done) {
        const badge = document.createElement('span');
        badge.className = 'nt-card__badge';
        badge.textContent = '記事にした';
        body.append(badge);
      }
      btn.append(thumb, body);
      li.append(btn);
      return li;
    }),
  );
}

// ---- 入力画面 ----
let editing: Neta | null = null;
let draftPhotos: { id: string; blob?: Blob; url: string }[] = [];
let removed: string[] = [];

const editor = () => $<HTMLDialogElement>('nt-editor');

async function openEditor(n: Neta | null) {
  editing = n;
  removed = [];
  draftPhotos = [];
  if (n) {
    for (const id of n.photoIds) {
      const u = await photoUrl(id);
      if (u) draftPhotos.push({ id, url: u });
    }
  }
  $<HTMLTextAreaElement>('ed-memo').value = n?.memo ?? '';
  $<HTMLInputElement>('ed-title').value = n?.title ?? '';
  $<HTMLInputElement>('ed-place').value = n?.place ?? '';
  $<HTMLSelectElement>('ed-category').value = n?.category ?? $<HTMLSelectElement>('ed-category').options[0].value;
  $<HTMLInputElement>('ed-date').value = n?.date ?? today();
  $('ed-heading').textContent = n ? 'ネタを編集' : 'ネタを追加';
  $('ed-delete').hidden = !n;
  $('ed-export').hidden = !n;
  renderDraftPhotos();
  editor().showModal();
  if (!n) $<HTMLTextAreaElement>('ed-memo').focus();
}

function renderDraftPhotos() {
  const box = $('ed-photos');
  box.replaceChildren(
    ...draftPhotos.map((p, i) => {
      const fig = document.createElement('div');
      fig.className = 'ed-photo';
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = `写真${i + 1}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ed-photo__del';
      del.setAttribute('aria-label', `写真${i + 1}を外す`);
      del.textContent = '×';
      del.addEventListener('click', () => {
        if (p.blob) URL.revokeObjectURL(p.url);
        else removed.push(p.id);
        draftPhotos.splice(i, 1);
        renderDraftPhotos();
      });
      fig.append(img, del);
      if (i === 0) {
        const tag = document.createElement('span');
        tag.className = 'ed-photo__tag';
        tag.textContent = 'トップ';
        fig.append(tag);
      }
      return fig;
    }),
  );
  const full = draftPhotos.length >= MAX_PHOTOS;
  document.querySelectorAll<HTMLInputElement>('.ed-pick input').forEach((i) => (i.disabled = full));
  $('ed-photo-note').textContent = full ? `写真は${MAX_PHOTOS}枚まで` : `写真 ${draftPhotos.length}/${MAX_PHOTOS}`;
}

async function addFiles(files: FileList | null) {
  if (!files?.length) return;
  const room = MAX_PHOTOS - draftPhotos.length;
  const picked = Array.from(files).slice(0, room);
  if (files.length > room) toast(`写真は${MAX_PHOTOS}枚までです`);
  $('ed-photo-note').textContent = '写真を読み込んでいます…';
  for (const f of picked) {
    try {
      const blob = await shrink(f);
      draftPhotos.push({ id: uid(), blob, url: URL.createObjectURL(blob) });
    } catch {
      toast('読み込めない写真がありました');
    }
  }
  renderDraftPhotos();
}

function closeEditor() {
  for (const p of draftPhotos) if (p.blob) URL.revokeObjectURL(p.url);
  draftPhotos = [];
  editor().close();
}

async function save(): Promise<Neta | null> {
  const memo = $<HTMLTextAreaElement>('ed-memo').value;
  if (!memo.trim() && draftPhotos.length === 0) {
    toast('写真か一言のどちらかは入れてください');
    $<HTMLTextAreaElement>('ed-memo').focus();
    return null;
  }
  const now = Date.now();
  const neta: Neta = {
    id: editing?.id ?? uid(),
    date: $<HTMLInputElement>('ed-date').value || today(),
    title: $<HTMLInputElement>('ed-title').value.trim(),
    memo,
    place: $<HTMLInputElement>('ed-place').value.trim(),
    category: $<HTMLSelectElement>('ed-category').value,
    photoIds: draftPhotos.map((p) => p.id),
    done: editing?.done ?? false,
    createdAt: editing?.createdAt ?? now,
    updatedAt: now,
  };
  const fresh: Photo[] = draftPhotos.filter((p) => p.blob).map((p) => ({ id: p.id, blob: p.blob! }));
  try {
    await saveNeta(neta, fresh, removed);
  } catch {
    toast('保存できませんでした。端末の空き容量を確認してください');
    return null;
  }
  removed.forEach(forgetPhoto);
  // 保存した写真の URL はそのまま一覧で使い回す
  for (const p of draftPhotos) if (p.blob) urlCache.set(p.id, p.url);
  draftPhotos = [];
  editor().close();
  // 端末の容量が少なくなっても消されにくくする（対応ブラウザのみ）
  navigator.storage?.persist?.().catch(() => {});
  await refresh();
  toast(editing ? '保存しました' : 'ネタ帳に入れました');
  return neta;
}

// ---- 記事の材料にする ----
let exporting: Neta | null = null;

async function filesFor(n: Neta): Promise<ExportFile[]> {
  const files: ExportFile[] = [{ name: 'index.md', blob: new Blob([toMarkdown(n)], { type: 'text/plain' }) }];
  for (let i = 0; i < n.photoIds.length; i++) {
    const p = await getPhoto(n.photoIds[i]);
    if (p) files.push({ name: photoName(i), blob: p.blob });
  }
  return files;
}

function openExport(n: Neta) {
  exporting = n;
  $('ex-folder').textContent = folderName(n);
  $<HTMLTextAreaElement>('ex-md').value = toMarkdown(n);
  $<HTMLInputElement>('ex-done').checked = n.done;
  $('ex-share').hidden = !('share' in navigator);
  $<HTMLDialogElement>('nt-export').showModal();
}

async function share() {
  if (!exporting) return;
  const n = exporting;
  const text = toRequest(n);
  const photos = (await filesFor(n)).filter((f) => f.name !== 'index.md');
  const files = photos.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'image/jpeg' }));
  try {
    if (files.length && navigator.canShare?.({ files, text })) {
      await navigator.share({ files, text, title: n.title || 'ネタ' });
    } else {
      await navigator.share({ text, title: n.title || 'ネタ' });
      if (files.length) toast('この端末では写真をいっしょに共有できません。写真は別に送ってください');
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast('共有できませんでした');
  }
}

async function downloadAll() {
  if (!exporting) return;
  const prefix = folderName(exporting);
  for (const f of await filesFor(exporting)) {
    download(f.blob, `${prefix}_${f.name}`);
    await new Promise((r) => setTimeout(r, 400)); // まとめて落とすとブラウザに止められるので少し待つ
  }
  toast('ファイルを保存しました（ファイル名の頭の日付ごとにフォルダへ）');
}

// ---- 起動 ----
export async function start() {
  if (!(await available())) {
    $('nt-warn').hidden = false;
    $<HTMLButtonElement>('nt-add').disabled = true;
    return;
  }

  $('nt-add').addEventListener('click', () => openEditor(null));
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.filter as typeof filter;
      render();
    }),
  );

  document.querySelectorAll<HTMLInputElement>('.ed-pick input').forEach((input) =>
    input.addEventListener('change', async () => {
      await addFiles(input.files);
      input.value = '';
    }),
  );
  $('ed-cancel').addEventListener('click', closeEditor);
  editor().addEventListener('cancel', (e) => {
    e.preventDefault();
    closeEditor();
  });
  $('ed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  $('ed-delete').addEventListener('click', async () => {
    if (!editing || !confirm('このネタを削除します。写真も消えます。よろしいですか？')) return;
    await deleteNeta(editing);
    editing.photoIds.forEach(forgetPhoto);
    closeEditor();
    await refresh();
    toast('削除しました');
  });
  $('ed-export').addEventListener('click', async () => {
    const saved = await save();
    if (saved) openExport(saved);
  });

  $('ex-close').addEventListener('click', () => $<HTMLDialogElement>('nt-export').close());
  $('ex-share').addEventListener('click', share);
  $('ex-copy-request').addEventListener('click', () => exporting && copyText(toRequest(exporting), '依頼文'));
  $('ex-copy-md').addEventListener('click', () => exporting && copyText(toMarkdown(exporting), '下書き'));
  $('ex-download').addEventListener('click', downloadAll);
  $('ex-done').addEventListener('change', async (e) => {
    if (!exporting) return;
    exporting = await setDone(exporting, (e.target as HTMLInputElement).checked);
    await refresh();
  });

  $('bk-export').addEventListener('click', async () => {
    try {
      download(await exportBackup(), `neta-backup-${today()}.json`);
      toast('バックアップを保存しました');
    } catch {
      toast('バックアップを作れませんでした');
    }
  });
  $<HTMLInputElement>('bk-import').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const count = await importBackup(file);
      await refresh();
      toast(`${count}件のネタを読み込みました`);
    } catch {
      toast('ネタ帳のバックアップファイルではないようです');
    }
  });

  await refresh();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
