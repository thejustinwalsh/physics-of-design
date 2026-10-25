import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
} from 'react';
import {
  View,
  Image,
  Modal,
  useWindowDimensions,
  useColorScheme,
  Platform,
  StatusBar,
  Dimensions,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native';
import {
  ObservedScrollView as ScrollView,
  ObservedText as Text,
  ObservedPressable as Pressable,
  NativeObservationProvider,
  ObservedMedia,
  ObservedTextInput as TextInput,
  requestNativeObservation,
} from './observations';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { planComposition, cropMedia } from '../src/composition-plan';
import content from '../examples/fieldwork/content.json';

const images = {
  headland: require('./assets/fieldwork/headland.png'),
  forest: require('./assets/fieldwork/forest.png'),
};
type Story = (typeof content.stories)[number];
type Screen = 'journal' | 'explore' | 'saved';
function Icon({
  name,
  color,
  size = 23,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  const paths: Record<string, string> = {
    book: 'M3 4h6c2 0 3 1 3 2v15c0-2-1-3-3-3H3z M21 4h-6c-2 0-3 1-3 2v15c0-2 1-3 3-3h6z',
    search: 'M15.5 15.5L21 21',
    saved: 'M6 3h12v18l-6-4-6 4z',
    back: 'M15 5l-7 7 7 7',
    arrow: 'M4 12h16 M14 6l6 6-6 6',
    close: 'M6 6l12 12 M18 6L6 18',
    check: 'M5 12l4 4 10-10',
    text: 'M4 5h16 M12 5v15 M8 20h8',
    sun: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'search' && <Circle cx="10" cy="10" r="7" />}
      {name === 'sun' && <Circle cx="12" cy="12" r="4" />}
      <Path d={paths[name] ?? paths.book} />
    </Svg>
  );
}
function Artwork({
  story,
  width,
  height,
  radius = 0,
  role = 'editorial',
}: {
  story: Story;
  width: number;
  height: number;
  radius?: number;
  role?: string;
}) {
  if (story.format === 'guide')
    return (
      <ObservedMedia
        observationName={story.id}
        observationRole={role}
        style={{
          width,
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: '#dedfc8',
          flexShrink: 0,
        }}
      >
        <Svg width={width} height={height} viewBox="0 0 600 400">
          {[35, 65, 95, 125, 155].map((r) => (
            <Circle
              key={r}
              cx={300}
              cy={200}
              r={r}
              fill="none"
              stroke="#53634a"
              strokeWidth={2}
            />
          ))}
          <Path
            d="M100 200h400M300 20v360"
            stroke="#53634a"
            strokeWidth={1.4}
          />
          <Circle cx={300} cy={200} r={9} fill="#8d3d26" />
        </Svg>
      </ObservedMedia>
    );
  const crop = cropMedia({
    sourceWidth: 1536,
    sourceHeight: 1024,
    width,
    height,
    focalX: story.focal.x,
    focalY: story.focal.y,
  });
  return (
    <ObservedMedia
      observationName={story.id}
      observationRole={role}
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <Image
        source={images[story.image as keyof typeof images]}
        accessibilityLabel={story.caption}
        style={{
          width: crop.drawWidth,
          height: crop.drawHeight,
          flexShrink: 0,
          transform: [
            { translateX: crop.offsetX },
            { translateY: crop.offsetY },
          ],
        }}
      />
    </ObservedMedia>
  );
}
type AppColors = {
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  line: string;
};
function SaveButton({
  story,
  saved,
  colors,
  onToggle,
  size,
}: {
  story: Story;
  saved: boolean;
  colors: AppColors;
  onToggle: (id: string) => void;
  size: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${saved ? 'Remove' : 'Save'} ${story.title}`}
      onPress={() => onToggle(story.id)}
      style={{
        minWidth: size,
        minHeight: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        backgroundColor: colors.surface,
      }}
    >
      <Icon name={saved ? 'check' : 'saved'} color={colors.accent} size={21} />
    </Pressable>
  );
}
export default function FieldworkApp({
  initialScreen = 'journal',
  initialStory = '',
  density = 1,
  expression = 1,
  proofId = '',
}: {
  initialScreen?: Screen;
  initialStory?: string;
  density?: number;
  expression?: number;
  proofId?: string;
}) {
  return (
    <SafeAreaProvider>
      <Fieldwork
        initialScreen={initialScreen}
        initialStory={initialStory}
        density={density}
        expression={expression}
        proofId={proofId}
      />
    </SafeAreaProvider>
  );
}
function Fieldwork({
  initialScreen,
  initialStory,
  density,
  expression,
  proofId,
}: {
  initialScreen: Screen;
  initialStory: string;
  density: number;
  expression: number;
  proofId: string;
}) {
  const window = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    scheme = useColorScheme();
  const [loaded] = useFonts({
    FieldworkSans: require('../assets/fonts/Lato-Regular.ttf'),
    FieldworkHeavy: require('../assets/fonts/Lato-Black.ttf'),
    FieldworkSerif: require('../assets/fonts/Spectral-Regular.ttf'),
  });
  const [screen, setScreen] = useState<Screen>(initialScreen),
    [storyId, setStoryId] = useState(initialStory),
    [saved, setSaved] = useState<string[]>(['long-way-home']);
  const [hydrated, setHydrated] = useState(false),
    [imagesPrefetched, setImagesPrefetched] = useState(false),
    [storageError, setStorageError] = useState('');
  const [query, setQuery] = useState(''),
    [settings, setSettings] = useState(false),
    [readerSize, setReaderSize] = useState(21),
    [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>(
      'system',
    );
  const [progress, setProgress] = useState<Record<string, number>>({}),
    [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios')
      void AccessibilityInfo.isDarkerSystemColorsEnabled().then(
        setHighContrast,
      );
    const sub = AccessibilityInfo.addEventListener(
      'darkerSystemColorsChanged',
      setHighContrast,
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem('fieldwork-reading-v1')
      .then((raw) => {
        if (!raw || !live) return;
        const value: unknown = JSON.parse(raw);
        if (
          !value ||
          typeof value !== 'object' ||
          !('saved' in value) ||
          !Array.isArray(value.saved) ||
          !value.saved.every(
            (id) =>
              typeof id === 'string' &&
              content.stories.some((story) => story.id === id),
          ) ||
          !('readerSize' in value) ||
          ![17, 21, 25].includes(Number(value.readerSize)) ||
          !('appearance' in value) ||
          !['system', 'light', 'dark'].includes(String(value.appearance)) ||
          !('progress' in value) ||
          !value.progress ||
          typeof value.progress !== 'object' ||
          Object.entries(value.progress).some(
            ([id, amount]) =>
              !content.stories.some((story) => story.id === id) ||
              typeof amount !== 'number' ||
              !Number.isFinite(amount) ||
              amount < 0 ||
              amount > 1,
          )
        )
          throw new Error('Invalid local reading state');
        setSaved(value.saved);
        setReaderSize(Number(value.readerSize));
        setAppearance(value.appearance as 'system' | 'light' | 'dark');
        setProgress(value.progress as Record<string, number>);
      })
      .catch(() => {
        if (live)
          setStorageError(
            'Your previous reading settings could not be restored.',
          );
      })
      .finally(() => {
        if (live) setHydrated(true);
      });
    void Promise.all(
      Object.values(images).map((image) => {
        const uri = Image.resolveAssetSource(image)?.uri;
        if (!uri) return Promise.resolve(false);
        return uri.startsWith('http')
          ? Image.prefetch(uri)
          : Promise.resolve(true);
      }),
    )
      .then((results) => {
        if (live) setImagesPrefetched(results.every(Boolean));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(
      'fieldwork-reading-v1',
      JSON.stringify({ saved, readerSize, appearance, progress }),
    ).catch(() =>
      setStorageError(
        'Your reading settings could not be saved on this device.',
      ),
    );
  }, [hydrated, saved, readerSize, appearance, progress]);
  const dark =
    appearance === 'dark' || (appearance === 'system' && scheme === 'dark');
  const c = dark
    ? {
        canvas: '#171e1b',
        surface: '#242e28',
        ink: '#f6f3e9',
        muted: highContrast ? '#e2e4dc' : '#bec5bb',
        line: '#48554c',
        accent: '#cad9b6',
        accentBg: '#364735',
        paper: '#30362b',
      }
    : {
        canvas: '#f8f7f2',
        surface: '#efeee7',
        ink: '#202b25',
        muted: highContrast ? '#37463c' : '#5e695f',
        line: '#d8ddd1',
        accent: '#345440',
        accentBg: '#e3eadb',
        paper: '#eee5d5',
      };
  const p = useMemo(
    () =>
      planComposition({
        mode: 'app',
        width: window.width - insets.left - insets.right,
        textScale: window.fontScale,
        density,
        expression,
        readingSize: readerSize,
      }),
    [
      window.width,
      window.fontScale,
      insets.left,
      insets.right,
      density,
      expression,
      readerSize,
    ],
  );
  const selected = content.stories.find((s) => s.id === storyId);
  const text = (size: number, family = 'FieldworkSans', color = c.ink) => ({
    fontFamily: family,
    fontSize: size,
    color,
  });
  const control = {
    minWidth: p.controlSize,
    minHeight: p.controlSize,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const readerScroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    readerGeometry = useRef({ content: 0, viewport: 0, offset: 0 }),
    restoredFor = useRef(''),
    restoring = useRef(false);
  useLayoutEffect(() => {
    restoredFor.current = '';
    restoring.current = true;
  }, [readerSize, window.width, window.fontScale]);
  function restoreReading() {
    if (
      !selected ||
      restoredFor.current === selected.id ||
      readerGeometry.current.content <= 0 ||
      readerGeometry.current.viewport <= 0
    )
      return;
    const offset =
      (progress[selected.id] ?? 0) *
      Math.max(
        0,
        readerGeometry.current.content - readerGeometry.current.viewport,
      );
    restoredFor.current = selected.id;
    restoring.current = true;
    requestAnimationFrame(() => {
      readerScroll.current?.scrollTo({ y: offset, animated: false });
      setTimeout(() => {
        restoring.current = false;
      }, 150);
    });
  }
  function selectStory(id: string) {
    restoredFor.current = '';
    readerGeometry.current = { content: 0, viewport: 0, offset: 0 };
    restoring.current = true;
    setStoryId(id);
  }
  function openStory(story: Story) {
    selectStory(story.id);
  }
  function toggleSaved(id: string) {
    setSaved((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }
  function nav(next: Screen) {
    setStoryId('');
    setScreen(next);
  }
  if (!loaded || !hydrated)
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <Text style={{ margin: 40 }}>Opening Fieldwork…</Text>
      </View>
    );

  function StoryRow({ story }: { story: Story }) {
    return (
      <View
        style={{
          flexDirection: window.fontScale > 1.5 ? 'column' : 'row',
          alignItems: 'flex-start',
          gap: p.spaces.related,
          paddingVertical: p.spaces.group,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: c.line,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Read ${story.title}`}
          onPress={() => openStory(story)}
          style={{ flexDirection: 'row', flex: 1, gap: p.spaces.related }}
        >
          <Artwork
            role="thumbnail"
            story={story}
            width={92}
            height={104}
            radius={10}
          />
          <View style={{ flex: 1, gap: 7 }}>
            <Text style={text(11, 'FieldworkHeavy', c.muted)}>
              {story.category.toUpperCase()}
            </Text>
            <Text style={[text(23, 'FieldworkSerif'), { lineHeight: 27 }]}>
              {story.title}
            </Text>
            <Text style={text(12, 'FieldworkSans', c.muted)}>
              {story.minutes} min read
              {saved.includes(story.id) ? ' · Saved on this device' : ''}
            </Text>
          </View>
        </Pressable>
        <SaveButton
          story={story}
          saved={saved.includes(story.id)}
          colors={c}
          onToggle={toggleSaved}
          size={p.controlSize}
        />
      </View>
    );
  }
  const navigation = (
    <>
      {(['journal', 'explore', 'saved'] as Screen[]).map((item, index) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: screen === item }}
          accessibilityLabel={['Journal', 'Explore', 'Saved'][index]}
          onPress={() => nav(item)}
          style={[
            control,
            {
              flexDirection: p.navigation === 'sidebar' ? 'row' : 'column',
              justifyContent:
                p.navigation === 'sidebar' ? 'flex-start' : 'center',
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 16,
              backgroundColor: screen === item ? c.accentBg : 'transparent',
              ...(p.navigation === 'sidebar' ? {} : { flex: 1 }),
            },
          ]}
        >
          <Icon
            name={['book', 'search', 'saved'][index]}
            color={screen === item ? c.accent : c.muted}
          />
          <Text
            style={text(
              p.navigation === 'sidebar' ? 16 : 11,
              screen === item ? 'FieldworkHeavy' : 'FieldworkSans',
              screen === item ? c.accent : c.muted,
            )}
          >
            {['Journal', 'Explore', 'Saved'][index]}
          </Text>
        </Pressable>
      ))}
    </>
  );
  return (
    <NativeObservationProvider
      snapshot={{
        proofId,
        screen: selected ? 'reader' : screen,
        story: selected?.id ?? null,
        saved,
        query,
        readerSize,
        imagesPrefetched,
        hydrated,
        readerPosition: readerGeometry.current,
        restoredFor: restoredFor.current,
        appearance: dark ? 'dark' : 'light',
        highContrast,
        plan: p,
        window,
        coordinateSpace: {
          units: 'dp',
          origin:
            Platform.OS === 'android'
              ? 'window excluding status bar'
              : 'window',
          screenOffset: {
            x: 0,
            y: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
          },
          screen: Dimensions.get('screen'),
        },
        safeArea: insets,
        palette: c,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          backgroundColor: c.canvas,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {p.navigation === 'sidebar' && (
          <View
            style={{
              width: p.sidebarWidth,
              paddingTop: insets.top + 30,
              paddingHorizontal: 18,
              gap: 24,
              backgroundColor: c.surface,
              borderRightWidth: StyleSheet.hairlineWidth,
              borderColor: c.line,
            }}
          >
            <Text
              style={[
                text(30, 'FieldworkHeavy'),
                { letterSpacing: -1, marginLeft: 14 },
              ]}
            >
              Fieldwork.
            </Text>
            <Text
              style={[
                text(12, 'FieldworkSans', c.muted),
                { marginHorizontal: 14, marginBottom: 18 },
              ]}
            >
              A little further outside.
            </Text>
            <View style={{ gap: 10 }}>{navigation}</View>
            <View style={{ flex: 1 }} />
            <Text
              style={[
                text(12, 'FieldworkSans', c.muted),
                { margin: 14, marginBottom: insets.bottom + 30 },
              ]}
            >
              ISSUE 08{'\n'}The outside issue
            </Text>
          </View>
        )}
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View
            style={{
              paddingHorizontal: p.gutter,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderBottomWidth: selected ? StyleSheet.hairlineWidth : 0,
              borderColor: c.line,
            }}
          >
            {selected ? (
              <Pressable
                accessibilityLabel={`Back to ${screen === 'saved' ? 'saved stories' : screen === 'explore' ? 'search results' : 'the journal'}`}
                accessibilityRole="button"
                onPress={() => setStoryId('')}
                style={control}
              >
                <Icon name="back" color={c.ink} />
              </Pressable>
            ) : (
              <Text
                style={[text(23, 'FieldworkHeavy'), { letterSpacing: -0.8 }]}
              >
                {p.navigation === 'sidebar'
                  ? screen === 'saved'
                    ? 'Your library'
                    : screen === 'explore'
                      ? 'Explore stories'
                      : 'The outside issue'
                  : 'Fieldwork.'}
              </Text>
            )}
            <View style={{ flex: 1 }} />
            {selected && (
              <SaveButton
                story={selected}
                saved={saved.includes(selected.id)}
                colors={c}
                onToggle={toggleSaved}
                size={p.controlSize}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reading and appearance settings"
              onPress={() => setSettings(true)}
              style={[
                control,
                { borderRadius: 24, backgroundColor: c.surface },
              ]}
            >
              <Icon name={selected ? 'text' : 'sun'} color={c.ink} />
            </Pressable>
          </View>
          <ScrollView
            ref={readerScroll}
            onLayout={(event) => {
              readerGeometry.current.viewport = event.nativeEvent.layout.height;
              restoreReading();
            }}
            onContentSizeChange={(_width, height) => {
              readerGeometry.current.content = height;
              restoreReading();
            }}
            key={selected?.id ?? screen}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32, alignItems: 'center' }}
            onScroll={(event) => {
              const e = event.nativeEvent;
              readerGeometry.current.offset = e.contentOffset.y;
              if (selected && !restoring.current) {
                const denominator =
                  e.contentSize.height - e.layoutMeasurement.height;
                setProgress((current) => ({
                  ...current,
                  [selected.id]:
                    denominator > 0
                      ? Math.min(
                          1,
                          Math.max(0, e.contentOffset.y / denominator),
                        )
                      : 1,
                }));
              }
            }}
            scrollEventThrottle={100}
          >
            {selected ? (
              <View style={{ width: '100%', maxWidth: 1000 }}>
                <Artwork
                  role="reader"
                  story={selected}
                  width={Math.min(
                    1000,
                    window.width -
                      (p.navigation === 'sidebar' ? p.sidebarWidth : 0) -
                      insets.left -
                      insets.right,
                  )}
                  height={
                    Math.min(
                      1000,
                      window.width -
                        (p.navigation === 'sidebar' ? p.sidebarWidth : 0) -
                        insets.left -
                        insets.right,
                    ) / p.readerImageAspect
                  }
                />
                <View
                  style={{
                    padding: p.gutter,
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: p.readingMeasure + 2 * p.gutter,
                    gap: p.spaces.group,
                  }}
                >
                  <Text style={text(11, 'FieldworkHeavy', c.accent)}>
                    {selected.category.toUpperCase()}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    style={[
                      text(p.titleSize * 1.08, 'FieldworkSerif'),
                      { lineHeight: p.titleSize * 1.14, letterSpacing: -0.8 },
                    ]}
                  >
                    {selected.title}
                  </Text>
                  <Text
                    style={[
                      text(18, 'FieldworkSans', c.muted),
                      { lineHeight: 27 },
                    ]}
                  >
                    {selected.deck}
                  </Text>
                  <Text style={text(12, 'FieldworkSans', c.muted)}>
                    {selected.byline} · {selected.minutes} min read
                  </Text>
                  <View
                    style={{
                      height: 1,
                      backgroundColor: c.line,
                      marginVertical: 8,
                    }}
                  />
                  {selected.paragraphs.map((paragraph, i) => (
                    <Text
                      key={i}
                      style={[
                        text(readerSize, 'FieldworkSerif'),
                        { lineHeight: readerSize * p.readingLeading },
                      ]}
                    >
                      {paragraph}
                    </Text>
                  ))}
                  <Text
                    style={[
                      text(11, 'FieldworkSans', c.muted),
                      { marginTop: 16 },
                    ]}
                  >
                    {selected.caption}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setStoryId('')}
                    style={{
                      minHeight: 48,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    <Text style={text(16, 'FieldworkHeavy', c.accent)}>
                      {screen === 'saved'
                        ? 'Back to saved stories'
                        : screen === 'explore'
                          ? 'Back to search results'
                          : 'Back to the journal'}
                    </Text>
                    <Icon name="arrow" color={c.accent} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View
                style={{
                  width: '100%',
                  maxWidth: 1120 + 2 * p.gutter,
                  paddingHorizontal: p.gutter,
                }}
              >
                <View
                  style={{
                    paddingTop: p.spaces.group,
                    paddingBottom: p.spaces.section,
                    gap: p.spaces.inline,
                  }}
                >
                  <Text style={text(11, 'FieldworkHeavy', c.muted)}>
                    {screen === 'journal'
                      ? 'ISSUE 08  /  THE OUTSIDE ISSUE'
                      : screen === 'saved'
                        ? 'YOUR PERSONAL COLLECTION'
                        : 'FOLLOW YOUR CURIOSITY'}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    style={[
                      text(p.titleSize, 'FieldworkHeavy'),
                      { letterSpacing: -1 },
                    ]}
                  >
                    {screen === 'journal'
                      ? 'The journal'
                      : screen === 'saved'
                        ? 'Saved for later'
                        : 'Find your next read'}
                  </Text>
                  <Text
                    style={[
                      text(17, 'FieldworkSans', c.muted),
                      { lineHeight: 24 },
                    ]}
                  >
                    {screen === 'journal'
                      ? 'Stories for a more observant life.'
                      : screen === 'saved'
                        ? `${saved.length} ${saved.length === 1 ? 'story' : 'stories'} · Saved on this device.`
                        : 'Places, ideas and things worth noticing.'}
                  </Text>
                </View>
                {screen === 'explore' && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      minHeight: 52,
                      borderRadius: 14,
                      backgroundColor: c.surface,
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <Icon name="search" color={c.muted} />
                    <TextInput
                      accessibilityLabel="Search stories"
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search stories and places"
                      placeholderTextColor={c.muted}
                      style={[text(17), { flex: 1, minHeight: 48 }]}
                    />
                  </View>
                )}
                {screen === 'journal' && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Read The art of looking longer"
                      onPress={() => openStory(content.stories[0])}
                    >
                      <Artwork
                        role="cover"
                        story={content.stories[0]}
                        width={p.contentWidth}
                        height={p.contentWidth / p.imageAspect}
                        radius={18}
                      />
                      <View style={{ paddingTop: 18, gap: p.spaces.inline }}>
                        <Text style={text(11, 'FieldworkHeavy', c.accent)}>
                          THE COVER STORY
                        </Text>
                        <Text
                          style={[
                            text(p.storyTitleSize, 'FieldworkSerif'),
                            {
                              lineHeight: p.storyTitleSize * 1.13,
                              letterSpacing: -0.4,
                            },
                          ]}
                        >
                          The art of looking longer
                        </Text>
                        <Text
                          style={[
                            text(16, 'FieldworkSans', c.muted),
                            { lineHeight: 23 },
                          ]}
                        >
                          A quiet place. A longer look. A different kind of
                          attention.
                        </Text>
                      </View>
                    </Pressable>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingTop: 10,
                        paddingBottom: p.spaces.section,
                      }}
                    >
                      <Text
                        style={[
                          text(12, 'FieldworkSans', c.muted),
                          { flex: 1 },
                        ]}
                      >
                        Fieldwork studio · {content.stories[0].minutes} min read
                      </Text>
                      <SaveButton
                        story={content.stories[0]}
                        saved={saved.includes(content.stories[0].id)}
                        colors={c}
                        onToggle={toggleSaved}
                        size={p.controlSize}
                      />
                    </View>
                    {Object.values(progress).some((value) => value > 0) && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Resume reading"
                        onPress={() =>
                          selectStory(
                            Object.keys(progress).find(
                              (id) => progress[id] > 0,
                            ) ?? '',
                          )
                        }
                        style={{
                          padding: 20,
                          backgroundColor: c.paper,
                          borderRadius: 14,
                          gap: p.spaces.inline,
                          marginBottom: 24,
                        }}
                      >
                        <Text style={text(11, 'FieldworkHeavy', c.muted)}>
                          PICK UP WHERE YOU LEFT OFF
                        </Text>
                        <Text style={text(21, 'FieldworkSerif')}>
                          {
                            content.stories.find((s) => progress[s.id] > 0)
                              ?.title
                          }
                        </Text>
                        <Text style={text(12, 'FieldworkSans', c.muted)}>
                          Your reading position is saved on this device.
                        </Text>
                      </Pressable>
                    )}
                    <Text
                      style={[text(13, 'FieldworkHeavy'), { marginBottom: 4 }]}
                    >
                      Further afield
                    </Text>
                    {content.stories.slice(1).map((story) => (
                      <StoryRow key={story.id} story={story} />
                    ))}
                  </>
                )}
                {screen !== 'journal' &&
                  (() => {
                    const stories = content.stories.filter(
                      (story) =>
                        (screen !== 'saved' || saved.includes(story.id)) &&
                        (screen !== 'explore' ||
                          `${story.title} ${story.category} ${story.deck}`
                            .toLowerCase()
                            .includes(query.toLowerCase())),
                    );
                    return stories.length ? (
                      stories.map((story) => (
                        <StoryRow key={story.id} story={story} />
                      ))
                    ) : (
                      <View
                        style={{
                          paddingVertical: 48,
                          alignItems: 'center',
                          gap: 18,
                        }}
                      >
                        <Icon
                          name={screen === 'saved' ? 'saved' : 'search'}
                          color={c.muted}
                          size={36}
                        />
                        <Text style={text(24, 'FieldworkSerif')}>
                          {screen === 'saved'
                            ? 'Make a little room for curiosity.'
                            : 'No stories found.'}
                        </Text>
                        <Text
                          style={[
                            text(16, 'FieldworkSans', c.muted),
                            { textAlign: 'center', lineHeight: 24 },
                          ]}
                        >
                          {screen === 'saved'
                            ? 'Save a story from the journal and it will be here when you need it.'
                            : 'Try architecture, routes or noticing.'}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            screen === 'saved'
                              ? 'Explore the journal'
                              : 'Clear search'
                          }
                          onPress={() =>
                            screen === 'saved' ? nav('journal') : setQuery('')
                          }
                          style={{
                            minHeight: 48,
                            paddingHorizontal: 24,
                            justifyContent: 'center',
                            backgroundColor: c.accentBg,
                            borderRadius: 24,
                          }}
                        >
                          <Text style={text(16, 'FieldworkHeavy', c.accent)}>
                            {screen === 'saved'
                              ? 'Explore the journal'
                              : 'Clear search'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                {storageError && (
                  <Text
                    accessibilityRole="alert"
                    style={text(13, 'FieldworkSans', c.muted)}
                  >
                    {storageError}
                  </Text>
                )}
                <Text
                  style={[
                    text(11, 'FieldworkSans', c.muted),
                    { marginTop: 20, marginBottom: 16, lineHeight: 16 },
                  ]}
                >
                  An original publication concept. Stories and imagined
                  landscapes by Fieldwork studio.
                </Text>
              </View>
            )}
          </ScrollView>
          {selected && (
            <View style={{ height: 3, backgroundColor: c.line }}>
              <View
                style={{
                  width: `${(progress[selected.id] ?? 0) * 100}%`,
                  height: 3,
                  backgroundColor: c.accent,
                }}
              />
            </View>
          )}
          {p.navigation === 'tabs' && (
            <View
              accessibilityRole="tablist"
              style={{
                flexDirection: 'row',
                gap: 4,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: Math.max(10, insets.bottom),
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: c.line,
                backgroundColor: c.canvas,
              }}
            >
              {navigation}
            </View>
          )}
        </View>
        <Modal
          visible={settings}
          transparent
          animationType="none"
          onRequestClose={() => setSettings(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: '#00000066',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <ScrollView
              style={{
                width: '100%',
                maxWidth: 620,
                maxHeight: window.height - insets.top,
                backgroundColor: c.canvas,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
              }}
              contentContainerStyle={{
                padding: 28,
                paddingBottom: insets.bottom + 28,
                gap: 22,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  accessibilityRole="header"
                  style={[text(26, 'FieldworkHeavy'), { flex: 1 }]}
                >
                  Make yourself at home
                </Text>
                <Pressable
                  accessibilityLabel="Close settings"
                  accessibilityRole="button"
                  onPress={() => setSettings(false)}
                  style={control}
                >
                  <Icon name="close" color={c.ink} />
                </Pressable>
              </View>
              <Text style={text(16, 'FieldworkHeavy')}>Reading size</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {[17, 21, 25].map((size) => (
                  <Pressable
                    key={size}
                    accessibilityRole="button"
                    accessibilityLabel={`Reading size ${size}`}
                    accessibilityState={{ selected: readerSize === size }}
                    onPress={() => setReaderSize(size)}
                    style={[
                      control,
                      {
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor:
                          readerSize === size ? c.accentBg : c.surface,
                      },
                    ]}
                  >
                    <Text style={text(size, 'FieldworkSerif')}>Aa</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={text(16, 'FieldworkHeavy')}>Appearance</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {(['system', 'light', 'dark'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: appearance === value }}
                    onPress={() => setAppearance(value)}
                    style={[
                      control,
                      {
                        paddingHorizontal: 18,
                        borderRadius: 24,
                        backgroundColor:
                          appearance === value ? c.accentBg : c.surface,
                      },
                    ]}
                  >
                    <Text style={text(15, 'FieldworkSans')}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text
                style={[text(13, 'FieldworkSans', c.muted), { lineHeight: 19 }]}
              >
                Text also follows your device’s accessibility size. Your reading
                list, position and preferences stay on this device. Internet
                access may be needed to reopen stories.
              </Text>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </NativeObservationProvider>
  );
}
