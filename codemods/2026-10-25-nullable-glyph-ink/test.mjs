import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { transform } from './transform.mjs';
const directory = await mkdtemp(path.join(tmpdir(), 'design-ink-migration-'));
try {
  const filename = path.join(directory, 'consumer.ts');
  const original =
    'const unsafe = glyph.inkBounds.width; const safe = glyph.inkBounds?.width; const wire = "glyph.inkBounds.width";';
  await writeFile(filename, original);
  const project = new Project({ useInMemoryFileSystem: false });
  project.addSourceFileAtPath(filename);
  const dry = transform({ project });
  assert.equal(dry.manualSites.length, 1);
  assert.equal(dry.manualSites[0].expression, 'glyph.inkBounds.width');
  assert.equal(await readFile(filename, 'utf8'), original);
  await project.save();
  assert.equal(await readFile(filename, 'utf8'), original);
  const migrated = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  migrated.createSourceFile(
    'consumer.ts',
    'type Rect={width:number}; function total(glyphs:{inkBounds:Rect|null;advance:number}[]){let pen=0,ink=0;for(const glyph of glyphs){if(glyph.inkBounds!==null)ink+=glyph.inkBounds.width;pen+=glyph.advance;}return{pen,ink};}',
  );
  assert.equal(migrated.getPreEmitDiagnostics().length, 0);
  const glyphs = [
    { inkBounds: { width: 10 }, advance: 12 },
    { inkBounds: null, advance: 4 },
    { inkBounds: { width: 8 }, advance: 9 },
  ];
  let pen = 0,
    ink = 0;
  for (const glyph of glyphs) {
    if (glyph.inkBounds !== null) ink += glyph.inkBounds.width;
    pen += glyph.advance;
  }
  assert.deepEqual({ pen, ink }, { pen: 25, ink: 18 });
  console.log(
    'Nullable-glyph migration AST and advance-preservation checks passed.',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
