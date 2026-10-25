import { readFile, writeFile } from 'node:fs/promises';
import { analyzeProse } from '../../src/prose.js';

const input = JSON.parse(
  await readFile(new URL('./routing.json', import.meta.url), 'utf8'),
);
const before = analyzeProse(input);
const after = analyzeProse({
  ...input,
  sections: input.sections.map((section: { id: string; links: string[] }) =>
    section.id === 'start'
      ? { ...section, links: ['tutorial', 'export'] }
      : section,
  ),
});
const unknown = analyzeProse({
  ...input,
  journeys: input.journeys.map(
    ({
      probability: _probability,
      ...journey
    }: {
      probability: number;
      id: string;
      entry: string;
      target: string;
    }) => journey,
  ),
});
const report = {
  runtime: { node: process.versions.node, icu: process.versions.icu },
  change:
    'One explicit start-to-export link added; section text and authored probabilities are identical.',
  before,
  after,
  unknownProbabilities: unknown.aggregate,
};
await writeFile(
  new URL('./comparison-report.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      before: before.aggregate,
      after: after.aggregate,
      unknown: unknown.aggregate,
    },
    null,
    2,
  ),
);
