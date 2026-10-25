export interface NativeSafeAreaProjectionInput {
  screen: { width: number; height: number };
  window: { width: number; height: number };
  /** Measured window origin in physical-screen dp, not pixels. */
  screenOffset: { x: number; y: number };
  /** Insets from the physical-screen edges in the same dp coordinate space. */
  insets: { top: number; right: number; bottom: number; left: number };
}

/** Intersect the physical safe rectangle with the measured window.
 * System bars already excluded from that window contribute no second inset.
 * This is geometric projection, not a platform-name heuristic.
 */
export function projectNativeSafeArea(input: NativeSafeAreaProjectionInput) {
  for (const extent of [input.screen, input.window])
    for (const value of [extent.width, extent.height])
      if (!Number.isFinite(value) || value <= 0)
        throw new RangeError(
          'Screen and window extents must be finite and positive',
        );
  for (const value of Object.values(input.screenOffset))
    if (!Number.isFinite(value))
      throw new RangeError('Window origin must be finite');
  for (const value of Object.values(input.insets))
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError('Safe-area insets must be finite and nonnegative');
  if (
    input.insets.left + input.insets.right >= input.screen.width ||
    input.insets.top + input.insets.bottom >= input.screen.height
  )
    throw new RangeError('Physical safe rectangle must have positive area');
  const clip = (value: number, extent: number) =>
    Math.min(extent, Math.max(0, value));
  const left = clip(
    input.insets.left - input.screenOffset.x,
    input.window.width,
  );
  const rightEdge = clip(
    input.screen.width - input.insets.right - input.screenOffset.x,
    input.window.width,
  );
  const top = clip(
    input.insets.top - input.screenOffset.y,
    input.window.height,
  );
  const bottomEdge = clip(
    input.screen.height - input.insets.bottom - input.screenOffset.y,
    input.window.height,
  );
  return {
    top,
    left,
    right: input.window.width - rightEdge,
    bottom: input.window.height - bottomEdge,
  };
}
