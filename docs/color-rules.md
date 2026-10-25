# Color and composition rules: evidence and limits

Reviewed 2026-10-24. This reference separates accessibility requirements, color mathematics, platform guidance, and editable design proposals. The implemented API below has a deliberately narrower domain than the broader rendering guidance. Award examples live in [`research/inspiration-registry.json`](../research/inspiration-registry.json).

## Implemented deterministic API

[`src/color.ts`](../src/color.ts) exports `HexColorSchema`, `ColorRoleSchema`, `ColorSystemSchema`, `ColorContextSchema`, `ColorCandidateOptionsSchema`, `describeColor`, `relativeLuminance`, `contrastRatio`, `analyzeColors`, and `colorCandidates`, plus their result/input types. These are synchronous pure calls: invalid authored input throws at validation; an unmet contrast constraint is an analysis result, not an exception.

```ts
const system = {
  tokens: { canvas: '#ffffff', ink: '#171918', accent: '#22745d' },
  roles: [
    {
      id: 'body',
      foreground: 'ink',
      background: 'canvas',
      use: 'text',
      source: ['authored body-copy role'],
    },
    {
      id: 'focus',
      foreground: 'accent',
      background: 'canvas',
      use: 'non-text',
      source: ['authored meaningful focus indicator'],
    },
  ],
  harmony: 'free',
};
const analysis = analyzeColors(system, { contrastLevel: 'AA' });
const alternatives = colorCandidates(system, {
  editableTokens: ['accent'],
  lockedTokens: ['canvas', 'ink'],
  limit: 6,
  maxAttempts: 512,
});
```

Required token IDs are `canvas`, `ink`, and `accent`; additional lowercase kebab-case IDs are allowed. Colors are opaque `#rgb` or `#rrggbb`, normalized to six-digit lowercase sRGB. Alpha and other color spaces are rejected instead of silently flattened. Roles require attribution and reference existing tokens. Supported uses are `text`, `large-text`, `non-text`, and `decorative`; correct rendered applicability remains the caller's responsibility. Omitted roles mean zero obligations checked, even though the empty set has no failing constraint. Consumers must not present that as an accessibility pass.

Context accepts `contrastLevel: 'AA' | 'AAA'`, optional `hueReference`, and nullable `chromaRange` / `lightnessRange` with `{min,max}`. The API bounds range endpoints to 0–1 for its narrow sRGB search; this is not a definition that all OKLCH chroma is normalized saturation. `analyzeColors` returns normalized input/context, token descriptors, individual role ratios/thresholds/pass results, `constrainedRoles`, and separate harmony/chroma/lightness factors with provenance and assumptions. A null preference distance means no range was supplied. Harmony supports `free`, `analogous`, `complementary`, and `triadic`, and abstains when chromatic support is insufficient. Its local 0.02 chroma cutoff is separate from numerical-neutral hue cleanup at 1e-6; neither is claimed to be a CSS standard constant.

`colorCandidates` returns editable `candidates` with complete systems, analyses and per-token changes, plus `attempted`, `rejected`, `duplicates`, `exhausted`, `invariantFailedRoles`, provenance and limitations. It considers the original and a bounded deterministic single-token perturbation grid, returning up to 24 alternatives and never exceeding 4096 attempts. Default bounds are 6 and 512. It is not a complete palette optimizer or a ranking by beauty. Multiple simultaneous repairs can be missed. Hue/lightness/chroma sample steps are local search coverage choices, not empirical preference constants. Colors with undefined neutral hue are not assigned an invented hue.

Only final quantized hex palettes satisfying every declared hard role threshold are returned. Locked tokens stay fixed. If a failed role's two tokens cannot change under the editable/locked set, `invariantFailedRoles` identifies it and the search does no futile work. Otherwise, exhaustion means no further candidate was found under this grid/budget, not that a solution is impossible. Requested out-of-sRGB OKLCH proposals use a local 28-step binary chroma reduction at fixed lightness/hue, numerical gamut tolerance 1e-7, and nearest 8-bit sRGB quantization; output records requested values, reduced chroma and actual hex/descriptors. This is not the CSS Color 4 mapping algorithm.

[`src/composition.ts`](../src/composition.ts) exports `CompositionRectSchema`, `CompositionContextSchema`, `CompositionInputSchema`, `analyzeComposition`, and corresponding input/context/result types. Input contains `viewport:{width,height}`, up to 128 `rectangles:[{id,box:{x,y,width,height},priority?}]`, optional `groups:[{id,members,source}]`, optional `readingOrder:[id]`, and context `{direction:'ltr'|'rtl',flow:'column'|'row',alignmentTolerance,source}`. IDs and references are validated, coordinates are finite and bounded, and a viewport whose area underflows to zero is rejected.

The result separately reports alignment distances, group edge gaps, area hierarchy and declared priority, occupied-union centroid, viewport-clipped union occupancy/whitespace, pairwise intersections, and declared-order geometric reversals. Union calculations do not double-count nested/duplicate coverage. Other pairwise descriptors intentionally depend on supplied region multiplicity. These are measured-rectangle descriptors, not glyph-ink whitespace, semantic grouping, focus-order validation or visual salience. A full-surface container counts as occupied by definition, so callers should supply comparable meaningful regions. The module emits no layout; downstream layouts retain the shared flex/Yoga-only contract.

[`test/color.test.ts`](../test/color.test.ts) contains 12 meaningful arithmetic, schema, lock/search and geometric-invariance tests. Independent synthetic oracle results and the two corrected edge cases are documented in [color-equation-review.md](color-equation-review.md). They validate scoped calculations, not aesthetic preferences. The broader transparency/backdrop guidance below describes a future renderer-aware evaluator; this implemented opaque-only API rejects those unsupported inputs instead of returning an invented compositing result.

## Evidence classes

| Class                                   | Permitted conclusion                                                                   | Prohibited inference                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Normative accessibility                 | A scoped foreground/background pair meets a named criterion under recorded conditions. | The whole interface is accessible, readable to everyone, or beautiful.                         |
| Color model / rendering specification   | A conversion, interpolation, or mapping is defined for a named space and algorithm.    | Equal numeric steps guarantee equal preference or legibility.                                  |
| Platform guidance                       | A platform vendor recommends a behavior for a stated context.                          | The recommendation is a universal psychophysical law or identical to WCAG.                     |
| Practitioner heuristic / local proposal | A configurable candidate is worth rendering and reviewing.                             | Its constant is empirically fitted or its result must be accepted.                             |
| Award inspiration                       | The official organization recognized that work in that category and year.              | Award status proves accessibility, conversion, universal preference, or transferable geometry. |

## Contrast: scoped requirements and equations

For normalized **encoded sRGB** channel `c`, first compute linear-light `f(c)`:

```text
f(c) = c / 12.92                         if c <= 0.04045
       ((c + 0.055) / 1.055) ^ 2.4       otherwise
Y = 0.2126 f(R) + 0.7152 f(G) + 0.0722 f(B)
contrast = (max(Y1,Y2) + 0.05) / (min(Y1,Y2) + 0.05)
```

WCAG 2.2 AA text contrast is 4.5:1, or 3:1 for large text: at least 18 pt regular or 14 pt bold (or equivalent CJK size). Logos and specified incidental cases are exempt. AAA text thresholds are 7:1 and 4.5:1 respectively. These are criterion thresholds, not a continuous quality score. The formula's `Y` is relative luminance, **not OKLCH lightness**. These definitions and exceptions come from the [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/#contrast-minimum) and its [relative-luminance definition](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance).

SC 1.4.11 requires 3:1 against adjacent colors for visual cues needed to identify UI components/states and meaningful graphical parts, subject to its exceptions. It does not require every decorative border to contrast at 3:1, nor each nonadjacent state color to contrast with every other state. Do not round a failing ratio up to a passing threshold. Thin strokes can remain difficult even when their specified colors pass. See the [normative criterion](https://www.w3.org/TR/WCAG22/#non-text-contrast) and [W3C's informative explanation](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Color meaning needs a visible alternative where people must distinguish states or categories by hue. Labels, shapes, and patterns are possible alternatives. An accessible name alone does not give a sighted color-deficient reader that visible distinction. See [SC 1.4.1 and its explanation](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

**Derived engineering bounds, not a new standard:** for an opaque background luminance `Yb` and required ratio `r`, a darker foreground needs `Yf <= (Yb + .05)/r - .05`; a lighter foreground needs `Yf >= r*(Yb + .05) - .05`. Check the assumed ordering and `[0,1]` feasibility. A hue/chroma constraint can make a desired solution unavailable; report that rather than silently changing the brief. This algebra narrows a search and does not identify a preferred color.

### Transparency and unknown backgrounds

Source-over compositing uses premultiplied components:

```text
alphaOut = alphaSource + alphaBackdrop*(1-alphaSource)
premultipliedOut = alphaSource*source
                 + alphaBackdrop*backdrop*(1-alphaSource)
colorOut = premultipliedOut / alphaOut     when alphaOut > 0
```

The source and backdrop must be in a common, declared compositing space; division is not defined for fully transparent output. Do not blend OKLCH channels with this formula and call the result renderer-equivalent. The operation and grouping are defined by [W3C Compositing and Blending Level 1](https://www.w3.org/TR/compositing-1/#simplealphacompositing), a Candidate Recommendation Draft dated 2024-03-21. A flat color over an opaque backdrop is only one case; imagery, gradients, filters, blending, and translucent ancestors need resolved background evidence.

Local contract: return `unknown`, not `pass`, when the actual backdrop or compositing behavior is unknown. For text on a varying image, review the relevant background regions under the text; a page-wide average or the most favorable pixel is not sufficient evidence. Record whether evaluation used intended styles, resolved colors, or sampled imagery. Anti-aliased glyph-edge samples are not a substitute for the specified foreground/background pair.

## OKLab, OKLCH, and gamut

OKLab represents perceived lightness and opponent axes. Its polar form is:

```text
C = sqrt(a*a + b*b)
h = atan2(b,a)                         // normalize degrees to [0,360)
a = C*cos(h); b = C*sin(h)             // use matching angular units
deltaE_OK = sqrt((L1-L2)^2 + (a1-a2)^2 + (b1-b2)^2)
```

These describe a color model, not a palette-harmony law. The originator explains the model, D65 white point, fitting choices, and limitations in [A perceptual color space for image processing](https://bottosson.github.io/posts/oklab/). Distance is useful for reporting how much a mapped color changed; it is not a preference probability, a contrast ratio, or proof that every user can distinguish two labels.

The [CSS Color 4 revision of 2026-10-22](https://www.w3.org/TR/2026/CRD-css-color-4-20261022/) is a **Candidate Recommendation Draft**, not a final Recommendation. Its OKLCH `L` uses 0–1 (or 0–100%); chroma is not a universal 0–1 saturation slider; hue becomes powerless at zero chroma. Colors may lie outside sRGB or Display P3. Its gamut-mapping approaches seek approximately constant-lightness, constant-hue chroma reduction. Pin an exact algorithm and revision rather than treating arbitrary RGB channel clipping as interchangeable with chroma reduction. CSS parsing support alone does not establish equivalent rendering across runtimes. See [OKLCH notation](https://www.w3.org/TR/css-color-4/#specifying-oklab-oklch) and [gamut mapping](https://www.w3.org/TR/css-color-4/#gamut-mapping).

Local contract: retain the intended color and the actual mapped color separately; record destination gamut, mapper/version, clipping or chroma reduction, and resulting distance. Recompute contrast using the rendered/mapped pair. An sRGB-only evaluator must say it evaluates the sRGB fallback; it must not certify an unmeasured P3 presentation. An achromatic hue must not enter hue-distance scoring. Specify interpolation space, hue path, and alpha behavior instead of assuming them.

## Apple platform guidance

Apple recommends semantic system colors and explicit light, dark, and increased-contrast variants for custom palettes. System values can change, so do not freeze sampled system-color hex values as their identities. Artwork and translucency alter nearby color relationships; color profiles and actual device/lighting checks matter. Preserve the semantic role of colors such as labels and separators. These are platform recommendations from [Apple's Color guidance](https://developer.apple.com/design/human-interface-guidelines/color), not a requirement to replace the specimen's established brand colors.

Apple's [Accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) recommends adjustable text, Dynamic Type, sufficient contrast, and checking both appearances. Its current Inspector guidance table is platform-specific; do not substitute its shorthand bold-text category for WCAG's precise large-text definition. APCA is mentioned there as another measure, but this reference does not treat an APCA result as a WCAG 2.2 contrast pass. Record each algorithm separately if both are explored.

Apple's [Layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) ties hierarchy to reading order and alignment, and adaptation to available space, safe areas, text size, locale, and multitasking. A tablet's narrow window can require a compact layout. Standard components should retain platform familiarity. Platform-specific examples, including television margins or column counts, must not become default iPhone/iPad equations.

## Role-based palettes and composition: editable proposals

[USWDS color guidance](https://designsystem.digital.gov/design-tokens/color/overview/) distinguishes system, theme, and state tokens and uses a smaller role-based palette per project. Its numbered grades belong to its own color system; neither their numbers nor grade gaps are generic OKLCH constants. A useful local role set is `canvas`, `surface`, `text`, `textSecondary`, `accent`, `onAccent`, `focus`, `border`, and relevant semantic states. Introduce only roles the surface needs.

The pinned [Impeccable color reference](https://github.com/pbakaus/impeccable/blob/936867543ac2576920d663cc9803597f6044f3ac/.agents/skills/impeccable/reference/colorize.md) emphasizes meaning, atmosphere, and dosage; its [layout reference](https://github.com/pbakaus/impeccable/blob/936867543ac2576920d663cc9803597f6044f3ac/.agents/skills/impeccable/reference/layout.md) emphasizes reading order, grouping, and rhythm. Treat these as practitioner guidance. They do not establish an optimal hue, a mandatory 60/30/10 area ratio, a universal golden ratio, or a calibrated spacing constant. Use these questions to generate candidates, then inspect them.

The following equations are **local layout bookkeeping** inspired by those goals, not perceptual laws:

```text
available = max(0, windowWidth - safeLeading - safeTrailing)
contentWidth = max(0, min(contentCap, available - padLeading - padTrailing))
blockWidth = min(contentWidth, blockMeasure)
t = clamp((available - anchorWidth0)/(anchorWidth1 - anchorWidth0), 0, 1)
value = value0 + t*(value1-value0)
rowFits = sum(childMinimumWidths) + sum(gaps) <= contentWidth
```

Use strictly increasing anchor widths, finite values, and nonnegative dimensions. Empty available space is an explicit layout failure, not permission to shrink text to zero. `rowFits` is necessary geometry for a proposed row, not a requirement to create one. Choose topology from the reading task. The hero and editorial specimens can remain single columns at every width. A measure cap protects reading while a separate outer container controls placement.

Flex/Yoga portability: resolve numerical width-dependent values in shared logic, then emit flex direction, wrap, gap or equivalent sibling spacing, padding, alignment, bounded widths, and natural heights. Do not make CSS Grid, `ch`, browser-only wrapping, or pixel-perfect browser/native equivalence a hidden dependency. Apply user text scaling without cancelling it through a fit-to-box rule, and remeasure. Ink bounds, line wrapping, and language shaping remain renderer evidence.

Color should reinforce the same composition: reserve a conspicuous role for what needs attention, group related surfaces, and keep meaning consistent. The exact accent area, chroma, whitespace amount, and focal balance remain editable judgments. Their desirability depends on task, content, culture, and viewing conditions. No reviewed source justifies adding those properties into a global beauty score.

## Proposed evidence record

For each color relation, retain: role pair; state/theme; intended colors with spaces and alpha; resolved backdrop; mapped output and gamut; compositing method; criterion/algorithm/version; threshold; measured ratio; `pass | fail | unknown | not-applicable`; exemption reason if used; source URL; and rendering/measurement receipt. Unknown must remain distinct from zero contrast and from a pass.

Keep three independent result groups: hard scoped checks, descriptive geometry/color changes, and human review. A contrast graph can enumerate required role pairs, but do not collapse it and composition heuristics into one rank. Any automated proposal remains reviewable, with fixed colors and role locks respected.

Validation boundaries: inspect both appearances and relevant interaction states, narrow and wide windows, larger text, and target renderers. Treat missing native or device evidence as missing. Award metadata, screenshots at unknown dimensions, and supported-device lists cannot supply it.

## Source and rights notes

Four official historical image assets were inspected by isolated Astra reviewers: Crouton and Bears Gratitude from Apple's award announcement, Seasoned from Awwwards, and Editorial New from CSS Design Awards. The [Apple inspection record](../evidence/review/inspiration/apple-visual-inspection.md) and [website inspection record](../evidence/review/inspiration/web-visual-inspection.md) identify the exact sources, asset hashes, pixels seen, and limitations. The [registry](../research/inspiration-registry.json) now distinguishes those screenshot observations from description-only entries. Only the two Apple iPhone presentations establish an observed device presentation; neither establishes live behavior, and website raster dimensions do not establish a CSS viewport.

These references motivate candidate questions, not new numerical constants. Crouton's restrained foundation and repeated emphasis suggest testing role consistency; Bears Gratitude shows how warmth, illustration and spacing can cooperate; Seasoned demonstrates that photographic texture and lettering exceed a flat-token harmony descriptor; Editorial New supplies a neutral-palette example in which typography carries hierarchy. These are synthetic transfer hypotheses. They support keeping hue harmony optional and composition factors separate, but do not validate any equation, contrast pair, responsive breakpoint or human preference. No equation was retuned from these four images.

All external sources above are primary: W3C, Apple, USWDS, or the color model's author. Apple pages exposed official Markdown alternatives; those were read directly when the web tool rejected `text/markdown`. The registry's Awwwards detail pages were read as official HTML after the web extractor timed out. No live award site/app session or device behavior was observed. Official images were downloaded temporarily for visual inspection, then deleted; no external images, fonts, source code, or brand assets are retained in these research files. Links and concise attributed metadata are reference material, not asset licenses.
