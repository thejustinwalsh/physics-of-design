import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = process.cwd(),
  dir = await mkdtemp(path.join(tmpdir(), 'physics-consumer-'));
try {
  await symlink(
    path.join(root, 'node_modules'),
    path.join(dir, 'node_modules'),
    'dir',
  );
  await writeFile(
    path.join(dir, 'consumer.mts'),
    `import {parseState, execute, BrowserRenderer, NativeRenderer, policy, relax, evaluate, CorpusRecordSchema, resolveRelationalKernelOutputs, type DesignState, type DecisionWorkflowInput} from '${root}/dist/index.js';
import {createDrivenMotion} from '${root}/dist/motion-runtime.js';
import {resolveDesignRuntime, type PortableDesign, advanceNativeViewport, type NativeViewport} from '${root}/dist/layout-runtime.js';
import {createDomLightController, collectBrowserOutputBindings, type BrowserBindingContext, type DomLightOptions} from '${root}/dist/browser-runtime.js';
const motion=createDrivenMotion({position:0,target:1});motion.retarget(.8);motion.advance(1/60);
const viewport:NativeViewport={window:{width:390,height:844,fontScale:1,scale:3},insets:{top:47,right:0,bottom:34,left:0}};
advanceNativeViewport(null,viewport);void resolveDesignRuntime;const portable:PortableDesign|null=null;void portable;
const effectOptions:DomLightOptions={clock:'external',renderer:'webgl'};void effectOptions;void createDomLightController;
const bindingContext:BrowserBindingContext={current:{designIdentity:'x',sourceIdentity:'x',inputIdentity:'x',resultIdentity:'x'},scenario:'phone',scenarioIdentity:'x',resultRef:'evidence/dom.json'};
void bindingContext;void collectBrowserOutputBindings;
// @ts-expect-error DOM geometry requires an actual document or element, not a declared box.
collectBrowserOutputBindings({} as Parameters<typeof collectBrowserOutputBindings>[0],bindingContext,{width:390});
// @ts-expect-error The application clock advances motion in numeric seconds.
motion.advance('16');
const state:DesignState=parseState({});
declare const selected:ReturnType<typeof resolveRelationalKernelOutputs>;
const rawMaterialValue=selected.values.phone!['appearance.material.roughnessDifference.value'];
if(typeof rawMaterialValue==='number')rawMaterialValue.toFixed(3);
// @ts-expect-error A material descriptor can be unknown; do not treat null or a token as a number.
rawMaterialValue.toFixed(3);
declare const workflowInput:DecisionWorkflowInput;
workflowInput.workflow.stages[0]!.consequenceKeys=['rawWidth'];
// @ts-expect-error Quantity readouts name declared derived quantities, not numeric values.
workflowInput.workflow.stages[0]!.consequenceKeys=[42];
const renderer=new BrowserRenderer();
const result=await relax(state,renderer,{policy:policy()});
const candidate=result.candidates[0];if(candidate)candidate.state.blocks[0]?.font.axes;
await renderer.close();
await execute('registry',{});
CorpusRecordSchema.parse({});evaluate({trials:[],preferences:[]});new NativeRenderer();
// @ts-expect-error The platform must be one of the declared renderer targets.
const invalid:DesignState={...state,platform:'canvas'};
// @ts-expect-error Unsupported command names are rejected by the exported handler type.
await execute('unknown',{});
`,
  );
  await promisify(execFile)(path.join(root, 'node_modules/.bin/tsc'), [
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target',
    'ES2023',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    path.join(dir, 'consumer.mts'),
  ]);
  console.log(
    'Isolated TypeScript consumer resolves emitted public declarations and negative contracts.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
