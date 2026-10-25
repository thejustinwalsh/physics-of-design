import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  probe,
  validateSelectorCapabilityResult,
} from '../scripts/relay-selector-capability.mjs';
import { artifact } from '../scripts/relay-capabilities.mjs';

const checkpointSha256 = '7'.repeat(64);
const selector = {
  profile: 'qwen3.5-4b',
  revision: 'pinned-revision',
  checkpoint: { path: '/fixture/checkpoint.gguf', sha256: checkpointSha256 },
  executable: { path: '/fixture/selector' },
};
function result() {
  return {
    selected: 'a',
    provenance: {
      readoutPasses: 1,
      execution: { code: 0, cancelled: false },
      model: {
        source: 'Qwen/Qwen3.5-4B',
        revision: selector.revision,
        gguf: { sha256: checkpointSha256 },
      },
    },
  };
}
async function fixture(value, run) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'selector-capability-'));
  const output = path.join(workspace, 'output');
  await mkdir(output);
  await mkdir(path.join(workspace, 'toolkit/dist'), { recursive: true });
  await writeFile(
    path.join(workspace, 'toolkit/package.json'),
    '{"type":"module"}',
  );
  const received = path.join(output, 'received.json');
  await writeFile(
    path.join(workspace, 'toolkit/dist/selector.js'),
    `import fs from 'node:fs';export async function selectLocalOptions(request){fs.writeFileSync(${JSON.stringify(received)},JSON.stringify(request));return ${JSON.stringify(value)};}`,
  );
  const previous = process.env.DESIGN_SEMIF_BIN;
  process.env.DESIGN_SEMIF_BIN = selector.executable.path;
  try {
    await run({ workspace, output, selector }, received);
  } finally {
    if (previous === undefined) delete process.env.DESIGN_SEMIF_BIN;
    else process.env.DESIGN_SEMIF_BIN = previous;
    await rm(workspace, { recursive: true, force: true });
  }
}

test('qualification preserves a two-option request and exact completed provider result as separate artifacts', async () => {
  await fixture(result(), async (input, received) => {
    const receipt = await probe(input);
    const request = JSON.parse(await readFile(received, 'utf8'));
    assert.equal(request.readout, 'single');
    assert.equal(request.profile, 'qwen3.5-4b');
    assert.equal(request.gguf, selector.checkpoint.path);
    assert.deepEqual(
      request.payload.options.map((o) => o.id),
      ['a', 'b'],
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(input.output, receipt.artifact.path), 'utf8'),
      ),
      result(),
    );
    assert.equal(receipt.readout.completed, 1);
    assert.equal(receipt.cleanup.confirmed, true);
    // This test uses an injected module, not an actual model measurement.
  });
});

test('another profile or provider cannot invoke the readout', async () => {
  await fixture(result(), async (input, received) => {
    await assert.rejects(
      probe({ ...input, selector: { ...selector, profile: 'qwen3.5-0.8b' } }),
      /single provisional 4B/,
    );
    process.env.DESIGN_SEMIF_BIN = '/another/provider';
    await assert.rejects(probe(input), /assigned selector executable/);
    await assert.rejects(readFile(received), { code: 'ENOENT' });
  });
});

test('cancelled, failed, mismatched and extra-pass results never become a successful capability artifact', async () => {
  const variants = [
    (r) => {
      r.provenance.execution.cancelled = true;
    },
    (r) => {
      r.provenance.execution.code = 1;
    },
    (r) => {
      r.provenance.model.gguf.sha256 = '8'.repeat(64);
    },
    (r) => {
      r.provenance.model.revision = 'different';
    },
    (r) => {
      r.provenance.model.source = 'another-model';
    },
    (r) => {
      r.provenance.readoutPasses = 2;
    },
    (r) => {
      r.selected = 'undeclared';
    },
  ];
  for (const change of variants) {
    const value = result();
    change(value);
    await fixture(value, async (input) => {
      await assert.rejects(
        probe(input),
        /completed, pinned two-option readout/,
      );
      await assert.rejects(readFile(path.join(input.output, 'readout.json')), {
        code: 'ENOENT',
      });
    });
  }
});

test('rehashing malformed raw readouts or changed requests cannot preserve readiness', async () => {
  await fixture(result(), async (input) => {
    const receipt = await probe(input);
    const readoutPath = path.join(input.output, receipt.artifact.path);
    const originalReadout = await readFile(readoutPath);
    for (const edit of [
      (r) => {
        r.provenance.execution.cancelled = true;
      },
      (r) => {
        r.provenance.model.gguf.sha256 = '9'.repeat(64);
      },
      (r) => {
        r.selected = 'b';
      },
    ]) {
      const changed = JSON.parse(originalReadout);
      edit(changed);
      await writeFile(readoutPath, JSON.stringify(changed));
      const changedReceipt = {
        ...receipt,
        artifact: artifact(input.output, receipt.artifact.path),
      };
      assert.throws(() =>
        validateSelectorCapabilityResult(changedReceipt, input.output, input),
      );
    }
    await writeFile(readoutPath, originalReadout);
    const requestPath = path.join(input.output, receipt.request.path);
    const request = JSON.parse(await readFile(requestPath, 'utf8'));
    request.payload.options = [
      { id: 'a', description: 'Only one alternative' },
    ];
    await writeFile(requestPath, JSON.stringify(request));
    assert.throws(
      () =>
        validateSelectorCapabilityResult(
          { ...receipt, request: artifact(input.output, receipt.request.path) },
          input.output,
          input,
        ),
      /frozen two-option fixture/,
    );
  });
});

test('caller cancellation reaches the readout and removes signal handlers without a successful artifact', async () => {
  await fixture(result(), async (input) => {
    const received = path.join(input.output, 'signal-observed');
    await writeFile(
      path.join(input.workspace, 'toolkit/dist/selector.js'),
      `import fs from 'node:fs';export function selectLocalOptions(request,options){return new Promise((resolve,reject)=>{fs.writeFileSync(${JSON.stringify(received)},'started');options.signal.addEventListener('abort',()=>{fs.appendFileSync(${JSON.stringify(received)},':aborted');reject(Object.assign(new Error('Cancelled synthetic provider'),{name:'AbortError'}));},{once:true});});}`,
    );
    const before = [
      process.listenerCount('SIGINT'),
      process.listenerCount('SIGTERM'),
    ];
    const controller = new AbortController();
    const pending = probe({ ...input, signal: controller.signal });
    // Wait for the actual stub to receive execution hooks, rather than racing
    // a timer against import or filesystem startup.
    for (let i = 0; i < 100; i++) {
      try {
        await readFile(received);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(await readFile(received, 'utf8'), 'started:aborted');
    assert.deepEqual(
      [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')],
      before,
    );
    await assert.rejects(readFile(path.join(input.output, 'readout.json')), {
      code: 'ENOENT',
    });
  });
});
