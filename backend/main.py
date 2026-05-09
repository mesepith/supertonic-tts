"""FastAPI app for Supertonic TTS."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

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


app = FastAPI(title="Supertonic TTS API", version="1.0.0", lifespan=lifespan)

_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TTSRequestBody(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    gender: str = Field(pattern="^[MF]$")
    voice: str = Field(pattern="^[1-5]$")
    language: str = Field(min_length=2, max_length=3)
    speed: float = Field(default=1.05, ge=0.5, le=2.0)
    total_steps: int = Field(default=5, ge=1, le=20)


@app.get("/api/health")
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


@app.get("/api/pronunciation-fixes")
async def pronunciation_fixes():
    """Inspect currently-active pronunciation rules. Force a reload by hitting
    this endpoint after editing pronunciation_fixes.json — the file is also
    auto-reloaded on every synthesis request."""
    fixes = _load_fixes_if_changed()
    return {
        lang: [{"from": s, "to": d} for s, d in rules]
        for lang, rules in fixes.items()
    }


@app.get("/api/voices")
async def voices():
    return {
        "genders": [{"code": g, "label": "Male" if g == "M" else "Female"} for g in GENDERS],
        "voices": list(VOICE_SLOTS),
        "languages": [
            {"code": code, "label": _LANG_LABELS.get(code, code.upper())}
            for code in engine.supported_languages()
        ],
    }


@app.post("/api/tts")
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
