import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
