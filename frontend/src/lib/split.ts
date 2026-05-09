// Split a long text into speakable chunks for streaming playback.
//
// HARD splits: . ! ? । — sentence terminators. Always split here, even when
//   the resulting chunk is short. Two complete sentences merged into one
//   chunk make the model rush or skip words, so we never merge across them.
// SOFT splits: , — only split if the chunk is already at least `minLen`
//   chars; otherwise keep accumulating so we don't fragment a clause too
//   finely.
// Trailing closing marks — ”’"')]}»› — are greedily attached so we never
// start the next chunk with a stray quote/bracket (which the model would
// otherwise vocalize as a tiny click/blip). Any tiny tail (< minLen chars
// without terminator) is merged into the previous segment.

const HARD_PUNCT_RE = /[.!?।]/;
const SOFT_PUNCT_RE = /[,]/;
const CLOSER_RE = /[”’’"')\]}»›]/;
const MIN_CHUNK_LEN = 30;

export function splitByPunctuation(text: string, minLen = MIN_CHUNK_LEN): string[] {
  const segments: string[] = [];
  let buffer = "";
  let i = 0;

  while (i < text.length) {
    buffer += text[i];
    const isHard = HARD_PUNCT_RE.test(text[i]);
    const isSoft = SOFT_PUNCT_RE.test(text[i]);
    if (isHard || isSoft) {
      while (i + 1 < text.length && CLOSER_RE.test(text[i + 1])) {
        i++;
        buffer += text[i];
      }
      const trimmed = buffer.trim();
      if (isHard || trimmed.length >= minLen) {
        segments.push(trimmed);
        buffer = "";
      }
    }
    i++;
  }

  const tail = buffer.trim();
  if (tail) {
    if (segments.length && tail.length < minLen) {
      segments[segments.length - 1] += " " + tail;
    } else {
      segments.push(tail);
    }
  }

  return segments;
}
