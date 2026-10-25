import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { transformAsync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import { build } from 'esbuild';
import path from 'node:path';
const directory = 'artifacts/fieldwork/web';
await mkdir(`${directory}/assets`, { recursive: true });
const source = await readFile('examples/fieldwork/site.jsx', 'utf8');
const compiled = await transformAsync(source, {
  filename: path.resolve('examples/fieldwork/site.jsx'),
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
    resolveDir: path.resolve('examples/fieldwork'),
  },
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await writeFile(`${directory}/app.js`, result.outputFiles[0].text);
for (const [alias, name] of [
  ['FieldworkSans', 'Lato-Regular.ttf'],
  ['FieldworkHeavy', 'Lato-Black.ttf'],
  ['FieldworkSerif', 'Spectral-Regular.ttf'],
])
  await copyFile(`assets/fonts/${name}`, `${directory}/assets/${alias}.ttf`);
for (const name of ['headland', 'forest'])
  await copyFile(
    `native/assets/fieldwork/${name}.png`,
    `${directory}/assets/${name}.png`,
  );
await writeFile(
  `${directory}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldwork — For the longer look</title><meta name="description" content="An original publication concept about place, practice and paying attention."><style>@font-face{font-family:FieldworkSans;src:url(assets/FieldworkSans.ttf)}@font-face{font-family:FieldworkHeavy;src:url(assets/FieldworkHeavy.ttf);font-weight:900}@font-face{font-family:FieldworkSerif;src:url(assets/FieldworkSerif.ttf)}*{box-sizing:border-box}body{margin:0}button,input{font:inherit}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #8d3d26;outline-offset:5px}.skip{position:fixed;top:-200px;background:#fff;padding:16px;z-index:99}.skip:focus{top:10px}img{max-width:100%}</style><div id="root"></div><script src="app.js"></script></html>`,
);
console.log(directory);
