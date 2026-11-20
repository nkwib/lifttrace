// Startup chunk stays free of the sync engine and api-native.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('App and Sidebar import syncState from sync-state.js, not sync.js', () => {
  for (const f of ['src/App.svelte', 'src/components/layout/Sidebar.svelte']) {
    assert.doesNotMatch(read(f), /^\s*import\s[^;]*from\s+'[^']*\/sync\.js'/m, f);
    assert.match(read(f), /from\s+'[^']*\/sync-state\.js'/, f);
  }
});

test('sync.js re-exports the state store', () => {
  const s = read('src/lib/sync.js');
  assert.match(s, /export \{ syncState, forgetRefused \} from '\.\/sync-state\.js'/);
  assert.doesNotMatch(s, /export const syncState/);
});

test('apiFetch.js loads api-native lazily', () => {
  const a = read('src/lib/apiFetch.js');
  assert.doesNotMatch(a, /^import\s[^;]*api-native\.js/m);
  assert.match(a, /import\('\.\/api-native\.js'\)/);
});
