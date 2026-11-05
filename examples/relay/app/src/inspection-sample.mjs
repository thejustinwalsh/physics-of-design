/** Preserve the time of the last meaningful native inspection change.
 * Receipts are local JSON-shaped observations; time is not geometry or identity. */
function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}
export function preserveInspectionSample(previous, next) {
  if (!previous || !next) return next;
  const { observedAt: _oldTime, ...oldMeaning } = previous;
  const { observedAt: _newTime, ...newMeaning } = next;
  return sameValue(oldMeaning, newMeaning) ? previous : next;
}
