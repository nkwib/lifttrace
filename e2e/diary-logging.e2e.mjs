// Diary workout logging on today's date: add exercises, log and edit sets,
// remove and undo, warm-ups, rest timer bar, finish, reload and check that
// the server holds what the screen showed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The NOW badge contrast is checked on its own below.
const QUIET = { axeExclude: ['.now-set'] };

let server, client;
before(async () => {
  server = await startServer();
  client = await api(server, { register: true });
  // Rest timer is opt-in; collapse and removal confirmation would hide the
  // rows and the Undo toast this flow drives.
  for (const [key, value] of [['restTimerEnabled', true], ['restDuration', 90], ['autoCollapseCompleted', false], ['confirmExerciseRemoval', false]]) {
    await client.call('PUT', '/api/settings', { key, value });
  }
  for (const name of ['E2E Alpha Press', 'E2E Beta Squat']) {
    await client.call('POST', '/api/exercises', { name, category: 'strength', primary_muscles: ['chest'], equipment: ['barbell'] });
  }
});
after(async () => { await closeBrowser(); await server?.stop(); });

const saved = async () => (await client.call('GET', `/api/workout/${today()}`)).workout || {};
const settle = (page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(400));

// The 'phone' run leaves nothing behind for the next view.
async function reset() { await client.call('DELETE', `/api/workout/${today()}`).catch(() => {}); }

for (const view of ['narrow', 'phone']) {
  test(`diary logging ${view}`, async (t) => {
    await reset();
    const page = await openPage(server, client, { view });
    const step = (name, fn) => t.test(name, async () => { await fn(); await settle(page); await expectClean(page, `diary-${name}-${view}`, QUIET); });
    await goto(page, '/');

    await step('add two exercises with the picker', async () => {
      await page.getByRole('button', { name: 'Add Exercise' }).first().click();
      await page.getByPlaceholder('Search exercises...').waitFor();
      await page.getByRole('button', { name: /E2E Alpha Press/ }).first().click();
      await page.getByRole('button', { name: /E2E Beta Squat/ }).first().click();
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      await page.getByText('E2E Alpha Press', { exact: true }).first().waitFor();
      await page.getByText('E2E Beta Squat', { exact: true }).first().waitFor();
    });

    await step('log weight and reps, mark done, rest bar appears', async () => {
      await page.getByLabel('Weight, set 1').first().fill('100');
      await page.getByLabel('Reps, set 1').first().fill('5');
      await page.getByRole('button', { name: 'Mark set 1 complete' }).first().click();
      const bar = page.getByRole('timer');
      await bar.waitFor();
      const digits = bar.locator('.rest-time');
      assert.match((await digits.innerText()).trim(), /^\d+:\d{2}$/);
      // The label must not sit on the digits (320px smoke fix).
      const overlap = await bar.evaluate((el) => {
        const t = el.querySelector('.rest-time').getBoundingClientRect();
        const l = el.querySelector('.rest-label');
        const lr = l && l.getBoundingClientRect().width > 0 ? l.getBoundingClientRect() : null;
        const bb = el.getBoundingClientRect();
        const clipped = [...el.querySelectorAll('.rest-time, .rest-btn')].filter((n) => { const r = n.getBoundingClientRect(); return r.right > bb.right + 1 || r.left < bb.left - 1; }).length;
        return { clipped, hit: !!lr && !(lr.right <= t.left || lr.left >= t.right || lr.bottom <= t.top || lr.top >= t.bottom) };
      });
      assert.equal(overlap.hit, false, 'rest label overlaps the digits');
      assert.equal(overlap.clipped, 0, 'rest bar content spills out of the bar');
      await expectClean(page, `diary-rest-bar-${view}`, QUIET);
      await page.getByRole('button', { name: 'Skip Rest' }).click();
      await bar.waitFor({ state: 'hidden' });
    });

    await step('add a set and edit it', async () => {
      await page.getByRole('button', { name: 'Add Set' }).first().click();
      await page.getByLabel('Weight, set 2').first().waitFor();
      await page.getByLabel('Weight, set 2').first().fill('105');
      await page.getByLabel('Reps, set 2').first().fill('4');
      await page.getByRole('button', { name: 'Mark set 2 complete' }).first().click();
      await page.getByRole('button', { name: 'Skip Rest' }).click().catch(() => {});
      // Edit after the fact.
      await page.getByLabel('Reps, set 2').first().fill('6');
      await page.getByLabel('Weight, set 2').first().fill('110');
      await page.getByLabel('Weight, set 2').first().blur();
      assert.equal(await page.getByLabel('Weight, set 2').first().inputValue(), '110');
      assert.equal(await page.getByLabel('Reps, set 2').first().inputValue(), '6');
    });

    await step('remove a set then Undo', async () => {
      await page.getByRole('button', { name: 'Remove set 2' }).first().click();
      await page.getByLabel('Weight, set 2').first().waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.getByLabel('Weight, set 2').first().waitFor();
      assert.equal(await page.getByLabel('Weight, set 2').first().inputValue(), '110');
      assert.equal(await page.getByLabel('Reps, set 2').first().inputValue(), '6');
    });

    let warmups = 0;
    await step('add warm-ups', async () => {
      const btn = page.getByRole('button', { name: 'Warm-ups' });
      if (!(await btn.count())) return; // not offered
      await btn.first().click();
      await page.waitForFunction(() => document.querySelectorAll('.set-row.warmup').length > 0);
      warmups = await page.locator('.set-row.warmup').count();
      assert.ok(warmups > 0);
    });

    await step('remove an exercise then Undo', async () => {
      await page.getByRole('button', { name: 'Remove exercise' }).last().click();
      await page.getByText('E2E Beta Squat', { exact: true }).first().waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.getByText('E2E Beta Squat', { exact: true }).first().waitFor();
    });

    await step('finish the workout', async () => {
      await page.getByRole('button', { name: /Finish workout/ }).first().click();
      await page.getByRole('button', { name: 'Done', exact: true }).first().waitFor();
    });

    await t.test('everything persisted after reload', async () => {
      await page.waitForTimeout(1200);
      const w = await saved();
      const check = (log) => {
        assert.equal(log.completed, 1, 'finished workout is completed');
        const names = log.exercises.map((e) => e.exercise_name);
        assert.deepEqual(names, ['E2E Alpha Press', 'E2E Beta Squat']);
        const all = log.exercises[0].sets;
        assert.equal(all.filter((x) => x.warmup).length, warmups, 'warm-ups persisted');
        const alpha = all.filter((x) => !x.warmup);
        assert.equal(alpha.length, 2, 'removed set came back with Undo');
        assert.equal(Number(alpha[0].weight), 100);
        assert.equal(Number(alpha[0].reps), 5);
        assert.ok(alpha[0].completed);
        assert.equal(Number(alpha[1].weight), 110);
        assert.equal(Number(alpha[1].reps), 6);
        assert.ok(alpha[1].completed);
      };
      check(w);
      await page.reload();
      await goto(page, '/');
      await page.getByText('E2E Alpha Press', { exact: true }).first().waitFor();
      assert.equal(await page.getByLabel('Weight, set 2').first().inputValue(), '110');
      check(await saved());
      await expectClean(page, `diary-after-reload-${view}`, QUIET);
    });
    await page.context().close();
  });
}

// The "NOW" badge on the next-set pill is orange on a brown tint (4.19:1, AA needs 4.5).
for (const view of ['narrow', 'phone']) {
  test(`NOW badge has readable contrast ${view}`, async () => {
    await reset();
    await client.call('PUT', `/api/workout/${today()}`, { name: 'Contrast', exercises: [{ name: 'E2E Alpha Press', sets: [{ weight: 50, reps: 5, completed: false }] }] });
    const page = await openPage(server, client, { view });
    await goto(page, '/');
    await page.locator('.now-set').first().waitFor();
    try { await expectClean(page, `diary-now-badge-${view}`); } finally { await page.context().close(); }
  });
}
