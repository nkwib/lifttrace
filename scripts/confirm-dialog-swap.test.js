import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const en = JSON.parse(read('src/i18n/en.json'));
const files = ['src/routes/Profile.svelte', 'src/components/settings/SettingsAuth.svelte'];

for (const f of files) {
  test(`${f} uses confirmDialog, no native confirm/prompt`, () => {
    const src = strip(read(f));
    assert.doesNotMatch(src, /(?<![.\w])(confirm|prompt)\(/);
    assert.match(src, /import \{ confirmDialog \} from '[./]+\/stores\/confirmDialog\.js'/);
    assert.match(src, /dangerous: true/);
  });
}

test('confirm dialog i18n keys exist', () => {
  for (const k of ['unlink_confirm_title', 'unlink_confirm_message', 'unlink_confirm_confirm']) {
    assert.ok(en.profile[k], k);
  }
  for (const k of ['delete_provider', 'delete_provider_title', 'delete_provider_confirm',
    'disable_password', 'disable_password_title', 'disable_password_confirm']) {
    assert.ok(en.settings_auth.confirm[k], k);
  }
});

test('togglePasswordLogin keeps short-circuit and reverts toggle on cancel', () => {
  const src = read('src/components/settings/SettingsAuth.svelte');
  assert.match(src, /if \(!next && !await confirmDialog\(/);
  assert.match(src, /enablePasswordLogin = true;\s*return;/);
});
