# Same receiver in Python/Flask:  pip install flask  &&  python server.py
import os, time, re
from flask import Flask, request, jsonify
app, DIR = Flask(__name__), os.path.join(os.path.dirname(__file__), "clips")
os.makedirs(DIR, exist_ok=True)

@app.after_request
def cors(r):
    r.headers["Access-Control-Allow-Origin"] = "*"; r.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Clip-Id"; return r

@app.route("/upload", methods=["POST", "OPTIONS"])
def upload():
    if request.method == "OPTIONS": return "", 204
    b = request.get_data()
    if len(b) < 44 or b[:4] != b"RIFF": return jsonify(error="expected a WAV body"), 400
    clip = re.sub(r"\W", "", request.headers.get("X-Clip-Id", "clip"))
    name = f"{int(time.time()*1000)}-{clip}.wav"
    open(os.path.join(DIR, name), "wb").write(b)
    return jsonify(ok=True, file=name, bytes=len(b))

if __name__ == "__main__": app.run(port=int(os.environ.get("PORT", 3000)))
