import { invalidateInspection } from './inspection-events.mjs';
const active = new Map();
export const captureLayoutObservations = () =>
  [...active].map(([id, read]) => ({ id, ...read() }));
export function registerLayout(id, read) {
  if (active.has(id)) throw Error(`Duplicate active layout identity: ${id}`);
  active.set(id, read);
  invalidateInspection();
  return () => {
    if (active.get(id) !== read) return;
    active.delete(id);
    invalidateInspection();
  };
}
