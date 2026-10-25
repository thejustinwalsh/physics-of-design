import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Modal,
  findNodeHandle,
  StatusBar,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import {
  NativeObservationProvider,
  ObservedText as Text,
  ObservedPressable as Pressable,
  ObservedScrollView as ScrollView,
  requestNativeObservation,
} from './observations';
import {
  resolveDesignRuntime,
  type PortableDesign,
} from '../src/decision-runtime';
import { emitMotion } from '../src/motion';
import { evaluateExpression } from '../src/math-expression';
import policy from '../examples/vela/design.generated.json';
import { getCoordinateSpace } from './coordinates';
import {
  advanceMeasuredNativeGeometry,
  type MeasuredNativeGeometry,
  type MeasuredNativeState,
} from '../src/native-root-geometry';
import { createRestoreGate } from '../src/restore-gate';
import {
  readStored,
  INITIAL_PREFERENCES,
  TOTAL_SECONDS,
  type Entry,
  type Preferences,
} from './vela-storage';
import { glueAccentPunctuation } from '../src/typography-flow';

export type VelaScreen =
  'today' | 'detail' | 'active' | 'complete' | 'insights' | 'profile';
type Event =
  | 'OPEN_SESSION'
  | 'START'
  | 'BACK'
  | 'FINISH'
  | 'DISCARD'
  | 'DONE'
  | 'TODAY'
  | 'INSIGHTS'
  | 'PROFILE';
const STORAGE = 'vela-local-v1';
const PHASES = [
  { name: 'Find your rhythm', minutes: 4, note: 'Start at your own pace.' },
  { name: 'Steady build', minutes: 12, note: 'Choose a pace you can sustain.' },
  { name: 'Downshift', minutes: 6, note: 'Make room to ease back.' },
];
const SAMPLE_WEEK = [18, 0, 24, 12, 0, 22, 0];
const formatTime = (seconds: number) =>
  seconds > 0 && seconds < 1
    ? 'Less than 1 second'
    : `${Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')}`;

function Icon({
  name,
  color,
  size = 24,
}: {
  name:
    | 'arrow'
    | 'back'
    | 'today'
    | 'insights'
    | 'profile'
    | 'check'
    | 'play'
    | 'pause';
  color: string;
  size?: number;
}) {
  const paths = {
    arrow: 'M4 12h15M13 5l7 7-7 7',
    back: 'M20 12H5M11 5l-7 7 7 7',
    today: 'M5 5l7 14 7-14M5 5h14',
    insights: 'M4 19V12M12 19V5M20 19V9',
    profile: 'M4 21c0-6 16-6 16 0M16 7a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
    check: 'M5 12l5 5L20 6',
    play: 'M8 4l12 8-12 8z',
    pause: 'M8 4v16M16 4v16',
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name]} />
    </Svg>
  );
}

/** Original decorative interval trace. This is a session illustration, not a measured physiological signal. */
function Trace({ color, height }: { color: string; height: number }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width="100%"
        height={height}
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
      >
        <Path
          d="M0 90L24 90 39 62 57 62 73 77 91 77 111 34 131 34 151 57 171 57 193 9 213 9 235 42 253 42 272 76 300 76"
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line
          x1={0}
          y1={99}
          x2={300}
          y2={99}
          stroke={color}
          strokeOpacity={0.25}
        />
      </Svg>
    </View>
  );
}

const VelaUI = createContext<{
  primary: ViewStyle;
  c: typeof policy.colors;
  type: (fontSize: number, heavy?: boolean, color?: string) => TextStyle;
  size: (factor?: number) => number;
  onAccent: string;
  headingSize: number;
  timerSize: number;
  timerStacked: boolean;
  gap: number;
  send: (event: Event) => boolean;
} | null>(null);

function Action({
  text,
  event,
  secondary = false,
  onPress,
}: {
  text: string;
  event?: Event;
  secondary?: boolean;
  onPress?: () => void;
}) {
  const { primary, c, type, size, onAccent, send } = useContext(VelaUI)!;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={
        onPress ??
        (() => {
          if (event) send(event);
        })
      }
      style={({ pressed }) => [
        primary,
        secondary
          ? {
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.muted,
            }
          : {},
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text
        style={[type(size(), true, secondary ? c.ink : onAccent), { flex: 1 }]}
      >
        {text}
      </Text>
      <Icon name="arrow" color={secondary ? c.ink : onAccent} />
    </Pressable>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  const { type, headingSize } = useContext(VelaUI)!;
  return (
    <View>
      <Text accessibilityRole="header" style={type(headingSize, true)}>
        {children}
      </Text>
    </View>
  );
}

function Duration({
  seconds,
  color,
  description,
}: {
  seconds: number;
  color: string;
  description: string;
}) {
  const { type, size, timerSize, timerStacked, gap } = useContext(VelaUI)!;
  const parts = formatTime(seconds).split(':');
  const accessibilityLabel = `${Math.floor(seconds / 60)} minutes and ${Number((seconds % 60).toFixed(1))} seconds ${description}`;
  const numberStyle: TextStyle = {
    ...type(timerSize, true, color),
    fontVariant: ['tabular-nums'],
  };
  if (seconds > 0 && seconds < 1)
    return (
      <Text
        accessibilityLabel={`Less than 1 second ${description}`}
        style={type(size(), true, color)}
      >
        Less than 1 second
      </Text>
    );
  if (!timerStacked)
    return (
      <Text accessibilityLabel={accessibilityLabel} style={numberStyle}>
        {formatTime(seconds)}
      </Text>
    );
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={{ gap }}>
      {parts.map((part, index) => (
        <View
          key={index}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap,
          }}
        >
          <Text accessible={false} style={numberStyle}>
            {part}
          </Text>
          <Text accessible={false} style={type(size(0.8), true, color)}>
            {index === 0 ? 'MIN' : 'SEC'}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function VelaApp({
  initialScreen = 'today',
  proofId = '',
}: {
  initialScreen?: VelaScreen;
  proofId?: string;
}) {
  return (
    <SafeAreaProvider>
      <ViewportBoundary initialScreen={initialScreen} proofId={proofId} />
    </SafeAreaProvider>
  );
}

function ViewportBoundary({
  initialScreen,
  proofId,
}: {
  initialScreen: VelaScreen;
  proofId: string;
}) {
  const nominalWindow = useWindowDimensions(),
    physicalInsets = useSafeAreaInsets();
  const root = useRef<React.ComponentRef<typeof View> | null>(null);
  const [measured, setMeasured] = useState<MeasuredNativeState | null>(null);
  const generation = useRef(0),
    alive = useRef(true);
  function measureRoot() {
    const requested = ++generation.current;
    setMeasured((previous) =>
      previous ? { ...previous, status: 'held' } : null,
    );
    const nominal = { ...nominalWindow },
      insets = { ...physicalInsets };
    const baseCoordinateSpace = getCoordinateSpace();
    root.current?.measureInWindow((x, y, width, height) => {
      if (!alive.current || requested !== generation.current) return;
      setMeasured((previous) =>
        advanceMeasuredNativeGeometry(previous, {
          nominalWindow: nominal,
          insets,
          rootFrame: { x, y, width, height },
          baseCoordinateSpace,
        }),
      );
    });
  }
  useEffect(() => {
    alive.current = true;
    const frame = requestAnimationFrame(measureRoot);
    return () => {
      cancelAnimationFrame(frame);
      generation.current++;
    };
  }, [
    nominalWindow.width,
    nominalWindow.height,
    nominalWindow.fontScale,
    nominalWindow.scale,
    physicalInsets.top,
    physicalInsets.right,
    physicalInsets.bottom,
    physicalInsets.left,
  ]);
  useEffect(
    () => () => {
      alive.current = false;
      generation.current++;
    },
    [],
  );
  return (
    <View
      ref={root}
      collapsable={false}
      onLayout={measureRoot}
      style={{ flex: 1, backgroundColor: policy.colors.canvas }}
    >
      {measured?.accepted ? (
        <Vela
          initialScreen={initialScreen}
          proofId={proofId}
          geometry={measured.accepted}
          viewportGuard={{
            status: measured.status,
            rejectedCount: measured.rejectedCount,
            lastRejection: measured.lastRejection,
          }}
        />
      ) : (
        <View style={{ flex: 1, padding: 20 }}>
          <Text style={{ color: policy.colors.ink }}>Preparing the view…</Text>
        </View>
      )}
    </View>
  );
}

function Vela({
  initialScreen,
  proofId,
  geometry,
  viewportGuard,
}: {
  initialScreen: VelaScreen;
  proofId: string;
  geometry: MeasuredNativeGeometry;
  viewportGuard: Omit<MeasuredNativeState, 'accepted'>;
}) {
  const { window, coordinateSpace, windowSafeArea } = geometry;
  const insets = windowSafeArea;
  const [loaded] = useFonts({
    VelaRegular: require('../assets/fonts/Lato-Regular.ttf'),
    VelaHeavy: require('../assets/fonts/Lato-Black.ttf'),
  });
  const [screen, setScreen] = useState<VelaScreen>(initialScreen),
    [preferences, setPreferences] = useState<Preferences>(INITIAL_PREFERENCES);
  const [entries, setEntries] = useState<Entry[]>([]),
    [hydrated, setHydrated] = useState(false),
    [storageError, setStorageError] = useState('');
  const [sessionOutcome, setSessionOutcome] = useState<
    'idle' | 'discarded-empty' | 'logged'
  >('idle');
  const [restoreState, setRestoreState] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const storage = useMemo(
    () =>
      createRestoreGate({
        read: () => AsyncStorage.getItem(STORAGE),
        write: (raw: string) => AsyncStorage.setItem(STORAGE, raw),
        decode: (raw: string | null) =>
          raw === null
            ? {
                preferences: { ...INITIAL_PREFERENCES },
                entries: [] as Entry[],
              }
            : readStored(raw),
      }),
    [],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuFocus = useRef<number | null>(null),
    closeFocus = useRef<number | null>(null);
  const [persistence, setPersistence] = useState<
    'pending' | 'saved' | 'failed'
  >('pending');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [systemReduced, setSystemReduced] = useState(true); // Conservative until the system preference resolves.
  const [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false),
    [motionPhase, setMotionPhase] = useState<'entering' | 'held'>('held');
  const elapsedRef = useRef(0),
    startedAt = useRef(0),
    accumulated = useRef(0),
    finishing = useRef(false);
  const pageOffset = useRef(new Animated.Value(0)).current,
    opacity = useRef(new Animated.Value(1)).current;
  const reducedMotion = systemReduced || preferences.motion === 'reduced';
  const c = policy.colors;
  const accent = c[preferences.accent],
    onAccent = preferences.accent === 'lime' ? c['on-lime'] : c['on-cobalt'];
  const designViewport = {
    width: window.width - insets.left - insets.right,
    height: window.height - insets.top - insets.bottom,
    textScale: window.fontScale,
    reducedMotion: Number(reducedMotion),
  };
  const isDestination = ['today', 'insights', 'profile'].includes(screen);
  const resolved = useMemo(
    () =>
      resolveDesignRuntime(policy.handoff as PortableDesign, designViewport),
    [
      designViewport.width,
      designViewport.height,
      window.fontScale,
      reducedMotion,
    ],
  );
  const useRail = resolved.values.navRail === 1;
  const railWidth = useRail ? resolved.values.navRailWidth! : 0;
  const region = resolved.regions[screen]!.screen!;
  const p: Record<string, number> = {};
  for (const [key, value] of Object.entries(
    region as Record<string, unknown>,
  )) {
    if (typeof value === 'number') p[key] = value;
  }
  const n = (key: string) => p[key]!;
  const copyMode = n('heroActionFirst') === 1 ? 'compact' : 'default';
  const copy = (key: keyof typeof policy.handoff.machine.content) =>
    policy.handoff.machine.content[key][copyMode];
  useEffect(() => {
    if (useRail || n('navCompact') !== 1) setMenuOpen(false);
  }, [useRail, p.navCompact]);
  const spring = resolved.motions.page!;
  const entryPlan = useMemo(
    () =>
      emitMotion({
        motion: {
          ...policy.motion.motion,
          spring: {
            mass: Number(spring.mass),
            stiffness: Number(spring.stiffness),
            damping: Number(spring.damping),
          },
          coordinate: {
            unit: 'dp',
            from: n('pageDistance'),
            to: 0,
            initialVelocity: 0,
          },
        },
        channel: 'translateY',
        platform: 'react-native',
        reducedMotion,
      }),
    [
      spring.mass,
      spring.stiffness,
      spring.damping,
      p.pageDistance,
      reducedMotion,
    ],
  );
  const fadePlan = useMemo(
    () =>
      emitMotion({
        motion: { coordinate: { unit: 'opacity', from: 0, to: 1 } },
        channel: 'opacity',
        platform: 'react-native',
        reducedMotion: true,
        reducedMotionPolicy: 'opacity-fade',
      }),
    [],
  );
  const size = (factor = 1) => n('bodySize') * factor;
  const type = (fontSize: number, heavy = false, color = c.ink): TextStyle => ({
    color,
    fontSize,
    fontFamily: heavy ? 'VelaHeavy' : 'VelaRegular',
    lineHeight: fontSize * n(heavy ? 'titleLeading' : 'bodyLeading'),
    ...(heavy ? { letterSpacing: n('tracking') * fontSize } : {}),
  });
  const label: TextStyle = {
    ...type(size(0.63), true, c.muted),
    letterSpacing: size(0.063),
  };
  const card: ViewStyle = {
    borderRadius: n('radius'),
    padding: n('pageGutter'),
    gap: n('gap'),
    backgroundColor: c.surface,
  };
  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n('gap'),
    flexWrap: 'wrap',
  };
  const primary: ViewStyle = {
    minHeight: Math.max(52, size() * 2.7),
    paddingHorizontal: n('pageGutter'),
    paddingVertical: n('gap') * 0.7,
    borderRadius: n('radius') * 0.65,
    backgroundColor: accent,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: n('gap'),
  };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setSystemReduced(v);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduced,
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    let current = true;
    setRestoreState('loading');
    setHydrated(false);
    storage
      .restore()
      .then((saved) => {
        if (!current) return;
        setPreferences(saved.preferences);
        setEntries(saved.entries);
        setStorageError('');
        setRestoreState('ready');
        setHydrated(true);
      })
      .catch(() => {
        if (!current) return;
        setRestoreState('failed');
        setStorageError(
          'Your journal could not be restored. Existing local data has not been replaced.',
        );
      });
    return () => {
      current = false;
    };
  }, [storage, restoreAttempt]);
  useEffect(() => {
    if (!hydrated || restoreState !== 'ready') return;
    let current = true;
    setPersistence('pending');
    storage
      .save({ preferences, entries })
      .then(() => {
        if (current) {
          setPersistence('saved');
          setStorageError('');
        }
      })
      .catch(() => {
        if (current) {
          setPersistence('failed');
          setStorageError(
            'This change could not be saved on your device. Keep Vela open and retry.',
          );
        }
      });
    return () => {
      current = false;
    };
  }, [preferences, entries, hydrated, saveAttempt, restoreState, storage]);
  useEffect(() => {
    if (!loaded || !hydrated) return;
    pageOffset.stopAnimation();
    opacity.stopAnimation();
    setMotionPhase('entering');
    const finished = () => {
      setMotionPhase('held');
      requestNativeObservation();
    };
    if (reducedMotion) {
      pageOffset.setValue(0);
      opacity.setValue(0);
      const duration =
        fadePlan.plan?.kind === 'react-native-timing'
          ? fadePlan.plan.config.duration
          : 0;
      const animation = Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animation.start(({ finished: done }) => {
        if (done) finished();
      });
      return () => animation.stop();
    }
    opacity.setValue(1);
    if (entryPlan.plan?.kind !== 'react-native-spring') {
      pageOffset.setValue(0);
      finished();
      return;
    }
    pageOffset.setValue(entryPlan.plan.initialValue);
    const animation = Animated.spring(pageOffset, entryPlan.plan.config);
    animation.start(({ finished: done }) => {
      if (done) finished();
    });
    return () => animation.stop();
  }, [
    screen,
    loaded,
    hydrated,
    reducedMotion,
    entryPlan,
    fadePlan,
    pageOffset,
    opacity,
  ]);

  function restoreMenuFocus() {
    requestAnimationFrame(() => {
      if (menuFocus.current !== null)
        AccessibilityInfo.setAccessibilityFocus(menuFocus.current);
    });
  }
  function closeMenu() {
    setMenuOpen(false);
    restoreMenuFocus();
  }
  function currentElapsed() {
    return running
      ? Math.min(
          TOTAL_SECONDS,
          Math.max(
            0,
            accumulated.current +
              (performance.now() - startedAt.current) / 1000,
          ),
        )
      : elapsedRef.current;
  }
  function send(event: Event, origin: VelaScreen = screen) {
    const proposedElapsed =
      origin === 'active' ? currentElapsed() : elapsedRef.current;
    const discardEmpty =
      event === 'FINISH' && origin === 'active' && proposedElapsed === 0;
    if (discardEmpty) event = 'DISCARD';
    const transition = (policy.handoff as PortableDesign).machine.states
      .find((s) => s.id === origin)
      ?.on.find((t) => t.event === event);
    if (!transition) return false;
    if (
      transition.when !== undefined &&
      evaluateExpression(transition.when, resolved.values) === 0
    )
      return false;
    if (origin === 'active') {
      elapsedRef.current = proposedElapsed;
      setElapsed(proposedElapsed);
      accumulated.current = proposedElapsed;
      setRunning(false);
    }
    if (discardEmpty) setSessionOutcome('discarded-empty');
    if (event === 'START') {
      setSessionOutcome('idle');
      finishing.current = false;
      startedAt.current = performance.now();
      accumulated.current = elapsedRef.current;
      setRunning(true);
    }
    if (event === 'FINISH' && !finishing.current) {
      setSessionOutcome('logged');
      finishing.current = true;
      const completedAt = new Date().toISOString();
      setEntries((current) =>
        [
          { id: `${Date.now()}`, seconds: elapsedRef.current, completedAt },
          ...current,
        ].slice(0, 50),
      );
    }
    if (event === 'DONE' || (event === 'INSIGHTS' && origin === 'complete')) {
      elapsedRef.current = 0;
      accumulated.current = 0;
      setElapsed(0);
    }
    setScreen(transition.target as VelaScreen);
    return true;
  }
  function navigate(destination: 'today' | 'insights' | 'profile') {
    let origin = screen;
    for (
      let step = 0;
      step < 3 && !['today', 'insights', 'profile'].includes(origin);
      step++
    ) {
      const event: Event = origin === 'complete' ? 'DONE' : 'BACK';
      const transition = policy.handoff.machine.states
        .find((s) => s.id === origin)
        ?.on.find((t) => t.event === event);
      if (!transition || !send(event, origin)) return;
      origin = transition.target as VelaScreen;
    }
    if (origin !== destination)
      send(
        destination === 'today'
          ? 'TODAY'
          : destination === 'insights'
            ? 'INSIGHTS'
            : 'PROFILE',
        origin,
      );
  }
  function pauseOrResume() {
    if (running) {
      elapsedRef.current = currentElapsed();
      setElapsed(elapsedRef.current);
      accumulated.current = elapsedRef.current;
      setRunning(false);
    } else {
      startedAt.current = performance.now();
      setRunning(true);
    }
  }
  useEffect(() => {
    if (!running || screen !== 'active') return;
    const timer = setInterval(() => {
      const seconds = Math.min(
        TOTAL_SECONDS,
        accumulated.current +
          Math.max(0, (performance.now() - startedAt.current) / 1000),
      );
      elapsedRef.current = seconds;
      setElapsed(seconds);
      if (seconds >= TOTAL_SECONDS) send('FINISH');
    }, 250);
    return () => clearInterval(timer);
  }, [running, screen]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && running) {
        const seconds = Math.min(
          TOTAL_SECONDS,
          accumulated.current +
            Math.max(0, (performance.now() - startedAt.current) / 1000),
        );
        accumulated.current = seconds;
        elapsedRef.current = seconds;
        setElapsed(seconds);
        setRunning(false);
      }
    });
    return () => sub.remove();
  }, [running]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () =>
        screen === 'today'
          ? false
          : send(
              screen === 'complete'
                ? 'DONE'
                : screen === 'insights' || screen === 'profile'
                  ? 'TODAY'
                  : 'BACK',
            ),
    );
    return () => subscription.remove();
  }, [screen]);

  const todayAction = <Action text="Open session" event="OPEN_SESSION" />;
  const focusedActions =
    screen === 'detail' ? (
      <Action
        text={elapsed > 0 ? 'Resume session' : 'Start session'}
        event="START"
      />
    ) : screen === 'active' ? (
      <>
        <Action
          text={running ? 'Pause session' : 'Resume session'}
          onPress={pauseOrResume}
        />
        <Action
          text={elapsed === 0 && !running ? 'Leave session' : 'Finish session'}
          event="FINISH"
          secondary
        />
      </>
    ) : screen === 'complete' ? (
      <>
        <Action text="Back to Today" event="DONE" />
        <Action text="View insights" event="INSIGHTS" secondary />
      </>
    ) : null;
  const phase = elapsed < 240 ? 0 : elapsed < 960 ? 1 : 2;
  const phaseName = copy(`phase-${phase}` as 'phase-0' | 'phase-1' | 'phase-2');
  const totalLocalMinutes = Math.round(
    entries.reduce((sum, e) => sum + e.seconds, 0) / 60,
  );
  const selectedDestination = isDestination ? screen : 'today';
  const nav = (
    <>
      {(
        [
          { id: 'today', label: 'Today', event: 'TODAY', icon: 'today' },
          {
            id: 'insights',
            label: 'Insights',
            event: 'INSIGHTS',
            icon: 'insights',
          },
          {
            id: 'profile',
            label: 'Profile',
            event: 'PROFILE',
            icon: 'profile',
          },
        ] as const
      ).map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedDestination === item.id }}
          accessibilityLabel={item.label}
          onPress={() => {
            navigate(item.id);
          }}
          style={{
            flex: useRail ? undefined : 1,
            minHeight: 52,
            paddingVertical: n('gap') * 0.65,
            paddingHorizontal: useRail ? n('gap') : n('gap') * 0.3,
            borderRadius: n('radius') * 0.6,
            flexDirection: useRail ? 'row' : 'column',
            alignItems: 'center',
            gap: n('gap') * 0.35,
            backgroundColor:
              selectedDestination === item.id ? c.lime : c.canvas,
          }}
        >
          <Icon
            name={item.icon}
            color={selectedDestination === item.id ? c['on-lime'] : c.muted}
          />
          <Text
            style={type(
              n(useRail ? 'railLabelSize' : 'navLabelSize'),
              true,
              selectedDestination === item.id ? c['on-lime'] : c.muted,
            )}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </>
  );

  if (restoreState === 'failed')
    return (
      <NativeObservationProvider
        measurementOrigin={geometry.rootFrame}
        snapshot={{
          app: 'vela',
          proofId,
          screen: 'restore-error',
          restoreState,
          hydrated: false,
          designHandoffIdentity: policy.handoff.identity,
          window,
          viewportGuard,
          coordinateSpace,
          windowSafeArea,
          designViewport,
          safeArea: geometry.insets,
          nominalWindow: geometry.nominalWindow,
          measuredRootFrame: geometry.rootFrame,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: c.canvas,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <ScrollView
            contentContainerStyle={{
              padding: n('pageGutter'),
              gap: n('gap'),
            }}
          >
            <Text accessibilityRole="header" style={type(size(1.4), true)}>
              Your journal couldn’t be opened.
            </Text>
            <Text
              accessibilityRole="alert"
              style={type(size(), false, c.muted)}
            >
              Existing local data hasn’t been replaced. Retry to continue.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry restore"
              onPress={() => setRestoreAttempt((value) => value + 1)}
              style={primary}
            >
              <Text style={type(size(), true, onAccent)}>Retry restore</Text>
            </Pressable>
          </ScrollView>
        </View>
      </NativeObservationProvider>
    );
  if (!loaded || !hydrated)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.canvas,
          paddingTop: insets.top + 40,
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: c.ink, fontSize: 20 }}>Opening Vela…</Text>
      </View>
    );
  return (
    <VelaUI.Provider
      value={{
        primary,
        c,
        type,
        size,
        onAccent,
        headingSize: n('headingSize'),
        timerSize: n('timerSize'),
        timerStacked: n('timerStacked') === 1,
        gap: n('gap'),
        send,
      }}
    >
      <NativeObservationProvider
        measurementOrigin={geometry.rootFrame}
        snapshot={{
          app: 'vela',
          designHandoffIdentity: policy.handoff.identity,
          implementationIdentity:
            process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound',
          proofId,
          screen,
          elapsedSeconds: elapsed,
          sessionOutcome,
          persistence,
          restoreState,
          navigationMenuOpen: menuOpen,
          copyMode,
          coordinateSpace,
          windowSafeArea,
          designViewport,
          running,
          completedSessions: entries.length,
          preferences,
          reducedMotion,
          systemReducedMotion: systemReduced,
          motionPhase,
          hydrated,
          window,
          viewportGuard,
          safeArea: geometry.insets,
          nominalWindow: geometry.nominalWindow,
          measuredRootFrame: geometry.rootFrame,
          palette: c,
          plan: p,
          resolvedAdmissible: resolved.admissible,
          resolvedFailures: resolved.failures,
          navigation: useRail
            ? 'rail'
            : isDestination
              ? n('navCompact') === 1
                ? 'menu'
                : 'tabs'
              : 'focused',
          designPolicy: policy.handoff.program.identity,
          motion: {
            spring: entryPlan.analysis.motion.spring,
            kind: reducedMotion ? 'opacity-fade' : entryPlan.plan?.kind,
            phase: motionPhase,
          },
          storageError,
        }}
      >
        <StatusBar barStyle="light-content" />
        <View
          accessibilityElementsHidden={menuOpen}
          importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'}
          style={{
            flex: 1,
            flexDirection: 'row',
            backgroundColor: c.canvas,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
        >
          {useRail && (
            <View
              style={{
                width: railWidth,
                paddingTop: insets.top + n('sectionGap'),
                paddingHorizontal: n('gap'),
                gap: n('sectionGap'),
                borderRightWidth: 1,
                borderColor: c.surface,
              }}
            >
              <Text style={type(size(2.1), true)}>VELA</Text>
              <View style={{ gap: n('gap') * 0.5 }}>{nav}</View>
              <View style={{ flex: 1 }} />
              <Text
                style={[label, { paddingBottom: insets.bottom + n('gap') }]}
              >
                YOUR PACE.{'\n'}YOUR SPACE.
              </Text>
            </View>
          )}
          <View style={{ flex: 1, paddingTop: insets.top }}>
            <View
              style={{
                paddingHorizontal: n('pageGutter'),
                paddingVertical: n('gap') * 0.55,
                flexDirection: 'row',
                alignItems: 'center',
                gap: n('gap'),
              }}
            >
              {!isDestination && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    screen === 'complete'
                      ? 'Back to Today'
                      : screen === 'active'
                        ? 'Back to session details'
                        : 'Back to Today'
                  }
                  onPress={() => send(screen === 'complete' ? 'DONE' : 'BACK')}
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="back" color={c.ink} />
                </Pressable>
              )}
              <Text
                style={[
                  type(size(isDestination ? 1.55 : 0.74), true),
                  { flex: 1, letterSpacing: size(0.05) },
                ]}
              >
                {isDestination
                  ? 'VELA'
                  : screen === 'active'
                    ? 'IN SESSION'
                    : screen === 'complete'
                      ? sessionOutcome === 'logged'
                        ? 'SESSION LOGGED'
                        : 'SESSION SUMMARY'
                      : 'SESSION DETAILS'}
              </Text>
              {screen === 'active' && (
                <Text style={type(size(0.7), true, c.lime)}>
                  {running ? 'LIVE' : 'PAUSED'}
                </Text>
              )}
            </View>
            <ScrollView
              key={screen}
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{
                paddingHorizontal: n('pageGutter'),
                paddingTop: n('gap'),
                paddingBottom: n('sectionGap'),
                alignItems: 'center',
              }}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={{
                  width: '100%',
                  maxWidth: n('contentWidth'),
                  gap: n('sectionGap'),
                  opacity,
                  transform: [{ translateY: pageOffset }],
                }}
              >
                {screen === 'today' && (
                  <>
                    {n('heroActionFirst') === 1 && todayAction}
                    <Heading>
                      {copy('today')}
                      <Text style={{ color: c.lime }}>
                        {glueAccentPunctuation('.')}
                      </Text>
                    </Heading>
                    {sessionOutcome === 'discarded-empty' && (
                      <Text
                        accessibilityRole="alert"
                        style={type(size(), false, c.muted)}
                      >
                        No time elapsed. Nothing was added to your journal.
                      </Text>
                    )}
                    {n('heroActionFirst') !== 1 && todayAction}
                    <View
                      style={{
                        flexDirection: n('paired') ? 'row' : 'column',
                        gap: n('gap'),
                        alignItems: 'stretch',
                      }}
                    >
                      <View
                        style={[
                          card,
                          {
                            backgroundColor: c.cobalt,
                            flexGrow: n('paired') ? 1 : 0,
                            flexShrink: 0,
                            flexBasis: n('paired') ? n('cardWidth') : 'auto',
                          },
                        ]}
                      >
                        <Text style={[label, { color: c['on-cobalt'] }]}>
                          TODAY’S SESSION
                        </Text>
                        <View
                          style={{
                            flexDirection:
                              n('phaseStacked') === 1 ? 'column' : 'row',
                            gap: n('gap'),
                            alignItems: 'flex-start',
                          }}
                        >
                          <Text
                            style={[
                              type(size(2), true, c['on-cobalt']),
                              { flex: 1 },
                            ]}
                          >
                            The steady{'\n'}build.
                          </Text>
                          <View>
                            <Text
                              style={type(
                                n('sessionNumeralSize'),
                                true,
                                c['on-cobalt'],
                              )}
                            >
                              22
                            </Text>
                            <Text style={[label, { color: c['on-cobalt'] }]}>
                              MINUTES
                            </Text>
                          </View>
                        </View>
                        <Trace
                          color={c['on-cobalt']}
                          height={n('titleSize') * 1.15}
                        />
                        <Text style={type(size(0.85), false, c['on-cobalt'])}>
                          Find your rhythm. Hold it.{'\n'}Make room to ease
                          back.
                        </Text>
                      </View>
                      <View
                        style={{
                          flexGrow: n('paired') ? 1 : 0,
                          flexShrink: 0,
                          flexBasis: n('paired') ? n('cardWidth') : 'auto',
                          gap: n('gap'),
                        }}
                      >
                        <View style={card}>
                          <Text style={label}>A MOMENT FOR YOU</Text>
                          <Text
                            accessibilityRole="header"
                            style={type(size(1.6), true)}
                          >
                            How are you{'\n'}arriving today?
                          </Text>
                          <Text style={type(size(0.85), false, c.muted)}>
                            A personal check-in, at your own pace.
                          </Text>
                          <View style={[row, { gap: n('gap') * 0.45 }]}>
                            {(['easy', 'steady', 'energized'] as const).map(
                              (value, i) => (
                                <Pressable
                                  key={value}
                                  accessibilityRole="radio"
                                  accessibilityLabel={
                                    ['Easy', 'Steady', 'Energized'][i]
                                  }
                                  accessibilityState={{
                                    checked: preferences.checkIn === value,
                                  }}
                                  onPress={() =>
                                    setPreferences((v) => ({
                                      ...v,
                                      checkIn: value,
                                    }))
                                  }
                                  style={{
                                    minHeight: 48,
                                    paddingHorizontal: n('gap') * 0.7,
                                    paddingVertical: n('gap') * 0.55,
                                    borderRadius: n('radius'),
                                    backgroundColor:
                                      preferences.checkIn === value
                                        ? c.lime
                                        : c.canvas,
                                  }}
                                >
                                  <Text
                                    style={type(
                                      size(0.7),
                                      true,
                                      preferences.checkIn === value
                                        ? c['on-lime']
                                        : c.ink,
                                    )}
                                  >
                                    {['Easy', 'Steady', 'Energized'][i]}
                                  </Text>
                                </Pressable>
                              ),
                            )}
                          </View>
                        </View>
                        <View style={[card, { backgroundColor: c.lime }]}>
                          <Text style={[label, { color: c['on-lime'] }]}>
                            SHOWING UP COUNTS
                          </Text>
                          <Text
                            style={type(
                              n('titleSize') * 0.7,
                              true,
                              c['on-lime'],
                            )}
                          >
                            {entries.length.toString().padStart(2, '0')}
                          </Text>
                          <Text style={type(size(0.85), false, c['on-lime'])}>
                            sessions logged on this device
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={type(size(0.65), false, c.muted)}>
                      An original Vela concept. A sample session and your own
                      local journal.
                    </Text>
                  </>
                )}
                {screen === 'detail' && (
                  <>
                    <Heading>
                      {copy('detail')}
                      <Text style={{ color: c.lime }}>
                        {glueAccentPunctuation('.')}
                      </Text>
                    </Heading>
                    {n('persistentActions') !== 1 && focusedActions}
                    {sessionOutcome === 'discarded-empty' && (
                      <Text
                        accessibilityRole="alert"
                        style={type(size(), false, c.muted)}
                      >
                        No time logged. Start when you're ready.
                      </Text>
                    )}
                    <View style={{ gap: n('gap') }}>
                      {PHASES.map((item, i) => (
                        <View
                          key={item.name}
                          style={{
                            flexDirection:
                              n('phaseStacked') === 1 ? 'column' : 'row',
                            gap: n('gap'),
                            borderTopWidth: 1,
                            borderColor: c.surface,
                            paddingTop: n('gap'),
                          }}
                        >
                          <Text style={type(size(0.75), true, c.lime)}>
                            0{i + 1}
                          </Text>
                          <View style={{ flex: 1, gap: n('gap') * 0.3 }}>
                            <Text style={type(size(1.2), true)}>
                              {item.name}
                            </Text>
                            <Text style={type(size(0.85), false, c.muted)}>
                              {item.note}
                            </Text>
                          </View>
                          <Text style={type(size(), true)}>
                            {item.minutes} MIN
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Text style={type(size(0.7), false, c.muted)}>
                      Choose your effort. Pause or finish whenever you choose.
                    </Text>
                    {/* Decision information precedes decorative reinforcement. */}
                    <View style={[card, { backgroundColor: c.cobalt }]}>
                      <Trace color={c['on-cobalt']} height={n('gap') * 3} />
                      <Text style={type(size(), false, c['on-cobalt'])}>
                        A simple structure for purposeful movement. You choose
                        the activity and effort.
                      </Text>
                    </View>
                  </>
                )}
                {screen === 'active' && (
                  <>
                    <View style={{ gap: n('gap') }}>
                      <Text style={label}>PHASE 0{phase + 1} OF 03</Text>
                      <Text
                        accessibilityRole="header"
                        style={type(n('headingSize'), true)}
                      >
                        {phaseName}
                        <Text style={{ color: c.lime }}>
                          {glueAccentPunctuation('.')}
                        </Text>
                      </Text>
                    </View>
                    <View
                      style={[
                        card,
                        { backgroundColor: c.cobalt, gap: n('sectionGap') },
                      ]}
                    >
                      <Text style={[label, { color: c['on-cobalt'] }]}>
                        TIME REMAINING
                      </Text>
                      <Duration
                        seconds={TOTAL_SECONDS - elapsed}
                        color={c['on-cobalt']}
                        description="remaining"
                      />
                      <View
                        accessibilityRole="progressbar"
                        accessibilityValue={{
                          min: 0,
                          max: TOTAL_SECONDS,
                          now: elapsed,
                          text: `${formatTime(elapsed)} elapsed`,
                        }}
                        style={{
                          height: n('gap') * 0.5,
                          borderRadius: n('radius'),
                          backgroundColor: c.canvas,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${(elapsed / TOTAL_SECONDS) * 100}%`,
                            height: '100%',
                            backgroundColor: c.lime,
                          }}
                        />
                      </View>
                      <Text style={type(size(), false, c['on-cobalt'])}>
                        {running
                          ? 'Stay with your rhythm.'
                          : 'Take your time. Your place is held.'}
                      </Text>
                    </View>
                    {n('persistentActions') !== 1 && (
                      <View style={{ gap: n('gap') }}>{focusedActions}</View>
                    )}
                    <Text style={type(size(0.75), false, c.muted)}>
                      {formatTime(elapsed)} elapsed · Pauses when Vela leaves
                      the foreground.
                    </Text>
                  </>
                )}
                {screen === 'complete' && (
                  <>
                    {sessionOutcome === 'logged' && elapsed > 0 ? (
                      <>
                        <View
                          style={{
                            width: n('titleSize'),
                            height: n('titleSize'),
                            borderRadius: n('radius'),
                            backgroundColor: c.lime,
                            alignItems: 'center',
                            justifyContent: 'center',
                            transform: [{ rotate: '-8deg' }],
                          }}
                        >
                          <Icon
                            name="check"
                            color={c['on-lime']}
                            size={n('titleSize') * 0.6}
                          />
                        </View>
                        <Heading>
                          {copy('complete')}
                          <Text style={{ color: c.lime }}>
                            {glueAccentPunctuation('.')}
                          </Text>
                        </Heading>
                        <View style={[card, { backgroundColor: c.lime }]}>
                          <Text style={[label, { color: c['on-lime'] }]}>
                            YOUR SESSION
                          </Text>
                          <Duration
                            seconds={elapsed}
                            color={c['on-lime']}
                            description="completed"
                          />
                          <Text style={type(size(), false, c['on-lime'])}>
                            Steady build ·{' '}
                            {persistence === 'saved'
                              ? 'Saved on this device'
                              : persistence === 'pending'
                                ? 'Saving on this device…'
                                : 'Not saved yet'}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <Heading>
                          {copy('complete-empty')}
                          <Text style={{ color: c.lime }}>
                            {glueAccentPunctuation('.')}
                          </Text>
                        </Heading>
                        <Text style={type(size(), false, c.muted)}>
                          Your journal changes after you finish a session with
                          elapsed time.
                        </Text>
                      </>
                    )}
                    {n('persistentActions') !== 1 && (
                      <View style={{ gap: n('gap') }}>{focusedActions}</View>
                    )}
                  </>
                )}
                {screen === 'insights' && (
                  <>
                    <Heading>
                      {copy('insights')}
                      <Text style={{ color: c.lime }}>
                        {glueAccentPunctuation('.')}
                      </Text>
                    </Heading>
                    <View style={card}>
                      <Text style={label}>YOUR LOCAL JOURNAL</Text>
                      <View style={[row, { justifyContent: 'space-between' }]}>
                        <View>
                          <Text style={type(n('titleSize') * 0.7, true)}>
                            {entries.length}
                          </Text>
                          <Text style={type(size(0.8), false, c.muted)}>
                            sessions
                          </Text>
                        </View>
                        <View>
                          <Text style={type(n('titleSize') * 0.7, true)}>
                            {totalLocalMinutes}
                          </Text>
                          <Text style={type(size(0.8), false, c.muted)}>
                            minutes logged
                          </Text>
                        </View>
                      </View>
                      {entries.length === 0 ? (
                        <Text style={type(size(0.85), false, c.muted)}>
                          Your first completed timer will appear here.
                        </Text>
                      ) : (
                        entries.slice(0, 5).map((entry) => (
                          <View
                            key={entry.id}
                            style={[
                              row,
                              {
                                justifyContent: 'space-between',
                                borderTopWidth: 1,
                                borderColor: c.muted,
                                paddingTop: n('gap'),
                              },
                            ]}
                          >
                            <View>
                              <Text style={type(size(), true)}>
                                Steady build
                              </Text>
                              <Text style={type(size(0.7), false, c.muted)}>
                                {new Date(
                                  entry.completedAt,
                                ).toLocaleDateString()}
                              </Text>
                            </View>
                            <Text style={type(size(), true, c.lime)}>
                              {formatTime(entry.seconds)}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                    <Action
                      text="Choose a session"
                      onPress={() => {
                        navigate('today');
                        send('OPEN_SESSION', 'today');
                      }}
                    />
                    <View style={[card, { backgroundColor: c.cobalt }]}>
                      <View
                        style={[
                          row,
                          {
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          },
                        ]}
                      >
                        <View>
                          <Text style={[label, { color: c['on-cobalt'] }]}>
                            SAMPLE WEEK
                          </Text>
                          <Text
                            style={type(n('titleSize'), true, c['on-cobalt'])}
                          >
                            76
                            <Text style={type(size(), false, c['on-cobalt'])}>
                              {' '}
                              MIN
                            </Text>
                          </Text>
                        </View>
                        <Text
                          style={[
                            type(size(0.7), false, c['on-cobalt']),
                            { maxWidth: n('contentWidth') * 0.35 },
                          ]}
                        >
                          Illustrative history.{'\n'}Not your activity.
                        </Text>
                      </View>
                      <View
                        accessible
                        accessibilityLabel="Sample week minutes: Monday18, Tuesday0, Wednesday24, Thursday12, Friday0, Saturday22, Sunday0"
                        style={{
                          flexDirection: 'row',
                          gap: n('gap') * 0.5,
                          alignItems: 'flex-end',
                        }}
                      >
                        {SAMPLE_WEEK.map((minutes, i) => (
                          <View
                            key={i}
                            style={{
                              flex: 1,
                              gap: n('gap') * 0.5,
                              alignItems: 'center',
                            }}
                          >
                            <View
                              style={{
                                width: '100%',
                                height: n('titleSize') * 1.8,
                                justifyContent: 'flex-end',
                              }}
                            >
                              <View
                                style={{
                                  height: Math.max(
                                    n('gap') * 0.2,
                                    (minutes / 24) * n('titleSize') * 1.8,
                                  ),
                                  backgroundColor:
                                    i === 5 ? c.lime : c['on-cobalt'],
                                  borderRadius: n('radius') * 0.2,
                                }}
                              />
                            </View>
                            <Text
                              style={type(size(0.63), true, c['on-cobalt'])}
                            >
                              {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </>
                )}
                {screen === 'profile' && (
                  <>
                    <Heading>
                      {copy('profile')}
                      <Text style={{ color: c.lime }}>
                        {glueAccentPunctuation('.')}
                      </Text>
                    </Heading>
                    <View style={card}>
                      <Text
                        accessibilityRole="header"
                        style={type(size(1.4), true)}
                      >
                        Motion, your way.
                      </Text>
                      <Text style={type(size(0.85), false, c.muted)}>
                        Follow your device or keep spatial transitions off. Both
                        preserve every action.
                      </Text>
                      <View style={row}>
                        {(['system', 'reduced'] as const).map((mode) => (
                          <Pressable
                            key={mode}
                            accessibilityRole="radio"
                            accessibilityLabel={
                              mode === 'system'
                                ? 'Follow system motion'
                                : 'Reduce motion'
                            }
                            accessibilityState={{
                              checked: preferences.motion === mode,
                            }}
                            onPress={() =>
                              setPreferences((v) => ({ ...v, motion: mode }))
                            }
                            style={[
                              primary,
                              {
                                flexGrow: 1,
                                flexBasis: n('bodySize') * 6,
                                backgroundColor:
                                  preferences.motion === mode
                                    ? c.lime
                                    : c.canvas,
                              },
                            ]}
                          >
                            <Text
                              style={type(
                                size(0.85),
                                true,
                                preferences.motion === mode
                                  ? c['on-lime']
                                  : c.ink,
                              )}
                            >
                              {mode === 'system' ? 'System' : 'Reduced'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={type(size(0.7), false, c.muted)}>
                        {systemReduced
                          ? 'Your device currently requests reduced motion.'
                          : 'Your device currently allows motion.'}
                      </Text>
                    </View>
                    <View style={card}>
                      <Text
                        accessibilityRole="header"
                        style={type(size(1.4), true)}
                      >
                        Choose your accent.
                      </Text>
                      <View style={row}>
                        {(['lime', 'cobalt'] as const).map((value) => (
                          <Pressable
                            key={value}
                            accessibilityRole="radio"
                            accessibilityLabel={`${value === 'lime' ? 'Lime' : 'Cobalt'} accent`}
                            accessibilityState={{
                              checked: preferences.accent === value,
                            }}
                            onPress={() =>
                              setPreferences((v) => ({ ...v, accent: value }))
                            }
                            style={{
                              flex: 1,
                              minHeight: 64,
                              borderRadius: n('radius') * 0.6,
                              padding: n('gap') * 0.7,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: n('gap') * 0.5,
                              backgroundColor: c[value],
                            }}
                          >
                            <Text
                              style={[
                                type(
                                  size(0.85),
                                  true,
                                  value === 'lime'
                                    ? c['on-lime']
                                    : c['on-cobalt'],
                                ),
                                { flexShrink: 1 },
                              ]}
                            >
                              {value === 'lime' ? 'Lime' : 'Cobalt'}
                            </Text>
                            {preferences.accent === value && (
                              <Icon
                                name="check"
                                color={
                                  value === 'lime'
                                    ? c['on-lime']
                                    : c['on-cobalt']
                                }
                                size={20}
                              />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <View style={{ gap: n('gap') * 0.5 }}>
                      <Text style={type(size(1.2), true)}>On this device.</Text>
                      <Text style={type(size(0.85), false, c.muted)}>
                        Your check-in, session history and preferences stay
                        here. No account, health sensor or cloud connection is
                        used.
                      </Text>
                      <Text style={type(size(0.7), false, c.muted)}>
                        Vela is an original interactive concept. The weekly
                        chart is labeled sample data.
                      </Text>
                    </View>
                  </>
                )}
                {persistence === 'failed' && (
                  <Action
                    text="Retry save"
                    onPress={() => setSaveAttempt((value) => value + 1)}
                  />
                )}
                {storageError !== '' && (
                  <Text
                    accessibilityRole="alert"
                    style={type(size(0.8), false, c.lime)}
                  >
                    {storageError}
                  </Text>
                )}
              </Animated.View>
            </ScrollView>
            {n('persistentActions') === 1 && focusedActions && (
              <ScrollView
                key={`actions-${screen}`}
                accessibilityLabel="Session controls"
                style={{
                  flexGrow: 0,
                  flexShrink: 0,
                  maxHeight: Math.max(
                    0,
                    n('actionDockMaxHeight') - windowSafeArea.bottom,
                  ),
                  marginBottom: windowSafeArea.bottom,
                  borderTopWidth: 1,
                  borderColor: c.surface,
                  backgroundColor: c.canvas,
                }}
                contentContainerStyle={{
                  gap: n('gap'),
                  paddingHorizontal: n('pageGutter'),
                  paddingTop: n('gap'),
                  paddingBottom: n('gap'),
                }}
                showsVerticalScrollIndicator
              >
                {focusedActions}
              </ScrollView>
            )}
            {isDestination && !useRail && n('navCompact') === 1 && (
              <View
                style={{
                  padding: n('pageGutter'),
                  paddingBottom: Math.max(n('pageGutter'), insets.bottom),
                  backgroundColor: c.canvas,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Menu"
                  accessibilityState={{ expanded: menuOpen }}
                  onLayout={(event) => {
                    menuFocus.current =
                      typeof event.target === 'number'
                        ? event.target
                        : (findNodeHandle(event.target) ?? null);
                  }}
                  onPress={() => setMenuOpen(true)}
                  style={primary}
                >
                  <Text style={type(size(), true, onAccent)}>Menu</Text>
                  <Icon name="arrow" color={onAccent} />
                </Pressable>
              </View>
            )}
            {isDestination && !useRail && n('navCompact') !== 1 && (
              <View
                accessibilityRole="tablist"
                style={{
                  flexDirection: 'row',
                  gap: n('gap') * 0.3,
                  paddingHorizontal: n('pageGutter') * 0.5,
                  paddingTop: n('gap') * 0.5,
                  paddingBottom: Math.max(n('gap') * 0.5, insets.bottom),
                  borderTopWidth: 1,
                  borderColor: c.surface,
                  backgroundColor: c.canvas,
                }}
              >
                {nav}
              </View>
            )}
            {!isDestination && n('persistentActions') !== 1 && (
              <View
                style={{ height: insets.bottom, backgroundColor: c.canvas }}
              />
            )}
          </View>
        </View>
        <Modal
          visible={menuOpen}
          transparent
          animationType={reducedMotion ? 'none' : 'fade'}
          onRequestClose={closeMenu}
          onDismiss={restoreMenuFocus}
          onShow={() => {
            requestAnimationFrame(() => {
              if (closeFocus.current !== null)
                AccessibilityInfo.setAccessibilityFocus(closeFocus.current);
            });
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(0,0,0,0.65)',
              paddingTop: insets.top,
            }}
          >
            <View
              style={{
                maxHeight: '95%',
                backgroundColor: c.surface,
                borderTopLeftRadius: n('radius'),
                borderTopRightRadius: n('radius'),
                padding: n('pageGutter'),
                paddingBottom: Math.max(n('pageGutter'), insets.bottom),
              }}
            >
              <ScrollView contentContainerStyle={{ gap: n('gap') }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close menu"
                  onLayout={(event) => {
                    closeFocus.current =
                      typeof event.target === 'number'
                        ? event.target
                        : (findNodeHandle(event.target) ?? null);
                  }}
                  onPress={closeMenu}
                  style={{ ...primary, backgroundColor: c.canvas }}
                >
                  <Text style={type(size(), true)}>Close menu</Text>
                </Pressable>
                {(['today', 'insights', 'profile'] as const).map(
                  (destination) => (
                    <Pressable
                      key={destination}
                      accessibilityRole="button"
                      accessibilityLabel={
                        destination === 'today'
                          ? 'Today'
                          : destination === 'insights'
                            ? 'Insights'
                            : 'Profile'
                      }
                      accessibilityState={{
                        selected: selectedDestination === destination,
                      }}
                      onPress={() => {
                        navigate(destination);
                        closeMenu();
                      }}
                      style={{
                        ...primary,
                        backgroundColor:
                          selectedDestination === destination
                            ? c.lime
                            : c.canvas,
                      }}
                    >
                      <Text
                        style={type(
                          size(),
                          true,
                          selectedDestination === destination
                            ? c['on-lime']
                            : c.ink,
                        )}
                      >
                        {destination === 'today'
                          ? 'Today'
                          : destination === 'insights'
                            ? 'Insights'
                            : 'Profile'}
                      </Text>
                    </Pressable>
                  ),
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </NativeObservationProvider>
    </VelaUI.Provider>
  );
}
