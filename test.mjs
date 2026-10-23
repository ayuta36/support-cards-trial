/* ============================================================
   test.mjs ― テストの入口
   ------------------------------------------------------------
   使い方:リポジトリ直下で  node test.mjs
   tests/*.test.mjs をファイル名順に読み込んで実行し、合計を「==== N件成功 / M件失敗 ====」の形で表示する。
   失敗が1件でもあれば終了コード1。
   テストを足すとき:tests/ に <テーマ>.test.mjs を置く(ここは書き換えない)。
   各テストファイルは、tests/harness.mjs の createApp() で自分用の新しいアプリ(js/ を読み込んだ環境)を作り、
   test(名前, 関数) で登録する。1ファイルだけなら  node tests/<ファイル名>  でも実行できる。
   ============================================================ */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runQueued } from "./tests/harness.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "tests");
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort();

let passed = 0, failed = 0;
if (!files.length) { failed++; console.log("  ❌ tests/*.test.mjs が見つかりません"); }
for (const f of files) {
  console.log(`\n▼ tests/${f}`);
  try { await import(pathToFileURL(path.join(dir, f)).href); }
  catch (err) { failed++; console.log(`  ❌ tests/${f} を読み込めませんでした`); console.log(err); }
  const r = await runQueued();       // 読み込みに失敗した場合も、それまでに登録されたテストを流しきる(次のファイルに残さない)
  passed += r.passed; failed += r.failed;
}
console.log(`\n==== ${passed}件成功 / ${failed}件失敗 ====\n`);
process.exitCode = failed ? 1 : 0;
