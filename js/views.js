/* ============================================================
   js/views.js ― 画面
   ------------------------------------------------------------
   役割:状態(state.js)をもとに、各画面とモーダルのHTMLを作り、#app に表示する。
        HTMLを作るだけで、ボタンを押したときの処理は actions.js の handle() にある。
   主な関数:
     render(画面全体の描き直し。画面が変わったときだけ先頭へスクロールし、最後に履歴を合わせる)/
     setupScreen・lockScreen・homeScreen・listScreen・personScreen・detailScreen
     studentPage(学生向けの「はじめましてページ」。学生向けの表示のときは、人物ページの代わりに出す)/
     emergencyScreen(運営向けの「緊急時の情報(全員分)」の一覧。人物ごとの部分は emergencyCard)/
     emergencyAllScreen(ホームの「緊急時の情報（すべてのチーム）」。チームごとの見出しの下に、同じ emergencyCard を並べる)
     modalHtml(各モーダルのHTML)/ avatarHtml(写真、または名前の最初の1文字の丸。名前が空なら person アイコン)/
     buildPrint(印刷用のHTML。今の表示の相手に見える内容だけ。学生向けは、はじめましてページと同じ並び順と固定の案内)
     audienceChips(タイルの公開先バッジ)/ audienceBar(表示の切り替えと注記)/ receivedBanner(受け取った情報の帯)/ entryHtml(項目カード)
     app(#app の要素)。印刷が終わったら印刷用の領域を空にする afterprint の登録もここ
   依存:state.js(状態・getTeam・viewAudience・currentScreen・emergencyTeams・syncHistory など)・
        data.js(topicAudience・filterPersonForAudience・studentPageTopics・emergencyInfo・topicHint など)・
        util.js(esc・fmtDay)・icons.js(icon・topicIcon。アイコンは必ずここを通して出す)・constants.js(THEMES・AUDIENCES・STUDENT_NOTICE・EMERGENCY_NOTE など)
        (いずれもこれより前に読み込む)
   見た目:絵文字は使わない(保存データの emoji・color・icon の値は残すが、表示には使わない)。色は css のトークンで決め、トピックやチームの色は使わない。
   実行時にだけ呼ぶもの:actions.js の bindEvents()(render の最後で呼ぶ)
   ============================================================ */
"use strict";

// 写真があればその写真。なければ、名前の最初の1文字(名前が空なら person アイコン)を、薄い水色の丸に出す。
// 保存データの emoji は、表示に使わない。1文字は利用者の入力なので esc() を通す。名前は隣に出るので、丸は読み上げの対象にしない
function avatarHtml(p, size){
  if(p.photo) return `<span class="avatar photo" style="width:${size}px;height:${size}px"><img src="${esc(p.photo)}" alt=""></span>`;
  const first = Array.from(String(p.name ?? "").trim())[0];
  return `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${size*0.5}px">${first ? esc(first) : icon("person", Math.round(size*0.5))}</span>`;
}
function canSharePreparedFile(file){
  try{
    if(typeof navigator==="undefined" || typeof navigator.share!=="function") return false;
    return typeof navigator.canShare!=="function" || navigator.canShare({files:[file]});
  }catch(e){ return false; }
}

// ================= 描画 =================
const app = document.getElementById("app");
let lastRenderedModal=null;
function render(){
  const sameModal=!!modal&&modal===lastRenderedModal;
  const retainedFocus=sameModal&&typeof focusLocation==="function"?focusLocation(document.activeElement):null;
  const screen = currentScreen();   // 描く画面の名前(state.js)。履歴の深さも同じ名前から決める
  let html = "";
  if(screen==="boot") html = `<div class="lock-wrap"><div class="loading">読み込み中…</div></div>`;
  else if(screen==="setup-pass") html = setupScreen();
  else if(screen==="locked") html = lockScreen();
  else if(screen==="home") html = homeScreen();
  else if(screen==="emergency-all") html = emergencyAllScreen();
  else if(screen==="detail") html = detailScreen(getPerson(), getTopic(getPerson()));
  else if(screen==="emergency") html = emergencyScreen(getTeam());
  else if(screen==="person") html = viewAudience()==="student" ? studentPage(getPerson()) : personScreen(getPerson());   // 学生向けの表示は、タイルではなく1ページ
  else html = listScreen(getTeam());
  app.innerHTML = `<div class="screen">${html}</div>` + (modal ? modalHtml() : "");
  bindEvents();
  if(retainedFocus&&typeof focusElementAt==="function") focusElementAt(retainedFocus);
  lastRenderedModal=modal;
  const f = document.getElementById("lk-pass") || document.getElementById("su-pass1");
  if(f) f.focus();
  // 画面が変わったとき(stage・view.screen・teamId・personId・topicId・audience のどれか)だけ先頭へ。
  // モーダルの開閉・書きこみの開始・読み上げの終了などの描き直しでは、今の位置のままにする
  const key = screenKey();
  if(key!==lastScreenKey){ lastScreenKey = key; window.scrollTo(0,0); }
  syncHistory();   // 画面が深くなったら履歴を積み、浅くなったら戻す(端末やブラウザの「戻る」で一段ずつ戻れるように)
}

// ---- 相手別の公開設定・受け取った情報の部品 ----
// タイルの公開先バッジ:「学生」「運営」。どちらにも見せないトピックは「家族のみ」
function audienceChips(def){
  const a = topicAudience(def);
  const chips = AUDIENCES.filter(x=>a.includes(x.id)).map(x=>`<span class="aud-chip">${esc(x.short)}</span>`).join("");
  return `<span class="tile-aud">${chips || `<span class="aud-chip family">家族のみ</span>`}</span>`;
}
// 人物ページの「表示: すべて / 学生向け / 運営向け」の切り替えと、相手別の表示のときの注記(自分のチームだけ。受け取ったチームには出さない)
function audienceBar(aud){
  return `<div class="aud-switch" role="group" aria-label="表示する相手">
      <span class="aud-switch-label">表示:</span>
      <div class="seg">
        ${VIEW_AUDIENCES.map(v=>`<button class="seg-btn ${aud===v.id?"on":""}" data-act="set-audience" data-v="${esc(v.id)}" aria-pressed="${aud===v.id}">${esc(v.label)}</button>`).join("")}
      </div>
    </div>
    ${aud!=="all"?`<p class="view-note" role="status">${aud==="student"?"カードの内容は変更できません。メモは下に書けます。":`${esc(VIEW_AUDIENCES.find(v=>v.id===aud).label)}の表示です（編集はできません）`}</p>`:""}`;
}
// 項目カード(見出しと内容)。色は css が決める(中立の色。緊急のトピックの中では、外側の .urgent で赤い線と文字になる)
const entryHtml = (e) => `
        <div class="entry">
          ${e.label?`<div class="entry-label">${esc(e.label)}</div>`:""}
          <div class="entry-value">${esc(e.value)}</div>
        </div>`;
// 受け取った情報の帯(チーム一覧と人物ページの上部)。withDelete:削除の導線を帯の中に置く(チーム編集の画面には入れないため)。
// 「すべて」で受け取ったチームだけ、この端末で編集できるようにするボタンを出す(作成者や自分の控えかは認証しない。学生向け・運営向けは一部だけのデータなので出さない)
function receivedBanner(tm, withDelete){
  if(!isReceivedTeam(tm)) return "";
  const s = tm.source;
  return `<div class="notice received-banner" role="note">
      <b>受け取った情報（${esc(AUDIENCE_NAMES[initialAudience(tm)])}）</b>。作成: ${esc(fmtDay(s.createdAt)||"不明")}。受け取り: ${esc(fmtDay(s.importedAt)||"不明")}。この端末では編集できません。内容の修正は、作成した人に依頼してください。不要になったら、${withDelete?"下":"チーム一覧"}の「このチームを削除する」から削除してください（送った人の端末からは消せません）。
      ${withDelete?`<button class="banner-del" data-act="del-team">このチームを削除する</button>`:""}
      ${canRestoreOwnBackup(tm)?`<button class="banner-edit" data-act="make-editable">この端末で編集する（「すべて」の受け取り）</button>`:""}
    </div>`;
}

function privateNoteEditor(tm, p){
  const dirty = privateNoteDraftDirty(tm.id, p.id);
  return `<section class="private-note-editor" aria-labelledby="private-note-title">
    <label class="private-note-label" id="private-note-title" for="private-note-input">この端末だけのメモ</label>
    <textarea class="private-note-input" id="private-note-input" rows="3" aria-describedby="private-note-help" data-private-note-team="${esc(tm.id)}" data-private-note-person="${esc(p.id)}">${esc(getPrivateNoteDraft(privateNotes,tm.id,p.id))}</textarea>
    <p class="private-note-help" id="private-note-help">このメモはこの端末に暗号化して保存され、共有・書き出し・印刷には入りません。同じ端末の解錠者は読めます。${dirty?` <strong class="private-note-unsaved" role="status">未保存</strong>`:""}</p>
    <p class="private-note-lock-help">ロックすると、未保存の入力は消えます。</p>
    <button class="big-btn btn-primary" data-act="save-private-note">メモを保存</button>
  </section>`;
}

// ---- 初回パスコード設定 ----
function setupScreen(){
  return `
  <div class="lock-wrap">
    <div class="lock-card">
      <div class="login-logo">${icon("lock",28)}</div>
      <div class="lock-title">ようこそ</div>
      <div class="lock-sub">はじめに、このアプリを守る<b>パスコード</b>を決めましょう。<br>データはこのパスコードで暗号化されます。</div>
      <input class="lock-input" id="su-pass1" type="password" autocomplete="new-password" placeholder="パスコード(4文字以上)">
      <input class="lock-input" id="su-pass2" type="password" autocomplete="new-password" placeholder="もう一度入力">
      <div class="lock-error">${esc(screenError)}</div>
      <button class="big-btn btn-primary" data-act="setup-go">はじめる</button>
      <div class="login-note">パスコードを忘れるとデータを復元できません。<br>必ず控えてください。</div>
    </div>
  </div>`;
}

// ---- ロック画面 ----
function lockScreen(){
  return `
  <div class="lock-wrap">
    <div class="lock-card">
      <div class="login-logo">${icon("lock",28)}</div>
      <div class="lock-title">サポートカード</div>
      <div class="lock-sub">パスコードを入力してください。</div>
      <input class="lock-input" id="lk-pass" type="password" autocomplete="off" placeholder="パスコード">
      <div class="lock-error">${esc(pendingPicker ? "選んだファイルは一時保留中です。解錠後に再開するか、破棄できます。" : screenError)}</div>
      <div class="lock-wait">${esc(lockWaitMsg)}</div>
      <button class="big-btn btn-primary" data-act="unlock">ひらく</button>
    </div>
  </div>`;
}

// ---- ホーム:チーム一覧 ----
function homeScreen(){
  return `
  <div class="list-head home-head">
    <div class="brand">サポートカード</div>
    <h1 class="list-title">ホーム</h1>
    <p class="greet">伝える相手ごとに情報をまとめて共有できます。たとえば、家族・通っている場所・イベントごとにチームを作れます。</p>
  </div>
  <div class="home-actions">
    ${emergencyTeams().length?`<button class="home-emergency" data-act="open-emergency-all">${icon("alert",24)}<span class="home-action-body"><span class="home-action-title">緊急時の情報</span><span class="home-action-desc">すべてのチームの情報を確認</span></span><span class="home-action-arrow" aria-hidden="true">›</span></button>`:""}
    <button class="home-primary" data-act="open-team-create">新しいチームを作る</button>
    <button class="home-secondary" data-act="import">共有ファイルを読み込む</button>
  </div>
  <div class="home-section-head"><h2>チーム</h2><span>${teams.length}件</span></div>
  <div class="list-body home-list">
    ${teams.length===0?`<div class="empty home-empty">まだチームがありません。<br>「新しいチームを作る」から始めましょう。</div>`:""}
    ${teams.map(t=>`
      <button class="team-card" data-act="enter-team" data-id="${esc(t.id)}">
        <span class="team-body">
          <span class="team-name">${esc(t.name)}</span>
          <span class="team-sub">${t.people.length}人${isReceivedTeam(t)?` <span class="team-badge">受け取った情報</span>`:""}</span>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </button>`).join("")}
  </div>
  <nav class="home-utility" aria-label="その他の操作">
    <button class="home-utility-link" data-act="settings">設定</button>
    <button class="home-utility-link" data-act="lock-manual">ロックする</button>
    <button class="home-utility-link" data-act="open-about">アプリについて</button>
  </nav>`;
}

// ---- チーム内:カード一覧 ----
function listScreen(tm){
  if(!tm){ stage="home"; return homeScreen(); }
  const received = isReceivedTeam(tm);   // 受け取ったチームは見るだけ(チーム編集・カードの追加を出さない)
  return `
  <div class="list-head">
    <button class="back-link" data-act="back-home">← ホーム(チーム一覧)</button>
    <h1 class="list-title">${esc(tm.name)}</h1>
    <p class="list-sub">カードをタップすると、本人についての情報を確認できます</p>
    ${receivedBanner(tm, true)}
    <div class="toolbar">
      ${canSeeEmergency()?`<button class="tool-btn em-btn" data-act="open-emergency">${icon("alert",18)}緊急時の情報（全員分）</button>`:""}
      <button class="tool-btn" data-act="share-team">このチームを共有</button>
      <button class="tool-btn" data-act="import">読み込み</button>
      ${received?"":`<button class="tool-btn" data-act="edit-team">チーム編集</button>`}
      <button class="tool-btn" data-act="settings">設定</button>
    </div>
  </div>
  <div class="list-body">
    ${tm.people.length===0?(received?`<div class="empty">このチームには、カードが含まれていません。</div>`:`<div class="empty">まだカードがありません。<br>「新しいカードを作る」から始めましょう。</div>`):""}
    ${tm.people.map(p=>`
      <button class="person-card" data-act="open-person" data-id="${esc(p.id)}">
        ${avatarHtml(p,64)}
        <span class="person-body">
          <span class="hero-name" style="display:block">${esc(p.name)}</span>
          ${p.note?`<span class="hero-note" style="display:block">${esc(p.note)}</span>`:""}
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </button>`).join("")}
    ${received?"":`<button class="add-card" data-act="add-person">${icon("plus",20)}新しいカードを作る</button>`}
  </div>`;
}

function personScreen(p){
  const tm=getTeam();
  const aud=viewAudience(), received=isReceivedTeam(tm), editable=canEditCards();
  const defs = aud==="all" ? p.topicDefs : p.topicDefs.filter(t=>isTopicVisible(t, aud));   // 相手別の表示では、その相手に見えるトピックだけ
  const updated = fmtDay(p.updatedAt);
  const heroBody = `
      ${avatarHtml(p,68)}
      <span>
        <span class="hero-name" style="display:block">${esc(p.name)}</span>
        ${p.note?`<span class="hero-note" style="display:block">${esc(p.note)}</span>`:""}
        ${updated?`<span class="hero-updated" style="display:block">最終更新: ${esc(updated)}</span>`:""}
        ${editable?`<span class="hero-hint" style="display:block">タップして名前・写真を編集</span>`:""}
      </span>`;
  return `
  <div class="p-head">
    <button class="back-link" data-act="back-list">← ${esc(tm.name)} の一覧</button>
    ${receivedBanner(tm, false)}
    ${editable?`<button class="hero" data-act="edit-person">${heroBody}
    </button>`:`<div class="hero static">${heroBody}
    </div>`}
    <div class="toolbar">
      ${editable?`<button class="tool-btn" data-act="toggle-organize">${view.organize?"整理を終わる":"トピックを整理"}</button>`:""}
      <button class="tool-btn" data-act="print">印刷・PDF</button>
      ${editable && teams.some(t=>t.id!==tm.id && !isReceivedTeam(t))?`<button class="tool-btn" data-act="open-copyto">他のチームへコピー</button>`:""}
    </div>
    ${received?"":audienceBar(aud)}
  </div>
  <div class="grid">
    ${aud!=="all" && defs.length===0?`<div class="empty" style="grid-column:1/-1">この相手に見せるトピックは、まだありません。</div>`:""}
    ${defs.map((t,i)=>{
      const n = (p.topics[t.id]||[]).length;
      if(view.organize && editable) return `
      <div class="tile organize-tile ${t.urgent?"urgent":""}" data-topic-item data-id="${esc(t.id)}">
        <div class="tile-tools">
          <button type="button" class="tile-drag-handle" data-topic-drag-handle data-id="${esc(t.id)}" aria-label="${esc(t.title)}をドラッグして並べ替え" title="ドラッグして並べ替え">${icon("grip",20)}</button>
          ${i>0?`<button type="button" class="tile-tool" data-act="move-up" data-id="${esc(t.id)}" aria-label="上へ">${icon("up",20)}</button>`:""}
          ${i<p.topicDefs.length-1?`<button type="button" class="tile-tool" data-act="move-down" data-id="${esc(t.id)}" aria-label="下へ">${icon("down",20)}</button>`:""}
          <button type="button" class="tile-tool tile-tool-danger" data-act="del-topic" data-id="${esc(t.id)}" aria-label="削除">${icon("trash",20)}</button>
        </div>
        <span class="tile-icon">${topicIcon(t)}</span><span class="tile-title">${esc(t.title)}</span>
        ${(t.desc || n>0)?`<span class="tile-desc">${esc(t.desc||"記入ずみ")}</span>`:""}
        ${aud==="all"?audienceChips(t):""}
      </div>`;
      return `
      <button class="tile ${t.urgent?"urgent":""}" data-act="open-topic" data-id="${esc(t.id)}">
        ${n>0?`<span class="tile-badge">${n}件</span>`:`<span class="tile-badge blank">未記入</span>`}
        <span class="tile-icon">${topicIcon(t)}</span><span class="tile-title">${esc(t.title)}</span>
        ${(t.desc || n>0)?`<span class="tile-desc">${esc(t.desc||"記入ずみ")}</span>`:""}
        ${aud==="all"?audienceChips(t):""}
      </button>`;
    }).join("")}
    ${editable?`<button class="add-tile" data-act="add-topic">${icon("plus",20)}<span>トピックを追加</span></button>`:""}
  </div>
  ${privateNoteEditor(tm,p)}
  <div class="footer-hint">知りたいことをタップすると、必要な情報だけが大きく表示されます</div>`;
}

// ---- 学生向けの「はじめましてページ」 ----
// 学生向けの表示(自分のチームを「学生向け」で見ているときと、学生向けで受け取ったチーム)の人物ページ。タイルではなく、1ページで縦に並べる。
// 見るだけのページ。編集の操作は出さない(自分のチームでは、「すべて」に戻すための表示の切り替えだけ出す)。
// 並び順は STUDENT_PAGE_ORDER(伝え方 → 一緒に活動するとき → 好き → 苦手 → その他)。中身のないトピックは出さない
function studentPage(p){
  const tm=getTeam(), received=isReceivedTeam(tm);
  const updated=fmtDay(p.updatedAt);
  const topics=studentPageTopics(p);
  return `
  <div class="p-head">
    <button class="back-link" data-act="back-list">← ${esc(tm.name)} の一覧</button>
    ${receivedBanner(tm, false)}
    ${received?"":audienceBar("student")}
  </div>
  <article class="sp" aria-labelledby="sp-title">
    <header class="sp-hero">
      ${avatarHtml(p,96)}
      <div class="sp-hero-body">
        <h1 class="sp-title" id="sp-title">${esc(p.name)}のこと</h1>
        <p class="sp-lead">一緒に過ごすときに、知っておいてほしいこと</p>
        ${p.note?`<p class="sp-note">${esc(p.note)}</p>`:""}
        ${updated?`<p class="hero-updated">最終更新: ${esc(updated)}</p>`:""}
      </div>
    </header>
    <div class="toolbar sp-tools">
      <button class="tool-btn" data-act="print">印刷・PDF</button>
    </div>
    ${topics.length===0?`<p class="sp-empty" role="status">まだ学生（一緒に参加する人）向けに公開された情報はありません</p>`:""}
    ${topics.map(({def:t, entries}, i)=>`
    <section class="sp-topic${t.urgent?" urgent":""}" aria-labelledby="sp-topic-${i}">
      <div class="sp-topic-head">
        <span class="sp-icon" aria-hidden="true">${topicIcon(t)}</span>
        <h2 class="sp-topic-title" id="sp-topic-${i}">${esc(t.title)}</h2>
        <button class="sp-speak" aria-label="${esc(t.title)}を${speaking && speakingTopicId===t.id?"止める":"読み上げる"}" data-act="speak-topic" data-id="${esc(t.id)}">${speaking && speakingTopicId===t.id?`${icon("stop",18)}止める`:`${icon("speak",18)}読み上げ`}</button>
      </div>
      ${entries.map(entryHtml).join("")}
    </section>`).join("")}
    <aside class="sp-care" role="note">
      <p>${esc(STUDENT_NOTICE)}</p>
    </aside>
  </article>
  ${privateNoteEditor(tm,p)}`;
}

// ---- 運営向けの「緊急時の情報(全員分)」の一覧 ----
// 人物ごとに、写真と名前、「発作・緊急時」(emergency)の全項目、「基本情報」(basic)のうち見出しに「連絡」を含む項目を並べる。
// 空のところには、2通りの文を出し分ける(emergencyInfo の hidden):
//   ・トピックがない・中身が空 → 「記入なし（家族に確認してください）」
//   ・トピックはあるが、その相手に見せない設定 → 「運営スタッフには公開されていません（家族に確認してください）」
// 見るだけの画面。電話番号に tel: のリンクは付けない(誤発信を防ぐ)。
// i:見出しの id の一部(画面の中で重ならない値)。level:人物の名前の見出しの段(チームごとの一覧は 2。ホームの全チームの一覧は、チームの見出し(2)の下なので 3)。
// 中の見出し(発作・緊急時/連絡先)は、その1つ下の段にする
function emergencyCard(p, aud, i, level=2){
  const info = emergencyInfo(p, aud);
  const none = info.emergency.entries.length===0 && info.contact.entries.length===0;
  const blank = `<p class="em-empty">記入なし（家族に確認してください）</p>`;
  const hidden = `<p class="em-empty">運営スタッフには公開されていません（家族に確認してください）</p>`;
  const emptyOf = (part) => part.hidden ? hidden : blank;
  const section = (title, part) => `
      <div class="em-sec">
        <h${level+1} class="em-sec-title">${esc(title)}</h${level+1}>
        ${part.entries.length ? part.entries.map(entryHtml).join("") : emptyOf(part)}
      </div>`;
  // どちらにも項目がなく、空の理由も同じなら、見出しなしで1つだけ出す。理由が違う(片方は見せない設定、片方は記入なし)ときは、見出しごとに出し分ける
  const single = none && emptyOf(info.emergency)===emptyOf(info.contact);
  return `
    <section class="em-person" aria-labelledby="em-name-${i}">
      <div class="em-person-head">
        ${avatarHtml(p,52)}
        <h${level} class="em-name" id="em-name-${i}">${esc(p.name)}</h${level}>
      </div>
      ${single ? emptyOf(info.emergency) : section(info.emergency.def?.title || "発作・緊急時", info.emergency) + section("連絡先", info.contact)}
    </section>`;
}
function emergencyScreen(tm){
  const aud = viewAudience();
  return `
  <div class="p-head">
    <button class="back-link" data-act="back-list">← ${esc(tm.name)} の一覧</button>
    ${receivedBanner(tm, false)}
    <h1 class="list-title">緊急時の情報（全員分）</h1>
    <p class="em-note" role="note">${esc(EMERGENCY_NOTE)}</p>
  </div>
  <div class="em-list">
    ${tm.people.length===0?`<div class="empty">このチームには、カードが含まれていません。</div>`:""}
    ${tm.people.map((p,i)=>emergencyCard(p, aud, i)).join("")}
  </div>`;
}

// ---- ホームの「緊急時の情報（すべてのチーム）」 ----
// 運営の端末は、家族ごとに別のチームで情報を受け取る。チームを一つずつ開かなくても、全チームの分を1画面で見られる一覧。
// 出すチームと、チームごとに使う相手は emergencyTeams()(自分のチーム=すべて、受け取ったチーム=受け取った相手。学生向けで受け取ったチームは含めない)。
// チームごとに見出し(チーム名。受け取ったチームは「受け取った情報」と作成日)を付け、その下に人物ごとのカード(emergencyCard)を並べる。
// データは複製せず、チームのデータをそのまま読む。見るだけの画面:編集の操作も tel: のリンクもなく、使える操作は「← ホーム」だけ(handle() でも、これ以外は拒否する)
function emergencyAllScreen(){
  return `
  <div class="p-head">
    <button class="back-link" data-act="back-home">← ホーム</button>
    <h1 class="list-title em-all-title">緊急時の情報（すべてのチーム）</h1>
    <p class="em-note" role="note">${esc(EMERGENCY_NOTE)}</p>
  </div>
  <div class="em-list em-all">
    ${emergencyTeams().map(({team, audience}, ti)=>`
    <section class="em-team" aria-labelledby="em-team-${ti}">
      <div class="em-team-head">
        <h2 class="em-team-name" id="em-team-${ti}">${esc(team.name)}</h2>
        ${isReceivedTeam(team)?`<p class="em-team-sub">受け取った情報 ・ 作成: ${esc(fmtDay(team.source.createdAt)||"不明")}</p>`:""}
      </div>
      ${team.people.length===0?`<div class="empty">このチームには、カードが含まれていません。</div>`:""}
      ${team.people.map((p,i)=>emergencyCard(p, audience, `${ti}-${i}`, 3)).join("")}
    </section>`).join("")}
  </div>`;
}

function detailScreen(p, t){
  const entries = p.topics[t.id]||[];
  const canEdit = canEditCards();            // 受け取ったチームと、相手別の表示では「書きこむ」を出さない
  const editing = view.editing && canEdit;
  const hint = topicHint(t) ? `<p class="topic-hint">記入例: ${esc(topicHint(t))}</p>` : "";   // 家族向けの記入例(自作のトピックにはない)
  // 「書きこむ」「保存する」は、緊急のトピックでも主な操作の色(赤は、緊急の表示と削除だけに使う。トピックごとの色も使わない)
  let body;
  if(!editing){
    body = `
      ${entries.length===0?`<div class="empty">まだ何も書かれていません。${canEdit?"<br>「書きこむ」から追加できます。":""}</div>`:""}
      ${entries.length===0 && canEdit?hint:""}
      ${entries.map(entryHtml).join("")}
      ${canEdit?`<button class="big-btn btn-primary" data-act="start-edit">書きこむ</button>`:""}`;
  }else{
    const aud = draftAudience || topicAudience(t);   // チェックの状態は、編集中の一時データ(draftAudience)。「保存する」まで def.audience には書かない
    body = `
      ${hint}
      ${draft.map((d,i)=>`
        <div class="edit-card">
          <input class="input" placeholder="見出し(例:対応のしかた)" value="${esc(d.label)}" data-draft-label="${i}">
          <textarea class="textarea" rows="3" placeholder="内容を書いてください" data-draft-value="${i}">${esc(d.value)}</textarea>
          <button class="remove-link" data-act="draft-remove" data-i="${i}">この項目を消す</button>
        </div>`).join("")}
      <button class="big-btn btn-secondary" data-act="draft-add">${icon("plus",18)}項目をふやす</button>
      <div class="edit-card aud-edit" role="group" aria-labelledby="aud-edit-title">
        <div class="aud-title" id="aud-edit-title">このトピックを見せる相手</div>
        ${AUDIENCES.map(a=>`<label class="aud-check"><input type="checkbox" data-draft-aud="${esc(a.id)}"${aud.includes(a.id)?" checked":""}><span>${esc(a.label)}</span></label>`).join("")}
        <p class="aud-note">家族（このカードを作った人）は、いつでもすべて見られます</p>
      </div>
      <div class="btn-row">
        <button class="big-btn btn-secondary" data-act="cancel-edit">やめる</button>
        <button class="big-btn btn-primary" data-act="save-edit">保存する</button>
      </div>`;
  }
  return `
  <div class="d-head${t.urgent?" urgent":""}">
    <div class="d-bar">
      <button class="d-back" data-act="back-person">← もどる</button>
      ${entries.length&&!editing?`<button class="d-back" data-act="speak">${speaking?`${icon("stop",18)}止める`:`${icon("speak",18)}読み上げ`}</button>`:""}
    </div>
    <div class="d-row">
      <span class="d-icon" aria-hidden="true">${topicIcon(t,32)}</span>
      <div>
        <div class="d-person">${esc(p.name)}</div>
        <h1 class="d-title">${esc(t.title)}</h1>
      </div>
    </div>
  </div>
  <div class="d-body${t.urgent?" urgent":""}">${body}</div>`;
}

// ---- モーダル ----
function modalHtml(){
  const d = modalDraft;
  if(modal==="person"){
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>${d.isNew?"新しいカードを作る":"カードを編集"}</h2>
      <div class="m-photo-row">
        ${avatarHtml(d,72)}
        <div class="m-photo-actions">
          <button class="photo-btn" data-act="pick-photo">写真を選ぶ</button>
          ${d.photo?`<button class="photo-btn danger" data-act="clear-photo">写真を消す</button>`:""}
        </div>
      </div>
      <div class="m-label">名前</div>
      <input class="input" id="m-name" placeholder="例:山田 花子さん" value="${esc(d.name)}">
      <div class="m-label">ひとこと紹介</div>
      <input class="input" id="m-note" placeholder="例:音楽がだいすき" value="${esc(d.note)}">
      <div class="btn-row">
        <button class="big-btn btn-secondary" data-act="close-modal">やめる</button>
        <button class="big-btn btn-primary" data-act="save-person">保存する</button>
      </div>
      ${!d.isNew?`<button class="danger-link" data-act="del-person">このカードを削除する</button>`:""}
    </div></div>`;
  }
  if(modal==="team"){
    const editing = !d.isNew;
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>${editing?"チームを編集":"新しいチームを作る"}</h2>
      <div class="m-label">チーム名</div>
      <input class="input" id="t-name" placeholder="例:やまだ家、○○センター、秋のイベント" value="${esc(d.name)}">
      <div class="lock-error" id="t-err"></div>
      <div class="btn-row">
        <button class="big-btn btn-secondary" data-act="close-modal">やめる</button>
        <button class="big-btn btn-primary" data-act="${editing?"save-team-edit":"create-team"}">${editing?"保存":"作る"}</button>
      </div>
      ${editing && teams.length>1?`<button class="danger-link" data-act="del-team">このチームを削除する</button>`:""}
    </div></div>`;
  }
  if(modal==="copyto"){
    const tm=getTeam();
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>他のチームへコピー</h2>
      <p class="m-p m-lead">コピー先を選んでください。コピー後は独立したカードになります。</p>
      ${teams.filter(t=>t.id!==tm.id && !isReceivedTeam(t)).map(t=>`
        <button class="team-card" data-act="copy-card" data-id="${esc(t.id)}">
          <span class="team-body"><span class="team-name">${esc(t.name)}</span></span><span class="chev" aria-hidden="true">›</span>
        </button>`).join("")}
      <div class="btn-row"><button class="big-btn btn-secondary" data-act="close-modal">やめる</button></div>
    </div></div>`;
  }
  if(modal==="topic"){
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>新しいトピック</h2>
      <div class="m-label">トピック名</div>
      <input class="input" id="m-topic-title" placeholder="例:睡眠、外出のとき" value="${esc(d.title)}">
      <div class="btn-row">
        <button class="big-btn btn-secondary" data-act="close-modal">やめる</button>
        <button class="big-btn btn-primary" data-act="save-topic">追加する</button>
      </div>
    </div></div>`;
  }
  if(modal==="settings"){
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>設定</h2>
      <div class="m-label">文字の大きさ</div>
      <div class="seg">
        <button class="seg-btn ${prefs.fs==="m"?"on":""}" data-act="set-fs" data-v="m">標準</button>
        <button class="seg-btn ${prefs.fs==="l"?"on":""}" data-act="set-fs" data-v="l">大きめ</button>
        <button class="seg-btn ${prefs.fs==="xl"?"on":""}" data-act="set-fs" data-v="xl">特大</button>
      </div>
      <div class="m-label">テーマカラー</div>
      <div class="theme-row">
        ${THEMES.map(th=>`<button class="theme-btn ${prefs.theme===th.id?"on":""}" data-act="set-theme" data-v="${th.id}"><span class="theme-dot" style="background:${th.color}"></span>${th.label}</button>`).join("")}
      </div>
      <div class="m-label">セキュリティ</div>
      <div class="m-stack">
        <button class="big-btn btn-secondary wide" data-act="open-passchange">パスコードを変更</button>
        <button class="big-btn btn-secondary wide" data-act="lock-manual">今すぐロックする</button>
      </div>
      <div class="m-label">旧ファイルの変換</div>
      <p class="m-p sm">以前の .scard ファイルは、暗号化データをそのまま保ち、共有用の .md ファイルに変換できます。</p>
      <div class="m-stack">
        <button class="big-btn btn-secondary wide" data-act="legacy-scard">旧 .scard ファイルを .md に変換</button>
      </div>
      ${hasLegacyData()?`
      <p class="m-p m-danger">以前の版（暗号化なし）のデータがこの端末に残っています。</p>
      <div class="m-stack">
        <button class="big-btn btn-danger wide" data-act="purge-legacy">古いデータを削除する</button>
      </div>`:""}
      <div class="m-label">保存データ</div>
      <p class="m-p">最後に保存: ${esc(lastSavedLabel())}<br>保存データの保持: ${storagePersisted===true?"保持を許可済み":"ブラウザーが自動で消す場合があります"}</p>
      <p class="m-p sm m-note">iPhoneのSafariでは、しばらく（目安7日以上）このアプリを開かないと、保存データが消えることがあります。大切な内容は、共有ファイルで控えを残してください。</p>
      <p class="m-p sm m-note">読み上げは各トピックの画面から。${AUTO_LOCK_MIN}分操作がないと自動ロックします。</p>
      <div class="btn-row"><button class="big-btn btn-primary" data-act="close-modal">とじる</button></div>
      <button class="text-link wide" data-act="open-about">利用上の注意・プライバシー</button>
    </div></div>`;
  }
  if(modal==="passchange"){
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>パスコードの変更</h2>
      <p class="m-p m-lead"><b class="m-danger-text">忘れるとデータを復元できません。</b></p>
      <div class="m-label">新しいパスコード(4文字以上)</div>
      <input class="input" id="m-pass1" type="password" autocomplete="new-password">
      <div class="m-label">もう一度入力</div>
      <input class="input" id="m-pass2" type="password" autocomplete="new-password">
      <div class="lock-error" id="m-pass-err"></div>
      <div class="btn-row">
        <button class="big-btn btn-secondary" data-act="close-modal">やめる</button>
        <button class="big-btn btn-primary" data-act="passchange-save">変更する</button>
      </div>
    </div></div>`;
  }
  if(modal==="about"){
    return `
    <div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>このアプリについて</h2>
      <div class="m-about">
        <p class="m-about-lead"><b>サポートカード</b> v${APP_VERSION}<br>本人に関する情報を、必要な人へ伝えるアプリです。</p>
        <h3>プライバシー</h3>
        <p>データはこの端末のブラウザ内だけに暗号化して保存され、自動でアップロードされません。共有や印刷をすると、選んだファイルや印刷物はアプリの外へ出ます。</p>
        <h3>大切な注意</h3>
        <p>共有ファイルには、選んだ相手に見せるトピックが入ります(「すべて」を選ぶと、チームの全データが入ります)。受け取った人のコピーは独立しており、この端末での変更や削除は反映されません。パスコードを忘れるとデータは復元できません。また、データは端末ごとに保存されるため、機種変更やブラウザのデータ消去で失われます。本アプリは医療判断の代わりにはなりません。緊急時は119へ。</p>
        <p>プライバシーとデータの扱いは<a href="https://github.com/ayuta36/support-cards-trial#6-利用上の注意" target="_blank" rel="noopener noreferrer">利用上の注意</a>をご覧ください。</p>
        <h3>ライセンス</h3>
        <p>MIT License。<a href="https://github.com/ayuta36/support-cards-trial/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">ライセンス全文</a>をご覧ください。</p>
      </div>
      <div class="btn-row"><button class="big-btn btn-primary" data-act="close-modal">とじる</button></div>
    </div></div>`;
  }
  if(modal==="share-preflight"){
    const tm = getTeam();
    if(!tm) return "";
    const allowed = allowedShareAudiences(tm);   // 受け取ったチームは、受け取った範囲より広い相手を選べない
    const chosen = allowed.includes(shareAudience) ? shareAudience : allowed[0];
    const shared = filterTeamForAudience(tm, chosen);   // 選んだ相手に渡る内容。書き出しも同じ関数で絞るので、ここに出る内容だけが入る
    const people = (shared.people||[]).map(person=>{
      const defs = person.topicDefs||[];
      const topics = person.topics||{};
      const listedIds = new Set(defs.map(topic=>topic.id));
      const orphanIds = Object.keys(topics).filter(id=>!listedIds.has(id));
      const orphanCount = orphanIds.reduce((sum,id)=>sum+(Array.isArray(topics[id])?topics[id].length:0),0);
      const filled = defs.filter(topic=>Array.isArray(topics[topic.id])&&topics[topic.id].length);
      const empty = defs.filter(topic=>!Array.isArray(topics[topic.id])||!topics[topic.id].length);
      const topicPreview = (topicId, entries) => `<ul class="share-topic-entries">${(Array.isArray(entries)?entries:[]).map(entry=>{
        const label=entry&&typeof entry==="object"?String(entry.label??""):"";
        const value=entry&&typeof entry==="object"?String(entry.value??""):"";
        return `<li>${label?`<b>${esc(label)}</b>`:""}${label&&value?`<br>`:""}${value?esc(value):(!label?`<span class="share-empty-entry">内容なし</span>`:"")}</li>`;
      }).join("")}</ul>`;
      return `<section class="share-person">
        <div class="share-person-head">${avatarHtml({name:person.name,photo:pickPhoto(person.photo)},52)}<div class="share-person-ident"><h3>${esc(person.name||"(名前なし)")}</h3>
        <p class="share-profile">紹介文: ${person.note?`「${esc(String(person.note))}」`:"なし"} ・ 写真: ${pickPhoto(person.photo)?"含まれます":"なし"}</p></div></div>
        ${filled.length?`<ul class="share-topic-list">${filled.map(topic=>`<li><details class="share-topic-preview"><summary>${esc(topic.title||"(名前なし)")} — ${topics[topic.id].length}件</summary>${topicPreview(topic.id,topics[topic.id])}</details></li>`).join("")}</ul>`:""}
        ${empty.length?`<p>内容が空のトピックも含まれます: ${empty.map(topic=>esc(topic.title||"(名前なし)")).join("、")}</p>`:""}
        ${orphanIds.length?`<details class="share-topic-preview share-orphan"><summary>一覧にない保存済みトピック ${orphanIds.length}件 / 内容 ${orphanCount}件も含まれます</summary>${orphanIds.map(id=>`<div><b>${esc(id)}</b>${topicPreview(id,topics[id])}</div>`).join("")}</details>`:""}
        ${chosen!=="all" && !defs.length?`<p>この相手に渡すトピックはありません。</p>`:""}
      </section>`;
    }).join("");
    return `<div class="overlay" data-act="close-modal"><div class="modal" id="share-preflight-dialog" data-stop role="dialog" aria-modal="true" aria-labelledby="share-preflight-title">
      <h2 id="share-preflight-title" tabindex="-1">共有する内容を確認</h2>
      <div class="share-aud" role="radiogroup" aria-labelledby="share-aud-title">
        <div class="aud-title" id="share-aud-title">書き出す相手</div>
        ${SHARE_AUDIENCES.map(a=>{ const ok = allowed.includes(a.id);
          return `<label class="aud-check${ok?"":" off"}"><input type="radio" name="share-aud" data-act="share-audience" data-v="${esc(a.id)}"${chosen===a.id?" checked":""}${ok?"":" disabled"}><span>${esc(a.label)}</span></label>`; }).join("")}
        <p class="aud-note">選んだ相手に見せるトピックだけが入ります。</p>
        ${allowed.length<SHARE_AUDIENCES.length?`<p class="aud-note">この情報は「${esc(AUDIENCE_NAMES[initialAudience(tm)])}」として受け取ったため、それより広い相手には書き出せません。</p>`:""}
      </div>
      ${chosen==="all"
        ? `<p class="share-warning"><b>「${esc(tm.name)}」チームの全データを暗号化ファイルに書き出します。</b><br>ここに表示される内容のほか、カスタム項目や一覧にない保存データを含むチーム内の全情報が対象です。</p>`
        : `<p class="share-warning"><b>「${esc(tm.name)}」チームのうち、${esc(AUDIENCES.find(a=>a.id===chosen).label)}に見せるトピックだけを暗号化ファイルに書き出します。</b><br>ここに表示される内容だけが入ります。それ以外のトピックと、一覧にない保存データは入りません。</p>`}
      <p class="aud-note">名前・ひとこと・写真・最終更新日は、どの相手にも含まれます。ひとことに医療情報などを書くと、そのまま共有されます。</p>
      <div class="share-people">${people||`<p>カードはありません。チーム情報を含むファイルを作成します。</p>`}</div>
      <p class="share-warning">受け取った人には独立したコピーが追加されます。この端末で後から編集・削除しても、相手のコピーには反映されず、相手側のコピーも消えません。ファイルとパスコードは別の方法で相手に渡してください。</p>
      <div class="btn-row">
        <button class="big-btn btn-secondary" data-act="close-modal">やめる</button>
        <button class="big-btn btn-primary" data-act="share-proceed">確認して書き出す</button>
      </div>
    </div></div>`;
  }
  if(modal==="share-ready"){
    const ready=preparedShare;
    if(!ready || ready.epoch!==sessionEpoch || ready.key!==cryptoKey || !(stage==="home"||stage==="ready")){ clearPreparedShare(); return ""; }
    const native=canSharePreparedFile(ready.file);
    return `<div class="overlay" data-act="close-share-ready"><div class="modal share-ready" data-stop role="dialog" aria-modal="true" aria-labelledby="share-ready-title">
      <h2 id="share-ready-title" tabindex="-1">共有ファイルを用意しました</h2>
      <p class="share-file-info">${esc(ready.fileName)}<br>カードの内容は暗号化されています。パスコードは別の方法で相手に伝えてください。</p>
      ${native?`<button class="big-btn btn-primary wide" data-act="share-native">端末の共有メニューを開く</button><p class="m-p sm">共有メニューからLINEなどの対応アプリを選べます。</p>`:""}
      <div class="share-ready-actions"><button class="big-btn btn-secondary wide" data-act="share-download">.md ファイルを保存</button>
      <button class="text-link wide" data-act="close-share-ready">やめる</button></div>
      <p class="m-p sm">共有画面での選択やダウンロードを、このアプリは送信完了として確認できません。</p>
    </div></div>`;
  }
  if(modal==="share-pass-create"){
    return `<div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>共有パスコードを設定</h2>
      <p class="m-p m-lead">4文字以上で設定します。ファイルと別の方法で相手に伝えてください。</p>
      <label class="m-label" for="share-pass1">共有パスコード</label>
      <div class="share-pass-row"><input class="input" id="share-pass1" type="password" autocomplete="new-password" data-autofocus aria-describedby="share-pass-error"><button class="share-pass-toggle" type="button" data-act="toggle-share-pass" data-for="share-pass1" aria-controls="share-pass1" aria-label="共有パスコードを表示" aria-pressed="false">表示</button></div>
      <label class="m-label" for="share-pass2">もう一度入力</label>
      <div class="share-pass-row"><input class="input" id="share-pass2" type="password" autocomplete="new-password" aria-describedby="share-pass-error"><button class="share-pass-toggle" type="button" data-act="toggle-share-pass" data-for="share-pass2" aria-controls="share-pass2" aria-label="確認用パスコードを表示" aria-pressed="false">表示</button></div>
      <div class="lock-error" id="share-pass-error" role="alert" aria-live="assertive"></div>
      <div class="btn-row"><button class="big-btn btn-secondary" data-act="close-modal">戻る</button><button class="big-btn btn-primary" data-act="share-pass-submit">ファイルを作る</button></div>
    </div></div>`;
  }
  if(modal==="share-pass-import"){
    return `<div class="overlay" data-act="close-modal"><div class="modal" data-stop>
      <h2>共有パスコードを入力</h2>
      <p class="m-p m-lead">ファイルを受け取ったときに案内されたパスコードを入力してください。</p>
      <label class="m-label" for="share-import-pass">共有パスコード</label>
      <div class="share-pass-row"><input class="input" id="share-import-pass" type="password" autocomplete="off" data-autofocus aria-describedby="share-import-pass-error"><button class="share-pass-toggle" type="button" data-act="toggle-share-pass" data-for="share-import-pass" aria-controls="share-import-pass" aria-label="共有パスコードを表示" aria-pressed="false">表示</button></div>
      <div class="lock-error" id="share-import-pass-error" role="alert" aria-live="assertive"></div>
      <div class="btn-row"><button class="big-btn btn-secondary" data-act="close-modal">やめる</button><button class="big-btn btn-primary" data-act="import-pass-submit">読み込む</button></div>
    </div></div>`;
  }
  if(modal==="resume-picker"){
    const isPhoto=pendingPicker?.type==="photo";
    return `<div class="overlay" data-act="close-modal"><div class="modal" id="resume-picker-dialog" data-stop role="dialog" aria-modal="true" aria-labelledby="resume-picker-title">
      <h2 id="resume-picker-title" tabindex="-1">選んだファイルをどうしますか?</h2>
      <p class="m-p md">${isPhoto?"選んだ写真をカードに追加できます。ロック時に未保存の名前や紹介文は消去されています。":"共有ファイルを読み込みます。内容を確認してから端末に追加します。"}</p>
      <p class="m-p sm">この選択は一時的に保留されています。再開すると、${isPhoto?"写真を選んだカード":"選んだ共有ファイル"}を現在の解錠セッションで処理します。</p>
      <div class="btn-row"><button class="big-btn btn-secondary" data-act="discard-picker">破棄する</button><button class="big-btn btn-primary" data-act="resume-picker">再開する</button></div>
    </div></div>`;
  }
  return "";
}

// 今の表示の相手(audience)に見える内容だけを印刷する。見出しに相手の呼び名、注記に印刷日と最終更新日を入れる。
// 学生向けは、はじめましてページと同じ並び順(studentPageTopics)にして、最後に固定の案内を入れる
function buildPrint(p, audience=viewAudience()){
  const el=document.getElementById("print");
  const q=filterPersonForAudience(p, audience);
  const updated=fmtDay(q.updatedAt);
  const student=audience==="student";
  const blocks=(student ? studentPageTopics(q) : q.topicDefs.map(def=>({ def, entries:q.topics[def.id]||[] })))
    .filter(({entries})=>entries.length)
    .map(({def:t, entries})=>`<div class="pr-topic"><h2>${esc(t.title)}</h2>
        ${entries.map(e=>`<div class="pr-entry">${e.label?`<b>${esc(e.label)}</b>`:""}<div>${esc(e.value)}</div></div>`).join("")}</div>`);
  el.innerHTML=`
    <h1>${esc(q.name)} のサポートカード（${esc(AUDIENCE_NAMES[audience]||AUDIENCE_NAMES.all)}）</h1>
    <div class="pr-note">${esc(q.note||"")}(印刷日:${new Date().toLocaleDateString("ja-JP")}${updated?`・最終更新:${esc(updated)}`:""})</div>
    ${blocks.join("")}
    ${student && !blocks.length?`<p class="pr-empty">まだ学生（一緒に参加する人）向けに公開された情報はありません</p>`:""}
    ${student?`<div class="pr-care">${esc(STUDENT_NOTICE)}</div>`:""}`;
}
window.addEventListener("afterprint", ()=>{
  const printArea=document.getElementById("print");
  if(printArea) printArea.innerHTML="";
});
