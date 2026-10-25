# Typography precision

Use real content and licensed font bytes. Inspect `font inspect` for available axes, features, coverage and hash before proposing coordinates. `typography inspect` resolves responsive size/measure and user enlargement, then reports separate shaping and optional actual-browser facts. `typography axes` defaults to 64 candidates: enough for all 40 independent Roboto Flex probes. Fetch one schema through `design_catalog`; keep summaries and exact result references in model context.

Treat these evidence classes separately:

- Fontkit global hhea/OS2 metrics are base-table values; MVAR deltas are not applied. Reference H/x/p/g outlines can expose actual variation effects without pretending to be universal cap/x/descent metrics.
- Glyph advances/offsets and vector outline bounds describe a single fontkit logical run. Empty outlines have null bounds but retain advance. Kerning and authored tracking stay distinct.
- Browser Range rectangles are selection fragments, not raster ink or CSS line boxes. Mixed fallback metrics can produce several groups on one physical line.
- DOM baselines come from a zero-size inline-block accepted only when all original grapheme geometry remains unchanged and the marker belongs to the observed group. Rejected/budget-exhausted probes stay null. Specimen guides omit unknown positions.
- Canvas TextMetrics describes a separate drawing state. It does not inherit every CSS axis/feature declaration; never replace DOM baselines with Canvas or font-table arithmetic.

Preserve every available variable axis as editable. Compare minimum/default/maximum one axis at a time, recording outline, geometry, line-break and height effects. Endpoint samples do not establish intermediate behavior or cover all combinations. Refine only meaningful local combinations, then render finalists at phone, iPad/window and desktop widths with enlarged/changed text. A line-break change is a discrete event, not a smooth gradient. Leading, tracking, measure and adjacent whitespace remain coupled choices through the factor/search tools.

Separate requested coordinates, fontkit policy and observed browser effects. Explicit axes override high-level values in fontkit; browser optical sizing is not fully observable. The recorded WebKit case changes geometry with `opsz:14` and auto sizing even where Chromium does not. Computed style confirms declarations, not actual selected coordinates.

`render:false` is explicitly fontkit-only. Native Text/Yoga measurements remain available through `layout measure`; native axis application/baseline extraction is unsupported by this inspector. FontFace loaded/check and primary cmap coverage do not prove which fallback face supplied a glyph. Never label an unmeasured raster boundary, fallback identity or native feature as verified.

Use `npm run typography:proof` for the source-bound two-engine endpoint/script/baseline evidence. Baseline probing has a bounded query budget and is inspection work, never per-frame animation work. Detailed semantics live in `docs/typography-measurement.md`.
