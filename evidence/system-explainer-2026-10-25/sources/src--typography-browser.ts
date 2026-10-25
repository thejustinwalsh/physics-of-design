/** Browser-only, horizontal, uniform-style text inspection. No font-table baseline inference. */
export function collectTypographyElement(el: HTMLElement, lineLimit = 64) {
  const text = el.textContent ?? '';
  const style = getComputedStyle(el);
  const origin = el.getBoundingClientRect();
  const segments = [
    ...new Intl.Segmenter(el.lang || 'en', { granularity: 'grapheme' }).segment(
      text,
    ),
  ];
  const rect = (r: DOMRect) => ({
    x: r.x - origin.x,
    y: r.y - origin.y,
    width: r.width,
    height: r.height,
  });
  // Re-walk after a probe splits a text node; offsets remain UTF-16 text offsets.
  function point(offset: number) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null,
      remaining = offset;
    while ((node = walker.nextNode())) {
      const length = node.textContent!.length;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    throw new Error('Text offset outside inspected element');
  }
  function samples() {
    return segments.map((segment) => {
      const range = document.createRange();
      const a = point(segment.index),
        b = point(segment.index + segment.segment.length);
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      const fragments = [...range.getClientRects()].filter((r) => r.height > 0);
      const nonzero = fragments.filter((r) => r.width > 0);
      return {
        start: segment.index,
        end: segment.index + segment.segment.length,
        text: segment.segment,
        rects: (nonzero.length ? nonzero : fragments).map(rect),
      };
    });
  }
  const original = samples();
  const groups: {
    y: number;
    height: number;
    start: number;
    end: number;
    fragments: { x: number; y: number; width: number; height: number }[];
  }[] = [];
  for (const sample of original)
    for (const r of sample.rects) {
      if (!r.height) continue;
      // Range fragments describe font/selection boxes, not CSS line boxes or raster ink.
      let group = groups.find(
        (g) =>
          Math.abs(g.y - r.y) < 0.25 && Math.abs(g.height - r.height) < 0.25,
      );
      if (!group) {
        group = {
          y: r.y,
          height: r.height,
          start: sample.start,
          end: sample.end,
          fragments: [],
        };
        groups.push(group);
      }
      group.start = Math.min(group.start, sample.start);
      group.end = Math.max(group.end, sample.end);
      group.fragments.push(r);
    }
  groups.sort((a, b) => a.y - b.y);
  const tolerance = 1 / 64; // CSS layout quantization tolerance, not a paint tolerance.
  const maxProbeGraphemeMeasurements = 131072;
  let probeGraphemeMeasurements = 0,
    probeBudgetExhausted = false;
  function unchanged() {
    const current = samples(),
      box = el.getBoundingClientRect();
    return (
      Math.abs(box.height - origin.height) <= tolerance &&
      Math.abs(box.width - origin.width) <= tolerance &&
      current.every((sample, i) => {
        const before = original[i]!;
        return (
          sample.rects.length === before.rects.length &&
          sample.rects.every((r, j) => {
            const p = before.rects[j]!;
            return ['x', 'y', 'width', 'height'].every(
              (k) =>
                Math.abs(r[k as keyof typeof r] - p[k as keyof typeof p]) <=
                tolerance,
            );
          })
        );
      })
    );
  }
  const lines = groups.slice(0, lineLimit).map((g, index) => {
    const members = original.filter(
      (s) => s.start >= g.start && s.end <= g.end && /\S/u.test(s.text),
    );
    const first = members[0],
      last = members.at(-1);
    // Try boundaries first; an inline-block inside a joined word can alter shaping.
    const offsets = [
      ...new Set(
        [
          last?.end,
          first?.start,
          first?.end,
          g.end,
          ...members
            .filter((s) => /\s/u.test(text[s.end] ?? ''))
            .map((s) => s.end),
        ].filter((n): n is number => n !== undefined),
      ),
    ].slice(0, 8);
    let baseline: number | null = null,
      probeOffset: number | null = null;
    const attempts: {
      offset: number;
      geometryUnchanged: boolean;
      onThisLine: boolean;
      ownerFragments: { y: number; height: number }[];
    }[] = [];
    for (const offset of offsets) {
      if (
        probeGraphemeMeasurements + segments.length >
        maxProbeGraphemeMeasurements
      ) {
        probeBudgetExhausted = true;
        break;
      }
      probeGraphemeMeasurements += segments.length;
      const p = point(offset),
        range = document.createRange();
      range.setStart(p.node, p.offset);
      range.collapse(true);
      const marker = document.createElement('span');
      // An empty inline-block with hidden overflow has its baseline at its bottom margin edge.
      marker.style.cssText =
        'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;overflow:hidden;line-height:0;vertical-align:baseline';
      const owner = document.createElement('span');
      owner.style.cssText =
        'display:inline;padding:0;margin:0;border:0;vertical-align:baseline';
      owner.setAttribute('aria-hidden', 'true');
      owner.append(marker);
      range.insertNode(owner);
      const y = marker.getBoundingClientRect().bottom - origin.y;
      const same = unchanged();
      // A baseline can fall inside several overlapping selection boxes. The
      // inline wrapper exposes which font fragment actually owns this marker.
      const ownerFragments = [...owner.getClientRects()].map((r) => ({
        y: r.y - origin.y,
        height: r.height,
      }));
      const onThisLine =
        ownerFragments.length === 1 &&
        Math.abs(ownerFragments[0]!.y - g.y) <= tolerance &&
        Math.abs(ownerFragments[0]!.height - g.height) <= tolerance;
      attempts.push({
        offset,
        geometryUnchanged: same,
        onThisLine,
        ownerFragments,
      });
      owner.remove();
      el.normalize();
      if (same && onThisLine) {
        baseline = y;
        probeOffset = offset;
        break;
      }
    }
    const left = Math.min(...g.fragments.map((r) => r.x)),
      right = Math.max(...g.fragments.map((r) => r.x + r.width));
    return {
      index,
      start: g.start,
      end: g.end,
      text: text.slice(g.start, g.end),
      rangeBounds: { x: left, y: g.y, width: right - left, height: g.height },
      baseline,
      baselineSource:
        baseline === null
          ? probeBudgetExhausted
            ? 'unavailable: probe budget exhausted'
            : 'unavailable: no geometry-preserving probe'
          : 'DOM zero-size baseline-aligned inline-block',
      probeOffset,
      attempts,
      lineBox: null as null,
    };
  });
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d')!;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.direction = style.direction as CanvasDirection;
  ctx.fontKerning = style.fontKerning as CanvasFontKerning;
  if ('letterSpacing' in ctx)
    ctx.letterSpacing =
      style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  const canvasLines = lines.map((line) => {
    const m = ctx.measureText(line.text);
    return {
      index: line.index,
      width: m.width,
      actualBoundingBoxLeft: m.actualBoundingBoxLeft,
      actualBoundingBoxRight: m.actualBoundingBoxRight,
      actualBoundingBoxAscent: m.actualBoundingBoxAscent,
      actualBoundingBoxDescent: m.actualBoundingBoxDescent,
      fontBoundingBoxAscent: Number.isFinite(m.fontBoundingBoxAscent)
        ? m.fontBoundingBoxAscent
        : null,
      fontBoundingBoxDescent: Number.isFinite(m.fontBoundingBoxDescent)
        ? m.fontBoundingBoxDescent
        : null,
      alphabeticBaseline: Number.isFinite(m.alphabeticBaseline)
        ? m.alphabeticBaseline
        : null,
      hangingBaseline: Number.isFinite(m.hangingBaseline)
        ? m.hangingBaseline
        : null,
      ideographicBaseline: Number.isFinite(m.ideographicBaseline)
        ? m.ideographicBaseline
        : null,
    };
  });
  const allRects = original.flatMap((sample) => sample.rects);
  const rangeUnion = allRects.length
    ? {
        x: Math.min(...allRects.map((r) => r.x)),
        y: Math.min(...allRects.map((r) => r.y)),
        right: Math.max(...allRects.map((r) => r.x + r.width)),
        bottom: Math.max(...allRects.map((r) => r.y + r.height)),
      }
    : null;
  return {
    unit: 'css-px',
    coordinateSpace: 'local to text element border-box; x right, y down',
    box: { x: 0, y: 0, width: origin.width, height: origin.height },
    rangeUnion,
    layoutOverflow: {
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      scrollOverflowX: Math.max(0, el.scrollWidth - el.clientWidth),
      scrollOverflowY: Math.max(0, el.scrollHeight - el.clientHeight),
      rangeBeyondRight: rangeUnion
        ? Math.max(0, rangeUnion.right - origin.width)
        : 0,
      rangeBeyondBottom: rangeUnion
        ? Math.max(0, rangeUnion.bottom - origin.height)
        : 0,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      source:
        'integer CSSOM scroll/client dimensions plus subpixel Range union; not raster paint clipping',
    },
    computed: {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontVariationSettings: style.fontVariationSettings,
      fontOpticalSizing: style.fontOpticalSizing,
      fontFeatureSettings: style.fontFeatureSettings,
      fontKerning: style.fontKerning,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      direction: style.direction,
    },
    lines,
    totalLines: groups.length,
    omittedLines: Math.max(0, groups.length - lines.length),
    lineGrouping:
      'Range fragments grouped by top and height. Fallback with different metrics can split one physical line into groups; this count alone cannot prove physical line count.',
    baselineDeltas: lines
      .slice(1)
      .map((line, i) =>
        line.baseline !== null && lines[i]!.baseline !== null
          ? line.baseline - lines[i]!.baseline!
          : null,
      ),
    lineBreakSignature: groups.map((g) => [g.start, g.end]),
    probeGeometryTolerance: tolerance,
    probeBudget: {
      maxGraphemeMeasurements: maxProbeGraphemeMeasurements,
      usedGraphemeMeasurements: probeGraphemeMeasurements,
      exhausted: probeBudgetExhausted,
      maxOffsetsPerLine: 8,
    },
    canvas: {
      source: 'CanvasRenderingContext2D.measureText',
      font: ctx.font,
      baseline: ctx.textBaseline,
      variationAndFeatureParityWithDOM:
        'unverified: Canvas font shorthand does not transfer CSS font-variation-settings, optical sizing or feature settings',
      lines: canvasLines,
    },
    rasterPaintBounds: null,
    limits: [
      'Range rectangles are text selection fragments, not ink or CSS line-box rectangles.',
      'CSS line boxes have no direct DOM geometry API here; lineBox is null. Computed line-height and observed baseline deltas are separate facts.',
      'Empty lines without a measurable text Range or stable marker may have no baseline; no metric-derived replacement is invented.',
      'Mixed bidi may produce several visual fragments per logical range; bounds are their union, offsets are logical UTF-16.',
      'Canvas metrics describe a separate drawing state and are not substituted for DOM geometry.',
    ],
  };
}
