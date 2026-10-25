import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { transformAsync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import { build } from 'esbuild';
import path from 'node:path';

const directory = 'artifacts/vela/web';
await mkdir(`${directory}/assets`, { recursive: true });
const source = await readFile('examples/vela/web.jsx', 'utf8');
const compiled = await transformAsync(source, {
  filename: path.resolve('examples/vela/web.jsx'),
  babelrc: false,
  configFile: false,
  parserOpts: { plugins: ['jsx'] },
  plugins: [[stylexPlugin, { dev: false, runtimeInjection: true }]],
});
if (!compiled?.code) throw new Error('StyleX compile returned no source');
const result = await build({
  stdin: {
    contents: compiled.code,
    loader: 'jsx',
    resolveDir: path.resolve('examples/vela'),
  },
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await writeFile(`${directory}/app.js`, result.outputFiles[0].text);
for (const [alias, name] of [
  ['VelaRegular', 'Lato-Regular.ttf'],
  ['VelaHeavy', 'Lato-Black.ttf'],
])
  await copyFile(`assets/fonts/${name}`, `${directory}/assets/${alias}.ttf`);
await copyFile('assets/fonts/lato-OFL.txt', `${directory}/assets/lato-OFL.txt`);
await writeFile(
  `${directory}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111310"><title>Vela — Build momentum</title><meta name="description" content="A local training journal. Purposeful movement, at your own pace."><style>@font-face{font-family:VelaRegular;src:url(assets/VelaRegular.ttf);font-display:swap}@font-face{font-family:VelaHeavy;src:url(assets/VelaHeavy.ttf);font-weight:900;font-display:swap}*{box-sizing:border-box}html{color-scheme:dark;background:#111310;scrollbar-color:#616a55 #111310}body{margin:0}button,input{font:inherit}button:focus-visible,a:focus-visible{outline:3px solid #d5ff3f;outline-offset:4px}h1:focus{outline:none}dialog::backdrop{background:rgba(0,0,0,.72)}button:disabled{cursor:default}button:not(:disabled):hover{filter:brightness(1.1)}::selection{background:#d5ff3f;color:#152000}input{caret-color:#d5ff3f}.skip{position:fixed;top:-200px;color:#152000;background:#d5ff3f;padding:16px;z-index:99}.skip:focus{top:10px}svg{max-width:100%}a{text-underline-offset:.2em}</style><div id="root"></div><script src="app.js"></script></html>`,
);
console.log(directory);
