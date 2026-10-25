# Carry validation obligations through design phases

The choice machine selects a design. The validation machine remembers what must be checked before progressing. Its XState guards operate on explicit scenario/phase requirements and current receipt declarations; they do not introduce another model or a beauty score.

Author a `validation plan` with the actual permutations needed by the brief: platform, usable viewport, text scale, light/dark, reduced motion and content identity. Each phase lists required tools or observations, expected input identities and evidence kinds. Component/task identity can live in requirement IDs. A missing iPad case remains missing even when phone and desktop pass.

`validation check` accepts the plan, receipts and a requested number of phase advances. It replays from the first phase, revalidates every guard and returns the current phase plus exact missing/stale/failed/unknown obligations. Changed design, plan or tool-input identities invalidate old passes. Changing a receipt on a live actor restarts its phase checks, including after completion. Synthetic critique cannot satisfy a human-review requirement.

Unsupported results block by default. A brief can explicitly choose `unsupportedPolicy:"record"` for a requirement, in which case the report preserves that limitation and permits progression. This is a declared scope decision, not successful support. No automatic waiver or user approval is inferred.

Receipts include tool, input/design/plan identities, result reference, observation time, outcome, evidence kind and detail. This is a coordination boundary around caller-supplied evidence: the gate does not execute tools or authenticate referenced files. Validators and reviewers establish the underlying facts. Agents must preserve exact result references and truthful outcomes; a fabricated receipt remains fabricated even if its schema passes.

Run `npm run validation:proof` after building. It executes three actual geometry and three palette calls, feeds their results to the gate, demonstrates a missing iPad check blocking progression, and changes a scenario to prove stale invalidation. Its motion metadata does not imply animated-scene validation; actual motion/task-flow checks should be separate requirements when relevant. The proof plan and full receipts appear under `artifacts/validation` for CLI reuse.

This is explicit coverage, not automatic exhaustive coverage of every combination. Use risk and the brief to choose additional localization, browser/native, fallback font, keyboard, content and device scenarios. The machine makes those obligations visible; it cannot discover every omitted requirement.
