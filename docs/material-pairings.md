# Material pairing reference

`analyzeMaterialPair` exposes separate physical-model checks, numeric material descriptors, and editable art-direction bands. A pairing can meet a continuity brief and fail a counterpoint brief with identical inputs. Neither outcome is a universal aesthetic judgment. This module complements [surface and image analysis](material-image-rules.md).

## Evidence and scope

[Burley's Disney work](https://disneyanimation.com/publications/physically-based-shading-at-disney/) combines observations of measured reflectance with controls useful to artists. It supports a principled model with room for art direction; it does not supply a preference function for arbitrary pairs of materials. [Filament's standard model](https://google.github.io/filament/main/filament.html#materialsystem) and [Khronos metallic-roughness materials](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials) provide the parameter interpretation used here. Homogeneous conductors and dielectrics occupy metalness endpoints; intermediate values describe a model blend or transition. Parameter consistency does not prove that a real substance has those properties.

Material appearance also depends on the scene. [Norman, Todd and Phillips's illumination experiment](https://arxiv.org/abs/1908.00902) changed lighting over shiny materials and found that material categorization changed. The [Material Fingerprinting study](https://arxiv.org/abs/2410.13615) collected perceptual-attribute ratings from dynamic material stimuli. Its stated limitations include the sampled materials and restricted viewing/lighting geometry. These studies motivate multiple descriptors and controlled comparisons. Their results do not validate this module's example pairings or numerical bands. [Fleming's review](https://www.annualreviews.org/doi/10.1146/annurev-vision-102016-061429) gives broader context for the interaction of shape, illumination and material.

The mathematical basis here is explicit and conditional: parameter differences and log ratios describe alternatives; authored intervals specify which relationships a brief requests. No empirical preference model is fitted, and no total weighted score is produced.

## Input contract

[`src/material-relations.ts`](../src/material-relations.ts) exports `MaterialFeaturesSchema`, `MaterialRelationMetricSchema`, `MaterialPairProfileSchema`, `MaterialPairSchema` and `analyzeMaterialPair(input)`.

The pair input contains `first`, `second` and an optional `profile`. The materials must have different IDs. Each material requires an ID, the existing strict `surface` schema, and `provenance:{kind,source,note?}`. `kind` is `authored` or `measured`; this is a caller declaration, not independent verification. `composition` defaults to `unspecified`, with explicit alternatives `homogeneous-dielectric`, `homogeneous-conductor` and `mixture`.

Optional texture fields are `cyclesPerTile`, `heightAmplitudeFraction`, `tileWidthMm`, `projectedTilePixels`, `textureResolution` and `pattern` (`sinusoidal` or `other`). Amplitude is a fraction of the declared tile width, not a normal-map-strength slider. The source spectrum and physical scale are never inferred from an image. Optional lighting fields are `rigId`, `environmentId`, `coordinateFrame`, `exposureEv` and `lightDirection`.

A profile contains an ID, intent, source, role relation (`shared-group`, `foreground-background`, or `counterpoint`) and one or more bands. Each band has a metric name, inclusive minimum/maximum, rationale and source. Every threshold is an authored policy. One band per metric is allowed; inverted bands, unknown fields, invalid directions and nonfinite values are rejected.

## Descriptors

| Metric                               | Calculation and limitation                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deltaEOK`                           | Euclidean OKLab distance after converting **linear sRGB base-color parameters** with Color.js. It is a distance between parameter swatches, not rendered surface appearance. |
| `roughnessDifference`                | Absolute difference of the two roughness parameters.                                                                                                                         |
| `alphaDifference`                    | Absolute difference of roughness squared, before renderer-specific clamping.                                                                                                 |
| `metalnessDifference`                | Absolute difference of the dielectric/conductor model-blend parameters.                                                                                                      |
| `textureTileFrequencyOctaves`        | Absolute log2 ratio of cycles per tile. Different tile scales remain different physical frequencies.                                                                         |
| `texturePhysicalFrequencyOctaves`    | Absolute log2 ratio of cycles/mm; null unless both physical tile widths are supplied.                                                                                        |
| `textureAmplitudeFractionDifference` | Difference of authored height amplitudes relative to their respective tile widths.                                                                                           |
| `textureAmplitudeMmDifference`       | Difference in physical height amplitudes; null without both physical scales.                                                                                                 |
| `lightingDirectionDegrees`           | Angle between normalized directions, only when both explicitly name the same coordinate frame.                                                                               |
| `exposureEvDifference`               | Absolute difference in authored exposure stops, not a claim of equal irradiance.                                                                                             |

Each descriptor returns value, units, interpretation and source attribution. [OKLab's author](https://bottosson.github.io/posts/oklab/) defines the color-space construction and rationale. That color distance does not imply a harmonious pairing, hierarchy, text contrast or display luminance. Metal and dielectric base colors also have different physical interpretations.

Texture features additionally report samples per cycle at texture and projected-image resolution. Two samples per cycle or fewer is marked at-or-above the Nyquist limit. More than two marks only the **declared frequency** as below that limit. A sinusoidal height field has maximum slope `2π × amplitudeFraction × cyclesPerTile`; other patterns return null. These calculations follow [sampling theory](https://pbr-book.org/4ed/Sampling_and_Reconstruction/Sampling_Theory), but higher harmonics, specular response, perspective, mipmaps and filtering can still produce aliasing. A one-axis declared frequency is not an exhaustive bandwidth measurement.

## Result interpretation

Physical-model checks report conflict when a declared homogeneous dielectric uses nonzero metalness, or a homogeneous conductor uses metalness below one. They permit the authored recipe to remain inspectable. An unspecified composition stays unknown. The basic surface model omits effects such as anisotropy, clearcoat, transmission and subsurface scattering.

Each brief band reports `within-band`, `below-band`, `above-band`, or `unknown`. The overall brief status says only whether its declared bands are met, violated, or incomplete. Grouping and hierarchy remain authored intentions; exact matching finish parameters do not prove perceived grouping. Matching light-rig IDs are declarations, and matching exposure does not account for local geometry or light transport.

`textOverlayLegibility` stays unknown until the actual rendered composite is measured across relevant light/view states. `empiricalPreference` also stays unknown. Neither is filled from base-color distance, texture entropy, or finish similarity.

## Examples and checks

[`examples/materials/pairings.json`](../examples/materials/pairings.json) defines a related pair of matte surfaces and a contrasting conductor control, then applies both continuity and counterpoint briefs. Colors, dimensions, texture amplitudes and thresholds are authored examples. They are not copied measured materials or calibrated mineral/metal samples.

For each comparison, resolve its material and profile keys and call:

```ts
analyzeMaterialPair({
  first: example.materials[comparison.first],
  second: example.materials[comparison.second],
  profile: example.profiles[comparison.profile],
});
```

`npx tsx --test test/material-relations.test.ts` checks identity and symmetry, black/white OKLab distance, texture scale conversion, sampling limits, common-frame lighting, composition conflicts, profile-dependent outcomes and numeric bounds. These tests verify the stated mathematics; rendered appearance and human preference remain separate evidence.

## Bounded candidate selection

`MaterialCandidatesSchema` and `materialPairCandidates(input)` accept one `anchor`, 1–32 `alternatives`, a required profile, and an optional result `limit` (1–16, default 8). Anchor and alternative IDs must all be unique. Every alternative and its full pair analysis remains in the result.

For each band, the residual is distance outside its interval divided by the interval width; inside the band it is zero. Exact zero-width targets use scale 1 in the metric's units, explicitly labeled `zero-width-target-unit-scale`. Positive widths below `1e-9` are rejected to bound normalization. These residuals are independent objectives; they are never summed into a beauty score.

A candidate dominates another only if it has no larger residual on every objective and a smaller residual on at least one. `paretoIds` retains the complete nondominated set. Candidates with any unknown requested metric stay in `unresolvedIds` and cannot dominate by omitted data. Candidates with complete descriptors retain their physical-model cautions; numeric feasibility does not remove those cautions.

`selectedIds` sorts the Pareto IDs lexically and applies the presentation limit. This tie rule is deterministic, not a preference ranking; unselected members of the front remain available. The same inputs therefore produce the same decision set independently of a particular scene or state-machine implementation.

The example JSON's `selections` reuse the same matte inset and conductor control as alternatives. Resolving those references and calling the candidate function selects the matte inset under continuity and the conductor under counterpoint. The example test executes both selections. A caller can resolve any example selection with:

```ts
materialPairCandidates({
  anchor: example.materials[selection.anchor],
  alternatives: selection.alternatives.map((id) => example.materials[id]),
  profile: example.profiles[selection.profile],
  limit: selection.limit,
});
```
