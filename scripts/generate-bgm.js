// 우수리미가 자체 제작(합성)하는 무료 배경음(BGM) 5종을 만드는 스크립트입니다.
// 실제 음원 파일(mp3)을 외부에서 가져오는 게 아니라, ffmpeg의 사인파 합성 기능으로
// 코드가 직접 화음(코드)을 쌓아 짧은 루프를 만듭니다 — 그래서 저작권 걱정이 전혀 없고,
// 서버 배포 환경(Render 등)에서도 인터넷 연결 없이 항상 똑같이 재생 가능합니다.
//
// 사용법: node scripts/generate-bgm.js  (프로젝트 세팅 시 한 번만 실행하면 됩니다.
// 이미 만들어진 결과물이 assets/bgm/*.mp3 로 저장소에 포함되어 있으니, 보통은 다시
// 실행할 필요가 없습니다.)

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const OUT_DIR = path.join(__dirname, "..", "assets", "bgm");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || "").toString().split("\n").slice(-30).join("\n");
        return reject(new Error(tail || err.message));
      }
      resolve();
    });
  });
}

// notesTrack: 화음(코드) 진행. 각 항목은 동시에 울릴 주파수(Hz) 배열입니다.
// stepDur: 화음 하나가 지속되는 초 단위 길이.
async function synthesizeTrack({ id, label, mood, notesTrack, stepDur, lowpass, echo, outPath }) {
  const inputArgs = [];
  const chordLabels = [];
  notesTrack.forEach((freqs, i) => {
    freqs.forEach((f) => {
      inputArgs.push("-f", "lavfi", "-i", `sine=frequency=${f}:duration=${stepDur}`);
    });
    chordLabels.push(freqs.length);
  });

  let inputIdx = 0;
  const mixParts = [];
  const chordOutTags = [];
  chordLabels.forEach((count, i) => {
    const tags = [];
    for (let k = 0; k < count; k++) {
      tags.push(`[${inputIdx}:a]`);
      inputIdx++;
    }
    const chordTag = `c${i}`;
    if (count > 1) {
      mixParts.push(
        `${tags.join("")}amix=inputs=${count}:duration=first:dropout_transition=0,` +
          `afade=t=in:st=0:d=0.03,afade=t=out:st=${Math.max(stepDur - 0.03, 0)}:d=0.03[${chordTag}]`
      );
    } else {
      mixParts.push(
        `${tags[0]}afade=t=in:st=0:d=0.03,afade=t=out:st=${Math.max(stepDur - 0.03, 0)}:d=0.03[${chordTag}]`
      );
    }
    chordOutTags.push(`[${chordTag}]`);
  });

  const concatPart = `${chordOutTags.join("")}concat=n=${chordOutTags.length}:v=0:a=1[loopraw]`;

  const totalDur = notesTrack.length * stepDur;
  const postParts = [];
  let lastTag = "loopraw";
  if (lowpass) {
    postParts.push(`[${lastTag}]lowpass=f=${lowpass}[lp]`);
    lastTag = "lp";
  }
  if (echo) {
    postParts.push(`[${lastTag}]aecho=0.6:0.5:${echo.delays}:${echo.decays}[ec]`);
    lastTag = "ec";
  }
  postParts.push(
    `[${lastTag}]afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(totalDur - 0.3, 0)}:d=0.3,` +
      `loudnorm=I=-18:TP=-2:LRA=7,volume=0.9[out]`
  );

  const filterComplex = [...mixParts, concatPart, ...postParts].join(";");

  await runFfmpeg([
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[out]",
    "-ac",
    "2",
    "-b:a",
    "128k",
    outPath,
  ]);

  console.log(`  ✔ ${label} (${mood}) — ${totalDur.toFixed(1)}초 루프 → ${path.basename(outPath)}`);
}

// 음이름 → 주파수(Hz) 약식 표
const N = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25,
};

const TRACKS = [
  {
    id: "upbeat-pop",
    label: "신나는 팝",
    mood: "upbeat",
    keywords: ["세일", "할인", "핫딜", "특가", "이벤트", "오픈", "런칭", "신상", "인기", "대박"],
    stepDur: 0.5,
    lowpass: 4200,
    echo: null,
    notesTrack: repeat(
      [[N.C3, N.C4, N.E4, N.G4], [N.G2, N.G3, N.B3, N.G4], [N.A2, N.A3, N.C4, N.E4], [N.F2, N.F3, N.A3, N.C4]],
      4
    ),
  },
  {
    id: "calm-piano",
    label: "잔잔한 피아노풍",
    mood: "calm",
    keywords: ["카페", "감성", "여행", "휴식", "힐링", "가을", "겨울", "혼자", "책"],
    stepDur: 1.5,
    lowpass: 3000,
    echo: { delays: "60|90", decays: "0.3|0.2" },
    notesTrack: repeat(
      [
        [N.C3, N.G3, N.C4, N.E4],
        [N.A2, N.E3, N.A3, N.C4],
        [N.F2, N.C3, N.F3, N.A3],
        [N.G2, N.D3, N.G3, N.B3],
      ],
      2
    ),
  },
  {
    id: "emotional-vlog",
    label: "감성 브이로그",
    mood: "emotional",
    keywords: ["하루", "일상", "브이로그", "이야기", "추억", "여운", "감동", "느낌"],
    stepDur: 2.0,
    lowpass: 2200,
    echo: { delays: "80|120", decays: "0.4|0.3" },
    notesTrack: [
      [N.A2, N.A3, N.C4, N.E4],
      [N.F2, N.F3, N.A3, N.C4],
      [N.C3, N.C4, N.E4, N.G4],
      [N.G2, N.G3, N.B3, N.D4],
      [N.A2, N.A3, N.C4, N.E4],
      [N.F2, N.F3, N.A3, N.C4],
    ],
  },
  {
    id: "trendy-hiphop",
    label: "트렌디 힙합비트",
    mood: "trendy",
    keywords: ["숏폼", "챌린지", "트렌드", "밈", "요즘", "핫플", "힙", "스타일"],
    stepDur: 0.4,
    lowpass: 5200,
    echo: null,
    notesTrack: repeat(
      [[N.C2], [N.C2], [N.G2], [N.C2], [N.C2], [N.C2], [N.F2], [N.G2]],
      2
    ),
  },
  {
    id: "bright-acoustic",
    label: "밝은 어쿠스틱풍",
    mood: "bright",
    keywords: ["봄", "여름", "야외", "산책", "데이트", "친구", "가족", "웃음"],
    stepDur: 0.35,
    lowpass: 6000,
    echo: { delays: "50", decays: "0.15" },
    notesTrack: repeat(
      [[N.G3], [N.A3], [N.B3], [N.D4], [N.E4], [N.D4], [N.B3], [N.A3]],
      3
    ),
  },
];

function repeat(arr, times) {
  const out = [];
  for (let i = 0; i < times; i++) out.push(...arr);
  return out;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("우수리미 자체 제작 배경음 5종 생성 중...");
  for (const t of TRACKS) {
    const outPath = path.join(OUT_DIR, `${t.id}.mp3`);
    await synthesizeTrack({ ...t, outPath });
  }
  console.log("완료!");
}

main().catch((err) => {
  console.error("BGM 생성 실패:", err.message);
  process.exit(1);
});
