import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const md = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const start = md.indexOf('## [Unreleased]');
const rest = md.slice(start + 1);
const sec = rest.slice(0, rest.search(/^## /m));

test('Unreleased has Added, Changed, Fixed once each, in order', () => {
  const heads = [...sec.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['Added', 'Changed', 'Fixed']);
});

test('no blank lines between bullets in Unreleased', () => {
  const lines = sec.split('\n');
  lines.forEach((l, i) => {
    if (l === '' && lines[i - 1]?.startsWith('- ') && lines[i + 1]?.startsWith('- ')) {
      assert.fail(`blank line between bullets at Unreleased line ${i + 1}`);
    }
  });
});

test('Undo toast fix is under Fixed', () => {
  const fixed = sec.slice(sec.indexOf('### Fixed'));
  assert.match(fixed, /Undo toast no longer covers the workout pill/);
});
