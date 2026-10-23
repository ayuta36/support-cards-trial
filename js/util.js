/* ============================================================
   js/util.js ― 小さな道具
   ------------------------------------------------------------
   役割:画面にも状態にも関係しない、小さな共通関数。DOMには触れない。
   主な関数:
     uid(ランダムなID)/ esc(HTMLのエスケープ)/ fmtDate(日時の表示)/ fmtDay(日付だけの表示。空や不正な値は "")
     shareFileName(共有ファイルの名前)/ b64・unb64(バイト列とBase64の相互変換)
   依存:ほかのアプリのファイルには依存しない(constants.js のあとに読み込む)。
   使われる側:crypto.js・data.js・state.js・views.js・actions.js
   ============================================================ */
"use strict";

// ================= 小さな道具 =================
const uid = () => Math.random().toString(36).slice(2,9);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = (iso)=>{ try{ return new Date(iso).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}); }catch(e){ return iso; } };
// 日付だけ(例: 10/19)。最終更新・作成・受け取りの表示に使う。値がない・読み取れないときは ""
const fmtDay = (iso)=>{ if(!iso) return ""; try{ const d=new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"}); }catch(e){ return ""; } };
// 共有ファイル名:端末のローカル時刻・ASCIIのみ(チーム名は暗号化された中身にだけ残す)
const shareFileName = (d=new Date())=>{ const z=(n)=>String(n).padStart(2,"0"); return `support-card-share-${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.md`; };

// 引数展開(...bytes)には個数の上限があり、写真が数枚あると RangeError になるため、32KBずつ文字列にしてから btoa する
const b64 = (buf) => { const u8 = new Uint8Array(buf); let s = ""; for(let i=0;i<u8.length;i+=0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i+0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
