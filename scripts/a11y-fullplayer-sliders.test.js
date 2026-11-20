import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/radio/FullPlayer.svelte', 'utf8');

test('FullPlayer seek and volume bars are keyboard sliders', () => {
  for (const cls of ['fp-progress-wrap', 'fp-volume']) {
    const tag = src.match(new RegExp(`<div class="${cls}"[^>]*>`))[0];
    assert.match(tag, /role="slider"/);
    assert.match(tag, /aria-valuenow=/);
    assert.match(tag, /on:keydown=/);
    assert.match(tag, /aria-label=/);
  }
  assert.match(src, /Number\.isFinite\(\$duration\)/);
  assert.ok(!/svelte-ignore a11y-no-static-element-interactions -->\s*<div class="fp-(progress-wrap|volume)"/.test(src));
});
