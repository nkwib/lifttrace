/**
 * Dev-time: rebuild public/fonts/material-symbols-rounded.woff2 as a subset of
 * Material Symbols Rounded holding only the icons the app uses (axes pinned to
 * FILL 0, wght 400, GRAD 0, opsz 24, matching src/styles/base.css).
 *
 * Needs Python with fontTools and brotli (`pip install fonttools brotli`). The
 * build and CI never run this; they only use the committed output.
 *
 * Usage: node scripts/subset-icon-font.mjs [--source <full.woff2>]
 *   Without --source, the full font is downloaded from the pinned upstream commit.
 * Run it whenever you add an icon. It rewrites icons-all.txt (every ligature in
 * the source font), icons-included.txt and the woff2.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ALL_FILE, INCLUDED_FILE, FONT_FILE, ROOT, neededIcons, readList } from './lib/icon-scan.mjs';

const UPSTREAM_SHA = '10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7';
const UPSTREAM_URL = `https://raw.githubusercontent.com/google/material-design-icons/${UPSTREAM_SHA}/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.woff2`;
const PY = process.env.PYTHON || 'python3';
const HELPER = path.join(ROOT, 'scripts/subset-icon-font.py');

const run = (...args) => {
  const r = spawnSync(PY, ['-I', HELPER, ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-font-'));
let source;
const i = process.argv.indexOf('--source');
if (i > 0) source = path.resolve(process.argv[i + 1]);
else {
  source = path.join(tmp, 'full.woff2');
  const res = await fetch(UPSTREAM_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.writeFileSync(source, Buffer.from(await res.arrayBuffer()));
}

run('list', source, ALL_FILE);
const icons = neededIcons(readList(ALL_FILE));
fs.writeFileSync(INCLUDED_FILE, icons.join('\n') + '\n');
run('subset', source, INCLUDED_FILE, FONT_FILE);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${icons.length} icons, ${(fs.statSync(FONT_FILE).size / 1024).toFixed(0)} KB`);
