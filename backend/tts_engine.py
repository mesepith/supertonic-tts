"""Supertonic engine wrapper: loads the model once, exposes a thread-safe synth call."""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
from supertonic import TTS, AVAILABLE_LANGUAGES, SUPPORTED_LANGUAGES

logger = logging.getLogger(__name__)

GENDERS = ("M", "F")
VOICE_SLOTS = ("1", "2", "3", "4", "5")
VOICE_NAMES = tuple(f"{g}{n}" for g in GENDERS for n in VOICE_SLOTS)
SAMPLE_RATE = 44100  # supertonic-3 default; verified at startup

# Per-language pronunciation fixes are loaded from pronunciation_fixes.json
# and hot-reloaded on file modification. See that file's _README key for the
# format and how to add rules.
_FIXES_PATH = Path(__file__).parent / "pronunciation_fixes.json"
_fixes_lock = threading.Lock()
_fixes_cache: dict[str, list[tuple[str, str]]] = {}
_fixes_mtime: float = 0.0


def _load_fixes_if_changed() -> dict[str, list[tuple[str, str]]]:
    global _fixes_cache, _fixes_mtime
    with _fixes_lock:
        try:
            mtime = _FIXES_PATH.stat().st_mtime
        except FileNotFoundError:
            return _fixes_cache
        if mtime == _fixes_mtime:
            return _fixes_cache
        try:
            with _FIXES_PATH.open(encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.error("Failed to parse %s: %s", _FIXES_PATH, e)
            return _fixes_cache
        new_cache: dict[str, list[tuple[str, str]]] = {}
        for lang, rules in data.items():
            if lang.startswith("_") or not isinstance(rules, list):
                continue
            entries = [(r["from"], r["to"]) for r in rules
                       if isinstance(r, dict) and "from" in r and "to" in r]
            if entries:
                new_cache[lang] = entries
        _fixes_cache = new_cache
        _fixes_mtime = mtime
        total = sum(len(v) for v in new_cache.values())
        logger.info("Loaded %d pronunciation rules across %d languages from %s",
                    total, len(new_cache), _FIXES_PATH.name)
        return _fixes_cache


def _apply_pronunciation_fixes(text: str, lang: str) -> str:
    fixes = _load_fixes_if_changed().get(lang)
    if not fixes:
        return text
    for src, dst in fixes:
        text = text.replace(src, dst)
    return text


@dataclass(frozen=True)
class SynthRequest:
    text: str
    voice_name: str
    lang: str
    speed: float = 1.05
    total_steps: int = 5
    silence_duration: float = 0.3


class SupertonicEngine:
    def __init__(self, model: str = "supertonic-3", threads: Optional[int] = None):
        self._model_name = model
        self._threads = threads or max(1, (os.cpu_count() or 2))
        self._tts: Optional[TTS] = None
        self._styles: dict[str, object] = {}
        self._lock = threading.Lock()  # ONNX session is not safe under concurrent calls

    def load(self) -> None:
        logger.info("Loading Supertonic model=%s threads=%d", self._model_name, self._threads)
        self._tts = TTS(
            model=self._model_name,
            auto_download=True,
            intra_op_num_threads=self._threads,
            inter_op_num_threads=1,
        )
        for name in VOICE_NAMES:
            self._styles[name] = self._tts.get_voice_style(name)
        logger.info("Loaded %d voice styles: %s", len(self._styles), ", ".join(VOICE_NAMES))

    @property
    def ready(self) -> bool:
        return self._tts is not None

    @property
    def model_name(self) -> str:
        return self._model_name

    def supported_languages(self) -> list[str]:
        return list(SUPPORTED_LANGUAGES)

    def voice_names(self) -> list[str]:
        return list(VOICE_NAMES)

    def _synthesize_sync(self, req: SynthRequest) -> tuple[np.ndarray, int]:
        if self._tts is None:
            raise RuntimeError("Engine not loaded")
        if req.voice_name not in self._styles:
            raise ValueError(f"Unknown voice: {req.voice_name}")
        if req.lang not in AVAILABLE_LANGUAGES:
            raise ValueError(f"Unsupported language: {req.lang}")
        text = _apply_pronunciation_fixes(req.text, req.lang)
        with self._lock:
            wav, _dur = self._tts.synthesize(
                text,
                voice_style=self._styles[req.voice_name],
                lang=req.lang,
                speed=req.speed,
                total_steps=req.total_steps,
                silence_duration=req.silence_duration,
            )
        return wav, SAMPLE_RATE

    async def synthesize_wav_bytes(self, req: SynthRequest) -> bytes:
        loop = asyncio.get_running_loop()
        wav, sr = await loop.run_in_executor(None, self._synthesize_sync, req)
        return _to_wav_bytes(wav, sr)


def _to_wav_bytes(wav: np.ndarray, sample_rate: int) -> bytes:
    arr = wav.squeeze()
    if arr.dtype != np.int16:
        arr = np.clip(arr, -1.0, 1.0)
        arr = (arr * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(arr.tobytes())
    return buf.getvalue()


engine = SupertonicEngine()
