import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('weekly summary email has its own opt-out, default on', () => {
  const sched = read('../server/lib/scheduler.js');
  assert.match(sched, /isEmailConfigured\(\) && _getUserSetting\(userId, 'notifWeeklySummaryEmail', true\) !== false/);
  const store = read('../src/stores/settings.js');
  assert.match(store, /createSettingStore\('notifWeeklySummaryEmail', true\)/);
  assert.match(store, /'notifWeeklySummary', 'notifWeeklySummaryEmail'/);
  assert.match(read('../src/components/settings/SettingsNotifications.svelte'), /bind:checked=\{\$notifWeeklySummaryEmail\}/);
  const en = JSON.parse(read('../src/i18n/en.json'));
  assert.ok(en.settings_notifications.summaries.weekly_email);
  assert.ok(en.settings_notifications.summaries.weekly_email_desc);
});

test('email footer points at the email toggle', async () => {
  const { renderWeeklySummary } = await import('../server/email.js');
  const { buildWeeklySummary } = await import('../server/lib/weekly-summary.js');
  const summary = buildWeeklySummary({ workouts: [], today: '2026-09-20' });
  const r = renderWeeklySummary('Cleo', summary, '', {});
  assert.match(r.html, /Turn off weekly emails in Settings, Notifications\./);
  assert.match(r.text, /Turn off weekly emails/);
});
