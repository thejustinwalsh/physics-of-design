# Relay shared handoff

This directory supplies the same product, content, data, rights and tool-coverage inputs to three independent builders. It contains no application implementation.

Read in order: [BRIEF.md](BRIEF.md), [DESIGN.md](DESIGN.md), [TOOL-COVERAGE.md](TOOL-COVERAGE.md), [primary reference ledger](../../../docs/relay-inspiration.md). Import `fixtures.json` and `types.ts`; all records are original synthetic demo data. Source and original technical SVG rights are in [assets/provenance.json](assets/provenance.json); fonts are existing OFL files referenced by repository path.

Verify the frozen dataset with `node experiments/relay/shared/generate-fixtures.mjs --check` and run its meaningful integrity cases with `node --test experiments/relay/shared/fixtures.test.mjs`. Running the generator without `--check` regenerates only fixture files from the fixed seed. It is not a build or design recipe. The primary cross-route flow and exact count changes are in BRIEF.md.

`input-manifest.json` hashes all common authored inputs, the generator/types/fixture, original SVGs, reference records and supplied font/license bytes. It excludes itself, execution receipts and future app outputs. Root’s executable experiment policy/harness can extend that identity and must give every builder the same version. No app choice, renderer quality, native parity or benchmark result has been verified by this handoff.

`evidence/context-*.json` are actual context-inspection outputs for the recorded documents, not UI measurements. [evidence/execution-trail.json](evidence/execution-trail.json) separates authored input, source research, fixture generation/validation, context inspection and pending builder work. Web supports fast tuning, but actual React Native iOS/Android is the primary proof target. The official Expo/RSD integration is documented; its compatibility with this repository’s exact versions remains a required pre-builder smoke check.
