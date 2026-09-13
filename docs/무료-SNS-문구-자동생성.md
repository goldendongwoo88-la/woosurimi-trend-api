# 무료 SNS 문구 자동 생성 (OpenRouter 비전 모델, 2026-09 추가)

`오픈소스-AI-모델-다운로드-가이드.md`·`로컬-AI-모델-연동.md`에서 다룬 4개 모델과 **성격이
다릅니다.** 이건 로컬 GPU 모델이 아니라, 완성된 영상/사진을 인터넷 너머 무료 API에 보내
"보고 판단"하게 하는 방식입니다.

## ⚠️ 가장 먼저 — 이건 "설치"할 게 없습니다

Z-Image Turbo·musubi-tuner·ACE-Step·faster-whisper·Wan-VACE는 전부 사장님 PC의 GPU에서
직접 돌아가야 해서 다운로드·설치가 필요했습니다. 이번 건 다릅니다 — OpenRouter라는 회사가
이미 클라우드에 띄워둔 모델(Google Gemma 4 26B A4B)을 API로 부르기만 합니다. 그래서:

- 사장님 PC에 설치할 파일이 없습니다.
- 이 서버(로컬이든 Render든)에도 설치할 게 없습니다.
- 대신 **OpenRouter 계정과 API 키가 필요**합니다 — 이건 회원가입이 필요한 부분이라
  저희가 대신 만들어 드릴 수 없습니다. 아래 순서대로 직접 발급받아야 합니다.

## 1) API 키 발급 (한 번만)

1. openrouter.ai 에서 회원가입합니다.
2. 로그인 후 API 키 발급 메뉴에서 새 키를 만듭니다.
3. 발급받은 키를 `.env`에 넣습니다:
   ```
   OPENROUTER_API_KEY=여기에_발급받은_키
   ```
4. 서버를 재시작하면 바로 동작합니다. 안 넣어도 서버는 정상 작동하고, 이 기능만
   조용히 빠집니다(`{"ok": false, "why": "..."}`로 이유를 알려줍니다).

## 2) 얼마나 무료인가

여기서 쓰는 모델 자체는 토큰당 요금이 $0입니다. 다만 OpenRouter가 무료 모델에는
시간당/일당 요청 횟수 제한을 겁니다 — 영상 하나 만들 때 문구 한 번 뽑는 용도로는
충분하지만, 짧은 시간에 대량으로 돌리면 막힐 수 있습니다.

## 3) 무엇을 해주는가

완성된 쇼츠 영상(또는 카드뉴스 이미지)의 실제 장면을 프레임으로 뽑아 모델에 보여주고,
아래를 한 번에 받습니다:

- 장면 설명 (참고용)
- 인스타그램 캡션 + 해시태그
- 스레드용 짧은 글
- 유튜브 쇼츠 제목 + 설명란

⚠️ **네이버 클립 문구는 다루지 않습니다** — 클립은 이미 `clipCaption.js`(Claude 기반,
검색어 최적화)가 따로 있고 성격이 다릅니다(클립은 화면이 아니라 검색어가 핵심). 클립은
계속 기존 `/api/naver-clip/caption`을 쓰세요.

## 4) 어디서 쓰나

**이미 만든 영상/사진에 바로 쓰기**
```
POST /api/shortform/auto-caption
{ "path": "/renders/short-xxxx-1.mp4", "topic": "선택 사항" }
```
`path`는 이 서버가 이미 만들어 둔 `public/` 아래 파일이어야 합니다(영상 또는 jpg/png 사진).

**롱폼→쇼츠 자동 자르기에 한 번에 묶어서**
```
POST /api/long-to-shorts
{ "url": "https://youtube.com/...", "count": 4, "autoCaption": true }
```
쇼츠를 자를 때마다 자동으로 문구까지 함께 만들어 각 항목의 `caption` 필드에 붙여줍니다.

**지금 키가 등록됐는지만 가볍게 확인**
```
GET /api/shortform/auto-caption-status
→ { "configured": true|false, "model": "google/gemma-4-26b-a4b-it:free" }
```

## 5) 새 파일

- `src/openrouterCaption.js` — 프레임 추출(ffmpeg) + OpenRouter 호출 + JSON 파싱
