/* ============================================================
   tests/share-audience.test.mjs ― 相手別の書き出しと印刷
   ------------------------------------------------------------
   対象:js/views.js の share-preflight(書き出す相手の選択・内容一覧・警告文)と buildPrint、
        js/actions.js の share-team・share-audience・share-proceed(相手で絞って暗号化・meta・受け取ったチームの上限)・print。
   ※前のテストの結果(書き出したファイルなど)を後のテストが使うため、順番を変えない。
     テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, listView, personView, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, context, app, print, prompts, downloads, imported, alerts, startSession, importShare, exportShare } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const STUDENT_IDS = ["communication", "activity", "likes", "dislikes"];
const ALL_DEFAULT_IDS = defs.map((d) => d.id);
const PASS = "share-pass";
const decryptFile = async (file, pass = PASS) => plain(await get("decryptShared")(file, pass));   // 暗号化された中身 { team, meta }
const modalHtml = () => { const h = app.innerHTML; return h.slice(h.indexOf('id="share-preflight-dialog"')); };   // 共有前の確認画面の部分だけ
const fmtDay = get("fmtDay");

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let studentFile, studentInner, startedAt, finishedAt, staffFile, allFile;

section("共有前の確認画面(書き出す相手の選択)");

test("確認画面の上部に、書き出す相手のラジオボタンが3つあり、初期値は学生向け(選べる中で最も範囲が狭いもの)", async () => {
  await startSession("share-session", [makeFullTeam(defs)], "team_full");
  await get(`handle("share-team",{})`);
  const html = modalHtml();
  assert.strictEqual(get("shareAudience"), "student");
  assert.strictEqual((html.match(/type="radio" name="share-aud"/g) || []).length, 3);
  assert.ok(html.includes('data-v="student" checked>') && !html.includes('data-v="staff" checked>') && !html.includes('data-v="all" checked>'));
  for (const label of ["学生（一緒に参加する人）向け", "運営スタッフ向け", "すべて（家族どうし・控え用）"]) assert.ok(html.includes(`<span>${label}</span>`), label);
  assert.ok(!html.includes(" disabled>"));   // 自分のチームは、3つとも選べる
  assert.ok(html.indexOf("書き出す相手") > html.indexOf("共有する内容を確認") && html.indexOf("書き出す相手") < html.indexOf('class="share-people"'));   // 内容の一覧より上にある
  assert.ok(html.includes("名前・ひとこと・写真・最終更新日は、どの相手にも含まれます") && html.includes("ひとことに医療情報などを書くと、そのまま共有されます"));
});

test("相手を切り替えると、下の内容一覧が、その相手に渡る内容に更新される(学生向け・運営向け・すべて)", async () => {
  const titleOf = (id) => defs.find((d) => d.id === id).title;
  const list = async (v) => { await get(`handle("share-audience",{v:${JSON.stringify(v)}})`); return modalHtml(); };

  const student = await list("student");
  for (const id of STUDENT_IDS) assert.ok(student.includes(titleOf(id)), id);
  for (const id of ["emergency", "basic", "meal", "care", "posture"]) assert.ok(!student.includes(titleOf(id)), id);
  assert.ok(!student.includes("自作トピック") && !student.includes("一覧にない保存済みトピック"));
  assert.ok(student.includes('data-v="student" checked>') && !student.includes('data-v="all" checked>'));

  const staff = await list("staff");
  for (const id of ALL_DEFAULT_IDS) assert.ok(staff.includes(titleOf(id)), id);
  assert.ok(!staff.includes("自作トピック") && !staff.includes("一覧にない保存済みトピック"));   // 家族のみのトピックと、一覧にないトピックは運営向けにも入らない
  assert.ok(staff.includes('data-v="staff" checked>') && !staff.includes('data-v="student" checked>'));

  const all = await list("all");
  for (const id of ALL_DEFAULT_IDS) assert.ok(all.includes(titleOf(id)), id);
  assert.ok(all.includes("自作トピック") && all.includes("一覧にない保存済みトピック 1件") && all.includes('data-v="all" checked>'));

  assert.strictEqual(get("shareAudience"), "all");
  const back = await list("student");   // 学生向けに戻すと、一覧も戻る
  assert.ok(!back.includes(titleOf("emergency")) && back.includes(titleOf("communication")));
});

test("既存の警告文は残り、「選択した一部だけに絞る機能はありません」は「選んだ相手に見せるトピックだけが入ります」に改まる", async () => {
  const copyWarning = "受け取った人には独立したコピーが追加されます。この端末で後から編集・削除しても、相手のコピーには反映されず、相手側のコピーも消えません。ファイルとパスコードは別の方法で相手に渡してください。";
  for (const v of ["student", "staff", "all"]) {
    await get(`handle("share-audience",{v:${JSON.stringify(v)}})`);
    const html = modalHtml();
    assert.ok(html.includes(copyWarning), v);
    assert.ok(html.includes("選んだ相手に見せるトピックだけが入ります。") && !html.includes("選択した一部だけに絞る機能はありません"), v);
  }
});

test("「すべて」以外では全データ・全情報とは書かず、渡す相手を明示する。「すべて」では従来の説明が出る", async () => {
  await get(`handle("share-audience",{v:"student"})`);
  const student = modalHtml();
  assert.ok(student.includes("学生（一緒に参加する人）に見せるトピックだけを暗号化ファイルに書き出します。") && !student.includes("全データ") && !student.includes("全情報"));
  await get(`handle("share-audience",{v:"all"})`);
  const all = modalHtml();
  assert.ok(all.includes("チームの全データを暗号化ファイルに書き出します。") && all.includes("チーム内の全情報が対象です"));
  await get(`handle("close-modal",{})`);
});

test("共有前の確認画面を開き直すと、書き出す相手は学生向けに戻る", async () => {
  await get(`handle("share-team",{})`);
  assert.strictEqual(get("shareAudience"), "student");
  await get(`handle("share-audience",{v:"staff"})`);
  await get(`handle("close-modal",{})`);
  await get(`handle("share-team",{})`);
  assert.strictEqual(get("shareAudience"), "student");
  await get(`handle("close-modal",{})`);
});

test("確認画面では、知らない相手は選べない(選択はそのまま)", async () => {
  await get(`handle("share-team",{})`);
  for (const bad of ["family", "", "ALL", undefined]) { await get(`handle("share-audience",{v:${JSON.stringify(bad)}})`); assert.strictEqual(get("shareAudience"), "student", String(bad)); }
  await get(`handle("close-modal",{})`);
});

section("相手で絞って書き出す");

test("学生向けに書き出したファイルを復号すると、学生向けのトピックだけが入っている(緊急・基本・食事・医療的ケア・姿勢・自作・一覧にないトピックは入らない)", async () => {
  startedAt = Date.now();
  studentFile = await exportShare("team_full", PASS, "student");
  finishedAt = Date.now();
  studentInner = await decryptFile(studentFile);
  const [hana, sora] = studentInner.team.people;
  assert.deepStrictEqual(hana.topicDefs.map((d) => d.id), STUDENT_IDS);
  assert.deepStrictEqual(Object.keys(hana.topics), STUDENT_IDS);
  assert.deepStrictEqual(sora.topicDefs.map((d) => d.id), STUDENT_IDS);   // 2人目も絞り込まれる
  for (const id of ["emergency", "basic", "meal", "care", "posture", "mine", "orphan"]) assert.ok(!(id in hana.topics) && !hana.topicDefs.some((d) => d.id === id), id);
  const text = JSON.stringify(studentInner.team);
  for (const secret of ["emergencyの内容", "basicの内容", "careの内容", "mealの内容", "postureの内容", "自作の内容", "一覧にない内容"]) assert.ok(!text.includes(secret), secret);
  assert.ok(hana.name === "はなさん" && hana.note === "音楽が好き" && hana.updatedAt === "2026-10-18T03:00:00.000Z" && studentInner.team.name === "テストチーム");
});

test("meta({audience, createdAt, appVersion})は、暗号化された中身にだけあり、外側のJSONには平文で出ない。外側の形式は変わらない", async () => {
  assert.deepStrictEqual(Object.keys(studentFile), ["app", "type", "v", "salt", "iv", "data"]);
  assert.ok(studentFile.app === "support-card" && studentFile.type === "team-share" && studentFile.v === 1);
  const outer = JSON.stringify(studentFile);
  for (const word of ["audience", "createdAt", "appVersion"]) assert.ok(!outer.includes(word), word);
  assert.ok(!("meta" in studentFile) && !("audience" in studentFile) && !("createdAt" in studentFile));
  const meta = studentInner.meta;
  assert.deepStrictEqual(Object.keys(meta).sort(), ["appVersion", "audience", "createdAt"]);
  assert.strictEqual(meta.audience, "student");
  assert.strictEqual(meta.appVersion, get("APP_VERSION"));
  assert.ok(new Date(meta.createdAt).toISOString() === meta.createdAt && Date.parse(meta.createdAt) >= startedAt && Date.parse(meta.createdAt) <= finishedAt);
});

test("運営向けに書き出すと、運営に見せるトピック(緊急を含む)が入り、自作トピックと一覧にないトピックは入らない", async () => {
  staffFile = await exportShare("team_full", PASS, "staff");
  const inner = await decryptFile(staffFile);
  const hana = inner.team.people[0];
  assert.deepStrictEqual(hana.topicDefs.map((d) => d.id), ALL_DEFAULT_IDS);
  assert.deepStrictEqual(Object.keys(hana.topics), ALL_DEFAULT_IDS);
  assert.ok(JSON.stringify(inner.team).includes("emergencyの内容") && !JSON.stringify(inner.team).includes("自作の内容"));
  assert.strictEqual(inner.meta.audience, "staff");
});

test("すべてで書き出すと、従来どおりチーム全体(自作トピック・一覧にないトピックも)が入る", async () => {
  allFile = await exportShare("team_full", PASS, "all");
  const inner = await decryptFile(allFile);
  assert.strictEqual(JSON.stringify(inner.team), JSON.stringify(makeFullTeam(defs)));
  assert.strictEqual(inner.meta.audience, "all");
  assert.deepStrictEqual(Object.keys(allFile), ["app", "type", "v", "salt", "iv", "data"]);
});

test("相手を選ばずに「確認して書き出す」と、初期値の学生向けで書き出す", async () => {
  const file = await exportShare("team_full", PASS);
  const inner = await decryptFile(file);
  assert.deepStrictEqual(inner.team.people[0].topicDefs.map((d) => d.id), STUDENT_IDS);
  assert.strictEqual(inner.meta.audience, "student");
});

test("公開先を明示したトピックは、その設定どおりに相手別のファイルへ入る(緊急を学生にも見せる設定・伝え方を家族のみにする設定)", async () => {
  const custom = makeFullTeam(defs, "team_custom");
  custom.people[0].topicDefs.find((d) => d.id === "emergency").audience = ["student", "staff"];
  custom.people[0].topicDefs.find((d) => d.id === "communication").audience = [];
  custom.people[0].topicDefs.find((d) => d.id === "mine").audience = ["student"];
  await startSession("custom-session", [custom], "team_custom");
  const student = await decryptFile(await exportShare("team_custom", PASS, "student"));
  assert.deepStrictEqual(student.team.people[0].topicDefs.map((d) => d.id), ["emergency", "activity", "likes", "dislikes", "mine"]);
  const staff = await decryptFile(await exportShare("team_custom", PASS, "staff"));
  assert.ok(!staff.team.people[0].topicDefs.some((d) => d.id === "communication" || d.id === "mine") && staff.team.people[0].topicDefs.some((d) => d.id === "emergency"));
});

test("承認した内容のスナップショットを書き出す(確認後に公開先や内容を変えても、反映されない)", async () => {
  await startSession("snap-session", [makeFullTeam(defs)], "team_full");
  run(`stage="ready"; ${listView("team_full")}`);
  await get(`handle("share-team",{})`);   // 初期値の学生向けで承認する
  env.promptAnswer = PASS;
  context.__realDerive = get("deriveKey");
  let signal; const waiting = new Promise((resolve) => { signal = resolve; });
  context.__started = signal;
  run(`deriveKey=async (...args)=>{ globalThis.__started(); await new Promise(resolve=>globalThis.__release=resolve); return globalThis.__realDerive(...args); }`);
  const pending = get(`handle("share-proceed",{})`);
  await waiting;
  run(`teams[0].people[0].topicDefs.find(d=>d.id==="emergency").audience=["student","staff"]; teams[0].people[0].topics.communication[0].value="確認後に書きかえた"`);
  context.__release();
  await pending;
  run(`deriveKey=globalThis.__realDerive`);
  await get(`handle("share-download",{})`);
  const inner = await decryptFile(get("parseShareMarkdown")(await imported.at(-1).text()));
  assert.deepStrictEqual(inner.team.people[0].topicDefs.map((d) => d.id), STUDENT_IDS);
  assert.strictEqual(inner.team.people[0].topics.communication[0].value, "communicationの内容");
  assert.ok(!JSON.stringify(inner.team).includes("emergencyの内容") && inner.meta.audience === "student");
});

test("パスコードを決めた後、暗号化の途中でロックすると、書き出さない(セッションの確認は維持)", async () => {
  await startSession("lock-session2", [makeFullTeam(defs)], "team_full");
  run(`stage="ready"; ${listView("team_full")}`);
  await get(`handle("share-team",{})`);
  env.promptAnswer = PASS;
  context.__realDerive = get("deriveKey");
  let signal; const waiting = new Promise((resolve) => { signal = resolve; });
  context.__started = signal;
  run(`deriveKey=async (...args)=>{ globalThis.__started(); await new Promise(resolve=>globalThis.__release=resolve); return globalThis.__realDerive(...args); }`);
  const before = downloads.length;
  const pending = get(`handle("share-proceed",{})`);
  await waiting;
  await get("lockNow()");
  context.__release();
  await pending;
  run(`deriveKey=globalThis.__realDerive`);
  assert.strictEqual(downloads.length, before);
});

test("共有ファイルの保存後はファイルとパスコードを別の方法で渡すよう案内する", async () => {
  await startSession("alert-session", [makeFullTeam(defs)], "team_full");
  assert.ok(await exportShare("team_full", PASS, "student"));
  assert.ok(alerts.at(-1).includes(".md"));
  assert.ok(alerts.at(-1).includes("パスコードは別の方法で相手に伝えてください"));
});

section("受け取ったチームから書き出すときは、受け取った範囲より広い相手を選べない");

const radioState = (html, id) => (html.match(new RegExp(`data-v="${id}"( checked)?( disabled)?>`)) || []);
// 共有ファイルを取り込んで(受け取ったチームになる)、そのチームの共有前の確認画面を開く。tag は端末パスコードの区別用
const receiveAndOpen = async (file, tag) => {
  await startSession(`recv-${tag}`, [], null);
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("share-team",{})`);
};

test("往復:学生向けのファイルを取り込むと、学生向けとして受け取った情報になる(受け取った日時・作成日時・内容)", async () => {
  await startSession("recv-student-session", [], null);
  const before = Date.now();
  assert.strictEqual(await importShare(studentFile, PASS), 1);
  const nt = plain(get("teams.at(-1)"));
  assert.strictEqual(nt.source.audience, "student");
  assert.strictEqual(nt.source.createdAt, studentInner.meta.createdAt);
  assert.ok(Date.parse(nt.source.importedAt) >= before && Date.parse(nt.source.importedAt) <= Date.now());
  assert.deepStrictEqual(nt.people[0].topicDefs.map((d) => d.id), STUDENT_IDS);
});

test("学生向けで受け取ったチームは、学生向けだけを選べる(運営向け・すべては選べない)", async () => {
  await receiveAndOpen(studentFile, "student");
  const html = modalHtml();
  assert.strictEqual(get("shareAudience"), "student");
  assert.ok(radioState(html, "student").length && !radioState(html, "student")[2]);   // 学生向けは選べる
  assert.ok(radioState(html, "staff")[2] && radioState(html, "all")[2]);              // 運営向け・すべては disabled
  assert.ok(html.includes("それより広い相手には書き出せません"));
  for (const v of ["staff", "all"]) { await get(`handle("share-audience",{v:"${v}"})`); assert.strictEqual(get("shareAudience"), "student", v); }
});

test("選べない相手が内部で指定されても(状態を直接書き換えても)、書き出さない", async () => {
  run(`shareAudience="all"`);
  env.promptAnswer = PASS;
  const downloadsBefore = downloads.length, promptsBefore = prompts.length;
  await get(`handle("share-proceed",{})`);
  assert.ok(downloads.length === downloadsBefore && prompts.length === promptsBefore);
  run(`shareAudience="staff"`);
  await get(`handle("share-proceed",{})`);
  assert.ok(downloads.length === downloadsBefore && prompts.length === promptsBefore);
  assert.strictEqual(get("modal"), "share-preflight");   // 確認画面は開いたまま
  run(`shareAudience="student"`);
  await get(`handle("close-modal",{})`);
});

test("運営向けで受け取ったチームは、運営向けと学生向けを選べる(すべては選べない)", async () => {
  await receiveAndOpen(staffFile, "staff");
  const html = modalHtml();
  assert.ok(!radioState(html, "student")[2] && !radioState(html, "staff")[2] && radioState(html, "all")[2]);
  await get(`handle("share-audience",{v:"all"})`);
  assert.strictEqual(get("shareAudience"), "student");
  await get(`handle("share-audience",{v:"staff"})`);
  assert.strictEqual(get("shareAudience"), "staff");
  await get(`handle("close-modal",{})`);
});

test("運営向けで受け取ったチームから、学生向けに絞って書き出せる(学生向けのトピックだけ。source は入らない)", async () => {
  const received = get("teams.at(-1).id");
  const file = await exportShare(received, PASS, "student");
  const inner = await decryptFile(file);
  assert.deepStrictEqual(inner.team.people[0].topicDefs.map((d) => d.id), STUDENT_IDS);
  assert.strictEqual(inner.meta.audience, "student");
  assert.ok(!("source" in inner.team) && !JSON.stringify(inner.team).includes("importedAt") && !JSON.stringify(inner.team).includes("emergencyの内容"));
});

test("すべてで受け取ったチームは、3つとも選べる。そこから運営向けに書き出すと、運営に見せるトピックだけが入る", async () => {
  await receiveAndOpen(allFile, "all");
  const html = modalHtml();
  assert.ok(!html.includes(" disabled>") && !html.includes("それより広い相手には書き出せません"));
  await get(`handle("close-modal",{})`);
  const inner = await decryptFile(await exportShare(get("teams.at(-1).id"), PASS, "staff"));
  assert.deepStrictEqual(inner.team.people[0].topicDefs.map((d) => d.id), ALL_DEFAULT_IDS);
  assert.ok(!JSON.stringify(inner.team).includes("自作の内容") && !JSON.stringify(inner.team).includes("一覧にない内容"));   // 家族のみのトピックは、すべてで受け取っても運営向けには入らない
});

test("meta のない古いファイル(すべて扱い)から受け取ったチームも、3つとも選べる", async () => {
  const oldFile = await env.makeShare(PASS, { team: makeFullTeam(defs, "team_old_file") });   // meta なし
  await receiveAndOpen(oldFile, "oldfile");
  assert.ok(!modalHtml().includes(" disabled>") && get("teams.at(-1).source.audience") === "all");
  await get(`handle("close-modal",{})`);
});

section("印刷は、今の表示の相手に見える内容だけ。見出しに相手・印刷日・最終更新日を入れる");

let printCalls = 0;
context.window.print = () => { printCalls++; };

test("すべて: 全部を印刷し、見出しに「（すべて）」、注記に印刷日と最終更新日が入る", async () => {
  await startSession("print-session", [makeFullTeam(defs)], "team_full");
  run(personView("team_full", "p_hana", "all"));
  await get(`handle("print",{})`);
  const html = print.innerHTML;
  assert.strictEqual(printCalls, 1);
  assert.ok(html.includes("<h1>はなさん のサポートカード（すべて）</h1>"));
  assert.ok(html.includes(`印刷日:${new Date().toLocaleDateString("ja-JP")}`) && html.includes(`最終更新:${fmtDay("2026-10-18T03:00:00.000Z")}`));
  assert.ok(html.includes("発作・緊急時") && html.includes("emergencyの内容") && html.includes("自作の内容") && html.includes("communicationの内容"));
  assert.ok(!html.includes("一覧にない内容"));   // 一覧にないトピックは、従来どおり印刷しない
});

test("学生向け: 学生向けのトピックだけを印刷し、見出しに「（学生（一緒に参加する人）向け）」が入る", async () => {
  run(personView("team_full", "p_hana", "student"));
  await get(`handle("print",{})`);
  const html = print.innerHTML;
  assert.ok(html.includes("<h1>はなさん のサポートカード（学生（一緒に参加する人）向け）</h1>"));
  assert.ok(html.includes("communicationの内容") && html.includes("likesの内容") && html.includes("activityの内容"));
  for (const hidden of ["emergencyの内容", "basicの内容", "careの内容", "自作の内容", "発作・緊急時", "自作トピック"]) assert.ok(!html.includes(hidden), hidden);
  assert.ok(html.includes("最終更新:"));
});

test("運営向け: 運営に見せるトピック(緊急を含む)を印刷し、見出しに「（運営スタッフ向け）」が入る。自作トピックは印刷しない", async () => {
  run(personView("team_full", "p_hana", "staff"));
  await get(`handle("print",{})`);
  const html = print.innerHTML;
  assert.ok(html.includes("のサポートカード（運営スタッフ向け）</h1>") && html.includes("emergencyの内容") && !html.includes("自作の内容"));
});

test("最終更新日がない人物では、最終更新を印刷しない。印刷日は入る", async () => {
  run(personView("team_full", "p_sora", "all"));
  await get(`handle("print",{})`);
  assert.ok(!print.innerHTML.includes("最終更新") && print.innerHTML.includes("印刷日:"));
});

test("受け取ったチームは、受け取った相手の表示で印刷する(学生向けで受け取ったら、学生向けの内容だけ)", async () => {
  const mixed = makeFullTeam(defs, "team_mixed");   // 学生向けと名乗っているが、運営向けのトピックも混ざっているファイル
  const file = await env.makeShare(PASS, { team: mixed, meta: { audience: "student", createdAt: "2026-10-18T03:00:00.000Z", appVersion: "x" } });
  await startSession("print-recv-session", [], null);
  assert.strictEqual(await importShare(file, PASS), 1);
  await get(`handle("open-person",{id:"p_hana"})`);
  await get(`handle("print",{})`);
  const html = print.innerHTML;
  assert.ok(html.includes("のサポートカード（学生（一緒に参加する人）向け）</h1>") && html.includes("communicationの内容"));
  for (const hidden of ["emergencyの内容", "basicの内容", "自作の内容"]) assert.ok(!html.includes(hidden), hidden);
});
