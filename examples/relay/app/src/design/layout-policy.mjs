import {
  evaluateExpression,
  differentiateExpression,
  encloseExpression,
  mapExpressionRegimes,
} from '@design-theory/toolkit/layout';

/** @typedef {import('@design-theory/toolkit/layout').Expression} Expression */
/** @param {Exclude<Expression, number | {ref:string}>['op']} operation
 * @param {...Expression} args
 * @returns {Expression} */
const op = (operation, ...args) => ({ op: operation, args });
const ref = (name) => ({ ref: name });

// Authored task-space targets in em, not measured text widths or beauty laws.
// The same expression definitions drive the app and its inspection tools.
export const relayFrameDefinitions = {
  gap: op(
    'mul',
    ref('baseGap'),
    op('add', 1, op('mul', 0.2, op('sub', ref('textScale'), 1))),
  ),
  innerWidth: op('sub', ref('width'), op('mul', 2, ref('padding'))),
  railThreshold: op(
    'add',
    ref('railWidth'),
    ref('gap'),
    op('mul', 2, ref('padding')),
    op('mul', ref('workspaceEm'), ref('fontSize'), ref('textScale')),
  ),
  wide: op('lte', ref('railThreshold'), ref('width')),
  workWidth: op(
    'sub',
    ref('innerWidth'),
    op('mul', ref('wide'), op('add', ref('railWidth'), ref('gap'))),
  ),
  pairThreshold: op(
    'add',
    ref('gap'),
    op('mul', 2, ref('columnEm'), ref('fontSize'), ref('textScale')),
  ),
  phone: op('lt', ref('workWidth'), ref('pairThreshold')),
  columns: op('if', ref('phone'), 1, 2),
};

export function resolveRelayFrame({
  width,
  textScale = 1,
  fontSize = 14,
  railWidth = 220,
  baseGap = 16,
  padding = 12,
  columnEm = 20,
  workspaceEm = 58,
}) {
  const inputs = {
    width,
    textScale,
    fontSize,
    railWidth,
    baseGap,
    padding,
    columnEm,
    workspaceEm,
  };
  if (
    Object.values(inputs).some((value) => !Number.isFinite(value)) ||
    width <= 2 * padding ||
    textScale <= 0 ||
    fontSize <= 0 ||
    railWidth < 0 ||
    baseGap < 0 ||
    padding < 0 ||
    columnEm <= 0 ||
    workspaceEm <= 0
  )
    return {
      status: 'unsupported',
      inputs,
      values: null,
      reason:
        'A positive usable width, text scale and role measures are required',
    };
  const values = { ...inputs };
  for (const [id, expression] of Object.entries(relayFrameDefinitions))
    values[id] = evaluateExpression(expression, values);
  return {
    status: 'predicted',
    inputs,
    values,
    inputKey: JSON.stringify(inputs),
    policy: 'relay-responsive-v1',
    provenance: {
      kind: 'brief',
      source:
        'Relay integration DESIGN.md: preserve usable task regions as typography grows',
    },
    scope:
      'Calculated task-space eligibility. Input coordinates and actual content fit require current browser/native measurements.',
  };
}

export function inspectRelayFrame(
  frame,
  output,
  envelope = { min: 320, max: 1920 },
) {
  if (frame.status !== 'predicted')
    return { status: 'unavailable', reason: frame.reason };
  if (!Object.hasOwn(relayFrameDefinitions, output))
    throw new Error(`Unknown Relay frame quantity ${output}`);
  const expression = ref(output);
  const boxes = Object.fromEntries(
    Object.entries(frame.inputs).map(([key, value]) => [
      key,
      { min: value, max: value },
    ]),
  );
  boxes.width = envelope;
  return {
    status: 'calculated',
    inputKey: frame.inputKey,
    policy: frame.policy,
    output,
    sensitivity: differentiateExpression(
      expression,
      frame.inputs,
      ['width', 'textScale'],
      relayFrameDefinitions,
    ),
    enclosure: encloseExpression(expression, boxes, relayFrameDefinitions),
    regimes: mapExpressionRegimes(
      expression,
      frame.inputs,
      { input: 'width', ...envelope, precision: 0.25, maxCells: 128 },
      relayFrameDefinitions,
    ),
  };
}
