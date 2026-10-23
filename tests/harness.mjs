/* ============================================================
   tests/harness.mjs ― テスト用の環境づくりと、小さなテスト実行の仕組み
   ------------------------------------------------------------
   役割:
     ・createApp(options):js/ のアプリを新しい vm コンテキストに読み込んで返す。
       呼ぶたびに別のコンテキストになる(テストファイルごとに1回呼ぶ)。
       index.html の <script src> を上から順に、同じコンテキストで実行する(ブラウザと同じ読み込み順)。
       DOM・localStorage・crypto・タイマー・prompt/alert/confirm・FileReader・navigator・
       speechSynthesis などのスタブを用意し、次のものを返す。
         run(code)・get(expr)   アプリのコンテキストでコードを実行する / 式の値を取り出す
         alerts・prompts・confirms・downloads・readers・timers・revoked・imported・spoken など
                                スタブが受け取った内容の記録
         promptAnswer・confirmAnswer・failStoreWrites・persistResult・persistThrows・voiceList
                                テストから書き換える値(env.promptAnswer = "..." のように使う)
         toastShows・persistCalls・voiceCalls・speechCancels
                                スタブが数えた回数。atBoot は読み込み直後の getVoices 回数と voiceschanged 登録数
         startSession・makeShare・importShare・exportShare
                                解錠済みの状態づくり / 共有ファイルの作成・読み込み・書き出し
                                (exportShare は、第3引数で書き出す相手 "student"|"staff"|"all" を選べる。省略すると初期値の学生向け)
       options:
         root     リポジトリのルート(省略すると tests/ の1つ上)
         storage  読み込み前から localStorage に入れておく内容 { キー: 文字列 }
     ・test(name, fn)・section(title):テストを登録する。runQueued() が登録順に実行し、成功と失敗を数える。
     ・readIndexHtml()・readAppSource()・scriptPaths():静的な検査用。js/*.js 全体の文字列などを返す。
     ・makeTestTeam()・makeFullTeam(defs)・plain・sameData・throwsError・listView・personView・detailView・nextTick:テストで共通の小道具。
     ・installHistory(env):アプリの環境に history(pushState・replaceState・go・back・forward)のスタブを取り付ける。
       積んだ履歴のとおりに位置を動かし、go のあとは popstate を非同期で呼ぶ(本物のブラウザと同じ)。
       既定の環境(createApp)には history がない(戻る操作は、history がない環境でも動く)。
   使い方:tests/*.test.mjs の先頭で createApp() を呼び、test() で登録する。
          全体の実行は、リポジトリ直下の test.mjs から。1ファイルだけなら node tests/xxx.test.mjs でも動く。
   ============================================================ */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- 小さなテスト実行の仕組み ----
const queue = [];
export const section = (title) => { queue.push({ title }); };
export const test = (name, fn) => { queue.push({ name, fn }); };
// 登録されたテストを登録順に実行する。失敗しても続け、成功と失敗の件数を返す
export async function runQueued() {
  let passed = 0, failed = 0;
  for (const item of queue.splice(0)) {
    if (item.title !== undefined) { console.log("\n■ " + item.title); continue; }
    try { await item.fn(); passed++; console.log("  ✅ " + item.name); }
    catch (err) {
      failed++;
      console.log("  ❌ " + item.name);
      console.log(String(err && err.stack ? err.stack : err).split("\n").slice(0, 8).map((l) => "     " + l).join("\n"));
    }
  }
  return { passed, failed };
}
// node tests/xxx.test.mjs のように1ファイルだけ実行したときは、登録されたテストをそのまま実行する
if (/\.test\.mjs$/.test(process.argv[1] ?? "")) {
  setImmediate(async () => {
    const { passed, failed } = await runQueued();
    console.log(`\n==== ${passed}件成功 / ${failed}件失敗 ====\n`);
    process.exitCode = failed ? 1 : 0;
  });
}

// ---- ソースの読み取り(静的な検査・アプリの読み込みに使う) ----
export const readIndexHtml = (root = ROOT) => readFileSync(path.join(root, "index.html"), "utf8");
// index.html の <script src> を、書かれている順に返す(例: ["js/constants.js", ...])
export function scriptPaths(root = ROOT) {
  return [...readIndexHtml(root).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
}
// js/*.js 全体を、ファイル名順につないだ文字列
export function readAppSource(root = ROOT) {
  const dir = path.join(root, "js");
  return readdirSync(dir).filter((f) => f.endsWith(".js")).sort().map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
}

// ---- テストで共通の小道具 ----
export const plain = (x) => JSON.parse(JSON.stringify(x));   // vm内で作ったオブジェクトを、比較しやすい普通のオブジェクトにする
export const sameData = (a, b) => { try { assert.deepStrictEqual(plain(a), plain(b)); return true; } catch { return false; } };
export const throwsError = (fn) => { try { fn(); return false; } catch { return true; } };
export const listView = (teamId) => `view={teamId:${JSON.stringify(teamId)},screen:"list",personId:null,topicId:null,editing:false,organize:false}`;
// 人物ページ・トピック詳細の画面にする式(audience は表示の相手。省略すると "all")
export const personView = (teamId, personId, audience = "all") => `view={teamId:${JSON.stringify(teamId)},screen:"person",personId:${JSON.stringify(personId)},topicId:null,editing:false,organize:false,audience:${JSON.stringify(audience)}}`;
export const detailView = (teamId, personId, topicId, audience = "all") => `view={teamId:${JSON.stringify(teamId)},screen:"detail",personId:${JSON.stringify(personId)},topicId:${JSON.stringify(topicId)},editing:false,organize:false,audience:${JSON.stringify(audience)}}`;
export const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

// createApp() で作った環境に、history のスタブを取り付ける。返すもの:
//   history       取り付けたスタブ(state・length・scrollRestoration と、pushState・replaceState・go・back・forward)
//   calls         呼ばれた操作の記録 [["push", state], ["replace", state], ["go", n]]
//   index()       いまの履歴の位置(先頭が0)
//   settle()      go のあとの popstate がすべて終わるまで待つ
//   popstate(st)  戻った先の state を指定して、popstate を直接呼ぶ(履歴の位置は動かさない)
export function installHistory(env) {
  const stack = [{ state: null }];
  let index = 0;
  const pending = [];
  const calls = [];
  const fire = (state) => Promise.all((env.windowHandlers.popstate ?? []).map((fn) => fn({ state })));
  const history = {
    scrollRestoration: "auto",
    get state() { return stack[index].state; },
    get length() { return stack.length; },
    pushState(state) { stack.splice(index + 1); stack.push({ state }); index++; calls.push(["push", state]); },
    replaceState(state) { stack[index] = { state }; calls.push(["replace", state]); },
    go(n) {
      calls.push(["go", n]);
      const to = Math.max(0, Math.min(stack.length - 1, index + n));
      if (to === index) return;   // 動けないときは、本物と同じく popstate も起きない
      index = to;
      pending.push(Promise.resolve().then(() => fire(stack[index].state)));
    },
    back() { history.go(-1); },
    forward() { history.go(1); },
  };
  env.context.history = history;
  const settle = async () => { while (pending.length) await pending.shift(); };
  return { history, calls, index: () => index, settle, popstate: (state) => fire(state) };
}

// 共有・ロックのテストで使うチーム(2人。細工したID・写真・一覧にないトピックなどを含む)。呼ぶたびに新しいオブジェクトを返す
export function makeTestTeam() {
  const team = {
    id:"team_test", name:"やまだ家", emoji:"🏠", color:"#2F8F83", customTeamField:"keep",
    people:[{
      id:'person_test"><button data-act="lock-now', name:"はなちゃん", emoji:"🌸", note:"紹介文 <安全>", photo:'data:image/jpeg;base64,AAAA" onerror="alert(1)',
      topicDefs:[{id:"basic",title:"基本情報",icon:"👤",color:"#5B8DB8"},{id:"custom",title:"独自<項目>",icon:"📌",color:"#2F8F83"}],
      topics:{basic:[{label:"名前",value:"山田"}],custom:[{label:"secret",value:"保護者のみ"}],orphan:[{label:"昔の項目",value:"保持"}]},
      extraPersonField:"keep",
    }],
  };
  const secondPerson={id:"empty_person",name:"そらくん",emoji:"🌱",note:"",photo:null,topicDefs:[{id:"sleep",title:"睡眠",icon:"😴",color:"#4E9A6E"}],topics:{}};
  team.people.push(secondPerson);
  return team;
}

// 相手別の公開設定のテストで使うチーム。defs は既定のトピック(アプリの DEFAULT_TOPICS を plain にしたもの)。
// 1人目(はなさん)は、既定のトピックすべてに1件ずつ内容があり、自作トピック(mine)と、一覧にないトピック(orphan)も持つ。updatedAt もある。
// 2人目(そらさん)は、既定のトピックの定義だけで、内容も updatedAt もない。呼ぶたびに新しいオブジェクトを返す
export function makeFullTeam(defs, id = "team_full") {
  const topics = {};
  for (const d of defs) topics[d.id] = [{ label: `${d.id}の見出し`, value: `${d.id}の内容` }];
  topics.mine = [{ label: "自作の見出し", value: "自作の内容" }];
  topics.orphan = [{ label: "昔の項目", value: "一覧にない内容" }];
  return {
    id, name: "テストチーム", emoji: "🏠", color: "#2F8F83",
    people: [
      { id: "p_hana", name: "はなさん", emoji: "🌸", note: "音楽が好き", photo: null,
        topicDefs: [...defs.map((d) => ({ ...d })), { id: "mine", icon: "📌", title: "自作トピック", color: "#5B8DB8", desc: "" }],
        topics, updatedAt: "2026-10-18T03:00:00.000Z" },
      { id: "p_sora", name: "そらさん", emoji: "🌱", note: "", photo: null, topicDefs: defs.map((d) => ({ ...d })), topics: {} },
    ],
  };
}

// ---- アプリの環境づくり ----
export function createApp(options = {}) {
  const root = options.root ?? ROOT;
  const store = new Map(Object.entries(options.storage ?? {}));
  const handlers = {};
  const windowHandlers = {};
  const imported = [];
  const readers = [];
  const downloads = [];
  const alerts = [];
  const prompts = [];
  const confirms = [];
  const timers = [];
  const revoked = [];
  const voiceHandlers = [], spoken = [];

  // テストから書き換える値と、スタブが数える回数(スタブはこの env を見る)
  const env = {
    promptAnswer: null, confirmAnswer: true,
    failStoreWrites: false,
    persistResult: true, persistThrows: false, persistCalls: 0,
    voiceList: [], voiceCalls: 0, speechCancels: 0,
    toastShows: 0, shareCalls: [], shareError: null, canShareFiles: true,
  };

  // navigator.storage.persist() / 読み上げ(speechSynthesis)のスタブ
  const navigatorStub = { storage:{ persist:async()=>{ env.persistCalls++; if(env.persistThrows) throw new Error("persist failed"); return env.persistResult; } },
    canShare:()=>env.canShareFiles, share:(payload)=>{env.shareCalls.push(payload);return env.shareError?Promise.reject(env.shareError):Promise.resolve();} };
  const speechStub = {
    getVoices:()=>{ env.voiceCalls++; return env.voiceList; },
    speak:(u)=>{ spoken.push(u); },
    cancel:()=>{ env.speechCancels++; },
    addEventListener:(name,fn)=>{ if(name==="voiceschanged") voiceHandlers.push(fn); },
  };
  class UtteranceStub { constructor(text){ this.text=text; } }

  // DOM と localStorage のスタブ
  const app = { innerHTML:"", querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){}, removeEventListener(){}, contains(){return true;} };
  const print = { innerHTML:"" };
  const toast = { classList:{add(){env.toastShows++;},remove(){}} };
  const importInput = { value:"", addEventListener:(name,fn)=>{handlers.import=fn;} };
  const legacyScardInput = { value:"", addEventListener:(name,fn)=>{handlers.legacyScard=fn;}, click(){env.legacyPickerCalls=(env.legacyPickerCalls||0)+1;} };
  const photoInput = { value:"", addEventListener:(name,fn)=>{handlers.photo=fn;}, click(){} };
  const body = { dataset:{}, classList:{add(){},remove(){}} };
  let activeElement=null;
  const passwordInputs = Object.fromEntries(["share-pass1","share-pass2","share-import-pass","share-pass-error","share-import-pass-error"].map(id=>[id,{
    id,value:"",type:id.includes("error")?undefined:"password",textContent:"",attributes:{},
    focus(){activeElement=this;},setAttribute(name,value){this.attributes[name]=String(value);},
  }]));
  const document = {
    body,
    hidden:false,
    get activeElement(){return activeElement;},
    addEventListener:(name,fn)=>{(handlers[name]??=[]).push(fn);},
    getElementById:(id)=>({app,print,toast,importInput,legacyScardInput,photoInput,...passwordInputs}[id]||null),
    querySelectorAll:()=>[],
    createElement:(tag)=> tag==="a"?{click(){downloads.push(this);}}:{},
  };
  const localStorage = {
    getItem:(k)=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>{if(env.failStoreWrites&&k==="support-card-local-v1")throw new Error("quota");store.set(k,String(v));},
    removeItem:(k)=>{store.delete(k);},
  };

  const context = vm.createContext({
    console, document, localStorage, window:{scrollTo(){},addEventListener:(name,fn)=>{(windowHandlers[name]??=[]).push(fn);},speechSynthesis:speechStub},
    navigator:navigatorStub, speechSynthesis:speechStub, SpeechSynthesisUtterance:UtteranceStub,
    crypto:webcrypto, TextEncoder, TextDecoder, structuredClone, Blob,
    File:class FileStub extends Blob { constructor(parts,name,opts={}){super(parts,opts);this.name=name;this.lastModified=Date.now();} },
    URL:{createObjectURL:(b)=>{imported.push(b);return "blob:test";},revokeObjectURL:(u)=>{revoked.push(u);}},
    btoa, atob, Date, Math, JSON, Uint8Array, Array, Object, Set, Map, String,
    RegExp, Error, Promise,
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}, clearTimeout(){},
    alert:(m)=>alerts.push(String(m)),
    prompt:(m)=>{prompts.push(String(m));return env.promptAnswer;},
    confirm:(m)=>{confirms.push(String(m));return env.confirmAnswer;},
    FileReader:class { constructor(){readers.push(this);} readAsText(file){ this.result=file.text; this.completion=this.onload(); } },
  });

  // index.html の <script src> を上から順に、同じコンテキストで実行する
  for (const rel of scriptPaths(root)) vm.runInContext(readFileSync(path.join(root, rel), "utf8"), context, { filename: rel });

  const run = (code) => vm.runInContext(code, context);
  const get = (expr) => vm.runInContext(expr, context);
  env.atBoot = { voiceCalls: env.voiceCalls, voiceListeners: voiceHandlers.length };

  // 指定した端末パスコードで解錠済みの状態(保存データはまだない)をつくる
  async function startSession(passcode, teamList, viewTeamId=null){
    const sessionSalt=webcrypto.getRandomValues(new Uint8Array(16));
    context.__sessionKey=await get("deriveKey")(passcode,sessionSalt); context.__sessionSalt=sessionSalt; context.__sessionTeams=teamList;
    run(`teams=structuredClone(globalThis.__sessionTeams); persistedTeams=structuredClone(teams); privateNotes={}; persistedPrivateNotes={}; preparedShare=null; sessionEpoch++; stage="ready"; cryptoKey=globalThis.__sessionKey; salt=globalThis.__sessionSalt; modal=null; modalDraft=null; draft=[]; pendingPicker=null; ${listView(viewTeamId)}`);
  }
  // アプリの暗号関数で共有ファイル(の中身)をつくる。extra で v などを上書きできる
  async function makeShare(passcode, content, extra={}){
    const s=webcrypto.getRandomValues(new Uint8Array(16));
    const enc=await get("encryptJson")(content, await get("deriveKey")(passcode,s));
    return { app:"support-card", type:"team-share", v:1, salt:get("b64")(s), iv:enc.iv, data:enc.data, ...extra };
  }
  // 共有ファイルを読み込み、増えたチーム数を返す
  async function importShare(filePayload, answer){
    run(`stage="ready"`);
    const before=get("teams.length"); importInput.files=[{text:get("encodeShareMarkdown")(filePayload)}];
    handlers.import({target:importInput}); const completion=readers.at(-1).completion;
    await Promise.resolve();
    if(get("modal")==="share-pass-import"){
      passwordInputs["share-import-pass"].value=answer||"";
      await get('handle("import-pass-submit",{})');
      if(!answer) return get("teams.length")-before;
    }
    await completion;
    return get("teams.length")-before;
  }
  async function submitSharePasscode(answer){
    passwordInputs["share-pass1"].value=answer||"";passwordInputs["share-pass2"].value=answer||"";
    return get('handle("share-pass-submit",{})');
  }
  // 画面の操作どおりにチームを書き出し、書き出したファイルの中身を返す(書き出せなかったときはnull)。
  // audience を渡すと、確認画面で書き出す相手を選んでから書き出す(省略すると初期値のまま)
  async function exportShare(teamId, answer, audience){
    run(`stage="ready"; ${listView(teamId)}`);
    await get(`handle("share-team",{})`);
    if(audience) await get(`handle("share-audience",{v:${JSON.stringify(audience)}})`);
    const before=downloads.length; await get(`handle("share-proceed",{})`);
    if(get("modal")==="share-pass-create"){
      passwordInputs["share-pass1"].value=answer||"";passwordInputs["share-pass2"].value=answer||"";
      await get('handle("share-pass-submit",{})');
    }
    if(get("modal")==="share-ready") await get(`handle("share-download",{})`);
    return downloads.length>before ? get("parseShareMarkdown")(await imported.at(-1).text()) : null;
  }

  return Object.assign(env, {
    context, run, get, store,
    app, print, toast, importInput, photoInput, body, document, localStorage, navigatorStub, speechStub,
    handlers, windowHandlers, imported, readers, downloads, alerts, prompts, confirms, timers, revoked, spoken, voiceHandlers,passwordInputs,
    startSession, makeShare, importShare, exportShare, submitSharePasscode,
  });
}
