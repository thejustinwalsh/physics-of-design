import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import { assign, createActor, createMachine } from 'xstate';
import {
  resolveDesignRuntime,
  evaluateExpression,
  projectScrollAnchor,
} from '@design-theory/toolkit/layout';
import { emitMotion } from '../../src/motion.ts';
import { glueAccentPunctuation } from '../../src/typography-flow.ts';
import policy from './design.generated.json';
import fieldNotesPolicy from './design.field-notes.generated.json';
const directionPolicies = { momentum: policy, 'field-notes': fieldNotesPolicy };
import { installVelaMotion } from './web-motion.js';

const c = Object.fromEntries(
  Object.keys(policy.colors).map((key) => [key, `var(--vela-${key})`]),
);
const TOTAL = 22 * 60;
const STORAGE = 'vela-web-local-v1';
const PHASES = [
  { name: 'Find your rhythm', minutes: 4, note: 'Start at your own pace.' },
  { name: 'Steady build', minutes: 12, note: 'Choose a pace you can sustain.' },
  { name: 'Downshift', minutes: 6, note: 'Make room to ease back.' },
];
const SAMPLE_WEEK = [18, 0, 24, 12, 0, 22, 0];
const clock = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
const query = new URLSearchParams(location.search);
const contentFixture =
  query.get('copy') === 'expanded' ? 'expanded' : 'default';
const requestedScale = Number(query.get('textScale')) || 1;
const textScale =
  Number.isFinite(requestedScale) && requestedScale >= 1 ? requestedScale : 1;
const initialScreen = policy.handoff.machine.states.some(
  (s) => s.id === query.get('view'),
)
  ? query.get('view')
  : policy.handoff.machine.initial;
const sx = (...args) => stylex.props(...args);

const styles = stylex.create({
  root: { minHeight: '100vh', fontFamily: 'VelaRegular, sans-serif' },
  surface: (backgroundColor, color) => ({ backgroundColor, color }),
  layout: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: '100vh',
  },
  rail: (width, gap, padding) => ({
    width,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap,
    padding,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: 'var(--vela-separator)',
  }),
  focusedLayout: { height: '100dvh', minHeight: 0, overflow: 'hidden' },
  focusedPane: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  focusedFrame: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  fixedHeader: { flexShrink: 0 },
  focusedScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  scrollContents: { flexShrink: 0 },
  actionDock: (maxHeight, gap) => ({
    display: 'flex',
    flexDirection: 'column',
    gap,
    flexShrink: 0,
    maxHeight,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingTop: gap,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--vela-separator)',
    backgroundColor: 'var(--vela-canvas)',
  }),
  column: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  ruled: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--vela-separator)',
  },
  fill: { flex: 1, minWidth: 0 },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  between: { justifyContent: 'space-between' },
  gap: (gap) => ({ gap }),
  pane: (padding) => ({ flex: 1, minWidth: 0, padding }),
  content: (maxWidth) => ({
    width: '100%',
    maxWidth,
    marginLeft: 'auto',
    marginRight: 'auto',
  }),
  header: (gap) => ({
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap,
    marginBottom: gap * 2,
    minHeight: 48,
  }),
  brand: {
    fontFamily: 'VelaHeavy, sans-serif',
    fontSize: 30,
    letterSpacing: '-0.04em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  text: (fontSize, color) => ({
    fontSize,
    color,
    margin: 0,
    lineHeight: 1.4,
    overflowWrap: 'break-word',
  }),
  heavy: { fontFamily: 'VelaHeavy, sans-serif', fontWeight: 900 },
  leading: (lineHeight) => ({ lineHeight }),
  headline: (fontSize, tracking, gap, lineHeight) => ({
    fontFamily: 'VelaHeavy, sans-serif',
    fontWeight: 900,
    fontSize,
    letterSpacing: `${tracking}em`,
    lineHeight,
    marginTop: 0,
    marginBottom: gap,
    overflowWrap: 'anywhere',
  }),
  title: (fontSize) => ({
    fontFamily: 'VelaHeavy, sans-serif',
    fontWeight: 900,
    fontSize,
    letterSpacing: '-0.025em',
    lineHeight: 1.08,
    margin: 0,
    overflowWrap: 'anywhere',
  }),
  body: { maxWidth: '58ch' },
  grid: (paired, gap) => ({
    display: 'flex',
    flexDirection: paired ? 'row' : 'column',
    alignItems: 'stretch',
    gap,
  }),
  card: (radius, padding, gap) => ({
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    borderRadius: radius,
    padding,
    gap,
  }),
  button: (backgroundColor, color, radius, fontSize, padding, gap) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap,
    width: '100%',
    minHeight: 52,
    flexShrink: 0,
    backgroundColor,
    color,
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radius,
    paddingTop: padding * 0.7,
    paddingBottom: padding * 0.7,
    paddingLeft: padding,
    paddingRight: padding,
    fontFamily: 'VelaHeavy, sans-serif',
    fontSize,
    lineHeight: 1.3,
    textAlign: 'left',
    cursor: 'pointer',
  }),
  plainButton: (color, fontSize) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color,
    fontSize,
    backgroundColor: 'transparent',
    minWidth: 44,
    minHeight: 44,
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    padding: 8,
    cursor: 'pointer',
    borderRadius: 12,
  }),
  choice: (active, color, fontSize, radius) => ({
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: active ? color : 'var(--vela-border)',
    backgroundColor: 'transparent',
    color,
    fontSize,
    fontFamily: active ? 'VelaHeavy' : 'VelaRegular',
    borderRadius: radius,
    padding: 12,
    minHeight: 48,
    cursor: 'pointer',
    flexGrow: 1,
  }),
  nav: (rail, gap) => ({
    display: 'flex',
    flexDirection: rail ? 'column' : 'row',
    flexWrap: 'wrap',
    gap,
    marginTop: rail ? gap * 3 : gap * 2,
    borderTopWidth: rail ? 0 : 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--vela-separator)',
    paddingTop: rail ? 0 : gap,
  }),
  navButton: (active, rail, fontSize, gap, radius) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: rail ? 'flex-start' : 'center',
    flexDirection: rail ? 'row' : 'column',
    flex: rail ? 'initial' : 1,
    gap: 8,
    minWidth: 0,
    minHeight: 52,
    padding: gap * 0.6,
    borderRadius: radius * 0.6,
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: active ? 'var(--vela-surface)' : 'transparent',
    color: active ? 'var(--vela-action)' : 'var(--vela-muted)',
    fontSize,
    fontFamily: active ? 'VelaHeavy' : 'VelaRegular',
    cursor: 'pointer',
  }),
  divider: {
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--vela-border)',
    width: '100%',
    margin: 0,
  },
  numeral: (fontSize) => ({
    fontFamily: 'VelaHeavy, sans-serif',
    fontSize,
    letterSpacing: '-0.045em',
    lineHeight: 0.9,
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  }),
  timer: (fontSize, tracking) => ({
    fontFamily: 'VelaHeavy, sans-serif',
    fontSize,
    letterSpacing: `${tracking}em`,
    lineHeight: 1,
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }),
  badge: (backgroundColor, color, fontSize) => ({
    display: 'inline-flex',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 12,
    paddingRight: 12,
    alignSelf: 'flex-start',
    backgroundColor,
    color,
    borderRadius: 100,
    fontSize,
    fontFamily: 'VelaHeavy',
  }),
  chart: (gap) => ({
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap,
    height: 180,
    minWidth: 0,
  }),
  chartColumn: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flex: 1,
    height: '100%',
    minWidth: 0,
    gap: 8,
  },
  chartBar: (height, color) => ({
    height,
    width: '100%',
    maxWidth: 44,
    backgroundColor: color,
    borderRadius: '8px 8px 2px 2px',
    minHeight: 3,
  }),
  phase: (gap) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap,
    paddingTop: gap,
    paddingBottom: gap,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--vela-border)',
  }),
  screen: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  footer: (gap, fontSize) => ({
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap,
    marginTop: gap * 2,
    paddingTop: gap,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--vela-separator)',
    color: 'var(--vela-muted)',
    fontSize,
  }),
  error: {
    padding: 16,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--vela-action)',
    borderRadius: 12,
  },
  dialog: {
    width: 'calc(100% - 32px)',
    maxWidth: 560,
    maxHeight: 'calc(100dvh - 32px)',
    backgroundColor: 'var(--vela-canvas)',
    color: 'var(--vela-ink)',
    padding: 24,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--vela-border)',
    borderRadius: 16,
  },
  selected: {
    backgroundColor: 'var(--vela-action)',
    color: 'var(--vela-on-action)',
  },
});

function Icon({ name, size = 24 }) {
  const paths = {
    menu: 'M4 6h16M4 12h16M4 18h16',
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
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Trace({ height = 130 }) {
  return (
    <svg
      viewBox="0 0 300 100"
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 90L24 90 39 62 57 62 73 77 91 77 111 34 131 34 151 57 171 57 193 9 213 9 235 42 253 42 272 76 300 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M0 99H300" stroke="currentColor" strokeOpacity="0.25" />
    </svg>
  );
}
const emptyPreferences = () => ({
  accent: 'lime',
  direction: 'momentum',
  motion: 'system',
  checkIn: null,
  entries: [],
});
function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE);
    const value = raw === null ? emptyPreferences() : JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !['lime', 'cobalt'].includes(value.accent) ||
      (value.direction !== undefined &&
        !Object.hasOwn(directionPolicies, value.direction)) ||
      !['system', 'reduced'].includes(value.motion) ||
      ![null, 'easy', 'steady', 'energized'].includes(value.checkIn) ||
      !Array.isArray(value.entries) ||
      value.entries.length > 50 ||
      !value.entries.every(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          Number.isFinite(entry.seconds) &&
          entry.seconds > 0 &&
          entry.seconds <= TOTAL &&
          typeof entry.completedAt === 'string' &&
          Number.isFinite(Date.parse(entry.completedAt)),
      )
    )
      throw new Error('Invalid stored journal');
    return { status: 'ready', preferences: value };
  } catch {
    return { status: 'blocked' };
  }
}

const Ui = React.createContext(null);
function Timer({ seconds, label }) {
  const { p, size } = React.useContext(Ui);
  if (label === 'elapsed' && seconds > 0 && seconds < 1)
    return (
      <p {...sx(styles.text(size(1.4), 'inherit'))} data-timer>
        Less than 1 second
      </p>
    );
  const parts = clock(seconds).split(':');
  return p.timerStacked ? (
    <div
      {...sx(styles.column, styles.gap(p.gap))}
      data-timer
      aria-label={`${clock(seconds)} ${label}`}
    >
      {parts.map((part, i) => (
        <div key={i} {...sx(styles.row, styles.gap(p.gap))}>
          <span {...sx(styles.timer(p.timerSize * textScale, p.tracking))}>
            {part}
          </span>
          <span {...sx(styles.text(size(0.8), 'inherit'))}>
            {i === 0 ? 'minutes' : 'seconds'}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <p
      {...sx(styles.timer(p.timerSize * textScale, p.tracking))}
      data-timer
      aria-label={`${clock(seconds)} ${label}`}
    >
      {clock(seconds)}
    </p>
  );
}

const Text = ({
  children,
  muted = false,
  ratio = 1,
  heavy = false,
  ...rest
}) => {
  const { p, size, accent, onAccent, screen, destination, goDestination } =
    React.useContext(Ui);
  return (
    <p
      {...sx(
        styles.text(size(ratio), muted ? c.muted : 'inherit'),
        styles.leading(p.bodyLeading),
        heavy && styles.heavy,
      )}
      {...rest}
    >
      {children}
    </p>
  );
};
const Heading = ({ children }) => {
  const { p, size, accent, onAccent, screen, destination, goDestination } =
    React.useContext(Ui);
  return (
    <h1
      data-motion-heading
      data-testid="vela-heading"
      tabIndex="-1"
      {...sx(
        styles.headline(
          p.headingSize * textScale,
          p.tracking,
          p.gap,
          p.titleLeading,
        ),
      )}
    >
      {children}
    </h1>
  );
};
const contentText = (id, p, activePolicy, fixture) => {
  const content = activePolicy.handoff.machine.content;
  const key =
    fixture === 'expanded' && Object.hasOwn(content, `${id}-expanded`)
      ? `${id}-expanded`
      : id;
  return content[key][p.heroActionFirst === 1 ? 'compact' : 'default'];
};
const ContentHeading = ({ contentId }) => {
  const { p, policy: activePolicy, contentFixture } = React.useContext(Ui);
  const lines = contentText(contentId, p, activePolicy, contentFixture).split(
    '\n',
  );
  return (
    <Heading>
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 && <br />}
          {line}
          {index === lines.length - 1 && glueAccentPunctuation()}
        </React.Fragment>
      ))}
    </Heading>
  );
};
const Button = ({
  children,
  onClick,
  secondary = false,
  icon = 'arrow',
  ...rest
}) => {
  const { p, size, accent, onAccent, screen, destination, goDestination } =
    React.useContext(Ui);
  return (
    <button
      {...sx(
        styles.button(
          secondary ? c.surface : accent,
          secondary ? c.ink : onAccent,
          p.radius * 0.65,
          size(),
          p.pageGutter,
          p.gap,
        ),
      )}
      onClick={onClick}
      {...rest}
    >
      <span>{children}</span>
      <Icon name={icon} />
    </button>
  );
};
const Card = ({ children, color = c.surface, ink = c.ink, ...rest }) => {
  const {
    p,
    size,
    accent,
    onAccent,
    screen,
    destination,
    goDestination,
    direction,
  } = React.useContext(Ui);
  return (
    <section
      data-motion-card
      {...sx(
        styles.card(p.radius, p.pageGutter, p.gap),
        direction.finish === 'ruled-paper' && styles.ruled,
        styles.surface(color, ink),
      )}
      {...rest}
    >
      {children}
    </section>
  );
};
const Navigation = ({ vertical = false }) => {
  const { p, size, screen, destination, goDestination } = React.useContext(Ui);
  const compact = !vertical && p.navCompact === 1;
  const dialog = useRef(null);
  const close = () => {
    dialog.current?.close();
  };
  const links = (stacked) =>
    [
      ['today', 'Today'],
      ['insights', 'Insights'],
      ['profile', 'Profile'],
    ].map(([id, label]) => (
      <button
        key={id}
        {...sx(
          styles.navButton(
            screen === id || (id === 'today' && !destination),
            stacked,
            (vertical ? p.railLabelSize : p.navLabelSize) * textScale,
            p.gap,
            p.radius,
          ),
        )}
        aria-current={screen === id ? 'page' : undefined}
        onClick={() => {
          goDestination(id);
          if (compact) close();
        }}
        disabled={screen === id}
      >
        <Icon name={id} />
        <span>{label}</span>
      </button>
    ));
  if (compact)
    return (
      <>
        <nav
          aria-label="Main navigation"
          {...sx(styles.nav(false, p.gap * 0.5))}
        >
          <Button
            onClick={() => dialog.current.showModal()}
            icon="menu"
            aria-haspopup="dialog"
            data-menu-opener
          >
            Menu
          </Button>
        </nav>
        <dialog
          ref={dialog}
          aria-labelledby="menu-heading"
          {...sx(styles.dialog)}
          onClose={() => document.querySelector('[data-menu-opener]')?.focus()}
        >
          <div {...sx(styles.column, styles.gap(p.gap))}>
            <h2 id="menu-heading" {...sx(styles.title(size(1.4)))}>
              Menu
            </h2>
            <nav
              aria-label="Choose a screen"
              {...sx(styles.column, styles.gap(p.gap))}
            >
              {links(true)}
            </nav>
            <Button onClick={close} secondary icon="back">
              Close menu
            </Button>
          </div>
        </dialog>
      </>
    );
  return (
    <nav
      aria-label="Main navigation"
      {...sx(styles.nav(vertical, p.gap * 0.5))}
    >
      {links(vertical)}
    </nav>
  );
};
const Phases = () => {
  const {
    p,
    size,
    accent,
    onAccent,
    screen,
    destination,
    goDestination,
    policy: activePolicy,
    contentFixture,
  } = React.useContext(Ui);
  return (
    <div {...sx(styles.column)}>
      {PHASES.map((phase, index) => (
        <div
          key={phase.name}
          {...sx(styles.phase(p.gap), p.phaseStacked === 1 && styles.column)}
        >
          <div {...sx(styles.column, styles.gap(p.gap * 0.3), styles.fill)}>
            <Text heavy>
              {contentText(`phase-${index}`, p, activePolicy, contentFixture)}
            </Text>
            <Text muted ratio={0.85}>
              {phase.note}
            </Text>
          </div>
          <Text heavy>
            {phase.minutes}
            <span {...sx(styles.text(size(0.7), c.muted))}> min</span>
          </Text>
        </div>
      ))}
    </div>
  );
};

function Vela({ viewport }) {
  const [restore, setRestore] = useState(readStored);
  const [preferences, setPreferences] = useState(() => ({
    ...(restore.preferences ?? emptyPreferences()),
    ...(Object.hasOwn(directionPolicies, query.get('direction'))
      ? { direction: query.get('direction') }
      : {}),
  }));
  const policy = directionPolicies[preferences.direction ?? 'momentum'];
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = Object.fromEntries(
      Object.keys(policy.colors).map((key) => [
        key,
        root.style.getPropertyValue(`--vela-${key}`),
      ]),
    );
    const scheme = root.style.colorScheme;
    for (const [key, value] of Object.entries(policy.colors))
      root.style.setProperty(`--vela-${key}`, value);
    root.style.colorScheme = policy.direction.colorScheme;
    return () => {
      for (const [key, value] of Object.entries(previous))
        value
          ? root.style.setProperty(`--vela-${key}`, value)
          : root.style.removeProperty(`--vela-${key}`);
      root.style.colorScheme = scheme;
    };
  }, [policy]);
  const lastSaved = useRef(
    restore.status === 'ready' ? JSON.stringify(restore.preferences) : null,
  );
  const [systemReduced, setSystemReduced] = useState(
    matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const reduced = systemReduced || preferences.motion === 'reduced';
  const resolved = useMemo(() => {
    const input = {
      ...viewport,
      textScale,
      reducedMotion: Number(reduced),
    };
    // Synchronous input provenance: a pageerror handler may run after another
    // navigation or resize and observe a different, already valid viewport.
    window.__VELA_LAST_RUNTIME_INPUT__ = { ...input };
    return resolveDesignRuntime(policy.handoff, input);
  }, [viewport.width, viewport.height, reduced, policy]);
  const actor = useMemo(() => {
    const states = Object.fromEntries(
      policy.handoff.machine.states.map((s) => [
        s.id,
        {
          on: Object.fromEntries([
            [
              'REFLOW',
              { actions: assign({ facts: ({ event }) => event.facts }) },
            ],
            ...s.on.map((t) => [
              t.event,
              {
                target: t.target,
                ...(t.when !== undefined
                  ? {
                      guard: ({ context }) =>
                        evaluateExpression(t.when, context.facts.values) !== 0,
                    }
                  : {}),
              },
            ]),
          ]),
        },
      ]),
    );
    return createActor(
      createMachine({
        id: 'vela-web',
        initial: initialScreen,
        context: { facts: resolved },
        states,
      }),
    ).start();
  }, []);
  const [screen, setScreen] = useState(actor.getSnapshot().value);
  const [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false);
  const timer = useRef({ start: 0, elapsed: 0 });
  const entryScreen = useRef(null);
  const sceneScreen = useRef(null);
  const pendingAnchor = useRef(null);
  const main = useRef(null),
    transitions = useRef([]),
    animations = useRef([]),
    animation = useRef(null);
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const region = resolved.regions[screen].screen;
  const p = Object.fromEntries(
    Object.entries(region).filter(([, value]) => typeof value === 'number'),
  );
  const size = (ratio = 1) => p.bodySize * ratio * textScale;
  const accent = preferences.accent === 'lime' ? c.action : c.held,
    onAccent = c[preferences.accent === 'lime' ? 'on-action' : 'on-held'];
  const destination = ['today', 'insights', 'profile'].includes(screen);
  const latestEntry = preferences.entries[0];
  const rail = resolved.values.navRail === 1;
  const effectiveContent = p.contentWidth;
  const persistentActions = p.persistentActions === 1;
  const update = (next) => setPreferences((old) => ({ ...old, ...next }));
  const changeDirection = (direction) => {
    if (direction === (preferences.direction ?? 'momentum')) return;
    const node = document.activeElement;
    if (node instanceof HTMLElement && node.isConnected) {
      let host = node.parentElement;
      while (
        host &&
        !(
          host.scrollHeight > host.clientHeight &&
          /auto|scroll/.test(getComputedStyle(host).overflowY)
        )
      )
        host = host.parentElement;
      host ??= document.scrollingElement;
      pendingAnchor.current = {
        node,
        host,
        before: node.getBoundingClientRect().top,
      };
    }
    update({ direction });
  };
  const nav = (event) => {
    const before = actor.getSnapshot().value;
    actor.send({ type: event });
    const after = actor.getSnapshot().value;
    if (before !== after) {
      transitions.current.push({
        event,
        from: before,
        to: after,
        at: performance.now(),
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };
  const goDestination = (target) => {
    if (screen === target) return;
    if (running) pause();
    const queue = [{ state: screen, events: [] }],
      seen = new Set();
    while (queue.length) {
      const next = queue.shift();
      if (next.state === target) {
        next.events.forEach(nav);
        return;
      }
      if (seen.has(next.state)) continue;
      seen.add(next.state);
      for (const edge of policy.handoff.machine.states.find(
        (s) => s.id === next.state,
      ).on)
        queue.push({
          state: edge.target,
          events: [...next.events, edge.event],
        });
    }
  };
  const start = () => {
    setNotice('');
    setElapsed(0);
    timer.current = { start: performance.now(), elapsed: 0 };
    setRunning(true);
    nav('START');
  };
  const pause = () => {
    const value = Math.min(
      TOTAL,
      timer.current.elapsed + (performance.now() - timer.current.start) / 1000,
    );
    setElapsed(value);
    timer.current.elapsed = value;
    setRunning(false);
  };
  const resume = () => {
    timer.current = { start: performance.now(), elapsed };
    setRunning(true);
  };
  const finish = () => {
    const seconds = running
      ? Math.min(
          TOTAL,
          timer.current.elapsed +
            (performance.now() - timer.current.start) / 1000,
        )
      : elapsed;
    setElapsed(seconds);
    setRunning(false);
    if (seconds === 0) {
      setNotice('No time elapsed. Nothing was added to your journal.');
      nav('DISCARD');
      return;
    }
    const entry = {
      id: crypto.randomUUID(),
      seconds,
      completedAt: new Date().toISOString(),
    };
    setPreferences((old) => ({
      ...old,
      entries: [entry, ...old.entries].slice(0, 50),
    }));
    nav('FINISH');
  };
  useEffect(() => {
    const s = actor.subscribe((state) => setScreen(state.value));
    return () => s.unsubscribe();
  }, [actor]);
  useEffect(() => {
    actor.send({ type: 'REFLOW', facts: resolved });
  }, [actor, resolved]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = (event) => setSystemReduced(event.matches);
    media.addEventListener('change', reduce);
    return () => {
      media.removeEventListener('change', reduce);
    };
  }, []);
  const savePreferences = () => {
    if (restore.status !== 'ready') return;
    try {
      const serialized = JSON.stringify(preferences);
      localStorage.setItem(STORAGE, serialized);
      lastSaved.current = serialized;
      setStorageError('');
    } catch {
      setStorageError(
        'Your changes could not be saved. Keep this tab open to retain them.',
      );
    }
  };
  const retryRestore = () => {
    const result = readStored();
    if (result.status === 'ready') {
      lastSaved.current = JSON.stringify(result.preferences);
      setPreferences(result.preferences);
      setStorageError('');
    }
    setRestore(result);
  };
  useEffect(() => {
    if (
      restore.status === 'ready' &&
      JSON.stringify(preferences) !== lastSaved.current
    )
      savePreferences();
  }, [preferences, restore.status]);
  useEffect(() => {
    if (!running) return;
    const tick = () =>
      setElapsed(
        Math.min(
          TOTAL,
          timer.current.elapsed +
            (performance.now() - timer.current.start) / 1000,
        ),
      );
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [running]);
  useEffect(() => {
    if (elapsed >= TOTAL && running) {
      setRunning(false);
      timer.current.elapsed = TOTAL;
    }
  }, [elapsed, running]);
  useLayoutEffect(() => {
    animation.current?.cancel();
    if (!main.current) return;
    if (entryScreen.current === screen) return;
    main.current.scrollTop = 0;
    entryScreen.current = screen;
    const spring = resolved.motions.page;
    const emitted = reduced
      ? emitMotion({
          motion: { coordinate: { unit: 'opacity', from: 0, to: 1 } },
          channel: 'opacity',
          platform: 'web',
          reducedMotion: true,
          reducedMotionPolicy: 'opacity-fade',
        })
      : emitMotion({
          motion: {
            spring: {
              mass: spring.mass,
              stiffness: spring.stiffness,
              damping: spring.damping,
            },
            coordinate: { unit: 'px', from: p.pageDistance, to: 0 },
            durationSeconds: 2,
            sampleCount: 121,
          },
          channel: 'translateY',
          platform: 'web',
          reducedMotion: false,
        });
    if (emitted.supported && emitted.plan.kind === 'waapi') {
      animation.current = main.current.animate(
        emitted.plan.keyframes,
        emitted.plan.options,
      );
      const record = {
        screen,
        reduced,
        channel: emitted.plan.channel,
        at: performance.now(),
        durationMs: emitted.plan.options.duration,
        keyframes: emitted.plan.keyframes.length,
        spring,
        completed: false,
      };
      animations.current.push(record);
      animation.current.finished
        .then(() => {
          record.completed = true;
        })
        .catch(() => {});
    }
    return () => animation.current?.cancel();
  }, [screen, reduced, policy]);
  useLayoutEffect(() => {
    if (!main.current) return;
    const animateScene = sceneScreen.current !== screen;
    sceneScreen.current = screen;
    return installVelaMotion({
      root: main.current.closest('[data-screen]'),
      main: main.current,
      screen,
      reduced,
      spring: {
        mass: resolved.motions.page.mass,
        stiffness: resolved.motions.page.stiffness,
        damping: resolved.motions.page.damping,
      },
      distance: p.pageDistance,
      ...policy.direction.choreography,
      animateScene,
    });
  }, [screen, reduced, restore.status, policy]);
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    if (
      !anchor?.node.isConnected ||
      !anchor.host?.isConnected ||
      anchor.host.clientHeight <= 0
    )
      return;
    const projection = projectScrollAnchor({
      offset: anchor.host.scrollTop,
      before: anchor.before,
      after: anchor.node.getBoundingClientRect().top,
      extent: anchor.host.scrollHeight,
      viewport: anchor.host.clientHeight,
    });
    anchor.host.scrollTop = projection.offset;
    anchor.node.focus({ preventScroll: true });
    window.__VELA_DIRECTION_SWITCH__ = {
      ...projection,
      direction: policy.direction.id,
      anchorBefore: anchor.before,
      anchorAfter: anchor.node.getBoundingClientRect().top,
      observedOffset: anchor.host.scrollTop,
      scope:
        'Current retained DOM anchor; range clamping may prevent identical viewport position',
    };
  }, [policy]);
  useEffect(() => {
    main.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, [screen]);
  useEffect(() => {
    window.__VELA__ = {
      screen,
      resolved,
      preferences,
      storage: { restore: restore.status, saveError: storageError },
      elapsed,
      running,
      textScale,
      reducedMotion: reduced,
      transitions: transitions.current,
      animations: animations.current,
      policyIdentity: policy.handoff.identity,
      colors: policy.colors,
      direction: policy.direction,
      contentFixture,
    };
    window.__VELA_READY__ = true;
  });

  if (restore.status !== 'ready')
    return (
      <div
        {...sx(
          styles.root,
          styles.surface(c.canvas, c.ink),
          styles.pane(p.pageGutter),
        )}
      >
        <main {...sx(styles.column, styles.gap(p.gap))}>
          <h1 {...sx(styles.title(size(1.4)))}>
            Your journal could not be restored.
          </h1>
          <p role="alert" {...sx(styles.text(size(), c.ink))}>
            Saving is paused to protect your existing data. Retry restoring your
            journal to continue.
          </p>
          <button
            {...sx(
              styles.button(accent, onAccent, p.radius, size(), p.gap, p.gap),
            )}
            onClick={retryRestore}
          >
            Retry restore
          </button>
        </main>
      </div>
    );

  const sessionCard = (
    <Card
      color={c.held}
      ink={c['on-held']}
      data-color="cobalt"
      data-region="session-card"
    >
      <div {...sx(styles.row, styles.between, styles.gap(p.gap))}>
        <span {...sx(styles.badge('transparent', c['on-held'], size(0.72)))}>
          Intervals · all levels
        </span>
        <Icon name="arrow" size={28} />
      </div>
      <div {...sx(styles.row, styles.gap(p.gap))}>
        <p {...sx(styles.numeral(p.sessionNumeralSize * textScale))}>22</p>
        <Text ratio={0.9}>
          minutes
          <br />
          for yourself
        </Text>
      </div>
      <h2 {...sx(styles.title(size(1.9)))}>The steady build.</h2>
      <Trace height={p.gap * 5.5} />
      <Text ratio={0.88}>
        {contentText('session-description', p, policy, contentFixture)}
      </Text>
    </Card>
  );

  return (
    <Ui.Provider
      value={{
        p,
        size,
        accent,
        onAccent,
        screen,
        destination,
        goDestination,
        direction: policy.direction,
        policy,
        contentFixture,
      }}
    >
      <div
        {...sx(styles.root, styles.surface(c.canvas, c.ink))}
        data-screen={screen}
        data-direction={policy.direction.id}
        data-color="canvas"
        data-testid="vela-screen"
      >
        <a href="#main" className="skip">
          Skip to main content
        </a>
        <div {...sx(styles.layout, persistentActions && styles.focusedLayout)}>
          {rail && (
            <aside
              {...sx(
                styles.rail(resolved.values.navRailWidth, p.gap, p.pageGutter),
              )}
            >
              <div {...sx(styles.brand)}>
                <Icon name="today" size={32} />
                vela
              </div>
              <Navigation vertical />
              <div {...sx(styles.fill)} />
              <Text muted ratio={0.72}>
                A little more
                <br />
                you, every day.
              </Text>
            </aside>
          )}
          <div
            {...sx(
              styles.pane(p.pageGutter),
              persistentActions && styles.focusedPane,
            )}
          >
            <div
              {...sx(
                styles.content(effectiveContent),
                persistentActions && styles.focusedFrame,
              )}
            >
              <header
                {...sx(
                  styles.header(p.gap),
                  persistentActions && styles.fixedHeader,
                )}
              >
                {!rail ? (
                  <div {...sx(styles.brand)}>
                    <Icon name="today" size={32} />
                    vela
                  </div>
                ) : (
                  <Text muted ratio={0.82}>
                    Your training journal
                  </Text>
                )}
                <div {...sx(styles.row, styles.gap(p.gap))}>
                  <button
                    aria-label="Change art direction"
                    data-direction-toggle
                    {...sx(styles.plainButton(c.ink, size(0.75)))}
                    onClick={() =>
                      changeDirection(
                        preferences.direction === 'field-notes'
                          ? 'momentum'
                          : 'field-notes',
                      )
                    }
                  >
                    {policy.direction.label}
                  </button>
                  {!destination && (
                    <button
                      aria-label="Back"
                      {...sx(styles.plainButton(c.ink, size()))}
                      onClick={() => {
                        setRunning(false);
                        nav(screen === 'complete' ? 'DONE' : 'BACK');
                      }}
                    >
                      <Icon name="back" />
                    </button>
                  )}
                </div>
              </header>
              {notice && (
                <p role="status" {...sx(styles.text(size(), c.muted))}>
                  {notice}
                </p>
              )}
              {storageError && (
                <div {...sx(styles.error, styles.column, styles.gap(p.gap))}>
                  <p role="alert" {...sx(styles.text(size(), c.ink))}>
                    {storageError}
                  </p>
                  <Button onClick={savePreferences}>Retry save</Button>
                </div>
              )}

              <main
                id="main"
                ref={main}
                {...sx(
                  styles.screen,
                  persistentActions && styles.focusedScroll,
                )}
                data-focus-scroll={persistentActions || undefined}
              >
                <div
                  {...sx(
                    styles.screen,
                    styles.gap(p.sectionGap),
                    styles.scrollContents,
                  )}
                >
                  {screen === 'today' && (
                    <>
                      <div
                        {...sx(styles.grid(Boolean(p.paired), p.sectionGap))}
                      >
                        <div
                          {...sx(styles.column, styles.fill, styles.gap(p.gap))}
                          data-region="intro"
                        >
                          {p.heroActionFirst === 1 && (
                            <Button onClick={() => nav('OPEN_SESSION')}>
                              Open session
                            </Button>
                          )}
                          <ContentHeading contentId="today" />
                          <Text muted>
                            {contentText(
                              'intro-description',
                              p,
                              policy,
                              contentFixture,
                            )}
                          </Text>
                          {p.heroActionFirst !== 1 && (
                            <>
                              <div {...sx(styles.fill)} />
                              <Button onClick={() => nav('OPEN_SESSION')}>
                                Open session
                              </Button>
                            </>
                          )}
                        </div>
                        <div {...sx(styles.fill)}>{sessionCard}</div>
                      </div>
                      <div
                        {...sx(styles.grid(Boolean(p.paired), p.sectionGap))}
                      >
                        <section
                          {...sx(styles.column, styles.fill, styles.gap(p.gap))}
                          data-region="check-in"
                        >
                          <h2 {...sx(styles.title(size(1.45)))}>
                            Meet yourself where you are.
                          </h2>
                          <Text muted ratio={0.9}>
                            How do you want to move today?
                          </Text>
                          <div {...sx(styles.row, styles.gap(p.gap * 0.5))}>
                            {[
                              ['easy', 'Easy'],
                              ['steady', 'Steady'],
                              ['energized', 'Energized'],
                            ].map(([id, label]) => (
                              <button
                                key={id}
                                {...sx(
                                  styles.choice(
                                    preferences.checkIn === id,
                                    c.ink,
                                    size(0.85),
                                    p.radius * 0.6,
                                  ),
                                )}
                                aria-pressed={preferences.checkIn === id}
                                onClick={() => update({ checkIn: id })}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <Text muted ratio={0.74}>
                            {preferences.checkIn
                              ? storageError
                                ? 'Check-in kept in this tab. Retry saving to store it on this device.'
                                : 'Check-in saved on this device. Your pace is your choice.'
                              : 'A personal check-in, not a health assessment.'}
                          </Text>
                        </section>
                        <section
                          {...sx(styles.column, styles.fill, styles.gap(p.gap))}
                          data-region="journal"
                        >
                          <h2 {...sx(styles.title(size(1.45)))}>
                            Small starts add up.
                          </h2>
                          <Text muted>
                            {preferences.entries.length
                              ? `${preferences.entries.length} session${preferences.entries.length === 1 ? '' : 's'} in your local journal.`
                              : 'Your first session is a fresh start. Finish one and it will appear in your journal.'}
                          </Text>
                          <button
                            {...sx(
                              styles.plainButton(c.action, size(0.9)),
                              styles.row,
                            )}
                            onClick={() => nav('INSIGHTS')}
                          >
                            See your rhythm <Icon name="arrow" />
                          </button>
                        </section>
                      </div>
                    </>
                  )}
                  {screen === 'detail' && (
                    <>
                      <div
                        {...sx(styles.grid(Boolean(p.paired), p.sectionGap))}
                      >
                        <div
                          {...sx(styles.column, styles.fill, styles.gap(p.gap))}
                        >
                          <ContentHeading contentId="detail" />
                          <Text muted>
                            A 22-minute interval session. Walk, jog, cycle, or
                            move in a way that works for you.
                          </Text>
                          <Text ratio={0.85}>
                            No equipment or pace target required. Adjust or stop
                            whenever you need.
                          </Text>
                        </div>
                      </div>
                      <section data-region="session-plan">
                        <h2 {...sx(styles.title(size(1.6)))}>
                          Your 22 minutes.
                        </h2>
                        <Phases />
                        <div style={{ color: c.held }}>
                          <Trace height={p.gap * 3} />
                        </div>
                      </section>
                    </>
                  )}
                  {screen === 'active' && (
                    <>
                      <div
                        {...sx(styles.grid(Boolean(p.paired), p.sectionGap))}
                      >
                        <div
                          {...sx(styles.column, styles.fill, styles.gap(p.gap))}
                        >
                          <Heading>
                            {contentText(
                              `phase-${elapsed < 240 ? 0 : elapsed < 960 ? 1 : 2}`,
                              p,
                              policy,
                              contentFixture,
                            )}
                          </Heading>
                          <Text muted>
                            {elapsed < 240
                              ? PHASES[0].note
                              : elapsed < 960
                                ? PHASES[1].note
                                : PHASES[2].note}
                          </Text>
                          <Timer seconds={TOTAL - elapsed} label="remaining" />
                          <Text muted ratio={0.8}>
                            {running
                              ? 'Session in progress'
                              : elapsed >= TOTAL
                                ? 'Session complete — save it when you’re ready.'
                                : 'Paused — take your time.'}
                          </Text>
                        </div>
                        <Card
                          color={c.held}
                          ink={c['on-held']}
                          data-region="current-interval"
                        >
                          <Text heavy>
                            {contentText(
                              `phase-${elapsed < 240 ? 0 : elapsed < 960 ? 1 : 2}`,
                              p,
                              policy,
                              contentFixture,
                            )}
                          </Text>
                          <Trace height={p.gap * 7} />
                          <Text>
                            Let the timer hold the time.
                            <br />
                            You set the pace.
                          </Text>
                          <Text ratio={0.75}>
                            Illustrated interval pattern; no physiological
                            measurement.
                          </Text>
                        </Card>
                      </div>
                      <Phases />
                    </>
                  )}
                  {screen === 'complete' && (
                    <>
                      <div
                        {...sx(styles.grid(Boolean(p.paired), p.sectionGap))}
                      >
                        <div
                          {...sx(styles.column, styles.fill, styles.gap(p.gap))}
                        >
                          <ContentHeading
                            contentId={
                              latestEntry ? 'complete' : 'complete-empty'
                            }
                          />
                          <Text muted>
                            {latestEntry
                              ? 'That counts. Take a breath and carry a little of this feeling with you.'
                              : 'Start a session when you are ready. Only elapsed time is added to your journal.'}
                          </Text>
                        </div>
                        {latestEntry && (
                          <Card
                            color={c.action}
                            ink={c['on-action']}
                            data-region="saved-session"
                            data-color="lime"
                          >
                            <Icon name="check" size={48} />
                            <Timer
                              seconds={latestEntry.seconds}
                              label="elapsed"
                            />
                            <Text heavy>The steady build</Text>
                            <Text ratio={0.86}>
                              {storageError
                                ? 'Kept in this tab. Retry saving to store it on this device.'
                                : 'Saved to your local journal.'}
                            </Text>
                          </Card>
                        )}
                      </div>
                    </>
                  )}
                  {screen === 'insights' && (
                    <>
                      <section {...sx(styles.column, styles.gap(p.gap))}>
                        <ContentHeading contentId="insights" />
                        <Text muted>
                          Consistency has room for pauses. Notice what feels
                          good and make space for more of it.
                        </Text>
                      </section>
                      <section data-region="local-history">
                        <h2 {...sx(styles.title(size(1.5)))}>
                          Your local journal
                        </h2>
                        {preferences.entries.length ? (
                          preferences.entries.map((entry) => (
                            <div key={entry.id} {...sx(styles.phase(p.gap))}>
                              <div
                                {...sx(styles.column, styles.gap(p.gap * 0.3))}
                              >
                                <Text heavy>The steady build</Text>
                                <Text muted ratio={0.78}>
                                  {new Date(
                                    entry.completedAt,
                                  ).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </Text>
                              </div>
                              <Text>
                                {entry.seconds < 1
                                  ? 'Less than 1 second'
                                  : clock(entry.seconds)}
                              </Text>
                            </div>
                          ))
                        ) : (
                          <p {...sx(styles.text(size(), c.muted))}>
                            Nothing logged yet. Your first finished session will
                            appear here.
                          </p>
                        )}
                        <Button
                          onClick={() => {
                            goDestination('today');
                            nav('OPEN_SESSION');
                          }}
                        >
                          Open session
                        </Button>
                      </section>
                      <section {...sx(styles.column, styles.gap(p.gap))}>
                        <Text muted ratio={0.8}>
                          An illustrative week. These sample minutes are
                          separate from your local journal.
                        </Text>
                        <Card data-region="sample-week">
                          <div
                            {...sx(
                              styles.row,
                              styles.between,
                              styles.gap(p.gap),
                            )}
                          >
                            <Text heavy>Sample week</Text>
                            <span
                              {...sx(
                                styles.badge(c.canvas, c.muted, size(0.7)),
                              )}
                            >
                              ILLUSTRATIVE
                            </span>
                          </div>
                          <div {...sx(styles.row, styles.gap(p.gap))}>
                            <p {...sx(styles.numeral(size(2.2)))}>76</p>
                            <Text muted>
                              minutes
                              <br />
                              in motion
                            </Text>
                          </div>
                          <div
                            {...sx(styles.chart(p.gap * 0.6))}
                            role="img"
                            aria-label="Sample week: Monday 18, Tuesday 0, Wednesday 24, Thursday 12, Friday 0, Saturday 22, Sunday 0 minutes"
                          >
                            {SAMPLE_WEEK.map((minutes, i) => (
                              <div key={i} {...sx(styles.chartColumn)}>
                                <div
                                  {...sx(
                                    styles.chartBar(
                                      minutes * 5,
                                      i === 5 ? c.action : c.held,
                                    ),
                                  )}
                                />
                                <span {...sx(styles.text(size(0.65), c.muted))}>
                                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </section>
                    </>
                  )}
                  {screen === 'profile' && (
                    <>
                      <div>
                        <ContentHeading contentId="profile" />
                        <Text muted>
                          Your preferences, your pace.
                          <br />
                          Stored on this device.
                        </Text>
                      </div>
                      <div
                        {...sx(styles.grid(Boolean(p.paired), p.sectionGap))}
                      >
                        <Card data-region="motion-settings">
                          <h2 {...sx(styles.title(size(1.5)))}>Motion</h2>
                          <Text muted ratio={0.9}>
                            Follow your system setting, or keep transitions
                            quiet.
                          </Text>
                          {[
                            ['system', 'Follow system'],
                            ['reduced', 'Reduce motion'],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              {...sx(
                                styles.choice(
                                  preferences.motion === value,
                                  c.ink,
                                  size(),
                                  p.radius * 0.6,
                                ),
                              )}
                              aria-pressed={preferences.motion === value}
                              onClick={() => update({ motion: value })}
                            >
                              {label}
                            </button>
                          ))}
                          <Text muted ratio={0.76}>
                            {reduced
                              ? 'Reduced motion is active. Pages fade without moving.'
                              : 'Spring transitions are active.'}
                          </Text>
                        </Card>
                        <Card data-region="appearance-settings">
                          <h2 {...sx(styles.title(size(1.5)))}>
                            Art direction
                          </h2>
                          {Object.entries(directionPolicies).map(
                            ([id, candidate]) => (
                              <button
                                key={id}
                                data-direction-choice={id}
                                aria-label={candidate.direction.label}
                                aria-pressed={
                                  (preferences.direction ?? 'momentum') === id
                                }
                                {...sx(
                                  styles.choice(
                                    (preferences.direction ?? 'momentum') ===
                                      id,
                                    c.ink,
                                    size(),
                                    p.radius * 0.6,
                                  ),
                                )}
                                onClick={() => changeDirection(id)}
                              >
                                {p.compactDirectionLabels
                                  ? candidate.direction.shortLabel
                                  : candidate.direction.label}
                              </button>
                            ),
                          )}
                          <h3 {...sx(styles.title(size(1.1)))}>Action color</h3>
                          <Text muted ratio={0.9}>
                            Choose the color that gets you moving.
                          </Text>
                          {[
                            ['lime', policy.direction.actionLabel],
                            ['cobalt', policy.direction.heldLabel],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              {...sx(
                                styles.button(
                                  value === 'lime' ? c.action : c.held,
                                  c[value === 'lime' ? 'on-action' : 'on-held'],
                                  p.radius * 0.65,
                                  size(),
                                  p.pageGutter,
                                  p.gap,
                                ),
                              )}
                              aria-pressed={preferences.accent === value}
                              onClick={() => update({ accent: value })}
                            >
                              <span>{label}</span>
                              {preferences.accent === value && (
                                <Icon name="check" />
                              )}
                            </button>
                          ))}
                        </Card>
                      </div>
                      <Text muted ratio={0.8}>
                        Vela is a local training journal. It does not assess
                        health, prescribe exercise, or sync your data to a
                        server.
                      </Text>
                    </>
                  )}
                </div>
              </main>
              {persistentActions && (
                <div
                  data-action-dock
                  aria-label="Session actions"
                  {...sx(styles.actionDock(p.actionDockMaxHeight, p.gap))}
                >
                  {screen === 'detail' && (
                    <Button onClick={start} icon="play" data-primary-action>
                      Start session
                    </Button>
                  )}
                  {screen === 'active' && (
                    <>
                      <Button
                        onClick={running ? pause : resume}
                        icon={running ? 'pause' : 'play'}
                        data-primary-action
                      >
                        {running ? 'Pause' : 'Resume'}
                      </Button>
                      <Button onClick={finish} secondary icon="check">
                        Finish session
                      </Button>
                    </>
                  )}
                  {screen === 'complete' && (
                    <>
                      <Button
                        onClick={() => nav('DONE')}
                        icon="check"
                        data-primary-action
                      >
                        Back to today
                      </Button>
                      <Button onClick={() => nav('INSIGHTS')} secondary>
                        View your journal
                      </Button>
                    </>
                  )}
                </div>
              )}
              {destination && !rail && <Navigation />}
              {!persistentActions && (
                <footer {...sx(styles.footer(p.gap, size(0.68)))}>
                  <span>Vela — a little more you.</span>
                  <span>Local first. Move at your own pace.</span>
                </footer>
              )}
            </div>
          </div>
        </div>
      </div>
    </Ui.Provider>
  );
}

// Scenario dimensions are test samples, not a responsive admission boundary.
// Only unavailable/nonfinite geometry is deferred; every positive viewport reflows.
function readAvailableViewport() {
  const value = { width: innerWidth, height: innerHeight };
  const available =
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0;
  if (available) return { value, reason: null };
  const reason = 'unavailable-geometry';
  window.__VELA_VIEWPORT_REJECTIONS__ = [
    ...(window.__VELA_VIEWPORT_REJECTIONS__ ?? []).slice(-49),
    { ...value, reason, at: performance.now() },
  ];
  return { value, reason };
}
function ViewportBoundary() {
  const [boundary, setBoundary] = useState(() => {
    const observed = readAvailableViewport();
    return { ...observed, accepted: observed.reason ? null : observed.value };
  });
  useEffect(() => {
    const resize = () => {
      const next = readAvailableViewport();
      setBoundary((current) =>
        Object.is(current.value.width, next.value.width) &&
        Object.is(current.value.height, next.value.height) &&
        current.reason === next.reason
          ? current
          : { ...next, accepted: next.reason ? current.accepted : next.value },
      );
    };
    addEventListener('resize', resize);
    resize();
    return () => removeEventListener('resize', resize);
  }, []);
  const status = !boundary.reason
    ? 'current'
    : boundary.accepted
      ? 'held'
      : 'unavailable';
  window.__VELA_VIEWPORT_BOUNDARY__ = {
    status,
    reason: boundary.reason,
    current: boundary.value,
    accepted: boundary.accepted,
  };
  return (
    <>
      {boundary.reason && (
        <p
          role="status"
          data-waiting-viewport
          data-viewport-status={status}
          style={
            boundary.accepted
              ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  margin: 0,
                  padding: 12,
                  background: c.canvas,
                  color: c.ink,
                }
              : undefined
          }
        >
          Window dimensions are temporarily unavailable.
        </p>
      )}
      {boundary.accepted && <Vela viewport={boundary.accepted} />}
    </>
  );
}
createRoot(document.getElementById('root')).render(<ViewportBoundary />);
