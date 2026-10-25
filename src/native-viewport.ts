export interface NativeViewport {
  window: { width: number; height: number; fontScale: number; scale: number };
  insets: { top: number; right: number; bottom: number; left: number };
}
export interface NativeViewportState {
  accepted: NativeViewport | null;
  status: 'current' | 'held' | 'unavailable';
  /** Rejected observations, not distinct physical device events. */
  rejectedCount: number;
  lastRejection: { reasons: string[]; input: NativeViewport } | null;
}
const copy = (input: NativeViewport): NativeViewport => ({
  window: { ...input.window },
  insets: { ...input.insets },
});
/** Validate complete geometry before evaluating width-dependent design equations. */
export function advanceNativeViewport(
  previous: NativeViewportState | null,
  input: NativeViewport,
): NativeViewportState {
  const reasons: string[] = [];
  for (const key of ['width', 'height', 'fontScale', 'scale'] as const) {
    const value = input.window[key];
    if (!Number.isFinite(value) || value <= 0)
      reasons.push(`window.${key} must be finite and positive`);
  }
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    const value = input.insets[key];
    if (!Number.isFinite(value) || value < 0)
      reasons.push(`insets.${key} must be finite and nonnegative`);
  }
  const width = input.window.width - input.insets.left - input.insets.right;
  const height = input.window.height - input.insets.top - input.insets.bottom;
  if (!Number.isFinite(width) || width <= 0)
    reasons.push('usable width must be finite and positive');
  if (!Number.isFinite(height) || height <= 0)
    reasons.push('usable height must be finite and positive');
  if (reasons.length)
    return {
      accepted: previous?.accepted ?? null,
      status: previous?.accepted ? 'held' : 'unavailable',
      rejectedCount: (previous?.rejectedCount ?? 0) + 1,
      lastRejection: { reasons, input: copy(input) },
    };
  return {
    accepted: copy(input),
    status: 'current',
    rejectedCount: previous?.rejectedCount ?? 0,
    lastRejection: previous?.lastRejection ?? null,
  };
}
