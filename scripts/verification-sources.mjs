import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const roots = [
  'src',
  'scripts',
  'test',
  'codemods',
  'native',
  'examples',
  'experiments',
  'assets',
  'fonts',
  '.agents/skills/design-theory',
];
const rootFiles = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'AGENTS.md',
  'physics_of_design_white_paper.md',
]);
const generatedDirectories = new Set([
  'node_modules',
  'dist',
  '.expo',
  'runtime',
  '__pycache__',
  '.git',
  '.venv',
  'artifacts',
  'build',
  'web-build',
  'Pods',
  '.gradle',
  '.cxx',
  '.cache',
  'coverage',
  'test-results',
  'playwright-report',
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// One predicate serves the working checkout, published Git tree and receipt validator.
// Generated JSON consumed as source (for example Vela's design) remains included.
export function isVerificationSource(file) {
  if (
    typeof file !== 'string' ||
    !file ||
    file.includes('\\') ||
    file.startsWith('/')
  )
    return false;
  const parts = file.split('/');
  if (
    parts.some((p) => !p || p === '.' || p === '..') ||
    parts.some((p) => generatedDirectories.has(p))
  )
    return false;
  if (
    parts.at(-1) === '.DS_Store' ||
    file.endsWith('.tsbuildinfo') ||
    file.endsWith('.pyc')
  )
    return false;
  return (
    rootFiles.has(file) || roots.some((root) => file.startsWith(root + '/'))
  );
}

export function verificationSourcesFromFiles(files, read) {
  const selected = files
    .filter((file) => isVerificationSource(file.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const records = selected.map((file) => {
    assert.ok(
      ['100644', '100755'].includes(file.mode),
      `Verification source must be a regular file: ${file.path}`,
    );
    const bytes = read(file.path);
    return {
      path: file.path,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      mode: file.mode,
    };
  });
  assertVerificationSourceRecords(records);
  return records;
}

export function snapshotVerificationSources(repo = process.cwd()) {
  repo = realpathSync(repo);
  const tracked = execFileSync(
    'git',
    [
      '-C',
      repo,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const files = [];
  for (const file of new Set(
    tracked.split('\0').filter(isVerificationSource),
  )) {
    const absolute = path.join(repo, file);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink(),
      `Verification source must be a regular file: ${file}`,
    );
    assert.ok(
      realpathSync(absolute).startsWith(repo + path.sep),
      `Verification source escapes repository: ${file}`,
    );
    files.push({ path: file, mode: stat.mode & 0o111 ? '100755' : '100644' });
  }
  return verificationSourcesFromFiles(files, (file) =>
    readFileSync(path.join(repo, file)),
  );
}

export function assertVerificationSourceRecords(records) {
  assert.ok(
    Array.isArray(records) && records.length > 0,
    'Verification source snapshot is empty or missing',
  );
  let previous = '';
  for (const record of records) {
    assert.ok(
      record && isVerificationSource(record.path) && record.path > previous,
      'Verification sources must use the exact scope and unique sorted paths',
    );
    assert.deepEqual(Object.keys(record).sort(), [
      'byteLength',
      'mode',
      'path',
      'sha256',
    ]);
    assert.ok(
      Number.isSafeInteger(record.byteLength) &&
        record.byteLength >= 0 &&
        /^[a-f0-9]{64}$/.test(record.sha256) &&
        ['100644', '100755'].includes(record.mode),
      `Malformed verification source: ${record.path}`,
    );
    previous = record.path;
  }
}

export function verificationSourceIdentity(records) {
  assertVerificationSourceRecords(records);
  return sha256(
    JSON.stringify(
      records.map(({ path, byteLength, sha256, mode }) => ({
        path,
        byteLength,
        sha256,
        mode,
      })),
    ),
  );
}

export function verificationSourceFields(before, after = null, error = null) {
  const sourceIdentity = verificationSourceIdentity(before);
  const sourceIdentityAfter =
    after === null ? null : verificationSourceIdentity(after);
  return {
    sourceSnapshotVersion: 1,
    sources: before,
    sourceIdentity,
    sourcesAfter: after,
    sourceIdentityAfter,
    sourceStable: error
      ? false
      : after === null
        ? null
        : sourceIdentity === sourceIdentityAfter,
    sourceSnapshotError: error,
  };
}

export function assertVerificationSourceSnapshot(summary) {
  assert.equal(
    summary?.sourceSnapshotVersion,
    1,
    'Current source snapshot version required',
  );
  assert.equal(
    summary.sourceStable,
    true,
    'Verification source changed during the ordered lane',
  );
  assert.equal(
    summary.sourceSnapshotError,
    null,
    'Verification source snapshot failed',
  );
  assert.equal(
    summary.sourceIdentity,
    verificationSourceIdentity(summary.sources),
  );
  assert.equal(
    summary.sourceIdentityAfter,
    verificationSourceIdentity(summary.sourcesAfter),
  );
  assert.deepEqual(
    summary.sourcesAfter,
    summary.sources,
    'Verification source sets differ',
  );
  assert.equal(summary.sourceIdentityAfter, summary.sourceIdentity);
}
