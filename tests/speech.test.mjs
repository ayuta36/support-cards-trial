/* ============================================================
   tests/speech.test.mjs ― 読み上げ(S10)
   ------------------------------------------------------------
   対象:js/actions.js の speakTopic・stopSpeak・loadVoices・findLocalJaVoice、js/main.js の音声一覧の準備。
        端末内(localService)の日本語音声だけを使うこと、編集中は読み上げボタンを出さず再描画もしないこと。
   ※各テストは、直前の状態を引き継いで進む。テストは登録した順に実行される。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section } from "./harness.mjs";

const env = createApp();
const { run, get, app, alerts, spoken, voiceHandlers, startSession } = env;

const speakTeam={id:"team_speak",name:"読み上げ",emoji:"🏠",color:"#2F8F83",people:[{id:"sp1",name:"はなちゃん",emoji:"🌸",note:"",photo:null,topicDefs:[{id:"basic",icon:"👤",title:"基本情報",color:"#5B8DB8",desc:""}],topics:{basic:[{label:"名前",value:"山田はな"}]}}]};
const onlineJa={name:"Google 日本語",lang:"ja-JP",localService:false}, localJa={name:"Kyoko",lang:"ja-JP",localService:true}, localEn={name:"Samantha",lang:"en-US",localService:true};

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let lateUtterance;

section("S10:読み上げを端末内の日本語音声に限定");

test("S10:起動時に getVoices() を1回呼び、voiceschanged の監視を登録する", async () => {
  await startSession("speak-pass",[speakTeam],"team_speak");
  run(`view={teamId:"team_speak",screen:"detail",personId:"sp1",topicId:"basic",editing:false,organize:false}; render()`);
  assert.ok(env.atBoot.voiceCalls===1&&env.atBoot.voiceListeners===1);
});

test("S10:オンライン音声と端末内音声の両方があるときは、端末内の日本語音声を選んで読み上げる", async () => {
  env.voiceList=[onlineJa,localEn,localJa];
  await get(`handle("speak",{})`);
  assert.ok(spoken.length===1&&spoken[0].voice===localJa&&spoken[0].lang==="ja-JP"&&spoken[0].text.includes("山田はな")&&get("speaking")===true);
});

test("S10:言語名が ja_JP のような形でも、端末内の日本語音声として選ぶ", async () => {
  run(`speaking=false`);
  const localJaUnderscore={name:"Android日本語",lang:"ja_JP",localService:true};
  env.voiceList=[onlineJa,localEn,localJaUnderscore];
  await get(`handle("speak",{})`);
  assert.ok(spoken.length===2&&spoken[1].voice===localJaUnderscore);
});

test("S10:オンライン音声(と日本語以外の端末内音声)しかないときは、読み上げず、理由を案内する", async () => {
  run(`speaking=false`);
  env.voiceList=[onlineJa,localEn];
  const alertsBeforeNoVoice=alerts.length;
  await get(`handle("speak",{})`);
  assert.ok(spoken.length===2&&get("speaking")===false&&alerts.length===alertsBeforeNoVoice+1&&alerts.at(-1)==="この端末には、インターネットを使わない日本語の読み上げ音声が見つからないため、読み上げを使えません。");
});

test("S10:音声が1つも取得できないときも、読み上げない", async () => {
  run(`voiceCache=[]`); env.voiceList=[];
  await get(`handle("speak",{})`);
  assert.ok(spoken.length===2&&alerts.at(-1)==="この端末には、インターネットを使わない日本語の読み上げ音声が見つからないため、読み上げを使えません。");
});

test("S10:voiceschanged のたびに取得した音声一覧を保持する", async () => {
  env.voiceList=[onlineJa,localJa];
  for(const fn of voiceHandlers) fn();
  assert.ok(get("voiceCache.length")===2);
});

test("S10:読み上げ時に取り直した一覧が空でも、保持している端末内の日本語音声で読み上げる", async () => {
  env.voiceList=[];
  await get(`handle("speak",{})`);
  assert.ok(spoken.length===3&&spoken[2].voice===localJa);
});

test("S10:編集中の画面には読み上げボタンがない", async () => {
  run(`speaking=false; view.editing=true; draft=[{label:"",value:""}]; render()`);
  assert.ok(!app.innerHTML.includes('data-act="speak"')&&app.innerHTML.includes("data-draft-label"));
});

test("S10:編集していない画面には読み上げボタンがある", async () => {
  run(`view.editing=false; render()`);
  assert.ok(app.innerHTML.includes('data-act="speak"'));
});

test("S10:書きこみを始めると、読み上げを止める(終了時の再描画で入力中の下書きが消えない)", async () => {
  run(`speaking=true`);
  const cancelsBeforeStartEdit=env.speechCancels;
  await get(`handle("start-edit",{})`);
  assert.ok(env.speechCancels===cancelsBeforeStartEdit+1&&get("speaking")===false&&get("view.editing")===true&&!app.innerHTML.includes('data-act="speak"'));
});

test("S10:遅れて届いた読み上げの終了通知は、編集中の画面を再描画しない(入力中の下書きを消さない)", async () => {
  lateUtterance=spoken.at(-1);
  app.innerHTML="MARK-EDITING"; lateUtterance.onend(); lateUtterance.onerror();
  assert.ok(app.innerHTML==="MARK-EDITING");
});

test("S10:編集中でなければ、終了通知で表示を更新する(ボタンが「読み上げ」に戻る)", async () => {
  run(`view.editing=false`); app.innerHTML="MARK-VIEWING"; lateUtterance.onend();
  assert.ok(app.innerHTML!=="MARK-VIEWING"&&app.innerHTML.includes('data-act="speak"'));
});
