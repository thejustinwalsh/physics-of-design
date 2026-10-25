# Assessment A — independent design judgment

Method: isolated Assessment A by `/root/astra_design_review/assessment_a`. No detector results, Assessment B report, or earlier critique findings were read. Review date: 2026-10-24.

## Design specificity verdict

These are coherent typography specimens, but only partly authored compositions. Lato Black gives both an assured, direct voice; Spectral makes the editorial reading surface distinct from the hero. The cream ground, dark ink, and lack of ornament suit the copy about quiet and thoughtful attention. The editorial specimen's content and typographic contrast belong together. The hero's huge mobile title contradicts the invitation to a quieter place: it occupies almost the whole screen and even splits the central word “matters.” This is the clearest evidence that parameter coupling has not yet produced a responsive art direction.

The layout itself is a generic left-aligned stack. That is appropriate for these deliberately limited specimens and is not grounds to invent navigation, a CTA, cards, or illustrations. Product character should come from considered line breaks, scale, measure, and breathing room within the existing text and font families. Increasing heading size alone does not supply it.

## Evidence and scope

- Frozen target: `artifacts/review/astra-input/manifest.json`, all 20 corresponding PNGs at 360, 390, 834, 1024, and 1440. Exact alternate IDs use `relaxed`; these are the coupled alternatives, not an additional variant.
- Read sources: `examples/hero.json`, `examples/editorial.json`, `src/emission.ts`, `src/factors.ts`, and `src/search.ts`.
- Created an independent, hidden in-app browser tab, opened the index, and inspected `hero-relaxed-390.html`, `editorial-relaxed-834.html`, and `hero-original-1440.html` with accessibility state and screenshots. The browser viewport was its existing 1280×720, while specimen surfaces retained their frozen width or available-width cap. Width-specific visual conclusions below use the corresponding frozen PNGs, not an assertion that the browser was resized to each filename's width. The temporary tab was closed.
- Viewed historical native screenshots `artifacts/spike/hero-native-ios/portrait.png` and `artifacts/spike/editorial-native-ios/portrait.png`. They are genuine native rendering evidence but old and visibly different from this frozen matrix. They do not establish present native parity, iPad behavior, Dynamic Type behavior, or rotation support. No shared simulator was touched.
- Read the complete Impeccable skill and critique reference, plus typeset, layout, adapt.native, and iOS references. `impeccable context --target examples/hero.json` failed because engine 0.1.17 was unavailable and `/Users/mini/.impeccable/bin/0.1.17` was not writable. Direct fallback checked root `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, and `.impeccable/critique/ignore.md`; all were absent. No missing context was invented. Native defaults do not override the explicit request to preserve these specimen fonts.

## Overall impression

The wide editorial original is the strongest starting point: calm, readable, and clearly ordered. The coupled editorial improves narrow body measure through smaller gutters, but needlessly magnifies the heading. The hero works as a wide two-line statement; both mobile variants require a new scale rule before release. The most useful next change is to resolve typography from available window width and reading mode, then judge each result in its renderer.

## Heuristic scores

These are subjective usability judgments of the text-only specimens, not aesthetic validation, statistical estimates, or a score for the whole product. Each archetype is judged across the frozen original and coupled variants, including its narrow failure states.

| # | Heuristic | Hero /4 | Editorial /4 | Basis |
|---|---|---:|---:|---|
| 1 | Visibility of system status | n/a | n/a | No operation or changing system state in these specimens. |
| 2 | Match with real world | 2 | 4 | Familiar wording and top-to-bottom flow; hero word fragmentation interrupts the spoken phrase on mobile. |
| 3 | User control and freedom | n/a | n/a | No transaction, modal, or unwanted state to undo. |
| 4 | Consistency and standards | 2 | 3 | Fonts and roles are consistent; fixed display sizes behave poorly across windows, most severely in the hero. |
| 5 | Error prevention | n/a | n/a | No input or destructive action. Layout robustness is addressed separately. |
| 6 | Recognition rather than recall | 3 | 4 | Both have a visible reading path; the hero's explanatory subtitle is delayed by six heading lines on mobile. |
| 7 | Flexibility and efficiency | n/a | n/a | Persuade specimen has no task accelerators; this short Read specimen has no repeated interaction requiring them. |
| 8 | Aesthetic and minimalist design | 2 | 3 | Purposeful restraint and clear contrast; oversized narrow headings and unresolved outer space weaken hierarchy. |
| 9 | Error recovery | n/a | n/a | No error interaction in scope. |
| 10 | Help and documentation | n/a | n/a | Hero needs no help surface; the editorial is a reading sample, not a help system or documented tool. |
| **Total** | | **9/16 — Acceptable** | **14/16 — Good** | Applicable heuristic set: 2, 4, 6, 8. Do not compare these totals with a /40 product audit. |

## Strengths

1. **The two roles are immediately recognizable.** Heavy Lato titles and regular supporting text produce an unmistakable entry point. The editorial's Spectral prose is a useful distinction, not an arbitrary extra family.
2. **The body measure already stops growing on wide screens.** Editorial prose remains at 650 or 652.602 px at 834–1440 rather than stretching across the viewport. The hero subtitle also stays bounded. Preserve these independent block measures.
3. **There is one uninterrupted reading path.** Both specimens use aligned text and meaningful proximity. Editorial paragraph separation survives narrow widths, with no decorative components or competing choices added.

## Priority issues

### A1 — P1: Mobile hero emphasis destroys the word it is meant to emphasize

**Evidence:** `hero-original-360`, `hero-original-390`, `hero-relaxed-360`, and `hero-relaxed-390`, block `title`. All four form six heading lines. “matters.” becomes “matte / rs.” at 360 and “matter / s.” at 390. The original holds 88 px type inside 64 px side padding; the coupled alternate increases type to 114.4 px with 24 px padding. Its subtitle begins around y=758 in the frozen captures. `src/emission.ts` permits emergency breaks through `overflowWrap: 'anywhere'`; fitting within bounds is therefore insufficient to preserve the statement.

**Why:** The reader must reconstruct a familiar word, and the supporting promise arrives late. The coupled alternate increases volume without improving the reading sequence.

**Fix:** Give Persuade headings a configurable responsive scale based on available text width. Starting proposal for these exact fonts and words: 48–56 px around 360–390 with 20–24 px gutters; interpolate toward 80–88 px at 834–1024 and cap around 96 px on wide windows. Keep the title's maximum width independently adjustable. Aim for an intact phrase in roughly three compact lines on a normal-size phone, allowing the subtitle to follow promptly. This is an art-direction target, not a hard line-count limit at enlarged text settings. Keep ordinary word boundaries; use emergency breaking only as the last-resort fallback for genuinely unbreakable content. Suggested command: `$impeccable adapt`.

### A2 — P2: The coupled editorial spends its mobile space on a display heading instead of reading

**Evidence:** `editorial-relaxed-360`, block `heading`: 57.2 px / 1.036 leading forms “The shape / of a / thoughtful / pause.” `editorial-relaxed-390` changes to three lines. The original 44 px heading stays at three lines at both widths despite larger gutters. The coupled heading/body size ratio rises from about 2.10 to 2.72 while body size remains 21 px.

**Why:** The isolated “of a” is an awkward pause in a heading about thoughtful pacing. Hierarchy was already sufficient through weight and family contrast; a larger ratio is not inherently better for Read mode.

**Fix:** Preserve the coupled variant's useful mobile body width, but use a calmer editorial title range: approximately 34–38 px on narrow windows, reaching the original 44 px on wider windows. Start with 1.12–1.16 leading when it wraps, and tracking around -0.012 to -0.018 em for this Lato face; tune visually. Keep 21 px Spectral body initially, around 1.5–1.55 leading, and a 20–28 px heading/body gap. These are adjustable starting ranges. Suggested command: `$impeccable typeset`.

### A3 — P2: Outer spacing is constant where it needs to respond, while body width is correctly bounded

**Evidence:** `editorial-original-360` has 48 px side gutters and only 264 px for prose, creating frequent returns and a very tall reading block. `hero-original-360` has only 232 px after its 64 px gutters. Conversely, `hero-relaxed-1440` and `editorial-relaxed-1440` retain the same 24 px outer inset used on mobile; the content hugs the upper-left edge and the rest of the canvas has no corresponding spatial decision.

**Why:** The original gutters consume scarce phone width, while the coupled gutters do not establish a generous wide composition. Widening prose to fill the blank space would sacrifice the strongest existing reading property.

**Fix:** Separate horizontal gutter, top spacing, and block measure. Resolve gutter from available container width, starting around 20–24 px narrow, 40–48 px intermediate, and 64–80 px wide. Allow a configurable bounded outer content group with either centered placement or an intentional left inset. Keep a single flex column for these specimens at all widths; a tablet does not need extra columns. Keep editorial prose near its existing 650 px cap and hero subtitle in an adjustable approximately 520–660 px range. Suggested command: `$impeccable layout`.

### A4 — P2: There is no demonstrated policy for intermediate windows, scaled text, or different language wrapping

**Evidence:** In the frozen manifest each variant repeats the same size, padding, tracking, leading, and measure across all five widths; only viewport width changes. `src/emission.ts` caps block width but otherwise emits that resolved state. `src/search.ts` stress scenarios change viewport width and text scale without re-resolving a responsive design rule. All 20 frozen samples use `textScale: 1` and English. The historical native captures cannot fill this gap.

**Why:** A full-width iPad screenshot says little about a narrow split window, and five nominal widths do not establish behavior near wrapping thresholds. Text scaling and longer translations can amplify the mobile failure already visible here.

**Fix:** Represent the responsive choices as configurable inputs and resolve them before both search evaluation and emission. Use current container/window width after safe-area insets, not device-model labels. Include narrow split widths, intermediate widths around actual wrap changes, rotation, and user text scaling in review scenarios. Preserve user scaling, allow vertical scrolling and natural height, and do not shrink text back down to enforce a normal-size line target. Test an expanded translation and RTL/script-specific shaping separately; Latin tracking and character counts must not become universal rules. Suggested command: `$impeccable harden`.

## Concrete cross-platform rule shape

The following anchors are **independent design proposals, not rendered alternatives, validated optima, or measured improvements**. Interpolate between them or use explicit bands and then inspect wrap transitions. They preserve the current copy and faces. Dimensions are CSS logical pixels on web and intended logical layout units in native, subject to each renderer's measurements. Values apply at the default user text scale; enlargement must remain user controlled.

| Hero anchor width | Title size / leading / tracking em | Subtitle size / leading | Horizontal / top padding | Title-to-subtitle gap | Default-scale heading goal |
|---:|---|---|---|---:|---|
| 360 | 52 / 1.06 / -0.020 | 22 / 1.42 | 24 / 32 | 24 | About 3 lines, complete words |
| 390 | 56 / 1.06 / -0.020 | 22 / 1.42 | 24 / 36 | 24 | About 3 lines, complete words |
| 834 | 80 / 1.04 / -0.024 | 24 / 1.42 | 48 / 64 | 28 | 2–3 lines |
| 1024 | 88 / 1.03 / -0.024 | 24 / 1.42 | 56 / 72 | 28 | About 2 lines |
| 1440 | 96 / 1.03 / -0.026 | 24 / 1.42 | 72 / 88 | 32 | About 2 lines |

Hero title cap: start at 1060 logical px, always bounded by available content width. Subtitle cap: start at 600 px, tracking 0, independently bounded. Prefer the phrase grouping produced by the original 834 specimen as a direction; do not hard-code its line breaks across widths. These targets admit intact-word single-line endings such as “matters.” when rhetorically useful.

| Editorial anchor width | Heading size / leading / tracking em | Prose size / leading / tracking em | Horizontal / top padding | Heading-to-prose gap | Default-scale heading goal |
|---:|---|---|---|---:|---|
| 360 | 36 / 1.14 / -0.012 | 21 / 1.50 / 0 | 24 / 32 | 24 | 2–3 lines |
| 390 | 38 / 1.14 / -0.012 | 21 / 1.50 / 0 | 24 / 36 | 24 | About 2 lines |
| 834 | 44 / 1.12 / -0.012 | 21 / 1.55 / 0 | 40 / 48 | 24 | 1–2 lines |
| 1024 | 44 / 1.12 / -0.012 | 21 / 1.55 / 0 | 48 / 56 | 24 | 1–2 lines |
| 1440 | 44 / 1.12 / -0.012 | 21 / 1.55 / 0 | 64 / 64 | 24 | 1–2 lines |

Editorial heading cap: 760 px; prose cap: 650 px. Preserve paragraph separation equivalent to approximately one additional body line between paragraphs initially. A narrow viewport naturally falls below a preferred desktop character count; do not shrink the body to force 45–75 characters into it. Line-count goals are review prompts only, never `numberOfLines`, truncation, a maximum height, or a font-scale cap.

The principal recommendation is to start the editorial revision from the original heading and wide body rhythm, borrowing the coupled mobile gutters. For the hero, start from the original wide composition and author a substantially smaller mobile title. This is a mixed choice by role and viewport, not an endorsement of either complete variant.

Use one shared numeric resolver that takes `availableWidth`, mode/archetype, user text scale, and a configuration of min/preferred/max font sizes, gutters, block measures, leading, tracking, and gaps. Interpolate or select authored width bands in JavaScript, then emit ordinary flex/Yoga properties. A column container with numeric padding, `alignItems: flex-start`, constrained child widths, natural height, and sibling gaps is enough. No Grid dependency is needed. Web-only balanced wrapping may be a progressive enhancement, but the design must remain acceptable under native wrapping without it.

Keep layout scale distinct from user text scale. Resolve composition using the available window first, then honor text enlargement and remeasure. Keep body maximum measure independent of heading scale: the existing 650 px editorial measure is a reasonable starting value for this font at 21 px, not a fixed law for other scripts or sizes. Wider readings may benefit from more leading; do not automatically reduce leading just because heading size increased. Do not accept a candidate solely because it has no overflow or favorable factor compatibility. Show complete words, readable rhythm, and the title-to-body transition in the rendered result.

## Cognitive load and emotional path

There are **zero visible choice points** and no decision with more than four options. Single focus, grouping, one task at a time, minimal choices, and lack of cross-screen memory demands are strengths. Progressive disclosure is not applicable. The hero fails readable chunking on mobile because one-word lines end in split word fragments; this is one clear checklist failure, so choice-related cognitive load remains low even though the perceptual effort is needless. Editorial chunking is sound in the prose; its coupled title creates an avoidable weak phrase group at 360.

The wide hero creates a confident first impression, then softens into its subtitle. On narrow screens the emphasis becomes an extended obstacle before that reassurance. Editorial begins with a strong title and settles into two thoughtful paragraphs; the original wide composition supports that emotional descent. Its closing sentence provides a natural end. No high-stakes transaction or reassuring confirmation state is present, so none should be fabricated.

## Persona red flags

- **Casey, distracted mobile reader:** In all four narrow hero specimens, reading the promise requires traversing six very large lines and reconstructing the last word. The coupled version delays the supporting explanation farther down the page. In `editorial-original-360`, oversized gutters add repeated line returns to otherwise readable prose.
- **Sam, reader using enlarged text:** The frozen matrix contains no enlarged-text evidence. The already fragmented hero gives a concrete reason to inspect 200% text and native Dynamic Type. Preserve enlarged text, natural height, scroll reachability, and heading semantics; do not impose a height cap to make the screenshot shorter. Contrast and screen-reader compliance are not certified by this visual pass.
- **Riley, reader using split windows or another language:** A change from 360 to 390 already changes the coupled editorial heading's line grouping. Intermediate split widths and expanded copy need explicit review; the existing Latin/English measurements cannot establish the shape of translated headings. No invented product-specific persona was added because product audience context was absent.

## Minor observations

- On `hero-original-1024` and `hero-original-1440`, leaving “matters.” on the second line can be a legitimate rhetorical emphasis. Do not mechanically eliminate every single-word final line. It is categorically different from splitting the word itself.
- The coupled hero's -0.0321 em tracking is very tight for a sentence that promises quiet. Inspect word separation at the wide size before carrying it forward; approximately -0.02 to -0.028 em is a useful comparison range for this face, not a rule to apply across languages.
- The original editorial's 1.55 body leading feels easier and airier than the coupled 1.495 at the wide measure. Both are readable in these captures; this is a tone choice rather than a demonstrated defect.
- Large blank space below short specimens is not itself a defect. The recommendation is to author the top and side relationship, not to fill the canvas with new content.
- The existing old native captures show that native line groupings can differ. Review native output on its own merits and do not describe web screenshots as native validation.

## Questions for synthesis

1. Should the phone hero favor **compact calm (roughly three lines)** or **poster emphasis (more lines, intact words)**? Both can preserve the copy; the current six-line fragments cannot.
2. For the wide reading surface, should placement be **a bounded centered column** or **a deliberately inset left column**? Preserve the current body measure in either case.
3. Should the first revision address **mobile wrapping and heading scale only**, or **the shared responsive policy plus scaled/native verification**?

No production files were edited. These questions are for the parent synthesis; Assessment A did not ask the user independently.

Source provenance note: source observations in this report describe the files read earlier during Assessment A, before the parent announced ongoing responsive implementation. The frozen manifest/HTML/PNGs remain the authority for every BEFORE visual claim; this report makes no claim about the later working-tree implementation. Browser inspection succeeded: no native-browser failure or screenshot fallback was required. Only context-loader setup used the direct-file fallback described above. Heuristic totals are review bookkeeping, not validated design-health scores.
