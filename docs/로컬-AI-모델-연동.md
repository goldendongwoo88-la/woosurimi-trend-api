# 로컬 오픈소스 AI 모델 연동 (2026-09)

`docs/오픈소스-AI-모델-리서치-2026-09.md`에서 고른 4개 모델을 실제 코드에 연결한
기록입니다. `오픈소스-AI-모델-다운로드-가이드.md`로 사장님 PC에 모델을 받아두신 뒤,
아래 순서대로 켜두면 이 서버(로컬로 실행할 때)가 자동으로 그 모델들을 씁니다.

## 핵심 원칙 — 하나도 안 켜져 있어도 서버는 안 죽습니다

이 프로젝트의 기존 원칙(Claude API 키 없으면 템플릿으로 대체, Voicebox 안 켜져 있으면
나레이션 없이 진행)을 그대로 따릅니다. 4개 로컬 모델은 전부 **선택 사항**입니다. 안
켜져 있으면 아래처럼 조용히 예전 방식으로 돌아갑니다.

| 기능 | 모델 | 안 켜져 있을 때 |
|---|---|---|
| 카드뉴스 배경 | Z-Image Turbo | 스타일 그라디언트 배경 |
| 캐릭터 얼굴 고정 | musubi-tuner LoRA | 기존 클라우드 API(Gemini/OpenAI) 또는 프롬프트만 제공 |
| 배경음악 생성 | ACE-Step 1.5 | 기존 자체 제작 배경음 5종 라이브러리 |
| 자막 자동 받아쓰기 | faster-whisper | 유튜브 자막이 있으면 그걸 쓰고, 없으면 실패(직접 자막 입력) |
| 영상 편집(아웃페인팅) | Wan-VACE | 기존 크롭 방식(피사체 위치로 잘라내기) |
| 글로 영상 만들기 | LTX-2.5 / HunyuanVideo 1.5 / Wan 2.2 / MiniMax H3 중 워크플로에 넣은 것 | 이 기능만 빠짐(다른 기능엔 영향 없음) |
| 말하는 얼굴 | InfiniteTalk/MultiTalk (Wan2.1-I2V-14B-480P 베이스) | 이 기능만 빠짐 |
| 영상에 효과음 입히기 | HunyuanVideo-Foley | 이 기능만 빠짐(무음 영상 그대로 씀) |

지금 무엇이 켜져 있는지는 `GET /api/local-models/status` 하나로 확인할 수 있습니다.

## 1) ComfyUI — Z-Image Turbo · 캐릭터 LoRA · Wan-VACE

세 기능이 전부 로컬 ComfyUI 하나를 공유합니다(`src/comfyClient.js`).

1. 사장님 PC에 ComfyUI를 설치하고 켭니다(기본 주소 `http://127.0.0.1:8188`).
2. `.env`에 `COMFYUI_URL`을 등록합니다(기본값 그대로면 안 적어도 됩니다).
3. `workflows/README.md`를 보고, 필요한 워크플로(`zimage-cardnews.json`,
   `character-lora.json`, `vace-outpaint.json`)를 ComfyUI에서 직접 만들어
   `workflows/` 폴더에 넣습니다. 이 세 파일은 이 저장소에 미리 들어있지 않습니다 —
   ComfyUI 그래프는 설치 환경마다 달라서, 사장님이 실제로 돌려본 워크플로를 그대로
   써야 확실히 동작합니다.
4. 캐릭터 LoRA를 학습해 두셨다면(`musubi-tuner`), 그 LoRA 파일명을 `.env`의
   `LORA_ASSI_FILE` / `LORA_YEONHWA_FILE` / `LORA_DORYEONG_FILE`에 적습니다.

### 카드뉴스 배경 — 어디서 켜나

`POST /api/cardnews/render`에 `aiBackground=true`를 추가로 보내면, 사진이 없는 페이지의
배경을 Z-Image Turbo로 생성합니다. **글자는 여전히 fontkit이 그립니다** — 오픈 이미지
모델의 한글 렌더링은 아직 신뢰할 수 없다는 게 원래 리서치의 "가장 중요한 발견"이었고,
그 원칙을 그대로 지켰습니다. AI에게는 "글자 없는 배경"만 만들게 합니다.

### 캐릭터 얼굴 고정 — 어디서 켜나

`POST /api/characters/generate`를 호출하면 자동으로 ComfyUI(LoRA 포함)를 먼저 시도하고,
안 되면 기존 클라우드 API로 물러섭니다. `GET /api/characters/list` 응답의 `comfy` 필드로
지금 상태(ComfyUI 켜짐 여부, 워크플로 유무, 캐릭터별 LoRA 설정 여부)를 볼 수 있습니다.

### 영상 편집(아웃페인팅) — 어디서 켜나

`POST /api/long-to-shorts`에 `outpaint: true`를 추가하면, 기존 "피사체 위치로 잘라내기"
대신 Wan-VACE로 화면 양옆을 채워서 세로로 만듭니다. 로컬 GPU가 필요하고 크롭 방식보다
훨씬 느립니다 — 실패하면(ComfyUI 꺼짐, 시간 초과 등) 자동으로 크롭 방식으로 대체됩니다.

### 글로 영상 만들기 — 어디서 켜나 (2026-09 추가)

카드뉴스·캐릭터·아웃페인팅과 별개로, **완전히 새 영상을 텍스트에서 직접 생성**하는
독립 기능입니다. `workflows/video-generate.json`을 준비하면(LTX-2.5, HunyuanVideo 1.5,
Wan 2.2, MiniMax H3 중 어느 걸 넣으셨든 상관없습니다) 아래로 씁니다.

영상 생성은 몇 분~몇십 분 걸릴 수 있어 롱폼→쇼츠 자르기처럼 작업 ID를 먼저 받고,
따로 진행 상태를 확인하는 방식입니다.

```
POST /api/video-generate
{ "prompt": "노을 지는 해변, 파도가 잔잔히 밀려온다", "durationSec": 4 }
→ { "jobId": "a1b2c3d4", "message": "영상을 만들고 있습니다..." }

GET /api/video-generate/a1b2c3d4
→ { "state": "done", "result": { "publicPath": "/renders/gen-video-xxxx.mp4", ... } }
```

`state`는 `working` → `done` 또는 `failed`로 바뀝니다. `width`/`height`/`negativePrompt`/
`seed`도 선택적으로 넣을 수 있습니다.

⚠️ 참조 이미지·오디오까지 함께 넣는 방식(MiniMax H3의 참조 이미지/사운드 중심 고급 컷,
Wan 2.2의 캐릭터 애니메이션·인물 교체)은 아직 다루지 않습니다 — 필요해지면 별도로
추가할 수 있습니다.

### 말하는 얼굴 — 어디서 켜나 (2026-09 추가)

`workflows/talking-face.json`을 준비하면(InfiniteTalk/MultiTalk, Wan2.1-I2V-14B-480P
베이스 필요), 사진 한 장 + 목소리 오디오로 립싱크 영상을 만듭니다. 캐릭터 그림
(characterImage.js로 만든 것 포함)에 나레이션을 입혀 진행자처럼 쓸 수 있습니다.

```
POST /api/talking-face   (multipart: image, audio, width, height)
→ { "jobId": "..." }

GET /api/talking-face/a1b2c3d4
→ { "state": "done", "result": { "publicPath": "/renders/gen-talk-xxxx.mp4", ... } }
```

화면은 `/talking-face.html`에서 바로 쓸 수 있습니다. Apache 2.0이라 지역 제한 없이
상업적으로 쓸 수 있습니다.

### 영상에 효과음 입히기 — 어디서 켜나 (2026-09 추가)

`workflows/foley-sound.json`을 준비하면(HunyuanVideo-Foley), 이미 만든 무음 영상에
발소리·파도 소리 같은 효과음·배경 앰비언스를 자동으로 입힙니다. 목소리 나레이션이
아니라 효과음 전용입니다.

```
POST /api/foley-sound
{ "path": "/renders/gen-video-xxxx.mp4", "prompt": "파도 소리, 갈매기 울음소리" }
→ { "jobId": "..." }

GET /api/foley-sound/a1b2c3d4
→ { "state": "done", "result": { "publicPath": "/renders/gen-foley-xxxx.mp4", ... } }
```

화면은 `/foley-sound.html`에서 바로 쓸 수 있습니다.

⚠️ HunyuanVideo-Foley는 Tencent 커뮤니티 라이선스입니다 — HunyuanVideo 1.5와 같은
계열이라, 사용 전 라이선스 원문(지역 제한 조항 포함)을 직접 확인해 보시는 걸 권합니다.

## 2) ACE-Step 1.5 — 배경음악 생성

1. 사장님 PC에서 ACE-Step 1.5를 실행합니다(GitHub `ace-step/ACE-Step-1.5`).
2. `.env`의 `ACE_STEP_URL`을 실제 주소로 맞춥니다(실행 방식에 따라 기본 포트가 다를 수
   있습니다 — README에 안내된 주소를 확인하세요).
3. `POST /api/shortform/bgm-generate`에 `{ prompt, durationSec, lyrics }`를 보내면 새 곡을
   만들어 `assets/bgm/generated/`에 저장하고, 기존 5종 라이브러리와 같은 방식으로
   `/api/shortform/render`의 `bgmId`에 바로 넣을 수 있는 트랙 정보를 돌려줍니다.

⚠️ ACE-Step을 어떤 방식으로 실행했는지(기본 Gradio 데모 vs 직접 짠 서버)에 따라 실제
API 응답 형식이 다를 수 있습니다. `src/bgmGenerate.js` 머리말에 이 부분을 자세히
적어뒀습니다 — 안 맞으면 그 파일의 요청/응답 처리만 고치면 됩니다.

## 3) faster-whisper — 자막 자동 받아쓰기

1. 사장님 PC에서 faster-whisper를 로컬 서버로 띄웁니다(예: `whisper-asr-webservice`).
2. `.env`의 `FASTER_WHISPER_URL`을 맞춥니다.
3. `POST /api/long-to-shorts`에서 유튜브 영상에 자막이 하나도 없으면(자동자막도 없는
   경우), 예전엔 여기서 실패했지만 이제 faster-whisper가 켜져 있으면 영상을 직접 받아써서
   자막 없는 영상도 쇼츠로 자를 수 있습니다(`src/longToShorts.js`).

## 상태 확인

```
GET /api/local-models/status
```
```json
{
  "comfyui": { "running": true, "workflows": { "cardNewsBackground": true, "characterLora": false, "vaceOutpaint": false, "videoGenerate": true, "talkingFace": false, "foleySound": false } },
  "aceStep": { "running": false },
  "fasterWhisper": { "running": false }
}
```
