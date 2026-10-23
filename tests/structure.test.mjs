/* ============================================================
   tests/structure.test.mjs ― ファイル構成(静的な検査)
   ------------------------------------------------------------
   対象:index.html の読み込み順と、js/・css/ のファイル。
        ・js/ の12ファイルを、決めた順(constants → util → icons → crypto → data → private-notes → reorder → share-format → state → views → actions → main)で読み込む。
          icons は、画面を作る views より前(util の直後)に読み込む。
          後のファイルのトップレベルの let / const を読み込み時に参照すると初期化前の参照になるため、順番が大切。
        ・js/ にあるファイルは、すべて index.html から読み込まれる。
        ・index.html が参照するスタイルシートと script が、すべて存在する。
        ・各 js ファイルは、先頭の説明コメントのあとに "use strict" を置く(分割前の app.js と同じ厳格モード)。
   ※アプリを動かさず、ファイルの並びと文字列だけを調べる。
   ============================================================ */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, section, ROOT, readIndexHtml, scriptPaths } from "./harness.mjs";

section("ファイル構成");

test("index.html は js/ の12ファイルを、決めた順で読み込む(icons は util の直後、views より前)", async () => {
  assert.deepStrictEqual(scriptPaths(), ["constants", "util", "icons", "crypto", "data", "private-notes", "reorder", "share-format", "state", "views", "actions", "main"].map((name) => `js/${name}.js`));
});

test("js/ にあるファイルは、すべて index.html から読み込まれる(読み込まれない js がない)", async () => {
  const onDisk = readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`).sort();
  assert.deepStrictEqual([...scriptPaths()].sort(), onDisk);
});

test("index.html が参照するスタイルシートと script が、すべて存在する", async () => {
  const links = [...readIndexHtml().matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0 && [...links, ...scriptPaths()].every((p) => existsSync(path.join(ROOT, p))));
});

test("各 js ファイルは、先頭の説明コメントのあとに \"use strict\" を置く(分割前の app.js と同じ厳格モード)", async () => {
  const lacking = scriptPaths().filter((p) => !/^(?:\s*\/\*[\s\S]*?\*\/)*\s*"use strict";/.test(readFileSync(path.join(ROOT, p), "utf8")));
  assert.deepStrictEqual(lacking, []);
});
