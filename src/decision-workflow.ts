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
} from './energy.js';
import {
  SelectorProfileSchema,
  prepareLocalOptionsSession,
  selectLocalOptions,
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
const CachePayloadSchema = z
  .object({
    kind: z.enum(['chosen', 'skipped']),
    assignment: z.record(Id, z.number().finite()).nullable(),
    alternatives: z.array(z.record(Id, z.number().finite())).max(24),
    selection: z.unknown(),
    evidence: z.unknown(),
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
}
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
      sum + EnergySearchOptionsSchema.parse(s.options ?? {}).maxEvaluations,
    0,
  );
  if (
    reserved > request.workflow.budgets.maxEvaluations ||
    reserved > request.workflow.budgets.maxGraphNodes
  )
    throw new Error(
      'Declared stage search budgets exceed workflow evaluation/graph budget',
    );
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
  };
  constructor(input: DecisionWorkflowInput, hooks?: DecisionWorkflowTestHooks) {
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
      );
      this.checkpoint = this.session.checkpointHash;
      this.statistics.checkpointHashes++;
    }
    const bindings: Assignment = Object.fromEntries(
      stage.bindings.map((b) => [
        b.input,
        this.results[b.stage]!.assignment![b.variable]!,
      ]),
    );
    const program = structuredClone(stage.program);
    for (const scenario of program.scenarios)
      Object.assign(scenario.values, bindings);
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
    const search = searchEnergy({ program, options });
    this.statistics.searches++;
    this.statistics.evaluated += search.statistics.evaluated;
    this.statistics.factorEvaluations += search.statistics.factorEvaluations;
    this.statistics.graphNodes += search.choiceGraph.nodes.length;
    const evidence = {
      programIdentity: search.programIdentity,
      bindings,
      context,
      search,
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
    let selected = search.candidates[0]!;
    let selection: unknown = {
      policy: 'minimum declared preference energy; deterministic ties',
      modelCalled: false,
    };
    if (stage.selection === 'local-selector' && search.candidates.length > 1) {
      const selector = this.request.selector!;
      const alternatives = search.candidates.slice(
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
            },
            question: stage.question,
            options: alternatives.map((candidate, i) => ({
              id: `alternative-${i}`,
              description: JSON.stringify({
                assignment: candidate.assignment,
                preferences: [
                  ...new Set(
                    candidate.factors
                      .filter((f) => f.mode === 'preference')
                      .map((f) => f.id),
                  ),
                ].map((id) => {
                  const rows = candidate.factors.filter((f) => f.id === id);
                  return {
                    id,
                    values: [
                      Math.min(...rows.map((f) => f.value)),
                      Math.max(...rows.map((f) => f.value)),
                    ],
                    maxResidual: Math.max(...rows.map((f) => f.residual)),
                    source: rows[0]!.provenance.source,
                  };
                }),
                hardGuards: 'passed in every declared scenario',
              }),
            })),
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
) {
  return new DecisionWorkflowMachine(input, testHooks);
}
export async function runDecisionWorkflow(
  input: DecisionWorkflowInput,
  testHooks?: DecisionWorkflowTestHooks,
) {
  return compileDecisionWorkflow(input, testHooks).run();
}
