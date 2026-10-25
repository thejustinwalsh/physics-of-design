# Local selector and training evidence

The 0.8B checkpoint fits this 16 GiB host substantially more comfortably than the original 4B profile. It is **not a validated design judge**. Both are pinned, explicit profiles; one checkpoint runs per request, and the original 4B profile remains the coding-agent experiment baseline. This was a memory-fit investigation of one smaller candidate, not a model tournament.

| Recorded probe    | 4B, 16k prompt cap | 0.8B, 4k prompt cap |
| ----------------- | -----------------: | ------------------: |
| GGUF bytes        |      2,740,937,888 |         532,517,120 |
| Peak footprint    |    3,952,940,648 B |     1,229,473,880 B |
| Maximum RSS       |    2,135,146,496 B |     1,673,658,368 B |
| Process wall time |            44.72 s |              7.18 s |

The real inference input was the same 984-token prompt. Different context allocations and concurrent system load prevent a size-only latency attribution. Eight CPU threads, no GPU-layer offload, no generated tokens. [Raw measurements](../evidence/model-fit), [4B provenance](../research/selector-provenance.json), [tiny provenance](../research/tiny-selector-provenance.json). Publisher general benchmarks do not establish quantized design preference quality.

The first real tiny forward probe used six original candidate pairs, each rendered at 390, 834 and 1440. The candidate array was then reversed. Only **1/6** decisions stayed the same. Its normal-order choices matched **2/9** directional synthetic Astra judgments. The two judgments per project are correlated; this is not nine independent human samples. [Original report](../evidence/tuning/probe-tiny-v1/report.json).

The balanced diagnostic canonicalizes every prompt-bearing candidate sequence, then reads all N cyclic option rotations in one SemIf process. Every candidate occupies every answer slot once. Finite option logits are averaged; if logits are absent, strictly positive log probabilities are required. Zeros are not silently floored. Complete row count, identity, model/checkpoint, prompt protocol and option mappings are checked before selection. More than six viable choices is rejected in balanced mode; zero/one viable choice still bypasses inference. Returned data contains a choice and provenance, with no confidence or beauty score.

The real balanced follow-up was **6/6 order-stable**, but still matched only **2/9** directional Astra judgments: 2/5 training judgments and 0/4 held-out judgments. Slot balancing fixed an observed protocol weakness; it did not establish useful aesthetic judgment. This diagnostic revisited the same batch after inspecting its earlier behavior, so its held-out subset is no longer fresh evaluation for changes to the readout procedure. No numerical aesthetic equation, prompt or weights were fitted to these labels. [Balanced report](../evidence/tuning/probe-balanced-v2/report.json).

Two isolated Astra reviewers inspected all 36 images. They agreed exactly on 3/6 choices, with no opposing directional votes; other differences were ties or an explicitly disclosed abstention. [Synthetic review](tuning-review.md). The four training projects are too few and too confounded to justify numerical taste calibration. The full-composition Fieldwork reviews are a different evidence stream, not additional labels silently pooled into this batch.

`training export` validates project holdout, state/font receipt identity, content preservation, teacher provenance, and image evidence coverage. An explicit `evidenceRoot` joins manifest-relative image names to rating paths without basename-only matching or traversal. Original manifest hashes and raw labels remain intact. Directional examples are exported separately for train/held-out; raw ties/abstentions remain excluded with reasons and evidence. **No weight training has run.** The versioned dataset, scripts and provenance can be transferred to an authorized training host after source checkout. A larger controlled dataset and fresh holdout are required before claiming a competent preference model.

[Independent Astra code review](selector-code-review.md) found and verified fixes for empty-diagnostic infeasibility, scenario audit collisions, wrong readout protocols and unrelated image evidence. Distinguishing fixtures are labeled protocol fixtures; they do not impersonate inference. Real 4B inference also passed through the corrected pinned protocol in the complete verification lane.
