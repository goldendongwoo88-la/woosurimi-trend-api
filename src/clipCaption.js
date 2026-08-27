/**
 * 네이버 클립용 문구 만들기.
 *
 * ⚠️ 인스타 캡션을 그대로 클립에 올리면 손해입니다. 성격이 다릅니다.
 *
 *   인스타 릴스 — 추천 알고리즘. 해시태그로 발견됩니다. 감성적인 문장이 먹힙니다.
 *   네이버 클립 — **검색과 연결됩니다.** 사람들이 네이버에서 검색하다가 클립을 봅니다.
 *                그래서 문구에 **검색어**가 들어가야 합니다.
 *
 * ⚠️ 그리고 클립에만 있는 게 하나 있습니다 — **쇼핑태그**입니다.
 * 스마트스토어 상품을 영상에 직접 붙일 수 있고, 프로필의 '쇼핑기록' 탭에 모입니다.
 * 이게 다른 플랫폼에 없는 장점이라, 파는 물건이 있으면 클립이 제일 유리합니다.
 *
 * ⚠️ 태그를 붙이는 건 우리가 못 합니다. 공개 API가 없어서 사람이 앱에서 해야 해요.
 * 대신 **무엇을 어디에 붙일지** 정확히 알려드립니다. 그게 실제로 도움이 되는 부분입니다.
 */

const { callClaude, isConfigured, extractJson } = require("./claudeClient");

// 하루 세 편까지 올릴 수 있습니다. 그 이상은 안 올라갑니다.
const DAILY_LIMIT = 3;

/**
 * 클립용 문구.
 *
 * @param {object} o
 * @param {string} o.topic     영상 주제
 * @param {string[]} [o.lines] 영상 안의 대사·자막 (있으면 훨씬 정확해집니다)
 * @param {string} [o.product] 붙일 스마트스토어 상품 (있으면 쇼핑태그 안내를 답니다)
 * @param {string} [o.place]   장소 (있으면 장소태그 안내를 답니다)
 */
async function make({ topic, lines = [], product = "", place = "" } = {}) {
  if (!isConfigured()) {
    const e = new Error("AI가 연결되지 않았습니다."); e.status = 503; throw e;
  }
  if (!String(topic || "").trim()) {
    const e = new Error("영상 주제를 알려주세요."); e.status = 400; throw e;
  }

  const data = await callClaude({
    feature: "영상 자막",
    system:
      "네이버 클립에 올릴 문구를 씁니다.\n\n" +
      "⚠️ 인스타 릴스와 다릅니다. 클립은 **네이버 검색과 연결**됩니다.\n" +
      "  사람들이 네이버에서 뭔가를 검색하다가 클립을 봅니다.\n" +
      "  그래서 문구 안에 **사람들이 실제로 검색할 말**이 들어가야 합니다.\n" +
      "  인스타처럼 감성적인 문장만 쓰면 검색에 안 걸립니다.\n\n" +
      "⚠️ 첫 줄이 제일 중요합니다. 목록에서 첫 줄만 보입니다.\n" +
      "  그 안에 핵심 검색어가 들어가야 합니다.\n\n" +
      "⚠️ 과장하지 마세요. '최고', '1위', '무조건' 같은 말은 쓰지 않습니다.\n\n" +
      '{"title":"첫 줄 (25자 안팎, 검색어 포함)",' +
      '"body":"본문 2~4줄",' +
      '"tags":["해시태그(# 없이)"],' +
      '"searchWords":["이 영상이 걸렸으면 하는 검색어"]} JSON만 출력하세요.\n' +
      "해시태그는 8~12개. 너무 많으면 오히려 지저분합니다.",
    messages: [{
      role: "user",
      content:
        `영상 주제: ${topic}\n` +
        (lines.length ? `\n영상 안의 말:\n${lines.map((l) => "· " + l).join("\n")}\n` : "") +
        (product ? `\n붙일 상품: ${product}\n` : "") +
        (place ? `\n장소: ${place}\n` : ""),
    }],
    maxTokens: 1200,
    temperature: 0.85,
  });

  const p = extractJson(data) || {};
  const tags = (Array.isArray(p.tags) ? p.tags : [])
    .map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 14);
  const search = (Array.isArray(p.searchWords) ? p.searchWords : [])
    .map((t) => String(t).trim()).filter(Boolean).slice(0, 8);

  const title = String(p.title || "").trim();
  const body = String(p.body || "").trim();

  return {
    title,
    body,
    tags,
    searchWords: search,
    // 붙여넣을 수 있게 통째로 한 덩어리도 같이 줍니다.
    full: [title, body, tags.map((t) => "#" + t).join(" ")].filter(Boolean).join("\n\n"),
    // ⚠️ 여기가 이 도구의 진짜 값어치입니다.
    // 태그를 붙이는 건 사람이 앱에서 해야 하는데, 뭘 붙일지 모르면 그냥 안 붙입니다.
    todo: buildTodo({ product, place }),
  };
}

function buildTodo({ product, place }) {
  const list = [
    {
      what: "영상 올리기",
      how: "네이버 앱 또는 블로그 앱에서 [클립] → 영상 선택",
      note: `하루 ${DAILY_LIMIT}편까지 올라갑니다. 그 이상은 안 됩니다.`,
    },
    {
      what: "문구 붙여넣기",
      how: "위의 [전체 복사]를 눌러 설명란에 그대로 붙여넣으세요",
      note: "첫 줄이 목록에 보이는 제목 역할을 합니다.",
    },
  ];

  if (product) {
    list.push({
      what: "쇼핑태그 붙이기",
      how: `업로드 화면에서 [상품 태그] → 스마트스토어 상품 "${product}" 선택`,
      note: "⚠️ 이게 클립의 가장 큰 장점입니다. 프로필의 [쇼핑기록] 탭에 모여서, " +
            "나중에 들어온 사람도 상품을 찾아갑니다. 인스타·틱톡에는 없는 기능이에요.",
    });
  } else {
    list.push({
      what: "쇼핑태그 (파는 물건이 있으면)",
      how: "업로드 화면에서 [상품 태그] → 스마트스토어 상품 선택",
      note: "스마트스토어에 상품을 올리시면 여기에 붙일 수 있습니다. " +
            "클립에만 있는 기능이라 안 쓰면 아까워요.",
    });
  }

  if (place) {
    list.push({
      what: "장소태그 붙이기",
      how: `업로드 화면에서 [장소] → "${place}" 검색해서 선택`,
      note: "장소태그를 달면 그 장소를 검색한 사람에게도 노출되고, " +
            "프로필의 [장소기록] 탭에 모입니다.",
    });
  }

  list.push({
    what: "블로그 글로 연결",
    how: "설명란 끝에 관련 블로그 글 주소를 한 줄 넣으세요",
    note: "클립에서 블로그로 넘어가면 체류시간이 함께 올라갑니다. " +
          "네이버가 두 개를 같은 사람 것으로 보고 둘 다 밀어줍니다.",
  });

  return list;
}

module.exports = { make, DAILY_LIMIT };
