/* ============================================================
   tests/base64-crypto.test.mjs ― Base64変換・暗号・共有パスコード(S1・S9)
   ------------------------------------------------------------
   対象:js/util.js の b64・unb64、js/crypto.js の deriveKey・encryptJson・decryptJson・decryptShared、
        写真つきの大きなデータの保存・共有、共有パスコードの全角・半角の統一(NFKC)。
   ※S1 の後半と S9 は、アプリの状態(unlock・共有の書き出し・読み込み)を順に使う。
     テストは登録した順に実行される。このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createApp, test, section, plain, listView } from "./harness.mjs";

const env = createApp();
const { run, get, context, localStorage, downloads, alerts, startSession, makeShare, importShare, exportShare } = env;

// S9 では deriveKey を差し替えて呼び出し回数を数える。元の関数を先に控えておく
const realDerive = get("deriveKey");
context.__realDerive = realDerive;

const B64_CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const bigPhotos=Array.from({length:8},()=>"data:image/jpeg;base64,"+Array.from(randomBytes(80000),byte=>B64_CHARS[byte&63]).join(""));
const bigTeam={id:"team_big",name:"写真つきの家族",emoji:"🏠",color:"#2F8F83",people:bigPhotos.map((photo,i)=>({id:`big_${i+1}`,name:`人物${i+1}`,emoji:"🌸",note:`ひとこと${i+1}`,photo,topicDefs:plain(get("DEFAULT_TOPICS")),topics:{basic:[{label:"名前",value:`人物${i+1}`}]}}))};
const s9Team={id:"team_s9",name:"ひなた家",emoji:"🏠",color:"#4E8FB8",people:[{id:"hina",name:"ひなた",emoji:"🌸",note:"ひとこと",photo:null,topicDefs:[{id:"basic",icon:"👤",title:"基本情報",color:"#5B8DB8",desc:"名前"}],topics:{basic:[{label:"名前",value:"ひなた"}]}}]};

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let b64Failures, bigShare, s9Payload, deriveCalls;

section("S1:Base64変換の分割と、写真つきデータの保存・共有");

test("S1:b64は0〜1,000,000バイトの乱数列(Uint8Array)で、Bufferのbase64と1文字も違わない", async () => {
  b64Failures={uint8:[],buffer:[],unb64:[]};
  for(const n of [0,1,100,65535,65536,65537,200000,1000000]){
    const bytes=new Uint8Array(randomBytes(n)), expected=Buffer.from(bytes).toString("base64");
    if(get("b64")(bytes)!==expected) b64Failures.uint8.push(n);
    if(get("b64")(bytes.buffer)!==expected) b64Failures.buffer.push(n);
    if(!Buffer.from(get("unb64")(expected)).equals(Buffer.from(bytes))) b64Failures.unb64.push(n);
  }
  assert.ok(b64Failures.uint8.length===0);
});

test("S1:b64はArrayBufferを渡しても同じ結果になる", async () => {
  assert.ok(b64Failures.buffer.length===0);
});

test("S1:unb64で元のバイト列に戻せる", async () => {
  assert.ok(b64Failures.unb64.length===0);
});

test("S1:60KBの写真つき人物8人のチームでも、save()がtrueを返して暗号化データが保存される", async () => {
  await startSession("big-pass",[bigTeam],"team_big");
  const alertsBeforeBig=alerts.length;
  const bigSaved=await get("save()");
  const bigStored=localStorage.getItem("support-card-local-v1");
  assert.ok(bigSaved===true&&alerts.length===alertsBeforeBig&&bigStored.length>600000);
});

test("S1:保存した写真つきデータを、unlockで正しく復号できる(人数・名前・写真がすべて一致)", async () => {
  await get("lockNow()"); await get(`unlock("big-pass")`);
  assert.ok(get("stage")==="home"&&get("teams[0].people.length")===8&&bigPhotos.every((photo,i)=>get(`teams[0].people[${i}].photo`)===photo&&get(`teams[0].people[${i}].name`)==="人物"+(i+1)));
});

test("S1:同じ写真つきチームを、共有ファイル(v1形式)として書き出せる", async () => {
  bigShare=await exportShare("team_big","big-share-pass");
  assert.ok(!!bigShare&&bigShare.v===1&&bigShare.data.length>600000);
});

test("S1:書き出した写真つきの共有ファイルを読み込める(人数・名前・写真が一致)", async () => {
  run(`teams=[]; persistedTeams=[]; ${listView(null)}`);
  assert.ok(await importShare(bigShare,"big-share-pass")===1&&get("teams[0].name")==="写真つきの家族"&&get("teams[0].people.length")===8&&bigPhotos.every((photo,i)=>get(`teams[0].people[${i}].photo`)===photo));
});

section("S9:共有パスコードの全角・半角");

test("S9:全角で決めた共有パスコードは、NFKCで統一した値(hana2025)で暗号化される", async () => {
  await startSession("s9-pass",[s9Team],"team_s9");
  s9Payload=await exportShare("team_s9","ｈａｎａ２０２５");
  const s9Salt=get("unb64")(s9Payload.salt);
  let halfWidthOpens=false, fullWidthOpens=true;
  try{ await get("decryptJson")(s9Payload, await get("deriveKey")("hana2025",s9Salt)); halfWidthOpens=true; }catch{}
  try{ await get("decryptJson")(s9Payload, await get("deriveKey")("ｈａｎａ２０２５",s9Salt)); }catch{ fullWidthOpens=false; }
  assert.ok(halfWidthOpens&&!fullWidthOpens);
});

test("S9:「ｈａｎａ２０２５」で書き出したファイルを「hana2025」で読み込める(1回で成功)", async () => {
  deriveCalls=0;
  context.__countDerive=(...args)=>{ deriveCalls++; return realDerive(...args); };
  run(`deriveKey=globalThis.__countDerive`);
  assert.ok(await importShare(s9Payload,"hana2025")===1&&deriveCalls===1);
});

test("S9:「ｈａｎａ２０２５」のまま入力しても、入力どおり→統一した値の順に試して読み込める(2回)", async () => {
  deriveCalls=0;
  assert.ok(await importShare(s9Payload,"ｈａｎａ２０２５")===1&&deriveCalls===2);
});

test("S9:旧方式(統一せず「ｈａｎａ２０２５」で暗号化)のファイルも、同じ入力で読み込める(入力どおりの1回目で成功)", async () => {
  const oldStyleShare=await makeShare("ｈａｎａ２０２５",{team:s9Team});   // 旧版:統一せず、入力どおりの値で暗号化
  deriveCalls=0;
  assert.ok(await importShare(oldStyleShare,"ｈａｎａ２０２５")===1&&deriveCalls===1);
});

test("S9:違うパスコードでは読み込めない。統一しても変わらない入力では、やり直さない(1回だけ試す)", async () => {
  deriveCalls=0;
  const alertsBeforeWrongPass=alerts.length;
  assert.ok(await importShare(s9Payload,"wrong-pass")===0&&deriveCalls===1&&alerts.length===alertsBeforeWrongPass+1&&alerts.at(-1)==="パスコードがちがうか、ファイルが壊れています。");
});

test("S9:違う全角のパスコードも読み込めない(入力どおり→統一した値の2回で失敗する)", async () => {
  deriveCalls=0;
  assert.ok(await importShare(s9Payload,"ｗｒｏｎｇ２０２５")===0&&deriveCalls===2&&alerts.at(-1)==="パスコードがちがうか、ファイルが壊れています。");
});

test("S9:4文字以上の判定は統一後の値で行う(半角カナ6文字は統一すると3文字になるので断る)", async () => {
  run(`deriveKey=globalThis.__realDerive`);
  const downloadsBeforeShort=downloads.length;
  const shortExport=await exportShare("team_s9","ﾊﾞﾊﾞﾊﾞ");
  assert.ok(shortExport===null&&downloads.length===downloadsBeforeShort&&alerts.at(-1)==="4文字以上にしてください");
});

test("S9:統一後に4文字になるパスコード(ﾊﾞﾊﾞﾊﾞﾊﾞ)は書き出せ、統一した値(ババババ)で読み込める", async () => {
  const kanaExport=await exportShare("team_s9","ﾊﾞﾊﾞﾊﾞﾊﾞ");
  assert.ok(!!kanaExport&&await importShare(kanaExport,"ババババ")===1);
});
