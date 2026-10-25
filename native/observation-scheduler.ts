/** Coalesce bursts without postponing capture forever under a live timer. */
export function createObservationScheduler(
  run: () => Promise<void>,
  delayMs = 80,
  clock: {
    set: (fn: () => void, delay: number) => unknown;
    clear: (id: unknown) => void;
  } = {
    set: (fn, delay) => setTimeout(fn, delay),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
  onError: (error: unknown) => void = () => {},
) {
  let timer: unknown = null,
    inFlight = false,
    pending = false,
    stopped = false;
  function schedule() {
    if (stopped) return;
    pending = true;
    if (timer !== null || inFlight) return;
    timer = clock.set(() => {
      timer = null;
      if (stopped) return;
      pending = false;
      inFlight = true;
      void Promise.resolve()
        .then(() => {
          if (!stopped) return run();
        })
        .catch((error) => {
          try {
            onError(error);
          } catch {
            /* Diagnostics cannot break capture scheduling. */
          }
        })
        .finally(() => {
          inFlight = false;
          if (pending && !stopped) schedule();
        });
    }, delayMs);
  }
  return {
    schedule,
    start() {
      stopped = false;
      schedule();
    },
    stop() {
      stopped = true;
      pending = false;
      if (timer !== null) clock.clear(timer);
      timer = null;
    },
  };
}
