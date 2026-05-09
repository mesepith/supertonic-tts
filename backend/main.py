"""FastAPI app for Supertonic TTS."""
from __future__ import annotations

import base64
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from text_split import DEFAULT_MIN_LEN, split_by_punctuation
from tts_engine import GENDERS, VOICE_SLOTS, SynthRequest, _load_fixes_if_changed, engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("supertonic-api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("Starting up — loading model…")
    engine.load()
    log.info("Startup complete.")
    yield
    log.info("Shutting down.")


app = FastAPI(
    title="Supertonic TTS API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    description=(
        "Self-hosted text-to-speech using Supertone's Supertonic-3 ONNX model.\n\n"
        "**Endpoints:**\n"
        "- `GET /api/health` — service / model status\n"
        "- `GET /api/voices` — list available voices, genders, and languages\n"
        "- `GET /api/pronunciation-fixes` — current per-language replacement rules\n"
        "- `POST /api/tts` — synthesize whole text → single WAV\n"
        "- `POST /api/tts/stream` — split text on punctuation, stream one WAV per "
        "chunk as NDJSON (one JSON object per line)\n\n"
        "Use `/api/tts/stream` for any text longer than one short sentence — the "
        "model rushes when given a full paragraph at once."
    ),
    lifespan=lifespan,
)

_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TTSRequestBody(BaseModel):
    text: str = Field(min_length=1, max_length=5000, description="Input text. Up to 5000 chars.")
    gender: str = Field(pattern="^[MF]$", description="`M` (male) or `F` (female).")
    voice: str = Field(pattern="^[1-5]$", description="Voice slot `1`–`5` within the gender.")
    language: str = Field(min_length=2, max_length=3, description="ISO code, e.g. `en`, `hi`, `ja`. See `/api/voices`.")
    speed: float = Field(default=1.05, ge=0.5, le=2.0, description="Playback speed multiplier.")
    total_steps: int = Field(default=5, ge=1, le=20, description="Diffusion steps. 5 is plenty.")

    model_config = {
        "json_schema_extra": {
            "example": {
                "text": "Hello there, this is a test of Supertonic.",
                "gender": "F",
                "voice": "1",
                "language": "en",
                "speed": 1.05,
                "total_steps": 5,
            }
        }
    }


class TTSStreamRequestBody(TTSRequestBody):
    min_chunk_len: int = Field(
        default=DEFAULT_MIN_LEN, ge=10, le=500,
        description="Minimum chars before a soft-split (`,`) is honored. Sentence terminators (`. ! ? ।`) always split.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "text": "एक दिन तेज़ आँधी आई। गाँव के कई पेड़ टूट गए, लेकिन एक छोटा पेड़ बच गया।",
                "gender": "M",
                "voice": "2",
                "language": "hi",
                "speed": 1.05,
                "total_steps": 5,
                "min_chunk_len": 30,
            }
        }
    }


@app.get("/api/health", summary="Service health + loaded model name", tags=["status"])
async def health():
    return {
        "status": "ok" if engine.ready else "loading",
        "model": engine.model_name,
    }


_LANG_LABELS = {
    "en": "English", "ko": "Korean", "ja": "Japanese", "ar": "Arabic",
    "bg": "Bulgarian", "cs": "Czech", "da": "Danish", "de": "German",
    "el": "Greek", "es": "Spanish", "et": "Estonian", "fi": "Finnish",
    "fr": "French", "hi": "Hindi", "hr": "Croatian", "hu": "Hungarian",
    "id": "Indonesian", "it": "Italian", "lt": "Lithuanian", "lv": "Latvian",
    "nl": "Dutch", "pl": "Polish", "pt": "Portuguese", "ro": "Romanian",
    "ru": "Russian", "sk": "Slovak", "sl": "Slovenian", "sv": "Swedish",
    "tr": "Turkish", "uk": "Ukrainian", "vi": "Vietnamese",
}


@app.get("/api/pronunciation-fixes", summary="Active per-language replacement rules", tags=["status"])
async def pronunciation_fixes():
    """Inspect currently-active pronunciation rules. Force a reload by hitting
    this endpoint after editing pronunciation_fixes.json — the file is also
    auto-reloaded on every synthesis request."""
    fixes = _load_fixes_if_changed()
    return {
        lang: [{"from": s, "to": d} for s, d in rules]
        for lang, rules in fixes.items()
    }


@app.get("/api/voices", summary="List available genders, voice slots, and languages", tags=["status"])
async def voices():
    return {
        "genders": [{"code": g, "label": "Male" if g == "M" else "Female"} for g in GENDERS],
        "voices": list(VOICE_SLOTS),
        "languages": [
            {"code": code, "label": _LANG_LABELS.get(code, code.upper())}
            for code in engine.supported_languages()
        ],
    }


@app.post(
    "/api/tts",
    summary="Synthesize whole text → single WAV",
    description=(
        "Returns a complete WAV (44.1 kHz / 16-bit / mono) for the entire input text. "
        "Best for short text (≤ 1 sentence). For longer text use `/api/tts/stream` — "
        "the model rushes when given a paragraph at once."
    ),
    responses={200: {"content": {"audio/wav": {}}, "description": "WAV audio bytes"}},
    response_class=Response,
    tags=["synthesis"],
)
async def tts(body: TTSRequestBody):
    if not engine.ready:
        raise HTTPException(status_code=503, detail="Model still loading")
    voice_name = f"{body.gender}{body.voice}"
    try:
        wav_bytes = await engine.synthesize_wav_bytes(SynthRequest(
            text=body.text,
            voice_name=voice_name,
            lang=body.language,
            speed=body.speed,
            total_steps=body.total_steps,
        ))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="supertonic.wav"'},
    )


@app.post(
    "/api/tts/stream",
    summary="Chunked synthesis — NDJSON streaming",
    description=(
        "Splits the text on punctuation server-side, synthesizes each chunk, and "
        "streams **one JSON object per line** as each chunk completes.\n\n"
        "Each line is one of:\n\n"
        "```json\n"
        '{"index":0,"total":3,"text":"...","audio_b64":"UklGRi…","sample_rate":44100,"format":"wav"}\n'
        '{"index":1,"total":3,"text":"...","error":"<message>"}\n'
        "```\n\n"
        "`audio_b64` decodes to a complete standalone WAV (44.1 kHz / 16-bit / mono) "
        "for that chunk — `base64.b64decode` and play immediately. Failures on a "
        "single chunk do **not** abort the stream.\n\n"
        "Use `curl -N` (no buffering) to consume line-by-line."
    ),
    responses={
        200: {
            "content": {
                "application/x-ndjson": {
                    "example": (
                        '{"index":0,"total":2,"text":"Hello there.","audio_b64":"UklGRi…","sample_rate":44100,"format":"wav"}\n'
                        '{"index":1,"total":2,"text":"Second sentence.","audio_b64":"UklGRi…","sample_rate":44100,"format":"wav"}\n'
                    )
                }
            },
            "description": "NDJSON stream — one JSON object per line per chunk.",
        }
    },
    tags=["synthesis"],
)
async def tts_stream(body: TTSStreamRequestBody):
    if not engine.ready:
        raise HTTPException(status_code=503, detail="Model still loading")
    voice_name = f"{body.gender}{body.voice}"
    chunks = split_by_punctuation(body.text, min_len=body.min_chunk_len)
    if not chunks:
        raise HTTPException(status_code=400, detail="Text produced no speakable chunks")
    total = len(chunks)

    async def gen():
        for idx, chunk_text in enumerate(chunks):
            base = {"index": idx, "total": total, "text": chunk_text}
            try:
                wav_bytes = await engine.synthesize_wav_bytes(SynthRequest(
                    text=chunk_text,
                    voice_name=voice_name,
                    lang=body.language,
                    speed=body.speed,
                    total_steps=body.total_steps,
                ))
                payload = {
                    **base,
                    "audio_b64": base64.b64encode(wav_bytes).decode("ascii"),
                    "sample_rate": 44100,
                    "format": "wav",
                }
            except Exception as e:
                log.exception("stream chunk %d failed", idx)
                payload = {**base, "error": str(e)}
            yield json.dumps(payload, ensure_ascii=False) + "\n"

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
    )
