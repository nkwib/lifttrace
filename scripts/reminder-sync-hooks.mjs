/**
 * Loads the real src/lib/notifications.js under Node for
 * reminder-sync.test.js: Capacitor, the platform, the stored settings and the
 * API are swapped for stand-ins that count their calls in globalThis.__rem.
 * Everything else (reminder-plan.js, sync-refresh.js) is the app's own code.
 */
const STUBS = {
  'platform.js': `
    export const isNative = true;
    export const getServerUrl = () => null;`,
  'db.js': `
    export const DB = { getSetting: (k, d) => (globalThis.__rem.settings || {})[k] ?? d };
    export const localDateStr = () => globalThis.__rem.today;`,
  'api.js': `
    const r = () => globalThis.__rem;
    export const LtApi = {
      getFrequency: async () => { r().calls.getFrequency++; return []; },
      listExcusedDays: async () => { r().calls.listExcusedDays++; return []; },
    };`,
  'local-notifications': `
    const r = () => globalThis.__rem;
    export const LocalNotifications = {
      getPending: async () => { r().calls.getPending++; return { notifications: [] }; },
      cancel: async () => { r().calls.cancel++; },
      schedule: async () => { r().calls.schedule++; },
    };`,
};

export async function resolve(specifier, context, next) {
  const parent = context.parentURL || '';
  if (/\/src\/lib\/notifications\.js(\?|$)/.test(parent)) {
    const stub = STUBS[specifier.split('/').pop()];
    if (stub) return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true };
  }
  return next(specifier, context);
}

// Vite fills in import.meta.env; Node doesn't.
export async function load(url, context, next) {
  const out = await next(url, context);
  if (/\/src\/lib\/notifications\.js$/.test(url)) {
    out.source = String(out.source).replace(/import\.meta\.env\.DEV/g, 'false');
  }
  return out;
}
