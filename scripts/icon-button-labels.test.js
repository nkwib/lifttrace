import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const FILES = [
  'src/components/radio/MiniPlayer.svelte',
  'src/components/radio/FullPlayer.svelte',
  'src/routes/Radio.svelte',
  'src/routes/ExerciseDetail.svelte',
  'src/routes/ProgramDetail.svelte',
  'src/routes/WorkoutEditor.svelte',
  'src/routes/Diary.svelte',
  'src/components/ai/Trace.svelte',
  'src/components/exercises/MediaInput.svelte',
  'src/components/diary/ExerciseCard.svelte',
  'src/components/diary/SmartLogModal.svelte',
];

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const has = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), en) !== undefined;

// <button ...> whose only content is one material-symbols span (no text).
const ICON_ONLY = /<button\b([^>]*(?:\{[^}]*\}[^>]*)*)>\s*<span class="material-symbols-rounded"[^>]*>[^<]*<\/span>\s*<\/button>/g;

test('icon-only buttons carry an accessible name', () => {
  const bad = [];
  for (const f of FILES) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(ICON_ONLY)) {
      if (!/aria-label=|aria-labelledby=|\btitle=/.test(m[1])) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${f}:${line}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('static $_ keys used by these files exist in en.json', () => {
  const missing = [];
  for (const f of FILES) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\$_\(\s*'([a-z0-9_.]+)'/gi)) {
      if (!has(m[1])) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('player controls: reactive play label, pressed state on toggles', () => {
  const mini = fs.readFileSync('src/components/radio/MiniPlayer.svelte', 'utf8');
  const full = fs.readFileSync('src/components/radio/FullPlayer.svelte', 'utf8');
  assert.match(mini, /aria-label=\{\$isPlaying \? \$_\('radio\.pause'\) : \$_\('radio\.play'\)\}/);
  assert.match(mini, /mini-vol-slider" aria-label=\{\$_\('radio\.volume'\)\}/);
  assert.match(full, /aria-pressed=\{\$shuffle\}/);
  assert.match(full, /aria-pressed=\{repeatActive\}/);
  assert.match(full, /radio\.repeat_one/);
});

test('components using $_ import it from svelte-i18n', () => {
  for (const f of FILES) {
    const src = fs.readFileSync(f, 'utf8');
    if (/\$_\(/.test(src)) assert.match(src, /import \{ _ \} from 'svelte-i18n'/, f);
  }
});
