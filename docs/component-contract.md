# Component allocation contract

`solveComponentContract(input)` solves one component with optional fixed leading/trailing slots and flexible text. `componentContractSvg(result)` draws the same returned rectangles, equations, baselines and radius binding. Both are exported from `src/component-contract.ts`; `ComponentContractSchema` is the executable input reference. Neither function reads files or invokes a renderer.

## Measurement loop

1. Supply authored border, padding, gaps, fixed slot sizes, text minimum width and available width. Use one explicit platform unit: web `css-px`, iOS `pt`, Android `dp`.
2. With `text.measuredHeight:null` and `text.measurement:null`, solve the allocation. Read `allocation.selectedTextWidth` and `topology`.
3. Render that topology with the actual content/font/state/viewport/text scale. Supply measured text height and its width, unit, text scale, runtime/font/state/content identities, measurement reference and sources. Baseline offsets are optional observations relative to the measured text box.
4. Solve again. A matching observation permits exact rectangle derivation. Draw the result, then compare it with actual component and slot geometry. `solved` means the supplied allocation equations close; renderer verification remains pending.

Example without side slots:

```ts
const input = {
  id: 'notice',
  platform: 'web',
  unit: 'css-px',
  stateRef: 'design-state:sha256:…',
  contentRef: 'content:sha256:…',
  viewport: { width: 390, height: 844, textScale: 1 },
  source: ['design-brief:notice'],
  availableWidth: 320,
  border: 1,
  padding: { inline: 16, top: 12, bottom: 12 },
  gaps: { leading: 8, trailing: 8 },
  text: {
    id: 'message',
    fontRef: 'font-and-axes:sha256:…',
    minWidth: 120,
    measuredHeight: null,
    measurement: null,
    source: ['content-layout:min-width'],
  },
  minHitSize: 44,
};
const allocation = solveComponentContract(input);
// topology: row; selectedTextWidth: 286; height: null;
// status: needs-measurement. No invented text or component rectangle.
```

When measurements arrive, `text.measurement` contains `width`, `unit`, `textScale`, `measurementRef`, `runtimeRef`, `fontRef`, `stateRef`, `contentRef`, `source`, and optional `baselines`. The state identity must cover the typography and layout state, including variation axes, font size, line height and responsive styling; the solver cannot authenticate a caller's evidence. Font metrics may be attached separately with explicit `font-units`, units-per-em, ascent/descent/line-gap, cap/x heights, font identity and sources. Global font metrics do not determine actual glyph ink or line baselines.

## Equations and topology

For the row, absent slots also remove their associated gaps:

```text
W = 2B + 2P + I + G1 + F + G2 + A
H = 2B + Pt + max(HI, Htext, HA) + Pb
F >= text.minWidth
```

Slots are vertically centered within the maximum row height. Text receives the remaining inline allocation. Controls are never silently shrunk. If the row cannot meet the minimum, only a caller-declared `stack:{gap,align,source}` permits stacking. The stack gives text the full inner width and lays present slots vertically; its height is the sum of slot heights and inter-slot gaps plus border and block padding. Fixed slots and the text minimum must still fit. Changed text width requires a new measurement. Without a suitable declared topology the result is `infeasible`.

The text measurement width comparison uses an absolute `1e-8` coordinate-unit tolerance for floating-point reconstruction, not a physical layout allowance. Geometry feasibility itself is not relaxed. Mismatched state/content/font/unit/text-scale identity, missing measurement, or changed width yields `needs-measurement` and null height/rectangles. The needed allocation remains available.

## Bounds and evidence

| Output                                              | Meaning                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bounds.border`, `bounds.content`, slot allocations | Algebraically derived rectangles in component-local coordinates, origin at border top-left.                                                           |
| `bounds.paint`, `textEvidence.ink`                  | Unknown; allocation is not painted glyph/shadow extent.                                                                                               |
| `bounds.hit`                                        | Centered proposal expanded to `minHitSize`, independent of visual size. Runtime hit behavior, ancestor clipping and overlap remain unverified.        |
| `bounds.clip`                                       | Unknown by default; a declared border/content clip has a derived rectangle. Explicit `none` is distinct from unknown and does not describe ancestors. |
| `textEvidence.baselines`                            | Local observed offsets translated by the derived text-box origin; unknown when absent or stale.                                                       |
| `provenance`                                        | Separate authored, observed, derived, hypothetical and unknown entries. Sources survive the solve.                                                    |

A deliberately concentric `radius:{outerRadius,innerInset,source}` binds an inner box uniformly inset by `border + innerInset`. The effective uniform outer radius is capped by half the actual border-box dimensions. The inner radius subtracts the full inset and is capped by half the inner dimensions. An inset leaving negative inner dimensions is an explicit constraint failure. No binding means unknown, not an invented radius rule.

The SVG includes proposed hit expansion in its viewBox, labels exact dimensions and variables, and draws observed baselines only when supplied. Its shapes are projections of the contract, not a second layout calculation. Diagram precision does not establish optical alignment, usable interaction, accessibility conformance or aesthetic quality.

## Verification and provenance

Ten focused tests cover exact row closure, omitted gaps, minimum boundary, declared stacking and remeasurement, impossible widths, measurement identity, unknown ink/baselines, proposed hit geometry, conditional radius constraints and deterministic escaped SVG. `npm run typecheck` passes. Fixtures are explicitly synthetic observations; no renderer receipt is manufactured by these tests.

The equations and evidence distinctions implement the [component contract in ADR 001](adr-001.md#required-component-contract-and-inspection-layer). The repository's [Dimensional Drawing provenance record](../research/dimensional-drawing-provenance.json) pins the practitioner reference for symbolic inspection sheets. No third-party source or example is copied. Integration with actual web/native component renderers remains required.
