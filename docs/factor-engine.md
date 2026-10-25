# How the relational engine produces revisable choices

This explanation is for developers extending the rules or interpreting a candidate. The reusable result is a state model, mathematical descriptors, conditional factors, constrained search and real measurement. The hero and editorial files exercise that machinery; they do not define its input content.

## Relative dimensions and conditional compatibility

For positive comparable dimensions, the engine uses `I(a,b) = log2(a) − log2(b)`. Intervals add along a chain and survive uniform scaling. A size pair of 24/48 has the same interval as 36/72. Negative tracking and zero gaps require their own representations: tracking is in em; zero gaps occupy an explicit rhythm bin.

A compatibility curve is a mixture of peaks on that logarithmic axis:

```text
q_k = weight_k / max(weight)
A(r | C) = Σ q_k exp(−0.5 ((log2(r) − log2(ratio_k)) / sigma_k)²) / Σ q_k
```

The implementation normalizes weights before summing and standardizes distance before squaring, avoiding overflow and tiny-sigma NaNs. Multiple peaks, broad tolerances and off-scale alternatives remain possible. A curve carries its source and evidence category. Its height is compatibility under the declared prior, not a measured probability of preference.

Smooth hierarchy proposals start at the current title/supporting-text ratio and nearby multiplicative changes. The optional musical intervention substitutes nearby logarithmic landmarks while keeping the search budget and feasibility rules fixed. Nothing forces every relationship onto the same ratio. Musical priors remain hypotheses and smooth is the default.

## Coupling is local and measurable

Each block retains its actual font file, axes, size, weight, shaping/kerning settings, extra tracking, leading and measure. The graph separates font facts, shaping, rendered layout, hierarchy, whitespace, rhythm and responsive consequences. Changing a title size invalidates its shaping/layout, subsequent positions and dependent relationship factors. Changing a gap does not require pretending that font metrics changed. State/font hashes prevent reusing a receipt for different inputs.

The current proposal rules use smooth, configurable starting points. For example:

```text
tracking(size, weight) = clamp(0.008 − 0.012 log2(size/16)
                             − 0.006 (weight−400)/500, −0.035, 0.025)
measure ≈ size × mean actual font advance × target characters × density adjustment
gap ≈ next size × gap target + previous size × 0.04
      + excess previous lines × previous size × 0.04
```

Leading also depends on role, font x-height and measured line count. These coefficients are **uncalibrated heuristics**, identified as such in the factor output and registry. Targets can change without changing factual measurement or treating a designer's preference as an accessibility standard. Character-count descriptors are not language-independent reading measures.

Search combines discrete hierarchy/density seeds with a second refinement after actual line breaking. It never differentiates through a wrap. Invalid numerical proposals are reported separately before rendering. Hard renderer failures remain visible. A candidate becomes viable only if its base and requested width/scale scenarios pass; the system then retains a Pareto frontier of separate conditional factors. It never sums them into beauty. Locks and per-run pins constrain every proposal.

This distinction matters in the Android long-word regression: the original input exceeded its native text measure by about 1.70 units. Measurement continued to reject that input. The same generic search produced eight viable, remeasured alternatives and rejected another alternative with a failing stress scenario. The engine did not insert a content-specific break, lower an overflow threshold or suppress text enlargement. Evidence is retained in the [system report](system-report.md).

## Width adaptation is another coupled rule

For available width `w` between authored anchors `w0` and `w1`, the shared resolver computes:

```text
t = clamp((w − w0)/(w1 − w0), 0, 1)
value(w) = value0 + t(value1 − value0)
effective size = base size × interpolated size scale × requested textScale
```

Gutters, gap scale, content cap, relative measure, leading and tracking use the same bounded interpolation. Native system fontScale remains additional. Values stop at the endpoints rather than growing without bound. Changing the base size therefore changes every responsive size; editing an anchor changes its neighborhood. All these values remain ordinary editable JSON.

An optional two-block split requires:

```text
available content width ≥ (minimum title measure + minimum prose measure)
                          × max(1, requested scale × system scale) + split gap
```

Otherwise it becomes a stack. This is a transparent space-eligibility heuristic, followed by actual rendering, not a universal device breakpoint. A capped reading column can stay single-column on desktop. Structural patterns preserve semantic reading order. Both emitters explicitly set flex direction, wrapping, grow, shrink and basis; column reading stacks use nowrap to prevent Yoga from starting another column. The browser observes container width; native hosts supply measured window/container context. [Responsive rules and source rationale](responsive-rules.md) explain the platform practices.

## Rhythm, tension and the evidence boundary

Spacing analysis preserves sequence order, repeated motifs, subdivisions and local entropy windows. Identical histograms can have different ordered patterns. Entropy describes variation and is never optimized as quality. Surprise requires an attributed observed count distribution; arbitrary model logits are not a design distribution.

Deviation from a local interval is distinct from proximity to clipping, collision or a wrap threshold. The renderers probe actual break changes and return bounded distances; they do not estimate final line breaks from a musical ratio. Fontkit supplies real glyph/run facts, while browser and native renderers own final layout. Kerning and tracking stay distinct.

SemIf's one pinned Qwen selector runs only after fresh deterministic validation. Its option readout chooses an alternative, establishes no facts and calibrates no aesthetic curve. Human preference, token savings and musical advantage require their own observations. The [system report](system-report.md) states the actual results; [the architecture decision](adr-001.md) records the tradeoffs. For runnable commands and schemas, start at the [README](../README.md).

## Current execution boundary

The current default `musical` policy is passed into hierarchy scoring and hierarchy proposal generation. Other factor curves default to smooth unless explicitly overridden. Rhythm analysis is returned as evidence but is absent from the Pareto objective map. Wrap thresholds are reported measurements; no coupled compositional energy or dynamics model currently consumes them. Fieldwork calls the separate `planComposition` heuristic function and does not call the musical search engine to construct its full pages/screens. The important missing mechanism is the repeated System 1/tool decision tree. Musical extensions are optional hypotheses; the absence of a separate physical dynamics simulator is not itself a mission failure. Coupled measured effects, candidate preferences and dependency invalidation are the operational pushes and pulls that the tree must expose. [Acceptance audit](system-completion.md#relationship-and-component-precision-audit).
