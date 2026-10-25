import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Optional experiment instrumentation. Reads actual host-node rectangles;
 * declared snapshot values are deliberately separate from observed boxes. */
export function useObservations(snapshot) {
  const refs = useRef({}), latest = useRef(snapshot);
  latest.current = snapshot;
  const bind = useCallback((id) => (node) => {
    if (node) refs.current[id] = node; else delete refs.current[id];
  }, []);
  useEffect(() => {
    const capture = () => {
      const boxes = {};
      for (const [id, node] of Object.entries(refs.current)) {
        const r = node.getBoundingClientRect?.();
        if (r) boxes[id] = { x: r.x, y: r.y, width: r.width, height: r.height, nodeName: node.nodeName, scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, clientWidth: node.clientWidth, clientHeight: node.clientHeight };
      }
      const receipt = { ...latest.current, boxes, observedAt: new Date().toISOString(), runtime: `Expo58 / React19.3 / RN0.88 / RSD0.0.55 / ${Platform.OS}`, provider: Platform.OS === 'web' ? 'browser' : `native-${Platform.OS}` };
      if (Platform.OS === 'web') globalThis.__EXPO_DESIGN_PROOF__ = receipt;
      const url = process.env.EXPO_PUBLIC_DESIGN_OBSERVER;
      if (url && Platform.OS !== 'web') fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(receipt) }).catch(() => {});
    };
    const interval = setInterval(capture, 800); capture();
    return () => { clearInterval(interval); if (Platform.OS === 'web') delete globalThis.__EXPO_DESIGN_PROOF__; };
  }, []);
  return bind;
}
