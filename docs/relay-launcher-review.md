# Relay launcher independent review — 2026-10-25

The three reproduced failures below were closed by the focused recheck recorded at the end of this report. The original findings and pre-fix evidence remain historical. These findings concern the launcher and recorder, not the quality of any Relay implementation. No actual model, external network, Expo or native runtime was invoked. All protocol/model/token values in the probes are synthetic. The local Git fixture uses a local bare remote.

Reviewed source identities before fixes:

- `scripts/run-relay-builders.mjs`: `c4f8534d54c7b8e86f6aeca99e487f34caaf6117afe7968d22f47197afc38af9`
- `scripts/design-builder-metrics.mjs`: `df46b8cae963b7753b86f892ad81fb8d08776f1ed585f9d59be6c7390c53f12d`

## Findings

1. **High — a surviving child can outlive recorder shutdown and the resource lease.** At `scripts/design-builder-metrics.mjs:359`, the app-server `close` handler cancels the process-group SIGKILL scheduled at line 285. A child in that same process group, with ignored stdio and a SIGTERM handler, remains alive after its parent closes. `probe.mjs` observed the child alive 1,300 ms after `recordSession` returned; its `finally` explicitly killed that probe child. This is an observed cleanup failure, not a conjecture about timing. Keep cleanup escalation active until the process group has been checked and terminated, await cleanup before resolving the session, and retain the resource lease if cleanup cannot be established. `runBuilders` also reaches its lease release after errors that skip its normal final port check; resource checks belong on failure/cancellation paths too. Detached descendants require separate ownership-aware tracking; checking only three TCP ports cannot establish their disposal.

2. **High — resolved permissions and working directory are not validated before inference.** `validateResolvedThread` at `scripts/run-relay-builders.mjs:753` checks `sandbox.type` but no roots, network flag, temporary-directory policy or cwd. `probe.mjs` supplied the exact expected model/effort/CLI with `cwd: '/wrong-workspace'`, `writableRoots: ['/']` and `networkAccess: false`; validation succeeded. The CLI 0.164.0 saved schema explicitly exposes top-level `cwd` and the sandbox fields. Compare effective returned permissions and canonical cwd with the common intended policy before `turn/start`, including documented implicit roots and any experimental permission-profile representation actually returned by the installed server. This probe establishes validator acceptance; it does not claim the real server returned those wrong settings.

3. **High — prepared app inputs can diverge without blocking qualification or launch.** `prepareExperiment` records `b.template`, but no subsequent code asserts that snapshot. `inputs-probe.mjs` reuses the current local Git harness fixture, replaces only Sol's `app/src/App.jsx` after preparation, and calls qualification with the synthetic installer. Qualification returns `ready: true` while the current shell hash differs from the saved prepared hash. Before each first builder turn, the launcher checks pinned package versions but not app input equality. Check the complete prepared app input tree at qualification and immediately before each builder starts; detect extra files and symlinks as well as changed known files. Once the builder starts, its own app source is intentionally mutable.

## Reproduction

Run from the repository root:

```sh
node artifacts/relay-launcher-review/probe.mjs
node artifacts/relay-launcher-review/inputs-probe.mjs
```

Recorded pre-fix outputs are [result.json](../artifacts/relay-launcher-review/result.json) and [inputs-result.json](../artifacts/relay-launcher-review/inputs-result.json). Probe source is retained beside those receipts. The input probe extracts existing synthetic fixture helpers from the harness test to avoid adding a second preparation fixture; changes to those helper names may require updating this probe.

## Scope and remaining limits

The current exact model assignments, high effort, explicit null timeout, pre-turn model rejection, latest-cumulative-token replacement, fsynced raw usage journal, source JSON reprojection and explicit `claimsVerified: false` are consistent with the stated protocol on inspection. This review does not certify renderer authenticity or feature completion from output bindings or reports.

The Expo producer/adapter contract remains pending with the integration owner. This review does not qualify its platform receipts, the fresh actual model acknowledgements, publication, the full verification lane, native device access or host exclusion of unrelated processes. It also does not claim that copied toolkit sources are an adversarial security boundary: the builder workspace remains writable and immutable-source changes are checked after work. Resource exclusivity and input equality need the corrections above before the recorded matched comparison can rely on them.

## Closure recheck — 2026-10-25

All three independent reproductions now pass against launcher `6844a9290bd2b7e57cbd64238cd117edf307b2202d8c3efd32b4013da9b45e49` and recorder `2fc0903c249202a822d27e56d0a9f3ed1417633eb3a32599a1a73a4be41cbb0b`:

- The original resistant same-group descendant is absent after `recordSession` returns. Its receipt records `confirmedEmpty: true` and `forced: true`. The launcher now performs cleanup checks in its finalization path and retains the lease when cleanup is unknown.
- The wrong cwd/permission object is rejected. The saved **actual CLI 0.164.0 no-inference response** is accepted by the current validator; its raw-stream hash matches, configuration is unchanged, usage is null, and its request journal contains zero `turn/start` requests. Nine separate synthetic mutations of cwd, thread cwd, writable roots, runtime roots, network policy, both temporary-directory flags, environment cwd and permission profile are rejected. Reading this existing response made no new model or server call.
- The same Sol-only shell mutation is rejected at qualification with `Prepared application tree changed for sol`. Full prepared app trees are also rechecked before the first builder turn, with only the real top-level dependency directory exempted.

The combined recorder/startup/cleanup/launcher suite passed **34/34** synthetic tests on this recheck. [Closure receipt](../artifacts/relay-launcher-review/closure-receipt.json) records source and evidence hashes. The independent reruns are [process result](../artifacts/relay-launcher-review/closure-process-result.json), [input result](../artifacts/relay-launcher-review/closure-inputs-result.json) and [permission result](../artifacts/relay-launcher-review/closure-permissions-result.json); each has a corresponding `closure-*-probe.mjs`. [Test output](../artifacts/relay-launcher-review/closure-tests.txt) retains the suite result. Historical pre-fix probes/results were preserved.

No additional blocker was found in this focused closure review. This is not authorization to bypass the outstanding launch gates: the integration owner still needs the final Expo producer/adapter, complete source/device/commit linkage, exact full v4 stage-order validation, fresh actual model acknowledgements and published checkpoint. At recheck time, the launch gate still accepted any nonempty supplied `verifiedSources` list and a provisional platform envelope; that completeness responsibility must be resolved by the final producer adapter. Cleanup covers owned process groups, declared runtime PIDs and reserved ports, with unreported detached processes remaining an explicit limit.
