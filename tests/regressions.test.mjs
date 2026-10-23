/* ============================================================
   tests/regressions.test.mjs ― レビューで見つかった不具合の回帰テスト
   ------------------------------------------------------------
   1. 「他のチームへコピー」の後にモーダルが画面に残る(js/actions.js の copy-card)
   2. ホーム画面の設定から「パスコードを変更」を押しても何も起きない(js/actions.js の passchange-save。使われていない inTeam も削除)
   3. 共有ファイルを読み込むとき、FileReader の onerror を扱っていない(js/actions.js の processImportFile)
   4. css/style.css 冒頭のコメントが閉じていない
   ※各テストは、直前の状態を引き継いで進む。テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp, test, section, plain, listView, personView, makeFullTeam, readAppSource, ROOT } from "./harness.mjs";

const env = createApp();
const { run, get, context, app, document, localStorage, importInput, handlers, alerts, startSession } = env;

const STORE = "support-card-local-v1";
const defs = plain(get("DEFAULT_TOPICS"));

section("不具合1:他のチームへコピーした後、モーダルが画面に残らない");

test("コピーが成功すると、モーダルが閉じ、画面からも消える(コピー完了のメッセージが出る時点で、すでに消えている)", async () => {
  const teamB = makeFullTeam(defs, "team_b"); teamB.name = "コピー先";
  await startSession("copy-session", [makeFullTeam(defs, "team_a"), teamB], "team_a");
  run(`${personView("team_a", "p_hana")}; render()`);
  assert.ok(app.innerHTML.includes('data-act="open-copyto"'));
  await get(`handle("open-copyto",{})`);
  assert.ok(get("modal") === "copyto" && app.innerHTML.includes("他のチームへコピー</h2>") && app.innerHTML.includes('data-act="copy-card" data-id="team_b"'));
  const realAlert = context.alert;
  let htmlAtAlert = null;
  context.alert = (m) => { alerts.push(String(m)); htmlAtAlert = app.innerHTML; };   // メッセージが出た時点の画面を記録する
  try {
    const before = get("teams[1].people.length");
    await get(`handle("copy-card",{id:"team_b"})`);
    assert.strictEqual(get("teams[1].people.length"), before + 1);
    assert.strictEqual(get("modal"), null);
    assert.ok(!app.innerHTML.includes("他のチームへコピー</h2>") && !app.innerHTML.includes('data-act="copy-card"') && !app.innerHTML.includes('class="overlay"'));
    assert.ok(htmlAtAlert !== null && !htmlAtAlert.includes('data-act="copy-card"') && !htmlAtAlert.includes('class="overlay"'));
    assert.strictEqual(alerts.at(-1), "「コピー先」に はなさん のカードをコピーしました。\n※コピー後は独立したカードです。");
  } finally { context.alert = realAlert; }
});

test("コピーしたカードは独立している(IDが違い、元の内容を書き換えても影響しない)", async () => {
  const copy = plain(get("teams[1].people.at(-1)"));
  assert.ok(copy.id !== "p_hana" && copy.name === "はなさん");
  run(`teams[0].people[0].topics.communication[0].value="元だけ書きかえた"`);
  assert.strictEqual(get("teams[1].people.at(-1).topics.communication[0].value"), "communicationの内容");
});

test("コピーの保存に失敗すると、コピーされず、モーダルは開いたまま(やり直せる)", async () => {
  run(`${personView("team_a", "p_hana")}; render()`);
  await get(`handle("open-copyto",{})`);
  const before = get("teams[1].people.length");
  env.failStoreWrites = true;
  await get(`handle("copy-card",{id:"team_b"})`);
  env.failStoreWrites = false;
  assert.ok(get("teams[1].people.length") === before && get("modal") === "copyto" && app.innerHTML.includes('data-act="copy-card"'));
  await get(`handle("close-modal",{})`);
});

section("不具合2:ホーム画面の設定から、パスコードを変更できる");

// パスコード変更の入力欄(画面のDOMはないので、入力欄の代わりを用意する)
const withPassFields = async (v1, v2, fn) => {
  const fields = { "m-pass1": { value: v1 }, "m-pass2": { value: v2 }, "m-pass-err": { textContent: "" } };
  const baseGet = document.getElementById;
  document.getElementById = (id) => fields[id] ?? baseGet(id);
  try { return await fn(fields); } finally { document.getElementById = baseGet; }
};

test("ホーム(チーム一覧)で、設定→パスコードを変更→変更する、で、パスコードが変わる(新しいパスコードで解錠でき、古いパスコードでは解錠できない)", async () => {
  run(`stage="setup-pass"; cryptoKey=null; salt=null; teams=[]; persistedTeams=[]; screenError=""; modal=null; modalDraft=null; ${listView(null)}`);   // 初回設定の状態から始める
  await get(`setupNew("old-pass-1")`);
  assert.strictEqual(get("stage"), "home");
  await get(`handle("settings",{})`);
  assert.ok(get("modal") === "settings" && app.innerHTML.includes('data-act="open-passchange"'));
  await get(`handle("open-passchange",{})`);
  assert.strictEqual(get("modal"), "passchange");
  const storedBefore = JSON.parse(localStorage.getItem(STORE));
  await withPassFields("new-pass-2", "new-pass-2", async (fields) => {
    await get(`handle("passchange-save",{})`);
    assert.strictEqual(fields["m-pass-err"].textContent, "");
  });
  assert.strictEqual(alerts.at(-1), "パスコードを変更しました。");
  assert.ok(get("modal") === null && get("stage") === "home");
  const storedAfter = JSON.parse(localStorage.getItem(STORE));
  assert.ok(storedAfter.v === 1 && storedAfter.salt !== storedBefore.salt && storedAfter.data !== storedBefore.data);   // 新しい salt で暗号化し直した(保存形式 v:1 は同じ)
  await get("lockNow()"); await get(`unlock("old-pass-1")`);
  assert.strictEqual(get("stage"), "locked");
  await get(`unlock("new-pass-2")`);
  assert.ok(get("stage") === "home" && get("teams.length") === 1);   // データも読める
});

test("入力が正しくないとき(4文字未満・2回の入力が違う)は、変更しない(ホームでも、エラーを出す)", async () => {
  const storedBefore = localStorage.getItem(STORE), alertsBefore = alerts.length;
  await get(`handle("settings",{})`); await get(`handle("open-passchange",{})`);
  await withPassFields("abc", "abc", async (fields) => { await get(`handle("passchange-save",{})`); assert.strictEqual(fields["m-pass-err"].textContent, "4文字以上にしてください"); });
  await withPassFields("another-pass", "different", async (fields) => { await get(`handle("passchange-save",{})`); assert.strictEqual(fields["m-pass-err"].textContent, "2回の入力が一致しません"); });
  assert.ok(localStorage.getItem(STORE) === storedBefore && alerts.length === alertsBefore && get("modal") === "passchange");
});

test("チームの中(stage が ready)からも、従来どおり変更できる", async () => {
  run(`stage="ready"; ${listView(get("teams[0].id"))}`);
  await withPassFields("third-pass-3", "third-pass-3", async () => { await get(`handle("passchange-save",{})`); });
  assert.strictEqual(alerts.at(-1), "パスコードを変更しました。");
  await get("lockNow()"); await get(`unlock("third-pass-3")`);
  assert.strictEqual(get("stage"), "home");
});

test("解錠したセッションの確認は維持される:ロック中・暗号化の途中でロック・保存の失敗では、鍵も保存データも変わらない", async () => {
  // (1) ロックされた状態では、何もしない
  await get("lockNow()");
  const storedLocked = localStorage.getItem(STORE), alertsLocked = alerts.length;
  await withPassFields("locked-pass-4", "locked-pass-4", async () => { await get(`handle("passchange-save",{})`); });
  assert.ok(localStorage.getItem(STORE) === storedLocked && alerts.length === alertsLocked && get("cryptoKey") === null && get("stage") === "locked");

  // (2) 鍵の導出の途中でロックされたら、新しい鍵を採用しない
  await get(`unlock("third-pass-3")`);
  const storedHome = localStorage.getItem(STORE), alertsHome = alerts.length;
  context.__realDerive = get("deriveKey");
  let signal; const waiting = new Promise((resolve) => { signal = resolve; });
  context.__started = signal;
  run(`deriveKey=async (...args)=>{ globalThis.__started(); await new Promise(resolve=>globalThis.__release=resolve); return globalThis.__realDerive(...args); }`);
  await get(`handle("settings",{})`); await get(`handle("open-passchange",{})`);
  let pending;
  await withPassFields("late-pass-5", "late-pass-5", async () => {
    pending = get(`handle("passchange-save",{})`);
    await waiting;
    await get("lockNow()");
    context.__release();
    await pending;
  });
  run(`deriveKey=globalThis.__realDerive`);
  assert.ok(get("cryptoKey") === null && get("stage") === "locked" && localStorage.getItem(STORE) === storedHome && alerts.length === alertsHome);

  // (3) 保存に失敗したら、元の鍵に戻る(元のパスコードで解錠できる)
  await get(`unlock("third-pass-3")`);
  await get(`handle("settings",{})`); await get(`handle("open-passchange",{})`);
  env.failStoreWrites = true;
  const alertsBeforeFail = alerts.length;
  await withPassFields("never-saved-6", "never-saved-6", async () => { await get(`handle("passchange-save",{})`); });
  env.failStoreWrites = false;
  assert.ok(alerts.length === alertsBeforeFail + 1 && alerts.at(-1).includes("保存に失敗しました") && get("modal") === "passchange");
  await get("lockNow()"); await get(`unlock("third-pass-3")`);
  assert.strictEqual(get("stage"), "home");
});

test("使われていない inTeam は、js/ に残っていない", async () => {
  assert.ok(!readAppSource().includes("inTeam"));
});

section("不具合3:共有ファイルを読み込むとき、FileReader の onerror を扱う");

test("ファイルを読み取れなかったとき(onerror)は、「ファイルを読み込めませんでした。」と表示して、false を返す(チームは増えない)", async () => {
  await startSession("reader-session", [], null);
  const RealReader = context.FileReader;
  context.FileReader = class { readAsText() { this.onerror(new Error("read failed")); } };
  try {
    const alertsBefore = alerts.length;
    const result = await get("processImportFile")({ name: "broken.scard" });
    assert.strictEqual(result, false);
    assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === "ファイルを読み込めませんでした。" && get("teams.length") === 0);
  } finally { context.FileReader = RealReader; }
});

test("ファイルを選んだ操作(change)からでも、同じ案内が出て、画面は変わらない", async () => {
  const RealReader = context.FileReader;
  context.FileReader = class { readAsText() { this.onerror(new Error("read failed")); } };
  try {
    const alertsBefore = alerts.length;
    importInput.files = [{ name: "broken.scard" }];
    handlers.import({ target: importInput });
    assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === "ファイルを読み込めませんでした。" && get("stage") === "ready" && get("teams.length") === 0);
  } finally { context.FileReader = RealReader; }
});

test("読み取れなかったときに、すでにロックされていたら、案内は出さずに false を返す(ロック中の画面に出さない)", async () => {
  const RealReader = context.FileReader;
  context.FileReader = class { readAsText() { get("lockNow()"); this.onerror(new Error("read failed")); } };
  try {
    const alertsBefore = alerts.length;
    const result = await get("processImportFile")({ name: "broken.scard" });
    assert.ok(result === false && alerts.length === alertsBefore && get("stage") === "locked");
  } finally { context.FileReader = RealReader; }
});

test("読み取りに成功する通常の取り込みは、これまでどおり動く", async () => {
  await startSession("reader-session2", [], null);
  const file = await env.makeShare("reader-pass", { team: makeFullTeam(defs, "team_src") });
  assert.strictEqual(await env.importShare(file, "reader-pass"), 1);
});

section("不具合4:css/style.css の冒頭のコメントが閉じている");

const css = readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
// CSS のコメントは入れ子にできない。/* から最初の */ までを順に取り除き、途中に /* が混ざっていないか(閉じ忘れを別のコメントの */ が閉じていないか)を調べる
const stripComments = (text) => {
  let rest = text;
  for (;;) {
    const start = rest.indexOf("/*");
    if (start < 0) return { rest, ok: !rest.includes("*/") };
    const end = rest.indexOf("*/", start + 2);
    if (end < 0 || rest.slice(start + 2, end).includes("/*")) return { rest, ok: false };
    rest = rest.slice(0, start) + rest.slice(end + 2);
  }
};

test("コメントがすべて閉じていて、コメントの中に /* が混ざっていない", async () => {
  assert.ok(stripComments(css).ok);
});

test("冒頭のコメントは、タイトルのすぐ後で閉じている。コメントを除くと、最初のルールは :root(表示に関わる記述が、コメントに巻き込まれていない)", async () => {
  const head = css.slice(0, css.indexOf("*/") + 2);
  assert.ok(head.includes("サポートカード style.css") && !head.includes("デザイントークン") && !head.slice(2).includes("/*"));
  assert.ok(/^\s*:root\s*\{/.test(stripComments(css).rest));
});
