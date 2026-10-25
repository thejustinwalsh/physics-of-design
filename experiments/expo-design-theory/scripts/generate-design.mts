import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileRelationalKernels, kernelTextMeasurementIdentity, resolveRelationalKernelOutputs, type RelationalKernelInput } from '../../../src/relational-kernels.js';
import { runDecisionWorkflow } from '../../../src/decision-workflow.js';
import { hash } from '../../../src/identity.js';
import { sourceIdentity } from './source-identity.mjs';
const output = 'artifacts/expo-design-theory';
const source = await sourceIdentity();
const design = createHash('sha256').update(await readFile('experiments/expo-design-theory/DESIGN.md')).digest('hex');
const fontIdentity = createHash('sha256').update(await readFile('assets/fonts/Lato-Regular.ttf')).digest('hex');
const text = 'Pressure drift at the northern inlet needs a second reading before the next shift.';
const measurements: any[] = JSON.parse(await readFile(`${output}/round2-calibration/proof.json`, 'utf8')).scenarios.filter((s: any) => s.browser === 'chromium').map((s: any) => ({ ...s.receipt, resultRef: `${output}/round2-calibration/proof.json#/scenarios/${s.id}` }));
for (const file of await readdir(`${output}/native-cells`)) if (file.endsWith('.json')) measurements.push({ ...JSON.parse(await readFile(`${output}/native-cells/${file}`, 'utf8')), resultRef: `${output}/native-cells/${file}` });
for (const r of measurements) if (r.sourceIdentity !== source) throw Error(`Stale measurement source: ${r.resultRef}`);
const scenarios = measurements.map((r) => ({ id: `${r.platform}-${Math.round(r.viewport.width)}-${r.textScale}`, platform: r.platform, unit: r.platform === 'web' ? 'css-px' : r.platform === 'native-ios' ? 'pt' : 'dp', width: r.viewport.width, height: r.viewport.height, textScale: r.textScale }));
const input: RelationalKernelInput = {
  version: 1, id: 'expo-review', brief: 'Review three field observations with legible text, usable touch targets, and retained list/detail regions on narrow or enlarged layouts.',
  identities: { source, design, content: hash(text) }, scenarios,
  kernels: [{ kind: 'type-row', id: 'row', purpose: 'Choose a measured text size and breathing room for observation rows; content can grow the card beyond its minimum.', source: 'experiments/expo-design-theory/DESIGN.md', selection: 'mathematical', text, fontIdentity, minHitSize: 48, maxRowHeight: 400, preferredRowHeight: 110, paddingBlock: [8, 12],
    candidates: [{ id: 'compact', label: '16px / 1.4 with measured wrapping', fontSize: 16, lineHeight: 1.4, trackingEm: 0 }, { id: 'open', label: '18px / 1.5 with measured wrapping', fontSize: 18, lineHeight: 1.5, trackingEm: 0 }].map((c) => ({ ...c, cells: measurements.map((r, i) => {
      const b = r.boxes[`probe-${c.id}`], scenario = scenarios[i];
      return { scenario: scenario.id, width: b.width, height: b.height, overflowX: Math.max(0, b.scrollWidth - b.clientWidth), overflowY: Math.max(0, b.scrollHeight - b.clientHeight), inputIdentity: kernelTextMeasurementIdentity({ text, fontIdentity, fontSize: c.fontSize, lineHeight: c.lineHeight, trackingEm: 0, width: b.width, scenario }), sourceIdentity: source, sourceInputIdentity: hash(r), resultRef: r.resultRef, runtime: r.runtime, provider: r.provider };
    }) })) },
    { kind: 'regions', id: 'regions', purpose: 'Keep list and detail available, stacking when their declared minimum inline room is unavailable.', source: 'experiments/expo-design-theory/DESIGN.md', selection: 'mathematical', regions: [{ id: 'list', minInline: 160, share: .56 }, { id: 'detail', minInline: 160, share: .44 }], candidates: [{ id: 'paired', label: 'Paired when 720 units fit', gap: 20, inlinePadding: 20, splitMinimum: 720 }, { id: 'quiet', label: 'Wider inset and later split', gap: 24, inlinePadding: 24, splitMinimum: 960 }] },
  ],
};
const compiled = compileRelationalKernels(input), workflow = await runDecisionWorkflow({ workflow: compiled.workflow }), resolved = resolveRelationalKernelOutputs(compiled, workflow);
await mkdir(`${output}/decisions`, { recursive: true });
for (const [name, value] of Object.entries({ input, compiled, workflow, resolved })) await writeFile(`${output}/decisions/${name}.json`, JSON.stringify(value, null, 2));
const generated = { phase: 'resolved-kernels', identity: hash(resolved.values), designIdentity: design, sourceIdentity: source, fontIdentity, inputIdentity: compiled.inputIdentity, compiledIdentity: compiled.identity, workflowIdentity: hash(workflow), scenarios, values: resolved.values };
await writeFile('experiments/expo-design-theory/src/design.generated.json', JSON.stringify(generated, null, 2));
console.log(JSON.stringify({ scenarios: scenarios.map((s) => s.id), resultIdentity: generated.identity, values: generated.values, provenance: 'Actual source-bound browser/native text cells -> ordinary exhaustive numeric workflow -> imported named outputs; no neural benchmark or aesthetic score.' }, null, 2));
