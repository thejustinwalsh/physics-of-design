import { useEffect } from 'react';
import { createDomLightController } from './design/dom-light-runtime';
import generated from './design/surfaces.generated.json';
import palettes from './design/palette.generated.json';
import { subscribeFrame } from './clock.mjs';
export default function Materials({ route, theme, palette, reduced }) {
  useEffect(() => {
    const paletteId = Object.hasOwn(generated.directions, palette)
      ? palette
      : palettes.defaultDirection;
    const direction = generated.directions[paletteId];
    const surfaces = direction[theme] ?? direction.dark;
    const style = document.createElement('style');
    style.textContent =
      surfaces.action.cssText +
      '\n.dt-dom-surface{transform:none!important}.dt-dom-surface>*{position:relative;z-index:1}';
    document.head.append(style);
    const cleanups = [];
    const diagnostics = [];
    for (const [id, name] of [
      ['relay-overview-summary', 'substrate'],
      ['relay-navigation', 'navigation'],
      ['relay-context-toolbar', 'action'],
    ]) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) continue;
      const recipe = surfaces[name];
      const controller = createDomLightController(
        /** @type {HTMLElement} */ (element),
        recipe,
        {
          clock: 'external',
          pointer: !reduced,
          scroll: false,
          tilt: false,
          maxTiltDegrees: 0,
          renderer: 'css',
          responseRate: generated.lightResponse,
        },
      );
      let stop = null;
      let samples = 0;
      const activate = () => {
        if (reduced || document.hidden) return;
        if (stop) stop();
        samples = 0;
        stop = subscribeFrame((dt) => {
          if (document.hidden || controller.stats.offscreen) return true;
          controller.sample(dt);
          return ++samples >= 60;
        });
      };
      element.addEventListener('pointermove', activate);
      element.addEventListener('pointerleave', activate);
      activate();
      diagnostics.push({ id, name, controller });
      cleanups.push(() => {
        stop?.();
        element.removeEventListener('pointermove', activate);
        element.removeEventListener('pointerleave', activate);
        controller.dispose();
      });
    }
    globalThis.__RELAY_MATERIALS__ = () =>
      diagnostics.map(({ id, name, controller }) => ({
        id,
        name,
        status: controller.status,
        stats: controller.stats,
        renderer: controller.renderer,
        palette: paletteId,
        theme,
        baseColor: surfaces[name].input.baseColor,
        roughness: surfaces[name].input.roughness,
        responseRate: generated.lightResponse,
        choiceIdentity: generated.choiceIdentity,
      }));
    return () => {
      cleanups.forEach((fn) => fn());
      style.remove();
      delete globalThis.__RELAY_MATERIALS__;
    };
  }, [route, theme, palette, reduced]);
  return null;
}
