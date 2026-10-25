import React, { useEffect, useRef } from 'react';
import { getRuntime } from './runtime.js';

/** A bounded, decorative progress cue. Content and controls never inherit this transform. */
export function RegistrationBand() {
  const host = useRef(null),
    line = useRef(null),
    phase = useRef(null);
  useEffect(() => {
    const runtime = getRuntime();
    let top = 0,
      height = 1,
      visible = false;
    const measure = () => {
      const rect = host.current.getBoundingClientRect();
      top = rect.top + window.scrollY;
      height = innerHeight + rect.height;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(document.body);
    measure();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) measure();
    });
    observer.observe(host.current);
    const unsubscribe = runtime.subscribe((time, dt, reduced) => {
      if (!visible) return;
      const progress = Math.max(
        0,
        Math.min(1, (runtime.stats.scroll + innerHeight - top) / height),
      );
      line.current.style.transform = `translate3d(${reduced ? 0 : (progress - 0.5) * -70}px,0,0)`;
      phase.current.style.transform = `scaleX(${reduced ? 1 : progress})`;
      host.current.dataset.phase = progress.toFixed(3);
    });
    return () => {
      unsubscribe();
      resize.disconnect();
      observer.disconnect();
    };
  }, []);
  return (
    <div
      ref={host}
      data-registration-band
      style={{
        overflow: 'hidden',
        background: 'var(--signal)',
        color: 'var(--ink)',
        padding: '28px 0 20px',
        borderBlock: '1px solid var(--ink)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'monospace',
          fontSize: 10,
          paddingInline: 22,
          marginBottom: 12,
        }}
      >
        <span>ONE INPUT. CONNECTED CONSEQUENCES.</span>
        <span>↓</span>
      </div>
      <div
        ref={line}
        aria-hidden="true"
        style={{
          fontSize: 'clamp(42px,7.6vw,108px)',
          fontWeight: 900,
          letterSpacing: '-.065em',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          paddingLeft: 28,
          willChange: 'transform',
        }}
      >
        PULL / PUSH / QUESTION / REPEAT /
      </div>
      <div
        ref={phase}
        style={{
          height: 3,
          background: 'currentColor',
          marginTop: 18,
          transformOrigin: 'left',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
