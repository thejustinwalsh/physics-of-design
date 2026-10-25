# Typography precision: independent review

Reviewed 2026-10-25 against `typography-inspection.ts`, `typography-browser.ts`, the Fontkit adapter in `fonts.ts`, and the existing `proof-editor.ts`. This is a read-only technical review of measurement meaning and boundaries. It does not rate typographic beauty or establish universal tracking, leading or optical-size preferences.

## Verified findings

**P1 — legacy proof-editor baseline guides could describe a changed layout; editor integration closed.** The old `drawBaselines` inserted a marker at each apparent line end and unconditionally drew its vertical position. With bundled Noto Sans Arabic, 32px type, 48px line-height, 60px measure, RTL direction and `العربيةالعربيةالعربيةالعربية`, the first original line ends at UTF-16 offset 5. Its selection Range spans y=-10 to 58 relative to the text element. Inserting the old marker at that offset yields y=82, on the next line, while changing grapheme geometry. The paragraph's overall height remains 336px, so a box-height-only check would miss the change. The editor now uses the guarded collector, draws only nonnull measurements, and records measured/unavailable/omitted counts. The actual interactive proof passed an independent Chromium/WebKit regression checking every grapheme rectangle, text restoration, omitted unsafe guides, toggle-off removal and the >4096-unit skip boundary. A separate collector ownership defect below still required correction.

**P1 — unchanged geometry alone did not prove line ownership; independently closed.** At tight leading, adjacent Arabic selection rectangles overlap. The previous collector accepted a marker if its y coordinate lay anywhere in the target selection rectangle. For uniform Noto Sans Arabic, 32px type, 30px width and 24px line-height, the joined Arabic fixture above produced baseline-minus-Range-top values alternating 44px and 20px in Chromium. At 32px leading the pair was 44/12px; at 36px it was 44/8px. The smaller value is the previous line's baseline. Marked Arabic reproduced this in WebKit. An independent 64-case matrix per engine tested four strings, four widths and four leading values. The durable regression in `test/typography-editor.integration.ts` failed the old collector with `reference:44, observed:20`; it uses a wide single-line browser measurement as the reference, not font-table arithmetic. The corrected collector wraps the marker in an inline span and requires that wrapper's sole selection fragment to match the target group's top and height within 1/64px, in addition to preserving the original geometry. Ambiguous readings remain null.

The independent 128-case rerun found 368 accepted Chromium readings, all with offset 44px, and 324 WebKit readings with offsets 43.953125–43.96875px. The erroneous offsets separated by one line advance disappeared. Both engines also pass the actual editor regression: emitted guides exactly match the safely owned readings. This closes the demonstrated defect within the declared uniform horizontal-text scope; it does not certify arbitrary mixed-style DOM.

**P2 — empty outline bounds were nonfinite; independently closed.** Ordinary `A B` in Lato produced a space glyph with ±Infinity bounds, serialized as four null-valued rectangle fields. The corrected adapter returns one explicit `null` outline for an empty path, preserves its advance, and rejects nonfinite bounds for a nonempty path. An independent `inspectTypography(...,{detail:'glyphs'})` probe verifies the space outline is null and every nonnull rectangle is finite.

**Variable-font global-metric limitation — labeling corrected.** Fontkit 2.0.4's ascent/descent/lineGap accessors read `hhea`; capHeight/xHeight read `OS/2`. `getVariation` reuses the tables, and these accessors do not apply MVAR deltas. With bundled Roboto Flex at 100px, YTLC 416→570 changes the `x` outline height from 41.6015625px to 57.03125px while the reported xHeight table field remains 1052 units. The inspector now explicitly labels the global values as table metrics with unapplied MVAR deltas, and exposes reference-glyph outlines separately. Reference `x`/`H` geometry is useful evidence for those glyphs, not a replacement for every font's typographic metric. [OpenType MVAR](https://learn.microsoft.com/en-us/typography/opentype/spec/mvar) defines instance adjustments to global metrics; the limitation must remain visible unless an implementation actually applies them.

## Baseline evidence

The marker method has a valid CSS basis: an empty inline-block's baseline is its bottom margin edge; hidden overflow also forces that edge rule. That establishes what the inserted marker measures, not whether inserting it leaves the original text unchanged. [CSS inline-block baseline rules](https://www.w3.org/TR/CSS2/visudet.html#propdef-vertical-align).

The new collector compares each grapheme's selection fragments and the element dimensions before accepting a probe, with a declared 1/64 CSS-pixel tolerance. It tries alternative boundaries, then returns null when none preserve geometry. Independent Chromium probes observed:

| Fixture                                                 | Observed result                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Noto Arabic with combining marks, ordinary 48px leading | Stable baseline; element height unchanged.                                                           |
| Mixed Latin/Arabic/numbers across two lines             | Two stable baseline readings, 48px apart; element height unchanged.                                  |
| Combining Latin accents and `office` ligatures          | Stable two-line readings without replacing grapheme offsets with code-point or glyph counts.         |
| Forced Latin inside-word wrapping                       | Five stable readings, 48px apart.                                                                    |
| Forced Arabic joining across narrow wraps               | Only two of seven groups permit a safe reading; the other five correctly remain null.                |
| Arabic/bidi at 12px leading with 32px type              | All probes rejected when marker insertion perturbs geometry; no metric-derived baseline is invented. |

These are Range/element geometry checks, not a pixel-level guarantee that a marker leaves every shaped contour or raster unchanged. A returned baseline is a renderer-relative measurement from an accepted probe; a null is an explicit precision limit. The original DOM text and measured height were restored after each complete collector call in these probes.

Grouping fragments by top/height can differ from physical line counting when fallback or mixed font metrics occur. The direct fallback Arabic/CJK fixtures tested here each produced one group in a 48px-high line; they did not reproduce an overcount. That does not validate grouping for every fallback face. Returned group counts/signatures should retain their fragment-group semantics; CSS line-box geometry remains null. A selected font's cmap coverage and `FontFace.load/check` also do not identify which face painted every glyph.

## Work bounds and performance

The public inspector limits input to 4096 UTF-16 units, returned glyph details to 512, line results to 256 and axis candidates to 64. The collector now separately caps baseline-probe resampling at 131072 grapheme measurements, with at most eight candidate offsets per group, and reports exhaustion with unavailable baselines. Every baseline attempt resamples every grapheme, and axis candidate runs repeat this work. The cap bounds those probe measurements rather than promising a wall-clock duration or limiting all browser/font work.

Before that cap, one allowed 4096-unit fixture (`'x '.repeat(2048)`, Roboto Flex 32px, 45px measure, 64 requested baseline groups) took approximately **2932ms inside the collector** on the concurrent local test host. It produced 1024 fragment groups, returned 64 baseline readings and omitted 960. This is an observed local timing for the earlier implementation, not a current benchmark or universal limit. The collector should not be called per animation frame. File-byte size and actual font/shaping complexity are additional costs beyond text length.

An independent post-fix run of the same fixture stopped at exactly 131072 probe grapheme measurements, returned 32 measured and 32 unavailable readings, and reported `probe budget exhausted`; the text was preserved. Its approximately 1706ms local duration is not a guaranteed latency or a controlled before/after performance comparison.

## Command and editor integration closure

`npx tsx --test test/typography-editor.integration.ts` passes both engine cases against the rebuilt distribution. Besides the Arabic cases above, each compares a `typography inspect` browser receipt with an actual StyleX/React proof at 390px viewport and textScale 2. Effective font size, letter spacing, line height and measured text width match. This verifies the responsive resolution and enlargement path for that fixture rather than comparing only the command's own arithmetic. The three command tests also pass: authored responsive scaling, all 13 axes yielding 40 independent samples with explicit truncation, and native browser-inspection rejection.

The implementation proof [typography summary](../evidence/design-theory-2026-10-25/typography/summary.json), generated 2026-10-25T10:56:57.455Z, records Chromium 156.0.8078.4 and WebKit 27.2 with Playwright 1.64.1. Its typography/browser/font source hashes match this review. The browser collector reviewed here has SHA-256 `b33c497d5a7836990782d184f440d8a591ea92d3fb1b8bfcbf7b602298473857`; the proof editor has `7adc401085a3b3e0498be8b5fae2ff913f60bcf9122527097e4c3fda516743aa`. The proof preserves WebKit's observed optical-sizing divergence under explicit opsz 14 rather than declaring cross-engine axis parity.

## Interpretation boundaries retained

- Fontkit positions one logical run. Target renderers own bidi segmentation, fallback and line breaking; glyph count, grapheme count, UTF-16 offsets and visual fragments remain distinct quantities.
- Tracking is a separate estimate of extra spacing between grapheme boundaries. It does not move the reported shaped outlines or promise browser/native end spacing, ligature behavior or line-break results.
- Outline coordinates are baseline-relative vector geometry. Raster paint may differ because of antialiasing, hinting, color layers, decoration, shadows and compositing. `rasterPaintBounds: null` is appropriate here.
- Canvas `measureText` describes its separate drawing state. Its font shorthand does not automatically reproduce DOM variation axes, feature settings or optical-size behavior. Its actual bounding-box metrics are not substituted for DOM Range rectangles or CSS line boxes.
- Requested axes and Fontkit-resolved coordinates are separate from browser-observed effects. Computed `font-variation-settings` is a declaration, not proof of the font's selected coordinates. Min/default/max probes are independent samples, not interpolation coverage, cross-axis coverage or an aesthetic optimum.
- The inspector's automatic Fontkit `opsz` policy uses the numeric CSS size clamped to the font axis. It is explicitly a local policy; browser optical-size resolution remains unknown without observed comparisons.
- Native receipts do not gain baseline, outline or variable-axis evidence merely because the web probe can measure it. No physical Safari or mobile-device performance claim is made by the local browser results.

Independent probe scripts used during this review are `/tmp/typography-review.mts`, `/tmp/typography-baseline-edge.mts` and `/tmp/typography-legacy-review.mts`. They load the bundled font bytes and inspect actual local browser geometry; the implementation's durable proof artifacts should remain the reproducible release evidence.

## MCP summary closure

The command-integration review reproduced a 197,357-byte default typography summary for a valid 4,096-character CJK excerpt absent from the fixture font: both missing-glyph lists were copied in full. After the correction, an independent source-level run of the identical `typography inspect` input produced 5,681 bytes. Each list contains 16 samples, `missingCount: 4096`, and `omittedMissing: 4080`; resolving the session result reference returned the exact complete coverage list. This context-boundary finding is closed. The probe used `render:false` and establishes summary behavior, not browser fallback support.
