---
title: ロードバランサーが動いた日
date: 2026-10-26
category: 発見
description: 図を動かしただけで、ロードバランサーと友達になれた。
---

今日、新しい言葉を覚えた。

「アニメーテッドデータフロー」。

言いにくい。3回に1回は「アニメテット」になる。僕の舌にも、交通整理をしてくれる誰かが必要だ。

ざっくり言うと、データの流れを動く図で見せるやつである。矢印が描いてあるだけの図じゃない。矢印の上を、データが実際にトコトコ歩いていく。

で、試しにロードバランサーで作ってみた。

これが、めちゃくちゃわかりやすかった。

ロードバランサーという言葉は、前から知っていた。知っていたけど、わかってはいなかった。「サーバーの、なんか、バランスを取るやつ」くらいの理解である。にわかである。顔と名前しか知らない芸能人と同じ距離感だった。

それが、図が動いた瞬間に3秒でわかった。

3秒なのだ。カップ麺より早い。

論より証拠なので、実際に見てほしい。流しているデータは、僕が競馬新聞アプリのプロジェクトで作っていた動画の一部だ。

<figure class="lbflow">
<svg viewBox="0 0 360 410" role="img" aria-labelledby="lbflow-title">
<title id="lbflow-title">動画の場面のお願いが、ロードバランサーでサーバーA・B・Cに順番に振り分けられる様子</title>
<g class="lbflow__wire"><path d="M180,48 L180,145"/><path d="M180,201 L64,338"/><path d="M180,201 L180,338"/><path d="M180,201 L296,338"/></g>
<g class="lbflow__viewer"><rect x="90" y="8" width="180" height="40" rx="10"/><text x="180" y="33" text-anchor="middle">動画を見に来た人</text></g>
<g class="lbflow__lb"><rect x="85" y="145" width="190" height="56" rx="12"/><text x="180" y="170" text-anchor="middle">ロードバランサー</text><text class="lbflow__sub" x="180" y="189" text-anchor="middle">（交通整理のおじさん）</text></g>
<g class="lbflow__srv"><rect x="14" y="338" width="100" height="58" rx="10"/><text x="64" y="362" text-anchor="middle">サーバーA</text><circle cx="64" cy="380" r="5"><animate attributeName="opacity" values="0.25;1;0.25;0.25" keyTimes="0;0.08;0.4;1" dur="3s" begin="4.2s" repeatCount="indefinite"/></circle></g><g class="lbflow__srv"><rect x="130" y="338" width="100" height="58" rx="10"/><text x="180" y="362" text-anchor="middle">サーバーB</text><circle cx="180" cy="380" r="5"><animate attributeName="opacity" values="0.25;1;0.25;0.25" keyTimes="0;0.08;0.4;1" dur="3s" begin="5.2s" repeatCount="indefinite"/></circle></g><g class="lbflow__srv"><rect x="246" y="338" width="100" height="58" rx="10"/><text x="296" y="362" text-anchor="middle">サーバーC</text><circle cx="296" cy="380" r="5"><animate attributeName="opacity" values="0.25;1;0.25;0.25" keyTimes="0;0.08;0.4;1" dur="3s" begin="6.2s" repeatCount="indefinite"/></circle></g>
<g class="lbflow__pkt" opacity="0"><animateMotion path="M180,34 L180,173 L64,338" dur="6s" begin="0s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1"/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.68;0.74;1" dur="6s" begin="0s" repeatCount="indefinite"/><rect x="-46" y="-12" width="92" height="24" rx="12"/><text y="4" text-anchor="middle">①オープニング</text></g><g class="lbflow__pkt" opacity="0"><animateMotion path="M180,34 L180,173 L180,338" dur="6s" begin="1s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1"/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.68;0.74;1" dur="6s" begin="1s" repeatCount="indefinite"/><rect x="-46" y="-12" width="92" height="24" rx="12"/><text y="4" text-anchor="middle">②パドック</text></g><g class="lbflow__pkt" opacity="0"><animateMotion path="M180,34 L180,173 L296,338" dur="6s" begin="2s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1"/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.68;0.74;1" dur="6s" begin="2s" repeatCount="indefinite"/><rect x="-46" y="-12" width="92" height="24" rx="12"/><text y="4" text-anchor="middle">③◎本命</text></g><g class="lbflow__pkt" opacity="0"><animateMotion path="M180,34 L180,173 L64,338" dur="6s" begin="3s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1"/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.68;0.74;1" dur="6s" begin="3s" repeatCount="indefinite"/><rect x="-46" y="-12" width="92" height="24" rx="12"/><text y="4" text-anchor="middle">④AI買い目</text></g><g class="lbflow__pkt" opacity="0"><animateMotion path="M180,34 L180,173 L180,338" dur="6s" begin="4s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1"/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.68;0.74;1" dur="6s" begin="4s" repeatCount="indefinite"/><rect x="-46" y="-12" width="92" height="24" rx="12"/><text y="4" text-anchor="middle">⑤レース</text></g><g class="lbflow__pkt lbflow__pkt--zero" opacity="0"><animateMotion path="M180,34 L180,173 L296,338" dur="6s" begin="5s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1"/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.68;0.74;1" dur="6s" begin="5s" repeatCount="indefinite"/><rect x="-46" y="-12" width="92" height="24" rx="12"/><text y="4" text-anchor="middle">⑥回収0円</text></g>
</svg>
<figcaption>競馬新聞アプリで作っていた動画の場面を、A→B→C→A→B→Cの順で3台に配っていく。</figcaption>
</figure>
<style>
.lbflow { margin-inline: auto; max-width: 26rem; padding: 1rem 0.75rem 0.75rem; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.lbflow svg { display: block; width: 100%; height: auto; font-family: var(--font-body); }
.lbflow figcaption { margin-top: 0.6rem; font-size: 0.85rem; color: var(--muted); text-align: center; }
.lbflow text { font-size: 13px; fill: var(--ink); }
.lbflow .lbflow__sub { font-size: 11px; fill: var(--muted); }
.lbflow__wire path { fill: none; stroke: var(--line); stroke-width: 2; stroke-dasharray: 4 5; }
.lbflow__viewer rect { fill: var(--surface-2); stroke: var(--cool); stroke-width: 1.5; }
.lbflow__lb rect { fill: var(--surface-2); stroke: var(--accent); stroke-width: 2; filter: drop-shadow(0 0 6px rgb(255 92 138 / 0.6)); }
.lbflow__srv rect { fill: var(--surface-2); stroke: var(--muted); stroke-width: 1.5; }
.lbflow__srv circle { fill: var(--cool); filter: drop-shadow(0 0 4px var(--cool)); }
.lbflow__pkt rect { fill: var(--accent); }
.lbflow__pkt text { font-size: 12px; font-weight: 700; fill: var(--accent-ink); }
.lbflow__pkt--zero rect { fill: var(--onair); }
</style>
上が、動画を見に来た人。真ん中のピンクの箱がロードバランサー。下に、動画を配るサーバーが3台並んでいる。

見に来た人の「次の場面ちょうだい」というお願いは、全部いったんロードバランサーに届く。ロードバランサーはそれを、A、B、C、A、B、Cと順番に振り分けていく。

つまり、交通整理のおじさんである。

もし1台のサーバーにお願いが全部集まったら、そいつだけ汗だくになって、最後には倒れる。だからおじさんが「はい君はA、君はB」と手旗を振って、3台に同じくらいずつ仕事を配る。倒れているサーバーがいたら、そこには流さない。ロードバランサーがやっているのは、ほぼこれだけだ。

文章で読むと「ふーん」で終わる話が、動くと「あー！」になる。この「あー！」の大きさが、今日いちばんの発見だった。

話はそれるんだけど、子どものころの教科書の図も、全部動いていたらよかったのにと思う。そしたら僕は、もう少し勉強ができた気がする。気がするだけで、たぶん動く図をずっと眺めて授業が終わっていた。

話を戻すと、ひとつ問題がある。

自分で作った図なのに、見ていて飽きない。流れていく「回収0円」を、もう20周くらい見送っている。ロードバランサーは平等なので、0円もちゃんとサーバーCに届けてくれる。届けなくていい。

これからは、わからないことがあったら、とりあえず動かしてみようと思う。家計簿も動かしてみたい。お金がどこへ流れていくのか、一目でわかるはずだ。たぶん、ほとんど競馬に流れている。

**一言感想:** 図は動かすと、急に友達になる。

全然関係ないけど、舌のほうのロードバランサーはまだ見つかっていない。今日も「アニメテット」と言った。
