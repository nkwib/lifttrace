// Sync store lives apart from sync.js so the startup chunk (App, Sidebar)
// can subscribe without pulling the whole sync engine and api-native.
import { writable } from 'svelte/store';

/**
 * Live sync state, mirrored into the Settings UI for the "Last synced X ago"
 * label + spinner. Also lets the rest of the app react to sync activity
 * (e.g. show a transient banner during a manual fullSync).
 */
export const syncState = writable({
  syncing:  false,
  phase:    '',           // 'pushing' | 'pulling' | ''
  progress: '',           // human-readable status line
  lastSync: null,         // ISO timestamp of the most recent successful pull
  error:    null,
  online:   true,
  // Queued changes the server refused when they were replayed, as
  // { what, reason }, for App.svelte to tell the person once.
  refused:  [],
  // Structured classification of the current connection problem
  // (kind: 'no_network' | 'server_error' | 'server_unreachable'). Feeds
  // the smart connection banner in App.svelte via
  // lib/connection-message.js. `showErrorBanner` gates the full banner
  // vs the compact hamburger cloud badge: automatic probes update the
  // badge; manual retries / user-initiated syncs opt into the banner.
  connectionIssue: null,
  showErrorBanner: false,
});

/** Clear the refusals once they've been shown. */
export function forgetRefused() {
  syncState.update(s => ({ ...s, refused: [] }));
}
