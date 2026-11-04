import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { transform } from './transform.mjs';

const directory = await mkdtemp(
  path.join(tmpdir(), 'design-material-migration-'),
);
try {
  const filename = path.join(directory, 'consumer.ts');
  const original = `const a = selected.values.phone['appearance.material.roughnessDifference'];
const pointer = '/values/phone/appearance.material.alphaDifference';
const rawParameter = 'appearance.surface.roughness';
const historicalEngine = 'relational-kernels-v1';
const oldUnitDisplay = candidate.residuals[0].units;
// appearance.material.roughnessDifference in a comment is not rewritten.
`;
  await writeFile(filename, original);
  const project = new Project();
  project.addSourceFileAtPath(filename);
  const result = transform({ project });
  assert.equal(result.manualSites.length, 4);
  assert.equal(await readFile(filename, 'utf8'), original);
  await project.save();
  assert.equal(await readFile(filename, 'utf8'), original);
  const migrated = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  migrated.createSourceFile(
    'consumer.ts',
    `
type Values = Record<string, string | number | null>;
function descriptor(values: Values) {
  const value = values['appearance.material.roughnessDifference.value'];
  if (typeof value !== 'number') return null;
  return value.toFixed(3);
}
function preference(values: Values) {
  const value = values['appearance.material.roughnessDifference.bandResidual'];
  if (typeof value !== 'number') throw new Error('Missing selected residual');
  return value;
}
`,
  );
  assert.equal(migrated.getPreEmitDiagnostics().length, 0);
  console.log(
    'Material-quantity semantic scan preserves disk and migrated nullable consumers typecheck.',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
