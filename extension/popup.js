// 확장 아이콘을 눌렀을 때 뜨는 창.
//
// ⚠️ 팝업은 다른 데를 클릭하면 그냥 사라집니다. 원고 쓰는 데 40초 걸리는데
// 그동안 실수로 딴 데를 누르면 작업이 통째로 날아가요. 그래서 결과가 나오는 즉시
// storage에 저장해두고, 다시 열면 그대로 살아 있게 합니다.

const $ = (s) => document.querySelector(s);
let current = null;

function say(html, kind = "info") {
  const m = $("#msg");
  m.className = `msg ${kind}`;
  m.innerHTML = html;
}

function ask(type, payload) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, resolve));
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 탭 ──────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach((p) =>
    p.classList.toggle("hide", p.dataset.pane !== b.dataset.mode));
}));

$("#opt").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

// ── 원고 만들기 ─────────────────────────────────────────────
async function run(btn, waitMsg, type, payload) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "만드는 중…";
  say(waitMsg, "wait");

  const res = await ask(type, payload);

  btn.disabled = false;
  btn.textContent = label;
  if (!res || !res.ok) {
    say(`만들지 못했습니다.<br><small>${esc((res && res.message) || "서버에 닿지 못했습니다")}</small>`, "bad");
    return null;
  }
  return res.data;
}

$("#write").onclick = async () => {
  const topic = $("#topic").value.trim();
  if (!topic) return $("#topic").focus();
  const d = await run(
    $("#write"),
    "AI가 원고를 쓰고 있습니다. 40초쯤 걸려요.<br><small>이 창을 닫아도 계속 진행됩니다. 다시 열면 결과가 있습니다.</small>",
    "write",
    { topic, keyword: $("#kw").value.trim(), tone: $("#tone").value }
  );
  if (d) show(d);
};

$("#prodgo").onclick = async () => {
  const url = $("#purl").value.trim();
  if (!url) return $("#purl").focus();
  const d = await run(
    $("#prodgo"),
    "상품 정보를 읽고 리뷰를 쓰는 중입니다.",
    "product",
    { url, note: $("#pnote").value.trim() }
  );
  if (d) show(d);
};

// ── 키워드 ──────────────────────────────────────────────────
$("#kwgo").onclick = async () => {
  const seed = $("#seed").value.trim();
  if (!seed) return $("#seed").focus();
  const btn = $("#kwgo");
  btn.disabled = true; btn.textContent = "찾는 중…";
  $("#kwout").innerHTML = "";
  const res = await ask("keywords", { seed });
  btn.disabled = false; btn.textContent = "🔍 연관 키워드 찾기";

  if (!res || !res.ok) {
    say(esc((res && res.message) || "찾지 못했습니다."), "bad");
    return;
  }
  const list = res.data.keywords || [];
  if (!list.length) { say("연관 키워드를 찾지 못했습니다.", "bad"); return; }

  say("", "info");
  $("#kwout").innerHTML = `
    <div class="prev" style="max-height:230px">
      ${list.map((k) => `
        <div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #eceef0">
          <span style="cursor:pointer;text-decoration:underline;text-decoration-color:#d5d8dc"
                data-kw="${esc(k.keyword)}">${esc(k.keyword)}</span>
          <span style="color:#9ca3af;white-space:nowrap;font-size:11px">${esc(k.hint || "")}</span>
        </div>`).join("")}
    </div>
    <div style="font-size:10.5px;color:#9ca3af;margin-top:7px;line-height:1.6">
      ${res.data.note ? esc(res.data.note) : "키워드를 누르면 그걸로 글을 씁니다."}
    </div>`;

  $("#kwout").querySelectorAll("[data-kw]").forEach((el) => (el.onclick = () => {
    $("#topic").value = el.dataset.kw;
    $("#kw").value = el.dataset.kw;
    document.querySelector('.tab[data-mode="topic"]').click();
  }));
};

// ── 결과 보여주기 ───────────────────────────────────────────
function show(d) {
  current = d;
  chrome.storage.local.set({ lastDraft: d, lastAt: Date.now() });

  $("#result").classList.remove("hide");
  $("#rtitle").textContent = d.title || "(제목 없음)";

  const plain = (d.blocks || []).map((b) => b.text || "").join("");
  const heads = (d.blocks || []).filter((b) => b.type === "h2" || b.type === "h3").length;
  $("#rmeta").textContent =
    `${plain.replace(/\s/g, "").length.toLocaleString()}자 · 소제목 ${heads}개` +
    (d.audit ? ` · 진단 ${d.audit.score}점` : "");

  $("#rprev").innerHTML = (d.blocks || []).map((b) =>
    (b.type === "h2" || b.type === "h3")
      ? `<h4>${esc(b.text)}</h4>`
      : b.type === "image" ? `<p style="color:#9ca3af">[ 사진 자리 — ${esc(b.text || "")} ]</p>`
      : `<p>${esc(b.text)}</p>`).join("");

  $("#rtags").innerHTML = (d.tags || []).map((t) => `<span>#${esc(t)}</span>`).join("");
  say("원고가 나왔습니다. <b>네이버에 넣기</b>를 누르면 글쓰기 창이 열립니다.", "good");
}

// ── 네이버에 넣기 ───────────────────────────────────────────
//
// ⚠️ 글쓰기 창이 이미 열려 있으면 거기 넣고, 없으면 새로 엽니다.
// 새로 연 경우 스마트에디터가 뜰 때까지 기다려야 해서 조금 시간이 걸립니다.
$("#send").onclick = async () => {
  if (!current) return;
  const btn = $("#send");
  btn.disabled = true; btn.textContent = "넣는 중…";

  const tabs = await chrome.tabs.query({ url: "https://blog.naver.com/*" });
  let tab = tabs.find((t) => /PostWriteForm|postwrite|Redirect=Write/i.test(t.url || ""));

  if (!tab) {
    const { blogId } = await chrome.storage.sync.get("blogId");
    if (!blogId) {
      btn.disabled = false; btn.textContent = "네이버에 넣기";
      say(
        "블로그 아이디를 아직 안 넣으셨습니다.<br>" +
        "<small><a href='#' id='goopt'>설정</a>에서 넣어주시면 글쓰기 창을 바로 열어드립니다.</small>",
        "bad"
      );
      $("#goopt").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
      return;
    }
    tab = await chrome.tabs.create({
      url: `https://blog.naver.com/${encodeURIComponent(blogId)}?Redirect=Write`,
    });
    say("글쓰기 창을 여는 중입니다. 화면이 다 뜨면 오른쪽 아래 창에서 <b>에디터에 넣기</b>를 눌러주세요.", "wait");
    // 에디터가 다 뜨기 전에 넣으면 실패합니다. 넉넉히 기다립니다.
    await new Promise((r) => setTimeout(r, 6000));
  }

  chrome.tabs.sendMessage(tab.id, { type: "insertDraft", payload: current }, (res) => {
    btn.disabled = false; btn.textContent = "네이버에 넣기";
    if (chrome.runtime.lastError || !res || !res.ok) {
      say(
        "글쓰기 창에 닿지 못했습니다.<br>" +
        "<small>창을 한 번 새로고침하고 다시 눌러주세요. 그래도 안 되면 <b>복사</b>해서 붙여넣으시면 됩니다.</small>",
        "bad"
      );
      return;
    }
    say("넣었습니다. 사진 넣고 확인하신 뒤 <b>직접 발행</b>해 주세요.", "good");
    chrome.tabs.update(tab.id, { active: true });
  });
};

$("#copy").onclick = async () => {
  if (!current) return;
  const html = (current.blocks || []).map((b) =>
    (b.type === "h2" || b.type === "h3") ? `<h3>${esc(b.text)}</h3>`
    : b.type === "hr" ? "<hr>"
    : `<p>${esc(b.text || "")}</p>`).join("\n");
  const plain = (current.blocks || []).map((b) => b.text || "").join("\n\n");
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" }),
    })]);
    say("복사했습니다. 네이버 본문에서 <b>Ctrl+V</b> 하세요.", "good");
  } catch {
    await navigator.clipboard.writeText(plain);
    say("복사했습니다(글자만).", "good");
  }
};

// ── 열 때 지난 결과 되살리기 ────────────────────────────────
(async () => {
  const { lastDraft, lastAt } = await chrome.storage.local.get(["lastDraft", "lastAt"]);
  // 하루 지난 건 안 보여줍니다. 옛날 원고가 남아 있으면 헷갈립니다.
  if (lastDraft && lastAt && Date.now() - lastAt < 86400000) {
    show(lastDraft);
    say("직전에 만든 원고입니다.", "info");
  }
  const { code } = await chrome.storage.sync.get("code");
  if (!code) {
    say("아직 접속 코드를 안 넣으셨습니다. <a href='#' id='goopt2'>설정</a>에서 넣어주세요.", "bad");
    const a = $("#goopt2");
    if (a) a.onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  }
})();
