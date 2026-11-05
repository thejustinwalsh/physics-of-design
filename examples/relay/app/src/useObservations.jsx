import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { captureRuntimeObservations } from './motion-observations.mjs';
import {
  invalidateInspection,
  subscribeInspection,
} from './inspection-events.mjs';

/** Explicit actual-host capture for tests/native inspection. Normal product use
 * has no polling, observer network traffic or recurring measurement clock.
 */
export function useObservations(snapshot) {
  const refs = useRef({}),
    callbacks = useRef(new Map()),
    latest = useRef(null);
  const captureSequence = useRef(0),
    captureSession = useRef(
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  const frame = useRef(0),
    mounted = useRef(false);
  const bind = useCallback((id) => {
    let callback = callbacks.current.get(id);
    if (!callback) {
      let attached = null;
      callback = (node) => {
        if (node) {
          attached = node;
          if (refs.current[id] !== node) {
            refs.current[id] = node;
            invalidateInspection();
          }
        } else {
          if (refs.current[id] === attached) {
            delete refs.current[id];
            invalidateInspection();
          }
          attached = null;
        }
      };
      callbacks.current.set(id, callback);
    }
    return callback;
  }, []);
  /** @param {{onlyIds?: string[], publish?: boolean}} [options] */
  const capture = useCallback((options = {}) => {
    const current = latest.current;
    if (
      !mounted.current ||
      !current ||
      current.foreground === false ||
      (Platform.OS === 'web' && document.hidden)
    )
      return null;
    const boxes = {},
      unavailable = {};
    for (const [id, node] of Object.entries(refs.current)) {
      if (options.onlyIds && !options.onlyIds.includes(id)) continue;
      if (
        node.isConnected === false ||
        typeof node.getBoundingClientRect !== 'function'
      ) {
        unavailable[id] =
          'Current host rectangle API unavailable or node detached';
        continue;
      }
      const r = node.getBoundingClientRect();
      if (
        !r ||
        !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(r[key]))
      ) {
        unavailable[id] = 'Host did not return a finite rectangle';
        continue;
      }
      const computed = Platform.OS === 'web' ? getComputedStyle(node) : null;
      boxes[id] = {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        nodeName: node.nodeName,
        scrollWidth: node.scrollWidth,
        scrollHeight: node.scrollHeight,
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
        scrollTop: Number.isFinite(node.scrollTop) ? node.scrollTop : null,
        scrollLeft: Number.isFinite(node.scrollLeft) ? node.scrollLeft : null,
        computed: computed
          ? Object.fromEntries(
              [
                'fontSize',
                'fontFamily',
                'fontOpticalSizing',
                'fontVariationSettings',
                'fontKerning',
                'fontFeatureSettings',
                'letterSpacing',
                'lineHeight',
                'paddingLeft',
                'paddingTop',
                'gap',
                'color',
                'backgroundColor',
                'flexDirection',
              ].map((key) => [key, computed[key] ?? null]),
            )
          : null,
      };
    }
    const receipt = {
      ...current,
      ...captureRuntimeObservations(),
      captureSession: captureSession.current,
      captureSequence: ++captureSequence.current,
      boxes,
      unavailable,
      captureScope: options.onlyIds ?? 'all-mounted-hosts',
      observedAt: new Date().toISOString(),
      runtime: `Expo58 / React19.3 / RN0.88 / RSD0.0.55 / ${Platform.OS}`,
      provider: Platform.OS === 'web' ? 'browser' : `native-${Platform.OS}`,
    };
    if (options.publish !== false) {
      globalThis.__RELAY_INSPECTION__ = receipt;
      if (Platform.OS === 'web') globalThis.__EXPO_DESIGN_PROOF__ = receipt;
    }
    const url = process.env.EXPO_PUBLIC_DESIGN_OBSERVER;
    if (url && Platform.OS !== 'web' && options.publish !== false)
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(receipt),
      }).catch(() => {});
    return receipt;
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    globalThis.__RELAY_CAPTURE__ = capture;
    const automatic =
      Boolean(process.env.EXPO_PUBLIC_DESIGN_OBSERVER) ||
      process.env.EXPO_PUBLIC_DESIGN_AUTOCAPTURE === '1';
    const unsubscribe = subscribeInspection(() => {
      if (automatic && !frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          capture();
        });
    });
    return () => {
      unsubscribe();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      mounted.current = false;
      if (globalThis.__RELAY_CAPTURE__ === capture) {
        delete globalThis.__RELAY_CAPTURE__;
        delete globalThis.__RELAY_INSPECTION__;
        if (Platform.OS === 'web') delete globalThis.__EXPO_DESIGN_PROOF__;
      }
    };
  }, [capture]);
  useLayoutEffect(() => {
    latest.current = snapshot;
    if (globalThis.__RELAY_CAPTURE__ === capture) {
      globalThis.__RELAY_INSPECTION__ = null;
      if (Platform.OS === 'web') globalThis.__EXPO_DESIGN_PROOF__ = null;
    }
    invalidateInspection();
  }, [snapshot, capture]);
  const ids = useCallback(
    () =>
      Object.keys(refs.current)
        .filter((id) => id.startsWith('relay-'))
        .sort(),
    [],
  );
  const scrollPosition = useCallback((id) => {
    const node = refs.current[id];
    if (!mounted.current || !node || node.isConnected === false) return null;
    const x = node.scrollLeft,
      y = node.scrollTop;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }, []);
  return useMemo(
    () => ({ bind, capture, ids, scrollPosition }),
    [bind, capture, ids, scrollPosition],
  );
}
