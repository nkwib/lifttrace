# Improvement backlog (autonomous run, 2026-11-21)

Work found or started by the autonomous improvement run but NOT on this branch. Everything here is verified against commit 5b29f8c unless noted.

Unmerged commits below are detached commits from agent worktrees (reachable while the local worktree objects exist, not pushed). Treat them as drafts: none has passed review unless marked.

## 1. Smoke test defects (real app in headless Chromium, independently reproduced)

The fix for the exercise picker crash (`ExercisePicker.svelte` missing `import { _ } from 'svelte-i18n'`) is already on this branch.

### High
- **Workout editor header overflows on phones**: Save button clipped, whole page scrolls horizontally (`src/routes/WorkoutEditor.svelte`).
- **Overlays ignore Escape and have no focus trap**: sidebar drawer, Load type menu, Gym Tools sheet, Body Stats sheet.

### Medium
- Exercise detail keeps showing the previous exercise when only the `:id` route param changes (stale on navigation). Draft fix `06aae3a5fd`.
- Users settings: Session Duration row overflows the card, Save clipped on phones. Draft fix `adb778180e`.
- At 320px the rest bar "REST" label overlaps the countdown. Draft fix `d54db0af58`.
- Programs page title clipped or collapsed at 320px and 390px.
- Settings switches and selects have no accessible name.
- Diary: icon ligature text leaks into accessible names, nested button inside `role=button`, set inputs unnamed.
- Profile back button and password show/hide toggle unnamed.
- Notifications permission hint uses nonexistent `--warn` token, amber on white (1.78:1) in light theme.

### Low
- Wizard finish: `PUT /api/updates/config` returns 409 when `UPDATE_CHECK` is set in env. Draft fix `0f19bab2ec`.
- At 320px exercise name truncates mid-word and superset header wraps. Draft fix `781e9bb288`.
- Superset sheet says "Create superset (1 exercises)"; superset remove button unnamed. Draft fix `d0f8d01563`.
- Light theme: accent text and white-on-accent buttons below 4.5:1, muscle chip about 2:1.
- Bottom nav marks Diary as current on exercise detail.
- Exercise editor chips expose no selected state (`aria-pressed`); primary and secondary muscles indistinguishable.
- Focus drops to body after "Remove from superset" in the exercise More sheet.
- Program detail and workout editor show a blank body with no message or Retry when the load fails.
- Profile save without touching height changes height when the unit is ft/in.
- Exercise detail title hard-clipped at 320px (no ellipsis).
- Trace assistant bubble has an extra blank line above the text.

Not reproduced (dropped): Set Active offline shows false success.

## 2. Round 5 proposals (approved by the 3-reviewer round table)

### Implemented, review pending (draft commits)
| Change | Commit |
|---|---|
| Android Local: list, back up now, share and restore on-device backups (review: ship) | `4cdb297751` |
| Statistics 1Y/All: Track Cardio toggle leaves stale wide set; sync blanks calories and deltas | `e29be1405a` |
| Trace weigh-in updates the profile weight used for calorie burn | `2650fea355` |
| Diary and DatePicker month calendars honour the week-start setting | `59b20c3e31` |
| MCP and REST v1 default "today" uses the account zone, not the server's | `73d3f3436a` |
| Garmin FIT import dates workouts in local time, not UTC | `6d541a4734` |
| Workout-complete celebration unmutes after midnight | `df40531ffd` |
| `get_exercise_progress` prefers an exact name match | `1cbad1ff2a` |
| `get_workout` / `GET /api/v1/workouts/:date` expose `workout_id` and extra same-day sessions | `efa3c9dd08` |
| REST: fractional/NaN `limit`/`offset` crash; `/api/exercises` offset without limit is a SQL error | `381327243e` |
| Security: reject `../` in progress photo and set video URLs (members could read or delete backups and other users' files) | `15ac8d26cb` |
| Security: webhook delivery pinned to the checked IP (DNS rebinding) | `7f4399f30a` |
| Warm-up generator equipment aware (dumbbell, machine) | `58933cfd0b` |
| Estimated 1RM trend line on exercise detail | `51f80bea85` |
| Stalled lift flag and deload suggestion on exercise detail | `20ebf764e0` |
| Rep-max table on exercise detail | `b1002ff77a` |
| Programs page create sheet, duration hint and preview i18n | `b7e03f962b` |

The two security fixes (`15ac8d26cb`, `7f4399f30a`) should be reviewed and merged first.

### Approved, not implemented yet
- Login throttle: trust-proxy support, count only failures, rate-limit current-password checks.
- Per-exercise sticky notes carried to every future session.
- Undo after removing a filmed set loses its clip; removal orphans the file.
- Replace `sv-SE` `toLocaleDateString` "today" idiom with `localDateStr`; fix `monthsAgo` overflow.
- Import and backup restore: oversize file returns "Internal server error" instead of 413.
- Diary: Finish button, empty states, widget and week-nav labels hardcoded English.
- Workout summary, exercise preview and picker: hardcoded English toasts, tooltips, aria-labels.
- Subset the 5.3 MB Material Symbols font to used glyphs.
- Diary: after a sync, reread dates and histories only when workouts changed.
- Radio: lazy-load and async-decode cover art and station icons.

### Rejected by the round table
- `GET /api/cardio` ignoring a lone start or end bound (1/3).
- SQL prefilter for records scan (0/3).

## 3. Known gaps in merged work (reviewer notes)
- Android Local mode importer parity with the server import dedupe was not verified.
- Local `clearData` omits progress photos and media.
- `sync.js` template writes via the offline path do not trim or reject blank names (REST and Local do).
- Several new tests are source-grep wiring tests rather than behavioral tests.
