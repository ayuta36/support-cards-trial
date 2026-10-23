/* ============================================================
   tests/emergency-list.test.mjs ― 運営向け「緊急時の情報（全員分）」の一覧
   ------------------------------------------------------------
   対象:js/views.js の emergencyScreen・emergencyCard(とチーム画面のツールバーのボタン)、js/data.js の emergencyInfo、
        js/state.js の canSeeEmergency・currentScreen、js/actions.js の open-emergency(と、戻る操作 navBack・popstate)。
   仕様:チーム画面のツールバーに「緊急時の情報（全員分）」(緊急のアイコン付き。表示が「すべて」か「運営向け」のとき。受け取ったチームは
        source.audience が all か staff のとき。学生向けでは出さない)。押すと、人物ごとに、写真と名前、「発作・緊急時」(emergency)の全項目、
        「基本情報」(basic)のうち見出しに「連絡」を含む項目を並べる。記入がない(トピックがない・中身が空)ところには「記入なし（家族に確認してください）」、
        トピックはあるが、その相手に見せない設定のところには「運営スタッフには公開されていません（家族に確認してください）」。
        見るだけ。tel: のリンクは付けない。上部に「運営スタッフが状況を共有するためのもの。医療的な判断は付き添いの方と医療者が行う」と注記する。
        ※ホームから全チーム分を見る一覧は emergency-all.test.mjs。
   ※前のテストの結果を後のテストが使うため、順番を変えない。テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, app, startSession, makeShare, importShare, windowHandlers } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const PASS = "emergency-pass";
const BUTTON = "緊急時の情報（全員分）";
const ALERT = get(`icon("alert",18)`);   // ボタンの文字の前に付く、線の緊急のアイコン(絵文字ではない)
const NOTE = "この一覧は、運営スタッフが状況を共有するためのものです。医療的な判断は、付き添いの方と医療者が行います。";
const BLANK = "記入なし（家族に確認してください）";
const HIDDEN = "運営スタッフには公開されていません（家族に確認してください）";
const EDIT_ACTS = ["edit-person", "toggle-organize", "add-topic", "open-copyto", "start-edit", "add-person", "edit-team", "set-audience", "make-editable", "speak-topic", "print"];

// 4人のチーム:1人目は緊急も連絡先もある。2人目は何も書いていない。3人目は連絡先だけ。4人目は緊急だけ
const makeTeam = (id = "team_em") => {
  const base = (pid, name, extra = {}) => ({ id: pid, name, emoji: "🌸", note: "", photo: null, topicDefs: defs.map((d) => ({ ...d })), topics: {}, ...extra });
  return {
    id, name: "テーブルA", emoji: "🏠", color: "#2F8F83",
    people: [
      base("p1", "はなさん", { topics: {
        emergency: [{ label: "発作のサイン", value: "目が右上を向きます" }, { label: "まずしてほしいこと", value: "付き添いの方に伝えてください" }, { label: "", value: "見出しのない項目" }],
        basic: [{ label: "名前", value: "山田 はな" }, { label: "緊急連絡先", value: "母: 000-0000-0000" }, { label: "連絡の方法", value: "電話よりメールが確実です" }, { label: "呼ばれたい名前", value: "はなさん" }],
        communication: [{ label: "伝え方", value: "目を閉じると「はい」" }],
      } }),
      base("p2", "そらさん"),
      base("p3", "みどりさん", { photo: "data:image/jpeg;base64,AAAA", topics: { basic: [{ label: "連絡先", value: "父: 000-0000-0000" }, { label: "年齢", value: "二十代" }] } }),
      base("p4", "あおさん", { topics: { emergency: [{ label: "サイン", value: "顔が赤くなる" }], basic: [{ label: "名前", value: "青" }] } }),
    ],
  };
};
const cardOf = (html, name) => { const i = html.indexOf(`>${name}</h2>`); const s = html.indexOf('<section class="em-person"', html.lastIndexOf('<section class="em-person"', i)); const e = html.indexOf("</section>", i); return html.slice(s, e); };
const dataActs = (html) => [...new Set([...html.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]))];
const toList = (teamId) => run(`stage="ready"; view={teamId:${JSON.stringify(teamId)},screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:${JSON.stringify(get("initialAudience")(get(`teams.find(t=>t.id===${JSON.stringify(teamId)})`)))}}; modal=null; modalDraft=null; render()`);

section("チーム画面のツールバーのボタン");

test("自分のチーム(表示が「すべて」)のチーム画面に、「緊急時の情報（全員分）」ボタンが出る", async () => {
  await startSession("em-pass", [makeTeam()], "team_em");
  await get(`handle("enter-team",{id:"team_em"})`);
  const html = app.innerHTML;
  assert.ok(html.includes(`<button class="tool-btn em-btn" data-act="open-emergency">${ALERT}${BUTTON}</button>`));
  assert.ok(html.indexOf("open-emergency") < html.indexOf('data-act="share-team"'));   // ツールバーの先頭
});

test("学生向けの表示では出さない(表示を学生向けにした一覧、学生向けで受け取ったチーム)。運営向け・すべてで受け取ったチームには出る", async () => {
  run(`view.audience="student"; render()`);   // 自分のチームでも、学生向けの表示のときは出さない
  assert.ok(!app.innerHTML.includes('data-act="open-emergency"') && get("canSeeEmergency()") === false);
  run(`view.audience="staff"; render()`);
  assert.ok(app.innerHTML.includes('data-act="open-emergency"') && get("canSeeEmergency()") === true);
  run(`view.audience="all"; render()`);
  assert.ok(app.innerHTML.includes('data-act="open-emergency"'));
  const received = {};
  for (const audience of ["student", "staff", "all"]) {
    await startSession(`em-recv-${audience}`, [], null);
    const file = await makeShare(PASS, { team: makeTeam("team_src"), meta: { audience, createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
    assert.strictEqual(await importShare(file, PASS), 1);
    received[audience] = app.innerHTML.includes('data-act="open-emergency"');
  }
  assert.deepStrictEqual(received, { student: false, staff: true, all: true });
});

section("一覧の内容");

test("押すと緊急情報の一覧に移る。上部に注記があり、人物ごとに写真(なければ名前の最初の1文字)と名前が並ぶ", async () => {
  await startSession("em-pass2", [makeTeam()], "team_em");
  await get(`handle("enter-team",{id:"team_em"})`);
  await get(`handle("open-emergency",{})`);
  const html = app.innerHTML;
  assert.strictEqual(get("view.screen"), "emergency");
  assert.strictEqual(get("currentScreen()"), "emergency");
  assert.ok(html.includes(`<h1 class="list-title">${BUTTON}</h1>`) && html.includes(`<p class="em-note" role="note">${NOTE}</p>`));   // 題名に絵文字は付かない
  assert.ok(html.indexOf("em-note") < html.indexOf("em-person"));   // 注記は画面の上部
  const names = [...html.matchAll(/class="em-name" id="em-name-\d+">([^<]*)</g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ["はなさん", "そらさん", "みどりさん", "あおさん"]);   // チームの人物の順
  assert.ok(cardOf(html, "みどりさん").includes('<img src="data:image/jpeg;base64,AAAA"'));   // 写真
  assert.ok(cardOf(html, "はなさん").includes('style="width:52px;height:52px;font-size:26px">は</span>') && !cardOf(html, "はなさん").includes("🌸"));   // 写真がなければ、名前の最初の1文字(保存データの絵文字は出さない)
});

test("「発作・緊急時」の全項目と、「基本情報」のうち見出しに「連絡」を含む項目が出る(それ以外の基本情報・ほかのトピックは出ない)", async () => {
  const hana = cardOf(app.innerHTML, "はなさん");
  for (const text of ["発作のサイン", "目が右上を向きます", "まずしてほしいこと", "付き添いの方に伝えてください", "見出しのない項目"]) assert.ok(hana.includes(text), text);   // emergency の全項目
  for (const text of ["緊急連絡先", "母: 000-0000-0000", "連絡の方法", "電話よりメールが確実です"]) assert.ok(hana.includes(text), text);   // 見出しに「連絡」を含む
  for (const text of ["山田 はな", "呼ばれたい名前", "目を閉じると", "伝え方"]) assert.ok(!hana.includes(text), text);   // 基本情報のそれ以外、伝え方は出ない
  assert.ok(hana.includes("発作・緊急時") && hana.includes("連絡先"));   // 見出し
  assert.ok(hana.indexOf("発作のサイン") < hana.indexOf("緊急連絡先"));   // 緊急が先、連絡先があと
  assert.ok(!hana.includes(BLANK));
});

test("記入がない人には「記入なし（家族に確認してください）」と出る(1回だけ。見出しは出さない)", async () => {
  const sora = cardOf(app.innerHTML, "そらさん");
  assert.strictEqual(sora.split(BLANK).length - 1, 1);
  assert.ok(!sora.includes("em-sec") && !sora.includes("発作・緊急時") && !sora.includes('class="entry"'));
  assert.ok(sora.includes(`<p class="em-empty">${BLANK}</p>`));
});

test("片方だけ書いてある人は、書いてある方を出し、空の方に「記入なし（家族に確認してください）」と出す", async () => {
  const midori = cardOf(app.innerHTML, "みどりさん");   // 連絡先だけ
  assert.ok(midori.includes("父: 000-0000-0000") && !midori.includes("二十代") && midori.split(BLANK).length - 1 === 1);
  assert.ok(midori.indexOf("発作・緊急時") < midori.indexOf(BLANK) && midori.indexOf(BLANK) < midori.indexOf("連絡先</h3>"));   // 緊急のところが「記入なし」
  const ao = cardOf(app.innerHTML, "あおさん");   // 緊急だけ(基本情報に「連絡」の項目なし)
  assert.ok(ao.includes("顔が赤くなる") && !ao.includes("青") && ao.split(BLANK).length - 1 === 1);
  assert.ok(ao.indexOf("顔が赤くなる") < ao.indexOf(BLANK));   // 連絡先のところが「記入なし」
});

test("tel: のリンクを付けない(電話番号はただの文字)。リンクも入力欄もない", async () => {
  const html = app.innerHTML;
  assert.ok(html.includes("母: 000-0000-0000") && html.includes("父: 000-0000-0000"));   // 2人の電話番号(存在しない形のダミー)が、どちらもただの文字として出る
  assert.ok(!/tel:/i.test(html) && !/<a[\s>]/i.test(html) && !html.includes("href=") && !html.includes("<input") && !html.includes("<textarea"));
});

test("見るだけの画面:編集・印刷・読み上げなどの操作はなく、使える操作は「戻る」だけ", async () => {
  const acts = dataActs(app.innerHTML);
  assert.deepStrictEqual(acts, ["back-list"]);
  for (const act of EDIT_ACTS) assert.ok(!app.innerHTML.includes(`data-act="${act}"`), act);
  assert.ok(app.innerHTML.includes("← テーブルA の一覧"));
});

test("人物のいないチームでは、その案内が出る。見えないトピック(運営向けに見せない設定の緊急情報)は、「記入なし」ではなく「公開されていません」になる", async () => {
  const empty = makeTeam("team_none"); empty.people = [];
  const hidden = makeTeam("team_hidden");
  hidden.people[0].topicDefs.find((d) => d.id === "emergency").audience = ["student"];   // 運営には見せない設定
  await startSession("em-pass3", [empty, hidden], "team_none");
  toList("team_none"); await get(`handle("open-emergency",{})`);
  assert.ok(app.innerHTML.includes("このチームには、カードが含まれていません。") && !app.innerHTML.includes("em-person"));
  // 自分のチームでは、家族はすべて見られるので、公開先の設定にかかわらず出る
  toList("team_hidden"); await get(`handle("open-emergency",{})`);
  assert.ok(cardOf(app.innerHTML, "はなさん").includes("目が右上を向きます"));
  // 運営向けで受け取ったチーム(ファイルの中で、運営に見せない設定のトピック)は、運営に見せない
  await startSession("em-pass4", [], null);
  const file = await makeShare(PASS, { team: hidden, meta: { audience: "staff", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-emergency",{})`);
  const hana = cardOf(app.innerHTML, "はなさん");
  assert.ok(!hana.includes("目が右上を向きます") && hana.includes("母: 000-0000-0000"));   // 緊急は出ず、連絡先(基本情報は運営に見せる)は出る
  assert.ok(hana.includes(HIDDEN) && !hana.includes(BLANK));   // トピックはあるが見せない設定なので「記入なし」ではない(区別は emergency-all.test.mjs でも確かめる)
});

section("戻る・受け取ったチーム・学生向けでは開かない");

test("「戻る」でチーム画面(一覧)へ戻る。端末の「戻る」(popstate)でも一覧へ戻る", async () => {
  await startSession("em-pass5", [makeTeam()], "team_em");
  await get(`handle("enter-team",{id:"team_em"})`);
  await get(`handle("open-emergency",{})`);
  await get(`handle("back-list",{})`);
  assert.ok(get("view.screen") === "list" && get("stage") === "ready" && app.innerHTML.includes('data-act="open-emergency"') && app.innerHTML.includes("テーブルA"));
  await get(`handle("open-emergency",{})`);
  for (const fn of windowHandlers.popstate) await fn({ state: null });
  assert.ok(get("view.screen") === "list" && get("stage") === "ready");   // 一覧へ(ホームではない)
  for (const fn of windowHandlers.popstate) await fn({ state: null });
  assert.strictEqual(get("stage"), "home");   // もう一度でホームへ
});

test("学生向けの表示では、handle() を直接呼んでも開かない。view を緊急情報の一覧にしても、一覧を描く(学生向けには見せない)", async () => {
  await startSession("em-pass6", [makeTeam()], "team_em");
  run(`stage="ready"; view={teamId:"team_em",screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"student"}; render()`);
  await get(`handle("open-emergency",{})`);
  assert.strictEqual(get("view.screen"), "list");
  run(`view.screen="emergency"; render()`);
  assert.ok(!app.innerHTML.includes("em-person") && !app.innerHTML.includes("緊急時の情報（全員分）") && get("currentScreen()") === "list");
  // 学生向けで受け取ったチームも同じ
  await startSession("em-pass7", [], null);
  const file = await makeShare(PASS, { team: makeTeam("team_src"), meta: { audience: "student", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-emergency",{})`);
  assert.ok(get("view.screen") === "list" && !app.innerHTML.includes("em-person"));
});

test("運営向けで受け取ったチームでも開ける。帯が出て、見るだけ(編集の操作・make-editable は出ない)", async () => {
  await startSession("em-pass8", [], null);
  const file = await makeShare(PASS, { team: makeTeam("team_src"), meta: { audience: "staff", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-emergency",{})`);
  const html = app.innerHTML;
  assert.ok(get("view.screen") === "emergency" && html.includes("受け取った情報（運営スタッフ向け）") && html.includes("目が右上を向きます"));
  assert.ok(!html.includes('data-act="make-editable"') && !html.includes("tel:"));
  assert.deepStrictEqual(dataActs(html), ["back-list"]);
  await get(`handle("back-list",{})`);
  assert.ok(get("view.screen") === "list");
});

test("「すべて」で受け取ったチームでも開ける。一覧は見るだけのまま(帯はどの画面でも同じなので、「編集できるようにする」ボタンはある。編集の操作は通らない)", async () => {
  await startSession("em-pass9", [], null);
  const file = await makeShare(PASS, { team: makeTeam("team_src"), meta: { audience: "all", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-emergency",{})`);
  assert.ok(get("view.screen") === "emergency" && app.innerHTML.includes("母: 000-0000-0000"));
  assert.ok(app.innerHTML.includes('data-act="make-editable"'));   // 帯はどの画面でも同じ(見るだけの一覧に、ボタンだけが付く)
  const stateBefore = JSON.stringify(get("teams"));
  await get(`handle("start-edit",{})`); await get(`handle("edit-person",{})`);
  assert.strictEqual(JSON.stringify(get("teams")), stateBefore);
});

section("emergencyInfo(取り出しの関数)");

test("emergencyInfo は、その相手に見えるトピックだけから、emergency の全項目と、basic の「連絡」を含む項目を取り出す", async () => {
  const info = (person, audience) => plain(get("emergencyInfo")(person, audience));
  const p = makeTeam().people[0];
  let r = info(p, "all");
  assert.ok(r.emergency.entries.length === 3 && r.contact.entries.length === 2 && r.emergency.def.id === "emergency" && r.contact.def.id === "basic");
  assert.deepStrictEqual(r.contact.entries.map((e) => e.label), ["緊急連絡先", "連絡の方法"]);
  r = info(p, "student");   // 学生には見えない
  assert.ok(r.emergency.entries.length === 0 && r.contact.entries.length === 0 && r.emergency.def === null);
  r = info({ id: "x", name: "x" }, "all");   // topicDefs や topics がない人物でも例外にならない
  assert.deepStrictEqual(r, { emergency: { def: null, entries: [] }, contact: { def: null, entries: [] } });
  r = info({ id: "x", topicDefs: [{ id: "emergency" }], topics: { emergency: [{ label: "", value: "  " }, null, { label: "a", value: "" }] } }, "all");
  assert.deepStrictEqual(r.emergency.entries.map((e) => e.label), ["a"]);   // 中身のない項目は除く
});
