import assert from "node:assert/strict";
import { createApp, test, section, makeTestTeam, listView } from "./harness.mjs";

const env = createApp();
const { get, handlers, downloads, alerts, navigatorStub } = env;

async function prepare() {
  await env.startSession("device-pass", [makeTestTeam()], "team_test");
  await get(`handle("share-team",{})`);
  await get(`handle("share-proceed",{})`);
  await env.submitSharePasscode("share-pass");
  assert.equal(get("modal"), "share-ready");
}

section("Native sharing and legacy migration");
test("OS-share cancellation keeps the encrypted file ready and does not claim send or download", async () => {
  await prepare();
  env.shareError = Object.assign(new Error("cancel"), { name:"AbortError" });
  await get(`handle("share-native",{})`);
  assert.equal(env.shareCalls.length, 1);
  assert.equal(env.shareCalls[0].files[0].name.endsWith(".md"), true);
  assert.equal(get("modal"), "share-ready");
  assert.ok(get("preparedShare"));
  assert.equal(downloads.length, 0);
  assert.equal(alerts.some((text) => /送信完了/.test(text)), false);
});

test("successful OS-share reports only that the share sheet closed and lock clears any prepared file", async () => {
  env.shareError = null;
  await get(`handle("share-native",{})`);
  assert.equal(get("modal"), null);
  assert.equal(get("preparedShare"), null);
  assert.match(alerts.at(-1), /送信完了を確認できません/);
  await prepare();
  await get("lockNow()");
  assert.equal(get("preparedShare"), null);
  assert.equal(get("privateNotes") && Object.keys(get("privateNotes")).length, 0);
});

test("explicit legacy picker converts the v1 envelope to Markdown without re-encryption", async () => {
  await env.startSession("device-pass", [makeTestTeam()], "team_test");
  const old = await env.makeShare("old-pass", { team: makeTestTeam(), meta:{ audience:"all" } });
  handlers.legacyScard({ target:{ files:[{ text:JSON.stringify(old) }] } });
  await env.readers.at(-1).completion;
  assert.equal(get("modal"), "share-ready");
  await get(`handle("share-download",{})`);
  const markdown = await env.imported.at(-1).text();
  const converted = get("parseShareMarkdown")(markdown);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(converted)), old);
  assert.match(downloads.at(-1).download, /\.md$/);
});
