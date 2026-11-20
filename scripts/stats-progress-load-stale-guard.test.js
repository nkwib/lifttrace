// loadProgress: only the newest call may write progressData, toast, or clear
// the spinner. A slower earlier response must not overwrite a later one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, '..', 'src/routes/Statistics.svelte'), 'utf8');
const i = page.indexOf('async function loadProgress(');
assert.ok(i > 0);
const src = page.slice(i, page.indexOf('\n  }\n', i) + 4);

test('wiring: seq bumped before early return, stale checks after await and in catch', () => {
  assert.match(src, /const seq = \+\+_progressSeq;[\s\S]*if \(!selectedExerciseId\)/);
  const awaitAt = src.indexOf('await ');
  assert.ok(src.indexOf('seq !== _progressSeq', awaitAt) > awaitAt);
  const c = src.slice(src.indexOf('catch'));
  assert.ok(c.indexOf('seq !== _progressSeq') < c.indexOf('showError'));
  assert.match(src, /if \(seq === _progressSeq\) progressLoading = false/);
});

// Run the real function body against stubs (component state mapped onto `st`).
function harness(getProgress) {
  const st = { selectedExerciseId: 1, startDate: 'a', endDate: 'b', progressData: [], progressLoading: false, errors: [], _progressSeq: 0 };
  const body = src
    .replace('async function loadProgress()', 'return async function()')
    .replace(/_progressSeq|selectedExerciseId|progressData|progressLoading|startDate|endDate/g, (m) => `st.${m}`)
    .replace(/showError/g, 'st.errors.push');
  const load = new Function('st', 'LtApi', body)(st, { getProgress });
  return { st, load };
}

test('out-of-order: first call resolving last does not overwrite', async () => {
  const d = [];
  const { st, load } = harness(() => new Promise((r) => d.push(r)));
  const p1 = load(); const p2 = load();
  d[1](['new']); await p2;
  assert.deepEqual(st.progressData, ['new']);
  assert.equal(st.progressLoading, false);
  d[0](['old']); await p1;
  assert.deepEqual(st.progressData, ['new']);
});

test('stale spinner stays on while newest pending; stale error is silent', async () => {
  const d = [];
  const { st, load } = harness(() => new Promise((res, rej) => d.push({ res, rej })));
  const p1 = load(); const p2 = load();
  d[0].rej(new Error('x')); await p1;
  assert.equal(st.progressLoading, true);
  assert.deepEqual(st.errors, []);
  d[1].res(['ok']); await p2;
  assert.equal(st.progressLoading, false);
});

test('clearing the exercise invalidates in-flight request', async () => {
  let res;
  const { st, load } = harness(() => new Promise((r) => { res = r; }));
  const p1 = load();
  st.selectedExerciseId = null; await load();
  res(['stale']); await p1;
  assert.deepEqual(st.progressData, []);
  assert.equal(st.progressLoading, false);
});
