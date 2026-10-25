import {
  advanceNativeViewport,
  type NativeViewport,
} from './native-viewport.js';
import { projectNativeSafeArea } from './native-safe-area.js';

export interface NativeRootFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface NativeRootInput {
  nominalWindow: NativeViewport['window'];
  insets: NativeViewport['insets'];
  rootFrame: NativeRootFrame;
  baseCoordinateSpace: {
    screenOffset: { x: number; y: number };
    screen: { width: number; height: number };
  };
}
export interface MeasuredNativeGeometry extends NativeViewport {
  nominalWindow: NativeViewport['window'];
  rootFrame: NativeRootFrame;
  coordinateSpace: {
    units: 'dp';
    origin: 'measured root';
    screenOffset: { x: number; y: number };
    screen: { width: number; height: number };
  };
  windowSafeArea: NativeViewport['insets'];
}
export interface MeasuredNativeState {
  accepted: MeasuredNativeGeometry | null;
  status: 'current' | 'held' | 'unavailable';
  rejectedCount: number;
  lastRejection: { reasons: string[]; input: NativeRootInput } | null;
}
/** Root-local geometry comes from Yoga, never by subtracting guessed system bars. */
export function advanceMeasuredNativeGeometry(
  previous: MeasuredNativeState | null,
  input: NativeRootInput,
): MeasuredNativeState {
  const reasons: string[] = [];
  const window = {
    ...input.nominalWindow,
    width: input.rootFrame.width,
    height: input.rootFrame.height,
  };
  const validated = advanceNativeViewport(null, {
    window,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  if (!validated.accepted)
    reasons.push(...(validated.lastRejection?.reasons ?? []));
  for (const value of [
    input.rootFrame.x,
    input.rootFrame.y,
    input.baseCoordinateSpace.screenOffset.x,
    input.baseCoordinateSpace.screenOffset.y,
  ])
    if (!Number.isFinite(value))
      reasons.push('Root and platform origins must be finite');
  const coordinateSpace: MeasuredNativeGeometry['coordinateSpace'] = {
    units: 'dp',
    origin: 'measured root',
    screenOffset: {
      x: input.rootFrame.x + input.baseCoordinateSpace.screenOffset.x,
      y: input.rootFrame.y + input.baseCoordinateSpace.screenOffset.y,
    },
    screen: { ...input.baseCoordinateSpace.screen },
  };
  let windowSafeArea: NativeViewport['insets'] | undefined;
  if (!reasons.length) {
    try {
      windowSafeArea = projectNativeSafeArea({
        ...coordinateSpace,
        window,
        insets: input.insets,
      });
      const usable = advanceNativeViewport(null, {
        window,
        insets: windowSafeArea,
      });
      if (!usable.accepted)
        reasons.push(...(usable.lastRejection?.reasons ?? []));
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (reasons.length || !windowSafeArea)
    return {
      accepted: previous?.accepted ?? null,
      status: previous?.accepted ? 'held' : 'unavailable',
      rejectedCount: (previous?.rejectedCount ?? 0) + 1,
      lastRejection: {
        reasons,
        input: {
          nominalWindow: { ...input.nominalWindow },
          insets: { ...input.insets },
          rootFrame: { ...input.rootFrame },
          baseCoordinateSpace: {
            screen: { ...input.baseCoordinateSpace.screen },
            screenOffset: { ...input.baseCoordinateSpace.screenOffset },
          },
        },
      },
    };
  return {
    accepted: {
      window,
      insets: { ...input.insets },
      nominalWindow: { ...input.nominalWindow },
      rootFrame: { ...input.rootFrame },
      coordinateSpace,
      windowSafeArea,
    },
    status: 'current',
    rejectedCount: previous?.rejectedCount ?? 0,
    lastRejection: previous?.lastRejection ?? null,
  };
}

/** Rebase every measured frame identically, before applying clip intersections. */
export function nativeFrameRelativeToRoot(
  frame: NativeRootFrame,
  root: Pick<NativeRootFrame, 'x' | 'y'>,
): NativeRootFrame {
  return {
    x: frame.x - root.x,
    y: frame.y - root.y,
    width: frame.width,
    height: frame.height,
  };
}
