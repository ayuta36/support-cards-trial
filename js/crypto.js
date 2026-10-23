/* ============================================================
   js/crypto.js ― 暗号
   ------------------------------------------------------------
   役割:パスコードから鍵を作り、JSONを暗号化・復号する(AES-256-GCM、鍵はPBKDF2)。
        ブラウザの crypto.subtle だけを使い、DOMにも状態にも触れない。
   主な関数:
     deriveKey(パスコードと salt から鍵を作る)/ encryptJson / decryptJson
     decryptShared(共有ファイルの復号。まず入力どおりのパスコードで試し、
                   だめなら NFKC で全角・半角をそろえた値でもう一度試す)
     ※共有パスコードを決めるときの NFKC による統一は、actions.js の handle の share-proceed にある。
   依存:util.js の b64・unb64(util.js より後に読み込む)
   使われる側:state.js・actions.js
   ============================================================ */
"use strict";

// ================= 暗号化 =================
async function deriveKey(passcode, salt){
  const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name:"PBKDF2", salt, iterations:310000, hash:"SHA-256" },
    mat, { name:"AES-GCM", length:256 }, false, ["encrypt","decrypt"]);
}
async function encryptJson(obj, key){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv:b64(iv), data:b64(ct) };
}
async function decryptJson(payload, key){
  const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv:unb64(payload.iv)}, key, unb64(payload.data));
  return JSON.parse(new TextDecoder().decode(pt));
}

// 共有ファイルを復号する。まず入力どおりのパスコードで試し(旧版で作られたファイル用)、
// だめで、かつNFKCで全角・半角などを統一した値が違うときだけ、統一した値でもう一度試す
async function decryptShared(data,pass){
  const open=async (pw)=>decryptJson(data, await deriveKey(pw, unb64(data.salt)));
  try{ return await open(pass); }
  catch(err){ const unified=pass.normalize("NFKC"); if(unified===pass) throw err; return open(unified); }
}
