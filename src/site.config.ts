// サイト全体の設定。名前や文言を変えるときはここだけ直せばよい。

export const SITE = {
  name: 'おっさんのプレイリスト',
  author: 'ik',
  catch: 'AIですることがなくなったおっさんの窓際。',
  description: '室蘭の窓際から、日常で見つけた小さな面白いものを写真と一言で残す日記。',
  lang: 'ja',

  // プロフィールの要約（トップページに出る短い版）
  profileSummary:
    '室蘭在住のおっさん。仕事の大半をAIに任せたら、窓の外を眺める時間が増えた。そこで見つけたものを書いています。',

  // お問い合わせフォーム（Formspree）。https://formspree.io で無料登録し、
  // 発行されたフォームID（例: "xyzabcd1"）を入れると送信できるようになる。
  // 空のままだとフォームは「準備中」表示になる。
  formspreeId: '',

  // アクセス解析。空のままなら何も読み込まない。
  analytics: {
    // Google アナリティクス 4 の測定 ID（例: "G-XXXXXXXXXX"）。管理画面でアクセス数を見る用
    gaId: 'G-NL4Z313FEX',
    // GoatCounter のサイトコード（例: "ossan-playlist"）。フッターの「○○人」表示に使う。
    // GoatCounter の設定で「Allow adding visitor counts on your website」をオンにしておくこと
    goatcounter: '',
  },

  // 「ランダムに1本読む」ボタンを出す記事数のしきい値
  randomButtonMinPosts: 5,
} as const;

// カテゴリー。name は記事の category に書く名前、slug は URL に使う英字。
// ここにないカテゴリーを記事に書いても動く（URL は日本語のままになる）。
export const CATEGORIES: { name: string; slug: string; blurb: string }[] = [
  { name: '発見', slug: 'discovery', blurb: '道ばたや店先で見つけた、ちょっと変なもの。' },
  { name: 'レビュー', slug: 'review', blurb: '買ったもの・食べたものの正直な感想。' },
  { name: '日常', slug: 'daily', blurb: '特に何も起きなかった日の記録。' },
];
