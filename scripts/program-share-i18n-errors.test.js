import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProgramShare, ProgramShareError } from '../src/lib/programShare.js';

const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const src = readFileSync(new URL('../src/lib/programShare.js', import.meta.url), 'utf8');
const ok = { format: 'lifttrace-program', version: 1, program: { name: 'P', templates: [] } };

test('parse failures carry a stable code', () => {
  const code = (x) => { try { parseProgramShare(x); } catch (e) { return e.code; } };
  assert.equal(code('{nope'), 'invalid_json');
  assert.equal(code({ ...ok, format: 'x' }), 'not_program');
  assert.equal(code({ ...ok, version: 'a' }), 'not_program');
  assert.equal(code({ ...ok, version: 99 }), 'newer_version');
  assert.equal(code({ ...ok, program: { ...ok.program, name: '' } }), 'no_name');
  assert.equal(code({ ...ok, program: { name: 'P' } }), 'no_workouts');
  assert.equal(code('x'.repeat(3e6)), 'too_large');
  assert.ok(new ProgramShareError('a', 'b') instanceof Error);
});

test('every thrown code has an en.json key matching its message', () => {
  const re = /new ProgramShareError\('(\w+)', '([^']+)'\)/g;
  let m, n = 0;
  while ((m = re.exec(src))) { n++; assert.equal(en.programs.share_err[m[1]], m[2]); }
  assert.ok(n >= 8);
});

test('share sheet strings are passed in by ProgramDetail', () => {
  const d = readFileSync(new URL('../src/routes/ProgramDetail.svelte', import.meta.url), 'utf8');
  assert.match(d, /exportProgram\(program, \{ title: \$_\('program_detail\.share_title'\)/);
  assert.ok(en.program_detail.share_title && en.program_detail.share_dialog_title);
});
