import { plotAnatomy } from './plot-anatomy.mjs';
/** Bucket centers in the actual plot content box. Gap/stroke are authored
 * component anatomy, not perceptual constants. Invalid fit remains unknown. */
export function plotCursorX(
  fraction,
  width,
  count,
  gap = plotAnatomy.gap,
  stroke = plotAnatomy.stroke,
) {
  if (
    ![fraction, width, count, gap, stroke].every(Number.isFinite) ||
    fraction < 0 ||
    fraction > 1 ||
    width <= 0 ||
    !Number.isInteger(count) ||
    count < 2 ||
    gap < 0 ||
    stroke <= 0
  )
    return null;
  const bar = (width - gap * (count - 1)) / count;
  if (bar <= 0 || stroke > width) return null;
  const first = bar / 2,
    last = width - bar / 2;
  return Math.max(
    0,
    Math.min(width - stroke, first + fraction * (last - first) - stroke / 2),
  );
}
