# Prose and navigation analysis reference

`analyzeProse(input)` describes an authored information architecture. It counts segmented text, checks references and declared prerequisites, flags only caller-supplied prose policies, and finds routes through explicit links. It does not rank prose beauty or infer a reader's attention, diagnosis, understanding or preferred style.

## Inputs

[`src/prose.ts`](../src/prose.ts) is browser-pure. `ProseAnalyzeSchema`, `ProseSectionSchema` and `ProseJourneySchema` expose strict Zod contracts. Unknown fields, nonfinite numbers, duplicate IDs and nonexistent referenced sections are rejected.

| Field                 | Contract                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `purpose`             | `tutorial`, `how-to`, `reference`, `explanation`, or `routing`                                                                 |
| `audience`, `outcome` | Required authored descriptions; never inferred from wording                                                                    |
| `locale`              | Valid language tag, default `en`; resolved segmentation locale is returned                                                     |
| `sections`            | 1–128 sections; each has `id`, `heading`, `text`, optional `format`, `purpose`, `links`, `prerequisites`, and `action`         |
| `format`              | `prose` by default, or `code` / `quote`; the caller separates these blocks                                                     |
| `journeys`            | Up to 64 `{id,entry,target,probability?}` entries                                                                              |
| `costs`               | Optional `{readingWpm,clickSeconds}`; otherwise estimates remain null                                                          |
| `vocabulary`          | Up to 32 `{canonical,variants}` rules, each with up to eight variants                                                          |
| `policy`              | Optional section, sentence and heading word limits; `requireActionFor` lists purposes that require authored action annotations |

A section permits up to 50,000 UTF-16 text units and 128 links/prerequisites. Aggregate section text, headings and actions are capped at 250,000 units. Reading speed is bounded to 1–10,000 words per minute; each click estimate is 0–3,600 seconds. These are computational bounds, not recommended reading speeds or writing limits.

Words and sentences use `Intl.Segmenter`. Facts report body words, heading words, separate action words, sentence counts and per-sentence word counts. Punctuation-only segments do not count as words or sentences. Counts depend on the runtime's Unicode/ICU data. The example report records Node and ICU versions.

Vocabulary checks use normalized, case-folded word-token sequences, so `launch` does not match `launcher`. Matches are warnings tied to an authored canonical term; no rewrite occurs. Code and quote sections are excluded from vocabulary and word-limit policies. Raw Markdown is not parsed for inline fences: callers must mark code and quoted blocks explicitly. Canonical collisions, canonical terms reused as variants, and duplicate normalized vocabulary terms are rejected.

## Structure and routes

Navigation links and prerequisites are separate graphs. Both report cyclic strongly connected components, including self-loops. A navigation cycle is a structural fact, not inherently a defect. Prerequisites never silently become navigation links. Only sections whose resolved purpose is tutorial receive a warning when a prerequisite appears at or after them in the authored section order.

With cost assumptions, Dijkstra selects the route with minimum estimated read-through time. The model reads each visited section's heading, body and separate action annotation once at the same authored word rate, and adds one click cost per explicit link. Entry and destination reading are included. Code and quotes remain in this mechanical count; the result does not estimate execution, comprehension, scanning, prerequisite study, link discovery or interaction latency. Equal-cost ties follow the supplied section/link order.

Without cost assumptions, the result reports a route with the fewest links and null estimated seconds. Unreachable targets return `path:null`, `clicks:null`, and `estimatedSeconds:null`; Infinity is never returned. A shorter computed route is a consequence of the stated model, not proof that users will discover or prefer it.

## Explicit probabilities

A journey's probability describes an authored, mutually exclusive demand scenario. It is optional, finite and in `[0,1]`. A partial set may not total more than one. A complete distribution must total one within `1e-9`; otherwise validation fails. No uniform distribution is invented.

Route-demand entropy is `-sum(p*log2(p))`, with zero-probability terms contributing zero. It is available only when all journey probabilities are explicit. Expected route seconds additionally requires cost assumptions and a reachable route for every positive-probability journey. Missing values produce null and a reason. An unreachable zero-probability journey does not contribute cost.

This entropy measures the supplied distribution over tasks. It is not a word-level language-model surprisal estimate, a cognitive-load metric, or an aesthetic judgment. [Hale's 2001 paper](https://aclanthology.org/N01-1021/) models word-by-word surprisal using probabilistic grammatical assumptions; this API does not implement that model.

## Source attribution and local decisions

[Diátaxis's map](https://diataxis.fr/map/) distinguishes learning, task completion, reference lookup and explanation. It also permits readers to enter at different places. The API retains these purposes and adds a local `routing` category for navigation pages. Its [application guidance](https://diataxis.fr/application/) favors trying useful changes on real documentation; it does not require four folders or a fixed reader journey.

[Attention Control](https://github.com/aaddrick/attention-control) motivates actionable instructions and consistent vocabulary while preserving code and quotations. This implementation adopts those ideas only as authored annotations and optional policies. It does not adopt the source's reader diagnosis, fixed sentence/list limits, or universal prescriptions for creative writing. Necessary qualifications and technical distinctions remain the author's responsibility.

## Executed example

[`examples/prose/routing.json`](../examples/prose/routing.json) authors a lookup journey and a learning journey. [`compare.ts`](../examples/prose/compare.ts) adds one direct link while preserving all section text, then removes probabilities in a separate analysis. [`comparison-report.json`](../examples/prose/comparison-report.json) records both estimated route costs and the unknown aggregate after probability removal.

Run `npx tsx examples/prose/compare.ts` from the repository root to refresh the report. `npx tsx --test test/prose.test.ts` verifies changed navigation with identical prose, weighted routing, probability unknowns, analytic entropy and expectation, unreachable routes, bounded validation, tutorial-specific ordering, vocabulary exclusions and caller-authored limits.
