# Native observation scheduler review

Independent adversarial review, 2026-10-25. Scope: scheduler and provider lifecycle, rejection handling, serial capture, transport bounds and retained revision checks. Product fixes were made by the implementation owner; reviewer added eight focused scheduler tests. No device was operated by the reviewer.

| Verified finding | Final disposition |
| --- | --- |
| Irreversible `stop()` in provider cleanup left the memoized scheduler stopped after React StrictMode setup/cleanup/setup. | Closed: provider lifecycle calls `start()`, which reenables and schedules capture. Regression reuses the same scheduler through that sequence. |
| `void run().finally(...)` leaked rejected promises; a synchronous throw left `inFlight` permanently true. | Closed: deferred invocation catches synchronous and asynchronous errors, always releases the serial slot, and guards the diagnostic callback against throwing. Both failures and diagnostic failure have recovery regressions. |
| The serial run awaited an unbounded collector POST; a connection that never replied could starve all later captures. | Closed in source: provider passes an AbortController signal, aborts after 1,500ms, and clears the timeout in `finally`. No real stalled-network/device test was run. |

Eight scheduler tests pass: burst coalescing without deadline reset; serial work and one pending batch; stop cancellation; lifecycle restart; restart while old work remains active; synchronous/asynchronous failure recovery; diagnostic failure isolation; and stop between timer dispatch and deferred capture. The combined scheduler/composition/batch/clipping lane passes 18/18. Native TypeScript checking passes.

The provider keeps revision invalidation on registration, removal, signals, snapshot changes and unmount. Batches freeze their snapshot and reject changed revisions; incomplete batches remain excluded. Restart preserves an old in-flight run until it settles, avoiding overlap; pending fresh work then gets one deadline. This fixes debounce starvation from 250ms timer updates without weakening freshness. It does not guarantee a valid receipt if the native layout never remains stable long enough to measure, or if callbacks time out.

Unmount invalidates measurement before publication and prevents new scheduling. A POST already started before unmount may finish within its transport timeout; its payload is the frozen historical batch, not a claim about current UI. Collector consumers must continue checking the expected screen/policy and receipt freshness.

The eight pure scheduler tests emulate effect sequencing rather than mounting React StrictMode. Provider integration was inspected and typechecked; live running-timer receipt verification remains the primary agent's device task. A passing scheduler test is not a rendered-app proof.

Reviewed SHA-256:

```text
ba90f117a2fddbf7d177355cfd0bbf8b389152a09f4791b4adadb07a1968df88  native/observation-scheduler.ts
5600cdd48439b099e62f54adbd299dc16d9058127ea1e5c8cfeb4cb3967051cb  native/observations.tsx
323ec0f336205b33611a50579c34e79deacf72794031047b6e0d5a976d42bfe6  test/observation-scheduler.test.ts
```
