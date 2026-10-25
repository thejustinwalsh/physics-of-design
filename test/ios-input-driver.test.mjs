import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('iOS input help records state in a private directory without installing a runtime', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ios-input-state-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const state = path.join(directory, 'state'),
    runtime = path.join(directory, 'not-installed');
  const output = execFileSync(
    process.execPath,
    ['scripts/ios-input-driver.mjs', 'help'],
    {
      env: {
        ...process.env,
        DESIGN_IDB_STATE_DIRECTORY: state,
        DESIGN_IDB_RUNTIME_DIRECTORY: runtime,
      },
      encoding: 'utf8',
    },
  );
  assert.match(output, /DESIGN_IDB_STATE_DIRECTORY/);
  assert.equal(readdirSync(path.join(state, 'commands')).length, 1);
  assert.equal(existsSync(runtime), false);
});
