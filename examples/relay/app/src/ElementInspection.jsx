import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserElementInspector } from '@design-theory/toolkit/browser';
import { UI } from './ui';
import { subscribeInspection } from './inspection-events.mjs';

export function useElementInspection(targetId) {
  const ui = useContext(UI);
  const [receipt, setReceipt] = useState(null);
  const [ids, setIds] = useState([]);
  const inspector = useRef(null);
  const context = {
    sourceIdentity: process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound',
    inputKey: ui.inspectionInputKey,
  };
  useLayoutEffect(() => {
    const controller = createBrowserElementInspector({
      targetId,
      context,
      onSample: setReceipt,
    });
    inspector.current = controller;
    const refresh = () => {
      const next = ui.observations.ids();
      setIds((previous) =>
        previous.join('\n') === next.join('\n') ? previous : next,
      );
      controller.invalidate();
    };
    refresh();
    const unsubscribe = subscribeInspection(refresh);
    return () => {
      unsubscribe();
      controller.dispose();
      if (inspector.current === controller) inspector.current = null;
    };
  }, [ui.observations]);
  useLayoutEffect(() => {
    setReceipt(null);
    inspector.current?.update({ targetId, context });
  }, [targetId, context.sourceIdentity, context.inputKey]);
  // Never draw a receipt for an earlier selection or committed input identity.
  const current =
    receipt?.targetId === targetId &&
    receipt?.context.inputKey === context.inputKey &&
    receipt?.context.sourceIdentity === context.sourceIdentity
      ? receipt
      : null;
  return { receipt: current, ids };
}

export default function ElementInspection({ receipt }) {
  const { t } = useContext(UI);
  if (receipt?.status !== 'measured' || !receipt.box) return null;
  const { x, y, width, height } = receipt.box;
  const labelX = Math.max(8, Math.min(window.innerWidth - 220, x + 5));
  const labelY = Math.max(20, Math.min(window.innerHeight - 12, y - 9));
  return createPortal(
    <svg
      data-design-inspection-ui="drawing"
      data-testid="inspection-drawing"
      aria-label={`Measured viewport bounding box: ${width.toFixed(2)} by ${height.toFixed(2)} CSS pixels`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 89,
      }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={t.accent}
        strokeWidth="1.5"
      />
      <path
        d={`M${x},${y + 5}v-10 M${x},${y}h${width} M${x + width},${y + 5}v-10 M${x + 5},${y}h-10 M${x},${y}v${height} M${x + 5},${y + height}h-10`}
        fill="none"
        stroke={t.accent}
        strokeWidth="1"
      />
      <rect
        x={labelX - 4}
        y={labelY - 14}
        width={212}
        height={21}
        rx={3}
        fill={t.canvas}
        stroke={t.accent}
      />
      <text
        x={labelX}
        y={labelY}
        fill={t.ink}
        fontFamily="monospace"
        fontSize={12}
      >
        {width.toFixed(2)} × {height.toFixed(2)} CSS px
      </text>
    </svg>,
    document.body,
  );
}
