import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldHoldScreen as hold } from '../src/lib/wake-policy.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('policy: needs setting, a logged set, unfinished, and the active day', () => {
  assert.equal(hold(true, true, false, true), true);
  assert.equal(hold(false, true, false, true), false);
  assert.equal(hold(true, false, false, true), false);
  assert.equal(hold(true, true, true, true), false);
  assert.equal(hold(true, true, false, false), false);
});

test('Diary uses the policy, releases only its own lock, no mount-time enable', () => {
  const d = read('../src/routes/Diary.svelte');
  assert.match(d, /from '\.\.\/lib\/wake-policy\.js'/);
  assert.match(d, /\$: syncWakeLock\(wantWake\)/);
  assert.match(d, /if \(tookWakeLock\) \{ tookWakeLock = false; disableWakeLock\(\); \}/);
  assert.match(d, /on:click=\{onWakeToggle\}/);
  assert.doesNotMatch(d, /Auto-enable wake lock/);
});

test('policy module is pure and the default is on', () => {
  assert.doesNotMatch(read('../src/lib/wake-policy.js'), /import /);
  assert.match(read('../src/stores/settings.js'), /createSettingStore\('screenKeepAwake',\s+true\)/);
});
