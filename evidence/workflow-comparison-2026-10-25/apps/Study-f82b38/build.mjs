import {build} from 'esbuild';
import {transformAsync} from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import path from 'node:path';
await mkdir('public',{recursive:true});
await build({entryPoints:['src/app.jsx'],bundle:true,outfile:'public/app.js',format:'esm',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'stylex',setup(b){b.onLoad({filter:/\.jsx$/},async({path:filename})=>{const result=await transformAsync(await readFile(filename,'utf8'),{filename,babelrc:false,configFile:false,parserOpts:{plugins:['jsx']},plugins:[[stylexPlugin,{dev:false,runtimeInjection:true}]]});return{contents:result.code,loader:'jsx',resolveDir:path.dirname(filename)};});}}]});
await cp('assets','public/assets',{recursive:true});
await writeFile('public/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deliberate Friction</title><link rel="stylesheet" href="base.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');
