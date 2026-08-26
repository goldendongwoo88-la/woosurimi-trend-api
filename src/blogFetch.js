// 블로그 주소 하나로 글을 통째로 가져오기.
//
// ⚠️ 왜 만들었나
//
// 진단하려면 제목·본문·태그·이미지 수를 알아야 하는데, 그걸 전부 손으로 옮겨 적게
// 했습니다. 본문을 복사하면 사진은 안 따라오니 이미지 수는 세서 넣어야 하고,
// 태그도 하나씩 옮겨야 합니다. 그럴 바에는 그냥 안 씁니다.
//
// 이미 올려둔 글이면 주소만 있으면 전부 읽어올 수 있습니다. 그렇게 합니다.

const { extractPageData } = require("./pageExtractor");

/**
 * 네이버 블로그에서 태그를 뽑습니다.
 *
 * ⚠️ 태그가 어디 들어 있는지가 페이지 종류마다 다릅니다. 모바일 페이지, PC 페이지,
 * 새 에디터, 옛 에디터가 다 다르게 담아둡니다. 그래서 여러 방법을 순서대로 시도하고
 * 처음 걸리는 걸 씁니다. 하나도 안 걸리면 없다고 하지 않고 **모른다고** 합니다.
 * (태그가 진짜 없는 것과, 우리가 못 찾은 것은 다릅니다)
 */
function extractTags(html) {
  const found = new Set();

  // 1) 새 에디터 — JSON 안에 담겨 옵니다
  for (const m of html.matchAll(/"tagName"\s*:\s*"([^"]{1,40})"/g)) {
    found.add(m[1]);
  }
  if (found.size) return { tags: [...found], how: "json", certain: true };

  // 2) 태그 목록 영역
  const tagBlock = html.match(/<div[^>]+class="[^"]*post_?tag[^"]*"[\s\S]{0,4000}?<\/div>/i);
  if (tagBlock) {
    for (const m of tagBlock[0].matchAll(/>#?\s*([^<>#\s][^<>#]{0,38})</g)) {
      const t = m[1].trim();
      if (t && t.length <= 40 && !/^(태그|더보기|접기)$/.test(t)) found.add(t);
    }
    if (found.size) return { tags: [...found], how: "tagBlock", certain: true };
  }

  // 3) 태그 검색 링크
  for (const m of html.matchAll(/href="[^"]*(?:tagName|tagNm|TagSearch)[^"]*"[^>]*>\s*#?\s*([^<]{1,40})</gi)) {
    const t = m[1].trim();
    if (t) found.add(t);
  }
  if (found.size) return { tags: [...found], how: "link", certain: true };

  // 4) meta keywords — 블로그 이름 같은 게 섞여 오기도 해서 마지막에 씁니다
  const kw = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']*)["']/i);
  if (kw && kw[1].trim()) {
    const list = kw[1].split(",").map((s) => s.replace(/^#/, "").trim()).filter(Boolean);
    if (list.length) return { tags: list, how: "meta", certain: false };
  }

  return { tags: [], how: "none", certain: false };
}

/**
 * 본문 속 사진 개수.
 *
 * ⚠️ 원래 `se-image`가 들어간 클래스를 전부 셌는데, 사진 한 장에
 * `se-component se-image`(바깥)와 `se-module-image`(안쪽)가 같이 붙습니다.
 * 그래서 **개수가 정확히 두 배로 나오고 있었습니다.**
 * 실측: 사진 30장인 글이 64장으로 보고됐습니다.
 *
 * 이건 그냥 숫자가 틀린 문제가 아닙니다. 진단에서 "사진이 충분합니다"라고
 * 말해주던 근거가 통째로 틀렸다는 뜻이고, 경쟁 글 비교도 같이 어긋납니다.
 *
 * `se-image-resource`는 실제 <img> 요소에만 붙습니다. 여러 장 묶음(imageStrip)
 * 안의 사진에도 붙어서 한 번에 다 세어집니다. 스티커는 se-sticker-image라 안 섞입니다.
 */
function countImages(html) {
  const resource = (html.match(/se-image-resource/gi) || []).length;
  if (resource) return resource;
  // 옛 글이나 구조가 다른 경우 — se-component 단위로 셉니다.
  const comp = (html.match(/class="se-component se-image(?:Strip)?[^"]*"/gi) || []).length;
  if (comp) return comp;
  // 옛 에디터
  return (html.match(/<img[^>]+(?:blogfiles|postfiles|pstatic)[^>]*>/gi) || []).length;
}

/**
 * 스마트에디터가 쓴 구성요소를 세어 글의 짜임새를 봅니다.
 * 본문 HTML을 제대로 잘라낼 수 있게 되면서 비로소 가능해진 것들입니다.
 */
function analyzeStructure(bodyHtml) {
  const h = bodyHtml || "";
  if (!h) return null;
  const count = (re) => (h.match(re) || []).length;
  return {
    // 인용구를 소제목처럼 쓰는 글이 많습니다. 네이버 블로그의 사실상 소제목입니다.
    subheads: count(/class="se-component se-quotation/gi),
    images: countImages(h),
    imageStrips: count(/class="se-component se-imageStrip/gi),
    stickers: count(/se-sticker-image/gi),
    // 맛집·장소 글에서 지도가 있고 없고는 차이가 큽니다.
    hasMap: /se-component se-placesMap|se-map/i.test(h),
    linkCards: count(/class="se-component se-oglink/gi),
    dividers: count(/class="se-component se-horizontalLine/gi),
    videos: count(/class="se-component se-video/gi),
    tables: count(/class="se-component se-table/gi),
    codeBlocks: count(/class="se-component se-code/gi),
  };
}

/**
 * 여는 div의 위치를 받아, **짝이 맞는 닫는 div까지** 잘라냅니다.
 *
 * ⚠️ 이 함수를 왜 만들었는지 남깁니다.
 * 원래는 정규식 하나로 `<div class="se-main-container">...</div>` 를 잡았는데,
 * 정규식에는 괄호 짝을 세는 기능이 없습니다. 게을리 매칭(non-greedy)하면
 * **맨 처음 나오는 </div>** 에서 끊기고, 욕심내면(greedy) 페이지 끝까지 먹습니다.
 *
 * 실제로 본문 글자는 1,813자인데 잘라낸 HTML은 1,144자밖에 안 됐습니다.
 * 그래서 소제목이 하나도 안 세어졌고(항상 null), 경쟁 글 비교에서
 * 소제목 항목이 통째로 죽어 있었습니다.
 *
 * div를 세면서 훑으면 정확합니다. HTML 전체를 파싱하는 라이브러리를 새로 깔 필요도 없습니다.
 */
function sliceBalancedDiv(html, startIndex) {
  const OPEN = /<div\b/gi;
  const CLOSE = /<\/div\s*>/gi;
  let depth = 0;
  let i = startIndex;
  const end = html.length;

  while (i < end) {
    OPEN.lastIndex = i;
    CLOSE.lastIndex = i;
    const o = OPEN.exec(html);
    const c = CLOSE.exec(html);

    if (!c) break;                       // 닫는 태그가 더 없으면 포기
    if (o && o.index < c.index) {
      depth++;
      i = o.index + 4;
    } else {
      depth--;
      i = c.index + c[0].length;
      if (depth === 0) return html.slice(startIndex, i);
    }
    // 아주 긴 페이지에서 무한정 돌지 않도록 안전장치
    if (i - startIndex > 400000) break;
  }
  // 짝을 못 찾으면 넉넉히 잘라서라도 돌려줍니다. 없는 것보단 낫습니다.
  return html.slice(startIndex, Math.min(end, startIndex + 200000));
}

/** 페이지에서 본문 HTML만 잘라냅니다. 소제목을 세려면 태그가 남아 있어야 합니다. */
function extractBodyHtml(html) {
  // 새 에디터 — se-main-container
  let m = html.match(/<div[^>]+class="[^"]*se-main-container[^"]*"/i);
  if (m) return sliceBalancedDiv(html, m.index);
  // 옛 에디터
  m = html.match(/<div[^>]+id="post(?:ViewArea|-view)[^"]*"/i);
  if (m) return sliceBalancedDiv(html, m.index);
  return null;
}

/**
 * 주소 하나로 진단에 필요한 걸 전부 가져옵니다.
 *
 * @param {string} url
 * @returns {Promise<{title, bodyText, bodyHtml, images, tags, tagsCertain, source, warnings}>}
 */
async function fetchPost(url) {
  const u = String(url || "").trim();
  if (!u) throw new Error("주소를 넣어주세요.");
  if (!/^https?:\/\//i.test(u)) throw new Error("http로 시작하는 주소를 넣어주세요.");

  const data = await extractPageData(u);

  // 태그와 소제목을 보려면 원본 HTML이 필요합니다. pageExtractor는 글만 돌려주므로
  // 같은 주소를 한 번 더 받아옵니다. (네이버 블로그면 모바일 주소로 바뀐 것을 씁니다)
  let html = "";
  const warnings = [];
  try {
    const target = toMobileNaver(u);
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      redirect: "follow",
    });
    if (res.ok) html = await res.text();
  } catch {
    warnings.push("태그와 소제목을 읽으려고 페이지를 한 번 더 받아오려 했는데 실패했습니다.");
  }

  const tagInfo = html ? extractTags(html) : { tags: [], how: "none", certain: false };
  const bodyHtml = html ? extractBodyHtml(html) : null;
  const imgCount = html ? countImages(html) : 0;

  const images = Math.max(data.images ? data.images.length : 0, imgCount);

  if (!tagInfo.tags.length) {
    warnings.push("태그를 찾지 못했습니다. 글에 태그가 없거나, 이 페이지에서는 태그를 읽을 수 없는 형태입니다. 직접 넣어주시면 함께 봐드릴게요.");
  }
  if (!bodyHtml) {
    warnings.push("소제목을 세려면 서식이 필요한데 그 부분을 못 읽었습니다. 소제목 개수는 '알 수 없음'으로 나옵니다.");
  }
  if (!images) {
    warnings.push("이미지를 세지 못했습니다. 사진이 정말 없거나, 이 페이지 형태에서는 셀 수 없는 경우입니다.");
  }

  return {
    url: u,
    title: data.title || "",
    bodyText: data.bodyText || "",
    // 진단에는 서식이 있는 쪽을 우선 씁니다. 소제목을 세야 하니까요.
    bodyHtml: bodyHtml || null,
    images,
    tags: tagInfo.tags,
    tagsCertain: tagInfo.certain,
    tagsHow: tagInfo.how,
    warnings,
  };
}

/** blog.naver.com 주소를 본문이 그대로 들어 있는 모바일 주소로 바꿉니다. */
function toMobileNaver(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)blog\.naver\.com$/.test(u.hostname)) return url;
    if (u.hostname.startsWith("m.")) return url;

    const p = u.pathname.match(/^\/([^/]+)\/(\d+)/);
    if (p) return `https://m.blog.naver.com/${p[1]}/${p[2]}`;

    if (/PostView\.naver/i.test(u.pathname)) {
      const blogId = u.searchParams.get("blogId");
      const logNo = u.searchParams.get("logNo");
      if (blogId && logNo) return `https://m.blog.naver.com/${blogId}/${logNo}`;
    }
    return url.replace("://blog.naver.com", "://m.blog.naver.com");
  } catch {
    return url;
  }
}

module.exports = { fetchPost, extractTags, extractBodyHtml, countImages, analyzeStructure, toMobileNaver };
