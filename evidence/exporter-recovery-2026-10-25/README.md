# Recovery publisher: raw versus curated checkpoint metadata

The original source-frozen exporter failed before staging evidence because it compared raw model metadata directly with curated selector provenance. The raw `gguf` object includes file location and byte count; the selector's existing schema retains its SHA-256 content identity. The original failure log is preserved exactly. This was an archive validation bug, not a failed model readout or a changed proof.

`export.mjs` is derived from the unchanged original exporter. Only relative imports, the checkpoint metadata comparison and explicit recovery-producer provenance differ. It compares all other model fields exactly and requires the checkpoint SHA-256. Raw selector output is copied unchanged; no receipt is edited or promoted from failure to pass. The authored 170-file allowlist and all verification/source/renderer gates remain intact.

`regression.test.mjs` uses actual raw/curated model metadata, reproduces the original assertion failure, accepts only the intended nested metadata projection, rejects changed model/revision/backend/serving/options/checkpoint identity, and checks that inputs remain unchanged. It runs no model. The original production exporter remains unfixed in the verified checkpoint; a later source fix requires its own test/verification history. Full34 verification applies to the unchanged 348-source snapshot, not this recovery helper.

Run from repository root: `node --test evidence/exporter-recovery-2026-10-25/regression.test.mjs`, then `node evidence/exporter-recovery-2026-10-25/export.mjs`. The main evidence manifest identifies this producer and its SHA-256 separately from the frozen source identity.
