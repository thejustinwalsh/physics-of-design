import { css, html } from 'react-strict-dom';
import { useCallback, useLayoutEffect, useRef } from 'react';
const styles = css.create({
  scroll: { overflow: 'auto', flexGrow: 1, flexShrink: 1, minHeight: 0 },
});
const positions = new Map();
export default function Scroll({
  children,
  routeKey = null,
  observationRef = null,
  observationId = 'relay-task-viewport',
}) {
  const ref = useRef(null);
  const attach = useCallback(
    (node) => {
      ref.current = node;
      observationRef?.(node);
    },
    [observationRef],
  );
  useLayoutEffect(() => {
    if (!routeKey) return;
    const node = ref.current;
    node.scrollTop = positions.get(routeKey) ?? 0;
    const listener = () => positions.set(routeKey, node.scrollTop);
    node.addEventListener('scroll', listener);
    return () => node.removeEventListener('scroll', listener);
  }, [routeKey]);
  return (
    <html.div
      ref={attach}
      data-testid={observationRef ? observationId : undefined}
      style={styles.scroll}
    >
      {children}
    </html.div>
  );
}
