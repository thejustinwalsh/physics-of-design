import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from '../scripts/verification-sources.mjs';

test('palette compact CLI/MCP references retain exact role graphs without repeated context', async () => {
  const before = snapshotVerificationSources(process.cwd());
  const directory = 'artifacts/palette-context';
  await mkdir(directory, { recursive: true });
  const input = {
    system: {
      tokens: { canvas: '#fff', ink: '#101010', accent: '#603ab0' },
      roles: Array.from({ length: 64 }, (_, i) => ({
        id: `body-${i}`,
        foreground: 'ink',
        background: 'canvas',
        use: 'text',
        state: `state-${i}`,
        source: [
          'test:declared role graph; not sixty-four independent accessibility findings',
        ],
      })),
    },
    limit: 6,
  };
  await writeFile(`${directory}/input.json`, JSON.stringify(input) + '\n');
  const run = promisify(execFile);
  const cli = await run(process.execPath, [
    'dist/cli.js',
    'palette',
    'candidates',
    '--input',
    `${directory}/input.json`,
    '--output',
    `${directory}/full.json`,
    '--summary',
  ]);
  const compact = JSON.parse(cli.stdout);
  const fullBytes = await readFile(`${directory}/full.json`, 'utf8');
  const full = JSON.parse(fullBytes);
  assert.equal(
    compact.summary.candidates[0].system.pointer,
    '/candidates/0/system',
  );
  await writeFile(
    `${directory}/analyze-input.json`,
    JSON.stringify({ system: compact.summary.candidates[0].system }) + '\n',
  );
  const replay = await run(process.execPath, [
    'dist/cli.js',
    'palette',
    'analyze',
    '--input',
    `${directory}/analyze-input.json`,
    '--resolve-file-refs',
  ]);
  const cliFacts = JSON.parse(replay.stdout);
  assert.equal(cliFacts.measurementRef, full.candidates[0].measurementRef);
  const client = new Client({ name: 'palette-context-proof', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env: { ...process.env, DESIGN_MCP_PROFILE: 'compact' },
      }),
    );
    assert.equal((await client.listTools()).tools.length, 3);
    const catalog = await client.callTool({
      name: 'design_catalog',
      arguments: { command: 'palette candidates' },
    });
    assert.ok(!catalog.isError);
    const generated = await client.callTool({
      name: 'design_execute',
      arguments: { command: 'palette candidates', input },
    });
    assert.ok(!generated.isError);
    const summary: any = generated.structuredContent!.summary;
    assert.deepEqual(
      summary.candidates[0].tokenPreview,
      compact.summary.candidates[0].tokenPreview,
    );
    const actual = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'palette analyze',
        input: { system: summary.candidates[0].system },
        response: 'full',
      },
    });
    assert.ok(!actual.isError);
    assert.deepEqual(actual.structuredContent, cliFacts);
    const receipt = {
      ...verificationSourceFields(
        before,
        snapshotVerificationSources(process.cwd()),
      ),
      scope:
        'Deterministic palette protocol reuse, not neural calls, token savings, renderer or aesthetic verification.',
      schemaFetches: 1,
      mcpTools: 3,
      roles: input.system.roles.length,
      candidates: full.candidates.length,
      fullResultBytes: Buffer.byteLength(fullBytes),
      cliSummaryBytes: Buffer.byteLength(cli.stdout),
      mcpSummaryBytes: Buffer.byteLength(
        JSON.stringify(generated.structuredContent),
      ),
      cliReferenceRequestBytes: Buffer.byteLength(
        JSON.stringify({ system: compact.summary.candidates[0].system }),
      ),
      mcpReferenceRequestBytes: Buffer.byteLength(
        JSON.stringify({ system: summary.candidates[0].system }),
      ),
      measurementRef: cliFacts.measurementRef,
      exactEquivalent: true,
    };
    assert.equal(receipt.sourceStable, true);
    assert.ok(receipt.cliSummaryBytes < receipt.fullResultBytes / 5);
    assert.ok(receipt.mcpSummaryBytes < receipt.fullResultBytes / 5);
    await writeFile(
      `${directory}/receipt.json`,
      JSON.stringify(receipt, null, 2) + '\n',
    );
  } finally {
    await client.close();
  }
});

test('compact MCP discovers one schema and reuses exact states without repeated input context', async () => {
  const client = new Client({ name: 'compact-context-test', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env: { ...process.env, DESIGN_MCP_PROFILE: 'compact' },
      }),
    );
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 3);
    assert.ok(Buffer.byteLength(JSON.stringify(tools)) < 7000);
    const catalog = await client.callTool({
      name: 'design_catalog',
      arguments: { command: 'system perturb' },
    });
    assert.ok(!catalog.isError);
    assert.ok(catalog.structuredContent?.inputSchema);
    const state = JSON.parse(readFileSync('examples/hero.json', 'utf8'));
    const first = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'system perturb',
        input: { state, path: '/blocks/0/size', value: 104 },
      },
    });
    assert.ok(!first.isError);
    const reference = first.structuredContent!.resultRef;
    const second = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'system perturb',
        input: {
          state: { $designRef: reference, pointer: '/state' },
          path: '/gaps/0',
          value: 40,
        },
        response: 'full',
      },
    });
    assert.ok(!second.isError);
    const result = second.structuredContent as {
      state: { blocks: { size: number }[]; gaps: number[] };
    };
    assert.equal(result.state.blocks[0]!.size, 104);
    assert.equal(result.state.gaps[0], 40);
    const bad = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'system graph',
        input: { state: { $designRef: reference, pointer: '/__proto__' } },
      },
    });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
});

test('geometry analysis uses the same CLI/MCP contract and a retained application program reference', async () => {
  const directory = 'artifacts/layout-calculus';
  await mkdir(directory, { recursive: true });
  const problem = JSON.parse(
    readFileSync('examples/vela/problem.json', 'utf8'),
  );
  const handoff = JSON.parse(
    readFileSync('examples/vela/design.generated.json', 'utf8'),
  ).handoff;
  const geometry = {
    scenario: problem.program.scenarios[0].id,
    outputs: ['paneWidth', 'titleSize', 'cardWidth', 'gap'],
    wrt: ['width', 'textScale'],
    envelope: {
      input: 'width',
      min: 390,
      max: 1440,
      precision: 0.25,
      maxCells: 128,
    },
  };
  const input = {
    program: problem.program,
    assignment: handoff.assignment,
    geometry,
  };
  const inputPath = `${directory}/input.json`,
    outputPath = `${directory}/cli.json`;
  await writeFile(inputPath, JSON.stringify(input) + '\n');
  const cli = await promisify(execFile)(process.execPath, [
    'dist/cli.js',
    'energy',
    'analyze',
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--summary',
  ]);
  assert.equal(cli.stderr, '');
  const expected = JSON.parse(await readFile(outputPath, 'utf8'));
  const client = new Client({ name: 'geometry-context-proof', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env: { ...process.env, DESIGN_MCP_PROFILE: 'compact' },
      }),
    );
    assert.equal((await client.listTools()).tools.length, 3);
    const catalog = await client.callTool({
      name: 'design_catalog',
      arguments: { command: 'energy analyze' },
    });
    assert.ok(!catalog.isError);
    const saved = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'decision handoff',
        input: { ...problem, assignment: handoff.assignment },
      },
    });
    assert.ok(!saved.isError);
    const reference = saved.structuredContent!.resultRef;
    const referencedInput = {
      program: { $designRef: reference, pointer: '/program' },
      assignment: { $designRef: reference, pointer: '/assignment' },
      geometry,
    };
    const summary = await client.callTool({
      name: 'design_execute',
      arguments: { command: 'energy analyze', input: referencedInput },
    });
    assert.ok(!summary.isError);
    assert.ok(summary.structuredContent!.resultRef);
    const full = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'energy analyze',
        input: referencedInput,
        response: 'full',
      },
    });
    assert.ok(!full.isError);
    assert.deepEqual(full.structuredContent!.geometry, expected.geometry);
    await writeFile(
      `${directory}/mcp.json`,
      JSON.stringify(full.structuredContent) + '\n',
    );
    const receipt = {
      scope:
        'Actual headless CLI and compact MCP execution against an existing application handoff. Model calculations only; no browser/native measurements, selector inference or aesthetic validation.',
      programIdentity: expected.programIdentity,
      geometryIdentity: expected.geometry.identity,
      discoveredTools: 3,
      requestedSchemas: 1,
      reference: reference,
      directInputBytes: Buffer.byteLength(JSON.stringify(input)),
      referencedInputBytes: Buffer.byteLength(JSON.stringify(referencedInput)),
      summaryBytes: Buffer.byteLength(
        JSON.stringify(summary.structuredContent),
      ),
      fullResultBytes: Buffer.byteLength(
        JSON.stringify(full.structuredContent),
      ),
      equivalent: true,
      cliSummary: JSON.parse(cli.stdout),
      mcpSummary: summary.structuredContent,
    };
    assert.ok(receipt.referencedInputBytes < receipt.directInputBytes / 10);
    assert.ok(receipt.summaryBytes < receipt.fullResultBytes);
    await writeFile(
      `${directory}/receipt.json`,
      JSON.stringify(receipt, null, 2) + '\n',
    );
  } finally {
    await client.close();
  }
});

test('bento compact CLI/MCP placement references feed the existing wireframe inspector exactly', async () => {
  const before = snapshotVerificationSources(process.cwd());
  const directory = 'artifacts/bento/context';
  await mkdir(directory, { recursive: true });
  const input = {
    width: 1440,
    mode: 'app',
    bento: {
      height: 800,
      unit: 'css-px',
      regions: Array.from({ length: 4 }, (_, i) => ({
        id: `region-${i}`,
        minWidth: 180,
        minHeight: 100,
        basis: 'authored',
        source: ['test:brief minima'],
        areaWeight: [3, 2, 1, 1][i],
        aspect: {
          min: 0.8,
          max: 2.5,
          source: ['test:authored proportion band'],
        },
      })),
    },
  };
  await writeFile(`${directory}/input.json`, JSON.stringify(input));
  const run = promisify(execFile);
  const cli = await run(process.execPath, [
    'dist/cli.js',
    'composition',
    'plan',
    '--input',
    `${directory}/input.json`,
    '--output',
    `${directory}/full.json`,
    '--summary',
  ]);
  const compact = JSON.parse(cli.stdout),
    fullBytes = await readFile(`${directory}/full.json`, 'utf8'),
    full = JSON.parse(fullBytes);
  const placement = compact.summary.bento.candidates[0].placement;
  assert.equal(placement.pointer, '/bento/candidates/0');
  const wireframe = { ...placement, pointer: placement.pointer + '/wireframe' };
  await writeFile(
    `${directory}/inspect-input.json`,
    JSON.stringify({ wireframe, interactive: false }),
  );
  const inspected = await run(process.execPath, [
    'dist/cli.js',
    'wireframe',
    'inspect',
    '--input',
    `${directory}/inspect-input.json`,
    '--resolve-file-refs',
  ]);
  const cliFacts = JSON.parse(inspected.stdout);
  const client = new Client({ name: 'bento-context-proof', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env: { ...process.env, DESIGN_MCP_PROFILE: 'compact' },
      }),
    );
    assert.equal((await client.listTools()).tools.length, 3);
    const schema = await client.callTool({
      name: 'design_catalog',
      arguments: { command: 'composition plan' },
    });
    assert.ok(!schema.isError);
    const generated = await client.callTool({
      name: 'design_execute',
      arguments: { command: 'composition plan', input },
    });
    assert.ok(!generated.isError);
    const summary: any = generated.structuredContent!.summary;
    assert.equal(summary.bento.identity, full.bento.identity);
    const reference = summary.bento.candidates[0].placement;
    const actual = await client.callTool({
      name: 'design_execute',
      arguments: {
        command: 'wireframe inspect',
        input: {
          wireframe: {
            ...reference,
            pointer: reference.pointer + '/wireframe',
          },
          interactive: false,
        },
        response: 'full',
      },
    });
    assert.ok(!actual.isError);
    assert.deepEqual(actual.structuredContent, cliFacts);
    assert.deepEqual(
      cliFacts.nodes.map((node: any) => node.box),
      full.bento.candidates[0].consequences.boxes.map((node: any) => node.box),
    );
    const receipt = {
      ...verificationSourceFields(
        before,
        snapshotVerificationSources(process.cwd()),
      ),
      scope:
        'Exact proposed placement/inspection reuse and transport bytes; not model token savings, actual renderer, preference, or neural selection.',
      schemaFetches: 1,
      mcpTools: 3,
      selectorCalls: 0,
      identity: full.bento.identity,
      candidates: full.bento.candidates.length,
      fullResultBytes: Buffer.byteLength(fullBytes),
      cliSummaryBytes: Buffer.byteLength(cli.stdout),
      mcpSummaryBytes: Buffer.byteLength(
        JSON.stringify(generated.structuredContent),
      ),
      exactEquivalent: true,
    };
    assert.equal(receipt.sourceStable, true);
    assert.ok(receipt.mcpSummaryBytes < receipt.fullResultBytes / 5);
    assert.ok(receipt.cliSummaryBytes < receipt.fullResultBytes / 5);
    await writeFile(
      `${directory}/receipt.json`,
      JSON.stringify(receipt, null, 2) + '\n',
    );
  } finally {
    await client.close();
  }
});
