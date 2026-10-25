import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts/context', { recursive: true });
const profiles = [];
for (const profile of ['compact', 'full']) {
  const client = new Client({ name: 'context-budget', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env: { ...process.env, DESIGN_MCP_PROFILE: profile },
      }),
    );
    const tools = await client.listTools(),
      serialized = JSON.stringify(tools);
    await writeFile(`artifacts/context/tools-${profile}.json`, serialized);
    profiles.push({
      profile,
      tools: tools.tools.length,
      jsonBytes: Buffer.byteLength(serialized),
    });
  } finally {
    await client.close();
  }
}
await writeFile(
  'artifacts/context/budget.json',
  JSON.stringify(
    {
      profiles,
      note: 'Bytes are measured wire JSON, not a token estimate. Fetch one command schema only when needed; session references preserve exact values.',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(profiles));
