import { useLayoutEffect, useRef, useState } from 'react';
import { css, html } from 'react-strict-dom';
import { ScreenContext } from './ScreenContext';
const styles = css.create({
  root: {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
});
export default function Screen({ children }) {
  const ref = useRef(null);
  const [frame, setFrame] = useState(null);
  useLayoutEffect(() => {
    const root = ref.current;
    let alive = true;
    const measure = (entries) => {
      if (!alive || !root.isConnected) return;
      const rect = entries.find((entry) => entry.target === root)?.contentRect;
      if (!rect) return;
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        setFrame((previous) =>
          previous
            ? {
                ...previous,
                status: 'held',
                rejection: 'Non-finite or collapsed root content box',
              }
            : null,
        );
        return;
      }
      setFrame((previous) =>
        previous?.status === 'current' &&
        previous?.width === rect.width &&
        previous?.height === rect.height &&
        previous?.x === rect.x &&
        previous?.y === rect.y
          ? previous
          : {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              provider: 'browser-root-ResizeObserver',
              coordinateSpace: 'local-content-css-px',
              status: 'current',
            },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);
  return (
    <ScreenContext.Provider value={frame}>
      <html.div ref={ref} style={styles.root}>
        {children}
      </html.div>
    </ScreenContext.Provider>
  );
}
