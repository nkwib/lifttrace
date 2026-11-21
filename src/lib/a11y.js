// Enter/Space activation for div role="button" elements. Ignores events from
// nested controls (star, delete, rename buttons keep native behavior).
export function activateOnKey(e, fn) {
  if (e.target !== e.currentTarget) return;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  e.preventDefault();
  fn(e);
}

// Pointer-only click on a plain container whose keyboard path is a real
// <button> inside it (no role="button" wrapper around interactive children).
export function pointerClick(node, fn) {
  let cb = fn;
  const h = (e) => cb(e);
  node.addEventListener('click', h);
  return { update(next) { cb = next; }, destroy() { node.removeEventListener('click', h); } };
}
