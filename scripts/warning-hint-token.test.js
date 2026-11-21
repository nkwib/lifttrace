// Regression: notification permission hint must use the real --warning-text token
// (the nonexistent --warn fell back to #FFB347, 1.78:1 on white).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = read('../src/components/settings/SettingsNotifications.svelte');
const tokens = read('../src/styles/tokens.css');

test('notifications hint uses --warning-text, not --warn', () => {
  assert.doesNotMatch(src, /var\(--warn[,)]/);
  assert.match(src, /color:var\(--warning-text\)/);
});

test('--warning-text is defined in tokens.css', () => {
  assert.match(tokens, /--warning-text:/);
});
