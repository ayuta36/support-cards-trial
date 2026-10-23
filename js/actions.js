/* ============================================================
   js/actions.js ― 操作
   ------------------------------------------------------------
   役割:利用者の操作への反応。ボタン・キー・ファイル選択・読み上げ。
   主な関数:
     bindEvents(描画のたびに、data-act のボタンへ処理をつなぐ)
     handle(data-act ごとの処理。ボタンの動作を変えるときはここ。
            受け取ったチーム(source あり)と、相手別の表示では、編集の操作を冒頭で拒否する(RECEIVED_BLOCKED・PREVIEW_BLOCKED)。
            make-editable(「すべて」で受け取ったチームを、この端末で編集できるようにする)は例外で、
            学生向け・運営向けで受け取ったチームでは自分で拒否する。
            ホームの全チームの緊急情報の一覧(open-emergency-all で開く、見るだけの画面)では、戻る・閉じる・ロック以外を冒頭で拒否する(EMERGENCY_ALL_ALLOWED))
     navBack(端末やブラウザの「戻る」で、画面を一段浅くする。ホームの全チームの緊急情報の一覧からは、ホームへ戻る。popstate の処理から呼ばれる)
     keepModalInputs・keepDraftInputs(入力中の値を状態へ写す。公開先のチェックも含む)/ restoreShareTriggerFocus
     readPhoto・applyPhotoFile(写真を選んだとき)/ processImportFile(共有ファイルの取り込み)
     speakTopic・stopSpeak・loadVoices・findLocalJaVoice(読み上げ。トピックごと)
     読み込み時に登録するイベント:Esc キー、popstate(戻る操作)、photoInput/importInput/legacyScardInput の change
   依存:state.js・views.js(app・render・buildPrint)・crypto.js・data.js・util.js・constants.js
        (いずれもこれより前に読み込む)
   実行時にだけ呼ぶもの:main.js の applyPrefs()(handle の set-fs・set-theme)
   ============================================================ */
"use strict";

// ---- 読み上げ ----
// 読み上げる内容が外部へ送られないよう、端末内(localService)の日本語音声だけを使う。
// getVoices() は起動直後は空のことがあるため、起動時と voiceschanged で取得して保持し、読み上げる時にも取り直す
function loadVoices(){ try{ const v = speechSynthesis.getVoices(); if(v && v.length) voiceCache = Array.from(v); }catch(e){} return voiceCache; }
const findLocalJaVoice = () => loadVoices().find(v => v.localService===true && /^ja/i.test(v.lang||""));
function stopSpeak(){ if(speaking){ speechSynthesis.cancel(); speaking = false; speakingTopicId = null; } }
function speakTopic(p, t){
  if(!("speechSynthesis" in window)){ alert("この端末のブラウザは読み上げに対応していません"); return; }
  const voice = findLocalJaVoice();
  if(!voice){ alert("この端末には、インターネットを使わない日本語の読み上げ音声が見つからないため、読み上げを使えません。"); return; }
  const entries = p.topics[t.id]||[];
  const text = [ `${p.name}の、${t.title}`, ...entries.map(e => (e.label ? e.label + "。" : "") + e.value) ].join("。");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP"; u.voice = voice; u.rate = 0.95;
  // 別のトピックに切り替えたとき、前の読み上げの終了通知(cancel の結果)で、今の読み上げの状態を戻さない(latestUtterance で見分ける)
  const done = ()=>{ if(latestUtterance!==u) return; speaking = false; speakingTopicId = null; if(!view.editing) render(); };   // 編集中は再描画しない(入力中の下書きを消さない)
  u.onend = done; u.onerror = done;
  latestUtterance = u;
  speechSynthesis.cancel(); speechSynthesis.speak(u); speaking = true; speakingTopicId = t.id;
}

// ================= 入力保持 =================
function keepModalInputs(){
  if(modal==="person" && modalDraft){
    const n=document.getElementById("m-name"), o=document.getElementById("m-note");
    if(n) modalDraft.name=n.value; if(o) modalDraft.note=o.value;
  }
  if(modal==="topic" && modalDraft){ const t=document.getElementById("m-topic-title"); if(t) modalDraft.title=t.value; }
  if(modal==="team" && modalDraft){ const t=document.getElementById("t-name"); if(t) modalDraft.name=t.value; }
}
function keepDraftInputs(){
  document.querySelectorAll("[data-draft-label]").forEach(el=>{ draft[+el.dataset.draftLabel].label = el.value; });
  document.querySelectorAll("[data-draft-value]").forEach(el=>{ draft[+el.dataset.draftValue].value = el.value; });
  const boxes = Array.from(document.querySelectorAll("[data-draft-aud]"));   // 公開先のチェック(編集中の画面にあるときだけ)
  if(boxes.length && draftAudience) draftAudience = AUDIENCES.map(a=>a.id).filter(id=>boxes.some(el=>el.dataset.draftAud===id && el.checked));
}
function restoreShareTriggerFocus(){
  const trigger=app.querySelector('[data-act="share-team"]');
  if(trigger) trigger.focus();
  shareReturnFocus=null;
}

let disposeTopicDrag=null;
function bindOrganizeDrag(){
  if(disposeTopicDrag){disposeTopicDrag();disposeTopicDrag=null;}
  const p=getPerson();
  if(!p || !view.organize || !canEditCards()) return;
  disposeTopicDrag=bindTopicDrag(app,{
    itemSelector:"[data-topic-item]", handleSelector:"[data-topic-drag-handle]",
    canStart:(id)=>canEditCards() && view.organize && p.topicDefs.some(def=>def.id===id),
    onDrop:async (activeId,targetId,after)=>{
      if(!canEditCards() || !view.organize || getPerson()!==p) return;
      const next=reorderTopicDefs(p.topicDefs,activeId,targetId,after);
      if(!next) return;
      p.topicDefs=next; stampUpdated(p);
      if(!await save()){render();return;}
      render();
    }
  });
}

// ================= イベント =================
function bindEvents(){
  bindOrganizeDrag();
  app.querySelectorAll("[data-stop]").forEach(el=>el.addEventListener("click",e=>e.stopPropagation()));
  app.querySelectorAll("[data-act]").forEach(el=>{
    el.addEventListener("click",(e)=>{ e.stopPropagation(); handle(el.dataset.act, el.dataset); });
    if(el.getAttribute("role")==="button"){
      el.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.stopPropagation(); handle(el.dataset.act, el.dataset); } });
    }
  });
  const privateNoteInput=document.getElementById("private-note-input");
  if(privateNoteInput?.addEventListener) privateNoteInput.addEventListener("input",()=>{
    setPrivateNoteDraft(privateNoteInput.dataset.privateNoteTeam,privateNoteInput.dataset.privateNotePerson,privateNoteInput.value);
    const help=document.getElementById("private-note-help");
    if(help) help.innerHTML=`このメモはこの端末に暗号化して保存され、共有・書き出し・印刷には入りません。同じ端末の解錠者は読めます。${privateNoteDraftDirty(privateNoteInput.dataset.privateNoteTeam,privateNoteInput.dataset.privateNotePerson)?' <strong class="private-note-unsaved" role="status">未保存</strong>':''}`;
  });
  const lk=document.getElementById("lk-pass"); if(lk) lk.addEventListener("keydown",e=>{ if(e.key==="Enter") handle("unlock",{}); });
  const su=document.getElementById("su-pass2"); if(su) su.addEventListener("keydown",e=>{ if(e.key==="Enter") handle("setup-go",{}); });
  if(modal==="share-preflight"){
    const dialog=document.getElementById("share-preflight-dialog");
    const heading=document.getElementById("share-preflight-title");
    if(heading) heading.focus();
    if(dialog) dialog.addEventListener("keydown",e=>{
      if(e.key!=="Tab") return;
      const controls=[...dialog.querySelectorAll("button:not([disabled]), input:not([disabled])")];   // 書き出す相手のラジオボタンも含める
      if(!controls.length) return;
      const first=controls[0], last=controls[controls.length-1];
      if(e.shiftKey && (document.activeElement===first || document.activeElement===heading)){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    });
  }
  if(modal==="share-ready"){
    const title=document.getElementById("share-ready-title"); if(title) title.focus();
  }
  if(modal==="resume-picker"){
    const dialog=document.getElementById("resume-picker-dialog");
    const heading=document.getElementById("resume-picker-title");
    if(heading) heading.focus();
    if(dialog) dialog.addEventListener("keydown",e=>{
      if(e.key!=="Tab") return;
      const controls=[...dialog.querySelectorAll("button:not([disabled])")];
      if(!controls.length) return;
      const first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===heading)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
  }
}
window.addEventListener("beforeunload",(e)=>{
  const p=getPerson(), tm=getTeam();
  if(stage==="ready" && currentScreen()==="person" && privateNoteDraftDirty(tm?.id,p?.id)){
    e.preventDefault(); e.returnValue="";
  }
});
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape" && modal){ const restore=modal==="share-preflight"&&shareReturnFocus; if(modal==="resume-picker")clearPendingPicker(); modal=null; modalDraft=null; render(); if(restore) restoreShareTriggerFocus(); } });

// ---- 戻る操作(端末やブラウザの「戻る」) ----
// 画面を一段浅くする: モーダル → 詳細 → 人物(緊急情報の一覧) → 一覧 → ホーム。ホームの全チームの緊急情報の一覧 → ホーム。ホームでは何もしない(ページを離れる)。
// 閉じ方・戻り方は、アプリ内のボタンと同じ処理(handle)を使う(書きこみ中の下書きを捨てる扱いも、「もどる」ボタンと同じ)
async function navBack(){
  if(modal) return handle("close-modal",{});
  const screen=currentScreen();
  if(screen==="emergency-all") return handle("back-home",{});   // ホームから開く全チームの緊急情報の一覧(stage は home のまま)。ホームへ戻る
  if(stage==="home") return;
  if(screen==="detail") return handle("back-person",{});
  if(screen==="person" || screen==="emergency") return handle("back-list",{});
  return handle("back-home",{});
}
window.addEventListener("popstate", async (e)=>{
  const to = e && e.state && Number.isInteger(e.state.sc) ? e.state.sc : null;   // 戻った先の履歴の深さ(history.state)。分からないときは null
  if(histPending>0){   // アプリが history.go() で戻した分。利用者の操作ではないので、画面は変えない
    histPending--; if(to!==null) histDepth=to;
    if(histPending===0){ clearTimeout(histTimer); histTimer=null; syncHistory(); }
    return;
  }
  if(to!==null && to>histDepth){ histDepth=to; syncHistory(); return; }   // 「進む」では画面を変えない(履歴の位置を、今の画面に合わせ直す)
  histDepth = to!==null ? to : Math.max(0, histDepth-1);
  if(stage!=="home" && stage!=="ready") return;   // ロック中・起動中・初期設定中は、何もしない
  await navBack();
});

// 受け取ったチーム(source あり)で受け付けない操作。画面に出さないだけでなく、ここでも拒否する(二重の防御)
const RECEIVED_BLOCKED = new Set([
  "edit-person","add-person","save-person","del-person","pick-photo","clear-photo",               // 人物の編集・カードの追加
  "start-edit","save-edit","draft-add","draft-remove",                                            // 書きこむ
  "add-topic","save-topic","toggle-organize","del-topic","move-up","move-down",                   // トピックの追加・整理・並べ替え・削除
  "edit-team","save-team-edit",                                                                   // チーム名の編集
  "open-copyto","copy-card",                                                                      // 他のチームへのコピー
  "set-audience",                                                                                 // 表示の切り替えは出さない(受け取った相手の表示に固定)
]);
// ※make-editable(「すべて」で受け取ったチームを編集できるようにする)は、受け取ったチームでこそ使う操作なので、ここには入れない。
//   代わりに、handle() の中で「すべて」で受け取ったチームだけを通す。open-emergency・open-emergency-all・speak-topic は見るだけの操作
// 相手別の表示(学生向け・運営向け)は、相手からどう見えるかを確かめるためのもの。編集の操作は画面に出さず、ここでも拒否する
const PREVIEW_BLOCKED = new Set(["edit-person","start-edit","add-topic","toggle-organize","del-topic","move-up","move-down","open-copyto"]);
// ホームの「緊急時の情報（すべてのチーム）」は見るだけの画面で、チームも人物も選んでいない。画面に出す操作は「← ホーム」(back-home)だけ。
// ここに挙げた、画面を離れる・閉じる・ロックする操作以外は、画面に出さないだけでなく handle() でも受け付けない(二重の防御。上の2つの「拒否する一覧」と違い、通す操作を挙げる)
const EMERGENCY_ALL_ALLOWED = new Set(["back-home","close-modal","lock-manual","lock-now"]);
const stampUpdated = (person)=>{ if(person) person.updatedAt = new Date().toISOString(); };   // 最終更新日。保存に失敗して元に戻すときは、save() が一緒に戻す

async function handle(act, ds){
  const leavingPerson = new Set(["enter-team","back-home","open-emergency","open-emergency-all","open-person","back-list","open-topic","back-person","del-team"]);
  const currentPerson=getPerson(), currentTeam=getTeam();
  if(leavingPerson.has(act) && currentScreen()==="person" && privateNoteDraftDirty(currentTeam?.id,currentPerson?.id)){
    if(!confirm("このメモは未保存です。この画面を離れると入力が消えます。離れますか？")){ syncHistory(); return; }
    clearPrivateNoteDraft(currentTeam.id,currentPerson.id);
  }
  if(currentScreen()==="emergency-all" && !EMERGENCY_ALL_ALLOWED.has(act)) return;   // 全チームの緊急情報の一覧は見るだけ
  const tm = getTeam(), p = getPerson();
  if(isReceivedTeam(tm) && RECEIVED_BLOCKED.has(act)) return;
  if(PREVIEW_BLOCKED.has(act) && viewAudience()!=="all") return;
  switch(act){
    // ---- 認証 ----
    case "setup-go":{
      const v1=document.getElementById("su-pass1").value, v2=document.getElementById("su-pass2").value;
      if(v1.length<4){ screenError="パスコードは4文字以上にしてください"; render(); return; }
      if(v1!==v2){ screenError="2回の入力が一致しません"; render(); return; }
      screenError=""; await setupNew(v1); break;
    }
    case "unlock":{
      const v=document.getElementById("lk-pass")?.value||""; if(!v) return;
      await unlock(v); break;
    }
    case "lock-manual": case "lock-now": modal=null; lockNow(); break;

    // ---- チーム ----
    case "enter-team": view={teamId:ds.id, screen:"list", personId:null, topicId:null, editing:false, organize:false, audience:initialAudience(teams.find(t=>t.id===ds.id))}; stage="ready"; render(); break;
    case "back-home": stopSpeak(); view={...view, teamId:null, screen:"list"}; stage="home"; render(); break;   // 全チームの緊急情報の一覧(view.screen が emergency-all)からも、ここでホームへ戻る
    case "make-editable":{   // 「すべて」で受け取ったチームだけを、この端末で編集できるようにする。作成者や「自分の控え」かどうかは確認できない。学生向け・運営向けは一部だけのデータなので、何もしない
      if(!canRestoreOwnBackup(tm)) return;
      if(!confirm("受け取ったすべての情報を、この端末で編集できるようにします。このアプリは、ファイルの作成者や、あなた自身の控えかどうかを確認できません。編集内容はこの端末だけに保存され、元のファイルや送った人の端末とは同期しません。よろしいですか？")) return;
      delete tm.source;   // 通常のチームとして扱う。保存に失敗したら、save() が保存済みの状態(source あり)に戻す
      if(!await save()){render();return;} render(); break;
    }
    case "open-emergency":{   // 運営向けの「緊急時の情報(全員分)」の一覧。学生向けの表示では開かない
      if(!tm || !canSeeEmergency()) return;
      stopSpeak(); view={...view, screen:"emergency", personId:null, topicId:null, editing:false, organize:false}; render(); break;
    }
    case "open-emergency-all":{   // ホームの「緊急時の情報（すべてのチーム）」。出せるチームが1つもないときと、ホーム以外では開かない
      if(stage!=="home" || !emergencyTeams().length) return;
      stopSpeak(); view={...view, teamId:null, screen:"emergency-all", personId:null, topicId:null, editing:false, organize:false, audience:"all"}; render(); break;
    }
    case "open-team-create": modal="team"; modalDraft={isNew:true,name:"",emoji:"🏠",color:"#3D7399"}; render(); break;
    case "edit-team": modal="team"; modalDraft={isNew:false,id:tm.id,name:tm.name,emoji:tm.emoji,color:tm.color}; render(); break;
    case "create-team":{
      keepModalInputs();
      if(!modalDraft.name.trim()){ document.getElementById("t-err").textContent="チーム名を入力してください"; return; }
      const nt=normalizeTeam({id:uid(),name:modalDraft.name.trim(),emoji:modalDraft.emoji,color:modalDraft.color,people:[]});
      teams.push(nt); if(!await save()){render();return;}
      modal=null;
      view={teamId:nt.id,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}; stage="ready"; render(); break;
    }
    case "save-team-edit":{
      keepModalInputs();
      if(!modalDraft.name.trim()){ document.getElementById("t-err").textContent="チーム名を入力してください"; return; }
      Object.assign(tm,{name:modalDraft.name.trim(),emoji:modalDraft.emoji,color:modalDraft.color});
      if(!await save()){render();return;} modal=null; render(); break;
    }
    case "del-team":{
      if(!tm) return;
      const received=isReceivedTeam(tm);
      if(!received && teams.length<2) return;   // 自分で作ったチームは、最後の1つを削除できない(従来どおり)。受け取ったチームは、1つだけでも削除できる
      const msg = received
        ? `「${tm.name}」を削除しますか?\nこの端末から削除します。送った人の端末やファイルからは消えません。元に戻せません。`
        : `「${tm.name}」をこの端末から削除しますか?\nこの端末に保存されたチームとカードが消えます。共有済みの相手のコピーは削除されません。`;
      if(!confirm(msg)) return;
      teams=teams.filter(t=>t.id!==tm.id); privateNotes=deletePrivateNotesForTeam(privateNotes,tm.id); if(!await save()){render();return;} modal=null; view.teamId=null; stage="home"; render(); break;
    }

    // ---- カードのコピー ----
    case "open-copyto": modal="copyto"; render(); break;
    case "copy-card":{
      const target=teams.find(t=>t.id===ds.id);
      if(!target || isReceivedTeam(target)) return;   // 受け取ったチームには、カードを追加しない
      const copy=structuredClone(p); copy.id=uid();
      target.people.push(copy); if(!await save()){render();return;} modal=null; render();
      alert(`「${target.name}」に ${p.name} のカードをコピーしました。\n※コピー後は独立したカードです。`); break;
    }

    // ---- 設定・読み上げ ----
    case "settings": modal="settings"; render(); break;
    case "purge-legacy":{
      if(!confirm("以前の版で暗号化せずに保存されたデータを削除します。現在のデータ（暗号化済み）は消えません。元に戻せません。削除しますか？")) return;
      try{ localStorage.removeItem(LEGACY_KEY); }catch(e){}
      render(); break;
    }
    case "open-about": modal="about"; render(); break;
    case "set-fs": prefs.fs=ds.v; applyPrefs(); render(); break;
    case "set-theme": prefs.theme=ds.v; applyPrefs(); render(); break;
    case "open-passchange": modal="passchange"; render(); break;
    case "passchange-save":{
      const v1=document.getElementById("m-pass1").value, v2=document.getElementById("m-pass2").value;
      const err=document.getElementById("m-pass-err");
      if(v1.length<4){ err.textContent="4文字以上にしてください"; return; }
      if(v1!==v2){ err.textContent="2回の入力が一致しません"; return; }
      const oldSalt=salt, oldKey=cryptoKey, epoch=sessionEpoch;
      const proposedSalt=crypto.getRandomValues(new Uint8Array(16));
      const proposedKey=await deriveKey(v1, proposedSalt);
      if(epoch!==sessionEpoch||cryptoKey!==oldKey||!(stage==="ready"||stage==="home")||document.hidden){return;}   // ホーム(チーム一覧)からも変更できる。解錠したセッションの確認は維持する
      salt=proposedSalt; cryptoKey=proposedKey;
      if(!await save()){salt=oldSalt;cryptoKey=oldKey;render();return;} modal=null; alert("パスコードを変更しました。"); render(); break;
    }
    case "speak":{ if(speaking){ stopSpeak(); render(); break; } speakTopic(p, getTopic(p)); render(); break; }
    case "speak-topic":{   // 学生向けのページの、トピックごとの読み上げ。同じトピックをもう一度押すと止まり、別のトピックを押すと切り替わる
      const def=p?.topicDefs.find(x=>x.id===ds.id);
      if(!def || !isTopicVisible(def, viewAudience())) return;
      if(speaking && speakingTopicId===def.id){ stopSpeak(); render(); break; }
      speakTopic(p, def); render(); break;
    }

    // ---- 画面移動 ----
    // 人物を切り替えたとき(開く・一覧へ戻る)は、表示の相手を初期値に戻す(受け取ったチームは、受け取った相手の値)
    case "open-person": stopSpeak(); view={...view, screen:"person", personId:ds.id, organize:false, audience:initialAudience(tm)}; render(); break;
    case "back-list": stopSpeak(); view={...view, screen:"list", personId:null, audience:initialAudience(tm)}; render(); break;
    case "open-topic":{
      if(view.organize) return;
      const def=p?.topicDefs.find(x=>x.id===ds.id);
      if(!def || !isTopicVisible(def, viewAudience())) return;   // 今の表示の相手に見えないトピックは開かない
      stopSpeak(); view={...view, screen:"detail", topicId:ds.id, editing:false}; render(); break;
    }
    case "back-person": stopSpeak(); draftAudience=null; view={...view, screen:"person", topicId:null, editing:false}; render(); break;
    case "set-audience":{   // 人物ページの「表示: すべて / 学生向け / 運営向け」
      if(!VIEW_AUDIENCES.some(v=>v.id===ds.v)) return;
      stopSpeak();   // 表示が変わると、読み上げていたトピックの画面がなくなる
      view={...view, audience:ds.v, organize:false}; render(); break;
    }

    // ---- 内容編集 ----
    case "start-edit":{ stopSpeak(); const e=p.topics[view.topicId]||[]; draft=e.length?e.map(x=>({...x})):[{label:"",value:""}]; draftAudience=topicAudience(getTopic(p)); view.editing=true; render(); break; }
    case "cancel-edit": view.editing=false; draftAudience=null; render(); break;
    case "draft-add": keepDraftInputs(); draft.push({label:"",value:""}); render(); break;
    case "draft-remove": keepDraftInputs(); draft.splice(+ds.i,1); if(!draft.length)draft=[{label:"",value:""}]; render(); break;
    case "save-edit":{
      keepDraftInputs();
      p.topics[view.topicId]=draft.filter(d=>d.label.trim()||d.value.trim());
      // 公開先は、変えたときだけ def.audience に記録する(変えていなければ、初期値を保存データに書き戻さない)
      const def=getTopic(p), before=topicAudience(def), after=draftAudience ? pickAudienceIds(draftAudience) : before;
      if(def && (after.length!==before.length || after.some(id=>!before.includes(id)))) def.audience=after;
      stampUpdated(p);
      if(!await save()){render();return;} view.editing=false; draftAudience=null; render(); break;
    }

    // ---- 人物 ----
    case "add-person": modal="person"; modalDraft={isNew:true,name:"",emoji:"🌸",note:"",photo:null}; render(); break;
    case "edit-person": modal="person"; modalDraft={id:p.id,name:p.name,emoji:p.emoji,note:p.note||"",photo:p.photo||null}; render(); break;
    case "pick-photo": keepModalInputs(); photoPickerTarget={teamId:tm.id,personId:modalDraft.isNew?null:modalDraft.id,isNew:!!modalDraft.isNew,expiresAt:Date.now()+PICKER_PENDING_MS}; document.getElementById("photoInput").click(); break;
    case "clear-photo": keepModalInputs(); modalDraft.photo=null; render(); break;
    case "save-person":{
      keepModalInputs(); if(!modalDraft.name.trim()) return;
      const now=new Date().toISOString();
      if(modalDraft.isNew) tm.people.push({id:uid(),name:modalDraft.name.trim(),emoji:modalDraft.emoji,note:modalDraft.note.trim(),photo:modalDraft.photo,topicDefs:structuredClone(DEFAULT_TOPICS),topics:{},updatedAt:now});
      else Object.assign(tm.people.find(x=>x.id===modalDraft.id),{name:modalDraft.name.trim(),emoji:modalDraft.emoji,note:modalDraft.note.trim(),photo:modalDraft.photo,updatedAt:now});
      if(!await save()){render();return;} modal=null; render(); break;
    }
    case "del-person":{
      keepModalInputs(); if(!confirm(`${modalDraft.name} のカードを削除しますか?`)) return;
      tm.people=tm.people.filter(x=>x.id!==modalDraft.id); privateNotes=deletePrivateNoteForPerson(privateNotes,tm.id,modalDraft.id); if(!await save()){render();return;} modal=null; view={...view,screen:"list",personId:null}; render(); break;
    }
    case "save-private-note":{
      if(!p || currentScreen()!=="person") return;
      const input=document.getElementById("private-note-input");
      const text=input ? input.value : getPrivateNoteDraft(privateNotes,tm.id,p.id);
      setPrivateNoteDraft(tm.id,p.id,text);
      const result=setPrivateNote(privateNotes,teams,tm.id,p.id,text);
      if(!result.ok){alert(result.error==="too-long"?`メモは${PRIVATE_NOTE_MAX_LENGTH}文字以内にしてください。`:"カードが見つかりません。");return;}
      privateNotes=result.notes;
      if(!await save()){render();return;}
      clearPrivateNoteDraft(tm.id,p.id);
      render(); break;
    }
    case "close-modal":{ const restore=modal==="share-preflight"&&shareReturnFocus; if(modal==="resume-picker")clearPendingPicker(); if(modal==="share-ready")clearPreparedShare(); modal=null; modalDraft=null; render(); if(restore) restoreShareTriggerFocus(); break; }
    case "close-share-ready": clearPreparedShare(); modal=null; render(); break;
    case "discard-picker": if(modal!=="resume-picker") return; clearPendingPicker(); modal=null; screenError="選んだファイルを破棄しました。"; render(); break;
    case "resume-picker":{
      if(modal!=="resume-picker"||!pendingPicker||stage!=="home"||!cryptoKey||document.hidden) return;
      const pending=pendingPicker, epoch=sessionEpoch, key=cryptoKey;
      if(pending.expiresAt<=Date.now()){clearPendingPicker();modal=null;screenError="保留中のファイルは期限切れです。もう一度選んでください。";alert(screenError);render();return;}
      clearPendingPicker(); modal=null; screenError="";
      if(pending.type==="import"){ await processImportFile(pending.file,epoch,key); break; }
      if(pending.type==="legacy-scard"){ await processLegacyScardFile(pending.file,epoch,key); break; }
      const target=pending.target, targetTeam=teams.find(t=>t.id===target.teamId);
      const person=targetTeam?.people.find(x=>x.id===target.personId);
      if(!targetTeam||(!target.isNew&&!person)){screenError="写真を追加するカードが見つからないため、選択を破棄しました。";alert(screenError);render();break;}
      view={teamId:targetTeam.id,screen:target.isNew?"list":"person",personId:target.isNew?null:person.id,topicId:null,editing:false,organize:false,audience:initialAudience(targetTeam)};
      if(target.isNew){modalDraft={isNew:true,name:"",emoji:"🌸",note:"",photo:null};}
      else{view.screen="person";modalDraft={id:person.id,name:person.name,emoji:person.emoji,note:person.note||"",photo:person.photo||null};}
      modal="person"; const expectedDraft=modalDraft; photoPickerTarget=null; stage="ready"; render();
      await applyPhotoFile(pending.file,expectedDraft,epoch,key,target);
      break;
    }

    // ---- トピック ----
    case "toggle-organize": view.organize=!view.organize; render(); break;
    case "add-topic": modal="topic"; modalDraft={title:"",icon:"📌",color:"#5B8DB8"}; render(); break;
    case "save-topic":{
      keepModalInputs(); if(!modalDraft.title.trim()) return;
      p.topicDefs.push({id:uid(),icon:modalDraft.icon,title:modalDraft.title.trim(),color:modalDraft.color,desc:""}); stampUpdated(p); if(!await save()){render();return;} modal=null; render(); break;
    }
    case "del-topic":{
      const t=p.topicDefs.find(x=>x.id===ds.id);
      if(!confirm(`「${t.title}」を削除しますか?\n書かれている内容も消えます。`)) return;
      p.topicDefs=p.topicDefs.filter(x=>x.id!==ds.id); delete p.topics[ds.id]; stampUpdated(p); if(!await save()){render();return;} render(); break;
    }
    case "move-up": case "move-down":{
      const i=p.topicDefs.findIndex(x=>x.id===ds.id), j=act==="move-up"?i-1:i+1;
      if(j<0||j>=p.topicDefs.length) return;
      [p.topicDefs[i],p.topicDefs[j]]=[p.topicDefs[j],p.topicDefs[i]]; stampUpdated(p); if(!await save()){render();return;} render(); break;
    }

    // ---- 共有(暗号化ファイルの書き出し/読み込み) ----
    case "share-team": shareAttempt++; shareReturnFocus=true; shareAudience=defaultShareAudience(tm); modal="share-preflight"; render(); break;
    case "share-audience":{   // 共有前の確認画面で、書き出す相手を選ぶ。受け取ったチームは、受け取った範囲より広い相手を選べない
      if(modal!=="share-preflight" || !tm || !allowedShareAudiences(tm).includes(ds.v)) return;
      shareAudience=ds.v; render();
      const chosen=app.querySelector('input[name="share-aud"]:checked'); if(chosen) chosen.focus();   // 描き直しで外れたフォーカスを戻す(キーボードで続けて選べるように)
      break;
    }
    case "share-proceed":{
      if(modal!=="share-preflight" || !tm) return;
      const audience=shareAudience;
      if(!allowedShareAudiences(tm).includes(audience)) return;
      const attempt=shareAttempt, teamId=tm.id, approvalEpoch=sessionEpoch, approvalKey=cryptoKey;
      // 承認した内容のスナップショット:選んだ相手に渡るトピックだけを複製する(source は取り込んだ端末だけの情報なので、ファイルには入れない)
      const approvedTeam=filterTeamForAudience(tm, audience); delete approvedTeam.source;
      const meta={audience, createdAt:new Date().toISOString(), appVersion:APP_VERSION};
      modal=null; render();
      shareReturnFocus=null;
      // 全角・半角などの違いで相手が開けなくならないよう、NFKCで統一した値を鍵にする(4文字以上の判定も統一後の値)
      const pass = (prompt("共有用のパスコードを決めてください(相手に別途伝えます)")||"").normalize("NFKC");
      if(!pass) return;
      if(pass.length<4){ alert("4文字以上にしてください"); return; }
      const s = crypto.getRandomValues(new Uint8Array(16));
      const k = await deriveKey(pass, s);
      if(attempt!==shareAttempt || sessionEpoch!==approvalEpoch || stage!=="ready" || view.teamId!==teamId || cryptoKey!==approvalKey) return;
      const enc = await encryptJson({team:approvedTeam, meta}, k);   // meta は暗号化された中身にだけ入れる(外側のJSONには平文で出さない)
      if(attempt!==shareAttempt || sessionEpoch!==approvalEpoch || stage!=="ready" || view.teamId!==teamId || !teams.some(t=>t.id===teamId)) return;
      const out = { app:"support-card", type:"team-share", v:1, salt:b64(s), iv:enc.iv, data:enc.data };
      const fileName=shareFileName();
      let markdown;
      try{ markdown=encodeShareMarkdown(out); }
      catch(err){
        if(err?.code!=="SHARE_FILE_TOO_LARGE") throw err;
        alert("この共有ファイルは20MiBを超えるため作成できません。共有する相手の範囲を狭めるか、写真やカードを減らしてください。");
        return;
      }
      const file=typeof File==="function"?new File([markdown],fileName,{type:"text/markdown;charset=utf-8"}):Object.assign(new Blob([markdown],{type:"text/markdown;charset=utf-8"}),{name:fileName});
      if(attempt!==shareAttempt || sessionEpoch!==approvalEpoch || stage!=="ready" || view.teamId!==teamId || cryptoKey!==approvalKey){ return; }
      preparedShare={file,fileName,epoch:approvalEpoch,key:approvalKey,teamId};
      modal="share-ready"; render(); break;
    }
    case "share-native":{
      const ready=preparedShare;
      if(modal!=="share-ready" || !ready || ready.epoch!==sessionEpoch || ready.key!==cryptoKey || !sessionIsCurrent(ready.epoch,ready.key) || !canSharePreparedFile(ready.file)) return;
      let operation;
      try{ operation=navigator.share({files:[ready.file],title:"サポートカードの共有ファイル",text:"暗号化したサポートカードの共有ファイルです。パスコードは別の方法で伝えてください。"}); }
      catch(err){alert("端末の共有メニューを開けませんでした。ファイルを保存して共有してください。");return;}
      try{ await operation; }
      catch(err){ if(err?.name==="AbortError") return; if(sessionIsCurrent(ready.epoch,ready.key)) alert("共有メニューを開けませんでした。ファイルはこの画面から保存できます。"); return; }
      if(!sessionIsCurrent(ready.epoch,ready.key)) return;
      clearPreparedShare(); modal=null; alert("共有画面を閉じました。このアプリでは送信完了を確認できません。"); render(); break;
    }
    case "share-download": downloadPreparedShare(); break;
    case "legacy-scard": document.getElementById("legacyScardInput").click(); break;
    case "import": document.getElementById("importInput").click(); break;

    case "print": buildPrint(p, viewAudience()); window.print(); break;
  }
}

function readPhoto(file){
  return new Promise((resolve,reject)=>{
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = ()=>{
      const max=300, sc=Math.min(1, max/Math.max(img.width,img.height));
      const c=document.createElement("canvas");
      c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg",0.82));
    };
    img.onerror = reject; img.src = url;
  });
}

async function applyPhotoFile(file,expectedDraft,epoch,key,target){
  try{
    const photo=await readPhoto(file);
    const tm=teams.find(t=>t.id===target.teamId);
    if(!sessionIsCurrent(epoch,key)||modal!=="person"||modalDraft!==expectedDraft||view.teamId!==target.teamId||(!target.isNew&&(!tm||!tm.people.some(p=>p.id===target.personId)))) return false;
    expectedDraft.photo=photo; render(); return true;
  }catch(err){ if(sessionIsCurrent(epoch,key)) alert("写真の読み込みに失敗しました"); return false; }
}

// ---- 写真選択 ----
document.getElementById("photoInput").addEventListener("change", async (e)=>{
  const f=e.target.files?.[0]; e.target.value="";
  if(!f){photoPickerTarget=null;return;}
  const target=photoPickerTarget; photoPickerTarget=null;
  if(document.hidden&&(stage==="home"||stage==="ready")) lockNow();
  if(stage==="locked"||!cryptoKey){
    if(target&&target.expiresAt>Date.now()) holdPendingPicker({type:"photo",file:f,target,expiresAt:Math.min(target.expiresAt,Date.now()+PICKER_PENDING_MS)});
    else {alert("ロック中のため写真を保留できませんでした。解錠してから選び直してください。");return;}
    screenError="";render();return;
  }
  if(!modalDraft||!target)return;
  const epoch=sessionEpoch,key=cryptoKey,expectedDraft=modalDraft;
  await applyPhotoFile(f,expectedDraft,epoch,key,target);
});

async function processImportFile(f,importEpoch=sessionEpoch,importKey=cryptoKey){
  if(!sessionIsCurrent(importEpoch,importKey)) return false;
  // ファイル選択に accept を付けていないので、どんなファイルも選べる。大きすぎるものは、読み込む前に断る(端末のメモリを使い切らないように)
  if(isShareFileTooLarge(f)){ alert("この共有ファイルは20MiBを超えているため読み込めません。送り手に写真やカードを減らした小さいファイルを作ってもらってください。"); return false; }
  const sessionCurrent=()=>sessionIsCurrent(importEpoch,importKey);
  const r=new FileReader();
  const completed=new Promise(resolve=>{
  r.onerror=()=>{ if(sessionCurrent()) alert("ファイルを読み込めませんでした。"); resolve(false); };   // ファイルを読み取れなかったとき
  r.onload=async ()=>{
    try{
      if(!sessionCurrent()){resolve(false);return;}
      let data;
      try{ data=parseShareMarkdown(r.result); }
      catch(err){
        // 共有ファイルの形ではない。accept を付けていないので、違うファイルを選ぶことがある。
        // 旧 .scard(JSON の封筒)なら変換の手順を、それ以外なら選び直しを案内する(パスコードは聞かない)
        let legacy=false; try{ legacy=isEncryptedShareEnvelope(JSON.parse(r.result)); }catch(e){}
        alert(legacy
          ? "旧 .scard ファイルです。このままでは読み込めません。\n設定の「旧 .scard ファイルを .md に変換」で .md に変換してから、読み込んでください。"
          : "このファイルは、サポートカードの共有ファイル(.md)ではないため、読み込めません。\n送ってもらったファイルを選び直してください。");
        resolve(false); return;
      }
      if(data.type==="team-share" && data.salt){
        if(data.v!==1 && data.v!==undefined){ alert("新しいバージョンのアプリで作られたファイルのため、読み込めません。"); resolve(false);return; }
        const pass=prompt("共有ファイルのパスコードを入力してください");
        if(!pass){resolve(false);return;}
        let obj;
        try{ obj=await decryptShared(data, pass); }
        catch(err){ alert("パスコードがちがうか、ファイルが壊れています。"); resolve(false);return; }
        if(!sessionCurrent()){resolve(false);return;}
        let nt;
        try{
          nt=normalizeTeam(sanitizeImportedTeam(obj.team)); nt.id=uid();
          // 取り込んだ印:ファイルの中の source は無視して、アプリが付ける。meta のない古いファイルは audience:"all"・createdAt:null
          const meta=sanitizeShareMeta(obj.meta);
          nt.source={importedAt:new Date().toISOString(), createdAt:meta.createdAt, audience:meta.audience};
        }
        catch(err){ alert("ファイルの内容が正しくないため、読み込めませんでした。"); resolve(false);return; }
        if(!confirm(`「${nt.name}」を新しいチームとして追加します。よろしいですか?\n受け取った情報は、この端末では編集できません。`)){resolve(false);return;}
        teams.push(nt); const saved=await save();
        if(!saved||!sessionCurrent()){resolve(false);return;}
        view={teamId:nt.id,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:nt.source.audience}; stage="ready"; render();
        resolve(true);return;
      }
      alert("このファイルは読み込めません。サポートカードの暗号化 .md 共有ファイルを選んでください。");
      resolve(false);
    }catch(err){ alert("読み込めませんでした。");resolve(false); }
  };});
  r.readAsText(f);
  return completed;
}

function downloadPreparedShare(){
  const ready=preparedShare;
  if(modal!=="share-ready" || !ready || ready.epoch!==sessionEpoch || ready.key!==cryptoKey || !sessionIsCurrent(ready.epoch,ready.key)) return false;
  try{
    const url=URL.createObjectURL(ready.file), a=document.createElement("a");
    a.href=url; a.download=ready.fileName; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(err){ alert("ファイルを保存できませんでした。もう一度お試しください。"); return false; }
  clearPreparedShare(); modal=null; render();
  alert("暗号化した .md ファイルの保存を開始しました。パスコードは別の方法で相手に伝えてください。送信や相手の受け取りは、このアプリでは確認できません。");
  return true;
}

async function processLegacyScardFile(f,epoch=sessionEpoch,key=cryptoKey){
  if(!sessionIsCurrent(epoch,key)) return false;
  if(isShareFileTooLarge(f)){ alert("この旧 .scard ファイルは20MiBを超えているため変換できません。小さいファイルを選んでください。"); return false; }   // accept を付けていないので、大きすぎるものは読み込む前に断る
  if(!confirm("旧 .scard ファイルの暗号化データを復号せず、そのまま共有用 .md ファイルに変換します。よろしいですか?")) return false;
  const reader=new FileReader();
  return new Promise(resolve=>{
    reader.onerror=()=>{if(sessionIsCurrent(epoch,key)) alert("旧ファイルを読み込めませんでした。");resolve(false);};
    reader.onload=()=>{
      try{
        if(!sessionIsCurrent(epoch,key)){resolve(false);return;}
        const markdown=convertLegacyScardToMarkdown(reader.result);
        const fileName=shareFileName();
        const file=typeof File==="function"?new File([markdown],fileName,{type:"text/markdown;charset=utf-8"}):Object.assign(new Blob([markdown],{type:"text/markdown;charset=utf-8"}),{name:fileName});
        preparedShare={file,fileName,epoch,key,teamId:null,convertedLegacy:true};
        modal="share-ready"; render(); resolve(true);
      }catch(err){
        if(err?.code==="SHARE_FILE_TOO_LARGE") alert("変換後の共有ファイルは20MiBを超えるため作成できません。変換できる小さい旧 .scard ファイルを選んでください。");
        else alert("対応していない .scard ファイルです。変換できるのは、このアプリの暗号化 v1 ファイルだけです。");
        resolve(false);
      }
    };
    reader.readAsText(f);
  });
}

// ---- 通常の読み込み(.md のみ)。旧 .scard は設定の移行専用操作で変換する ----
document.getElementById("importInput").addEventListener("change",(e)=>{
  const f=e.target.files?.[0]; e.target.value=""; if(!f) return;
  if(document.hidden&&(stage==="home"||stage==="ready")) lockNow();
  if(stage==="locked"||!cryptoKey){ holdPendingPicker({type:"import",file:f,expiresAt:Date.now()+PICKER_PENDING_MS}); screenError=""; render(); return; }
  processImportFile(f,sessionEpoch,cryptoKey);
});

document.getElementById("legacyScardInput").addEventListener("change",(e)=>{
  const f=e.target.files?.[0];e.target.value="";if(!f)return;
  if(document.hidden&&(stage==="home"||stage==="ready")) lockNow();
  if(stage==="locked"||!cryptoKey){holdPendingPicker({type:"legacy-scard",file:f,expiresAt:Date.now()+PICKER_PENDING_MS});screenError="";render();return;}
  processLegacyScardFile(f,sessionEpoch,cryptoKey);
});
