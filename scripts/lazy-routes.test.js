/**
 * Only the Diary (home, and the fallback) is in the first bundle: every other
 * page, the sign-in and connect screens, Trace and the full player are their
 * own chunks. The service worker still precaches every chunk, so an installed
 * PWA opens any page offline (Android ships them all in the APK).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../src/App.svelte');

test('the Diary is eager, every other route loads when first opened', () => {
  assert.match(app, /import Diary\s+from '\.\/routes\/Diary\.svelte'/);
  assert.match(app, /'\/':\s+Diary,/);
  assert.match(app, /'\*':\s+Diary,/);
  const routes = app.slice(app.indexOf('const routes = {'), app.indexOf('};', app.indexOf('const routes = {')));
  const names = new Set([...routes.matchAll(/:\s+(\w+),/g)].map(m => m[1]));
  names.delete('Diary');
  assert.ok(names.size >= 15, 'all the routes read');
  for (const n of names) {
    assert.match(app, new RegExp(`const ${n}\\s+= lazy\\(\\(\\) => import\\('\\./routes/${n}\\.svelte'\\)\\)`), n);
    assert.doesNotMatch(app, new RegExp(`import ${n}\\s+from`), `${n} not in the first bundle`);
  }
  // Every page under src/routes is either the Diary, a lazy route or one of the lazy screens.
  for (const f of readdirSync(new URL('../src/routes/', import.meta.url)).filter(f => f.endsWith('.svelte'))) {
    if (f === 'Diary.svelte') continue;
    assert.match(app, new RegExp(`import\\('\\./routes/${f.replace('.', '\\.')}'\\)`), f);
  }
});

test('Trace, the full player and the sign-in and connect screens are their own chunks', () => {
  for (const p of ['./components/ai/Trace.svelte', './components/radio/FullPlayer.svelte', './routes/Login.svelte', './routes/NativeSetup.svelte']) {
    assert.ok(app.includes(`import('${p}')`), p);
    assert.doesNotMatch(app, new RegExp(`import \\w+\\s+from '${p.replace(/[./]/g, '\\$&')}'`), p);
  }
});

test('the service worker precaches every JavaScript chunk', () => {
  const vite = read('../vite.config.js');
  assert.match(vite, /globPatterns: \['\*\*\/\*\.\{js,/);
  // Only the two big optional libraries are left to the network.
  const ignores = vite.match(/globIgnores: \[([^\]]*)\]/)[1];
  assert.doesNotMatch(ignores, /assets\/\*\*|\*\*\/\*\.js'/);
});
