/* ============================================================
   tests/share-export.test.mjs ― 共有ファイルの書き出しと読み込み
   ------------------------------------------------------------
   対象:js/actions.js の share-team・share-proceed・processImportFile、js/crypto.js、
        書き出しの案内文・ファイル名(S11)・URL の解放(S14)、共有中・読み込み中・解錠中のロック。
   ※前のテストの結果(payload など)を後のテストが使うため、順番を変えない。
     テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createApp, test, section, makeTestTeam } from "./harness.mjs";

const env = createApp();
const { run, get, context, app, importInput, localStorage, handlers, imported, readers, downloads, alerts, prompts, timers, revoked, startSession } = env;

const team = makeTestTeam();   // 事前確認・書き出し・読み込みに使うチーム(2人。細工した ID・写真・一覧にないトピックを含む)

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let revokedBeforeExport, alertsBeforeExport, exportAlert, revokedRightAfterExport, revokeTimers, payload, correctKey;

section("実際のアプリ関数:暗号化と共有");

test("読み込んだIDや写真属性がHTML属性を壊さない", async () => {
  await startSession("test-device", [team], "team_test");
  run(`view={teamId:"team_test",screen:"list",personId:null,topicId:null,editing:false,organize:false}; render()`);
  assert.ok(!app.innerHTML.includes('data-id="person_test"><button')&&!app.innerHTML.includes('onerror="alert(1)"'));
});

test("事前確認に全員、紹介文、写真、トピック本文、空項目、一覧にない項目が表示される", async () => {
  await get(`handle("share-team",{})`);
  await get(`handle("share-audience",{v:"all"})`);   // 書き出す相手の初期値は学生向け。従来の「全部を書き出す」内容は「すべて」を選んだときの表示
  assert.ok(app.innerHTML.includes("はなちゃん")&&app.innerHTML.includes("そらくん")&&app.innerHTML.includes("紹介文")&&app.innerHTML.includes("写真")&&app.innerHTML.includes("基本情報")&&app.innerHTML.includes("独自&lt;項目&gt;")&&app.innerHTML.includes("保護者のみ")&&app.innerHTML.includes("保持")&&app.innerHTML.includes("睡眠")&&app.innerHTML.includes("一覧にない保存済みトピック")&&app.innerHTML.includes("全情報"));
});

test("事前確認に表示するトピック本文はHTMLとして実行されない", async () => {
  run(`teams[0].people[0].topics.communication=[{label:"",value:'<img src=x onerror="alert(1)">'}]`);
  await get(`handle("share-team",{})`);
  await get(`handle("share-audience",{v:"all"})`);
  assert.ok(app.innerHTML.includes("&lt;img src=x")&&!app.innerHTML.includes('<img src=x onerror="alert(1)">'));
  await get(`handle("close-modal",{})`);
  context.__originalCommunication=team.people[0].topics.communication;
  run(`teams[0].people[0].topics.communication=structuredClone(globalThis.__originalCommunication);globalThis.__originalCommunication=null`);
});

test("キャンセルするとパスコード入力もファイル作成も始まらない", async () => {
  await get(`handle("close-modal",{})`);
  assert.ok(prompts.length===0&&downloads.length===0);
});

test("確認後に暗号化Markdownを準備し、保存操作で現在の team-share v1 形式を出す", async () => {
  await get(`handle("share-team",{})`);
  await get(`handle("share-audience",{v:"all"})`);   // 従来の「チーム全体を書き出す」動作は、相手に「すべて」を選んだとき
  const timersBeforeExport=timers.length;
  revokedBeforeExport=revoked.length;
  alertsBeforeExport=alerts.length;
  await get(`handle("share-proceed",{})`);
  assert.strictEqual(get("modal"),"share-pass-create");
  assert.ok(app.innerHTML.includes('id="share-pass1" type="password"')&&app.innerHTML.includes('label class="m-label" for="share-pass1"')&&app.innerHTML.includes('data-act="toggle-share-pass"'));
  env.passwordInputs["share-pass1"].value="team-pass";
  env.passwordInputs["share-pass2"].value="different";
  await get(`handle("share-pass-submit",{})`);
  assert.strictEqual(get("modal"),"share-pass-create");
  assert.strictEqual(env.passwordInputs["share-pass1"].value,"team-pass");
  assert.strictEqual(env.passwordInputs["share-pass2"].value,"different");
  assert.strictEqual(env.passwordInputs["share-pass-error"].textContent,"2回の入力が一致しません");
  env.passwordInputs["share-pass2"].value="team-pass";
  await get(`handle("share-pass-submit",{})`);
  assert.strictEqual(get("modal"),"share-ready");
  assert.strictEqual(downloads.length,0);   // 暗号化後にもう一度、保存または端末共有を選ぶ
  await get(`handle("share-download",{})`);
  exportAlert=alerts.at(-1), revokedRightAfterExport=revoked.length-revokedBeforeExport;
  revokeTimers=timers.slice(timersBeforeExport).filter(t=>t.ms===30000);
  assert.ok(downloads.length===1&&/^support-card-share-\d{8}-\d{4}\.md$/.test(downloads[0].download));
});

test("既存の暗号化ファイル v1 構造を保持", async () => {
  payload=get("parseShareMarkdown")(await imported[0].text());
  assert.ok(payload.app==="support-card"&&payload.type==="team-share"&&payload.v===1&&payload.salt&&payload.iv&&payload.data);
});

test("実際のアプリ暗号関数で復号するとチーム全体が一致", async () => {
  correctKey=await get("deriveKey")("team-pass",get("unb64")(payload.salt));
  const decrypted=await get("decryptJson")(payload,correctKey);
  assert.ok(JSON.stringify(decrypted.team)===JSON.stringify(team));
});

test("空の共有パスコードでは読み込み画面に留まり、キャンセルで閉じられる", async () => {
  const count=await env.importShare(payload,"");
  assert.strictEqual(count,0);
  assert.strictEqual(get("modal"),"share-pass-import");
  assert.strictEqual(env.passwordInputs["share-import-pass-error"].textContent,"パスコードを入力してください");
  await get(`handle("close-modal",{})`);
  assert.strictEqual(get("modal"),null);
});

test("誤ったパスコードを拒否", async () => {
  let wrongRejected=false;
  try { await get("decryptJson")(payload,await get("deriveKey")("wrong-pass",get("unb64")(payload.salt))); } catch { wrongRejected=true; }
  assert.ok(wrongRejected);
});

test("改ざんされた暗号文を拒否", async () => {
  const tamperedBytes=get("unb64")(payload.data);
  tamperedBytes[3]^=0xff;
  const tampered={...payload,data:get("b64")(tamperedBytes)};
  let tamperRejected=false;
  try { await get("decryptJson")(tampered,correctKey); } catch { tamperRejected=true; }
  assert.ok(tamperRejected);
});

section("S11・S14:書き出しの案内・ファイル名・URL解放");

test("書き出し完了の案内は、ファイルとパスコードを別の方法で渡すことと、渡したコピーを回収できないことを伝える", async () => {
  assert.ok(alerts.length===alertsBeforeExport+1&&exportAlert.includes("暗号化した .md ファイル")&&exportAlert.includes("このアプリでは確認できません"));
});

test("S11:共有ファイル名はASCIIだけの support-card-share-YYYYMMDD-HHMM.md で、チーム名(やまだ家)を含まない", async () => {
  const exportName=downloads[0].download, exportStamp=exportName.match(/^support-card-share-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.md$/);
  const exportStampTime=exportStamp&&new Date(+exportStamp[1],+exportStamp[2]-1,+exportStamp[3],+exportStamp[4],+exportStamp[5]).getTime();
  assert.ok(!!exportStamp&&/^[\x20-\x7e]+$/.test(exportName)&&!exportName.includes("やまだ")&&Math.abs(Date.now()-exportStampTime)<5*60*1000);
});

test("S11:日時は端末のローカル時刻で、月日時分を0埋めする", async () => {
  assert.ok(get("shareFileName")(new Date(2026,0,5,7,3))==="support-card-share-20260105-0703.md"&&get("shareFileName")(new Date(2026,11,31,23,59))==="support-card-share-20261231-2359.md");
});

test("S14:ダウンロード直後はURLを解放せず、30秒後に解放する", async () => {
  revokeTimers[0]?.fn();
  assert.ok(revokedRightAfterExport===0&&revokeTimers.length===1&&revoked.length===revokedBeforeExport+1&&revoked.at(-1)==="blob:test");
});

section("実際のアプリ関数:共有中のロックと読み込み");

test("共有パスコード入力中のキャンセルとロックは承認内容を破棄し、ファイルを作らない", async () => {
  const before=downloads.length;
  await get(`handle("share-team",{})`);
  await get(`handle("share-proceed",{})`);
  assert.strictEqual(get("modal"),"share-pass-create");
  await get(`handle("close-modal",{})`);
  assert.strictEqual(get("shareApproval"),null);
  await env.submitSharePasscode("stale-pass");
  assert.strictEqual(get("modal"),"share-preflight");
  assert.strictEqual(downloads.length,before);

  await get(`handle("close-modal",{})`);
  await get(`handle("share-team",{})`);
  await get(`handle("share-proceed",{})`);
  await get("lockNow()");
  assert.strictEqual(get("shareApproval"),null);
  await env.submitSharePasscode("stale-pass");
  assert.strictEqual(get("stage"),"locked");
  assert.strictEqual(get("modal"),null);
  assert.strictEqual(downloads.length,before);
});

test("共有パスコード入力中にロックすると読み込み待ちが解決し、チームも画面も復帰しない", async () => {
  context.__testKey=correctKey;
  run(`teams=[]; stage="ready"; cryptoKey=globalThis.__testKey; modal=null;`);
  const before=get("teams.length");
  importInput.files=[{text:get("encodeShareMarkdown")(payload)}];
  handlers.import({target:importInput});
  await Promise.resolve();
  assert.strictEqual(get("modal"),"share-pass-import");
  await get("lockNow()");
  await readers.at(-1).completion;
  assert.strictEqual(get("teams.length"),before);
  assert.strictEqual(get("stage"),"locked");
  assert.strictEqual(get("modal"),null);
  await startSession("test-device",[team],"team_test");
});

test("共有暗号化の待機中にロックするとダウンロードを中止", async () => {
  await get(`handle("share-team",{})`);
  const realDerive=get("deriveKey");
  let releaseDerive;
  let startedDerive;
  const started=new Promise(resolve=>{startedDerive=resolve;});
  run(`deriveKey=async (...args)=>{ globalThis.__startedDerive(); await new Promise(resolve=>globalThis.__releaseDerive=resolve); return globalThis.__realDerive(...args); }`);
  context.__startedDerive=startedDerive; context.__releaseDerive=null; context.__realDerive=realDerive;
  const beforeLockedShare=downloads.length;
  const pending=get(`handle("share-proceed",{})`);
  const submitting=env.submitSharePasscode("second-pass");
  await started;
  await get("lockNow()");
  releaseDerive=context.__releaseDerive;
  releaseDerive();
  await submitting;
  await pending;
  run(`deriveKey=globalThis.__realDerive`);
  assert.ok(downloads.length===beforeLockedShare);
});

test("確認後にデータが編集されても承認済みスナップショットを共有", async () => {
  await startSession("snapshot-device", [team], "team_test");
  run(`view={teamId:"team_test",screen:"list",personId:null,topicId:null,editing:false,organize:false};`);
  await get(`handle("share-team",{})`);
  await get(`handle("share-audience",{v:"all"})`);   // 基本情報(運営向け)も含めて確かめるため、「すべて」を選ぶ
  let snapshotStarted;
  const snapshotWaiting=new Promise(resolve=>{snapshotStarted=resolve;});
  context.__startedSnapshot=snapshotStarted;
  run(`deriveKey=async (...args)=>{ globalThis.__startedSnapshot(); await new Promise(resolve=>globalThis.__releaseSnapshot=resolve); return globalThis.__realDerive(...args); }`);
  const snapshotExport=get(`handle("share-proceed",{})`);
  const submittingSnapshot=env.submitSharePasscode("snapshot-pass");
  await snapshotWaiting;
  run(`teams[0].name="変更後のチーム名"; teams[0].people[0].topics.basic[0].value="変更後の内容"`);
  context.__releaseSnapshot();
  await submittingSnapshot;
  await snapshotExport;
  run(`deriveKey=globalThis.__realDerive`);
  await get(`handle("share-download",{})`);
  const snapshotPayload=get("parseShareMarkdown")(await imported.at(-1).text());
  const snapshotKey=await get("deriveKey")("snapshot-pass",get("unb64")(snapshotPayload.salt));
  const snapshotTeam=(await get("decryptJson")(snapshotPayload,snapshotKey)).team;
  assert.ok(snapshotTeam.name==="やまだ家"&&snapshotTeam.people[0].topics.basic[0].value==="山田");
});

test("共有ファイル読み込みで新しいチームとして追加できる", async () => {
  context.__testKey=correctKey;
  context.__testSalt=get("unb64")(payload.salt);
  run(`deriveKey=globalThis.__realDerive`);
  run(`teams=[]; stage="ready"; cryptoKey=globalThis.__testKey; salt=globalThis.__testSalt; view={teamId:null,screen:"list",personId:null,topicId:null,editing:false,organize:false};`);
  importInput.files=[{text:get("encodeShareMarkdown")(payload)}];
  handlers.import({target:importInput});
  await Promise.resolve();
  env.passwordInputs["share-import-pass"].value="team-pass";
  await get(`handle("import-pass-submit",{})`);
  await readers.at(-1).completion;
  const importedTeams=get("teams");
  assert.ok(importedTeams.length===1&&importedTeams[0].name==="やまだ家"&&importedTeams[0].id!==team.id);
});

test("読み込み後のチームは端末のv1暗号化保存にも残る", async () => {
  const storedLocal=JSON.parse(localStorage.getItem("support-card-local-v1"));
  const storedKey=await get("deriveKey")("team-pass",get("unb64")(storedLocal.salt));
  const restored=await get("decryptJson")(storedLocal,storedKey);
  assert.ok(restored.teams.length===1&&restored.teams[0].name==="やまだ家");
});

test("旧形式カードに既定トピックと空の内容を補う", async () => {
  const legacy=get("normalizeTeam")({id:"legacy",name:"古い形式",people:[{id:"old-person",name:"旧カード"}]});
  assert.ok(legacy.people[0].topicDefs.length>0&&JSON.stringify(legacy.people[0].topics)==="{}");
});

test("復号中にロックすると読み込みがチーム追加や画面復帰をしない", async () => {
  run(`teams=[]; stage="ready"; cryptoKey=globalThis.__testKey;`);
  let releaseImportDerive;
  let startImportDerive;
  const importDeriveStarted=new Promise(resolve=>{startImportDerive=resolve;});
  context.__startedDerive=startImportDerive;
  run(`deriveKey=async (...args)=>{ globalThis.__startedDerive(); await new Promise(resolve=>globalThis.__releaseDerive=resolve); return globalThis.__realDerive(...args); }`);
  const beforeLockedImport=get("teams.length");
  importInput.files=[{text:get("encodeShareMarkdown")(payload)}];
  handlers.import({target:importInput});
  await Promise.resolve();
  env.passwordInputs["share-import-pass"].value="team-pass";
  await get(`handle("import-pass-submit",{})`);
  await importDeriveStarted;
  await get("lockNow()");
  releaseImportDerive=context.__releaseDerive;
  releaseImportDerive();
  await readers.at(-1).completion;
  assert.ok(get("teams.length")===beforeLockedImport&&get("stage")==="locked");
});

test("ロック後に完了した解錠処理で画面や鍵を復帰しない", async () => {
  run(`deriveKey=globalThis.__realDerive`);
  const unlockSalt=webcrypto.getRandomValues(new Uint8Array(16));
  const unlockEnc=await get("encryptJson")({teams:[team]},correctKey);
  localStorage.setItem("support-card-local-v1",JSON.stringify({v:1,salt:get("b64")(unlockSalt),...unlockEnc}));
  run(`teams=[]; stage="locked"; cryptoKey=null; salt=null;`);
  let startUnlock;
  const unlockStarted=new Promise(resolve=>{startUnlock=resolve;});
  context.__startedUnlock=startUnlock;
  run(`deriveKey=async ()=>{ globalThis.__startedUnlock(); await new Promise(resolve=>globalThis.__releaseUnlock=resolve); return globalThis.__testKey; }`);
  const lateUnlock=get(`unlock("ignored")`);
  await unlockStarted;
  await get("lockNow()");
  context.__releaseUnlock();
  await lateUnlock;
  assert.ok(get("stage")==="locked"&&get("teams.length")===0&&get("cryptoKey")===null);
  run(`deriveKey=globalThis.__realDerive`);
});
