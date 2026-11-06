(() => {
  // src/web.js
  var el = document.getElementById("room");
  var _a;
  try {
    const qs = new URLSearchParams(location.search);
    if (!window.RoomKit || !((_a = window.RoomKitPacks) == null ? void 0 : _a.length)) throw new Error("房间资源不完整，请运行 npm run build 后重新打开。");
    if (qs.get("dock") === "1") {
      document.body.classList.add("dock");
      document.documentElement.style.setProperty("--dock-w", (parseInt(qs.get("w"), 10) || 620) + "px");
    }
    const desk = qs.get("desk") === "1", host = window.roomkitDesk || null;
    if (desk) document.documentElement.classList.add("desk");
    const ext = {};
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
      mode: qs.get("mode") === "edit" ? "edit" : "play",
      ui: qs.get("ui") === "compact" || qs.get("dock") === "1" ? "compact" : qs.get("ui") === "full" ? "full" : "auto",
      transparent: qs.get("transparent") === "1",
      scene: qs.get("scene") ? window.RoomKitPacks[0].scenes.find((s) => s.id === qs.get("scene")) : void 0,
      autosave: qs.get("fresh") !== "1",
      storageKey: location.pathname.startsWith("/plugins/dsh-room/") ? "dsh-room" : "roomkit",
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
