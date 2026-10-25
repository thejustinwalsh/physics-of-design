import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  BrowserRenderer,
  NativeRenderer,
  parseState,
  resolveLayout,
  perturb,
  relax,
} from '../dist/index.js';

const platform = process.argv[2] ?? 'web';
assert.ok(['web', 'native-ios', 'native-android'].includes(platform));
const label = process.argv[3] ?? platform;
assert.match(label, /^[a-z0-9-]+$/);
const renderer =
  platform === 'web' ? new BrowserRenderer() : new NativeRenderer();
const directory = `artifacts/responsive/${label}`;
await mkdir(directory, { recursive: true });
const observations = [];
try {
  for (const archetype of ['hero', 'editorial']) {
    const base = parseState(
      JSON.parse(await readFile(`examples/${archetype}.json`, 'utf8')),
    );
    base.platform = platform;
    for (const width of [320, 390, 507, 834, 1194, 1440]) {
      for (const textScale of [1, 2]) {
        const state = structuredClone(base);
        state.viewport = { width, height: 1194, textScale };
        const measurement = await renderer.measure(state, { spacing: true });
        assert.equal(
          measurement.feasible,
          true,
          JSON.stringify(measurement.issues),
        );
        if (process.env.DESIGN_EXPECT_DEVICE)
          assert.equal(
            measurement.runtime.deviceType,
            process.env.DESIGN_EXPECT_DEVICE,
          );
        if (process.env.DESIGN_EXPECT_FONT_SCALE)
          assert.ok(
            Math.abs(
              measurement.runtime.fontScale -
                Number(process.env.DESIGN_EXPECT_FONT_SCALE),
            ) < 0.02,
          );
        observations.push({ archetype, width, textScale, measurement });
      }
    }
    // Exercise the optional row in actual renderers, then force its large-text
    // fallback. A schema-only test cannot expose Yoga's wrapping behavior.
    const split = structuredClone(base);
    split.responsive.anchors.forEach((anchor) => {
      anchor.pattern = 'split';
    });
    for (const textScale of [1, 2]) {
      split.viewport = { width: 1024, height: 1194, textScale };
      const effectiveScale = Number(process.env.DESIGN_EXPECT_FONT_SCALE ?? 1);
      const resolved = resolveLayout(split, effectiveScale);
      const measurement = await renderer.measure(split);
      assert.equal(
        measurement.feasible,
        true,
        JSON.stringify(measurement.issues),
      );
      const [title, body] = measurement.blocks;
      if (resolved.pattern === 'split') {
        assert.ok(
          body.box.x >= title.box.x + title.box.width,
          JSON.stringify(measurement.blocks),
        );
        assert.ok(Math.abs(body.box.y - title.box.y) < 1);
      } else {
        assert.ok(body.box.y >= title.box.y + title.box.height - 1);
      }
      observations.push({
        archetype,
        width: 1024,
        textScale,
        pattern: resolved.pattern,
        measurement,
      });
    }
    // Preserve the exact requested title while recomputing its neighbors.
    const change = perturb(base, '/blocks/0/size', base.blocks[0].size * 1.15);
    const result = await relax(change.state, renderer, {
      maxCandidates: 3,
      widths: [507, 834, 1194, 1440],
      textScales: [1, 2],
      pinned: ['/blocks/0/size'],
    });
    assert.ok(result.viableIds.length >= 2);
    for (const candidate of result.candidates)
      assert.equal(candidate.state.blocks[0].size, change.state.blocks[0].size);
    await writeFile(
      `${directory}/${archetype}-perturb.json`,
      JSON.stringify({ change, result }, null, 2) + '\n',
    );
  }
  const summary = {
    platform,
    label,
    completedAt: new Date().toISOString(),
    passed: true,
    measurements: observations.length,
    searches: 2,
    runtimes: [
      ...new Map(
        observations.map((o) => [
          JSON.stringify(o.measurement.runtime),
          o.measurement.runtime,
        ]),
      ).values(),
    ],
    scope:
      'Actual renderer; widths are virtual artboards unless they equal the recorded native window. Device rotation and physical hardware are not inferred.',
  };
  await writeFile(
    `${directory}/observations.json`,
    JSON.stringify(observations, null, 2) + '\n',
  );
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(JSON.stringify(summary));
} finally {
  await renderer.close();
}
