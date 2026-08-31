const $ = (s) => document.querySelector(s);
const DEFAULT_SERVER = "https://woosurimi-trend-api.onrender.com";

function say(html, kind) {
  $("#msg").className = `msg ${kind}`;
  $("#msg").innerHTML = html;
}

(async () => {
  const s = await chrome.storage.sync.get(["code", "blogId", "server", "wsToken", "useLocal"]);
  $("#code").value = s.code || "";
  $("#blogId").value = s.blogId || "";
  $("#server").value = s.server || "";
  $("#token").value = s.wsToken || "";
  $("#useLocal").checked = !!s.useLocal;
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
    useLocal: $("#useLocal").checked,
  });

  const mode = $("#useLocal").checked ? "🖥️ 개발 모드 (로컬)" : "☁️ 배포 서버";
  say(`저장했습니다. (${mode})`, "good");
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

// 토큰 자동으로 받기
//
// ⚠️ 확장을 지우고 다시 넣으면 크롬이 다른 확장으로 취급해서 저장해둔 설정이
// 통째로 사라집니다. 버전을 올릴 때마다 사장님이 토큰을 다시 넣어야 했습니다.
// 확장은 우리 도메인 권한이 있어서, 배경에서 부르면 로그인 쿠키가 함께 실립니다.
// 사이트에 로그인만 돼 있으면 손으로 옮길 필요가 없습니다.
$("#synctoken").onclick = () => {
  say("우수리미에서 토큰을 받아오는 중입니다…", "wait");
  chrome.runtime.sendMessage({ type: "syncToken" }, (res) => {
    if (res && res.ok) {
      $("#token").value = res.data.token;
      say("토큰을 받아 저장했습니다. 이제 글쓰기 창에서 AI 기능을 쓰실 수 있습니다.", "good");
    } else {
      say(
        `받지 못했습니다.<br><small>${(res && res.message) || "알 수 없는 문제"}</small>` +
          `<br><small><a href="https://woosurimi-trend-api.onrender.com/join.html" target="_blank">우수리미에서 먼저 로그인하기</a></small>`,
        "bad"
      );
    }
  });
};
