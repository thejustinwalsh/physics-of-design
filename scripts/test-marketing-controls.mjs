// Independent synthetic fixture: a rail that moves during input and a stable rail.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'marketing-controls-test-'));
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;padding:16px;margin:0}label{display:block;margin:20px 0}input[type=range]{display:block;width:230px;height:30px}p{font-size:18px;height:50px;margin:16px 0}</style><main><h1>Synthetic controls fixture</h1><p id="response">Observable text</p><label>Stable rail<input id="stable" type="range" min="0" max="100" value="50"></label><label>Intentionally unstable rail<input id="unstable" type="range" min="0" max="100" value="50"></label><label>Choice<select><option>First</option><option>Second</option></select></label><label><input type="radio" name="choice" checked>One</label><label><input type="radio" name="choice">Two</label></main><script>document.getElementById('stable').addEventListener('input',event=>document.getElementById('response').style.fontSize=(16+Number(event.target.value)/10)+'px');document.getElementById('unstable').addEventListener('input',event=>event.target.style.transform='translateX('+(Number(event.target.value)>50?28:-28)+'px)');</script>`;
const server = http.createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); });
let child;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify({ arms: [{ id: 'fixture' }] }));
  const originsPath = path.join(temporary, 'origins.json');
  await fs.writeFile(originsPath, JSON.stringify({ origins: { fixture: origin } }));
  const script = fileURLToPath(new URL('./probe-marketing-controls.mjs', import.meta.url));
  child = spawn(process.execPath, [script, temporary, originsPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const exit = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(exit, 0, output);
  const report = JSON.parse(await fs.readFile(path.join(temporary, 'evaluation', 'controls.json'), 'utf8'));
  assert.equal(report.runs.length, 6, 'Both engines × three viewports');
  assert.deepEqual(report.infrastructureErrors, []);
  for (const run of report.runs) {
    const scope = `${run.engine}/${run.viewport.name}`;
    assert.equal(run.executionError, undefined, scope);
    assert.deepEqual(run.pageErrors, [], scope);
    const stable = run.ranges.find(range => range.before?.id === 'stable');
    const unstable = run.ranges.find(range => range.before?.id === 'unstable');
    assert.equal(stable?.error, undefined, scope);
    assert.equal(unstable?.error, undefined, scope);
    assert.equal(stable.pointerSamples.length, 12, `${scope}: continuous samples`);
    assert.equal(stable.documentRailUnstableWhileActive, false, `${scope}: stable rail`);
    assert.equal(unstable.documentRailUnstableWhileActive, true, `${scope}: moving rail detected`);
    assert.equal(stable.missedOrReplacedNode, false, scope);
    assert.equal(stable.keyboard.length, 3, scope);
    assert.equal(stable.observableOutsideControlChanges, true, `${scope}: sampled text changes recorded`);
    assert.equal(stable.keyboard.find(action => action.key === 'Home').after.value, '0', scope);
    assert.equal(stable.keyboard.find(action => action.key === 'End').after.value, '100', scope);
    assert.equal(run.reducedMotion.pointerSamples.length, 12, scope);
    assert.equal(run.reducedMotion.error, undefined, scope);
    assert.equal(run.others.select[0].actions.length, 5, scope);
    assert.equal(run.others['input[type="radio"]'].length, 2, scope);
  }
  console.log('PASS: Chromium/WebKit × phone/tablet/desktop detect unstable rail, retain stable rail, 12 active pointer samples, keyboard Home/End, outside DOM observations, radio/select, reduced-motion control and no pageerrors.');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(temporary, { recursive: true, force: true });
}
