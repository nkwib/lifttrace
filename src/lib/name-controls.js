// Gives unnamed settings controls (switch, select, text/number input) an
// accessible name from their row label via aria-labelledby. Rows are
// hand-written in many shapes, so this resolves the label generically.
const CONTROLS = 'button[role="switch"], select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])';
const ROWS = '.setting-row, .row';
const LABELS = '.setting-label, .label-main, .row-label';

let seq = 0;

function hasName(el) {
  return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ||
    !!(el.id && el.ownerDocument.querySelector(`label[for="${el.id}"]`)) ||
    !!el.closest('label') ||
    (el.tagName === 'BUTTON' && el.textContent.trim() !== '');
}

export function findLabel(el) {
  let row = el.closest(ROWS);
  while (row) {
    for (const cand of row.querySelectorAll(LABELS)) {
      if (!cand.contains(el) && cand.textContent.trim()) return cand;
    }
    row = row.parentElement && row.parentElement.closest(ROWS);
  }
  return null;
}

export function nameControls(root) {
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (hasName(el)) continue;
    const label = findLabel(el);
    if (!label) continue;
    if (!label.id) label.id = `ctl-lbl-${++seq}`;
    el.setAttribute('aria-labelledby', label.id);
  }
}

// Svelte action: names controls now and whenever the subtree changes.
export function autoNameControls(node) {
  let queued = false;
  const run = () => { queued = false; nameControls(node); };
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(run); } };
  run();
  const mo = new MutationObserver(schedule);
  mo.observe(node, { childList: true, subtree: true });
  return { destroy() { mo.disconnect(); } };
}
