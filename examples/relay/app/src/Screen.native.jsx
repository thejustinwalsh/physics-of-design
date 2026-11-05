// Native adapter exception: OS keyboard avoidance owns the outer native inset.
// The application's shared styling and layout remain in RSD inside this frame.
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useLayoutEffect } from 'react';
import { invalidateInspection } from './inspection-events.mjs';
import { ScreenContext } from './ScreenContext';
export default function Screen({ children }) {
  const [frame, setFrame] = useState(null);
  useLayoutEffect(() => {
    invalidateInspection();
  }, [frame]);
  return (
    <ScreenContext.Provider value={frame}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled
        onLayout={(event) => {
          const { x, y, width, height } = event.nativeEvent.layout;
          if (
            [x, y, width, height].every(Number.isFinite) &&
            width > 0 &&
            height > 0
          )
            setFrame((previous) =>
              previous?.status === 'current' &&
              previous?.width === width &&
              previous?.height === height &&
              previous?.x === x &&
              previous?.y === y
                ? previous
                : {
                    x,
                    y,
                    width,
                    height,
                    provider: 'Yoga-root-onLayout',
                    coordinateSpace: 'native-parent-local-dp',
                    status: 'current',
                  },
            );
          else
            setFrame((previous) =>
              previous?.status === 'held'
                ? previous
                : previous
                  ? {
                      ...previous,
                      status: 'held',
                      rejection: 'Non-finite or collapsed Yoga root layout',
                    }
                  : null,
            );
        }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {children}
      </KeyboardAvoidingView>
    </ScreenContext.Provider>
  );
}
