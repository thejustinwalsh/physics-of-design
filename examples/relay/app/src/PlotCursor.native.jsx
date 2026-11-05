import { useContext, useLayoutEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { UI } from './ui';
import { PlotFrameContext } from './PlotFrameContext';
import { plotCursorX } from './design/plot-geometry.mjs';
import { plotAnatomy } from './design/plot-anatomy.mjs';
import plan from './design/cursor-motion.json';
import { registerMotion } from './motion-observations.mjs';
import { subscribeInspection } from './inspection-events.mjs';

export default function PlotCursor({ id, fraction, bucketCount }) {
  const ui = useContext(UI),
    frame = useContext(PlotFrameContext);
  const value = useRef(new Animated.Value(0)).current,
    previousWidth = useRef(0),
    generation = useRef(0);
  const diagnostic = useRef({
    driver: 'react-native/Animated-native-transform',
    nativeDriverRequested: true,
    phase: 'unmeasured',
    starts: 0,
    position: null,
    target: null,
    positionEvidence: 'native-owned; no synchronous JS position claim',
  });
  const width = frame?.width ?? 0,
    target = plotCursorX(fraction, width, bucketCount);
  useLayoutEffect(
    () =>
      registerMotion(id, () => ({
        ...diagnostic.current,
        planIdentity: plan.identity,
        projection: 'decorative overlay clipped to actual plot bounds',
      })),
    [id],
  );
  useLayoutEffect(() => {
    const epoch = ++generation.current;
    diagnostic.current.target = target;
    if (target === null) {
      value.stopAnimation();
      diagnostic.current.phase = 'unsupported-plot-fit';
      return;
    }
    const bounds = frame?.host.current?.getBoundingClientRect?.();
    const visible = Boolean(
      bounds && bounds.y < ui.viewport.height && bounds.y + bounds.height > 0,
    );
    if (
      previousWidth.current !== width ||
      ui.reduced ||
      !ui.foreground ||
      !visible
    ) {
      value.stopAnimation();
      value.setValue(target);
      previousWidth.current = width;
      diagnostic.current.phase = ui.reduced
        ? 'reduced-instant'
        : !visible || !ui.foreground
          ? 'suspended'
          : 'settled';
      return;
    }
    if (!plan.supported || !plan.config.useNativeDriver)
      throw Error('Current native cursor plan is not supported');
    const { velocity, ...retargetConfig } = plan.config;
    const animation = Animated.spring(value, {
      ...(diagnostic.current.starts ? retargetConfig : plan.config),
      toValue: target,
    });
    diagnostic.current.phase = 'playing';
    diagnostic.current.starts++;
    let pending = 0;
    const release = () => {
      unsubscribe();
      if (pending) cancelAnimationFrame(pending);
      pending = 0;
    };
    const unsubscribe = subscribeInspection(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const rect = frame?.host.current?.getBoundingClientRect?.();
        if (
          !rect ||
          rect.y >= ui.viewport.height ||
          rect.y + rect.height <= 0
        ) {
          animation.stop();
          value.setValue(target);
          diagnostic.current.phase = 'suspended';
          release();
        }
      });
    });
    animation.start(({ finished }) => {
      release();
      if (generation.current === epoch)
        diagnostic.current.phase = finished ? 'settled' : 'stopped';
    });
    return () => {
      release();
    };
  }, [target, width, ui.reduced, ui.foreground, ui.viewport.height]);
  useLayoutEffect(
    () => () => {
      generation.current++;
      value.stopAnimation();
    },
    [value],
  );
  if (target === null) return null;
  // These are native adapter styles for a decorative Animated transform. Shared
  // content remains RSD/StyleX; hit targets and chart geometry never move.
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        ref={ui.bind(id)}
        testID={id}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: plotAnatomy.stroke,
          backgroundColor: ui.t.accent,
          transform: [{ translateX: value }],
        }}
      />
    </View>
  );
}
