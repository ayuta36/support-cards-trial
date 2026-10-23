/* Markdown envelope for encrypted team-share v1 files. The JSON body is the
   same encrypted envelope used by the older .scard format.
   主な関数と定数:
     encodeShareMarkdown(封筒を、書き出す .md の文字列にする。書き出す形は変えない)
     parseShareMarkdown(.md の文字列から封筒を取り出す。先頭の BOM・CRLF・行末の空白・空行の増減・```JSON・説明文の違いは許す。
                        見出し・コードブロック・封筒の形が合わないものと、20MiB を超えるものは断る。復号と中身の検証は呼び出し側)
     convertLegacyScardToMarkdown(旧 .scard の封筒を、復号せずに .md の文字列にする)
     isEncryptedShareEnvelope(封筒の形か) / SHARE_FILE_MAX_SIZE・isShareFileTooLarge・isShareTextTooLarge(ファイルサイズの確認)
   使われる側:actions.js(processImportFile・processLegacyScardFile・書き出し) */
"use strict";

const SHARE_MARKDOWN_OPEN = "```json\n";
const SHARE_MARKDOWN_CLOSE = "\n```";

// 読み書きする共有ファイルの大きさの上限(20MiB)。file.size と UTF-8 の実バイト数でそろえる。
const SHARE_FILE_MAX_SIZE = 20 * 1024 * 1024;
// 読み込む前に、選んだファイルが大きすぎないかを確かめる(大きさが分からないものは通す。中身は読み込んだあとにも確かめる)
const isShareFileTooLarge = (file) => !!file && typeof file.size === "number" && file.size > SHARE_FILE_MAX_SIZE;
function isShareTextTooLarge(text, maxBytes=SHARE_FILE_MAX_SIZE) {
  return new TextEncoder().encode(text).byteLength > maxBytes;
}

function isEncryptedShareEnvelope(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    value.app === "support-card" && value.type === "team-share" &&
    typeof value.salt === "string" && typeof value.iv === "string" && typeof value.data === "string";
}

function encodeShareMarkdown(envelope) {
  if (!isEncryptedShareEnvelope(envelope)) throw new Error("invalid share envelope");
  const markdown = `# サポートカードの共有ファイル\n\nこのファイルの共有データは暗号化されています。サポートカードで読み込んでください。\n\n${SHARE_MARKDOWN_OPEN}${JSON.stringify(envelope, null, 2)}${SHARE_MARKDOWN_CLOSE}\n`;
  if (isShareTextTooLarge(markdown)) {
    const err = new Error("share file too large");
    err.code = "SHARE_FILE_TOO_LARGE";
    throw err;
  }
  return markdown;
}

// 読み込む側は、書き出したままの形でなくても受け付ける。メールや LINE を通ったり、保存し直されたりして起きる、
// 先頭の BOM・改行コード(CRLF)・行末の空白・空行の増減・コードブロックの言語名の大文字小文字(```JSON)の違いは許す。
// 受け付けるのは、次をすべて満たすものだけ。
//   1. 先頭(BOM と空白を除く)が、見出し「# サポートカードの共有ファイル」の行である(行末の空白は無視する)
//   2. その後ろに、```json(大文字小文字は問わない)の行で始まり ``` の行で終わるコードブロックがある。使うのは最初のものだけ
//   3. その中身が JSON として読めて、暗号化された封筒(isEncryptedShareEnvelope)の形をしている
// 見出しと封筒の間の説明文は、なくても、変わっていてもよい。ここで確かめるのは形だけで、復号と中身の検証(sanitizeImportedTeam)は呼び出し側で行う。
// [^\S\r\n] は、改行以外の空白(スペース・タブ・全角スペースなど)。行を配列に分けず、正規表現で順に探す(大きなファイルでも余分なメモリを使わない)
function parseShareMarkdown(text) {
  if (typeof text !== "string") throw new Error("invalid markdown");
  if (isShareTextTooLarge(text)) throw new Error("markdown share too large");
  const heading = /^[\s\uFEFF]*#[^\S\r\n]+サポートカードの共有ファイル[^\S\r\n]*(?![^\r\n])/.exec(text);
  if (!heading) throw new Error("unrecognized markdown share");
  let rest = text.slice(heading[0].length);
  const open = /^[^\S\r\n]*```json[^\S\r\n]*$/im.exec(rest);
  if (!open) throw new Error("unrecognized markdown share");
  rest = rest.slice(open.index + open[0].length);
  const close = /^[^\S\r\n]*```[^\S\r\n]*$/m.exec(rest);
  if (!close) throw new Error("unrecognized markdown share");
  const envelope = JSON.parse(rest.slice(0, close.index));
  if (!isEncryptedShareEnvelope(envelope)) throw new Error("invalid share envelope");
  return envelope;
}

function convertLegacyScardToMarkdown(text) {
  if (typeof text !== "string") throw new Error("invalid legacy file");
  const envelope = JSON.parse(text);
  if (!isEncryptedShareEnvelope(envelope) || envelope.v !== 1) throw new Error("unsupported legacy file");
  return encodeShareMarkdown(envelope);
}
