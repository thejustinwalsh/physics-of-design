import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Optional experiment instrumentation. Reads actual host-node rectangles;
 * declared snapshot values are deliberately separate from observed boxes. */
export function useObservations(snapshot) {
  const refs = useRef({}),
    latest = useRef(snapshot);
  latest.current = snapshot;
  const bind = useCallback(
    (id) => (node) => {
      if (node) refs.current[id] = node;
      else delete refs.current[id];
    },
    [],
  );
  useEffect(() => {
    const capture = () => {
      const boxes = {};
      for (const [id, node] of Object.entries(refs.current)) {
        const r = node.getBoundingClientRect?.();
        if (r) {
          const children = Array.from(node.childNodes ?? [])
            .flatMap((child) => {
              const box = child['getBoundingClientRect']?.();
              return box
                ? [
                    {
                      x: box.x,
                      y: box.y,
                      width: box.width,
                      height: box.height,
                      nodeName: child['nodeName'],
                    },
                  ]
                : [];
            })
            .slice(0, 8);
          const computed =
            Platform.OS === 'web' ? getComputedStyle(node) : null;
          const ancestors = [];
          let parent = node.parentNode;
          for (
            let depth = 0;
            parent && depth < 4;
            depth++, parent = parent.parentNode
          ) {
            const box = parent.getBoundingClientRect?.();
            if (box)
              ancestors.push({
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                nodeName: parent.nodeName,
              });
          }
          boxes[id] = {
            ancestors,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            nodeName: node.nodeName,
            scrollWidth: node.scrollWidth,
            scrollHeight: node.scrollHeight,
            clientWidth: node.clientWidth,
            clientHeight: node.clientHeight,
            children,
            computed: computed
              ? {
                  fontSize: computed.fontSize,
                  fontFamily: computed.fontFamily,
                  fontOpticalSizing: computed.fontOpticalSizing,
                  fontVariationSettings: computed.fontVariationSettings,
                  fontKerning: computed.fontKerning,
                  fontFeatureSettings: computed.fontFeatureSettings,
                  letterSpacing: computed.letterSpacing,
                  lineHeight: computed.lineHeight,
                  paddingLeft: computed.paddingLeft,
                  paddingTop: computed.paddingTop,
                  gap: computed.gap,
                  color: computed.color,
                  backgroundColor: computed.backgroundColor,
                  flexDirection: computed.flexDirection,
                }
              : null,
          };
        }
      }
      const receipt = {
        ...latest.current,
        boxes,
        observedAt: new Date().toISOString(),
        runtime: `Expo58 / React19.3 / RN0.88 / RSD0.0.55 / ${Platform.OS}`,
        provider: Platform.OS === 'web' ? 'browser' : `native-${Platform.OS}`,
      };
      if (Platform.OS === 'web') globalThis.__EXPO_DESIGN_PROOF__ = receipt;
      globalThis.__RELAY_INSPECTION__ = receipt;
      const url = process.env.EXPO_PUBLIC_DESIGN_OBSERVER;
      if (url && Platform.OS !== 'web')
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(receipt),
        }).catch(() => {});
    };
    const interval = setInterval(() => {
      if (
        latest.current.foreground !== false &&
        (Platform.OS !== 'web' || !document.hidden)
      )
        capture();
    }, 800);
    capture();
    return () => {
      clearInterval(interval);
      delete globalThis.__RELAY_INSPECTION__;
      if (Platform.OS === 'web') delete globalThis.__EXPO_DESIGN_PROOF__;
    };
  }, []);
  return bind;
}
