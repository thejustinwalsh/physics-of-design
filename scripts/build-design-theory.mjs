import { readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { transformAsync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import { build } from 'esbuild';
import path from 'node:path';

const directory = 'artifacts/vela/web/design-theory';
await mkdir(`${directory}/assets`, { recursive: true });
const source = await readFile('examples/design-theory/web.jsx', 'utf8');
const compiled = await transformAsync(source, {
  filename: path.resolve('examples/design-theory/web.jsx'),
  babelrc: false,
  configFile: false,
  parserOpts: { plugins: ['jsx'] },
  plugins: [[stylexPlugin, { dev: false, runtimeInjection: true }]],
});
if (!compiled?.code) throw new Error('StyleX compile returned no source');
await rm(`${directory}/chunks`, { recursive: true, force: true });
await build({
  stdin: {
    contents: compiled.code,
    loader: 'jsx',
    resolveDir: path.resolve('examples/design-theory'),
  },
  bundle: true,
  write: true,
  outdir: directory,
  entryNames: 'app',
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
  minify: true,
  format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await build({
  entryPoints: ['examples/design-theory/surface-worker.js'],
  bundle: true,
  write: true,
  outfile: `${directory}/surface-worker.js`,
  minify: true,
  format: 'esm',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
});
for (const name of [
  'Lato-Regular.ttf',
  'Lato-Black.ttf',
  'Spectral-Regular.ttf',
  'lato-OFL.txt',
  'spectral-OFL.txt',
])
  await copyFile(`assets/fonts/${name}`, `${directory}/assets/${name}`);
await copyFile(
  'examples/design-theory/still-life.svg',
  `${directory}/still-life.svg`,
);
const css = `@font-face{font-family:TheorySans;src:url(assets/Lato-Regular.ttf);font-weight:400;font-display:swap}@font-face{font-family:TheorySans;src:url(assets/Lato-Black.ttf);font-weight:700 900;font-display:swap}@font-face{font-family:TheorySerif;src:url(assets/Spectral-Regular.ttf);font-weight:400;font-display:swap}*{box-sizing:border-box}html{background:#f3f1e8;scrollbar-color:#a6b09c #f3f1e8;scroll-behavior:auto}body{margin:0}button,input,textarea,select{font:inherit}button,a,input,textarea,select{touch-action:manipulation}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible,[role=button]:focus-visible{outline:2px solid var(--accent,#c74627);outline-offset:4px}button{transition:background-color .16s,color .16s,border-color .16s}a{color:inherit}::selection{background:#d2dcb6;color:#253d33}.skip-link{position:fixed;top:-100px;left:20px;z-index:99;padding:14px;background:#253d33;color:white}.skip-link:focus{top:12px}[data-surface][data-renderer=worker]>svg,[data-surface][data-renderer=main]>svg{display:none}svg{max-width:100%}summary{cursor:pointer;min-height:30px}input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px}section[id]{scroll-margin-top:24px}.lenis.lenis-smooth{scroll-behavior:auto!important}.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}.lenis.lenis-stopped{overflow:hidden}.lenis.lenis-scrolling iframe{pointer-events:none}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:0s!important;animation-duration:0s!important}}`;
await writeFile(
  `${directory}/index.html`,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f1e8"><meta name="description" content="A hands-on toolkit for typography, composition, color, motion and materials. Bring your point of view. Keep control of the decisions."><title>Design Theory — A point of view, made tangible</title><style>${css}</style></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>`,
);
await writeFile(
  `${directory}/about.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>About this demo — Design Theory</title><style>${css}body{font-family:TheorySans,Arial,sans-serif;color:#253d33;max-width:760px;padding:50px 24px;margin:auto;line-height:1.7}h1{font-family:TheorySerif,Georgia,serif;font-size:56px;line-height:1.1;font-weight:400;letter-spacing:-.05em}h2{font-size:21px;margin-top:36px}a{text-underline-offset:4px}</style><a href="./">← Back to Design Theory</a><h1>Small tools.<br>Honest boundaries.</h1><p>This interactive gallery demonstrates the local Design Theory toolkit. The three visual profiles are authored alternatives. Editing a brief saves your words with its selected profile; it does not silently run an AI design model.</p><h2>What is live</h2><p>Spring motion uses analytic propagation with continuous position and velocity on retarget. Cropping uses an authored focal point. Layout inspection recomputes proposed rectangles. The material sculpture uses Three.js standard physically based materials, a procedural environment and one lighting rig.</p><h2>Rendering and motion</h2><p>The site shares one GSAP clock with Lenis. Decorative surface rendering is capped to 30 frames per second with bounded pixel resolution. A tested worker initialization enables OffscreenCanvas rendering; otherwise the page uses a bounded main-thread renderer or static illustration. Device tilt is optional and asks permission only after you choose it. Reduced motion disables decorative movement and smooth scrolling. Browser support and physical-device performance vary.</p><h2>Original content and licenses</h2><p>The sculpture, still-life illustration, copy and example composition were created for this gallery. The Field Notes publication is fictional demonstration content. Lato and Spectral are distributed under the SIL Open Font License. <a href="assets/lato-OFL.txt">Lato license</a> · <a href="assets/spectral-OFL.txt">Spectral license</a>.</p><p>Built with React, StyleX, GSAP, Lenis and Three.js. Material calculations describe response under stated assumptions; the pairing and artistic direction remain authored choices, not universal quality scores.</p><a href="./#brief">Make a direction your own ↗</a></html>`,
);
console.log(directory);
