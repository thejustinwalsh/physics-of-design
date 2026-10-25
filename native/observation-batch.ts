/** A bounded native capture must retain the state/revision that its frames describe. */
export async function captureObservationBatch<T, S>({
  records,
  snapshot,
  revision,
  getRevision,
  measure,
  timeoutMs = 1000,
}: {
  records: readonly T[];
  snapshot: S;
  revision: number;
  getRevision: () => number;
  measure: (
    record: T,
    done: (frame: Record<string, unknown> | null) => void,
  ) => void;
  timeoutMs?: number;
}) {
  const frozenSnapshot: S = JSON.parse(JSON.stringify(snapshot));
  const frames = await Promise.all(
    records.map(
      (record) =>
        new Promise<Record<string, unknown> | null>((resolve) => {
          let finished = false;
          const finish = (frame: Record<string, unknown> | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve(frame);
          };
          const timer = setTimeout(() => finish(null), timeoutMs);
          try {
            measure(record, finish);
          } catch {
            finish(null);
          }
        }),
    ),
  );
  if (revision !== getRevision()) return null;
  return {
    snapshot: frozenSnapshot,
    observations: frames.filter((frame) => frame !== null),
    incomplete: frames.some((frame) => frame === null),
  };
}
