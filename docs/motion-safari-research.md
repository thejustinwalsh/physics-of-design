# Driven motion, scroll timelines and Safari tilt

Research and local probes: 2026-10-25. This is an implementation record for Design Theory, not a mandatory visual style. Spring parameters, authored ranges, input angle sensitivity, output tilt and damping rate remain caller policies.

## What the modules establish

`src/motion-dynamics.ts` provides exact held-target spring propagation, explicit target work, a bounded sampled presentation timeline, scroll progress and elapsed-time damping. `src/browser-tilt.ts` provides opt-in sensor input with a single host clock. Neither module depends on React, GSAP, Lenis or Three, reads layout, or owns a requestAnimationFrame loop. Neither promises an off-main-thread DOM animation.

| Export                                                                        | Contract                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createDrivenMotion({spring?,position,target?,velocity?})`                    | `advance(dtSeconds)`, `retarget(target)`, `snapshot()`. The spring schema retains the existing numeric operational envelope. Target magnitudes are at most 1e6; a step accepts 0–30 seconds.    |
| `MotionDynamicsSchema`, `analyzeMotionDynamics(input)`                        | Serializable CLI/MCP trace with at most 2048 `{dtSeconds,target?}` steps. A target change precedes its step. Reports samples, final state, balance residual and model limitations.              |
| `MotionTimelineSchema`, `sampleMotionTimeline({motion,min,max,sampleCount?})` | 2–2048 bounded samples using `sampleMotion`; explicit clamp count and interpolation/endpoint provenance. Bounds are caller-authored.                                                            |
| `sampleTimelineProgress(table,progress)`                                      | Constant-time linear table lookup; progress saturates at 0 and 1.                                                                                                                               |
| `scrollProgress(position,start,end)`                                          | Normalized, bounded progress through either direction of a nonzero authored range. The host supplies measured geometry outside the frame loop.                                                  |
| `dampMotionValue(current,target,rate,dtSeconds)`                              | Exact first-order held-target response; rate is per second.                                                                                                                                     |
| `mapDeviceTilt(current,baseline,screenAngleDegrees,inputRangeDegrees?)`       | Local beta/gamma differences mapped into screen axes, clamped to ±1. This is small-angle decorative control, not a full attitude reconstruction.                                                |
| `createDeviceTiltController(options?)`                                        | `requestFromUserGesture()`, `sample(dtSeconds)`, `calibrate()`, `dispose()`, `status`. Input range defaults to 30°, maximum output rotation to 8°, response rate to 12/s; all are configurable. |

For a stationary spring anchor, `E = (m v² + k(x − target)²)/2` and `dE/dt = −c v²`. Retargeting leaves position and velocity unchanged. Its signed work is `ΔW = k((x − newTarget)² − (x − oldTarget)²)/2`. The ledger therefore reports `E = E_initial + W_target − D`; moving the anchor closer can remove energy. Dissipation is the sum of exact segment energy decreases, with signed floating-point roundoff retained. It is not a separate numerical integration of `c v²`.

The runtime uses the same stable analytic form as `sampleMotion`, with coefficients validated once at construction. Tests compare all damping regimes against the existing sampler, whose tests include independent closed forms and differential checks. Retarget continuity and partition invariance apply to the same timed target schedule. A scroll target sampled at different frame rates can be a different forcing schedule; this implementation does not claim those schedules are identical.

Timeline clamping is intentionally a presentation policy. Clamped/interpolated values do not retain the spring energy law. The table retains its finite-horizon sampled endpoint; it does not silently snap to the target or normalize away overshoot. A caller choosing opacity bounds can suppress overshoot while a separate transform channel keeps it. A caller seeking a proof of the original continuous trajectory should use the existing `analyzeMotion` bounds instead.

## One clock and library choice

GSAP's ticker callback supplies time in seconds and delta in milliseconds. Its API supports adding and removing a listener. Create property setters once, keep element references, and write transforms from that listener. `quickSetter` skips parsing/convenience work of repeated `gsap.set`; the vendor's speed range compares those two GSAP paths, not GSAP against anime.js. Sources: [GSAP ticker](https://gsap.com/docs/v3/GSAP/gsap.ticker/), [quickSetter](<https://gsap.com/docs/v3/GSAP/gsap.quickSetter()/>).

Lenis 1.3.27 is installed in this workspace. Its source confirms `autoRaf: false`, `syncTouch: false` and `respectReducedMotion: true` defaults. The upstream integration calls `lenis.raf(time * 1000)` from the GSAP ticker. Keep one clock and avoid a second auto-RAF. With this pinned version, reduced motion disables smoothing and makes programmatic scroll instant. Prefer native touch scrolling unless a product requirement warrants touch synchronization. The README flags Safari frame-rate/power limitations and nested-scroll costs; these are maintainer caveats, not proof of every current Safari configuration. Source: [Lenis README and source](https://github.com/darkroomengineering/lenis/tree/v1.3.27).

Anime.js supports a shared loop through `engine.useDefaultMainLoop = false` and `engine.update()`. It also offers a WAAPI backend; its docs distinguish CPU-load/CSS animation use from JS objects, canvas, complex timeline and callback control. This makes “GSAP is universally faster” unsupported. A fair comparison must pin versions and match target count, properties, duration, interruption behavior, compositor eligibility, hardware, refresh rate and load. No GSAP-versus-anime throughput result is established by the arithmetic probe below. Sources: [anime engine update](https://animejs.com/documentation/engine/engine-methods/update/), [backend choice](https://animejs.com/documentation/web-animation-api/when-to-use-waapi/).

Integration sequence: call Lenis with clock time; consume the latest scroll/sensor input; advance the driven spring and tilt filter; write retained transform setters and bounded lighting uniforms. Use explicit visibility pause/resume rather than feeding a hidden-tab gap into the spring. A maximum frame delta is a host time policy and changes elapsed simulation time; document it if used. Stop/remove the ticker and destroy Lenis/controller/renderer on disposal. A renderer worker should have at most one frame in flight and overwrite pending input with the latest target, rather than accumulating sensor messages.

## Sensor and Safari boundaries

The Device Orientation specification exposes beta/gamma orientation and requires secure contexts. Permission requests that need a prompt require transient user activation. Relative orientation permission involves accelerometer and gyroscope, whereas absolute orientation can also involve a magnetometer. The controller calls only `DeviceOrientationEvent.requestPermission()` when present, directly inside the explicit user-action method; it does not request raw motion or compass data. Browser-provided orientation is sufficient for decorative lighting; this code neither integrates raw acceleration nor claims hardware-specific sensor fusion quality. Source: [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/).

Construction does not prompt or attach a sensor listener. Denial, unsupported contexts and rejected permission calls leave neutral output. The first consumed valid event establishes beta/gamma zero. Later events replace one latest sample. Screen-angle changes reset calibration, preventing stale portrait axes from driving a landscape view. Visibility loss or reduced motion removes the sensor listener and resets output to zero; returning recalibrates. Disposal invalidates pending permission completion and removes all listeners. The mapping is appropriate near the calibrated pose; extreme Euler-angle transitions should not be interpreted as a physically reconstructed attitude. Permission status alone does not prove usable sensor events; a desktop may expose the API and deliver none.

Safari 16.4's OffscreenCanvas addition covered 2D operations. WebKit's historical clarification says OffscreenCanvas WebGL requires macOS Sonoma, iPadOS 17 or iOS 17. Therefore presence of `OffscreenCanvas` is insufficient: test transfer plus actual worker `getContext('webgl2')` success. Sources: [Safari 16.4 release](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), [WebKit clarification](https://bugs.webkit.org/show_bug.cgi?id=254071#c5).

WebKit's GPU-process architecture isolates drawing/driver access. It does not move application JavaScript, event handlers, DOM layout or React to a worker. Source: [Safari 17 GPU process](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/#security).

For the surface renderer, feature detection needs a real worker initialization acknowledgement, a timeout, bounded backing resolution, a cap on device-pixel ratio, and a main-thread or static fallback. Transferring a canvas is irreversible for that element; initialization failure may require replacing it before a main-thread fallback. Handle context loss, resizing and disposal. Pause hidden work. Avoid per-frame geometry/material creation, synchronous pixel readback and repeated layout queries. These are implementation recommendations to verify in the actual app; the probes here do not validate the finished renderer's behavior or thermal/power cost.

## Executed verification

`npx tsx --test test/motion-dynamics.test.ts test/motion.test.ts`: **22/22 passed**. Tests cover independent existing stationary solutions, all damping regimes, continuity, signed target work, conservation/dissipation balance, 30/60/120 Hz and irregular partitions, timeline bounds, reversed scroll ranges, beta wrapping and screen quarter-turns, latest-only input, elapsed-time filtering, permission denial/rejection, insecure context, cleanup, hidden/reduced-motion reset, and permission completion after disposal. `npx tsc --noEmit --pretty false` passed before root integration changes.

The local browser probe used Playwright 1.64.1 on arm64 macOS with Node 26.9.0. WebKit was installed at `artifacts/runtime/playwright/webkit-2370/pw_run.sh`. Both browsers ran headless on an intercepted HTTPS test origin. The worker received a transferred HTML canvas and attempted WebGL2 context creation; no scene draw or physical sensor data was involved.

| Probe                                       | Playwright WebKit 27.2 | Chromium 156.0.8078.4 |
| ------------------------------------------- | ---------------------- | --------------------- |
| Secure context, orientation API exposed     | yes                    | yes                   |
| OffscreenCanvas + transfer exposed          | yes                    | yes                   |
| WebGL2 created in transferred-canvas worker | yes                    | yes                   |
| Worker requestAnimationFrame exposed        | yes                    | yes                   |
| Combined arithmetic median, µs/iteration    | 0.070                  | 0.084                 |
| Slowest batch average, µs/iteration         | 0.140                  | 0.090                 |

One warmup batch preceded nine batches of 100,000 iterations. Each iteration advanced one of 100 springs by 1/60 second, occasionally retargeted it, looked up a bounded timeline, mapped synthetic beta/gamma and filtered one axis. A sink consumed the values. Raw batch milliseconds: WebKit `[10,11,14,7,6,6,6,7,7]`; Chromium `[8.30,8.50,8.50,8.40,8.40,8.40,9.00,8.40,8.70]`. Timer precision and JIT optimization affect this tiny benchmark. These are loop averages, not individual-frame p95/p99 latency.

**Not measured here:** actual GSAP/Lenis app frame times; Three shader cost; DOM mutation, layout, paint and compositing; worker IPC backpressure under load; iPhone/iPad sensor accuracy and permission UI; Safari low-power/thermal behavior; physical Safari refresh rates. Playwright WebKit is an engine test, not Safari-on-device certification. Main-thread event delivery can still be delayed by other work. The result supports low arithmetic overhead and a working local worker capability path, not a guarantee of hitch-free UI.

### Reproducing the arithmetic workload

Bundle these exports with esbuild into a browser global called `MotionProbe`, then run the following inside the Playwright page. Browser construction is outside the measured region. Retain all nine batch timings and the actual runtime version; warmup alone is insufficient for a library ranking.

```js
const A = MotionProbe;
const drivers = Array.from({ length: 100 }, () =>
  A.createDrivenMotion({
    spring: { mass: 1, stiffness: 180, damping: 12 },
    position: 0,
    target: 1,
  }),
);
const table = A.sampleMotionTimeline({
  motion: { coordinate: { unit: 'normalized', from: 0, to: 1 } },
  min: 0,
  max: 1,
});
let sink = 0,
  filtered = 0;
function run() {
  for (let i = 0; i < 100000; i++) {
    const driver = drivers[i % 100];
    if (i % 60 === 0) driver.retarget(Math.sin(i));
    const state = driver.advance(1 / 60);
    const mapped = A.mapDeviceTilt(
      { beta: i % 30, gamma: i % 20 },
      { beta: 10, gamma: 5 },
      0,
    );
    filtered = A.dampMotionValue(filtered, mapped.x, 12, 1 / 60);
    sink +=
      state.position +
      filtered +
      A.sampleTimelineProgress(table, (i % 100) / 100);
  }
}
run();
const batchesMilliseconds = Array.from({ length: 9 }, () => {
  const start = performance.now();
  run();
  return performance.now() - start;
});
console.log({ batchesMilliseconds, sink });
```
