// "맞춤형 글쓰기 프롬프트" 기능입니다. 첨부해 주신 "머니대외비" 사이트의 글쓰기프롬프트
// 화면처럼, 카드마다 서로 다른 역할(구글 SEO 글쓰기, 네이버 홈판 모드, 이미지 프롬프트
// 생성기 등)을 가진 "챗봇"을 모아두고, 카드를 고르면 그 역할에 맞게 미리 짜둔 시스템
// 프롬프트로 Claude API와 대화할 수 있게 해줍니다. (머니대외비는 GPTs/Gemini Gem 같은
// 외부 챗봇으로 연결하는 방식이고, 여기서는 이미 이 프로젝트에 연동해둔 Claude API를
// 그대로 재사용합니다 — 그래서 카드마다 별도 가입/키 발급이 필요 없습니다.)
//
// ⚠️ 정직하게 밝혀둘 점 두 가지:
//  1) "이미지 생성기"/"블로그 썸네일 생성기"/"카드뉴스 이미지 생성기" 카드들은 실제 이미지
//     파일을 만들어내는 게 아니라(이 프로젝트에는 이미지 생성 AI가 연동되어 있지 않습니다),
//     이미지 생성 AI(미드저니/DALL·E 등)에 넣을 "프롬프트 문구"나 썸네일에 쓸 "카피 문구"를
//     만들어주는 역할입니다.
//  2) "네이버쇼핑커넥트 생성기", "드라마 프로필 블로그 생성기"처럼 실제 상품/드라마 정보가
//     필요한 카드는, 사용자가 입력창에 실제 정보(상품명·스펙·드라마 제목·줄거리 등)를 넣어야
//     그 정보를 바탕으로 글을 써줍니다 — Claude가 모르는 최신/구체적 사실을 지어내지
//     않도록 모든 카드의 시스템 프롬프트에 같은 규칙을 넣어뒀습니다.

const fs = require("fs");
const path = require("path");
const claudeClient = require("./claudeClient");
const { getRelatedKeywords } = require("./naverKeywordTool");

// 사용자가 직접 만들어둔 "클로드 스킬" 원문(매우 긴 지침)을 그대로 시스템 프롬프트로
// 쓰는 카드들은, JS 문자열 안에 코드블록(```)까지 그대로 들어있어 이스케이프가 까다로워서
// 별도 텍스트 파일(src/promptSkills/*.txt)로 분리해두고 그대로 읽어옵니다.
function loadSkillPrompt(name) {
  return fs.readFileSync(path.join(__dirname, "promptSkills", `${name}.txt`), "utf8");
}

const HONESTY_RULE =
  "\n\n⚠️ 규칙: 당신은 실시간 정보나 사용자가 직접 언급하지 않은 특정 대상(가게, 제품, 인물, 드라마 등)에 대한 " +
  "구체적 사실(정확한 가격, 날짜, 영업시간, 수치, 통계, 실제 사건)을 알지 못합니다. 사용자가 입력한 내용에 없는 " +
  "구체적 사실은 지어내지 말고, 그 자리에 \"✏️(직접 확인 후 채워주세요: 예상되는 내용)\" 형태로 표시해서 채워야 할 " +
  "자리로 남겨두세요. 사용자가 실제로 알려준 정보는 그대로 활용해서 자연스럽게 글을 쓰면 됩니다.";

const TOOLS = [
  {
    id: "broadcast-issue",
    badge: "방송이슈",
    title: "방송이슈 홈판",
    desc: "어제/오늘 방송 이슈로 네이버 홈판 노출용 블로그 글을 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "키워드만 입력해도 제목 45~50개 → 소제목/본문 → 팩트체크 → 이미지 프롬프트·손글씨 멘트 → 인포그래픽까지 단계별 진행",
      "명예훼손·허위사실 위험을 줄이기 위한 완화 표현·팩트체크 규칙이 내장돼 있어요",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — '1단계 정보 수집'은 실제 검색 대신 대화창에 직접 알려주신 사실 정보(회차·발언·반응 등)를 근거로 진행돼요",
    ],
    inputLabel: "방송 키워드 / 완성된 제목 / 제목+참고 본문",
    inputPlaceholder: "예) 나는솔로 22기 옥순 (또는 완성된 제목, 또는 제목+아는 사실을 함께)",
    system: loadSkillPrompt("broadcast-issue"),
    // 이 카드는 실제 "방송 이슈" 클로드 스킬(.skill)로 따로 만들어 전달드렸어요 — 계정에 저장해두시면
    // 클로드 앱에서 아래 트리거 문구만으로 그 스킬이 자동으로 실행돼요.
    claudeAppTrigger: "방송 이슈 블로그 써줘",
  },
  {
    id: "celebrity-gossip",
    badge: "연예인 가십",
    title: "연예인 가십 홈판",
    desc: "결혼·이혼·열애·SNS 등 연예인 가십 이슈로 네이버 홈판 노출용 블로그 글을 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "출처 명시·추측 회피 표현 등 사생활 침해·명예훼손 위험을 낮추는 규칙이 내장돼 있어요",
      "키워드만 입력해도 제목 45~50개 → 소제목/본문 → 팩트체크 → 이미지 프롬프트까지 단계별 진행",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — 실제 검색 대신 대화창에 직접 알려주신 사실 정보를 근거로 진행돼요",
    ],
    inputLabel: "가십 키워드 / 완성된 제목 / 제목+참고 본문",
    inputPlaceholder: "예) OOO 열애설 (또는 완성된 제목, 또는 제목+아는 사실을 함께)",
    system: loadSkillPrompt("celebrity-gossip"),
    // 이 카드도 "연예인 가십" 클로드 스킬(.skill)로 따로 만들어 전달드려요.
    claudeAppTrigger: "연예인 가십 블로그 써줘",
  },
  {
    id: "celeb-fashion",
    badge: "연예인 패션",
    title: "연예인 패션 홈판",
    desc: "공항 포착·방송·레드카펫 패션을 다루는 홈판 정보성 블로그 글을 완성해요 (이미 계정에 저장된 클로드 스킬 원문 그대로)",
    bullets: [
      "짧은 호흡(800~1000자)과 브랜드·가격 정보 결합 방식이 내장돼 있어요",
      "✅ 이 스킬은 이미 사용자 계정에 저장되어 있어요 — 별도 .skill 파일은 만들지 않았어요",
    ],
    inputLabel: "연예인 + 패션 키워드",
    inputPlaceholder: "예) 카리나 공항패션",
    system: loadSkillPrompt("celeb-fashion"),
    claudeAppTrigger: "연예인 패션 블로그 써줘",
  },
  {
    id: "fashion-review",
    badge: "패션 후기",
    title: "골든 패션 후기",
    desc: "내돈내산·매장 방문·실착 솔직후기 블로그 글을 완성해요 (이미 계정에 저장된 클로드 스킬 원문 그대로)",
    bullets: [
      "30대 기혼 남성(183cm·72kg, 상의 XL·하의 32) 작성자 프로필이 자동 반영돼요",
      "✅ 이 스킬은 이미 사용자 계정에 저장되어 있어요 — 별도 .skill 파일은 만들지 않았어요",
    ],
    inputLabel: "제품/브랜드 키워드",
    inputPlaceholder: "예) 나이키 v2k 후기",
    system: loadSkillPrompt("fashion-review"),
    claudeAppTrigger: "패션 후기 블로그 써줘",
  },
  {
    id: "celeb-beauty",
    badge: "연예인 뷰티",
    title: "연예인 뷰티 홈판",
    desc: "화제가 된 연예인의 메이크업·헤어·피부·시술 포인트를 다루는 홈판 정보성 블로그 글을 완성해요 (이미 계정에 저장된 클로드 스킬 원문 그대로)",
    bullets: [
      "제목 후킹 5종, 소제목 3단 구성(이슈·디테일·일반인 적용팁) 규칙이 내장돼 있어요",
      "✅ 이 스킬은 이미 사용자 계정에 저장되어 있어요 — 별도 .skill 파일은 만들지 않았어요",
    ],
    inputLabel: "연예인 + 뷰티 키워드",
    inputPlaceholder: "예) 카리나 로우번",
    system: loadSkillPrompt("celeb-beauty"),
    claudeAppTrigger: "연예인 뷰티 블로그 써줘",
  },
  {
    id: "beauty-review",
    badge: "뷰티 후기",
    title: "골든 뷰티 후기",
    desc: "화장품·미용실/헤어시술·뷰티 디바이스 사용 후기 블로그 글을 완성해요 (이미 계정에 저장된 클로드 스킬 원문 그대로)",
    bullets: [
      "수부지·지성 피부, 두피 특성 등 작성자 프로필이 자동 반영돼요",
      "✅ 이 스킬은 이미 사용자 계정에 저장되어 있어요 — 별도 .skill 파일은 만들지 않았어요",
    ],
    inputLabel: "제품/시술 키워드",
    inputPlaceholder: "예) 수분크림 후기",
    system: loadSkillPrompt("beauty-review"),
    claudeAppTrigger: "뷰티 후기 블로그 써줘",
  },
  {
    id: "it-auto",
    badge: "IT·자동차",
    title: "IT·자동차 홈판",
    desc: "신차·스마트폰 등 IT·자동차 소재로 네이버 홈판 노출용 블로그 글을 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "키워드 인지도(A/B/C 등급)에 따라 제목 전략이 달라지고, 20종 후킹 장치로 45~50개 제목을 뽑아요",
      "오너 감정 낙인, 개발코드 병기, 유출·포착, 유명인 애마 서사 등 v6.2에서 새로 추가된 카테고리 3종이 들어있어요",
      "개발코드·유명인 서사는 실제 확인된 사실만 사용하도록 안전 원칙이 내장돼 있어요",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — '1단계 정보 수집'은 실제 검색 대신 대화창에 직접 알려주신 사실 정보를 근거로 진행돼요",
    ],
    inputLabel: "IT·자동차 키워드 / 완성된 제목 / 제목+참고 정보",
    inputPlaceholder: "예) 테슬라 모델Y (또는 완성된 제목, 또는 제목+아는 내용을 함께)",
    system: loadSkillPrompt("it-auto"),
    claudeAppTrigger: "IT 자동차 블로그 써줘",
  },
  {
    id: "wealth-life",
    badge: "재테크·경제",
    title: "재테크·경제 홈판",
    desc: "주식·부동산·정책·절세 등 재테크 이슈로 네이버 홈판 노출용 블로그 글을 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "30~50대 타깃, '○○ 사세요' 같은 단정·보장 표현을 피하는 안전 원칙이 내장돼 있어요",
      "실존 상위권 블로거 스타일을 본뜬 문체 페르소나 A/B/C/D 중 골라서 쓸 수 있어요",
      "키워드/제목 입력 → 제목 45~50개 → 소제목/본문까지 단계별로 진행돼요",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — '1단계 정보 수집'은 실제 검색 대신 대화창에 직접 알려주신 사실 정보를 근거로 진행돼요",
    ],
    inputLabel: "재테크 키워드 / 완성된 제목 / 제목+참고 정보",
    inputPlaceholder: "예) 삼성전자 (또는 완성된 제목, 또는 제목+아는 내용을 함께)",
    system: loadSkillPrompt("wealth-life"),
    // 이 카드는 실제 "재테크·경제" 클로드 스킬(.skill)로 따로 만들어 전달드려요 — 계정에 저장해두시면
    // 클로드 앱에서 아래 트리거 문구만으로 그 스킬이 자동으로 실행돼요.
    claudeAppTrigger: "재테크 경제 블로그 써줘",
  },
  {
    id: "living-life",
    badge: "리빙 라이프",
    title: "리빙·라이프 홈판",
    desc: "다이소·코스트코·인테리어·청소·요리·살림·육아 등 생활 정보로 네이버 홈판 노출용 블로그 글을 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "30~60대 주부 타깃, '옆집 언니 발견담 리뷰' 해요체 톤이 내장돼 있어요",
      "다이소/코스트코/인테리어/청소/요리/살림/육아 7갈래를 자동으로 판단해서 톤과 후킹을 다르게 적용해요",
      "장점만 나열하지 않고 아쉬운 점→해결 팁 세트로 제시하는 솔직 후기 원칙이 있어요",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — '1단계 정보 수집'은 실제 검색 대신 대화창에 직접 알려주신 사실 정보(가격·용량·본인 경험담 등)를 근거로 진행돼요",
    ],
    inputLabel: "리빙 키워드 / 완성된 제목 / 제목+참고 정보",
    inputPlaceholder: "예) 다이소 신상 (또는 완성된 제목, 또는 제목+아는 내용을 함께)",
    system: loadSkillPrompt("living-life"),
    claudeAppTrigger: "리빙 라이프 블로그 써줘",
  },
  {
    id: "sports-issue",
    badge: "스포츠 이슈",
    title: "스포츠 이슈 홈판",
    desc: "경기 직후 24시간 속보성 스포츠 이슈로 네이버 홈판 노출용 블로그 글을 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "같은 경기를 본 팬의 '감정 리액션 중계형' 평서체 문체가 내장돼 있어요",
      "선수·감독 실명 + 비난 단정 금지, 이적·연봉 등 미확정 사안은 전언체로 완화하는 안전 원칙이 있어요",
      "6단계에서 영문 이미지 프롬프트 + 한글 손글씨 멘트 4종(임팩트/기록/감정반응/호기심)을 함께 만들어요",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — '1단계 정보 수집'은 실제 검색 대신 대화창에 직접 알려주신 경기 정보(스코어·기록·발언 등)를 근거로 진행돼요",
    ],
    inputLabel: "스포츠 키워드 / 완성된 제목 / 제목+참고 정보",
    inputPlaceholder: "예) 손흥민 골 (또는 완성된 제목, 또는 제목+아는 내용을 함께)",
    system: loadSkillPrompt("sports-issue"),
    claudeAppTrigger: "스포츠 이슈 블로그 써줘",
  },
  {
    id: "health-info",
    badge: "건강 정보",
    title: "건강 정보 홈판",
    desc: "관절·혈관·혈당·수면 등 중장년 건강 관심사로 네이버 홈판 노출용 블로그 글을 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "40~60대 타깃, '가족 공감 해설형' 해요체 톤이 내장돼 있어요",
      "진단·처방 금지, 효능 단정 금지, 병원 권유 문구 필수, 공포 조장 금지 등 의료법 안전 원칙이 있어요",
      "효능 진술은 근거 등급(공식 기관/일부 연구/속설)에 맞춰 전언·완화 표현으로 자동 조절돼요",
      "⚠️ 이 카드는 실시간 웹 검색 기능이 연결돼 있지 않아요 — '1단계 정보 수집'은 실제 검색 대신 대화창에 직접 알려주신 사실 정보를 근거로 진행돼요",
    ],
    inputLabel: "건강 키워드 / 완성된 제목 / 제목+참고 정보",
    inputPlaceholder: "예) 무릎 통증 (또는 완성된 제목, 또는 제목+아는 내용을 함께)",
    system: loadSkillPrompt("health-info"),
    claudeAppTrigger: "건강 정보 블로그 써줘",
  },
  {
    id: "knowledge-culture",
    badge: "지식교양",
    title: "교육·지식·심리 홈판",
    desc: "단어 뜻·유래·상식·시사 배경 같은 지식교양 주제를 네이버 검색과 AI 검색(AEO)에 동시에 잘 잡히도록 0~7단계로 완성해요 (사용자가 만든 클로드 스킬 원문 그대로)",
    bullets: [
      "검색 의도를 개념·정의형 / 원리·이유형 / 실용·방법형 / 화제·시사연결형 4가지로 먼저 분석해요",
      "AI 검색이 답변으로 그대로 인용하기 쉽도록 결론부터 말하는 '두괄식' 구조로 써줘요",
      "정설과 이설(다른 의견·논란)이 있는 주제는 구분해서 짚어주고, 낚시성 후킹 없이 45개 제목 후보 중 골라요",
      "⚠️ 이 스킬 원문은 '실시간 웹 검색을 활성화'를 전제로 하지만, 이 카드에는 실시간 웹 검색이 연결돼 있지 않아요 — '1단계 정보 수집'은 대화창에 직접 알려주신 사실 정보를 근거로 진행돼요",
    ],
    inputLabel: "지식교양 키워드 / 완성된 제목 / 제목+참고 정보",
    inputPlaceholder: "예) OO 뜻 (또는 완성된 제목, 또는 제목+아는 내용을 함께)",
    system: loadSkillPrompt("knowledge-culture"),
    claudeAppTrigger: "지식교양 블로그 써줘",
  },
  {
    id: "drama-profile",
    badge: "연예/방송",
    title: "드라마 생성기",
    desc: "드라마 정보를 입력하면 줄거리·출연진 정리 블로그 글을 생성해요",
    bullets: ["실제 방영 정보(줄거리/출연진/방영일 등)를 직접 입력해야 정확한 글이 나와요"],
    inputLabel: "드라마 제목 + 아는 정보(줄거리/출연진/채널 등)",
    inputPlaceholder: "예) 제목: OOO / 채널: OOO / 아는 내용: 주인공, 대략적인 줄거리 등",
    system:
      "당신은 드라마 정보 블로그 글을 쓰는 작가입니다. 사용자가 입력한 드라마 제목과 정보만을 근거로, " +
      "'기본 정보 → 줄거리 → 출연진 → 볼거리 포인트' 순서의 900~1300자 글을 작성하세요. 사용자가 " +
      "알려주지 않은 구체적 사실(정확한 방영일, 시청률, 상세 줄거리 전개, 실제 배우 이름 등)은 " +
      "지어내지 마세요." + HONESTY_RULE,
  },
  {
    id: "image-generator",
    badge: "이미지 생성기",
    title: "이미지 생성기",
    desc: "블로그 본문을 입력하면 소제목별 이미지 생성 프롬프트를 만들어줘요 (일러스트/사실적 사진 스타일 모두 제안)",
    bullets: [
      "실제 이미지 파일이 아니라, 이미지 생성 AI에 넣을 프롬프트 문구를 생성",
      "일러스트 느낌 버전 + 사실적인 사진(photo-realistic) 느낌 버전을 소제목별로 함께 제안",
      "생성된 프롬프트를 복사해서 구글 Flow(labs.google)로 바로 이동해 이미지를 만들 수 있어요",
    ],
    inputLabel: "블로그 본문",
    inputPlaceholder: "이미지 프롬프트를 뽑고 싶은 블로그 본문을 붙여넣어 주세요",
    opensExternal: { label: "🎬 Google Flow에서 이미지 만들기", url: "https://labs.google/fx/tools/flow" },
    system:
      "당신은 블로그 글을 읽고 각 소제목에 어울리는 이미지 생성 AI용 프롬프트를 만드는 전문가입니다. " +
      "이 프롬프트는 구글 Flow(Nano Banana 이미지 모델)에 붙여넣어 쓸 용도입니다. 입력된 본문의 " +
      "소제목(또는 문단)별로, (A) 일러스트/그래픽 느낌 프롬프트와 (B) 사실적인 사진(photo-realistic, " +
      "조명·카메라 앵글·색감 등을 구체적으로 포함) 프롬프트 두 가지를 각각 만들어서 " +
      "'[소제목]\\nA) 일러스트 버전: ...\\nB) 사실적 사진 버전: ...' 형태의 목록으로 답하세요. 한국어로 " +
      "써도 되고, 영어가 더 잘 통하는 스타일 키워드는 영어로 섞어 써도 됩니다. 답변 맨 앞에 '아래 " +
      "프롬프트를 복사해서 구글 Flow에 붙여넣으면 이미지를 만들 수 있어요'라고 안내하세요.",
  },
  {
    id: "thumbnail-copy",
    badge: "썸네일 문구",
    title: "블로그 썸네일 문구 생성기",
    desc: "포스팅 주제를 입력하면 썸네일에 넣을 임팩트 있는 문구를 제안해요",
    bullets: ["실제 썸네일 이미지가 아니라, 썸네일에 넣을 문구 후보와 레이아웃 아이디어를 제공"],
    inputLabel: "포스팅 주제",
    inputPlaceholder: "예) 여름 휴가지 숙소 특가 모음",
    system:
      "당신은 블로그 썸네일 카피라이터입니다. 주제를 입력받으면, 클릭을 부르는 짧고 강렬한 썸네일 " +
      "문구를 메인 카피 5개 + 각각에 어울리는 보조 문구 1개씩 제안하고, 마지막에 어떤 색/레이아웃이 " +
      "어울릴지 1~2문장으로 조언하세요. 실제 이미지 파일을 만들 수는 없다는 점을 답변 맨 앞에 " +
      "짧게 안내하세요.",
  },
  {
    id: "shopping-connect",
    badge: "쇼핑 제휴",
    title: "네이버쇼핑커넥트 생성기",
    desc: "상품명과 실제 정보를 입력하면 쇼핑 커넥트용 소개 글을 생성해요",
    bullets: ["상품 URL 자체를 읽어오지는 않으니, 상품명·스펙·가격 등 실제 정보를 함께 입력해 주세요"],
    inputLabel: "상품명 + 실제 정보(스펙/가격/특징)",
    inputPlaceholder: "예) 상품명: OOO 무선청소기 / 가격: 129,000원 / 특징: 무게 1.2kg, 흡입력 강함",
    system:
      "당신은 네이버 쇼핑 커넥트용 상품 소개 블로그 글을 쓰는 작가입니다. 사용자가 입력한 상품 정보만을 " +
      "근거로, 실제 사용해본 듯한 자연스러운 톤(장점+살짝의 아쉬운 점)으로 800~1200자 글을 쓰세요. " +
      "입력에 없는 스펙이나 가격은 지어내지 마세요." + HONESTY_RULE,
  },
  {
    id: "instagram-cardnews",
    badge: "카드뉴스 문구",
    title: "인스타 카드뉴스 문구 생성기",
    desc: "텍스트를 입력하면 인스타그램 카드뉴스용 문구를 슬라이드별로 정리해요",
    bullets: ["실제 카드뉴스 이미지가 아니라, 슬라이드별 문구를 텍스트로 정리"],
    inputLabel: "원본 내용",
    inputPlaceholder: "카드뉴스로 만들고 싶은 글이나 핵심 내용을 붙여넣어 주세요",
    system:
      "당신은 인스타그램 카드뉴스 기획자입니다. 입력된 내용을 5~8장의 슬라이드로 나누고, 슬라이드마다 " +
      "'슬라이드 N: 큰 제목 / 보조 설명(1문장)' 형태로 정리해서 답하세요. 첫 슬라이드는 강한 후킹, " +
      "마지막 슬라이드는 요약+CTA로 구성하세요. 실제 카드뉴스 이미지 파일은 만들 수 없다는 점을 답변 " +
      "맨 앞에 짧게 안내하세요.",
  },
  {
    id: "thread-summary",
    badge: "SNS 봇",
    title: "쓰레드 요약본 (반말투 출력)",
    desc: "글 전체를 넣으면 쓰레드(Threads) 감성의 반말투로 요약해줘요",
    bullets: ["긴 글을 짧고 캐주얼한 반말투 SNS 게시글로 재구성"],
    inputLabel: "원본 글 전체",
    inputPlaceholder: "요약하고 싶은 글 전체를 붙여넣어 주세요",
    system:
      "당신은 쓰레드(Threads)에 올릴 글을 쓰는 SNS 인플루언서입니다. 입력된 글의 핵심만 뽑아서, " +
      "친근한 반말투로 300자 이내의 짧고 리듬감 있는 게시글로 요약하세요. 줄바꿈을 적절히 써서 " +
      "읽기 편하게 만들고, 이모지는 과하지 않게 1~2개만 쓰세요.",
  },
];

// "클로드 앱에서 열기" 버튼용 claude://claude.ai/new?q=... 딥링크에 넣을 문구를 만듭니다.
// - claudeAppTrigger가 있는 카드(사용자가 만든 긴 스킬 원문 기반 카드)는, 그 긴 원문 전체를 넣으면
//   claude:// 링크 길이 제한(데스크톱 앱 기준 텍스트 약 14,000자 — 한글은 URL 인코딩 시 훨씬 더
//   부풀어서 실제로는 이보다 훨씬 못 미치는 분량에서부터 잘릴 수 있습니다)을 가볍게 넘겨버립니다.
//   그래서 그 대신, 계정에 저장된 클로드 스킬이 자동으로 인식하는 짧은 트리거 문구만 보냅니다.
//   ⚠️ 단, 이 방식은 그 스킬이 실제로 사용자 클로드 계정에 저장되어 있을 때만 의도대로 동작해요.
// - claudeAppTrigger가 없는 카드는 system 프롬프트 자체가 짧을 때만(안전 마진을 넉넉히 둔
//   1,200자 이하) 전체를 그대로 프리필하고, 그보다 길면(또는 system이 없으면) 버튼을 아예
//   숨깁니다 — 잘린 지침을 프리필해서 엉뚱하게 동작하는 것보다는, 안 되는 카드는 솔직하게
//   안 되는 채로 두는 편이 낫습니다.
const CLAUDE_APP_FULL_PREFILL_MAX = 1200;

function buildClaudeAppQuery(tool) {
  if (tool.claudeAppTrigger) return tool.claudeAppTrigger;
  if (typeof tool.system === "string" && tool.system.length > 0 && tool.system.length <= CLAUDE_APP_FULL_PREFILL_MAX) {
    return tool.system;
  }
  return null;
}

function getTools() {
  // 시스템 프롬프트 원문은 클라이언트에 내려줄 필요 없으니 제외하고, 그 대신 "클로드 앱에서
  // 열기" 버튼에 쓸 짧은 claudeAppQuery만 계산해서 내려줍니다.
  return TOOLS.map((t) => {
    const { system, claudeAppTrigger, ...rest } = t;
    return { ...rest, claudeAppQuery: buildClaudeAppQuery(t) };
  });
}

function findTool(id) {
  return TOOLS.find((t) => t.id === id);
}

/**
 * toolId: TOOLS 배열의 id
 * messages: [{ role: "user"|"assistant", content: "..." }] — 첫 메시지는 사용자의 입력,
 *           이후 메시지가 있으면 그 챗봇 카드 안에서 이어지는 대화(멀티턴)입니다.
 */
async function runTool(toolId, messages) {
  const tool = findTool(toolId);
  if (!tool) throw new Error(`등록되지 않은 프롬프트입니다: "${toolId}"`);
  if (!Array.isArray(messages) || !messages.length) throw new Error("입력 내용이 비어 있습니다.");

  if (tool.usesKeywordTool) {
    // 키워드 추출기는 Claude가 아니라 이미 이 프로젝트에 연동되어 있는 실제 네이버
    // 검색광고 키워드도구 API를 그대로 씁니다 — AI가 검색량을 추측하지 않고 진짜 데이터를 씁니다.
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const text = (lastUserMsg?.content || "").trim();
    if (!text) throw new Error("본문 또는 키워드를 입력해 주세요.");
    // 본문이 길면 그중 가장 자주 등장하는 명사형 단어를 메인 키워드 후보로 추정합니다.
    const words = text.match(/[가-힣]{2,8}/g) || [];
    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    const mainKeyword = text.length <= 20 ? text : [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || text.slice(0, 10);

    const related = await getRelatedKeywords(mainKeyword);
    const top = related
      .filter((k) => k.keyword !== mainKeyword)
      .sort((a, b) => b.monthlyPcQcCnt + b.monthlyMobileQcCnt - (a.monthlyPcQcCnt + a.monthlyMobileQcCnt))
      .slice(0, 15);

    const lines = [
      `📌 메인키워드(추정): ${mainKeyword}`,
      "",
      "📎 연관키워드 (실제 네이버 검색광고 데이터, 월 검색량 PC+모바일 합계 순):",
      ...top.map((k, i) => `${i + 1}. ${k.keyword} — 월 ${(k.monthlyPcQcCnt + k.monthlyMobileQcCnt).toLocaleString()}회 · 경쟁 ${k.compIdx || "-"}`),
    ];
    return lines.join("\n");
  }

  if (!claudeClient.isConfigured()) {
    throw new Error("서버에 ANTHROPIC_API_KEY가 설정되어 있지 않아서 이 챗봇을 쓸 수 없습니다. README를 참고해 Claude API 키를 등록해 주세요.");
  }

  return claudeClient.callClaude({
    system: tool.system,
    messages,
    maxTokens: 2200,
    temperature: 0.85,
  });
}

module.exports = { TOOLS, getTools, findTool, runTool };
