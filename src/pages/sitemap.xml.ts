// 検索エンジン向けのサイトマップ（/sitemap.xml）。Search Console に登録して使う。
import type { APIRoute } from 'astro';
import { getPosts, url, isoDate, monthKey, categoriesOf } from '../lib/posts';

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPosts();
  const abs = (path: string) => new URL(url(path), site).href;
  const latest = posts[0] && isoDate(posts[0].data.date);

  const entries: { loc: string; lastmod?: string }[] = [
    { loc: abs(''), lastmod: latest },
    { loc: abs('posts/'), lastmod: latest },
    ...posts.map((p) => ({ loc: abs(`posts/${p.id}/`), lastmod: isoDate(p.data.date) })),
    ...categoriesOf(posts).map((c) => ({ loc: abs(`category/${c.slug}/`) })),
    ...[...new Set(posts.map((p) => monthKey(p.data.date)))].map((m) => ({ loc: abs(`archive/${m}/`) })),
    { loc: abs('profile/') },
    { loc: abs('contact/') },
    { loc: abs('privacy/') },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
