/* ============================================================
   tests/ui-actions.test.mjs ― 画面の操作(静的な検査)
   ------------------------------------------------------------
   対象:js/*.js 全体。画面に出すすべての data-act に、js/actions.js の handle() の case があること。
   ※アプリを動かさず、ソースの文字列だけを調べる。
   ============================================================ */
import assert from "node:assert/strict";
import { test, section, readAppSource } from "./harness.mjs";

const src = readAppSource();   // js/*.js 全体

section("起動・操作カバー範囲");

test("全UIアクションに処理がある", async () => {
  const uiActions=new Set([...src.matchAll(/data-act="([a-z-]+)"/g)].map(m=>m[1]));
  const handled=new Set([...src.matchAll(/case "([a-z-]+)":/g)].map(m=>m[1]));
  const unhandled=[...uiActions].filter(action=>!handled.has(action));
  assert.ok(unhandled.length===0);
});
