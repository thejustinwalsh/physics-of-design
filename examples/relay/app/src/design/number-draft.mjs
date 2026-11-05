/** Editable decimal drafts remain separate from committed finite parameters. */
export function parseNumberDraft(text, { min, max }) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
    throw new RangeError('Invalid numeric control bounds');
  const input = text.trim();
  if (
    ['', '+', '-', '.', '+.', '-.'].includes(input) ||
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?$/.test(input)
  )
    return { status: 'incomplete' };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input))
    return { status: 'invalid', reason: 'Enter a decimal number.' };
  const value = Number(input);
  if (!Number.isFinite(value) || value < min || value > max)
    return {
      status: 'invalid',
      reason: `Enter a number from ${min} to ${max}.`,
    };
  return { status: 'valid', value };
}
