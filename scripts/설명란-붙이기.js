/**
 * 올라간 영상의 설명란 **맨 위에 제휴 블록을 끼워넣습니다** — 2026-09-05
 *
 *   node scripts/설명란-붙이기.js                    미리보기 (아무것도 안 바꿈)
 *   node scripts/설명란-붙이기.js --한편 9iQmvX9u_LU  한 편만 진짜로
 *   node scripts/설명란-붙이기.js --진짜             전부 진짜로
 *   node scripts/설명란-붙이기.js --확인             지금 몇 편에 링크가 들어가 있나
 *
 * ── 왜 fix-title-desc.js 를 안 쓰나 ──
 * 그 스크립트는 제목·설명을 **통째로 교체**합니다. 우수리미 영상은 설명란에
 * 협찬 링크·해시태그·타임스탬프가 이미 들어 있어서 교체하면 다 날아갑니다.
 * 여기서는 **기존 설명을 그대로 두고 앞에만 끼워넣습니다.**
 *
 * ── 「했다」가 아니라 「됐다」를 봅니다 ──
 * 저장 버튼을 눌렀는지가 아니라, 끝나고 **유튜브 API 로 다시 조회해서**
 * 설명에 링크가 실제로 들어갔는지 셉니다. 화면만 보면 조용히 실패합니다.
 *
 * ⚠️ 전용 크롬 프로필이 필요합니다 — 포트 9335 · 우수리미부부 계정
 *    9333 = 부부 경제 연구소 · 9334 = 느지막한 책상. 붙지 마십시오.
 *    띄우기:  powershell -ExecutionPolicy Bypass -File scripts/크롬-우수리미.ps1
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const 뿌리 = path.join(__dirname, "..");
const cdp = require(path.join(뿌리, "..", "_shared", "card-news", "cdp.js"));
const PORT = 9335;
const 상한 = 5000; // 유튜브 설명란 글자 수 상한
const 표식 = "link.coupang.com"; // 이미 붙었는지 보는 기준

const 훑기 =
  "const 모두=[];const 재귀=(뿌리)=>{for(const e of 뿌리.querySelectorAll('*')){모두.push(e);if(e.shadowRoot)재귀(e.shadowRoot);}};재귀(document);";
const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));

function 인자() {
  const a = process.argv.slice(2),
    o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--진짜") o.진짜 = true;
    else if (a[i] === "--확인") o.확인 = true;
    else if (a[i].startsWith("--")) o[a[i].slice(2)] = a[i + 1];
  }
  if (o.한편) o.진짜 = true;
  return o;
}

function 키() {
  const env = fs.readFileSync(path.join(뿌리, ".env"), "utf8");
  const m = env.match(/^YOUTUBE_API_KEY=(.*)$/m);
  if (!m) throw new Error(".env 에 YOUTUBE_API_KEY 가 없습니다");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const 받기 = (url) =>
  new Promise((ok, no) => {
    https
      .get(url, (r) => {
        let s = "";
        r.on("data", (c) => (s += c));
        r.on("end", () => {
          try {
            ok(JSON.parse(s));
          } catch (e) {
            no(e);
          }
        });
      })
      .on("error", no);
  });

/** 영상들의 현재 설명을 유튜브에서 가져옵니다 — 화면에서 읽으면 잘립니다 */
async function 현재설명(ids, k) {
  const 결과 = {};
  for (let i = 0; i < ids.length; i += 50) {
    const d = await 받기(
      "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" +
        ids.slice(i, i + 50).join(",") +
        "&key=" +
        k,
    );
    for (const v of d.items || [])
      결과[v.id] = { 제목: v.snippet.title, 설명: v.snippet.description || "" };
  }
  return 결과;
}

/** 전용 크롬 창을 화면 맨 앞으로 올립니다 (포커스는 안 뺏음).
 *  execCommand('insertText') 는 문서에 포커스가 없으면 예외도 없이 아무것도 안 합니다.
 *  → 제목이 파일명 그대로, 설명이 0자로 남는 사고가 이것 때문이었습니다. */
function 창올리기() {
  const ps = [
    "$ErrorActionPreference='SilentlyContinue'",
    'Add-Type @"',
    "using System;using System.Runtime.InteropServices;",
    'public class W { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f); }',
    '"@',
    "$ps = Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*youtube_woosoorimi*' } | Select-Object -Expand ProcessId",
    "foreach($p in $ps){ $h=(Get-Process -Id $p).MainWindowHandle; if($h -ne 0){ [W]::SetWindowPos($h,[IntPtr]-1,0,0,0,0,0x0013) | Out-Null } }",
  ].join("\n");
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  } catch (e) {}
}

/** 설명칸 하나만 통째로 갈아끼웁니다. 제목은 건드리지 않습니다. */
async function 설명바꾸기(탭, id, 옛설명, 새설명) {
  await 탭.이동("https://studio.youtube.com/video/" + id + "/edit");
  const 준비 = await 탭.기다리기(
    "(function(){" +
      훑기 +
      "return 모두.filter(e=>e.getAttribute&&e.getAttribute('contenteditable')==='true'&&e.offsetParent!==null).length>=2})()",
    40,
  );
  if (!준비) return { ok: false, 왜: "편집 화면이 안 뜸" };

  // 🔴 위치로 고르지 않습니다. **지금 들어 있는 글로 설명칸을 찾습니다.**
  //    제목칸과 순서가 바뀌어도 엉뚱한 칸을 안 건드립니다. eds[1] 은 넘겨짚기입니다.
  const 지문 = 옛설명.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!지문) return { ok: false, 왜: "옛 설명이 비어 있어 설명칸을 특정할 수 없음" };

  창올리기();
  await 잠깐(600);

  for (let 시도 = 1; 시도 <= 4; 시도++) {
    const r = await 탭.평가(
      "(function(){" +
        훑기 +
        "\nconst eds=모두.filter(e=>e.getAttribute&&e.getAttribute('contenteditable')==='true'&&e.offsetParent!==null);" +
        "\nconst 지문=" +
        JSON.stringify(지문) +
        ";" +
        "\nconst el=eds.find(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().indexOf(지문)===0);" +
        "\nif(!el) return {찾음:false, 칸수:eds.length, 미리:eds.map(e=>(e.innerText||'').slice(0,24))};" +
        "\nel.focus();" +
        "\nconst rg=document.createRange(); rg.selectNodeContents(el);" +
        "\nconst sl=window.getSelection(); sl.removeAllRanges(); sl.addRange(rg);" +
        "\ndocument.execCommand('insertText',false," +
        JSON.stringify(새설명) +
        ");" +
        "\nel.dispatchEvent(new Event('input',{bubbles:true}));" +
        "\nreturn {찾음:true, 길이:(el.innerText||'').length};" +
        "\n})()",
    );

    if (!r || !r.찾음) {
      if (시도 === 4) return { ok: false, 왜: "설명칸을 못 찾음", 미리: r && r.미리 };
      await 잠깐(2000);
      continue;
    }
    await 잠깐(1500);
    // 「넣었다 ≠ 들어갔다」 — 글자 수로 봅니다 (줄바꿈 처리 차이만큼 여유)
    if (r.길이 >= 새설명.length - 80) {
      for (let i = 0; i < 8; i++) {
        await 탭.글자로누르기("저장");
        await 잠깐(2500);
        const 잠김 = await 탭.평가(
          "(function(){" +
            훑기 +
            "const b=모두.filter(e=>e.offsetParent!==null&&(e.textContent||'').trim()==='저장');" +
            "return b.length===0||b.every(x=>x.hasAttribute('disabled'))})()",
        );
        if (잠김) return { ok: true, 길이: r.길이 };
      }
      return { ok: false, 왜: "저장 확인 실패", 길이: r.길이 };
    }
    await 잠깐(2000);
  }
  return { ok: false, 왜: "입력이 안 들어감" };
}

(async () => {
  const o = 인자();
  const k = 키();
  const 블록 = JSON.parse(
    fs.readFileSync(path.join(뿌리, "data", "설명란-블록.json"), "utf8"),
  );
  let ids = Object.keys(블록);
  if (o.한편) ids = ids.filter((x) => x === o.한편);
  if (!ids.length) {
    console.error("대상이 없습니다: " + o.한편);
    process.exit(1);
  }

  const 지금 = await 현재설명(ids, k);

  // ── --확인 : 지금 몇 편에 들어가 있나 ─────────────────────────
  if (o.확인) {
    const 됨 = ids.filter((i) => 지금[i] && 지금[i].설명.includes(표식));
    console.log(
      "대상 " + ids.length + "편 · 링크 들어간 것 " + 됨.length + "편 · 남은 것 " + (ids.length - 됨.length) + "편",
    );
    for (const i of ids)
      if (!지금[i] || !지금[i].설명.includes(표식))
        console.log("   남음  " + i + "  " + (지금[i] ? 지금[i].제목.slice(0, 40) : "(영상 없음)"));
    return;
  }

  // ── 계획을 먼저 세웁니다 ──────────────────────────────────────
  const 할것 = [],
     건너뜀 = [];
  for (const id of ids) {
    const 현 = 지금[id];
    if (!현) { 건너뜀.push([id, "영상을 못 찾음"]); continue; }
    if (현.설명.includes(표식)) { 건너뜀.push([id, "이미 붙어 있음"]); continue; }
    if (!현.설명.trim()) { 건너뜀.push([id, "설명이 비어 있음 — 손으로 붙이십시오"]); continue; }
    const 새 = 블록[id].블록.trim() + "\n\n" + 현.설명;
    if (새.length > 상한) { 건너뜀.push([id, 새.length + "자 — 상한 " + 상한 + " 초과"]); continue; }
    할것.push({ id: id, 제목: 현.제목, 옛: 현.설명, 새: 새 });
  }

  console.log("\n대상 " + ids.length + "편 → 붙일 것 " + 할것.length + "편 · 건너뛸 것 " + 건너뜀.length + "편");
  for (const x of 건너뜀) console.log("   건너뜀  " + x[0] + "  " + x[1]);
  console.log("");
  for (const h of 할것)
    console.log(
      "   " + h.id + "  " + String(h.옛.length).padStart(4) + "자 → " + String(h.새.length).padStart(4) + "자   " + h.제목.slice(0, 34),
    );

  if (!o.진짜) {
    console.log("\n미리보기입니다. 아무것도 안 바꿨습니다.");
    console.log("한 편만 시험:  node scripts/설명란-붙이기.js --한편 " + (할것[0] ? 할것[0].id : "<영상ID>"));
    console.log("전부 실행   :  node scripts/설명란-붙이기.js --진짜");
    return;
  }

  // ── 진짜로 붙입니다 ───────────────────────────────────────────
  const 탭 = await cdp.붙기(PORT, /studio\.youtube\.com|youtube\.com/);
  const 로그 = [];
  for (let i = 0; i < 할것.length; i++) {
    const h = 할것[i];
    process.stdout.write("[" + (i + 1) + "/" + 할것.length + "] " + h.id + " " + h.제목.slice(0, 24) + " ... ");
    let r;
    try {
      r = await 설명바꾸기(탭, h.id, h.옛, h.새);
    } catch (e) {
      r = { ok: false, 왜: e.message };
    }
    console.log(r.ok ? "저장 눌렀음" : "✖ " + r.왜);
    로그.push(Object.assign({ id: h.id }, r));
    await 잠깐(1200);
  }
  탭.닫기();

  // ── 🔴 진짜 확인 — 유튜브에 다시 물어봅니다 ───────────────────
  console.log("\n유튜브에 다시 물어봅니다 (캐시 때문에 몇 초 걸립니다)");
  await 잠깐(8000);
  const 뒤 = await 현재설명(할것.map((h) => h.id), k);
  const 됨 = 할것.filter((h) => 뒤[h.id] && 뒤[h.id].설명.includes(표식));
  const 안됨 = 할것.filter((h) => !뒤[h.id] || !뒤[h.id].설명.includes(표식));
  console.log("\n✅ 실제로 들어감 " + 됨.length + "편 / " + 할것.length + "편");
  for (const h of 안됨) console.log("   🔴 안 들어감  " + h.id + "  " + h.제목.slice(0, 40));
  fs.writeFileSync(
    path.join(뿌리, "data", "설명란-붙이기-기록.json"),
    JSON.stringify(
      { 때: new Date().toISOString(), 로그: 로그, 됨: 됨.map((h) => h.id), 안됨: 안됨.map((h) => h.id) },
      null,
      1,
    ),
  );
})().catch((e) => {
  console.error("실패: " + e.message);
  process.exit(1);
});
