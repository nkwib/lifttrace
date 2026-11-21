import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('icon-only buttons in Profile and NativeSetup are labelled', () => {
  const profile = read('src/routes/Profile.svelte');
  const native = read('src/routes/NativeSetup.svelte');
  assert.match(profile, /class="btn-icon back-btn".{0,80}aria-label=\{\$_\('common\.back'\)\}/);
  for (const src of [profile, native]) {
    assert.match(src, /class="pw-toggle".{0,80}aria-label=\{\$_\(showPw \? 'common\.hide_password' : 'common\.show_password'\)\}.{0,10}aria-pressed=\{showPw\}/);
  }
});

test('password toggle keys exist in every locale', () => {
  for (const l of ['en', 'es', 'it', 'ru', 'zh-Hans']) {
    const c = JSON.parse(read(`src/i18n/${l}.json`)).common;
    assert.ok(c.show_password && c.hide_password && c.back, l);
  }
});
