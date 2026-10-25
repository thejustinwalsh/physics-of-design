import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const purpose = z.enum([
  'tutorial',
  'how-to',
  'reference',
  'explanation',
  'routing',
]);
const label = z.string().trim().min(1).max(512);
const locale = z
  .string()
  .min(2)
  .max(80)
  .default('en')
  .refine((value) => {
    try {
      return Intl.getCanonicalLocales(value).length === 1;
    } catch {
      return false;
    }
  }, 'Supply one valid language tag');
export const ProseSectionSchema = z
  .object({
    id,
    heading: label,
    text: z.string().max(50000),
    format: z.enum(['prose', 'code', 'quote']).default('prose'),
    purpose: purpose.optional(),
    links: z.array(id).max(128).default([]),
    prerequisites: z.array(id).max(128).default([]),
    action: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();
export const ProseJourneySchema = z
  .object({
    id,
    entry: id,
    target: id,
    probability: z.number().finite().min(0).max(1).optional(),
  })
  .strict();
export const ProseAnalyzeSchema = z
  .object({
    purpose,
    audience: label,
    outcome: z.string().trim().min(1).max(2048),
    locale,
    sections: z.array(ProseSectionSchema).min(1).max(128),
    journeys: z.array(ProseJourneySchema).max(64).default([]),
    costs: z
      .object({
        readingWpm: z.number().finite().min(1).max(10000),
        clickSeconds: z.number().finite().min(0).max(3600),
      })
      .strict()
      .nullable()
      .default(null),
    vocabulary: z
      .array(
        z
          .object({
            canonical: z.string().trim().min(1).max(80),
            variants: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    policy: z
      .object({
        sectionWordLimit: z.number().int().min(1).max(100000).optional(),
        sentenceWordLimit: z.number().int().min(1).max(100000).optional(),
        headingWordLimit: z.number().int().min(1).max(1000).optional(),
        requireActionFor: z.array(purpose).max(5).default([]),
      })
      .strict()
      .default({ requireActionFor: [] }),
  })
  .strict()
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const ids = new Set(r.sections.map((s) => s.id));
    if (ids.size !== r.sections.length)
      issue(['sections'], 'Section IDs must be unique');
    if (new Set(r.journeys.map((j) => j.id)).size !== r.journeys.length)
      issue(['journeys'], 'Journey IDs must be unique');
    if (
      r.sections.reduce(
        (sum, s) =>
          sum + s.text.length + s.heading.length + (s.action?.length ?? 0),
        0,
      ) > 250000
    )
      issue(
        ['sections'],
        'Total section text, headings and actions must not exceed 250000 UTF-16 code units',
      );
    r.sections.forEach((section, index) => {
      for (const key of ['links', 'prerequisites'] as const) {
        if (new Set(section[key]).size !== section[key].length)
          issue(['sections', index, key], 'References must be unique');
        section[key].forEach((ref, n) => {
          if (!ids.has(ref))
            issue(['sections', index, key, n], `Unknown section: ${ref}`);
        });
      }
    });
    r.journeys.forEach((journey, index) => {
      for (const key of ['entry', 'target'] as const)
        if (!ids.has(journey[key]))
          issue(['journeys', index, key], `Unknown section: ${journey[key]}`);
    });
    const assigned = r.journeys.filter((j) => j.probability !== undefined);
    const probabilitySum = assigned.reduce((sum, j) => sum + j.probability!, 0);
    if (
      probabilitySum > 1 + 1e-9 ||
      (assigned.length > 0 &&
        assigned.length === r.journeys.length &&
        Math.abs(probabilitySum - 1) > 1e-9)
    )
      issue(
        ['journeys'],
        'Explicit probabilities must not exceed one; a complete distribution must sum to one within 1e-9',
      );
  });
export type ProseAnalysisInput = z.input<typeof ProseAnalyzeSchema>;
type Section = z.infer<typeof ProseSectionSchema>;
export const proseSources = [
  {
    id: 'diataxis-map',
    url: 'https://diataxis.fr/map/',
    use: 'Purpose distinctions; readers can enter documentation at different places.',
  },
  {
    id: 'diataxis-application',
    url: 'https://diataxis.fr/application/',
    use: 'Pragmatic iteration on actual documentation, not mandatory four-folder structure.',
  },
  {
    id: 'attention-control',
    url: 'https://github.com/aaddrick/attention-control',
    use: 'Authored action clarity and vocabulary consistency; code and quotations preserved. No reader diagnosis or universal style limits imported.',
  },
  {
    id: 'hale-2001',
    url: 'https://aclanthology.org/N01-1021/',
    use: 'Boundary: word surprisal requires a probabilistic language model. This tool does not compute it or infer cognitive load from route entropy.',
  },
] as const;

function components(sections: Section[], key: 'links' | 'prerequisites') {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const indices = new Map<string, number>(),
    low = new Map<string, number>();
  const stack: string[] = [],
    onStack = new Set<string>(),
    cycles: string[][] = [];
  let next = 0;
  const visit = (name: string) => {
    indices.set(name, next);
    low.set(name, next++);
    stack.push(name);
    onStack.add(name);
    for (const to of byId.get(name)![key]) {
      if (!indices.has(to)) {
        visit(to);
        low.set(name, Math.min(low.get(name)!, low.get(to)!));
      } else if (onStack.has(to))
        low.set(name, Math.min(low.get(name)!, indices.get(to)!));
    }
    if (low.get(name) !== indices.get(name)) return;
    const group: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      group.push(member);
    } while (member !== name);
    if (group.length > 1 || byId.get(name)![key].includes(name))
      cycles.push(group.sort());
  };
  sections.forEach((section) => {
    if (!indices.has(section.id)) visit(section.id);
  });
  return cycles.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

/** Bounded authored-information-architecture analysis. No language model or aesthetic score. */
export function analyzeProse(input: unknown) {
  const r = ProseAnalyzeSchema.parse(input);
  const wordSegmenter = new Intl.Segmenter(r.locale, { granularity: 'word' });
  const sentenceSegmenter = new Intl.Segmenter(r.locale, {
    granularity: 'sentence',
  });
  const words = (text: string) =>
    Array.from(wordSegmenter.segment(text)).filter((s) => s.isWordLike);
  const tokens = (text: string) =>
    words(text.normalize('NFKC')).map((s) =>
      s.segment.toLocaleLowerCase(r.locale),
    );
  const vocabulary = r.vocabulary.map((rule) => ({
    ...rule,
    canonicalTokens: tokens(rule.canonical),
    variantsTokens: rule.variants.map(tokens),
  }));
  const vocabularyOwners = new Map<string, string>();
  const canonicalTerms = new Set<string>();
  for (const rule of vocabulary) {
    const canonicalKey = rule.canonicalTokens.join('\u0000');
    if (canonicalTerms.has(canonicalKey))
      throw new Error(`Duplicate canonical vocabulary: ${rule.canonical}`);
    canonicalTerms.add(canonicalKey);
    if (
      new Set(rule.variantsTokens.map((v) => v.join('\u0000'))).size !==
      rule.variantsTokens.length
    )
      throw new Error(
        `Duplicate variants for canonical vocabulary: ${rule.canonical}`,
      );
    for (const term of [rule.canonicalTokens, ...rule.variantsTokens]) {
      if (term.length === 0)
        throw new Error(
          'Vocabulary terms must contain at least one word-like segment',
        );
      const key = term.join('\u0000'),
        canonical = rule.canonicalTokens.join('\u0000');
      const previous = vocabularyOwners.get(key);
      if (previous !== undefined && previous !== canonical)
        throw new Error(
          `Ambiguous authored vocabulary: ${key.replaceAll('\u0000', ' ')}`,
        );
      vocabularyOwners.set(key, canonical);
    }
    if (
      rule.variantsTokens.some(
        (v) => v.join('\u0000') === rule.canonicalTokens.join('\u0000'),
      )
    )
      throw new Error(
        `Canonical term cannot also be a variant: ${rule.canonical}`,
      );
  }
  const warnings: {
    code: string;
    section: string;
    detail: string;
    basis: 'authored-policy' | 'tutorial-order';
  }[] = [];
  const facts = r.sections.map((section, sectionIndex) => {
    const sectionWords = words(section.text),
      headingWords = words(section.heading);
    const sentences = Array.from(
      sentenceSegmenter.segment(section.text),
    ).filter((s) => words(s.segment).length > 0);
    const sentenceWordCounts = sentences.map((s) => words(s.segment).length);
    const allTokens = tokens(section.text);
    const vocabularyMatches =
      section.format === 'prose'
        ? vocabulary.flatMap((rule) =>
            rule.variantsTokens.flatMap((variant, index) => {
              let count = 0;
              for (
                let start = 0;
                start <= allTokens.length - variant.length;
                start++
              ) {
                if (
                  variant.every(
                    (token, offset) => allTokens[start + offset] === token,
                  )
                )
                  count++;
              }
              return count
                ? [
                    {
                      canonical: rule.canonical,
                      variant: rule.variants[index]!,
                      count,
                    },
                  ]
                : [];
            }),
          )
        : [];
    const resolvedPurpose = section.purpose ?? r.purpose;
    const warn = (
      code: string,
      detail: string,
      basis: 'authored-policy' | 'tutorial-order' = 'authored-policy',
    ) => warnings.push({ code, section: section.id, detail, basis });
    if (section.format === 'prose') {
      if (
        r.policy.sectionWordLimit !== undefined &&
        sectionWords.length > r.policy.sectionWordLimit
      )
        warn(
          'section-word-limit',
          `${sectionWords.length} words exceed authored limit ${r.policy.sectionWordLimit}`,
        );
      if (
        r.policy.headingWordLimit !== undefined &&
        headingWords.length > r.policy.headingWordLimit
      )
        warn(
          'heading-word-limit',
          `${headingWords.length} heading words exceed authored limit ${r.policy.headingWordLimit}`,
        );
      const over =
        r.policy.sentenceWordLimit === undefined
          ? 0
          : sentenceWordCounts.filter((n) => n > r.policy.sentenceWordLimit!)
              .length;
      if (over)
        warn(
          'sentence-word-limit',
          `${over} sentences exceed authored limit ${r.policy.sentenceWordLimit}`,
        );
      if (
        r.policy.requireActionFor.includes(resolvedPurpose) &&
        section.action === undefined
      )
        warn(
          'missing-authored-action',
          `No action annotation for the authored ${resolvedPurpose} policy`,
        );
    }
    if (resolvedPurpose === 'tutorial')
      for (const ref of section.prerequisites) {
        if (r.sections.findIndex((s) => s.id === ref) >= sectionIndex)
          warn(
            'tutorial-prerequisite-order',
            `Prerequisite ${ref} is not earlier in authored section order`,
            'tutorial-order',
          );
      }
    const actionWords =
      section.action === undefined ? 0 : words(section.action).length;
    return {
      id: section.id,
      heading: section.heading,
      format: section.format,
      purpose: resolvedPurpose,
      words: sectionWords.length,
      headingWords: headingWords.length,
      actionWords,
      sentences: sentences.length,
      sentenceWordCounts,
      authoredAction: section.action ?? null,
      vocabularyMatches,
      estimatedReadSeconds:
        r.costs === null
          ? null
          : ((sectionWords.length + headingWords.length + actionWords) /
              r.costs.readingWpm) *
            60,
    };
  });
  const factsById = new Map(facts.map((s) => [s.id, s]));
  const sectionsById = new Map(r.sections.map((s) => [s.id, s]));
  const journeys = r.journeys.map((journey) => {
    const distances = new Map<string, number>(
      r.sections.map((s) => [s.id, Infinity]),
    );
    const previous = new Map<string, string>();
    const settled = new Set<string>();
    distances.set(
      journey.entry,
      factsById.get(journey.entry)!.estimatedReadSeconds ?? 0,
    );
    while (settled.size < r.sections.length) {
      let current: string | null = null,
        best = Infinity;
      for (const section of r.sections)
        if (!settled.has(section.id) && distances.get(section.id)! < best) {
          current = section.id;
          best = distances.get(section.id)!;
        }
      if (current === null) break;
      settled.add(current);
      if (current === journey.target) break;
      for (const to of sectionsById.get(current)!.links) {
        if (settled.has(to)) continue;
        const edgeCost =
          r.costs === null
            ? 1
            : r.costs.clickSeconds + factsById.get(to)!.estimatedReadSeconds!;
        const cost = best + edgeCost;
        if (cost < distances.get(to)!) {
          distances.set(to, cost);
          previous.set(to, current);
        }
      }
    }
    const reachable = settled.has(journey.target);
    const path: string[] | null = reachable ? [journey.target] : null;
    if (path)
      while (path[0] !== journey.entry) path.unshift(previous.get(path[0]!)!);
    return {
      ...journey,
      probability: journey.probability ?? null,
      reachable,
      path,
      clicks: path === null ? null : path.length - 1,
      estimatedSeconds:
        reachable && r.costs !== null ? distances.get(journey.target)! : null,
      optimization:
        r.costs === null
          ? ('fewest-links' as const)
          : ('estimated-read-through-seconds' as const),
    };
  });
  const completeProbabilities =
    journeys.length > 0 && journeys.every((j) => j.probability !== null);
  const entropyBits = completeProbabilities
    ? journeys.reduce(
        (sum, j) =>
          sum -
          (j.probability! > 0 ? j.probability! * Math.log2(j.probability!) : 0),
        0,
      )
    : null;
  const expectedSeconds =
    completeProbabilities &&
    r.costs !== null &&
    journeys.every((j) => j.probability === 0 || j.estimatedSeconds !== null)
      ? journeys.reduce(
          (sum, j) => sum + j.probability! * (j.estimatedSeconds ?? 0),
          0,
        )
      : null;
  return {
    purpose: r.purpose,
    audience: r.audience,
    outcome: r.outcome,
    facts,
    warnings,
    structure: {
      navigationCycles: components(r.sections, 'links'),
      prerequisiteCycles: components(r.sections, 'prerequisites'),
      sectionOrder: r.sections.map((s) => s.id),
      note: 'Navigation cycles are facts, not automatic errors. Prerequisites do not create navigation links. Tutorial ordering concerns only authored tutorial sections.',
    },
    journeys,
    aggregate: {
      probabilityStatus: completeProbabilities
        ? 'complete-explicit-distribution'
        : 'unknown',
      suppliedProbabilitySum: journeys.reduce(
        (sum, j) => sum + (j.probability ?? 0),
        0,
      ),
      entropyBits,
      expectedSeconds,
      unknownReason: !completeProbabilities
        ? 'Supply every journey probability with sum one'
        : r.costs === null
          ? 'Reading and click cost assumptions were not supplied'
          : journeys.some((j) => j.probability! > 0 && !j.reachable)
            ? 'A positive-probability journey is unreachable'
            : null,
    },
    assumptions: {
      costs: r.costs,
      policy: r.policy,
      vocabulary: r.vocabulary,
      readingModel:
        'Read each path section heading, text and separate action annotation once at one authored word rate, including code/quotes. Add one click cost per explicit link. Execution, comprehension, scanning, link discovery and prerequisites are not timed.',
      probabilities:
        'Authored mutually exclusive journey demand; not inferred from content or clicks. Zero-probability unreachable journeys do not contribute expected cost.',
      segmentation: {
        api: 'Intl.Segmenter',
        requestedLocale: r.locale,
        resolvedLocale: wordSegmenter.resolvedOptions().locale,
      },
    },
    algorithm: 'authored-prose-graph-dijkstra-v1',
    sources: proseSources,
    limits: [
      'Counts depend on runtime Unicode/ICU segmentation; compare within a recorded runtime.',
      'Purpose, actions, vocabulary and probabilities are authored inputs, not semantic detection.',
      'Route entropy describes the supplied journey distribution, not language surprisal, attention, cognitive load or prose quality.',
      'No universal word limits, diagnosis, creative-writing rules, automatic edits or beauty score.',
    ],
  };
}
