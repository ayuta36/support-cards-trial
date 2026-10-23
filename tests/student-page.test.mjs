/* ============================================================
   tests/student-page.test.mjs ― 学生向け「はじめましてページ」
   ------------------------------------------------------------
   対象:js/views.js の studentPage(と render の分岐・buildPrint の学生向け)、js/data.js の studentPageTopics・hasText、
        js/constants.js の STUDENT_PAGE_ORDER・STUDENT_NOTICE、js/actions.js の speak-topic(トピックごとの読み上げ)。
   仕様:viewAudience()==="student" のとき、人物ページをタイルではなく1ページで縦に並べる(自分のチームを学生向けで見ているときも、
        学生向けで受け取ったチームも)。ヘッダー(写真・「〇〇のこと」・ひとこと・最終更新日)→ 学生に見えるトピックを
        伝え方・一緒に活動するとき・好き・苦手・その他の順 → 固定の案内。中身のないトピックは出さない。見るだけ(編集の操作なし)。
   ※前のテストの結果(取り込んだチームなど)を後のテストが使うため、順番を変えない。
     テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, personView, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, context, app, print, alerts, spoken, startSession, makeShare, importShare } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const titleOf = (id) => defs.find((d) => d.id === id).title;
const STUDENT_ORDER = ["communication", "activity", "likes", "dislikes"];
const HIDDEN_IDS = ["emergency", "basic", "meal", "care", "posture"];
const NOTICE = "いつもと様子がちがうと感じたら、すぐに付き添いの方かスタッフに伝えてください。";
const EMPTY = "まだ学生（一緒に参加する人）向けに公開された情報はありません";
const PASS = "student-page-pass";
const fmtDay = get("fmtDay");
const ICON = (name, size = 18) => get(`icon(${JSON.stringify(name)},${size})`);   // アイコンの <svg>(読み上げ・止めるのボタンの前に付く)
const SPEAK = ICON("speak"), STOP = ICON("stop");
context.window.print = () => {};

// 画面のHTMLから、並んでいるトピックのタイトルを順に取り出す
const pageTitles = (html = app.innerHTML) => [...html.matchAll(/class="sp-topic-title" id="sp-topic-\d+">([^<]*)</g)].map((m) => m[1]);
const printTitles = (html = print.innerHTML) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);   // 印刷の見出しはトピック名だけ(アイコンも絵文字もない)
const toStudentView = (teamId = "team_full", personId = "p_hana") => run(`stage="ready"; ${personView(teamId, personId, "student")}; modal=null; modalDraft=null; render()`);
const EDIT_ACTS = ["edit-person", "toggle-organize", "add-topic", "open-copyto", "start-edit", "draft-add", "save-edit", "del-topic", "move-up", "move-down", "add-person", "edit-team"];

section("自分のチームを学生向けで見ると、タイルではなく1ページで縦に並ぶ");

test("ヘッダー:写真(なければ名前の最初の1文字)・「〇〇のこと」・補足・ひとこと・最終更新日が出る(名前に「さん」は足さない)", async () => {
  await startSession("sp-pass", [makeFullTeam(defs)], "team_full");
  toStudentView();
  const html = app.innerHTML;
  assert.ok(html.includes('<article class="sp"') && !html.includes('class="grid"') && !html.includes('class="tile'));   // タイルの画面ではない
  assert.ok(html.includes('<h1 class="sp-title" id="sp-title">はなさんのこと</h1>'));   // 名前は「はなさん」(すでに「さん」が付いている)。さらに「さん」は足さない
  assert.ok(!html.includes("はなさんさん") && html.includes("一緒に過ごすときに、知っておいてほしいこと"));
  assert.ok(html.includes("音楽が好き") && html.includes(`最終更新: ${fmtDay("2026-10-18T03:00:00.000Z")}`));
  assert.ok(html.includes('<span class="avatar" aria-hidden="true" style="width:96px;height:96px;font-size:48px">は</span>'));   // 写真がないので、名前(はなさん)の最初の1文字。大きさは96px。保存データの絵文字(🌸)は出さない
  assert.ok(!html.includes("🌸"));
});

test("写真があるときは、96pxの写真が出る。最終更新日がない人物では、最終更新を出さない", async () => {
  run(`teams[0].people[0].photo="data:image/jpeg;base64,AAAA"`);
  toStudentView();
  assert.ok(app.innerHTML.includes('class="avatar photo" style="width:96px;height:96px"><img src="data:image/jpeg;base64,AAAA"'));
  run(`teams[0].people[0].photo=null`);
  toStudentView("team_full", "p_sora");
  assert.ok(app.innerHTML.includes("そらさんのこと") && !app.innerHTML.includes("最終更新"));
});

test("学生に見えるトピックだけが、伝え方 → 一緒に活動するとき → 好き → 苦手 の順に並ぶ(各トピックは、タイトルと項目カード)", async () => {
  toStudentView();
  const html = app.innerHTML;
  assert.deepStrictEqual(pageTitles(), STUDENT_ORDER.map(titleOf));
  for (const id of STUDENT_ORDER) assert.ok(html.includes(`${id}の見出し`) && html.includes(`${id}の内容`), id);
  assert.ok(html.includes(`<div class="entry-label">communicationの見出し</div>`) && html.includes(`<div class="entry-value">communicationの内容</div>`));
  // トピックのアイコンは、線のアイコン(icon・topicIcon を通したもの)。保存データの絵文字(🎨・💬)は出さない
  for (const id of STUDENT_ORDER) assert.ok(html.includes(`<span class="sp-icon" aria-hidden="true">${get("topicIcon")({ id })}</span>`), id);
  assert.ok(!html.includes("🎨") && !html.includes("💬"));
  for (const id of HIDDEN_IDS) assert.ok(!html.includes(`${id}の内容`) && !html.includes(titleOf(id)), id);   // 学生に見えないトピックは出ない
  assert.ok(!html.includes("自作の内容") && !html.includes("一覧にない内容"));
  assert.ok(!html.includes("aud-chip"));   // 公開先のバッジはタイルの画面だけ
});

test("並び順は STUDENT_PAGE_ORDER。topicDefs の順が違っていても、そのあとの学生向けのトピック(自作など)は topicDefs の順で最後に並ぶ", async () => {
  assert.deepStrictEqual(plain(get("STUDENT_PAGE_ORDER")), STUDENT_ORDER);
  const t = makeFullTeam(defs, "team_order");
  const d = (id) => t.people[0].topicDefs.find((x) => x.id === id);
  d("mine").audience = ["student"];
  t.people[0].topicDefs.push({ id: "mine2", icon: "🧩", title: "自作その2", color: "#2F8F83", desc: "", audience: ["student", "staff"] });
  t.people[0].topics.mine2 = [{ label: "見出しその2", value: "内容その2" }];
  t.people[0].topicDefs.push({ id: "mine3", icon: "🔒", title: "家族だけ", color: "#2F8F83", desc: "" });   // 公開先なし(家族のみ)
  t.people[0].topics.mine3 = [{ label: "内緒", value: "家族だけの内容" }];
  t.people[0].topicDefs.reverse();   // 並びを逆にしても、決めた順で出る
  await startSession("sp-order", [t], "team_order");
  toStudentView("team_order");
  // 逆順にした topicDefs で、自作の2つは「mine2 が先、mine があと」(topicDefs の順)
  assert.deepStrictEqual(pageTitles(), [...STUDENT_ORDER.map(titleOf), "自作その2", "自作トピック"]);
  assert.ok(!app.innerHTML.includes("家族だけの内容"));
});

test("中身のないトピック(項目がない・見出しも内容も空白だけ)は出さない。出ているものは、中身のあるものだけ", async () => {
  const t = makeFullTeam(defs, "team_empty_topics");
  t.people[0].topics.likes = [];
  t.people[0].topics.dislikes = [{ label: "", value: "   " }, { label: " ", value: "" }];
  t.people[0].topics.activity = [{ label: "", value: "" }, { label: "参加のしかた", value: "" }, { label: "", value: "手を添える" }];   // 空の項目は出さず、中身のある項目だけ出す
  await startSession("sp-empty-topics", [t], "team_empty_topics");
  toStudentView("team_empty_topics");
  assert.deepStrictEqual(pageTitles(), [titleOf("communication"), titleOf("activity")]);   // 好き・苦手は中身が空なので出ない
  const from = app.innerHTML.indexOf('aria-labelledby="sp-topic-1"');
  const activity = app.innerHTML.slice(from, app.innerHTML.indexOf("</section>", from));   // 2つ目のトピック(一緒に活動するとき)の部分
  assert.ok(activity.includes("参加のしかた") && activity.includes("手を添える"));
  assert.strictEqual((app.innerHTML.match(/class="entry"/g) || []).length, 1 + 2);   // 伝え方1件 + 活動2件(空の項目1件は出ない)
  assert.ok(!app.innerHTML.includes(EMPTY));   // 中身のあるトピックがあれば、「公開された情報はありません」は出ない
});

test("固定の案内「いつもと様子がちがうと感じたら、すぐに付き添いの方かスタッフに伝えてください。」が、目立つ枠で出る。医療的な指示は含まない", async () => {
  await startSession("sp-pass-notice", [makeFullTeam(defs)], "team_full");   // 前のテストで別のチームに切り替えたので、作り直す
  toStudentView();
  const html = app.innerHTML;
  assert.strictEqual(get("STUDENT_NOTICE"), NOTICE);
  assert.ok(html.includes(`<aside class="sp-care" role="note">`) && html.includes(`<p>${NOTICE}</p>`));
  assert.ok(html.indexOf("sp-care") > html.indexOf("sp-topic-title"));   // トピックのあとにある
  for (const word of ["119", "救急", "薬", "吸引", "横向き", "安静", "病院", "医師に", "飲ま"]) assert.ok(!NOTICE.includes(word), word);   // 医療的な指示は書かない
});

test("公開されたトピックが1つもないとき:「まだ学生（一緒に参加する人）向けに公開された情報はありません」。固定の案内は、それでも出る", async () => {
  toStudentView("team_full", "p_sora");   // そらさんは、内容が空
  let html = app.innerHTML;
  assert.deepStrictEqual(pageTitles(), []);
  assert.ok(html.includes(`<p class="sp-empty" role="status">${EMPTY}</p>`) && html.includes(NOTICE));
  // 学生に見えるトピックがそもそもない人物(家族のみのトピックだけ)でも同じ
  const onlyMine = makeFullTeam(defs, "team_only_mine");
  onlyMine.people[0].topicDefs = [{ id: "mine", icon: "📌", title: "自作トピック", color: "#5B8DB8", desc: "" }];
  await startSession("sp-only-mine", [onlyMine], "team_only_mine");
  toStudentView("team_only_mine");
  html = app.innerHTML;
  assert.ok(html.includes(EMPTY) && html.includes(NOTICE) && !html.includes("自作の内容"));
  // 中身のあるトピックがあるときは、案内は出ない
  await startSession("sp-pass2", [makeFullTeam(defs)], "team_full");
  toStudentView();
  assert.ok(!app.innerHTML.includes(EMPTY));
});

test("カードの公開内容は見るだけ。端末メモ欄は使え、印刷・戻る・表示の切り替えも出る", async () => {
  toStudentView();
  const html = app.innerHTML;
  for (const act of EDIT_ACTS) assert.ok(!html.includes(`data-act="${act}"`), act);
  assert.ok(!html.includes("タップして名前・写真を編集") && !html.includes("トピックを整理") && !html.includes("トピックを追加"));
  assert.equal((html.match(/<textarea\b/g)||[]).length, 1);  // 共有されるカード内容の編集欄はなく、この端末のメモだけ
  assert.ok(html.includes("この端末だけのメモ"));
  for (const act of ["print", "back-list", "set-audience", "speak-topic"]) assert.ok(html.includes(`data-act="${act}"`), act);
  assert.ok(html.includes("カードの内容は変更できません。メモは下に書けます。") && html.includes('data-act="set-audience" data-v="student" aria-pressed="true"'));   // 公開内容は見るだけで、端末メモは編集できる
  assert.ok(!html.includes('class="hero"') && html.includes("sp-hero"));   // ヘッダーはボタン(編集の入口)ではない
});

test("編集の操作は、handle() を直接呼んでも通らない(学生向けの表示のあいだ)", async () => {
  const before = JSON.stringify(get("teams"));
  env.confirmAnswer = true;
  for (const [act, ds] of [["edit-person", {}], ["add-topic", {}], ["toggle-organize", {}], ["open-copyto", {}], ["start-edit", {}], ["del-topic", { id: "communication" }], ["move-up", { id: "activity" }]]) {
    await get(`handle(${JSON.stringify(act)},${JSON.stringify(ds)})`);
  }
  assert.ok(get("modal") === null && get("view.editing") === false && get("view.organize") === false);
  assert.strictEqual(JSON.stringify(get("teams")), before);
});

test("「表示: すべて」に切り替えると、タイルの画面に戻る。もう一度「学生向け」にすると、はじめましてページに戻る", async () => {
  await get(`handle("set-audience",{v:"all"})`);
  assert.ok(app.innerHTML.includes('class="grid"') && app.innerHTML.includes('data-act="toggle-organize"') && !app.innerHTML.includes("sp-hero"));
  await get(`handle("set-audience",{v:"staff"})`);
  assert.ok(app.innerHTML.includes('class="grid"') && !app.innerHTML.includes("sp-hero"));   // 運営向けは、従来どおりタイル
  await get(`handle("set-audience",{v:"student"})`);
  assert.ok(app.innerHTML.includes("sp-hero") && get("view.screen") === "person");
});

section("学生向けで受け取ったチームも、同じはじめましてページになる");

test("学生向けで受け取ったチームの人物ページは、はじめましてページ(帯・見るだけ・表示の切り替えなし)。ファイルに学生向けでないトピックが混ざっていても出さない", async () => {
  await startSession("sp-recv", [], null);
  const file = await makeShare(PASS, { team: makeFullTeam(defs, "team_src"), meta: { audience: "student", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-person",{id:"p_hana"})`);
  const html = app.innerHTML;
  assert.ok(get("viewAudience()") === "student" && html.includes("sp-hero") && !html.includes('class="grid"'));
  assert.ok(html.includes("受け取った情報（学生（一緒に参加する人）向け）") && html.includes("この端末では編集できません。"));
  assert.deepStrictEqual(pageTitles(), STUDENT_ORDER.map(titleOf));
  assert.ok(html.includes(NOTICE) && html.includes(`最終更新: ${fmtDay("2026-10-18T03:00:00.000Z")}`) && html.includes("はなさんのこと"));
  for (const act of [...EDIT_ACTS, "set-audience", "make-editable", "del-team"]) assert.ok(!html.includes(`data-act="${act}"`), act);
  assert.ok(!html.includes("emergencyの内容") && !html.includes("自作の内容"));
  await get(`handle("set-audience",{v:"all"})`);   // 切り替えもできない
  assert.ok(get("viewAudience()") === "student" && app.innerHTML.includes("sp-hero"));
});

test("学生向けで受け取ったチームで、公開されたものが1つもないカードは、案内と固定の案内を出す", async () => {
  await get(`handle("back-list",{})`);
  await get(`handle("open-person",{id:"p_sora"})`);
  assert.ok(app.innerHTML.includes(EMPTY) && app.innerHTML.includes(NOTICE) && app.innerHTML.includes("そらさんのこと"));
});

test("運営向け・すべてで受け取ったチームは、はじめましてページにならない(従来どおりのタイル)", async () => {
  for (const audience of ["staff", "all"]) {
    const file = await makeShare(PASS, { team: makeFullTeam(defs, `team_${audience}`), meta: { audience, createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
    assert.strictEqual(await importShare(file, PASS), 1);
    await get(`handle("open-person",{id:"p_hana"})`);
    assert.ok(app.innerHTML.includes('class="grid"') && !app.innerHTML.includes("sp-hero"), audience);
  }
});

section("読み上げは、トピックごとのボタンで(端末内の日本語音声だけ)");

test("各トピックに読み上げボタンがある。押すと、そのトピックだけを読み上げ、そのボタンが「止める」になる", async () => {
  await startSession("sp-speak", [makeFullTeam(defs)], "team_full");
  toStudentView();
  assert.strictEqual((app.innerHTML.match(/data-act="speak-topic"/g) || []).length, STUDENT_ORDER.length);
  for (const id of STUDENT_ORDER) assert.ok(app.innerHTML.includes(`data-act="speak-topic" data-id="${id}">${SPEAK}読み上げ</button>`), id);
  for (const id of STUDENT_ORDER) assert.ok(app.innerHTML.includes(`aria-label="${titleOf(id)}を読み上げる"`), id);   // 同じ文字のボタンが並ぶので、スクリーンリーダー用にトピック名を付ける
  env.voiceList = [{ name: "Kyoko", lang: "ja-JP", localService: true }];
  await get(`handle("speak-topic",{id:"activity"})`);
  assert.strictEqual(spoken.length, 1);
  assert.ok(spoken[0].text.startsWith(`はなさんの、${titleOf("activity")}`) && spoken[0].text.includes("activityの見出し。activityの内容") && !spoken[0].text.includes("communication"));
  assert.ok(get("speaking") === true && get("speakingTopicId") === "activity");
  assert.ok(app.innerHTML.includes(`data-act="speak-topic" data-id="activity">${STOP}止める</button>`) && app.innerHTML.includes(`data-act="speak-topic" data-id="communication">${SPEAK}読み上げ</button>`));
  assert.ok(app.innerHTML.includes(`aria-label="${titleOf("activity")}を止める"`) && app.innerHTML.includes(`aria-label="${titleOf("communication")}を読み上げる"`));
});

test("同じトピックをもう一度押すと止まる。別のトピックを押すと切り替わり、前の読み上げの終了通知で今の読み上げの状態が戻らない", async () => {
  const first = spoken.at(-1);
  await get(`handle("speak-topic",{id:"likes"})`);   // 別のトピックに切り替え
  const second = spoken.at(-1);
  assert.ok(spoken.length === 2 && second !== first && get("speakingTopicId") === "likes");
  first.onend(); first.onerror();   // 切り替え前の読み上げの終了通知(cancel の結果として届く)
  assert.ok(get("speaking") === true && get("speakingTopicId") === "likes");
  assert.ok(app.innerHTML.includes(`data-act="speak-topic" data-id="likes">${STOP}止める</button>`));
  const cancelsBefore = env.speechCancels;
  await get(`handle("speak-topic",{id:"likes"})`);   // 同じトピック:止める
  assert.ok(get("speaking") === false && get("speakingTopicId") === null && env.speechCancels === cancelsBefore + 1 && spoken.length === 2);
  assert.ok(!app.innerHTML.includes(STOP));
  await get(`handle("speak-topic",{id:"dislikes"})`);
  spoken.at(-1).onend();   // 読み終わると、ボタンが戻る
  assert.ok(get("speaking") === false && get("speakingTopicId") === null && !app.innerHTML.includes(STOP));
});

test("学生に見えないトピック・存在しないトピックは、読み上げない。表示を切り替える・画面を移ると、読み上げを止める", async () => {
  const before = spoken.length;
  await get(`handle("speak-topic",{id:"emergency"})`);
  await get(`handle("speak-topic",{id:"mine"})`);
  await get(`handle("speak-topic",{id:"unknown"})`);
  assert.strictEqual(spoken.length, before);
  await get(`handle("speak-topic",{id:"communication"})`);
  assert.strictEqual(get("speaking"), true);
  await get(`handle("set-audience",{v:"all"})`);
  assert.ok(get("speaking") === false && get("speakingTopicId") === null);   // 表示が変わると止まる
  await get(`handle("set-audience",{v:"student"})`);
  await get(`handle("speak-topic",{id:"communication"})`);
  await get(`handle("back-list",{})`);
  assert.strictEqual(get("speaking"), false);   // 画面を移ると止まる
});

test("端末内の日本語音声がないときは、読み上げず、案内を出す(従来と同じ文面)", async () => {
  env.voiceList = []; run(`voiceCache=[]`);
  toStudentView();
  const before = spoken.length, alertsBefore = alerts.length;
  await get(`handle("speak-topic",{id:"communication"})`);
  assert.ok(spoken.length === before && alerts.length === alertsBefore + 1 && get("speaking") === false);
  assert.strictEqual(alerts.at(-1), "この端末には、インターネットを使わない日本語の読み上げ音声が見つからないため、読み上げを使えません。");
});

section("印刷も、はじめましてページと同じ並び順と固定の案内");

test("学生向けの印刷:並び順がページと同じで、最後に固定の案内が入る。学生に見えないトピックは入らない", async () => {
  toStudentView();
  await get(`handle("print",{})`);
  const html = print.innerHTML;
  assert.ok(html.includes("<h1>はなさん のサポートカード（学生（一緒に参加する人）向け）</h1>"));   // 見出しに絵文字は付かない
  assert.deepStrictEqual(printTitles(), pageTitles());
  assert.deepStrictEqual(printTitles(), STUDENT_ORDER.map(titleOf));
  assert.ok(html.includes(`<div class="pr-care">${NOTICE}</div>`) && html.indexOf("pr-care") > html.lastIndexOf("pr-topic"));
  for (const hidden of ["emergencyの内容", "basicの内容", "自作の内容", "発作・緊急時"]) assert.ok(!html.includes(hidden), hidden);
});

test("topicDefs の順が違っていても、印刷はページと同じ順(自作の学生向けトピックは最後)", async () => {
  const t = makeFullTeam(defs, "team_print_order");
  t.people[0].topicDefs.find((d) => d.id === "mine").audience = ["student"];
  t.people[0].topicDefs.reverse();
  await startSession("sp-print", [t], "team_print_order");
  toStudentView("team_print_order");
  await get(`handle("print",{})`);
  assert.deepStrictEqual(printTitles(), pageTitles());
  assert.deepStrictEqual(printTitles(), [...STUDENT_ORDER.map(titleOf), "自作トピック"]);
});

test("公開されたものがないカードの印刷にも、案内と固定の案内が入る。すべて・運営向けの印刷には固定の案内は入らない", async () => {
  await startSession("sp-print2", [makeFullTeam(defs)], "team_full");
  toStudentView("team_full", "p_sora");
  await get(`handle("print",{})`);
  assert.ok(print.innerHTML.includes(EMPTY) && print.innerHTML.includes(NOTICE));
  for (const audience of ["all", "staff"]) {
    run(`stage="ready"; ${personView("team_full", "p_hana", audience)}`);
    await get(`handle("print",{})`);
    assert.ok(!print.innerHTML.includes(NOTICE) && !print.innerHTML.includes("pr-care") && !print.innerHTML.includes(EMPTY), audience);
  }
});

test("学生向けで受け取ったチームの印刷も、同じ並び順と固定の案内", async () => {
  await startSession("sp-print3", [], null);
  const file = await makeShare(PASS, { team: makeFullTeam(defs, "team_src2"), meta: { audience: "student", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-person",{id:"p_hana"})`);
  await get(`handle("print",{})`);
  assert.deepStrictEqual(printTitles(), STUDENT_ORDER.map(titleOf));
  assert.ok(print.innerHTML.includes(NOTICE) && !print.innerHTML.includes("emergencyの内容"));
});
