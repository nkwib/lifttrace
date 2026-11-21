# Process

## A round (`tooling/round.js`, Workflow tool)

Args: `{ main, done, round, base, lenses: [{ key, prompt }] }`. `base` is the sha all agents branch from (the integration tip).

1. **Scout:** one agent per lens returns 3 to 6 proposals with file:line evidence. Lenses used so far: bugs, UI/UX, performance, features, user flows, accessibility, Local-mode parity, data integrity (sync, time zones), server API/MCP, security, client perf, follow-up triage.
2. **Dedup:** merges overlaps and drops anything in `done.txt`.
3. **Round table:** for each proposal, three independent reviewers (correctness skeptic, product, maintainer). 2 of 3 approvals needed. Their refinements go to the implementer.
4. **Implement:** worktree-isolated agent. One commit on detached HEAD on top of `base`. It reports the sha. Agents cannot move refs (sandbox).
5. **Review:** ship, fix or drop. On fix: a fix agent amends, then a re-review.
6. Returns `[{ slug, title, final, sha, reviews, ... }]`. Merge only `final == 'ship'`.

## E2E round (`tooling/e2e-round.js`, replaces `smoke.js`)

The first smoke round spent most of its tokens on agents rediscovering how to boot the server, seed it and find selectors, writing throwaway Playwright scripts, reading screenshots, and an independent agent doing it all again to reproduce each finding. None of it was kept.

Now the browser checks are code in `e2e/` (see `e2e/README.md`):

1. **Run the specs yourself, no agents:** `npm run build && npm run e2e`, about 2 minutes for ~170 tests. `checkPage()` catches the usual smoke findings in code: uncaught errors, 5xx, raw i18n keys, leaked icon ligature names, overflow, clipping, axe names and contrast.
2. **Fix only what is red.** A failing test is the reproduction, so there is no reproduce stage. Group failing lines by cause and hand each group to one fix agent whose acceptance check is the spec going green. Reviewers rerun the spec. Screenshots are saved on failure, but only opened when the text report is not enough.
3. **New coverage is written once.** `e2e-round.js` gives each uncovered flow to one agent that commits `e2e/<flow>.e2e.mjs`; later rounds rerun it for free.

Args for `e2e-round.js`: `{ main, base, flows: [{ key, prompt }], failing: [{ file, name, report }] }`.

Cost seen in session 2: authoring 3 small flows took 7 agents and about 360k tokens. 3 Diary and Programs flows took 17 agents, about 920k tokens and 2.4 h. Most of the difference was duplicate fix agents for one defect, now deduped by `slug`, and one fix for a feature the round table had rejected. Authors now check the Rejected lists first. Give authors narrow flows: one agent per flow writing a 150 to 250 line spec is the sweet spot.

`smoke.js` is kept for reference only.

## Integration

1. Save `slug sha` lines for shipped results, security fixes first.
2. `REPO=<repo> tooling/pick.sh shas.txt` cherry-picks in order. On conflicts it tries, in order:
   - `linewise.py`: diff3, line by line.
   - `imports.py`: unions additions to import lines only.
   - `addunion.py`: both sides added hunks in tests, CHANGELOG, docs and en.json.

   It stops on anything else. Resolve by hand (`resolve.py <file> ours|theirs|union|dedup` helps), run `git cherry-pick --continue`, then rerun with the remaining lines. `pick.sh` does not trim its input file.
3. Run `npm run build` (catches duplicate imports), `npm run i18n:check`, then the full suite.
4. Check that the diff adds no em dashes: `git diff <prev> | grep '^+' | grep $'\u2014'`.

Use `git config merge.conflictstyle diff3` and enable rerere.

## Gotchas seen in this run

- **Semantic merge bugs pass both review and textual merge.** Examples: duplicate imports, a variable used outside its new scope after two Trace changes merged, two features adding the same import. `vite build` catches duplicate imports, but not scope bugs in Svelte markup.
- **Wiring tests grep source.** Markup or naming changes in one commit break another commit's test. Fix the test regex rather than reverting.
- **Hash-pinned shared files.** `src/components/two-step/*`, `server/lib/two-step*.js` and the cookie and plain-HTTP files are shared across Trace apps and pinned by hash (`scripts/two-step-wiring.test.js`, `cookie-check.test.js`). Never edit them; revert agent edits.
- **CRLF files.** Several `src/components/ui` and `src/styles` files are CRLF. Agents tend to convert them, which causes whole-file conflicts.
- **node_modules symlinks.** Agents symlink `node_modules` and `server/node_modules` in their worktree. If one gets committed and the pick is later reset, the real `server/node_modules` is deleted. Check `git show --stat` for symlinks before picking.
- **Locales.** Only `en.json` gets new strings. ICU plural changes may need the same placeholder in other locales.
- **Full suite** takes about 10 minutes (2,591 tests). Run single files while iterating, and never two full runs at once.
- **Usage limits** kill a whole workflow at once. Resume with `resumeFromRunId` from the same session; a new session cannot resume, so relaunch.
- Don't `pkill -f 'node --test'`: it can kill the shell running it.
- **macOS hosts:** `scripts/session-version.test.js` and `scripts/two-step-server.test.js` (34 tests) bind `127.0.0.10`, which macOS does not route by default (`EADDRNOTAVAIL`). They pass on Linux. To run them on a Mac: `sudo ifconfig lo0 alias 127.0.0.10 up`.

## Run state files (`tooling/run-state/`)

- `done.txt`: shipped and rejected titles per round. Scouts read it to avoid re-proposing. Rounds 1 to 5 and the smoke round are in it.
- `followups-r1..r5.txt`: reviewer notes on shipped changes. Round 5's follow-up lens already triaged rounds 1 to 4.
- `manual-merges.txt`: hunks resolved by hand during integration, which carry the highest risk of semantic bugs.
