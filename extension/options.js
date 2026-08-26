const $ = (s) => document.querySelector(s);
const DEFAULT_SERVER = "https://woosurimi-trend-api.onrender.com";

function say(html, kind) {
  $("#msg").className = `msg ${kind}`;
  $("#msg").innerHTML = html;
}

(async () => {
  const s = await chrome.storage.sync.get(["code", "blogId", "server", "wsToken"]);
  $("#code").value = s.code || "";
  $("#blogId").value = s.blogId || "";
  $("#server").value = s.server || "";
  $("#token").value = s.wsToken || "";
  $("#server").placeholder = DEFAULT_SERVER;
})();

$("#save").onclick = async () => {
  // ⚠️ 블로그 아이디에 주소를 통째로 붙여넣는 분이 많습니다.
  // 틀렸다고 되돌려보내는 것보다 알아서 잘라주는 게 맞습니다.
  let id = $("#blogId").value.trim();
  const m = id.match(/blog\.naver\.com\/([^/?#\s]+)/i);
  if (m) id = m[1];
  id = id.replace(/^@/, "");
  $("#blogId").value = id;

  await chrome.storage.sync.set({
    code: $("#code").value.trim(),
    blogId: id,
    server: $("#server").value.trim().replace(/\/+$/, ""),
    wsToken: $("#token").value.trim(),
  });
  say("저장했습니다.", "good");
};

$("#test").onclick = async () => {
  // 저장부터 하고 확인합니다. 안 그러면 방금 고쳐 넣은 값이 아니라 옛 값으로 확인하게 됩니다.
  $("#save").click();
  say("서버를 깨우는 중입니다. 잠들어 있었다면 40초쯤 걸립니다…", "wait");
  chrome.runtime.sendMessage({ type: "ping" }, (res) => {
    if (res && res.ok) {
      say("연결됐습니다. 이제 네이버 블로그 글쓰기 창을 열어보세요.", "good");
    } else {
      say(`연결하지 못했습니다.<br><small>${(res && res.message) || "알 수 없는 문제"}</small>`, "bad");
    }
  });
};
