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

/** 본문 속 이미지 개수 — pageExtractor가 이미 뽑아주지만 한 번 더 세어 맞춰봅니다. */
function countImages(html) {
  // 네이버는 본문 사진을 se-image 계열 클래스로 감쌉니다.
  const se = (html.match(/class="[^"]*se-image[^"]*"/gi) || []).length;
  if (se) return se;
  // 옛 에디터
  const old = (html.match(/<img[^>]+(?:blogfiles|postfiles|pstatic)[^>]*>/gi) || []).length;
  return old;
}

/** 페이지에서 본문 HTML만 잘라냅니다. 소제목을 세려면 태그가 남아 있어야 합니다. */
function extractBodyHtml(html) {
  // 새 에디터
  let m = html.match(/<div[^>]+class="[^"]*se-main-container[^"]*"[\s\S]*?<\/div>\s*(?=<div[^>]+class="[^"]*(?:post_?tag|area_sympathy|_postFooter))/i);
  if (m) return m[0];
  m = html.match(/<div[^>]+class="[^"]*se-main-container[^"]*"[\s\S]{200,200000}?<\/div>/i);
  if (m) return m[0];
  // 옛 에디터
  m = html.match(/<div[^>]+id="post(?:ViewArea|-view)[^"]*"[\s\S]{200,200000}?<\/div>/i);
  if (m) return m[0];
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

module.exports = { fetchPost, extractTags, extractBodyHtml, countImages, toMobileNaver };
