// Local usage branch must count distinct days per exercise across sessions
// (parity with server/routes/exercises.js).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'api-native.js'), 'utf8');
const startMarker = "if (id === 'usage' && m === 'GET') {";
const start = src.indexOf(startMarker);
const end = src.indexOf("if (id === 'sources' && sub === 'list')");
const branch = src.slice(start, end);

test('seenOnDate is declared before the rows loop and keyed by exercise:date', () => {
  assert.ok(start > 0 && end > start);
  const decl = branch.indexOf('const seenOnDate = new Set()');
  assert.ok(decl >= 0);
  assert.ok(decl < branch.indexOf('for (const row of rows)'));
  assert.match(branch, /`\$\{k\}:\$\{row\.date\}`/);
});

test('behavior: same-day sessions count once, other date adds one', async () => {
  const body = branch.slice(startMarker.length).replace(/\}\s*$/, '');
  const ex = { exercise_id: 5, sets: [{ completed: true }] };
  const rows = [
    { date: '2026-02-02', exercises: JSON.stringify([ex]) },
    { date: '2026-02-02', exercises: JSON.stringify([ex]) },
    { date: '2026-02-01', exercises: JSON.stringify([ex]) },
  ];
  const fn = new Function('dbQuery', 'ME', `return (async () => {${body}})();`);
  const out = await fn(async () => rows, 1);
  assert.deepStrictEqual(out, { 5: { count: 2, last_date: '2026-02-02' } });
});
