/* ============================================================
   tests/share-format.test.mjs ― 暗号化Markdownの共有ファイルの形式
   ------------------------------------------------------------
   対象:js/share-format.js(encodeShareMarkdown・parseShareMarkdown・convertLegacyScardToMarkdown・isShareFileTooLarge)、
        js/actions.js の processImportFile・processLegacyScardFile(読み込む前の大きさの確認と、読み込みの流れ)、
        index.html の2つのファイル入力(importInput・legacyScardInput)に accept がないこと(S7)。
   読み取りは、先頭の BOM・CRLF・行末の空白・空行の増減・```JSON・説明文の違いがあっても読める。
   ただし、見出し・コードブロック・封筒の形・大きさ(20MB)を満たさないものはこれまでどおり断り、
   パスコードでの復号と中身の検証(sanitizeImportedTeam)も変わらない。
   旧 .scard(封筒の JSON そのもの)は、通常の読み込みでは開かない。共有ファイルは .md 形式で保管・受け渡しする。
   パスコードは聞かず、設定の「旧 .scard ファイルを .md に変換」の手順を案内して断る。変換した .md は、元の共有パスコードで読み込める。
   ※取り込みの流れのテストは、アプリの状態を順に使う。テストは登録した順に実行される。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, makeFullTeam, readIndexHtml, readAppSource } from "./harness.mjs";

const env = createApp();
const { get, run, app, handlers, importInput, readers, alerts, prompts, confirms } = env;
const envelope = { app:"support-card", type:"team-share", v:1, salt:"salt", iv:"iv", data:"ciphertext" };

section("Encrypted Markdown share format");
test("round-trips only the encrypted envelope and keeps ciphertext unchanged", () => {
  const markdown = get("encodeShareMarkdown")(envelope);
  const parsed = get("parseShareMarkdown")(markdown);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), envelope);
  assert.match(markdown, /^# サポートカードの共有ファイル/);
  assert.ok(!markdown.includes("patient"));
});
test("normal Markdown reader rejects raw JSON and unrelated Markdown", () => {
  assert.throws(() => get("parseShareMarkdown")(JSON.stringify(envelope)));
  assert.throws(() => get("parseShareMarkdown")("# notes\n\nprivate"));
});
test("legacy conversion preserves a v1 envelope without decrypting it", () => {
  const converted = get("convertLegacyScardToMarkdown")(JSON.stringify(envelope));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(get("parseShareMarkdown")(converted))), envelope);
});
test("legacy conversion refuses invalid and non-v1 envelopes", () => {
  assert.throws(() => get("convertLegacyScardToMarkdown")("{}"));
  assert.throws(() => get("convertLegacyScardToMarkdown")(JSON.stringify({ ...envelope, v:2 })));
});

test("encoder and legacy conversion enforce the actual 20 MiB final Markdown boundary", () => {
  const bytes = (s) => new TextEncoder().encode(s).byteLength;
  assert.strictEqual(get("SHARE_FILE_MAX_SIZE"), LIMIT);
  const emptyDataEnvelope = { ...envelope, data:"" };
  const markdownOverhead = bytes(get("encodeShareMarkdown")(emptyDataEnvelope));
  for (const target of [LIMIT - 1, LIMIT]) {
    const value = { ...emptyDataEnvelope, data:"a".repeat(target - markdownOverhead) };
    const markdown = get("encodeShareMarkdown")(value);
    assert.strictEqual(bytes(markdown), target);
    const oldScard = JSON.stringify(value);   // compact legacy JSON is smaller than the wrapped Markdown
    assert.ok(bytes(oldScard) <= LIMIT);
    assert.strictEqual(bytes(get("convertLegacyScardToMarkdown")(oldScard)), target);
  }
  const over = { ...emptyDataEnvelope, data:"a".repeat(LIMIT + 1 - markdownOverhead) };
  assert.throws(() => get("encodeShareMarkdown")(over), (err) => err.code === "SHARE_FILE_TOO_LARGE");
  const overLegacy = JSON.stringify(over);
  assert.ok(bytes(overLegacy) <= LIMIT);   // input itself is below the cap, but wrapping it exceeds the cap
  assert.throws(() => get("convertLegacyScardToMarkdown")(overLegacy), (err) => err.code === "SHARE_FILE_TOO_LARGE");
});

test("share size uses final UTF-8 byte length: the byte limit is inclusive", () => {
  const tooLarge = get("isShareTextTooLarge");
  assert.strictEqual(tooLarge("12345", 5), false);       // exactly at limit
  assert.strictEqual(tooLarge("123456", 5), true);       // one byte over
  assert.strictEqual(tooLarge("あ", 2), true);           // UTF-8 uses three bytes, not one JS character
  assert.strictEqual(tooLarge("あ", 3), false);
});

// ---- 以下の読み取りのテストで使う小道具 ----
const FENCE = "```";
const TITLE = "# サポートカードの共有ファイル";
const LIMIT = 20 * 1024 * 1024;   // 読み込める大きさの上限(20MB)
const json = JSON.stringify(envelope, null, 2);
const written = get("encodeShareMarkdown")(envelope);   // アプリが書き出したままの形
const parse = (text) => plain(get("parseShareMarkdown")(text));
const reads = (text) => assert.deepStrictEqual(parse(text), envelope);   // 同じ封筒として読める
const rejects = (text) => assert.throws(() => get("parseShareMarkdown")(text));   // 断る(エラーになる)
// 見出しのあとに、説明文(省略可)とコードブロックを並べた、読み込める形。lang はコードブロックの言語名
const markdown = (body, { lang = "json" } = {}) => [TITLE, "", "説明文", "", FENCE + lang, body, FENCE, ""].join("\n");

section("読み込みのゆるさ:書き出したままの形でなくても読める");

test("書き出したままの形は、これまでどおり読める(書き出す形は変えない)", () => {
  assert.strictEqual(written, `${TITLE}\n\nこのファイルの共有データは暗号化されています。サポートカードで読み込んでください。\n\n${FENCE}json\n${json}\n${FENCE}\n`);
  reads(written);
});

test("改行コードが CRLF(Windows)や CR だけでも読める", () => {
  reads(written.replace(/\n/g, "\r\n"));
  reads(written.replace(/\n/g, "\r"));
});

test("先頭の BOM・空白・空行があっても読める", () => {
  reads("\uFEFF" + written);
  reads("\uFEFF\r\n\r\n   \t" + written);
  reads("\n\n" + written);
});

test("行末の空白(スペース・タブ・全角スペース)があっても読める", () => {
  reads(written.split("\n").map((line) => line + " \t").join("\n"));   // すべての行の終わりにスペースとタブ
  // 見出し・説明文・コードブロックの前後の行には、全角スペースも付ける(JSON の中の行は、JSON が認める空白だけにする)
  reads([TITLE + " \t\u3000", "", "説明文 \u3000", "", FENCE + "json \t\u3000", ...json.split("\n").map((line) => line + " \t"), FENCE + " \u3000", ""].join("\n"));
});

test("空行が増えても減っても読める", () => {
  reads([TITLE, FENCE + "json", json, FENCE].join("\n"));   // 空行も、最後の改行もない
  reads(["", "", TITLE, "", "", "", "説明文", "", "", FENCE + "json", "", "", json, "", "", FENCE, "", "", ""].join("\n"));
});

test("コードブロックの言語名は、大文字・小文字を問わない(```JSON など)", () => {
  for (const lang of ["JSON", "Json", "jSoN"]) reads(markdown(json, { lang }));
  reads(written.replace(FENCE + "json", FENCE + "JSON"));
});

test("説明文は、変わっていても、なくても読める", () => {
  reads([TITLE, "", "メールで受け取った、サポートカードの共有ファイルです。", "パスコードは、別の方法で教えてもらってください。", "", FENCE + "json", json, FENCE, ""].join("\n"));
  reads([TITLE, "", FENCE + "json", json, FENCE, ""].join("\n"));
  reads([TITLE, "", "説明文に ``` や {\"a\":1} のような文字があっても、コードブロックとは見なさない。", "", FENCE + "json", json, FENCE, ""].join("\n"));
});

test("最後の改行がなくても、コードブロックのあとに文章が続いていても読める", () => {
  reads(written.trimEnd());
  reads(written + "\nこのあとに別の文章があっても、読み取りには使わない。\n");
});

test("コードブロックの前後の行にスペースやタブのインデントがあっても読める", () => {
  reads([TITLE, "", "  " + FENCE + "json", json, "\t" + FENCE, ""].join("\n"));
});

test("コードブロックが2つ以上あるときは、最初のものだけを使う", () => {
  const other = JSON.stringify({ ...envelope, data:"other" }, null, 2);
  reads(written + "\n" + FENCE + "json\n" + other + "\n" + FENCE + "\n");   // 2つ目が別の封筒でも、最初のものを使う
  reads(written + "\n" + FENCE + "json\n{ broken\n" + FENCE + "\n");   // 2つ目が壊れていても、影響しない
  rejects([TITLE, "", FENCE + "json", "{}", FENCE, "", FENCE + "json", json, FENCE, ""].join("\n"));   // 最初のものが封筒でなければ、2つ目が正しくても使わない
});

section("読み込みの拒否:形が違うものは、これまでどおり断る");

test("見出しがない・違う・先頭にないものは断る", () => {
  const block = FENCE + "json\n" + json + "\n" + FENCE + "\n";
  rejects(block);   // 見出しがない
  rejects("## サポートカードの共有ファイル\n\n" + block);   // 見出しのレベルが違う
  rejects("#サポートカードの共有ファイル\n\n" + block);   // # のあとに空白がない
  rejects("# サポートカード\n\n" + block);   // 別の見出し
  rejects("# サポートカードの共有ファイル(コピー)\n\n" + block);   // 見出しに続きがある
  rejects("メモ\n\n" + written);   // 見出しより前に文章がある
  rejects("");
});

test("コードブロックがない・閉じていない・json でないものは断る", () => {
  rejects(TITLE);   // 見出しだけ
  rejects(TITLE + "\n\nこのファイルの共有データは暗号化されています。サポートカードで読み込んでください。\n");   // コードブロックがない
  rejects(markdown(json, { lang:"" }));   // 言語名がない
  rejects(markdown(json, { lang:"text" }));   // json ではない
  rejects(markdown(json, { lang:"json5" }));   // json に似た別の名前
  rejects([TITLE, "", FENCE + "json", json, ""].join("\n"));   // 閉じていない
  rejects([TITLE, "", FENCE + "json", json + FENCE, ""].join("\n"));   // 閉じる ``` が、行の途中にある
  rejects([TITLE, "", "~~~json", json, "~~~", ""].join("\n"));   // ~~~ のブロックは対象外
  rejects(JSON.stringify(envelope));   // 見出しもコードブロックもない、JSON そのもの
});

test("コードブロックの中身が JSON として読めないものは断る", () => {
  for (const body of ["{ broken", json.slice(0, 40), json.replace(/\n}$/, ",\n}"), "{'app':'support-card'}", "", "  \n  "]) rejects(markdown(body));
});

test("封筒の形が違うものは断る(app・type・salt・iv・data の違いや不足、配列や null など)", () => {
  const shapes = [{ ...envelope, app:"other" }, { ...envelope, type:"backup" }, { ...envelope, salt:undefined }, { ...envelope, iv:undefined }, { ...envelope, data:undefined },
    { ...envelope, data:123 }, { ...envelope, iv:null }, [envelope], null, "text", 42, {}];
  for (const shape of shapes) rejects(markdown(JSON.stringify(shape, null, 2)));
});

test("20MB を超えるものは断る。ちょうど20MBは読める", () => {
  assert.strictEqual(get("SHARE_FILE_MAX_SIZE"), LIMIT);
  const head = TITLE + "\n\n", tail = "\n\n" + FENCE + "json\n" + json + "\n" + FENCE + "\n";
  const headBytes = new TextEncoder().encode(head).byteLength, tailBytes = new TextEncoder().encode(tail).byteLength;
  const sized = (bytes) => head + "a".repeat(bytes - headBytes - tailBytes) + tail;   // ASCII の説明文で UTF-8 の総バイト数をそろえる
  assert.strictEqual(new TextEncoder().encode(sized(LIMIT)).byteLength, LIMIT);
  reads(sized(LIMIT));
  rejects(sized(LIMIT + 1));
});

test("文字列でない入力は断る", () => {
  for (const bad of [null, undefined, 42, {}, [], new Uint8Array(4)]) rejects(bad);
});

test("読み込む前の大きさの確認(isShareFileTooLarge):20MBを超えるときだけ true。大きさが分からないものは通す", () => {
  const tooLarge = get("isShareFileTooLarge");
  assert.ok(tooLarge({ size:LIMIT + 1 }) === true && tooLarge({ size:LIMIT }) === false && tooLarge({ size:0 }) === false);
  assert.ok(tooLarge({}) === false && tooLarge({ size:"30000000" }) === false && tooLarge(null) === false && tooLarge(undefined) === false);
});

section("読み込みの流れ:ゆるく読めても、パスコードと中身の検証は変わらない");

const defs = plain(get("DEFAULT_TOPICS"));
const PASS = "team-pass";
let payload;   // 実際に暗号化した共有ファイルの封筒(最初のテストでつくる)
// 書き出したままの形を、メールや保存し直しで崩れた形にする:先頭の BOM・CRLF・行末の空白・別の説明文・```JSON・末尾の空行
const mangle = (text) => "\uFEFF" + text
  .replace("このファイルの共有データは暗号化されています。サポートカードで読み込んでください。", "メールで受け取った共有ファイルです。")
  .replace(FENCE + "json", FENCE + "JSON")
  .replace(/\n/g, " \t\r\n") + "\r\n\r\n";
// 共有ファイルの中身(text)を「選んだ」ことにして、読み込みの終わりまで進める。増えたチーム数を返す
async function importText(text, answer) {
  env.promptAnswer = answer; run(`stage="ready"`);
  const before = get("teams.length");
  importInput.files = [{ text }];
  handlers.import({ target:importInput });
  await readers.at(-1).completion;
  return get("teams.length") - before;
}

test("崩れた形(BOM・CRLF・行末の空白・別の説明文・```JSON)の暗号化ファイルも、パスコードが合えば新しいチームとして取り込める", async () => {
  await env.startSession("device-pass", [], null);
  payload = await env.makeShare(PASS, { team:makeFullTeam(defs, "team_src"), meta:{ audience:"all", createdAt:"2026-10-18T03:00:00.000Z" } });
  const text = mangle(get("encodeShareMarkdown")(payload));
  assert.ok(text.startsWith("\uFEFF# ") && text.includes("\r\n") && text.includes(FENCE + "JSON") && !text.includes("このファイルの共有データ"));   // 本当に崩れた形になっている
  assert.strictEqual(await importText(text, PASS), 1);
  assert.ok(get("teams[0].name") === "テストチーム" && get("teams[0].id") !== "team_src" && get("teams[0].people.length") === 2 && get("teams[0].source.audience") === "all");
});

test("崩れた形でも、パスコードがちがえば取り込まない(復号の検証は変わらない)", async () => {
  const alertsBefore = alerts.length;
  assert.strictEqual(await importText(mangle(get("encodeShareMarkdown")(payload)), "wrong-pass"), 0);
  assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === "パスコードがちがうか、ファイルが壊れています。");
});

test("崩れた形で、暗号文が書き換えられていれば取り込まない(認証つき暗号の検証は変わらない)", async () => {
  const flip = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);
  const alertsBefore = alerts.length;
  assert.strictEqual(await importText(mangle(get("encodeShareMarkdown")({ ...payload, data:flip(payload.data) })), PASS), 0);
  assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === "パスコードがちがうか、ファイルが壊れています。");
});

test("崩れた形で、復号した中身の形が正しくなければ取り込まない(中身の検証 sanitizeImportedTeam は変わらない)", async () => {
  const bad = await env.makeShare(PASS, { team:{ name:"人物がない" } });
  const alertsBefore = alerts.length;
  assert.strictEqual(await importText(mangle(get("encodeShareMarkdown")(bad)), PASS), 0);
  assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === "ファイルの内容が正しくないため、読み込めませんでした。");
});

test("形が違うファイルは、パスコードを聞く前に断り、何も追加しない(選び直しを案内する)", async () => {
  const promptsBefore = prompts.length;
  const noHeading = get("encodeShareMarkdown")(payload).replace(TITLE, "# 別の見出し");
  for (const text of ["# メモ\n\n私的な内容", "", noHeading, "{\"app\":\"other\"}"]) {
    const alertsBefore = alerts.length;
    assert.strictEqual(await importText(text, PASS), 0);
    assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1).startsWith("このファイルは、サポートカードの共有ファイル(.md)ではないため、読み込めません。"));
  }
  assert.strictEqual(prompts.length, promptsBefore);
});

section("旧 .scard は、通常の読み込みでは開かない:設定の「旧 .scard ファイルを .md に変換」を通してから読み込む");

test("旧 .scard(JSON の封筒)を通常の読み込みで選ぶと、パスコードを聞かずに、変換の手順を案内する", async () => {
  const promptsBefore = prompts.length, alertsBefore = alerts.length;
  assert.strictEqual(await importText(JSON.stringify(payload), PASS), 0);
  assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1).startsWith("旧 .scard ファイルです。") && alerts.at(-1).includes("「旧 .scard ファイルを .md に変換」"));
  assert.strictEqual(prompts.length, promptsBefore);
});

test("旧 .scard の封筒は、書き方(整形・v が 2・v がない)が違っても、通常の読み込みでは開かない。パスコードを聞かず、何も追加せず、変換の手順を案内する", async () => {
  const noV = { ...payload }; delete noV.v;
  const teamsBefore = get("teams.length"), promptsBefore = prompts.length;
  for (const text of [JSON.stringify(payload, null, 2), JSON.stringify({ ...payload, v:2 }), JSON.stringify(noV)]) {
    const alertsBefore = alerts.length;
    assert.strictEqual(await importText(text, PASS), 0);   // 共有パスコードが合っていても、取り込まない
    assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1).startsWith("旧 .scard ファイルです。このままでは読み込めません。") && alerts.at(-1).includes("「旧 .scard ファイルを .md に変換」"));
  }
  assert.ok(prompts.length === promptsBefore && get("teams.length") === teamsBefore);
});

test("封筒の形でない JSON や、途中で切れた JSON は、旧 .scard とは見なさず、変換の手順ではなく選び直しを案内する(パスコードは聞かない)", async () => {
  const promptsBefore = prompts.length, teamsBefore = get("teams.length");
  const json = JSON.stringify(payload);
  const texts = [JSON.stringify({ ...payload, app:"other" }), JSON.stringify({ ...payload, type:"backup" }), JSON.stringify({ ...payload, salt:undefined }), JSON.stringify({ ...payload, iv:1 }), JSON.stringify({ ...payload, data:null }),
    JSON.stringify([payload]), "null", "42", '"text"', "{}", json.slice(0, 60), json + "x"];
  for (const text of texts) {
    const alertsBefore = alerts.length;
    assert.strictEqual(await importText(text, PASS), 0, text.slice(0, 40));
    assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1).startsWith("このファイルは、サポートカードの共有ファイル(.md)ではないため、読み込めません。") && !alerts.at(-1).includes("旧 .scard"), text.slice(0, 40));
  }
  assert.ok(prompts.length === promptsBefore && get("teams.length") === teamsBefore);
});

test("旧 .scard は、設定の変換で .md にしてから読み込めば、元の共有パスコードで取り込める。結果は、最初から .md だったときと同じ", async () => {
  const oldFile = JSON.stringify(payload);   // 旧 .scard(暗号化された封筒の JSON そのもの)
  run(`stage="ready"; modal=null`);
  env.confirmAnswer = true;
  assert.strictEqual(await get("processLegacyScardFile")({ name:"old.scard", size:oldFile.length, text:oldFile }), true);   // 設定の「旧 .scard ファイルを .md に変換」
  assert.ok(get("modal") === "share-ready" && get("preparedShare.convertedLegacy") === true);
  const converted = await get("preparedShare.file").text();   // 変換した .md(復号も再暗号化もしていない)
  assert.deepStrictEqual(plain(get("parseShareMarkdown")(converted)), plain(payload));
  get("clearPreparedShare()"); run(`modal=null`);
  const promptsBefore = prompts.length;
  assert.strictEqual(await importText(converted, PASS), 1);   // 元の共有パスコードで、新しいチームとして追加される
  assert.strictEqual(prompts.length, promptsBefore + 1);
  assert.strictEqual(await importText(get("encodeShareMarkdown")(payload), PASS), 1);   // 比べるために、最初から .md だったものも読み込む
  const received = (index) => { const t = plain(get(`teams.at(${index})`)); delete t.id; delete t.source.importedAt; return t; };   // 取り込むたびに変わる値(ID・受け取った日時)を除く
  assert.deepStrictEqual(received(-2), received(-1));
});

test("旧 .scard を .md に変換する操作は、設定に残っている(通常の読み込みとは別の入力)。説明に、.md に変換できることが書いてある", async () => {
  run(`stage="ready"; modal="settings"; render()`);
  const html = app.innerHTML;
  assert.ok(html.includes('data-act="legacy-scard">旧 .scard ファイルを .md に変換</button>'));
  assert.ok(html.includes("以前の .scard ファイルは、暗号化データをそのまま保ち、共有用の .md ファイルに変換できます。"));
  const pickerBefore = env.legacyPickerCalls || 0;
  await get(`handle("legacy-scard",{})`);   // 変換用のファイル選択を開く。読み込み用(import)とは別の入力
  assert.strictEqual(env.legacyPickerCalls, pickerBefore + 1);
  run(`modal=null; render()`);
});

section("読み込みの流れ(続き):大きさの確認と、サイズ超過の案内");

test("共有ファイルは、読み込む前に大きさを確かめる:20MBを超えるものは読み込まずに断る。ちょうど20MBは読む", async () => {
  const text = get("encodeShareMarkdown")(payload);   // 中身は正しい。大きさ(size)だけで断られることを確かめる
  const readersBefore = readers.length, alertsBefore = alerts.length, promptsBefore = prompts.length, teamsBefore = get("teams.length");
  const message = "この共有ファイルは20MiBを超えているため読み込めません。送り手に写真やカードを減らした小さいファイルを作ってもらってください。";
  run(`stage="ready"`);
  assert.strictEqual(await get("processImportFile")({ name:"big.md", size:LIMIT + 1, text }), false);
  assert.ok(readers.length === readersBefore && prompts.length === promptsBefore && get("teams.length") === teamsBefore);
  assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === message);
  importInput.files = [{ name:"big.md", size:LIMIT + 1, text }];   // ファイルを選ぶ操作(change)からでも同じ
  handlers.import({ target:importInput });
  assert.ok(readers.length === readersBefore && prompts.length === promptsBefore && get("teams.length") === teamsBefore);
  assert.ok(alerts.length === alertsBefore + 2 && alerts.at(-1) === message);
  env.promptAnswer = PASS;   // ちょうど20MBは読み込む
  assert.strictEqual(await get("processImportFile")({ name:"edge.md", size:LIMIT, text }), true);
  assert.ok(readers.length === readersBefore + 1 && get("teams.length") === teamsBefore + 1);
});

test("旧 .scard の変換も、20MBを超えるファイルは、確認も読み込みもせずに断る。ちょうど20MBは変換できる", async () => {
  const old = JSON.stringify(payload);   // 旧 .scard は、封筒そのままの JSON
  const readersBefore = readers.length, confirmsBefore = confirms.length, alertsBefore = alerts.length;
  run(`stage="ready"`);
  assert.strictEqual(await get("processLegacyScardFile")({ name:"big.scard", size:LIMIT + 1, text:old }), false);
  assert.ok(readers.length === readersBefore && confirms.length === confirmsBefore && get("modal") !== "share-ready" && get("preparedShare") === null);
  assert.ok(alerts.length === alertsBefore + 1 && alerts.at(-1) === "この旧 .scard ファイルは20MiBを超えているため変換できません。小さいファイルを選んでください。");
  assert.strictEqual(await get("processLegacyScardFile")({ name:"edge.scard", size:LIMIT, text:old }), true);
  assert.ok(readers.length === readersBefore + 1 && confirms.length === confirmsBefore + 1 && get("modal") === "share-ready");
  get("clearPreparedShare()"); run(`modal=null`);
});

test("通常の共有書き出しと旧形式変換はサイズ超過を案内し、共有ファイルを作らない", async () => {
  run(`globalThis.__restoreEncoder=encodeShareMarkdown`);
  run(`encodeShareMarkdown = function(){ const e=new Error("share file too large"); e.code="SHARE_FILE_TOO_LARGE"; throw e; }`);
  try {
    const tm = makeFullTeam(defs, "team_size_limit");
    await env.startSession("device-pass", [tm], tm.id);
    const alertsBefore = alerts.length;
    const result = await env.exportShare(tm.id, "team-pass");
    assert.strictEqual(result, null);
    assert.strictEqual(get("modal"), null);
    assert.strictEqual(get("preparedShare"), null);
    assert.strictEqual(alerts.length, alertsBefore + 1);
    assert.match(alerts.at(-1), /20MiBを超えるため作成できません/);
    assert.match(alerts.at(-1), /相手の範囲を狭めるか、写真やカードを減らしてください/);

    env.confirmAnswer = true;
    const legacyAlertsBefore = alerts.length;
    const legacyResult = await get("processLegacyScardFile")({ name:"near-limit.scard", size:LIMIT, text:JSON.stringify({ ...envelope, v:1 }) });
    assert.strictEqual(legacyResult, false);
    assert.strictEqual(get("preparedShare"), null);
    assert.strictEqual(alerts.length, legacyAlertsBefore + 1);
    assert.match(alerts.at(-1), /20MiBを超えるため作成できません/);
    assert.ok(!alerts.at(-1).includes("対応していない .scard"));
  } finally {
    run(`encodeShareMarkdown=globalThis.__restoreEncoder`);
    run(`globalThis.__restoreEncoder=null`);
  }
});

section("ファイル選択に accept を付けない(iPhone で選べなくなる S7 の再発防止)");

test("index.html:共有ファイルの読み込み(importInput)と旧 .scard の変換(legacyScardInput)の入力に accept がない。accept があるのは写真用だけ", () => {
  const inputs = [...readIndexHtml().matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  const idOf = (tag) => tag.match(/\bid="([^"]+)"/)?.[1];
  assert.ok(["importInput", "legacyScardInput"].every((id) => inputs.some((tag) => idOf(tag) === id)));   // 読み込みと変換は、別々の入力
  assert.deepStrictEqual(inputs.filter((tag) => /\baccept\s*=/i.test(tag)).map(idOf), ["photoInput"]);
});

test("js/ からも、読み込みの入力に accept を付け足さない", () => {
  const src = readAppSource();
  assert.ok(!/\.accept\s*=[^=]/.test(src) && !/setAttribute\(\s*["']accept["']/.test(src));
});
