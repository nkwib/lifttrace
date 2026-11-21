// E2E harness: boots the real server on a free port with a throwaway data
// dir, serves the built app (npm run build), seeds through the API and drives
// headless Chromium. Every page visited goes through checkPage(), so the
// usual smoke findings (uncaught errors, 5xx, raw i18n keys, overflow,
// clipped text, accessibility) fail a test with a short report instead of
// needing a person or an agent to look at screenshots.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, symlinkSync, lstatSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, devices } from 'playwright-core';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export const VIEWPORTS = {
  narrow: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { ...devices['Pixel 7'] },
  desktop: { viewport: { width: 1280, height: 800 } },
};

export const ADMIN = { username: 'admin', password: 'e2e-Admin-pass-0192' };

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.unref();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

function ensureDist() {
  const dist = path.join(ROOT, 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ missing: run `npm run build` first');
  const link = path.join(SERVER, 'dist');
  let present = false;
  try { lstatSync(link); present = true; } catch { /* absent */ }
  if (!present) symlinkSync('../dist', link);
}

// Boots one server. Each test file gets its own port and data dir.
export async function startServer({ env = {} } = {}) {
  ensureDist();
  const dir = mkdtempSync(path.join(tmpdir(), 'lt-e2e-'));
  for (const d of ['up', 'bk']) mkdirSync(path.join(dir, d));
  const port = await freePort();
  const proc = spawn(process.execPath, ['index.js'], {
    cwd: SERVER,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(dir, 'lt.db'),
      UPLOADS_PATH: path.join(dir, 'up'),
      BACKUPS_PATH: path.join(dir, 'bk'),
      JWT_SECRET: 'e2e-0123456789abcdef0123456789abcdef',
      RECOVERY_TOKEN: 'e2e-recovery-0123456789abcdef',
      INSECURE_COOKIES: '1',
      UPDATE_CHECK: 'off',
      LOG_LEVEL: 'warn',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (b) => { log += b; });
  proc.stderr.on('data', (b) => { log += b; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${log}`);
    try { if ((await fetch(`${url}/api/auth/status`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) { proc.kill(); throw new Error(`server did not start:\n${log}`); }
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    url,
    dir,
    log: () => log,
    async stop() {
      proc.kill();
      await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Small API client with the session cookie, for seeding.
export async function api(server, { username = ADMIN.username, password = ADMIN.password, register = false } = {}) {
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await fetch(server.url + p, {
      method,
      headers: { 'content-type': 'application/json', origin: server.url, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${text.slice(0, 300)}`);
    return data;
  };
  if (register) await call('POST', '/api/auth/register', { username, password, full_name: 'E2E Admin' });
  else await call('POST', '/api/auth/login', { username, password });
  return { call, get cookie() { return cookie; } };
}

let _browser;
export async function browser() {
  if (!_browser) _browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  return _browser;
}
export async function closeBrowser() { if (_browser) await _browser.close(); _browser = null; }

// A page signed in as `client` (from api()), with error capture attached.
export async function openPage(server, client, { view = 'phone', theme = 'dark', locale = 'en-US' } = {}) {
  const b = await browser();
  const ctx = await b.newContext({ ...VIEWPORTS[view], colorScheme: theme, locale, baseURL: server.url });
  if (client?.cookie) {
    const [name, value] = client.cookie.split('=');
    await ctx.addCookies([{ name, value, url: server.url }]);
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // 4xx resource loads are often the expected answer (a bad reset token);
  // the browser logs them as errors, so only 5xx (below) counts.
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  page.errors = errors;
  return page;
}

// Waits for the route to settle: network idle plus no skeletons/spinners.
export async function goto(page, hash) {
  await page.goto(`/#${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

const I18N_KEYS = (() => {
  const out = new Set();
  const walk = (o, pre) => {
    for (const [k, v] of Object.entries(o)) {
      const key = pre ? `${pre}.${k}` : k;
      if (v && typeof v === 'object') walk(v, key); else if (key.includes('.')) out.add(key);
    }
  };
  walk(JSON.parse(readFileSync(path.join(ROOT, 'src/i18n/en.json'), 'utf8')), '');
  return [...out];
})();

// axe rules worth failing a test on: names, roles, nesting, contrast.
const AXE_RULES = [
  'button-name', 'link-name', 'label', 'select-name', 'input-button-name', 'aria-toggle-field-name',
  'aria-input-field-name', 'aria-command-name', 'aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr-value',
  'nested-interactive', 'color-contrast', 'image-alt', 'duplicate-id-aria',
];

// Generic checks on whatever the page shows now. Returns a list of short,
// self-contained problem strings: empty means the page is fine.
// opts.skip: check names to skip ('overflow', 'clipped', 'i18n', 'icons', 'axe', 'errors').
// opts.axeExclude: CSS selectors axe should ignore (known, tracked issues).
export async function checkPage(page, { skip = [], axeExclude = [] } = {}) {
  const problems = [];
  if (!skip.includes('errors')) problems.push(...page.errors.splice(0));
  const layout = await page.evaluate(({ keys, doIcons, doOverflow, doClipped, doI18n }) => {
    const out = [];
    const desc = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
    };
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const W = window.innerWidth;
    if (doOverflow) {
      const sw = document.scrollingElement.scrollWidth;
      if (sw > W + 1) out.push(`overflow: page scrolls sideways (${sw}px > ${W}px)`);
      let n = 0;
      for (const el of document.querySelectorAll('button, a, input, select, [role=button], h1, h2, h3')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > W + 1 || r.left < -1) {
          // Ignore content inside a horizontal scroller (chips rows, carousels).
          let p = el.parentElement, scrolls = false;
          while (p && p !== document.body) { const ox = getComputedStyle(p).overflowX; if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) { scrolls = true; break; } p = p.parentElement; }
          if (!scrolls && n++ < 5) out.push(`off-screen: ${desc(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${W}px`);
        }
      }
    }
    if (doClipped) {
      let n = 0;
      for (const el of document.querySelectorAll('h1, h2, h3, button, label, .title, [class*=title], [class*=name]')) {
        if (!visible(el) || !el.innerText?.trim()) continue;
        const s = getComputedStyle(el);
        const hides = s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflow === 'clip';
        if (hides && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis' && n++ < 5)
          out.push(`clipped: ${desc(el)} (${el.scrollWidth}px of text in ${el.clientWidth}px, no ellipsis)`);
        if (el.clientWidth === 0 && n++ < 5) out.push(`collapsed: ${desc(el)} has zero width`);
      }
    }
    if (doIcons) {
      // Icon font ligature text ("close", "dashboard") inside a control is
      // read out as part of its name unless the icon is aria-hidden.
      const leaks = [...document.querySelectorAll('.material-symbols-rounded, .material-symbols-outlined, .material-icons')]
        .filter((e) => visible(e) && !e.closest('[aria-hidden="true"]') && e.closest('button, a[href], [role=button], [role=tab], [role=menuitem], label'));
      for (const e of leaks.slice(0, 5)) out.push(`icon-name: "${e.textContent.trim()}" leaks into ${desc(e.closest('button, a[href], [role=button], [role=tab], [role=menuitem], label'))}`);
      if (leaks.length > 5) out.push(`icon-name: +${leaks.length - 5} more`);
    }
    if (doI18n) {
      const text = document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title],[placeholder]')]
        .map((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('placeholder')].join(' ')).join(' ');
      const raw = keys.filter((k) => text.includes(k)).slice(0, 5);
      for (const k of raw) out.push(`i18n: raw key "${k}" shown`);
    }
    return out;
  }, { keys: I18N_KEYS, doIcons: !skip.includes('icons'), doOverflow: !skip.includes('overflow'), doClipped: !skip.includes('clipped'), doI18n: !skip.includes('i18n') });
  problems.push(...layout);
  if (!skip.includes('axe')) {
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(async ({ rules, exclude }) => {
      const r = await window.axe.run({ include: [document.body], exclude: exclude.map((s) => [s]) }, { runOnly: { type: 'rule', values: rules }, resultTypes: ['violations'] });
      return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')}${n.any[0]?.message ? `: ${n.any[0].message.slice(0, 120)}` : ''}`), more: Math.max(0, v.nodes.length - 3) }));
    }, { rules: AXE_RULES, exclude: axeExclude });
    for (const v of res) for (const n of v.nodes) problems.push(`a11y ${v.id}: ${n}`);
    for (const v of res) if (v.more) problems.push(`a11y ${v.id}: +${v.more} more`);
  }
  return problems;
}

// Failure helper: saves a screenshot (path only in the message, nobody has
// to open it unless the text is not enough) and throws a compact report.
export async function expectClean(page, label, opts) {
  const problems = await checkPage(page, opts);
  if (!problems.length) return;
  const dir = path.join(tmpdir(), 'lt-e2e-shots');
  mkdirSync(dir, { recursive: true });
  const shot = path.join(dir, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  throw new Error(`${label}: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}\n  screenshot: ${shot}`);
}
