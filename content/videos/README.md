# 영상 제작 대기열 — Wan 2.2 / LTX-2.5 로컬 생성 → 자동 조립

이 폴더는 **"프롬프트는 다 짜놨으니, 로컬 4090에서 클립만 뽑아서 경로만 채우면 끝나는"**
상태로 만들어둔 영상 대기열입니다. 2026-09-12 밤에 사장님이 잠든 사이 준비했습니다.

## 왜 이런 구조인가

이 클라우드 세션은 사장님 로컬 PC(RTX 4090, Wan 2.2·LTX-2.5·HunyuanVideo 1.5·MiniMax H3
설치됨)와 완전히 분리된 별도 컴퓨터입니다. GPU도 없고, 그 PC로 가는 네트워크 경로도
없습니다. 그래서 이 세션이 할 수 있는 일은:

1. **장면별로 무엇을, 어떤 스타일로, 어떤 프롬프트로 생성해야 하는지** 전부 미리 정하기
2. 생성된 클립들을 **자막·전환·나레이션까지 입혀 완성 mp4로 조립하는 도구**를 코드로 만들기

두 가지뿐입니다. 실제 픽셀을 생성하는 건 사장님 PC에서 해야 합니다.

## 라이선스 — 딱 한 가지만 지켜주십시오

**HunyuanVideo 1.5와 MiniMax H3는 커뮤니티 라이선스에 "대한민국 제외" 조항이 있습니다.**
한국 사업자는 상업적 사용 조건과 무관하게 이 라이선스로 쓸 자격 자체가 없습니다. 각
scenes.json에 두 모델용 프롬프트도 요청하신 대로 전부 넣어뒀지만, 실제 채널에
올릴 영상은 **Wan 2.2(Apache 2.0)와 LTX-2.5(연매출 1천만 달러 미만 상업 무료)로만**
만드시길 권합니다. Hunyuan·MiniMax로 만든 클립을 쓰시겠다면 그건 사장님이 위험을
감수하고 결정하시는 부분입니다.

## 스타일 지침 — 요청하신 그대로 모든 프롬프트에 이미 박혀 있습니다

> 관찰형 핸드헬드, 자연광, 실제 피부 질감, 광고 티 금지

영어로 번역해 모든 장면 프롬프트 끝에 자동으로 붙여뒀습니다:

```
observational handheld camera footage, documentary vlog style, natural available light
(window light or overcast daylight, no artificial studio light), realistic skin texture
with visible pores and natural imperfections, amateur unstaged home-video aesthetic,
subtle natural handheld camera shake, candid unposed moment, shot on smartphone camera
look, warm true-to-life color grading, not glamorous, not retouched
```

부정 프롬프트(negativePrompt)도 모든 장면에 공통으로 넣었습니다 — "광고처럼 보이면
스킵당한다"는 33편 분석의 결론과 정확히 같은 방향입니다:

```
advertisement, commercial, studio lighting, ring light, glossy skin, airbrushed,
beauty filter, over-saturated colors, staged product photography, stock footage look,
perfectly stable gimbal shot, professional cinematic color grade, text overlay,
watermark, logo, plastic look, CGI, 3d render, symmetrical composition
```

**부수 효과 하나**: 롱폼에서 "이미지 슬라이드쇼만 쓰면 기계 생산으로 판정될 위험"이
33편 분석 문서에 적혀 있었는데, 이제 진짜 생성 동영상을 쓰니 그 위험이 사라집니다.

## 쓰는 법 (사장님 PC에서)

1. `shorts/` 또는 `longform/` 안의 `.json` 파일을 하나 엽니다.
2. 장면(scene)마다 있는 `genPrompt_wan22`(또는 `genPrompt_ltx25`)를 그대로 복사해서
   Wan 2.2 / LTX-2.5에 넣고, `negativePrompt`도 함께 넣어 `durationSec` 근처 길이로
   클립을 뽑습니다.
3. 나온 클립 파일의 **절대경로**를 그 장면의 `"clip": "PASTE_CLIP_PATH_HERE.mp4"` 자리에
   덮어씁니다. 장면 전부를 채웁니다.
4. 이 저장소 루트에서:
   ```bash
   node scripts/make-video.js content/videos/shorts/01-beolcho-injury.json
   ```
5. 클립 경로가 하나라도 안 채워져 있으면 스크립트가 몇 번 장면인지 알려주고 멈춥니다
   (반쯤 채워진 영상을 만들지 않도록 하는 안전장치입니다).
6. 다 채워졌으면 자막·전환·크로스페이드까지 입혀서 `public/renders/`에 완성 mp4가
   나옵니다.

### 나레이션(롱폼)을 넣고 싶으면

`options.voice`에 `{ "provider": "elevenlabs" }`를 넣어두면(이미 롱폼 파일엔 넣어뒀습니다)
`caption` 텍스트를 그대로 ElevenLabs로 읽혀서 자동으로 입힙니다. 로컬 PC의 `.env`에
`ELEVENLABS_API_KEY`가 있어야 합니다(이미 있는 것으로 확인했습니다). 이 클라우드
세션에서는 ElevenLabs API 자체가 막혀 있어 대신 만들어드리지 못했습니다.

## 대기열 현황

| 폴더 | 개수 | 내용 |
|---|---|---|
| `shorts/` | 20개 | 추석 10편(9/13~23) + 환절기 5편(9/26~10/5) + 상시 템플릿 5편 |
| `longform/` | 1개 | 시니어 건강 — 추석 후 몸 신호 5가지 (9/27 업로드 목표, 약 4.9분) |

**우선순위 2편**(`shorts/01-beolcho-injury.json`, `shorts/02-chuseok-gift-3man.json`)은
9/13 업로드분이라 4개 모델 프롬프트를 전부 넣었습니다. 나머지 18편은 Wan 2.2
기본 프롬프트만 넣었습니다 — 필요하면 같은 스타일 블록으로 다른 모델용도 쉽게
만들 수 있습니다(이 문서 위쪽 스타일 지침을 그대로 붙이면 됩니다).

## 각 장면에 화살표·가격을 넣지 마십시오

생성 모델에게 "화살표로 가리켜라"라고 시키면 그림이 깨지거나 이상한 텍스트가
찍힙니다. 화살표·가격 표시는 **캡컷/After Effects 편집 단계에서** 그래픽으로
얹으십시오 — 각 숏폼 마지막 장면(scene 4)의 note에 이미 적어뒀습니다.

## 대가성 고지

모든 shorts 파일에 `disclosure` 필드로 문구를 넣어뒀습니다. **화면 안(자막 한 줄로)과
유튜브 설명 첫 줄, 둘 다에** 넣으십시오. 고정댓글에만 넣는 건 2024-12-01 개정 표시광고
심사지침 기준 위반입니다.
