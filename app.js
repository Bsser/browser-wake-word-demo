import {WakeWord, CHUNK} from './oww.js';

const ORT = new URL('vendor/', location.href).href;   // onnxruntime-web 1.20.1, served with the page
ort.env.wasm.wasmPaths = ORT;
ort.env.wasm.numThreads = 1;   // no cross-origin isolation needed: works on any plain HTTPS host

const $ = id => document.getElementById(id);
const cfg = () => ({
  threshold: +$('threshold').value, silenceMs: +$('silence').value, preRollMs: +$('preroll').value,
  maxMs: 15000, noSpeechMs: 3000, endpoint: $('endpoint').value.trim()});
const MS = CHUNK / 16;            // 80 ms per chunk

let ww, ctx, stream, node, state = 'idle', busy = Promise.resolve(), clips = 0;
let preroll = [], rec = null, noise = 0.003, cooldownUntil = 0, t0 = 0, played = 0;

function setState(s, text) { state = s; $('state').textContent = text; $('state').dataset.s = s; }
function rms(c) { let s = 0; for (const v of c) s += v * v; return Math.sqrt(s / c.length); }

// One 80 ms chunk through the pipeline. `at` = seconds into the stream (for the log).
async function feed(chunk, at) {
  const c = cfg();
  preroll.push(chunk);
  while (preroll.length * MS > c.preRollMs) preroll.shift();
  const level = rms(chunk);
  $('level').style.width = Math.min(100, level * 400) + '%';
  if (state === 'listening') {
    noise = 0.95 * noise + 0.05 * Math.min(level, noise * 2 + 0.001);   // slow noise-floor tracker
    const t = performance.now();
    const score = await ww.process(chunk);
    const ms = performance.now() - t;
    $('score').style.width = (score * 100) + '%';
    $('score').classList.toggle('hit', score >= c.threshold);
    $('infer').textContent = ms.toFixed(1) + ' ms';
    if (score >= c.threshold && performance.now() > cooldownUntil) {
      rec = {chunks: preroll.slice(), speech: false, quiet: 0, start: at, score, infer: ms};
      setState('recording', `Wake word heard (score ${score.toFixed(2)}) - recording…`);
      log(`Wake word at ${at.toFixed(2)} s, score ${score.toFixed(2)}, model ${ms.toFixed(1)} ms per 80 ms frame`);
    }
  } else if (state === 'recording') {
    rec.chunks.push(chunk);
    const speaking = level > Math.max(0.01, noise * 3);
    if (speaking) { rec.speech = true; rec.quiet = 0; } else rec.quiet += MS;
    const len = rec.chunks.length * MS;
    if ((rec.speech && rec.quiet >= c.silenceMs) || (!rec.speech && rec.quiet >= c.noSpeechMs) || len >= c.maxMs) finish(c);
  }
}

function finish(c) {
  const samples = new Float32Array(rec.chunks.length * CHUNK);
  rec.chunks.forEach((ch, i) => samples.set(ch, i * CHUNK));
  const wav = toWav(samples), n = ++clips;
  addClip(n, wav, samples.length / 16000, c.endpoint);
  rec = null; ww.reset(); cooldownUntil = performance.now() + 1500;   // the same wake word must not fire twice
  setState('listening', 'Listening for the wake word…');
}

function toWav(f32) {   // 16-bit PCM, mono, 16 kHz
  const b = new ArrayBuffer(44 + f32.length * 2), v = new DataView(b), w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, f32.length * 2, true);
  f32.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([b], {type: 'audio/wav'});
}

async function addClip(n, wav, secs, endpoint) {
  const li = document.createElement('li'), url = URL.createObjectURL(wav);
  li.innerHTML = `<b>Command #${n}</b> · ${secs.toFixed(1)} s · ${(wav.size / 1024).toFixed(0)} KB WAV
    <audio controls src="${url}"></audio> <a href="${url}" download="command-${n}.wav">Download</a> <span class="up"></span>`;
  $('clips').prepend(li);
  const up = li.querySelector('.up');
  if (!endpoint) { up.textContent = 'not uploaded (no endpoint set)'; return; }
  up.textContent = 'uploading…';
  try {
    const r = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'audio/wav', 'X-Clip-Id': String(n)}, body: wav});
    up.textContent = r.ok ? `uploaded ✓ (${r.status})` : `server said ${r.status}`;
  } catch (e) { up.textContent = 'upload failed: ' + e.message; }
}

function log(m) { const p = document.createElement('div'); p.textContent = new Date().toLocaleTimeString() + '  ' + m; $('log').prepend(p); }

async function ensureModel() {
  if (ww) return;
  setState('loading', 'Loading models…');
  ww = await WakeWord.load('models/', $('word').value);
}

async function startMic() {
  await ensureModel();
  stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
  ctx = new AudioContext();
  await ctx.audioWorklet.addModule('worklet.js');
  node = new AudioWorkletNode(ctx, 'downsampler');
  t0 = performance.now();
  node.port.onmessage = e => { const at = (performance.now() - t0) / 1000; busy = busy.then(() => feed(e.data, at)); };
  ctx.createMediaStreamSource(stream).connect(node);
  ww.reset(); preroll = [];
  setState('listening', 'Listening for the wake word…');
  $('start').textContent = 'Stop'; log(`Microphone on (${ctx.sampleRate} Hz, resampled to 16 kHz)`);
}

function stopMic() {
  stream?.getTracks().forEach(t => t.stop()); ctx?.close(); ctx = null; node = null;
  setState('idle', 'Stopped'); $('start').textContent = 'Start listening';
}

// "Test without a microphone": the same pipeline on a recorded file, chunk by chunk.
async function testFile(src) {
  await ensureModel();
  const buf = await (await fetch(src)).arrayBuffer();
  const tmp = await new OfflineAudioContext(1, 16000, 16000).decodeAudioData(buf);
  const off = new OfflineAudioContext(1, Math.ceil(tmp.duration * 16000), 16000);
  const s = off.createBufferSource(); s.buffer = tmp; s.connect(off.destination); s.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  ww.reset(); preroll = []; cooldownUntil = 0; setState('listening', 'Testing with the sample file…');
  log(`Test file: ${(pcm.length / 16000).toFixed(1)} s`);
  for (let i = 0; i + CHUNK <= pcm.length; i += CHUNK) await feed(pcm.slice(i, i + CHUNK), i / 16000);
  if (state === 'recording') finish(cfg());
  setState('idle', 'Test finished');
  played++;
}

$('start').onclick = () => (ctx ? stopMic() : startMic()).catch(e => { log('Error: ' + e.message); setState('idle', 'Error: ' + e.message); });
$('test').onclick = () => testFile('samples/hey-jarvis-test.wav').catch(e => log('Error: ' + e.message));
$('word').onchange = async () => { if (ww) { await ww.setWord($('word').value); log('Wake word model: ' + $('word').selectedOptions[0].text); } };
$('own').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f), o = new Option(f.name, url, true, true);
  $('word').add(o); await ensureModel(); await ww.setWord(url); log('Loaded your model: ' + f.name);
};
for (const id of ['threshold', 'silence', 'preroll']) { const out = $(id + 'v'); const upd = () => out.textContent = $(id).value; $(id).oninput = upd; upd(); }
window.__demo = {get state() { return state; }, get clips() { return clips; }, get played() { return played; }};
