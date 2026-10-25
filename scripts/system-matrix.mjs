import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { nativeSourceIdentity } from './native-source-identity.mjs';
import {
  BrowserRenderer,
  NativeRenderer,
  parseState,
  scoreRelations,
  perturb,
  policy,
  relax,
  hash,
} from '../dist/index.js';
const platform = process.argv[2] ?? 'web';
const implementationIdentity =
  platform === 'web' ? null : await nativeSourceIdentity();
const renderer =
  platform === 'web' ? new BrowserRenderer() : new NativeRenderer();
if (platform !== 'web') {
  const deadline = Date.now() + 45000;
  while (true) {
    const response = await fetch(
      `${process.env.DESIGN_NATIVE_URL ?? 'http://127.0.0.1:4319'}/health`,
      {
        headers: { authorization: `Bearer ${process.env.DESIGN_NATIVE_TOKEN}` },
      },
    );
    const health = await response.json();
    if (health.clients?.some((c) => c.platform === platform)) break;
    if (Date.now() > deadline) throw new Error(`No ready ${platform} harness`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const dir = `artifacts/system/${platform}`;
await mkdir(dir, { recursive: true });
const texts = [
  [
    'en',
    'Make room for a different kind of thinking.',
    'Build useful things with patience, clarity, and enough room to change your mind.',
  ],
  ['en', 'A', 'A small beginning can open an unexpectedly large conversation.'],
  [
    'de',
    'Außergewöhnliche Gedanken brauchen Freiraum',
    'Längere Wörter und andere Satzrhythmen verändern den Umbruch, ohne den Inhalt zu verkürzen.',
  ],
  [
    'fr',
    'Une nouvelle manière de regarder le monde',
    'Découvrez des idées étonnantes, des détails précis et une façon plus calme de créer ensemble.',
  ],
  [
    'en',
    'AVATAR To office: ffi fl fi',
    'Kerning, ligatures, commas, 0123456789, and repeated shapes all affect actual text geometry.',
  ],
  [
    'en',
    'A first line\nA second line',
    'One paragraph.\n\nA second paragraph keeps its explicit break and punctuation.',
  ],
  [
    'en',
    'Supercalifragilisticexpialidocious',
    'averylongunspacedwordwithmanylettersandnobreakingopportunities exercises the renderer’s emergency line breaks.',
  ],
  [
    'en',
    'Cafe\u0301 — déjà vu',
    'Naïve façades, coöperation, résumé, and mathematical notation: 1 + 2 = 3.',
  ],
];
const widths = [280, 320, 390, 767, 1280],
  scales = [1, 1.3, 2];
let count = 0;
const failures = [],
  recoveries = [],
  runtimes = new Map();
await writeFile(`${dir}/observations.jsonl`, '');
try {
  for (const archetype of ['hero', 'editorial']) {
    const base = parseState(
      JSON.parse(await readFile(`examples/${archetype}.json`, 'utf8')),
    );
    base.platform = platform;
    base.padding = 24;
    for (const [contentIndex, [language, title, prose]] of texts.entries())
      for (const width of widths)
        for (const textScale of scales) {
          const state = structuredClone(base);
          state.blocks[0].text = title;
          state.blocks[1].text = prose;
          state.blocks.forEach((b) => (b.language = language));
          state.viewport = { width, height: 900, textScale };
          const id = `${archetype}-${contentIndex}-${width}-${textScale}`,
            start = performance.now();
          let observation;
          try {
            const m = await renderer.measure(state, { spacing: true });
            if (implementationIdentity)
              assert.equal(
                m.runtime.implementationIdentity,
                implementationIdentity,
                'stale native measurement implementation',
              );
            runtimes.set(hash(m.runtime), m.runtime);
            let checked = m;
            if (!m.feasible) {
              // Input feasibility is not guaranteed. The product contract is to
              // expose the failure and return only remeasured viable choices.
              const recovery = await relax(state, renderer, {
                maxCandidates: 9,
                widths: [...new Set([width, 320, 390, 1280])],
                textScales: [1, 1.3, 2],
              });
              const viable = recovery.candidates.filter(
                (candidate) => candidate.viable,
              );
              assert.ok(
                viable.length >= 2,
                `No multiple viable repairs: ${JSON.stringify(m.issues)}`,
              );
              assert.ok(
                viable.every((candidate) =>
                  [candidate.measurement, ...candidate.responsive].every(
                    (receipt) => receipt.feasible,
                  ),
                ),
              );
              checked = viable[0].measurement;
              await writeFile(
                `${dir}/${id}-recovery.json`,
                JSON.stringify({ input: m, recovery }, null, 2) + '\n',
              );
              recoveries.push({
                id,
                inputIssues: m.issues,
                viableIds: recovery.viableIds,
              });
            }
            assert.equal(checked.blocks.length, state.blocks.length);
            for (const [i, b] of checked.blocks.entries()) {
              assert.equal(
                b.lines
                  .map((l) => l.text)
                  .join('')
                  .replace(/\s/gu, ''),
                state.blocks[i].text.replace(/\s/gu, ''),
                'renderer preserves all non-whitespace content',
              );
              assert.ok(b.lines.length > 0);
              assert.ok(
                b.box.x >= -0.75 && b.box.x + b.box.width <= width + 0.75,
                JSON.stringify({ id, box: b.box, viewport: width }),
              );
              assert.ok(
                b.lines.every((l) =>
                  [l.x, l.y, l.width, l.height].every(Number.isFinite),
                ),
              );
            }
            const factors = scoreRelations(state, m, policy());
            assert.ok(
              Object.values(factors.objectives).every(
                (n) => Number.isFinite(n) && n >= 0 && n <= 1,
              ),
            );
            observation = {
              id,
              archetype,
              contentIndex,
              width,
              textScale,
              measurement: m,
              recovery: m.feasible ? null : `${id}-recovery.json`,
              factors: factors.factors,
            };
          } catch (e) {
            const failure = { id, error: String(e) };
            failures.push(failure);
            observation = { ...failure, state };
          }
          await appendFile(
            `${dir}/observations.jsonl`,
            JSON.stringify({
              ...observation,
              latencyMs: performance.now() - start,
            }) + '\n',
          );
          count++;
          if (count % 30 === 0)
            console.log(
              JSON.stringify({ platform, count, failures: failures.length }),
            );
        }
    const changed = perturb(base, '/blocks/0/size', base.blocks[0].size * 1.3);
    for (const prior of ['smooth', 'musical']) {
      const result = await relax(changed.state, renderer, {
        maxCandidates: 9,
        widths: [320, 390, 767, 1280],
        textScales: [1, 1.3, 2],
        pinned: ['/blocks/0/size'],
        policy: policy({ prior }),
      });
      await writeFile(
        `${dir}/${archetype}-${prior}.json`,
        JSON.stringify({ perturbation: changed, result }, null, 2) + '\n',
      );
      if (result.viableIds.length < 2)
        failures.push({
          id: `${archetype}-${prior}-relax`,
          error: 'fewer than two viable alternatives',
        });
      for (const c of result.candidates) {
        assert.equal(c.state.blocks[0].size, changed.state.blocks[0].size);
        assert.equal(
          c.viable,
          [c.measurement, ...c.responsive].every((m) => m.feasible),
        );
      }
    }
  }
  const summary = {
    platform,
    contentCases: texts.length,
    archetypes: 2,
    widths,
    textScales: scales,
    measurements: count,
    searches: 4,
    searchCandidateBudget: 9,
    runtimes: [...runtimes.values()],
    implementationIdentity,
    sourceStable:
      implementationIdentity === null ||
      implementationIdentity === (await nativeSourceIdentity()),
    rawInfeasibleInputs: recoveries.length,
    recoveries,
    failures,
  };
  await writeFile(
    `${dir}/summary.json`,
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(JSON.stringify(summary));
  if (failures.length || !summary.sourceStable) process.exitCode = 1;
} finally {
  await renderer.close();
}
