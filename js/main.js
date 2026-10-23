/* ============================================================
   js/main.js ― 起動(最後に読み込む)
   ------------------------------------------------------------
   役割:表示設定を読み込んで反映し、読み上げ音声の一覧を準備して、最初の画面を出す。
   主な関数:
     loadPrefs(保存してある表示設定を読む)
     applyPrefs(表示設定を画面に反映して保存する。設定画面の操作からも呼ばれる)
     boot(保存データの有無で最初の画面を決め、履歴の位置を先頭にして(initHistory)、render する)
   依存:すべて(constants → util → crypto → data → state → views → actions のあとに読み込む)
   ============================================================ */
"use strict";

function loadPrefs(){ try{ const r = localStorage.getItem(PREFS_KEY); if(r) prefs = {...prefs, ...JSON.parse(r)}; }catch(e){} }
function applyPrefs(){
  document.body.dataset.fs = prefs.fs;
  document.body.dataset.theme = prefs.theme;
  try{ localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }catch(e){}
}

// ================= 起動 =================
loadPrefs(); applyPrefs();
if("speechSynthesis" in window){   // 読み上げ音声の一覧は起動直後は空のことがあるため、先に取得し、更新されたら取り直す
  loadVoices();
  if(speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", loadVoices);
  else speechSynthesis.onvoiceschanged = loadVoices;
}
(function boot(){
  const has = localStorage.getItem(STORE_KEY);
  stage = has ? "locked" : "setup-pass";
  initHistory();   // 戻る操作のため、いまの履歴の位置を先頭(深さ0)にする(history がない環境では何もしない)
  render();
})();
