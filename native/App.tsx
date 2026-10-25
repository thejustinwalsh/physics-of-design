import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Platform,
  PixelRatio,
  Linking,
  useWindowDimensions,
  type LayoutRectangle,
  type TextStyle,
  type ViewStyle,
  type TextLayoutEvent,
} from 'react-native';
import * as Font from 'expo-font';
import FieldworkApp from './FieldworkApp';
import VelaApp from './VelaApp';
import { requireOptionalNativeModule } from 'expo';

const endpoint =
  process.env.EXPO_PUBLIC_DESIGN_BRIDGE ?? 'http://127.0.0.1:4319';
const token = process.env.EXPO_PUBLIC_DESIGN_TOKEN ?? 'local-spike';
type Line = LayoutRectangle & { text: string; start: number; end: number };
type TextLayoutLine = TextLayoutEvent['nativeEvent']['lines'][number];
type Job = {
  id: string;
  lease: string;
  inputHash: string;
  state: { viewport: { width: number }; padding: number; platform: string };
  fonts: { alias: string; uri: string }[];
  mapping: {
    gaps: number[];
    container: ViewStyle;
    blocks: {
      id: string;
      text: string;
      style: TextStyle;
      maxHeight: number | null;
      layoutStyle: ViewStyle;
      props: {
        allowFontScaling: boolean;
        accessible: boolean;
        accessibilityRole: 'header' | 'text';
      };
    }[];
  };
};

function MeasurementApp() {
  const window = useWindowDimensions();
  const [job, setJob] = useState<Job | null>(null);
  const [probes, setProbes] = useState<
    { jobId: string; blockId: string; index: number; text: string }[]
  >([]);
  const visibleWidths = useRef(new Map<string, number>());
  const [status, setStatus] = useState(
    'Connecting to local measurement bridge…',
  );
  const origin = useRef<LayoutRectangle | null>(null);
  const active = useRef(false);
  const currentId = useRef<string | null>(null);
  const measurements = useRef(
    new Map<string, { box?: LayoutRectangle; raw?: TextLayoutLine[] }>(),
  );
  const reported = useRef(false);
  useEffect(() => {
    let alive = true;
    async function poll() {
      if (active.current) return;
      active.current = true;
      try {
        const res = await fetch(
          `${endpoint}/next?platform=native-${Platform.OS}&fontScale=${PixelRatio.getFontScale()}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (res.status === 204) {
          active.current = false;
          return;
        }
        if (!res.ok) throw new Error(`Bridge status ${res.status}`);
        const next = (await res.json()) as Job;
        currentId.current = next.id;
        try {
          for (const f of next.fonts)
            if (!Font.isLoaded(f.alias))
              await Font.loadAsync(f.alias, {
                uri: f.uri.replace('http://127.0.0.1:4319', endpoint),
              });
          measurements.current.clear();
          origin.current = null;
          visibleWidths.current.clear();
          setProbes([]);
          reported.current = false;
          if (alive) {
            setJob(next);
            setStatus(`Measuring ${next.id}`);
          }
        } catch (e) {
          await fetch(`${endpoint}/jobs/${next.id}`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'x-design-lease': next.lease,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ error: String(e) }),
          });
          active.current = false;
          throw e;
        }
      } catch (e) {
        active.current = false;
        if (alive) setStatus(String(e));
      }
    }
    const timer = setInterval(() => void poll(), 200);
    void poll();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  async function finish(current: Job) {
    if (
      current.id !== currentId.current ||
      !origin.current ||
      reported.current ||
      current.mapping.blocks.some(
        (b) =>
          !measurements.current.get(b.id)?.box ||
          !measurements.current.get(b.id)?.raw ||
          measurements.current
            .get(b.id)!
            .raw!.some(
              (line, index) =>
                line.text.trimEnd() !== line.text &&
                line.text.trimEnd().length > 0 &&
                !visibleWidths.current.has(`${b.id}:${index}`),
            ),
      )
    )
      return;
    reported.current = true;
    const blocks = current.mapping.blocks.map((b) => {
      const m = measurements.current.get(b.id)!;
      const box = {
        ...m.box!,
        x: m.box!.x + origin.current!.x,
        y: m.box!.y + origin.current!.y,
      };
      let cursor = 0;
      const lines: Line[] = m.raw!.map((l, index) => {
        let start = b.text.indexOf(l.text, cursor);
        if (start < 0) start = cursor;
        cursor = start + l.text.length;
        return {
          x: box.x + l.x,
          y: box.y + l.y,
          width:
            l.text.trimEnd() === l.text
              ? l.width
              : (visibleWidths.current.get(`${b.id}:${index}`) ?? 0),
          height: l.height,
          text: l.text,
          start,
          end: cursor,
        };
      });
      const x = Math.min(...lines.map((l) => l.x)),
        y = Math.min(...lines.map((l) => l.y)),
        right = Math.max(...lines.map((l) => l.x + l.width)),
        bottom = Math.max(...lines.map((l) => l.y + l.height));
      return {
        id: b.id,
        box,
        lines,
        inlineBounds: lines.length
          ? { x, y, width: right - x, height: bottom - y }
          : null,
        inkBounds: null,
        overflowX: lines.length
          ? Math.max(0, right - box.x - box.width, box.x - x)
          : 0,
        overflowY:
          b.maxHeight !== null ? Math.max(0, bottom - box.y - box.height) : 0,
      };
    });
    try {
      const v = Platform.constants.reactNativeVersion;
      const receipt = {
        inputHash: current.inputHash,
        platform: `native-${Platform.OS}`,
        engine: 'react-native/Text+Yoga',
        runtime: {
          reactNative: `${v.major}.${v.minor}.${v.patch}`,
          implementationIdentity:
            process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound',
          os: String(Platform.Version),
          fontScale: PixelRatio.getFontScale(),
          pixelRatio: PixelRatio.get(),
          windowWidth: window.width,
          windowHeight: window.height,
          deviceType:
            Platform.OS === 'ios'
              ? Platform.isPad
                ? 'tablet'
                : 'phone'
              : 'android-emulator',
        },
        loadedFonts: current.fonts
          .map((f) => f.alias)
          .filter((f) => Font.isLoaded(f)),
        blocks,
      };
      const response = await fetch(`${endpoint}/jobs/${current.id}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'x-design-lease': current.lease,
          'content-type': 'application/json',
        },
        body: JSON.stringify(receipt),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus(`Delivered ${current.id} · ${Platform.OS} native text + Yoga`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      active.current = false;
    }
  }
  function update(
    current: Job,
    id: string,
    value: { box?: LayoutRectangle; raw?: TextLayoutLine[] },
  ) {
    if (current.id !== currentId.current) return;
    measurements.current.set(id, { ...measurements.current.get(id), ...value });
    if (value.raw) {
      const next = value.raw
        .map((line, index) => ({
          jobId: current.id,
          blockId: id,
          index,
          text: line.text.trimEnd() === line.text ? '' : line.text.trimEnd(),
        }))
        .filter((p) => p.text.length > 0);
      setProbes((existing) => {
        const other = existing.filter((p) => p.blockId !== id);
        return JSON.stringify(existing.filter((p) => p.blockId === id)) ===
          JSON.stringify(next)
          ? existing
          : [...other, ...next];
      });
    }
    void finish(current);
  }
  return (
    <ScrollView
      style={{ flex: 1, flexDirection: 'column', backgroundColor: '#f6f4ed' }}
      contentContainerStyle={{ paddingTop: 64 }}
    >
      <Text style={{ fontSize: 12, padding: 16 }}>{status}</Text>
      <ScrollView horizontal>
        {job && (
          <View
            key={job.id}
            style={{
              width: job.state.viewport.width,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexGrow: 0,
              flexShrink: 0,
              flexBasis: 'auto',
            }}
          >
            <View
              onLayout={(e) => {
                if (currentId.current !== job.id) return;
                origin.current = e.nativeEvent.layout;
                void finish(job);
              }}
              style={job.mapping.container}
            >
              {job.mapping.blocks.map((b, i) => (
                <View
                  key={`${job.id}-${b.id}`}
                  onLayout={(e) =>
                    update(job, b.id, { box: e.nativeEvent.layout })
                  }
                  style={{
                    width: b.style.width,
                    ...b.layoutStyle,
                    ...(b.maxHeight !== null
                      ? { maxHeight: b.maxHeight, overflow: 'hidden' as const }
                      : {}),
                  }}
                >
                  <Text
                    {...b.props}
                    style={{ ...b.style, color: b.style.color ?? '#171918' }}
                    onTextLayout={(e) =>
                      update(job, b.id, { raw: e.nativeEvent.lines })
                    }
                  >
                    {b.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          opacity: 0,
          width: 10000,
        }}
      >
        {job &&
          probes
            .filter((p) => p.jobId === job.id)
            .map((p) => {
              const block = job.mapping.blocks.find((b) => b.id === p.blockId)!;
              return (
                <Text
                  key={`${p.jobId}:${p.blockId}:${p.index}`}
                  {...block.props}
                  style={{ ...block.style, width: 10000 }}
                  onTextLayout={(e) => {
                    if (currentId.current !== p.jobId) return;
                    const line = e.nativeEvent.lines[0];
                    if (line)
                      visibleWidths.current.set(
                        `${p.blockId}:${p.index}`,
                        line.width,
                      );
                    void finish(job);
                  }}
                >
                  {p.text}
                </Text>
              );
            })}
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    void Linking.getInitialURL().then((value) => setUrl(value ?? ''));
    const listener = Linking.addEventListener('url', (event) =>
      setUrl(event.url),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!__DEV__ || !url.includes('proof=')) return;
    const prefs = requireOptionalNativeModule<{
      setPreferencesAsync: (value: {
        showFloatingActionButton: boolean;
      }) => Promise<void>;
    }>('DevMenuPreferences');
    void prefs
      ?.setPreferencesAsync({ showFloatingActionButton: false })
      .catch(() => {});
  }, [url]);
  if (url.includes('/--/vela')) {
    const query = new URL(url).searchParams,
      screen = query.get('screen');
    return (
      <VelaApp
        key={url}
        initialScreen={
          screen === 'detail' ||
          screen === 'active' ||
          screen === 'complete' ||
          screen === 'insights' ||
          screen === 'profile'
            ? screen
            : 'today'
        }
        proofId={query.get('proof') ?? ''}
      />
    );
  }
  if (url.includes('/--/fieldwork')) {
    const query = new URL(url).searchParams;
    const screen = query.get('screen');
    const parameter = (name: string) => {
      const value = Number(query.get(name) ?? 1);
      return Number.isFinite(value) && value >= 0.7 && value <= 1.4 ? value : 1;
    };
    return (
      <FieldworkApp
        key={url}
        initialScreen={
          screen === 'saved' || screen === 'explore' ? screen : 'journal'
        }
        initialStory={query.get('story') ?? ''}
        density={parameter('density')}
        expression={parameter('expression')}
        proofId={query.get('proof') ?? ''}
      />
    );
  }
  return <MeasurementApp />;
}
