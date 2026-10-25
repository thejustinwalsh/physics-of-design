# Matched first-pass workflow comparison

This completed historical trial compared pinned Impeccable **text guidance only** against the frozen Design Theory skill plus its CLI/core tools on one predeclared task. Preparation preceded the amended Astra run and the actual paired results below; the preparation receipt remains historical. The [portable archive](../evidence/workflow-comparison-2026-10-25/README.md) preserves the exact runnable applications, representative screenshots, sanitized usage/completion receipts, raw 44/44 and 42/44 assertions, and adjudication. It does not compare the full Impeccable runtime, current toolkit improvements, general design quality or human preference. A synthetic interview supplies identical authored assumptions to both arms; it is not an Astra preference treated as a user's answer.

The machine-readable [protocol](../research/workflow-comparison-protocol.json) freezes the task, budget, scenarios, actions and metrics. The [complete brief](../research/comparison/brief.md) requires a new four-section workbench, two working modes, actual pointer/scroll DOM light, editable composition, current browser geometry inspection, save/replay and editable JSON export. The task is substantially more than title/prose styling.

## Conditions and equal inputs

Both fresh workspaces live under `/private/tmp`, outside this repository's AGENTS inheritance. Both receive byte-identical current `DESIGN.md`, synthetic interview, product/functional brief, neutral React/StyleX/esbuild scaffold, original SVG and OFL fonts/licenses. The scaffold contains no finished visual design or interaction implementation. They receive the same installed dependency snapshot; allowed imports are the declared React/StyleX/esbuild/Playwright tooling. Treatment additionally receives the frozen compiled toolkit, fonts, relevant API documents and skill references. Neither receives current gallery source, prior rendered outputs, prior receipts or the other condition's work.

The control guidance is read from committed Git objects at [Impeccable revision 936867543ac2576920d663cc9803597f6044f3ac](https://github.com/pbakaus/impeccable/tree/936867543ac2576920d663cc9803597f6044f3ac), including its skill, references, Apache 2.0 license and notice. Per-file SHA256 provenance stays in the private workspace. Runtime launcher/detector/model-agent steps are explicitly outside this guidance-only condition. The runner refuses an unavailable or wrong pinned checkout; it does not pretend a launcher ran or silently substitute another revision.

The attempted original configured model was rejected before task execution. The amended trial uses installed Codex CLI0.153.2 with the same per-run `gpt-6-astra` override, original `xhigh` reasoning and default service tier in both arms. Preparation records the CLI version, configured model, reasoning effort, service tier and config hash; run refuses changed settings. Identical per-run flags disable hooks, plugins, apps, memories, multi-agent work and host skill discovery, plus each configured MCP server. Explicit `skills.config` path overrides also disable all local/system skills, including symlinked skills and the CLI-materialized plugin-creator skill; the host-discovery flag alone proved insufficient in the context-only smoke. Flag availability is checked against the installed CLI. The operator did not alter global configuration, HOME, CODEX_HOME or authentication. The CLI itself automatically registered the first workspace as trusted. Removing exactly that new trust block reconstructed the original configuration SHA-256; a recorded amendment allowed the second launch with unchanged effective settings. Ordinary local implementation and Playwright remain available equally. The model-visible prompt-input diagnostic is retained before launch.

This is instruction-and-trace-audit isolation, **not OS-enforced read denial**. A workspace-write sandbox restricts writes but does not prove that outside source was never read. Immutable input hashes and command traces identify observable contamination; indirect reads can remain unknown. Full trace review is required before calling either condition compliant. Missing or failed isolation diagnostics stop the runner.

## Budget, evidence and interpretation

Each condition gets one fresh 900-second session, including reading, implementation and its own tests/corrections. No human feedback, child builders, additional model calls or post-evaluation repairs are allowed. Random neutral IDs and sequential run order are stored privately before launch. An early finish is kept; no unused time is transferred. A timeout terminates the process group and preserves partial output. Setup/evaluation time is excluded from builder latency.

The runner preserves actual `codex exec --json --ephemeral` events, stderr, final message, invocation, wall time, timeout and exit status. Only real `turn.completed.usage` events feed token totals. Missing usage is `null`, never an estimate or zero. Cached input remains a separate field and is not added on top of reported input tokens. Failed attempts remain in the receipt. The source/guidance/assets/dependency snapshot is hashed before and after each run; artifact output hashes are captured separately.

Render both artifacts with the same engines and viewport/action matrix. A neutral side-by-side index labels artifacts only with random IDs. Visible wording, source or receipts may still reveal the condition; record any unblinding. Hard failures (missing actions, overflow, moved slider rail, stale geometry/export, errors) remain separate from qualitative judgments. Human preference has not been measured. A labeled synthetic review can discuss hierarchy, character, coherence and usability but cannot establish aesthetic superiority. One paired task cannot establish general token savings or quality improvement; cache/server/load differences and unequal guidance lengths remain part of the observed run.

## Execute and inspect

From the repository root:

```sh
node scripts/compare-design-workflows.mjs prepare /private/tmp/design-workflows-new-trial
# Inspect manifest.private.json, prompt inputs and exact random order.
node scripts/compare-design-workflows.mjs run /private/tmp/design-workflows-new-trial guidance
node scripts/compare-design-workflows.mjs run /private/tmp/design-workflows-new-trial toolkit
node scripts/compare-design-workflows.mjs audit /private/tmp/design-workflows-new-trial
node scripts/compare-design-workflows.mjs serve /private/tmp/design-workflows-new-trial 5178
# In another terminal, after both builders have finished:
node research/comparison/evaluate.mjs /private/tmp/design-workflows-new-trial http://127.0.0.1:5178
```

Run conditions in the manifest's random order (the command examples are not an order assignment). Never reuse a trial directory or run output; the runner refuses them. Builder processes need the same ordinary browser-launch permissions; inability to obtain those permissions is a reported condition limitation, not a renderer pass. Do not share private config diagnostics or unblinding mappings with blinded reviewers.

## Actual paired result

Both artifacts are frozen and independently rendered in Chromium156.0.8078.4 and WebKit27.2. They use the same Astra/xhigh/default settings and authored inputs. The toolkit snapshot predates the later candidate-retention correction; this is not a claim about that untested follow-up.

| Observation | Impeccable text guidance | Design Theory skill + tools |
| --- | ---: | ---: |
| Builder wall time | 900.024s, terminated at budget | 876.804s, normal completion |
| Final build report | Missing at deadline | Present |
| Raw external assertions | 44/44 | 42/44 |
| Actual input tokens | Unknown | 1,120,304 |
| Of those, cached input | Unknown | 1,041,152 |
| Uncached input (subtraction) | Unknown | 79,152 |
| Output tokens | Unknown | 27,700 |
| Unique command IDs in trace | 26 | 28 |

The toolkit also reports 5,545 reasoning output tokens as a separate supplied usage field; do not add it to output without establishing the provider semantics. Cached input is part of input, not additional input.

The toolkit's two raw assertion failures are the same initial `inspection-overlay` hook check in both engines. It mounts that overlay only in Inspect. The brief requires it visible in Inspect, and both later actual overlay/rectangle checks pass. This is a harness assumption discrepancy; raw failures remain unchanged. No post-evaluation repairs were made. Both outputs pass the tested reflow, long-content, three continuous/keyboard controls, save/replay, current measurement/export, reduced-motion task and page-error checks. Scroll registration changed in both engines. Endpoint images still need qualitative adjudication; variable changes alone do not establish material quality.

The guidance timeout produced no final `turn.completed.usage`, and ephemeral sessions left no attributable local usage row. Its tokens remain unknown. There is no defensible token winner. Both input/dependency/guidance hash audits are unchanged with no suspicious commands in the automated screen; indirect reads remain unprovable under this isolation method. Full command review confirms supplied guidance/toolkit use and ordinary implementation/self-tests, without outside models or assets.

These results establish working artifacts and expose a timeout-metrics flaw; they do not establish design superiority, lower token cost or a general speed benefit. Human preference is unmeasured. Preserve the failed original model launch, automatic trust amendment, actual events, raw evaluation and adjudication alongside the artifacts.

## Preparation receipt — 2026-10-25

The final private trial is `/private/tmp/design-workflows-20261025-final`. Both neutral scaffolds build successfully. The isolated toolkit reports all 61 registered commands plus its two CLI service entries, including surface CSS/light, design context and field execution. The parent toolkit was rebuilt after the DOM auto-clock correction before copying this snapshot.

Both actual `codex debug prompt-input` diagnostics passed: each contains its own workspace, neither contains the other workspace or parent source path, and neither exposes the outside skill catalog. Diagnostics and SHA256 identities are retained in `isolation-preflight.json` and the two private prompt files. The installed CLI is 0.153.2; its unchanged configured model is `gpt-6.1-sol`, reasoning effort `xhigh`, service tier `default`. The shared DESIGN.md SHA256 is `3bc9b66ae3b4d059197c9156412ba7d2a682b93c55883d44c4cab8d367eee511`.

No builder model was launched during preparation. Syntax checks, scaffold builds and prompt-context diagnostics are setup evidence; they are not comparative design outcomes. The final random order and ID mapping stay in `manifest.private.json` for the runner, separate from blinded reviewer presentation.
