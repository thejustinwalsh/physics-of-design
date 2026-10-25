# Motion as an editable influence

The motion tools expose a stationary-target spring model, property constraints and separate brief-dependent targets. Energy is a measurable model quantity; it is not a beauty score, emotional intensity estimate or physical joule measurement. A brief can request a particular overshoot range, hold a state and release it later. Search does not automatically reward minimum energy or zero overshoot. Music, if used elsewhere, is an optional time source, not a dependency of these equations.

The implementation lives in [motion.ts](../src/motion.ts). It depends only on Zod. It neither changes a screen nor operates a device.

## Public contracts

- `MotionAnalyzeSchema` / `analyzeMotion(input)`: validated model, exact analytic point evaluations, uniform samples, phase curve, energy, extrema, crossings, settling evidence, bounds and provenance.
- `summarizeMotion(input)`: the same analytic metrics and conservative certificate without sample arrays or a uniform sampling loop. `observedSampledSeconds` is null because no sampled observation was performed. Use this in bounded weighted search.
- `sampleMotion(input, timeSeconds)`: one analytic position/velocity/acceleration/energy observation, suitable for scrubbing the same model in a proof.
- `MotionCandidatesSchema` / `motionCandidates(input)`: deterministic alternatives, editable/locked spring parameters, bounded attempts, hard all-time property-bound filtering, and independent deviations from brief targets. No aggregate preference score is introduced here.
- `MotionEmitSchema` / `emitMotion(input)`: a serializable WAAPI, RN spring, RN timing or instant-set plan, or an explicit unsupported result. Input validation errors throw a Zod error; unsupported emission returns `supported:false` with a reason and the model analysis.

```ts
const motion = {
  spring: { mass: 1, stiffness: 140, damping: 15 },
  coordinate: { unit: 'px', from: 32, to: 0, initialVelocity: 0 },
  durationSeconds: 2,
  sampleCount: 121,
  settling: { positionTolerance: 0.1, speedTolerance: 0.1 },
  bounds: { min: -12, max: 40 },
};
analyzeMotion(motion);
summarizeMotion(motion);
motionCandidates({
  motion,
  editable: ['stiffness', 'damping'], locked: ['mass'],
  ranges: { stiffness: { min: 100, max: 240 }, damping: { min: 10, max: 26 } },
  maxAttempts: 96, limit: 6,
  targets: { overshootRatio: { min: 0.08, max: 0.2 }, settlingSeconds: { min: 0.4, max: 1.4 } },
});
emitMotion({ motion, channel: 'translateY', platform: 'web', reducedMotion: false });
```

Inputs are strict, finite and bounded. Spring defaults are mass 1, stiffness 100, damping 20. Coordinates require a unit and start/target; initial velocity defaults to 0. The default horizon is 2 s, sample count 121, and tolerances 0.001 property-units and property-units/s. These are operational defaults, not recommended design constants. The search seed is included even when outside proposal ranges. Locks override editability. Candidate proposals use bounded deterministic low-discrepancy values, then Pareto layers of the separate overshoot/settling deviations; a full layer keeps generation order. Search is not exhaustive and does not claim an optimum.

`unit` is `normalized`, `px`, `dp`, `deg`, `scale` or `opacity`. A normalized trajectory must be converted explicitly before emission. Web translation requires px; native translation requires dp; rotation requires deg, scaling requires scale and opacity requires opacity. Converting normalized displacement by distance D also multiplies velocity/acceleration by D and model energy by D². Comparing unnormalized energies across unrelated coordinate units is meaningless.

## Equations and guarantees

Let y=x−target. The model is

`m*y″ + c*y′ + k*y = 0`, with m>0, k>0, c≥0.

Write α=c/(2m), ω₀²=k/m. For α²<ω₀² the solution uses decaying sine/cosine; equality uses the critical polynomial/exponential limit; α²>ω₀² uses the two negative real roots. The implementation uses stable sinc/expm1 forms near the critical limit and nonpositive exponential arguments for the overdamped solution. Zero damping is a supported conservative oscillator. Floating-point evaluation still has roundoff; it is not symbolic exact arithmetic or a discrete numerical integrator.

Time is seconds. Position has the declared UI coordinate unit U; velocity is U/s and accelerationU/s². Mass is abstract inertia M, damping M/s and stiffness M/s². Model energy has units M·U²/s²:

`K=m*v²/2`, `V=k*y²/2`, `E=K+V`, `dE/dt=−c*v²`.

This identity applies only while the target is stationary and the model has no input, collision, bounds clamp or other forcing. Changing a target, adding velocity, holding an animated value or snapping at rest changes the energy accounting. Compose such events explicitly as separate episodes; do not describe the resulting sequence as a single passive decay. Holding a semantic UI state is also different from sustaining an undamped oscillator.

The output includes finite-horizon peak overshoot and an explicitly separate all-time peak. Candidate overshoot factors use the **all-time** ratio, so a short horizon cannot conceal later overshoot. A zero start/target distance makes the ratio undefined (`null`), including initial-velocity excursions from equilibrium. Exact first extrema determine continuous range even when sparse endpoint samples miss a full oscillation. Initial velocity can cause overshoot even in an overdamped or critical system; “critical has no overshoot” only applies to a zero-velocity step.

Settling is reported in two ways. The sampled observation is the first sample after the last tolerance violation within the chosen horizon; it says nothing about unobserved future times. The conservative certificate uses monotone energy: when E≤min(k·positionTolerance²,m·speedTolerance²)/2, both displacement and speed remain within their tolerances forever under the stationary passive assumptions. Bisection finds that certificate within the horizon. Null means no certificate was found there, not that settling is impossible. This bound is intentionally conservative and is not a perceptual responsiveness metric.

Operational limits reject huge/unstable inputs: horizon≤30s, samples≤2048, attempts≤128, returned candidates≤24, finite coordinate magnitudes≤10⁶, bounded spring parameters, ω₀≤1000/s and α≤100000/s. These protect predictable computation, not aesthetic taste. All-time extrema can lie beyond the sampled horizon.

## Bounds, emission and reduced motion

Explicit property bounds and opacity's intrinsic [0,1] interval are hard emission/search constraints. The model itself remains unclamped so violations can be inspected. Emission rejects an invalid spring instead of silently clipping its overshoot. Scale and rotation bounds are caller-authored because their acceptable ranges depend on content and task.

Web emission uses sampled keyframes with linear interpolation, one iteration, a millisecond duration and forwards fill. Its final frame is the exact horizon sample; it does not secretly snap to the target. A conservative scalar interpolation-error bound follows `max|x″|·Δt²/8`, using initial-energy bounds on speed/displacement. This does not bound composited screen-space error or prove frame delivery. Transform composition with other animations remains the renderer's responsibility.

The RN mapping was inspected against installed React Native 0.88.0's `Libraries/Animated/animations/SpringAnimation.js`. It uses stiffness/damping/mass, property-unit velocity, explicit rest thresholds and `overshootClamping:false`. The emitted config selects the inspected JS driver (`useNativeDriver:false`). RN requires positive damping, and its JS implementation treats all damping ratios≥1 with the critical formula. Therefore zero-damping and overdamped spring mappings return unsupported, while analytic analysis and web emission remain available. Native backend parity is not asserted. RN caps frame-time advancement, inherits velocity on interruption, and snaps at rest; its runtime duration is not the analysis horizon. A fresh animation/value is required for the stated initial conditions.

Reduced-motion input is a caller-resolved preference, not environment detection. `instant` sets the target immediately. `opacity-fade` allows a short linear transition only on an existing opacity channel; transform channels still set instantly. The fade duration is editable and defaults to 0.12s without claiming a universal accessibility threshold. These substitutes deliberately do not preserve spring energy. The caller must observe preference changes and cancel/regenerate in-flight plans.

W3C's current Media Queries Level 5 working draft distinguishes an unknown/no-preference state from a request to remove or replace problematic motion. It does not prescribe this module's durations or spring constants. [W3C prefers-reduced-motion](https://www.w3.org/TR/2026/WD-mediaqueries-5-20260219/#prefers-reduced-motion).

Apple's motion guidance calls for purposeful, optional feedback and permitting cancellation; motion must not be the sole carrier of important information. These principles motivate instant/fade alternatives and responsive controls, but are not a formula for aesthetic quality. The visionOS-specific oscillation guidance is not generalized into a universal UI frequency ban. [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion).

## Evidence and remaining scope

[Tests](../test/motion.test.ts) compare independent cosine, critical and two-root closed forms; finite differences verify the ODE and energy derivative; sparse samples test continuous extrema; near-critical and extreme admitted inputs test finite evaluation. Further tests cover conservative settling, static zero energy, all-time bounds, search budgets/locks, reduced-motion substitution, RN unsupported regimes and the web interpolation bound.

These are mathematical and protocol checks. They do not establish human preference, comfort, gesture continuity, flashing safety, content visibility or performance in a browser/device. Renderer verification and the product task remain separate evidence. Expressive tension is a brief-dependent target to compose, hold and release, not a defect that this module minimizes automatically.
