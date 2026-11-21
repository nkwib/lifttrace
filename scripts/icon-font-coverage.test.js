import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ALL_FILE, INCLUDED_FILE, FONT_FILE, REGEN_CMD, neededIcons, readList } from './lib/icon-scan.mjs';

// The icon font is a subset (see scripts/subset-icon-font.mjs). A missing icon
// renders as raw text, so every icon name the sources mention must be in it.

test('every icon name used in the sources is in the subset font', () => {
  const included = new Set(readList(INCLUDED_FILE));
  const missing = neededIcons(readList(ALL_FILE)).filter((n) => !included.has(n));
  assert.deepEqual(missing, [], `icons missing from the font: ${missing.join(', ')}. Run \`${REGEN_CMD}\` and commit public/fonts/.`);
});

test('icons-included.txt only lists real ligature names', () => {
  const all = new Set(readList(ALL_FILE));
  assert.deepEqual(readList(INCLUDED_FILE).filter((n) => !all.has(n)), []);
});

test('the shipped font is the subset, not the 5 MB full font', () => {
  assert.ok(fs.statSync(FONT_FILE).size < 500 * 1024, `font is ${fs.statSync(FONT_FILE).size} bytes; run \`${REGEN_CMD}\``);
});
