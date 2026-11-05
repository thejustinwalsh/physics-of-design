import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { html, css } from 'react-strict-dom';
import {
  Platform,
  StatusBar,
  useWindowDimensions,
  BackHandler,
  Linking,
  AccessibilityInfo,
  AppState as NativeAppState,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import fixture from '../../../../experiments/relay/shared/fixtures.json';
import resolved from './design/resolved.json';
import {
  initialState,
  mutate,
  restore,
  active,
  latest,
  serviceStatus,
  emptyTable,
  rowsFor,
  validateRule,
} from './model.mjs';
import { storage, exportState } from './storage';
import { useObservations } from './useObservations';
import ElementInspection, { useElementInspection } from './ElementInspection';
import InspectorPanel from './InspectorPanel';
import Scroll from './Scroll';
import PlotInteraction from './PlotInteraction';
import Screen from './Screen';
import { ScreenContext } from './ScreenContext';
import { useKeyboard } from './useKeyboard';
import MediaImage from './MediaImage';
import Materials from './Materials';
import FontAxes from './FontAxes';
import fontAxes from './design/font-axes.json';
import specialists from './design/specialist-values.json';
import staged from './design/staged-values.json';
import {
  resolveRelayFrame,
  inspectRelayFrame,
} from './design/layout-policy.mjs';
import PlotCursor from './PlotCursor';
import { subscribeFrame, clockStats } from './clock.mjs';
import {
  UI,
  chosen,
  themes,
  styles,
  Text,
  Heading,
  Row,
  Column,
  Button,
  Panel,
  Badge,
  Field,
  Choice,
  Modal,
  format,
} from './ui';
const Data = createContext(null),
  useData = () => useContext(Data);
const destinations = [
  ['overview', '◈', 'Overview'],
  ['services', '▦', 'Services'],
  ['incidents', '◎', 'Incidents'],
  ['traces', '≋', 'Traces'],
  ['alerts', '♧', 'Alert rules'],
  ['settings', '⚙', 'Settings'],
];
const layout = css.create({
  root: {
    boxSizing: 'border-box',
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  safe: (top, bottom, left, right) => ({
    paddingTop: top,
    paddingBottom: bottom,
    paddingLeft: left,
    paddingRight: right,
  }),
  shell: {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  rail: (bg, line, width, gap) => ({
    boxSizing: 'border-box',
    flexShrink: 0,
    width,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap,
    backgroundColor: bg,
    borderRightColor: line,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
  }),
  main: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 0,
  },
  toolbar: (bg, line, spacing) => ({
    boxSizing: 'border-box',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing,
    padding: spacing,
    backgroundColor: bg,
    borderBottomColor: line,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
  }),
  content: (padding, gap) => ({
    display: 'flex',
    flexDirection: 'column',
    gap,
    padding,
    minWidth: 0,
  }),
  navMobile: (bg, line, gap) => ({
    boxSizing: 'border-box',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap,
    padding: 6,
    backgroundColor: bg,
    borderTopColor: line,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
  }),
  navButton: { flexGrow: 1, flexBasis: 75 },
  hero: (bg, line, gap) => ({
    display: 'flex',
    flexDirection: 'column',
    gap,
    padding: gap,
    borderColor: line,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 10,
    backgroundColor: bg,
  }),
  metric: {
    flexGrow: 1,
    flexBasis: 140,
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  tableRow: (line, padding) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingBlock: padding,
    paddingInline: 4,
    borderBottomColor: line,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
  }),
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flexBasis: 130,
    flexGrow: 1,
    minWidth: 100,
  },
  rowTitle: (basis) => ({ flexBasis: basis, flexGrow: 2, minWidth: 180 }),
  notice: (bg) => ({ padding: 10, backgroundColor: bg }),
  buttonNav: { justifyContent: 'flex-start', width: '100%' },
  note: {
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: '#66d9ed',
    paddingLeft: 14,
  },
  axis: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  traceChoice: { width: '100%', justifyContent: 'flex-start' },
  loading: { height: 100, backgroundColor: '#263d4b', borderRadius: 8 },
  startup: (background, color) => ({
    backgroundColor: background,
    color,
    padding: 16,
    gap: 16,
  }),
  startupLabel: { fontSize: 14, lineHeight: 1.4, margin: 0 },
});
const initialRoute = () =>
  Platform.OS === 'web'
    ? globalThis.location.hash.slice(1) || '/overview'
    : '/overview';
function Root() {
  const measuredRoot = useContext(ScreenContext);
  const keyboard = useKeyboard();
  const [storagePaused, setStoragePaused] = useState(false);
  const safeArea = useSafeAreaInsets(),
    viewport = useWindowDimensions();
  const [loaded, fontError] = useFonts({
    RelayUI: require('../../../../assets/fonts/RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf'),
  });
  const [state, setState] = useState(() => initialState(fixture)),
    [hydrated, setHydrated] = useState(false),
    [message, setMessage] = useState(''),
    [storageMode, setStorageMode] = useState('loading'),
    [failStorage, setFailStorage] = useState(false),
    [route, setRoute] = useState(initialRoute),
    [history, setHistory] = useState([]),
    [command, setCommand] = useState(false),
    [inspect, setInspect] = useState(/** @type {boolean|string} */ (false)),
    [systemReduced, setSystemReduced] = useState(false),
    [foreground, setForeground] = useState(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const speak = (text) => {
    setMessage(text);
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(text);
  };
  useEffect(() => {
    let alive = true;
    storage
      .read()
      .then((raw) => {
        if (!alive) return;
        if (raw) setState(restore(raw, fixture));
        setStorageMode('saved locally');
      })
      .catch((e) => {
        if (alive) {
          setStoragePaused(true);
          setStorageMode('in-memory fallback');
          speak(
            'Storage unavailable: ' +
              e.message +
              '. Session is in memory; export is available.',
          );
        }
      })
      .finally(() => {
        if (alive) setHydrated(true);
      });
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduced);
    const reduced = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduced,
    );
    const app = NativeAppState.addEventListener('change', (value) =>
      setForeground(value === 'active'),
    );
    return () => {
      alive = false;
      reduced.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    if (!hydrated || storagePaused) return;
    let alive = true;
    Promise.resolve()
      .then(() => {
        if (failStorage) throw Error('Simulated storage failure');
        return storage.write(JSON.stringify(state));
      })
      .then(() => {
        if (alive) setStorageMode('saved locally');
      })
      .catch(() => {
        if (alive) {
          setStorageMode('in-memory fallback');
          speak(
            'Storage unavailable. Changes are in memory; export before closing.',
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [state, hydrated, failStorage, storagePaused]);
  const dispatch = (action, announcement = '') => {
    try {
      const next = mutate(stateRef.current, action);
      stateRef.current = next;
      setState(next);
      if (announcement) speak(announcement + ' · local demo only');
      return true;
    } catch (e) {
      speak(e.message);
      return false;
    }
  };
  const routeFocus = useRef({});
  const nav = (next) => {
    if (next === route) return;
    if (Platform.OS === 'web')
      routeFocus.current[route] =
        document.activeElement?.getAttribute('data-testid');
    setHistory((h) => [...h, route]);
    setRoute(next);
    if (Platform.OS === 'web') globalThis.location.hash = next;
  };
  const back = () => {
    setHistory((h) => {
      const next = h.at(-1) ?? '/overview';
      setRoute(next);
      if (Platform.OS === 'web') globalThis.history.back();
      return h.slice(0, -1);
    });
  };
  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setRoute(initialRoute());
      addEventListener('hashchange', update);
      return () => removeEventListener('hashchange', update);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (command) {
        setCommand(false);
        return true;
      }
      if (route !== '/overview') {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [route, command]);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const keys = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setCommand((v) => !v);
        }
        if (
          e.key === '/' &&
          !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
        ) {
          e.preventDefault();
          document.querySelector('[data-testid="local-search"]')?.['focus']?.();
        }
      };
      addEventListener('keydown', keys);
      return () => removeEventListener('keydown', keys);
    }
    const sub = Linking.addEventListener('url', ({ url }) => {
      const p = url.split('/--/')[1];
      if (p) nav('/' + p);
    });
    Linking.getInitialURL().then((url) => {
      const p = url?.split('/--/')[1];
      if (p) setRoute('/' + p);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title =
        'Relay · ' +
        (destinations.find((d) => route.startsWith('/' + d[0]))?.[2] ??
          'Investigation');
      const frame = requestAnimationFrame(() => {
        const id = routeFocus.current[route];
        const target =
          (id ? document.querySelector(`[data-testid="${id}"]`) : null) ??
          document.querySelector('[data-testid="page-heading"]');
        target?.['focus']?.({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [route]);
  const scale = state.preferences.textScale ?? 1,
    size = staged.fontSize * scale,
    t = themes[state.preferences.theme] ?? themes.dark,
    geometry = resolveRelayFrame({
      width:
        (measuredRoot?.width ?? viewport.width) -
        safeArea.left -
        safeArea.right,
      textScale: scale * (viewport.fontScale || 1),
      fontSize: staged.fontSize,
      railWidth: staged.railWidth,
      baseGap: chosen['workspace.gap'],
      padding: chosen['workspace.inlinePadding'],
    }),
    gap =
      geometry.status === 'predicted'
        ? geometry.values.gap
        : chosen['workspace.gap'],
    wide = geometry.status === 'predicted' && geometry.values.wide === 1,
    phone = geometry.status !== 'predicted' || geometry.values.phone === 1;
  const primary = state.data.incidents.find((i) => i.id === 'INC-1042');
  const snapshot = {
    phase: 'relay-app',
    platform: Platform.OS === 'web' ? 'web' : 'native-' + Platform.OS,
    viewport,
    safeArea,
    measuredRoot,
    geometry: {
      ...geometry,
      inputProvider: measuredRoot
        ? measuredRoot.provider + '-minus-applied-safe-padding'
        : 'pending-root-nominal-window-minus-safe-insets',
      rootInputStatus: measuredRoot?.status ?? 'pending',
      rendererRootObserved: measuredRoot?.status === 'current',
      rendererRootVerified: false,
    },
    route,
    sourceIdentity: process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound',
    designIdentity: resolved.identities.design,
    inputIdentity: resolved.inputIdentity,
    resultIdentity: resolved.resultIdentity,
    stagedWorkflowIdentity: staged.workflowIdentity,
    stagedResultIdentity: staged.resultIdentity,
    context: state.context,
    preferences: state.preferences,
    storageMode,
    hydrated,
    fontLoaded: loaded,
    activeCount: active(state).length,
    unassignedCount: active(state).filter((i) => !i.assigneeId).length,
    primary,
    alert001: state.data.alertRules[0],
    alertRules: state.data.alertRules,
    audit: state.data.auditLog,
    service001: latest(state, 'service-001'),
    tableState: state.tables,
    traceSelections: state.traceSelections ?? {},
    savedViews: state.data.savedViews,
    recovery: state.recovery,
    foreground,
    clock: clockStats(),
    motion: globalThis.__RELAY_MOTION__?.() ?? [],
  };
  const observations = useObservations(snapshot);
  const bind = observations.bind;
  const ui = {
    t,
    size,
    scale,
    bind,
    observations,
    inspectionInputKey: JSON.stringify({
      geometry: geometry.inputs,
      route,
      preferences: state.preferences,
      context: state.context,
      auditRevision: state.data.auditLog.length,
      fontLoaded: loaded,
      hydrated,
    }),
    phone,
    wide,
    viewport,
    geometry,
    measuredRoot,
    gap,
    reduced: systemReduced || state.preferences.reducedMotion === 'reduce',
    foreground,
    keyboard,
  };
  const data = {
    state,
    dispatch,
    nav,
    back,
    route,
    speak,
    storageMode,
    setFailStorage,
    failStorage,
    openInspection: () => setInspect(true),
    storagePaused,
    setStoragePaused,
    setStorageMode,
  };
  const navUI = (
    <>
      {destinations.map(([id, icon, name]) => (
        <Button
          key={id}
          id={'nav-' + id}
          active={route.startsWith('/' + id)}
          onPress={() => nav('/' + id)}
          style={wide ? layout.buttonNav : layout.navButton}
        >
          {wide ? `${icon}  ${name}` : name}
        </Button>
      ))}
    </>
  );
  // Mount custom-font text only after registration so its first native layout
  // uses the intended face. The startup frame uses the platform's default font.
  if (!loaded)
    return (
      <>
        <StatusBar
          barStyle={
            state.preferences.theme === 'dark'
              ? 'light-content'
              : 'dark-content'
          }
        />
        <html.div
          data-testid="relay-startup"
          ref={bind('relay-startup')}
          style={[
            layout.root,
            layout.startup(t.canvas, t.ink),
            layout.safe(
              safeArea.top,
              safeArea.bottom,
              safeArea.left,
              safeArea.right,
            ),
          ]}
        >
          <html.p role="status" style={layout.startupLabel}>
            Loading Relay…
          </html.p>
          <html.div style={layout.loading} />
          <html.div style={layout.loading} />
          <html.div style={layout.loading} />
        </html.div>
      </>
    );
  return (
    <UI.Provider value={ui}>
      <Data.Provider value={data}>
        <StatusBar
          barStyle={
            state.preferences.theme === 'dark'
              ? 'light-content'
              : 'dark-content'
          }
        />
        <html.div
          data-layoutconformance="strict"
          data-testid="relay-root"
          ref={bind('relay-root')}
          style={[
            layout.root,
            styles.theme(
              t.canvas,
              t.ink,
              size,
              chosen['service-row.lineHeightRatio'],
              chosen['service-row.letterSpacing'],
            ),
            layout.safe(
              safeArea.top,
              safeArea.bottom,
              safeArea.left,
              safeArea.right,
            ),
          ]}
        >
          {loaded && hydrated && (
            <Materials
              route={route}
              theme={state.preferences.theme}
              reduced={ui.reduced}
            />
          )}
          <FontAxes axes={state.preferences.axes} />
          <html.div style={[layout.shell, styles.space(gap)]}>
            {wide && (
              <html.nav
                data-testid="relay-navigation"
                ref={bind('relay-navigation')}
                aria-label="Destinations"
                style={layout.rail(t.panel, t.line, staged.railWidth, gap)}
              >
                <Text size={30} weight="700">
                  relay /
                </Text>
                <Text tone="muted" size={12}>
                  OPERATIONS WORKSPACE
                </Text>
                <html.div style={styles.height(16)} />
                {navUI}
                <html.div style={styles.grow} />
                <Text tone="muted" size={12}>
                  Demo · synthetic data
                </Text>
                <Text tone="muted" size={12}>
                  24 OCT 2026 · 18:00 UTC
                </Text>
                <Button id="inspect-open" onPress={() => setInspect(true)}>
                  Inspect surface
                </Button>
              </html.nav>
            )}
            <html.div style={layout.main}>
              <html.header
                data-testid="relay-context-toolbar"
                ref={bind('relay-context-toolbar')}
                style={layout.toolbar(
                  t.panel,
                  t.line,
                  chosen['workspace.inlinePadding'],
                )}
              >
                {keyboard.visible ? (
                  <>
                    <Button id="keyboard-dismiss" onPress={keyboard.dismiss}>
                      Done editing
                    </Button>
                    <Text tone="muted">
                      {state.context.range}m · Editing locally
                    </Text>
                    <html.div style={styles.grow} />
                  </>
                ) : (
                  <>
                    {!wide && (
                      <Text size={23} weight="700">
                        relay /
                      </Text>
                    )}
                    <Text tone="muted">Demo · synthetic data</Text>
                    <html.div style={styles.grow} />
                    <Text tone="muted" size={12}>
                      {state.context.environment} ·{' '}
                      {state.context.team === 'all'
                        ? 'all teams'
                        : state.data.teams.find(
                            (x) => x.id === state.context.team,
                          )?.name}
                    </Text>
                    <Row>
                      {phone ? (
                        <Button
                          id="phone-range"
                          onPress={() => setInspect('range')}
                        >
                          {state.context.range === 60
                            ? '1h'
                            : state.context.range === 240
                              ? '4h'
                              : '15m'}{' '}
                          ▾
                        </Button>
                      ) : (
                        [15, 60, 240].map((n) => (
                          <Button
                            key={n}
                            id={'range-' + n}
                            active={state.context.range === n}
                            onPress={() =>
                              dispatch({
                                type: 'context',
                                patch: { range: n, bucket: 47 },
                              })
                            }
                          >
                            {n === 15 ? '15m' : n === 60 ? '1h' : '4h'}
                          </Button>
                        ))
                      )}
                      <Button
                        id="command-open"
                        onPress={() => setCommand(true)}
                        label="Open command search"
                      >
                        Search {wide ? '⌘ K' : '⌕'}
                      </Button>
                      <Button
                        id="global-filters-open"
                        onPress={() => setInspect('filters')}
                      >
                        Filters
                      </Button>
                    </Row>
                  </>
                )}
              </html.header>
              {state.recovery === 'offline' && (
                <html.div style={layout.notice(t.raised)}>
                  <Text>
                    Offline demo · content available · mutations saved locally
                  </Text>
                </html.div>
              )}
              <Scroll routeKey={route}>
                <html.main
                  data-testid="relay-workspace"
                  ref={bind('relay-workspace')}
                  style={layout.content(chosen['workspace.inlinePadding'], gap)}
                >
                  {!hydrated || (!loaded && !fontError) ? (
                    <Panel title="Loading local workspace">
                      <html.div style={layout.loading} />
                      <Text>
                        Reading local demo state and licensed UI font…
                      </Text>
                    </Panel>
                  ) : state.recovery === 'loading' ? (
                    <Panel title="Demo loading state">
                      <html.div style={layout.loading} />
                      <Text>
                        Structure reserved; no fresh telemetry is claimed.
                      </Text>
                      <Button
                        id="loading-finish"
                        onPress={() =>
                          dispatch({ type: 'recovery', value: 'ready' })
                        }
                      >
                        Finish loading
                      </Button>
                    </Panel>
                  ) : state.recovery === 'error' ? (
                    <Panel title="Demo could not load">
                      <Text>
                        Simulated load error. Your filters and selection are
                        retained.
                      </Text>
                      <Button
                        id="error-retry"
                        onPress={() =>
                          dispatch({ type: 'recovery', value: 'ready' })
                        }
                      >
                        Retry
                      </Button>
                    </Panel>
                  ) : (
                    <Content />
                  )}
                  <html.div
                    role="status"
                    aria-live="polite"
                    data-testid="relay-status"
                  >
                    <Text tone="muted">
                      {message ||
                        'Local demo · no external notifications or backend actions'}
                    </Text>
                    <Text tone="muted" size={12}>
                      Session: {storageMode} · historical samples remain frozen
                      · {fontError ? 'Font fallback active' : 'Roboto Flex'}
                    </Text>
                  </html.div>
                </html.main>
              </Scroll>
              {!wide && !keyboard.visible && (
                <html.nav
                  data-testid="relay-navigation"
                  ref={bind('relay-navigation')}
                  aria-label="Destinations"
                  style={layout.navMobile(
                    t.panel,
                    t.line,
                    chosen['service-row.paddingBlock'],
                  )}
                >
                  {phone ? (
                    <>
                      <Button
                        id="nav-overview"
                        label="Overview"
                        active={route === '/overview'}
                        onPress={() => nav('/overview')}
                        style={layout.navButton}
                      >
                        Home
                      </Button>
                      <Button
                        id="nav-incidents"
                        label="Incidents"
                        active={route.startsWith('/incidents')}
                        onPress={() => nav('/incidents')}
                        style={layout.navButton}
                      >
                        Queue
                      </Button>
                      <Button
                        id="nav-menu"
                        onPress={() => setInspect('destinations')}
                        style={layout.navButton}
                      >
                        Menu
                      </Button>
                    </>
                  ) : (
                    navUI
                  )}
                </html.nav>
              )}
            </html.div>
          </html.div>
          {inspect === 'destinations' && (
            <Modal title="Destinations" onClose={() => setInspect(false)}>
              <Column>
                {destinations.map(([id, icon, name]) => (
                  <Button
                    key={id}
                    id={'nav-' + id}
                    onPress={() => {
                      setInspect(false);
                      nav('/' + id);
                    }}
                  >
                    {name}
                  </Button>
                ))}
              </Column>
            </Modal>
          )}
          {inspect === 'range' && (
            <Modal title="Time range" onClose={() => setInspect(false)}>
              <Column>
                {[15, 60, 240].map((n) => (
                  <Button
                    key={n}
                    id={'range-' + n}
                    active={state.context.range === n}
                    onPress={() => {
                      dispatch({
                        type: 'context',
                        patch: { range: n, bucket: 47 },
                      });
                      setInspect(false);
                    }}
                  >
                    {n === 60 ? '1h' : n === 240 ? '4h' : '15m'}
                  </Button>
                ))}
              </Column>
            </Modal>
          )}
          {command && <Command onClose={() => setCommand(false)} />}
          {inspect === 'filters' && (
            <Modal title="Global context" onClose={() => setInspect(false)}>
              <Column>
                <Text tone="muted">
                  Team and environment scope inventories and queues. Fleet
                  summaries and plots retain the supplied observations for all
                  120 services; service percentiles are never averaged.
                </Text>
                <Choice
                  id="global-team"
                  label="Team"
                  value={state.context.team}
                  options={[
                    { value: 'all', label: 'All teams' },
                    ...state.data.teams.map((x) => ({
                      value: x.id,
                      label: x.name,
                    })),
                  ]}
                  onChange={(team) =>
                    dispatch({ type: 'context', patch: { team } })
                  }
                />
                <Choice
                  id="global-environment"
                  label="Environment"
                  value={state.context.environment}
                  options={['all', 'production', 'staging']}
                  onChange={(environment) =>
                    dispatch({ type: 'context', patch: { environment } })
                  }
                />
                <Button
                  id="global-reset"
                  onPress={() =>
                    dispatch({
                      type: 'context',
                      patch: { team: 'all', environment: 'all' },
                    })
                  }
                >
                  Reset global filters
                </Button>
                <Text>
                  Current: {state.context.team} · {state.context.environment}.
                  These filters persist during linked navigation.
                </Text>
              </Column>
            </Modal>
          )}
          {inspect === true && <Inspection onClose={() => setInspect(false)} />}
        </html.div>
      </Data.Provider>
    </UI.Provider>
  );
}
function Content() {
  const { route, back } = useData();
  const parts = route.split('/').filter(Boolean),
    [section, id, action] = parts;
  const name = destinations.find((d) => d[0] === section)?.[2];
  return (
    <Column gap={20}>
      <Row spread>
        <Column gap={4}>
          <Text tone="muted" size={12}>
            WORKSPACE / {name?.toUpperCase() ?? 'UNKNOWN'}
          </Text>
          <Heading level={1} id="page-heading">
            {id
              ? section === 'alerts'
                ? 'Rule editor'
                : section === 'services'
                  ? 'Service investigation'
                  : section === 'incidents'
                    ? 'Incident room'
                    : 'Trace inspection'
              : (name ?? 'Not found')}
          </Heading>
        </Column>
        {id && (
          <Button id="back" onPress={back}>
            ← Back
          </Button>
        )}
      </Row>
      {section === 'overview' && !id ? (
        <Overview />
      ) : section === 'settings' && !id ? (
        <Settings />
      ) : section === 'services' && id ? (
        <ServiceDetail id={id} />
      ) : section === 'incidents' && id ? (
        <IncidentDetail id={id} />
      ) : section === 'traces' && id ? (
        <TraceDetail id={id} />
      ) : section === 'alerts' && id && (id === 'new' || action === 'edit') ? (
        <AlertEditor key={id} id={id} />
      ) : ['services', 'incidents', 'traces', 'alerts'].includes(section) &&
        !id ? (
        <Inventory kind={section} />
      ) : (
        <NotFound />
      )}
    </Column>
  );
}
function NotFound() {
  const { nav } = useData();
  return (
    <Panel title="This demo entity was not found">
      <Text>
        The link may contain an unknown ID. Your workspace state is preserved.
      </Text>
      <Button onPress={() => nav('/overview')}>Return to Overview</Button>
    </Panel>
  );
}
function Metric({ label, value, unit, detail, tone = 'ink' }) {
  return (
    <html.div style={layout.metric}>
      <Text tone="muted" size={12}>
        {label.toUpperCase()}
      </Text>
      <Row>
        <Text tone={tone} size={34} weight="600">
          {value}
        </Text>
        <Text tone="muted">{unit}</Text>
      </Row>
      <Text tone="muted" size={12}>
        {detail}
      </Text>
    </html.div>
  );
}
function Overview() {
  const { state, nav } = useData(),
    ui = useContext(UI),
    { phone, t } = ui;
  const [moreMetrics, setMoreMetrics] = useState(false);
  const bucket = state.data.fleetSeries[state.context.bucket],
    incidents = active(state);
  const slow = [...state.data.services]
    .sort((a, b) => latest(state, b.id).p95Ms - latest(state, a.id).p95Ms)
    .slice(0, 5);
  const distribution = state.data.services.reduce(
    (counts, s) => {
      counts[serviceStatus(state, s)]++;
      return counts;
    },
    { healthy: 0, degraded: 0, critical: 0 },
  );
  return (
    <>
      <html.section
        data-testid="relay-overview-summary"
        ref={ui.bind('relay-overview-summary')}
        style={layout.hero(t.panel, t.line, ui.gap)}
      >
        <Row spread>
          <Text tone="muted" size={12}>
            FLEET PULSE · SELECTED 5-MINUTE BUCKET
          </Text>
          <Badge status={incidents.length ? 'investigating' : 'healthy'}>
            {incidents.length} active incidents
          </Badge>
        </Row>
        <Row>
          {(!phone || moreMetrics) && (
            <Metric
              label="Request rate"
              value={format(bucket.requestCount / 300)}
              unit="req/s"
              detail="Aggregate count ÷ 300 seconds"
            />
          )}
          {(!phone || moreMetrics) && (
            <Metric
              label="Error rate"
              value={format((bucket.errorCount / bucket.requestCount) * 100, 2)}
              unit="%"
              detail="Weighted aggregate errors / requests"
            />
          )}
          <Metric
            label="Fleet p95"
            value={format(bucket.p95Ms)}
            unit="ms"
            detail="Supplied fleet quantile snapshot"
          />
          <Metric
            label="Unassigned active"
            value={incidents.filter((i) => !i.assigneeId).length}
            unit="incidents"
            detail="Current workflow ownership"
            tone="warning"
          />
        </Row>
        {phone && (
          <Button
            id="overview-more-metrics"
            onPress={() => setMoreMetrics(!moreMetrics)}
          >
            {moreMetrics ? 'Fewer fleet metrics' : 'Request & error metrics'}
          </Button>
        )}
      </html.section>
      <Panel title="Checkout needs a closer look">
        <Row spread>
          <Column>
            <Badge status="P1">P1 · Checkout latency</Badge>
            <Text size={22} weight="500">
              1,850 ms against a 450 ms target
            </Text>
            <Text tone="muted">
              Pool waits dominate the linked diagnostic trace. Connection-pool
              saturation is a hypothesis from synthetic observations.
            </Text>
          </Column>
          <Button
            id="diagnose-checkout"
            kind="primary"
            onPress={() => nav('/services/service-001')}
          >
            Investigate checkout-api →
          </Button>
        </Row>
        <Text tone="muted">
          Workflow resolution does not change these historical metrics.
        </Text>
      </Panel>
      <Chart
        id="relay-latency-chart"
        title="Fleet & checkout latency"
        metric="p95Ms"
        unit="ms"
        series={state.data.fleetSeries}
        comparisonSeries={state.data.serviceSeries[0].buckets}
        target={450}
      />
      <html.div
        data-testid="relay-comparison-charts"
        ref={ui.bind('relay-comparison-charts')}
        style={styles.flexColumns(phone ? 1 : 2, ui.gap)}
      >
        <html.div style={styles.grow}>
          <Chart
            id="relay-request-chart"
            title="Request throughput"
            metric="rate"
            unit="req/s"
            series={state.data.fleetSeries}
          />
        </html.div>
        <html.div style={styles.grow}>
          <Chart
            id="relay-error-chart"
            title="Error ratio"
            metric="errorRate"
            unit="%"
            series={state.data.fleetSeries}
          />
        </html.div>
      </html.div>
      <html.div style={styles.flexColumns(phone ? 1 : 2, ui.gap)}>
        <Panel title="Current incident desk" style={styles.grow}>
          {incidents.slice(0, 4).map((i) => (
            <EntityLink
              key={i.id}
              title={i.title}
              detail={`${i.id} · ${i.assigneeId ? state.data.members.find((m) => m.id === i.assigneeId)?.name : 'Unassigned'}`}
              status={i.severity + ' · ' + i.status}
              onPress={() => nav('/incidents/' + i.id)}
              id={'overview-' + i.id}
            />
          ))}
          <Button onPress={() => nav('/incidents')}>
            Open incident queue →
          </Button>
        </Panel>
        <Panel title="Slowest services" style={styles.grow}>
          {slow.map((s) => (
            <EntityLink
              key={s.id}
              title={s.name}
              detail={`${format(latest(state, s.id).p95Ms)} ms p95 · target ${s.p95TargetMs} ms`}
              status={serviceStatus(state, s)}
              onPress={() => nav('/services/' + s.id)}
            />
          ))}
          <Text tone="muted">
            Health: {distribution.healthy} healthy / {distribution.degraded}{' '}
            degraded / {distribution.critical} critical
          </Text>
          <Button onPress={() => nav('/services')}>
            Compare all 120 services →
          </Button>
        </Panel>
      </html.div>
    </>
  );
}
function stamp(value, timezone = 'UTC') {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timezone === 'UTC' ? { timeZone: 'UTC' } : {}),
  });
}
function EntityLink({ title, detail, status, onPress, id = null }) {
  const { t } = useContext(UI);
  return (
    <html.div style={layout.tableRow(t.line, 8)}>
      <Row spread>
        <Button id={id} onPress={onPress}>
          {title} →
        </Button>
        <Badge status={status} />
      </Row>
      <Text tone="muted" size={12}>
        {detail}
      </Text>
    </html.div>
  );
}
function Chart({
  id,
  title,
  metric,
  unit,
  series,
  target = null,
  comparisonSeries = null,
}) {
  const { state, dispatch } = useData(),
    ui = useContext(UI);
  const start = 48 - state.context.range / 5,
    buckets = series.slice(start);
  const value = (b) =>
    metric === 'rate'
      ? b.requestCount / 300
      : metric === 'errorRate'
        ? (b.errorCount / b.requestCount) * 100
        : b[metric];
  const max =
    Math.max(
      ...buckets.map(value),
      ...(comparisonSeries?.slice(start).map(value) ?? []),
      target ?? 0,
    ) * 1.15;
  const bucket = series[Math.max(start, state.context.bucket)],
    index = bucket.index;
  const [drag, setDrag] = useState(false);
  const plot = useRef(null);
  const dragBounds = useRef(null);
  const select = (i) =>
    dispatch({
      type: 'context',
      patch: { bucket: Math.max(start, Math.min(47, i)) },
    });
  const pointer = (e) => {
    const bounds =
      dragBounds.current ?? plot.current?.getBoundingClientRect?.();
    if (bounds)
      select(
        start +
          Math.round(
            Math.max(0, Math.min(1, (e.clientX - bounds.x) / bounds.width)) *
              (buckets.length - 1),
          ),
      );
  };
  return (
    <Panel id={id}>
      <Row spread>
        <Heading>{title}</Heading>
        <Text tone="muted" size={12}>
          {unit} ·{' '}
          {state.context.range === 60
            ? '1h'
            : state.context.range === 240
              ? '4h'
              : '15m'}{' '}
          · {state.preferences.timezone}
        </Text>
      </Row>
      <Row spread>
        <Text tone="muted" size={12}>
          0
        </Text>
        <Text tone="muted" size={12}>
          {format(max, metric === 'errorRate' ? 2 : 0)} {unit}
        </Text>
      </Row>
      <PlotInteraction
        data-testid={id + '-plot'}
        onSelectFraction={(fraction) => {
          const next = start + Math.round(fraction * (buckets.length - 1));
          if (next !== index) select(next);
        }}
        ref={(node) => {
          plot.current = node;
          ui.bind(id + '-plot')(node);
        }}
        role="group"
        aria-label={`${title}; select a five-minute bucket`}
        onPointerDown={(e) => {
          dragBounds.current = plot.current?.getBoundingClientRect?.();
          setDrag(true);
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pointer(e);
        }}
        onPointerMove={(e) => {
          if (drag) pointer(e);
        }}
        onPointerUp={() => {
          setDrag(false);
          dragBounds.current = null;
        }}
        onPointerCancel={() => setDrag(false)}
        style={styles.plot}
      >
        {buckets.map((b) => (
          <html.button
            key={b.index}
            aria-label={`${stamp(b.startAt, state.preferences.timezone)}: ${format(value(b), 2)} ${unit}`}
            aria-pressed={b.index === index}
            onClick={() => select(b.index)}
            style={[styles.barButton, comparisonSeries && styles.dualBarButton]}
          >
            {comparisonSeries && (
              <html.div
                style={styles.bar(
                  `${Math.max(1, (value(comparisonSeries[b.index]) / max) * 100)}%`,
                  ui.t.accent,
                )}
              />
            )}
            <html.div
              style={styles.bar(
                `${Math.max(1, (value(b) / max) * 100)}%`,
                b.index === index
                  ? ui.t.accent
                  : metric === 'errorRate'
                    ? ui.t.warning
                    : ui.t.line,
              )}
            />
          </html.button>
        ))}
        <PlotCursor
          id={id + '-cursor'}
          fraction={(index - start) / (buckets.length - 1)}
          bucketCount={buckets.length}
        />
        {target && (
          <html.div
            style={styles.threshold(`${(target / max) * 100}%`, ui.t.warning)}
          />
        )}
      </PlotInteraction>
      <html.div style={layout.axis}>
        <Text tone="muted" size={12}>
          {stamp(buckets[0].startAt, state.preferences.timezone)}
        </Text>
        <Text tone="muted" size={12}>
          {stamp(buckets.at(-1).endAt, state.preferences.timezone)}{' '}
          {state.preferences.timezone}
        </Text>
      </html.div>
      <Row spread>
        <Text
          id={id + '-summary'}
          live={/latency-chart$/.test(id) ? 'polite' : null}
        >
          {stamp(bucket.startAt, state.preferences.timezone)}–
          {stamp(bucket.endAt, state.preferences.timezone)} ·{' '}
          {format(value(bucket), 2)} {unit}
          {comparisonSeries
            ? ` · checkout ${format(value(comparisonSeries[index]))} ms`
            : ''}
          {target ? ` · checkout target ${target} ${unit}` : ''}
        </Text>
        <Row>
          <Button
            id={id + '-previous'}
            disabled={index <= start}
            onPress={() => select(index - 1)}
            label={'Previous bucket in ' + title}
          >
            ←
          </Button>
          <Button
            id={id + '-next'}
            disabled={index >= 47}
            onPress={() => select(index + 1)}
            label={'Next bucket in ' + title}
          >
            →
          </Button>
        </Row>
      </Row>
      <Text tone="muted" size={12}>
        Bars:{' '}
        {comparisonSeries ? 'cyan checkout / slate fleet' : title.toLowerCase()}{' '}
        · cyan marker: shared selected bucket
        {target ? ' · target is an authored threshold' : ''}.{' '}
        {metric === 'p95Ms'
          ? 'Supplied synthetic aggregate; not an average of service percentiles.'
          : ''}
      </Text>
    </Panel>
  );
}

function Inventory({ kind }) {
  const { state, dispatch, nav } = useData(),
    ui = useContext(UI),
    t = state.tables[kind];
  const rows = rowsFor(state, kind),
    pages = Math.max(1, Math.ceil(rows.length / t.pageSize)),
    page = Math.min(t.page, pages),
    visible = rows.slice((page - 1) * t.pageSize, page * t.pageSize);
  const [filters, setFilters] = useState(false),
    [save, setSave] = useState(false),
    [viewName, setViewName] = useState('');
  const patch = (value) =>
    dispatch({ type: 'table', table: kind, patch: value });
  const expanded = t.expanded ?? [];
  const setExpanded = (update) =>
    patch({
      expanded: typeof update === 'function' ? update(expanded) : update,
    });
  const select = (id) =>
    patch({
      selected: t.selected.includes(id)
        ? t.selected.filter((x) => x !== id)
        : [...t.selected, id],
    });
  const title =
    kind === 'services'
      ? 'Service inventory'
      : kind === 'incidents'
        ? 'Incident queue'
        : kind === 'traces'
          ? 'Trace explorer'
          : 'Alert rules';
  const surface = {
    services: 'relay-service-table',
    incidents: 'relay-incident-queue',
    traces: 'relay-trace-explorer',
    alerts: 'relay-alert-list',
  }[kind];
  const statuses = {
    services: ['all', 'healthy', 'degraded', 'critical'],
    incidents: [
      'all',
      'active',
      'triggered',
      'acknowledged',
      'investigating',
      'resolved',
    ],
    traces: ['all', 'ok', 'error'],
    alerts: ['all', 'firing', 'healthy', 'muted'],
  }[kind];
  const sorts = {
    services: [
      'id',
      'name',
      'status',
      'p95Ms',
      'rate',
      'errorRate',
      'sloTarget',
    ],
    incidents: ['id', 'severity', 'status', 'openedAt', 'owner'],
    traces: ['id', 'durationMs', 'startedAt', 'status', 'service'],
    alerts: ['id', 'name', 'status', 'threshold', 'severity'],
  }[kind];
  return (
    <Panel id={surface}>
      <Row spread>
        <Heading>{title}</Heading>
        <Badge>{rows.length} results</Badge>
      </Row>
      <Text tone="muted">
        Global context: {state.context.environment} environments ·{' '}
        {state.context.team} teams · range {state.context.range}m
      </Text>
      <Field
        id="local-search"
        label={'Search ' + kind}
        value={t.query}
        onChange={(query) => patch({ query })}
        placeholder={kind === 'traces' ? 'ID, service or route' : 'Name or ID'}
      />
      <Row>
        <Button id="table-filters" onPress={() => setFilters(true)}>
          Filter & sort
        </Button>
        <Button id="table-reset" onPress={() => patch(emptyTable())}>
          Reset table filters
        </Button>
        <Button id="save-view" onPress={() => setSave(true)}>
          Save view
        </Button>
        {kind === 'alerts' && (
          <>
            <Button
              id="new-alert"
              kind="primary"
              onPress={() => nav('/alerts/new')}
            >
              Create rule
            </Button>
            <Button
              id="evaluate-rules"
              onPress={() =>
                dispatch(
                  { type: 'evaluate' },
                  'Evaluated demo rules against frozen samples',
                )
              }
            >
              Evaluate demo rules
            </Button>
          </>
        )}
      </Row>
      <Text tone="muted" size={12}>
        Sort: {t.sort} {t.direction} · status {t.status} · region {t.region} ·{' '}
        {t.selected.length} selected by ID across pages and filters
      </Text>
      <Row>
        <Button
          id="select-page"
          onPress={() =>
            patch({
              selected: [
                ...new Set([...t.selected, ...visible.map((r) => r.id)]),
              ],
            })
          }
        >
          Select this page ({visible.length})
        </Button>
        <Button
          id="clear-selection"
          disabled={!t.selected.length}
          onPress={() => patch({ selected: [] })}
        >
          Clear selection
        </Button>
        {kind === 'incidents' && (
          <Button
            id="batch-ack"
            disabled={
              !t.selected.some((id) => {
                const i = state.data.incidents.find((i) => i.id === id);
                return i && i.status !== 'resolved' && !i.acknowledgedAt;
              })
            }
            onPress={() => {
              for (const id of t.selected) dispatch({ type: 'ack', id });
            }}
          >
            Acknowledge eligible selected
          </Button>
        )}
      </Row>
      {state.data.savedViews.filter((v) => v.route === '/' + kind).length >
        0 && (
        <Column gap={6}>
          <Text tone="muted" size={12}>
            SAVED VIEWS
          </Text>
          {state.data.savedViews
            .filter((v) => v.route === '/' + kind)
            .map((v) => (
              <Row key={v.id}>
                <Button
                  id={'replay-' + v.id}
                  onPress={() => {
                    patch({
                      ...emptyTable(),
                      ...v.filters,
                      sort: v.sort.key,
                      direction: v.sort.direction,
                    });
                    dispatch({
                      type: 'context',
                      patch: {
                        range: v.timeRangeMinutes,
                        environment: v.filters.environment ?? 'all',
                        team: v.filters.team ?? 'all',
                      },
                    });
                  }}
                >
                  {v.name}
                </Button>
                <Button
                  id={'delete-' + v.id}
                  label={'Delete view ' + v.name}
                  onPress={() =>
                    dispatch(
                      { type: 'deleteView', id: v.id },
                      'Deleted saved view',
                    )
                  }
                >
                  Delete
                </Button>
              </Row>
            ))}
        </Column>
      )}
      {!rows.length ? (
        <Panel title="No matching records">
          <Text>
            Search “{t.query}”, status {t.status}, region {t.region}, global{' '}
            {state.context.environment} / {state.context.team} returned no
            results.
          </Text>
          <Button
            id="empty-reset"
            onPress={() => {
              patch(emptyTable());
              dispatch({
                type: 'context',
                patch: { environment: 'all', team: 'all' },
              });
            }}
          >
            Clear all filters
          </Button>
        </Panel>
      ) : (
        visible.map((r) => {
          const show = !ui.phone || expanded.includes(r.id);
          return (
            <html.div
              key={r.id}
              data-testid={'row-' + r.id}
              ref={ui.bind('row-' + r.id)}
              style={layout.tableRow(
                ui.t.line,
                state.preferences.density === 'compact'
                  ? chosen['service-row.paddingBlock']
                  : 12,
              )}
            >
              <Row>
                <Button
                  id={'select-' + r.id}
                  active={t.selected.includes(r.id)}
                  label={'Select ' + r.id}
                  onPress={() => select(r.id)}
                >
                  {t.selected.includes(r.id) ? '☑' : '□'}
                </Button>
                <html.div
                  style={layout.rowTitle(chosen['service-row.textWidth'])}
                >
                  <Button
                    id={'open-' + r.id}
                    onPress={() =>
                      nav(
                        '/' +
                          kind +
                          '/' +
                          r.id +
                          (kind === 'alerts' ? '/edit' : ''),
                      )
                    }
                  >
                    {r.name || r.title
                      ? displayName(state, r)
                      : `${r.method} ${r.route}`}{' '}
                    →
                  </Button>
                  <Text tone="muted" size={12}>
                    {r.id}
                    {kind === 'traces'
                      ? ` · ${state.data.services.find((s) => s.id === r.serviceId)?.name}`
                      : ''}
                  </Text>
                </html.div>
                <Badge
                  status={(r.severity ? r.severity + ' · ' : '') + r.status}
                />
                {kind === 'services' && (
                  <Text weight="600">{format(r.p95Ms)} ms p95</Text>
                )}
                {kind === 'traces' && (
                  <Text weight="600">{format(r.durationMs)} ms</Text>
                )}
                {ui.phone && (
                  <Button
                    id={'expand-' + r.id}
                    onPress={() =>
                      setExpanded((v) =>
                        v.includes(r.id)
                          ? v.filter((x) => x !== r.id)
                          : [...v, r.id],
                      )
                    }
                  >
                    {show ? 'Less' : 'Details'}
                  </Button>
                )}
              </Row>
              {show && (
                <Row>
                  {kind === 'services' ? (
                    <>
                      <Cell
                        label="Team / environment"
                        value={`${state.data.teams.find((x) => x.id === r.teamId)?.name} · ${r.environment}`}
                      />
                      <Cell label="Region" value={r.region} />
                      <Cell
                        label="Request rate"
                        value={`${format(r.rate, 1)} req/s`}
                      />
                      <Cell
                        label="Error rate"
                        value={`${format(r.errorRate * 100, 2)}%`}
                      />
                      <Cell
                        label="SLO / p95 target"
                        value={`${r.sloTarget}% / ${r.p95TargetMs} ms`}
                      />
                    </>
                  ) : kind === 'incidents' ? (
                    <>
                      <Cell
                        label="Owner"
                        value={
                          r.assigneeId
                            ? state.data.members.find(
                                (m) => m.id === r.assigneeId,
                              )?.name
                            : 'Unassigned'
                        }
                      />
                      <Cell
                        label="Affected services"
                        value={r.serviceIds
                          .map(
                            (id) =>
                              state.data.services.find((s) => s.id === id)
                                ?.name,
                          )
                          .join(', ')}
                      />
                      <Cell
                        label="Age at demo clock"
                        value={`${Math.max(0, Math.round((Date.parse(state.data.now) - Date.parse(r.openedAt)) / 60000))}m`}
                      />
                    </>
                  ) : kind === 'traces' ? (
                    <>
                      <Cell
                        label="Started / region"
                        value={`${stamp(r.startedAt, state.preferences.timezone)} ${state.preferences.timezone} · ${r.region}`}
                      />
                      <Cell
                        label="Route / method"
                        value={`${r.method} ${r.route}`}
                      />
                      <Cell label="Status" value={r.status} />
                    </>
                  ) : (
                    <>
                      <Cell
                        label="Service / team"
                        value={`${state.data.services.find((s) => s.id === r.serviceId)?.name} / ${state.data.teams.find((t) => t.id === r.teamId)?.name}`}
                      />
                      <Cell
                        label="Threshold / window"
                        value={`${format(r.metric === 'errorRate' ? r.threshold * 100 : r.threshold, 2)} ${r.metric === 'errorRate' ? '% errors' : 'ms p95'} / ${r.windowMinutes}m`}
                      />
                      <Button
                        id={'toggle-' + r.id}
                        onPress={() =>
                          dispatch(
                            { type: 'toggleRule', id: r.id },
                            'Rule ' +
                              (r.enabled
                                ? 'muted'
                                : 'enabled; evaluate explicitly'),
                          )
                        }
                      >
                        {r.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      {r.incidentId && (
                        <Button
                          id={'alert-incident-' + r.id}
                          onPress={() => nav('/incidents/' + r.incidentId)}
                        >
                          {r.incidentId} →
                        </Button>
                      )}
                    </>
                  )}
                </Row>
              )}
            </html.div>
          );
        })
      )}
      <Row spread>
        <Text>
          Page {page} of {pages} ·{' '}
          {(page - 1) * t.pageSize + Math.min(1, rows.length)}–
          {Math.min(page * t.pageSize, rows.length)} of {rows.length}
        </Text>
        <Row>
          <Button
            id="page-previous"
            disabled={page <= 1}
            onPress={() => patch({ page: page - 1 })}
          >
            Previous
          </Button>
          <Button
            id="page-next"
            disabled={page >= pages}
            onPress={() => patch({ page: page + 1 })}
          >
            Next
          </Button>
        </Row>
      </Row>
      {kind === 'alerts' && (
        <Text tone="muted">
          Evaluation uses the frozen clock 2026-10-24 18:00 UTC. p95 policy:
          maximum supplied bucket p95 over the window. Error policy: sum(errors)
          / sum(requests). Disabled rules are muted. No backend delivery.
        </Text>
      )}
      {filters && (
        <Modal title="Filter and sort" onClose={() => setFilters(false)}>
          <Column>
            <Choice
              id="filter-status"
              label="Status"
              value={t.status}
              options={statuses}
              onChange={(status) => patch({ status })}
            />
            {kind === 'incidents' && (
              <Choice
                id="filter-assignee"
                label="Ownership"
                value={t.assignee}
                options={['all', 'unassigned']}
                onChange={(assignee) => patch({ assignee })}
              />
            )}
            {['services', 'traces'].includes(kind) && (
              <Choice
                id="filter-region"
                label="Region"
                value={t.region}
                options={[
                  'all',
                  ...new Set(state.data.services.map((s) => s.region)),
                ]}
                onChange={(region) => patch({ region })}
              />
            )}
            <Choice
              id="sort-key"
              label="Sort by"
              value={t.sort}
              options={sorts}
              onChange={(sort) => patch({ sort })}
            />
            <Choice
              id="sort-direction"
              label="Direction"
              value={t.direction}
              options={['asc', 'desc']}
              onChange={(direction) => patch({ direction })}
            />
            <Choice
              id="page-size"
              label="Rows per page"
              value={t.pageSize}
              options={[15, 30, 60].map((n) => ({
                value: n,
                label: String(n),
              }))}
              onChange={(pageSize) => patch({ pageSize })}
            />
          </Column>
        </Modal>
      )}
      {save && (
        <Modal title="Save current view" onClose={() => setSave(false)}>
          <Column>
            <Field
              id="view-name"
              label="View name"
              value={viewName}
              onChange={setViewName}
            />
            <Button
              id="view-save-confirm"
              disabled={!viewName.trim()}
              onPress={() => {
                dispatch(
                  {
                    type: 'saveView',
                    view: {
                      name: viewName.trim(),
                      route: '/' + kind,
                      filters: {
                        query: t.query,
                        status: t.status,
                        region: t.region,
                        assignee: t.assignee,
                        environment: state.context.environment,
                        team: state.context.team,
                      },
                      sort: { key: t.sort, direction: t.direction },
                      timeRangeMinutes: state.context.range,
                    },
                  },
                  'Saved view',
                );
                setSave(false);
                setViewName('');
              }}
            >
              Save view locally
            </Button>
          </Column>
        </Modal>
      )}
    </Panel>
  );
}
function Cell({ label, value }) {
  return (
    <html.div style={layout.cell}>
      <Text tone="muted" size={12}>
        {label}
      </Text>
      <Text>{value}</Text>
    </html.div>
  );
}
function ServiceDetail({ id }) {
  const { state, nav } = useData(),
    ui = useContext(UI),
    service = state.data.services.find((s) => s.id === id);
  if (!service) return <NotFound />;
  const b = latest(state, id),
    series = state.data.serviceSeries.find((s) => s.serviceId === id).buckets,
    incidents = state.data.incidents.filter((i) => i.serviceIds.includes(id)),
    traces = state.data.traces.filter((t) => t.serviceId === id).slice(0, 5),
    rules = state.data.alertRules.filter((r) => r.serviceId === id);
  return (
    <Column gap={20}>
      <Panel id="relay-service-detail">
        <Row spread>
          <Heading>{displayName(state, service)}</Heading>
          <Badge status={serviceStatus(state, service)} />
        </Row>
        <Text>{service.description}</Text>
        <Text tone="muted">
          {service.id} · {service.environment} · {service.region} ·{' '}
          {state.data.teams.find((t) => t.id === service.teamId)?.name} ·{' '}
          {service.version}
        </Text>
        <Row>
          <Metric
            label="Current p95"
            value={format(b.p95Ms)}
            unit="ms"
            detail={`Target ${service.p95TargetMs} ms`}
          />
          <Metric
            label="Error rate"
            value={format((b.errorCount / b.requestCount) * 100, 2)}
            unit="%"
            detail={`SLO ${service.sloTarget}%`}
          />
          <Metric
            label="Linked active"
            value={incidents.filter((i) => i.status !== 'resolved').length}
            unit="incidents"
            detail="Workflow state; separate from health"
          />
        </Row>
        <Heading>Dependency topology</Heading>
        <Text tone="muted">
          Directed edges from {service.name}; open a service to inspect its real
          context.
        </Text>
        <Row>
          <Badge>{service.name}</Badge>
          <Text>→</Text>
          {service.dependencyIds.length ? (
            service.dependencyIds.map((dep) => (
              <Button
                key={dep}
                id={'dependency-' + dep}
                onPress={() => nav('/services/' + dep)}
              >
                {state.data.services.find((s) => s.id === dep)?.name} →
              </Button>
            ))
          ) : (
            <Text>No downstream dependencies in the fixture.</Text>
          )}
        </Row>
        {id === 'service-001' && <TechnicalMedia kind="topology" />}
      </Panel>
      <Panel title="Linked incidents">
        {incidents.map((i) => (
          <EntityLink
            key={i.id}
            title={i.title}
            detail={`${i.id} · ${i.assigneeId ? state.data.members.find((m) => m.id === i.assigneeId)?.name : 'Unassigned'}`}
            status={i.severity + ' · ' + i.status}
            id={'service-incident-' + i.id}
            onPress={() => nav('/incidents/' + i.id)}
          />
        ))}
        {!incidents.length && <Text>No linked incidents.</Text>}
      </Panel>
      <Chart
        id="service-latency-chart"
        title={service.name + ' p95'}
        metric="p95Ms"
        unit="ms"
        series={series}
        target={service.p95TargetMs}
      />
      <html.div style={styles.flexColumns(ui.phone ? 1 : 2, ui.gap)}>
        <html.div style={styles.grow}>
          <Chart
            id="service-rate-chart"
            title="Request throughput"
            metric="rate"
            unit="req/s"
            series={series}
          />
        </html.div>
        <html.div style={styles.grow}>
          <Chart
            id="service-error-chart"
            title="Error ratio"
            metric="errorRate"
            unit="%"
            series={series}
          />
        </html.div>
      </html.div>
      <Panel title="Diagnostic traces">
        {traces.map((t) => (
          <EntityLink
            key={t.id}
            title={`${t.id} · ${t.method} ${t.route}`}
            detail={`${t.durationMs} ms · ${stamp(t.startedAt)} UTC`}
            status={t.status}
            onPress={() => nav('/traces/' + t.id)}
          />
        ))}
      </Panel>
      <Panel title="Alert rules">
        {rules.map((r) => (
          <EntityLink
            key={r.id}
            title={r.name}
            detail={`${r.windowMinutes}m window · ${r.id}`}
            status={r.status}
            onPress={() => nav('/alerts/' + r.id + '/edit')}
          />
        ))}
        {!rules.length && <Text>No rules for this service.</Text>}
      </Panel>
    </Column>
  );
}
function IncidentDetail({ id }) {
  const { state, dispatch, nav } = useData(),
    ui = useContext(UI);
  const incident = state.data.incidents.find((i) => i.id === id);
  const [note, setNote] = useState(''),
    [resolution, setResolution] = useState(''),
    [error, setError] = useState('');
  if (!incident) return <NotFound />;
  const resolved = incident.status === 'resolved';
  return (
    <Column gap={20}>
      <Panel id="relay-incident-detail">
        <Row spread>
          <Badge status={incident.severity}>
            {incident.severity} · {incident.id}
          </Badge>
          <Badge status={incident.status} />
        </Row>
        <Heading>{displayName(state, incident)}</Heading>
        <Text>{incident.summary}</Text>
        <Text tone="muted">
          Local incident coordination · no infrastructure changes or
          notification delivery
        </Text>
        <Choice
          id="incident-owner"
          label="Assign owner"
          value={incident.assigneeId ?? 'unassigned'}
          options={[
            { value: 'unassigned', label: 'Unassigned' },
            ...state.data.members.map((m) => ({ value: m.id, label: m.name })),
          ]}
          onChange={(member) => {
            if (member !== 'unassigned')
              dispatch({ type: 'assign', id, member }, 'Assigned incident');
          }}
        />
        <Row>
          <Button
            id="incident-ack"
            kind="primary"
            disabled={resolved || !!incident.acknowledgedAt}
            onPress={() =>
              dispatch({ type: 'ack', id }, 'Incident acknowledged')
            }
          >
            Acknowledge
          </Button>
          <Button
            id="incident-investigate"
            disabled={
              resolved ||
              !incident.acknowledgedAt ||
              incident.status === 'investigating'
            }
            onPress={() =>
              dispatch({ type: 'investigate', id }, 'Investigation started')
            }
          >
            Begin investigation
          </Button>
        </Row>
        <Row>
          {incident.serviceIds.map((sid) => (
            <Button
              key={sid}
              id={'incident-service-' + sid}
              onPress={() => nav('/services/' + sid)}
            >
              {state.data.services.find((s) => s.id === sid)?.name} →
            </Button>
          ))}
        </Row>
        <Row>
          {incident.traceIds.map((tid) => (
            <Button
              key={tid}
              id={'incident-trace-' + tid}
              onPress={() => nav('/traces/' + tid)}
            >
              {tid} →
            </Button>
          ))}
        </Row>
        <Row>
          {incident.alertRuleIds.map((rid) => (
            <Button
              key={rid}
              id={'incident-rule-' + rid}
              onPress={() => nav('/alerts/' + rid + '/edit')}
            >
              {rid} →
            </Button>
          ))}
        </Row>
        <Field
          id="incident-note"
          label="Operator note"
          multiline
          value={note}
          onChange={setNote}
        />
        <Button
          id="incident-note-add"
          disabled={!note.trim()}
          onPress={() => {
            if (dispatch({ type: 'note', id, note }, 'Added operator note'))
              setNote('');
          }}
        >
          Add note locally
        </Button>
        {!resolved ? (
          <>
            <Field
              id="incident-resolution"
              label="Required resolution note"
              multiline
              value={resolution}
              onChange={(value) => {
                setResolution(value);
                setError('');
              }}
              error={error}
            />
            <Button
              id="incident-resolve"
              kind="primary"
              onPress={() => {
                if (!resolution.trim()) {
                  setError('Enter a resolution note before resolving.');
                  return;
                }
                dispatch(
                  { type: 'resolve', id, note: resolution },
                  'Incident resolved; historical telemetry unchanged',
                );
              }}
            >
              Resolve incident locally
            </Button>
          </>
        ) : (
          <Text id="incident-resolved-at" tone="healthy">
            Resolved {incident.resolvedAt} · owner retained · linked active
            alert event cleared
          </Text>
        )}
      </Panel>
      <Panel title="Incident timeline">
        {[...incident.timeline].reverse().map((e) => (
          <html.div key={e.id} style={layout.note}>
            <Row>
              <Badge>{e.kind}</Badge>
              <Text tone="muted" size={12}>
                {e.at} ·{' '}
                {e.actorId
                  ? state.data.members.find((m) => m.id === e.actorId)?.name
                  : 'Demo rule'}
              </Text>
            </Row>
            <Text>{e.message}</Text>
          </html.div>
        ))}
      </Panel>
    </Column>
  );
}
function TraceDetail({ id }) {
  const { state, nav, dispatch } = useData(),
    ui = useContext(UI),
    trace = state.data.traces.find((t) => t.id === id),
    selected = state.traceSelections?.[id] ?? null;
  const setSelected = (spanId) =>
    dispatch({ type: 'span', traceId: id, spanId });
  if (!trace) return <NotFound />;
  const span = trace.spans.find((s) => s.id === selected) ?? trace.spans[0],
    parent = trace.spans.find((s) => s.id === span.parentId);
  return (
    <Panel id="relay-trace-waterfall">
      <Row spread>
        <Heading>
          {trace.method} {trace.route}
        </Heading>
        <Badge status={trace.status} />
      </Row>
      <Text>
        {trace.id} · {format(trace.durationMs)} ms · {trace.startedAt} ·{' '}
        {trace.region}
      </Text>
      <Row>
        <Button
          id="trace-service"
          onPress={() => nav('/services/' + trace.serviceId)}
        >
          {state.data.services.find((s) => s.id === trace.serviceId)?.name} →
        </Button>
        {trace.incidentId && (
          <Button
            id="trace-incident"
            onPress={() => nav('/incidents/' + trace.incidentId)}
          >
            {trace.incidentId} →
          </Button>
        )}
      </Row>
      <Text tone="muted">
        Diagnostic samples are not the full request population. Select a span by
        touch, click, or the accessible stepper. Web also supports Tab / Enter.
      </Text>
      <html.div style={layout.axis}>
        {(ui.phone ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((r) => (
          <Text key={r} size={12} tone="muted">
            {format(trace.durationMs * r)} ms
          </Text>
        ))}
      </html.div>
      {trace.spans.map((s, index) => (
        <Column key={s.id} gap={4}>
          <Button
            id={'span-' + s.id}
            active={span.id === s.id}
            style={layout.traceChoice}
            onPress={() => setSelected(s.id)}
            label={`Select ${s.operation}, ${s.durationMs} ms, ${s.status}`}
          >
            {s.parentId ? '↳ ' : ''}
            {s.operation} · {s.durationMs} ms · {s.status}
          </Button>
          <html.div style={styles.spanTrack}>
            <html.div
              style={styles.spanBar(
                `${(s.offsetMs / trace.durationMs) * 100}%`,
                `${(s.durationMs / trace.durationMs) * 100}%`,
                span.id === s.id
                  ? ui.t.accent
                  : s.status === 'error'
                    ? ui.t.critical
                    : ui.t.line,
              )}
            />
          </html.div>
          <Text size={12} tone="muted">
            Start +{s.offsetMs} ms → end +{s.offsetMs + s.durationMs} ms ·{' '}
            {s.parentId ?? 'root'}
          </Text>
        </Column>
      ))}
      <Row>
        <Button
          id="span-previous"
          disabled={trace.spans.indexOf(span) === 0}
          onPress={() =>
            setSelected(trace.spans[trace.spans.indexOf(span) - 1].id)
          }
        >
          Previous span
        </Button>
        <Button
          id="span-next"
          disabled={trace.spans.indexOf(span) === trace.spans.length - 1}
          onPress={() =>
            setSelected(trace.spans[trace.spans.indexOf(span) + 1].id)
          }
        >
          Next span
        </Button>
      </Row>
      <Panel title="Selected span attributes">
        <Text id="selected-span" weight="600">
          {span.operation} · {span.durationMs} ms
        </Text>
        <Text>
          Parent: {parent?.operation ?? 'Root span'} · service{' '}
          {state.data.services.find((s) => s.id === span.serviceId)?.name}
        </Text>
        {Object.entries(span.attributes).map(([key, value]) => (
          <Text key={key}>
            {key}: {String(value)}
          </Text>
        ))}
        {parent && (
          <>
            <Text tone="muted">Parent attributes</Text>
            {Object.entries(parent.attributes).map(([key, value]) => (
              <Text key={key}>
                {key}: {String(value)}
              </Text>
            ))}
          </>
        )}
        <Badge status={span.status}>Span status: {span.status}</Badge>
        <Button
          id="span-open-service"
          onPress={() => nav('/services/' + span.serviceId)}
        >
          Open span service →
        </Button>
      </Panel>
      {id === 'trace-000001' && (
        <>
          <Text>
            Authored hypothesis: connection-pool saturation. The single trace
            supports investigation, not causal proof.
          </Text>
          <TechnicalMedia kind="trace" />
        </>
      )}
    </Panel>
  );
}
function AlertEditor({ id }) {
  const { state, dispatch, nav } = useData();
  const existing = state.data.alertRules.find((r) => r.id === id),
    isNew = id === 'new';
  const [draft, setDraft] = useState(() =>
    existing
      ? {
          ...existing,
          displayThreshold: String(
            existing.metric === 'errorRate'
              ? existing.threshold * 100
              : existing.threshold,
          ),
        }
      : {
          name: '',
          serviceId: 'service-001',
          teamId: 'team-01',
          metric: 'p95Ms',
          displayThreshold: '450',
          windowMinutes: 5,
          severity: 'P2',
          enabled: true,
        },
  );
  const [errors, setErrors] = useState(
    /** @type {Record<string,string>} */ ({}),
  );
  if (!isNew && !existing) return <NotFound />;
  const change = (patch) => {
    setDraft((value) => ({ ...value, ...patch }));
    setErrors({});
  };
  const save = () => {
    const { displayThreshold, ...rule } = draft;
    rule.threshold =
      displayThreshold.trim() === ''
        ? NaN
        : Number(displayThreshold) / (rule.metric === 'errorRate' ? 100 : 1);
    const errors = validateRule(state, rule);
    setErrors(errors);
    if (
      !Object.keys(errors).length &&
      dispatch({ type: 'saveRule', rule }, 'Rule saved locally')
    )
      nav('/alerts');
  };
  return (
    <Panel id="relay-alert-editor">
      <Heading>{isNew ? 'Create alert rule' : existing.name}</Heading>
      <Text tone="muted">
        Rules operate only when you explicitly evaluate the frozen demo samples.
      </Text>
      <Field
        id="rule-name"
        label="Rule name"
        value={draft.name}
        onChange={(name) => change({ name })}
        error={errors.name}
      />
      <Choice
        id="rule-service"
        label="Service"
        value={draft.serviceId}
        options={state.data.services.map((s) => ({
          value: s.id,
          label: s.name + ' · ' + s.id,
        }))}
        onChange={(serviceId) => change({ serviceId })}
      />
      <Choice
        id="rule-metric"
        label="Metric"
        value={draft.metric}
        options={[
          { value: 'p95Ms', label: 'p95 latency · milliseconds' },
          { value: 'errorRate', label: 'Error rate · percent' },
        ]}
        onChange={(metric) =>
          change({
            metric,
            displayThreshold: metric === 'errorRate' ? '1' : '450',
          })
        }
      />
      <Field
        id="rule-threshold"
        label={
          draft.metric === 'errorRate' ? 'Threshold (%)' : 'Threshold (ms)'
        }
        value={draft.displayThreshold}
        onChange={(displayThreshold) => change({ displayThreshold })}
        error={errors.threshold}
      />
      <Text tone="muted">
        {draft.metric === 'errorRate'
          ? 'Enter 0–100%. Stored as a fraction; evaluation sums errors / requests over the window.'
          : 'Enter a finite positive latency in ms. Evaluation takes the maximum supplied bucket p95 over the window.'}
      </Text>
      <Choice
        id="rule-window"
        label="Evaluation window"
        value={draft.windowMinutes}
        options={[5, 10, 15].map((n) => ({ value: n, label: n + ' minutes' }))}
        onChange={(windowMinutes) => change({ windowMinutes })}
      />
      <Choice
        id="rule-severity"
        label="Severity"
        value={draft.severity}
        options={['P1', 'P2', 'P3']}
        onChange={(severity) => change({ severity })}
      />
      <Choice
        id="rule-team"
        label="Routing team"
        value={draft.teamId}
        options={state.data.teams.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(teamId) => change({ teamId })}
      />
      <Button
        id="rule-enabled"
        active={draft.enabled}
        onPress={() => change({ enabled: !draft.enabled })}
      >
        {draft.enabled ? 'Enabled' : 'Disabled / muted'}
      </Button>
      <Row>
        <Button id="rule-save" kind="primary" onPress={save}>
          Save rule locally
        </Button>
        <Button id="rule-cancel" onPress={() => nav('/alerts')}>
          Cancel changes
        </Button>
      </Row>
      {existing?.incidentId && (
        <Button onPress={() => nav('/incidents/' + existing.incidentId)}>
          Open active incident {existing.incidentId} →
        </Button>
      )}
    </Panel>
  );
}
function Settings() {
  const {
      state,
      dispatch,
      nav,
      speak,
      storageMode,
      setFailStorage,
      failStorage,
      openInspection,
      storagePaused,
      setStoragePaused,
      setStorageMode,
    } = useData(),
    ui = useContext(UI),
    [confirm, setConfirm] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const auditPages = Math.max(1, Math.ceil(state.data.auditLog.length / 40)),
    currentAuditPage = Math.min(auditPage, auditPages);
  const pref = (patch) =>
    dispatch({ type: 'preferences', patch }, 'Preference updated');
  return (
    <Column gap={20}>
      <Panel id="relay-command-settings" title="Workspace preferences">
        <Text>
          Demo · synthetic data. All mutations and saved views belong to this
          local device session.
        </Text>
        <Choice
          id="settings-theme"
          label="Theme"
          value={state.preferences.theme}
          options={['dark', 'light']}
          onChange={(theme) => pref({ theme })}
        />
        <Choice
          id="settings-density"
          label="Density"
          value={state.preferences.density}
          options={['comfortable', 'compact']}
          onChange={(density) => pref({ density })}
        />
        <Choice
          id="settings-motion"
          label="Reduced motion"
          value={state.preferences.reducedMotion}
          options={[
            { value: 'system', label: 'Follow system' },
            { value: 'reduce', label: 'Reduce motion' },
          ]}
          onChange={(reducedMotion) => pref({ reducedMotion })}
        />
        <Choice
          id="settings-timezone"
          label="Display timezone"
          value={state.preferences.timezone}
          options={[
            { value: 'UTC', label: 'UTC' },
            { value: 'local', label: 'Device local timezone' },
          ]}
          onChange={(timezone) => pref({ timezone })}
        />
        <Choice
          id="settings-text"
          label="Text enlargement"
          value={state.preferences.textScale}
          options={[
            { value: 1, label: '100%' },
            { value: 1.5, label: '150%' },
          ]}
          onChange={(textScale) => pref({ textScale })}
        />
        <Text>
          Native system text scaling remains enabled in addition to this demo
          preference.
        </Text>
        <Button id="inspect-open" onPress={openInspection}>
          Inspect current surface and font axes
        </Button>
        <Button
          id="settings-long-text"
          active={state.preferences.longText ?? false}
          onPress={() => pref({ longText: !state.preferences.longText })}
        >
          Long-label stress preview {state.preferences.longText ? 'on' : 'off'}
        </Button>
        <Text tone="muted">
          Stress preview adds labeled presentation text to checkout and its
          incident without changing the frozen fixture.
        </Text>
      </Panel>
      <Panel title="Demo state and recovery">
        <Text>
          Session: {storageMode}. Persistence uses{' '}
          {Platform.OS === 'web'
            ? 'namespaced localStorage'
            : 'an Expo document file'}
          .
        </Text>
        <Row>
          {['ready', 'offline', 'loading', 'error'].map((value) => (
            <Button
              key={value}
              id={'recovery-' + value}
              active={state.recovery === value}
              onPress={() => dispatch({ type: 'recovery', value })}
            >
              {value}
            </Button>
          ))}
        </Row>
        <Button
          id="storage-failure"
          active={failStorage}
          onPress={() => {
            if (storagePaused) {
              setStoragePaused(false);
              setFailStorage(false);
            } else setFailStorage(!failStorage);
          }}
        >
          {failStorage || storagePaused
            ? 'Restore storage and retry'
            : 'Simulate storage failure'}
        </Button>
        <Button
          id="export-state"
          onPress={() =>
            exportState(JSON.stringify(state, null, 2))
              .then(speak)
              .catch((e) => speak('Export failed: ' + e.message))
          }
        >
          Export local demo state
        </Button>
        <Row>
          <Button id="clear-storage" onPress={() => setConfirm('clear')}>
            Clear persisted storage
          </Button>
          <Button id="reset-demo" onPress={() => setConfirm('reset')}>
            Reset to frozen fixture
          </Button>
        </Row>
        <Text tone="muted">
          Reset restores all 120 services, 36 incidents, 1,000 traces and 24
          rules. Historical telemetry never changes.
        </Text>
      </Panel>
      <Panel title="Local audit log">
        <Text>
          {state.data.auditLog.length} entries · page {currentAuditPage} of{' '}
          {auditPages} · actor, entity, action and deterministic UTC time
        </Text>
        {[...state.data.auditLog]
          .reverse()
          .slice((currentAuditPage - 1) * 40, currentAuditPage * 40)
          .map((e) => (
            <html.div key={e.id} style={layout.note}>
              <Text weight="500">
                {e.action} · {e.entityId}
              </Text>
              <Text>{e.detail}</Text>
              <Text tone="muted" size={12}>
                {e.at} · {e.actorId}
              </Text>
            </html.div>
          ))}
        <Row>
          <Button
            id="audit-previous"
            disabled={currentAuditPage <= 1}
            onPress={() => setAuditPage(currentAuditPage - 1)}
          >
            Previous audit page
          </Button>
          <Button
            id="audit-next"
            disabled={currentAuditPage >= auditPages}
            onPress={() => setAuditPage(currentAuditPage + 1)}
          >
            Next audit page
          </Button>
        </Row>
      </Panel>
      {confirm && (
        <Modal
          title={
            confirm === 'reset'
              ? 'Reset local demo?'
              : 'Clear persisted storage?'
          }
          onClose={() => setConfirm(null)}
        >
          <Column>
            <Text>
              {confirm === 'reset'
                ? 'This restores the exact fixture and removes local workflow edits and preferences.'
                : 'The current in-memory session remains usable. Closing before a new save discards this session.'}
            </Text>
            <Button
              id="confirm-demo-action"
              kind="primary"
              onPress={async () => {
                if (confirm === 'reset') {
                  setFailStorage(false);
                  setStoragePaused(false);
                  dispatch(
                    { type: 'reset', fixture },
                    'Reset to frozen fixture',
                  );
                  setConfirm(null);
                  nav('/overview');
                } else {
                  try {
                    await storage.clear();
                    setStoragePaused(true);
                    setStorageMode('in-memory fallback');
                    speak(
                      'Persisted storage cleared. Current session remains in memory.',
                    );
                  } catch (e) {
                    speak('Could not clear storage: ' + e.message);
                  }
                  setConfirm(null);
                }
              }}
            >
              Confirm {confirm}
            </Button>
          </Column>
        </Modal>
      )}
    </Column>
  );
}
function Command({ onClose }) {
  const { state, nav, dispatch } = useData(),
    [query, setQuery] = useState(''),
    [index, setIndex] = useState(0);
  const items = [
    ...destinations.map(([id, icon, name]) => ({
      id: 'route-' + id,
      label: name,
      run: () => nav('/' + id),
    })),
    {
      id: 'action-evaluate',
      label: 'Evaluate demo rules',
      run: () => dispatch({ type: 'evaluate' }, 'Evaluated demo rules'),
    },
    ...state.data.services.map((s) => ({
      id: s.id,
      label: s.name + ' · ' + s.id,
      run: () => nav('/services/' + s.id),
    })),
    ...state.data.incidents.map((i) => ({
      id: i.id,
      label: i.id + ' · ' + i.title,
      run: () => nav('/incidents/' + i.id),
    })),
    ...state.data.alertRules.map((rule) => ({
      id: rule.id,
      label: rule.id + ' · ' + rule.name,
      run: () => nav('/alerts/' + rule.id + '/edit'),
    })),
    ...state.data.traces.map((t) => ({
      id: t.id,
      label: t.id + ' · ' + t.route,
      run: () => nav('/traces/' + t.id),
    })),
  ]
    .filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 12);
  const choose = (i) => {
    onClose();
    i.run();
  };
  return (
    <Modal
      title="Search workspace"
      id="relay-command-settings"
      onClose={onClose}
    >
      <html.div
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e['preventDefault']?.();
            setIndex((i) => Math.min(items.length - 1, i + 1));
          }
          if (e.key === 'ArrowUp') {
            e['preventDefault']?.();
            setIndex((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter' && items[index]) {
            e['preventDefault']?.();
            choose(items[index]);
          }
        }}
        style={styles.column}
      >
        <Field
          id="command-query"
          label="Find a route, entity or action"
          value={query}
          onChange={(q) => {
            setQuery(q);
            setIndex(0);
          }}
        />
        <Text tone="muted" size={12}>
          {Platform.OS === 'web'
            ? '↑ ↓ select · Enter open · Escape close'
            : 'Tap a result · Close returns to your workspace'}{' '}
          · {items.length} results
        </Text>
        {items.map((item, i) => (
          <Button
            key={item.id}
            id={'command-' + item.id}
            active={index === i}
            onPress={() => choose(item)}
          >
            {item.label}
          </Button>
        ))}
        {!items.length && (
          <Text>No matches. Try a service name, incident ID or route.</Text>
        )}
      </html.div>
    </Modal>
  );
}
function FrameConsequences() {
  const ui = useContext(UI);
  const [quantity, setQuantity] = useState('workWidth');
  const frame = ui.geometry;
  const analysis = useMemo(
    () => inspectRelayFrame(frame, quantity),
    [frame.inputKey, quantity],
  );
  if (analysis.status !== 'calculated')
    return <Text>Layout model unavailable: {analysis.reason}</Text>;
  const sensitivity = analysis.sensitivity;
  const brackets = analysis.regimes.cells
    .filter((cell) => cell.status === 'transition-bracket')
    .sort(
      (a, b) =>
        Math.abs(a.input.min - frame.inputs.width) -
        Math.abs(b.input.min - frame.inputs.width),
    )
    .slice(0, 3);
  const number = (value) =>
    typeof value === 'number' ? value.toFixed(2) : 'unavailable at boundary';
  return (
    <Column gap={10}>
      <Heading>Layout consequences</Heading>
      <Text tone="muted">
        Calculated from the policy that controls this workspace. Content fit and
        native root coordinates still need current renderer validation.
      </Text>
      <Choice
        id="inspection-quantity"
        label="Related quantity"
        value={quantity}
        onChange={setQuantity}
        options={[
          { value: 'workWidth', label: 'Usable workspace width' },
          { value: 'railThreshold', label: 'Navigation fit threshold' },
          { value: 'pairThreshold', label: 'Paired chart fit threshold' },
          { value: 'gap', label: 'Shared spacing' },
          { value: 'columns', label: 'Chart columns' },
        ]}
      />
      <Text>
        Current {quantity}: {number(sensitivity.value)} · {sensitivity.status}
      </Text>
      <Text>
        Width sensitivity: {number(sensitivity.derivatives.width)} · text-scale
        sensitivity: {number(sensitivity.derivatives.textScale)}
      </Text>
      <Text>
        Input width {number(frame.inputs.width)} · effective text scale{' '}
        {number(frame.inputs.textScale)} · {analysis.policy}
      </Text>
      <Text tone="muted">
        Root input: {ui.measuredRoot?.status ?? 'pending'} ·{' '}
        {ui.measuredRoot?.provider ?? 'provisional nominal window'}. Renderer
        validation is a separate receipt.
      </Text>
      {analysis.enclosure.status === 'bounded' ? (
        <Text>
          Model envelope from 320 to 1920:{' '}
          {number(analysis.enclosure.interval.min)} to{' '}
          {number(analysis.enclosure.interval.max)}. Other inputs held fixed.
        </Text>
      ) : (
        <Text>Model envelope unresolved: {analysis.enclosure.reason}</Text>
      )}
      <Text>
        Nearest modeled transitions:{' '}
        {brackets.length
          ? brackets
              .map(
                (cell) =>
                  `${cell.input.min.toFixed(2)}–${cell.input.max.toFixed(2)}`,
              )
              .join(', ')
          : 'none isolated'}
        .
      </Text>
      <Text tone="muted">
        These brackets identify renderer tests to run. They are not observed
        text wraps or a beauty score.
        {analysis.regimes.exhausted
          ? ' Some regions remain unresolved at the exploration limit.'
          : ''}
      </Text>
    </Column>
  );
}
function Inspection({ onClose }) {
  const { state, dispatch } = useData();
  const [selection, setSelection] = useState('relay-context-toolbar');
  const { receipt, ids } = useElementInspection(selection);
  const ui = useContext(UI);
  const box = receipt?.status === 'measured' ? receipt.box : null;
  return (
    <InspectorPanel onClose={onClose}>
      <ElementInspection receipt={receipt} />
      <Column>
        <Choice
          id="inspection-surface"
          label="Observed element"
          value={selection}
          options={[...new Set([selection, ...ids])]}
          onChange={setSelection}
        />
        <Text>
          Observed {Platform.OS === 'web' ? 'DOM' : 'native host'} rectangle:{' '}
          {box
            ? `${box.width.toFixed(2)} × ${box.height.toFixed(2)} at (${box.x.toFixed(2)}, ${box.y.toFixed(2)})`
            : 'unavailable'}
        </Text>
        <Text>
          Observed at: {receipt?.observedAt ?? 'pending'} ·{' '}
          {receipt?.status ?? 'pending'} · source{' '}
          {(receipt?.context.sourceIdentity ?? 'unknown').slice(0, 12)}
        </Text>
        <Text tone="muted">
          {receipt?.detail ?? 'Waiting for the current element and inputs.'}
        </Text>
        {receipt?.contentBox && (
          <Text>
            Observed local content box: {receipt.contentBox.width.toFixed(2)} ×{' '}
            {receipt.contentBox.height.toFixed(2)} CSS px. Viewport bounding
            boxes include transforms.
          </Text>
        )}
        {receipt?.computed && (
          <Text>
            Computed type: {receipt.computed.fontSize} /{' '}
            {receipt.computed.lineHeight} · tracking{' '}
            {receipt.computed.letterSpacing}. Computed style does not establish
            a resolved glyph baseline or ink.
          </Text>
        )}
        <Text>
          Historical starting preset: {resolved.inputIdentity.slice(0, 12)}. New
          renderer and choice validation pending.
        </Text>
        <FrameConsequences />
        <Text>
          Proposed row: {chosen['service-row.rowHeight']} · font{' '}
          {chosen['service-row.fontSize']} · gap {chosen['workspace.gap']} ·
          spring {chosen['appearance.spring.stiffness']} /{' '}
          {chosen['appearance.spring.damping']}
        </Text>
        <Text>
          Observed geometry is separate from proposed values. Native
          baseline/ink extraction and variable-axis application are unsupported.
          Static native finishes approximate material roles.
        </Text>
        <Heading>Editable Roboto Flex axes</Heading>
        {Object.entries(fontAxes).map(([tag, axis]) => (
          <Field
            key={tag}
            id={'axis-' + tag}
            label={
              tag +
              ' · ' +
              axis.min +
              ' to ' +
              axis.max +
              (Platform.OS === 'web' ? '' : ' · native unsupported')
            }
            value={state.preferences.axes?.[tag] ?? axis.default}
            onChange={(value) => {
              const numeric = Number(value);
              if (
                Number.isFinite(numeric) &&
                numeric >= axis.min &&
                numeric <= axis.max
              )
                dispatch({
                  type: 'preferences',
                  patch: {
                    axes: { ...state.preferences.axes, [tag]: numeric },
                  },
                });
            }}
          />
        ))}
        <Text tone="muted">
          Inspecting does not change the selected control's hit geometry.
        </Text>
      </Column>
    </InspectorPanel>
  );
}
function TechnicalMedia({ kind }) {
  const ui = useContext(UI);
  return (
    <Column gap={6}>
      <MediaImage
        id={'technical-' + kind}
        source={
          kind === 'topology'
            ? require('../assets/service-topology.png')
            : require('../assets/diagnostic-trace.png')
        }
        alt={
          kind === 'topology'
            ? 'Synthetic dependency reference: checkout-api calls inventory-cache, payments and pricing. Interactive dependency links are above.'
            : 'Synthetic diagnostic trace reference: 2,180 ms root; cache.pool.acquire spans 1,340 ms within inventory.reserve. Interactive spans are above.'
        }
      />
      <Text tone="muted" size={12}>
        Original MIT technical reference · contain fit preserves labels ·
        interactive data and accessible text are provided above.
      </Text>
    </Column>
  );
}
function displayName(state, entity) {
  return (
    (entity.name ?? entity.title) +
    (state.preferences.longText &&
    ['service-001', 'INC-1042'].includes(entity.id)
      ? ' · Long-label stress preview: multi-region checkout orchestration and inventory connection-pool investigation'
      : '')
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Screen>
        <Root />
      </Screen>
    </SafeAreaProvider>
  );
}
