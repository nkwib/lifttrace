import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Toast clears the workout pill via --wm-h', () => {
  const toast = read('src/components/ui/Toast.svelte');
  assert.match(toast, /var\(--wm-h, 0px\)/);
  assert.match(toast, /var\(--bottom-overlays, 0px\)/);
});

test('WorkoutModeBar sets and clears --wm-h', () => {
  const bar = read('src/components/WorkoutModeBar.svelte');
  assert.match(bar, /setProperty\('--wm-h', on \? '54px' : '0px'\)/);
  assert.match(bar, /\$: _setHeightVar\(visible\)/);
  assert.match(bar, /onDestroy\(\(\) => _setHeightVar\(false\)\)/);
  assert.doesNotMatch(bar, /bottom:[^;]*--wm-h/);
});

test('--wm-h stays out of --bottom-overlays', () => {
  assert.doesNotMatch(read('src/styles/tokens.css'), /--wm-h/);
});
