# Improvement backlog (autonomous run, 2026-11-21)

What the autonomous improvement run did not finish or could not verify. Everything it implemented and reviewed is on this branch.

## Needs a device or manual check
- **Android Local backup and restore UI** (Settings > Backup): restore file picker inside the Capacitor WebView, Documents directory listing and Share URIs are untested on a device. The file picker uses a detached `<input>`; some WebViews may drop its `onchange`.
- **Icon font subset**: verify on Android and the PWA that no icon renders as raw ligature text. Any icon name added later must be added to the subset.
- **Login throttle behind a proxy**: set `TRUST_PROXY` per the docs and confirm the client IP is the one counted.

## Known gaps in merged work
- Local backup restore: the safety snapshot skips uploads, so restoring a v2 backup overwrites current upload files without a copy. Safety snapshots have no `auto-` prefix and are never pruned.
- Local backup restore errors append raw English parser messages to the translated toast.
- Local `clearData` omits progress photos and media.
- Android Local importer parity with the server import dedupe was not verified.
- `sync.js` template writes via the offline path do not trim or reject blank names (REST and Local do).
- Same-limit Track Cardio flip on Statistics 1Y/All shows the old trained days briefly until the refetch lands.
- Many new tests are source-grep wiring tests rather than behavioral tests.

## Rejected by the round table
- `GET /api/cardio` ignoring a lone start or end bound (1 of 3 approvals).
- SQL prefilter for the records scan (0 of 3).
- Earlier rounds: see the "Rejected" lists kept in the run notes (scroll new set into view, shared busy spinner, pr.set webhook records, scheduler streak bounds, Diary quick-start next day, focus outline pass).

## Ideas not explored
- Per-flow smoke run for the accept-invite page, SMTP invites, backup create and restore, and the photo compare slider (not covered by the browser smoke test).
- Wizard steps at 320px.
- Cardio weekly chart and the Records tab with dense data.
