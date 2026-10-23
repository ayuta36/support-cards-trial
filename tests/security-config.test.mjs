/* ============================================================
   tests/security-config.test.mjs ― セキュリティ設定と保存形式の維持(静的な検査)
   ------------------------------------------------------------
   対象:index.html(CSP・noindex・ファイル選択の accept 属性)と、js/*.js 全体(旧保存形式・総当たり待機・自動ロック)。
   ※アプリを動かさず、ソースの文字列だけを調べる。
   ============================================================ */
import assert from "node:assert/strict";
import { test, section, readIndexHtml, readAppSource } from "./harness.mjs";

const src = readAppSource();   // js/*.js 全体

const html=readIndexHtml();

section("セキュリティ設定と保存形式の維持");

test("接続禁止CSPとnoindexを維持", async () => {
  assert.ok(html.includes("connect-src 'none'")&&html.includes('name="robots" content="noindex'));
});

test("通常読み込み(.md)と旧.scardの移行は別の入力に分け、どちらにもacceptを付けない(iPhoneで指定外の種類が灰色になり選べなくなるS7の再発防止)。写真用のacceptは維持", async () => {
  const importTag=html.match(/<input[^>]*id="importInput"[^>]*>/)?.[0]||"", legacyTag=html.match(/<input[^>]*id="legacyScardInput"[^>]*>/)?.[0]||"", photoTag=html.match(/<input[^>]*id="photoInput"[^>]*>/)?.[0]||"";
  assert.ok(importTag&&legacyTag&&importTag!==legacyTag);   // 2つの入力が別々にある
  assert.ok(!/\baccept\s*=/i.test(importTag)&&!/\baccept\s*=/i.test(legacyTag));   // 中身はアプリ側で検証するので、種類は絞らない
  assert.ok(photoTag.includes('accept="image/*"'));
});

test("旧保存形式・総当たり待機・自動ロック実装を維持", async () => {
  assert.ok(src.includes("support-card-data-v2")&&src.includes("LOCKOUTS")&&src.includes("AUTO_LOCK_MIN"));
});
