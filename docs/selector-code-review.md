# Balanced readout and training exporter: code review

## Fix verification and current disposition

Final disposition: **all four original findings and the subsequent evidence-path integration regression are resolved; no remaining material correctness finding in this review scope.** Independent final execution passed all ten tests in `test/boundaries.test.ts` and `test/tuning.test.ts`, including the added root/path regression. The parent’s earlier nine-test run is recorded in [selector-review-regressions.log](../evidence/review/selector-review-regressions.log); this follow-up reran the updated two files rather than relying on that log alone.

| Original finding                   | Disposition                                      | Verified correction                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty-diagnostics infeasible base  | Resolved                                         | Every `feasible:false` base receipt adds a rejection object. The exact empty-issues regression now returns no candidate without inference.                                                                                                                                                  |
| Scenario/audit identity collision  | Resolved                                         | `physics-choice-v2` hashes the complete canonical prompt payload plus checkpoint, mode/profile and token budget, including widths, text scales, candidate identities and measured geometry. Different scenarios no longer share request identity.                                           |
| Wrong readout protocol accepted    | Resolved                                         | The schema pins `direct-options-v1`, `llamacpp`, `llamacpp-direct-v1`, the required last-position readout and a lowercase 64-hex prompt hash. The wrong-readout regression rejects before aggregation.                                                                                      |
| Foreign or missing rating evidence | Resolved, including integration regression below | Each candidate has one distinct image identity per declared width; identities are distinct across both candidates; non-abstaining ratings must exactly cover their union. Foreign/duplicate references reject, and abstentions may omit views. Excluded records now retain evidence images. |

**Integration regression found and resolved during follow-up:** the first fix compared image strings exactly, while the frozen manifest stores `tuning-1-left-390.png` and its ratings store `artifacts/tuning/v1/tuning-1-left-390.png`. Direct export initially failed despite the nine passing fixture tests. The final implementation adds explicit `evidenceRoot` logical POSIX identities, rejects empty/absolute/backslash/dot/traversal path forms, and checks duplicate/foreign references after root-aware normalization. It preserves full relative paths rather than joining basenames. `scripts/probe-selector.mjs` now passes `evidenceRoot: source`. Original evidence strings, resolved logical IDs and the evidence root are retained in export, while the manifest hash still identifies the original manifest.

Independent execution of `exportTuning` against the actual unchanged v1 manifest and both A/B rating files, with `evidenceRoot: 'artifacts/tuning/v1'` and widths `[390,834,1440]`, now succeeds: **6 pairs, 6 projects, 9 directional synthetic examples, 3 exclusions, 0 human examples**. The returned manifest hash equals the original manifest hash. All 37 frozen manifest/image hashes and both raw label hashes still match the prior review ledgers. The new root regression rejects traversal and a different project path with the same basename. No model inference, fitting or held-out-driven tuning occurred in this verification.

Prompt hashes are structurally validated provenance supplied by the adapter, not independently recomputed hashes of the tokenized model prompt. Repeated identical calls still intentionally address the same audit filename; separate execution directories are needed when retaining every repeatability run. Neither limitation invalidates the repaired scenario identity or establishes model quality.

## Historical pre-fix findings and evidence

Four P2 correctness findings were verified with isolated protocol fixtures against `src/selector.ts` and `src/tuning.ts`. No production source was edited. These are adapter/export integrity findings, not measurements of model quality or renderer geometry. The parent owns fixes and regression tests; this record describes the pre-fix snapshot inspected on 2026-10-24 America/Detroit.

| Finding                                                            | Location in reviewed snapshot                 | Verified trigger and consequence                                                                                                                                                                                                                                             | Required correction                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reject an infeasible base receipt independently of its issue count | `src/selector.ts:111`                         | Base receipt has `feasible:false, issues:[]`; requested stress receipt is feasible. Spreading the empty diagnostics adds no rejection reason, so the candidate is returned as the only viable choice.                                                                        | Record the failed base scenario even with no diagnostics. Add this exact regression case. This gate predates balanced aggregation but remains part of its feasibility boundary.                                                                                                                                                   |
| Bind request/audit identity to the actual scenarios and evidence   | `src/selector.ts:179`, audit writes at `:354` | Two calls with identical candidates and criterion but widths `[390]` then `[834]` produce different prompts/hashes yet the same audit filenames. The second call overwrites the first. Text scales and measured geometry are omitted too.                                    | Include scenarios, measurement evidence and algorithm version in request identity. Distinguish request identity from execution identity if repeated identical calls must retain separate raw audit records.                                                                                                                       |
| Validate the readout protocol, not just checkpoint identity        | `src/selector.ts:46`, `:297`                  | A fixture returns correct source/revision/GGUF hash, complete rows and consistent finite logits/probabilities, but `readout:'generated sequence likelihood, not required answer-slot logits'` and `prompt_version:'wrong-protocol'`. It is accepted and selects `a`.         | Pin the expected prompt/readout/backend contract using structured versions; validate a well-formed prompt hash. The current free-form strings do not establish that the numbers are the required last-position option logits. Fixtures should mimic the real contract while clearly identifying themselves as fixtures elsewhere. |
| Bind visual teacher labels to their actual candidate evidence      | `src/tuning.ts:61`, `:121`, `:149`            | A valid pair lists `left-actual.png` and `right-actual.png`; its directional label references only `unrelated-other-project.png`. Export succeeds and attaches the label to the pair's states. Empty evidence is also accepted and is used by the existing exporter fixture. | Validate explicit logical image identities or safely normalized manifest-relative paths against the declared pair/view evidence. Require complete expected view coverage for this visual-rating contract, or explicitly represent unavailable evidence/abstention. Avoid basename-only matching across projects.                  |

The isolated fixture returned:

```json
{
  "auditCollision": {
    "samePaths": true,
    "inputChanged": true,
    "promptHashesChanged": true
  },
  "wrongReadoutAccepted": {
    "selected": "a",
    "readout": "generated sequence likelihood, not required answer-slot logits"
  },
  "unrelatedRatingEvidenceAccepted": ["unrelated-other-project.png"],
  "infeasibleBaseAccepted": {
    "selected": "a",
    "reason": "only viable candidate"
  }
}
```

Fixture implementation was `/tmp/pod-selector-review.mts`; it imported the current TypeScript modules directly, created a disposable fake checkpoint/JSONL adapter, used explicit synthetic renderer receipts, and deleted its temporary checkpoint, adapter and audit directory. It performed no model inference and did not modify candidate artifacts, manifests or source. The triggers above are sufficient to recreate permanent regression tests without retaining fake checkpoints.

The targeted existing suite passed all four selected tests:

```sh
./node_modules/.bin/tsx --test --test-name-pattern='selector|SemIf|training|tuning' test/boundaries.test.ts test/tuning.test.ts
```

Accepted checks: balanced mode sorts viable candidates with a locale-independent ID comparator, and uses that ordering for candidate-hash metadata as well as options. It emits N cyclic rotations and bounds the viable set at six. All declared rows are parsed and checked before aggregation; missing rows, wrong ordered row IDs, malformed numeric values, incorrect candidate sets and wrong model/checkpoint identities are rejected by inspection. Output rows currently must retain request order; this is strict but fail-closed. The existing fixture confirms canonical prompt content for a three-candidate caller permutation, a balanced slot-biased winner, rejection of a partial batch, and rejection of zero probabilities without complete logits.

Finite raw-logit averaging is rank-equivalent to mean log-softmax across the same complete rows: each row's log-normalization subtracts the same constant from every candidate. This is not an arithmetic mean of probabilities. The fallback consistently uses log probabilities when any row lacks logits; zeros then reject the whole balanced readout, with no silent flooring. Exact aggregate ties retain the canonical first ID. No public probability or confidence field is returned. The code rechecks candidate measurement identity after multi-candidate inference. Cross-row numerical comparability still relies on the readout-contract fix above; tests do not prove real-backend repeatability.

Exporter checks already preserve directional-label synthetic/human provenance and train/held-out split, reject duplicate pairs/rater observations, enforce same-project split consistency and ordered content preservation, and validate state/receipt identities and declared feasibility at each supplied width. Ties and abstentions are excluded from directional examples while retaining their choice and reason. Their excluded records omit project/split/evidence context, so consumers need the manifest to recover that context; this is a completeness limitation rather than a demonstrated leak in the current split exporter. Receipt checks intentionally do not authenticate an untrusted renderer.

Beyond the four regression cases, useful coverage remains for N=2/6 and the seven-viable rejection; wrong/duplicate/mixed-provenance rows; ID-based probability mapping; the positive-probability fallback; raw-logit/mean-log equivalence; exact/near ties; and readout defaults/overrides. These are targeted contract tests, not an aesthetic benchmark. Original tiny v1 outputs were not modified; v2 remains a training-motivated engineering diagnostic.
