// ネタを「記事の下書き」に変換する。ブログの記事フォルダにそのまま入れられる形で書き出す。

import type { Neta } from './db';

export type ExportFile = { name: string; blob: Blob };

/** 1枚目は photo.jpg（トップ画像）、2枚目以降は photo-2.jpg… */
export const photoName = (i: number) => (i === 0 ? 'photo.jpg' : `photo-${i + 1}.jpg`);

export function folderName(n: Neta): string {
  return `${n.date}-${n.id.slice(0, 4)}`;
}

/** 本文の最初の1行（説明文やタイトル候補に使う） */
function firstLine(text: string, max: number): string {
  const line = text.trim().split(/\n/)[0] ?? '';
  return line.length > max ? line.slice(0, max) + '…' : line;
}

/** YAML に安全に入れるための引用 */
function yaml(s: string): string {
  return JSON.stringify(s);
}

export function toMarkdown(n: Neta): string {
  const title = n.title.trim() || firstLine(n.memo, 24) || 'タイトル未定';
  const lines = [
    '---',
    `title: ${yaml(title)}`,
    `date: ${n.date}`,
    `category: ${yaml(n.category)}`,
  ];
  if (n.photoIds.length) lines.push(`image: ./${photoName(0)}`);
  const desc = firstLine(n.memo, 60);
  if (desc) lines.push(`description: ${yaml(desc)}`);
  lines.push('draft: true', '---', '');

  if (n.place.trim()) lines.push(`場所：${n.place.trim()}`, '');
  // メモの改行は段落の区切りとして扱う（Markdown では1回の改行だと文がつながるため）
  lines.push(n.memo.trim().split(/\n+/).join('\n\n') || '（ここに本文）', '');
  for (let i = 1; i < n.photoIds.length; i++) lines.push(`![](./${photoName(i)})`, '');
  lines.push('**一言感想:** （ここに一言）', '');
  return lines.join('\n');
}

/** Claude に記事を書いてもらうための依頼文 */
export function toRequest(n: Neta): string {
  return [
    'このネタを「ikのプレイリスト」の記事にしてください。いつものユーモアある日記のノリでお願いします。',
    '',
    `日付：${n.date}`,
    `カテゴリー：${n.category}`,
    n.title.trim() ? `タイトル案：${n.title.trim()}` : '',
    n.place.trim() ? `場所：${n.place.trim()}` : '',
    `写真：${n.photoIds.length}枚${n.photoIds.length ? '（添付します）' : ''}`,
    '',
    'メモ：',
    n.memo.trim(),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}
