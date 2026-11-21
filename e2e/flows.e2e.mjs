// Interactive flows, including regressions for the browser smoke round's
// fixes that a page load alone cannot catch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';
import { seedBasics } from './seed.mjs';

const SETTINGS = ['appearance', 'units', 'workout', 'statistics', 'notifications', 'trace', 'radio', 'data', 'catalog', 'users', 'authentication', 'webhooks', 'federation', 'updates'];
const STATS_TABS = ['Overview', 'Exercise Progress', 'Records', 'Volume', 'Frequency', 'Body Measurements']; // Cardio shows only with Track Cardio on

let server, client, seed;
before(async () => {
  server = await startServer();
  client = await api(server, { register: true });
  seed = await seedBasics(client);
});
after(async () => { await closeBrowser(); await server?.stop(); });

for (const [view, theme] of [['narrow', 'light'], ['phone', 'dark'], ['desktop', 'light']]) {
  test(`settings sections ${view} ${theme}`, async (t) => {
    const page = await openPage(server, client, { view, theme });
    for (const s of SETTINGS) {
      await t.test(s, async () => { await goto(page, `/settings/${s}`); await expectClean(page, `settings-${s}-${view}-${theme}`); });
    }
    await page.context().close();
  });

  test(`statistics tabs with 12 weeks of data ${view} ${theme}`, async (t) => {
    const page = await openPage(server, client, { view, theme });
    await goto(page, '/statistics');
    for (const tab of STATS_TABS) {
      await t.test(tab, async () => {
        // Phones show a pill bar, desktop a rail: click whichever is visible.
        await page.locator('.metric-pill, .mr-btn').filter({ hasText: new RegExp(`(^|\\s)${tab}$`) }).filter({ visible: true }).first().click();
        await page.waitForLoadState('networkidle');
        await expectClean(page, `stats-${tab}-${view}-${theme}`);
      });
    }
    await page.context().close();
  });
}

test('exercise detail follows an :id change and the bottom nav marks Exercises', async () => {
  const page = await openPage(server, client, { view: 'phone' });
  const [a, b] = seed.exercises;
  await goto(page, `/exercise/${a.id}`);
  await page.getByRole('heading', { name: a.name }).first().waitFor();
  await page.evaluate((id) => { location.hash = `#/exercise/${id}`; }, b.id);
  await page.getByRole('heading', { name: b.name }).first().waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.nav-tab[aria-current="page"]').getAttribute('aria-label'), 'Exercises', 'Exercises, not Diary, is current on exercise detail');
  await expectClean(page, 'exercise-detail-id-change');
  await page.context().close();
});

test('sidebar drawer closes on Escape and gives focus back', async () => {
  const page = await openPage(server, client, { view: 'phone' });
  await goto(page, '/exercises');
  const menu = page.getByRole('button', { name: /menu/i }).first();
  await menu.click();
  const drawer = page.getByRole('dialog').first();
  await drawer.waitFor();
  await page.waitForFunction(() => document.activeElement?.closest('[role=dialog]'));
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY', 'focus is not dropped to body');
  await page.context().close();
});

test('server backup: create one, then restore it', async () => {
  const page = await openPage(server, client, { view: 'phone' });
  await goto(page, '/settings/data');
  await page.getByRole('button', { name: 'Create Backup' }).click();
  await page.getByText('Backup created').first().waitFor({ timeout: 15000 });
  await expectClean(page, 'backup-created');
  const restore = page.getByRole('button', { name: /Restore$/ }).first();
  await restore.click();
  await page.getByRole('dialog').getByRole('button', { name: /Restore$/ }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await goto(page, '/statistics');
  await expectClean(page, 'after-restore');
  const back = await client.call('GET', `/api/workout/history/${seed.exerciseId}`);
  assert.ok((Array.isArray(back) ? back : back.history || []).length > 0, 'workouts survive the restore');
  await page.context().close();
});
