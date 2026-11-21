# Handover: autonomous improvement run

Start here. Written 2026-11-21 for the agent taking over on a new host; updated at the end of session 2.

| Doc | What |
|---|---|
| [DONE.md](DONE.md) | Every shipped change, by round |
| [../plans/improvement-backlog.md](../plans/improvement-backlog.md) | What is open: device checks, known gaps, rejected ideas, uncovered flows |
| [PROCESS.md](PROCESS.md) | How a round runs, how commits are integrated, gotchas |
| [SPLIT.md](SPLIT.md) | How to split the branch into stacked PRs |
| [tooling/](tooling/) | Workflow scripts, merge helpers, run state (do-not-propose list, reviewer follow-ups) |

## Where we are

- **Branch:** `improve/autonomous-rounds` on `origin` has session 1 (194 commits on `dev` 5bdbc38). Session 2 added about 30 commits on the local branch `resume-improvement-run-e2e-strategy`, not pushed. Not merged, no PR.
- **Content:** 5 improvement rounds (158 shipped changes), 1 browser smoke round (22 fixes), plus integration fixes. See DONE.md.
- **Verification at the tip (session 2, macOS):**
  - Unit suite: 2,588 of 2,623 pass, 1 skipped. All 34 failures are `EADDRNOTAVAIL 127.0.0.10` in `session-version` and `two-step-server`: macOS loopback, not code (see PROCESS.md). Tests touched by the last 2 commits were rerun: 126 of 126 pass.
  - `npm run e2e`: 257 of 257 pass, about 3 min. `vite build` and `npm run i18n:check` pass.
- **Not verified anywhere:** Android device behavior (Local mode backup and restore UI, icon font subset in the WebView, Wear OS). See the backlog.

## Session 2 (2026-11-21, macOS host): what was done

All four recommended items from session 1 were worked. Commits are on the local branch `resume-improvement-run-e2e-strategy` (worktree `sudden-seahorse`), not pushed.

1. **Integration review.** 4 area finders and 4 adversarial verifiers. 9 findings, 8 confirmed and fixed: Statistics after midnight loaded yesterday's range, wide trained days missed cardio past 500 sessions, the Diary empty-day list went stale after a sync, a Trace timeout showed as "needs a connection", Local mode never saved Trace history (pre-existing), Retry stayed on old error notes, a stale MCP description, and assisted lifts got e1RM/rep-max panels.
2. **E2E instead of agent smoke rounds.** The new `e2e/` harness (see `e2e/README.md` and PROCESS.md, "E2E round") runs about 190 browser tests in about 2 minutes, with no agents. Its first runs found and fixed: light-theme contrast (accent ink, danger, chart toggle, Settings), unnamed selects and invite fields, nested buttons in program day cards, the Exercises row overflowing at 320px, icon ligature text leaking into the accessible name of about 680 controls app-wide, the unnamed wizard updates toggle, and unnamed photo thumbnails. A later E2E round added Diary logging, supersets and day navigation, and the Programs editor (257 tests in total), and fixed the NOW badge and calendar contrast, unlabeled New program fields, and the untranslated "(1 exercises)" superset button. New specs cover the flows session 1 listed as uncovered: wizard walkthrough at 320px, accept-invite, backup create and restore, photo compare slider, every Statistics tab with 12 weeks of data, and every Settings section.
3. **Backlog known gaps:** the Local restore safety snapshot now includes uploads and is pruned, the restore toast is translated only, offline template names are trimmed and blanks refused, a Track Cardio flip no longer shows stale days, the Diary cardio range is explicit, and the PR card shows no e1RM for assisted lifts. Two were checked and closed with no change: Local clearData has no photo or media tables, and the Local importer already matches the server's dedupe.
4. **Split plan:** see [SPLIT.md](SPLIT.md). Regrouping by area does not apply cleanly; use a stack of contiguous slices.

## What is left

- Device checks in the backlog (Android Local backup UI, icon subset in the WebView, `TRUST_PROXY`).
- SMTP invite sending: not covered by E2E. It needs a fake SMTP listener in the harness.
- Icon spans inside `src/components/two-step/*` are not `aria-hidden`. The files are hash-pinned and shared with the other Trace apps, so fix them upstream.
- Toggles in other Settings components have no label prop passed. The sweep did not flag them because the toggle's row label names them. Check with a screen reader.
- Push the branch and open the stacked PRs (owner).

## Setting up the new host

1. Clone, `git checkout improve/autonomous-rounds`, `npm ci`, `(cd server && npm ci)`.
2. E2E: `npm run build`, `npx playwright-core install chromium-headless-shell`, `npm run e2e`. The harness links `server/dist` itself; add `server/dist` to `.git/info/exclude`.
3. Workflow scripts take paths as args (`main`, `base`, and for `round.js` `done`). See PROCESS.md.
5. `done.txt` covers rounds 1 to 5 and the smoke round.
