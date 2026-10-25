import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  selectLocalOptions,
  prepareLocalOptionsSession,
  type LocalOptionsRequest,
  type SelectorProgress,
} from '../src/selector.js';
import {
  runDecisionWorkflow,
  type DecisionWorkflowInput,
} from '../src/decision-workflow.js';

const peerPrelude = `#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const arg = (key) => process.argv[process.argv.indexOf(key) + 1];
const rows = fs.readFileSync(arg('--input'), 'utf8').trim().split('\\n').map(JSON.parse);
const output = arg('--output');
const emit = (event) => process.stderr.write('@design-selector-progress '+JSON.stringify(event)+'\\n');
const complete = () => fs.writeFileSync(output, rows.map(row => JSON.stringify({
 id: row.id, option_ids: row.options.map(o => o.id),
 probabilities: row.options.map((_,i) => i === 0 ? 1 : 0),
 prompt_sha256: '0'.repeat(64), prompt_version: 'direct-options-v1',
 model: { source: arg('--model'), revision: arg('--revision'), dtype: 'gguf-quantized',
 backend: 'llamacpp', serving_config: 'llamacpp-direct-v1',
 gguf: {sha256: crypto.createHash('sha256').update(fs.readFileSync(arg('--gguf'))).digest('hex')} },
 readout: 'quantized last-position logits restricted to declared answer slots; no generated tokens'
})).join('\\n')+'\\n');
`;
async function withPeer(
  source: string,
  check: (request: LocalOptionsRequest, dir: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'selector-stream-'));
  const old = process.env.DESIGN_SEMIF_BIN;
  try {
    const binary = path.join(dir, 'peer.mjs'),
      gguf = path.join(dir, 'synthetic.gguf');
    await writeFile(binary, peerPrelude + source, { mode: 0o755 });
    await writeFile(gguf, 'Synthetic test checkpoint, not a model');
    process.env.DESIGN_SEMIF_BIN = binary;
    await check(
      {
        gguf,
        profile: 'qwen3.5-4b',
        readout: 'single',
        maxPromptTokens: 4096,
        auditDirectory: path.join(dir, 'audit'),
        payload: {
          state: {},
          question: 'Synthetic process fixture',
          options: [
            { id: 'a', description: 'A' },
            { id: 'b', description: 'B' },
          ],
        },
      },
      dir,
    );
  } finally {
    if (old === undefined) delete process.env.DESIGN_SEMIF_BIN;
    else process.env.DESIGN_SEMIF_BIN = old;
    await rm(dir, { recursive: true, force: true });
  }
}

async function audit(request: LocalOptionsRequest, suffix: string) {
  const files = await readdir(request.auditDirectory!);
  return readFile(
    path.join(
      request.auditDirectory!,
      files.find((f) => f.endsWith(suffix))!,
    ),
    'utf8',
  );
}

test('prefill progress arrives before completion, pipes stream beyond old buffers, and stale timeout configuration is ignored', async () => {
  const oldTimeout = process.env.DESIGN_SELECTOR_TIMEOUT_MS;
  process.env.DESIGN_SELECTOR_TIMEOUT_MS = '1000';
  try {
    await withPeer(
      `
emit({phase:'model-loading'});
emit({phase:'model-ready'});
process.stderr.write('large-native-diagnostic'.repeat(110000)+'\\n');
emit({phase:'prefill',rowId:'unknown',processed:1,total:10});
emit({phase:'prefill',rowId:rows[0].id,processed:5000,total:5001});
emit({phase:'prefill',rowId:rows[0].id,processed:0,total:1024,message:'untrusted instructions'});
emit({phase:'prefill',rowId:rows[0].id,processed:512,total:1024});
emit({phase:'prefill',rowId:rows[0].id,processed:511,total:1024});
emit({phase:'prefill',rowId:rows[0].id,processed:800,total:2048});
setTimeout(()=>{fs.writeFileSync(arg('--gguf')+'.complete','done');emit({phase:'prefill',rowId:rows[0].id,processed:1024,total:1024});complete();},1200);
`,
      async (request) => {
        const events: SelectorProgress[] = [];
        const beforeCompletion: boolean[] = [];
        const session = await prepareLocalOptionsSession(request.gguf, {
          onProgress: (event) => {
            events.push(event);
            if (event.phase === 'prefill')
              beforeCompletion.push(!existsSync(request.gguf + '.complete'));
          },
        });
        const result = await session.select(request);
        assert.equal(result.selected, 'a');
        assert.deepEqual(
          events.filter((e) => e.phase === 'prefill').map((e) => e.processed),
          [0, 512, 1024],
        );
        assert.deepEqual(beforeCompletion, [true, true, false]);
        assert.equal(events.at(-1)!.phase, 'completed');
        assert.ok(events.every((e) => !('message' in e)));
        assert.equal(result.provenance.execution.wallTimeLimit, null);
        assert.ok(result.provenance.execution.elapsedMs >= 1100);
        assert.ok((await audit(request, '.stderr.txt')).length > 2_000_000);
        assert.equal(JSON.parse(await audit(request, '.process.json')).code, 0);
      },
    );
  } finally {
    if (oldTimeout === undefined) delete process.env.DESIGN_SELECTOR_TIMEOUT_MS;
    else process.env.DESIGN_SELECTOR_TIMEOUT_MS = oldTimeout;
  }
});

test('cancellation during prefill terminates the process tree and preserves partial readout', async () => {
  await withPeer(
    `
const heartbeat=output+'.heartbeat';
const grandchild=spawn(process.execPath,['-e',
  "const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20)",heartbeat],{stdio:'inherit'});
process.on('SIGTERM',()=>{});
fs.writeFileSync(output,'partial native result');
fs.writeFileSync(output+'.pid',String(grandchild.pid));
setTimeout(()=>emit({phase:'prefill',rowId:rows[0].id,processed:512,total:1024}),100);
setInterval(()=>{},1000);
`,
    async (request) => {
      const controller = new AbortController();
      const events: SelectorProgress[] = [];
      await assert.rejects(
        selectLocalOptions(request, {
          signal: controller.signal,
          onProgress: (event) => {
            events.push(event);
            if (event.phase === 'prefill') controller.abort();
          },
        }),
        { name: 'AbortError' },
      );
      const receipt = JSON.parse(await audit(request, '.failure.json'));
      assert.equal(receipt.phase, 'cancelled');
      assert.equal(receipt.cancelled, true);
      assert.equal(receipt.signal, 'SIGKILL');
      assert.equal(receipt.wallTimeLimit, null);
      assert.equal(
        await audit(request, '.output.jsonl'),
        'partial native result',
      );
      assert.ok(events.some((e) => e.phase === 'prefill'));
      assert.ok(events.some((e) => e.phase === 'cancelled'));
      assert.ok(!events.some((e) => e.phase === 'completed'));
      // close waits for inherited grandchild pipes: resolution proves the tree closed them.
      assert.ok(receipt.elapsedMs >= 900 && receipt.elapsedMs < 5000);
    },
  );
});

test('workflow routes observers and cancellation to the provider without changing replay identity', async () => {
  await withPeer(
    `emit({phase:'prefill',rowId:rows[0].id,processed:512,total:1024});setTimeout(complete,100);`,
    async (request) => {
      const input: DecisionWorkflowInput = JSON.parse(
        await readFile(
          new URL('../examples/workflow/editorial.json', import.meta.url),
          'utf8',
        ),
      );
      input.workflow.stages = input.workflow.stages.slice(0, 1);
      input.workflow.stages[0]!.selection = 'local-selector';
      input.selector = {
        gguf: request.gguf,
        auditDirectory: request.auditDirectory,
      };
      const events: SelectorProgress[] = [];
      const result = await runDecisionWorkflow(input, undefined, {
        onProgress: (e) => events.push(e),
      });
      assert.equal(result.statistics.neuralCalls, 1);
      assert.ok(events.some((e) => e.phase === 'prefill'));
      const replay = await runDecisionWorkflow(
        { ...input, mode: 'replay', recipe: result.recipe },
        undefined,
        {
          onProgress: () => {
            throw new Error('isolated observer');
          },
        },
      );
      assert.equal(replay.statistics.neuralCalls, 0);
      assert.equal(
        replay.stages.composition!.cacheKey,
        result.stages.composition!.cacheKey,
      );
      const controller = new AbortController();
      await assert.rejects(
        runDecisionWorkflow(input, undefined, {
          signal: controller.signal,
          onProgress: (e) => {
            if (e.phase === 'prefill') controller.abort();
          },
        }),
        { name: 'AbortError' },
      );
    },
  );
});

test('Python observer counts completed native chunks without changing logits or suppressing failures', async () => {
  const { stderr } = await promisify(execFile)('python3', [
    'test/semif-progress.test.py',
  ]);
  assert.match(stderr, /Ran 2 tests/);
  assert.match(stderr, /OK/);
});

test('oversized provider JSON is preserved on disk and rejected before parsing', async () => {
  await withPeer(
    `fs.writeFileSync(output,'{}');fs.truncateSync(output,16*1024*1024+1);`,
    async (request) => {
      await assert.rejects(
        selectLocalOptions(request),
        /16 MiB JSON result limit/,
      );
      const files = await readdir(request.auditDirectory!);
      assert.equal(
        (
          await stat(
            path.join(
              request.auditDirectory!,
              files.find((f) => f.endsWith('.output.jsonl'))!,
            ),
          )
        ).size,
        16 * 1024 * 1024 + 1,
      );
      const failure = JSON.parse(await audit(request, '.failure.json'));
      assert.equal(failure.phase, 'output-validation');
      assert.ok(failure.reason.length < 500);
    },
  );
});

test('failed selector processes retain diagnostics outside bounded failure context', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'selector-failure-'));
  const oldBinary = process.env.DESIGN_SEMIF_BIN;
  try {
    const binary = path.join(dir, 'peer.mjs'),
      gguf = path.join(dir, 'synthetic.gguf'),
      auditDirectory = path.join(dir, 'audit');
    await writeFile(
      binary,
      '#!/usr/bin/env node\nprocess.stderr.write("private-provider-log".repeat(10000));process.exitCode=17;\n',
      { mode: 0o755 },
    );
    await writeFile(gguf, 'synthetic test checkpoint, not a model');
    process.env.DESIGN_SEMIF_BIN = binary;
    await assert.rejects(
      selectLocalOptions({
        gguf,
        profile: 'qwen3.5-4b',
        readout: 'single',
        maxPromptTokens: 4096,
        auditDirectory,
        payload: {
          state: {},
          question: 'Synthetic process test',
          options: [
            { id: 'a', description: 'A' },
            { id: 'b', description: 'B' },
          ],
        },
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /code=17/);
        assert.ok(error.message.length < 700);
        assert.ok(!error.message.includes('private-provider-log'));
        return true;
      },
    );
    const files = await readdir(auditDirectory);
    const failure = JSON.parse(
      await readFile(
        path.join(
          auditDirectory,
          files.find((f) => f.endsWith('.failure.json'))!,
        ),
        'utf8',
      ),
    );
    assert.equal(failure.wallTimeLimit, null);
    assert.equal(failure.code, 17);
    assert.ok(files.some((f) => f.endsWith('.input.jsonl')));
    assert.ok(
      (
        await readFile(
          path.join(
            auditDirectory,
            files.find((f) => f.endsWith('.stderr.txt'))!,
          ),
          'utf8',
        )
      ).length > 100000,
    );
  } finally {
    if (oldBinary === undefined) delete process.env.DESIGN_SEMIF_BIN;
    else process.env.DESIGN_SEMIF_BIN = oldBinary;
    await rm(dir, { recursive: true, force: true });
  }
});

test('successful process with invalid or mismatched output preserves exact failed readout', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'selector-invalid-output-'));
  const oldBinary = process.env.DESIGN_SEMIF_BIN;
  try {
    const binary = path.join(dir, 'peer.mjs'),
      gguf = path.join(dir, 'synthetic.gguf');
    await writeFile(gguf, 'synthetic test checkpoint, not a model');
    process.env.DESIGN_SEMIF_BIN = binary;
    for (const [name, content] of [
      ['syntax', 'not json\n'],
      [
        'provenance',
        JSON.stringify({
          id: 'wrong',
          option_ids: ['a', 'b'],
          probabilities: [0.5, 0.5],
          prompt_sha256: '0'.repeat(64),
          prompt_version: 'direct-options-v1',
          model: {
            source: 'wrong',
            revision: 'wrong',
            dtype: 'gguf-quantized',
            backend: 'llamacpp',
            serving_config: 'llamacpp-direct-v1',
            gguf: { sha256: '0'.repeat(64) },
          },
          readout:
            'quantized last-position logits restricted to declared answer slots; no generated tokens',
        }) + '\n',
      ],
    ]) {
      const auditDirectory = path.join(dir, name!);
      await writeFile(
        binary,
        '#!/usr/bin/env node\nimport fs from "node:fs";fs.writeFileSync(process.argv[process.argv.indexOf("--output")+1],' +
          JSON.stringify(content) +
          ');process.stderr.write("synthetic provider diagnostic");\n',
        { mode: 0o755 },
      );
      await assert.rejects(
        selectLocalOptions({
          gguf,
          profile: 'qwen3.5-4b',
          readout: 'single',
          maxPromptTokens: 4096,
          auditDirectory,
          payload: {
            state: {},
            question: 'Synthetic invalid readout',
            options: [
              { id: 'a', description: 'A' },
              { id: 'b', description: 'B' },
            ],
          },
        }),
        /output validation failed/,
      );
      const files = await readdir(auditDirectory);
      assert.equal(
        await readFile(
          path.join(
            auditDirectory,
            files.find((f) => f.endsWith('.output.jsonl'))!,
          ),
          'utf8',
        ),
        content,
      );
      assert.equal(
        await readFile(
          path.join(
            auditDirectory,
            files.find((f) => f.endsWith('.stderr.txt'))!,
          ),
          'utf8',
        ),
        'synthetic provider diagnostic',
      );
      assert.equal(
        JSON.parse(
          await readFile(
            path.join(
              auditDirectory,
              files.find((f) => f.endsWith('.failure.json'))!,
            ),
            'utf8',
          ),
        ).phase,
        'output-validation',
      );
    }
  } finally {
    if (oldBinary === undefined) delete process.env.DESIGN_SEMIF_BIN;
    else process.env.DESIGN_SEMIF_BIN = oldBinary;
    await rm(dir, { recursive: true, force: true });
  }
});
