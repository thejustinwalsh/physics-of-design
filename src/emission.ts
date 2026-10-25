import { readFileSync, existsSync } from 'node:fs';
import { graph } from './graph.js';
import { resolveLayout, responsiveResolverSource } from './responsive.js';
import { transformAsync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignState, TextBlock, Issue } from './state.js';
import { fontDigest } from './fonts.js';
import { stateColors } from './design-color.js';

export function fontAlias(block: TextBlock) {
  return `Pod_${fontDigest(block.font.file).slice(0, 16)}`;
}
export function webTextStyle(
  block: TextBlock,
  scale: number,
): Record<string, string | number> {
  return {
    fontFamily: fontAlias(block),
    fontSize: block.size * scale,
    fontWeight: block.weight,
    fontKerning: block.kerning === 'none' ? 'none' : 'normal',
    fontSynthesis: 'none',
    fontOpticalSizing: block.font.opticalSizing,
    fontVariationSettings:
      Object.entries(block.font.axes)
        .map(([k, v]) => `"${k}" ${v}`)
        .join(', ') || 'normal',
    fontFeatureSettings:
      Object.entries(block.features)
        .map(([k, v]) => `"${k}" ${v ? 1 : 0}`)
        .join(', ') || 'normal',
    letterSpacing: block.trackingEm * block.size * scale,
    // StyleX/CSS numeric lineHeight is a unitless multiplier; native lineHeight is in points.
    lineHeight: block.leading,
    width: block.measure,
    maxWidth: '100%',
    textAlign: block.align,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
    padding: 0,
    ...(block.maxHeight !== null
      ? { maxHeight: block.maxHeight, overflow: 'hidden' }
      : {}),
  };
}
export function emitStyleX(state: DesignState): string {
  const styles: Record<string, Record<string, string | number>> = {
    host: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 'auto',
    },
    surface: {
      width: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 'auto',
    },
  };
  for (const [i, b] of state.blocks.entries())
    styles[`b${i}`] = {
      ...webTextStyle(b, state.viewport.textScale),
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      minWidth: 0,
    };
  const dynamic = `surfaceSize:(padding,maxWidth,direction,gap,wrap)=>({padding,maxWidth,flexDirection:direction,columnGap:gap,flexWrap:wrap}), palette:(canvas,ink)=>({backgroundColor:canvas,color:ink}), dimensions:(size,leading,tracking,measure,margin)=>({fontSize:size,lineHeight:leading,letterSpacing:tracking,width:measure,marginTop:margin}), font:(family,weight,axes,optical,features,kerning)=>({fontFamily:family,fontWeight:weight,fontVariationSettings:axes,fontOpticalSizing:optical,fontFeatureSettings:features,fontKerning:kerning})`;
  return `import React,{useState,useLayoutEffect,useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
const initialState=${JSON.stringify(state)};
const aliases=${JSON.stringify(Object.fromEntries(state.blocks.map((b) => [b.font.file, fontAlias(b)])))};
const resolveLayout=${responsiveResolverSource()};
const styles=stylex.create(${JSON.stringify(styles).slice(0, -1)},${dynamic}});
export function Specimen({state=initialState}={}){
  const host=useRef(null),[width,setWidth]=useState(state.viewport.width);
  useLayoutEffect(()=>{const node=host.current;const update=()=>setWidth(node.getBoundingClientRect().width);update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[]);
  const layout=resolveLayout({...state,viewport:{...state.viewport,width}}),resolved=layout.state;
  return React.createElement('div',{...stylex.props(styles.host,styles.palette(resolved.colors?.tokens.canvas??'#f6f4ed',resolved.colors?.tokens.ink??'#171918')),ref:host},React.createElement('article',{...stylex.props(styles.surface,styles.surfaceSize(resolved.padding,layout.surfaceWidth,layout.container.flexDirection,layout.pattern==='split'?layout.gap:0,layout.container.flexWrap)),id:'specimen','data-layout-pattern':layout.pattern},
    ...resolved.blocks.map((b,i)=>React.createElement(b.role==='title'?'h1':'p',{...stylex.props(styles['b'+i],styles.font(aliases[b.font.file],b.weight,Object.entries(b.font.axes).map(([tag,value])=>'\"'+tag+'\" '+value).join(', ')||'normal',b.font.opticalSizing,Object.entries(b.features).map(([tag,value])=>'\"'+tag+'\" '+(value?1:0)).join(', ')||'normal',b.kerning==='none'?'none':'normal'),styles.dimensions(b.size*resolved.viewport.textScale,b.leading,b.trackingEm*b.size*resolved.viewport.textScale,b.measure,layout.pattern==='stack'&&i?resolved.gaps[i-1]:0)),'data-block':b.id,lang:b.language,dir:b.direction},b.text))));
}
`;
}
export function nativeMapping(state: DesignState, systemFontScale = 1) {
  const layout = resolveLayout(state, systemFontScale);
  state = layout.state;
  const unsupported: Issue[] = [];
  const blocks = state.blocks.map((b, index) => {
    if (Object.keys(b.font.axes).length || b.font.opticalSizing === 'auto')
      unsupported.push({
        code: 'native-axes',
        block: b.id,
        severity: 'unsupported',
        message:
          'This adapter deliberately rejects explicit variable axes/optical sizing until validated on the pinned native runtime. Supply a licensed static instance.',
      });
    if (b.kerning === 'none')
      unsupported.push({
        code: 'native-kerning',
        block: b.id,
        severity: 'unsupported',
        message: 'Disabling kerning is not implemented by the native harness.',
      });
    if (Object.keys(b.features).length)
      unsupported.push({
        code: 'native-features',
        block: b.id,
        severity: 'unsupported',
        message:
          'Custom OpenType feature toggles are not implemented by this native harness.',
      });
    return {
      id: b.id,
      text: b.text,
      role: b.role,
      fontFile: b.font.file,
      fontAlias: fontAlias(b),
      style: {
        fontFamily: fontAlias(b),
        color: stateColors(state).tokens.ink!,
        fontSize: b.size * state.viewport.textScale,
        fontWeight: String(b.weight),
        letterSpacing: b.trackingEm * b.size * state.viewport.textScale,
        lineHeight: b.leading * b.size * state.viewport.textScale,
        width: Math.min(b.measure, state.viewport.width - 2 * state.padding),
        textAlign: b.align,
        writingDirection: b.direction === 'auto' ? 'auto' : b.direction,
        includeFontPadding: false,
      },
      maxHeight: b.maxHeight,
      layoutStyle: {
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
        marginTop:
          layout.pattern === 'stack' && index ? state.gaps[index - 1]! : 0,
      },
      props: {
        allowFontScaling: true,
        textBreakStrategy: 'simple',
        android_hyphenationFrequency: 'none',
        accessible: true,
        accessibilityRole: b.role === 'title' ? 'header' : 'text',
      },
    };
  });
  return {
    container: {
      ...layout.container,
      backgroundColor: stateColors(state).tokens.canvas!,
      width: layout.surfaceWidth,
      padding: state.padding,
      columnGap: layout.pattern === 'split' ? layout.gap : 0,
    },
    gaps: state.gaps,
    responsive: { pattern: layout.pattern, notes: layout.notes },
    blocks,
    unsupported,
    caveats: [
      'Native font scale is additionally controlled by the device and is recorded in the measurement receipt.',
      'No CSS/native shaping equivalence is assumed.',
      'Language-specific text shaping and fallback are platform-owned.',
      'Word spacing override is unsupported by this harness; WCAG spacing test is applicable to web markup only.',
    ],
  };
}

const shell = `body{margin:0;background:#f6f4ed;color:#171918;font-family:system-ui}#root{min-height:100vh}#controls{padding:20px;border-bottom:1px solid #bbb;display:flex;gap:16px;flex-wrap:wrap;font:13px system-ui}label{display:flex;flex-direction:column;gap:5px}#controls input{width:90px}#status{padding:12px 20px;font:12px monospace}body.guides article{background:repeating-linear-gradient(transparent 0 3px,#2a665314 3px 4px)}body.guides [data-block]{outline:1px solid #22745d66}button{font:inherit;padding:6px 12px}`;
export async function proofHtml(
  state: DesignState,
  interactive = false,
): Promise<string> {
  const source =
    emitStyleX(state) +
    `\nimport {createRoot} from 'react-dom/client';\nimport {flushSync} from 'react-dom';\nfunction ProofHost(){const [state,setState]=React.useState(undefined);window.__POD_APPLY_STATE__=next=>flushSync(()=>setState(next));return React.createElement(Specimen,{state});}\nflushSync(()=>createRoot(document.getElementById('root')).render(React.createElement(ProofHost)));\nwindow.__DESIGN_READY__=true;`;
  const compiled = await transformAsync(source, {
    filename: 'specimen.js',
    babelrc: false,
    configFile: false,
    plugins: [[stylexPlugin, { dev: false, runtimeInjection: true }]],
  });
  if (!compiled?.code) throw new Error('StyleX compilation returned no code');
  const bundled = await build({
    stdin: {
      contents: compiled.code,
      loader: 'js',
      resolveDir: path.resolve(fileURLToPath(new URL('../', import.meta.url))),
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const script = bundled.outputFiles[0]!.text.replaceAll(
    '</script',
    '<\\/script',
  );
  const fonts = [
    ...new Map(state.blocks.map((b) => [fontAlias(b), b])).values(),
  ]
    .map((b) => {
      const bytes = readFileSync(b.font.file).toString('base64');
      return `@font-face{font-family:${fontAlias(b)};src:url(data:font/ttf;base64,${bytes});font-weight:1 1000;font-style:normal;font-display:block;}`;
    })
    .join('\n');
  const controls = interactive
    ? `<div id="controls"><button id="guides">Baseline guides</button><button id="grid">4px rhythm grid</button><button id="download">Download edited state</button><span>Local preview; edit values and remeasure before selection.</span></div><div id="status">Initial state; renderer verification is available through design layout measure.</div>`
    : '';
  let editor = '';
  if (interactive) {
    const js = fileURLToPath(new URL('./proof-editor.js', import.meta.url));
    const built = await build({
      entryPoints: [
        existsSync(js)
          ? js
          : fileURLToPath(new URL('./proof-editor.ts', import.meta.url)),
      ],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      minify: true,
    });
    const fonts = state.blocks.map((b) => ({
      font: b.font,
      weight: b.weight,
      alias: fontAlias(b),
    }));
    const payload = JSON.stringify({
      state,
      graph: graph(state),
      fonts,
    }).replaceAll('<', '\\u003c');
    editor = `<script>const pod=${payload};window.__POD_STATE__=pod.state;window.__POD_GRAPH__=pod.graph;window.__POD_FONTS__=pod.fonts;</script><script>${built.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script>`;
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Theory specimen</title><style>${shell}\n${fonts}</style><body>${controls}<div id="root"></div><script>${script}</script>${editor}</body></html>`;
}
