import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
