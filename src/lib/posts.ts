import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES } from '../site.config';

export type Post = CollectionEntry<'posts'>;

/** 新しい順の全記事（下書きは本番では除く） */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (p) => !(p.data.draft && import.meta.env.PROD));
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

/** base を考慮したサイト内リンク */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = path.replace(/^\//, '');
  return `${base}/${p}`;
}

export function categorySlug(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.slug ?? name;
}

/** 記事に出てくるカテゴリー（設定の順 → 設定にないものは後ろ） */
export function categoriesOf(posts: Post[]) {
  const used = new Set(posts.map((p) => p.data.category));
  const known = CATEGORIES.filter((c) => used.has(c.name));
  const extra = [...used]
    .filter((n) => !CATEGORIES.some((c) => c.name === n))
    .map((n) => ({ name: n, slug: n, blurb: '' }));
  return [...known, ...extra].map((c) => ({
    ...c,
    count: posts.filter((p) => p.data.category === c.name).length,
  }));
}

/** "2026-10" 形式。日本時間で判定する */
export function monthKey(d: Date): string {
  const s = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  return s.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${y}年${Number(m)}月`;
}

export function monthsOf(posts: Post[]) {
  const map = new Map<string, number>();
  for (const p of posts) {
    const k = monthKey(p.data.date);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => ({ key, label: monthLabel(key), count }));
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' });
}

export function isoDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}
