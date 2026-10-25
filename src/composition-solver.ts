import { hash } from './identity.js';
import { z } from 'zod';
import {
  EnergyProgramSchema,
  EnergySearchOptionsSchema,
  searchEnergy,
} from './energy.js';
import {
  DesignMachineSpecSchema,
  createDesignHandoff,
  replayDesignHandoff,
  compileDesignBindings,
} from './decision-machine.js';
import {
  SelectorProfileSchema,
  selectLocalOptions,
  type SelectorExecutionOptions,
  checkpointDigest,
} from './selector.js';
export const CompositionSolveSchema = z
  .object({
    program: EnergyProgramSchema,
    machine: DesignMachineSpecSchema,
    options: EnergySearchOptionsSchema.optional(),
    recipe: z.unknown().optional(),
    selector: z
      .object({
        gguf: z.string().min(1),
        profile: SelectorProfileSchema.default('qwen3.5-4b'),
        readout: z.enum(['single', 'balanced']).default('single'),
        maxPromptTokens: z.number().int().min(512).max(16384).default(4096),
        auditDirectory: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
/** Fast search supplies the numeric field; the optional neural readout selects a local proposal only. */
export async function solveComposition(
  input: z.input<typeof CompositionSolveSchema>,
  execution: SelectorExecutionOptions = {},
) {
  const r = CompositionSolveSchema.parse(input);
  const policyIdentity = hash({
    version: 'composition-policy-v1',
    options: EnergySearchOptionsSchema.parse(r.options ?? {}),
    selector: r.selector
      ? {
          profile: r.selector.profile,
          readout: r.selector.readout,
          maxPromptTokens: r.selector.maxPromptTokens,
          checkpoint: await checkpointDigest(r.selector.gguf),
        }
      : 'mathematical',
  });
  const recipe = r.recipe
    ? z
        .object({
          version: z.literal(1),
          policyIdentity: z.string(),
          handoff: z.unknown(),
        })
        .strict()
        .safeParse(r.recipe)
    : null;
  if (recipe?.success && recipe.data.policyIdentity === policyIdentity) {
    const replay = replayDesignHandoff({
      program: r.program,
      machine: r.machine,
      recipe: recipe.data.handoff,
      scenario: r.program.scenarios[0]!.values,
    });
    if (replay.status === 'replayed')
      return {
        status: 'replayed',
        handoff: createDesignHandoff({
          program: r.program,
          machine: r.machine,
          assignment: Object.fromEntries(
            r.program.variables.map((v) => [
              v.id,
              replay.resolved.values[v.id]!,
            ]),
          ),
        }),
        replay,
        statistics: { selectorCalls: 0, evaluated: 0 },
        recipe: recipe.data,
        scope:
          'Existing mathematical choice path reused; real rendering remains required.',
      };
  }
  const validateAssignment = compileDesignBindings(r.program, r.machine);
  const search = searchEnergy(
    { program: r.program, ...(r.options ? { options: r.options } : {}) },
    { validateAssignment },
  );
  if (!search.candidates.length) return { ...search, handoff: null };
  let selected = search.candidates[0]!,
    selection: unknown = {
      policy: 'minimum brief energy with deterministic ties',
      modelCalled: false,
    };
  if (r.selector && search.candidates.length > 1) {
    const candidates = search.candidates.slice(
      0,
      r.selector.readout === 'balanced' ? 6 : 16,
    );
    const readout = await selectLocalOptions(
      {
        ...r.selector,
        payload: {
          state: {
            brief: r.program.brief,
            scope:
              'These are mathematically admissible proposals, not rendered/verified UI. Choose a local design direction; do not assert validity.',
            programIdentity: search.programIdentity,
          },
          question:
            'Which candidate best expresses the supplied brief, considering separate preference tensions and keeping expressive tension intentional?',
          options: candidates.map((c, i) => ({
            id: `path-${i}`,
            description: JSON.stringify({
              assignment: c.assignment,
              energy: c.energy,
              factors: [
                ...new Set(
                  c.factors
                    .filter((f) => f.mode === 'preference')
                    .map((f) => f.id),
                ),
              ].map((id) => {
                const rows = c.factors.filter((f) => f.id === id);
                return {
                  id,
                  valueRange: [
                    Math.min(...rows.map((f) => f.value)),
                    Math.max(...rows.map((f) => f.value)),
                  ],
                  maxResidual: Math.max(...rows.map((f) => f.residual)),
                };
              }),
            }),
          })),
        },
      },
      execution,
    );
    const index = Number(readout.selected.replace('path-', ''));
    if (!Number.isInteger(index) || !candidates[index])
      throw new Error('Selector returned unknown mathematical path');
    selected = candidates[index]!;
    selection = { ...readout, modelCalled: true };
  }
  const handoff = createDesignHandoff({
    program: r.program,
    machine: r.machine,
    assignment: selected.assignment,
  });
  return {
    status: 'proposed',
    handoff,
    recipe: { version: 1, policyIdentity, handoff },
    selection,
    selected: selected.id,
    candidates: search.candidates,
    pareto: search.pareto,
    rejected: search.rejected,
    invalid: search.invalid,
    trace: search.trace,
    choiceGraph: search.choiceGraph,
    statistics: {
      ...search.statistics,
      selectorCalls: r.selector && search.candidates.length > 1 ? 1 : 0,
    },
    scope: search.scope,
  };
}
