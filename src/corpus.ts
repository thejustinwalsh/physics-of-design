import { z } from 'zod';
import { StateSchema } from './state.js';
import { interval, rhythm } from './intervals.js';
import type { Renderer } from './measurement.js';

export const CorpusRecordSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    designer: z.string().min(1),
    source: z.string().min(1),
    attribution: z.string().min(1),
    year: z.number().int().min(1900).max(2200),
    genre: z.string().min(1),
    audience: z.string().min(1),
    stratum: z.enum([
      'award-winning',
      'production',
      'controlled-perturbation',
      'original-pilot',
    ]),
    awardEvidence: z.string().min(1).optional(),
    controlOf: z.string().min(1).optional(),
    split: z.enum(['calibration', 'validation', 'held-out']),
    rights: z
      .object({
        basis: z.enum(['original', 'license', 'permission', 'metadata-only']),
        license: z.string().min(1),
        evidence: z.string().min(1),
      })
      .strict(),
    state: StateSchema.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.stratum === 'award-winning' && !r.awardEvidence)
      ctx.addIssue({
        code: 'custom',
        message: 'award claims require source evidence',
      });
    if (r.stratum === 'controlled-perturbation' && !r.controlOf)
      ctx.addIssue({
        code: 'custom',
        message: 'perturbations require a control record',
      });
    if (r.rights.basis === 'metadata-only' && r.state)
      ctx.addIssue({
        code: 'custom',
        message:
          'metadata-only permission does not authorize reconstructing or rendering a design',
      });
  });
export const CorpusInputSchema = z
  .object({ records: z.array(CorpusRecordSchema).min(1) })
  .strict();
/** Enforce project-level holdout and attribution before using records in an experiment. */
export function validateCorpus(input: z.input<typeof CorpusInputSchema>) {
  const data = CorpusInputSchema.parse(input),
    ids = new Set<string>(),
    splits = new Map<string, string>();
  for (const r of data.records) {
    if (ids.has(r.id)) throw new Error(`duplicate corpus record ${r.id}`);
    ids.add(r.id);
    if (splits.has(r.projectId) && splits.get(r.projectId) !== r.split)
      throw new Error(`project ${r.projectId} leaks across dataset splits`);
    splits.set(r.projectId, r.split);
  }
  for (const r of data.records)
    if (r.controlOf) {
      const control = data.records.find((x) => x.id === r.controlOf);
      if (
        !control ||
        control.id === r.id ||
        control.controlOf ||
        control.projectId !== r.projectId
      )
        throw new Error(`invalid matched control for ${r.id}`);
    }
  return {
    valid: true,
    records: data.records.length,
    projects: splits.size,
    renderable: data.records.filter((r) => r.state).length,
    strata: Object.fromEntries(
      [
        'award-winning',
        'production',
        'controlled-perturbation',
        'original-pilot',
      ].map((s) => [s, data.records.filter((r) => r.stratum === s).length]),
    ),
    scope:
      'Recorded rights and attribution are caller attestations; this validator does not establish ownership or aesthetic merit.',
  };
}
export const CorpusAnalyzeSchema = CorpusInputSchema.extend({
  widths: z.array(z.number().positive().max(10000)).min(1).max(8),
  textScales: z
    .array(z.number().positive().max(5))
    .min(1)
    .max(3)
    .default([1, 2]),
  probes: z.boolean().default(true),
}).strict();
export async function analyzeCorpus(
  input: z.input<typeof CorpusAnalyzeSchema>,
  renderer: Renderer,
) {
  const request = CorpusAnalyzeSchema.parse(input),
    validation = validateCorpus({ records: request.records }),
    observations = [];
  for (const r of request.records) {
    if (!r.state) continue;
    for (const width of request.widths)
      for (const textScale of request.textScales) {
        const state = StateSchema.parse({
          ...r.state,
          viewport: { ...r.state.viewport, width, textScale },
        });
        const measurement = await renderer.measure(state, {
          probes: request.probes,
          spacing: true,
        });
        const title = state.blocks.find((b) => b.role === 'title')!,
          body = state.blocks.find((b) => b.role !== 'title')!;
        observations.push({
          recordId: r.id,
          projectId: r.projectId,
          split: r.split,
          stratum: r.stratum,
          width,
          textScale,
          measurement,
          features: {
            hierarchyLog2: interval(title.size, body.size),
            leading: state.blocks.map((b) => b.leading),
            trackingEm: state.blocks.map((b) => b.trackingEm),
            gaps: rhythm(state.gaps),
            blocks: measurement.blocks.map((b) => ({
              id: b.id,
              lineCount: b.lines.length,
              baselineCadenceProxy: b.lines
                .slice(1)
                .map((line, i) => line.y - b.lines[i]!.y),
              alignment: b.box.x,
              inlineBounds: b.inlineBounds,
              inkBounds: b.inkBounds,
              wrapThresholds: b.thresholds ?? null,
            })),
          },
        });
      }
  }
  return {
    validation,
    observations,
    scope:
      'Geometry/features from licensed or original renderable records. Line-top cadence is labeled a proxy; screenshots do not supply font metrics. No aesthetic or award-quality inference.',
  };
}
