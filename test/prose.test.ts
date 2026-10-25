import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProse, ProseAnalyzeSchema } from '../src/prose.js';

const base = {
  purpose: 'routing',
  audience: 'API users',
  outcome: 'Find the export command',
  sections: [
    { id: 'start', heading: 'Start', text: 'Choose a task.', links: ['guide'] },
    {
      id: 'guide',
      heading: 'Guide',
      text: 'Read the available options.',
      links: ['export'],
    },
    { id: 'export', heading: 'Export', text: 'Save the document.' },
  ],
  journeys: [{ id: 'save', entry: 'start', target: 'export' }],
  costs: { readingWpm: 60, clickSeconds: 2 },
};

test('identical prose with different navigation changes route cost', () => {
  const indirect = analyzeProse(base);
  const direct = analyzeProse({
    ...base,
    sections: base.sections.map((s) =>
      s.id === 'start' ? { ...s, links: ['export'] } : s,
    ),
  });
  assert.deepEqual(indirect.facts, direct.facts);
  assert.deepEqual(indirect.journeys[0]!.path, ['start', 'guide', 'export']);
  assert.deepEqual(direct.journeys[0]!.path, ['start', 'export']);
  assert.equal(
    indirect.journeys[0]!.estimatedSeconds! -
      direct.journeys[0]!.estimatedSeconds!,
    7,
  );
});

test('Dijkstra chooses lower estimated time over fewer clicks when a section is long', () => {
  const result = analyzeProse({
    ...base,
    sections: [
      { id: 'start', heading: 'Start', text: '', links: ['long', 'short'] },
      {
        id: 'long',
        heading: 'Long',
        text: 'word '.repeat(100),
        links: ['export'],
      },
      { id: 'short', heading: 'Short', text: '', links: ['bridge'] },
      { id: 'bridge', heading: 'Bridge', text: '', links: ['export'] },
      { id: 'export', heading: 'Export', text: '' },
    ],
  });
  assert.deepEqual(result.journeys[0]!.path, [
    'start',
    'short',
    'bridge',
    'export',
  ]);
  assert.equal(result.journeys[0]!.estimatedSeconds, 10);
});

test('missing assumptions and partial probabilities stay unknown without inventing uniform demand', () => {
  const result = analyzeProse({
    ...base,
    costs: undefined,
    journeys: [
      { id: 'a', entry: 'start', target: 'export', probability: 0.25 },
      { id: 'b', entry: 'start', target: 'guide' },
    ],
  });
  assert.equal(result.journeys[0]!.estimatedSeconds, null);
  assert.equal(result.journeys[0]!.optimization, 'fewest-links');
  assert.equal(result.aggregate.entropyBits, null);
  assert.equal(result.aggregate.expectedSeconds, null);
  assert.equal(result.aggregate.probabilityStatus, 'unknown');
});

test('explicit two-way equal probabilities have one bit of entropy and a calculable expected cost', () => {
  const result = analyzeProse({
    ...base,
    journeys: [
      { id: 'a', entry: 'start', target: 'export', probability: 0.5 },
      { id: 'b', entry: 'start', target: 'guide', probability: 0.5 },
    ],
  });
  assert.equal(result.aggregate.entropyBits, 1);
  assert.equal(
    result.aggregate.expectedSeconds,
    (result.journeys[0]!.estimatedSeconds! +
      result.journeys[1]!.estimatedSeconds!) /
      2,
  );
});

test('unreachable routes use null and prevent a fabricated finite expectation', () => {
  const sections = base.sections.map((s) => ({ ...s, links: [] }));
  const result = analyzeProse({
    ...base,
    sections,
    journeys: [{ id: 'a', entry: 'start', target: 'export', probability: 1 }],
  });
  assert.equal(result.journeys[0]!.reachable, false);
  assert.equal(result.journeys[0]!.path, null);
  assert.equal(result.journeys[0]!.estimatedSeconds, null);
  assert.equal(result.aggregate.expectedSeconds, null);
  assert.ok(!JSON.stringify(result).includes('Infinity'));
  const zero = analyzeProse({
    ...base,
    sections,
    journeys: [
      { id: 'a', entry: 'start', target: 'export', probability: 0 },
      { id: 'b', entry: 'start', target: 'start', probability: 1 },
    ],
  });
  assert.equal(zero.aggregate.expectedSeconds, 4);
});

test('invalid probabilities, references, locale, duplicates and input bounds are rejected', () => {
  for (const probability of [-1, 1.1, NaN, Infinity, 0.9]) {
    assert.throws(() =>
      analyzeProse({
        ...base,
        journeys: [{ ...base.journeys[0], probability }],
      }),
    );
  }
  assert.throws(() =>
    analyzeProse({
      ...base,
      journeys: [{ id: 'x', entry: 'missing', target: 'export' }],
    }),
  );
  assert.throws(() =>
    analyzeProse({
      ...base,
      sections: [{ ...base.sections[0], links: ['missing'] }],
    }),
  );
  assert.throws(() => analyzeProse({ ...base, locale: 'not_a_locale' }));
  assert.throws(() =>
    analyzeProse({ ...base, sections: [base.sections[0], ...base.sections] }),
  );
  assert.equal(
    ProseAnalyzeSchema.safeParse({ ...base, beauty: true }).success,
    false,
  );
  assert.throws(() =>
    analyzeProse({
      ...base,
      sections: [{ id: 'large', heading: 'Large', text: 'x'.repeat(50001) }],
    }),
  );
});

test('cycles are structural facts; prerequisite order applies to tutorial content only', () => {
  const request = {
    ...base,
    journeys: [],
    sections: [
      {
        id: 'first',
        heading: 'First',
        text: '',
        links: ['second'],
        prerequisites: ['second'],
      },
      {
        id: 'second',
        heading: 'Second',
        text: '',
        links: ['first'],
        prerequisites: ['first'],
      },
    ],
  };
  const reference = analyzeProse({ ...request, purpose: 'reference' });
  assert.deepEqual(reference.structure.navigationCycles, [['first', 'second']]);
  assert.deepEqual(reference.structure.prerequisiteCycles, [
    ['first', 'second'],
  ]);
  assert.equal(reference.warnings.length, 0);
  const tutorial = analyzeProse({ ...request, purpose: 'tutorial' });
  assert.equal(tutorial.warnings.length, 1);
  assert.equal(tutorial.warnings[0]!.code, 'tutorial-prerequisite-order');
});

test('authored vocabulary warnings match word boundaries only and exclude code/quotes', () => {
  const result = analyzeProse({
    purpose: 'reference',
    audience: 'Editors',
    outcome: 'Use consistent task terms',
    vocabulary: [{ canonical: 'start', variants: ['launch'] }],
    sections: [
      {
        id: 'prose',
        heading: 'Task',
        text: 'Launch, launch! A launcher stays a launcher.',
      },
      { id: 'code', heading: 'Code', text: 'launch()', format: 'code' },
      { id: 'quote', heading: 'Source', text: 'launch', format: 'quote' },
    ],
  });
  assert.deepEqual(result.facts[0]!.vocabularyMatches, [
    { canonical: 'start', variant: 'launch', count: 2 },
  ]);
  assert.deepEqual(result.facts[1]!.vocabularyMatches, []);
  assert.deepEqual(result.facts[2]!.vocabularyMatches, []);
  assert.equal(result.facts[0]!.sentences, 2);
});

test('word/action limits exist only when the caller authors a policy', () => {
  const document = {
    purpose: 'how-to',
    audience: 'Writers',
    outcome: 'Publish an essay',
    sections: [
      {
        id: 'essay',
        heading: 'An expansive title',
        text: 'One two three four five six seven eight nine ten.',
      },
    ],
  };
  assert.equal(analyzeProse(document).warnings.length, 0);
  const result = analyzeProse({
    ...document,
    policy: {
      sectionWordLimit: 5,
      sentenceWordLimit: 5,
      headingWordLimit: 2,
      requireActionFor: ['how-to'],
    },
  });
  assert.equal(result.warnings.length, 4);
  assert.ok(result.warnings.every((w) => w.basis === 'authored-policy'));
});

test('positive self-route includes entry reading once and zero-cost cycles terminate', () => {
  const result = analyzeProse({
    ...base,
    costs: { readingWpm: 10000, clickSeconds: 0 },
    sections: [{ id: 'start', heading: 'Start', text: '', links: ['start'] }],
    journeys: [{ id: 'self', entry: 'start', target: 'start' }],
  });
  assert.deepEqual(result.journeys[0]!.path, ['start']);
  assert.equal(result.journeys[0]!.clicks, 0);
  assert.equal(result.journeys[0]!.estimatedSeconds, 0.006);
});
