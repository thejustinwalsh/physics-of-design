# Final core integration review

Review date: 2026-10-25. This was a read-only review of the CLI/catalog, durable and session references, compact summaries, command exports, selector subprocess boundary, relational kernels, output bindings, and the stable parts of the metrics recorder. No model inference, fixture publication, or source implementation edits were performed. The parent was notified of each confirmed finding before this report was written.

Three defects were reproduced. Their status below describes the source at the time of the probe; a subsequent fix needs a fresh probe result, not replacement of this historical receipt.

Update after the integration fixes: all three original findings are **closed by fresh executable evidence**. The rebuilt JavaScript rejects both reference-amplification cases and all four malformed-manifest cases. The invalid selector output now retains input, output, stdout, stderr and a failure receipt identifying the output-validation phase. See `artifacts/final-core-review/boundary-probes-fixed.json` and `selector-invalid-output-fixed/probe.json`; the original failures remain preserved. The closure lane passed 24 focused core tests and all 11 metrics tests. Source inspection and an additional cancellation probe identified one startup race described below; it is confined to the metrics recorder.

## 1. Reference expansion is not bounded by the file/cache budget

Priority: P1, resource bound.

`resolveDesignFileReferences` limits unique file reads to eight files, 16 MiB each and 32 MiB total. `ResultStore` limits stored results. Both then clone the selected value independently for every reference occurrence without charging the expanded request. A single 2,097,154-byte JSON value referenced 20 times was accepted by each path and produced 41,943,101 bytes of resolved JSON. More occurrences scale the allocation independently of either advertised storage/read bound.

The reproducer is `node --import tsx artifacts/final-core-review/probe-boundaries.mjs`; the saved result is `artifacts/final-core-review/boundary-probes.json`. It uses local synthetic data and no renderer or model. The repeated-file snapshot behavior itself is useful and should remain, but an expanded byte/node/depth budget must be checked before allocating each clone. Test repeated references to the same value, large subtrees selected by pointer, wide arrays and excessive nesting through both transports.

## 2. Imported binding manifests bypass the resolver's structural invariants

Priority: P2, inconsistent verification contract.

`resolveOutputBindings` validates platform/property units, numeric versus string values, unique binding targets, and equality of source payload identity and current result identity. `checkOutputBindings` parses the manifest schema and verifies its hash but does not reapply those invariants. The same boundary probe created correctly hashed manifests with each of the following contradictions, and every case returned `complete: true`, `verified: true`:

- A web height binding and observation both declared `dp` instead of `css-px`.
- `sourceValueIdentity` differed from `current.resultIdentity`.
- Two bindings targeted the same scenario/platform/surface/property.
- A numeric layout unit carried the string expected value `"48"`, matched by a string observation.

These cases concern internal consistency, not authentication. A hash can identify a caller's declaration without making that declaration satisfy the public constructor's rules. Share invariant validation between resolve and check, including unique IDs/targets and valid expected-value type/tolerance. Matching caller-supplied renderer observations should continue to mean value consistency only; this review does not propose claiming causal consumption or trusted authorship from a digest.

## 3. Successful process exit followed by invalid selector output loses the failure audit

Priority: P2, reproducibility.

`selectPinnedLocalOptions` saves diagnostics for `execFile` rejection, but JSON parsing, schema checks and candidate/model provenance checks happen outside that catch. Raw output is copied into the audit directory only after validation succeeds. The temporary directory is always removed. A synthetic provider that exits zero after writing invalid JSON was rejected as expected, but its audit directory retained only the input file; the bad result and its stderr disappeared.

Run `node --import tsx artifacts/final-core-review/probe-selector-invalid-output.mjs`. The saved `selector-invalid-output/probe.json` records the error and remaining audit files. The peer is a local Node script with synthetic checkpoint bytes; it performs zero neural inference. Preserve bounded raw provider output and process diagnostics before parsing, and retain a bounded parse/schema/provenance failure receipt. Keep these failures out of completed-readout counts and keep raw provider text outside compact model context.

## Checks that passed

The focused source lane passed 29 tests across file references, compact context, output bindings, relational kernels and selector subprocess failure handling. Three additional CLI/MCP tests passed: Unix stream behavior, hash-bound compact CLI reuse, and the three-tool MCP discovery/reference path. Six stable metrics parsing/usage tests also passed. Logs are `artifacts/final-core-review/focused-tests.log`, `transport-tests.log` and `stable-metrics-tests.log`. This review did not repeat the earlier 79 runtime/field tests.

The following boundaries were inspected without a new confirmed defect:

- CLI reference reads require explicit opt-in, bind exact bytes, keep references embedded in loaded receipts inert, and reject stale hashes. File reads use one open descriptor and bound growth after the initial stat.
- CLI and MCP share catalog schemas and command dispatch. Compact MCP discovery exposes three tools, and specific schemas are fetched on demand. Recipes and workflows are carried by references rather than duplicated into summaries.
- Kernel numeric stages use the existing workflow/search engine. Named categorical alternatives retain units and complete aliases. Platform/unit and source/input checks precede compilation; emitted kernel outputs freshly evaluate selected assignments and verify the bound program identity before exposing values.
- Region allocation preserves all declared regions and rejects impossible minima. A linked `textWidth` is the observed text block allocation used to preserve its measured wrapping conditions; it is not an intrinsic glyph width or a universal preferred measure.
- Appearance candidates run the declared palette/material/motion analyzers. Their output still requires actual composite, native support, reduced-motion and interaction observations. Authored preference residuals are not treated as aesthetic evidence.
- The current kernel proof explicitly compares the earlier BrowserRenderer specimen's selected measurements with projected expectations. It does not establish that a completed Relay app consumed those values. That scope is accurate and should remain visible when builders generate their own observations.
- Stable metrics code keeps the latest cumulative token report instead of summing snapshots, retains unknown usage as null, preserves raw/journal evidence, and distinguishes interrupted turns from observed completion. No metrics model call was made for this review.

## Limits and checkpoint decision

The initially excluded cancellation/AbortSignal section was reviewed after its owner declared a freeze. Active-turn cancellation correctly sends an interrupt, drains late usage, records `cancelled: true` separately from timeout and keeps the latest cumulative report. The synthetic active-turn test preserves the peer's final counter of 30; that is a protocol fixture value, not model usage. All 11 metrics tests passed in `artifacts/final-core-review/closure-metrics-tests.log`.

One additional P2 cancellation race remains at this review point. If abort occurs while the `turn/start` reply is pending, no turn ID is available for the initial interrupt. When the reply and started notification arrive within the grace period, the recorder learns the ID but never attempts the interrupt again. The synthetic peer is killed at drain expiry, and its final interrupt-triggered report is missed. `probe-cancel-during-start.mjs` and `cancel-during-start/probe.json` reproduce this: recorded requests stop at `turn/start`, `turnId` becomes `u`, the latest counter is 20, and no interrupted completion arrives. An idempotent interrupt sender should run both when cancellation begins and when a pending start later establishes the turn ID, without extending the original grace deadline.

The original three core findings are cleared for the next actual selector proof. The metrics startup race needs its own fix and re-probe before the unbounded builder run. The new launcher and Expo work belong to their separate reviewers. This review made no real selector call and did not revalidate the native app, whole Relay application, browser interactions, or human preference evaluation. The parent's current two-readout proof is separate evidence, not a result generated here. The scope remains bounded transport, internally consistent bindings, valid numeric consequences and reproducible failure records; none establishes whole-application quality.
