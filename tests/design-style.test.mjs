/* ============================================================
   tests/design-style.test.mjs ― デザインの基調(白・薄い水色・薄いピンクの落ち着いた見た目)の静的な検査
   ------------------------------------------------------------
   対象:css/style.css と index.html。アプリは動かさず、ファイルの文字列だけを調べる。
   仕様:
     ・フォントは角ゴシック(ヒラギノ角ゴ・游ゴシック Medium・メイリオ)。外部フォントは読み込まない。本文は16px(--fs-add を足す)、行間は1.7〜1.8。
       はじめましてページは行間1.9。本文の太さは400〜500、見出しは700(800・900は使わない)。
     ・角の丸みは小さい(カード・ボタン・入力欄・モーダルは6〜8px)。999px は、区分のタブ(.seg-btn)と小さなラベル(件数・公開先・受け取った情報)だけ。
     ・影はなし、またはごく薄い1種類。グラデーション・すりガラス(backdrop-filter)・動き(animation・keyframes・浮き上がり・回転)は使わない。
       transition は色や枠の変化だけで0.15秒以下。のぞき見を防ぐぼかし(body.peek-guard)は、セキュリティの機能なので残す。
     ・index.html の CSP は変えない。外部のフォント・画像・スクリプト・通信を足さない。インラインの script・イベント属性を足さない。
       theme-color は白。
   ※配色(コントラスト)の検査は hints-wording.test.mjs、絵文字の検査は no-emoji.test.mjs。
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, section, readIndexHtml, readAppSource, ROOT } from "./harness.mjs";

const css = readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
const html = readIndexHtml();
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
// 最も内側の { } を1つのルールとして読む(@media の中のルールも、条件なしで読める)。値は !important を除く
const RULES = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].trim().split(",").map((s) => s.trim()),
  decls: Object.fromEntries(m[2].split(";").map((d) => { const i = d.indexOf(":"); return i > 0 ? [d.slice(0, i).trim(), d.slice(i + 1).replace(/!important\s*$/, "").trim()] : null; }).filter(Boolean)),
}));
const valuesOf = (prop) => RULES.filter((r) => r.decls[prop] !== undefined).map((r) => ({ selectors: r.selectors.join(","), value: r.decls[prop] }));
// セレクタを含む最初のルール(「.a,.b{…}」のように並べたルールも含む)の、プロパティの値
const firstDecl = (selector, prop) => RULES.find((r) => r.selectors.includes(selector) && r.decls[prop] !== undefined)?.decls[prop] ?? null;

section("フォント・文字の太さ・行間");

test("フォントは角ゴシック(ヒラギノ角ゴ・游ゴシック Medium・メイリオ)。外部フォントは読み込まない。本文は16px(--fs-add を足す)、行間は1.7〜1.8", async () => {
  assert.strictEqual(firstDecl(":root", "--font"), '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic Medium","Yu Gothic","YuGothic",Meiryo,sans-serif');
  assert.strictEqual(firstDecl("body", "font-family"), "var(--font)");
  assert.strictEqual(firstDecl("body", "font-size"), "calc(16px + var(--fs-add))");
  const lh = parseFloat(firstDecl("body", "line-height"));
  assert.ok(lh >= 1.7 && lh <= 1.8, `本文の行間 ${lh}`);
  assert.ok(parseFloat(firstDecl(".sp", "line-height")) === 1.9);   // はじめましてページは、文書のように読みやすく
  assert.ok(!/@font-face|@import|googleapis|gstatic|url\(/i.test(css));   // 外部フォント・外部の読み込みなし
  assert.ok(!/serif|"Hiragino Maru|Rounded|丸ゴ/i.test(firstDecl(":root", "--font").replace(/sans-serif/g, "")));   // 丸ゴシック・明朝ではない
});

test("文字の太さは 400・500・700 だけ(800・900 を使わない。インラインの font-weight もない)。本文は 400〜500、見出しは 700", async () => {
  for (const { selectors, value } of valuesOf("font-weight")) assert.ok(["400", "500", "700"].includes(value), `${selectors}:${value}`);
  assert.ok(!/font-weight\s*:\s*(?:8|9)00/.test(readAppSource()));
  assert.ok(["400", "500"].includes(firstDecl("body", "font-weight")));
  for (const selector of [".list-title", ".hero-name", ".d-title", ".sp-title", ".tile-title", ".modal h2", ".em-name", ".team-name"]) assert.strictEqual(firstDecl(selector, "font-weight"), "700", selector);
});

section("角の丸み・影・グラデーション・すりガラス・動き");

test("角の丸みは小さい:トークンは6〜8px。999px は、区分のタブ(.seg-btn)と小さなラベル(.tile-badge・.aud-chip・.team-badge)だけ。ほかに8pxを超える丸みはない(アバターの丸は 50%)", async () => {
  assert.deepStrictEqual([firstDecl(":root", "--radius-s"), firstDecl(":root", "--radius-m"), firstDecl(":root", "--radius-l")], ["6px", "8px", "8px"]);
  const pills = new Set();
  for (const { selectors, value } of valuesOf("border-radius")) {
    for (const part of value.split(/\s+/)) {
      if (part === "999px") selectors.split(",").forEach((s) => pills.add(s));
      else if (/^\d+(?:\.\d+)?px$/.test(part)) assert.ok(parseFloat(part) <= 8, `${selectors}:${value}`);
      else assert.ok(part === "0" || part === "50%" || /^var\(--radius-[sml]\)$/.test(part), `${selectors}:${value}`);
    }
  }
  assert.deepStrictEqual([...pills].sort(), [".aud-chip", ".seg-btn", ".team-badge", ".tile-badge"]);
  for (const selector of [".big-btn", ".tool-btn", ".input", ".textarea", ".modal", ".tile", ".photo-btn", ".lock-card", ".em-person", ".hero", ".add-card"]) assert.match(firstDecl(selector, "border-radius") ?? "", /^var\(--radius-[sml]\)$/, selector);
});

test("影はなし、またはごく薄い1種類(--shadow-1)。グラデーション・すりガラス(backdrop-filter)・文字の影・アイコンの影は使わない", async () => {
  assert.strictEqual(firstDecl(":root", "--shadow-1"), "0 1px 2px rgba(0,0,0,.05)");
  for (const { selectors, value } of valuesOf("box-shadow")) assert.ok(value === "none" || value === "var(--shadow-1)", `${selectors}:${value}`);
  assert.ok(!/gradient\(/i.test(css) && !/backdrop-filter/i.test(css) && !/text-shadow|drop-shadow/i.test(css));
  assert.ok(!/color-mix\(/.test(css));   // 色の混ぜ合わせ(トピックの色から面を作る仕組み)も使わない。色は決めた値だけ
});

test("動きがない:animation・@keyframes・浮き上がり(translateY)・拡大・回転・スムーズスクロールを使わない。transition は色や枠の変化だけ(0.15秒以下)", async () => {
  assert.ok(!/animation|@keyframes/i.test(css) && !/translateY|scale\(|rotate\(|translate3d/i.test(css));
  assert.ok(!/scroll-behavior\s*:\s*smooth/i.test(css));
  const transitions = valuesOf("transition");
  assert.ok(transitions.length > 0);
  for (const { selectors, value } of transitions) {
    if (value === "none") continue;   // 動きを減らす設定では、transition もなくす
    for (const part of value.split(",")) {
      const m = part.trim().match(/^(\S+)\s+([\d.]+)s$/);
      assert.ok(m && ["background-color", "border-color", "color"].includes(m[1]) && parseFloat(m[2]) <= 0.15, `${selectors}:${part}`);
    }
  }
  assert.ok(/@media \(prefers-reduced-motion: reduce\)/.test(css));   // 動きを減らす設定の指定は残す
  assert.ok(/body\.peek-guard #app\{filter:blur\(\d+px\)\}/.test(css));   // のぞき見を防ぐぼかしは残す(セキュリティの機能)
  assert.ok(!css.includes("spinner"));   // 読み込み中は「読み込み中…」の文字だけ(回る絵は付けない)
});

test("ボタン:主な操作は --primary の塗りに白い文字、2番目は白地に --line-strong の枠と --primary の文字、削除は白地に --red の枠と文字。赤の塗りのボタンはない(緊急のトピックでも、書きこむ・保存するは主な操作の色)", async () => {
  assert.deepStrictEqual([firstDecl(".btn-primary", "background"), firstDecl(".btn-primary", "color")], ["var(--primary)", "#FFFFFF"]);
  assert.deepStrictEqual([firstDecl(".btn-secondary", "background"), firstDecl(".btn-secondary", "border-color"), firstDecl(".btn-secondary", "color")], ["var(--card)", "var(--line-strong)", "var(--primary)"]);
  assert.deepStrictEqual([firstDecl(".btn-danger", "background"), firstDecl(".btn-danger", "border-color"), firstDecl(".btn-danger", "color")], ["var(--card)", "var(--red)", "var(--red)"]);
  assert.ok(!/\.btn-urgent\b/.test(bare) && !readAppSource().includes("btn-urgent"), "赤の塗りのボタン(.btn-urgent)は使わない。赤は、緊急の表示と削除だけ");
  assert.ok(!RULES.some((r) => r.decls.background === "var(--red)" || r.decls["background-color"] === "var(--red)"), "赤の塗りの部品はない");
  assert.ok(parseFloat(firstDecl(".big-btn", "min-height")) >= 44);
});

test("トピックのタイルは、幅が狭いときは1列、広いときは2列(線のアイコン・タイトル・件数)。緊急のタイルだけ、赤い線(左に太い線)と文字", async () => {
  assert.strictEqual(firstDecl(".grid", "grid-template-columns"), "1fr");
  assert.ok(/@media\(min-width:560px\)\{\s*\.grid\{grid-template-columns:1fr 1fr\}\s*\}/.test(bare));
  assert.strictEqual(firstDecl(".tile.urgent", "border-left"), "4px solid var(--red)");
  assert.strictEqual(firstDecl(".tile.urgent .tile-icon", "color"), "var(--red)");
  assert.ok(!valuesOf("border-left").some(({ selectors, value }) => /--red/.test(value) && !/urgent|em-person|em-empty|home-emergency|sp-care|\.d-head|btn|banner|danger|lock|tile-tool|photo/.test(selectors)), "赤い左線は、緊急・警告の所だけ");
  assert.strictEqual(firstDecl(".tile", "border"), "1px solid var(--line)");   // 通常のタイルは中立の線
  assert.strictEqual(firstDecl(".tile-icon", "color"), "var(--primary)");
});

test("はじめましてページ:文書のように読みやすい(本文17px以上・行間1.9・見出しと線)。固定の案内は薄いピンクの面と左の線", async () => {
  assert.match(firstDecl(".sp-note", "font-size"), /^calc\(1[6-9]px \+ var\(--fs-add\)\)$/);
  assert.match(firstDecl(".sp .entry-value", "font-size"), /^calc\(1[6-9]px \+ var\(--fs-add\)\)$/);
  assert.strictEqual(firstDecl(".sp .entry-value", "line-height"), "1.9");
  assert.strictEqual(firstDecl(".sp-topic-head", "border-bottom"), "2px solid var(--primary)");
  assert.strictEqual(firstDecl(".sp-care", "background"), "var(--pink-wash)");
  assert.match(firstDecl(".sp-care", "border-left"), /^4px solid /);
});

section("index.html(CSP・外部の読み込み・theme-color・ファビコン)");

test("index.html の CSP は変えない。外部のフォント・画像・スクリプト・通信を足さず、インラインの script やイベント属性もない", async () => {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1];
  assert.strictEqual(csp, "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const url of urls) assert.ok(url.startsWith("js/") || url.startsWith("css/") || url.startsWith("data:image/svg+xml,"), url);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html));   // インラインの script はない(すべて src)
  assert.ok(!/\son[a-z]+\s*=/i.test(html) && !/\son(click|error|load|change|input|submit|keydown)\s*=\s*["'`]/i.test(readAppSource()));
  assert.ok(!/https?:\/\//.test(html.replace(/xmlns=%22http:\/\/www\.w3\.org\/2000\/svg%22/, "")));   // ファビコンの SVG の名前空間以外に、URL はない
});

test("theme-color は白(#FFFFFF)。ダーク用の色(#1E1C19)はない。ファビコンは、角の丸い四角の中に横線2本の SVG(色 #2F6E96)", async () => {
  const metas = [...html.matchAll(/<meta name="theme-color" content="([^"]*)"[^>]*>/g)].map((m) => m[1]);
  assert.ok(metas.length >= 1 && metas.every((c) => c.toUpperCase() === "#FFFFFF"), metas.join(","));
  assert.ok(!/1E1C19/i.test(html));
  const icon = decodeURIComponent(html.match(/<link rel="icon" href="([^"]*)"/)[1].replace("data:image/svg+xml,", ""));
  assert.ok(/<rect [^>]*rx="\d+"/.test(icon) && /fill="#2F6E96"/.test(icon) && (icon.match(/M\d+ \d+h\d+/g) ?? []).length === 2);   // 角の丸い四角と、横線2本(M9 12h14・M9 20h14)
});
