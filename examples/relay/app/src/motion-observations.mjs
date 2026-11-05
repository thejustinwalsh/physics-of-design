const active = new Map();
const inspect = () => [...active].map(([id, read]) => ({ id, ...read() }));
export function registerMotion(id, read) {
  if (active.has(id)) throw Error(`Duplicate active motion identity: ${id}`);
  active.set(id, read);
  globalThis.__RELAY_MOTION__ = inspect;
  return () => {
    if (active.get(id) === read) active.delete(id);
    if (!active.size && globalThis.__RELAY_MOTION__ === inspect)
      delete globalThis.__RELAY_MOTION__;
  };
}
