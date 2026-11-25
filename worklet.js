// Runs on the audio thread: takes the microphone at the device rate (44.1/48 kHz), averages it down to
// 16 kHz and posts 1280-sample (80 ms) chunks. Resampling here, not with AudioContext({sampleRate}),
// because Firefox refuses to connect a microphone to a context with a different sample rate.
class Downsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0; this.n = 0; this.pos = 0;
    this.out = new Float32Array(1280); this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.n++; this.pos++;
      if (this.pos >= this.ratio) {            // one 16 kHz sample = the mean of the inputs it covers
        this.pos -= this.ratio;
        this.out[this.len++] = this.acc / this.n;
        this.acc = 0; this.n = 0;
        if (this.len === 1280) { this.port.postMessage(this.out.slice()); this.len = 0; }
      }
    }
    return true;
  }
}
registerProcessor('downsampler', Downsampler);
