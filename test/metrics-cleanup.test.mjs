import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { recordSession } from '../scripts/design-builder-metrics.mjs';

test('a completed parent cannot release its receipt while a resistant owned descendant survives', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'metrics-group-'));
  const peer = path.join(dir, 'peer.mjs'),
    pidFile = path.join(dir, 'child.pid');
  await writeFile(
    peer,
    `import readline from 'node:readline';import {spawn} from 'node:child_process';import fs from 'node:fs';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{userAgent:'synthetic'}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'}}});
if(m.method==='turn/start'){
 const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});
 child.once('message',()=>{fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.disconnect();send({id:m.id,result:{turn:{id:'u'}}});send({method:'turn/started',params:{threadId:'t',turn:{id:'u',status:'inProgress'}}});send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});});
}});`,
  );
  let childPid;
  try {
    const result = await recordSession(
      { cwd: dir, prompt: 'Synthetic process test only' },
      path.join(dir, 'receipt'),
      { executable: process.execPath, argsPrefix: [peer] },
    );
    childPid = Number(await readFile(pidFile, 'utf8'));
    assert.equal(result.wallTimeLimitMs, null);
    assert.equal(result.processCleanup.confirmedEmpty, true);
    assert.equal(result.processCleanup.forced, true);
    assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
    assert.equal(result.protocolError, null);
  } finally {
    if (!childPid)
      try {
        childPid = Number(await readFile(pidFile, 'utf8'));
      } catch {}
    if (childPid)
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {}
  }
});
