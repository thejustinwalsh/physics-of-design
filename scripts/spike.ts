import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseState } from '../dist/state.js';
import { BrowserRenderer } from '../dist/measurement.js';
import { NativeRenderer } from '../dist/native.js';
import { perturb } from '../dist/graph.js';
import { relax } from '../dist/search.js';
import { policy } from '../dist/factors.js';
import { execute } from '../dist/commands.js';

const native = process.argv.includes('--native');
const renderer = native ? new NativeRenderer() : new BrowserRenderer();
const root = path.resolve('artifacts/spike');
await mkdir(root, { recursive: true });
const summary: unknown[] = [];
try {
  for (const name of ['hero', 'editorial']) {
    const state = parseState(
      JSON.parse(await readFile(`examples/${name}.json`, 'utf8')),
    );
    if (native) state.platform = 'native-ios';
    const folder = path.join(root, `${name}-${state.platform}`);
    await mkdir(folder, { recursive: true });
    process.stderr.write(`Measuring ${name} on ${state.platform}\n`);
    const before = await renderer.measure(state, {
      probes: !native,
      spacing: true,
    });
    const change = perturb(
      state,
      '/blocks/0/size',
      state.blocks[0]!.size * 1.3,
    );
    const after = await renderer.measure(change.state, {
      probes: !native,
      spacing: true,
    });
    const settings = {
      maxCandidates: 3,
      widths: native ? [390, 767] : [360, 767, 1280],
      textScales: [1, 2],
      pinned: ['/blocks/0/size'],
    };
    const smooth = await relax(change.state, renderer, {
      ...settings,
      policy: policy({ prior: 'smooth' }),
    });
    // Same generator, renderer, budgets and objectives. Only the hierarchy prior differs.
    const musical = await relax(change.state, renderer, {
      ...settings,
      policy: policy({ prior: 'musical' }),
    });
    const chosen =
      smooth.candidates.find((c) => c.viable) ?? smooth.candidates[0]!;
    await execute('proof', {
      state: chosen.state,
      directory: folder,
      interactive: true,
    });
    const result = {
      before,
      perturbation: change,
      after,
      smooth,
      musical,
      aestheticPreference: null,
      selectorExecuted: false,
    };
    await writeFile(
      path.join(folder, 'evidence.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    const brief = {
      name,
      platform: state.platform,
      engine: before.engine,
      runtime: before.runtime,
      headingLines: {
        before: before.blocks[0]!.lines.length,
        after: after.blocks[0]!.lines.length,
        relaxed: chosen.measurement.blocks[0]!.lines.length,
      },
      coupled: {
        before: state.blocks[0],
        after: chosen.state.blocks[0],
        gapBefore: state.gaps,
        gapAfter: chosen.state.gaps,
      },
      smoothViable: smooth.viableIds.length,
      musicalViable: musical.viableIds.length,
      measuredConfigurations:
        2 + smooth.candidates.length + musical.candidates.length,
      failures: smooth.candidates
        .flatMap((c) => [c.measurement, ...c.responsive])
        .flatMap((m) =>
          m.issues
            .filter((i) => i.severity === 'hard')
            .map((i) => ({ hash: m.inputHash, issue: i })),
        ),
      proof: path.join(folder, 'specimen.html'),
    };
    summary.push(brief);
    process.stderr.write(
      `${name}: ${smooth.viableIds.length} smooth / ${musical.viableIds.length} musical viable alternatives\n`,
    );
  }
  await writeFile(
    path.join(root, `summary-${native ? 'native' : 'web'}.json`),
    JSON.stringify(
      {
        summary,
        aestheticValidation: false,
        modelRun: false,
        musicalPrior: 'undetermined; smooth remains default',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await renderer.close();
}
