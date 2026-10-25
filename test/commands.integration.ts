import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  commandSchemas,
  parseState,
  hash,
  measurementKey,
} from '../dist/index.js';
const state = JSON.parse(readFileSync('examples/hero.json', 'utf8'));
const corpus = JSON.parse(readFileSync('research/pilot-corpus.json', 'utf8'));
const trainingState = parseState(state);
const trainingPair = {
  id: 'contract-pair',
  projectId: 'contract-project',
  split: 'train',
  criterion: 'Protocol fixture; no preference evidence',
  candidates: ['left', 'right'].map((id) => ({
    id,
    state: trainingState,
    stateHash: hash(trainingState),
    measurements: [
      {
        inputHash: measurementKey(trainingState),
        feasible: true,
        engine: 'contract-fixture-only',
      },
    ],
    images: [id + '-contract-fixture-not-a-rendered-image'],
  })),
};
const inputs: Record<string, unknown> = {
  registry: {},
  'composition plan': { mode: 'app', width: 834 },
  'platform audit': {
    platform: 'ios',
    viewport: { width: 390, height: 844 },
    safeArea: { top: 44, bottom: 34, left: 0, right: 0 },
    targets: [
      {
        id: 'fixture',
        label: 'Fixture',
        box: { x: 20, y: 60, width: 44, height: 44 },
      },
    ],
    evidence: {
      engine: 'contract-fixture-only',
      receipt: 'not an actual native observation',
    },
  },
  'training export': {
    manifest: {
      version: 1,
      rights: 'Original contract fixture',
      pairs: [trainingPair],
    },
    renderWidths: [trainingState.viewport.width],
    ratings: [
      {
        schemaVersion: 1,
        rater: {
          kind: 'synthetic-astra',
          agent: 'contract-fixture',
          model: 'contract-fixture-not-inference',
          skillCommit: 'contract-fixture',
        },
        ratings: [
          {
            pairId: 'contract-pair',
            choice: 'tie',
            reason: 'Contract fixture, not an observation',
            evidenceImages: [
              'left-contract-fixture-not-a-rendered-image',
              'right-contract-fixture-not-a-rendered-image',
            ],
          },
        ],
      },
    ],
  },
  'color analyze': {
    system: {
      tokens: { canvas: '#ffffff', ink: '#111111', accent: '#2055aa' },
      roles: [
        {
          id: 'body',
          foreground: 'ink',
          background: 'canvas',
          use: 'text',
          source: ['test fixture'],
        },
      ],
    },
  },
  'color candidates': {
    system: {
      tokens: { canvas: '#ffffff', ink: '#111111', accent: '#2055aa' },
    },
    options: { limit: 3 },
  },
  'composition analyze': {
    viewport: { width: 390, height: 844 },
    rectangles: [
      { id: 'title', box: { x: 24, y: 24, width: 342, height: 180 } },
      { id: 'body', box: { x: 24, y: 224, width: 342, height: 200 } },
    ],
    readingOrder: ['title', 'body'],
  },
  'responsive patterns': {},
  'responsive resolve': { state },
  'font inspect': { file: state.blocks[0].font.file, text: 'AVATAR' },
  'text shape': { state, blockId: 'title', probes: false },
  'intervals candidates': { base: 20, min: 1, max: 4 },
  'relations score': { state },
  'layout measure': { state, probes: false },
  'system graph': { state },
  'system perturb': { state, path: '/blocks/0/size', value: 104 },
  'system relax': { state, maxCandidates: 2, widths: [390], textScales: [1] },
  'rhythm analyze': { gaps: [8, 16, 8, 16], windowSize: 3 },
  emit: { state, target: 'stylex' },
  proof: { state, interactive: false },
  'choice select': {
    candidates: [{ id: 'only', state }],
    criterion: 'A bold title.',
    gguf: 'unused-single-choice.gguf',
    widths: [390],
    textScales: [1],
  },
  evaluate: { trials: [], preferences: [] },
  'corpus validate': { records: corpus.records },
  'corpus analyze': {
    records: [corpus.records[0]],
    widths: [390],
    textScales: [1],
    probes: false,
  },
};
async function cli(command: string, input: string, args: string[] = []) {
  const child = spawn(
    process.execPath,
    ['dist/cli.js', ...command.split(' '), ...args],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let out = '',
    err = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (err += c));
  child.stdin.end(input);
  const code = await new Promise((r) => child.on('close', r));
  return { code, out, err };
}
test(
  'every public command executes through CLI and MCP with matching result contracts',
  { timeout: 120000 },
  async () => {
    assert.deepEqual(
      Object.keys(inputs).sort(),
      Object.keys(commandSchemas).sort(),
    );
    const client = new Client({ name: 'all-public-commands', version: '1' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env: { ...process.env, DESIGN_MCP_PROFILE: 'full' },
        stderr: 'pipe',
      }),
    );
    try {
      for (const [command, input] of Object.entries(inputs)) {
        const result = await cli(command, JSON.stringify(input));
        assert.equal(result.code, 0, `${command}: ${result.err}`);
        assert.equal(result.err, '', command);
        const value = JSON.parse(result.out);
        assert.ok(value !== undefined, command);
        const mcp = await client.callTool({
          name: `design_${command.replaceAll(' ', '_')}`,
          arguments: input as Record<string, unknown>,
        });
        assert.ok(!mcp.isError, `${command}: ${JSON.stringify(mcp.content)}`);
        if (command === 'proof')
          assert.ok(typeof mcp._meta?.proofHtml === 'string');
        else if (
          [
            'registry',
            'font inspect',
            'intervals candidates',
            'system graph',
            'system perturb',
            'rhythm analyze',
            'emit',
            'evaluate',
            'corpus validate',
          ].includes(command)
        )
          assert.deepEqual(mcp.structuredContent, value, command);
        else assert.equal(typeof mcp.structuredContent, 'object', command);
      }
    } finally {
      await client.close();
    }
  },
);
test(
  'Unix streams handle files, JSONL, invalid commands and caller errors without polluting stdout',
  { timeout: 20000 },
  async () => {
    for (const command of ['__proto__', 'constructor', 'toString', 'unknown']) {
      const result = await cli(command, '{}');
      assert.equal(result.code, 1);
      assert.equal(result.out, '');
      assert.match(JSON.parse(result.err).error, /unknown command/);
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'physics-cli-'));
    try {
      const input = path.join(dir, 'input.jsonl'),
        output = path.join(dir, 'output.jsonl');
      await writeFile(input, '{"gaps":[8,8]}\n\n{"gaps":[8,16]}\n');
      const result = await cli('rhythm analyze', '', [
        '--input',
        input,
        '--output',
        output,
        '--jsonl',
      ]);
      assert.equal(result.code, 0);
      assert.equal(result.out, '');
      const rows = (await readFile(output, 'utf8'))
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert.equal(rows.length, 2);
      assert.ok(rows[1].entropyBits > rows[0].entropyBits);
      const invalid = await cli(
        'system perturb',
        JSON.stringify({ state, path: '/blocks/0/size', value: 0 }),
      );
      assert.equal(invalid.code, 1);
      assert.equal(invalid.out, '');
      assert.ok(JSON.parse(invalid.err).error);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
