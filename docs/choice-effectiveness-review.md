# Choice effectiveness review

This records the retention and responsive-target round. The subsequent [bounded successor lookahead](adr-005-bounded-successor-lookahead.md) round closes its observed upstream/downstream selection gap; the original ablation remains evidence for the retention change.

## Recorded brief

The user's reported failure is ineffective choice: the displayed expression alternatives all have energy approximately 14.938773 and only two local model calls were made. This review asks whether the retained choices express distinct, measurable consequences and whether the model has a meaningful decision to make. More model calls and cosmetically different scores are not acceptance criteria.

Preserve the synthetic DELIBERATE FRICTION direction, actual text/font/image inputs, hard layout guards, default energy-search behavior and bounded execution. Do not manufacture taste evidence. The existing synthetic interview remains an authored assumption, not human preference data. The investigation may revise explicitly authored responsive image/text bands and retain competing preference vectors before equivalent-cost alternatives. The old gallery evidence remains historical until a separate coordinated regeneration.

## Initial observations

The stored Chromium matrix yields 510 admissible reading assignments with 60 distinct per-scenario preference-cost vectors. Exactly one vector is nondominated, shared by 12 assignments. The old six-option prefix retains only the 1080px content cap; it loses equally admissible 900px alternatives because canonical tie ordering is mistaken for coverage.

Conditioned on the saved reading choice, all 432 expression assignments are admissible, with 192 distinct cost vectors and 12 nondominated vectors. The old six retained options have the same total energy, 14.93877334499847, and image geometry. Exact inspection finds two cost vectors: subtraction at the 0.2 roughness boundary introduces an existing contribution of 9.244463733058732e-32 per material row in two alternatives. That roundoff is not a meaningful tradeoff. The other differences are finish and motion within flat bands, while image share remains 0.64 and aspect remains 2. The scalar prefix discards actual opposing scenario costs.

The image/text band [0.65, 1.25] also asks enlarged phone text to retain a large relative image. Under the saved reading geometry, every available frame misses that target: the largest ratio is approximately 0.238. Desktop misses the same band in the other direction: its smallest available ratio is approximately 1.718. Mathematical admissibility did not mean that authored preference targets were satisfiable.

## Revision policy

Keep energy equations and weights intact. Add opt-in Pareto-profile retention with an explicit work budget; preserve the lowest-sum candidate first, represent distinct nondominated cost vectors before spare-slot domain coverage, and report incomplete skyline work without claiming Pareto membership. A cost vector includes every preference factor in every scenario. Coverage distance is normalized authored numeric-domain distance, not perceptual distance.

Responsive image/text targets are separately authored, revisable assumptions. The normal desktop frame can range from one to two text-stack heights; phone imagery is subordinate to text and action; user enlargement further reduces the requested image/text ratio. These are local compiler inputs, not empirical ratios or aesthetic laws. Remaining unreachable targets and cross-scenario conflicts must be exposed, not hidden by score changes.

Reading plateaus remain honest: different measured geometry can share all declared costs. A local selector may make an uncalibrated art-direction choice among those assignments, but its logits cannot demonstrate preference, visual equivalence, usability or quality.

## Measured changes

Run `npm run build && node scripts/prove-choice-effectiveness.mjs`. It creates an isolated report and full raw receipts in `artifacts/choice-effectiveness`; `DESIGN_CHOICE_OUTPUT` overrides that destination. It makes no neural calls and does not publish gallery fixtures. The proof recollected all 252 text cells in Chromium 156.0.8078.4. Their measurement identity exactly matched the previous matrix (`26b0559541bb45f6a3dee5db51ee6e97b60193c2b0400a7cfca84ffbaf6cfd4b`).

The ablation holds the old brief, measured cells and saved reading assignment fixed while changing retention alone. `runs.json` retains complete search results, distinct per-scenario cost vectors and an independent all-pairs oracle. A separate 24-slot run covers all 12 original nondominated expression profiles; the normal six slots cover six. Profile truncation is visible in the counts.

| Stage/policy                   | Evaluated | Admissible | Exact cost profiles | Nondominated profiles |             Retained profiles |
| ------------------------------ | --------: | ---------: | ------------------: | --------------------: | ----------------------------: |
| Original reading, ranked       |       540 |        510 |                  60 |                     1 |                             1 |
| Original reading, diverse      |       540 |        510 |                  60 |                     1 |                             1 |
| Original expression, ranked    |       432 |        432 |                 192 |                    12 | 2, differing only by roundoff |
| Original expression, diverse   |       432 |        432 |                 192 |                    12 |                             6 |
| Responsive expression, diverse |       432 |        432 |                 192 |                     3 |                             3 |

The retention-only expression alternatives have six distinct image-share/aspect combinations: `(0.64, 2)`, `(0.64, 1.7)`, `(0.8, 2)`, `(0.64, 1.4)`, `(0.8, 1.7)` and `(0.48, 2)`. Their unchanged costs range from 14.938773 to 68.882640. These are nondominated scenario tradeoffs, not six equally recommended designs. Reading retains both 900px and 1080px content caps, both 52px and 64px title choices, and all three leading choices. Its costs correctly remain 0.4342569444444445.

The responsive image/text bands are phone `[0.35, 0.75]`, enlarged phone `[0.08, 0.25]`, iPad `[0.65, 1.5]`, enlarged iPad `[0.25, 0.75]`, desktop `[1, 2]`, and enlarged desktop `[0.4, 1.2]`. They are stored explicitly in the example brief; omission preserves the original common band. The generic factor `scenarioBands` override preserves observed values and uses the ordinary factor equation. Unknown scenario names throw. No weights, random perturbations or aesthetic objective were added.

With those new bands and the original reading choice, every individual expression target is reachable, but none of the 432 assignments satisfies all targets jointly. The minimum energy is 0.920094. Two other nondominated profiles cost approximately 61.924 and 61.944 because they trade image dominance and geometric tension for closer frame/text ratios. Exposing those tradeoffs does not make them plausible substitutes under the existing weights; a caller may need narrower domains or an explicit regret budget. The revision does not silently invent such a budget.

## Coupling, budgets and verification

The proof rebinds and searches expression for each of the six retained reading choices. With the 900px cap, 64px title and 1.65 leading, the best expression changes from aspect 2 to 1.7 and reaches zero declared preference energy, with 16 jointly satisfying assignments. The original 1080px/52px/1.35 reading produces 0.920094 with no joint solution. Across the six branches, downstream minimum energy spans 0–0.920094. This demonstrates a real coupled consequence of an upstream plateau. At this round, the staged workflow did not look ahead or backtrack. The subsequent ADR 005 implementation now exposes that consequence before parent selection and reaches the zero-residual path under its explicit tie policy; it still makes no global optimum claim.

Reading diagnostics also expose unchanged, unreachable authored preferences: normalized phone headline line count is always 3 against a maximum of 2.4, and enlarged-phone reading density reaches only 39.333 against a minimum of 40. These preferences remain soft and do not mean text is lost. Revising the text, font, responsive title envelope, domain or those targets is a separate design decision.

The new optional retention path deduplicates exact vectors before dominance work. Its default budget is 1,000,000 scalar comparisons, adjustable through `maxRetentionComparisons`. The actual runs used 2,041 comparisons for reading, 17,020 for original expression and 7,029 for responsive expression, including spare-slot domain coverage. Exhausting the skyline budget falls back to ranked candidates with an empty unproven Pareto list and explicit incomplete diagnostics. Exhausting only domain coverage preserves the established frontier and reports ranked filling. A partial evaluated search only establishes a frontier within its evaluated admissible states.

The default search path remains the historical ranked prefix. New options have no schema defaults that would silently change old workflow recipe identities; explicitly opting in changes the options and therefore invalidates dependent recipes. The focused 47-test run passed across energy, energy analysis, the design field and decision workflows, covering an independent dominance oracle, plateau coverage, canonical-order invariance, legacy behavior, budget exhaustion, hard constraints, scenario overrides, source-bound replay and measured field regression. `npm run typecheck` passed.

All twelve standalone finalists passed current Chromium validation at six scenarios each: 72 geometry receipts in `validations.json`. Reading alternatives were paired with their newly recomputed downstream mathematical choice; expression alternatives used the fixed saved reading geometry. The first sandboxed browser attempt could not register Chromium's macOS process port; the permitted retry executed the actual measurement and rendering. A probe initially assumed bit-exact vector equality and failed on the pre-existing 9e-32 residue; the corrected proof asserts equal historical total costs and frame geometry while retaining exact vector evidence. Neither failure was hidden as a design success.

No neural readout or gallery publication was performed by this isolated proof. Selector questions now state the underdetermined plateau, the limits of model judgment and the difference between hard admissibility and target satisfaction. Numerical coverage, geometry validity and two model readouts cannot establish human preference, visual quality, calibrated taste, material appearance, motion quality, full-gallery task success or throughput claims. Those require their own current evidence. Historical gallery, brief and measurements are preserved alongside the new receipts.
