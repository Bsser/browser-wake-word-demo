# Wake word model guide

## Swap to another pre-trained word
Add an `<option>` in `index.html` that points at the `.onnx` file. openWakeWord publishes more models on its releases page. Any model that takes `[1, 16, 96]` embeddings and returns one score works. The code reads the input and output names from the model itself.

## Train your own word (for example "Hey Acme")
1. Open openWakeWord's automatic training notebook (`notebooks/automatic_model_training.ipynb` in github.com/dscripka/openWakeWord). It runs on a free Google Colab GPU.
2. Set `target_phrase` to your phrase. The notebook makes thousands of synthetic voice clips with TTS, mixes in noise and room reverb, and trains a small model in about an hour.
3. Export to ONNX. You get a file like `hey_acme.onnx` that is a few hundred KB.
4. Copy it to `models/` and add it to the list, or test it right away with **Load your own model**.

A model you train yourself is yours to use commercially.

## Tuning
| Setting | Where | Notes |
|---|---|---|
| Threshold | slider (default 0.5) | Raise it if you get false triggers, lower it if the word is missed. 0.5–0.7 is typical. |
| Silence timeout | slider (default 800 ms) | How long a pause ends the command. |
| Pre-roll | slider (default 500 ms) | Audio kept from before the detection. Use 1000+ if the clip must include the whole wake word. |
| VAD sensitivity | `app.js`, `noise * 3` | Ratio over the tracked noise floor that counts as speech. |
| Re-trigger cooldown | `app.js`, `1500` ms | Stops the same utterance from firing twice. |

## Accuracy tips
- Real recordings of your users saying the phrase, added as positive examples to the training, help more than anything else.
- Keep the browser's `noiseSuppression` and `echoCancellation` on. They are already on in `getUserMedia`.
- To check false triggers, leave the page listening to an hour of TV or podcasts and count the detections.
