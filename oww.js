// openWakeWord in the browser (ONNX Runtime Web). Same streaming math as the Python package:
// 80 ms chunks of 16 kHz audio -> 8 mel frames (with 480 samples of context) -> one 96-d embedding
// from the last 76 mel frames -> the wake-word model scores the last 16 embeddings (~1.3 s of audio).
export const CHUNK = 1280;            // 80 ms at 16 kHz
const CONTEXT = 480;                  // 3 x 160-sample hops of history the mel model needs
const MEL_WINDOW = 76, EMB_WINDOW = 16;

export class WakeWord {
  static async load(base, wordUrl) {
    const opt = {executionProviders: ['wasm']};
    const [mel, emb, word] = await Promise.all([
      ort.InferenceSession.create(base + 'melspectrogram.onnx', opt),
      ort.InferenceSession.create(base + 'embedding_model.onnx', opt),
      ort.InferenceSession.create(wordUrl, opt)]);
    return new WakeWord(mel, emb, word);
  }
  constructor(mel, emb, word) { this.mel = mel; this.emb = emb; this.word = word; this.reset(); }
  async setWord(url) { this.word = await ort.InferenceSession.create(url, {executionProviders: ['wasm']}); this.reset(); }
  reset() {
    this.raw = new Float32Array(CHUNK + CONTEXT);               // int16-scaled samples, newest at the end
    this.mels = Array.from({length: MEL_WINDOW}, () => new Float32Array(32).fill(1));  // Python starts with ones
    this.embs = [];
  }
  // chunk: Float32Array(1280) in [-1, 1]. Returns the wake-word score (0..1), or 0 while the buffers fill.
  async process(chunk) {
    this.raw.copyWithin(0, CHUNK);
    for (let i = 0; i < CHUNK; i++) this.raw[CONTEXT + i] = Math.max(-32768, Math.min(32767, chunk[i] * 32768));
    const m = await this.mel.run({[this.mel.inputNames[0]]: new ort.Tensor('float32', this.raw.slice(), [1, this.raw.length])});
    const md = m[this.mel.outputNames[0]].data, frames = md.length / 32;
    for (let f = 0; f < frames; f++) this.mels.push(md.slice(f * 32, f * 32 + 32).map(v => v / 10 + 2));
    if (this.mels.length > 200) this.mels.splice(0, this.mels.length - 200);
    const win = new Float32Array(MEL_WINDOW * 32);
    this.mels.slice(-MEL_WINDOW).forEach((row, i) => win.set(row, i * 32));
    const e = await this.emb.run({[this.emb.inputNames[0]]: new ort.Tensor('float32', win, [1, MEL_WINDOW, 32, 1])});
    this.embs.push(e[this.emb.outputNames[0]].data.slice());
    if (this.embs.length > EMB_WINDOW) this.embs.shift();
    if (this.embs.length < EMB_WINDOW) return 0;
    const x = new Float32Array(EMB_WINDOW * 96);
    this.embs.forEach((v, i) => x.set(v, i * 96));
    const s = await this.word.run({[this.word.inputNames[0]]: new ort.Tensor('float32', x, [1, EMB_WINDOW, 96])});
    return s[this.word.outputNames[0]].data[0];
  }
}
