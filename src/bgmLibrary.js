// 배경음악(BGM) 추천 기능.
// scripts/generate-bgm.js 로 미리 만들어 둔 "우수리미 자체 제작" 무료 배경음 5종
// (assets/bgm/*.mp3, 저작권 걱정 없는 자체 합성 음원) 중에서, 영상 대본(캡션)의
// 키워드를 보고 어울리는 순서대로 정렬해서 5개 전부를 추천 목록으로 돌려줍니다.
// 사용자가 그중 하나를 고르면, 그 파일 경로를 /api/shortform/render 의 bgmId로
// 넘겨서 최종 mp4에 삽입합니다.

const path = require("path");
const fs = require("fs");

const BGM_DIR = path.join(__dirname, "..", "assets", "bgm");

const TRACKS = [
  {
    id: "upbeat-pop",
    label: "신나는 팝",
    mood: "upbeat",
    description: "밝고 경쾌한 느낌 — 세일/이벤트/신상 소개에 잘 어울려요",
    keywords: ["세일", "할인", "핫딜", "특가", "이벤트", "오픈", "런칭", "신상", "인기", "대박", "쇼핑"],
  },
  {
    id: "calm-piano",
    label: "잔잔한 피아노풍",
    mood: "calm",
    description: "차분하고 편안한 느낌 — 카페/여행/힐링 콘텐츠에 잘 어울려요",
    keywords: ["카페", "감성", "여행", "휴식", "힐링", "가을", "겨울", "혼자", "책", "커피"],
  },
  {
    id: "emotional-vlog",
    label: "감성 브이로그",
    mood: "emotional",
    description: "따뜻하고 여운 있는 느낌 — 일상 브이로그/후기 콘텐츠에 잘 어울려요",
    keywords: ["하루", "일상", "브이로그", "이야기", "추억", "여운", "감동", "느낌", "후기", "리뷰"],
  },
  {
    id: "trendy-hiphop",
    label: "트렌디 힙합비트",
    mood: "trendy",
    description: "리듬감 있고 힙한 느낌 — 숏폼/챌린지/트렌드 콘텐츠에 잘 어울려요",
    keywords: ["숏폼", "챌린지", "트렌드", "밈", "요즘", "핫플", "힙", "스타일", "패션"],
  },
  {
    id: "bright-acoustic",
    label: "밝은 어쿠스틱풍",
    mood: "bright",
    description: "산뜻하고 밝은 느낌 — 야외/데이트/가족 콘텐츠에 잘 어울려요",
    keywords: ["봄", "여름", "야외", "산책", "데이트", "친구", "가족", "웃음", "나들이"],
  },
];

function getTrackPath(id) {
  const track = TRACKS.find((t) => t.id === id);
  if (!track) return null;
  const p = path.join(BGM_DIR, `${id}.mp3`);
  return fs.existsSync(p) ? p : null;
}

// scenes(장면 배열)의 caption 텍스트를 모아서 각 트랙의 keywords와 겹치는 개수로
// 점수를 매기고, 점수 높은 순으로 5개 전부를 정렬해서 돌려줍니다(라이브러리가
// 5개뿐이라 "추천 5개"는 항상 전부를 뜻하지만, 순서가 콘텐츠에 맞게 바뀝니다).
function recommendBgm(scenes = []) {
  const text = scenes.map((s) => s.caption || "").join(" ");
  const scored = TRACKS.map((t) => {
    const score = t.keywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
    return { ...t, score, previewUrl: `/bgm/${t.id}.mp3` };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

module.exports = { TRACKS, getTrackPath, recommendBgm };
