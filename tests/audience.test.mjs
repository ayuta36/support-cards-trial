/* ============================================================
   tests/audience.test.mjs ― 相手別の公開設定
   ------------------------------------------------------------
   対象:js/constants.js の AUDIENCES・DEFAULT_AUDIENCE・DEFAULT_TOPICS(activity)、
        js/data.js の topicAudience・isTopicVisible・filterPersonForAudience・filterTeamForAudience・
        sanitizeImportedTeam(audience・updatedAt・source)・sanitizeShareMeta、
        js/views.js の人物ページ(表示の切り替え・バッジ・相手別の表示)と、トピックの編集モードの公開先の欄、
        js/actions.js の set-audience・open-topic・start-edit・save-edit・cancel-edit。
   ※後半は、アプリの状態を順に使う。テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, sameData, personView, detailView, makeFullTeam } from "./harness.mjs";

const env = createApp();
const { run, get, app, startSession } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const topicAudience = get("topicAudience"), isTopicVisible = get("isTopicVisible");
const filterPerson = get("filterPersonForAudience"), filterTeam = get("filterTeamForAudience");
const sanitize = get("sanitizeImportedTeam"), sanitizeMeta = get("sanitizeShareMeta");
const aud = (def) => plain(topicAudience(def));   // vm内で作った配列を、比較しやすい普通の配列にする
const topicIds = (person) => plain(person.topicDefs).map((d) => d.id);
const STUDENT_IDS = ["communication", "activity", "likes", "dislikes"];
const STAFF_ONLY_IDS = ["emergency", "basic", "meal", "care", "posture"];

section("公開先の初期値と判定(topicAudience・isTopicVisible)");

test("既定のトピックの公開先の初期値は、仕様どおり(緊急・基本・食事・医療的ケア・姿勢は運営だけ、伝え方・活動・好き・苦手は学生と運営)", async () => {
  for (const id of STAFF_ONLY_IDS) assert.deepStrictEqual(aud({ id }), ["staff"], id);
  for (const id of STUDENT_IDS) assert.deepStrictEqual(aud({ id }), ["student", "staff"], id);
  assert.deepStrictEqual(Object.keys(plain(get("DEFAULT_AUDIENCE"))).sort(), defs.map((d) => d.id).sort());   // 既定のトピックすべてに初期値がある(過不足なし)
});

test("自作トピック(初期値にないID)は家族のみ([])。constructor・__proto__ など prototype のキーも拾わない", async () => {
  assert.deepStrictEqual(aud({ id: "abc1234" }), []);
  assert.deepStrictEqual(aud({ id: "constructor" }), []);
  assert.deepStrictEqual(aud({ id: "__proto__" }), []);
  assert.deepStrictEqual(aud({ id: "toString" }), []);
  assert.deepStrictEqual(aud({}), []);
  assert.deepStrictEqual(aud(null), []);
  assert.deepStrictEqual(aud(undefined), []);
});

test("def.audience が配列なら、その中の知っているIDだけを返す(未知のID・文字列でない値は除く)。初期値より優先される", async () => {
  assert.deepStrictEqual(aud({ id: "x", audience: ["student", "teacher", "staff"] }), ["student", "staff"]);
  assert.deepStrictEqual(aud({ id: "x", audience: ["admin", "STUDENT", 5, null, {}, ["student"]] }), []);
  assert.deepStrictEqual(aud({ id: "x", audience: ["staff", "staff", "student"] }), ["staff", "student"]);   // 重複は1つにまとめる
  assert.deepStrictEqual(aud({ id: "emergency", audience: ["student"] }), ["student"]);   // 明示した値が初期値(staff)より優先される
  assert.deepStrictEqual(aud({ id: "communication", audience: [] }), []);   // 空の配列は家族のみ
});

test("def.audience が配列でなければ(文字列・オブジェクト・null)初期値を使う", async () => {
  assert.deepStrictEqual(aud({ id: "emergency", audience: "student" }), ["staff"]);
  assert.deepStrictEqual(aud({ id: "likes", audience: { 0: "staff" } }), ["student", "staff"]);
  assert.deepStrictEqual(aud({ id: "likes", audience: null }), ["student", "staff"]);
  assert.deepStrictEqual(aud({ id: "mine", audience: "staff" }), []);
});

test("topicAudience が返す配列を書き換えても、初期値の定数は変わらない", async () => {
  const a = topicAudience({ id: "emergency" }); a.push("student");
  assert.deepStrictEqual(aud({ id: "emergency" }), ["staff"]);
});

test("isTopicVisible は、all なら何でも見える。学生・運営は、topicAudience に含まれるときだけ", async () => {
  assert.ok(isTopicVisible({ id: "emergency" }, "all") && isTopicVisible({ id: "mine" }, "all") && isTopicVisible({ id: "mine", audience: [] }, "all"));
  assert.ok(isTopicVisible({ id: "communication" }, "student") && isTopicVisible({ id: "activity" }, "student"));
  assert.ok(!isTopicVisible({ id: "emergency" }, "student") && !isTopicVisible({ id: "basic" }, "student") && !isTopicVisible({ id: "mine" }, "student"));
  assert.ok(isTopicVisible({ id: "emergency" }, "staff") && isTopicVisible({ id: "likes" }, "staff") && !isTopicVisible({ id: "mine" }, "staff"));
  assert.ok(isTopicVisible({ id: "mine", audience: ["student"] }, "student") && !isTopicVisible({ id: "mine", audience: ["student"] }, "staff"));
  assert.ok(!isTopicVisible({ id: "communication", audience: [] }, "student") && !isTopicVisible({ id: "communication", audience: [] }, "staff"));
  assert.ok(!isTopicVisible({ id: "likes" }, "unknown") && !isTopicVisible({ id: "likes" }, undefined));   // 知らない相手には見せない
});

section("新しい既定トピック activity は、新しく作るカードにだけ入る");

test("DEFAULT_TOPICS の communication の直後に、activity(🎨 一緒に活動するとき)がある", async () => {
  const ids = defs.map((d) => d.id), activity = defs.find((d) => d.id === "activity");
  assert.deepStrictEqual(ids, ["emergency", "basic", "communication", "activity", "meal", "care", "posture", "likes", "dislikes"]);
  assert.ok(activity.icon === "🎨" && activity.title === "一緒に活動するとき" && activity.color === "#C2724E" && activity.desc === "参加のしかた・手伝い方・敏感なこと");
});

test("新しく作ったカードには activity が入る(公開先は学生と運営)", async () => {
  await startSession("aud-pass", [{ id: "team_new", name: "新規", emoji: "🏠", color: "#3D7399", people: [] }], "team_new");
  await get(`handle("add-person",{})`);
  run(`modalDraft.name="あたらしい人"`);
  await get(`handle("save-person",{})`);
  const person = plain(get("teams[0].people[0]"));
  assert.deepStrictEqual(person.topicDefs.map((d) => d.id), defs.map((d) => d.id));
  assert.deepStrictEqual(aud(person.topicDefs.find((d) => d.id === "activity")), ["student", "staff"]);
  assert.ok(person.topicDefs.every((d) => !("audience" in d)));   // 初期値は、保存データに書き戻さない
});

test("既存のカード(8トピック)は、保存して閉じて解錠しても activity が増えず、内容も変わらない", async () => {
  const legacyDefs = defs.filter((d) => d.id !== "activity");
  const legacyTeam = { id: "team_legacy", name: "古いチーム", emoji: "🏠", color: "#3D7399", people: [{ id: "old1", name: "旧さん", emoji: "🌸", note: "メモ", photo: null, topicDefs: legacyDefs, topics: { emergency: [{ label: "対応", value: "横向き" }] } }] };
  await startSession("legacy-pass", [legacyTeam], "team_legacy");
  await get("save()"); await get("lockNow()"); await get(`unlock("legacy-pass")`);
  assert.ok(get("stage") === "home" && sameData(get("teams[0]"), legacyTeam) && !plain(get("teams[0].people[0].topicDefs")).some((d) => d.id === "activity"));
  assert.ok(plain(get("teams[0].people[0].topicDefs")).every((d) => !("audience" in d)) && !("updatedAt" in plain(get("teams[0].people[0]"))));   // 公開先・最終更新を書き足さない
});

test("topicDefs のある取り込みカードは、そのまま(8トピックなら8トピックのまま)。topicDefs がないカードだけ既定のトピックで補う", async () => {
  const legacyDefs = defs.filter((d) => d.id !== "activity");
  const out = plain(sanitize({ name: "t", people: [{ id: "a", name: "A", topicDefs: legacyDefs, topics: {} }, { id: "b", name: "B" }] }));
  assert.deepStrictEqual(out.people[0].topicDefs.map((d) => d.id), legacyDefs.map((d) => d.id));
  assert.deepStrictEqual(out.people[1].topicDefs.map((d) => d.id), defs.map((d) => d.id));
});

section("相手別に絞り込む(filterPersonForAudience・filterTeamForAudience)");

const fullTeam = makeFullTeam(defs);
const hana = fullTeam.people[0];

test("学生向け: 見えない定義と、その中身と、一覧にないトピックが除かれる(緊急・基本・食事・医療的ケア・姿勢・自作・orphan)", async () => {
  const out = plain(filterPerson(hana, "student"));
  assert.deepStrictEqual(out.topicDefs.map((d) => d.id), STUDENT_IDS);
  assert.deepStrictEqual(Object.keys(out.topics), STUDENT_IDS);
  for (const id of [...STAFF_ONLY_IDS, "mine", "orphan"]) assert.ok(!(id in out.topics) && !out.topicDefs.some((d) => d.id === id), id);
  assert.ok(!JSON.stringify(out).includes("emergencyの内容") && !JSON.stringify(out).includes("自作の内容") && !JSON.stringify(out).includes("一覧にない内容"));
});

test("運営向け: 運営に見せるトピックが残り、自作(家族のみ)と一覧にないトピックは除かれる", async () => {
  const out = plain(filterPerson(hana, "staff"));
  assert.deepStrictEqual(out.topicDefs.map((d) => d.id), defs.map((d) => d.id));
  assert.deepStrictEqual(Object.keys(out.topics), defs.map((d) => d.id));
  assert.ok(!("mine" in out.topics) && !("orphan" in out.topics));
});

test("人物の名前・ひとこと・写真・最終更新などは、そのまま残る", async () => {
  const out = plain(filterPerson(hana, "student"));
  assert.ok(out.id === hana.id && out.name === "はなさん" && out.note === "音楽が好き" && out.emoji === "🌸" && out.photo === null && out.updatedAt === "2026-10-18T03:00:00.000Z");
});

test("公開先を明示した自作トピックは、その相手にだけ残る。空の配列(家族のみ)はどちらにも残らない", async () => {
  const p = JSON.parse(JSON.stringify(hana));
  p.topicDefs.find((d) => d.id === "mine").audience = ["student"];
  assert.ok(plain(filterPerson(p, "student")).topicDefs.some((d) => d.id === "mine") && "mine" in plain(filterPerson(p, "student")).topics);
  assert.ok(!plain(filterPerson(p, "staff")).topicDefs.some((d) => d.id === "mine") && !("mine" in plain(filterPerson(p, "staff")).topics));
  p.topicDefs.find((d) => d.id === "likes").audience = [];
  assert.ok(!topicIds(filterPerson(p, "student")).includes("likes") && !topicIds(filterPerson(p, "staff")).includes("likes"));
  p.topicDefs.find((d) => d.id === "emergency").audience = ["student", "staff"];
  assert.ok(topicIds(filterPerson(p, "student")).includes("emergency"));
});

test("all は従来どおり、全部(一覧にないトピックも)を含めた複製。元のデータとは別のオブジェクト", async () => {
  const out = filterPerson(hana, "all");
  assert.ok(sameData(out, hana) && plain(out).topics.orphan.length === 1 && plain(out).topicDefs.some((d) => d.id === "mine"));
  const copy = plain(out); copy.topics.emergency[0].value = "書き換え"; copy.topicDefs[0].title = "書き換え";
  assert.ok(hana.topics.emergency[0].value === "emergencyの内容" && hana.topicDefs[0].title === "発作・緊急時");
});

test("絞り込みの結果を書き換えても、元のデータは変わらない(学生向け・運営向け)", async () => {
  for (const audience of ["student", "staff"]) {
    const before = JSON.stringify(hana), out = filterPerson(hana, audience);
    out.topics.communication[0].value = "書き換え"; out.topicDefs[0].title = "書き換え"; out.name = "書き換え";
    assert.strictEqual(JSON.stringify(hana), before, audience);
  }
});

test("topicDefs や topics がない・形が違う人物でも、例外にならず、空になる", async () => {
  assert.deepStrictEqual(plain(filterPerson({ id: "x", name: "n" }, "student")), { id: "x", name: "n", topicDefs: [], topics: {} });
  assert.deepStrictEqual(plain(filterPerson({ id: "x", name: "n", topicDefs: "no", topics: 5 }, "staff")), { id: "x", name: "n", topicDefs: [], topics: {} });
});

test("filterTeamForAudience は、人物すべてに適用した新しいチームを返す。チームの名前などはそのまま、元のチームは変わらない", async () => {
  const before = JSON.stringify(fullTeam), out = plain(filterTeam(fullTeam, "student"));
  assert.ok(out.id === fullTeam.id && out.name === "テストチーム" && out.emoji === "🏠" && out.color === "#2F8F83" && out.people.length === 2);
  assert.deepStrictEqual(out.people[0].topicDefs.map((d) => d.id), STUDENT_IDS);
  assert.deepStrictEqual(out.people[1].topicDefs.map((d) => d.id), STUDENT_IDS);   // 2人目も絞り込まれる
  assert.strictEqual(JSON.stringify(fullTeam), before);
  assert.ok(sameData(filterTeam(fullTeam, "all"), fullTeam) && JSON.stringify(plain(filterTeam(fullTeam, "all"))) === before);   // all は従来どおり(キーの並びも同じ)
});

section("取り込み(sanitizeImportedTeam)と共有メタ(sanitizeShareMeta)");

const importDef = (extra) => plain(sanitize({ name: "t", people: [{ id: "a", name: "A", topicDefs: [{ id: "likes", title: "好き", ...extra }], topics: {} }] })).people[0].topicDefs[0];
const importPerson = (extra) => plain(sanitize({ name: "t", people: [{ id: "a", name: "A", ...extra }] })).people[0];

test("topicDefs[].audience は、配列なら知っているIDだけを残し、配列でなければ項目を付けない", async () => {
  assert.deepStrictEqual(importDef({ audience: ["student", "teacher", "staff", 5] }).audience, ["student", "staff"]);
  assert.deepStrictEqual(importDef({ audience: [] }).audience, []);
  assert.deepStrictEqual(importDef({ audience: ["x"] }).audience, []);
  for (const bad of ["student", 5, null, { 0: "student" }, true]) assert.ok(!("audience" in importDef({ audience: bad })), String(bad));
  assert.ok(!("audience" in importDef({})));
});

test("person.updatedAt は、文字列で40文字以内、かつ Date.parse が数値になるときだけ残す", async () => {
  const good = "2026-10-18T03:00:00.000Z";
  assert.strictEqual(importPerson({ updatedAt: good }).updatedAt, good);
  assert.strictEqual(importPerson({ updatedAt: "2026-10-18" }).updatedAt, "2026-10-18");
  for (const bad of ["x", "", "2026-13-45T00:00:00Z", "2026-10-18T03:00:00.000Z" + " ".repeat(30), 1760000000000, null, {}, ["2026-10-18"], true]) assert.ok(!("updatedAt" in importPerson({ updatedAt: bad })), String(bad));
  assert.ok(!("updatedAt" in importPerson({})));
});

test("team.source は、ファイルにあっても捨てる(取り込みの結果に含まれない)", async () => {
  const out = plain(sanitize({ name: "t", source: { importedAt: "2020-01-01T00:00:00Z", createdAt: "2020-01-01T00:00:00Z", audience: "staff" }, people: [{ id: "a", name: "A", source: { audience: "staff" } }] }));
  assert.ok(!("source" in out) && !("source" in out.people[0]));
});

test("sanitizeShareMeta は、audience が all・student・staff 以外なら all、createdAt は正しい日時か null にする", async () => {
  const good = "2026-10-18T03:00:00.000Z";
  assert.deepStrictEqual(plain(sanitizeMeta({ audience: "student", createdAt: good, appVersion: "9" })), { audience: "student", createdAt: good });   // appVersion など他の項目は返さない
  assert.deepStrictEqual(plain(sanitizeMeta({ audience: "staff", createdAt: good })), { audience: "staff", createdAt: good });
  assert.deepStrictEqual(plain(sanitizeMeta({ audience: "all", createdAt: good })), { audience: "all", createdAt: good });
  for (const bad of ["admin", "", "STUDENT", 1, null, ["student"], {}]) assert.strictEqual(sanitizeMeta({ audience: bad, createdAt: good }).audience, "all", String(bad));
  for (const bad of ["not a date", "", "2026-13-45", good + " ".repeat(30), 1760000000000, null, {}]) assert.strictEqual(sanitizeMeta({ audience: "staff", createdAt: bad }).createdAt, null, String(bad));
  for (const none of [undefined, null, "str", 5, [], true]) assert.deepStrictEqual(plain(sanitizeMeta(none)), { audience: "all", createdAt: null }, String(none));
});

section("人物ページの表示の切り替えとタイルのバッジ");

test("人物ページに「表示: すべて / 学生向け / 運営向け」の切り替えがあり、初期値は「すべて」", async () => {
  await startSession("view-pass", [makeFullTeam(defs)], "team_full");
  await get(`handle("enter-team",{id:"team_full"})`);
  await get(`handle("open-person",{id:"p_hana"})`);
  const html = app.innerHTML;
  assert.ok(get("view.audience") === "all" && get("view.screen") === "person");
  assert.ok(html.includes("表示:") && html.includes('data-act="set-audience" data-v="all" aria-pressed="true"'));
  assert.ok(html.includes('data-act="set-audience" data-v="student" aria-pressed="false"') && html.includes('data-act="set-audience" data-v="staff" aria-pressed="false"'));
  assert.ok(html.includes(">すべて</button>") && html.includes(">学生向け</button>") && html.includes(">運営向け</button>"));
});

test("「すべて」のときは、全タイルが出て、公開先のバッジ(学生・運営・家族のみ)が付く。編集の操作もある", async () => {
  const html = app.innerHTML;
  for (const d of defs) assert.ok(html.includes(`data-id="${d.id}"`), d.id);
  assert.ok(html.includes('data-id="mine"') && html.includes(">家族のみ</span>") && html.includes(">学生</span>") && html.includes(">運営</span>"));
  assert.ok(html.includes('data-act="toggle-organize"') && html.includes('data-act="add-topic"') && html.includes('data-act="edit-person"') && !html.includes("の表示です（編集はできません）"));
  // 緊急のタイルは運営だけ、伝え方のタイルは学生と運営(バッジの数で確かめる: 学生=4+0、運営=9)
  assert.strictEqual(html.split(">学生</span>").length - 1, STUDENT_IDS.length);
  assert.strictEqual(html.split(">運営</span>").length - 1, defs.length);
  assert.strictEqual(html.split(">家族のみ</span>").length - 1, 1);
});

test("学生向けに切り替えると、見えるトピックだけが出て、編集の操作とバッジは出ず、「カードの内容は変更できません。メモは下に書けます。」と分かる", async () => {
  await get(`handle("set-audience",{v:"student"})`);
  const html = app.innerHTML;
  assert.strictEqual(get("view.audience"), "student");
  for (const id of STUDENT_IDS) assert.ok(html.includes(`data-id="${id}"`), id);   // 学生向けのページでは、読み上げのボタンの data-id に出る
  for (const id of [...STAFF_ONLY_IDS, "mine"]) assert.ok(!html.includes(`data-id="${id}"`), id);
  assert.ok(html.includes('data-act="set-audience" data-v="student" aria-pressed="true"'));   // 「学生向け」が押された状態
  // 注記は、カードの内容(公開される内容)を変えられないことと、メモは別に書けることを伝える。「メモは下に書けます」の言葉どおり、注記の下に端末メモの欄がある
  assert.ok(html.includes('<p class="view-note" role="status">カードの内容は変更できません。メモは下に書けます。</p>') && !html.includes("学生向けの表示です（編集はできません）"));
  assert.ok(html.indexOf("メモは下に書けます") < html.indexOf('id="private-note-input"') && html.includes('data-act="save-private-note"'));
  for (const act of ["toggle-organize", "add-topic", "edit-person", "open-copyto", "start-edit"]) assert.ok(!html.includes(`data-act="${act}"`), act);
  assert.ok(!html.includes("aud-chip") && !html.includes("タップして名前・写真を編集") && html.includes('data-act="print"') && html.includes("はなさん"));
});

test("運営向けに切り替えると、運営に見せるトピックが出る(緊急を含む)。自作トピック(家族のみ)は出ない", async () => {
  await get(`handle("set-audience",{v:"staff"})`);
  const html = app.innerHTML;
  for (const d of defs) assert.ok(html.includes(`data-id="${d.id}"`), d.id);
  assert.ok(!html.includes('data-id="mine"') && html.includes("運営向けの表示です（編集はできません）") && !html.includes('data-act="toggle-organize"') && !html.includes('data-act="add-topic"'));
});

test("すべてに戻すと、編集の操作と注記が元に戻る。整理モードは切り替えのたびに閉じる", async () => {
  await get(`handle("set-audience",{v:"all"})`);
  assert.ok(app.innerHTML.includes('data-act="toggle-organize"') && !app.innerHTML.includes("の表示です（編集はできません）"));
  await get(`handle("toggle-organize",{})`);
  assert.strictEqual(get("view.organize"), true);
  await get(`handle("set-audience",{v:"student"})`);
  assert.strictEqual(get("view.organize"), false);
  await get(`handle("set-audience",{v:"all"})`);
  assert.strictEqual(get("view.organize"), false);
});

test("set-audience は、知らない値を受け付けない", async () => {
  await get(`handle("set-audience",{v:"student"})`);
  for (const bad of ["family", "", undefined, "ALL"]) { await get(`handle("set-audience",{v:${JSON.stringify(bad)}})`); assert.strictEqual(get("view.audience"), "student", String(bad)); }
  await get(`handle("set-audience",{v:"all"})`);
});

test("相手別の表示中は、handle() を直接呼んでも、編集を始めず、何も変更しない", async () => {
  await get(`handle("set-audience",{v:"student"})`);
  const before = JSON.stringify(get("teams"));
  env.confirmAnswer = true;
  for (const [act, ds] of [["edit-person", {}], ["add-topic", {}], ["toggle-organize", {}], ["open-copyto", {}], ["del-topic", { id: "communication" }], ["move-up", { id: "activity" }], ["move-down", { id: "communication" }], ["start-edit", {}]]) {
    await get(`handle(${JSON.stringify(act)},${JSON.stringify(ds)})`);
  }
  assert.ok(get("modal") === null && get("view.editing") === false && get("view.organize") === false);
  assert.strictEqual(JSON.stringify(get("teams")), before);
  await get(`handle("set-audience",{v:"all"})`);
});

test("相手別の表示で、見えないトピックは開けない。見えるトピックは開けて、詳細に「書きこむ」は出ない", async () => {
  await get(`handle("set-audience",{v:"student"})`);
  await get(`handle("open-topic",{id:"emergency"})`);
  assert.strictEqual(get("view.screen"), "person");
  await get(`handle("open-topic",{id:"mine"})`);
  assert.strictEqual(get("view.screen"), "person");
  await get(`handle("open-topic",{id:"communication"})`);
  assert.strictEqual(get("view.screen"), "detail");
  const html = app.innerHTML;
  assert.ok(html.includes("communicationの内容") && !html.includes('data-act="start-edit"') && !html.includes("draft-add"));
  await get(`handle("start-edit",{})`);   // 直接呼んでも編集は始まらない
  assert.strictEqual(get("view.editing"), false);
  await get(`handle("back-person",{})`);
  await get(`handle("set-audience",{v:"all"})`);
});

test("詳細画面を開いたまま相手別の表示の相手が変わっても、見えないトピックの中身は描かない", async () => {
  run(`${detailView("team_full", "p_hana", "emergency", "student")}; render()`);
  assert.ok(!app.innerHTML.includes("emergencyの内容"));
  run(`${detailView("team_full", "p_hana", "emergency", "staff")}; render()`);
  assert.ok(app.innerHTML.includes("emergencyの内容") && !app.innerHTML.includes('data-act="start-edit"'));
});

test("相手別の表示で、見せるトピックが1つもないときは、その案内を出す(学生向けは、はじめましてページの案内。運営向けはタイルの画面の案内)", async () => {
  const onlyMine = makeFullTeam(defs, "team_only_mine");
  onlyMine.people[0].topicDefs = [{ id: "mine", icon: "📌", title: "自作トピック", color: "#5B8DB8", desc: "" }];
  await startSession("none-pass", [onlyMine], "team_only_mine");
  run(`${personView("team_only_mine", "p_hana", "student")}; render()`);
  assert.ok(app.innerHTML.includes("まだ学生（一緒に参加する人）向けに公開された情報はありません") && !app.innerHTML.includes('data-id="mine"'));   // 学生向けは、1ページの案内に変わった
  run(`${personView("team_only_mine", "p_hana", "staff")}; render()`);
  assert.ok(app.innerHTML.includes("この相手に見せるトピックは、まだありません。") && !app.innerHTML.includes('data-id="mine"'));
  run(`${personView("team_only_mine", "p_hana", "all")}; render()`);
  assert.ok(!app.innerHTML.includes("この相手に見せるトピックは、まだありません。") && app.innerHTML.includes('data-id="mine"'));
});

test("人物を切り替えたとき(開く・一覧へ戻る)・チームに入ったときは、表示の相手が「すべて」に戻る", async () => {
  await startSession("reset-pass", [makeFullTeam(defs)], "team_full");
  run(`${personView("team_full", "p_hana", "student")}`);
  await get(`handle("back-list",{})`);
  assert.strictEqual(get("view.audience"), "all");
  run(`view.audience="staff"`);
  await get(`handle("open-person",{id:"p_sora"})`);
  assert.ok(get("view.audience") === "all" && get("view.personId") === "p_sora");
  run(`view.audience="student"`);
  await get(`handle("back-home",{})`); await get(`handle("enter-team",{id:"team_full"})`);
  assert.strictEqual(get("view.audience"), "all");
});

test("view.audience がない(古い形の view)ときは、「すべて」として扱う", async () => {
  run(`view={teamId:"team_full",screen:"person",personId:"p_hana",topicId:null,editing:false,organize:false}; render()`);
  assert.ok(get("viewAudience()") === "all" && app.innerHTML.includes('data-act="toggle-organize"') && app.innerHTML.includes('data-act="set-audience" data-v="all" aria-pressed="true"'));
});

section("トピックの編集モードで公開先を設定する");

const openEdit = async (topicId) => {
  run(`${detailView("team_full", "p_hana", topicId)}; render()`);
  await get(`handle("start-edit",{})`);
};
const defOf = (topicId) => plain(get("teams[0].people[0].topicDefs")).find((d) => d.id === topicId);

test("編集モードに「このトピックを見せる相手」の欄が出る(相手ごとのチェック・家族はすべて見られる注記)。チェックは今の公開先どおり", async () => {
  await startSession("edit-pass", [makeFullTeam(defs)], "team_full");
  await openEdit("emergency");
  const html = app.innerHTML;
  assert.ok(get("view.editing") === true && html.includes("このトピックを見せる相手") && html.includes("家族（このカードを作った人）は、いつでもすべて見られます"));
  assert.ok(html.includes('<input type="checkbox" data-draft-aud="student"><span>学生（一緒に参加する人）</span>'));
  assert.ok(html.includes('<input type="checkbox" data-draft-aud="staff" checked><span>運営スタッフ</span>'));   // emergency の初期値は運営だけ
  assert.deepStrictEqual(plain(get("draftAudience")), ["staff"]);
});

test("チェックを変えて「保存する」と、def.audience に記録され、画面に反映される", async () => {
  run(`draftAudience=["student"]`);
  await get(`handle("save-edit",{})`);
  assert.deepStrictEqual(defOf("emergency").audience, ["student"]);
  assert.ok(get("view.editing") === false && get("draftAudience") === null);
  assert.deepStrictEqual(plain(get("persistedTeams[0].people[0].topicDefs")).find((d) => d.id === "emergency").audience, ["student"]);   // 保存データにも入った
  run(`${personView("team_full", "p_hana", "student")}; render()`);
  assert.ok(app.innerHTML.includes('data-id="emergency"'));
  run(`${personView("team_full", "p_hana", "staff")}; render()`);
  assert.ok(!app.innerHTML.includes('data-id="emergency"'));
});

test("次に開くと、記録した公開先がチェックに出る。すべて外すと [](家族のみ)になる", async () => {
  await openEdit("emergency");
  assert.ok(app.innerHTML.includes('data-draft-aud="student" checked') && !app.innerHTML.includes('data-draft-aud="staff" checked'));
  run(`draftAudience=[]`);
  await get(`handle("save-edit",{})`);
  assert.deepStrictEqual(defOf("emergency").audience, []);
  run(`${personView("team_full", "p_hana", "all")}; render()`);
  assert.ok(app.innerHTML.includes(">家族のみ</span>"));
});

test("「やめる」なら、チェックの変更を破棄する(def.audience は変わらず、一時データは消える)", async () => {
  await openEdit("likes");
  run(`draftAudience=["staff"]`);
  await get(`handle("cancel-edit",{})`);
  assert.ok(!("audience" in defOf("likes")) && get("draftAudience") === null && get("view.editing") === false);
  await openEdit("likes");
  assert.deepStrictEqual(plain(get("draftAudience")), ["student", "staff"]);   // 開き直すと、今の公開先(初期値)から始まる
  await get(`handle("back-person",{})`);
  assert.ok(get("draftAudience") === null && !("audience" in defOf("likes")));
});

test("公開先を変えずに保存しても、初期値を保存データに書き戻さない(def.audience の項目が付かない)", async () => {
  await openEdit("communication");
  run(`draft[0].value="書きかえた内容"`);
  await get(`handle("save-edit",{})`);
  assert.ok(!("audience" in defOf("communication")) && get("teams[0].people[0].topics.communication[0].value") === "書きかえた内容");
  await openEdit("communication");
  run(`draftAudience=["staff","student"]`);   // 並びが違うだけで、中身は初期値と同じ
  await get(`handle("save-edit",{})`);
  assert.ok(!("audience" in defOf("communication")));
});

test("自作トピックも設定できる(初期値は家族のみ)。変えたときだけ def.audience が付く", async () => {
  await openEdit("mine");
  assert.deepStrictEqual(plain(get("draftAudience")), []);
  run(`draftAudience=["staff"]`);
  await get(`handle("save-edit",{})`);
  assert.deepStrictEqual(defOf("mine").audience, ["staff"]);
  run(`${personView("team_full", "p_hana", "staff")}; render()`);
  assert.ok(app.innerHTML.includes('data-id="mine"'));
});

test("既知でないIDや重複が一時データに入っていても、記録するのは知っているIDだけ", async () => {
  await openEdit("dislikes");
  run(`draftAudience=["student","student","teacher"]`);
  await get(`handle("save-edit",{})`);
  assert.deepStrictEqual(defOf("dislikes").audience, ["student"]);
});

section("古い保存データの互換(公開先・最終更新のないデータ)");

test("公開先のない古い保存データでも、初期値で表示され、解錠しても書き足されない", async () => {
  const oldTeam = makeFullTeam(defs, "team_old");
  delete oldTeam.people[0].updatedAt;   // 古いデータ:audience も updatedAt もない
  await startSession("compat-pass", [oldTeam], "team_old");
  await get("save()"); await get("lockNow()"); await get(`unlock("compat-pass")`);
  assert.ok(get("stage") === "home" && sameData(get("teams[0]"), oldTeam));
  run(`${personView("team_old", "p_hana", "student")}; stage="ready"; render()`);
  for (const id of STUDENT_IDS) assert.ok(app.innerHTML.includes(`data-id="${id}"`), id);
  assert.ok(!app.innerHTML.includes('data-id="emergency"') && !app.innerHTML.includes("最終更新"));
});
