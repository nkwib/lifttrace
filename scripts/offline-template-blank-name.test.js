import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkTemplateWrite } from '../src/lib/template-write.js';

test('create: name trimmed, blank or missing refused', () => {
  assert.equal(checkTemplateWrite('POST', '/api/templates', { program_id: 1, name: '  Push ' }).body.name, 'Push');
  assert.ok(checkTemplateWrite('POST', '/api/templates', { program_id: 1, name: '   ' }).error);
  assert.ok(checkTemplateWrite('POST', '/api/templates', { program_id: 1 }).error);
});

test('edit: blank refused, absent keeps, trimmed otherwise', () => {
  assert.equal(checkTemplateWrite('PUT', '/api/templates/-3', { name: ' A ' }).body.name, 'A');
  assert.equal(checkTemplateWrite('PUT', '/api/templates/4', { name: '' }).error, 'Name required');
  assert.deepEqual(checkTemplateWrite('PUT', '/api/templates/4', { day_label: 'x' }).body, { day_label: 'x' });
});

test('other writes pass through', () => {
  const b = { name: '  ' };
  assert.equal(checkTemplateWrite('POST', '/api/programs', b).body, b);
  assert.equal(checkTemplateWrite('DELETE', '/api/templates/4', null).body, null);
});

test('the offline queue path runs the check before queueing', () => {
  const src = fs.readFileSync(new URL('../src/lib/apiFetch.js', import.meta.url), 'utf8');
  const i = src.indexOf('checkTemplateWrite(method');
  assert.ok(i > 0 && i < src.indexOf('await enqueueWrite(method'));
});
