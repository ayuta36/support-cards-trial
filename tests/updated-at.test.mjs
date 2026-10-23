/* ============================================================
   tests/updated-at.test.mjs ― 人物の最終更新日(updatedAt)
   ------------------------------------------------------------
   対象:js/actions.js の save-edit・save-person・save-topic・del-topic・move-up/move-down(保存の成功時に updatedAt を更新)、
        js/state.js の save()(失敗して元に戻すときは updatedAt も戻る)、
        js/views.js の人物ページのヒーローと印刷の「最終更新: 10/19」(値がなければ出さない)。
   ※各テストは、直前の状態を引き継いで進む。テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, personView, detailView, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, app, print, alerts, startSession, makeShare, importShare } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const OLD = "2000-01-01T00:00:00.000Z";
const fmtDay = get("fmtDay");
const stamp = (i = 0) => get(`teams[0].people[${i}].updatedAt`);
const isFresh = (iso, t0) => typeof iso === "string" && new Date(iso).toISOString() === iso && Date.parse(iso) >= t0 && Date.parse(iso) <= Date.now();
// 最終更新を古い日付にそろえて保存する(保存済みのデータも古い日付になる。失敗時に戻る先もここ)
const resetStamp = async () => { run(`teams[0].people[0].updatedAt=${JSON.stringify(OLD)}`); assert.strictEqual(await get("save()"), true); };
const toPerson = () => run(`${personView("team_u", "p_hana")}; modal=null; modalDraft=null; render()`);
const toDetail = (topicId) => run(`${detailView("team_u", "p_hana", topicId)}; modal=null; modalDraft=null; render()`);

section("updatedAt:保存が成功したときに更新される");

test("書きこむ(save-edit)の保存で更新される", async () => {
  await startSession("stamp-session", [makeFullTeam(defs, "team_u")], "team_u");
  await resetStamp();
  toDetail("communication");
  await get(`handle("start-edit",{})`);
  assert.strictEqual(stamp(), OLD);   // 編集を始めただけでは更新しない
  run(`draft[0].value="書きかえた内容"`);
  const t0 = Date.now();
  await get(`handle("save-edit",{})`);
  assert.ok(isFresh(stamp(), t0) && get("teams[0].people[0].topics.communication[0].value") === "書きかえた内容");
  assert.ok(isFresh(plain(get("persistedTeams"))[0].people[0].updatedAt, t0));   // 保存データにも入っている
});

test("名前・写真・ひとこと(save-person)の保存で更新される", async () => {
  await resetStamp();
  toPerson();
  await get(`handle("edit-person",{})`);
  run(`modalDraft.name="名前を変えた"; modalDraft.note="ひとこと変更"; modalDraft.photo="data:image/png;base64,AAAA"`);
  const t0 = Date.now();
  await get(`handle("save-person",{})`);
  assert.ok(isFresh(stamp(), t0) && get("teams[0].people[0].name") === "名前を変えた" && get("teams[0].people[0].photo") === "data:image/png;base64,AAAA");
});

test("新しいカードを作ったときにも、最終更新が付く(そのカードの作成日)", async () => {
  toPerson();
  await get(`handle("add-person",{})`);
  run(`modalDraft.name="新しい人"`);
  const t0 = Date.now();
  await get(`handle("save-person",{})`);
  const created = plain(get("teams[0].people.at(-1)"));
  assert.ok(created.name === "新しい人" && isFresh(created.updatedAt, t0));
});

test("トピックの追加(save-topic)の保存で更新される", async () => {
  await resetStamp();
  toPerson();
  await get(`handle("add-topic",{})`);
  run(`modalDraft.title="睡眠"`);
  const t0 = Date.now();
  await get(`handle("save-topic",{})`);
  assert.ok(isFresh(stamp(), t0) && plain(get("teams[0].people[0].topicDefs")).some((d) => d.title === "睡眠"));
});

test("トピックの削除(del-topic)の保存で更新される", async () => {
  await resetStamp();
  toPerson();
  env.confirmAnswer = true;
  const t0 = Date.now();
  await get(`handle("del-topic",{id:"mine"})`);
  assert.ok(isFresh(stamp(), t0) && !plain(get("teams[0].people[0].topicDefs")).some((d) => d.id === "mine"));
});

test("トピックの並べ替え(move-up・move-down)の保存で、それぞれ更新される", async () => {
  const order = () => plain(get("teams[0].people[0].topicDefs")).map((d) => d.id);
  await resetStamp();
  toPerson();
  let t0 = Date.now();
  await get(`handle("move-up",{id:"basic"})`);
  assert.ok(isFresh(stamp(), t0) && order()[0] === "basic");
  await resetStamp();
  t0 = Date.now();
  await get(`handle("move-down",{id:"basic"})`);
  assert.ok(isFresh(stamp(), t0) && order()[0] === "emergency");
});

test("公開先の変更だけを保存したときも更新される", async () => {
  await resetStamp();
  toDetail("likes");
  await get(`handle("start-edit",{})`);
  run(`draftAudience=["staff"]`);
  const t0 = Date.now();
  await get(`handle("save-edit",{})`);
  assert.ok(isFresh(stamp(), t0) && plain(get("teams[0].people[0].topicDefs")).find((d) => d.id === "likes").audience.join() === "staff");
});

test("読むだけの操作(開く・戻る・表示の切り替え・やめる・印刷・共有画面)では、更新されない", async () => {
  await resetStamp();
  env.context.window.print = () => {};
  toPerson();
  await get(`handle("set-audience",{v:"student"})`); await get(`handle("set-audience",{v:"all"})`);
  await get(`handle("open-topic",{id:"likes"})`);
  await get(`handle("start-edit",{})`); await get(`handle("cancel-edit",{})`);
  await get(`handle("back-person",{})`);
  await get(`handle("print",{})`);
  await get(`handle("back-list",{})`); await get(`handle("open-person",{id:"p_hana"})`);
  await get(`handle("share-team",{})`); await get(`handle("close-modal",{})`);
  assert.strictEqual(stamp(), OLD);
});

section("updatedAt:保存に失敗したら、元に戻る");

// 保存に失敗する状態で operate() を実行し、最終更新とデータが元の保存済みの値に戻ることを確かめる
const failing = async (operate, dataIsBack) => {
  await resetStamp();
  const alertsBefore = alerts.length;
  env.failStoreWrites = true;
  try { await operate(); } finally { env.failStoreWrites = false; }
  assert.strictEqual(stamp(), OLD);
  assert.ok(dataIsBack());
  assert.strictEqual(alerts.length, alertsBefore + 1);
};

test("書きこむの保存に失敗すると、最終更新も内容も公開先も元に戻る(書きこみの画面は開いたまま)", async () => {
  toDetail("communication");
  const contentBefore = JSON.stringify(plain(get("teams[0].people[0].topics.communication")));
  await resetStamp();
  await get(`handle("start-edit",{})`);
  run(`draft[0].value="保存されない内容"; draftAudience=[]`);
  const alertsBefore = alerts.length;
  env.failStoreWrites = true;
  await get(`handle("save-edit",{})`);
  env.failStoreWrites = false;
  assert.strictEqual(stamp(), OLD);
  assert.strictEqual(JSON.stringify(plain(get("teams[0].people[0].topics.communication"))), contentBefore);
  assert.ok(!("audience" in plain(get("teams[0].people[0].topicDefs")).find((d) => d.id === "communication")));
  assert.ok(alerts.length === alertsBefore + 1 && get("view.editing") === true);
  await get(`handle("cancel-edit",{})`);
});

test("名前・写真・ひとこと/トピックの追加・削除・並べ替えの保存に失敗しても、最終更新が元に戻る", async () => {
  toPerson();
  const nameBefore = get("teams[0].people[0].name");
  await failing(async () => { await get(`handle("edit-person",{})`); run(`modalDraft.name="保存されない名前"`); await get(`handle("save-person",{})`); }, () => get("teams[0].people[0].name") === nameBefore);
  run(`modal=null; modalDraft=null`);
  const topicsBefore = get("teams[0].people[0].topicDefs.length");
  await failing(async () => { await get(`handle("add-topic",{})`); run(`modalDraft.title="保存されないトピック"`); await get(`handle("save-topic",{})`); }, () => get("teams[0].people[0].topicDefs.length") === topicsBefore);
  run(`modal=null; modalDraft=null`);
  env.confirmAnswer = true;
  await failing(async () => { await get(`handle("del-topic",{id:"likes"})`); }, () => plain(get("teams[0].people[0].topicDefs")).some((d) => d.id === "likes") && get("teams[0].people[0].topics.likes.length") === 1);
  const first = get("teams[0].people[0].topicDefs[0].id");
  await failing(async () => { await get(`handle("move-down",{id:${JSON.stringify(first)}})`); }, () => get("teams[0].people[0].topicDefs[0].id") === first);
});

section("updatedAt:表示(ヒーローと印刷)");

test("人物ページのヒーローに「最終更新: 月/日」が出る", async () => {
  run(`teams[0].people[0].updatedAt="2026-10-18T03:00:00.000Z"`);
  toPerson();
  assert.ok(app.innerHTML.includes(`<span class="hero-updated" style="display:block">最終更新: ${fmtDay("2026-10-18T03:00:00.000Z")}</span>`));
  assert.ok(/最終更新: \d{1,2}\/\d{1,2}</.test(app.innerHTML));
});

test("値がない人物には、最終更新を表示しない(古いデータ)", async () => {
  run(`delete teams[0].people[0].updatedAt`);
  toPerson();
  assert.ok(!app.innerHTML.includes("最終更新"));
  run(`teams[0].people[0].updatedAt="not a date"`);   // 読み取れない値も出さない
  toPerson();
  assert.ok(!app.innerHTML.includes("最終更新"));
});

test("印刷にも「最終更新:月/日」が入る。値がなければ入らない", async () => {
  run(`teams[0].people[0].updatedAt="2026-10-18T03:00:00.000Z"`);
  toPerson();
  await get(`handle("print",{})`);
  assert.ok(print.innerHTML.includes(`最終更新:${fmtDay("2026-10-18T03:00:00.000Z")}`) && print.innerHTML.includes("印刷日:"));
  run(`delete teams[0].people[0].updatedAt`);
  await get(`handle("print",{})`);
  assert.ok(!print.innerHTML.includes("最終更新"));
});

test("取り込んだカードの最終更新は、そのまま表示される(読み取れない値は捨てる)", async () => {
  const team = makeFullTeam(defs, "team_src");
  team.people[1].updatedAt = "ゴミの値";
  const file = await makeShare("stamp-pass", { team, meta: { audience: "all", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  assert.strictEqual(await importShare(file, "stamp-pass"), 1);
  const imported = plain(get("teams.at(-1)"));
  assert.strictEqual(imported.people[0].updatedAt, "2026-10-18T03:00:00.000Z");
  assert.ok(!("updatedAt" in imported.people[1]));
  await get(`handle("open-person",{id:"p_hana"})`);
  assert.ok(app.innerHTML.includes(`最終更新: ${fmtDay("2026-10-18T03:00:00.000Z")}`));
});
