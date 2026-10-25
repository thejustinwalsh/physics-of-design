import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDomSurfaceRecipe,
  sampleDomSurfaceLight,
  domSurfaceContrast,
  domSurfaceLuminance,
  DOM_SURFACE_CSS,
} from '../src/dom-surface.js';
import { createDomLightController } from '../src/browser-dom-light.js';

const recipe = (extra = {}) =>
  createDomSurfaceRecipe({ material: 'enamel', ...extra });
test('recipes are deterministic and materially distinct without a beauty score', () => {
  assert.deepEqual(recipe(), recipe());
  const materials = ['paper', 'enamel', 'brushed-metal', 'soft-glass'].map(
    (material) => createDomSurfaceRecipe({ material }),
  );
  assert.equal(new Set(materials.map((r) => r.material.character)).size, 4);
  assert.equal(materials[0]!.input.specularStrength, 0.055);
  assert.equal(materials[2]!.descriptors.directionalTexture, true);
  assert(materials[3]!.input.translucency > 0);
  for (const r of materials) {
    assert.equal(r.contrast.renderedComposite, null);
    assert(!('score' in r));
    assert.equal(
      r.cssVariables['--dt-light-x'],
      sampleDomSurfaceLight(r, { x: 0, y: 0 }).cssVariables['--dt-light-x'],
    );
  }
});
test('light and normal vectors are unit vectors; head-on cosine oracle is one', () => {
  const r = recipe({ light: { x: 0, y: 0, z: 2, intensity: 1 } });
  const sample = sampleDomSurfaceLight(r, { x: 0, y: 0 });
  assert.equal(sample.descriptors.incidence, 1);
  assert.equal(sample.descriptors.highlightLobe, 1);
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1]) {
      const value = sampleDomSurfaceLight(r, { x, y, tiltDegrees: 12 });
      assert(Math.abs(Math.hypot(...value.normal) - 1) < 1e-12);
      assert(Math.abs(Math.hypot(...value.lightDirection) - 1) < 1e-12);
      assert(
        value.descriptors.incidence >= 0 && value.descriptors.incidence <= 1,
      );
    }
});
test('projected shadow obeys opposite-light elevation geometry', () => {
  const s = sampleDomSurfaceLight(
    recipe({ elevation: 12, light: { x: 0.5, y: -1, z: 2, intensity: 1 } }),
    { x: 0, y: 0 },
  );
  assert.equal(s.descriptors.castShadowOffset.x, -3);
  assert.equal(s.descriptors.castShadowOffset.y, 6);
  const flat = sampleDomSurfaceLight(recipe({ elevation: 0 }), { x: 0, y: 0 });
  assert.equal(Math.abs(flat.descriptors.castShadowOffset.x), 0);
  assert.equal(Math.abs(flat.descriptors.castShadowOffset.y), 0);
});
test('roughness broadens the authored highlight and changes shadow softness', () => {
  const smooth = sampleDomSurfaceLight(recipe({ roughness: 0 }), {
    x: 0,
    y: 0,
  });
  const rough = sampleDomSurfaceLight(recipe({ roughness: 1 }), { x: 0, y: 0 });
  assert(
    parseFloat(rough.cssVariables['--dt-highlight-width']!) >
      parseFloat(smooth.cssVariables['--dt-highlight-width']!),
  );
  assert(
    rough.descriptors.shadowSoftnessCssPx >
      smooth.descriptors.shadowSoftnessCssPx,
  );
  assert(
    rough.descriptors.highlightExponent < smooth.descriptors.highlightExponent,
  );
});
test('zero authored light intensity removes driven lighting layers', () => {
  const s = sampleDomSurfaceLight(recipe({ light: { intensity: 0 } }), {
    x: 1,
    y: -1,
  });
  for (const key of [
    '--dt-specular',
    '--dt-shade',
    '--dt-rim-alpha',
    '--dt-shadow-alpha',
  ])
    assert.equal(s.cssVariables[key], '0');
});
test('contrast arithmetic has independent black/white oracle but no composite guarantee', () => {
  assert.equal(domSurfaceContrast([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(domSurfaceLuminance([255, 255, 255]), 1);
  assert.equal(domSurfaceContrast([128, 128, 128], [128, 128, 128]), 1);
  const glass = recipe({
    material: 'soft-glass',
    baseColor: '#ffffff',
    ink: '#000000',
    translucency: 0.95,
    contentShieldOpacity: 0,
  });
  assert.equal(glass.contrast.nominalOpaqueBaseRatio, 21);
  assert.equal(glass.contrast.renderedComposite, null);
  assert.match(DOM_SURFACE_CSS, /@supports not/);
});
test('bounded public inputs reject invalid color, light, motion and false material capabilities', () => {
  for (const input of [
    { baseColor: 'red;display:none' },
    { roughness: NaN },
    { elevation: 49 },
    { light: { z: 0 } },
    { translucency: 0.5 },
  ])
    assert.throws(() => recipe(input));
  assert.throws(() => sampleDomSurfaceLight(recipe(), { x: 2, y: 0 }));
  assert.throws(() =>
    sampleDomSurfaceLight(recipe(), { x: 0, y: 0, tiltDegrees: 13 }),
  );
  assert.throws(() => domSurfaceLuminance([256, 0, 0]));
});

class Events {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(name: string, fn: (event: any) => void) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(fn);
    this.listeners.set(name, set);
  }
  removeEventListener(name: string, fn: (event: any) => void) {
    this.listeners.get(name)?.delete(fn);
  }
  emit(name: string, event = {}) {
    for (const fn of this.listeners.get(name) ?? []) fn(event);
  }
  count() {
    return [...this.listeners.values()].reduce((a, v) => a + v.size, 0);
  }
}
function host() {
  const frames = new Map<number, FrameRequestCallback>();
  const media = Object.assign(new Events(), { matches: false });
  const win = Object.assign(new Events(), {
    scrollY: 0,
    scrollX: 0,
    innerHeight: 800,
    rafCalls: 0,
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = ++this.rafCalls;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
    matchMedia: () => media,
  });
  const doc = Object.assign(new Events(), { hidden: false, defaultView: win });
  const values = new Map<string, string>([
    ['--dt-ink', 'old-value'],
    ['width', '200px'],
  ]);
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  const el = Object.assign(new Events(), {
    ownerDocument: doc,
    reads: 0,
    style: {
      getPropertyValue: (key: string) => values.get(key) ?? '',
      getPropertyPriority: () => '',
      setProperty: (key: string, value: string) => values.set(key, value),
      removeProperty: (key: string) => values.delete(key),
    },
    classList: {
      contains: (name: string) => classes.has(name),
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
    getAttribute: (key: string) => attributes.get(key) ?? null,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    removeAttribute: (key: string) => attributes.delete(key),
    getBoundingClientRect() {
      this.reads++;
      return { left: 0, top: 100, width: 200, height: 300 };
    },
  });
  return {
    el,
    doc,
    win,
    media,
    values,
    frames,
    step(time: number) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
  };
}
test('auto clock keeps slow valid responses running until target error settles and cancels on pause/disposal', () => {
  const h = host();
  const c = createDomLightController(h.el as unknown as HTMLElement, recipe(), {
    responseRate: 0.0001,
    scroll: false,
  });
  h.el.emit('pointermove', { clientX: 200, clientY: 250 });
  for (let i = 0; i < 20; i++) {
    h.step(i * 16);
    assert.equal(
      h.frames.size,
      1,
      `large target error must keep frame ${i} scheduled`,
    );
  }
  const rotation = parseFloat(h.values.get('--dt-rotate-y')!);
  assert(rotation > 0 && rotation < 0.001);
  assert(
    4.5 - rotation > 4,
    'tiny movement does not mean the 4.5-degree target settled',
  );
  h.media.matches = true;
  h.media.emit('change');
  assert.equal(h.frames.size, 0);
  h.media.matches = false;
  h.media.emit('change');
  assert.equal(h.frames.size, 1);
  h.doc.hidden = true;
  h.doc.emit('visibilitychange');
  assert.equal(h.frames.size, 0);
  h.doc.hidden = false;
  h.doc.emit('visibilitychange');
  assert.equal(h.frames.size, 1);
  c.dispose();
  assert.equal(h.frames.size, 0);
});
test('auto clock stops a settled target and restarts on a changed pointer target', () => {
  const h = host();
  const c = createDomLightController(h.el as unknown as HTMLElement, recipe(), {
    scroll: false,
  });
  h.el.emit('pointermove', { clientX: 200, clientY: 250 });
  for (let i = 0; i < 200 && h.frames.size; i++) h.step(i * 16);
  assert.equal(h.frames.size, 0);
  assert(Math.abs(parseFloat(h.values.get('--dt-rotate-y')!) - 4.5) < 0.0001);
  h.el.emit('pointerleave');
  assert.equal(h.frames.size, 1);
  for (let i = 0; i < 200 && h.frames.size; i++) h.step(4000 + i * 16);
  assert.equal(h.frames.size, 0);
  assert(Math.abs(parseFloat(h.values.get('--dt-rotate-y')!)) < 0.0001);
  c.dispose();
});
test('external clock keeps layout and React outside frames, uses latest pointer input, and restores owned styles', () => {
  const h = host(),
    c = createDomLightController(h.el as unknown as HTMLElement, recipe(), {
      clock: 'external',
      scroll: false,
    });
  const reads = h.el.reads;
  h.el.emit('pointermove', { clientX: 0, clientY: 100 });
  h.el.emit('pointermove', { clientX: 200, clientY: 400 });
  for (let i = 0; i < 60; i++) c.sample(1 / 60);
  assert.equal(h.el.reads, reads);
  assert.equal(h.win.rafCalls, 0);
  assert(parseFloat(h.values.get('--dt-rotate-y')!) > 4);
  assert.equal(c.stats.frames, 60);
  c.dispose();
  c.dispose();
  assert.equal(h.values.get('--dt-ink'), 'old-value');
  assert.equal(h.values.get('width'), '200px');
  assert.equal(h.values.has('--dt-light-x'), false);
  assert.equal(
    h.el.count() + h.doc.count() + h.win.count() + h.media.count(),
    0,
  );
  assert.equal(c.status, 'disposed');
});
test('reduced motion and hidden documents reset and suspend updates', () => {
  const h = host(),
    c = createDomLightController(h.el as unknown as HTMLElement, recipe(), {
      clock: 'external',
    });
  h.el.emit('pointermove', { clientX: 200, clientY: 400 });
  c.sample(0.5);
  h.media.matches = true;
  h.media.emit('change');
  const writes = c.stats.styleWrites;
  assert.equal(h.values.get('--dt-rotate-x'), '0deg');
  assert.equal(c.status, 'paused');
  c.sample(0.5);
  assert.equal(c.stats.styleWrites, writes);
  h.media.matches = false;
  h.media.emit('change');
  h.doc.hidden = true;
  h.doc.emit('visibilitychange');
  const frames = c.stats.frames;
  c.sample(0.5);
  assert.equal(c.stats.frames, frames);
  c.dispose();
});
test('elapsed-time smoothing is partition invariant for a held target', () => {
  const a = host(),
    b = host();
  const ca = createDomLightController(
    a.el as unknown as HTMLElement,
    recipe(),
    { clock: 'external', scroll: false },
  );
  const cb = createDomLightController(
    b.el as unknown as HTMLElement,
    recipe(),
    { clock: 'external', scroll: false },
  );
  for (const h of [a, b])
    h.el.emit('pointermove', { clientX: 200, clientY: 400 });
  const one = ca.sample(1);
  let many = cb.sample(0);
  for (let i = 0; i < 60; i++) many = cb.sample(1 / 60);
  assert.deepEqual(one.cssVariables, many.cssVariables);
  ca.dispose();
  cb.dispose();
});

test('recipe updates preserve retained pose, listeners and cached geometry', () => {
  const h = host(),
    c = createDomLightController(h.el as unknown as HTMLElement, recipe(), {
      clock: 'external',
      scroll: false,
    });
  h.el.emit('pointermove', { clientX: 200, clientY: 400 });
  c.sample(0.5);
  const rotation = h.values.get('--dt-rotate-y'),
    reads = h.el.reads,
    listeners = h.el.count() + h.win.count();
  c.updateRecipe(recipe({ roughness: 0.95, baseColor: '#ddeecc' }));
  assert.equal(h.values.get('--dt-rotate-y'), rotation);
  assert.equal(h.el.reads, reads);
  assert.equal(h.el.count() + h.win.count(), listeners);
  assert.equal(h.values.get('--dt-base'), '#ddeecc');
  assert.equal(h.values.get('--dt-highlight-width'), '80.4%');
  c.dispose();
});

test('host light targets are bounded, retained, and release back to pointer input', () => {
  const h = host(),
    c = createDomLightController(h.el as unknown as HTMLElement, recipe(), {
      clock: 'external',
      scroll: false,
    });
  c.setLightTarget({ x: 1, y: -1 });
  c.sample(1);
  assert(parseFloat(h.values.get('--dt-rotate-y')!) > 5.99);
  assert.throws(() => c.setLightTarget({ x: Infinity, y: 0 }));
  c.setLightTarget(null);
  c.sample(1);
  assert(Math.abs(parseFloat(h.values.get('--dt-rotate-y')!)) < 0.001);
  c.dispose();
  c.setLightTarget({ x: 1, y: 0 });
  assert.equal(c.status, 'disposed');
});
