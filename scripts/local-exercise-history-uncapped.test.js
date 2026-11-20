import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Android Local must match server exerciseHistory: every workout, newest first.
test('Local historyFor is uncapped but keeps the json_each prefilter and date order', () => {
  const src = readFileSync('src/lib/api-native.js', 'utf8');
  const start = src.indexOf('async historyFor');
  const body = src.slice(start, src.indexOf('\n  },', start));
  assert.match(body, /json_each/);
  assert.match(body, /ORDER BY date DESC/);
  assert.doesNotMatch(body, /LIMIT/);
  assert.doesNotMatch(body, /break/);
  assert.doesNotMatch(body, />=\s*50/);
});
