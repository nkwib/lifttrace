import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/stores/player.js', import.meta.url), 'utf8');
function body(sig) {
  const i = src.indexOf(sig);
  assert.ok(i >= 0, sig);
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j);
}

test('_cancelCrossfade clears timer, nulls second element, restores volume', () => {
  const b = body('function _cancelCrossfade()');
  assert.match(b, /clearInterval\(_crossfadeTimer\)/);
  assert.match(b, /_crossfadeAudio\.pause\(\)/);
  assert.match(b, /_crossfadeAudio = null/);
  assert.match(b, /_isCrossfading = false/);
  assert.match(b, /audio\.volume = get\(volume\)/);
});

test('pause() cancels crossfade after the native early return', () => {
  const b = body('export function pause()');
  const cancel = b.indexOf('_cancelCrossfade()');
  assert.ok(cancel > b.indexOf('return;'));
  assert.ok(cancel < b.indexOf('audio.pause()'));
});

test('stop() and playTrack() cancel crossfade', () => {
  assert.match(body('export function stop()'), /_cancelCrossfade\(\)/);
  assert.match(body('export async function playTrack('), /_cancelCrossfade\(\)/);
});
