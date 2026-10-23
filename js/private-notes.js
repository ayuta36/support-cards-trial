/* Pure transforms for private viewer notes. The app persists the returned map
   inside its existing encrypted envelope; this module performs no I/O. */
"use strict";

const PRIVATE_NOTE_MAX_LENGTH = 1000;
// Unsaved notes stay in memory only. lockNow() clears these with the rendered DOM.
const privateNoteDrafts = new Map();

function privateNoteKey(teamId, personId) {
  if (typeof teamId !== "string" || !teamId || typeof personId !== "string" || !personId) return null;
  return JSON.stringify([teamId, personId]);
}

function getPrivateNote(notes, teamId, personId) {
  const key = privateNoteKey(teamId, personId);
  return key && notes && typeof notes[key] === "string" ? notes[key] : "";
}

function privateNoteDraftKey(teamId, personId) { return privateNoteKey(teamId, personId); }
function getPrivateNoteDraft(notes, teamId, personId) {
  const key = privateNoteDraftKey(teamId, personId);
  return key && privateNoteDrafts.has(key) ? privateNoteDrafts.get(key) : getPrivateNote(persistedPrivateNotes, teamId, personId);
}
function setPrivateNoteDraft(teamId, personId, text) {
  const key = privateNoteDraftKey(teamId, personId);
  if (!key || typeof text !== "string") return false;
  if (text === getPrivateNote(persistedPrivateNotes, teamId, personId)) privateNoteDrafts.delete(key);
  else privateNoteDrafts.set(key, text);
  return true;
}
function privateNoteDraftDirty(teamId, personId) {
  const key = privateNoteDraftKey(teamId, personId);
  return !!key && privateNoteDrafts.has(key);
}
function clearPrivateNoteDraft(teamId, personId) {
  const key = privateNoteDraftKey(teamId, personId);
  if (key) privateNoteDrafts.delete(key);
}
function clearPrivateNoteDrafts() { privateNoteDrafts.clear(); }

function privateNoteCardExists(teams, teamId, personId) {
  return Array.isArray(teams) && teams.some((team) => team && team.id === teamId &&
    Array.isArray(team.people) && team.people.some((person) => person && person.id === personId));
}

function privateNoteMap(notes) {
  return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
}

function setPrivateNote(notes, teams, teamId, personId, text) {
  const key = privateNoteKey(teamId, personId);
  if (!key || !privateNoteCardExists(teams, teamId, personId) || typeof text !== "string") return { ok: false, error: "card" };
  const value = text.trim();
  if (Array.from(value).length > PRIVATE_NOTE_MAX_LENGTH) return { ok: false, error: "too-long" };
  const next = { ...privateNoteMap(notes) };
  if (value) next[key] = value;
  else delete next[key];
  return { ok: true, notes: next, value };
}

function deletePrivateNoteForPerson(notes, teamId, personId) {
  const key = privateNoteKey(teamId, personId), next = { ...privateNoteMap(notes) };
  if (key) delete next[key];
  return next;
}

function deletePrivateNotesForTeam(notes, teamId) {
  if (typeof teamId !== "string" || !teamId) return { ...privateNoteMap(notes) };
  const next = {};
  for (const [key, value] of Object.entries(privateNoteMap(notes))) {
    let tuple;
    try { tuple = JSON.parse(key); } catch { tuple = null; }
    if (!Array.isArray(tuple) || tuple.length !== 2 || tuple[0] !== teamId) next[key] = value;
  }
  return next;
}

function normalizePrivateNotes(raw, teams) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    let tuple;
    try { tuple = JSON.parse(key); } catch { continue; }
    if (!Array.isArray(tuple) || tuple.length !== 2 || typeof tuple[0] !== "string" || typeof tuple[1] !== "string") continue;
    if (!privateNoteCardExists(teams, tuple[0], tuple[1])) continue;
    const note = value.trim();
    if (Array.from(note).length > PRIVATE_NOTE_MAX_LENGTH) continue;
    if (note) clean[privateNoteKey(tuple[0], tuple[1])] = note;
  }
  return clean;
}
