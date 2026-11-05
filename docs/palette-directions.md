# Palette exploration and contrast repair

The November 5 Relay review identified a repeated teal outcome. Source inspection found three concrete causes: the frozen product brief and two seed palettes prescribed cyan/blue-green; the legacy `color candidates` enumeration filled its usual six-result prefix with unchanged-hue lightness variants; and DOM material recipes had independent blue-green base colors. These are coverage, art-direction and consumption defects. No evidence supports declaring teal intrinsically bad or another hue universally beautiful.

`color candidates` now interleaves hue offsets before lightness refinements. The angles remain finite search coverage, not an aesthetic rule. It still changes one unlocked token at a time and includes a feasible original. For coherent changes to enclosure, action, ink and selection, use named whole-palette directions instead.

`palette candidates` keeps its ordinary joint contrast-repair mode. It deliberately preserves the seed's hue while exploring lightness/chroma and neutral luminance intervals. This mode answers “can this palette satisfy these declared edges?” rather than inventing an art direction. Its new optional `directions` input supplies 2–12 source-attributed token patches under the same role/adjacency graph. Locks remain global, every patched name must exist, and the output/attempt limits must allow at least one slot per direction. Work and output slots are divided before repair; one viable candidate per direction appears before refinements. Emitted-identical palettes are deduplicated even when source strings differ. Per-direction unresolved facts, work counts and omissions remain in `exploration`.

```json
{
  "system": {
    "tokens": { "canvas": "white", "ink": "black", "accent": "#174fb6" },
    "roles": [{ "id": "body", "foreground": "ink", "background": "canvas", "use": "text", "source": ["brief:body"] }]
  },
  "limit": 3,
  "directions": [
    { "id": "mineral", "tokens": { "canvas": "#fff6ef", "ink": "#28170f", "accent": "#863d24" }, "source": ["brief:warm mineral"] },
    { "id": "violet", "tokens": { "canvas": "#f7f3ff", "ink": "#21152e", "accent": "#6537a0" }, "source": ["brief:graphic violet"] },
    { "id": "cobalt", "tokens": { "canvas": "#f0f4ff", "ink": "#111d31", "accent": "#174fb6" }, "source": ["brief:technical cobalt"] }
  ]
}
```

Save that input and use the existing `design palette candidates --input FILE`; obtain the exact command contract with `--schema`. Only the body edge is declared in this minimal example, so it makes no claim about accent/control contrast. Production inputs must name actual use, states, adjacent backgrounds and alpha backdrops. The result records `direction.authoredChanges` separately from `changes`: the latter and `objective.deltaEOKSum` describe repairs relative to that direction's seed. An authored patch is not neural selection, and distance from its seed is not beauty.

The existing pinned Color.js conversion maps to the declared sRGB fallback, quantizes output and rechecks role/adjacency/compositing facts. [CSS Color 4](https://www.w3.org/TR/2026/CRD-css-color-4-20261103/) defines color spaces and mapping; the pinned library's [gamut documentation](https://colorjs.io/docs/gamut-mapping.html) explains conversion versus explicit mapping. Neither establishes preferred UI palettes. Color-coded state also needs appropriate additional cues such as wording, position or shape; [W3C's use-of-color explanation](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) distinguishes that requirement from contrast.

## Relay consumption and evidence

Compact palette summaries keep the full role graph behind `candidate.system` references and show bounded `tokenPreview` data with explicit omissions. Use the exact reference for analysis/compilation, preserving all states and adjacency edges. The actual CLI/MCP protocol regression retained six complete palettes with 64 declared edges in 175,784 bytes; its MCP summary was 2,952 bytes and the downstream reference request 66 bytes, with identical analyzer facts. These are fixture-specific transport bytes, not measured model tokens, neural choices or design preference. Full receipts remain in `artifacts/palette-context`; the [migration instructions](../codemods/2026-11-05-palette-summary-references/instructions.md) describe the compact shape change.

`examples/relay/app/src/design/palette-brief.json` records three authored directions: Graphite/citron, Plum/rose and Chalk/cobalt. `node scripts/relay-palette.mjs` invokes the existing `palette candidates`, `palette analyze` and `surface css` implementations, emits editable light/dark tokens plus matching material recipes, and retains full receipts outside model context under `artifacts/relay-palettes`. `--check` rejects stale generated source and runs in Relay's static proof. The three directions share 33 declared contrast edges each, checked separately in both themes. Failed/unresolved directions stop generation. These are deterministic role checks, not actual composite or preference evidence.

Settings chooses a color direction independently of theme. Action ink, focus, normal data, comparison data, severity, component boundaries and material bases consume named roles. The comparison legend identifies left/right series rather than hard-coding cyan/slate. The current browser proof cycles all six direction/theme combinations, checks actual property bindings and material base variables, and captures the app at phone/iPad/desktop sizes in both engines. Its retained result, not this description, determines whether those checks passed. Lit composite contrast, native execution, physical Safari performance and human preference remain separate obligations.

Graphite is an authored initial choice following the user's review, with zero new selector calls. The current exclusive builder run prevents new local-model selection during this repair. No claim of fresh System1 selection, saved-token advantage or better human preference follows from these changes. Use the [matched quality protocol](relay-default-quality.md) for that question, and keep the old frozen builder results intact.
