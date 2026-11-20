import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = (p) => readFileSync(p, 'utf8');
const GUARD = /e\.target === e\.currentTarget && \(e\.key === 'Enter' \|\| e\.key === ' '\)/;

for (const [name, file, cls] of [
  ['ExerciseCard', 'src/components/diary/ExerciseCard.svelte', 'ex-header'],
  ['SupersetCard', 'src/components/diary/SupersetCard.svelte', 'superset-header'],
]) {
  test(`${name} header is keyboard operable`, () => {
    const s = r(file);
    const tag = s.match(new RegExp(`<div class="${cls}"[\\s\\S]*?>\\n`))[0];
    assert.match(tag, /role="button"/);
    assert.match(tag, /tabindex="0"/);
    assert.match(tag, /aria-expanded=\{expanded\}/);
    assert.match(tag, GUARD);
    assert.match(tag, /preventDefault/);
    assert.match(s, new RegExp(`\\.${cls}:focus-visible`));
  });
}

test('SupersetCard header has no svelte-ignore; remove button stops propagation', () => {
  const s = r('src/components/diary/SupersetCard.svelte');
  assert.doesNotMatch(s, /svelte-ignore/);
  assert.match(s, /ss-remove-btn[^>]*on:click\|stopPropagation/);
});

test('ExerciseCard keeps contextmenu', () => {
  assert.match(r('src/components/diary/ExerciseCard.svelte'), /on:contextmenu\|preventDefault/);
});

test('SetRow closes popovers on window Escape', () => {
  const s = r('src/components/diary/SetRow.svelte');
  assert.match(s, /<svelte:window on:keydown=\{onWindowKeydown\}/);
  assert.match(s, /e\.key !== 'Escape' \|\| !\(numOpen \|\| rpeOpen\)/);
});

test('MiniPlayer is keyboard operable with target guard', () => {
  const s = r('src/components/radio/MiniPlayer.svelte');
  const tag = s.match(/<div class="mini-player"[\s\S]*?>\n/)[0];
  assert.match(tag, /role="button"/);
  assert.match(tag, /tabindex="0"/);
  assert.match(tag, GUARD);
  assert.match(s, /\.mini-player:focus-visible/);
});
