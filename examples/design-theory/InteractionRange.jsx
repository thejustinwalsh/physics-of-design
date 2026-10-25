import React, { useLayoutEffect, useRef, useEffect } from 'react';
import { getRuntime } from './runtime.js';

/** Let the native thumb track the pointer immediately. Publish only the latest
 * value once per animation frame, and flush the final value before another action. */
export function InteractionRange({ value, onChange, ...props }) {
  const input = useRef(null),
    callback = useRef(onChange),
    pending = useRef(null),
    frame = useRef(null),
    dragging = useRef(false);
  callback.current = onChange;
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (pending.current !== null) {
      const value = pending.current;
      pending.current = null;
      callback.current({ target: { value: String(value) } });
    }
  };
  const finish = () => {
    flush();
    if (dragging.current) {
      dragging.current = false;
      getRuntime().endInteraction();
    }
  };
  useLayoutEffect(() => {
    if (
      !dragging.current &&
      pending.current === null &&
      input.current.value !== String(value)
    )
      input.current.value = String(value);
  }, [value]);
  useEffect(() => {
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (dragging.current) getRuntime().endInteraction();
    };
  }, []);
  return (
    <input
      {...props}
      ref={input}
      type="range"
      defaultValue={value}
      onPointerDown={() => {
        dragging.current = true;
        getRuntime().beginInteraction();
      }}
      onChange={(event) => {
        pending.current = Number(event.currentTarget.value);
        if (frame.current === null)
          frame.current = requestAnimationFrame(flush);
      }}
      onKeyUp={finish}
      onBlur={finish}
    />
  );
}
