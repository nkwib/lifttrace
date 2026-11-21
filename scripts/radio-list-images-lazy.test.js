import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/Radio.svelte', import.meta.url), 'utf8');
const imgs = src.match(/<img\b[^>]*>/g) || [];
const LIST = ['track-art', 'album-art', 'station-icon', 'rnp-queue-cover'];
const EAGER = ['detail-art', 'rnp-cover'];
const cls = (tag) => (tag.match(/class="([^"]*)"/) || [])[1]?.split(/\s+/) || [];

test('Radio list images are lazy and async-decoded', () => {
  for (const c of LIST) {
    const tags = imgs.filter((t) => cls(t).includes(c));
    assert.ok(tags.length > 0, `no <img> with class ${c}`);
    for (const t of tags) {
      assert.match(t, /loading="lazy"/, t);
      assert.match(t, /decoding="async"/, t);
    }
  }
});

test('Radio above-the-fold covers stay eager', () => {
  for (const c of EAGER) {
    for (const t of imgs.filter((t) => cls(t).includes(c))) {
      assert.doesNotMatch(t, /loading="lazy"/, t);
    }
  }
});
