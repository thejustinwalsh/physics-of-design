import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
async function clientBundle(entry, contents) {
  return build({
    stdin: { contents: `import * as runtime from '${entry}'; ${contents}`, resolveDir: root },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'ClientResult',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
}
function assertClientInputs(result) {
  const paths = Object.keys(result.metafile.inputs);
  assert(!paths.some(p => /(?:^|\/)dist\/(?:index|commands|measurement|fonts|selector|mcp)\.js$/.test(p)), paths.join('\n'));
  assert(!paths.some(p => /node_modules\/(?:playwright|fontkit|@modelcontextprotocol)(?:\/|-)/.test(p)), paths.join('\n'));
}

test('published motion entry bundles and runs exact retargetable dynamics without Node or DOM', async () => {
  const bundle = await clientBundle('@design-theory/toolkit/motion', `
    const spring = runtime.createDrivenMotion({position:0, target:1, spring:{mass:1, stiffness:100, damping:20}});
    export const at = spring.advance(.1);
    export const retargeted = spring.retarget(-1);
    export const after = spring.advance(.1);
  `);
  assertClientInputs(bundle);
  assert(!Object.keys(bundle.metafile.inputs).some(p => /dist\/(?:browser-|dom-surface)/.test(p)));
  const scope = {};
  runInNewContext(bundle.outputFiles[0].text, scope);
  const { at, retargeted, after } = scope.ClientResult;
  assert(Math.abs(at.position - (1 - 2 / Math.E)) < 1e-12);
  assert(Math.abs(at.velocity - 10 / Math.E) < 1e-12);
  assert.equal(retargeted.position, at.position);
  assert.equal(retargeted.velocity, at.velocity);
  assert.equal(retargeted.target, -1);
  assert(after.position < at.position);
  assert(Number.isFinite(after.energy));
});

test('published browser entry exposes retained effects without loading authoring or verifier processes', async () => {
  const bundle = await clientBundle('@design-theory/toolkit/browser', `
    export const api = ['createDrivenMotion','createDomSurfaceRecipe','createDomLightController','createDomSurfaceGpu','createDeviceTiltController','probeSurface'].map(name => [name, typeof runtime[name]]);
    export const material = runtime.createDomSurfaceRecipe({material:'enamel',roughness:.3}).input;
  `);
  assertClientInputs(bundle);
  const scope = {};
  // Importing an effect does not require a document or request sensor permission.
  runInNewContext(bundle.outputFiles[0].text, scope);
  for (const [name, type] of scope.ClientResult.api) assert.equal(type, 'function', name);
  assert.equal(scope.ClientResult.material.material, 'enamel');
  assert.equal(scope.ClientResult.material.roughness, .3);
});
