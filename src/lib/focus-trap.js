// Keyboard behaviour for overlay layers (Sheet, Dialog, ActionSheet): Escape
// closes, Tab wraps inside, focus moves in on open and returns on close.

/** Next index when tabbing through `count` items. `current` -1 = none focused. */
export function nextFocusIndex(count, current, shift) {
  if (!count) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  if (shift) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

const FOCUSABLE =
  'a[href],button,input,select,textarea,summary,[contenteditable="true"],[tabindex]';

function focusables(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.disabled || el.hidden || el.getAttribute('tabindex') === '-1') return false;
    if (el.type === 'hidden') return false;
    return !el.closest('[hidden],[inert]');
  });
}

/**
 * Svelte action for the layer node (put after use:portal).
 * opts: { onEscape?: () => void, initial?: string } (`initial` is a selector
 * for the element to focus first). The first child is the panel and takes
 * focus when nothing better exists (no soft keyboard popping on touch).
 */
export function trapFocus(node, opts = {}) {
  let o = opts || {};
  const saved = document.activeElement;

  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return;
      e.stopPropagation();
      e.preventDefault();
      if (typeof o.onEscape === 'function') o.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(node);
    if (!items.length) { e.preventDefault(); return; }
    const i = items.indexOf(document.activeElement);
    const next = nextFocusIndex(items.length, i, e.shiftKey);
    // Only take over at the edges (or when focus is outside the list).
    const atEdge = i < 0 || (e.shiftKey ? i === 0 : i === items.length - 1);
    if (atEdge) { e.preventDefault(); items[next].focus(); }
  }
  node.addEventListener('keydown', onKeydown);

  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 0);
  let alive = true;
  raf(() => {
    if (!alive || node.contains(document.activeElement)) return;
    let target = o.initial ? node.querySelector(o.initial) : null;
    if (!target) target = node.querySelector('[autofocus]');
    if (!target) {
      const panel = node.firstElementChild;
      if (panel) {
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        panel.style.outline = 'none';
        target = panel;
      }
    }
    if (target) target.focus({ preventScroll: true });
  });

  return {
    update(next) { o = next || {}; },
    destroy() {
      alive = false;
      node.removeEventListener('keydown', onKeydown);
      const a = document.activeElement;
      const idle = !a || a === document.body || node.contains(a);
      if (idle && saved && saved.isConnected && typeof saved.focus === 'function') {
        saved.focus({ preventScroll: true });
      }
    },
  };
}
