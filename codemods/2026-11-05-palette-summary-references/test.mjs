import assert from 'node:assert/strict';
import { Project } from 'ts-morph';
import { transform } from './transform.mjs';
const project = new Project({ useInMemoryFileSystem: true });
const original = `const full = candidate.system.tokens;
const display = candidate.tokenPreview;
// candidate.system.tokens is historical wording.
const literal = "candidate.system.tokens";
`;
const file = project.createSourceFile('consumer.ts', original);
assert.equal(transform({ project }).manualSites.length, 1);
assert.equal(file.getFullText(), original);
console.log(
  'Palette summary scanner flags semantic consumers and preserves source, comments and strings.',
);
