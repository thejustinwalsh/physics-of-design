# Run the matched Relay experiment

The launcher prepares three independent implementations from one published commit. It does not create the Relay UI, run a builder during preparation, or certify a builder's report as true. The common contract is [BRIEF.md](../experiments/relay/shared/BRIEF.md), [DESIGN.md](../experiments/relay/shared/DESIGN.md), [TOOL-COVERAGE.md](../experiments/relay/shared/TOOL-COVERAGE.md) and [REPORTING.md](../experiments/relay/shared/REPORTING.md).

The user requested the GPT-6 families. The exact policy is **Luna `gpt-6-luna`, Sol `gpt-6.1-sol`, Astra `gpt-6-astra`**, all at **high** effort, using the same default service tier, tools, prompt and two documented Expo web tuning rounds. There is no wall-time limit: every session passes `timeoutMs: null`. Actual iOS and Android core flows remain required. The older `gpt-5.6-luna` and `gpt-5.6-sol` acknowledgements are historical transport probes and cannot qualify this experiment. The launcher rejects substitution before starting a builder turn.

The installed CLI must be the qualified `0.164.0`. Fresh acknowledgements for these exact models, current CLI and common isolation arguments must complete and emit actual usage before launch. A model catalog or handshake alone is insufficient. The [app-server protocol](https://learn.chatgpt.com/docs/app-server) supplies thread settings, streamed items, usage notifications and interruption; the installed schema and preserved responses establish the concrete local contract.

## Preparation and gates

Use a new private temporary directory. The commit must be a full SHA whose configured remote branch currently resolves to exactly that SHA. Preparation reads Git objects rather than the dirty working tree. It does not fetch, push, create a worktree, change host trust, copy authentication, or alter HOME/CODEX_HOME.

```sh
node scripts/run-relay-builders.mjs prepare \
  --repo /path/to/design-theory \
  --commit FULL_COMMIT_SHA \
  --remote origin --ref refs/heads/BRANCH \
  --out /private/tmp/relay-matched-RUN_ID \
  --gate /private/tmp/relay-launch-gate.json
```

The gate records actual receipt references and a source snapshot:

```json
{
  "commit": "FULL_COMMIT_SHA",
  "verification": {
    "path": "/absolute/current/summary.json",
    "sha256": "BYTES_HASH"
  },
  "platform": {
    "path": "/absolute/current/expo-platform-gate.json",
    "sha256": "BYTES_HASH"
  },
  "verifiedSources": [
    {
      "path": "src/energy.ts",
      "byteLength": 123,
      "sha256": "BYTES_HASH",
      "mode": "100644"
    }
  ],
  "devices": {
    "ios": "EXPLICIT_SIMULATOR_UDID",
    "android": "EXPLICIT_ADB_SERIAL"
  },
  "selector": {
    "profile": "qwen3.5-4b",
    "revision": "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
    "executable": {
      "path": "/absolute/frozen/semif-local.sh",
      "sha256": "BYTES_HASH"
    },
    "sources": [
      { "path": "/absolute/frozen/stream-wrapper.py", "sha256": "BYTES_HASH" }
    ],
    "checkpoint": {
      "path": "/absolute/Qwen3.5-4B-Q4_K_M.gguf",
      "sha256": "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"
    }
  }
}
```

The verification reference must resolve to the ordered lane's actual `summary.json`, with `verificationVersion: 4`, `scope: "full"`, `complete: true`, `passed: true`, and the exact ordered 34 stages from `assertFullVerification`. Missing, repeated, reordered, failed or older stages reject the gate.

The lane captures source records before its first stage and after its last stage. A source record contains `path`, `byteLength`, `sha256` and Git-style executable `mode`. `sourceSnapshotVersion: 1`, `sources`, `sourceIdentity`, `sourcesAfter`, `sourceIdentityAfter`, `sourceStable: true` and `sourceSnapshotError: null` must agree. Even 34 successful stages produce `passed: false` if source bytes, modes or the file set changed. `gate.verifiedSources` must equal the complete receipt source array, and preparation independently derives the complete matching source set from the published Git tree. A self-consistent receipt omitting a published source therefore fails. Source hashes bind evidence; they do not authenticate test execution.

The shared predicate in `scripts/verification-sources.mjs` includes `src`, `scripts`, `test`, `codemods`, `native`, `examples`, `experiments`, `assets`, `fonts`, the Design Theory skill, and root package/lock, tsconfig, AGENTS and white paper files. It lists tracked and untracked non-ignored files through Git, then excludes explicit generated dependency/build/cache/runtime directories. Symlinks are unsupported. Root narrative documentation remains outside this execution snapshot. Consumed generated source stays included: run `npx tsx scripts/vela-design.ts` before freezing the lane so `examples/vela/problem.json` and `examples/vela/design.generated.json` are already synchronized. Publish kernel fixture inputs before freezing if needed; the ordinary kernel stage does not use `--publish-input`. Keep Expo's generated design source synchronized before the lane as well.

The platform reference points to an envelope with actual spike and independent blank-shell receipts:

```json
{
  "version": 1,
  "kind": "relay-platform-gate",
  "spike": {
    "path": "/absolute/artifacts/expo-design-theory/proof.json",
    "sha256": "BYTES_HASH"
  },
  "template": {
    "path": "/absolute/artifacts/expo-template-smoke/proof.json",
    "sha256": "BYTES_HASH"
  }
}
```

The launcher loads both hash-bound receipts and calls the canonical `validateExpoProof` and `validateTemplateProof` against the repository. The validators recheck retained artifacts, current source and selected values, required web/native geometry and input records, and the separate minimal shell's exact bytes and platform transitions. Boolean-only platform summaries are rejected. Missing, partial or stale native or shell evidence blocks preparation. The current producer does not record device IDs, so the gate's explicit simulator/emulator IDs configure future builder runs; the launcher makes no claim that it compared those IDs to the earlier platform receipts.

The shared input manifest must include REPORTING and the compact relational recipe plus its hash-bound measurements. Preparation checks every listed byte length/hash. Toolkit source, scripts, tests, the Design Theory skill/references and selected documentation are copied equally. The original published AGENTS.md and skill are available in each workspace. Builders load only relevant facets. Other example app implementations are not copied.

The Expo allowlist copies pinned integration configuration, entry point and approved primitive adapters. Preparation replaces the spike's product UI with the same minimal RSD/SafeAreaProvider shell. It does not copy its content, generated design, ready-made app or fixed-port session launcher. The only per-builder changes are disclosed metadata, bundle/storage namespace and runtime ports. The shell is a starting integration artifact; the original spike's native proof does not certify the newly built app.

The prepared app snapshot includes every directory, regular file, content hash and executable bit. Before its first actual turn, additions, removals and edits invalidate preparation. The only excluded generated directory is the real top-level `node_modules`, created from the pinned lock. Hidden files, evidence directories, alternate caches and symlinks are not exceptions. Qualification checks all three app trees before and after installation, including cross-builder changes; the thread-start validation checks the selected app again immediately before permitting inference. A `starting` state alone does not make inputs mutable. Only the recorder's actual turn-start callback records `actualStartedAt` and transitions the builder to `running`.

All style/platform package declarations must be exact versions matching the lockfile. Transitive StyleX/Lightning CSS lock versions and integrity values are also pinned. Preparation will not rewrite a caret or resolve a different version silently. `policy.json` declares the package set and template allowlist. The template must be pinned upstream before the published checkpoint.

## Qualify, launch, inspect and cancel

Create a private mapping from builder name to each fresh acknowledgement receipt directory:

```json
{
  "luna": "/private/tmp/ACTUAL_GPT6_LUNA_HIGH_QUALIFIER",
  "sol": "/private/tmp/ACTUAL_GPT61_SOL_HIGH_QUALIFIER",
  "astra": "/private/tmp/ACTUAL_GPT6_ASTRA_HIGH_QUALIFIER"
}
```

```sh
node scripts/run-relay-builders.mjs qualify --run /private/tmp/relay-matched-RUN_ID --receipts /private/tmp/relay-qualifiers.json
node scripts/run-relay-builders.mjs run --run /private/tmp/relay-matched-RUN_ID --builder all --authorize
node scripts/run-relay-builders.mjs status --run /private/tmp/relay-matched-RUN_ID
node scripts/run-relay-builders.mjs cancel --run /private/tmp/relay-matched-RUN_ID --reason "Operator cancellation"
node scripts/run-relay-builders.mjs cleanup --run /private/tmp/relay-matched-RUN_ID
```

Qualification starts no model. It verifies each acknowledgement's resolved model/high effort/CLI, completed usage notification, unchanged configuration and raw stream/journal hashes; all isolation arguments must match. It installs the exact locks and builds the toolkit separately in each workspace. npm/Expo generated state uses the private builder cache. The emitted toolkit runtime joins the immutable snapshot. The qualifier's metrics-helper hash may differ from the current helper after a reviewed transport fix; both identities and the difference are recorded. Changing the current helper after qualification requires a new prepared/qualified run.

`--authorize` is an explicit operator action, not an additional user approval requirement after the human has already authorized the experiment. It prevents accidental launch from preparation/status commands. The root integrator must finish the publication and gates before invoking it. There is no default downgrade, fallback coding model, opportunistic subagent or rerun with a different model.

Runs are sequential in the recorded Luna/Sol/Astra order. One exclusive host lease covers coding-model execution, the local 4B selector and native runtime access for the whole build. No independent selector queue is needed under this policy. Ports are distinct and checked on IPv4/IPv6 before and after each run; simulator/emulator IDs are explicit. The lease does not control unrelated external processes, so the operator must keep those resources exclusive. The gate binds the same external local selector executable, runtime sources and checkpoint for all builders. They receive identical SELECTOR.json files and `DESIGN_SEMIF_BIN` pointing to that executable; no checkpoint or authentication is copied. The launcher streams hashes of these files before and after work without loading the multi-gigabyte checkpoint into memory. The copied relative `semif-local.sh` is not used to guess a private runtime. Neither coding models nor the local selector receive an imposed wall-time limit; finite candidate domains and arithmetic bounds remain explicit.

Every exit path checks the recorder-owned process group, every declared runtime PID and all assigned ports before releasing the lease, including cancellation, startup rejection, malformed reports and unexpected exceptions. The recorder awaits cleanup of its own process group. The launcher never kills an unverified PID or treats a report's `stopped: true` as proof: it checks whether the PID actually remains present. A run with tool execution must provide `runtime-processes.json`, with an explicit empty `processes` list if no external runtime was started. Missing process evidence or occupied resources leaves the lease in `cleanup-blocked` and stops the sequence. `cleanup --run` rechecks an explicitly retained lease and releases it only when these checks pass; it does not take over a held lease or signal processes. Missing recorder evidence remains unresolved. These checks do not discover unreported detached processes or authenticate a builder's declarations.

SIGINT, SIGTERM or `cancel` sends an AbortSignal to the recorder, which interrupts and drains the current turn. A cancellation is separate from a timeout. Already-reported cumulative usage remains on disk; no notification means unknown. A cancel request prevents later builders from starting. Existing runs are not silently restarted, and stale leases are not automatically taken over. Inspect retained evidence before preparing another run.

## What the receipts establish

Each builder gets the same prompt bytes and a BUILDER.json containing exact assignments, input/source identities, runtime ports and pinned dependencies. Before any inference, the resolved thread settings must match its exact model, CLI, effort, tier and permission policy. `on-request` routes approvals to the server's `auto_review` reviewer. The launcher never sends blind client approvals or edits trust records. Unexpected interactive requests remain explicit transport failures.

The permission contract also checks both resolved cwd fields, runtime workspace roots exactly equal to the builder workspace and private cache, and explicit sandbox writable roots equal to the private cache. Network access must be enabled, both implicit temporary-directory write allowances must be excluded, and any returned environment must be the same local workspace. Each process gets `TMPDIR` inside its private cache. An unverified active permission profile, global npm/cache root, slash root or mismatched setting rejects the thread before a turn starts. These are per-thread settings, with no host configuration rewrite. A separate no-inference workspace-write startup probe must establish that the installed CLI resolves this exact contract; read-only model acknowledgement probes alone do not prove it.

The recorder fsyncs actual usage notifications and raw events. Totals replace prior totals; cached input and reasoning output are preserved without double counting. `status` reads the latest recorded snapshot. Completion and usage coverage remain separate facts; even a completed turn is not a billing-completeness certificate. Host configuration/instruction hashes and immutable inputs are checked before and after, including failure paths. The launcher itself writes only its private output tree; the app-server may maintain its normal authenticated runtime state, which is not copied into builder workspaces.

`tool-trace.json` is extracted from actual app-server item events, retaining item IDs, command/tool details, status and raw-stream locations. It reports rerouting/delegation and incomplete framing. A successful shell item does not establish how many nested numeric states were evaluated or whether a toolkit value influenced a surface. Those require the toolkit's own receipts and binding evidence.

Builders save `app/evidence/output-bindings.json` with:

- `sources`: `{identity,path}` entries for selected JSON outputs. Identity is the toolkit's canonical `hash(parsedJSON)`; paths are relative to app.
- `rendererReceipts`: `{ref,path,sha256}` entries for actual saved renderer output. The hash covers file bytes; each observation's `resultRef` must be present.
- `checks`: ordinary `{operation:'check',manifest,current,observations}` requests.

The harness reprojects each manifest from its saved source JSON, checks current application/design identities, verifies source-location files and saved receipt hashes, then runs `checkOutputBindings`. All twelve representative surfaces need verified bindings on every required platform. A recorded unsupported result remains distinct from verified support. These consistency checks do not authenticate the renderer or replace an independent functional/native review.

Use `node toolkit/scripts/run-relay-builders.mjs source --app app` to obtain the current app source identity. It saves the full snapshot to `app/evidence/source-manifest.json` and prints only identity, file count and file reference. It hashes sorted file records containing relative path, byte length and SHA256. Dependency/build/cache/evidence directories (`node_modules`, `dist`, `web-build`, `.expo`, `build`, `Pods`, `.gradle`, `.cxx`, `.git`, `evidence`) and the two final reports are excluded. Source symlinks are unsupported. Recompute after source/content/config changes. `current.designIdentity` uses the immutable DESIGN.md byte hash in BUILDER.json.

The two tuning rounds, runtime process disposal, BUILD-REPORT.md and machine-readable report are retained and inspected for completeness. Every builder reports wins, misses, friction, improvements and synthetic self-critique, with all failures/unsupported features. The orchestrator supplies actual token/model receipts. A completed builder is labeled `completed-needs-review`; no authored report automatically becomes a passing app result. Infrastructure failure, changed inputs/settings, rerouting or cancellation stops the sequence. Independent review determines functional and visual acceptance from current executable evidence.

## Test scope

`node --test test/relay-builder-harness.test.mjs` uses temporary local Git repositories and synthetic protocol peers. It checks publication/input tamper guards, whole prepared-app trees, exact model/null-time/permission policy, qualifier evidence, actual turn-start state, event extraction, source invalidation and cancellation with late usage retention. Cleanup regressions cover preflight port conflicts, malformed reports with an occupied port, a declared live PID falsely marked stopped, unknown recorder state and explicit cleanup rechecks. Fixture token counts are test data. These tests make no actual model or external network calls and do not qualify the real builders.

The experiment compares three specific versions on one brief in a fixed order. It can expose usability problems and different outcomes. It does not establish a universal model ranking, a toolkit-versus-no-toolkit token advantage, human preference or hardware energy performance.
