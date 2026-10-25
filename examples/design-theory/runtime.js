import { gsap } from 'gsap';
import Lenis from 'lenis';

let runtime;
export function getRuntime() {
  if (runtime) return runtime;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new Set();
  const lenis = new Lenis({
    autoRaf: false,
    anchors: true,
    smoothWheel: true,
    syncTouch: false,
    respectReducedMotion: true,
  });
  let lastTime = null;
  const stats = {
    ticks: 0,
    frameCallbacks: 0,
    maxCallbackMilliseconds: 0,
    reduced: media.matches,
    scroll: 0,
    surfaces: {},
  };
  const tick = (time) => {
    if (document.hidden) {
      lastTime = null;
      return;
    }
    const dt =
      lastTime === null ? 0 : Math.min(0.05, Math.max(0, time - lastTime));
    lastTime = time;
    const start = performance.now();
    lenis.raf(time * 1000);
    stats.scroll = lenis.scroll;
    stats.ticks++;
    stats.reduced = media.matches;
    for (const listener of listeners)
      listener(time, media.matches ? 0 : dt, media.matches);
    stats.frameCallbacks++;
    stats.maxCallbackMilliseconds = Math.max(
      stats.maxCallbackMilliseconds,
      performance.now() - start,
    );
  };
  gsap.ticker.add(tick);
  runtime = {
    stats,
    lenis,
    get reduced() {
      return media.matches;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    scrollTo(target) {
      lenis.scrollTo(target, { immediate: media.matches, duration: 1.1 });
    },
    dispose() {
      gsap.ticker.remove(tick);
      listeners.clear();
      lenis.destroy();
      runtime = null;
    },
  };
  return runtime;
}
