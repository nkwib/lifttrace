# Splitting the branch for review

## Why not by area

Regrouping the commits by area (security, server/API/MCP, Local mode, Trace, Statistics, Diary, programs, a11y/i18n) was trial-built on `dev` with the merge helpers. It produced 174 conflicts the helpers could not resolve, almost all in `CHANGELOG.md`, which was restructured several times during the run. Areas would have to be re-authored as fresh squashes, which loses the per-change history and review notes.

## Recommended: a stack of contiguous slices

Slices of the original order apply cleanly by construction. Each slice ends at a commit where the CHANGELOG was consolidated, so every PR leaves a coherent Unreleased section. Sizes exclude `docs/handover`.

| # | Range | Commits | Diff | Content |
|---|---|---|---|---|
| 1 | `5bdbc38..bffc429` | 30 | 105 files, +3.6k/-0.3k | Round 1 |
| 2 | `bffc429..299b69d` | 30 | 85 files, +2.2k/-0.4k | Round 2, first half |
| 3 | `299b69d..b371623` | 65 | 169 files, +5.4k/-0.6k | Round 2, second half, and round 3 |
| 4 | `b371623..5b29f8c` | 16 | 47 files, +1.2k/-0.2k | Round 4 tail |
| 5 | `5b29f8c..16461a5` | 53 | 215 files, +8.7k/-0.8k | Round 5, browser smoke round, integration fixes |
| 6 | `16461a5..<tip>` | 31 | 118 files, +2.1k/-0.8k | E2E harness and specs, the fixes they found, integration-review fixes, backlog gaps |

Slice 3 and slice 5 are large. To halve them, split at any commit that leaves `npm test` green. Run the suite at each new boundary.

DONE.md has the per-round change lists to use as PR descriptions.

## Do not merge

`docs/handover/` (handover notes, workflow scripts, run state) is tooling for the agent run, not product documentation. Drop it from the last PR: `git rm -r docs/handover` on top of slice 6, or exclude the three `docs(handover)` commits. `e2e/` stays: it is the regression harness for the team.

## Commands (for the owner to run)

With `gh stack` (see the gh-stack skill), from a clean checkout of `improve/autonomous-rounds`:

```sh
git branch review/1-round1        bffc429
git branch review/2-round2a       299b69d
git branch review/3-round2b-3     b371623
git branch review/4-round4-tail   5b29f8c
git branch review/5-round5-smoke  16461a5
git branch review/6-e2e-fixes     <tip after dropping docs/handover>
```

Then open PR 1 against `dev`, each next PR against the previous branch, and merge in order.
