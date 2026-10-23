/* ============================================================
   tests/navigation.test.mjs ― 戻る操作とスクロール
   ------------------------------------------------------------
   対象:js/actions.js の popstate の処理と navBack、js/state.js の currentScreen・navDepth・syncHistory・initHistory・screenKey、
        js/views.js の render(画面が変わったときだけ先頭へスクロールし、最後に履歴を合わせる)。
   仕様:
     戻る操作:端末やブラウザの「戻る」(popstate)で、モーダル → 詳細 → 人物(緊急情報の一覧) → 一覧 → ホーム と一段ずつ戻る。
              ホームでは何もしない(ページを離れる)。ロック中は何もしない。画面が深くなるときは history.pushState で履歴を積む。
              history がない環境(既定のテスト環境)でも動く。
     スクロール:render() が毎回 scrollTo(0,0) するのをやめ、画面が変わったとき
              (stage・view.screen・teamId・personId・topicId・audience のどれかが変わったとき)だけ先頭へ戻す。
   ※前のテストの結果を後のテストが使うため、順番を変えない。テストは登録した順に実行される。
     前半(history なし)と後半(history のスタブあり)で、別々のアプリ(createApp)を使う。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, installHistory, makeFullTeam, personView, detailView } from "./harness.mjs";

const defs = plain(createApp().get("DEFAULT_TOPICS"));
const home = `stage="home"; view={teamId:null,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}; modal=null; modalDraft=null; render()`;
const popstate = async (env, state = null) => { for (const fn of env.windowHandlers.popstate) await fn({ state }); };
const where = (env) => `${env.get("stage")}/${env.get("view.screen")}/${env.get("modal")}`;

// ================= 前半:history がない環境 =================
const env = createApp();
const { run, get, context, app, startSession } = env;
const scrolls = [];
context.window.scrollTo = (x, y) => { scrolls.push([x, y]); };

section("戻る(popstate)で、一段ずつ戻る(history がない環境でも動く)");

test("history がない環境でも、起動・描画・画面の移動は例外にならない(履歴は触らない)", async () => {
  assert.strictEqual(typeof context.history, "undefined");
  await startSession("nav-pass", [makeFullTeam(defs, "team_nav")], null);
  run(home);
  await get(`handle("enter-team",{id:"team_nav"})`);
  await get(`handle("open-person",{id:"p_hana"})`);
  assert.ok(get("stage") === "ready" && get("view.screen") === "person");
  run("initHistory()");   // 起動時の処理も、history がなくて例外にならない
});

test("モーダル → 詳細 → 人物 → 一覧 → ホーム の順に、popstate のたびに一段ずつ戻る。ホームでは何もしない", async () => {
  await get(`handle("open-topic",{id:"communication"})`);
  await get(`handle("settings",{})`);
  assert.strictEqual(where(env), "ready/detail/settings");
  await popstate(env); assert.strictEqual(where(env), "ready/detail/null");   // モーダルを閉じる
  await popstate(env); assert.strictEqual(where(env), "ready/person/null");   // 詳細 → 人物
  await popstate(env); assert.strictEqual(where(env), "ready/list/null");     // 人物 → 一覧
  assert.strictEqual(get("view.personId"), null);
  await popstate(env); assert.strictEqual(where(env), "home/list/null");      // 一覧 → ホーム
  assert.strictEqual(get("view.teamId"), null);
  const before = JSON.stringify([get("stage"), get("view"), get("teams")]);
  await popstate(env); await popstate(env);   // ホームでは何もしない
  assert.strictEqual(JSON.stringify([get("stage"), get("view"), get("teams")]), before);
});

test("ホームで開いたモーダルは、戻る操作で閉じる(ホームに留まる)。そのあとの戻る操作では何もしない", async () => {
  await get(`handle("settings",{})`);
  assert.ok(get("modal") === "settings" && get("stage") === "home");
  await popstate(env);
  assert.ok(get("modal") === null && get("stage") === "home" && !app.innerHTML.includes('class="overlay"'));
  await popstate(env);
  assert.strictEqual(get("stage"), "home");
});

test("緊急情報の一覧からは、一覧へ戻る。書きこみ中の詳細からは、人物へ戻る(「もどる」ボタンと同じで、下書きは捨てる)", async () => {
  await get(`handle("enter-team",{id:"team_nav"})`);
  await get(`handle("open-emergency",{})`);
  assert.strictEqual(where(env), "ready/emergency/null");
  await popstate(env); assert.strictEqual(where(env), "ready/list/null");
  await get(`handle("open-person",{id:"p_hana"})`);
  await get(`handle("open-topic",{id:"communication"})`);
  await get(`handle("start-edit",{})`);
  run(`draft[0].value="入力中の内容"`);
  assert.ok(get("view.editing") === true && get("draftAudience") !== null);
  await popstate(env);
  assert.ok(where(env) === "ready/person/null" && get("view.editing") === false && get("view.topicId") === null);
  assert.strictEqual(get("teams[0].people[0].topics.communication[0].value"), "communicationの内容");   // 保存していないので、元のまま
});

test("人物の編集モーダルが開いているときの戻る操作は、モーダルを閉じるだけ(カードの画面に留まる)。保留中のファイルの選択は破棄する", async () => {
  await get(`handle("edit-person",{})`);
  assert.strictEqual(get("modal"), "person");
  await popstate(env);
  assert.ok(where(env) === "ready/person/null" && get("modalDraft") === null);
  run(`holdPendingPicker({type:"import",file:{},expiresAt:Date.now()+100000}); modal="resume-picker"; render()`);
  await popstate(env);
  assert.ok(get("modal") === null && get("pendingPicker") === null);
});

test("学生向けの表示(はじめましてページ)・運営向けの表示からも、人物 → 一覧 → ホーム と一段ずつ戻る", async () => {
  for (const audience of ["student", "staff"]) {
    run(`${personView("team_nav", "p_hana", audience)}; stage="ready"; render()`);
    await popstate(env); assert.strictEqual(where(env), "ready/list/null", audience);
    assert.strictEqual(get("view.audience"), "all");   // 一覧に戻ると、表示は「すべて」に戻る(従来の back-list と同じ)
    await popstate(env); assert.strictEqual(where(env), "home/list/null", audience);
  }
});

section("ロック中・起動中・初期設定中は、戻る操作で何もしない");

test("ロック中の popstate は何もしない(画面もデータも変わらない。解錠もされない)", async () => {
  await startSession("nav-pass2", [makeFullTeam(defs, "team_nav")], "team_nav");
  await get(`handle("open-person",{id:"p_hana"})`);
  await get("lockNow()");
  assert.strictEqual(get("stage"), "locked");
  const before = JSON.stringify([get("stage"), get("view"), get("teams"), get("modal")]), html = app.innerHTML;
  await popstate(env); await popstate(env, { sc: 0 }); await popstate(env, { sc: 1 });
  assert.strictEqual(JSON.stringify([get("stage"), get("view"), get("teams"), get("modal")]), before);
  assert.ok(get("stage") === "locked" && get("cryptoKey") === null && app.innerHTML === html);
});

test("初期設定の途中(setup-pass)・起動中(boot)も、何もしない", async () => {
  for (const stage of ["setup-pass", "boot"]) {
    run(`stage=${JSON.stringify(stage)}; modal=null; render()`);
    const before = JSON.stringify([get("stage"), get("view")]), html = app.innerHTML;
    await popstate(env);
    assert.ok(JSON.stringify([get("stage"), get("view")]) === before && app.innerHTML === html, stage);
  }
});

test("ロック中にモーダルがあっても(再開の確認など)、ロック中の戻る操作では閉じない。解錠後の戻る操作は通る", async () => {
  await startSession("nav-pass3", [makeFullTeam(defs, "team_nav")], null);
  await get("save()");
  await get("lockNow()");
  run(`modal="settings"`);   // 画面には出ていない(ロック画面)が、状態としてモーダルが立っている場合
  await popstate(env);
  assert.strictEqual(get("modal"), "settings");
  run(`modal=null`);
  await get(`unlock("nav-pass3")`);
  assert.strictEqual(get("stage"), "home");
  await get(`handle("enter-team",{id:"team_nav"})`);
  await popstate(env);
  assert.strictEqual(get("stage"), "home");   // 解錠後は、通常どおり戻れる
});

section("スクロールは、画面が変わったときだけ先頭へ戻す");

const resetScrolls = () => { scrolls.length = 0; };
const toPerson = () => run(`stage="ready"; ${personView("team_nav", "p_hana", "all")}; modal=null; modalDraft=null; render()`);

test("同じ画面のまま描き直しても、スクロールしない(render の繰り返し・モーダルの開閉・文字サイズの変更・書きこみの開始/やめる・読み上げの終了)", async () => {
  await startSession("nav-pass4", [makeFullTeam(defs, "team_nav")], "team_nav");
  toPerson();
  resetScrolls();
  run("render(); render(); render()");
  await get(`handle("add-topic",{})`); assert.strictEqual(get("modal"), "topic");
  await get(`handle("close-modal",{})`);
  await get(`handle("settings",{})`);
  await get(`handle("set-fs",{v:"xl"})`); await get(`handle("set-fs",{v:"m"})`);
  await get(`handle("close-modal",{})`);
  await get(`handle("toggle-organize",{})`); await get(`handle("toggle-organize",{})`);
  assert.deepStrictEqual(scrolls, []);
  await get(`handle("open-topic",{id:"communication"})`);
  resetScrolls();
  await get(`handle("start-edit",{})`); await get(`handle("cancel-edit",{})`);   // 同じ詳細画面のまま
  run(`speaking=true; speakingTopicId="communication"; render()`);
  assert.deepStrictEqual(scrolls, []);
  await get(`handle("back-person",{})`);   // 画面が変わる
  assert.strictEqual(scrolls.length, 1);
});

test("画面が変わったときは、先頭へ戻す(scrollTo(0,0)を1回):チームに入る・人物を開く・トピックを開く・戻る・表示の切り替え・ロック", async () => {
  const expectScroll = async (label, fn) => { resetScrolls(); await fn(); assert.deepStrictEqual(scrolls, [[0, 0]], label); };
  run(home);
  await expectScroll("チームに入る(stage)", () => get(`handle("enter-team",{id:"team_nav"})`));
  await expectScroll("人物を開く(screen・personId)", () => get(`handle("open-person",{id:"p_hana"})`));
  await expectScroll("表示の切り替え(audience)", () => get(`handle("set-audience",{v:"student"})`));
  await expectScroll("表示を戻す(audience)", () => get(`handle("set-audience",{v:"all"})`));
  await expectScroll("トピックを開く(screen・topicId)", () => get(`handle("open-topic",{id:"communication"})`));
  await expectScroll("人物へ戻る(screen・topicId)", () => get(`handle("back-person",{})`));
  await expectScroll("一覧へ戻る(screen・personId)", () => get(`handle("back-list",{})`));
  await expectScroll("緊急情報の一覧を開く(screen)", () => get(`handle("open-emergency",{})`));
  await expectScroll("一覧へ戻る", () => get(`handle("back-list",{})`));
  await expectScroll("ホームへ戻る(stage・teamId)", () => get(`handle("back-home",{})`));
  await get(`handle("enter-team",{id:"team_nav"})`);
  await expectScroll("ロック(stage)", () => get("lockNow()"));
});

test("識別(screenKey)の要素を1つずつ変えると、それぞれスクロールする(stage・view.screen・teamId・personId・topicId・audience)", async () => {
  await startSession("nav-pass5", [makeFullTeam(defs, "team_nav"), makeFullTeam(defs, "team_nav2")], "team_nav");
  run(`${detailView("team_nav", "p_hana", "communication", "all")}; render()`);
  const changes = [
    ["view.screen", `view.screen="person"`], ["view.topicId", `${detailView("team_nav", "p_hana", "communication", "all")}; view.topicId="likes"`],
    ["view.personId", `view.personId="p_sora"`], ["view.teamId", `view.teamId="team_nav2"`], ["view.audience", `view.audience="staff"`], ["stage", `stage="home"`],
  ];
  for (const [label, code] of changes) {
    run(`${detailView("team_nav", "p_hana", "communication", "all")}; stage="ready"; render()`);   // 基準の画面
    resetScrolls();
    run(`${code}; render()`);
    assert.strictEqual(scrolls.length, 1, label);
  }
  run(`${detailView("team_nav", "p_hana", "communication", "all")}; stage="ready"; render()`);
  resetScrolls();
  run(`view.editing=true; view.organize=true; modal="topic"; modalDraft={title:"",icon:"📌",color:"#5B8DB8"}; render()`);   // 識別に入らない要素
  assert.strictEqual(scrolls.length, 0);
});

test("screenKey は stage・view.screen・teamId・personId・topicId・audience だけから決まる", async () => {
  const key = get("screenKey");
  const base = key();
  run(`view.editing=!view.editing; view.organize=!view.organize; modal="settings"`);
  assert.strictEqual(key(), base);
  run(`modal=null; view.audience="staff"`);
  assert.notStrictEqual(key(), base);
});

// ================= 後半:history のスタブがあるとき =================
const env2 = createApp();
const hist = installHistory(env2);
const settle = hist.settle;
const gos = () => hist.calls.filter(([kind]) => kind === "go").length;
const pushes = () => hist.calls.filter(([kind]) => kind === "push").length;
const depth = () => ({ app: env2.get("navDepth()"), hist: env2.get("histDepth"), state: hist.history.state?.sc, index: hist.index() });
const sameDepth = (n) => assert.deepStrictEqual(depth(), { app: n, hist: n, state: n, index: n });   // アプリの深さ・履歴の深さ・履歴の位置が、すべて同じ

section("画面が深くなるときに history.pushState で履歴を積む。浅くなるときは履歴を戻す");

test("起動時(initHistory):いまの位置を深さ0にして、スクロール位置の復元は切る", async () => {
  await env2.startSession("hist-pass", [makeFullTeam(defs, "team_h")], null);
  env2.run(home);
  env2.run("initHistory()");
  assert.deepStrictEqual(plain(hist.calls[0]), ["replace", { sc: 0 }]);
  assert.strictEqual(hist.history.scrollRestoration, "manual");
  sameDepth(0);
});

test("ホーム → チーム → 人物 → 詳細 → モーダル と深くなるたびに、1つずつ積まれる(同じ画面の描き直しでは積まない)", async () => {
  const h = (code) => env2.get(code);
  await h(`handle("enter-team",{id:"team_h"})`); sameDepth(1);
  await h(`handle("open-person",{id:"p_hana"})`); sameDepth(2);
  await h(`handle("open-topic",{id:"communication"})`); sameDepth(3);
  await h(`handle("settings",{})`); sameDepth(4);
  assert.deepStrictEqual(plain(hist.calls.filter(([k]) => k === "push").map(([, s]) => s)), [{ sc: 1 }, { sc: 2 }, { sc: 3 }, { sc: 4 }]);
  const before = hist.calls.length;
  env2.run("render(); render()");
  await h(`handle("set-fs",{v:"l"})`); await h(`handle("set-fs",{v:"m"})`);   // モーダルのまま描き直す
  assert.strictEqual(hist.calls.length, before);
  assert.strictEqual(gos(), 0);
});

test("端末の「戻る」を押すたびに、モーダル → 詳細 → 人物 → 一覧 → ホーム と一段ずつ戻る(アプリが履歴を余計に動かさない)", async () => {
  const steps = [["ready/detail/null", 3], ["ready/person/null", 2], ["ready/list/null", 1], ["home/list/null", 0]];
  for (const [expected, n] of steps) {
    hist.history.back(); await settle();
    assert.strictEqual(where(env2), expected);
    sameDepth(n);
  }
  assert.strictEqual(gos(), 4);   // 呼んだのは、いまの4回だけ(アプリは go を呼んでいない)
  assert.strictEqual(pushes(), 4);
});

test("ホーム(位置0)で「戻る」を押しても、アプリは何もしない(履歴にもう戻れない)", async () => {
  const before = hist.calls.length;
  hist.history.back(); await settle();
  assert.strictEqual(where(env2), "home/list/null");
  sameDepth(0);
  assert.strictEqual(hist.calls.length, before + 1);   // 呼んだ go(-1) の記録だけ
});

test("アプリのボタンで浅くしたときは、履歴も1つ戻る(その popstate では、画面をさらに戻さない)", async () => {
  const h = (code) => env2.get(code);
  await h(`handle("enter-team",{id:"team_h"})`); await h(`handle("open-person",{id:"p_hana"})`);
  sameDepth(2);
  const gosBefore = gos();
  await h(`handle("back-list",{})`);   // 人物 → 一覧(ボタン)
  assert.strictEqual(gos(), gosBefore + 1);   // 履歴を1つ戻す
  await settle();
  assert.strictEqual(where(env2), "ready/list/null");   // popstate で、さらに一覧 → ホームには戻らない
  sameDepth(1);
  await h(`handle("open-person",{id:"p_hana"})`); await h(`handle("open-topic",{id:"likes"})`);
  sameDepth(3);
  await h(`handle("back-person",{})`); await settle();
  assert.strictEqual(where(env2), "ready/person/null"); sameDepth(2);
});

test("モーダルをボタン(やめる・保存)で閉じたときも、履歴が1つ戻る", async () => {
  const h = (code) => env2.get(code);
  await h(`handle("add-topic",{})`); sameDepth(3);
  await h(`handle("close-modal",{})`); await settle();
  assert.strictEqual(where(env2), "ready/person/null"); sameDepth(2);
  await h(`handle("add-topic",{})`);
  env2.run(`modalDraft.title="睡眠"`);
  await h(`handle("save-topic",{})`); await settle();   // 保存して閉じる
  assert.ok(env2.get("modal") === null && env2.get("view.screen") === "person"); sameDepth(2);
});

test("操作が重なっても(戻している最中に次の画面へ進む)、履歴は最後に画面の深さへ合う", async () => {
  const h = (code) => env2.get(code);
  await h(`handle("back-list",{})`);   // go が済む前に
  await h(`handle("open-person",{id:"p_sora"})`);   // もう人物を開く
  await settle();
  assert.strictEqual(where(env2), "ready/person/null");
  assert.strictEqual(env2.get("view.personId"), "p_sora");
  sameDepth(2);
});

test("端末の「戻る」で複数の位置を一度に飛んでも、画面は一段だけ戻り、履歴は画面の深さに合い直る", async () => {
  const h = (code) => env2.get(code);
  await h(`handle("open-topic",{id:"likes"})`); sameDepth(3);   // 位置3の詳細
  hist.history.go(-2); await settle();   // 位置1へ飛ぶ(ブラウザの履歴一覧からの移動など)
  assert.strictEqual(where(env2), "ready/person/null");   // 画面は一段だけ戻る
  sameDepth(2);   // 履歴は、積み直されて画面の深さ(2)に合う
});

test("「進む」を押しても、画面は変わらない(履歴の位置を、画面に合わせ直す)", async () => {
  hist.history.back(); await settle();   // 人物 → 一覧
  assert.strictEqual(where(env2), "ready/list/null"); sameDepth(1);
  hist.history.forward(); await settle();
  assert.strictEqual(where(env2), "ready/list/null");
  sameDepth(1);
});

section("ロックと履歴");

test("画面が見えているときにロックすると、履歴は先頭(深さ0)まで戻り、ロック中の「戻る」では何も起きない", async () => {
  const h = (code) => env2.get(code);
  await h(`handle("open-person",{id:"p_hana"})`); await h(`handle("open-topic",{id:"communication"})`);
  sameDepth(3);
  await h("lockNow()"); await settle();
  assert.strictEqual(get_stage(), "locked");
  assert.deepStrictEqual(depth(), { app: 0, hist: 0, state: 0, index: 0 });
  await popstate(env2, { sc: 0 });
  assert.strictEqual(get_stage(), "locked");
});
const get_stage = () => env2.get("stage");

test("画面が隠れているとき(バックグラウンド)は、履歴に触らない。見える状態に戻ったときに、ロック画面の深さ0へ合わせる", async () => {
  await env2.startSession("hist-pass2", [makeFullTeam(defs, "team_h")], "team_h");
  env2.run(`${home}`);
  await env2.get("save()");
  await env2.get(`handle("enter-team",{id:"team_h"})`); await env2.get(`handle("open-person",{id:"p_hana"})`);
  await settle(); sameDepth(2);
  const gosBefore = gos();
  env2.document.hidden = true;
  await env2.get("lockNow()");   // バックグラウンドに回ったときのロック
  await settle();
  assert.strictEqual(gos(), gosBefore);   // 隠れているあいだは go を呼ばない
  assert.strictEqual(get_stage(), "locked");
  assert.strictEqual(env2.get("histDepth"), 2);
  env2.document.hidden = false;
  for (const fn of env2.handlers.visibilitychange || []) fn();   // 見える状態に戻った
  await settle();
  assert.strictEqual(gos(), gosBefore + 1);   // 深さ2 → 0 を、1回の go(-2) で合わせる
  assert.deepStrictEqual(depth(), { app: 0, hist: 0, state: 0, index: 0 });
  assert.strictEqual(get_stage(), "locked");   // ロック画面のまま(解錠もされない)
});

test("解錠したあとは、ホーム(深さ0)から通常どおり、画面が深くなるたびに積まれる", async () => {
  await env2.get(`unlock("hist-pass2")`); await settle();
  assert.strictEqual(get_stage(), "home");
  assert.deepStrictEqual(depth(), { app: 0, hist: 0, state: 0, index: 0 });
  await env2.get(`handle("enter-team",{id:"team_h"})`);
  sameDepth(1);
});

section("履歴が思いどおりに動かなかったときも、止まったままにならない");

// 履歴の操作を差し替えた、別のアプリを作る(home の状態から始める)
const startHistoryApp = async (tweak) => {
  const e = createApp();
  const h = installHistory(e);
  tweak(h);
  await e.startSession("hist-robust", [makeFullTeam(defs, "team_r")], null);
  e.run(home);
  e.run("initHistory()");
  return { e, h };
};

test("history.go のあと popstate が来なくても、立て直しのタイマーで、履歴を画面の深さに合わせ直す(その間は、積み足さない)", async () => {
  const { e, h } = await startHistoryApp((x) => { x.history.go = (n) => { x.calls.push(["go", n]); }; });   // go が動かない(popstate が来ない)
  await e.get(`handle("enter-team",{id:"team_r"})`); await e.get(`handle("open-person",{id:"p_hana"})`);
  assert.deepStrictEqual(plain({ hist: e.get("histDepth"), state: h.history.state }), { hist: 2, state: { sc: 2 } });
  await e.get(`handle("back-list",{})`);   // go(-1) を呼ぶ(でも動かない)
  assert.ok(e.get("histPending") === 1 && e.get("histDepth") === 1 && h.calls.filter(([k]) => k === "go").length === 1);
  const pushesBefore = h.calls.filter(([k]) => k === "push").length;
  await e.get(`handle("open-person",{id:"p_hana"})`);   // 戻している最中なので、積み足さない
  assert.strictEqual(h.calls.filter(([k]) => k === "push").length, pushesBefore);
  const timer = e.timers.filter((t) => t.ms === 2000).at(-1);
  assert.ok(timer, "立て直しのタイマーが登録されている");
  timer.fn();   // 時間が過ぎた
  assert.strictEqual(e.get("histPending"), 0);
  assert.deepStrictEqual(plain({ hist: e.get("histDepth"), nav: e.get("navDepth()"), state: h.history.state }), { hist: 2, nav: 2, state: { sc: 2 } });   // 実際の位置(2)を読み直し、画面の深さ(2)と一致
  await e.get(`handle("open-topic",{id:"likes"})`);   // その後は、また積める
  assert.strictEqual(e.get("histDepth"), 3);
});

test("popstate が普通に届いたときは、立て直しのタイマーは何もしない(すでに処理済み)", async () => {
  const e = createApp();
  const h = installHistory(e);
  await e.startSession("hist-robust2", [makeFullTeam(defs, "team_r")], null);
  e.run(home); e.run("initHistory()");
  await e.get(`handle("enter-team",{id:"team_r"})`); await e.get(`handle("open-person",{id:"p_hana"})`);
  await e.get(`handle("back-list",{})`); await h.settle();
  assert.ok(e.get("histPending") === 0 && e.get("histDepth") === 1);
  const timer = e.timers.filter((t) => t.ms === 2000).at(-1);
  const callsBefore = h.calls.length;
  timer.fn();
  assert.ok(e.get("histPending") === 0 && e.get("histDepth") === 1 && h.calls.length === callsBefore);
});

test("history.pushState が失敗しても(Safari などの制限)、例外にならず画面は動く。履歴の深さは、積めた分だけ", async () => {
  let n = 0;
  const { e, h } = await startHistoryApp((x) => { const real = x.history.pushState; x.history.pushState = (s) => { if (++n === 2) throw new Error("SecurityError"); real(s); }; });
  await e.get(`handle("enter-team",{id:"team_r"})`);   // 1回目:積める
  await e.get(`handle("open-person",{id:"p_hana"})`);   // 2回目:失敗する
  assert.ok(e.get("stage") === "ready" && e.get("view.screen") === "person");   // 画面は動く
  assert.deepStrictEqual(plain({ hist: e.get("histDepth"), state: h.history.state }), { hist: 1, state: { sc: 1 } });   // 深さの記録は、実際に積めた1のまま
  await e.get(`handle("open-topic",{id:"likes"})`);   // 次の描画で、足りない分を積み直す(3回目以降は成功)
  assert.deepStrictEqual(plain({ hist: e.get("histDepth"), nav: e.get("navDepth()") }), { hist: 3, nav: 3 });
});

test("history.go が例外になっても、深さの記録を元に戻して止まらない", async () => {
  const { e, h } = await startHistoryApp((x) => { x.history.go = () => { throw new Error("go failed"); }; });
  await e.get(`handle("enter-team",{id:"team_r"})`); await e.get(`handle("open-person",{id:"p_hana"})`);
  await e.get(`handle("back-list",{})`);   // go が例外になる
  assert.ok(e.get("histPending") === 0 && e.get("histDepth") === 2 && e.get("view.screen") === "list");   // 待ち状態にならない。深さは実際のまま(2)
});
