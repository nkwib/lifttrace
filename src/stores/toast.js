import { writable } from 'svelte/store';

export const toasts = writable([]);

let _id = 0;

const ACTION_MS = 6000;

/** action: optional { label, onClick }. A toast with an action lives longer,
 *  closes when the action is clicked, and replaces an earlier action toast. */
export function showToast(message, duration = 3000, type = 'default', action = null) {
  const id = ++_id;
  const dismiss = () => toasts.update(list => list.filter(t => t.id !== id));
  const act = action && typeof action.onClick === 'function'
    ? { label: action.label, onClick: () => { dismiss(); action.onClick(); } }
    : null;
  toasts.update(list => [...(act ? list.filter(t => !t.action) : list), { id, message, type, action: act }]);
  setTimeout(dismiss, act ? Math.max(duration, ACTION_MS) : duration);
}

export function showSuccess(msg) { showToast(msg, 2500, 'success'); }
export function showError(msg)   { showToast(msg, 4000, 'error'); }
