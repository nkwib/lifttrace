import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal DOM stub covering what name-controls.js touches.
function el(tag, { cls = '', text = '', attrs = {}, kids = [] } = {}) {
  const n = {
    tagName: tag.toUpperCase(), cls, textContent: text, attrs: { ...attrs }, kids, parentElement: null,
    get id() { return this.attrs.id || ''; }, set id(v) { this.attrs.id = v; },
    hasAttribute(k) { return k in this.attrs; },
    setAttribute(k, v) { this.attrs[k] = v; },
    ownerDocument: { querySelector: () => null },
    classes() { return this.cls.split(/\s+/); },
    contains(o) { for (let p = o; p; p = p.parentElement) if (p === this) return true; return false; },
    closest(sel) {
      const want = sel.split(',').map(s => s.trim().replace('.', ''));
      for (let p = this; p; p = p.parentElement) if (want.some(w => p.classes().includes(w))) return p;
      return null;
    },
    all() { return kids.flatMap(k => [k, ...k.all()]); },
  };
  kids.forEach(k => { k.parentElement = n; });
  return n;
}

test('hand-written row: switch and select get aria-labelledby to the row label', async () => {
  const { nameControls } = await import('../src/lib/name-controls.js');
  const label = el('span', { cls: 'setting-label', text: 'Reduce Motion' });
  const sw = el('button', { attrs: { role: 'switch' } });
  const label2 = el('span', { cls: 'setting-label', text: 'Theme' });
  const sel = el('select');
  const row1 = el('div', { cls: 'setting-row', kids: [label, sw] });
  const row2 = el('div', { cls: 'setting-row', kids: [label2, sel] });
  const root = el('div', { kids: [row1, row2] });
  const all = root.all();
  root.querySelectorAll = (s) => all.filter(n => n.tagName === 'SELECT' || (n.tagName === 'BUTTON' && n.attrs.role === 'switch'));
  for (const r of [row1, row2]) {
    r.querySelectorAll = () => r.kids.filter(k => k.cls.includes('setting-label'));
  }
  nameControls(root);
  assert.equal(sw.attrs['aria-labelledby'], label.id);
  assert.equal(sel.attrs['aria-labelledby'], label2.id);
  assert.notEqual(label.id, label2.id);
});

test('already named controls are left alone', async () => {
  const { nameControls } = await import('../src/lib/name-controls.js');
  const label = el('span', { cls: 'setting-label', text: 'X' });
  const sw = el('button', { attrs: { role: 'switch', 'aria-label': 'Custom' } });
  const row = el('div', { cls: 'setting-row', kids: [label, sw] });
  row.querySelectorAll = () => [label];
  const root = el('div', { kids: [row] });
  root.querySelectorAll = () => [sw];
  nameControls(root);
  assert.equal(sw.attrs['aria-labelledby'], undefined);
});

test('Settings page wires the autoNameControls action on its root', () => {
  const src = readFileSync(new URL('../src/routes/Settings.svelte', import.meta.url), 'utf8');
  assert.match(src, /import \{ autoNameControls \} from '\.\.\/lib\/name-controls\.js'/);
  assert.match(src, /<div class="page" use:autoNameControls>/);
});
