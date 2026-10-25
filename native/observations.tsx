import {
  clipObservationFrames,
  type ClipObservation,
} from './observation-clipping';
import { captureObservationBatch } from './observation-batch';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  Text as NativeText,
  Pressable as NativePressable,
  TextInput as NativeTextInput,
  Platform,
  Keyboard,
  ScrollView as NativeScrollView,
  type LayoutRectangle,
  type TextLayoutEvent,
} from 'react-native';

type NativeNode = React.ComponentRef<typeof View>;
type NodeRecord = {
  node: NativeNode | null;
  name: string;
  kind: 'target' | 'text' | 'media' | 'clip';
  clipId?: string | null;
  role?: string;
  text?: string;
  lines?: TextLayoutEvent['nativeEvent']['lines'];
  allowsScaling?: boolean;
  cap?: number | null;
};
const Context = createContext<{
  register: (id: string, value: NodeRecord) => void;
  remove: (id: string) => void;
} | null>(null);
const ClipContext = createContext<string | null>(null);
let nextId = 0;
const signals = new Set<() => void>();
export function requestNativeObservation() {
  for (const schedule of signals) schedule();
}
function childText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : React.isValidElement<{ children?: React.ReactNode }>(child)
          ? childText(child.props.children)
          : '',
    )
    .join('');
}
export function NativeObservationProvider({
  snapshot,
  children,
}: {
  snapshot: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const nodes = useRef(new Map<string, NodeRecord>()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    current = useRef(snapshot),
    revision = useRef(0),
    alive = useRef(true);
  if (current.current !== snapshot) revision.current++;
  current.current = snapshot;
  const api = useMemo(() => {
    function schedule() {
      revision.current++;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const capturedRevision = revision.current;
        const records = [...nodes.current].map(
          ([id, record]) => [id, { ...record }] as const,
        );
        const batch = await captureObservationBatch({
          records,
          snapshot: {
            ...current.current,
            keyboard: {
              visible: Keyboard.isVisible(),
              screenCoordinates: Keyboard.metrics() ?? null,
            },
          },
          revision: capturedRevision,
          getRevision: () => (alive.current ? revision.current : -1),
          measure: ([id, record], done) => {
            if (!record.node) return done(null);
            record.node.measureInWindow((x, y, width, height) =>
              done({
                id,
                ...record,
                node: undefined,
                box: { x, y, width, height },
              }),
            );
          },
        });
        if (!batch) {
          if (alive.current) schedule();
          return;
        }
        if (batch.incomplete) return; // Partial diagnostics must never become a passing product proof.
        let observations;
        try {
          observations = clipObservationFrames(
            batch.observations as (ClipObservation & Record<string, unknown>)[],
          );
        } catch {
          return;
        }
        const payload = {
          version: 1,
          capturedAt: new Date().toISOString(),
          engine: 'react-native/Text+Yoga',
          platform: Platform.OS,
          ...batch,
          observations,
          scope:
            'Actual native view frames and Text.onTextLayout observations from the product. Declared props are identified separately. Screenshots and task review remain required.',
        };
        try {
          await fetch(
            process.env.EXPO_PUBLIC_DESIGN_APP_OBSERVER ??
              'http://127.0.0.1:4321/observations',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${process.env.EXPO_PUBLIC_DESIGN_TOKEN ?? 'local-spike'}`,
              },
              body: JSON.stringify(payload),
            },
          );
        } catch {
          /* Optional local proof collector; app remains usable headlessly/offline. */
        }
      }, 500);
    }
    return {
      register(id: string, value: NodeRecord) {
        nodes.current.set(id, value);
        schedule();
      },
      remove(id: string) {
        nodes.current.delete(id);
        schedule();
      },
      schedule,
    };
  }, []);
  useEffect(() => {
    api.schedule();
  }, [snapshot, api]);
  useEffect(() => {
    const subscriptions = ['keyboardDidShow', 'keyboardDidHide'].map((event) =>
      Keyboard.addListener(
        event as 'keyboardDidShow' | 'keyboardDidHide',
        api.schedule,
      ),
    );
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [api]);
  useEffect(() => {
    signals.add(api.schedule);
    return () => {
      signals.delete(api.schedule);
    };
  }, [api]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      revision.current++;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return <Context.Provider value={api}>{children}</Context.Provider>;
}
export function ObservedPressable(
  props: React.ComponentProps<typeof NativePressable>,
) {
  const context = useContext(Context),
    clipId = useContext(ClipContext),
    ref = useRef<NativeNode | null>(null),
    id = useRef(`control-${++nextId}`).current;
  const name =
    props.accessibilityLabel ?? childText(props.children as React.ReactNode);
  useEffect(() => {
    context?.register(id, { node: ref.current, name, kind: 'target', clipId });
  }, [context, id, name]);
  useEffect(() => () => context?.remove(id), [context, id]);
  return (
    <NativePressable
      {...props}
      ref={ref}
      onLayout={(event) => {
        props.onLayout?.(event);
        context?.register(id, {
          node: ref.current,
          name,
          kind: 'target',
          clipId,
        });
      }}
    />
  );
}
export function ObservedText(props: React.ComponentProps<typeof NativeText>) {
  const context = useContext(Context),
    clipId = useContext(ClipContext),
    ref = useRef<NativeNode | null>(null),
    id = useRef(`text-${++nextId}`).current,
    raw = useRef<TextLayoutEvent['nativeEvent']['lines']>([]);
  const text = childText(props.children);
  const register = () =>
    context?.register(id, {
      node: ref.current,
      name: text,
      kind: 'text',
      clipId,
      text,
      lines: raw.current,
      allowsScaling: props.allowFontScaling !== false,
      cap: props.maxFontSizeMultiplier ?? null,
    });
  useEffect(() => () => context?.remove(id), [context, id]);
  return (
    <NativeText
      {...props}
      ref={ref}
      onLayout={(event) => {
        props.onLayout?.(event);
        register();
      }}
      onTextLayout={(event) => {
        raw.current = event.nativeEvent.lines;
        props.onTextLayout?.(event);
        register();
      }}
    />
  );
}

export function ObservedMedia(
  props: React.ComponentProps<typeof View> & {
    observationName: string;
    observationRole: string;
  },
) {
  const context = useContext(Context),
    clipId = useContext(ClipContext),
    ref = useRef<NativeNode | null>(null),
    id = useRef(`media-${++nextId}`).current;
  const { observationName, observationRole, ...viewProps } = props;
  useEffect(() => () => context?.remove(id), [context, id]);
  return (
    <View
      {...viewProps}
      collapsable={false}
      ref={ref}
      onLayout={(event) => {
        props.onLayout?.(event);
        context?.register(id, {
          node: ref.current,
          name: observationName,
          kind: 'media',
          clipId,
          role: observationRole,
        });
      }}
    />
  );
}

export function ObservedTextInput(
  props: React.ComponentProps<typeof NativeTextInput>,
) {
  const context = useContext(Context),
    clipId = useContext(ClipContext),
    ref = useRef<React.ComponentRef<typeof NativeTextInput> | null>(null),
    id = useRef(`input-${++nextId}`).current;
  useEffect(() => () => context?.remove(id), [context, id]);
  return (
    <NativeTextInput
      {...props}
      ref={ref}
      onLayout={(event) => {
        props.onLayout?.(event);
        context?.register(id, {
          node: ref.current,
          name: props.accessibilityLabel ?? props.placeholder ?? '',
          kind: 'target',
          clipId,
        });
      }}
    />
  );
}

export const ObservedScrollView = forwardRef<
  React.ComponentRef<typeof NativeScrollView>,
  React.ComponentProps<typeof NativeScrollView>
>(function ObservedScrollView(props, forwardedRef) {
  const context = useContext(Context),
    clipId = useContext(ClipContext),
    ref = useRef<React.ComponentRef<typeof NativeScrollView>>(null),
    id = useRef(`clip-${++nextId}`).current;
  useImperativeHandle(forwardedRef, () => ref.current!);
  useEffect(() => () => context?.remove(id), [context, id]);
  return (
    <NativeScrollView
      {...props}
      ref={ref}
      scrollEventThrottle={props.scrollEventThrottle ?? 100}
      onScroll={(event) => {
        props.onScroll?.(event);
        requestNativeObservation();
      }}
      onLayout={(event) => {
        props.onLayout?.(event);
        context?.register(id, {
          node: ref.current,
          name: 'scroll viewport',
          kind: 'clip',
          clipId,
        });
      }}
    >
      <ClipContext.Provider value={id}>{props.children}</ClipContext.Provider>
    </NativeScrollView>
  );
});
