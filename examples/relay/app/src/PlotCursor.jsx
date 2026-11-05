import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { html } from 'react-strict-dom';
import { UI, styles } from './ui';
import plan from './design/cursor-motion.json';
import { createDrivenMotion } from '@design-theory/toolkit/motion';
import { plotCursorX } from './design/plot-geometry.mjs';
import { plotAnatomy } from './design/plot-anatomy.mjs';
import { subscribeFrame } from './clock.mjs';
import { registerMotion } from './motion-observations.mjs';

export default function PlotCursor({ id, fraction, bucketCount }) {
  const ui = useContext(UI),
    ref = useRef(null),
    motion = useRef(null);
  const previousWidth = useRef(0),
    diagnostic = useRef({
      driver: 'browser-shared-analytic-clock',
      phase: 'unmeasured',
      samples: 0,
      position: null,
      velocity: null,
      target: null,
      projection: 'clip scalar presentation to plot bounds',
    });
  const [width, setWidth] = useState(0),
    [visible, setVisible] = useState(false);
  const target = plotCursorX(fraction, width, bucketCount);
  const attach = useCallback(
    (node) => {
      ref.current = node;
      ui.bind(id)(node);
    },
    [ui.bind, id],
  );
  useLayoutEffect(() => {
    const element = ref.current,
      parent = element.parentElement;
    const resize = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    const intersection = new IntersectionObserver((entries) =>
      setVisible(entries[0].isIntersecting),
    );
    resize.observe(parent);
    intersection.observe(parent);
    const unregister = registerMotion(id, () => ({
      ...diagnostic.current,
      source: plan.origin,
      planIdentity: plan.identity,
      choiceIdentity: plan.choiceIdentity,
      spring: {
        mass: plan.config.mass,
        stiffness: plan.config.stiffness,
        damping: plan.config.damping,
      },
    }));
    return () => {
      resize.disconnect();
      intersection.disconnect();
      unregister();
    };
  }, [id]);
  useLayoutEffect(() => {
    const element = ref.current;
    diagnostic.current.target = target;
    if (target === null) {
      diagnostic.current = {
        ...diagnostic.current,
        phase: 'unsupported-plot-fit',
      };
      return;
    }
    const paint = (sample) => {
      const projected = Math.max(
        0,
        Math.min(width - plotAnatomy.stroke, sample.position),
      );
      element.style.transform = `translate3d(${projected}px,0,0)`;
      diagnostic.current = {
        ...diagnostic.current,
        position: sample.position,
        velocity: sample.velocity,
        samples: diagnostic.current.samples + 1,
        projection: 'clip scalar presentation to plot bounds',
      };
    };
    if (
      !motion.current ||
      previousWidth.current !== width ||
      ui.reduced ||
      !ui.foreground ||
      !visible
    ) {
      motion.current = createDrivenMotion({
        spring: {
          mass: plan.config.mass,
          stiffness: plan.config.stiffness,
          damping: plan.config.damping,
        },
        position: target,
        target,
      });
      previousWidth.current = width;
      paint(motion.current.snapshot());
      diagnostic.current.phase = ui.reduced
        ? 'reduced-instant'
        : !visible || !ui.foreground
          ? 'suspended'
          : 'settled';
      return;
    }
    motion.current.retarget(target);
    diagnostic.current.phase = 'playing';
    const stop = subscribeFrame((dt) => {
      if (document.hidden) {
        diagnostic.current.phase = 'suspended';
        return true;
      }
      const sample = motion.current.advance(dt);
      paint(sample);
      const settled =
        Math.abs(sample.position - target) < 0.01 &&
        Math.abs(sample.velocity) < 0.01;
      if (settled) diagnostic.current.phase = 'settled';
      return settled;
    });
    return () => {
      stop();
      diagnostic.current.phase = 'stopped';
    };
  }, [target, width, ui.reduced, ui.foreground, visible]);
  return (
    <html.div
      ref={attach}
      data-testid={id}
      aria-hidden={true}
      style={styles.cursor(0, ui.t.accent, plotAnatomy.stroke)}
    />
  );
}
