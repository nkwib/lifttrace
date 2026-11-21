/**
 * Assistant bubbles in Trace had a blank line above the text: .lb-bubble was
 * white-space: pre-wrap, which kept the whitespace node before the block-level
 * .lb-md as its own line. Pre-wrap now applies only to plain-text bubbles.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/components/ai/Trace.svelte', import.meta.url), 'utf8');

test('base .lb-bubble does not use pre-wrap', () => {
  const m = src.match(/\n\s*\.lb-bubble \{([^}]*)\}/);
  assert.ok(m);
  assert.doesNotMatch(m[1], /pre-wrap/);
});

test('pre-wrap only for user and plain-text bubbles', () => {
  assert.match(src, /\.lb-msg\.user \.lb-bubble, \.lb-bubble\.lb-plain \{ white-space: pre-wrap; \}/);
  assert.match(src, /class:lb-plain=\{!\(msg\.role === 'assistant' && md\)\}/);
});
