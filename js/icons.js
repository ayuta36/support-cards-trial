/* ============================================================
   js/icons.js ― 線のアイコン
   ------------------------------------------------------------
   役割:画面に出す線のアイコン(単色の SVG)を、名前から作る。DOM には触れない。
   主な定数・関数:
     ICON_PATHS(アイコンごとの SVG の中身。24×24 の線画。円・線・角の丸い四角を組み合わせた自作の図形で、既存のアイコン集のパスは使わない)/
     icon(name, size)(名前からアイコンの <svg> を返す。色は currentColor、装飾なので aria-hidden。未知の名前は "" を返す)/
     topicIcon(def, size)(トピックのアイコン。既定のトピックは def.id で決め、利用者が作ったトピックは共通の note。
                          保存データの def.icon(絵文字)は表示に使わない)
   方針:画面のアイコンは、必ず icon()・topicIcon() を通して出す。views.js などに SVG を直接書かない。
        将来、img/ フォルダの画像ファイルに差し替えるときは、このファイルの icon() だけを変えれば済む(今は img/ も画像ファイルもない)。
        アイコンの大きさと色は、CSS の .icon と親の color で決まる。SVG には、利用者の入力を入れない(固定の文字列だけ)。
   依存:ほかのアプリのファイルには依存しない(util.js のあとに読み込む)。
   使われる側:views.js
   ============================================================ */
"use strict";

const ICON_PATHS = {
  // 緊急:三角に「!」
  alert:    '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.2M12 17.1h.01"/>',
  // トピック(既定のトピックごと)
  person:   '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
  chat:     '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8 10h8M8 13h5"/>',
  activity: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  meal:     '<path d="M4 11.5h16a8 8 0 0 1-16 0z"/><path d="M9 4.5v3M15 4.5v3"/>',
  care:     '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
  move:     '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  like:     '<path d="M12 20.5C6 16.3 3.5 13 3.5 9.5A4.5 4.5 0 0 1 12 7.6 4.5 4.5 0 0 1 20.5 9.5c0 3.5-2.5 6.8-8.5 11z"/>',
  dislike:  '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  note:     '<path d="M6 3.5h8.5L19 8v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14.5 3.5V8H19M8.5 12.5h7M8.5 16h7"/>',
  // 操作
  plus:     '<path d="M12 5v14M5 12h14"/>',
  up:       '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down:     '<path d="M12 5v14M6 13l6 6 6-6"/>',
  grip:     '<path stroke-width="3.2" d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  trash:    '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10 11v6M14 11v6"/>',
  speak:    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  stop:     '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  lock:     '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
};

// 既定のトピックの id ごとのアイコン。ここにない id(利用者が作ったトピックなど)は note
const TOPIC_ICON_NAMES = { emergency:"alert", basic:"person", communication:"chat", activity:"activity", meal:"meal", care:"care", posture:"move", likes:"like", dislikes:"dislike" };

function icon(name, size = 20){
  if(typeof name!=="string" || !Object.prototype.hasOwnProperty.call(ICON_PATHS, name)) return "";
  const px = Number(size) > 0 ? Number(size) : 20;   // 大きさは数値だけ(コードの中の固定の値。利用者の入力は渡さない)
  return `<svg class="icon" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

function topicIcon(def, size = 24){
  const id = def && typeof def.id==="string" ? def.id : "";
  return icon(Object.prototype.hasOwnProperty.call(TOPIC_ICON_NAMES, id) ? TOPIC_ICON_NAMES[id] : "note", size);
}
