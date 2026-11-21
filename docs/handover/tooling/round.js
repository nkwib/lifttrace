export const meta = {
  name: 'lifttrace-round',
  description: 'One full improvement round: scout, dedup, 3-lens round table, implement on branches, review, fix, re-review',
  phases: [
    { title: 'Scout' },
    { title: 'Dedup' },
    { title: 'Round table' },
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Re-review' },
  ],
}

// args: { main, done, round, base, lenses: [{key, prompt}] }  (done = absolute path of run-state/done.txt)
const BASE = args.base
const ROUND = args.round
const MAIN = args.main // absolute path of the integration checkout

const CONTEXT = `
Repo: LiftTrace (weightlifting tracker). Main checkout (read-only for you unless told otherwise): ${MAIN}, at commit ${BASE}.
Stack: Svelte 5 COMPAT mode (no runes), plain JS (no TypeScript), Vite, svelte-spa-router, svelte-i18n (only add English strings to src/i18n/en.json, never other locales), Capacitor Android (android/), Node server in server/ (SQLite, parameterized SQL only, requireAuth on routes), MCP + REST API, Wear OS app. Android Local mode has a parallel client data layer (src/lib/db-native.js, api-native.js) that must stay in parity with server semantics.
Tests: node --test scripts/<file>.test.js (many are "wiring" tests that grep sources, so renames can break them).
Docs: ARCHITECTURE.md, ROADMAP.md, CONTRIBUTING.md, CHANGELOG.md, docs/plans/training-depth-plan.md.
Already done or rejected (DO NOT propose again): see ${args.done} (read it).
`

const PROPOSALS = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'short kebab-case id, unique, branch-safe' },
          title: { type: 'string' },
          category: { type: 'string', enum: ['ui-ux', 'performance', 'bug-fix', 'new-feature', 'user-flow', 'accessibility'] },
          problem: { type: 'string' },
          evidence: { type: 'string', description: 'file:line references and quoted code proving the problem' },
          change: { type: 'string', description: 'concrete proposed change, files and approach' },
          files: { type: 'array', items: { type: 'string' } },
          test_plan: { type: 'string' },
          size: { type: 'string', enum: ['S', 'M', 'L'] },
          risk: { type: 'string' },
        },
        required: ['slug', 'title', 'category', 'problem', 'evidence', 'change', 'files', 'test_plan', 'size', 'risk'],
      },
    },
  },
  required: ['proposals'],
}

phase('Scout')
const scouted = await parallel(args.lenses.map(l => () => agent(
  `${CONTEXT}\nYou are a scout on a team improving this codebase (round ${ROUND}). Your lens: ${l.prompt}\n\nExplore the code thoroughly (read actual files, grep, git log). Return 3 to 6 of the BEST proposals in your lens, ranked by value/effort. Each must be real (verified in code at ${BASE}, not hypothetical), concrete, scoped so one engineer agent can implement and verify it without an Android device or browser (node tests, vite build, code reading). No sweeping refactors, no dependency swaps. Do not edit files.`,
  { label: `scout:${l.key}`, phase: 'Scout', schema: PROPOSALS }
)))
const raw = scouted.filter(Boolean).flatMap(r => r.proposals)
log(`${raw.length} raw proposals`)

phase('Dedup')
const dd = await agent(
  `Below are ${raw.length} improvement proposals as JSON. Merge duplicates/overlaps (same underlying problem or same code region with compatible changes), keeping the best evidence. Also drop any that duplicate items in ${args.done} (read it). Ensure slugs are unique. Return the remaining proposals with the same fields.\n\n${JSON.stringify(raw)}`,
  { label: 'dedup', phase: 'Dedup', schema: PROPOSALS }
)
const props = (dd && dd.proposals.length) ? dd.proposals : raw
log(`${props.length} after dedup`)

const VOTE = {
  type: 'object',
  properties: {
    approve: { type: 'boolean' },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
    refinements: { type: 'string', description: 'changes to the plan that make it correct/better, pitfalls for the implementer' },
  },
  required: ['approve', 'confidence', 'reasoning', 'refinements'],
}
const PANEL = [
  { key: 'skeptic', prompt: 'You are the CORRECTNESS SKEPTIC. Open every cited file and check the evidence is accurate and the problem is real today (not handled elsewhere, not a misread). Check the change would fix it without breaking other paths (sync, offline, Android native parity, MCP/REST). Reject if evidence is wrong or the problem is hypothetical. Default to reject when uncertain.' },
  { key: 'product', prompt: 'You are the PRODUCT/UX reviewer for a lifter using this app daily. Judge whether this gives real, noticeable value (or prevents real data loss/bugs) and whether the proposed behavior is the right UX. Reject cosmetic churn, speculative features, or added complexity not worth it.' },
  { key: 'maintainer', prompt: 'You are the MAINTAINER. Judge fit with conventions (Svelte 5 compat no runes, no TS, i18n via en.json only, tests in scripts/*.test.js, parameterized SQL, requireAuth), scope (one agent can implement and verify without a device?), regression risk, and conflicts with documented design decisions (ARCHITECTURE.md, ROADMAP.md, CHANGELOG.md).' },
]

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['committed', 'abandoned'] },
    commit: { type: 'string', description: 'full sha of the final commit' },
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
Worktree setup: you are in a fresh git worktree. Run \`git checkout --detach ${BASE}\` first (whatever HEAD is). Then \`ln -sfn ${MAIN}/node_modules node_modules && ln -sfn ${MAIN}/server/node_modules server/node_modules\`. NEVER \`git add\` those symlinks: stage files explicitly by path, and check \`git show --stat HEAD\` before finishing.
Commit on the detached HEAD (do not create or move branches, the sandbox refuses ref updates; the orchestrator records your sha). Exactly one commit on top of ${BASE} (amend if you need to). Report the full sha from \`git rev-parse HEAD\`.
Tests: NEVER run the full suite (6 minutes, shared machine). Run tests you add plus every test that greps or imports files you touch (grep -l '<basename>' scripts/*.test.js). If you touch src/, run \`npx vite build\` once at the end. Run \`npm run i18n:check\` if you touch en.json.
Preserve each file's line endings (several src/components/ui and styles files are CRLF; do not convert them).
Commit message: short user-facing sentence or \`fix(area): ...\`/\`perf(area): ...\`/\`feat(area): ...\`; brief body only for why. NEVER use em dashes anywhere (commit, CHANGELOG, comments). If user-visible, add a CHANGELOG.md line under the topmost unreleased section matching existing style.
`

const reviewPrompt = (p, sha, notes, round) => `${CONTEXT}
You are a senior code reviewer (review round ${round}). Review commit ${sha} (parent ${BASE}): \`git -C ${MAIN} show ${sha}\`. Read surrounding code in ${MAIN} to judge context.
What it was meant to do:\n${JSON.stringify(p)}\nImplementer notes: ${notes}
Hunt for: correctness bugs, regressions in other paths (sync/offline, Android native parity, REST/MCP), broken wiring tests, hardcoded English in UI, Svelte compat-mode mistakes, tests that do not test the behavior, em dashes, committed node_modules symlinks, line-ending churn (whole-file rewrites), scope creep. You may run targeted tests in a temporary worktree (git -C ${MAIN} worktree add /tmp/rev-r${ROUND}-${p.slug}-${round} ${sha} --detach; symlink node_modules; remove it after).
verdict: ship = correct and valuable (nits are not blockers); fix = real defects to fix (list precisely with file:line); drop = fundamentally wrong/harmful.`

phase('Round table')
const out = await pipeline(props,
  p => parallel(PANEL.map(r => () => agent(
    `${CONTEXT}\n${r.prompt}\n\nProposal under review:\n${JSON.stringify(p, null, 2)}\n\nInvestigate the code yourself before voting. Do not edit files.`,
    { label: `${r.key}:${p.slug}`, phase: 'Round table', schema: VOTE }
  ))).then(vs => {
    const v = vs.filter(Boolean)
    return { approvals: v.filter(x => x.approve).length, votes: v.map((x, i) => ({ reviewer: PANEL[i].key, ...x })) }
  }),
  async (rt, p) => {
    if (rt.approvals < 2) return { slug: p.slug, title: p.title, final: 'rejected', rt }
    const impl = await agent(`${CONTEXT}
Implement this improvement, approved by a 3-reviewer round table. Fold in their refinements and pitfalls. Verify claims as you go; if the premise turns out wrong, return status=abandoned with the reason.
Proposal:\n${JSON.stringify(p, null, 2)}\nRound table refinements:\n${rt.votes.map(v => `- ${v.reviewer} (${v.approve ? 'approve' : 'reject'}): ${v.refinements}`).join('\n')}
${IMPL_RULES}
Add tests per the test plan (new file scripts/${p.slug}.test.js or extend an existing one). Keep the diff focused.`,
      { label: `impl:${p.slug}`, phase: 'Implement', schema: RESULT, isolation: 'worktree' })
    if (!impl || impl.status !== 'committed') return { slug: p.slug, title: p.title, final: 'abandoned', rt, impl }
    let sha = impl.commit
    const r1 = await agent(reviewPrompt(p, sha, `${impl.summary} | ${impl.notes} | ${impl.tests_run}`, 1), { label: `review:${p.slug}`, phase: 'Review', schema: REVIEW })
    if (!r1 || r1.verdict !== 'fix') return { slug: p.slug, title: p.title, final: r1 ? r1.verdict : 'ship', sha, impl, reviews: [r1] }
    const fx = await agent(`${CONTEXT}
Fix review findings on commit ${sha}. In your worktree: \`git checkout --detach ${sha}\`, symlink node_modules (see rules), fix these issues by amending the commit (keep exactly one commit on top of ${BASE}):\n- ${r1.issues.join('\n- ')}\n\nOriginal proposal:\n${JSON.stringify(p)}\n${IMPL_RULES.replace(`Run \`git checkout --detach ${BASE}\` first (whatever HEAD is).`, '')}
If an issue is not actually a defect, explain in notes instead of changing code.`,
      { label: `fix:${p.slug}`, phase: 'Fix', schema: RESULT, isolation: 'worktree' })
    if (fx && fx.status === 'committed' && fx.commit) sha = fx.commit
    const r2 = await agent(reviewPrompt(p, sha, fx ? `${fx.summary} | ${fx.notes}` : impl.notes, 2) + `\nPrevious review issues that should now be fixed:\n- ${r1.issues.join('\n- ')}`,
      { label: `rereview:${p.slug}`, phase: 'Re-review', schema: REVIEW })
    return { slug: p.slug, title: p.title, final: r2 ? r2.verdict : 'unknown', sha, impl, fix: fx, reviews: [r1, r2] }
  },
)
const res = out.filter(Boolean)
log(res.map(r => `${r.slug}: ${r.final}`).join(', '))
return res
