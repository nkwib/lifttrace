// Body Stats sheet: strings come from en.json, and closing with typed values asks first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const src = fs.readFileSync('src/components/diary/BodyStats.svelte', 'utf8');
const lookup = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), en);

test('every key used resolves, including ALL_STATS labelKeys', () => {
  const keys = [...src.matchAll(/\$_\('([a-z0-9_.]+)'/g)].map((m) => m[1]);
  keys.push(...[...src.matchAll(/labelKey: '([a-z0-9_.]+)'/g)].map((m) => m[1]));
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.equal(typeof lookup(k), 'string', k);
});

test('no bare English literals remain', () => {
  assert.doesNotMatch(src, /label: '/);
  assert.doesNotMatch(src, />Body Stats</);
  assert.doesNotMatch(src, /aria-label="Close"|title="Close"/);
  assert.doesNotMatch(src, /'Saving…'|'Save'/);
  assert.doesNotMatch(src, /No measurements enabled/);
  assert.match(src, /\$_\(stat\.labelKey\)/);
});

test('body fat label has no unit of its own', () => {
  assert.doesNotMatch(lookup('diary_extra.body_stats_body_fat'), /%/);
  assert.match(src, /bodyFat.*diary_extra\.body_stats_body_fat/);
});

test('backdrop, close button, back and timeline link go through the guarded close', () => {
  assert.match(src, /class="sheet-backdrop" on:click=\{\(\) => close\(\)\} use:closeOnBack=\{\(\) => close\(\)\}/);
  assert.match(src, /class="sheet-close" on:click=\{\(\) => close\(\)\}/);
  assert.match(src, /close\(\(\) => push\('\/progress'\)\)/);
  assert.match(src, /if \(closing \|\| saving\) return;/);
  assert.match(src, /if \(touched\.size > 0\)/);
  assert.match(src, /if \(!ok \|\| !open\) return;/);
});

test('a successful save clears touched and closes without the guard', () => {
  assert.match(src, /touched\.clear\(\);\s+open = false;/);
});
