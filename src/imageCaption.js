// 사진을 실제로 "보고" 숏폼 자막 한 줄을 만들어주는 이미지 인식 AI 모듈입니다.
//
// Claude의 비전(vision) 기능을 사용합니다 — "AI 자동화 글쓰기"/"맞춤형 글쓰기 프롬프트"에서
// 이미 쓰고 있는 ANTHROPIC_API_KEY를 그대로 재사용하므로, 별도 키를 새로 발급받을 필요가
// 없습니다. 서버에 그 키가 없으면 이 기능은 조용히 건너뛰고(에러로 서버가 죽지 않고)
// null을 돌려주며, 호출한 쪽(shortformPlanner.js)이 예전처럼 주제 기반 일반 문구로
// 대신 채웁니다.

const fs = require("fs");
const path = require("path");
const { callClaude, isConfigured } = require("./claudeClient");

const MEDIA_TYPE_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function guessMediaType(filePath) {
  return MEDIA_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] || "image/jpeg";
}

// 너무 큰 이미지는 Claude Vision 요청 자체가 실패하거나 비용/속도에 불리해서, 이 크기를
// 넘으면 아예 시도하지 않고 호출부가 대체 문구로 채우도록 null을 돌려줍니다.
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * imagePath: 로컬 파일 경로 (public/uploads/... 안에 실제로 저장된 사진 파일)
 * topic: 영상 전체 주제 (사진과 함께 문맥 힌트로 같이 전달)
 * bodyContext: (선택) 사용자가 붙여넣은 본문 요약 문단 중, 이 사진과 가까운 부분(또는
 *   전체). 넣어주면 AI가 "사진에 보이는 것"과 "본문에서 말하는 내용"을 같이 보고,
 *   둘이 자연스럽게 맞아떨어지는 자막 한 줄을 만듭니다. 안 넣으면 사진 내용만 보고 만듭니다.
 * 반환: AI가 사진(+본문 맥락) 내용을 보고 만든 자막 한 줄(string). 키가 없거나 실패하면
 *       null — 호출부에서 null이면 기존 방식(일반 문구)으로 대신 채우세요.
 */
async function generateCaptionFromImage(imagePath, topic = "", bodyContext = "") {
  if (!isConfigured()) return null;
  if (!imagePath || !fs.existsSync(imagePath)) return null;

  try {
    const stat = fs.statSync(imagePath);
    if (stat.size > MAX_BYTES) return null;

    const base64 = fs.readFileSync(imagePath).toString("base64");
    const mediaType = guessMediaType(imagePath);

    const system =
      "너는 한국 숏폼(릴스/쇼츠) 영상 자막을 쓰는 카피라이터야. 첨부된 사진을 실제로 보고, " +
      "그 사진에 실제로 보이는 내용을 바탕으로 짧고 자연스러운 자막 한 줄을 한국어로 만들어. " +
      "본문 내용이 함께 주어지면, 사진에 보이는 것과 본문에서 설명하는 내용이 서로 자연스럽게 " +
      "이어지도록(같은 이야기를 하는 것처럼) 캡션을 만들어 — 본문 문장을 그대로 베끼지 말고, " +
      "사진과 본문 둘 다를 반영한 자연스러운 한 줄로 재구성해. " +
      "사진이나 본문에 없는 내용을 지어내지 마(예: 없는 상표/장소/인물을 있다고 하지 마). " +
      "18자 내외로 짧게 쓰고, 후킹력 있게. 캡션 문구만 출력하고 따옴표나 다른 설명은 절대 붙이지 마.";

    const parts = [];
    if (topic) parts.push(`영상 전체 주제: "${topic}"`);
    if (bodyContext) parts.push(`본문 내용(참고용, 그대로 베끼지 말 것): "${bodyContext.slice(0, 400)}"`);
    parts.push("이 사진에 어울리는 자막 한 줄을 만들어줘.");
    const userText = parts.join("\n");

    const raw = await callClaude({
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: userText },
          ],
        },
      ],
      maxTokens: 100,
      temperature: 0.7,
    });

    const caption = (raw || "").trim().replace(/^["'“”]|["'“”]$/g, "");
    return caption || null;
  } catch (err) {
    return null; // 실패해도 서버가 죽지 않고, 호출부가 대체 문구로 채웁니다.
  }
}

module.exports = { generateCaptionFromImage };
