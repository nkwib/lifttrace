import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync(new URL('../server/routes/auth.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/settings/SettingsUserManagement.svelte', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));

test('invite route survives sendInvite failure and still returns the link', () => {
  assert.match(auth, /try \{\s*await sendInvite\([^)]*\);\s*\} catch \(e\) \{[\s\S]*?sent: false, inviteUrl, email_error/);
  assert.doesNotMatch(auth, /email_error:[^\n]*e\?*\.message/);
});

test('client shows i18n error on email_error and keeps inviteResult', () => {
  assert.match(ui, /inviteResult = data;[\s\S]*?else if \(data\.email_error\) showError\(\$_\('settings\.users\.invite_email_failed'\)\)/);
  assert.ok(en.settings.users.invite_email_failed);
});
