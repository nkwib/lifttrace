/**
 * get_workout defaults its date to today in the account's zone (todayFor),
 * and its description says so, not "the server's timezone".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../server/lib/mcp/tools/get-workout.js', import.meta.url), 'utf8');
const description = src.slice(src.indexOf('description:'), src.indexOf('inputSchema'));

test('the code defaults the date with the account zone', () => {
  assert.match(src, /date \|\| todayFor\(userId\)/);
});

test("the description says the account's timezone", () => {
  assert.match(description, /Date defaults to today in the account's/);
  assert.doesNotMatch(description, /server's/);
});
