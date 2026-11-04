import { compat, css } from 'react-strict-dom';
import { ScrollView, Keyboard, TextInput } from 'react-native';
import { useEffect, useRef } from 'react';
const styles = css.create({
  scroll: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
});
// Strict DOM does not implement a native scroll container. The documented
// compat boundary preserves the shared style contract around a real ScrollView.
const positions = new Map();
export default function Scroll({ children, routeKey = null }) {
  const ref = useRef(null);
  const offset = useRef(0),
    timers = useRef([]);
  const revealFocus = () => {
    const host = ref.current?.getNativeScrollRef?.(),
      input = TextInput.State.currentlyFocusedInput();
    if (!host || !input || !host.contains?.(input)) return;
    const frame = host.getBoundingClientRect?.(),
      field = input.getBoundingClientRect?.();
    if (!frame || !field || frame.height <= 0) return;
    const bottom = field.y + field.height - (frame.y + frame.height - 12),
      top = field.y - (frame.y + 12);
    const delta = bottom > 0 ? bottom : top < 0 ? top : 0;
    if (Math.abs(delta) > 1)
      ref.current.scrollTo({
        y: Math.max(0, offset.current + delta),
        animated: false,
      });
  };
  const scheduleReveal = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(revealFocus, 300),
      setTimeout(revealFocus, 850),
    ];
  };
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', scheduleReveal);
    return () => {
      sub.remove();
      timers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (!routeKey) return;
    const timer = setTimeout(
      () =>
        ref.current?.scrollTo({
          y: positions.get(routeKey) ?? 0,
          animated: false,
        }),
      0,
    );
    return () => clearTimeout(timer);
  }, [routeKey]);
  return (
    <compat.native as="div" style={styles.scroll}>
      {(nativeProps) => (
        <ScrollView
          {...nativeProps}
          ref={(node) => {
            ref.current = node;
            const provided = nativeProps.ref;
            if (typeof provided === 'function') provided(node);
            else if (provided) provided.current = node;
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          keyboardDismissMode="interactive"
          onLayout={(event) => {
            nativeProps.onLayout?.(event);
            scheduleReveal();
          }}
          onFocus={scheduleReveal}
          onScroll={(e) => {
            offset.current = e.nativeEvent.contentOffset.y;
            if (routeKey)
              positions.set(routeKey, e.nativeEvent.contentOffset.y);
          }}
          scrollEventThrottle={100}
        >
          {children}
        </ScrollView>
      )}
    </compat.native>
  );
}
