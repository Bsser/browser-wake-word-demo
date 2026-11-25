// Minimal receiver for the demo: POST /upload with a WAV body -> saved to ./clips/<time>-<id>.wav
const express = require('express');
const fs = require('fs'), path = require('path');
const app = express(), dir = path.join(__dirname, 'clips');
fs.mkdirSync(dir, {recursive: true});

app.use((req, res, next) => {        // CORS so the demo page (any origin) can post here
  res.set({'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Clip-Id'});
  req.method === 'OPTIONS' ? res.sendStatus(204) : next();
});
app.post('/upload', express.raw({type: 'audio/wav', limit: '5mb'}), (req, res) => {
  const b = req.body;
  if (!Buffer.isBuffer(b) || b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') return res.status(400).json({error: 'expected a WAV body'});
  const name = `${Date.now()}-${String(req.get('X-Clip-Id') || 'clip').replace(/\W/g, '')}.wav`;
  fs.writeFileSync(path.join(dir, name), b);
  console.log('saved', name, b.length, 'bytes');
  // This is where speech-to-text / your assistant would take over.
  res.json({ok: true, file: name, bytes: b.length});
});
app.listen(process.env.PORT || 3000, () => console.log('listening on http://localhost:' + (process.env.PORT || 3000)));
