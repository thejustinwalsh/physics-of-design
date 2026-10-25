# Portable execution evidence

This directory contains curated authored measurements, screenshots, synthetic rating records, review hashes, dependency audits and trial accounting. [index.json](index.json) records the source path, byte length and SHA-256 of each copied file. Regenerate it after the relevant runs finish with `EVIDENCE_VELA_ANDROID_FLOW=flows-1792908583406 npm run evidence:export`. Use `node scripts/export-evidence.mjs --check` with that environment variable for a read-only preflight; later runs must name their own successful flow.

- [Current design-machine proof](vela/machine-proof.json) records bounded mathematical search, one real local neural readout and zero-selector replay.
- [Vela web matrix](vela/proof-web/report.json) covers 72 complete screens and interactive failure/recovery behavior. [Native proofs](vela/proof-native) cover 42 screens across seven actual phone/tablet/Android text-scale groups; [expanded Text coverage](vela/native-text-coverage-posthoc.json) rechecks all 665 mounted nonzero boxes, including 189 wholly offscreen children.
- [Vela Android flow](vela/flows-android/flows-1792908583406/summary.json) proves actual task gestures, persistence and reduced motion. Eight taps have independent fresh accessibility XML; two live-clock taps have measured bounds and state-transition evidence with that accessibility oracle explicitly unavailable.
- [Frozen Vela review captures](review/vela-closure) retain historical failures and source-bound before/after corrections. [Current report](../docs/design-machine-report.md) explains their scopes and remaining research limits.

- [Current verification](verification/summary.json) records the latest lane and whether it completed; never infer success from the existence of a log. [Earlier complete lane](verification-full/summary.json) and interrupted/failed runs remain separate.
- [Core matrices](system) preserve actual renderer observations, including the adversarial Android failure and independent repair.
- [Responsive evidence](responsive) distinguishes actual device windows/system scaling from virtual artboards.
- [Full publication proof](fieldwork/proof-web-v3) and [native app proof](fieldwork/proof-native) contain real browser/simulator/emulator captures and scoped frame checks. [Android task flows](fieldwork/flows-verified-final/summary.json) distinguish successful gestures from an older retained failure.
- [Frozen Astra review inputs](review/fieldwork-astra-v2/inputs.json) bind judgments to historical bytes; later fixes do not retroactively change a review.
- [Agent pilot](evaluation-v2/analysis.json) and [derived accounting](evaluation-v2/usage-events.json) retain the negative efficiency result. Full private agent transcripts are excluded; their source hashes remain in accounting.
- [Synthetic tuning inputs](tuning/v1) and [tiny follow-up](tuning/probe-balanced-v2/report.json) are model judgments, not human aesthetic validation or trained weights.

Machine-specific paths in receipts are historical provenance, not runtime dependencies. External award images, full Apple/skill source caches, model weights, SDKs, node_modules and generated application bundles are excluded. Original project art retains its generation provenance; bundled fonts keep their OFL licenses. This is curated evidence rather than a complete copy of the ignored `artifacts` workspace.
