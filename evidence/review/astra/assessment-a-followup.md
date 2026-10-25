# Assessment A — focused visual follow-up

Method: isolated design verification by `/root/astra_design_review/assessment_a`, 2026-10-24. No Assessment B follow-up output or detector findings were read. This is a narrow comparison against the prior written A1–A4 observations, not a new full heuristic assessment.

**Verdict:** The three observed visual problems—mobile hero word fragmentation, disproportionate mobile editorial headings, and poorly adapted outer spacing—are resolved in the ten new default-scale captures. No new major visual regression was identified within that evidence. Intermediate live resizing, enlarged text, localization, and current native behavior remain outside this follow-up's verified coverage.

## Evidence and lineage

Visual authority is exclusively `artifacts/review/astra-after/`: all ten fresh PNGs were inspected, covering `hero-original-{360,390,834,1024,1440}` and `editorial-original-{360,390,834,1024,1440}`. The associated manifest was read, including its responsive anchor configuration. Base size fields in that manifest are not the final resolved sizes; responsive overrides are present and the new PNGs visibly show their result.

Read `artifacts/review/astra/artifact-regeneration-note.md`. The earlier input PNG/HTML files were overwritten after the first review. They were not reread as BEFORE evidence. Comparisons below use the original written `assessment-a.md` observations; this is not a pixel-diff comparison or a claim of byte-identical recovery.

A fresh independent native-browser tab was attempted at `http://127.0.0.1:4392/index.html`. `cua.createBrowserTab("iab", …)` failed with **“Browser is not available: iab”**. A subsequent inventory returned no browsers/apps and **“The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.”** Consequently, no live page, viewport resizing, or ResizeObserver behavior was verified in this follow-up. The exact fallback was direct visual inspection of the ten fresh PNGs plus the manifest. No screenshot is presented as a live-browser observation. No temporary browser tab was successfully created, and the parent-owned server was left running for the parent to stop. No production files or shared emulator state were changed.

## Resolved findings

| Prior finding | Status and exact new evidence |
|---|---|
| **A1 / P1 — mobile hero fragments “matters.”** | **Resolved at captured default scale.** `hero-original-360` and `hero-original-390` now read “Make room / for what / matters.” in three lines, with every word intact. The subtitle follows around y=220–235 in the images, rather than appearing after the earlier six-line heading. The heading remains clearly dominant through weight and size, and the quieter subtitle is encountered promptly. |
| **A2 / P2 — coupled editorial heading dominates mobile reading** | **Resolved in the new original specimens.** `editorial-original-360` and `editorial-original-390` both use two heading lines: “The shape of a / thoughtful pause.” The problematic isolated “of a” is absent. The body begins around y=129–140 and has clear visual priority once the title is read. Its 21 px Spectral remains substantial; improved hierarchy did not depend on making prose tiny. This follow-up does not claim that a separately regenerated relaxed variant was assessed. |
| **A3 / P2 — narrow gutters waste width; wide content hugs the edge** | **Resolved in the captured arrangements.** Both narrow editorial specimens provide a usable reading column with modest side space. `editorial-original-834`, `editorial-original-1024`, and `editorial-original-1440` retain a bounded body measure and increasingly deliberate placement; at 1440 the reading group sits centrally within the wide canvas. `hero-original-834` and `hero-original-1024` have sensible edge breathing room; `hero-original-1440` has an intentionally inset composition. The body and subtitle do not stretch to fill the whole window. No unnecessary tablet column was introduced. |

The wide hero specimens—`hero-original-834`, `hero-original-1024`, and `hero-original-1440`—retain two lines with “matters.” as the complete second line. This is a valid rhetorical emphasis already distinguished from broken-word wrapping in the first report; it is not an unresolved A1 defect. The overall result retains the existing font identities, copy, ink/cream palette, and single reading path.

## Open points and regressions

1. **A4 — partially addressed in configuration, not fully verified by this visual pass.** The fresh manifest contains editable width anchors and the five captured widths show differentiated composition. That is concrete progress beyond a fixed desktop state. The live browser failure means this reviewer cannot independently confirm actual ResizeObserver behavior, intermediate split-window widths, or smooth changes around wrap thresholds. The default-scale PNG matrix cannot establish 200% text, translated copy, RTL shaping, rotation, or current native output. These remain verification limits, not observed failures in the new implementation. Any separate parent/B evidence should be attributed to its own run.
2. **P3 — short paragraph endings at 390.** In `editorial-original-390`, the first paragraph ends with a single-word “judgment.” line and the second ends with “choice.” alone. The nearby `editorial-original-360` has fuller endings. The 390 rhythm is a little more ragged, but paragraphs remain readable and clearly separated. Do not change copy, shrink the body, or add manual line breaks to fix one width. If this warrants a later polish pass, compare a small, configurable prose-measure adjustment across neighboring widths in both renderers. Web-only pretty wrapping must remain optional and cannot be treated as native parity. This is not a release-blocking regression.

No other material visual regression was apparent in the ten captures. Blank space beneath these short specimens is expected and does not justify adding content or enlarging headings again.

## Scoped decision

Accept A1–A3 as visually addressed **for the captured English, default-scale web specimens**. Preserve the new direction. Keep A4's untested cases explicitly open until supported by separate evidence. No broader redesign or additional interaction features are recommended by this follow-up, and no claim of validated beauty or statistically measured improvement is made.
