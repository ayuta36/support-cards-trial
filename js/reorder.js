/* Pure topic ordering and pointer-drag binding. The app owns authorization,
   state changes, and persistence; an accepted drop calls onDrop once. */
"use strict";

function reorderTopicDefs(defs, activeId, targetId, after = false) {
  if (!Array.isArray(defs) || typeof activeId !== "string" || typeof targetId !== "string") return null;
  const ids = defs.map((def) => def && def.id);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) return null;
  const from = ids.indexOf(activeId), target = ids.indexOf(targetId);
  if (from < 0 || target < 0 || from === target) return null;
  const out = defs.slice(), [item] = out.splice(from, 1);
  const targetAfterRemoval = out.findIndex((def) => def.id === targetId);
  out.splice(targetAfterRemoval + (after ? 1 : 0), 0, item);
  return out.every((def, index) => def === defs[index]) ? null : out;
}

function bindTopicDrag(root, { onDrop, canStart = () => true, itemSelector = "[data-topic-item]", handleSelector = "[data-topic-drag-handle]", edgeSize = 64 } = {}) {
  if (!root || typeof onDrop !== "function") return () => {};
  let drag = null;
  const tileFor = (node) => node && node.closest ? node.closest(itemSelector) : null;
  const clearMarks = () => root.querySelectorAll(`${itemSelector}[data-dragging], ${itemSelector}[data-drag-over]`).forEach((el) => {
    el.removeAttribute("data-dragging"); el.removeAttribute("data-drag-over");
  });
  const cancel = () => { drag = null; clearMarks(); };
  const onDown = (event) => {
    const handle = event.target && event.target.closest ? event.target.closest(handleSelector) : null;
    if (!handle || !root.contains(handle) || event.button !== 0 || !event.isPrimary) return;
    const tile = tileFor(handle), id = handle.dataset.id || (tile && tile.dataset.id);
    if (!tile || !id || !canStart(id, event)) return;
    drag = { id, pointerId: event.pointerId, handle, targetId: null, after: false };
    try { handle.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  };
  const onMove = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const hit = document.elementFromPoint ? document.elementFromPoint(event.clientX, event.clientY) : null;
    const tile = tileFor(hit);
    clearMarks();
    if (tile && tile.dataset.id && tile.dataset.id !== drag.id) {
      const rect = tile.getBoundingClientRect();
      drag.targetId = tile.dataset.id;
      drag.after = event.clientY >= rect.top + rect.height / 2;
      tile.setAttribute("data-drag-over", "true");
    } else drag.targetId = null;
    root.querySelector(`${itemSelector}[data-id="${CSS.escape(drag.id)}"]`)?.setAttribute("data-dragging", "true");
    const y = event.clientY, height = window.innerHeight;
    if (y < edgeSize) window.scrollBy?.(0, -Math.max(1, Math.ceil((edgeSize - y) / 5)));
    else if (y > height - edgeSize) window.scrollBy?.(0, Math.max(1, Math.ceil((y - (height - edgeSize)) / 5)));
  };
  const onUp = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag; drag = null; clearMarks();
    if (current.targetId) onDrop(current.id, current.targetId, current.after, event);
  };
  const onCancel = (event) => { if (drag && (event.pointerId === undefined || drag.pointerId === event.pointerId)) cancel(); };
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onCancel);
  root.addEventListener("lostpointercapture", onCancel);
  return () => {
    cancel();
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerup", onUp);
    root.removeEventListener("pointercancel", onCancel);
    root.removeEventListener("lostpointercapture", onCancel);
  };
}
