import { createObservationScheduler } from './observation-scheduler';
import {
  nativeLineProbes,
  nativeTextLayoutIdentity,
  acceptNativeLineProbe,
  type NativeContentAdvance,
} from '../src/native-text-diagnostics';
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
  useState,
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
  StyleSheet,
  useWindowDimensions,
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
  textLayoutIdentity?: string;
  pendingContentProbes?: number;
};
const Context = createContext<{
  register: (id: string, value: NodeRecord) => void;
  remove: (id: string) => void;
} | null>(null);
const ClipContext = createContext<string | null>(null);
const InsideObservedText = createContext(false);
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
    current = useRef(snapshot),
    revision = useRef(0),
    alive = useRef(true);
  if (current.current !== snapshot) revision.current++;
  current.current = snapshot;
  const api = useMemo(() => {
    function schedule() {
      revision.current++;
      scheduler.schedule();
    }
    const scheduler = createObservationScheduler(async () => {
      const capturedRevision = revision.current;
      const records = [...nodes.current].map(
        ([id, record]) => [id, { ...record }] as const,
      );
      if (records.some(([, record]) => (record.pendingContentProbes ?? 0) > 0))
        return;
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        await fetch(
          process.env.EXPO_PUBLIC_DESIGN_APP_OBSERVER ??
            'http://127.0.0.1:4321/observations',
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${process.env.EXPO_PUBLIC_DESIGN_TOKEN ?? 'local-spike'}`,
            },
            body: JSON.stringify(payload),
          },
        );
      } catch {
        /* Optional local proof collector; app remains usable headlessly/offline. */
      } finally {
        clearTimeout(timeout);
      }
    });
    return {
      stop: scheduler.stop,
      start: scheduler.start,
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
    api.start();
    return () => {
      alive.current = false;
      revision.current++;
      api.stop();
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
    id = useRef(`text-${++nextId}`).current;
  const nested = useContext(InsideObservedText);
  const { fontScale } = useWindowDimensions();
  const [layout, setLayout] = useState<{
    lines: TextLayoutEvent['nativeEvent']['lines'];
    styleIdentity: string;
    text: string;
  }>({ lines: [], styleIdentity: '', text: '' });
  const [width, setWidth] = useState(0);
  const [probeEvidence, setProbeEvidence] = useState<
    Record<string, NativeContentAdvance | null>
  >({});
  const text = childText(props.children);
  const flatStyle = StyleSheet.flatten(props.style) ?? {};
  const styleIdentity = JSON.stringify({
    // Paint-only changes need not produce onTextLayout; bind the shaping inputs.
    style: Object.fromEntries(
      [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'fontVariant',
        'letterSpacing',
        'lineHeight',
        'includeFontPadding',
        'textTransform',
        'textAlign',
        'writingDirection',
      ].map((key) => [key, (flatStyle as Record<string, unknown>)[key]]),
    ),
    fontScale: props.allowFontScaling === false ? 1 : fontScale,
    allowFontScaling: props.allowFontScaling,
    maxFontSizeMultiplier: props.maxFontSizeMultiplier,
    dynamicTypeRamp: props.dynamicTypeRamp,
    textBreakStrategy: props.textBreakStrategy,
    android_hyphenationFrequency: props.android_hyphenationFrequency,
  });
  const knownStyle =
    !nested &&
    typeof flatStyle.fontFamily === 'string' &&
    typeof flatStyle.fontSize === 'number' &&
    Number.isFinite(flatStyle.fontSize) &&
    !props.adjustsFontSizeToFit &&
    !props.numberOfLines &&
    flatStyle.writingDirection !== 'rtl' &&
    (!flatStyle.textAlign || ['left', 'auto'].includes(flatStyle.textAlign));
  const requests = nativeLineProbes({
    platform: Platform.OS,
    plain: typeof props.children === 'string',
    knownStyle,
    text,
    styleIdentity,
    measuredStyleIdentity: layout.styleIdentity,
    width,
    lines: layout.lines,
  });
  const layoutIdentity = nativeTextLayoutIdentity(
    text,
    styleIdentity,
    layout.lines,
    width,
  );
  const lines = layout.lines.map((line, index) => {
    const request = requests.find((request) => request.lineIndex === index);
    const evidence = request && probeEvidence[request.key];
    return evidence ? { ...line, contentAdvanceEvidence: evidence } : line;
  });
  const pending = requests.filter(
    (request) => !(request.key in probeEvidence),
  ).length;
  const requestIdentity = JSON.stringify(
    requests.map((request) => request.key),
  );
  useEffect(() => {
    if (!requests.length) return;
    const timer = setTimeout(
      () =>
        setProbeEvidence((previous) => {
          const next = { ...previous };
          for (const request of requests)
            if (!(request.key in next)) next[request.key] = null;
          return next;
        }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [requestIdentity]);
  const layoutPending =
    Platform.OS === 'android' &&
    knownStyle &&
    text !== '' &&
    (layout.text !== text || layout.styleIdentity !== styleIdentity);
  const register = () =>
    context?.register(id, {
      node: ref.current,
      name: text,
      kind: 'text',
      clipId,
      text,
      lines,
      textLayoutIdentity: layoutIdentity,
      pendingContentProbes: pending + Number(layoutPending),
      allowsScaling: props.allowFontScaling !== false,
      cap: props.maxFontSizeMultiplier ?? null,
    });
  useEffect(() => () => context?.remove(id), [context, id]);
  const evidenceIdentity = JSON.stringify(lines);
  useEffect(() => {
    register();
  }, [
    context,
    id,
    text,
    styleIdentity,
    layoutIdentity,
    evidenceIdentity,
    pending,
    layoutPending,
  ]);
  return (
    <>
      <NativeText
        {...props}
        ref={ref}
        onLayout={(event) => {
          props.onLayout?.(event);
          setWidth(event.nativeEvent.layout.width);
          register();
        }}
        onTextLayout={(event) => {
          const next = { lines: event.nativeEvent.lines, styleIdentity, text };
          setLayout((previous) =>
            JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
          );
          props.onTextLayout?.(event);
          register();
        }}
      >
        <InsideObservedText.Provider value={true}>
          {props.children}
        </InsideObservedText.Provider>
      </NativeText>
      {requests.map((request) => (
        <NativeText
          key={request.key}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          allowFontScaling={props.allowFontScaling}
          maxFontSizeMultiplier={props.maxFontSizeMultiplier}
          dynamicTypeRamp={props.dynamicTypeRamp}
          textBreakStrategy={props.textBreakStrategy}
          android_hyphenationFrequency={props.android_hyphenationFrequency}
          numberOfLines={0}
          style={[
            flatStyle,
            {
              position: 'absolute',
              left: -100000,
              top: 0,
              opacity: 0,
              width: request.width,
              height: undefined,
              minWidth: 0,
              maxWidth: undefined,
              minHeight: 0,
              maxHeight: undefined,
              margin: 0,
              padding: 0,
              borderWidth: 0,
              flex: 0,
            },
          ]}
          onTextLayout={(event) => {
            const evidence = acceptNativeLineProbe(
              request,
              event.nativeEvent.lines,
            );
            setProbeEvidence((previous) =>
              JSON.stringify(previous[request.key]) ===
                JSON.stringify(evidence) && request.key in previous
                ? previous
                : { ...previous, [request.key]: evidence },
            );
          }}
        >
          {request.text}
        </NativeText>
      ))}
    </>
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
