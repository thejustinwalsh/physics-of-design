# Deliberate Friction — build report

Delivered a fresh four-section React 19 / StyleX 0.19 workbench in `public/index.html`, built with the supplied esbuild helper. Implementation lives in `src/app.jsx` and `public/base.css`. Serve the `public` directory; the local test server used `http://127.0.0.1:4173`.

## Working behavior

1. **Set the intent:** editorial opening, original inline SVG study, chapter navigation, and an action that scrolls to the workbench and focuses the headline textarea.
2. **Feel the response:** real DOM paper and cobalt enamel surfaces. Both use the isolated toolkit's authored CSS surface recipes, with different textures, highlight widths and specular response. Pointer light updates the surface; an opaque content shield keeps text stable. Scroll moves only a bounded decorative registration strip. CSS approximation is labeled.
3. **Inspect the consequence:** Compose and Inspect share one input state. Multiline headline, font size, measure, and finish roughness all work. Inspect selects the actual headline; a fixed overlay tracks its current viewport rectangle. Geometry updates after edits, resize, font loading and scroll. Proposed inputs are distinguished from observed dimensions. The receipt includes input identity and the precise measurement method and limits.
4. **Keep a direction:** save inputs in localStorage, change them, replay them, reset to defaults, and download editable JSON. Export synchronously remeasures the current headline before generating the file. Storage failures produce a visible status message. Saved inputs survive reload.

The app uses native controls, semantic sections, accessible labels, visible focus, flex/flex-wrap and natural text height. Reduced motion keeps every task and uses static lighting/registration. A single event-driven requestAnimationFrame scheduler updates retained decoration; it does not run an idle animation loop. Visibility gating, intersection observation, and cleanup are implemented. No network assets, extra packages, child agents, external inference, or generated imagery were used. Supplied fonts retain their OFL files. The supplied build helper, package manifest, guidance, toolkit, assets, BRIEF.md and DESIGN.md were not edited.

## Actual verification

`npm run build` completes without warnings after correcting an initial StyleX class merge mistake. The local Playwright Chromium tests were run with:

- `node evidence/test.mjs` — the main suite, run twice after the initial sandbox launch failed.
- `node evidence/extended-test.mjs` — lighting, storage persistence, text scaling, additional drags, reduced-motion flows and attempted WebKit coverage.
- `node evidence/final-check.mjs` — the final enamel inspection outline and current geometry.

Final recorded browser results: **52 passed checks, no failing checks, one unavailable check**. These are assertions in this implementation's local test scripts, not a general quality or accessibility score.

Tested viewport sizes: 1440×1000, 390×844, 320×800, 834×1112 and 1024×768. All five have no horizontal page overflow at default and 200% root text size. A separate check confirmed that all 56 sampled authored text elements doubled in computed font size. A longer headline also remains contained at 320px.

Continuous native pointer drags were exercised for every slider at all five sizes. Recorded rail drift was zero and the sampled values were monotonic. Keyboard range adjustments, headline keyboard selection, primary-action focus, mode preservation, both materials, save/replay/reset, persistence after reload, and actual JSON download were exercised. Reduced motion was tested with inspection, static pointer light, static registration, save, replay and download. No page runtime errors were recorded.

The recorded inspection checks show zero difference between the current headline DOM rectangle, the receipt, and the overlay. Pointer movement changed the live light coordinates; scrolling changed the registration translation within its authored bound. Both material content shields were verified as opaque computed backgrounds. Nine declared text color roles passed toolkit AA contrast analysis; the smallest checked ratio was 5.69:1. This is a role-specific opaque-sRGB check, not a full moving-pixel audit.

Screenshots and JSON results are in `evidence/`. The machine-readable index is `evidence.json`.

## Attempts and corrections

- Initial build: duplicate `className` attributes from combining StyleX spreads and CSS classes. Corrected by explicitly merging the generated class strings. Subsequent builds were clean.
- Initial Chromium launch inside the filesystem sandbox failed with macOS Mach-port permission denial. The same local browser tests ran successfully with the execution tool's reviewed sandbox override.
- First browser pass: horizontal overflow at 200% text size on 390px and 320px screens. Retained the original observations in `evidence/browser-checks-before-correction.json` and `evidence/test-output-before-correction.log`. Corrected display-type scaling, word wrapping and flex minimum sizes. Repeated the main suite; all required sizes then passed.
- Final visual correction: used an acid selection outline and focus ring on cobalt enamel. A targeted current-DOM check passed after rebuilding.

## Toolkit provenance

The supplied design-theory skill and relevant local references were read. CLI discovery used `node toolkit/dist/cli.js --help`, `registry` with JSON stdin, and the supplied command/schema sources. No external skill resources were fetched.

Actual design-dependent calls:

| Command | Input / receipt |
| --- | --- |
| `registry` | `{}` → `evidence/toolkit-registry.json` |
| `context inspect` | DESIGN.md, three required section names → `evidence/design-context.json` |
| `surface css` | paper, #eeeae0, #171815, roughness .76, radius 0, shield 1, elevation 12 → `evidence/surface-paper.json` |
| `surface css` | enamel, #2349d9, #ffffff, roughness .24, radius 0, shield 1, elevation 12 → `evidence/surface-enamel.json` |
| `color analyze` | `evidence/color-input.json` → `evidence/color-analysis.json` |

At runtime the allowed isolated `dom-surface.js` exports `createDomSurfaceRecipe` and `sampleDomSurfaceLight` create current roughness recipes and sample pointer light. Runtime invocation totals were not instrumented. Surface presets are authored appearance policies, **not solver runs**. No numerical search, candidate ranking, neural selection or universal aesthetic score was performed.

The export binds the unmodified design document identity:
`DESIGN.md:sha256:3bc9b66ae3b4d059197c9156412ba7d2a682b93c55883d44c4cab8d367eee511`.

## Limits and remaining gaps

- The installed Playwright WebKit executable is absent. No browser was downloaded. WebKit, Firefox, physical Safari/iPad hardware, screen-reader interaction and device performance remain unverified.
- Range rectangles are selection fragments, not raster ink or guaranteed physical line boxes; zero-area fragments and blank lines are excluded. Empty headlines retain a measurable placeholder box with zero visible text fragments.
- Extreme enlargement at 320px intentionally wraps large display words and produces substantial vertical scrolling. Inputs and actions remain available; the large headline is not silently shrunk.
- Hidden/offscreen gating and cleanup were reviewed in code; lifecycle power consumption was not instrumented. Pixel-level composited contrast across every light position was not exhaustively sampled.
- Local persistence is browser-specific. JSON is editable and portable, but this brief did not request a JSON import control.
- Synthetic interview direction is authored guidance, not human preference evidence. No adoption, hardware-performance, aesthetic-quality or comparative-efficiency claim is made.

First observed task clock: 2026-10-25 12:15:45 UTC. Final evidence generation time is recorded in `evidence.json`; all work completed inside the 900-second budget.
