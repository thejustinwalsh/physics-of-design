import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('actual CLI and MCP transports stream selector progress while keeping results composable', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'selector-transport-'));
  const client = new Client({ name: 'selector-progress-test', version: '1' });
  try {
    const binary = path.join(dir, 'peer.mjs'),
      gguf = path.join(dir, 'synthetic.gguf'),
      marker = path.join(dir, 'completed');
    await writeFile(gguf, 'Synthetic protocol checkpoint; no inference');
    await writeFile(
      binary,
      `#!/usr/bin/env node
import fs from 'node:fs';import crypto from 'node:crypto';
const arg=k=>process.argv[process.argv.indexOf(k)+1], rows=fs.readFileSync(arg('--input'),'utf8').trim().split('\\n').map(JSON.parse);
const emit=e=>process.stderr.write('@design-selector-progress '+JSON.stringify(e)+'\\n');
emit({phase:'prefill',rowId:rows[0].id,processed:0,total:20});
setTimeout(()=>{emit({phase:'prefill',rowId:rows[0].id,processed:20,total:20});fs.writeFileSync(${JSON.stringify(marker)},'complete');fs.writeFileSync(arg('--output'),rows.map(r=>JSON.stringify({id:r.id,option_ids:r.options.map(o=>o.id),probabilities:r.options.map((_,i)=>i===0?1:0),prompt_sha256:'0'.repeat(64),prompt_version:'direct-options-v1',model:{source:arg('--model'),revision:arg('--revision'),dtype:'gguf-quantized',backend:'llamacpp',serving_config:'llamacpp-direct-v1',gguf:{sha256:crypto.createHash('sha256').update(fs.readFileSync(arg('--gguf'))).digest('hex')}},readout:'quantized last-position logits restricted to declared answer slots; no generated tokens'})).join('\\n')+'\\n');},250);
`,
      { mode: 0o755 },
    );
    const input = {
      workflow: {
        version: 1,
        id: 'transport-test',
        stages: [
          {
            id: 'choice',
            purpose: 'Synthetic transport only',
            selection: 'local-selector',
            provenance: { kind: 'brief', source: 'Synthetic protocol test' },
            program: {
              version: 1,
              id: 'transport-choice',
              brief: {
                intent: 'Synthetic protocol test',
                source: 'Test fixture',
              },
              variables: [{ id: 'x', unit: 'count', values: [1, 2] }],
              scenarios: [{ id: 'base', values: {} }],
              derived: [],
              factors: [
                {
                  id: 'admissible',
                  expression: { ref: 'x' },
                  bands: [{ min: 1, max: 2 }],
                  mode: 'hard',
                  scale: 1,
                  weight: 1,
                  category: 'contract',
                  provenance: { kind: 'brief', source: 'Test fixture' },
                },
              ],
            },
          },
        ],
      },
      selector: {
        gguf,
        profile: 'qwen3.5-4b',
        readout: 'single',
        maxPromptTokens: 512,
        auditDirectory: path.join(dir, 'audit'),
      },
    };
    const env = { ...process.env, DESIGN_SEMIF_BIN: binary };
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', 'mcp'],
        cwd: process.cwd(),
        env,
      }),
    );
    const progress: any[] = [];
    const response = await client.callTool(
      { name: 'design_execute', arguments: { command: 'decision run', input } },
      undefined,
      {
        onprogress: (event) =>
          progress.push({ ...event, beforeComplete: !existsSync(marker) }),
      },
    );
    assert.ok(!response.isError, JSON.stringify(response.content));
    assert.ok(
      progress.some(
        (e) => e.beforeComplete && JSON.parse(e.message).phase === 'prefill',
      ),
    );
    assert.ok(
      progress.every(
        (e, i) => i === 0 || e.progress > progress[i - 1].progress,
      ),
    );
    await rm(marker);
    const child = spawn(process.execPath, ['dist/cli.js', 'decision', 'run'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    child.stdin.end(JSON.stringify(input));
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 0, err);
    assert.equal(JSON.parse(out).status, 'proposed');
    const events = err.trim().split('\n').map(JSON.parse);
    assert.ok(
      events.some(
        (e) =>
          e.type === 'design.progress' &&
          e.phase === 'prefill' &&
          e.processed === 20,
      ),
    );
    assert.equal(JSON.parse(out).statistics.completedReadoutPasses, 1);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
