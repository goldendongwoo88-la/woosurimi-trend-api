# 오픈소스 AI 모델 다운로드 가이드 (2026-09 기준)

> 이 문서는 이전 리서치(카드뉴스·영상·얼굴학습용 오픈소스 AI 스택 조사)에서 추천한 8개 모델을
> **사용자님의 실제 PC에서** 직접 받을 수 있도록 정리한 명령어 모음입니다.
>
> ⚠️ **왜 Claude가 대신 받아주지 못하는가** — 이 세션은 사용자님의 PC가 아니라 클라우드
> 컨테이너에서 실행됩니다. 사용자님 컴퓨터 디스크에 접근할 방법이 없고, 이 세션에는
> Microsoft OneDrive 연결도 없습니다(Google Drive만 연결되어 있음). 그래서 "PC/OneDrive에
> 있는지 확인하고 없으면 받기"는 이 대화창에서는 실행이 안 되고, 아래 명령어를 사용자님
> PC의 명령 프롬프트(또는 PowerShell)에 직접 붙여넣어야 합니다. 받은 폴더를 OneDrive
> 동기화 폴더 밑으로 옮기면 자동으로 OneDrive에도 백업됩니다.
>
> ⚠️ **용량 경고** — 8개를 전부 받으면 대략 **200~250GB 이상**입니다. 한 번에 다 받기보다,
> 지금 당장 쓸 것부터 받는 걸 권장합니다. 아래 표에 항목별 대략 용량을 적어뒀습니다.

## 0. 공통 준비 (한 번만)

```bash
pip install -U "huggingface_hub[cli]"
hf auth login   # huggingface.co 계정으로 로그인 (토큰은 huggingface.co/settings/tokens 에서 발급)
```

일부 모델(Qwen 계열 등)은 로그인 없이도 받아지지만, 로그인해두면 속도 제한이나 raten limit
문제가 줄어듭니다.

---

## 1. LTX-2.5 — 영상 제작 (영상+소리 동시 생성) — 1순위 추천

- Hugging Face: https://huggingface.co/Lightricks/LTX-2.5
- GitHub: https://github.com/Lightricks/LTX-2
- 라이선스: 연매출 1,000만 달러 미만이면 무료(초과 시 별도 협의 필요 — 개인 크리에이터는 해당 없음)
- 용량: 핵심 구성요소만 받아도 **약 66GB**

```bash
hf download Lightricks/LTX-2.5 ^
  diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors ^
  text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors ^
  vae/ltx-2.5-video-vae-bf16.safetensors ^
  vae/ltx-2.5-audio-vae-bf16.safetensors ^
  latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors ^
  --local-dir models\ltx-2.5
```
(Windows cmd는 줄바꿈에 `^` 사용. PowerShell이면 `^` 대신 백틱 `` ` ``, Mac/Linux면 `\` 사용)

Apple Silicon(맥)이라면 MLX 변환판도 있습니다: `mlx-community/ltx-2.5-mlx`

---

## 2. Wan 2.2 — 영상 제작 (안전빵, 커뮤니티/문서 압도적으로 많음)

- Hugging Face 조직: https://huggingface.co/Wan-AI
- 라이선스: Apache-2.0 (완전 상업적 사용 가능)
- 용도별로 모델이 나뉘어 있으니 **필요한 것 하나만** 받으세요.

| 변형 | 용도 | 대략 용량|
|---|---|---|
| `Wan-AI/Wan2.2-TI2V-5B` | 가벼운 버전, 720p, 글→영상+이미지→영상 겸용 | ~12GB |
| `Wan-AI/Wan2.2-T2V-A14B` | 고품질 텍스트→영상 (MoE, 두 전문가 모델 포함) | ~50GB+ |
| `Wan-AI/Wan2.2-I2V-A14B` | 고품질 이미지→영상 | ~50GB+ |
| `Wan-AI/Wan2.2-S2V-14B` | 오디오 기반 영상 생성 | ~30GB |

```bash
# 저사양/입문용
hf download Wan-AI/Wan2.2-TI2V-5B --local-dir models/Wan2.2-TI2V-5B

# 고사양 GPU (24GB+ VRAM)라면
hf download Wan-AI/Wan2.2-T2V-A14B --local-dir models/Wan2.2-T2V-A14B
```

---

## 3. Wan-VACE — 영상 편집

⚠️ **중요 정정**: 공식적으로 관리되는 VACE는 **Wan 2.1** 기준입니다(`Wan-AI/Wan2.1-VACE-14B`).
Wan 2.2용 VACE는 아직 Wan-AI의 공식 배포가 아니라 커뮤니티 실험판(`lym00/...`,
`Pyros13/...` 등)만 있어서, 안정성을 원하면 아래 Wan2.1 공식판을 권장합니다.

- Hugging Face: https://huggingface.co/Wan-AI/Wan2.1-VACE-14B
- 라이선스: Apache-2.0
- 용량: 약 30GB

```bash
hf download Wan-AI/Wan2.1-VACE-14B --local-dir models/Wan2.1-VACE-14B
```

---

## 4. musubi-tuner + Z-Image — 얼굴 학습(LoRA 트레이닝)

musubi-tuner는 "모델"이 아니라 **학습 도구(코드)**입니다. 용량은 작고(1GB 미만), 여기에
아래 Z-Image Turbo 같은 베이스 모델을 넣어서 LoRA를 학습시키는 방식입니다.

```bash
git clone https://github.com/kohya-ss/musubi-tuner.git
cd musubi-tuner
pip install -e .
```

Z-Image / Qwen-Image 등 베이스 모델과 HunyuanVideo 1.5 학습을 지원합니다(자세한 설정은
저장소 README 참고).

---

## 5. Z-Image Turbo — 카드뉴스 그림 생성

- Hugging Face: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo
- GitHub: https://github.com/Tongyi-MAI/Z-Image
- 라이선스: **Apache-2.0** (완전 상업적 사용 가능)
- 6B 파라미터, 16GB VRAM 소비자 GPU에서 구동 가능. 오픈소스 이미지 모델 중 텍스트(한글 포함
  이중언어) 렌더링이 강점.
- 용량: 약 12~14GB

```bash
hf download Tongyi-MAI/Z-Image-Turbo --local-dir models/Z-Image-Turbo
```

---

## 6. InfiniteTalk — 말하는 얼굴(립싱크/아바타)

- Hugging Face: https://huggingface.co/MeiGen-AI/InfiniteTalk
- GitHub: https://github.com/MeiGen-AI/InfiniteTalk
- 라이선스: Apache-2.0

⚠️ 저장소 전체는 **약 169GB**(여러 정밀도 버전이 다 들어있음)입니다. 웬만하면 전체를 받지
말고, ComfyUI용 단일 파일만 받으세요. 단, 이 파일은 **베이스로 Wan2.1-I2V-14B가 별도로
필요**합니다(구동에 필요한 별도 다운로드).

```bash
# InfiniteTalk 단일 파일만 (전체 169GB 대신 이것만)
hf download MeiGen-AI/InfiniteTalk comfyui/infinitetalk_single.safetensors --local-dir models/InfiniteTalk

# 구동에 필요한 베이스 모델 (Wan2.1 이미지→영상, 약 30GB)
hf download Wan-AI/Wan2.1-I2V-14B-480P --local-dir models/Wan2.1-I2V-14B-480P
```

---

## 7. Qwen-Image-Edit-2511 — 그림 수정(합성/리라이팅)

- Hugging Face: https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- 라이선스: Apache-2.0
- 20B급 모델이라 무겁습니다(약 40GB+). 저사양 GPU라면 경량화판을 대신 쓰세요.

```bash
# 정식판 (고사양)
hf download Qwen/Qwen-Image-Edit-2511 --local-dir models/Qwen-Image-Edit-2511

# 저사양 GPU 대안 — 속도/용량 최적화판
hf download lightx2v/Qwen-Image-Edit-2511-Lightning --local-dir models/Qwen-Image-Edit-2511-Lightning
```

---

## 8. ACE-Step 1.5 — 배경음악 생성

- GitHub: https://github.com/ace-step/ACE-Step-1.5
- Hugging Face 조직: https://huggingface.co/ACE-Step
- 4GB 미만 VRAM으로 구동 가능할 만큼 가벼움. 텍스트(+가사)로 10초~10분 스테레오 음악 생성.

```bash
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5
pip install -r requirements.txt
# 정확한 체크포인트 저장소 이름은 저장소 README의 "Download" 안내를 따라 받으세요
# (Hugging Face에 여러 버전이 있어 README가 최신 정식 경로를 가리킵니다)
```

---

## 용량 요약 (전부 받을 경우)

| 모델 | 대략 용량 |
|---|---|
| LTX-2.5 | ~66GB |
| Wan 2.2 (변형 1개 기준) | ~12~50GB |
| Wan2.1-VACE-14B | ~30GB |
| musubi-tuner | <1GB |
| Z-Image Turbo | ~13GB |
| InfiniteTalk(단일파일) + Wan2.1-I2V 베이스 | ~35GB |
| Qwen-Image-Edit-2511 | ~40GB |
| ACE-Step 1.5 | 수 GB |
| **합계 (대략)** | **약 200~250GB** |

받을 드라이브에 이 정도 여유 공간이 있는지 먼저 확인하세요. 다 받은 뒤 폴더를 OneDrive
동기화 폴더 밑으로 옮기면 자동으로 클라우드에도 백업됩니다.

## 뭐가 안 받아졌는지 한 번에 확인하기

Claude는 사용자님 PC를 직접 볼 수 없어서 "8개 중 뭐가 빠졌는지"를 대신 확인해 드릴 수
없습니다. 대신 `scripts/check-local-models.ps1`을 PC에서 직접 실행하시면 8개 각각
받았는지/안 받았는지 바로 보여줍니다.

```powershell
cd 이 레포를 받아둔 폴더
powershell -ExecutionPolicy Bypass -File scripts\check-local-models.ps1
```

위 명령어 그대로 받으셨던 `models\` 폴더 기준입니다. 다른 위치에 받으셨다면:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-local-models.ps1 -Base "실제경로\models"
```

---

## 9. 애니메이션·만화 영상 제작 추가 5종 (2026-09 리서치, 지금 4개 세트엔 없음)

기존 8개(영상 생성 HunyuanVideo1.5/MiniMax H3/LTX-2.5/Wan2.2 등)는 전부 사실적(포토리얼)
영상용입니다. 아래는 **정지된 캐릭터 그림을 움직이거나, 카툰/애니 화풍을 내는** 용도로
새로 조사한 것들 — 지금 안 받아져 있습니다.

| 모델 | 용도 | 라이선스 | 용량/VRAM |
|---|---|---|---|
| **LivePortrait** | 정지된 얼굴(웹툰 캐릭터 포함) 1장으로 표정·시선·고개짓 애니메이션 | MIT (얼굴 검출용 InsightFace는 비상업 전용 — 상업 이용 시 교체 필요) | 4~8GB |
| **Wan2.2-Animate-14B** | 정지 캐릭터를 레퍼런스 영상의 전신 동작으로 구동(얼굴 아니라 전신) | Apache-2.0 | 4090에서 480p 커뮤니티 워크플로 확인됨 |
| **Index-AniSora V3** (Bilibili) | Wan 기반, 애니메이션 데이터로 재학습한 사실상 유일한 오픈 "애니 전용" 영상모델(단, 화풍이 일·중 애니에 가까움) | Apache-2.0 | V1은 4090 확인, V3.1 경량판 12GB |
| **ToonCrafter** (Tencent ARC Lab) | 일러스트 키프레임 2장 사이를 자동 보간(진짜 셀애니 인비트윈 워크플로) | Apache-2.0 | 공식 24~27GB(빠듯), 커뮤니티 저VRAM판 ~10GB |
| Wan2.2 카툰/애니 LoRA | 이미 받은 Wan2.2에 그대로 얹어 화풍만 카툰으로 전환 | Civitai 개별 모델마다 다름(건별 확인) | 베이스와 동일 |

⚠️ 위 다섯 중 어느 것도 라이선스에 대한민국 제외 조항은 없습니다(HunyuanVideo 1.5·
MiniMax H3와 다름). 다만 "한국 웹툰 셀화풍"을 그대로 뽑아주는 모델은 없어서, AniSora나
Wan LoRA도 화풍은 일·중 애니에 가깝습니다 — 정확한 화풍을 내려면 결국 사장님 캐릭터
그림으로 musubi-tuner LoRA를 직접 학습시켜야 합니다.

```bash
# LivePortrait
git clone https://github.com/KwaiVGI/LivePortrait.git
cd LivePortrait && pip install -r requirements.txt
# 가중치 받기 명령은 저장소 README의 "Download pretrained weights" 절을 그대로 따르세요

# ToonCrafter
git clone https://github.com/Doubiiu/ToonCrafter.git
cd ToonCrafter && pip install -r requirements.txt
# 체크포인트는 저장소 README의 Hugging Face 링크에서 받으세요

# Index-AniSora V3
git clone https://github.com/bilibili/Index-anisora.git
# 가중치 받기 명령은 저장소 README를 따르세요

# Wan2.2-Animate-14B — 정확한 Hugging Face 저장소 경로는 README(github.com/Wan-Video/Wan2.2)에서
# "Animate" 항목을 확인해 그 경로로 hf download를 실행하세요
```

Wan2.2 카툰 LoRA는 civitai.com에서 "Wan 2.2" + "anime"/"cartoon" 태그로 검색해서
받으시면 됩니다(개별 파일이라 특정 URL을 드리지 않습니다 — 마음에 드는 화풍 골라서
받으시고 상업 이용 조건만 그 페이지에서 확인하세요).

---

## 10. 일본 애니메·망가 그림체 (2026-09 리서치)

### 정지 이미지 체크포인트 — SDXL 기반, ComfyUI 표준 체크포인트 로더로 바로 구동, 6~8GB

| 체크포인트 | 라이선스 | 상업 이용 |
|---|---|---|
| **WAI-illustrious-SDXL** ⭐ 추천 | FAIPL 1.0-SD 상속 | 생성물 상업 이용 제한 없음. Civitai 최다운로드(140만+), 계속 갱신 중 |
| Illustrious-XL | CreativeML OpenRAIL-M | 생성물 상업 이용 제한 없음 |
| NoobAI-XL | FAIPL + 자체 추가조항 | ⚠️ **모델·파생물·생성물 전부 상업적 이용/수익화 금지** — 라인아트 품질은 최고 평가지만 수익 채널엔 쓰면 안 됨(전 세계 대상 전면 금지, 지역 제한 아님) |

**받는 법 — Civitai 체크포인트는 Hugging Face와 달리 정해진 명령어가 없습니다:**
1. civitai.com 접속 → 검색창에 정확한 이름(예: "WAI-illustrious-SDXL") 입력
2. 모델 페이지에서 원하는 버전(최신 버전 권장) 선택 → **Download** 버튼
3. 로그인 요구하면 무료 계정 가입(다운로드에 필요). 명령줄로 받고 싶으면 계정의 **API 키**를 발급받아
   `wget "https://civitai.com/api/download/models/버전ID?token=API키" -O 파일명.safetensors` 형태로 받을 수 있습니다
   (버전ID는 다운로드 버튼 우클릭 → 링크 주소 복사로 확인)
4. 받은 `.safetensors` 파일을 ComfyUI의 `models/checkpoints/` 폴더에 넣으면 끝

⚠️ 버전이 자주 올라와서(예: WAI-illustrious-SDXL은 2026년 2월 기준 v17) 특정 URL을 여기
적어두지 않았습니다 — 매번 이름으로 검색해서 그 시점의 최신 버전을 받으세요.

### 망가(흑백 스크린톤) — 전용 모델 아니라 후처리 기법

전용 "망가 모델"은 없습니다. 위 체크포인트로 그림을 만든 뒤 스크린톤으로 변환하는 방식이
표준입니다.

```bash
# sketch2manga — 컬러/선화를 스크린톤 망가로 변환하는 ComfyUI 네이티브 커스텀노드
cd ComfyUI/custom_nodes
git clone https://github.com/dmMaze/sketch2manga.git
# 필요한 모델(Mangatone)은 저장소 README의 안내를 따라 받으세요
```

### 망가 페이지 레이아웃(칸 나누기) — AI 모델이 아니라 합성 작업

자동으로 칸을 배치해주는 AI는 없습니다 — 그림은 체크포인트로 각각 만들고, 아래 노드로
격자에 맞춰 합치는 방식입니다.

```bash
# ComfyUI Manager에서 검색 설치가 가장 쉽습니다: "Comfyroll" 검색 → CR Comic Panel Templates 설치
# 또는 직접:
cd ComfyUI/custom_nodes
git clone https://github.com/Suzie1/ComfyUI_Comfyroll_CustomNodes.git
```

⚠️ 이 조사는 huggingface.co/civitai.com 직접 접속이 막힌 환경에서 검색엔진 캐시로
교차검증한 것입니다 — 실제 다운로드 전 Civitai 카드의 라이선스 문구를 한 번 더 직접
확인해 보세요(특히 NoobAI-XL은 상업 이용 금지 조항이 원문에서 확인됐습니다).

