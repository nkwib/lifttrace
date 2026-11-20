import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkedCardioDate, normalizeCardioInput } from '../src/lib/cardio-input.js';
import * as serverLog from '../server/lib/cardio-log.js';

const src = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');

// Body of `const <name> = {` ... up to a method's start, by method signature.
function method(obj, sig) {
  const o = src.indexOf(`const ${obj} = {`);
  const a = src.indexOf(sig, o);
  assert.ok(a > 0, `${obj}.${sig} exists`);
  const next = src.indexOf('\n  async ', a + sig.length);
  return src.slice(a, next);
}

test('checkedCardioDate trims legacy stamps and refuses non-dates', () => {
  assert.equal(checkedCardioDate('2026-05-01T08:00:00'), '2026-05-01');
  assert.equal(checkedCardioDate('2026-05-01'), '2026-05-01');
  assert.throws(() => checkedCardioDate('2026-02-30'), /calendar date/);
  assert.throws(() => checkedCardioDate('garbage'), /calendar date/);
});

test('server cardio-log re-exports the shared helpers', () => {
  assert.equal(serverLog.checkedCardioDate, checkedCardioDate);
  assert.equal(serverLog.normalizeCardioInput, normalizeCardioInput);
});

test('Local mode write handlers guard the date before touching the db', () => {
  for (const [obj, sig] of [['Workout', 'async upsert('], ['Workout', 'async del('], ['BodyStats', 'async put(']]) {
    const body = method(obj, sig);
    const g = body.indexOf('isCalendarDate(date)');
    assert.ok(g > 0, `${obj}.${sig} guards`);
    assert.ok(g < (body.search(/db(Query|Run)|\._resolve|\.get\(/) >>> 0 || Infinity), `${obj}.${sig} guards first`);
  }
});

test('Local Cardio.create and update share the server validation', () => {
  assert.match(method('Cardio', 'async create('), /normalizeCardioInput\(/);
  assert.match(method('Cardio', 'async update('), /checkedCardioDate\(body\.date\)/);
  assert.match(src, /import \{ checkedCardioDate, normalizeCardioInput \} from '\.\/cardio-input\.js'/);
});
