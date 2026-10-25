import { useEffect, useRef } from 'react';
import { createDomLightController } from '../../src/browser-dom-light';
import { getRuntime } from './runtime';

/** One retained plane per semantic surface; the shared host clock owns sampling. */
export function useDomMaterial(
  host,
  recipe,
  { id, renderer = 'webgl', target = null, statusRef } = {},
) {
  const controller = useRef(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const runtime = getRuntime();
    const current = createDomLightController(element, recipe, {
      clock: 'external',
      renderer,
      pointer: true,
      scroll: true,
      maxTiltDegrees: 0,
      gpu: { pixelRatio: 1, maxPixels: 350000 },
    });
    controller.current = current;
    runtime.stats.domSurfaces ??= {};
    const receipt = {
      adapter: current.stats,
      renderer: current.renderer,
      disposed: false,
    };
    runtime.stats.domSurfaces[id] = receipt;
    let previousStatus = '';
    const unsubscribe = runtime.subscribe((_time, dt) => {
      current.sample(dt);
      const status =
        current.renderer.status === 'ready'
          ? runtime.reduced
            ? 'Static material plane · reduced motion'
            : 'Live material plane'
          : current.renderer.status === 'initializing'
            ? 'CSS preview · preparing material light'
            : 'CSS lighting fallback';
      if (statusRef?.current && status !== previousStatus)
        statusRef.current.textContent = status;
      previousStatus = status;
    });
    return () => {
      unsubscribe();
      current.dispose();
      receipt.disposed = true;
      controller.current = null;
    };
  }, [renderer, id]);
  useEffect(() => {
    controller.current?.updateRecipe(recipe);
  }, [recipe]);
  useEffect(() => {
    controller.current?.setLightTarget(target);
  }, [target?.x, target?.y]);
  return controller;
}
