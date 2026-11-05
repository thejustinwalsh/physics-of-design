import { useContext, useLayoutEffect, useState } from 'react';
import { UI } from './ui';
import { subscribeInspection } from './inspection-events.mjs';

export function useElementInspection(targetId) {
  const ui = useContext(UI);
  const [sample, setSample] = useState(null);
  const [ids, setIds] = useState([]);
  const inputKey = ui.inspectionInputKey;
  useLayoutEffect(() => {
    let frame = 0;
    let disposed = false;
    setSample(null);
    const refresh = () => {
      if (frame || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed) return;
        const capture = ui.observations.capture({
          onlyIds: [targetId],
          publish: false,
        });
        const next = ui.observations.ids();
        setIds((previous) =>
          previous.join('\n') === next.join('\n') ? previous : next,
        );
        const box = capture?.boxes?.[targetId] ?? null;
        setSample({
          provider: capture?.provider ?? 'native',
          coordinateSpace: 'native-host-coordinates',
          status: box ? 'measured' : 'missing',
          targetId,
          context: {
            sourceIdentity: capture?.sourceIdentity ?? 'unbound',
            inputKey,
          },
          observedAt: capture?.observedAt ?? null,
          box,
          contentBox: null,
          computed: null,
          detail:
            'Actual host rectangle; projection into the OS modal coordinate space is unverified. Text baselines, ink and variable axes are unavailable.',
        });
      });
    };
    const unsubscribe = subscribeInspection(refresh);
    refresh();
    return () => {
      disposed = true;
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId, inputKey, ui.observations, ui.foreground]);
  return {
    receipt:
      sample?.context.inputKey === inputKey && sample?.targetId === targetId
        ? sample
        : null,
    ids,
  };
}

// A native host rectangle is not sufficient to draw in an OS modal. Keep the
// coordinate projection explicitly unsupported until measured on that platform.
export default function ElementInspection() {
  return null;
}
