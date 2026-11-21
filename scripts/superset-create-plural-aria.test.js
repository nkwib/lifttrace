import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('create_confirm has an ICU plural in en/es/it/ru', () => {
  for (const l of ['en', 'es', 'it', 'ru']) {
    const j = JSON.parse(readFileSync(`src/i18n/${l}.json`, 'utf8'));
    const s = Object.values(j).map(v => v && v.create_confirm).find(Boolean);
    assert.match(s, /\{count, plural, one \{# [^}]+\} other \{# [^}]+\}\}/, l);
  }
});
test('superset remove button has aria-label', () => {
  const src = readFileSync('src/components/diary/SupersetCard.svelte', 'utf8');
  const m = src.match(/<button class="ss-remove-btn[^\n]*/)[0];
  assert.match(m, /aria-label=\{\$_\('superset_card\.remove'\)\}/);
});
