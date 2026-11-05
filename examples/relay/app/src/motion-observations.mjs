import { clockStats } from './clock.mjs';
import { invalidateInspection } from './inspection-events.mjs';
const active = new Map();
const inspect = () => [...active].map(([id, read]) => ({ id, ...read() }));
export const captureRuntimeObservations = () => ({
  motion: inspect(),
  clock: clockStats(),
});
export function registerMotion(id, read) {
  if (active.has(id)) throw Error(`Duplicate active motion identity: ${id}`);
  active.set(id, read);
  globalThis.__RELAY_MOTION__ = inspect;
  invalidateInspection();
  return () => {
    if (active.get(id) !== read) return;
    active.delete(id);
    if (!active.size && globalThis.__RELAY_MOTION__ === inspect)
      delete globalThis.__RELAY_MOTION__;
    invalidateInspection();
  };
}
