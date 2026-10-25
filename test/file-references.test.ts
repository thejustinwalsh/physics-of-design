import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  designFileReference,
  resolveDesignFileReferences,
} from '../src/file-references.js';

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'design-file-ref-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function save(directory: string, name: string, value: unknown) {
  const file = path.join(directory, name),
    bytes = Buffer.from(JSON.stringify(value) + '\n');
  await writeFile(file, bytes);
  return designFileReference(file, bytes);
}

test('durable references bind exact bytes, decode pointers and return independent snapshots', () =>
  fixture(async (dir) => {
    const ref = await save(dir, 'result.json', {
      'a/b': { '~value': [{ n: 1 }] },
    });
    const selected = {
      ...ref,
      $designFile: 'result.json',
      pointer: '/a~1b/~0value/0',
    };
    const result = (await resolveDesignFileReferences(
      { a: selected, b: selected },
      dir,
    )) as any;
    assert.deepEqual(result, { a: { n: 1 }, b: { n: 1 } });
    result.a.n = 2;
    assert.equal(result.b.n, 1);
    await writeFile(path.join(dir, 'result.json'), '{"changed":true}\n');
    await assert.rejects(resolveDesignFileReferences(ref), /changed/);
  }));

test('embedded references stay inert and malformed pointers/extra properties fail', () =>
  fixture(async (dir) => {
    const ref = await save(dir, 'result.json', {
      inner: { $designFile: 'not-read.json', sha256: '0'.repeat(64) },
      constructor: 1,
    });
    assert.deepEqual(
      await resolveDesignFileReferences({ ...ref, pointer: '/inner' }),
      { $designFile: 'not-read.json', sha256: '0'.repeat(64) },
    );
    for (const pointer of [
      '/missing',
      '/constructor',
      '/bad~2key',
      'not-a-pointer',
    ])
      await assert.rejects(resolveDesignFileReferences({ ...ref, pointer }));
    await assert.rejects(
      resolveDesignFileReferences({ ...ref, sha256: 'bad' }),
      /requires/,
    );
    await assert.rejects(
      resolveDesignFileReferences({ ...ref, unused: true }),
      /requires/,
    );
  }));

test('file and request budgets cannot be bypassed by sibling references', () =>
  fixture(async (dir) => {
    const refs = [];
    for (let i = 0; i < 9; i++) refs.push(await save(dir, `${i}.json`, { i }));
    assert.equal(
      (
        (await resolveDesignFileReferences(
          Array(20).fill(refs[0]),
        )) as unknown[]
      ).length,
      20,
    );
    await assert.rejects(resolveDesignFileReferences(refs), /eight/);
    const file = path.join(dir, 'huge.json');
    await writeFile(file, Buffer.alloc(16 * 1024 * 1024 + 1));
    await assert.rejects(
      resolveDesignFileReferences({
        $designFile: file,
        sha256: '0'.repeat(64),
      }),
      /16 MiB/,
    );
    const bytes = Buffer.from('"' + 'a'.repeat(11 * 1024 * 1024) + '"');
    const largeRefs = [];
    for (let i = 0; i < 3; i++) {
      const name = path.join(dir, `large-${i}.json`);
      await writeFile(name, bytes);
      largeRefs.push(designFileReference(name, bytes));
    }
    await assert.rejects(resolveDesignFileReferences(largeRefs), /32 MiB/);
  }));

test('invalid UTF8, non-files and excessive input depth fail explicitly', () =>
  fixture(async (dir) => {
    const file = path.join(dir, 'invalid.json'),
      bytes = Buffer.from([0xff]);
    await writeFile(file, bytes);
    await assert.rejects(
      resolveDesignFileReferences(designFileReference(file, bytes)),
    );
    await assert.rejects(
      resolveDesignFileReferences({ $designFile: dir, sha256: '0'.repeat(64) }),
      /regular file/,
    );
    let deep: unknown = null;
    for (let i = 0; i < 66; i++) deep = [deep];
    await assert.rejects(resolveDesignFileReferences(deep), /64 nesting/);
  }));

test('repeated file pointers cannot amplify a small stored file into an oversized request', () =>
  fixture(async (dir) => {
    const ref = await save(dir, 'repeat.json', {
      data: 'x'.repeat(2 * 1024 * 1024),
    });
    await assert.rejects(
      resolveDesignFileReferences(Array(20).fill(ref)),
      /Expanded request exceeds 32 MiB/,
    );
  }));
