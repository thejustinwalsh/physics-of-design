# Independent DOM surface and design-context review

Reviewed the new DOM surface recipe/sampler, retained browser light controller, design-context reader, command registration and MCP summaries on 2026-10-25. The initial review was read-only, with independent Chromium and real MCP probes; it did not infer correctness from the implementation agent's tests. The integrating agent subsequently authorized the narrow controller fix and regression tests described below. No gallery, native or field source was changed.

## Verified finding

**Closed: P2, narrow auto-clock parameter boundary.** Before the fix, with `clock: 'auto'`, `scroll: false`, and valid `responseRate: 0.0001`, a pointer target corresponding to 4.5° rotation stopped at `0.00001deg`. The frame count was four at both 100ms and 250ms. `tick()` used per-frame displacement greater than `0.00001` to continue; small displacement is not evidence of settlement when the response rate itself is small. The fix compares remaining target error, preserving accepted response rates and the external-clock API. This did not affect the gallery's default external-clock integration.

The probe is `/tmp/dom-context-slow-probe.mjs`; its recorded output is `artifacts/review/dom-context-independent.json`. That script bundles current production source and runs a real Chromium page. The deliberately extreme valid rate makes the stopping condition reproducible; this is not a latency benchmark or a claim that such a rate is useful art direction.

The fake-clock regression failed against the original source after its second frame, then passed after the fix. A second regression checks actual settlement and restart after a changed target; reduced-motion, hidden-document and disposal cancellation remain covered. All 13 DOM unit tests and TypeScript checking passed. A separate post-fix Chromium probe (`artifacts/review/dom-context-clock-fixed.json`) advanced from 8 frames at 100ms to 17 at 250ms while still far from the target. The original failure receipt remains intact. The full DOM proof passed all 12 checks in Chromium 156.0.8078.4 and WebKit 27.2, including offscreen suspension, reduced motion, disposal, composite contrast and its unsafe-glass negative control. `artifacts/dom-surfaces/summary.json` binds these results to controller SHA-256 `421cde72828e9a5a297c425fa1853ebb161099cf547003f31b10c02a6e30c47b`.

## Checks that passed

- In Chromium 156.0.8078.4, 500 pointer events followed by 120 external-clock samples caused zero additional geometry reads and reached the latest held target. Updating the recipe caused zero geometry reads.
- Switching to reduced motion reset rotation to zero, paused the controller and produced zero additional style writes across subsequent samples.
- Repeated disposal restored the original inline value and its `important` priority, removed owned CSS variables/class, and prevented later input, sampling or recipe updates from writing styles. No browser runtime errors occurred.
- A nested scroll moved the element without resizing it: cached coordinates gave 2.57131° at the new visual center. Calling `refreshBounds()` reduced that to 0.00012°. This is covered by the documented host obligation to refresh geometry after movement without resizing; it is not treated as a new defect.
- The 17 focused DOM-surface, design-context and result-context tests passed, including independent contrast arithmetic, missing/oversized/invalid-UTF-8 documents, stale expected hashes and context reference behavior.
- Real MCP `design_execute` calls returned structured summaries of 1,222 bytes for `context inspect`, 1,696 bytes for `surface css`, and 1,140 bytes for `surface light` in the exercised cases. Document content and CSS text were excluded. Each result retained a session reference. Unsafe translucent glass kept `renderedComposite: null` despite nominal opaque contrast 21:1.

## Interpretation and limits

Source and result text consistently describe the gradients, opacity, shadows and roughness response as authored CSS appearance controls. The sampler's vector arithmetic does not claim calibrated radiometry, a physical material classification, energy conservation or real refraction. Nominal base contrast is explicitly separated from rendered composite contrast. The post-fix multi-pose screenshot proof covers its authored poses and backdrop, with an unsafe translucent negative control; it does not imply that a base-color ratio alone verifies translucent text.

The context reader caps the actual read at 65,537 bytes, rejects content above 64 KiB and invalid UTF-8, hashes the original bytes, and reports authored headings without inferring constraints or human approval. API summaries remain useful without returning the document body. Native rendering, physical-device sensors, every CSS fallback environment and arbitrary hostile documents were outside this review.
