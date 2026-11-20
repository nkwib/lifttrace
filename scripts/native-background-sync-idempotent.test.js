import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/sync.js', import.meta.url), 'utf8');
const start = src.indexOf('export function startBackgroundSync');
const body = src.slice(start, src.indexOf('\n}\n', start));

test('startBackgroundSync is guarded by a module-level once flag', () => {
  assert.match(src, /^let _bgSyncWired = false;/m);
  const urlCheck = body.indexOf('getServerUrl()');
  const guard = body.indexOf('if (_bgSyncWired) return;');
  const set = body.indexOf('_bgSyncWired = true;');
  const firstListener = body.indexOf('addEventListener');
  const kick = body.indexOf('setTimeout(trigger');
  assert.ok(urlCheck >= 0 && urlCheck < guard, 'guard after server URL check');
  assert.ok(guard < set && set < firstListener, 'flag set before listeners');
  assert.ok(firstListener < kick, 'boot kick in first-wire path');
});
