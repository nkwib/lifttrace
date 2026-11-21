# E2E

Browser tests against the real server and the built app. Separate from `npm test` (unit, `scripts/*.test.js`).

```sh
npm run build                      # e2e serves dist/
npx playwright-core install chromium-headless-shell   # once per machine
npm run e2e                        # all specs, about a minute
node --test e2e/pages.e2e.mjs      # one file
```

Each file boots its own server (free port, temp data dir), creates the admin through the API and seeds through the API. `CHROME_PATH` overrides the browser binary.

## What every page gets checked for

`checkPage()` in `harness.mjs` runs on each page a spec visits:

- uncaught page errors, console errors, 5xx responses (4xx resource logs are ignored; assert on those in the spec)
- raw i18n keys from `en.json` shown as text, aria-label, title or placeholder
- sideways page scroll, controls and headings past the viewport edge, titles clipped without an ellipsis
- axe-core: accessible names, ARIA validity, nested interactive controls, color contrast

`expectClean(page, label)` fails with one line per problem and the path of a screenshot. Read the text first; open the screenshot only if the text is not enough.

## Specs

- `pages.e2e.mjs`: every signed-in route at 320px, phone and desktop, dark and light.
- `public.e2e.mjs`: wizard on a server with no accounts, sign-in, forgot and reset password, accept invite.

Add a flow as `e2e/<flow>.e2e.mjs`: seed through `api()`, drive with role and text selectors, call `expectClean` after each step that changes the screen.
