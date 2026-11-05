# Inspect layout sensitivities and responsive regimes

## Project one measured flow gap

`composition analyze` accepts optional `gapProjection`; the portable layout entry also exports `projectFlowGap`. Supply `currentGap`, `preferredGap`, `minimumGap`, `maximumGap`, optional `step` (default 0.25), optional `endClearance` (default 0), `targets: [{member, intervalsBefore}]` and attributed `source`. Every quantity uses the current renderer's coordinate units. The grid is anchored at `minimumGap`.

For each target, the model predicts `start(g) = measuredStart + intervalsBefore * (g - currentGap)` and the analogous end. It chooses the feasible grid point nearest the preferred gap, breaking equal-distance ties toward the smaller gap. Bounds preserve nonnegative start and end clearance. Unknown measurements remain unavailable; fixed or cross-axis violations remain infeasible. Strict reconstructed floating-point coordinates determine feasibility; no tolerance relaxes containment. Returned grid endpoints describe this conditional affine model, not an interval of verified renderer layouts or an aesthetic score.

The caller must provide the correct translation count and remeasure after applying a proposal. Wrapping, font changes, nested layout and scrolling can invalidate that affine assumption. Relay's bounded adapter only adjusts at the initial scroll position, publishes committed React inputs, and separates proposed/applied/currently measured fit. Its editable brief supplies the 8–20 gap range and four-unit clearance. `node scripts/prove-relay-flow-gap.mjs` exercises actual Expo Chromium/WebKit resize, scrolling, manual, infeasible and idle cases after a current static export; it does not verify native Text/Yoga or preference.

The calculus layer extends the existing `energy analyze` command and the portable `@design-theory/toolkit/layout` entry. It analyzes declared geometry separately from brief preference energy. It is intended for Relay's actual-element inspection mode; the product integration and renderer validation are separate work. [Integration brief](../examples/relay/DESIGN.md).

An ordinary `energy analyze` request retains its finite-neighbor pressure analysis. Add an explicit geometry request to inspect named derived quantities:

```js
import { readFile } from 'node:fs/promises';
import { analyzeEnergy } from '@design-theory/toolkit';

const { handoff } = JSON.parse(
  await readFile('examples/vela/design.generated.json', 'utf8'),
);
const result = analyzeEnergy({
  program: handoff.program,
  assignment: handoff.assignment,
  geometry: {
    scenario: handoff.program.scenarios[0].id,
    outputs: ['paneWidth', 'titleSize'],
    wrt: ['width', 'textScale'],
    envelope: {
      input: 'width',
      min: 390,
      max: 1440,
      precision: 0.25,
      maxCells: 256,
    },
  },
});
```

This headless example uses the existing Vela application model; Relay's integration uses its own current program and properties. Use the application's real program, a named scenario and declared derived IDs. Only the requested envelope input varies during range analysis; other inputs, content/font facts and the chosen assignment stay fixed. A width sweep at one text scale does not certify another text scale, content, axis configuration or platform.

`differentiateExpression` returns the current quantity and forward derivatives with respect to up to sixteen named inputs. It follows the existing evaluator's exact strict/inclusive branch choices and keeps inactive invalid branches unevaluated. Derivatives at detected ties, cusps, isolated comparisons and unavailable nearby real domains remain null. Dependency tracking prevents a zero inner gradient from hiding `sqrt(x²)`'s cusp or `ceil(x²)`'s discontinuity. Conservative boundary flags can withhold a derivative even when a more advanced symbolic simplification could establish one. These derivatives are numerical model calculations, not certified renderer derivatives.

`encloseExpression` propagates conservative intervals for constants, references, sums, differences, products, nonzero-denominator division, min/max, absolute value, ceiling, comparisons, conditionals and fixed integer powers 0–32. Constants and endpoints denote their represented binary64 values. Basic arithmetic expands outward using adjacent representable doubles, including signed/subnormal/extreme values. Overflow, zero-containing denominators, cyclic/missing inputs and unsupported operations return an unresolved result. `sqrt`, `log2` and general powers have no certified enclosure implementation: expanding an arbitrary math-library approximation by one ULP would not establish inclusion. [Boost's primary interval documentation](https://www.boost.org/doc/libs/latest/libs/numeric/interval/doc/interval.htm) explains the rounding and inclusion requirements.

`mapExpressionRegimes` subdivides a declared one-dimensional envelope where a branch, clamp, absolute value or ceiling may change. It returns stable mathematical regions, conservative transition brackets, unresolved cells, validation inputs and explicit work-limit exhaustion. A stable region has no unresolved topology event in the supported expression; its output can still vary or be nonlinear. `affineWithinBox` applies only within that box with the other inputs fixed. It is not permission to extrapolate across boundaries or replace actual text shaping. Unsupported operations stay unresolved; separable domain or ambiguous-branch problems can be subdivided to preserve useful surrounding regions.

The optional geometry result also encloses hard factors that use base acceptance bands. Classification is `proven-mathematical`, `violated-throughout` or `unresolved`. Scenario-specific bands cannot silently be applied throughout an unsampled envelope. Multiple touching bands are merged for coverage; gaps remain gaps. Mathematical factor checks cannot satisfy renderer, accessibility, focus, semantic-state or human-review obligations.

For MCP, fetch the `energy analyze` schema once with `design_catalog`, then call `design_execute`. A retained handoff can supply `program: {$designRef: resultRef, pointer: "/program"}` and its assignment without retransmitting the full program. Default geometry summaries expose at most four quantities and four derivative inputs each, plus enclosure and regime counts. Full maps, unsupported reasons, provenance and validation inputs remain in exact session results. CLI callers use `--summary --output FILE` and the existing hash-bound file-reference mechanism. No new default tool or command is introduced.

Verification includes an independent exact-rational oracle for represented inputs and basic arithmetic, analytic multivariate derivative checks, strict branch ties, degenerate domain/cusp checks, cyclic/overflow rejection, a narrow 521–522 failure missed by three conventional device samples, and explicit unresolved coverage under work limits. The actual CLI/MCP proof uses Vela's existing application handoff to check protocol equivalence and reference reuse; its retained files are `artifacts/layout-calculus/{input,cli,mcp,receipt}.json`. It executes no browser, native renderer or selector and claims no token benefit from byte counts. This proof is part of the existing commands-and-app verification stage.

The isolated Relay integration now uses the same expression definitions for navigation fit, chart topology, shared spacing and its computed inspection readout. Its em-based task-space targets are authored preferences, not measured text widths. The copied historical design presets are starting inputs, not new solver recipes. The root adapter consumes browser ResizeObserver local-content dimensions or native Yoga `onLayout` dimensions, with the actual applied safe padding subtracted. It retains nominal dimensions, provisional/held status and coordinate spaces separately. Root observation and independent root verification remain separate fields.

`node scripts/prove-relay-static.mjs` runs the product's model/markup/policy checks, TypeScript and actual Expo web/iOS/Android exports without launching a browser or native runtime. `node scripts/prove-relay-web.mjs` tests the current product in Chromium/WebKit, including actual-element drawings, an embedded-root width distinct from the nominal window, full task flows and finite regime-derived boundary/interior samples. The existing ordered Expo verification stage runs both. Receipts bind stable source snapshots and retain failures, bundle hashes and separate logs; new tests are not passed evidence until their current receipts say so. Interruption-safe geometry-transition routes, fresh current-product selection/replay and actual native task verification remain separate work. The [source review](calculus-of-interfaces-review.md) records the motivation and deferred distribution-aware work. Real usage weights, human preference, physical Safari performance and aesthetic superiority remain unestablished.
