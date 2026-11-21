// A program workout (template) write, checked the way the server and the
// device copy check it (routes/templates.js, api-native.js): the name is
// trimmed, a blank one on a create or an edit is refused, an absent one on
// an edit keeps the current name. The offline queue uses it so a blank name
// is never queued (the server would refuse it on every replay).

/** `{ body }` (name trimmed) or `{ error }` for a write that isn't a template one. */
export function checkTemplateWrite(method, fullPath, body) {
  const path = String(fullPath).split('?')[0];
  const create = method === 'POST' && path === '/api/templates';
  const edit = method === 'PUT' && /^\/api\/templates\/-?\d+$/.test(path);
  if (!create && !edit) return { body };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { body };
  if (typeof body.name !== 'string') {
    return create ? { error: 'program_id and name required' } : { body };
  }
  const name = body.name.trim();
  if (!name) return { error: create ? 'program_id and name required' : 'Name required' };
  return { body: { ...body, name } };
}
