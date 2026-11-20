/**
 * The 30-second sync poll (Android, server mode) ends every pull with
 * 'lt:sync-complete'. Each one used to rerun the whole reminder pass
 * (getPending, cancel, getFrequency twice, listExcusedDays, schedule) even
 * when the pull brought nothing. Only a sync that changed workouts or excused
 * days moves the reminders now (settings come through 'wl:setting').
 * Runs the real notifications.js with Capacitor and the API stubbed
 * (reminder-sync-hooks.mjs).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import test, { mock } from 'node:test';
import { pullKinds } from '../src/lib/sync-refresh.js';

register('./reminder-sync-hooks.mjs', import.meta.url);
globalThis.__rem = {
  today: '2026-11-20',
  settings: { notifWorkoutReminder: true, notifStreakAlert: true, notifRestDay: true },
  calls: { getPending: 0, cancel: 0, schedule: 0, getFrequency: 0, listExcusedDays: 0 },
};
globalThis.window = globalThis.window || new EventTarget();
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.getItem !== 'function') {
  const m = new Map();
  globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const { rescheduleRemindersSoon, scheduleNativeReminders } = await import('../src/lib/notifications.js');

const reset = () => { for (const k in globalThis.__rem.calls) globalThis.__rem.calls[k] = 0; };
const syncEvent = (tables) => {
  // What sync.js sends (result.changed, result.kinds).
  const kinds = pullKinds(tables);
  return new CustomEvent('lt:sync-complete', { detail: { ok: true, tables, changed: kinds.length > 0, kinds } });
};
// The App's wiring: the handler goes straight on the window.
for (const ev of ['lt:training-changed', 'lt:sync-complete', 'lt:watch-saved']) window.addEventListener(ev, rescheduleRemindersSoon);

// One poll every 30 seconds: the 2-second debounce fires between them, and
// the pass it starts (dynamic import of the API included) is let finish.
const settle = () => new Promise(r => setTimeout(r, 30));
async function poll(events) {
  for (const e of events) {
    mock.timers.enable({ apis: ['setTimeout'] });
    try { window.dispatchEvent(e); mock.timers.tick(30000); } finally { mock.timers.reset(); }
    await settle();
  }
}

const N = 20;

test(`${N} syncs that changed nothing run no reminder pass`, async () => {
  reset();
  await poll(Array.from({ length: N }, () => syncEvent({ workouts: 0, excusedDays: 0, settings: 0 })));
  console.log('no-change syncs:', N, 'calls:', JSON.stringify(globalThis.__rem.calls));
  assert.equal(globalThis.__rem.calls.getPending, 0);
  assert.equal(globalThis.__rem.calls.getFrequency, 0);
});

test('a sync that changed only other rows (exercises, chat) leaves the reminders', async () => {
  reset();
  await poll([syncEvent({ exercises: 3 }), syncEvent({ chat: 1 }), syncEvent({ programs: 1 })]);
  assert.equal(globalThis.__rem.calls.getPending, 0);
});

test('a sync that brought workouts or excused days sets them again', async () => {
  reset();
  await poll([syncEvent({ workouts: 1 }), syncEvent({ workoutTombstones: 1 }), syncEvent({ excusedDays: 2 })]);
  assert.equal(globalThis.__rem.calls.getPending, 3);
  assert.equal(globalThis.__rem.calls.getFrequency, 6, 'yesterday and today, each time');
  assert.equal(globalThis.__rem.calls.listExcusedDays, 3);
});

test('training here, the watch, coming back and Track Cardio still set them again', async () => {
  reset();
  await poll([new CustomEvent('lt:training-changed'), new CustomEvent('lt:watch-saved')]);
  assert.equal(globalThis.__rem.calls.getPending, 2);
  reset();
  mock.timers.enable({ apis: ['setTimeout'] });
  try { rescheduleRemindersSoon(); mock.timers.tick(2000); } finally { mock.timers.reset(); }
  await settle();
  assert.equal(globalThis.__rem.calls.getPending, 1, 'no argument (resume, cardioEnabled): always');
});

test('an event without kinds counts when it says it changed rows', async () => {
  reset();
  await poll([new CustomEvent('lt:sync-complete', { detail: { changed: false } }), new CustomEvent('lt:sync-complete', { detail: { changed: true } })]);
  assert.equal(globalThis.__rem.calls.getPending, 1);
});

test('App: reminders are not awaited before the sign-in check', () => {
  const app = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /await scheduleNativeReminders\(\)/);
  const at = (s) => { const i = app.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at("import('./lib/notifications.js').then(({ scheduleNativeReminders, rescheduleRemindersSoon })") < at('await loadAuthState(); } finally { authLoaded = true; }'));
});
