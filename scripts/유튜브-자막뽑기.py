# -*- coding: utf-8 -*-
"""유튜브 영상에서 글(자막)을 뽑는다. 자막이 있으면 자막을, 없으면 음성을 직접 알아듣는다.

왜 만들었나 (2026-09-04)
  킴스 미국주식 회원 전용 영상을 요약하려는데 두 겹으로 막혔다.
    ① 크롬 쿠키 — yt-dlp 가 "Could not copy Chrome cookie database". 복호화 실패가 아니라
       크롬이 켜져 있어서 파일이 잠긴 것이다. 파이어폭스 쿠키는 잘 읽힌다.
    ② 자막이 아예 없음 — 업로드 3시간이라 자동 자막이 아직 안 만들어졌다.
       유튜브 플레이어가 "자막 사용 불가"로 표시한다.
  ②는 쿠키를 풀어도 안 풀린다. 그래서 음성 인식 갈래를 같이 넣었다.

쓰는 법
  python 유튜브-자막뽑기.py "<링크>"              자막 우선, 없으면 음성 인식
  python 유튜브-자막뽑기.py "<링크>" --음성만      자막 무시하고 음성 인식
  python 유튜브-자막뽑기.py "<링크>" --쿠키 chrome  기본은 firefox

⚠️ GPU 는 하나뿐이고 다른 세션이 쓴다. 남은 메모리를 재서 부족하면 CPU 로 돈다.
   (_공용지식/함정/영상-제작.md — ComfyUI 같이 쓰다 12~20배 느려진 적 있음)
"""
import io, os, re, subprocess, sys, shutil, tempfile

sys.stdout.reconfigure(encoding="utf-8")

YTDLP = os.path.expanduser(
    r"~\AppData\Local\Microsoft\WinGet\Packages"
    r"\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\yt-dlp.exe")
if not os.path.exists(YTDLP):
    YTDLP = shutil.which("yt-dlp") or "yt-dlp"


def run(args, timeout=1800):
    p = subprocess.run(args, capture_output=True, timeout=timeout)
    out = (p.stdout or b"").decode("utf-8", "replace") + (p.stderr or b"").decode("utf-8", "replace")
    return p.returncode, out


def vtt_to_text(path):
    """VTT 에서 글자만 남긴다. 같은 줄이 이어서 반복되는 건 한 번만 남긴다."""
    t = io.open(path, encoding="utf-8", errors="replace").read()
    t = re.sub(r"^WEBVTT[\s\S]*?\n\n", "", t)
    out = []
    for line in t.split("\n"):
        s = line.strip()
        if not s or s.isdigit() or "-->" in s:
            continue
        if re.match(r"^(Kind|Language):", s):
            continue
        s = re.sub(r"<[^>]+>", "", s).strip()
        if s and (not out or out[-1] != s):
            out.append(s)
    return re.sub(r"\s+", " ", " ".join(out)).strip()


def 자막받기(url, work, cookies):
    """있으면 자막을 받아 글로 돌려준다. 없으면 None."""
    args = [YTDLP, "--skip-download", "--write-auto-subs", "--write-subs",
            "--sub-langs", "ko,ko-orig,en", "--sub-format", "vtt",
            "-o", os.path.join(work, "sub.%(ext)s"), "--no-warnings", url]
    if cookies:
        args[1:1] = ["--cookies-from-browser", cookies]
    code, out = run(args, timeout=300)
    if "members-only" in out.lower() or "Join this channel" in out:
        print("  ⚠ 회원 전용입니다. 쿠키를 읽을 브라우저에 그 계정으로 로그인돼 있어야 합니다.")
    vtts = [f for f in os.listdir(work) if f.endswith(".vtt")]
    if not vtts:
        return None

    # ⚠️ 파일이 큰 쪽을 고르면 안 된다. 영어 자동번역본이 한국어 원본보다 크다.
    #    2026-09-04 킴스 2부에서 실제로 영어(7,713자)를 집었다. 한국어 원본은 3,713자였다.
    #    말한 언어 그대로인 ko-orig 이 종목 이름·숫자가 가장 정확하다.
    순서 = [".ko-orig.vtt", ".ko.vtt", ".ko-ko.vtt", ".en.vtt"]
    def 우선(f):
        for i, suf in enumerate(순서):
            if f.endswith(suf):
                return (i, -os.path.getsize(os.path.join(work, f)))
        return (len(순서), -os.path.getsize(os.path.join(work, f)))

    pick = sorted(vtts, key=우선)[0]
    text = vtt_to_text(os.path.join(work, pick))
    if not pick.startswith("sub.ko"):
        print(f"  ⚠ 한국어 자막이 없어 {pick} 를 씁니다 (번역본이라 이름·숫자가 뭉개질 수 있습니다)")
    print(f"  자막 {pick} → {len(text):,}자")
    return text or None


def 음성받기(url, work, cookies):
    """음성만 내려받는다. 알아듣기용이라 화질·음질을 최소로 가져온다."""
    args = [YTDLP, "-f", "bestaudio/best", "-x", "--audio-format", "mp3",
            "--audio-quality", "5", "-o", os.path.join(work, "audio.%(ext)s"),
            "--no-warnings", url]
    if cookies:
        args[1:1] = ["--cookies-from-browser", cookies]
    code, out = run(args, timeout=1800)
    mp3 = os.path.join(work, "audio.mp3")
    if not os.path.exists(mp3):
        print("  음성 내려받기 실패:")
        for l in out.strip().split("\n")[-4:]:
            print("    " + l[:160])
        return None
    print(f"  음성 {os.path.getsize(mp3)/1048576:.1f}MB")
    return mp3


def 여유GPU():
    """남은 GPU 메모리(MB). 못 재면 0."""
    try:
        code, out = run(["nvidia-smi", "--query-gpu=memory.free",
                         "--format=csv,noheader,nounits"], timeout=20)
        return int(out.strip().split("\n")[0])
    except Exception:
        return 0


def 알아듣기(mp3):
    from faster_whisper import WhisperModel
    free = 여유GPU()
    # large-v3 는 float16 으로 약 5GB 를 쓴다. 여유가 7GB 넘을 때만 GPU 를 건드린다.
    if free >= 7000:
        model, device, compute = "large-v3", "cuda", "float16"
    else:
        model, device, compute = "small", "cpu", "int8"
        print(f"  GPU 여유 {free}MB — 다른 세션이 쓰는 중이라 CPU 로 돕니다")
    print(f"  모델 {model} · {device}/{compute}")
    m = WhisperModel(model, device=device, compute_type=compute)
    segs, info = m.transcribe(mp3, language="ko", vad_filter=True,
                              beam_size=5, condition_on_previous_text=False)
    parts, last = [], 0.0
    for s in segs:
        parts.append(s.text.strip())
        if s.end - last > 60:
            print(f"    {int(s.end)//60}분 지남…")
            last = s.end
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    url = sys.argv[1]
    음성만 = "--음성만" in sys.argv
    cookies = "firefox"
    if "--쿠키" in sys.argv:
        cookies = sys.argv[sys.argv.index("--쿠키") + 1]
    if "--쿠키없이" in sys.argv:
        cookies = None

    work = tempfile.mkdtemp(prefix="yt-text-")
    print(f"  쿠키: {cookies or '안 씀'}")
    try:
        text = None if 음성만 else 자막받기(url, work, cookies)
        if not text:
            if not 음성만:
                print("  자막이 없습니다 → 음성으로 갑니다")
            mp3 = 음성받기(url, work, cookies)
            if not mp3:
                print("\n  못 했습니다. 회원 전용이면 그 브라우저에 로그인이 되어 있어야 합니다.")
                return 2
            text = 알아듣기(mp3)

        out = os.path.abspath("transcript.txt")
        io.open(out, "w", encoding="utf-8").write(text)
        print(f"\n  글자 {len(text):,}자 → {out}")
        print("\n" + text[:400] + ("…" if len(text) > 400 else ""))
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
