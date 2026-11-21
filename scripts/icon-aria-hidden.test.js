import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// two-step components are hash-pinned and exempt.
function svelteFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'two-step' ? [] : svelteFiles(p);
    return p.endsWith('.svelte') ? [p] : [];
  });
}

test('icon ligature spans inside controls are aria-hidden', () => {
  const tag = /<(?:span|i)\b[^<>]*?(?:material-symbols-(?:rounded|outlined)|material-icons)[^<>]*>/g;
  const bad = [];
  for (const f of svelteFiles('src')) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<(button|a)\b[^<>]*>[\s\S]*?<\/\1>/g)) {
      for (const t of m[0].match(tag) || []) {
        if (!t.includes('aria-hidden')) bad.push(`${f}: ${t}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('icon-only buttons and links keep an accessible name', () => {
  const bad = [];
  for (const f of svelteFiles('src')) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<(button|a)\b([^<>]*)>\s*<span[^<>]*material-[^<>]*>[^<]*<\/span>\s*<\/\1>/g)) {
      if (!/aria-label|title=|aria-labelledby/.test(m[2])) bad.push(`${f}: ${m[0].replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(bad, []);
});
