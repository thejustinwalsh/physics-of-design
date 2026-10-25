import { sampleDomSurfaceLight, type DomSurfaceRecipe } from './dom-surface.js';
import { createDeviceTiltController } from './browser-tilt.js';
import {
  createDomSurfaceGpu,
  type DomSurfaceGpuOptions,
  type DomSurfaceOutput,
} from './dom-surface-gpu.js';

export interface DomLightOptions {
  pointer?: boolean;
  scroll?: boolean;
  tilt?: boolean;
  clock?: 'auto' | 'external';
  maxTiltDegrees?: number;
  responseRate?: number;
  renderer?: 'css' | 'webgl';
  gpu?: DomSurfaceGpuOptions;
}
/** Retained DOM adapter: input events cache targets; sample owns arithmetic/style writes only. */
export function createDomLightController(
  element: HTMLElement,
  recipe: DomSurfaceRecipe,
  options: DomLightOptions = {},
) {
  const doc = element.ownerDocument,
    win = doc.defaultView!;
  const rate = options.responseRate ?? 10,
    tiltDegrees = options.maxTiltDegrees ?? 6;
  if (
    !Number.isFinite(rate) ||
    rate <= 0 ||
    rate > 100 ||
    !Number.isFinite(tiltDegrees) ||
    tiltDegrees < 0 ||
    tiltDegrees > 12
  )
    throw new Error('responseRate must be (0,100], maxTiltDegrees [0,12]');
  if (
    options.clock !== undefined &&
    options.clock !== 'auto' &&
    options.clock !== 'external'
  )
    throw new Error('clock must be auto or external');
  if (
    options.renderer !== undefined &&
    options.renderer !== 'css' &&
    options.renderer !== 'webgl'
  )
    throw new Error('renderer must be css or webgl');
  const gpu =
    options.renderer === 'webgl'
      ? createDomSurfaceGpu(element, recipe, options.gpu)
      : null;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const sensor = options.tilt
    ? createDeviceTiltController({
        window: win,
        document: doc,
        maxTiltDegrees: tiltDegrees,
      })
    : null;
  let disposed = false,
    offscreen = false,
    frame = 0,
    lastTime: number | null = null;
  let currentX = 0,
    currentY = 0,
    targetX = 0,
    targetY = 0,
    pointerX = 0,
    pointerY = 0,
    scrollY = 0;
  let bounds = { left: 0, top: 0, width: 1, height: 1 };
  let externalTarget: { x: number; y: number } | null = null;
  const originals = new Map<string, { value: string; priority: string }>();
  const hadClass = element.classList.contains('dt-dom-surface');
  const oldMaterial = element.getAttribute('data-dom-surface');
  const stats = {
    frames: 0,
    styleWrites: 0,
    geometryReads: 0,
    active: true,
    reduced: reduced.matches,
    offscreen: false,
  };
  function write(vars: Record<string, string>) {
    for (const [key, value] of Object.entries(vars)) {
      if (!originals.has(key))
        originals.set(key, {
          value: element.style.getPropertyValue(key),
          priority: element.style.getPropertyPriority(key),
        });
      if (element.style.getPropertyValue(key) !== value) {
        element.style.setProperty(key, value);
        stats.styleWrites++;
      }
    }
  }
  element.classList.add('dt-dom-surface');
  element.setAttribute('data-dom-surface', recipe.input.material);
  write(recipe.cssVariables);
  const enabled = () =>
    !disposed && !doc.hidden && !reduced.matches && !offscreen;
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  function render(x: number, y: number) {
    const value = sampleDomSurfaceLight(recipe, { x, y, tiltDegrees });
    write(value.cssVariables);
    gpu?.draw(value);
    return value;
  }
  let latest = render(0, 0);
  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
  }
  function request() {
    if (options.clock !== 'external' && enabled() && !frame)
      frame = win.requestAnimationFrame(tick);
  }
  function sample(dtSeconds: number) {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0 || dtSeconds > 1)
      throw new Error('dtSeconds must be in [0,1]; reset hidden-time gaps');
    if (disposed) return latest;
    stats.active = enabled();
    stats.reduced = reduced.matches;
    stats.offscreen = offscreen;
    if (!enabled()) return latest;
    const tilt = sensor?.sample(dtSeconds);
    targetX = clamp(pointerX * 0.75 + (tilt?.x ?? 0) * 0.75);
    targetY = clamp(pointerY * 0.65 + scrollY * 0.25 + (tilt?.y ?? 0) * 0.75);
    if (externalTarget) {
      targetX = externalTarget.x;
      targetY = externalTarget.y;
    }
    const fraction = -Math.expm1(-rate * dtSeconds);
    currentX += (targetX - currentX) * fraction;
    currentY += (targetY - currentY) * fraction;
    latest = render(currentX, currentY);
    stats.frames++;
    return latest;
  }
  function tick(time: number) {
    frame = 0;
    if (!enabled()) return;
    const dt =
      lastTime === null
        ? 0
        : Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    sample(dt);
    if (
      dt === 0 ||
      // A slow response can move very little while still far from its target.
      Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.00001 ||
      sensor?.status === 'active'
    )
      request();
    else lastTime = null;
  }
  function onScroll() {
    scrollY =
      options.scroll === false
        ? 0
        : clamp(
            1 -
              2 *
                ((bounds.top - win.scrollY + bounds.height / 2) /
                  Math.max(1, win.innerHeight)),
          );
    request();
  }
  function refreshBounds() {
    if (disposed) return;
    const r = element.getBoundingClientRect();
    stats.geometryReads++;
    bounds = {
      left: r.left + win.scrollX,
      top: r.top + win.scrollY,
      width: Math.max(1, r.width),
      height: Math.max(1, r.height),
    };
    gpu?.resize(bounds.width, bounds.height);
    onScroll();
  }
  function onPointer(event: PointerEvent) {
    pointerX = clamp(
      ((event.clientX + win.scrollX - bounds.left) / bounds.width) * 2 - 1,
    );
    pointerY = clamp(
      ((event.clientY + win.scrollY - bounds.top) / bounds.height) * 2 - 1,
    );
    request();
  }
  function onLeave() {
    pointerX = pointerY = 0;
    request();
  }
  function synchronize() {
    if (disposed) return;
    gpu?.setSuspended(doc.hidden || offscreen);
    if (!enabled()) {
      stop();
      currentX = currentY = targetX = targetY = pointerX = pointerY = 0;
      latest = render(0, 0);
    } else request();
    stats.active = enabled();
    stats.reduced = reduced.matches;
    stats.offscreen = offscreen;
  }
  if (options.pointer !== false) {
    element.addEventListener('pointermove', onPointer, { passive: true });
    element.addEventListener('pointerleave', onLeave);
  }
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', refreshBounds, { passive: true });
  doc.addEventListener('visibilitychange', synchronize);
  reduced.addEventListener('change', synchronize);
  const resize =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(refreshBounds);
  resize?.observe(element);
  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          offscreen = !entries[0]!.isIntersecting;
          synchronize();
        });
  intersection?.observe(element);
  refreshBounds();
  synchronize();
  return {
    sample,
    setLightTarget(target: { x: number; y: number } | null) {
      if (
        target &&
        (!Number.isFinite(target.x) ||
          !Number.isFinite(target.y) ||
          Math.abs(target.x) > 1 ||
          Math.abs(target.y) > 1)
      )
        throw new Error('Light target x/y must be in [-1,1]');
      if (disposed) return;
      externalTarget = target;
      request();
    },
    refreshBounds,
    updateRecipe(next: DomSurfaceRecipe) {
      if (disposed) return;
      recipe = next;
      gpu?.update(next);
      element.setAttribute('data-dom-surface', recipe.input.material);
      write(recipe.cssVariables);
      latest = render(currentX, currentY);
    },
    get status() {
      return disposed ? 'disposed' : !enabled() ? 'paused' : 'active';
    },
    stats,
    get renderer() {
      return gpu?.stats ?? { status: 'css', reason: 'CSS renderer requested' };
    },
    setOutput(output: DomSurfaceOutput) {
      gpu?.setOutput(output);
    },
    async requestTiltFromUserGesture() {
      if (disposed || !sensor) return 'unsupported' as const;
      const status = await sensor.requestFromUserGesture();
      request();
      return status;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      sensor?.dispose();
      gpu?.dispose();
      resize?.disconnect();
      intersection?.disconnect();
      element.removeEventListener('pointermove', onPointer);
      element.removeEventListener('pointerleave', onLeave);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', refreshBounds);
      doc.removeEventListener('visibilitychange', synchronize);
      reduced.removeEventListener('change', synchronize);
      for (const [key, original] of originals)
        original.value
          ? element.style.setProperty(key, original.value, original.priority)
          : element.style.removeProperty(key);
      if (!hadClass) element.classList.remove('dt-dom-surface');
      if (oldMaterial === null) element.removeAttribute('data-dom-surface');
      else element.setAttribute('data-dom-surface', oldMaterial);
      stats.active = false;
    },
  };
}
