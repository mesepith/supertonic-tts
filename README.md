# Supertonic TTS

Self-hosted text-to-speech using Supertone's open Supertonic-3 model. FastAPI backend wraps the ONNX model; React + Vite + Tailwind frontend served by Apache. Designed for `https://supertonic-tts.zahiralam.com`.

- **Engine**: `supertonic` 1.2.0 (ONNX Runtime, CPU). 99M params, 16-bit / 44.1 kHz mono WAV.
- **Voices**: M1–M5, F1–F5 (5 male, 5 female).
- **Languages**: 31 (en, ko, ja, ar, bg, cs, da, de, el, es, et, fi, fr, hi, hr, hu, id, it, lt, lv, nl, pl, pt, ro, ru, sk, sl, sv, tr, uk, vi).
- **Expression tags** in text: `<laugh>`, `<breath>`, `<sigh>`.

## Layout

```
supertonic-tts/
├── backend/                 FastAPI + Supertonic engine
│   ├── main.py              REST API
│   ├── tts_engine.py        Model wrapper (single-flight, cached styles)
│   └── requirements.txt
├── frontend/                React + Vite + Tailwind
│   ├── src/                 App.tsx, components/, lib/
│   └── package.json
└── deploy/
    ├── setup-server.sh      one-time Ubuntu bootstrap
    ├── deploy.sh            build + restart on server
    ├── apache-vhost.conf    reverse proxy + SPA fallback
    └── supertonic-tts.service   systemd unit
```

## Local development (Mac)

```bash
# Backend
python3 -m venv .supertonic-venv
source .supertonic-venv/bin/activate
pip install -r backend/requirements.txt
(cd backend && uvicorn main:app --reload --port 8000)
# First run downloads ~400 MB of ONNX assets to ~/.cache/supertonic3

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173 — proxies /api → 8000
```

## API

Base URL: `https://supertonic-tts.zahiralam.com` (or `http://127.0.0.1:8000` locally). Interactive Swagger at `/docs`.

| Method | Path          | Body / Response |
|--------|---------------|------------------|
| GET    | `/api/health` | `{ status, model }` |
| GET    | `/api/voices` | `{ genders, voices, languages }` |
| POST   | `/api/tts`    | request below → `audio/wav` |

```json
POST /api/tts
{
  "text": "Hello, world.",
  "gender": "F",
  "voice": "1",
  "language": "en",
  "speed": 1.05,
  "total_steps": 5
}
```

`gender` ∈ `{"M","F"}`, `voice` ∈ `{"1".."5"}`, `language` is one of the 31 codes above.
`speed` 0.5–2.0, `total_steps` 1–20 (5 is plenty; higher does NOT meaningfully improve quality).

```bash
curl -X POST https://supertonic-tts.zahiralam.com/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello there.","gender":"F","voice":"1","language":"en"}' \
  --output out.wav
```

## Server deployment (Ubuntu 24.04 + Apache)

DNS: point `supertonic-tts.zahiralam.com` (A record) at the server **before** running certbot.

```bash
# On your Mac
rsync -avz --exclude='.supertonic-venv' --exclude='node_modules' \
           --exclude='frontend/dist' --exclude='*.wav' \
           ./ root@<server>:/var/www/supertonic-tts/

# On the server (one time)
ssh root@<server>
cd /var/www/supertonic-tts
bash deploy/setup-server.sh        # installs deps, vhost, systemd unit
bash deploy/deploy.sh              # builds frontend, installs python deps
certbot --apache -d supertonic-tts.zahiralam.com
systemctl enable --now supertonic-tts
journalctl -u supertonic-tts -f    # watch the first model download (~400 MB)
```

For subsequent updates: `rsync` + `bash deploy/deploy.sh`.

## Notes

- Model loads **once** at startup into a single uvicorn worker. Concurrent `/api/tts` requests are serialized via an in-process lock (the ONNX session isn't thread-safe). On a 2-vCPU box this is the right setting — adding workers means N copies of the 400 MB model, and the bottleneck is CPU not request handling.
- For higher concurrency later: front the API with a small queue (FastAPI BackgroundTasks for fire-and-forget, or Celery + Redis for proper job control).
- Quality is set by the model. The defaults in this repo (`speed=1.05`, `total_steps=5`) match Supertonic's reference settings.
- Apple Silicon dev / x86_64 prod both work — ONNX Runtime ships wheels for both.
