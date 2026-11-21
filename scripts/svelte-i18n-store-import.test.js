import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

test('every .svelte file using the $_ store imports _ from svelte-i18n', () => {
  const bad = [];
  for (const f of walk('src')) {
    const s = fs.readFileSync(f, 'utf8');
    if (!/\$_(?![\w$])/.test(s)) continue;
    if (!/import\s*\{[^}]*\b_\b[^}]*\}\s*from\s*['"]svelte-i18n['"]/.test(s)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});
