import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test, section, runQueued } from "./harness.mjs";

const context = vm.createContext({ console });
vm.runInContext(readFileSync(new URL("../js/private-notes.js", import.meta.url), "utf8"), context);
const api = vm.runInContext("({privateNoteKey,getPrivateNote,setPrivateNote,deletePrivateNoteForPerson,deletePrivateNotesForTeam,normalizePrivateNotes,PRIVATE_NOTE_MAX_LENGTH})", context);
const teams = [{ id: "team:a", people: [{ id: "person,1" }, { id: "other" }] }, { id: "team:b", people: [{ id: "person,1" }] }];

section("Private note map helpers");
test("keys are collision-safe pairs and reads default to empty", () => {
  assert.equal(api.privateNoteKey("team:a", "person,1"), JSON.stringify(["team:a", "person,1"]));
  assert.notEqual(api.privateNoteKey("a,b", "c"), api.privateNoteKey("a", "b,c"));
  assert.equal(api.getPrivateNote({}, "missing", "person"), "");
});
test("set trims a note, returns a new map, and keeps same person IDs in other teams separate", () => {
  const before = { keep: "unchanged" };
  const one = api.setPrivateNote(before, teams, "team:a", "person,1", "  call staff first  ");
  const two = api.setPrivateNote(one.notes, teams, "team:b", "person,1", "ask coordinator");
  assert.equal(one.ok, true);
  assert.equal(api.getPrivateNote(one.notes, "team:a", "person,1"), "call staff first");
  assert.equal(api.getPrivateNote(two.notes, "team:b", "person,1"), "ask coordinator");
  assert.equal(api.getPrivateNote(two.notes, "team:a", "person,1"), "call staff first");
  assert.deepEqual(before, { keep: "unchanged" });
  assert.notEqual(one.notes, before);
});
test("set refuses missing cards and over-limit input without truncating or changing source", () => {
  const before = { untouched: "yes" };
  assert.equal(api.setPrivateNote(before, teams, "bad", "person,1", "x").ok, false);
  const tooLong = api.setPrivateNote(before, teams, "team:a", "other", "🙂".repeat(api.PRIVATE_NOTE_MAX_LENGTH + 1));
  assert.deepEqual(JSON.parse(JSON.stringify(tooLong)), { ok: false, error: "too-long" });
  assert.deepEqual(before, { untouched: "yes" });
});
test("empty note removes one card; team deletion removes only that team's notes", () => {
  const map = { [api.privateNoteKey("team:a", "person,1")]: "a", [api.privateNoteKey("team:a", "other")]: "b", [api.privateNoteKey("team:b", "person,1")]: "c" };
  const one = api.setPrivateNote(map, teams, "team:a", "person,1", "   ");
  assert.equal(api.getPrivateNote(one.notes, "team:a", "person,1"), "");
  const personDeleted = api.deletePrivateNoteForPerson(map, "team:a", "other");
  assert.equal(api.getPrivateNote(personDeleted, "team:a", "other"), "");
  assert.equal(api.getPrivateNote(personDeleted, "team:b", "person,1"), "c");
  const teamDeleted = api.deletePrivateNotesForTeam(map, "team:a");
  assert.equal(api.getPrivateNote(teamDeleted, "team:a", "other"), "");
  assert.equal(api.getPrivateNote(teamDeleted, "team:b", "person,1"), "c");
});
test("normalization drops malformed, stale, non-string, blank, and oversized entries", () => {
  const raw = {
    [api.privateNoteKey("team:a", "person,1")]: "  keep  ",
    [api.privateNoteKey("gone", "person")]: "stale",
    bad: "malformed key",
    [api.privateNoteKey("team:a", "other")]: "🙂".repeat(api.PRIVATE_NOTE_MAX_LENGTH + 1),
    [api.privateNoteKey("team:a", "person,1") + " "]: 7,
    [api.privateNoteKey("team:b", "person,1")]: "   "
  };
  const clean = api.normalizePrivateNotes(raw, teams);
  assert.deepEqual(JSON.parse(JSON.stringify(clean)), { [api.privateNoteKey("team:a", "person,1")]: "keep" });
  assert.deepEqual(JSON.parse(JSON.stringify(api.normalizePrivateNotes([], teams))), {});
});

