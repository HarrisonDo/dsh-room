(() => {
  // shared/local-home-format.js
  var HOME_LIMIT = 64 * 1024 * 1024;
  var HOME_VERSION = 1;
  function emptyHome() {
    return { version: HOME_VERSION, keys: {}, packs: [], drafts: [] };
  }

  // src/home-view.js
  function homeView({ claim, view, localStore, send, onError }) {
    const { epoch } = claim;
    const keys = { ...claim.snapshot.keys };
    const packs = new Map(claim.snapshot.packs.map((item) => [item.id, item]));
    const drafts = new Map(claim.snapshot.drafts.map((item) => [item.id, item]));
    let sequence = claim.sequence, dirty = 0, saved = 0, pending, timer, paused = false, app;
    const identity = { view, epoch };
    const snapshot = () => ({ ...emptyHome(), keys, packs: [...packs.values()], drafts: [...drafts.values()] });
    const next = () => ({ ...identity, sequence: ++sequence, snapshot: snapshot() });
    function flush() {
      if (paused || dirty === saved) return pending || Promise.resolve();
      if (pending) return pending;
      const captured = dirty;
      pending = send("save", next()).then(() => {
        saved = captured;
      }).finally(() => {
        pending = null;
      });
      return pending;
    }
    function changed() {
      dirty++;
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(onError), 350);
    }
    function mutable() {
      if (paused) throw new Error("房间正在切换窗口");
    }
    function records(items) {
      return {
        async list() {
          return structuredClone([...items.values()]);
        },
        async get(id) {
          return structuredClone(items.get(id));
        },
        async put(item) {
          mutable();
          const previous = items.get(item.id);
          items.set(item.id, structuredClone(item));
          if (new TextEncoder().encode(JSON.stringify(snapshot())).byteLength > HOME_LIMIT) {
            if (previous) items.set(item.id, previous);
            else items.delete(item.id);
            throw new Error("房间和素材超过本机接续的 64 MB 上限");
          }
          changed();
        },
        async remove(id) {
          mutable();
          items.delete(id);
          changed();
        }
      };
    }
    const storage = localStore("dsh-room", {
      get length() {
        return Object.keys(keys).length;
      },
      key: (index) => Object.keys(keys)[index] || null,
      getItem: (key) => {
        var _a;
        return (_a = keys[key]) != null ? _a : null;
      },
      setItem(key, value) {
        mutable();
        if (keys[key] !== value) {
          keys[key] = value;
          changed();
        }
      },
      removeItem(key) {
        mutable();
        if (key in keys) {
          delete keys[key];
          changed();
        }
      }
    });
    return {
      identity,
      options: { storage, storageKey: "dsh-room", packStore: records(packs), draftStore: records(drafts), initialStoredPacks: structuredClone(claim.snapshot.packs) },
      attach(instance) {
        app = instance;
        const retry = setInterval(() => flush().catch(onError), 1800);
        return () => {
          clearTimeout(timer);
          clearInterval(retry);
        };
      },
      group: () => keys["dsh-room.group"] === "1",
      setGroup(on) {
        mutable();
        keys["dsh-room.group"] = on ? "1" : "0";
        changed();
      },
      async handoff(action, before) {
        if (paused || app.visiting || app.worldSession.id || app.town.thread || app._going) throw new Error("请先回家并结束当前换房，再切换窗口");
        app.pauseHome(true);
        app.checkpointHome();
        paused = true;
        clearTimeout(timer);
        await (before == null ? void 0 : before());
        await (pending == null ? void 0 : pending.catch(() => {
        }));
        return send(action, next());
      },
      resume() {
        if (!paused) return;
        paused = false;
        app.pauseHome(false);
        changed();
      },
      async close(release = false, keepalive = false) {
        if (paused) return;
        app.checkpointHome();
        clearTimeout(timer);
        await (pending == null ? void 0 : pending.catch(() => {
        }));
        if (release) return send("release", next(), keepalive);
        return flush();
      }
    };
  }

  // src/desktop-web.js
  var el = document.getElementById("room");
  var host = window.roomkitHome;
  var desk = new URLSearchParams(location.search).get("desk") === "1";
  var notice = document.createElement("span");
  function report(error) {
    var _a, _b;
    notice.textContent = error.message || "桌面房间暂不可用";
    if (desk) (_b = (_a = window.room) == null ? void 0 : _a.hud) == null ? void 0 : _b.toast(notice.textContent);
  }
  async function unwrap(pending) {
    const result = await pending;
    if (!(result == null ? void 0 : result.ok)) throw Object.assign(new Error((result == null ? void 0 : result.error) || "DSH 暂未响应"), { code: result == null ? void 0 : result.code });
    return result.data;
  }
  async function start() {
    if (!host || !window.RoomKit) throw new Error("没有连上 DSH 宿主");
    const view = crypto.randomUUID();
    const claim = await unwrap(host.claim({ view }));
    let transfer, model = {};
    const home = homeView({
      claim,
      view,
      localStore: window.RoomKit.localStore,
      onError: report,
      send(method, input) {
        return unwrap(method === "save" ? host.save(input) : transfer(input));
      }
    });
    const refreshModel = () => unwrap(host.model(home.identity)).then((value) => {
      model = value;
    }).catch(() => {
      model = {};
    });
    void refreshModel();
    setInterval(refreshModel, 4e3);
    if (desk) document.documentElement.classList.add("desk");
    else {
      const bar = document.createElement("nav");
      bar.style.cssText = "position:fixed;inset:0 0 auto;height:36px;display:flex;align-items:center;gap:12px;padding:0 12px;color:#eef5ff;font:13px system-ui";
      const button = document.createElement("button");
      button.textContent = "回到 DSH";
      button.onclick = () => unwrap(host.returnHome()).catch(report);
      bar.append(button, notice);
      el.before(bar);
      el.style.top = "36px";
    }
    el.replaceChildren();
    const app = window.RoomKit.mount(el, {
      ...home.options,
      desk,
      coach: false,
      bridge: false,
      ext: {
        desk: desk ? window.roomkitDesk : void 0,
        openFull: desk ? () => window.roomkitDesk.openFull() : void 0,
        chatStatus: () => model.available ? "模型：" + model.model : "未连接宿主模型，可手动互动和使用离线台词",
        async chat(request) {
          const result = await unwrap(host.chat({ ...home.identity, chat: request }));
          return result.ok ? { text: result.text } : { error: result.error };
        }
      }
    });
    window.room = app;
    home.attach(app);
    host.onPrepare(async (action, send) => {
      transfer = send;
      try {
        await home.handoff(action, () => unwrap(host.cancelModel(home.identity)));
      } catch (error) {
        try {
          await unwrap(host.model(home.identity));
          home.resume();
        } catch {
          throw Object.assign(new Error("桌面已失去房间编辑权，请在 DSH 重新打开"), { code: "lost" });
        }
        report(error);
        throw error;
      } finally {
        transfer = null;
      }
    });
    await app.packsReady;
    host.ready();
  }
  start().catch((error) => {
    el.textContent = error.message || "桌面房间暂时未能打开";
  });
})();
