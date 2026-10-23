import assert from "node:assert/strict";
import { createApp, test, section, makeTestTeam, installHistory } from "./harness.mjs";

const env = createApp();
const { run, get, localStorage, alerts, toast, print } = env;
const team = makeTestTeam();
const person = team.people[0];
const teamId = team.id, personId = person.id;
const noteText = "PRIVATE LOCAL MEMO — rehearsal only";
const keyExpr = `privateNoteKey(${JSON.stringify(teamId)},${JSON.stringify(personId)})`;
let lastEncrypted = null;

const visitPerson = () => run(`view={teamId:${JSON.stringify(teamId)},screen:"person",personId:${JSON.stringify(personId)},topicId:null,editing:false,organize:false,audience:"all"};stage="ready";render()`);
const shareFor = async (audience) => {
  await get(`handle("share-team",{})`);
  await get(`handle("share-audience",{v:${JSON.stringify(audience)}})`);
  await get(`handle("share-proceed",{})`);
  await env.submitSharePasscode("share-pass");
  const file = get("preparedShare.file");
  assert.ok(file, `share file for ${audience} should be prepared`);
  const text = await file.text();
  const envelope = get("parseShareMarkdown")(text);
  const s = get("unb64")(envelope.salt);
  const decrypted = await get("decryptJson")(envelope, await get("deriveKey")("share-pass", s));
  run(`clearPreparedShare();modal=null;render()`);
  return { text, decrypted };
};

section("Private notes: encrypted app lifecycle and exclusion");

test("notes survive reload-style unlock and remain encrypted across passcode change", async () => {
  await env.startSession("device-pass", [team], teamId);
  visitPerson();
  const input = { value: noteText };
  const originalGetElementById = env.document.getElementById;
  env.document.getElementById = (id) => id === "private-note-input" ? input : originalGetElementById(id);
  await get(`handle("save-private-note",{})`);
  assert.equal(get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), noteText);
  const encryptedRecord = JSON.parse(localStorage.getItem("support-card-local-v1"));
  assert.ok(!JSON.stringify(encryptedRecord).includes(noteText));
  run("lockNow()");
  await get(`unlock("device-pass")`);
  assert.equal(get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), noteText);

  const newSalt = env.context.crypto.getRandomValues(new Uint8Array(16));
  env.context.__newNoteSalt = newSalt;
  env.context.__newNoteKey = await get("deriveKey")("new-device-pass", newSalt);
  run("salt=globalThis.__newNoteSalt;cryptoKey=globalThis.__newNoteKey");
  assert.equal(await get("save()"), true);
  run("lockNow()");
  await get(`unlock("new-device-pass")`);
  assert.equal(get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), noteText);
  env.document.getElementById = originalGetElementById;
});

test("failed save rolls back both the team and private-note changes without a success toast", async () => {
  const teamBefore = JSON.stringify(get("teams[0]"));
  const noteBefore = get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`);
  const toastBefore = env.toastShows, alertBefore = alerts.length;
  run(`teams[0].name="unsaved team";privateNotes[${keyExpr}]=${JSON.stringify("unsaved memo")}`);
  env.failStoreWrites = true;
  const saved = await get("save()");
  env.failStoreWrites = false;
  assert.equal(saved, false);
  assert.equal(JSON.stringify(get("teams[0]")), teamBefore);
  assert.equal(get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), noteBefore);
  assert.equal(env.toastShows, toastBefore);
  assert.equal(alerts.length, alertBefore + 1);
});

test("received read-only card data is unchanged when adding a device-local note", async () => {
  const received = JSON.parse(JSON.stringify(get("teams[0]")));
  received.source = { importedAt: "2026-10-20T00:00:00.000Z", audience: "all", createdAt: null };
  env.context.__receivedTeam = received;
  run("teams=[globalThis.__receivedTeam];persistedTeams=structuredClone(teams);privateNotes={};persistedPrivateNotes={};view={teamId:teams[0].id,screen:'person',personId:teams[0].people[0].id,topicId:null,editing:false,organize:false,audience:'all'};stage='ready';render()");
  const before = JSON.stringify(get("teams[0]"));
  const input = { value: "staff-only observation" };
  const original = env.document.getElementById;
  env.document.getElementById = (id) => id === "private-note-input" ? input : original(id);
  await get(`handle("save-private-note",{})`);
  assert.equal(JSON.stringify(get("teams[0]")), before);
  assert.equal(get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), "staff-only observation");
  env.document.getElementById = original;
});

test("student page notes are editable and an unsaved draft survives rerenders and canceled navigation", async () => {
  const received = JSON.parse(JSON.stringify(get("teams[0]")));
  received.source = { importedAt: "2026-10-20T00:00:00.000Z", audience: "student", createdAt: null };
  env.context.__studentReceived = received;
  const listeners = {};
  const input = { value: "", dataset: { privateNoteTeam: teamId, privateNotePerson: personId }, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const original = env.document.getElementById;
  env.document.getElementById = (id) => id === "private-note-input" ? input : original(id);
  run("teams=[globalThis.__studentReceived];view={teamId:teams[0].id,screen:'person',personId:teams[0].people[0].id,topicId:null,editing:false,organize:false,audience:'student'};stage='ready';render()");
  assert.ok(env.app.innerHTML.includes("この端末だけのメモ"));
  input.value = "typing in student view";
  listeners.input();
  run("render()");
  assert.ok(env.app.innerHTML.includes("typing in student view"));
  assert.ok(env.app.innerHTML.includes("未保存"));

  await get(`handle("settings",{})`);
  await get(`handle("close-modal",{})`);
  assert.ok(env.app.innerHTML.includes("typing in student view"), "modal rerenders should retain the note draft");
  await get(`handle("set-audience",{v:"staff"})`);
  assert.ok(env.app.innerHTML.includes("typing in student view") && env.app.innerHTML.includes("未保存"), "switching the audience for the same person should retain the draft");
  await get(`handle("set-audience",{v:"student"})`);

  env.confirmAnswer = false;
  await get(`handle("back-list",{})`);
  assert.equal(get("view.screen"), "person", "app back should stay when the user cancels");
  assert.equal(get(`getPrivateNoteDraft(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), "typing in student view");
  const history = installHistory(env);
  run("initHistory();histDepth=2");
  await history.popstate({sc:1});
  assert.equal(get("view.screen"), "person");
  assert.equal(get(`getPrivateNoteDraft(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), "typing in student view");
  env.failStoreWrites = true;
  await get(`handle("save-private-note",{})`);
  env.failStoreWrites = false;
  assert.equal(get(`getPrivateNoteDraft(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), "typing in student view", "failed save should retain the retryable draft");
  assert.ok(env.app.innerHTML.includes("typing in student view") && env.app.innerHTML.includes("未保存"));
  await get(`handle("save-private-note",{})`);
  assert.equal(get(`privateNoteDraftDirty(${JSON.stringify(teamId)},${JSON.stringify(personId)})`), false);
  assert.ok(!env.app.innerHTML.includes('class="private-note-unsaved"'), "successful save should clear the unsaved status");
  assert.equal(get(`getPrivateNote(privateNotes,${JSON.stringify(teamId)},${JSON.stringify(personId)})`), "typing in student view");

  input.value = "discarded on lock";
  listeners.input();
  run("lockNow()");
  assert.equal(get(`privateNoteDraftDirty(${JSON.stringify(teamId)},${JSON.stringify(personId)})`), false, "locking clears in-memory drafts");
  env.confirmAnswer = true;
  assert.equal(get("stage"), "locked");
  await get(`unlock("new-device-pass")`);
  env.document.getElementById = original;
});

test("all/student/staff share payloads and print output exclude private notes; import cannot inject notes", async () => {
  const audiences = ["all", "student", "staff"];
  for (const audience of audiences) {
    visitPerson();
    const { text, decrypted } = await shareFor(audience);
    const serialized = JSON.stringify(decrypted);
    assert.ok(!serialized.includes("staff-only observation"));
    assert.ok(!serialized.includes("privateNotes"));
    assert.ok(!text.includes("staff-only observation"));
  }
  visitPerson();
  await get(`buildPrint(teams[0].people[0],"all")`);
  assert.ok(!print.innerHTML.includes("staff-only observation"));
  assert.ok(!print.innerHTML.includes("PRIVATE LOCAL MEMO"));

  const before = JSON.stringify(get("privateNotes"));
  const incomingTeam = JSON.parse(JSON.stringify(get("teams[0]")));
  const malicious = await env.makeShare("incoming-pass", {
    team: incomingTeam,
    meta: { audience: "all", createdAt: "2026-10-20T00:00:00.000Z", appVersion: "test" },
    privateNotes: { [keyExpr]: "INJECTED PRIVATE MEMO" },
  });
  const imported = await env.importShare(malicious, "incoming-pass");
  assert.equal(imported, 1);
  assert.equal(JSON.stringify(get("privateNotes")), before);
  assert.ok(!JSON.stringify(get("teams.at(-1)" )).includes("INJECTED PRIVATE MEMO"));
});

