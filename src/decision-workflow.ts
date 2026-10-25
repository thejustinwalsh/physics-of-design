import { z } from 'zod';
import { hash } from './identity.js';
import {
  EnergyProgramSchema,
  EnergySearchOptionsSchema,
  ExpressionSchema,
  compileEnergy,
  searchEnergy,
  evaluateExpression,
  expressionRefs,
  validateExpression,
  type Assignment,
  type EnergyEvaluation,
  type EnergyProgram,
} from './energy.js';
import {
  SelectorProfileSchema,
  prepareLocalOptionsSession,
  selectLocalOptions,
  type SelectorExecutionOptions,
} from './selector.js';

const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const SelectorSchema = z
  .object({
    gguf: z.string().min(1),
    profile: SelectorProfileSchema.default('qwen3.5-4b'),
    readout: z.enum(['single', 'balanced']).default('single'),
    maxPromptTokens: z.number().int().min(512).max(16384).default(4096),
    auditDirectory: z.string().optional(),
  })
  .strict();
const SuccessorLookaheadSchema = z
  .object({
    successors: z.array(Id).min(1).max(8),
    maxBranches: z.number().int().min(1).max(24),
    maxEvaluations: z.number().int().min(1).max(100000),
    maxFactorObservations: z.number().int().min(1).max(2000000),
    maxExpressionOperations: z.number().int().min(1).max(50000000),
    completion: z.enum(['require', 'inform']),
    parentTies: z.enum(['preserve', 'prefer-successor-targets']),
  })
  .strict();
export const DecisionStageSchema = z
  .object({
    id: Id,
    purpose: z.string().min(1).max(2000),
    dependsOn: z.array(Id).max(16).default([]),
    bindings: z
      .array(
        z
          .object({
            input: Id,
            stage: Id,
            variable: Id,
          })
          .strict(),
      )
      .max(40)
      .default([]),
    contextKeys: z.array(Id).max(40).default([]),
    when: ExpressionSchema.optional(),
    program: EnergyProgramSchema,
    options: EnergySearchOptionsSchema.optional(),
    lookahead: SuccessorLookaheadSchema.optional(),
    selection: z
      .enum(['mathematical', 'local-selector'])
      .default('mathematical'),
    question: z
      .string()
      .min(1)
      .max(2000)
      .default(
        'Which mathematical alternative best expresses this stage brief?',
      ),
    provenance: z
      .object({
        source: z.string().min(1).max(2000),
        kind: z.enum(['brief', 'heuristic', 'hypothesis', 'calculated']),
      })
      .strict(),
  })
  .strict();
export const DecisionWorkflowSchema = z
  .object({
    version: z.literal(1),
    id: Id,
    stages: z.array(DecisionStageSchema).min(1).max(16),
    context: z
      .record(
        Id,
        z.union([z.string().max(4000), z.number().finite(), z.boolean()]),
      )
      .default({}),
    budgets: z
      .object({
        maxEvaluations: z.number().int().min(1).max(100000).default(65536),
        maxGraphNodes: z.number().int().min(1).max(100000).default(65536),
        maxSelectorCalls: z.number().int().min(0).max(16).default(16),
        maxReadoutPasses: z.number().int().min(0).max(96).default(96),
        maxFactorObservations: z.number().int().min(1).max(32000000).optional(),
        maxExpressionOperations: z
          .number()
          .int()
          .min(1)
          .max(800000000)
          .optional(),
      })
      .strict()
      .default({
        maxEvaluations: 65536,
        maxGraphNodes: 65536,
        maxSelectorCalls: 16,
        maxReadoutPasses: 96,
      }),
  })
  .strict();
const ContinuationSchema = z
  .object({
    engine: z.literal('direct-successor-lookahead-v1'),
    parent: z.record(Id, z.number().finite()),
    successors: z
      .array(
        z
          .object({
            stage: Id,
            outcome: z.enum(['admissible', 'skipped', 'infeasible', 'unknown']),
            alternatives: z.array(z.record(Id, z.number().finite())).max(24),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
const CachePayloadSchema = z
  .object({
    kind: z.enum(['chosen', 'skipped']),
    assignment: z.record(Id, z.number().finite()).nullable(),
    alternatives: z.array(z.record(Id, z.number().finite())).max(24),
    selection: z.unknown(),
    evidence: z.unknown(),
    continuation: ContinuationSchema.optional(),
  })
  .strict();
const CacheEntrySchema = z
  .object({ key: Digest, digest: Digest, payload: CachePayloadSchema })
  .strict();
export const DecisionWorkflowRecipeSchema = z
  .object({
    version: z.literal(1),
    engine: z.literal('design-decision-workflow-v1'),
    workflowId: Id,
    entries: z.record(Id, CacheEntrySchema),
  })
  .strict();
export const RunDecisionWorkflowSchema = z
  .object({
    workflow: DecisionWorkflowSchema,
    selector: SelectorSchema.optional(),
    recipe: DecisionWorkflowRecipeSchema.optional(),
    mode: z.enum(['search', 'replay']).default('search'),
  })
  .strict();
export type DecisionWorkflowInput = z.input<typeof RunDecisionWorkflowSchema>;
type Request = z.infer<typeof RunDecisionWorkflowSchema>;
type Stage = z.infer<typeof DecisionStageSchema>;
type CacheEntry = z.infer<typeof CacheEntrySchema>;
type SelectionRequest = Parameters<typeof selectLocalOptions>[0];
/** Injection is explicitly test-only; its identity cannot share production cache entries. */
export interface DecisionWorkflowTestHooks {
  testSelector: (
    request: SelectionRequest,
  ) => Promise<{ selected: string; provenance?: unknown }>;
  testSelectorIdentity: string;
}
export interface DecisionStageResult {
  id: string;
  status: 'chosen' | 'replayed' | 'skipped' | 'stale' | 'failed' | 'blocked';
  cacheKey: string | null;
  assignment: Assignment | null;
  alternatives: EnergyEvaluation[];
  selection: unknown;
  evidence: unknown;
  reason?: string;
  previous?: CacheEntry;
  rendererVerification: 'pending';
}
interface Statistics {
  searches: number;
  evaluated: number;
  revalidated: number;
  factorEvaluations: number;
  graphNodes: number;
  selectorCalls: number;
  requestedReadoutPasses: number;
  completedReadoutPasses: number;
  neuralCalls: number;
  testSelectorCalls: number;
  cacheHits: number;
  checkpointHashes: number;
  expressionOperationUpperBound: number;
  lookahead: {
    searches: number;
    evaluated: number;
    factorEvaluations: number;
    expressionOperationUpperBound: number;
    graphNodes: number;
    branches: number;
    revalidated: number;
    reusedSearches: number;
  };
}
type EnergySearch = ReturnType<typeof searchEnergy>;
const selectorPayloadSemantics = 'units-aliases-worst-scenario-v2';
const preferenceSummaryLimit = 12;
function selectorVariables(program: EnergyProgram) {
  return program.variables.map(({ id, unit, label, valueAliases }) => ({
    id,
    unit,
    ...(label ? { label } : {}),
    ...(valueAliases ? { valueAliases } : {}),
  }));
}
function preferenceSummary(
  program: EnergyProgram,
  factors: Pick<
    EnergyEvaluation['factors'][number],
    'id' | 'scenario' | 'value' | 'residual' | 'mode'
  >[],
  violationsOnly = false,
) {
  const summaries = program.factors
    .filter((f) => f.mode === 'preference')
    .flatMap((definition) => {
      const rows = factors.filter((f) => f.id === definition.id);
      if (!rows.length) return [];
      const worst = rows.reduce((a, b) => (b.residual > a.residual ? b : a));
      if (violationsOnly && worst.residual === 0) return [];
      const expression = definition.expression;
      const unit =
        typeof expression !== 'number' && 'ref' in expression
          ? [...program.variables, ...program.derived].find(
              (v) => v.id === expression.ref,
            )?.unit
          : undefined;
      return [
        {
          id: definition.id,
          ...(unit ? { unit } : {}),
          values: [
            Math.min(...rows.map((f) => f.value)),
            Math.max(...rows.map((f) => f.value)),
          ],
          maxResidual: worst.residual,
          worstScenario: {
            id: worst.scenario,
            value: worst.value,
            residual: worst.residual,
            targetBands:
              definition.scenarioBands?.[worst.scenario] ?? definition.bands,
          },
          provenanceKind: definition.provenance.kind,
        },
      ];
    })
    .sort((a, b) => b.maxResidual - a.maxResidual || a.id.localeCompare(b.id));
  return {
    rows: summaries.slice(0, preferenceSummaryLimit),
    omitted: Math.max(0, summaries.length - preferenceSummaryLimit),
  };
}
type SuccessorSearchEvidence = {
  programIdentity: string;
  searchReceiptHash: string;
  statistics: EnergySearch['statistics'];
  candidates: {
    id: string;
    assignment: Assignment;
    energy: number;
    hardFailures: number;
    preferenceTargetsSatisfied: boolean;
  }[];
  witness: {
    id: string;
    assignment: Assignment;
    preferenceTargetsSatisfied: boolean;
    factors: Pick<
      EnergyEvaluation['factors'][number],
      'id' | 'scenario' | 'value' | 'residual' | 'energy' | 'mode'
    >[];
  } | null;
  scope: string;
};
type SuccessorOutcome = {
  stage: string;
  outcome: 'admissible' | 'skipped' | 'infeasible' | 'unknown';
  reason?: string;
  bindings: Assignment;
  search: SuccessorSearchEvidence | null;
};
type LookaheadBranch = {
  parent: EnergyEvaluation;
  successors: SuccessorOutcome[];
  completion: 'witnessed' | 'infeasible' | 'unknown';
  jointlySatisfied: boolean;
};
type LookaheadEvidence = {
  engine: 'direct-successor-lookahead-v1';
  policy: z.infer<typeof SuccessorLookaheadSchema>;
  branches: LookaheadBranch[];
  uncoveredParents: string[];
  scope: string;
};
const pendingScope =
  'Stage choices express separate, brief-conditioned preferences. Mathematical admissibility is not renderer verification or a universal beauty score.';

function normalize(input: DecisionWorkflowInput) {
  // Bound hostile/deep input before recursive Zod expression parsing.
  let nodes = 0;
  const inspect = (value: unknown, depth = 0): void => {
    if (++nodes > 2000000 || depth > 48)
      throw new Error('Workflow exceeds input size/depth budget');
    if (value && typeof value === 'object')
      for (const child of Object.values(value)) inspect(child, depth + 1);
  };
  inspect(input);
  const request = RunDecisionWorkflowSchema.parse(input);
  const stages = new Map<string, Stage>();
  for (const stage of request.workflow.stages) {
    if (stages.has(stage.id)) throw new Error(`Duplicate stage ${stage.id}`);
    stages.set(stage.id, stage);
    if (new Set(stage.dependsOn).size !== stage.dependsOn.length)
      throw new Error(`Duplicate dependency in ${stage.id}`);
    if (new Set(stage.contextKeys).size !== stage.contextKeys.length)
      throw new Error(`Duplicate context key in ${stage.id}`);
    for (const key of stage.contextKeys)
      if (!Object.hasOwn(request.workflow.context, key))
        throw new Error(`Unknown context input ${key}`);
    compileEnergy(stage.program);
  }
  let edges = 0;
  for (const stage of stages.values()) {
    edges += stage.dependsOn.length;
    for (const dependency of stage.dependsOn)
      if (!stages.has(dependency) || dependency === stage.id)
        throw new Error(`Unknown/self dependency ${dependency}`);
    const bound = new Set<string>();
    for (const binding of stage.bindings) {
      if (!stage.dependsOn.includes(binding.stage))
        throw new Error(
          `Binding ${binding.input} must declare dependency ${binding.stage}`,
        );
      if (
        !stages
          .get(binding.stage)!
          .program.variables.some((v) => v.id === binding.variable)
      )
        throw new Error(
          `Unknown predecessor variable ${binding.stage}.${binding.variable}`,
        );
      if (bound.has(binding.input))
        throw new Error(`Duplicate bound input ${binding.input}`);
      bound.add(binding.input);
      if (
        stage.program.scenarios.some(
          (s) => !Object.hasOwn(s.values, binding.input),
        )
      )
        throw new Error(
          `Binding target ${binding.input} must be a declared scenario input`,
        );
    }
    if (stage.when !== undefined) {
      validateExpression(stage.when);
      for (const ref of expressionRefs(stage.when))
        if (!bound.has(ref))
          throw new Error(
            `Unknown guard input ${ref}; guards use predecessor bindings`,
          );
    }
    if (stage.selection === 'local-selector' && !request.selector)
      throw new Error(`Stage ${stage.id} requires selector configuration`);
    if (stage.lookahead) {
      if (
        new Set(stage.lookahead.successors).size !==
        stage.lookahead.successors.length
      )
        throw new Error(`Duplicate lookahead successor in ${stage.id}`);
      for (const id of stage.lookahead.successors)
        if (!stages.get(id)?.dependsOn.includes(stage.id))
          throw new Error(
            `Lookahead ${stage.id}.${id} must follow a declared direct dependency`,
          );
    }
  }
  if (edges > 128) throw new Error('Workflow exceeds dependency edge budget');
  const order: string[] = [];
  while (order.length < stages.size) {
    const ready = [...stages.values()]
      .filter(
        (s) =>
          !order.includes(s.id) && s.dependsOn.every((d) => order.includes(d)),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!ready.length) throw new Error('Cyclic workflow dependencies');
    order.push(...ready.map((s) => s.id));
  }
  const reserved = [...stages.values()].reduce(
    (sum, s) =>
      sum +
      EnergySearchOptionsSchema.parse(s.options ?? {}).maxEvaluations +
      (s.lookahead?.maxEvaluations ?? 0),
    0,
  );
  if (
    reserved > request.workflow.budgets.maxEvaluations ||
    reserved > request.workflow.budgets.maxGraphNodes
  )
    throw new Error(
      'Declared stage search budgets exceed workflow evaluation/graph budget',
    );
  for (const [name, fallback] of [
    ['maxFactorObservations', 32000000],
    ['maxExpressionOperations', 800000000],
  ] as const) {
    const amount = [...stages.values()].reduce(
      (sum, s) =>
        sum +
        EnergySearchOptionsSchema.parse(s.options ?? {})[name] +
        (s.lookahead?.[name] ?? 0),
      0,
    );
    if (amount > (request.workflow.budgets[name] ?? fallback))
      throw new Error(
        `Declared stage and lookahead ${name} exceed workflow budget`,
      );
  }
  if (request.recipe && Object.keys(request.recipe.entries).length > 16)
    throw new Error('Recipe exceeds stage budget');
  return { request, stages, order };
}

/** Explicit executable machine: step advances one dependency-ordered design stage; run drives it to completion. */
export class DecisionWorkflowMachine {
  readonly order: readonly string[];
  private request: Request;
  private stages: Map<string, Stage>;
  private hooks: DecisionWorkflowTestHooks | undefined;
  private results: Record<string, DecisionStageResult> = {};
  private entries: Record<string, CacheEntry> = {};
  private cursor = 0;
  private running = false;
  private checkpoint: string | null = null;
  private reusableSearches = new Map<string, EnergySearch>();
  private session:
    Awaited<ReturnType<typeof prepareLocalOptionsSession>> | undefined;
  private statistics: Statistics = {
    searches: 0,
    evaluated: 0,
    revalidated: 0,
    factorEvaluations: 0,
    graphNodes: 0,
    selectorCalls: 0,
    requestedReadoutPasses: 0,
    completedReadoutPasses: 0,
    neuralCalls: 0,
    testSelectorCalls: 0,
    cacheHits: 0,
    checkpointHashes: 0,
    expressionOperationUpperBound: 0,
    lookahead: {
      searches: 0,
      evaluated: 0,
      factorEvaluations: 0,
      expressionOperationUpperBound: 0,
      graphNodes: 0,
      branches: 0,
      revalidated: 0,
      reusedSearches: 0,
    },
  };
  constructor(
    input: DecisionWorkflowInput,
    hooks?: DecisionWorkflowTestHooks,
    private execution: SelectorExecutionOptions = {},
  ) {
    const normalized = normalize(input);
    this.request = normalized.request;
    this.stages = normalized.stages;
    this.order = Object.freeze(normalized.order);
    this.hooks = hooks;
    if (hooks && !hooks.testSelectorIdentity.trim())
      throw new Error('Test selector needs an explicit identity');
  }
  getSnapshot() {
    const complete = this.cursor === this.order.length;
    const successful = Object.values(this.results).every((r) =>
      ['chosen', 'replayed', 'skipped'].includes(r.status),
    );
    return structuredClone({
      state: complete
        ? ('complete' as const)
        : this.running
          ? ('running' as const)
          : ('ready' as const),
      status: !complete
        ? ('in-progress' as const)
        : !successful
          ? ('incomplete' as const)
          : this.statistics.searches
            ? ('proposed' as const)
            : ('replayed' as const),
      nextStage: this.order[this.cursor] ?? null,
      order: this.order,
      stages: this.results,
      recipe: {
        version: 1 as const,
        engine: 'design-decision-workflow-v1' as const,
        workflowId: this.request.workflow.id,
        entries: this.entries,
      },
      statistics: this.statistics,
      rendererVerification: 'pending' as const,
      scope: pendingScope,
    });
  }
  async step() {
    this.execution.signal?.throwIfAborted();
    if (this.running)
      throw new Error('Concurrent workflow step is not allowed');
    if (this.cursor === this.order.length) return this.getSnapshot();
    this.running = true;
    const id = this.order[this.cursor]!;
    try {
      this.results[id] = await this.execute(this.stages.get(id)!);
    } catch (error) {
      this.results[id] = {
        id,
        status: 'failed',
        cacheKey: null,
        assignment: null,
        alternatives: [],
        selection: null,
        evidence: null,
        reason: String(error),
        rendererVerification: 'pending',
      };
      if (this.execution.signal?.aborted) throw error;
    } finally {
      this.cursor++;
      this.running = false;
    }
    return this.getSnapshot();
  }
  async run() {
    while (this.cursor < this.order.length) await this.step();
    return this.getSnapshot();
  }
  private bindingsFor(
    stage: Stage,
    parent?: { id: string; assignment: Assignment },
  ): Assignment {
    return Object.fromEntries(
      stage.bindings.map((binding) => [
        binding.input,
        (binding.stage === parent?.id
          ? parent.assignment
          : this.results[binding.stage]?.assignment)?.[binding.variable],
      ]),
    ) as Assignment;
  }
  private boundProgram(stage: Stage, bindings: Assignment) {
    const program = structuredClone(stage.program);
    for (const scenario of program.scenarios)
      Object.assign(scenario.values, bindings);
    return program;
  }
  private lookaheadIdentity(stage: Stage) {
    if (!stage.lookahead) return undefined;
    return {
      engine: 'direct-successor-lookahead-v1',
      policy: stage.lookahead,
      successors: [...stage.lookahead.successors].sort().map((id) => {
        const successor = this.stages.get(id)!;
        return {
          stage: successor,
          context: Object.fromEntries(
            successor.contextKeys.map((key) => [
              key,
              this.request.workflow.context[key],
            ]),
          ),
          otherPredecessors: successor.dependsOn
            .filter((id) => id !== stage.id)
            .sort()
            .map((id) => ({
              id,
              key: this.results[id]?.cacheKey ?? null,
              assignment: this.results[id]?.assignment ?? null,
            })),
        };
      }),
    };
  }
  private noteSearch(search: EnergySearch, lookahead: boolean) {
    this.statistics.searches++;
    this.statistics.evaluated += search.statistics.evaluated;
    this.statistics.factorEvaluations += search.statistics.factorEvaluations;
    this.statistics.expressionOperationUpperBound +=
      search.statistics.expressionOperationUpperBound;
    this.statistics.graphNodes += search.choiceGraph.nodes.length;
    if (lookahead) {
      const count = this.statistics.lookahead;
      count.searches++;
      count.evaluated += search.statistics.evaluated;
      count.factorEvaluations += search.statistics.factorEvaluations;
      count.expressionOperationUpperBound +=
        search.statistics.expressionOperationUpperBound;
      count.graphNodes += search.choiceGraph.nodes.length;
    }
  }
  private inspectSuccessors(
    stage: Stage,
    candidates: EnergyEvaluation[],
  ): LookaheadEvidence {
    const policy = stage.lookahead!;
    const branches: LookaheadBranch[] = [];
    let remainingEvaluations = policy.maxEvaluations,
      remainingFactors = policy.maxFactorObservations,
      remainingOperations = policy.maxExpressionOperations;
    for (const parent of candidates.slice(0, policy.maxBranches)) {
      this.statistics.lookahead.branches++;
      const successors: SuccessorOutcome[] = [];
      for (const id of policy.successors) {
        const child = this.stages.get(id)!;
        const unresolved = child.dependsOn.filter(
          (id) => id !== stage.id && !this.results[id]?.assignment,
        );
        if (unresolved.length) {
          successors.push({
            stage: id,
            outcome: 'unknown',
            bindings: {},
            search: null,
            reason: `Other predecessors unresolved: ${unresolved.join(', ')}`,
          });
          continue;
        }
        const bindings = this.bindingsFor(child, {
          id: stage.id,
          assignment: parent.assignment,
        });
        if (
          child.when !== undefined &&
          evaluateExpression(child.when, bindings) === 0
        ) {
          successors.push({
            stage: id,
            outcome: 'skipped',
            bindings,
            search: null,
          });
          continue;
        }
        if (
          remainingEvaluations < 1 ||
          remainingFactors < 1 ||
          remainingOperations < 1
        ) {
          successors.push({
            stage: id,
            outcome: 'unknown',
            bindings,
            search: null,
            reason: 'Lookahead numeric budget exhausted',
          });
          continue;
        }
        const program = this.boundProgram(child, bindings);
        const declared = EnergySearchOptionsSchema.parse(child.options ?? {});
        const search = searchEnergy({
          program,
          options: {
            ...declared,
            maxEvaluations: Math.min(
              declared.maxEvaluations,
              remainingEvaluations,
            ),
            maxFactorObservations: Math.min(
              declared.maxFactorObservations,
              remainingFactors,
            ),
            maxExpressionOperations: Math.min(
              declared.maxExpressionOperations,
              remainingOperations,
            ),
          },
        });
        this.noteSearch(search, true);
        remainingEvaluations -= search.statistics.evaluated;
        remainingFactors -= search.statistics.factorEvaluations;
        remainingOperations -= search.statistics.expressionOperationUpperBound;
        if (search.statistics.complete)
          this.reusableSearches.set(
            hash({
              programIdentity: search.programIdentity,
              options: declared,
            }),
            search,
          );
        const satisfied = (a: EnergyEvaluation) =>
          a.factors.every((f) => f.mode === 'hard' || f.residual === 0);
        const witness =
          search.candidates.find(satisfied) ?? search.candidates[0];
        const receipt: SuccessorSearchEvidence = {
          programIdentity: search.programIdentity,
          searchReceiptHash: hash(search),
          statistics: search.statistics,
          candidates: search.candidates.map((a) => ({
            id: a.id,
            assignment: a.assignment,
            energy: a.energy,
            hardFailures: a.hardFailures,
            preferenceTargetsSatisfied: satisfied(a),
          })),
          witness: witness
            ? {
                id: witness.id,
                assignment: witness.assignment,
                preferenceTargetsSatisfied: satisfied(witness),
                factors: witness.factors.map(
                  ({ id, scenario, value, residual, energy, mode }) => ({
                    id,
                    scenario,
                    value,
                    residual,
                    energy,
                    mode,
                  }),
                ),
              }
            : null,
          scope:
            'Retained assignments and one source-bound witness from this bounded search. Full program, graph and derived tables remain private for this run. A saved best candidate is not a global optimum.',
        };
        successors.push({
          stage: id,
          bindings,
          search: receipt,
          outcome: search.candidates.length
            ? 'admissible'
            : search.statistics.complete
              ? 'infeasible'
              : 'unknown',
          ...(!search.candidates.length && !search.statistics.complete
            ? { reason: 'Incomplete search has no continuation witness' }
            : {}),
        });
      }
      branches.push({
        parent,
        successors,
        completion: successors.every((s) =>
          ['admissible', 'skipped'].includes(s.outcome),
        )
          ? 'witnessed'
          : successors.some((s) => s.outcome === 'infeasible')
            ? 'infeasible'
            : 'unknown',
        jointlySatisfied: successors.every(
          (s) =>
            s.outcome === 'skipped' ||
            s.search?.candidates.some((a) => a.preferenceTargetsSatisfied),
        ),
      });
    }
    return {
      engine: 'direct-successor-lookahead-v1',
      policy,
      branches,
      uncoveredParents: candidates.slice(policy.maxBranches).map((a) => a.id),
      scope:
        'Witnesses cover declared direct successors under retained parent assignments. No recursive DAG optimum, summed cross-stage objective, renderer or preference verification. Unknown branches are not proven impossible.',
    };
  }
  private continuation(
    stage: Stage,
    selected: EnergyEvaluation,
    lookahead: LookaheadEvidence,
  ): z.infer<typeof ContinuationSchema> {
    const branch = lookahead.branches.find((b) => b.parent.id === selected.id);
    return {
      engine: 'direct-successor-lookahead-v1',
      parent: selected.assignment,
      successors: stage.lookahead!.successors.map((id) => {
        const outcome = branch?.successors.find((s) => s.stage === id);
        return {
          stage: id,
          outcome: outcome?.outcome ?? 'unknown',
          alternatives:
            outcome?.search?.candidates.map((a) => a.assignment) ?? [],
        };
      }),
    };
  }
  private revalidateContinuation(
    stage: Stage,
    payload: z.infer<typeof CachePayloadSchema>,
  ) {
    if (!stage.lookahead || payload.kind !== 'chosen') return;
    const receipt = payload.continuation;
    if (!receipt || hash(receipt.parent) !== hash(payload.assignment))
      throw new Error(
        'Cached lookahead continuation does not bind the chosen parent',
      );
    if (
      hash(receipt.successors.map((s) => s.stage).sort()) !==
      hash([...stage.lookahead.successors].sort())
    )
      throw new Error('Cached lookahead successors do not match the policy');
    for (const saved of receipt.successors) {
      const child = this.stages.get(saved.stage)!;
      if (
        stage.lookahead.completion === 'require' &&
        !['admissible', 'skipped'].includes(saved.outcome)
      )
        throw new Error('Cached parent has no required continuation witness');
      if (saved.outcome === 'unknown' || saved.outcome === 'infeasible') {
        if (saved.alternatives.length)
          throw new Error('Unwitnessed continuation contains assignments');
        continue; // Historical absence is not re-certified by replay.
      }
      if (
        child.dependsOn.some(
          (id) => id !== stage.id && !this.results[id]?.assignment,
        )
      )
        throw new Error('Cached continuation has an unresolved predecessor');
      const bindings = this.bindingsFor(child, {
        id: stage.id,
        assignment: receipt.parent,
      });
      const active =
        child.when === undefined ||
        evaluateExpression(child.when, bindings) !== 0;
      if (active !== (saved.outcome === 'admissible'))
        throw new Error('Cached successor guard changed');
      if (!active) {
        if (saved.alternatives.length)
          throw new Error('Skipped continuation has assignments');
        continue;
      }
      if (!saved.alternatives.length)
        throw new Error('Cached continuation lacks an admissible witness');
      const compiled = compileEnergy(this.boundProgram(child, bindings));
      for (const assignment of saved.alternatives) {
        this.statistics.revalidated++;
        this.statistics.lookahead.revalidated++;
        const before = compiled.factorEvaluations;
        try {
          if (compiled.evaluate(assignment).hardFailures)
            throw new Error(
              'Cached continuation violates successor hard guards',
            );
        } finally {
          this.statistics.factorEvaluations +=
            compiled.factorEvaluations - before;
          this.statistics.lookahead.factorEvaluations +=
            compiled.factorEvaluations - before;
        }
      }
    }
  }
  private async execute(stage: Stage): Promise<DecisionStageResult> {
    const base = {
      id: stage.id,
      assignment: null,
      alternatives: [],
      selection: null,
      evidence: null,
      rendererVerification: 'pending' as const,
    };
    const blocked = stage.dependsOn.filter(
      (id) => !['chosen', 'replayed'].includes(this.results[id]!.status),
    );
    if (blocked.length)
      return {
        ...base,
        status: 'blocked',
        cacheKey: null,
        reason: `Predecessor has no selected assignment: ${blocked.join(', ')}`,
      };
    if (stage.selection === 'local-selector' && !this.session) {
      this.session = await prepareLocalOptionsSession(
        this.request.selector!.gguf,
        this.execution,
      );
      this.checkpoint = this.session.checkpointHash;
      this.statistics.checkpointHashes++;
    }
    const bindings = this.bindingsFor(stage);
    const program = this.boundProgram(stage, bindings);
    const compiled = compileEnergy(program);
    const options = EnergySearchOptionsSchema.parse(stage.options ?? {});
    const context = Object.fromEntries(
      [...stage.contextKeys]
        .sort()
        .map((key) => [key, this.request.workflow.context[key]]),
    );
    const guard =
      stage.when === undefined ||
      evaluateExpression(stage.when, bindings) !== 0;
    const policy =
      stage.selection === 'local-selector'
        ? {
            profile: this.request.selector!.profile,
            readout: this.request.selector!.readout,
            maxPromptTokens: this.request.selector!.maxPromptTokens,
            checkpoint: this.checkpoint,
            payloadSemantics: selectorPayloadSemantics,
            implementation: this.hooks
              ? `test-injected:${this.hooks.testSelectorIdentity}`
              : 'semif-direct-options-v1',
          }
        : 'mathematical';
    const key = hash({
      engine: 'design-decision-workflow-v1',
      workflowId: this.request.workflow.id,
      stage: {
        id: stage.id,
        purpose: stage.purpose,
        provenance: stage.provenance,
        question: stage.question,
        dependencies: [...stage.dependsOn].sort().map((id) => ({
          id,
          key: this.results[id]!.cacheKey,
          assignment: this.results[id]!.assignment,
        })),
        bindings: [...stage.bindings].sort((a, b) =>
          a.input.localeCompare(b.input),
        ),
        when: stage.when ?? null,
      },
      programIdentity: compiled.identity,
      options,
      context,
      policy,
      ...(stage.lookahead ? { lookahead: this.lookaheadIdentity(stage) } : {}),
    });
    const previous =
      this.request.recipe?.workflowId === this.request.workflow.id
        ? this.request.recipe.entries[stage.id]
        : undefined;
    let invalidation: string | undefined;
    if (previous) {
      if (previous.key !== key)
        invalidation =
          'Stage program, dependencies, context, guard, policy or checkpoint changed';
      else if (hash(previous.payload) !== previous.digest)
        invalidation = 'Cached payload integrity mismatch';
      else {
        try {
          const payload = previous.payload;
          if (guard !== (payload.kind === 'chosen'))
            throw new Error('Cached guard outcome changed');
          const alternatives = payload.alternatives.map((a) => {
            this.statistics.revalidated++;
            const before = compiled.factorEvaluations;
            try {
              return compiled.evaluate(a);
            } finally {
              this.statistics.factorEvaluations +=
                compiled.factorEvaluations - before;
            }
          });
          if (alternatives.some((a) => a.hardFailures))
            throw new Error('Cached alternative violates mathematical guards');
          if (
            payload.kind === 'chosen' &&
            (!payload.assignment ||
              !alternatives.some(
                (a) => hash(a.assignment) === hash(payload.assignment),
              ))
          )
            throw new Error('Cached choice is absent from alternatives');
          if (
            payload.kind === 'skipped' &&
            (payload.assignment !== null || alternatives.length)
          )
            throw new Error('Skipped stage must not have an assignment');
          this.revalidateContinuation(stage, payload);
          this.entries[stage.id] = structuredClone(previous);
          this.statistics.cacheHits++;
          return {
            ...base,
            status: guard ? 'replayed' : 'skipped',
            cacheKey: key,
            assignment: payload.assignment,
            alternatives,
            selection: payload.selection,
            evidence: payload.evidence,
          };
        } catch (error) {
          invalidation = `Replay validation failed: ${String(error)}`;
        }
      }
    }
    const history = previous ? { previous: structuredClone(previous) } : {};
    if (this.request.mode === 'replay')
      return {
        ...base,
        ...history,
        status: 'stale',
        cacheKey: key,
        reason: invalidation ?? 'No matching cached stage',
      };
    if (!guard) {
      this.save(stage.id, key, {
        kind: 'skipped',
        assignment: null,
        alternatives: [],
        selection: null,
        evidence: { guard: false, bindings },
      });
      return {
        ...base,
        ...history,
        status: 'skipped',
        cacheKey: key,
        evidence: { guard: false, bindings },
        ...(invalidation ? { reason: invalidation } : {}),
      };
    }
    const reuseKey = hash({ programIdentity: compiled.identity, options });
    const reused = this.reusableSearches.get(reuseKey);
    const search = reused ?? searchEnergy({ program, options });
    if (reused) this.statistics.lookahead.reusedSearches++;
    else this.noteSearch(search, false);
    const lookahead =
      stage.lookahead && search.candidates.length
        ? this.inspectSuccessors(stage, search.candidates)
        : null;
    const evidence = {
      programIdentity: search.programIdentity,
      bindings,
      context,
      search,
      ...(reused ? { reusedLookaheadSearch: true } : {}),
      ...(lookahead ? { lookahead } : {}),
    };
    if (!search.candidates.length)
      return {
        ...base,
        ...history,
        status: 'failed',
        cacheKey: key,
        evidence,
        reason: 'No mathematically admissible candidate in bounded search',
      };
    const eligible =
      lookahead?.policy.completion === 'require'
        ? search.candidates.filter((a) =>
            lookahead.branches.some(
              (b) => b.parent.id === a.id && b.completion === 'witnessed',
            ),
          )
        : search.candidates;
    if (!eligible.length)
      return {
        ...base,
        ...history,
        status: 'failed',
        cacheKey: key,
        evidence,
        alternatives: search.candidates,
        reason:
          'No retained parent has a witnessed required successor completion within the declared lookahead bounds',
      };
    let selected = eligible.reduce(
      (best, a) => (a.energy < best.energy ? a : best),
      eligible[0]!,
    );
    if (lookahead?.policy.parentTies === 'prefer-successor-targets') {
      const costs = (a: EnergyEvaluation) =>
        hash(
          a.factors.filter((f) => f.mode === 'preference').map((f) => f.energy),
        );
      const tied = costs(selected);
      selected =
        eligible.find(
          (a) =>
            costs(a) === tied &&
            lookahead.branches.some(
              (b) => b.parent.id === a.id && b.jointlySatisfied,
            ),
        ) ?? selected;
    }
    let selection: unknown = {
      policy: lookahead
        ? 'minimum parent preference energy among eligible paths; optional successor target guidance only on identical parent cost vectors'
        : 'minimum declared preference energy; deterministic ties',
      modelCalled: false,
    };
    if (stage.selection === 'local-selector' && eligible.length > 1) {
      const selector = this.request.selector!;
      const alternatives = eligible.slice(
        0,
        selector.readout === 'balanced' ? 6 : 16,
      );
      const passes = selector.readout === 'balanced' ? alternatives.length : 1;
      if (
        this.statistics.selectorCalls + 1 >
          this.request.workflow.budgets.maxSelectorCalls ||
        this.statistics.requestedReadoutPasses + passes >
          this.request.workflow.budgets.maxReadoutPasses
      )
        return {
          ...base,
          ...history,
          status: 'failed',
          cacheKey: key,
          alternatives: search.candidates,
          evidence,
          reason: 'Selector call/readout budget exhausted',
        };
      this.statistics.selectorCalls++;
      this.statistics.requestedReadoutPasses += passes;
      if (this.hooks) this.statistics.testSelectorCalls++;
      else this.statistics.neuralCalls++;
      try {
        const request: SelectionRequest = {
          ...selector,
          payload: {
            state: {
              stage: stage.id,
              purpose: stage.purpose,
              brief: program.brief,
              context,
              bindings,
              scope: pendingScope,
              variables: selectorVariables(compiled.program),
              consequenceSummary: {
                limit: preferenceSummaryLimit,
                order:
                  'largest worst-scenario normalized residual first; source-bound full factors remain in the receipt',
              },
              ...(lookahead
                ? {
                    lookahead: {
                      completion: lookahead.policy.completion,
                      parentTies: lookahead.policy.parentTies,
                      scope: lookahead.scope,
                      successorVariables: Object.fromEntries(
                        stage.lookahead!.successors.map((id) => [
                          id,
                          selectorVariables(this.stages.get(id)!.program),
                        ]),
                      ),
                    },
                  }
                : {}),
            },
            question: stage.question,
            options: alternatives.map((candidate, i) => {
              const summary = preferenceSummary(
                compiled.program,
                candidate.factors,
              );
              return {
                id: `alternative-${i}`,
                description: JSON.stringify({
                  assignment: candidate.assignment,
                  preferences: summary.rows,
                  omittedPreferenceFactors: summary.omitted,
                  hardGuards: 'passed in every declared scenario',
                  ...(lookahead
                    ? {
                        successors:
                          lookahead.branches
                            .find((b) => b.parent.id === candidate.id)
                            ?.successors.map((s) => {
                              const witness = s.search?.witness;
                              const childSummary = preferenceSummary(
                                this.stages.get(s.stage)!.program,
                                witness?.factors ?? [],
                                true,
                              );
                              return {
                                stage: s.stage,
                                outcome: s.outcome,
                                completeSearch:
                                  s.search?.statistics.complete ?? null,
                                witness: witness?.assignment ?? null,
                                jointlySatisfied:
                                  witness?.preferenceTargetsSatisfied ?? null,
                                preferenceViolations: childSummary.rows,
                                omittedViolatedFactors: childSummary.omitted,
                                reason: s.reason ?? null,
                              };
                            }) ?? 'not inspected within branch budget',
                      }
                    : {}),
                }),
              };
            }),
          },
        };
        const readout = await (this.hooks
          ? this.hooks.testSelector(request)
          : this.session!.select(request));
        this.statistics.completedReadoutPasses += passes;
        const index = request.payload.options.findIndex(
          (o) => o.id === readout.selected,
        );
        if (index < 0)
          throw new Error('Selector returned unknown mathematical alternative');
        selected = alternatives[index]!;
        selection = {
          ...readout,
          modelCalled: !this.hooks,
          testInjected: Boolean(this.hooks),
          requestedReadoutPasses: passes,
        };
      } catch (error) {
        if (this.execution.signal?.aborted) throw error;
        return {
          ...base,
          ...history,
          status: 'failed',
          cacheKey: key,
          alternatives: search.candidates,
          evidence,
          reason: `Selector failed: ${String(error)}`,
        };
      }
    }
    this.save(stage.id, key, {
      kind: 'chosen',
      assignment: selected.assignment,
      alternatives: search.candidates.map((c) => c.assignment),
      selection,
      evidence,
      ...(lookahead
        ? { continuation: this.continuation(stage, selected, lookahead) }
        : {}),
    });
    return {
      ...base,
      ...history,
      status: 'chosen',
      cacheKey: key,
      assignment: selected.assignment,
      alternatives: search.candidates,
      selection,
      evidence,
      ...(invalidation ? { reason: invalidation } : {}),
    };
  }
  private save(
    id: string,
    key: string,
    payload: z.infer<typeof CachePayloadSchema>,
  ) {
    this.entries[id] = { key, digest: hash(payload), payload };
  }
}
export function compileDecisionWorkflow(
  input: DecisionWorkflowInput,
  testHooks?: DecisionWorkflowTestHooks,
  execution: SelectorExecutionOptions = {},
) {
  return new DecisionWorkflowMachine(input, testHooks, execution);
}
export async function runDecisionWorkflow(
  input: DecisionWorkflowInput,
  testHooks?: DecisionWorkflowTestHooks,
  execution: SelectorExecutionOptions = {},
) {
  return compileDecisionWorkflow(input, testHooks, execution).run();
}
