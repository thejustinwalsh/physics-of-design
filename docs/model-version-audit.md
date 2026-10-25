# Recorded model versions

On 2026-10-25 the standalone CLI on PATH was **0.153.2**, while the app bundled **0.162.0-alpha.17.2**. The standalone catalog offered GPT-6 Astra and older Luna/Sol IDs. Treating that catalog as a reason to choose old builders was the wrong next step: the user requested updating the CLI. `codex update` installed **0.164.0**, and a fresh `model/list` now includes `gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`, and `gpt-6-astra`.

The [official CLI update instructions](https://learn.chatgpt.com/docs/cli) document the standalone installer. Local version output, installed schemas and actual catalog are the evidence for this machine; documentation availability alone does not prove account access.

| Recorded work | Version evidence | Interpretation |
| --- | --- | --- |
| Fresh Impeccable-guidance / Design Theory matched workbenches | Both invocation receipts explicitly select `gpt-6-astra`; original configured `gpt-6.1-sol` launch was rejected before implementation | This comparison used the same accepted Astra request in both arms, not old Luna/Sol |
| Token-reporting acknowledgement probes before the update | Actual thread-start receipts resolve `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-6-astra` | Tiny transport qualification turns only; no Relay app implementation |
| Relay three builders | Policy now requires `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra` | No Relay builder had started at the model correction; old probes cannot qualify these new models |
| Local conditional selector | Pinned quantized Qwen3.5-4B, exact checkpoint identity | A separate local choice selector, never a coding builder or verifier |

Collaboration agents explicitly requested as Astra were routed with the Astra model override. Their task names alone do not provide an independently resolved backend receipt. This audit does not claim to reconstruct every earlier agent run from memory. Earlier published experiments retain their original model/version settings; changing the installed CLI cannot retroactively change them.

The Relay launcher must validate the returned thread model, effort and permissions **before** sending a model turn, retain actual usage notifications, and reject any downgrade. No wall-time/token cap is required from the user; progress, cancellation and measured usage remain separate from finite mathematical candidate domains.

Fresh CLI 0.164.0 acknowledgement turns completed for all three exact assignments at high effort, each with one actual usage notification and unchanged configuration hashes: Luna reported 13,034 total tokens, Sol 13,726, and Astra 13,662. They were neutral transport probes, not app builds or cost comparisons. Their private raw receipts remain separate from published, sanitized evidence.

An additional workspace-write startup probe returned the exact intended private workspace/cache roots, enabled network access and excluded implicit temporary-directory roots. Its validator stopped before inference: zero `turn/start` requests and no usage. Owned process-group cleanup completed. This establishes the current launch contract; it does not imply the desktop application's bundled CLI was updated.
