/**
 * JSON answers go gzipped when the client takes it. The Diary reads a year
 * of workouts on every visit and Statistics that plus the exercise catalog:
 * over a megabyte of JSON each time a phone opens the tab, which gzip cuts
 * four- to fiftyfold. Browsers and Android's HTTP stack ask for gzip and
 * unpack it themselves. Small answers go as they are: under 2 KB the
 * saving doesn't pay for the work.
 */
import zlib from 'node:zlib';

const MIN_BYTES = 2048;

const takesGzip = req => /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));

/** Sends a JSON text, gzipped when it's worth it and the client takes it. */
export function sendJson(req, res, body) {
  if (!res.get('Content-Type')) res.type('application/json');
  if (body.length < MIN_BYTES) { res.send(body); return; }
  res.vary('Accept-Encoding');
  if (!takesGzip(req)) { res.send(body); return; }
  zlib.gzip(body, (err, gz) => {
    if (err || res.headersSent) { if (!res.headersSent) res.send(body); return; }
    res.set('Content-Encoding', 'gzip');
    res.send(gz);
  });
}

/** Express middleware: every res.json answer goes through sendJson. */
export function gzipJson(req, res, next) {
  const json = res.json.bind(res);
  res.json = body => {
    const text = JSON.stringify(body);
    if (typeof text !== 'string') return json(body);
    sendJson(req, res, text);
    return res;
  };
  next();
}
