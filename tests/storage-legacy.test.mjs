/* ============================================================
   tests/storage-legacy.test.mjs ― 保存と旧データ(初期設定の失敗・S4・S5)
   ------------------------------------------------------------
   対象:js/state.js の setupNew・dropLegacyIfVerified・requestPersist・lastSavedLabel、
        設定画面(js/views.js)の旧データの削除ボタンと保存データの表示、js/actions.js の purge-legacy。
   ※各テストは、直前の状態を引き継いで進む。テストは登録した順に実行される。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, listView, nextTick } from "./harness.mjs";

const env = createApp();
const { run, get, context, app, localStorage, confirms, navigatorStub } = env;

const legacyPeople=[{id:"old1",name:"旧1",emoji:"🌸",note:"",photo:null},{id:"old2",name:"旧2",emoji:"🐻",note:"x",photo:null}];
const resetForSetup=()=>run(`stage="setup-pass"; cryptoKey=null; salt=null; teams=[]; persistedTeams=[]; screenError=""; modal=null; modalDraft=null; ${listView(null)}`);

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let currentStoreBeforePurge, persistBeforeSetup, persistBeforeWrongPass;

section("初回設定の保存失敗");

test("初回保存に失敗すると成功画面へ進まず設定をやり直せる", async () => {
  const storedBeforeSetupFailure=localStorage.getItem("support-card-local-v1");
  run(`stage="setup-pass";cryptoKey=null;salt=null;teams=[];screenError=""`);
  env.failStoreWrites=true;
  await get(`setupNew("initial-pass")`);
  env.failStoreWrites=false;
  assert.ok(get("stage")==="setup-pass"&&get("cryptoKey")==null&&get("teams.length")===0&&app.innerHTML.includes("初期設定を保存できませんでした")&&localStorage.getItem("support-card-local-v1")===storedBeforeSetupFailure);
});

section("S4:旧版の平文データの整理");

test("S4:旧データの引き継ぎを確認できたら(今の鍵で読み戻して人数が一致)、旧キーを削除する", async () => {
  localStorage.setItem("support-card-data-v2",JSON.stringify({people:legacyPeople}));
  resetForSetup();
  await get(`setupNew("legacy-pass-1")`);
  const migratedStored=JSON.parse(localStorage.getItem("support-card-local-v1"));
  const migratedData=await get("decryptJson")(migratedStored,await get("deriveKey")("legacy-pass-1",get("unb64")(migratedStored.salt)));
  assert.ok(get("stage")==="home"&&get("teams[0].people.length")===2&&migratedData.teams[0].people.length===2&&localStorage.getItem("support-card-data-v2")===null);
});

test("S4:読み戻した人数が引き継いだ人数と合わなければ、旧キーを残す(引き継ぎ自体は成功する)", async () => {
  localStorage.setItem("support-card-data-v2",JSON.stringify({people:legacyPeople}));
  resetForSetup();
  context.__realDecryptJson=get("decryptJson");
  run(`decryptJson=async()=>({teams:[{people:[{}]}]})`);
  await get(`setupNew("legacy-pass-2")`);
  run(`decryptJson=globalThis.__realDecryptJson`);
  assert.ok(get("stage")==="home"&&get("teams[0].people.length")===2&&localStorage.getItem("support-card-data-v2")!==null);
});

test("S4:今の鍵で読み戻せなければ(復号に失敗すれば)、旧キーを残す", async () => {
  resetForSetup();
  run(`decryptJson=async()=>{ throw new Error("cannot decrypt"); }`);
  await get(`setupNew("legacy-pass-3")`);
  run(`decryptJson=globalThis.__realDecryptJson`);
  assert.ok(get("stage")==="home"&&localStorage.getItem("support-card-data-v2")!==null);
});

test("S4:新しい暗号化保存の書き込みに失敗したときは、旧キーを削除しない", async () => {
  resetForSetup(); env.failStoreWrites=true;
  await get(`setupNew("legacy-pass-4")`);
  env.failStoreWrites=false;
  assert.ok(get("stage")==="setup-pass"&&localStorage.getItem("support-card-data-v2")!==null);
});

test("S4:引き継ぎの対象でない旧データ(encつき)は、引き継がず、削除もしない", async () => {
  localStorage.setItem("support-card-data-v2",JSON.stringify({enc:true,people:legacyPeople}));
  resetForSetup();
  await get(`setupNew("legacy-pass-5")`);
  assert.ok(get("stage")==="home"&&get("teams[0].people.length")===1&&get("teams[0].people[0].id")==="sample"&&localStorage.getItem("support-card-data-v2")!==null);
});

test("S4:旧データが残っているときは、設定の「セキュリティ」欄に説明と削除ボタンを表示する", async () => {
  run(`modal="settings"; render()`);
  const settingsHtml=app.innerHTML;
  assert.ok(settingsHtml.includes("以前の版（暗号化なし）のデータがこの端末に残っています。")&&settingsHtml.includes('data-act="purge-legacy"')&&settingsHtml.includes(">古いデータを削除する</button>")&&settingsHtml.indexOf(">セキュリティ</div>")<settingsHtml.indexOf("以前の版（暗号化なし）")&&settingsHtml.indexOf("以前の版（暗号化なし）")<settingsHtml.indexOf(">保存データ</div>"));
});

test("S4:確認で「いいえ」を選ぶと削除しない。確認の文面は仕様どおり", async () => {
  currentStoreBeforePurge=localStorage.getItem("support-card-local-v1");
  const confirmsBeforePurge=confirms.length;
  env.confirmAnswer=false;
  await get(`handle("purge-legacy",{})`);
  env.confirmAnswer=true;
  assert.ok(localStorage.getItem("support-card-data-v2")!==null&&confirms.length===confirmsBeforePurge+1&&confirms.at(-1)==="以前の版で暗号化せずに保存されたデータを削除します。現在のデータ（暗号化済み）は消えません。元に戻せません。削除しますか？");
});

test("S4:確認してOKすると旧データだけを削除する(現在の暗号化データは変わらず、設定の表示も消える)", async () => {
  await get(`handle("purge-legacy",{})`);
  assert.ok(localStorage.getItem("support-card-data-v2")===null&&localStorage.getItem("support-card-local-v1")===currentStoreBeforePurge&&!app.innerHTML.includes("古いデータを削除する")&&!app.innerHTML.includes("以前の版（暗号化なし）"));
});

section("S5:保存データの消失への対策");

test("S5:初回設定に成功した後に navigator.storage.persist() を1回呼び、結果(true)を変数に記録する", async () => {
  run(`modal=null; storagePersisted=null`);
  resetForSetup();
  persistBeforeSetup=env.persistCalls;
  await get(`setupNew("persist-pass")`); await nextTick();
  assert.ok(get("stage")==="home"&&env.persistCalls===persistBeforeSetup+1&&get("storagePersisted")===true);
});

test("S5:解錠に成功した後にも1回呼び、拒否された結果(false)を記録する", async () => {
  env.persistResult=false;
  await get("lockNow()"); await get(`unlock("persist-pass")`); await nextTick();
  env.persistResult=true;
  assert.ok(get("stage")==="home"&&env.persistCalls===persistBeforeSetup+2&&get("storagePersisted")===false);
});

test("S5:解錠に失敗したとき(パスコード違い)は呼ばない", async () => {
  persistBeforeWrongPass=env.persistCalls;
  await get("lockNow()"); await get(`unlock("not-the-passcode")`);
  assert.ok(get("stage")==="locked"&&env.persistCalls===persistBeforeWrongPass);
});

test("S5:persist() が例外になっても無視され、解錠は成功する(状態は不明のまま)", async () => {
  run(`storagePersisted=null`); env.persistThrows=true;
  await get(`unlock("persist-pass")`); await nextTick();
  env.persistThrows=false;
  assert.ok(get("stage")==="home"&&get("storagePersisted")===null&&env.persistCalls===persistBeforeWrongPass+1);
});

test("S5:navigatorがない環境でも解錠できる(呼ばない)", async () => {
  const navigatorBackup=context.navigator; delete context.navigator;
  await get("lockNow()"); await get(`unlock("persist-pass")`); await nextTick();
  context.navigator=navigatorBackup;
  assert.ok(get("stage")==="home"&&get("storagePersisted")===null&&env.persistCalls===persistBeforeWrongPass+1);
});

test("S5:すでに保持が許可済み(persisted()=true)なら persist() を呼ばず、許可済みとして記録する", async () => {
  navigatorStub.storage.persisted=async()=>true;
  const persistBeforeGranted=env.persistCalls;
  await get("lockNow()"); await get(`unlock("persist-pass")`); await nextTick();
  delete navigatorStub.storage.persisted;
  assert.ok(get("stage")==="home"&&env.persistCalls===persistBeforeGranted&&get("storagePersisted")===true);
});

test("S5:設定に「最後に保存: 月/日 時:分」の形で、保存データのsavedAtを表示する", async () => {
  run(`modal="settings"; storagePersisted=true; render()`);
  const savedAtIso=JSON.parse(localStorage.getItem("support-card-local-v1")).savedAt;
  const savedAtLabel=new Date(savedAtIso).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  assert.ok(/\d/.test(savedAtLabel)&&app.innerHTML.includes("最後に保存: "+savedAtLabel));
});

test("S5:保持を許可済みのときは「保持を許可済み」と表示する", async () => {
  assert.ok(app.innerHTML.includes("保持を許可済み")&&!app.innerHTML.includes("ブラウザーが自動で消す場合があります"));
});

test("S5:許可がないとき(拒否・不明)は「ブラウザーが自動で消す場合があります」と表示する", async () => {
  run(`storagePersisted=false; render()`);
  const notPersistedHtml=app.innerHTML;
  run(`storagePersisted=null; render()`);
  assert.ok(notPersistedHtml.includes("ブラウザーが自動で消す場合があります")&&!notPersistedHtml.includes("保持を許可済み")&&app.innerHTML.includes("ブラウザーが自動で消す場合があります"));
});

test("S5:iPhoneのSafariで7日以上開かないとデータが消えることがある注意と、共有ファイルで控えを残す案内を表示する", async () => {
  assert.ok(app.innerHTML.includes("iPhoneのSafariでは、しばらく（目安7日以上）このアプリを開かないと、保存データが消えることがあります。大切な内容は、共有ファイルで控えを残してください。"));
  run(`modal=null; render()`);
});
