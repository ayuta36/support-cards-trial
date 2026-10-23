/* ============================================================
   tests/lock-session.test.mjs ― ロックとセッション
   ------------------------------------------------------------
   対象:js/state.js の lockNow・save・unlock・ファイル選択の保留(holdPendingPicker)、
        js/actions.js の写真・共有ファイルの選択(change)、印刷用の領域の消去。
        非表示でのロック、保留したファイルの再開と破棄、保存の失敗と競合、ロック中に終わる非同期処理。
   ※前のテストの結果(端末に保存したデータなど)を後のテストが使うため、順番を変えない。
     取り込みに使う共有ファイル(payload)は makeShare で用意する(share-export.test.mjs では実際の書き出しで作る)。
     テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createApp, test, section, makeTestTeam } from "./harness.mjs";

const env = createApp();
const { run, get, context, app, print, importInput, photoInput, document, localStorage, handlers, windowHandlers, readers, alerts, prompts, makeShare } = env;

const team = makeTestTeam();

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let payload, readersBeforeLockedImport;

section("ピッカー中のロックと保存失敗");

test("非表示時にロックしてから写真を選ぶと、画像処理や認証なしで一時保留", async () => {
  const deviceSalt=webcrypto.getRandomValues(new Uint8Array(16));
  const deviceKey=await get("deriveKey")("device-pass",deviceSalt);
  const deviceEnc=await get("encryptJson")({teams:[team]},deviceKey);
  localStorage.setItem("support-card-local-v1",JSON.stringify({v:1,salt:get("b64")(deviceSalt),...deviceEnc}));
  context.__deviceKey=deviceKey; context.__deviceSalt=deviceSalt;
  run(`teams=[${JSON.stringify(team)}]; stage="ready"; cryptoKey=globalThis.__deviceKey; salt=globalThis.__deviceSalt; view={teamId:"team_test",screen:"person",personId:"empty_person",topicId:null,editing:false,organize:false}; modal="person"; modalDraft={id:"empty_person",name:"そらくん",emoji:"🌱",note:"",photo:null}; photoPickerTarget={teamId:"team_test",personId:"empty_person",isNew:false,expiresAt:Date.now()+180000};`);
  document.hidden=true;
  const photoFile={name:"selected.jpg"}; photoInput.files=[photoFile];
  const readersBeforePhoto=readers.length, promptsBeforePhoto=prompts.length;
  await handlers.photo({target:photoInput});
  for(const fn of handlers.visibilitychange||[])fn(); document.hidden=false;
  assert.ok(get("stage")==="locked"&&get("pendingPicker.type")==="photo"&&get("pendingPicker.file")===photoFile&&readers.length===readersBeforePhoto&&prompts.length===promptsBeforePhoto);
});

test("再解錠後は写真の再開・破棄を明示する", async () => {
  await get(`unlock("device-pass")`);
  assert.ok(get("modal")==="resume-picker"&&app.innerHTML.includes("再開する")&&app.innerHTML.includes("破棄する"));
});

test("確認後に保留写真を現在の解錠セッションで編集対象へ適用", async () => {
  run(`readPhoto=async ()=>"data:image/jpeg;base64,PHOTO"`);
  await get(`handle("resume-picker",{})`);
  assert.ok(get("modal")==="person"&&get("modalDraft.photo")==="data:image/jpeg;base64,PHOTO"&&get("view.personId")==="empty_person");
});

test("ロック後に別の編集画面を開いても遅れて読んだ写真は付かない", async () => {
  run(`modal=null;modalDraft=null;stage="home";view={teamId:null,screen:"list",personId:null,topicId:null,editing:false,organize:false};render()`);
  // A late photo decode must not attach to a different draft after a lock.
  run(`stage="ready";modal="person";view={teamId:"team_test",screen:"person",personId:"empty_person",topicId:null,editing:false,organize:false};modalDraft={id:"empty_person",name:"そらくん",emoji:"🌱",note:"",photo:null};photoPickerTarget={teamId:"team_test",personId:"empty_person",isNew:false,expiresAt:Date.now()+180000};`);
  let releasePhoto, signalPhoto;
  const photoStarted=new Promise(resolve=>{signalPhoto=resolve;});
  context.__startedPhoto=signalPhoto;
  run(`readPhoto=async ()=>{globalThis.__startedPhoto();await new Promise(resolve=>globalThis.__releasePhoto=resolve);return "data:image/jpeg;base64,OLD"}`);
  photoInput.files=[{name:"slow.jpg"}];
  const slowPhoto=handlers.photo({target:photoInput}); await photoStarted;
  await get("lockNow()");
  run(`stage="ready";cryptoKey=globalThis.__deviceKey;modal="person";view={teamId:"team_test",screen:"person",personId:"empty_person",topicId:null,editing:false,organize:false};modalDraft={id:"empty_person",name:"new draft",emoji:"🌱",note:"",photo:null};`);
  releasePhoto=context.__releasePhoto;releasePhoto();await slowPhoto;
  assert.ok(get("modalDraft.name")==="new draft"&&get("modalDraft.photo")===null);
});

test("ロック中に選んだ共有ファイルは読み取らず一時保留", async () => {
  payload=await makeShare("team-pass", { team });   // 共有ファイル(パスコード team-pass)をつくる
  // Import selected during the hidden/locked interval is only read after explicit resume.
  run(`stage="home";modal=null;modalDraft=null;cryptoKey=globalThis.__deviceKey;`);
  document.hidden=true;
  importInput.files=[{text:get("encodeShareMarkdown")(payload)}];
  readersBeforeLockedImport=readers.length;
  const promptsBeforeLockedImport=prompts.length;
  handlers.import({target:importInput});
  for(const fn of handlers.visibilitychange||[])fn();document.hidden=false;
  assert.ok(get("stage")==="locked"&&get("pendingPicker.type")==="import"&&readers.length===readersBeforeLockedImport&&prompts.length===promptsBeforeLockedImport);
});

test("共有ファイルも解錠後に明示選択するまで読み取りを保留", async () => {
  await get(`unlock("device-pass")`);
  assert.ok(get("modal")==="resume-picker"&&readers.length===readersBeforeLockedImport);
});

test("明示再開後の共有ファイルは取り込める", async () => {
  env.promptAnswer="team-pass";
  await get(`handle("resume-picker",{})`);
  assert.ok(get("stage")==="ready"&&get("teams.length")===2&&readers.length===readersBeforeLockedImport+1);
});

test("保留ファイルを破棄すると一時ファイル参照も読み込みも残らない", async () => {
  // Import persistence failure must not navigate to the unpersisted team.
  await get("lockNow()");
  importInput.files=[{text:get("encodeShareMarkdown")(payload)}]; handlers.import({target:importInput});
  await get(`unlock("device-pass")`);
  const readersBeforeDiscard=readers.length;
  await get(`handle("discard-picker",{})`);
  assert.ok(get("pendingPicker")==null&&readers.length===readersBeforeDiscard&&get("modal")==null);
});

test("読み込みの端末保存に失敗すると追加を取り消し画面遷移しない", async () => {
  await get("lockNow()"); await get(`unlock("device-pass")`);
  env.promptAnswer="team-pass"; env.failStoreWrites=true;
  const beforeFailedImport=get("teams.length"), beforeFailedImportView=get("view.teamId");
  importInput.files=[{text:get("encodeShareMarkdown")(payload)}]; handlers.import({target:importInput});
  await readers.at(-1).completion;
  env.failStoreWrites=false;
  assert.ok(get("teams.length")==beforeFailedImport&&get("view.teamId")==beforeFailedImportView&&get("stage")==="home");
});

test("保存失敗はfalseを返し保存済みスナップショットへ戻す", async () => {
  // A storage failure restores the last successfully persisted data and cannot report success.
  const nameBeforeFailure=get("teams[0].name"), toastsBeforeFailure=env.toastShows;
  run(`teams[0].name="未保存の変更"`);
  env.failStoreWrites=true;
  const failureAlertsBefore=alerts.length;
  const saveResult=await get("save()");
  env.failStoreWrites=false;
  assert.ok(saveResult===false&&get("teams[0].name")==="やまだ家"&&alerts.length===failureAlertsBefore+1&&env.toastShows===toastsBeforeFailure);
});

test("同じ端末セッションの重複保存は最新スナップショットだけを書き込み古い結果で巻き戻さない", async () => {
  // The newest same-session save wins even if its encryption finishes first.
  const saveStarts=[];
  context.__realEncryptJson=get("encryptJson");
  run(`encryptJson=(...args)=>{const n=globalThis.__saveStarts.length;let signal;const started=new Promise(resolve=>signal=resolve);globalThis.__saveStarts.push({signal,started});return (async()=>{await started;return globalThis.__realEncryptJson(...args)})()}`);
  context.__saveStarts=[];
  run(`teams[0].name="古い保存"`);
  const saveOne=get("save()");
  while(context.__saveStarts.length<1) await new Promise(resolve=>setTimeout(resolve,0));
  run(`teams[0].name="最新の保存"`);
  const saveTwo=get("save()");
  while(context.__saveStarts.length<2) await new Promise(resolve=>setTimeout(resolve,0));
  context.__saveStarts[1].signal();
  const saveTwoResult=await saveTwo;
  context.__saveStarts[0].signal();
  const saveOneResult=await saveOne;
  run(`encryptJson=globalThis.__realEncryptJson`);
  const newestStored=JSON.parse(localStorage.getItem("support-card-local-v1"));
  const newestRestored=await get("decryptJson")(newestStored,await get("deriveKey")("device-pass",get("unb64")(newestStored.salt)));
  assert.ok(saveTwoResult===true&&saveOneResult===false&&newestRestored.teams[0].name==="最新の保存"&&get("persistedTeams[0].name")==="最新の保存");
});

test("暗号化保存中にロックすると遅れて完了した保存は書き込まない", async () => {
  // Lock during encryption prevents a stale write from reaching storage.
  const storedBeforeLockSave=localStorage.getItem("support-card-local-v1");
  let releaseSaveEncrypt, signalSaveEncrypt;
  const saveEncryptStarted=new Promise(resolve=>{signalSaveEncrypt=resolve;});
  context.__startedSaveEncrypt=signalSaveEncrypt; context.__realEncryptJson=get("encryptJson");
  run(`encryptJson=async (...args)=>{globalThis.__startedSaveEncrypt();await new Promise(resolve=>globalThis.__releaseSaveEncrypt=resolve);return globalThis.__realEncryptJson(...args)}`);
  const lockDuringSave=get("save()");await saveEncryptStarted;await get("lockNow()");
  context.__releaseSaveEncrypt();await lockDuringSave;
  run(`encryptJson=globalThis.__realEncryptJson`);
  assert.ok(localStorage.getItem("support-card-local-v1")===storedBeforeLockSave&&get("stage")==="locked");
});

section("ロック時の印刷情報消去");

test("ロック時に印刷DOMと編集中ドラフトを消去", async () => {
  print.innerHTML="<h1>機密情報</h1>";
  run(`draft=[{label:"内緒",value:"内容"}]; stage="ready"; lockNow()`);
  assert.ok(print.innerHTML===""&&get("draft.length")===0);
});

test("印刷終了後も印刷DOMが空", async () => {
  print.innerHTML="<h1>印刷中の内容</h1>";
  for(const fn of windowHandlers.afterprint||[]) fn();
  assert.ok(print.innerHTML==="");
});
