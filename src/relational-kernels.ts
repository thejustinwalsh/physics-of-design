/** Small semantic compilers. They reuse the ordinary numeric workflow; they never render or select. */
import { z } from 'zod';
import { hash } from './identity.js';
import {
  compileEnergy,
  evaluateExpression,
  type Expression,
  type EnergyProgram,
} from './energy.js';
import { DecisionWorkflowSchema } from './decision-workflow.js';
import { PaletteAnalyzeSchema, analyzePalette } from './palette.js';
import {
  MaterialPairSchema,
  analyzeMaterialPair,
} from './material-relations.js';
import { MotionAnalyzeSchema, analyzeMotion } from './motion.js';
const Id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  Digest = z.string().regex(/^[a-f0-9]{64}$/),
  N = z.number().finite(),
  Length = N.min(0).max(10000);
const Scenario = z
  .object({
    id: Id,
    platform: z.enum(['web', 'native-ios', 'native-android']),
    unit: z.enum(['css-px', 'pt', 'dp']),
    width: Length.positive(),
    height: Length.positive(),
    textScale: N.min(0.5).max(5),
  })
  .strict();
const Identity = z
  .object({ design: Digest, source: Digest, content: Digest })
  .strict();
const Cell = z
  .object({
    scenario: Id,
    width: Length.positive(),
    height: Length.positive(),
    overflowX: Length,
    overflowY: Length,
    inputIdentity: Digest,
    sourceIdentity: Digest,
    sourceInputIdentity: Digest,
    resultRef: z.string().min(1).max(2048),
    runtime: z.string().min(1).max(200),
    provider: z.enum(['browser', 'native-ios', 'native-android']),
  })
  .strict();
const Common = {
  id: Id,
  purpose: z.string().min(1).max(1000),
  source: z.string().min(1).max(1000),
  selection: z.enum(['mathematical', 'local-selector']).default('mathematical'),
};
const Row = z
  .object({
    ...Common,
    kind: z.literal('type-row'),
    text: z.string().min(1).max(2000),
    fontIdentity: Digest,
    minHitSize: Length.positive(),
    maxRowHeight: Length.positive(),
    preferredRowHeight: Length.positive(),
    paddingBlock: z.array(Length).min(1).max(8),
    candidates: z
      .array(
        z
          .object({
            id: Id,
            label: z.string().min(1).max(120),
            fontSize: Length.positive(),
            lineHeight: N.min(0.8).max(3),
            trackingEm: N.min(-0.1).max(0.2),
            cells: z.array(Cell).min(1).max(24),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();
const Regions = z
  .object({
    ...Common,
    kind: z.literal('regions'),
    regions: z
      .array(
        z
          .object({
            id: Id,
            minInline: Length.positive(),
            share: N.positive().max(100),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    roleLink: z.object({ kernel: Id, region: Id }).strict().optional(),
    candidates: z
      .array(
        z
          .object({
            id: Id,
            label: z.string().min(1).max(120),
            gap: Length,
            inlinePadding: Length,
            splitMinimum: Length.positive(),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();
const Appearance = z
  .object({
    ...Common,
    kind: z.literal('appearance'),
    candidates: z
      .array(
        z
          .object({
            id: Id,
            label: z.string().min(1).max(120),
            palette: PaletteAnalyzeSchema,
            material: MaterialPairSchema,
            motion: MotionAnalyzeSchema,
            preference: N.min(0).max(100),
            nativeFinish: z.literal('static'),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();
export const RelationalKernelCompileSchema = z
  .object({
    version: z.literal(1),
    id: Id,
    brief: z.string().min(1).max(4000),
    identities: Identity,
    scenarios: z.array(Scenario).min(1).max(24),
    kernels: z
      .array(z.discriminatedUnion('kind', [Row, Regions, Appearance]))
      .min(1)
      .max(8),
  })
  .strict();
export type RelationalKernelInput = z.input<
  typeof RelationalKernelCompileSchema
>;
export const RelationalKernelResolveSchema = z
  .object({
    input: RelationalKernelCompileSchema,
    compilationIdentity: Digest,
    result: z
      .object({
        stages: z.record(
          z.string(),
          z
            .object({
              status: z.string(),
              assignment: z.record(z.string(), N).nullable(),
              evidence: z.unknown(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .strict();
type Request = z.infer<typeof RelationalKernelCompileSchema>;
type Kernel = Request['kernels'][number];
const ref = (name: string): Expression => ({ ref: name });
const op = (
  name: Exclude<Expression, number | { ref: string }>['op'],
  ...args: Expression[]
): Expression => ({ op: name, args });
const sum = (xs: Expression[]): Expression =>
  xs.length === 1 ? xs[0]! : op('add', ...xs);
const lookup = (key: string, values: number[]): Expression =>
  values
    .slice(0, -1)
    .reduceRight<Expression>(
      (tail, value, i) =>
        op('if', op('lt', op('abs', op('sub', ref(key), i)), 0.5), value, tail),
      values.at(-1)!,
    );
const unique = (ids: string[], label: string) => {
  if (new Set(ids).size !== ids.length) throw Error(`Duplicate ${label}`);
};
/** Identity for adapted actual text observations; sourceInputIdentity separately retains the renderer's own input hash. */
export function kernelTextMeasurementIdentity(input: {
  text: string;
  fontIdentity: string;
  fontSize: number;
  lineHeight: number;
  trackingEm: number;
  width: number;
  scenario: Request['scenarios'][number];
}) {
  return hash({ engine: 'kernel-text-cell-v1', ...input });
}
interface Output {
  stage: string;
  name: string;
  unit: string;
  expression: Expression | null;
  candidateValues?: Array<string | number>;
}
export function compileRelationalKernels(input: RelationalKernelInput) {
  const r = RelationalKernelCompileSchema.parse(input);
  unique(
    r.kernels.map((k) => k.id),
    'kernel IDs',
  );
  unique(
    r.scenarios.map((s) => s.id),
    'scenario IDs',
  );
  for (const s of r.scenarios)
    if (
      (s.platform === 'web' && s.unit !== 'css-px') ||
      (s.platform === 'native-ios' && s.unit !== 'pt') ||
      (s.platform === 'native-android' && s.unit !== 'dp')
    )
      throw Error(`Platform/unit mismatch for ${s.id}`);
  const outputs: Output[] = [],
    evidence: Record<string, unknown> = {},
    obligations: Array<{
      kernel: string;
      scenario: string;
      platform: string;
      checks: string[];
    }> = [];
  const stages = r.kernels.map((k) => {
    unique(
      k.candidates.map((c) => c.id),
      `${k.id} candidate IDs`,
    );
    const provenance = { kind: 'brief' as const, source: k.source };
    const program: EnergyProgram = {
      version: 1,
      id: k.id,
      brief: { intent: k.purpose, source: k.source },
      identity: { ...r.identities, kernel: hash(k), brief: hash(r.brief) },
      variables: [
        {
          id: 'choice',
          unit: 'candidate-index',
          label: k.purpose.slice(0, 120),
          values: k.candidates.map((_, i) => i),
          valueAliases: k.candidates.map((c, i) => ({
            value: i,
            label: c.label,
          })),
        },
      ],
      scenarios: r.scenarios.map((s) => ({
        id: s.id,
        values: { width: s.width, height: s.height, textScale: s.textScale },
      })),
      derived: [],
      factors: [],
    };
    const add = (name: string, expression: Expression, unit: string) => {
      program.derived.push({
        id: name,
        expression,
        unit,
        provenance: {
          kind: 'calculated',
          source: `relational-kernels-v1:${k.kind}`,
        },
      });
      outputs.push({ stage: k.id, name, expression: ref(name), unit });
    };
    const factor = (
      id: string,
      expression: Expression,
      min: number,
      max: number,
      mode: 'hard' | 'preference',
      scale = 1,
    ) =>
      program.factors.push({
        id,
        expression,
        bands: [{ min, max }],
        mode,
        scale,
        weight: 1,
        category: k.kind,
        provenance,
      });
    const dependencies: string[] = [],
      bindings: Array<{ input: string; stage: string; variable: string }> = [];
    if (k.kind === 'type-row') {
      for (const c of k.candidates) {
        unique(
          c.cells.map((x) => x.scenario),
          `${k.id}/${c.id} cells`,
        );
        if (c.cells.length !== r.scenarios.length)
          throw Error(`Missing text scenario for ${k.id}/${c.id}`);
      }
      for (const s of r.scenarios) {
        const values = program.scenarios.find((x) => x.id === s.id)!.values;
        k.candidates.forEach((c, i) => {
          const cell = c.cells.find((x) => x.scenario === s.id);
          if (!cell) throw Error(`Missing text cell ${s.id}`);
          if (cell.sourceIdentity !== r.identities.source)
            throw Error(`Stale text source for ${k.id}/${c.id}`);
          if (cell.provider !== (s.platform === 'web' ? 'browser' : s.platform))
            throw Error(`Wrong renderer for ${s.id}`);
          if (
            cell.inputIdentity !==
            kernelTextMeasurementIdentity({
              text: k.text,
              fontIdentity: k.fontIdentity,
              fontSize: c.fontSize,
              lineHeight: c.lineHeight,
              trackingEm: c.trackingEm,
              width: cell.width,
              scenario: s,
            })
          )
            throw Error(`Stale text parameters for ${k.id}/${c.id}/${s.id}`);
          Object.assign(values, {
            [`cellHeight${i}`]: cell.height,
            [`cellWidth${i}`]: cell.width,
            [`cellOverflow${i}`]: Math.max(cell.overflowX, cell.overflowY),
          });
        });
      }
      program.variables.push({
        id: 'paddingBlock',
        unit: 'layout-unit',
        values: k.paddingBlock,
      });
      const chooseCell = (field: string) =>
        k.candidates
          .slice(0, -1)
          .reduceRight<Expression>(
            (tail, _, i) =>
              op(
                'if',
                op('lt', op('abs', op('sub', ref('choice'), i)), 0.5),
                ref(`${field}${i}`),
                tail,
              ),
            ref(`${field}${k.candidates.length - 1}`),
          );
      add(
        'fontSize',
        op(
          'mul',
          lookup(
            'choice',
            k.candidates.map((c) => c.fontSize),
          ),
          ref('textScale'),
        ),
        'layout-unit',
      );
      add(
        'lineHeightRatio',
        lookup(
          'choice',
          k.candidates.map((c) => c.lineHeight),
        ),
        'ratio',
      );
      add(
        'lineHeight',
        op('mul', ref('fontSize'), ref('lineHeightRatio')),
        'layout-unit',
      );
      add(
        'letterSpacing',
        op(
          'mul',
          ref('fontSize'),
          lookup(
            'choice',
            k.candidates.map((c) => c.trackingEm),
          ),
        ),
        'layout-unit',
      );
      add('textWidth', chooseCell('cellWidth'), 'layout-unit');
      add(
        'rowHeight',
        op(
          'max',
          k.minHitSize,
          op(
            'add',
            chooseCell('cellHeight'),
            op('mul', ref('paddingBlock'), 2),
          ),
        ),
        'layout-unit',
      );
      outputs.push({
        stage: k.id,
        name: 'paddingBlock',
        unit: 'layout-unit',
        expression: ref('paddingBlock'),
      });
      factor('text-overflow', chooseCell('cellOverflow'), 0, 0.75, 'hard');
      factor('row-maximum', ref('rowHeight'), 0, k.maxRowHeight, 'hard');
      factor(
        'row-density',
        ref('rowHeight'),
        k.minHitSize,
        k.preferredRowHeight,
        'preference',
        Math.max(1, k.preferredRowHeight - k.minHitSize),
      );
      evidence[k.id] = {
        kind: 'adapted-renderer-observations',
        cells: k.candidates.flatMap((c) => c.cells),
        fontIdentity: k.fontIdentity,
      };
    } else if (k.kind === 'regions') {
      unique(
        k.regions.map((x) => x.id),
        `${k.id} regions`,
      );
      let linked: Extract<Kernel, { kind: 'type-row' }> | undefined;
      if (k.roleLink) {
        const found = r.kernels.find((x) => x.id === k.roleLink!.kernel);
        if (
          !found ||
          found.kind !== 'type-row' ||
          !k.regions.some((x) => x.id === k.roleLink!.region)
        )
          throw Error(`Invalid role link for ${k.id}`);
        linked = found;
        dependencies.push(found.id);
        bindings.push({
          input: 'roleChoice',
          stage: found.id,
          variable: 'choice',
        });
        for (const s of program.scenarios) s.values.roleChoice = 0;
      }
      add(
        'gap',
        lookup(
          'choice',
          k.candidates.map((c) => c.gap),
        ),
        'layout-unit',
      );
      add(
        'inlinePadding',
        lookup(
          'choice',
          k.candidates.map((c) => c.inlinePadding),
        ),
        'layout-unit',
      );
      add(
        'available',
        op('sub', ref('width'), op('mul', ref('inlinePadding'), 2)),
        'layout-unit',
      );
      const minima = k.regions.map((region) => {
        const base = op('mul', region.minInline, ref('textScale'));
        if (!linked || region.id !== k.roleLink!.region) return base;
        for (const s of program.scenarios)
          linked.candidates.forEach((c, i) => {
            s.values[`roleWidth${i}`] = c.cells.find(
              (x) => x.scenario === s.id,
            )!.width;
          });
        const table = linked.candidates
          .slice(0, -1)
          .reduceRight<Expression>(
            (tail, _, i) =>
              op(
                'if',
                op('lt', op('abs', op('sub', ref('roleChoice'), i)), 0.5),
                ref(`roleWidth${i}`),
                tail,
              ),
            ref(`roleWidth${linked.candidates.length - 1}`),
          );
        return op('max', base, table);
      });
      const minimum = sum(minima),
        gaps = op('mul', ref('gap'), k.regions.length - 1),
        needed = op('add', minimum, gaps);
      add(
        'columns',
        op(
          'if',
          op(
            'lte',
            op(
              'max',
              needed,
              lookup(
                'choice',
                k.candidates.map((c) => c.splitMinimum),
              ),
            ),
            ref('available'),
          ),
          k.regions.length,
          1,
        ),
        'count',
      );
      const total = k.regions.reduce((n, x) => n + x.share, 0);
      k.regions.forEach((region, i) => {
        add(
          `${region.id}.width`,
          op(
            'if',
            op('lt', 1, ref('columns')),
            op(
              'add',
              minima[i]!,
              op(
                'mul',
                op('sub', ref('available'), needed),
                region.share / total,
              ),
            ),
            ref('available'),
          ),
          'layout-unit',
        );
        factor(
          `${region.id}.minimum`,
          op('sub', ref(`${region.id}.width`), minima[i]!),
          0,
          10000,
          'hard',
        );
      });
      factor(
        'paired-comparison',
        ref('columns'),
        k.regions.length,
        k.regions.length,
        'preference',
        k.regions.length - 1,
      );
      evidence[k.id] = {
        kind: 'authored-minima-and-calculated-allocation',
        regions: k.regions,
        roleLink: k.roleLink ?? null,
      };
    } else {
      const analyses = k.candidates.map((c) => ({
        palette: analyzePalette(c.palette),
        material: analyzeMaterialPair(c.material),
        motion: analyzeMotion(c.motion),
      }));
      add(
        'constraintFailures',
        lookup(
          'choice',
          analyses.map(
            (a) =>
              Number(a.palette.summary.status !== 'pass') +
              Number(!a.motion.constraints.passesAllTimeBounds) +
              a.material.physicalModelChecks.filter(
                (c) => c.status !== 'parameter-consistent',
              ).length,
          ),
        ),
        'count',
      );
      factor('declared-constraints', ref('constraintFailures'), 0, 0, 'hard');
      factor(
        'authored-direction',
        lookup(
          'choice',
          k.candidates.map((c) => c.preference),
        ),
        0,
        0,
        'preference',
      );
      for (const metric of new Set(
        analyses.flatMap(
          (a) => a.material.brief?.bands.map((b) => b.metric) ?? [],
        ),
      )) {
        const name = `material.${metric}`;
        add(
          name,
          lookup(
            'choice',
            analyses.map((a) => {
              const b = a.material.brief?.bands.find(
                (b) => b.metric === metric,
              );
              return !b
                ? 0
                : b.value === null
                  ? 1
                  : Math.max(b.min - b.value, 0, b.value - b.max) /
                    Math.max(1e-6, b.max - b.min);
            }),
          ),
          'ratio',
        );
        factor(name, ref(name), 0, 0, 'preference');
      }
      for (const property of ['mass', 'stiffness', 'damping'] as const)
        add(
          `spring.${property}`,
          lookup(
            'choice',
            analyses.map((a) => a.motion.motion.spring[property]),
          ),
          'spring-parameter',
        );
      add(
        'surface.roughness',
        lookup(
          'choice',
          k.candidates.map((c) => c.material.second.surface.roughness),
        ),
        'ratio',
      );
      add(
        'surface.metalness',
        lookup(
          'choice',
          k.candidates.map((c) => c.material.second.surface.metalness),
        ),
        'ratio',
      );
      const names = Object.keys(analyses[0]!.palette.tokens);
      if (
        analyses.some(
          (a) =>
            Object.keys(a.palette.tokens).sort().join() !==
            [...names].sort().join(),
        )
      )
        throw Error(`Appearance palette token names differ for ${k.id}`);
      names.forEach((name) =>
        outputs.push({
          stage: k.id,
          name: `palette.${name}`,
          unit: 'color',
          expression: null,
          candidateValues: analyses.map(
            (a) => a.palette.tokens[name]!.emitted.css,
          ),
        }),
      );
      outputs.push({
        stage: k.id,
        name: 'nativeFinish',
        unit: 'token',
        expression: null,
        candidateValues: k.candidates.map((c) => c.nativeFinish),
      });
      evidence[k.id] = {
        kind: 'executed-deterministic-analyzers',
        analyses,
        limits:
          'Material descriptors are not appearance verification; native finish is static; actual composites and motion remain pending.',
      };
    }
    compileEnergy(program);
    r.scenarios.forEach((s) =>
      obligations.push({
        kernel: k.id,
        scenario: s.id,
        platform: s.platform,
        checks:
          k.kind === 'appearance'
            ? [
                'actual-composite-contrast',
                'reduced-motion',
                'continuous-retarget-and-disposal',
                'native-finish-support',
              ]
            : k.kind === 'regions'
              ? [
                  'all-regions-present',
                  'current-root-and-safe-area',
                  'changed-text-reflow',
                ]
              : [
                  'current-text-and-hit-geometry',
                  'changed-text',
                  'system-enlargement',
                ],
      }),
    );
    return {
      id: k.id,
      purpose: k.purpose,
      program,
      dependsOn: dependencies,
      bindings,
      contextKeys: ['brief'],
      selection: k.selection,
      question: `Choose the meaningful ${k.kind} alternative for the brief using the named options and measured/calculated consequences. Appearance and task quality remain unverified.`,
      provenance,
      options: {
        method: 'exhaustive' as const,
        maxEvaluations: 96,
        maxFactorObservations: 500000,
        maxExpressionOperations: 5000000,
        limit: 6,
        retention: 'pareto-diverse' as const,
      },
    };
  });
  const workflow = DecisionWorkflowSchema.parse({
    version: 1,
    id: r.id,
    context: { brief: r.brief },
    stages,
    budgets: {
      maxEvaluations: 96 * stages.length,
      maxGraphNodes: 96 * stages.length,
      maxSelectorCalls: stages.length,
      maxReadoutPasses: stages.length * 6,
    },
  });
  const body = {
    version: 1 as const,
    engine: 'relational-kernels-v1' as const,
    input: r,
    inputIdentity: hash(r),
    workflow,
    outputs,
    evidence,
    obligations,
    scope:
      'Compiled authored policy and declared source-bound facts; no search, neural call or new renderer measurement. Hashes identify payloads, not truth or authorship.',
  };
  return { ...body, identity: hash(body) };
}
export type CompiledRelationalKernels = ReturnType<
  typeof compileRelationalKernels
>;
/** Convert a real workflow result into importable named token values; revalidate assignments, never search. */
export function resolveRelationalKernelOutputs(
  compiled: CompiledRelationalKernels,
  result: {
    stages: Record<
      string,
      {
        status: string;
        assignment: Record<string, number> | null;
        evidence: unknown;
      }
    >;
  },
) {
  const { identity, ...body } = compiled;
  if (hash(body) !== identity)
    throw Error('Kernel compilation identity mismatch');
  const resultIdentity = hash(result),
    values: Record<string, Record<string, string | number>> = {};
  for (const stage of compiled.workflow.stages) {
    const selected = result.stages[stage.id];
    if (
      !selected?.assignment ||
      !['chosen', 'replayed'].includes(selected.status)
    )
      throw Error(`Unresolved kernel ${stage.id}`);
    const program = structuredClone(stage.program);
    for (const b of stage.bindings) {
      const parent = result.stages[b.stage]?.assignment;
      if (!parent || parent[b.variable] === undefined)
        throw Error(`Missing predecessor ${b.stage}`);
      for (const scenario of program.scenarios)
        scenario.values[b.input] = parent[b.variable]!;
    }
    const evaluator = compileEnergy(program),
      evaluation = evaluator.evaluate(selected.assignment);
    const evidence = z
      .object({ programIdentity: Digest })
      .passthrough()
      .parse(selected.evidence);
    if (evidence.programIdentity !== evaluator.identity)
      throw Error(`Stale workflow source for ${stage.id}`);
    if (evaluation.hardFailures)
      throw Error(`Selected kernel ${stage.id} violates hard constraints`);
    for (const scenario of evaluator.program.scenarios) {
      const context = {
          ...selected.assignment,
          ...scenario.values,
          ...evaluation.derived[scenario.id],
        },
        target = (values[scenario.id] ??= {});
      for (const output of compiled.outputs.filter((o) => o.stage === stage.id))
        target[`${stage.id}.${output.name}`] =
          output.expression === null
            ? output.candidateValues![selected.assignment.choice!]!
            : evaluateExpression(output.expression, context);
    }
  }
  return {
    version: 1 as const,
    compilationIdentity: identity,
    inputIdentity: compiled.inputIdentity,
    identities: compiled.input.identities,
    resultIdentity,
    scenarioIdentities: Object.fromEntries(
      compiled.input.scenarios.map((s) => [s.id, hash(s)]),
    ),
    values,
    obligations: compiled.obligations,
    verification: 'pending-current-renderer' as const,
  };
}

/** CLI/MCP access to the existing resolver; no new search or measurement. */
export function resolveKernelSelection(
  input: z.input<typeof RelationalKernelResolveSchema>,
) {
  const r = RelationalKernelResolveSchema.parse(input);
  const compiled = compileRelationalKernels(r.input);
  if (compiled.identity !== r.compilationIdentity)
    throw new Error('Kernel input differs from the selected compilation');
  return resolveRelationalKernelOutputs(compiled, r.result);
}
