import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  JsonLines,
  UsageLedger,
  recordSession,
} from '../scripts/design-builder-metrics.mjs';
const breakdown = (n) => ({
  inputTokens: n,
  cachedInputTokens: n - 1,
  outputTokens: 2,
  reasoningOutputTokens: 1,
  totalTokens: n + 2,
});
const notification = (n = 10, threadId = 't') => ({
  method: 'thread/tokenUsage/updated',
  params: {
    threadId,
    turnId: 'u',
    tokenUsage: {
      total: breakdown(n),
      last: breakdown(n),
      modelContextWindow: 12345,
    },
  },
});
test('JSONL preserves UTF8 split across bytes and multiple frames', () => {
  const values = [];
  const p = new JsonLines((x) => values.push(x));
  const b = Buffer.from('{"text":"é🙂"}\n{"n":2}\n');
  for (const byte of b) p.push(Buffer.from([byte]));
  assert.deepEqual(values, [{ text: 'é🙂' }, { n: 2 }]);
  assert.equal(p.end().truncated, false);
});
test('partial final record is retained as truncated rather than invented', () => {
  const p = new JsonLines(() => {});
  p.push(Buffer.from('{"id":'));
  assert.deepEqual(p.end(), {
    completeLines: 0,
    trailingBytes: 6,
    truncated: true,
  });
});
test('malformed and oversized records fail explicitly', () => {
  assert.throws(() => new JsonLines(() => {}).push(Buffer.from('not json\n')));
  assert.throws(() => new JsonLines(() => {}, 4).push(Buffer.from('12345')));
});
test('cumulative updates replace and duplicates never inflate usage', () => {
  const l = new UsageLedger('t');
  l.accept(notification());
  l.accept(notification());
  l.accept(notification(20));
  assert.equal(l.snapshot('timeout').reportedUsage.total.inputTokens, 20);
  assert.equal(l.snapshot('timeout').notificationCount, 3);
  assert.equal(l.snapshot('timeout').reportedUsage.total.cachedInputTokens, 19);
  assert.equal(l.snapshot('timeout').completeTurnObserved, false);
});
test('unknown stays null; other-thread notifications cannot supply missing usage', () => {
  const l = new UsageLedger('t');
  assert.equal(l.accept(notification(10, 'other')), false);
  assert.equal(l.snapshot('timeout').reportedUsage, null);
});
test('invalid counters fail, and actual counter regression is disclosed not repaired', () => {
  const l = new UsageLedger('t');
  l.accept(notification(20));
  l.accept(notification(10));
  assert.equal(l.regressions.length, 1);
  assert.equal(l.snapshot('timeout').reportedUsage.total.inputTokens, 10);
  const invalid = notification();
  invalid.params.tokenUsage.total.inputTokens = -1;
  assert.throws(() => l.accept(invalid));
});
// Synthetic protocol peer, NOT model usage. It exercises real pipe/process interruption and disk receipts.
async function fake(mode, timeoutMs = 250, cancelAfterUsage = false) {
  const dir = await mkdtemp(path.join(tmpdir(), 'metrics-test-'));
  const peer = path.join(dir, 'peer.mjs');
  await writeFile(
    peer,
    `import readline from 'node:readline';const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');const mode=${JSON.stringify(mode)};const usage=n=>({method:'thread/tokenUsage/updated',params:{threadId:'t',turnId:'u',tokenUsage:{last:{inputTokens:n,cachedInputTokens:n-1,outputTokens:2,reasoningOutputTokens:1,totalTokens:n+2},total:{inputTokens:n,cachedInputTokens:n-1,outputTokens:2,reasoningOutputTokens:1,totalTokens:n+2}}}});readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')send({id:m.id,result:{userAgent:'synthetic-test-peer'}});if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'}}});if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'u'}}});send({method:'turn/started',params:{threadId:'t',turn:{id:'u',status:'inProgress'}}});if(mode!=='unknown'){send(usage(10));setTimeout(()=>send(usage(20)),10);}if(mode==='complete'){setTimeout(()=>send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}}),350);}}if(m.method==='turn/interrupt'){send({id:m.id,result:{}});if(mode==='drain'){send(usage(30));send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'interrupted'}}});}}});`,
  );
  const out = path.join(dir, 'receipt');
  const controller = new AbortController();
  const pending = recordSession(
    {
      cwd: dir,
      prompt: 'synthetic test only',
      timeoutMs,
      interruptGraceMs: 40,
    },
    out,
    {
      executable: process.execPath,
      argsPrefix: [peer],
      signal: controller.signal,
    },
  );
  if (cancelAfterUsage) {
    let observed = false;
    for (let i = 0; i < 200; i++) {
      try {
        const value = JSON.parse(
          await readFile(path.join(out, 'usage-latest.json'), 'utf8'),
        );
        if (value.reportedUsage?.total.inputTokens === 20) {
          observed = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    controller.abort();
    if (!observed) {
      await pending;
      throw Error('Synthetic peer did not report usage');
    }
  }
  const result = await pending;
  return { result, out };
}
test('real process timeout preserves already reported counters on disk with no completed event', async () => {
  const { result, out } = await fake('partial');
  assert.equal(result.timedOut, true);
  assert.equal(result.usage.reportedUsage.total.inputTokens, 20);
  assert.equal(result.usage.completeTurnObserved, false);
  const persisted = JSON.parse(
    await readFile(path.join(out, 'usage-latest.json'), 'utf8'),
  );
  assert.equal(persisted.reportedUsage.total.inputTokens, 20);
  const journal = (await readFile(path.join(out, 'usage.jsonl'), 'utf8'))
    .trim()
    .split('\n');
  assert.equal(journal.length, 2);
  assert.equal(result.rawSha256.length, 64);
});
test('interrupt drain retains late usage while keeping interrupted coverage explicit', async () => {
  const { result } = await fake('drain');
  assert.equal(result.timedOut, true);
  assert.equal(result.usage.reportedUsage.total.inputTokens, 30);
  assert.equal(result.usage.turnStatus, 'interrupted');
  assert.equal(result.usage.completeTurnObserved, false);
});
test('timeout with no notification persists unknown, never zero', async () => {
  const { result } = await fake('unknown');
  assert.equal(result.timedOut, true);
  assert.equal(result.usage.reportedUsage, null);
  assert.equal(result.usage.notificationCount, 0);
});

test('explicit null removes the wall-time budget and completes without timeout', async () => {
  const { result } = await fake('complete', null);
  assert.equal(result.timedOut, false);
  assert.equal(result.wallTimeLimitMs, null);
  assert.equal(result.usage.completeTurnObserved, true);
  assert.equal(result.usage.reportedUsage.total.inputTokens, 20);
  assert.ok(result.wallMs >= 350);
});

test('unbounded session cancellation interrupts and retains drained actual protocol reports', async () => {
  const { result } = await fake('drain', null, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.wallTimeLimitMs, null);
  assert.match(result.finishReason, /^cancelled/u);
  assert.equal(result.usage.turnStatus, 'interrupted');
  assert.equal(result.usage.reportedUsage.total.inputTokens, 30);
  assert.equal(result.protocolError, null);
});
