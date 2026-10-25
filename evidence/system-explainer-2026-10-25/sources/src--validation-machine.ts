import { z } from 'zod';
import { createActor, createMachine, assign } from 'xstate';
import { hash } from './identity.js';

const Id = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const Identity = z.string().regex(/^[a-f0-9]{64}$/);
export const ValidationPlanSchema = z
  .object({
    version: z.literal(1),
    id: Id,
    designIdentity: Identity,
    scenarios: z
      .array(
        z
          .object({
            id: Id,
            platform: z.enum(['web', 'native-ios', 'native-android']),
            width: z.number().finite().positive(),
            height: z.number().finite().positive(),
            textScale: z.number().finite().min(0.5).max(5),
            colorScheme: z.enum(['light', 'dark']),
            reducedMotion: z.boolean(),
            contentId: z.string().min(1).max(200),
            source: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    phases: z
      .array(
        z
          .object({
            id: Id,
            purpose: z.string().min(1).max(1000),
            requirements: z
              .array(
                z
                  .object({
                    id: Id,
                    scenario: Id,
                    tool: z.string().min(1).max(100),
                    inputIdentity: Identity,
                    evidenceKind: z.enum([
                      'deterministic',
                      'human-review',
                      'synthetic-review',
                    ]),
                    unsupportedPolicy: z
                      .enum(['block', 'record'])
                      .default('block'),
                    rationale: z.string().min(1).max(1000),
                  })
                  .strict(),
              )
              .min(1)
              .max(64),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict()
  .superRefine((p, ctx) => {
    const scenarios = new Set(p.scenarios.map((s) => s.id)),
      phases = new Set(p.phases.map((s) => s.id)),
      ids = new Set<string>();
    if (
      scenarios.size !== p.scenarios.length ||
      phases.size !== p.phases.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate scenario or phase identity',
      });
    if (p.phases.reduce((n, x) => n + x.requirements.length, 0) > 512)
      ctx.addIssue({ code: 'custom', message: 'At most512 requirements' });
    for (const phase of p.phases)
      for (const r of phase.requirements) {
        if (ids.has(r.id))
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate requirement ${r.id}`,
          });
        ids.add(r.id);
        if (!scenarios.has(r.scenario))
          ctx.addIssue({
            code: 'custom',
            message: `Unknown scenario ${r.scenario}`,
          });
      }
  });
export type ValidationPlan = z.infer<typeof ValidationPlanSchema>;
export const ValidationReceiptSchema = z
  .object({
    requirement: Id,
    planIdentity: Identity,
    designIdentity: Identity,
    inputIdentity: Identity,
    tool: z.string().min(1).max(100),
    evidenceKind: z.enum(['deterministic', 'human-review', 'synthetic-review']),
    outcome: z.enum(['pass', 'fail', 'unknown', 'unsupported']),
    resultRef: z.string().min(1).max(2048),
    observedAt: z.string().datetime(),
    detail: z.string().min(1).max(2000),
  })
  .strict();
type Receipt = z.infer<typeof ValidationReceiptSchema>;
type Receipts = readonly Readonly<Receipt>[];
type ValidationContext = { receipts: Receipts; receiptError: string | null };
export const ValidationCheckSchema = z
  .object({
    plan: ValidationPlanSchema,
    receipts: z.array(ValidationReceiptSchema).max(512).default([]),
    advance: z.number().int().min(0).max(16).default(0),
  })
  .strict();
export function describeValidationPlan(input: unknown) {
  const plan = ValidationPlanSchema.parse(input);
  return {
    plan,
    identity: hash(plan),
    requirements: plan.phases.flatMap((p) =>
      p.requirements.map((r) => ({
        ...r,
        phase: p.id,
        scenario: plan.scenarios.find((s) => s.id === r.scenario)!,
      })),
    ),
    scope:
      'Authored scenario/phase coverage, not automatic exhaustive responsive coverage. Each required receipt must bind the current plan, design and tool input.',
  };
}
function inspectPhase(
  plan: ValidationPlan,
  identity: string,
  phase: ValidationPlan['phases'][number],
  receipts: Receipts,
) {
  const requirements = phase.requirements.map((r) => {
    const receipt = receipts.find((x) => x.requirement === r.id);
    const status = !receipt
      ? 'missing'
      : receipt.planIdentity !== identity ||
          receipt.designIdentity !== plan.designIdentity ||
          receipt.inputIdentity !== r.inputIdentity
        ? 'stale'
        : receipt.tool !== r.tool || receipt.evidenceKind !== r.evidenceKind
          ? 'wrong-evidence'
          : receipt.outcome === 'unsupported' &&
              r.unsupportedPolicy === 'record'
            ? 'recorded-unsupported'
            : receipt.outcome;
    return {
      ...r,
      status,
      resultRef: receipt?.resultRef ?? null,
      detail: receipt?.detail ?? null,
    };
  });
  return {
    id: phase.id,
    purpose: phase.purpose,
    ready: requirements.every(
      (r) => r.status === 'pass' || r.status === 'recorded-unsupported',
    ),
    requirements,
  };
}
/** A planning gate around caller-supplied receipts, never a new factual verifier. */
export function createValidationActor(input: unknown) {
  const request = ValidationCheckSchema.parse(input),
    plan = request.plan,
    identity = hash(plan);
  const known = new Set(
    plan.phases.flatMap((p) => p.requirements.map((r) => r.id)),
  );
  function validateReceipts(receipts: Receipt[]) {
    const ids = new Set<string>();
    for (const r of receipts) {
      if (!known.has(r.requirement))
        throw new Error(`Unknown validation requirement ${r.requirement}`);
      if (ids.has(r.requirement))
        throw new Error(`Duplicate validation receipt ${r.requirement}`);
      ids.add(r.requirement);
    }
    return receipts;
  }
  validateReceipts(request.receipts);
  const immutableReceipts = (receipts: Receipt[]): Receipts =>
    Object.freeze(receipts.map((r) => Object.freeze({ ...r })));
  const freezeContext = ({ context }: { context: ValidationContext }) => {
    Object.freeze(context);
  };
  const states: Record<string, object> = { complete: { entry: freezeContext } };
  for (let i = 0; i < plan.phases.length; i++)
    states[`phase${i}`] = {
      entry: freezeContext,
      on: {
        ADVANCE: {
          target: i === plan.phases.length - 1 ? 'complete' : `phase${i + 1}`,
          guard: ({ context }: { context: ValidationContext }) =>
            plan.phases
              .slice(0, i + 1)
              .every(
                (phase) =>
                  inspectPhase(plan, identity, phase, context.receipts).ready,
              ),
        },
      },
    };
  const machine = createMachine({
    types: {} as {
      context: ValidationContext;
      events: { type: 'ADVANCE' } | { type: 'RECEIPTS'; receipts: Receipt[] };
    },
    id: plan.id,
    initial: 'phase0',
    context: {
      receipts: immutableReceipts(request.receipts),
      receiptError: null,
    },
    states,
    // Receipt updates restart the gate: a later phase cannot keep an old pass
    // after an earlier receipt changes or fails.
    on: {
      RECEIPTS: {
        target: '.phase0',
        actions: assign(({ event }): ValidationContext => {
          try {
            return {
              receipts: immutableReceipts(
                validateReceipts(
                  z
                    .array(ValidationReceiptSchema)
                    .max(512)
                    .parse(event.receipts),
                ),
              ),
              receiptError: null,
            };
          } catch (error) {
            return {
              receipts: immutableReceipts([]),
              receiptError:
                error instanceof Error ? error.message : String(error),
            };
          }
        }),
      },
    },
  });
  return {
    actor: createActor(machine),
    plan: structuredClone(plan),
    identity,
    inspect: (receipts: Receipts) =>
      plan.phases.map((p) => inspectPhase(plan, identity, p, receipts)),
  };
}
export function checkValidation(input: unknown) {
  const request = ValidationCheckSchema.parse(input),
    { actor, plan, identity, inspect } = createValidationActor(request);
  actor.start();
  try {
    for (let i = 0; i < request.advance; i++) actor.send({ type: 'ADVANCE' });
    const snapshot = actor.getSnapshot(),
      phases = inspect(snapshot.context.receipts);
    const current =
      snapshot.value === 'complete'
        ? null
        : phases[Number(String(snapshot.value).replace('phase', ''))]!;
    return {
      planIdentity: identity,
      designIdentity: plan.designIdentity,
      state: current?.id ?? 'complete',
      complete: snapshot.value === 'complete',
      phases,
      next:
        current?.requirements.filter(
          (r) => r.status !== 'pass' && r.status !== 'recorded-unsupported',
        ) ?? [],
      recordedUnsupported: phases.flatMap((p) =>
        p.requirements.filter((r) => r.status === 'recorded-unsupported'),
      ),
      neuralCalls: 0,
      scope:
        'XState phase guards require current matching receipt declarations. They do not execute tools, inspect or authenticate receipt files, infer missing permutations, certify aesthetics or replace deterministic validators. Synthetic review cannot satisfy a human-review requirement.',
    };
  } finally {
    actor.stop();
  }
}
