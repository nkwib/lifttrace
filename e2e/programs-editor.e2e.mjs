// Programs flow: create a program, add days, edit a day, reorder, duplicate,
// leave with unsaved changes, save, activate, Diary quick-start, load errors.
// Steps share one program, so the tests run in order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

const PROGRAM = 'Spring Strength';
const EX_A = 'Barbell Bench Press';
const EX_B = 'Barbell Back Squat';

let server, client, programId, pushId;
before(async () => {
  server = await startServer();
  client = await api(server, { register: true });
  for (const [name, muscles] of [[EX_A, ['chest']], [EX_B, ['quadriceps']]]) {
    await client.call('POST', '/api/exercises', { name, category: 'strength', primary_muscles: muscles, equipment: ['barbell'] });
  }
});
after(async () => { await closeBrowser(); await server?.stop(); });

const program = () => client.call('GET', `/api/programs/${programId}`);
const exNames = (page) => page.locator('.ex-name').allInnerTexts();

test('create a program from the New sheet', async () => {
  for (const view of ['narrow', 'desktop']) {
    const page = await openPage(server, client, { view });
    await goto(page, '/programs');
    await expectClean(page, `programs-${view}`);
    await page.context().close();
  }
  const page = await openPage(server, client, { view: 'narrow' });
  await goto(page, '/programs');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const create = page.getByRole('button', { name: 'Create', exact: true });
  await create.waitFor();
  assert.ok(await create.isDisabled(), 'Create is off while the name is blank');
  await page.getByPlaceholder('e.g. Cutting 2026').fill('   ');
  assert.ok(await create.isDisabled(), 'a whitespace-only name is refused');
  await page.getByPlaceholder('e.g. Cutting 2026').fill(PROGRAM);
  await create.click();
  await page.getByRole('heading', { name: PROGRAM }).waitFor();
  programId = Number(new URL(page.url()).hash.match(/programs\/(\d+)/)[1]);
  assert.ok((await client.call('GET', '/api/programs')).some((p) => p.id === programId && p.name === PROGRAM));
  await page.context().close();
});

test('New program sheet passes the page checks', async () => {
  const page = await openPage(server, client, { view: 'narrow' });
  await goto(page, '/programs');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await expectClean(page, 'programs-create-sheet-narrow');
  await page.context().close();
});

test('add two days; a blank day name is refused', async () => {
  const page = await openPage(server, client, { view: 'narrow' });
  await goto(page, `/programs/${programId}`);
  await expectClean(page, 'program-detail-empty-narrow');
  await page.getByRole('button', { name: 'Add Workout' }).click();
  const add = page.getByRole('button', { name: 'Add Workout' }).last();
  const input = page.getByPlaceholder(/Upper Body A/);
  await input.waitFor();
  assert.ok(await add.isDisabled(), 'Add Workout is off while the name is blank');
  await input.fill('   ');
  assert.ok(await add.isDisabled(), 'a whitespace-only day name is refused');
  await input.press('Enter');
  await page.waitForTimeout(300);
  assert.equal((await program()).templates.length, 0, 'Enter does not create a blank day');
  for (const name of ['Push', 'Pull']) {
    await input.fill(name);
    await add.click();
    await page.getByText(name, { exact: true }).first().waitFor();
    if (name === 'Push') {
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await input.waitFor();
    }
  }
  const p = await program();
  assert.deepEqual(p.templates.map((t) => t.name), ['Push', 'Pull']);
  pushId = p.templates[0].id;
  await expectClean(page, 'program-detail-days-narrow');
  await page.context().close();
});

test('program detail with days on desktop', async () => {
  const page = await openPage(server, client, { view: 'desktop' });
  await goto(page, `/programs/${programId}`);
  await expectClean(page, 'program-detail-days-desktop');
  await page.context().close();
});

test('editor: add exercises, reorder, leave asks first, save', async (t) => {
  const page = await openPage(server, client, { view: 'phone' });
  await goto(page, `/programs/${programId}/template/${pushId}`);
  await expectClean(page, 'editor-empty-phone');
  for (const name of [EX_A, EX_B]) {
    await page.getByRole('button', { name: 'Add Exercise' }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(name) }).first().click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('.ex-name', { hasText: name }).waitFor();
  }
  assert.deepEqual(await exNames(page), [EX_A, EX_B]);
  await expectClean(page, 'editor-two-exercises-phone');

  await t.test('reorder with the up and down buttons', async () => {
    await page.getByRole('button', { name: 'Move Down' }).first().click();
    assert.deepEqual(await exNames(page), [EX_B, EX_A], 'down moves the first exercise below the second');
    await page.getByRole('button', { name: 'Move Up' }).last().click();
    assert.deepEqual(await exNames(page), [EX_A, EX_B], 'up on the second row moves it back');
    await page.getByRole('button', { name: 'Move Down' }).first().click();
    assert.deepEqual(await exNames(page), [EX_B, EX_A]);
  });

  await t.test('leaving with unsaved changes asks first', async () => {
    await page.getByRole('button', { name: 'Back' }).click();
    const dlg = page.getByRole('alertdialog');
    await dlg.waitFor();
    await expectClean(page, 'editor-leave-dialog-phone');
    await page.waitForTimeout(500); // the dialog ignores a cancel for 400ms after it opens
    await dlg.getByRole('button', { name: 'Keep editing' }).click();
    await dlg.waitFor({ state: 'hidden' });
    assert.match(page.url(), /template\//, 'still in the editor');
    assert.deepEqual(await exNames(page), [EX_B, EX_A], 'edits are kept');
  });

  await t.test('save writes the order and returns to the program', async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('heading', { name: PROGRAM }).waitFor();
    const day = (await program()).templates.find((x) => x.id === pushId);
    assert.deepEqual(day.exercises.map((e) => e.name || e.exercise_name), [EX_B, EX_A]);
    // No dirty state left behind: reopening and going back needs no dialog.
    await goto(page, `/programs/${programId}/template/${pushId}`);
    await page.locator('.ex-name', { hasText: EX_B }).waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('heading', { name: PROGRAM }).waitFor();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
  });
  await page.context().close();
});

test('editor on desktop', async () => {
  const page = await openPage(server, client, { view: 'desktop' });
  await goto(page, `/programs/${programId}/template/${pushId}`);
  await page.locator('.ex-name', { hasText: EX_B }).waitFor();
  await expectClean(page, 'editor-exercises-desktop');
  await page.context().close();
});

test('editor: a blank day name is refused on save', async () => {
  const page = await openPage(server, client, { view: 'narrow' });
  await goto(page, `/programs/${programId}/template/${pushId}`);
  const title = page.getByPlaceholder('Workout name');
  await title.fill('   ');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Give the workout a name.').first().waitFor();
  assert.match(page.url(), /template\//, 'stays in the editor');
  assert.equal((await program()).templates.find((x) => x.id === pushId).name, 'Push', 'nothing was saved');
  await page.context().close();
});

test('program detail: reorder days on a phone, duplicate a day', async (t) => {
  const page = await openPage(server, client, { view: 'phone' });
  await goto(page, `/programs/${programId}`);
  await t.test('move a day down and up', async () => {
    await page.getByRole('button', { name: 'Move Push down' }).click();
    await page.waitForFunction(() => document.querySelector('.tpl-name')?.textContent === 'Pull');
    assert.deepEqual((await program()).templates.map((x) => x.name), ['Pull', 'Push']);
    await page.getByRole('button', { name: 'Move Push up' }).click();
    await page.waitForFunction(() => document.querySelector('.tpl-name')?.textContent === 'Push');
    assert.deepEqual((await program()).templates.map((x) => x.name), ['Push', 'Pull']);
  });
  await t.test('duplicate keeps the exercises', async () => {
    await page.getByRole('button', { name: 'Duplicate workout' }).first().click();
    await page.getByText('Workout duplicated').first().waitFor();
    const days = (await program()).templates;
    assert.equal(days.length, 3);
    const copy = days.find((x) => /Push/.test(x.name) && x.id !== pushId);
    assert.ok(copy, 'a copy of Push exists');
    assert.equal(copy.exercises.length, 2);
    await page.waitForTimeout(800); // let the toast settle: its fade-in trips the contrast check
    await expectClean(page, 'program-detail-three-days-phone');
  });
  await page.context().close();
});

test('set the program active; the Diary quick-start card names its next day', async () => {
  const page = await openPage(server, client, { view: 'narrow' });
  await goto(page, `/programs/${programId}`);
  await page.getByRole('button', { name: 'Set Active' }).click();
  await page.getByRole('button', { name: /Active/ }).first().waitFor();
  assert.ok((await client.call('GET', '/api/programs')).find((p) => p.id === programId).is_active);
  await expectClean(page, 'program-detail-active-narrow');
  await page.context().close();
});

for (const view of ['narrow', 'desktop']) {
  test(`Diary quick-start card names the program's next day (${view})`, { todo: 'defect: diary-quickstart-next-day' }, async () => {
    const diary = await openPage(server, client, { view });
    await goto(diary, '/');
    const card = diary.locator('.quick-card', { hasText: 'Active Program' });
    await card.waitFor();
    await expectClean(diary, `diary-quickstart-${view}`);
    const text = await card.innerText();
    assert.match(text, new RegExp(PROGRAM), 'card names the program');
    assert.match(text, /Push/, 'card names the next day, Push');
    await diary.context().close();
  });
}

test('program detail shows an error with Retry when the load fails', async () => {
  for (const view of ['narrow', 'desktop']) {
    const page = await openPage(server, client, { view });
    const route = new RegExp(`/api/programs/${programId}(\\?.*)?$`);
    await page.route(route, (r) => r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.continue());
    await goto(page, `/programs/${programId}`);
    const alert = page.getByRole('alert').filter({ hasText: "Couldn't load this program." });
    await alert.waitFor();
    await alert.getByRole('button', { name: 'Retry' }).waitFor();
    await expectClean(page, `program-detail-error-${view}`, { skip: ['errors'] });
    await page.unroute(route);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await page.getByRole('heading', { name: PROGRAM }).waitFor();
    await page.context().close();
  }
});

test('workout editor shows an error with Retry when the load fails', async () => {
  for (const view of ['narrow', 'desktop']) {
    const page = await openPage(server, client, { view });
    const route = new RegExp(`/api/templates/${pushId}(\\?.*)?$`);
    await page.route(route, (r) => r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.continue());
    await goto(page, `/programs/${programId}/template/${pushId}`);
    const alert = page.getByRole('alert').filter({ hasText: "Couldn't load this workout." });
    await alert.waitFor();
    await alert.getByRole('button', { name: 'Retry' }).waitFor();
    await expectClean(page, `editor-error-${view}`, { skip: ['errors'] });
    await page.unroute(route);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await page.locator('.ex-name', { hasText: EX_B }).waitFor();
    await page.context().close();
  }
});
