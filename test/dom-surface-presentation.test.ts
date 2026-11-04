import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomSurfaceGpu } from '../src/dom-surface-gpu.js';
import { createDomSurfaceRecipe, sampleDomSurfaceLight } from '../src/dom-surface.js';

// Synthetic GPU records submissions and uniforms; real browser pixel proofs remain separate.
function harness() {
  let id = 0, lost = false, removed = false;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  const handlers = new Map<string, (event: Event) => void>();
  const attributes = new Map<string, string>();
  const uniforms: Record<string, number | number[]> = {};
  const submissions: typeof uniforms[] = [];
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, LINK_STATUS: 35714,
    TEXTURE_2D: 3553, TEXTURE0: 33984, RGBA: 6408, UNSIGNED_BYTE: 5121,
    TEXTURE_MIN_FILTER: 10241, LINEAR_MIPMAP_LINEAR: 9987,
    TEXTURE_MAG_FILTER: 10240, LINEAR: 9729, TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243, REPEAT: 10497, TRIANGLES: 4,
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}),
    shaderSource: noop, compileShader: noop, attachShader: noop, linkProgram: noop,
    deleteShader: noop, deleteProgram: noop, deleteTexture: noop,
    bindTexture: noop, texImage2D: noop, texParameteri: noop, generateMipmap: noop,
    viewport: noop, useProgram: noop, activeTexture: noop, flush: noop,
    getExtension: () => null, getProgramParameter: () => true,
    getUniformLocation: (_program: unknown, name: string) => name,
    isContextLost: () => lost,
    uniform1i(name: string, value: number) { uniforms[name] = value; },
    uniform1f(name: string, value: number) { uniforms[name] = value; },
    uniform3f(name: string, ...value: number[]) { uniforms[name] = value; },
    uniform3fv(name: string, value: number[]) { uniforms[name] = [...value]; },
    drawArrays() { submissions.push(structuredClone(uniforms)); },
  };
  const canvas = {
    className: '', hidden: false, width: 1, height: 1,
    setAttribute: noop,
    getContext: () => gl,
    addEventListener(name: string, listener: (event: Event) => void) { handlers.set(name, listener); },
    removeEventListener(name: string) { handlers.delete(name); },
    remove() { removed = true; },
  };
  const element = {
    ownerDocument: {
      createElement: () => canvas,
      defaultView: {
        devicePixelRatio: 1,
        requestAnimationFrame(callback: FrameRequestCallback) { frames.set(++id, callback); return id; },
        cancelAnimationFrame(key: number) { frames.delete(key); },
        setTimeout(callback: () => void) { timers.set(++id, callback); return id; },
        clearTimeout(key: number) { timers.delete(key); },
      },
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    prepend: noop,
  };
  const recipe = createDomSurfaceRecipe({ material: 'enamel', roughness: 0.3 });
  const first = sampleDomSurfaceLight(recipe, { x: 0, y: 0 });
  const second = sampleDomSurfaceLight(recipe, { x: 0.8, y: -0.5 });
  const gpu = createDomSurfaceGpu(element as unknown as HTMLElement, recipe);
  gpu.resize(200, 100);
  gpu.draw(first);
  const initialize = () => {
    for (let turn = 0; timers.size; turn++) {
      assert(turn < 10, 'Initialization did not stop');
      const pending = [...timers.values()]; timers.clear(); pending.forEach(run => run());
    }
    assert.equal(gpu.stats.status, 'ready');
  };
  const frame = () => {
    const pending = [...frames.values()]; frames.clear(); pending.forEach(run => run(id * 16));
  };
  initialize();
  return {
    gpu, recipe, first, second, frames, submissions, initialize, frame,
    get removed() { return removed; },
    lose() { lost = true; handlers.get('webglcontextlost')!(new Event('webglcontextlost', { cancelable: true })); },
    restore() { lost = false; handlers.get('webglcontextrestored')!(new Event('webglcontextrestored')); initialize(); },
  };
}

test('a quiet final pose submits twice and then schedules no idle work', () => {
  const h = harness();
  assert.equal(h.submissions.length, 0);
  h.frame();
  assert.equal(h.submissions.length, 1);
  h.gpu.draw(h.first); // An unchanged request must not cancel pending presentation.
  assert.equal(h.frames.size, 1);
  h.frame();
  assert.equal(h.submissions.length, 2);
  assert.deepEqual(h.submissions[0], h.submissions[1]);
  assert.equal(h.gpu.stats.draws, 2);
  assert.equal(h.frames.size, 0);
  for (let i = 0; i < 20; i++) h.gpu.draw(h.first);
  assert.equal(h.frames.size, 0);
  assert.equal(h.submissions.length, 2);
  h.gpu.dispose();
});

test('new recipe/output/sample supersedes pending presentation in one frame', () => {
  const h = harness(); h.frame();
  h.gpu.update(createDomSurfaceRecipe({ material: 'enamel', roughness: 0.7 }));
  h.gpu.setOutput('specular'); h.gpu.draw(h.second);
  assert.equal(h.frames.size, 1);
  h.frame();
  assert.equal(h.submissions.length, 2);
  assert.equal(h.submissions[1]!.uRoughness, 0.7);
  assert.equal(h.submissions[1]!.uOutput, 2);
  assert.notDeepEqual(h.submissions[0]!.uLight, h.submissions[1]!.uLight);
  h.frame();
  assert.equal(h.submissions.length, 3);
  assert.deepEqual(h.submissions[1], h.submissions[2]);
  assert.equal(h.frames.size, 0);
  assert.equal(h.gpu.stats.textureBuilds, 1);
  assert.equal(h.gpu.stats.programBuilds, 1);
  h.gpu.dispose();
});

test('suspension cancels final presentation and resume refreshes even an unchanged pose', () => {
  const h = harness(); h.frame();
  h.gpu.setSuspended(true);
  assert.equal(h.frames.size, 0); h.frame();
  assert.equal(h.submissions.length, 1);
  h.gpu.setSuspended(false);
  assert.equal(h.frames.size, 1);
  h.frame(); h.frame();
  assert.equal(h.submissions.length, 3);
  assert.equal(h.frames.size, 0);
  h.gpu.setSuspended(false);
  assert.equal(h.frames.size, 0);
  h.gpu.setSuspended(true); h.gpu.draw(h.second); h.gpu.setSuspended(false);
  h.frame(); h.frame();
  assert.equal(h.submissions.length, 5);
  assert.notDeepEqual(h.submissions[0]!.uLight, h.submissions[4]!.uLight);
  h.gpu.dispose();
});

test('context loss cancels presentation and restoration uses the latest requested sample', () => {
  const h = harness(); h.frame(); h.lose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.gpu.stats.status, 'fallback');
  h.gpu.draw(h.second); h.frame();
  assert.equal(h.submissions.length, 1);
  h.restore(); h.frame(); h.frame();
  assert.equal(h.submissions.length, 3);
  assert.notDeepEqual(h.submissions[0]!.uLight, h.submissions[2]!.uLight);
  assert.equal(h.gpu.stats.programBuilds, 2);
  assert.equal(h.gpu.stats.textureBuilds, 1);
  assert.equal(h.frames.size, 0);
  h.gpu.dispose();
});

test('disposal cancels initial and final queued submissions', () => {
  for (const firstPresented of [false, true]) {
    const h = harness(); if (firstPresented) h.frame();
    const count = h.submissions.length; h.gpu.dispose();
    assert.equal(h.frames.size, 0); h.frame();
    h.gpu.draw(h.second);
    assert.equal(h.submissions.length, count);
    assert.equal(h.gpu.stats.status, 'disposed');
    assert(h.removed);
  }
});
