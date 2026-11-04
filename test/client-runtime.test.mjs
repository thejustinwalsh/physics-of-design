import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
async function clientBundle(entry, contents) {
  return build({
    stdin: {
      contents: `import * as runtime from '${entry}'; ${contents}`,
      resolveDir: root,
    },
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
  assert(
    !paths.some((p) =>
      /(?:^|\/)dist\/(?:index|commands|measurement|fonts|selector|mcp)\.js$/.test(
        p,
      ),
    ),
    paths.join('\n'),
  );
  assert(
    !paths.some((p) =>
      /node_modules\/(?:playwright|fontkit|@modelcontextprotocol)(?:\/|-)/.test(
        p,
      ),
    ),
    paths.join('\n'),
  );
  // Validation stays available without bundling every optional error language.
  const retained = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, value]) => value.bytesInOutput > 0)
      .map(([name]) => name),
  );
  assert(
    !retained.some((p) => /zod\/v4\/locales\/(?!en\.js$)[^/]+\.js$/.test(p)),
    retained.join('\n'),
  );
}

test('published layout entry applies a relational handoff and safe-root projection without Node or DOM', async () => {
  const bundle = await clientBundle(
    '@design-theory/toolkit/layout',
    `
    const handoff = {
      assignment:{base:16,padding:24}, runtimePolicy:{unsampledScenarioBands:'base'},
      program:{scenarios:[{id:'phone',values:{width:320,height:740,textScale:1}},{id:'desktop',values:{width:1440,height:1024,textScale:2}}],
        derived:[{id:'measure',expression:{op:'sub',args:[{ref:'width'},{op:'mul',args:[2,{ref:'padding'}]}]}}],
        factors:[{id:'measure-fit',mode:'hard',expression:{ref:'measure'},bands:[{min:180,max:2000}]}]},
      machine:{states:[{id:'home',on:[],regions:[{id:'body',role:'prose',bindings:{width:{ref:'measure'},fontSize:{op:'mul',args:[{ref:'base'},{ref:'textScale'}]}}}]}],motions:{}}
    };
    export const layout=runtime.resolveDesignRuntime(handoff,{width:390,height:844,textScale:1.5});
    export const insets=runtime.projectNativeSafeArea({screen:{width:400,height:800},window:{width:400,height:752},screenOffset:{x:0,y:24},insets:{top:24,right:0,bottom:24,left:0}});
    const current=runtime.advanceNativeViewport(null,{window:{width:390,height:844,fontScale:1.5,scale:3},insets:{top:47,right:0,bottom:34,left:0}});
    export const held=runtime.advanceNativeViewport(current,{...current.accepted,window:{...current.accepted.window,width:0}});
    export const rebased=runtime.nativeFrameRelativeToRoot({x:20,y:90,width:120,height:40},{x:0,y:24});
  `,
  );
  assertClientInputs(bundle);
  assert(
    !Object.keys(bundle.metafile.inputs).some((p) =>
      /dist\/(?:energy|motion|browser-|dom-surface|output-bindings)/.test(p),
    ),
  );
  const scope = {};
  runInNewContext(bundle.outputFiles[0].text, scope);
  const { layout, insets, held, rebased } = scope.ClientResult;
  assert.equal(layout.admissible, true);
  assert.equal(layout.regions.home.body.width, 342);
  assert.equal(layout.regions.home.body.fontSize, 24);
  assert.deepEqual(JSON.parse(JSON.stringify(insets)), {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });
  assert.equal(held.status, 'held');
  assert.equal(held.accepted.window.width, 390);
  assert.equal(rebased.y, 66);
});

test('published motion entry bundles and runs exact retargetable dynamics without Node or DOM', async () => {
  const bundle = await clientBundle(
    '@design-theory/toolkit/motion',
    `
    const spring = runtime.createDrivenMotion({position:0, target:1, spring:{mass:1, stiffness:100, damping:20}});
    export const at = spring.advance(.1);
    export const retargeted = spring.retarget(-1);
    export const after = spring.advance(.1);
  `,
  );
  assertClientInputs(bundle);
  assert(
    !Object.keys(bundle.metafile.inputs).some((p) =>
      /dist\/(?:browser-|dom-surface)/.test(p),
    ),
  );
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
  const bundle = await clientBundle(
    '@design-theory/toolkit/browser',
    `
    export const api = ['createDrivenMotion','createDomSurfaceRecipe','createDomLightController','createDomSurfaceGpu','createDeviceTiltController','probeSurface','collectBrowserOutputBindings'].map(name => [name, typeof runtime[name]]);
    export const material = runtime.createDomSurfaceRecipe({material:'enamel',roughness:.3}).input;
  `,
  );
  assertClientInputs(bundle);
  const scope = {};
  // Importing an effect does not require a document or request sensor permission.
  runInNewContext(bundle.outputFiles[0].text, scope);
  for (const [name, type] of scope.ClientResult.api)
    assert.equal(type, 'function', name);
  assert.equal(scope.ClientResult.material.material, 'enamel');
  assert.equal(scope.ClientResult.material.roughness, 0.3);
});
