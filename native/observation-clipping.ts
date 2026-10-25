export type Frame = { x: number; y: number; width: number; height: number };
export type ClipObservation = {
  id: string;
  box: Frame;
  clipId?: string | null;
};
/** Use measured scroll ancestors, never safe-area filtering, to establish visible hit geometry. */
export function clipObservationFrames<T extends ClipObservation>(
  observations: readonly T[],
) {
  const byId = new Map(observations.map((o) => [o.id, o]));
  function visible(item: ClipObservation, seen: Set<string>): Frame {
    if (!item.clipId) return item.box;
    if (seen.has(item.id)) throw new Error('Cyclic native clip hierarchy');
    const parent = byId.get(item.clipId);
    if (!parent) throw new Error(`Missing measured clip ${item.clipId}`);
    const ancestor = visible(parent, new Set([...seen, item.id]));
    const x = Math.max(item.box.x, ancestor.x),
      y = Math.max(item.box.y, ancestor.y);
    return {
      x,
      y,
      width: Math.max(
        0,
        Math.min(item.box.x + item.box.width, ancestor.x + ancestor.width) - x,
      ),
      height: Math.max(
        0,
        Math.min(item.box.y + item.box.height, ancestor.y + ancestor.height) -
          y,
      ),
    };
  }
  return observations.map((item) => ({
    ...item,
    visibleBox: visible(item, new Set()),
  }));
}
