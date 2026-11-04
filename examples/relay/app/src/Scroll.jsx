import { css, html } from 'react-strict-dom';
import { useLayoutEffect, useRef } from 'react';
const styles = css.create({
  scroll: { overflow: 'auto', flexGrow: 1, flexShrink: 1, minHeight: 0 },
});
const positions = new Map();
export default function Scroll({ children, routeKey = null }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!routeKey) return;
    const node = ref.current;
    node.scrollTop = positions.get(routeKey) ?? 0;
    const listener = () => positions.set(routeKey, node.scrollTop);
    node.addEventListener('scroll', listener);
    return () => node.removeEventListener('scroll', listener);
  }, [routeKey]);
  return (
    <html.div ref={ref} style={styles.scroll}>
      {children}
    </html.div>
  );
}
