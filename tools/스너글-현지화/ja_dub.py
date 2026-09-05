# -*- coding: utf-8 -*-
import os, re, wave, json
import numpy as np, torch
from kokoro import KModel, KPipeline
ROOT = r"D:\AI\tts"
CKPT = os.path.join(ROOT, "kokoro", "kokoro-v1_0.pth")
CONF = os.path.join(ROOT, "kokoro", "config.json")
VOICES = os.path.join(ROOT, "kokoro", "voices")
SR = 24000
OUT = os.path.dirname(os.path.abspath(__file__))
SBV = r"C:\Users\김동우\Downloads\우수리미부부 자막\자막_15개국어\captions.ja.sbv"
DAD = set(range(1, 5)) | {15, 16}

def t2s(t):
    h, m, s = t.split(":"); return int(h)*3600 + int(m)*60 + float(s)

blocks = [b for b in open(SBV, encoding="utf-8").read().strip().split("\n\n") if b.strip()]
cues = []
for i, b in enumerate(blocks, 1):
    a, e = b.split("\n")[0].split(",")
    cues.append({"i": i, "s": t2s(a), "e": t2s(e)})
DUB = [x.strip() for x in open(os.path.join(OUT, "ja_lines.txt"), encoding="utf-8").read().strip().split("\n") if x.strip()]
assert len(DUB) == len(cues), (len(DUB), len(cues))
for c, d in zip(cues, DUB):
    c["text"] = d

model = KModel(config=CONF, model=CKPT).eval()
pipe = KPipeline(lang_code="j", model=model)
packs = {v: torch.load(os.path.join(VOICES, v + ".pt"), weights_only=True) for v in ("jm_kumo", "jf_alpha")}

def say(text, voice, speed):
    parts = []
    for sent in [x.strip() for x in re.split(r"(?<=[。！？!?])", text) if x.strip()]:
        for _g, _p, audio in pipe(sent, voice=packs[voice], speed=speed):
            a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
            parts.append(a.astype(np.float32))
    return np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)

TOTAL = 51.30
timeline = np.zeros(int(SR * TOTAL) + SR, dtype=np.float32)
report = []
for c in cues:
    voice = "jm_kumo" if c["i"] in DAD else "jf_alpha"
    wav = say(c["text"], voice, 1.0)
    slot = c["e"] - c["s"]
    speed = min(max((len(wav)/SR) / slot, 0.85), 1.25)
    if abs(speed - 1.0) > 0.02:
        wav = say(c["text"], voice, speed)
    st = int(c["s"] * SR); en = min(st + len(wav), len(timeline))
    timeline[st:en] += wav[: en - st]
    report.append({"cue": c["i"], "voice": voice, "slot": round(slot,2),
                   "len": round(len(wav)/SR,2), "speed": round(speed,2), "text": c["text"]})

peak = np.max(np.abs(timeline)) or 1.0
timeline = (timeline / peak) * 0.92
pcm = (np.clip(timeline, -1, 1) * 32767).astype(np.int16)
with wave.open(os.path.join(OUT, "ja_vo.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
json.dump(report, open(os.path.join(OUT, "ja_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("VO OK", round(len(timeline)/SR, 2))
