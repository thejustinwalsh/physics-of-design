#!/usr/bin/env node
import { readFile,writeFile,mkdir,cp,readdir,stat,access,symlink,readlink } from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'..');
const protocolPath=path.join(root,'research/workflow-comparison-protocol.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
async function files(dir,exclude=[]){const out={};for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(exclude.includes(e.name))continue;const p=path.join(dir,e.name);if(e.isSymbolicLink()){out[e.name]='symlink:'+await readlink(p);continue;}if(e.isDirectory()){for(const [n,h]of Object.entries(await files(p,exclude)))out[e.name+'/'+n]=h;}else out[e.name]=sha(await readFile(p));}return out;}
async function exists(p){try{await access(p);return true;}catch{return false;}}
function configFlags(config,skills=[]){const names=[...config.matchAll(/^\[mcp_servers\.([^\].]+)\]$/gm)].map(x=>x[1]);return ['--disable','hooks','--disable','plugins','--disable','apps','--disable','multi_agent','--disable','memories','--enable','skip_host_skill_discovery',...names.flatMap(n=>['-c',`mcp_servers.${n}.enabled=false`]),'-c','skills.config=['+skills.map(p=>'{path='+JSON.stringify(p)+',enabled=false}').join(',')+']'];}
const command=process.argv[2];const location=process.argv[3];
if(command==='prepare'){
 const destination=location?path.resolve(location):`/private/tmp/design-workflows-${Date.now()}`;
 if(!destination.startsWith('/private/tmp/'))throw Error('Fresh benchmark must live below /private/tmp, outside repository AGENTS scope');
 if(await exists(destination))throw Error('Refusing to reuse an existing trial directory');
 await mkdir(destination,{recursive:true,mode:0o700});
 const configPath=path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'config.toml');const config=await readFile(configPath,'utf8');
 const cliVersion=execFileSync('codex',['--version'],{encoding:'utf8'}).trim();
 const features=execFileSync('codex',['features','list'],{encoding:'utf8'});
 for(const name of ['hooks','plugins','apps','multi_agent','memories','skip_host_skill_discovery'])if(!new RegExp(`^${name}\\s`,'m').test(features))throw Error(`Required installed CLI feature unavailable: ${name}`);
 const configModel=Object.fromEntries([...config.matchAll(/^(model|model_reasoning_effort|service_tier)\s*=\s*(.+)$/gm)].map(x=>[x[1],x[2]]));
 const protocol=await json(protocolPath);await cp(protocolPath,path.join(destination,'protocol.json'));
 const skillRoot=path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'skills');const skillPaths=execFileSync('rg',['--files','--hidden','--no-ignore','--follow',skillRoot],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('/SKILL.md')).sort();
 // This bundled skill may be materialized by the CLI only after discovery. Disable its documented path proactively.
 skillPaths.push(path.join(skillRoot,'.system/plugin-creator/SKILL.md'));
 const flags=configFlags(config,[...new Set(skillPaths)]);
 const comparisonModel=process.env.DESIGN_COMPARISON_MODEL;
 let modelAvailability=null;
 if(comparisonModel){const cachePath=path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'models_cache.json');const cacheBytes=await readFile(cachePath);const catalog=JSON.parse(cacheBytes);const model=catalog.models.find(m=>m.slug===comparisonModel);if(!model)throw Error('Explicit comparison model absent from local CLI availability cache');modelAvailability={slug:model.slug,fetchedAt:catalog.fetched_at,cacheSha256:sha(cacheBytes),reason:'Configured gpt-6.1-sol was rejected before task execution; both fresh arms use one identical supported model.'};flags.push('-c','model='+JSON.stringify(comparisonModel));}
 const ids=['Study-'+randomBytes(3).toString('hex'),'Study-'+randomBytes(3).toString('hex')];
 const order=Math.random()<.5?['guidance','toolkit']:['toolkit','guidance'];
 const manifest={version:1,preparedAt:new Date().toISOString(),root:destination,configPath,configSha256:sha(config),configModel,modelAvailability,effectiveModel:comparisonModel??JSON.parse(configModel.model),cliVersion,flags,protocolSha256:sha(await readFile(protocolPath)),order,arms:{},harnessHashes:{runner:sha(await readFile(import.meta.filename)),evaluator:sha(await readFile(path.join(root,'research/comparison/evaluate.mjs'))),templates:await files(path.join(root,'research/comparison'))},isolation:'Per-run feature/MCP suppression plus explicit instruction/audit. Filesystem reads outside workspace are not denied by this protocol.'};
 const cache=path.join(root,'artifacts/runtime/impeccable');const revision=protocol.arms.guidance.revision;
 if(execFileSync('git',['-C',cache,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision)throw Error('Pinned Impeccable checkout unavailable or wrong revision; fetch exact revision before retrying');
 // Git object reads ensure local checkout edits cannot substitute unpinned guidance.
 const upstreamFiles=execFileSync('git',['-C',cache,'ls-tree','-r','--name-only',revision,'.agents/skills/impeccable/SKILL.md','.agents/skills/impeccable/reference','LICENSE','NOTICE.md'],{encoding:'utf8'}).trim().split('\n');
 for(const [index,arm]of ['guidance','toolkit'].entries()){
  const work=path.join(destination,ids[index]);await mkdir(path.join(work,'src'),{recursive:true});await mkdir(path.join(work,'public'));await mkdir(path.join(work,'assets'));
  for(const [from,to]of [['brief.md','BRIEF.md'],['build.mjs','build.mjs'],['app.jsx','src/app.jsx'],['base.css','public/base.css'],['registration.svg','assets/registration.svg']])await cp(path.join(root,'research/comparison',from),path.join(work,to));
  await cp(path.join(root,'DESIGN.md'),path.join(work,'DESIGN.md'));await cp(path.join(root,'research/bold-brief-interview.json'),path.join(work,'synthetic-interview.json'));
  for(const f of ['Lato-Regular.ttf','Lato-Black.ttf','Spectral-Regular.ttf','lato-OFL.txt','spectral-OFL.txt'])await cp(path.join(root,'assets/fonts',f),path.join(work,'assets',f));
  await writeFile(path.join(work,'PRODUCT.md'),'# Deliberate Friction\nOriginal demonstration workbench for design-minded developers and art directors. Four connected sections and two task modes; see BRIEF.md. Synthetic direction is revisable, not human approval.\n');
  await save(path.join(work,'package.json'),{name:'paired-design-study',private:true,type:'module',scripts:{build:'node build.mjs'},dependencies:{react:'19.2.0','react-dom':'19.2.0','@stylexjs/stylex':'0.19.1','@stylexjs/babel-plugin':'0.19.1','@babel/core':'7.29.7',esbuild:'0.25.12',playwright:'1.64.1'}});
  // Identical installed dependency snapshot; no symlink to parent repository/source.
  await cp(path.join(root,'node_modules'),path.join(work,'node_modules'),{recursive:true,dereference:true});
  let guidance;
  if(arm==='guidance'){
   guidance='Read guidance/impeccable/SKILL.md and relevant reference files as pinned practitioner guidance. This is deliberately guidance-only: no Impeccable executable, detector, hooks, model agents, asset generation or launcher is supplied/permitted. Read PRODUCT.md and DESIGN.md directly; do not claim context launcher or detector ran. The explicit benchmark scope supersedes runtime/delegation/generation steps in source guidance. Use ordinary implementation and browser tools. Do not use Design Theory skill, package, CLI, source, gallery or prior artifacts.';
   for(const f of upstreamFiles){const relative=f.startsWith('.agents/skills/impeccable/')?'guidance/impeccable/'+f.slice('.agents/skills/impeccable/'.length):'guidance/impeccable/'+f;const target=path.join(work,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,execFileSync('git',['-C',cache,'show',`${revision}:${f}`]));}
   await save(path.join(work,'guidance/provenance.json'),{repository:'https://github.com/pbakaus/impeccable',revision,license:'Apache-2.0',source:'Committed git object bytes from pinned local checkout',files:await files(path.join(work,'guidance/impeccable')),launcher:'deliberately excluded; guidance-only condition'});
  }else{
   guidance='Read guidance/design-theory/SKILL.md and relevant references. Use the isolated toolkit CLI: node toolkit/dist/cli.js --help; the registry command accepts JSON on stdin and core command schemas live in toolkit/dist/commands.js. Core exports live at toolkit/dist/index.js and browser adapters at toolkit/dist/*.js. Tool-assisted choices must record actual calls and receipts; no claim that a preset is a solver. Toolkit is allowed, current gallery/examples/prior receipts are not supplied or permitted. No model selectors/child agents/external inference: this is a same-model single-builder trial.';
   await cp(path.join(root,'.agents/skills/design-theory'),path.join(work,'guidance/design-theory'),{recursive:true});
   await mkdir(path.join(work,'toolkit'));for(const f of ['dist','assets/fonts'])await cp(path.join(root,f),path.join(work,'toolkit',f),{recursive:true});
   await cp(path.join(root,'package.json'),path.join(work,'toolkit/package.json'));await symlink('../node_modules',path.join(work,'toolkit/node_modules'));
   await mkdir(path.join(work,'toolkit/docs'));for(const f of ['typography-measurement.md','dom-surface-research.md','motion-safari-research.md','material-image-rules.md','material-pairings.md'])if(await exists(path.join(root,'docs',f)))await cp(path.join(root,'docs',f),path.join(work,'toolkit/docs',f));
  }
  const instruction=`# Fixed study boundary\nRead BRIEF.md, PRODUCT.md and DESIGN.md first. ${guidance}\nStay inside this workspace. Do not read sibling workspaces, parent repository, user skills, other agents, prior builds or evaluation outcomes. No child agents/model calls, no network assets/packages. The supplied dependency snapshot includes extra transitive packages; import only declared package.json dependencies, plus isolated toolkit in its allowed arm. Do not edit build.mjs, package.json, BRIEF.md, supplied assets, guidance, toolkit or node_modules. DESIGN.md may gain implementation notes; preserve original direction. Work independently, build and test within 900seconds, leave public/index.html and BUILD-REPORT.md. No follow-up feedback.\n`;
  await writeFile(path.join(work,'AGENTS.md'),instruction);await writeFile(path.join(work,'PROMPT.md'),`Implement the complete fresh four-section workbench described in BRIEF.md. Read AGENTS.md and follow its condition scope. You have 15minutes wall time from process launch; self-tests and corrections are allowed within that limit. Deliver real working modes and actions, not a plan. Finish when usable and tested; report remaining gaps honestly.\n`);
  const immutable=['BRIEF.md','PRODUCT.md','synthetic-interview.json','build.mjs','package.json','AGENTS.md','PROMPT.md','assets','guidance','node_modules',...(arm==='toolkit'?['toolkit']:[])];
  const hashes={};for(const f of immutable){const s=await stat(path.join(work,f));hashes[f]=s.isDirectory()?await files(path.join(work,f)):sha(await readFile(path.join(work,f)));}
  await save(path.join(destination,`${ids[index]}-inputs.json`),hashes);
  manifest.arms[arm]={id:ids[index],work,immutable,inputManifestSha256:sha(JSON.stringify(hashes)),designSha256:sha(await readFile(path.join(work,'DESIGN.md')))};
  execFileSync('node',['build.mjs'],{cwd:work,stdio:'pipe'});
 }
 const common=['BRIEF.md','PRODUCT.md','DESIGN.md','synthetic-interview.json','build.mjs','package.json','assets','node_modules'];
 for(const f of common){const a=path.join(manifest.arms.guidance.work,f),b=path.join(manifest.arms.toolkit.work,f);const s=await stat(a);if((s.isDirectory()?sha(JSON.stringify(await files(a))):sha(await readFile(a)))!==(s.isDirectory()?sha(JSON.stringify(await files(b))):sha(await readFile(b))))throw Error(`Common input mismatch: ${f}`);}
 await save(path.join(destination,'manifest.private.json'),manifest);console.log(destination);console.log('Prepared and scaffold-built both arms. No builders launched. Random order: '+order.join(', '));
}else if(command==='run'){
 const trial=path.resolve(location);const m=await json(path.join(trial,'manifest.private.json'));if(sha(await readFile(import.meta.filename))!==m.harnessHashes.runner)throw Error('Runner changed since protocol preparation');const arm=process.argv[4];if(!m.arms[arm])throw Error('Specify guidance or toolkit');
 const prior=m.order.slice(0,m.order.indexOf(arm));for(const p of prior)if(!await exists(path.join(trial,m.arms[p].id+'-run/completion.json')))throw Error('Run the predeclared random order; earlier condition has not completed');
 const a=m.arms[arm],out=path.join(trial,a.id+'-run');if(await exists(out))throw Error('No reruns: run output already exists');
 if(sha(await readFile(m.configPath))!==m.configSha256)throw Error('User config changed since preparation; cannot claim matched settings');
 if(execFileSync('codex',['--version'],{encoding:'utf8'}).trim()!==m.cliVersion)throw Error('CLI version changed');
 const expected=await json(path.join(trial,a.id+'-inputs.json'));for(const f of a.immutable){const p=path.join(a.work,f),s=await stat(p);const actual=s.isDirectory()?await files(p):sha(await readFile(p));if(JSON.stringify(actual)!==JSON.stringify(expected[f]))throw Error('Immutable input changed before launch: '+f);}
 await mkdir(out);const prompt=await readFile(path.join(a.work,'PROMPT.md'),'utf8');
 // No model overrides; original user config is loaded identically. No auth or home mutation.
 const debugArgs=['debug','prompt-input',...m.flags,prompt];
 try{const context=execFileSync('codex',debugArgs,{cwd:a.work,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});await writeFile(path.join(out,'prompt-input.private.json'),context);if(context.includes('<skills_instructions>')||(arm==='guidance'&&context.includes('/Volumes/Depot/Developer/design-theory')))throw Error('Unapproved skills or parent source leaked into prompt; inspect isolation before run');}catch(e){await writeFile(path.join(out,'preflight-error.txt'),String(e));throw e;}
 const args=['exec','--json','--ephemeral','--skip-git-repo-check','--color','never','--approve-for-me','-C',a.work,...m.flags,'-o',path.join(out,'final.txt'),'-'];
 await save(path.join(out,'invocation.json'),{executable:'codex',args,cwd:a.work,configSha256:m.configSha256,configModel:m.configModel,effectiveModel:m.effectiveModel,modelAvailability:m.modelAvailability,startedAt:new Date().toISOString(),budgetSeconds:900});
 const stdout=await import('node:fs').then(fs=>fs.createWriteStream(path.join(out,'events.jsonl')));const stderr=await import('node:fs').then(fs=>fs.createWriteStream(path.join(out,'stderr.txt')));
 const start=performance.now();let timedOut=false;const child=spawn('codex',args,{cwd:a.work,stdio:['pipe','pipe','pipe'],detached:true});child.stdout.pipe(stdout);child.stderr.pipe(stderr);child.stdin.end(prompt);
 const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000).unref();},900000);
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);await Promise.all([new Promise(r=>stdout.end(r)),new Promise(r=>stderr.end(r))]);
 await save(path.join(out,'completion.json'),{...exit,timedOut,wallMs:performance.now()-start,finishedAt:new Date().toISOString()});console.log(out);
}else if(command==='audit'){
 const trial=path.resolve(location),m=await json(path.join(trial,'manifest.private.json')),result={version:1,arms:{},limitations:[]};
 for(const [arm,a]of Object.entries(m.arms)){
  const before=await json(path.join(trial,a.id+'-inputs.json'));const changed=[];for(const f of a.immutable){const p=path.join(a.work,f),s=await stat(p).catch(()=>null);const now=!s?null:s.isDirectory()?await files(p):sha(await readFile(p));if(JSON.stringify(now)!==JSON.stringify(before[f]))changed.push(f);}
  const out=path.join(trial,a.id+'-run');let events=[],invalidJson=0;if(await exists(path.join(out,'events.jsonl')))for(const line of(await readFile(path.join(out,'events.jsonl'),'utf8')).split('\n').filter(Boolean)){try{events.push(JSON.parse(line));}catch{invalidJson++;}}
  const usages=events.filter(e=>e.type==='turn.completed'&&e.usage).map(e=>e.usage);const totals=usages.length?{}:null;if(totals)for(const u of usages)for(const [k,v]of Object.entries(u))if(typeof v==='number')totals[k]=(totals[k]??0)+v;
  const commands=events.filter(e=>e.item?.command).map(e=>({type:e.type,id:e.item.id,command:e.item.command}));
  const suspicious=commands.filter(e=>/\/Volumes\/Depot\/Developer\/design-theory|\.codex\/skills|spawn_agent|codex exec|claude|opencode|impeccable.*scripts/.test(e.command)||(arm==='guidance'&&/toolkit\/|design-theory|design_execute/.test(e.command)));
  result.arms[a.id]={completion:await json(path.join(out,'completion.json')).catch(()=>null),actualUsageEvents:usages,usageTotals:totals,invalidJson,immutableChanged:changed,suspiciousCommands:suspicious,traceCommandCount:commands.length,compliance:changed.length||suspicious.length?'review-required':'automated-screen-clear; full trace review still required',outputHashes:await files(a.work,['node_modules','toolkit','guidance']),buildReportPresent:await exists(path.join(a.work,'BUILD-REPORT.md'))};
 }
 result.limitations=['No OS read-denial: shell command screen cannot prove absence of indirect reads.','Usage missing means unknown, not zero.','Artifact IDs do not remove possible visual/source unblinding.'];await save(path.join(trial,'audit.json'),result);console.log(JSON.stringify(result,null,2));
}else if(command==='serve'){
 const trial=path.resolve(location),m=await json(path.join(trial,'manifest.private.json'));const port=Number(process.argv[4]??5178);const ids=Object.values(m.arms).map(a=>a.id).sort();
 createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<html lang="en"><meta name="viewport" content="width=device-width"><title>Paired study</title><style>body{margin:0;font:16px system-ui}main{display:flex;flex-wrap:wrap}section{flex:1 1 500px}iframe{width:100%;height:90vh;border:1px solid #bbb}</style><main>${ids.map(id=>`<section><h1><a href="/${id}/">${id}</a></h1><iframe title="${id}" src="/${id}/"></iframe></section>`).join('')}</main>`);return;}const [id,...parts]=decodeURIComponent(url.pathname).split('/').filter(Boolean);if(!ids.includes(id))throw Error('Unknown ID');const base=path.join(trial,id,'public'),p=path.resolve(base,parts.length?parts.join('/'):'index.html');if(!p.startsWith(base+path.sep))throw Error('Path outside artifact');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf'})[path.extname(p)]??'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
}else console.log('Usage: compare-design-workflows.mjs prepare [/private/tmp/new-trial] | run <trial> <guidance|toolkit> | audit <trial> | serve <trial> [port]');
