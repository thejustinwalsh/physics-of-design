# Relay builder report contract

All three builders receive this same contract. The human requested unbounded time and a self-critique from each builder. There is no imposed wall-time deadline. Completion means the brief's executable flows and current platform evidence are delivered; time alone is not a stopping criterion.

Deliver `BUILD-REPORT.md` and a machine-readable `build-report.json` alongside the implementation. Retain raw tool receipts outside the report. The orchestrator supplies actual model, token and elapsed-time receipts; do not estimate missing usage or claim a numeric energy is aesthetic validation.

## What each builder must explain

1. **What works:** link the executable app and current web/iOS/Android evidence. State which requested flows actually passed. Separate simulation, renderer observations and physical-device evidence.
2. **Design Theory wins:** cite at least three concrete tool-output pointers, consumed component/token properties and observed consequences. Include a coupled perturbation and recipe replay. Explain when saved choices avoided a new selector call.
3. **Misses and failures:** show retained failed receipts, bad choices, manual overrides, weak surfaces and unsupported features. State what the toolkit could not determine. Do not relabel a manually authored layout as a solver output.
4. **Tool friction and context:** describe discovery, schema size, receipt reuse, errors, unnecessary calls, missing semantic abstractions and large outputs. Distinguish actual numeric states, local neural readouts, coding-model tool calls and renderer attempts.
5. **Improvement proposals:** rank specific fixes to equations, constraints, adapters, default workflows or skill instructions by expected impact. Include a reproducible input and proposed regression check for each important defect. Keep product-specific art direction out of universal rules.
6. **Self-critique:** judge hierarchy, mobile/iPad/desktop task composition, typography, palette, material restraint, moving light, motion, inspection and interaction quality against this brief and its attributed inspiration. Label these judgments synthetic. Explain remaining weaknesses candidly; no award-quality claim.

## Machine-readable report

Use keys `builder`, `resolvedModel`, `commit`, `inputsIdentity`, `platformEvidence`, `flows`, `toolInfluence`, `replay`, `wins`, `misses`, `improvements`, `selfCritique`, `unsupported`, `knownFailures`, `usageReceipt`. Each win/miss/improvement has a description plus evidence references. Unknown fields remain `null` with a reason. `usageReceipt` points to the orchestrator's actual usage record; builders must not invent token totals.

The independent review may disagree with a builder. Preserve both reports and verify actionable findings with actual code or renderer probes before changing shared tools. A matched three-builder experiment can expose usability failures and candidate directions; it does not by itself establish a general model ranking or token advantage over a guidance-only baseline.
