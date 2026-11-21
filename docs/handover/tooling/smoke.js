export const meta = {
  name: 'lifttrace-ui-smoke',
  description: 'Drive the real built app in headless Chromium per flow, reproduce findings, fix confirmed ones on commits, review',
  phases: [
    { title: 'Smoke' },
    { title: 'Reproduce' },
    { title: 'Fix' },
    { title: 'Review' },
    { title: 'Fix2' },
  ],
}

// args: { main, pw, base, flows: [{key, port, prompt}] }  (pw = absolute path of launch.js)
const BASE = args.base
const MAIN = args.main // absolute path of the integration checkout

const RECIPE = `
App under test: LiftTrace at commit ${BASE}, already built (${MAIN}/dist, served by the server through ${MAIN}/server/dist). Do NOT edit files in ${MAIN}.
Boot your own server (unique port given below, own temp data dir), from ${MAIN}/server:
  mkdir -p /tmp/lt-smoke/<key> && cd ${MAIN}/server && PORT=<port> DB_PATH=/tmp/lt-smoke/<key>/lt.db UPLOADS_PATH=/tmp/lt-smoke/<key>/up BACKUPS_PATH=/tmp/lt-smoke/<key>/bk JWT_SECRET=smoke-0123456789abcdef0123456789abcdef RECOVERY_TOKEN=smoke-recovery-0123456789abcdef INSECURE_COOKIES=1 UPDATE_CHECK=off LOG_LEVEL=warn node index.js > /tmp/lt-smoke/<key>/server.log 2>&1 &
  (run it in the background; kill it when done). A fresh DB has no accounts: the first visit offers setup.
Browser: Playwright (playwright-core) is preinstalled. In a Node script under /tmp/lt-smoke/<key>/ use:
  const { launch, devices } = require('${args.pw}'); const browser = await launch(); const ctx = await browser.newContext({ ...devices['Pixel 7'] }); // or a desktop viewport
Capture page.on('console') errors and page.on('pageerror') for EVERY page, and take screenshots (/tmp/lt-smoke/<key>/*.png) at key steps; look at the screenshots with the Read tool (it shows images) to judge layout. Prefer role/text selectors; read the Svelte source in ${MAIN}/src to find selectors and expected behavior.
What counts as a finding: a real, reproducible defect a user would hit: uncaught errors, broken interactions, wrong data shown, layout breakage (overlap, clipped text, unreachable buttons) on a 390px phone or 320px narrow phone, untranslated keys shown raw (e.g. "diary.toast.x"), focus/keyboard traps, server 500s in server.log. Not findings: pure taste, things needing a real Android device, missing features.
Context: ~140 improvement commits were just merged onto this code by parallel agents (see \`git -C ${MAIN} log --oneline 5bdbc38..${BASE}\`), so bugs at the seams between them are likely. Focus your flow on what changed.
`

const FINDINGS = {
  type: 'object',
  properties: {
    coverage: { type: 'string', description: 'what you actually exercised and what you could not' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'kebab-case id' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          repro: { type: 'string', description: 'exact steps and the script path that reproduces it' },
          observed: { type: 'string' },
          expected: { type: 'string' },
          suspected_cause: { type: 'string', description: 'file:line if found' },
          screenshots: { type: 'array', items: { type: 'string' } },
        },
        required: ['slug', 'title', 'severity', 'repro', 'observed', 'expected', 'suspected_cause', 'screenshots'],
      },
    },
  },
  required: ['coverage', 'findings'],
}
const VERDICT = {
  type: 'object',
  properties: {
    reproduced: { type: 'boolean' },
    root_cause: { type: 'string', description: 'file:line and explanation' },
    fix_plan: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['reproduced', 'root_cause', 'fix_plan', 'notes'],
}
const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['committed', 'abandoned'] },
    commit: { type: 'string' },
    summary: { type: 'string' },
    tests_run: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['status', 'commit', 'summary', 'tests_run', 'notes'],
}
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ship', 'fix', 'drop'] },
    issues: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'issues', 'reasoning'],
}

const IMPL_RULES = `
Worktree: you are in a fresh git worktree. Run \`git checkout --detach ${BASE}\` first. Then \`ln -sfn ${MAIN}/node_modules node_modules && ln -sfn ${MAIN}/server/node_modules server/node_modules\`. NEVER stage those symlinks or a server/dist link: stage files explicitly by path, check \`git show --stat HEAD\`.
Commit on the detached HEAD (no branch ops; the sandbox refuses ref updates). Exactly one commit on top of ${BASE}; amend if needed. Report the full sha.
Tests: never the full suite. Run tests you add and every test that greps/imports touched files (grep -l '<basename>' scripts/*.test.js). If you touch src/, run \`npx vite build\`. If you can, re-run the reproducing Playwright script against YOUR worktree's build: build there, \`ln -sfn ../dist server/dist\` in your worktree (do not stage it), boot the server from your worktree's server/ on port+100 as in the recipe, and confirm the fix.
Preserve line endings (several src/components/ui and src/styles files are CRLF). No em dashes anywhere. English strings only in src/i18n/en.json. User-visible fix: one CHANGELOG.md line under the topmost Unreleased > Fixed list, matching style. Commit subject: \`fix(area): ...\`.
`

phase('Smoke')
const found = await parallel(args.flows.map(f => () => agent(
  `${RECIPE}\nYour key: ${f.key}. Your port: ${f.port}.\nYour flow to exercise thoroughly:\n${f.prompt}\nReturn every finding (none is a fine answer if the flow is solid). Kill your server at the end.`,
  { label: `smoke:${f.key}`, phase: 'Smoke', schema: FINDINGS })))
const all = found.filter(Boolean).flatMap((r, i) => r.findings.map(x => ({ ...x, flow: args.flows[i].key, port: args.flows[i].port })))
log(`${all.length} findings: ` + all.map(x => x.slug).join(', '))

const out = await pipeline(all,
  (fd, _o, i) => agent(`${RECIPE}\nYou are an independent verifier. Reproduce this UI finding from another agent, and find its root cause in the source. Use your own port ${5000 + i} and key verify-${fd.slug}. Default to reproduced=false if you cannot make it happen.\nFinding:\n${JSON.stringify(fd, null, 2)}`,
    { label: `repro:${fd.slug}`, phase: 'Reproduce', schema: VERDICT }),
  async (v, fd, i) => {
    if (!v || !v.reproduced) return { slug: fd.slug, title: fd.title, final: 'not-reproduced', fd, v }
    const impl = await agent(`Fix this reproduced UI defect in LiftTrace (Svelte 5 compat mode, no runes, plain JS).\nFinding:\n${JSON.stringify(fd, null, 2)}\nVerifier root cause: ${v.root_cause}\nFix plan: ${v.fix_plan}\n${IMPL_RULES}\nBoot recipe for re-checking:${RECIPE}\nAdd a regression test in scripts/ (behavioral if the logic can be extracted into a pure function, otherwise a wiring test).`,
      { label: `fix:${fd.slug}`, phase: 'Fix', schema: RESULT, isolation: 'worktree' })
    if (!impl || impl.status !== 'committed') return { slug: fd.slug, title: fd.title, final: 'abandoned', fd, v, impl }
    let sha = impl.commit
    const rv = (round) => `You are a senior reviewer. Review commit ${sha} (parent ${BASE}): \`git -C ${MAIN} show ${sha}\`; read context in ${MAIN}. It fixes this UI defect: ${JSON.stringify({ title: fd.title, observed: fd.observed, expected: fd.expected, root_cause: v.root_cause })}. Implementer notes: ${impl.summary} | ${impl.notes} | ${impl.tests_run}. Hunt for: wrong or partial fix, regressions elsewhere, broken wiring tests, hardcoded English, em dashes, CRLF churn, committed symlinks. verdict ship/fix/drop (round ${round}).`
    const r1 = await agent(rv(1), { label: `review:${fd.slug}`, phase: 'Review', schema: REVIEW })
    if (!r1 || r1.verdict !== 'fix') return { slug: fd.slug, title: fd.title, final: r1 ? r1.verdict : 'ship', sha, fd, v, impl, reviews: [r1] }
    const fx = await agent(`Fix review findings on commit ${sha}. In your worktree: \`git checkout --detach ${sha}\`, symlink node_modules, amend the commit (keep exactly one commit on top of ${BASE}).\nIssues:\n- ${r1.issues.join('\n- ')}\n${IMPL_RULES.replace(`Run \`git checkout --detach ${BASE}\` first.`, '')}`,
      { label: `fix2:${fd.slug}`, phase: 'Fix2', schema: RESULT, isolation: 'worktree' })
    if (fx && fx.status === 'committed' && fx.commit) sha = fx.commit
    const r2 = await agent(rv(2) + `\nPrevious issues that should now be fixed:\n- ${r1.issues.join('\n- ')}`, { label: `rereview:${fd.slug}`, phase: 'Review', schema: REVIEW })
    return { slug: fd.slug, title: fd.title, final: r2 ? r2.verdict : 'unknown', sha, fd, v, impl, fix: fx, reviews: [r1, r2] }
  })
return { coverage: found.filter(Boolean).map((r, i) => ({ flow: args.flows[i].key, coverage: r.coverage })), results: out.filter(Boolean) }
