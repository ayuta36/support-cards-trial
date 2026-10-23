/* ============================================================
   tests/hints-wording.test.mjs ― 記入例と、文言・サンプル・見やすさ・使いやすさ
   ------------------------------------------------------------
   対象:js/constants.js の TOPIC_HINTS・SAMPLE_TEAM・APP_VERSION、js/data.js の topicHint、
        js/views.js のタイル(説明・「未記入」バッジ)・詳細画面(記入例)・モーダルの文言、js/state.js の setupNew(サンプル)、
        css/style.css(項目見出しの色・タイル名の折り返し・タップ領域・文字サイズの設定)。
   仕様:
     記入例:編集モードの入力欄の上に「記入例: …」。未記入のトピックの詳細画面(家族が見るとき)にも出す。
        タイルの説明(desc)は未記入でも出し、未記入であることは「未記入」バッジで示す(「まだ未記入」は廃止)。
     文言:UI の文字列に「この子」「その子」「お子さん」を使わない(年齢を問わない表現)。
        新しくインストールしたときのサンプルは、20代の架空の人物「はなさん」(チーム「サンプル（架空の人物）」。生年月日と電話番号は入れない)。
        項目見出しの色は主な操作の色(--primary)。トピックの色(--topic-color)は使わない。緊急のトピックの中だけ、赤い線(左に太い線)と文字で区別する。
        配色は白を基調にした4つのテーマ(milk・sakura・sora・wakaba)。OS のダーク設定では変えない。実際に効く色(後ろのルールが前のルールを上書きした結果)で、
        文字は4.5:1以上、入力欄・枠だけのボタンの枠は3:1以上(静的に計算する)。主な操作の白い文字・緊急の赤い文字・入力欄の枠・ピンクの文字を、4つのテーマすべてで確かめる。
        タイル名は line-break:strict。タップ領域は高さ44px以上(.tile-tool は幅も44px)。文字サイズ(大きめ・特大)が各部品に効く。
        APP_VERSION は "1.1.0-trial"。
   ※一部のテストは、前のテストの状態を引き継いで進む。テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp, test, section, plain, sameData, listView, personView, detailView, makeFullTeam, readAppSource, readIndexHtml, ROOT } from "./harness.mjs";

const env = createApp();
const { run, get, app, body, localStorage, startSession } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const HINTS = plain(get("TOPIC_HINTS"));
const css = readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
const toDetail = (topicId, audience = "all") => run(`stage="ready"; ${detailView("team_h", "p_hana", topicId, audience)}; modal=null; modalDraft=null; render()`);
const toPerson = (personId = "p_hana", audience = "all") => run(`stage="ready"; ${personView("team_h", personId, audience)}; modal=null; modalDraft=null; render()`);
const hintLine = (id) => `<p class="topic-hint">記入例: ${HINTS[id]}</p>`;

section("記入例(TOPIC_HINTS)");

test("TOPIC_HINTS は、既定のトピックすべてにある。仕様の記入例(communication・emergency・activity は修正後の文)と同じ", async () => {
  assert.deepStrictEqual(Object.keys(HINTS).sort(), defs.map((d) => d.id).sort());
  assert.ok(Object.values(HINTS).every((h) => typeof h === "string" && h.length > 0));
  assert.strictEqual(HINTS.communication, "視線・手の動き・表情など、気持ちが伝わるサイン／「はい・いいえ」の伝え方／話しかけるときのコツ（位置・声の大きさ・返事を待つ時間）");
  assert.strictEqual(HINTS.emergency, "発作などのサイン／まずしてほしいこと（付き添いの方に伝える など）／救急車を呼ぶ目安／緊急連絡先");
  assert.strictEqual(HINTS.activity, "参加のしかた（見る・さわる・手を添えると一緒にできる など）／光・音・におい・さわられることへの敏感さ／休けいの目安・疲れたときのサイン");
  assert.strictEqual(HINTS.basic, "呼ばれたい名前／年齢／緊急連絡先（必要なものだけ）");
  assert.strictEqual(HINTS.meal, "食べ方の形態／とろみ／食べてはいけないもの・アレルギー");
  assert.strictEqual(HINTS.care, "時間が決まっているケア／してはいけないこと");
  assert.strictEqual(HINTS.posture, "車いすの押し方／移乗の方法／痛がる姿勢");
  assert.strictEqual(HINTS.likes, "好きなこと・得意なこと／一緒に楽しめること");
  assert.strictEqual(HINTS.dislikes, "苦手な音・場所／いやなときのサイン／避けてほしいこと");
});

test("topicHint は、トピックの記入例を返す。自作のトピック・prototype のキー(constructor など)・null には ''", async () => {
  const f = get("topicHint");
  assert.strictEqual(f({ id: "emergency" }), HINTS.emergency);
  for (const def of [{ id: "abc1234" }, { id: "constructor" }, { id: "__proto__" }, { id: "toString" }, {}, null, undefined]) assert.strictEqual(f(def), "", JSON.stringify(def));
});

test("編集モード:入力欄の上に「記入例: …」が出る(既定のトピックすべて)。公開先の欄・「項目をふやす」とは重ならない(いちばん上)", async () => {
  await startSession("hint-pass", [makeFullTeam(defs, "team_h")], "team_h");
  for (const d of defs) {
    toDetail(d.id);
    await get(`handle("start-edit",{})`);
    const html = app.innerHTML;
    assert.ok(html.includes(hintLine(d.id)), d.id);
    assert.ok(html.indexOf('class="topic-hint"') < html.indexOf('class="edit-card"'), `${d.id}:入力欄の上`);
    assert.ok(html.indexOf('class="topic-hint"') < html.indexOf("項目をふやす") && html.indexOf("項目をふやす") < html.indexOf("aud-edit"), `${d.id}:公開先の欄と重ならない`);
    assert.strictEqual(html.split('class="topic-hint"').length - 1, 1, d.id);   // 1つだけ
    await get(`handle("cancel-edit",{})`);
  }
});

test("自作のトピックには、記入例を出さない(編集モードにも、未記入の詳細画面にも)", async () => {
  toDetail("mine");
  assert.ok(!app.innerHTML.includes("topic-hint") && !app.innerHTML.includes("記入例"));
  await get(`handle("start-edit",{})`);
  assert.ok(!app.innerHTML.includes("topic-hint") && !app.innerHTML.includes("記入例") && app.innerHTML.includes("data-draft-label"));
  await get(`handle("cancel-edit",{})`);
  run(`teams[0].people[0].topics.mine=[]`);
  toDetail("mine");
  assert.ok(app.innerHTML.includes("まだ何も書かれていません。") && !app.innerHTML.includes("記入例"));
});

test("詳細画面:未記入のとき(家族が見るとき)に、「まだ何も書かれていません」と「書きこむ」の案内に加えて、記入例が出る。書いてあるときは出ない", async () => {
  toDetail("meal", "all");   // makeFullTeam の1人目は meal に1件ある。2人目(そらさん)は全部空
  assert.ok(!app.innerHTML.includes("記入例") && app.innerHTML.includes("mealの内容"));
  run(`${detailView("team_h", "p_sora", "meal", "all")}; render()`);
  const html = app.innerHTML;
  assert.ok(html.includes("まだ何も書かれていません。<br>「書きこむ」から追加できます。") && html.includes(hintLine("meal")));
  assert.ok(html.indexOf("まだ何も書かれていません") < html.indexOf("topic-hint") && html.indexOf("topic-hint") < html.indexOf('data-act="start-edit"'));
});

test("見るだけの人(学生向け・運営向けの表示、受け取ったチーム)には、空のトピックに記入例を出さない(書きこめないので)", async () => {
  run(`${detailView("team_h", "p_sora", "communication", "student")}; render()`);   // 学生に見えるが空
  assert.ok(app.innerHTML.includes("まだ何も書かれていません。") && !app.innerHTML.includes("書きこむ") && !app.innerHTML.includes("記入例"));
  run(`${detailView("team_h", "p_sora", "emergency", "staff")}; render()`);
  assert.ok(app.innerHTML.includes("まだ何も書かれていません。") && !app.innerHTML.includes("記入例"));
  // 受け取ったチーム
  const file = await env.makeShare("hint-recv", { team: makeFullTeam(defs, "team_src"), meta: { audience: "all", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await env.importShare(file, "hint-recv"), 1);
  await get(`handle("open-person",{id:"p_sora"})`);
  await get(`handle("open-topic",{id:"meal"})`);
  assert.ok(app.innerHTML.includes("まだ何も書かれていません。") && !app.innerHTML.includes("記入例") && !app.innerHTML.includes("書きこむ"));
  await get(`handle("del-team",{})`);
});

section("タイルの説明は未記入でも出す。未記入は「未記入」バッジで示す");

test("未記入のトピックのタイルにも、説明(desc)が出る。「まだ未記入」の文言はなくなり、「未記入」バッジが付く", async () => {
  run(`${personView("team_h", "p_sora", "all")}; stage="ready"; render()`);   // 全部空の人
  const html = app.innerHTML;
  for (const d of defs) {
    const tile = html.slice(html.indexOf(`data-id="${d.id}"`));
    const one = tile.slice(0, tile.indexOf("</button>"));
    assert.ok(one.includes(`<span class="tile-desc">${d.desc}</span>`) && one.includes('<span class="tile-badge blank">未記入</span>'), d.id);
  }
  assert.ok(!html.includes("まだ未記入") && !html.includes("記入ずみ"));
});

test("書いてあるトピックのタイルは「n件」バッジ(未記入バッジは付かない)。説明は従来どおり", async () => {
  run(`teams[0].people[0].topics.mine=[{label:"自作の見出し",value:"自作の内容"}]`);   // 前のテストで空にしたので、書き直す
  toPerson("p_hana");
  const html = app.innerHTML;
  const tile = (id) => { const t = html.slice(html.indexOf(`data-id="${id}"`)); return t.slice(0, t.indexOf("</button>")); };
  assert.ok(tile("communication").includes('<span class="tile-badge">1件</span>') && !tile("communication").includes("未記入"));
  assert.ok(tile("communication").includes(`<span class="tile-desc">${defs.find((d) => d.id === "communication").desc}</span>`));
  assert.ok(tile("mine").includes('<span class="tile-badge">1件</span>'));
  run(`teams[0].people[0].topics.likes=[]`);
  toPerson("p_hana");
  assert.ok(app.innerHTML.slice(app.innerHTML.indexOf('data-id="likes"')).startsWith('data-id="likes"') && app.innerHTML.includes('<span class="tile-badge blank">未記入</span>'));
});

test("自作のトピック(説明が空)は、書いてあれば「記入ずみ」と件数、空なら説明なしで「未記入」バッジ", async () => {
  run(`teams[0].people[1].topicDefs.push({id:"mine9",icon:"📌",title:"自作9",color:"#5B8DB8",desc:""}); teams[0].people[1].topics.mine9=[]`);
  toPerson("p_sora");
  let tile = app.innerHTML.slice(app.innerHTML.indexOf('data-id="mine9"'));
  tile = tile.slice(0, tile.indexOf("</button>"));
  assert.ok(tile.includes('<span class="tile-badge blank">未記入</span>') && !tile.includes("tile-desc"));
  run(`teams[0].people[1].topics.mine9=[{label:"a",value:"b"}]`);
  toPerson("p_sora");
  tile = app.innerHTML.slice(app.innerHTML.indexOf('data-id="mine9"'));
  tile = tile.slice(0, tile.indexOf("</button>"));
  assert.ok(tile.includes('<span class="tile-badge">1件</span>') && tile.includes('<span class="tile-desc">記入ずみ</span>'));
});

test("整理モードでは、バッジのかわりに並べ替え・削除の操作が出る(従来どおり)。運営向けの表示のタイルにも「未記入」が出る", async () => {
  await get(`handle("toggle-organize",{})`);
  assert.ok(app.innerHTML.includes("tile-tools") && !app.innerHTML.includes("tile-badge"));
  await get(`handle("toggle-organize",{})`);
  run(`${personView("team_h", "p_sora", "staff")}; render()`);
  assert.ok(app.innerHTML.includes('<span class="tile-badge blank">未記入</span>'));
});

section("文言(年齢を問わない表現)");

const SOURCES = { "js/*.js": () => readAppSource(), "index.html": () => readIndexHtml(), "css/style.css": () => css };

test("「この子」「その子」「お子さん」が、js/*.js・index.html・css に残っていない(UIの文字列)", async () => {
  for (const [name, read] of Object.entries(SOURCES)) {
    const text = read();
    for (const word of ["この子", "その子", "お子さん"]) assert.ok(!text.includes(word), `${name} に「${word}」がある`);
  }
});

test("子ども向けに限る言い方(子ども・子供・こども・小学校・学校でのようす・7歳・はなちゃん)も残っていない", async () => {
  const text = readAppSource() + readIndexHtml();
  for (const word of ["子ども", "子供", "こども", "小学校", "学校でのようす", "7歳", "はなちゃん"]) assert.ok(!text.includes(word), word);
});

test("表示される文言:ホームの案内・チーム名とトピック名の例・このアプリについて は、年齢を問わない表現", async () => {
  run(`stage="home"; ${listView(null)}; modal=null; render()`);
  // ホームの案内は、伝える相手ごとにチームを作る例として、家族・通っている場所・イベントを挙げる(年齢を限らない言い方)。言い回しが変わっても、この要素は残す
  const greet = (app.innerHTML.match(/<p class="greet">([^<]*)<\/p>/) ?? [])[1] ?? "";
  assert.ok(["伝える相手ごと", "家族", "通っている場所", "イベント", "チームを作れます"].every((word) => greet.includes(word)), greet);
  assert.ok(!/この子|その子|お子さん|子ども|子供|小学校/.test(greet), greet);
  run(`modal="team"; modalDraft={isNew:true,name:"",emoji:"🏠",color:"#3D7399"}; render()`);
  assert.ok(app.innerHTML.includes('placeholder="例:やまだ家、○○センター、秋のイベント"'));
  run(`modal="about"; modalDraft=null; render()`);
  assert.ok(app.innerHTML.includes("本人に関する情報を、必要な人へ伝えるアプリです。") && app.innerHTML.includes(`v${get("APP_VERSION")}`));
  assert.ok(!/この子|その子|お子さん|子ども|小学校/.test(app.innerHTML));
  run(`modal=null; modalDraft=null`);
  assert.ok(readIndexHtml().includes("本人に関する情報を、必要な人へ伝えるプロフィールカード"));
});

test("APP_VERSION は 1.1.0-trial(設定のこのアプリについてに出る。共有ファイルの meta にも入る)", async () => {
  assert.strictEqual(get("APP_VERSION"), "1.1.0-trial");
});

section("新しくインストールしたときのサンプル(20代の架空の人物「はなさん」)");

test("SAMPLE_TEAM:チーム「サンプル（架空の人物）」・人物「はなさん」。生年月日・年齢・電話番号・「ちゃん」はない。activity を含む新しい DEFAULT_TOPICS を使う", async () => {
  const s = plain(get("SAMPLE_TEAM")), p = s.people[0];
  assert.ok(s.name === "サンプル（架空の人物）" && s.id === "team_sample" && s.people.length === 1);
  assert.ok(p.id === "sample" && p.name === "はなさん" && p.note === "音楽と、キラキラ光るものが大好きです" && p.photo === null);
  assert.deepStrictEqual(p.topicDefs, defs);   // 既定のトピック(activity を含む)
  assert.ok(p.topicDefs.some((d) => d.id === "activity"));
  // 人物とチームの内容(トピックの定義=既定の説明文は除く)に、生年月日・年齢・電話番号・子ども向けの言い方がない
  const text = JSON.stringify({ team: s.name, name: p.name, note: p.note, topics: p.topics });
  for (const word of ["生年月日", "歳", "才", "ちゃん", "くん", "やまだ", "小学", "お子さん", "この子", "XXXX"]) assert.ok(!text.includes(word), word);
  assert.ok(!/\d{4}年/.test(text) && !/\d{2,4}-\d{2,4}-\d{3,4}/.test(text) && !/\d{6,}/.test(text) && !/090|080|070/.test(text));   // 年月日・電話番号の形がない
  assert.ok(!("updatedAt" in p));
});

test("SAMPLE_TEAM の内容は、仕様どおり(ひとこと・伝え方・活動・好き・苦手・緊急・基本)", async () => {
  const t = plain(get("SAMPLE_TEAM")).people[0].topics;
  const one = (id) => Object.fromEntries(t[id].map((e) => [e.label, e.value]));
  assert.deepStrictEqual(Object.keys(t).sort(), ["activity", "basic", "communication", "dislikes", "emergency", "likes"]);   // 食事・医療的ケア・姿勢は書かない(必要以上に書かない例)
  assert.deepStrictEqual(one("communication"), {
    "はい・いいえ": "「はい」のときは目をゆっくり閉じます。「いいえ」のときは顔をそらします",
    "うれしいとき": "目を大きく開けて、声を出して笑います",
    "話しかけ方": "正面か左側から、名前を呼んでから、ゆっくり話してください。返事には少し時間がかかります",
  });
  assert.deepStrictEqual(one("activity"), { "参加のしかた": "手を添えると、一緒にシールを貼ったり、ブロックを置いたりできます", "敏感なこと": "急な大きい音にびっくりします" });
  assert.deepStrictEqual(one("likes"), { "好きなこと": "アイドルの曲、万華鏡、光るもの" });
  assert.deepStrictEqual(one("dislikes"), { "苦手なこと": "後ろから急に話しかけられること" });
  assert.deepStrictEqual(one("emergency"), { "発作のサイン": "目が右上を向いて、体がかたくなります", "まずしてほしいこと": "すぐに付き添いの方に伝えてください" });   // 運営向け
  assert.deepStrictEqual(one("basic"), { "呼ばれたい名前": "はなさん" });   // 運営向け
  const emergencyText = JSON.stringify(t.emergency);
  for (const word of ["救急車", "119", "横向き", "薬", "吸引"]) assert.ok(!emergencyText.includes(word), word);   // 医療的な指示は書かない
});

test("新しくインストールしたとき(初期設定)に、サンプルが入る。公開先の初期値のまま(伝え方などは学生と運営、緊急・基本は運営だけ)", async () => {
  const fresh = createApp();
  fresh.run(`stage="setup-pass"; cryptoKey=null; salt=null; teams=[]; persistedTeams=[]; screenError=""; modal=null; modalDraft=null; ${listView(null)}`);
  await fresh.get(`setupNew("fresh-pass")`);
  assert.strictEqual(fresh.get("stage"), "home");
  const teams = plain(fresh.get("teams"));
  assert.ok(teams.length === 1 && teams[0].name === "サンプル（架空の人物）" && teams[0].people[0].name === "はなさん");
  assert.ok(sameData(teams[0], get("normalizeTeam")(get("SAMPLE_TEAM"))));
  const stored = await fresh.get("decryptJson")(JSON.parse(fresh.localStorage.getItem("support-card-local-v1")), fresh.get("cryptoKey"));
  assert.ok(sameData(stored.teams[0], teams[0]));   // 保存データにも入っている
  const aud = (id) => plain(fresh.get(`topicAudience(teams[0].people[0].topicDefs.find(d=>d.id==="${id}"))`));
  assert.deepStrictEqual(aud("communication"), ["student", "staff"]);
  assert.deepStrictEqual(aud("activity"), ["student", "staff"]);
  assert.deepStrictEqual(aud("emergency"), ["staff"]);
  assert.deepStrictEqual(aud("basic"), ["staff"]);
  // 画面:ホームのカード → 人物ページ(「すべて」)に、サンプルの内容と公開先のバッジが出る
  assert.ok(fresh.app.innerHTML.includes("サンプル（架空の人物）"));
  await fresh.get(`handle("enter-team",{id:"team_sample"})`);
  await fresh.get(`handle("open-person",{id:"sample"})`);
  const html = fresh.app.innerHTML;
  assert.ok(html.includes("はなさん") && html.includes('data-id="activity"') && html.includes("参加のしかた・手伝い方・敏感なこと") && html.includes(">学生</span>") && html.includes(">運営</span>"));
  // 学生向けの表示:はじめましてページに、伝え方 → 活動 → 好き → 苦手 の順で出る(緊急・基本は出ない)
  await fresh.get(`handle("set-audience",{v:"student"})`);
  const page = fresh.app.innerHTML;
  assert.ok(page.includes("はなさんのこと") && page.includes("正面か左側から、名前を呼んでから") && page.includes("急な大きい音にびっくりします"));
  assert.ok(!page.includes("目が右上を向いて") && !page.includes("呼ばれたい名前"));
  assert.ok(page.indexOf("コミュニケーション") < page.indexOf("一緒に活動するとき") && page.indexOf("一緒に活動するとき") < page.indexOf("好きなこと</h2>"));
});

test("既存の利用者のデータは変えない:古い名前・古いトピック(activity なし)・生年月日のあるデータは、保存して解錠しても、そのまま", async () => {
  const old = {
    id: "team_old", name: "やまだ家", emoji: "🏠", color: "#3D7399",
    people: [{ id: "sample", name: "はなちゃん", emoji: "🌸", note: "いつもニコニコ、音楽が大すき", photo: null,
      topicDefs: defs.filter((d) => d.id !== "activity").map((d) => ({ ...d })),
      topics: { basic: [{ label: "生年月日", value: "2018年4月10日(7歳)" }, { label: "緊急連絡先", value: "母:090-XXXX-XXXX" }], emergency: [{ label: "対応", value: "横向きに寝かせる" }] } }],
  };
  await startSession("old-pass", [old], null);
  await get("save()"); await get("lockNow()"); await get(`unlock("old-pass")`);
  assert.ok(get("stage") === "home" && sameData(get("teams[0]"), old));
  assert.ok(!plain(get("teams[0].people[0].topicDefs")).some((d) => d.id === "activity"));   // activity は増えない
});

section("見やすさ・使いやすさ(css の静的な検査)");

// css から、セレクタがちょうど一致する最初のルールの中身(波かっこの内側)を取り出す
const ruleBody = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
};
const decl = (selector, prop) => { const body = ruleBody(selector); const m = body && body.replace(/\/\*[\s\S]*?\*\//g, "").match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`)); return m ? m[1].trim() : null; };

// ---- 実際に効く色を静的に取り出す ----
// css は後ろのルールが前のルールを上書きする。decl は「最初のルール」を見るので、色の検査には使わない。
// ここでは同じセレクタの「最後の宣言」を実際に効く値とみなし(同じ詳しさのセレクタどうしなら正しい)、テーマ(body の data-theme)ごとの色で計算する。
const splitTop = (text, sep) => {   // 括弧・角かっこ・引用符の外にある sep で分ける
  const out = []; let depth = 0, quote = "", cur = "";
  for (const ch of text) {
    if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++; else if (ch === ")" || ch === "]") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};
const parseRules = (src, media = "") => {   // [{ selectors, decls: { プロパティ: 値 }, media }]。@media の中は media に条件が入る。@keyframes などは読み飛ばす
  const rules = []; let pos = 0;
  for (;;) {
    const open = src.indexOf("{", pos); if (open < 0) break;
    const prelude = src.slice(pos, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth) { if (src[j] === "{") depth++; else if (src[j] === "}") depth--; j++; }
    const inner = src.slice(open + 1, j - 1);
    if (prelude.startsWith("@media")) rules.push(...parseRules(inner, prelude.slice(6).trim()));
    else if (!prelude.startsWith("@")) {
      const decls = {};
      for (const d of splitTop(inner, ";")) { const i = d.indexOf(":"); if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).replace(/!important\s*$/, "").trim(); }
      rules.push({ selectors: splitTop(prelude, ",").map((s) => s.trim()), decls, media });
    }
    pos = j;
  }
  return rules;
};
const RULES = parseRules(css.replace(/\/\*[\s\S]*?\*\//g, ""));
const lastDecl = (selector, prop) => RULES.reduce((v, r) => (r.media === "" && r.selectors.includes(selector) && r.decls[prop] !== undefined ? r.decls[prop] : v), null);
// テーマの色(トークン)。:root の色に、body[data-theme] の色が重なる。OS がライトのときだけ、テーマごとの薄い背景色が付く
const THEME_IDS = ["milk", "sakura", "sora", "wakaba"];
const tokensFor = (theme, os) => {
  const tokens = {};
  const apply = (selector, medias) => { for (const r of RULES) if (r.selectors.includes(selector) && medias.includes(r.media)) for (const [k, v] of Object.entries(r.decls)) if (k.startsWith("--")) tokens[k] = v; };
  apply(":root", [""]);
  apply(`body[data-theme="${theme}"]`, os === "light" ? ["", "(prefers-color-scheme: light)"] : [""]);
  return tokens;
};
const rgbOf = (hex) => { const h = hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const colorOf = (expr, tokens) => {   // #rgb・#rrggbb・var(--x)・color-mix(in srgb, 色 n%, 色) を RGB にする
  expr = expr.trim();
  let m = expr.match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
  if (m) return colorOf(tokens[m[1]] ?? m[2], tokens);
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(expr)) return rgbOf(expr);
  m = expr.match(/^color-mix\(in srgb,(.+)\)$/);
  if (m) {
    const part = (s) => { const q = s.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/); return q ? [q[1], +q[2] / 100] : [s.trim(), null]; };
    const [a, b] = splitTop(m[1], ",");
    let [ca, pa] = part(a), [cb, pb] = part(b);
    if (pa === null && pb === null) pa = pb = 0.5; else if (pa === null) pa = 1 - pb; else if (pb === null) pb = 1 - pa;
    assert.ok(Math.abs(pa + pb - 1) < 1e-9, `color-mix の割合が100%でない(透明が混ざる): ${expr}`);
    const A = colorOf(ca, tokens), B = colorOf(cb, tokens);
    return A.map((v, i) => v * pa + B[i] * pb);
  }
  throw new Error("読めない色: " + expr);
};
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
// セレクタの実際の文字色と背景色(背景が transparent なら、その下の画面の背景 --bg)の比を、テーマ4つ × OS のライト・ダークで測り、いちばん低いものを返す
const worstContrast = (textSelector, { bgSelector = textSelector, textProp = "color" } = {}) => {
  let worst = { ratio: Infinity, where: "" };
  for (const theme of THEME_IDS) for (const os of ["light", "dark"]) {
    const t = tokensFor(theme, os);
    const bgExpr = lastDecl(bgSelector, "background");
    const bg = bgExpr && bgExpr !== "transparent" && bgExpr !== "none" ? bgExpr : "var(--bg)";
    const r = ratio(colorOf(lastDecl(textSelector, textProp), t), colorOf(bg, t));
    if (r < worst.ratio) worst = { ratio: r, where: `${theme}/OS ${os}` };
  }
  return worst;
};

test("項目見出し(.entry-label)の色は、トピックの色ではなく主な操作の色(--primary)。インラインの color も --topic-color も使わない。緊急のトピックの中だけ、赤い線(左に太い線)と文字", async () => {
  assert.strictEqual(decl(".entry-label", "color"), "var(--primary)");
  assert.strictEqual(decl(".entry", "border-bottom"), "1px solid var(--line)");   // 項目は中立の線で区切る
  assert.strictEqual(lastDecl(".urgent .entry", "border-left"), "4px solid var(--red)");
  assert.strictEqual(lastDecl(".urgent .entry-label", "color"), "var(--red)");
  const src = readAppSource();
  assert.ok(!/entry-label"\s*style=/.test(src) && !/class="entry-label"[^>]*color:/.test(src));   // インラインの color:${t.color} を使わない
  assert.ok(!/class="entry"\s+style=/.test(src));
  assert.ok(!src.includes("--topic-color") && !css.includes("--topic-color"));   // トピックの色(t.color)は表示に使わない
  await startSession("css-pass", [makeFullTeam(defs, "team_h")], "team_h");   // 前のテストで別のデータに切り替えたので、作り直す
  toDetail("communication");
  assert.ok(app.innerHTML.includes('<div class="d-body">') && app.innerHTML.includes('<div class="entry-label">communicationの見出し</div>'));   // 色の指定(style)は付かない
  toDetail("emergency");
  assert.ok(app.innerHTML.includes('<div class="d-body urgent">') && app.innerHTML.includes('<div class="d-head urgent">'));   // 緊急だけ urgent(赤い線と文字は css)
});

// 色の基準(WCAG 2.x AA):文字は 4.5:1 以上、大きい文字・枠線・部品の印は 3:1 以上。
// 項目見出し(.entry-label)と「この端末で編集する」(.banner-edit)の文字は、主な操作の色(--primary)で、どのテーマでも白地・薄い面の上で 4.5:1 以上
const ENTRY_LABEL_MIN = 4.5, BANNER_EDIT_MIN = 4.5;

test("項目見出し(.entry-label)の実際に効く色は、白を基調にした4つのテーマの背景に対して読める。OS がダークでも、暗い背景にはならない", async () => {
  // 実際に効く色は、後ろのルール(いまは .entry-label{color:var(--primary)})
  assert.ok(lastDecl(".entry-label", "color"));
  let worst = Infinity;
  for (const theme of THEME_IDS) for (const os of ["light", "dark"]) {
    const t = tokensFor(theme, os);
    const label = colorOf(lastDecl(".entry-label", "color"), t);
    for (const bg of ["--bg", "--card"]) {   // 項目は画面の背景(--bg)の上。カードの白(--card)の上でも確かめる
      const r = ratio(label, colorOf(`var(${bg})`, t));
      worst = Math.min(worst, r);
      assert.ok(r >= ENTRY_LABEL_MIN, `${theme}(OS ${os})・${bg}:${r.toFixed(2)}:1`);
      assert.ok(lum(colorOf(`var(${bg})`, t)) > 0.8, `${theme}(OS ${os})・${bg} が暗い背景になっている`);
    }
  }
  assert.ok(worst >= ENTRY_LABEL_MIN);
});

test("タイル名は line-break:strict(「コミュニケーシ/ョン」の折り返しを避ける)", async () => {
  assert.strictEqual(decl(".tile-title", "line-break"), "strict");
});

test("タップ領域:.tool-btn・.d-back・.remove-link・.text-link・.back-link・.photo-btn・.danger-link・ボタン・入力欄・切り替えは高さ44px以上、.tile-tool・.tile-drag-handle は幅も高さも44px", async () => {
  for (const selector of [".tool-btn", ".d-back", ".remove-link", ".text-link", ".back-link", ".photo-btn", ".danger-link", ".big-btn", ".seg-btn", ".sp-speak", ".banner-del", ".banner-edit", ".aud-check", ".home-utility-link", ".theme-btn"]) {
    assert.ok(parseFloat(decl(selector, "min-height")) >= 44, selector);
  }
  for (const selector of [".tile-tool", ".tile-drag-handle"]) {
    assert.strictEqual(decl(selector, "width"), "44px", selector);
    assert.strictEqual(decl(selector, "height"), "44px", selector);
  }
  // 整理モードの操作(並べ替え・上へ・下へ・削除)は44px四方になったので、アイコンやタイトルに重ならないよう、絶対配置ではなくタイルの流れの中に置く
  assert.ok(decl(".tile-tools", "position") === null && decl(".tile-tools", "grid-row") === "3");
});

test("文字サイズ:設定(大きめ・特大)が、--fs-add を通じて、ツールバー・戻る・注記・帯・モーダルの文字・バッジ・はじめましてページ・緊急情報の一覧にも効く", async () => {
  assert.strictEqual(decl(":root", "--fs-add"), "0px");
  assert.strictEqual(decl('body[data-fs="l"]', "--fs-add"), "2px");
  assert.strictEqual(decl('body[data-fs="xl"]', "--fs-add"), "4px");
  const scaled = [
    ".tool-btn", ".back-link", ".d-back", ".photo-btn", ".remove-link", ".text-link", ".danger-link",   // ボタン・リンク
    ".aud-note", ".view-note", ".aud-chip", ".aud-check", ".aud-switch-label", ".hero-updated", ".hero-hint", ".tile-badge", ".seg-btn",   // 注記・バッジ・切り替え
    ".notice", ".banner-del", ".banner-edit", ".team-name", ".team-sub", ".greet", ".empty", ".footer-hint",   // 帯・ホーム
    ".modal h2", ".m-label", ".m-p", ".m-about", ".share-warning", ".share-person", ".lock-sub", ".lock-error",   // モーダル・ロック画面
    ".topic-hint", ".sp-title", ".sp-lead", ".sp-note", ".sp-topic-title", ".sp-speak", ".sp-empty", ".sp-care p",   // はじめましてページ
    ".em-note", ".em-name", ".em-sec-title", ".em-empty",   // 緊急情報の一覧
  ];
  for (const selector of scaled) assert.match(decl(selector, "font-size") ?? "", /var\(--fs-add\)/, selector);
  // モーダルの説明文に、文字サイズの設定を打ち消すインラインの font-size を残さない
  assert.ok(!/<p style="font-size/.test(readAppSource()) && !/<div style="font-size:1[0-9]/.test(readAppSource()));
  // 設定を切り替えると、body の data-fs が変わる(css の body[data-fs] が効く)
  await get(`handle("set-fs",{v:"xl"})`);
  assert.strictEqual(body.dataset.fs, "xl");
  await get(`handle("set-fs",{v:"m"})`);
  assert.strictEqual(body.dataset.fs, "m");
});

test("緊急情報のボタン・受け取った帯のボタンの文字は、白地(テーマの薄い背景を含む)の上で読める。OS がダークでも変わらない", async () => {
  // 緊急情報のボタン(赤い枠と赤い文字、白い面)。押したとき(:hover。薄いピンクの面)でも読める
  const em = worstContrast(".tool-btn.em-btn");
  assert.ok(em.ratio >= 4.5, `緊急情報のボタン ${em.where}:${em.ratio.toFixed(2)}:1`);
  const emHover = worstContrast(".tool-btn.em-btn", { bgSelector: ".tool-btn.em-btn:hover" });
  assert.ok(emHover.ratio >= 4.5, `緊急情報のボタン(:hover) ${emHover.where}:${emHover.ratio.toFixed(2)}:1`);
  // 受け取った帯のボタン:「このチームを削除する」(赤い枠と文字)と「この端末で編集する」(主な操作の色の枠と文字)。どちらも白い面
  const del = worstContrast(".banner-del");
  assert.ok(del.ratio >= 4.5, `帯の削除ボタン ${del.where}:${del.ratio.toFixed(2)}:1`);
  const edit = worstContrast(".banner-edit");
  assert.ok(edit.ratio >= BANNER_EDIT_MIN, `帯の編集ボタン ${edit.where}:${edit.ratio.toFixed(2)}:1`);
  // タップ領域は高さ44px以上
  assert.ok(parseFloat(decl(".banner-edit", "min-height")) >= 44 && parseFloat(decl(".sp-speak", "min-height")) >= 44);
});

test("OS のダーク設定では配色を変えない(白地のまま):ダーク用の色指定がなく、背景は白、文字は濃い色。どのテーマも白地。印刷は白地に黒字", async () => {
  assert.ok(!/prefers-color-scheme\s*:\s*dark/i.test(css));   // OS のダーク設定では配色を切り替えない
  for (const theme of THEME_IDS) for (const os of ["light", "dark"]) {
    const t = tokensFor(theme, os);
    for (const token of ["--bg", "--card"]) assert.ok(lum(colorOf(`var(${token})`, t)) > 0.8, `${theme}(OS ${os}) ${token}`);   // 暗い背景にならない
    for (const token of ["--ink", "--sub", "--faint"]) assert.ok(lum(colorOf(`var(${token})`, t)) < 0.2, `${theme}(OS ${os}) ${token}`);   // 文字の色は濃い色のまま
    assert.strictEqual(t["--bg"], "#FFFFFF", `${theme}(OS ${os})`);   // 画面の背景は、どのテーマも、OS の設定に関係なく白(テーマで変わるのは、薄い面の色と主な操作の色だけ)
  }
  // 印刷は、画面の色(テーマ)に関係なく、白地に黒字。印刷の規則は色の変数(var(--…))を使わない
  assert.ok(/@media print\{\s*body\{background:#fff!important;color:#000!important/.test(css));
  const printRules = RULES.filter((r) => r.media === "print");
  assert.ok(printRules.length >= 2);
  for (const r of printRules) for (const [prop, value] of Object.entries(r.decls)) assert.ok(!value.includes("var("), `${r.selectors.join(",")} { ${prop}: ${value} }`);
});

section("配色(4つのテーマすべてで、文字は 4.5:1 以上、枠は 3:1 以上)");

const TEXT_MIN = 4.5, BORDER_MIN = 3;
// 文字(または枠)の色と、その下の面の色の比を、4つのテーマ × OS のライト・ダークで測り、いちばん低いものを返す
const worstOf = (textExpr, bgExpr) => {
  let worst = { ratio: Infinity, where: "" };
  for (const theme of THEME_IDS) for (const os of ["light", "dark"]) {
    const t = tokensFor(theme, os);
    const r = ratio(colorOf(textExpr, t), colorOf(bgExpr, t));
    if (r < worst.ratio) worst = { ratio: r, where: `${theme}/OS ${os}` };
  }
  return worst;
};
// ルールの border(または border-color)の色。"1px solid var(--line-strong)" のような値の、最後の語
const borderColorOf = (selector, prop = "border") => { const v = lastDecl(selector, prop); assert.ok(v, `${selector} に ${prop} がない`); return v.trim().split(" ").at(-1); };
const checkPairs = (pairs, min = TEXT_MIN) => {   // [文字のセレクタ, 面のセレクタ] の実際に効く色を測る(面に background がなければ画面の背景 --bg)
  for (const [text, bg] of pairs) { const w = worstContrast(text, { bgSelector: bg }); assert.ok(w.ratio >= min, `${text} on ${bg} ${w.where}:${w.ratio.toFixed(2)}:1`); }
};
const TEXT_SURFACES = ["--bg", "--card", "--blue-wash", "--pink-wash", "--pink-wash-hover", "--wash", "--wash-hover"];   // 文字が載る面(白・薄い水色・薄いピンク・テーマの薄い面とそのホバー)

test("トークン:本文・補足・薄い字(--ink・--sub・--faint)は、文字が載るすべての面の上で 4.5:1 以上。主な操作の色(--primary)は、赤い項目のホバー以外の面の上で 4.5:1 以上(4つのテーマ)", async () => {
  for (const text of ["--ink", "--sub", "--faint", "--primary"]) for (const surface of TEXT_SURFACES) {
    if (text === "--primary" && surface === "--pink-wash-hover") continue;   // 赤い項目(緊急・削除)を押したときの面。主な操作の色の文字は載らない
    const w = worstOf(`var(${text})`, `var(${surface})`);
    assert.ok(w.ratio >= TEXT_MIN, `${text} on ${surface} ${w.where}:${w.ratio.toFixed(2)}:1`);
  }
});

test("主な操作の塗りのボタンの白い文字は、4つのテーマすべてで 4.5:1 以上(.btn-primary・.home-primary・選んだタブ .seg-btn.on。押したとき :hover も)", async () => {
  checkPairs([[".btn-primary", ".btn-primary"], [".btn-primary", ".btn-primary:hover"], [".home-primary", ".home-primary"], [".home-primary", ".home-primary:hover"], [".seg-btn.on", ".seg-btn.on"]]);
  assert.strictEqual(lastDecl(".btn-primary", "color"), "#FFFFFF");
  assert.strictEqual(lastDecl(".btn-primary", "background"), "var(--primary)");
  const w = worstOf("#FFFFFF", "var(--primary)");
  assert.ok(w.ratio >= TEXT_MIN, `白い文字 on --primary ${w.where}:${w.ratio.toFixed(2)}:1`);
});

test("緊急の赤(--red)の文字は、使う面(白・薄いピンク・テーマの薄い面)の上で、4つのテーマすべてで 4.5:1 以上。赤い面の白い文字も 4.5:1 以上", async () => {
  for (const surface of TEXT_SURFACES) { const w = worstOf("var(--red)", `var(${surface})`); assert.ok(w.ratio >= TEXT_MIN, `--red on ${surface} ${w.where}:${w.ratio.toFixed(2)}:1`); }
  checkPairs([
    [".tool-btn.em-btn", ".tool-btn.em-btn"], [".tool-btn.em-btn", ".tool-btn.em-btn:hover"],            // 緊急情報のボタン(チームの画面)
    [".home-action-title", ".home-emergency"], [".home-action-title", ".home-emergency:hover"], [".home-action-desc", ".home-emergency"],   // ホームの緊急情報のボタン
    [".tile.urgent .tile-title", ".tile"], [".tile.urgent .tile-title", "button.tile.urgent:hover"],   // 緊急のトピックのタイル
    [".d-head.urgent .d-title", ".d-head.urgent"], [".urgent .entry-label", ".entry"],                // 緊急のトピックの詳細
    [".btn-danger", ".btn-danger"], [".btn-danger", ".btn-danger:hover"], [".danger-link", ".danger-link"], [".danger-link", ".danger-link:hover"],   // 削除
    [".banner-del", ".banner-del"], [".banner-del", ".banner-del:hover"], [".remove-link", ".remove-link"],
    [".photo-btn.danger", ".photo-btn"], [".tile-tool-danger", ".tile-tool"], [".tile-tool-danger", ".tile-tool-danger:hover"],
    [".lock-error", ".lock-card"], [".lock-wait", ".lock-card"], [".share-orphan", ".modal"], [".m-danger", ".modal"], [".m-danger-text", ".modal"],   // 警告の文
    [".em-empty", ".em-empty"],                                                                         // 緊急情報の「記入なし」(薄いピンクの面に本文の色)
  ]);
});

test("入力欄・枠だけのボタンの枠(--line-strong)は、4つのテーマすべてで、白・テーマの薄い面・薄いピンクの面に対して 3:1 以上", async () => {
  for (const selector of [".input", ".textarea", ".lock-input", ".private-note-input", ".big-btn", ".tool-btn", ".photo-btn", ".seg-btn", ".add-card", ".sp-speak", ".d-back", ".tile-tool", ".tile-drag-handle", ".banner-edit"]) {
    assert.strictEqual(borderColorOf(selector), "var(--line-strong)", selector);
  }
  for (const selector of [".btn-secondary", ".home-secondary"]) assert.strictEqual(borderColorOf(selector, "border-color"), "var(--line-strong)", selector);
  for (const surface of ["--bg", "--card", "--wash", "--pink-wash"]) {   // 枠が載る面:画面・カード・人物の見出し(テーマの薄い面)・緊急のトピックの見出し(薄いピンク)
    const w = worstOf("var(--line-strong)", `var(${surface})`);
    assert.ok(w.ratio >= BORDER_MIN, `--line-strong on ${surface} ${w.where}:${w.ratio.toFixed(2)}:1`);
  }
  // 入力欄の枠は 1px の実線で、文字を入れる面(--card)の上
  for (const selector of [".input", ".textarea", ".lock-input", ".private-note-input"]) assert.match(lastDecl(selector, "border"), /^1px solid /, selector);
});

test("ピンクを文字に使う所(--accent-pink)は、白・薄いピンクの面の上で、4つのテーマすべてで 4.5:1 以上。ピンクの文字は決めた所だけ", async () => {
  for (const surface of ["--bg", "--card", "--pink-wash"]) { const w = worstOf("var(--accent-pink)", `var(${surface})`); assert.ok(w.ratio >= TEXT_MIN, `--accent-pink on ${surface} ${w.where}:${w.ratio.toFixed(2)}:1`); }
  checkPairs([[".aud-chip.family", ".aud-chip.family"], [".private-note-unsaved", ".private-note-editor"]]);
  const users = RULES.filter((r) => r.media === "" && r.decls.color === "var(--accent-pink)").flatMap((r) => r.selectors).sort();
  assert.deepStrictEqual(users, [".aud-chip.family", ".private-note-unsaved"]);   // ピンクの文字を足すときは、ここと上の確かめに足す
});

test("4つのテーマ:どれも白地。--teal は --primary と同じ値(以前の名前)。設定の見本の色(THEMES)は、各テーマの主な操作の色と同じ", async () => {
  const themes = plain(get("THEMES"));
  assert.deepStrictEqual(themes.map((th) => th.id), THEME_IDS);
  for (const th of themes) {
    const t = tokensFor(th.id, "light");
    assert.strictEqual(t["--teal"], t["--primary"], th.id);
    assert.strictEqual(th.color.toUpperCase(), t["--primary"].toUpperCase(), `${th.id}:設定の見本の色`);
    assert.ok(t["--bg"] === "#FFFFFF" && t["--card"] === "#FFFFFF", th.id);
  }
  assert.strictEqual(new Set(THEME_IDS.map((id) => tokensFor(id, "light")["--primary"])).size, 4);   // テーマごとに主な操作の色が違う
  assert.strictEqual(tokensFor("milk", "light")["--primary"], "#2F6E96");
});
