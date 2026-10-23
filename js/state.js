/* ============================================================
   js/state.js ― 状態と仕組み
   ------------------------------------------------------------
   役割:アプリの「いま」の状態を持ち、それを守る仕組み。
        画面を作る views.js と、操作に反応する actions.js は、ここの状態を読み書きする。
   内容:
     ・状態変数:stage / teams / view / modal / modalDraft / draft / cryptoKey / salt など、
       表示設定 prefs、読み上げの状態 speaking・voiceCache・speakingTopicId・latestUtterance、
       履歴と先頭へのスクロールの状態 histDepth・histPending・histTimer・lastScreenKey。
       相手別の公開設定では、view.audience(人物ページの表示の相手)・draftAudience(編集中のトピックの公開先)・
       shareAudience(共有前の確認画面で選んだ、書き出す相手)
     ・ファイル選択の保留:clearPendingPicker / holdPendingPicker
     ・試行回数のメタ(非機密):loadMeta / saveMeta
     ・自動ロックと覗き見ガード:lockNow / resetIdle / sessionIsCurrent
       (click などと visibilitychange のイベント登録もここ)
     ・保存:persist / save / requestPersist / lastSavedLabel
     ・旧版(暗号化なし)のデータ:hasLegacyData / dropLegacyIfVerified
     ・解錠と初期設定:tryReason / unlock / setupNew
     ・いまの状態の取り出し:getTeam / getPerson / getTopic / viewAudience(いま画面に出している相手)/
       canEditCards(カードを編集できる画面か)/ canSeeEmergency(緊急情報の一覧を出せる表示か)/
       emergencyTeams(ホームの「緊急時の情報（すべてのチーム）」に出すチームと、使う相手)
     ・戻る操作とスクロール:currentScreen(いま実際に描く画面の名前。全チームの緊急情報の一覧は、stage が home のまま view.screen で決める)/ navDepth(画面の深さ)/
       syncHistory(画面が深くなったら history.pushState で積み、浅くなったら history.go で戻す)/
       recoverHistory(history.go のあと popstate が来ないときの立て直し)/ initHistory(起動時)/
       screenKey(「画面が変わったか」の判定に使う識別。render() が、変わったときだけ先頭へスクロールするのに使う)
       popstate(端末やブラウザの「戻る」)を受ける処理は actions.js にある
   依存:constants.js・util.js・crypto.js・data.js(いずれもこれより前に読み込む)
   実行時にだけ呼ぶもの:views.js の render()、actions.js の stopSpeak()
     (関数の中から呼ぶだけなので、読み込み順の制約はない。読み込みの間は stage が "boot" のため、
      ここで登録したイベント処理から render() などが呼ばれることはない)
   ============================================================ */
"use strict";

// ================= 状態 =================
let stage = "boot";   // boot(読み込み中) | setup-pass(初回のパスコード設定) | locked(ロック中) | home(ホーム) | ready(チームの中)
let cryptoKey = null, salt = null;
let teams = [];
let privateNotes = {}, persistedPrivateNotes = {};
let preparedShare = null;   // 暗号化済み Markdown File。鍵・セッションが変わったら破棄する
let view = { teamId:null, screen:"list", personId:null, topicId:null, editing:false, organize:false, audience:"all" };   // screen: list | person | detail | emergency(緊急情報の一覧)| emergency-all(ホームの全チームの緊急情報の一覧。stage は home のまま、teamId は null)/ audience: all | student | staff(人物ページの表示の相手)
let draft = [], modal = null, modalDraft = null;
let draftAudience = null;       // 編集中のトピックの公開先(「保存する」まで def.audience には書かない。「やめる」なら捨てる)
let shareAudience = "student";  // 共有前の確認画面で選んでいる、書き出す相手(開くたびに、選べる中で最も範囲の狭いものに戻す)
let toastTimer = null, screenError = "", lockWaitMsg = "";
let idleTimer = null;
let shareAttempt = 0;
let sessionEpoch = 0;
let shareReturnFocus = null;
let persistedTeams = [];
let saveGeneration = 0;
let storeBaselineRaw = undefined; // undefined=未確定、null=保存なし、文字列=最後に確認した暗号化保存
let externalStoreChanged = false;
let pendingPicker = null;
let photoPickerTarget = null;
let pendingPickerTimer = null;
let prefs = { fs:"m", theme:"milk" };
let speaking = false, voiceCache = [];
let speakingTopicId = null;     // 読み上げ中のトピックのID(学生向けのページで、どのトピックのボタンが「止める」になるかを決める)
let latestUtterance = null;     // いちばん新しく読み上げを始めたもの。別のトピックに切り替えたとき、前の読み上げの終了通知で状態を戻さないために使う
let histDepth = 0;              // 履歴に積んだ深さ(history.state の sc と同じ。ホーム=0、チーム=1、人物=2、詳細=3、モーダルが開いていれば+1)
let histPending = 0;            // history.go() で戻している最中の回数。その popstate は利用者の操作ではないので、画面を変えない
let histTimer = null;           // history.go() のあと、popstate が来ないときの立て直し(recoverHistory)のタイマー
let lastScreenKey = null;       // 前に描いた画面の識別(screenKey)。変わったときだけ、先頭へスクロールする

function clearPendingPicker(){
  pendingPicker=null; photoPickerTarget=null;
  clearTimeout(pendingPickerTimer); pendingPickerTimer=null;
}
function holdPendingPicker(item){
  clearPendingPicker(); pendingPicker=item;
  pendingPickerTimer=setTimeout(()=>{
    if(pendingPicker!==item) return;
    pendingPicker=null; photoPickerTarget=null; pendingPickerTimer=null;
    screenError="保留中のファイルは期限切れです。解錠後にもう一度選んでください。";
    if(stage==="locked"&&!document.hidden) render();
    else if(modal==="resume-picker"){modal=null;if(!document.hidden)alert(screenError);render();}
  },Math.max(0,item.expiresAt-Date.now()));
}

// 試行制限(非機密メタ)
function loadMeta(){ try{ return JSON.parse(localStorage.getItem(META_KEY)) || {}; }catch(e){ return {}; } }
function saveMeta(m){ try{ localStorage.setItem(META_KEY, JSON.stringify(m)); }catch(e){} }

// ================= セキュリティ:自動ロック・覗き見ガード =================
function lockNow(){
  stopSpeak();
  if(typeof clearPrivateNoteDrafts==="function") clearPrivateNoteDrafts();
  shareAttempt++;
  saveGeneration++;
  sessionEpoch++;
  if(pendingPicker) clearPendingPicker();
  clearPreparedShare();
  cryptoKey = null; teams = []; persistedTeams = [];
  privateNotes = {}; persistedPrivateNotes = {};
  draft = []; draftAudience = null; shareAudience = "student";
  const printArea = document.getElementById("print");
  if(printArea) printArea.innerHTML = "";
  view = { teamId:null, screen:"list", personId:null, topicId:null, editing:false, organize:false, audience:"all" };
  modal = null; modalDraft = null;
  clearTimeout(idleTimer);
  stage = "locked"; screenError = ""; render();
}
function clearPreparedShare(){ preparedShare = null; }
function resetIdle(){
  clearTimeout(idleTimer);
  if(stage==="home" || stage==="ready"){
    idleTimer = setTimeout(lockNow, AUTO_LOCK_MIN*60*1000);
  }
}
["click","keydown","touchstart","mousemove"].forEach(ev=>
  document.addEventListener(ev, resetIdle, {passive:true}));
// バックグラウンドに回ったら画面を隠す+ロック
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden){
    document.body.classList.add("peek-guard");
    if(stage==="home"||stage==="ready") lockNow();
  }else{
    document.body.classList.remove("peek-guard");
    if(stage==="locked"&&screenError) render();
    syncHistory();   // 隠れているあいだは履歴に触らない。見える状態に戻ったら、画面(ロック画面)の深さに合わせる
  }
});

function sessionIsCurrent(epoch,key){return sessionEpoch===epoch&&cryptoKey===key&&!!key&&!document.hidden&&(stage==="home"||stage==="ready");}

function acceptStoreBaseline(raw=localStorage.getItem(STORE_KEY)){
  storeBaselineRaw=raw; externalStoreChanged=false;
}
function storageChangedElsewhere(event){
  if(event.key!==STORE_KEY) return;
  // storage events may be queued after our own later write; compare the live value, not event.newValue.
  externalStoreChanged=localStorage.getItem(STORE_KEY)!==storeBaselineRaw;
}
window.addEventListener("storage", storageChangedElsewhere);

class StaleStoreError extends Error{ constructor(){ super("stored data changed in another tab"); this.name="StaleStoreError"; } }
async function withStoreWriteLock(callback){
  // Web Locksがある環境では、書込と比較を同一ロック内で直列化する。
  if(navigator?.locks?.request) return navigator.locks.request("support-cards-store-v1", callback);
  // 対応しない環境では比較をできるだけ書込直前に行う(best effort)。
  return callback();
}

// ================= 保存・読み込み =================
async function persist(teamSnapshot=teams, key=cryptoKey, saveSalt=salt, epoch=sessionEpoch, generation=null, noteSnapshot=privateNotes){
  if(!key || !saveSalt) throw new Error("session unavailable");
  const snapshot=structuredClone(teamSnapshot), capturedSalt=new Uint8Array(saveSalt);
  const notes=structuredClone(noteSnapshot||{});
  const enc = await encryptJson({teams:snapshot, privateNotes:notes}, key);
  if((generation!==null&&generation!==saveGeneration) || sessionEpoch!==epoch || cryptoKey!==key || document.hidden || !(stage==="home"||stage==="ready"||stage==="setup-pass")) throw new Error("session changed or save superseded");
  if(storeBaselineRaw===undefined) acceptStoreBaseline();
  const raw=JSON.stringify({ v:1, salt:b64(capturedSalt), iv:enc.iv, data:enc.data, savedAt:new Date().toISOString() });
  await withStoreWriteLock(async()=>{
    if(externalStoreChanged || localStorage.getItem(STORE_KEY)!==storeBaselineRaw) throw new StaleStoreError();
    if((generation!==null&&generation!==saveGeneration) || sessionEpoch!==epoch || cryptoKey!==key || document.hidden || !(stage==="home"||stage==="ready"||stage==="setup-pass")) throw new Error("session changed or save superseded");
    localStorage.setItem(STORE_KEY, raw);
    acceptStoreBaseline(raw);
  });
  return {teams:snapshot, privateNotes:notes};
}
async function save(){
  const generation=++saveGeneration;
  const epoch=sessionEpoch, key=cryptoKey, saveSalt=salt;
  const snapshot=structuredClone(teams);
  const notes=structuredClone(privateNotes);
  try{
    const written=await persist(snapshot,key,saveSalt,epoch,generation,notes);
    if(generation!==saveGeneration||sessionEpoch!==epoch || cryptoKey!==key) return false;
    persistedTeams=structuredClone(written.teams);
    persistedPrivateNotes=structuredClone(written.privateNotes);
    const t = document.getElementById("toast");
    t.classList.add("show"); clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>t.classList.remove("show"), 1600);
    return true;
  }catch(e){
    if(generation!==saveGeneration) return false;
    const stale=e instanceof StaleStoreError || externalStoreChanged;
    if(!stale && sessionEpoch===epoch && cryptoKey===key){ teams=structuredClone(persistedTeams); privateNotes=structuredClone(persistedPrivateNotes); }
    if(sessionEpoch===epoch && cryptoKey===key) alert(stale ? "別の画面でデータが更新されたため、この変更は保存していません。必要な入力内容を控えてから、いったんロックして開き直してください。" : "保存に失敗しました。変更は保存されていません。写真が多すぎる場合は減らしてください。");
    return false;
  }
}
// ブラウザーに保存データの保持(永続化)を依頼する(初回設定・解錠の成功後に1回ずつ)。未対応・拒否・失敗でもアプリの動作は変えない
let storagePersisted = null;   // true=保持を許可済み / false=許可なし / null=不明
async function requestPersist(){
  try{
    if(typeof navigator==="undefined" || !navigator.storage?.persist) return;
    // すでに許可済みなら依頼しない(Firefoxでは依頼のたびに確認が出ることがあるため)
    if(navigator.storage.persisted && await navigator.storage.persisted()){ storagePersisted = true; return; }
    storagePersisted = !!(await navigator.storage.persist());
  }catch(e){}
}
// 設定画面に出す「最後に保存」の日時(保存データの savedAt)
function lastSavedLabel(){ try{ const at = JSON.parse(localStorage.getItem(STORE_KEY)).savedAt; return at ? fmtDate(at) : "不明"; }catch(e){ return "不明"; } }
// 旧版(暗号化なし)のデータ:新しい暗号化保存を今の鍵で読み戻し、人数が一致したときだけ削除する(確認できなければ残す)
const hasLegacyData = () => { try{ return localStorage.getItem(LEGACY_KEY)!==null; }catch(e){ return false; } };
async function dropLegacyIfVerified(expectedPeople, key=cryptoKey){
  try{
    const obj = await decryptJson(JSON.parse(localStorage.getItem(STORE_KEY)), key);
    const n = (obj.teams||[]).reduce((sum,t)=>sum+(t.people||[]).length, 0);
    if(n===expectedPeople){ localStorage.removeItem(LEGACY_KEY); return true; }
  }catch(e){}
  return false;
}

// ================= 解錠・新規設定 =================
function tryReason(){
  const m = loadMeta();
  if(m.lockUntil && Date.now() < m.lockUntil){
    return Math.ceil((m.lockUntil - Date.now())/1000);
  }
  return 0;
}
async function unlock(passcode){
  const unlockEpoch=sessionEpoch;
  let attemptedStoreRaw;
  const wait = tryReason();
  if(wait>0){ lockWaitMsg = `しばらく待ってください(あと${wait}秒)`; render(); return; }
  try{
    attemptedStoreRaw=localStorage.getItem(STORE_KEY);
    const stored = JSON.parse(attemptedStoreRaw);
    const unlockSalt = unb64(stored.salt);
    const unlockKey = await deriveKey(passcode, unlockSalt);
    const obj = await decryptJson(stored, unlockKey);
    if(sessionEpoch!==unlockEpoch || document.hidden) return;
    if(localStorage.getItem(STORE_KEY)!==attemptedStoreRaw) throw new StaleStoreError();
    acceptStoreBaseline(attemptedStoreRaw);
    salt = unlockSalt;
    cryptoKey = unlockKey;
    teams = (obj.teams||[]).map(normalizeTeam);
    privateNotes = normalizePrivateNotes(obj.privateNotes, teams);
    persistedTeams = structuredClone(teams);
    persistedPrivateNotes = structuredClone(privateNotes);
    sessionEpoch++;
    saveMeta({fails:0});
    lockWaitMsg = ""; screenError = "";
    stage = "home"; resetIdle(); requestPersist();
    if(pendingPicker){
      if(pendingPicker.expiresAt>Date.now()) modal="resume-picker";
      else { clearPendingPicker(); screenError="保留中のファイルは期限切れです。もう一度選んでください。"; alert(screenError); }
    }
    render();
  }catch(e){
    if(sessionEpoch!==unlockEpoch || document.hidden) return;
    if(e instanceof StaleStoreError || (attemptedStoreRaw!==undefined && localStorage.getItem(STORE_KEY)!==attemptedStoreRaw)){ screenError="別の画面で保存データが更新されました。最新のデータを読み込むため、もう一度解錠してください。"; render(); return; }
    cryptoKey = null;
    const m = loadMeta();
    const fails = (m.fails||0) + 1;
    const wsec = LOCKOUTS[Math.min(fails, LOCKOUTS.length-1)];
    const meta = { fails };
    if(wsec>0) meta.lockUntil = Date.now() + wsec*1000;
    saveMeta(meta);
    screenError = "パスコードがちがいます";
    lockWaitMsg = wsec>0 ? `${fails}回まちがえました。${wsec}秒待ってからお試しください` : "";
    if(wsec>0){
      setTimeout(()=>{ lockWaitMsg=""; render(); }, wsec*1000);
    }
    render();
  }
}
async function setupNew(passcode){
  const setupBaseline=storeBaselineRaw===undefined?null:storeBaselineRaw;
  if(externalStoreChanged || localStorage.getItem(STORE_KEY)!==setupBaseline){
    stage="locked"; screenError="別の画面で保存データが更新されました。最新のデータを読み込むため、解錠してください。"; render(); return;
  }
  acceptStoreBaseline(setupBaseline);
  const setupEpoch=sessionEpoch, setupSalt=crypto.getRandomValues(new Uint8Array(16));
  const setupKey=await deriveKey(passcode, setupSalt);
  if(sessionEpoch!==setupEpoch||stage!=="setup-pass"||document.hidden) return;
  salt=setupSalt; cryptoKey=setupKey; privateNotes={}; persistedPrivateNotes={};
  teams = [normalizeTeam(structuredClone(SAMPLE_TEAM))];
  // 旧ローカル版(暗号化なし)からの引き継ぎ
  let migrated = 0;
  try{
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY)||"null");
    if(old && !old.enc && Array.isArray(old.people) && old.people.length){
      teams = [normalizeTeam({ id:uid(), name:"わたしの家族", emoji:"🏠", color:"#3D7399", people:old.people })];
      migrated = old.people.length;
    }
  }catch(e){}
  try{ await persist(); }
  catch(e){
    cryptoKey=null; salt=null; teams=[]; persistedTeams=[];
    const stale=e instanceof StaleStoreError || localStorage.getItem(STORE_KEY)!==storeBaselineRaw;
    if(sessionEpoch===setupEpoch){screenError=stale ? "別の画面で保存データが作成されました。最新のデータを読み込むため、解錠してください。" : "初期設定を保存できませんでした。ブラウザの空き容量を確認して、もう一度お試しください。";stage=stale?"locked":"setup-pass";render();}
    return;
  }
  persistedTeams=structuredClone(teams); persistedPrivateNotes=structuredClone(privateNotes);
  if(migrated) await dropLegacyIfVerified(migrated);
  sessionEpoch++;
  saveMeta({fails:0});
  stage = "home"; resetIdle(); render(); requestPersist();
}

// ================= 共通パーツ =================
const getTeam = () => teams.find(t=>t.id===view.teamId);
const getPerson = () => getTeam()?.people.find(p=>p.id===view.personId);
const getTopic = (p) => p?.topicDefs.find(t=>t.id===view.topicId);
// いま画面に出している相手("all" | "student" | "staff")。受け取ったチームは、受け取った相手の表示に固定する(切り替えは出さない)。
// view.audience がない(古い形の view)ときは "all"
function viewAudience(){
  const tm = getTeam();
  if(isReceivedTeam(tm)) return initialAudience(tm);
  return VIEW_AUDIENCES.some(v=>v.id===view.audience) ? view.audience : "all";
}
// カードを編集できるのは、自分のチームを「すべて」の表示で見ているときだけ。受け取ったチームと、相手別の表示は見るだけ。
// 「すべて」で受け取ったチームを make-editable で通常のチームに戻すと、source がなくなるので、ここも真になる
const canEditCards = () => !isReceivedTeam(getTeam()) && viewAudience()==="all";
// 緊急情報の一覧を出せるのは、「すべて」か「運営向け」の表示のとき(受け取ったチームは source.audience が all か staff)。学生向けでは出さない
const canSeeEmergency = () => { const a = viewAudience(); return a==="all" || a==="staff"; };
// ホームの「緊急時の情報（すべてのチーム）」に出すチーム。[{ team, audience }]。teams の順(ホームのチーム一覧と同じ)。
// 運営に見せてよい内容を含みうるチームだけ=自分のチームと、運営向け・すべてで受け取ったチーム(使う相手は emergencyAudience)。学生向けで受け取ったチームは入れない。
// 空なら、ホームにボタンを出さず、画面も開かない。データは複製せず、teams をそのまま読む(見るだけ)
const emergencyTeams = () => teams.map(team => ({ team, audience: emergencyAudience(team) })).filter(x => x.audience);

// ================= 戻る操作(履歴)とスクロール =================
// いま実際に描く画面の名前。boot | setup-pass | locked | home | emergency-all | list | person | emergency | detail。
// render() はこの名前で描く画面を選ぶ。条件に合わない画面(見えないトピックの詳細など)は、一覧に戻して描く。
// emergency-all(ホームの全チームの緊急情報の一覧)は、stage が home のまま、view.screen で決める(自動ロックなど stage を見る仕組みをそのまま使うため)。
// 出せるチームが1つもなければ、ホームを描く
function currentScreen(){
  if(stage==="home" && view.screen==="emergency-all" && emergencyTeams().length) return "emergency-all";
  if(stage==="boot" || stage==="setup-pass" || stage==="locked" || stage==="home") return stage;   // それ以外(ready)は、チームの中の画面
  const tm = getTeam(), p = getPerson();
  if(view.screen==="detail" && p && getTopic(p) && isTopicVisible(getTopic(p), viewAudience())) return "detail";
  if(view.screen==="emergency" && tm && canSeeEmergency()) return "emergency";
  if(view.screen==="person" && p) return "person";
  return "list";
}
// 画面の深さ。ホーム=0、チームの一覧・全チームの緊急情報の一覧=1、人物(緊急情報の一覧)=2、詳細=3。モーダルが開いていれば+1。ロック中・起動中・初期設定中は0
function navDepth(){
  if(stage!=="home" && stage!=="ready") return 0;
  const s = currentScreen();
  return (s==="detail" ? 3 : (s==="person" || s==="emergency") ? 2 : (s==="list" || s==="emergency-all") ? 1 : 0) + (modal ? 1 : 0);
}
// 履歴を、いまの画面の深さに合わせる。深くなったら history.pushState で積み、浅くなったら history.go で戻す
// (戻る操作の popstate は、画面を一段浅くする。アプリのボタンで浅くしたときは、履歴だけを合わせる)。
// history がない環境(テスト)・画面が見えていないとき・history.go で戻している最中は、何もしない
function syncHistory(){
  if(typeof history==="undefined" || !history || typeof history.pushState!=="function") return;
  if(histPending>0 || document.hidden) return;
  const want = navDepth();
  try{
    if(want>histDepth){ while(histDepth<want){ history.pushState({ sc:histDepth+1 }, ""); histDepth++; } }   // 積めた分だけ深さを進める(失敗したら、そこで止まる)
    else if(want<histDepth){
      const back = histDepth - want;
      histDepth = want; histPending++;
      try{ history.go(-back); }catch(e){ histPending--; histDepth = want + back; return; }
      clearTimeout(histTimer); histTimer = setTimeout(recoverHistory, 2000);   // 戻れなかったなどで popstate が来ないときに、「戻している最中」のまま止まらないようにする
    }
  }catch(e){}
}
// history.go のあと、しばらく popstate が来なかったときの立て直し。いまの履歴の位置(history.state)を読み直して、画面の深さに合わせ直す
function recoverHistory(){
  histTimer = null;
  if(histPending<=0) return;
  histPending = 0;
  try{ if(history.state && Number.isInteger(history.state.sc)) histDepth = history.state.sc; }catch(e){}
  syncHistory();
}
// 起動時に、いまの履歴の位置を先頭(深さ0)にする。履歴を自分で管理するので、ブラウザによるスクロール位置の復元は切る
function initHistory(){
  histDepth = 0; histPending = 0; clearTimeout(histTimer); histTimer = null;
  if(typeof history==="undefined" || !history) return;
  try{ if("scrollRestoration" in history) history.scrollRestoration = "manual"; }catch(e){}
  try{ history.replaceState({ sc:0 }, ""); }catch(e){}
}
// 「画面が変わったか」の判定に使う識別。stage・view.screen・teamId・personId・topicId・audience のどれかが変わったときに変わる
// (モーダルの開閉・書きこみの開始・再描画だけでは変わらない)
const screenKey = () => [stage, view.screen, view.teamId, view.personId, view.topicId, view.audience].join("|");
