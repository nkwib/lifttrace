import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/stores/player.js', import.meta.url), 'utf8');
const start = src.indexOf('function _startNowPlayingPoll');
const block = src.slice(start, src.indexOf('function _updateStreamMediaSession'));
const stop = src.slice(src.indexOf('function _stopNowPlayingPoll'), src.indexOf('export function getAudioForAnalyser'));

test('now-playing poll uses AbortController and generation guard', () => {
  assert.match(block, /new AbortController\(\)/);
  assert.match(block, /signal: ctrl\.signal/);
  assert.match(block, /await res\.json\(\);[\s\S]*?if \(myGen !== _nowPlayingGen\) return;/);
  assert.match(block, /finally \{ inFlight = false; \}/);
});

test('now-playing poll skips paused ticks but not hidden', () => {
  assert.match(block, /isTick && audio && audio\.paused/);
  assert.doesNotMatch(block, /document\.hidden/);
});

test('stop bumps generation and aborts', () => {
  assert.match(stop, /_nowPlayingGen\+\+/);
  assert.match(stop, /_nowPlayingAbort\.abort\(\)/);
});
