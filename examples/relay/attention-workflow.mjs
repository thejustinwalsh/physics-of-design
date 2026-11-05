import assert from 'node:assert/strict';
import { hash } from '../../dist/identity.js';
import { summarizeMotion } from '../../dist/motion.js';
import { probeSurface } from '../../dist/surface.js';
import { analyzePalette } from '../../dist/palette.js';
import { overviewVariants } from './app/src/design/attention-policy.mjs';
const ref = (name) => ({ ref: name }),
  op = (name, ...args) => ({ op: name, args });
const brief = (source) => ({ kind: 'brief', source });
const calc = (source) => ({ kind: 'calculated', source });
const lookup = (variable, values) =>
  values
    .slice(0, -1)
    .reduceRight(
      (tail, value, index) =>
        op('if', op('lte', ref(variable), index), value, tail),
      values.at(-1),
    );
const factor = (
  id,
  expression,
  min,
  max,
  scale,
  category,
  source,
  extra = {},
) => ({
  id,
  expression,
  bands: [{ min, max }],
  scale,
  mode: 'preference',
  category,
  provenance: brief(source),
  ...extra,
});
/** Compile exact measured alternatives into the existing staged engine. Renderer
 * facts remain attributed to their retained source, never relabeled current. */
export function compileRelayAttention({
  matrix,
  designIdentity,
  palettes,
  paletteReceipt,
}) {
  assert.equal(matrix.passed, true);
  assert.equal(
    matrix.identity,
    hash({
      source: matrix.sourceIdentity,
      scenarios: matrix.scenarios,
      variants: matrix.variants,
      cells: matrix.cells,
    }),
    'Retained matrix identity mismatch',
  );
  assert.equal(
    paletteReceipt.resultIdentity,
    palettes.resultIdentity,
    'Palette evidence is stale',
  );
  const paletteChecks = Object.keys(palettes.directions)
    .map((direction) => {
      return ['dark', 'light'].map((theme) => {
        const rows = paletteReceipt.receipts.filter(
          (row) =>
            row.direction === direction && row.theme === theme && row.candidate,
        );
        assert.equal(rows.length, 1);
        assert.deepEqual(
          rows[0].candidate.system.tokens,
          palettes.directions[direction][theme],
        );
        const current = analyzePalette({
          system: rows[0].candidate.system,
          contrastLevel: 'AA',
        });
        assert.equal(current.summary.status, 'pass');
        return {
          direction,
          theme,
          measurementRef: current.measurementRef,
          summary: current.summary,
        };
      });
    })
    .flat();
  assert.equal(matrix.sourceStable, true);
  assert.equal(matrix.cells.length, 96);
  assert.equal(matrix.variants.length, 6);
  assert.deepEqual(
    matrix.variants,
    overviewVariants,
    'Historical variant topology differs from the active family',
  );
  const ids = [...new Set(matrix.cells.map((c) => c.scenario))];
  assert.equal(ids.length, 16);
  const scenarios = ids.map((id) => {
    const cells = overviewVariants.map((variant) => {
      const matching = matrix.cells.filter(
        (c) => c.scenario === id && c.variant === variant.id,
      );
      assert.equal(matching.length, 1);
      assert.equal(matching[0].sourceIdentity, matrix.sourceIdentity);
      return matching[0];
    });
    const values = {};
    cells.forEach((cell, index) => {
      const regions = Object.fromEntries(
        cell.analysis.exposure.regions.map((r) => [r.id, r]),
      );
      for (const [quantity, member, key] of [
        ['actionVisible', 'diagnose-checkout', 'visibleFraction'],
        ['actionEnd', 'diagnose-checkout', 'endFraction'],
        ['chartVisible', 'relay-latency-chart', 'visibleFraction'],
        ['fleetVisible', 'relay-overview-summary', 'visibleFraction'],
      ]) {
        const v = regions[member][key];
        assert.ok(Number.isFinite(v));
        values[`${quantity}${index}`] = v;
      }
      const action = cell.rectangles.find(
        (r) => r.id === 'diagnose-checkout',
      ).box;
      values[`targetSize${index}`] = Math.min(action.width, action.height);
    });
    return { id, values };
  });
  const derived = [
    'actionVisible',
    'actionEnd',
    'chartVisible',
    'fleetVisible',
    'targetSize',
  ].map((id) => ({
    id,
    expression: lookup(
      'variant',
      overviewVariants.map((_, index) => ref(`${id}${index}`)),
    ),
    unit:
      id === 'targetSize'
        ? 'CSS px'
        : id === 'actionEnd'
          ? 'fraction of task-frame flow extent'
          : 'fraction of region area inside task frame',
    provenance: calc(
      `Actual ${matrix.sourceIdentity} matrix; frame clipping is not gaze or occlusion`,
    ),
  }));
  const identity = {
    design: designIdentity,
    measurements: matrix.identity,
    rendererSource: matrix.sourceIdentity,
    paletteSystems: hash(palettes.directions),
  };
  const kinetics = [];
  for (const stiffness of [140, 200, 280, 360])
    for (const dampingRatio of [0.65, 0.85, 1, 1.2]) {
      const damping = 2 * dampingRatio * Math.sqrt(stiffness);
      const result = summarizeMotion({
        spring: { mass: 1, stiffness, damping },
        coordinate: { unit: 'normalized', from: 0, to: 1, initialVelocity: 0 },
        durationSeconds: 3,
        sampleCount: 121,
        settling: { positionTolerance: 0.01, speedTolerance: 0.01 },
        bounds: null,
      });
      assert.ok(result.metrics.settling.certifiedBySeconds !== null);
      kinetics.push({
        stiffness,
        dampingRatio,
        damping,
        settling: result.metrics.settling.certifiedBySeconds,
        overshoot: result.metrics.allTimePeakOvershootRatio,
      });
    }
  const stiffnessValues = [140, 200, 280, 360],
    dampingValues = [0.65, 0.85, 1, 1.2],
    roughnessValues = [0.35, 0.55, 0.75, 0.9];
  const motionLookup = (key) =>
    stiffnessValues.reduceRight(
      (tail, stiffness, index) =>
        op(
          'if',
          op('lte', ref('stiffness'), stiffness),
          dampingValues.reduceRight(
            (inner, z, j) =>
              op(
                'if',
                op('lte', ref('dampingRatio'), z),
                kinetics[index * 4 + j][key],
                inner,
              ),
            kinetics[index * 4 + 3][key],
          ),
          tail,
        ),
      kinetics[15][key],
    );
  const surface = roughnessValues.map((roughness) => {
    const result = probeSurface({
      surface: { baseColor: [0.2, 0.2, 0.2], roughness, metalness: 0 },
    });
    return { roughness, result };
  });
  const paletteIds = Object.keys(palettes.directions);
  assert.equal(paletteIds.length, 3);
  const context = {
    artDirection:
      'Expressive operational instrument. Task urgency and readable dense evidence come first; intentional material and motion counterpoint, no repeated teal default. Different palette families remain legitimate.',
    targets:
      'The 65% action-end preference and material/motion bands are authored Relay preferences; geometric visibility and analytic spring/GGX quantities do not establish aesthetics or usability.',
    paletteDescriptions: JSON.stringify(
      Object.fromEntries(
        paletteIds.map((id) => [
          id,
          {
            label: palettes.directions[id].label,
            dark: palettes.directions[id].dark,
            light: palettes.directions[id].light,
          },
        ]),
      ),
    ),
  };
  const program = (id, variables, scenarios, derived, factors) => ({
    version: 1,
    id,
    identity,
    brief: {
      intent: context.artDirection,
      source:
        'examples/relay/DESIGN.md task-priority experiment; synthetic critique, not human preference evidence',
    },
    variables,
    scenarios,
    derived,
    factors,
  });
  const workflow = {
    version: 1,
    id: 'relay-attention-material-motion',
    context,
    budgets: {
      maxEvaluations: 256,
      maxGraphNodes: 256,
      maxSelectorCalls: 3,
      maxReadoutPasses: 3,
    },
    stages: [
      {
        id: 'composition',
        purpose:
          'Choose which actual task/diagnostic region leads, keeping the real primary action initially exposed in every measured scenario',
        selection: 'local-selector',
        contextKeys: ['artDirection', 'targets'],
        consequenceKeys: ['actionEnd', 'chartVisible', 'fleetVisible'],
        question:
          'Choose between measured response-first and diagnosis-first compositions. Both preserve content and expose the action. Consider how much diagnosis versus fleet context belongs in the first view; energy is not beauty.',
        provenance: brief(
          'Recorded Relay task-priority experiment; 96 actual renderer cells',
        ),
        options: {
          method: 'exhaustive',
          maxEvaluations: 6,
          limit: 6,
          retention: 'pareto-diverse',
        },
        program: program(
          'relay-measured-priority',
          [
            {
              id: 'variant',
              label: 'Whole Overview arrangement',
              unit: 'semantic option',
              values: overviewVariants.map((_, i) => i),
              valueAliases: overviewVariants.map((v, i) => ({
                value: i,
                label: v.label,
              })),
            },
          ],
          scenarios,
          derived,
          [
            factor(
              'initial-action-visible',
              ref('actionVisible'),
              1,
              1,
              1,
              'task',
              'Finite measured pool has initially visible alternatives in every declared case; this is a candidate eligibility rule, not a universal accessibility law',
              { mode: 'hard' },
            ),
            factor(
              'target-size',
              ref('targetSize'),
              44,
              1e6,
              44,
              'target',
              'Relay adopted 44 CSS px control contract; not native points or HIG verification',
              { mode: 'hard' },
            ),
            factor(
              'action-priority',
              ref('actionEnd'),
              0,
              0.65,
              0.65,
              'task',
              'Authored first-action endpoint preference',
            ),
            factor(
              'diagnostic-context',
              ref('chartVisible'),
              0.2,
              1,
              1,
              'diagnosis',
              'Authored visible diagnostic fraction target',
            ),
            factor(
              'fleet-context',
              ref('fleetVisible'),
              0.2,
              1,
              1,
              'fleet',
              'Authored visible fleet context target',
            ),
          ],
        ),
      },
      {
        id: 'kinetics',
        purpose:
          'Condition material roughness, light response and a supported retargetable spring on the chosen task arrangement',
        dependsOn: ['composition'],
        bindings: [
          { input: 'layoutVariant', stage: 'composition', variable: 'variant' },
        ],
        selection: 'local-selector',
        contextKeys: ['artDirection', 'targets'],
        consequenceKeys: [
          'settlingSeconds',
          'overshootRatio',
          'lightHalfLifeSeconds',
          'damping',
        ],
        question:
          'Choose a kinetic/material direction among viable analytic alternatives. Diagnosis-first may benefit from restrained overshoot and broad highlights; response-first can support more counterpoint. These are editable brief preferences, not physical laws of beauty.',
        provenance: brief(
          'Relay instrument art direction; shared analytic spring and material parameters',
        ),
        options: {
          method: 'exhaustive',
          maxEvaluations: 192,
          limit: 6,
          retention: 'pareto-diverse',
        },
        program: program(
          'relay-kinetic-counterpoint',
          [
            {
              id: 'stiffness',
              unit: 'normalized stiffness at mass 1, s^-2',
              values: stiffnessValues,
            },
            {
              id: 'dampingRatio',
              unit: 'dimensionless',
              values: dampingValues,
            },
            {
              id: 'roughness',
              unit: 'perceptual material roughness',
              values: roughnessValues,
            },
            {
              id: 'lightResponse',
              unit: 'exponential response per second',
              values: [4, 7, 10],
            },
          ],
          [{ id: 'selected-task', values: { layoutVariant: 0 } }],
          [
            {
              id: 'settlingSeconds',
              expression: motionLookup('settling'),
              unit: 'seconds, conservative energy certificate',
              provenance: calc(
                'summarizeMotion; unit step with .01 position/speed tolerances; not native runtime timing',
              ),
            },
            {
              id: 'overshootRatio',
              expression: motionLookup('overshoot'),
              unit: 'normalized all-time step overshoot',
              provenance: calc('summarizeMotion analytic extrema'),
            },
            {
              id: 'lightHalfLifeSeconds',
              expression: op('div', Math.LN2, ref('lightResponse')),
              unit: 'seconds',
              provenance: calc(
                'Existing DOM light controller exponential response half-life',
              ),
            },
            {
              id: 'layoutRoughnessTarget',
              expression: op(
                'if',
                op('lt', ref('layoutVariant'), 4),
                0.55,
                0.75,
              ),
              unit: 'roughness',
              provenance: brief(
                'Response/diagnosis conditional material target; not an aesthetic law',
              ),
            },
            {
              id: 'damping',
              expression: op(
                'mul',
                2,
                ref('dampingRatio'),
                op('sqrt', ref('stiffness')),
              ),
              unit: 'normalized damping at mass 1, s^-1',
              provenance: calc('c = 2 zeta sqrt(k m), m=1'),
            },
          ],
          [
            factor(
              'bounded-overshoot',
              ref('overshootRatio'),
              0,
              0.12,
              0.12,
              'motion',
              'Authored instrument overshoot ceiling',
              { mode: 'hard' },
            ),
            factor(
              'bounded-settling',
              ref('settlingSeconds'),
              0,
              1.5,
              1.5,
              'motion',
              'Authored analytic certificate ceiling; no platform latency claim',
              { mode: 'hard' },
            ),
            factor(
              'expressive-overshoot',
              ref('overshootRatio'),
              0.01,
              0.06,
              0.06,
              'motion',
              'Sparse intentional motion tension, not minimum movement',
            ),
            factor(
              'kinetic-response',
              ref('settlingSeconds'),
              0.45,
              1.1,
              1.1,
              'motion',
              'Authored response band',
            ),
            factor(
              'material-counterpoint',
              op('sub', ref('roughness'), ref('layoutRoughnessTarget')),
              -0.2,
              0.2,
              1,
              'material',
              'Conditional finish band; actual CSS/GPU are distinct',
            ),
            factor(
              'light-cadence',
              ref('lightHalfLifeSeconds'),
              0.08,
              0.16,
              0.16,
              'light',
              'Authored decorative light cadence',
            ),
          ],
        ),
      },
      {
        id: 'palette',
        purpose:
          'Choose an attributed whole-palette direction conditional on task and kinetic choices',
        dependsOn: ['composition', 'kinetics'],
        bindings: [
          { input: 'layoutVariant', stage: 'composition', variable: 'variant' },
          {
            input: 'selectedRoughness',
            stage: 'kinetics',
            variable: 'roughness',
          },
        ],
        selection: 'local-selector',
        contextKeys: ['artDirection', 'paletteDescriptions'],
        question:
          'Choose a complete graphite/citron, plum/rose or chalk/cobalt direction for this task and finish. All have separately calculated contrast-compatible role systems. Choose art direction only; do not certify accessibility or call tied energies aesthetic evidence.',
        provenance: brief(
          'Three attributed palette families retained after the user rejected teal',
        ),
        options: {
          method: 'exhaustive',
          maxEvaluations: 3,
          limit: 3,
          retention: 'pareto-diverse',
        },
        program: program(
          'relay-palette-direction',
          [
            {
              id: 'palette',
              unit: 'named whole-palette direction',
              values: [0, 1, 2],
              valueAliases: paletteIds.map((id, i) => ({
                value: i,
                label: palettes.directions[id].label,
              })),
            },
          ],
          [
            {
              id: 'selected-task-finish',
              values: { layoutVariant: 0, selectedRoughness: 0.75 },
            },
          ],
          [],
          [
            factor(
              'direction-domain',
              ref('palette'),
              0,
              2,
              1,
              'palette',
              'All three explicit palette systems; deterministic palette analyzer and current compositor remain independent',
              { mode: 'hard' },
            ),
          ],
        ),
      },
    ],
  };
  return {
    workflow,
    metadata: {
      matrixIdentity: matrix.identity,
      rendererSource: matrix.sourceIdentity,
      designIdentity,
      paletteIds,
      variants: overviewVariants,
      analyticKinetics: kinetics,
      paletteChecks,
      surfaceProbes: surface,
      scope:
        'Measured geometry plus authored conditional preferences and analytic physics; no overall beauty score, native timing or human preference evidence',
    },
  };
}
