# ADR 005: bounded successor lookahead

Status: implemented and tested; current mathematical/Chromium proof passed. Actual local model readout is a separate coordinated proof.

The measured field has an upstream plateau: reading alternatives have the same declared factor costs, but their conditioned expression stages differ. The saved reading branch can miss all-joint target satisfaction while another equally ranked reading branch admits it. A parent-only selector cannot see that consequence.

Add an explicit, optional direct-successor lookahead policy to a decision stage. Reuse the existing bounded energy search for each retained parent assignment; retain full branch evidence and show compact per-factor successor consequences to the parent selector. A required completion policy filters only to witnessed viable continuations. An informational completion policy reports outcomes without making them binding. Unknown or budget-limited branches remain unknown.

An optional mathematical tie policy prefers a jointly satisfied successor only among identical parent preference-cost vectors. It does not add energies from different stages or define a whole-design score. Local model selection remains revisable art direction; preference guidance is distinct from hard completion requirements.

The scope is one declared dependency edge per lookahead stage. Other successor predecessors must already have assignments. Branch/evaluation/factor/expression budgets bound work, and DAG validation prevents recursive cycles. Complete successor searches can be reused when that stage executes. Cache identities bind looked-ahead programs, options, guards, context and bindings; replay revalidates saved continuation witnesses without search or neural inference. Independent branches remain independently reusable.

## Contract and evidence

`DecisionStageSchema.lookahead` is optional. Omission retains the previous identity structure and behavior. Its policy explicitly declares successor IDs, maximum parent branches, evaluation/factor/expression budgets, `completion: "require" | "inform"`, and `parentTies: "preserve" | "prefer-successor-targets"`. Unknown, duplicate, self or non-successor references fail during normalization. The declared main and lookahead budgets must fit the workflow's aggregate limits before work starts.

Required completion accepts a retained parent only when each declared successor has an admissible assignment witness or an inactive guard. An exhaustive search without candidates establishes infeasibility over that finite conditioned domain. An incomplete search without candidates, exhausted budget, or unresolved other predecessor is unknown. Unknown parents remain visible in evidence but cannot satisfy required completion. Informational completion leaves all retained parents eligible. No branch outside `maxBranches` is silently claimed tested.

The mathematical tie policy compares exact per-scenario parent preference vectors. It prefers a witnessed all-target successor only when that vector equals the otherwise selected parent's vector. Different parent costs, including equal sums with opposing individual factors, remain separate preferences. No cross-stage scalar score is introduced. The local selector receives successor status, a bounded-search witness and its nonzero per-scenario preference residuals; required completion filters its choices, while target guidance remains revisable.

All numeric searches call the existing `searchEnergy`. A complete child search is held privately for the current run and reused if its exact conditioned program/options are later executed. Total statistics include lookahead work; the nested `statistics.lookahead` reports it separately. No numeric evaluation, graph node, replay check or test hook is counted as a neural call.

The parent cache identity includes the lookahead engine version, policy, successor definitions, relevant context and available other predecessor identities. A changed looked-ahead target therefore invalidates that parent as well as dependent choices. Unrelated branches still replay. The selected continuation is saved as typed assignments; replay re-evaluates their hard guards and checks successor guards. A re-signed cache containing an invalid child assignment is rejected. Historical search evidence is retained, while an absent historical witness is not re-certified by replay.

## Field result

The field opts in for six reading branches and the expression successor, with at most 3,000 lookahead evaluations, 250,000 factor observations and 15,000,000 expression operations. The aggregate reservations are 5,000 evaluations/graph nodes, 2,250,000 factor observations and 115,000,000 expression operations.

The current measured run uses 3,132 numeric evaluations: 540 reading states plus six conditioned expression searches of 432 states each. Lookahead contributes 2,592 evaluations, 93,312 factor observations and an upper bound of 14,105,664 expression operations. Total factor observations are 112,752 and the total expression-operation upper bound is 22,643,064. The selected expression search is reused, so executing its stage does not add a seventh copy of those 432 evaluations.

The mathematical choice is content cap 900px, title size 64px, body size 16px, leading 1.65 and gap 32px. Its selected expression has image share 0.64, aspect 1.7, roughness 0.18, counter-roughness 0.55 and motion role 1. The reading cost remains 0.4342569444444445; its expression satisfies all declared preference targets with zero residual. This establishes a reachable joint target path under the recorded policy, not a preferred design.

The actual Chromium finalist passed all six phone/iPad/desktop and enlarged-text scenarios. Replay performs zero searches, zero numeric exploration and zero neural calls; it re-evaluates 18 saved assignments, including six continuation witnesses. A changed expression tension target makes reading stale and expression blocked in replay, because the earlier decision was informed by that target. This supersedes the old field's downstream-only invalidation example.

Reproduce the mathematical proof with:

```sh
npm run build
DESIGN_FIELD_OUTPUT=artifacts/design-field-lookahead-compact node scripts/prove-design-field.mjs
```

Receipts are `first.json`, `validation.json`, `replay.json`, `partial-replay.json` and `gallery-session.json` in that directory. The script does not publish the gallery fixture unless `--publish-fixture` is explicitly supplied. An actual local model run separately adds `--selector`; the mathematical run makes no neural calls.

## Bounded context and verification

The first implementation embedded six full child programs/search graphs in public evidence. It serialized to 4.51 MB compact (13.40 MB pretty), leaving needless context/storage pressure. The revised branch receipt exposes a program identity and search digest, bounded statistics, retained assignments/costs/target statuses, and one witness's per-scenario factor values. Full programs, graphs and derived tables remain private for the run. The complete field session now serializes to 1,594,006 bytes compact (4,450,400 pretty), with a regression asserting less than 2 MiB. These are measured field sizes, not a bound on arbitrary caller programs.

Pinned Qwen3.5-4B tokenizer preflight using the exact direct-option chat template measured 2,656 input tokens for the reading decision and 2,183 for expression, below the 8,192-token limit. It verified all six answer slots without any model forward call. Test-hook prompts and token/hash receipts are saved under `artifacts/choice-effectiveness/lookahead-selector-inputs.json` and `lookahead-prompt-budget.json`; they are explicitly not neural results.

Fifty-seven focused tests pass across energy, energy analysis, decision workflows and the field. They cover parent ties, dead-end avoidance, incomplete-budget unknowns, unresolved sibling inputs, aggregate reservations, continuation revalidation and tampering, selective invalidation, model-visible successor evidence, reversible preference guidance, compact receipts and the actual measured field regression. Build/typecheck pass. The current Chromium proof passes; physical native layout, end-to-end model choice quality, timing/throughput and whole-app usability are outside this isolated result.

This is bounded preselection backtracking over declared direct successors. It does not recursively solve all descendants, search discarded parent assignments, optimize a universal objective, or prove a global optimum. If another predecessor is unresolved, an author must order the graph appropriately, use informational lookahead, or accept an unknown branch. If the retained set/budget contains no required witness, the stage reports that limit instead of looping or claiming infeasibility of unsearched designs.
