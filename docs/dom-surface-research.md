# Lit material planes beneath semantic content

The current opt-in browser adapter renders a bounded WebGL2 material plane underneath real HTML. Paper grain, enamel reflection, metallic response and intrinsic roughness variation now affect the rendered light. The existing CSS recipe remains the default fallback. A CSS gradient is not reported as a PBR result, and the GPU plane is not a full transport renderer.

## Recorded direction and implementation trail

The brief in `DESIGN.md` calls for visible material character on actual content, stable controls and one retained clock. The user critique of weak gradients and concealed surfaces led to this implementation. Inputs are authored in `examples/dom-surfaces/gpu-recipes.json`; no model selection or solver call is claimed. `createDomSurfaceRecipe`, `generateSurfaceTextures` and `probeSurface` are the existing exported implementation functions used by the adapter and proofs. Numeric exploration compares the same pigment under changed roughness, metalness, light, exposure and texture controls. Synthetic root/Astra image critique identified overly coarse paper normals and pebbled enamel; the revision reduces normals and separates high-frequency pigment grain. That critique is not human preference evidence.

Primary inspiration is contextual rather than a copied visual recipe. [Igloo Inc's creator case study](https://www.awwwards.com/igloo-inc-case-study.html) discusses a coherent material world and browser iteration. [Apple's 2023 award account of Flighty](https://www.apple.com/sg/newsroom/2023/06/apple-announces-winners-of-the-2023-apple-design-awards/) supports expressive interaction with clear information hierarchy. [The 2026 Apple Design Awards](https://developer.apple.com/design/awards/) describe Tide Guide's custom animation and visual system. The authored transfer here is one shared lighting regime and stable semantic content, not the source projects' assets, scene, textures, or proof of a universal design rule. No source assets are downloaded or redistributed.

## Reusable API

```js
const recipe = createDomSurfaceRecipe({
  material: 'brushed-metal',
  baseColor: '#bcc7cb',
  ink: '#070a0b',
  roughness: 0.36,
  metalness: 1,
  roughnessVariation: 0.22,
  textureAmount: 0.45,
  textureSeed: 17,
  textureScale: 2,
  contentShieldOpacity: 0,
  exposure: 1.5,
  light: {
    kind: 'point',
    x: -0.55,
    y: -0.7,
    z: 1.4,
    intensity: 0.8,
    ambient: 0.65,
    color: '#ffffff',
  },
});
const controller = createDomLightController(element, recipe, {
  clock: 'external',
  renderer: 'webgl',
  maxTiltDegrees: 0,
  gpu: { pixelRatio: 1, maxPixels: 500000 },
});
// Retain the existing host clock; no second RAF is created.
controller.sample(dtSeconds);
controller.updateRecipe(nextRecipe); // finish/light/color edits are uniforms
controller.setLightTarget({ x: 0.6, y: -0.2 }); // optional host target
controller.setLightTarget(null); // return to pointer/scroll/sensor input
controller.setOutput('specular'); // lit | diffuse | specular | normal | roughness
controller.dispose();
```

The semantic HTML remains above an `aria-hidden`, pointer-transparent canvas. Text, buttons, focus, selection and accessibility are not GPU textures. The adapter never moves a slider rail. Layer resolution defaults to at most 750,000 pixels and DPR 1.5; callers may set a bounded budget from 1,024 to 2,000,000 pixels. The plane is one clipped triangle, one shader program and one 128×128 RGBA texture (256×256 for fine metal grooves). No Three import, scene graph, model or worker is needed.

The optional program initializes in separate context, completion and texture tasks while the CSS version is readable. Where supported, [KHR_parallel_shader_compile](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/) supplies a nonblocking completion query before link status is inspected. Polling uses bounded setup timers rather than another animation clock; texture generation runs in a separate idle task. These measures do not guarantee that driver context creation is free of stalls; the renderer reports both wall-clock initialization duration and the largest observed initialization task. Scalar edits do not compile programs or rebuild/upload normal maps. A material/seed change rebuilds the tile. Texture scale, normal amount and roughness variation are uniforms. Geometry is read at mount, resize, or explicit `refreshBounds()`, never by `sample()`. Identical settled frames submit no draw. Hidden/offscreen updates suspend GPU submission; reduced motion holds a static lit state. Disposal removes the canvas, releases GL objects, cancels pending initialization and restores owned DOM attributes/styles. Context loss reveals CSS; restoration rebuilds GL resources from the retained tile. An unavailable WebGL2 context leaves the DOM operative.

`src/dom-surface-shading.ts` contains DOM-free shader sources, packed texture generation and color conversion. `src/dom-surface-gpu.ts` owns browser canvas/GL lifecycle. A native adapter can reuse the shader and packing, but no ExpoGL/React Native parity or native support is established by these browser receipts. The shader currently uses GLSL ES 3 and `gl_VertexID`; a native host must verify its own context, UV conventions, lifecycle and actual pixels.

## Light and material semantics

The shader evaluates the same single-light Lambert/GGX/Schlick/separable-Smith conventions as `probeSurface`. Input hex pigment is decoded from sRGB to linear reflectance. Metallic Fresnel uses `F0 = mix(0.04, baseColor, metalness)` and diffuse vanishes at metalness 1. Perceptual roughness is squared into alpha; a 0.02 lower roughness bound corresponds to the headless alpha floor 0.0004. The exact diffuse/specular coupling is the inexpensive model already documented by the headless probe, not an energy-conservation proof. [Filament's standard material model](https://google.github.io/filament/main/filament.html#materialsystem) and [PBRT microfacet theory](https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory) ground those terms; they do not validate the authored ambient or texture presets.

The point light varies across the plane and uses inverse-square distance normalized at the authored light height. Intensity is relative, with a documented factor of six in the shader, not lumens. The directional mode keeps the incident direction spatially constant. The view is a finite position at plane z 3.5. Positive x is right; positive authored y is down, converted to up-positive shader coordinates. Cached pointer/scroll/tilt targets alter the light continuously.

The data texture contains normal XY in RG, independent high-frequency pigment grain in B, and signed roughness variation in A. Normals derive from the existing periodic seeded height-field generator. The GPU adds bounded tangent slopes to the virtual plane normal; this is a normal-mapping approximation, not displaced geometry. Mipmapping limits high-frequency aliasing. Brushed grooves perturb normals directionally while the BRDF itself remains isotropic: this is not a full anisotropic microfacet model. Paper has no fiber scattering; enamel has no layered clear-coat transport.

Authored ambient fill is explicit: `baseColor * ambient * (1-metalness) + F0 * ambient`. It keeps the small information surface usable between highlights and is not an integrated environment map. Exposure multiplies linear response, Reinhard maps `x/(1+x)`, and the exact sRGB transfer function encodes the output. Browser alpha composition is sRGB. Soft glass combines this alpha tint with CSS backdrop blur; it does not refract, transmit through a measured thickness, or produce caustics. `specularStrength` remains a CSS fallback coefficient; GPU dielectric F0 is fixed at 0.04.

The four display presets are authored material directions, not measured substance classifications. Higher ambient fill prevents unreadable grazing shadows but reduces diffuse-light contrast; it does not weaken the localized specular response. Contrast has to be measured for actual ink, exposure, material, pose and backdrop.

## Current renderer verification

Run `node --import tsx --test test/dom-surface.test.ts test/dom-surface-gpu.test.ts`, then `node scripts/prove-dom-surface-gpu.mjs`. Use `DESIGN_WEBKIT_EXECUTABLE` only for a local custom runtime. The proof bundles production source, records its SHA-256 identities, and writes full receipts and screenshots to `artifacts/dom-surfaces-gpu/`. Source edits during the run invalidate the freeze check.

The proof measures actual screenshot pixels for roughness lobe width, diffuse/specular metalness changes, intrinsic normals, intrinsic roughness and moving pointer-light centroids. A zero-light control must turn the driven response black; a flat-normal control must remove spatial normal variation. It compares shader diffuse/specular pixels with the existing headless probe after the same exposure and display encoding. These are mechanism tests, not a palette count or aesthetic score.

Real DOM text is hidden temporarily while its boxes remain; computed opaque ink is compared to the actual background pixels beneath each region. This avoids treating antialiased glyph colors as the foreground oracle. The initial enamel preset failed this test at 3.08:1 under the low-exposure, grazing pose. That failure is retained at `artifacts/dom-surfaces-gpu/historical/2026-10-25-enamel-contrast-failure.json`. The corrected preset changes authored pigment, ink and fill, without a large opaque content shield. After that correction, the pre-deferred-compile browser run passed 51 checks including its source freeze, with actual composite minima 5.43:1 (Chromium) and 5.48:1 (WebKit), and shader/headless pixel error below 0.74 of an 8-bit channel. Its first WebKit startup took 365 ms; that cold-start observation is retained in `historical/2026-10-25-before-deferred-compile.json` and motivated the separate initialization tasks. The final current receipt, including any failures, is `artifacts/dom-surfaces-gpu/proof.json`; never infer a pass from this prose alone.

The final staged-initialization run passed **55 checks** (27 per engine plus source freeze) in Chromium 156.0.8078.4 and WebKit 27.2. Both recorded minimum composite contrast at **5.43:1**. The captured pointer-light centroid moved about **91 pixels** in each engine, monotonically through seven observed frames. GPU/headless maximum channel error was **0.47/255** in Chromium and **0.73/255** in WebKit. The largest setup task was **13.7 ms** in Chromium and **33 ms** in WebKit; total initialization includes idle waits and is not frame cost. These observations do not erase the retained cold-start outlier. The separate CSS fallback lane passed 12 checks, and the affected unit lane passed 17 tests.

The executed `context inspect` receipt binds these choices to DESIGN.md hash `3bc9b66ae3b4d059197c9156412ba7d2a682b93c55883d44c4cab8d367eee511`; the full result is `artifacts/dom-surfaces-gpu/context.json`. The brief was read before implementation; this hash was re-inspected after the final renderer run. `execution-trail.json` links authored inputs, numeric exploration, synthetic critique and browser receipts without conflating them.

The lane also exercises native range keyboard input, continuous pointer dragging, a real HTML button, phone/iPad/desktop reflow, changed text, reduced motion, offscreen suspension, WebGL absence, context loss/restoration and disposal. JS submission timing is distinct from GPU completion and frame pacing. Playwright WebKit does not establish physical Safari power use, thermals, refresh rate, transparency under every compositor tree, or real device sensors. [WebKit's Safari 15 release account](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/) confirms WebGL2 support; feature availability alone does not establish these performance claims.

The earlier CSS-only contract and historical receipt are retained below. Its composite-glass negative control remains useful and should continue to run separately; it is not evidence for the new GPU shader.

---

# Historical CSS surface implementation

The reusable stack now has a pure CSS recipe generator, a bounded lighting sampler, a retained browser controller, four material examples and an executable composite-contrast proof. `src/dom-surface.ts` runs headlessly; `src/browser-dom-light.ts` has no React dependency. The gallery’s `DomMaterialStudy` uses the same exports and the existing shared GSAP/Lenis clock. It selects one large material example at a time; roughness updates retain the controller rather than resetting motion during a drag.

This is a **CSS approximation of a lit 2D surface**, not a PBR implementation. The existing Three/GGX stack remains the appropriate path for actual 3D material rendering. CSS gradients, alpha, texture patterns and projected shadows can communicate depth without requiring a mesh, but they do not conserve radiometric energy or solve interreflection, visibility, refraction or contact geometry.

## Research scope and working instructions

Research and implementation: 2026-10-25. Before implementation, the Design Theory skill and motion/material reference were reread. The read snapshots were:

| Instruction source                                            | SHA-256 at read time                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.agents/skills/design-theory/SKILL.md`                       | `00bbeff1a9ac3155d66f3a797c8135a79764fa0be4adea47d6947a84800c9ec5` |
| `.agents/skills/design-theory/references/motion-materials.md` | `21a4142cf5331d59f10f7456572fc1be158c463015c1d8a87423f78292c9cb9f` |

The controlling distinction is maintained: measured renderer facts, mathematical descriptors, authored appearance choices and preference claims remain separate. The energetic palette and large material studies are authored art direction. No fixed “pleasing material pair” score, physical calibration, real user interview or hardware Safari validation is inferred from them. The team’s synthetic brief exercise is recorded separately from user evidence.

## Pure recipe and lighting API

```js
const recipe = createDomSurfaceRecipe({
  material: 'enamel',
  baseColor: '#e98259',
  ink: '#241d1a',
  roughness: 0.22,
  elevation: 18,
  radius: 30,
  light: { x: -0.55, y: -0.7, z: 1.4, intensity: 0.8 },
  contentShieldOpacity: 0.9,
});
const frame = sampleDomSurfaceLight(recipe, {
  x: 0.6,
  y: -0.2,
  tiltDegrees: 6,
});
```

`DomSurfaceSchema` validates every recipe. Roughness, intensity, texture amount, specular strength, content shielding and translucency are in [0,1]. Elevation is 0–48 CSS pixels; radius is 0–128 CSS pixels. Light x/y are in [-1,1], z in [0.25,4]. Colors are opaque six-digit sRGB hex values. Translucency is accepted only for soft glass. The sampler accepts normalized x/y in [-1,1] and decorative tilt in [0°,12°]. The recipe includes complete neutral-state CSS variables, shared `DOM_SURFACE_CSS`, a class/attribute contract, descriptors, and explicit unknown rendered-composite contrast.

Apply `.dt-dom-surface`, the recipe’s `data-dom-surface` attribute and `cssVariables` to an element. Put semantic content in `.dt-dom-content`. Decorative pseudo-elements sit below that content and ignore pointer input. The content shield is a separately authored tint layer, not a universal contrast guarantee. Callers can choose lower shielding, but must then verify their actual backdrop and light states.

### The mathematical part

For motion targets x and y and maximum decorative tilt t, set a = xt and b = yt in radians. The virtual plane normal is

`N = (sin(a) cos(b), sin(b), cos(a) cos(b))`.

The authored light position is adjusted by the bounded target and normalized:

`L = normalize(light.x + 0.65x, light.y + 0.65y, light.z)`.

The view convention is `(0,0,1)`, the half-vector is `H = normalize(L + V)`, and the diffuse descriptor is `max(0, N·L)`. A bounded highlight descriptor uses `max(0, N·H)^p`, with an authored exponent `p = clamp(2/max(0.04, roughness²) − 2, 1, 48)`. This power lobe supplies a stable appearance control; it is not the GGX distribution or a normalized reflectance law. The physical reference explains why surface-normal distributions and roughness influence reflection, rather than certifying these CSS coefficients. [PBRT: Roughness Using Microfacet Theory](https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory).

For a virtual height e above a planar receiver, the point/directional projection cue is `(shadowX, shadowY) = −e(Lx/Lz, Ly/Lz)`. Positive light z is bounded away from zero. Increasing roughness broadens an authored radial highlight and increases an authored shadow-softness coefficient. Brushed metal uses an elongated highlight and directional lines. Highlight opacity, diffuse darkening, rim opacity and cast-shadow opacity are bounded presentation coefficients. At authored intensity zero, those driven layers vanish; a static border/contact cue still describes the component boundary.

The geometry of CSS box shadows and their blur/spread is defined by CSS, not by our model’s material name. Multiple background layers and rounded clipping supply independent material structure. [CSS Backgrounds and Borders](https://www.w3.org/TR/css-backgrounds-3/#box-shadow).

### Four materially distinct cues

| Recipe        | Appearance mechanism                                                                       | Deliberate limit                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Paper         | Low-amplitude crossed line texture, low specular strength, broad diffuse cue, shallow lift | Procedural fiber/crosshatch metaphor; no paper scattering or microscopic fiber model                  |
| Enamel        | Smooth saturated color, compact rounded highlight, brighter rim                            | Glaze appearance cue; no layered dielectric transport                                                 |
| Brushed metal | Directional fine grooves and an elongated highlight                                        | No true anisotropic BRDF, metallic Fresnel or measured groove profile                                 |
| Soft glass    | Translucent tint, backdrop blur, soft rim and content shielding                            | No refraction, thickness, caustics or physical transmission; opaque fallback when blur is unsupported |

Alpha composition changes the final background under the foreground. A nominal ink/base-color ratio therefore cannot certify a transparent, layered component. The opaque foreground and rendered background must be evaluated after those layers are composited. [Compositing and Blending](https://www.w3.org/TR/compositing-1/#simplealphacompositing).

## Retained browser adapter

```js
const controller = createDomLightController(element, recipe, {
  pointer: true,
  scroll: true,
  tilt: false,
  clock: 'external',
  responseRate: 10,
  maxTiltDegrees: 6,
});
// In the existing shared clock; seconds, not milliseconds:
controller.sample(dtSeconds);
// A slider changes appearance without resetting pose or rebuilding observers:
controller.updateRecipe(nextRecipe);
// A host-driven layout change can refresh cached geometry outside the frame loop:
controller.refreshBounds();
// On unmount:
controller.dispose();
```

With `clock: 'auto'`, the controller owns one requestAnimationFrame loop and stops when its held target settles. With `external`, it never requests RAF. Pointer events replace the latest target. Scroll reads the current scroll position and uses cached document geometry; it does not read element layout in the frame loop. ResizeObserver, window resize and explicit `refreshBounds()` refresh geometry outside `sample()`. A host that moves an element without resizing it must call `refreshBounds()` after that layout change.

The held-target filter is `current += (target−current) × (1−exp(−rate × dt))`. Its frame-partition invariance is tested for the same held target. Different event schedules remain different inputs. `sample()` accepts 0–1 seconds; the built-in RAF clamps its presentation step to 50 ms and resets hidden-time gaps. This is a first-order decorative response, not a claim about conserved spring energy.

Hidden documents, offscreen elements and reduced-motion preferences suspend frame updates. Reduced motion also neutralizes the transform. Disposal removes observers/listeners and restores the inline CSS variables, data attribute and class ownership captured at construction. The adapter owns its variables until disposal; callers should change them through the recipe rather than competing writers. [Media Queries: prefers-reduced-motion](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion).

Optional tilt reuses `createDeviceTiltController`. Construction never prompts; call `requestTiltFromUserGesture()` directly inside an explicit user action. The permission/calibration API is the existing screen-relative small-angle mapping, not a hardware pose solver. Offscreen suspension stops sampling/rendering; the authorized sensor controller can still retain the latest event. Hidden/reduced-motion sensor cleanup and disposal follow the existing tilt controller. Physical iPhone/iPad sensor behavior is not established by desktop WebKit.

## Safari and backdrop limits

WebKit announced unprefixed `backdrop-filter` in Safari 18. The recipe supplies both prefixed and unprefixed declarations, detects support for the fallback, and leaves filtering semantics to the browser. A supported property is not proof that every ancestor/compositing configuration behaves identically. WebKit has documented historical regressions involving custom-property values and backdrop roots, so test the actual component tree rather than relying only on a version label. [Safari 18 WebKit features](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/), [WebKit issue 297620](https://bugs.webkit.org/show_bug.cgi?id=297620), [Filter Effects Level 2](https://drafts.csswg.org/filter-effects-2/#BackdropFilterProperty).

The fallback is opaque base color, not a blur imitation. The evidence uses Playwright WebKit 27.2 and Chromium 156.0.8078.4 on this host. It establishes engine rendering behavior for the recorded cases, not Safari hardware refresh rate, low-power behavior, thermal cost or real sensor permission UI.

## Actual composite contrast proof

Run:

```sh
npm run build
node --import tsx --test test/dom-surface.test.ts
node scripts/prove-dom-surfaces.mjs
```

The CLI emits the same recipes: `printf '%s\n' '{"material":"enamel"}' | ./dist/cli.js surface css`. To sample one pose, call `surface light` with `{ "surface": { "material": "enamel" }, "motion": { "x": 0.5, "y": -0.2 } }`. MCP uses the same inputs through `design_catalog`/`design_execute`; complete CSS stays in the exact result reference. The browser controller is imported from `dist/browser-dom-light.js`. Set `DESIGN_WEBKIT_EXECUTABLE` only when using a custom local WebKit installation; otherwise Playwright uses its installed engine.

The proof bundles the production recipe/controller, renders four materials against a patterned backdrop, and samples nine light/tilt poses per engine. Foreground spans are hidden while preserving their layout and their content-shield layers. The browser screenshot is decoded to an sRGB canvas; interior background pixels in each text region are compared to its opaque computed ink. Glyph antialiasing pixels are not incorrectly used as the foreground color. This verifies the recorded composites, not an unrendered swatch.

The authored acceptance threshold is 4.5:1 for these ordinary-size text samples. That threshold follows WCAG’s minimum text-contrast criterion; this one proof does not establish overall WCAG conformance, every control state, or every backdrop. [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

The deliberately unsafe glass control has nominal opaque contrast 21:1 but a rendered ratio near 1.05:1 over the dark backdrop. It must fail. That negative control prevents the tool from treating a high base-swatch ratio as sufficient evidence for translucent content.

The same proof checks no additional `getBoundingClientRect` reads during 120 retained frame samples, recipe updates preserving pose, reduced-motion pause, offscreen pause, disposal, runtime errors, feature support and source identity. Synchronous sample timings are JS arithmetic/style-write measurements only: they exclude paint/compositor completion and do not prove frame pacing or an animation-library ranking. Source hashes reject concurrent edits during the run. Evidence and screenshots are written under `artifacts/dom-surfaces`.

## GPU submission outside animation callbacks

The WebGL adapter can draw synchronously when a recipe or output mode changes, including when its external clock is stopped. It now calls nonblocking `gl.flush()` after each submitted draw, following [MDN's guidance for WebGL rendering outside requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_webgl.flush_when_not_using_requestanimationframe). The unchanged-pose guard still skips both drawing and flushing. This submits queued commands; it does not wait for GPU completion or prove that the compositor has presented the new state.

Linux WebKit CI at `c6fae34` retained two byte-identical screenshots per GGX pose that still showed the preceding state's pixels. Thus waiting for animation callbacks and snapshot stability alone did not resolve the stale output. The flush change is a candidate correction pending the same strict Linux pixel oracles. It is not a performance result, physical Safari evidence, or a reason to introduce blocking GPU completion/readback into production rendering. See the [retained diagnosis](../artifacts/dom-ci-c6-review/README.md).
