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
    `import {parseState, execute, BrowserRenderer, NativeRenderer, policy, relax, evaluate, CorpusRecordSchema, type DesignState} from '${root}/dist/index.js';
import {createDrivenMotion} from '${root}/dist/motion-runtime.js';
import {createDomLightController, collectBrowserOutputBindings, type BrowserBindingContext, type DomLightOptions} from '${root}/dist/browser-runtime.js';
const motion=createDrivenMotion({position:0,target:1});motion.retarget(.8);motion.advance(1/60);
const effectOptions:DomLightOptions={clock:'external',renderer:'webgl'};void effectOptions;void createDomLightController;
const bindingContext:BrowserBindingContext={current:{designIdentity:'x',sourceIdentity:'x',inputIdentity:'x',resultIdentity:'x'},scenario:'phone',scenarioIdentity:'x',resultRef:'evidence/dom.json'};
void bindingContext;void collectBrowserOutputBindings;
// @ts-expect-error DOM geometry requires an actual document or element, not a declared box.
collectBrowserOutputBindings({} as Parameters<typeof collectBrowserOutputBindings>[0],bindingContext,{width:390});
// @ts-expect-error The application clock advances motion in numeric seconds.
motion.advance('16');
const state:DesignState=parseState({});
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
