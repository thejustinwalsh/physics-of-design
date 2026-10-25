import React, { useEffect, useRef } from 'react';
import { createDeviceTiltController } from '../../src/browser-tilt.ts';
import { dampMotionValue } from '../../src/motion-dynamics.ts';
import { getRuntime } from './runtime.js';

export function Surface({
  surface,
  accentSurface,
  normalScale = 1,
  normalStrength = 0.11,
  id,
  onStatus,
  controllerRef,
  className,
  label = 'Interactive sculpture with physically based materials',
}) {
  const host = useRef(null),
    bridge = useRef(null),
    current = useRef({ surface, accentSurface, normalScale, normalStrength });
  current.current = { surface, accentSurface, normalScale, normalStrength };
  useEffect(() => {
    bridge.current?.update({
      surface,
      accentSurface,
      normalScale,
      normalStrength,
    });
  }, [surface, accentSurface, normalScale, normalStrength]);
  useEffect(() => {
    const element = host.current,
      runtime = getRuntime();
    const tilt = createDeviceTiltController();
    if (controllerRef) controllerRef.current = tilt;
    const initStart = performance.now();
    let fallbackBusy = false;
    let disposed = false,
      worker = null,
      scene = null,
      ready = false,
      active = false;
    let canvas = null,
      timeout = null,
      inFlight = false,
      frameId = 0,
      lastRender = -Infinity;
    let pointerX = 0,
      pointerY = 0,
      x = 0,
      y = 0,
      rect = null,
      mode = 'initializing';
    let width = 1,
      height = 1;
    const report = (value) => {
      mode = value;
      element.dataset.renderer = value;
      runtime.stats.surfaces[id] = {
        frames: 0,
        ...runtime.stats.surfaces[id],
        renderer: value,
        initializationMilliseconds: performance.now() - initStart,
        settings: current.current,
      };
      onStatus?.(value);
    };
    const settings = () => ({
      width,
      height,
      dpr: window.devicePixelRatio,
      ...current.current,
    });
    const replaceCanvas = () => {
      canvas?.remove();
      canvas = document.createElement('canvas');
      canvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;display:block';
      canvas.setAttribute('aria-hidden', 'true');
      element.appendChild(canvas);
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        if (!disposed) {
          ready = false;
          report('static');
          worker?.terminate();
          worker = null;
          scene?.dispose();
          canvas?.remove();
        }
      });
      return canvas;
    };
    const fallback = async () => {
      if (disposed || fallbackBusy || mode === 'main' || mode === 'static')
        return;
      fallbackBusy = true;
      clearTimeout(timeout);
      worker?.terminate();
      worker = null;
      inFlight = false;
      try {
        const { createSurfaceScene } = await import('./surface-scene.js');
        if (disposed) return;
        const started = performance.now();
        scene = createSurfaceScene(replaceCanvas(), settings());
        const draw = scene.render({ reduced: true });
        const initializationMilliseconds = performance.now() - started;
        ready = true;
        report('main');
        Object.assign(runtime.stats.surfaces[id], {
          mainThreadInitializationMilliseconds: initializationMilliseconds,
          draw,
        });
      } catch {
        ready = false;
        canvas?.remove();
        report('static');
      } finally {
        fallbackBusy = false;
      }
    };
    const update = (next) => {
      if (disposed) return;
      if (runtime.stats.surfaces[id])
        runtime.stats.surfaces[id].settings = current.current;
      if (worker && ready)
        worker.postMessage({ type: 'config', settings: next });
      else {
        scene?.update(next);
        scene?.render({ reduced: true });
      }
      lastRender = -Infinity;
    };
    bridge.current = { update };
    const resize = new ResizeObserver(([entry]) => {
      width = Math.max(1, Math.round(entry.contentRect.width));
      height = Math.max(1, Math.round(entry.contentRect.height));
      update(settings());
    });
    resize.observe(element);
    const box = element.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    const visibility = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        if (active) lastRender = -Infinity;
      },
      { rootMargin: '100px' },
    );
    visibility.observe(element);
    const pointerEnter = () => {
      rect = element.getBoundingClientRect();
    };
    const pointerMove = (event) => {
      if (!rect || runtime.reduced || event.pointerType === 'touch') return;
      pointerX = Math.max(
        -1,
        Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1),
      );
      pointerY = Math.max(
        -1,
        Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
    };
    const pointerLeave = () => {
      pointerX = pointerY = 0;
    };
    element.addEventListener('pointerenter', pointerEnter);
    element.addEventListener('pointermove', pointerMove, { passive: true });
    element.addEventListener('pointerleave', pointerLeave);
    const c = replaceCanvas();
    if (
      typeof Worker !== 'undefined' &&
      typeof c.transferControlToOffscreen === 'function' &&
      !new URLSearchParams(location.search).has('mainRenderer')
    ) {
      try {
        worker = new Worker(new URL('./surface-worker.js', document.baseURI), {
          type: 'module',
        });
        worker.onmessage = ({ data }) => {
          if (disposed) return;
          if (data.type === 'ready') {
            ready = true;
            // The initialization draw may have used pre-font/pre-resize bounds.
            // Keep the illustration until a requested frame with current bounds
            // has completed, including for surfaces below the viewport.
            report('initializing');
            Object.assign(runtime.stats.surfaces[id], {
              workerInitializationMilliseconds: data.initializationMilliseconds,
              draw: data.draw,
            });
            update(settings());
            inFlight = true;
            worker.postMessage({
              type: 'frame',
              id: ++frameId,
              frame: { reduced: true },
            });
            runtime.stats.surfaces[id].frames++;
          } else if (data.type === 'frame') {
            if (typeof data.id === 'number' && data.id === frameId) {
              clearTimeout(timeout);
              inFlight = false;
              if (mode !== 'worker') report('worker');
              runtime.stats.surfaces[id].lastAcknowledgedFrameId = data.id;
            }
            Object.assign(runtime.stats.surfaces[id], {
              draw: data.draw,
              lastRenderMilliseconds: data.renderMilliseconds,
            });
          } else if (data.type === 'error') fallback();
        };
        worker.onerror = fallback;
        const offscreen = c.transferControlToOffscreen();
        worker.postMessage(
          { type: 'init', canvas: offscreen, settings: settings() },
          [offscreen],
        );
        timeout = setTimeout(fallback, 4000);
      } catch {
        fallback();
      }
    } else fallback();
    const unsubscribe = runtime.subscribe((time, dt, reduced) => {
      if (!ready || !active || disposed || mode === 'static') return;
      const input = tilt.sample(dt);
      x = reduced
        ? 0
        : dampMotionValue(
            x,
            tilt.status === 'active' ? input.x : pointerX,
            9,
            dt,
          );
      y = reduced
        ? 0
        : dampMotionValue(
            y,
            tilt.status === 'active' ? input.y : pointerY,
            9,
            dt,
          );
      // Decorative surface is capped to 30fps; one frame in flight, no sensor queue.
      if (
        (reduced && lastRender !== -Infinity) ||
        time - lastRender < 1 / 30 ||
        inFlight
      )
        return;
      const frame = { time, x, y, reduced };
      lastRender = time;
      if (worker) {
        inFlight = true;
        worker.postMessage({ type: 'frame', id: ++frameId, frame });
      } else scene?.render(frame);
      if (runtime.stats.surfaces[id]) runtime.stats.surfaces[id].frames++;
    });
    const motionChanged = () => {
      lastRender = -Infinity;
    };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', motionChanged);
    return () => {
      disposed = true;
      clearTimeout(timeout);
      unsubscribe();
      resize.disconnect();
      visibility.disconnect();
      media.removeEventListener('change', motionChanged);
      element.removeEventListener('pointerenter', pointerEnter);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerleave', pointerLeave);
      tilt.dispose();
      if (controllerRef) controllerRef.current = null;
      worker?.postMessage({ type: 'dispose' });
      worker?.terminate();
      scene?.dispose();
      canvas?.remove();
      bridge.current = null;
    };
  }, []);
  return (
    <div
      ref={host}
      className={className}
      role="img"
      aria-label={label}
      data-surface={id}
      data-renderer="initializing"
    >
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.25,
        }}
      >
        <ellipse
          cx="200"
          cy="210"
          rx="88"
          ry="120"
          fill="none"
          stroke="currentColor"
          strokeWidth="40"
          transform="rotate(-28 200 200)"
        />
        <circle cx="310" cy="100" r="18" fill="currentColor" />
      </svg>
    </div>
  );
}
