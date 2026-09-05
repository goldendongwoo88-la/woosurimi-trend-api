# -*- coding: utf-8 -*-
"""일본어 더빙 검수: ① 되받아 적어 대사 대조 ② 큐별 타이밍 ③ 음량"""
import json, os, re
from faster_whisper import WhisperModel

OUT = os.path.dirname(os.path.abspath(__file__))
lines = [x.strip() for x in open(os.path.join(OUT,"ja_lines.txt"), encoding="utf-8").read().strip().split("\n") if x.strip()]
rep   = json.load(open(os.path.join(OUT,"ja_report.json"), encoding="utf-8"))

m = WhisperModel("large-v3", device="cpu", compute_type="int8")

def hear(path, prompt=None):
    segs,_ = m.transcribe(path, language="ja", beam_size=5, vad_filter=False,
                          initial_prompt=prompt, condition_on_previous_text=False,
                          word_timestamps=True, temperature=0)
    return list(segs)

res = {}
for tag, path in [("vo","ja_vo.wav"), ("mix", r"C:\Users\김동우\Downloads\우수리미부부 자막\더빙\ja_dub.m4a")]:
    segs = hear(path)
    res[tag] = [{"s":round(s.start,2),"e":round(s.end,2),"t":s.text.strip()} for s in segs]

json.dump({"lines":lines,"report":rep,"heard":res},
          open(os.path.join(OUT,"verify.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("done", len(res["vo"]), len(res["mix"]))
