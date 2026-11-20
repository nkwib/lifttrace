import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/Wizard.svelte', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);

test('toggle pill is a labelled switch', () => {
  assert.match(src, /class="toggle-pill"[^>]*role="switch"[^>]*aria-checked=/);
  assert.match(src, /class="toggle-pill"[^>]*aria-label=/);
});

test('users step submits via form, Enter works', () => {
  assert.match(src, /<form id="wiz-users-form"[^>]*on:submit\|preventDefault=\{nextFromUsers\}/);
  assert.match(src, /type="submit"/);
  assert.match(src, /if \(umLoading\) return;/);
});

test('errors announced, unit cards pressed', () => {
  assert.match(src, /class="um-error" role="alert"/);
  assert.match(src, /aria-pressed=\{unitSystem === 'metric'\}/);
  assert.match(src, /aria-pressed=\{unitSystem === 'imperial'\}/);
});

test('no hardcoded English literals', () => {
  assert.doesNotMatch(src, /You're All Set/);
  assert.doesNotMatch(src, /imported, \$\{failed\} failed/);
  assert.doesNotMatch(src, /placeholder="Your name/);
});

test('wizard keys exist', () => {
  for (const k of ['wizard.done.title', 'wizard.done.sub', 'wizard.library.partial', 'wizard.users.name_placeholder', 'wizard.step_status', 'common.errors.cant_reach_server'])
    assert.equal(typeof get(en, k), 'string', k);
});
