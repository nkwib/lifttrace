import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/routes/Programs.svelte', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));

test('native _resolveCurrentWeek returns sessions for one-week programs, no current_week', () => {
  const fn = api.slice(api.indexOf('async function _resolveCurrentWeek'), api.indexOf('function _templateFromRow'));
  const early = fn.indexOf('<= 1) return {');
  assert.ok(early > 0);
  assert.ok(fn.indexOf('_sessionsInProgram(') < early);
  assert.match(fn.slice(early, early + 80), /return \{ sessions_in_program: sessions \};/);
});

test('Programs card uses the ICU plural key', () => {
  assert.match(page, /\$_\('programs\.n_sessions', \{ values: \{ count: p\.sessions_in_program \} \}\)/);
  assert.ok(!page.includes("'session' : 'sessions'"));
  assert.match(en.programs.n_sessions, /plural/);
});
