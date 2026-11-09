# Three-condition marketing-site case study

The shared brief and protocol were frozen on November 8, 2026 (America/Detroit), before the design builders ran. This execution guide was written while the builders ran.

The shared user request is a modern single-page marketing site for Design Theory, explaining the system simply through strong visuals, imagery, animation and parallax. `BRIEF.md`, `DESIGN.md`, `CONTENT.md`, assets and `protocol.json` are the shared authored inputs. They are not interview responses or preference observations. `GUIDANCE.md` is supplied byte-identically to the guidance and full-tool conditions, and withheld from the bare condition. Bare means the ordinary coding-agent harness with no added design skill; it does not mean a foundation model stripped of its standard system instructions.

All three builders use fresh isolated workspaces, one GPT-6.1 Sol/high/default session, the same ordinary dependencies and browser capabilities, and no imposed wall-time or token deadline. The full condition additionally gets frozen toolkit code, skill/API instructions, and the existing local Qwen3.5-4B selector. A treatment supplement explicitly requests actual narrow decisions and replay. That tests the supplied workflow, not spontaneous tool discovery. No condition gets another condition's output, earlier gallery implementations or human repair feedback.

Preparation and execution are separate:

```sh
node scripts/marketing-study.mjs prepare /private/tmp/design-marketing-NEW
node scripts/marketing-study.mjs preflight /private/tmp/design-marketing-NEW
# Confirm the same model/browser capability with the streaming recorder first.
node scripts/marketing-study.mjs run /private/tmp/design-marketing-NEW
node scripts/marketing-study.mjs serve /private/tmp/design-marketing-NEW 8663
node scripts/evaluate-marketing-study.mjs /private/tmp/design-marketing-NEW http://127.0.0.1:8663/
node scripts/marketing-study.mjs audit /private/tmp/design-marketing-NEW
```

The installed app-server transport cannot use the exec-only `--ignore-user-config` flag. Matching feature/MCP/skill overrides, config hashes and actual private prompt diagnostics control observable context. Workspace write sandboxing does not deny reads of all external files. The isolation claim is instructions plus trace audit, not OS-enforced read isolation. Never publish private prompt/config/account event records without sanitization.

The recorder keeps current provider-reported cumulative usage throughout execution; it never sums cumulative snapshots. Cached input is included in input; reasoning output stays a separately reported field and is not added twice. Missing usage stays unknown. All local-selector attempts, failures, receipts and replay work belong in a separate ledger. Selector and coding-model token counts use different models/tokenizers and are not pooled as interchangeable cost. Shared artwork, environment provisioning, orchestration and evaluation overhead are outside the per-builder measurement and must be disclosed. Any separately measured setup usage remains separate.

First delivery is the first final turn completion, including failed or incomplete results. Source, deployable output and reports are frozen before external evaluation. Repairs after that point require a distinct iteration series; they cannot replace the first result. The browser evaluator reads the frozen outputs, applies the same predeclared viewport/action probes, records failures and captures intermediate motion frames. It does not assign aesthetic scores. Human A/B/tie observations remain empty until actually supplied. Synthetic critiques stay labeled synthetic.

One project and three builds provide a case study. They cannot establish general quality or token savings, nor isolate the selector's contribution from the rest of the full toolkit. The primary comparison is guidance versus full tools; bare versus guidance and bare versus full are secondary. Preserve adverse results and setup failures rather than tuning the protocol after looking at winners.
