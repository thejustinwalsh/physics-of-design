import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWireframe, inspectWireframe } from '../src/wireframe.js';
const fixture = () => ({
  version: 1,
  id: 'hero',
  screen: { width: 390, height: 844, unit: 'css-px' },
  variables: {
    gutter: { value: 24, min: 16, max: 48, unit: 'css-px' },
    titleHeight: { value: 120, unit: 'css-px' },
    gap: { value: 20, unit: 'css-px' },
  },
  derived: [
    {
      id: 'contentWidth',
      expression: {
        op: 'sub',
        args: [
          { ref: 'screen.width' },
          { op: 'mul', args: [2, { ref: 'gutter' }] },
        ],
      },
      unit: 'css-px',
    },
  ],
  nodes: [
    {
      id: 'heading',
      label: 'Heading',
      role: 'text',
      evidence: 'proposed',
      box: {
        x: { ref: 'gutter' },
        y: 40,
        width: { ref: 'contentWidth' },
        height: { ref: 'titleHeight' },
      },
      baseline: 40,
    },
    {
      id: 'body',
      label: 'Prose',
      evidence: 'proposed',
      box: {
        x: { ref: 'gutter' },
        y: { op: 'add', args: [40, { ref: 'titleHeight' }, { ref: 'gap' }] },
        width: { ref: 'contentWidth' },
        height: 120,
      },
    },
  ],
  relations: [
    {
      id: 'titleGap',
      kind: 'gap',
      from: 'heading',
      to: 'body',
      axis: 'y',
      band: { min: 16, max: 28 },
      source: 'Authored brief',
    },
  ],
});
test('responsive equations and gap coupling recompute without claiming rendering', () => {
  const f = fixture();
  const a = resolveWireframe(f);
  f.variables.titleHeight.value = 200;
  f.screen.width = 834;
  const b = resolveWireframe(f);
  assert.equal(a.nodes[1]!.box.y, 180);
  assert.equal(b.nodes[1]!.box.y, 260);
  assert.equal(b.nodes[1]!.box.width, 786);
  assert.equal(b.relations[0]!.value, 20);
  assert.equal(b.relations[0]!.status, 'within-authored-band');
});
test('unknown dependencies, hierarchy cycles, duplicate identities and out-of-domain edits fail', () => {
  const f = fixture();
  f.variables.gutter.value = 60;
  assert.throws(() => resolveWireframe(f), /bounds/);
  assert.throws(
    () =>
      resolveWireframe({
        ...fixture(),
        derived: [
          { id: 'contentWidth', expression: { ref: 'absent' }, unit: 'px' },
        ],
      }),
    /dependency/,
  );
  const g = fixture();
  g.nodes[1]!.id = 'heading';
  assert.throws(() => resolveWireframe(g), /Duplicate node/);
  assert.throws(
    () =>
      resolveWireframe({
        ...fixture(),
        nodes: [{ ...fixture().nodes[0], parent: 'heading' }],
      }),
    /Cyclic/,
  );
});
test('measured rectangles remain receipt-bound while proposals move', () => {
  const f = fixture();
  const measured = {
    id: 'photo',
    label: 'Photo',
    evidence: 'renderer-reported',
    box: { x: 24, y: 320, width: 342, height: 200 },
    receipt: {
      renderer: 'Chromium',
      inputIdentity: 'original-input',
      receiptId: 'receipt-1',
    },
  };
  const a = resolveWireframe({ ...f, nodes: [...f.nodes, measured] });
  f.variables.gutter.value = 32;
  const b = resolveWireframe({ ...f, nodes: [...f.nodes, measured] });
  assert.deepEqual(a.nodes[2], b.nodes[2]);
  assert.equal(b.nodes[0]!.box.x, 32);
  assert.throws(() =>
    resolveWireframe({
      ...f,
      nodes: [{ ...measured, box: { ...measured.box, x: { ref: 'gutter' } } }],
    }),
  );
});
test('zero denominators stay unknown and signed overlap is inspectable', () => {
  const f = fixture();
  const r = resolveWireframe({
    ...f,
    nodes: [
      { ...f.nodes[0], box: { x: 0, y: 0, width: 0, height: 100 } },
      { ...f.nodes[1], box: { x: 0, y: 50, width: 10, height: 100 } },
    ],
    relations: [
      ...f.relations,
      {
        id: 'ratio',
        kind: 'ratio',
        from: 'heading',
        to: 'body',
        axis: 'x',
        source: 'brief',
      },
    ],
  });
  assert.equal(r.relations[0]!.value, -50);
  assert.equal(r.relations[1]!.value, null);
  assert.doesNotThrow(() => JSON.stringify(r));
});
test('drawing escapes content and embeds only inert JSON strings', () => {
  const f = fixture();
  f.nodes[0]!.label = '</script><img src=x onerror=alert(1)>';
  const result = inspectWireframe({ wireframe: f });
  assert.ok(result.svg.includes('&lt;/script&gt;'));
  assert.ok(!result.html.includes('label":"</script>'));
  assert.ok(result.html.includes('designTheoryWireframeEdit'));
});
test('invalid arity and excessive expression depth are rejected before evaluation', () => {
  const f = fixture();
  assert.throws(
    () =>
      resolveWireframe({
        ...f,
        derived: [
          {
            id: 'contentWidth',
            expression: { op: 'sub', args: [1] },
            unit: 'px',
          },
        ],
      }),
    /operands/,
  );
  let e: unknown = 1;
  for (let i = 0; i < 100; i++) e = { op: 'abs', args: [e] };
  assert.throws(
    () =>
      resolveWireframe({
        ...f,
        derived: [{ id: 'contentWidth', expression: e, unit: 'px' }],
      }),
    /depth/,
  );
});
test('prototype names cannot resolve as undeclared numeric inputs', () => {
  const f = fixture();
  for (const ref of ['toString', 'constructor', '__proto__'])
    assert.throws(
      () =>
        resolveWireframe({
          ...f,
          nodes: [
            {
              ...f.nodes[0],
              box: { x: { ref }, y: 0, width: 100, height: 100 },
            },
          ],
        }),
      /Unknown wireframe input/,
    );
});

test('drawing budget rejects finite operands whose edges or annotations cannot be rendered safely', () => {
  const f = fixture();
  for (const box of [
    { x: 1e308, y: 0, width: 1e308, height: 10 },
    { x: 9e6, y: 0, width: 2e6, height: 10 },
    { x: 0, y: 1e7, width: 10, height: 1 },
    { x: -1e7, y: 0, width: 10, height: 10 },
  ])
    assert.throws(
      () =>
        inspectWireframe({
          wireframe: { ...f, nodes: [{ ...f.nodes[0], box }], relations: [] },
        }),
      /drawing coordinate.*budget/,
    );
  const safe = inspectWireframe({
    wireframe: {
      ...f,
      nodes: [
        { ...f.nodes[0], box: { x: 9990000, y: 0, width: 100, height: 10 } },
      ],
      relations: [],
    },
  });
  assert.ok(!/NaN|Infinity/.test(safe.svg));
});
