// First-run wizard, every step to the end: create the account, profile,
// units, goal, library, appearance, updates, finish. Each step is checked
// for generic problems and for its Next/Back/Skip buttons being reachable.
// Finishing with UPDATE_CHECK set must not PUT /api/updates/config (409).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

const ICONS = { skip: ['icons'] }; // known: icon ligatures not aria-hidden (app-wide codemod in progress)
const PASSWORD = 'e2e-Admin-pass-0192';
const servers = [];
after(async () => { await closeBrowser(); await Promise.all(servers.map((s) => s.stop())); });

// Every visible wizard button must sit inside the viewport horizontally,
// be reachable by scrolling, and be the element that receives a click at its centre.
async function expectButtonsReachable(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    const W = window.innerWidth;
    const names = /^(Back|Next|Skip|Get Started|Let's go|Import.*|I'll do this later)$/;
    for (const b of document.querySelectorAll('.wizard-card button, .skip-setup-link')) {
      const name = (b.innerText || '').trim();
      if (!names.test(name)) continue;
      const s = getComputedStyle(b);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      b.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { out.push(`${name}: zero size`); continue; }
      if (r.left < -0.5 || r.right > W + 0.5) out.push(`${name}: spans ${Math.round(r.left)}..${Math.round(r.right)} of ${W}px`);
      if (r.top < -0.5 || r.bottom > window.innerHeight + 0.5) out.push(`${name}: vertical ${Math.round(r.top)}..${Math.round(r.bottom)} cannot be scrolled into view`);
      const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), W - 1), Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1));
      if (!b.disabled && (!hit || !(b === hit || b.contains(hit)))) out.push(`${name}: covered by ${hit?.tagName.toLowerCase()}.${hit?.className}`);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return out;
  });
  assert.deepEqual(bad, [], `${label}: buttons not reachable`);
}

async function expectStep(page, n, label, opts) {
  await page.getByRole('status').filter({ hasText: `Step ${n} of 8` }).waitFor({ state: 'attached' });
  await page.waitForTimeout(300); // fade-in
  await expectButtonsReachable(page, label);
  await expectClean(page, label, { ...ICONS, ...opts });
}

async function walk(page, tag, { updatesLocked }) {
  const puts = [];
  const conflicts = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/updates/config') && r.request().method() === 'PUT') puts.push(r.status());
    if (r.status() === 409) conflicts.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  await goto(page, '/');
  await page.waitForURL(/#\/wizard/);

  // 1 welcome
  await expectStep(page, 1, `${tag}-welcome`);
  await page.getByRole('button', { name: 'Get Started' }).click();

  // 2 account
  await page.getByRole('textbox', { name: 'Username (required)' }).waitFor();
  await expectStep(page, 2, `${tag}-account`);
  await page.getByRole('textbox', { name: 'Username (required)' }).fill('admin');
  await page.getByRole('textbox', { name: 'Full name (optional)' }).fill('E2E Admin');
  await page.getByRole('textbox', { name: /^Email/ }).fill('admin@example.com');
  await page.getByLabel('Password (8+ chars, A-z, 0-9, special)').fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Next' }).click();

  // 3 units
  await page.getByRole('heading', { name: 'Measurement System' }).waitFor();
  await expectStep(page, 3, `${tag}-units`);
  assert.equal(await page.getByRole('button', { name: 'Next' }).isDisabled(), true, 'Next waits for a unit pick');
  await page.getByRole('button', { name: /Metric/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // 4 profile
  await page.getByRole('heading', { name: 'About you' }).waitFor();
  await expectStep(page, 4, `${tag}-profile`);
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Date of birth').fill('1990-05-17');
  await page.getByPlaceholder('cm').fill('172');
  await page.getByLabel('Current weight').fill('64.5');
  await expectStep(page, 4, `${tag}-profile-filled`);
  await page.getByRole('button', { name: 'Next' }).click();

  // 5 goal
  await page.getByRole('heading', { name: 'Weekly Goal' }).waitFor();
  await expectStep(page, 5, `${tag}-goal`);
  await page.locator('.goal-btn').filter({ hasText: /^5/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // 6 library (skipped: importing downloads from upstream)
  await page.getByRole('heading', { name: /Exercise Library/ }).waitFor();
  await page.waitForLoadState('networkidle');
  await expectStep(page, 6, `${tag}-library`);
  await page.locator('.wizard-nav').getByRole('button', { name: 'Skip' }).click();

  // 7 appearance, then Back and forward again
  await page.getByRole('heading', { name: 'Appearance' }).waitFor();
  await expectStep(page, 7, `${tag}-appearance`);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('heading', { name: /Exercise Library/ }).waitFor();
  await page.locator('.wizard-nav').getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Appearance' }).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();

  // 8 updates
  await page.getByRole('heading', { name: 'Check For Updates' }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await expectStep(page, 8, `${tag}-updates`);
  const note = page.getByText(/UPDATE_CHECK/);
  if (updatesLocked) await note.waitFor({ timeout: 3000 });
  else assert.equal(await note.count(), 0, 'toggle shown when the environment does not pin it');
  if (!updatesLocked) await page.getByRole('switch').click();
  await page.getByRole('button', { name: "Let's go" }).click();

  // done, then the Diary, signed in
  await page.getByRole('heading', { name: "You're All Set!" }).waitFor();
  await page.waitForURL((u) => !u.hash.startsWith('#/wizard'), { timeout: 8000 });
  await page.waitForLoadState('networkidle');
  assert.match(new URL(page.url()).hash, /^#\/?$/, 'lands on the Diary route');
  const me = await page.request.get('/api/auth/me');
  assert.equal(me.status(), 200, 'signed in');
  const body = await me.json();
  assert.equal((body.user ?? body).username, 'admin');
  assert.equal(await page.locator('.nav-tab[aria-current="page"]').first().getAttribute('aria-label'), 'Diary');
  await page.waitForTimeout(1200); // route fade-in, or axe samples half-transparent text
  await expectClean(page, `${tag}-diary`, ICONS);

  assert.deepEqual(conflicts, [], 'no 409 while finishing');
  if (updatesLocked) assert.deepEqual(puts, [], 'no PUT /api/updates/config when UPDATE_CHECK pins it');
  else assert.deepEqual(puts, [200], 'PUT /api/updates/config succeeds when the environment does not pin it');
}

for (const [view, theme, env, locked] of [
  ['narrow', 'light', { UPDATE_CHECK: '' }, false],
  ['phone', 'dark', { UPDATE_CHECK: 'off' }, true],
]) {
  test(`first-run wizard to the Diary ${view} ${theme} (UPDATE_CHECK ${locked ? 'off' : 'unset'})`, async () => {
    const server = await startServer({ env });
    servers.push(server);
    const page = await openPage(server, null, { view, theme });
    await walk(page, `wizard-steps-${view}-${theme}`, { updatesLocked: locked });
    await page.context().close();
  });
}

// The updates toggle is a bare switch: a screen reader hears "button" with no name.
test('wizard updates toggle has an accessible name', async () => {
  const server = await startServer({ env: { UPDATE_CHECK: '' } });
  servers.push(server);
  const client = await api(server, { register: true });
  const page = await openPage(server, client, { view: 'phone', theme: 'dark' });
  await goto(page, '/wizard');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Metric/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('.wizard-nav').getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('heading', { name: 'Check For Updates' }).waitFor();
  await page.waitForTimeout(300);
  await expectClean(page, 'wizard-updates-toggle-name', { ...ICONS, axeExclude: [] });
  await page.context().close();
});
