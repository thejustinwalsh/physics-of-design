import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {codingUsage,selectorRows,pairedRatios,summarize} from './summarize-marketing-study.mjs';
const receipt=(status='completed',total={inputTokens:100,cachedInputTokens:80,outputTokens:10,reasoningOutputTokens:4,totalTokens:110})=>({
  finishedAt:'2026-11-08T12:01:00Z',wallMs:2000.25,configBefore:'config',configAfter:'config',configUnchanged:true,
  usage:{turnStatus:status,completeTurnObserved:status==='completed',notificationCount:3,reportedUsage:total?{total}:null},
});
const u=codingUsage(receipt());
assert.equal(u.uncachedInput,20); assert.equal(u.input+u.output,110); assert.equal(u.reasoningOutput,4);
assert.equal(codingUsage(receipt('failed')).incomplete,true);
assert.equal(codingUsage(receipt('completed',null)).input,null);
const row={id:'row',prompt_sha256:'a'.repeat(64),usage:{input_tokens:70},model:{source:'Qwen'}};
const reads=selectorRows([{source:'one.output.jsonl',content:JSON.stringify(row)+'\n'},{source:'copy.output.jsonl',content:JSON.stringify(row)+'\n'}]);
assert.equal(reads.input,70); assert.equal(reads.rows.length,1); assert.equal(reads.rows[0].sources.length,2);
assert.equal(selectorRows([{source:'top-level.output.jsonl',content:JSON.stringify({...row,usage:undefined,input_tokens:91})}]).input,91);
assert.equal(selectorRows([{source:'unknown',content:JSON.stringify({...row,usage:{}})}]).input,null);
const arm={id:'A',condition:'bare',receiptComplete:true,coding:u};
assert.equal(pairedRatios([arm,{...arm,id:'B'}],true)[0].inputPlusOutputRatio,1);
assert.equal(pairedRatios([arm,{...arm,id:'B',receiptComplete:false}],true)[0].inputPlusOutputRatio,null);
assert.equal(pairedRatios([arm,{...arm,id:'B'}],false)[0].eligible,false);
const dir=await mkdtemp(path.join(os.tmpdir(),'marketing-accounting-synthetic-'));
const save=async(p,v)=>writeFile(p,JSON.stringify(v));
try {
  await save(path.join(dir,'manifest.json'),{model:'synthetic',reasoningEffort:'high',serviceTier:null,configSha256:'config',arms:[{id:'A',condition:'bare'},{id:'B',condition:'guidance'}]});
  for(const id of ['A','B']) {
    await mkdir(path.join(dir,'runs',id),{recursive:true});
    await save(path.join(dir,'runs',id,'receipt.json'),receipt(id==='A'?'completed':'failed'));
    await mkdir(path.join(dir,'frozen',id),{recursive:true});
    await save(path.join(dir,'frozen',id,'snapshot.json'),{hashes:{}});
  }
  await assert.rejects(summarize(dir),/not settled/);
  for(const id of ['A','B']) await save(path.join(dir,'runs',id,'immutable-after.json'),{});
  const selector=path.join(dir,'frozen','A','receipts','selector');
  await mkdir(path.join(selector,'actual-wrapper'),{recursive:true});
  await save(path.join(selector,'actual-wrapper','invocation.json'),{args:['--input','/temporary/input.jsonl'],startedAt:'2026-11-08T12:00:00Z'});
  await save(path.join(selector,'actual-wrapper','completion.json'),{code:0,finishedAt:'2026-11-08T12:00:02Z'});
  await writeFile(path.join(selector,'actual-wrapper','stderr.txt'),'@design-selector-progress '+JSON.stringify({phase:'readout-complete',rowId:'row'})+'\n');
  await writeFile(path.join(selector,'row.output.jsonl'),JSON.stringify({...row,usage:undefined,input_tokens:91})+'\n');
  await writeFile(path.join(selector,'row.input.jsonl'),JSON.stringify({id:'row'})+'\n');
  await save(path.join(selector,'row.process.json'),{code:0,elapsedMs:1900});
  const result=await summarize(dir);
  assert.equal(result.arms[0].coding.input,100);
  assert.equal(result.arms[0].wallMs,2000.25);
  assert.equal(result.arms[1].receiptComplete,false);
  assert.equal(result.pairedRatios[0].eligible,false);
  assert.equal(result.arms[0].selector.attempts,1);
  assert.equal(result.arms[0].selector.invocations[0].wallMs,2000);
  assert.equal(result.arms[0].selector.providerReadouts.input,91);
  assert.equal(result.arms[0].selector.providerReadouts.rows[0].wrapperInvocations.length,1);
  assert.equal(result.arms[0].selector.providerReadouts.rows[0].processSources[0],'selector/row.process.json');
  assert.equal(JSON.parse(await readFile(path.join(dir,'cost-summary.json'),'utf8')).arms.length,2);
  assert.equal(JSON.parse(await readFile(path.join(dir,'runs','A','receipt.json'),'utf8')).usage.reportedUsage.total.inputTokens,100);
} finally {await rm(dir,{recursive:true,force:true});}
console.log('Synthetic accounting fixtures passed: cached inclusion, partial/unknown usage, duplicate selector rows, ratio gates, settlement gate and output.');
