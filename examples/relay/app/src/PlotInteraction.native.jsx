// Native adapter exception: DOM pointer events are not an Expo Go drag adapter.
// Only horizontal plot gestures claim the responder; vertical scrolling remains native.
import { forwardRef, useRef } from 'react';
import { compat, html } from 'react-strict-dom';
import { PanResponder, View } from 'react-native';
export default forwardRef(/** @param {import('react').ComponentProps<typeof html.div> & {onSelectFraction: (fraction: number) => void}} input */ function PlotInteraction(input, ref) {
  const { children, onSelectFraction, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...props } = input;
  const host = useRef(null), select = useRef(onSelectFraction);
  select.current = onSelectFraction;
  const pan = useRef(null);
  if (!pan.current) {
    const choose = (event) => {
      const bounds = host.current?.getBoundingClientRect?.();
      if (bounds?.width > 0)
        select.current(Math.max(0, Math.min(1,
          (event.nativeEvent.pageX - bounds.x) / bounds.width,
        )));
    };
    pan.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: choose,
      onPanResponderMove: choose,
      onPanResponderRelease: choose,
      onPanResponderTerminationRequest: () => false,
    });
  }
  return (
    <compat.native as="div" {...props}>
      {(nativeProps) => (
        <View {...nativeProps} {...pan.current.panHandlers} ref={(node) => {
          host.current = node;
          const provided = nativeProps.ref;
          if (typeof provided === 'function') provided(node);
          else if (provided) provided.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}>{children}</View>
      )}
    </compat.native>
  );
});
