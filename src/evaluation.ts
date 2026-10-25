import { z } from 'zod';

export const conditions = [
  'guidance-only',
  'tools-smooth',
  'tools-musical',
] as const;
export const TrialSchema = z
  .object({
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    agentId: z.string().min(1),
    seed: z.number().int(),
    condition: z.enum(conditions),
    tokens: z.number().finite().nonnegative(),
    latencyMs: z.number().finite().nonnegative(),
    attempts: z.number().int().positive(),
    hardFailures: z.number().int().nonnegative(),
    responsiveFailures: z.number().int().nonnegative(),
  })
  .strict();
export const PreferenceSchema = z
  .object({
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    seed: z.number().int().default(0),
    raterId: z.string().min(1),
    comparison: z.enum(['guidance-vs-tools', 'smooth-vs-musical']),
    winner: z.enum(['left', 'right', 'tie']),
  })
  .strict();
export const EvaluationSchema = z
  .object({
    trials: z.array(TrialSchema),
    preferences: z.array(PreferenceSchema),
  })
  .strict();
type Trial = z.infer<typeof TrialSchema>;
const keyOf = (t: { projectId: string; taskId: string; seed: number }) =>
  JSON.stringify([t.projectId, t.taskId, t.seed]);
const mean = (ns: number[]) =>
  ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : null;

export function wilson(wins: number, n: number): [number, number] | null {
  if (!Number.isInteger(n) || !Number.isInteger(wins) || wins < 0 || wins > n)
    throw new Error('wins and n must be nonnegative integer counts');
  if (!n) return null;
  const z = 1.959963984540054,
    p = wins / n,
    d = 1 + (z * z) / n,
    center = (p + (z * z) / (2 * n)) / d,
    radius = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [center - radius, center + radius];
}
/** Analyze matched task/seed pairs; absent or orphaned observations cannot manufacture a preference result. */
export function evaluate(input: z.input<typeof EvaluationSchema>) {
  const data = EvaluationSchema.parse(input);
  if (new Set(data.trials.map((t) => t.agentId)).size > 1)
    throw new Error(
      'initial evaluation fixes one coding agent; do not pool multiple agents/models',
    );
  const groups = new Map<string, Map<string, Trial>>();
  for (const t of data.trials) {
    const key = keyOf(t),
      g = groups.get(key) ?? new Map<string, Trial>();
    if (g.has(t.condition)) throw new Error('duplicate trial');
    g.set(t.condition, t);
    groups.set(key, g);
  }
  const votes = new Set<string>();
  for (const p of data.preferences) {
    const vote = JSON.stringify([keyOf(p), p.raterId, p.comparison]);
    if (votes.has(vote)) throw new Error('duplicate preference vote');
    votes.add(vote);
    const pair =
      p.comparison === 'guidance-vs-tools'
        ? ['guidance-only', 'tools-smooth']
        : ['tools-smooth', 'tools-musical'];
    if (!pair.every((c) => groups.get(keyOf(p))?.has(c)))
      throw new Error(
        'preference must reference a matched task/seed trial pair',
      );
  }
  const metrics = conditions.map((condition) => {
    const rows = data.trials.filter((t) => t.condition === condition);
    return {
      condition,
      n: rows.length,
      meanTokens: mean(rows.map((r) => r.tokens)),
      meanLatencyMs: mean(rows.map((r) => r.latencyMs)),
      meanAttempts: mean(rows.map((r) => r.attempts)),
      hardFailures: rows.reduce((s, r) => s + r.hardFailures, 0),
      responsiveFailures: rows.reduce((s, r) => s + r.responsiveFailures, 0),
    };
  });
  const comparisons = (['guidance-vs-tools', 'smooth-vs-musical'] as const).map(
    (comparison) => {
      const [left, right] =
        comparison === 'guidance-vs-tools'
          ? ['guidance-only', 'tools-smooth']
          : ['tools-smooth', 'tools-musical'];
      const pairs = [...groups.values()]
        .filter((g) => g.has(left!) && g.has(right!))
        .map((g) => ({ left: g.get(left!)!, right: g.get(right!)! }));
      const projects = new Map<string, number[]>();
      // Equal weight to tasks within a project; repeated raters do not become additional independent projects.
      const taskVotes = new Map<string, { project: string; votes: number[] }>();
      for (const p of data.preferences.filter(
        (p) => p.comparison === comparison,
      )) {
        const k = keyOf(p),
          t = taskVotes.get(k) ?? { project: p.projectId, votes: [] };
        t.votes.push(p.winner === 'right' ? 1 : p.winner === 'left' ? -1 : 0);
        taskVotes.set(k, t);
      }
      for (const t of taskVotes.values())
        projects.set(t.project, [
          ...(projects.get(t.project) ?? []),
          mean(t.votes)!,
        ]);
      const decisive = [...projects.values()]
          .map((v) => Math.sign(mean(v)!))
          .filter((v) => v !== 0),
        wins = decisive.filter((v) => v > 0).length,
        ci = wilson(wins, decisive.length);
      const failures = pairs.reduce(
        (s, p) => s + p.right.hardFailures + p.right.responsiveFailures,
        0,
      );
      const decision =
        decisive.length < 20
          ? 'insufficient-data'
          : ci![0] > 0.55 && failures === 0
            ? 'supports-right'
            : ci![1] <= 0.55
              ? 'no-practical-advantage'
              : 'inconclusive';
      const reductions = (field: 'tokens' | 'attempts') =>
        mean(
          pairs
            .filter((p) => p.left[field] > 0)
            .map((p) => 1 - p.right[field] / p.left[field]),
        );
      return {
        comparison,
        matchedPairs: pairs.length,
        unmatchedTrials:
          data.trials.filter(
            (t) => t.condition === left || t.condition === right,
          ).length -
          2 * pairs.length,
        projects: projects.size,
        decisiveProjects: decisive.length,
        tiedProjects: projects.size - decisive.length,
        rightWins: wins,
        projectLevelWilson95: ci,
        decision,
        tokenReduction: reductions('tokens'),
        attemptReduction: reductions('attempts'),
        rightFailures: failures,
      };
    },
  );
  const baseline = comparisons[0]!,
    musical = comparisons[1]!;
  const acceptance =
    baseline.decision === 'insufficient-data' ||
    baseline.tokenReduction === null ||
    baseline.attemptReduction === null
      ? 'insufficient-data'
      : baseline.decision === 'supports-right' &&
          baseline.tokenReduction >= 0.2 &&
          baseline.attemptReduction >= 0.2 &&
          baseline.rightFailures === 0
        ? 'passes-screening'
        : 'not-accepted';
  return {
    metrics,
    comparisons,
    productScreening: {
      tokenReduction: baseline.tokenReduction,
      attemptReduction: baseline.attemptReduction,
      acceptance,
    },
    musicalPriorDecision:
      musical.decision === 'supports-right'
        ? 'retain-experimentally'
        : musical.decision === 'no-practical-advantage'
          ? 'discard'
          : 'undetermined; default remains smooth',
    aestheticValidation: false,
    caveats: [
      'Only matched task/seed pairs enter comparative metrics. Unmatched trials are reported separately.',
      'Project-level votes are a preregistered screening analysis, not a hierarchical causal model.',
      'The experiment runner must preserve agent, budgets, random assignment, blinding and project holdout.',
      'No human observations means no aesthetic conclusion; no deterministic score or selector confidence substitutes for them.',
    ],
  };
}
