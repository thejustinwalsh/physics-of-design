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
