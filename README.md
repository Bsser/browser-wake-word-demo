# Browser Wake Word Recorder

Live demo: **https://bsser.github.io/browser-wake-word-demo/**

Say a wake word, then a command. The page hears the wake word, records what you say next, stops when you go quiet, and uploads the clip as a WAV file. It all runs in the browser: no plugins, no cloud speech service, and no audio leaves the page unless you set an upload endpoint.

## How it works

```
mic ─► AudioWorklet (resample to 16 kHz, 80 ms chunks)
     ─► openWakeWord: melspectrogram.onnx ─► embedding_model.onnx ─► <word>.onnx   (ONNX Runtime Web, WebAssembly)
     ─► score ≥ threshold ─► record (with pre-roll) ─► stop after N ms of silence ─► 16-bit PCM WAV ─► POST to your endpoint
```

- **Detection**: a few ms of model time per 80 ms chunk on a normal laptop, so the wake word fires while it is still being said.
- **Recording**: keeps a short pre-roll buffer so the first syllable of the command is not lost. An energy VAD tracks the room's noise floor and ends the clip after the silence timeout (default 800 ms). There is also a 15 s cap, and a 3 s timeout if nobody speaks after the wake word.
- **Upload**: `POST <endpoint>` with `Content-Type: audio/wav` and the raw WAV as the body (16 kHz, mono, 16-bit).
- **Test without a microphone**: plays `samples/hey-jarvis-test.wav` through the same pipeline, chunk by chunk.

Tested on current Chrome, Edge and Firefox on desktop. The microphone needs HTTPS or `localhost`.

## Run it locally

```bash
# 1. the page (any static server works)
python -m http.server 8000          # open http://localhost:8000

# 2. the receiver (optional)
cd server && npm install && npm start      # http://localhost:3000/upload, saves to server/clips/
#   or:  pip install flask && python server.py
```

Put `http://localhost:3000/upload` in the **Upload endpoint** box. Each command then shows up in `server/clips/`.

## Files

| File | What it does |
|---|---|
| `index.html` | The page and its controls |
| `app.js` | Microphone, recording, silence cut, WAV encoding, upload |
| `oww.js` | openWakeWord streaming pipeline (mel → embedding → word model) |
| `worklet.js` | Audio-thread resampler to 16 kHz, 1280-sample chunks |
| `models/` | openWakeWord v0.5.1 models |
| `vendor/` | onnxruntime-web 1.20.1 (served with the page, so there is no CDN dependency) |
| `server/` | Example receivers: Node/Express and Python/Flask |

## Your own wake word

See [MODEL-GUIDE.md](MODEL-GUIDE.md). In short, you train a model for your phrase with openWakeWord's training notebook, then drop the `.onnx` into `models/` or load it with the **Load your own model** button. Nothing else changes.

## Licenses

- Code in this repo: MIT.
- `melspectrogram.onnx` and `embedding_model.onnx`: Apache-2.0 (openWakeWord, based on Google's speech embedding model).
- `hey_jarvis`, `alexa` and `hey_mycroft` word models: CC BY-NC-SA 4.0, by David Scripka / openWakeWord. They are fine for demos and testing. For a commercial product, train your own word model (see the guide).
- onnxruntime-web: MIT (Microsoft).
