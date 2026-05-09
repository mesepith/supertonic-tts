"""Text splitter for streaming synthesis.

Mirrors frontend/src/lib/split.ts so the API and the web UI chunk identically.

HARD splits  . ! ? ।   — sentence terminators; always split, even short.
SOFT splits  ,         — split only when buffer has reached `min_len` chars.
Trailing closing marks ”’"')]}»› are greedily attached so we never start the
next chunk with a stray quote/bracket. Tiny tail (< min_len without
terminator) is merged into the previous segment.
"""
from __future__ import annotations

HARD_PUNCT = set(".!?।")
SOFT_PUNCT = set(",")
CLOSERS = set("”’’\"')]}»›")
DEFAULT_MIN_LEN = 30


def split_by_punctuation(text: str, min_len: int = DEFAULT_MIN_LEN) -> list[str]:
    segments: list[str] = []
    buffer: list[str] = []
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]
        buffer.append(ch)
        is_hard = ch in HARD_PUNCT
        is_soft = ch in SOFT_PUNCT
        if is_hard or is_soft:
            while i + 1 < n and text[i + 1] in CLOSERS:
                i += 1
                buffer.append(text[i])
            trimmed = "".join(buffer).strip()
            if is_hard or len(trimmed) >= min_len:
                segments.append(trimmed)
                buffer = []
        i += 1

    tail = "".join(buffer).strip()
    if tail:
        if segments and len(tail) < min_len:
            segments[-1] = segments[-1] + " " + tail
        else:
            segments.append(tail)

    return segments
