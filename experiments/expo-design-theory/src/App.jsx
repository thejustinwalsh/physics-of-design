import React, { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { Platform, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import Scroll from './Scroll';
import { candidates, probeText, records } from './content';
import generated from './design.generated.json';
import { useObservations } from './useObservations';

const styles = css.create({
  root: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#ebe9e1', color: '#20291f', fontFamily: 'Lato', fontSize: 16 },
  safe: (top, bottom) => ({ paddingTop: top, paddingBottom: bottom }),
  frame: (padding, gap) => ({ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding, gap }),
  header: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#c4c9ba' },
  eyebrow: { color: '#4f5a47', fontSize: 12, lineHeight: 1.4, letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontSize: 36, lineHeight: 1.1, fontWeight: 400, letterSpacing: -1, marginTop: 14, marginBottom: 10 },
  body: { lineHeight: 1.5, color: '#4f5a47' },
  toolbar: { display: 'flex', flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: { boxSizing: 'border-box', maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingInline: 16, paddingBlock: 10, borderWidth: 1, borderStyle: 'solid', borderColor: '#b9c1ad', borderRadius: 24, backgroundColor: '#f7f7f1', color: '#20291f', fontSize: 16, lineHeight: 1.25, cursor: 'pointer' },
  active: { backgroundColor: '#d5ed7e', borderColor: '#789039' },
  layout: (direction, gap) => ({ display: 'flex', flexDirection: direction, alignItems: 'flex-start', gap }),
  region: (width) => ({ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, width, flexShrink: 0 }),
  sectionTitle: { fontSize: 20, lineHeight: 1.3, marginTop: 0, marginBottom: 8, fontWeight: 400 },
  row: (fontSize, lineHeight, tracking, minHeight, padding) => ({ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', width: '100%', minHeight, paddingBlock: padding, paddingInline: 16, gap: 8, fontSize, lineHeight, letterSpacing: tracking, color: '#20291f', backgroundColor: '#f8f8f2', borderWidth: 1, borderStyle: 'solid', borderColor: '#b8c0ad', borderRadius: 16, cursor: 'pointer' }),
  rowTop: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  meta: { fontSize: 12, lineHeight: 1.4, color: '#536046' },
  value: { fontSize: 27, lineHeight: 1.2, fontWeight: 400 },
  detail: { boxSizing: 'border-box', padding: 20, borderRadius: 20, backgroundColor: '#202e23', color: '#f1f4e9', gap: 18, display: 'flex', flexDirection: 'column' },
  detailBody: { fontSize: 18, lineHeight: 1.5 },
  muted: { color: '#bbc8b1' },
  note: { paddingTop: 16, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#d2d5c9', fontSize: 13, lineHeight: 1.5, color: '#526048' },
  probes: { position: 'absolute', left: 0, top: 0, opacity: 0, pointerEvents: 'none', width: 260, display: 'flex', flexDirection: 'column' },
  probe: (fontSize, lineHeight) => ({ width: 260, fontSize, lineHeight, fontFamily: 'Lato', letterSpacing: 0 }),
  scaledType: (size) => ({ fontSize: size }),
  hide: { display: 'none' },
});

function Review() {
  const windowSize = useWindowDimensions(), insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all'), [selected, setSelected] = useState(null);
  const [reviewed, setReviewed] = useState(['reservoir']), [enlarged, setEnlarged] = useState(false), [longText, setLongText] = useState(false);
  const textScale = enlarged ? 2 : 1;
  const platform = Platform.OS === 'web' ? 'web' : `native-${Platform.OS}`;
  const scenario = generated.scenarios?.find((s) => s.platform === platform && Math.abs(s.width - windowSize.width) < 2 && s.textScale === textScale);
  const values = scenario ? generated.values[scenario.id] : null;
  const padding = values?.['regions.inlinePadding'] ?? 20, gap = values?.['regions.gap'] ?? 20;
  const columns = values?.['regions.columns'] ?? (windowSize.width > 720 ? 2 : 1);
  const available = windowSize.width - padding * 2;
  const listWidth = values?.['regions.list.width'] ?? (columns === 2 ? (available - gap) * .56 : available);
  const detailWidth = values?.['regions.detail.width'] ?? (columns === 2 ? (available - gap) * .44 : available);
  const fontSize = values?.['row.fontSize'] ?? 18 * textScale, lineHeight = values?.['row.lineHeightRatio'] ?? 1.5;
  const tracking = values?.['row.letterSpacing'] ?? 0, rowHeight = values?.['row.rowHeight'] ?? 64, rowPadding = values?.['row.paddingBlock'] ?? 16;
  const chosen = records.find((record) => record.id === selected);
  const visible = records.filter((record) => filter === 'all' || !reviewed.includes(record.id));
  const bind = useObservations({ platform, viewport: windowSize, safeArea: insets, filter, selected, reviewed, enlarged, longText, textScale, scenario: scenario?.id ?? null, phase: generated.phase, resultIdentity: generated.identity, sourceIdentity: process.env.EXPO_PUBLIC_DESIGN_SOURCE_HASH ?? 'unbound', values: { fontSize, lineHeight, tracking, rowHeight, rowPadding, columns, padding, gap, listWidth, detailWidth }, candidates });
  return <html.div data-layoutconformance="strict" ref={bind('root')} style={[styles.root, styles.safe(insets.top, insets.bottom), styles.scaledType(16 * textScale)]}>
    <Scroll><html.div style={styles.frame(padding, gap)}>
      <html.div style={styles.header}><html.span style={[styles.eyebrow, styles.scaledType(12 * textScale)]}>Field notes / 03</html.span><html.span style={[styles.meta, styles.scaledType(12 * textScale)]}>Review desk</html.span></html.div>
      <html.div><html.h1 style={[styles.title, styles.scaledType(36 * textScale)]}>A clearer reading.</html.h1><html.p style={[styles.body, styles.scaledType(16 * textScale)]}>Three observations. One considered next step.</html.p></html.div>
      <html.div style={styles.toolbar}>
        <html.button ref={bind('filter-all')} data-testid="filter-all" aria-selected={filter === 'all'} style={[styles.button, styles.scaledType(16 * textScale), filter === 'all' && styles.active]} onClick={() => setFilter('all')}>All observations</html.button>
        <html.button ref={bind('filter-review')} data-testid="filter-review" aria-selected={filter === 'review'} style={[styles.button, styles.scaledType(16 * textScale), filter === 'review' && styles.active]} onClick={() => setFilter('review')}>Needs review</html.button>
        <html.button ref={bind('enlarge')} data-testid="enlarge" style={[styles.button, styles.scaledType(16 * textScale)]} onClick={() => setEnlarged(!enlarged)}>{enlarged ? 'Standard text' : 'Larger text'}</html.button>
        <html.button ref={bind('long-text')} data-testid="long-text" style={[styles.button, styles.scaledType(16 * textScale)]} onClick={() => setLongText(!longText)}>{longText ? 'Original title' : 'Longer title'}</html.button>
      </html.div>
      <html.div ref={bind('regions')} style={styles.layout(columns === 2 ? 'row' : 'column', gap)}>
        <html.div ref={bind('list')} style={[styles.region(listWidth), columns === 1 && chosen && styles.hide]}>
          <html.h2 style={[styles.sectionTitle, styles.scaledType(20 * textScale)]}>Observations <html.span style={[styles.meta, styles.scaledType(12 * textScale)]}>/ {visible.length}</html.span></html.h2>
          {visible.map((record) => <html.button key={record.id} ref={bind(`row-${record.id}`)} data-testid={`row-${record.id}`} style={[styles.row(fontSize, lineHeight, tracking, rowHeight, rowPadding), selected === record.id && styles.active]} onClick={() => setSelected(record.id)}>
            <html.span ref={bind(`meta-${record.id}`)} style={[styles.meta, styles.scaledType(12 * textScale)]}>{record.category} · {record.time} · {reviewed.includes(record.id) ? 'Reviewed' : 'To review'}</html.span>
            <html.span ref={bind(`title-${record.id}`)}>{longText && record.id === 'inlet' ? 'Northern inlet — emergency pressure regulator and secondary holding reservoir' : record.title}</html.span>
            <html.span style={[styles.value, styles.scaledType(27 * textScale)]}>{record.value}</html.span>
          </html.button>)}
          {visible.length === 0 && <html.p style={[styles.body, styles.scaledType(16 * textScale)]}>Everything has been reviewed.</html.p>}
        </html.div>
        <html.div ref={bind('detail')} style={styles.region(detailWidth)}>
          <html.h2 style={[styles.sectionTitle, styles.scaledType(20 * textScale)]}>{chosen ? 'Reading detail' : 'Your next step'}</html.h2>
          <html.div style={styles.detail}>
            <html.span style={[styles.eyebrow, styles.scaledType(12 * textScale), styles.muted]}>{chosen ? chosen.category : 'Start with the signal'}</html.span>
            <html.p ref={bind('detail-text')} style={[styles.detailBody, styles.scaledType(18 * textScale)]}>{chosen ? chosen.note : 'Open an observation to read the context, then mark it reviewed when the next step is clear.'}</html.p>
            {chosen && <html.button ref={bind('mark-reviewed')} data-testid="mark-reviewed" style={[styles.button, styles.scaledType(16 * textScale), styles.active]} onClick={() => { setReviewed((r) => [...new Set([...r, chosen.id])]); setSelected(null); }}>Mark reviewed</html.button>}
            {chosen && <html.button ref={bind('back')} data-testid="back" style={[styles.button, styles.scaledType(16 * textScale)]} onClick={() => setSelected(null)}>Back to observations</html.button>}
          </html.div>
          <html.p style={[styles.note, styles.scaledType(13 * textScale)]}>Recorded locally · Changes in this experiment last until the app reloads.</html.p>
        </html.div>
      </html.div>
    </html.div></Scroll>
    <html.div aria-hidden={true} style={styles.probes}><html.p ref={bind('line-height-probe')} style={styles.probe(fontSize, lineHeight)}>Reading</html.p>{candidates.map((candidate) => <html.p key={candidate.id} ref={bind(`probe-${candidate.id}`)} data-testid={`probe-${candidate.id}`} style={styles.probe(candidate.fontSize * textScale, candidate.lineHeight)}>{probeText}</html.p>)}</html.div>
  </html.div>;
}
export default function App() {
  const [loaded, error] = useFonts({ Lato: require('../../../assets/fonts/Lato-Regular.ttf') });
  if (error) throw error;
  if (!loaded) return null;
  return <SafeAreaProvider><Review /></SafeAreaProvider>;
}
