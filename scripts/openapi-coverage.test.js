/**
 * Route coverage for server/openapi.yaml: every method+path the public API
 * router defines is in the spec and vice versa. Text checks only (no yaml
 * dependency, no db import). The static /openapi.yaml route is exempt.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../server/routes/public-api.js', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../server/openapi.yaml', import.meta.url), 'utf8');

const routerPairs = [...route.matchAll(/router\.(get|post|put|delete)\(\s*'([^']+)'/g)]
  .map(([, m, p]) => `${m.toUpperCase()} ${p.replace(/:(\w+)/g, '{$1}')}`);

function specPairs() {
  const pairs = [];
  let inPaths = false;
  let path = null;
  for (const line of spec.split('\n')) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break;
    let m = line.match(/^ {2}(\/\S*):\s*$/);
    if (m) { path = m[1]; continue; }
    m = line.match(/^ {4}(get|post|put|delete|patch):\s*$/);
    if (m && path) pairs.push(`${m[1].toUpperCase()} ${path}`);
  }
  return pairs;
}

test('router defines a plausible number of routes', () => {
  assert.ok(routerPairs.length >= 19);
  assert.equal(new Set(routerPairs).size, routerPairs.length, 'duplicate route');
});

test('every router route is documented in openapi.yaml', () => {
  const have = new Set(specPairs());
  for (const p of routerPairs) assert.ok(have.has(p), `missing from openapi.yaml: ${p}`);
});

test('openapi.yaml documents no route the router lacks', () => {
  const have = new Set(routerPairs);
  for (const p of specPairs()) assert.ok(have.has(p), `not in public-api.js: ${p}`);
});

test('write operations carry mcp:write, reads mcp:read', () => {
  const blocks = spec.split(/^ {4}(?=(?:get|post|put|delete):$)/m).slice(1);
  assert.ok(blocks.length >= 19);
  for (const b of blocks) {
    const isRead = b.startsWith('get:');
    assert.match(b, isRead ? /x-required-scope: mcp:read/ : /x-required-scope: mcp:write/);
  }
});

test('openapi route is served after the enabled gate and before bearer auth', () => {
  const gate = route.indexOf('Public API not enabled');
  const serve = route.indexOf("router.use('/openapi.yaml'");
  const auth = route.indexOf('router.use(bearerAuth)');
  assert.ok(gate > 0 && gate < serve && serve < auth);
});
