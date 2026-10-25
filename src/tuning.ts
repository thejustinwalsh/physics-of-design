import { z } from 'zod';
import { StateSchema } from './state.js';
import { hash } from './identity.js';
import { measurementKey } from './measurement.js';

const receipt = z
  .object({
    inputHash: z.string().length(64),
    feasible: z.boolean(),
    engine: z.string(),
  })
  .passthrough();
const candidate = z
  .object({
    id: z.enum(['left', 'right']),
    state: StateSchema,
    stateHash: z.string().length(64),
    measurements: z.array(receipt).min(1),
    images: z.array(z.string()).min(1),
  })
  .passthrough();
export const TuningManifestSchema = z
  .object({
    version: z.literal(1),
    rights: z.string().min(1),
    pairs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            projectId: z.string().min(1),
            split: z.enum(['train', 'held-out']),
            criterion: z.string().min(1),
            candidates: z.array(candidate).length(2),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export const TeacherRatingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    rater: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('synthetic-astra'),
          agent: z.string().min(1),
          model: z.string().min(1),
          skillCommit: z.string().min(1),
        })
        .strict(),
      z.object({ kind: z.literal('human'), id: z.string().min(1) }).strict(),
    ]),
    ratings: z.array(
      z
        .object({
          pairId: z.string(),
          choice: z.enum(['left', 'right', 'tie', 'abstain']),
          reason: z.string().min(1),
          evidenceImages: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();
export const TuningExportSchema = z
  .object({
    manifest: TuningManifestSchema,
    ratings: z.array(TeacherRatingsSchema).min(1),
    renderWidths: z.array(z.number().positive()).min(1).max(12),
    evidenceRoot: z.string().default(''),
  })
  .strict();

export function exportTuning(input: unknown) {
  const { manifest, ratings, renderWidths, evidenceRoot } =
    TuningExportSchema.parse(input);
  // Logical POSIX evidence identities; no file access and no basename-only joins.
  const safeRelative = (value: string) => {
    if (
      !value ||
      value.startsWith('/') ||
      value.includes('\\') ||
      value.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new Error(
        'Evidence paths must be normalized relative identities without traversal',
      );
    return value;
  };
  if (evidenceRoot) safeRelative(evidenceRoot);
  const imageId = (value: string) => {
    const relative = safeRelative(value);
    return !evidenceRoot || relative.startsWith(evidenceRoot + '/')
      ? relative
      : evidenceRoot + '/' + relative;
  };
  const pairs = new Map(manifest.pairs.map((pair) => [pair.id, pair]));
  if (pairs.size !== manifest.pairs.length)
    throw new Error('Duplicate tuning pair');
  const splits = new Map<string, string>();
  for (const pair of manifest.pairs) {
    const previous = splits.get(pair.projectId);
    if (previous && previous !== pair.split)
      throw new Error('Project leakage across tuning splits');
    splits.set(pair.projectId, pair.split);
    if (new Set(pair.candidates.map((c) => c.id)).size !== 2)
      throw new Error('Both left and right candidates are required');
    const content = (state: z.infer<typeof StateSchema>) =>
      hash(
        state.blocks.map((block) => ({
          id: block.id,
          text: block.text,
          role: block.role,
          language: block.language,
        })),
      );
    if (
      content(pair.candidates[0]!.state) !== content(pair.candidates[1]!.state)
    )
      throw new Error('Tuning alternatives must preserve ordered content');
    for (const c of pair.candidates) {
      if (hash(c.state) !== c.stateHash)
        throw new Error(`Stale tuning state: ${pair.id}/${c.id}`);
      if (
        c.images.length !== renderWidths.length ||
        new Set(c.images.map(imageId)).size !== c.images.length
      )
        throw new Error(
          'Candidate images must uniquely cover every declared render width',
        );
      if (c.measurements.length !== renderWidths.length)
        throw new Error('Receipt widths must be explicit and complete');
      for (const [index, m] of c.measurements.entries()) {
        const state = structuredClone(c.state);
        state.viewport.width = renderWidths[index]!;
        if (!m.feasible || m.inputHash !== measurementKey(state))
          throw new Error(
            `Unverified/stale candidate receipt: ${pair.id}/${c.id}`,
          );
      }
    }
  }
  for (const pair of manifest.pairs) {
    const images = pair.candidates.flatMap((c) => c.images.map(imageId));
    if (new Set(images).size !== images.length)
      throw new Error(
        'Candidate image identities must be distinct within a tuning pair',
      );
  }
  const seen = new Set<string>(),
    examples = [],
    excluded = [];
  for (const file of ratings)
    for (const rating of file.ratings) {
      const pair = pairs.get(rating.pairId);
      if (!pair) throw new Error(`Orphan teacher rating: ${rating.pairId}`);
      const expectedImages = new Set(
        pair.candidates.flatMap((c) => c.images.map(imageId)),
      );
      const suppliedImages = new Set(rating.evidenceImages.map(imageId));
      if (
        suppliedImages.size !== rating.evidenceImages.length ||
        rating.evidenceImages.some(
          (image) => !expectedImages.has(imageId(image)),
        ) ||
        (rating.choice !== 'abstain' &&
          suppliedImages.size !== expectedImages.size)
      )
        throw new Error(
          'Rating evidence images must match both candidates and all supplied views; abstentions may omit evidence',
        );
      const key = hash({ rater: file.rater, pair: pair.id });
      if (seen.has(key)) throw new Error('Duplicate rater/pair observation');
      seen.add(key);
      if (rating.choice === 'tie' || rating.choice === 'abstain') {
        excluded.push({
          pairId: pair.id,
          rater: file.rater,
          choice: rating.choice,
          reason: rating.reason,
          evidenceImages: rating.evidenceImages,
          evidenceImageIds: rating.evidenceImages.map(imageId),
        });
        continue;
      }
      examples.push({
        pairId: pair.id,
        projectId: pair.projectId,
        split: pair.split,
        teacher: file.rater,
        criterion: pair.criterion,
        candidates: pair.candidates.map((c) => ({
          id: c.id,
          state: c.state,
          stateHash: c.stateHash,
          receiptHashes: c.measurements.map((m) => m.inputHash),
        })),
        chosen: rating.choice,
        reason: rating.reason,
        evidenceImages: rating.evidenceImages,
        evidenceImageIds: rating.evidenceImages.map(imageId),
      });
    }
  return {
    schemaVersion: 1,
    kind: 'preference-training-export',
    rights: manifest.rights,
    manifestHash: hash(manifest),
    evidenceRoot,
    examples,
    excluded,
    counts: {
      pairs: pairs.size,
      projects: splits.size,
      examples: examples.length,
      excluded: excluded.length,
      synthetic: examples.filter((e) => e.teacher.kind === 'synthetic-astra')
        .length,
      human: examples.filter((e) => e.teacher.kind === 'human').length,
    },
    limits: [
      'Synthetic labels remain synthetic. Do not pool them into human preference evaluation.',
      'Held-out projects stay held out. No model fitting or coefficient tuning is performed by export.',
      'Receipt identity and declared feasibility are checked; this is not cryptographic proof of an untrusted renderer.',
      'This small reviewed batch supports pipeline mechanics, not validated aesthetic learning or readiness for a particular training regime.',
    ],
  };
}
