# Surface and image API reference

Design Theory exposes optional surface and image calculations for callers building different visual directions. The APIs preserve editable inputs and state the assumptions behind their results. They do not assign an aesthetic score. This reference serves renderer and tool integrators; runnable inputs are in [examples/materials](../examples/materials/).

## Surface calculations

[`src/surface.ts`](../src/surface.ts) is browser-pure and has no Three or Node imports.

| Export                                                    | Input and result                                                                                                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SurfaceSchema`                                           | Strict `{baseColor:[r,g,b], roughness, metalness}`; all values finite in `[0,1]`. Base color is **linear sRGB**.                                                                 |
| `SurfaceProbeSchema` / `probeSurface(input)`              | Surface plus optional `normal`, `view`, `light`, and `irradiance`. Returns diffuse/specular BRDF components, relative RGB radiance, intermediate terms, assumptions and sources. |
| `mapSurfaceToThree(input)`                                | Surface to a renderer-neutral `MeshStandardMaterial` recipe, linear color, texture color spaces and channel assignments.                                                         |
| `SurfaceTextureSchema` / `generateSurfaceTextures(input)` | Seeded height-field normal and roughness textures as RGBA8 `Uint8Array`s, dimensions and all resolved parameters.                                                                |
| `surfaceSupport(input={})`                                | Reports supplied `webgl2`, `webgpu`, `offscreenCanvas`, `workerWebgl2` observations. Omitted observations stay unverified. Native rendering is unsupported.                      |

Probe directions point away from the surface in one coordinate space, are normalized internally, and must have length at least `1e-8` with components bounded to ±1e6. Default directions are `[0,0,1]`; default incident light is `[1,1,1]`, bounded to `[0,1e6]` per channel. Incident light is before the cosine factor and has relative units. Back-facing light or view produces zero radiance.

The model uses Lambert diffuse, isotropic GGX distribution, Schlick Fresnel, separable Smith masking, and dielectric `F0=0.04`. It follows the [Khronos glTF sample equations](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#_sample_implementation), with `alpha=max(roughness²,0.0004)` to regularize a zero-roughness delta distribution. The diffuse/specular coupling is an approximation: it does **not** certify exact energy conservation. There is no environment, multiple scattering, occlusion, shadowing, transmission, emission, tone mapping, absolute photometric calibration, or claimed Three pixel parity. [Filament](https://google.github.io/filament/main/filament.html#materialsystem) describes more complete alternatives and their tradeoffs.

Three materials use linear working colors. Call `color.setRGB(r,g,b,THREE.LinearSRGBColorSpace)` for the returned numeric color. Color image maps use `SRGBColorSpace`; normal and roughness maps use `NoColorSpace`. Roughness uses green and metalness uses blue. These are [Three's material assignments](https://threejs.org/docs/pages/MeshStandardMaterial.html) and [color-management conventions](https://threejs.org/manual/pages/color-management.html). A photograph containing lighting and shadows is not automatically a calibrated base-color/albedo map.

Procedural texture inputs are `seed` (uint32, default 1), `size` (4–512, default 128), `pattern` (`noise`, `ridges`, `cells`), integer `frequency` (1–64), `directionDegrees` (±360), `normalStrength` (0–4), `roughness`, and `roughnessVariation` (both 0–1). Defaults are noise, frequency 8, direction 0, normal strength .25, roughness .6, variation .15. The field is periodic; ridge direction is rounded to integer winding counts to preserve tiling. Frequencies approaching the resolution limit can alias and require renderer review.

Normal XY encode negative height derivatives in +u/+v coordinates; the adapter must retain that orientation. RGBA8 quantizes unit normals. Generated roughness is an **absolute** value: set `material.roughness=1` when this map is active, because Three multiplies the scalar and sampled channel. The provided noise, cells and ridges are configurable mathematical patterns with no implied paper, fabric, mineral or metal identity. The [three example recipes](../examples/materials/recipes.json) are authored starting points for distinct briefs, not measured materials.

## Raster analysis

[`src/media.ts`](../src/media.ts) provides Node-side `MediaAnalyzeSchema`, `MediaProvenanceSchema`, `analyzeMediaFile(input)` and `analyzeRasterPixels(pixels,width,height,options)`.

`analyzeMediaFile` accepts a local `file`, optional provenance, `sampleLimit` (1–65536, default 4096), `maxPixels` (up to 16777216, default 8388608), and up to 32 contrast regions. PNG, JPEG and WebP are accepted by content signature, with a 64 MiB file limit. It reads local bytes, computes SHA-256 and decodes with the installed Playwright Chromium into an sRGB RGBA8 canvas. External network requests are blocked. The report records actual decoder version, decoded dimensions, byte length, MIME and a decoded snapshot. Animated media timelines, camera response, capture lighting, physical scale and calibrated albedo remain unknown. The image is never downsampled to certify contrast.

Provenance fields are `origin`, `source`, `creator`, `license`, `licenseEvidence` and `expectedSha256`. A hash mismatch throws before decode. The hash identifies content, not ownership. License text and evidence references are caller declarations, not an independent rights determination. The [original Fieldwork manifest](../research/fieldwork-asset-provenance.json) records generated origin and hash but does not provide a separate image license statement; the example preserves that gap.

The pure pixel function accepts exact RGBA8 dimensions and uses the same options for samples and contrast regions. Its `sampledDescriptors` report systematic stride, sample count, opaque sample count, mean encoded sRGB, relative luminance, variance and a 16-bin luminance histogram. Transparent pixels contribute only to alpha statistics. Sampling can miss any unsampled feature. No object, face, subject, salience, quality or material inference is performed.

Each contrast region has a unique `id`, normalized `region:{x,y,width,height}`, opaque encoded-sRGB `foreground:[r,g,b]`, optional opaque `backdrop:[r,g,b]`, and a required-ratio `minimum` (default 4.5). Every source pixel intersecting the region is visited. The output separates the observed decoded-pixel ratio range from a conservative lower bound over the region's luminance interval. Luminance and contrast use [WCAG 2.2 definitions](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance). If the foreground luminance lies within that interval, the lower bound is 1, even when the exact foreground value does not occur at a source pixel.

Transparent regions without a backdrop return unknown. With a backdrop, the nominal composite uses encoded-sRGB source-over. The bound is confined to the declared source-region model: resizing, interpolation across its boundary, filters, additional layers, canvas quantization, tone mapping, antialiasing and actual display rendering require separate verification. It is not a whole-page accessibility certificate.

## Authored crop candidates

[`src/media-geometry.ts`](../src/media-geometry.ts) is browser-pure and exports `MediaRegionSchema`, `MediaCropSchema`, and `mediaCropCandidates(input)`. It extends the existing `cropMedia` cover geometry.

Required fields are source width/height and target width/height. Optional normalized annotations are `focal`, `target` (default center), `subjects`, `negativeSpaces`, and a destination `textRegion`. Regions must fit within their respective bounds; width and height must be at least `1e-9` to bound numeric division. The function tests the authored focal placement plus a 3×3 grid of cover positions, removes duplicate crops and sorts by weighted penalty. It does not perform a global search.

Weights are editable: subject loss defaults to 4, focal displacement to 1, negative-space loss to 1, and text/subject overlap to 4. Subject and negative-space loss average the fraction of each authored region cropped away. Focal displacement is the normalized destination distance, capped at 1. Text/subject overlap uses the largest single subject intersection fraction, avoiding an inflated sum when subject rectangles overlap; it is not the union of all subjects. Missing annotations yield null penalties and zero ranking contribution. A zero score with missing annotations is not evidence of a good crop.

The [headland inputs](../examples/materials/headland-media.json) contain agent-authored rectangles after inspecting the actual image. They are editorial choices. The [measured report](../examples/materials/measured-report.json) contains the actual source hash, decoder metadata, contrast bounds and crop candidates. Reproduce from repository root with `npx tsx examples/materials/inspect.ts`; the installed Playwright browser must be runnable.

## Verification scope

`npx tsx --test test/surface.test.ts test/media.test.ts` checks analytic normal incidence, BRDF reciprocity, incident-light scaling, grazing-angle finite values, seeded textures, normal quantization, sparse-sample contrast misses, alpha unknowns, analytic black/white bounds, cover invariants, policy-dependent crop selection, hash rejection and real original-image decoding. Renderer output, physical Safari devices and native materials are outside these unit and local Chromium checks.
