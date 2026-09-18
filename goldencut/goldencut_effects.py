#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
골든컷 "자동컷" 효과 엔진 — 캡컷 자동컷 스타일 숏폼을 ffmpeg만으로 만듭니다.

왜 이 파일이 따로 있는가
------------------------
이 저장소(woosurimi-trend-api)의 쇼츠생성기는 Node로 돼 있는데, 골든컷은 사장님 PC에서
파이썬으로 돌아갑니다. 그래서 **의존성 없이 혼자 도는 파이썬 한 파일**로 옮겨 담았습니다.
pip 설치 필요 없고, ffmpeg/ffprobe만 PATH에 있으면 됩니다.

골든컷에 넣는 법
----------------
    from goldencut_effects import render, EFFECTS

    render(
        scenes=[{"image": "a.jpg", "caption": "첫 장면 *강조* 문구"}, ...],
        out_path="out.mp4",
        effect="whitecard-pop",      # EFFECTS 키 중 하나
        hook="여름 신발 추천",        # 영상 내내 상단 고정 문구
        target_seconds=15,            # 15 또는 28 (None이면 효과팩 기본 속도)
        intro="scatter",              # 사진들이 흩뿌려진 인트로 (None이면 생략)
    )

먼저 이것부터 돌려보세요(샘플 사진을 만들어서 6종을 전부 렌더합니다):

    python goldencut_effects.py --selftest --out-dir ./_test

기준값의 출처
-------------
캡컷 자동컷 영상 3편(안마의자·신발·선글라스)을 프레임 단위로 뜯어서 잰 값입니다.
- 신발 편: 컷 간격 1.29초(음악 박자에 맞춘 규칙적 컷), 흰 카드 + 밝은 배경, 흩뿌린 인트로
- 안마의자 편: 흰 카드 + 같은 사진을 흐리게 깐 배경, 카드가 장면마다 반대로 기울어짐
- 선글라스 편: 꽉 찬 화면 + 강한 채도, 빠른 줌, 흐림/번쩍 전환

⚠️ 해상도는 1080x1920 / 30fps입니다. 참고 영상(22·23번)이 그 규격이고, 골든컷은
로컬에서 도니까 서버판(720x1280)처럼 낮출 이유가 없습니다.
"""

import argparse
import json
import math
import os
import random
import shutil
import subprocess
import sys
import tempfile


def _log(msg):
    """진행 상황은 stderr로 — stdout은 --json 결과 전용으로 비워둡니다."""
    print(msg, file=sys.stderr)

# ───────────────────────────────────────────────────────────────
# 기본 규격
# ───────────────────────────────────────────────────────────────
W, H, FPS = 1080, 1920, 30

# ⚠️ 자막 좌표계는 288 높이로 둡니다.
# ffmpeg가 .srt를 .ass로 바꿀 때 쓰는 기준이라, 기존에 실측해 둔 글자 크기·여백 숫자를
# 그대로 재사용할 수 있습니다. libass가 알아서 실제 높이(1920)로 확대합니다.
PLAY_RES_Y = 288
PLAY_RES_X = int(round(PLAY_RES_Y * W / H))

FADE_SEC = 0.4          # 맨 앞/맨 뒤 검은 페이드
MIN_SEC_PER_CHUNK = 1.4  # 자막 2줄 한 덩어리를 읽는 데 필요한 최소 시간
MAX_CHARS_PER_LINE = 12
LINES_PER_CHUNK = 2
BGM_VOLUME = 0.28

# 카드 치수 (1080x1920 기준 — 서버판 720x1280 값에 1.5배)
CARD_CONTENT_W, CARD_CONTENT_H, CARD_BORDER = 960, 1470, 30
WHITECARD_CONTENT_W, WHITECARD_CONTENT_H, WHITECARD_BORDER = 870, 1320, 36
CARD_Y_OFFSET = 83       # 정중앙보다 이만큼 위로(아래 자막 자리)
WHITECARD_BG = "0xF2F2F4"  # 순백으로 두면 흰 카드가 배경에 묻힙니다
LETTERBOX_BAND_H = 1152  # 화면 높이의 60%

# ───────────────────────────────────────────────────────────────
# 효과팩 6종
# ───────────────────────────────────────────────────────────────
EFFECTS = {
    "clean-zoom": {
        "label": "클린 줌 (기본)",
        "frame": "full",
        "grade": None,
        "max_zoom": 1.18, "drift": 0.07, "tilt": 0.0,
        "transitions": ["fade"], "transition_sec": 0.35,
        "pace": 3.2, "use_transition": False,
    },
    "photocard-drift": {
        "label": "포토카드 드리프트",
        "frame": "photocard",
        "grade": "eq=saturation=1.06:contrast=1.03",
        "max_zoom": 1.08, "drift": 0.035, "tilt": 1.6,
        "transitions": ["fade", "dissolve"], "transition_sec": 0.42,
        "pace": 2.8, "use_transition": True,
    },
    "whitecard-pop": {
        "label": "화이트카드 팝",
        "frame": "whitecard",
        "grade": "eq=contrast=1.06:saturation=1.12:brightness=0.03",
        "max_zoom": 1.05, "drift": 0.02, "tilt": 0.9,
        "transitions": ["slideleft", "slideright"], "transition_sec": 0.28,
        "pace": 1.9, "use_transition": True,
    },
    "vivid-punch": {
        "label": "비비드 펀치",
        "frame": "full",
        "grade": "eq=contrast=1.16:saturation=1.34:brightness=0.02,unsharp=5:5:0.6",
        "max_zoom": 1.30, "drift": 0.09, "tilt": 0.0,
        "transitions": ["hblur", "fadewhite", "zoomin", "pixelize"], "transition_sec": 0.22,
        "pace": 2.2, "use_transition": True,
    },
    "film-strip": {
        "label": "필름 스트립",
        "frame": "letterbox",
        "grade": "eq=contrast=1.1:saturation=0.74:brightness=-0.02",
        "max_zoom": 1.12, "drift": 0.05, "tilt": 0.0,
        "transitions": ["fadeblack", "dissolve"], "transition_sec": 0.5,
        "pace": 3.6, "use_transition": True,
    },
    "soft-bloom": {
        "label": "소프트 블룸",
        "frame": "full",
        "grade": "eq=brightness=0.05:saturation=1.1:contrast=0.97,unsharp=3:3:-0.5",
        "max_zoom": 1.14, "drift": 0.05, "tilt": 0.0,
        "transitions": ["circleopen", "fade", "circleclose"], "transition_sec": 0.45,
        "pace": 3.0, "use_transition": True,
    },
}

# 이 ffmpeg 빌드에 실제로 있는 전환만 씁니다. 없는 이름을 쓰면 렌더가 통째로 실패합니다.
SAFE_TRANSITIONS = {
    "fade", "fadeblack", "fadewhite", "dissolve", "pixelize", "radial",
    "slideleft", "slideright", "slideup", "slidedown",
    "smoothleft", "smoothright", "circleopen", "circleclose",
    "hblur", "zoomin", "squeezeh", "squeezev", "coverleft", "revealleft",
    "wipeleft", "diagtl", "hlslice",
}

# ───────────────────────────────────────────────────────────────
# 자막 디자인 5종 (색은 &HAABBGGRR — 보통 색 표기와 순서가 반대입니다)
# ───────────────────────────────────────────────────────────────
HOOK_SIZE, HOOK_MARGIN_V = 16, 29   # 288 좌표계 → 1920에서 약 106px / 위 여백 193px
BODY_SIZE, BODY_MARGIN_V = 12, 68   # → 약 80px / 아래 여백 453px

TEMPLATES = {
    "bold-black": {
        "label": "볼드 블랙", "accent": "&H0000E0FF",
        "body": "PrimaryColour=&H00FFFFFF,BorderStyle=3,OutlineColour=&H99000000,Outline=1,Shadow=0",
        "hook": "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=1",
    },
    "soft-cream": {
        "label": "감성 크림", "accent": "&H004466DD",
        "body": "PrimaryColour=&H00303030,BorderStyle=3,OutlineColour=&HB0E8F0F5,Outline=1,Shadow=0",
        "hook": "PrimaryColour=&H00F0F6FA,OutlineColour=&H00202020,BorderStyle=1,Outline=1.4,Shadow=1",
    },
    "neon-pink": {
        "label": "네온 핑크", "accent": "&H00FFFF00",
        "body": "PrimaryColour=&H00AA5AFF,OutlineColour=&H00201020,BorderStyle=1,Outline=3,Shadow=1",
        "hook": "PrimaryColour=&H00AA5AFF,OutlineColour=&H00201020,BorderStyle=1,Outline=1.4,Shadow=1",
    },
    "vivid-yellow": {
        "label": "비비드 옐로우", "accent": "&H00FFFFFF",
        "body": "PrimaryColour=&H0000D6FF,BorderStyle=3,OutlineColour=&H99000000,Outline=1,Shadow=0",
        "hook": "PrimaryColour=&H0000D6FF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=1",
    },
    "clean-blue": {
        "label": "클린 블루", "accent": "&H0000E0FF",
        "body": "PrimaryColour=&H00FFFFFF,BorderStyle=3,OutlineColour=&HA0783C1E,Outline=1,Shadow=0",
        "hook": "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=1",
    },
}

# 윈도우에 기본으로 깔려 있는 한글 폰트 후보 — 위에서부터 찾습니다.
WINDOWS_FONT_CANDIDATES = [
    (r"C:\Windows\Fonts\malgunbd.ttf", "Malgun Gothic"),
    (r"C:\Windows\Fonts\malgun.ttf", "Malgun Gothic"),
    (r"C:\Windows\Fonts\NanumGothicBold.ttf", "NanumGothic"),
    (r"C:\Windows\Fonts\NanumGothic.ttf", "NanumGothic"),
    (r"C:\Windows\Fonts\gulim.ttc", "Gulim"),
]


def find_font():
    """(폰트폴더, 폰트이름)을 돌려줍니다. 못 찾으면 (None, 'Sans')."""
    for path, family in WINDOWS_FONT_CANDIDATES:
        if os.path.exists(path):
            return os.path.dirname(path), family
    # 이 저장소에 같이 들어있는 폰트(리눅스/맥에서 테스트할 때)
    here = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.join(here, "..", "assets", "fonts", "NotoSansKR-Bold.ttf")
    if os.path.exists(bundled):
        return os.path.dirname(os.path.abspath(bundled)), "Woosurimi Caption KR"
    return None, "Sans"


# ───────────────────────────────────────────────────────────────
# ffmpeg 실행
# ───────────────────────────────────────────────────────────────
def run(args, timeout=300):
    """ffmpeg 실행 — args는 ffmpeg 뒤에 붙는 인자만 넘기면 됩니다."""
    p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error"] + list(args),
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if p.returncode != 0:
        tail = p.stderr.decode("utf-8", "ignore").strip().splitlines()[-8:]
        raise RuntimeError("ffmpeg 실패:\n  " + "\n  ".join(tail))
    return p


def probe_duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30).stdout
        return float(out.decode().strip())
    except Exception:
        return None


def esc_path(p):
    """filter 옵션 안에 파일 경로를 넣을 때의 이스케이프 (윈도우 역슬래시·드라이브 콜론)."""
    return p.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


# ───────────────────────────────────────────────────────────────
# 소재 판별 — 사진이냐 영상이냐
# ───────────────────────────────────────────────────────────────
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}


def is_video(path):
    """확장자로 1차 판단하고, 애매하면 ffprobe로 실제 길이를 봅니다."""
    if not path:
        return False
    ext = os.path.splitext(path)[1].lower()
    if ext in VIDEO_EXTS:
        return True
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
        return False
    d = probe_duration(path)
    return bool(d and d > 0.25)


def pick_best_window(video, want_sec, probe_sec=None):
    """
    영상에서 "가장 볼 만한 구간"의 시작 시각을 고릅니다 — 자동컷의 '자동'이 여기입니다.

    화면이 많이 바뀌는 구간 = 움직임이 있는 구간이라고 보고, ffmpeg의 장면 변화 점수를
    1초 간격으로 모아 가장 점수가 높은 창(window)을 고릅니다.

    ⚠️ 맨 앞 0.4초는 버립니다. 손으로 녹화 버튼을 누른 직후라 흔들리는 경우가 많습니다.
    ⚠️ 점수를 못 구하면(무음·정지 영상 등) 그냥 가운데를 씁니다 — 실패로 만들지 않습니다.
    """
    total = probe_duration(video) or 0
    if total <= want_sec + 0.5:
        return max(min(0.2, max(total - want_sec, 0)), 0)

    head = 0.4
    try:
        p = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", video, "-vf",
             "select='gt(scene,0.06)',metadata=print:file=-", "-an", "-f", "null", "-"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
        times = [float(line.split("pts_time:")[1].split()[0])
                 for line in p.stdout.decode("utf-8", "ignore").splitlines()
                 if "pts_time:" in line]
    except Exception:
        times = []

    if not times:
        return max((total - want_sec) / 2, head)

    # 1초 단위로 후보 시작점을 훑으면서, 그 창 안에 변화가 제일 많은 곳을 고릅니다.
    best_start, best_hits = head, -1
    t = head
    while t + want_sec <= total:
        hits = sum(1 for x in times if t <= x < t + want_sec)
        if hits > best_hits:
            best_hits, best_start = hits, t
        t += 1.0
    return best_start


# ───────────────────────────────────────────────────────────────
# 자막 (.ass)
# ───────────────────────────────────────────────────────────────
def wrap_lines(text, max_chars=MAX_CHARS_PER_LINE):
    words, lines, cur = str(text or "").split(), [], ""
    for w in words:
        cand = (cur + " " + w).strip()
        if len(cand) <= max_chars or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def caption_chunks(text, lines_per_chunk=LINES_PER_CHUNK):
    lines = wrap_lines(text)
    return [lines[i:i + lines_per_chunk] for i in range(0, len(lines), lines_per_chunk)] or [[""]]


def min_duration_for(text):
    return len(caption_chunks(text)) * MIN_SEC_PER_CHUNK


def apply_emphasis(text, accent):
    """*별표*로 감싼 부분만 강조색으로. 한 줄 통째로 칠하지 않는 게 핵심입니다."""
    out, parts = "", str(text or "").split("*")
    for i, part in enumerate(parts):
        out += ("{\\c%s&}%s{\\c&HFFFFFF&}" % (accent[:-1] if accent.endswith("&") else accent, part)
                if i % 2 == 1 and part else part)
    return out


def ass_time(sec):
    sec = max(sec, 0)
    h = int(sec // 3600); m = int((sec % 3600) // 60); s = sec % 60
    return "%d:%02d:%05.2f" % (h, m, s)


def style_line(name, size, margin_v, align, extra, font_name):
    """ASS [V4+] 스타일 한 줄.

    ⚠️ 정렬 번호 주의: [V4+]는 넘패드 배치라 8=상단중앙, 2=하단중앙입니다.
    (구식 SSA의 6=상단중앙과 다릅니다. 여기서는 V4+ 기준으로 씁니다.)
    ⚠️ BorderStyle=3(불투명 박스)일 때 박스 배경색은 BackColour가 아니라
    OutlineColour입니다.
    """
    d = {
        "PrimaryColour": "&H00FFFFFF", "SecondaryColour": "&H000000FF",
        "OutlineColour": "&H00000000", "BackColour": "&H00000000",
        "BorderStyle": "1", "Outline": "1.4", "Shadow": "1",
    }
    for part in extra.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            d[k.strip()] = v.strip()
    return ("Style: %s,%s,%d,%s,%s,%s,%s,1,0,0,0,100,100,0,0,%s,%s,%s,%d,20,20,%d,1"
            % (name, font_name, size, d["PrimaryColour"], d["SecondaryColour"],
               d["OutlineColour"], d["BackColour"], d["BorderStyle"], d["Outline"],
               d["Shadow"], align, margin_v))


def build_ass(path, caption, duration, hook, template, font_name):
    tpl = TEMPLATES.get(template, TEMPLATES["bold-black"])
    accent = tpl["accent"]

    header = [
        "[Script Info]", "ScriptType: v4.00+", "WrapStyle: 2",
        "PlayResX: %d" % PLAY_RES_X, "PlayResY: %d" % PLAY_RES_Y,
        "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,"
        "Alignment,MarginL,MarginR,MarginV,Encoding",
        style_line("Body", BODY_SIZE, BODY_MARGIN_V, 2, tpl["body"], font_name),
        style_line("Hook", HOOK_SIZE, HOOK_MARGIN_V, 8, tpl["hook"], font_name),
        "", "[Events]",
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]

    events = []
    chunks = caption_chunks(caption)
    per = duration / len(chunks) if chunks else duration
    for i, lines in enumerate(chunks):
        text = apply_emphasis("\\N".join(lines), accent)
        events.append("Dialogue: 0,%s,%s,Body,,0,0,0,,%s"
                      % (ass_time(i * per), ass_time(min((i + 1) * per, duration)), text))
    if hook and hook.strip():
        hook_text = apply_emphasis("\\N".join(wrap_lines(hook.strip())), accent)
        events.append("Dialogue: 0,%s,%s,Hook,,0,0,0,,{\\fad(250,0)}%s"
                      % (ass_time(0), ass_time(duration), hook_text))

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(header + events) + "\n")


# ───────────────────────────────────────────────────────────────
# 필터 조각
# ───────────────────────────────────────────────────────────────
def cover(w, h):
    return "scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,crop=%d:%d" % (w, h, w, h)


def kenburns(index, duration, w, h, max_zoom, drift):
    """장면마다 확대/축소를 번갈아, 팬 방향도 대각선 네 방향을 돌아가며."""
    total = max(int(round(duration * FPS)), 1)
    rate = (max_zoom - 1) / total
    zoom_in = index % 2 == 0
    dx = 1 if index % 4 < 2 else -1
    dy = 1 if (index + 1) % 4 < 2 else -1
    px, py = int(w * drift), int(h * drift * 0.6)
    z = ("min(zoom+%.6f,%s)" % (rate, max_zoom) if zoom_in
         else "if(eq(on,0),%s,max(zoom-%.6f,1.0))" % (max_zoom, rate))
    return ("zoompan=z='%s':x='(iw-iw/zoom)/2+(%d*%d*on/%d)':y='(ih-ih/zoom)/2+(%d*%d*on/%d)'"
            ":d=1:s=%dx%d:fps=%d" % (z, dx, px, total, dy, py, total, w, h, FPS))


def layer(animate, index, duration, w, h, max_zoom, drift, grade=None):
    if animate:
        chain = [cover(int(w * 1.3), int(h * 1.3)),
                 kenburns(index, duration, w, h, max_zoom, drift)]
    else:
        chain = [cover(w, h)]
    if grade:
        chain.append(grade)
    return chain


def tilt_filters(deg):
    """⚠️ rotate는 귀퉁이를 검정으로 채우는 게 기본입니다. 투명하게 빼려면 rgba + c=none,
    ow/oh도 키워야 모서리가 안 잘립니다."""
    if not deg:
        return []
    rad = math.radians(deg)
    return ["format=rgba", "rotate=%.5f:c=none:ow=rotw(%.5f):oh=roth(%.5f)" % (rad, rad, rad)]


# ───────────────────────────────────────────────────────────────
# 장면 한 개 렌더
# ───────────────────────────────────────────────────────────────
def render_scene(image, caption, duration, out_path, index, effect, template,
                 hook, font_dir, font_name, narration=None, animate=True,
                 fade_in=False, fade_out=False, preset="veryfast", workdir=None):
    eff = EFFECTS.get(effect, EFFECTS["clean-zoom"])
    frame = eff["frame"]
    grade = eff["grade"]
    tilt = (eff["tilt"] if index % 2 == 0 else -eff["tilt"]) if eff["tilt"] else 0.0

    # 사진이면 한 장을 늘려 쓰고, 영상이면 "볼 만한 구간"을 잘라 씁니다.
    #
    # ⚠️ 영상 소재의 원래 소리는 빼고 무음으로 깝니다. 자동컷은 배경음악을 새로 까는
    # 편집이라, 클립마다 원래 소리가 튀어나오면 음악과 부딪혀서 오히려 지저분해집니다
    # (캡컷 자동컷도 기본이 이렇습니다). 원본 소리를 살리려면 narration 인자에 그 클립의
    # 오디오를 따로 뽑아서 넣어 주세요.
    src_is_video = is_video(image)
    if src_is_video:
        start = pick_best_window(image, duration)
        source_in = ["-ss", "%.3f" % start, "-t", str(duration), "-i", image]
        # 영상은 이미 움직입니다. 거기에 켄번즈까지 겹치면 어지럽고 인코딩만 느려집니다.
        animate = False
    elif image:
        source_in = ["-loop", "1", "-t", str(duration), "-i", image]
    else:
        source_in = None

    ass_path = os.path.join(workdir, "s%d.ass" % index)
    build_ass(ass_path, caption, duration, hook, template, font_name)
    subs = "subtitles=filename='%s'" % esc_path(ass_path)
    if font_dir:
        subs += ":fontsdir='%s'" % esc_path(font_dir)

    fades = []
    if fade_in:
        fades.append("fade=t=in:st=0:d=%s" % FADE_SEC)
    if fade_out:
        fades.append("fade=t=out:st=%.3f:d=%s" % (max(duration - FADE_SEC, 0), FADE_SEC))
    final = ",".join([subs] + fades + ["format=yuv420p"])

    audio_in = (["-i", narration] if narration else
                ["-f", "lavfi", "-t", str(duration), "-i",
                 "anullsrc=channel_layout=stereo:sample_rate=44100"])

    if image and frame in ("photocard", "whitecard"):
        flat = frame == "whitecard"
        cw = WHITECARD_CONTENT_W if flat else CARD_CONTENT_W
        ch = WHITECARD_CONTENT_H if flat else CARD_CONTENT_H
        bd = WHITECARD_BORDER if flat else CARD_BORDER
        card_w, card_h = cw + bd * 2, ch + bd * 2

        fg = ",".join(layer(animate, index, duration, cw, ch, eff["max_zoom"], eff["drift"], grade)
                      + ["pad=w=%d:h=%d:x=%d:y=%d:color=white" % (card_w, card_h, bd, bd)]
                      + tilt_filters(tilt))
        shadow = ",".join([("boxblur=12:2" if flat else "boxblur=16:2"),
                           "format=yuva420p",
                           "colorchannelmixer=aa=%s" % ("0.26" if flat else "0.4")]
                          + tilt_filters(tilt))

        parts = []
        if flat:
            parts.append("color=c=%s:s=%dx%d:r=%d:d=%s[bg]" % (WHITECARD_BG, W, H, FPS, duration))
            parts.append("[0:v]%s[card]" % fg)
        else:
            bg = ",".join(layer(animate, index, duration, W, H, 1.2, 0.08)
                          + ["gblur=sigma=36", "eq=brightness=-0.08:saturation=0.85"])
            parts.append("[0:v]split=2[fgsrc][bgsrc]")
            parts.append("[bgsrc]%s[bg]" % bg)
            parts.append("[fgsrc]%s[card]" % fg)
        parts.append("[1:v]%s[shadow]" % shadow)
        parts.append("[bg][shadow]overlay=x=(W-w)/2+15:y=(H-h)/2-%d+21:format=auto[bs]" % CARD_Y_OFFSET)
        parts.append("[bs][card]overlay=x=(W-w)/2:y=(H-h)/2-%d:format=auto[m]" % CARD_Y_OFFSET)
        parts.append("[m]%s[outv]" % final)

        args = ["-y"] + source_in + [
            "-f", "lavfi", "-t", str(duration), "-i",
            "color=c=black:s=%dx%d:r=%d" % (card_w, card_h, FPS)] + audio_in + [
            "-filter_complex", ";".join(parts), "-map", "[outv]", "-map", "2:a"]

    elif image and frame == "letterbox":
        band = ",".join(layer(animate, index, duration, W, LETTERBOX_BAND_H,
                              eff["max_zoom"], eff["drift"], grade))
        args = ["-y"] + source_in + audio_in + [
            "-filter_complex",
            ";".join(["color=c=black:s=%dx%d:r=%d:d=%s[bg]" % (W, H, FPS, duration),
                      "[0:v]%s[band]" % band,
                      "[bg][band]overlay=x=0:y=(H-h)/2[m]",
                      "[m]%s[outv]" % final]),
            "-map", "[outv]", "-map", "1:a"]

    else:
        if image:
            vf = ",".join(layer(animate, index, duration, W, H, eff["max_zoom"], eff["drift"], grade)
                          + [subs] + fades + ["format=yuv420p"])
            inp = source_in
        else:
            vf = ",".join([subs] + fades + ["fps=%d" % FPS, "format=yuv420p"])
            inp = ["-f", "lavfi", "-t", str(duration), "-i",
                   "color=c=0x1c1c2b:s=%dx%d:r=%d" % (W, H, FPS)]
        args = ["-y"] + inp + audio_in + ["-vf", vf, "-map", "0:v", "-map", "1:a"]

    # ⚠️ -shortest를 쓰면 안 됩니다. 나레이션이 장면보다 짧을 때 장면이 통째로 잘려서
    # 이어붙일 때 전환 offset이 어긋나고 영상이 깨집니다. apad로 뒤를 무음으로 채웁니다.
    args += ["-c:v", "libx264", "-preset", preset, "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-af", "apad", "-t", str(duration), out_path]
    run(args)


# ───────────────────────────────────────────────────────────────
# 흩뿌린 사진 인트로 (신발 편 도입부)
# ───────────────────────────────────────────────────────────────
def make_collage(images, out_png, count=12, seed=7):
    """사진 카드들을 흰 배경에 흩뿌려 쌓은 한 장을 만듭니다."""
    rnd = random.Random(seed)
    pics = (images * ((count // max(len(images), 1)) + 1))[:count]
    cw, chh, bd = 300, 400, 12

    inputs, chains, last = [], [], "base"
    chains.append("color=c=white:s=%dx%d:d=1[base]" % (W, H))
    cols, rows = 3, 4
    for i, img in enumerate(pics):
        inputs += ["-i", img]
        ang = math.radians(rnd.uniform(-14, 14))
        cx = int((i % cols + 0.5) * W / cols + rnd.uniform(-60, 60)) - (cw + bd * 2) // 2
        cy = int((i // cols + 0.5) * H / rows + rnd.uniform(-70, 70)) - (chh + bd * 2) // 2
        chains.append(
            "[%d:v]%s,pad=w=%d:h=%d:x=%d:y=%d:color=white,format=rgba,"
            "rotate=%.5f:c=none:ow=rotw(%.5f):oh=roth(%.5f)[c%d]"
            % (i, cover(cw, chh), cw + bd * 2, chh + bd * 2, bd, bd, ang, ang, ang, i))
        out = "m%d" % i
        chains.append("[%s][c%d]overlay=x=%d:y=%d:format=auto[%s]" % (last, i, cx, cy, out))
        last = out
    chains.append("[%s]format=rgb24[outv]" % last)
    run(["-y"] + inputs + ["-filter_complex", ";".join(chains),
                           "-map", "[outv]", "-frames:v", "1", out_png])


# ───────────────────────────────────────────────────────────────
# 이어붙이기
# ───────────────────────────────────────────────────────────────
def transition_at(effect, boundary):
    eff = EFFECTS.get(effect, EFFECTS["clean-zoom"])
    name = eff["transitions"][boundary % len(eff["transitions"])]
    return name if name in SAFE_TRANSITIONS else "fade"


def concat_hardcut(segments, out_path, workdir):
    lst = os.path.join(workdir, "list.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for s in segments:
            f.write("file '%s'\n" % s.replace("\\", "/").replace("'", "'\\''"))
    run(["-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out_path])


def concat_xfade(segments, durations, out_path, effect, workdir):
    """장면 경계마다 전환 효과를 바꿔 가며 이어붙입니다(두 개씩 순차 — 메모리 절약)."""
    if len(segments) == 1:
        shutil.copyfile(segments[0], out_path)
        return durations[0]
    eff = EFFECTS.get(effect, EFFECTS["clean-zoom"])
    cur, cum = segments[0], durations[0]
    for i in range(1, len(segments)):
        t = max(min(eff["transition_sec"], durations[i - 1], durations[i]) - 0.001, 0.05)
        offset = max(cum - t, 0)
        last = i == len(segments) - 1
        step = out_path if last else os.path.join(workdir, "x%d.mp4" % i)
        # ⚠️ settb/asettb로 타임베이스를 맞춘 뒤에 xfade를 겁니다.
        #
        # 사진에서 만든 장면과 영상 클립에서 만든 장면은 타임베이스가 다릅니다(영상은 원본
        # 것을 물려받습니다). 그대로 xfade에 넣으면 이렇게 통째로 실패합니다:
        #   "First input link main timebase (1/12288) do not match ... (1/15360)"
        # 실제로 영상+사진을 섞은 렌더에서 터졌던 오류라, 양쪽을 같은 기준으로 맞춰줍니다.
        run(["-y", "-i", cur, "-i", segments[i], "-filter_complex",
             "[0:v]settb=AVTB,fps=%d,format=yuv420p[v0];"
             "[1:v]settb=AVTB,fps=%d,format=yuv420p[v1];"
             "[0:a]asettb=AVTB,aresample=async=1:first_pts=0[a0];"
             "[1:a]asettb=AVTB,aresample=async=1:first_pts=0[a1];"
             "[v0][v1]xfade=transition=%s:duration=%.3f:offset=%.3f[v];"
             "[a0][a1]acrossfade=d=%.3f[a]"
             % (FPS, FPS, transition_at(effect, i - 1), t, offset, t),
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast"]
            + ([] if last else ["-crf", "18"])
            + ["-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", step])
        cum = cum + durations[i] - t
        cur = step
    return cum


def mux_bgm(video, bgm, total, out_path):
    run(["-y", "-i", video, "-stream_loop", "-1", "-i", bgm, "-filter_complex",
         "[0:a]volume=1.0[a0];[1:a]volume=%s,atrim=0:%.3f,asetpts=PTS-STARTPTS[a1];"
         "[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]" % (BGM_VOLUME, total),
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
         "-movflags", "+faststart", out_path])


# ───────────────────────────────────────────────────────────────
# 메인
# ───────────────────────────────────────────────────────────────
def render(scenes, out_path, effect="clean-zoom", template="bold-black", hook="",
           target_seconds=None, duration_per_scene=None, intro=None, bgm=None,
           voice=None, animate=True, font_dir=None, font_name=None,
           preset="veryfast", verbose=True):
    """
    scenes: [{"image": 경로, "caption": "문구", "narration": mp3경로(선택)}, ...]
    target_seconds: 15 / 28 등 — 영상 전체 길이를 맞춥니다(대략).
    intro: "scatter"면 사진들이 흩뿌려진 인트로를 맨 앞에 붙입니다.
    voice: "golden" / "chasurimi" / "none" — Voicebox로 장면 대사를 더빙합니다.
           (프로필 ID를 직접 넣어도 됩니다. None이면 더빙 없이 자막만.)
    """
    if not scenes:
        raise ValueError("장면이 없습니다.")
    if effect not in EFFECTS:
        raise ValueError("모르는 효과: %s (가능: %s)" % (effect, ", ".join(EFFECTS)))

    eff = EFFECTS[effect]
    if font_dir is None or font_name is None:
        fd, fn = find_font()
        font_dir = font_dir or fd
        font_name = font_name or fn

    if target_seconds:
        base = max(float(target_seconds) / len(scenes), 1.2)
    elif duration_per_scene:
        base = float(duration_per_scene)
    else:
        base = eff["pace"]

    workdir = tempfile.mkdtemp(prefix="goldencut-")
    try:
        # ⚠️ 더빙을 먼저 만듭니다. 장면 길이가 "말이 끝나는 시간"에 맞춰 늘어나야 해서,
        # 렌더를 시작하기 전에 음성 길이를 알고 있어야 합니다.
        voice_label = "음성 없이 자막만"
        if voice and str(voice).lower() != "none":
            from goldencut_voice import resolve_voice, narrate_scenes, is_ready
            profile_id, voice_label = resolve_voice(voice)
            ok, why = is_ready(profile_id=profile_id)
            if not ok:
                raise RuntimeError("더빙을 할 수 없습니다 — %s" % why)
            if verbose:
                _log("  더빙: %s" % voice_label)
            scenes, failed = narrate_scenes(scenes, workdir, profile_id, verbose=verbose)
            if failed and verbose:
                _log("  (%d개 장면은 더빙 실패 — 자막만 나갑니다)" % failed)

        segments, durations = [], []

        if intro == "scatter":
            imgs = [s["image"] for s in scenes if s.get("image") and os.path.exists(s["image"])]
            if imgs:
                png = os.path.join(workdir, "collage.png")
                make_collage(imgs, png)
                seg = os.path.join(workdir, "seg_intro.mp4")
                render_scene(png, "", 1.6, seg, 0, effect, template, hook,
                             font_dir, font_name, animate=animate, fade_in=True,
                             preset=preset, workdir=workdir)
                segments.append(seg); durations.append(1.6)
                if verbose:
                    _log("  인트로(흩뿌린 사진) 완료")

        for i, sc in enumerate(scenes):
            dur = max(base, min_duration_for(sc.get("caption", "")))
            narr = sc.get("narration")
            if narr and os.path.exists(narr):
                nd = probe_duration(narr)
                if nd:
                    dur = max(dur, nd + 0.4)
            else:
                narr = None
            seg = os.path.join(workdir, "seg%d.mp4" % i)
            render_scene(sc.get("image"), sc.get("caption", ""), dur, seg,
                         len(segments), effect, template, hook, font_dir, font_name,
                         narration=narr, animate=animate,
                         fade_in=(not segments), fade_out=(i == len(scenes) - 1),
                         preset=preset, workdir=workdir)
            segments.append(seg); durations.append(dur)
            if verbose:
                _log("  장면 %d/%d 완료 (%.1f초)" % (i + 1, len(scenes), dur))

        joined = os.path.join(workdir, "joined.mp4")
        if eff["use_transition"] and len(segments) > 1:
            total = concat_xfade(segments, durations, joined, effect, workdir)
        else:
            concat_hardcut(segments, joined, workdir)
            total = sum(durations)

        if bgm and os.path.exists(bgm):
            mux_bgm(joined, bgm, total, out_path)
        else:
            shutil.copyfile(joined, out_path)

        actual = probe_duration(out_path) or total
        if verbose:
            _log("완성: %s (%.2f초)" % (out_path, actual))
        return {"path": out_path, "duration": actual, "effect": effect,
                "label": eff["label"], "scenes": len(scenes), "voice": voice_label}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ───────────────────────────────────────────────────────────────
# 자기검사 — 샘플 사진을 만들어 6종을 전부 렌더
# ───────────────────────────────────────────────────────────────
def selftest(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    imgs = []
    colors = ["0x2E5A88", "0x8A5A2E", "0x2E8A5A", "0x8A2E5A"]
    for i, c in enumerate(colors):
        p = os.path.join(out_dir, "sample%d.jpg" % i)
        run(["-y", "-f", "lavfi", "-i",
             "color=c=%s:s=1080x1440,noise=alls=28:allf=t+u" % c,
             "-frames:v", "1", p])
        imgs.append(p)

    scenes = [
        {"image": imgs[0], "caption": "이 신발 *진짜* 편하다는 후기"},
        {"image": imgs[1], "caption": "굽이 *3cm*라 다리도 길어 보여요"},
        {"image": imgs[2], "caption": "여름엔 *양말 없이* 신어도 좋아요"},
        {"image": imgs[3], "caption": "자세한 내용은 블로그에서 확인해보세요"},
    ]

    ok, fail = 0, 0
    for name in EFFECTS:
        out = os.path.join(out_dir, "%s.mp4" % name)
        try:
            print("[%s] 렌더 중..." % name)
            r = render(scenes, out, effect=name, hook="여름 신발 추천",
                       target_seconds=15, intro=("scatter" if name == "whitecard-pop" else None),
                       preset="ultrafast", verbose=False)
            print("  OK  %-16s %.2f초" % (name, r["duration"]))
            ok += 1
        except Exception as e:
            print("  실패 %-16s %s" % (name, e))
            fail += 1
    print("\n결과: 성공 %d / 실패 %d — %s 를 열어서 직접 보세요." % (ok, fail, out_dir))
    return fail == 0


def main():
    ap = argparse.ArgumentParser(description="골든컷 자동컷 효과 엔진")
    ap.add_argument("--selftest", action="store_true", help="샘플로 6종 전부 렌더")
    ap.add_argument("--out-dir", default="./_goldencut_test")
    ap.add_argument("--scenes-json", help='[{"image":"a.jpg","caption":"문구"}] 형식 파일')
    ap.add_argument("--out", default="out.mp4")
    ap.add_argument("--effect", default="whitecard-pop", choices=list(EFFECTS))
    ap.add_argument("--template", default="bold-black", choices=list(TEMPLATES))
    ap.add_argument("--hook", default="")
    ap.add_argument("--seconds", type=float, help="영상 전체 길이 (15 / 28 등)")
    ap.add_argument("--intro", choices=["scatter"], help="흩뿌린 사진 인트로")
    ap.add_argument("--bgm")
    ap.add_argument("--voice", default=None,
                    help="더빙 목소리: golden / chasurimi / none (또는 Voicebox 프로필 ID)")
    # ⚠️ 다른 프로그램(작업실 등)이 이 스크립트를 불러 쓸 때를 위한 출력 모드입니다.
    # 사람이 읽는 진행 문구는 stderr로 보내고, stdout에는 결과 JSON 한 줄만 남깁니다.
    # 그래야 호출한 쪽이 stdout만 파싱하면 됩니다.
    ap.add_argument("--json", action="store_true", help="결과를 JSON 한 줄로 출력(프로그램 연동용)")
    ap.add_argument("--list", action="store_true", help="효과팩 목록만 보기")
    a = ap.parse_args()

    if a.list:
        if a.json:
            print(json.dumps([
                {"id": k, "label": v["label"], "frame": v["frame"],
                 "pace": v["pace"], "transitions": v["transitions"]}
                for k, v in EFFECTS.items()
            ], ensure_ascii=False))
        else:
            for k, v in EFFECTS.items():
                print("%-16s %-14s 액자=%-10s 컷%.1f초 전환=%s"
                      % (k, v["label"], v["frame"], v["pace"], "/".join(v["transitions"])))
        return 0
    if a.selftest:
        return 0 if selftest(a.out_dir) else 1
    if not a.scenes_json:
        ap.error("--scenes-json 또는 --selftest 가 필요합니다.")
    with open(a.scenes_json, encoding="utf-8") as f:
        scenes = json.load(f)
    try:
        result = render(scenes, a.out, effect=a.effect, template=a.template, hook=a.hook,
                        target_seconds=a.seconds, intro=a.intro, bgm=a.bgm, voice=a.voice,
                        # 진행 문구는 _log()가 stderr로 보내므로 --json이어도 켜둡니다.
                        # stdout은 결과 JSON 한 줄만 남아 깨끗하고, 부르는 쪽(작업실 화면)은
                        # stderr를 읽어서 "장면 3/8 완료" 같은 진행 상황을 보여줄 수 있습니다.
                        # 예전엔 여기가 verbose=not a.json 이라 --json으로 부르면 몇 분 동안
                        # 아무 소식이 없어서, 멈춘 건지 도는 건지 알 수가 없었습니다.
                        verbose=True)
    except Exception as e:
        if a.json:
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
            return 1
        raise
    if a.json:
        print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
