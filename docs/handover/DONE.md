# What was done

Branch `improve/autonomous-rounds` (pushed to `origin`, based on `dev` 5bdbc38). Per round: scouts proposed changes; a 3-reviewer round table (correctness skeptic, product, maintainer) approved with at least 2 of 3 votes; an agent implemented each in an isolated worktree; a reviewer checked it; a fix pass and re-review ran when needed. Only `ship` verdicts were merged.

## Round 1: 28 shipped, 0 rejected

- clear-data-single-user
- scope-exercise-reads
- import-same-day-sessions
- load-workout-race-guard
- undo-remove-set
- calorie-met-lbs-unit
- auth-duplicate-username-409
- csv-multiline-import
- profile-weight-lossless
- exercise-delete-uploads
- coaching-local-date
- collapsed-card-best-set
- rest-bar-shorten-a11y
- confirm-dialog-swap
- validate-write-dates
- icon-button-labels
- wizard-a11y
- overlay-focus-escape
- diary-header-keyboard-a11y
- trace-lazy-load
- exercises-list-perf
- list-load-error-state
- i18n-diary-literals
- gym-tools-one-rm
- export-all-workouts-csv
- workout-history-sql-filter
- sync-state-split
- program-share-json

## Round 2: 37 shipped, 0 rejected

- CSV exports: fix nonexistent LtApi.listExercises (alternating L/R) and use local date in filename
- Android Local workout importer: match (date,name) sessions and pair like the server
- Exercise-delete upload cleanup: reject ../ paths inside /uploads/exercises/ prefix
- Move remaining hardcoded English (App, ProgramDetail, Exercises, WorkoutModeBar, ExerciseInfoSheet, SetRow ' ea') to en.json
- Local body-stats: honour start/end range and use the server's per-key merge on PUT
- Local exercise progress totalVolume honours load type and split reps
- Local workout, body-stats and cardio writes refuse non-calendar dates and out-of-range cardio
- Local cardio templates list dedupes by activity like the server
- REST/log_set: validate reps, weight, rpe, warmup, completed types and ranges in logSetCore
- PUT /api/v1/body-stats/:date: type-check values, refuse unknown keys and unknown weight_unit
- MCP/REST tools accept impossible dates like 2026-02-31 (DATE_RE only)
- workout.completed webhook sends the day's first session, not the one just completed
- list_recent_workouts: deterministic order and session_seq; fix webhook delivery id doc
- Statistics: weekly averages and charts count weeks with no training
- Records: more reps at the same max weight updates the record
- Exercise detail: mark warm-ups, show units, split reps for any load type, richer PR card, show all history
- Statistics: range chip tap refetches range-independent data and loads progress twice
- Weekly bar charts: readable labels and tap-to-read values on phones for 6M/1Y/All
- Coach re-assign no longer wipes the client's start date or deactivates their active program
- Validate prescription dates on create and edit (calendar date or null)
- Android Local: show session count for one-week programs; translate the card's 'session(s)' label
- Android Local: re-activating the already active program must not restart it
- Server restore: validate the archive before wiping, snapshot first
- Invite: SMTP failure must still return the invite link
- Scheduled backup: back off after a failure instead of retrying and pushing every 15 min
- Android local backup: include cardio, restore atomically, report failures
- Sign-in cookie lifetime: register, reset-password and accept-invite ignore the session setting
- Reject unknown roles when an admin creates an account or invite
- PWA update banner never fires: workbox skipWaiting contradicts registerType prompt
- Pausing mid-crossfade leaves the second audio element playing, then resumes the main one
- ICY now-playing poll: stale response from previous station, overlapping requests, polls while paused/hidden
- startBackgroundSync stacks duplicate online/offline/visibility listeners and boot timers
- Statistics activity heatmap shaded by time trained (plan item 6)
- Scope screen wake lock to the open workout, release when it ends or Diary is left (plan item 2)
- Checked-in openapi.yaml for /api/v1 with a route-coverage test (plan item 13)
- Week start setting (Monday or Sunday) for server and Local week bucketing (plan item 1)

- RIR as an alternative to RPE per user, each set stores its scale (re-review asked for fixes; merged with follow-up fixes by the orchestrator)

## Round 3: 32 shipped, 5 rejected

- Statistics weekly charts: fillWeeks ignores weekStartsOn, Sunday-start users get zero-filled charts
- Trace training summary: weekly_avg and weekly series skip empty weeks, contradicting Statistics
- Undo toast is drawn on top of the workout pill (timer and keep-awake toggle)
- Routine import errors shown as hardcoded English toasts
- Week start setting has no effect on server stats in no-accounts mode (web), so client and server week keys disagree
- Workouts saved with an impossible date (2026-02-31) can no longer be deleted
- openapi.yaml SetInput omits fields and limits the REST endpoint now enforces
- Trace log_set and log_workout coerce bad values to 0 instead of rejecting them (client parity with server set-input)
- Android Local workout import commit runs as one transaction
- Changing the backup schedule clears the failure backoff
- Direct unit tests for resolveUploadSubdirPath (runs without better-sqlite3)
- Trace log_body_stat saves nothing or garbage: wrong key names, object values, kg label for lb users
- Env-locked Trace: provider errors (bad key, quota, unknown model, network) show as 'Internal server error'
- Trace: Stop button, request deadline for direct providers, and no reply after Clear
- Trace failure bubbles are stored as assistant turns, hardcoded English, and resent to the model
- Scheduled-backup failure push: fix pushNotify arguments (title, body and priority are shifted)
- Scheduler tick: one user's error must not skip every later user and the housekeeping
- Separate opt-out for the weekly summary email
- Workout reminder push names the program's next day, not always its first
- Persist reminder and summary send markers so a restart in the due window does not resend
- Editing a custom exercise can't clear its picture, instructions, tips or category (server PUT ignores null)
- Library and picker search also match muscles, equipment and category, not only the name
- Custom exercise names: warn on duplicates and reject blank names on server and Android Local
- Deleting a used custom exercise: show how many workouts log it
- Workout timer: tick only while something watches, seconds-granular store for the rest
- Coalesce concurrent getWorkoutHistory requests when the Diary opens or syncs
- Diary empty-state reactive refetches recent workouts on every todayLog update
- Enter/Space activation for role=button rows (Radio, FullPlayer queue, ProgramDetail template cards, Profile avatar, Trace FAB)
- FullPlayer seek and volume bars as keyboard-operable sliders
- Raise --text-3 and light-theme status colors to readable contrast
- Fix the Diary progression chip: respect rep ranges, explain the reason, use equipment increments
- Inline plate split under the weight field, with a per-exercise bar weight

Rejected:
- Memoize per-exercise history bests so a keystroke does not rescan all history
- Stop re-filtering coach feedback and rebuilding supersetGroups per render for every exercise
- Escape closes the Radio context menu and template/set number and RPE pickers
- Add past workout: date picker flow in Diary with existing-session choice
- Count body weight in volume for bodyweight rep exercises

## Round 4: 34 shipped, 1 rejected

- Workout pill shows a frozen '.00' centisecond suffix
- Rapid day navigation attaches the wrong day's coach feedback and set media
- Feed library equipment to the progression chip (per-equipment increments and bodyweight rule are inert)
- Removing a whole superset has no Undo, unlike set and exercise removal
- RIR/RPE level chip colours bypass the new 4.5:1 contrast tokens
- Statistics Cardio tab: count empty weeks in average, on-target and bars
- Trace: image messages are never saved to history, and reloaded messages lose their timestamps
- Statistics progress tab: out-of-order responses show the wrong exercise or range
- Statistics keeps yesterday as 'today' when left open past midnight
- Statistics: 365-session cap on workout/recent skews 1Y and All calories and period deltas
- Bad embedded picture and bad OIDC provider form show 'Internal server error'
- Workout import preview/commit never detect duplicates or pick correct session_seq in no-accounts mode
- Workout reminder in no-accounts mode still always names the program's first day (and drop dead assignment query)
- Android Local: exercise history is truncated to 50 workouts, the server returns all
- Android Local 'Clear All Data' leaves cardio sessions and workout tombstones behind
- Android Local exercise usage count double counts an exercise done in two sessions on one day
- Light theme: status text still uses raw --success/--warning fills (2.3:1 and 2.5:1)
- Escape in the custom-equipment field closes the whole exercise editor and discards edits
- Time picker, sync challenge, wizard skip modal, full player and test-email dialog ignore Escape and focus trapping
- CHANGELOG [Unreleased]: duplicate Fixed headings, fixes filed under Added, duplicate Sunday-week entries
- Program/WorkoutEditor: trim and validate day name, translate remaining hardcoded English
- WorkoutEditor: confirm before leaving with unsaved changes
- Fix exercise Move up/down tearing supersets apart
- Reorder program days on phones (drag-and-drop is mouse-only)
- Duplicate a workout day within a program
- Progress timeline: photos older than 12 months are unreachable
- Logging body weight never updates the weight used for calorie burn
- Saving a weight on the Progress page blanks the whole timeline and jumps scroll
- Body Stats sheet: hardcoded English, and backdrop tap silently discards typed values
- Profile: avatar cannot be removed; height and weight accept impossible values
- Settings search: fix false 'No settings match', match titles and all query tokens, add missing keywords
- Surface failed settings saves instead of swallowing them
- Calorie estimate toggle: say which Profile fields are missing and link to Profile
- Trace log_set tool schema: accurate required fields so models stop guessing

Rejected:
- Server restore keeps the scheduler dedupe markers

## Round 5: 27 shipped, 2 rejected

- Android Local: list, back up now, share and restore on-device backups
- Statistics 1Y/All: Track Cardio toggle leaves stale wide set; sync blanks calories and deltas
- Trace log_body_stat weigh-in should update the profile weight used for calorie burn
- Diary and DatePicker month calendars ignore the week-start setting
- Undo after removing a filmed set loses its clip (and removal orphans the file)
- MCP and REST v1 default 'today' uses the server's zone, not the account's
- Garmin FIT import dates workouts in UTC, so evening sessions land on the wrong day
- Workout-complete celebration stays muted after midnight while the app process stays alive
- Replace sv-SE toLocaleDateString 'today' idiom with localDateStr; fix monthsAgo overflow
- get_exercise_progress: prefer an exact name match so a name never dead-ends as ambiguous
- get_workout / GET /api/v1/workouts/:date hide extra same-day sessions and never expose workout_id
- REST: fractional or NaN limit/offset crash with 'datatype mismatch'; /api/exercises offset without limit is a SQL syntax error
- Progress photo and set video URLs: reject ../ so members cannot read or delete backups and other users' files
- Login throttle: trust-proxy support, count only failures; rate-limit current-password checks
- Webhook delivery: use fetchChecked so the connection is pinned to the checked IP (DNS rebinding)
- Per-exercise notes that carry to every future session (seat height, grip, cues)
- Warm-up generator ignores equipment: dumbbell and machine lifts start from a 45 lb or 20 kg barbell
- Estimated 1RM trend line on exercise detail
- Flag a stalled lift and suggest a deload on exercise detail
- Best weight at each rep count (rep-max table) on exercise detail
- Workout import and backup restore: oversize file says 'Internal server error' instead of 'too large'
- Diary: Finish workout button, empty states, widget and week-nav labels are hardcoded English
- Programs page: New/Create sheet, duration hint and preview pane are hardcoded English; goal labels never translated
- Workout summary, exercise preview pane and picker: hardcoded English toasts, tooltips and aria-labels
- Subset the 5.3 MB Material Symbols font to the glyphs the app uses
- Diary: after a sync, reread workout dates and exercise histories only when workouts changed
- Radio: lazy-load and async-decode cover art and station icons in long lists

Rejected:
- GET /api/cardio ignores a lone start or end and returns the last 500 sessions
- Records scans parse every workout row; prefilter rows with no completed set in SQL

## Browser smoke round: 22 fixes

Eight user flows driven in headless Chromium against the built app (phone, 320px, desktop, light theme, offline). Each finding was reproduced by an independent agent before a fix; duplicate fixes dropped.

- Users settings: Session Duration row overflows the card; Save button clipped or off-screen on phones
- Wizard finish: PUT /api/updates/config returns 409 when UPDATE_CHECK is set in the environment
- Add Exercise picker crashes: ReferenceError _ is not defined, so exercises cannot be added
- At 320px the rest bar's 'REST' label overlaps the countdown digits
- At 320px the exercise name truncates to 'Overhe ad...' and the superset header wraps and breaks
- Superset sheet says 'Create superset (1 exercises)'. The superset remove button has no usable accessible name.
- Workout editor header overflows on phones: Save button clipped and the whole page scrolls horizontally
- Program detail and workout editor show a blank body with no message or Retry when the load fails
- Exercise detail page keeps showing the previous exercise when only the :id route param changes
- Profile save without touching height silently changes height when the unit is ft/in
- Exercise detail header title hard-clipped at 320px (no ellipsis)
- Sidebar drawer, Load type menu, Gym Tools sheet and Body Stats sheet ignore Escape and have no focus trap
- Settings switches and selects have no accessible name
- Diary: icon ligature text leaks into names, nested button inside role=button, set inputs unnamed
- Profile back button and password show/hide toggle have no accessible name
- Notifications 'browser needs permission' hint uses nonexistent --warn token, so it renders amber on white (1.78:1)
- Light theme: accent text and white-on-accent buttons below 4.5:1, muscle tag chip about 2:1
- Bottom nav highlights Diary (aria-current=page) on the exercise detail page
- Exercise editor chips (load type, tracked-by, equipment, muscles) expose no selected state; primary and secondary muscles are indistinguishable
- Focus drops to body after choosing 'Remove from superset' in the exercise More options sheet
- Assistant reply bubble has a blank line of extra space above the text
- Programs page title clipped or collapsed to zero width at 320px and 390px

Not reproduced: Set Active with the server down shows "Program set as active" but nothing is saved

## Integration fixes (orchestrator)

Merging ~200 independent commits produced semantic conflicts the per-change reviews could not see. Fixed on the branch: duplicate imports (WorkoutEditor, Statistics, ExercisePicker), a Trace `respondTo` scope bug, a misplaced aiTools helper, `import-match.js` moved to `src/lib` for Local-mode reuse (Dockerfile COPY added), wiring tests updated for changed markup, shared two-step files restored to their pinned hashes, CHANGELOG Unreleased merged into one Added/Changed/Fixed list, em dashes removed from new text.
