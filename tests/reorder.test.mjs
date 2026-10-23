import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test, section, runQueued } from "./harness.mjs";

const context = vm.createContext({ console, document: { elementFromPoint: () => null }, CSS: { escape: (value) => value }, window: { innerHeight: 800, scrollBy: () => {} } });
vm.runInContext(readFileSync(new URL("../js/reorder.js", import.meta.url), "utf8"), context);
const api = vm.runInContext("({reorderTopicDefs,bindTopicDrag})", context);

section("Topic reorder helpers");
test("reorder moves before/after the target and leaves original array and objects untouched", () => {
  const defs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const after = api.reorderTopicDefs(defs, "a", "b", true);
  const before = api.reorderTopicDefs(defs, "c", "a", false);
  assert.deepEqual(JSON.parse(JSON.stringify(after.map((item) => item.id))), ["b", "a", "c"]);
  assert.deepEqual(JSON.parse(JSON.stringify(before.map((item) => item.id))), ["c", "a", "b"]);
  assert.deepEqual(defs.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(api.reorderTopicDefs(defs, "a", "a"), null);
});
test("invalid lists and unknown/duplicate IDs are rejected", () => {
  assert.equal(api.reorderTopicDefs(null, "a", "b"), null);
  assert.equal(api.reorderTopicDefs([{ id: "a" }, { id: "a" }], "a", "b"), null);
  assert.equal(api.reorderTopicDefs([{ id: "a" }], "x", "a"), null);
  assert.equal(api.reorderTopicDefs([{ id: 1 }, { id: "b" }], "1", "b"), null);
});
test("drag handler requires handle authorization, emits one valid drop, and disposes listeners", () => {
  const listeners = {};
  const root = { addEventListener: (name, fn) => { (listeners[name] ??= new Set()).add(fn); }, removeEventListener: (name, fn) => listeners[name]?.delete(fn) };
  const marks = new Set();
  const tileA = { dataset: { id: "a" }, closest: () => tileA, setAttribute: (name) => marks.add(`a:${name}`), removeAttribute: (name) => marks.delete(`a:${name}`), getBoundingClientRect: () => ({ top: 0, height: 100 }) };
  const tileB = { dataset: { id: "b" }, closest: () => tileB, setAttribute: (name) => marks.add(`b:${name}`), removeAttribute: (name) => marks.delete(`b:${name}`), getBoundingClientRect: () => ({ top: 100, height: 100 }) };
  const handle = { dataset: { id: "a" }, setPointerCapture: () => {}, closest: (selector) => selector.includes("drag-handle") ? handle : tileA };
  root.contains = (node) => node === handle;
  root.querySelectorAll = () => [tileA, tileB];
  root.querySelector = () => tileA;
  const drops = [];
  const dispose = api.bindTopicDrag(root, { canStart: () => true, onDrop: (...args) => drops.push(args) });
  const fire = (name, event) => [...(listeners[name] ?? [])].forEach((fn) => fn(event));
  const down = { target: handle, button: 0, isPrimary: true, pointerId: 1, prevented: false, preventDefault() { this.prevented = true; } };
  fire("pointerdown", down);
  assert.equal(down.prevented, true);
  context.document.elementFromPoint = () => tileB;
  fire("pointermove", { pointerId: 1, clientX: 0, clientY: 180 });
  fire("pointerup", { pointerId: 1 });
  assert.equal(drops.length, 1);
  assert.deepEqual(drops[0].slice(0, 3), ["a", "b", true]);
  fire("pointerup", { pointerId: 1 });
  assert.equal(drops.length, 1);
  dispose();
  assert.equal(listeners.pointerdown.size, 0);
});
test("pointer cancellation never drops and unauthorized handles cannot start", () => {
  const listeners = {};
  const root = { addEventListener: (name, fn) => { (listeners[name] ??= new Set()).add(fn); }, removeEventListener: (name, fn) => listeners[name]?.delete(fn) };
  let drops = 0, captured = 0;
  const tile = { dataset: { id: "a" }, closest: () => tile, setAttribute() {}, removeAttribute() {}, getBoundingClientRect: () => ({ top: 0, height: 100 }) };
  const handle = { dataset: { id: "a" }, setPointerCapture: () => { captured++; }, closest: (selector) => selector.includes("drag-handle") ? handle : tile };
  root.contains = () => true; root.querySelectorAll = () => [tile]; root.querySelector = () => tile;
  const dispose = api.bindTopicDrag(root, { canStart: () => false, onDrop: () => drops++ });
  const fire = (name, event) => [...(listeners[name] ?? [])].forEach((fn) => fn(event));
  fire("pointerdown", { target: handle, button: 0, isPrimary: true, pointerId: 2, preventDefault() {} });
  assert.equal(captured, 0);
  dispose();
  const active = api.bindTopicDrag(root, { canStart: () => true, onDrop: () => drops++ });
  fire("pointerdown", { target: handle, button: 0, isPrimary: true, pointerId: 3, preventDefault() {} });
  fire("pointercancel", { pointerId: 3 });
  fire("pointerup", { pointerId: 3 });
  active();
  assert.equal(drops, 0);
});

