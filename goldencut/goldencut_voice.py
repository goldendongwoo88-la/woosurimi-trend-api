#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
골든컷 더빙(TTS) — 장면 대사를 목소리로 만듭니다.

⚠️ **로컬·무료만 씁니다.** 사장님 규칙대로 유료 API/크레딧은 쓰지 않습니다.
기본은 사장님 PC에서 돌고 있는 **Voicebox**입니다(골든 목소리 / 차수리미 목소리).

Voicebox 연동 규격 (이 저장소 src/voiceProvider.js와 똑같이 맞췄습니다)
--------------------------------------------------------------------
    POST {VOICEBOX_URL}/generate
    {"text": "...", "profile_id": "...", "engine": "qwen_custom_voice"}
    → 응답 본문이 오디오 바이너리

환경변수
--------
    VOICEBOX_URL         기본 http://127.0.0.1:17493
    VOICEBOX_PROFILE_ID  Voicebox에서 만든 목소리 프로필 ID (필수)
    VOICEBOX_ENGINE      기본 qwen_custom_voice

목소리 프로필 ID 확인: Voicebox 앱 화면 또는 GET {VOICEBOX_URL}/profiles
"""

import json
import os
import urllib.error
import urllib.request

DEFAULT_URL = "http://127.0.0.1:17493"
DEFAULT_ENGINE = "qwen_custom_voice"

# ───────────────────────────────────────────────────────────────
# 목소리 2종 — 골든 / 차수리미
#
# ⚠️ 프로필 ID는 Voicebox 앱 안에서 만든 값이라 사람마다 다릅니다. 코드에 박아두면
# 다른 PC(아내분 PC 포함)에서 안 맞으니 환경변수로 받습니다.
#
#   VOICEBOX_PROFILE_GOLDEN=골든_프로필ID
#   VOICEBOX_PROFILE_CHASURIMI=차수리미_프로필ID
#
# 둘 다 안 정해뒀으면 기존 VOICEBOX_PROFILE_ID를 씁니다(예전 설정 그대로 동작).
# 프로필 ID는 Voicebox 앱 화면이나 GET {VOICEBOX_URL}/profiles 로 확인합니다.
# ───────────────────────────────────────────────────────────────
VOICES = {
    "golden": {"label": "골든 목소리", "env": "VOICEBOX_PROFILE_GOLDEN"},
    "chasurimi": {"label": "차수리미 목소리", "env": "VOICEBOX_PROFILE_CHASURIMI"},
    "none": {"label": "음성 없이 자막만", "env": None},
}


def resolve_voice(voice):
    """
    'golden' / 'chasurimi' / 'none' / 프로필ID 문자열 / None 을 받아
    (프로필ID, 사람이 읽을 이름)으로 바꿔 줍니다. 더빙을 안 할 거면 (None, 이름).
    """
    if not voice:
        return None, "음성 없이 자막만"
    key = str(voice).strip().lower()
    if key == "none":
        return None, VOICES["none"]["label"]
    if key in VOICES:
        env = VOICES[key]["env"]
        pid = os.environ.get(env) or os.environ.get("VOICEBOX_PROFILE_ID")
        if not pid:
            raise RuntimeError(
                "%s의 프로필 ID를 못 찾았습니다. 환경변수 %s 를 설정해 주세요.\n"
                "  (Voicebox 앱 화면 또는 GET %s/profiles 에서 확인할 수 있습니다)"
                % (VOICES[key]["label"], env, os.environ.get("VOICEBOX_URL") or DEFAULT_URL))
        return pid, VOICES[key]["label"]
    # 이름이 아니라 프로필 ID를 직접 준 경우
    return str(voice), "직접 지정한 목소리"


def is_ready(base_url=None, profile_id=None):
    """Voicebox가 켜져 있고 목소리 프로필도 정해졌는지 — 영상 만들기 전에 확인용."""
    pid = profile_id or os.environ.get("VOICEBOX_PROFILE_ID")
    if not pid:
        return False, "목소리 프로필이 없습니다 — VOICEBOX_PROFILE_ID를 설정하거나 voice에 profile_id를 넣어주세요."
    url = (base_url or os.environ.get("VOICEBOX_URL") or DEFAULT_URL).rstrip("/")
    try:
        with urllib.request.urlopen(url + "/profiles", timeout=5):
            return True, "준비됨"
    except Exception as e:
        return False, "Voicebox에 연결하지 못했습니다(%s) — 앱이 켜져 있는지 확인해 주세요. (%s)" % (url, e)


def synthesize(text, out_path, profile_id=None, base_url=None, engine=None, timeout=120):
    """
    대사 한 줄을 오디오 파일로 만듭니다.

    ⚠️ 로컬 GPU 추론이라 클라우드보다 느릴 수 있어 타임아웃을 넉넉히 잡습니다.
    """
    pid = profile_id or os.environ.get("VOICEBOX_PROFILE_ID")
    if not pid:
        raise RuntimeError("Voicebox 목소리 프로필(profile_id)이 필요합니다.")
    url = (base_url or os.environ.get("VOICEBOX_URL") or DEFAULT_URL).rstrip("/")
    body = json.dumps({
        "text": text,
        "profile_id": pid,
        "engine": engine or os.environ.get("VOICEBOX_ENGINE") or DEFAULT_ENGINE,
    }).encode("utf-8")

    req = urllib.request.Request(url + "/generate", data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            audio = res.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:200]
        raise RuntimeError("Voicebox 오류(%s): %s" % (e.code, detail))
    except Exception as e:
        raise RuntimeError("Voicebox에 연결하지 못했습니다(%s) — 앱이 켜져 있는지 확인해 주세요. (%s)" % (url, e))

    if not audio:
        raise RuntimeError("Voicebox가 빈 응답을 보냈습니다.")
    with open(out_path, "wb") as f:
        f.write(audio)
    return out_path


def list_profiles(base_url=None, timeout=10):
    """Voicebox에 등록된 목소리 목록을 그대로 받아옵니다(형식은 버전마다 다를 수 있음)."""
    url = (base_url or os.environ.get("VOICEBOX_URL") or DEFAULT_URL).rstrip("/")
    with urllib.request.urlopen(url + "/profiles", timeout=timeout) as res:
        raw = res.read().decode("utf-8", "ignore")
    try:
        return json.loads(raw)
    except Exception:
        return raw


def _walk_profiles(data):
    """버전마다 응답 모양이 달라서, id/name 비슷한 키를 가진 것만 훑어 뽑습니다."""
    found = []

    def visit(node):
        if isinstance(node, dict):
            keys = {k.lower(): k for k in node}
            idk = next((keys[k] for k in ("id", "profile_id", "uuid", "profileid") if k in keys), None)
            namek = next((keys[k] for k in ("name", "title", "label", "display_name") if k in keys), None)
            if idk or namek:
                found.append({
                    "id": node.get(idk) if idk else None,
                    "name": node.get(namek) if namek else None,
                })
            for v in node.values():
                visit(v)
        elif isinstance(node, list):
            for v in node:
                visit(v)

    visit(data)
    return [f for f in found if f.get("id") or f.get("name")]


def check(base_url=None, engine=None, say=None, out_path=None):
    """
    Voicebox가 제대로 붙는지 한 번에 확인합니다.

    이 스크립트를 **사장님 PC에서** 돌려야 합니다 — 127.0.0.1은 그 PC 안의 주소라
    다른 컴퓨터(클라우드 포함)에서는 닿지 않습니다.
    """
    url = (base_url or os.environ.get("VOICEBOX_URL") or DEFAULT_URL).rstrip("/")
    print("Voicebox 주소: %s" % url)

    try:
        data = list_profiles(url)
    except Exception as e:
        print("\n❌ 연결 실패: %s" % e)
        print("   · Voicebox 앱이 켜져 있는지 확인해 주세요.")
        print("   · 포트가 다르면 VOICEBOX_URL 환경변수로 알려주세요.")
        return 1

    print("✅ 연결됨\n")
    profiles = _walk_profiles(data)
    if profiles:
        print("등록된 목소리:")
        for p in profiles:
            print("  · 이름=%s  id=%s" % (p.get("name"), p.get("id")))
        print("\n환경변수에 이렇게 넣으시면 됩니다(이름을 보고 맞는 id를 골라 넣으세요):")
        print("  set VOICEBOX_PROFILE_GOLDEN=<골든 보이스의 id>")
        print("  set VOICEBOX_PROFILE_CHASURIMI=<차수리미 보이스의 id>")
    else:
        print("목소리 목록을 해석하지 못했습니다. 아래 원본을 그대로 보고 id를 찾아주세요:\n")
        print(json.dumps(data, ensure_ascii=False, indent=2)[:2000]
              if not isinstance(data, str) else data[:2000])

    if say:
        pid = os.environ.get("VOICEBOX_PROFILE_GOLDEN") or os.environ.get("VOICEBOX_PROFILE_ID")
        if profiles and not pid:
            pid = profiles[0].get("id") or profiles[0].get("name")
        dest = out_path or "voicebox_test.mp3"
        print("\n시험 삼아 한 줄 읽어봅니다 (profile_id=%s)" % pid)
        try:
            synthesize(say, dest, pid, url, engine)
            print("✅ 저장됨: %s — 들어보시고 소리가 나오면 성공입니다." % dest)
        except Exception as e:
            print("❌ 실패: %s" % e)
            print("   엔진 이름이 다를 수 있습니다. 화면에 'Qwen3-TTS 1.7B'로 보인다면:")
            print("   python goldencut_voice.py --check --say \"테스트\" --engine qwen3-tts-1.7b")
            return 1
    return 0


def narrate_scenes(scenes, workdir, profile_id=None, base_url=None, engine=None, verbose=True):
    """
    장면마다 대사를 읽어 mp3를 만들고, scene["narration"]에 경로를 채워 돌려줍니다.

    ⚠️ 자막에 쓰는 *별표* 강조 표시는 읽으면 안 되니까 지우고 넘깁니다.
    ⚠️ 한 장면이 실패해도 나머지는 계속 갑니다 — 그 장면만 자막으로만 나갑니다.
    """
    out, failed = [], 0
    for i, sc in enumerate(scenes):
        sc = dict(sc)
        text = str(sc.get("caption") or "").replace("*", "").strip()
        if sc.get("narration") or not text:
            out.append(sc)
            continue
        dest = os.path.join(workdir, "narr%d.mp3" % i)
        try:
            synthesize(text, dest, profile_id, base_url, engine)
            sc["narration"] = dest
            if verbose:
                print("  더빙 %d/%d 완료" % (i + 1, len(scenes)))
        except Exception as e:
            failed += 1
            if verbose:
                print("  더빙 %d/%d 실패(자막만 나갑니다): %s" % (i + 1, len(scenes), e))
        out.append(sc)
    return out, failed


def main():
    import argparse
    ap = argparse.ArgumentParser(description="골든컷 더빙(Voicebox) 점검·테스트")
    ap.add_argument("--check", action="store_true", help="연결·목소리 목록 확인")
    ap.add_argument("--say", help="이 문장을 실제로 읽혀서 mp3로 저장(소리 확인용)")
    ap.add_argument("--out", help="--say 결과 저장 경로 (기본 voicebox_test.mp3)")
    ap.add_argument("--url", help="Voicebox 주소 (기본 http://127.0.0.1:17493)")
    ap.add_argument("--engine", help="엔진 이름 (기본 qwen_custom_voice)")
    a = ap.parse_args()
    if not a.check and not a.say:
        ap.error("--check 또는 --say 가 필요합니다.")
    return check(a.url, a.engine, a.say, a.out)


if __name__ == "__main__":
    import sys
    sys.exit(main())
