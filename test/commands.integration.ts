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
const velaProblem = JSON.parse(
  readFileSync('examples/vela/problem.json', 'utf8'),
);
const velaDesign = JSON.parse(
  readFileSync('examples/vela/design.generated.json', 'utf8'),
);
const motionFixture = {
  spring: { mass: 1, stiffness: 170, damping: 18 },
  coordinate: { unit: 'dp', from: 24, to: 0 },
  sampleCount: 5,
};
const componentFixture = {
  id: 'contract-fixture',
  platform: 'web',
  unit: 'css-px',
  stateRef: 'fixture',
  contentRef: 'fixture',
  viewport: { width: 390, height: 844, textScale: 1 },
  source: ['fixture'],
  availableWidth: 320,
  border: 1,
  padding: { inline: 16, top: 12, bottom: 12 },
  gaps: { leading: 8, trailing: 8 },
  text: {
    id: 'label',
    fontRef: 'fixture',
    minWidth: 100,
    measuredHeight: null,
    measurement: null,
    source: ['fixture'],
  },
  minHitSize: 44,
};
const validationFixture = {
  version: 1,
  id: 'public-contract',
  designIdentity: 'a'.repeat(64),
  scenarios: [
    {
      id: 'phone',
      platform: 'web',
      width: 390,
      height: 844,
      textScale: 1,
      colorScheme: 'light',
      reducedMotion: false,
      contentId: 'original',
      source: 'Contract fixture; no measurement',
    },
  ],
  phases: [
    {
      id: 'geometry',
      purpose: 'Report missing proof',
      requirements: [
        {
          id: 'layout',
          scenario: 'phone',
          tool: 'layout measure',
          inputIdentity: 'b'.repeat(64),
          evidenceKind: 'deterministic',
          rationale: 'Contract fixture',
        },
      ],
    },
  ],
};
const materialFixture = JSON.parse(
  readFileSync('examples/materials/pairings.json', 'utf8'),
);
const inputs: Record<string, unknown> = {
  'validation plan': validationFixture,
  'validation check': { plan: validationFixture, receipts: [], advance: 1 },
  'material candidates': {
    anchor: materialFixture.materials.mineral,
    alternatives: [
      materialFixture.materials['mineral-inset'],
      materialFixture.materials['metal-control'],
    ],
    profile: materialFixture.profiles.continuity,
  },
  'decision run': {
    workflow: {
      ...JSON.parse(readFileSync('examples/workflow/editorial.json', 'utf8'))
        .workflow,
      stages: JSON.parse(
        readFileSync('examples/workflow/editorial.json', 'utf8'),
      ).workflow.stages.map((s: Record<string, unknown>) => ({
        ...s,
        selection: 'mathematical',
      })),
    },
  },
  'wireframe inspect': JSON.parse(
    readFileSync('examples/wireframe/hero.json', 'utf8'),
  ),
  'motion dynamics': {
    position: 0,
    target: 1,
    steps: [{ dtSeconds: 0.1 }, { dtSeconds: 0.1, target: 2 }],
  },
  'motion timeline': {
    motion: motionFixture,
    min: 0,
    max: 24,
    sampleCount: 12,
  },
  'surface probe': {
    surface: { baseColor: [0.2, 0.3, 0.4], roughness: 0.6, metalness: 0 },
  },
  'surface map': { baseColor: [0.2, 0.3, 0.4], roughness: 0.6, metalness: 0 },
  'surface textures': { size: 8, seed: 1 },
  'media analyze': {
    file: 'test/fixtures/material-checker.png',
    provenance: {
      origin: 'original-generated',
      creator: 'Design Theory',
      license: 'MIT',
      licenseEvidence: 'test/fixtures/README.md',
    },
  },
  'media crops': {
    sourceWidth: 600,
    sourceHeight: 400,
    width: 300,
    height: 300,
  },
  'prose analyze': JSON.parse(
    readFileSync('examples/prose/routing.json', 'utf8'),
  ),
  'material pair': {
    first: {
      id: 'paper',
      surface: { baseColor: [0.8, 0.75, 0.6], roughness: 0.9, metalness: 0 },
      composition: 'homogeneous-dielectric',
      provenance: { kind: 'authored', source: 'Original protocol fixture' },
    },
    second: {
      id: 'metal',
      surface: { baseColor: [0.6, 0.3, 0.1], roughness: 0.3, metalness: 1 },
      composition: 'homogeneous-conductor',
      provenance: { kind: 'authored', source: 'Original protocol fixture' },
    },
  },
  'component solve': componentFixture,
  'component inspect': componentFixture,
  'motion proof': motionFixture,
  'energy analyze': {
    program: velaProblem.program,
    assignment: velaDesign.handoff.assignment,
  },
  'energy search': {
    program: velaProblem.program,
    options: { maxEvaluations: 12 },
  },
  'composition solve': { ...velaProblem, options: { maxEvaluations: 12 } },
  'decision handoff': {
    ...velaProblem,
    assignment: velaDesign.handoff.assignment,
  },
  'decision replay': {
    ...velaProblem,
    recipe: velaDesign.handoff,
    scenario: velaProblem.program.scenarios[0].values,
  },
  'color convert': { color: 'oklch(60% 0.2 200)' },
  'palette ramp': { color: '#3d44e8', lightness: [0.3, 0.6, 0.9] },
  'palette analyze': {
    system: {
      tokens: { canvas: '#fff', ink: '#111' },
      roles: [
        {
          id: 'body',
          foreground: 'ink',
          background: 'canvas',
          use: 'text',
          source: ['test'],
        },
      ],
    },
  },
  'palette candidates': {
    system: {
      tokens: { canvas: '#fff', ink: '#aaa' },
      roles: [
        {
          id: 'body',
          foreground: 'ink',
          background: 'canvas',
          use: 'text',
          source: ['test'],
        },
      ],
    },
    editableTokens: ['ink'],
    maxAttempts: 12,
    limit: 2,
  },
  'motion analyze': motionFixture,
  'motion candidates': { motion: motionFixture, maxAttempts: 8, limit: 2 },
  'motion emit': {
    motion: motionFixture,
    channel: 'translateY',
    platform: 'web',
    reducedMotion: false,
  },
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
  'typography inspect': { state, blockId: 'title', render: false },
  'typography axes': { state, blockId: 'title', render: false, limit: 3 },
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
