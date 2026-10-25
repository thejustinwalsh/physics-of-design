import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  BrowserRenderer,
  selectChoice,
  exportTuning,
  hash,
} from '../dist/index.js';

const source = 'artifacts/tuning/v1';
const readout = process.env.DESIGN_PROBE_READOUT ?? 'single';
if (!['single', 'balanced'].includes(readout))
  throw new Error('Unknown readout');
const directory =
  readout === 'single'
    ? 'artifacts/tuning/probe-tiny-v1'
    : 'artifacts/tuning/probe-balanced-v2';
await mkdir(directory, { recursive: true });
const manifest = JSON.parse(await readFile(`${source}/manifest.json`, 'utf8'));
const renderer = new BrowserRenderer(),
  predictions = [];
try {
  for (const pair of manifest.pairs) {
    const results = [];
    for (const reverse of [false, true]) {
      const candidates = pair.candidates.map((candidate) => ({
        id: candidate.id,
        state: candidate.state,
      }));
      if (reverse) candidates.reverse();
      const result = await selectChoice(
        {
          candidates,
          criterion: pair.criterion,
          gguf: 'artifacts/runtime/Qwen3.5-0.8B-Q4_K_M.gguf',
          profile: 'qwen3.5-0.8b',
          readout,
          maxPromptTokens: 4096,
          widths: [390, 834, 1440],
          textScales: [1],
          auditDirectory: `${directory}/audit`,
        },
        renderer,
      );
      results.push({ reverse, result });
    }
    const prediction = {
      pairId: pair.id,
      projectId: pair.projectId,
      split: pair.split,
      selected: results[0].result.selected,
      reversedSelected: results[1].result.selected,
      orderStable: results[0].result.selected === results[1].result.selected,
      results,
    };
    predictions.push(prediction);
    await writeFile(
      `${directory}/predictions.json`,
      JSON.stringify(
        {
          profile: 'qwen3.5-0.8b',
          readout,
          manifestHash: hash(manifest),
          predictions,
        },
        null,
        2,
      ) + '\n',
    );
  }
  // Teacher files are read only after predictions are frozen. No label is passed
  // to inference, used for tuning, or used to choose a model/configuration.
  const ratings = await Promise.all(
    ['a', 'b'].map(async (side) =>
      JSON.parse(await readFile(`${source}/ratings-${side}.json`, 'utf8')),
    ),
  );
  const dataset = exportTuning({
    manifest,
    ratings,
    renderWidths: [390, 834, 1440],
    evidenceRoot: source,
  });
  await writeFile(
    `${directory}/dataset.json`,
    JSON.stringify(dataset, null, 2) + '\n',
  );
  for (const split of ['train', 'held-out'])
    await writeFile(
      `${directory}/${split}.jsonl`,
      dataset.examples
        .filter((example) => example.split === split)
        .map((example) => JSON.stringify(example))
        .join('\n') + '\n',
    );
  const directional = dataset.examples.map((example) => ({
    pairId: example.pairId,
    split: example.split,
    teacher: example.teacher,
    chosen: example.chosen,
    predicted: predictions.find(
      (prediction) => prediction.pairId === example.pairId,
    ).selected,
  }));
  const report = {
    profile: 'qwen3.5-0.8b',
    readout,
    pairs: predictions.length,
    orderStable: predictions.filter((prediction) => prediction.orderStable)
      .length,
    directionalJudgments: directional.length,
    matches: directional.filter((row) => row.chosen === row.predicted).length,
    bySplit: ['train', 'held-out'].map((split) => ({
      split,
      judgments: directional.filter((row) => row.split === split).length,
      matches: directional.filter(
        (row) => row.split === split && row.chosen === row.predicted,
      ).length,
    })),
    directional,
    limits: [
      'A small confounded synthetic-teacher batch; judgments within a pair are not independent projects.',
      'This measures pipeline behavior and teacher agreement, not human design preference or calibrated quality.',
      'Option-order changes are a diagnostic; no weights, prompts, equations or model selection were tuned using these labels.',
      'Training/held-out JSONL remain separate. No training was performed.',
    ],
  };
  await writeFile(
    `${directory}/report.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await renderer.close();
}
