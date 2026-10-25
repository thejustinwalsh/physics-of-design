import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  BrowserRenderer,
  parseState,
  couple,
  policy,
  proofHtml,
  hash,
  defaultColors,
} from '../dist/index.js';

const directory = 'artifacts/tuning/v1';
await mkdir(directory, { recursive: true });
const renderer = new BrowserRenderer(),
  browser = await chromium.launch({ headless: true });
const content = [
  [
    'hero',
    'Make space for better questions.',
    'A place to collect observations, connect ideas, and discover what deserves your attention.',
  ],
  [
    'hero',
    'Build with a little more intention.',
    'Bring your team together around clear ideas and work that is worth doing.',
  ],
  [
    'editorial',
    'A useful kind of quiet',
    'A thoughtful pause creates room for judgment. The shape of a page can help us notice what matters without demanding that everything speak at once.\n\nGood tools leave their decisions visible and their assumptions open to revision.',
  ],
  [
    'editorial',
    'Designing room for change',
    'An early decision can establish a rhythm without making every later choice inevitable. We can preserve a clear hierarchy while allowing the text to find its own pace.\n\nThat balance depends on the content, the typeface and the space available to read.',
  ],
  [
    'hero',
    'Find a clearer starting point.',
    'Keep the things you care about close, and give new possibilities enough space to take shape.',
  ],
  [
    'editorial',
    'The weight of a small decision',
    'A modest change in spacing can alter the relation between a heading and the words below it. What looks comfortable at one width can feel crowded in another.\n\nThe useful question is what each choice makes possible for the reader.',
  ],
];
const pairs = [];
try {
  for (const [index, [archetype, title, prose]] of content.entries()) {
    const base = parseState(
      JSON.parse(await readFile(`examples/${archetype}.json`, 'utf8')),
    );
    base.blocks[0].text = title;
    base.blocks[1].text = prose;
    const alternate = couple(
      base,
      index % 2 ? -0.7 : 0.7,
      index % 2 ? 0.92 : 1.12,
      policy(),
    ).state;
    alternate.colors = {
      ...defaultColors,
      tokens: {
        canvas: index % 2 ? '#e8eff5' : '#101d32',
        ink: index % 2 ? '#152236' : '#f8f3e8',
        accent: '#22745d',
      },
    };
    const id = `tuning-${index + 1}`,
      candidateStates = index % 2 ? [alternate, base] : [base, alternate];
    const pair = {
      id,
      projectId: id,
      split: index >= 4 ? 'held-out' : 'train',
      archetype,
      criterion:
        archetype === 'hero'
          ? 'Expressive, coherent mobile-to-desktop hero with intact words, a subordinate subtitle and deliberate space.'
          : 'Calm reading rhythm, restrained heading, comfortable prose and deliberate space across widths.',
      candidates: [],
    };
    for (const [side, state] of candidateStates.entries()) {
      const candidate = {
        id: side ? 'right' : 'left',
        state,
        stateHash: hash(state),
        measurements: [],
        images: [],
      };
      for (const width of [390, 834, 1440]) {
        const next = structuredClone(state);
        next.viewport.width = width;
        const m = await renderer.measure(next);
        assert.ok(m.feasible, JSON.stringify(m.issues));
        candidate.measurements.push(m);
        const html = await proofHtml(next, false),
          page = await browser.newPage({ viewport: { width, height: 1100 } });
        await page.setContent(html);
        await page.evaluate(() => document.fonts.ready);
        const image = `${id}-${candidate.id}-${width}.png`;
        await page.screenshot({
          path: `${directory}/${image}`,
          fullPage: true,
        });
        await page.close();
        candidate.images.push(image);
      }
      pair.candidates.push(candidate);
    }
    pairs.push(pair);
  }
  await writeFile(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        version: 1,
        kind: 'synthetic-teacher-preference-batch',
        rights: 'Original text/arrangement CC0; fonts retain OFL',
        assignment:
          'Alternating side assignment fixed before review; candidate identities are not quality labels',
        pairs,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      pairs: pairs.length,
      images: pairs.length * 6,
      directory,
    }),
  );
} finally {
  await renderer.close();
  await browser.close();
}
