import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextFocusIndex } from '../src/lib/focus-trap.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

test('nextFocusIndex wraps and handles empty / unfocused', () => {
  assert.equal(nextFocusIndex(0, -1, false), -1);
  assert.equal(nextFocusIndex(3, 0, false), 1);
  assert.equal(nextFocusIndex(3, 2, false), 0);
  assert.equal(nextFocusIndex(3, 0, true), 2);
  assert.equal(nextFocusIndex(3, 2, true), 1);
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, -1, true), 2);
  assert.equal(nextFocusIndex(1, 0, false), 0);
});

test('overlay layers use trapFocus after portal and closeOnBack', () => {
  for (const f of ['Sheet', 'Dialog', 'ActionSheet']) {
    const s = read(`../src/components/ui/${f}.svelte`);
    assert.match(s, /import \{ trapFocus \}/, f);
    assert.match(s, /use:portal[\s\S]*?use:closeOnBack=[\s\S]*?use:trapFocus=\{\{ onEscape:/, f);
  }
});

test('Dialog ids are per instance and only set with a title; Escape honours the lock', () => {
  const s = read('../src/components/ui/Dialog.svelte');
  assert.doesNotMatch(s, /dlg-title"/);
  assert.match(s, /aria-labelledby=\{title \? titleId : undefined\}/);
  assert.match(s, /onEscape: cancel/);
});

test('ActionSheet panel is a labelled modal dialog', () => {
  const s = read('../src/components/ui/ActionSheet.svelte');
  assert.match(s, /role="dialog"\s+aria-modal="true"\s+aria-label=\{title\}/);
});

test('Escape handled by an inner control is left alone', () => {
  assert.match(read('../src/lib/focus-trap.js'), /defaultPrevented/);
});

test('remaining dismissable layers trap focus and share one close fn for Escape and back', () => {
  const files = {
    'components/ui/TimePicker.svelte': /use:closeOnBack=\{\(\) => open = false\}\s+use:trapFocus=\{\{ onEscape: \(\) => open = false \}\}/,
    'routes/Wizard.svelte': /use:closeOnBack=\{\(\) => skipModal = false\}\s+use:trapFocus=\{\{ onEscape: \(\) => skipModal = false \}\}/,
    'routes/Settings.svelte': /use:closeOnBack=\{\(\) => \{ twoStepChallengeOpen = null; \}\}\s+use:trapFocus=\{\{ onEscape: \(\) => \{ twoStepChallengeOpen = null; \} \}\}/,
    'components/settings/SettingsEmail.svelte': /use:closeOnBack=\{closeTestDialog\}\s+use:trapFocus=\{\{ onEscape: closeTestDialog \}\}/,
    'components/radio/FullPlayer.svelte': /use:portal use:trapFocus=\{\{ onEscape: \(\) => open = false, initial: '\.fp-panel' \}\}/,
  };
  for (const [f, re] of Object.entries(files)) {
    const s = read(`../src/${f}`);
    assert.match(s, /import \{ trapFocus \} from '[./]+\/lib\/focus-trap\.js'/, f);
    assert.match(s, re, f);
  }
  assert.match(read('../src/components/radio/FullPlayer.svelte'), /class="fp-panel" tabindex="-1"/);
  assert.doesNotMatch(read('../src/components/ui/TimePicker.svelte'), /on:keydown=\{\(\) => \{\}\}/);
  assert.doesNotMatch(read('../src/components/settings/SettingsEmail.svelte'), /e\.key === 'Escape'/);
});
