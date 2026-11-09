(() => {
  // demo-theme/whale-girl.js
  var look = { body: "#5b8def", belly: "#eef5ff", hat: "maid", rig: false };
  var WHALE_LOOKS = [look, ...["#8976c4", "#bf745b", "#579977"].map((body) => ({ body, rig: false }))];

  // shared/world-format.js
  var WORLD_BYTES = 4 * 1024 * 1024;
  var encoder = new TextEncoder();

  // web/roomkit/agent-adapter.js
  function createPreviewAgent() {
    let status = { available: false, name: "手动模式" };
    let token = "";
    return {
      describeCapabilities: () => status,
      async refresh() {
        try {
          const response = await fetch("/__roomkit_agent", { cache: "no-store", signal: AbortSignal.timeout(2e3) });
          if (!response.ok) throw new Error("no gateway");
          const data = await response.json();
          token = data.ticket || "";
          status = { available: Boolean(data.available && token), name: data.available ? data.model : "手动模式" };
        } catch {
          token = "";
          status = { available: false, name: "手动模式" };
        }
      },
      async generate(request, signal) {
        const response = await fetch("/__roomkit_agent", {
          method: "POST",
          headers: { "content-type": "application/json", "x-roomkit-agent": token },
          signal,
          body: JSON.stringify(request)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "模型调用失败");
        return data.text;
      }
    };
  }

  // src/web.js
  var el = document.getElementById("room");
  var _a;
  try {
    const qs = new URLSearchParams(location.search);
    const neutral = el.hasAttribute("data-roomkit-example");
    const site = el.hasAttribute("data-roomkit-site");
    const storageKey = site ? "roomkit-site" : neutral ? "roomkit-example" : location.pathname.startsWith("/plugins/dsh-room/") ? "dsh-room" : "roomkit";
    if (!window.RoomKit || !((_a = window.RoomKitPacks) == null ? void 0 : _a.length)) throw new Error("房间资源不完整，请运行 npm run build 后重新打开。");
    if (qs.get("dock") === "1") {
      document.body.classList.add("dock");
      document.documentElement.style.setProperty("--dock-w", (parseInt(qs.get("w"), 10) || 620) + "px");
    }
    const desk = qs.get("desk") === "1", host = window.roomkitDesk || null;
    if (desk) document.documentElement.classList.add("desk");
    const ext = {};
    if (location.protocol === "http:" && ["127.0.0.1", "localhost"].includes(location.hostname)) ext.worldAgent = createPreviewAgent();
    if (desk) {
      ext.desk = host;
      ext.openFull = host && host.openFull ? () => host.openFull() : () => {
        location.search = "";
      };
    }
    el.replaceChildren();
    const app = window.RoomKit.mount(el, {
      desk,
      ext,
      neutral,
      site,
      townUrl: site ? location.origin : void 0,
      mode: qs.get("mode") === "edit" ? "edit" : "play",
      ui: qs.get("ui") === "compact" || qs.get("dock") === "1" ? "compact" : qs.get("ui") === "full" ? "full" : "auto",
      transparent: qs.get("transparent") === "1",
      scene: qs.get("scene") ? window.RoomKitPacks[0].scenes.find((s) => s.id === qs.get("scene")) : void 0,
      autosave: qs.get("fresh") !== "1",
      storageKey,
      townStorageKey: neutral ? storageKey + ".town" : void 0,
      bridge: "same-origin",
      rigMax: qs.get("rig") === "0" ? 0 : void 0
    });
    window.room = app;
  } catch (error) {
    el.replaceChildren();
    const box = document.createElement("div");
    box.className = "rk-boot";
    box.style.cssText += ";flex-direction:column;padding:24px;text-align:center";
    const title = document.createElement("h2");
    title.textContent = "房间未能打开";
    const detail = document.createElement("p");
    detail.textContent = error.message;
    const retry = document.createElement("button");
    retry.textContent = "重新加载";
    retry.onclick = () => location.reload();
    box.append(title, detail, retry);
    el.appendChild(box);
    console.error("[dsh-room] 启动失败", error);
  }
})();
