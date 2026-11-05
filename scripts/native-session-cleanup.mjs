/** Best-effort independent cleanup of only resources acquired by this session.
 * Failure of one operation must not prevent attempts on the remaining resources.
 */
export async function cleanupAndroidResources({
  launched, reverseOwned, reverseBefore, run, queryApp,
}) {
  const errors = [];
  const attempt = async (name, operation) => {
    try { await operation(); }
    catch (error) { errors.push(`${name}: ${String(error)}`); }
  };
  if (launched) {
    await attempt('stop-owned-app', () => run(['shell', 'am', 'force-stop', 'host.exp.exponent']));
    await attempt('verify-owned-app-absent', async () => {
      const state = await queryApp();
      if (state.pids.length) throw Error('Owned Android app remains live');
    });
  }
  for (const port of reverseOwned)
    await attempt(`remove-owned-reverse-${port}`, () => run(['reverse', '--remove', `tcp:${port}`]));
  if (reverseBefore !== null) {
    await attempt('verify-reverse-restoration', async () => {
      const after = (await run(['reverse', '--list'])).stdout.trim().split('\n').filter(Boolean).sort();
      if (JSON.stringify(after) !== JSON.stringify(reverseBefore))
        throw Error('Reverse mappings were not restored');
    });
  }
  return errors;
}
