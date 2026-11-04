// One retained frame scheduler for cursor and decorative material work.
const listeners = new Set();
let frame = 0,
  last = 0;
function tick(now) {
  frame = 0;
  const dt = Math.min(0.04, last ? (now - last) / 1000 : 1 / 60);
  last = now;
  for (const callback of [...listeners])
    if (callback(dt) === true) listeners.delete(callback);
  if (listeners.size) frame = requestAnimationFrame(tick);
  else last = 0;
}
export function subscribeFrame(callback) {
  listeners.add(callback);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    listeners.delete(callback);
    if (!listeners.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  };
}
export const clockStats = () => ({
  subscribers: listeners.size,
  scheduled: !!frame,
});
