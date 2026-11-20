/**
 * A debounced settings PUT that the server refuses (5xx, 400) tells the user
 * once per 30s; a 401 (session-ended UI), a network throw (offline queue) and
 * success stay silent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window ??= { navigator: { language: 'en' }, location: { origin: 'http://localhost', protocol: 'http:', hostname: 'localhost' }, addEventListener() {}, dispatchEvent() {}, localStorage: globalThis.localStorage };
globalThis.CustomEvent ??= class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };

const { scheduleSave, _resetSaveFailThrottle } = await import('../src/stores/settings.js');
globalThis.document ??= { documentElement: { setAttribute() {} } };
const { toasts } = await import('../src/stores/toast.js');
const { get } = await import('svelte/store');
const { addMessages, init, waitLocale } = await import('svelte-i18n');
const { readFileSync } = await import('node:fs');
const msgs = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
addMessages('xx', msgs); // 'en' has a json loader node cannot run
init({ fallbackLocale: 'xx', initialLocale: 'xx' });
await waitLocale('xx');

const count = () => get(toasts).filter((t) => t.type === 'error').length;
async function save(key, behaviour) {
  globalThis.fetch = async () => {
    if (behaviour === 'throw') throw new TypeError('offline');
    return { ok: behaviour === 200, status: behaviour };
  };
  scheduleSave(key, 1);
  await new Promise((r) => setTimeout(r, 700));
  await new Promise((r) => setTimeout(r, 50));
}

test('settings save failure feedback', async () => {
  localStorage.setItem('wl:userId', '1');
  const base = count();
  await save('weightUnit', 200);
  await save('weightUnit', 401);
  await save('weightUnit', 'throw');
  assert.equal(count(), base);
  await save('weightUnit', 500);
  assert.equal(count(), base + 1);
  await save('dateFormat', 400);
  assert.equal(count(), base + 1, 'throttled');
  _resetSaveFailThrottle();
  await save('dateFormat', 'throw');
  assert.equal(count(), base + 1, 'throw is silent');
  await save('dateFormat', 500);
  assert.equal(count(), base + 2);
});
