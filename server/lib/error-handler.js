import { logger } from '../logger.js';

// Global express error handler. Unexpected errors (no status) and SQLite
// errors never echo their message.
export function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} - ${err.stack || err.message}`);
  if (res.headersSent) return;
  const internal = !err.status || String(err.code || '').startsWith('SQLITE_');
  res.status(err.status || 500).json({ error: internal ? 'Internal server error' : (err.message || 'Internal server error') });
}
