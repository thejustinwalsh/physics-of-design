import { z } from 'zod';
import { cropMedia } from './composition-plan.js';

const unit = z.number().finite().min(0).max(1);
export const MediaRegionSchema = z
  .object({
    x: unit,
    y: unit,
    width: unit.min(1e-9),
    height: unit.min(1e-9),
  })
  .strict()
  .refine(
    (r) =>
      r.x < 1 &&
      r.y < 1 &&
      r.x + r.width <= 1 + 1e-12 &&
      r.y + r.height <= 1 + 1e-12,
    'Region must lie within normalized image bounds',
  );
export type MediaRegion = z.infer<typeof MediaRegionSchema>;
const point = z.object({ x: unit, y: unit }).strict();
export const MediaCropSchema = z
  .object({
    sourceWidth: z.number().int().min(1).max(100000),
    sourceHeight: z.number().int().min(1).max(100000),
    width: z.number().finite().min(1).max(100000),
    height: z.number().finite().min(1).max(100000),
    focal: point.nullable().default(null),
    target: point.default({ x: 0.5, y: 0.5 }),
    subjects: z.array(MediaRegionSchema).max(32).default([]),
    negativeSpaces: z.array(MediaRegionSchema).max(32).default([]),
    textRegion: MediaRegionSchema.nullable().default(null),
    weights: z
      .object({
        subjectLoss: z.number().finite().min(0).max(100).default(4),
        focalDisplacement: z.number().finite().min(0).max(100).default(1),
        negativeSpaceLoss: z.number().finite().min(0).max(100).default(1),
        textSubjectOverlap: z.number().finite().min(0).max(100).default(4),
      })
      .strict()
      .default({
        subjectLoss: 4,
        focalDisplacement: 1,
        negativeSpaceLoss: 1,
        textSubjectOverlap: 4,
      }),
  })
  .strict();
function intersection(a: MediaRegion, b: MediaRegion) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}
/** Finite cover-crop proposals. Regions are human-authored; no subject or salience detector runs. */
export function mediaCropCandidates(input: unknown) {
  const r = MediaCropSchema.parse(input);
  const focal = r.focal ?? { x: 0.5, y: 0.5 };
  const proposals = [
    { focal, target: r.target },
    ...[0, 0.5, 1].flatMap((x) =>
      [0, 0.5, 1].map((y) => ({ focal: { x, y }, target: { x, y } })),
    ),
  ];
  const seen = new Set<string>();
  const candidates = proposals.flatMap((proposal, index) => {
    const crop = cropMedia({
      sourceWidth: r.sourceWidth,
      sourceHeight: r.sourceHeight,
      width: r.width,
      height: r.height,
      focalX: proposal.focal.x,
      focalY: proposal.focal.y,
      targetX: proposal.target.x,
      targetY: proposal.target.y,
    });
    crop.focal = {
      x: crop.drawWidth * focal.x + crop.offsetX,
      y: crop.drawHeight * focal.y + crop.offsetY,
    };
    const key = `${crop.offsetX.toFixed(8)},${crop.offsetY.toFixed(8)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const visible: MediaRegion = {
      x: Math.max(0, -crop.offsetX / crop.drawWidth),
      y: Math.max(0, -crop.offsetY / crop.drawHeight),
      width: r.width / crop.drawWidth,
      height: r.height / crop.drawHeight,
    };
    const loss = (regions: MediaRegion[]) =>
      regions.length === 0
        ? null
        : regions.reduce(
            (sum, roi) =>
              sum +
              Math.max(
                0,
                1 - intersection(visible, roi) / (roi.width * roi.height),
              ),
            0,
          ) / regions.length;
    const textInSource =
      r.textRegion === null
        ? null
        : {
            x: visible.x + r.textRegion.x * visible.width,
            y: visible.y + r.textRegion.y * visible.height,
            width: r.textRegion.width * visible.width,
            height: r.textRegion.height * visible.height,
          };
    const penalties = {
      subjectLoss: loss(r.subjects),
      focalDisplacement:
        r.focal === null
          ? null
          : Math.min(
              1,
              Math.hypot(
                crop.focal.x / r.width - r.target.x,
                crop.focal.y / r.height - r.target.y,
              ) / Math.SQRT2,
            ),
      negativeSpaceLoss: loss(r.negativeSpaces),
      // Max avoids double counting overlapping authored subjects and remains in [0,1].
      textSubjectOverlap:
        textInSource === null || r.subjects.length === 0
          ? null
          : Math.max(
              ...r.subjects.map(
                (roi) =>
                  intersection(textInSource, roi) /
                  (textInSource.width * textInSource.height),
              ),
            ),
    };
    const weightedPenalty = (
      Object.keys(penalties) as (keyof typeof penalties)[]
    ).reduce((sum, name) => sum + (penalties[name] ?? 0) * r.weights[name], 0);
    return [
      {
        id: `crop-${index}`,
        ...crop,
        visibleSource: visible,
        penalties,
        weightedPenalty,
      },
    ];
  });
  candidates.sort(
    (a, b) => a.weightedPenalty - b.weightedPenalty || a.id.localeCompare(b.id),
  );
  return {
    candidates,
    weights: r.weights,
    authored: {
      focal: r.focal,
      target: r.target,
      subjects: r.subjects,
      negativeSpaces: r.negativeSpaces,
      textRegion: r.textRegion,
    },
    algorithm: 'authored-roi-cover-candidates-v1',
    scope:
      'Finite authored-target proposals; weighted penalties are editable policy, not quality or object-detection evidence. Null penalties mean the necessary annotation was not supplied. Overlap uses the largest individual subject, not a union.',
  };
}
