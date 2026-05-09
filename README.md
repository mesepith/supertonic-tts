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

Base URL: `https://supertonic-tts.zahiralam.com` (or `http://127.0.0.1:8000` locally).

### Interactive docs (Swagger UI)

Every endpoint below — including `/api/tts/stream` — is browsable, schema-typed, and **executable from the browser** at:

- **Local dev**: <http://127.0.0.1:8000/api/docs>
- **Production**: <https://supertonic-tts.zahiralam.com/api/docs>
- ReDoc alt view: `/api/redoc` on either host
- Raw OpenAPI JSON: `/api/openapi.json`

Open `/api/docs`, expand any route, click **Try it out**, paste your body, and hit **Execute** — Swagger fills the example bodies for you and shows the exact `curl` it ran. The streaming endpoint plays back full output in the browser too.

| Method | Path                     | Body / Response |
|--------|--------------------------|------------------|
| GET    | `/api/health`            | `{ status, model }` |
| GET    | `/api/voices`            | `{ genders, voices, languages }` |
| GET    | `/api/pronunciation-fixes` | active per-language replacement rules |
| POST   | `/api/tts`               | request below → `audio/wav` (whole text in one WAV) |
| POST   | `/api/tts/stream`        | request below → `application/x-ndjson` (one chunk per line, streamed) |

### Common request fields

```json
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

### `POST /api/tts` — single WAV

```bash
curl -X POST https://supertonic-tts.zahiralam.com/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello there.","gender":"F","voice":"1","language":"en"}' \
  --output out.wav
```

Use this for short text (≤ 1 sentence, ~200 chars). For longer text the model can rush or skip words — prefer `/api/tts/stream`.

### `POST /api/tts/stream` — chunked NDJSON

The server splits the text on sentence/clause punctuation (`. ! ? ।` always; `,` only if the buffer ≥ `min_chunk_len`), synthesizes each chunk, and streams **one JSON object per line** as each chunk completes. Clients can play audio progressively — first chunk arrives in ~0.2 s.

Request body adds one optional field on top of the common fields:

```json
{
  "text": "एक दिन तेज़ आँधी आई। गाँव के कई पेड़ टूट गए, लेकिन एक छोटा पेड़ बच गया।",
  "gender": "M",
  "voice": "2",
  "language": "hi",
  "min_chunk_len": 30
}
```

Each response line is one of:

```json
{"index":0,"total":3,"text":"एक दिन तेज़ आँधी आई।","audio_b64":"UklGRi…","sample_rate":44100,"format":"wav"}
{"index":1,"total":3,"text":"...", "error":"<message>"}
```

`audio_b64` is a complete standalone WAV file (44.1 kHz, 16-bit, mono) — `base64.b64decode` it and the bytes can be written straight to a `.wav` or fed to a player. Errors on a single chunk do **not** abort the stream; following chunks still attempt synthesis.

#### curl example (saves each chunk as `chunk-N.wav`)

```bash
curl -N -X POST https://supertonic-tts.zahiralam.com/api/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"एक दिन तेज़ आँधी आई। गाँव के कई पेड़ टूट गए।","gender":"M","voice":"2","language":"hi"}' \
| while IFS= read -r line; do
    idx=$(echo "$line" | python3 -c 'import sys,json;d=json.loads(sys.stdin.read());print(d["index"])')
    echo "$line" \
      | python3 -c 'import sys,json,base64;d=json.loads(sys.stdin.read()); open(f"chunk-{d[\"index\"]}.wav","wb").write(base64.b64decode(d["audio_b64"]))'
    echo "wrote chunk-$idx.wav"
  done
```

Note `curl -N` (`--no-buffer`) — required for line-by-line streaming.

#### Python example (play each chunk as it arrives)

```python
import base64, json, requests

with requests.post(
    "https://supertonic-tts.zahiralam.com/api/tts/stream",
    json={"text": "Long passage here. Second sentence. Third one too.",
          "gender": "F", "voice": "1", "language": "en"},
    stream=True,
    timeout=300,
) as r:
    r.raise_for_status()
    for line in r.iter_lines(decode_unicode=True):
        if not line:
            continue
        chunk = json.loads(line)
        if "error" in chunk:
            print(f"chunk {chunk['index']} failed: {chunk['error']}")
            continue
        wav = base64.b64decode(chunk["audio_b64"])
        with open(f"chunk-{chunk['index']}.wav", "wb") as f:
            f.write(wav)
        print(f"got chunk {chunk['index']+1}/{chunk['total']}: {chunk['text'][:40]}…")
```

#### JS / browser example

```js
const res = await fetch("/api/tts/stream", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({text: "...", gender: "F", voice: "1", language: "en"}),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const {value, done} = await reader.read();
  if (done) break;
  buf += decoder.decode(value, {stream: true});
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line) continue;
    const chunk = JSON.parse(line);
    if (chunk.error) { console.warn("chunk", chunk.index, "error:", chunk.error); continue; }
    const bytes = Uint8Array.from(atob(chunk.audio_b64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: "audio/wav"}));
    // queue url into your player...
  }
}
```

#### Notes on chunking

- Synthesis is **serial** server-side (single ONNX session, single lock). Streaming gives you fast time-to-first-audio, not parallelism.
- Total wall time ≈ same as `/api/tts` for the same text. The win is UX: playback starts on chunk 1.
- `min_chunk_len` (default 30) only affects soft-split (`,`). Sentence terminators (`. ! ? ।`) always split — that's intentional: merging two complete sentences into one synth call makes the model rush.

## Server deployment (Ubuntu 24.04 + Apache)

DNS: point `supertonic-tts.zahiralam.com` (A record) at the server **before** running certbot.

### First-time setup

```bash
# On the server
ssh root@<server>
mkdir -p /var/www/html/tts
git clone https://github.com/mesepith/supertonic-tts /var/www/html/tts/supertonic-tts
cd /var/www/html/tts/supertonic-tts

bash deploy/setup-server.sh        # installs deps, Apache vhost, systemd unit
bash deploy/deploy.sh              # builds frontend, installs Python deps, starts service
certbot --apache -d supertonic-tts.zahiralam.com
systemctl enable supertonic-tts
journalctl -u supertonic-tts -f    # watch startup — model loads from cache (~1s after first run)
```

### Updating after a code change

```bash
# On your Mac
git push

# On the server
cd /var/www/html/tts/supertonic-tts
git pull
bash deploy/deploy.sh
```

`deploy.sh` rebuilds the frontend, updates Python packages if `requirements.txt` changed, and restarts the service.

## Notes

- Model loads **once** at startup into a single uvicorn worker. Concurrent `/api/tts` requests are serialized via an in-process lock (the ONNX session isn't thread-safe). On a 2-vCPU box this is the right setting — adding workers means N copies of the 400 MB model, and the bottleneck is CPU not request handling.
- For higher concurrency later: front the API with a small queue (FastAPI BackgroundTasks for fire-and-forget, or Celery + Redis for proper job control).
- Quality is set by the model. The defaults in this repo (`speed=1.05`, `total_steps=5`) match Supertonic's reference settings.
- Apple Silicon dev / x86_64 prod both work — ONNX Runtime ships wheels for both.
