import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activateOnKey } from '../src/lib/a11y.js';

function ev(key, extra = {}) {
  const el = {};
  const e = { key, target: el, currentTarget: el, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
  return e;
}

test('activateOnKey fires on Enter and Space, prevents default', () => {
  for (const k of ['Enter', ' ']) {
    let n = 0;
    const e = ev(k);
    activateOnKey(e, () => n++);
    assert.equal(n, 1);
    assert.ok(e.prevented);
  }
});

test('activateOnKey ignores nested targets, repeats, modifiers, other keys', () => {
  const cases = [
    ev('Enter', { target: {} }),
    ev('Enter', { repeat: true }),
    ev(' ', { ctrlKey: true }),
    ev('a'),
  ];
  for (const e of cases) {
    let n = 0;
    activateOnKey(e, () => n++);
    assert.equal(n, 0);
    assert.ok(!e.prevented);
  }
});

test('every role="button" div in the touched files has a keydown handler', () => {
  const files = ['src/routes/Radio.svelte', 'src/components/radio/FullPlayer.svelte', 'src/routes/ProgramDetail.svelte', 'src/components/ai/Trace.svelte'];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let i = -1;
    while ((i = src.indexOf('role="button"', i + 1)) !== -1) {
      const open = src.slice(src.lastIndexOf('<div', i), i);
      if (open.includes('<button')) continue;
      assert.match(open, /on:keydown=/, `${f}: role=button div without on:keydown at offset ${i}`);
    }
  }
});

test('profile avatar is a labelled button', () => {
  const src = readFileSync('src/routes/Profile.svelte', 'utf8');
  assert.match(src, /<button type="button" class="avatar-wrap"[^>]*aria-label=\{\$_\('profile\.change_avatar'\)\}/);
});

test('activateOnKey callbacks are not double-wrapped (would never call the handler)', () => {
  for (const f of ['src/routes/Radio.svelte', 'src/components/radio/FullPlayer.svelte', 'src/routes/ProgramDetail.svelte']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /activateOnKey\(e, \(\) => \(\) =>/, f);
  }
});
