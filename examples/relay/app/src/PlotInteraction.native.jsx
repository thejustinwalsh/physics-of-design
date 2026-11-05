// Native adapter exception: DOM pointer events are not an Expo Go drag adapter.
// Only horizontal plot gestures claim the responder; vertical scrolling remains native.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { compat, html } from 'react-strict-dom';
import { PanResponder, View } from 'react-native';
import { PlotFrameContext } from './PlotFrameContext';

// Keep the measured parent host attached while child layout effects retarget.
// Compatibility/external callback refs may change without clearing this object.
function NativePlotHost({
  nativeProps,
  host,
  panHandlers,
  setWidth,
  children,
}) {
  const { ref: bridgeRef, ...props } = nativeProps;
  useImperativeHandle(bridgeRef, () => host.current);
  return (
    <View
      {...props}
      {...panHandlers}
      ref={host}
      onLayout={(event) => {
        nativeProps.onLayout?.(event);
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {children}
    </View>
  );
}
export default forwardRef(
  /** @param {import('react').ComponentProps<typeof html.div> & {onSelectFraction: (fraction: number) => void}} input */ function PlotInteraction(
    input,
    ref,
  ) {
    const {
      children,
      onSelectFraction,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style,
      ...props
    } = input;
    const host = useRef(null),
      select = useRef(onSelectFraction);
    const [width, setWidth] = useState(0);
    useImperativeHandle(ref, () => host.current);
    select.current = onSelectFraction;
    const pan = useRef(null);
    if (!pan.current) {
      const choose = (event) => {
        const bounds = host.current?.getBoundingClientRect?.();
        if (bounds?.width > 0)
          select.current(
            Math.max(
              0,
              Math.min(1, (event.nativeEvent.pageX - bounds.x) / bounds.width),
            ),
          );
      };
      pan.current = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Math.abs(gesture.dx) > 4 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: choose,
        onPanResponderMove: choose,
        onPanResponderRelease: choose,
        onPanResponderTerminationRequest: () => false,
      });
    }
    return (
      <PlotFrameContext.Provider value={{ width, host }}>
        <compat.native as="div" {...props} style={style}>
          {(nativeProps) => (
            <NativePlotHost
              nativeProps={nativeProps}
              host={host}
              panHandlers={pan.current.panHandlers}
              setWidth={setWidth}
            >
              {children}
            </NativePlotHost>
          )}
        </compat.native>
      </PlotFrameContext.Provider>
    );
  },
);
