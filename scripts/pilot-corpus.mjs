import { readFile, writeFile } from 'node:fs/promises';
const records = [];
for (const archetype of ['hero', 'editorial']) {
  const state = JSON.parse(
    await readFile(`examples/${archetype}.json`, 'utf8'),
  );
  const base = {
    id: `pilot-${archetype}`,
    projectId: `pilot-${archetype}`,
    designer: 'Physics of Design project',
    source: `examples/${archetype}.json`,
    attribution:
      'Original specimen text and arrangement created for this project; bundled fonts retain their OFL licenses.',
    year: 2026,
    genre: archetype === 'hero' ? 'marketing' : 'editorial',
    audience: 'general English readers',
    stratum: 'original-pilot',
    split: 'calibration',
    rights: {
      basis: 'original',
      license:
        'CC0-1.0 for specimen text and arrangement; fonts separately OFL-1.1',
      evidence: 'research/pilot-rights.md',
    },
    state,
  };
  records.push(base);
  for (const scale of [0.85, 1.3]) {
    const altered = structuredClone(base);
    altered.id += `-${scale}`;
    altered.stratum = 'controlled-perturbation';
    altered.controlOf = base.id;
    altered.state.blocks[0].size *= scale;
    records.push(altered);
  }
}
await writeFile(
  'research/pilot-corpus.json',
  JSON.stringify(
    { records, widths: [360, 767, 1280], textScales: [1, 2], probes: true },
    null,
    2,
  ) + '\n',
);
