# Empty glyph outlines

Per-glyph `inkBounds` from `shape()` is now `Rect | null`. Spaces and other genuinely empty outlines have no rectangle. Positioned advances, glyph identities and tracking remain present. Aggregate run ink was already nullable at runtime; its inferred TypeScript declaration is also corrected to `Rect | null` rather than an erroneously narrowed `null`. No import, persisted state or command name changes.

Guard per-glyph bounds before geometric operations:

```ts
const ink = glyph.inkBounds;
if (ink !== null) drawOutlineBounds(ink);
```

Do not replace null with a fake rectangle, numeric zero or non-null assertion. A space still advances the pen; skipping its outline must not skip that advance. For optical unions, ignore empty outlines while preserving the shaped positions of every glyph. For UI inspection, report that no outline exists. An entire run can also have no ink.

This migration requires semantic choices, so the deterministic AST pass enumerates direct property chains and deliberately makes no automatic edits. `scan(project)` also includes potentially ambiguous non-optional chains in other structures named `inkBounds`; verify the producer before changing them. The recipe does not silently add optional chaining to arithmetic, which could convert missing geometry into `NaN`.

Use pinned `ts-morph` from `codemods/package.json`. Import `scan` with a project configured by the consumer's own tsconfig, inspect every site, then type-check its actual nullable declarations. The fixture test verifies the AST query, unchanged disk in dry/write modes and correct advance-preserving behavior. In this repository no legacy direct per-glyph property chain required rewriting; the new typography inspector handles null directly. Check residual `.inkBounds` access and do not alter unrelated DOM rectangles or wire strings.
