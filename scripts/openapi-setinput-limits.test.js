/**
 * SetInput in server/openapi.yaml stays in step with the log_set MCP schema
 * and SET_LIMITS. Text checks only (no yaml dependency, no db import).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const spec = readFileSync(new URL('../server/openapi.yaml', import.meta.url), 'utf8');
const logSet = readFileSync(new URL('../server/lib/mcp/tools/log-set.js', import.meta.url), 'utf8');
const setInputSrc = readFileSync(new URL('../server/lib/set-input.js', import.meta.url), 'utf8');

const lines = spec.slice(spec.indexOf('\n    SetInput:\n') + 1).split('\n');
const specBlock = lines.slice(0, lines.findIndex((l, i) => i > 0 && /^ {4}\S/.test(l))).join('\n');
const specKeys = [...specBlock.matchAll(/^ {8}(\w+):/gm)].map(m => m[1]);

const zodFrom = logSet.slice(logSet.indexOf('inputSchema: {'));
const zodKeys = [...zodFrom.slice(0, zodFrom.indexOf('\n      },')).matchAll(/^ {8}(\w+): z\./gm)]
  .map(m => m[1])
  .filter(k => k !== 'date'); // a path parameter in the spec

test('SetInput covers every log_set key except date', () => {
  assert.ok(zodKeys.length >= 10, 'zod keys found');
  for (const k of zodKeys) assert.ok(specKeys.includes(k), `SetInput lacks ${k}`);
});

test('SetInput limits match SET_LIMITS', () => {
  const limits = [...setInputSrc.matchAll(/^ {2}(\w+): \{ min: ([\d.]+), max: (\d+) \},/gm)];
  assert.equal(limits.length, 3);
  for (const [, k, min, max] of limits) {
    assert.match(specBlock, new RegExp(`^ {8}${k}: \\{[^}]*minimum: ${min}, maximum: ${max}\\}`, 'm'), `${k} limits`);
  }
});

test('SetInput amount limits match log_set', () => {
  for (const k of ['duration_sec', 'duration_l_sec', 'duration_r_sec']) {
    assert.match(specBlock, new RegExp(` ${k}:\\n\\s+type: integer\\n\\s+minimum: 1\\n\\s+maximum: 86400`));
  }
  assert.match(specBlock, /calories: \{type: integer, minimum: 1, maximum: 100000\}/);
  assert.match(specBlock, /distance_m:\n\s+type: number\n\s+minimum: 0\n\s+exclusiveMinimum: true\n\s+maximum: 1000000/);
});
