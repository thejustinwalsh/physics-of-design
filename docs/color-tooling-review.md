# Palette tooling review and implementation

Reviewed and implemented 2026-10-24. Scope: color conversion, role contrast, palette candidate search, and typography/contrast coupling. These checks establish declared constraints; they do not measure aesthetic quality or certify an entire interface.

## Supported findings and dispositions

| Finding                                                              | Distinguishing evidence                                                                                                                                                                                                           | Disposition                                                                                                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit `wght` axis could produce a false large-text contrast pass. | 20px text, `weight:700`, `axes.wght:400`, `#888` on white was accepted at 3:1 although its effective regular weight requires 4.5:1. Chromium screenshots matched the explicit 400-weight reference, not the 700-weight reference. | Fixed in `design-color.ts`: explicit axis wins. Regression uses the variable Noto Sans Arabic font.                                                                    |
| Rounded 14pt boundary excluded exact 14pt bold.                      | `14 * 96 / 72` is below the old hardcoded `18.6666666667`.                                                                                                                                                                        | Fixed: compare against the same exact conversion; just-below boundary remains ordinary text.                                                                           |
| One-token repair could not solve two independent failures.           | White canvas, `ink:#aaa` text and `accent:#bbb` non-text fail independently. Editing either alone never satisfies both.                                                                                                           | New bounded joint search retains partial repairs. First regression solution is `ink:#767676`, `accent:#949494`, canvas locked. All edges are rechecked after emission. |
| A passing declared role omitted unsafe adjacent surfaces.            | `#005599` against white passes; the same control against `#006699` fails.                                                                                                                                                         | New roles explicitly enumerate theme/state and adjacent backgrounds. Only supplied edges are certified.                                                                |

The existing opaque-sRGB contrast arithmetic and known OKLab red vector showed no material numeric defect within their stated scope. Legacy `src/color.ts` remains intact. [CSS Fonts defines variation-setting precedence](https://www.w3.org/TR/2026/WD-css-fonts-4-20261022/#font-variation-settings-def); [WCAG specifies inclusive large-text thresholds and unrounded contrast decisions](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Reusable tool boundary

`src/palette.ts` exports `convertColor`, `paletteRamp`, `analyzePalette`, `paletteCandidates` and corresponding Zod schemas. CSS Color input includes OKLab, OKLCH, Display P3 and alpha. Conversion uses pinned `colorjs.io@0.7.1`, `toGamut({space:'srgb',method:'css'})`, then explicit 8-bit sRGB fallback. Analysis rechecks those emitted bytes. Neutral hue is null rather than an invented directional signal. Ramps expose editable lightness/chroma/hue; their spacing is not a score.

Roles identify foreground, its primary surface, optional opaque backdrop, additional adjacent surfaces, theme and state. A translucent foreground is composited over its primary surface once; its resulting color is compared with every neighbor. Missing required opaque backdrop gives `unknown`, never pass. Known failures dominate unknowns. Decorative/no-role results are `not-applicable`. [WCAG non-text contrast concerns necessary visual cues against adjacent colors](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Candidate output carries the system, changed tokens, measurement reference, contrast level, optional compatible legacy hex system, and a compact objective vector: failed/unknown checks, edit count, sum of OKLab changes, and minimum conservative contrast slack `ratioInterval.min/required - 1`. Full facts can be recovered with `analyzePalette` under the same reference. There is no summed beauty score. Search caches conversion, deduplicates emitted colors, preserves locks, explores multiple token edits, and respects an explicit deterministic evaluation budget. The domain samples lightness/chroma and neutral luminance intervals while preserving alpha/hue; it is not a global feasibility proof. A caller can generate broader ramps or palette proposals before invoking the same analyzer.

Legacy compatibility requires opaque tokens, canvas/ink/accent, and at most 128 expanded roles. Alpha is not flattened into a misleading context-independent hex token. Source lists retain their schema limit. Context and capability limits remain in the richer palette result.

## Verification and remaining scope

- 27 focused tests pass across `palette.test.ts`, `color.test.ts`, and `color-coupling.test.ts`; `npm run typecheck` passes. The final combined lane with component, energy and composition-solver regressions passes 58/58.
- Reference checks cover published OKLab red coordinates, black/white 21:1, exact AA/AAA thresholds, powerless hue, quantized fallback contrast, unknown backdrops, contextual adjacency, deterministic joint repair, locks, budget termination and legacy representability. P3 red → `#ff0b0c` is a pinned-library regression, not an independently normative byte vector.
- Historical small-fixture timing before the alpha-interval addition: 100 warmed three-token searches evaluated 2,400 states in 156.6ms on this host (~15.3k evaluations/s). Each search used 24 evaluations and returned three joint repairs. This is not a current general throughput guarantee.
- Browser evidence exposed a one-code-value mismatch when the original model retained alpha 0.5. The fallback now explicitly emits RGBA8 alpha (`0.5 → 128/255`), models encoded-sRGB source-over and propagates a conservative ±1 code value per alpha stage. Contrast passes only when the entire conditional interval passes; a threshold-crossing interval is `unknown`, requiring actual-render evidence or opaque effective colors. This rounding envelope is not a universal browser-compositor guarantee.
- Independent Chromium 156.0.8078.4 pixel capture in `artifacts/vela/proof-web/report.json` matches four emitted opaque CSS4 fallbacks and all explicit alpha cases: red over white `#ff7f7f`, white over black over white `#bfbfbf`, and one black-over-white foreground compared with adjacent black `#7f7f7f`. This confirms those emitted fixtures on that runtime; other renderers, raw unquantized CSS alpha and wide-gamut surfaces remain outside the exact-byte claim.
- CVD simulation, visible alternatives to color-only meaning, focus geometry/obscuration, keyboard behavior, actual backdrop and large-text applicability, wide-gamut browser output, and aesthetic preference are explicitly unverified. [ARIA defines semantics](https://www.w3.org/TR/wai-aria-1.2/), not contrast thresholds; accessible names alone do not establish a visible alternative required by [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

## Final source fingerprints

SHA-256 after tests and formatting:

```text
307c8231ea82fba566dac81bfe9716046656c47f9b4188aa9030d1630680a346  src/design-color.ts
957dae501a57bc1fa3b8dd4b0fda0831df90a7cb5eab3caeebb7afd9fb888f6a  src/palette.ts
dd321d0e4b0af84cf3196410bd0c9c85888437f4f9f31c1b96b9732eca35fbb7  test/color-coupling.test.ts
7091a5f061de6adfd4dab83c41255d860d754937182f0e2ae88e4d740a251d71  test/palette.test.ts
```
