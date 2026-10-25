import { z } from 'zod';
import { createActor, createMachine, assign } from 'xstate';
import {
  EnergyProgramSchema,
  ExpressionSchema,
  compileEnergy,
  evaluateExpression,
  expressionRefs,
  validateExpression,
  type Assignment,
  type EnergyProgram,
} from './energy.js';
import { resolveDesignRuntime } from './decision-runtime.js';
import { hash } from './identity.js';
const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);
export const DesignMachineSpecSchema = z
  .object({
    id: Id,
    initial: Id,
    content: z
      .record(
        Id,
        z
          .object({
            default: z.string().max(2000),
            compact: z.string().max(2000),
            source: z.string().min(1),
          })
          .strict(),
      )
      .default({}),
    states: z
      .array(
        z
          .object({
            id: Id,
            purpose: z.string().min(1),
            regions: z
              .array(
                z
                  .object({
                    id: Id,
                    role: z.string().min(1),
                    bindings: z.record(Id, ExpressionSchema),
                  })
                  .strict(),
              )
              .max(40),
            on: z
              .array(
                z
                  .object({
                    event: Id,
                    target: Id,
                    when: ExpressionSchema.optional(),
                    motion: z.string().min(1).optional(),
                  })
                  .strict(),
              )
              .max(40),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    motions: z
      .record(
        Id,
        z
          .object({
            stiffness: ExpressionSchema,
            damping: ExpressionSchema,
            mass: ExpressionSchema,
            channel: z.enum(['translateX', 'translateY', 'scale', 'opacity']),
            reducedMotion: z.enum(['instant', 'opacity-fade']),
          })
          .strict(),
      )
      .default({}),
    buildContract: z
      .object({
        layout: z.literal('flex'),
        web: z.literal('React + StyleX'),
        native: z.literal('React Native Text + Yoga'),
        requirements: z.array(z.string().min(1)).min(1),
      })
      .strict(),
  })
  .strict();
export const DesignHandoffSchema = z
  .object({
    program: EnergyProgramSchema,
    assignment: z.record(Id, z.number().finite()),
    machine: DesignMachineSpecSchema,
  })
  .strict();
export type DesignHandoffInput = z.input<typeof DesignHandoffSchema>;
type Machine = z.infer<typeof DesignMachineSpecSchema>;
function validateMachine(spec: Machine, program: EnergyProgram) {
  const ids = new Set(spec.states.map((s) => s.id));
  if (ids.size !== spec.states.length || !ids.has(spec.initial))
    throw new Error(
      'Machine requires unique states and an existing initial state',
    );
  const inputs = new Set([
    ...program.variables.map((v) => v.id),
    ...program.derived.map((v) => v.id),
    ...Object.keys(program.scenarios[0]!.values),
  ]);
  function check(e: z.infer<typeof ExpressionSchema>) {
    validateExpression(e);
    for (const r of expressionRefs(e))
      if (!inputs.has(r)) throw new Error(`Unknown machine input ${r}`);
  }
  for (const state of spec.states) {
    if (new Set(state.regions.map((x) => x.id)).size !== state.regions.length)
      throw new Error('Region IDs must be unique within a state');
    if (new Set(state.on.map((x) => x.event)).size !== state.on.length)
      throw new Error('Ambiguous event: use one transition per state/event');
    for (const region of state.regions)
      Object.values(region.bindings).forEach(check);
    for (const t of state.on) {
      if (!ids.has(t.target) || t.event === 'REFLOW')
        throw new Error('Unknown target or reserved REFLOW event');
      if (t.motion && !Object.hasOwn(spec.motions, t.motion))
        throw new Error(`Unknown motion ${t.motion}`);
      if (t.when !== undefined) check(t.when);
    }
  }
  for (const m of Object.values(spec.motions)) {
    check(m.mass);
    check(m.stiffness);
    check(m.damping);
  }
}
function resolveValidated(
  program: EnergyProgram,
  assignment: Assignment,
  machine: Machine,
  scenario: Assignment,
) {
  return resolveDesignRuntime({ program, assignment, machine }, scenario);
}
export function compileDesignBindings(
  program: EnergyProgram,
  machine: z.input<typeof DesignMachineSpecSchema>,
) {
  const p = compileEnergy(program).program,
    spec = DesignMachineSpecSchema.parse(machine);
  validateMachine(spec, p);
  return (assignment: Assignment) => {
    for (const s of p.scenarios)
      resolveValidated(p, assignment, spec, s.values);
  };
}
export function createDesignHandoff(input: DesignHandoffInput) {
  const r = DesignHandoffSchema.parse(input),
    compiled = compileEnergy(r.program),
    evaluation = compiled.evaluate(r.assignment),
    spec = r.machine;
  if (evaluation.hardFailures)
    throw new Error('Cannot hand off a mathematically rejected assignment');
  validateMachine(spec, compiled.program);
  for (const s of compiled.program.scenarios) {
    const facts = resolveValidated(
      compiled.program,
      r.assignment,
      spec,
      s.values,
    );
    for (const state of spec.states)
      for (const t of state.on)
        if (t.when !== undefined) evaluateExpression(t.when, facts.values);
  }
  const body = {
    version: 1 as const,
    engine: 'design-handoff-v1' as const,
    program: compiled.program,
    programIdentity: compiled.identity,
    machine: spec,
    assignment: r.assignment,
    decisions: compiled.program.variables.map((v) => ({
      variable: v.id,
      chosen: r.assignment[v.id]!,
      alternatives: v.values.filter((x) => x !== r.assignment[v.id]),
      locked: v.locked !== undefined,
    })),
    verification: {
      status: 'pending-renderer-verification' as const,
      required: [
        'Actual browser/native text and Yoga geometry at supported widths and text scales',
        'Semantic accessibility, contrast and reduced-motion behavior',
        'Visual/task critique against the product brief',
      ],
    },
    scope:
      'Resolved design choice machine. Energy expresses this brief; it does not certify quality, renderer feasibility or an optimum.',
  };
  return { ...body, identity: hash(body) };
}
export type DesignHandoff = ReturnType<typeof createDesignHandoff>;
export const ReplayHandoffSchema = z
  .object({
    program: EnergyProgramSchema,
    machine: DesignMachineSpecSchema,
    recipe: z.unknown(),
    scenario: z.record(Id, z.number().finite()),
  })
  .strict();
export function replayDesignHandoff(
  input: z.input<typeof ReplayHandoffSchema>,
) {
  const r = ReplayHandoffSchema.parse(input),
    recipe = z
      .object({
        identity: z.string(),
        programIdentity: z.string(),
        assignment: z.record(Id, z.number().finite()),
      })
      .passthrough()
      .parse(r.recipe),
    compiled = compileEnergy(r.program);
  if (compiled.identity !== recipe.programIdentity)
    return {
      status: 'invalidated' as const,
      reason:
        'Program, brief, policy, runtime identity, domain or scenario changed',
      selectorCalls: 0,
    };
  const expected = createDesignHandoff({
    program: r.program,
    machine: r.machine,
    assignment: recipe.assignment,
  });
  if (
    expected.identity !== recipe.identity ||
    hash(expected) !== hash(r.recipe)
  )
    return {
      status: 'invalidated' as const,
      reason: 'Machine or recipe changed',
      selectorCalls: 0,
    };
  const resolved = resolveValidated(
    expected.program,
    expected.assignment,
    expected.machine,
    r.scenario,
  );
  return {
    status: resolved.admissible
      ? ('replayed' as const)
      : ('requires-search' as const),
    handoffIdentity: expected.identity,
    resolved,
    selectorCalls: 0,
    energySearches: 0,
    rendererVerification: 'pending' as const,
  };
}
export function resolveHandoff(handoff: DesignHandoff, scenario: Assignment) {
  const verified = createDesignHandoff({
    program: handoff.program,
    assignment: handoff.assignment,
    machine: handoff.machine,
  });
  if (verified.identity !== handoff.identity)
    throw new Error('Handoff identity mismatch');
  return resolveValidated(
    verified.program,
    verified.assignment,
    verified.machine,
    scenario,
  );
}
/** Runtime navigation uses actual XState v5, with branch guards on fresh facts. */
export function createDesignActor(
  handoff: DesignHandoff,
  scenario: Assignment,
) {
  const verified = structuredClone(
    createDesignHandoff({
      program: handoff.program,
      assignment: handoff.assignment,
      machine: handoff.machine,
    }),
  );
  if (verified.identity !== handoff.identity)
    throw new Error('Handoff identity mismatch');
  const initial = resolveValidated(
    verified.program,
    verified.assignment,
    verified.machine,
    scenario,
  );
  if (!initial.admissible)
    throw new Error(
      'Runtime geometry violates handoff applicability; search/refine before building',
    );
  const nodeIds = new Map(
    verified.machine.states.map((s, i) => [s.id, `design_node_${i}`]),
  );
  const states = Object.fromEntries(
    verified.machine.states.map((s) => [
      s.id,
      {
        id: nodeIds.get(s.id)!,
        on: Object.fromEntries([
          [
            'REFLOW',
            {
              actions: assign(
                ({
                  context,
                  event,
                }: {
                  context: {
                    facts: typeof initial;
                    reflow: { status: string; reason: string | null };
                  };
                  event: { type: string; scenario?: Assignment };
                }) => {
                  try {
                    if (!event.scenario)
                      throw new Error('REFLOW requires scenario');
                    const next = resolveValidated(
                      verified.program,
                      verified.assignment,
                      verified.machine,
                      event.scenario,
                    );
                    if (!next.admissible)
                      return {
                        reflow: {
                          status: 'requires-search',
                          reason:
                            next.failures.join(',') ||
                            next.outsideEnvelope.join(','),
                        },
                      };
                    return {
                      facts: next,
                      reflow: { status: 'resolved', reason: null },
                    };
                  } catch (error) {
                    return {
                      reflow: { status: 'rejected', reason: String(error) },
                    };
                  }
                },
              ),
            },
          ],
          ...s.on.map((t) => [
            t.event,
            {
              target: `#${nodeIds.get(t.target)!}`,
              ...(t.when !== undefined
                ? {
                    guard: ({
                      context,
                    }: {
                      context: { facts: typeof initial };
                    }) =>
                      evaluateExpression(t.when!, context.facts.values) !== 0,
                  }
                : {}),
              ...(t.motion ? { description: `motion:${t.motion}` } : {}),
            },
          ]),
        ]),
      },
    ]),
  );
  return createActor(
    createMachine({
      id: verified.machine.id,
      initial: verified.machine.initial,
      context: {
        facts: initial,
        reflow: { status: 'resolved', reason: null as string | null },
      },
      states,
    }),
  );
}
