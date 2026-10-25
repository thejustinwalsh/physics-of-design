import { dampMotionValue } from './motion-dynamics.js';

export type TiltAngles = { beta: number; gamma: number };
export type TiltStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'paused'
  | 'denied'
  | 'unsupported'
  | 'disposed';
export type TiltSample = {
  /** Screen-relative normalized decorative targets, each in [-1,1]. */
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
  lightX: number;
  lightY: number;
};
export type DeviceTiltOptions = {
  window?: Window;
  document?: Document;
  /** Relative input angle mapped to full output; a local small-angle UI policy. */
  inputRangeDegrees?: number;
  maxTiltDegrees?: number;
  responseRate?: number;
};

const radians = Math.PI / 180;
const shortestAngle = (angle: number) =>
  ((((angle + 180) % 360) + 360) % 360) - 180;

/** Local beta/gamma differences rotated into screen axes. This is decorative
 * small-angle control, not an absolute attitude/quaternion reconstruction. */
export function mapDeviceTilt(
  current: TiltAngles,
  baseline: TiltAngles,
  screenAngleDegrees: number,
  inputRangeDegrees = 30,
) {
  if (
    ![
      current.beta,
      current.gamma,
      baseline.beta,
      baseline.gamma,
      screenAngleDegrees,
      inputRangeDegrees,
    ].every(Number.isFinite) ||
    Math.abs(current.beta) > 180 ||
    Math.abs(baseline.beta) > 180 ||
    Math.abs(current.gamma) > 90 ||
    Math.abs(baseline.gamma) > 90 ||
    inputRangeDegrees <= 0 ||
    inputRangeDegrees > 180
  )
    throw new RangeError(
      'tilt requires finite angles, beta in [-180,180], gamma in [-90,90], and inputRangeDegrees in (0,180]',
    );
  const beta = shortestAngle(current.beta - baseline.beta);
  const gamma = shortestAngle(current.gamma - baseline.gamma);
  const angle = screenAngleDegrees * radians;
  const clamp = (v: number) => Math.min(1, Math.max(-1, v / inputRangeDegrees));
  return {
    x: clamp(gamma * Math.cos(angle) + beta * Math.sin(angle)),
    y: clamp(beta * Math.cos(angle) - gamma * Math.sin(angle)),
  };
}

/** Sensor listeners run on the main thread. The host samples this once from its
 * shared animation clock and may forward the bounded output to a render worker.
 * Construction never prompts; call requestFromUserGesture directly in a click/tap.
 * No RAF, React state, layout reads, or DOM mutation are owned by this controller. */
export function createDeviceTiltController(options: DeviceTiltOptions = {}) {
  const win =
    options.window ?? (typeof window === 'undefined' ? undefined : window);
  const doc = options.document ?? win?.document;
  const inputRange = options.inputRangeDegrees ?? 30;
  const maxTilt = options.maxTiltDegrees ?? 8;
  const rate = options.responseRate ?? 12;
  if (!Number.isFinite(inputRange) || inputRange <= 0 || inputRange > 180)
    throw new RangeError('inputRangeDegrees must be in (0,180]');
  if (!Number.isFinite(maxTilt) || maxTilt < 0 || maxTilt > 90)
    throw new RangeError('maxTiltDegrees must be in [0,90]');
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000)
    throw new RangeError('responseRate must be in [0,1000]');
  type OrientationAPI = {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  const api = (
    win as (Window & { DeviceOrientationEvent?: OrientationAPI }) | undefined
  )?.DeviceOrientationEvent;
  const media = win?.matchMedia('(prefers-reduced-motion: reduce)');
  let status: TiltStatus = 'idle',
    authorized = false,
    listening = false;
  let generation = 0,
    latest: TiltAngles | null = null,
    baseline: TiltAngles | null = null;
  let x = 0,
    y = 0;
  let targetX = 0,
    targetY = 0;
  let lastScreenAngle: number | null = null;
  const neutral = () => {
    latest = baseline = null;
    x = y = targetX = targetY = 0;
    lastScreenAngle = null;
  };
  const angle = () => {
    const modern = win?.screen?.orientation?.angle;
    const legacy = (win as (Window & { orientation?: number }) | undefined)
      ?.orientation;
    return Number.isFinite(modern)
      ? modern!
      : Number.isFinite(legacy)
        ? legacy!
        : 0;
  };
  const onOrientation = (event: DeviceOrientationEvent) => {
    if (
      status !== 'active' ||
      event.beta === null ||
      event.gamma === null ||
      !Number.isFinite(event.beta) ||
      !Number.isFinite(event.gamma) ||
      Math.abs(event.beta) > 180 ||
      Math.abs(event.gamma) > 90
    )
      return;
    // Latest-only: event storms create no animation queue or renderer writes.
    latest = { beta: event.beta, gamma: event.gamma };
  };
  const stopListening = () => {
    if (listening) win?.removeEventListener('deviceorientation', onOrientation);
    listening = false;
    neutral();
  };
  const synchronize = () => {
    if (status === 'disposed') return;
    if (media?.matches || doc?.hidden) {
      stopListening();
      if (authorized) status = 'paused';
    } else if (authorized) {
      status = 'active';
      if (!listening) {
        win?.addEventListener('deviceorientation', onOrientation, {
          passive: true,
        });
        listening = true;
      }
    }
  };
  const onScreenChange = () => neutral();
  doc?.addEventListener('visibilitychange', synchronize);
  media?.addEventListener('change', synchronize);
  win?.screen?.orientation?.addEventListener('change', onScreenChange);
  win?.addEventListener('orientationchange', onScreenChange);
  return {
    get status(): TiltStatus {
      return status;
    },
    /** The caller must invoke this synchronously inside a user action. The browser
     * enforces transient activation when its permission API is present. */
    async requestFromUserGesture(): Promise<TiltStatus> {
      if (status === 'disposed' || status === 'requesting') return status;
      if (!win || !doc || !api || win.isSecureContext === false)
        return (status = 'unsupported');
      if (authorized) {
        synchronize();
        return status;
      }
      if (media?.matches || doc.hidden) return (status = 'paused');
      status = 'requesting';
      const requestGeneration = ++generation;
      try {
        // No await before requestPermission: preserve the caller's activation.
        const result = api.requestPermission
          ? await api.requestPermission()
          : 'granted';
        if (requestGeneration !== generation) return status;
        if (result !== 'granted') return (status = 'denied');
        authorized = true;
        synchronize();
      } catch {
        if (requestGeneration === generation) status = 'denied';
      }
      return status;
    },
    /** Next valid event becomes the neutral pose. Also used after screen rotation. */
    calibrate() {
      if (status !== 'disposed') neutral();
    },
    sample(dtSeconds: number): TiltSample {
      // Validate time even when inactive, so caller arithmetic never fails silently.
      dampMotionValue(0, 0, rate, dtSeconds);
      if (status === 'active') {
        const screenAngle = angle();
        if (lastScreenAngle !== null && screenAngle !== lastScreenAngle)
          neutral();
        lastScreenAngle = screenAngle;
        if (latest) {
          baseline ??= latest;
          const mapped = mapDeviceTilt(
            latest,
            baseline,
            screenAngle,
            inputRange,
          );
          targetX = mapped.x;
          targetY = mapped.y;
          latest = null;
        }
        x = dampMotionValue(x, targetX, rate, dtSeconds);
        y = dampMotionValue(y, targetY, rate, dtSeconds);
      }
      return {
        x,
        y,
        rotateX: -y * maxTilt,
        rotateY: x * maxTilt,
        lightX: x,
        lightY: -y,
      };
    },
    dispose() {
      if (status === 'disposed') return;
      ++generation;
      authorized = false;
      stopListening();
      doc?.removeEventListener('visibilitychange', synchronize);
      media?.removeEventListener('change', synchronize);
      win?.screen?.orientation?.removeEventListener('change', onScreenChange);
      win?.removeEventListener('orientationchange', onScreenChange);
      status = 'disposed';
    },
  };
}
