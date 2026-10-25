# Typography measurement

The typography inspector binds each result to the actual font file’s SHA-256 and the effective text block. It reports fontkit shaping, guarded browser baseline probes, DOM text ranges, font loading, and separate Canvas text metrics. An axis wizard samples the requested state and each selected axis’s minimum, default, and maximum independently. It does not rank beauty, interpolate through line-break changes, or certify every combination of axes.

## Inspect a real text block

Use `design typography inspect --input examples/typography/inspect.json` or `design typography axes --input examples/typography/axes.json` through the JSON CLI; the same commands are exposed by MCP. CLI calls resolve responsive state and user enlargement automatically. The public functions live in `src/typography-inspection.ts`. Pass a parsed `TextBlock`; state-level callers must first resolve responsive layout and apply viewport text scaling to the block’s size. `examples/typography/variable-block.json` supplies a licensed Roboto Flex specimen. It uses the repository’s OFL font and manifest hash, not a system font with the same family name.

```js
import {
  inspectTypography,
  inspectTypographyBrowser,
  typographyAxisCandidates,
  probeTypographyAxes,
} from './dist/typography-inspection.js';

const shaped = inspectTypography(block, { detail: 'glyphs', glyphLimit: 128 });
const browser = await inspectTypographyBrowser(block, { engine: 'webkit' });
const plan = typographyAxisCandidates(block, { limit: 64 });
const endpoints = await probeTypographyAxes(block, {
  engine: 'chromium',
  limit: 64,
});
```

`inspectTypography` defaults to a glyph-free summary; `detail: 'glyphs'` returns bounded glyph details with an omitted count. `probeTypographyAxes(..., { render: false })` returns shaping evidence and explicit unknown renderer fields. The axis plan contains candidate blocks for further inspection. Errors reject invalid axes, out-of-range coordinates, conflicting `features.kern`, and oversized requests before rendering.

The browser engine is `chromium` by default. `DESIGN_CHROMIUM` selects its executable. WebKit uses `DESIGN_WEBKIT_EXECUTABLE`, then the provisioned `artifacts/runtime/playwright/webkit-2370/pw_run.sh`, then Playwright’s installed WebKit. Returned runtime versions identify the actual engine. Playwright is pinned to 1.64.1 and fontkit to 2.0.4.

## What each number means

| Evidence                   | Coordinates and scope                                                                                                        | What remains unknown                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Global font metrics        | `hhea` ascent/descent/line gap and `OS/2` cap/x heights in font units, plus scaling by size/units-per-em                     | fontkit 2.0.4 does not apply MVAR deltas to these getters. They are not variation-resolved metrics or DOM baselines.          |
| Shaped glyph positions     | Fontkit single-run advances, offsets and nominal advances; positioning is retained                                           | Final browser/native bidi runs, line breaking and fallback                                                                    |
| Glyph outline bounds       | Baseline-local rectangles, x right and y down; the run union excludes empty outlines                                         | Raster pixels, antialiasing, shadows, decorations and color-font layer paint                                                  |
| H/x/p/g reference outlines | Actual outlines at the selected coordinates, including each reference character’s height                                     | A reference character is not a universal cap-height, x-height or descent metric                                               |
| Kerning difference         | Same text and settings with `kern` enabled/disabled, with glyph sequence comparability reported                              | Exact GPOS-versus-legacy-kern execution trace; other positioning is not called kerning                                        |
| Tracking                   | Separate authored em value and explicitly estimated additional advance                                                       | Exact browser/native boundary spacing and tracking-induced ligature changes                                                   |
| DOM Range rectangles       | Browser selection fragments grouped by equal top/height; logical UTF-16 offsets and bounds                                   | Raster ink and CSS line-box rectangles. Fallback with different metrics can split one physical line into groups.              |
| DOM baselines              | Empty baseline-aligned inline-block’s bottom edge relative to the text element, accepted only after text geometry is checked | Baselines for failed or budget-exhausted probes remain null                                                                   |
| CSS line-height            | The computed CSS value, alongside observed baseline-to-baseline distances                                                    | A CSS line-box rectangle: this API does not expose one, so `lineBox` is null                                                  |
| Canvas TextMetrics         | Separate Canvas drawing state; actualBoundingBox, fontBoundingBox and supported baseline fields                              | Parity with CSS variation settings, optical sizing and feature settings. Canvas values never replace DOM baselines or ranges. |
| Overflow                   | Integer CSSOM scroll/client sizes and subpixel Range extent outside the element                                              | Pixel-exact paint clipping; trailing whitespace can extend Range bounds                                                       |
| Font loading and coverage  | FontFace status, document font status/check, loaded family and primary cmap gaps                                             | Which fallback face supplied each glyph. A loaded font does not prove all text uses it.                                       |

The baseline collector checks every grapheme’s Range geometry and the element’s width/height before and after each marker. It ignores zero-size boundary artifacts introduced by node splitting when a nonzero text fragment exists. It tries at most eight offsets per line. The marker sits inside an inline wrapper whose measured font-fragment top and height must match the target group. Checking that a baseline merely falls inside a Range rectangle is insufficient: tight Arabic lines can have overlapping selection rectangles. A marker that changes shaping or wrapping, or whose wrapper belongs to another line, is rejected. The accepted coordinate comes directly from the marker; global ascent is never subtracted from a box to manufacture it. DOM text is restored after each attempt.

Empty lines without a usable text range or stable marker can lack baseline evidence. Mixed bidi retains logical offsets and unions its visual fragments; a fragment union is not a claim about reading order. The collector supports horizontal, uniform-style text elements. The inspector creates such an isolated element from the effective block rather than claiming to inspect arbitrary rich HTML.

## Variable axes: requested, resolved and observed

Every available axis has its name, minimum, default and maximum. `resolvedForFontkit` records the coordinate used by the shaping policy and why: explicit axis, high-level weight, size-based optical policy, or font default. In the fontkit policy, explicit `wght` wins over `weight` and explicit `opsz` wins over automatic optical sizing. Automatic fontkit optical sizing clamps the numeric font size to the `opsz` range. The recorded WebKit 27.2 probe differs from Chromium 156: at explicit `opsz: 14`, turning optical sizing from `none` to `auto` changed the sample’s WebKit Range width from 196.734375 to 179.21875 CSS pixels, while Chromium geometry stayed equal. This is an observed engine difference, not a claim that the inspector resolved WebKit’s chosen axis. The browser’s optical-size mapping can depend on its implementation and environment, so `browserResolvedCoordinates` remains null. Computed CSS only confirms the declaration.

Renderer endpoint probes provide independent observations of Range geometry, baseline positions, line breaks and block height. A `wght`, `wdth`, `opsz`, `GRAD`, `XOPQ`, `XTRA`, `YOPQ`, `YTAS`, `YTDE`, `YTFI`, `YTLC`, `YTUC`, or `slnt` change may affect outlines without changing advance or wrapping. The sample text may omit glyphs that a particular axis affects. Unchanged geometry is valid evidence for that text, not proof the axis does nothing.

The bundled Roboto Flex has 13 axes: requested state plus three samples per axis gives 40 candidates. The direct API defaults to 12 candidates; the CLI defaults to 64, which covers all 40 candidates. The maximum is 64 and omission is reported. Use `limit: 64` to inspect all 13 axes. Each candidate changes one explicit axis while preserving the other declarations. Auto optical sizing is not silently disabled when another axis changes.

## Reproduce the proof

```sh
npm run build
node --import tsx --test test/typography-inspection.test.ts
node scripts/prove-typography.mjs
```

The proof writes detailed engine receipts and `artifacts/typography/summary.json`, binding the inspector, browser collector, shaper, proof script and fixture to SHA-256 source hashes. A concurrent source edit fails the final identity check. The default run requires both Chromium and WebKit; a missing engine fails rather than becoming a fabricated success. `DESIGN_TYPOGRAPHY_ENGINES=chromium` explicitly narrows the run. `DESIGN_TYPOGRAPHY_OUTPUT` selects the evidence directory.

The script exercises all 40 candidates per engine, real variable-axis geometry, discontinuous wrapping/height changes, guarded baselines, explicit weight/optical-axis precedence, changed line-height, combining marks/ligatures, Arabic joining, mixed bidi, empty lines, inside-word wrapping, clipping, unknown fallback identity, and the overlapping-Arabic-line regression. The latter compares every accepted narrow-line baseline offset against a separately measured wide-line reference; ambiguous probes remain null. It checks the half-leading baseline shift with a 0.51 CSS-pixel rounding allowance: Chromium can round text positions to integral pixels even when the line height is fractional. Individual probe geometry preservation uses a separate 1/64 CSS-pixel tolerance.

These observations establish the behavior of the pinned fonts, text and recorded engines. They do not establish all-font, all-script, accessibility, raster-paint or native-platform conformance.

## Bounds and platform gaps

Inputs are limited to 4096 UTF-16 text units. An effective block accepts size up to 5000 CSS pixels: the authored state limit of 1000 multiplied by the viewport text-scale limit of 5. The authored state schema remains unchanged. Glyph output defaults to 128 and is capped at 512; browser line output defaults to 64 and is capped at 256. Per-render baseline verification is capped at 131072 grapheme measurements and eight candidate offsets per line. Exhaustion leaves baselines unknown and reports the budget. The wizard reuses one browser, caps its candidate count, and returns compact per-candidate observations.

The existing native bridge records actual React Native `Text.onTextLayout` lines and Yoga rectangles. Its normalized receipt does not expose glyph outlines or baselines, and the native adapter rejects explicit variable axes and automatic optical sizing until validated. This web inspector does not manufacture native evidence. Native baseline/axis extraction remains a separate integration task.

## Sources and implementation provenance

- [CSS Fonts Level 4, dated 22 October 2026](https://www.w3.org/TR/2026/WD-css-fonts-4-20261022/) defines the high-level font properties, low-level variation settings and automatic optical sizing; this is a working draft.
- [CSS Inline Layout Level 3](https://drafts.csswg.org/css-inline-3/) describes baselines and line boxes; this is an editor’s draft, not a fixed browser conformance promise.
- [CSS2 inline-block baseline rule](https://www.w3.org/TR/CSS2/visudet.html#line-height) supplies the empty inline-block bottom-margin-edge baseline used by the probe.
- [HTML Canvas TextMetrics](https://html.spec.whatwg.org/multipage/canvas.html#textmetrics) defines the separate Canvas measurements.
- [CSS Font Loading](https://www.w3.org/TR/css-font-loading-3/) defines FontFace and FontFaceSet availability checks.
- [OpenType MVAR](https://learn.microsoft.com/en-us/typography/opentype/spec/mvar) describes variable global-metric deltas. The installed fontkit metric getters read base tables, so the report does not claim those deltas were applied.
- [Fontkit](https://github.com/foliojs/fontkit), pinned locally at 2.0.4, supplies actual shaping and outline access. The installed `src/layout/LayoutEngine.js` selects GPOS/AAT shaping and legacy kern fallback; the inspector reports the observable kern toggle difference without attributing every adjustment to one table.
- `assets/fonts/manifest.json` binds bundled font files to their upstream Google Fonts commit, SHA-256 and OFL license notices.
