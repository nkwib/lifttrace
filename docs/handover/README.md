# Handover: autonomous improvement run

Start here. Written 2026-11-21 for the agent taking over on a new host.

| Doc | What |
|---|---|
| [DONE.md](DONE.md) | Every shipped change, by round |
| [../plans/improvement-backlog.md](../plans/improvement-backlog.md) | What is open: device checks, known gaps, rejected ideas, uncovered flows |
| [PROCESS.md](PROCESS.md) | How a round runs, how commits are integrated, gotchas |
| [tooling/](tooling/) | Workflow scripts, merge helpers, run state (do-not-propose list, reviewer follow-ups) |

## Where we are

- **Branch:** `improve/autonomous-rounds` on `origin` (`nkwib/lifttrace`), 194 commits on top of `dev` (5bdbc38). Not merged, no PR.
- **Content:** 5 improvement rounds (158 shipped changes), 1 browser smoke round (22 fixes), plus integration fixes. See DONE.md.
- **Verification at the tip:**
  - Full suite at the round 5 merge: 2,589 of 2,591 pass, 1 skipped. The one failure, a CHANGELOG blank line, is fixed.
  - After the final small commit (em dash and spacing cleanup), only the 784 affected tests, `vite build` and `npm run i18n:check` were rerun. All pass.
  - Rerun the full suite once on the new host: `npm ci && (cd server && npm ci) && npm test`, about 10 minutes.
- **Not verified anywhere:** Android device behavior (Local mode backup and restore UI, icon font subset in the WebView, Wear OS). See the backlog.

## Rounds remaining

No fixed count. The run was time-boxed to 2026-11-21 18:00. A full round took about 2 to 3 hours (scout, round table, implement, review, fix, re-review), then about 30 minutes to integrate and test. That leaves room for roughly 3 more rounds.

Yield is falling. Round 5 scouts found fewer real defects, and reviewer notes are mostly test-style nits. Recommended use of the remaining time, in order:

1. **Integration review of the branch as a whole.** Each change was reviewed alone; their seams were not. Start with `tooling/run-state/manual-merges.txt` (hand-resolved hunks), Trace send/stop/retry/clear, Statistics loaders, ExerciseDetail (three new panels: e1RM trend, stall hint, rep-max table), Diary.
2. **Second smoke round** on flows not covered: accept-invite, SMTP invites, backup create and restore, photo compare slider, wizard at 320px, Records tab with dense data. Use `tooling/smoke.js`.
3. **Backlog "known gaps"** as a normal round, with the backlog as the scout input.
4. **Split for review.** 194 commits is too many for one PR. Group by area (server/API/MCP, security, Diary, Statistics, programs, Local mode, a11y and i18n) or land as one squash per round.

## Setting up the new host

1. Clone, `git checkout improve/autonomous-rounds`, `npm ci`, `(cd server && npm ci)`.
2. For smoke runs: `npm run build`, then `ln -sfn ../dist server/dist` and add `server/dist` to `.git/info/exclude`.
3. Install Playwright next to `tooling/launch.js` (`npm i playwright-core`, `npx playwright install chromium`). Set `CHROME_PATH` to the binary.
4. Workflow scripts take paths as args. Pass `main` (absolute repo path), `done` (absolute path to `tooling/run-state/done.txt`) and `pw` (absolute path to `launch.js`). See PROCESS.md.
5. Before the next round, append round 5 and the smoke round to `done.txt`, using the titles in DONE.md.
