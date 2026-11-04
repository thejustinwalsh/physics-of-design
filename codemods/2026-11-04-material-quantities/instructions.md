# Separate material quantities from preference distances

The old `appearance.material.roughnessDifference` named a normalized band residual, not the roughness difference. A saved zero cannot recover the raw difference: many distinct materials meet the same authored band. This requires semantic review, not a global string replacement. The scanner reports potential TypeScript/TSX call sites and intentionally edits nothing.

For a consumer intentionally reading preference distance, use:

```ts
const residual =
  selected.values.phone['appearance.material.roughnessDifference.bandResidual'];
```

For the material descriptor, use:

```ts
const delta =
  selected.values.phone['appearance.material.roughnessDifference.value'];
if (typeof delta !== 'number')
  throw new Error('Material roughness difference unavailable');
```

The same suffixes apply to the other material relation metrics. Raw units and provenance remain in compilation outputs and analyzer evidence. A residual is dimensionless distance from an authored band, not material roughness, energy or aesthetic quality. Exact point targets now use the same unit-scale normalization as `material candidates`; the former kernel's `1e-6` denominator floor is removed. Recompute preference energies rather than preserving old numeric scores.

Unknown descriptors remain null. Appearance candidates with an unknown requested descriptor are infeasible, and alternatives must declare the same comparison metrics. Attributed target ranges can differ between alternatives; they are conditional policy, not a common aesthetic scale. Supply missing facts or deliberately revise the brief; never replace unknowns with zero or silently omit a metric. This does not require a particular finish, target range or aesthetic.

`material candidates` residual records now label `units` as `dimensionless`; their added `descriptorUnits` and `scaleUnits` retain the physical/parameter units. Update displays that previously treated residual units as descriptor units.

Recompile original kernel inputs with the new engine, then rerun/revalidate choices and regenerate resolved JSON and property bindings. Do not rename keys or rewrite hashes in stored compilation/decision/renderer receipts. Old compilation engines are rejected. Retain historical evidence under its original source and meaning. Fresh current renderer measurements are still required.

Review dynamically assembled keys, JSON pointers and inspection displays manually. The scanner cannot infer what arbitrary strings or aliased dictionaries mean. It leaves strings, comments and persisted payloads unchanged. `surface.roughness`, `surface.metalness` and `spring.*` are already raw parameters and keep their meaning. Preserve all other typography and geometry properties.

Search residual uses with `rg 'material\.(roughnessDifference|alphaDifference|metalnessDifference|deltaEOK)|relational-kernels-v1|residuals|descriptorUnits|scaleUnits' src test examples` and inspect every result by role. Trace aliases of `residuals` records before changing unit displays; the scanner only recognizes direct reads. The distinguishing material-quantity regression in `test/relational-kernels.test.ts` exercises actual compilation, workflow and resolution; it must preserve a nonzero raw difference with a zero satisfied-band residual, reject missing comparison facts, and keep replay deterministic. No frozen builder app or historical evidence is migrated in place.
