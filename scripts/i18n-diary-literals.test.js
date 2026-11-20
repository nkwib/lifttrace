// Diary set/superset UI strings come from en.json, not hardcoded English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const dir = 'src/components/diary/';
const files = ['SetRow', 'SupersetCard', 'SmartLogModal', 'WorkoutSummary', 'BodyStats'];
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
