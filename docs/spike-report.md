# Implementation spike report

Historical first-spike snapshot. Later Android, selector, color and whole-system results supersede this snapshot in the [system report](system-report.md).

2026-10-24. This is executable engineering evidence, not aesthetic validation.

## Observed results

The headless TypeScript CLI, shared MCP command handlers, source-attributed factor registry, dependency invalidation, actual font shaping, renderer measurement, conditional compatibility curves, ordered spacing analysis, bounded relaxation and separate Pareto factors are implemented. The optional MCP specimen resource and offline proof offer live edits, font comparisons, measured browser baseline guides and explicit dependency effects.

| Archetype               | Renderer                              | Heading lines: original → enlarged → relaxed | Viable smooth / musical alternatives | Hard failures in returned stress cases |
| ----------------------- | ------------------------------------- | -------------------------------------------- | ------------------------------------ | -------------------------------------- |
| Marketing hero          | Chromium 156.0.8078.4, React + StyleX | 2 → 2 → 2                                    | 3 / 3                                | 0                                      |
| Editorial heading/prose | Chromium 156.0.8078.4, React + StyleX | 1 → 2 → 1                                    | 3 / 3                                | 0                                      |
| Marketing hero          | React Native 0.88.0, iOS 26.5, Yoga   | 2 → 2 → 2                                    | 3 / 3                                | 0                                      |
| Editorial heading/prose | React Native 0.88.0, iOS 26.5, Yoga   | 1 → 2 → 1                                    | 3 / 3                                | 0                                      |

Web stress widths: 360, 767, 1280; native stress widths: 390, 767. Both use requested text scales 1 and 2. Native receipts are from one iPhone simulator with system font scale 1 and pixel ratio 3; wide target measures are virtual artboards in the native harness, not additional physical devices. These observations do not establish behavior on Android or every viewport.

The hero title was enlarged from 88 to 114.4. One smooth alternative revised tracking from −0.024em to −0.0321em, leading from 1.02 to 1.021, measure from 1080 to 1152, and adjacent gap from 28 to 26.176. The enlarged heading stayed pinned during relaxation. Values and locks remain editable. Editorial enlargement from 44 to 57.2 crossed an actual wrapping discontinuity; recomputing the measure provided a viable one-line alternative.

The ablation changes actual proposals: hero smooth hierarchy ratios were approximately 4.7667, 4.4807, 5.0527; musical ratios were 4.7667, 4.8, 5. Off-scale alternatives remain. Content, font files, candidate budget and deterministic feasibility rules were held fixed. Equal viability counts are **not** preference evidence.

Full evidence and editable artifacts:

- `artifacts/spike/summary-web.json` and `summary-native.json` summarize renderer observations.
- Each archetype/platform directory includes `evidence.json`, `state.json`, `specimen.html`, React/StyleX source and a native mapping.
- Web `preview.png` images provide a static visual check of the same specimens.
- Native receipts record actual `Text.onTextLayout` lines and Yoga `View.onLayout` rectangles, rather than browser/native approximations.
- Native `portrait.png` and `portrait-receipt.json` files show the specimens measured at a phone-sized 390-unit artboard.

## Verification

Twenty automated tests passed: fifteen core/protocol/boundary tests, four actual-browser integration tests and one actual-iOS integration test. Checks include log-interval invariants; real kerning distinct from tracking; invalidation; multi-peak/off-scale alternatives; Pareto trade-offs; native bridge authentication and receipt identity; SemIf subprocess protocol fixtures; MCP stdio/resource interoperability; clean CLI error streams; browser and native wrapping brackets; stale receipts; deliberate clipping; text-spacing overrides; font-comparison and baseline controls; unseen German/French reflow; and explicit rejection of missing-script fallback.

Both TypeScript projects typecheck. Research/example/font JSON parses, formatting checks pass, and the root toolkit dependency audit reports zero known vulnerabilities. The separate optional Expo development toolchain reports five high-severity audit entries through upstream `node-forge`/Zod dependencies; no compatible upstream fix was available in the pinned toolchain. This is recorded rather than applying a forced SDK downgrade or incompatible override.

During verification, DOM ranges initially counted hanging spaces and trailing tracking as visible overflow. The measurement now excludes those advances from content bounds; deliberate clipping still fails. Visual QA also exposed a StyleX unit-mapping bug: a numeric pixel line height was interpreted as a multiplier. Web emission now uses the requested unitless leading, native emission retains point units, and the browser test verifies actual line cadence against the requested leading. Proof controls initially lacked an exact accessible name for font comparison; that is fixed and browser-tested. Native Simulator's standard device set could not create a usable device, so the executed tests used an isolated temporary device set. Expo's direct `--initialUrl` launch started the actual native harness without depending on the blocked URL dialog.

## Unmeasured and unsupported

No human preference study, coding-agent token/iteration comparison, or actual Qwen3.5-4B inference was run. The SemIf adapter is implemented and its subprocess/provenance contract is fixture-tested; the model executable, GGUF and pinned tokenizer must be provisioned locally for real choices. The fixtures are not inference evidence. The standalone proof controls and MCP resource protocol were tested; host-specific MCP App interaction was not exercised.

The musical hypothesis remains **undetermined and disabled by default**. [The prospective protocol](../research/evaluation-plan.json) records the preference, token/attempt and hard-failure thresholds. Empty observations cannot retain or falsify musical priors. Adequate evidence of no practical advantage discards the musical prior while retaining the factor engine.

The toolkit does not certify complete WCAG conformance, infer beauty from deterministic scores, measure final renderer glyph ink, implement arbitrary fallback chains, validate all scripts/readability contexts, or establish React Strict DOM/CSS/native shaping equivalence. Native custom axes/optical sizing, disabled kerning and custom OpenType toggles are explicitly unsupported. The corpus remains a licensed collection plan and schema, not an assembled award-design dataset.
