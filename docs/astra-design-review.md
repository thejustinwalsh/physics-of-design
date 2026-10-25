Method: dual-agent (A: `/root/astra_design_review/assessment_a` · B: `/root/astra_design_review/assessment_b`)

# Astra design review: responsive typography specimens

Reviewed 2026-10-24 using upstream Impeccable at `936867543ac2576920d663cc9803597f6044f3ac`. Scope is the frozen BEFORE matrix in [manifest.json](../evidence/review/astra-input/manifest.json): hero and editorial, original and coupled `relaxed` alternatives, at 360, 390, 834, 1024, and 1440 CSS pixels. This reviews two text specimens, not a complete website or app. The parent is implementing changes concurrently; this report does not certify those later changes.

The immediate decision is to **author a smaller mobile hero, retain the editorial's wider mobile prose area, and restore its calmer heading**. Use a shared width-aware resolver and explicit flex mappings. Preserve the supplied copy, Lato/Spectral faces, neutral substrate, capped prose measure, and single reading path.

Artifact lineage note: the parent subsequently regenerated the shared input directory during an after-capture script error. The original independent measurements, assessment reports, detector output and frozen hashes remain preserved; regenerated HTML/PNGs are not the original frozen captures. See [the incident record](../evidence/review/astra/artifact-regeneration-note.md) and the separate post-refinement review.

## Design specificity and overall impression

The typography has a coherent identity: heavy Lato provides a clear entry point, Spectral distinguishes extended reading, and dark text on the warm ground suits the copy's quiet tone. The wide editorial original is the strongest starting point. Its restraint belongs to Read mode. The wide hero's large statement is appropriate to Persuade mode, but copying that scale onto a narrow window makes the words difficult to read. The coupled alternative amplifies the problem rather than resolving it.

A left-aligned stack is appropriate to these text-focused specimens. It does not need navigation, a fabricated CTA, a component catalog, extra cards, or imagery to become more specific. Product character here comes from scale, line grouping, measure, leading, and whitespace. Large unused space below a short specimen is not itself a failure.

The real detector returned 40 findings across 20 specimen files: 20 `cream-palette` warnings and 20 `repeating-stripes-gradient` advisories, all at file-level line 0. These are repeated signals, not 40 independent usability failures. The stripe rule matches inactive `body.guides article` CSS; browser inspection confirms no displayed background image. The cream color is real but is an intentional controlled substrate, not evidence of poor composition. Neither is a priority change. The detector missed the broken mobile words; a clean overflow check or low detector count would not establish good responsive typography. Full findings and dispositions are in [Assessment B](../evidence/review/astra/assessment-b.md).

## What is working

1. Titles and supporting roles are unmistakable without reading the copy. The editorial's serif prose has a clear job and is worth retaining.
2. Wide prose already has a useful cap: editorial is approximately 650 px from 834 through 1440; hero supporting text is independently bounded. Do not fill extra desktop space by stretching those paragraphs.
3. Both specimens preserve a simple top-to-bottom reading path and visible paragraph grouping. Extra columns would add complexity without a demonstrated content benefit.

## Priority findings

### P1 — Mobile hero breaks the central word and delays its explanation

**Observed:** `hero-original-360`, `hero-original-390`, `hero-relaxed-360`, and `hero-relaxed-390` all have six title line boxes. The word “matters.” visibly breaks into `matte` / `rs.` at 360 and `matter` / `s.` at 390. Original type is 88 px with 64 px gutters; the coupled alternative uses 114.4 px type with 24 px gutters. In the browser, title height increases from 538.55 to 700.78 px and the subtitle starts at y=750.95 instead of y=630.55.

**Implication:** Reduced gutters do not compensate for the enlarged title. The reader reconstructs an ordinary word before reaching the quieter supporting promise. This is a regression even though the subtitle itself occupies fewer lines.

**Rule change:** Resolve display size from available width and archetype, then remeasure the result. Start near 52–56 px for this hero at 360–390 and grow toward 80–96 px on wider windows. Add a configurable default-scale warning for ordinary-word fragmentation and excessive title dominance. Keep emergency wrapping available for genuinely unbreakable text; fragmentation is not an unconditional accessibility failure. Never reduce user enlargement to meet an authored line-count preference. Suggested command: `$impeccable adapt`.

### P2 — Coupled editorial heading growth consumes the mobile reading gain

**Observed:** At 360, `editorial-relaxed-360` increases the heading from 44 to 57.2 px and from three to four line boxes, including the awkward isolated phrase “of a”. Prose starts 62.40 px later, at y=282.22 rather than y=219.82. At 390 the title remains three lines, but its rendered height still increases. Weight and family already establish sufficient hierarchy.

**Rule change:** Give Read mode a calmer responsive title preference independent of the hero. Start at 36–38 px narrow and retain the original 44 px wide title as the first comparison. Preserve 21 px Spectral prose initially. Treat heading/body size ratio as an editable preference rather than a target whose increase is automatically beneficial. Suggested command: `$impeccable typeset`.

### P2 — Outer spacing must change with width while reading measure stays bounded

**Observed:** `editorial-original-360` leaves 264 px for prose after 48 px gutters; the coupled 24 px gutters leave 312 px. That reduces occupied prose lines from 24 to 20 without reducing text size. At 390 occupied lines fall from 21 to 19. Conversely, both coupled 1440 specimens retain the same 24 px inset as mobile and hug the upper-left edge.

**Rule change:** Separate container placement, horizontal gutter, top space, and individual text measure. Use modest narrow gutters and more generous wide insets or a bounded centered group, preserving the incumbent left alignment within the group. Keep editorial prose around its current 650 px cap; do not widen prose merely to occupy a tablet or desktop. Default both archetypes to a flex column. A wrapping row is optional only when distinct content groups benefit and their measured minimum widths fit. Suggested command: `$impeccable layout`.

### P2 — The frozen matrix does not establish adaptive behavior under resizing or enlargement

**Observed:** Each frozen variant repeats its size, padding, leading, tracking, and measure across five widths. All specimens are English at `textScale: 1`. The 834 and 1024 captures are browser width scenarios, not iPad simulator captures. Historical iOS screenshots are genuine native renders but older than this matrix and visibly different.

**Rule change:** Resolve the same responsive policy before search, measurement, preview, and native/web emission. Use actual container or app-window width, account for inset ownership, and respond to font-scale changes. Exercise intermediate widths and both sides of transitions, narrow iPad windows, rotation, 200% text, spacing overrides, expanded content, and RTL/script-specific shaping. This is a coverage gap, not a claim that every untested scenario already fails. Suggested command: `$impeccable harden`.

## Configurable starting rules

These values are **unrendered design proposals**, not measured improvements, aesthetic optima, or universal type laws. They preserve the current copy and fonts. The independent assessment and synthesis agreed closely on the size ramps; use these as initial anchors and inspect fresh emitted output before accepting them. Units are CSS logical pixels for web and intended logical layout units for native, with renderer-specific verification.

| Available width | Hero title size | Hero subtitle | Hero gutter / gap | Editorial title | Editorial prose | Editorial gutter / gap |
| --------------: | --------------: | ------------: | ----------------- | --------------: | --------------: | ---------------------- |
|             360 |              52 |            22 | 24 / 24           |              36 |              21 | 24 / 24                |
|             390 |              56 |            22 | 24 / 24           |              38 |              21 | 24 / 24                |
|             834 |              80 |            24 | 48 / 28           |              44 |              21 | 40 / 24                |
|            1024 |              88 |            24 | 56 / 28           |              44 |              21 | 48 / 24                |
|            1440 |              96 |            24 | 72 / 32           |              44 |              21 | 64 / 24                |

- Hero title: leading about 1.06 narrow to 1.03 wide; tracking about -0.020 to -0.026 em; initial maximum measure 1060. Subtitle: leading about 1.42, tracking 0, initial measure cap 600. Default-scale title review goal is roughly three lines narrow and two to three wide. Intact-word endings such as “matters.” may be intentional.
- Editorial title: leading about 1.14 narrow to 1.12 wide, tracking -0.012 em, initial measure cap 760. Prose: leading 1.50 narrow to 1.55 wide, tracking 0, cap 650. Default-scale title goal is two to three lines narrow and one to two wide. Preserve paragraph separation and natural height.
- Give top spacing its own role where the model permits it: proposed hero values 32/36/64/72/88 and editorial 32/36/48/56/64 across the same anchors. If a single padding value is retained, verify the resulting top rhythm explicitly rather than pretending horizontal and vertical space serve identical jobs.
- Widths identify anchor examples, not device classes. Interpolate or choose authored bands from container width; keep min/max bounds editable. These line-count goals are review prompts, never truncation, `numberOfLines`, a maximum height, or a cap on user font scale.

For these specimens, the best first revision combines original wide typography with smaller mobile titles and the coupled mobile gutters. Neither complete frozen variant should be adopted unchanged.

## Research-backed responsive contract

Separate actual facts and criteria from preferences:

| Rule family                  | Contract                                                                                                                                                                  | Status                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Fit and content preservation | Record actual boxes, lines, visible text, overlap, and unintended horizontal overflow. Preserve source/reading order and natural vertical flow.                           | Renderer observations and explicit constraints.              |
| Available space              | Resolve from actual container/app-window dimensions, safe-area ownership, direction, and user font scale; device names label fixtures only.                               | Platform/API guidance plus project architecture.             |
| Shared layout                | Use explicit flex direction, wrap, grow, shrink and basis, plus constrained widths. Keep column as the default; gate optional rows on meaningful groups and measured fit. | User requirement and cross-platform implementation contract. |
| Type and rhythm              | Bounded heading ramps, leading, tracking, readable body measure, title line-count goals and whitespace.                                                                   | Editable design heuristics; require visual judgment.         |
| Locale                       | Store language/direction and inspect actual shaping; Latin character-count and tracking preferences do not define global readability.                                     | Required scope qualification.                                |

React Native's Flexbox defaults differ from web, including direction and shrink behavior; relying on implicit defaults undermines portability. Emit explicit properties and validate against the pinned native runtime. `useWindowDimensions` responds to window and font-scale changes; embedded surfaces also need their own measured container width. [React Native Flexbox](https://reactnative.dev/docs/flexbox), [useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions).

Apple's current iPad guidance treats resizing across many possible windows as ordinary use. Change structure when the content no longer fits, and test system arrangements such as halves, thirds, and quadrants. A full-width tablet screenshot is insufficient. [Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout).

For web, test reflow at 320 CSS pixels without lost content or two-dimensional reading; test 200% text enlargement separately. Also test user spacing overrides: line height 1.5, paragraph spacing 2em, tracking .12em, word spacing .16em. Those override values are not required authored defaults. [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

Prose-measure guidance varies: GOV.UK generally limits lines to about 75 characters; USWDS describes 45–90 and a target around 66. Use a source-attributed, script-aware preference, not a hard universal threshold. Never shrink readable phone text just to force a desktop character count. Transfer the principle using flex rather than copying another system's grid implementation. [GOV.UK Layout](https://design-system.service.gov.uk/styles/layout/), [USWDS Typography](https://designsystem.digital.gov/components/typography/). Further provenance is in [responsive-research.md](../evidence/review/astra/responsive-research.md).

## Qualitative heuristic bookkeeping

These are Assessment A's subjective judgments across the frozen states. They are not a universal beauty score, human preference study, statistical aesthetic validation, or factor-score calibration. Only four Nielsen heuristics apply to this deliberately narrow scope.

| #   | Heuristic                   |                 Hero |       Editorial | Basis                                                               |
| --- | --------------------------- | -------------------: | --------------: | ------------------------------------------------------------------- |
| 1   | System status               |                  n/a |             n/a | No operation/changing state.                                        |
| 2   | Match with real world       |                  2/4 |             4/4 | Hero fragments familiar words; otherwise natural reading order.     |
| 3   | Control and freedom         |                  n/a |             n/a | No transaction, modal or unwanted state.                            |
| 4   | Consistency and standards   |                  2/4 |             3/4 | Stable faces and roles; poor narrow display sizing.                 |
| 5   | Error prevention            |                  n/a |             n/a | No input/destructive action; layout constraints handled separately. |
| 6   | Recognition over recall     |                  3/4 |             4/4 | Visible reading path; hero delays supporting explanation.           |
| 7   | Flexibility and efficiency  |                  n/a |             n/a | No repeated interaction requiring accelerators.                     |
| 8   | Aesthetic/minimalist design |                  2/4 |             3/4 | Focused surface, weakened by narrow scale/outer spacing.            |
| 9   | Error recovery              |                  n/a |             n/a | No error interaction.                                               |
| 10  | Help/documentation          |                  n/a |             n/a | Neither a tool flow nor a help system.                              |
|     | **Applicable total**        | **9/16, Acceptable** | **14/16, Good** | Do not compare with /40 product audits.                             |

## Reading load, emotional path, and personas

There are no visible choices or decision points requiring more than four options. Both specimens have low choice-related load and one reading path. The mobile hero nevertheless fails readable chunking: the oversized fragment sequence imposes needless perceptual effort. Its confident opening becomes an obstacle before the reassuring subtitle. Editorial's wide original moves from a strong entry into a calm reading rhythm and ends naturally with the final sentence; no transaction or reassurance UI should be invented.

- **Casey, distracted mobile reader:** all four narrow hero states require six heading lines and word reconstruction; the original narrow editorial adds frequent line returns through large gutters.
- **Sam, enlarged-text reader:** the frozen matrix cannot establish enlarged-text behavior. Test natural height, reachable scrolling and heading semantics; do not shorten the design through clipping or scaling caps. Contrast and screen-reader conformance are not certified by this visual pass.
- **Riley, split-window or translated-content reader:** a 30 px width change already changes editorial heading grouping. Review intermediate windows, expansion, direction and script-specific shaping; English screenshots do not establish localization behavior.

## Accepted clean findings and limits

All 20 browser measurements showed document scroll width equal to the requested viewport, and each measured text block's scroll width equal to its client width. That establishes no measured horizontal box overflow in this matrix; `overflow-wrap:anywhere` explains how broken words can coexist with that result. Editorial's vertical scroll at 360 is normal reading flow, not a defect. The body measure caps, role contrast, aligned reading path, supplied fonts, and neutral palette should be retained.

Line counts in the browser receipt are derived from block height divided by computed line height, not per-glyph Range analysis. Editorial counts include one blank line; occupied-line comparisons subtract it. The fresh native-browser inspection covered all 20 pages. No reliable user-visible detector overlay was available: visible tabs are unsupported in subagents, and the documented evaluate surface is read-only. The real CLI scan, hidden browser screenshots and rendered measurements provide the evidence instead.

No new native runs were made. The old iOS PNGs establish historical native rendering only, not present parity, iPad rotation, Dynamic Type, or hardware behavior. The proposed anchors, stress cases and optional row eligibility still require new renderer evidence. Support: [Assessment A](../evidence/review/astra/assessment-a.md), [Assessment B](../evidence/review/astra/assessment-b.md), [browser measurements](../evidence/review/astra/browser-measurements.json), [frozen hashes](../evidence/review/astra/frozen-hashes.json).

Questions skipped: user already authorized implementation and requested autonomous refinement.
