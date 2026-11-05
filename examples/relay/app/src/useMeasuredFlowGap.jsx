import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { analyzeComposition } from '@design-theory/toolkit/layout';
import { UI } from './ui';
import {
  subscribeInspection,
  invalidateInspection,
} from './inspection-events.mjs';
import { registerLayout } from './layout-observations.mjs';

/** Bounded measurement -> projection -> application -> remeasurement.
 * No polling or neural calls. Scrolled content is never repositioned by this hook. */
export default function useMeasuredFlowGap({
  active,
  automatic,
  intervalsBefore,
  policy,
}) {
  const ui = useContext(UI),
    [gap, setGap] = useState(policy.preferredGap);
  const appliedGap = active && automatic ? gap : policy.preferredGap;
  const key = JSON.stringify([
    ui.inspectionInputKey,
    active,
    automatic,
    intervalsBefore,
    policy,
  ]);
  const committedInputs = {
    ui,
    key,
    active,
    automatic,
    intervalsBefore,
    policy,
    appliedGap,
  };
  const latest = useRef(committedInputs),
    schedule = useRef(null),
    readout = useRef(null);
  // RAF readers must pair committed inputs with committed host geometry.
  useLayoutEffect(() => {
    latest.current = committedInputs;
  });
  useLayoutEffect(() => {
    let frame = 0,
      disposed = false,
      currentKey = null,
      projections = 0,
      observations = 0;
    const publish = (next) => {
      const previous = readout.current;
      const signature = JSON.stringify(next);
      const changed = previous?.signature !== signature;
      readout.current = {
        ...next,
        signature,
        observations,
        projections,
        observedAt: changed ? new Date().toISOString() : previous.observedAt,
      };
      if (changed) invalidateInspection();
    };
    const measure = () => {
      frame = 0;
      if (disposed) return;
      const current = latest.current;
      if (current.key !== currentKey) {
        currentKey = current.key;
        projections = 0;
        observations = 0;
      }
      const base = {
        inputKey: current.ui.inspectionInputKey,
        key: current.key,
        sourceIdentity: process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound',
        appliedGap: current.appliedGap,
        automatic: current.automatic,
      };
      if (!current.active) {
        publish({ ...base, phase: 'not-applicable' });
        return;
      }
      if (!current.ui.foreground) {
        publish({ ...base, phase: 'paused' });
        return;
      }
      const scroll = current.ui.observations.scrollPosition(
        'relay-task-viewport',
      );
      if (!scroll) {
        publish({
          ...base,
          phase: 'pending',
          reason: 'Current scroll position unavailable',
        });
        return;
      }
      if (scroll.x !== 0 || scroll.y !== 0) {
        publish({ ...base, phase: 'not-initial-position', scroll });
        return;
      }
      const sample = current.ui.observations.capture({
        onlyIds: ['relay-task-viewport', 'diagnose-checkout'],
        publish: false,
      });
      observations++;
      const frameBox = sample?.boxes?.['relay-task-viewport'],
        action = sample?.boxes?.['diagnose-checkout'];
      if (frameBox && (frameBox.scrollTop !== 0 || frameBox.scrollLeft !== 0)) {
        publish({
          ...base,
          phase: 'not-initial-position',
          scroll: { x: frameBox.scrollLeft, y: frameBox.scrollTop },
        });
        return;
      }
      if (
        sample?.inspectionInputKey !== current.ui.inspectionInputKey ||
        !sample?.fontLoaded ||
        sample?.measuredRoot?.status !== 'current' ||
        !frameBox ||
        !action ||
        frameBox.width <= 0 ||
        frameBox.height <= 0
      ) {
        publish({
          ...base,
          phase: 'pending',
          reason: 'Waiting for current input, font, root and target rectangles',
        });
        return;
      }
      const analysis = analyzeComposition({
        viewport: { width: frameBox.width, height: frameBox.height },
        rectangles: [
          {
            id: 'action',
            box: {
              x: action.x - frameBox.x,
              y: action.y - frameBox.y,
              width: action.width,
              height: action.height,
            },
          },
        ],
        exposureRules: [
          {
            id: 'initial-action',
            member: 'action',
            minimumVisibleFraction: 1,
            mode: 'constraint',
            source: current.policy.source,
          },
          {
            id: 'preferred-action-end',
            member: 'action',
            latestEndFraction: 0.65,
            mode: 'preference',
            source: current.policy.source,
          },
        ],
        gapProjection: {
          ...current.policy,
          currentGap: current.appliedGap,
          targets: [
            { member: 'action', intervalsBefore: current.intervalsBefore },
          ],
        },
        context: {
          flow: 'column',
          direction: 'ltr',
          source: `${sample.provider}: current task/action host rectangles`,
        },
      });
      const projection = analysis.exposure.gapProjection,
        region = analysis.exposure.regions[0];
      const measuredFit =
        region.visibleFraction === 1 &&
        frameBox.y + frameBox.height - action.y - action.height >=
          current.policy.endClearance;
      const next = {
        ...base,
        provider: sample.provider,
        frame: frameBox,
        action,
        exposure: analysis.exposure,
        measuredFit,
        rendererScope:
          'Current host rectangles and frame clipping; no occlusion or synchronized native-frame assertion',
      };
      if (!current.automatic) {
        publish({ ...next, phase: 'manual' });
        return;
      }
      if (projection.status !== 'proposed') {
        publish({
          ...next,
          phase:
            projection.status === 'infeasible' ? 'needs-scroll' : 'unavailable',
        });
        return;
      }
      if (projection.suggestedGap !== current.appliedGap) {
        const stillAtStart = current.ui.observations.scrollPosition(
          'relay-task-viewport',
        );
        if (!stillAtStart || stillAtStart.x !== 0 || stillAtStart.y !== 0) {
          publish({
            ...base,
            phase: 'not-initial-position',
            scroll: stillAtStart,
          });
          return;
        }
        if (projections >= 4) {
          publish({ ...next, phase: 'iteration-limit' });
          return;
        }
        projections++;
        publish({
          ...next,
          phase: 'proposed',
          pendingGap: projection.suggestedGap,
        });
        setGap(projection.suggestedGap);
        return;
      }
      publish({ ...next, phase: measuredFit ? 'measured-fit' : 'unresolved' });
    };
    const request = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    schedule.current = request;
    const unregister = registerLayout('relay-content-gap', () => {
      const current = latest.current,
        result = readout.current;
      if (current.active && !current.ui.foreground)
        return {
          phase: 'paused',
          inputKey: current.ui.inspectionInputKey,
          appliedGap: current.appliedGap,
        };
      const scroll = current.active
        ? current.ui.observations.scrollPosition('relay-task-viewport')
        : null;
      if (current.active && (!scroll || scroll.x !== 0 || scroll.y !== 0))
        return {
          phase: scroll ? 'not-initial-position' : 'pending',
          inputKey: current.ui.inspectionInputKey,
          appliedGap: current.appliedGap,
          scroll,
        };
      if (result?.key !== current.key)
        return {
          phase: 'pending',
          inputKey: current.ui.inspectionInputKey,
          appliedGap: current.appliedGap,
        };
      const { signature, key: _, ...value } = result;
      return value;
    });
    const unsubscribe = subscribeInspection(request);
    request();
    return () => {
      disposed = true;
      unsubscribe();
      unregister();
      if (frame) cancelAnimationFrame(frame);
      schedule.current = null;
    };
  }, [ui.observations]);
  useLayoutEffect(() => {
    if (
      readout.current?.phase === 'proposed' &&
      readout.current.pendingGap === appliedGap
    )
      readout.current = {
        ...readout.current,
        phase: 'applied-awaiting-measurement',
      };
    schedule.current?.();
  }, [key, appliedGap]);
  return appliedGap;
}
