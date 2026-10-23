/* ============================================================
   tests/received-readonly.test.mjs ― 受け取った情報の閲覧モード
   ------------------------------------------------------------
   対象:js/actions.js の processImportFile(source の付与)と handle()(編集の操作の拒否・チームの削除)、
        js/data.js の isReceivedTeam・initialAudience、js/state.js の viewAudience・canEditCards、
        js/views.js の受け取った情報の帯・ホームの印・編集の操作を出さない画面(一覧・人物ページ・詳細)。
   ※前のテストの結果(取り込んだチームなど)を後のテストが使うため、順番を変えない。
     テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, personView, detailView, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, app, alerts, confirms, localStorage, startSession, makeShare, importShare } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const STORE = "support-card-local-v1";
const PASS = "recv-pass";
const CREATED = "2026-10-18T03:00:00.000Z";
const fmtDay = get("fmtDay");
const STUDENT_IDS = ["communication", "activity", "likes", "dislikes"];
const ALL_DEFAULT_IDS = defs.map((d) => d.id);

// 共有ファイル(のオブジェクト)を作る。meta を省略した古いファイルは、meta に null を渡す
const makeFile = (teamExtra = {}, meta = { audience: "student", createdAt: CREATED, appVersion: "1.0.0-local" }) =>
  makeShare(PASS, meta === null ? { team: { ...makeFullTeam(defs, "team_src"), ...teamExtra } } : { team: { ...makeFullTeam(defs, "team_src"), ...teamExtra }, meta });
const receivedTeam = () => plain(get("teams.at(-1)"));
const stateOf = () => JSON.stringify({ teams: get("teams"), store: localStorage.getItem(STORE), modal: get("modal"), editing: get("view.editing"), organize: get("view.organize"), screen: get("view.screen"), teamId: get("view.teamId") });

section("取り込むと、アプリが source({importedAt, createdAt, audience})を付ける");

test("meta のあるファイルを取り込むと、source に受け取った日時・作成日時・相手が入り、そのチームの一覧画面になる", async () => {
  await startSession("recv-session", [], null);
  const before = Date.now();
  assert.strictEqual(await importShare(await makeFile(), PASS), 1);
  const t = receivedTeam();
  assert.deepStrictEqual(Object.keys(t.source).sort(), ["audience", "createdAt", "importedAt"]);
  assert.ok(t.source.audience === "student" && t.source.createdAt === CREATED);
  assert.ok(new Date(t.source.importedAt).toISOString() === t.source.importedAt && Date.parse(t.source.importedAt) >= before && Date.parse(t.source.importedAt) <= Date.now());
  assert.ok(get("stage") === "ready" && get("view.screen") === "list" && get("view.teamId") === t.id && get("view.audience") === "student");
});

test("meta のない古いファイルは、audience が all、createdAt が null になる(閲覧モードになる)", async () => {
  assert.strictEqual(await importShare(await makeFile({}, null), PASS), 1);
  const t = receivedTeam();
  assert.ok(t.source.audience === "all" && t.source.createdAt === null && typeof t.source.importedAt === "string");
  assert.ok(get("isReceivedTeam")(get("teams.at(-1)")) === true && get("view.audience") === "all" && !app.innerHTML.includes('data-act="edit-team"') && !app.innerHTML.includes('data-act="add-person"'));
});

test("ファイルの中の source は無視する(アプリが付け直す)。古いファイルなら all・null、meta があればその値", async () => {
  const fake = { importedAt: "1999-01-01T00:00:00.000Z", createdAt: "1999-01-01T00:00:00.000Z", audience: "staff" };
  assert.strictEqual(await importShare(await makeFile({ source: fake }, null), PASS), 1);
  let t = receivedTeam();
  assert.ok(t.source.audience === "all" && t.source.createdAt === null && t.source.importedAt !== fake.importedAt && Date.parse(t.source.importedAt) > Date.parse("2020-01-01"));
  assert.strictEqual(await importShare(await makeFile({ source: fake }), PASS), 1);   // meta あり(学生向け)
  t = receivedTeam();
  assert.ok(t.source.audience === "student" && t.source.createdAt === CREATED && t.source.importedAt !== fake.importedAt);
  const people = await makeFile({ people: [{ id: "p1", name: "A", source: { audience: "staff" }, topicDefs: [], topics: {} }] }, null);
  assert.strictEqual(await importShare(people, PASS), 1);
  assert.ok(!("source" in receivedTeam().people[0]));
});

test("meta の値がおかしいときは、audience は all、createdAt は null にする", async () => {
  for (const meta of [{ audience: "admin", createdAt: "not a date" }, { audience: 5, createdAt: 123 }, "文字列", [], { audience: ["student"], createdAt: { x: 1 } }]) {
    assert.strictEqual(await importShare(await makeFile({}, meta), PASS), 1, JSON.stringify(meta));
    const t = receivedTeam();
    assert.ok(t.source.audience === "all" && t.source.createdAt === null, JSON.stringify(meta));
  }
});

test("source は保存データに入り、ロックして解錠しても残る(読み取り専用のまま)", async () => {
  await get("save()"); await get("lockNow()"); await get(`unlock("recv-session")`);
  assert.ok(get("stage") === "home" && get("teams").length >= 1 && get("teams.every(t=>isReceivedTeam(t))"));
  assert.ok(get("teams.some(t=>t.source.audience==='student'&&t.source.createdAt==='" + CREATED + "')"));
});

test("isReceivedTeam は、source があるチームだけ真(!!team.source)", async () => {
  const f = get("isReceivedTeam");
  assert.ok(f({ source: { audience: "all" } }) && f({ source: {} }) && !f({}) && !f({ source: null }) && !f(null) && !f(undefined));
});

section("受け取った情報の画面(帯・編集の操作を出さない)");

// 以降のテストの準備:自分のチーム(team_own)と、学生向けで受け取ったチームがある状態
let ownTeam, recvId, recvPersonId;
const OWN = () => makeFullTeam(defs, "team_own");

test("チーム一覧に、受け取った情報の帯が出る(相手の表示名・作成日・受け取った日・編集できないこと・修正の依頼・削除の方法)", async () => {
  ownTeam = OWN();
  await startSession("ro-session", [ownTeam], null);
  assert.strictEqual(await importShare(await makeFile(), PASS), 1);
  const t = receivedTeam(); recvId = t.id; recvPersonId = t.people[0].id;
  const html = app.innerHTML;
  assert.ok(html.includes("受け取った情報（学生（一緒に参加する人）向け）"));
  assert.ok(html.includes(`作成: ${fmtDay(CREATED)}。`) && html.includes(`受け取り: ${fmtDay(t.source.importedAt)}。`));
  assert.ok(html.includes("この端末では編集できません。内容の修正は、作成した人に依頼してください。"));
  assert.ok(html.includes("の「このチームを削除する」から削除してください（送った人の端末からは消せません）"));
  assert.ok(html.includes('role="note"'));
});

test("meta のない古いファイルの帯は、作成が「不明」、相手が「すべて」", async () => {
  assert.strictEqual(await importShare(await makeFile({}, null), PASS), 1);
  const html = app.innerHTML;
  assert.ok(html.includes("受け取った情報（すべて）") && html.includes("作成: 不明。") && html.includes("受け取り: "));
  await get(`handle("del-team",{})`);   // 後のテストに影響しないよう、この古いファイルのチームは削除しておく
  assert.ok(get("teams.length") === 2);
});

test("チーム一覧に、チーム編集・新しいカードを作るは出ない。共有・読み込み・設定・削除は出る", async () => {
  run(`stage="ready"; view={teamId:${JSON.stringify(recvId)},screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"student"}; render()`);
  const html = app.innerHTML;
  for (const act of ["edit-team", "add-person"]) assert.ok(!html.includes(`data-act="${act}"`), act);
  assert.ok(!html.includes("新しいカードを作る") && !html.includes("チーム編集"));
  for (const act of ["share-team", "import", "settings", "del-team", "open-person", "back-home"]) assert.ok(html.includes(`data-act="${act}"`), act);
});

test("自分のチームの一覧には、帯がなく、チーム編集・新しいカードを作るがある(従来どおり)", async () => {
  run(`view={teamId:"team_own",screen:"list",personId:null,topicId:null,editing:false,organize:false}; render()`);
  const html = app.innerHTML;
  assert.ok(!html.includes("受け取った情報") && html.includes('data-act="edit-team"') && html.includes('data-act="add-person"') && !html.includes('data-act="del-team"'));
});

test("人物ページにも帯が出る(削除ボタンは一覧だけ)。人物の編集・トピックの整理と追加・コピー・表示の切り替えは出ない。印刷は出る", async () => {
  await get(`handle("enter-team",{id:${JSON.stringify(recvId)}})`);
  await get(`handle("open-person",{id:${JSON.stringify(recvPersonId)}})`);
  const html = app.innerHTML;
  assert.ok(html.includes("受け取った情報（学生（一緒に参加する人）向け）") && html.includes("この端末では編集できません。") && html.includes("チーム一覧の「このチームを削除する」から削除してください"));
  assert.ok(!html.includes('data-act="del-team"'));
  for (const act of ["edit-person", "toggle-organize", "add-topic", "open-copyto", "set-audience"]) assert.ok(!html.includes(`data-act="${act}"`), act);
  assert.ok(!html.includes("タップして名前・写真を編集") && !html.includes("トピックを整理") && !html.includes("トピックを追加") && !html.includes("表示:"));
  assert.ok(html.includes('data-act="print"') && html.includes("はなさん") && html.includes(`最終更新: ${fmtDay("2026-10-18T03:00:00.000Z")}`));
});

test("詳細画面には「書きこむ」が出ない。内容と読み上げは見られる", async () => {
  await get(`handle("open-topic",{id:"communication"})`);
  const html = app.innerHTML;
  assert.ok(get("view.screen") === "detail" && !html.includes('data-act="start-edit"') && html.includes("communicationの内容") && html.includes('data-act="speak"'));
  await get(`handle("back-person",{})`);
});

test("表示は、受け取った相手に固定される(学生向けなら、学生向けのトピックだけ。ファイルに他のトピックが混ざっていても出さない)", async () => {
  const html = app.innerHTML;
  assert.strictEqual(get("viewAudience()"), "student");
  for (const id of STUDENT_IDS) assert.ok(html.includes(`data-id="${id}"`), id);
  for (const id of ["emergency", "basic", "meal", "care", "posture", "mine"]) assert.ok(!html.includes(`data-id="${id}"`), id);   // ファイルには全トピックが入っているが、学生向けの表示では出さない
  assert.ok(!html.includes("aud-chip"));   // バッジは「すべて」の表示のときだけ
  await get(`handle("open-topic",{id:"emergency"})`);   // 見えないトピックは開けない
  assert.strictEqual(get("view.screen"), "person");
  await get(`handle("set-audience",{v:"all"})`);   // 切り替えもできない
  assert.ok(get("view.audience") === "student" && get("viewAudience()") === "student");
});

test("すべてで受け取ったチームは、すべての表示で固定される(全トピックとバッジが出る。切り替えはない)", async () => {
  assert.strictEqual(await importShare(await makeFile({}, { audience: "all", createdAt: CREATED, appVersion: "x" }), PASS), 1);
  await get(`handle("open-person",{id:"p_hana"})`);
  const html = app.innerHTML;
  assert.ok(get("viewAudience()") === "all" && html.includes("受け取った情報（すべて）") && !html.includes('data-act="set-audience"'));
  for (const id of [...ALL_DEFAULT_IDS, "mine"]) assert.ok(html.includes(`data-id="${id}"`), id);
  assert.ok(html.includes("aud-chip") && !html.includes('data-act="toggle-organize"') && !html.includes('data-act="add-topic"'));
  await get(`handle("del-team",{})`);
});

test("運営向けで受け取ったチームは、運営向けの表示で固定される(自作のトピックは出ない)", async () => {
  assert.strictEqual(await importShare(await makeFile({}, { audience: "staff", createdAt: CREATED, appVersion: "x" }), PASS), 1);
  await get(`handle("open-person",{id:"p_hana"})`);
  const html = app.innerHTML;
  assert.ok(get("viewAudience()") === "staff" && html.includes("受け取った情報（運営スタッフ向け）"));
  for (const id of ALL_DEFAULT_IDS) assert.ok(html.includes(`data-id="${id}"`), id);
  assert.ok(!html.includes('data-id="mine"'));
  await get(`handle("del-team",{})`);
  await get(`handle("enter-team",{id:${JSON.stringify(recvId)}})`);
  assert.strictEqual(get("view.audience"), "student");   // チームに入ると、受け取った相手の値になる
});

test("ホーム画面のチームカードに、受け取ったチームだけ「受け取った情報」の印が付く", async () => {
  run(`stage="home"; view={teamId:null,screen:"list",personId:null,topicId:null,editing:false,organize:false}; render()`);
  const html = app.innerHTML;
  const card = (id) => { const i = html.indexOf(`data-id="${id}"`); return html.slice(i, html.indexOf("</button>", i)); };
  assert.ok(card(recvId).includes("受け取った情報") && !card("team_own").includes("受け取った情報"));
  assert.strictEqual(html.split("受け取った情報").length - 1, 1);
});

section("二重の防御:画面に出さないだけでなく、handle() を直接呼んでも拒否する");

const personScreen = () => run(`stage="ready"; ${personView(recvId, recvPersonId, "student")}; render()`);
// setup を実行してから handle を呼び、チーム・保存データ・画面の状態が変わらないことを確かめる
const untouched = async (setup, act, ds = {}) => {
  run(setup);
  const before = stateOf();
  await get(`handle(${JSON.stringify(act)},${JSON.stringify(ds)})`);
  assert.strictEqual(stateOf(), before, `${act} が受け取ったチームを変更した`);
};

test("人物の編集・カードの追加・書きこむ・トピックの追加/整理/並べ替え/削除・チーム編集・コピーを呼んでも、何も起きない", async () => {
  env.confirmAnswer = true;
  const person = `stage="ready"; ${personView(recvId, recvPersonId, "student")}; modal=null; modalDraft=null; render()`;
  const detail = `stage="ready"; ${detailView(recvId, recvPersonId, "communication", "student")}; modal=null; modalDraft=null; render()`;
  const list = `stage="ready"; view={teamId:${JSON.stringify(recvId)},screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"student"}; modal=null; modalDraft=null; render()`;
  for (const [setup, act, ds] of [
    [person, "edit-person", {}], [list, "add-person", {}], [detail, "start-edit", {}], [person, "add-topic", {}], [person, "toggle-organize", {}],
    [person, "del-topic", { id: "communication" }], [person, "move-up", { id: "activity" }], [person, "move-down", { id: "communication" }],
    [list, "edit-team", {}], [person, "open-copyto", {}], [person, "copy-card", { id: "team_own" }], [person, "set-audience", { v: "all" }],
    [person, "del-person", {}], [person, "pick-photo", {}], [person, "clear-photo", {}],
    [detail, "draft-add", {}], [detail, "draft-remove", { i: "0" }],
  ]) await untouched(setup, act, ds);
});

test("保存の操作(カード・トピック・チーム・書きこみの保存)を、下書きを用意して呼んでも、何も起きない", async () => {
  const modalSetup = (kind, draft) => `stage="ready"; ${personView(recvId, recvPersonId, "student")}; modal=${JSON.stringify(kind)}; modalDraft=${JSON.stringify(draft)}; render()`;
  await untouched(modalSetup("person", { id: recvPersonId, name: "書きかえた名前", emoji: "🐻", note: "x", photo: null }), "save-person");
  await untouched(modalSetup("person", { isNew: true, name: "追加された人", emoji: "🐻", note: "", photo: null }), "save-person");
  await untouched(modalSetup("topic", { title: "追加トピック", icon: "📌", color: "#5B8DB8" }), "save-topic");
  await untouched(modalSetup("team", { isNew: false, id: recvId, name: "乗っ取られた名前", emoji: "🎪", color: "#D9707E" }), "save-team-edit");
  await untouched(`stage="ready"; ${detailView(recvId, recvPersonId, "communication", "student")}; view.editing=true; draft=[{label:"書きかえ",value:"書きかえ"}]; draftAudience=["student"]; modal=null; render()`, "save-edit");
  const t = receivedTeam();
  assert.ok(t.people.length === 2 && t.name === "テストチーム" && t.people[0].name === "はなさん" && t.people[0].topics.communication[0].value === "communicationの内容");
});

test("対照:同じ操作は、自分のチームでは通る(上のテストが空振りでないことの確認)", async () => {
  run(`stage="ready"; ${personView("team_own", "p_hana", "all")}; modal=null; modalDraft=null; render()`);
  await get(`handle("edit-person",{})`); assert.strictEqual(get("modal"), "person");
  run(`modal=null; modalDraft=null`);
  await get(`handle("add-topic",{})`); assert.strictEqual(get("modal"), "topic");
  run(`modal=null; modalDraft=null`);
  await get(`handle("toggle-organize",{})`); assert.strictEqual(get("view.organize"), true);
  run(`view.organize=false`);
  run(`view={teamId:"team_own",screen:"list",personId:null,topicId:null,editing:false,organize:false}`);
  await get(`handle("edit-team",{})`); assert.strictEqual(get("modal"), "team");
  run(`modal=null; modalDraft=null; ${detailView("team_own", "p_hana", "communication")}`);
  await get(`handle("start-edit",{})`); assert.strictEqual(get("view.editing"), true);
  run(`view.editing=false`);
});

test("自分のチームから、受け取ったチームへカードをコピーすることもできない(コピー先の一覧に出ない・直接呼んでも追加されない)", async () => {
  run(`stage="ready"; ${personView("team_own", "p_hana", "all")}; modal=null; modalDraft=null; render()`);
  assert.ok(!app.innerHTML.includes('data-act="open-copyto"'));   // 他に自分のチームがない(相手は受け取ったチームだけ)ので、ボタンも出ない
  await get(`handle("open-copyto",{})`);   // 直接呼ぶと開くが、一覧に受け取ったチームは出ない
  assert.ok(get("modal") === "copyto" && !app.innerHTML.includes(`data-id="${recvId}"`) && !app.innerHTML.includes('data-act="copy-card"'));
  const before = JSON.stringify(receivedTeam());
  await get(`handle("copy-card",{id:${JSON.stringify(recvId)}})`);
  assert.strictEqual(JSON.stringify(receivedTeam()), before);
  await get(`handle("close-modal",{})`);
});

test("自分のチームがほかにもあれば、コピー先に出るのは自分のチームだけ(受け取ったチームは出ない)", async () => {
  run(`teams.push(${JSON.stringify(makeFullTeam(defs, "team_own2"))})`);
  run(`stage="ready"; ${personView("team_own", "p_hana", "all")}; render()`);
  assert.ok(app.innerHTML.includes('data-act="open-copyto"'));
  await get(`handle("open-copyto",{})`);
  assert.ok(app.innerHTML.includes('data-act="copy-card" data-id="team_own2"') && !app.innerHTML.includes(`data-id="${recvId}"`));
  await get(`handle("close-modal",{})`);
  run(`teams=teams.filter(t=>t.id!=="team_own2")`);
});

section("チームの削除(受け取ったチームは、1つだけでも削除できる)");

test("受け取ったチームは、チームが1つしかなくても削除できる。確認の文言に「この端末から削除します。送った人の端末やファイルからは消えません」を含む", async () => {
  await startSession("del-session", [], null);
  assert.strictEqual(await importShare(await makeFile(), PASS), 1);
  assert.strictEqual(get("teams.length"), 1);
  const confirmsBefore = confirms.length;
  env.confirmAnswer = true;
  await get(`handle("del-team",{})`);
  assert.strictEqual(confirms.length, confirmsBefore + 1);
  assert.ok(confirms.at(-1).includes("この端末から削除します。送った人の端末やファイルからは消えません"));
  assert.ok(get("teams.length") === 0 && get("stage") === "home" && get("view.teamId") === null);
  assert.ok(get("persistedTeams.length") === 0);
  await get("lockNow()"); await get(`unlock("del-session")`);
  assert.strictEqual(get("teams.length"), 0);   // 保存データからも消えている
});

test("確認で「いいえ」を選ぶと削除しない。保存に失敗したときも、チームは残る", async () => {
  await startSession("del-session2", [], null);
  assert.strictEqual(await importShare(await makeFile(), PASS), 1);
  env.confirmAnswer = false;
  await get(`handle("del-team",{})`);
  assert.strictEqual(get("teams.length"), 1);
  env.confirmAnswer = true; env.failStoreWrites = true;
  const alertsBefore = alerts.length;
  await get(`handle("del-team",{})`);
  env.failStoreWrites = false;
  assert.ok(get("teams.length") === 1 && alerts.length === alertsBefore + 1 && get("stage") === "ready");
});

test("自分で作ったチームは、従来どおり、2つ以上あるときだけ削除できる(1つだけなら、確認も出ず、削除されない)", async () => {
  await startSession("del-session3", [OWN()], "team_own");
  env.confirmAnswer = true;
  const confirmsBefore = confirms.length;
  await get(`handle("del-team",{})`);
  assert.ok(get("teams.length") === 1 && confirms.length === confirmsBefore);
  run(`teams.push(${JSON.stringify(makeFullTeam(defs, "team_own2"))})`);
  await get(`handle("del-team",{})`);
  assert.ok(get("teams.length") === 1 && get("teams[0].id") === "team_own2" && confirms.length === confirmsBefore + 1);
  assert.ok(confirms.at(-1).includes("この端末に保存されたチームとカードが消えます") && !confirms.at(-1).includes("送った人の端末"));
});

test("自分のチームの編集画面には、チームが1つだけのとき削除ボタンが出ない。2つ以上なら出る(従来どおり)", async () => {
  run(`stage="ready"; view={teamId:"team_own2",screen:"list",personId:null,topicId:null,editing:false,organize:false}; modal="team"; modalDraft={isNew:false,id:"team_own2",name:"x",emoji:"🏠",color:"#3D7399"}; render()`);
  assert.ok(!app.innerHTML.includes('data-act="del-team"'));
  run(`teams.push(${JSON.stringify(makeFullTeam(defs, "team_own3"))}); render()`);
  assert.ok(app.innerHTML.includes('data-act="del-team"'));
  run(`modal=null; modalDraft=null`);
});
