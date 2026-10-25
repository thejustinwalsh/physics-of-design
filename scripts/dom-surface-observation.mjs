import { createHash } from 'node:crypto';

// Proof-only synchronization. A WebGL draw submission is not a presented frame.
// Two animation callbacks leave a rendering opportunity between the mutation and
// capture; the unchanged pixel oracle still determines whether the result is right.
export async function waitForDomSurfacePaint(page) {
  const observation = await page.evaluateHandle(() => {
    const state = { complete: false };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        state.complete = true;
      }),
    );
    return state;
  });
  try {
    await page.waitForFunction((state) => state.complete, observation);
  } finally {
    await observation.dispose();
  }
}

export async function captureDomSurface(page, options = {}) {
  await waitForDomSurfacePaint(page);
  return page.screenshot(options);
}

// Only for a held pose: Linux WebKit can return the preceding canvas composite
// on the first snapshot even after RAF callbacks. Require successive captures
// to agree, independently of the pixel oracle. Never use this for motion timing.
export async function captureStaticDomSurface(page, options = {}) {
  let previous;
  const captureSha256 = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = await captureDomSurface(page, options);
    captureSha256.push(createHash('sha256').update(bytes).digest('hex'));
    if (previous?.equals(bytes)) return { bytes, captureSha256 };
    previous = bytes;
  }
  throw new Error(
    `Static DOM surface did not settle in five captures: ${JSON.stringify(captureSha256)}`,
  );
}

// Record both a retained MediaQueryList and a new query, together with CSS and
// controller state. A fixed delay cannot establish that emulation has propagated.
export async function observeDomSurfaceMotion(page, reducedMotion) {
  const reduce = reducedMotion === 'reduce';
  const observation = await page.evaluateHandle(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const started = performance.now();
    const events = [];
    const onChange = (event) => {
      if (events.length < 8)
        events.push({
          matches: event.matches,
          afterMs: performance.now() - started,
        });
    };
    media.addEventListener('change', onChange);
    const style = document.createElement('style');
    style.textContent =
      ':root{--dt-proof-reduced-motion:0}@media(prefers-reduced-motion:reduce){:root{--dt-proof-reduced-motion:1}}';
    document.head.append(style);
    return { media, events, onChange, style, initial: media.matches, started };
  });
  const read = () =>
    observation.evaluate((state) => ({
      initial: state.initial,
      retained: state.media.matches,
      fresh: matchMedia('(prefers-reduced-motion: reduce)').matches,
      css:
        getComputedStyle(document.documentElement)
          .getPropertyValue('--dt-proof-reduced-motion')
          .trim() === '1',
      controllers: proof.controllers.map((controller) => ({
        status: controller.status,
        reduced: controller.stats.reduced,
      })),
      events: state.events,
      afterMs: performance.now() - state.started,
    }));
  try {
    await page.emulateMedia({ reducedMotion });
    await waitForDomSurfacePaint(page);
    await page.waitForFunction(
      ({ state, reduce }) => {
        const css =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--dt-proof-reduced-motion')
            .trim() === '1';
        return (
          css === reduce &&
          matchMedia('(prefers-reduced-motion: reduce)').matches === reduce &&
          state.media.matches === reduce &&
          (state.initial === reduce ||
            state.events.some((event) => event.matches === reduce)) &&
          proof.controllers.every(
            (controller) =>
              controller.stats.reduced === reduce &&
              (!reduce || controller.status === 'paused'),
          )
        );
      },
      { state: observation, reduce },
    );
    return await read();
  } catch (error) {
    throw new Error(
      `Reduced-motion observation did not converge: ${JSON.stringify(await read())}`,
      { cause: error },
    );
  } finally {
    await observation.evaluate((state) => {
      state.media.removeEventListener('change', state.onChange);
      state.style.remove();
    });
    await observation.dispose();
  }
}
