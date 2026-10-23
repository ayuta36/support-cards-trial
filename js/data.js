/* ============================================================
   js/data.js ― データの整形と検証
   ------------------------------------------------------------
   役割:チームやカードのデータを整える・検証する。DOMにも状態にも触れない純粋な処理だけ。
   主な関数:
     normalizeTeam(古い形のチームに、色・マーク・既定のトピックなどを補う)
     sanitizeImportedTeam(取り込む共有ファイルの中身を、決めた項目だけの新しいオブジェクトにする。
                          ID・色・写真は形式を確かめ、件数と長さに上限を設ける。
                          トピックの audience と人物の updatedAt は形式を確かめて残す。team.source は捨てる)
     sanitizeShareMeta(共有ファイルの暗号化された中身にある meta を、audience と createdAt だけにする)
     相手別の公開設定:topicAudience(トピックを見せる相手)/ isTopicVisible(その相手に見えるか)/
                      filterPersonForAudience・filterTeamForAudience(相手に渡す内容だけの新しいデータ)
     受け取ったチーム:isReceivedTeam(source があるか)/ canRestoreOwnBackup(「すべて」で受け取ったチームをこの端末で編集可能にできるか。送信者や控えかは確認しない)/
                      initialAudience(表示の初期値)/ allowedShareAudiences・defaultShareAudience(書き出せる相手)
     画面に出す内容の取り出し:hasText(中身のある項目か)/ studentPageTopics(学生向け「はじめましてページ」に並べるトピック)/
                      emergencyInfo(緊急情報の一覧に出す項目。トピックはあるが相手に見せない設定のときは hidden)/
                      emergencyAudience(ホームの「すべてのチーム」の一覧で、チームに使う相手。出さないチームは null)/ topicHint(トピックの記入例)
     補助:isPlainObject / isSafeId / clip / pickColor / pickPhoto / pickDate / pickAudienceIds と、HEX_COLOR などの検査用の値
   依存:constants.js の DEFAULT_TOPICS・AUDIENCES・DEFAULT_AUDIENCE・STUDENT_PAGE_ORDER・TOPIC_HINTS など、util.js の uid(どちらもこれより前に読み込む)
   使われる側:state.js(unlock・setupNew)、views.js(画面)、actions.js(チームの作成と取り込み)
   ============================================================ */
"use strict";

function normalizeTeam(t){
  return { ...t, color:t.color||"#3D7399", emoji:t.emoji||"🏠",
    people:(t.people||[]).map(p=>({...p, topicDefs:p.topicDefs||structuredClone(DEFAULT_TOPICS), topics:p.topics||{}})) };
}

// ---- 相手別の公開設定 ----
// 相手のIDの配列から、知っているIDだけを(重複なしで、並びはそのまま)残す
const pickAudienceIds = (arr) => [...new Set(arr)].filter(id => AUDIENCES.some(a => a.id===id));
// トピックを見せる相手。def.audience が配列ならその中の知っているIDだけ。なければ初期値(DEFAULT_AUDIENCE)、それもなければ [](家族のみ)。
// 補った値は保存データには書き戻さない(表示のときに計算する)。prototype のキー(constructor など)は拾わない
function topicAudience(def){
  if(def && Array.isArray(def.audience)) return pickAudienceIds(def.audience);
  return def && Object.prototype.hasOwnProperty.call(DEFAULT_AUDIENCE, def.id) ? [...DEFAULT_AUDIENCE[def.id]] : [];
}
// その相手に見せるトピックか。"all"(家族の「すべて」の表示)は、すべて見える
const isTopicVisible = (def, audience) => audience==="all" || topicAudience(def).includes(audience);
// 相手に渡す内容だけの、新しい人物データ。"all" は従来どおり全部を含めた複製。
// それ以外は、見えない定義と、その中身(topics)、一覧にないトピックを除く
function filterPersonForAudience(person, audience){
  const copy = structuredClone(person);
  if(audience==="all") return copy;
  const topicDefs = (Array.isArray(copy.topicDefs) ? copy.topicDefs : []).filter(d => isTopicVisible(d, audience));
  const shown = new Set(topicDefs.map(d => d.id));
  const all = isPlainObject(copy.topics) ? copy.topics : {};
  const topics = Object.fromEntries(Object.keys(all).filter(id => shown.has(id)).map(id => [id, all[id]]));
  return { ...copy, topicDefs, topics };
}
// 人物すべてに filterPersonForAudience をかけた、新しいチームデータ(チームの名前などはそのまま複製する)
function filterTeamForAudience(team, audience){
  return Object.fromEntries(Object.entries(team).map(([k, v]) =>
    [k, k==="people" ? (Array.isArray(v) ? v : []).map(p => filterPersonForAudience(p, audience)) : structuredClone(v)]));
}

// ---- 受け取ったチーム ----
// 取り込んだチームには、取り込み処理が source:{importedAt, createdAt, audience} を付ける。source があるチームは読み取り専用
const isReceivedTeam = (team) => !!(team && team.source);
// 「すべて」で受け取ったチームか。これだけは、この端末で編集できるようにできる。送信者や「自分の控え」かは確認できない。
// 学生向け・運営向けで受け取ったチームは一部だけのデータなので、編集できるようにはしない
const canRestoreOwnBackup = (team) => isReceivedTeam(team) && team.source.audience==="all";
// 表示する相手の初期値。受け取ったチームは、受け取った相手の表示に固定する。自分のチームは "all"
const initialAudience = (team) => isReceivedTeam(team) && VIEW_AUDIENCES.some(v => v.id===team.source.audience) ? team.source.audience : "all";
// 書き出せる相手(範囲の狭い順)。受け取ったチームは、受け取った範囲より広い相手を選べない
function allowedShareAudiences(team){
  const ids = SHARE_AUDIENCES.map(a => a.id);
  return ids.slice(0, ids.indexOf(initialAudience(team)) + 1);
}
const defaultShareAudience = (team) => allowedShareAudiences(team)[0];

// ---- 画面に出す内容の取り出し ----
// 見出しか内容のどちらかに文字がある項目か(空の項目は、画面にも印刷にも出さない)
const hasText = (e) => isPlainObject(e) && (String(e.label ?? "").trim()!=="" || String(e.value ?? "").trim()!=="");
// 学生向け「はじめましてページ」(と、その印刷)に並べるトピック。[{def, entries}]。
// 学生に見えるトピックのうち、中身のあるものだけを、STUDENT_PAGE_ORDER の順に、そのあとに残りを topicDefs の順に並べる
function studentPageTopics(person){
  const defs = (Array.isArray(person?.topicDefs) ? person.topicDefs : []).filter(d => isPlainObject(d) && isTopicVisible(d, "student"));
  const topics = isPlainObject(person?.topics) ? person.topics : {};
  const rank = (d) => { const i = STUDENT_PAGE_ORDER.indexOf(d.id); return i<0 ? STUDENT_PAGE_ORDER.length : i; };
  return defs.map((def, i) => ({ def, i }))
    .sort((a, b) => rank(a.def) - rank(b.def) || a.i - b.i)
    .map(({ def }) => ({ def, entries: (Array.isArray(topics[def.id]) ? topics[def.id] : []).filter(hasText) }))
    .filter(x => x.entries.length);
}
// 緊急情報の一覧に出す項目。「発作・緊急時」(emergency)の全項目と、「基本情報」(basic)のうち見出しに「連絡」を含む項目。
// その相手に見えるトピックだけを対象にする(どちらも { def, entries }。トピックがない・見えないときは def が null で entries が空)。
// 「記入なし」と「公開されていない」を見分けるため、トピックはあるが、その相手に見せない設定のときだけ、さらに hidden:true を付ける
// (トピックがない・中身が空のときは hidden を付けない)。相手が "all" のときは、いつも見えるので hidden にならない
function emergencyInfo(person, audience){
  const defs = Array.isArray(person?.topicDefs) ? person.topicDefs : [];
  const topics = isPlainObject(person?.topics) ? person.topics : {};
  const pick = (id, keep) => {
    const def = defs.find(d => isPlainObject(d) && d.id===id);
    if(!def) return { def:null, entries:[] };
    if(!isTopicVisible(def, audience)) return { def:null, entries:[], hidden:true };
    return { def, entries:(Array.isArray(topics[id]) ? topics[id] : []).filter(e => hasText(e) && keep(e)) };
  };
  return { emergency:pick("emergency", () => true), contact:pick("basic", (e) => String(e.label ?? "").includes("連絡")) };
}
// ホームの「緊急時の情報（すべてのチーム）」で、そのチームに使う相手。自分のチームは "all"、受け取ったチームは受け取った相手(source.audience)。
// 学生向けで受け取ったチームは、運営に見せてよい内容を含まないので null(一覧に含めない)。チームごとの一覧を出せる条件(state.js の canSeeEmergency)と同じ考え方
function emergencyAudience(team){
  if(!team) return null;
  const audience = initialAudience(team);
  return audience==="all" || audience==="staff" ? audience : null;
}
// トピックの記入例(TOPIC_HINTS)。自作のトピックなど、ないときは ""。prototype のキー(constructor など)は拾わない
const topicHint = (def) => def && Object.prototype.hasOwnProperty.call(TOPIC_HINTS, def.id) ? TOPIC_HINTS[def.id] : "";

// ---- 取り込む共有ファイルの中身の無害化 ----
// 決めた項目だけを取り出して新しいオブジェクトにする。ID・色・写真は形式を確かめ、件数と長さに上限を設ける。
// 端末に保存済みのデータの解錠(unlock)には使わない(利用者の既存データを消さないため)。
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const PHOTO_HEADS = ["data:image/jpeg;base64,","data:image/png;base64,","data:image/webp;base64,"];
const PHOTO_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const RESERVED_KEYS = ["__proto__","constructor","prototype"];
const isPlainObject = (x) => Object.prototype.toString.call(x)==="[object Object]";
const isSafeId = (s) => typeof s==="string" && /^[A-Za-z0-9_-]{1,64}$/.test(s) && !RESERVED_KEYS.includes(s) && !(s in Object.prototype);
const clip = (v, n) => { if(typeof v!=="string" && typeof v!=="number") return ""; const s = String(v); return s.length<=n ? s : [...s.slice(0, n*2)].slice(0, n).join(""); };
const pickColor = (c, fallback) => typeof c==="string" && HEX_COLOR.test(c) ? c : fallback;
const pickPhoto = (v) => { const head = typeof v==="string" && v.length<=3000000 && PHOTO_HEADS.find(h=>v.startsWith(h)); return head && PHOTO_BODY.test(v.slice(head.length)) ? v : null; };
// 日時の文字列(updatedAt・createdAt):文字列で40文字以内、かつ Date.parse が数値になるものだけ残す。それ以外は null
const pickDate = (v) => typeof v==="string" && v.length<=40 && Number.isFinite(Date.parse(v)) ? v : null;
// 共有ファイルの暗号化された中身の meta から、audience("all"|"student"|"staff"。それ以外は "all")と createdAt(正しい日時か null)だけを取り出す。
// meta のない古いファイルは { audience:"all", createdAt:null } になる
function sanitizeShareMeta(meta){
  const m = isPlainObject(meta) ? meta : {};
  return { audience: SHARE_AUDIENCES.some(a => a.id===m.audience) ? m.audience : "all", createdAt: pickDate(m.createdAt) };
}
function sanitizeImportedTeam(raw){
  if(!isPlainObject(raw) || !Array.isArray(raw.people)) throw new Error("invalid team");
  const take = (arr, max, make) => { const out = []; for(const x of arr){ if(out.length>=max) break; if(isPlainObject(x)) out.push(make(x)); } return out; };
  const freshId = (seen, id) => { let v = id; while(!isSafeId(v) || seen.has(v)) v = uid(); seen.add(v); return v; };
  const seenPeople = new Set();
  const people = take(raw.people, 200, (p)=>{
    const seenDefs = new Set();
    const topicDefs = Array.isArray(p.topicDefs)
      ? take(p.topicDefs, 100, (d)=>{
          const def = { id:freshId(seenDefs, d.id), icon:clip(d.icon,8)||"📌", title:clip(d.title,100)||"(名前なし)", color:pickColor(d.color,"#5B8DB8"), desc:clip(d.desc,200) };
          if(d.urgent===true) def.urgent = true;
          if(Array.isArray(d.audience)) def.audience = pickAudienceIds(d.audience);   // 配列でなければ項目を付けない(初期値で補う)
          return def;
        })
      : structuredClone(DEFAULT_TOPICS);
    const topics = {};
    if(isPlainObject(p.topics)) for(const key of Object.keys(p.topics)){
      if(isSafeId(key) && Array.isArray(p.topics[key])) topics[key] = take(p.topics[key], 200, (e)=>({ label:clip(e.label,200), value:clip(e.value,5000) }));
    }
    const person = { id:freshId(seenPeople, p.id), name:clip(p.name,100)||"(名前なし)", emoji:clip(p.emoji,8)||"🌸", note:clip(p.note,500), photo:pickPhoto(p.photo), topicDefs, topics };
    const updatedAt = pickDate(p.updatedAt);
    if(updatedAt) person.updatedAt = updatedAt;
    return person;
  });
  // team.source はファイルにあっても捨てる(取り込み処理が付け直す)ので、ここでは返さない
  return { name:clip(raw.name,100)||"受け取ったチーム", emoji:clip(raw.emoji,8)||"🏠", color:pickColor(raw.color,"#2F8F83"), people };
}
