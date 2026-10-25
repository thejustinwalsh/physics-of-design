import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startNativeBridge, NativeRenderer } from '../src/native.js';
import { parseState } from '../src/state.js';

test('native font transport uses the actual ephemeral port, snapshots bytes, and binds completion to its lease', async () => {
  const server = await startNativeBridge(0, 'lease-test'),
    address = server.address();
  assert.ok(address && typeof address === 'object');
  const root = `http://127.0.0.1:${address.port}`,
    headers = {
      authorization: 'Bearer lease-test',
      'content-type': 'application/json',
    };
  const dir = await mkdtemp(path.join(tmpdir(), 'physics-font-snapshot-'));
  try {
    const state = parseState(
      JSON.parse(readFileSync('examples/hero.json', 'utf8')),
    );
    state.platform = 'native-ios';
    const original = readFileSync(state.blocks[0]!.font.file);
    state.blocks[0]!.font.file = path.join(dir, 'font.ttf');
    await writeFile(state.blocks[0]!.font.file, original);
    const created = await fetch(`${root}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(state),
    });
    const { id } = (await created.json()) as { id: string };
    const next = await fetch(`${root}/next?platform=native-ios`, { headers });
    const job = (await next.json()) as {
      lease: string;
      fonts: { uri: string }[];
    };
    assert.equal(new URL(job.fonts[0]!.uri).port, String(address.port));
    await writeFile(state.blocks[0]!.font.file, 'mutated after lease');
    const font = await fetch(job.fonts[0]!.uri);
    assert.deepEqual(Buffer.from(await font.arrayBuffer()), original);
    const stale = await fetch(`${root}/jobs/${id}`, {
      method: 'POST',
      headers: { ...headers, 'x-design-lease': 'wrong' },
      body: JSON.stringify({ error: 'stale callback' }),
    });
    assert.equal(stale.status, 400);
    const finish = () =>
      fetch(`${root}/jobs/${id}`, {
        method: 'POST',
        headers: { ...headers, 'x-design-lease': job.lease },
        body: JSON.stringify({ error: 'intentional harness error' }),
      });
    assert.equal((await finish()).status, 200);
    assert.equal((await finish()).status, 400);
    assert.equal(
      (await fetch(`${root}/jobs/${id}`, { method: 'DELETE', headers })).status,
      200,
    );
    assert.equal((await fetch(`${root}/jobs/${id}`, { headers })).status, 404);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
test(
  'native timeout cancels its job rather than leaving work in the queue',
  { timeout: 10000 },
  async () => {
    const server = await startNativeBridge(0, 'timeout-test'),
      address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `http://127.0.0.1:${address.port}`;
    try {
      const renderer = new NativeRenderer(endpoint, 'timeout-test', 20),
        state = parseState(
          JSON.parse(readFileSync('examples/hero.json', 'utf8')),
        );
      state.platform = 'native-android';
      await assert.rejects(renderer.measure(state), /No native receipt/);
      const health = (await (
        await fetch(`${endpoint}/health`, {
          headers: { authorization: 'Bearer timeout-test' },
        })
      ).json()) as { pending: number };
      assert.equal(health.pending, 0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);
