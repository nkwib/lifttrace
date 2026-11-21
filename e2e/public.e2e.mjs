// Signed-out pages: first-run wizard on a server with no accounts, sign-in,
// forgot and reset password, and accepting an invite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

let fresh, server, inviteToken;
before(async () => {
  [fresh, server] = await Promise.all([startServer(), startServer()]);
  const admin = await api(server, { register: true });
  const inv = await admin.call('POST', '/api/auth/invite', { email: 'new.member@example.com', role: 'member' });
  inviteToken = inv.inviteUrl.split('token=')[1];
});
after(async () => { await closeBrowser(); await Promise.all([fresh?.stop(), server?.stop()]); });

for (const view of ['narrow', 'phone', 'desktop']) {
  for (const theme of ['dark', 'light']) {
    test(`signed-out pages ${view} ${theme}`, async (t) => {
      const page = await openPage(server, null, { view, theme });
      await t.test('login', async () => { await goto(page, '/'); await expectClean(page, `login-${view}-${theme}`); });
      await t.test('forgot-password', async () => { await goto(page, '/forgot-password'); await expectClean(page, `forgot-${view}-${theme}`); });
      await t.test('reset-password', async () => { await goto(page, '/reset-password?token=not-a-real-token'); await expectClean(page, `reset-${view}-${theme}`); });
      await t.test('accept-invite', async () => {
        assert.ok(inviteToken, 'invite token from POST /api/auth/invite');
        await goto(page, `/accept-invite?token=${inviteToken}`);
        await expectClean(page, `invite-${view}-${theme}`);
      });
      await page.context().close();
    });

    test(`first-run wizard ${view} ${theme}`, async () => {
      const page = await openPage(fresh, null, { view, theme });
      await goto(page, '/');
      await page.waitForURL(/#\/wizard/);
      await expectClean(page, `wizard-${view}-${theme}`);
      await page.context().close();
    });
  }
}
