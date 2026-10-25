# Preserve reported token usage before a timeout

The existing paired trial cannot determine which arm used fewer tokens: its timed-out guidance run has no final usage event. The completed treatment's real usage cannot fill that gap. No estimates, account-wide usage subtraction or rerun are used to reconstruct the missing value. The original runner, protocol, evaluator and trial workspaces remain unchanged.

The new [metrics helper](../scripts/design-builder-metrics.mjs) records the local Codex app-server stream. It preserves `thread/tokenUsage/updated` notifications before a turn finishes, so a later timeout does not discard usage already reported. This changes the transport for a **future** trial; it does not repair the old receipt or prove a final billed total after interruption.

## Protocol evidence

The installed `codex-cli 0.153.2` generated the schema using `codex app-server generate-json-schema`. Its `ThreadTokenUsageUpdatedNotification` requires `threadId`, `turnId` and `tokenUsage`, containing `total` and `last` breakdowns. Each breakdown reports input, cached input, output, reasoning output and total tokens. Optional fields remain as supplied. The pinned notification schema SHA256 is `aba4f6c7e4a19b2b842c08ee793b57000c07dafd57b922ad0d8e7c76609108c2`.

The official [app-server protocol](https://learn.chatgpt.com/docs/app-server) documents newline-delimited JSON over stdio, initialization, streamed usage notifications and turn interruption. Installed schemas are the implementation contract used here; future CLI versions should generate and retain fresh schemas before use. Schema existence does not establish how frequently a provider emits usage or whether an interrupted final request reports all consumed tokens.

## Recording and interpretation

The helper starts one fresh ephemeral thread and one turn. It keeps raw stdout bytes, outbound requests, stderr, resolved thread settings, usage notifications, an atomic latest-usage snapshot and a final receipt. Each usage notification causes the raw stream and exact usage journal to be fsynced before the latest snapshot is replaced. A crash can therefore recover the last journaled report even if the final receipt was never written. Raw stream and journal SHA256 values bind the final receipt.

`tokenUsage.total` is a cumulative snapshot. New reports replace the prior snapshot; duplicate notifications are retained but never added together. Cached input and reasoning output remain separate provider fields: they are not added again to reported input/output/total counters. The helper preserves decreases as actual reported values and flags the regression instead of repairing it with a guessed maximum. Other-thread/other-turn reports cannot supply missing usage.

At the wall-time limit, the helper saves the latest report, sends `turn/interrupt` when an active turn is known, drains notifications for a bounded grace period and terminates the process group. An interrupted receipt explicitly says **latest reported cumulative usage; unreported tail unknown**. No notification means `reportedUsage: null`. A completed-turn event and the latest reported usage remain separate facts; the helper does not certify billing completeness.

The timeout begins at process spawn, including handshake and thread setup. Interrupt/drain latency is separately visible in total wall time; it is not extra builder work authorized by the timeout. Unexpected server approval/input requests fail explicitly: this client does not silently approve requests. For an authorized future builder, callers may supply the supported per-thread approval policy/reviewer and sandbox settings, including automatic approval review where appropriate.

## Use without changing user configuration

```sh
# Generate version-bound schema evidence; no model call.
node scripts/design-builder-metrics.mjs schema /private/tmp/new-metrics-schema

# Initialize transport only; no thread or model turn.
node scripts/design-builder-metrics.mjs probe /private/tmp/probe-spec.json /private/tmp/new-probe-receipt

# Future, explicitly authorized single-turn run.
node scripts/design-builder-metrics.mjs run /private/tmp/run-spec.json /private/tmp/new-run-receipt

node --test test/design-builder-metrics.test.mjs
```

A run spec has `cwd`, `prompt`, `timeoutMs`, optional `interruptGraceMs`, `appServerArgs`, `threadStart` and `turnStart`. Set `timeoutMs: null` for the user-requested unbounded Relay runs; no budget timer is installed, and the receipt records `wallTimeLimitMs: null`. Omission is also unbounded. A probe needs only `cwd` plus optional timeout/arguments. The output directory must be new. Pass model/effort only when the experiment explicitly assigns them; omission preserves the configured values. Record exact arguments and resolved thread settings for both conditions. Do not transfer the previous experiment's model amendment implicitly.

`appServerArgs` accepts supported per-run overrides; `threadStart.config` and explicit thread/turn properties support local settings without writing the user's config. The helper does not use `--approve-for-me`, change HOME/CODEX_HOME, copy authentication material or write trust records. It hashes the existing config before and after and records any difference; it does not erase unexpected changes. Future comparison orchestration must validate equal effective settings and reject unexplained changes. No claim is made that every possible server operation leaves configuration unchanged.

This helper does **not** itself enforce skill/asset/condition isolation. A future launcher still needs the predeclared workspace, skill exclusions, prompt-context inspection, asset identities and permission policy from the paired-trial protocol. Raw prompts, stream content, host identifiers and configuration diagnostics can be private; do not publish them without review. Do not supply authentication secrets in the spec.

## Validation performed

Eleven [tests](../test/design-builder-metrics.test.mjs) pass. They check fragmented UTF8/JSONL, multiple frames, malformed/oversized records, truncated tails, cumulative duplicates, unknown usage, thread isolation, invalid counters, disclosed regressions, timeout retention and interruption-drain behavior. The process tests launch a **synthetic JSON-RPC peer**, not a model: fixture token numbers are test data, never usage evidence. A real pipe/process timeout preserves the latest emitted counters on disk without a `turn/completed` event; a late interrupt report also survives; no-report timeout stays null.

A real initialize-only smoke on Codex0.153.2 completed in approximately310ms. It returned an initialize response and `remoteControl/status/changed`; no thread or model turn was started and no token-usage notification was expected. Config hashes before/after matched. Its raw stdout SHA256 is `9d9d0ba1745b96ec0800fdd0a5737a154d3222612dea810e4b71621dbbc9031e`; the empty usage-journal SHA256 is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Private evidence is retained at `/private/tmp/design-metrics-live-handshake-01532`; generated schema identities are at `/private/tmp/design-metrics-schema-receipt-01532`.

A separate real `gpt-5.6-luna`/low acknowledgement smoke completed on 2026-10-25 in 4,771 ms with one actual usage notification: 9,519 input tokens, zero cached input, five output tokens and zero reasoning output (reported total 9,524). The turn completed, the stream parsed without error and configuration hashes matched. This verifies one end-to-end model notification; it does not establish notification cadence or billing completeness for longer runs or other models. Private evidence remains at `/private/tmp/design-metrics-luna-live-20261025`; stdout SHA256 `533b876c49cc61ca40a52a1518547f93bf8dc7033784f1946449a91fcab4a29a`, usage journal SHA256 `9d3ab4b651f578bd872efb75f199fc840086dd7b2ebaee5c1dcbe1d9201907f9`. A null-budget synthetic process regression also completes naturally without timeout. Future Relay receipts must still observe their own actual usage.

The library accepts an `AbortSignal` in its third argument. Cancellation interrupts/drains an active turn, preserves latest reports and sets `cancelled: true`; it is distinct from a timeout. CLI SIGINT/SIGTERM uses this path. The unbounded synthetic cancellation regression reports its late interrupt update with no protocol error.

Thread-start validation runs before inference. The optional synchronous `onTurnStarted` callback fires once when an actual turn ID is observed, allowing the launcher to mark an app mutable at its actual start. Final receipts await owned POSIX process-group cleanup, including SIGTERM-resistant descendants; separately detached runtime groups still require launcher checks. Per-run environment overrides record names only and cannot replace HOME or CODEX_HOME.
