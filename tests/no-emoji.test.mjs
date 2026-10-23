/* ============================================================
   tests/no-emoji.test.mjs ― 画面の部品に絵文字がない・アイコンは線の SVG
   ------------------------------------------------------------
   対象:js/views.js の各画面・各モーダル・印刷、js/icons.js(icon・topicIcon)、js/actions.js(飾りの選択欄の操作の削除と、保存データの値の引き継ぎ)、
        index.html、css/style.css。
   仕様:
     ・画面の部品(ボタン・見出し・帯・注記・トースト・読み込み中・ファビコン・印刷の見出し・空の状態の案内)に、絵文字を使わない。
       保存データの emoji・color・icon の値は、消さず書きかえず残すが、表示には使わない。利用者が入力した内容(名前・メモなど)は対象外。
     ・アイコンは icon()・topicIcon() を通した線の <svg>。すべて aria-hidden="true"。アイコンだけのボタンには aria-label。
     ・名前が HTML のような人でも、アバターの1文字は esc() されて、HTML にならない。
     ・画面の文字に感嘆符(！・!)を使わない。
   ※このテストのデータの名前やメモには、絵文字を入れない(利用者の入力は対象外だが、画面全体を調べるため)。
     保存データの emoji・icon には、絵文字が入っている(表示に出ないことを確かめるため。harness.mjs の makeFullTeam が作る)。
   絵文字の判定:/\p{Extended_Pictographic}/u。加えて ℹ(U+2139)・✓(U+2713)・♪(U+266A)・★(U+2605)も対象にする(↑↓›○← などは絵文字ではない)。
   ※前のテストの結果(集めた画面)を後のテストが使うため、順番を変えない。テストは登録した順に実行される。
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createApp, test, section, plain, sameData, listView, personView, detailView, makeFullTeam, readAppSource, readIndexHtml, ROOT } from "./harness.mjs";

const env = createApp();
const { run, get, app, print, startSession, makeShare, importShare, context } = env;
context.window.print = () => {};

const EMOJI = /\p{Extended_Pictographic}|[ℹ✓♪★]/u;
const defs = plain(get("DEFAULT_TOPICS"));
const PASS = "no-emoji-pass";
const textOf = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, " ");   // 画面に見える文字(タグとアイコンを除く)
const attrTextOf = (html) => [...html.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"]*)"/g)].map((m) => m[1]).join(" ");
const emojiIn = (text) => (text.match(EMOJI) ?? [null])[0];
const buttonsOf = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], inner: m[2], text: textOf(m[2]).trim() }));

// 画面のHTMLを集める。[名前, HTML]
const SCREENS = [];
const snap = (name, html = app.innerHTML) => SCREENS.push([name, html]);
const ownTeam = (id) => makeFullTeam(defs, id);
const toHome = () => run(`stage="home"; ${listView(null)}; modal=null; modalDraft=null; render()`);
const toList = (id) => run(`stage="ready"; ${listView(id)}; modal=null; modalDraft=null; render()`);
const toPerson = (id, personId, audience = "all") => run(`stage="ready"; ${personView(id, personId, audience)}; modal=null; modalDraft=null; render()`);
const toDetail = (id, personId, topicId, audience = "all") => run(`stage="ready"; ${detailView(id, personId, topicId, audience)}; modal=null; modalDraft=null; render()`);
const closeModal = () => get(`handle("close-modal",{})`);

section("画面の部品に絵文字がない(主な画面・各モーダル・印刷)");

test("(準備)主な画面・各モーダル・印刷を描画して集める(自分のチーム2つ・受け取ったチーム3つ・ロック・初期設定)", async () => {
  await startSession(PASS, [ownTeam("team_e"), ownTeam("team_f")], null);
  // ホームと、ホームから開く緊急時の情報(すべてのチーム)
  toHome(); snap("ホーム");
  await get(`handle("open-emergency-all",{})`); snap("緊急時の情報(すべてのチーム)");
  // チームの画面と、緊急時の情報(全員分)
  toList("team_e"); snap("チーム");
  await get(`handle("open-emergency",{})`); snap("緊急時の情報(全員分)");
  // 人物ページ:すべて・運営向け・学生向け(はじめましてページ)・整理モード
  toPerson("team_e", "p_hana", "all"); snap("人物(すべて)");
  toPerson("team_e", "p_sora", "all"); snap("人物(すべて・何も書いていない)");
  toPerson("team_e", "p_hana", "staff"); snap("人物(運営向け)");
  toPerson("team_e", "p_hana", "student"); snap("人物(学生向け)");
  toPerson("team_e", "p_sora", "student"); snap("人物(学生向け・公開された情報なし)");
  toPerson("team_e", "p_hana", "all"); run(`view.organize=true; render()`); snap("人物(整理モード)"); run(`view.organize=false; render()`);
  // トピックの詳細:通常・緊急・何も書いていない・編集
  toDetail("team_e", "p_hana", "communication"); snap("詳細");
  toDetail("team_e", "p_hana", "emergency"); snap("詳細(緊急)");
  toDetail("team_e", "p_sora", "likes"); snap("詳細(何も書いていない)");
  toDetail("team_e", "p_hana", "communication"); await get(`handle("start-edit",{})`); snap("詳細(編集)");
  toDetail("team_e", "p_hana", "emergency"); await get(`handle("start-edit",{})`); snap("詳細(緊急・編集)");
  // モーダル
  toList("team_e"); await get(`handle("add-person",{})`); snap("モーダル:新しいカード"); await closeModal();
  toPerson("team_e", "p_hana", "all"); await get(`handle("edit-person",{})`); snap("モーダル:カードの編集"); await closeModal();
  toHome(); await get(`handle("open-team-create",{})`); snap("モーダル:新しいチーム"); await closeModal();
  toList("team_e"); await get(`handle("edit-team",{})`); snap("モーダル:チームの編集"); await closeModal();
  toPerson("team_e", "p_hana", "all"); await get(`handle("open-copyto",{})`); snap("モーダル:他のチームへコピー"); await closeModal();
  toPerson("team_e", "p_hana", "all"); await get(`handle("add-topic",{})`); snap("モーダル:新しいトピック"); await closeModal();
  toHome(); await get(`handle("settings",{})`); snap("モーダル:設定"); await get(`handle("open-passchange",{})`); snap("モーダル:パスコードの変更"); await closeModal();
  toHome(); await get(`handle("open-about",{})`); snap("モーダル:このアプリについて"); await closeModal();
  run(`localStorage.setItem("support-card-data-v2", "{}")`); toHome(); await get(`handle("settings",{})`); snap("モーダル:設定(旧データあり)"); await closeModal();
  run(`localStorage.removeItem("support-card-data-v2")`);
  toList("team_e"); await get(`handle("share-team",{})`); snap("共有前の確認");
  env.promptAnswer = PASS; await get(`handle("share-proceed",{})`);
  assert.strictEqual(get("modal"), "share-ready");
  snap("共有ファイルの準備"); await get(`handle("close-share-ready",{})`);
  run(`stage="home"; pendingPicker={type:"photo",file:{},target:{},expiresAt:Date.now()+60000}; modal="resume-picker"; render()`); snap("モーダル:選んだファイルの保留");
  run(`pendingPicker=null; modal=null; modalDraft=null`);
  // 印刷:すべて・学生向け・運営向け
  for (const audience of ["all", "student", "staff"]) {
    toPerson("team_e", "p_hana", audience); await get(`handle("print",{})`); snap(`印刷(${audience})`, print.innerHTML);
  }
  // 受け取ったチーム:学生向け・運営向け・すべて
  for (const audience of ["student", "staff", "all"]) {
    const file = await makeShare(PASS, { team: ownTeam(`team_src_${audience}`), meta: { audience, createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
    assert.strictEqual(await importShare(file, PASS), 1);
    snap(`受け取ったチーム(${audience})・一覧`);
    await get(`handle("open-person",{id:"p_hana"})`); snap(`受け取ったチーム(${audience})・人物`);
    await get(`handle("print",{})`); snap(`受け取ったチーム(${audience})・印刷`, print.innerHTML);
    await get(`handle("back-list",{})`);
    if (audience !== "student") { await get(`handle("open-emergency",{})`); snap(`受け取ったチーム(${audience})・緊急時の情報`); await get(`handle("back-list",{})`); }
  }
  toHome(); snap("ホーム(受け取ったチームあり)");
  await get(`handle("open-emergency-all",{})`); snap("緊急時の情報(すべてのチーム・受け取ったチームあり)");
  // ロック・初期設定・読み込み中
  const fresh = createApp();
  fresh.run(`stage="locked"; render()`); snap("ロック", fresh.app.innerHTML);
  fresh.run(`stage="setup-pass"; render()`); snap("初期設定", fresh.app.innerHTML);
  fresh.run(`stage="boot"; render()`); snap("読み込み中", fresh.app.innerHTML);
  assert.ok(SCREENS.length >= 45 && SCREENS.every(([, html]) => html.length > 50), `集めた画面:${SCREENS.length}`);
});

test("(準備の確認)集めた画面に、主な部品が揃っている(絵文字の確かめが空振りでない)。保存データには絵文字が入っている", async () => {
  const all = SCREENS.map(([, html]) => html).join("\n");
  for (const marker of ['class="home-emergency"', 'class="team-card"', 'class="tool-btn em-btn"', 'class="person-card"', 'class="tile ', 'class="tile organize-tile', 'class="sp-hero"', 'class="em-person"', 'class="em-team"',
    'class="d-head', 'class="entry"', 'class="overlay"', 'class="avatar"', 'class="pr-topic"', 'class="lock-card"', 'class="loading"', 'id="share-ready-title"', 'id="share-preflight-title"', 'class="sp-care"', 'class="notice received-banner"']) {
    assert.ok(all.includes(marker), marker);
  }
  // 保存データ(harness の makeFullTeam)の emoji・icon には、絵文字が入っている。画面には出ない
  const t = plain(get("teams[0]"));
  assert.ok(EMOJI.test(t.emoji) && EMOJI.test(t.people[0].emoji) && t.people[0].topicDefs.every((d) => EMOJI.test(d.icon)));
});

test("どの画面・モーダル・印刷にも、絵文字がない(保存データの emoji・icon があっても、表示に出ない)", async () => {
  for (const [name, html] of SCREENS) {
    const found = emojiIn(html);
    assert.strictEqual(found, null, `${name}:絵文字 ${found} がある`);
  }
});

test("画面の文字(見出し・ボタン・案内・placeholder・aria-label)に、感嘆符(！・!)がない。js/*.js の文章にもない", async () => {
  for (const [name, html] of SCREENS) {
    const text = textOf(html) + " " + attrTextOf(html);
    assert.ok(!/[!！]/.test(text), `${name}:${(text.match(/.{0,12}[!！].{0,12}/) ?? [""])[0]}`);
  }
  const src = readAppSource();
  assert.ok(!src.includes("！"));
  assert.ok(!/[぀-ヿ一-鿿]\s*!|![\s]*[぀-ヿ一-鿿]/.test(src));   // 日本語の文のそばの「!」もない
});

section("index.html・css・js/icons.js に絵文字がない。js の絵文字は保存データの既定値だけ");

test("index.html(ファビコン・トースト・読み込み中)と css/style.css と js/icons.js に、絵文字がない。ファビコンは絵文字の text ではなく SVG の図形", async () => {
  const html = readIndexHtml(), css = readFileSync(path.join(ROOT, "css", "style.css"), "utf8"), icons = readFileSync(path.join(ROOT, "js", "icons.js"), "utf8");
  for (const [name, text] of [["index.html", html], ["css/style.css", css], ["js/icons.js", icons]]) assert.strictEqual(emojiIn(text), null, `${name}:絵文字 ${emojiIn(text)} がある`);
  const favicon = html.match(/<link rel="icon" href="([^"]*)"/)?.[1] ?? "";
  assert.ok(favicon.startsWith("data:image/svg+xml,") && favicon.includes("<rect") && favicon.includes("<path") && !favicon.includes("<text"), favicon);
  assert.ok(favicon.includes("%232F6E96"));   // 色 #2F6E96
  assert.ok(html.includes('<div id="toast" class="toast" role="status">保存しました</div>'));
  assert.ok(html.includes('<div class="loading">読み込み中…</div>'));
});

test("js/*.js で絵文字が出てくる行は、保存データの emoji・icon の既定値(DEFAULT_TOPICS・SAMPLE_TEAM・正規化・取り込み・新規作成の下書き)だけ。views.js・icons.js・util.js・main.js にはない", async () => {
  const dir = path.join(ROOT, "js");
  const lines = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).forEach((line, i) => { if (EMOJI.test(line)) lines.push({ file: f, line: i + 1, text: line }); });
  }
  const allowed = lines.filter((l) => /\b(?:emoji|icon)\s*:/.test(l.text));
  assert.deepStrictEqual(lines.filter((l) => !allowed.includes(l)).map((l) => `${l.file}:${l.line}:${l.text.trim().slice(0, 60)}`), []);
  assert.deepStrictEqual([...new Set(lines.map((l) => l.file))].sort(), ["actions.js", "constants.js", "data.js", "state.js"]);
});

section("アイコンは icon()・topicIcon() を通した線の SVG(aria-hidden。アイコンだけのボタンには aria-label)");

test("画面の <svg> はすべて class=icon・aria-hidden=true・focusable=false。views.js などに SVG を直接書かない(icons.js だけ)", async () => {
  let count = 0;
  for (const [name, html] of SCREENS) {
    for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
      count++;
      assert.ok(m[0].includes('class="icon"') && m[0].includes('aria-hidden="true"') && m[0].includes('focusable="false"') && m[0].includes('stroke="currentColor"') && m[0].includes('fill="none"'), `${name}:${m[0]}`);
    }
  }
  assert.ok(count >= 100, `アイコンの数:${count}`);
  const dir = path.join(ROOT, "js");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "icons.js")) assert.ok(!/<svg\b/.test(readFileSync(path.join(dir, f), "utf8")), `js/${f} に SVG が直接書かれている`);
  assert.ok(!/<svg\b|<img\b/.test(readFileSync(path.join(ROOT, "css", "style.css"), "utf8")));
});

test("アイコンだけのボタン(文字がないボタン)には aria-label がある。文字のあるボタンの <svg> は装飾", async () => {
  let iconOnly = 0;
  for (const [name, html] of SCREENS) {
    for (const b of buttonsOf(html)) {
      if (b.text === "") { iconOnly++; assert.ok(/aria-label="[^"]+"/.test(b.attrs), `${name}:aria-label がないボタン ${b.attrs}`); }
    }
  }
  assert.ok(iconOnly >= 8, `アイコンだけのボタンの数:${iconOnly}`);   // 整理モードの 並べ替え・上へ・下へ・削除
  const organize = SCREENS.find(([name]) => name === "人物(整理モード)")[1];
  for (const label of ["上へ", "下へ", "削除"]) assert.ok(organize.includes(`aria-label="${label}"`), label);
  assert.ok(/aria-label="[^"]*をドラッグして並べ替え"/.test(organize));
});

test("icon():未知の名前・特殊な名前は空文字。大きさは数値だけ(文字を渡しても HTML にならない)。色は currentColor", async () => {
  const icon = get("icon");
  for (const bad of ["", "nope", "constructor", "__proto__", "toString", "hasOwnProperty", undefined, null, 5, {}, []]) assert.strictEqual(icon(bad), "", String(bad));
  assert.strictEqual(icon("alert"), '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + plain(get("ICON_PATHS")).alert + "</svg>");
  assert.ok(icon("plus", 36).includes('width="36" height="36"'));
  for (const size of ['"><script>alert(1)</script>', "<b>", NaN, -4, 0, "abc"]) { const html = icon("lock", size); assert.ok(html.includes('width="20" height="20"') && !html.includes("<script") && !html.includes("<b>"), String(size)); }
});

test("ICON_PATHS:使うアイコンだけ(views.js の icon(\"…\") と topicIcon の対応先)。自作の単純な図形だけで、スクリプトやイベント属性・外部参照を含まない", async () => {
  const paths = plain(get("ICON_PATHS"));
  const used = new Set([...readFileSync(path.join(ROOT, "js", "views.js"), "utf8").matchAll(/\bicon\("([a-z]+)"/g)].map((m) => m[1]));
  for (const name of Object.values(plain(get("TOPIC_ICON_NAMES")))) used.add(name);
  used.add("note");
  assert.deepStrictEqual(Object.keys(paths).sort(), [...used].sort());   // 使わないアイコンは作らない・使うアイコンは作ってある
  for (const [name, inner] of Object.entries(paths)) {
    const tags = [...inner.matchAll(/<([a-zA-Z]+)\b/g)].map((m) => m[1]);
    assert.ok(tags.length > 0 && tags.every((tag) => ["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"].includes(tag)), name);
    assert.ok(!/on[a-z]+\s*=|href|script|style=|url\(|<image|<use|<text/i.test(inner), name);
  }
});

test("topicIcon():既定のトピックは id ごとの線のアイコン。自作のトピック・知らない id・特殊な id は共通の note。保存データの icon(絵文字)は使わない", async () => {
  const icon = get("icon"), topicIcon = get("topicIcon");
  const expected = { emergency: "alert", basic: "person", communication: "chat", activity: "activity", meal: "meal", care: "care", posture: "move", likes: "like", dislikes: "dislike" };
  assert.deepStrictEqual(defs.map((d) => d.id).sort(), Object.keys(expected).sort());
  for (const d of defs) assert.strictEqual(topicIcon(d), icon(expected[d.id], 24), d.id);   // d.icon は絵文字だが、使われない
  assert.strictEqual(new Set(defs.map((d) => topicIcon(d))).size, defs.length);   // 既定のトピックは、それぞれ違うアイコン
  for (const def of [{ id: "abc1234", icon: "x" }, { id: "constructor" }, { id: "__proto__" }, { id: "toString" }, { id: 5 }, {}, null, undefined, "likes"]) assert.strictEqual(topicIcon(def), icon("note", 24), JSON.stringify(def));
  assert.strictEqual(topicIcon({ id: "likes" }, 32), icon("like", 32));
  // 画面のタイルには、保存データの icon ではなく topicIcon が出る
  const tile = SCREENS.find(([name]) => name === "人物(すべて)")[1];
  assert.ok(tile.includes(`<span class="tile-icon">${topicIcon({ id: "emergency" })}</span>`) && tile.includes(`<span class="tile-icon">${topicIcon({ id: "mine" })}</span>`));
});

section("アバター:写真がなければ名前の最初の1文字(利用者の入力なので esc() する)。名前が空なら person アイコン");

test("名前の最初の1文字が、薄い水色の丸に出る。大きさは size のまま。保存データの emoji は出ない。写真があるときは従来どおり", async () => {
  const avatarHtml = get("avatarHtml");
  const person = (name, extra = {}) => ({ name, photo: null, emoji: String.fromCodePoint(0x1F338), ...extra });
  assert.strictEqual(avatarHtml(person("はなさん"), 64), '<span class="avatar" aria-hidden="true" style="width:64px;height:64px;font-size:32px">は</span>');
  assert.strictEqual(avatarHtml(person("  山田 花子"), 96), '<span class="avatar" aria-hidden="true" style="width:96px;height:96px;font-size:48px">山</span>');   // 前後の空白は数えない
  assert.strictEqual(avatarHtml(person("Alice"), 52), '<span class="avatar" aria-hidden="true" style="width:52px;height:52px;font-size:26px">A</span>');
  const person2 = get("icon")("person", 18);
  for (const name of ["", "   ", undefined, null]) assert.strictEqual(avatarHtml(person(name), 36), `<span class="avatar" aria-hidden="true" style="width:36px;height:36px;font-size:18px">${person2}</span>`, String(name));
  const photo = 'data:image/jpeg;base64,AAAA';
  assert.strictEqual(avatarHtml(person("はなさん", { photo }), 64), `<span class="avatar photo" style="width:64px;height:64px"><img src="${photo}" alt=""></span>`);
  // 名前の最初が絵文字(利用者の入力)でも、1文字(1つの符号位置)をそのまま出す。壊れた文字にならない
  const dog = String.fromCodePoint(0x1F436);
  assert.ok(avatarHtml(person(dog + "たろう"), 40).includes(`>${dog}</span>`));
});

test("名前が HTML のような人でも、アバターの1文字は esc() されて HTML にならない(画面・モーダル・緊急時の情報・印刷も)", async () => {
  const avatarHtml = get("avatarHtml");
  for (const [name, escaped] of [["<img src=x onerror=alert(1)>", "&lt;"], ['"><script>alert(1)</script>', "&quot;"], ["'onmouseover='alert(1)", "&#39;"], ["&amp;", "&amp;"]]) {
    const html = avatarHtml({ name, photo: null }, 40);
    assert.ok(html.endsWith(`>${escaped}</span>`) && !html.includes("<img") && !html.includes("<script") && !html.includes("onerror="), `${name}:${html}`);
  }
  const evil = "<img src=x onerror=alert(1)>";
  const t = ownTeam("team_evil");
  t.people[0].name = evil;
  await startSession(PASS, [t], "team_evil");
  const check = (label) => { const html = app.innerHTML; assert.ok(!html.includes("<img src=x") && !/<img\b[^>]*onerror/i.test(html) && html.includes("&lt;img src=x onerror=alert(1)&gt;"), label); };   // 名前は文字として出る(&lt;…)。本物の <img> タグにはならない
  toList("team_evil"); check("チームの一覧");
  toPerson("team_evil", "p_hana", "all"); check("人物ページ");
  toPerson("team_evil", "p_hana", "student"); check("はじめましてページ");
  toPerson("team_evil", "p_hana", "all");   // 学生向けの表示では、カードの編集は開かない
  await get(`handle("edit-person",{})`); check("カードの編集"); assert.ok(app.innerHTML.includes('style="width:72px;height:72px;font-size:36px">&lt;</span>')); await closeModal();
  toList("team_evil"); await get(`handle("open-emergency",{})`); check("緊急時の情報(全員分)");
  toHome(); await get(`handle("open-emergency-all",{})`); check("緊急時の情報(すべてのチーム)");
  toPerson("team_evil", "p_hana", "all"); await get(`handle("print",{})`);
  assert.ok(!print.innerHTML.includes("<img src=x") && print.innerHTML.includes("<h1>&lt;img src=x onerror=alert(1)&gt; のサポートカード（すべて）</h1>"));
});

section("飾りの選択欄はない。保存データの emoji・color・icon は、編集して保存しても消えない");

test("マーク・テーマ色・アイコン・色を選ぶ欄と操作(pick-*)、その定数と部品は残っていない。古い操作の名前を渡しても何も起きない", async () => {
  const css = readFileSync(path.join(ROOT, "css", "style.css"), "utf8"), src = readAppSource();
  for (const word of ["pick-emoji", "pick-team-emoji", "pick-team-color", "pick-icon", "pick-color", "emoji-btn", "color-btn", "pick-row", "写真のかわりのマーク"]) assert.ok(!src.includes(word) && !css.includes(word), word);
  for (const name of ["EMOJIS", "TEAM_EMOJIS", "TOPIC_ICONS", "TOPIC_COLORS", "TEAM_COLORS", "grad"]) assert.strictEqual(get(`typeof ${name}`), "undefined", name);
  for (const [name, html] of SCREENS.filter(([n]) => n.startsWith("モーダル") || n.includes("共有"))) {
    for (const label of [">マーク<", ">テーマ色<", ">アイコン<", ">色<", "写真のかわりのマーク"]) assert.ok(!html.includes(label), `${name}:${label}`);
    assert.ok(!html.includes('data-act="pick-') || html.includes('data-act="pick-photo"'), name);   // 写真を選ぶ(pick-photo)は残る
    assert.ok(!/data-act="pick-(?!photo)/.test(html), name);
  }
  await startSession(PASS, [ownTeam("team_e")], null);
  toPerson("team_e", "p_hana", "all");
  const before = JSON.stringify([get("teams"), get("modal"), get("modalDraft"), get("view")]);
  for (const act of ["pick-emoji", "pick-team-emoji", "pick-team-color", "pick-icon", "pick-color"]) await get(`handle(${JSON.stringify(act)},{v:"#E05B4B"})`);
  assert.strictEqual(JSON.stringify([get("teams"), get("modal"), get("modalDraft"), get("view")]), before);
});

// チーム・人物・トピックの見た目の値(emoji・color・icon)だけを取り出す
const looks = (t) => plain({ emoji: t.emoji, color: t.color, people: t.people.map((p) => ({ id: p.id, emoji: p.emoji, defs: p.topicDefs.map((d) => [d.id, d.icon, d.color]) })) });

test("人物・チームの編集、トピックの追加・編集・並べ替え・削除、カードのコピーのあとも、emoji・color・icon の値は変わらない(名前などだけが変わる)", async () => {
  const original = ownTeam("team_e");
  await startSession("keep-pass", [structuredClone(original), ownTeam("team_f")], "team_e");
  const base = looks(original);
  // 人物の編集(名前とひとことだけ)
  toPerson("team_e", "p_hana", "all"); await get(`handle("edit-person",{})`);
  run(`modalDraft.name="あたらしい名前"; modalDraft.note="あたらしいひとこと"`); await get(`handle("save-person",{})`);
  assert.ok(get("teams[0].people[0].name") === "あたらしい名前" && get("teams[0].people[0].note") === "あたらしいひとこと");
  assert.deepStrictEqual(looks(plain(get("teams[0]"))), base);
  // チームの編集(名前だけ)
  toList("team_e"); await get(`handle("edit-team",{})`);
  run(`modalDraft.name="あたらしいチーム"`); await get(`handle("save-team-edit",{})`);
  assert.strictEqual(get("teams[0].name"), "あたらしいチーム");
  assert.deepStrictEqual(looks(plain(get("teams[0]"))), base);
  // 書きこみの保存(トピックの icon・color は変わらない)
  toDetail("team_e", "p_hana", "emergency"); await get(`handle("start-edit",{})`);
  run(`draft=[{label:"あたらしい見出し",value:"あたらしい内容"}]`); await get(`handle("save-edit",{})`);
  assert.strictEqual(get("teams[0].people[0].topics.emergency[0].value"), "あたらしい内容");
  assert.deepStrictEqual(looks(plain(get("teams[0]"))), base);
  // 並べ替え(↑↓)と、トピックの削除
  toPerson("team_e", "p_hana", "all"); await get(`handle("toggle-organize",{})`);
  await get(`handle("move-down",{id:"emergency"})`); await get(`handle("move-up",{id:"emergency"})`);
  assert.deepStrictEqual(looks(plain(get("teams[0]"))), base);
  env.confirmAnswer = true;
  await get(`handle("del-topic",{id:"mine"})`);
  const afterDelete = looks(plain(get("teams[0]")));
  assert.deepStrictEqual(afterDelete.people[0].defs, base.people[0].defs.filter(([id]) => id !== "mine"));   // 消えたのは「mine」だけ。ほかの icon・color はそのまま
  await get(`handle("toggle-organize",{})`);
  // トピックの追加:選ぶ欄がないので、新しいトピックには既定の icon・color が入る(データの形を保つため)
  await get(`handle("add-topic",{})`); run(`modalDraft.title="睡眠"`); await get(`handle("save-topic",{})`);
  const added = plain(get("teams[0].people[0].topicDefs.at(-1)"));
  assert.ok(added.title === "睡眠" && added.icon === String.fromCodePoint(0x1F4CC) && added.color === "#5B8DB8" && added.desc === "");
  // カードのコピー(別のチームへ)
  await get(`handle("open-copyto",{})`); await get(`handle("copy-card",{id:"team_f"})`);
  const copied = plain(get("teams[1].people.at(-1)"));
  assert.ok(copied.emoji === original.people[0].emoji && copied.topicDefs.every((d) => d.icon !== undefined && d.color !== undefined));
});

test("新しく作るチーム・カードには、既定の emoji・color が入る(選ぶ欄はない)。保存して、ロックして解錠し直しても、値は残る", async () => {
  await startSession("keep-pass2", [ownTeam("team_e")], null);
  toHome(); await get(`handle("open-team-create",{})`);
  run(`modalDraft.name="あたらしいチーム"`); await get(`handle("create-team",{})`);
  const created = plain(get("teams.at(-1)"));
  assert.ok(created.name === "あたらしいチーム" && created.emoji === String.fromCodePoint(0x1F3E0) && created.color === "#3D7399");
  await get(`handle("add-person",{})`); run(`modalDraft.name="あたらしい人"`); await get(`handle("save-person",{})`);
  const person = plain(get("teams.at(-1).people.at(-1)"));
  assert.ok(person.emoji === String.fromCodePoint(0x1F338) && person.name === "あたらしい人" && person.topicDefs.length === defs.length);
  assert.deepStrictEqual(person.topicDefs.map((d) => [d.id, d.icon, d.color]), defs.map((d) => [d.id, d.icon, d.color]));   // 既定のトピックの icon・color のまま
  const before = plain(get("teams"));
  await get("save()"); await get("lockNow()"); await get(`unlock("keep-pass2")`);
  assert.strictEqual(get("stage"), "home");
  assert.ok(sameData(get("teams"), before));   // 暗号化して保存した値を読み戻しても、emoji・color・icon を含めて同じ
});

test("共有ファイルの書き出しと取り込みでも、emoji・color・icon の値は残る(書き出し=チーム全体、取り込み=検証したうえで同じ値)", async () => {
  const t = ownTeam("team_e");
  await startSession("keep-pass3", [t], "team_e");
  const file = await env.exportShare("team_e", PASS, "all");
  assert.ok(file);
  const inner = plain(await get("decryptShared")(file, PASS));
  assert.deepStrictEqual(looks(inner.team), looks(t));
  assert.strictEqual(await importShare(file, PASS), 1);
  assert.deepStrictEqual(looks(plain(get("teams.at(-1)"))), looks(t));
});
