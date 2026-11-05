import { randomUUID } from 'node:crypto';

/** A fresh accessibility oracle, not an app-transition verifier.
 * The caller supplies its device-bound, recorded command runner. Never read XML
 * unless this invocation confirms the exact nonce path and a complete dump. */
export async function dumpAndroidAccessibility({
  run,
  cleanupRun = run,
  registerRemote = () => {},
  prefix = 'design',
}) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(prefix))
    throw new Error('Accessibility prefix must be a safe identifier');
  const remote = `/sdcard/${prefix}-${randomUUID()}.xml`;
  registerRemote(remote);
  let primary = null;
  try {
    await run('remove-before', ['shell', 'rm', '-f', remote], {
      timeout: 5000,
    });
    const dumped = await run('dump', ['shell', 'uiautomator', 'dump', remote], {
      timeout: 15000,
    });
    const output = `${dumped.stdout ?? ''}\n${dumped.stderr ?? ''}`;
    if (
      !/dumped to:/i.test(output) ||
      !output.includes(remote) ||
      /ERROR:/i.test(output)
    )
      throw new Error(
        `Fresh Android accessibility dump unavailable: ${output}`,
      );
    const { stdout: xml } = await run('read', ['exec-out', 'cat', remote], {
      timeout: 5000,
    });
    if (
      typeof xml !== 'string' ||
      !/^\s*(?:<\?xml[^?]*\?>)?\s*<hierarchy\b[^>]*>[\s\S]*<\/hierarchy>\s*$/.test(
        xml,
      )
    )
      throw new Error('Incomplete fresh Android accessibility XML');
    return { xml, remote, completion: output };
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    try {
      await cleanupRun('remove-after', ['shell', 'rm', '-f', remote], {
        timeout: 5000,
      });
    } catch (cleanupError) {
      if (primary)
        throw new AggregateError(
          [primary, cleanupError],
          'Accessibility capture failed and remote cleanup was unconfirmed',
        );
      throw cleanupError;
    }
  }
}

/** Require proof that the remote shell completed pidof; an ADB transport exit 1
 * is not evidence that an app is absent. Package names are allowlisted before shell interpolation. */
export async function queryAndroidProcessState({ run, packageName }) {
  if (!/^[A-Za-z][A-Za-z0-9_.]+$/.test(packageName))
    throw new Error('Unsafe Android package name');
  const script = `pidof '${packageName}'; result=$?; printf '\\nDESIGN_PIDOF_STATUS:%s\\n' "$result"`;
  const result = await run('app-process-state', ['shell', script], {
    timeout: 5000,
  });
  if (result.code !== undefined && result.code !== 0)
    throw new Error('Android process query transport did not complete');
  if (result.stderr?.trim())
    throw new Error('Android process query stderr: ' + result.stderr);
  const match = /^(.*?)\nDESIGN_PIDOF_STATUS:(0|1)\s*$/s.exec(
    result.stdout ?? '',
  );
  if (!match)
    throw new Error(
      'Android process query did not establish remote completion',
    );
  const values = match[1].trim();
  if (match[2] === '1' && values === '') return { pids: [], remoteStatus: 1 };
  if (match[2] === '0' && /^\d+(?:\s+\d+)*$/.test(values)) {
    const pids = values.split(/\s+/).map(Number);
    if (pids.every((pid) => Number.isSafeInteger(pid) && pid > 1))
      return { pids, remoteStatus: 0 };
  }
  throw new Error('Inconsistent Android process query result');
}
