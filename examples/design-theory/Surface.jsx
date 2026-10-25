import React, { memo, useEffect, useRef, useState } from 'react';
import { createDeviceTiltController } from '../../src/browser-tilt.ts';
import { dampMotionValue } from '../../src/motion-dynamics.ts';
import { getRuntime } from './runtime.js';

export const Surface = memo(function Surface({
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
    fallbackRequest = useRef(null),
    current = useRef({ surface, accentSurface, normalScale, normalStrength });
  const [needsFallback, setNeedsFallback] = useState(false),
    [renderMode, setRenderMode] = useState('static'),
    [activated, setActivated] = useState(() =>
      new URLSearchParams(location.search).has('mainRenderer'),
    );
  current.current = { surface, accentSurface, normalScale, normalStrength };
  useEffect(() => {
    const stats = getRuntime().stats.surfaces[id];
    if (stats) stats.settings = current.current;
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
    if (!activated) {
      element.dataset.renderer = 'static';
      runtime.stats.surfaces[id] = {
        frames: 0,
        renderer: 'static',
        activation: 'not-requested',
        settings: current.current,
      };
      onStatus?.('static');
      return;
    }
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
      lastRender = -Infinity,
      dirty = true;
    let pointerX = 0,
      pointerY = 0,
      x = 0,
      y = 0,
      rect = null,
      mode = 'initializing';
    let width = 1,
      height = 1;
    let pendingConfig = {},
      appliedConfig = {};
    const report = (value) => {
      mode = value;
      setRenderMode(value);
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
          scene = null;
          canvas?.remove();
          setNeedsFallback(true);
        }
      });
      return canvas;
    };
    const forcedMain = new URLSearchParams(location.search).has('mainRenderer');
    const fallback = async (
      requested = false,
      reason = 'worker-unavailable',
    ) => {
      if (disposed || fallbackBusy || mode === 'main') return;
      clearTimeout(timeout);
      worker?.terminate();
      worker = null;
      inFlight = false;
      ready = false;
      if (!requested && !forcedMain) {
        canvas?.remove();
        report('static');
        runtime.stats.surfaces[id].fallbackReason = reason;
        setNeedsFallback(true);
        return;
      }
      if (requested) {
        const box = element.getBoundingClientRect();
        if (document.hidden || box.bottom <= 0 || box.top >= innerHeight)
          return;
      }
      fallbackBusy = true;
      setNeedsFallback(false);
      report('initializing');
      try {
        // Let the explicit loading state paint before an indivisible GPU compile.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const { createSurfaceScene } = await import('./surface-scene.js');
        if (disposed) return;
        const started = performance.now();
        scene = createSurfaceScene(replaceCanvas(), settings());
        appliedConfig = settings();
        pendingConfig = {};
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
        setNeedsFallback(true);
      } finally {
        fallbackBusy = false;
      }
    };
    fallbackRequest.current = () => fallback(true, 'explicit-load');
    const update = (next) => {
      if (disposed) return;
      if (runtime.stats.surfaces[id])
        runtime.stats.surfaces[id].settings = current.current;
      for (const [key, value] of Object.entries(next)) {
        if (JSON.stringify(value) !== JSON.stringify(appliedConfig[key]))
          pendingConfig[key] = value;
        else delete pendingConfig[key];
      }
      dirty = true;
    };
    const flushConfig = () => {
      if (!Object.keys(pendingConfig).length) return;
      const next = pendingConfig;
      pendingConfig = {};
      appliedConfig = { ...appliedConfig, ...next };
      if (worker) worker.postMessage({ type: 'config', settings: next });
      else scene?.update(next);
      const stats = runtime.stats.surfaces[id];
      if (stats) stats.configUpdates = (stats.configUpdates ?? 0) + 1;
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
        if (active) dirty = true;
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
    report('initializing');
    const c = replaceCanvas();
    if (
      typeof Worker !== 'undefined' &&
      typeof c.transferControlToOffscreen === 'function' &&
      !forcedMain
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
            flushConfig();
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
          } else if (data.type === 'error') fallback(false, 'worker-error');
        };
        worker.onerror = () => fallback(false, 'worker-error');
        const offscreen = c.transferControlToOffscreen();
        worker.postMessage(
          { type: 'init', canvas: offscreen, settings: settings() },
          [offscreen],
        );
        timeout = setTimeout(() => fallback(false, 'worker-timeout'), 4000);
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
      if ((reduced && !dirty) || time - lastRender < 1 / 30 || inFlight) return;
      const frame = { time, x, y, reduced };
      lastRender = time;
      dirty = false;
      flushConfig();
      if (worker) {
        inFlight = true;
        worker.postMessage({ type: 'frame', id: ++frameId, frame });
      } else scene?.render(frame);
      if (runtime.stats.surfaces[id]) runtime.stats.surfaces[id].frames++;
    });
    const motionChanged = () => {
      dirty = true;
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
      fallbackRequest.current = null;
    };
  }, [activated]);
  return (
    <div
      ref={host}
      className={className}
      role="group"
      aria-label={label}
      data-surface={id}
      data-renderer="static"
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
      {!activated && (
        <button
          type="button"
          onClick={() => setActivated(true)}
          data-activate-3d={id}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 34,
            transform: 'translateX(-50%)',
            zIndex: 2,
            minHeight: 44,
            padding: '12px 18px',
            border: '1px solid currentColor',
            background: 'var(--paper,#f2f0e6)',
            color: 'var(--ink,#171b18)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Activate 3D study ↗
        </button>
      )}
      <span
        data-surface-status
        style={{
          position: 'absolute',
          right: 14,
          bottom: 4,
          fontFamily: 'monospace',
          fontSize: 10,
          zIndex: 1,
        }}
      >
        {renderMode === 'initializing'
          ? 'Preparing 3D…'
          : renderMode === 'static'
            ? 'Static illustration'
            : renderMode === 'worker'
              ? 'Live 3D · worker'
              : 'Live 3D · main thread'}
      </span>
      {needsFallback && (
        <button
          type="button"
          onClick={() => fallbackRequest.current?.()}
          data-load-3d={id}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 22,
            transform: 'translateX(-50%)',
            zIndex: 2,
            minHeight: 44,
            padding: '12px 18px',
            border: '1px solid currentColor',
            background: 'var(--paper,#f2f0e6)',
            color: 'var(--ink,#171b18)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Load 3D preview ↗
        </button>
      )}
    </div>
  );
});
