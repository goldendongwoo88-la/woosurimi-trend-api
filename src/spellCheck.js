/**
 * 맞춤법 검사.
 *
 * ⚠️ AI를 안 씁니다. 그리고 남의 검사기를 몰래 부르지도 않습니다.
 *
 * 늑대플을 비롯한 몇몇 도구는 네이버 맞춤법 검사기의 내부 주소를 대신 부릅니다.
 * 그게 더 정확하기는 합니다. 그런데 두 가지가 걸립니다.
 *   1) 문서에 없는 주소라 네이버가 언제든 바꾸거나 막을 수 있습니다.
 *      그날 사장님 맞춤법 기능이 통째로 죽습니다.
 *   2) 사장님이 아직 발행 안 한 글 전체를 남의 서버로 보내게 됩니다.
 * 그래서 **한국어 블로그에서 실제로 나오는 틀린 말**을 규칙으로 잡습니다.
 * 모든 오류를 잡지는 못합니다. 대신 잡는 것은 확실하고, 빠르고, 공짜입니다.
 *
 * ⚠️ 확실한 것만 고칩니다.
 *   sure: true  — 어떤 문장에서도 틀린 말. 바로 고쳐도 됩니다. (됬 → 됐)
 *   sure: false — 앞뒤를 봐야 압니다. **알려만 드리고 안 고칩니다.** (되요/돼요)
 * 애매한 걸 자동으로 고치면 맞는 문장을 틀리게 만듭니다.
 * 맞춤법 도구가 글을 망치는 것만큼 나쁜 게 없습니다.
 */

/**
 * 한글 음절의 받침을 봅니다.
 *
 * ⚠️ 이게 왜 필요하냐면, '할께 → 할게' 규칙을 정규식만으로는 못 씁니다.
 * 처음에 /([가-힣])ㄹ께/ 라고 썼는데, '할'은 한 글자로 합쳐진 음절이라
 * 그 안의 'ㄹ'이 따로 안 보입니다. **이 규칙은 아무것도 못 잡고 있었습니다.**
 * 받침을 직접 계산해야 합니다. (한글 음절 = 0xAC00 + (초성*21 + 중성)*28 + 받침)
 */
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ",
  "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function finalOf(ch) {
  const c = String(ch || "").charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return null;
  return JONG[(c - 0xac00) % 28];
}

/**
 * 규칙 하나.
 *   find — 찾을 것 (g 플래그 필수)
 *   to   — 바꿀 것. 문자열($1 씀) 또는 String.replace에 넘길 함수.
 *          함수가 원래 글자를 그대로 돌려주면 "오류 아님"으로 보고 건너뜁니다.
 *   sure — 자동으로 고쳐도 되는지
 */
const RULES = [
  // ── 어떤 문장에서도 틀린 것 ─────────────────────────────
  { id: "됬", find: /됬/g, to: "됐", sure: true,
    why: "'됬'은 어떤 경우에도 없는 글자입니다. '되었'의 준말은 '됐'입니다." },
  { id: "뵈요", find: /뵈요/g, to: "봬요", sure: true,
    why: "'뵈어요'의 준말이라 '봬요'가 맞습니다." },
  { id: "몇일", find: /몇\s*일(?![0-9])/g, to: "며칠", sure: true,
    why: "'몇일'은 없는 말입니다. 언제나 '며칠'입니다." },
  { id: "오랫만", find: /오랫만/g, to: "오랜만", sure: true,
    why: "'오래간만'의 준말이라 '오랜만'입니다. ('오랫동안'은 맞습니다)" },
  { id: "어의없", find: /어의\s?없/g, to: "어이없", sure: true,
    why: "'어이없다'가 맞습니다. '어의'는 임금의 의사를 뜻하는 다른 말입니다." },
  { id: "역활", find: /역활/g, to: "역할", sure: true, why: "'역할(役割)'이 맞습니다." },
  { id: "희안", find: /희안하/g, to: "희한하", sure: true, why: "'희한(稀罕)하다'가 맞습니다." },
  { id: "설레임", find: /설레임/g, to: "설렘", sure: true,
    why: "'설레다'의 명사형은 '설렘'입니다. ('설레임'은 아이스크림 이름입니다)" },
  { id: "갯수", find: /갯수/g, to: "개수", sure: true,
    why: "한자어 사이에는 사이시옷을 안 넣습니다. '개수(個數)'입니다." },
  { id: "곱배기", find: /곱배기/g, to: "곱빼기", sure: true, why: "'곱빼기'가 맞습니다." },
  { id: "눈꼽", find: /눈꼽/g, to: "눈곱", sure: true, why: "'눈곱'이 맞습니다." },
  { id: "닥달", find: /닥달/g, to: "닦달", sure: true, why: "'닦달하다'가 맞습니다." },
  { id: "금새", find: /금새/g, to: "금세", sure: true, why: "'금시에'의 준말이라 '금세'입니다." },
  { id: "어떻해", find: /어떻해/g, to: "어떡해", sure: true,
    why: "'어떻게 해'의 준말은 '어떡해'입니다. ('어떻게'는 그대로 씁니다)" },
  { id: "무릎쓰", find: /무릎\s?쓰/g, to: "무릅쓰", sure: true,
    why: "'무릅쓰다'가 맞습니다. '무릎'은 신체 부위입니다." },
  { id: "왠만", find: /왠만/g, to: "웬만", sure: true,
    why: "'왠'은 '왠지'에만 씁니다. 나머지는 전부 '웬'입니다." },
  { id: "왠일", find: /왠일/g, to: "웬일", sure: true, why: "'웬일'이 맞습니다." },
  { id: "웬지", find: /웬지/g, to: "왠지", sure: true,
    why: "'왜인지'의 준말이라 '왠지'입니다. 이것만 '왠'입니다." },
  { id: "읍니다", find: /읍니다/g, to: "습니다", sure: true,
    why: "1988년에 '-습니다'로 바뀌었습니다." },
  { id: "째째", find: /째째하/g, to: "쩨쩨하", sure: true, why: "'쩨쩨하다'가 맞습니다." },
  { id: "구렛나루", find: /구렛나루/g, to: "구레나룻", sure: true, why: "'구레나룻'이 맞습니다." },
  { id: "삼가해", find: /삼가해\s?주/g, to: "삼가 주", sure: true,
    why: "'삼가다'가 기본형이라 '삼가 주세요'가 맞습니다." },
  { id: "담궈", find: /담궈|담구고|담굽니/g, to: (m) => m.replace("담구", "담그").replace("담궈", "담가"),
    sure: true, why: "'담그다'라서 '담가'입니다. ('담구다'는 없는 말입니다)" },
  { id: "잠궈", find: /잠궈/g, to: "잠가", sure: true, why: "'잠그다'라서 '잠가'입니다." },
  { id: "않되", find: /않\s?되/g, to: "안 되", sure: true,
    why: "'않-'은 '아니하-'의 준말이라 뒤에 '되'가 못 옵니다. '안 되다'입니다." },
  { id: "몇번", find: /몇번/g, to: "몇 번", sure: true, why: "'몇'은 관형사라 띄어 씁니다." },
  { id: "할수", find: /할수(?=\s?(있|없))/g, to: "할 수", sure: true,
    why: "'수'는 의존명사라 띄어 씁니다. '할 수 있다'." },
  { id: "것같", find: /것같/g, to: "것 같", sure: true,
    why: "'같다'는 따로 쓰는 말이라 띄어 씁니다. '~것 같다'." },

  // ⚠️ 받침이 ㄹ일 때만 '-께 → -게'입니다. '선생님께'는 맞는 말이라 건드리면 안 됩니다.
  { id: "ㄹ께", sure: true,
    find: /([가-힣])께(요|[.,!?…\s]|$)/g,
    to: (m, syl, tail) => (finalOf(syl) === "ㄹ" ? syl + "게" + tail : m),
    why: "소리는 [께]로 나도 '-ㄹ게'로 적습니다. '할게요, 갈게요'." },

  // ── 앞뒤를 봐야 하는 것 (알려만 드립니다) ────────────────
  { id: "되요", find: /(^|[^가-힣])되요/g, to: (m, pre) => pre + "돼요", sure: false,
    why: "'되어요'의 준말이면 '돼요'입니다. '하'를 넣어 말이 되면 '되', '해'를 넣어 말이 되면 '돼'입니다." },
  { id: "안되", find: /안되(?=[다요는게죠])/g, to: "안 되", sure: false,
    why: "'되지 않는다'는 뜻이면 띄어서 '안 되다'. '수준에 못 미친다'는 뜻이면 붙여서 '안되다'입니다." },
  { id: "낳으세요", find: /낳으세요|낳으시(길|기)/g, to: (m) => m.replace("낳으", "나으"), sure: false,
    why: "병이 <b>낫다</b>입니다. '낳다'는 아이를 낳는 말입니다." },
  { id: "바램", find: /바램(?=[이을은과와,.\s]|$)/g, to: "바람", sure: false,
    why: "희망이라는 뜻이면 '바람'입니다. ('바램'은 색이 바래는 것)" },
  { id: "로써", find: /로써/g, to: "로서", sure: false,
    why: "자격·신분이면 '로서'(학생으로서), 수단·도구면 '로써'(말로써)입니다. 지금 어느 쪽인지 보세요." },
  { id: "던지", find: /던지(?=[\s,.]|$)/g, to: "든지", sure: false,
    why: "고르는 뜻이면 '-든지'(가든지 말든지), 지난 일을 떠올리면 '-던지'(얼마나 춥던지)입니다." },
  { id: "한번", find: /한번(?=\s?(더|만|씩))/g, to: "한 번", sure: false,
    why: "횟수를 세면 띄어서 '한 번', '시도해 보다'는 뜻이면 붙여서 '한번'입니다." },
  { id: "문안한", find: /문안한/g, to: "무난한", sure: false,
    why: "무던하다는 뜻이면 '무난한'입니다. ('문안'은 안부를 여쭙는 말입니다)" },
  { id: "그럼에도", find: /그럼에도\s?불구하고/g, to: "그런데도", sure: false,
    why: "틀린 말은 아닙니다. 다만 번역투라 '그런데도'가 더 읽기 좋습니다." },
];

/**
 * 규칙마다 g 없는 짝을 미리 만들어 둡니다.
 *
 * ⚠️ 처음에 고칠 말을 만들 때 r.find를 그대로 다시 썼습니다. g 플래그가 붙은
 * 정규식은 **어디까지 찾았는지를 스스로 기억**합니다(lastIndex). 그걸 중간에
 * 다시 쓰면 자리가 어긋나서 뒤쪽 오류를 통째로 놓칩니다.
 * 찾을 때와 바꿀 때는 서로 다른 정규식을 씁니다.
 */
for (const r of RULES) r.one = new RegExp(r.find.source, r.find.flags.replace("g", ""));

/**
 * 글을 검사합니다.
 * @returns {{ok:boolean, issues:Array, sureCount:number, maybeCount:number, fixed:string, changed:boolean}}
 */
function check(text) {
  const src = String(text || "");
  if (!src.trim()) return { ok: false, why: "검사할 글이 없습니다." };

  const issues = [];
  for (const r of RULES) {
    r.find.lastIndex = 0;
    let m;
    while ((m = r.find.exec(src))) {
      const suggest = m[0].replace(r.one, r.to);
      // 바뀐 게 없으면 오류가 아닙니다 (받침이 ㄹ이 아닌 '-께' 등)
      if (suggest !== m[0]) {
        issues.push({
          id: r.id,
          at: m.index,
          found: m[0],
          suggest,
          why: r.why,
          sure: !!r.sure,
          around: context(src, m.index, m[0].length),
        });
      }
      // ⚠️ 길이 0짜리 매치가 나오면 여기서 영원히 돕니다. 강제로 밀어줍니다.
      if (m.index === r.find.lastIndex) r.find.lastIndex++;
    }
  }

  issues.sort((a, b) => a.at - b.at);

  // 확실한 것만 모아서 한 번에 고친 글도 같이 돌려줍니다.
  let fixed = src;
  for (const r of RULES) {
    if (!r.sure) continue;
    r.find.lastIndex = 0;
    fixed = fixed.replace(r.find, r.to);
  }

  return {
    ok: true,
    issues,
    sureCount: issues.filter((i) => i.sure).length,
    maybeCount: issues.filter((i) => !i.sure).length,
    fixed,
    changed: fixed !== src,
    ruleCount: RULES.length,
  };
}

/** 틀린 자리 앞뒤를 조금 잘라서 보여줍니다. 어디서 났는지 알아야 고칩니다. */
function context(src, at, len, pad = 14) {
  const from = Math.max(0, at - pad);
  const to = Math.min(src.length, at + len + pad);
  return {
    before: (from > 0 ? "…" : "") + src.slice(from, at),
    hit: src.slice(at, at + len),
    after: src.slice(at + len, to) + (to < src.length ? "…" : ""),
  };
}

module.exports = { check, RULES, finalOf };
