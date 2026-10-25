/** Android Layout.getLineWidth includes trailing whitespace; it is not an ink bound. */
export interface NativeTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentAdvanceEvidence?: NativeContentAdvance;
}
export interface NativeContentAdvance {
  engine: 'react-native/Text.onTextLayout-trimmed-line';
  layoutIdentity: string;
  lineIndex: number;
  rawText: string;
  rawWidth: number;
  trimmedText: string;
  contentAdvance: number;
  probeWidth: number;
}
export interface NativeLineProbe {
  key: string;
  layoutIdentity: string;
  lineIndex: number;
  rawText: string;
  rawWidth: number;
  text: string;
  width: number;
}
export function nativeTextLayoutIdentity(
  text: string,
  styleIdentity: string,
  lines: readonly NativeTextLine[],
  width: number,
): string {
  return JSON.stringify({
    text,
    styleIdentity,
    width,
    lines: lines.map(({ text, x, y, width, height }) => ({
      text,
      x,
      y,
      width,
      height,
    })),
  });
}
export function nativeLineProbes(input: {
  platform: string;
  plain: boolean;
  knownStyle: boolean;
  text: string;
  styleIdentity: string;
  measuredStyleIdentity: string;
  width: number;
  lines: readonly NativeTextLine[];
}): NativeLineProbe[] {
  if (
    input.platform !== 'android' ||
    !input.plain ||
    !input.knownStyle ||
    input.styleIdentity !== input.measuredStyleIdentity ||
    !(input.width > 0) ||
    input.lines.map((line) => line.text).join('') !== input.text
  )
    return [];
  const layoutIdentity = nativeTextLayoutIdentity(
    input.text,
    input.styleIdentity,
    input.lines,
    input.width,
  );
  return input.lines.flatMap((line, lineIndex) => {
    // Limited to plain LTR soft wraps. Newline widths already use getLineMax in RN.
    if (
      lineIndex === input.lines.length - 1 ||
      line.x !== 0 ||
      !/[ \t]+$/.test(line.text) ||
      /[\r\n\u0590-\u08ff\u202a-\u202e\u2066-\u2069]/.test(line.text) ||
      !Number.isFinite(line.width) ||
      line.width <= input.width
    )
      return [];
    const text = line.text.replace(/[ \t]+$/, '');
    if (!text) return [];
    return [
      {
        key: JSON.stringify([layoutIdentity, lineIndex]),
        layoutIdentity,
        lineIndex,
        rawText: line.text,
        rawWidth: line.width,
        text,
        width: Math.max(input.width, line.width) * 2,
      },
    ];
  });
}
export function acceptNativeLineProbe(
  probe: NativeLineProbe,
  lines: readonly NativeTextLine[],
): NativeContentAdvance | null {
  const line = lines[0];
  if (
    lines.length !== 1 ||
    !line ||
    line.text !== probe.text ||
    line.x !== 0 ||
    !Number.isFinite(line.width) ||
    line.width < 0 ||
    line.width > probe.width
  )
    return null;
  return {
    engine: 'react-native/Text.onTextLayout-trimmed-line',
    layoutIdentity: probe.layoutIdentity,
    lineIndex: probe.lineIndex,
    rawText: probe.rawText,
    rawWidth: probe.rawWidth,
    trimmedText: probe.text,
    contentAdvance: line.width,
    probeWidth: probe.width,
  };
}
export function diagnoseNativeTextWidths(input: {
  platform: string;
  box: { width: number; height: number };
  lines: readonly NativeTextLine[];
  textLayoutIdentity?: string;
  tolerance?: number;
}) {
  const tolerance = input.tolerance ?? 1;
  return input.lines.map((line, lineIndex) => {
    if (
      ![
        line.x,
        line.y,
        line.width,
        line.height,
        input.box.width,
        input.box.height,
      ].every(Number.isFinite) ||
      line.width < 0 ||
      line.height < 0
    )
      return {
        lineIndex,
        status: 'unknown' as const,
        reason: 'nonfinite-or-invalid-line-geometry',
      };
    const verticalOverflow =
      line.y + line.height > input.box.height + tolerance;
    const rawOverflow =
      line.x + line.width > input.box.width + tolerance || line.x < -tolerance;
    if (verticalOverflow)
      return {
        lineIndex,
        status: 'fail' as const,
        reason: 'line-height-overflow',
      };
    if (!rawOverflow)
      return {
        lineIndex,
        status: 'pass' as const,
        reason: 'raw-line-extent-fits',
      };
    if (input.platform !== 'android' || !/[ \t]+$/.test(line.text))
      return {
        lineIndex,
        status: 'fail' as const,
        reason: 'raw-content-extent-overflow',
      };
    const e = line.contentAdvanceEvidence;
    if (
      !e ||
      e.engine !== 'react-native/Text.onTextLayout-trimmed-line' ||
      !input.textLayoutIdentity ||
      e.layoutIdentity !== input.textLayoutIdentity ||
      e.lineIndex !== lineIndex ||
      e.rawText !== line.text ||
      e.rawWidth !== line.width ||
      e.trimmedText !== line.text.replace(/[ \t]+$/, '') ||
      line.x !== 0 ||
      !Number.isFinite(e.contentAdvance) ||
      e.contentAdvance < 0 ||
      !Number.isFinite(e.probeWidth) ||
      e.probeWidth < e.contentAdvance
    )
      return {
        lineIndex,
        status: 'unknown' as const,
        reason: 'trailing-whitespace-needs-native-content-advance',
      };
    return {
      lineIndex,
      status:
        e.contentAdvance > input.box.width + tolerance
          ? ('fail' as const)
          : ('pass' as const),
      reason: 'separately-measured-native-content-advance',
      contentAdvance: e.contentAdvance,
      rawAdvance: line.width,
    };
  });
}
