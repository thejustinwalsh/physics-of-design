import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { recordSession } from '../scripts/design-builder-metrics.mjs';

async function peer() {
  const dir = await mkdtemp(path.join(tmpdir(), 'metrics-startup-'));
  const executable = path.join(dir, 'peer.mjs');
  await writeFile(
    executable,
    `import readline from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
const usage=n=>({method:'thread/tokenUsage/updated',params:{threadId:'t',turnId:'u',tokenUsage:{total:{inputTokens:n,cachedInputTokens:0,outputTokens:1,reasoningOutputTokens:0,totalTokens:n+1},last:{inputTokens:n,cachedInputTokens:0,outputTokens:1,reasoningOutputTokens:0,totalTokens:n+1}}}});
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{userAgent:'synthetic'}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'},model:'synthetic-wrong-model',reasoningEffort:'high'}});
if(m.method==='turn/start')setTimeout(()=>{send({id:m.id,result:{turn:{id:'u'}}});send({method:'turn/started',params:{threadId:'t',turn:{id:'u',status:'inProgress'}}});send(usage(20));},150);
if(m.method==='turn/interrupt'){send({id:m.id,result:{}});send(usage(30));send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'interrupted'}}});}
});`,
  );
  return { dir, executable, out: path.join(dir, 'receipt') };
}

test('cancel during pending turn start interrupts once the turn ID arrives', async () => {
  const { dir, executable, out } = await peer(),
    controller = new AbortController();
  const pending = recordSession(
    {
      cwd: dir,
      prompt: 'Synthetic protocol only',
      timeoutMs: null,
      interruptGraceMs: 500,
    },
    out,
    {
      executable: process.execPath,
      argsPrefix: [executable],
      signal: controller.signal,
    },
  );
  let started = false;
  for (let i = 0; i < 200; i++) {
    try {
      if (
        (await readFile(path.join(out, 'requests.jsonl'), 'utf8')).includes(
          'turn/start',
        )
      ) {
        started = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  controller.abort();
  const result = await pending;
  assert.ok(started);
  assert.equal(result.cancelled, true);
  assert.equal(result.usage.turnStatus, 'interrupted');
  assert.equal(result.usage.reportedUsage.total.inputTokens, 30);
  const requests = (await readFile(path.join(out, 'requests.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(requests.filter((r) => r.method === 'turn/interrupt').length, 1);
});

test('resolved thread validation can reject a model before inference starts', async () => {
  const { dir, executable, out } = await peer();
  const result = await recordSession(
    { cwd: dir, prompt: 'Never sent to a turn', timeoutMs: null },
    out,
    {
      executable: process.execPath,
      argsPrefix: [executable],
      validateThreadStart: (resolved) => {
        if (resolved.model !== 'requested-model')
          throw Error('Resolved model mismatch');
      },
    },
  );
  assert.match(result.protocolError, /Resolved model mismatch/);
  assert.equal(result.usage.reportedUsage, null);
  assert.ok(
    !(await readFile(path.join(out, 'requests.jsonl'), 'utf8')).includes(
      'turn/start',
    ),
  );
});
