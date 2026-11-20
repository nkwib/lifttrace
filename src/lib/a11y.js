// Enter/Space activation for div role="button" elements. Ignores events from
// nested controls (star, delete, rename buttons keep native behavior).
export function activateOnKey(e, fn) {
  if (e.target !== e.currentTarget) return;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  e.preventDefault();
  fn(e);
}
