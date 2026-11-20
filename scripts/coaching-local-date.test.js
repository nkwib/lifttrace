import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Coaching and SettingsWorkout use local dates, not UTC slices', () => {
  for (const f of ['src/routes/Coaching.svelte', 'src/components/settings/SettingsWorkout.svelte']) {
    const s = read(f);
    assert.ok(!/toISOString\(\)\.slice\(0,\s*10\)/.test(s), f);
    assert.ok(s.includes('localDateStr'), f);
  }
});

const run = (tz, code) => execFileSync(process.execPath, ['--input-type=module', '-e', code], {
  env: { ...process.env, TZ: tz }, encoding: 'utf8',
}).trim();

const mod = new URL('../src/lib/date-local.js', import.meta.url).href;

for (const tz of ['Pacific/Auckland', 'America/Los_Angeles']) {
  test(`monthsAgo clamps and stays local in ${tz}`, () => {
    const out = run(tz, `import {monthsAgo, localDateStr} from '${mod}';
      const f = (y,m,d,n) => localDateStr(monthsAgo(new Date(y,m-1,d,0,30), n));
      console.log([f(2025,3,31,1), f(2024,3,31,1), f(2026,1,1,1), f(2026,3,15,3), f(2026,7,1,0)].join(','));`);
    assert.equal(out, '2025-02-28,2024-02-29,2025-12-01,2025-12-15,2026-07-01');
  });
}

test('localDateStr is local near midnight', () => {
  const out = run('Pacific/Auckland', `import {localDateStr} from '${mod}';
    console.log(localDateStr(new Date(2026, 5, 1, 0, 30)));`);
  assert.equal(out, '2026-06-01');
});
