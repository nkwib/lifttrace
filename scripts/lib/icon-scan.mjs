// Shared by scripts/subset-icon-font.mjs and scripts/icon-font-coverage.test.js.
// Generous scan: every [a-z][a-z0-9_]* token in the app sources, intersected with
// the full ligature list (public/fonts/icons-all.txt). Catches ternaries, `icon:`
// fields and name maps without parsing dynamic code. Over-inclusion costs bytes only.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export const ALL_FILE = path.join(ROOT, 'public/fonts/icons-all.txt');
export const INCLUDED_FILE = path.join(ROOT, 'public/fonts/icons-included.txt');
export const FONT_FILE = path.join(ROOT, 'public/fonts/material-symbols-rounded.woff2');
export const REGEN_CMD = 'node scripts/subset-icon-font.mjs';

// Icon names that never appear as literal tokens in the sources. Keep empty unless needed.
export const SAFETY_ALLOWLIST = [];

const EXTS = new Set(['.svelte', '.js', '.json']);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXTS.has(path.extname(e.name))) yield p;
  }
}

export function readList(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
}

export function scanTokens() {
  const files = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'index.html')];
  const tokens = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/[a-z][a-z0-9_]*/g)) tokens.add(m[0]);
  }
  return tokens;
}

/** Icon names the app needs: scanned tokens that are real ligatures, plus the allowlist. */
export function neededIcons(all) {
  const allSet = new Set(all);
  const out = new Set(SAFETY_ALLOWLIST);
  for (const t of scanTokens()) if (allSet.has(t)) out.add(t);
  return [...out].sort();
}
