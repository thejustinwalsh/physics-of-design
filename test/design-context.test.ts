import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectDesignContext } from '../src/design-context.js';

test('design context preserves authored bytes, ignores fenced headings and rejects stale identity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'design-context-'));
  try {
    const file = path.join(dir, 'DESIGN.md'),
      content =
        '# A direction\n## Motion\n```md\n## Not a section\n```\n## Color\nAuthored, revisable.\n';
    await writeFile(file, content);
    const r = await inspectDesignContext({
      file,
      includeContent: true,
      requiredSections: ['Motion', 'Color', 'Typography'],
    });
    assert.equal(r.status, 'found');
    assert.deepEqual(
      r.sections.map((s) => s.title),
      ['A direction', 'Motion', 'Color'],
    );
    assert.deepEqual(r.missingSections, ['Typography']);
    assert.equal(r.content, content);
    await assert.rejects(
      inspectDesignContext({ file, expectedSha256: '0'.repeat(64) }),
      /changed/,
    );
    const compact = await inspectDesignContext({ file });
    assert.equal('content' in compact, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('missing and oversized design contexts cannot become invented evidence', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'design-context-'));
  try {
    const file = path.join(dir, 'DESIGN.md');
    assert.equal((await inspectDesignContext({ file })).status, 'missing');
    await writeFile(file, 'x'.repeat(65537));
    await assert.rejects(inspectDesignContext({ file }), /64 KiB/);
    await writeFile(file, Buffer.from([0xff]));
    await assert.rejects(inspectDesignContext({ file }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
