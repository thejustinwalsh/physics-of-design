#!/usr/bin/env node
// Deterministic environment probes. Importing this file starts no browser/model/device.
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const assert = (value, message) => {
  if (!value) throw Error(message);
};
export const capabilityKinds = ['browser', 'selector', 'native'];
export const browserFixture =
  '<!doctype html><meta charset="utf-8"><title>Capability probe</title><style>body{margin:20px;font:18px/1.5 sans-serif;background:#fff;color:#111}button{padding:12px}output{display:block}</style><p id="text">Measured browser capability</p><button onclick="document.querySelector(\'output\').textContent=\'1\'">Increment capability</button><output>0</output>';
export function artifact(output, file) {
  const absolute = realpathSync(path.resolve(output, file));
  const root = realpathSync(output);
  assert(
    absolute.startsWith(root + path.sep),
    'Artifact escaped probe directory',
  );
  const bytes = readFileSync(absolute);
  return {
    path: path.relative(root, absolute),
    bytes: bytes.length,
    sha256: hash(bytes),
  };
}
export function validateArtifact(output, ref) {
  assert(
    ref &&
      typeof ref.path === 'string' &&
      !path.isAbsolute(ref.path) &&
      !ref.path.split('/').includes('..'),
    'Unsafe capability artifact',
  );
  const actual = artifact(output, ref.path);
  assert(
    actual.sha256 === ref.sha256 && actual.bytes === ref.bytes,
    'Capability artifact changed',
  );
  return readFileSync(path.join(output, ref.path));
}
export async function probeBrowser({ workspace, output }) {
  const playwright = await import(
    pathToFileURL(
      path.join(workspace, 'toolkit/node_modules/playwright/index.mjs'),
    ).href
  );
  writeFileSync(path.join(output, 'fixture.html'), browserFixture);
  const engines = [];
  for (const engine of ['chromium', 'webkit']) {
    let browser;
    const entry = { engine, closed: false };
    engines.push(entry);
    try {
      browser = await playwright[engine].launch({ headless: true, timeout: 0 });
      entry.version = browser.version();
      const page = await browser.newPage({
        viewport: { width: 390, height: 300 },
        deviceScaleFactor: 1,
      });
      // No run deadline. These calls await the actual renderer or its explicit error.
      page.setDefaultTimeout(0);
      await page.setContent(browserFixture, { timeout: 0 });
      await page.getByRole('button', { name: 'Increment capability' }).click();
      entry.observation = await page.evaluate(() => {
        const rect = document.querySelector('#text').getBoundingClientRect();
        return {
          text: document.querySelector('#text').textContent,
          counter: document.querySelector('output').textContent,
          rectangle: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          viewport: { width: innerWidth, height: innerHeight },
        };
      });
      const screenshot = `${engine}.png`;
      await page.screenshot({
        path: path.join(output, screenshot),
        timeout: 0,
      });
      entry.screenshot = artifact(output, screenshot);
    } finally {
      if (browser) {
        await browser.close();
        entry.closed = !browser.isConnected();
      }
    }
  }
  return {
    engines,
    fixture: artifact(output, 'fixture.html'),
    cleanup: { confirmed: engines.every((e) => e.closed) },
  };
}
export function validateCapabilityResult(
  kind,
  result,
  output,
  { metadata, selector } = {},
) {
  assert(result?.cleanup?.confirmed === true, `${kind} disposal not confirmed`);
  if (kind === 'browser') {
    assert(
      JSON.stringify(result.engines?.map((e) => e.engine)) ===
        JSON.stringify(['chromium', 'webkit']),
      'Both real browser engines are required',
    );
    assert(
      validateArtifact(output, result.fixture).toString() === browserFixture,
      'Unexpected browser fixture',
    );
    for (const engine of result.engines) {
      const o = engine.observation,
        r = o?.rectangle;
      assert(
        engine.closed === true &&
          typeof engine.version === 'string' &&
          engine.version.length > 0,
        'Browser lifecycle incomplete',
      );
      assert(
        o?.text === 'Measured browser capability' &&
          o.counter === '1' &&
          o.viewport?.width === 390 &&
          o.viewport?.height === 300,
        'Browser render/action not observed',
      );
      assert(
        r &&
          Object.values(r).every(Number.isFinite) &&
          r.width > 0 &&
          r.height > 0 &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= 390 &&
          r.y + r.height <= 300,
        'Browser text geometry invalid',
      );
      const png = validateArtifact(output, engine.screenshot);
      assert(
        png.length > 100 &&
          png
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
          png.readUInt32BE(16) === 390 &&
          png.readUInt32BE(20) === 300,
        'Browser screenshot missing or invalid',
      );
    }
  } else if (kind === 'selector') {
    assert(
      result.profile === selector?.profile &&
        result.revision === selector?.revision &&
        result.checkpointSha256 === selector?.checkpoint.sha256,
      'Selector capability uses another checkpoint',
    );
    assert(
      result.readout?.requested === 1 &&
        result.readout.completed === 1 &&
        result.readout.modelCalls === 1 &&
        result.readout.candidates === 2 &&
        ['a', 'b'].includes(result.readout.selectedId),
      'Actual narrow selector readout required',
    );
    validateArtifact(output, result.artifact);
  } else if (kind === 'native') {
    assert(
      JSON.stringify(result.platforms?.map((p) => p.platform)) ===
        JSON.stringify(['native-ios', 'native-android']),
      'Both actual native adapters are required',
    );
    for (const p of result.platforms) {
      assert(
        p.deviceId ===
          metadata?.runtime.devices[
            p.platform === 'native-ios' ? 'ios' : 'android'
          ],
        'Native device differs from assigned runtime',
      );
      assert(
        p.sourceIdentity &&
          p.root?.width > 0 &&
          p.root?.height > 0 &&
          p.action?.before === 0 &&
          p.action.after === 1,
        'Native root geometry and actual shell action required',
      );
      const receipt = JSON.parse(validateArtifact(output, p.receipt));
      assert(
        receipt.sourceIdentity === p.sourceIdentity &&
          receipt.platform === p.platform,
        'Native receipt identity mismatch',
      );
      validateArtifact(output, p.screenshot);
    }
  } else throw Error('Unknown capability');
}
export async function runCapability(kind, { workspace = process.cwd() } = {}) {
  assert(
    capabilityKinds.includes(kind),
    'Expected browser, selector or native',
  );
  workspace = realpathSync(workspace);
  const output = path.resolve(workspace, '../cache/capabilities', kind);
  assert(
    !existsSync(output),
    'Capability output already exists; preserve it and prepare a new qualification',
  );
  mkdirSync(output, { recursive: true });
  const metadata = read(path.join(workspace, 'BUILDER.json')),
    selector = read(path.join(workspace, 'SELECTOR.json'));
  const source = fileURLToPath(import.meta.url),
    sources = [{ path: source, sha256: hash(readFileSync(source)) }];
  const receipt = {
    version: 1,
    kind: 'relay-execution-capability',
    capability: kind,
    workspace,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    sources,
    passed: false,
  };
  try {
    let probe = probeBrowser;
    let validateDeep;
    if (kind !== 'browser') {
      const module = new URL(`./relay-${kind}-capability.mjs`, import.meta.url);
      sources.push({
        path: fileURLToPath(module),
        sha256: hash(readFileSync(module)),
      });
      const loaded = await import(module.href);
      probe = loaded.probe;
      validateDeep =
        kind === 'native'
          ? loaded.validateNativeCapabilityResult
          : loaded.validateSelectorCapabilityResult;
    }
    receipt.result = await probe({ workspace, output, metadata, selector });
    if (kind !== 'browser') {
      assert(
        typeof validateDeep === 'function',
        `Complete ${kind} capability validator is required`,
      );
      await validateDeep(receipt.result, output, { metadata, selector });
    }
    validateCapabilityResult(kind, receipt.result, output, {
      metadata,
      selector,
    });
    receipt.passed = true;
  } catch (error) {
    writeFileSync(
      path.join(output, 'error.txt'),
      String(error?.stack ?? error),
    );
    receipt.error = {
      message: String(error?.message ?? error).slice(0, 500),
      artifact: artifact(output, 'error.txt'),
    };
  }
  receipt.finishedAt = new Date().toISOString();
  writeFileSync(
    path.join(output, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  // All full logs, screenshots and receipts stay outside model context.
  console.log(
    JSON.stringify({
      capability: kind,
      passed: receipt.passed,
      receipt: path.join(output, 'receipt.json'),
      error: receipt.error?.message ?? null,
    }),
  );
  return receipt;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!(await runCapability(process.argv[2])).passed) process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        passed: false,
        error: String(error.message).slice(0, 500),
      }),
    );
    process.exitCode = 1;
  }
}
