// Diary set/superset UI strings come from en.json, not hardcoded English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const dir = 'src/components/diary/';
const files = ['SetRow', 'SupersetCard', 'SmartLogModal', 'WorkoutSummary', 'BodyStats'];
const routes = ['Diary', 'Coaching'].map((f) => [f, fs.readFileSync(`src/routes/${f}.svelte`, 'utf8')]);
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(`${dir}${f}.svelte`, 'utf8')]));
const lookup = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), en);

test('removed hardcoded literals stay gone', () => {
  const gone = {
    SupersetCard: [/exercises<\/span>/, /\} sets<\/span>/, /title="Remove entire superset"/],
    SetRow: [/title="Watch this set"/, /title="New personal record!"/, /aria-label="(Decrease|Increase) weight"/,
      /aria-label="Duration"/, /title="Remove set"/, /'Mark (in)?complete'/, />Clear<\/button>/, />Auto<\/button>/,
      /title="(Merge|Split) L\/R/, /title="Rate of Perceived Exertion"/],
    SmartLogModal: [/`Added \$\{matched\.length\}/],
    WorkoutSummary: [/aria-label="Close"/],
    BodyStats: [/showSuccess\('Body stats saved'\)/, /new Error\('Save failed'\)/],
  };
  for (const [f, res] of Object.entries(gone)) for (const re of res) assert.doesNotMatch(src[f], re, `${f}: ${re}`);
});

test('every $_ key in edited files resolves in en.json', () => {
  for (const f of files) {
    assert.match(src[f], /import \{ _ \} from 'svelte-i18n'/);
    for (const m of src[f].matchAll(/\$_\('([a-z0-9_.]+)'/g)) {
      assert.equal(typeof lookup(m[1]), 'string', `${f}: missing ${m[1]}`);
    }
  }
});

test('plural strings use ICU plurals', () => {
  assert.match(en.smart_log.added, /plural/);
  assert.match(en.diary_extra.exercise_count, /plural/);
});

test('Diary finish/empty-state strings are localized', () => {
  for (const [f, text] of routes) {
    assert.match(text, /import \{ _ \} from 'svelte-i18n'/);
    assert.doesNotMatch(text, /label="Loading workout/, f);
    for (const m of text.matchAll(/\$_\('([a-z0-9_.]+)'/g)) {
      assert.equal(typeof lookup(m[1]), 'string', `${f}: missing ${m[1]}`);
    }
  }
  const diary = routes[0][1];
  for (const re of [/'View summary'/, /'Finish workout'/, /'View workout summary'/, /'Plan ahead'/,
    /'Ready to train\?'/, /'Untitled workout'/, />Nothing logged yet</, /\} sets<\/span>/]) {
    assert.doesNotMatch(diary, re, String(re));
  }
  assert.match(en.diary_finish.sets_progress, /\{completed\}.*\{total\}/);
});
