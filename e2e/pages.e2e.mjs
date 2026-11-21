// Route sweep: every main page, at 320px, phone and desktop, in light and
// dark, must load with no uncaught errors, no 5xx, no raw i18n keys, no
// sideways scroll or clipped titles, and no axe violations.
import { test, before, after } from 'node:test';
import { startServer, api, openPage, goto, expectClean, closeBrowser } from './harness.mjs';
import { seedBasics } from './seed.mjs';

let server, client, seed;
before(async () => {
  server = await startServer();
  client = await api(server, { register: true });
  seed = await seedBasics(client);
});
after(async () => { await closeBrowser(); await server?.stop(); });

const ROUTES = () => [
  ['diary', '/'],
  ['exercises', '/exercises'],
  ['exercise-detail', `/exercise/${seed.exerciseId}`],
  ['programs', '/programs'],
  ...(seed.programId ? [['program-detail', `/programs/${seed.programId}`]] : []),
  ['statistics', '/statistics'],
  ['progress', '/progress'],
  ['settings', '/settings'],
  ['profile', '/profile'],
  ['coach', '/coach'],
];

for (const view of ['narrow', 'phone', 'desktop']) {
  for (const theme of ['dark', 'light']) {
    test(`pages ${view} ${theme}`, async (t) => {
      const page = await openPage(server, client, { view, theme });
      for (const [name, hash] of ROUTES()) {
        await t.test(name, async () => {
          await goto(page, hash);
          await expectClean(page, `${name}-${view}-${theme}`);
        });
      }
      await page.context().close();
    });
  }
}
