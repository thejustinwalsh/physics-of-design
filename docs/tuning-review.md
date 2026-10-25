# Synthetic visual preference review — batch v1

This batch contains six original text-specimen projects, each with two alternatives at 390, 834, and 1440 CSS pixels. Two isolated Astra agents inspected all 36 PNGs against the criterion supplied for each pair. Their raw choices are synthetic teacher labels, not human preference evidence, aesthetic probabilities, or measured usability outcomes. The [manifest](../evidence/tuning/v1/manifest.json) fixes side assignment, project split, state hashes, image paths, and Chromium feasibility receipts. Those receipts establish the scoped measured checks; the ratings address the stated visual criterion separately.

The four training projects are tuning-1 through tuning-4; tuning-5 and tuning-6 were assigned to the held-out split before labels. Left/right/tie/abstain were all permitted. Both raters used the pinned Impeccable skill at commit `936867543ac2576920d663cc9803597f6044f3ac` and the requested `gpt-6-astra` model. Neither saw the other's choices. They share model family and project history; A had separately inspected Apple references and B website references. Isolation prevents direct answer sharing, but does not make these independent human samples or remove common-model bias.

Inputs were hashed before rating completion in [review-input-hashes.json](../evidence/tuning/v1/review-input-hashes.json). The only review outputs added alongside the frozen inputs are derived evidence records and raw labels. No candidate, manifest, image, or equation is edited by this review.

Rater A disclosed that its initial manifest preview exposed part of tuning-1 left's configuration; it conservatively marked that pair `abstain`. Retain the abstention rather than replacing it with an inferred vote. The remaining judgments are reported as pixel-based. Raw labels must preserve ties, abstentions, criterion, rater provenance, project identity, state hashes, and image references through any training export.

Raw labels: [rater A](../evidence/tuning/v1/ratings-a.json), [rater B](../evidence/tuning/v1/ratings-b.json). The [validation record](../evidence/tuning/v1/review-validation.json) confirms six unique pair ratings per rater, six correct image references per pair, allowed choices, exact provenance fields, and unchanged hashes for all 37 inputs.

| Pair     | Split    | A       | B     | Exact match |
| -------- | -------- | ------- | ----- | ----------- |
| tuning-1 | Train    | Abstain | Right | No          |
| tuning-2 | Train    | Right   | Tie   | No          |
| tuning-3 | Train    | Left    | Left  | Yes         |
| tuning-4 | Train    | Tie     | Right | No          |
| tuning-5 | Held out | Left    | Left  | Yes         |
| tuning-6 | Held out | Right   | Right | Yes         |

Exact choice agreement is 3/6 overall, or 3/5 after excluding the pair with an abstention. The training split has 1/4 exact matches, or 1/3 among non-abstaining pairs. The held-out split has 2/2 matches; this is a descriptive count over two synthetic cases, not evidence of model accuracy or generalization. There are no opposing left-versus-right votes: two differences are tie-versus-directional judgments, and one involves abstention. Agreement is reported without significance tests or a claimed reliability coefficient.

Only training pairs inform the following findings. On tuning-2, A favors the stronger heading and larger separation; B sees a tradeoff because the alternative's subtitle has short final lines at wider widths. Preserve separate heading emphasis, subtitle wrapping, and spacing descriptors rather than fitting a rule that automatically rewards a larger heading or gap. On tuning-3, both prefer the less emphatic reading treatment. Their reasons combine heading restraint, apparent prose weight, and background/polarity; the alternatives change several properties, so this does not isolate a causal color or type effect and does not justify a rule against dark editorial layouts. On tuning-4, A ties compact restraint against more space, while B prefers the clearer heading-to-prose pause. Retain both alternatives and the tie instead of converting this into unanimous support for larger spacing.

No additional numerical equation tuning is justified by these four training pairs. The usable signal is criterion-conditioned preference with visible tradeoffs; a future controlled batch can change one property at a time to distinguish typography, color polarity, and spacing effects. Keep hard feasibility filtering separate from preference learning. Do not replace ties with half a winner or abstentions with weak votes without an explicit training contract that preserves the raw outcome.

The batch is ready for a small export/forward-probe exercise, with the project split preserved. Widths from one project are correlated views of one decision and must remain in the same split; individual screenshots are not 36 independent preference examples. Avoid feature leakage from candidate side, IDs, hashes, or split labels. Any fitted preference head should use training labels only, retain criterion and rater identity, and treat held-out outputs solely as evaluation. With four training projects, one abstention and two tie disagreements, a probe can demonstrate mechanics but cannot establish general aesthetic competence. The two held-out choices above have not been used to propose a rule or tune a constant.

The award-reference inspection is a separate evidence stream in the [inspiration registry](../research/inspiration-registry.json) and [color research](color-rules.md). The [equation review](color-equation-review.md) addresses deterministic mathematical behavior and adversarial synthetic cases. Neither is interchangeable with this candidate preference batch. This report does not retune equations from held-out judgments.

Questions skipped: user already authorized implementation and requested autonomous refinement.
