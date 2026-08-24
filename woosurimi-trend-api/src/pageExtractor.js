// 임의의 웹페이지(블로그 글, 쇼핑 상품 페이지 등)에서 제목/설명/본문 텍스트를 최대한
// 뽑아내는 범용 유틸리티입니다. 네이버 API가 아니라 그 페이지 자체에 실제로 걸려있는
// og:title/og:description 메타태그와 <p> 태그 본문을 읽어오는 방식이라, 사이트마다
// 결과 품질이 다를 수 있고 일부 사이트는 접근을 막을 수도 있습니다.

function decodeHtmlEntities(str) {
  return (str || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function extractMainText(html) {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const paragraphs = [...stripped.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 15);
  return paragraphs.join(" ").slice(0, 3000);
}

// 아이콘/로고/추적픽셀처럼 "본문 사진"이 아닐 가능성이 높은 이미지를 대충 걸러내는 필터입니다.
// 완벽하진 않아서 가끔 진짜 사진이 걸러지거나 아이콘이 섞여 들어올 수 있습니다.
function looksLikeRealPhoto(src, widthAttr, heightAttr) {
  const lower = src.toLowerCase();
  if (/\.(svg)(\?|$)/.test(lower)) return false;
  if (/(icon|logo|sprite|pixel|blank|spacer|badge|button|1x1)/.test(lower)) return false;
  const w = Number(widthAttr);
  const h = Number(heightAttr);
  if (w && w > 0 && w < 120) return false;
  if (h && h > 0 && h < 120) return false;
  return true;
}

function resolveUrl(src, baseUrl) {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

// 페이지 본문에 실제로 걸려있는 이미지들을 뽑아옵니다(og:image를 대표 이미지로 맨 앞에 둠).
// "숏폼 자동 제작" 기능에서 장면(씬)별 사진으로 씁니다 — AI가 새로 그린 이미지가 아니라
// 원문에 실제로 쓰인 사진이라는 점이 중요합니다(저작권은 원문 소유자에게 있으니, 본인
// 블로그/상품 페이지가 아니면 사용 전에 사용 권한을 꼭 확인해 주세요).
function extractImages(html, baseUrl, ogImage, limit = 12) {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const found = [];
  const seen = new Set();

  const pushImage = (rawSrc, widthAttr, heightAttr) => {
    if (!rawSrc) return;
    const resolved = resolveUrl(rawSrc, baseUrl);
    if (!resolved || seen.has(resolved)) return;
    if (!looksLikeRealPhoto(resolved, widthAttr, heightAttr)) return;
    seen.add(resolved);
    found.push(resolved);
  };

  if (ogImage) {
    const resolved = resolveUrl(ogImage, baseUrl);
    if (resolved) {
      seen.add(resolved);
      found.push(resolved);
    }
  }

  for (const m of stripped.matchAll(/<img\b([^>]*)>/gi)) {
    const tag = m[1];
    const srcMatch =
      tag.match(/\bsrc=["']([^"']+)["']/i) ||
      tag.match(/\bdata-src=["']([^"']+)["']/i) ||
      tag.match(/\bdata-lazy-src=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const widthAttr = (tag.match(/\bwidth=["']?(\d+)/i) || [])[1];
    const heightAttr = (tag.match(/\bheight=["']?(\d+)/i) || [])[1];
    pushImage(srcMatch[1], widthAttr, heightAttr);
    if (found.length >= limit) break;
  }

  return found.slice(0, limit);
}

async function fetchPageHtml(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("올바른 URL 형식이 아닙니다.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("http:// 또는 https:// 로 시작하는 URL만 지원합니다.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; woosurimi-trend-api/1.0)" },
    });
  } catch (err) {
    throw new Error(`페이지에 접속할 수 없습니다 (${err.message}). 링크가 맞는지, 로그인이 필요한 페이지는 아닌지 확인해 주세요.`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`페이지를 불러오지 못했습니다 (상태 코드 ${res.status}).`);
  }
  return await res.text();
}

async function extractPageData(url) {
  const html = await fetchPageHtml(url);
  const titleTag = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
  const ogImage = extractMeta(html, "og:image");
  const title = extractMeta(html, "og:title") || decodeHtmlEntities(titleTag.trim());
  const description = extractMeta(html, "og:description") || "";
  const bodyText = extractMainText(html);
  const images = extractImages(html, url, ogImage);
  return { url, title: (title || "").trim(), description: description.trim(), bodyText, images };
}

module.exports = { extractPageData };
