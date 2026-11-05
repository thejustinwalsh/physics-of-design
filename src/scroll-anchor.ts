export interface ScrollAnchorInput {
  /** Current offset after layout/browser anchoring, in the same units as extent. */
  offset: number;
  /** Before/after positions of the same retained anchor in one viewport space. */
  before: number;
  after: number;
  extent: number;
  viewport: number;
}

/** Preserve one measured anchor after reflow, with explicit range clamping.
 * The caller owns identity, measurement freshness and application. This neither
 * measures a renderer nor predicts wrapping, focus, occlusion or preference. */
export function projectScrollAnchor(input: ScrollAnchorInput) {
  for (const [key, value] of Object.entries(input))
    if (!Number.isFinite(value))
      throw new Error(`Scroll anchor ${key} must be finite`);
  if (input.offset < 0 || input.extent < 0 || input.viewport <= 0)
    throw new Error(
      'Scroll anchor offset/extent must be nonnegative and viewport positive',
    );
  const requestedOffset = input.offset + (input.after - input.before);
  if (!Number.isFinite(requestedOffset))
    throw new Error('Scroll anchor projection exceeds finite range');
  const maximumOffset = Math.max(0, input.extent - input.viewport);
  const offset = Math.max(0, Math.min(maximumOffset, requestedOffset));
  return {
    offset,
    requestedOffset,
    maximumOffset,
    clamped: offset !== requestedOffset,
  };
}
