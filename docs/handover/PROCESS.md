# Process

## A round (`tooling/round.js`, Workflow tool)

Args: `{ main, done, round, base, lenses: [{ key, prompt }] }`. `base` is the sha all agents branch from (the integration tip).

1. **Scout:** one agent per lens returns 3 to 6 proposals with file:line evidence. Lenses used so far: bugs, UI/UX, performance, features, user flows, accessibility, Local-mode parity, data integrity (sync, time zones), server API/MCP, security, client perf, follow-up triage.
2. **Dedup:** merges overlaps and drops anything in `done.txt`.
3. **Round table:** for each proposal, three independent reviewers (correctness skeptic, product, maintainer). 2 of 3 approvals needed. Their refinements go to the implementer.
4. **Implement:** worktree-isolated agent. One commit on detached HEAD on top of `base`. It reports the sha. Agents cannot move refs (sandbox).
5. **Review:** ship, fix or drop. On fix: a fix agent amends, then a re-review.
6. Returns `[{ slug, title, final, sha, reviews, ... }]`. Merge only `final == 'ship'`.

## Smoke round (`tooling/smoke.js`)

Args: `{ main, pw, base, flows: [{ key, port, prompt }] }`. Each flow agent boots its own server (own port and temp DB) and drives the built app with Playwright. Findings are reproduced by an independent agent, then go through the same fix and review steps. Expect duplicate findings across flows; keep one fix each.

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

## Run state files (`tooling/run-state/`)

- `done.txt`: shipped and rejected titles per round. Scouts read it to avoid re-proposing. Rounds 1 to 4 are in it; round 5 and the smoke round are not yet.
- `followups-r1..r5.txt`: reviewer notes on shipped changes. Round 5's follow-up lens already triaged rounds 1 to 4.
- `manual-merges.txt`: hunks resolved by hand during integration, which carry the highest risk of semantic bugs.
