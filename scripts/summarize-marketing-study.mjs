#!/usr/bin/env node
// Post-completion cost accounting only. Never reads live builder workspaces.
import {readFile, writeFile, readdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sha = b => createHash('sha256').update(b).digest('hex');
const number = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
const exists = async p => access(p).then(() => true, () => false);
const json = async p => JSON.parse(await readFile(p, 'utf8'));
const optional = async p => await exists(p) ? json(p) : null;
const sumKnown = (a,b) => a === null || b === null ? null : a+b;

export function codingUsage(receipt) {
  const u = receipt?.usage, t = u?.reportedUsage?.total;
  const input = number(t?.inputTokens), cached = number(t?.cachedInputTokens);
  return {
    input, cachedInput: cached,
    uncachedInput: input !== null && cached !== null && cached <= input ? input-cached : null,
    output: number(t?.outputTokens), reasoningOutput: number(t?.reasoningOutputTokens),
    providerTotal: number(t?.totalTokens),
    completed: u?.turnStatus === 'completed' && u?.completeTurnObserved === true,
    incomplete: !(u?.turnStatus === 'completed' && u?.completeTurnObserved === true),
    coverage: u?.coverage ?? 'unknown', notificationCount: number(u?.notificationCount),
    regressions: u?.regressions ?? [],
    note: 'Latest cumulative total only; cached input is already included in input. Reasoning is preserved separately, never added to output.',
  };
}

function providerInput(row) {
  // Retain the exact provider field; conflicting aliases do not establish usage.
  const candidates = [
    ['usage.input_tokens',row.usage?.input_tokens], ['usage.prompt_tokens',row.usage?.prompt_tokens],
    ['usage.inputTokens',row.usage?.inputTokens], ['input_tokens',row.input_tokens],
    ['prompt_tokens',row.prompt_tokens], ['inputTokens',row.inputTokens],
    ['timings.prompt_n',row.timings?.prompt_n],
  ].filter(([,v]) => number(v) !== null);
  return {input: candidates.length && new Set(candidates.map(([,v])=>v)).size === 1 ? candidates[0][1] : null, fields: Object.fromEntries(candidates)};
}

export function selectorRows(files) {
  const rows = new Map(), unaccounted = [];
  for (const {source, content} of files) for (const [i,line] of content.split('\n').entries()) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { unaccounted.push({source,line:i+1,reason:'Invalid JSON'}); continue; }
    if (!r || typeof r.id !== 'string' || !/^[a-f0-9]{64}$/.test(r.prompt_sha256 ?? '')) {
      unaccounted.push({source,line:i+1,reason:'Missing row id or prompt SHA-256'}); continue;
    }
    const key = r.id+':'+r.prompt_sha256, usage = providerInput(r), prior = rows.get(key);
    if (prior) {
      prior.sources.push({source,line:i+1});
      if (prior.input !== usage.input || JSON.stringify(prior.model) !== JSON.stringify(r.model ?? null)) {
        prior.input = null; prior.conflictingCopies = true;
      }
    } else rows.set(key,{id:r.id,promptSha256:r.prompt_sha256,model:r.model??null,...usage,sources:[{source,line:i+1}]});
  }
  const values = [...rows.values()];
  return {rows:values,unaccounted,input:values.length && !unaccounted.length && values.every(r=>r.input!==null) ? values.reduce((n,r)=>n+r.input,0) : null};
}

async function walk(dir, prefix='') {
  if (!await exists(dir)) return [];
  const out=[];
  for(const e of await readdir(dir,{withFileTypes:true})) {
    if(e.isSymbolicLink()) throw Error('Refusing symlink in frozen receipts: '+path.join(dir,e.name));
    const p=path.join(dir,e.name), rel=path.join(prefix,e.name);
    if(e.isDirectory()) out.push(...await walk(p,rel)); else out.push(rel);
  }
  return out.sort();
}
const metricNames = new Set(['assignments','candidateCount','candidatesEvaluated','factorEvaluations','numericEvaluations','searches','neuralCalls','modelCalls','cacheHits','evaluations','searchEvaluations']);
function metrics(value, at='', out=[]) {
  if (!value || typeof value !== 'object') return out;
  for(const [key,v] of Object.entries(value)) {
    const p=at ? at+'.'+key : key;
    if(metricNames.has(key) && typeof v==='number') out.push({field:p,value:v});
    if(v && typeof v==='object') metrics(v,p,out);
  }
  return out;
}
const duration = (a,b) => {
  const delta=Date.parse(b)-Date.parse(a);
  return Number.isFinite(delta) && delta>=0 ? delta : null;
};

async function selectorLedger(base, files) {
  const invocations=[], workflowMetrics=[], outputs=[], processes=[];
  for(const rel of files) {
    if(rel.endsWith('output.jsonl')) outputs.push({source:rel,content:await readFile(path.join(base,rel),'utf8')});
    if(rel.endsWith('.process.json')) processes.push({source:rel,...await json(path.join(base,rel))});
    if(rel.startsWith('selector/') && rel.endsWith('/invocation.json')) {
      const invocation=await json(path.join(base,rel)), completion=await optional(path.join(base,path.dirname(rel),'completion.json'));
      const stderr=await readFile(path.join(base,path.dirname(rel),'stderr.txt'),'utf8').catch(()=>''), progressRowIds=new Set();
      for(const line of stderr.split('\n')) if(line.startsWith('@design-selector-progress ')) {
        try {const p=JSON.parse(line.slice('@design-selector-progress '.length)); if(typeof p.rowId==='string') progressRowIds.add(p.rowId);} catch {}
      }
      invocations.push({source:rel,args:invocation.args??null,startedAt:invocation.startedAt??null,finishedAt:completion?.finishedAt??null,
        status:!completion?'incomplete':completion.code===0?'completed':'failed',code:completion?.code??null,signal:completion?.signal??null,
        wallMs:duration(invocation.startedAt,completion?.finishedAt),progressRowIds:[...progressRowIds]});
    }
    if(rel.endsWith('.json') && !rel.startsWith('selector/')) {
      const v=await json(path.join(base,rel)); const m=metrics(v);
      if(m.length) workflowMetrics.push({source:rel,sha256:sha(await readFile(path.join(base,rel))),metrics:m});
    }
  }
  const providerReadouts=selectorRows(outputs);
  for(const row of providerReadouts.rows) {
    row.wrapperInvocations=invocations.filter(i=>i.progressRowIds.includes(row.id)).map(i=>i.source);
    row.association=row.wrapperInvocations.length===1?'unique wrapper progress row-id match':row.wrapperInvocations.length?'ambiguous: repeated row-id across wrappers':'unknown: no matching wrapper row-id progress';
    row.processSources=row.sources.map(s=>s.source.replace(/output\.jsonl$/, 'process.json')).filter(s=>processes.some(p=>p.source===s));
  }
  for(const invocation of invocations) invocation.providerRows=providerReadouts.rows.filter(r=>r.wrapperInvocations.includes(invocation.source)).map(r=>({id:r.id,promptSha256:r.promptSha256,association:r.association}));
  return {attempts:invocations.length,invocations,providerReadouts,processes,workflowMetrics,
    limitations:['Provider rows deduplicate exact row id + prompt SHA-256 copies. Repeated executions of identical prompts may overwrite audit files: wrapper attempts remain authoritative; row totals are not certified full attempt usage.',
      'Candidate/factor metrics retain their sourced receipt fields; overlapping workflow summaries are not summed.',
      'Wrapper attempts count invocation.json directories only, never sidecar files. Provider associations use observed wrapper progress row IDs; absent or repeated IDs remain unknown/ambiguous. Invocation args are retained but temporary path names alone cannot establish association.',
      'No generated output-token count is inferred from restricted-option logits. Local-model tokens are never pooled with coding-model tokens.']};
}

export function pairedRatios(arms, sameSettings) {
  const out=[];
  for(let i=0;i<arms.length;i++) for(let j=i+1;j<arms.length;j++) {
    const a=arms[i],b=arms[j], issues=[];
    if(!sameSettings) issues.push('Configured model/settings or stable config not established');
    if(!a.receiptComplete || !b.receiptComplete) issues.push('Incomplete receipt');
    if(a.coding.regressions.length || b.coding.regressions.length) issues.push('Cumulative usage regression');
    const totalA=sumKnown(a.coding.input,a.coding.output), totalB=sumKnown(b.coding.input,b.coding.output);
    const uncachedA=sumKnown(a.coding.uncachedInput,a.coding.output),uncachedB=sumKnown(b.coding.uncachedInput,b.coding.output);
    if(totalA===null || totalB===null) issues.push('Missing input/output usage');
    out.push({numerator:b.id,denominator:a.id,conditions:[b.condition,a.condition],eligible:!issues.length,reasons:issues,
      inputPlusOutputRatio:!issues.length && totalA>0 ? totalB/totalA:null,
      uncachedInputPlusOutputRatio:!issues.length && uncachedA>0 && uncachedB!==null ? uncachedB/uncachedA:null});
  }
  return out;
}

export async function summarize(trial) {
  const m=await json(path.join(trial,'manifest.json'));
  if(!Array.isArray(m.arms)||!m.arms.length) throw Error('Missing manifest arms');
  for(const a of m.arms) {
    if(!/^[A-Za-z0-9_-]+$/.test(a.id)) throw Error('Unsafe arm id');
    const dir=path.join(trial,'runs',a.id),r=await optional(path.join(dir,'receipt.json'));
    if(!r?.finishedAt || !await exists(path.join(dir,'immutable-after.json'))) throw Error('Study not settled; refusing active or unfinished arm '+a.id);
  }
  const arms=[],missingData=[], preserved=[[path.join(trial,'manifest.json'),sha(await readFile(path.join(trial,'manifest.json')))]];
  for(const a of m.arms) {
    const source=path.join('runs',a.id,'receipt.json'),r=await json(path.join(trial,source));
    preserved.push([path.join(trial,source),sha(await readFile(path.join(trial,source)))]);
    const frozen=path.join(trial,'frozen',a.id),snapshot=await optional(path.join(frozen,'snapshot.json'));
    if(snapshot) preserved.push([path.join(frozen,'snapshot.json'),sha(await readFile(path.join(frozen,'snapshot.json')))]);
    if(snapshot) for(const [rel,h] of Object.entries(snapshot.hashes??{})) {
      const p=path.resolve(frozen,rel);
      if(!p.startsWith(frozen+path.sep)|| typeof h!=='string' || sha(await readFile(p))!==h) throw Error('Frozen hash mismatch: '+a.id+'/'+rel);
      preserved.push([p,h]);
    }
    if(!snapshot) missingData.push(a.id+': frozen snapshot unavailable');
    const coding=codingUsage(r),configStable=r.configUnchanged===true && typeof m.configSha256==='string' && r.configBefore===m.configSha256 && r.configAfter===m.configSha256;
    if(coding.input===null || coding.output===null) missingData.push(a.id+': coding usage unavailable');
    if(coding.uncachedInput===null) missingData.push(a.id+': uncached usage unavailable or inconsistent');
    const receiptComplete=coding.completed && !r.protocolError && !r.timedOut && !r.cancelled;
    const receipts=path.join(frozen,'receipts');
    const selector=await selectorLedger(receipts,await walk(receipts));
    if(a.condition==='full' && selector.providerReadouts.input===null) missingData.push(a.id+': complete selector input usage unavailable');
    arms.push({id:a.id,condition:a.condition,source,sourceSha256:sha(await readFile(path.join(trial,source))),coding,receiptComplete,
      wallMs:number(r.wallMs)??(Number.isFinite(r.wallMs)&&r.wallMs>=0?r.wallMs:null),configStable,
      configuredSettings:{model:m.model??null,reasoningEffort:m.reasoningEffort??null,serviceTier:m.serviceTier??null},selector});
  }
  const capability=await optional(path.join(trial,'capability-confirmation.json'));
  if(capability) preserved.push([path.join(trial,'capability-confirmation.json'),sha(await readFile(path.join(trial,'capability-confirmation.json')))]);
  if(!capability) missingData.push('Shared capability confirmation unavailable');
  const sameSettings=typeof m.model==='string' && typeof m.reasoningEffort==='string' && arms.every(a=>a.configStable);
  const result={version:1,at:new Date().toISOString(),trial,arms,sameConfiguredModelSettings:sameSettings,
    pairedRatios:pairedRatios(arms,sameSettings),sharedCapabilityConfirmation:capability?{source:'capability-confirmation.json',sourceReceipt:capability.sourceReceipt??null,
      usage:capability.usage??null,note:'Shared setup usage is separate; not allocated to builder arms.'}:null,missingData,
    limitations:['Single-case coding-token ratios do not establish general savings, statistical confidence, monetary cost, human preference or design superiority.',
      'Configured settings come from the frozen manifest plus per-session config hashes; this summary does not independently audit actual model execution.',
      'Completed turn usage is latest provider-reported cumulative usage; an unreported tail cannot be recovered.',
      'Guidance versus full combines toolkit and local-selector effects. Selector and coding usage remain separate.']};
  for(const [p,h] of preserved) if(sha(await readFile(p))!==h) throw Error('Frozen input changed during accounting: '+p);
  await writeFile(path.join(trial,'cost-summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3) throw Error('Usage: summarize-marketing-study.mjs TRIAL_DIR');
  await summarize(path.resolve(process.argv[2]));
  console.log('Wrote cost-summary.json; coding and local-selector usage are separate.');
}
