# 세션 기록 — 사주 릴스 영상 파이프라인 업그레이드 (2026-08-31)

다음 세션에서 이어서 작업할 수 있도록, 이 대화에서 오간 내용과 결과물을 순서대로 남겨둡니다.

## 1. 시작 — 업로드할 완성 영상 확인
`public/downloads/reels/`에 8/26에 만든 사주 릴스 7편(토끼~닭띠)이 있음을 확인.
`0_올리는_순서.txt`에 하루 한 편씩 인스타 릴스·유튜브 쇼츠·틱톡·네이버 클립에 올리라는
지침이 있음. 프로필 링크는 무료 사주 페이지로 걸어야 릴스가 유입을 만듦.

## 2. "영상이 심심하다" → 편집 파이프라인 설명
영상은 Premiere 같은 편집 앱이 아니라 **ffmpeg를 코드로 직접 호출**([src/videoRenderer.js](../src/videoRenderer.js))해서 만듦.
정지 이미지에 `zoompan` 필터로 켄번즈(줌/팬) 효과, 자막은 `.ass`(libass) 스타일.
음성(TTS)은 [src/voiceProvider.js](../src/voiceProvider.js)에서 CLOVA/Typecast/ElevenLabs/Azure 중
`.env`에 키가 등록된 것을 사용(4개 다 유료).

## 3. 참고 영상 2편 스타일 분석 → 켄번즈 개선
사장님이 준 유튜브 쇼츠 2편의 스타일(은은하게 움직이는 배경, 상단 후킹 문구)을 분석.
무료로 가능한 개선안(A안: ffmpeg 필터 강화)과 유료 개선안(B안: Veo/Seedance 등 이미지→영상 AI)
중 A안부터 진행하기로 함.

**코드 변경**: [src/videoRenderer.js](../src/videoRenderer.js)의 `buildKenBurnsFilter` 함수를
가로 방향만 팬하던 것에서 **대각선 4방향**(우상/우하/좌상/좌하)으로 장면마다 다르게 움직이도록
수정. 테스트 스크립트 [scripts/test-kenburns-render.js](../scripts/test-kenburns-render.js)로
확인 렌더 완료(`public/renders/bde930f3-b295-485d-a385-8a082921cdbc.mp4`, 4장면 13.2초,
AI 대본 생성 없이 기존 01_토끼띠 문구 재사용 + 무료 로컬 SVG 배경).

## 4. skills.sh에서 영상 제작 스킬 대량 설치
사장님이 "전부 다 다운받아서 글로벌로 저장해줘" 요청 → `npx skills add <repo> -g -y -s <skill>`
방식으로(항상 `-g` 글로벌, [feedback_skill_install_global.md] 규칙 따름) video/youtube 관련
스킬을 대량 설치. `onlyfans-video-downloader`(결제 콘텐츠 우회 다운로더)는 의도적으로 제외.
이후 voice 관련 검색에서 `comfyui-voice-pipeline`, `voicemode` 추가 설치.
**최종 확인: `~\.agents\skills\`에 총 85개 스킬**이 전부 글로벌로 설치됨(`npx skills list -g`로 검증).
star-history.com은 스킬 저장소가 아니라 GitHub 스타 추이 그래프 사이트라는 점도 확인해서 안내함.

## 5. 유튜브 링크 40개 리서치 → 실전 기법 노트
사장님이 준 유튜브 링크(1차 25개 + 2차 15개, 총 40개)를 브라우저로 열어서 실전 기법을 추출,
[docs/ai-video-research-notes.md](ai-video-research-notes.md)에 전부 정리함. 핵심 발견:

- **핸드헬드+브이로그 프롬프트**: Seedance 2.5 등에 `handheld`, `vlog` 두 단어를 넣으면
  AI 영상이 훨씬 자연스러워짐 (유료 생성 AI 쓸 때 적용).
- **캐릭터 시트(9프레임/캐릭터+장면 시트)**: Nano Banana Pro로 캐릭터 시트를 만들고
  Veo 3.1/Omni에 넣으면 여러 장면에서 캐릭터 일관성 유지 (유료, 나중에 실제 캐릭터
  도입 시 핵심 기법).
- **블로그→Remotion 영상 자동화**: 클로드 데스크탑/코드 + Remotion으로 블로그 원고를
  영상으로 자동 변환하는 사례 다수 확인. 지금 가진 블로그 원고 대량생산 시스템(golden-blog-floor)을
  그대로 재료로 쓸 수 있어서 **가장 현실적인 다음 단계**로 결론.
- **Voicebox — 무료 목소리 복제 (가장 임팩트 큰 발견)**: `voicebox.sh` 공식 사이트를 직접
  확인. MIT 라이선스 완전 무료 오픈소스(ElevenLabs 무료 대안), 100% 로컬 실행, 목소리 샘플
  3초로 복제 가능, 로컬 REST API(`http://127.0.0.1:17493`) + MCP 지원.
  **코드 연동 완료**: [src/voiceProvider.js](../src/voiceProvider.js)에 5번째 제공자 `voicebox`
  추가, [.env.example](../.env.example)에 `VOICEBOX_PROFILE_ID` 등 설정값 추가.
  사장님이 하실 일(제가 대신 못 하는 부분): voicebox.sh에서 설치 → 앱에서 마이크로 목소리
  녹음해 프로필 생성 → 프로필 ID를 `.env`에 붙여넣기. 이후엔 `voice: {provider: "voicebox"}`로
  넘기면 사장님 목소리로 나레이션 자동 생성됨. 단, **로컬 전용**(Voicebox 앱이 켜진 컴퓨터에서
  렌더할 때만 동작, Render.com 원격 서버에서는 불가).

## 다음에 이어서 할 것 (우선순위)
1. **사장님 액션 필요**: Voicebox 설치 + 목소리 녹음 + `VOICEBOX_PROFILE_ID` 설정
   → 완료되면 바로 무료 나레이션 파이프라인 테스트 가능
2. 블로그 원고 → Remotion 영상 자동화 파이프라인 실제 구축 (아직 코드로 안 만듦, 설계만 논의)
3. 켄번즈 개선판으로 나머지 6편(용~닭띠) 다시 렌더할지 결정
4. (원한다면) 유료 생성 AI(Veo/Seedance/Higgsfield) 실제 연동 — 비용 승인 필요

## 변경된/새로 생긴 파일 목록
- [src/videoRenderer.js](../src/videoRenderer.js) — 켄번즈 대각선 팬 개선
- [src/voiceProvider.js](../src/voiceProvider.js) — voicebox 제공자 추가
- [.env.example](../.env.example) — voicebox 환경변수 항목 추가
- [docs/ai-video-research-notes.md](ai-video-research-notes.md) — 유튜브 40개 링크 리서치 노트
- [docs/session-log-video-pipeline.md](session-log-video-pipeline.md) — 이 파일
- [scripts/test-kenburns-render.js](../scripts/test-kenburns-render.js) — 테스트 렌더 스크립트
- `~\.agents\skills\` — 글로벌 스킬 85개 (video/youtube/voice 관련)
