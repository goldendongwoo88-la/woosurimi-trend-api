# 골든컷 — 자동컷 · 자동 캡션 엔진

> ## ⚠️ 받아 가시기 전에 — 영상이 조용히 잘리던 결함을 고쳤습니다 (2026-09-18)
>
> **`main` 브랜치의 엔진에는 아직 이 수정이 없습니다.** 반드시 아래 브랜치에서 받아가세요.
> `claude/open-source-video-ai-models-vbuq8j` (커밋 `3e23756`) — `main` 으로 PR 올려둡니다.
>
> **증상** — `--seconds 15` 로 장면 6개를 만들면 장면은 6개 다 만들어지는데, 결과 영상의
> **그림이 2.17초(65프레임)만** 들어갑니다. 그런데 `ffprobe` 컨테이너 length는 13.99초로
> 나와서 정상처럼 보입니다.
>
> **원인** — 사진 입력에 `-loop 1` 만 주고 `-framerate` 를 안 줬습니다. ffmpeg는 이때
> 25fps로 디코딩하는데 출력은 30fps라, 모든 사진 장면의 그림이 정확히 25/30 = **5/6로**
> 짧아집니다. 한 장면만 보면 "좀 짧네" 정도지만, `xfade` offset은 의도한 길이로 계산되므로
> 실제 그림 길이를 넘어서고, 그 뒤 단계가 연쇄로 무너져 **마지막 장면 하나만 남습니다.**
>
> **고친 줄** (`goldencut_effects.py`)
> ```python
> source_in = ["-loop", "1", "-framerate", str(FPS), "-t", str(duration), "-i", image]
> ```
>
> **확인한 숫자**
>
> | | 고치기 전 | 고친 후 |
> |---|---|---|
> | 장면 1개 · 5초 요청 | 그림 4.167초 / 125프레임 | **5.000초 / 150프레임** |
> | 장면 6개+배경음악 · 15초 요청 | 그림 2.17초 / **65프레임** | **13.9초 / 417프레임** |
> | 장면 6개 · 28초 요청 | — | **28.0초 / 840프레임** |
>
> ---
>
> ### 🔴 이것만은 꼭 확인해 주세요 — 테스트가 통과해도 이 결함은 지나갑니다
>
> `ffprobe -show_entries format=duration`(**컨테이너 길이**)은 영상과 소리 중 **긴 쪽**을
> 돌려줍니다. 장면 소리는 `apad`로 목표 길이까지 채워지므로, **그림이 잘려도 이 값은
> 멀쩡해 보입니다.** 저도 이것 때문에 앞선 렌더를 "정상 출력"이라고 잘못 보고했습니다.
>
> 길이 검증은 반드시 **영상 스트림만** 따로 재세요:
>
> ```bash
> ffprobe -v error -select_streams v:0 -show_entries stream=duration,nb_frames -of csv=p=0 <파일>
> ```
>
> 갖고 계신 테스트 중 길이를 보는 것이 있다면 `-select_streams v:0` 기준인지 한 번
> 봐주시기 바랍니다. 컨테이너 길이로만 확인하는 테스트는 이 결함을 잡지 못합니다.
>
> 엔진에는 완성 직전에 **그림 길이가 목표의 85% 미만이면 성공으로 내주지 않고 실패시키는
> 검사**도 넣었습니다. 앞으로 같은 종류의 잘림은 조용히 지나가지 않습니다.


캡컷의 **자동컷**과 **자동 캡션**을 로컬에서 돌리는 파이썬 엔진입니다.
pip 설치 없이 **ffmpeg/ffprobe만** 있으면 돌아갑니다(자동 캡션의 받아쓰기만 예외).

> 이 폴더는 사장님 PC의 골든컷(`C:\...\outputs\GoldenCut`)에 그대로 복사해서 쓰라고
> 만든 것입니다. 이 저장소의 Node 쇼츠생성기와 같은 규격이지만, 골든컷이 파이썬이라
> 파이썬으로 옮겨 담았습니다.

---

## 1. 자동컷 — `goldencut_effects.py`

사진/영상을 넣으면 효과·전환·컷 속도를 자동으로 입혀 숏폼을 만듭니다.

```bash
# 먼저 이것부터 — 샘플을 만들어 효과팩 6종을 전부 렌더합니다
python goldencut_effects.py --selftest --out-dir ./_test

# 효과팩 목록
python goldencut_effects.py --list

# 실제 사용
python goldencut_effects.py --scenes-json scenes.json --out out.mp4 \
  --effect whitecard-pop --hook "여름 신발 추천" --seconds 15 --intro scatter
```

`scenes.json` — **사진과 영상을 섞어서** 넣을 수 있습니다:

```json
[
  {"image": "clip1.mp4", "caption": "영상은 *좋은 구간*을 알아서 골라요"},
  {"image": "photo.jpg", "caption": "사진과 *섞어* 써도 됩니다"}
]
```

파이썬에서 직접:

```python
from goldencut_effects import render, EFFECTS
render(scenes, "out.mp4", effect="whitecard-pop", hook="제목", target_seconds=15)
```

### 효과팩 6종

| id | 액자 | 컷 간격 | 전환 | 어울리는 소재 |
|---|---|---|---|---|
| `clean-zoom` | 꽉 채우기 | 3.2초 | 하드컷 | 기본값 |
| `photocard-drift` | 흰 카드 + 흐린 배경 | 2.8초 | fade/dissolve | 감성·매장 |
| `whitecard-pop` | 흰 카드 + 밝은 배경 | 1.9초 | 좌우 슬라이드 | 제품컷 |
| `vivid-punch` | 꽉 채우기 | 2.2초 | 흐림·번쩍·줌 | 세일·후킹 |
| `film-strip` | 시네마 레터박스 | 3.6초 | 검은 디졸브 | 사주·스토리 |
| `soft-bloom` | 꽉 채우기 | 3.0초 | 원형 | 뷰티·웨딩 |

숫자는 캡컷 자동컷 영상 3편을 프레임 단위로 실측해서 뽑은 값입니다
(신발 편 컷 간격 **1.29초**, 카드 기울기 **±1.6°** 등).

**영상 소재를 넣으면** 장면 변화 점수를 재서 *움직임이 가장 많은 구간*을 자동으로
골라냅니다 — 이게 "자동"컷의 핵심입니다.

⚠️ 영상 소재의 **원래 소리는 빼고 무음**으로 깝니다. 자동컷은 배경음악을 새로 까는
편집이라 클립마다 원래 소리가 튀면 음악과 부딪힙니다(캡컷도 기본이 이렇습니다).
원본 소리를 살리려면 그 클립 오디오를 따로 뽑아 `narration`으로 넣으세요.

### 더빙 목소리 (Voicebox, 로컬·무료)

```bash
python goldencut_effects.py --scenes-json scenes.json --out out.mp4 --voice golden
python goldencut_effects.py --scenes-json scenes.json --out out.mp4 --voice chasurimi
python goldencut_effects.py --scenes-json scenes.json --out out.mp4 --voice none   # 자막만
```

프로필 ID는 PC마다 달라서 **환경변수로** 받습니다(코드에 박으면 아내분 PC에서 안 맞습니다):

```
VOICEBOX_URL=http://127.0.0.1:17493
VOICEBOX_PROFILE_GOLDEN=골든_프로필ID
VOICEBOX_PROFILE_CHASURIMI=차수리미_프로필ID
```

프로필 ID는 Voicebox 앱 화면 또는 `GET {VOICEBOX_URL}/profiles`에서 확인합니다.

⚠️ 더빙은 **장면 렌더보다 먼저** 만듭니다. 장면 길이가 "말이 끝나는 시간"에 맞춰
늘어나야 해서, 음성 길이를 미리 알아야 하기 때문입니다.
⚠️ 자막의 `*별표*` 강조 표시는 읽지 않도록 빼고 넘깁니다.
⚠️ 한 장면 더빙이 실패해도 나머지는 계속 갑니다 — 그 장면만 자막으로 나갑니다.

### 기존 골든컷 코드에 붙이는 방법

`goldencut_effects.py`는 **전처리 단계가 아니라 렌더 경로 전체를 대신하는 모듈**입니다.
장면 필터 → 자막 굽기 → 이어붙이기 → 오디오 믹싱까지 한 번에 합니다.
그래서 붙이는 방식이 두 가지입니다.

**① 통째로 갈아끼우기 (권장)**

`render_autocut()` / `autocut_titles.render()` 자리에 `goldencut_effects.render()`를
그대로 넣습니다. 자막·전환·믹싱을 이쪽이 다 하므로 `template_filter()`,
`motion_templates.py`, `ass_document` 경로는 쓰이지 않습니다.

```python
from goldencut_effects import render
render(scenes, out_path, effect="whitecard-pop", hook=title,
       target_seconds=15, voice="golden")
```

**② 화면 연출만 가져다 쓰기 (기존 자막 파이프라인 유지)**

기존 ASS 자막(`autocut_titles.py`)을 계속 쓰고 싶으면 아래 3개만 떼어 갑니다.

| 가져갈 것 | 대응되는 기존 코드 |
|---|---|
| `EFFECTS` 딕셔너리 (액자·색보정·줌·컷속도) | `template_filter(look, ...)` / `motion_templates.py` |
| `layer()` + `kenburns()` + `tilt_filters()` | `template_filter`의 필터 문자열 조립부 |
| `transition_at()` + `concat_xfade()` | 장면 이어붙이는 부분 |

이때 `render_scene()`은 쓰지 마세요 — 그 안에 자막 굽기가 들어있어서 기존 자막과 두 번
겹칩니다.

**장면 길이 계산은 서로 같습니다.** 이쪽도 내레이션이 있으면 그 길이를 따라갑니다:

```
장면 길이 = max(기준 길이, 자막 읽는 최소 시간, 내레이션 길이 + 0.4초)
```

기준 길이는 `target_seconds / 장면수`(15초·28초 모드) 또는 효과팩의 `pace`입니다.
`SPEECH_CPS` 같은 글자수 기준으로 원고를 이미 맞춰두셨다면, `target_seconds`를 주지 말고
내레이션만 넣으면 그 길이를 그대로 따라갑니다.

---

## 2. 자동 캡션 — `goldencut_caption.py`

영상의 말소리를 받아써서 자막을 자동으로 넣습니다. **단어별 강조**(지금 말하는 단어만
색이 바뀌는 캡컷 효과)가 기본으로 켜져 있습니다.

```bash
# 자동으로 받아써서 자막 굽기
python goldencut_caption.py --video in.mp4 --out out.mp4

# 받아쓴 걸 먼저 고치고 싶을 때 (고유명사·브랜드명이 자주 틀립니다)
python goldencut_caption.py --video in.mp4 --export-srt cap.srt
#   cap.srt를 메모장에서 고친 뒤
python goldencut_caption.py --video in.mp4 --srt cap.srt --out out.mp4

# 단어별 강조 끄기 / 자막 색 바꾸기
python goldencut_caption.py --video in.mp4 --out out.mp4 --no-karaoke --template vivid-yellow
```

받아쓰기 엔진은 **로컬·무료인 것부터** 순서대로 찾습니다:

1. `faster-whisper` 파이썬 패키지 ← **권장**. `pip install faster-whisper`
2. whisper-asr-webservice HTTP 서버 (`FASTER_WHISPER_URL`)
3. 둘 다 없으면 → `--srt`로 직접 쓴 자막만 사용

4090이면 처음 한 번 모델(large-v3, 약 3GB)을 받고 나서는 GPU로 빠르게 돕니다.

---

## 3. 조사 결과 — 받을 수 있는 것 / 없는 것 (2026-09-18)

### Seedance 2.0 → ❌ **받을 수 없습니다**

ByteDance 공식 GitHub·Hugging Face에 **가중치가 공개되지 않았습니다.** Volcano Engine /
BytePlus **API 전용 상용 모델**입니다. 공개된 건 논문과 API 클라이언트뿐입니다.

⚠️ Hugging Face에 `seedance2ai/...`, `wsda/Seedance-2-0` 같은 게 검색되는데 **전부
제3자가 만든 홍보용 더미**입니다. 진짜 가중치가 아니니 받지 마세요.

→ 대안은 없습니다. **이미 받아두신 Wan 2.2(Apache 2.0)와 LTX-2.5가 현재 오픈웨이트
최상급**입니다. 텍스트→영상 쪽은 새로 받을 게 없습니다.

### build.nvidia.com (NVIDIA NIM) → ⚠️ **대부분 다운로드가 아닙니다**

NIM 카탈로그는 **호스팅 API 엔드포인트**이고, 자가호스팅용 NIM 컨테이너는 NVIDIA AI
Enterprise 라이선스가 필요합니다. "카탈로그에서 전부 다운로드"는 불가능합니다.

그중 **따로 오픈웨이트로 풀려 있고 쓸모 있는 것**만:

| 용도 | 저장소 | 라이선스 | 4090 |
|---|---|---|---|
| 자막(한국어 O) | `nvidia/nemotron-3.5-asr-streaming-0.6b` | OpenMDW-1.1, 상업 OK, 한국 제외 없음 | 여유 (~1.2GB) |
| 썸네일 | Qwen-Image | Apache 2.0 | 가능 |

**받지 마세요:**
- `nvidia/parakeet-tdt-0.6b-v3`, `nvidia/canary-1b-v2` — **한국어를 지원하지 않습니다**(유럽 25개어 전용)
- FLUX.1-dev — **비상업 라이선스**(NoobAI-XL과 같은 이유로 탈락)

영상 자동 편집용 모델은 NIM 카탈로그에 없습니다.

### 자동 자막 모델 선택 → **현행 faster-whisper large-v3 유지 권장**

- Parakeet/Canary는 한국어 미지원이라 후보에서 탈락
- faster-whisper와 Nemotron 3.5 ASR 둘 다 **단어 단위 타임스탬프 지원**(캡컷식 단어 강조 가능)
- 한국어 정확도 공식 비교치는 확인되지 않았습니다 — 바꿀 이유가 뚜렷하지 않으면 현행 유지가 안전
- 단어 싱크를 더 정밀하게 하고 싶다면 **모델 교체보다 WhisperX 정렬을 붙이는 게 효과가 큽니다**

⚠️ 위 조사는 이 세션에서 `huggingface.co`·`build.nvidia.com` 직접 접속이 막힌 상태에서
검색 결과와 GitHub API로 교차확인한 것입니다. **실제로 받기 전에 모델 카드의 라이선스를
한 번 더 직접 확인**해 보세요.

---

## 4. 검증 기록

| 항목 | 결과 |
|---|---|
| 효과팩 6종 렌더 | ✅ 6/6 성공 (`--selftest`) |
| 영상+사진 섞어서 | ✅ 성공 — 영상에서 움직임 많은 구간 자동 선택 확인 |
| 길이 맞추기 | ✅ 15초 요청 → 14.21초 / 28초 요청 → 26.58초 |
| 자막 단어별 강조 | ✅ 프레임으로 확인 (1.3초 "이" → 2.2초 "선크림"으로 강조 이동) |
| .srt 내보내기/불러오기 | ✅ 왕복 확인 |
| 받아쓰기(ASR) | ⚠️ **미검증** — 이 환경에 whisper가 없어서 못 돌려봤습니다. 사장님 PC에서 확인 필요 |
| 목소리 선택(골든/차수리미) | ⚠️ **이름 해석만 검증** — 이 환경에 Voicebox가 없어 실제 더빙은 사장님 PC에서 확인 필요 |
