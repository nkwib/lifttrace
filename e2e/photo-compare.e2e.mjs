// Progress photos: timeline, scrubber, compare slider (mouse + keyboard) and
// the 12-month window ("All time" reaches photos older than a year).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

// Known issue tracked elsewhere: icon ligatures are not aria-hidden.
const OPTS = { skip: ['icons'] };

// 1x1 PNGs (red, blue). The API accepts an embedded data: URL and stores a file.
const RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const BLUE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const OLD = day(430); // more than 12 months back
const NEAR = day(3);
const FAR = day(60);
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

let server, client;
before(async () => {
  server = await startServer();
  client = await api(server, { register: true });
  await client.call('POST', '/api/body-stats/photos', { date: FAR, url: RED });
  await client.call('POST', '/api/body-stats/photos', { date: NEAR, url: BLUE });
});
after(async () => { await closeBrowser(); await server?.stop(); });

const pct = async (handle) => Number(await handle.getAttribute('aria-valuenow'));

for (const view of ['narrow', 'desktop']) {
  test(`timeline, scrubber and compare slider ${view}`, async (t) => {
    const page = await openPage(server, client, { view });
    await goto(page, '/progress');
    await t.test('timeline lists both photos', async () => {
      await page.getByRole('heading', { name: 'Progress', exact: true }).first().waitFor();
      assert.equal(await page.locator('.pp-tile').count(), 2);
      await page.getByText(dayLabel(NEAR), { exact: true }).first().waitFor();
      await expectClean(page, `photos-timeline-${view}`, OPTS);
    });

    await t.test('photo opens the scrubber', async () => {
      await page.locator('.pp-thumb').first().click();
      const dlg = page.getByRole('dialog', { name: 'Photo Timeline' });
      await dlg.waitFor();
      await expectClean(page, `photos-scrubber-${view}`, OPTS);
      await page.keyboard.press('Escape');
      await dlg.waitFor({ state: 'hidden' });
    });

    await t.test('compare two: pick, slider by mouse and keyboard', async () => {
      await page.getByRole('button', { name: 'Compare Two' }).click();
      await page.getByText('Pick two photos to compare (0/2 selected)').waitFor();
      await expectClean(page, `photos-pick-${view}`, OPTS);
      await page.locator('.pp-thumb').nth(0).click();
      await page.getByText('(1/2 selected)').waitFor();
      await page.locator('.pp-thumb').nth(1).click();

      const dlg = page.getByRole('dialog', { name: 'Before and After' });
      await dlg.waitFor();
      const handle = dlg.getByRole('slider', { name: 'Drag to compare' });
      await handle.waitFor();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500); // sheet fade/fly-in (280ms) finished, or axe samples mid-transition colors
      await expectClean(page, `photos-compare-open-${view}`, OPTS);

      // Earlier photo is the "before", later the "after", whatever the pick order.
      assert.equal(await dlg.getByRole('img', { name: 'Earlier photo' }).count(), 1);
      assert.equal(await dlg.getByRole('img', { name: 'Later photo' }).count(), 1);
      assert.equal(await pct(handle), 50);

      const frame = await dlg.locator('.frame').boundingBox();
      const y = frame.y + frame.height / 2;
      await page.mouse.move(frame.x + frame.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(frame.x + frame.width * 0.25, y, { steps: 5 });
      await page.mouse.up();
      const afterDrag = await pct(handle);
      assert.ok(Math.abs(afterDrag - 25) <= 3, `mouse drag to 25% gave ${afterDrag}`);
      await expectClean(page, `photos-compare-mouse-${view}`, OPTS);

      await handle.focus();
      await page.keyboard.press('ArrowRight');
      assert.ok(await pct(handle) > afterDrag, 'ArrowRight moves the divider right');
      const right = await pct(handle);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      assert.ok(await pct(handle) < right, 'ArrowLeft moves the divider left');
      await page.keyboard.press('End');
      assert.equal(await pct(handle), 100);
      await page.keyboard.press('Home');
      assert.equal(await pct(handle), 0);
      await expectClean(page, `photos-compare-keys-${view}`, OPTS);
    });
    await page.context().close();
  });
}

test('a photo older than 12 months is reachable under All time', async (t) => {
  await client.call('POST', '/api/body-stats/photos', { date: OLD, url: RED });
  const page = await openPage(server, client, { view: 'narrow' });
  await goto(page, '/progress');
  await t.test('hidden in the default window', async () => {
    assert.equal(await page.locator('.pp-tile').count(), 2);
    assert.equal(await page.getByText(dayLabel(OLD), { exact: true }).count(), 0);
  });
  await t.test('All time shows it', async () => {
    await page.getByRole('button', { name: 'All time' }).click();
    await page.locator('.pp-tile').nth(2).waitFor();
    assert.equal(await page.getByRole('button', { name: 'All time' }).getAttribute('aria-pressed'), 'true');
    await page.getByText(dayLabel(OLD), { exact: true }).first().waitFor();
  });
  await t.test('every thumbnail button is named', async () => {
    await expectClean(page, 'photos-all-time-narrow', OPTS);
  });
  await t.test('compare first and latest spans the old photo', async () => {
    await page.getByRole('button', { name: 'Compare First and Latest' }).click();
    const dlg = page.getByRole('dialog', { name: 'Before and After' });
    await dlg.waitFor();
    const stamps = await dlg.locator('.stamp').allInnerTexts();
    assert.equal(stamps[0], new Date(`${OLD}T00:00:00`).toLocaleDateString('en-US'), 'oldest photo is the "before"');
    await page.waitForTimeout(500);
    await expectClean(page, 'photos-all-time-compare-narrow', { ...OPTS });
  });
  await page.context().close();
});
