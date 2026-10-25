// Synthetic protocol/geometry fixtures only. No renderer or model is invoked.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  expoProofSourceFiles,
  expoRendererSourceFiles,
} from '../../scripts/expo-proof-contract.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value !== null && typeof value === 'object'
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(',')}}`
      : JSON.stringify(value);
const digest = (value) => sha256(canonical(value));
const write = (root, file, value) => {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    typeof value === 'string' || Buffer.isBuffer(value)
      ? value
      : JSON.stringify(value, null, 2) + '\n',
  );
  return target;
};
const checks = (count) =>
  Array.from({ length: count }, (_, i) => ({
    name: `synthetic-check-${i}`,
    passed: true,
  }));

export function createExpoGateFixture(repo, policy) {
  const relativeOutput = 'artifacts/synthetic-expo';
  write(repo, '.gitignore', 'artifacts/\n');
  write(
    repo,
    'scripts/run-relay-builders.mjs',
    readFileSync(
      new URL('../../scripts/run-relay-builders.mjs', import.meta.url),
    ),
  );
  write(
    repo,
    'scripts/expo-proof-contract.mjs',
    readFileSync(
      new URL('../../scripts/expo-proof-contract.mjs', import.meta.url),
    ),
  );
  for (const file of expoProofSourceFiles)
    if (!existsSync(path.join(repo, file)))
      write(repo, file, `Synthetic source fixture: ${file}\n`);
  const designPath = `${policy.templateRoot}/DESIGN.md`;
  if (!existsSync(path.join(repo, designPath)))
    write(repo, designPath, '# Synthetic fixture design\n');
  const rendererHash = createHash('sha256');
  for (const file of expoRendererSourceFiles) {
    rendererHash.update(file);
    rendererHash.update('\0');
    rendererHash.update(
      readFileSync(path.resolve(repo, policy.templateRoot, file)),
    );
    rendererHash.update('\0');
  }
  const sourceIdentity = rendererHash.digest('hex'),
    designIdentity = sha256(readFileSync(path.join(repo, designPath)));
  const scenarios = [
    ...[390, 820, 1440].flatMap((width) =>
      [1, 2].map((textScale) => ({
        id: `web-${width}-${textScale}`,
        platform: 'web',
        width,
        height: 1000,
        textScale,
        unit: 'px',
      })),
    ),
    ...['native-ios', 'native-android'].flatMap((platform) =>
      [1, 2].map((textScale) => ({
        id: `${platform}-${textScale}`,
        platform,
        width: 390,
        height: 844,
        textScale,
        unit: 'dp',
      })),
    ),
  ];
  const values = Object.fromEntries(
    scenarios.map((scenario) => [
      scenario.id,
      {
        'regions.list.width': 160,
        'regions.detail.width': 180,
        'row.fontSize': 16 * scenario.textScale,
        'row.lineHeight': 24 * scenario.textScale,
        'row.rowHeight': 48 * scenario.textScale,
      },
    ]),
  );
  const resultIdentity = digest(values);
  write(repo, `${policy.templateRoot}/src/design.generated.json`, {
    synthetic: true,
    phase: 'resolved-kernels',
    sourceIdentity,
    designIdentity,
    identity: resultIdentity,
    inputIdentity: 'synthetic-input',
    values,
    scenarios,
  });
  const box = (width, height) => ({ x: 0, y: 0, width, height });
  const receipt = (scenario) => ({
    synthetic: true,
    provider: scenario.platform === 'web' ? 'browser' : scenario.platform,
    platform: scenario.platform,
    phase: 'resolved-kernels',
    sourceIdentity,
    designIdentity,
    resultIdentity,
    scenario: scenario.id,
    textScale: scenario.textScale,
    runtime: 'synthetic-test-only',
    viewport: { width: scenario.width, height: scenario.height, scale: 1 },
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    observedAt: '2026-10-25T00:00:00.000Z',
    boxes: {
      list: box(160, 300),
      detail: box(180, 300),
      'line-height-probe': box(100, values[scenario.id]['row.lineHeight']),
      'row-inlet': box(160, values[scenario.id]['row.rowHeight']),
    },
    boundStyles: {
      'row-inlet': { fontSize: `${values[scenario.id]['row.fontSize']}px` },
    },
  });
  const web = {
    synthetic: true,
    sourceIdentity,
    designIdentity,
    resultIdentity,
    failures: [],
    checks: checks(60),
    scenarios: ['chromium', 'webkit'].flatMap((browser) =>
      scenarios
        .filter((s) => s.platform === 'web')
        .map((s) => ({
          id: `${browser}-${s.id}`,
          browser,
          width: s.width,
          height: s.height,
          textScale: s.textScale,
          receipt: receipt(s),
          errors: [],
        })),
    ),
  };
  const natives = Object.fromEntries(
    ['ios', 'android'].map((key, index) => {
      const platform = `native-${key}`;
      return [
        key,
        {
          synthetic: true,
          platform,
          sourceIdentity,
          designIdentity,
          resultIdentity,
          sourceStable: true,
          calibrate: false,
          error: null,
          checks: checks(10),
          actions: [
            'filter-all',
            'enlarge',
            'enlarge',
            'filter-review',
            'row-inlet',
            'mark-reviewed',
            'filter-all',
            'long-text',
          ].map((target) => ({
            target,
            method:
              index === 0
                ? 'idb-native-hid-with-independent-ax-id'
                : 'adb-native-input-with-independent-uiautomator-bounds',
            before: {},
            after: {},
            box: box(160, 48),
            observedAt: '2026-10-25T00:00:00.000Z',
          })),
          receipts: [
            ...scenarios
              .filter((s) => s.platform === platform)
              .map((s) => ({
                name: s.textScale === 1 ? 'normal' : 'enlarged',
                receipt: receipt(s),
              })),
            ...['detail', 'reviewed-long-text'].map((name) => ({
              name,
              receipt: {
                ...receipt(
                  scenarios.find(
                    (s) => s.platform === platform && s.textScale === 1,
                  ),
                ),
                selected: name === 'detail' ? 'inlet' : null,
                reviewed: name === 'detail' ? [] : ['inlet'],
                longText: name === 'reviewed-long-text',
              },
            })),
          ],
        },
      ];
    }),
  );
  const observations = scenarios.flatMap((s) =>
    [
      'list',
      'detail',
      'line-height-probe',
      ...(s.platform === 'web' ? ['row-inlet'] : []),
    ].map((surface) => ({
      synthetic: true,
      scenario: s.id,
      platform: s.platform,
      surface,
      status: 'observed',
      current: { sourceIdentity, designIdentity, resultIdentity },
    })),
  );
  const contents = {
    web,
    ...natives,
    bindings: {
      synthetic: true,
      observations,
      check: {
        verified: true,
        entries: observations.map((o, i) => ({
          id: `synthetic-binding-${i}`,
          status: 'pass',
        })),
      },
    },
    compiled: { synthetic: true },
    workflow: { synthetic: true },
  };
  const artifactPaths = Object.fromEntries(
    Object.entries(contents).map(([role, content]) => [
      role,
      write(repo, `${relativeOutput}/${role}.json`, content),
    ]),
  );
  const spike = {
    synthetic: true,
    version: 1,
    complete: true,
    sourceIdentity,
    designIdentity,
    resultIdentity,
    files: expoProofSourceFiles.map((file) => ({
      path: file,
      sha256: sha256(readFileSync(path.join(repo, file))),
    })),
    artifacts: Object.entries(artifactPaths).map(([role, file]) => ({
      role,
      path: path.relative(repo, file),
      sha256: sha256(readFileSync(file)),
    })),
  };
  const spikePath = write(repo, `${relativeOutput}/spike.json`, spike);
  const shell = readFileSync(
    path.join(repo, 'scripts/run-relay-builders.mjs'),
    'utf8',
  ).match(/const SHELL = `([\s\S]*?)`;\n/)[1];
  const sourceFiles = [
    ...policy.templateFiles.map((file) => ({
      path: file,
      sha256: sha256(readFileSync(path.join(repo, policy.templateRoot, file))),
    })),
    { path: 'src/App.jsx', sha256: sha256(shell) },
  ];
  const templateSourceIdentity = sha256(JSON.stringify(sourceFiles));
  const shellReceipt = (platform, width, presses) => ({
    synthetic: true,
    platform,
    provider: platform === 'web' ? 'browser' : platform,
    phase: 'template-shell',
    sourceIdentity: templateSourceIdentity,
    presses,
    viewport: { width, height: 1000, scale: 1 },
    boxes: { 'shell-button': box(160, 48), 'shell-root': box(width, 1000) },
  });
  const template = {
    synthetic: true,
    version: 1,
    kind: 'independent-builder-template-smoke',
    complete: true,
    errors: [],
    sourceIdentity: templateSourceIdentity,
    shellSourceIdentity: sha256(shell),
    sourceFiles,
    checks: checks(8),
    web: ['chromium', 'webkit'].flatMap((browser) =>
      [390, 820, 1440].map((width) => ({
        browser,
        width,
        receipt: shellReceipt('web', width, 1),
      })),
    ),
    native: ['native-ios', 'native-android'].map((platform) => ({
      platform,
      before: shellReceipt(platform, 390, 0),
      after: shellReceipt(platform, 390, 1),
    })),
  };
  const templatePath = write(repo, `${relativeOutput}/template.json`, template);
  const reference = (file) => ({
    path: file,
    sha256: sha256(readFileSync(file)),
  });
  return {
    envelope: {
      version: 1,
      kind: 'relay-platform-gate',
      spike: reference(spikePath),
      template: reference(templatePath),
    },
    spikePath,
    templatePath,
    artifactPaths,
  };
}
