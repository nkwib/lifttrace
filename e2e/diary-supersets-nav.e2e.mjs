// Diary supersets, rapid day navigation and the month calendar's week start.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

const MEMBER = { username: 'ss-member', password: 'E2e-Member-pass-0192' };
const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const NAMES = ['Alpha Press', 'Bravo Squat', 'Charlie Pull'];

let server, admin, member, lifts;
const dayLifts = {};

const putDay = (date, exs) => member.call('PUT', `/api/workout/${date}`, {
  name: `Workout ${date}`,
  exercises: exs.map((e) => ({ exercise_id: e.id, name: e.name, exercise_name: e.name, sets: [{ weight: 50, reps: 5, completed: false }, { weight: 50, reps: 5, completed: false }] })),
});
const mkLift = (name) => member.call('POST', '/api/exercises', { name, category: 'strength', primary_muscles: ['chest'], equipment: ['barbell'] });

before(async () => {
  server = await startServer();
  admin = await api(server, { register: true });
  // A member coached by the admin, so coach feedback can be seeded.
  const me = await admin.call('GET', '/api/auth/me');
  const adminId = me.id ?? me.user?.id;
  const { inviteUrl } = await admin.call('POST', '/api/auth/invite', { role: 'member', coach_id: adminId });
  const token = new URL(inviteUrl.replace('/#/', '/')).searchParams.get('token');
  const res = await fetch(`${server.url}/api/auth/accept-invite`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: server.url },
    body: JSON.stringify({ token, ...MEMBER, full_name: 'SS Member' }),
  });
  assert.ok(res.ok, `accept-invite ${res.status}`);
  member = await api(server, MEMBER);
  const state = await member.call('GET', '/api/coaching/state');
  const pid = JSON.stringify(state).match(/"id":(\d+)/)?.[1];
  assert.ok(pid != null, `a pending coach request: ${JSON.stringify(state).slice(0, 300)}`);
  await member.call('POST', `/api/coaching/pairings/${pid}/accept`);
  lifts = [];
  for (const n of NAMES) lifts.push(await mkLift(n));
  for (const k of [1, 2, 3]) {
    dayLifts[k] = [await mkLift(`Day${k} Lift One`), await mkLift(`Day${k} Lift Two`)];
    await putDay(iso(k), dayLifts[k]);
    const { workout } = await member.call('GET', `/api/workout/${iso(k)}`);
    await admin.call('POST', '/api/trainer/feedback', { workout_id: workout.id, note: `Coach note for day ${k}` });
  }
});
after(async () => { await closeBrowser(); await server?.stop(); });

const order = async () => (await member.call('GET', `/api/workout/${iso(0)}`)).workout.exercises
  .map((e) => ({ name: e.exercise_name || e.name, ss: e.superset_id ?? null }));
const poll = async (fn, label) => {
  let last;
  for (let i = 0; i < 40; i++) { last = await fn(); if (last.ok) return last.value; await new Promise((r) => setTimeout(r, 150)); }
  return assert.fail(`${label}: ${JSON.stringify(last.value)}`);
};
const card = (page, name) => page.locator('.ex-card').filter({ hasText: name }).first();
const menuOf = (page, name) => card(page, name).getByRole('button', { name: 'More options' });
const focusInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName, label: a?.getAttribute('aria-label') || '' };
});

for (const view of ['narrow', 'desktop']) {
  test(`superset create, leave and move keep structure ${view}`, async (t) => {
    await member.call('DELETE', `/api/workout/${iso(0)}`);
    await putDay(iso(0), lifts);
    const page = await openPage(server, member, { view });
    await goto(page, '/');
    await page.locator('.ex-card').first().waitFor();

    await menuOf(page, NAMES[0]).click();
    await page.getByRole('button', { name: /Start new superset/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Create Superset' });
    await dialog.waitFor();
    const confirm = dialog.getByRole('button', { name: /Create superset/i });

    await t.test('create sheet label is never "(1 exercises)" before a pick', { todo: 'defect: superset-sheet-1-exercises' }, async () => {
      assert.doesNotMatch(await confirm.innerText(), /\(1 exercises\)/, 'no "(1 exercises)" before a pick');
    });

    await t.test('create the superset from two exercises', async () => {
      await dialog.getByLabel(NAMES[1]).check();
      const text = await confirm.innerText();
      assert.doesNotMatch(text, /\(1 exercises\)/);
      assert.match(text, /2 exercises/);
      await confirm.click();
      await page.getByText('Superset created').first().waitFor();
      const o = await poll(async () => { const v = await order(); return { ok: v[0].ss && v[0].ss === v[1].ss, value: v }; }, 'superset saved');
      assert.deepEqual(o.map((e) => e.name), NAMES);
      assert.equal(o[2].ss, null);
    });

    await t.test('remove-superset control has an accessible name', async () => {
      const btn = page.getByRole('button', { name: 'Remove entire superset' });
      assert.equal(await btn.count(), 1, 'one remove control with a name');
    });

    await t.test('Move up/down keep the superset intact', async () => {
      await card(page, NAMES[2]).getByRole('button', { name: /^Move up$/i }).click();
      let o = await poll(async () => { const v = await order(); return { ok: v[0].name === NAMES[2], value: v }; }, 'block moved up');
      assert.deepEqual(o.map((e) => e.name), [NAMES[2], NAMES[0], NAMES[1]]);
      assert.ok(o[1].ss && o[1].ss === o[2].ss, 'superset members still share an id and stay adjacent');
      assert.equal(o[0].ss, null);

      await card(page, NAMES[0]).getByRole('button', { name: /^Move down$/i }).click();
      o = await poll(async () => { const v = await order(); return { ok: v[1].name === NAMES[1], value: v }; }, 'member moved down');
      assert.deepEqual(o.map((e) => e.name), [NAMES[2], NAMES[1], NAMES[0]]);
      assert.ok(o[1].ss && o[1].ss === o[2].ss, 'superset intact after moving a member');

      await card(page, NAMES[2]).getByRole('button', { name: /^Move down$/i }).click();
      o = await poll(async () => { const v = await order(); return { ok: v[2].name === NAMES[2], value: v }; }, 'block moved down');
      assert.deepEqual(o.map((e) => e.name), [NAMES[1], NAMES[0], NAMES[2]]);
      assert.ok(o[0].ss && o[0].ss === o[1].ss, 'superset intact after moving the block down');
      assert.equal(o[2].ss, null);
    });

    await t.test('Remove from superset leaves focus on an element, not body', async () => {
      await menuOf(page, NAMES[1]).click();
      await page.getByRole('button', { name: 'Remove from superset' }).click();
      await page.getByText('Removed from superset').first().waitFor();
      await poll(async () => { const v = await order(); return { ok: v.every((e) => e.ss === null), value: v }; }, 'superset dissolved');
      await page.waitForTimeout(300);
      const f = await focusInfo(page);
      assert.notEqual(f.tag, 'BODY', `focus fell to body (${JSON.stringify(f)})`);
      assert.equal(f.label, 'More options', 'focus returns to an exercise menu button');
    });

    await t.test('diary passes the generic checks (contrast of the next-set chip excluded)', async () => {
      await expectClean(page, `diary-superset-${view}`, { axeExclude: ['.now-set'] });
    });
    await t.test('diary passes the generic checks including contrast', { todo: 'defect: now-set-contrast' }, async () => {
      await expectClean(page, `diary-superset-contrast-${view}`);
    });
    await page.context().close();
  });

  test(`rapid day navigation shows the header's day ${view}`, async (t) => {
    const page = await openPage(server, member, { view });
    await goto(page, '/');
    const prev = page.getByRole('button', { name: 'Previous day' });
    const next = page.getByRole('button', { name: 'Next day' });
    const header = async () => (await page.locator('.date-btn').innerText()).trim().replace(/\s+/g, ' ');

    const toToday = async () => {
      const pill = page.locator('.today-pill');
      if (await pill.count()) await pill.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    };

    // Learn which header belongs to which day, slowly.
    const headerOf = {};
    for (const k of [1, 2, 3]) {
      await prev.click();
      await page.getByText(`Day${k} Lift One`).first().waitFor();
      await page.getByText(`Coach note for day ${k}`).first().waitFor();
      headerOf[k] = await header();
    }
    assert.equal(new Set(Object.values(headerOf)).size, 3, 'three distinct headers');

    const check = async (expected, label) => {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      const h = await header();
      const text = await page.locator('body').innerText();
      const want = Object.entries(headerOf).find(([, v]) => v === h)?.[0];
      assert.ok(want, `${label}: header "${h}" is one of the seeded days`);
      assert.equal(Number(want), expected, `${label}: header shows day ${want}, expected ${expected}`);
      for (const k of [1, 2, 3]) {
        assert.equal(text.includes(`Day${k} Lift One`), k === expected, `${label}: exercises of day ${k} ${k === expected ? 'missing' : 'leaked'} under header "${h}"`);
        assert.equal(text.includes(`Coach note for day ${k}`), k === expected, `${label}: coach note of day ${k} ${k === expected ? 'missing' : 'leaked'} under header "${h}"`);
      }
    };

    await t.test('three days back then forward again, no waits', async () => {
      await toToday();
      for (let i = 0; i < 3; i++) await prev.click({ delay: 0 });
      await check(3, 'after 3 previous');
      for (let i = 0; i < 2; i++) await next.click({ delay: 0 });
      await check(1, 'after 2 next');
    });
    await t.test('back and forth bursts', async () => {
      for (const steps of ['ppnpp', 'pnpnp', 'ppn', 'pnpn']) {
        // Start each burst from today.
        await toToday();
        for (const s of steps) await (s === 'p' ? prev : next).click({ delay: 0 });
        let day = 0;
        for (const s of steps) day += s === 'p' ? 1 : -1;
        if (day >= 1 && day <= 3) await check(day, `burst ${steps}`);
      }
    });
    await t.test('page stays clean', async () => { await expectClean(page, `diary-rapid-${view}`, { axeExclude: ['.now-set'] }); });
    await page.context().close();
  });
}

test('month calendar honors the week-start setting', async (t) => {
  const page = await openPage(server, member, { view: 'phone' });
  const setStart = async (value) => {
    await goto(page, '/settings/units');
    await page.getByLabel('Week starts on').selectOption(value);
    await page.waitForTimeout(600);
  };
  const firstColumn = async () => {
    await goto(page, '/');
    await page.locator('.date-btn').click();
    await page.locator('.dp-grid').waitFor();
    return page.evaluate(() => {
      const heads = [...document.querySelectorAll('.dp-dh')];
      const day1 = [...document.querySelectorAll('.dp-day')].find((b) => b.firstChild?.textContent.trim() === '1');
      const x0 = heads[0].getBoundingClientRect().left;
      const w = heads[1].getBoundingClientRect().left - x0;
      return { heads: heads.map((h) => h.textContent.trim()), col: Math.round((day1.getBoundingClientRect().left - x0) / w) };
    });
  };
  const now = new Date();
  const dow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  for (const [value, first, col] of [['sunday', 'Su', dow], ['monday', 'Mo', (dow + 6) % 7]]) {
    await t.test(value, async () => {
      await setStart(value);
      const r = await firstColumn();
      assert.equal(r.heads[0], first, `first header with week starting ${value}: ${r.heads}`);
      assert.equal(r.col, col, `day 1 sits in column ${col} (0-based)`);
      await page.waitForTimeout(600); // the sheet fades in
      await expectClean(page, `diary-calendar-${value}`, { axeExclude: ['.now-set', '.dp-today'] });
    });
  }
  await t.test('calendar today marker has enough contrast', async () => {
    await expectClean(page, 'diary-calendar-contrast', { axeExclude: ['.now-set'] });
  });
  await page.context().close();
});
