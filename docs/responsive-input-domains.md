# Responsive input domains

A finite renderer test matrix is evidence at sampled inputs. It is not a responsive product's range of allowed window sizes. The Vela viewport guard formerly conflated those concepts, freezing an otherwise usable layout outside320–1440×320–1210. That behavior was removed after user critique.

A handoff may now explicitly declare continuous positive input domains:

```ts
const runtimePolicy = {
  unsampledScenarioBands: 'base' as const,
  inputDomains: {
    width: 'positive' as const,
    height: 'positive' as const,
    textScale: 'positive' as const,
  },
};
const handoff = createDesignHandoff({ program, assignment, machine, runtimePolicy });
```

Every runtime input must still be finite. A declared positive input must be greater than zero and must name a program input. Its finite test-sample min/max no longer acts as an admission boundary. Other inputs retain the existing envelope semantics. Existing handoffs are unchanged unless they explicitly opt in. Hard factors, scenario-specific meaning, expression validity and renderer verification remain independent checks. The policy participates in handoff identity and replay; changing or omitting it invalidates a saved recipe.

This is permission to apply the authored equations at an unsampled input, not empirical proof that a layout fits there. The equations themselves must remain meaningful. Vela keeps body size readable, floors expressive type at body size, caps reading measure on wide displays and makes its content constraint relative to available width on narrow displays. If a short window cannot allocate the header, reading area and fixed action dock, actions enter the normal scroll flow. Every positive measured window recomputes current geometry; only unavailable/nonfinite/nonpositive observations temporarily retain prior real geometry.

Extremely small windows cannot physically display a readable glyph or target all at once. Content must remain mounted and reachable by scrolling; hiding content, freezing a previous viewport or asking the user to resize is not the fallback. Tests distinguish mathematical validity, live reflow, text fit, scroll access, task continuity and actual renderer geometry.

The Vela checks cover both directions and all six screens at narrow, phone, iPad, desktop, 4K, tall and short samples in Chromium and WebKit, plus a live running-session resize path. A separate actual one-pixel viewport check establishes only live geometry/no runtime failure, not simultaneous readability. Those samples do not establish every possible renderer/platform combination. Native Text/Yoga evidence is retained separately.
