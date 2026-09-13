# ComfyUI 워크플로 설정 방법

이 폴더는 비어 있는 게 정상입니다. 여기에 사장님이 **직접 ComfyUI에서 만든 워크플로**를
"API 형식"으로 내보내 넣어두면, 서버 코드(`src/comfyClient.js`)가 그 워크플로를 그대로
실행해서 카드뉴스 배경·캐릭터 얼굴·영상 편집을 만들어줍니다.

## 왜 워크플로를 코드에 미리 넣어두지 않았나

ComfyUI 그래프(노드 구성)는 설치한 체크포인트 파일명, 커스텀 노드 종류에 따라 사람마다
다릅니다. 코드에 그래프를 하드코딩해두면 사장님 ComfyUI 설치 환경과 안 맞아서 오히려
바로 실패합니다. 그래서 "사장님이 ComfyUI에서 실제로 돌려본, 확실히 되는 워크플로"를
그대로 가져다 쓰는 방식을 택했습니다.

## 공통 방법 (3단계)

1. ComfyUI 화면에서 원하는 결과가 나오는 워크플로를 직접 만들고, 실제로 한 번 돌려서
   결과가 잘 나오는지 확인합니다.
2. 값을 바꿔가며 쓸 자리(프롬프트, 가로/세로 크기, 시드 등)의 **위젯 값을 아래 표의
   `__키__` 형태 문자열로 직접 입력**해 둡니다(진짜 값 대신 그 문자열을 그대로 타이핑).
3. ComfyUI 메뉴에서 **"Save (API Format)"**으로 내보낸 뒤, 그 JSON 파일을 아래 이름 그대로
   이 폴더에 저장합니다.

서버가 실행될 때마다 이 JSON을 읽어서 `__키__`를 실제 값으로 바꿔치기한 뒤 그대로
ComfyUI에 넘깁니다(자리표시자를 안 써도 되는 나머지 값들은 사장님이 ComfyUI에서 정한
그대로 유지됩니다).

## 파일별로 필요한 자리표시자

### `zimage-cardnews.json` — 카드뉴스 배경 (Z-Image Turbo)
| 자리표시자 | 넣을 위치 | 설명 |
|---|---|---|
| `__PROMPT__` | 긍정 프롬프트(CLIPTextEncode) | 배경 설명 문장 |
| `__NEGATIVE_PROMPT__` | 부정 프롬프트 | 텍스트/워터마크 등 안 나오게 |
| `__WIDTH__` | EmptyLatentImage의 width | 숫자 |
| `__HEIGHT__` | EmptyLatentImage의 height | 숫자 |
| `__SEED__` | KSampler의 seed | 숫자 |

### `character-lora.json` — 캐릭터 얼굴 고정 (Z-Image/FLUX.2 klein + musubi-tuner LoRA)
| 자리표시자 | 넣을 위치 | 설명 |
|---|---|---|
| `__PROMPT__` | 긍정 프롬프트 | characterImage.js가 만든 전체 문장(그림체+캐릭터 설명+장면) |
| `__LORA_NAME__` | LoraLoader의 lora_name | `.env`의 `LORA_ASSI_FILE` 등에 적은 파일명이 그대로 들어옵니다 |
| `__WIDTH__` / `__HEIGHT__` | EmptyLatentImage | 1080×1920 고정으로 보냅니다 |
| `__SEED__` | KSampler의 seed | 숫자 |

### `vace-outpaint.json` — 영상 편집 (Wan-VACE 아웃페인팅)
| 자리표시자 | 넣을 위치 | 설명 |
|---|---|---|
| `__INPUT_VIDEO__` | 비디오 로더 노드의 파일 경로 | 이 구간만 잘라둔 임시 mp4 파일의 **절대경로** |
| `__WIDTH__` / `__HEIGHT__` | 출력 크기 | 목표 세로 캔버스 크기(1080×1240) |
| `__PROMPT__` | 긍정 프롬프트 | 배경을 어떻게 채울지 설명 |

⚠️ 이 워크플로는 최종적으로 mp4/webm 파일을 저장하는 노드(예: VHS_VideoCombine 같은
커스텀 노드)로 끝나야 합니다. `comfyClient.js`가 ComfyUI의 완료 기록(history)에서
저장된 파일을 자동으로 찾아 내려받습니다.

## 워크플로가 없거나 ComfyUI가 꺼져 있으면?

세 기능 모두 절대 서버를 죽이지 않습니다. 카드뉴스는 그라디언트 배경으로, 캐릭터는
기존 클라우드 API(또는 프롬프트만 제공)로, 영상 편집은 기존 크롭 방식으로 조용히
대체됩니다. `GET /api/local-models/status`로 지금 무엇이 준비됐는지 확인할 수 있습니다.
