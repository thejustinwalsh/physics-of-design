const listeners = new Set();
export function invalidateInspection() {
  for (const listener of listeners) listener();
}
export function subscribeInspection(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
