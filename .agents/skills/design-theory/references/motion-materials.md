# Motion, surfaces and materials

Use `motion dynamics` for a spring whose target changes: position and velocity remain continuous, while target work and dissipated energy are separate. `motion timeline` makes a bounded sample table; projection is presentation policy, not conserved physics. GSAP is a runtime adapter, Lenis a scroll input. Do not claim one animation library is universally faster. Match seconds/milliseconds at clock boundaries; use one host ticker, cleanup and reduced-motion handling.

For device tilt, request sensor permission only from an explicit user gesture. `createDeviceTiltController` calibrates, rotates screen coordinates, damps by elapsed time and bounds light targets. API availability is not receipt of sensor events. Pause offscreen/hidden work and keep layout/React updates out of each frame. WebKit-port tests do not prove physical Safari power or sensor performance.

Use `surface probe` for linear-RGB Lambert/GGX response, `surface map` for explicit Three material conventions, and `surface textures` for seeded normal/roughness data. Absolute roughness maps require material roughness1. Base color is reflectance, not a lit screenshot or a guarantee of text contrast. Preserve texture channel/color-space semantics and disclose unsupported cloth, glass, layering or anisotropy rather than relabeling basic GGX as those materials.

Use `media analyze` for decoded image descriptors and authored source-region contrast, `media crops` for authored focal/subject/negative-space crop alternatives. No salience detector is implied. Source pixel contrast remains distinct from the final scaled/cropped/overlaid composite. Record creator/license/rights evidence; unknown rights stay unknown.

Material pairings require separate physical plausibility, perceptual descriptors and brief preference factors. Shared finish can support grouping; deliberate roughness/color/texture contrast can support counterpoint. No fixed pleasing-pair ratio is established. Keep source, uncertainty and authored target bands visible, compare alternatives under one lighting/exposure regime, and verify real rendered text/controls through motion states.

Research and exact implementation limits: docs/motion-safari-research.md, docs/material-image-rules.md and docs/material-pairings.md.
