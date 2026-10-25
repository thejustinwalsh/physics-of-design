import { readFile, writeFile } from 'node:fs/promises';
const widths = [360, 390, 834, 1024, 1440];
for (const archetype of ['hero', 'editorial']) {
  const path = `examples/${archetype}.json`,
    state = JSON.parse(await readFile(path, 'utf8'));
  const hero = archetype === 'hero',
    titleSizes = hero ? [52, 56, 80, 88, 96] : [36, 38, 44, 44, 44],
    textSizes = hero ? [22, 22, 24, 24, 24] : [21, 21, 21, 21, 21];
  const padding = hero ? [24, 24, 40, 48, 64] : [20, 24, 40, 48, 48],
    gaps = hero ? [20, 22, 28, 28, 32] : [20, 22, 24, 24, 24];
  state.responsive = {
    source: 'astra-responsive-review-2026-10-24',
    anchors: widths.map((width, i) => ({
      width,
      padding: padding[i],
      gapScale: gaps[i] / state.gaps[0],
      contentMaxWidth: hero ? 1280 : 816,
      pattern: 'stack',
      blocks: {
        [state.blocks[0].id]: {
          sizeScale: titleSizes[i] / state.blocks[0].size,
          leadingDelta:
            (hero ? (i < 2 ? 1.08 : 1.02) : 1.12) - state.blocks[0].leading,
          trackingDelta:
            (hero ? (i < 2 ? -0.015 : -0.024) : -0.01) -
            state.blocks[0].trackingEm,
          measureScale: hero
            ? 1000 / state.blocks[0].measure
            : 720 / state.blocks[0].measure,
        },
        [state.blocks[1].id]: {
          sizeScale: textSizes[i] / state.blocks[1].size,
          leadingDelta: 0,
          trackingDelta: 0,
          measureScale: 1,
        },
      },
    })),
    split: { titleMinWidth: 240, textMinWidth: 360, gap: 40 },
  };
  await writeFile(path, JSON.stringify(state, null, 2) + '\n');
}
