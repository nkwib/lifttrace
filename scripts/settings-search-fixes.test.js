import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SECTION_KEYWORDS, matchesSection, buildHaystack, matchesHaystack } from '../src/lib/settings-search.js';

const hits = (q, titles = {}) => Object.keys(SECTION_KEYWORDS)
  .filter(k => matchesSection(q, { title: titles[k] || '', keywords: SECTION_KEYWORDS[k] }));

test('week start finds units', () => assert.ok(hits('week start').includes('units')));
test('rpe, rir, effort, plate, warm-up find workout', () => {
  for (const q of ['rpe', 'rir', 'effort', 'plate', 'plates', 'warm-up', 'warmup']) assert.ok(hits(q).includes('workout'), q);
});
test('heatmap finds statistics', () => assert.ok(hits('heatmap').includes('statistics')));
test('multi-word query matches in any order', () => {
  assert.ok(hits('screen awake').includes('workout'));
  assert.ok(hits('awake screen').includes('workout'));
  assert.equal(hits('screen zzzz').length, 0);
});
test('localized title is matched, accents folded', () => {
  assert.ok(matchesSection('Séance', { title: 'Seance', keywords: [] }));
  assert.ok(matchesSection('seance', { title: 'Séance', keywords: [] }));
});
test('empty query matches everything; inline strings need no title', () => {
  assert.ok(matchesSection('', { keywords: [] }));
  assert.ok(matchesHaystack('app server', buildHaystack({ keywords: ['mode app server'] })));
  assert.ok(!matchesHaystack('nope', buildHaystack({ keywords: ['mode app server'] })));
});

const settings = readFileSync(new URL('../src/routes/Settings.svelte', import.meta.url), 'utf8');
test('empty state no longer keys off the drill-in expanded map', () => {
  assert.doesNotMatch(settings, /settingsQuery && !Object\.values\(expanded\)/);
  assert.match(settings, /\$: _noMatches = !currentSection/);
  assert.match(settings, /sectionAvailable/);
});
