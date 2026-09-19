#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
골든컷 "자동 캡션" — 영상에 말소리를 받아써서 자막을 자동으로 넣습니다.

캡컷의 자동 캡션과 같은 기능이고, 두 가지를 더 넣었습니다.
  1) **단어별 강조** — 지금 말하고 있는 단어만 색이 바뀝니다(캡컷의 그 효과).
     소리를 끄고 보는 사람이 많아서, 이게 있으면 체감 몰입도가 확 올라갑니다.
  2) **손으로 고치기** — 받아쓴 결과를 .srt로 빼서 고친 뒤 다시 입히는 경로가 있습니다.
     음성인식은 고유명사(브랜드명·제품명)를 자주 틀리는데, 그걸 못 고치면 못 씁니다.

받아쓰기 엔진은 아래 순서로 **로컬에서 무료인 것부터** 찾습니다(유료 API 안 씁니다).
  1. faster-whisper 파이썬 패키지  ← 가장 권장. `pip install faster-whisper`
  2. whisper-asr-webservice HTTP 서버 (이미 쓰고 계신 방식)
  3. 둘 다 없으면 → 직접 입력한 자막만 사용

쓰는 법
-------
    # 자동으로 받아써서 자막 입히기
    python goldencut_caption.py --video in.mp4 --out out.mp4

    # 먼저 자막만 뽑아서 고치고 싶을 때
    python goldencut_caption.py --video in.mp4 --export-srt cap.srt
    (cap.srt를 메모장에서 고친 뒤)
    python goldencut_caption.py --video in.mp4 --srt cap.srt --out out.mp4

    # 단어별 강조 끄기 / 스타일 바꾸기
    python goldencut_caption.py --video in.mp4 --out out.mp4 --no-karaoke --template vivid-yellow
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile

from goldencut_effects import (
    TEMPLATES, PLAY_RES_X, PLAY_RES_Y, run, esc_path, find_font,
    wrap_lines, apply_emphasis, ass_time, style_line, probe_duration,
)

# 자동 캡션은 화면 아래쪽에 조금 더 크게 올립니다(대사 전달이 목적이라 후킹 문구보다 큼).
CAP_SIZE = 14
CAP_MARGIN_V = 62
CAP_MAX_CHARS = 14


# ───────────────────────────────────────────────────────────────
# 1) 소리 뽑기
# ───────────────────────────────────────────────────────────────
def extract_audio(video, out_wav):
    """받아쓰기용 16kHz 모노 wav — 음성인식 모델이 기대하는 형식입니다."""
    run(["-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", out_wav])
    return out_wav


# ───────────────────────────────────────────────────────────────
# 2) 받아쓰기 — 로컬 무료 우선
# ───────────────────────────────────────────────────────────────
def transcribe_faster_whisper(wav, language="ko", model_size="large-v3"):
    """
    faster-whisper 파이썬 패키지로 받아씁니다(로컬·무료).

    ⚠️ 처음 한 번은 모델을 내려받느라 시간이 걸립니다(large-v3 기준 약 3GB).
    4090이면 device="cuda", compute_type="float16"이 제일 빠릅니다.
    """
    from faster_whisper import WhisperModel  # 없으면 ImportError → 다음 방법으로 넘어감

    try:
        model = WhisperModel(model_size, device="cuda", compute_type="float16")
    except Exception:
        # GPU가 안 잡히면 CPU로라도 돌립니다(느리지만 됩니다).
        model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, _info = model.transcribe(
        wav, language=language, word_timestamps=True,
        vad_filter=True,  # 말 없는 구간을 걸러내야 자막이 엉뚱한 데서 안 뜹니다
    )

    cues = []
    for seg in segments:
        words = [{"start": w.start, "end": w.end, "text": w.word.strip()}
                 for w in (seg.words or []) if w.word and w.word.strip()]
        cues.append({"start": seg.start, "end": seg.end,
                     "text": seg.text.strip(), "words": words})
    return cues


def transcribe_webservice(wav, url, language="ko"):
    """whisper-asr-webservice(자체 호스팅) HTTP로 받아씁니다."""
    import json as _json
    import urllib.request

    # 표준 라이브러리만으로 multipart를 만듭니다(requests 설치 강제하지 않으려고).
    boundary = "----goldencut-boundary"
    with open(wav, "rb") as f:
        data = f.read()
    body = (
        ("--%s\r\nContent-Disposition: form-data; name=\"audio_file\"; filename=\"a.wav\"\r\n"
         "Content-Type: audio/wav\r\n\r\n" % boundary).encode() + data +
        ("\r\n--%s--\r\n" % boundary).encode()
    )
    endpoint = "%s/asr?output=json&language=%s&word_timestamps=true" % (url.rstrip("/"), language)
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "multipart/form-data; boundary=%s" % boundary)
    with urllib.request.urlopen(req, timeout=900) as res:
        payload = _json.loads(res.read().decode("utf-8", "ignore"))

    cues = []
    for seg in payload.get("segments", []):
        words = [{"start": w.get("start"), "end": w.get("end"),
                  "text": str(w.get("word", "")).strip()}
                 for w in (seg.get("words") or [])
                 if str(w.get("word", "")).strip()]
        cues.append({"start": seg.get("start", 0), "end": seg.get("end", 0),
                     "text": str(seg.get("text", "")).strip(), "words": words})
    return cues


def transcribe(video, language="ko", whisper_url=None, model_size="large-v3", verbose=True):
    """쓸 수 있는 방법을 순서대로 시도하고, 어떤 방법을 썼는지도 같이 돌려줍니다."""
    tmp = tempfile.mkdtemp(prefix="gc-cap-")
    wav = os.path.join(tmp, "a.wav")
    try:
        extract_audio(video, wav)

        try:
            if verbose:
                print("  받아쓰기: faster-whisper(로컬) 시도 중...", file=sys.stderr)
            return transcribe_faster_whisper(wav, language, model_size), "faster-whisper(로컬)"
        except ImportError:
            if verbose:
                print("  faster-whisper 패키지가 없습니다 → 다음 방법으로", file=sys.stderr)
        except Exception as e:
            if verbose:
                print("  faster-whisper 실패(%s) → 다음 방법으로" % e, file=sys.stderr)

        url = whisper_url or os.environ.get("FASTER_WHISPER_URL")
        if url:
            try:
                if verbose:
                    print("  받아쓰기: whisper 서버(%s) 시도 중..." % url, file=sys.stderr)
                return transcribe_webservice(wav, url, language), "whisper-asr-webservice"
            except Exception as e:
                if verbose:
                    print("  whisper 서버 실패: %s" % e, file=sys.stderr)

        raise RuntimeError(
            "받아쓸 방법이 없습니다.\n"
            "  · 가장 쉬운 해결: pip install faster-whisper\n"
            "  · 또는 whisper 서버를 띄우고 FASTER_WHISPER_URL 환경변수를 설정하세요.\n"
            "  · 받아쓰기 없이 직접 쓴 자막만 넣으려면 --srt 로 자막 파일을 주세요.")
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


# ───────────────────────────────────────────────────────────────
# 3) .srt 주고받기 (손으로 고치는 경로)
# ───────────────────────────────────────────────────────────────
def srt_time(sec):
    sec = max(float(sec or 0), 0)
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)


def export_srt(cues, path):
    lines = []
    for i, c in enumerate(cues, 1):
        lines += [str(i), "%s --> %s" % (srt_time(c["start"]), srt_time(c["end"])),
                  c["text"], ""]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


def import_srt(path):
    """손으로 고친 .srt를 다시 읽습니다. 단어 타이밍은 사라지므로 줄 단위로만 뜹니다."""
    text = open(path, encoding="utf-8-sig").read()
    cues = []
    for block in re.split(r"\n\s*\n", text.strip()):
        rows = [r for r in block.splitlines() if r.strip()]
        if len(rows) < 2:
            continue
        m = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", block)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
        body = " ".join(rows[2:]) if rows[0].strip().isdigit() else " ".join(rows[1:])
        cues.append({"start": start, "end": end, "text": body.strip(), "words": []})
    return cues


# ───────────────────────────────────────────────────────────────
# 4) 자막 파일(.ass) 만들기 — 단어별 강조 포함
# ───────────────────────────────────────────────────────────────
def build_caption_ass(cues, path, template="bold-black", font_name="Sans", karaoke=True):
    """
    karaoke=True면 지금 말하는 단어만 색이 바뀝니다.

    ⚠️ ASS의 \\k 태그(가라오케)를 쓰지 않고, 단어마다 Dialogue 줄을 따로 만듭니다.
    \\k는 재생기마다 해석이 달라서 ffmpeg/libass로 구울 때 기대와 다르게 나오는 경우가
    있었습니다. 줄을 나눠 찍으면 어디서 구워도 똑같이 나옵니다.
    """
    tpl = TEMPLATES.get(template, TEMPLATES["bold-black"])
    accent = tpl["accent"]
    base = accent[:-1] if accent.endswith("&") else accent

    header = [
        "[Script Info]", "ScriptType: v4.00+", "WrapStyle: 2",
        "PlayResX: %d" % PLAY_RES_X, "PlayResY: %d" % PLAY_RES_Y,
        "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,"
        "Alignment,MarginL,MarginR,MarginV,Encoding",
        style_line("Cap", CAP_SIZE, CAP_MARGIN_V, 2, tpl["body"], font_name),
        "", "[Events]",
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]

    events = []
    for c in cues:
        words = c.get("words") or []
        lines = wrap_lines(c["text"], CAP_MAX_CHARS)
        plain = "\\N".join(lines)

        if not (karaoke and words):
            events.append("Dialogue: 0,%s,%s,Cap,,0,0,0,,{\\fad(120,80)}%s"
                          % (ass_time(c["start"]), ass_time(c["end"]),
                             apply_emphasis(plain, accent)))
            continue

        # 단어별 강조: 단어 수만큼 줄을 만들고, 그때그때 그 단어만 색을 바꿉니다.
        for i, w in enumerate(words):
            ws = w.get("start")
            we = w.get("end")
            if ws is None or we is None or we <= ws:
                continue
            parts = []
            for j, other in enumerate(words):
                t = other["text"]
                parts.append("{\\c%s&}%s{\\c&HFFFFFF&}" % (base, t) if j == i else t)
            body = " ".join(parts)
            # 줄바꿈은 원래 줄 구성을 최대한 따라가되, 너무 길면 libass가 알아서 접습니다.
            events.append("Dialogue: 0,%s,%s,Cap,,0,0,0,,%s"
                          % (ass_time(ws), ass_time(we), body))

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(header + events) + "\n")
    return path


# ───────────────────────────────────────────────────────────────
# 5) 영상에 굽기
# ───────────────────────────────────────────────────────────────
def burn(video, ass_path, out_path, font_dir=None, preset="medium", crf=20):
    subs = "subtitles=filename='%s'" % esc_path(ass_path)
    if font_dir:
        subs += ":fontsdir='%s'" % esc_path(font_dir)
    run(["-y", "-i", video, "-vf", subs, "-c:v", "libx264", "-preset", preset,
         "-crf", str(crf), "-pix_fmt", "yuv420p", "-c:a", "copy",
         "-movflags", "+faststart", out_path], timeout=1800)
    return out_path


def caption_video(video, out_path, template="bold-black", karaoke=True, language="ko",
                  srt_in=None, srt_out=None, whisper_url=None, model_size="large-v3",
                  font_dir=None, font_name=None, verbose=True):
    """영상 한 편에 자동 캡션을 넣습니다. srt_in을 주면 받아쓰기를 건너뛰고 그걸 씁니다."""
    if font_dir is None or font_name is None:
        fd, fn = find_font()
        font_dir = font_dir or fd
        font_name = font_name or fn

    if srt_in:
        cues, how = import_srt(srt_in), "직접 준 자막(%s)" % os.path.basename(srt_in)
        karaoke = False  # .srt에는 단어 타이밍이 없습니다
    else:
        cues, how = transcribe(video, language, whisper_url, model_size, verbose)

    if verbose:
        print("  자막 %d줄 (%s)" % (len(cues), how), file=sys.stderr)
    if not cues:
        raise RuntimeError("자막으로 만들 말소리를 찾지 못했습니다.")

    if srt_out:
        export_srt(cues, srt_out)
        if verbose:
            print("  자막 파일로 저장: %s (고친 뒤 --srt 로 다시 넣으세요)" % srt_out, file=sys.stderr)

    tmp = tempfile.mkdtemp(prefix="gc-ass-")
    try:
        ass_path = os.path.join(tmp, "cap.ass")
        build_caption_ass(cues, ass_path, template, font_name, karaoke)
        burn(video, ass_path, out_path, font_dir)
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)

    dur = probe_duration(out_path)
    if verbose:
        print("완성: %s (%.2f초, 자막 %d줄, 단어강조 %s)"
              % (out_path, dur or 0, len(cues), "켜짐" if karaoke else "꺼짐"),
              file=sys.stderr)
    return {"path": out_path, "cues": len(cues), "how": how, "karaoke": karaoke}


def main():
    ap = argparse.ArgumentParser(description="골든컷 자동 캡션")
    ap.add_argument("--video", required=True)
    ap.add_argument("--out")
    ap.add_argument("--template", default="bold-black", choices=list(TEMPLATES))
    ap.add_argument("--no-karaoke", action="store_true", help="단어별 강조 끄기")
    ap.add_argument("--language", default="ko")
    ap.add_argument("--srt", dest="srt_in", help="직접 고친 자막 파일을 넣기")
    ap.add_argument("--export-srt", dest="srt_out", help="받아쓴 결과를 이 파일로 저장")
    ap.add_argument("--whisper-url", help="whisper-asr-webservice 주소")
    ap.add_argument("--model", default="large-v3", help="faster-whisper 모델 크기")
    a = ap.parse_args()

    if not a.out and not a.srt_out:
        ap.error("--out 또는 --export-srt 중 하나는 필요합니다.")

    if a.out:
        caption_video(a.video, a.out, template=a.template, karaoke=not a.no_karaoke,
                      language=a.language, srt_in=a.srt_in, srt_out=a.srt_out,
                      whisper_url=a.whisper_url, model_size=a.model)
    else:
        cues, how = transcribe(a.video, a.language, a.whisper_url, a.model)
        export_srt(cues, a.srt_out)
        print("자막 %d줄 저장: %s (%s)" % (len(cues), a.srt_out, how), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
