/** Join a separately styled terminal accent to its preceding word (Unicode U+2060).
 * Layout annotation only: full font scaling and natural wrapping remain enabled.
 * Call for the punctuation fragment, not for arbitrary prose or shaping/kerning.
 */
export function glueAccentPunctuation(punctuation = '.') {
  if (!/^[.!?…]$/u.test(punctuation))
    throw new Error('Expected one supported terminal punctuation character');
  return '\u2060' + punctuation;
}
