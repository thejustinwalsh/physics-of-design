import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseState, type LayoutMeasurement } from '../src/state.js';
import { measurementKey, type Renderer } from '../src/measurement.js';
import { selectChoice, QWEN_REVISION } from '../src/selector.js';
import { NativeReceiptSchema, startNativeBridge } from '../src/native.js';
import { nativeMapping } from '../src/emission.js';

const hero = () =>
  parseState(JSON.parse(readFileSync('examples/hero.json', 'utf8')));
function fixtureRenderer(valid = true): Renderer {
  return {
    close: async () => {},
    measure: async (state) =>
      ({
        inputHash: measurementKey(state),
        platform: state.platform,
        engine: 'contract-fixture-only',
        runtime: {},
        blocks: [],
        issues: valid
          ? []
          : [
              {
                code: 'fixture-failure',
                severity: 'hard',
                message: 'intentional contract fixture',
              },
            ],
        feasible: valid,
        textSpacing: { tested: false, issues: [] },
        scope: ['Test fixture; not measurement evidence.'],
      }) satisfies LayoutMeasurement,
  };
}
test('selector rejects infeasible candidates and bypasses the model for a single viable choice', async () => {
  const input = {
    candidates: [{ id: 'a', state: hero() }],
    criterion: 'Prefer a quiet reading rhythm.',
    gguf: 'missing.gguf',
    widths: [360],
    textScales: [1],
  };
  assert.equal(
    (await selectChoice(input, fixtureRenderer(false))).selected,
    null,
  );
  const only = await selectChoice(input, fixtureRenderer());
  assert.equal(only.selected, 'a');
  assert.equal(only.modelCalled, false);
});
test(
  'SemIf CLI adapter validates pinned model and checkpoint provenance; probabilities are not exported',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'physics-selector-test-'));
    const old = process.env.DESIGN_SEMIF_BIN;
    try {
      const gguf = path.join(dir, 'contract-fixture.gguf');
      await writeFile(gguf, 'not model weights; protocol fixture');
      const digest = createHash('sha256')
        .update(await readFile(gguf))
        .digest('hex');
      const bin = path.join(dir, 'semif-fixture.mjs');
      await writeFile(
        bin,
        `#!/usr/bin/env node\nimport fs from 'node:fs';const args=process.argv.slice(2);const row=JSON.parse(fs.readFileSync(args[args.indexOf('--input')+1]));fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({id:row.id,option_ids:row.options.map(o=>o.id),probabilities:[.3,.7],prompt_sha256:'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',prompt_version:'direct-options-v1',model:{source:'Qwen/Qwen3.5-4B',revision:'${QWEN_REVISION}',dtype:'gguf-quantized',backend:'llamacpp',serving_config:'llamacpp-direct-v1',gguf:{sha256:'${digest}'}},readout:'quantized last-position logits restricted to declared answer slots; no generated tokens'})+'\\n');`,
        { mode: 0o755 },
      );
      process.env.DESIGN_SEMIF_BIN = bin;
      const a = hero(),
        b = hero();
      b.gaps[0] = 32;
      const result = await selectChoice(
        {
          candidates: [
            { id: 'a', state: a },
            { id: 'b', state: b },
          ],
          criterion: 'Prefer the more open direction.',
          gguf,
          widths: [360],
          textScales: [1],
        },
        fixtureRenderer(),
      );
      assert.equal(result.selected, 'b');
      assert.equal(result.modelCalled, true);
      assert.ok(!('probabilities' in result));
    } finally {
      if (old === undefined) delete process.env.DESIGN_SEMIF_BIN;
      else process.env.DESIGN_SEMIF_BIN = old;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
test(
  'native bridge requires authentication and binds receipts to state, platform and fonts',
  { timeout: 10000 },
  async () => {
    const server = await startNativeBridge(0, 'contract-token');
    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const url = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${url}/health`)).status, 401);
      const headers = {
          authorization: 'Bearer contract-token',
          'content-type': 'application/json',
        },
        state = hero();
      state.platform = 'native-ios';
      const created = await fetch(`${url}/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(state),
      });
      assert.equal(created.status, 201);
      const { id } = (await created.json()) as { id: string };
      const job = await fetch(`${url}/next?platform=native-ios`, { headers });
      assert.equal(job.status, 200);
      const mismatch = {
        inputHash: 'wrong',
        engine: 'react-native/Text+Yoga',
        platform: 'native-ios',
        runtime: {
          reactNative: 'fixture',
          os: 'fixture',
          fontScale: 1,
          pixelRatio: 1,
        },
        loadedFonts: nativeMapping(state).blocks.map((b) => b.fontAlias),
        blocks: [],
      };
      assert.ok(NativeReceiptSchema.safeParse(mismatch).success);
      assert.equal(
        (
          await fetch(`${url}/jobs/${id}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(mismatch),
          })
        ).status,
        400,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  },
);
test(
  'MCP stdio exposes the same commands and an optional specimen resource',
  { timeout: 20000 },
  async () => {
    const client = new Client({
      name: 'physics-contract-tests',
      version: '1.0.0',
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/cli.js', 'mcp'],
      cwd: process.cwd(),
      env: { ...process.env, DESIGN_MCP_PROFILE: 'full' },
      stderr: 'pipe',
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.ok(tools.tools.some((t) => t.name === 'design_system_relax'));
      const result = await client.callTool({
        name: 'design_registry',
        arguments: {},
      });
      assert.ok(!result.isError);
      const bad = await client.callTool({
        name: 'design_font_inspect',
        arguments: { file: '/missing/physics-font.ttf' },
      });
      assert.equal(bad.isError, true);
      const resource = await client.readResource({
        uri: 'ui://physics-of-design/specimens.html',
      });
      assert.equal(resource.contents[0]!.mimeType, 'text/html;profile=mcp-app');
    } finally {
      await client.close();
    }
  },
);
test('CLI malformed input emits diagnostics only on stderr', () => {
  const result = spawnSync(
    process.execPath,
    ['dist/cli.js', 'font', 'inspect'],
    { input: '{broken', encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(JSON.parse(result.stderr).error);
});

test(
  'balanced selector canonicalizes every prompt sequence, balances slots and rejects incomplete or zero-only transports',
  { timeout: 20000 },
  async () => {
    const dir = await mkdtemp(
      path.join(tmpdir(), 'physics-balanced-contract-'),
    );
    const old = process.env.DESIGN_SEMIF_BIN;
    try {
      const gguf = path.join(dir, 'fixture.gguf');
      await writeFile(gguf, 'balanced contract fixture; not weights');
      const digest = createHash('sha256')
        .update(await readFile(gguf))
        .digest('hex');
      const bin = path.join(dir, 'fixture.mjs');
      await writeFile(
        bin,
        `#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const args=process.argv.slice(2),rows=fs.readFileSync(args[args.indexOf('--input')+1],'utf8').trim().split('\\n').map(JSON.parse);
const mode=process.env.POD_BALANCED_FIXTURE_MODE;
const out=rows.map(row=>{const logits=row.options.map((option,index)=>(option.id==='b'?2:0)+[9,3,1][index]);const max=Math.max(...logits),weights=logits.map(x=>Math.exp(x-max)),total=weights.reduce((a,b)=>a+b,0);return{id:row.id,option_ids:row.options.map(o=>o.id),probabilities:mode==='zero'?[1,0,0]:weights.map(x=>x/total),...(mode==='zero'?{}:{option_logits:logits}),prompt_sha256:createHash('sha256').update(JSON.stringify(row)).digest('hex'),prompt_version:'direct-options-v1',model:{source:'Qwen/Qwen3.5-4B',revision:'${QWEN_REVISION}',dtype:'gguf-quantized',backend:'llamacpp',serving_config:'llamacpp-direct-v1',gguf:{sha256:'${digest}'}},readout:mode==='wrong-readout'?'generated sequence likelihood':'quantized last-position logits restricted to declared answer slots; no generated tokens'}});
fs.writeFileSync(args[args.indexOf('--output')+1],(mode==='partial'?out.slice(1):out).map(x=>JSON.stringify(x)).join('\\n')+'\\n');`,
        { mode: 0o755 },
      );
      process.env.DESIGN_SEMIF_BIN = bin;
      const states = ['a', 'b', 'c'].map((id, index) => {
        const state = hero();
        state.gaps[0] = 24 + index * 4;
        return { id, state };
      });
      const request = {
        candidates: states,
        criterion: 'Contract fixture',
        gguf,
        widths: [390],
        textScales: [1],
        readout: 'balanced' as const,
      };
      const first = await selectChoice(request, fixtureRenderer()),
        second = await selectChoice(
          { ...request, candidates: [states[2]!, states[0]!, states[1]!] },
          fixtureRenderer(),
        );
      assert.equal(first.selected, 'b');
      assert.equal(second.selected, 'b');
      assert.deepEqual(
        first.provenance?.promptHashes,
        second.provenance?.promptHashes,
      );
      assert.equal(first.provenance?.readoutPasses, 3);
      const otherWidths = await selectChoice(
        { ...request, widths: [834] },
        fixtureRenderer(),
      );
      assert.notDeepEqual(
        first.provenance?.promptHashes,
        otherWidths.provenance?.promptHashes,
      );
      process.env.POD_BALANCED_FIXTURE_MODE = 'wrong-readout';
      await assert.rejects(
        selectChoice(request, fixtureRenderer()),
        /quantized last-position/,
      );
      process.env.POD_BALANCED_FIXTURE_MODE = 'partial';
      await assert.rejects(
        selectChoice(request, fixtureRenderer()),
        /exactly one result/,
      );
      process.env.POD_BALANCED_FIXTURE_MODE = 'zero';
      await assert.rejects(
        selectChoice(request, fixtureRenderer()),
        /zero readouts/,
      );
    } finally {
      if (old === undefined) delete process.env.DESIGN_SEMIF_BIN;
      else process.env.DESIGN_SEMIF_BIN = old;
      delete process.env.POD_BALANCED_FIXTURE_MODE;
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('an infeasible base receipt remains rejected even when it has no diagnostics', async () => {
  const renderer = fixtureRenderer();
  let calls = 0;
  const measure = renderer.measure;
  renderer.measure = async (...args) => {
    const result = await measure(...args);
    return ++calls === 1 ? { ...result, feasible: false, issues: [] } : result;
  };
  const result = await selectChoice(
    {
      candidates: [{ id: 'only', state: hero() }],
      criterion: 'Fixture',
      gguf: 'not-used',
      widths: [390],
      textScales: [1],
    },
    renderer,
  );
  assert.equal(result.selected, null);
  assert.equal(result.modelCalled, false);
  assert.equal(result.rejected.length, 1);
});
