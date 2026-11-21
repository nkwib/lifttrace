// Accept-invite flow: a signed-out visitor follows an admin's invite link.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';

const PASSWORD = 'Invite-pass-0192!';
const skip = { skip: ['icons'] };

let server, admin;
before(async () => {
  server = await startServer();
  admin = await api(server, { register: true });
});
after(async () => { await closeBrowser(); await server?.stop(); });

const newInvite = async () => {
  const { inviteUrl } = await admin.call('POST', '/api/auth/invite', {});
  const token = new URL(inviteUrl.replace('/#/', '/')).searchParams.get('token');
  assert.ok(token, 'invite url carries a token');
  return token;
};

for (const view of ['narrow', 'desktop']) {
  test(`accept invite signs the new member in ${view}`, async () => {
    const token = await newInvite();
    const username = `member-${view}`;
    const page = await openPage(server, null, { view });
    await goto(page, `/accept-invite?token=${token}`);
    await page.getByRole('button', { name: 'Create account' }).waitFor();
    await expectClean(page, `accept-invite-form-${view}`, skip);

    await page.getByPlaceholder('Choose a username').fill(username);
    await page.getByLabel('Password *', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password *').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Account created!').waitFor();
    await expectClean(page, `accept-invite-done-${view}`, skip);

    const me = await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).json());
    assert.equal(me.username ?? me.user?.username, username, 'signed in as the new member');

    const invites = await admin.call('GET', '/api/auth/invites');
    assert.ok(!invites.some((i) => i.token === token), 'used invite is gone from the pending list');
    await page.context().close();
  });

  test(`mismatched confirm shows an inline error and does not submit ${view}`, async () => {
    const token = await newInvite();
    const page = await openPage(server, null, { view });
    let posted = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/auth/accept-invite')) posted++; });
    await goto(page, `/accept-invite?token=${token}`);
    await page.getByPlaceholder('Choose a username').fill(`mismatch-${view}`);
    await page.getByLabel('Password *', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password *').fill(`${PASSWORD}x`);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Passwords do not match').waitFor();
    assert.equal(posted, 0, 'nothing was sent');
    await expectClean(page, `accept-invite-mismatch-${view}`, skip);
    const invites = await admin.call('GET', '/api/auth/invites');
    assert.ok(invites.some((i) => i.token === token), 'invite is still pending');
    await page.context().close();
  });

  test(`unknown token shows an error state ${view}`, async () => {
    const page = await openPage(server, null, { view });
    await goto(page, '/accept-invite?token=deadbeef');
    await page.getByText(/invite link is invalid or has expired/).waitFor();
    await page.getByRole('button', { name: 'Back to sign in' }).waitFor();
    await expectClean(page, `accept-invite-unknown-${view}`, skip);
    await page.context().close();
  });
}
