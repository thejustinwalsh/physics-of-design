# Design Theory explanation snapshot

Open `index.html` directly or serve this directory as static files. The explanation embeds its teaching data and uses no network requests, remote assets, model calls or native runtimes. `report.html` is the long-form report; its editable Markdown lives at `docs/how-design-theory-works.md` in the repository.

The seven teaching machines use real engine-produced outputs. Energy targets and gate/binding observation declarations are explicitly authored teaching inputs, not real measurements. The separate gallery/Expo/material/kernel receipts retain their actual renderer/provider scope. The initial verification snapshot, Android interruption and successful source-stable recovery are distinct files. Original failed partial Android rows were not fully preserved; the diagnostic excerpt states that gap.

- `manifest.json`: source and receipt SHA-256 hashes, capture time and recovery addendum.
- `engine-results.json`: executed inputs/results, dependency closures, search/replay, runtime applicability, gate/binding checks and specialist calculations.
- `generate.ts`: invokes existing repository implementation functions; no model inference. Existing snapshots are preserved and source hash changes abort regeneration.
- `build.py`: embeds the retained data and produces the HTML report and line-numbered source view.
- `verify.mjs`: isolated Chromium/WebKit artifact checks; screenshots and machine-readable verification output.
- `sources/`, `source.html`: frozen implementation copies, with report links to exact lines.
- `receipts/`: retained evidence copies, including explicit limits.

From repository root:

```sh
node --import tsx evidence/system-explainer-2026-10-25/generate.ts
python3 evidence/system-explainer-2026-10-25/build.py
node evidence/system-explainer-2026-10-25/verify.mjs
```

The verification helper uses the existing repository WebKit runtime, or `DESIGN_WEBKIT_EXECUTABLE` if supplied. It launches isolated headless browsers without opening a service port. No source tests, examples or experiments are modified by these commands.

This bundle is an explanation with scoped evidence, not an independent review of every implementation branch or proof of product quality. Its generated HTML and source copies use the repository MIT license in `LICENSE.txt`.
