import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Per-file max count of click-without-key svelte-ignores. May only decrease.
const MAX = {
  'src/components/diary/BodyStats.svelte': 1,
  'src/components/diary/GymTools.svelte': 1,
  'src/components/diary/SetRow.svelte': 2,
  'src/components/diary/SmartLogModal.svelte': 1,
  'src/components/diary/WorkoutSummary.svelte': 1,
  'src/components/layout/Sidebar.svelte': 1,
  'src/components/programs/TemplateSpecRow.svelte': 2,
  'src/components/radio/FullPlayer.svelte': 1,
  'src/components/ui/ActionSheet.svelte': 1,
  'src/components/ui/Dialog.svelte': 1,
  'src/components/ui/LoadTypeMenu.svelte': 1,
  'src/components/ui/Sheet.svelte': 1,
  'src/routes/Diary.svelte': 1,
  'src/routes/Radio.svelte': 1,
  'src/routes/Wizard.svelte': 2,
};
const RE = /a11y[-_]click[-_]events[-_]have[-_]key[-_]events/g;

function walk(d, out = []) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

test('click-events-have-key-events suppressions only decrease', () => {
  for (const f of walk('src')) {
    const n = (readFileSync(f, 'utf8').match(RE) || []).length;
    assert.ok(n <= (MAX[f] ?? 0), `${f}: ${n} suppressions, max ${MAX[f] ?? 0}`);
  }
});
