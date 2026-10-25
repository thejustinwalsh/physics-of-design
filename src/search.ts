import { hash } from './identity.js';
import {
  effectiveWidth,
  parseState,
  StateSchema,
  round,
  type DesignState,
  type LayoutMeasurement,
} from './state.js';
import { overlaps } from './graph.js';
import { fontAt } from './fonts.js';
import {
  policy,
  scoreRelations,
  trackingTarget,
  type Policy,
  type Relations,
} from './factors.js';
import { interval, makeCurve } from './intervals.js';
import type { Renderer } from './measurement.js';

export type Candidate = {
  id: string;
  state: DesignState;
  measurement: LayoutMeasurement;
  responsive: LayoutMeasurement[];
  relations: Relations;
  viable: boolean;
  pareto: boolean;
  changes: string[];
};
export type RelaxOptions = {
  maxCandidates?: number;
  widths?: number[];
  textScales?: number[];
  pinned?: string[];
  policy?: Policy;
};
export function dominates(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keys = Object.keys(a);
  if (
    keys.length !== Object.keys(b).length ||
    keys.some((k) => b[k] === undefined)
  )
    throw new Error('Pareto objective sets must match');
  return (
    keys.every((k) => a[k]! >= b[k]! - 1e-9) &&
    keys.some((k) => a[k]! > b[k]! + 1e-9)
  );
}
export function frontier<T extends { objectives: Record<string, number> }>(
  values: T[],
): T[] {
  return values.filter(
    (x, i) =>
      !values.some((y, j) => i !== j && dominates(y.objectives, x.objectives)),
  );
}
function editable(s: DesignState, p: string, pinned: string[]): boolean {
  return ![...s.locks, ...pinned].some((l) => overlaps(l, p));
}
export function couple(
  state: DesignState,
  density: number,
  sizeMultiplier: number,
  p: Policy,
  measurement?: LayoutMeasurement,
  pinned: string[] = [],
  hierarchyRatio?: number,
) {
  const s = structuredClone(state);
  const changes: string[] = [];
  const set = (pointer: string, apply: () => void) => {
    if (editable(s, pointer, pinned)) {
      apply();
      changes.push(pointer);
    }
  };
  const titleIndex = s.blocks.findIndex((b) => b.role === 'title');
  const proseIndex =
    s.blocks.findIndex((b) => b.role === 'prose') >= 0
      ? s.blocks.findIndex((b) => b.role === 'prose')
      : s.blocks.findIndex((b) => b.role === 'subtitle');
  const title = s.blocks[titleIndex]!;
  set(`/blocks/${titleIndex}/size`, () => {
    title.size = round(title.size * sizeMultiplier);
  });
  if (hierarchyRatio !== undefined) {
    if (editable(s, `/blocks/${proseIndex}/size`, pinned))
      set(`/blocks/${proseIndex}/size`, () => {
        s.blocks[proseIndex]!.size = round(title.size / hierarchyRatio);
      });
    else
      set(`/blocks/${titleIndex}/size`, () => {
        title.size = round(s.blocks[proseIndex]!.size * hierarchyRatio);
      });
  }
  for (const [i, b] of s.blocks.entries()) {
    const prefix = `/blocks/${i}`;
    const f = fontAt(b);
    const xRatio = (f.xHeight || f.unitsPerEm * 0.5) / f.unitsPerEm;
    set(`${prefix}/trackingEm`, () => {
      b.trackingEm = round(
        trackingTarget(b.size, b.weight) + density * 0.005,
        10000,
      );
    });
    const m = measurement?.blocks[i];
    const baseLead =
      b.role === 'prose'
        ? p.targets.proseLeading + (xRatio - 0.5) * 0.1
        : b.role === 'subtitle'
          ? p.targets.subtitleLeading
          : p.targets.titleLeading -
            0.015 * Math.log2(b.size / 48) +
            ((m?.lines.length ?? 1) > 2 ? 0.04 : 0);
    set(`${prefix}/leading`, () => {
      b.leading = round(baseLead + density * 0.045);
    });
    // Size/font-dependent measure, clamped by geometry; these targets are explicitly heuristic.
    const desiredCharacters =
      b.role === 'prose'
        ? p.targets.proseCharacters
        : b.role === 'subtitle'
          ? p.targets.subtitleCharacters
          : s.archetype === 'hero'
            ? 24
            : 32;
    const meanAdvance =
      f.layout('abcdefghijklmnopqrstuvwxyz').advanceWidth / f.unitsPerEm / 26;
    set(`${prefix}/measure`, () => {
      b.measure = round(
        Math.min(
          s.viewport.width - 2 * s.padding,
          b.size * meanAdvance * desiredCharacters * (1 + density * 0.06),
        ),
      );
    });
  }
  for (let i = 0; i < s.gaps.length; i++) {
    const previous = s.blocks[i]!,
      next = s.blocks[i + 1]!;
    const lineCount = measurement?.blocks[i]?.lines.length ?? 1;
    set(`/gaps/${i}`, () => {
      s.gaps[i] = round(
        next.size * (p.targets.gapEm + density * 0.16) +
          previous.size * 0.04 +
          Math.max(0, lineCount - 2) * previous.size * 0.04,
      );
    });
  }
  return { state: s, changes };
}
export async function relax(
  state: DesignState,
  renderer: Renderer,
  options: RelaxOptions = {},
) {
  state = parseState(state);
  const p = options.policy ?? policy();
  const count = options.maxCandidates ?? 9;
  if (!Number.isInteger(count) || count < 1 || count > 9)
    throw new Error('maxCandidates must be an integer in [1, 9]');
  const widths = [
    ...new Set(options.widths ?? [state.viewport.width, 360, 768]),
  ];
  const scales = [...new Set(options.textScales ?? [1, 2])];
  if (
    widths.length === 0 ||
    scales.length === 0 ||
    widths.some((n) => !Number.isFinite(n) || n <= 0 || n > 10000) ||
    scales.some((n) => !Number.isFinite(n) || n <= 0 || n > 5) ||
    widths.length * scales.length > 12
  )
    throw new Error(
      'use nonempty finite widths in (0, 10000] and scales in (0, 5], at most 12 stress combinations',
    );
  const candidates: Candidate[] = [];
  const rejectedProposals: {
    seed: number;
    phase: 'initial' | 'refined';
    reason: string;
  }[] = [];
  function validProposal(
    proposal: DesignState,
    seed: number,
    phase: 'initial' | 'refined',
  ) {
    const parsed = StateSchema.safeParse(proposal);
    if (parsed.success) return true;
    rejectedProposals.push({ seed, phase, reason: parsed.error.message });
    return false;
  }
  const seen = new Set<string>();
  const title = state.blocks.find((b) => b.role === 'title')!,
    prose =
      state.blocks.find((b) => b.role === 'prose') ??
      state.blocks.find((b) => b.role === 'subtitle')!;
  const currentRatio = title.size / prose.size;
  const smoothRatios = [currentRatio, currentRatio * 0.94, currentRatio * 1.06];
  const peaks = (p.curves.hierarchy ?? makeCurve(currentRatio, p.prior)).peaks
    .filter((x) => Math.abs(interval(x.ratio, currentRatio)) < 0.25)
    .sort(
      (a, b) =>
        Math.abs(interval(a.ratio, currentRatio)) -
        Math.abs(interval(b.ratio, currentRatio)),
    );
  const musicalRatios = [
    currentRatio,
    ...new Set(
      peaks
        .map((x) => x.ratio)
        .filter((x) => Math.abs(interval(x, currentRatio)) > 1e-6),
    ),
  ];
  const ratios =
    p.prior === 'smooth'
      ? smoothRatios
      : [...musicalRatios, ...smoothRatios].slice(0, 3);
  // Matched budgets; the hypothesis changes relationship proposals, never feasibility rules.
  const seeds = [0, -1, 1].flatMap((density) =>
    ratios.map((ratio) => ({ density, size: 1, ratio })),
  );
  for (const [seedIndex, seed] of seeds.slice(0, count).entries()) {
    const first = couple(
      state,
      seed.density,
      seed.size,
      p,
      undefined,
      options.pinned,
      seed.ratio,
    );
    if (!validProposal(first.state, seedIndex, 'initial')) continue;
    const initial = await renderer.measure(first.state, { spacing: true });
    // Discrete line counts drive the next continuous refinement; no differentiation through wraps.
    const refined = couple(
      first.state,
      seed.density,
      1,
      p,
      initial,
      options.pinned,
      seed.ratio,
    );
    if (!validProposal(refined.state, seedIndex, 'refined')) continue;
    const fingerprint = hash(refined.state);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const measurement = await renderer.measure(refined.state, {
      spacing: true,
    });
    const responsive: LayoutMeasurement[] = [];
    for (const width of widths)
      for (const textScale of scales) {
        if (
          width === refined.state.viewport.width &&
          textScale === refined.state.viewport.textScale
        )
          continue;
        const scenario = structuredClone(refined.state);
        scenario.viewport.width = width;
        scenario.viewport.textScale = textScale;
        if (width <= 2 * scenario.padding)
          throw new Error(
            `stress width ${width} leaves no text width at padding ${scenario.padding}`,
          );
        responsive.push(await renderer.measure(scenario, { spacing: true }));
      }
    const relations = scoreRelations(refined.state, measurement, p);
    candidates.push({
      id: fingerprint.slice(0, 16),
      state: refined.state,
      measurement,
      responsive,
      relations,
      viable: [measurement, ...responsive].every((m) => m.feasible),
      pareto: false,
      changes: [...new Set([...first.changes, ...refined.changes])],
    });
  }
  const viable = candidates.filter((c) => c.viable);
  const pareto = frontier(
    viable.map((c) => ({ candidate: c, objectives: c.relations.objectives })),
  );
  for (const c of pareto) c.candidate.pareto = true;
  return {
    version: 1,
    policy: p,
    candidates,
    rejectedProposals,
    viableIds: viable.map((c) => c.id),
    paretoIds: pareto.map((c) => c.candidate.id),
    selection: null,
    search: {
      seedCount: Math.min(count, seeds.length),
      relationshipRatios: ratios,
      relationshipEditable:
        editable(
          state,
          `/blocks/${state.blocks.indexOf(prose)}/size`,
          options.pinned ?? [],
        ) ||
        editable(
          state,
          `/blocks/${state.blocks.indexOf(title)}/size`,
          options.pinned ?? [],
        ),
      refinementPasses: 2,
      widths,
      textScales: scales,
      pinned: options.pinned ?? [],
      method:
        'bounded discrete candidate search with renderer-guided continuous refinement; Pareto factors remain separate',
    },
    caveat:
      'No automatic aesthetic acceptance. Coverage is limited to the returned stress scenarios. SemIf can select only among currently viable candidates.',
  };
}
export type RelaxResult = Awaited<ReturnType<typeof relax>>;
export function candidateDistance(a: Candidate, b: Candidate): number {
  return a.state.blocks.reduce(
    (s, x, i) =>
      s +
      Math.abs(interval(x.size, b.state.blocks[i]!.size)) +
      Math.abs(x.trackingEm - b.state.blocks[i]!.trackingEm),
    0,
  );
}
