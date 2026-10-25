import { gsap } from 'gsap';
import {
  createDrivenMotion,
  sampleMotionTimeline,
  sampleTimelineProgress,
} from '../../src/motion-dynamics.ts';

// Additive web choreography. The saved design handoff and its WAAPI page
// entrance remain separate evidence; this controller owns only descendants.
export function installVelaMotion({
  root,
  main,
  screen,
  reduced,
  spring,
  distance,
}) {
  const diagnostics = (window.__VELA_WEB_MOTION__ ??= {
    implementation: 'vela-web-motion-v1',
    events: [],
    activeScenes: 0,
    activePresses: 0,
    driver:
      'GSAP timelines + Design Theory sampled/held-target spring dynamics',
  });
  const record = (kind, data = {}) => {
    diagnostics.events.push({
      kind,
      screen,
      reduced,
      at: performance.now(),
      ...data,
    });
    if (diagnostics.events.length > 160) diagnostics.events.shift();
  };
  const headings = [...main.querySelectorAll('[data-motion-heading]')];
  const cards = [...main.querySelectorAll('[data-motion-card]')].filter(
    (card) => !card.matches('[data-region="saved-session"]'),
  );
  const success = main.querySelector('[data-region="saved-session"]');
  const check = success?.querySelector('svg');
  const table = sampleMotionTimeline({
    motion: {
      spring,
      coordinate: { unit: 'normalized', from: 0, to: 1 },
      durationSeconds: 0.8,
    },
    min: 0,
    max: 1.08,
    sampleCount: 97,
  });
  const springEase = (progress) => sampleTimelineProgress(table, progress);
  let disposed = false;
  let sceneActive = true;
  diagnostics.activeScenes++;
  record('scene-start', {
    entries: headings.length + cards.length,
    completion: Boolean(success),
    durationSeconds: reduced
      ? 0.12
      : 0.8 + Math.max(0, cards.length - 1) * 0.065,
  });
  const finishScene = () => {
    if (!sceneActive) return;
    sceneActive = false;
    diagnostics.activeScenes--;
    record('scene-complete');
  };
  const context = gsap.context(() => {
    const timeline = gsap.timeline({ onComplete: finishScene });
    if (reduced) {
      // No translation, scaling, rotation or press displacement in this mode.
      timeline.fromTo(
        [...headings, ...cards, ...(success ? [success] : [])],
        { opacity: 0.7 },
        { opacity: 1, duration: 0.12, ease: 'none', clearProps: 'opacity' },
      );
      return;
    }
    timeline.fromTo(
      headings,
      { y: Math.min(18, distance * 0.45), opacity: 0.55 },
      {
        y: 0,
        opacity: 1,
        duration: 0.7,
        ease: springEase,
        stagger: 0.045,
        clearProps: 'transform,opacity',
      },
      0,
    );
    if (cards.length)
      timeline.fromTo(
        cards,
        { y: Math.min(30, distance * 0.75), opacity: 0.65 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: springEase,
          stagger: 0.065,
          clearProps: 'transform,opacity',
        },
        0.055,
      );
    if (success) {
      timeline.fromTo(
        success,
        { scale: 0.92, y: 20, opacity: 0.6, transformOrigin: '50% 50%' },
        {
          scale: 1,
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: springEase,
          clearProps: 'transform,transformOrigin,opacity',
        },
        0.04,
      );
      timeline.fromTo(
        check,
        { scale: 0.55, rotation: -18, transformOrigin: '50% 50%' },
        {
          scale: 1,
          rotation: 0,
          duration: 0.65,
          ease: springEase,
          clearProps: 'transform,transformOrigin',
        },
        0.12,
      );
      record('completion-start');
    }
  }, root);

  // A single frame driver serves all currently pressed buttons. Retargeting
  // preserves position and velocity; there is no React state update per frame.
  const presses = new Map();
  let ticking = false;
  const stopTicker = () => {
    if (!ticking) return;
    gsap.ticker.remove(tick);
    ticking = false;
  };
  const restore = (button, state) => {
    gsap.set(button, { clearProps: 'transform,transformOrigin' });
    button.style.transform = state.transform;
    button.style.transformOrigin = state.origin;
    presses.delete(button);
    diagnostics.activePresses = presses.size;
  };
  const tick = (_time, deltaMs) => {
    for (const [button, state] of presses) {
      if (!button.isConnected) {
        restore(button, state);
        continue;
      }
      const value = state.driver.advance(
        Math.min(0.05, Math.max(0, deltaMs / 1000)),
      );
      state.setScale(value.position);
      if (
        value.target === 1 &&
        Math.abs(value.position - 1) < 0.00005 &&
        Math.abs(value.velocity) < 0.0005
      )
        restore(button, state);
    }
    if (!presses.size) stopTicker();
  };
  const press = (event) => {
    if (
      reduced ||
      disposed ||
      (event.type === 'keydown' &&
        (![' ', 'Enter'].includes(event.key) || event.repeat))
    )
      return;
    if (event.type === 'pointerdown' && event.button !== 0) return;
    const button = event.target.closest?.('button:not(:disabled)');
    if (!button || !root.contains(button)) return;
    let state = presses.get(button);
    if (!state) {
      const setX = gsap.quickSetter(button, 'scaleX');
      const setY = gsap.quickSetter(button, 'scaleY');
      state = {
        driver: createDrivenMotion({ spring, position: 1 }),
        setScale: (value) => {
          setX(value);
          setY(value);
        },
        transform: button.style.transform,
        origin: button.style.transformOrigin,
      };
      presses.set(button, state);
    }
    state.driver.retarget(0.965);
    diagnostics.activePresses = presses.size;
    record('press', {
      label: button.textContent.trim().slice(0, 80),
      target: 0.965,
    });
    if (!ticking) {
      ticking = true;
      gsap.ticker.add(tick);
    }
  };
  const release = (event) => {
    if (event.type === 'keyup' && ![' ', 'Enter'].includes(event.key)) return;
    for (const state of presses.values()) state.driver.retarget(1);
    if (presses.size) record('release');
  };
  root.addEventListener('pointerdown', press);
  root.addEventListener('keydown', press);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keyup', release);
  window.addEventListener('blur', release);
  return () => {
    disposed = true;
    root.removeEventListener('pointerdown', press);
    root.removeEventListener('keydown', press);
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
    window.removeEventListener('keyup', release);
    window.removeEventListener('blur', release);
    stopTicker();
    for (const [button, state] of presses) restore(button, state);
    context.revert();
    if (sceneActive) {
      sceneActive = false;
      diagnostics.activeScenes--;
    }
    record('cleanup');
  };
}
