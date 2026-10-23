/* ============================================================
   tests/restore-own-backup.test.mjs ― 自分の控えから戻したチームを、編集できるようにする
   ------------------------------------------------------------
   対象:js/actions.js の handle("make-editable")(確認 → source を削除 → 保存)、
        js/data.js の canRestoreOwnBackup、js/views.js の受け取った情報の帯のボタン。
   背景:「すべて(家族どうし・控え用)」で書き出したファイルを読み込むと source が付き、通常は編集できない。
        自分の控えから復元した場合に編集できないと、端末内データの復旧後に内容を更新できない。
        source.audience が "all" の受け取ったチームに限り、帯のボタンで通常のチームに戻せるようにする。
        学生向け・運営向けで受け取ったチーム(一部だけのデータ)には、ボタンを出さず、handle() でも拒否する。
   ※前のテストの結果を後のテストが使うことがある。テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, personView, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, app, alerts, confirms, localStorage, startSession, makeShare, importShare } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const STORE = "support-card-local-v1";
const PASS = "restore-pass";
const CREATED = "2026-10-18T03:00:00.000Z";
const CONFIRM_TEXT = "受け取ったすべての情報を、この端末で編集できるようにします。このアプリは、ファイルの作成者や、あなた自身の控えかどうかを確認できません。編集内容はこの端末だけに保存され、元のファイルや送った人の端末とは同期しません。よろしいですか？";
const BUTTON_LABEL = "この端末で編集する（「すべて」の受け取り）";
const EDIT_ACTS = ["edit-team", "add-person"];

// 共有ファイルを受け取る。audience が null のときは、meta のない古いファイル(すべて扱い)
const receive = async (audience) => {
  const content = { team: makeFullTeam(defs, "team_src") };
  if (audience) content.meta = { audience, createdAt: CREATED, appVersion: "x" };
  assert.strictEqual(await importShare(await makeShare(PASS, content), PASS), 1);
  return plain(get("teams.at(-1)"));
};
const storedTeams = async () => plain((await get("decryptJson")(JSON.parse(localStorage.getItem(STORE)), get("cryptoKey"))).teams);
const lastTeam = () => plain(get("teams.at(-1)"));
const snapshot = () => JSON.stringify({ teams: get("teams"), store: localStorage.getItem(STORE), screen: get("view.screen"), stage: get("stage") });

section("「すべて」で受け取ったチームの帯に、編集できるようにするボタンが出る");

test("「すべて」で受け取ったチームは、一覧の帯にこの端末で編集するボタンが出る(編集の操作はまだ出ない)", async () => {
  await startSession("restore-session", [], null);
  const t = await receive("all");
  assert.strictEqual(t.source.audience, "all");
  const html = app.innerHTML;
  assert.ok(html.includes('data-act="make-editable"') && html.includes(`>${BUTTON_LABEL}</button>`));
  assert.ok(html.includes("この端末では編集できません。内容の修正は、作成した人に依頼してください。"));   // 帯の説明は従来どおり
  for (const act of EDIT_ACTS) assert.ok(!html.includes(`data-act="${act}"`), act);
});

test("人物ページの帯にも、ボタンが出る(「すべて」で受け取った人物ページは、従来どおりのタイル表示で、編集の操作は出ない)", async () => {
  await get(`handle("open-person",{id:"p_hana"})`);
  const html = app.innerHTML;
  assert.ok(html.includes('data-act="make-editable"') && get("viewAudience()") === "all");
  for (const act of ["edit-person", "toggle-organize", "add-topic", "set-audience"]) assert.ok(!html.includes(`data-act="${act}"`), act);
  await get(`handle("back-list",{})`);
  await get(`handle("del-team",{})`);   // 後のテストに影響しないよう、受け取ったチームは削除しておく
  assert.strictEqual(get("teams.length"), 0);
});

test("meta のない古いファイル(すべて扱い)から受け取ったチームにも、ボタンが出る", async () => {
  await receive(null);
  assert.ok(get("teams.at(-1).source.audience") === "all" && app.innerHTML.includes('data-act="make-editable"'));
  await get(`handle("del-team",{})`);   // 後のテストに影響しないよう、削除しておく
});

test("学生向け・運営向けで受け取ったチームには、ボタンが出ない(一覧にも人物ページにも)", async () => {
  for (const audience of ["student", "staff"]) {
    await receive(audience);
    assert.ok(!app.innerHTML.includes('data-act="make-editable"') && !app.innerHTML.includes("この端末で編集する"), `${audience}:一覧`);
    await get(`handle("open-person",{id:"p_hana"})`);
    assert.ok(!app.innerHTML.includes('data-act="make-editable"'), `${audience}:人物ページ`);
    await get(`handle("del-team",{})`);
  }
});

test("自分で作ったチームには、帯もボタンも出ない", async () => {
  run(`teams.push(${JSON.stringify(makeFullTeam(defs, "team_own"))}); stage="ready"; view={teamId:"team_own",screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}; render()`);
  assert.ok(!app.innerHTML.includes("受け取った情報") && !app.innerHTML.includes('data-act="make-editable"'));
  run(`teams=teams.filter(t=>t.id!=="team_own")`);
});

section("確認してOKすると、source を削除して保存し、通常のチームとして扱う");

test("確認の文面は仕様どおり。OKすると source が消えて保存され、保存データにも source が残らない", async () => {
  const t = await receive("all");
  env.confirmAnswer = true;
  const before = confirms.length;
  await get(`handle("make-editable",{})`);
  assert.strictEqual(confirms.length, before + 1);
  assert.strictEqual(confirms.at(-1), CONFIRM_TEXT);
  const now = lastTeam();
  assert.ok(!("source" in now) && now.id === t.id && now.name === t.name && now.people.length === t.people.length);   // 中身は変わらない
  assert.ok(get("isReceivedTeam")(get("teams.at(-1)")) === false);
  assert.ok(!("source" in plain(get("persistedTeams.at(-1)"))));
  const stored = await storedTeams();   // 端末の保存データ(暗号化)を読み戻しても、source がない
  assert.ok(stored.length === get("teams.length") && stored.every((s) => !("source" in s)));
});

test("編集できるようになる:帯が消え、チーム編集・新しいカードを作る・共有が出る(従来の自分のチームと同じ)", async () => {
  const html = app.innerHTML;
  assert.ok(!html.includes("受け取った情報") && !html.includes('data-act="make-editable"') && !html.includes("この端末では編集できません"));
  for (const act of ["edit-team", "add-person", "share-team", "open-person"]) assert.ok(html.includes(`data-act="${act}"`), act);
  await get(`handle("open-person",{id:"p_hana"})`);
  const person = app.innerHTML;
  assert.ok(get("canEditCards()") === true);
  for (const act of ["edit-person", "toggle-organize", "add-topic", "set-audience"]) assert.ok(person.includes(`data-act="${act}"`), act);
  await get(`handle("back-list",{})`);
});

test("実際に編集できる(チームの名前変更・トピックの書きこみが保存される)", async () => {
  await get(`handle("edit-team",{})`);
  assert.strictEqual(get("modal"), "team");
  run(`modalDraft.name="戻したチーム"`);
  await get(`handle("save-team-edit",{})`);
  assert.strictEqual(get("teams.at(-1).name"), "戻したチーム");
  await get(`handle("open-person",{id:"p_hana"})`);
  await get(`handle("open-topic",{id:"communication"})`);
  await get(`handle("start-edit",{})`);
  assert.strictEqual(get("view.editing"), true);
  run(`draft[0].value="控えから戻して書きかえた"`);
  await get(`handle("save-edit",{})`);
  assert.strictEqual(get("teams.at(-1).people[0].topics.communication[0].value"), "控えから戻して書きかえた");
  assert.strictEqual((await storedTeams()).at(-1).people[0].topics.communication[0].value, "控えから戻して書きかえた");
});

test("ロックして解錠しても、通常のチームのまま(source は戻らない)。削除の扱いも自分のチームと同じ(1つだけなら削除できない)", async () => {
  await get("lockNow()"); await get(`unlock("restore-session")`);
  assert.ok(get("stage") === "home" && get("teams.every(t=>!isReceivedTeam(t))"));
  run(`teams=[teams.at(-1)]; stage="ready"; view={teamId:teams[0].id,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}`);
  const confirmsBefore = confirms.length;
  await get(`handle("del-team",{})`);   // 自分のチームは、最後の1つを削除できない(確認も出ない)
  assert.ok(get("teams.length") === 1 && confirms.length === confirmsBefore);
});

section("やめる・拒否・保存の失敗では、何も変わらない");

test("確認で「キャンセル」すると、source は残り、保存データも画面も変わらない", async () => {
  await receive("all");
  const before = snapshot();
  env.confirmAnswer = false;
  const confirmsBefore = confirms.length;
  await get(`handle("make-editable",{})`);
  env.confirmAnswer = true;
  assert.strictEqual(confirms.length, confirmsBefore + 1);   // 確認は出た
  assert.strictEqual(snapshot(), before);
  assert.ok(get("teams.at(-1).source.audience") === "all" && app.innerHTML.includes('data-act="make-editable"') && !app.innerHTML.includes('data-act="edit-team"'));
});

test("学生向け・運営向けで受け取ったチームは、handle() を直接呼んでも拒否される(確認も出ず、source も残る)", async () => {
  for (const audience of ["student", "staff"]) {
    await receive(audience);
    env.confirmAnswer = true;
    const before = snapshot(), confirmsBefore = confirms.length;
    await get(`handle("make-editable",{})`);
    assert.strictEqual(confirms.length, confirmsBefore, `${audience}:確認を出さない`);
    assert.strictEqual(snapshot(), before, `${audience}:何も変わらない`);
    assert.ok(get("teams.at(-1).source.audience") === audience);
    assert.ok(get("canRestoreOwnBackup")(get("teams.at(-1)")) === false);
    await get(`handle("del-team",{})`);
  }
});

test("自分のチーム(source なし)や、チームを開いていないときに呼んでも、何も起きない", async () => {
  run(`teams.push(${JSON.stringify(makeFullTeam(defs, "team_own"))}); stage="ready"; view={teamId:"team_own",screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}`);
  const confirmsBefore = confirms.length, teamsBefore = JSON.stringify(get("teams"));
  await get(`handle("make-editable",{})`);
  run(`stage="home"; view={teamId:null,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}`);
  await get(`handle("make-editable",{})`);
  assert.ok(confirms.length === confirmsBefore && JSON.stringify(get("teams")) === teamsBefore);
  run(`teams=teams.filter(t=>t.id!=="team_own")`);
});

test("保存に失敗したら、編集できるようにならない(source が残り、読み取り専用のまま。失敗の案内が出る)", async () => {
  run(`stage="ready"; view={teamId:teams.at(-1).id,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}; render()`);
  assert.ok(get("teams.at(-1).source.audience") === "all");
  env.confirmAnswer = true; env.failStoreWrites = true;
  const alertsBefore = alerts.length;
  await get(`handle("make-editable",{})`);
  env.failStoreWrites = false;
  assert.strictEqual(alerts.length, alertsBefore + 1);
  assert.ok(get("teams.at(-1).source.audience") === "all" && get("canEditCards()") === false);
  assert.ok(app.innerHTML.includes('data-act="make-editable"') && !app.innerHTML.includes('data-act="edit-team"'));
  const stored = await storedTeams();
  assert.ok(stored.at(-1).source && stored.at(-1).source.audience === "all");   // 保存データにも source が残っている
});

test("その後、保存に成功する状態でやり直すと、編集できるようになる", async () => {
  env.confirmAnswer = true;
  await get(`handle("make-editable",{})`);
  assert.ok(!("source" in lastTeam()) && get("canEditCards()") === true && app.innerHTML.includes('data-act="edit-team"'));
});

test("対照:書き出しの範囲は、元に戻らない(戻したチームは自分のチームなので、3つの相手をすべて選べる)", async () => {
  await get(`handle("share-team",{})`);
  assert.ok(!app.innerHTML.includes(" disabled>") && !app.innerHTML.includes("それより広い相手には書き出せません"));
  await get(`handle("close-modal",{})`);
});
