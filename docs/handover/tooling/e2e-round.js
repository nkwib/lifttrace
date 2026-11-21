export const meta = {
  name: 'lifttrace-e2e-round',
  description: 'Write committed E2E specs for uncovered flows, then fix only the specs that fail on a real defect, then review',
  phases: [
    { title: 'Author', detail: 'one agent per uncovered flow writes e2e/<flow>.e2e.mjs on a commit' },
    { title: 'Fix', detail: 'one agent per failing test; the failing test is the reproduction' },
    { title: 'Review', detail: 'reviewer reruns the spec, no screenshots unless the text is not enough' },
  ],
}

// Replaces smoke.js. What changed and why (token cost):
// - No exploratory agents re-deriving server boot, seeding and selectors:
//   e2e/harness.mjs does that, so a flow agent only writes assertions.
// - Generic defects (uncaught errors, 5xx, raw i18n keys, overflow, clipped
//   titles, axe names/contrast) are caught by checkPage() in code. Agents do
//   not look at screenshots to find them.
// - No reproduce stage: a red test IS the reproduction. Fix agents must turn
//   it green; reviewers rerun it.
// - Specs are committed, so the next round reruns them for free
//   (`npm run e2e`) and only spends agents on new flows and red tests.
//
// Before launching: run `npm run build && npm run e2e` yourself (Bash, no
// agents) and pass the failures, if any, in args.failing.
//
// args: { main, base, flows: [{ key, prompt }], failing: [{ file, name, report }], known?: string }
// known: problems already being fixed elsewhere (e.g. "icon-name lines: pass skip: ['icons']"),
// so authors do not report them as new defects and spawn duplicate fix agents.
const BASE = args.base
const MAIN = args.main

const HARNESS = `
E2E harness: ${MAIN}/e2e/harness.mjs (read it first, it is short). startServer() boots the real server on a free port with a temp DB; api(server, {register:true}) creates the admin and returns a cookie client for seeding (client.call(method, path, body)); e2e/seed.mjs seeds 12 weeks of workouts; openPage(server, client, {view:'narrow'|'phone'|'desktop', theme}) gives a signed-in page with error capture; goto(page, '/route'); expectClean(page, label) runs every generic check and throws a compact report. See e2e/pages.e2e.mjs and e2e/flows.e2e.mjs for the pattern. Tests use node:test; run one file with \`node --test e2e/<file>.e2e.mjs\` after \`npm run build\` in your worktree (link ../dist to server/dist is done by the harness; never stage server/dist).
Selectors: roles and visible English text (en.json strings). Read the Svelte source for behavior.
Screenshots: expectClean saves one on failure and prints the path. Open it with Read only if the text report cannot explain the failure.${args.known ? `\nAlready known and being fixed elsewhere, do NOT report or fix: ${args.known}` : ''}`

const RULES = `
Worktree: \`git checkout --detach ${BASE}\`, then \`ln -sfn ${MAIN}/node_modules node_modules && ln -sfn ${MAIN}/server/node_modules server/node_modules\`. Never stage symlinks. Stage by path, check \`git show --stat HEAD\`. One commit on detached HEAD; report the full sha.
Never run the full unit suite. Run the spec you touch, plus unit tests that grep or import files you touch (grep -l '<basename>' scripts/*.test.js), plus \`npx vite build\` if you touch src/.
Preserve CRLF files. No em dashes. English strings only in src/i18n/en.json. Do not edit src/components/two-step/*, server/lib/two-step*.js, or cookie/plain-HTTP files (hash-pinned).`

const AUTHORED = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['committed', 'abandoned'] },
    commit: { type: 'string' },
    file: { type: 'string' },
    coverage: { type: 'string', description: 'what the spec exercises and what it cannot' },
    failing: { type: 'array', description: 'tests in the spec that fail because the app is wrong (not the spec)', items: { type: 'object', properties: { slug: { type: 'string', description: 'kebab-case id of the DEFECT (same slug for every test that fails for the same cause, across viewports)' }, name: { type: 'string' }, report: { type: 'string', description: 'the assertion output, trimmed' }, suspected_cause: { type: 'string' } }, required: ['slug', 'name', 'report', 'suspected_cause'] } },
  },
  required: ['status', 'commit', 'file', 'coverage', 'failing'],
}
const RESULT = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['committed', 'abandoned'] }, commit: { type: 'string' }, summary: { type: 'string' }, tests_run: { type: 'string' } },
  required: ['status', 'commit', 'summary', 'tests_run'],
}
const REVIEW = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['ship', 'drop'] }, issues: { type: 'array', items: { type: 'string' } } },
  required: ['verdict', 'issues'],
}

phase('Author')
const authored = await parallel((args.flows || []).map((f) => () => agent(
  `${HARNESS}\n${RULES}\nWrite e2e/${f.key}.e2e.mjs covering this flow, using the harness. Assert the CORRECT behavior. Before asserting a feature, check it is not in the Rejected lists of ${MAIN}/docs/handover/tooling/run-state/done.txt or ${MAIN}/docs/plans/improvement-backlog.md; if it is, do not test for it. If a test fails because the app is wrong, keep the test, mark it with { todo: 'defect: <slug>' } so the file passes, and list it in failing. If it fails because your spec is wrong, fix the spec.\nFlow:\n${f.prompt}`,
  { label: `author:${f.key}`, phase: 'Author', schema: AUTHORED, isolation: 'worktree' })))

// One fix agent per DEFECT, not per failing test: the same cause often
// fails several tests (viewports, specs). Session 2 spent 2 fix agents on
// one contrast bug before this dedupe existed.
const bySlug = new Map()
for (const x of [
  ...(args.failing || []).map((f) => ({ slug: f.slug || f.name, ...f })),
  ...authored.filter(Boolean).flatMap((a) => a.failing.map((f) => ({ ...f, file: a.file, specCommit: a.commit }))),
]) {
  const g = bySlug.get(x.slug)
  if (g) { g.also.push(`${x.file} :: ${x.name}`); if (x.specCommit && !g.specCommits.includes(x.specCommit)) g.specCommits.push(x.specCommit) }
  else bySlug.set(x.slug, { ...x, also: [], specCommits: x.specCommit ? [x.specCommit] : [] })
}
const failing = [...bySlug.values()]
log(`${authored.filter(Boolean).length} specs written, ${failing.length} distinct defects to fix: ${failing.map((f) => f.slug).join(', ')}`)

const fixed = await pipeline(failing,
  (f) => agent(`${HARNESS}\n${RULES}\nThis E2E test fails because the app is wrong. Fix the app so it passes.\nFile: ${f.file}${f.specCommits.length ? ` (spec commits ${f.specCommits.join(', ')}: \`git cherry-pick\` them first, then make your fix a separate commit on top; do not squash, the orchestrator picks specs and fixes separately)` : ''}\nTest: ${f.name}${f.also.length ? `\nSame defect also fails: ${f.also.join('; ')}. Remove the todo marker from all of them.` : ''}\nReport:\n${f.report}\n${f.suspected_cause ? `Suspected cause: ${f.suspected_cause}` : ''}\nRemove the { todo } marker. The test must pass: \`node --test --test-name-pattern=${JSON.stringify(f.name)} ${f.file}\`. User-visible fix: one CHANGELOG.md line under Unreleased > Fixed. Commit subject \`fix(area): ...\`.`,
    { label: `fix:${f.name.slice(0, 40)}`, phase: 'Fix', schema: RESULT, isolation: 'worktree' }),
  (r, f) => (!r || r.status !== 'committed') ? { f, final: 'abandoned', r } : agent(
    `Review commit ${r.commit} (parent ${BASE}) in ${MAIN}: \`git -C ${MAIN} show ${r.commit}\`. It fixes the failing E2E test "${f.name}" in ${f.file}. Check out the commit in a temp worktree, build, rerun that spec file, and confirm it passes and the fix is the right one (not a test weakened to pass). Hunt for regressions, hardcoded English, em dashes, CRLF churn, committed symlinks. ship or drop.`,
    { label: `review:${f.name.slice(0, 40)}`, phase: 'Review', schema: REVIEW }).then((v) => ({ f, final: v ? v.verdict : 'unknown', sha: r.commit, review: v })))

return { authored: authored.filter(Boolean), fixed: fixed.filter(Boolean) }
