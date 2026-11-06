(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // coopanion/kit/rig.js
  var rig_exports = {};
  __export(rig_exports, {
    createRig: () => createRig
  });
  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function createRig(canvas, model) {
    const attrs = { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true };
    const gl = canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs);
    if (!gl) throw new Error("webgl unavailable");
    const pot = (n) => (n & n - 1) === 0;
    const gl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const canMip = (src) => gl2 || pot(src.width) && pot(src.height);
    const defs = model.deformers;
    let view = model.view;
    const textures = /* @__PURE__ */ new Map(), sources = /* @__PURE__ */ new Map();
    function upload(key, src) {
      if (disposed) return null;
      sources.set(key, src);
      let t = textures.get(key);
      if (!t) {
        t = gl.createTexture();
        textures.set(key, t);
      }
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const mip = canMip(src);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    const chainOf = (id) => {
      const c = [];
      for (let d = id; d; d = defs[d].parent) c.push(d);
      return c;
    };
    let prog, loc, meshes = [];
    let shaders = [];
    function buildGL() {
      shaders = [shader(gl, gl.VERTEX_SHADER, VS), shader(gl, gl.FRAGMENT_SHADER, FS)];
      prog = gl.createProgram();
      for (const s of shaders) gl.attachShader(prog, s);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      loc = {
        aPos: gl.getAttribLocation(prog, "aPos"),
        aUv: gl.getAttribLocation(prog, "aUv"),
        uView: gl.getUniformLocation(prog, "uView"),
        uTex: gl.getUniformLocation(prog, "uTex"),
        uAlpha: gl.getUniformLocation(prog, "uAlpha"),
        uTint: gl.getUniformLocation(prog, "uTint"),
        uTex2: gl.getUniformLocation(prog, "uTex2"),
        uMix: gl.getUniformLocation(prog, "uMix")
      };
      meshes = model.parts.map((p) => {
        const [nx, ny] = p.grid || [6, 6];
        const [x, y, w, h] = p.box;
        const [u0, v0, u1, v1] = p.uvBox || [0, 0, 1, 1];
        const rest = new Float32Array((nx + 1) * (ny + 1) * 2), uv = new Float32Array(rest.length);
        let k = 0;
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
          rest[k] = x + w * i / nx;
          rest[k + 1] = y + h * j / ny;
          uv[k] = u0 + (u1 - u0) * i / nx;
          uv[k + 1] = v0 + (v1 - v0) * j / ny;
          k += 2;
        }
        const idx = [];
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
          idx.push(a, b, c, b, d, c);
        }
        const pos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pos);
        gl.bufferData(gl.ARRAY_BUFFER, rest.byteLength, gl.DYNAMIC_DRAW);
        const uvb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvb);
        gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
        const ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
        return { part: p, rest, out: new Float32Array(rest.length), pos, uvb, ib, count: idx.length };
      });
      meshes.forEach((m) => {
        m.chain = chainOf(m.part.parent);
      });
      gl.enableVertexAttribArray(loc.aPos);
      gl.enableVertexAttribArray(loc.aUv);
    }
    let lost = false;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      lost = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      if (disposed) return;
      lost = false;
      textures.clear();
      buildGL();
      for (const [key, src] of sources) upload(key, src);
    });
    buildGL();
    let disposed = false;
    function dispose() {
      if (disposed) return;
      disposed = true;
      lost = true;
      try {
        for (const t of textures.values()) gl.deleteTexture(t);
        for (const m of meshes) {
          gl.deleteBuffer(m.pos);
          gl.deleteBuffer(m.uvb);
          gl.deleteBuffer(m.ib);
        }
        if (prog) gl.deleteProgram(prog);
        for (const s of shaders) gl.deleteShader(s);
      } finally {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    }
    function applyChain(chain, st, x, y) {
      for (const id of chain) {
        const d = defs[id], s = st[id];
        if (!s) continue;
        if (d.kind === "rot") {
          const [px, py] = d.pivot, a = (s.a || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
          const sx = s.sx ?? s.s ?? 1, sy = s.sy ?? s.s ?? 1;
          const lx = (x - px) * sx, ly = (y - py) * sy;
          x = px + (s.tx || 0) + lx * c - ly * sn;
          y = py + (s.ty || 0) + lx * sn + ly * c;
        } else if (d.kind === "warp" && s.fn) {
          const [x0, y0, x1, y1] = d.rect;
          const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0))), v = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
          const r = s.fn(u, v, x, y);
          x += r[0];
          y += r[1];
        }
      }
      return [x, y];
    }
    function render(st, opts = {}) {
      if (lost || gl.isContextLost()) return;
      const W = canvas.width, H = canvas.height;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform4f(loc.uView, view[0], view[1], 1 / (view[2] - view[0]), 1 / (view[3] - view[1]));
      gl.uniform1i(loc.uTex, 0);
      gl.uniform1i(loc.uTex2, 1);
      const mixK = Math.min(1, Math.max(0, st.mix || 0));
      const order = meshes.filter((m) => !(opts.hidden && opts.hidden[m.part.id])).map((m) => ({ m, z: st.z?.[m.part.id] ?? m.part.z })).sort((a, b) => a.z - b.z);
      for (const { m } of order) {
        const p = m.part, alpha = st.alpha?.[p.id] ?? p.alpha ?? 1;
        const tex = textures.get(p.tex);
        if (!tex || alpha <= 1e-3) continue;
        for (let i = 0; i < m.rest.length; i += 2) {
          const q = applyChain(m.chain, st, m.rest[i], m.rest[i + 1]);
          m.out[i] = q[0];
          m.out[i + 1] = q[1];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.out);
        gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.uvb);
        gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
        const tex2 = mixK > 0 ? textures.get(p.tex + "@mix") : null;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex2 || tex);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1f(loc.uMix, tex2 ? mixK : 0);
        gl.uniform1f(loc.uAlpha, alpha);
        const tint = st.tint?.[p.id];
        gl.uniform4f(loc.uTint, ...tint || [1, 1, 1, 0]);
        if (p.blend === "multiply") gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
        if (p.blend === "multiply") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
    }
    return {
      gl,
      upload,
      render,
      dispose,
      /** Where a rest point lands this frame (for overlays and hit tests). */
      point(deformer, st, x, y) {
        return applyChain(chainOf(deformer), st, x, y);
      },
      setView(v) {
        view = v;
      },
      get view() {
        return view;
      }
    };
  }
  var VS, FS;
  var init_rig = __esm({
    "coopanion/kit/rig.js"() {
      VS = `
attribute vec2 aPos; attribute vec2 aUv;
uniform vec4 uView; // x0, y0, 1/w, 1/h
varying vec2 vUv;
void main() {
  vec2 n = (aPos - uView.xy) * uView.zw;
  gl_Position = vec4(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);
  vUv = aUv;
}`;
      FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uTex2;
uniform float uMix;
uniform float uAlpha;
uniform vec4 uTint; // rgb multiply, a = mix toward it
void main() {
  vec4 c = mix(texture2D(uTex, vUv), texture2D(uTex2, vUv), uMix);
  c.rgb = mix(c.rgb, c.rgb * uTint.rgb, uTint.a);
  gl_FragColor = c * uAlpha;
}`;
    }
  });

  // coopanion/kit/body.js
  init_rig();
  var f = (n) => Math.round(n * 10) / 10;
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var lerp = (a, b, k) => a + (b - a) * k;
  var rnd = (a, b) => a + Math.random() * (b - a);
  var ease = (rate, dt) => 1 - Math.exp(-rate * dt);
  var smooth = (k) => k * k * (3 - 2 * k);
  var envelope = (k, a, b) => smooth(clamp(k / a, 0, 1)) * (1 - smooth(clamp((k - b) / (1 - b), 0, 1)));
  var HIPS = [[104, 212], [150, 212]];
  var LEG_W = 30;
  var FOOT_Y = 256 - LEG_W / 2;
  var STAND = HIPS.map((h) => [h[0], h[1], h[0], FOOT_Y]);
  var DROP = "M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z";
  function heartD(cx, cy, s) {
    const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
    return `M${p(0, 14)}C${p(-7, 8)} ${p(-19, 1)} ${p(-19, -6)}C${p(-19, -15)} ${p(-8, -18)} ${p(0, -9)}C${p(8, -18)} ${p(19, -15)} ${p(19, -6)}C${p(19, 1)} ${p(7, 8)} ${p(0, 14)}Z`;
  }
  var ring = (o) => ({ shape: "ring", rx: 16, ry: 16, ...o });
  var yawn = (t) => {
    const p = t % 4.2 / 1.6;
    return p < 1 ? Math.sin(Math.PI * p) ** 2 : 0;
  };
  var FACES = {
    neutral: { label: "\u5E73\u9759", kao: "(0 0", f: () => ({ gap: [50, 50], eyes: [ring(), ring()] }) },
    happy: { label: "\u5F00\u5FC3", kao: "(^ ^", f: () => ({ gap: [58, 58], eyes: [{ shape: "up" }, { shape: "up" }], blush: 0.45 }) },
    wink: { label: "\u7728\u773C", kao: "(0 ^", f: () => ({ gap: [56, 52], eyes: [ring(), { shape: "up" }] }) },
    love: { label: "\u559C\u6B22", kao: "(\u2661 \u2661", f: (t) => {
      const s = 0.8 + 0.08 * Math.sin(t * 9);
      return { gap: [56, 56], eyes: [{ shape: "heart", s, sw: 8 }, { shape: "heart", s, sw: 8 }], blush: 0.7, emit: "heart" };
    } },
    shy: { label: "\u5BB3\u7F9E", kao: "(o o *", f: () => ({ gap: [40, 40], eyes: [ring({ rx: 13, ry: 12, dx: -3, dy: 5 }), ring({ rx: 13, ry: 12, dx: -3, dy: 5 })], blush: 1, lookLock: true }) },
    surprised: { label: "\u60CA\u8BB6", kao: "(O O", f: () => ({ gap: [62, 62], eyes: [ring({ rx: 20, ry: 21 }), ring({ rx: 20, ry: 21 })], bang: true }) },
    angry: { label: "\u751F\u6C14", kao: "(\xF2 \xF3", f: () => ({ gap: [36, 36], eyes: [ring({ ry: 11, dy: 4 }), ring({ ry: 11, dy: 4 })], brows: "angry", anger: true, shake: true }) },
    sad: { label: "\u96BE\u8FC7", kao: "(\xF3 \xF2", f: () => ({ gap: [34, 40], eyes: [ring({ ry: 14, dy: 4 }), ring({ ry: 14, dy: 4 })], brows: "sad", emit: "tear" }) },
    // a yawn narrows the eyes without squeezing them to a slit
    sleepy: { label: "\u72AF\u56F0", kao: "(- -", f: (t) => {
      const y = yawn(t);
      return { gap: [50 + 14 * y, 50 + 14 * y], eyes: [{ shape: "lid", ry: 10 - 5 * y }, { shape: "lid", ry: 10 - 5 * y }] };
    } },
    sleep: { label: "\u7761\u7740", kao: "(u u", f: (t) => {
      const b = 40 + 6 * Math.sin(t * 1.7);
      return { gap: [b, b], eyes: [{ shape: "down" }, { shape: "down" }], emit: "z" };
    } },
    dizzy: { label: "\u6655\u4E4E", kao: "(@ @", f: (t) => ({ gap: [54 + 5 * Math.sin(t * 5), 48], eyes: [{ shape: "spiral", rot: t * 7 }, { shape: "spiral", rot: t * 7 + 1.4 }], orbit: true }) },
    dragged: { label: "\u88AB\u62CE\u8D77", kao: "(> <", f: (t) => {
      const g = 55 + 3 * Math.sin(t * 22);
      return { gap: [g, g], eyes: [{ shape: "gt" }, { shape: "lt" }], sweat: true };
    } },
    // seated eyes rest open; once drowse passes .7 they are the closed sleep sprite (the shape swap hides under a blink)
    content: { label: "\u60EC\u610F", f: (t, p) => {
      const d = p ? p.drowse : 0;
      const e = d > 0.7 ? { shape: "down" } : { shape: "lid", ry: 13.5 - 10 * d };
      return { gap: [46, 46], eyes: [e, { ...e }] };
    } },
    waking: { label: "\u9192\u6765", f: (t, p) => {
      const mt = p ? p.modeT : 1;
      const k = clamp(mt / 0.5, 0, 1), y = mt > 0.5 ? Math.sin(clamp((mt - 0.5) / 0.9, 0, 1) * Math.PI) : 0;
      const r = Math.max(0, 10 * k * (1 - 0.7 * y));
      return { gap: [50 + 12 * y, 50 + 12 * y], eyes: [{ shape: "lid", ry: r }, { shape: "lid", ry: r }] };
    } },
    squeeze: { label: "\u56DE\u795E", f: () => ({ gap: [44, 44], eyes: [{ shape: "lid", ry: 0 }, { shape: "lid", ry: 0 }] }) },
    listening: { label: "\u503E\u542C", f: () => ({ gap: [44, 44], eyes: [ring({ rx: 17, ry: 18, dy: -1 }), ring({ rx: 17, ry: 18, dy: -1 })], listen: true }) },
    thinking: { label: "\u601D\u8003", f: (t) => ({ gap: [46, 46], eyes: [ring({ rx: 14, ry: 15, dx: 3, dy: -4 }), ring({ rx: 14, ry: 15, dx: 3, dy: -4 })], think: true }) },
    run: { label: "\u51B2\u523A", f: (t) => {
      const g = 55 + 4 * Math.sin(t * 16);
      return { gap: [g, g], eyes: [ring(), ring()], sweat: true };
    } },
    smug: { label: "\u5F97\u610F", kao: "(\xAC \xAC", f: () => ({ gap: [52, 46], eyes: [{ shape: "lid", ry: 8, dx: 4 }, { shape: "lid", ry: 8, dx: 4 }], blush: 0.25 }) },
    // `lookAt` holds the gaze (and with it a figure's head) on a point, here away from whoever is there
    pout: { label: "\u561F\u5634", kao: "(o o 3", f: () => ({ gap: [28, 28], eyes: [ring({ rx: 14, ry: 13 }), ring({ rx: 14, ry: 13 })], blush: 0.6, lookAt: [-5, -1] }) },
    worried: { label: "\u62C5\u5FC3", kao: "(\xF3 \xF2 ;", f: () => ({ gap: [40, 44], eyes: [ring({ ry: 17, dy: 2 }), ring({ ry: 17, dy: 2 })], brows: "sad", sweat: true }) },
    determined: { label: "\u8BA4\u771F", kao: "(\xF2 \xF3", f: () => ({ gap: [42, 42], eyes: [ring({ ry: 13, dy: 1 }), ring({ ry: 13, dy: 1 })], brows: "angry" }) },
    flustered: { label: "\u614C\u5F20", kao: "(> <;", f: (t) => ({ gap: [50 + 3 * Math.sin(t * 22), 48], eyes: [{ shape: "gt" }, { shape: "lt" }], blush: 1, sweat: true }) },
    // `wide`: eyes wider than open (a figure with drawn eyes may use its surprised ones)
    scared: { label: "\u5BB3\u6015", kao: "(O O;", f: () => ({ gap: [38, 38], eyes: [ring({ rx: 18, ry: 19 }), ring({ rx: 18, ry: 19 })], brows: "sad", wide: true, shake: true, sweat: true }) },
    excited: { label: "\u671F\u5F85", kao: "(\u2606 \u2606", f: () => ({ gap: [60, 60], eyes: [ring({ rx: 18, ry: 19, dy: -1 }), ring({ rx: 18, ry: 19, dy: -1 })], sparkle: true, blush: 0.4 }) },
    cry: { label: "\u5927\u54ED", kao: "(T T", f: (t) => {
      const g = 36 + 6 * Math.abs(Math.sin(t * 9));
      return { gap: [g, g], eyes: [{ shape: "lid", ry: 0 }, { shape: "lid", ry: 0 }], brows: "sad", emit: "tears", streams: true };
    } },
    // a motion's own face (not one to ask for): eyes shut through a bow
    bowing: { label: "\u97A0\u8EAC", f: () => ({ gap: [48, 48], eyes: [{ shape: "lid", ry: 0 }, { shape: "lid", ry: 0 }] }) },
    confused: { label: "\u7591\u60D1", kao: "(0 o ?", f: () => ({ gap: [44, 40], eyes: [ring(), ring({ rx: 14, ry: 11 })], question: true }) }
  };
  var KIT_EXPRESSIONS = [
    "neutral",
    "happy",
    "wink",
    "love",
    "shy",
    "surprised",
    "angry",
    "sad",
    "sleepy",
    "thinking",
    "smug",
    "pout",
    "worried",
    "determined",
    "flustered",
    "scared",
    "excited",
    "cry",
    "confused"
  ];
  var KIT_MOTIONS = [
    "stand",
    "jump",
    "hop",
    "look",
    "turn",
    "nod",
    "shake",
    "spin",
    "sit",
    "sleep",
    "dizzy",
    "walk",
    "run",
    "wave",
    "bow",
    "shiver",
    "flap",
    "dance"
  ];
  var FACE_TONES = {
    happy: "happy",
    wink: "wink",
    love: "love",
    surprised: "surprised",
    angry: "angry",
    sad: "sad",
    shy: "shy",
    sleepy: "yawn",
    smug: "wink",
    worried: "hmm",
    determined: "pop",
    flustered: "shy",
    scared: "surprised",
    excited: "sparkle",
    cry: "sad",
    confused: "hmm"
  };
  var MOVING_MODES = /* @__PURE__ */ new Set(["drag", "air", "crouch", "land", "walk", "run", "dance"]);
  var ANCHORS = { gaze: [140, 117], tear: [166, 136], z: [196, 40], hearts: [90, 175, 34], bubble: [128, 0] };
  var EXTENT = [20, 12, 236, 256];
  var HITS = [[128, 128, 108]];
  function createPet(els, opts) {
    const { petG, shadowEl, fxG } = els;
    let custom = opts.figure;
    const sfx = opts.sfx;
    const play = (name, kind, ...args) => sfx.play ? sfx.play(name, kind, ...args) : sfx[name]?.(...args);
    const onEvent = opts.onEvent || (() => {
    });
    const words = opts.words || {};
    let W = 0, H = 0, floorY = 0, S = 0.42, T = 0;
    let roam = opts.roam ?? "free";
    let skin = opts.skin || null;
    let hold = 0;
    const freeGround = opts.ground === "free";
    const pet = {
      x: 260,
      fy: 0,
      gy: 0,
      gvy: 0,
      targetY: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      faceVis: 1,
      mode: "idle",
      modeT: 0,
      dur: 0,
      target: 0,
      speed: 0,
      stride: 0,
      lift: 0,
      bob: 0,
      phase: 0,
      lastHalf: 0,
      lean: 0,
      tilt: 0,
      tiltV: 0,
      sq: 0,
      sqv: 0,
      sitK: 0,
      stretch: 0,
      low: 0,
      gap: [50, 50],
      look: [0, 0],
      drowse: 0,
      feet: STAND.map((l) => [l[2], l[3]]),
      blinkT: 1.5,
      blinkAge: 9,
      expr: null,
      exprUntil: 0,
      nextAt: 1.2,
      emitAt: 0,
      airKind: "jump",
      turned: false,
      startle: false,
      lastAct: "",
      turnAcc: 0,
      dx: 0,
      dy: 0,
      jumpV: 700,
      jumpVx: 0,
      xf: null,
      blushK: 0,
      eyeSig: "",
      eyeCur: null,
      eyePrev: null,
      eyeDims: [[16, 16, 0, 0], [16, 16, 0, 0]],
      swapAge: 9,
      glance: [0, 0],
      glanceAt: 0,
      swing: 0,
      swingV: 0,
      prevA: null,
      velX: 0,
      talkK: 0,
      sfxAt: 0,
      skid: false,
      cue: 0,
      pulse: null,
      walkId: 0,
      walkWord: null,
      listening: false,
      thinking: false,
      thoughtShown: false,
      placed: false,
      noteAt: 0,
      tearN: 0,
      cursor: "",
      status: null
    };
    const pointer = { x: -1e4, y: -1e4, inside: false, vx: 0, samples: [] };
    let press = null, strokeAcc = 0, petCool = 0;
    let velXBad = false;
    const P = [];
    const anchors = () => ({ ...ANCHORS, ...custom?.anchors });
    let A = anchors();
    const minX = () => 104 * S + 8, maxX = () => W - 104 * S - 8;
    const minY = () => Math.min(floorY, 250 * S + 8);
    const groundY = () => freeGround ? pet.gy : floorY;
    const at = () => ({ x: Math.round(pet.x), ...freeGround ? { y: Math.round(pet.gy) } : {} });
    const faceDef = (n) => FACES[n] ?? FACES[words[n]?.expression?.like] ?? FACES.neutral;
    function resize() {
      const b = opts.bounds();
      W = b.W;
      H = b.H;
      floorY = b.floorY;
      S = b.S;
      if (!pet.placed && W > 0) {
        pet.x = opts.startX != null ? opts.startX : W * 0.7;
        pet.placed = true;
        pet.gy = freeGround && opts.startY != null ? opts.startY : floorY;
        if (opts.enter === "drop") {
          pet.fy = -8;
          pet.vy = 0;
          pet.vx = 0;
          pet.airKind = "drop";
          setMode("air");
        }
      }
      pet.x = clamp(pet.x, minX(), maxX());
      pet.target = clamp(pet.target, minX(), maxX());
      pet.gy = freeGround ? clamp(pet.gy, minY(), floorY) : floorY;
      pet.targetY = freeGround ? clamp(pet.targetY, minY(), floorY) : floorY;
      if (pet.mode !== "air" && pet.mode !== "drag") pet.fy = pet.gy;
    }
    function toStage(lx, ly) {
      const c = pet.xf;
      if (!c) return { x: pet.x, y: groundY() };
      const x = (lx - c.ax) * c.kx, y = (ly - c.ay) * c.ky, r = c.rot * Math.PI / 180;
      return { x: c.AX + x * Math.cos(r) - y * Math.sin(r), y: c.AY + x * Math.sin(r) + y * Math.cos(r) };
    }
    function hits() {
      return (custom?.hits ?? HITS).map(([x, y, r]) => ({ ...toStage(x, y), r: r * S }));
    }
    function hitPet(p) {
      return hits().some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
    }
    function setMode(m, o = {}) {
      const prev = pet.mode;
      if ((prev === "walk" || prev === "run") && pet.walkId) {
        onEvent("interrupted", { walkId: pet.walkId, ...at(), by: m });
        pet.walkId = 0;
      }
      if ((prev === "walk" || prev === "run") && pet.walkWord && m !== prev) {
        onEvent("done", { word: pet.walkWord });
        pet.walkWord = null;
      }
      pet.mode = m;
      pet.modeT = 0;
      pet.turned = false;
      pet.startle = false;
      pet.skid = false;
      pet.cue = 0;
      Object.assign(pet, o);
      if (prev !== m) onEvent("mode", { mode: m });
    }
    const busy = () => pet.mode === "drag" || pet.mode === "air" || pet.mode === "crouch";
    function pickTarget(minDist) {
      for (let i = 0; i < 12; i++) {
        const x = rnd(minX(), maxX());
        if (Math.abs(x - pet.x) > minDist) return x;
      }
      return pet.x - minX() > maxX() - pet.x ? minX() : maxX();
    }
    const pickY = () => freeGround ? rnd(minY(), floorY) : pet.gy;
    function act(a) {
      if (busy()) return false;
      pet.expr = null;
      pet.lastAct = a;
      const seated = pet.mode === "sleep" || pet.mode === "sit";
      switch (a) {
        case "stand":
          setMode(seated ? "wake" : "idle", seated ? { startle: false } : {});
          pet.nextAt = T + 3;
          break;
        case "walk":
          setMode("walk", { target: pickTarget(160), targetY: pickY() });
          break;
        case "run":
          setMode("run", { target: pet.x < W / 2 ? maxX() - rnd(0, 30) : minX() + rnd(0, 30), targetY: pickY() });
          break;
        case "jump":
          setMode("crouch", { jumpV: 720, jumpVx: pet.facing * 40 });
          break;
        case "hop":
          setMode("crouch", { jumpV: 480, jumpVx: 0 });
          break;
        case "look":
          setMode("look");
          break;
        case "turn":
          if (!seated) setMode("idle");
          pet.facing *= -1;
          play("tick", "move");
          break;
        case "nod":
          pulse("nod", 0.7);
          play("nod", "move");
          break;
        case "shake":
          pulse("shake", 0.7);
          play("shake", "move");
          break;
        case "spin":
          if (!seated) setMode("idle");
          pulse("spin", 0.6);
          play("spin", "move");
          break;
        case "sit":
          setMode("sit", { dur: 1e9, willSleep: false });
          break;
        case "sleep":
          setMode("sleep", { dur: 1e9 });
          break;
        case "dizzy":
          setMode("dizzy");
          break;
        case "wave":
          pulse("wave", 1.6);
          holdFace("happy", 1.8);
          break;
        case "bow":
          if (!seated) setMode("idle");
          pulse("bow", 1.6);
          holdFace("bowing", 1.5);
          play("tick", "move");
          break;
        case "shiver":
          pulse("shiver", 1.8);
          play("shiver", "move");
          break;
        case "flap":
          setMode("crouch", { jumpV: 540, jumpVx: 0 });
          pulse("flap", 1.4);
          holdFace("happy", 1.6);
          play("chirps", "move");
          break;
        case "dance":
          setMode("dance", { dur: 3.2 });
          holdFace("happy", 3.4);
          play("dance", "move");
          break;
        default: {
          const m = words[a]?.motion;
          if (!m) return false;
          if (!seated) setMode("idle");
          pulse(a, m.seconds);
          if (m.face) holdFace(m.face, m.seconds);
          if (m.sound) play(m.sound, "move");
        }
      }
      return true;
    }
    function pulse(kind, dur) {
      pet.pulse = { kind, t0: T, dur };
    }
    function holdFace(n, seconds) {
      pet.expr = n;
      pet.exprUntil = T + seconds;
      pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + 0.6);
    }
    function setExpr(n, seconds) {
      if (n === "sleep") {
        act("sleep");
        return;
      }
      if (busy()) return;
      if (n === "dragged") {
        pet.expr = null;
        pet.vy = -1150;
        pet.vx = rnd(-120, 120);
        pet.airKind = "throw";
        pet.sqv -= 3;
        play("whoosh", "move");
        play("jump", "move");
        setMode("air");
        return;
      }
      if (n === "dizzy") {
        pet.expr = null;
        setMode("dizzy");
        return;
      }
      if (pet.mode === "look" || pet.mode === "land") setMode("idle");
      const own = words[n]?.expression;
      pet.expr = n;
      pet.exprUntil = T + (seconds ?? own?.seconds ?? (n === "sleepy" ? 4.4 : 3.2));
      pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + 0.6);
      pet.sqv += n === "surprised" ? -2.2 : 0.8;
      const tone = own?.sound ?? FACE_TONES[n];
      if (tone) play(tone, "face");
      if (n === "love") for (let i = 0; i < 4; i++) emitHeart();
    }
    function doWord(w) {
      if (w === "neutral") {
        setExpr("neutral", 0.1);
        return true;
      }
      if (w === "walk" || w === "run") {
        const x = pet.x < W / 2 ? W * (0.55 + Math.random() * 0.35) : W * (0.1 + Math.random() * 0.35);
        if (!walkTo(x, w === "run", 0, pickY())) return false;
        if (pet.mode === w) pet.walkWord = w;
        else onEvent("done", { word: w });
        return true;
      }
      if (KIT_MOTIONS.includes(w) || words[w]?.motion) return act(w);
      if (KIT_EXPRESSIONS.includes(w) || words[w]?.expression) {
        if (busy()) return false;
        setExpr(w);
        return true;
      }
      return false;
    }
    function walkTo(x, run, walkId, y) {
      if (busy()) return false;
      if (pet.mode === "sleep" || pet.mode === "sit") setMode("wake", { startle: true });
      const target = clamp(x, minX(), maxX());
      const targetY = freeGround && typeof y === "number" && Number.isFinite(y) ? clamp(y, minY(), floorY) : pet.gy;
      pet.expr = null;
      if (Math.hypot(target - pet.x, targetY - pet.gy) < 2) {
        onEvent("arrived", { walkId, ...at() });
        return true;
      }
      setMode(run ? "run" : "walk", { target, targetY, walkId });
      return true;
    }
    function stopWalk(walkId) {
      if ((pet.mode === "walk" || pet.mode === "run") && pet.walkId === walkId) setMode("idle");
    }
    function faceName() {
      const m = pet.mode;
      if (m === "drag") return "dragged";
      if (m === "air" && pet.airKind === "throw") return pet.vy < 0 ? "dragged" : "surprised";
      if (m === "air" && pet.airKind === "drop") return "surprised";
      if (m === "dizzy") return pet.modeT < 2.4 ? "dizzy" : "squeeze";
      if (m === "wake") return pet.startle ? "surprised" : "waking";
      if (pet.listening && m !== "sleep") return "listening";
      if (m === "sleep") return "sleep";
      if (pet.expr && T < pet.exprUntil) return pet.expr;
      if (pet.thinking) return "thinking";
      if (m === "sit") return "content";
      if (m === "run") return "run";
      return "neutral";
    }
    function decide() {
      const calm = roam === "calm";
      const opts2 = [["walk", calm ? 10 : 28], ["run", calm ? 0 : 12], ["look", 14], ["jump", calm ? 2 : 8], ["sit", 16], ["expr", 12], ["wait", calm ? 30 : 10]].filter((o) => o[1] > 0 && (o[0] !== pet.lastAct || o[0] === "wait"));
      let r = Math.random() * opts2.reduce((a, o) => a + o[1], 0), pick = "wait";
      for (const o of opts2) {
        if ((r -= o[1]) < 0) {
          pick = o[0];
          break;
        }
      }
      if (pick === "look") {
        setMode("look");
        pet.lastAct = "look";
      } else if (pick === "expr") {
        setExpr(["happy", "wink", "love", "sleepy", "surprised", "shy"][Math.floor(Math.random() * 6)]);
        pet.lastAct = "expr";
      } else if (pick === "sit") {
        setMode("sit", { dur: rnd(6, 9), willSleep: Math.random() < 0.6 });
        pet.lastAct = "sit";
      } else if (pick !== "wait") act(pick);
      if (pet.mode === "idle" && T >= pet.nextAt) pet.nextAt = T + rnd(2, 4);
    }
    function emit(type, p, o = {}) {
      P.push({ type, x: p.x, y: p.y, vx: 0, vy: 0, age: 0, life: 1, ...o });
    }
    function emitHeart() {
      emit("heart", toStage(rnd(A.hearts[0], A.hearts[1]), A.hearts[2] + pet.low), { vx: rnd(-20, 20), vy: rnd(-70, -45), life: 1.6 });
    }
    function dustAt(lx, n, spread) {
      for (let i = 0; i < n; i++) {
        emit("dust", toStage(lx, 250), { vx: rnd(-spread, spread) - pet.facing * rnd(10, 40), vy: rnd(-30, -8), life: rnd(0.4, 0.65) });
      }
    }
    function step(dt) {
      if (!(dt > 0 && dt < Infinity)) return;
      T += dt;
      pet.modeT += dt;
      A = anchors();
      const m = pet.mode, mt = pet.modeT;
      let sqT = 0, strideT = 0, liftT = 0, leanT = 0, sitT = 0, bobT = 0, rate = 0, lookT = [0, 0], tiltT = 0;
      let tk = 160, tc = 12, drowseT = 0;
      const free = roam !== "off" && T > hold && !opts.dialogOpen?.();
      pet.blinkT -= dt;
      pet.blinkAge += dt;
      if (pet.blinkT <= 0) {
        pet.blinkAge = 0;
        pet.blinkT = Math.random() < 0.2 ? 0.28 : rnd(2.2, 5.2);
      }
      const head = toStage(A.gaze[0], A.gaze[1]);
      const pdx = pointer.x - head.x, pdy = pointer.y - head.y, pm = Math.hypot(pdx, pdy) || 1;
      const track = () => {
        if (!pointer.inside) {
          if (T > pet.glanceAt) {
            pet.glance = Math.random() < 0.45 ? [0, 0] : [rnd(-3, 5), rnd(-3, 3)];
            pet.glanceAt = T + rnd(1.2, 3);
          }
          return pet.glance;
        }
        const k = Math.min(1, pm / 120);
        return [pdx * pet.facing / pm * 5 * k, pdy / pm * 4 * k];
      };
      switch (m) {
        case "idle": {
          lookT = track();
          if (pointer.inside && !press && pdx * pet.facing < -50 && pm < 600) {
            pet.turnAcc += dt;
            if (pet.turnAcc > 0.9) {
              pet.facing *= -1;
              pet.turnAcc = 0;
            }
          } else pet.turnAcc = 0;
          if (pet.listening) {
            lookT = [3, -4];
            tiltT = -7;
            leanT = -2;
          }
          if (free && !pet.listening && T > pet.nextAt && !(pet.expr && T < pet.exprUntil)) decide();
          break;
        }
        case "walk":
        case "run": {
          const run = m === "run", d = pet.target - pet.x, dy = pet.targetY - pet.gy, dist = Math.hypot(d, dy), dir = Math.sign(d) || pet.facing;
          if (!freeGround || Math.abs(d) > 2) pet.facing = dir;
          const vMax = run ? 250 : 78;
          const vT = Math.min(vMax, run ? dist * 4 + 20 : dist * 3 + 14);
          strideT = run ? 17 : 10;
          liftT = run ? 15 : 8;
          bobT = run ? 7 : 3;
          rate = run ? 4.4 : 2.1;
          leanT = run ? dist < 50 && pet.speed > 120 ? -6 : 11 : 4;
          if (leanT < 0 && !pet.skid) {
            pet.skid = true;
            play("skid", "move");
          }
          const ramp = Math.min(1, mt / (run ? 0.35 : 0.25));
          pet.speed = lerp(pet.speed, vT * smooth(ramp), ease(run ? 6 : 9, dt));
          const go = Math.min(dist, pet.speed * dt);
          if (dist > 0) {
            pet.x += d / dist * go;
            pet.gy += dy / dist * go;
            pet.fy = pet.gy;
          }
          const k = clamp(pet.speed / vMax, 0, 1);
          strideT *= 0.4 + 0.6 * k;
          liftT *= 0.4 + 0.6 * k;
          pet.phase += Math.PI * 2 * rate * dt * Math.max(0.35, k);
          lookT = [run ? 4 : 3, run ? 1 : 0];
          const half = Math.floor(pet.phase / Math.PI);
          if (half !== pet.lastHalf) {
            play("step", "move", run, half & 1);
            if (run && pet.speed > 120) dustAt(128, dist < 50 ? 3 : 1, 20);
          }
          pet.lastHalf = half;
          if (dist < 1.5) {
            pet.speed = 0;
            const id = pet.walkId;
            pet.walkId = 0;
            setMode("idle");
            pet.nextAt = T + rnd(1.2, 3.2);
            if (id) onEvent("arrived", { walkId: id, ...at() });
          }
          break;
        }
        case "look": {
          if (!pet.cue) {
            pet.cue = 1;
            play("look", "move");
          }
          if (mt < 0.9) lookT = [4, -4];
          else if (mt < 1.8) {
            if (!pet.turned) {
              pet.turned = true;
              pet.facing *= -1;
            }
            lookT = [5, 0];
          } else if (mt < 2.6) lookT = [1, 4];
          else {
            setMode("idle");
            pet.nextAt = T + rnd(1, 2.5);
          }
          break;
        }
        case "sit": {
          sitT = 1;
          lookT = track().map((v) => v * (1 - pet.drowse));
          if (pet.listening) {
            lookT = [3, -4];
            tiltT = -7;
          }
          drowseT = pet.willSleep && free ? clamp((mt - (pet.dur - 1.6)) / 1.2, 0, 1) : 0.15;
          if (pet.drowse > 0.5) leanT = 7 * pet.drowse * Math.pow(Math.max(0, Math.sin(T * 1.3)), 6);
          if (free && mt > pet.dur) {
            if (pet.willSleep) setMode("sleep", { dur: rnd(8, 12) });
            else {
              setMode("idle");
              pet.sqv -= 1.2;
              pet.nextAt = T + rnd(1.5, 3);
            }
          }
          break;
        }
        case "sleep": {
          sitT = 1;
          drowseT = 1;
          leanT = 5;
          if (free && mt > pet.dur) setMode("wake");
          break;
        }
        case "wake": {
          if (pet.startle) {
            sitT = 0;
            lookT = [3, -2];
            if (mt > 0.9) {
              setMode("idle");
              pet.nextAt = T + rnd(1.5, 3);
            }
          } else {
            sitT = mt < 1.1 ? 1 : 0;
            if (mt > 0.5 && !pet.cue) {
              pet.cue = 1;
              play("yawn", "face");
            }
            sqT = mt > 0.5 && mt < 1.3 ? -0.1 : 0;
            leanT = mt < 0.5 ? 5 : mt < 1.2 ? -5 : 0;
            lookT = mt > 1.2 ? track() : [0, 0];
            if (mt > 1.8) {
              setMode("idle");
              pet.nextAt = T + rnd(1, 2);
            }
          }
          break;
        }
        case "crouch": {
          sqT = 0.24;
          sitT = 0.3;
          if (mt > 0.16) {
            pet.vy = -pet.jumpV;
            pet.vx = pet.jumpVx;
            pet.airKind = "jump";
            pet.sqv -= 2.6;
            play("jump", "move");
            setMode("air");
          }
          break;
        }
        case "air": {
          pet.vy += 2300 * dt;
          pet.vx *= Math.exp(-dt * 0.4);
          pet.x += pet.vx * dt;
          pet.fy += pet.vy * dt;
          if (freeGround && pet.gvy) {
            pet.gvy *= Math.exp(-dt * 1.2);
            pet.gy += pet.gvy * dt;
            pet.fy += pet.gvy * dt;
            if (pet.gy < minY()) {
              pet.fy += minY() - pet.gy;
              pet.gy = minY();
              pet.gvy = Math.abs(pet.gvy) * 0.55;
              pet.sqv += 0.6;
            }
            if (pet.gy > floorY) {
              pet.fy -= pet.gy - floorY;
              pet.gy = floorY;
              pet.gvy = -Math.abs(pet.gvy) * 0.55;
              pet.sqv += 0.6;
            }
          }
          if (pet.x < minX()) {
            pet.x = minX();
            pet.vx = Math.abs(pet.vx) * 0.55;
            pet.sqv += 0.6;
          }
          if (pet.x > maxX()) {
            pet.x = maxX();
            pet.vx = -Math.abs(pet.vx) * 0.55;
            pet.sqv += 0.6;
          }
          if (pet.fy - 250 * S < 0 && pet.vy < 0) {
            pet.fy = 250 * S;
            pet.vy = Math.abs(pet.vy) * 0.3;
          }
          sqT = -Math.min(0.12, Math.abs(pet.vy) / 6e3);
          tiltT = clamp(pet.vx * 0.025, -30, 30);
          tk = 70;
          tc = 8;
          if (pet.fy >= pet.gy && pet.vy > 0) land();
          break;
        }
        case "land": {
          sitT = 0.35 * (1 - smooth(clamp(mt / 0.35, 0, 1)));
          lookT = [2, 2];
          if (mt > 0.4) setMode("idle");
          break;
        }
        case "dizzy": {
          sitT = mt < 2.6 ? 1 : 0;
          if (mt < 2.4 && T > pet.sfxAt) {
            play("chirps", "move");
            pet.sfxAt = T + 0.9;
          }
          if (mt >= 2.4 && !pet.cue) {
            pet.cue = 1;
            play("shake", "move");
          }
          if (mt < 2.4) tiltT = 8 * Math.sin(T * 4.5) * Math.min(1, mt * 2);
          else if (mt < 3) {
            const k = (mt - 2.4) / 0.6;
            tiltT = 12 * Math.sin(mt * 34) * (1 - k);
          } else {
            setMode("idle");
            pet.sqv -= 1;
            pet.nextAt = T + rnd(1.5, 3);
          }
          break;
        }
        case "dance": {
          strideT = 5;
          liftT = 10;
          bobT = 3;
          pet.phase += Math.PI * 2 * 1.1 * dt;
          tiltT = 7 * Math.sin(pet.phase);
          lookT = [3, -2];
          const half = Math.floor(pet.phase / Math.PI);
          if (half !== pet.lastHalf) play("step", "move", false, half & 1);
          pet.lastHalf = half;
          if (T > pet.noteAt) {
            emit("note", toStage(A.z[0], A.z[1] + pet.low), { vx: pet.facing * rnd(10, 30), vy: -34, life: 1.8 });
            pet.noteAt = T + 0.6;
          }
          if (mt > pet.dur) {
            setMode("idle");
            pet.nextAt = T + rnd(1.5, 3);
          }
          break;
        }
        case "drag": {
          pet.dx = lerp(pet.dx, pointer.x, ease(28, dt));
          pet.dy = lerp(pet.dy, Math.min(pointer.y, floorY - 245 * S), ease(28, dt));
          tiltT = clamp(pointer.vx * 0.035, -40, 40);
          tk = 90;
          tc = 5;
          if (Math.abs(pointer.vx) > 500 && T > pet.sfxAt) {
            play("squeak", "touch");
            pet.sfxAt = T + rnd(0.4, 0.7);
          }
          break;
        }
      }
      if (pet.pulse) {
        const k = (T - pet.pulse.t0) / pet.pulse.dur;
        if (k >= 1) pet.pulse = null;
        else if (custom?.gestures?.includes(pet.pulse.kind)) {
        } else if (pet.pulse.kind === "nod") leanT += 9 * Math.abs(Math.sin(k * Math.PI * 2));
        else if (pet.pulse.kind === "shake") tiltT += 10 * Math.sin(k * Math.PI * 6) * (1 - k);
        else if (pet.pulse.kind === "wave") tiltT += 6 * Math.sin(k * Math.PI * 6) * Math.sin(k * Math.PI);
        else if (pet.pulse.kind === "bow") leanT += 16 * envelope(k, 0.25, 0.7);
        else if (pet.pulse.kind === "flap") {
          tiltT += 7 * Math.sin(k * Math.PI * 8) * (1 - k);
          sqT -= 0.06 * Math.abs(Math.sin(k * Math.PI * 8)) * (1 - k);
        } else if (pet.pulse.kind === "spin" && k > 0.5 && !pet.pulse.flipped) {
          pet.pulse.flipped = true;
          pet.facing *= -1;
        } else if (pet.pulse.kind === "spin" && k < 0.5 && !pet.pulse.first) {
          pet.pulse.first = true;
          pet.facing *= -1;
          pet.sqv -= 1;
        }
      }
      const fname = faceName(), fc = faceDef(fname).f(T, pet);
      if (pet.thinking && pet.thoughtShown && fname === "thinking") fc.think = false;
      if (fc.lookLock || pet.mode === "sleep" || pet.mode === "drag") lookT = [0, 0];
      else if (fc.lookAt) lookT = fc.lookAt;
      const sig = fc.eyes.map((e) => e.shape).join();
      if (sig !== pet.eyeSig) {
        if (pet.eyeCur) {
          pet.eyePrev = pet.eyeCur;
          pet.swapAge = 0;
        }
        pet.eyeSig = sig;
        fc.eyes.forEach((e, i) => {
          pet.eyeDims[i] = [e.rx ?? 16, e.ry ?? 16, e.dx || 0, e.dy || 0];
        });
      }
      pet.swapAge += dt;
      pet.eyeCur = fc.eyes.map((e, i) => {
        if (e.shape !== "ring" && e.shape !== "lid") return e;
        const d = pet.eyeDims[i], tgt = [e.rx ?? 16, e.ry ?? 16, e.dx || 0, e.dy || 0];
        for (let j = 0; j < 4; j++) d[j] = lerp(d[j], tgt[j], ease(16, dt));
        return { ...e, rx: d[0], ry: d[1], dx: d[2], dy: d[3] };
      });
      pet.blushK = lerp(pet.blushK, fc.blush || 0, ease(6, dt));
      pet.sqv += ((sqT - pet.sq) * 280 - pet.sqv * 14) * dt;
      pet.sq = clamp(pet.sq + pet.sqv * dt, -0.35, 0.45);
      pet.tiltV += ((tiltT - pet.tilt) * tk - pet.tiltV * tc) * dt;
      pet.tilt += pet.tiltV * dt;
      pet.lean = lerp(pet.lean, leanT, ease(7, dt));
      pet.sitK = lerp(pet.sitK, sitT, ease(m === "land" ? 18 : 6, dt));
      pet.drowse = lerp(pet.drowse, drowseT, ease(m === "sleep" ? 1.5 : m === "sit" ? 4 : 6, dt));
      pet.stretch = lerp(pet.stretch, m === "drag" ? 1 : 0, ease(8, dt));
      pet.stride = lerp(pet.stride, strideT, ease(10, dt));
      pet.lift = lerp(pet.lift, liftT, ease(10, dt));
      pet.bob = lerp(pet.bob, bobT, ease(10, dt));
      pet.look[0] = lerp(pet.look[0], lookT[0], ease(9, dt));
      pet.look[1] = lerp(pet.look[1], lookT[1], ease(9, dt));
      pet.gap[0] = lerp(pet.gap[0], fc.gap[0], ease(8, dt));
      pet.gap[1] = lerp(pet.gap[1], fc.gap[1], ease(8, dt));
      pet.faceVis = lerp(pet.faceVis, pet.facing, ease(15, dt));
      if (m !== "walk" && m !== "run" && m !== "dance") pet.phase = lerp(pet.phase, Math.round(pet.phase / Math.PI) * Math.PI, ease(6, dt));
      pointer.vx *= Math.exp(-dt * 6);
      const AX = pet.mode === "drag" ? pet.dx : pet.x;
      if (pet.prevA != null) pet.velX = lerp(pet.velX, (AX - pet.prevA) / dt, 0.25);
      if (!Number.isFinite(pet.velX)) {
        if (!velXBad) console.warn(`[pet] \u6A2A\u5411\u901F\u5EA6\u4E0D\u662F\u6709\u9650\u6570,\u5DF2\u5F52\u96F6:velX=${pet.velX} x=${AX} \u4E0A\u4E00\u5E27x=${pet.prevA} dt=${dt} \u6A21\u5F0F=${m}`);
        velXBad = true;
        pet.velX = 0;
      } else velXBad = false;
      pet.prevA = AX;
      const swingT = clamp(-(pet.velX * 0.06 + (m === "dance" ? pet.tiltV * 0.22 : 0)) * Math.sign(pet.faceVis || 1), -28, 28);
      pet.swingV += ((swingT - pet.swing) * 110 - pet.swingV * 7) * dt;
      pet.swing = clamp(pet.swing + pet.swingV * dt, -40, 40);
      pet.low = pet.sitK * 29 + pet.bob * Math.abs(Math.sin(pet.phase));
      pet.feet.forEach((ft, i) => {
        const hx = HIPS[i][0], hy = HIPS[i][1] + pet.low;
        let tx, ty;
        if (m === "drag") {
          tx = hx + 7 * Math.sin(T * 11 + i * 2.2);
          ty = hy + 36;
        } else if (m === "air") {
          tx = hx + (i ? 9 : -9);
          ty = hy + 33;
        } else {
          const ph = pet.phase + i * Math.PI;
          const sx = hx + pet.stride * Math.sin(ph), sy = FOOT_Y - pet.lift * Math.max(0, Math.cos(ph));
          tx = lerp(sx, hx + 26, pet.sitK);
          ty = lerp(sy, FOOT_Y, pet.sitK);
        }
        const r = m === "drag" || m === "air" ? 14 : 40;
        ft[0] = lerp(ft[0], tx, ease(r, dt));
        ft[1] = lerp(ft[1], ty, ease(r, dt));
      });
      if (fc.emit && T > pet.emitAt) {
        if (fc.emit === "heart") {
          emitHeart();
          pet.emitAt = T + 0.45;
        }
        if (fc.emit === "z") {
          emit("z", toStage(A.z[0], A.z[1] + pet.low), { vx: pet.facing * 16, vy: -26, life: 2.4 });
          pet.emitAt = T + 1.3;
          play("snore", "snore", pet.modeT);
        }
        if (fc.emit === "tear") {
          emit("drop", toStage(A.tear[0] + pet.look[0], A.tear[1] + pet.low), { vx: pet.facing * rnd(10, 30), vy: -20, life: 3 });
          pet.emitAt = T + 0.8;
        }
        if (fc.emit === "tears") {
          const eyes = A.tears ?? [A.tear], [ex, ey] = eyes[pet.tearN++ % eyes.length];
          emit("drop", toStage(ex + pet.look[0] + rnd(-6, 6), ey + pet.low), { vx: pet.facing * rnd(-20, 50), vy: rnd(-60, -20), life: 3 });
          pet.emitAt = T + 0.22;
        }
      }
      strokeAcc *= Math.exp(-dt * 1.5);
      petCool -= dt;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "drop") {
          p.vy += 900 * dt;
          if (p.y > groundY()) p.age = p.life;
        }
        if (p.type === "dust") p.vx *= Math.exp(-dt * 4);
        if (p.age >= p.life) P.splice(i, 1);
      }
      pet.talkK *= Math.exp(-dt * 12);
      pet._fc = fc;
      pet._fname = fname;
    }
    function land() {
      const impact = pet.vy, kind = pet.airKind;
      pet.fy = pet.gy;
      pet.vy = 0;
      pet.vx = 0;
      pet.gvy = 0;
      pet.sqv += clamp(impact * 24e-4, 0.8, 4.5);
      play("land", "move", kind !== "jump" && impact > 1e3);
      dustAt(128, impact > 900 ? 7 : 3, 70);
      if (kind === "throw" && impact > 1e3) {
        setMode("dizzy");
        onEvent("touch", { kind: "crash" });
        return;
      }
      setMode("land");
      if (kind === "throw") {
        pet.expr = "surprised";
        pet.exprUntil = T + 0.9;
        pet.nextAt = T + 2;
      } else if (kind === "drop") {
        pet.expr = "happy";
        pet.exprUntil = T + 1.6;
        pet.nextAt = T + 2.6;
      } else pet.nextAt = T + rnd(0.8, 2);
    }
    function render() {
      const fc = pet._fc || FACES.neutral.f(0), fname = pet._fname || "neutral";
      const drag = pet.mode === "drag";
      const br = Math.sin(T * (pet.mode === "sleep" ? 1.7 : 2.4));
      const sx = (1 + pet.sq * 0.7) * (1 - 0.05 * pet.stretch) * (1 - 9e-3 * br);
      const sy = (1 - pet.sq) * (1 + 0.09 * pet.stretch) * (1 + 0.016 * br);
      const ax = 128, ay = drag ? 36 : 256;
      let AX = drag ? pet.dx : pet.x, AY = drag ? pet.dy : pet.fy;
      if (fc.shake) AX += Math.sin(T * 60) * 1.4;
      else if (pet.pulse?.kind === "shiver") AX += Math.sin(T * 75) * 1.1 * envelope((T - pet.pulse.t0) / pet.pulse.dur, 0.08, 0.85);
      const kx = S * pet.faceVis * sx, ky = S * sy, lean = pet.lean * pet.faceVis;
      const rot = custom?.groupTilt ? custom.groupTilt(pet.mode, pet.tilt, lean) : pet.tilt + lean;
      pet.xf = { AX, AY, ax, ay, kx, ky, rot };
      petG.setAttribute("transform", `translate(${f(AX)} ${f(AY)}) rotate(${f(rot)}) scale(${kx.toFixed(4)} ${ky.toFixed(4)}) translate(${-ax} ${-ay})`);
      const legs = pet.feet.map((ft, i) => [HIPS[i][0], HIPS[i][1] + pet.low, ft[0], ft[1]]);
      const bd = 0.16 + 0.3 * pet.drowse, blink = pet.blinkAge < bd ? Math.sin(Math.PI * pet.blinkAge / bd) : 0;
      let eyes = pet.eyeCur || fc.eyes, eyeClose = 0;
      if (pet.swapAge < 0.07 && pet.eyePrev) {
        eyes = pet.eyePrev;
        eyeClose = pet.swapAge / 0.07;
      } else if (pet.swapAge < 0.16) eyeClose = 1 - (pet.swapAge - 0.07) / 0.09;
      const face = { ...fc, eyes, gap: pet.gap.map((g) => Math.min(64, g + pet.talkK * 12)), blush: pet.blushK };
      const gesture = pet.pulse ? { kind: pet.pulse.kind, k: clamp((T - pet.pulse.t0) / pet.pulse.dur, 0, 1) } : null;
      custom.draw(petG, face, {
        look: pet.look,
        legs,
        low: pet.low,
        t: T,
        blink,
        eyeClose,
        acc: skin,
        swing: pet.swing,
        face: fname,
        mode: pet.mode,
        modeT: pet.modeT,
        talk: pet.talkK,
        status: pet.status,
        drowse: pet.drowse,
        sit: pet.sitK,
        facing: pet.faceVis,
        tilt: pet.tilt,
        lean,
        groupRot: rot,
        gesture
      });
      const footY = drag ? pet.dy + 220 * S * 1.09 : pet.fy;
      const shadowY = freeGround && drag ? footY + 40 * S : groundY();
      const k = clamp(1 - (shadowY - footY) / 420, 0.3, 1);
      shadowEl.setAttribute("cx", f(AX));
      shadowEl.setAttribute("cy", f(shadowY - 2));
      shadowEl.setAttribute("rx", f(72 * S * k * (1 + pet.sq * 0.5)));
      shadowEl.setAttribute("ry", f(10 * S * k + 1));
      shadowEl.setAttribute("opacity", f(k));
      let s = "";
      const sc = S / 0.48;
      const zPaint = custom?.colors?.z ? `stroke="${custom.colors.z}"` : 'class="eye"';
      for (const p of P) {
        const a = p.age / p.life;
        if (p.type === "z") {
          const op = a < 0.15 ? a / 0.15 : 1 - (a - 0.15) / 0.85, z = (0.7 + 0.9 * a) * sc;
          s += `<path ${zPaint} fill="none" stroke-width="${f(3 / z)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 2.5) * 6)} ${f(p.y)}) scale(${f(z)})" d="M-6 -7H6L-6 7H6"/>`;
        } else if (p.type === "heart") {
          s += `<path class="p-heart" fill="none" stroke-width="5" stroke-linejoin="round" opacity="${f(1 - a * a)}" transform="translate(${f(p.x + Math.sin(p.age * 4) * 5)} ${f(p.y)}) scale(${f((0.45 + 0.35 * a) * sc)})" d="${heartD(0, 0, 1)}"/>`;
        } else if (p.type === "dust") {
          s += `<circle class="p-dust" fill="none" stroke-width="2" cx="${f(p.x)}" cy="${f(p.y)}" r="${f((3 + 8 * a) * sc)}" opacity="${f(0.7 * (1 - a))}"/>`;
        } else if (p.type === "note") {
          const op = a < 0.15 ? a / 0.15 : 1 - (a - 0.15) / 0.85, z = (0.8 + 0.4 * a) * sc;
          s += `<g opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 3) * 8)} ${f(p.y)}) scale(${f(z)})"><path ${zPaint} fill="none" stroke-width="2.4" stroke-linecap="round" d="M3 4V-9L9 -6"/><circle ${zPaint} fill="none" stroke-width="3.6" cx="0" cy="4.5" r="1.8"/></g>`;
        } else if (p.type === "drop") {
          s += `<path class="tearf" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(0.9 * sc)})" d="${DROP}"/>`;
        }
      }
      fxG.innerHTML = s;
      return fname;
    }
    const now = (p) => p?.t ?? performance.now();
    function velocity() {
      const s = pointer.samples;
      if (s.length < 2) return { x: 0, y: 0 };
      const a = s[0], b = s[s.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1e3);
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    }
    function grab() {
      const scruff = toStage(128, 36);
      pet.expr = null;
      setMode("drag", { dx: scruff.x, dy: scruff.y });
      play("grab", "touch");
      pet.sqv -= 1.2;
      pet.tiltV = 0;
      onEvent("touch", { kind: "grab" });
    }
    function pointerDown(p) {
      Object.assign(pointer, { x: p.x, y: p.y, inside: true });
      if (!hitPet(p)) return false;
      press = { x: p.x, y: p.y, t: now(p) };
      pointer.samples = [{ t: now(p), x: p.x, y: p.y }];
      if (pet.mode === "air") grab();
      return true;
    }
    function pointerMove(p) {
      const t = now(p);
      const ddx = p.x - pointer.x, ddy = p.y - pointer.y;
      Object.assign(pointer, { x: p.x, y: p.y, inside: true });
      pointer.samples.push({ t, x: p.x, y: p.y });
      while (pointer.samples.length > 2 && t - pointer.samples[0].t > 110) pointer.samples.shift();
      pointer.vx = lerp(pointer.vx, velocity().x, 0.35);
      if (press && pet.mode !== "drag" && Math.hypot(p.x - press.x, p.y - press.y) > 6) grab();
      if (press) return pet.cursor = "grabbing";
      const over = hitPet(p);
      if (over && ["idle", "look", "sit", "sleep"].includes(pet.mode)) {
        strokeAcc += Math.hypot(ddx, ddy);
        if (strokeAcc > 320 && petCool <= 0) {
          strokeAcc = 0;
          petCool = 2.5;
          play("purr", "touch");
          if (pet.mode === "sleep") emitHeart();
          else setExpr(Math.random() < 0.5 ? "love" : "shy");
          onEvent("touch", { kind: "pet", asleep: pet.mode === "sleep" });
        }
      }
      return pet.cursor = over ? "grab" : "";
    }
    function pointerUp(p) {
      pet.cursor = "";
      if (!press) return;
      if (pet.mode === "drag") {
        const foot = toStage(128, 256);
        const v = velocity();
        pet.x = clamp(foot.x, minX(), maxX());
        const speed = Math.hypot(v.x, v.y);
        if (freeGround) {
          pet.gy = clamp(foot.y, minY(), floorY);
          pet.fy = Math.min(pet.gy, foot.y);
          pet.vx = clamp(v.x, -1800, 1800);
          pet.gvy = clamp(v.y, -1800, 1800) * 0.6;
          pet.vy = -Math.min(1400, speed * 0.6);
        } else {
          pet.fy = Math.min(floorY, foot.y);
          pet.vx = clamp(v.x, -1800, 1800);
          pet.vy = clamp(v.y, -1800, 1400);
        }
        pet.airKind = "throw";
        if (speed > 700) play("whoosh", "move");
        setMode("air");
        onEvent("touch", { kind: speed > 700 ? "throw" : "drop", x: Math.round(pet.x) });
      } else if (now(p) - press.t < 400) {
        if (pet.mode === "sleep" || pet.mode === "sit") {
          const wasAsleep = pet.mode === "sleep";
          setMode("wake", { startle: true });
          pet.sqv -= 2.2;
          pet.nextAt = T + 2.4;
          play("surprised", "face");
          onEvent("touch", { kind: "poke", woke: wasAsleep });
        } else if (pet.mode !== "dizzy") {
          play("poke", "touch");
          const r = ["happy", "wink", "surprised", "love", "angry"][Math.floor(Math.random() * 5)];
          setExpr(r);
          if (Math.random() < 0.5 && pet.mode === "idle") setMode("crouch", { jumpV: 480, jumpVx: 0 });
          onEvent("touch", { kind: "poke" });
        }
      }
      press = null;
    }
    function dropAt(p) {
      press = null;
      if (pet.mode !== "drag") return;
      Object.assign(pointer, { x: p.x, y: p.y, vx: 0, samples: [] });
      pet.x = clamp(p.x, minX(), maxX());
      pet.fy = Math.min(floorY, p.y + 220 * S);
      if (freeGround) pet.gy = clamp(pet.fy, minY(), floorY);
      pet.vx = 0;
      pet.vy = 0;
      pet.gvy = 0;
      pet.airKind = "drop";
      setMode("air");
      onEvent("touch", { kind: "drop", x: Math.round(pet.x) });
    }
    function shiftDrag(dx, dy) {
      if (pet.mode !== "drag") return;
      pet.dx += dx;
      pet.dy += dy;
      pet.x += dx;
      pointer.x += dx;
      pointer.y += dy;
      for (const s of pointer.samples) {
        s.x += dx;
        s.y += dy;
      }
      if (press) {
        press.x += dx;
        press.y += dy;
      }
    }
    function pointerLeave() {
      if (!press) pointer.inside = false;
    }
    const anchor = () => toStage(A.bubble[0], A.bubble[1] + pet.low);
    function layout() {
      const [x0, y0, x1, y1] = custom?.extent ?? EXTENT;
      const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => toStage(x, y));
      const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
      const side = toStage(128, 128 + pet.low);
      return {
        x: pet.x,
        ...freeGround ? { y: pet.gy } : {},
        facing: pet.facing,
        mode: pet.mode,
        busy: busy(),
        pressing: !!press,
        cursor: pet.cursor,
        moving: !!press || MOVING_MODES.has(pet.mode) || !!pet.pulse || Math.abs(pet.faceVis - pet.facing) > 0.05,
        box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
        hit: hits(),
        bubble: anchor(),
        side: { x: side.x, y: side.y, reach: 104 * S }
      };
    }
    resize();
    custom?.setSkin?.(skin);
    return {
      pet,
      step,
      render,
      resize,
      act,
      setExpr,
      doWord,
      walkTo,
      stopWalk,
      toStage,
      hitPet,
      busy,
      layout,
      pointerDown,
      pointerMove,
      pointerUp,
      pointerLeave,
      dropAt,
      shiftDrag,
      get pressing() {
        return !!press;
      },
      /** Pressed, carried, airborne, walking, running, dancing, turning round, or in a short gesture (nod, wave, bow…): motion that frames far apart show as jumps. */
      get moving() {
        return !!press || MOVING_MODES.has(pet.mode) || !!pet.pulse || Math.abs(pet.faceVis - pet.facing) > 0.05;
      },
      get time() {
        return T;
      },
      get bounds() {
        return { W, H, floorY, S, minX: minX(), maxX: maxX(), minY: minY() };
      },
      /** A free body stands anywhere on the stage (`opts.ground`). */
      freeGround,
      setSkin(s) {
        skin = s;
        custom?.setSkin?.(s);
      },
      /** Swaps the body's drawing (see `opts.figure`). */
      setFigure(fig) {
        if (fig === custom) return;
        custom?.dispose?.();
        custom = fig;
        custom.setSkin?.(skin);
        A = anchors();
        petG.textContent = "";
        render();
      },
      get figure() {
        return custom;
      },
      get skin() {
        return skin;
      },
      setRoam(r) {
        roam = r;
        if (r !== "off") pet.nextAt = T + 1;
      },
      get roam() {
        return roam;
      },
      /** Outside orders keep free roaming quiet for `seconds`. */
      holdRoam(seconds) {
        hold = Math.max(hold, T + seconds);
      },
      talk() {
        pet.talkK = 1;
      },
      setListening(on) {
        pet.listening = on;
        if (on && (pet.mode === "walk" || pet.mode === "run")) setMode("idle");
      },
      setThinking(on) {
        pet.thinking = on;
      },
      /** What the bot is busy with as the page's status bubble names it (`kind`), or null; the figure reads it from `frame.status`. */
      setStatus(kind) {
        pet.status = typeof kind === "string" ? kind : null;
      },
      /** The page shows the bot's thinking in a bubble of its own. */
      setThoughtShown(on) {
        pet.thoughtShown = on;
      },
      anchor,
      emitHeart
    };
  }

  // coopanion/whale/figure.js
  var import_meta = {};
  var f1 = (n) => Math.round(n * 100) / 100;
  var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
  var lerp2 = (a, b, k) => a + (b - a) * k;
  var ease2 = (rate, dt) => 1 - Math.exp(-rate * dt);
  var bump = (u) => Math.sin(Math.PI * clamp2(u, 0, 1));
  var smooth2 = (a, b, x) => {
    const k = clamp2((x - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  };
  var SVGNS = "http://www.w3.org/2000/svg";
  var FACE = { x: 520, y: 578, w: 390, h: 252 };
  var HEAD = [30, 12, 215, 168];
  function hinge([px, py], a, ty) {
    const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
    return (u, v, x, y) => {
      const w = smooth2(py - 6, py + 14, y), lx = x - px, ly = y - py;
      return [(lx * c - ly * s - lx) * w, (lx * s + ly * c - ly + ty) * w];
    };
  }
  var badTargetLogged = false;
  function spring(k, c, lim = Infinity) {
    return {
      x: 0,
      v: 0,
      step(target, dt) {
        if (!Number.isFinite(target) || !Number.isFinite(dt)) {
          if (!badTargetLogged) {
            badTargetLogged = true;
            console.warn(`[\u5927\u80A5\u9C7C] \u5F39\u7C27\u6536\u5230\u7684\u76EE\u6807\u4E0D\u662F\u6709\u9650\u6570,\u8FD9\u4E00\u5E27\u4E0D\u52A8:target=${target} dt=${dt}`);
          }
          return this.x;
        }
        this.v += ((target - this.x) * k - this.v * c) * dt;
        this.x += this.v * dt;
        if (Math.abs(this.x) > lim) {
          this.x = Math.sign(this.x) * lim;
          this.v = 0;
        }
        return this.x;
      }
    };
  }
  function loadImage(url) {
    return new Promise((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = bad;
      im.src = url;
    });
  }
  async function createWhaleFigure(base = new URL("./", import_meta.url), opts = {}) {
    const createRig2 = opts.kit?.createRig ?? (await Promise.resolve().then(() => (init_rig(), rig_exports))).createRig;
    const model = opts.model || await (await fetch(new URL("model.json", base))).json();
    const asset = opts.asset || ((p) => new URL(p, base));
    const load = opts.loadImage || loadImage;
    const { S, X0, FEET } = model.units;
    const U = (x) => 128 + (x - X0) * S, V = (y) => 256 - (FEET - y) * S;
    const feat = model.feat;
    const EYES = ["eyeL", "eyeR"];
    const featNames = [...Object.keys(feat.sprites), ...EYES.flatMap((k) => ["lash", "ball", "iris", ...feat.eyes[k].rim ? ["rim"] : []].map((n) => `${k}_${n}`))];
    const SCHEMES = (model.schemes || [{ id: "deepseek" }]).filter((sc) => sc.ready !== false);
    const schemeInfo = (id) => SCHEMES.find((sc) => sc.id === id) || SCHEMES[0];
    const OUTFITS = model.outfits || [{ id: "maid" }];
    const outfitInfo = (id) => OUTFITS.find((o) => o.id === id) || OUTFITS[0];
    const pickOf = (id) => {
      const [c, o] = String(id ?? "").split("-");
      return { scheme: schemeInfo(c).id, outfit: outfitInfo(o).id };
    };
    const partsOf = (id) => outfitInfo(id).parts || model.parts;
    const accent = () => schemeInfo(scheme).accent || "#4d6bfe";
    const loaded = {}, ready = {};
    function loadScheme(sc, of) {
      const key = `${sc}-${of}`;
      if (loaded[key]) return loaded[key];
      const dir = sc === SCHEMES[0].id ? "" : `schemes/${sc}/`;
      const set = { tex: {}, img: {} };
      loaded[key] = Promise.all([
        // an outfit's own part with a `src` is drawn in the outfit's colours
        ...partsOf(of).map(async (p) => {
          set.tex[p.tex] = await load(asset(p.src || `${dir}tex/${p.tex}.png`));
        }),
        ...featNames.map(async (n) => {
          set.img[n] = await load(asset(`${dir}feat/${n}.png`));
        }),
        // a scheme with `eyeHighlights` has each eye's highlights as their own sprite and an iris without them
        ...schemeInfo(sc).eyeHighlights ? EYES.map(async (k) => {
          set.img[`${k}_hl`] = await load(asset(`${dir}feat/${k}_hl.png`));
        }) : []
      ]).then(() => ready[key] = set);
      return loaded[key];
    }
    let { scheme, outfit } = pickOf(opts.scheme);
    let { tex, img } = await loadScheme(scheme, outfit);
    const BROWS = [
      { outer: [610, 559.5], inner: [703, 548.7], x0: 596, x1: 765 },
      // near
      { outer: [890, 560.8], inner: [837, 555.6], x0: 765, x1: 904 }
      // far
    ];
    function layoutOf(of) {
      const list = partsOf(of);
      const PV = { ...model.pivots, ...outfitInfo(of).pivots };
      const box = Object.fromEntries([...model.parts, ...list].map((p) => [p.id, p.box]));
      const rectOf = (id) => {
        const [x, y, w, h] = box[id];
        return [x, y, x + w, y + h];
      };
      const deformers = {
        body: { kind: "rot", pivot: PV.body },
        skirt: { kind: "warp", parent: "body", rect: rectOf("skirt") },
        skirtSit: { kind: "warp", parent: "body", rect: rectOf("skirt_sit") },
        // the upper body (bodice, arms, head) turns about the waist for a bow; the skirt and legs stay put
        waist: { kind: "rot", parent: "body", pivot: PV.waist },
        armNear: { kind: "rot", parent: "waist", pivot: PV.armNear },
        armFar: { kind: "rot", parent: "waist", pivot: PV.armFar },
        // the legs swing about the hip (see `hinge`), as warps so the bloomer above it stays under the skirt
        legBack: { kind: "warp", parent: "body", rect: rectOf("leg_back") },
        legFront: { kind: "warp", parent: "body", rect: rectOf("leg_front") },
        tail: { kind: "rot", parent: "body", pivot: PV.tail },
        tailBend: { kind: "warp", parent: "tail", rect: rectOf("tail") },
        neck: { kind: "rot", parent: "waist", pivot: PV.neck },
        headBack: { kind: "warp", parent: "neck", rect: HEAD },
        headMid: { kind: "warp", parent: "neck", rect: HEAD },
        headFeat: { kind: "warp", parent: "neck", rect: HEAD },
        headFront: { kind: "warp", parent: "neck", rect: HEAD },
        hairSway: { kind: "warp", parent: "headBack", rect: rectOf("hair_back") },
        bangsSway: { kind: "warp", parent: "headFront", rect: rectOf("bangs") },
        finNear: { kind: "rot", parent: "headMid", pivot: PV.finNear },
        finFar: { kind: "rot", parent: "headBack", pivot: PV.finFar },
        ahoge: { kind: "rot", parent: "headFront", pivot: PV.ahoge }
      };
      const swings = outfitInfo(of).deformers || {};
      for (const [k, d] of Object.entries(swings)) deformers[k] = { kind: "rot", parent: d.parent, pivot: d.pivot };
      const parts = list.map((p) => ({ ...p, parent: p.id === "torso_up" ? "waist" : p.parent }));
      parts.push({ id: "faceFx", tex: "faceFx", box: [U(FACE.x), V(FACE.y), FACE.w * S, FACE.h * S], z: 9, parent: "headFeat", grid: [4, 4] });
      const brows = parts.find((p) => p.id === "brows");
      if (brows) {
        parts.splice(parts.indexOf(brows), 1);
        const [bx, by, bw, bh] = brows.box;
        BROWS.forEach((b, i) => {
          const x0 = Math.max(bx, U(b.x0)), x1 = Math.min(bx + bw, U(b.x1)), u0 = (x0 - bx) / bw, u1 = (x1 - bx) / bw;
          const mid = [U((b.outer[0] + b.inner[0]) / 2), V((b.outer[1] + b.inner[1]) / 2)];
          deformers[`brow${i}`] = { kind: "rot", parent: "headFeat", pivot: mid };
          deformers[`browBend${i}`] = { kind: "warp", parent: `brow${i}`, rect: [x0, by, x1, by + bh] };
          deformers[`browOver${i}`] = { kind: "rot", parent: `browBend${i}`, pivot: mid };
          for (const [layer, z, alpha] of [["", brows.z, 1], ["_through", 13.2, 0.55]]) {
            parts.push({ ...brows, id: `brow${i}${layer}`, box: [x0, by, x1 - x0, bh], uvBox: [u0, 0, u1, 1], parent: `browBend${i}`, z, alpha, grid: [12, 2] });
            parts.push({ ...brows, id: `browOver${i}${layer}`, box: [x0, 2 * mid[1] - by - bh, x1 - x0, bh], uvBox: [u0, 1, u1, 0], parent: `browOver${i}`, z, alpha, grid: [12, 2] });
          }
        });
      }
      const creases = parts.find((p) => p.id === "eye_creases");
      if (creases) {
        deformers.creases = { kind: "warp", parent: "headFeat", rect: rectOf("eye_creases") };
        creases.parent = "creases";
      }
      const heldArms = outfitInfo(of).heldArms ?? 1;
      const tailRoot = outfitInfo(of).tailRoot ? { x: PV.tail[0], tip: rectOf("tail")[0] } : null;
      return { PV, deformers, parts, brows, creases, swings, heldArms, tailRoot };
    }
    let L = layoutOf(outfit);
    const faceCv = document.createElement("canvas");
    faceCv.width = FACE.w;
    faceCv.height = FACE.h;
    const faceCv2 = document.createElement("canvas");
    faceCv2.width = FACE.w;
    faceCv2.height = FACE.h;
    const fg1 = faceCv.getContext("2d"), fg2 = faceCv2.getContext("2d");
    let fg = fg1;
    const eyeCv = document.createElement("canvas");
    const INK = "#5a2330";
    const poly2 = (c, x) => c[0] * x * x + c[1] * x + c[2];
    const EYE = Object.fromEntries(EYES.map((k) => {
      const e = feat.eyes[k], [x0, , x1] = e.ball;
      let h = 0;
      for (let x = x0 + 4; x < x1 - 4; x += 2) h = Math.max(h, poly2(e.rimFit, x) - poly2(e.lidFit, x));
      const cx = (e.iris[0] + e.iris[2]) / 2;
      return [k, { ...e, travel: h + 2, cx, cy: poly2(e.lidFit, cx) }];
    }));
    const hl = { dx: 0, dy: 0, scale: 1, quiver: 0, alpha: 1 };
    const HL_MOOD = {
      sad: { scale: 1.12, quiver: 1 },
      worried: { scale: 1.1, quiver: 0.8 },
      shy: { scale: 1.1, quiver: 0.6 },
      pout: { scale: 1.06, quiver: 0.4 },
      excited: { scale: 1.18 },
      listening: { scale: 1.06 },
      angry: { scale: 0.78 },
      determined: { scale: 0.86 },
      sleepy: { scale: 0.92, alpha: 0.7 },
      content: { alpha: 0.8 },
      waking: { alpha: 0.75 }
    };
    function paintOpenEye(k, open, ix, iy, tilt, glint = 0, t = 0) {
      const e = EYE[k], [bx0, by0, bx1, by1] = e.ball, w = bx1 - bx0, h = by1 - by0;
      if (eyeCv.width !== w + 40 || eyeCv.height !== h + 40) {
        eyeCv.width = w + 40;
        eyeCv.height = h + 40;
      }
      const g = eyeCv.getContext("2d");
      g.setTransform(1, 0, 0, 1, 20 - bx0, 20 - by0);
      g.clearRect(bx0 - 20, by0 - 20, w + 40, h + 40);
      g.globalCompositeOperation = "source-over";
      g.drawImage(img[`${k}_ball`], bx0, by0);
      g.globalCompositeOperation = "source-atop";
      g.drawImage(img[`${k}_iris`], e.iris[0] + ix, e.iris[1] + iy);
      const d = (1 - clamp2(open, 0, 1)) * e.travel, tn = Math.tan(tilt);
      const hlImg = img[`${k}_hl`];
      if (hlImg && e.hl) {
        const gx = k === "eyeL" ? 1 : 0.35, ph = k === "eyeL" ? 0 : 1.7, q = hl.quiver;
        const w2 = hlImg.width * hl.scale, h2 = hlImg.height * hl.scale;
        const cx = (e.hl[0] + e.hl[2]) / 2 + ix + (hl.dx + q * 0.8 * Math.sin(t * 29 + ph)) * gx;
        let cy = (e.hl[1] + e.hl[3]) / 2 + iy + hl.dy + q * 0.6 * Math.sin(t * 37 + ph);
        const lid = poly2(e.lidFit, clamp2(cx, bx0, bx1)) + d + tn * (cx - e.cx) + 2;
        if (cy - h2 / 2 < lid) cy = Math.max(cy, Math.min(lid + h2 / 2, (e.iris[1] + e.iris[3]) / 2 + iy));
        g.globalAlpha = hl.alpha;
        g.drawImage(hlImg, cx - w2 / 2, cy - h2 / 2, w2, h2);
        g.globalAlpha = 1;
      }
      if (e.rim) {
        g.globalCompositeOperation = "source-over";
        g.drawImage(img[`${k}_rim`], e.rim[0], e.rim[1]);
      }
      if (glint > 0) {
        g.globalCompositeOperation = "source-atop";
        const sc = k === "eyeL" ? 1 : 0.6, ic = [(e.iris[0] + e.iris[2]) / 2 + ix, (e.iris[1] + e.iris[3]) / 2 + iy];
        [[-0.16, -0.2, 24], [0.2, 0.2, 13]].forEach(([fx2, fy, r], j) => {
          const R = r * glint * (0.8 + 0.3 * Math.sin(t * 7 + j * 2 + (k === "eyeL" ? 0 : 1))), w2 = R * 0.28;
          const cx = ic[0] + fx2 * (e.iris[2] - e.iris[0]), cy = ic[1] + fy * (e.iris[3] - e.iris[1]);
          g.save();
          g.translate(cx, cy);
          g.scale(sc, 1);
          g.fillStyle = "rgba(255,255,255,.95)";
          g.beginPath();
          g.moveTo(0, -R);
          g.quadraticCurveTo(w2, -w2, R, 0);
          g.quadraticCurveTo(w2, w2, 0, R);
          g.quadraticCurveTo(-w2, w2, -R, 0);
          g.quadraticCurveTo(-w2, -w2, 0, -R);
          g.fill();
          g.restore();
        });
      }
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      g.moveTo(bx0 - 20, by0 - 20);
      for (let x = bx0 - 20; x <= bx1 + 20; x += 3) g.lineTo(x, poly2(e.lidFit, clamp2(x, bx0, bx1)) + d + tn * (x - e.cx) - 1);
      g.lineTo(bx1 + 20, by0 - 20);
      g.closePath();
      g.fill();
      g.globalCompositeOperation = "source-over";
      fg.drawImage(eyeCv, bx0 - 20 - FACE.x, by0 - 20 - FACE.y);
      const L2 = e.lash, sy = 0.55 + 0.45 * clamp2(open, 0, 1);
      fg.save();
      fg.translate(e.cx - FACE.x, e.cy + d - FACE.y);
      fg.rotate(tilt);
      fg.scale(1, sy);
      fg.drawImage(img[`${k}_lash`], L2[0] - e.cx, L2[1] - e.cy);
      fg.restore();
    }
    const MOUTH_DY = { happy_mouth: 9, drag_mouth: 16, sleep_mouth: 4 };
    function sprite(name, o = {}) {
      const b = feat.sprites[name];
      if (!b) return;
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      fg.save();
      fg.globalAlpha = o.alpha ?? 1;
      fg.translate(cx - FACE.x, cy + (MOUTH_DY[name] || 0) - FACE.y);
      if (o.rot) fg.rotate(o.rot);
      fg.scale(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1);
      fg.drawImage(img[name], b[0] - cx, b[1] - cy);
      fg.restore();
    }
    const CHEEKS = [[618, 770, 40, 20], [852, 762, 22, 15]];
    function paintBlush(a) {
      if (a < 0.02) return;
      for (const [x, y, rx, ry] of CHEEKS) {
        fg.save();
        fg.translate(x - FACE.x, y - FACE.y);
        fg.scale(1, ry / rx);
        const gr = fg.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, `rgba(255,120,140,${f1(0.55 * a)})`);
        gr.addColorStop(1, "rgba(255,120,140,0)");
        fg.fillStyle = gr;
        fg.beginPath();
        fg.arc(0, 0, rx, 0, Math.PI * 2);
        fg.fill();
        fg.restore();
      }
    }
    function lineMouth(form, w = 1) {
      const cx = 766 - FACE.x, cy = 772 - FACE.y;
      fg.save();
      fg.strokeStyle = INK;
      fg.lineWidth = 3;
      fg.lineCap = "round";
      fg.beginPath();
      fg.moveTo(cx - 9 * w, cy - form * 3);
      fg.quadraticCurveTo(cx, cy + form * 5, cx + 9 * w, cy - form * 3);
      fg.stroke();
      fg.restore();
    }
    const MOUTH = {
      neutral: "neutral_mouth",
      happy: "happy_mouth",
      wink: ["happy_mouth", 0.8],
      love: "love_mouth",
      shy: ["drag_mouth", 0.7],
      surprised: "surprised_mouth",
      sleepy: "sleep_mouth",
      sleep: "sleep_mouth",
      dizzy: "dizzy_mouth",
      dragged: "drag_mouth",
      content: "neutral_mouth",
      waking: ["surprised_mouth", 0.6],
      squeeze: "sleep_mouth",
      listening: "neutral_mouth",
      thinking: "sleep_mouth",
      run: ["happy_mouth", 0.7],
      angry: -1,
      sad: -1.2,
      smug: 0.7,
      pout: ["surprised_mouth", 0.45],
      worried: ["drag_mouth", 0.6],
      determined: 0.15,
      flustered: ["drag_mouth", 0.8],
      scared: ["drag_mouth", 0.8],
      excited: "happy_mouth",
      cry: ["surprised_mouth", 0.8],
      confused: -0.35
    };
    const TEAR_END = { eyeL: 816, eyeR: 786 };
    function paintStreams(t) {
      fg.save();
      EYES.forEach((k, i) => {
        const e = EYE[k], [bx0, , bx1, by1] = e.ball, w = (bx1 - bx0) * (k === "eyeL" ? 0.22 : 0.2);
        const x = bx0 + (bx1 - bx0) * (k === "eyeL" ? 0.55 : 0.5) - FACE.x, y0 = by1 - 6 - FACE.y;
        const y1 = Math.min(FACE.h - 4, TEAR_END[k] - FACE.y, y0 + 110), wob = 4 * Math.sin(t * 6 + i);
        const gr = fg.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, "rgba(120,195,255,.95)");
        gr.addColorStop(1, "rgba(120,195,255,.3)");
        fg.fillStyle = gr;
        fg.beginPath();
        fg.moveTo(x - w * 0.15, y0);
        fg.bezierCurveTo(x - w * 0.5 + wob, y0 + 25, x - w * 0.55 + wob, y1 - 20, x - w * 0.4, y1);
        fg.quadraticCurveTo(x, y1 + 6, x + w * 0.4, y1);
        fg.bezierCurveTo(x + w * 0.55 + wob, y1 - 20, x + w * 0.5 + wob, y0 + 25, x + w * 0.15, y0);
        fg.closePath();
        fg.fill();
      });
      fg.restore();
    }
    function paintFace(fc, face, o, t) {
      fg.setTransform(1, 0, 0, 1, 0, 0);
      fg.clearRect(0, 0, FACE.w, FACE.h);
      paintBlush(fc.blush || 0);
      if (fc.streams) paintStreams(t);
      const shut = Math.max(o.blink || 0, o.eyeClose || 0);
      const lx = clamp2(o.look[0], -6, 6), ly = clamp2(o.look[1], -5, 5);
      const tilt = fc.brows === "angry" ? 0.2 : fc.brows === "sad" ? -0.16 : 0;
      fc.eyes.forEach((e, i) => {
        const k = EYES[i], side = k === "eyeL" ? 1 : -1;
        const squash = { sy: 1 - 0.85 * (o.eyeClose || 0) };
        if ((face === "surprised" || fc.wide) && e.shape === "ring") {
          sprite(`surprised_${k}`, squash);
          return;
        }
        switch (e.shape) {
          case "ring":
          case "lid": {
            const open2 = (e.shape === "ring" ? clamp2(e.ry / e.rx, 0, 1) * (tilt ? 0.8 : 1) : clamp2(e.ry / 16, 0, 1)) * (1 - shut);
            const gx = k === "eyeL" ? 1 : 0.35;
            const ix = clamp2((lx + (e.dx || 0)) * gx, -6 * gx, 6 * gx), iy = clamp2(ly * 0.7 + (e.dy || 0) * 0.7, -3.5, 3.5);
            paintOpenEye(k, open2, ix, iy + (e.shape === "lid" ? 3 : 0), tilt * side, fc.sparkle ? 1 : 0, t);
            break;
          }
          case "up":
            sprite(`happy_${k}`, squash);
            break;
          case "down":
            sprite(`sleep_${k}`, squash);
            break;
          case "gt":
          case "lt":
            sprite(`drag_${k}`, { s: 1 + 0.03 * Math.sin(t * 22 + i) });
            break;
          case "heart":
            sprite(`love_${k}`, { s: 0.94 + 0.06 * (e.s ?? 1) / 0.8 });
            break;
          case "spiral":
            sprite(`dizzy_${k}`, { rot: (e.rot || 0) * 0.6 });
            break;
        }
      });
      const talk = o.talk || 0;
      const gapOpen = clamp2((Math.max(fc.gap[0], fc.gap[1]) - 50) / 14, 0, 1);
      const m = MOUTH[face] ?? "neutral_mouth";
      const open = Math.max(talk * (0.45 + 0.45 * Math.abs(Math.sin(t * 17))), face === "sleepy" || face === "waking" ? gapOpen : 0);
      if (open > 0.12) sprite(face === "surprised" ? "surprised_mouth" : "happy_mouth", { sy: 0.35 + 0.65 * open, sx: 0.85 + 0.15 * open });
      else if (typeof m === "number") lineMouth(m);
      else if (Array.isArray(m)) sprite(m[0], { s: m[1] });
      else sprite(m);
    }
    const VIEW = model.view;
    let fo = null, canvas = null, fxG = null, rig = null, mountedIn = null, pxScale = 0, frameN = 0;
    function mount(petG) {
      petG.textContent = "";
      rig?.dispose();
      rig = null;
      const box = (el) => {
        el.setAttribute("x", VIEW[0]);
        el.setAttribute("y", VIEW[1]);
        el.setAttribute("width", VIEW[2] - VIEW[0]);
        el.setAttribute("height", VIEW[3] - VIEW[1]);
        return el;
      };
      canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      if (opts.raster) {
        fo = box(document.createElementNS(SVGNS, "image"));
      } else {
        fo = box(document.createElementNS(SVGNS, "foreignObject"));
        canvas.style.cssText = "width:100%;height:100%;display:block";
        fo.appendChild(canvas);
      }
      fxG = document.createElementNS(SVGNS, "g");
      petG.append(fo, fxG);
      rig = createRig2(canvas, { deformers: L.deformers, parts: L.parts, view: VIEW });
      for (const n in tex) rig.upload(n, tex[n]);
      if (fade) for (const n in fade.set.tex) rig.upload(n + "@mix", fade.set.tex[n]);
      mountedIn = petG;
      pxScale = 0;
    }
    let fade = null;
    function endFade() {
      if (!fade) return;
      tex = fade.set.tex;
      img = fade.set.img;
      fade = null;
      if (rig) for (const n in tex) rig.upload(n, tex[n]);
    }
    function setScheme(id, o = {}) {
      const next = pickOf(id), key = `${next.scheme}-${next.outfit}`;
      const apply = (set) => {
        endFade();
        if (scheme === next.scheme && outfit === next.outfit && tex === set.tex) return;
        scheme = next.scheme;
        if (outfit !== next.outfit) {
          outfit = next.outfit;
          L = layoutOf(outfit);
          tex = set.tex;
          img = set.img;
          rig?.dispose();
          rig = null;
          mountedIn = null;
          return;
        }
        if (o.fade > 0 && rig) {
          fade = { set, dur: o.fade, t0: o.at ?? null };
          for (const n in set.tex) rig.upload(n + "@mix", set.tex[n]);
          return;
        }
        tex = set.tex;
        img = set.img;
        if (rig) for (const n in tex) rig.upload(n, tex[n]);
      };
      if (ready[key]) {
        apply(ready[key]);
        return Promise.resolve();
      }
      return loadScheme(next.scheme, next.outfit).then(apply);
    }
    let decoded = null;
    let fixedRes = 0;
    function fitCanvas() {
      const m = fixedRes ? null : mountedIn.getScreenCTM();
      if (!m && !fixedRes) return;
      const k = fixedRes || Math.hypot(m.c, m.d) * (window.devicePixelRatio || 1) * 1.25;
      if (Math.abs(k - pxScale) / (pxScale || 1) < 0.08) return;
      pxScale = k;
      canvas.width = Math.max(16, Math.round((VIEW[2] - VIEW[0]) * Math.min(k, 6)));
      canvas.height = Math.max(16, Math.round((VIEW[3] - VIEW[1]) * Math.min(k, 6)));
    }
    const sp = {
      hair: spring(55, 7, 1.8),
      hairY: spring(50, 8, 1.2),
      bangs: spring(110, 10, 1.6),
      skirt: spring(100, 9, 1.6),
      skirtY: spring(90, 10, 1.1),
      tail: spring(40, 5, 32),
      fins: spring(90, 9, 30),
      ahoge: spring(140, 6, 38),
      head: spring(70, 10, 16),
      armN: spring(60, 9, 125),
      armF: spring(60, 9, 95),
      hlX: spring(160, 9, 3),
      hlY: spring(160, 9, 3)
    };
    let lastT = null, prevTilt = 0, prevYaw = 0, prevLow = 0, headTilt = 0, fx = "";
    let prevLook = null, prevShut = 0;
    let rootWas = {};
    const GROUP = { air: [1, 1], drag: [1, 1], crouch: [1, 1], land: [1, 1], walk: [1, 0.5], run: [1, 0.5], dance: [0.6, 0] };
    let wTilt = 0, wLean = 0, facing = 1;
    let finMood = 0, tailMood = 0, wagAmp = 0, sitK = 0, walkK = 0, runK = 0, swingK = 0;
    const groupTilt = (mode, tilt, lean) => tilt * wTilt + lean * wLean + runK * 14 * facing;
    const st = { z: {}, alpha: {} };
    const MOOD = {
      happy: [0.8, 1],
      love: [0.9, 1],
      wink: [0.5, 0.7],
      surprised: [1, 0.2],
      angry: [0.9, 0.15],
      sad: [-1, 0],
      shy: [-0.5, 0.3],
      sleepy: [-0.7, 0],
      sleep: [-0.9, 0],
      dizzy: [-0.3, 0],
      dragged: [0.6, 0.6],
      content: [-0.2, 0.25],
      listening: [0.6, 0.2],
      thinking: [0.1, 0.15],
      run: [0.2, 0.4],
      waking: [-0.4, 0],
      squeeze: [-0.3, 0],
      neutral: [0, 0.25],
      smug: [0.5, 0.6],
      pout: [0.3, 0],
      worried: [-0.3, 0.1],
      determined: [0.9, 0.3],
      flustered: [0.4, 0.8],
      scared: [-1, 0],
      excited: [1, 1],
      cry: [-1, 0],
      confused: [0.2, 0.1],
      bowing: [-0.2, 0.2]
    };
    const both = (y, a = 0, f2 = 0, x = 0) => [[y, a, f2, x], [y, a * 0.6, f2 * 0.6, x * 0.6]];
    const BROW = {
      surprised: both(32, 4, 12),
      excited: both(20, 2, 9),
      happy: both(9, 0, 6),
      love: both(9, 4, 6),
      listening: both(9, 0, 4),
      waking: both(6, 6),
      wink: [[9, 0, 6, 0], [-5, 0, 3, 0]],
      angry: both(-14, -44, -6, 8),
      determined: both(-6, -28, -3, 5),
      pout: both(-6, -22, -6, 5),
      run: both(2, -12, -3),
      squeeze: both(-12, -14, -8, 6),
      shy: both(0, 16, -4, 4),
      sad: both(-10, 30, -2, 6),
      cry: both(-10, 38, -4, 8),
      worried: both(-6, 24, 0, 5),
      scared: both(6, 26, 0, 5),
      flustered: both(2, 22, 0, 4),
      dragged: both(-4, 24, 0, 6),
      sleepy: both(-10, 2, -4),
      sleep: both(-10, 4, -2),
      content: both(-3, 0, 3),
      bowing: both(-3, 3),
      dizzy: [[12, 14, 0, 0], [-6, -10, 0, 0]],
      thinking: [[-6, -14, -4, 4], [14, 4, 6, 0]],
      smug: [[-8, -18, 0, 0], [14, -6, 4, 0]],
      confused: [[-10, -12, -4, 3], [22, 6, 8, 0]]
    };
    const BROW_OVER = /* @__PURE__ */ new Set(["sad", "cry", "worried", "scared", "flustered", "dragged"]);
    const BROW_RATE = { surprised: 18, scared: 18, excited: 14, angry: 16, dragged: 16, squeeze: 16, sad: 4, cry: 4, worried: 6, sleepy: 3, sleep: 3, content: 4 };
    const BROW_STILL = /* @__PURE__ */ new Set(["angry", "sad", "cry", "sleepy", "sleep", "squeeze", "dizzy"]);
    const HEAD_TILT = { shy: 7, thinking: -8, smug: -6, pout: -4, confused: -7, worried: 3, cry: 4 };
    const HEAD_PITCH = { sad: 0.35, cry: 0.45, worried: 0.15 };
    const BROW_SPLIT = U(765);
    const browNow = [[0, 0, 0, 0], [0, 0, 0, 0]];
    let browOver = 0;
    let browFlashAt = -Infinity, talkedAt = -Infinity;
    const lidDrop = (e, k, tilt) => {
      const open = e.shape === "ring" ? clamp2((e.ry ?? 16) / (e.rx ?? 16), 0, 1) * (tilt ? 0.8 : 1) : e.shape === "lid" ? clamp2(e.ry / 16, 0, 1) : 1;
      return EYE[k].travel * (1 - open) * 0.75;
    };
    const lidOpen = (e) => e.shape === "ring" || e.shape === "lid" ? 1 : 0;
    const creaseDrop = [0, 0];
    let creaseA = 1;
    function draw(petG, fc, o) {
      if (mountedIn !== petG || !petG.contains(fo)) mount(petG);
      if (frameN++ % 20 === 0) fitCanvas();
      const t = o.t, dt = lastT == null ? 1 / 60 : clamp2(t - lastT, 0, 0.05);
      lastT = t;
      const mode = o.mode || "idle", face = o.face || "neutral";
      facing = Math.sign(o.facing || 1);
      const walking = mode === "walk" || mode === "run", held = mode === "drag", airborne = mode === "air";
      sitK = lerp2(sitK, clamp2(o.sit ?? 0, 0, 1), ease2(12, dt));
      const low = o.low || 0;
      const lowV = (low - prevLow) / Math.max(dt, 1e-3);
      prevLow = low;
      const breath = Math.sin(t * (mode === "sleep" ? 1.7 : 2.4));
      let tiltT = o.look[0] * 0.7 + Math.sin(t * 0.9) * 1.2 + o.look[1] * 0.4;
      if (mode === "sleep") tiltT += 6;
      tiltT += HEAD_TILT[face] || 0;
      if (face === "dizzy") tiltT += 3 * Math.sin(t * 4.5);
      if (held) tiltT += o.swing * 0.25;
      headTilt = sp.head.step(tiltT, dt);
      const [gT, gL] = GROUP[mode] || [0, 0];
      const bend = (o.tilt ?? 0) * (1 - wTilt) + (o.lean ?? 0) * Math.sign(o.facing || 1) * (1 - wLean);
      wTilt = lerp2(wTilt, gT, ease2(10, dt));
      wLean = lerp2(wLean, gL, ease2(10, dt));
      const g = o.gesture, gk = g ? g.k : 0;
      const env = (a, b) => smooth2(0, a, gk) * (1 - smooth2(b, 1, gk));
      const nod = g?.kind === "nod" ? Math.sin(gk * Math.PI * 2) ** 2 * (1 - 0.3 * gk) : 0;
      const shake = g?.kind === "shake" ? Math.sin(gk * Math.PI * 6) * smooth2(0, 0.12, gk) * (1 - gk) : 0;
      const wave = g?.kind === "wave" ? env(0.15, 0.8) : 0;
      const bow = g?.kind === "bow" ? env(0.25, 0.7) : 0;
      const shiver = g?.kind === "shiver" ? env(0.08, 0.85) : 0;
      const flap = g?.kind === "flap" ? env(0.05, 0.75) : 0;
      const gNeck = nod * 7 + shake * 2.5 + bow * 10 + wave * 4, gYaw = shake * 1.1;
      const headA = headTilt + gNeck;
      const tiltVel = (headA - prevTilt) / Math.max(dt, 1e-3);
      prevTilt = headA;
      const yawVel = (gYaw - prevYaw) / Math.max(dt, 1e-3);
      prevYaw = gYaw;
      const angleX = clamp2(clamp2(o.look[0] / 5, -1, 1) * 0.9 + gYaw, -1.4, 1.4);
      const angleY = clamp2(clamp2(o.look[1] / 4, -1, 1) * 0.7 + (mode === "sleep" ? 0.8 : 0) + (HEAD_PITCH[face] || 0) + nod * 0.9 + bow * 0.5, -1.4, 1.4);
      const sway = clamp2(o.swing / 26, -1.6, 1.6);
      const up = airborne || held ? 1 : 0;
      const hair = sp.hair.step(sway * 1.1 - tiltVel * 4e-3 - yawVel * 0.02 + (walking ? -0.25 : 0) - runK * 0.5, dt);
      const hairY = sp.hairY.step(up * -1 + lowV * 6e-3, dt);
      const bangs = sp.bangs.step(sway * 0.7 - tiltVel * 4e-3 - yawVel * 0.03, dt);
      const skirt = sp.skirt.step(sway * 0.8 + (walking ? -0.2 : 0), dt);
      const flare = sp.skirtY.step(up * 0.8 + sitK * 0.6 + clamp2(-lowV * 0.01, -0.3, 0.6), dt);
      const [fm, wg] = MOOD[face] || MOOD.neutral;
      finMood = lerp2(finMood, lerp2(fm, -0.6, shiver), ease2(6, dt));
      wagAmp = lerp2(wagAmp, wg, ease2(3, dt));
      tailMood = lerp2(tailMood, mode === "sleep" || face === "sad" || face === "cry" || face === "scared" ? -1 : 0, ease2(3, dt));
      const fins = sp.fins.step(finMood * 14 + sway * 10, dt) + (face === "angry" ? 2.5 * Math.sin(t * 40) : 0) + flap * 13 * Math.sin(t * 26);
      const ahoge = sp.ahoge.step(-tiltVel * 0.12 - yawVel * 0.5 + sway * 18 + (face === "surprised" ? -16 : 0) + (face === "confused" ? 20 : 0) + (mode === "sleep" ? 22 : 0) - hairY * 12, dt) + flap * 12 * Math.sin(t * 19);
      const tail = sp.tail.step(sway * 14 + tailMood * 12, dt) + wagAmp * 13 * Math.sin(t * (4 + 5 * wagAmp)) + Math.sin(t * 1.3) * 3 + flap * 14 * Math.sin(t * 17);
      const legA = o.legs.map((l) => -Math.atan2(l[2] - l[0], Math.max(4, l[3] - l[1])) * 180 / Math.PI);
      const lift = o.legs.map((l) => clamp2(29 - Math.hypot(l[2] - l[0], l[3] - l[1]), -8, 20));
      const sitIn = smooth2(0.44, 0.54, sitK), plop = Math.sin(Math.PI * smooth2(0.3, 0.8, sitK));
      walkK = lerp2(walkK, walking ? 1 : 0, ease2(8, dt));
      runK = lerp2(runK, mode === "run" ? 1 : 0, ease2(7, dt));
      let aN = 4, aF = -2, swing = walking ? 1 : 0;
      if (airborne) {
        aN = 40;
        aF = -30;
      }
      if (held) {
        aN = (70 + 16 * Math.sin(t * 13)) * L.heldArms;
        aF = (-45 - 12 * Math.sin(t * 13 + 1.3)) * L.heldArms;
      }
      if (sitK > 0.5 && !walking) {
        aN = lerp2(aN, -4, sitK);
        aF = lerp2(aF, -6, sitK);
      }
      if (face === "happy" || face === "love") {
        aN += 12 + 5 * Math.sin(t * 8);
        aF -= 8 + 4 * Math.sin(t * 8);
      }
      if (face === "angry") {
        aN = 20 + 3 * Math.sin(t * 30);
        aF = -18 - 3 * Math.sin(t * 30);
        swing = 0;
      }
      if (face === "determined") {
        aN = 14;
        aF = -10;
        swing = 0;
      }
      if (face === "excited") {
        aN += 18;
        aF -= 12;
      }
      if (mode === "dance") {
        const b = Math.sin((o.modeT || 0) * Math.PI * 2 * 1.1);
        aN = 16 + 24 * Math.max(0, b);
        aF = -8 - 22 * Math.max(0, -b);
      }
      if (runK > 1e-3) {
        aN = lerp2(aN, 38, runK);
        aF = lerp2(aF, 32, runK);
      }
      if (wave) aN = lerp2(aN, 108, wave);
      if (shiver) {
        aN = lerp2(aN, -10, shiver);
        aF = lerp2(aF, 8, shiver);
      }
      swingK = lerp2(swingK, swing, ease2(8, dt));
      const gait = swingK * (1 - runK) * (1 - wave) * (1 - shiver) * 0.5;
      const armN = sp.armN.step(aN, dt) - legA[0] * gait + wave * 13 * Math.sin(t * 15) + shiver * 1.4 * Math.sin(t * 47) + flap * 9 * Math.sin(t * 24);
      const armF = sp.armF.step(aF, dt) - legA[1] * gait - shiver * 1.2 * Math.sin(t * 43 + 1) - flap * 9 * Math.sin(t * 24 + 1);
      st.body = { a: -sway * 1.2 + (held ? o.swing * 0.15 : 0), ty: low - 9.6 * sitK, sx: (1 + 6e-3 * breath + 0.04 * plop) * (1 - 0.03 * shiver), sy: 1 - 0.012 * breath - 0.06 * plop };
      st.waist = { a: bow * 20 };
      st.skirt = {
        fn: (u, v) => {
          const k = v * v;
          return [skirt * 4 * k + flare * (u - 0.45) * 9 * v + sitK * (u - 0.45) * 10 * v, -flare * k * 3 - sitK * k * 8];
        }
      };
      st.skirtSit = { fn: (u, v) => [skirt * 1.5 * v * v, -Math.max(0, breath) * 0.4 * v] };
      st.alpha.skirt = st.alpha.waist_bow_front = st.alpha.skirt_shadow = 1 - sitIn;
      st.alpha.leg_back = st.alpha.leg_front = 1 - smooth2(0.42, 0.52, sitK);
      st.alpha.skirt_sit = st.alpha.waist_bow_sit_front = sitIn;
      st.armNear = { a: armN };
      st.armFar = { a: armF };
      st.alpha.arm_far_end_front = 1 - smooth2(12, 30, armF);
      const behind = o.legs.map((l) => Math.max(0, l[0] - l[2]) * 0.3 * walkK);
      st.legBack = { fn: hinge(L.PV.legBack, lerp2(legA[0], -55, sitK), (-lift[0] * 0.9 - behind[0]) * (1 - sitK)) };
      st.legFront = { fn: hinge(L.PV.legFront, lerp2(legA[1], -60, sitK), (-lift[1] * 0.9 - behind[1]) * (1 - sitK)) };
      st.tail = { a: tail - 10 * sitK };
      const tr = L.tailRoot;
      st.tailBend = tr ? { fn: (u, v, x) => {
        const k = clamp2((tr.x - x) / (tr.x - tr.tip), 0, 1);
        return [0, tail * 0.3 * k * k];
      } } : { fn: (u) => [0, -tail * 0.5 * u * u] };
      st.neck = { a: headA + clamp2(bend * 0.8, -10, 12) - runK * 12, ty: (mode === "sleep" ? 2.5 : 0) + breath * 0.35 };
      const parallax = (k, ky) => (u, v) => [angleX * k * bump(u) * (0.4 + 0.6 * bump(v)), angleY * ky * bump(v) * (0.4 + 0.6 * bump(u))];
      st.headFront = { fn: parallax(4.2, 2.8) };
      st.headFeat = { fn: parallax(2, 1.4) };
      if (L.brows) {
        if ((o.talk || 0) > 0.2) {
          if (t - talkedAt > 0.8 || t - browFlashAt > 2.5 && Math.random() < dt * 0.4) browFlashAt = t;
          talkedAt = t;
        }
        const ft = (t - browFlashAt) / 0.5, flash = ft >= 0 && ft < 1 && !BROW_STILL.has(face) ? 7 * Math.sin(Math.PI * ft) ** 2 : 0;
        const pose = BROW[face] || both(0), rate = BROW_RATE[face] || 9;
        browNow.forEach((b, i) => {
          b[0] = lerp2(b[0], pose[i][0] + flash - 2 * (o.blink || 0), ease2(rate, dt));
          for (let j = 1; j < 4; j++) b[j] = lerp2(b[j], pose[i][j], ease2(rate * 0.75, dt));
        });
        browOver = lerp2(browOver, BROW_OVER.has(face) ? 1 : 0, ease2(14, dt));
        BROWS.forEach((b, i) => {
          const [Y, A, F, X] = browNow[i], outer = U(b.outer[0]), inner = U(b.inner[0]), toNose = Math.sign(inner - outer);
          st[`brow${i}`] = { a: -toNose * Math.atan2(A, Math.abs(b.inner[0] - b.outer[0])) * 180 / Math.PI, tx: X * toNose * S, ty: -Y * S };
          st[`browBend${i}`] = { fn: (u, v, x) => {
            const k = clamp2((2 * x - outer - inner) / (inner - outer), -1, 1);
            return [0, -F * (1 - k * k) * S];
          } };
          st[`browOver${i}`] = { a: 2 * Math.atan((b.outer[1] - b.inner[1]) / (b.outer[0] - b.inner[0])) * 180 / Math.PI };
          st.alpha[`brow${i}`] = 1 - browOver;
          st.alpha[`browOver${i}`] = browOver;
          st.alpha[`brow${i}_through`] = 0.55 * (1 - browOver);
          st.alpha[`browOver${i}_through`] = 0.55 * browOver;
        });
      }
      if (L.creases) {
        fc.eyes.forEach((e, i) => {
          creaseDrop[i] = lerp2(creaseDrop[i], lidDrop(e, EYES[i], fc.wide && e.shape === "ring" ? 0 : fc.brows), ease2(12, dt));
        });
        creaseA = lerp2(creaseA, (lidOpen(fc.eyes[0]) + lidOpen(fc.eyes[1])) / 2, ease2(12, dt));
        st.alpha.eye_creases = creaseA;
        st.creases = { fn: (u, v, x) => [0, (x < BROW_SPLIT ? creaseDrop[0] : creaseDrop[1]) * S] };
      }
      st.headMid = { fn: parallax(2, 1.4) };
      st.headBack = { fn: parallax(-1.4, -1) };
      const nk = L.PV.neck, na = headA * Math.PI / 180;
      st.hairSway = {
        fn: (u, v, x, y) => {
          const w = smooth2(0.3, 0.8, v), a = -na * w, c = Math.cos(a), s = Math.sin(a);
          const dx = x - nk[0], dy = y - nk[1];
          const wv = Math.pow(v, 1.6);
          return [
            nk[0] + dx * c - dy * s - x + hair * 8 * wv + Math.sin(t * 1.6 + v * 3) * wv,
            nk[1] + dx * s + dy * c - y + hairY * 12 * wv * wv - Math.abs(hair) * 1.5 * wv
          ];
        }
      };
      st.bangsSway = { fn: (u, v) => [bangs * 3.2 * v * v + Math.sin(t * 1.9 + u * 2) * 0.5 * v * v, hairY * 3 * v * v] };
      st.ahoge = { a: ahoge * 0.5 + Math.sin(t * 2.1) * 2 };
      st.finNear = { a: fins + Math.sin(t * 1.4) * 1.5 };
      st.finFar = { a: -fins * 0.8 - Math.sin(t * 1.4) * 1.2 };
      const faceTurn = (angleX - (rootWas.face ?? angleX)) / Math.max(dt, 1e-3);
      rootWas.face = angleX;
      for (const [k, d] of Object.entries(L.swings)) {
        let root = (o.groupRot || 0) * facing, onHead = false;
        for (let p = d.parent; p; p = L.deformers[p].parent) {
          if (L.deformers[p].kind === "rot") root += st[p]?.a || 0;
          if (p === "neck") onHead = true;
        }
        const kick = (root - (rootWas[k] ?? root)) / Math.max(dt, 1e-3);
        rootWas[k] = root;
        const pend = sp[`pend_${k}`] ||= spring(28, 1.8, 55), ph = d.pivot[0] * 0.05;
        const a = pend.step((-sway * 34 - kick * 0.15 + (onHead ? faceTurn * 8 : 0) + walkK * (legA[0] - legA[1]) * 0.3) * d.gain, dt);
        const idle = onHead ? Math.sin(t * 1.7 + ph) * 6 + Math.sin(t * 2.9 + ph * 1.3) * 2.5 : Math.sin(t * 1.7 + ph) * 2;
        st[k] = { a: a + idle * d.gain - root * Math.min(1, d.gain) };
      }
      const look = [clamp2(o.look[0], -6, 6), clamp2(o.look[1], -5, 5)], was = prevLook || look;
      prevLook = look;
      const shut = Math.max(o.blink || 0, o.eyeClose || 0), shutV = (shut - prevShut) / Math.max(dt, 1e-3);
      prevShut = shut;
      hl.dx = sp.hlX.step(-(look[0] - was[0]) / Math.max(dt, 1e-3) * 0.03 - yawVel * 0.8, dt);
      hl.dy = sp.hlY.step(-(look[1] - was[1]) / Math.max(dt, 1e-3) * 0.03 + shutV * 0.12, dt);
      const mood = HL_MOOD[face] || {};
      hl.scale = lerp2(hl.scale, mood.scale ?? 1, ease2(6, dt));
      hl.quiver = lerp2(hl.quiver, mood.quiver ?? 0, ease2(4, dt));
      hl.alpha = lerp2(hl.alpha, mood.alpha ?? 1, ease2(4, dt));
      paintFace(fc, face, o, t);
      rig.upload("faceFx", faceCv);
      st.mix = 0;
      if (fade) {
        if (fade.t0 == null) fade.t0 = t;
        st.mix = smooth2(0, 1, (t - fade.t0) / fade.dur);
        const own = img;
        img = fade.set.img;
        fg = fg2;
        paintFace(fc, face, o, t);
        img = own;
        fg = fg1;
        rig.upload("faceFx@mix", faceCv2);
      }
      rig.render(st);
      if (opts.raster) {
        fo.setAttribute("href", canvas.toDataURL("image/png"));
        decoded = fo.decode ? fo.decode().catch(() => {
        }) : null;
      }
      if (fade && st.mix >= 1) endFade();
      drawFx(fc, t);
    }
    const at = (x, y) => rig.point("neck", st, x, y);
    function drawFx(fc, t) {
      let s = "";
      const ac = accent();
      const top = at(124, 34), side = at(204, 52);
      if (fc.orbit) {
        for (let i = 0; i < 3; i++) {
          const a = t * 3.2 + i * 2.094, sn = Math.sin(a);
          s += `<path fill="#ffd23f" stroke="#3a2f7a" stroke-width="1.6" stroke-linejoin="round" opacity="${sn < 0 ? 0.55 : 1}" transform="translate(${f1(top[0] + 56 * Math.cos(a))} ${f1(top[1] - 4 + 10 * sn)}) scale(${sn < 0 ? 0.7 : 1})" d="M0 -7L2 -2L7 -2L3 1L4.5 6.5L0 3.3L-4.5 6.5L-3 1L-7 -2L-2 -2Z"/>`;
        }
      }
      if (fc.listen) {
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.9 + i / 3) % 1, r = 36 - 24 * p, c = at(214, 116);
          s += `<path fill="none" stroke="${ac}" stroke-width="5" stroke-linecap="round" opacity="${f1(Math.sin(Math.PI * p))}" d="M${f1(c[0] + r * Math.cos(-0.55))} ${f1(c[1] + r * Math.sin(-0.55))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(c[0] + r * Math.cos(0.55))} ${f1(c[1] + r * Math.sin(0.55))}"/>`;
        }
      }
      if (fc.think) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.8 + i / 3) % 1;
          s += `<circle fill="#e8f0ff" stroke="${ac}" stroke-width="3" cx="${f1(side[0] + 10 * i)}" cy="${f1(side[1] - 20 * i - 6 * k)}" r="${4 + 3 * i}" opacity="${f1(0.4 + 0.6 * Math.sin(Math.PI * k))}"/>`;
        }
      }
      if (fc.sweat) {
        const c = at(196, 88 + 3 * Math.sin(t * 7));
        s += `<path fill="#8fd0ff" stroke="#2f5fae" stroke-width="1.4" transform="translate(${f1(c[0])} ${f1(c[1])}) scale(1.4)" d="M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z"/>`;
      }
      if (fc.anger) {
        const c = at(190, 62), k = 1 + 0.12 * Math.sin(t * 10);
        s += `<g transform="translate(${f1(c[0])} ${f1(c[1])}) scale(${f1(k)})" fill="none" stroke="#e5484d" stroke-width="5" stroke-linecap="round"><path d="M-11 -3Q-3 -3 -3 -11M3 -11Q3 -3 11 -3M11 3Q3 3 3 11M-3 11Q-3 3 -11 3"/></g>`;
      }
      if (fc.bang) {
        const c = at(206, 36);
        s += `<g transform="translate(${f1(c[0])} ${f1(c[1])})"><path fill="none" stroke="#252049" stroke-width="8" stroke-linecap="round" d="M0 -16V3"/><circle fill="#252049" cx="0" cy="14" r="4.5"/></g>`;
      }
      if (fc.question) {
        const c = at(206, 36), k = 1 + 0.06 * Math.sin(t * 3);
        s += `<g transform="translate(${f1(c[0])} ${f1(c[1])}) scale(${f1(k)})"><path fill="none" stroke="#252049" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M-8 -9Q-8 -19 0 -19Q9 -19 9 -11Q9 -4 0 -1V4"/><circle fill="#252049" cx="0" cy="14" r="4.5"/></g>`;
      }
      if (fx !== s) {
        fxG.innerHTML = s;
        fx = s;
      }
    }
    return {
      draw,
      groupTilt,
      /** The gestures she draws herself, from the frame's `gesture` (the kit leaves them off the body). */
      gestures: ["nod", "shake", "wave", "bow"],
      setScheme,
      /** Forgets the motion state (springs, clocks), for callers that replay a timeline from its start. */
      /**
       * Renders `frames` frames of one pose (face `fc`, frame fields `o`, its clock starting at o.t) at `res` canvas
       * pixels per rig unit, then gives up the WebGL context; returns an SVG <image> for the result in rig space.
       * For pages showing many still figures, which would otherwise hold a GPU context each.
       */
      snapshot(fc, o, res = 3, frames = 60) {
        fixedRes = res;
        const g = document.createElementNS(SVGNS, "g");
        for (let i = 0; i < frames; i++) draw(g, fc, { ...o, t: (o.t || 0) + i / 60 });
        const href = canvas.toDataURL("image/png");
        rig.dispose();
        rig = null;
        mountedIn = null;
        fixedRes = 0;
        return `<image href="${href}" x="${VIEW[0]}" y="${VIEW[1]}" width="${VIEW[2] - VIEW[0]}" height="${VIEW[3] - VIEW[1]}"/>`;
      },
      /**
       * Releases the WebGL context and drops the mounted DOM (what `setFigure` switching away from
       * this figure calls). The figure object stays usable: the next `draw` re-mounts from scratch.
       */
      dispose() {
        rig?.dispose();
        rig = null;
        canvas = null;
        fo = null;
        fxG = null;
        mountedIn = null;
      },
      reset() {
        endFade();
        for (const k in sp) {
          sp[k].x = 0;
          sp[k].v = 0;
        }
        lastT = null;
        rootWas = {};
        prevTilt = 0;
        prevYaw = 0;
        prevLow = 0;
        headTilt = 0;
        wTilt = 0;
        wLean = 0;
        finMood = 0;
        tailMood = 0;
        wagAmp = 0;
        sitK = 0;
        walkK = 0;
        runK = 0;
        swingK = 0;
        prevLook = null;
        prevShut = 0;
        Object.assign(hl, { dx: 0, dy: 0, scale: 1, quiver: 0, alpha: 1 });
      },
      /** Loads every scheme's and outfit's textures, so later switches are immediate. */
      preload: () => Promise.all(SCHEMES.flatMap((sc) => OUTFITS.map((of) => loadScheme(sc.id, of.id)))),
      get scheme() {
        return `${scheme}-${outfit}`;
      },
      /** Raster mode: a promise that settles once the last drawn frame is ready to be painted. */
      get painted() {
        return decoded || Promise.resolve();
      },
      get colors() {
        return { z: accent() };
      },
      schemes: SCHEMES,
      // points the kit uses: eye tracking, a tear and one under each eye (where the streams run), sleep z's, hearts [x from, x to, y], bubble
      anchors: {
        gaze: [U(745), V(690)],
        tear: [U(640), V(752)],
        tears: [[U(654), V(752)], [U(852), V(750)]],
        z: [196, 44],
        hearts: [96, 176, 62],
        bubble: [128, 18]
      },
      model
    };
  }

  // coopanion/sound.js
  var SOUND_KINDS = {
    move: ["step", "skid", "jump", "land", "whoosh", "chirps", "shake", "nod", "spin", "shiver", "dance", "look"],
    touch: ["grab", "squeak", "purr", "poke"],
    face: ["happy", "wink", "love", "surprised", "angry", "sad", "shy", "yawn"],
    snore: ["snore"],
    talk: ["babble", "blub"],
    ui: ["tick", "pop", "sparkle", "select", "listenStart", "listenEnd"]
  };
  var BODY_SOUND_KINDS = ["move", "touch", "face", "snore"];
  var PAN_STEP = 0.01;
  var PAN_MAX = 0.5;
  var KIND_OF = Object.fromEntries(Object.entries(SOUND_KINDS).flatMap(([kind, names]) => names.map((n) => [n, kind])));
  function createSfx({ storageKey = "cortico-pet.sound.v1", volume = 0.55 } = {}) {
    let ctx = null, master = null, unlocked = false, on = true, noiseBuf = null, level = 1;
    let panner = null, pan = 0, where = 0, byPosition = true;
    let muted = /* @__PURE__ */ new Set(), snoreSeconds = 0;
    let shown = true;
    try {
      on = localStorage.getItem(storageKey) !== "off";
    } catch (e) {
    }
    const R = (a, b) => a + Math.random() * (b - a);
    function ready() {
      if (!on || !unlocked || !shown || document.hidden) return null;
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
        master = ctx.createGain();
        master.gain.value = volume * level;
        const comp = ctx.createDynamicsCompressor();
        if (ctx.createStereoPanner) {
          panner = ctx.createStereoPanner();
          panner.pan.value = pan;
          master.connect(panner);
          panner.connect(comp);
        } else master.connect(comp);
        comp.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      for (const o of own.values()) decode(o);
      return ctx;
    }
    function applyPan() {
      const p = byPosition ? where : 0;
      if (Math.abs(p - pan) < PAN_STEP) return;
      pan = p;
      panner?.pan.setTargetAtTime(p, ctx.currentTime, 0.03);
    }
    function tone({ type = "sine", f0 = 440, f1: f12 = f0, dur = 0.1, vol = 0.2, at = 0, attack = 5e-3, vib = 0, vibRate = 0, filter = 0 }) {
      const c = ready();
      if (!c) return;
      const t0 = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f12), t0 + dur);
      if (vib) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = vibRate;
        lg.gain.value = vib;
        l.connect(lg);
        lg.connect(o.frequency);
        l.start(t0);
        l.stop(t0 + dur + 0.05);
      }
      g.gain.setValueAtTime(1e-4, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
      let node = o;
      if (filter) {
        const bq = c.createBiquadFilter();
        bq.type = "lowpass";
        bq.frequency.value = filter;
        o.connect(bq);
        node = bq;
      }
      node.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }
    function noise({ type = "bandpass", f0 = 1e3, f1: f12 = f0, q = 1, dur = 0.2, vol = 0.15, at = 0, attack = 0.01 }) {
      const c = ready();
      if (!c) return;
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t0 = c.currentTime + at, s = c.createBufferSource(), bq = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf;
      bq.type = type;
      bq.Q.value = q;
      bq.frequency.setValueAtTime(f0, t0);
      bq.frequency.exponentialRampToValueAtTime(f12, t0 + dur);
      g.gain.setValueAtTime(1e-4, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
      s.connect(bq);
      bq.connect(g);
      g.connect(master);
      s.start(t0, Math.random() * 0.5);
      s.stop(t0 + dur + 0.03);
    }
    let own = /* @__PURE__ */ new Map();
    let voice = { talk: [], pitch: 1 };
    function decode(o) {
      if (o.buffer || o.decoding || !ctx) return;
      o.decoding = o.bytes.then((b) => ctx.decodeAudioData(b.slice(0))).then((buf) => {
        o.buffer = buf;
      }, (err) => console.error(`\u97F3\u6548 ${o.name} \u6CA1\u80FD\u89E3\u7801:`, err));
    }
    function playOwn(o, rate = 1) {
      const c = ready();
      if (!c) return;
      if (!o.buffer) {
        decode(o);
        return;
      }
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = o.buffer;
      src.playbackRate.value = rate;
      g.gain.value = o.volume;
      src.connect(g);
      g.connect(master);
      src.start();
    }
    const tones = {
      step(run, i) {
        const k = run ? 1.25 : 1;
        tone({ f0: (i ? 520 : 440) * k, f1: (i ? 380 : 330) * k, dur: 0.06, vol: run ? 0.07 : 0.05 });
        if (run) noise({ f0: 2500, q: 0.8, dur: 0.05, vol: 0.03 });
      },
      skid() {
        noise({ type: "highpass", f0: 1800, f1: 900, dur: 0.22, vol: 0.08 });
      },
      jump() {
        tone({ type: "triangle", f0: 200, f1: 720, dur: 0.24, vol: 0.22, vib: 40, vibRate: 22 });
      },
      land(hard) {
        tone({ f0: hard ? 160 : 190, f1: 48, dur: hard ? 0.28 : 0.16, vol: hard ? 0.4 : 0.25 });
        noise({ type: "lowpass", f0: hard ? 700 : 500, f1: 120, dur: 0.12, vol: hard ? 0.25 : 0.12 });
        if (hard) tone({ type: "square", f0: 420, f1: 300, dur: 0.08, vol: 0.06, at: 0.02, filter: 1600 });
      },
      grab() {
        tone({ type: "triangle", f0: 680, f1: 1500, dur: 0.14, vol: 0.18, vib: 60, vibRate: 30 });
      },
      squeak() {
        tone({ type: "triangle", f0: R(900, 1200), f1: R(1300, 1700), dur: 0.09, vol: 0.08, vib: 40, vibRate: 35 });
      },
      whoosh() {
        noise({ f0: 300, f1: 2400, q: 1.4, dur: 0.38, vol: 0.22, attack: 0.08 });
      },
      chirps() {
        for (let i = 0; i < 3; i++) tone({ f0: 2300 + i * 120, f1: 3200, dur: 0.06, vol: 0.06, at: i * 0.11 });
      },
      shake() {
        for (let i = 0; i < 5; i++) tone({ type: "square", f0: 180, f1: 160, dur: 0.05, vol: 0.05, at: i * 0.06, filter: 900 });
      },
      hmm() {
        tone({ type: "triangle", f0: 330, f1: 360, dur: 0.12, vol: 0.08 });
        tone({ type: "triangle", f0: 392, f1: 470, dur: 0.16, vol: 0.08, at: 0.14 });
      },
      yawn() {
        tone({ type: "triangle", f0: 520, f1: 240, dur: 1, vol: 0.1, vib: 12, vibRate: 5, filter: 1500, attack: 0.15 });
      },
      snore() {
        noise({ type: "lowpass", f0: 250, f1: 700, dur: 0.7, vol: 0.09, attack: 0.35 });
      },
      purr() {
        tone({ type: "sawtooth", f0: 62, f1: 58, dur: 0.9, vol: 0.08, vib: 6, vibRate: 24, filter: 320, attack: 0.1 });
      },
      poke() {
        tone({ f0: 320, f1: 200, dur: 0.09, vol: 0.16 });
      },
      shiver() {
        for (let i = 0; i < 8; i++) tone({ type: "square", f0: 900, f1: 820, dur: 0.03, vol: 0.035, at: i * 0.07, filter: 2400 });
      },
      // looking about hums like the thinking 'hmm', but counts as a motion sound
      look() {
        tones.hmm();
      },
      dance() {
        [523, 659, 784, 659, 880].forEach((fr, i) => tone({ type: "triangle", f0: fr, dur: 0.13, vol: 0.09, at: i * 0.15 }));
      },
      nod() {
        tone({ type: "triangle", f0: 520, f1: 440, dur: 0.07, vol: 0.08 });
        tone({ type: "triangle", f0: 520, f1: 440, dur: 0.07, vol: 0.08, at: 0.2 });
      },
      spin() {
        tone({ type: "triangle", f0: 300, f1: 1200, dur: 0.3, vol: 0.12, vib: 30, vibRate: 18 });
      },
      happy() {
        tone({ type: "triangle", f0: 660, f1: 700, dur: 0.1, vol: 0.14 });
        tone({ type: "triangle", f0: 990, f1: 1050, dur: 0.14, vol: 0.14, at: 0.09 });
      },
      wink() {
        tone({ f0: 1760, dur: 0.5, vol: 0.1 });
        tone({ f0: 2637, dur: 0.45, vol: 0.06, at: 0.04 });
      },
      love() {
        tone({ f0: 480, f1: 820, dur: 0.1, vol: 0.14 });
        tone({ f0: 600, f1: 1e3, dur: 0.12, vol: 0.14, at: 0.13 });
      },
      surprised() {
        tone({ f0: 380, f1: 1500, dur: 0.2, vol: 0.16, vib: 15, vibRate: 12 });
      },
      angry() {
        tone({ type: "sawtooth", f0: 120, f1: 95, dur: 0.5, vol: 0.12, vib: 12, vibRate: 14, filter: 700 });
      },
      sad() {
        tone({ type: "triangle", f0: 440, f1: 392, dur: 0.3, vol: 0.13, vib: 8, vibRate: 6 });
        tone({ type: "triangle", f0: 392, f1: 262, dur: 0.55, vol: 0.13, at: 0.3, vib: 10, vibRate: 5 });
      },
      shy() {
        tone({ f0: 1300, f1: 1600, dur: 0.07, vol: 0.07 });
        tone({ f0: 1450, f1: 1750, dur: 0.07, vol: 0.06, at: 0.1 });
      },
      tick() {
        tone({ f0: 1200, f1: 1e3, dur: 0.03, vol: 0.05 });
      },
      pop() {
        tone({ f0: 240, f1: 720, dur: 0.07, vol: 0.14 });
      },
      sparkle() {
        [1568, 2093, 2637].forEach((fr, i) => tone({ f0: fr, dur: 0.25, vol: 0.06, at: i * 0.06 }));
      },
      select() {
        tone({ type: "triangle", f0: 520, f1: 1040, dur: 0.1, vol: 0.12 });
      },
      babble(ch) {
        const n = ch.codePointAt(0);
        if (voice.talk.length) {
          playOwn(voice.talk[n % voice.talk.length], voice.pitch * R(0.95, 1.05));
          return;
        }
        const fr = (330 + n % 9 * 28) * voice.pitch;
        tone({ type: "square", f0: fr, f1: fr * R(0.85, 1.1), dur: 0.05, vol: 0.05, filter: 1800 });
      },
      blub() {
        tone({ f0: R(500, 700), f1: R(900, 1200), dur: 0.05, vol: 0.05 });
      },
      listenStart() {
        tone({ f0: 880, dur: 0.12, vol: 0.1 });
        tone({ f0: 1320, dur: 0.16, vol: 0.1, at: 0.1 });
      },
      listenEnd() {
        tone({ f0: 1320, dur: 0.1, vol: 0.09 });
        tone({ f0: 990, dur: 0.16, vol: 0.09, at: 0.09 });
      }
    };
    const api = {
      unlock() {
        unlocked = true;
        ready();
      },
      isOn: () => on,
      set(v) {
        on = v;
        try {
          localStorage.setItem(storageKey, v ? "on" : "off");
        } catch (e) {
        }
      },
      /** Coo's place across its display, -1 (left) to 1 (right), held to ±PAN_MAX; changes under PAN_STEP are skipped. */
      setPan(v) {
        where = Math.max(-PAN_MAX, Math.min(PAN_MAX, v));
        applyPan();
      },
      /** The window was shown or hidden (by hand or while something is full screen); hidden, nothing plays. */
      setShown(v) {
        shown = v;
      },
      /** The audio context and the gain a sound of `kind` plays into, or null while it would not be heard. */
      output(kind) {
        if (muted.has(kind)) return null;
        const c = ready();
        return c ? { ctx: c, master } : null;
      },
      /**
       * `kinds`: kind → on (SOUND_KINDS); `snoreSeconds`: snoring stops this long into a sleep, 0 = never;
       * `panByPosition`: sounds follow setPan, off = they ease back to the centre; `volume`: percent of the master gain, 0–100.
       */
      configure({ kinds, snoreSeconds: s, panByPosition: b, volume: v } = {}) {
        if (kinds) muted = new Set(Object.keys(SOUND_KINDS).filter((k) => kinds[k] === false));
        if (typeof s === "number" && s >= 0) snoreSeconds = s;
        if (typeof b === "boolean") {
          byPosition = b;
          applyPan();
        }
        if (typeof v === "number" && Number.isFinite(v)) {
          level = Math.max(0, Math.min(100, v)) / 100;
          if (master) master.gain.value = volume * level;
        }
      },
      /**
       * The body's sounds (`sounds` of the pack on screen, from `base`): each is fetched now and decoded once
       * there is an audio context. `null` drops them. `v` is the pack's `voice` ({ pitch }); its `talk` sounds babble.
       */
      usePack(base, sounds, v) {
        own = new Map(Object.entries(sounds ?? {}).map(([name, d]) => {
          const bytes = fetch(new URL(d.file, new URL(base, location.href))).then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)));
          bytes.catch((err) => console.error(`\u97F3\u6548 ${name}(${d.file})\u6CA1\u80FD\u8F7D\u5165:`, err));
          return [name, { name, kind: d.kind, volume: d.volume ?? 1, bytes }];
        }));
        if (ctx) for (const o of own.values()) decode(o);
        const pitch = typeof v?.pitch === "number" && v.pitch >= 0.5 && v.pitch <= 2 ? v.pitch : 1;
        voice = { talk: [...own.values()].filter((o) => o.kind === "talk"), pitch };
      },
      /**
       * A sound the body asks for: the pack's own by that name (filed under the kind its manifest gives), else the
       * synthesized tone, filed under `kind` when that is a body's kind (a face that borrows the 'pop' tone is a
       * face sound) and under the tone's own kind otherwise. Snoring (args[0]: seconds asleep) stops after `snoreSeconds`.
       */
      play(name, kind, ...args) {
        const o = own.get(name);
        const k = o ? o.kind : BODY_SOUND_KINDS.includes(kind) ? kind : KIND_OF[name];
        if (muted.has(k)) return;
        if (k === "snore" && snoreSeconds > 0 && args[0] > snoreSeconds) return;
        if (o) playOwn(o);
        else if (Object.hasOwn(tones, name)) tones[name](...args);
      }
    };
    for (const name of Object.keys(tones)) api[name] = (...args) => {
      if (!muted.has(KIND_OF[name])) tones[name](...args);
    };
    return api;
  }

  // coopanion/whale/model.json
  var model_default = {
    units: {
      S: 0.19,
      X0: 650,
      FEET: 1363,
      DS: 0.6,
      featDS: 1
    },
    pivots: {
      body: [
        128,
        256
      ],
      waist: [
        128,
        188.93
      ],
      neck: [
        129.9,
        154.73
      ],
      armNear: [
        113.18,
        166.13
      ],
      armFar: [
        153.65,
        168.98
      ],
      legBack: [
        112.42,
        203.18
      ],
      legFront: [
        144.15,
        203.18
      ],
      tail: [
        88.1,
        206.03
      ],
      finNear: [
        80.88,
        128.13
      ],
      finFar: [
        173.22,
        126.23
      ],
      ahoge: [
        118.5,
        54.03
      ],
      head: [
        137.5,
        114.83
      ]
    },
    parts: [
      {
        id: "hair_back",
        tex: "hair_back",
        z: 1,
        parent: "hairSway",
        grid: [
          8,
          12
        ],
        box: [
          39.46,
          48.33,
          144.21,
          173.66
        ]
      },
      {
        id: "tail",
        tex: "tail",
        z: 1.5,
        parent: "tailBend",
        grid: [
          10,
          4
        ],
        box: [
          24.26,
          172.21,
          83.03,
          40.47
        ]
      },
      {
        id: "hair_back_curl",
        tex: "hair_back_curl",
        z: 1.75,
        parent: "hairSway",
        grid: [
          4,
          8
        ],
        box: [
          74.23,
          171.83,
          41.23,
          47.88
        ]
      },
      {
        id: "arm_far",
        tex: "arm_far",
        z: 4.5,
        parent: "armFar",
        grid: [
          3,
          5
        ],
        box: [
          144.91,
          163.28,
          28.5,
          39.71
        ]
      },
      {
        id: "leg_back",
        tex: "leg_back",
        z: 4,
        parent: "legBack",
        grid: [
          3,
          10
        ],
        box: [
          96.08,
          173.16,
          40.28,
          84.55
        ]
      },
      {
        id: "skirt_shadow",
        tex: "skirt_shadow",
        src: "tex/skirt_shadow.png",
        z: 4.2,
        parent: "skirt",
        grid: [
          8,
          6
        ],
        box: [
          79.55,
          168.41,
          98.04,
          69.42
        ],
        blend: "multiply"
      },
      {
        id: "leg_front",
        tex: "leg_front",
        z: 3,
        parent: "legFront",
        grid: [
          3,
          10
        ],
        box: [
          120.21,
          168.79,
          43.7,
          86.83
        ]
      },
      {
        id: "torso_up",
        tex: "torso_up",
        z: 5,
        parent: "body",
        grid: [
          6,
          6
        ],
        box: [
          106.15,
          147.89,
          48.83,
          46.55
        ]
      },
      {
        id: "hair_front_right",
        tex: "hair_front_right",
        z: 5.05,
        parent: "hairSway",
        grid: [
          4,
          6
        ],
        box: [
          146.62,
          148.27,
          30.21,
          42.75
        ]
      },
      {
        id: "arm_far_end_front",
        tex: "arm_far_end_front",
        z: 5.1,
        parent: "armFar",
        grid: [
          3,
          3
        ],
        box: [
          156.88,
          183.99,
          16.53,
          19
        ]
      },
      {
        id: "skirt",
        tex: "skirt",
        z: 5.2,
        parent: "skirt",
        grid: [
          8,
          6
        ],
        box: [
          79.55,
          168.41,
          98.04,
          61.18
        ]
      },
      {
        id: "skirt_sit",
        tex: "skirt_sit",
        z: 5.3,
        parent: "skirtSit",
        grid: [
          8,
          4
        ],
        box: [
          47.44,
          168.98,
          151.81,
          68.97
        ]
      },
      {
        id: "hair_front_left",
        tex: "hair_front_left",
        z: 5.4,
        parent: "hairSway",
        grid: [
          4,
          8
        ],
        box: [
          60.93,
          118.63,
          44.84,
          76.57
        ]
      },
      {
        id: "waist_bow_front",
        tex: "waist_bow_front",
        z: 5.5,
        parent: "skirt",
        grid: [
          4,
          4
        ],
        box: [
          84.87,
          168.41,
          29.83,
          33.06
        ]
      },
      {
        id: "waist_bow_sit_front",
        tex: "waist_bow_sit_front",
        z: 5.55,
        parent: "skirtSit",
        grid: [
          4,
          4
        ],
        box: [
          79.74,
          168.98,
          39.52,
          28.88
        ]
      },
      {
        id: "arm_near",
        tex: "arm_near",
        z: 6,
        parent: "armNear",
        grid: [
          4,
          6
        ],
        box: [
          93.8,
          157.96,
          28.69,
          54.53
        ]
      },
      {
        id: "fin_far",
        tex: "fin_far",
        z: 7,
        parent: "finFar",
        grid: [
          4,
          3
        ],
        box: [
          166,
          103.62,
          38.76,
          39.14
        ]
      },
      {
        id: "sidelocks",
        tex: "sidelocks",
        z: 7.5,
        parent: "bangsSway",
        grid: [
          4,
          8
        ],
        box: [
          87.72,
          124.14,
          98.23,
          49.21
        ]
      },
      {
        id: "face",
        tex: "face",
        z: 8,
        parent: "headMid",
        grid: [
          6,
          6
        ],
        box: [
          100.26,
          73.98,
          75.62,
          82.08
        ]
      },
      {
        id: "eye_creases",
        tex: "eye_creases",
        z: 8.5,
        parent: "headFeat",
        grid: [
          4,
          2
        ],
        box: [
          126.29,
          108.94,
          44.46,
          9.88
        ]
      },
      {
        id: "brows",
        tex: "brows",
        z: 8.6,
        parent: "headFeat",
        grid: [
          12,
          2
        ],
        box: [
          117.74,
          97.35,
          58.33,
          9.12
        ]
      },
      {
        id: "headdress",
        tex: "headdress",
        z: 12.5,
        parent: "headMid",
        grid: [
          8,
          4
        ],
        box: [
          72.71,
          38.64,
          114.76,
          72.2
        ]
      },
      {
        id: "fin_near",
        tex: "fin_near",
        z: 11,
        parent: "finNear",
        grid: [
          5,
          3
        ],
        box: [
          37.37,
          100.39,
          59.85,
          42.75
        ]
      },
      {
        id: "bow",
        tex: "bow",
        z: 13.8,
        parent: "headMid",
        grid: [
          3,
          3
        ],
        box: [
          66.06,
          94.5,
          28.88,
          24.32
        ]
      },
      {
        id: "bangs",
        tex: "bangs",
        z: 13,
        parent: "bangsSway",
        grid: [
          8,
          10
        ],
        box: [
          80.69,
          51.75,
          112.29,
          99.75
        ]
      },
      {
        id: "ahoge",
        tex: "ahoge",
        z: 14,
        parent: "ahoge",
        grid: [
          5,
          4
        ],
        box: [
          87.15,
          20.4,
          53.2,
          36.29
        ]
      }
    ],
    feat: {
      eyes: {
        eyeL: {
          lash: [
            549,
            609,
            714,
            715
          ],
          ball: [
            585,
            630,
            710,
            748
          ],
          iris: [
            611,
            629,
            707,
            748
          ],
          lidFit: [
            0.008654097031104648,
            -11.40448806820491,
            4388.756473993086
          ],
          rimFit: [
            -0.011105816330789699,
            14.433190194160977,
            -3943.1944247092115
          ],
          hl: [
            631,
            642,
            678,
            674
          ]
        },
        eyeR: {
          lash: [
            825,
            617,
            911,
            701
          ],
          ball: [
            819,
            635,
            886,
            745
          ],
          iris: [
            822,
            636,
            874,
            744
          ],
          lidFit: [
            0.034502404875217586,
            -59.064235979945046,
            25913.794804961508
          ],
          rimFit: [
            -0.053416795724098264,
            90.54594798983726,
            -37627.38070212919
          ],
          hl: [
            830,
            648,
            858,
            679
          ]
        }
      },
      sprites: {
        neutral_mouth: [
          758,
          764,
          773,
          775
        ],
        happy_eyeL: [
          554,
          651,
          699,
          756
        ],
        happy_eyeR: [
          792,
          659,
          877,
          754
        ],
        happy_mouth: [
          715,
          740,
          772,
          783
        ],
        sleep_eyeL: [
          557,
          672,
          696,
          721
        ],
        sleep_eyeR: [
          789,
          681,
          874,
          726
        ],
        sleep_mouth: [
          739,
          758,
          763,
          772
        ],
        drag_eyeL: [
          577,
          619,
          685,
          720
        ],
        drag_eyeR: [
          795,
          631,
          875,
          727
        ],
        drag_mouth: [
          709,
          745,
          766,
          764
        ],
        love_eyeL: [
          539,
          607,
          706,
          776
        ],
        love_eyeR: [
          799,
          608,
          888,
          768
        ],
        love_mouth: [
          723,
          748,
          785,
          792
        ],
        dizzy_eyeL: [
          568,
          607,
          701,
          733
        ],
        dizzy_eyeR: [
          784,
          608,
          878,
          732
        ],
        dizzy_mouth: [
          711,
          761,
          782,
          779
        ],
        surprised_eyeL: [
          535,
          594,
          716,
          758
        ],
        surprised_eyeR: [
          818,
          601,
          904,
          751
        ],
        surprised_mouth: [
          751,
          747,
          791,
          795
        ]
      },
      blush: [
        253,
        222,
        209
      ],
      skin: [
        253,
        242,
        231
      ]
    },
    schemes: [
      {
        id: "deepseek",
        brand: "DeepSeek",
        label: "\u539F\u7248",
        accent: "#4D6BFE",
        ready: true,
        eyeHighlights: true
      },
      {
        id: "harness",
        brand: "DeepSeek Harness",
        label: "\u7EAF\u9ED1",
        accent: "#555555",
        ready: true
      },
      {
        id: "chatgpt",
        brand: "ChatGPT",
        label: "\u94F6\u767D",
        accent: "#303030",
        ready: true
      },
      {
        id: "claude",
        brand: "Claude",
        label: "\u8D64\u9676",
        accent: "#D97757",
        ready: true
      },
      {
        id: "gemini",
        brand: "Gemini",
        label: "\u56DB\u8272",
        accent: "#4285F4",
        ready: true
      },
      {
        id: "qwen",
        brand: "\u5343\u95EE",
        label: "\u7D2B",
        accent: "#7F69F0",
        ready: true
      },
      {
        id: "kimi",
        brand: "Kimi",
        label: "\u9ED1\u84DD",
        accent: "#007CFF",
        ready: true
      },
      {
        id: "minimax",
        brand: "MiniMax",
        label: "\u73AB\u7EA2\u6A59",
        accent: "#D92D7A",
        ready: true
      }
    ],
    view: [
      -12,
      -8,
      268,
      272
    ],
    outfits: [
      {
        id: "maid"
      },
      {
        id: "cape",
        parts: [
          {
            id: "hood_back",
            tex: "cape_hood_back",
            src: "outfits/cape/hood_back.png",
            z: 0.5,
            parent: "headBack",
            grid: [
              6,
              6
            ],
            box: [
              53.14,
              37.69,
              143.83,
              124.83
            ]
          },
          {
            id: "hair_back",
            tex: "hair_back",
            z: 1,
            parent: "hairSway",
            grid: [
              8,
              12
            ],
            box: [
              39.46,
              48.33,
              144.21,
              173.66
            ]
          },
          {
            id: "tail",
            tex: "tail",
            z: 1.5,
            parent: "tailBend",
            grid: [
              10,
              4
            ],
            box: [
              24.26,
              172.21,
              83.03,
              40.47
            ]
          },
          {
            id: "hair_back_curl",
            tex: "hair_back_curl",
            z: 1.75,
            parent: "hairSway",
            grid: [
              4,
              8
            ],
            box: [
              74.23,
              171.83,
              41.23,
              47.88
            ]
          },
          {
            id: "hood_lining",
            tex: "cape_hood_lining",
            src: "outfits/cape/hood_lining.png",
            z: 2,
            parent: "headBack",
            grid: [
              6,
              3
            ],
            box: [
              76.89,
              64.1,
              118.18,
              69.16
            ]
          },
          {
            id: "leg_front",
            tex: "cape_leg_front",
            src: "outfits/cape/leg_front.png",
            z: 3,
            parent: "legFront",
            grid: [
              3,
              10
            ],
            box: [
              124.58,
              171.45,
              34.77,
              83.79
            ]
          },
          {
            id: "leg_back",
            tex: "cape_leg_back",
            src: "outfits/cape/leg_back.png",
            z: 4,
            parent: "legBack",
            grid: [
              3,
              10
            ],
            box: [
              96.46,
              171.45,
              35.72,
              85.88
            ]
          },
          {
            id: "arm_far",
            tex: "cape_arm_far",
            src: "outfits/cape/arm_far.png",
            z: 4.5,
            parent: "armFar",
            grid: [
              3,
              5
            ],
            box: [
              149.47,
              157.2,
              39.9,
              44.27
            ]
          },
          {
            id: "scarf_tail_back",
            tex: "cape_scarf_tail_back",
            src: "outfits/cape/scarf_tail_back.png",
            z: 4.8,
            parent: "scarfBack",
            grid: [
              3,
              4
            ],
            box: [
              88.29,
              149.41,
              30.78,
              32.87
            ]
          },
          {
            id: "skirt",
            tex: "cape_skirt",
            src: "outfits/cape/skirt.png",
            z: 4.9,
            parent: "skirt",
            grid: [
              8,
              6
            ],
            box: [
              86.58,
              167.65,
              100.51,
              61.94
            ]
          },
          {
            id: "skirt_sit",
            tex: "cape_skirt_sit",
            src: "outfits/cape/skirt_sit.png",
            z: 4.95,
            parent: "skirtSit",
            grid: [
              8,
              4
            ],
            box: [
              74.8,
              186.46,
              133.57,
              57
            ]
          },
          {
            id: "cloak",
            tex: "cape_cloak",
            src: "outfits/cape/cloak.png",
            z: 5,
            parent: "waist",
            grid: [
              8,
              8
            ],
            box: [
              73.66,
              152.07,
              114.95,
              78.85
            ]
          },
          {
            id: "hair_front_right",
            tex: "hair_front_right",
            z: 5.05,
            parent: "hairSway",
            grid: [
              4,
              6
            ],
            box: [
              146.62,
              148.27,
              30.21,
              42.75
            ]
          },
          {
            id: "arm_far_end_front",
            tex: "cape_arm_far_end_front",
            src: "outfits/cape/arm_far_end_front.png",
            z: 5.1,
            parent: "armFar",
            grid: [
              3,
              3
            ],
            box: [
              165.62,
              177.15,
              23.75,
              24.32
            ]
          },
          {
            id: "scarf_tail_front",
            tex: "cape_scarf_tail_front",
            src: "outfits/cape/scarf_tail_front.png",
            z: 5.2,
            parent: "scarfFront",
            grid: [
              3,
              4
            ],
            box: [
              141.49,
              150.55,
              43.51,
              57.76
            ]
          },
          {
            id: "hair_front_left",
            tex: "hair_front_left",
            z: 5.4,
            parent: "hairSway",
            grid: [
              4,
              8
            ],
            box: [
              60.93,
              118.63,
              44.84,
              76.57
            ]
          },
          {
            id: "arm_near",
            tex: "cape_arm_near",
            src: "outfits/cape/arm_near.png",
            z: 6,
            parent: "armNear",
            grid: [
              4,
              6
            ],
            box: [
              87.15,
              156.06,
              39.33,
              50.92
            ]
          },
          {
            id: "cloak_shoulder_cover",
            tex: "cape_cloak_shoulder_cover",
            src: "outfits/cape/cloak_shoulder_cover.png",
            z: 6.1,
            parent: "waist",
            grid: [
              3,
              3
            ],
            box: [
              93.99,
              154.73,
              34.2,
              20.14
            ]
          },
          {
            id: "scarf_neck",
            tex: "cape_scarf_neck",
            src: "outfits/cape/scarf_neck.png",
            z: 6.2,
            parent: "waist",
            grid: [
              4,
              3
            ],
            box: [
              103.68,
              144.66,
              58.9,
              36.67
            ]
          },
          {
            id: "hood_fin_far",
            tex: "cape_hood_fin_far",
            src: "outfits/cape/hood_fin_far.png",
            z: 7,
            parent: "finFar",
            grid: [
              4,
              3
            ],
            box: [
              179.49,
              75.88,
              25.65,
              33.06
            ]
          },
          {
            id: "sidelocks",
            tex: "sidelocks",
            z: 7.5,
            parent: "bangsSway",
            grid: [
              4,
              8
            ],
            box: [
              87.72,
              124.14,
              98.23,
              49.21
            ]
          },
          {
            id: "face",
            tex: "face",
            z: 8,
            parent: "headMid",
            grid: [
              6,
              6
            ],
            box: [
              100.26,
              73.98,
              75.62,
              82.08
            ]
          },
          {
            id: "eye_creases",
            tex: "eye_creases",
            z: 8.5,
            parent: "headFeat",
            grid: [
              4,
              2
            ],
            box: [
              126.29,
              108.94,
              44.46,
              9.88
            ]
          },
          {
            id: "brows",
            tex: "brows",
            z: 8.6,
            parent: "headFeat",
            grid: [
              12,
              2
            ],
            box: [
              117.74,
              97.35,
              58.33,
              9.12
            ]
          },
          {
            id: "hood_fin_near",
            tex: "cape_hood_fin_near",
            src: "outfits/cape/hood_fin_near.png",
            z: 11,
            parent: "finNear",
            grid: [
              5,
              3
            ],
            box: [
              42.5,
              72.46,
              50.92,
              40.09
            ]
          },
          {
            id: "bangs",
            tex: "bangs",
            z: 13,
            parent: "bangsSway",
            grid: [
              8,
              10
            ],
            box: [
              80.69,
              51.75,
              112.29,
              99.75
            ]
          },
          {
            id: "hood_tie_far",
            tex: "cape_hood_tie_far",
            src: "outfits/cape/hood_tie_far.png",
            z: 13.3,
            parent: "tieFar",
            grid: [
              2,
              6
            ],
            box: [
              180.44,
              106.85,
              23.94,
              52.06
            ]
          },
          {
            id: "hood_tie_near",
            tex: "cape_hood_tie_near",
            src: "outfits/cape/hood_tie_near.png",
            z: 13.35,
            parent: "tieNear",
            grid: [
              2,
              6
            ],
            box: [
              67.58,
              108.18,
              26.03,
              50.54
            ]
          },
          {
            id: "spout",
            tex: "cape_spout",
            src: "outfits/cape/spout.png",
            z: 13.45,
            parent: "ahoge",
            grid: [
              4,
              4
            ],
            box: [
              101.4,
              15.27,
              43.32,
              36.48
            ]
          },
          {
            id: "hood_front",
            tex: "cape_hood_front",
            src: "outfits/cape/hood_front.png",
            z: 13.5,
            parent: "headFront",
            grid: [
              8,
              6
            ],
            box: [
              49.53,
              37.69,
              151.81,
              104.31
            ]
          }
        ],
        pivots: {
          finNear: [
            79.93,
            87.09
          ],
          finFar: [
            186.52,
            87.85
          ],
          ahoge: [
            123.25,
            46.43
          ]
        },
        deformers: {
          tieNear: {
            parent: "headFront",
            pivot: [
              89.43,
              110.46
            ],
            gain: 1
          },
          tieFar: {
            parent: "headFront",
            pivot: [
              186.9,
              109.13
            ],
            gain: 1
          },
          scarfFront: {
            parent: "waist",
            pivot: [
              153.84,
              158.34
            ],
            gain: 0.5
          },
          scarfBack: {
            parent: "waist",
            pivot: [
              113.56,
              156.63
            ],
            gain: 0.5
          }
        }
      },
      {
        id: "crew",
        pivots: {
          armNear: [
            116.6,
            159.48
          ],
          tail: [
            114,
            199.6
          ]
        },
        deformers: {
          pony: {
            parent: "headBack",
            pivot: [
              91.9,
              59.35
            ],
            gain: 0.35
          }
        },
        heldArms: 0.55,
        tailRoot: true,
        parts: [
          {
            id: "ponytail",
            tex: "crew_ponytail",
            z: 0.8,
            parent: "pony",
            grid: [
              6,
              12
            ],
            box: [
              11.15,
              36.36,
              89.11,
              171.76
            ]
          },
          {
            id: "hair_back",
            tex: "crew_hair_back",
            z: 1,
            parent: "hairSway",
            grid: [
              8,
              12
            ],
            box: [
              75.94,
              48.33,
              114.19,
              105.64
            ]
          },
          {
            id: "tail",
            tex: "tail",
            z: 1.5,
            parent: "tailBend",
            grid: [
              10,
              4
            ],
            box: [
              38.26,
              172.21,
              83.03,
              40.47
            ]
          },
          {
            id: "leg_front",
            tex: "crew_leg_front",
            src: "outfits/crew/leg_front.png",
            z: 3,
            parent: "legFront",
            grid: [
              3,
              10
            ],
            box: [
              128,
              178.67,
              31.73,
              78.28
            ]
          },
          {
            id: "leg_back",
            tex: "crew_leg_back",
            src: "outfits/crew/leg_back.png",
            z: 4,
            parent: "legBack",
            grid: [
              3,
              10
            ],
            box: [
              96.27,
              177.91,
              37.05,
              79.99
            ]
          },
          {
            id: "skirt_shadow",
            tex: "crew_skirt_shadow",
            src: "outfits/crew/skirt_shadow.png",
            z: 4.2,
            parent: "skirt",
            grid: [
              8,
              6
            ],
            box: [
              82.21,
              179.24,
              96.71,
              55.73
            ],
            blend: "multiply"
          },
          {
            id: "arm_far",
            tex: "crew_arm_far",
            src: "outfits/crew/arm_far.png",
            z: 4.5,
            parent: "armFar",
            grid: [
              3,
              5
            ],
            box: [
              145.29,
              164.42,
              27.17,
              37.81
            ]
          },
          {
            id: "torso_up",
            tex: "crew_torso_up",
            src: "outfits/crew/torso_up.png",
            z: 5,
            parent: "body",
            grid: [
              6,
              6
            ],
            box: [
              114.13,
              148.08,
              41.8,
              44.08
            ]
          },
          {
            id: "skirt",
            tex: "crew_skirt",
            z: 5.2,
            parent: "skirt",
            grid: [
              8,
              6
            ],
            box: [
              82.21,
              179.24,
              96.71,
              47.5
            ]
          },
          {
            id: "skirt_sit",
            tex: "crew_skirt_sit",
            z: 5.3,
            parent: "skirtSit",
            grid: [
              8,
              4
            ],
            box: [
              48.2,
              181.33,
              150.29,
              55.86
            ]
          },
          {
            id: "arm_near",
            tex: "crew_arm_near",
            src: "outfits/crew/arm_near.png",
            z: 6,
            parent: "armNear",
            grid: [
              4,
              6
            ],
            box: [
              90,
              154.54,
              35.72,
              53.39
            ]
          },
          {
            id: "fin_far",
            tex: "fin_far",
            z: 7,
            parent: "finFar",
            grid: [
              4,
              3
            ],
            box: [
              166,
              103.62,
              38.76,
              39.14
            ]
          },
          {
            id: "sidelocks",
            tex: "crew_sidelocks",
            z: 7.5,
            parent: "bangsSway",
            grid: [
              4,
              8
            ],
            box: [
              88.1,
              124.71,
              95.95,
              48.45
            ]
          },
          {
            id: "face",
            tex: "face",
            z: 8,
            parent: "headMid",
            grid: [
              6,
              6
            ],
            box: [
              100.26,
              73.98,
              75.62,
              82.08
            ]
          },
          {
            id: "eye_creases",
            tex: "eye_creases",
            z: 8.5,
            parent: "headFeat",
            grid: [
              4,
              2
            ],
            box: [
              126.29,
              108.94,
              44.46,
              9.88
            ]
          },
          {
            id: "brows",
            tex: "brows",
            z: 8.6,
            parent: "headFeat",
            grid: [
              12,
              2
            ],
            box: [
              117.74,
              97.35,
              58.33,
              9.12
            ]
          },
          {
            id: "fin_near",
            tex: "fin_near",
            z: 11,
            parent: "finNear",
            grid: [
              5,
              3
            ],
            box: [
              37.37,
              100.39,
              59.85,
              42.75
            ]
          },
          {
            id: "bangs",
            tex: "bangs",
            z: 13,
            parent: "bangsSway",
            grid: [
              8,
              10
            ],
            box: [
              80.69,
              51.75,
              112.29,
              99.75
            ]
          },
          {
            id: "headset",
            tex: "crew_headset",
            src: "outfits/crew/headset.png",
            z: 13.25,
            parent: "headMid",
            grid: [
              4,
              4
            ],
            box: [
              81.83,
              118.06,
              48.07,
              30.4
            ]
          },
          {
            id: "visor",
            tex: "crew_visor",
            src: "outfits/crew/visor.png",
            z: 13.5,
            parent: "headFront",
            grid: [
              8,
              4
            ],
            box: [
              84.68,
              53.27,
              110.2,
              71.25
            ]
          },
          {
            id: "bow_near",
            tex: "crew_bow_near",
            src: "outfits/crew/bow_near.png",
            z: 13.55,
            parent: "headFront",
            grid: [
              3,
              3
            ],
            box: [
              74.99,
              97.35,
              25.27,
              22.61
            ]
          },
          {
            id: "pony_bow",
            tex: "crew_pony_bow",
            src: "outfits/crew/pony_bow.png",
            z: 13.6,
            parent: "pony",
            grid: [
              3,
              3
            ],
            box: [
              68.53,
              46.43,
              42.18,
              36.67
            ]
          },
          {
            id: "ahoge",
            tex: "ahoge",
            z: 14,
            parent: "ahoge",
            grid: [
              5,
              4
            ],
            box: [
              87.15,
              20.4,
              53.2,
              36.29
            ]
          }
        ]
      }
    ]
  };

  // entry.js
  window.CorticoWhale = { createPet, createWhaleFigure, createSfx, model: model_default };
})();
