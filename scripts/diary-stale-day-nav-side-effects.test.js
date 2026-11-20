import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/Diary.svelte', import.meta.url), 'utf8');

function body(name) {
  const i = src.indexOf(`async function ${name}(`);
  assert.ok(i > 0, name);
  return src.slice(i, i + 600);
}

test('loadCoachFeedback checks the current date after its await', () => {
  const b = body('loadCoachFeedback');
  assert.ok(b.indexOf('getWorkoutFeedback') < b.indexOf('dateStr !== get(currentDate)'));
});

test('loadSetMedia checks the current date after await and in catch', () => {
  const b = body('loadSetMedia').split('\n').slice(0, 11).join('\n');
  assert.equal((b.match(/dateStr !== get\(currentDate\)/g) || []).length, 2);
});

test('day navigation does not inline notes/feedback/media side effects', () => {
  assert.doesNotMatch(src, /\.then\(\(\) => \{\s*notes = /);
  assert.match(src, /function afterDayLoad\(ds\)[\s\S]*?ds !== get\(currentDate\)/);
});
