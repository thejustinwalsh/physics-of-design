import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { evaluateExpression, type Expression } from '../src/math-expression.js';

// Execute the actual app dispatcher in isolation; no copy of its transition logic.
const source = ts.createSourceFile(
  'VelaApp.tsx',
  readFileSync('native/VelaApp.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let dispatcher = '';
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'send')
    dispatcher = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(dispatcher, 'Actual native dispatcher must be found');
const javascript = ts.transpile(dispatcher, { target: ts.ScriptTarget.ES2022 });
function harness(
  when: Expression | undefined,
  proposedElapsed: number,
  edge = true,
) {
  const effects: unknown[] = [];
  const elapsedRef = { current: 9 },
    accumulated = { current: 9 },
    finishing = { current: false },
    startedAt = { current: 0 };
  const context = {
    screen: 'active',
    elapsedRef,
    accumulated,
    finishing,
    startedAt,
    currentElapsed: () => proposedElapsed,
    policy: {
      handoff: {
        machine: {
          states: [
            {
              id: 'active',
              on: edge
                ? [
                    { event: 'FINISH', target: 'complete', when },
                    { event: 'DISCARD', target: 'today', when },
                  ]
                : [],
            },
          ],
        },
      },
    },
    resolved: { values: {} },
    evaluateExpression,
    setElapsed: (value: number) => effects.push(['elapsed', value]),
    setSessionOutcome: (value: string) => effects.push(['outcome', value]),
    setRunning: (value: boolean) => effects.push(['running', value]),
    setEntries: () => effects.push(['entries']),
    setScreen: (value: string) => effects.push(['screen', value]),
  };
  const send = new Function(
    ...Object.keys(context),
    `${javascript}; return send;`,
  )(...Object.values(context)) as (event: string) => boolean;
  return {
    send,
    effects,
    elapsedRef,
    accumulated,
    finishing,
    transitions: context.policy.handoff.machine.states[0]!.on,
  };
}

test('actual native rejected Finish/Discard leaves timer, journal and outcome unchanged', () => {
  for (const elapsed of [0, 12]) {
    for (const edge of [true, false]) {
      const state = harness(0, elapsed, edge);
      assert.equal(state.send('FINISH'), false);
      assert.deepEqual(state.effects, []);
      assert.equal(state.elapsedRef.current, 9);
      assert.equal(state.accumulated.current, 9);
      assert.equal(state.finishing.current, false);
    }
  }
});

test('actual native empty Finish commits Discard only after an enabled edge', () => {
  for (const when of [1, undefined]) {
    const state = harness(when, 0);
    assert.equal(state.send('FINISH'), true);
    assert.deepEqual(state.effects, [
      ['elapsed', 0],
      ['running', false],
      ['outcome', 'discarded-empty'],
      ['screen', 'today'],
    ]);
    assert.equal(state.elapsedRef.current, 0);
    assert.equal(state.accumulated.current, 0);
    assert.equal(state.finishing.current, false);
  }
});

test('actual native guard evaluation failure occurs before side effects', () => {
  const state = harness({ op: 'div', args: [1, 0] }, 12);
  assert.throws(() => state.send('FINISH'), /Nonfinite/);
  assert.deepEqual(state.effects, []);
  assert.equal(state.elapsedRef.current, 9);
  assert.equal(state.accumulated.current, 9);
});

test('actual native empty Finish checks the Discard edge guard rather than the Finish edge guard', () => {
  const allowed = harness(0, 0);
  allowed.transitions[1]!.when = 1;
  assert.equal(allowed.send('FINISH'), true);
  assert.ok(
    allowed.effects.some(
      (effect) =>
        JSON.stringify(effect) === JSON.stringify(['screen', 'today']),
    ),
  );
  const blocked = harness(1, 0);
  blocked.transitions[1]!.when = 0;
  assert.equal(blocked.send('FINISH'), false);
  assert.deepEqual(blocked.effects, []);
});
