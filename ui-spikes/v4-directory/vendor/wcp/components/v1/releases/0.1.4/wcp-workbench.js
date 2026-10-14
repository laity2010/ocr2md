var oo, Jo = class {
  constructor() {
  }
}, ee = class extends Jo {
  constructor(e, t, i, o) {
    super(), this.viewId = e, this.groupId = t, this.panelId = i, this.tabGroupId = o;
  }
}, Te = class ro {
  constructor() {
  }
  static getInstance() {
    return ro.INSTANCE;
  }
  hasData(t) {
    return t && t === this.proto;
  }
  clearData(t) {
    this.hasData(t) && (this.proto = void 0, this.data = void 0);
  }
  getData(t) {
    if (this.hasData(t)) return this.data;
  }
  setData(t, i) {
    i && (this.data = t, this.proto = i);
  }
};
oo = Te;
Te.INSTANCE = new oo();
function W() {
  const e = Te.getInstance();
  if (e.hasData(ee.prototype))
    return e.getData(ee.prototype)[0];
}
let $;
(function(e) {
  e.NONE = { dispose: () => {
  } };
  function t(i) {
    return { dispose: () => {
      i();
    } };
  }
  e.from = t;
})($ || ($ = {}));
var I = class {
  get isDisposed() {
    return this._isDisposed;
  }
  constructor(...e) {
    this._isDisposed = !1, this._disposables = new Set(e);
  }
  addDisposables(...e) {
    e.forEach((t) => this._disposables.add(t));
  }
  removeDisposable(e) {
    this._disposables.delete(e);
  }
  dispose() {
    this._isDisposed || (this._isDisposed = !0, this._disposables.forEach((e) => e.dispose()), this._disposables.clear());
  }
}, j = class {
  constructor() {
    this._disposable = $.NONE;
  }
  get value() {
    return this._disposable === $.NONE ? void 0 : this._disposable;
  }
  set value(e) {
    this._disposable && this._disposable.dispose(), this._disposable = e;
  }
  dispose() {
    this._disposable && (this._disposable.dispose(), this._disposable = $.NONE);
  }
};
let ie;
(function(e) {
  e.any = (...t) => (i) => {
    const o = t.map((r) => r(i));
    return { dispose: () => {
      o.forEach((r) => {
        r.dispose();
      });
    } };
  };
})(ie || (ie = {}));
var Ht = class {
  constructor() {
    this._defaultPrevented = !1;
  }
  get defaultPrevented() {
    return this._defaultPrevented;
  }
  preventDefault() {
    this._defaultPrevented = !0;
  }
}, Qo = class {
  constructor() {
    this._isAccepted = !1;
  }
  get isAccepted() {
    return this._isAccepted;
  }
  accept() {
    this._isAccepted = !0;
  }
}, er = class {
  constructor() {
    this.events = /* @__PURE__ */ new Map();
  }
  get size() {
    return this.events.size;
  }
  add(e, t) {
    this.events.set(e, t);
  }
  delete(e) {
    this.events.delete(e);
  }
  clear() {
    this.events.clear();
  }
}, hi = class no {
  static create() {
    var t;
    return new no((t = (/* @__PURE__ */ new Error("listener stacktrace")).stack) !== null && t !== void 0 ? t : "");
  }
  constructor(t) {
    this.value = t;
  }
  print() {
    console.warn("dockview: stacktrace", this.value);
  }
}, tr = class {
  constructor(e, t) {
    this.callback = e, this.stacktrace = t;
  }
}, D = class re {
  static setLeakageMonitorEnabled(t) {
    t !== re.ENABLE_TRACKING && re.MEMORY_LEAK_WATCHER.clear(), re.ENABLE_TRACKING = t;
  }
  get value() {
    return this._last;
  }
  constructor(t) {
    this.options = t, this._listeners = [], this._disposed = !1;
  }
  get event() {
    return this._event || (this._event = (t) => {
      var i;
      !((i = this.options) === null || i === void 0) && i.replay && this._last !== void 0 && t(this._last);
      const o = new tr(t, re.ENABLE_TRACKING ? hi.create() : void 0);
      return this._listeners.push(o), { dispose: () => {
        const r = this._listeners.indexOf(o);
        r > -1 && this._listeners.splice(r, 1);
      } };
    }, re.ENABLE_TRACKING && re.MEMORY_LEAK_WATCHER.add(this._event, hi.create())), this._event;
  }
  fire(t) {
    var i;
    if (this._pauseTokens !== void 0 && this._pauseTokens.size > 0) return;
    !((i = this.options) === null || i === void 0) && i.replay && (this._last = t);
    const o = this._listeners, r = o.length;
    if (r !== 0) {
      if (r === 1) {
        o[0].callback(t);
        return;
      }
      for (const n of o.slice()) n.callback(t);
    }
  }
  pause() {
    var t;
    const i = {};
    return (t = this._pauseTokens) !== null && t !== void 0 || (this._pauseTokens = /* @__PURE__ */ new Set()), this._pauseTokens.add(i), $.from(() => {
      var o;
      return (o = this._pauseTokens) === null || o === void 0 ? void 0 : o.delete(i);
    });
  }
  dispose() {
    this._disposed || (this._disposed = !0, this._listeners.length > 0 && (re.ENABLE_TRACKING ? queueMicrotask(() => {
      for (const i of this._listeners) {
        var t;
        console.warn("dockview: stacktrace", (t = i.stacktrace) === null || t === void 0 ? void 0 : t.print());
      }
      this._listeners = [];
    }) : this._listeners = []), re.ENABLE_TRACKING && this._event && re.MEMORY_LEAK_WATCHER.delete(this._event));
  }
};
D.ENABLE_TRACKING = !1;
D.MEMORY_LEAK_WATCHER = new er();
function T(e, t, i, o) {
  return e.addEventListener(t, i, o), { dispose: () => {
    e.removeEventListener(t, i, o);
  } };
}
var vi = class {
  constructor() {
    this._onFired = new D(), this._currentFireCount = 0, this._queued = !1, this.onEvent = (e) => {
      const t = this._currentFireCount;
      return this._onFired.event(() => {
        this._currentFireCount > t && e();
      });
    };
  }
  fire() {
    this._currentFireCount++, !this._queued && (this._queued = !0, queueMicrotask(() => {
      this._queued = !1, this._onFired.fire();
    }));
  }
  dispose() {
    this._onFired.dispose();
  }
}, ir = class extends I {
  constructor(e) {
    super(), this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._value = null, this.addDisposables(this._onDidChange, ke(e, (t) => {
      const i = t.target.scrollWidth > t.target.clientWidth, o = t.target.scrollHeight > t.target.clientHeight;
      this._value = {
        hasScrollX: i,
        hasScrollY: o
      }, this._onDidChange.fire(this._value);
    }));
  }
};
function ke(e, t) {
  const i = /* @__PURE__ */ new Set(), o = new ResizeObserver((r) => {
    let n = !1, s;
    s = requestAnimationFrame(() => {
      n = !0, s !== void 0 && i.delete(s);
      const a = r[0];
      t(a);
    }), n || i.add(s);
  });
  return o.observe(e), { dispose: () => {
    o.unobserve(e), o.disconnect();
    for (const r of i) cancelAnimationFrame(r);
    i.clear();
  } };
}
const le = (e, ...t) => {
  for (const i of t) e.classList.contains(i) && e.classList.remove(i);
}, ce = (e, ...t) => {
  for (const i of t) e.classList.contains(i) || e.classList.add(i);
}, z = (e, t, i) => {
  const o = e.classList.contains(t);
  i && !o && e.classList.add(t), !i && o && e.classList.remove(t);
};
function St(e, t) {
  for (; e; ) {
    if (e === t) return !0;
    e = e.parentNode;
  }
  return !1;
}
function so(e) {
  return new or(e);
}
var or = class extends I {
  constructor(e) {
    super(), this._onDidFocus = new D(), this.onDidFocus = this._onDidFocus.event, this._onDidBlur = new D(), this.onDidBlur = this._onDidBlur.event, this.addDisposables(this._onDidFocus, this._onDidBlur);
    let t = St(Tt(e), e), i = !1;
    const o = () => {
      i = !1, t || (t = !0, this._onDidFocus.fire());
    }, r = () => {
      t && (i = !0, globalThis.setTimeout(() => {
        i && (i = !1, t = !1, this._onDidBlur.fire());
      }, 0));
    };
    this._refreshStateHandler = () => {
      St(Tt(e), e) !== t && (t ? r() : o());
    }, this.addDisposables(T(e, "focus", o, !0)), this.addDisposables(T(e, "blur", r, !0));
  }
  refreshState() {
    this._refreshStateHandler();
  }
};
const ao = "dv-quasiPreventDefault";
function lo(e) {
  e[ao] = !0;
}
function pi(e) {
  return e[ao];
}
function Gt(e, t) {
  var i, o;
  const r = (i = (o = e.composedPath) === null || o === void 0 ? void 0 : o.call(e)) !== null && i !== void 0 ? i : [];
  if (r.length > 0) return t.some((s) => r.includes(s));
  const n = e.target;
  return n instanceof Node && t.some((s) => s.contains(n));
}
function rr(e) {
  const t = [];
  let i = e.getRootNode();
  for (; Ae(i); )
    t.push(i), i = i.host.getRootNode();
  return t;
}
function nr(e, t) {
  const i = t?.getRootNode();
  let o = e, r = o.getRootNode();
  for (; r !== i && Ae(r); )
    o = r.host, r = o.getRootNode();
  return o;
}
function ui(e, t, i = {}) {
  const o = Array.from(t), { nonce: r } = i, n = typeof r == "function" ? r(e) : r;
  for (const s of o) {
    if (s.href) {
      const c = e.createElement("link");
      c.href = s.href, c.type = s.type, c.rel = "stylesheet", n && c.setAttribute("nonce", n), e.head.appendChild(c);
      continue;
    }
    let a = [];
    try {
      s.cssRules && (a = Array.from(s.cssRules).map((c) => c.cssText));
    } catch (c) {
      console.warn("dockview: failed to access stylesheet rules due to security restrictions", c);
    }
    const d = e.createDocumentFragment();
    for (const c of a) {
      const l = e.createElement("style");
      n && l.setAttribute("nonce", n), l.appendChild(e.createTextNode(c)), d.appendChild(l);
    }
    e.head.appendChild(d);
  }
}
function Pt(e) {
  const { left: t, top: i, width: o, height: r } = e.getBoundingClientRect();
  return {
    left: t + window.scrollX,
    top: i + window.scrollY,
    width: o,
    height: r
  };
}
function st(e) {
  let t = e;
  for (; t?.parentNode; ) {
    if (t.parentNode === document) return !0;
    t.parentNode instanceof DocumentFragment ? t = t.parentNode.host : t = t.parentNode;
  }
  return !1;
}
function Ae(e) {
  return !!e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in e && !!e.host;
}
function zt(e) {
  var t;
  const i = e.getRootNode();
  return i !== e && typeof i.elementsFromPoint == "function" ? i : (t = e.ownerDocument) !== null && t !== void 0 ? t : document;
}
function sr(e, t) {
  e.dataset.testid = t;
}
function ar(e, t) {
  const i = [];
  function o(r) {
    if (r.nodeType === Node.ELEMENT_NODE) {
      e.includes(r.tagName) && i.push(r), r.shadowRoot && o(r.shadowRoot);
      for (const n of r.children) o(n);
    }
  }
  return o(t instanceof Document ? t.documentElement : t), i;
}
function We(e = document) {
  const t = ar(["IFRAME", "WEBVIEW"], e), i = /* @__PURE__ */ new WeakMap();
  for (const o of t)
    i.set(o, o.style.pointerEvents), o.style.pointerEvents = "none";
  return { release: () => {
    for (const r of t) {
      var o;
      r.style.pointerEvents = (o = i.get(r)) !== null && o !== void 0 ? o : "auto";
    }
    t.splice(0, t.length);
  } };
}
function co(e = document) {
  const t = e instanceof Document ? e : e.ownerDocument, i = t?.documentElement;
  if (!t || !i) return { release: () => {
  } };
  const o = ["user-select", "-webkit-user-select"], r = o.map((s) => [s, i.style.getPropertyValue(s)]);
  for (const s of o) i.style.setProperty(s, "none");
  const n = (s) => s.preventDefault();
  return t.addEventListener("selectstart", n), { release: () => {
    t.removeEventListener("selectstart", n);
    for (const [s, a] of r) a ? i.style.setProperty(s, a) : i.style.removeProperty(s);
  } };
}
function dr(e) {
  function t(r) {
    const n = [];
    for (let s = 0; s < r.classList.length; s++) n.push(r.classList.item(s));
    return n;
  }
  let i, o = e;
  for (; o !== null && (i = t(o).find((r) => r.startsWith("dockview-theme-")), typeof i != "string"); ) {
    if (o.parentElement === null) {
      const r = o.getRootNode();
      o = Ae(r) ? r.host : null;
      continue;
    }
    o = o.parentElement;
  }
  return i;
}
var ho = class {
  constructor(e) {
    this.element = e, this._classNames = [];
  }
  setClassNames(e) {
    for (const t of this._classNames) z(this.element, t, !1);
    this._classNames = e.split(" ").filter((t) => t.trim().length > 0);
    for (const t of this._classNames) z(this.element, t, !0);
  }
};
const vo = 100;
function ft(e, t) {
  const i = Pt(e), o = Pt(t);
  return !(i.left < o.left || i.left + i.width > o.left + o.width || i.top < o.top || i.top + i.height > o.top + o.height);
}
function lr(e) {
  const t = new D();
  let i = e.screenX, o = e.screenY, r, n = 0, s = !1;
  const a = () => {
    if (s || e.closed) return;
    const c = e.screenX, l = e.screenY;
    (c !== i || l !== o) && (clearTimeout(r), r = setTimeout(() => {
      t.fire();
    }, vo), i = c, o = l), n = requestAnimationFrame(a);
  };
  a();
  const d = t.dispose.bind(t);
  return t.dispose = () => {
    s || (s = !0, cancelAnimationFrame(n), clearTimeout(r)), d();
  }, t;
}
function cr(e, t) {
  let i;
  return new I(T(e, "resize", () => {
    clearTimeout(i), i = setTimeout(() => {
      t();
    }, vo);
  }));
}
function hr(e, t, i) {
  var o;
  const r = (o = void 0) !== null && o !== void 0 ? o : 10, n = e.getBoundingClientRect(), s = t.getBoundingClientRect();
  let a = 0, d = 0;
  const c = n.left - s.left, l = n.top - s.top, h = n.bottom - s.bottom, v = n.right - s.right;
  c < r ? a = r - c : v > r && (a = -r - v), l < r ? d = r - l : h > r && (d = -h - r), (a !== 0 || d !== 0) && (e.style.transform = `translate(${a}px, ${d}px)`);
}
function po(e) {
  let t = e;
  for (; t && (t.style.zIndex === "auto" || t.style.zIndex === ""); ) t = t.parentElement;
  return t;
}
function Tt(e) {
  var t;
  const i = e.getRootNode(), o = i.nodeType === Node.DOCUMENT_NODE ? i : e.ownerDocument;
  return o && typeof o.hasFocus == "function" && !o.hasFocus() ? null : (t = i.activeElement) !== null && t !== void 0 ? t : null;
}
function uo(e) {
  var t;
  const i = e.getRootNode();
  return Ae(i) ? i : ((t = e.ownerDocument) !== null && t !== void 0 ? t : document).body;
}
function gi(e, t, i, o, r, n, s) {
  try {
    var a = e[n](s), d = a.value;
  } catch (c) {
    i(c);
    return;
  }
  a.done ? t(d) : Promise.resolve(d).then(o, r);
}
function go(e) {
  return function() {
    var t = this, i = arguments;
    return new Promise(function(o, r) {
      var n = e.apply(t, i);
      function s(d) {
        gi(n, o, r, s, a, "next", d);
      }
      function a(d) {
        gi(n, o, r, s, a, "throw", d);
      }
      s(void 0);
    });
  };
}
function vr(e) {
  const t = bo(e);
  if (t) throw t;
}
const pr = /* @__PURE__ */ new Set([
  "javascript:",
  "data:",
  "blob:",
  "vbscript:",
  "file:"
]), ur = 250;
function bo(e, t = globalThis.location) {
  let i;
  try {
    i = new URL(e, t.href);
  } catch {
    return /* @__PURE__ */ new Error(`dockview: invalid popout URL: ${e}`);
  }
  if (pr.has(i.protocol)) return /* @__PURE__ */ new Error(`dockview: popout URL must not use the "${i.protocol}" protocol, which would run in the opener's context; got: ${e}`);
  if (!(i.protocol === t.protocol && i.host === t.host)) return /* @__PURE__ */ new Error(`dockview: popout URL must be same-origin with the page (${t.protocol}//${t.host}); got: ${e}`);
}
var gr = class extends I {
  get window() {
    var e, t;
    return (e = (t = this._window) === null || t === void 0 ? void 0 : t.value) !== null && e !== void 0 ? e : null;
  }
  /** Set when {@link open} resolved `null`, saying which way it failed. */
  get failure() {
    return this._failure;
  }
  constructor(e, t, i) {
    super(), this.target = e, this.className = t, this.options = i, this._onWillClose = new D(), this.onWillClose = this._onWillClose.event, this._onDidClose = new D(), this.onDidClose = this._onDidClose.event, this._window = null, this.addDisposables(this._onWillClose, this._onDidClose, { dispose: () => {
      this.close();
    } });
  }
  dimensions() {
    if (!this._window) return null;
    const e = this._window.value.screenX;
    return {
      top: this._window.value.screenY,
      left: e,
      width: this._window.value.innerWidth,
      height: this._window.value.innerHeight
    };
  }
  close() {
    var e, t;
    const i = this._window;
    i && (this._window = null, this._onWillClose.fire(), (e = (t = this.options).onWillClose) === null || e === void 0 || e.call(t, {
      id: this.target,
      window: i.value
    }), i.disposable.dispose(), this._onDidClose.fire());
  }
  open() {
    var e = this;
    return go(function* () {
      var t, i;
      if (e._window) throw new Error("instance of popout window is already open");
      const o = `${e.options.url}`;
      vr(o);
      const r = Object.entries({
        top: e.options.top,
        left: e.options.left,
        width: e.options.width,
        height: e.options.height
      }).map(([d, c]) => `${d}=${c}`).join(","), n = window.open(o, e.target, r);
      if (!n)
        return e._failure = { reason: "blocked" }, null;
      const s = new I();
      e._window = {
        value: n,
        disposable: s
      }, s.addDisposables($.from(() => {
        n.close();
      }), e.watchForClose(n), T(globalThis.window, "beforeunload", () => {
        e.close();
      }));
      const a = e.createPopoutWindowContainer();
      return e.className && a.classList.add(e.className), (t = (i = e.options).onDidOpen) === null || t === void 0 || t.call(i, {
        id: e.target,
        window: n
      }), new Promise((d) => {
        const c = (l) => {
          e._failure = {
            reason: "unscriptable",
            error: l instanceof Error ? l : new Error(String(l))
          }, e.close(), d(null);
        };
        try {
          n.addEventListener("unload", () => {
          });
        } catch (l) {
          c(l);
          return;
        }
        s.addDisposables(e.onWillClose(() => {
          var l;
          (l = e._failure) !== null && l !== void 0 || (e._failure = { reason: "closed" }), d(null);
        })), n.addEventListener("load", () => {
          try {
            var l, h, v;
            const g = n.document;
            g.title = document.title, g.body.appendChild(a), ui(g, [...Array.from(globalThis.document.styleSheets), ...(l = globalThis.document.adoptedStyleSheets) !== null && l !== void 0 ? l : []], { nonce: e.options.nonce });
            const _ = [];
            for (let C = (h = (v = e.options).styleRoot) === null || h === void 0 ? void 0 : h.call(v); Ae(C); C = C.host.getRootNode()) {
              var p, u;
              _.push(...Array.from((p = C.styleSheets) !== null && p !== void 0 ? p : []), ...(u = C.adoptedStyleSheets) !== null && u !== void 0 ? u : []);
            }
            _.length > 0 && ui(g, _, { nonce: e.options.nonce }), T(n, "beforeunload", () => {
              e.close();
            }), d(a);
          } catch (g) {
            c(g);
          }
        });
      });
    })();
  }
  /**
  * Backstop for the `beforeunload` signal, which a window torn down without
  * running its unload handlers never sends: a native shell destroying the
  * webview, or a browser discarding the page. `closed` is readable on any
  * handle, cross-origin included. Whichever signal arrives first wins.
  */
  watchForClose(e) {
    if (typeof e.closed != "boolean") return $.NONE;
    const t = setInterval(() => {
      e.closed && this.close();
    }, ur);
    return $.from(() => {
      clearInterval(t);
    });
  }
  createPopoutWindowContainer() {
    const e = document.createElement("div");
    return e.classList.add("dv-popout-window"), e.id = "dv-popout-window", e.style.position = "absolute", e.style.width = "100%", e.style.height = "100%", e.style.top = "0px", e.style.left = "0px", e;
  }
};
function de(e) {
  if (e.length === 0) throw new Error("Invalid tail call");
  return [e.slice(0, e.length - 1), e[e.length - 1]];
}
function bi(e, t) {
  if (e.length !== t.length) return !1;
  for (let i = 0; i < e.length; i++) if (e[i] !== t[i]) return !1;
  return !0;
}
function _t(e, t) {
  const i = e.indexOf(t);
  i > -1 && (e.splice(i, 1), e.unshift(t));
}
function Xe(e, t) {
  const i = e.indexOf(t);
  i > -1 && (e.splice(i, 1), e.push(t));
}
function br(e, t) {
  for (let i = 0; i < e.length; i++) {
    const o = e[i];
    if (t(o)) return i;
  }
  return -1;
}
function mo(e, t) {
  const i = e.indexOf(t);
  return i > -1 ? (e.splice(i, 1), !0) : !1;
}
const N = (e, t, i) => t > i ? t : Math.min(i, Math.max(e, t)), fo = () => {
  let e = 1;
  return { next: () => (e++).toString() };
}, oe = (e, t) => {
  const i = [];
  if (typeof t != "number" && (t = e, e = 0), e <= t) for (let o = e; o < t; o++) i.push(o);
  else for (let o = e; o > t; o--) i.push(o);
  return i;
};
var mr = class {
  set size(e) {
    this._size = e;
  }
  setContainerGeometry(e, t) {
    this._appliedStyles[e] !== t && (this._appliedStyles[e] = t, this.container.style[e] = t);
  }
  get size() {
    return this._size;
  }
  get cachedVisibleSize() {
    return this._cachedVisibleSize;
  }
  get visible() {
    return this._cachedVisibleSize === void 0;
  }
  get minimumSize() {
    return this.visible ? this.view.minimumSize : 0;
  }
  get viewMinimumSize() {
    return this.view.minimumSize;
  }
  get maximumSize() {
    return this.visible ? this.view.maximumSize : 0;
  }
  get viewMaximumSize() {
    return this.view.maximumSize;
  }
  get priority() {
    return this.view.priority;
  }
  get snap() {
    return !!this.view.snap;
  }
  set enabled(e) {
    this.container.style.pointerEvents = e ? "" : "none";
  }
  constructor(e, t, i, o) {
    this.container = e, this.view = t, this.disposable = o, this._cachedVisibleSize = void 0, this._appliedStyles = {}, typeof i == "number" ? (this._size = i, this._cachedVisibleSize = void 0, e.classList.add("visible")) : (this._size = 0, this._cachedVisibleSize = i.cachedVisibleSize);
  }
  setVisible(e, t) {
    if (e !== this.visible) {
      if (e) {
        var i;
        this.size = N((i = this._cachedVisibleSize) !== null && i !== void 0 ? i : 0, this.viewMinimumSize, this.viewMaximumSize), this._cachedVisibleSize = void 0;
      } else
        this._cachedVisibleSize = typeof t == "number" ? t : this.size, this.size = 0;
      this.container.classList.toggle("visible", e), this.view.setVisible && this.view.setVisible(e);
    }
  }
  dispose() {
    return this.disposable.dispose(), this.view;
  }
};
function mi(e, t, i) {
  e.appliedLeft !== t && (e.appliedLeft = t, e.container.style.left = t), e.appliedTop !== i && (e.appliedTop = i, e.container.style.top = i);
}
let q;
(function(e) {
  e.Distribute = { type: "distribute" };
  function t(o) {
    return {
      type: "split",
      index: o
    };
  }
  e.Split = t;
  function i(o) {
    return {
      type: "invisible",
      cachedVisibleSize: o
    };
  }
  e.Invisible = i;
})(q || (q = {}));
var at = class {
  get contentSize() {
    return this._contentSize;
  }
  get size() {
    return this._size;
  }
  set size(e) {
    this._size = e;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  set orthogonalSize(e) {
    this._orthogonalSize = e;
  }
  get length() {
    return this.viewItems.length;
  }
  get proportions() {
    return this._proportions ? [...this._proportions] : void 0;
  }
  get proportionalLayout() {
    return this._proportionalLayout;
  }
  set proportionalLayout(e) {
    this._proportionalLayout !== e && (this._proportionalLayout = e, e ? this.saveProportions() : this._proportions = void 0);
  }
  get orientation() {
    return this._orientation;
  }
  set orientation(e) {
    this._orientation = e;
    const t = this.size;
    this.size = this.orthogonalSize, this.orthogonalSize = t, le(this.element, "dv-horizontal", "dv-vertical"), this.element.classList.add(this.orientation == "HORIZONTAL" ? "dv-horizontal" : "dv-vertical");
  }
  get minimumSize() {
    return this.viewItems.reduce((e, t) => e + t.minimumSize, 0);
  }
  get maximumSize() {
    return this.length === 0 ? Number.POSITIVE_INFINITY : this.viewItems.reduce((e, t) => e + t.maximumSize, 0);
  }
  get startSnappingEnabled() {
    return this._startSnappingEnabled;
  }
  set startSnappingEnabled(e) {
    this._startSnappingEnabled !== e && (this._startSnappingEnabled = e, this.updateSashEnablement());
  }
  get endSnappingEnabled() {
    return this._endSnappingEnabled;
  }
  set endSnappingEnabled(e) {
    this._endSnappingEnabled !== e && (this._endSnappingEnabled = e, this.updateSashEnablement());
  }
  get disabled() {
    return this._disabled;
  }
  set disabled(e) {
    this._disabled = e, z(this.element, "dv-splitview-disabled", e);
  }
  get margin() {
    return this._margin;
  }
  set margin(e) {
    this._margin = e, z(this.element, "dv-splitview-has-margin", e !== 0);
  }
  constructor(e, t) {
    var i, o;
    this.container = e, this.viewItems = [], this.sashes = [], this._size = 0, this._orthogonalSize = 0, this._contentSize = 0, this._proportions = void 0, this._startSnappingEnabled = !0, this._endSnappingEnabled = !0, this._disabled = !1, this._margin = 0, this._onDidSashEnd = new D(), this.onDidSashEnd = this._onDidSashEnd.event, this._onDidAddView = new D(), this.onDidAddView = this._onDidAddView.event, this._onDidRemoveView = new D(), this.onDidRemoveView = this._onDidRemoveView.event, this.resize = (r, n, s = this.viewItems.map((p) => p.size), a, d, c = Number.NEGATIVE_INFINITY, l = Number.POSITIVE_INFINITY, h, v) => {
      if (r < 0 || r > this.viewItems.length) return 0;
      const p = oe(r, -1), u = oe(r + 1, this.viewItems.length);
      if (d) for (const b of d)
        _t(p, b), _t(u, b);
      if (a) for (const b of a)
        Xe(p, b), Xe(u, b);
      const g = p.reduce((b, m) => b + this.viewItems[m].minimumSize - s[m], 0), _ = p.reduce((b, m) => b + this.viewItems[m].maximumSize - s[m], 0), C = u.length === 0 ? Number.POSITIVE_INFINITY : u.reduce((b, m) => b + s[m] - this.viewItems[m].minimumSize, 0), k = u.length === 0 ? Number.NEGATIVE_INFINITY : u.reduce((b, m) => b + s[m] - this.viewItems[m].maximumSize, 0), y = Math.max(g, k), P = Math.min(C, _);
      let M = !1;
      if (h) {
        const b = this.viewItems[h.index], m = n >= h.limitDelta;
        M = m !== b.visible, b.setVisible(m, h.size);
      }
      if (!M && v) {
        const b = this.viewItems[v.index], m = n < v.limitDelta;
        M = m !== b.visible, b.setVisible(m, v.size);
      }
      if (M) return this.resize(r, n, s, a, d, c, l);
      const E = N(n, y, P);
      let w = 0, x = E;
      for (const b of p) {
        const m = this.viewItems[b], S = s[b], G = N(S + x, m.minimumSize, m.maximumSize), A = G - S;
        w += A, x -= A, m.size = G;
      }
      let f = w;
      for (const b of u) {
        const m = this.viewItems[b], S = s[b], G = N(S - f, m.minimumSize, m.maximumSize), A = G - S;
        f += A, m.size = G;
      }
      return n;
    }, this._orientation = (i = t.orientation) !== null && i !== void 0 ? i : "VERTICAL", this.element = this.createContainer(), this.margin = (o = t.margin) !== null && o !== void 0 ? o : 0, this._proportionalLayout = t.proportionalLayout === void 0 ? !0 : !!t.proportionalLayout, this.viewContainer = this.createViewContainer(), this.sashContainer = this.createSashContainer(), this.element.appendChild(this.sashContainer), this.element.appendChild(this.viewContainer), this.container.appendChild(this.element), this.style(t.styles), t.descriptor && (this._size = t.descriptor.size, t.descriptor.views.forEach((r, n) => {
      const s = r.visible === void 0 || r.visible ? r.size : {
        type: "invisible",
        cachedVisibleSize: r.size
      }, a = r.view;
      this.addView(a, s, n, !0);
    }), this._contentSize = this.viewItems.reduce((r, n) => r + n.size, 0), this.saveProportions());
  }
  style(e) {
    e?.separatorBorder === "transparent" ? (le(this.element, "dv-separator-border"), this.element.style.removeProperty("--dv-separator-border")) : (ce(this.element, "dv-separator-border"), e?.separatorBorder && this.element.style.setProperty("--dv-separator-border", e.separatorBorder));
  }
  isViewVisible(e) {
    if (e < 0 || e >= this.viewItems.length) throw new Error("Index out of bounds");
    return this.viewItems[e].visible;
  }
  setViewVisible(e, t) {
    if (e < 0 || e >= this.viewItems.length) throw new Error("Index out of bounds");
    const i = this.viewItems[e];
    i.setVisible(t, i.size), this.distributeEmptySpace(e), this.layoutViews(), this.saveProportions();
  }
  getViewSize(e) {
    return e < 0 || e >= this.viewItems.length ? -1 : this.viewItems[e].size;
  }
  resizeView(e, t) {
    if (e < 0 || e >= this.viewItems.length) return;
    const i = oe(this.viewItems.length).filter((s) => s !== e), o = [...i.filter((s) => this.viewItems[s].priority === "low"), e], r = i.filter((s) => this.viewItems[s].priority === "high"), n = this.viewItems[e];
    t = Math.round(t), t = N(t, n.minimumSize, Math.min(n.maximumSize, this._size)), n.size = t, this.relayout(o, r);
  }
  getViews() {
    return this.viewItems.map((e) => e.view);
  }
  onDidChange(e, t) {
    const i = this.viewItems.indexOf(e);
    if (i < 0 || i >= this.viewItems.length) return;
    t = typeof t == "number" ? t : e.size, t = N(t, e.minimumSize, e.maximumSize), e.size = t;
    const o = oe(this.viewItems.length).filter((s) => s !== i), r = [...o.filter((s) => this.viewItems[s].priority === "low"), i], n = o.filter((s) => this.viewItems[s].priority === "high");
    this.relayout([...r, i], n);
  }
  addView(e, t = q.Distribute, i = this.viewItems.length, o) {
    const r = document.createElement("div");
    r.className = "dv-view", r.appendChild(e.element);
    let n;
    if (typeof t == "number") n = t;
    else if (t.type === "split") {
      const d = this.viewItems[t.index];
      if (d) {
        const c = Math.floor(d.size / 2);
        n = d.size - c, d.size = c;
      } else n = this.getViewSize(t.index) / 2;
    } else t.type === "invisible" ? n = { cachedVisibleSize: t.cachedVisibleSize } : n = e.minimumSize;
    const s = e.onDidChange((d) => this.onDidChange(a, d.size)), a = new mr(r, e, n, { dispose: () => {
      s.dispose(), r.remove();
    } });
    if (i === this.viewItems.length ? this.viewContainer.appendChild(r) : this.viewContainer.insertBefore(r, this.viewContainer.children.item(i)), this.viewItems.splice(i, 0, a), this.viewItems.length > 1) {
      const d = document.createElement("div");
      d.className = "dv-sash";
      const c = (h) => {
        var v;
        for (const R of this.viewItems) R.enabled = !1;
        const p = (v = d.ownerDocument) !== null && v !== void 0 ? v : document, u = We(p), g = this._orientation === "HORIZONTAL" ? h.clientX : h.clientY, _ = br(this.sashes, (R) => R.container === d), C = this.viewItems.map((R) => R.size);
        let k, y;
        const P = oe(_, -1), M = oe(_ + 1, this.viewItems.length), E = P.reduce((R, L) => R + (this.viewItems[L].minimumSize - C[L]), 0), w = P.reduce((R, L) => R + (this.viewItems[L].viewMaximumSize - C[L]), 0), x = M.length === 0 ? Number.POSITIVE_INFINITY : M.reduce((R, L) => R + (C[L] - this.viewItems[L].minimumSize), 0), f = M.length === 0 ? Number.NEGATIVE_INFINITY : M.reduce((R, L) => R + (C[L] - this.viewItems[L].viewMaximumSize), 0), b = Math.max(E, f), m = Math.min(x, w), S = this.findFirstSnapIndex(P), G = this.findFirstSnapIndex(M);
        if (typeof S == "number") {
          const R = this.viewItems[S], L = Math.floor(R.viewMinimumSize / 2);
          k = {
            index: S,
            limitDelta: R.visible ? b - L : b + L,
            size: R.size
          };
        }
        if (typeof G == "number") {
          const R = this.viewItems[G], L = Math.floor(R.viewMinimumSize / 2);
          y = {
            index: G,
            limitDelta: R.visible ? m + L : m - L,
            size: R.size
          };
        }
        const A = (R) => {
          const L = (this._orientation === "HORIZONTAL" ? R.clientX : R.clientY) - g;
          this.resize(_, L, C, void 0, void 0, b, m, k, y), this.distributeEmptySpace(), this.layoutViews();
        }, V = () => {
          for (const R of this.viewItems) R.enabled = !0;
          u.release(), this.saveProportions(), p.removeEventListener("pointermove", A), p.removeEventListener("pointerup", V), p.removeEventListener("pointercancel", V), p.removeEventListener("contextmenu", V), this._onDidSashEnd.fire(void 0);
        };
        p.addEventListener("pointermove", A), p.addEventListener("pointerup", V), p.addEventListener("pointercancel", V), p.addEventListener("contextmenu", V);
      };
      d.addEventListener("pointerdown", c);
      const l = {
        container: d,
        disposable: () => {
          d.removeEventListener("pointerdown", c), d.remove();
        }
      };
      this.sashContainer.appendChild(d), this.sashes.push(l);
    }
    o || this.relayout([i]), !o && typeof t != "number" && t.type === "distribute" && this.distributeViewSizes(), this._onDidAddView.fire(e);
  }
  distributeViewSizes() {
    const e = [];
    let t = 0;
    for (const s of this.viewItems) s.maximumSize - s.minimumSize > 0 && (e.push(s), t += s.size);
    const i = Math.floor(t / e.length);
    for (const s of e) s.size = N(i, s.minimumSize, s.maximumSize);
    const o = oe(this.viewItems.length), r = o.filter((s) => this.viewItems[s].priority === "low"), n = o.filter((s) => this.viewItems[s].priority === "high");
    this.relayout(r, n);
  }
  removeView(e, t, i = !1) {
    const o = this.viewItems.splice(e, 1)[0];
    if (o.dispose(), this.viewItems.length >= 1) {
      const r = Math.max(e - 1, 0);
      this.sashes.splice(r, 1)[0].disposable();
    }
    return i || this.relayout(), t?.type === "distribute" && this.distributeViewSizes(), this._onDidRemoveView.fire(o.view), o.view;
  }
  getViewCachedVisibleSize(e) {
    if (e < 0 || e >= this.viewItems.length) throw new Error("Index out of bounds");
    return this.viewItems[e].cachedVisibleSize;
  }
  moveView(e, t) {
    const i = this.getViewCachedVisibleSize(e), o = i === void 0 ? this.getViewSize(e) : q.Invisible(i), r = this.removeView(e, void 0, !0);
    this.addView(r, o, t);
  }
  layout(e, t) {
    const i = Math.max(this.size, this._contentSize);
    if (this.size = e, this.orthogonalSize = t, this.proportions) {
      let o = 0;
      for (let r = 0; r < this.viewItems.length; r++) {
        const n = this.viewItems[r], s = this.proportions[r];
        typeof s == "number" ? o += s : e -= n.size;
      }
      for (let r = 0; r < this.viewItems.length; r++) {
        const n = this.viewItems[r], s = this.proportions[r];
        typeof s == "number" && o > 0 && (n.size = N(Math.round(s * e / o), n.minimumSize, n.maximumSize));
      }
    } else {
      const o = oe(this.viewItems.length), r = o.filter((s) => this.viewItems[s].priority === "low"), n = o.filter((s) => this.viewItems[s].priority === "high");
      this.resize(this.viewItems.length - 1, e - i, void 0, r, n);
    }
    this.distributeEmptySpace(), this.layoutViews();
  }
  relayout(e, t) {
    const i = this.viewItems.reduce((o, r) => o + r.size, 0);
    this.resize(this.viewItems.length - 1, this._size - i, void 0, e, t), this.distributeEmptySpace(), this.layoutViews(), this.saveProportions();
  }
  distributeEmptySpace(e) {
    let t = 0;
    for (const n of this.viewItems) t += n.size;
    let i = this.size - t;
    if (i === 0) return;
    const o = oe(this.viewItems.length - 1, -1);
    let r = !1;
    for (const n of this.viewItems) if (n.priority === "low" || n.priority === "high") {
      r = !0;
      break;
    }
    if (r) {
      const n = o.filter((a) => this.viewItems[a].priority === "low"), s = o.filter((a) => this.viewItems[a].priority === "high");
      for (const a of s) _t(o, a);
      for (const a of n) Xe(o, a);
    }
    typeof e == "number" && Xe(o, e);
    for (let n = 0; i !== 0 && n < o.length; n++) {
      const s = this.viewItems[o[n]], a = N(s.size + i, s.minimumSize, s.maximumSize), d = a - s.size;
      i -= d, s.size = a;
    }
  }
  saveProportions() {
    this.proportionalLayout && this._contentSize > 0 && (this._proportions = this.viewItems.map((e) => e.visible ? e.size / this._contentSize : void 0));
  }
  /**
  * Margin explain:
  *
  * For `n` views in a splitview there will be `n-1` margins `m`.
  *
  * To fit the margins each view must reduce in size by `(m * (n - 1)) / n`.
  *
  * For each view `i` the offet must be adjusted by `m * i/(n - 1)`.
  */
  layoutViews() {
    let e = 0, t = 0;
    for (const d of this.viewItems)
      e += d.size, d.visible && t++;
    if (this._contentSize = e, this.updateSashEnablement(), this.viewItems.length === 0) return;
    const i = Math.max(0, t - 1), o = this.margin * i / Math.max(1, t);
    let r = 0;
    const n = [], s = 4;
    let a = 0;
    this.viewItems.forEach((d, c) => {
      r += this.viewItems[c].size, n.push(r), a += d.visible ? 1 : 0;
      const l = d.visible ? d.size - o : 0, h = Math.max(0, a - 1), v = c === 0 || h === 0 ? 0 : n[c - 1] + h / i * o;
      if (c < this.viewItems.length - 1) {
        const p = d.visible ? v + l - s / 2 + this.margin / 2 : v, u = this.sashes[c];
        this._orientation === "HORIZONTAL" && mi(u, `${p}px`, "0px"), this._orientation === "VERTICAL" && mi(u, "0px", `${p}px`);
      }
      this._orientation === "HORIZONTAL" && (d.setContainerGeometry("width", `${l}px`), d.setContainerGeometry("left", `${v}px`), d.setContainerGeometry("top", ""), d.setContainerGeometry("height", "")), this._orientation === "VERTICAL" && (d.setContainerGeometry("height", `${l}px`), d.setContainerGeometry("top", `${v}px`), d.setContainerGeometry("width", ""), d.setContainerGeometry("left", "")), d.view.layout(d.size - o, this._orthogonalSize);
    });
  }
  findFirstSnapIndex(e) {
    for (const t of e) {
      const i = this.viewItems[t];
      if (i.visible && i.snap)
        return t;
    }
    for (const t of e) {
      const i = this.viewItems[t];
      if (i.visible && i.maximumSize - i.minimumSize > 0) return;
      if (!i.visible && i.snap) return t;
    }
  }
  updateSashEnablement() {
    if (this.sashes.length === 0) return;
    let e = !1;
    const t = this.viewItems.map((a) => e = a.size - a.minimumSize > 0 || e);
    e = !1;
    const i = this.viewItems.map((a) => e = a.maximumSize - a.size > 0 || e), o = [...this.viewItems].reverse();
    e = !1;
    const r = o.map((a) => e = a.size - a.minimumSize > 0 || e).reverse();
    e = !1;
    const n = o.map((a) => e = a.maximumSize - a.size > 0 || e).reverse();
    let s = 0;
    for (let a = 0; a < this.sashes.length; a++) {
      const d = this.sashes[a], c = this.viewItems[a];
      s += c.size;
      const l = !(t[a] && n[a + 1]), h = !(i[a] && r[a + 1]);
      if (l && h) {
        const v = oe(a, -1), p = oe(a + 1, this.viewItems.length), u = this.findFirstSnapIndex(v), g = this.findFirstSnapIndex(p), _ = typeof u == "number" && !this.viewItems[u].visible, C = typeof g == "number" && !this.viewItems[g].visible;
        _ && r[a] && (s > 0 || this.startSnappingEnabled) ? this.updateSash(d, 1) : C && t[a] && (s < this._contentSize || this.endSnappingEnabled) ? this.updateSash(d, 0) : this.updateSash(d, 2);
      } else l && !h ? this.updateSash(d, 1) : !l && h ? this.updateSash(d, 0) : this.updateSash(d, 3);
    }
  }
  updateSash(e, t) {
    z(e.container, "dv-disabled", t === 2), z(e.container, "dv-enabled", t === 3), z(e.container, "dv-maximum", t === 0), z(e.container, "dv-minimum", t === 1);
  }
  createViewContainer() {
    const e = document.createElement("div");
    return e.className = "dv-view-container", e;
  }
  createSashContainer() {
    const e = document.createElement("div");
    return e.className = "dv-sash-container", e;
  }
  createContainer() {
    const e = document.createElement("div");
    return e.className = `dv-split-view-container ${this._orientation === "HORIZONTAL" ? "dv-horizontal" : "dv-vertical"}`, e;
  }
  dispose() {
    this._onDidSashEnd.dispose(), this._onDidAddView.dispose(), this._onDidRemoveView.dispose();
    for (let e = 0; e < this.element.children.length; e++) if (this.element.children.item(e) === this.element) {
      this.element.remove();
      break;
    }
    for (const e of this.viewItems) e.dispose();
    this.element.remove();
  }
}, Z = class {
  get minimumWidth() {
    return this.view.minimumWidth;
  }
  get maximumWidth() {
    return this.view.maximumWidth;
  }
  get minimumHeight() {
    return this.view.minimumHeight;
  }
  get maximumHeight() {
    return this.view.maximumHeight;
  }
  get priority() {
    return this.view.priority;
  }
  get snap() {
    return this.view.snap;
  }
  get minimumSize() {
    return this.orientation === "HORIZONTAL" ? this.minimumHeight : this.minimumWidth;
  }
  get maximumSize() {
    return this.orientation === "HORIZONTAL" ? this.maximumHeight : this.maximumWidth;
  }
  get minimumOrthogonalSize() {
    return this.orientation === "HORIZONTAL" ? this.minimumWidth : this.minimumHeight;
  }
  get maximumOrthogonalSize() {
    return this.orientation === "HORIZONTAL" ? this.maximumWidth : this.maximumHeight;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  get size() {
    return this._size;
  }
  get element() {
    return this.view.element;
  }
  get width() {
    return this.orientation === "HORIZONTAL" ? this.orthogonalSize : this.size;
  }
  get height() {
    return this.orientation === "HORIZONTAL" ? this.size : this.orthogonalSize;
  }
  constructor(e, t, i, o = 0) {
    this.view = e, this.orientation = t, this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._orthogonalSize = i, this._size = o, this._disposable = this.view.onDidChange((r) => {
      r ? this._onDidChange.fire({
        size: this.orientation === "VERTICAL" ? r.width : r.height,
        orthogonalSize: this.orientation === "VERTICAL" ? r.height : r.width
      }) : this._onDidChange.fire({});
    });
  }
  setVisible(e) {
    this.view.setVisible && this.view.setVisible(e);
  }
  layout(e, t) {
    this._size = e, this._orthogonalSize = t, this.view.layout(this.width, this.height);
  }
  dispose() {
    this._onDidChange.dispose(), this._disposable.dispose();
  }
}, U = class it extends I {
  get width() {
    return this.orientation === "HORIZONTAL" ? this.size : this.orthogonalSize;
  }
  get height() {
    return this.orientation === "HORIZONTAL" ? this.orthogonalSize : this.size;
  }
  get minimumSize() {
    if (this._cachedMinimumSize === void 0) {
      let t = 0;
      for (let i = 0; i < this.children.length; i++) this.splitview.isViewVisible(i) && (t = Math.max(t, this.children[i].minimumOrthogonalSize));
      this._cachedMinimumSize = t;
    }
    return this._cachedMinimumSize;
  }
  get maximumSize() {
    if (this._cachedMaximumSize === void 0) {
      let t = Number.POSITIVE_INFINITY;
      for (let i = 0; i < this.children.length; i++) this.splitview.isViewVisible(i) && (t = Math.min(t, this.children[i].maximumOrthogonalSize));
      this._cachedMaximumSize = t;
    }
    return this._cachedMaximumSize;
  }
  get minimumOrthogonalSize() {
    return this.splitview.minimumSize;
  }
  get maximumOrthogonalSize() {
    return this.splitview.maximumSize;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  get size() {
    return this._size;
  }
  get minimumWidth() {
    return this.orientation === "HORIZONTAL" ? this.minimumOrthogonalSize : this.minimumSize;
  }
  get minimumHeight() {
    return this.orientation === "HORIZONTAL" ? this.minimumSize : this.minimumOrthogonalSize;
  }
  get maximumWidth() {
    return this.orientation === "HORIZONTAL" ? this.maximumOrthogonalSize : this.maximumSize;
  }
  get maximumHeight() {
    return this.orientation === "HORIZONTAL" ? this.maximumSize : this.maximumOrthogonalSize;
  }
  get priority() {
    var t;
    return (t = this._cachedPriority) !== null && t !== void 0 || (this._cachedPriority = this.computePriority()), this._cachedPriority;
  }
  computePriority() {
    if (this.children.length === 0) return "normal";
    let t = !1, i = !1;
    for (const r of this.children) {
      var o;
      const n = (o = r.priority) !== null && o !== void 0 ? o : "normal";
      n === "high" ? t = !0 : n === "low" && (i = !0);
    }
    return t ? "high" : i ? "low" : "normal";
  }
  invalidateCachedSizes() {
    this._cachedMinimumSize = void 0, this._cachedMaximumSize = void 0, this._cachedPriority = void 0;
  }
  get disabled() {
    return this.splitview.disabled;
  }
  set disabled(t) {
    this.splitview.disabled = t;
  }
  get margin() {
    return this.splitview.margin;
  }
  set margin(t) {
    this.splitview.margin = t, this.children.forEach((i) => {
      i instanceof it && (i.margin = t);
    });
  }
  get proportionalLayout() {
    return this.splitview.proportionalLayout;
  }
  set proportionalLayout(t) {
    this.splitview.proportionalLayout = t, this.children.forEach((i) => {
      i instanceof it && (i.proportionalLayout = t);
    });
  }
  constructor(t, i, o, r, n, s, a, d) {
    if (super(), this.orientation = t, this.styles = o, this._childrenDisposable = $.NONE, this.children = [], this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._onDidVisibilityChange = new D(), this.onDidVisibilityChange = this._onDidVisibilityChange.event, this._orthogonalSize = n, this._size = r, this.element = document.createElement("div"), this.element.className = "dv-branch-node", d) {
      const c = {
        views: d.map((l) => {
          var h;
          return {
            view: l.node,
            size: l.node.size,
            visible: (h = l.visible) !== null && h !== void 0 ? h : !0
          };
        }),
        size: this.orthogonalSize
      };
      this.children = d.map((l) => l.node), this.splitview = new at(this.element, {
        orientation: this.orientation,
        descriptor: c,
        proportionalLayout: i,
        styles: o,
        margin: a
      });
    } else
      this.splitview = new at(this.element, {
        orientation: this.orientation,
        proportionalLayout: i,
        styles: o,
        margin: a
      }), this.splitview.layout(this.size, this.orthogonalSize);
    this.disabled = s, this.addDisposables(this._onDidChange, this._onDidVisibilityChange, this.splitview.onDidSashEnd(() => {
      this._onDidChange.fire({});
    })), this.setupChildrenEvents();
  }
  setVisible(t) {
  }
  isChildVisible(t) {
    if (t < 0 || t >= this.children.length) throw new Error("Invalid index");
    return this.splitview.isViewVisible(t);
  }
  setChildVisible(t, i) {
    if (t < 0 || t >= this.children.length) throw new Error("Invalid index");
    if (this.splitview.isViewVisible(t) === i) return;
    const o = this.splitview.contentSize === 0;
    this.splitview.setViewVisible(t, i), this.invalidateCachedSizes();
    const r = this.splitview.contentSize === 0;
    (i && o || !i && r) && this._onDidVisibilityChange.fire({ visible: i });
  }
  moveChild(t, i) {
    if (t === i) return;
    if (t < 0 || t >= this.children.length) throw new Error("Invalid from index");
    t < i && i--, this.splitview.moveView(t, i);
    const o = this._removeChild(t);
    this._addChild(o, i);
  }
  getChildSize(t) {
    if (t < 0 || t >= this.children.length) throw new Error("Invalid index");
    return this.splitview.getViewSize(t);
  }
  resizeChild(t, i) {
    if (t < 0 || t >= this.children.length) throw new Error("Invalid index");
    this.splitview.resizeView(t, i);
  }
  layout(t, i) {
    this._size = i, this._orthogonalSize = t, this.splitview.layout(i, t);
  }
  addChild(t, i, o, r) {
    if (o < 0 || o > this.children.length) throw new Error("Invalid index");
    this.splitview.addView(t, i, o, r), this._addChild(t, o);
  }
  getChildCachedVisibleSize(t) {
    if (t < 0 || t >= this.children.length) throw new Error("Invalid index");
    return this.splitview.getViewCachedVisibleSize(t);
  }
  removeChild(t, i) {
    if (t < 0 || t >= this.children.length) throw new Error("Invalid index");
    return this.splitview.removeView(t, i), this._removeChild(t);
  }
  _addChild(t, i) {
    this.children.splice(i, 0, t), this.setupChildrenEvents();
  }
  _removeChild(t) {
    const [i] = this.children.splice(t, 1);
    return this.setupChildrenEvents(), i;
  }
  setupChildrenEvents() {
    this.invalidateCachedSizes(), this._childrenDisposable.dispose(), this._childrenDisposable = new I(ie.any(...this.children.map((t) => t.onDidChange))((t) => {
      this.invalidateCachedSizes(), this._onDidChange.fire({ size: t.orthogonalSize });
    }), ...this.children.map((t, i) => t instanceof it ? t.onDidVisibilityChange(({ visible: o }) => {
      this.setChildVisible(i, o);
    }) : $.NONE));
  }
  dispose() {
    this._childrenDisposable.dispose(), this.splitview.dispose(), this.children.forEach((t) => t.dispose()), super.dispose();
  }
};
function At(e, t) {
  if (e instanceof Z) return e;
  if (e instanceof U) return At(e.children[t ? e.children.length - 1 : 0], t);
  throw new Error("invalid node");
}
function _o(e, t, i) {
  if (e instanceof U) {
    const o = new U(e.orientation, e.proportionalLayout, e.styles, t, i, e.disabled, e.margin);
    for (let r = e.children.length - 1; r >= 0; r--) {
      const n = e.children[r];
      o.addChild(_o(n, n.size, n.orthogonalSize), n.size, 0, !0);
    }
    return o;
  } else return new Z(e.view, e.orientation, i);
}
function Et(e, t, i) {
  if (e instanceof U) {
    const o = new U(ne(e.orientation), e.proportionalLayout, e.styles, t, i, e.disabled, e.margin);
    let r = 0;
    for (let n = e.children.length - 1; n >= 0; n--) {
      const s = e.children[n], a = s instanceof U ? s.orthogonalSize : s.size;
      let d = e.size === 0 ? 0 : Math.round(t * a / e.size);
      r += d, n === 0 && (d += t - r), o.addChild(Et(s, i, d), d, 0, !0);
    }
    return o;
  } else return new Z(e.view, ne(e.orientation), i);
}
function fr(e) {
  const t = e.parentElement;
  if (!t) throw new Error("Invalid grid element");
  let i = t.firstElementChild, o = 0;
  for (; i !== e && i !== t.lastElementChild && i; )
    i = i.nextElementSibling, o++;
  return o;
}
function H(e) {
  const t = e.parentElement;
  if (!t) throw new Error("Invalid grid element");
  if (/\bdv-grid-view\b/.test(t.className)) return [];
  const i = fr(t), o = t.parentElement.parentElement.parentElement;
  return [...H(o), i];
}
function ve(e, t, i) {
  if (wo(e, t) === It(i)) {
    const [o, r] = de(t);
    let n = r;
    return (i === "right" || i === "bottom") && (n += 1), [...o, n];
  } else {
    const o = i === "right" || i === "bottom" ? 1 : 0;
    return [...t, o];
  }
}
function It(e) {
  return e === "top" || e === "bottom" ? "VERTICAL" : "HORIZONTAL";
}
function wo(e, t) {
  return t.length % 2 === 0 ? ne(e) : e;
}
const ne = (e) => e === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
function _r(e) {
  return !!e.children;
}
const Mt = (e, t) => {
  const i = t === "VERTICAL" ? e.box.width : e.box.height;
  if (!_r(e))
    return typeof e.cachedVisibleSize == "number" ? {
      type: "leaf",
      data: e.view.toJSON(),
      size: e.cachedVisibleSize,
      visible: !1
    } : {
      type: "leaf",
      data: e.view.toJSON(),
      size: i
    };
  const o = e.children.map((r) => Mt(r, ne(t)));
  return typeof e.cachedVisibleSize == "number" ? {
    type: "branch",
    data: o,
    size: e.cachedVisibleSize,
    visible: !1
  } : {
    type: "branch",
    data: o,
    size: i
  };
};
var xo = class {
  get length() {
    return this._root ? this._root.children.length : 0;
  }
  get orientation() {
    return this.root.orientation;
  }
  set orientation(e) {
    if (this.root.orientation === e) return;
    const { size: t, orthogonalSize: i } = this.root;
    this.root = Et(this.root, i, t), this.root.layout(t, i);
  }
  get width() {
    return this.root.width;
  }
  get height() {
    return this.root.height;
  }
  get minimumWidth() {
    return this.root.minimumWidth;
  }
  get minimumHeight() {
    return this.root.minimumHeight;
  }
  get maximumWidth() {
    return this.root.maximumWidth;
  }
  get maximumHeight() {
    return this.root.maximumHeight;
  }
  get locked() {
    return this._locked;
  }
  set locked(e) {
    this._locked = e;
    const t = [this.root];
    for (; t.length > 0; ) {
      const i = t.pop();
      i instanceof U && (i.disabled = e, t.push(...i.children));
    }
  }
  get margin() {
    return this._margin;
  }
  set margin(e) {
    this._margin = e, this.root.margin = e;
  }
  maximizedView() {
    var e;
    return (e = this._maximizedNode) === null || e === void 0 ? void 0 : e.leaf.view;
  }
  hasMaximizedView() {
    return this._maximizedNode !== void 0;
  }
  maximizeView(e) {
    var t;
    const i = H(e.element), [o, r] = this.getNode(i);
    if (!(r instanceof Z) || ((t = this._maximizedNode) === null || t === void 0 ? void 0 : t.leaf) === r) return;
    this.hasMaximizedView() && this.exitMaximizedView(), Mt(this.getView(), this.orientation);
    const n = [];
    function s(a, d) {
      for (let c = 0; c < a.children.length; c++) {
        const l = a.children[c];
        l instanceof Z ? l !== d && (a.isChildVisible(c) ? a.setChildVisible(c, !1) : n.push(l)) : s(l, d);
      }
    }
    s(this.root, r), this._maximizedNode = {
      leaf: r,
      hiddenOnMaximize: n
    }, this._onDidMaximizedNodeChange.fire({
      view: r.view,
      isMaximized: !0
    });
  }
  exitMaximizedView() {
    if (!this._maximizedNode) return;
    const e = this._maximizedNode.hiddenOnMaximize;
    function t(o) {
      for (let r = o.children.length - 1; r >= 0; r--) {
        const n = o.children[r];
        n instanceof Z ? e.includes(n) || o.setChildVisible(r, !0) : t(n);
      }
    }
    t(this.root);
    const i = this._maximizedNode.leaf;
    this._maximizedNode = void 0, this._onDidMaximizedNodeChange.fire({
      view: i.view,
      isMaximized: !1
    });
  }
  serialize() {
    const e = this.maximizedView();
    let t;
    e && (t = H(e.element));
    const i = this._onDidMaximizedNodeChange.pause();
    try {
      this.hasMaximizedView() && this.exitMaximizedView();
      const o = {
        root: Mt(this.getView(), this.orientation),
        width: this.width,
        height: this.height,
        orientation: this.orientation
      };
      return t && (o.maximizedNode = { location: t }), e && this.maximizeView(e), o;
    } finally {
      i.dispose();
    }
  }
  dispose() {
    this.disposable.dispose(), this._onDidChange.dispose(), this._onDidMaximizedNodeChange.dispose(), this._onDidViewVisibilityChange.dispose(), this.root.dispose(), this._maximizedNode = void 0, this.element.remove();
  }
  clear() {
    const e = this.root.orientation;
    this.root = new U(e, this.proportionalLayout, this.styles, this.root.size, this.root.orthogonalSize, this.locked, this.margin);
  }
  deserialize(e, t) {
    const i = e.orientation, o = i === "VERTICAL" ? e.height : e.width;
    if (this._deserialize(e.root, i, t, o), this.layout(e.width, e.height), e.maximizedNode) {
      const r = e.maximizedNode.location, [n, s] = this.getNode(r);
      if (!(s instanceof Z)) return;
      this.maximizeView(s.view);
    }
  }
  _deserialize(e, t, i, o) {
    this.root = this._deserializeNode(e, t, i, o);
  }
  _deserializeNode(e, t, i, o) {
    let r;
    if (e.type === "branch") {
      const s = e.data.map((a) => ({
        node: this._deserializeNode(a, ne(t), i, e.size),
        visible: a.visible
      }));
      r = new U(t, this.proportionalLayout, this.styles, e.size, o, this.locked, this.margin, s);
    } else {
      const s = i.fromJSON(e);
      if (typeof e.visible == "boolean") {
        var n;
        (n = s.setVisible) === null || n === void 0 || n.call(s, e.visible);
      }
      r = new Z(s, t, o, e.size);
    }
    return r;
  }
  get root() {
    return this._root;
  }
  set root(e) {
    const t = this._root;
    t && (t.dispose(), this._maximizedNode = void 0, t.element.remove()), this._root = e, this.element.appendChild(this._root.element), this.disposable.value = this._root.onDidChange((i) => {
      this._onDidChange.fire(i);
    });
  }
  normalize() {
    if (!this._root || this._root.children.length !== 1) return;
    const e = this.root, t = e.children[0];
    if (t instanceof Z) return;
    e.element.remove();
    const i = e.removeChild(0);
    e.dispose(), i.dispose(), this._root = _o(t, t.size, t.orthogonalSize), this.element.appendChild(this._root.element), this.disposable.value = this._root.onDidChange((o) => {
      this._onDidChange.fire(o);
    });
  }
  /**
  * If the root is orientated as a VERTICAL node then nest the existing root within a new HORIZIONTAL root node
  * If the root is orientated as a HORIZONTAL node then nest the existing root within a new VERITCAL root node
  */
  insertOrthogonalSplitviewAtRoot() {
    if (!this._root) return;
    const e = this.root;
    if (e.element.remove(), this._root = new U(ne(e.orientation), this.proportionalLayout, this.styles, this.root.orthogonalSize, this.root.size, this.locked, this.margin), e.children.length !== 0) if (e.children.length === 1) {
      const t = e.children[0];
      e.removeChild(0).dispose(), e.dispose(), this._root.addChild(
        /**
        * the child node will have the same orientation as the new root since
        * we are removing the inbetween node.
        * the entire 'tree' must be flipped recursively to ensure that the orientation
        * flips at each level
        */
        Et(t, t.orthogonalSize, t.size),
        q.Distribute,
        0
      );
    } else this._root.addChild(e, q.Distribute, 0);
    this.element.appendChild(this._root.element), this.disposable.value = this._root.onDidChange((t) => {
      this._onDidChange.fire(t);
    });
  }
  next(e) {
    return this.progmaticSelect(e);
  }
  previous(e) {
    return this.progmaticSelect(e, !0);
  }
  getView(e) {
    const t = e ? this.getNode(e)[1] : this.root;
    return this._getViews(t, this.orientation);
  }
  _getViews(e, t, i) {
    const o = {
      height: e.height,
      width: e.width
    };
    if (e instanceof Z) return {
      box: o,
      view: e.view,
      cachedVisibleSize: i
    };
    const r = [];
    for (let n = 0; n < e.children.length; n++) {
      const s = e.children[n], a = e.getChildCachedVisibleSize(n);
      r.push(this._getViews(s, ne(t), a));
    }
    return {
      box: o,
      children: r,
      cachedVisibleSize: i
    };
  }
  progmaticSelect(e, t = !1) {
    const [i, o] = this.getNode(e);
    if (!(o instanceof Z)) throw new TypeError("invalid location");
    for (let r = i.length - 1; r > -1; r--) {
      const n = i[r], s = e[r] || 0;
      if (t ? s - 1 > -1 : s + 1 < n.children.length) return At(n.children[t ? s - 1 : s + 1], t);
    }
    return At(this.root, t);
  }
  get proportionalLayout() {
    return this.root.proportionalLayout;
  }
  set proportionalLayout(e) {
    this.root.proportionalLayout = e;
  }
  constructor(e, t, i, o, r) {
    this.styles = t, this._locked = !1, this._margin = 0, this._maximizedNode = void 0, this.disposable = new j(), this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._onDidViewVisibilityChange = new D(), this.onDidViewVisibilityChange = this._onDidViewVisibilityChange.event, this._onDidMaximizedNodeChange = new D(), this.onDidMaximizedNodeChange = this._onDidMaximizedNodeChange.event, this.element = document.createElement("div"), this.element.className = "dv-grid-view", this._locked = o ?? !1, this._margin = r ?? 0, this.root = new U(i, e, t, 0, 0, this.locked, this.margin);
  }
  isViewVisible(e) {
    const [t, i] = de(e), [, o] = this.getNode(t);
    if (!(o instanceof U)) throw new TypeError("Invalid from location");
    return o.isChildVisible(i);
  }
  setViewVisible(e, t) {
    this.hasMaximizedView() && this.exitMaximizedView();
    const [i, o] = de(e), [, r] = this.getNode(i);
    if (!(r instanceof U)) throw new TypeError("Invalid from location");
    this._onDidViewVisibilityChange.fire(), r.setChildVisible(o, t);
  }
  moveView(e, t, i) {
    this.hasMaximizedView() && this.exitMaximizedView();
    const [, o] = this.getNode(e);
    if (!(o instanceof U)) throw new TypeError("Invalid location");
    o.moveChild(t, i);
  }
  addView(e, t, i) {
    this.hasMaximizedView() && this.exitMaximizedView();
    const [o, r] = de(i), [n, s] = this.getNode(o);
    if (s instanceof U) {
      const a = new Z(e, ne(s.orientation), s.orthogonalSize);
      s.addChild(a, t, r);
    } else {
      const [a, ...d] = [...n].reverse(), [c, ...l] = [...o].reverse();
      let h = 0;
      const v = a.getChildCachedVisibleSize(c);
      typeof v == "number" && (h = q.Invisible(v)), a.removeChild(c).dispose();
      const p = new U(s.orientation, this.proportionalLayout, this.styles, s.size, s.orthogonalSize, this.locked, this.margin);
      a.addChild(p, s.size, c);
      const u = new Z(s.view, a.orientation, s.size);
      p.addChild(u, h, 0), typeof t != "number" && t.type === "split" && (t = {
        type: "split",
        index: 0
      });
      const g = new Z(e, a.orientation, s.size);
      p.addChild(g, t, r);
    }
  }
  remove(e, t) {
    const i = H(e.element);
    return this.removeView(i, t);
  }
  removeView(e, t) {
    this.hasMaximizedView() && this.exitMaximizedView();
    const [i, o] = de(e), [r, n] = this.getNode(i);
    if (!(n instanceof U)) throw new TypeError("Invalid location");
    const s = n.children[o];
    if (!(s instanceof Z)) throw new TypeError("Invalid location");
    if (n.removeChild(o, t), s.dispose(), n.children.length !== 1) return s.view;
    const a = n.children[0];
    if (r.length === 0)
      return a instanceof Z || (n.removeChild(0, t), this.root = a), s.view;
    const [d, ...c] = [...r].reverse(), [l, ...h] = [...i].reverse(), v = n.isChildVisible(0);
    n.removeChild(0, t);
    const p = d.children.map((u, g) => d.getChildSize(g));
    if (d.removeChild(l, t).dispose(), a instanceof U) {
      p.splice(l, 1, ...a.children.map((u) => u.size));
      for (let u = 0; u < a.children.length; u++) {
        const g = a.children[u];
        d.addChild(g, g.size, l + u);
      }
      for (; a.children.length > 0; ) a.removeChild(0);
    } else {
      const u = new Z(a.view, ne(a.orientation), a.size), g = v ? a.orthogonalSize : q.Invisible(a.orthogonalSize);
      d.addChild(u, g, l);
    }
    a.dispose();
    for (let u = 0; u < p.length; u++) d.resizeChild(u, p[u]);
    return s.view;
  }
  layout(e, t) {
    const [i, o] = this.root.orientation === "HORIZONTAL" ? [t, e] : [e, t];
    this.root.layout(i, o);
  }
  getNode(e, t = this.root, i = []) {
    if (e.length === 0) return [i, t];
    if (!(t instanceof U)) throw new TypeError("Invalid location");
    const [o, ...r] = e;
    if (o < 0 || o >= t.children.length) throw new Error("Invalid location");
    const n = t.children[o];
    return i.push(t), this.getNode(r, n, i);
  }
}, wr = class extends I {
  get element() {
    return this._element;
  }
  get disableResizing() {
    return this._disableResizing;
  }
  set disableResizing(e) {
    this._disableResizing = e;
  }
  constructor(e, t = !1) {
    super(), this._lastWidth = -1, this._lastHeight = -1, this._disableResizing = t, this._element = e, this.addDisposables(ke(this._element, (i) => {
      if (this.isDisposed || this.disableResizing || !this._element.offsetParent || !st(this._element))
        return;
      const o = Math.round(i.contentRect.width), r = Math.round(i.contentRect.height);
      o === this._lastWidth && r === this._lastHeight || (this._lastWidth = o, this._lastHeight = r, this.layout(o, r));
    }));
  }
  /**
  * Lay out from the element's current size.
  *
  * The ResizeObserver above only reports asynchronously, so between
  * construction and its first callback the component believes it has no
  * size - and anything built in that window (panels added right after
  * `createDockview`, say) resolves its sizes against zero and collapses to
  * minimums. Concrete components call this once they are fully constructed
  * so that work sees the real size. The same guards as the observer apply:
  * a detached or hidden element has no size worth propagating.
  */
  layoutFromElement() {
    if (this.disableResizing || !this._element.offsetParent || !st(this._element)) return;
    const e = Math.round(this._element.clientWidth), t = Math.round(this._element.clientHeight);
    e === 0 || t === 0 || this.layout(e, t);
  }
};
const xr = fo();
function fi(e) {
  switch (e) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "above":
      return "top";
    case "below":
      return "bottom";
    default:
      return "center";
  }
}
var yr = class extends wr {
  get id() {
    return this._id;
  }
  get size() {
    return this._groups.size;
  }
  get groups() {
    return Array.from(this._groups.values()).map((e) => e.value);
  }
  get width() {
    return this.gridview.width;
  }
  get height() {
    return this.gridview.height;
  }
  get minimumHeight() {
    return this.gridview.minimumHeight;
  }
  get maximumHeight() {
    return this.gridview.maximumHeight;
  }
  get minimumWidth() {
    return this.gridview.minimumWidth;
  }
  get maximumWidth() {
    return this.gridview.maximumWidth;
  }
  get activeGroup() {
    return this._activeGroup;
  }
  get locked() {
    return this.gridview.locked;
  }
  set locked(e) {
    this.gridview.locked = e;
  }
  constructor(e, t) {
    var i;
    super(document.createElement("div"), t.disableAutoResizing), this._id = xr.next(), this._groups = /* @__PURE__ */ new Map(), this._onDidRemove = new D(), this.onDidRemove = this._onDidRemove.event, this._onDidAdd = new D(), this.onDidAdd = this._onDidAdd.event, this._onDidMaximizedChange = new D(), this.onDidMaximizedChange = this._onDidMaximizedChange.event, this._onDidActiveChange = new D(), this.onDidActiveChange = this._onDidActiveChange.event, this._bufferOnDidLayoutChange = new vi(), this.onDidLayoutChange = this._bufferOnDidLayoutChange.onEvent, this._onDidViewVisibilityChangeMicroTaskQueue = new vi(), this.onDidViewVisibilityChangeMicroTaskQueue = this._onDidViewVisibilityChangeMicroTaskQueue.onEvent, this.element.style.height = "100%", this.element.style.width = "100%", this._classNames = new ho(this.element), this._classNames.setClassNames((i = t.className) !== null && i !== void 0 ? i : ""), e.appendChild(this.element), this.gridview = new xo(!!t.proportionalLayout, t.styles, t.orientation, t.locked, t.margin), this.gridview.locked = !!t.locked, this.element.appendChild(this.gridview.element), this.layout(0, 0, !0), this.addDisposables(this.gridview.onDidMaximizedNodeChange((o) => {
      this._onDidMaximizedChange.fire({
        panel: o.view,
        isMaximized: o.isMaximized
      });
    }), this.gridview.onDidViewVisibilityChange(() => this._onDidViewVisibilityChangeMicroTaskQueue.fire()), this.onDidViewVisibilityChangeMicroTaskQueue(() => {
      this.forceRelayout();
    }), $.from(() => {
      this.element.remove();
    }), this.gridview.onDidChange(() => {
      this._bufferOnDidLayoutChange.fire();
    }), ie.any(this.onDidAdd, this.onDidRemove, this.onDidActiveChange)(() => {
      this._bufferOnDidLayoutChange.fire();
    }), this._onDidMaximizedChange, this._onDidViewVisibilityChangeMicroTaskQueue, this._bufferOnDidLayoutChange);
  }
  setVisible(e, t) {
    this.gridview.setViewVisible(H(e.element), t), this._bufferOnDidLayoutChange.fire();
  }
  isVisible(e) {
    return this.gridview.isViewVisible(H(e.element));
  }
  updateOptions(e) {
    if ("proportionalLayout" in e) {
      var t;
      this.gridview.proportionalLayout = (t = e.proportionalLayout) !== null && t !== void 0 ? t : !0;
    }
    if (e.orientation && (this.gridview.orientation = e.orientation), "disableAutoResizing" in e) {
      var i;
      this.disableResizing = (i = e.disableAutoResizing) !== null && i !== void 0 ? i : !1;
    }
    if ("locked" in e) {
      var o;
      this.locked = (o = e.locked) !== null && o !== void 0 ? o : !1;
    }
    if ("margin" in e) {
      var r;
      this.gridview.margin = (r = e.margin) !== null && r !== void 0 ? r : 0;
    }
    if ("className" in e) {
      var n;
      this._classNames.setClassNames((n = e.className) !== null && n !== void 0 ? n : "");
    }
  }
  maximizeGroup(e) {
    this.gridview.maximizeView(e), this.doSetGroupActive(e);
  }
  isMaximizedGroup(e) {
    return this.gridview.maximizedView() === e;
  }
  exitMaximizedGroup() {
    this.gridview.exitMaximizedView();
  }
  hasMaximizedGroup() {
    return this.gridview.hasMaximizedView();
  }
  doAddGroup(e, t = [0], i, o = this.gridview) {
    o.addView(e, i ?? q.Distribute, t), this._onDidAdd.fire(e);
  }
  doRemoveGroup(e, t) {
    if (!this._groups.has(e.id)) throw new Error("invalid operation");
    const i = this._groups.get(e.id), o = this.gridview.remove(e, q.Distribute);
    if (i && !t?.skipDispose && (i.disposable.dispose(), i.value.dispose(), this._groups.delete(e.id), this._onDidRemove.fire(e)), !t?.skipActive && this._activeGroup === e) {
      const r = Array.from(this._groups.values());
      this.doSetGroupActive(r.length > 0 ? r[0].value : void 0);
    }
    return o;
  }
  getPanel(e) {
    var t;
    return (t = this._groups.get(e)) === null || t === void 0 ? void 0 : t.value;
  }
  doSetGroupActive(e) {
    this._activeGroup !== e && (this._activeGroup && this._activeGroup.setActive(!1), e && e.setActive(!0), this._activeGroup = e, this._onDidActiveChange.fire(e));
  }
  removeGroup(e) {
    this.doRemoveGroup(e);
  }
  activateNext(e) {
    var t, i;
    if ((t = e) !== null && t !== void 0 || (e = {}), !e.group) {
      if (!this.activeGroup) return;
      e.group = this.activeGroup;
    }
    const o = H(e.group.element), r = (i = this.gridview.next(o)) === null || i === void 0 ? void 0 : i.view;
    this.doSetGroupActive(r);
  }
  activatePrevious(e) {
    var t, i;
    if ((t = e) !== null && t !== void 0 || (e = {}), !e.group) {
      if (!this.activeGroup) return;
      e.group = this.activeGroup;
    }
    const o = H(e.group.element), r = (i = this.gridview.previous(o)) === null || i === void 0 ? void 0 : i.view;
    this.doSetGroupActive(r);
  }
  forceRelayout() {
    this.layout(this.width, this.height, !0);
  }
  layout(e, t, i) {
    (i || e !== this.width || t !== this.height) && (this.gridview.element.style.height = `${t}px`, this.gridview.element.style.width = `${e}px`, this.gridview.layout(e, t));
  }
  dispose() {
    this._onDidActiveChange.dispose(), this._onDidAdd.dispose(), this._onDidRemove.dispose();
    for (const e of this.groups) e.dispose();
    this.gridview.dispose(), super.dispose();
  }
};
function He(e) {
  "@babel/helpers - typeof";
  return He = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(t) {
    return typeof t;
  } : function(t) {
    return t && typeof Symbol == "function" && t.constructor === Symbol && t !== Symbol.prototype ? "symbol" : typeof t;
  }, He(e);
}
function Dr(e, t) {
  if (He(e) != "object" || !e) return e;
  var i = e[Symbol.toPrimitive];
  if (i !== void 0) {
    var o = i.call(e, t);
    if (He(o) != "object") return o;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (t === "string" ? String : Number)(e);
}
function kr(e) {
  var t = Dr(e, "string");
  return He(t) == "symbol" ? t : t + "";
}
function Cr(e, t, i) {
  return (t = kr(t)) in e ? Object.defineProperty(e, t, {
    value: i,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[t] = i, e;
}
function _i(e, t) {
  var i = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    t && (o = o.filter(function(r) {
      return Object.getOwnPropertyDescriptor(e, r).enumerable;
    })), i.push.apply(i, o);
  }
  return i;
}
function O(e) {
  for (var t = 1; t < arguments.length; t++) {
    var i = arguments[t] != null ? arguments[t] : {};
    t % 2 ? _i(Object(i), !0).forEach(function(o) {
      Cr(e, o, i[o]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(i)) : _i(Object(i)).forEach(function(o) {
      Object.defineProperty(e, o, Object.getOwnPropertyDescriptor(i, o));
    });
  }
  return e;
}
function Sr(e, t) {
  return e === "center" ? `Tab into ${t}` : `Split ${e} of ${t}`;
}
function Gr(e, t) {
  return e === "center" ? `docked into ${t}` : `split ${e} of ${t}`;
}
const dt = {
  panelOpened: (e) => `${e} opened`,
  panelClosed: (e) => `${e} closed`,
  groupMaximized: (e) => `${e} maximized`,
  groupRestored: (e) => `${e} restored`,
  groupFloated: (e) => `${e} floated`,
  groupDocked: (e) => `${e} docked`,
  groupPoppedOut: (e) => `${e} opened in a new window`,
  closeTab: (e) => `Close ${e}`,
  closeTabPlain: () => "Close",
  movePickTarget: (e, t, i, o) => `Moving ${e}. Target ${t}, ${i} of ${o}. Enter to choose where, Escape to cancel.`,
  movePickEdge: (e, t) => `${Sr(e, t)}. Arrows to change, Enter to confirm, Escape to go back.`,
  moveCommitted: (e, t, i) => `${e} ${Gr(i, t)}.`,
  moveCancelled: () => "Move cancelled.",
  moveNotAllowed: () => "That move is not allowed.",
  moveFloated: (e) => `${e} floated.`
};
function yo(e) {
  return e ? O(O({}, dt), e) : dt;
}
var Ft = class {
  /**
  * The unique identifier for this instance. Used to manage scope of Drag'n'Drop events.
  */
  get id() {
    return this.component.id;
  }
  /**
  * Width of the component.
  */
  get width() {
    return this.component.width;
  }
  /**
  * Height of the component.
  */
  get height() {
    return this.component.height;
  }
  /**
  * Minimum height of the component.
  */
  get minimumHeight() {
    return this.component.minimumHeight;
  }
  /**
  * Maximum height of the component.
  */
  get maximumHeight() {
    return this.component.maximumHeight;
  }
  /**
  * Minimum width of the component.
  */
  get minimumWidth() {
    return this.component.minimumWidth;
  }
  /**
  * Maximum width of the component.
  */
  get maximumWidth() {
    return this.component.maximumWidth;
  }
  /**
  * Total number of groups.
  */
  get size() {
    return this.component.size;
  }
  /**
  * The active tab-group color palette. Reflects the configured
  * `tabGroupColors` option, or the built-in defaults when unset.
  * Useful for custom chip renderers that want to roll their own
  * picker UI.
  */
  get tabGroupColors() {
    return this.component.tabGroupColorPalette.entries();
  }
  /**
  * Total number of panels.
  */
  get totalPanels() {
    return this.component.totalPanels;
  }
  /**
  * Invoked when the active group changes. May be undefined if no group is active.
  */
  get onDidActiveGroupChange() {
    return this.component.onDidActiveGroupChange;
  }
  /**
  * Invoked when a group is added. May be called multiple times when moving groups.
  */
  get onDidAddGroup() {
    return this.component.onDidAddGroup;
  }
  /**
  * Invoked when a group is removed. May be called multiple times when moving groups.
  */
  get onDidRemoveGroup() {
    return this.component.onDidRemoveGroup;
  }
  /**
  * Invoked when the active panel changes. The event carries the active
  * `panel` (may be undefined if no panel is active) and the
  * {@link DockviewOrigin} (`'user'` vs `'api'`) of the change.
  */
  get onDidActivePanelChange() {
    return this.component.onDidActivePanelChange;
  }
  /**
  * Fired when a panel is pinned or unpinned (PinnedTabs module). Carries the
  * panel and its new `isPinned` state.
  */
  get onDidPanelPinnedChange() {
    return this.component.onDidPanelPinnedChange;
  }
  /**
  * Invoked when a panel is added. May be called multiple times when moving panels.
  */
  get onDidAddPanel() {
    return this.component.onDidAddPanel;
  }
  /**
  * Invoked when a panel is removed. May be called multiple times when moving panels.
  */
  get onDidRemovePanel() {
    return this.component.onDidRemovePanel;
  }
  get onDidMovePanel() {
    return this.component.onDidMovePanel;
  }
  /**
  * Invoked after a layout is deserialzied using the `fromJSON` method.
  */
  get onDidLayoutFromJSON() {
    return this.component.onDidLayoutFromJSON;
  }
  /**
  * Invoked when any layout change occures, an aggregation of many events.
  */
  get onDidLayoutChange() {
    return this.component.onDidLayoutChange;
  }
  /**
  * Invoked when a Drag'n'Drop event occurs that the component was unable to handle. Exposed for custom Drag'n'Drop functionality.
  */
  get onDidDrop() {
    return this.component.onDidDrop;
  }
  /**
  * Invoked when a Drag'n'Drop event occurs but before dockview handles it giving the user an opportunity to intecept and
  * prevent the event from occuring using the standard `preventDefault()` syntax.
  *
  * Preventing certain events may causes unexpected behaviours, use carefully.
  */
  get onWillDrop() {
    return this.component.onWillDrop;
  }
  /**
  * Fires before each top-level structural layout mutation (add / remove /
  * move / float / popout / maximize / load / clear). Compound operations
  * (e.g. a drag) fire once. Pair with `onDidMutateLayout` to bracket a
  * change, which is useful for undo/redo, autosave and dirty-tracking.
  */
  get onWillMutateLayout() {
    return this.component.onWillMutateLayout;
  }
  /** Fires after each top-level structural layout mutation. See `onWillMutateLayout`. */
  get onDidMutateLayout() {
    return this.component.onDidMutateLayout;
  }
  /**
  * Invoked before an overlay is shown indicating a drop target.
  *
  * Calling `event.preventDefault()` will prevent the overlay being shown and prevent
  * the any subsequent drop event.
  */
  get onWillShowOverlay() {
    return this.component.onWillShowOverlay;
  }
  /**
  * Invoked before a group is dragged.
  *
  * Calling `event.nativeEvent.preventDefault()` will prevent the group drag starting.
  *
  */
  get onWillDragGroup() {
    return this.component.onWillDragGroup;
  }
  /**
  * Invoked before a panel is dragged.
  *
  * Calling `event.nativeEvent.preventDefault()` will prevent the panel drag starting.
  */
  get onWillDragPanel() {
    return this.component.onWillDragPanel;
  }
  get onUnhandledDragOver() {
    return this.component.onUnhandledDragOver;
  }
  /**
  * The drag-and-drop backends currently live: `dndStrategy` resolved against
  * this device, which `'auto'` reads from the primary input device. Only an
  * HTML5 drag can leave the window it started in, so check `html5` before
  * relying on a drag between a popout window and the main window.
  */
  get dndCapabilities() {
    return this.component.dndCapabilities;
  }
  get onDidPopoutGroupSizeChange() {
    return this.component.onDidPopoutGroupSizeChange;
  }
  get onDidPopoutGroupPositionChange() {
    return this.component.onDidPopoutGroupPositionChange;
  }
  /**
  * Fires when a popout group successfully opens in its own window, carrying
  * the live `Window` handle. Use it to route focus or attach per-document
  * listeners. Enumerate the current popouts at any time with `getPopouts()`.
  */
  get onDidAddPopoutGroup() {
    return this.component.onDidAddPopoutGroup;
  }
  /**
  * Fires when a popout group is removed, whether the user closed its window
  * or it was docked back programmatically. Symmetric with
  * {@link onDidAddPopoutGroup}; not fired during component disposal.
  */
  get onDidRemovePopoutGroup() {
    return this.component.onDidRemovePopoutGroup;
  }
  /**
  * Fires when a popout window could not be used, carrying which way it
  * failed: the URL was refused, the browser blocked the window, the host
  * returned a window whose document the opener cannot reach, or it closed
  * before loading. The group stays in (or returns to) the main grid.
  */
  get onDidOpenPopoutWindowFail() {
    return this.component.onDidOpenPopoutWindowFail;
  }
  /**
  * Fires as dockview lets go of a popout window, while that window is still
  * open, carrying its live `Window` handle. Covers every popout the component
  * opened and every reason for closing one, disposal included;
  * {@link onDidAddPopoutGroup} is the opening half.
  *
  * For hosts that own their windows: in a desktop webview the page's own
  * `close()` can be a no-op, so the shell has to be told.
  */
  get onWillClosePopoutWindow() {
    return this.component.onWillClosePopoutWindow;
  }
  /** Enumerate the popout groups currently open in their own windows. */
  getPopouts() {
    return this.component.getPopouts();
  }
  /**
  * Invoked when a tab group is created in any group.
  */
  get onDidCreateTabGroup() {
    return this.component.onDidCreateTabGroup;
  }
  /**
  * Invoked when a tab group is destroyed in any group.
  */
  get onDidDestroyTabGroup() {
    return this.component.onDidDestroyTabGroup;
  }
  /**
  * Invoked when a panel is added to a tab group.
  */
  get onDidAddPanelToTabGroup() {
    return this.component.onDidAddPanelToTabGroup;
  }
  /**
  * Invoked when a panel is removed from a tab group.
  */
  get onDidRemovePanelFromTabGroup() {
    return this.component.onDidRemovePanelFromTabGroup;
  }
  /**
  * Invoked when a tab group's properties (label, color) change.
  */
  get onDidTabGroupChange() {
    return this.component.onDidTabGroupChange;
  }
  /**
  * Invoked when a tab group is collapsed or expanded.
  */
  get onDidTabGroupCollapsedChange() {
    return this.component.onDidTabGroupCollapsedChange;
  }
  /**
  * All panel objects.
  */
  get panels() {
    return this.component.panels;
  }
  /**
  * All group objects.
  */
  get groups() {
    return this.component.groups;
  }
  /**
  * The nearest grid group in a spatial direction from `group`, comparing
  * group centre points, e.g. the group visually to the left. Floating and
  * popout groups are ignored. Returns `undefined` when there is no group in
  * that direction. Pair with `group.api.boundingBox` to build your own
  * spatial navigation.
  */
  adjacentGroupInDirection(e, t) {
    return this.component.adjacentGroupInDirection(e, t);
  }
  /**
  *  Active panel object.
  */
  get activePanel() {
    return this.component.activePanel;
  }
  /**
  * Active group object.
  */
  get activeGroup() {
    return this.component.activeGroup;
  }
  /**
  * The resolved accessibility message catalog (the app's `messages`
  * overrides merged over the English defaults). Used by parts that surface
  * localisable AT strings, e.g. the default tab's close-button label.
  */
  get messages() {
    return yo(this.component.options.messages);
  }
  constructor(e) {
    this.component = e;
  }
  /**
  *  Focus the component. Will try to focus an active panel if one exists.
  */
  focus() {
    this.component.focus();
  }
  /**
  * Get a panel object given a `string` id. May return `undefined`.
  */
  getPanel(e) {
    return this.component.getGroupPanel(e);
  }
  /**
  * Force resize the component to an exact width and height. Read about auto-resizing before using.
  */
  layout(e, t, i = !1) {
    this.component.layout(e, t, i);
  }
  /**
  * Add a panel and return the created object.
  */
  addPanel(e) {
    return this.component.withOrigin("api", () => this.component.addPanel(e));
  }
  /**
  * Remove a panel given the panel object.
  */
  removePanel(e) {
    this.component.withOrigin("api", () => this.component.removePanel(e));
  }
  /**
  * Add a group and return the created object.
  */
  addGroup(e) {
    return this.component.withOrigin("api", () => this.component.addGroup(e));
  }
  /**
  * Close all groups and panels.
  */
  closeAllGroups() {
    return this.component.withOrigin("api", () => this.component.closeAllGroups());
  }
  /**
  * Remove a group and any panels within the group.
  */
  removeGroup(e) {
    this.component.withOrigin("api", () => this.component.removeGroup(e));
  }
  /**
  * Get a group object given a `string` id. May return undefined.
  */
  getGroup(e) {
    return this.component.getPanel(e);
  }
  /**
  * Add a floating group
  */
  addFloatingGroup(e, t) {
    return this.component.withOrigin("api", () => this.component.addFloatingGroup(e, t));
  }
  /**
  * Create a component from a serialized object.
  */
  fromJSON(e, t) {
    this.component.withOrigin("api", () => this.component.fromJSON(e, t));
  }
  /**
  * Create a serialized object of the current component.
  */
  toJSON() {
    return this.component.toJSON();
  }
  /**
  * Reset the component back to an empty and default state.
  */
  clear() {
    this.component.withOrigin("api", () => this.component.clear());
  }
  /**
  * Undo the previous recorded layout mutation. No-op when there is nothing
  * to undo, when `layoutHistory.enabled` is not set, or when the
  * LayoutHistory module is absent.
  */
  undo() {
    this.component.undo();
  }
  /** Re-apply the next layout mutation undone via {@link undo}. */
  redo() {
    this.component.redo();
  }
  /** Whether {@link undo} would do something. Reactive via {@link onDidChangeHistory}. */
  get canUndo() {
    return this.component.canUndo;
  }
  /** Whether {@link redo} would do something. */
  get canRedo() {
    return this.component.canRedo;
  }
  /** Drop both undo and redo stacks (e.g. on document switch). */
  clearHistory() {
    this.component.clearHistory();
  }
  /** Fires whenever the undo/redo stacks change. */
  get onDidChangeHistory() {
    return this.component.onDidChangeHistory;
  }
  /**
  * Whether Smart Guides snapping is active (the `smartGuides` option is
  * present + enabled and the module is registered). Reactive via
  * {@link setSmartGuidesEnabled}.
  */
  get smartGuidesEnabled() {
    return this.component.smartGuidesEnabled;
  }
  /** Toggle Smart Guides snapping at runtime (no-op when the module is absent). */
  setSmartGuidesEnabled(e) {
    this.component.setSmartGuidesEnabled(e);
  }
  /** Merge a partial Smart Guides option override in at runtime. */
  updateSmartGuidesOptions(e) {
    this.component.updateSmartGuidesOptions(e);
  }
  /** Fires when a dragged floating group commits an alignment snap on drop. */
  get onDidSnapFloat() {
    return this.component.onDidSnapFloat;
  }
  /** Fires when a dragged floating group docks/merges into another on drop. */
  get onDidSnapTogether() {
    return this.component.onDidSnapTogether;
  }
  /**
  * Resolves once any in-flight popout-window restoration completes. Popout
  * windows re-open asynchronously, so after an {@link undo} / {@link redo} (or
  * {@link fromJSON}) that re-opens a popout, await this to know the window is
  * ready. Already-resolved when nothing is restoring.
  */
  get popoutRestorationPromise() {
    return this.component.popoutRestorationPromise;
  }
  /**
  * Activate the next panel or group, moving focus programmatically. Pass
  * `{ includePanel: true }` to step through the panels of the active group
  * before advancing to the next group.
  */
  activateNext(e) {
    this.component.activateNext(e);
  }
  /**
  * Activate the previous panel or group, moving focus programmatically. Pass
  * `{ includePanel: true }` to step through the panels of the active group
  * before advancing to the previous group.
  */
  activatePrevious(e) {
    this.component.activatePrevious(e);
  }
  /**
  * @deprecated Use {@link DockviewApi.activateNext} instead. Renamed because
  * this advances the active panel/group (focus), it does not relocate a
  * panel. Removal planned for a future major release.
  */
  moveToNext(e) {
    this.activateNext(e);
  }
  /**
  * @deprecated Use {@link DockviewApi.activatePrevious} instead. Renamed
  * because this advances the active panel/group (focus), it does not
  * relocate a panel. Removal planned for a future major release.
  */
  moveToPrevious(e) {
    this.activatePrevious(e);
  }
  maximizeGroup(e) {
    this.component.withOrigin("api", () => this.component.maximizeGroup(e.group));
  }
  hasMaximizedGroup() {
    return this.component.hasMaximizedGroup();
  }
  exitMaximizedGroup() {
    this.component.withOrigin("api", () => this.component.exitMaximizedGroup());
  }
  get onDidMaximizedGroupChange() {
    return this.component.onDidMaximizedGroupChange;
  }
  /**
  * Add a popout group in a new Window
  */
  addPopoutGroup(e, t) {
    return this.component.withOrigin("api", () => this.component.addPopoutGroup(e, t));
  }
  /**
  * Add an edge group at the given position. Returns the group panel API
  * for the newly created group. Throws if a group already exists there.
  */
  addEdgeGroup(e, t) {
    return this.component.addEdgeGroup(e, t);
  }
  /**
  * Reveal (create-or-fill) the edge group at `position` and move the dragged
  * item described by `data` into it. A newly created edge group tears down to
  * zero footprint when later emptied. Drives the dock-to-edge groups behind
  * the `dockToEdgeGroups` option; a no-op if edge groups are unavailable.
  */
  revealEdgeGroupWithData(e, t, i) {
    this.component.revealEdgeGroupWithData(e, t, i);
  }
  /**
  * Get the group panel API for an edge group at the given position.
  * Returns `undefined` if no edge group is configured at that position.
  */
  getEdgeGroup(e) {
    return this.component.getEdgeGroup(e);
  }
  /**
  * Set the visibility of an edge group.
  */
  setEdgeGroupVisible(e, t) {
    this.component.setEdgeGroupVisible(e, t);
  }
  /**
  * Check whether an edge group is currently visible.
  */
  isEdgeGroupVisible(e) {
    return this.component.isEdgeGroupVisible(e);
  }
  /**
  * Remove an edge group and reclaim its slot in the layout.
  * All panels inside the group are disposed. Throws if no group exists at position.
  */
  removeEdgeGroup(e) {
    this.component.removeEdgeGroup(e);
  }
  /**
  * Pin (expand) the collapsed edge group at `position`. Requires the
  * auto-hide edge groups module; no-op when it is absent.
  */
  pinEdgeGroup(e) {
    this.component.pinEdgeGroup(e);
  }
  /** Auto-hide (collapse to a strip) the edge group at `position`. */
  autoHideEdgeGroup(e) {
    this.component.autoHideEdgeGroup(e);
  }
  /**
  * Peek (slide out as an overlay, without reflowing the grid) or close the
  * collapsed edge group at `position`. No-op when the auto-hide module is
  * absent or the group is not collapsed.
  */
  peekEdgeGroup(e, t) {
    this.component.peekEdgeGroup(e, t);
  }
  updateOptions(e) {
    this.component.updateOptions(e);
  }
  _getGroupModel(e) {
    const t = this.component.getPanel(e);
    if (!t) throw new Error(`dockview: group '${e}' not found`);
    return t.model;
  }
  createTabGroup(e) {
    const t = this._getGroupModel(e.groupId);
    return this.component.withOrigin("api", () => t.createTabGroup({
      label: e.label,
      color: e.color,
      componentParams: e.componentParams
    }));
  }
  dissolveTabGroup(e) {
    const t = this._getGroupModel(e.groupId);
    this.component.withOrigin("api", () => t.dissolveTabGroup(e.tabGroupId));
  }
  addPanelToTabGroup(e) {
    const t = this._getGroupModel(e.groupId);
    this.component.withOrigin("api", () => t.addPanelToTabGroup(e.tabGroupId, e.panelId, e.index));
  }
  removePanelFromTabGroup(e) {
    const t = this._getGroupModel(e.groupId);
    this.component.withOrigin("api", () => t.removePanelFromTabGroup(e.panelId));
  }
  getTabGroups(e) {
    return this._getGroupModel(e.groupId).getTabGroups();
  }
  getTabGroupForPanel(e) {
    return this._getGroupModel(e.groupId).getTabGroupForPanel(e.panelId);
  }
  moveTabGroup(e) {
    this._getGroupModel(e.groupId).moveTabGroup(e.tabGroupId, e.index);
  }
  /**
  * Release resources and teardown component. Do not call when using framework versions of dockview.
  */
  dispose() {
    this.component.dispose();
  }
}, Do = class extends I {
  constructor(e, t) {
    super(), this.element = e, this.callbacks = t, this.target = null, this.registerListeners();
  }
  onDragEnter(e) {
    this.target = e.target, this.callbacks.onDragEnter(e);
  }
  onDragOver(e) {
    e.preventDefault(), this.callbacks.onDragOver && this.callbacks.onDragOver(e);
  }
  onDragLeave(e) {
    this.target === e.target && (this.target = null, this.callbacks.onDragLeave(e));
  }
  onDragEnd(e) {
    this.target = null, this.callbacks.onDragEnd(e);
  }
  onDrop(e) {
    this.callbacks.onDrop(e);
  }
  registerListeners() {
    this.addDisposables(T(this.element, "dragenter", (e) => {
      this.onDragEnter(e);
    }, !0)), this.addDisposables(T(this.element, "dragover", (e) => {
      this.onDragOver(e);
    }, !0)), this.addDisposables(T(this.element, "dragleave", (e) => {
      this.onDragLeave(e);
    })), this.addDisposables(T(this.element, "dragend", (e) => {
      this.onDragEnd(e);
    })), this.addDisposables(T(this.element, "drop", (e) => {
      this.onDrop(e);
    }));
  }
};
const Pr = {
  value: 50,
  type: "percentage"
}, zr = 100, Tr = 100;
function Ot() {
  const e = document.createElement("div");
  e.className = "dv-drop-target-dropzone";
  const t = document.createElement("div");
  return t.className = "dv-drop-target-selection", e.appendChild(t), {
    dropzone: e,
    selection: t
  };
}
function ko(e, t, i, o) {
  var r, n, s;
  const a = (r = o?.smallWidthBoundary) !== null && r !== void 0 ? r : zr, d = (n = o?.smallHeightBoundary) !== null && n !== void 0 ? n : Tr, c = t < a, l = i < d, h = e === "left", v = e === "right", p = e === "top", u = e === "bottom", g = !c && v, _ = !c && h, C = !l && p, k = !l && u;
  let y = 1;
  const P = (s = o?.size) !== null && s !== void 0 ? s : Pr;
  return P.type === "percentage" ? y = N(P.value, 0, 100) / 100 : ((g || _) && (y = N(0, P.value, t) / t), (C || k) && (y = N(0, P.value, i) / i)), {
    isSmallX: c,
    isSmallY: l,
    isLeft: h,
    isRight: v,
    isTop: p,
    isBottom: u,
    rightClass: g,
    leftClass: _,
    topClass: C,
    bottomClass: k,
    size: y
  };
}
function Co(e, t, i, o, r) {
  const n = ko(t, i, o, r), { rightClass: s, leftClass: a, topClass: d, bottomClass: c, size: l } = n, h = {
    top: "0px",
    left: "0px",
    width: "100%",
    height: "100%"
  };
  s ? (h.left = `${100 * (1 - l)}%`, h.width = `${100 * l}%`) : a ? h.width = `${100 * l}%` : d ? h.height = `${100 * l}%` : c && (h.top = `${100 * (1 - l)}%`, h.height = `${100 * l}%`), n.isSmallX && n.isLeft && (h.width = "4px"), n.isSmallX && n.isRight && (h.left = `${i - 4}px`, h.width = "4px"), n.isSmallY && n.isTop && (h.height = "4px"), n.isSmallY && n.isBottom && (h.top = `${o - 4}px`, h.height = "4px"), e.style.top = h.top, e.style.left = h.left, e.style.width = h.width, e.style.height = h.height, e.style.visibility = "visible", (!e.style.transform || e.style.transform === "") && (e.style.transform = "translate3d(0, 0, 0)");
  const v = n.isSmallX && (n.isLeft || n.isRight) || n.isSmallY && (n.isTop || n.isBottom);
  z(e, "dv-drop-target-small-vertical", n.isSmallY), z(e, "dv-drop-target-small-horizontal", n.isSmallX), z(e, "dv-drop-target-selection-line", v), z(e, "dv-drop-target-left", n.isLeft), z(e, "dv-drop-target-right", n.isRight), z(e, "dv-drop-target-top", n.isTop), z(e, "dv-drop-target-bottom", n.isBottom), z(e, "dv-drop-target-center", t === "center");
}
function Ar(e, t) {
  const i = `${Math.round(t.top)}px`, o = `${Math.round(t.left)}px`, r = `${Math.round(t.width)}px`, n = `${Math.round(t.height)}px`;
  return e.style.top !== i || e.style.left !== o || e.style.width !== r || e.style.height !== n;
}
function Er(e, t) {
  e.style.top = `${Math.round(t.top)}px`, e.style.left = `${Math.round(t.left)}px`, e.style.width = `${Math.round(t.width)}px`, e.style.height = `${Math.round(t.height)}px`, e.style.visibility = "visible", (!e.style.transform || e.style.transform === "") && (e.style.transform = "translate3d(0, 0, 0)");
}
function So(e) {
  const t = ko(e.quadrant, e.width, e.height, e.overlayModel), { rightClass: i, leftClass: o, topClass: r, bottomClass: n, size: s } = t, a = e.outlineElement.getBoundingClientRect(), d = e.targetModel.getElements(void 0, e.outlineElement), c = d.root, l = d.overlay, h = c.getBoundingClientRect(), v = a.top - h.top, p = a.left - h.left, u = {
    top: v,
    left: p,
    width: e.width,
    height: e.height
  };
  return i ? (u.left = p + e.width * (1 - s), u.width = e.width * s) : o ? u.width = e.width * s : r ? u.height = e.height * s : n && (u.top = v + e.height * (1 - s), u.height = e.height * s), t.isSmallX && t.isLeft && (u.width = 4), t.isSmallX && t.isRight && (u.left = p + e.width - 4, u.width = 4), t.isSmallY && t.isTop && (u.height = 4), t.isSmallY && t.isBottom && (u.top = v + e.height - 4, u.height = 4), Ar(l, u) ? (Er(l, u), l.className = `dv-drop-target-anchor${e.className ? ` ${e.className}` : ""}`, z(l, "dv-drop-target-left", t.isLeft), z(l, "dv-drop-target-right", t.isRight), z(l, "dv-drop-target-top", t.isTop), z(l, "dv-drop-target-bottom", t.isBottom), z(l, "dv-drop-target-anchor-line", t.isSmallX && (t.isLeft || t.isRight) || t.isSmallY && (t.isTop || t.isBottom)), z(l, "dv-drop-target-center", e.quadrant === "center"), d.changed && (z(l, "dv-drop-target-anchor-container-changed", !0), setTimeout(() => {
    z(l, "dv-drop-target-anchor-container-changed", !1);
  }, 10)), {
    boundsChanged: !0,
    targetChanged: d.changed
  }) : {
    boundsChanged: !1,
    targetChanged: d.changed
  };
}
var Go = class extends Ht {
  get nativeEvent() {
    return this.options.nativeEvent;
  }
  get position() {
    return this.options.position;
  }
  /** See {@link DroptargetEvent.edge}. */
  get edge() {
    return !!this.options.edge;
  }
  /** See {@link PositionResolverResult.edgeGroup}. A display hint; a consumer
  *  (e.g. the DnD compass) can bow out of this cell. */
  get edgeGroup() {
    return !!this.options.edgeGroup;
  }
  constructor(e) {
    super(), this.options = e;
  }
};
function wi(e) {
  switch (e) {
    case "above":
      return "top";
    case "below":
      return "bottom";
    case "left":
      return "left";
    case "right":
      return "right";
    case "within":
      return "center";
    default:
      throw new Error(`invalid direction '${e}'`);
  }
}
function Ir(e) {
  switch (e) {
    case "top":
      return "above";
    case "bottom":
      return "below";
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
      return "within";
    default:
      throw new Error(`invalid position '${e}'`);
  }
}
const Mr = {
  value: 20,
  type: "percentage"
};
var Bt = class Oe extends I {
  get disabled() {
    return this._disabled;
  }
  set disabled(t) {
    this._disabled = t;
  }
  get state() {
    return this._state;
  }
  constructor(t, i) {
    super(), this.element = t, this.options = i, this._edge = !1, this._onDrop = new D(), this.onDrop = this._onDrop.event, this._onWillShowOverlay = new D(), this.onWillShowOverlay = this._onWillShowOverlay.event, this._disabled = !1, this._acceptedTargetZonesSet = new Set(this.options.acceptedTargetZones), this.dnd = new Do(this.element, {
      onDragEnter: () => {
        var o, r;
        (o = (r = this.options).getOverrideTarget) === null || o === void 0 || (o = o.call(r)) === null || o === void 0 || o.getElements();
      },
      onDragOver: (o) => {
        var r, n, s, a, d, c, l;
        if (this._disabled) {
          this.clearOwnOverlay();
          return;
        }
        Oe.ACTUAL_TARGET = this;
        const h = (r = (n = this.options).getOverrideTarget) === null || r === void 0 ? void 0 : r.call(n);
        if (this._acceptedTargetZonesSet.size === 0) {
          this.clearOwnOverlay();
          return;
        }
        const v = (s = (a = (d = this.options).getOverlayOutline) === null || a === void 0 ? void 0 : a.call(d)) !== null && s !== void 0 ? s : this.element, p = v.offsetWidth, u = v.offsetHeight;
        if (p === 0 || u === 0) return;
        const g = v.getBoundingClientRect(), _ = ((c = o.clientX) !== null && c !== void 0 ? c : 0) - g.left, C = ((l = o.clientY) !== null && l !== void 0 ? l : 0) - g.top, k = this.resolvePosition(_, C, p, u, o);
        if (this.isAlreadyUsed(o)) {
          this.removeDropTarget();
          return;
        }
        if (k === null) {
          this.clearOwnOverlay();
          return;
        }
        const y = k.position;
        if (!this.options.canDisplayOverlay(o, y)) {
          this.clearOwnOverlay();
          return;
        }
        const P = new Go({
          nativeEvent: o,
          position: y,
          edge: k.edge,
          edgeGroup: k.edgeGroup
        });
        if (this._onWillShowOverlay.fire(P), P.defaultPrevented) {
          this.clearOwnOverlay();
          return;
        }
        if (this.markAsUsed(o), k.edge) {
          this.clearOwnOverlay(), this._state = y, this._edge = !0;
          return;
        }
        if (this._edge = !1, !h) {
          if (!this.targetElement) {
            const M = Ot();
            this.targetElement = M.dropzone, this.overlayElement = M.selection, this._state = "center", v.classList.add("dv-drop-target"), v.append(this.targetElement);
          }
        }
        this.toggleClasses(y, p, u), this._state = y;
      },
      onDragLeave: () => {
        var o, r;
        const n = (o = (r = this.options).getOverrideTarget) === null || o === void 0 ? void 0 : o.call(r);
        if (n) {
          var s;
          this._state = void 0, this._edge = !1, (s = n.scheduleClear) === null || s === void 0 || s.call(n);
          return;
        }
        this.removeDropTarget();
      },
      onDragEnd: (o) => {
        var r, n;
        const s = (r = (n = this.options).getOverrideTarget) === null || r === void 0 ? void 0 : r.call(n);
        s && Oe.ACTUAL_TARGET === this && this._state && (o.stopPropagation(), this._onDrop.fire({
          position: this._state,
          nativeEvent: o,
          edge: this._edge
        })), this.removeDropTarget(), s?.clear();
      },
      onDrop: (o) => {
        var r, n;
        o.preventDefault();
        const s = this._state, a = this._edge;
        this.removeDropTarget(), (r = (n = this.options).getOverrideTarget) === null || r === void 0 || (r = r.call(n)) === null || r === void 0 || r.clear(), s && (o.stopPropagation(), this._onDrop.fire({
          position: s,
          nativeEvent: o,
          edge: a
        }));
      }
    }), this.addDisposables(this._onDrop, this._onWillShowOverlay, this.dnd);
  }
  setTargetZones(t) {
    this._acceptedTargetZonesSet = new Set(t);
  }
  setOverlayModel(t) {
    this.options.overlayModel = t;
  }
  dispose() {
    this.removeDropTarget(), super.dispose();
  }
  /**
  * Add a property to the event object for other potential listeners to check
  */
  markAsUsed(t) {
    t[Oe.USED_EVENT_ID] = !0;
  }
  /**
  * Check is the event has already been used by another instance of DropTarget
  */
  isAlreadyUsed(t) {
    const i = t[Oe.USED_EVENT_ID];
    return typeof i == "boolean" && i;
  }
  toggleClasses(t, i, o) {
    var r, n;
    const s = (r = (n = this.options).getOverrideTarget) === null || r === void 0 ? void 0 : r.call(n);
    if (s) {
      var a, d, c;
      So({
        outlineElement: (a = (d = (c = this.options).getOverlayOutline) === null || d === void 0 ? void 0 : d.call(c)) !== null && a !== void 0 ? a : this.element,
        targetModel: s,
        quadrant: t,
        width: i,
        height: o,
        overlayModel: this.options.overlayModel,
        className: this.options.className
      });
      return;
    }
    this.overlayElement && Co(this.overlayElement, t, i, o, this.options.overlayModel);
  }
  /**
  * Resolve the drop {@link Position} for a pointer location: defer to an
  * injected {@link PositionResolver} when present, otherwise the built-in
  * cursor-quadrant logic (unchanged).
  */
  resolvePosition(t, i, o, r, n) {
    var s, a;
    const d = (s = (a = this.options).getPositionResolver) === null || s === void 0 ? void 0 : s.call(a);
    if (d) {
      const l = d.resolve({
        x: t,
        y: i,
        width: o,
        height: r,
        zones: this._acceptedTargetZonesSet,
        event: n
      });
      return l ? {
        position: l.position,
        edge: !!l.edge,
        edgeGroup: !!l.edgeGroup
      } : null;
    }
    const c = this.calculateQuadrant(this._acceptedTargetZonesSet, t, i, o, r);
    return c ? {
      position: c,
      edge: !1,
      edgeGroup: !1
    } : null;
  }
  calculateQuadrant(t, i, o, r, n) {
    var s, a;
    const d = (s = (a = this.options.overlayModel) === null || a === void 0 ? void 0 : a.activationSize) !== null && s !== void 0 ? s : Mr;
    return d.type === "percentage" ? Po(t, i, o, r, n, d.value) : zo(t, i, o, r, n, d.value);
  }
  /**
  * Tear down whatever this target is showing, on any frame it resolves to no
  * overlay. Two things make this more than `removeDropTarget`:
  *
  * - With `dndOverlayMounting: 'absolute'` the overlay lives in an anchor
  *   container shared by every drop target in the component, and
  *   `removeDropTarget` only owns the in-place dropzone — so the container
  *   needs clearing explicitly or the last frame's highlight lingers.
  * - It must only clear the container when this target actually put
  *   something there. The root edge target sits over every group and
  *   declines `center` on each frame in the middle of the layout purely so
  *   the event falls through; clearing from there would destroy and rebuild
  *   the group's overlay every frame, killing its move transition.
  *
  * Resetting `_state` unconditionally is the other half: a target that
  * resolves to nothing must not stay latched, or a later drop commits a
  * position the cursor left long ago.
  */
  clearOwnOverlay() {
    const t = this._state !== void 0;
    if (this.removeDropTarget(), t) {
      var i, o;
      (i = (o = this.options).getOverrideTarget) === null || i === void 0 || (i = i.call(o)) === null || i === void 0 || i.clear();
    }
  }
  removeDropTarget() {
    if (this._state = void 0, this._edge = !1, this.targetElement) {
      var t;
      (t = this.targetElement.parentElement) === null || t === void 0 || t.classList.remove("dv-drop-target"), this.targetElement.remove(), this.targetElement = void 0, this.overlayElement = void 0;
    }
  }
  /**
  * Render the drop overlay at `position` without a live drag, so keyboard
  * docking shows the exact same preview as a mouse drag. Mirrors the
  * `onDragOver` render path (in-place or anchored). Pair with `clearOverlay`.
  */
  showOverlay(t) {
    var i, o, r, n, s;
    const a = (i = (o = this.options).getOverrideTarget) === null || i === void 0 ? void 0 : i.call(o), d = (r = (n = (s = this.options).getOverlayOutline) === null || n === void 0 ? void 0 : n.call(s)) !== null && r !== void 0 ? r : this.element, c = d.offsetWidth, l = d.offsetHeight;
    if (!a && !this.targetElement) {
      const h = Ot();
      this.targetElement = h.dropzone, this.overlayElement = h.selection, d.classList.add("dv-drop-target"), d.append(this.targetElement);
    }
    this.toggleClasses(t, c, l), this._state = t;
  }
  /** Clear an overlay shown via {@link showOverlay} (in-place or anchored). */
  clearOverlay() {
    var t, i;
    this.removeDropTarget(), (t = (i = this.options).getOverrideTarget) === null || t === void 0 || (t = t.call(i)) === null || t === void 0 || t.clear(), this._state = void 0;
  }
};
Bt.USED_EVENT_ID = "__dockview_droptarget_event_is_used__";
function Po(e, t, i, o, r, n) {
  const s = 100 * t / o, a = 100 * i / r;
  return e.has("left") && s < n ? "left" : e.has("right") && s > 100 - n ? "right" : e.has("top") && a < n ? "top" : e.has("bottom") && a > 100 - n ? "bottom" : e.has("center") ? "center" : null;
}
function zo(e, t, i, o, r, n) {
  return e.has("left") && t < n ? "left" : e.has("right") && t > o - n ? "right" : e.has("top") && i < n ? "top" : e.has("bottom") && i > r - n ? "bottom" : e.has("center") ? "center" : null;
}
function Or(e, t, i) {
  var o, r, n;
  ce(t, "dv-dragged"), t.style.top = "-9999px", t.style.position = "absolute", (i?.owner ? uo(i.owner) : ((o = i?.ownerDocument) !== null && o !== void 0 ? o : document).body).appendChild(t), e.setDragImage(t, (r = i?.x) !== null && r !== void 0 ? r : 0, (n = i?.y) !== null && n !== void 0 ? n : 0), setTimeout(() => {
    le(t, "dv-dragged"), t.remove();
  }, 0);
}
var lt = class $e extends I {
  static getInstance() {
    var t;
    return (t = $e._instance) !== null && t !== void 0 || ($e._instance = new $e()), $e._instance;
  }
  constructor() {
    super(), this._targets = /* @__PURE__ */ new Set(), this._targetByElement = /* @__PURE__ */ new Map(), this._onDragStart = new D(), this.onDragStart = this._onDragStart.event, this._onDragMove = new D(), this.onDragMove = this._onDragMove.event, this._onDragEnd = new D(), this.onDragEnd = this._onDragEnd.event, this.addDisposables(this._onDragStart, this._onDragMove, this._onDragEnd);
  }
  get active() {
    return this._active;
  }
  registerTarget(t) {
    return this._targets.add(t), this._targetByElement.set(t.element, t), { dispose: () => {
      this._targets.delete(t), this._targetByElement.get(t.element) === t && this._targetByElement.delete(t.element), this._currentTarget === t && (this._currentTarget = void 0);
    } };
  }
  beginDrag(t) {
    var i, o, r, n;
    this._active && this.cancel();
    const { pointerEvent: s, source: a } = t, d = t.getData();
    this._active = {
      pointerId: s.pointerId,
      startX: s.clientX,
      startY: s.clientY,
      source: a
    }, this._lastPointerEvent = s, this._onDragMoveCallback = t.onDragMove, this._onDragEndCallback = t.onDragEnd, this._dataDisposable = d, this._ghost = t.ghost, this._iframeShield = We((i = a.ownerDocument) !== null && i !== void 0 ? i : document), this._selectionShield = co((o = a.ownerDocument) !== null && o !== void 0 ? o : document);
    const c = {
      clientX: s.clientX,
      clientY: s.clientY,
      pointerEvent: s
    };
    this._onDragStart.fire(c);
    const l = (r = (n = a.ownerDocument) === null || n === void 0 ? void 0 : n.defaultView) !== null && r !== void 0 ? r : globalThis.window;
    this._moveListener = T(l, "pointermove", (h) => {
      var v;
      h.pointerId === ((v = this._active) === null || v === void 0 ? void 0 : v.pointerId) && this._handleMove(h);
    }), this._upListener = T(l, "pointerup", (h) => {
      var v;
      h.pointerId === ((v = this._active) === null || v === void 0 ? void 0 : v.pointerId) && this._handleEnd(h, !0);
    }), this._cancelListener = T(l, "pointercancel", (h) => {
      var v;
      h.pointerId === ((v = this._active) === null || v === void 0 ? void 0 : v.pointerId) && this._handleEnd(h, !1);
    });
  }
  cancel() {
    var t, i;
    if (!this._active) return;
    const o = this._onDragEndCallback, r = this._lastPointerEvent;
    if ((t = this._currentTarget) === null || t === void 0 || t.handleDragLeave(), this._teardown(), (i = this._dataDisposable) === null || i === void 0 || i.dispose(), this._dataDisposable = void 0, r) {
      const n = {
        clientX: r.clientX,
        clientY: r.clientY,
        pointerEvent: r
      };
      o?.(n, !1), this._onDragEnd.fire(n);
    }
  }
  _findTargetUnder(t, i) {
    const o = (this._active ? zt(this._active.source) : document).elementsFromPoint(t, i);
    for (const n of o) {
      let s = n;
      for (; s; ) {
        var r;
        const a = this._targetByElement.get(s);
        if (a && !(!((r = a.isHitTestTransparent) === null || r === void 0) && r.call(a))) return a;
        s = s.parentElement;
      }
    }
  }
  _handleMove(t) {
    var i, o;
    this._lastPointerEvent = t, (i = this._ghost) === null || i === void 0 || i.update(t.clientX, t.clientY);
    const r = {
      clientX: t.clientX,
      clientY: t.clientY,
      pointerEvent: t
    }, n = this._findTargetUnder(t.clientX, t.clientY);
    if (n !== this._currentTarget) {
      var s;
      (s = this._currentTarget) === null || s === void 0 || s.handleDragLeave(), this._currentTarget = n;
    }
    n && n.handleDragOver(r), (o = this._onDragMoveCallback) === null || o === void 0 || o.call(this, r), this._onDragMove.fire(r);
  }
  _handleEnd(t, i) {
    const o = {
      clientX: t.clientX,
      clientY: t.clientY,
      pointerEvent: t
    };
    if (i && this._currentTarget) this._currentTarget.handleDrop(o);
    else {
      var r;
      (r = this._currentTarget) === null || r === void 0 || r.handleDragLeave();
    }
    const n = this._onDragEndCallback, s = this._dataDisposable;
    this._teardown(), this._dataDisposable = void 0, setTimeout(() => s?.dispose(), 0), n?.(o, i), this._onDragEnd.fire(o);
  }
  _teardown() {
    var t, i, o, r, n, s;
    this._currentTarget = void 0, this._active = void 0, this._lastPointerEvent = void 0, this._onDragMoveCallback = void 0, this._onDragEndCallback = void 0, (t = this._ghost) === null || t === void 0 || t.dispose(), this._ghost = void 0, (i = this._iframeShield) === null || i === void 0 || i.release(), this._iframeShield = void 0, (o = this._selectionShield) === null || o === void 0 || o.release(), this._selectionShield = void 0, (r = this._moveListener) === null || r === void 0 || r.dispose(), (n = this._upListener) === null || n === void 0 || n.dispose(), (s = this._cancelListener) === null || s === void 0 || s.dispose(), this._moveListener = void 0, this._upListener = void 0, this._cancelListener = void 0;
  }
};
const $r = {
  value: 20,
  type: "percentage"
};
var Rr = class extends I {
  get disabled() {
    return this._disabled;
  }
  set disabled(e) {
    this._disabled = e, e && this._removeOverlay();
  }
  get state() {
    return this._state;
  }
  constructor(e, t) {
    super(), this.element = e, this.options = t, this._edge = !1, this._onDrop = new D(), this.onDrop = this._onDrop.event, this._onWillShowOverlay = new D(), this.onWillShowOverlay = this._onWillShowOverlay.event, this._disabled = !1, this._acceptedTargetZonesSet = new Set(t.acceptedTargetZones);
    const i = {
      element: this.element,
      handleDragOver: (o) => this._onDragOver(o),
      handleDragLeave: () => this._onDragLeave(),
      handleDrop: (o) => this._onDropEvent(o),
      isHitTestTransparent: t.isHitTestTransparent
    };
    this.addDisposables(this._onDrop, this._onWillShowOverlay, lt.getInstance().registerTarget(i));
  }
  clearOverlay() {
    this._clearOwnOverlay();
  }
  setTargetZones(e) {
    this._acceptedTargetZonesSet = new Set(e);
  }
  setOverlayModel(e) {
    this.options.overlayModel = e;
  }
  dispose() {
    this._removeOverlay(), super.dispose();
  }
  _onDragOver(e) {
    var t, i, o, r, n;
    if (this._disabled) {
      this._clearOwnOverlay();
      return;
    }
    const s = (t = (i = this.options).getOverrideTarget) === null || t === void 0 ? void 0 : t.call(i);
    if (this._acceptedTargetZonesSet.size === 0) {
      this._clearOwnOverlay();
      return;
    }
    const a = (o = (r = (n = this.options).getOverlayOutline) === null || r === void 0 ? void 0 : r.call(n)) !== null && o !== void 0 ? o : this.element, d = a.offsetWidth, c = a.offsetHeight;
    if (d === 0 || c === 0) return;
    const l = a.getBoundingClientRect(), h = e.clientX - l.left, v = e.clientY - l.top, p = this._resolvePosition(h, v, d, c, e.pointerEvent);
    if (p === null) {
      this._clearOwnOverlay();
      return;
    }
    const u = p.position;
    if (!this.options.canDisplayOverlay(e.pointerEvent, u)) {
      this._clearOwnOverlay();
      return;
    }
    const g = new Go({
      nativeEvent: e.pointerEvent,
      position: u,
      edge: p.edge
    });
    if (this._onWillShowOverlay.fire(g), g.defaultPrevented) {
      this._clearOwnOverlay();
      return;
    }
    if (p.edge) {
      this._clearOwnOverlay(), this._state = u, this._edge = !0;
      return;
    }
    if (this._edge = !1, s) {
      So({
        outlineElement: a,
        targetModel: s,
        quadrant: u,
        width: d,
        height: c,
        overlayModel: this.options.overlayModel,
        className: this.options.className
      }), this._state = u;
      return;
    }
    if (!this._targetElement) {
      const _ = Ot();
      this._targetElement = _.dropzone, this._overlayElement = _.selection, this._state = "center", this.element.classList.add("dv-drop-target"), this.element.append(this._targetElement);
    }
    this._overlayElement && Co(this._overlayElement, u, d, c, this.options.overlayModel), this._state = u;
  }
  _onDragLeave() {
    var e, t;
    const i = (e = (t = this.options).getOverrideTarget) === null || e === void 0 ? void 0 : e.call(t);
    if (i) {
      this._state = void 0, i.clear();
      return;
    }
    this._removeOverlay();
  }
  _onDropEvent(e) {
    var t, i;
    const o = this._state, r = this._edge, n = (t = (i = this.options).getOverrideTarget) === null || t === void 0 ? void 0 : t.call(i);
    this._removeOverlay(), n?.clear(), o && this._onDrop.fire({
      position: o,
      nativeEvent: e.pointerEvent,
      edge: r
    });
  }
  /**
  * Resolve the drop {@link Position}: defer to an injected
  * {@link PositionResolver} when present, otherwise the built-in
  * cursor-quadrant logic (unchanged). Shares the resolver with the HTML5
  * backend.
  */
  _resolvePosition(e, t, i, o, r) {
    var n, s;
    const a = (n = (s = this.options).getPositionResolver) === null || n === void 0 ? void 0 : n.call(s);
    if (a) {
      const c = a.resolve({
        x: e,
        y: t,
        width: i,
        height: o,
        zones: this._acceptedTargetZonesSet,
        event: r
      });
      return c ? {
        position: c.position,
        edge: !!c.edge
      } : null;
    }
    const d = this._calculateQuadrant(e, t, i, o);
    return d ? {
      position: d,
      edge: !1
    } : null;
  }
  _calculateQuadrant(e, t, i, o) {
    var r, n;
    const s = (r = (n = this.options.overlayModel) === null || n === void 0 ? void 0 : n.activationSize) !== null && r !== void 0 ? r : $r;
    return s.type === "percentage" ? Po(this._acceptedTargetZonesSet, e, t, i, o, s.value) : zo(this._acceptedTargetZonesSet, e, t, i, o, s.value);
  }
  /**
  * Tear down whatever this target is showing, on any frame it resolves to no
  * overlay. Two things make this more than `_removeOverlay`:
  *
  * - With `dndOverlayMounting: 'absolute'` the overlay lives in an anchor
  *   container shared by every drop target in the component, and
  *   `_removeOverlay` only owns the in-place dropzone — so the container
  *   needs clearing explicitly or the last frame's highlight lingers.
  * - It must only clear the container when this target actually put
  *   something there. The root edge target sits over every group and
  *   declines `center` on each frame in the middle of the layout purely so
  *   the event falls through; clearing from there would destroy and rebuild
  *   the group's overlay every frame, killing its move transition.
  */
  _clearOwnOverlay() {
    const e = this._state !== void 0;
    if (this._removeOverlay(), e) {
      var t, i;
      (t = (i = this.options).getOverrideTarget) === null || t === void 0 || (t = t.call(i)) === null || t === void 0 || t.clear();
    }
  }
  _removeOverlay() {
    if (this._edge = !1, this._targetElement) {
      var e;
      this._state = void 0, (e = this._targetElement.parentElement) === null || e === void 0 || e.classList.remove("dv-drop-target"), this._targetElement.remove(), this._targetElement = void 0, this._overlayElement = void 0;
    } else this._state = void 0;
  }
};
const Lr = 5, Vr = 250, Nr = 8;
var Wr = class extends I {
  constructor(e, t) {
    var i;
    super(), this.element = e, this.options = t, this._disabled = !1, this._armed = !1, this._startX = 0, this._startY = 0, this._touchOnly = (i = t.touchOnly) !== null && i !== void 0 ? i : !0, this.addDisposables(T(this.element, "pointerdown", (o) => {
      this._onPointerDown(o);
    }));
  }
  setDisabled(e) {
    this._disabled = e, e && this._cancelPending();
  }
  /**
  * `false` lets the pointer source also handle mouse pointers; used when
  * `dndStrategy: 'pointer'` to drive every input type through this path.
  */
  setTouchOnly(e) {
    this._touchOnly !== e && (this._touchOnly = e, e && this._cancelPending());
  }
  _shouldHandle(e) {
    var t, i;
    return !(this._disabled || this._touchOnly && e.pointerType !== "touch" && e.pointerType !== "pen" || !((t = (i = this.options).isCancelled) === null || t === void 0) && t.call(i, e));
  }
  _onPointerDown(e) {
    var t, i, o, r, n, s;
    if (!this._shouldHandle(e)) return;
    this._cancelPending(), this._selectionShield = co((t = this.element.ownerDocument) !== null && t !== void 0 ? t : document), this._pendingPointerId = e.pointerId, this._startX = e.clientX, this._startY = e.clientY, this._startEvent = e;
    const a = e.pointerType === "touch" || e.pointerType === "pen", d = this.options.touchInitiationDelay, c = (i = typeof d == "function" ? d() : d) !== null && i !== void 0 ? i : Vr;
    this._armed = !a || c <= 0, a && c > 0 && Number.isFinite(c) && (this._armTimer = setTimeout(() => {
      this._armTimer = void 0, this._armed = !0;
    }, c));
    const l = (o = this.options.threshold) !== null && o !== void 0 ? o : Lr, h = this.options.pressTolerance, v = (r = typeof h == "function" ? h() : h) !== null && r !== void 0 ? r : Nr, p = (n = (s = this.element.ownerDocument) === null || s === void 0 ? void 0 : s.defaultView) !== null && n !== void 0 ? n : globalThis.window;
    this._pendingMoveListener = T(p, "pointermove", (u) => {
      if (u.pointerId !== this._pendingPointerId) return;
      const g = u.clientX - this._startX, _ = u.clientY - this._startY, C = Math.hypot(g, _);
      if (this._armed) {
        C >= l && this._beginDrag(u);
        return;
      }
      C > v && this._beginDrag(u);
    }), this._pendingUpListener = T(p, "pointerup", (u) => {
      u.pointerId === this._pendingPointerId && this._cancelPending();
    }), this._pendingCancelListener = T(p, "pointercancel", (u) => {
      u.pointerId === this._pendingPointerId && this._cancelPending();
    });
  }
  /** For sibling gesture detectors (e.g. LongPressDetector) to dismiss a pending drag. */
  cancelPending() {
    this._cancelPending();
  }
  _cancelPending() {
    var e, t, i, o;
    (e = this._selectionShield) === null || e === void 0 || e.release(), this._selectionShield = void 0, this._pendingPointerId = void 0, this._armTimer !== void 0 && (clearTimeout(this._armTimer), this._armTimer = void 0), this._armed = !1, (t = this._pendingMoveListener) === null || t === void 0 || t.dispose(), (i = this._pendingUpListener) === null || i === void 0 || i.dispose(), (o = this._pendingCancelListener) === null || o === void 0 || o.dispose(), this._pendingMoveListener = void 0, this._pendingUpListener = void 0, this._pendingCancelListener = void 0, this._startEvent = void 0;
  }
  _beginDrag(e) {
    var t, i, o, r, n;
    const s = (t = this._startEvent) !== null && t !== void 0 ? t : e;
    this._cancelPending(), (i = (o = this.options).onDragStart) === null || i === void 0 || i.call(o, s);
    const a = (r = (n = this.options).createGhost) === null || r === void 0 ? void 0 : r.call(n, s);
    lt.getInstance().beginDrag({
      pointerEvent: e,
      source: this.element,
      getData: () => this.options.getData(s),
      ghost: a,
      onDragMove: this.options.onDragMove,
      onDragEnd: this.options.onDragEnd
    });
  }
  dispose() {
    this._cancelPending(), super.dispose();
  }
}, Hr = class {
  constructor(e) {
    var t, i, o, r;
    this._disposed = !1, this.element = e.element, this.offsetX = (t = e.offsetX) !== null && t !== void 0 ? t : 0, this.offsetY = (i = e.offsetY) !== null && i !== void 0 ? i : 0;
    const n = e.owner ? uo(e.owner) : document.body;
    let s;
    Ae(n) && typeof this.element.showPopover == "function" && (s = this.element.ownerDocument.createElement("div"), s.popover = "manual", Object.assign(s.style, {
      inset: "auto",
      margin: "0",
      padding: "0",
      border: "0",
      background: "transparent",
      color: "inherit",
      overflow: "visible"
    }), s.appendChild(this.element), this.element.style.pointerEvents = "none", this.element.style.transform = "none"), this.container = (o = s) !== null && o !== void 0 ? o : this.element;
    const a = this.container.style;
    a.position = "fixed", a.left = "0px", a.top = "0px", a.pointerEvents = "none", a.zIndex = "99999", a.opacity = String((r = e.opacity) !== null && r !== void 0 ? r : 0.8), a.willChange = "transform", a.transform = `translate3d(${e.initialX - this.offsetX}px, ${e.initialY - this.offsetY}px, 0)`, n.appendChild(this.container), s?.showPopover();
  }
  update(e, t) {
    this._disposed || (this.container.style.transform = `translate3d(${e - this.offsetX}px, ${t - this.offsetY}px, 0)`);
  }
  dispose() {
    this._disposed || (this._disposed = !0, this.element.remove(), this.container !== this.element && this.container.remove());
  }
}, Fr = class extends I {
  constructor(e, t) {
    super(), this.el = e, this.opts = t, this._dataDisposable = new j(), this._pointerEventsDisposable = new j(), this._disabled = !!t.disabled, this.addDisposables(this._dataDisposable, this._pointerEventsDisposable, T(this.el, "dragstart", (i) => {
      var o, r, n, s, a, d, c;
      if (i.defaultPrevented || this._disabled || !((o = (r = this.opts).isCancelled) === null || o === void 0) && o.call(r, i)) {
        i.preventDefault();
        return;
      }
      const l = We((n = this.el.ownerDocument) !== null && n !== void 0 ? n : document);
      this._pointerEventsDisposable.value = { dispose: () => l.release() }, this.el.classList.add("dv-dragged"), setTimeout(() => this.el.classList.remove("dv-dragged"), 0), this._dataDisposable.value = this.opts.getData(i);
      const h = (s = (a = this.opts).createGhost) === null || s === void 0 ? void 0 : s.call(a, i);
      if (h && i.dataTransfer) {
        var v, p, u;
        if (Or(i.dataTransfer, h.element, {
          x: (v = h.offsetX) !== null && v !== void 0 ? v : 0,
          y: (p = h.offsetY) !== null && p !== void 0 ? p : 0,
          ownerDocument: (u = this.el.ownerDocument) !== null && u !== void 0 ? u : void 0,
          owner: this.el
        }), h.dispose) {
          const g = h.dispose;
          setTimeout(() => g(), 0);
        }
      }
      i.dataTransfer && (i.dataTransfer.effectAllowed = "move", i.dataTransfer.items.length === 0 && i.dataTransfer.setData("text/plain", "")), (d = (c = this.opts).onDragStart) === null || d === void 0 || d.call(c, i);
    }), T(this.el, "dragend", (i) => {
      var o, r;
      this._pointerEventsDisposable.dispose(), setTimeout(() => this._dataDisposable.dispose(), 0), (o = (r = this.opts).onDragEnd) === null || o === void 0 || o.call(r, i);
    }));
  }
  setDisabled(e) {
    this._disabled = e;
  }
  setTouchOnly(e) {
  }
  cancelPending() {
  }
}, Br = class {
  constructor() {
    this.kind = "html5";
  }
  createDropTarget(e, t) {
    return new Bt(e, t);
  }
  createDragSource(e, t) {
    return new Fr(e, t);
  }
}, Ur = class {
  constructor() {
    this.kind = "pointer";
  }
  createDropTarget(e, t) {
    return new Rr(e, t);
  }
  createDragSource(e, t) {
    const i = t.createGhost ? (r) => {
      const n = t.createGhost(r);
      if (!n) return;
      const s = new Hr({
        element: n.element,
        initialX: r.clientX,
        initialY: r.clientY,
        offsetX: n.offsetX,
        offsetY: n.offsetY,
        owner: e
      });
      if (n.dispose) {
        const a = s.dispose.bind(s), d = n.dispose;
        s.dispose = () => {
          a(), d();
        };
      }
      return s;
    } : void 0, o = new Wr(e, {
      getData: t.getData,
      isCancelled: t.isCancelled,
      onDragStart: t.onDragStart,
      onDragEnd: t.onDragEnd ? (r) => t.onDragEnd(r.pointerEvent) : void 0,
      createGhost: i,
      touchOnly: t.touchOnly,
      touchInitiationDelay: t.touchInitiationDelay,
      pressTolerance: t.pressTolerance,
      threshold: t.threshold
    });
    return t.disabled && o.setDisabled(!0), o;
  }
};
const ye = new Br(), he = new Ur();
var To = class extends Ht {
  constructor() {
    super();
  }
}, Yr = class extends I {
  get isFocused() {
    return this._isFocused;
  }
  get isActive() {
    return this._isActive;
  }
  get isVisible() {
    return this._isVisible;
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  constructor(e, t) {
    super(), this.id = e, this.component = t, this._isFocused = !1, this._isActive = !1, this._isVisible = !0, this._width = 0, this._height = 0, this._parameters = {}, this.panelUpdatesDisposable = new j(), this._onDidDimensionChange = new D(), this.onDidDimensionsChange = this._onDidDimensionChange.event, this._onDidChangeFocus = new D(), this.onDidFocusChange = this._onDidChangeFocus.event, this._onWillFocus = new D(), this.onWillFocus = this._onWillFocus.event, this._onDidVisibilityChange = new D(), this.onDidVisibilityChange = this._onDidVisibilityChange.event, this._onWillVisibilityChange = new D(), this.onWillVisibilityChange = this._onWillVisibilityChange.event, this._onDidActiveChange = new D(), this.onDidActiveChange = this._onDidActiveChange.event, this._onActiveChange = new D(), this.onActiveChange = this._onActiveChange.event, this._onDidParametersChange = new D(), this.onDidParametersChange = this._onDidParametersChange.event, this.addDisposables(this.onDidFocusChange((i) => {
      this._isFocused = i.isFocused;
    }), this.onDidActiveChange((i) => {
      this._isActive = i.isActive;
    }), this.onDidVisibilityChange((i) => {
      this._isVisible = i.isVisible;
    }), this.onDidDimensionsChange((i) => {
      this._width = i.width, this._height = i.height;
    }), this.panelUpdatesDisposable, this._onDidDimensionChange, this._onDidChangeFocus, this._onDidVisibilityChange, this._onDidActiveChange, this._onWillFocus, this._onActiveChange, this._onWillFocus, this._onWillVisibilityChange, this._onDidParametersChange);
  }
  getParameters() {
    return this._parameters;
  }
  initialize(e) {
    this.panelUpdatesDisposable.value = this._onDidParametersChange.event((t) => {
      this._parameters = t, e.update({ params: t });
    });
  }
  setVisible(e) {
    this._onWillVisibilityChange.fire({ isVisible: e });
  }
  setActive() {
    this._onActiveChange.fire();
  }
  updateParameters(e) {
    this._onDidParametersChange.fire(e);
  }
}, jr = class extends I {
  get element() {
    return this._element;
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  get params() {
    var e;
    return (e = this._params) === null || e === void 0 ? void 0 : e.params;
  }
  constructor(e, t, i) {
    super(), this.id = e, this.component = t, this.api = i, this._height = 0, this._width = 0, this._element = document.createElement("div"), this._element.tabIndex = -1, this._element.style.outline = "none", this._element.style.height = "100%", this._element.style.width = "100%", this._element.style.overflow = "hidden";
    const o = so(this._element);
    this.addDisposables(this.api, o.onDidFocus(() => {
      this.api._onDidChangeFocus.fire({ isFocused: !0 });
    }), o.onDidBlur(() => {
      this.api._onDidChangeFocus.fire({ isFocused: !1 });
    }), o);
  }
  focus() {
    const e = new To();
    this.api._onWillFocus.fire(e), !e.defaultPrevented && this._element.focus();
  }
  layout(e, t) {
    this._width = e, this._height = t, this.api._onDidDimensionChange.fire({
      width: e,
      height: t
    }), this.part && this._params && this.part.update(this._params.params);
  }
  init(e) {
    this._params = e, this.part = this.getComponent();
  }
  update(e) {
    var t, i;
    this._params = O(O({}, this._params), {}, { params: O(O({}, (t = this._params) === null || t === void 0 ? void 0 : t.params), e.params) });
    for (const o of Object.keys(e.params)) e.params[o] === void 0 && delete this._params.params[o];
    (i = this.part) === null || i === void 0 || i.update({ params: this._params.params });
  }
  toJSON() {
    var e, t;
    const i = (e = (t = this._params) === null || t === void 0 ? void 0 : t.params) !== null && e !== void 0 ? e : {};
    return {
      id: this.id,
      component: this.component,
      params: Object.keys(i).length > 0 ? i : void 0
    };
  }
  dispose() {
    var e;
    this.api.dispose(), (e = this.part) === null || e === void 0 || e.dispose(), super.dispose();
  }
};
let Zr = 0;
const Xr = () => `dv-tabpanel-${Zr++}`;
var qr = class extends I {
  get element() {
    return this._element;
  }
  constructor(e, t) {
    var i, o, r, n, s, a, d;
    super(), this.accessor = e, this.group = t, this.disposable = new j(), this._onDidFocus = new D(), this.onDidFocus = this._onDidFocus.event, this._onDidBlur = new D(), this.onDidBlur = this._onDidBlur.event, this._element = document.createElement("div"), this._element.className = "dv-content-container", this._element.tabIndex = -1, this._element.id = Xr(), this._element.setAttribute("role", "tabpanel"), this.addDisposables(this._onDidFocus, this._onDidBlur);
    const c = () => {
      var h;
      return (h = t.dropTargetContainer) === null || h === void 0 ? void 0 : h.model;
    }, l = (h, v) => this.group.canDisplayContentOverlay(h, v);
    this.dropTarget = new Bt(this.element, {
      getOverlayOutline: () => {
        var h;
        return ((h = e.options.theme) === null || h === void 0 ? void 0 : h.dndPanelOverlay) === "group" ? this.element.parentElement : null;
      },
      className: "dv-drop-target-content",
      acceptedTargetZones: [
        "top",
        "bottom",
        "left",
        "right",
        "center"
      ],
      canDisplayOverlay: l,
      getOverrideTarget: c,
      overlayModel: (i = (o = this.accessor).resolveDropOverlayModel) === null || i === void 0 ? void 0 : i.call(o, "content"),
      getPositionResolver: () => {
        var h;
        return (h = e.getDropPositionResolver) === null || h === void 0 ? void 0 : h.call(e);
      }
    }), this.pointerDropTarget = he.createDropTarget(this.element, {
      acceptedTargetZones: [
        "top",
        "bottom",
        "left",
        "right",
        "center"
      ],
      canDisplayOverlay: l,
      getOverlayOutline: () => {
        var h;
        return ((h = e.options.theme) === null || h === void 0 ? void 0 : h.dndPanelOverlay) === "group" ? this.element.parentElement : null;
      },
      className: "dv-drop-target-content",
      getOverrideTarget: c,
      overlayModel: (r = (n = this.accessor).resolveDropOverlayModel) === null || r === void 0 ? void 0 : r.call(n, "content"),
      getPositionResolver: () => {
        var h;
        return (h = e.getDropPositionResolver) === null || h === void 0 ? void 0 : h.call(e);
      }
    }), this.addDisposables(this.dropTarget, this.pointerDropTarget, (s = (a = (d = this.accessor).onDidOptionsChange) === null || a === void 0 ? void 0 : a.call(d, () => {
      var h, v, p;
      const u = (h = (v = (p = this.accessor).resolveDropOverlayModel) === null || v === void 0 ? void 0 : v.call(p, "content")) !== null && h !== void 0 ? h : {};
      this.dropTarget.setOverlayModel(u), this.pointerDropTarget.setOverlayModel(u);
    })) !== null && s !== void 0 ? s : $.NONE);
  }
  show() {
    this.element.style.display = "";
  }
  hide() {
    this.element.style.display = "none";
  }
  setLabelledBy(e) {
    e ? this._element.setAttribute("aria-labelledby", e) : this._element.removeAttribute("aria-labelledby");
  }
  renderPanel(e, t) {
    var i;
    const o = ((i = t?.asActive) !== null && i !== void 0 ? i : !0) || this.group.isPanelActive(e);
    if (o || this.panel === e) {
      var r;
      if (((r = this.panel) === null || r === void 0 ? void 0 : r.view.content.element.parentElement) === this._element) {
        var n, s;
        this.panel.view.content.element.remove(), (n = (s = this.panel.view.content).onHide) === null || n === void 0 || n.call(s);
      }
      this.panel = e;
    }
    let a;
    switch (e.api.renderer) {
      case "onlyWhenVisible":
        if (this.group.renderContainer.detatch(e), o) {
          var d, c;
          this._element.appendChild(e.view.content.element), (d = (c = e.view.content).onShow) === null || d === void 0 || d.call(c);
        }
        a = this._element;
        break;
      case "always":
        e.view.content.element.parentElement === this._element && e.view.content.element.remove(), a = this.group.renderContainer.attach({
          panel: e,
          referenceContainer: this
        });
        break;
      default:
        throw new Error(`dockview: invalid renderer type '${e.api.renderer}'`);
    }
    if (o) {
      const l = so(a);
      this.focusTracker = l;
      const h = new I();
      h.addDisposables(l, l.onDidFocus(() => this._onDidFocus.fire()), l.onDidBlur(() => this._onDidBlur.fire())), this.disposable.value = h;
    }
  }
  openPanel(e) {
    this.panel !== e && this.renderPanel(e);
  }
  layout(e, t) {
  }
  closePanel() {
    if (this.panel && this.panel.api.renderer === "onlyWhenVisible") {
      var e, t;
      this.panel.view.content.element.remove(), (e = (t = this.panel.view.content).onHide) === null || e === void 0 || e.call(t);
    }
    this.panel = void 0;
  }
  dispose() {
    this.disposable.dispose(), super.dispose();
  }
  /**
  * Refresh the focus tracker state to handle cases where focus state
  * gets out of sync due to programmatic panel activation
  */
  refreshFocusState() {
    var e;
    !((e = this.focusTracker) === null || e === void 0) && e.refreshState && this.focusTracker.refreshState();
  }
};
const Ut = (e) => {
  const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  t.setAttributeNS(null, "height", e.height), t.setAttributeNS(null, "width", e.width), t.setAttributeNS(null, "viewBox", e.viewbox), t.setAttributeNS(null, "aria-hidden", "false"), t.setAttributeNS(null, "focusable", "false"), t.classList.add("dv-svg");
  const i = document.createElementNS("http://www.w3.org/2000/svg", "path");
  return i.setAttributeNS(null, "d", e.path), t.appendChild(i), t;
}, Kr = () => Ut({
  width: "11",
  height: "11",
  viewbox: "0 0 28 28",
  path: "M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z"
}), Ao = () => Ut({
  width: "11",
  height: "11",
  viewbox: "0 0 24 24",
  path: "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H6c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
}), Jr = () => Ut({
  width: "11",
  height: "11",
  viewbox: "0 0 15 25",
  path: "M2.15 24.1L0 21.95L9.9 12.05L0 2.15L2.15 0L14.2 12.05L2.15 24.1Z"
}), Qr = 500, en = 8;
var Yt = class extends I {
  constructor(e, t) {
    super(), this.element = e, this.options = t, this._startX = 0, this._startY = 0, this.addDisposables(T(this.element, "pointerdown", (i) => {
      this._onPointerDown(i);
    }));
  }
  _onPointerDown(e) {
    var t, i, o, r, n;
    if ((!((t = this.options.touchOnly) !== null && t !== void 0) || t) && e.pointerType !== "touch" && e.pointerType !== "pen") return;
    this._cancelPending(), this._pointerId = e.pointerId, this._startX = e.clientX, this._startY = e.clientY;
    const s = (i = this.options.delay) !== null && i !== void 0 ? i : Qr, a = (o = this.options.tolerance) !== null && o !== void 0 ? o : en, d = (r = (n = this.element.ownerDocument) === null || n === void 0 ? void 0 : n.defaultView) !== null && r !== void 0 ? r : globalThis.window;
    this._timer = setTimeout(() => {
      this._timer = void 0, this._cancelPending(), this._installContextMenuGuard(d), this._installClickGuard(d), this.options.onLongPress(e);
    }, s), this._moveListener = T(d, "pointermove", (c) => {
      if (c.pointerId !== this._pointerId) return;
      const l = c.clientX - this._startX, h = c.clientY - this._startY;
      Math.hypot(l, h) > a && this._cancelPending();
    }), this._upListener = T(d, "pointerup", (c) => {
      c.pointerId === this._pointerId && this._cancelPending();
    }), this._cancelListener = T(d, "pointercancel", (c) => {
      c.pointerId === this._pointerId && this._cancelPending();
    });
  }
  _installContextMenuGuard(e) {
    let t;
    const i = setTimeout(() => t?.dispose(), 500);
    t = T(e, "contextmenu", (o) => {
      o.preventDefault(), clearTimeout(i), t?.dispose();
    }, { capture: !0 });
  }
  _installClickGuard(e) {
    let t;
    const i = setTimeout(() => t?.dispose(), 500);
    t = T(e, "click", (o) => {
      Gt(o, [this.element]) && (o.preventDefault(), o.stopPropagation()), clearTimeout(i), t?.dispose();
    }, { capture: !0 });
  }
  _cancelPending() {
    var e, t, i;
    this._timer !== void 0 && (clearTimeout(this._timer), this._timer = void 0), this._pointerId = void 0, (e = this._moveListener) === null || e === void 0 || e.dispose(), (t = this._upListener) === null || t === void 0 || t.dispose(), (i = this._cancelListener) === null || i === void 0 || i.dispose(), this._moveListener = void 0, this._upListener = void 0, this._cancelListener = void 0;
  }
  dispose() {
    this._cancelPending(), super.dispose();
  }
};
function te(e) {
  if (e.disableDnd) return {
    html5: !1,
    pointer: !1,
    pointerHandlesMouse: !1
  };
  switch (e.dndStrategy) {
    case "pointer":
      return {
        html5: !1,
        pointer: !0,
        pointerHandlesMouse: !0
      };
    case "html5":
      return {
        html5: !0,
        pointer: !1,
        pointerHandlesMouse: !1
      };
    default:
      return tn() ? {
        html5: !1,
        pointer: !0,
        pointerHandlesMouse: !0
      } : {
        html5: !0,
        pointer: !0,
        pointerHandlesMouse: !1
      };
  }
}
function tn() {
  if (globalThis.window === void 0 || !globalThis.matchMedia) return !1;
  const e = globalThis.matchMedia("(pointer: coarse)").matches, t = globalThis.matchMedia("(pointer: fine)").matches;
  return e && !t;
}
let on = 0;
const rn = () => `dv-tab-${on++}`;
var nn = class extends I {
  get element() {
    return this._element;
  }
  constructor(e, t, i) {
    var o, r, n, s, a, d, c, l;
    super(), this.panel = e, this.accessor = t, this.group = i, this.content = void 0, this.panelTransfer = Te.getInstance(), this._direction = "horizontal", this._pinIndicator = void 0, this._onPointDown = new D(), this.onPointerDown = this._onPointDown.event, this._onTabClick = new D(), this.onTabClick = this._onTabClick.event, this._onDropped = new D(), this.onDrop = this._onDropped.event, this._onDragStart = new D(), this.onDragStart = this._onDragStart.event, this._onDragEnd = new D(), this.onDragEnd = this._onDragEnd.event;
    const h = te(this.accessor.options);
    this._element = document.createElement("div"), this._element.className = "dv-tab", this._element.tabIndex = -1, this._element.draggable = h.html5, this._element.id = rn(), this._element.setAttribute("role", "tab"), this._element.setAttribute("aria-selected", "false"), this._element.setAttribute("aria-label", (o = this.panel.title) !== null && o !== void 0 ? o : this.panel.id), this._element.dataset.tabPanelId = this.panel.id;
    const v = (r = this.group) === null || r === void 0 || (r = r.model) === null || r === void 0 ? void 0 : r.contentContainerId;
    v && this._element.setAttribute("aria-controls", v), z(this.element, "dv-inactive-tab", !0), this._updatePinnedClasses();
    const p = (g, _) => {
      if (this.group.locked) return !1;
      const C = W();
      if (this.accessor.id === C?.viewId) {
        var k;
        return !(((k = this.accessor.options.theme) === null || k === void 0 ? void 0 : k.tabAnimation) === "smooth" || C.tabGroupId && C.groupId === this.group.id && this.group.model.getTabGroupForPanel(this.panel.id));
      }
      return this.group.model.canDisplayOverlay(g, _, "tab");
    };
    this.dropTarget = ye.createDropTarget(this._element, {
      acceptedTargetZones: ["left", "right"],
      overlayModel: this._buildOverlayModel(),
      canDisplayOverlay: p,
      getOverrideTarget: () => {
        var g;
        return (g = i.model.dropTargetContainer) === null || g === void 0 ? void 0 : g.model;
      }
    }), this.pointerDropTarget = he.createDropTarget(this._element, {
      acceptedTargetZones: ["left", "right"],
      overlayModel: this._buildOverlayModel(),
      canDisplayOverlay: p,
      getOverrideTarget: () => {
        var g;
        return (g = i.model.dropTargetContainer) === null || g === void 0 ? void 0 : g.model;
      }
    });
    const u = {
      getData: () => (this.panelTransfer.setData([new ee(this.accessor.id, this.group.id, this.panel.id)], ee.prototype), { dispose: () => {
        this.panelTransfer.clearData(ee.prototype);
      } }),
      createGhost: () => ({
        element: this._buildGhostElement(),
        offsetX: 30,
        offsetY: -10
      }),
      onDragStart: (g) => {
        var _;
        this._onDragStart.fire(g), !(g instanceof PointerEvent) && ((_ = this.accessor.options.theme) === null || _ === void 0 ? void 0 : _.tabAnimation) === "smooth" && requestAnimationFrame(() => {
          z(this.element, "dv-tab--dragging", !0);
        });
      },
      onDragEnd: (g) => {
        this._onDragEnd.fire(g);
      }
    };
    this.html5DragSource = ye.createDragSource(this._element, O(O({}, u), {}, { disabled: !h.html5 })), this.pointerDragSource = he.createDragSource(this._element, O(O({}, u), {}, {
      disabled: !h.pointer,
      touchOnly: !h.pointerHandlesMouse,
      isCancelled: () => !te(this.accessor.options).pointer
    })), this.onWillShowOverlay = ie.any(this.dropTarget.onWillShowOverlay, this.pointerDropTarget.onWillShowOverlay), this.addDisposables(this._onPointDown, this._onTabClick, this._onDropped, this._onDragStart, this._onDragEnd, this.accessor.onDidOptionsChange(() => {
      const g = this._buildOverlayModel();
      this.dropTarget.setOverlayModel(g), this.pointerDropTarget.setOverlayModel(g), this._updatePinnedClasses();
    }), (n = (s = this.panel.api) === null || s === void 0 || (a = s.onDidChangePinned) === null || a === void 0 ? void 0 : a.call(s, () => {
      this._updatePinnedClasses();
    })) !== null && n !== void 0 ? n : { dispose: () => {
    } }, (d = (c = this.panel.api) === null || c === void 0 || (l = c.onDidTitleChange) === null || l === void 0 ? void 0 : l.call(c, (g) => {
      var _;
      this._element.setAttribute("aria-label", (_ = g.title) !== null && _ !== void 0 ? _ : this.panel.id);
    })) !== null && d !== void 0 ? d : { dispose: () => {
    } }, T(this._element, "dragend", () => {
      z(this.element, "dv-tab--dragging", !1);
    }), this.html5DragSource, T(this._element, "pointerdown", (g) => {
      this._onPointDown.fire(g);
    }), T(this._element, "click", (g) => {
      this._onTabClick.fire(g);
    }), T(this._element, "contextmenu", (g) => {
      var _;
      (_ = this.accessor.contextMenuService) === null || _ === void 0 || _.show(this.panel, this.group, g);
    }), new Yt(this._element, { onLongPress: (g) => {
      var _;
      this.pointerDragSource.cancelPending(), (_ = this.accessor.contextMenuService) === null || _ === void 0 || _.show(this.panel, this.group, g);
    } }), this.dropTarget.onDrop((g) => {
      this._onDropped.fire(g);
    }), this.pointerDropTarget.onDrop((g) => {
      this._onDropped.fire(g);
    }), this.dropTarget, this.pointerDropTarget, this.pointerDragSource);
  }
  _updatePinnedClasses() {
    var e, t, i, o;
    const r = (e = (t = this.panel.api) === null || t === void 0 ? void 0 : t.isPinned) !== null && e !== void 0 ? e : !1, n = r && ((i = this.accessor.options.pinnedTabs) === null || i === void 0 ? void 0 : i.compact) === !0;
    z(this.element, "dv-tab--pinned", r), z(this.element, "dv-tab--pinned-compact", n);
    const s = r && !(!((o = this.panel.api) === null || o === void 0) && o.tabComponent);
    if (s && !this._pinIndicator) {
      const a = document.createElement("div");
      a.className = "dv-tab-pin", a.appendChild(Ao()), this._element.insertBefore(a, this._element.firstChild), this._pinIndicator = a;
    } else !s && this._pinIndicator && (this._pinIndicator.remove(), this._pinIndicator = void 0);
  }
  setActive(e) {
    z(this.element, "dv-active-tab", e), z(this.element, "dv-inactive-tab", !e), this._element.setAttribute("aria-selected", e ? "true" : "false"), this._element.tabIndex = e ? 0 : -1;
  }
  setContent(e) {
    this.content && this.content.element.remove(), this.content = e, this._element.appendChild(this.content.element);
  }
  _buildOverlayModel() {
    var e, t, i;
    const o = (e = (t = this.accessor).resolveDropOverlayModel) === null || e === void 0 ? void 0 : e.call(t, "tab", this.group);
    if (o) return o;
    const r = ((i = this.accessor.options.theme) === null || i === void 0 ? void 0 : i.dndTabIndicator) === "line" ? Number.POSITIVE_INFINITY : 0;
    return {
      activationSize: {
        value: 50,
        type: "percentage"
      },
      smallWidthBoundary: r,
      smallHeightBoundary: r
    };
  }
  setDirection(e) {
    this._direction = e;
    const t = e === "vertical" ? ["top", "bottom"] : ["left", "right"];
    this.dropTarget.setTargetZones(t), this.pointerDropTarget.setTargetZones(t);
  }
  updateDragAndDropState() {
    const e = te(this.accessor.options);
    this._element.draggable = e.html5, this.html5DragSource.setDisabled(!e.html5), this.pointerDragSource.setDisabled(!e.pointer), this.pointerDragSource.setTouchOnly(!e.pointerHandlesMouse);
  }
  /**
  * Vertical tabs are flipped to horizontal so the ghost stays readable
  * during the drag rather than appearing sideways-rotated.
  */
  _buildGhostElement() {
    const e = getComputedStyle(this.element), t = this.element.cloneNode(!0), i = this._direction === "vertical", o = /* @__PURE__ */ new Set([
      "writing-mode",
      "inline-size",
      "block-size",
      "min-inline-size",
      "min-block-size",
      "max-inline-size",
      "max-block-size",
      "margin-inline",
      "margin-inline-start",
      "margin-inline-end",
      "margin-block",
      "margin-block-start",
      "margin-block-end",
      "padding-inline",
      "padding-inline-start",
      "padding-inline-end",
      "padding-block",
      "padding-block-start",
      "padding-block-end"
    ]);
    return Array.from(e).forEach((r) => {
      i && o.has(r) || t.style.setProperty(r, e.getPropertyValue(r), e.getPropertyPriority(r));
    }), i && (t.style.setProperty("writing-mode", "horizontal-tb"), t.style.setProperty("width", e.height), t.style.setProperty("height", e.width)), t.style.position = "absolute", t.classList.add("dv-tab-ghost-drag"), t;
  }
}, Fe = class {
  get kind() {
    return this.options.kind;
  }
  /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
  get nativeEvent() {
    return this.event.nativeEvent;
  }
  get position() {
    return this.event.position;
  }
  /** The resolved cell was marked `edge` (an outer "dock to the whole layout"
  *  cell). See {@link DroptargetEvent.edge}. */
  get edge() {
    return this.event.edge;
  }
  /** The resolved cell docks as a dedicated edge group (display hint). See
  *  {@link PositionResolverResult.edgeGroup}. */
  get edgeGroup() {
    return this.event.edgeGroup;
  }
  get defaultPrevented() {
    return this.event.defaultPrevented;
  }
  get panel() {
    return this.options.panel;
  }
  get api() {
    return this.options.api;
  }
  get group() {
    return this.options.group;
  }
  preventDefault() {
    this.event.preventDefault();
  }
  getData() {
    return this.options.getData();
  }
  constructor(e, t) {
    this.event = e, this.options = t;
  }
}, Eo = class extends I {
  get group() {
    return this.groupAccessor();
  }
  constructor(e) {
    var t, i;
    super(), this.panelTransfer = Te.getInstance(), this._onDragStart = new D(), this.onDragStart = this._onDragStart.event, this._element = e.element, this.accessor = e.accessor;
    const o = e.group;
    this.groupAccessor = typeof o == "function" ? o : () => o, this.isFloatingMoveHandle = (t = e.isFloatingMoveHandle) !== null && t !== void 0 ? t : (() => !0);
    const r = te(this.accessor.options);
    this._element.draggable = r.html5, z(this._element, "dv-draggable", r.html5 || r.pointer), this.addDisposables(this._onDragStart);
    const n = () => {
      const v = document.createElement("div"), p = globalThis.getComputedStyle(this._element), u = p.getPropertyValue("--dv-activegroup-visiblepanel-tab-background-color"), g = p.getPropertyValue("--dv-activegroup-visiblepanel-tab-color");
      return v.style.backgroundColor = u, v.style.color = g, v.style.padding = "2px 8px", v.style.height = "24px", v.style.fontSize = "11px", v.style.lineHeight = "20px", v.style.borderRadius = "12px", v.style.whiteSpace = "nowrap", v.style.boxSizing = "border-box", v.style.display = "inline-block", v.textContent = `Multiple Panels (${this.group.size})`, v;
    }, a = {
      getData: () => (this.panelTransfer.setData([new ee(this.accessor.id, this.group.id, null)], ee.prototype), { dispose: () => {
        this.panelTransfer.clearData(ee.prototype);
      } }),
      createGhost: () => {
        var v, p;
        const u = (v = (p = this.accessor).buildGroupDragGhost) === null || v === void 0 ? void 0 : v.call(p, this.group);
        return u || {
          element: n(),
          offsetX: 30,
          offsetY: -10
        };
      },
      onDragStart: (v) => {
        this._onDragStart.fire(v);
      }
    };
    this.html5DragSource = ye.createDragSource(this._element, O(O({}, a), {}, {
      disabled: !r.html5,
      isCancelled: (v) => !!(this.group.api.location.type === "floating" && this.isFloatingMoveHandle() && !v.shiftKey || this.group.api.location.type === "edge" && this.group.size === 0)
    }));
    const d = () => {
      var v;
      return ((v = this.group) === null || v === void 0 || (v = v.api) === null || v === void 0 || (v = v.location) === null || v === void 0 ? void 0 : v.type) === "floating" && this.isFloatingMoveHandle();
    };
    this.pointerDragSource = he.createDragSource(this._element, O(O({}, a), {}, {
      disabled: !r.pointer,
      touchOnly: !r.pointerHandlesMouse,
      touchInitiationDelay: () => d() ? 500 : 250,
      pressTolerance: () => d() ? 1 / 0 : 8,
      isCancelled: () => !te(this.accessor.options).pointer || this.group.api.location.type === "edge" && this.group.size === 0,
      onDragStart: (v) => {
        var p;
        (p = this.getFloatingOverlay()) === null || p === void 0 || p.cancelPendingDrag(), this._onDragStart.fire(v);
      }
    }));
    const c = new j(), l = () => {
      const v = this.getFloatingOverlay();
      c.value = v ? v.onDidStartMoving(() => {
        this.pointerDragSource.cancelPending();
      }) : $.NONE;
    };
    l(), this.addDisposables(c);
    const h = (i = this.group) === null || i === void 0 || (i = i.api) === null || i === void 0 ? void 0 : i.onDidLocationChange;
    h && this.addDisposables(h(l)), this.addDisposables(this.html5DragSource, this.pointerDragSource);
  }
  updateDragAndDropState() {
    const e = te(this.accessor.options);
    this._element.draggable = e.html5, z(this._element, "dv-draggable", e.html5 || e.pointer), this.html5DragSource.setDisabled(!e.html5), this.pointerDragSource.setDisabled(!e.pointer), this.pointerDragSource.setTouchOnly(!e.pointerHandlesMouse);
  }
  getFloatingOverlay() {
    var e;
    if (this.group)
      return (e = this.accessor.floatingGroups) === null || e === void 0 || (e = e.find((t) => t.group === this.group)) === null || e === void 0 ? void 0 : e.overlay;
  }
}, sn = class extends I {
  get element() {
    return this._element;
  }
  constructor(e, t) {
    var i, o, r, n, s, a, d;
    super(), this.accessor = e, this.group = t, this._onDrop = new D(), this.onDrop = this._onDrop.event, this._onDragStart = new D(), this.onDragStart = this._onDragStart.event, this._element = document.createElement("div"), this._element.className = "dv-void-container", this.addDisposables(this._onDrop, this._onDragStart, T(this._element, "pointerdown", () => {
      this.accessor.doSetGroupActive(this.group);
    }), T(this._element, "pointerdown", (l) => {
      l.shiftKey && lo(l);
    }, !0)), this.dragSource = new Eo({
      element: this._element,
      accessor: this.accessor,
      group: this.group,
      isFloatingMoveHandle: () => !this._element.closest(".dv-resize-container-with-titlebar")
    });
    const c = (l, h) => {
      if (this.group.api.locked) return !1;
      const v = W();
      return this.accessor.id === v?.viewId ? !0 : t.model.canDisplayOverlay(l, h, "header_space");
    };
    this.dropTarget = ye.createDropTarget(this._element, {
      acceptedTargetZones: ["center"],
      canDisplayOverlay: c,
      getOverrideTarget: () => {
        var l;
        return (l = t.model.dropTargetContainer) === null || l === void 0 ? void 0 : l.model;
      },
      overlayModel: (i = (o = this.accessor).resolveDropOverlayModel) === null || i === void 0 ? void 0 : i.call(o, "header_space", this.group)
    }), this.pointerDropTarget = he.createDropTarget(this._element, {
      acceptedTargetZones: ["center"],
      canDisplayOverlay: c,
      getOverrideTarget: () => {
        var l;
        return (l = t.model.dropTargetContainer) === null || l === void 0 ? void 0 : l.model;
      },
      overlayModel: (r = (n = this.accessor).resolveDropOverlayModel) === null || r === void 0 ? void 0 : r.call(n, "header_space", this.group)
    }), this.onWillShowOverlay = ie.any(this.dropTarget.onWillShowOverlay, this.pointerDropTarget.onWillShowOverlay), this.addDisposables(this.dragSource, this.dragSource.onDragStart((l) => {
      this._onDragStart.fire(l);
    }), this.dropTarget.onDrop((l) => {
      this._onDrop.fire(l);
    }), this.pointerDropTarget.onDrop((l) => {
      this._onDrop.fire(l);
    }), this.dropTarget, this.pointerDropTarget, (s = (a = (d = this.accessor).onDidOptionsChange) === null || a === void 0 ? void 0 : a.call(d, () => {
      var l, h, v;
      const p = (l = (h = (v = this.accessor).resolveDropOverlayModel) === null || h === void 0 ? void 0 : h.call(v, "header_space", this.group)) !== null && l !== void 0 ? l : {};
      this.dropTarget.setOverlayModel(p), this.pointerDropTarget.setOverlayModel(p);
    })) !== null && s !== void 0 ? s : $.NONE);
  }
  updateDragAndDropState() {
    this.dragSource.updateDragAndDropState();
  }
}, Io = class Mo extends I {
  get element() {
    return this._element;
  }
  get orientation() {
    return this._orientation;
  }
  set orientation(t) {
    this._orientation !== t && (this._scrollOffset = 0, this._orientation = t, le(this._scrollbar, "dv-scrollbar-vertical", "dv-scrollbar-horizontal"), t === "vertical" ? ce(this._scrollbar, "dv-scrollbar-vertical") : ce(this._scrollbar, "dv-scrollbar-horizontal"));
  }
  constructor(t) {
    super(), this.scrollableElement = t, this._scrollOffset = 0, this._orientation = "horizontal", this._element = document.createElement("div"), this._element.className = "dv-scrollable", this._scrollbar = document.createElement("div"), this._scrollbar.className = "dv-scrollbar dv-scrollbar-horizontal", this.element.appendChild(t), this.element.appendChild(this._scrollbar), this.addDisposables(T(this.element, "wheel", (i) => {
      this._scrollOffset += i.deltaY * Mo.MouseWheelSpeed, this.scheduleStyleUpdate();
    }), T(this._scrollbar, "pointerdown", (i) => {
      var o;
      i.preventDefault();
      const r = (o = this._scrollbar.ownerDocument) !== null && o !== void 0 ? o : document;
      z(this.element, "dv-scrollable-scrolling", !0);
      const n = this._orientation === "horizontal" ? i.clientX : i.clientY, s = this._scrollOffset, a = (c) => {
        const l = this._orientation === "horizontal" ? c.clientX - n : c.clientY - n, h = (this._orientation === "horizontal" ? this.element.clientWidth : this.element.clientHeight) / (this._orientation === "horizontal" ? this.scrollableElement.scrollWidth : this.scrollableElement.scrollHeight);
        this._scrollOffset = s + l / h, this.scheduleStyleUpdate();
      }, d = () => {
        z(this.element, "dv-scrollable-scrolling", !1), r.removeEventListener("pointermove", a), r.removeEventListener("pointerup", d), r.removeEventListener("pointercancel", d);
      };
      r.addEventListener("pointermove", a), r.addEventListener("pointerup", d), r.addEventListener("pointercancel", d);
    }), T(this.element, "scroll", () => {
      this.scheduleStyleUpdate();
    }), T(this.scrollableElement, "scroll", () => {
      this._scrollOffset = this._orientation === "horizontal" ? this.scrollableElement.scrollLeft : this.scrollableElement.scrollTop, this.scheduleStyleUpdate();
    }), ke(this.element, () => {
      z(this.element, "dv-scrollable-resizing", !0), this._animationTimer && clearTimeout(this._animationTimer), this._animationTimer = setTimeout(() => {
        clearTimeout(this._animationTimer), z(this.element, "dv-scrollable-resizing", !1);
      }, 500), this.scheduleStyleUpdate();
    }), $.from(() => {
      this._pendingStyleFrame !== void 0 && (cancelAnimationFrame(this._pendingStyleFrame), this._pendingStyleFrame = void 0);
    }));
  }
  /**
  * Coalesce the scrollbar restyle to one pass per animation frame. The
  * wheel / scroll / pointermove handlers can each fire many times per frame,
  * and `calculateScrollbarStyles` both reads layout (`clientWidth`/
  * `scrollWidth`) and writes styles + `scrollLeft`/`scrollTop`; running it
  * synchronously per event caused repeated read→write→read reflow. Batching
  * to a frame keeps a burst of events to a single measure+write.
  */
  scheduleStyleUpdate() {
    this._pendingStyleFrame === void 0 && (this._pendingStyleFrame = requestAnimationFrame(() => {
      this._pendingStyleFrame = void 0, this.calculateScrollbarStyles();
    }));
  }
  calculateScrollbarStyles() {
    const t = this._orientation === "horizontal" ? this.element.clientWidth : this.element.clientHeight, i = this._orientation === "horizontal" ? this.scrollableElement.scrollWidth : this.scrollableElement.scrollHeight;
    if (i > t) {
      const o = t * (t / i);
      this._orientation === "horizontal" ? (this._scrollbar.style.width = `${o}px`, this._scrollbar.style.height = "") : (this._scrollbar.style.height = `${o}px`, this._scrollbar.style.width = ""), this._scrollOffset = N(this._scrollOffset, 0, i - t), this._orientation === "horizontal" ? this.scrollableElement.scrollLeft = this._scrollOffset : this.scrollableElement.scrollTop = this._scrollOffset;
      const r = this._scrollOffset / (i - t);
      this._orientation === "horizontal" ? (this._scrollbar.style.left = `${(t - o) * r}px`, this._scrollbar.style.top = "") : (this._scrollbar.style.top = `${(t - o) * r}px`, this._scrollbar.style.left = "");
    } else
      this._orientation === "horizontal" ? (this._scrollbar.style.width = "0px", this._scrollbar.style.left = "0px") : (this._scrollbar.style.height = "0px", this._scrollbar.style.top = "0px"), this._scrollOffset = 0;
  }
};
Io.MouseWheelSpeed = 1;
const Oo = "dv-tabs-container--wrap";
function an(e, t) {
  return typeof e == "boolean" ? e : !!e?.[t];
}
function $t(e) {
  return typeof e == "boolean" ? e : e ? Object.values(e).some(Boolean) : !1;
}
var $o = class extends Qo {
  constructor(e, t, i, o, r) {
    super(), this.nativeEvent = e, this.target = t, this.position = i, this.getData = o, this.group = r;
  }
};
function dn(e) {
  return !!e.referencePanel;
}
function ln(e) {
  return !!e.referenceGroup;
}
function cn(e) {
  return !!e.referencePanel;
}
function hn(e) {
  return !!e.referenceGroup;
}
const jt = [
  {
    id: "grey",
    value: "var(--dv-tab-group-color-grey)",
    label: "Grey"
  },
  {
    id: "blue",
    value: "var(--dv-tab-group-color-blue)",
    label: "Blue"
  },
  {
    id: "red",
    value: "var(--dv-tab-group-color-red)",
    label: "Red"
  },
  {
    id: "yellow",
    value: "var(--dv-tab-group-color-yellow)",
    label: "Yellow"
  },
  {
    id: "green",
    value: "var(--dv-tab-group-color-green)",
    label: "Green"
  },
  {
    id: "pink",
    value: "var(--dv-tab-group-color-pink)",
    label: "Pink"
  },
  {
    id: "purple",
    value: "var(--dv-tab-group-color-purple)",
    label: "Purple"
  },
  {
    id: "cyan",
    value: "var(--dv-tab-group-color-cyan)",
    label: "Cyan"
  },
  {
    id: "orange",
    value: "var(--dv-tab-group-color-orange)",
    label: "Orange"
  }
];
var Ro = class {
  constructor(e, t = !0) {
    this._entries = e.slice(), this._byId = new Map(e.map((i) => [i.id, i])), this._enabled = t;
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(e) {
    this._enabled = e;
  }
  /**
  * Replace the entry list in place. Used by `updateOptions` so that
  * existing palette references (held by chips, indicators, etc.) see
  * the new palette without needing to be re-wired.
  */
  setEntries(e) {
    this._entries = e.slice(), this._byId = new Map(e.map((t) => [t.id, t]));
  }
  entries() {
    return this._entries;
  }
  has(e) {
    return this._byId.has(e);
  }
  get(e) {
    return this._byId.get(e);
  }
  /** First entry's id; used as the default when a color is unset. */
  defaultId() {
    var e;
    return (e = this._entries[0]) === null || e === void 0 ? void 0 : e.id;
  }
  /**
  * Resolve a stored color to its CSS value, or undefined if no value
  * should be written (palette disabled, or color empty/undefined).
  */
  resolveValue(e) {
    if (!this._enabled || !e) return;
    const t = this._byId.get(e);
    return t ? t.value : e;
  }
};
let wt;
function Lo() {
  var e;
  return (e = wt) !== null && e !== void 0 || (wt = new Ro(jt, !0)), wt;
}
function Zt(e, t, i) {
  const o = (i ?? Lo()).resolveValue(t);
  o === void 0 ? e.style.removeProperty("--dv-tab-group-color") : e.style.setProperty("--dv-tab-group-color", o);
}
function Xt(e, t) {
  return (t ?? Lo()).resolveValue(e);
}
var xi = class extends I {
  get element() {
    return this._element;
  }
  constructor(e) {
    super(), this._palette = e, this._onClick = new D(), this.onClick = this._onClick.event, this._onContextMenu = new D(), this.onContextMenu = this._onContextMenu.event, this._element = document.createElement("div"), this._element.className = "dv-tab-group-chip", this._element.tabIndex = 0, this._label = document.createElement("span"), this._label.className = "dv-tab-group-chip-label", this._element.appendChild(this._label), this.addDisposables(this._onClick, this._onContextMenu, new Yt(this._element, { onLongPress: (t) => {
      this._onContextMenu.fire(t);
    } }), T(this._element, "click", (t) => {
      this._onClick.fire(t);
    }), T(this._element, "contextmenu", (t) => {
      this._onContextMenu.fire(t);
    }));
  }
  init(e) {
    this._tabGroup = e.tabGroup, this.updateColor(e.tabGroup.color), this.updateLabel(e.tabGroup.label), this.updateCollapsed(e.tabGroup.collapsed), this.addDisposables(e.tabGroup.onDidChange(() => {
      this._tabGroup && (this.updateColor(this._tabGroup.color), this.updateLabel(this._tabGroup.label));
    }), e.tabGroup.onDidCollapseChange((t) => {
      this.updateCollapsed(t);
    }), this._onClick.event(() => {
      var t;
      (t = this._tabGroup) === null || t === void 0 || t.toggle();
    }));
  }
  update(e) {
    this._tabGroup = e.tabGroup, this.updateColor(e.tabGroup.color), this.updateLabel(e.tabGroup.label), this.updateCollapsed(e.tabGroup.collapsed);
  }
  updateColor(e) {
    var t;
    Zt(this._element, e, this._palette), z(this._element, "dv-tab-group-chip--accent-off", ((t = this._palette) === null || t === void 0 ? void 0 : t.enabled) === !1);
  }
  updateLabel(e) {
    this._label.textContent = e, z(this._label, "dv-tab-group-chip-label--empty", !e);
  }
  updateCollapsed(e) {
    z(this._element, "dv-tab-group-chip--collapsed", e);
  }
};
const vn = "dv-tab-group-chip-continuation", yi = 8;
var Vo = class {
  get underlines() {
    return this._underlines;
  }
  constructor(e) {
    this._ctx = e, this._underlines = /* @__PURE__ */ new Map(), this._continuationMarkers = /* @__PURE__ */ new Map(), this._rafId = null;
  }
  positionUnderlines() {
    requestAnimationFrame(() => {
      this._positionUnderlinesSync();
    });
  }
  /**
  * Continuously reposition underlines every frame for the duration
  * of a tab transition (~200ms), so the underline tracks tab sizes.
  */
  trackUnderlines() {
    this._rafId !== null && cancelAnimationFrame(this._rafId);
    const e = performance.now(), t = 250, i = () => {
      this._positionUnderlinesSync(), performance.now() - e < t ? this._rafId = requestAnimationFrame(i) : this._rafId = null;
    };
    this._rafId = requestAnimationFrame(i);
  }
  syncUnderlineElements(e) {
    for (const t of e) if (!this._underlines.has(t)) {
      const i = document.createElement("div");
      i.className = "dv-tab-group-underline", this._ctx.tabsList.appendChild(i), this._underlines.set(t, i);
    }
    for (const [t, i] of this._underlines) e.has(t) || (i.remove(), this._underlines.delete(t), this._clearContinuationMarkers(t));
  }
  getUnderline(e) {
    return this._underlines.get(e);
  }
  dispose() {
    this._rafId !== null && (cancelAnimationFrame(this._rafId), this._rafId = null);
    for (const [, e] of this._underlines) e.remove();
    this._underlines.clear(), this._clearContinuationMarkers();
  }
  /**
  * Grow/shrink a group's continuation-marker pool to `count` pips,
  * creating/removing DOM nodes as needed, and return the pool.
  */
  _syncContinuationMarkers(e, t) {
    let i = this._continuationMarkers.get(e);
    for (i || (i = [], this._continuationMarkers.set(e, i)); i.length < t; ) {
      const o = document.createElement("div");
      o.className = vn, this._ctx.tabsList.appendChild(o), i.push(o);
    }
    for (; i.length > t; ) {
      const o = i.pop();
      o?.remove();
    }
    return i;
  }
  /**
  * Remove continuation markers for a single group, or (when `groupId`
  * is omitted) for every group. Used when a group dissolves, stops
  * wrapping, or the indicator is disposed.
  */
  _clearContinuationMarkers(e) {
    if (e === void 0) {
      for (const [, i] of this._continuationMarkers) for (const o of i) o.remove();
      this._continuationMarkers.clear();
      return;
    }
    const t = this._continuationMarkers.get(e);
    if (t) {
      for (const i of t) i.remove();
      this._continuationMarkers.delete(e);
    }
  }
  _positionUnderlinesSync() {
    const e = this._ctx.tabsList.getBoundingClientRect(), t = this._ctx.getTabGroups(), i = this._ctx.getDirection() === "vertical", o = this._ctx.tabsList.classList.contains(Oo);
    o || this._clearContinuationMarkers();
    const r = i ? e.width : e.height, n = this._ctx.getActivePanelId(), s = this._ctx.getTabMap();
    for (const a of t) {
      const d = this._underlines.get(a.id);
      if (!d) continue;
      const c = a.panelIds;
      if (c.length === 0) {
        d.style.display = "none";
        continue;
      }
      if (d.style.display = "", o) {
        this._positionWrappedUnderline(d, a, e, s, i);
        continue;
      }
      const l = this._ctx.getChipElement(a.id);
      let h;
      if (l) {
        const C = l.getBoundingClientRect(), k = getComputedStyle(l), y = i ? Number.parseFloat(k.marginTop) || 0 : Number.parseFloat(k.marginLeft) || 0;
        h = i ? C.top - e.top - y : C.left - e.left - y;
      } else {
        const C = c[0], k = s.get(C);
        if (k) {
          const y = k.value.element.getBoundingClientRect();
          h = i ? y.top - e.top : y.left - e.left;
        } else h = 0;
      }
      const v = c[c.length - 1], p = s.get(v);
      if (!p) {
        i ? (d.style.top = `${h}px`, d.style.height = "0px", d.style.left = "", d.style.width = "") : (d.style.left = `${h}px`, d.style.width = "0px", d.style.top = "", d.style.height = "");
        continue;
      }
      const u = p.value.element.getBoundingClientRect();
      let g = i ? u.bottom - e.top : u.right - e.left, _ = g - h;
      if ((a.collapsed || a.panelIds.some((C) => {
        const k = s.get(C);
        return k?.value.element.classList.contains("dv-tab--group-expanding");
      })) && l) {
        const C = l.getBoundingClientRect(), k = i ? C.top + C.height / 2 - e.top : C.left + C.width / 2 - e.left;
        let y = 0, P = 0;
        for (const E of a.panelIds) {
          const w = s.get(E);
          if (!w) continue;
          const x = w.value.element;
          i ? (y += x.getBoundingClientRect().height, P += x.scrollHeight) : (y += x.getBoundingClientRect().width, P += x.scrollWidth);
        }
        const M = P > 0 ? Math.min(1, y / P) : 0;
        h = k + (h - k) * M, g = k + (g - k) * M, _ = Math.max(0, g - h);
      }
      i ? (d.style.top = `${h}px`, d.style.height = `${Math.max(0, _)}px`, d.style.left = "", d.style.width = "", d.style.bottom = "") : (d.style.left = `${h}px`, d.style.width = `${Math.max(0, _)}px`, d.style.top = "", d.style.height = "", d.style.bottom = ""), this.applyShape(d, a, h, _, r, n, e, i);
    }
  }
  /**
  * Position a group's underline across a multi-line (wrapped) tab strip. The
  * single-bar model can't span lines, so the element is sized to cover the
  * group's line span and an SVG draws one straight segment per line-run of
  * the group's tabs: a horizontal segment per row (horizontal header) or a
  * vertical segment per column (vertical header). Tabs are bucketed into
  * runs by their cross-axis offset: `top` for rows, `left` for columns.
  * (The active-tab wrap-around bump is omitted in wrap; the per-line lines
  * still convey membership.)
  */
  _positionWrappedUnderline(e, t, i, o, r) {
    const s = Xt(t.color, this._ctx.getColorPalette());
    if (s === void 0) {
      e.style.display = "none", this._clearContinuationMarkers(t.id);
      return;
    }
    const { runs: a, firstRun: d } = this._computeWrappedRuns(t, i, o, r);
    if (a.length === 0) {
      e.style.display = "none", this._clearContinuationMarkers(t.id);
      return;
    }
    this._positionContinuationMarkers(t.id, a, d, s, r);
    const c = Math.min(...a.map((y) => y.left)), l = Math.max(...a.map((y) => y.right)), h = Math.min(...a.map((y) => y.top)), v = Math.max(...a.map((y) => y.bottom)), p = r ? Math.max(0, l - c) : i.width, u = r ? i.height : Math.max(0, v - h);
    e.style.left = r ? `${c}px` : "0px", e.style.top = r ? "0px" : `${h}px`, e.style.bottom = "auto", e.style.width = `${p}px`, e.style.height = `${u}px`, e.style.backgroundColor = "";
    const { svg: g, path: _ } = this.ensureSvgPath(e);
    g.setAttribute("width", String(p)), g.setAttribute("height", String(u)), _.setAttribute("stroke", s), _.setAttribute("stroke-width", String(2));
    const C = this._ctx.getHeaderPosition(), k = r ? C === "right" : C === "bottom";
    _.setAttribute("d", this._wrappedPathData(a, r, k, c, h, 2));
  }
  /**
  * Bucket a group's visible tabs into line-runs by their cross-axis offset
  * (rows by `top`, columns by `left`), with a 2px sub-pixel tolerance.
  * `firstRun` is the run holding the group's first tab (the chip's line),
  * tracked by reference so it is correct regardless of axis or header side (a
  * `vertical-rl` first column is right-most, not left-most).
  */
  _computeWrappedRuns(e, t, i, o) {
    const r = [];
    let n;
    for (const a of e.panelIds) {
      var s;
      const d = i.get(a);
      if (!d) continue;
      const c = d.value.element.getBoundingClientRect();
      if (c.width === 0 && c.height === 0) continue;
      const l = c.top - t.top, h = c.bottom - t.top, v = c.left - t.left, p = c.right - t.left, u = o ? v : l;
      let g = r.find((_) => Math.abs((o ? _.left : _.top) - u) <= 2);
      g ? (g.top = Math.min(g.top, l), g.bottom = Math.max(g.bottom, h), g.left = Math.min(g.left, v), g.right = Math.max(g.right, p)) : (g = {
        top: l,
        bottom: h,
        left: v,
        right: p
      }, r.push(g)), (s = n) !== null && s !== void 0 || (n = g);
    }
    return {
      runs: r,
      firstRun: n
    };
  }
  /**
  * Build the SVG `path` data for a group's per-line underline segments: a
  * horizontal segment along each row's edge (`svg-y` offset by `minTop`) or a
  * vertical segment down each column's leading edge (`svg-x` offset by
  * `minLeft`). `inverted` moves the line to the header-facing edge.
  */
  _wrappedPathData(e, t, i, o, r, n) {
    let s = "";
    for (const a of e) if (t) {
      const d = i ? a.right - o - n / 2 : a.left - o + n / 2;
      s += `M ${d},${a.top} L ${d},${a.bottom} `;
    } else {
      const d = i ? a.top - r + n / 2 : a.bottom - r - n / 2;
      s += `M ${a.left},${d} L ${a.right},${d} `;
    }
    return s.trim();
  }
  /**
  * Draw a small accent pip at the leading edge of every wrapped line-run a
  * group spans beyond its first. The group's real chip already marks the
  * first run; these lightweight markers echo it on the continuation runs so
  * a group that wraps onto rows/columns 2–3 reads as one group on each line
  * instead of losing its colour after the first.
  *
  * `runs` are the group's line-runs (container-relative geometry) as
  * bucketed by {@link _positionWrappedUnderline}; `firstRun` is the run that
  * holds the chip and is skipped. The pip sits at each continuation run's
  * main-axis start (top of a column, left of a row), centred on the cross
  * axis.
  */
  _positionContinuationMarkers(e, t, i, o, r) {
    const n = t.filter((a) => a !== i), s = this._syncContinuationMarkers(e, n.length);
    n.forEach((a, d) => {
      const c = s[d];
      if (c.style.backgroundColor = o, r) {
        const l = (a.left + a.right) / 2;
        c.style.left = `${l - yi / 2}px`, c.style.top = `${a.top}px`;
      } else {
        const l = (a.top + a.bottom) / 2;
        c.style.left = `${a.left}px`, c.style.top = `${l - yi / 2}px`;
      }
    });
  }
  /**
  * Ensure the underline element holds a single reusable `<svg><path/></svg>`
  * (created once, reused across frames) and return them.
  */
  ensureSvgPath(e) {
    const t = e.firstElementChild;
    if (t?.tagName === "svg") return {
      svg: t,
      path: t.firstElementChild
    };
    e.replaceChildren();
    const i = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    i.style.display = "block";
    const o = document.createElementNS("http://www.w3.org/2000/svg", "path");
    return o.setAttribute("fill", "none"), i.appendChild(o), e.appendChild(i), {
      svg: i,
      path: o
    };
  }
}, pn = class extends Vo {
  _applyStraightLine(e, t, i, o, r, n, s) {
    const a = s ? r : o, d = s ? o : r;
    e.setAttribute("width", String(a)), e.setAttribute("height", String(d)), i.style.width = `${a}px`, i.style.height = `${d}px`, t.setAttribute("d", s ? `M ${n},0 L ${n},${o}` : `M 0,${n} L ${o},${n}`);
  }
  /**
  * Chrome-style wrap-around underline: a stroked SVG path that runs
  * along the bottom (or left edge in vertical mode), curving up and
  * over the active tab with rounded corners.
  *
  * The SVG and path elements are created once per underline and reused;
  * only the `d`, `stroke`, and viewport attributes are updated each frame.
  */
  applyShape(e, t, i, o, r, n, s, a) {
    const c = r, l = o, h = Xt(t.color, this._ctx.getColorPalette());
    if (l <= 0 || c <= 0 || h === void 0) {
      e.style.display = "none";
      return;
    }
    e.style.display = "";
    let v;
    n && t.panelIds.includes(n) && (v = this._ctx.getTabMap().get(n));
    const { svg: p, path: u } = this.ensureSvgPath(e);
    u.setAttribute("stroke", h), u.setAttribute("stroke-width", String(2));
    const g = 2, _ = this._ctx.getHeaderPosition(), C = !a && _ === "bottom", k = a && _ === "right";
    let y, P;
    if (a ? (y = k ? c - g : g, P = k ? g : c - g) : (y = C ? g : c - g, P = C ? c - g : g), !v) {
      this._applyStraightLine(p, u, e, l, c, y, a);
      return;
    }
    const M = v.value.element.getBoundingClientRect();
    let E, w;
    if (a ? (E = Math.max(0, M.top - s.top - i), w = Math.min(l, M.bottom - s.top - i)) : (E = Math.max(0, M.left - s.left - i), w = Math.min(l, M.right - s.left - i)), w <= E) {
      this._applyStraightLine(p, u, e, l, c, y, a);
      return;
    }
    const x = 6, f = P > y ? 1 : -1;
    if (a) {
      const b = c, m = l;
      p.setAttribute("width", String(b)), p.setAttribute("height", String(m)), e.style.width = `${b}px`, e.style.height = `${m}px`;
      const S = [
        `M ${y},0`,
        `L ${y},${E - x}`,
        `Q ${y},${E} ${y + f * x},${E}`,
        `L ${P - f * x},${E}`,
        `Q ${P},${E} ${P},${E + x}`,
        `L ${P},${w - x}`,
        `Q ${P},${w} ${P - f * x},${w}`,
        `L ${y + f * x},${w}`,
        `Q ${y},${w} ${y},${w + x}`,
        `L ${y},${m}`
      ].join(" ");
      u.setAttribute("d", S);
    } else {
      const b = l, m = c;
      p.setAttribute("width", String(b)), p.setAttribute("height", String(m)), e.style.width = `${b}px`, e.style.height = `${m}px`;
      const S = [
        `M 0,${y}`,
        `L ${E - x},${y}`,
        `Q ${E},${y} ${E},${y + f * x}`,
        `L ${E},${P - f * x}`,
        `Q ${E},${P} ${E + x},${P}`,
        `L ${w - x},${P}`,
        `Q ${w},${P} ${w},${P - f * x}`,
        `L ${w},${y + f * x}`,
        `Q ${w},${y} ${w + x},${y}`,
        `L ${b},${y}`
      ].join(" ");
      u.setAttribute("d", S);
    }
  }
}, un = class extends Vo {
  applyShape(e, t, i, o, r, n, s, a) {
    const c = Xt(t.color, this._ctx.getColorPalette());
    if (o <= 0 || c === void 0) {
      e.style.display = "none";
      return;
    }
    e.style.display = "", e.firstElementChild && e.replaceChildren(), e.style.backgroundColor = c, a ? (e.style.width = "2px", e.style.height = `${o}px`) : (e.style.width = `${o}px`, e.style.height = "2px");
  }
};
const gn = /* @__PURE__ */ new Map();
var bn = class {
  get chipRenderers() {
    return this._chipRenderers;
  }
  get groupUnderlines() {
    var e, t;
    return (e = (t = this._indicator) === null || t === void 0 ? void 0 : t.underlines) !== null && e !== void 0 ? e : gn;
  }
  get skipNextCollapseAnimation() {
    return this._skipNextCollapseAnimation;
  }
  set skipNextCollapseAnimation(e) {
    this._skipNextCollapseAnimation = e;
  }
  constructor(e, t) {
    this._ctx = e, this._callbacks = t, this._chipRenderers = /* @__PURE__ */ new Map(), this._indicator = null, this._skipNextCollapseAnimation = !1, this._pendingTransitionCleanups = /* @__PURE__ */ new Map();
  }
  /**
  * Synchronize chip elements and CSS classes for all tab groups
  * in the parent group model. Call after any tab group mutation.
  */
  update() {
    const e = this._ctx.group.model.getTabGroups(), t = /* @__PURE__ */ new Set();
    for (const o of e)
      t.add(o.id), this._ensureChipForGroup(o), this._positionChipForGroup(o);
    for (const [o, r] of this._chipRenderers) if (!t.has(o)) {
      var i;
      r.chip.element.remove(), r.chip.dispose(), (i = r.dragSourcesDisposable) === null || i === void 0 || i.dispose(), r.disposable.dispose(), this._chipRenderers.delete(o);
    }
    this._updateTabGroupClasses();
  }
  /**
  * Re-read the active palette and re-apply colors to chips, tabs and
  * the indicator. Called when `tabGroupColors` / `tabGroupAccent`
  * options change at runtime.
  */
  refreshAccents() {
    for (const i of this._ctx.group.model.getTabGroups()) {
      var e, t;
      const o = this._chipRenderers.get(i.id);
      o == null || (t = (e = o.chip).update) === null || t === void 0 || t.call(e, { tabGroup: i });
    }
    this._updateTabGroupClasses();
  }
  positionAllChips() {
    if (this._chipRenderers.size !== 0)
      for (const e of this._ctx.group.model.getTabGroups()) this._positionChipForGroup(e);
  }
  updateDirection() {
    const e = this._ctx.getDirection() === "vertical";
    for (const [, t] of this._chipRenderers) {
      const i = e ? ["top"] : ["left"];
      t.dropTarget.setTargetZones(i), t.pointerDropTarget.setTargetZones(i);
    }
  }
  /**
  * Drop any overlay the chips are showing. A group move is committed by a
  * capturing listener on the tabs list that stops the event, so the chip
  * target under the cursor never sees the drop that would clear its own.
  */
  clearChipDropOverlays() {
    for (const [, i] of this._chipRenderers) {
      var e, t;
      (e = i.dropTarget) === null || e === void 0 || e.clearOverlay(), (t = i.pointerDropTarget) === null || t === void 0 || t.clearOverlay();
    }
  }
  /** Each chip's extent along the strip's main axis: width for a horizontal
  *  header, height for a vertical one. */
  snapshotChipSizes() {
    const e = this._ctx.getDirection() === "vertical", t = /* @__PURE__ */ new Map();
    for (const [i, o] of this._chipRenderers) {
      const r = o.chip.element.getBoundingClientRect();
      t.set(i, e ? r.height : r.width);
    }
    return t;
  }
  positionUnderlines() {
    var e;
    (e = this._indicator) === null || e === void 0 || e.positionUnderlines();
  }
  trackUnderlines() {
    var e;
    (e = this._indicator) === null || e === void 0 || e.trackUnderlines();
  }
  setGroupDragImage(e, t, i) {
    if (!e.dataTransfer) return;
    const o = this._ctx.getDirection() === "vertical", r = this._ctx.tabsList.cloneNode(!0);
    o ? (r.classList.remove("dv-tabs-container-vertical", "dv-vertical"), r.classList.add("dv-horizontal"), r.style.writingMode = "horizontal-tb", r.style.height = `${this._ctx.tabsList.offsetWidth}px`) : r.style.height = `${this._ctx.tabsList.offsetHeight}px`, r.style.width = "auto", r.style.overflow = "visible", r.style.pointerEvents = "none";
    const n = Array.from(r.children), s = Array.from(this._ctx.tabsList.children);
    for (let p = n.length - 1; p >= 0; p--)
      s[p] !== i && n[p].remove();
    const a = document.createElement("div");
    a.className = "dv-groupview dv-active-group", a.style.position = "fixed", a.style.top = "-10000px", a.style.left = "0px", a.style.height = "auto", a.style.width = "auto", a.style.pointerEvents = "none";
    const d = document.createElement("div");
    d.className = "dv-tabs-and-actions-container", d.style.height = "auto", d.style.width = "auto", a.appendChild(d), d.appendChild(r), this._ctx.accessor.element.appendChild(a);
    const c = r.querySelector(".dv-tab-group-chip"), l = i.getBoundingClientRect(), h = e.clientX - l.left, v = e.clientY - l.top;
    if (c) {
      const p = c.getBoundingClientRect(), u = a.getBoundingClientRect(), g = p.left - u.left + h, _ = p.top - u.top + v;
      e.dataTransfer.setDragImage(a, g, _);
    } else e.dataTransfer.setDragImage(a, h, v);
    requestAnimationFrame(() => {
      a.remove();
    });
  }
  cleanupTransition(e) {
    var t;
    (t = this._pendingTransitionCleanups.get(e)) === null || t === void 0 || t(), this._pendingTransitionCleanups.delete(e);
  }
  updateDragAndDropState() {
    const e = te(this._ctx.accessor.options);
    for (const r of this._chipRenderers.values()) {
      var t, i, o;
      r.chip.element.draggable = e.html5, (t = r.html5DragSource) === null || t === void 0 || t.setDisabled(!e.html5), (i = r.pointerDragSource) === null || i === void 0 || i.setDisabled(!e.pointer), (o = r.pointerDragSource) === null || o === void 0 || o.setTouchOnly(!e.pointerHandlesMouse);
    }
  }
  /**
  * Synchronously dispose the chip drag sources for an in-flight chip
  * drag. Called from `_commitGroupMove` so the transfer payload +
  * iframe shield are released before the cross-group move detaches
  * the chip (chip dispose is scheduled on a microtask via
  * `_scheduleTabGroupUpdate`, which is too late for callers that read
  * `getPanelData()` synchronously after the move).
  *
  * A cross-group move dissolves the source chip entirely, but a
  * within-group reorder keeps the same chip element — so the sources are
  * cleared to `undefined` here and the subsequent `update()` re-arms them
  * via `_ensureChipForGroup`. Without that re-arm the chip would fire a
  * native `dragstart` (the element keeps `draggable=true`) but never set
  * a transfer payload, leaving the group permanently undraggable after
  * its first move. (#1410)
  */
  disposeChipDrag(e) {
    var t;
    const i = this._chipRenderers.get(e);
    i && ((t = i.dragSourcesDisposable) === null || t === void 0 || t.dispose(), i.html5DragSource = void 0, i.pointerDragSource = void 0, i.dragSourcesDisposable = void 0);
  }
  /** Cloned chip rect used as the pointer follow-finger ghost. */
  _buildChipGhostElement(e) {
    const t = getComputedStyle(e), i = e.cloneNode(!0);
    return Array.from(t).forEach((o) => {
      i.style.setProperty(o, t.getPropertyValue(o), t.getPropertyPriority(o));
    }), i.style.position = "absolute", i;
  }
  disposeAll() {
    var e;
    (e = this._indicator) === null || e === void 0 || e.dispose(), this._indicator = null;
    for (const [, i] of this._pendingTransitionCleanups) i();
    this._pendingTransitionCleanups.clear();
    for (const [, i] of this._chipRenderers) {
      var t;
      i.chip.element.remove(), i.chip.dispose(), (t = i.dragSourcesDisposable) === null || t === void 0 || t.dispose(), i.disposable.dispose();
    }
    this._chipRenderers.clear();
  }
  _ensureIndicator() {
    var e, t, i;
    const o = ((e = (t = this._ctx.accessor.options.theme) === null || t === void 0 ? void 0 : t.tabGroupIndicator) !== null && e !== void 0 ? e : "wrap") === "none" ? un : pn;
    this._indicator && !(this._indicator instanceof o) && (this._indicator.dispose(), this._indicator = null), (i = this._indicator) !== null && i !== void 0 || (this._indicator = new o({
      tabsList: this._ctx.tabsList,
      getTabGroups: () => this._ctx.group.model.getTabGroups(),
      getActivePanelId: () => {
        var r;
        return (r = this._ctx.group.activePanel) === null || r === void 0 ? void 0 : r.id;
      },
      getTabMap: () => this._ctx.getTabMap(),
      getChipElement: (r) => {
        var n;
        return (n = this._chipRenderers.get(r)) === null || n === void 0 ? void 0 : n.chip.element;
      },
      getDirection: () => this._ctx.getDirection(),
      getHeaderPosition: () => this._ctx.group.model.headerPosition,
      getColorPalette: () => this._ctx.accessor.tabGroupColorPalette
    }));
  }
  /**
  * Create the HTML5 + pointer drag sources for a chip (and the direct
  * dragend listener that clears the transfer synchronously). Extracted so
  * both the initial chip build and the post-move re-arm in
  * `_ensureChipForGroup` share one wiring path. (#1410)
  */
  _createChipDragSources(e, t) {
    const i = te(this._ctx.accessor.options);
    e.element.draggable = i.html5;
    const o = Te.getInstance(), r = () => (o.setData([new ee(this._ctx.accessor.id, this._ctx.group.id, null, t.id)], ee.prototype), { dispose: () => {
      o.clearData(ee.prototype);
    } }), n = ye.createDragSource(e.element, {
      getData: r,
      disabled: !i.html5,
      isCancelled: () => !te(this._ctx.accessor.options).html5,
      onDragStart: (d) => {
        "dataTransfer" in d && d.dataTransfer && this.setGroupDragImage(d, t, e.element), this._callbacks.onChipDragStart(t, e, d);
      },
      onDragEnd: (d) => {
        var c, l;
        (c = (l = this._callbacks).onChipDragEnd) === null || c === void 0 || c.call(l, t, e, d);
      }
    }), s = () => {
      o.clearData(ee.prototype);
    };
    e.element.addEventListener("dragend", s, { once: !0 });
    const a = he.createDragSource(e.element, {
      getData: r,
      disabled: !i.pointer,
      touchOnly: !i.pointerHandlesMouse,
      isCancelled: () => !te(this._ctx.accessor.options).pointer,
      createGhost: () => ({
        element: this._buildChipGhostElement(e.element),
        offsetX: 8,
        offsetY: 8
      }),
      onDragStart: (d) => {
        this._callbacks.onChipDragStart(t, e, d);
      }
    });
    return {
      html5DragSource: n,
      pointerDragSource: a,
      disposable: { dispose: () => {
        n.dispose(), a.dispose(), e.element.removeEventListener("dragend", s);
      } }
    };
  }
  _ensureChipForGroup(e) {
    const t = this._chipRenderers.get(e.id);
    if (t) {
      if (!t.html5DragSource) {
        const v = this._createChipDragSources(t.chip, e);
        t.html5DragSource = v.html5DragSource, t.pointerDragSource = v.pointerDragSource, t.dragSourcesDisposable = v.disposable;
      }
      return;
    }
    const i = this._ctx.accessor.options.createTabGroupChipComponent, o = i ? i(e) : new xi(this._ctx.accessor.tabGroupColorPalette);
    o.init({
      tabGroup: e,
      api: this._ctx.accessor.api
    });
    const r = this._createChipDragSources(o, e), n = [
      e.onDidChange(() => {
        var v;
        (v = o.update) === null || v === void 0 || v.call(o, { tabGroup: e }), this._updateTabGroupClasses();
      }),
      e.onDidPanelChange(() => {
        this._positionChipForGroup(e), this._updateTabGroupClasses();
      }),
      e.onDidCollapseChange(() => {
        this._updateTabGroupClasses();
      })
    ], s = (v) => {
      var p;
      (p = this._chipRenderers.get(e.id)) === null || p === void 0 || (p = p.pointerDragSource) === null || p === void 0 || p.cancelPending(), this._callbacks.onChipContextMenu(e, v);
    };
    o instanceof xi ? n.push(o.onContextMenu(s)) : n.push(new Yt(o.element, { onLongPress: s }), T(o.element, "contextmenu", s));
    const a = {
      acceptedTargetZones: this._ctx.getDirection() === "vertical" ? ["top"] : ["left"],
      overlayModel: { activationSize: {
        value: 100,
        type: "percentage"
      } },
      canDisplayOverlay: (v, p) => {
        if (this._ctx.group.locked || this._ctx.accessor.options.disableDnd) return !1;
        const u = W();
        if (this._ctx.accessor.id === u?.viewId) {
          var g;
          return !(((g = this._ctx.accessor.options.theme) === null || g === void 0 ? void 0 : g.tabAnimation) === "smooth" && !u.tabGroupId);
        }
        return this._ctx.group.model.canDisplayOverlay(v, p, "tab");
      }
    }, d = ye.createDropTarget(o.element, a), c = he.createDropTarget(o.element, a), l = (v) => {
      this._callbacks.onChipDrop(e, v);
    };
    n.push(d, d.onDrop(l), c, c.onDrop(l));
    const h = new I(...n);
    this._chipRenderers.set(e.id, {
      chip: o,
      html5DragSource: r.html5DragSource,
      pointerDragSource: r.pointerDragSource,
      dragSourcesDisposable: r.disposable,
      disposable: h,
      dropTarget: d,
      pointerDropTarget: c
    }), e.collapsed && (this._skipNextCollapseAnimation = !0);
  }
  _positionChipForGroup(e) {
    const t = this._chipRenderers.get(e.id);
    if (!t) return;
    const i = t.chip.element, o = e.panelIds;
    if (o.length === 0) {
      i.remove();
      return;
    }
    const r = o[0], n = this._ctx.getTabMap().get(r);
    if (!n) {
      i.remove();
      return;
    }
    const s = n.value.element;
    i.nextSibling !== s && this._ctx.tabsList.insertBefore(i, s);
  }
  _updateTabGroupClasses() {
    const e = this._ctx.group.model.getTabGroups(), t = this._ctx.getTabs(), i = this._ctx.getTabMap();
    let o = !1;
    const r = /* @__PURE__ */ new Map();
    for (const a of e) for (const d of a.panelIds) r.set(d, a);
    for (const a of t) {
      const d = a.value, c = d.panel.id, l = r.get(c), h = !!l;
      if (z(d.element, "dv-tab--grouped", h), l) {
        const v = l.panelIds, p = v[0] === c, u = v[v.length - 1] === c;
        z(d.element, "dv-tab--group-first", p), z(d.element, "dv-tab--group-last", u), Zt(d.element, l.color, this._ctx.accessor.tabGroupColorPalette);
        const g = d.element.classList.contains("dv-tab--group-collapsed");
        if (!l.collapsed && g) {
          var n;
          o = !0, d.element.classList.remove("dv-tab--group-collapsed"), d.element.classList.add("dv-tab--group-expanding"), (n = this._pendingTransitionCleanups.get(c)) === null || n === void 0 || n();
          const _ = () => {
            d.element.classList.remove("dv-tab--group-expanding"), d.element.style.removeProperty("width"), d.element.removeEventListener("transitionend", _), clearTimeout(C), this._pendingTransitionCleanups.delete(c);
          }, C = setTimeout(_, 300);
          this._pendingTransitionCleanups.set(c, _), d.element.addEventListener("transitionend", _);
        }
      } else
        z(d.element, "dv-tab--group-first", !1), z(d.element, "dv-tab--group-last", !1), d.element.classList.remove("dv-tab--group-collapsed", "dv-tab--group-expanding"), d.element.style.removeProperty("width"), d.element.style.removeProperty("--dv-tab-group-color");
    }
    const s = /* @__PURE__ */ new Set();
    for (const a of e)
      if (s.add(a.id), a.collapsed && a.panelIds.some((d) => {
        const c = i.get(d);
        return c && !c.value.element.classList.contains("dv-tab--group-collapsed");
      })) if (this._skipNextCollapseAnimation) {
        const d = [];
        for (const c of a.panelIds) {
          const l = i.get(c);
          l && (l.value.element.style.transition = "none", l.value.element.classList.add("dv-tab--group-collapsed"), d.push(l.value.element));
        }
        if (d.length > 0) {
          d[0].offsetHeight;
          for (const c of d) c.style.removeProperty("transition");
        }
      } else {
        o = !0;
        const d = this._ctx.getDirection() === "vertical";
        for (const c of a.panelIds) {
          const l = i.get(c);
          if (l && !l.value.element.classList.contains("dv-tab--group-collapsed")) {
            const h = l.value.element.getBoundingClientRect();
            d ? l.value.element.style.height = `${h.height}px` : l.value.element.style.width = `${h.width}px`, l.value.element.offsetHeight, l.value.element.classList.add("dv-tab--group-collapsed");
          }
        }
      }
    this._skipNextCollapseAnimation = !1, this._ensureIndicator(), this._indicator && (this._indicator.syncUnderlineElements(s), o ? this._indicator.trackUnderlines() : this._indicator.positionUnderlines());
  }
};
function Re(e, t) {
  return t === "vertical" ? e.height : e.width;
}
function ot(e, t) {
  return t === "vertical" ? e.top : e.left;
}
function No(e, t) {
  return t === "vertical" ? e.clientY : e.clientX;
}
var mn = class extends I {
  get _tabs() {
    return this.host.tabItems;
  }
  get _tabMap() {
    return this.host.tabMap;
  }
  get _tabsList() {
    return this.host.tabsList;
  }
  get _direction() {
    return this.host.direction;
  }
  get group() {
    return this.host.groupPanel;
  }
  get accessor() {
    return this.host.component;
  }
  get _tabGroupManager() {
    return this.host.tabGroupManager;
  }
  /** Whether the tab strip is in multi-row wrap layout
  *  (`MultiRowTabsModule`, `overflow.mode: 'wrap'`). In wrap, the 1-D
  *  gap/FLIP animation is suppressed and reorder uses a 2-D hit-test. */
  get _wrapMode() {
    return this._tabsList.classList.contains(Oo);
  }
  get animState() {
    return this._animState;
  }
  set animState(e) {
    this._animState = e;
  }
  get pendingCollapse() {
    return this._pendingCollapse;
  }
  set pendingCollapse(e) {
    this._pendingCollapse = e;
  }
  set voidContainerElement(e) {
    this._voidContainer = e;
  }
  constructor(e) {
    super(), this.host = e, this._animState = null, this._pendingMarginCleanups = /* @__PURE__ */ new Map(), this._pendingCollapse = !1, this._flipTransitionCleanup = null, this._voidContainer = null, this._extendedDropZone = null, this._pointerInsideTabsList = !1, this._wrapIndicatorEl = null, this.addDisposables({ dispose: () => {
      var t;
      (t = this._flipTransitionCleanup) === null || t === void 0 || t.call(this);
    } });
  }
  setExtendedDropZone(e) {
    this._extendedDropZone = e;
  }
  /**
  * Allows external elements (e.g. void container, left actions) to push an
  * insertion index into the animation while the cursor is outside the tabs
  * list itself.  Pass `null` to clear the indicator.
  */
  setExternalInsertionIndex(e) {
    this._animState && e !== this._animState.currentInsertionIndex && (this._animState.currentInsertionIndex = e, this.applyDragOverTransforms());
  }
  /**
  * Called when the drag cursor leaves the entire header area (not just the
  * tabs list).  Clears animation state for cross-group drags, which never
  * receive a `dragend` event on this tab list.
  */
  clearExternalAnimState() {
    this._animState && (this.resetTabTransforms(), this._animState.sourceIndex === -1 ? this._animState = null : this._animState.currentInsertionIndex = null);
  }
  snapshotTabPositions() {
    const e = /* @__PURE__ */ new Map();
    for (const t of this._tabs) e.set(t.value.panel.id, t.value.element.getBoundingClientRect());
    return e;
  }
  /** Main-axis extent of a rect for this header's orientation. */
  _mainAxisSize(e) {
    return Re(e, this._direction);
  }
  /** Main-axis leading edge of a rect for this header's orientation. */
  _mainAxisStart(e) {
    return ot(e, this._direction);
  }
  /** The cursor coordinate along the main axis. */
  _mainAxisCoord(e, t) {
    return No({
      clientX: e,
      clientY: t
    }, this._direction);
  }
  /** The margin that opens the insertion gap. It must run along the main
  *  axis, so a vertical header pushes tabs down rather than sideways. */
  get _gapMarginProperty() {
    return this._direction === "vertical" ? "margin-top" : "margin-left";
  }
  getAverageTabSize() {
    if (this._tabs.length === 0) return 0;
    let e = 0;
    for (const t of this._tabs) e += this._mainAxisSize(t.value.element.getBoundingClientRect());
    return e / this._tabs.length;
  }
  /**
  * Pointer-event entry point. The HTML5 path enters via the per-element
  * `dragover` listener; this one hit-tests the global pointer-drag
  * position against the tabs list and routes through the same shared
  * `processDragOver` / `processDragLeave` helpers.
  */
  handlePointerDragMove(e, t) {
    const i = zt(this._tabsList).elementFromPoint(e, t);
    if (!(i && (this._tabsList.contains(i) || this._extendedDropZone && this._extendedDropZone.contains(i)))) {
      this._pointerInsideTabsList && (this._pointerInsideTabsList = !1, this.processDragLeave(i));
      return;
    }
    this._pointerInsideTabsList = !0, this.processDragOver(e, t);
  }
  /**
  * Pointer-side cleanup hook: when any pointer drag ends, reset the
  * inside-strip flag and tear down any smooth-reorder anim state the
  * dragover bridge may have installed.
  */
  handlePointerDragEnd(e) {
    if (e && this._animState && this._animState.sourceIndex !== -1 && this._animState.currentInsertionIndex !== null && this.isPointInsideTabsList(e.clientX, e.clientY)) {
      const t = this._animState.sourceTabGroupId;
      if (t) {
        const i = this._animState.currentInsertionIndex;
        this._animState = null, this.commitGroupMove(t, i);
      } else this.commitPointerReorder(e.pointerEvent);
    }
    this._pointerInsideTabsList = !1, this.resetDragAnimation();
  }
  isPointInsideTabsList(e, t) {
    const i = zt(this._tabsList).elementFromPoint(e, t);
    return !!i && this._tabsList.contains(i);
  }
  /** Commit a smooth-mode intra-group reorder from the current insertion
  *  index (adjusted for the source's own position), then clear drag state.
  *  Used by the pointer backend for both single-row and wrap layouts. */
  commitPointerReorder(e) {
    const t = this._animState;
    if (t?.currentInsertionIndex == null) return;
    const i = t.currentInsertionIndex, o = t.sourceIndex, r = i - (o !== -1 && o < i ? 1 : 0);
    this._animState = null, this.clearWrapDropIndicator(), this.uncollapseSourceTab(t.sourceTabId), r !== o && this.host.fireDrop({
      event: e,
      index: r,
      targetTabGroupId: null
    });
  }
  /**
  * Shared body of the dragover entry point. Refreshes stale anim state
  * for a changed drag identity, initializes anim state for incoming
  * cross-group drags, and dispatches to the gap-following math in
  * `handleDragOver`. Returns true when this tabs list has taken
  * ownership of the drag; HTML5 callers use this to gate
  * `event.preventDefault()`.
  */
  processDragOver(e, t) {
    if (this.accessor.options.disableDnd || (this._dropStaleAnimState(), !this._animState && !this._initAnimStateForExternalDrag())) return !1;
    if (this._animState.sourceIndex !== -1) {
      var i;
      (i = this.group.model.dropTargetContainer) === null || i === void 0 || (i = i.model) === null || i === void 0 || i.clear();
    }
    return this.handleDragOver({
      clientX: e,
      clientY: t
    }), !0;
  }
  /**
  * If a previous drag's anim state lingers but the current drag is a
  * different cross-group chip identity, drop the stale state so the new drag
  * starts clean.
  */
  _dropStaleAnimState() {
    if (!this._animState) return;
    const e = W();
    e?.tabGroupId && e.groupId !== this.group.id && this._animState.sourceTabGroupId !== e.tabGroupId && (this._animState = null);
  }
  /**
  * Create the anim state for an external (cross-group) tab or chip drag.
  * Returns `true` when state was created, `false` when this drag should not
  * be handled at the tabs-list level.
  */
  _initAnimStateForExternalDrag() {
    var e;
    const t = W();
    if (((e = this.accessor.options.theme) === null || e === void 0 ? void 0 : e.tabAnimation) === "default" && !t?.tabGroupId || !t || !(t.panelId || t.tabGroupId) || t.groupId === this.group.id) return !1;
    const i = this.getAverageTabSize();
    return this._animState = t.tabGroupId ? this._makeGroupDragAnimState(t, i) : this._makeTabDragAnimState(t, i), !0;
  }
  /** Anim state for an external group-chip drag (gap sized to the group). */
  _makeGroupDragAnimState(e, t) {
    var i;
    const o = this.accessor.getPanel(e.groupId), r = o?.model.getTabGroups().find((s) => s.id === e.tabGroupId), n = t * ((i = r?.panelIds.length) !== null && i !== void 0 ? i : 1) + t;
    return {
      sourceTabId: "",
      sourceIndex: -1,
      tabPositions: this.snapshotTabPositions(),
      chipSizes: this._tabGroupManager.snapshotChipSizes(),
      currentInsertionIndex: null,
      targetTabGroupId: null,
      sourceTabGroupId: e.tabGroupId,
      sourceGroupPanelIds: r ? new Set(r.panelIds) : /* @__PURE__ */ new Set(),
      sourceChipSize: t,
      cursorOffsetFromDragStart: n / 2,
      sourceGapSize: n,
      containerStart: this._mainAxisStart(this._tabsList.getBoundingClientRect())
    };
  }
  /** Anim state for an external single-tab drag. */
  _makeTabDragAnimState(e, t) {
    return {
      sourceTabId: e.panelId,
      sourceIndex: -1,
      tabPositions: this.snapshotTabPositions(),
      chipSizes: this._tabGroupManager.snapshotChipSizes(),
      currentInsertionIndex: null,
      targetTabGroupId: null,
      sourceTabGroupId: null,
      sourceGroupPanelIds: null,
      sourceChipSize: 0,
      cursorOffsetFromDragStart: t / 2,
      sourceGapSize: t,
      containerStart: this._mainAxisStart(this._tabsList.getBoundingClientRect())
    };
  }
  /**
  * Shared body of the dragleave entry point. Preserves anim state when
  * the drag moves between tabs-list children, into the extended drop
  * zone, or into the void container; tears it down otherwise.
  */
  processDragLeave(e) {
    var t;
    if (this._animState && !(e && this._tabsList.contains(e))) {
      if (e && (!((t = this._extendedDropZone) === null || t === void 0) && t.contains(e))) {
        this.resetTabTransforms(), this._animState.currentInsertionIndex = null;
        return;
      }
      this._voidContainer && e && (e === this._voidContainer || this._voidContainer.contains(e)) || (this.resetTabTransforms(), this._animState.sourceIndex === -1 ? (this.clearHeaderAnchorOverlay(), this._animState = null) : this._animState.currentInsertionIndex = null);
    }
  }
  /**
  * Clear the anchored overlay only when this header is what rendered it.
  * The container is shared with the group's content drop target, which
  * renders into it on the same frame the cursor leaves the strip: the
  * pointer backend calls `handleDragOver` on the new target before the
  * global `onDragMove` that reaches us (#1612).
  */
  clearHeaderAnchorOverlay() {
    var e;
    const t = this.group.model.dropTargetContainer, i = t?.renderedOutline;
    i && ![
      this._tabsList,
      this._voidContainer,
      this._extendedDropZone
    ].some((o) => o?.contains(i)) || t == null || (e = t.model) === null || e === void 0 || e.clear();
  }
  handleDragOver(e) {
    var t, i;
    if (!this._animState) return;
    if (this._wrapMode && !this._animState.sourceTabGroupId) {
      var o;
      this.handleWrappedDragOver(e.clientX, (o = e.clientY) !== null && o !== void 0 ? o : 0);
      return;
    }
    const r = this._mainAxisCoord(e.clientX, (t = e.clientY) !== null && t !== void 0 ? t : 0), n = this._buildFirstPanelToGroupMap();
    let s = this._computeDragOverInsertionIndex(r, n), a = null;
    if (s !== null && this._tabGroupManager.chipRenderers.size > 0) {
      const d = this._resolveInsertionAgainstTabGroups(r, s, n);
      s = d.insertionIndex, a = d.targetTabGroupId;
    }
    s === this._animState.currentInsertionIndex && a === this._animState.targetTabGroupId || (this._animState.currentInsertionIndex = s, this._animState.targetTabGroupId = a, ((i = this.accessor.options.theme) === null || i === void 0 ? void 0 : i.tabAnimation) === "smooth" && this.applyDragOverTransforms());
  }
  /**
  * Build a lookup from the first panel ID of each non-source group → group
  * ID, so the accumulation walk can add chip widths when it reaches a
  * group's first tab.
  */
  _buildFirstPanelToGroupMap() {
    const e = /* @__PURE__ */ new Map();
    if (this._tabGroupManager.chipRenderers.size === 0) return e;
    for (const t of this.group.model.getTabGroups())
      t.id !== this._animState.sourceTabGroupId && t.panelIds.length > 0 && e.set(t.panelIds[0], t.id);
    return e;
  }
  /**
  * Walk the tabs in flow order by their original main-axis sizes and return
  * the insertion slot for the drag image's leading edge (null if no slot
  * fits).
  */
  _computeDragOverInsertionIndex(e, t) {
    const i = this._animState, o = i.sourceGroupPanelIds, r = e - i.cursorOffsetFromDragStart - i.containerStart;
    let n = 0, s = null;
    for (let l = 0; l < this._tabs.length; l++) {
      const h = this._tabs[l].value;
      if (h.panel.id === i.sourceTabId || o?.has(h.panel.id)) continue;
      const v = t.get(h.panel.id);
      if (v) {
        var a;
        const g = (a = i.chipSizes.get(v)) !== null && a !== void 0 ? a : 0;
        if (n + g > r) {
          var d;
          (d = s) !== null && d !== void 0 || (s = l);
          break;
        }
        n += g;
      }
      const p = i.tabPositions.get(h.panel.id), u = this._mainAxisSize(p ?? h.element.getBoundingClientRect());
      if (n + u / 2 <= r)
        n += u, s = l + 1;
      else {
        var c;
        (c = s) !== null && c !== void 0 || (s = l);
        break;
      }
    }
    return s;
  }
  /**
  * Rebuild the accumulated original main-axis size up to `insertionIndex`,
  * walking the tabs exactly the way the accumulation loop does, so callers
  * know the original trailing edge of the chip (if any) that precedes the
  * insertion slot.
  */
  _accumulatedSizeUpTo(e, t) {
    const i = this._animState, o = i.sourceGroupPanelIds;
    let r = 0;
    for (let s = 0; s < this._tabs.length; s++) {
      const a = this._tabs[s].value;
      if (a.panel.id === i.sourceTabId || o?.has(a.panel.id)) continue;
      if (s >= e) break;
      const d = t.get(a.panel.id);
      if (d) {
        var n;
        r += (n = i.chipSizes.get(d)) !== null && n !== void 0 ? n : 0;
      }
      const c = i.tabPositions.get(a.panel.id);
      r += this._mainAxisSize(c ?? a.element.getBoundingClientRect());
    }
    return r;
  }
  /**
  * Given a raw insertion index, snap it out of / into any tab group it falls
  * within and resolve the target group (if the drop should merge into one).
  */
  _resolveInsertionAgainstTabGroups(e, t, i) {
    const o = !!this._animState.sourceTabGroupId, r = this._accumulatedSizeUpTo(t, i);
    for (const n of this.group.model.getTabGroups()) {
      const s = this._evaluateTabGroupForInsertion(n, e, t, r, o);
      if (s) return s;
    }
    return {
      insertionIndex: t,
      targetTabGroupId: null
    };
  }
  /**
  * Evaluate a single tab group against the proposed insertion index.
  * Returns the resolved `{ insertionIndex, targetTabGroupId }` when this
  * group governs the slot (the caller stops iterating), or `null` when the
  * group is irrelevant and the caller should keep looking.
  */
  _evaluateTabGroupForInsertion(e, t, i, o, r) {
    const n = this._resolveGroupRange(e);
    if (!n) return null;
    const { firstIdx: s, lastIdx: a } = n, d = i >= s && i <= a, c = !d && i === s - 1;
    return !d && !c ? null : r ? this._resolveGroupDragTarget(i, s, a, d) : this._resolveTabDragTarget(e, t, i, o, s, c);
  }
  /**
  * The index range this group occupies in the live tab list, excluding the
  * source tab / source group tabs (so dragging a tab out of its own group
  * doesn't inflate the range). Null when the group has no effective tabs or
  * its bounds can't be located.
  */
  _resolveGroupRange(e) {
    const t = this._animState, i = t.sourceGroupPanelIds, o = e.panelIds.filter((s) => s !== t.sourceTabId && !i?.has(s));
    if (o.length === 0) return null;
    const r = this._tabs.findIndex((s) => s.value.panel.id === o[0]), n = this._tabs.findIndex((s) => s.value.panel.id === o[o.length - 1]);
    return r === -1 || n === -1 ? null : {
      firstIdx: r,
      lastIdx: n
    };
  }
  /** Insertion target for a group-chip drag: a group can't be dropped inside
  *  another group, so snap out of the range; a just-before slot is kept. */
  _resolveGroupDragTarget(e, t, i, o) {
    return o ? {
      insertionIndex: e < (t + i + 1) / 2 ? t : i + 1,
      targetTabGroupId: null
    } : {
      insertionIndex: e,
      targetTabGroupId: null
    };
  }
  /** Insertion target for a single-tab drag against a group: decide whether
  *  the drop merges into the group based on the cursor vs the chip edge. */
  _resolveTabDragTarget(e, t, i, o, r, n) {
    var s;
    const a = this._animState, d = (s = a.chipSizes.get(e.id)) !== null && s !== void 0 ? s : 0;
    if (n)
      return this._onlySourceBetween(i, r) ? t >= (e.collapsed ? a.containerStart + o + d / 2 : a.containerStart + o + d) ? {
        insertionIndex: r,
        targetTabGroupId: e.id
      } : {
        insertionIndex: i,
        targetTabGroupId: null
      } : null;
    const c = a.containerStart + o + d;
    return i === r ? {
      insertionIndex: i,
      targetTabGroupId: t >= c ? e.id : null
    } : {
      insertionIndex: i,
      targetTabGroupId: e.id
    };
  }
  /**
  * Whether every tab in the half-open range `[from, to)` is the source tab
  * or one of the source group's tabs.
  */
  _onlySourceBetween(e, t) {
    const i = this._animState;
    for (let r = e; r < t; r++) {
      var o;
      const n = this._tabs[r].value.panel.id;
      if (n !== i.sourceTabId && !(!((o = i.sourceGroupPanelIds) === null || o === void 0) && o.has(n))) return !1;
    }
    return !0;
  }
  /**
  * Multi-row wrap drag-over: resolve the 2-D insertion slot and show a
  * discrete drop indicator. No gap/FLIP animation (that's 1-D and fights the
  * flow layout, so `applyDragOverTransforms`/`runFlipAnimation` no-op in wrap).
  */
  handleWrappedDragOver(e, t) {
    if (!this._animState) return;
    const i = this.computeWrappedInsertionIndex(e, t);
    i === this._animState.currentInsertionIndex && this._animState.targetTabGroupId === null || (this._animState.currentInsertionIndex = i, this._animState.targetTabGroupId = null, this.updateWrapDropIndicator(i));
  }
  /**
  * The insertion slot (index into the full tab list) for a pointer at
  * `(clientX, clientY)` over a wrapped strip. Two axes:
  *  - horizontal header (rows): pick the row whose vertical span contains
  *    `clientY`, then the slot within it by x-midpoint;
  *  - vertical header (columns): pick the column whose horizontal span
  *    contains `clientX`, then the slot within it by y-midpoint.
  * The pointer's cross-axis coordinate selects the line (nearest line if it
  * falls in an inter-line gap); its main-axis coordinate selects the slot.
  * Excludes the drag source so its own position doesn't bias the result; the
  * drop path adjusts for the source offset.
  */
  computeWrappedInsertionIndex(e, t) {
    var i;
    const o = this._direction === "vertical", r = this._wrappedDragEntries();
    if (r.length === 0) return this._tabs.length;
    const n = o ? e : t, s = o ? t : e, a = (p) => o ? p.left : p.top, d = (p) => o ? p.right : p.bottom, c = (p) => o ? p.top : p.left, l = (p) => o ? p.height : p.width, h = this._bucketWrappedLines(r, a, d), v = [...((i = h.find((p) => n >= p.start && n <= p.end)) !== null && i !== void 0 ? i : this._nearestWrappedLine(h, n)).items].sort((p, u) => c(p.rect) - c(u.rect));
    for (const p of v) if (s < c(p.rect) + l(p.rect) / 2) return p.index;
    return v[v.length - 1].index + 1;
  }
  /**
  * The wrapped drop candidates: each non-source tab's list index + live
  * rect. The drag source (and any grouped tabs moving with it) are excluded
  * so their own positions don't bias the hit-test.
  */
  _wrappedDragEntries() {
    var e, t;
    const i = (e = this._animState) === null || e === void 0 ? void 0 : e.sourceTabId, o = (t = this._animState) === null || t === void 0 ? void 0 : t.sourceGroupPanelIds, r = [];
    for (let n = 0; n < this._tabs.length; n++) {
      const s = this._tabs[n].value;
      s.panel.id !== i && (o?.has(s.panel.id) || r.push({
        index: n,
        rect: s.element.getBoundingClientRect()
      }));
    }
    return r;
  }
  /**
  * Bucket entries into lines by cross-axis start (2px tolerance for sub-pixel
  * rounding), sorted along the cross axis.
  */
  _bucketWrappedLines(e, t, i) {
    const o = [];
    for (const r of e) {
      const n = t(r.rect), s = o.find((a) => Math.abs(a.start - n) <= 2);
      s ? (s.items.push(r), s.end = Math.max(s.end, i(r.rect))) : o.push({
        start: n,
        end: i(r.rect),
        items: [r]
      });
    }
    return o.sort((r, n) => r.start - n.start), o;
  }
  /** The line nearest `crossPointer` by cross-axis distance (gap fallback). */
  _nearestWrappedLine(e, t) {
    const i = (o) => t < o.start ? o.start - t : t - o.end;
    return e.reduce((o, r) => i(r) < i(o) ? r : o, e[0]);
  }
  updateWrapDropIndicator(e) {
    var t;
    this.clearWrapDropIndicator();
    const i = this._tabs.length;
    if (i === 0) return;
    const o = (t = this._animState) === null || t === void 0 ? void 0 : t.sourceTabId;
    if (e < i) {
      const r = this._tabs[e].value.element;
      if (this._tabs[e].value.panel.id === o) return;
      r.classList.add("dv-tab--reorder-before"), this._wrapIndicatorEl = r;
    } else {
      const r = this._tabs[i - 1].value.element;
      r.classList.add("dv-tab--reorder-after"), this._wrapIndicatorEl = r;
    }
  }
  clearWrapDropIndicator() {
    var e;
    (e = this._wrapIndicatorEl) === null || e === void 0 || e.classList.remove("dv-tab--reorder-before", "dv-tab--reorder-after"), this._wrapIndicatorEl = null;
  }
  /**
  * Batch-remove a CSS class from multiple elements instantly,
  * forcing only a single reflow for the entire batch.
  */
  _removeClassInstantlyBatch(e, t) {
    const i = [];
    for (const o of e) o.classList.contains(t) && (o.style.transition = "none", z(o, t, !1), i.push(o));
    if (i.length > 0) {
      i[0].getBoundingClientRect();
      for (const o of i) o.style.removeProperty("transition");
    }
  }
  /**
  * Remove `dv-tab--dragging` from the source tab instantly so it
  * regains its real width before FLIP snapshots.
  */
  uncollapseSourceTab(e) {
    const t = this._tabMap.get(e);
    t && this._removeClassInstantlyBatch([t.value.element], "dv-tab--dragging");
  }
  applyDragOverTransforms(e = !1) {
    var t;
    if (this._wrapMode) return;
    if (((t = this._animState) === null || t === void 0 ? void 0 : t.currentInsertionIndex) == null) {
      this.resetTabTransforms();
      return;
    }
    if (this._pendingCollapse) return;
    const i = this._animState.currentInsertionIndex, o = this._computeGapSize(), r = this._computeChipToShift(i);
    this._applyGapMargins(i, o, r, e);
  }
  /** Gap size for the current drag: the whole group's span for a group
  *  drag, otherwise the source tab's own main-axis size. */
  _computeGapSize() {
    const e = this._animState;
    if (e.sourceTabGroupId && e.sourceGroupPanelIds) return e.sourceGapSize;
    const t = e.tabPositions.get(e.sourceTabId);
    return t ? this._mainAxisSize(t) : this.getAverageTabSize();
  }
  /**
  * When the insertion lands at or before a group's first tab, the chip is
  * shifted so the gap appears before the entire group. Returns that chip
  * element, or null when no chip should shift.
  *
  * A chip shifts when dropping outside the group (targetTabGroupId null), or
  * when dropping inside a collapsed group (whose tabs are invisible, so
  * putting the gap on them has no visual effect).
  */
  _computeChipToShift(e) {
    if (this._tabGroupManager.chipRenderers.size === 0) return null;
    for (const t of this.group.model.getTabGroups()) {
      const i = this._chipToShiftForGroup(t, e);
      if (i !== void 0) return i;
    }
    return null;
  }
  /**
  * The chip to shift for a single group, or `undefined` to keep scanning the
  * remaining groups. A defined result (the chip element, or null when the
  * governing group has no shiftable chip) stops the scan.
  */
  _chipToShiftForGroup(e, t) {
    const i = this._animState;
    if (e.id === i.sourceTabGroupId || e.panelIds.includes(i.sourceTabId)) return;
    const o = e.panelIds.filter((n) => {
      var s;
      return n !== i.sourceTabId && !(!((s = i.sourceGroupPanelIds) === null || s === void 0) && s.has(n));
    });
    if (o.length === 0) return;
    const r = this._tabs.findIndex((n) => n.value.panel.id === o[0]);
    if ((!i.targetTabGroupId || i.targetTabGroupId === e.id && e.collapsed) && !(r < t)) {
      if (this._onlySourceBetween(t, r)) {
        const n = this._tabGroupManager.chipRenderers.get(e.id);
        if (n) return n.chip.element;
      }
      return null;
    }
  }
  /** Reset non-source chip margins, then apply the gap margin to the chip or
  *  the first tab at/after the insertion index. */
  _applyGapMargins(e, t, i, o) {
    const r = this._animState, n = r.sourceGroupPanelIds;
    let s = !1;
    for (const [a, d] of this._tabGroupManager.chipRenderers)
      a !== r.sourceTabGroupId && this._clearMargin(d.chip.element, o);
    i && (this._setMargin(i, `${t}px`, o), s = !0);
    for (let a = 0; a < this._tabs.length; a++) {
      const d = this._tabs[a].value;
      d.panel.id !== r.sourceTabId && (n?.has(d.panel.id) || (!s && a >= e ? (this._setMargin(d.element, `${t}px`, o), s = !0) : this._clearMargin(d.element, o)));
    }
    this._tabGroupManager.trackUnderlines();
  }
  /** Pick the correct shifting class for tabs vs chips. */
  _shiftingClass(e) {
    return e.classList.contains("dv-tab-group-chip") ? "dv-tab-group-chip--shifting" : "dv-tab--shifting";
  }
  /** Apply the main-axis gap margin to an element, optionally bypassing CSS
  *  transitions for instant positioning. */
  _setMargin(e, t, i) {
    const o = this._gapMarginProperty;
    i ? (e.style.transition = "none", e.style.setProperty(o, t), e.getBoundingClientRect(), e.style.removeProperty("transition")) : e.style.setProperty(o, t), z(e, this._shiftingClass(e), !0);
  }
  /** Clear an element's gap margin, animating it back to zero unless
  *  transitions are skipped. */
  _clearMargin(e, t) {
    const i = this._shiftingClass(e), o = this._gapMarginProperty, r = this._pendingMarginCleanups.get(e);
    if (r && r(), t || !e.style.getPropertyValue(o))
      e.style.removeProperty(o), z(e, i, !1);
    else {
      e.style.setProperty(o, "0px"), z(e, i, !0);
      const n = () => {
        e.style.removeProperty(o), z(e, i, !1), e.removeEventListener("transitionend", n), clearTimeout(s), this._pendingMarginCleanups.delete(e);
      }, s = setTimeout(n, 300);
      this._pendingMarginCleanups.set(e, n), e.addEventListener("transitionend", n);
    }
  }
  resetTabTransforms() {
    this.clearWrapDropIndicator();
    for (const [, e] of this._pendingMarginCleanups) e();
    this._pendingMarginCleanups.clear();
    for (const e of this._tabs)
      e.value.element.style.removeProperty("margin-left"), e.value.element.style.removeProperty("margin-right"), e.value.element.style.removeProperty("margin-top"), e.value.element.style.removeProperty("margin-bottom"), e.value.element.style.removeProperty("transform"), z(e.value.element, "dv-tab--shifting", !1);
    for (const [, e] of this._tabGroupManager.chipRenderers)
      e.chip.element.style.removeProperty("margin-left"), e.chip.element.style.removeProperty("margin-top"), z(e.chip.element, "dv-tab-group-chip--shifting", !1);
    this._tabGroupManager.positionUnderlines();
  }
  /**
  * Commit a group-drag drop: clear drag classes, move the group
  * in the model, and run a FLIP animation.
  */
  commitGroupMove(e, t) {
    const i = W();
    if (this._tabGroupManager.disposeChipDrag(e), this._tabGroupManager.clearChipDropOverlays(), this.group.model.getTabGroups().some((n) => n.id === e)) {
      var o;
      if (((o = this.accessor.options.theme) === null || o === void 0 ? void 0 : o.tabAnimation) === "smooth") {
        this._clearGroupDragClasses(e);
        const n = this.snapshotTabPositions();
        this.resetTabTransforms(), this.group.model.moveTabGroup(e, t), this.runFlipAnimation(n, "", !1);
      } else
        this._tabGroupManager.skipNextCollapseAnimation = !0, this.group.model.moveTabGroup(e, t);
    } else if (i) {
      var r;
      this.resetTabTransforms(), this.accessor.moveGroupOrPanel({
        from: {
          groupId: i.groupId,
          tabGroupId: (r = i.tabGroupId) !== null && r !== void 0 ? r : e
        },
        to: {
          group: this.group,
          position: "center",
          index: t
        }
      });
    }
  }
  _clearGroupDragClasses(e) {
    const t = this._tabGroupManager.chipRenderers.get(e);
    t && this._removeClassInstantlyBatch([t.chip.element], "dv-tab-group-chip--dragging"), this._removeClassInstantlyBatch(this._tabs.map((o) => o.value.element), "dv-tab--dragging");
    const i = this._tabGroupManager.groupUnderlines.get(e);
    i && i.style.removeProperty("display"), this._tabGroupManager.skipNextCollapseAnimation = !0;
  }
  resetDragAnimation() {
    if (this._pendingCollapse = !1, this._animState) {
      this.resetTabTransforms(), this._animState.sourceTabGroupId ? this._clearGroupDragClasses(this._animState.sourceTabGroupId) : this._removeClassInstantlyBatch(this._tabs.map((e) => e.value.element), "dv-tab--dragging"), this._animState = null;
      for (const [, e] of this._tabGroupManager.groupUnderlines) e.style.removeProperty("display");
    }
  }
  runFlipAnimation(e, t, i = !1, o) {
    if (this._wrapMode) return;
    let r = !1;
    for (let n = 0; n < this._tabs.length; n++) this._applyFlipTransform(this._tabs[n], n, t, i, e, o) && (r = !0);
    r && this._scheduleFlipReset();
  }
  /**
  * Set a single tab's FLIP transform: the source tab slides in from the end
  * on a cross-group insert; other in-range tabs slide from their first
  * position to their last. Returns true if the tab will animate.
  */
  _applyFlipTransform(e, t, i, o, r, n) {
    const s = this._direction === "vertical", a = e.value.panel.id;
    if (a === i) {
      if (!o) return !1;
      const h = e.value.element.getBoundingClientRect();
      return e.value.element.style.transform = s ? `translateY(${h.height}px)` : `translateX(${h.width}px)`, z(e.value.element, "dv-tab--shifting", !0), !0;
    }
    if (n !== void 0 && (t < n.from || t > n.to)) return !1;
    const d = r.get(a);
    if (!d) return !1;
    const c = e.value.element.getBoundingClientRect(), l = s ? d.top - c.top : d.left - c.left;
    return Math.abs(l) < 1 ? !1 : (e.value.element.style.transform = s ? `translateY(${l}px)` : `translateX(${l}px)`, z(e.value.element, "dv-tab--shifting", !0), !0);
  }
  /**
  * Next frame, clear the transforms (triggering the CSS transition), track
  * underlines through the slide, and drop the shifting classes once the
  * transform transition ends.
  */
  _scheduleFlipReset() {
    requestAnimationFrame(() => {
      var e;
      for (const o of this._tabs) o.value.element.style.transform && (o.value.element.style.transform = "");
      this._tabGroupManager.trackUnderlines(), (e = this._flipTransitionCleanup) === null || e === void 0 || e.call(this);
      const t = (o) => {
        if (o.propertyName === "transform") {
          i();
          for (const r of this._tabs) z(r.value.element, "dv-tab--shifting", !1);
          this._tabGroupManager.positionUnderlines();
        }
      }, i = () => {
        this._tabsList.removeEventListener("transitionend", t), this._flipTransitionCleanup = null;
      };
      this._flipTransitionCleanup = i, this._tabsList.addEventListener("transitionend", t);
    });
  }
}, fn = class extends I {
  get _animState() {
    return this._reorder.animState;
  }
  set _animState(e) {
    this._reorder.animState = e;
  }
  get _pendingCollapse() {
    return this._reorder.pendingCollapse;
  }
  set _pendingCollapse(e) {
    this._reorder.pendingCollapse = e;
  }
  get tabItems() {
    return this._tabs;
  }
  get tabMap() {
    return this._tabMap;
  }
  get tabsList() {
    return this._tabsList;
  }
  get groupPanel() {
    return this.group;
  }
  get component() {
    return this.accessor;
  }
  get tabGroupManager() {
    return this._tabGroupManager;
  }
  fireDrop(e) {
    this._onDrop.fire(e);
  }
  /**
  * Register a predicate excluding panels from the overflow dropdown (pinned
  * tabs). Re-evaluates the dropdown immediately if overflow is being
  * observed. Passing `() => false` restores default behaviour.
  */
  setOverflowExclude(e) {
    this._overflowExclude = e, this.refreshOverflow();
  }
  /**
  * Register a predicate that forces matching panels into the overflow
  * dropdown regardless of horizontal fit (the MultiRowTabs surplus set, the
  * rows beyond `overflow.maxRows`). Re-evaluates the dropdown immediately.
  * Passing `() => false` restores default behaviour.
  */
  setForcedOverflow(e) {
    this._forcedOverflow = e, this.refreshOverflow();
  }
  /** Re-evaluate the overflow dropdown now (e.g. after the exclusion set
  *  changed) instead of waiting for the next resize/scroll observer fire. */
  refreshOverflow() {
    this._showTabsOverflowControl && this.toggleDropdown({ reset: !1 }), this._applyPinnedSticky();
  }
  /**
  * Enable/disable sticky-on-scroll for pinned tabs (inline mode), wired by
  * the PinnedTabs module. When on, pinned (overflow-excluded) tabs are frozen
  * to the left edge as the strip scrolls, each at the cumulative width of the
  * pinned tabs before it; when off, the sticky styling is cleared. The
  * offsets are scroll-invariant, so they are recomputed only on resize,
  * horizontal scroll (a cheap self-heal after a reorder), and pinned-set
  * changes, not continuously.
  */
  setPinnedSticky(e) {
    this._pinnedSticky !== e && (this._pinnedSticky = e, this._applyPinnedSticky());
  }
  /**
  * Freeze the pinned (overflow-excluded) tabs to the left edge: give each the
  * `dv-tab--pinned-sticky` class and a `--dv-pinned-sticky-left` offset so the
  * CSS `position: sticky` rule holds it in place as the strip scrolls. Clears
  * the styling from any tab that is no longer pinned, and from all tabs when
  * the feature is off.
  */
  _applyPinnedSticky() {
    const e = this._pinnedSticky ? this._tabs.filter((i) => this._overflowExclude(i.value.panel.id)) : [];
    if (e.length === 0 && !this._hasPinnedStickyStyling) return;
    for (const i of this._tabs) {
      const o = i.value.element;
      o.classList.contains("dv-tab--pinned-sticky") && (o.classList.remove("dv-tab--pinned-sticky"), o.style.removeProperty("--dv-pinned-sticky-left"));
    }
    if (e.length === 0) {
      this._hasPinnedStickyStyling = !1;
      return;
    }
    const t = e.map((i) => i.value.element.offsetLeft);
    e.forEach((i, o) => {
      const r = i.value.element;
      r.classList.add("dv-tab--pinned-sticky"), r.style.setProperty("--dv-pinned-sticky-left", `${t[o]}px`);
    }), this._hasPinnedStickyStyling = !0;
  }
  get showTabsOverflowControl() {
    return this._showTabsOverflowControl;
  }
  set showTabsOverflowControl(e) {
    if (this._showTabsOverflowControl != e)
      if (this._showTabsOverflowControl = e, e) {
        const t = new ir(this._tabsList);
        this._observerDisposable.value = new I(t, t.onDidChange((i) => {
          const o = i.hasScrollX || i.hasScrollY;
          this.toggleDropdown({ reset: !o }), this._applyPinnedSticky(), this._tabGroupManager.groupUnderlines.size > 0 && this._tabGroupManager.positionUnderlines();
        }), T(this._tabsList, "scroll", () => {
          this.toggleDropdown({ reset: !1 }), this._applyPinnedSticky(), this._tabGroupManager.groupUnderlines.size > 0 && this._tabGroupManager.positionUnderlines();
        }));
      } else this._observerDisposable.value = $.NONE;
  }
  get element() {
    return this._element;
  }
  /**
  * The scrollable tab list (`.dv-tabs-container`) holding the tab elements,
  * exposed (read-only) so the multi-row wrap controller can measure the
  * wrapped row count and toggle the wrap class. Not the outer header element.
  */
  get tabsListElement() {
    return this._tabsList;
  }
  set voidContainer(e) {
    var t;
    (t = this._voidContainerListeners) === null || t === void 0 || t.dispose(), this._voidContainerListeners = null, this._reorder.voidContainerElement = e, e && (this._voidContainerListeners = new I(T(e, "dragover", (i) => {
      this._animState && i.preventDefault();
    }), T(e, "drop", (i) => {
      var o;
      !((o = this._animState) === null || o === void 0) && o.sourceTabGroupId && this._animState.currentInsertionIndex !== null && (i.preventDefault(), i.stopPropagation(), this.handleVoidDrop());
    })));
  }
  /**
  * Handle a drop that occurred on the void container (empty header
  * space to the right of the tabs). Returns `true` if the drop was
  * consumed by an active group drag, `false` otherwise.
  */
  handleVoidDrop() {
    var e, t;
    if (!(!((e = this._animState) === null || e === void 0) && e.sourceTabGroupId)) return !1;
    const i = this._animState.sourceTabGroupId, o = (t = this._animState.currentInsertionIndex) !== null && t !== void 0 ? t : this._tabs.length;
    return this._animState = null, this._commitGroupMove(i, o), !0;
  }
  get panels() {
    return this._tabs.map((e) => e.value.panel.id);
  }
  get size() {
    return this._tabs.length;
  }
  get tabs() {
    return this._tabs.map((e) => e.value);
  }
  get direction() {
    return this._direction;
  }
  set direction(e) {
    if (this._direction !== e) {
      this._direction = e, this._tabsList.setAttribute("aria-orientation", e === "vertical" ? "vertical" : "horizontal"), this._scrollbar && (this._scrollbar.orientation = e), le(this._tabsList, "dv-horizontal", "dv-vertical"), e === "vertical" ? ce(this._tabsList, "dv-tabs-container-vertical", "dv-vertical") : (le(this._tabsList, "dv-tabs-container-vertical"), ce(this._tabsList, "dv-horizontal"));
      for (const t of this._tabs) t.value.setDirection(e);
      this._tabGroupManager.updateDirection();
    }
  }
  constructor(e, t, i) {
    super(), this.group = e, this.accessor = t, this._observerDisposable = new j(), this._pointerActivation = new j(), this._scrollbar = null, this._tabs = [], this._tabMap = /* @__PURE__ */ new Map(), this.selectedIndex = -1, this._showTabsOverflowControl = !1, this._overflowExclude = () => !1, this._forcedOverflow = () => !1, this._pinnedSticky = !1, this._hasPinnedStickyStyling = !1, this._direction = "horizontal", this._voidContainerListeners = null, this._onTabDragStart = new D(), this.onTabDragStart = this._onTabDragStart.event, this._onDrop = new D(), this.onDrop = this._onDrop.event, this._onWillShowOverlay = new D(), this.onWillShowOverlay = this._onWillShowOverlay.event, this._onOverflowTabsChange = new D(), this.onOverflowTabsChange = this._onOverflowTabsChange.event, this._tabsList = document.createElement("div"), this._tabsList.className = "dv-tabs-container", this._tabsList.setAttribute("role", "tablist"), this._tabsList.setAttribute("aria-orientation", this._direction === "vertical" ? "vertical" : "horizontal"), this.showTabsOverflowControl = i.showTabsOverflowControl, t.options.scrollbars === "native" ? this._element = this._tabsList : (this._scrollbar = new Io(this._tabsList), this._scrollbar.orientation = this.direction, this._element = this._scrollbar.element, this.addDisposables(this._scrollbar)), this._tabGroupManager = new bn({
      group: this.group,
      accessor: this.accessor,
      tabsList: this._tabsList,
      getTabs: () => this._tabs,
      getTabMap: () => this._tabMap,
      getDirection: () => this._direction
    }, {
      onChipContextMenu: (r, n) => {
        var s;
        (s = this.accessor.contextMenuService) === null || s === void 0 || s.showForChip(r, this.group, n);
      },
      onChipDragStart: (r, n, s) => {
        this._handleChipDragStart(r, n, s);
      },
      onChipDragEnd: () => {
        this._reorder.resetDragAnimation();
      },
      onChipDrop: (r, n) => {
        this._handleChipDrop(r, n);
      }
    }), this._reorder = new mn(this);
    const o = he.createDropTarget(this._tabsList, {
      acceptedTargetZones: ["center"],
      canDisplayOverlay: () => !1,
      isHitTestTransparent: () => {
        const r = W();
        return r?.viewId !== this.accessor.id || r.groupId !== this.group.id ? !0 : r.panelId === null && !r.tabGroupId;
      }
    });
    this.addDisposables(o, this._onOverflowTabsChange, this._observerDisposable, this._pointerActivation, this._onWillShowOverlay, this._onDrop, this._onTabDragStart, this._reorder, lt.getInstance().onDragEnd((r) => {
      this._reorder.handlePointerDragEnd(r);
    }), lt.getInstance().onDragMove((r) => {
      this._reorder.handlePointerDragMove(r.clientX, r.clientY);
    }), T(this.element, "pointerdown", (r) => {
      r.defaultPrevented || r.button === 0 && this.accessor.doSetGroupActive(this.group);
    }), T(this._tabsList, "wheel", (r) => {
      const n = this._direction === "vertical", s = n ? r.deltaY || r.deltaX : r.deltaX || r.deltaY;
      if (s === 0) return;
      const a = n ? this._tabsList.scrollHeight - this._tabsList.clientHeight : this._tabsList.scrollWidth - this._tabsList.clientWidth;
      if (a <= 0) return;
      const d = n ? this._tabsList.scrollTop : this._tabsList.scrollLeft;
      s < 0 && d <= 0 || s > 0 && d >= a || (r.preventDefault(), r.stopPropagation(), n ? this._tabsList.scrollTop = d + s : this._tabsList.scrollLeft = d + s);
    }, { passive: !1 }), T(this._tabsList, "keydown", (r) => {
      this._onKeyDown(r);
    }), T(this._tabsList, "dragover", (r) => {
      this._reorder.processDragOver(r.clientX, r.clientY) && r.preventDefault();
    }, !0), T(this._tabsList, "dragleave", (r) => {
      this._reorder.processDragLeave(r.relatedTarget);
    }, !0), T(this._tabsList, "dragend", () => {
      this._reorder.resetDragAnimation();
    }), T(this._tabsList, "drop", (r) => {
      var n, s, a;
      if (((n = this._animState) === null || n === void 0 ? void 0 : n.currentInsertionIndex) == null || ((s = this.accessor.options.theme) === null || s === void 0 ? void 0 : s.tabAnimation) !== "smooth" && !this._animState.sourceTabGroupId) return;
      r.stopPropagation(), r.preventDefault(), (a = this.group.model.dropTargetContainer) === null || a === void 0 || (a = a.model) === null || a === void 0 || a.clear();
      const d = this._animState;
      if (this._animState = null, this._pendingCollapse = !1, d.sourceTabGroupId) {
        this._commitGroupMove(d.sourceTabGroupId, d.currentInsertionIndex);
        return;
      }
      const c = d.currentInsertionIndex, l = d.sourceIndex, h = c - (l !== -1 && l < c ? 1 : 0), v = this.group.model.getTabGroupForPanel(d.sourceTabId);
      if (h === l && !d.targetTabGroupId && !v) {
        this._reorder.uncollapseSourceTab(d.sourceTabId), this.resetTabTransforms();
        return;
      }
      this._reorder.uncollapseSourceTab(d.sourceTabId);
      const p = this.snapshotTabPositions();
      this.resetTabTransforms(), this._onDrop.fire({
        event: r,
        index: h,
        targetTabGroupId: d.targetTabGroupId
      }), this.runFlipAnimation(p, d.sourceTabId, d.sourceIndex === -1, {
        from: Math.min(l, h),
        to: Math.max(l, h)
      });
    }, !0), $.from(() => {
      var r;
      (r = this._voidContainerListeners) === null || r === void 0 || r.dispose(), this._reorder.resetDragAnimation(), this._tabGroupManager.disposeAll();
      for (const { value: n, disposable: s } of this._tabs)
        s.dispose(), n.dispose();
      this._tabs = [], this._tabMap.clear();
    }));
  }
  indexOf(e) {
    return this._tabs.findIndex((t) => t.value.panel.id === e);
  }
  /** DOM id of the tab element for a panel, used for the tabpanel's `aria-labelledby`. */
  getTabId(e) {
    var t;
    return (t = this._tabMap.get(e)) === null || t === void 0 ? void 0 : t.value.element.id;
  }
  /** Inverse of {@link getTabId}: the panel whose tab owns `element` (the tab
  *  itself or any descendant of it), or `undefined` for non-tab targets. */
  getPanelForTab(e) {
    for (const { value: t } of this._tabs) if (t.element === e || t.element.contains(e)) return t.panel;
  }
  isActive(e) {
    return this.selectedIndex > -1 && this._tabs[this.selectedIndex].value === e;
  }
  _onKeyDown(e) {
    const t = this._tabs.findIndex((s) => s.value.element === e.target);
    if (t === -1) return;
    const i = this._direction === "vertical", o = i ? "ArrowDown" : "ArrowRight", r = i ? "ArrowUp" : "ArrowLeft", n = this._tabs.length - 1;
    switch (e.key) {
      case o:
        e.preventDefault(), this._focusTab(Math.min(t + 1, n));
        break;
      case r:
        e.preventDefault(), this._focusTab(Math.max(t - 1, 0));
        break;
      case "Home":
        e.preventDefault(), this._focusTab(0);
        break;
      case "End":
        e.preventDefault(), this._focusTab(n);
        break;
      case "Enter":
      case " ":
        e.preventDefault(), this.accessor.withOrigin("user", () => this._tabs[t].value.panel.api.setActive());
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault(), this._closeTab(t);
        break;
    }
  }
  /**
  * Close the tab at `index` and move roving focus to a neighbouring tab so
  * keyboard focus stays in the tablist.
  */
  _closeTab(e) {
    var t, i, o, r, n;
    const s = (t = this._tabs[e]) === null || t === void 0 ? void 0 : t.value;
    if (!s) return;
    const a = (i = (o = (r = this._tabs[e + 1]) === null || r === void 0 ? void 0 : r.value) !== null && o !== void 0 ? o : (n = this._tabs[e - 1]) === null || n === void 0 ? void 0 : n.value) === null || i === void 0 ? void 0 : i.panel.id;
    if (s.panel.api.close(), a !== void 0) {
      const d = this._tabs.findIndex((c) => c.value.panel.id === a);
      d > -1 && this._focusTab(d);
    }
  }
  /** Move the roving focus to the tab at `index` (updates tabindex + DOM focus). */
  _focusTab(e) {
    for (let t = 0; t < this._tabs.length; t++) this._tabs[t].value.element.tabIndex = t === e ? 0 : -1;
    this._tabs[e].value.element.focus();
  }
  /** Move DOM focus to the active tab, the entry point into the tablist. */
  focusActiveTab() {
    var e;
    if (this._tabs.length === 0) return;
    const t = (e = this.group.activePanel) === null || e === void 0 ? void 0 : e.id, i = t ? this._tabs.findIndex((o) => o.value.panel.id === t) : -1;
    this._focusTab(i > -1 ? i : 0);
  }
  setActivePanel(e) {
    const t = this._direction === "vertical";
    for (const i of this._tabs) {
      const o = e.id === i.value.panel.id;
      i.value.setActive(o), o && this._scrollTabIntoView(i.value.element, t);
    }
    this._tabGroupManager.groupUnderlines.size > 0 && this._tabGroupManager.positionUnderlines();
  }
  /**
  * Scroll the active tab into view within its scroll container. Uses the
  * element's own offset (relative to the container) rather than accumulating
  * tab client sizes, which omits tab margins and any in-flow group chips
  * between tabs and so undershoots the active tab's real position.
  */
  _scrollTabIntoView(e, t) {
    const i = e.parentElement;
    if (!i) return;
    const o = t ? e.offsetTop : e.offsetLeft, r = t ? e.offsetHeight : e.offsetWidth, n = t ? i.scrollTop : i.scrollLeft, s = t ? i.clientHeight : i.clientWidth;
    (o < n || o + r > n + s) && (t ? i.scrollTop = o : i.scrollLeft = o);
  }
  /**
  * Activate a tab in response to a plain (non-shift) left pointerdown.
  *
  * With the HTML5 drag backend the tab is natively `draggable`, and a native
  * drag arms from the same pointerdown+move gesture. Firefox aborts that
  * pending drag if the pointerdown also moves focus / relayouts the tab strip
  * synchronously — which `openPanel` does — so a drag started on an inactive
  * tab never begins (issue #932). Defer the activation past the frame so
  * `dragstart` arms first; a plain click (no drag) still activates on the
  * next frame, which is imperceptible. The pointer backend has no native drag
  * to pre-empt, so it activates synchronously as before.
  */
  _activateOnPointerDown(e) {
    if (!te(this.accessor.options).html5) {
      this.group.model.openPanel(e);
      return;
    }
    const t = requestAnimationFrame(() => {
      this._tabMap.has(e.id) && this.group.model.openPanel(e);
    });
    this._pointerActivation.value = { dispose: () => cancelAnimationFrame(t) };
  }
  openPanel(e, t = this._tabs.length) {
    if (this._tabMap.has(e.id)) return;
    const i = new nn(e, this.accessor, this.group);
    i.setContent(e.view.tab), this._direction !== "horizontal" && i.setDirection(this._direction);
    const o = {
      value: i,
      disposable: new I(i.onDragStart((r) => {
        var n;
        if (this._onTabDragStart.fire({
          nativeEvent: r,
          panel: e
        }), ((n = this.accessor.options.theme) === null || n === void 0 ? void 0 : n.tabAnimation) === "smooth") {
          const s = Re(i.element.getBoundingClientRect(), this._direction), a = this._tabs.findIndex((d) => d.value === i);
          this._animState = {
            sourceTabId: e.id,
            sourceIndex: a,
            tabPositions: this.snapshotTabPositions(),
            chipSizes: this._tabGroupManager.snapshotChipSizes(),
            currentInsertionIndex: null,
            targetTabGroupId: null,
            sourceTabGroupId: null,
            sourceGroupPanelIds: null,
            sourceChipSize: 0,
            cursorOffsetFromDragStart: s / 2,
            sourceGapSize: s,
            containerStart: ot(this._tabsList.getBoundingClientRect(), this._direction)
          }, this._pendingCollapse = !0, requestAnimationFrame(() => {
            var d, c;
            this._pendingCollapse = !1, this._animState && (this._tabsList.classList.contains("dv-tabs-container--wrap") || (i.element.style.transition = "none", z(i.element, "dv-tab--dragging", !0), i.element.offsetHeight), (c = (d = this._animState).currentInsertionIndex) !== null && c !== void 0 || (d.currentInsertionIndex = a), this.applyDragOverTransforms(!0), i.element.style.removeProperty("transition"));
          });
        }
      }), i.onTabClick((r) => {
        r.defaultPrevented || this.group.api.location.type === "edge" && (this.group.activePanel === e ? this.group.api.isCollapsed() ? this.group.api.expand() : this.group.api.collapse() : (this.group.model.openPanel(e), this.group.api.isCollapsed() && this.group.api.expand()));
      }), i.onPointerDown((r) => {
        if (r.defaultPrevented) return;
        const n = !this.accessor.options.disableFloatingGroups, s = this.group.api.location.type === "floating" && this.size === 1;
        if (n && !s && r.shiftKey) {
          r.preventDefault();
          const a = this.accessor.getGroupPanel(i.panel.id), { top: d, left: c } = i.element.getBoundingClientRect(), { top: l, left: h } = this.accessor.element.getBoundingClientRect();
          this.accessor.addFloatingGroup(a, {
            x: c - h,
            y: d - l,
            inDragMode: !0
          });
          return;
        }
        r.button === 0 && this.group.api.location.type !== "edge" && this.group.activePanel !== e && this._activateOnPointerDown(e);
      }), i.onDrop((r) => {
        const n = this._animState;
        this._animState = null, this._pendingCollapse = !1;
        const s = this._tabs.findIndex((h) => h.value === i);
        if (n) {
          var a;
          const h = r.position === "right" ? s + 1 : s;
          if (n.sourceTabGroupId) {
            var d;
            this._commitGroupMove(n.sourceTabGroupId, (d = n.currentInsertionIndex) !== null && d !== void 0 ? d : h);
            return;
          }
          this._reorder.uncollapseSourceTab(n.sourceTabId);
          const v = this.snapshotTabPositions();
          this.resetTabTransforms(), this._onDrop.fire({
            event: r.nativeEvent,
            index: h,
            targetTabGroupId: n.targetTabGroupId
          }), ((a = this.accessor.options.theme) === null || a === void 0 ? void 0 : a.tabAnimation) === "smooth" && this.runFlipAnimation(v, n.sourceTabId, n.sourceIndex === -1, n.sourceIndex === -1 ? void 0 : {
            from: Math.min(n.sourceIndex, h),
            to: Math.max(n.sourceIndex, h)
          });
        } else {
          var c, l;
          const h = this._direction === "vertical" ? "bottom" : "right", v = r.position === h ? s + 1 : s, p = W(), u = p ? this._tabs.findIndex((C) => C.value.panel.id === p.panelId) : -1, g = v - (u !== -1 && u < v ? 1 : 0), _ = (c = (l = this.group.model.getTabGroupForPanel(i.panel.id)) === null || l === void 0 ? void 0 : l.id) !== null && c !== void 0 ? c : null;
          this._onDrop.fire({
            event: r.nativeEvent,
            index: g,
            targetTabGroupId: _
          });
        }
      }), i.onWillShowOverlay((r) => {
        this._onWillShowOverlay.fire(new Fe(r, {
          kind: "tab",
          panel: this.group.activePanel,
          api: this.accessor.api,
          group: this.group,
          getData: W
        }));
      }))
    };
    this.addTab(o, t), this._tabGroupManager.positionAllChips(), this._animState && (this._animState.tabPositions = this.snapshotTabPositions(), this._animState.chipSizes = this._tabGroupManager.snapshotChipSizes(), this.applyDragOverTransforms());
  }
  delete(e) {
    var t;
    ((t = this._animState) === null || t === void 0 ? void 0 : t.sourceTabId) === e && (this.resetTabTransforms(), this._animState = null), this._tabGroupManager.cleanupTransition(e);
    const i = this.indexOf(e), o = this._tabs.splice(i, 1)[0];
    if (this._tabMap.delete(e), o) {
      const { value: r, disposable: n } = o;
      n.dispose(), r.dispose(), r.element.remove();
    }
    this._animState && (this._animState.tabPositions = this.snapshotTabPositions(), this._animState.chipSizes = this._tabGroupManager.snapshotChipSizes(), this.applyDragOverTransforms());
  }
  addTab(e, t = this._tabs.length) {
    if (t < 0 || t > this._tabs.length) throw new Error("invalid location");
    const i = t < this._tabs.length ? this._tabs[t].value.element : null;
    this._tabsList.insertBefore(e.value.element, i), this._tabs = [
      ...this._tabs.slice(0, t),
      e,
      ...this._tabs.slice(t)
    ], this._tabMap.set(e.value.panel.id, e), this.selectedIndex < 0 && (this.selectedIndex = t);
  }
  toggleDropdown(e) {
    const t = this._tabs.some((s) => !this._overflowExclude(s.value.panel.id) && this._forcedOverflow(s.value.panel.id));
    if (e.reset && !t) {
      this._onOverflowTabsChange.fire({
        tabs: [],
        tabGroups: [],
        pinnedTabs: [],
        reset: !0
      });
      return;
    }
    const i = this._tabs.filter((s) => !this._overflowExclude(s.value.panel.id) && (this._forcedOverflow(s.value.panel.id) || !e.reset && !ft(s.value.element, this._tabsList))).map((s) => s.value.panel.id), o = e.reset ? [] : this._tabs.filter((s) => this._overflowExclude(s.value.panel.id) && s.value.element.getBoundingClientRect().width > 0 && !ft(s.value.element, this._tabsList)).map((s) => s.value.panel.id), r = new Set(i), n = [];
    for (const s of this.group.model.getTabGroups()) {
      const a = this._tabGroupManager.chipRenderers.get(s.id), d = a && !ft(a.chip.element, this._tabsList), c = s.panelIds.length > 0 && s.panelIds.every((l) => r.has(l));
      if ((d || c) && (n.push(s.id), s.collapsed))
        for (const l of s.panelIds) r.has(l) || (r.add(l), i.push(l));
    }
    this._onOverflowTabsChange.fire({
      tabs: i,
      tabGroups: n,
      pinnedTabs: o,
      reset: !1
    });
  }
  updateDragAndDropState() {
    for (const e of this._tabs) e.value.updateDragAndDropState();
    this._tabGroupManager.updateDragAndDropState();
  }
  /**
  * Synchronize chip elements and CSS classes for all tab groups
  * in the parent group model. Call after any tab group mutation.
  */
  updateTabGroups() {
    this._tabGroupManager.update();
  }
  refreshTabGroupAccent() {
    this._tabGroupManager.refreshAccents();
  }
  /**
  * Tabs-list-specific side effects of a chip drag start. The chip's
  * drag sources (constructed by `TabGroupManager`) own the transfer
  * payload, iframe shielding, dataTransfer setup, and the HTML5 drag
  * image. This method just sets up the smooth-reorder anim state and
  * collapses the source-group tabs in the tabs list.
  */
  _handleChipDragStart(e, t, i) {
    var o;
    const r = e.panelIds[0], n = r ? this._tabs.findIndex((c) => c.value.panel.id === r) : -1, s = t.element.getBoundingClientRect();
    let a = Re(s, this._direction);
    for (const c of e.panelIds) {
      const l = this._tabMap.get(c);
      l && (a += Re(l.value.element.getBoundingClientRect(), this._direction));
    }
    if (this._animState = {
      sourceTabId: "",
      sourceIndex: n,
      tabPositions: this.snapshotTabPositions(),
      chipSizes: this._tabGroupManager.snapshotChipSizes(),
      currentInsertionIndex: null,
      targetTabGroupId: null,
      sourceTabGroupId: e.id,
      sourceGroupPanelIds: new Set(e.panelIds),
      sourceChipSize: Re(s, this._direction),
      cursorOffsetFromDragStart: No(i, this._direction) - ot(s, this._direction),
      sourceGapSize: a,
      containerStart: ot(this._tabsList.getBoundingClientRect(), this._direction)
    }, ((o = this.accessor.options.theme) === null || o === void 0 ? void 0 : o.tabAnimation) !== "smooth") return;
    const d = new Set(e.panelIds);
    this._pendingCollapse = !0, requestAnimationFrame(() => {
      var c, l;
      if (this._pendingCollapse = !1, !this._animState) return;
      for (const p of this._tabs) d.has(p.value.panel.id) && (p.value.element.style.transition = "none", z(p.value.element, "dv-tab--dragging", !0));
      const h = this._tabGroupManager.chipRenderers.get(e.id);
      h && (h.chip.element.style.transition = "none", z(h.chip.element, "dv-tab-group-chip--dragging", !0)), this._tabsList.offsetHeight;
      const v = this._tabGroupManager.groupUnderlines.get(e.id);
      v && (v.style.display = "none"), (l = (c = this._animState).currentInsertionIndex) !== null && l !== void 0 || (c.currentInsertionIndex = n), this.applyDragOverTransforms(!0);
      for (const p of this._tabs) d.has(p.value.panel.id) && p.value.element.style.removeProperty("transition");
      h && h.chip.element.style.removeProperty("transition");
    });
  }
  /**
  * A drop on a tab group chip means "insert before this group". Resolve to
  * the index of the group's first tab, adjusting for same-group removal
  * (when the source tab is currently to the left of the target slot, its
  * removal shifts the insertion index down by one). Always clears
  * `targetTabGroupId` so the dropped tab lands outside the group.
  *
  * A chip dropped on a chip is a group move: the panel path would route it
  * through the cross-group machinery, which rebuilds the tab group under a
  * new id.
  */
  _handleChipDrop(e, t) {
    const i = e.panelIds[0];
    if (!i) return;
    const o = this._tabs.findIndex((d) => d.value.panel.id === i);
    if (o === -1) return;
    const r = W();
    if (r?.tabGroupId) {
      var n;
      const d = this._animState;
      this._animState = null, this._pendingCollapse = !1, this._commitGroupMove(r.tabGroupId, (n = d?.currentInsertionIndex) !== null && n !== void 0 ? n : o);
      return;
    }
    const s = r?.groupId === this.group.id && r?.panelId ? this._tabs.findIndex((d) => d.value.panel.id === r.panelId) : -1, a = o - (s !== -1 && s < o ? 1 : 0);
    this._onDrop.fire({
      event: t.nativeEvent,
      index: a,
      targetTabGroupId: null
    });
  }
  /**
  * Sets the broader container that is part of the same logical drop surface
  * as this tab list (e.g. the full header element).  When a dragleave from
  * the tabs list lands inside this container, `_animState` is preserved so
  * that external dragover listeners can continue the animation.
  */
  setExtendedDropZone(e) {
    this._reorder.setExtendedDropZone(e);
  }
  /**
  * Allows external elements (e.g. void container, left actions) to push an
  * insertion index into the animation while the cursor is outside the tabs
  * list itself.  Pass `null` to clear the indicator.
  */
  setExternalInsertionIndex(e) {
    this._reorder.setExternalInsertionIndex(e);
  }
  /**
  * Called when the drag cursor leaves the entire header area (not just the
  * tabs list).  Clears animation state for cross-group drags, which never
  * receive a `dragend` event on this tab list.
  */
  clearExternalAnimState() {
    this._reorder.clearExternalAnimState();
  }
  snapshotTabPositions() {
    return this._reorder.snapshotTabPositions();
  }
  handleDragOver(e) {
    this._reorder.handleDragOver(e);
  }
  applyDragOverTransforms(e = !1) {
    this._reorder.applyDragOverTransforms(e);
  }
  resetTabTransforms() {
    this._reorder.resetTabTransforms();
  }
  _commitGroupMove(e, t) {
    this._reorder.commitGroupMove(e, t);
  }
  runFlipAnimation(e, t, i = !1, o) {
    this._reorder.runFlipAnimation(e, t, i, o);
  }
};
function _n() {
  const e = document.createElement("div");
  e.className = "dv-tabs-overflow-dropdown-default";
  const t = document.createElement("span");
  t.textContent = "";
  const i = Jr();
  return e.appendChild(i), e.appendChild(t), {
    element: e,
    update: (o) => {
      t.textContent = `${o.tabs}`;
    }
  };
}
var wn = class extends I {
  get onTabDragStart() {
    return this.tabs.onTabDragStart;
  }
  get panels() {
    return this.tabs.panels;
  }
  get size() {
    return this.tabs.size;
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(e) {
    this._hidden = e, this.element.style.display = e ? "none" : "";
  }
  get direction() {
    return this._direction;
  }
  set direction(e) {
    this._direction = e, e === "vertical" ? (ce(this._element, "dv-groupview-header-vertical"), ce(this.rightActionsContainer, "dv-right-actions-container-vertical"), this.tabs.direction = e) : (le(this._element, "dv-groupview-header-vertical"), le(this.rightActionsContainer, "dv-right-actions-container-vertical"), this.tabs.direction = e);
  }
  get element() {
    return this._element;
  }
  get tabsListElement() {
    return this.tabs.tabsListElement;
  }
  constructor(e, t) {
    super(), this.accessor = e, this.group = t, this._hidden = !1, this._direction = "horizontal", this._dropIndexResolver = (i, o) => o, this._pinnedRow = void 0, this.dropdownPart = null, this._overflowTabs = [], this._overflowTabGroups = [], this._overflowPinnedTabs = [], this._dropdownDisposable = new j(), this._onDrop = new D(), this.onDrop = this._onDrop.event, this._onGroupDragStart = new D(), this.onGroupDragStart = this._onGroupDragStart.event, this._onWillShowOverlay = new D(), this.onWillShowOverlay = this._onWillShowOverlay.event, this._element = document.createElement("div"), this._element.className = "dv-tabs-and-actions-container", z(this._element, "dv-full-width-single-tab", this.accessor.options.singleTabMode === "fullwidth"), this.rightActionsContainer = document.createElement("div"), this.rightActionsContainer.className = "dv-right-actions-container", this.leftActionsContainer = document.createElement("div"), this.leftActionsContainer.className = "dv-left-actions-container", this.preActionsContainer = document.createElement("div"), this.preActionsContainer.className = "dv-pre-actions-container", this.tabs = new fn(t, e, { showTabsOverflowControl: !e.options.disableTabsOverflowList }), this.voidContainer = new sn(this.accessor, this.group), this.tabs.voidContainer = this.voidContainer.element, this._element.appendChild(this.preActionsContainer), this._element.appendChild(this.tabs.element), this._element.appendChild(this.leftActionsContainer), this._element.appendChild(this.voidContainer.element), this._element.appendChild(this.rightActionsContainer), this.tabs.setExtendedDropZone(this._element), this.addDisposables(this.tabs.onDrop((i) => this._onDrop.fire(i)), this.tabs.onWillShowOverlay((i) => this._onWillShowOverlay.fire(i)), e.onDidOptionsChange(() => {
      this.tabs.showTabsOverflowControl = !e.options.disableTabsOverflowList;
    }), this.tabs.onOverflowTabsChange((i) => {
      this.toggleDropdown(i);
    }), this.tabs, this._onWillShowOverlay, this._onDrop, this._onGroupDragStart, this.voidContainer, this.voidContainer.onDragStart((i) => {
      this._onGroupDragStart.fire({
        nativeEvent: i,
        group: this.group
      });
    }), this.voidContainer.onDrop((i) => {
      this.tabs.handleVoidDrop() || this._onDrop.fire({
        event: i.nativeEvent,
        index: this.tabs.size
      });
    }), this.voidContainer.onWillShowOverlay((i) => {
      this._onWillShowOverlay.fire(new Fe(i, {
        kind: "header_space",
        panel: this.group.activePanel,
        api: this.accessor.api,
        group: this.group,
        getData: W
      }));
    }), T(this.leftActionsContainer, "dragleave", (i) => {
      const o = i.relatedTarget;
      !this.leftActionsContainer.contains(o) && !this._element.contains(o) && this.tabs.clearExternalAnimState();
    }), T(this.voidContainer.element, "dragleave", (i) => {
      const o = i.relatedTarget;
      this.voidContainer.element.contains(o) || (this._element.contains(o) ? this.tabs.setExternalInsertionIndex(null) : this.tabs.clearExternalAnimState());
    }), T(this.voidContainer.element, "pointerdown", (i) => {
      if (!i.defaultPrevented && !this.accessor.options.disableFloatingGroups && i.shiftKey && this.group.api.location.type !== "floating" && this.group.api.location.type !== "edge") {
        i.preventDefault();
        const { top: o, left: r } = this.element.getBoundingClientRect(), { top: n, left: s } = this.accessor.element.getBoundingClientRect();
        this.accessor.addFloatingGroup(this.group, {
          x: r - s + 20,
          y: o - n + 20,
          inDragMode: !0
        });
      }
    }));
  }
  show() {
    this.hidden || (this.element.style.display = "");
  }
  hide() {
    this._element.style.display = "none";
  }
  setRightActionsElement(e) {
    this.rightActions !== e && (this.rightActions && (this.rightActions.remove(), this.rightActions = void 0), e && (this.rightActionsContainer.appendChild(e), this.rightActions = e));
  }
  setLeftActionsElement(e) {
    this.leftActions !== e && (this.leftActions && (this.leftActions.remove(), this.leftActions = void 0), e && (this.leftActionsContainer.appendChild(e), this.leftActions = e));
  }
  setPrefixActionsElement(e) {
    this.preActions !== e && (this.preActions && (this.preActions.remove(), this.preActions = void 0), e && (this.preActionsContainer.appendChild(e), this.preActions = e));
  }
  isActive(e) {
    return this.tabs.isActive(e);
  }
  indexOf(e) {
    return this.tabs.indexOf(e);
  }
  getTabId(e) {
    return this.tabs.getTabId(e);
  }
  getPanelForTab(e) {
    return this.tabs.getPanelForTab(e);
  }
  setActive(e) {
  }
  delete(e) {
    this.tabs.delete(e), this.updateClassnames();
  }
  setActivePanel(e) {
    this.tabs.setActivePanel(e);
  }
  focusActiveTab() {
    this.tabs.focusActiveTab();
  }
  openPanel(e, t = this.tabs.size) {
    this.tabs.openPanel(e, t), this.updateClassnames();
  }
  closePanel(e) {
    this.delete(e.id);
  }
  setOverflowExclude(e) {
    this.tabs.setOverflowExclude(e);
  }
  setForcedOverflow(e) {
    this.tabs.setForcedOverflow(e);
  }
  setPinnedSticky(e) {
    this.tabs.setPinnedSticky(e);
  }
  refreshOverflow() {
    this.tabs.refreshOverflow();
  }
  setPinnedRow(e) {
    this._pinnedRow !== e && (this._pinnedRow && this._pinnedRow.remove(), this._pinnedRow = e, e && (e.classList.add("dv-pinned-row"), this._element.insertBefore(e, this._element.firstChild)), z(this._element, "dv-tabs-and-actions-container--pinned-row", !!e));
  }
  setDropIndexResolver(e) {
    this._dropIndexResolver = e;
  }
  resolveDropIndex(e, t) {
    return this._dropIndexResolver(e, t);
  }
  updateClassnames() {
    z(this._element, "dv-single-tab", this.size === 1);
  }
  toggleDropdown(e) {
    const t = e.reset ? [] : e.tabs, i = e.reset ? [] : e.tabGroups, o = e.reset ? [] : e.pinnedTabs;
    this._overflowTabs = t, this._overflowTabGroups = i, this._overflowPinnedTabs = o;
    const r = this._overflowTabs.length + this._overflowPinnedTabs.length;
    if (r > 0 && this.dropdownPart) {
      this.dropdownPart.update({ tabs: r });
      return;
    }
    if (r === 0) {
      this._dropdownDisposable.dispose();
      return;
    }
    const n = document.createElement("div");
    n.className = "dv-tabs-overflow-dropdown-root";
    const s = _n();
    s.update({ tabs: r }), this.dropdownPart = s, n.appendChild(s.element), this.rightActionsContainer.prepend(n), this._dropdownDisposable.value = new I($.from(() => {
      var a, d;
      n.remove(), (a = this.dropdownPart) === null || a === void 0 || (d = a.dispose) === null || d === void 0 || d.call(a), this.dropdownPart = null;
    }), T(n, "pointerdown", (a) => {
      a.preventDefault();
    }, { capture: !0 }), T(n, "click", (a) => {
      const d = po(n), c = {
        x: a.clientX,
        y: a.clientY,
        zIndex: d?.style.zIndex ? `calc(${d.style.zIndex} * 2)` : void 0
      }, { context: l, rowRenderers: h } = this.createOverflowRenderContext(n, c), v = this.accessor.advancedOverflowService;
      try {
        v ? v.renderOverflow({
          group: this.group,
          overflowTabs: [...this._overflowTabs],
          overflowTabGroups: [...this._overflowTabGroups],
          pinnedOverflowTabs: [...this._overflowPinnedTabs],
          context: l
        }) : l.open(this.renderFreeOverflowList(l));
      } catch (p) {
        throw h.dispose(), p;
      }
    }));
  }
  /**
  * Build the core row/header builders + popover control shared by the free
  * overflow list and the advanced overflow module. Everything the module
  * needs to rebuild the dropdown body in a custom order lives here, so the
  * row DOM, group-header DOM, click-to-activate, and (critically) the
  * window-bound popover open/close stay in core, so the module never captures
  * the wrong `window` for a popped-out group.
  */
  createOverflowRenderContext(e, t) {
    const i = new Set(this._overflowTabGroups), o = this.group.model.getTabGroups(), r = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map();
    for (const c of o)
      if (n.set(c.id, c), i.has(c.id)) for (const l of c.panelIds) r.set(l, c);
    const s = () => this.accessor.getPopupServiceForGroup(this.group), a = new I(), d = (c) => {
      const l = document.createElement("div");
      l.className = "dv-tabs-overflow-group-header";
      const h = document.createElement("span");
      h.className = "dv-tabs-overflow-group-color", Zt(h, c.color, this.accessor.tabGroupColorPalette), l.appendChild(h);
      const v = document.createElement("span");
      if (v.className = "dv-tabs-overflow-group-label", v.textContent = c.label || c.id, l.appendChild(v), c.collapsed) {
        const p = document.createElement("span");
        p.className = "dv-tabs-overflow-group-collapsed-badge", p.textContent = `${c.panelIds.length}`, l.appendChild(p);
      }
      return l.addEventListener("click", () => {
        s().close(), c.collapsed && c.expand();
        const p = c.panelIds[0];
        if (p) {
          const u = this.group.panels.find((g) => g.id === p);
          this.accessor.withOrigin("user", () => u?.api.setActive());
        }
      }), l;
    };
    return {
      context: {
        overflowGroupIdForPanel: (c) => {
          var l;
          return (l = r.get(c)) === null || l === void 0 ? void 0 : l.id;
        },
        buildGroupHeader: (c) => {
          const l = n.get(c);
          if (!(!l || !i.has(l.id)))
            return d(l);
        },
        buildPinnedHeader: () => {
          const c = document.createElement("div");
          c.className = "dv-tabs-overflow-group-header dv-tabs-overflow-pinned-header";
          const l = Ao();
          l.classList.add("dv-tabs-overflow-pinned-icon"), c.appendChild(l);
          const h = document.createElement("span");
          return h.className = "dv-tabs-overflow-group-label", h.textContent = "Pinned", c.appendChild(h), c;
        },
        buildRow: (c) => {
          const l = this.group.panels.find((y) => y.id === c);
          if (!l) return;
          const h = this.tabs.tabs.find((y) => y.panel.id === c), v = r.get(c), p = l.view.createTabRenderer("headerOverflow");
          let u = !1;
          const g = $.from(() => {
            if (!u) {
              var y;
              u = !0, (y = p.dispose) === null || y === void 0 || y.call(p);
            }
          });
          a.isDisposed ? g.dispose() : a.addDisposables(g);
          const _ = p.element, C = document.createElement("div");
          z(C, "dv-tab", !0), z(C, "dv-active-tab", l.api.isActive), z(C, "dv-inactive-tab", !l.api.isActive), v && z(C, "dv-tab--grouped", !0);
          const k = () => {
            v?.collapsed && v.expand(), h?.element.scrollIntoView({
              block: "nearest",
              inline: "nearest"
            }), this.accessor.withOrigin("user", () => l.api.setActive());
          };
          return C.addEventListener("click", (y) => {
            s().close(), !y.defaultPrevented && k();
          }), C.appendChild(_), {
            element: C,
            panel: l,
            activate: () => {
              s().close(), k();
            },
            dispose: () => {
              a.removeDisposable(g), g.dispose();
            }
          };
        },
        open: (c) => {
          s().openPopover(c, t, { onClose: () => a.dispose() });
        },
        close: () => s().close(),
        focusTrigger: () => {
          e.tabIndex = -1, e.focus();
        }
      },
      rowRenderers: a
    };
  }
  /**
  * The free (module-absent) overflow list: the flat `.dv-tabs-overflow-container`
  * body with a group header before the first member tab of each overflow
  * group, in tab (DOM) order. Reuses the shared row/header builders so it
  * stays identical to the advanced path's per-row DOM.
  */
  renderFreeOverflowList(e) {
    const t = document.createElement("div");
    t.style.overflow = "auto", t.className = "dv-tabs-overflow-container";
    const i = this._overflowPinnedTabs.map((r) => e.buildRow(r)).filter((r) => r != null);
    if (i.length > 0) {
      t.appendChild(e.buildPinnedHeader());
      for (const r of i) t.appendChild(r.element);
    }
    const o = /* @__PURE__ */ new Set();
    for (const r of this.tabs.tabs.filter((n) => this._overflowTabs.includes(n.panel.id))) {
      const n = e.overflowGroupIdForPanel(r.panel.id);
      if (n && !o.has(n)) {
        o.add(n);
        const a = e.buildGroupHeader(n);
        a && t.appendChild(a);
      }
      const s = e.buildRow(r.panel.id);
      s && t.appendChild(s.element);
    }
    return t;
  }
  updateDragAndDropState() {
    this.tabs.updateDragAndDropState(), this.voidContainer.updateDragAndDropState();
  }
  updateTabGroups() {
    this.tabs.updateTabGroups();
  }
  refreshTabGroupAccent() {
    this.tabs.refreshTabGroupAccent();
  }
}, xn = class extends I {
  get label() {
    return this._label;
  }
  get color() {
    return this._color;
  }
  get componentParams() {
    return this._componentParams;
  }
  setLabel(e) {
    this.isDisposed || this._label === e || (this._label = e, this._onDidChange.fire());
  }
  setColor(e) {
    if (this.isDisposed) return;
    const t = e === "" ? void 0 : e;
    this._color !== t && (this._color = t, this._onDidChange.fire());
  }
  setComponentParams(e) {
    this.isDisposed || (this._componentParams = e, this._onDidChange.fire());
  }
  get collapsed() {
    return this._collapsed;
  }
  get panelIds() {
    return this._panelIds;
  }
  get size() {
    return this._panelIds.length;
  }
  get isEmpty() {
    return this._panelIds.length === 0;
  }
  constructor(e, t) {
    var i, o;
    super(), this.id = e, this._collapsed = !1, this._panelIds = [], this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._onDidPanelChange = new D(), this.onDidPanelChange = this._onDidPanelChange.event, this._onDidCollapseChange = new D(), this.onDidCollapseChange = this._onDidCollapseChange.event, this._onDidDestroy = new D(), this.onDidDestroy = this._onDidDestroy.event, this._label = (i = t?.label) !== null && i !== void 0 ? i : "", this._color = t?.color === "" ? void 0 : t?.color, this._collapsed = (o = t?.collapsed) !== null && o !== void 0 ? o : !1, this._componentParams = t?.componentParams, this.addDisposables(this._onDidChange, this._onDidPanelChange, this._onDidCollapseChange, this._onDidDestroy);
  }
  addPanel(e, t) {
    if (this.isDisposed || this._panelIds.includes(e)) return;
    const i = t === void 0 ? this._panelIds.length : Math.max(0, Math.min(t, this._panelIds.length));
    this._panelIds.splice(i, 0, e), this._onDidPanelChange.fire({
      panelId: e,
      type: "add"
    });
  }
  removePanel(e) {
    if (this.isDisposed) return !1;
    const t = this._panelIds.indexOf(e);
    return t === -1 ? !1 : (this._panelIds.splice(t, 1), this._onDidPanelChange.fire({
      panelId: e,
      type: "remove"
    }), !0);
  }
  indexOfPanel(e) {
    return this._panelIds.indexOf(e);
  }
  containsPanel(e) {
    return this._panelIds.includes(e);
  }
  collapse() {
    this.isDisposed || this._collapsed || (this._collapsed = !0, this._onDidCollapseChange.fire(!0));
  }
  expand() {
    this.isDisposed || !this._collapsed || (this._collapsed = !1, this._onDidCollapseChange.fire(!1));
  }
  toggle() {
    this._collapsed ? this.expand() : this.collapse();
  }
  toJSON() {
    const e = {
      id: this.id,
      collapsed: this._collapsed,
      panelIds: [...this._panelIds]
    };
    return this._label && (e.label = this._label), this._color !== void 0 && (e.color = this._color), this._componentParams !== void 0 && (e.componentParams = this._componentParams), e;
  }
  dispose() {
    this._onDidDestroy.fire(), super.dispose();
  }
}, qt = class extends Ht {
  /**
  * `PointerEvent` for touch drags has no `dataTransfer`; use
  * `getData()` for the dockview payload regardless of input method.
  */
  get nativeEvent() {
    return this.options.nativeEvent;
  }
  get position() {
    return this.options.position;
  }
  get panel() {
    return this.options.panel;
  }
  get group() {
    return this.options.group;
  }
  get api() {
    return this.options.api;
  }
  constructor(e) {
    super(), this.options = e;
  }
  getData() {
    return this.options.getData();
  }
}, Wo = class extends qt {
  get kind() {
    return this._kind;
  }
  constructor(e) {
    super(e), this._kind = e.kind;
  }
}, yn = class extends I {
  get tabGroups() {
    return this._tabGroups;
  }
  get element() {
    throw new Error("dockview: not supported");
  }
  get activePanel() {
    return this._activePanel;
  }
  /** DOM id of the content container (the group's tabpanel), referenced by each tab's `aria-controls`. */
  get contentContainerId() {
    return this.contentContainer.element.id;
  }
  /** The group's content drop target; lets keyboard docking preview a drop here. */
  get contentDropTarget() {
    return this.contentContainer.dropTarget;
  }
  get locked() {
    return this._locked;
  }
  set locked(e) {
    this._locked = e, z(this.container, "dv-locked-groupview", e === "no-drop-target" || e);
  }
  get isActive() {
    return this._isGroupActive;
  }
  get panels() {
    return this._panels;
  }
  get size() {
    return this._panels.length;
  }
  get isEmpty() {
    return this._panels.length === 0;
  }
  get hasWatermark() {
    return !!(this.watermark && this.container.contains(this.watermark.element));
  }
  get header() {
    return this.tabsContainer;
  }
  /** The scrollable tab list element (`.dv-tabs-container`), exposed for the
  *  multi-row wrap controller to measure rows / toggle the wrap class. */
  get tabsListElement() {
    return this.tabsContainer.tabsListElement;
  }
  /** The panel whose tab owns `element` (the tab itself or a descendant of
  *  it), or `undefined` when the target isn't a tab. The robust inverse of a
  *  tab→panel lookup, with no positional/DOM-order assumptions. */
  getPanelForTab(e) {
    return this.tabsContainer.getPanelForTab(e);
  }
  get isContentFocused() {
    const e = this.contentContainer.element, t = Tt(e);
    return t ? St(t, e) : !1;
  }
  get headerPosition() {
    var e;
    return (e = this._headerPosition) !== null && e !== void 0 ? e : "top";
  }
  set headerPosition(e) {
    var t;
    this._headerPosition = e, this.invalidateHeaderSize(), le(this.container, "dv-groupview-header-top", "dv-groupview-header-bottom", "dv-groupview-header-left", "dv-groupview-header-right"), ce(this.container, `dv-groupview-header-${e}`);
    const i = e === "top" || e === "bottom" ? "horizontal" : "vertical", o = this._headerDirection;
    if (this._headerDirection = i, this.tabsContainer.direction = i, this.header.direction = i, !((t = this._activePanel) === null || t === void 0) && t.layout) {
      const { width: n, height: s } = this.contentDimensions();
      this._activePanel.layout(n, s);
    }
    if (this.updateHeaderActions(), o !== void 0 && o !== i) {
      var r;
      (r = this.groupPanel) === null || r === void 0 || r.api._onDidHeaderDirectionChange.fire({
        direction: i,
        position: e
      });
    }
  }
  get location() {
    return this._location;
  }
  set location(e) {
    this._location = e, z(this.container, "dv-groupview-floating", !1), z(this.container, "dv-groupview-popout", !1), z(this.container, "dv-groupview-edge", !1);
    const t = (i) => {
      this.contentContainer.dropTarget.setTargetZones(i), this.contentContainer.pointerDropTarget.setTargetZones(i);
    };
    switch (e.type) {
      case "grid":
        t([
          "top",
          "bottom",
          "left",
          "right",
          "center"
        ]);
        break;
      case "floating":
        t([
          "top",
          "bottom",
          "left",
          "right",
          "center"
        ]), z(this.container, "dv-groupview-floating", !0);
        break;
      case "popout":
        t([
          "top",
          "bottom",
          "left",
          "right",
          "center"
        ]), z(this.container, "dv-groupview-popout", !0);
        break;
      case "edge":
        t(["center"]), z(this.container, "dv-groupview-edge", !0);
        break;
    }
    this.groupPanel.api._onDidLocationChange.fire({ location: this.location });
  }
  constructor(e, t, i, o, r) {
    var n, s;
    super(), this.container = e, this.accessor = t, this.id = i, this.options = o, this.groupPanel = r, this._isGroupActive = !1, this._locked = !1, this._location = { type: "grid" }, this.mostRecentlyUsed = [], this._overwriteRenderContainer = null, this._overwriteDropTargetContainer = null, this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._width = 0, this._height = 0, this._panels = [], this._panelDisposables = /* @__PURE__ */ new Map(), this._tabGroupDisposables = /* @__PURE__ */ new Map(), this._pendingMicrotaskDisposables = /* @__PURE__ */ new Set(), this._onMove = new D(), this.onMove = this._onMove.event, this._onDidDrop = new D(), this.onDidDrop = this._onDidDrop.event, this._onWillDrop = new D(), this.onWillDrop = this._onWillDrop.event, this._onWillShowOverlay = new D(), this.onWillShowOverlay = this._onWillShowOverlay.event, this._onTabDragStart = new D(), this.onTabDragStart = this._onTabDragStart.event, this._onGroupDragStart = new D(), this.onGroupDragStart = this._onGroupDragStart.event, this._onDidAddPanel = new D(), this.onDidAddPanel = this._onDidAddPanel.event, this._onDidPanelTitleChange = new D(), this.onDidPanelTitleChange = this._onDidPanelTitleChange.event, this._onDidPanelParametersChange = new D(), this.onDidPanelParametersChange = this._onDidPanelParametersChange.event, this._onDidRemovePanel = new D(), this.onDidRemovePanel = this._onDidRemovePanel.event, this._onDidActivePanelChange = new D(), this.onDidActivePanelChange = this._onDidActivePanelChange.event, this._onUnhandledDragOver = new D(), this.onUnhandledDragOver = this._onUnhandledDragOver.event, this._tabGroups = [], this._tabGroupMap = /* @__PURE__ */ new Map(), this._panelToTabGroup = /* @__PURE__ */ new Map(), this._tabGroupIdCounter = 0, this._pendingTabGroupUpdate = !1, this._onDidCreateTabGroup = new D(), this.onDidCreateTabGroup = this._onDidCreateTabGroup.event, this._onDidDestroyTabGroup = new D(), this.onDidDestroyTabGroup = this._onDidDestroyTabGroup.event, this._onDidAddPanelToTabGroup = new D(), this.onDidAddPanelToTabGroup = this._onDidAddPanelToTabGroup.event, this._onDidRemovePanelFromTabGroup = new D(), this.onDidRemovePanelFromTabGroup = this._onDidRemovePanelFromTabGroup.event, this._onDidTabGroupChange = new D(), this.onDidTabGroupChange = this._onDidTabGroupChange.event, this._onDidTabGroupCollapsedChange = new D(), this.onDidTabGroupCollapsedChange = this._onDidTabGroupCollapsedChange.event, z(this.container, "dv-groupview", !0), this.container.setAttribute("role", "region"), this._api = new Ft(this.accessor), this.tabsContainer = new wn(this.accessor, this.groupPanel), this.contentContainer = new qr(this.accessor, this), e.append(this.tabsContainer.element, this.contentContainer.element), this.header.hidden = !!o.hideHeader, this.locked = (n = o.locked) !== null && n !== void 0 ? n : !1, this.headerPosition = (s = o.headerPosition) !== null && s !== void 0 ? s : t.defaultHeaderPosition, this.addDisposables(ke(this.tabsContainer.element, () => {
      if (this.isDisposed) return;
      const a = this.measureHeaderSize();
      a !== this._cachedHeaderSize && (this._cachedHeaderSize = a, this.layout(this._width, this._height));
    }), this._onDidPanelTitleChange.event(() => this.updateAccessibleLabel()), this._onTabDragStart, this._onGroupDragStart, this._onWillShowOverlay, this.tabsContainer.onTabDragStart((a) => {
      this._onTabDragStart.fire(a);
    }), this.tabsContainer.onGroupDragStart((a) => {
      this._onGroupDragStart.fire(a);
    }), this.tabsContainer.onDrop((a) => {
      var d;
      const c = W(), l = (d = c?.panelId) !== null && d !== void 0 ? d : null, h = l ? this.tabsContainer.resolveDropIndex(l, a.index) : a.index;
      if (this.handleDropEvent("header", a.event, "center", h), l && a.targetTabGroupId) {
        const v = this._tabGroupMap.get(a.targetTabGroupId);
        let p;
        if (v) {
          const u = this._panels.findIndex((g) => g.id === l);
          if (u !== -1) {
            p = 0;
            for (const g of v.panelIds) this._panels.findIndex((_) => _.id === g) < u && p++;
          }
        }
        this.addPanelToTabGroup(a.targetTabGroupId, l, p);
      } else l && a.targetTabGroupId === null && this.removePanelFromTabGroup(l);
    }), this.contentContainer.onDidFocus(() => {
      this.accessor.doSetGroupActive(this.groupPanel);
    }), this.contentContainer.onDidBlur(() => {
    }), this.contentContainer.dropTarget.onDrop((a) => {
      this.handleDropEvent("content", a.nativeEvent, a.position, void 0, a.edge);
    }), this.contentContainer.pointerDropTarget.onDrop((a) => {
      this.handleDropEvent("content", a.nativeEvent, a.position, void 0, a.edge);
    }), this.tabsContainer.onWillShowOverlay((a) => {
      this._onWillShowOverlay.fire(a);
    }), this.contentContainer.dropTarget.onWillShowOverlay((a) => {
      this._onWillShowOverlay.fire(new Fe(a, {
        kind: "content",
        panel: this.activePanel,
        api: this._api,
        group: this.groupPanel,
        getData: W
      }));
    }), this.contentContainer.pointerDropTarget.onWillShowOverlay((a) => {
      this._onWillShowOverlay.fire(new Fe(a, {
        kind: "content",
        panel: this.activePanel,
        api: this._api,
        group: this.groupPanel,
        getData: W
      }));
    }), this._onMove, this._onDidChange, this._onDidDrop, this._onWillDrop, this._onDidAddPanel, this._onDidRemovePanel, this._onDidActivePanelChange, this._onUnhandledDragOver, this._onDidPanelTitleChange, this._onDidPanelParametersChange, this._onDidCreateTabGroup, this._onDidDestroyTabGroup, this._onDidAddPanelToTabGroup, this._onDidRemovePanelFromTabGroup, this._onDidTabGroupChange, this._onDidTabGroupCollapsedChange, this._onDidCreateTabGroup.event(() => {
      this._scheduleTabGroupUpdate();
    }), this._onDidDestroyTabGroup.event(() => {
      this._scheduleTabGroupUpdate();
    }), this._onDidAddPanelToTabGroup.event(() => {
      this._scheduleTabGroupUpdate();
    }), this._onDidRemovePanelFromTabGroup.event(() => {
      this._scheduleTabGroupUpdate();
    }), this._onDidTabGroupChange.event(() => {
      this._scheduleTabGroupUpdate();
    }), this._onDidTabGroupCollapsedChange.event(() => {
      this._scheduleTabGroupUpdate();
    }));
  }
  _scheduleTabGroupUpdate() {
    this._pendingTabGroupUpdate || (this._pendingTabGroupUpdate = !0, queueMicrotask(() => {
      this._pendingTabGroupUpdate = !1, this.isDisposed || this.tabsContainer.updateTabGroups();
    }));
  }
  /**
  * Bracket a tab-group mutation as a layout transaction. `accessor` is
  * always a full {@link DockviewComponent} in production; the optional-call
  * fallback keeps partial test doubles (which omit `mutation`) working.
  * When nested inside a larger operation (a drag-driven move, fromJSON
  * restore) the component's depth counter folds it into the outer one.
  */
  _bracketTabGroupMutation(e) {
    return this.accessor.mutation ? this.accessor.mutation("tab-group", e) : e();
  }
  createTabGroup(e) {
    return this._bracketTabGroupMutation(() => this._doCreateTabGroup(e));
  }
  _doCreateTabGroup(e) {
    var t;
    const i = (t = e?.id) !== null && t !== void 0 ? t : `tg-${this.id}-${this._tabGroupIdCounter++}`, o = new xn(i, {
      label: e?.label,
      color: e?.color,
      collapsed: e?.collapsed,
      componentParams: e?.componentParams
    });
    return this._tabGroups.push(o), this._tabGroupMap.set(i, o), this._tabGroupDisposables.set(i, new I(o.onDidChange(() => {
      this._onDidTabGroupChange.fire({ tabGroup: o });
    }), o.onDidCollapseChange((r) => {
      r ? this._handleGroupCollapse(o) : this._handleGroupExpand(o), this._onDidTabGroupCollapsedChange.fire({ tabGroup: o });
    }), o.onDidDestroy(() => {
      this._removeTabGroupInternal(o);
    }))), this._onDidCreateTabGroup.fire({ tabGroup: o }), o;
  }
  dissolveTabGroup(e) {
    const t = this._tabGroupMap.get(e);
    t && this._bracketTabGroupMutation(() => {
      const i = [...t.panelIds];
      for (const o of i)
        t.removePanel(o), this._panelToTabGroup.delete(o), this._onDidRemovePanelFromTabGroup.fire({
          tabGroup: t,
          panelId: o
        });
      t.dispose();
    });
  }
  addPanelToTabGroup(e, t, i) {
    const o = this._tabGroupMap.get(e);
    if (!o || !this._panels.some((n) => n.id === t)) return;
    const r = this.getTabGroupForPanel(t);
    r?.id !== e && this._bracketTabGroupMutation(() => {
      r && this.removePanelFromTabGroup(t), o.addPanel(t, i), this._panelToTabGroup.set(t, o), this._enforceContiguity(o, t), this._onDidAddPanelToTabGroup.fire({
        tabGroup: o,
        panelId: t
      });
    });
  }
  /**
  * Move a panel to a new index within its tab group.
  * Updates both the group's panelIds order and the flat _panels array.
  */
  movePanelWithinGroup(e, t, i) {
    const o = this._tabGroupMap.get(e);
    o?.containsPanel(t) && (o.removePanel(t), o.addPanel(t, i), this._enforceContiguity(o, t), this.tabsContainer.updateTabGroups());
  }
  /**
  * Move a panel from one tab group to another.
  */
  movePanelBetweenGroups(e, t, i) {
    const o = this._findTabGroupForPanel(e), r = this._tabGroupMap.get(t);
    r && (o && (o.removePanel(e), this._panelToTabGroup.delete(e), this._onDidRemovePanelFromTabGroup.fire({
      tabGroup: o,
      panelId: e
    }), o.isEmpty && o.dispose()), r.addPanel(e, i), this._panelToTabGroup.set(e, r), this._enforceContiguity(r, e), this._onDidAddPanelToTabGroup.fire({
      tabGroup: r,
      panelId: e
    }));
  }
  /**
  * Move an entire tab group to a new position in the tab bar.
  * The group's internal panel order is preserved.
  */
  moveTabGroup(e, t) {
    const i = this._tabGroupMap.get(e);
    if (!i || i.panelIds.length === 0) return;
    const o = new Set(i.panelIds), r = i.panelIds.map((d) => this._panels.find((c) => c.id === d)).filter((d) => d !== void 0);
    if (r.length === 0) return;
    let n = 0;
    for (let d = 0; d < Math.min(t, this._panels.length); d++) o.has(this._panels[d].id) && n++;
    for (const d of r) {
      const c = this._panels.indexOf(d);
      c !== -1 && this._panels.splice(c, 1);
    }
    const s = t - n, a = Math.max(0, Math.min(s, this._panels.length));
    this._panels.splice(a, 0, ...r);
    for (const d of this._panels) this.tabsContainer.delete(d.id);
    for (let d = 0; d < this._panels.length; d++) this.tabsContainer.openPanel(this._panels[d], d);
    this.tabsContainer.updateTabGroups();
  }
  /**
  * Ensure a panel is at the correct global index in _panels
  * to maintain contiguity of its tab group members.
  */
  _enforceContiguity(e, t) {
    const i = this._panels.find((a) => a.id === t);
    if (!i) return;
    const o = e.indexOfPanel(t), r = this._computeGlobalIndex(e, o), n = this._panels.indexOf(i);
    if (n === r) return;
    this._panels.splice(n, 1);
    const s = r > n ? r - 1 : r;
    this._panels.splice(s, 0, i), this.tabsContainer.delete(t), this.tabsContainer.openPanel(i, s);
  }
  /**
  * Compute the global index in _panels for a group-local index.
  * Finds where the group's panels start in the flat array and offsets.
  */
  _computeGlobalIndex(e, t) {
    const i = e.panelIds;
    if (i.length <= 1) {
      const o = this._panels.find((r) => r.id === i[0]);
      return o ? this._panels.indexOf(o) : this._panels.length;
    }
    for (let o = 0; o < i.length; o++) {
      if (o === t) continue;
      const r = this._panels.find((n) => n.id === i[o]);
      if (r) {
        const n = this._panels.indexOf(r);
        return Math.max(0, n + (t - o));
      }
    }
    return this._panels.length;
  }
  removePanelFromTabGroup(e) {
    const t = this._findTabGroupForPanel(e);
    t && this._bracketTabGroupMutation(() => {
      t.removePanel(e), this._panelToTabGroup.delete(e), this._onDidRemovePanelFromTabGroup.fire({
        tabGroup: t,
        panelId: e
      }), t.isEmpty && t.dispose();
    });
  }
  getTabGroups() {
    return this._tabGroups;
  }
  updateTabGroups() {
    this.tabsContainer.updateTabGroups();
  }
  refreshTabGroupAccent() {
    this.tabsContainer.refreshTabGroupAccent();
  }
  refreshWatermark() {
    if (this.watermark) {
      var e, t;
      this.watermark.element.remove(), (e = (t = this.watermark).dispose) === null || e === void 0 || e.call(t), this.watermark = void 0;
    }
    this.updateContainer();
  }
  getTabGroupForPanel(e) {
    return this._findTabGroupForPanel(e);
  }
  _findTabGroupForPanel(e) {
    return this._panelToTabGroup.get(e);
  }
  _removeTabGroupInternal(e) {
    const t = this._tabGroups.indexOf(e);
    if (t !== -1) {
      this._tabGroups.splice(t, 1), this._tabGroupMap.delete(e.id);
      for (const o of e.panelIds) this._panelToTabGroup.delete(o);
      this._onDidDestroyTabGroup.fire({ tabGroup: e });
      const i = this._tabGroupDisposables.get(e.id);
      this._tabGroupDisposables.delete(e.id), i && (this._pendingMicrotaskDisposables.add(i), queueMicrotask(() => {
        this._pendingMicrotaskDisposables.delete(i), i.dispose();
      }));
    }
  }
  _handleGroupCollapse(e) {
    if (!this._activePanel || !e.containsPanel(this._activePanel.id)) return;
    const t = this._panels.indexOf(this._activePanel);
    for (let i = t + 1; i < this._panels.length; i++) {
      const o = this._panels[i], r = this._findTabGroupForPanel(o.id);
      if (!r?.collapsed) {
        this.doSetActivePanel(o), this.updateContainer();
        return;
      }
    }
    for (let i = t - 1; i >= 0; i--) {
      const o = this._panels[i], r = this._findTabGroupForPanel(o.id);
      if (!r?.collapsed) {
        this.doSetActivePanel(o), this.updateContainer();
        return;
      }
    }
    this.contentContainer.closePanel(), this.doSetActivePanel(void 0), this.updateContainer();
  }
  _handleGroupExpand(e) {
    if (this._activePanel) return;
    const t = e.panelIds[0];
    if (t) {
      const i = this._panels.find((o) => o.id === t);
      i && (this.doSetActivePanel(i), this.updateContainer());
    }
  }
  /** Restore tab groups from serialized data (used by fromJSON) */
  restoreTabGroups(e) {
    for (const t of e) {
      const i = /-(\d+)$/.exec(t.id);
      if (i) {
        const o = Number.parseInt(i[1], 10) + 1;
        o > this._tabGroupIdCounter && (this._tabGroupIdCounter = o);
      }
    }
    for (const t of e) {
      const i = this.createTabGroup({
        id: t.id,
        label: t.label,
        color: t.color,
        componentParams: t.componentParams
      }), o = this._tabGroupMap.get(i.id);
      for (const r of t.panelIds) this._panels.some((n) => n.id === r) && (i.addPanel(r), this._panelToTabGroup.set(r, o), this._enforceContiguity(o, r));
      t.collapsed && i.collapse(), i.isEmpty && i.dispose();
    }
  }
  focusContent() {
    this.contentContainer.element.focus();
  }
  focusActiveTab() {
    this.tabsContainer.focusActiveTab();
  }
  set renderContainer(e) {
    if (this.panels.forEach((t) => {
      this.renderContainer.detatch(t);
    }), this._overwriteRenderContainer = e, this.panels.forEach((t) => {
      this.rerender(t);
    }), this._activePanel) {
      const { width: t, height: i } = this.contentDimensions();
      this._activePanel.layout(t, i);
    }
  }
  get renderContainer() {
    var e;
    return (e = this._overwriteRenderContainer) !== null && e !== void 0 ? e : this.accessor.overlayRenderContainer;
  }
  set dropTargetContainer(e) {
    this._overwriteDropTargetContainer = e;
  }
  get dropTargetContainer() {
    var e;
    return this._location.type === "floating" && this.accessor.rootDropTargetContainer.disabled ? this.accessor.floatingDropTargetContainer : (e = this._overwriteDropTargetContainer) !== null && e !== void 0 ? e : this.accessor.rootDropTargetContainer;
  }
  initialize() {
    this.options.panels && this.options.panels.forEach((e) => {
      this.doAddPanel(e);
    }), this.options.activePanel && this.openPanel(this.options.activePanel), this.setActive(this.isActive, !0), this.updateContainer(), this.updateHeaderActions();
  }
  updateHeaderActions() {
    var e;
    (e = this.accessor.headerActionsService) === null || e === void 0 || e.refresh(this.groupPanel);
  }
  attachHeaderAction(e, t) {
    switch (e) {
      case "left":
        this.tabsContainer.setLeftActionsElement(t);
        break;
      case "right":
        this.tabsContainer.setRightActionsElement(t);
        break;
      case "prefix":
        this.tabsContainer.setPrefixActionsElement(t);
        break;
    }
  }
  rerender(e) {
    this.contentContainer.renderPanel(e, { asActive: !1 });
  }
  indexOf(e) {
    return this.tabsContainer.indexOf(e.id);
  }
  toJSON() {
    var e;
    const t = {
      views: this.tabsContainer.panels,
      activeView: (e = this._activePanel) === null || e === void 0 ? void 0 : e.id,
      id: this.id
    };
    return this.locked !== !1 && (t.locked = this.locked), this.header.hidden && (t.hideHeader = !0), this.headerPosition !== "top" && (t.headerPosition = this.headerPosition), this._tabGroups.length > 0 && (t.tabGroups = this._tabGroups.map((i) => i.toJSON())), t;
  }
  moveToNext(e) {
    var t, i, o;
    (t = e) !== null && t !== void 0 || (e = {}), (o = (i = e).panel) !== null && o !== void 0 || (i.panel = this.activePanel);
    const r = e.panel ? this.panels.indexOf(e.panel) : -1;
    let n;
    if (r < this.panels.length - 1) n = r + 1;
    else {
      if (e.suppressRoll) return;
      n = 0;
    }
    this.openPanel(this.panels[n]);
  }
  moveToPrevious(e) {
    var t, i, o;
    if ((t = e) !== null && t !== void 0 || (e = {}), (o = (i = e).panel) !== null && o !== void 0 || (i.panel = this.activePanel), !e.panel) return;
    const r = this.panels.indexOf(e.panel);
    let n;
    if (r > 0) n = r - 1;
    else {
      if (e.suppressRoll) return;
      n = this.panels.length - 1;
    }
    this.openPanel(this.panels[n]);
  }
  containsPanel(e) {
    return this.panels.includes(e);
  }
  init(e) {
  }
  update(e) {
  }
  focus() {
    var e;
    (e = this._activePanel) === null || e === void 0 || e.focus();
  }
  openPanel(e, t = {}) {
    (typeof t.index != "number" || t.index > this.panels.length) && (t.index = this.panels.length);
    const i = !!t.skipSetActive;
    if (e.updateParentGroup(this.groupPanel, { skipSetActive: t.skipSetActive }), this.doAddPanel(e, t.index, { skipSetActive: i }), this.invalidateHeaderSize(), this._activePanel === e) {
      this.contentContainer.renderPanel(e, { asActive: !0 });
      return;
    }
    i || this.doSetActivePanel(e), t.skipSetGroupActive || this.accessor.doSetGroupActive(this.groupPanel), t.skipSetActive || this.updateContainer();
  }
  removePanel(e, t) {
    const i = typeof e == "string" ? e : e.id, o = this._panels.find((r) => r.id === i);
    if (!o) throw new Error("invalid operation");
    return this._removePanel(o, t);
  }
  closeAllPanels() {
    if (this.panels.length > 0) {
      const e = [...this.panels];
      for (const t of e) this.doClose(t);
    } else this.accessor.removeGroup(this.groupPanel);
  }
  closePanel(e) {
    this.doClose(e);
  }
  doClose(e) {
    const t = this.panels.length === 1 && this.accessor.groups.length === 1;
    this.accessor.removePanel(e, t && this.accessor.options.noPanelsOverlay === "emptyGroup" ? { removeEmptyGroup: !1 } : void 0);
  }
  isPanelActive(e) {
    return this._activePanel === e;
  }
  updateActions(e) {
    this.tabsContainer.setRightActionsElement(e);
  }
  setActive(e, t = !1) {
    if (!this.isDisposed && !(!t && this.isActive === e)) {
      if (this._isGroupActive = e, z(this.container, "dv-active-group", e), z(this.container, "dv-inactive-group", !e), this.tabsContainer.setActive(this.isActive), !this._activePanel && this.panels.length > 0) {
        const i = this._panels.find((o) => {
          const r = this._findTabGroupForPanel(o.id);
          return !r?.collapsed;
        });
        i && this.doSetActivePanel(i);
      }
      this.updateContainer();
    }
  }
  layout(e, t) {
    var i;
    this._width = e, this._height = t;
    const { width: o, height: r } = this.contentDimensions();
    this.contentContainer.layout(o, r), !((i = this._activePanel) === null || i === void 0) && i.layout && this._activePanel.layout(o, r);
  }
  /**
  * Re-run the group's layout with its current dimensions. Used to propagate a
  * header-size change (e.g. a header that grew/shrank without the group box
  * changing) down to the content + active panel.
  */
  relayout() {
    this.invalidateHeaderSize(), this.layout(this._width, this._height);
  }
  /**
  * The dimensions available to the content/panel: the group box minus the
  * header along its axis. The header (`dv-tabs-and-actions-container`) is
  * laid out top/bottom (subtract its height) or left/right (subtract its
  * width); a hidden header has `display:none` so its `offset*` is 0 and
  * nothing is subtracted.
  */
  /**
  * Measure the header's extent along its occupied axis. This is the single
  * forced-reflow read; it now runs only on a cache miss (first layout after
  * a header change) and inside the header's ResizeObserver — not on every
  * layout frame.
  */
  measureHeaderSize() {
    const e = this.tabsContainer.element;
    return this.headerPosition === "top" || this.headerPosition === "bottom" ? e.offsetHeight : e.offsetWidth;
  }
  invalidateHeaderSize() {
    this._cachedHeaderSize = void 0;
  }
  contentDimensions() {
    var e;
    const t = this.headerPosition === "top" || this.headerPosition === "bottom", i = (e = this._cachedHeaderSize) !== null && e !== void 0 ? e : this._cachedHeaderSize = this.measureHeaderSize();
    return {
      width: t ? this._width : Math.max(0, this._width - i),
      height: t ? Math.max(0, this._height - i) : this._height
    };
  }
  _removePanel(e, t) {
    const i = this._activePanel === e;
    if (this.doRemovePanel(e), this.invalidateHeaderSize(), i && this.panels.length > 0) {
      const o = this.mostRecentlyUsed[0];
      this.openPanel(o, {
        skipSetActive: t?.skipSetActive,
        skipSetGroupActive: t?.skipSetActiveGroup
      });
    }
    return this._activePanel && this.panels.length === 0 && this.doSetActivePanel(void 0), t?.skipSetActive || this.updateContainer(), e;
  }
  doRemovePanel(e) {
    const t = this.panels.indexOf(e);
    if (this._activePanel === e && this.contentContainer.closePanel(), this.tabsContainer.delete(e.id), this._panels.splice(t, 1), this.mostRecentlyUsed.includes(e)) {
      const o = this.mostRecentlyUsed.indexOf(e);
      this.mostRecentlyUsed.splice(o, 1);
    }
    const i = this._panelDisposables.get(e.id);
    i && (i.dispose(), this._panelDisposables.delete(e.id)), this.removePanelFromTabGroup(e.id), this._onDidRemovePanel.fire({ panel: e });
  }
  doAddPanel(e, t = this.panels.length, i) {
    const o = this._panels.indexOf(e) > -1;
    this.tabsContainer.show(), this.contentContainer.show(), this.tabsContainer.openPanel(e, t), i?.skipSetActive ? e.api.renderer === "always" && this.contentContainer.renderPanel(e, { asActive: !1 }) : this.contentContainer.openPanel(e), !o && (this.updateMru(e), this.panels.splice(t, 0, e), this._panelDisposables.set(e.id, new I(e.api.onDidTitleChange((r) => this._onDidPanelTitleChange.fire(r)), e.api.onDidParametersChange((r) => this._onDidPanelParametersChange.fire(r)))), this._onDidAddPanel.fire({ panel: e }));
  }
  doSetActivePanel(e) {
    if (this._activePanel !== e) {
      if (this._activePanel = e, e) {
        var t, i, o;
        this.tabsContainer.setActivePanel(e), this.contentContainer.setLabelledBy(this.tabsContainer.getTabId(e.id)), this.contentContainer.openPanel(e);
        const { width: r, height: n } = this.contentDimensions();
        e.layout(r, n), this.updateMru(e), this.contentContainer.refreshFocusState(), this._onDidActivePanelChange.fire({
          panel: e,
          origin: (t = (i = (o = this.accessor).currentOrigin) === null || i === void 0 ? void 0 : i.call(o)) !== null && t !== void 0 ? t : "user"
        });
      }
      this.updateAccessibleLabel();
    }
  }
  /** Label the group region with its active panel's title (the WAI-ARIA region name). */
  updateAccessibleLabel() {
    var e;
    const t = (e = this._activePanel) === null || e === void 0 ? void 0 : e.title;
    t ? this.container.setAttribute("aria-label", t) : this.container.removeAttribute("aria-label");
  }
  updateMru(e) {
    this.mostRecentlyUsed.includes(e) && this.mostRecentlyUsed.splice(this.mostRecentlyUsed.indexOf(e), 1), this.mostRecentlyUsed = [e, ...this.mostRecentlyUsed];
  }
  updateContainer() {
    this.panels.forEach((o) => o.runEvents());
    const e = this.isEmpty || !this._activePanel;
    if (e && !this.watermark) {
      const o = this.accessor.createWatermarkComponent();
      o.init({
        containerApi: this._api,
        group: this.groupPanel
      }), this.watermark = o, T(this.watermark.element, "pointerdown", () => {
        this.isActive || this.accessor.doSetGroupActive(this.groupPanel);
      }), this.contentContainer.element.appendChild(this.watermark.element);
    }
    if (!e && this.watermark) {
      var t, i;
      this.watermark.element.remove(), (t = (i = this.watermark).dispose) === null || t === void 0 || t.call(i), this.watermark = void 0;
    }
  }
  canDisplayOverlay(e, t, i) {
    const o = new $o(e, i, t, W, this.accessor.getPanel(this.id));
    return this._onUnhandledDragOver.fire(o), o.isAccepted;
  }
  /**
  * Whether a content drop at `position` is allowed: the locked rules, the
  * shift-to-not-drop gesture, the same-component shortcut, then the
  * `canDisplayOverlay` veto. The single source of truth for the content drop
  * target (`content.ts`) and the compass cell gating (`canDropOnGroup`).
  */
  canDisplayContentOverlay(e, t) {
    if (this.locked === "no-drop-target" || this.locked && t === "center") return !1;
    const i = W();
    return !i && e.shiftKey && this.location.type !== "floating" ? !1 : i?.viewId === this.accessor.id ? !0 : this.canDisplayOverlay(e, t, "content");
  }
  handleDropEvent(e, t, i, o, r) {
    if (this.locked === "no-drop-target") return;
    if (e === "content" && r) {
      this.accessor.dockToLayoutEdge(t, i);
      return;
    }
    function n() {
      switch (e) {
        case "header":
          return typeof o == "number" ? "tab" : "header_space";
        case "content":
          return "content";
      }
    }
    const s = typeof o == "number" ? this.panels[o] : void 0, a = new Wo({
      nativeEvent: t,
      position: i,
      panel: s,
      getData: () => W(),
      kind: n(),
      group: this.groupPanel,
      api: this._api
    });
    if (this._onWillDrop.fire(a), a.defaultPrevented) return;
    const d = W();
    if (d?.viewId === this.accessor.id) {
      if (e === "content" && d.groupId === this.id && (i === "center" || d.panelId === null && !d.tabGroupId) || e === "header" && d.groupId === this.id && d.panelId === null && !d.tabGroupId)
        return;
      if (d.panelId === null) {
        const { groupId: h } = d;
        this._onMove.fire({
          target: i,
          groupId: h,
          index: o,
          tabGroupId: d.tabGroupId
        });
        return;
      }
      if (this.tabsContainer.indexOf(d.panelId) !== -1 && this.tabsContainer.size === 1) return;
      const { groupId: c, panelId: l } = d;
      if (this.id === c && !i && this.tabsContainer.indexOf(l) === o)
        return;
      this._onMove.fire({
        target: i,
        groupId: d.groupId,
        itemId: d.panelId,
        index: o
      });
    } else this._onDidDrop.fire(new qt({
      nativeEvent: t,
      position: i,
      panel: s,
      getData: () => W(),
      group: this.groupPanel,
      api: this._api
    }));
  }
  updateDragAndDropState() {
    this.tabsContainer.updateDragAndDropState();
  }
  dispose() {
    var e, t, i;
    super.dispose(), (e = this.watermark) === null || e === void 0 || e.element.remove(), (t = this.watermark) === null || t === void 0 || (i = t.dispose) === null || i === void 0 || i.call(t), this.watermark = void 0;
    for (const o of [...this._tabGroups]) o.dispose();
    for (const o of this._tabGroupDisposables.values()) o.dispose();
    this._tabGroupDisposables.clear();
    for (const o of this._pendingMicrotaskDisposables) o.dispose();
    this._pendingMicrotaskDisposables.clear();
    for (const o of this.panels) o.dispose();
    this.tabsContainer.dispose(), this.contentContainer.dispose();
  }
}, Kt = class extends Yr {
  constructor(e, t, i) {
    super(e, t), this._onDidConstraintsChangeInternal = new D(), this.onDidConstraintsChangeInternal = this._onDidConstraintsChangeInternal.event, this._onDidConstraintsChange = new D(), this.onDidConstraintsChange = this._onDidConstraintsChange.event, this._onDidSizeChange = new D(), this.onDidSizeChange = this._onDidSizeChange.event, this.addDisposables(this._onDidConstraintsChangeInternal, this._onDidConstraintsChange, this._onDidSizeChange), i && this.initialize(i);
  }
  setConstraints(e) {
    this._onDidConstraintsChangeInternal.fire(e);
  }
  setSize(e) {
    this._onDidSizeChange.fire(e);
  }
}, Dn = class extends jr {
  get priority() {
    return this._priority;
  }
  get snap() {
    return this._snap;
  }
  get minimumWidth() {
    return this.__minimumWidth();
  }
  get minimumHeight() {
    return this.__minimumHeight();
  }
  get maximumHeight() {
    return this.__maximumHeight();
  }
  get maximumWidth() {
    return this.__maximumWidth();
  }
  __minimumWidth() {
    const e = typeof this._minimumWidth == "function" ? this._minimumWidth() : this._minimumWidth;
    return e !== this._evaluatedMinimumWidth && (this._evaluatedMinimumWidth = e, this.updateConstraints()), e;
  }
  __maximumWidth() {
    const e = typeof this._maximumWidth == "function" ? this._maximumWidth() : this._maximumWidth;
    return e !== this._evaluatedMaximumWidth && (this._evaluatedMaximumWidth = e, this.updateConstraints()), e;
  }
  __minimumHeight() {
    const e = typeof this._minimumHeight == "function" ? this._minimumHeight() : this._minimumHeight;
    return e !== this._evaluatedMinimumHeight && (this._evaluatedMinimumHeight = e, this.updateConstraints()), e;
  }
  __maximumHeight() {
    const e = typeof this._maximumHeight == "function" ? this._maximumHeight() : this._maximumHeight;
    return e !== this._evaluatedMaximumHeight && (this._evaluatedMaximumHeight = e, this.updateConstraints()), e;
  }
  get isActive() {
    return this.api.isActive;
  }
  get isVisible() {
    return this.api.isVisible;
  }
  constructor(e, t, i, o) {
    super(e, t, o ?? new Kt(e, t)), this._evaluatedMinimumWidth = 0, this._evaluatedMaximumWidth = Number.MAX_SAFE_INTEGER, this._evaluatedMinimumHeight = 0, this._evaluatedMaximumHeight = Number.MAX_SAFE_INTEGER, this._minimumWidth = 0, this._minimumHeight = 0, this._maximumWidth = Number.MAX_SAFE_INTEGER, this._maximumHeight = Number.MAX_SAFE_INTEGER, this._snap = !1, this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, typeof i?.minimumWidth == "number" && (this._minimumWidth = i.minimumWidth), typeof i?.maximumWidth == "number" && (this._maximumWidth = i.maximumWidth), typeof i?.minimumHeight == "number" && (this._minimumHeight = i.minimumHeight), typeof i?.maximumHeight == "number" && (this._maximumHeight = i.maximumHeight), this.api.initialize(this), this.addDisposables(this.api.onWillVisibilityChange((r) => {
      const { isVisible: n } = r, { accessor: s } = this._params;
      s.setVisible(this, n);
    }), this.api.onActiveChange(() => {
      const { accessor: r } = this._params;
      r.doSetGroupActive(this);
    }), this.api.onDidConstraintsChangeInternal((r) => {
      (typeof r.minimumWidth == "number" || typeof r.minimumWidth == "function") && (this._minimumWidth = r.minimumWidth), (typeof r.minimumHeight == "number" || typeof r.minimumHeight == "function") && (this._minimumHeight = r.minimumHeight), (typeof r.maximumWidth == "number" || typeof r.maximumWidth == "function") && (this._maximumWidth = r.maximumWidth), (typeof r.maximumHeight == "number" || typeof r.maximumHeight == "function") && (this._maximumHeight = r.maximumHeight), this._onDidChange.fire(void 0);
    }), this.api.onDidSizeChange((r) => {
      this._onDidChange.fire({
        height: r.height,
        width: r.width
      });
    }), this._onDidChange);
  }
  setVisible(e) {
    this.api._onDidVisibilityChange.fire({ isVisible: e });
  }
  setActive(e) {
    this.api._onDidActiveChange.fire({ isActive: e });
  }
  init(e) {
    e.maximumHeight && (this._maximumHeight = e.maximumHeight), e.minimumHeight && (this._minimumHeight = e.minimumHeight), e.maximumWidth && (this._maximumWidth = e.maximumWidth), e.minimumWidth && (this._minimumWidth = e.minimumWidth), this._priority = e.priority, this._snap = !!e.snap, super.init(e), typeof e.isVisible == "boolean" && this.setVisible(e.isVisible);
  }
  updateConstraints() {
    this.api._onDidConstraintsChange.fire({
      minimumWidth: this._evaluatedMinimumWidth,
      maximumWidth: this._evaluatedMaximumWidth,
      minimumHeight: this._evaluatedMinimumHeight,
      maximumHeight: this._evaluatedMaximumHeight
    });
  }
  toJSON() {
    const e = super.toJSON(), t = (o) => o === Number.MAX_SAFE_INTEGER ? void 0 : o, i = (o) => o <= 0 ? void 0 : o;
    return O(O({}, e), {}, {
      minimumHeight: i(this.minimumHeight),
      maximumHeight: t(this.maximumHeight),
      minimumWidth: i(this.minimumWidth),
      maximumWidth: t(this.maximumWidth),
      snap: this.snap,
      priority: this.priority
    });
  }
};
const ae = "dockview: DockviewGroupPanelApiImpl not initialized";
var kn = class extends Kt {
  get location() {
    if (!this._group) throw new Error(ae);
    return this._group.model.location;
  }
  /**
  * The group's bounding box relative to the top-left of the dockview root,
  * in pixels. Covers grid and floating groups; returns `undefined` for a
  * popout group (it lives in a separate window). Reflects the live rendered
  * geometry, so it is only meaningful once the layout has been sized.
  */
  get boundingBox() {
    if (!this._group || this._group.model.location.type === "popout") return;
    const e = this.accessor.element.getBoundingClientRect(), t = this._group.element.getBoundingClientRect();
    return {
      left: t.left - e.left,
      top: t.top - e.top,
      width: t.width,
      height: t.height
    };
  }
  get locked() {
    if (!this._group) throw new Error(ae);
    return this._group.locked;
  }
  set locked(e) {
    if (!this._group) throw new Error(ae);
    this._group.locked = e;
  }
  constructor(e, t) {
    super(e, "__dockviewgroup__"), this.accessor = t, this._onDidLocationChange = new D(), this.onDidLocationChange = this._onDidLocationChange.event, this._onDidActivePanelChange = new D(), this.onDidActivePanelChange = this._onDidActivePanelChange.event, this._onDidCollapsedChange = new D(), this.onDidCollapsedChange = this._onDidCollapsedChange.event, this._onDidPeekChange = new D(), this.onDidPeekChange = this._onDidPeekChange.event, this._onDidHeaderDirectionChange = new D(), this.onDidHeaderDirectionChange = this._onDidHeaderDirectionChange.event, this.addDisposables(this._onDidLocationChange, this._onDidActivePanelChange, this._onDidCollapsedChange, this._onDidPeekChange, this._onDidHeaderDirectionChange, this._onDidVisibilityChange.event((i) => {
      i.isVisible && this._pendingSize && (super.setSize(this._pendingSize), this._pendingSize = void 0);
    }));
  }
  setSize(e) {
    this._pendingSize = O({}, e), super.setSize(e);
  }
  close() {
    if (this._group)
      return this.accessor.removeGroup(this._group);
  }
  getWindow() {
    return this.location.type === "popout" ? this.location.getWindow() : globalThis.window;
  }
  setHeaderPosition(e) {
    if (!this._group) throw new Error(ae);
    this._group.model.headerPosition = e;
  }
  getHeaderPosition() {
    if (!this._group) throw new Error(ae);
    return this._group.model.headerPosition;
  }
  moveTo(e) {
    if (!this._group) throw new Error(ae);
    this.accessor.withOrigin("api", () => {
      var t, i, o, r;
      const n = (t = e.group) !== null && t !== void 0 ? t : this.accessor.addGroup({
        direction: Ir((i = e.position) !== null && i !== void 0 ? i : "right"),
        skipSetActive: (o = e.skipSetActive) !== null && o !== void 0 ? o : !1
      });
      this.accessor.moveGroupOrPanel({
        from: { groupId: this._group.id },
        to: {
          group: n,
          position: e.group && (r = e.position) !== null && r !== void 0 ? r : "center",
          index: e.index
        },
        skipSetActive: e.skipSetActive
      });
    });
  }
  maximize() {
    if (!this._group) throw new Error(ae);
    this.location.type === "grid" && this.accessor.maximizeGroup(this._group);
  }
  isMaximized() {
    if (!this._group) throw new Error(ae);
    return this.accessor.isMaximizedGroup(this._group);
  }
  exitMaximized() {
    if (!this._group) throw new Error(ae);
    this.isMaximized() && this.accessor.exitMaximizedGroup();
  }
  collapse() {
    this._group && this.accessor.setEdgeGroupCollapsed(this._group, !0);
  }
  expand() {
    this._group && this.accessor.setEdgeGroupCollapsed(this._group, !1);
  }
  isCollapsed() {
    return this._group ? this.accessor.isEdgeGroupCollapsed(this._group) : !1;
  }
  isPeeking() {
    return this._group ? this.accessor.isEdgeGroupPeeking(this._group) : !1;
  }
  setAutoHide(e) {
    this._group && this.accessor.setEdgeGroupAutoHide(this._group, e);
  }
  isAutoHide() {
    return this._group ? this.accessor.isEdgeGroupAutoHide(this._group) : !1;
  }
  initialize(e) {
    this._group = e;
  }
};
const Cn = 100, Sn = 100;
var qe = class extends Dn {
  get minimumWidth() {
    var e;
    if (typeof this._explicitConstraints.minimumWidth == "number") return this._explicitConstraints.minimumWidth;
    const t = (e = this.activePanel) === null || e === void 0 ? void 0 : e.minimumWidth;
    return typeof t == "number" ? t : super.__minimumWidth();
  }
  get minimumHeight() {
    var e;
    if (typeof this._explicitConstraints.minimumHeight == "number") return this._explicitConstraints.minimumHeight;
    const t = (e = this.activePanel) === null || e === void 0 ? void 0 : e.minimumHeight;
    return typeof t == "number" ? t : super.__minimumHeight();
  }
  get maximumWidth() {
    var e;
    if (typeof this._explicitConstraints.maximumWidth == "number") return this._explicitConstraints.maximumWidth;
    const t = (e = this.activePanel) === null || e === void 0 ? void 0 : e.maximumWidth;
    return typeof t == "number" ? t : super.__maximumWidth();
  }
  get maximumHeight() {
    var e;
    if (typeof this._explicitConstraints.maximumHeight == "number") return this._explicitConstraints.maximumHeight;
    const t = (e = this.activePanel) === null || e === void 0 ? void 0 : e.maximumHeight;
    return typeof t == "number" ? t : super.__maximumHeight();
  }
  get panels() {
    return this._model.panels;
  }
  get activePanel() {
    return this._model.activePanel;
  }
  get size() {
    return this._model.size;
  }
  get model() {
    return this._model;
  }
  get locked() {
    return this._model.locked;
  }
  set locked(e) {
    this._model.locked = e;
  }
  get header() {
    return this._model.header;
  }
  constructor(e, t, i) {
    var o, r, n, s, a, d;
    super(t, "groupview_default", {
      minimumHeight: (o = (r = i.constraints) === null || r === void 0 ? void 0 : r.minimumHeight) !== null && o !== void 0 ? o : Sn,
      minimumWidth: (n = (s = i.constraints) === null || s === void 0 ? void 0 : s.minimumWidth) !== null && n !== void 0 ? n : Cn,
      maximumHeight: (a = i.constraints) === null || a === void 0 ? void 0 : a.maximumHeight,
      maximumWidth: (d = i.constraints) === null || d === void 0 ? void 0 : d.maximumWidth
    }, new kn(t, e)), this._explicitConstraints = {}, this.api.initialize(this), this._model = new yn(this.element, e, t, i, this), this.addDisposables(this.model.onDidActivePanelChange((c) => {
      this.api._onDidActivePanelChange.fire(c);
    }), this.api.onDidConstraintsChangeInternal((c) => {
      c.minimumWidth !== void 0 && (this._explicitConstraints.minimumWidth = typeof c.minimumWidth == "function" ? c.minimumWidth() : c.minimumWidth), c.minimumHeight !== void 0 && (this._explicitConstraints.minimumHeight = typeof c.minimumHeight == "function" ? c.minimumHeight() : c.minimumHeight), c.maximumWidth !== void 0 && (this._explicitConstraints.maximumWidth = typeof c.maximumWidth == "function" ? c.maximumWidth() : c.maximumWidth), c.maximumHeight !== void 0 && (this._explicitConstraints.maximumHeight = typeof c.maximumHeight == "function" ? c.maximumHeight() : c.maximumHeight);
    }));
  }
  focus() {
    this.api.isActive || this.api.setActive(), super.focus();
  }
  initialize() {
    this._model.initialize();
  }
  setActive(e) {
    super.setActive(e), this.model.setActive(e);
  }
  layout(e, t) {
    super.layout(e, t), this.model.layout(e, t);
  }
  /**
  * Re-run the group's layout with its current dimensions, propagating a
  * header-size change down to the content + active panel.
  */
  relayout() {
    this.model.relayout();
  }
  getComponent() {
    return this._model;
  }
  toJSON() {
    return this.model.toJSON();
  }
};
const Gn = {
  className: "dockview-theme-abyss",
  tabGroupIndicator: "none"
};
var Pn = class extends Kt {
  get location() {
    return this.group.api.location;
  }
  get title() {
    return this.panel.title;
  }
  get isPinned() {
    return this.panel.isPinned;
  }
  get isGroupActive() {
    return this.group.isActive;
  }
  get renderer() {
    return this.panel.renderer;
  }
  set group(e) {
    const t = this._group;
    this._group !== e && (this._group = e, this._onDidGroupChange.fire({}), this.setupGroupEventListeners(t), this.fireLocationChange());
  }
  get group() {
    return this._group;
  }
  get tabComponent() {
    return this._tabComponent;
  }
  constructor(e, t, i, o, r) {
    super(e.id, o), this.panel = e, this.accessor = i, this._onDidTitleChange = new D(), this.onDidTitleChange = this._onDidTitleChange.event, this._onDidChangePinned = new D(), this.onDidChangePinned = this._onDidChangePinned.event, this._onDidActiveGroupChange = new D(), this.onDidActiveGroupChange = this._onDidActiveGroupChange.event, this._onDidGroupChange = new D(), this.onDidGroupChange = this._onDidGroupChange.event, this._onDidRendererChange = new D(), this.onDidRendererChange = this._onDidRendererChange.event, this._onDidLocationChange = new D(), this.onDidLocationChange = this._onDidLocationChange.event, this.groupEventsDisposable = new j(), this._tabComponent = r, this.initialize(e), this._group = t, this.setupGroupEventListeners(), this.addDisposables(this.groupEventsDisposable, this._onDidRendererChange, this._onDidTitleChange, this._onDidChangePinned, this._onDidGroupChange, this._onDidActiveGroupChange, this._onDidLocationChange);
  }
  getWindow() {
    return this.group.api.getWindow();
  }
  setActive() {
    this.accessor.withOrigin("api", () => super.setActive());
  }
  moveTo(e) {
    this.accessor.withOrigin("api", () => {
      var t, i;
      return this.accessor.moveGroupOrPanel({
        from: {
          groupId: this._group.id,
          panelId: this.panel.id
        },
        to: {
          group: (t = e.group) !== null && t !== void 0 ? t : this._group,
          position: e.group && (i = e.position) !== null && i !== void 0 ? i : "center",
          index: e.index
        },
        skipSetActive: e.skipSetActive
      });
    });
  }
  setTitle(e) {
    this.panel.setTitle(e);
  }
  setPinned(e) {
    this.accessor.setPanelPinned(this.panel, e);
  }
  setRenderer(e) {
    this.panel.setRenderer(e);
  }
  close() {
    this.group.model.closePanel(this.panel);
  }
  maximize() {
    this.group.api.maximize();
  }
  isMaximized() {
    return this.group.api.isMaximized();
  }
  exitMaximized() {
    this.group.api.exitMaximized();
  }
  /**
  * Report that this panel's location may have moved.
  *
  * A relocation touches the location more than once - the panel is
  * reparented into the destination group, then that group is tagged with
  * the location it ends up at - so the event is coalesced to the end of the
  * enclosing layout mutation and reports where the panel actually settled.
  * Firing each signal as it happened surfaced an intermediate `grid`
  * location the panel was never in, at a point where it was in neither
  * group's panel list. Outside a mutation this fires straight away.
  */
  fireLocationChange() {
    this.accessor.deferLocationChange(this, () => {
      this.isDisposed || this._onDidLocationChange.fire({ location: this.location });
    });
  }
  setupGroupEventListeners(e) {
    var t;
    let i = (t = e?.isActive) !== null && t !== void 0 ? t : !1;
    this.groupEventsDisposable.value = new I(this.group.api.onDidVisibilityChange((o) => {
      const r = !o.isVisible && this.isVisible, n = o.isVisible && !this.isVisible, s = this.group.model.isPanelActive(this.panel);
      (r || n && s) && this._onDidVisibilityChange.fire(o);
    }), this.group.api.onDidLocationChange(() => {
      this.group === this.panel.group && this.fireLocationChange();
    }), this.group.api.onDidActiveChange(() => {
      this.group === this.panel.group && i !== this.isGroupActive && (i = this.isGroupActive, this._onDidActiveGroupChange.fire({ isActive: this.isGroupActive }));
    }));
  }
}, Ce = class extends I {
  get params() {
    return this._params;
  }
  get title() {
    return this._title;
  }
  get isPinned() {
    return this._pinned;
  }
  get group() {
    return this._group;
  }
  get renderer() {
    var e;
    return (e = this._renderer) !== null && e !== void 0 ? e : this.accessor.renderer;
  }
  get minimumWidth() {
    return this._minimumWidth;
  }
  get minimumHeight() {
    return this._minimumHeight;
  }
  get maximumWidth() {
    return this._maximumWidth;
  }
  get maximumHeight() {
    return this._maximumHeight;
  }
  constructor(e, t, i, o, r, n, s, a) {
    super(), this.id = e, this.accessor = o, this.containerApi = r, this.view = s, this._pinned = !1, this._renderer = a.renderer, this._group = n, this._minimumWidth = a.minimumWidth, this._minimumHeight = a.minimumHeight, this._maximumWidth = a.maximumWidth, this._maximumHeight = a.maximumHeight, this.api = new Pn(this, this._group, o, t, i), this.addDisposables(this.api.onActiveChange(() => {
      o.setActivePanel(this);
    }), this.api.onDidSizeChange((d) => {
      this.group.api.setSize(d);
    }), this.api.onDidRendererChange(() => {
      this.group.model.rerender(this);
    }));
  }
  init(e) {
    this._params = e.params, this.view.init(O(O({}, e), {}, {
      api: this.api,
      containerApi: this.containerApi
    })), this.setTitle(e.title);
  }
  focus() {
    const e = new To();
    this.api._onWillFocus.fire(e), !e.defaultPrevented && (this.api.isActive || this.api.setActive());
  }
  toJSON() {
    return {
      id: this.id,
      contentComponent: this.view.contentComponent,
      tabComponent: this.view.tabComponent,
      params: Object.keys(this._params || {}).length > 0 ? this._params : void 0,
      title: this.title,
      renderer: this._renderer,
      minimumHeight: this._minimumHeight,
      maximumHeight: this._maximumHeight,
      minimumWidth: this._minimumWidth,
      maximumWidth: this._maximumWidth,
      pinned: this._pinned ? !0 : void 0
    };
  }
  setTitle(e) {
    e !== this.title && (this._title = e, this.view.setTitle(e), this.api._onDidTitleChange.fire({ title: e }));
  }
  /**
  * Low-level pinned-state mutation. Sets the flag and fires the panel-api
  * event. The public, module-gated entry point is
  * `panel.api.setPinned` → `DockviewComponent.setPanelPinned`, which decides
  * whether pinning is active before reaching here; this method itself does
  * not gate, so the ordering module and serialization can drive it directly.
  */
  setPinned(e) {
    this._pinned !== e && (this._pinned = e, this.api._onDidChangePinned.fire({ isPinned: e }));
  }
  setRenderer(e) {
    e !== this.renderer && (this._renderer = e, this.api._onDidRendererChange.fire({ renderer: e }));
  }
  update(e) {
    this._params = O(O({}, this._params), e.params);
    for (const t of Object.keys(e.params)) e.params[t] === void 0 && delete this._params[t];
    this.view.update({ params: this._params });
  }
  updateFromStateModel(e) {
    var t, i, o, r, n;
    this._maximumHeight = e.maximumHeight, this._minimumHeight = e.minimumHeight, this._maximumWidth = e.maximumWidth, this._minimumWidth = e.minimumWidth, this._params = (t = e.params) !== null && t !== void 0 ? t : {}, this.view.update({ params: this._params }), this.setTitle((i = e.title) !== null && i !== void 0 ? i : this.id), this.setRenderer((o = e.renderer) !== null && o !== void 0 ? o : this.accessor.renderer), this.setPinned(((r = e.pinned) !== null && r !== void 0 ? r : !1) && !!(!((n = this.accessor.options.pinnedTabs) === null || n === void 0) && n.enabled));
  }
  updateParentGroup(e, t) {
    this._group = e, this.api.group = this._group;
    const i = this._group.model.isPanelActive(this), o = this.group.api.isActive && i;
    t?.skipSetActive || this.api.isActive !== o && this.api._onDidActiveChange.fire({ isActive: this.group.api.isActive && i }), this.api.isVisible !== i && this.api._onDidVisibilityChange.fire({ isVisible: i });
  }
  runEvents() {
    const e = this._group.model.isPanelActive(this), t = this.group.api.isActive && e;
    this.api.isActive !== t && this.api._onDidActiveChange.fire({ isActive: this.group.api.isActive && e }), this.api.isVisible !== e && this.api._onDidVisibilityChange.fire({ isVisible: e });
  }
  layout(e, t) {
    this.api._onDidDimensionChange.fire({
      width: e,
      height: t
    }), this.view.layout(e, t);
  }
  dispose() {
    this.api.dispose(), this.view.dispose();
  }
}, Di = class extends I {
  get element() {
    return this._element;
  }
  constructor() {
    super(), this._messages = dt, this._element = document.createElement("div"), this._element.className = "dv-default-tab", this._content = document.createElement("div"), this._content.className = "dv-default-tab-content", this.action = document.createElement("div"), this.action.className = "dv-default-tab-action", this.action.setAttribute("role", "button"), this.action.setAttribute("tabindex", "-1");
    const e = Kr();
    e.setAttribute("aria-hidden", "true"), this.action.appendChild(e), this._element.appendChild(this._content), this._element.appendChild(this.action), this.render();
  }
  init(e) {
    var t;
    this._title = e.title, this._messages = (t = e.containerApi.messages) !== null && t !== void 0 ? t : dt, this.addDisposables(e.api.onDidTitleChange((i) => {
      this._title = i.title, this.render();
    }), T(this.action, "pointerdown", (i) => {
      i.preventDefault();
    }), T(this.action, "click", (i) => {
      i.defaultPrevented || (i.preventDefault(), e.api.close());
    })), this.render();
  }
  render() {
    if (this._content.textContent !== this._title) {
      var e;
      this._content.textContent = (e = this._title) !== null && e !== void 0 ? e : "";
    }
    this.action.setAttribute("aria-label", this._title ? this._messages.closeTab(this._title) : this._messages.closeTabPlain());
  }
}, Ho = class {
  get content() {
    return this._content;
  }
  get tab() {
    return this._tab;
  }
  constructor(e, t, i, o) {
    this.accessor = e, this.id = t, this.contentComponent = i, this.tabComponent = o, this._content = this.createContentComponent(this.id, i), this._tab = this.createTabComponent(this.id, o);
  }
  createTabRenderer(e) {
    const t = this.createTabComponent(this.id, this.tabComponent);
    if (this._params && t.init(O(O({}, this._params), {}, { tabLocation: e })), this._updateEvent) {
      var i;
      (i = t.update) === null || i === void 0 || i.call(t, this._updateEvent);
    }
    return t;
  }
  init(e) {
    this._params = e, this.content.init(e), this.tab.init(O(O({}, e), {}, { tabLocation: "header" }));
  }
  setTitle(e) {
    this._params && (this._params.title = e);
  }
  layout(e, t) {
    var i, o;
    (i = (o = this.content).layout) === null || i === void 0 || i.call(o, e, t);
  }
  update(e) {
    var t, i, o, r;
    this._updateEvent = e, (t = (i = this.content).update) === null || t === void 0 || t.call(i, e), (o = (r = this.tab).update) === null || o === void 0 || o.call(r, e);
  }
  dispose() {
    var e, t, i, o;
    (e = (t = this.content).dispose) === null || e === void 0 || e.call(t), (i = (o = this.tab).dispose) === null || i === void 0 || i.call(o);
  }
  createContentComponent(e, t) {
    return this.accessor.options.createComponent({
      id: e,
      name: t
    });
  }
  createTabComponent(e, t) {
    const i = t ?? this.accessor.options.defaultTabComponent;
    if (i) {
      if (this.accessor.options.createTabComponent) {
        const o = this.accessor.options.createTabComponent({
          id: e,
          name: i
        });
        return o || new Di();
      }
      console.warn(`dockview: tabComponent '${t}' was not found. falling back to the default tab.`);
    }
    return new Di();
  }
}, zn = class {
  constructor(e) {
    this.accessor = e;
  }
  fromJSON(e, t) {
    var i, o, r;
    const n = e.id, s = e.params, a = e.title, d = e.view, c = d ? d.content.id : (i = e.contentComponent) !== null && i !== void 0 ? i : "unknown", l = d ? (o = d.tab) === null || o === void 0 ? void 0 : o.id : e.tabComponent, h = new Ho(this.accessor, n, c, l), v = new Ce(n, c, l, this.accessor, new Ft(this.accessor), t, h, {
      renderer: e.renderer,
      minimumWidth: e.minimumWidth,
      minimumHeight: e.minimumHeight,
      maximumWidth: e.maximumWidth,
      maximumHeight: e.maximumHeight
    });
    return v.init({
      title: a ?? n,
      params: s ?? {}
    }), e.pinned && (!((r = this.accessor.options.pinnedTabs) === null || r === void 0) && r.enabled) && v.setPinned(!0), v;
  }
}, Tn = class extends I {
  get element() {
    return this._element;
  }
  constructor() {
    super(), this._element = document.createElement("div"), this._element.className = "dv-watermark";
  }
  init(e) {
  }
}, An = class {
  constructor() {
    this._orderedList = [];
  }
  push(e) {
    this._orderedList = [...this._orderedList.filter((t) => t !== e), e], this.update();
  }
  destroy(e) {
    this._orderedList = this._orderedList.filter((t) => t !== e), this.update();
  }
  update() {
    for (let e = 0; e < this._orderedList.length; e++)
      this._orderedList[e].setAttribute("aria-level", `${e}`), this._orderedList[e].style.zIndex = `calc(var(--dv-overlay-z-index, 999) + ${e * 2})`;
  }
};
const Ke = new An();
var Jt = class fe extends I {
  set minimumInViewportWidth(t) {
    this.options.minimumInViewportWidth = t;
  }
  set minimumInViewportHeight(t) {
    this.options.minimumInViewportHeight = t;
  }
  get element() {
    return this._element;
  }
  get isVisible() {
    return this._isVisible;
  }
  /**
  * Height of the optional drag-handle header, or 0 when none is present.
  * Used to translate between the overlay's outer box and the content area
  * available to the group beneath the header.
  */
  get headerHeight() {
    var t, i;
    return (t = (i = this.options.header) === null || i === void 0 ? void 0 : i.offsetHeight) !== null && t !== void 0 ? t : 0;
  }
  constructor(t) {
    super(), this.options = t, this._element = document.createElement("div"), this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this._onDidChangeEnd = new D(), this.onDidChangeEnd = this._onDidChangeEnd.event, this._onDidStartMoving = new D(), this.onDidStartMoving = this._onDidStartMoving.event, this._dragMove = new j(), this._dragCancelled = !1, this.addDisposables(this._onDidChange, this._onDidChangeEnd, this._onDidStartMoving, this._dragMove), this._element.className = "dv-resize-container", this._element.setAttribute("role", "dialog"), this._element.setAttribute("aria-modal", "false"), this._isVisible = !0, this.setupResize("top"), this.setupResize("bottom"), this.setupResize("left"), this.setupResize("right"), this.setupResize("topleft"), this.setupResize("topright"), this.setupResize("bottomleft"), this.setupResize("bottomright"), this.options.header && (z(this._element, "dv-resize-container-with-titlebar", !0), this._element.appendChild(this.options.header)), this._element.appendChild(this.options.content), this.options.container.appendChild(this._element), this.setBounds(O(O(O(O({
      height: this.options.height,
      width: this.options.width
    }, "top" in this.options && { top: this.options.top }), "bottom" in this.options && { bottom: this.options.bottom }), "left" in this.options && { left: this.options.left }), "right" in this.options && { right: this.options.right })), Ke.push(this._element);
  }
  setVisible(t) {
    t !== this.isVisible && (this._isVisible = t, z(this.element, "dv-hidden", !this.isVisible));
  }
  bringToFront() {
    Ke.push(this._element);
  }
  setBounds(t = {}) {
    typeof t.height == "number" && (this._element.style.height = `${t.height}px`), typeof t.width == "number" && (this._element.style.width = `${t.width}px`), "top" in t && typeof t.top == "number" && (this._element.style.top = `${t.top}px`, this._element.style.bottom = "auto", this.verticalAlignment = "top"), "bottom" in t && typeof t.bottom == "number" && (this._element.style.bottom = `${t.bottom}px`, this._element.style.top = "auto", this.verticalAlignment = "bottom"), "left" in t && typeof t.left == "number" && (this._element.style.left = `${t.left}px`, this._element.style.right = "auto", this.horiziontalAlignment = "left"), "right" in t && typeof t.right == "number" && (this._element.style.right = `${t.right}px`, this._element.style.left = "auto", this.horiziontalAlignment = "right");
    const i = this.options.container.getBoundingClientRect(), o = this._element.getBoundingClientRect(), r = Math.max(0, this.getMinimumWidth(o.width)), n = Math.max(0, this.getMinimumHeight(o.height));
    if (this.verticalAlignment === "top") {
      const s = N(o.top - i.top, -n, Math.max(0, i.height - o.height + n));
      this._element.style.top = `${s}px`, this._element.style.bottom = "auto";
    }
    if (this.verticalAlignment === "bottom") {
      const s = N(i.bottom - o.bottom, -n, Math.max(0, i.height - o.height + n));
      this._element.style.bottom = `${s}px`, this._element.style.top = "auto";
    }
    if (this.horiziontalAlignment === "left") {
      const s = N(o.left - i.left, -r, Math.max(0, i.width - o.width + r));
      this._element.style.left = `${s}px`, this._element.style.right = "auto";
    }
    if (this.horiziontalAlignment === "right") {
      const s = N(i.right - o.right, -r, Math.max(0, i.width - o.width + r));
      this._element.style.right = `${s}px`, this._element.style.left = "auto";
    }
    this._onDidChange.fire();
  }
  toJSON() {
    const t = this.options.container.getBoundingClientRect(), i = this._element.getBoundingClientRect(), o = {};
    return this.verticalAlignment === "top" ? o.top = Number.parseFloat(this._element.style.top) : this.verticalAlignment === "bottom" ? o.bottom = Number.parseFloat(this._element.style.bottom) : o.top = i.top - t.top, this.horiziontalAlignment === "left" ? o.left = Number.parseFloat(this._element.style.left) : this.horiziontalAlignment === "right" ? o.right = Number.parseFloat(this._element.style.right) : o.left = i.left - t.left, o.width = i.width, o.height = i.height, o;
  }
  /**
  * Abort an in-flight move-the-float drag. Used by the void container
  * when a redock long-press fires after the move started, so the ghost
  * gesture wins without the float continuing to follow the finger.
  * Does not emit `onDidChangeEnd` because no change is being committed.
  */
  cancelPendingDrag() {
    this._dragMove.value && (this._dragCancelled = !0, z(this._element, "dv-resize-container-dragging", !1), this._dragMove.value = $.NONE);
  }
  setupDrag(t, i) {
    const o = (r, n) => {
      var s, a, d;
      let c = null, l = !1;
      this._dragCancelled = !1;
      const h = this.options.transformDragPosition ? (s = (a = (d = this.options).getSiblingBoxes) === null || a === void 0 ? void 0 : a.call(d)) !== null && s !== void 0 ? s : [] : [], v = We();
      if (r && typeof n == "number" && typeof r.setPointerCapture == "function") try {
        r.setPointerCapture(n);
      } catch {
      }
      const p = () => {
        z(this._element, "dv-resize-container-dragging", !1), this._dragMove.value = $.NONE, this._onDidChangeEnd.fire();
      };
      this._dragMove.value = new I({ dispose: () => {
        if (v.release(), r && typeof n == "number" && typeof r.releasePointerCapture == "function") try {
          r.releasePointerCapture(n);
        } catch {
        }
      } }, T(globalThis.window, "pointermove", (u) => {
        var g;
        if (this._dragCancelled) return;
        const _ = this.options.container.getBoundingClientRect(), C = u.clientX - _.left, k = u.clientY - _.top;
        z(this._element, "dv-resize-container-dragging", !0);
        const y = this._element.getBoundingClientRect();
        (g = c) !== null && g !== void 0 || (c = {
          x: u.clientX - y.left,
          y: u.clientY - y.top
        });
        const P = Math.max(0, this.getMinimumWidth(y.width)), M = Math.max(0, this.getMinimumHeight(y.height));
        let E = k - c.y, w = C - c.x;
        if (this.options.transformDragPosition) {
          const V = this.options.transformDragPosition({
            proposed: {
              top: E,
              left: w,
              width: y.width,
              height: y.height
            },
            container: {
              width: _.width,
              height: _.height
            },
            others: h,
            modifiers: {
              altKey: u.altKey,
              ctrlKey: u.ctrlKey,
              metaKey: u.metaKey,
              shiftKey: u.shiftKey
            }
          });
          V && (E = V.top, w = V.left);
        }
        const x = Math.max(0, _.height - y.height + M), f = Math.max(0, _.width - y.width + P), b = N(E, -M, x), m = N(_.height - y.height - E, -M, x), S = N(w, -P, f), G = N(_.width - y.width - w, -P, f), A = {};
        b <= m ? A.top = b : A.bottom = m, S <= G ? A.left = S : A.right = G, this.setBounds(A), l || (l = !0, this._onDidStartMoving.fire());
      }), T(globalThis.window, "pointerup", p), T(globalThis.window, "pointercancel", p));
    };
    this.addDisposables(T(t, "pointerdown", (r) => {
      if (r.defaultPrevented) {
        r.preventDefault();
        return;
      }
      pi(r) || o(t, r.pointerId);
    }), T(this.options.content, "pointerdown", (r) => {
      r.defaultPrevented || pi(r) || r.shiftKey && o(this.options.content, r.pointerId);
    }), T(this.options.content, "pointerdown", () => {
      Ke.push(this._element);
    }, !0)), i?.inDragMode && o();
  }
  setupResize(t) {
    const i = document.createElement("div");
    i.className = `dv-resize-handle-${t}`, this._element.appendChild(i);
    const o = new j();
    this.addDisposables(o, T(i, "pointerdown", (r) => {
      r.preventDefault();
      let n = null;
      const s = We(), a = r.pointerId;
      if (typeof i.setPointerCapture == "function") try {
        i.setPointerCapture(a);
      } catch {
      }
      const d = () => {
        o.dispose(), this._onDidChangeEnd.fire();
      };
      o.value = new I(T(globalThis.window, "pointermove", (c) => {
        var l;
        const h = this.options.container.getBoundingClientRect(), v = this._element.getBoundingClientRect(), p = c.clientY - h.top, u = c.clientX - h.left;
        (l = n) !== null && l !== void 0 || (n = {
          originalY: p,
          originalHeight: v.height,
          originalX: u,
          originalWidth: v.width
        });
        let g, _, C, k, y, P;
        const M = () => {
          const b = n.originalY + n.originalHeight > h.height ? Math.max(0, h.height - fe.MINIMUM_HEIGHT) : Math.max(0, n.originalY + n.originalHeight - fe.MINIMUM_HEIGHT);
          g = N(p, 0, b), C = n.originalY + n.originalHeight - g, _ = h.height - g - C;
        }, E = () => {
          g = n.originalY - n.originalHeight;
          const b = g < 0 && typeof this.options.minimumInViewportHeight == "number" ? -g + this.options.minimumInViewportHeight : fe.MINIMUM_HEIGHT, m = h.height - Math.max(0, g);
          C = N(p - g, b, m), _ = h.height - g - C;
        }, w = () => {
          const b = n.originalX + n.originalWidth > h.width ? Math.max(0, h.width - fe.MINIMUM_WIDTH) : Math.max(0, n.originalX + n.originalWidth - fe.MINIMUM_WIDTH);
          k = N(u, 0, b), P = n.originalX + n.originalWidth - k, y = h.width - k - P;
        }, x = () => {
          k = n.originalX - n.originalWidth;
          const b = k < 0 && typeof this.options.minimumInViewportWidth == "number" ? -k + this.options.minimumInViewportWidth : fe.MINIMUM_WIDTH, m = h.width - Math.max(0, k);
          P = N(u - k, b, m), y = h.width - k - P;
        };
        switch (t) {
          case "top":
            M();
            break;
          case "bottom":
            E();
            break;
          case "left":
            w();
            break;
          case "right":
            x();
            break;
          case "topleft":
            M(), w();
            break;
          case "topright":
            M(), x();
            break;
          case "bottomleft":
            E(), w();
            break;
          case "bottomright":
            E(), x();
            break;
        }
        const f = {};
        g <= _ ? f.top = g : f.bottom = _, k <= y ? f.left = k : f.right = y, f.height = C, f.width = P, this.setBounds(f);
      }), { dispose: () => {
        if (s.release(), typeof i.releasePointerCapture == "function") try {
          i.releasePointerCapture(a);
        } catch {
        }
      } }, T(globalThis.window, "pointerup", d), T(globalThis.window, "pointercancel", d));
    }));
  }
  getMinimumWidth(t) {
    return typeof this.options.minimumInViewportWidth == "number" ? t - this.options.minimumInViewportWidth : 0;
  }
  getMinimumHeight(t) {
    return typeof this.options.minimumInViewportHeight == "number" ? t - this.options.minimumInViewportHeight : 0;
  }
  dispose() {
    Ke.destroy(this._element), this._element.remove(), super.dispose();
  }
};
Jt.MINIMUM_HEIGHT = 20;
Jt.MINIMUM_WIDTH = 20;
var En = class extends I {
  get element() {
    return this._element;
  }
  /** The window's current anchor group, the one this bar drags/activates. */
  get group() {
    return this._group;
  }
  /**
  * Retarget the bar at a new anchor group. Called when the original anchor
  * leaves a multi-group floating window and another member is promoted, so
  * the bar keeps activating/redocking a group that actually lives here.
  */
  setGroup(e) {
    this._group = e;
  }
  constructor(e, t) {
    super(), this.accessor = e, this._onDragStart = new D(), this.onDragStart = this._onDragStart.event, this._group = t, this._element = document.createElement("div"), this._element.className = "dv-floating-titlebar", this.addDisposables(this._onDragStart, T(this._element, "pointerdown", () => {
      this.accessor.doSetGroupActive(this._group);
    }), T(this._element, "pointerdown", (i) => {
      i.shiftKey && lo(i);
    }, !0)), this.dragSource = new Eo({
      element: this._element,
      accessor: this.accessor,
      group: () => this._group
    }), this.addDisposables(this.dragSource, this.dragSource.onDragStart((i) => {
      this._onDragStart.fire(i);
    }));
  }
  updateDragAndDropState() {
    this.dragSource.updateDragAndDropState();
  }
};
function se(e) {
  return {
    moduleName: e.name,
    options: e.options,
    services: { [e.serviceKey]: e.create },
    init: e.init ? (t, i) => e.init(t, i[e.serviceKey]) : void 0,
    dependsOn: e.dependsOn
  };
}
const In = /* @__PURE__ */ new Set([
  "AdvancedOverflow",
  "AutoEdgeGroup",
  "AutoHideEdgeGroup",
  "DndCompass",
  "KeyboardDocking",
  "KeyboardNavigation",
  "LayoutHistory",
  "License",
  "MultiRowTabs",
  "PinnedTabs",
  "SmartGuides"
]), ki = /* @__PURE__ */ new Set();
function Fo(e, t) {
  const i = t === void 0 ? [] : [].concat(t), o = i.map((s) => `\`${s}\``).join(", "), r = i.length > 1 ? "require" : "requires", n = i.length ? `${o} ${r} the "${e}" module` : `The "${e}" module is required`;
  return In.has(e) ? `dockview: ${n}, which ships in dockview-enterprise.

  npm install dockview-enterprise
  import 'dockview-enterprise'; // self-registers every enterprise module
` : `dockview: ${n}, but it is not registered.`;
}
function Bo(e, t) {
  const i = `${e}|${(t === void 0 ? [] : [].concat(t)).join("|")}`;
  ki.has(i) || (ki.add(i), console.error(Fo(e, t)));
}
function J(e, t, i) {
  if (e !== void 0) return e;
  Bo(t, i);
}
var Mn = class {
  constructor() {
    this._modules = /* @__PURE__ */ new Map(), this._services = {}, this._initDisposables = [];
  }
  get services() {
    return this._services;
  }
  register(e) {
    if (!this._modules.has(e.moduleName)) {
      if (e.dependsOn) for (const t of e.dependsOn) this.register(t);
      this._modules.set(e.moduleName, e);
    }
  }
  initialize(e) {
    for (const t of this._modules.values())
      if (t.services)
        for (const [i, o] of Object.entries(t.services)) this._services[i] = o(e);
  }
  postConstruct(e) {
    for (const t of this._modules.values()) t.init && this._initDisposables.push(t.init(e, this._services));
  }
  has(e) {
    return this._modules.has(e);
  }
  dispose() {
    for (const e of this._initDisposables) e.dispose();
    this._initDisposables.length = 0;
    for (const e of Object.values(this._services)) e !== void 0 && typeof e.dispose == "function" && e.dispose();
  }
};
const On = [];
function $n() {
  return [...On];
}
const Rn = [
  {
    optionKey: "smartGuides",
    reason: "smartGuides",
    moduleName: "SmartGuides",
    when: (e) => !!e.smartGuides && e.smartGuides.enabled !== !1
  },
  {
    optionKey: "layoutHistory",
    reason: "layoutHistory.enabled: true",
    moduleName: "LayoutHistory",
    when: (e) => {
      var t;
      return ((t = e.layoutHistory) === null || t === void 0 ? void 0 : t.enabled) === !0;
    }
  },
  {
    optionKey: "pinnedTabs",
    reason: "pinnedTabs.enabled: true",
    moduleName: "PinnedTabs",
    when: (e) => {
      var t;
      return ((t = e.pinnedTabs) === null || t === void 0 ? void 0 : t.enabled) === !0;
    }
  },
  {
    optionKey: "overflow",
    reason: "overflow.mode: 'wrap'",
    moduleName: "MultiRowTabs",
    when: (e) => {
      var t;
      return ((t = e.overflow) === null || t === void 0 ? void 0 : t.mode) === "wrap";
    }
  },
  {
    optionKey: "overflow",
    reason: "overflow.maxRows",
    moduleName: "MultiRowTabs",
    when: (e) => {
      var t;
      return ((t = e.overflow) === null || t === void 0 ? void 0 : t.maxRows) != null;
    }
  },
  {
    optionKey: "overflow",
    reason: "overflow.search",
    moduleName: "AdvancedOverflow",
    when: (e) => {
      var t;
      return !!(!((t = e.overflow) === null || t === void 0) && t.search);
    }
  },
  {
    optionKey: "overflow",
    reason: "overflow.mru",
    moduleName: "AdvancedOverflow",
    when: (e) => {
      var t;
      return !!(!((t = e.overflow) === null || t === void 0) && t.mru);
    }
  },
  {
    optionKey: "autoHideEdgeGroups",
    reason: "autoHideEdgeGroups",
    moduleName: "AutoHideEdgeGroup",
    when: (e) => $t(e.autoHideEdgeGroups)
  },
  {
    optionKey: "dockToEdgeGroups",
    reason: "dockToEdgeGroups",
    moduleName: "AutoEdgeGroup",
    when: (e) => $t(e.dockToEdgeGroups)
  },
  {
    optionKey: "dndCompass",
    reason: "dndCompass",
    moduleName: "DndCompass",
    when: (e) => !!e.dndCompass
  },
  {
    optionKey: "keyboardNavigation",
    reason: "keyboardNavigation",
    moduleName: "KeyboardNavigation",
    when: (e) => !!e.keyboardNavigation
  }
];
function Ln(e, t) {
  const i = /* @__PURE__ */ new Map();
  for (const o of Rn) {
    if (!o.when(e) || t(o.moduleName)) continue;
    const r = i.get(o.moduleName);
    r ? r.push(o.reason) : i.set(o.moduleName, [o.reason]);
  }
  for (const [o, r] of i) Bo(o, r);
}
const pe = {
  left: 100,
  top: 100,
  width: 300,
  height: 300
};
var Vn = class extends I {
  /**
  * The window's representative/anchor group. A floating window can host a
  * nested layout of several groups; the anchor is used for back-compat
  * single-group APIs and is reassigned if it leaves the window.
  */
  get group() {
    return this._group;
  }
  /**
  * Register the dedicated title bar (if any) so anchor reassignment keeps
  * its drag handle pointed at a group that still lives in this window.
  */
  setTitleBar(e) {
    this._titleBar = e;
  }
  setAnchorGroup(e) {
    var t;
    this._group = e, (t = this._titleBar) === null || t === void 0 || t.setGroup(e);
  }
  constructor(e, t, i) {
    super(), this.overlay = t, this.gridview = i, this._group = e, this.addDisposables(t, { dispose: () => this.gridview.dispose() });
  }
  position(e) {
    this.overlay.setBounds(e);
  }
}, Nn = class {
  get floatingGroups() {
    return this._floatingGroups;
  }
  constructor(e) {
    this._floatingGroups = [], this._host = e;
  }
  add(e, t, i) {
    const o = new Vn(e, t, i), r = new I(e.api.onDidActiveChange((s) => {
      s.isActive && t.bringToFront();
    }), (() => {
      let s = -1, a = -1;
      return ke(i.element, (d) => {
        const c = Math.round(d.contentRect.width), l = Math.round(d.contentRect.height);
        c === s && l === a || (s = c, a = l, i.layout(c, l));
      });
    })()), n = () => {
      var s;
      const a = (s = e.activePanel) === null || s === void 0 ? void 0 : s.title;
      a ? t.element.setAttribute("aria-label", a) : t.element.removeAttribute("aria-label");
    };
    return n(), o.addDisposables(e.api.onDidActivePanelChange(() => n()), t.onDidChange(() => {
      i.layout(i.width, i.height);
    }), t.onDidChangeEnd(() => {
      this._host.fireLayoutChange();
    }), e.onDidChange((s) => {
      t.setBounds({
        height: typeof s?.height == "number" ? s.height + t.headerHeight : s?.height,
        width: s?.width
      });
    }), { dispose: () => {
      r.dispose(), mo(this._floatingGroups, o), e.model.location = { type: "grid" };
    } }), this._floatingGroups.push(o), o;
  }
  findByGroup(e) {
    return this._floatingGroups.find((t) => t.group === e || t.gridview.element.contains(e.element));
  }
  serialize() {
    return this._floatingGroups.map((e) => {
      const t = e.gridview.serialize(), i = e.overlay.toJSON(), o = t.root;
      return o.type === "branch" && o.data.length === 1 && o.data[0].type === "leaf" ? {
        data: o.data[0].data,
        position: i
      } : {
        grid: t,
        position: i
      };
    });
  }
  constrainBounds() {
    for (const e of this._floatingGroups) e.overlay.setBounds();
  }
  updateBounds(e) {
    if ("floatingGroupBounds" in e)
      for (const o of this._floatingGroups) {
        switch (e.floatingGroupBounds) {
          case "boundedWithinViewport":
            o.overlay.minimumInViewportHeight = void 0, o.overlay.minimumInViewportWidth = void 0;
            break;
          case void 0:
            o.overlay.minimumInViewportHeight = 100, o.overlay.minimumInViewportWidth = 100;
            break;
          default:
            var t, i;
            o.overlay.minimumInViewportHeight = (t = e.floatingGroupBounds) === null || t === void 0 ? void 0 : t.minimumHeightWithinViewport, o.overlay.minimumInViewportWidth = (i = e.floatingGroupBounds) === null || i === void 0 ? void 0 : i.minimumWidthWithinViewport;
        }
        o.overlay.setBounds();
      }
  }
  disposeAll() {
    for (const e of [...this._floatingGroups]) e.dispose();
  }
  dispose() {
    this.disposeAll();
  }
};
const Wn = se({
  name: "FloatingGroup",
  serviceKey: "floatingGroupService",
  create: (e) => new Nn(e)
});
var Hn = class {
  constructor(e) {
    this._entries = [], this._restorationCleanups = /* @__PURE__ */ new Set(), this._restorationPromise = Promise.resolve(), this._onDidRemove = new D(), this.onDidRemove = this._onDidRemove.event, this._host = e;
  }
  get entries() {
    return this._entries;
  }
  get restorationPromise() {
    return this._restorationPromise;
  }
  add(e) {
    this._entries.push(e);
  }
  remove(e) {
    mo(this._entries, e) && !this._host.isDisposed && this._onDidRemove.fire(e);
  }
  findByGroup(e) {
    return this._entries.find((t) => t.popoutGroup === e || t.gridview.element.contains(e.element));
  }
  findReferenceGroupId(e) {
    var t;
    return (t = this._entries.find((i) => i.popoutGroup === e)) === null || t === void 0 ? void 0 : t.referenceGroup;
  }
  /**
  * The popout window's innerWidth/innerHeight are often 0/stale until it has
  * painted, and the nested gridview lays its children out to the size passed
  * to layout() (a plain group fills via CSS instead). To stop content
  * rendering into a zero box until a manual resize, and to avoid the race a
  * fixed number of animation frames had, observe the gridview element with
  * a ResizeObserver created in the popout window's own realm. A parent-realm
  * observer fires unreliably across the window boundary; a same-realm one
  * fires reliably, including the initial observation once the window is
  * sized.
  *
  * @returns a disposable that disconnects the observer, or `undefined` when
  * the popout realm has no ResizeObserver (e.g. jsdom).
  */
  observeGridviewSize(e, t, i) {
    var o;
    const r = (o = e.window) === null || o === void 0 ? void 0 : o.ResizeObserver;
    if (!r) return;
    let n = -1, s = -1;
    const a = () => {
      const c = e.window;
      if (this._host.isDisposed || !c || c.closed) return;
      const l = Math.round(t.element.clientWidth), h = Math.round(t.element.clientHeight);
      l === n && h === s || (n = l, s = h, l > 0 && h > 0 && t.layout(l, h), i.updateAllPositions());
    }, d = new r(() => {
      var c;
      const l = (c = e.window) === null || c === void 0 ? void 0 : c.requestAnimationFrame;
      l ? l.call(e.window, a) : a();
    });
    return d.observe(t.element), { dispose: () => d.disconnect() };
  }
  /**
  * Runs `work` after `delayMs`, resolving once it has finished. Work that
  * returns a promise is awaited, so a caller holding
  * `restorationPromise` waits for the popout window itself rather than
  * only for the timer that starts it.
  */
  scheduleRestoration(e, t, i) {
    return new Promise((o) => {
      const r = () => {
        this._restorationCleanups.delete(r), clearTimeout(n), i?.(), o();
      }, n = setTimeout(() => {
        if (this._restorationCleanups.delete(r), this._host.isDisposed) {
          o();
          return;
        }
        Promise.resolve(t()).then(() => o(), () => o());
      }, e);
      this._restorationCleanups.add(r);
    });
  }
  finishRestoration(e) {
    this._restorationPromise = Promise.all(e).then(() => {
    });
  }
  cancelPendingRestorations() {
    for (const e of [...this._restorationCleanups]) e();
    this._restorationCleanups.clear();
  }
  serialize() {
    return this._entries.map((e) => {
      const t = e.gridview.serialize(), i = t.root, o = e.popoutGroup.api.location.type === "popout" ? e.popoutGroup.api.location.popoutUrl : void 0, r = {
        gridReferenceGroup: e.referenceGroup,
        position: e.window.dimensions(),
        url: o
      };
      return i.type === "branch" && i.data.length === 1 && i.data[0].type === "leaf" ? O(O({}, r), {}, { data: i.data[0].data }) : O(O({}, r), {}, { grid: t });
    });
  }
  disposeAll() {
    for (const e of [...this._entries]) e.disposable.dispose();
  }
  dispose() {
    this.cancelPendingRestorations(), this.disposeAll(), this._onDidRemove.dispose();
  }
};
const Fn = se({
  name: "PopoutWindow",
  serviceKey: "popoutWindowService",
  create: (e) => new Hn(e)
});
var Bn = class {
  constructor(e) {
    this._watermark = null, this._host = e;
  }
  update() {
    if (this._host.hasVisibleGridGroup()) {
      this._unmount();
      return;
    }
    if (this._watermark) return;
    this._watermark = this._host.createWatermarkComponent(), this._watermark.init({ containerApi: this._host.api });
    const e = document.createElement("div");
    e.className = "dv-watermark-container", sr(e, "watermark-component"), e.appendChild(this._watermark.element), this._host.mountElement.appendChild(e);
  }
  refresh() {
    this._unmount(), this.update();
  }
  _unmount() {
    var e, t;
    this._watermark && (this._watermark.element.parentElement.remove(), (e = (t = this._watermark).dispose) === null || e === void 0 || e.call(t), this._watermark = null);
  }
  dispose() {
    this._unmount();
  }
};
const Un = se({
  name: "Watermark",
  serviceKey: "watermarkService",
  create: (e) => new Bn(e),
  init: (e, t) => (t.update(), new I(ie.any(e.onDidAdd, e.onDidRemove)(() => {
    t.update();
  }), e.onDidViewVisibilityChangeMicroTaskQueue(() => {
    t.update();
  })))
});
var Yn = class {
  constructor() {
    this._edgeGroups = /* @__PURE__ */ new Map(), this._edgeGroupDisposables = /* @__PURE__ */ new Map(), this._autoHide = /* @__PURE__ */ new WeakMap(), this._autoReveal = /* @__PURE__ */ new WeakMap();
  }
  add(e, t, i) {
    this._edgeGroups.set(e, t), this._edgeGroupDisposables.set(e, i);
  }
  remove(e) {
    var t;
    (t = this._edgeGroupDisposables.get(e)) === null || t === void 0 || t.dispose(), this._edgeGroupDisposables.delete(e), this._edgeGroups.delete(e);
  }
  get(e) {
    return this._edgeGroups.get(e);
  }
  has(e) {
    return this._edgeGroups.has(e);
  }
  hasAny() {
    return this._edgeGroups.size > 0;
  }
  entries() {
    return this._edgeGroups.entries();
  }
  includes(e) {
    for (const t of this._edgeGroups.values()) if (t === e) return !0;
    return !1;
  }
  findPositionOf(e) {
    for (const [t, i] of this._edgeGroups) if (i === e) return t;
  }
  setAutoHide(e, t) {
    t === void 0 ? this._autoHide.delete(e) : this._autoHide.set(e, t);
  }
  isAutoHide(e) {
    return this._autoHide.get(e);
  }
  setAutoReveal(e, t) {
    this._autoReveal.set(e, t);
  }
  isAutoReveal(e) {
    var t;
    return (t = this._autoReveal.get(e)) !== null && t !== void 0 ? t : !1;
  }
  disposeAll() {
    for (const e of this._edgeGroupDisposables.values()) e.dispose();
    this._edgeGroupDisposables.clear(), this._edgeGroups.clear();
  }
  dispose() {
    this.disposeAll();
  }
};
const jn = se({
  name: "EdgeGroup",
  serviceKey: "edgeGroupService",
  create: () => new Yn()
}), Zn = {
  activationSize: {
    type: "pixels",
    value: 10
  },
  size: {
    type: "pixels",
    value: 20
  }
}, Xn = {
  activationSize: {
    type: "pixels",
    value: 32
  },
  size: {
    type: "pixels",
    value: 20
  }
};
function Ci(e, t) {
  return typeof e.dndEdges == "object" && e.dndEdges !== null ? e.dndEdges : t && $t(e.dockToEdgeGroups) ? Xn : Zn;
}
var qn = class {
  constructor(e) {
    this._host = e;
    const t = (o, r) => {
      const n = W();
      return n ? n.viewId !== e.id ? !1 : r === "center" ? e.isGridEmpty() : !0 : r === "center" && !e.isGridEmpty() ? !1 : e.dispatchUnhandledDragOver(o, r);
    }, i = Ci(e.options, !1);
    this._html5Target = ye.createDropTarget(e.element, {
      className: "dv-drop-target-edge",
      canDisplayOverlay: t,
      acceptedTargetZones: [
        "top",
        "bottom",
        "left",
        "right",
        "center"
      ],
      overlayModel: i,
      getOverrideTarget: () => e.rootDropTargetOverrideTarget(),
      getPositionResolver: () => e.options.dropPositionResolver
    }), this._pointerTarget = he.createDropTarget(e.element, {
      className: "dv-drop-target-edge",
      canDisplayOverlay: t,
      acceptedTargetZones: [
        "top",
        "bottom",
        "left",
        "right",
        "center"
      ],
      overlayModel: i,
      getOverrideTarget: () => e.rootDropTargetOverrideTarget(),
      getPositionResolver: () => e.options.dropPositionResolver
    }), this.onWillShowOverlay = ie.any(this._html5Target.onWillShowOverlay, this._pointerTarget.onWillShowOverlay), this.onDrop = ie.any(this._html5Target.onDrop, this._pointerTarget.onDrop), this.setOptions(e.options);
  }
  setOptions(e) {
    if ("dndEdges" in e) {
      const t = typeof e.dndEdges == "boolean" && e.dndEdges === !1;
      this._html5Target.disabled = t, this._pointerTarget.disabled = t;
    }
    if ("dndEdges" in e || "dockToEdgeGroups" in e) {
      const t = Ci({
        dndEdges: "dndEdges" in e ? e.dndEdges : this._host.options.dndEdges,
        dockToEdgeGroups: "dockToEdgeGroups" in e ? e.dockToEdgeGroups : this._host.options.dockToEdgeGroups
      }, this._host.hasEdgeDragReveal);
      this._html5Target.setOverlayModel(t), this._pointerTarget.setOverlayModel(t);
    }
  }
  dispose() {
    this._html5Target.dispose(), this._pointerTarget.dispose();
  }
};
const Kn = se({
  name: "RootDropTarget",
  serviceKey: "rootDropTargetService",
  create: (e) => new qn(e),
  init: (e, t) => (t.setOptions(e.options), $.NONE)
}), Jn = {
  left: "createLeftHeaderActionComponent",
  right: "createRightHeaderActionComponent",
  prefix: "createPrefixHeaderActionComponent"
};
var Qn = class {
  constructor(e) {
    this._perGroup = /* @__PURE__ */ new Map(), this._host = e;
  }
  refresh(e) {
    if (!e?.model) return;
    const t = this._ensureState(e);
    this._refreshSlot("left", e, t.left), this._refreshSlot("right", e, t.right), this._refreshSlot("prefix", e, t.prefix);
  }
  refreshAll() {
    for (const e of this._host.groups) this.refresh(e);
  }
  disposeGroup(e) {
    const t = this._perGroup.get(e);
    t && (t.left.dispose(), t.right.dispose(), t.prefix.dispose(), this._perGroup.delete(e));
  }
  dispose() {
    for (const e of [...this._perGroup.keys()]) this.disposeGroup(e);
  }
  _ensureState(e) {
    let t = this._perGroup.get(e);
    return t || (t = {
      left: new j(),
      right: new j(),
      prefix: new j()
    }, this._perGroup.set(e, t)), t;
  }
  _refreshSlot(e, t, i) {
    const o = this._host.options[Jn[e]];
    if (o) {
      const r = o(t);
      i.value = r, r.init({
        containerApi: this._host.api,
        api: t.api,
        group: t
      }), t.model.attachHeaderAction(e, r.element);
    } else
      i.dispose(), t.model.attachHeaderAction(e, void 0);
  }
};
const es = se({
  name: "HeaderActions",
  serviceKey: "headerActionsService",
  create: (e) => new Qn(e),
  init: (e, t) => new I(e.onDidRemoveGroup((i) => {
    t.disposeGroup(i);
  }))
}), Si = (e) => e === "load" || e === "clear";
function Je(e, t) {
  const i = e.createElement("div");
  return i.className = t === "assertive" ? "dv-live-region-assertive" : "dv-live-region", i.setAttribute("role", t === "assertive" ? "alert" : "status"), i.setAttribute("aria-live", t), i.setAttribute("aria-atomic", "true"), Object.assign(i.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: "0"
  }), i;
}
var ts = class extends I {
  constructor(e) {
    var t;
    super(), this._regions = /* @__PURE__ */ new Map(), this._suppressDepth = 0, this._locationSubs = /* @__PURE__ */ new Map(), this._host = e;
    const i = e.element.ownerDocument;
    this._mainWindow = (t = i.defaultView) !== null && t !== void 0 ? t : window;
    const o = {
      polite: Je(i, "polite"),
      assertive: Je(i, "assertive")
    };
    e.element.appendChild(o.polite), e.element.appendChild(o.assertive), this._regions.set(this._mainWindow, o), this._syncPopoutRegions(), this.addDisposables({ dispose: () => this._disposeRegions() }, e.onDidChangePopouts(() => this._syncPopoutRegions()), e.onDidAddPanel((r) => this._announce(r, "open")), e.onDidRemovePanel((r) => this._announce(r, "close")), e.onWillMutateLayout((r) => {
      Si(r.kind) && this._suppressDepth++;
    }), e.onDidMutateLayout((r) => {
      Si(r.kind) && (this._suppressDepth = Math.max(0, this._suppressDepth - 1));
    }), e.onDidMaximizedGroupChange((r) => {
      const n = r.group.activePanel;
      n && this._announce(n, r.isMaximized ? "maximize" : "restore");
    }), e.onDidAddGroup((r) => this._trackLocation(r)), e.onDidRemoveGroup((r) => {
      var n;
      (n = this._locationSubs.get(r.id)) === null || n === void 0 || n.dispose(), this._locationSubs.delete(r.id);
    }), { dispose: () => {
      this._locationSubs.forEach((r) => r.dispose()), this._locationSubs.clear();
    } });
  }
  /** Create a live region in every popout document that lacks one, and remove
  *  regions for popouts that have closed. The main window's pair is permanent. */
  _syncPopoutRegions() {
    const e = this._host.element.ownerDocument, t = /* @__PURE__ */ new Set([this._mainWindow]);
    for (const o of this._host.getPopoutWindows()) {
      var i;
      if (o.document === e || (t.add(o), this._regions.has(o))) continue;
      const r = o.document, n = (i = r.body) !== null && i !== void 0 ? i : r.documentElement, s = {
        polite: Je(r, "polite"),
        assertive: Je(r, "assertive")
      };
      n.appendChild(s.polite), n.appendChild(s.assertive), this._regions.set(o, s);
    }
    for (const [o, r] of this._regions) t.has(o) || (r.polite.remove(), r.assertive.remove(), this._regions.delete(o));
  }
  _disposeRegions() {
    for (const e of this._regions.values())
      e.polite.remove(), e.assertive.remove();
    this._regions.clear();
  }
  /** Route announcements to the live region of the window that currently has
  *  focus, so a screen-reader user in a popout hears them, falling back to
  *  the main window. */
  _focusedRegions() {
    for (const [e, t] of this._regions)
      if (e !== this._mainWindow)
        try {
          if (e.document.hasFocus()) return t;
        } catch {
        }
    return this._regions.get(this._mainWindow);
  }
  _trackLocation(e) {
    let t = e.api.location.type;
    const i = e.api.onDidLocationChange((o) => {
      const r = o.location.type;
      if (r === t) return;
      t = r;
      const n = e.activePanel;
      if (!n) return;
      let s;
      switch (r) {
        case "floating":
          s = "float";
          break;
        case "popout":
          s = "popout";
          break;
        default:
          s = "dock";
          break;
      }
      this._announce(n, s);
    });
    this._locationSubs.set(e.id, i);
  }
  announce(e, t = "polite") {
    if (this._host.options.announcements === !1 || this._suppressDepth > 0 || !e) return;
    const i = this._host.options.announcer;
    if (i) {
      i({
        message: e,
        politeness: t
      });
      return;
    }
    const o = this._focusedRegions(), r = t === "assertive" ? o.assertive : o.polite;
    r.textContent = "", r.textContent = e;
  }
  _announce(e, t) {
    var i, o;
    const r = (i = (o = this._host.options).getAnnouncement) === null || i === void 0 ? void 0 : i.call(o, {
      kind: t,
      panel: e
    });
    r === null || r === "" || this.announce(r ?? this._defaultMessage(e, t));
  }
  _defaultMessage(e, t) {
    var i;
    const o = yo(this._host.options.messages), r = (i = e.title) !== null && i !== void 0 ? i : e.id;
    switch (t) {
      case "open":
        return o.panelOpened(r);
      case "close":
        return o.panelClosed(r);
      case "maximize":
        return o.groupMaximized(r);
      case "restore":
        return o.groupRestored(r);
      case "float":
        return o.groupFloated(r);
      case "dock":
        return o.groupDocked(r);
      case "popout":
        return o.groupPoppedOut(r);
    }
  }
};
const is = se({
  name: "LiveRegion",
  serviceKey: "liveRegionService",
  create: (e) => new ts(e)
}), os = 30, rs = -10;
var ns = class {
  constructor(e) {
    this.host = e;
  }
  dispatchWillDragPanel(e) {
    this.host.fireWillDragPanel(e);
  }
  dispatchWillDragGroup(e) {
    this.host.fireWillDragGroup(e);
  }
  dispatchWillDrop(e) {
    this.host.fireWillDrop(e);
  }
  dispatchWillShowOverlay(e) {
    this.host.fireWillShowOverlay(e);
  }
  buildGroupDragGhost(e) {
    const t = this.host.options.createGroupDragGhostComponent;
    if (!t) return;
    const i = t(e);
    return i.init({
      group: e,
      api: this.host.api
    }), {
      element: i.element,
      offsetX: os,
      offsetY: rs,
      dispose: i.dispose ? () => {
        var o;
        return (o = i.dispose) === null || o === void 0 ? void 0 : o.call(i);
      } : void 0
    };
  }
  resolveOverlayModel(e, t) {
    var i, o;
    return (i = (o = this.host.options).dropOverlayModel) === null || i === void 0 ? void 0 : i.call(o, {
      location: e,
      group: t
    });
  }
  showPreviewOverlay(e, t) {
    const i = e.model.contentDropTarget;
    return i.showOverlay(t), $.from(() => i.clearOverlay());
  }
  dispose() {
  }
};
const ss = se({
  name: "AdvancedDnD",
  serviceKey: "advancedDnDService",
  create: (e) => new ns(e)
});
var as = class {
  constructor(e) {
    this._host = e;
  }
  attachToGroup(e) {
    return new I(e.model.onDidCreateTabGroup((t) => {
      this._host.fireDidCreateTabGroup(t);
    }), e.model.onDidDestroyTabGroup((t) => {
      this._host.fireDidDestroyTabGroup(t);
    }), e.model.onDidAddPanelToTabGroup((t) => {
      this._host.fireDidAddPanelToTabGroup(t);
    }), e.model.onDidRemovePanelFromTabGroup((t) => {
      this._host.fireDidRemovePanelFromTabGroup(t);
    }), e.model.onDidTabGroupChange((t) => {
      this._host.fireDidTabGroupChange(t);
    }), e.model.onDidTabGroupCollapsedChange((t) => {
      this._host.fireDidTabGroupCollapsedChange(t);
    }));
  }
  dispose() {
  }
};
const ds = se({
  name: "TabGroupChips",
  serviceKey: "tabGroupChipsService",
  create: (e) => new as(e),
  init: (e, t) => {
    const i = /* @__PURE__ */ new Map();
    return new I(e.onDidAddGroup((o) => {
      i.set(o, t.attachToGroup(o));
    }), e.onDidRemoveGroup((o) => {
      var r;
      (r = i.get(o)) === null || r === void 0 || r.dispose(), i.delete(o);
    }), { dispose: () => {
      for (const o of i.values()) o.dispose();
      i.clear();
    } });
  }
});
function Gi(e, t) {
  var i, o;
  if (!((i = t.api) === null || i === void 0 || (o = i.isPeeking) === null || o === void 0) && o.call(i)) return "calc(var(--dv-overlay-z-index, 999) + 100)";
  if (!(e instanceof HTMLElement)) return;
  const r = po(e);
  return r?.style.zIndex ? `calc(${r.style.zIndex} * 2)` : void 0;
}
let ls = 0;
const cs = () => `dv-ctx-menu-item-${ls++}`;
function Pi(e) {
  return typeof e == "object";
}
function Q(e, t, i, o) {
  const r = document.createElement("div");
  return r.className = "dv-context-menu-item", r.setAttribute("role", "menuitem"), o && (r.classList.add("dv-context-menu-item--disabled"), r.setAttribute("aria-disabled", "true")), r.textContent = e, o || r.addEventListener("click", () => {
    i(), t();
  }), r;
}
function zi() {
  const e = document.createElement("div");
  return e.className = "dv-context-menu-separator", e.setAttribute("role", "separator"), e;
}
function hs() {
  if (globalThis.window === void 0 || !globalThis.matchMedia) return !1;
  const e = globalThis.matchMedia("(pointer: coarse)").matches, t = globalThis.matchMedia("(pointer: fine)").matches;
  return e && !t;
}
function vs(e) {
  const t = document.createElement("div");
  t.className = "dv-context-menu-rename";
  const i = document.createElement("input");
  return i.className = "dv-context-menu-rename-input", i.type = "text", i.placeholder = "Name This Group", i.value = e.label, i.addEventListener("input", () => {
    e.setLabel(i.value);
  }), i.addEventListener("keydown", (o) => {
    o.key !== "Escape" && o.key !== "Enter" && o.stopPropagation();
  }), i.addEventListener("click", (o) => {
    o.stopPropagation();
  }), t.appendChild(i), hs() || requestAnimationFrame(() => {
    i.focus(), i.select();
  }), t;
}
function ps(e, t) {
  const i = document.createElement("div");
  if (i.className = "dv-context-menu-color-picker", !t.enabled) return i;
  for (const o of t.entries()) {
    const r = document.createElement("div");
    r.className = "dv-context-menu-color-swatch", r.style.setProperty("--dv-tab-group-color", o.value), o.label && (r.title = o.label), e.color === o.id && r.classList.add("dv-context-menu-color-swatch--selected"), r.addEventListener("click", () => {
      e.setColor(o.id);
    }), i.appendChild(r);
  }
  return i;
}
var us = class {
  constructor(e) {
    this.accessor = e;
  }
  /**
  * A single maximize/restore toggle whose label and behaviour track the
  * group's live state: it reads *Restore* + calls `exitMaximized` when the
  * group is maximized, otherwise *Maximize* + `maximize`. Only grid groups
  * can be maximized, so the item is disabled for floating / popout panels
  * that are not already maximized.
  */
  buildMaximizeItem(e, t) {
    const i = e.api.isMaximized();
    return Q(i ? "Restore" : "Maximize", t, i ? () => e.api.exitMaximized() : () => e.api.maximize(), !i && e.api.location.type !== "grid");
  }
  /**
  * A single collapse/expand toggle whose label tracks the tab group's live
  * state: *Expand* when the group is already collapsed, otherwise *Collapse*.
  */
  buildCollapseItem(e, t) {
    return Q(e.collapsed ? "Expand" : "Collapse", t, () => e.toggle());
  }
  /**
  * Whether to auto-inject the built-in Pin/Unpin item at the top of the tab
  * menu. True only when the PinnedTabs module is registered, pinning is
  * enabled, and the app has not opted out via `pinnedTabs.contextMenuItem:
  * false` (the item is on by default). This keeps pinning reachable from the
  * menu without the app having to return `'pin'` from
  * `getTabContextMenuItems` itself.
  */
  _shouldInjectPin() {
    const e = this.accessor.options.pinnedTabs;
    return !!this.accessor.pinnedTabsService && !!e?.enabled && e.contextMenuItem !== !1;
  }
  /**
  * The tab menu items: the app's own items (if any) with the built-in
  * `'pin'` item prepended when {@link _shouldInjectPin} applies, so the app
  * keeps full control of its list, and pinning is added without disturbing
  * it. Reuses the existing `'pin'` token rendering below.
  */
  _resolveTabItems(e, t, i) {
    var o, r, n;
    const s = (o = (r = (n = this.accessor.options).getTabContextMenuItems) === null || r === void 0 ? void 0 : r.call(n, {
      panel: e,
      group: t,
      api: this.accessor.api,
      event: i
    })) !== null && o !== void 0 ? o : [];
    return this._shouldInjectPin() ? ["pin", ...s] : s;
  }
  /**
  * Render a custom `component` menu item and append it to `menuEl`. Builds
  * the framework renderer via the host's `createContextMenuItemComponent`
  * factory and initialises it. Shared by the tab menu and the chip menu,
  * which differ only in `identity`: the tab menu passes the `panel`, the chip
  * menu passes the `tabGroup`. No-op when no renderer could be created (no
  * factory configured, or the factory declined the component).
  */
  appendComponentItem(e, t, i, o, r, n) {
    var s, a;
    const d = (s = (a = this.accessor.options).createContextMenuItemComponent) === null || s === void 0 ? void 0 : s.call(a, {
      id: cs(),
      component: t.component
    });
    d && (n.addDisposables(d), d.init(O(O({}, i), {}, {
      group: o,
      api: this.accessor.api,
      close: r,
      componentProps: t.componentProps
    })), e.appendChild(d.element));
  }
  /**
  * The element for one built-in tab item, or `undefined` for a token this
  * version doesn't know (an app on a newer typings version, or plain JS):
  * an unrecognised token renders nothing rather than throwing.
  */
  buildBuiltInTabItem(e, t, i, o) {
    switch (e) {
      case "separator":
        return zi();
      case "close":
        return Q("Close", o, () => t.api.close());
      case "closeOthers":
        return Q("Close Others", o, () => {
          i.panels.filter((r) => r !== t).forEach((r) => r.api.close());
        });
      case "closeAll":
        return Q("Close All", o, () => {
          [...i.panels].forEach((r) => r.api.close());
        });
      case "closeLeft": {
        const r = i.panels.indexOf(t);
        return Q("Close to the Left", o, () => {
          i.panels.filter((n, s) => s < r).forEach((n) => n.api.close());
        }, r <= 0);
      }
      case "closeRight": {
        const r = i.panels.indexOf(t);
        return Q("Close to the Right", o, () => {
          i.panels.filter((n, s) => s > r).forEach((n) => n.api.close());
        }, r === -1 || r >= i.panels.length - 1);
      }
      case "maximize":
        return this.buildMaximizeItem(t, o);
      case "float":
        return Q("Float", o, () => this.accessor.api.addFloatingGroup(t), t.api.location.type === "floating");
      case "popout":
        return Q("Open in New Window", o, () => {
          this.accessor.api.addPopoutGroup(t);
        }, t.api.location.type === "popout");
      case "pin":
        return Q(t.api.isPinned ? "Unpin tab" : "Pin tab", o, () => t.api.setPinned(!t.api.isPinned));
      default:
        return;
    }
  }
  /**
  * Append one app-supplied item. A raw `element` is used as-is, a
  * `component` goes through the framework renderer, and a `label` builds the
  * default row; an item carrying none of the three renders nothing. Shared
  * by both menus, which differ only in `identity`.
  */
  appendConfigItem(e, t, i, o, r, n) {
    t.element ? e.appendChild(t.element) : t.component ? this.appendComponentItem(e, t, i, o, r, n) : t.label && e.appendChild(Q(t.label, r, () => {
      var s;
      return (s = t.action) === null || s === void 0 ? void 0 : s.call(t);
    }, t.disabled));
  }
  show(e, t, i) {
    const o = this._resolveTabItems(e, t, i);
    if (o.length === 0) return;
    i.preventDefault();
    const r = this.accessor.getPopupServiceForGroup(t), n = () => r.close(), s = new I(), a = document.createElement("div");
    a.className = "dv-context-menu", a.setAttribute("role", "menu");
    try {
      for (const d of o) {
        if (Pi(d)) {
          this.appendConfigItem(a, d, { panel: e }, t, n, s);
          continue;
        }
        const c = this.buildBuiltInTabItem(d, e, t, n);
        c && a.appendChild(c);
      }
    } catch (d) {
      throw s.dispose(), d;
    }
    r.openPopover(a, {
      x: i.clientX,
      y: i.clientY,
      zIndex: Gi(i.target, t)
    }, { onClose: () => s.dispose() });
  }
  showForChip(e, t, i) {
    if (!this.accessor.options.getTabGroupChipContextMenuItems) return;
    const o = this.accessor.options.getTabGroupChipContextMenuItems({
      tabGroup: e,
      group: t,
      api: this.accessor.api,
      event: i
    });
    if (o.length === 0) return;
    i.preventDefault();
    const r = this.accessor.getPopupServiceForGroup(t), n = () => r.close(), s = new I(), a = document.createElement("div");
    a.className = "dv-context-menu", a.setAttribute("role", "menu");
    try {
      for (const d of o) d === "separator" ? a.appendChild(zi()) : d === "rename" ? a.appendChild(vs(e)) : d === "colorPicker" ? a.appendChild(ps(e, this.accessor.tabGroupColorPalette)) : d === "collapse" ? a.appendChild(this.buildCollapseItem(e, n)) : d === "close" ? a.appendChild(Q("Close All", n, () => {
        t.panels.filter((c) => e.containsPanel(c.id)).forEach((c) => c.api.close());
      })) : Pi(d) && this.appendConfigItem(a, d, { tabGroup: e }, t, n, s);
    } catch (d) {
      throw s.dispose(), d;
    }
    r.openPopover(a, {
      x: i.clientX,
      y: i.clientY,
      zIndex: Gi(i.target, t)
    }, { onClose: () => s.dispose() });
  }
};
const gs = se({
  name: "ContextMenu",
  serviceKey: "contextMenuService",
  create: (e) => new us(e)
}), bs = [
  Wn,
  Fn,
  Un,
  jn,
  Kn,
  es,
  is,
  ss,
  ds,
  gs
];
var ms = class {
  constructor() {
    this.cache = /* @__PURE__ */ new WeakMap(), this.currentFrameId = 0, this.rafId = null;
  }
  getPosition(e) {
    const t = this.cache.get(e);
    if (t?.frameId === this.currentFrameId) return t.rect;
    this.scheduleFrameUpdate();
    const i = Pt(e);
    return this.cache.set(e, {
      rect: i,
      frameId: this.currentFrameId
    }), i;
  }
  invalidate() {
    this.currentFrameId++;
  }
  scheduleFrameUpdate() {
    this.rafId || (this.rafId = requestAnimationFrame(() => {
      this.currentFrameId++, this.rafId = null;
    }));
  }
};
const Ti = -1;
function fs() {
  const e = document.createElement("div");
  return e.tabIndex = -1, e;
}
var Ai = class extends I {
  constructor(e, t) {
    super(), this.element = e, this.accessor = t, this.map = {}, this._disposed = !1, this._generation = 0, this.positionCache = new ms(), this.addDisposables($.from(() => {
      for (const i of Object.values(this.map))
        i.disposable.dispose(), i.destroy.dispose(), this.cancelPendingUpdate(i);
      this._disposed = !0;
    }));
  }
  updateAllPositions() {
    if (!this._disposed) {
      this.positionCache.invalidate();
      for (const e of Object.values(this.map)) e.panel.api.isVisible && e.resize && e.resize();
    }
  }
  /**
  * Reposition a single panel's overlay over its reference container,
  * optionally forcing it visible even when the panel is not currently
  * "visible" (e.g. its group is collapsed). Used by the auto-hide peek to
  * slide an `always`-rendered panel out without reparenting it or mutating
  * the panel's visibility state. No-op if the panel isn't overlay-rendered.
  */
  repositionPanelOverlay(e, t = !1, i) {
    var o;
    if (this._disposed) return;
    const r = this.map[e];
    r && (r.forceVisible = t, r.clip = i, this.positionCache.invalidate(), (o = r.resize) === null || o === void 0 || o.call(r));
  }
  /**
  * Drop the reposition frame queued for a panel, if any. A queued frame is
  * bound to the reference container that was current when it was scheduled,
  * so it must be discarded whenever that container stops being the one the
  * overlay should track.
  */
  cancelPendingUpdate(e) {
    e.pendingUpdate !== void 0 && (cancelAnimationFrame(e.pendingUpdate), e.pendingUpdate = void 0);
  }
  detatch(e) {
    if (this.map[e.api.id]) {
      const t = this.map[e.api.id];
      return t.disposable.dispose(), t.destroy.dispose(), this.cancelPendingUpdate(t), delete this.map[e.api.id], !0;
    }
    return !1;
  }
  attach(e) {
    const { panel: t, referenceContainer: i } = e;
    if (!this.map[t.api.id]) {
      const v = fs();
      v.className = "dv-render-overlay", v.style.visibility = "hidden", this.map[t.api.id] = {
        panel: t,
        disposable: $.NONE,
        destroy: $.NONE,
        element: v,
        retainPreviousGeometry: !1,
        positioned: !1,
        generation: ++this._generation
      };
    }
    const o = this.map[t.api.id];
    o.referenceContainer !== i && (o.generation = ++this._generation, this.cancelPendingUpdate(o), o.referenceContainer = i, o.retainPreviousGeometry = o.positioned);
    const r = o.generation, n = o.element, s = t.view.content.element;
    s.parentElement !== n && n.appendChild(s), n.parentElement !== this.element && this.element.appendChild(n);
    const a = () => {
      const v = t.api.id, p = this.map[v];
      if (p?.generation !== r || p.pendingUpdate !== void 0) return;
      p.pendingUpdate = Ti;
      const u = requestAnimationFrame(() => {
        var g;
        const _ = this.map[v];
        if (_ && (_.pendingUpdate = void 0), this.isDisposed || _?.generation !== r) return;
        const C = (g = _.forceVisible) !== null && g !== void 0 ? g : !1, k = _.clip, y = this.positionCache.getPosition(i.element), P = this.positionCache.getPosition(this.element), M = y.left - P.left, E = y.top - P.top, w = y.width, x = y.height;
        if (_.retainPreviousGeometry && (w === 0 || x === 0)) {
          !t.api.isVisible && !C && (n.style.visibility = "hidden", n.style.pointerEvents = "none");
          return;
        }
        if (_.retainPreviousGeometry = !1, _.positioned = !0, n.style.left = `${M}px`, n.style.top = `${E}px`, n.style.width = `${w}px`, n.style.height = `${x}px`, t.api.isVisible || C ? (n.style.visibility = "", n.style.pointerEvents = "") : (n.style.visibility = "hidden", n.style.pointerEvents = "none"), C ? n.style.zIndex = "1000" : t.api.location.type !== "floating" && (n.style.zIndex = ""), k) {
          var f, b;
          const m = this.element.ownerDocument.defaultView, S = (f = m?.scrollX) !== null && f !== void 0 ? f : 0, G = (b = m?.scrollY) !== null && b !== void 0 ? b : 0, A = k.top + G, V = k.left + S, R = Math.max(0, A - y.top), L = Math.max(0, V - y.left), K = Math.max(0, y.left + w - (k.right + S)), ge = Math.max(0, y.top + x - (k.bottom + G));
          n.style.clipPath = `inset(${R}px ${K}px ${ge}px ${L}px)`;
        } else n.style.clipPath = "";
        z(n, "dv-render-overlay-float", t.group.api.location.type === "floating");
      });
      p.pendingUpdate === Ti && (p.pendingUpdate = u);
    }, d = () => {
      if (t.api.isVisible) {
        var v;
        this.positionCache.invalidate(), a(), !((v = this.map[t.api.id]) === null || v === void 0) && v.retainPreviousGeometry && (n.style.visibility = ""), n.style.pointerEvents = "";
      } else
        n.style.visibility = "hidden", n.style.pointerEvents = "none";
    }, c = new j(), l = () => {
      t.api.location.type === "floating" ? queueMicrotask(() => {
        if (h.isDisposed) return;
        const v = this.accessor.getFloatingWindowForGroup(t.api.group);
        if (!v) return;
        const p = v.overlay.element, u = () => {
          const _ = Number(p.getAttribute("aria-level"));
          n.style.zIndex = `calc(var(--dv-overlay-z-index, 999) + ${_ * 2 + 1})`;
        }, g = new MutationObserver(() => {
          u();
        });
        c.value = $.from(() => g.disconnect()), g.observe(p, {
          attributeFilter: ["aria-level"],
          attributes: !0
        }), u();
      }) : n.style.zIndex = "";
    }, h = new I(
      c,
      /**
      * since container is positioned absoutely we must explicitly forward
      * the dnd events for the expect behaviours to continue to occur in terms of dnd
      *
      * the dnd observer does not need to be conditional on whether the panel is visible since
      * non-visible panels have 'pointer-events: none' and in such case the dnd observer will not fire.
      */
      new Do(n, {
        onDragEnd: (v) => {
          i.dropTarget.dnd.onDragEnd(v);
        },
        onDragEnter: (v) => {
          i.dropTarget.dnd.onDragEnter(v);
        },
        onDragLeave: (v) => {
          i.dropTarget.dnd.onDragLeave(v);
        },
        onDrop: (v) => {
          i.dropTarget.dnd.onDrop(v);
        },
        onDragOver: (v) => {
          i.dropTarget.dnd.onDragOver(v);
        }
      }),
      t.api.onDidVisibilityChange(() => {
        d();
      }),
      t.api.onDidDimensionsChange(() => {
        t.api.isVisible && a();
      }),
      t.api.onDidLocationChange(() => {
        l();
      })
    );
    return this.map[t.api.id].destroy = $.from(() => {
      s.parentElement === n && s.remove(), n.remove();
    }), l(), queueMicrotask(() => {
      this.isDisposed || d();
    }), this.map[t.api.id].disposable.dispose(), this.map[t.api.id].disposable = h, this.map[t.api.id].resize = a, n;
  }
}, _s = class extends I {
  constructor(e) {
    super(), this.accessor = e, this.init();
  }
  init() {
    const e = /* @__PURE__ */ new Set(), t = /* @__PURE__ */ new Set();
    this.addDisposables(this.accessor.onDidAddPanel((i) => {
      if (e.has(i.api.id)) throw new Error(`dockview: Invalid event sequence. [onDidAddPanel] called for panel ${i.api.id} but panel already exists`);
      e.add(i.api.id);
    }), this.accessor.onDidRemovePanel((i) => {
      if (e.has(i.api.id)) e.delete(i.api.id);
      else throw new Error(`dockview: Invalid event sequence. [onDidRemovePanel] called for panel ${i.api.id} but panel does not exists`);
    }), this.accessor.onDidAddGroup((i) => {
      if (t.has(i.api.id)) throw new Error(`dockview: Invalid event sequence. [onDidAddGroup] called for group ${i.api.id} but group already exists`);
      t.add(i.api.id);
    }), this.accessor.onDidRemoveGroup((i) => {
      if (t.has(i.api.id)) t.delete(i.api.id);
      else throw new Error(`dockview: Invalid event sequence. [onDidRemoveGroup] called for group ${i.api.id} but group does not exists`);
    }));
  }
};
function ws(e) {
  if (!e.matchMedia) return !1;
  const t = e.matchMedia("(pointer: coarse)").matches, i = e.matchMedia("(pointer: fine)").matches;
  return t && !i;
}
function xs(e) {
  var t, i, o, r, n, s, a;
  const d = (t = e.window) !== null && t !== void 0 ? t : window, c = (i = e.capture) !== null && i !== void 0 ? i : !1, l = (o = e.escape) !== null && o !== void 0 ? o : !0, h = (r = e.keys) !== null && r !== void 0 ? r : [], v = (n = e.outsidePointerDown) !== null && n !== void 0 ? n : !0, p = (s = e.pointerDownGraceMs) !== null && s !== void 0 ? s : 0, u = (a = e.now) !== null && a !== void 0 ? a : Date.now, g = u(), _ = new I(), C = (k) => {
    var y, P;
    return e.isInside ? e.isInside(k) : Gt(k, (y = (P = e.elements) === null || P === void 0 ? void 0 : P.call(e)) !== null && y !== void 0 ? y : []);
  };
  if ((l || h.length > 0) && _.addDisposables(T(d, "keydown", (k) => {
    (l && k.key === "Escape" || h.includes(k.key)) && e.onDismiss();
  }, c)), (v || e.onInsidePointerDown) && _.addDisposables(T(d, "pointerdown", (k) => {
    if (C(k)) {
      var y;
      (y = e.onInsidePointerDown) === null || y === void 0 || y.call(e, k);
      return;
    }
    !v || u() - g < p || e.onDismiss();
  }, c)), e.resize && _.addDisposables(T(d, "resize", () => {
    ws(d) || e.onDismiss();
  })), e.focusOut) {
    const k = () => {
      var w, x, f;
      return (w = (x = e.anchor) === null || x === void 0 ? void 0 : x.call(e)) !== null && w !== void 0 ? w : (f = e.elements) === null || f === void 0 ? void 0 : f.call(e)[0];
    }, y = /* @__PURE__ */ new WeakSet(), P = (w) => {
      var x, f;
      if (y.has(w)) return;
      y.add(w);
      const b = w.target;
      b instanceof Element && ((e.isFocusInside ? e.isFocusInside(nr(b, k())) : Gt(w, (x = (f = e.elements) === null || f === void 0 ? void 0 : f.call(e)) !== null && x !== void 0 ? x : [])) || e.onDismiss());
    }, M = /* @__PURE__ */ new Map(), E = () => {
      var w, x, f;
      const b = /* @__PURE__ */ new Set(), m = (w = e.anchor) === null || w === void 0 ? void 0 : w.call(e), S = [...(x = (f = e.elements) === null || f === void 0 ? void 0 : f.call(e)) !== null && x !== void 0 ? x : [], ...m ? [m] : []];
      for (const G of S) for (const A of rr(G)) b.add(A);
      for (const [G, A] of M) b.has(G) || (A.dispose(), M.delete(G));
      for (const G of b)
        M.has(G) || M.set(G, T(G, "focusin", P, c));
    };
    _.addDisposables(T(d, "focusin", (w) => {
      E(), P(w);
    }, c), { dispose: () => {
      for (const [, w] of M) w.dispose();
      M.clear();
    } }), E();
  }
  return _;
}
var Ei = class extends I {
  constructor(e, t = globalThis.window) {
    super(), this._active = null, this._activeDisposable = new j(), this._root = e, this._window = t, this._element = t.document.createElement("div"), this._element.className = "dv-popover-anchor", this._element.style.position = "relative", this._root.prepend(this._element), this.addDisposables($.from(() => {
      this.close();
    }), this._activeDisposable);
  }
  /**
  * Move the popup anchor into a new root element. Call this when a shell
  * wraps the dockview component so that edge-group overflow dropdowns
  * position correctly relative to the full layout area.
  */
  updateRoot(e) {
    e.prepend(this._element), this._root = e;
  }
  openPopover(e, t, i) {
    var o;
    this.close();
    const r = this._window.document.createElement("div");
    r.style.position = "absolute", r.style.zIndex = (o = t.zIndex) !== null && o !== void 0 ? o : "var(--dv-overlay-z-index)", r.appendChild(e);
    const n = this._element.getBoundingClientRect(), s = n.left, a = n.top;
    r.style.top = `${t.y - a}px`, r.style.left = `${t.x - s}px`, this._element.appendChild(r), this._active = r;
    const d = 200;
    this._activeDisposable.value = new I(xs({
      window: this._window,
      onDismiss: () => this.close(),
      elements: () => this._active ? [this._active] : [],
      keys: ["Enter"],
      pointerDownGraceMs: d,
      resize: !0
    }), i?.onClose ? $.from(i.onClose) : $.NONE), this._window.requestAnimationFrame(() => {
      hr(r, this._root);
    });
  }
  close() {
    this._active && (this._active.remove(), this._activeDisposable.dispose(), this._active = null);
  }
}, xt = class extends I {
  /**
  * The element the live overlay was rendered for, `undefined` when nothing
  * is showing. The container is shared by every drop target, so a caller
  * tearing down only its own overlay must check this before `clear()`.
  */
  get renderedOutline() {
    return this._model ? this._outline : void 0;
  }
  get disabled() {
    return this._disabled;
  }
  set disabled(e) {
    this.disabled !== e && (this._disabled = e, e && this._clearNow());
  }
  _cancelPendingClear() {
    this._pendingClear !== void 0 && (clearTimeout(this._pendingClear), this._pendingClear = void 0);
  }
  _clearNow() {
    this._cancelPendingClear(), this._model && this._model.root.remove(), this._model = void 0;
  }
  get model() {
    if (!this.disabled)
      return {
        clear: () => {
          this._clearNow();
        },
        scheduleClear: () => {
          this._pendingClear !== void 0 || !this._model || (this._pendingClear = setTimeout(() => {
            this._pendingClear = void 0, this._clearNow();
          }, 0));
        },
        exists: () => !!this._model,
        getElements: (e, t) => {
          this._cancelPendingClear();
          const i = this._outline !== t;
          if (this._outline = t, this._model)
            return this._model.changed = i, this._model;
          const o = this.createContainer(), r = this.createAnchor();
          if (this._model = {
            root: o,
            overlay: r,
            changed: i
          }, o.appendChild(r), this.element.appendChild(o), e?.target instanceof HTMLElement) {
            const n = e.target.getBoundingClientRect(), s = this.element.getBoundingClientRect();
            r.style.left = `${n.left - s.left}px`, r.style.top = `${n.top - s.top}px`;
          }
          return this._model;
        }
      };
  }
  constructor(e, t) {
    super(), this.element = e, this._disabled = !1, this._disabled = t.disabled, this.addDisposables($.from(() => {
      var i;
      (i = this.model) === null || i === void 0 || i.clear();
    }));
  }
  createContainer() {
    const e = document.createElement("div");
    return e.className = "dv-drop-target-container", e;
  }
  createAnchor() {
    const e = document.createElement("div");
    return e.className = "dv-drop-target-anchor", e.style.visibility = "hidden", e;
  }
}, ys = class {
  /**
  * The effective (pre-gap) collapsed size: the measured tab-strip size when
  * available, otherwise the configured/theme base.
  */
  get _effectiveBaseCollapsed() {
    var e;
    return (e = this._measuredTabSize) !== null && e !== void 0 ? e : this._baseCollapsedSize;
  }
  get minimumSize() {
    return this._isCollapsed ? this.collapsedSize : this._baseMinimumSize !== void 0 ? this._baseMinimumSize + this._gapAdd : this._effectiveBaseCollapsed + 50 + this._gapAdd;
  }
  get maximumSize() {
    return this._isCollapsed ? this.collapsedSize : this._expandedMaximumSize;
  }
  get element() {
    return this._group.element;
  }
  get isCollapsed() {
    return this._isCollapsed;
  }
  /** Includes the gap share, as expanding restores a slot size. */
  get lastExpandedSize() {
    return this._lastExpandedSize;
  }
  /** Without the gap share. */
  get lastExpandedContentSize() {
    return this._lastExpandedSize - this._gapAdd;
  }
  get collapsedSize() {
    return this._effectiveBaseCollapsed + this._gapAdd;
  }
  /** The user-configured (pre-gap) geometry constraints, for serialization.
  *  These are the raw values passed to `addEdgeGroup`, unlike the effective
  *  `minimumSize`/`maximumSize`/`collapsedSize` getters, which fold in the
  *  theme gap and collapse-locking. */
  get configuredMinimumSize() {
    return this._baseMinimumSize;
  }
  get configuredMaximumSize() {
    return this._expandedMaximumSize;
  }
  get configuredCollapsedSize() {
    return this._baseCollapsedSize;
  }
  constructor(e, t, i, o = 0) {
    var r, n, s;
    this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this.snap = !1, this.priority = "low", this._isCollapsed = !1, this._tabSizeDisposables = new I(), this._group = t, this._orientation = i, t.element.classList.add("dv-edge-group"), t.element.dataset.testid = `dv-edge-group-${e.id}`, this._baseCollapsedSize = (r = e.collapsedSize) !== null && r !== void 0 ? r : 35, this._baseMinimumSize = e.minimumSize, this._gapAdd = o, this._expandedMaximumSize = (n = e.maximumSize) !== null && n !== void 0 ? n : Number.POSITIVE_INFINITY, this._lastExpandedSize = (s = e.initialSize) !== null && s !== void 0 ? s : 200, e.collapsed && (this._isCollapsed = !0, t.element.classList.add("dv-edge-collapsed")), this._observeTabStrip();
  }
  /**
  * Watch the group's tab strip so the collapsed size follows the live tab
  * height. The strip's cross-axis size (height for top/bottom, width for
  * left/right) is exactly what a collapsed edge group should occupy; a
  * ResizeObserver keeps them in sync when the tab height changes at runtime.
  */
  _observeTabStrip() {
    const e = this._group.element.querySelector(".dv-tabs-and-actions-container");
    e && this._tabSizeDisposables.addDisposables(ke(e, () => {
      this._applyMeasuredTabSize(this._orientation === "vertical" ? e.offsetHeight : e.offsetWidth);
    }));
  }
  /**
  * Apply a freshly-measured tab-strip cross size. When the group is
  * collapsed this resizes it in the parent splitview so the collapsed strip
  * always shows the full tab height.
  */
  _applyMeasuredTabSize(e) {
    e <= 0 || e === this._measuredTabSize || (this._measuredTabSize = e, this._isCollapsed && this._onDidChange.fire({ size: this.collapsedSize }));
  }
  layout(e, t) {
    this._isCollapsed || (this._lastExpandedSize = e + this._gapAdd), this._orientation === "horizontal" ? this._group.layout(e, t) : this._group.layout(t, e);
  }
  setCollapsed(e) {
    this._isCollapsed !== e && (this._isCollapsed = e, this._group.element.classList.toggle("dv-edge-collapsed", e));
  }
  setVisible(e) {
  }
  /**
  * Restore the last-expanded size from serialized state without triggering
  * a layout. Must be called before setCollapsed(true) during fromJSON so
  * that expanding after deserialization restores the correct size.
  */
  restoreExpandedSize(e) {
    this._lastExpandedSize = e;
  }
  /**
  * Apply a new base (pre-gap) collapsed size, base minimum size and gap
  * contribution after a theme or gap change. Base values come from the
  * original config; the ShellManager owns the gap arithmetic. A live
  * measured tab size (if any) continues to win over the base collapsed size.
  */
  updateSizing(e, t, i) {
    this._baseCollapsedSize = e, this._baseMinimumSize = t, this._gapAdd = i;
  }
  dispose() {
    this._tabSizeDisposables.dispose(), this._onDidChange.dispose();
  }
}, Ds = class {
  get element() {
    return this._dockviewElement;
  }
  constructor(e, t) {
    this._dockviewElement = e, this._layoutDockview = t, this.priority = "high", this.minimumSize = 100, this.maximumSize = Number.POSITIVE_INFINITY, this._onDidChange = new D(), this.onDidChange = this._onDidChange.event;
  }
  layout(e, t) {
    this._layoutDockview(t, e);
  }
  setVisible(e) {
  }
  dispose() {
    this._onDidChange.dispose();
  }
}, ks = class {
  get element() {
    return this._element;
  }
  constructor(e, t = 0) {
    this._onDidChange = new D(), this.onDidChange = this._onDidChange.event, this.minimumSize = 100, this.maximumSize = Number.POSITIVE_INFINITY, this.priority = "high", this._element = document.createElement("div"), this._element.className = "dv-shell-middle-column", this._element.style.height = "100%", this._element.style.width = "100%", this._splitview = new at(this._element, {
      orientation: "VERTICAL",
      proportionalLayout: !1,
      margin: t
    }), this._centerIndex = 0, this._splitview.addView(e, { type: "distribute" }, 0);
  }
  addTopView(e, t) {
    this._splitview.addView(e, t, 0), this._topIndex = 0, this._centerIndex += 1, this._bottomIndex !== void 0 && (this._bottomIndex += 1);
  }
  addBottomView(e, t) {
    const i = this._splitview.length;
    this._splitview.addView(e, t, i), this._bottomIndex = i;
  }
  removeView(e) {
    const t = e === "top" ? this._topIndex : this._bottomIndex;
    t !== void 0 && (this._splitview.removeView(t), e === "top" ? (this._topIndex = void 0, this._centerIndex -= 1, this._bottomIndex !== void 0 && (this._bottomIndex -= 1)) : this._bottomIndex = void 0);
  }
  layout(e, t) {
    this._splitview.layout(t, e);
  }
  setVisible(e) {
  }
  setViewVisible(e, t) {
    const i = e === "top" ? this._topIndex : this._bottomIndex;
    i !== void 0 && this._splitview.setViewVisible(i, t);
  }
  isViewVisible(e) {
    const t = e === "top" ? this._topIndex : this._bottomIndex;
    return t !== void 0 ? this._splitview.isViewVisible(t) : !1;
  }
  getViewSize(e) {
    const t = e === "top" ? this._topIndex : this._bottomIndex;
    return t !== void 0 ? this._splitview.getViewSize(t) : 0;
  }
  getViewCachedVisibleSize(e) {
    const t = e === "top" ? this._topIndex : this._bottomIndex;
    if (t !== void 0) return this._splitview.getViewCachedVisibleSize(t);
  }
  resizeView(e, t) {
    const i = e === "top" ? this._topIndex : this._bottomIndex;
    i !== void 0 && this._splitview.resizeView(i, t);
  }
  /** The inner splitview's primary-axis (height) extent; zero until laid out. */
  get axisSize() {
    return this._splitview.size;
  }
  updateMargin(e) {
    this._splitview.margin = e;
  }
  dispose() {
    this._onDidChange.dispose(), this._splitview.dispose();
  }
}, Cs = class {
  constructor(e, t, i, o = 0, r = 35) {
    this._disposables = new I(), this._viewConfigs = /* @__PURE__ */ new Map(), this._pendingSizes = /* @__PURE__ */ new Map(), this._currentWidth = 0, this._currentHeight = 0, this._gap = o, this._defaultCollapsedSize = r, this._shellElement = document.createElement("div"), this._shellElement.className = "dv-shell", this._shellElement.style.height = "100%", this._shellElement.style.width = "100%", this._shellElement.style.position = "relative", e.appendChild(this._shellElement);
    const n = new Ds(t, i);
    this._middleColumn = new ks(n, o), this._outerSplitview = new at(this._shellElement, {
      orientation: "HORIZONTAL",
      proportionalLayout: !1,
      margin: o
    }), this._middleIndex = 0, this._outerSplitview.addView(this._middleColumn, { type: "distribute" }, 0), this._disposables.addDisposables(ke(this._shellElement, (s) => {
      if (!this._shellElement.offsetParent || !st(this._shellElement)) return;
      const a = Math.round(s.contentRect.width), d = Math.round(s.contentRect.height);
      a === this._currentWidth && d === this._currentHeight || (this._currentWidth = a, this._currentHeight = d, this.layout(a, d));
    }), this._outerSplitview, this._middleColumn, n);
  }
  get element() {
    return this._shellElement;
  }
  /**
  * Add an edge group view at the given position. The view wraps the
  * provided group element inside the shell's splitview layout.
  * Throws if a group at this position is already registered.
  */
  addEdgeView(e, t, i) {
    if (this.hasEdgeGroup(e)) throw new Error(`dockview: edge group already registered at position '${e}'`);
    this._viewConfigs.set(e, t);
    const o = 1 + (this._viewConfigs.has("left") ? 1 : 0) + (this._viewConfigs.has("right") ? 1 : 0), r = 1 + (this._viewConfigs.has("top") ? 1 : 0) + (this._viewConfigs.has("bottom") ? 1 : 0), n = o > 1 ? this._gap * (o - 1) / o : 0, s = r > 1 ? this._gap * (r - 1) / r : 0, a = e === "left" || e === "right", d = a ? n : s, c = a ? "horizontal" : "vertical", l = new ys(O({ collapsedSize: this._defaultCollapsedSize }, t), i, c, d), h = l.isCollapsed ? l.collapsedSize : l.lastExpandedSize;
    switch (e) {
      case "left":
        this._outerSplitview.addView(l, h, 0), this._leftIndex = 0, this._middleIndex += 1, this._rightIndex !== void 0 && (this._rightIndex += 1), this._leftView = l;
        break;
      case "right":
        {
          const v = this._outerSplitview.length;
          this._outerSplitview.addView(l, h, v), this._rightIndex = v, this._rightView = l;
        }
        break;
      case "top":
        this._middleColumn.addTopView(l, h), this._topView = l;
        break;
      case "bottom":
        this._middleColumn.addBottomView(l, h), this._bottomView = l;
        break;
    }
    return this._disposables.addDisposables(l), !l.isCollapsed && !this._canResize(e) && this._pendingSizes.set(e, h), this.updateTheme(this._gap, this._defaultCollapsedSize), l;
  }
  /**
  * Lay out from the shell's current size.
  *
  * The ResizeObserver above only reports asynchronously, so between
  * construction and its first callback the shell believes it has no size -
  * and any layout built in that window (panels added straight after
  * `createDockview`, say) resolves its sizes against zero and collapses to
  * minimums, permanently. Seeding the size synchronously gives that work
  * the real dimensions. Same guards as the observer: a detached or hidden
  * shell has no size worth propagating.
  */
  layoutFromElement() {
    if (!this._shellElement.offsetParent || !st(this._shellElement)) return;
    const e = Math.round(this._shellElement.clientWidth), t = Math.round(this._shellElement.clientHeight);
    e === 0 || t === 0 || this.layout(e, t);
  }
  layout(e, t) {
    this._outerSplitview.layout(e, t), this._flushPendingSizes();
  }
  /**
  * Called when the active theme changes. Updates splitview margins and
  * edge-group collapsed sizes so the layout matches the new theme's gap
  * and tab-strip dimensions.
  */
  updateTheme(e, t) {
    var i, o, r, n;
    this._gap = e, this._defaultCollapsedSize = t;
    const s = 1 + (this._viewConfigs.has("left") ? 1 : 0) + (this._viewConfigs.has("right") ? 1 : 0), a = 1 + (this._viewConfigs.has("top") ? 1 : 0) + (this._viewConfigs.has("bottom") ? 1 : 0), d = s > 1 ? e * (s - 1) / s : 0, c = a > 1 ? e * (a - 1) / a : 0;
    this._outerSplitview.margin = e, this._middleColumn.updateMargin(e);
    const l = (g, _, C) => {
      var k;
      const y = (k = _.collapsedSize) !== null && k !== void 0 ? k : t;
      g.updateSizing(y, _.minimumSize, C);
    }, h = this._viewConfigs.get("top");
    this._topView && h && l(this._topView, h, c);
    const v = this._viewConfigs.get("bottom");
    this._bottomView && v && l(this._bottomView, v, c);
    const p = this._viewConfigs.get("left");
    this._leftView && p && l(this._leftView, p, d);
    const u = this._viewConfigs.get("right");
    this._rightView && u && l(this._rightView, u, d), !((i = this._leftView) === null || i === void 0) && i.isCollapsed && this._leftIndex !== void 0 && this._outerSplitview.resizeView(this._leftIndex, this._leftView.collapsedSize), !((o = this._rightView) === null || o === void 0) && o.isCollapsed && this._rightIndex !== void 0 && this._outerSplitview.resizeView(this._rightIndex, this._rightView.collapsedSize), !((r = this._topView) === null || r === void 0) && r.isCollapsed && this._middleColumn.resizeView("top", this._topView.collapsedSize), !((n = this._bottomView) === null || n === void 0) && n.isCollapsed && this._middleColumn.resizeView("bottom", this._bottomView.collapsedSize), this._currentWidth > 0 && this._currentHeight > 0 && this.layout(this._currentWidth, this._currentHeight);
  }
  removeEdgeView(e) {
    const t = this._getView(e);
    if (t) {
      switch (e) {
        case "left":
          this._outerSplitview.removeView(this._leftIndex), this._leftIndex = void 0, this._leftView = void 0, this._middleIndex -= 1, this._rightIndex !== void 0 && (this._rightIndex -= 1);
          break;
        case "right":
          this._outerSplitview.removeView(this._rightIndex), this._rightIndex = void 0, this._rightView = void 0;
          break;
        case "top":
          this._middleColumn.removeView("top"), this._topView = void 0;
          break;
        case "bottom":
          this._middleColumn.removeView("bottom"), this._bottomView = void 0;
          break;
      }
      this._disposables.removeDisposable(t), t.dispose(), this._viewConfigs.delete(e), this._pendingSizes.delete(e), this.updateTheme(this._gap, this._defaultCollapsedSize);
    }
  }
  hasEdgeGroup(e) {
    switch (e) {
      case "top":
        return this._topView !== void 0;
      case "bottom":
        return this._bottomView !== void 0;
      case "left":
        return this._leftView !== void 0;
      case "right":
        return this._rightView !== void 0;
    }
  }
  setEdgeGroupVisible(e, t) {
    switch (e) {
      case "left":
        this._leftIndex !== void 0 && this._outerSplitview.setViewVisible(this._leftIndex, t);
        break;
      case "right":
        this._rightIndex !== void 0 && this._outerSplitview.setViewVisible(this._rightIndex, t);
        break;
      case "top":
      case "bottom":
        this._middleColumn.setViewVisible(e, t);
        break;
    }
    t && this._flushPendingSizes();
  }
  isEdgeGroupVisible(e) {
    switch (e) {
      case "left":
        return this._leftIndex !== void 0 ? this._outerSplitview.isViewVisible(this._leftIndex) : !1;
      case "right":
        return this._rightIndex !== void 0 ? this._outerSplitview.isViewVisible(this._rightIndex) : !1;
      case "top":
      case "bottom":
        return this._middleColumn.isViewVisible(e);
    }
  }
  setEdgeGroupCollapsed(e, t) {
    const i = this._getView(e);
    i && (i.setCollapsed(t), t ? (this._pendingSizes.delete(e), this._resizeView(e, i.collapsedSize)) : this.resizeEdgeGroup(e, i.lastExpandedSize));
  }
  /**
  * Resize the edge group at `position` along its primary axis (width for
  * `left`/`right`, height for `top`/`bottom`), clamped by the group's
  * constraints and the space available. Where `groupApi.setSize` lands.
  *
  * The size becomes the group's expanded size, so a collapsed group keeps
  * its strip and takes it on expand, and it survives a `toJSON` round-trip.
  */
  resizeEdgeGroup(e, t) {
    const i = this._getView(e);
    if (!i || !Number.isFinite(t)) return;
    const o = Math.round(t);
    if (!(o <= 0)) {
      if (i.restoreExpandedSize(o), i.isCollapsed) {
        this._pendingSizes.delete(e);
        return;
      }
      this._canResize(e) ? (this._pendingSizes.delete(e), this._resizeView(e, o)) : this._pendingSizes.set(e, o);
    }
  }
  /** A resize lands only on a visible view (a hidden one is pinned to zero)
  *  whose splitview has extent to distribute. */
  _canResize(e) {
    return this.isEdgeGroupVisible(e) ? (e === "left" || e === "right" ? this._outerSplitview.size : this._middleColumn.axisSize) > 0 : !1;
  }
  _resizeView(e, t) {
    switch (e) {
      case "left":
        this._leftIndex !== void 0 && this._outerSplitview.resizeView(this._leftIndex, t);
        break;
      case "right":
        this._rightIndex !== void 0 && this._outerSplitview.resizeView(this._rightIndex, t);
        break;
      case "top":
      case "bottom":
        this._middleColumn.resizeView(e, t);
        break;
    }
  }
  _flushPendingSizes() {
    if (this._pendingSizes.size !== 0)
      for (const [e, t] of this._pendingSizes) {
        const i = this._getView(e);
        !i || i.isCollapsed || !this._canResize(e) || (this._pendingSizes.delete(e), this._resizeView(e, t));
      }
  }
  isEdgeGroupCollapsed(e) {
    var t, i;
    return (t = (i = this._getView(e)) === null || i === void 0 ? void 0 : i.isCollapsed) !== null && t !== void 0 ? t : !1;
  }
  /** The size an edge group expands to (its pre-collapse size), used to size
  *  the auto-hide peek overlay. */
  getEdgeGroupExpandedSize(e) {
    var t, i;
    return (t = (i = this._getView(e)) === null || i === void 0 ? void 0 : i.lastExpandedContentSize) !== null && t !== void 0 ? t : 0;
  }
  _getView(e) {
    switch (e) {
      case "top":
        return this._topView;
      case "bottom":
        return this._bottomView;
      case "left":
        return this._leftView;
      case "right":
        return this._rightView;
    }
  }
  toJSON() {
    const e = {}, t = (o) => ({
      minimumSize: o.configuredMinimumSize,
      maximumSize: Number.isFinite(o.configuredMaximumSize) ? o.configuredMaximumSize : void 0,
      collapsedSize: o.configuredCollapsedSize
    }), i = (o, r, n, s, a) => {
      if (o.isCollapsed) return o.lastExpandedSize;
      const d = this._pendingSizes.get(r);
      return d !== void 0 ? d : n ? s : a ?? o.lastExpandedSize;
    };
    if (this._leftView && this._leftIndex !== void 0) {
      const o = this._outerSplitview.isViewVisible(this._leftIndex);
      e.left = O({
        size: i(this._leftView, "left", o, this._outerSplitview.getViewSize(this._leftIndex), this._outerSplitview.getViewCachedVisibleSize(this._leftIndex)),
        visible: o,
        collapsed: this._leftView.isCollapsed || void 0
      }, t(this._leftView));
    }
    if (this._rightView && this._rightIndex !== void 0) {
      const o = this._outerSplitview.isViewVisible(this._rightIndex);
      e.right = O({
        size: i(this._rightView, "right", o, this._outerSplitview.getViewSize(this._rightIndex), this._outerSplitview.getViewCachedVisibleSize(this._rightIndex)),
        visible: o,
        collapsed: this._rightView.isCollapsed || void 0
      }, t(this._rightView));
    }
    if (this._topView) {
      const o = this._middleColumn.isViewVisible("top");
      e.top = O({
        size: i(this._topView, "top", o, this._middleColumn.getViewSize("top"), this._middleColumn.getViewCachedVisibleSize("top")),
        visible: o,
        collapsed: this._topView.isCollapsed || void 0
      }, t(this._topView));
    }
    if (this._bottomView) {
      const o = this._middleColumn.isViewVisible("bottom");
      e.bottom = O({
        size: i(this._bottomView, "bottom", o, this._middleColumn.getViewSize("bottom"), this._middleColumn.getViewCachedVisibleSize("bottom")),
        visible: o,
        collapsed: this._bottomView.isCollapsed || void 0
      }, t(this._bottomView));
    }
    return e;
  }
  fromJSON(e) {
    for (const i of [
      "left",
      "right",
      "top",
      "bottom"
    ]) {
      var t;
      const o = e[i], r = this._getView(i);
      !o || !r || (r.restoreExpandedSize(o.size), r.setCollapsed((t = o.collapsed) !== null && t !== void 0 ? t : !1), o.collapsed ? (this._pendingSizes.delete(i), this._resizeView(i, r.collapsedSize)) : this.resizeEdgeGroup(i, o.size), this.setEdgeGroupVisible(i, !!o.visible));
    }
  }
  dispose() {
    this._disposables.dispose(), this._shellElement.remove();
  }
};
function Ii(e) {
  e.error ? console.error("dockview: failed to create popout.", e.error) : e.reason === "blocked" ? console.error("dockview: failed to create popout. perhaps you need to allow pop-ups for this website") : console.error(`dockview: failed to create popout (${e.reason}).`);
}
function Ss(e) {
  var t;
  return new Ro((t = e.tabGroupColors) !== null && t !== void 0 ? t : jt, e.tabGroupAccent !== "off");
}
function Qe(e) {
  const t = e.from.activePanel;
  [...e.from.panels].map((i) => {
    const o = e.from.model.removePanel(i);
    return e.from.model.renderContainer.detatch(i), o;
  }).forEach((i) => {
    e.to.model.openPanel(i, {
      skipSetActive: t !== i,
      skipSetGroupActive: !0
    });
  });
}
const Rt = () => ({ dispose: () => {
} }), Gs = Rt;
var Ps = class extends yr {
  fireDidCreateTabGroup(e) {
    this._onDidCreateTabGroup.fire(e);
  }
  fireDidDestroyTabGroup(e) {
    this._onDidDestroyTabGroup.fire(e);
  }
  fireDidAddPanelToTabGroup(e) {
    this._onDidAddPanelToTabGroup.fire(e);
  }
  fireDidRemovePanelFromTabGroup(e) {
    this._onDidRemovePanelFromTabGroup.fire(e);
  }
  fireDidTabGroupChange(e) {
    this._onDidTabGroupChange.fire(e);
  }
  fireDidTabGroupCollapsedChange(e) {
    this._onDidTabGroupCollapsedChange.fire(e);
  }
  get orientation() {
    return this.gridview.orientation;
  }
  get totalPanels() {
    return this.panels.length;
  }
  get panels() {
    return this.groups.flatMap((e) => e.panels);
  }
  /** `dndStrategy` resolved against this device; see `DockviewApi`. */
  get dndCapabilities() {
    return te(this.options);
  }
  get options() {
    return this._options;
  }
  get tabGroupColorPalette() {
    return this._tabGroupColorPalette;
  }
  get activePanel() {
    const e = this.activeGroup;
    if (e)
      return e.activePanel;
  }
  get renderer() {
    var e;
    return (e = this.options.defaultRenderer) !== null && e !== void 0 ? e : "onlyWhenVisible";
  }
  get defaultHeaderPosition() {
    var e;
    return (e = this.options.defaultHeaderPosition) !== null && e !== void 0 ? e : "top";
  }
  get api() {
    return this._api;
  }
  get floatingGroups() {
    var e, t;
    return (e = (t = this._moduleRegistry) === null || t === void 0 || (t = t.services.floatingGroupService) === null || t === void 0 ? void 0 : t.floatingGroups) !== null && e !== void 0 ? e : [];
  }
  /**
  * Resolve the floating window hosting `group`, matched by membership so it
  * finds nested (non-anchor) members too — a floating window can host a
  * whole nested gridview, not just its anchor group. Returns `undefined`
  * when the group isn't in any floating window. `floatingGroups` alone only
  * exposes each window's anchor, so consumers that must act on any member
  * (e.g. lifting an `always`-rendered panel's overlay above the window)
  * should use this instead of a `.find(f => f.group === group)`.
  */
  getFloatingWindowForGroup(e) {
    var t;
    return (t = this._floatingGroupService) === null || t === void 0 ? void 0 : t.findByGroup(e);
  }
  /**
  * Boxes of the floating groups other than `exclude`, in coordinates
  * relative to the floating overlay container. Supplied to a
  * `transformFloatingGroupDrag` callback as `context.others` so it can
  * align the dragged float against its siblings.
  */
  _gatherFloatingGroupBoxes(e) {
    return this.getFloatingGroupSnapshots(e).map((t) => t.box);
  }
  /**
  * ISmartGuidesHost: the positioning parent floats are placed in, also the
  * coordinate space the Smart Guides overlay draws its alignment lines in.
  */
  getFloatingContainer() {
    var e;
    return (e = this._floatingOverlayHost) !== null && e !== void 0 ? e : this.gridview.element;
  }
  /** ISmartGuidesHost: the other floats' group identity + container-relative
  *  box, for the snap-together detector. */
  getFloatingGroupSnapshots(e) {
    const t = this.getFloatingContainer().getBoundingClientRect();
    return this.floatingGroups.filter((i) => i.group !== e).map((i) => {
      const o = i.overlay.element.getBoundingClientRect();
      return {
        group: i.group,
        box: {
          left: o.left - t.left,
          top: o.top - t.top,
          width: o.width,
          height: o.height
        }
      };
    });
  }
  /** ISmartGuidesHost: dock/merge a dragged float into a target group via the
  *  existing move primitive (so events + undo cover it). */
  mergeFloatInto(e, t, i) {
    e === t || !this.getPanel(t.id) || this.moveGroupOrPanel({
      from: { groupId: e.id },
      to: {
        group: t,
        position: i
      }
    });
  }
  /** ISmartGuidesHost: the main grid's splitter (sash) rectangles, in the
  *  floating container's coordinate space, for the optional splitter target. */
  getGridSplitterRects() {
    const e = this.getFloatingContainer().getBoundingClientRect(), t = [];
    return this.gridview.element.querySelectorAll(".dv-sash").forEach((i) => {
      const o = i.getBoundingClientRect();
      t.push({
        left: o.left - e.left,
        top: o.top - e.top,
        width: o.width,
        height: o.height
      });
    }), t;
  }
  get _smartGuidesService() {
    return this._moduleRegistry.services.smartGuidesService;
  }
  /** Whether Smart Guides snapping is currently active. */
  get smartGuidesEnabled() {
    var e, t;
    return (e = (t = this._smartGuidesService) === null || t === void 0 ? void 0 : t.enabled) !== null && e !== void 0 ? e : !1;
  }
  /** Toggle Smart Guides snapping at runtime (no-op if the module is absent). */
  setSmartGuidesEnabled(e) {
    var t;
    (t = J(this._smartGuidesService, "SmartGuides", "api.setSmartGuidesEnabled")) === null || t === void 0 || t.setEnabled(e);
  }
  /** Merge a partial Smart Guides option override in at runtime. */
  updateSmartGuidesOptions(e) {
    var t;
    (t = J(this._smartGuidesService, "SmartGuides", "api.updateSmartGuidesOptions")) === null || t === void 0 || t.updateOptions(e);
  }
  /** Fires when a dragged float commits an alignment snap on drop. */
  get onDidSnapFloat() {
    var e, t;
    return (e = (t = this._smartGuidesService) === null || t === void 0 ? void 0 : t.onDidSnapFloat) !== null && e !== void 0 ? e : Rt;
  }
  /** Fires when a dragged float commits a dock/merge on drop. */
  get onDidSnapTogether() {
    var e, t;
    return (e = (t = this._smartGuidesService) === null || t === void 0 ? void 0 : t.onDidSnapTogether) !== null && e !== void 0 ? e : Rt;
  }
  /**
  * Compose the float drag-position transform from the public
  * `transformFloatingGroupDrag` option and the optional Smart Guides module,
  * so an app and the module can both nudge a single drag rather than one
  * clobbering the other. Returns `undefined` only when the app option is
  * unset and the module is absent (the removability case); then no transform
  * is installed and the sibling-box snapshot is skipped, so the drag loop is
  * truly byte-for-byte unchanged. When the module is present but `smartGuides`
  * is unset it installs a cheap pass-through (the service snaps nothing and
  * early-returns), so observable drag behaviour is still unchanged.
  */
  _buildFloatingDragTransform(e, t) {
    const i = this.options.transformFloatingGroupDrag, o = !t;
    if (!(!i && !(o && this._smartGuidesService)))
      return (r) => {
        var n, s;
        const a = i?.({
          group: e,
          proposed: r.proposed,
          container: r.container,
          others: r.others,
          modifiers: r.modifiers
        }), d = a ? O(O({}, r.proposed), a) : r.proposed, c = o ? (n = this._smartGuidesService) === null || n === void 0 ? void 0 : n.transformFloatingGroupDrag({
          group: e,
          proposed: d,
          container: r.container,
          others: r.others,
          modifiers: r.modifiers
        }) : void 0;
        return (s = c ?? a) !== null && s !== void 0 ? s : void 0;
      };
  }
  get _floatingGroupService() {
    return this._moduleRegistry.services.floatingGroupService;
  }
  get _popoutWindowService() {
    return this._moduleRegistry.services.popoutWindowService;
  }
  get _watermarkService() {
    return this._moduleRegistry.services.watermarkService;
  }
  get _edgeGroupService() {
    return this._moduleRegistry.services.edgeGroupService;
  }
  get _rootDropTargetService() {
    return this._moduleRegistry.services.rootDropTargetService;
  }
  get _advancedDnDService() {
    return this._moduleRegistry.services.advancedDnDService;
  }
  get _dndCompassService() {
    return this._moduleRegistry.services.dndCompassService;
  }
  /** IDndCompassHost: whether a content drop at `position` on `group` is
  *  allowed, for compass cell gating (only legal cells are shown). The same
  *  predicate the content drop target uses, so the compass and the real drop
  *  agree. */
  canDropOnGroup(e, t, i) {
    return e.model.canDisplayContentOverlay(i, t);
  }
  /** IDndCompassHost: the frame the content drop target measures (mirrors the
  *  `getOverlayOutline` rule in `content.ts`): the whole group when
  *  `dndPanelOverlay === 'group'`, else just the content. The compass paints
  *  in this frame so its cells align with where a drop resolves. */
  getDropOverlayElement(e) {
    var t, i;
    const o = e.element.querySelector(".dv-content-container");
    if (o)
      return ((t = this.options.theme) === null || t === void 0 ? void 0 : t.dndPanelOverlay) === "group" && (i = o.parentElement) !== null && i !== void 0 ? i : o;
  }
  /** IMultiRowTabsHost: the group's scrollable tab list (`.dv-tabs-container`),
  *  the element the wrap controller toggles + measures. */
  getTabsListElement(e) {
    return e.model.header.hidden ? void 0 : e.model.tabsListElement;
  }
  /** IMultiRowTabsHost: re-run a group's layout so a wrapped-header height
  *  change propagates to the content + active panel. */
  relayoutGroup(e) {
    e.relayout();
  }
  /** IMultiRowTabsHost: force the wrap controller's surplus set (rows beyond
  *  `overflow.maxRows`) into the group's overflow dropdown. */
  setForcedOverflow(e, t) {
    e.model.header.setForcedOverflow(t);
  }
  /** IDndCompassHost: the layout root (`.dv-dockview`, a positioned element),
  *  the surface the outer-cell landing preview is drawn over. */
  getLayoutElement() {
    return this.gridview.element;
  }
  /**
  * The drop-position resolver installed on the group content drop targets:
  * the app's `dropPositionResolver` option if set, else the DnD compass
  * module's compass resolver (undefined when the compass is disabled). Read
  * live by the content drop targets; undefined ⇒ default cursor-quadrant.
  */
  getDropPositionResolver() {
    var e;
    if (this.options.dropPositionResolver) return this.options.dropPositionResolver;
    const t = (e = this._dndCompassService) === null || e === void 0 ? void 0 : e.resolver, i = this._moduleRegistry.services.autoEdgeGroupService;
    return t && i ? { resolve: (o) => {
      var r;
      return (r = i.resolveEdge(o)) !== null && r !== void 0 ? r : t.resolve(o);
    } } : t ?? i?.resolver;
  }
  /**
  * Dock the dragged item against the whole-layout edge at `position` (the
  * orthogonalized root group), as the layout-edge drop zones do. Shared by
  * the root drop target and by an `edge`-flagged drop on a group content
  * target (a position resolver that marks an outer "dock to the layout edge"
  * cell). No-op when there is no active drag data.
  */
  dockToLayoutEdge(e, t) {
    const i = new Wo({
      nativeEvent: e,
      position: t,
      panel: void 0,
      api: this._api,
      group: void 0,
      getData: W,
      kind: "edge"
    });
    if (this._onWillDrop.fire(i), i.defaultPrevented) return;
    const o = W();
    if (o) {
      var r;
      this.moveGroupOrPanel({
        from: {
          groupId: o.groupId,
          panelId: (r = o.panelId) !== null && r !== void 0 ? r : void 0
        },
        to: {
          group: this.orthogonalize(t),
          position: "center"
        }
      });
    } else this._onDidDrop.fire(new qt({
      nativeEvent: e,
      position: t,
      panel: void 0,
      api: this._api,
      group: void 0,
      getData: W
    }));
  }
  get headerActionsService() {
    return this._moduleRegistry.services.headerActionsService;
  }
  get _layoutHistoryService() {
    return this._moduleRegistry.services.layoutHistoryService;
  }
  /** Undo the previous recorded layout mutation (no-op if nothing to undo or
  *  the LayoutHistory module is absent). Requires `layoutHistory.enabled`. */
  undo() {
    var e;
    (e = J(this._layoutHistoryService, "LayoutHistory", "api.undo")) === null || e === void 0 || e.undo();
  }
  /** Re-apply the next layout mutation (no-op if nothing to redo). */
  redo() {
    var e;
    (e = J(this._layoutHistoryService, "LayoutHistory", "api.redo")) === null || e === void 0 || e.redo();
  }
  get canUndo() {
    var e, t;
    return (e = (t = this._layoutHistoryService) === null || t === void 0 ? void 0 : t.canUndo) !== null && e !== void 0 ? e : !1;
  }
  get canRedo() {
    var e, t;
    return (e = (t = this._layoutHistoryService) === null || t === void 0 ? void 0 : t.canRedo) !== null && e !== void 0 ? e : !1;
  }
  /** Drop both undo and redo stacks. */
  clearHistory() {
    var e;
    (e = this._layoutHistoryService) === null || e === void 0 || e.clear();
  }
  get onDidChangeHistory() {
    var e, t;
    return (e = (t = this._layoutHistoryService) === null || t === void 0 ? void 0 : t.onDidChangeHistory) !== null && e !== void 0 ? e : Gs;
  }
  /**
  * Whether the two-band edge drag-reveal affordance is registered. See
  * {@link IRootDropTargetHost.hasEdgeDragReveal}; must not be read during
  * module initialisation, only from `init`/postConstruct onwards.
  */
  get hasEdgeDragReveal() {
    return !!this._moduleRegistry.services.autoEdgeGroupService;
  }
  isGridEmpty() {
    return this.gridview.length === 0;
  }
  rootDropTargetOverrideTarget() {
    var e;
    return (e = this.rootDropTargetContainer) === null || e === void 0 ? void 0 : e.model;
  }
  dispatchUnhandledDragOver(e, t) {
    const i = new $o(e, "edge", t, W);
    return this._onUnhandledDragOver.fire(i), i.isAccepted;
  }
  fireWillDragPanel(e) {
    this._onWillDragPanel.fire(e);
  }
  fireWillDragGroup(e) {
    this._onWillDragGroup.fire(e);
  }
  fireWillDrop(e) {
    this._onWillDrop.fire(e);
  }
  fireWillShowOverlay(e) {
    this._onWillShowOverlay.fire(e);
  }
  /**
  * Resolve the custom group drag ghost (via the AdvancedDnD module), or
  * `undefined` to fall back to the default chip. Returns `undefined` when
  * the module is absent, and the default ghost then renders.
  */
  buildGroupDragGhost(e) {
    var t;
    return (t = this._advancedDnDService) === null || t === void 0 ? void 0 : t.buildGroupDragGhost(e);
  }
  /**
  * Resolve the app-supplied drop overlay model (via the AdvancedDnD module)
  * for a group drop target, or `undefined` to keep the target's default.
  */
  resolveDropOverlayModel(e, t) {
    var i;
    return (i = this._advancedDnDService) === null || i === void 0 ? void 0 : i.resolveOverlayModel(e, t);
  }
  /** Outermost element: the shell (incl. edge groups) once built, else the gridview. */
  get rootElement() {
    var e, t;
    return (e = (t = this._shellManager) === null || t === void 0 ? void 0 : t.element) !== null && e !== void 0 ? e : this.element;
  }
  /**
  * Does this dock own `node`, in any of its windows? True when the node is
  * inside the main shell, or inside one of this component's popout documents.
  * A popout window hosts only this component's content, so whole-document
  * membership is sufficient there; the main document may hold sibling docks,
  * so it must be a containment check. A same-document popout (the jsdom mock)
  * is already covered by the main check and contributes nothing.
  */
  ownsElement(e) {
    if (this.rootElement.contains(e)) return !0;
    const t = this.rootElement.ownerDocument, i = e.ownerDocument;
    return !i || i === t ? !1 : this.getPopoutWindows().some((o) => o.document === i);
  }
  /**
  * The next / previous group in gridview (spatial) order, wrapping round.
  * The keyboard accessibility module's focus navigation is built on this
  * primitive, the only piece that needs the grid internals; the rest of
  * the navigation logic lives in the KeyboardNavigationService.
  */
  adjacentGroup(e, t) {
    var i;
    if (e.api.location.type !== "grid") return;
    const o = H(e.element);
    return (i = t ? this.gridview.previous(o) : this.gridview.next(o)) === null || i === void 0 ? void 0 : i.view;
  }
  /**
  * The nearest grid group in a spatial direction from `group`, by
  * comparing group centre points. Floating and popout groups sit outside
  * the grid's geometry and are ignored. Returns `undefined` when there is
  * no group in that direction.
  */
  adjacentGroupInDirection(e, t) {
    if (e.api.location.type !== "grid") return;
    const i = e.element.getBoundingClientRect(), o = i.left + i.width / 2, r = i.top + i.height / 2;
    let n, s = Number.POSITIVE_INFINITY;
    for (const a of this.groups) {
      if (a === e || a.api.location.type !== "grid") continue;
      const d = a.element.getBoundingClientRect(), c = d.left + d.width / 2 - o, l = d.top + d.height / 2 - r;
      let h;
      switch (t) {
        case "left":
          h = c < 0 && Math.abs(c) >= Math.abs(l);
          break;
        case "right":
          h = c > 0 && Math.abs(c) >= Math.abs(l);
          break;
        case "up":
          h = l < 0 && Math.abs(l) >= Math.abs(c);
          break;
        default:
          h = l > 0 && Math.abs(l) >= Math.abs(c);
          break;
      }
      if (!h) continue;
      const v = c * c + l * l;
      v < s && (s = v, n = a);
    }
    return n;
  }
  showDropPreview(e, t) {
    var i, o;
    return (i = (o = this._advancedDnDService) === null || o === void 0 ? void 0 : o.showPreviewOverlay(e, t)) !== null && i !== void 0 ? i : $.NONE;
  }
  announce(e) {
    var t;
    (t = this._moduleRegistry.services.liveRegionService) === null || t === void 0 || t.announce(e);
  }
  dockPanel(e, t, i) {
    this.moveGroupOrPanel({
      from: {
        groupId: e.group.id,
        panelId: e.id
      },
      to: {
        group: t,
        position: i
      }
    });
  }
  floatPanel(e) {
    this.addFloatingGroup(e);
  }
  get contextMenuService() {
    return this._moduleRegistry.services.contextMenuService;
  }
  get pinnedTabsService() {
    return this._moduleRegistry.services.pinnedTabsService;
  }
  get advancedOverflowService() {
    return this._moduleRegistry.services.advancedOverflowService;
  }
  /**
  * Pin/unpin a panel's tab. The single gated entry point behind
  * `panel.api.setPinned`. Dormant unless `pinnedTabs.enabled` is set (a
  * silent no-op), and a silent no-op when the PinnedTabs module is not
  * registered: reaching past the `enabled` check means the option was set,
  * so the option rule has already named the missing module. When active it
  * mutates the panel's pinned flag (which fires
  * `panel.api.onDidChangePinned`) and the component-level
  * `onDidPanelPinnedChange`; the module reacts to enforce pinned-first
  * ordering.
  */
  setPanelPinned(e, t) {
    var i;
    e.isPinned !== t && !((i = this.options.pinnedTabs) === null || i === void 0) && i.enabled && this.pinnedTabsService && (e.setPinned(t), this._onDidPanelPinnedChange.fire({
      panel: e,
      isPinned: t
    }));
  }
  get mountElement() {
    return this.gridview.element;
  }
  hasVisibleGridGroup() {
    return this.groups.some((e) => e.api.location.type === "grid" && e.api.isVisible);
  }
  fireLayoutChange() {
    this._bufferOnDidLayoutChange.fire();
  }
  /**
  * Promise that resolves when all popout groups from the last fromJSON call are restored.
  * Useful for tests that need to wait for delayed popout creation.
  */
  get popoutRestorationPromise() {
    var e, t;
    return (e = (t = this._popoutWindowService) === null || t === void 0 ? void 0 : t.restorationPromise) !== null && e !== void 0 ? e : Promise.resolve();
  }
  constructor(e, t) {
    var i, o, r, n, s, a;
    super(e, {
      proportionalLayout: (i = t.proportionalLayout) !== null && i !== void 0 ? i : !0,
      orientation: "HORIZONTAL",
      styles: t.hideBorders ? { separatorBorder: "transparent" } : void 0,
      disableAutoResizing: t.disableAutoResizing,
      locked: t.locked,
      margin: (o = (r = t.theme) === null || r === void 0 ? void 0 : r.gap) !== null && o !== void 0 ? o : 0,
      className: t.className
    }), this.nextGroupId = fo(), this._deserializer = new zn(this), this._moduleRegistry = new Mn(), this._onWillDragPanel = new D(), this.onWillDragPanel = this._onWillDragPanel.event, this._onWillDragGroup = new D(), this.onWillDragGroup = this._onWillDragGroup.event, this._onDidDrop = new D(), this.onDidDrop = this._onDidDrop.event, this._onWillDrop = new D(), this.onWillDrop = this._onWillDrop.event, this._mutationDepth = 0, this._syncMutationDepth = 0, this._pendingLocationChanges = /* @__PURE__ */ new Map(), this._openingPopoutWindows = /* @__PURE__ */ new Set(), this._origin = "user", this._originDepth = 0, this._onWillMutateLayout = new D(), this.onWillMutateLayout = this._onWillMutateLayout.event, this._onDidMutateLayout = new D(), this.onDidMutateLayout = this._onDidMutateLayout.event, this._onWillShowOverlay = new D(), this.onWillShowOverlay = this._onWillShowOverlay.event, this._onUnhandledDragOver = new D(), this.onUnhandledDragOver = this._onUnhandledDragOver.event, this._onDidRemovePanel = new D(), this.onDidRemovePanel = this._onDidRemovePanel.event, this._onDidAddPanel = new D(), this.onDidAddPanel = this._onDidAddPanel.event, this._onDidPopoutGroupSizeChange = new D(), this.onDidPopoutGroupSizeChange = this._onDidPopoutGroupSizeChange.event, this._onDidPopoutGroupPositionChange = new D(), this.onDidPopoutGroupPositionChange = this._onDidPopoutGroupPositionChange.event, this._onDidAddPopoutGroup = new D(), this.onDidAddPopoutGroup = this._onDidAddPopoutGroup.event, this._onDidRemovePopoutGroup = new D(), this.onDidRemovePopoutGroup = this._onDidRemovePopoutGroup.event, this._onDidChangePopouts = new D(), this.onDidChangePopouts = this._onDidChangePopouts.event, this._onDidOpenPopoutWindowFail = new D(), this.onDidOpenPopoutWindowFail = this._onDidOpenPopoutWindowFail.event, this._onWillClosePopoutWindow = new D(), this.onWillClosePopoutWindow = this._onWillClosePopoutWindow.event, this._onDidStartFloatingGroupDrag = new D(), this.onDidStartFloatingGroupDrag = this._onDidStartFloatingGroupDrag.event, this._onDidEndFloatingGroupDrag = new D(), this.onDidEndFloatingGroupDrag = this._onDidEndFloatingGroupDrag.event, this._onDidLayoutFromJSON = new D(), this.onDidLayoutFromJSON = this._onDidLayoutFromJSON.event, this._onDidActivePanelChange = new D({ replay: !0 }), this.onDidActivePanelChange = this._onDidActivePanelChange.event, this._onDidPanelPinnedChange = new D(), this.onDidPanelPinnedChange = this._onDidPanelPinnedChange.event, this._onDidMovePanel = new D(), this.onDidMovePanel = this._onDidMovePanel.event, this._onDidCreateTabGroup = new D(), this.onDidCreateTabGroup = this._onDidCreateTabGroup.event, this._onDidDestroyTabGroup = new D(), this.onDidDestroyTabGroup = this._onDidDestroyTabGroup.event, this._onDidAddPanelToTabGroup = new D(), this.onDidAddPanelToTabGroup = this._onDidAddPanelToTabGroup.event, this._onDidRemovePanelFromTabGroup = new D(), this.onDidRemovePanelFromTabGroup = this._onDidRemovePanelFromTabGroup.event, this._onDidTabGroupChange = new D(), this.onDidTabGroupChange = this._onDidTabGroupChange.event, this._onDidTabGroupCollapsedChange = new D(), this.onDidTabGroupCollapsedChange = this._onDidTabGroupCollapsedChange.event, this._onDidMaximizedGroupChange = new D(), this.onDidMaximizedGroupChange = this._onDidMaximizedGroupChange.event, this._inShellLayout = !1, this._onDidRemoveGroup = new D(), this.onDidRemoveGroup = this._onDidRemoveGroup.event, this._onDidEdgeGroupAutoHideChange = new D(), this.onDidEdgeGroupAutoHideChange = this._onDidEdgeGroupAutoHideChange.event, this._onDidAddGroup = new D(), this.onDidAddGroup = this._onDidAddGroup.event, this._onDidOptionsChange = new D(), this.onDidOptionsChange = this._onDidOptionsChange.event, this._onDidActiveGroupChange = new D(), this.onDidActiveGroupChange = this._onDidActiveGroupChange.event, this._peekingGroups = /* @__PURE__ */ new Set(), this._moving = !1, this._options = t, this._tabGroupColorPalette = Ss(t);
    const d = t.modules, c = d ?? [...bs, ...$n()];
    for (const v of c) this._moduleRegistry.register(v);
    this._moduleRegistry.initialize(this), this.reportMissingOptionModules(t);
    const l = this._popoutWindowService;
    l && this.addDisposables(l.onDidRemove((v) => {
      this._onDidRemovePopoutGroup.fire({
        id: v.popoutGroup.id,
        group: v.popoutGroup,
        window: v.getWindow()
      });
    })), this.popupService = new Ei(this.element), this.addDisposables(this.popupService, $.from(() => {
      for (const v of this._openingPopoutWindows) v.dispose();
      this._openingPopoutWindows.clear();
    })), this._api = new Ft(this), this.disableResizing = !0, this.element.remove(), this._shellManager = new Cs(e, this.element, (v, p) => this._layoutFromShell(v, p), (n = (s = t.theme) === null || s === void 0 ? void 0 : s.gap) !== null && n !== void 0 ? n : 0, (a = t.theme) === null || a === void 0 ? void 0 : a.edgeGroupCollapsedSize), this.popupService.updateRoot(this._shellManager.element), this._shellThemeClassnames = new ho(this._shellManager.element), this.rootDropTargetContainer = new xt(this._shellManager.element, { disabled: !0 }), this.floatingDropTargetContainer = new xt(this._shellManager.element, { disabled: !1 }), this.overlayRenderContainer = new Ai(this._shellManager.element, this), this._floatingOverlayHost = document.createElement("div"), this._floatingOverlayHost.className = "dv-floating-overlay-host", this._shellManager.element.appendChild(this._floatingOverlayHost), z(this.gridview.element, "dv-dockview", !0), z(this.element, "dv-debug", !!t.debug), this.updateTheme(), t.debug && this.addDisposables(new _s(this)), this.addDisposables($.from(() => this._pendingLocationChanges.clear()), this.rootDropTargetContainer, this.floatingDropTargetContainer, T(this._shellManager.element, "dragend", () => {
      var v, p;
      (v = this.rootDropTargetContainer.model) === null || v === void 0 || v.clear(), (p = this.floatingDropTargetContainer.model) === null || p === void 0 || p.clear();
    }, !0), this.overlayRenderContainer, this._onWillDragPanel, this._onWillDragGroup, this._onWillShowOverlay, this._onDidActivePanelChange, this._onDidPanelPinnedChange, this._onDidAddPanel, this._onDidRemovePanel, this._onDidLayoutFromJSON, this._onDidDrop, this._onWillDrop, this._onWillMutateLayout, this._onDidMutateLayout, this._onDidMovePanel, this._onDidMovePanel.event(() => {
      this.debouncedUpdateAllPositions();
    }), this._onDidAddGroup, this._onDidRemoveGroup, this._onDidEdgeGroupAutoHideChange, this._onDidActiveGroupChange, this._onUnhandledDragOver, this._onDidMaximizedGroupChange, this._onDidPopoutGroupSizeChange, this._onDidPopoutGroupPositionChange, this._onDidAddPopoutGroup, this._onDidRemovePopoutGroup, this._onDidChangePopouts, this._onDidAddPopoutGroup.event(() => this._onDidChangePopouts.fire()), this._onDidRemovePopoutGroup.event(() => this._onDidChangePopouts.fire()), this._onDidOpenPopoutWindowFail, this._onDidStartFloatingGroupDrag, this._onDidEndFloatingGroupDrag, this._onDidCreateTabGroup, this._onDidDestroyTabGroup, this._onDidAddPanelToTabGroup, this._onDidRemovePanelFromTabGroup, this._onDidTabGroupChange, this._onDidTabGroupCollapsedChange, ie.any(this.onDidPopoutGroupSizeChange, this.onDidPopoutGroupPositionChange, this.onDidCreateTabGroup, this.onDidDestroyTabGroup, this.onDidAddPanelToTabGroup, this.onDidRemovePanelFromTabGroup, this.onDidTabGroupChange, this.onDidTabGroupCollapsedChange)(() => {
      this.fireLayoutChange();
    }), this._onDidOptionsChange, this.onDidAdd((v) => {
      this._moving || this._onDidAddGroup.fire(v);
    }), this.onDidRemove((v) => {
      this._moving || this._onDidRemoveGroup.fire(v);
    }), this.onDidActiveChange((v) => {
      this._moving || this._onDidActiveGroupChange.fire(v);
    }), this.onDidMaximizedChange((v) => {
      this._onDidMaximizedGroupChange.fire({
        group: v.panel,
        isMaximized: v.isMaximized
      });
    }), ie.any(this.onDidAddPanel, this.onDidRemovePanel, this.onDidAddGroup, this.onDidRemove, this.onDidRemoveGroup, this.onDidMovePanel, this.onDidActivePanelChange)(() => {
      this._bufferOnDidLayoutChange.fire();
    }), $.from(() => {
      var v;
      this._moduleRegistry.dispose(), (v = this._shellManager) === null || v === void 0 || v.dispose();
    }), this._onWillClosePopoutWindow);
    const h = this._rootDropTargetService;
    h && this.addDisposables(h.onWillShowOverlay((v) => {
      this.gridview.length > 0 && v.position === "center" || this._onWillShowOverlay.fire(new Fe(v, {
        kind: "edge",
        panel: void 0,
        api: this._api,
        group: void 0,
        getData: W
      }));
    }), h.onDrop((v) => this.dockToLayoutEdge(v.nativeEvent, v.position))), this._moduleRegistry.postConstruct(this), this._shellManager.layoutFromElement();
  }
  setVisible(e, t) {
    switch (e.api.location.type) {
      case "grid":
        super.setVisible(e, t);
        break;
      case "floating": {
        const i = this.floatingGroups.find((o) => o.group === e);
        i && (i.overlay.setVisible(t), e.api._onDidVisibilityChange.fire({ isVisible: t }));
        break;
      }
      case "popout":
        console.warn("dockview: You cannot hide a group that is in a popout window");
        break;
    }
  }
  /**
  * Returns the {@link PopupService} that should host popovers (context
  * menus, tab overflow menus) for the given group. Popout groups have their
  * own service rooted in their popout window so the popover renders there
  * and dismisses on events from that window.
  */
  getPopupServiceForGroup(e) {
    var t, i;
    return (t = (i = this._popoutWindowService) === null || i === void 0 || (i = i.findByGroup(e)) === null || i === void 0 ? void 0 : i.popupService) !== null && t !== void 0 ? t : this.popupService;
  }
  addPopoutGroup(e, t) {
    return this.mutationAsync("popout", () => this._doAddPopoutGroup(e, t));
  }
  /** Enumerate the popout groups currently open in their own windows. */
  getPopouts() {
    var e, t;
    return (e = (t = this._popoutWindowService) === null || t === void 0 ? void 0 : t.entries.map((i) => ({
      id: i.popoutGroup.id,
      group: i.popoutGroup,
      window: i.getWindow()
    }))) !== null && e !== void 0 ? e : [];
  }
  /** The live popout `Window` handles, one per open popout group. The
  *  narrow surface accessibility services need to mirror per-window state. */
  getPopoutWindows() {
    return this.getPopouts().map((e) => e.window);
  }
  _doAddPopoutGroup(e, t) {
    var i, o, r, n, s;
    const a = J(this._popoutWindowService, "PopoutWindow", "api.addPopoutGroup");
    if (!a || e instanceof qe && e.model.location.type === "edge") return Promise.resolve(!1);
    if (e instanceof Ce && e.group.size === 1) return this.addPopoutGroup(e.group, t);
    const d = dr(this.gridview.element), c = this.element;
    function l() {
      var k, y;
      if (t?.position) return t.position;
      const P = (e instanceof qe ? e.element : (k = (y = e.group) === null || y === void 0 ? void 0 : y.element) !== null && k !== void 0 ? k : c).getBoundingClientRect();
      return {
        left: window.screenX + P.left,
        top: window.screenY + P.top,
        width: P.width,
        height: P.height
      };
    }
    const h = l(), v = (i = t == null || (o = t.overridePopoutGroup) === null || o === void 0 ? void 0 : o.id) !== null && i !== void 0 ? i : this.getNextGroupId(), p = (r = t?.popoutUrl) !== null && r !== void 0 ? r : (n = this.options) === null || n === void 0 ? void 0 : n.popoutUrl, u = p ?? "/popout.html", g = new gr(`${this.id}-${v}`, d ?? "", {
      url: u,
      left: h.left,
      top: h.top,
      width: h.width,
      height: h.height,
      onDidOpen: t?.onDidOpen,
      onWillClose: (k) => {
        var y;
        t == null || (y = t.onWillClose) === null || y === void 0 || y.call(t, k), this._onWillClosePopoutWindow.fire(k);
      },
      nonce: (s = this.options) === null || s === void 0 ? void 0 : s.nonce,
      styleRoot: () => this.element.getRootNode()
    }), _ = new I(g, g.onDidClose(() => {
      _.dispose();
    }));
    this._openingPopoutWindows.add(_);
    const C = bo(u);
    return (C ? Promise.resolve(null) : g.open()).then((k) => {
      var y, P;
      if (this._openingPopoutWindows.delete(_), this.isDisposed)
        return _.dispose(), !1;
      if (g.isDisposed) {
        const B = g.failure;
        return B && !this.isDisposed && (Ii(B), this._onDidOpenPopoutWindowFail.fire(B)), !1;
      }
      const M = (y = t?.referenceGroup) !== null && y !== void 0 ? y : e instanceof Ce ? e.group : e, E = e.api.location.type, w = M.element.parentElement !== null;
      let x;
      if (t?.overridePopoutGridview) {
        var f;
        x = (f = t.overridePopoutGroup) !== null && f !== void 0 ? f : M;
      } else w ? t?.overridePopoutGroup ? x = t.overridePopoutGroup : (x = this.createGroup({ id: v }), k && this._onDidAddGroup.fire(x)) : x = M;
      if (k === null) {
        var b;
        return this.handleBlockedPopout({
          group: x,
          referenceGroup: M,
          options: t,
          popoutWindowDisposable: _,
          failure: C ? {
            reason: "url-refused",
            error: C
          } : (b = g.failure) !== null && b !== void 0 ? b : { reason: "blocked" }
        }), !1;
      }
      const m = document.createElement("div");
      m.className = "dv-overlay-render-container";
      const S = new Ai(m, this);
      x.model.renderContainer = S;
      const G = (P = t?.overridePopoutGridview) !== null && P !== void 0 ? P : this.createNestedGridview();
      t?.overridePopoutGridview || G.addView(x, q.Distribute, [0]), G.element.style.width = "100%", G.element.style.height = "100%", G.layout(g.window.innerWidth, g.window.innerHeight);
      let A = !1;
      const V = () => {
        A || (A = !0, G.dispose());
      };
      let R, L = [];
      if (!t?.overridePopoutGroup && !t?.overridePopoutGridview && w) if (e instanceof Ce) {
        const B = e.group;
        this.movingLock(() => {
          const X = M.model.removePanel(e);
          x.model.openPanel(X);
        }), L = [{
          panel: e,
          from: B
        }];
      } else
        switch (this.movingLock(() => Qe({
          from: M,
          to: x
        })), L = x.panels.map((B) => ({
          panel: B,
          from: M
        })), E) {
          case "grid":
            M.api.setVisible(!1);
            break;
          case "floating":
          case "popout":
            var K;
            R = (K = this.floatingGroups.find((B) => B.group.api.id === e.api.id)) === null || K === void 0 ? void 0 : K.overlay.toJSON(), this.removeGroup(M);
            break;
        }
      k.classList.add("dv-dockview"), k.style.overflow = "hidden", k.appendChild(m), k.appendChild(G.element);
      const ge = document.createElement("div"), Ie = new xt(ge, { disabled: this.rootDropTargetContainer.disabled });
      k.appendChild(ge), x.model.dropTargetContainer = Ie;
      const ni = new Ei(k, g.window);
      if (_.addDisposables(ni), x.model.location = {
        type: "popout",
        getWindow: () => g.window,
        popoutUrl: p
      }, t?.overridePopoutGridview) {
        const B = this.groups.filter((X) => G.element.contains(X.element));
        for (const X of B)
          X.model.renderContainer = S, X.model.dropTargetContainer = Ie, X.model.location = {
            type: "popout",
            getWindow: () => g.window,
            popoutUrl: p
          };
      }
      w && e.api.location.type === "grid" && e.api.setVisible(!1), this.doSetGroupAndPanelActive(x);
      const si = a.observeGridviewSize(g, G, S);
      si && _.addDisposables(si);
      const ai = new j();
      _.addDisposables(ai);
      const di = (B) => {
        ai.value = new I(B.api.onDidActiveChange((X) => {
          if (X.isActive) {
            var mt;
            (mt = g.window) === null || mt === void 0 || mt.focus();
          }
        }), B.api.onWillFocus(() => {
          var X;
          (X = g.window) === null || X === void 0 || X.focus();
        }));
      };
      di(x);
      const li = {}, Ko = w && M && this.getPanel(M.id), be = {
        window: g,
        popoutGroup: x,
        gridview: G,
        overlayRenderContainer: S,
        dropTargetContainer: Ie,
        getWindow: () => g.window,
        popoutUrl: p,
        referenceGroup: Ko ? M.id : void 0,
        popupService: ni,
        setAnchorGroup: (B) => {
          be.popoutGroup = B, di(B);
        },
        disposable: { dispose: () => (_.dispose(), li.returnedGroup) }
      }, ci = lr(g.window);
      _.addDisposables(ci, cr(g.window, () => {
        this._onDidPopoutGroupSizeChange.fire({
          width: g.window.innerWidth,
          height: g.window.innerHeight,
          group: be.popoutGroup
        });
      }), ci.event(() => {
        this._onDidPopoutGroupPositionChange.fire({
          screenX: g.window.screenX,
          screenY: g.window.screenY,
          group: be.popoutGroup
        });
      }), T(g.window, "resize", () => {
        G.layout(g.window.innerWidth, g.window.innerHeight);
      }), S, $.from(() => this.disposePopoutWindow({
        group: x,
        referenceGroup: M,
        popoutGridview: G,
        isGroupAddedToDom: w,
        floatingBox: R,
        disposePopoutGridview: V,
        closeResult: li
      }))), a.add(be), this._onDidAddPopoutGroup.fire({
        id: be.popoutGroup.id,
        group: be.popoutGroup,
        window: be.getWindow()
      });
      for (const { panel: B, from: X } of L) this.fireDidMovePanel(B, X);
      return !0;
    }).catch((k) => (this._openingPopoutWindows.delete(_), console.error("dockview: failed to create popout.", k), !1));
  }
  /**
  * The popout window never opened - blocked by the browser's popup blocker
  * (common when restoring popouts on load), or refused outright because its
  * URL failed the same-origin guard. Fall back gracefully so the group(s)
  * end up valid and visible in the main grid rather than as orphans that
  * render nothing and later crash clear()/remove().
  */
  handleBlockedPopout(e) {
    const { group: t, referenceGroup: i, options: o, popoutWindowDisposable: r, failure: n } = e;
    if (Ii(n), r.dispose(), this._onDidOpenPopoutWindowFail.fire(n), o?.overridePopoutGridview) {
      const s = o.overridePopoutGridview, a = this.groups.filter((d) => s.element.contains(d.element));
      for (const d of a) this.movingLock(() => {
        s.remove(d), this.redockGroupToMainGrid(d);
      });
      s.dispose(), i && !i.api.isVisible && i.api.setVisible(!0);
      return;
    }
    t === i ? this.gridview.element.contains(t.element) || (this.movingLock(() => this.doAddGroup(t, [0])), t.model.location = { type: "grid" }) : (this.movingLock(() => Qe({
      from: t,
      to: i
    })), t.model.size === 0 && this._groups.has(t.id) && (t.dispose(), this._groups.delete(t.id), this._onDidRemoveGroup.fire(t))), i.api.isVisible || i.api.setVisible(!0);
  }
  /**
  * Wire a group that has been displaced from a floating / popout window back
  * to the main grid's render & drop-target containers and dock it at the
  * root. The caller is responsible for first detaching it from its old
  * gridview; the detach strategy differs between the window-teardown path
  * (`doRemoveGroup`) and the blocked-window path (`gridview.remove`).
  */
  redockGroupToMainGrid(e) {
    e.model.renderContainer = this.overlayRenderContainer, e.model.dropTargetContainer = this.rootDropTargetContainer, e.model.location = { type: "grid" }, this.doAddGroup(e, [0]);
  }
  /**
  * Teardown for a popout window's `popoutWindowDisposable`. Runs when the
  * window closes (by user, by `removeGroup`, or by component disposal):
  * relocates every member group back to the main grid (or to a floating
  * window when the anchor came from one), then disposes the nested gridview.
  * `closeResult.returnedGroup` is read by the entry's `dispose()` contract.
  */
  disposePopoutWindow(e) {
    var t;
    const { group: i, referenceGroup: o, popoutGridview: r, isGroupAddedToDom: n, floatingBox: s, disposePopoutGridview: a, closeResult: d } = e;
    if (this.isDisposed) {
      a();
      return;
    }
    const c = !!(!((t = this._popoutWindowService) === null || t === void 0) && t.entries.find((u) => u.gridview === r)), l = this.groups.filter((u) => r.element.contains(u.element)), h = l.includes(i), v = h && l.length === 1, p = [];
    if (c) {
      for (const u of l)
        if (u !== i) {
          this.movingLock(() => {
            this.doRemoveGroup(u, {
              skipDispose: !0,
              skipActive: !0,
              skipPopoutReturn: !0
            }), this.redockGroupToMainGrid(u);
          });
          for (const g of u.panels) p.push({
            panel: g,
            from: u
          });
        }
    }
    if (h && n && this.getPanel(o.id)) {
      const u = [...i.panels];
      this.movingLock(() => Qe({
        from: i,
        to: o
      }));
      for (const g of u) p.push({
        panel: g,
        from: i
      });
      o.api.isVisible || o.api.setVisible(!0), this.getPanel(i.id) && this.doRemoveGroup(i, { skipPopoutAssociated: !0 });
    } else if (h && this.getPanel(i.id)) {
      if (i.model.renderContainer = this.overlayRenderContainer, i.model.dropTargetContainer = this.rootDropTargetContainer, d.returnedGroup = i, !c) {
        a();
        return;
      }
      if (s && v) this.addFloatingGroup(i, {
        height: s.height,
        width: s.width,
        position: s
      });
      else {
        this.doRemoveGroup(i, {
          skipDispose: !0,
          skipActive: !0,
          skipPopoutReturn: !0
        }), i.model.location = { type: "grid" }, this.movingLock(() => {
          this.doAddGroup(i, [0]);
        });
        for (const u of i.panels) p.push({
          panel: u,
          from: i
        });
      }
      this.doSetGroupAndPanelActive(i);
    }
    a();
    for (const { panel: u, from: g } of p) this.fireDidMovePanel(u, g);
  }
  addFloatingGroup(e, t) {
    this.mutation("float", () => this._doAddFloatingGroup(e, t));
  }
  _doAddFloatingGroup(e, t) {
    if (!J(this._floatingGroupService, "FloatingGroup", "api.addFloatingGroup") || e instanceof qe && e.model.location.type === "edge") return;
    let i, o = [];
    if (e instanceof Ce) {
      const d = e.group;
      i = this.createGroup(), this._onDidAddGroup.fire(i), this.movingLock(() => this.removePanel(e, {
        removeEmptyGroup: !1,
        skipDispose: !0,
        skipSetActiveGroup: !0
      })), this.removeGroupIfEmpty(d), this.movingLock(() => i.model.openPanel(e, { skipSetGroupActive: !0 })), o = [{
        panel: e,
        from: d
      }];
    } else {
      var r;
      i = e;
      const d = (r = this._popoutWindowService) === null || r === void 0 ? void 0 : r.findReferenceGroupId(i), c = d ? this.getPanel(d) : void 0;
      typeof t?.skipRemoveGroup == "boolean" && t.skipRemoveGroup || (c ? (this.movingLock(() => Qe({
        from: e,
        to: c
      })), this.doRemoveGroup(e, {
        skipPopoutReturn: !0,
        skipPopoutAssociated: !0
      }), this.doRemoveGroup(c, { skipDispose: !0 }), i = c, o = i.panels.map((l) => ({
        panel: l,
        from: e
      }))) : (this.doRemoveGroup(e, {
        skipDispose: !0,
        skipPopoutReturn: !0,
        skipPopoutAssociated: !1
      }), o = i.panels.map((l) => ({
        panel: l,
        from: i
      }))));
    }
    function n() {
      if (t?.position) {
        const d = {};
        return "left" in t.position ? d.left = Math.max(t.position.left, 0) : "right" in t.position ? d.right = Math.max(t.position.right, 0) : d.left = pe.left, "top" in t.position ? d.top = Math.max(t.position.top, 0) : "bottom" in t.position ? d.bottom = Math.max(t.position.bottom, 0) : d.top = pe.top, typeof t.width == "number" ? d.width = Math.max(t.width, 0) : d.width = pe.width, typeof t.height == "number" ? d.height = Math.max(t.height, 0) : d.height = pe.height, d;
      }
      return {
        left: typeof t?.x == "number" ? Math.max(t.x, 0) : pe.left,
        top: typeof t?.y == "number" ? Math.max(t.y, 0) : pe.top,
        width: typeof t?.width == "number" ? Math.max(t.width, 0) : pe.width,
        height: typeof t?.height == "number" ? Math.max(t.height, 0) : pe.height
      };
    }
    const s = n(), a = this.createNestedGridview();
    a.addView(i, q.Distribute, [0]), this.mountFloatingWindow(a, i, [i], s, {
      dragHandle: t?.dragHandle,
      inDragMode: t?.inDragMode,
      skipActiveGroup: t?.skipActiveGroup,
      disableSmartGuides: t?.disableSmartGuides
    });
    for (const { panel: d, from: c } of o) this.fireDidMovePanel(d, c);
  }
  removeGroupIfEmpty(e) {
    e.model.size === 0 && this.doRemoveGroup(e, { skipActive: !0 });
  }
  /**
  * Build an empty gridview configured to match the main grid's styling and
  * resize behaviour, for hosting a nested layout inside a floating or popout
  * window.
  */
  createNestedGridview(e = "HORIZONTAL") {
    var t, i;
    return new xo(this.gridview.proportionalLayout, this.options.hideBorders ? { separatorBorder: "transparent" } : void 0, e, !1, (t = (i = this.options.theme) === null || i === void 0 ? void 0 : i.gap) !== null && t !== void 0 ? t : 0);
  }
  /**
  * Wrap a (populated) floating gridview in an overlay window: title bar /
  * move handle, drag wiring, the floating-group service entry and the
  * `floating` location tag for every member group.
  */
  mountFloatingWindow(e, t, i, o, r) {
    var n, s, a, d, c, l, h, v, p;
    const u = J(this._floatingGroupService, "FloatingGroup", "api.addFloatingGroup");
    if (!u) return;
    const g = ((n = (s = r?.dragHandle) !== null && s !== void 0 ? s : this.options.floatingGroupDragHandle) !== null && n !== void 0 ? n : "titlebar") === "titlebar" ? new En(this, t) : void 0, _ = new Jt(O(O({
      container: (a = this._floatingOverlayHost) !== null && a !== void 0 ? a : this.gridview.element,
      content: e.element,
      header: g?.element
    }, o), {}, {
      minimumInViewportWidth: this.options.floatingGroupBounds === "boundedWithinViewport" ? void 0 : (d = (c = this.options.floatingGroupBounds) === null || c === void 0 ? void 0 : c.minimumWidthWithinViewport) !== null && d !== void 0 ? d : 100,
      minimumInViewportHeight: this.options.floatingGroupBounds === "boundedWithinViewport" ? void 0 : (l = (h = this.options.floatingGroupBounds) === null || h === void 0 ? void 0 : h.minimumHeightWithinViewport) !== null && l !== void 0 ? l : 100,
      transformDragPosition: this._buildFloatingDragTransform(t, (v = r?.disableSmartGuides) !== null && v !== void 0 ? v : !1),
      getSiblingBoxes: () => this._gatherFloatingGroupBoxes(t)
    })), C = (p = g?.element) !== null && p !== void 0 ? p : t.element.querySelector(".dv-void-container");
    if (!C) throw new Error("dockview: failed to find drag handle");
    _.setupDrag(C, { inDragMode: typeof r?.inDragMode == "boolean" ? r.inDragMode : !1 });
    const k = u.add(t, _, e);
    k.addDisposables(_.onDidStartMoving(() => this._onDidStartFloatingGroupDrag.fire(t)), _.onDidChangeEnd(() => this._onDidEndFloatingGroupDrag.fire(t))), g && (k.setTitleBar(g), k.addDisposables(g, $.from(() => k.setTitleBar(void 0)), g.onDragStart((y) => {
      this._onWillDragGroup.fire({
        nativeEvent: y,
        group: k.group
      });
    })));
    for (const y of i) y.model.location = { type: "floating" };
    r?.skipActiveGroup || this.doSetGroupAndPanelActive(t);
  }
  orthogonalize(e, t) {
    switch (this.gridview.normalize(), e) {
      case "top":
      case "bottom":
        this.gridview.orientation === "HORIZONTAL" && this.gridview.insertOrthogonalSplitviewAtRoot();
        break;
      case "left":
      case "right":
        this.gridview.orientation === "VERTICAL" && this.gridview.insertOrthogonalSplitviewAtRoot();
        break;
    }
    switch (e) {
      case "top":
      case "left":
      case "center":
        return this.createGroupAtLocation([0], void 0, t);
      case "bottom":
      case "right":
        return this.createGroupAtLocation([this.gridview.length], void 0, t);
      default:
        throw new Error(`dockview: unsupported position ${e}`);
    }
  }
  updateOptions(e) {
    var t, i;
    super.updateOptions(e), this.reportMissingOptionModules(e), (t = this._floatingGroupService) === null || t === void 0 || t.updateBounds(e), (i = this._rootDropTargetService) === null || i === void 0 || i.setOptions(e);
    const o = this.options.disableDnd, r = this.options.dndStrategy;
    this._options = O(O({}, this.options), e);
    const n = this.options.disableDnd, s = this.options.dndStrategy;
    if ((o !== n || r !== s) && this.updateDragAndDropState(), "proportionalLayout" in e) {
      var a, d;
      const v = this.gridview.proportionalLayout;
      for (const p of this.floatingGroups) p.gridview.proportionalLayout = v;
      for (const p of (a = (d = this._popoutWindowService) === null || d === void 0 ? void 0 : d.entries) !== null && a !== void 0 ? a : []) p.gridview.proportionalLayout = v;
    }
    if ("theme" in e && this.updateTheme(), "createRightHeaderActionComponent" in e || "createLeftHeaderActionComponent" in e || "createPrefixHeaderActionComponent" in e) {
      var c;
      (c = this.headerActionsService) === null || c === void 0 || c.refreshAll();
    }
    if ("createWatermarkComponent" in e) {
      var l;
      (l = this._watermarkService) === null || l === void 0 || l.refresh();
      for (const v of this.groups) v.model.refreshWatermark();
    }
    if ("tabGroupColors" in e || "tabGroupAccent" in e) {
      var h;
      this._tabGroupColorPalette.setEntries((h = this._options.tabGroupColors) !== null && h !== void 0 ? h : jt), this._tabGroupColorPalette.enabled = this._options.tabGroupAccent !== "off";
      for (const v of this.groups) v.model.refreshTabGroupAccent();
    }
    this._onDidOptionsChange.fire(), this._layoutFromShell(this.gridview.width, this.gridview.height);
  }
  /**
  * Report any option the caller set whose module isn't registered. Logs
  * once per module+reason; never throws, matching the module system's
  * degrade-to-no-op contract.
  */
  reportMissingOptionModules(e) {
    Ln(e, (t) => this._moduleRegistry.has(t));
  }
  layout(e, t, i) {
    var o;
    this._shellManager && !this._inShellLayout ? this._shellManager.layout(e, t) : super.layout(e, t, i), this._syncFloatingOverlayHost(), (o = this._moduleRegistry) === null || o === void 0 || (o = o.services.floatingGroupService) === null || o === void 0 || o.constrainBounds();
  }
  _syncFloatingOverlayHost() {
    if (!this._floatingOverlayHost || !this._shellManager) return;
    const e = this._shellManager.element.getBoundingClientRect(), t = this.element.getBoundingClientRect(), i = this._floatingOverlayHost;
    i.style.left = `${t.left - e.left}px`, i.style.top = `${t.top - e.top}px`, i.style.width = `${t.width}px`, i.style.height = `${t.height}px`;
  }
  _layoutFromShell(e, t) {
    this._inShellLayout = !0, this.layout(e, t, !0), this._inShellLayout = !1;
  }
  forceRelayout() {
    this._shellManager ? this._layoutFromShell(this.width, this.height) : super.forceRelayout();
  }
  addEdgeGroup(e, t) {
    const i = this._edgeGroupService;
    if (!i) throw new Error(Fo("EdgeGroup", "api.addEdgeGroup"));
    if (i.has(e)) throw new Error(`dockview: edge group already exists at position '${e}'`);
    return this.mutation("add", () => {
      const o = this.createGroup({ id: t.id });
      o.model.location = {
        type: "edge",
        position: e
      }, o.model.headerPosition = e;
      const r = o.onDidChange((s) => {
        var a;
        if (!s) return;
        const d = e === "left" || e === "right" ? s.width : s.height;
        typeof d == "number" && ((a = this._shellManager) === null || a === void 0 || a.resizeEdgeGroup(e, d));
      }), n = o.model.onDidRemovePanel(() => {
        o.model.isEmpty && (i.isAutoReveal(o) ? queueMicrotask(() => {
          var s;
          o.model.isEmpty && (!((s = this._edgeGroupService) === null || s === void 0) && s.includes(o)) && this.removeEdgeGroup(e);
        }) : this.setEdgeGroupCollapsed(o, !0));
      });
      return i.add(e, o, new I(n, r)), t.autoHide !== void 0 && i.setAutoHide(o, t.autoHide), t.autoReveal !== void 0 && i.setAutoReveal(o, t.autoReveal), this._onDidAddGroup.fire(o), this._shellManager.addEdgeView(e, t, o), o.api;
    });
  }
  /**
  * Reveal (create-or-fill) the edge group at `position` and move the dragged
  * item described by `data` into it. A newly created edge group is created
  * collapsed, flagged `autoReveal` so it tears down to zero footprint when
  * later emptied, and takes its auto-hide state from `options.autoHide`. If an
  * edge group already exists there it is reused: the panel is added to its
  * tabs and its collapsed/toggled *and auto-hide* state are left as-is (never
  * re-created; `addEdgeGroup` throws on a duplicate position). This keeps a
  * drag-reveal from silently converting a static edge group into an
  * auto-hiding one; to change an existing group's auto-hide, call
  * `api.getEdgeGroup(position)?.setAutoHide(...)` directly. No-op if the
  * EdgeGroup module is absent.
  *
  * This is the primitive behind the dock-to-edge groups: the two-band
  * drag-reveal affordance routes its outer-band drops here.
  */
  revealEdgeGroupWithData(e, t, i) {
    const o = this._edgeGroupService;
    o && this.mutation("add", () => {
      var r;
      let n = o.get(e);
      n || (this.addEdgeGroup(e, {
        id: this.getNextGroupId(),
        autoReveal: !0,
        autoHide: i?.autoHide,
        collapsed: !0
      }), n = o.get(e)), n && this.moveGroupOrPanel({
        from: {
          groupId: t.groupId,
          panelId: (r = t.panelId) !== null && r !== void 0 ? r : void 0
        },
        to: {
          group: n,
          position: "center"
        }
      });
    });
  }
  getEdgeGroup(e) {
    var t;
    return (t = this._edgeGroupService) === null || t === void 0 || (t = t.get(e)) === null || t === void 0 ? void 0 : t.api;
  }
  /** The edge group panel at a position (the model, not the api). */
  getEdgeGroupPanel(e) {
    var t;
    return (t = this._edgeGroupService) === null || t === void 0 ? void 0 : t.get(e);
  }
  /** Pin (expand) the edge group at a position. Reports the missing module if
  *  AutoHideEdgeGroup is absent, since this command is reachable without the
  *  `autoHideEdgeGroups` option that would otherwise have named it. */
  pinEdgeGroup(e) {
    var t;
    (t = J(this._moduleRegistry.services.autoHideEdgeGroupService, "AutoHideEdgeGroup", "api.pinEdgeGroup")) === null || t === void 0 || t.pin(e);
  }
  /** Auto-hide (collapse to strip) the edge group at a position. */
  autoHideEdgeGroup(e) {
    var t;
    (t = J(this._moduleRegistry.services.autoHideEdgeGroupService, "AutoHideEdgeGroup", "api.autoHideEdgeGroup")) === null || t === void 0 || t.autoHide(e);
  }
  /** Peek (slide out) / close the collapsed edge group at a position. */
  peekEdgeGroup(e, t) {
    var i;
    (i = J(this._moduleRegistry.services.autoHideEdgeGroupService, "AutoHideEdgeGroup", "api.peekEdgeGroup")) === null || i === void 0 || i.peek(e, t);
  }
  /** The auto-hide peek mounts on the shell, the same element the
  *  `OverlayRenderContainer` roots on, so `always` content re-anchors in the
  *  peek's coordinate space. */
  get overlayRoot() {
    return this.rootElement;
  }
  /** Viewport rect of the docked content area (the element the root/group drop
  *  targets hit-test against), used by the two-band drag-reveal affordance to
  *  classify a pointer's distance from each edge. This is the gridview/center
  *  container, which is inset when edge groups are present, so the outer band
  *  sits at the boundary of the content area (adjacent to any existing edge
  *  group) rather than at the shell's outer edge. */
  getDropZoneRect() {
    return this.element.getBoundingClientRect();
  }
  /** The size an edge group expands to (pre-collapse); sizes the peek. */
  getEdgeGroupExpandedSize(e) {
    var t, i;
    return (t = (i = this._shellManager) === null || i === void 0 ? void 0 : i.getEdgeGroupExpandedSize(e)) !== null && t !== void 0 ? t : 0;
  }
  /** Reposition a single `renderer:'always'` panel's overlay over its
  *  reference container, optionally forcing it visible (the auto-hide peek
  *  slides an `always` panel out without reparenting it or touching its
  *  visibility state). No-op for non-overlay-rendered panels. */
  repositionPanelOverlay(e, t, i) {
    this.overlayRenderContainer.repositionPanelOverlay(e.api.id, t, i);
  }
  setEdgeGroupVisible(e, t) {
    this._shellManager.setEdgeGroupVisible(e, t);
  }
  isEdgeGroupVisible(e) {
    return this._shellManager.isEdgeGroupVisible(e);
  }
  removeEdgeGroup(e) {
    const t = J(this._edgeGroupService, "EdgeGroup", "api.removeEdgeGroup");
    if (!t) return;
    const i = t.get(e);
    if (!i) throw new Error(`dockview: no edge group exists at position '${e}'`);
    this.mutation("remove", () => {
      for (const o of [...i.panels]) this.removePanel(o, {
        removeEmptyGroup: !1,
        skipDispose: !1
      });
      this._shellManager.removeEdgeView(e), t.remove(e), i.dispose(), this._groups.delete(i.id), this._onDidRemoveGroup.fire(i), this.activateFallbackGroupIfRemoved(i);
    });
  }
  setEdgeGroupCollapsed(e, t) {
    var i;
    const o = (i = this._edgeGroupService) === null || i === void 0 ? void 0 : i.findPositionOf(e);
    o && this._shellManager.isEdgeGroupCollapsed(o) !== t && (this._shellManager.setEdgeGroupCollapsed(o, t), e.api._onDidCollapsedChange.fire({ isCollapsed: t }));
  }
  isEdgeGroupCollapsed(e) {
    var t;
    const i = (t = this._edgeGroupService) === null || t === void 0 ? void 0 : t.findPositionOf(e);
    return i ? this._shellManager.isEdgeGroupCollapsed(i) : !1;
  }
  isEdgeGroupPeeking(e) {
    return this._peekingGroups.has(e);
  }
  /** Set the peek state and fire the group's `onDidPeekChange` (called by the
  *  auto-hide service). */
  setEdgeGroupPeeking(e, t) {
    this._peekingGroups.has(e) !== t && (t ? this._peekingGroups.add(e) : this._peekingGroups.delete(e), e.api._onDidPeekChange.fire({ isPeeking: t }));
  }
  /**
  * Resolve whether an edge group should behave as an auto-hide (pinnable)
  * tool window: the per-group flag when set, otherwise the per-edge
  * `autoHideEdgeGroups` option for the group's edge. This is what lets a
  * static edge group and an auto-hiding one co-exist in the same layout.
  */
  isEdgeGroupAutoHide(e) {
    var t, i;
    const o = (t = this._edgeGroupService) === null || t === void 0 ? void 0 : t.isAutoHide(e);
    if (o !== void 0) return o;
    const r = (i = this._edgeGroupService) === null || i === void 0 ? void 0 : i.findPositionOf(e);
    return r === void 0 ? !1 : an(this.options.autoHideEdgeGroups, r);
  }
  /**
  * Set (or clear, via `undefined`) the per-group auto-hide flag and notify
  * the auto-hide module so it can dock/undock the group at runtime.
  */
  setEdgeGroupAutoHide(e, t) {
    const i = this._edgeGroupService;
    i?.includes(e) && (i.setAutoHide(e, t), this._onDidEdgeGroupAutoHideChange.fire(e));
  }
  updateDragAndDropState() {
    for (const e of this.groups) e.model.updateDragAndDropState();
  }
  focus() {
    var e;
    (e = this.activeGroup) === null || e === void 0 || e.focus();
  }
  getGroupPanel(e) {
    return this.panels.find((t) => t.id === e);
  }
  setActivePanel(e) {
    e.group.model.openPanel(e), this.doSetGroupAndPanelActive(e.group);
  }
  activateNext(e = {}) {
    var t;
    if (!e.group) {
      if (!this.activeGroup) return;
      e.group = this.activeGroup;
    }
    if (e.includePanel && e.group && e.group.activePanel !== e.group.panels[e.group.panels.length - 1]) {
      e.group.model.moveToNext({ suppressRoll: !0 });
      return;
    }
    const i = H(e.group.element), o = (t = this.gridview.next(i)) === null || t === void 0 ? void 0 : t.view;
    this.doSetGroupAndPanelActive(o);
  }
  activatePrevious(e = {}) {
    var t;
    if (!e.group) {
      if (!this.activeGroup) return;
      e.group = this.activeGroup;
    }
    if (e.includePanel && e.group && e.group.activePanel !== e.group.panels[0]) {
      e.group.model.moveToPrevious({ suppressRoll: !0 });
      return;
    }
    const i = H(e.group.element), o = (t = this.gridview.previous(i)) === null || t === void 0 ? void 0 : t.view;
    o && this.doSetGroupAndPanelActive(o);
  }
  /**
  * Serialize the current state of the layout
  *
  * @returns A JSON respresentation of the layout
  */
  toJSON() {
    var e, t, i, o, r;
    const n = this.gridview.serialize(), s = this.panels.reduce((h, v) => (h[v.id] = v.toJSON(), h), {}), a = (e = (t = this._floatingGroupService) === null || t === void 0 ? void 0 : t.serialize()) !== null && e !== void 0 ? e : [], d = (i = (o = this._popoutWindowService) === null || o === void 0 ? void 0 : o.serialize()) !== null && i !== void 0 ? i : [], c = {
      grid: n,
      panels: s,
      activeGroup: (r = this.activeGroup) === null || r === void 0 ? void 0 : r.id
    };
    a.length > 0 && (c.floatingGroups = a), d.length > 0 && (c.popoutGroups = d);
    const l = this._serializeEdgeGroups();
    return l && (c.edgeGroups = l), c;
  }
  /**
  * Serialize the edge groups, augmenting each shell entry with the serialized
  * group state + the component-owned per-group presentation flags (the shell
  * only knows geometry/collapse). Returns `undefined` when there are none.
  */
  _serializeEdgeGroups() {
    var e;
    if (!(!((e = this._edgeGroupService) === null || e === void 0) && e.hasAny())) return;
    const t = this._shellManager.toJSON();
    for (const [i, o] of this._edgeGroupService.entries()) {
      const r = t[i];
      if (!r) continue;
      if (this._edgeGroupService.isAutoReveal(o) && o.model.isEmpty) {
        delete t[i];
        continue;
      }
      r.group = o.toJSON(), this._edgeGroupService.isAutoReveal(o) && (r.autoReveal = !0);
      const n = this._edgeGroupService.isAutoHide(o);
      n !== void 0 && (r.autoHide = n);
    }
    return t;
  }
  fromJSON(e, t) {
    this.mutation("load", () => this._doFromJSON(e, t));
  }
  _doFromJSON(e, t) {
    var i, o;
    if ((i = this._popoutWindowService) === null || i === void 0 || i.cancelPendingRestorations(), typeof e != "object" || e === null) throw new Error("dockview: serialized layout must be a non-null object");
    if (!e.grid || ((o = e.grid.root) === null || o === void 0 ? void 0 : o.type) !== "branch" || !Array.isArray(e.grid.root.data)) throw new Error("dockview: root must be of type branch");
    const r = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), s = [], a = [], d = () => {
      for (const y of a) try {
        y.dispose();
      } catch (P) {
        console.error("dockview: failed to dispose a temporary group created for reuseExistingPanels", P);
      }
      a.length = 0;
    };
    if (t?.reuseExistingPanels) {
      const y = Object.keys(e.panels);
      let P;
      const M = () => {
        const E = this.createGroup(), w = this._groups.get(E.api.id);
        return this._groups.delete(E.api.id), a.push($.from(() => {
          var x;
          this.movingLock(() => {
            for (const f of E.panels.slice()) E.model.removePanel(f);
          }), w?.disposable.dispose(), (x = this.headerActionsService) === null || x === void 0 || x.disposeGroup(E), E.dispose();
        })), E;
      };
      try {
        for (const E of this.panels) if (y.includes(E.api.id)) {
          r.set(E.api.id, E);
          let w;
          if (E.api.renderer === "always" && E.api.isVisible) w = M();
          else {
            var c;
            (c = P) !== null && c !== void 0 || (P = M()), w = P;
          }
          n.set(E.api.id, w), s.push({
            panel: E,
            temporaryGroup: w
          });
        }
        this.movingLock(() => {
          s.forEach(({ panel: E, temporaryGroup: w }) => {
            this.moveGroupOrPanel({
              from: {
                groupId: E.api.group.api.id,
                panelId: E.api.id
              },
              to: {
                group: w,
                position: "center"
              },
              keepEmptyGroups: !0
            });
          });
        }), this.clear();
      } catch (E) {
        throw d(), E;
      }
    } else this.clear();
    const { grid: l, panels: h, activeGroup: v } = e;
    try {
      var p, u, g, _, C;
      const y = this.width, P = this.height, M = (w) => {
        const { id: x, locked: f, hideHeader: b, headerPosition: m, views: S, activeView: G } = w;
        if (typeof x != "string") throw new TypeError("dockview: group id must be of type string");
        const A = this.createGroup({
          id: x,
          locked: !!f,
          hideHeader: !!b,
          headerPosition: m
        });
        this._onDidAddGroup.fire(A);
        const V = [], R = S.filter((L) => h[L]);
        for (const L of R) {
          const K = r.get(L), ge = n.get(L);
          if (ge && K)
            this.movingLock(() => {
              ge.model.removePanel(K);
            }), V.push(K), K.updateFromStateModel(h[L]);
          else {
            const Ie = this._deserializer.fromJSON(h[L], A);
            V.push(Ie);
          }
        }
        for (const L of V) {
          const K = typeof G == "string" && G === L.id;
          r.has(L.api.id) ? this.movingLock(() => {
            A.model.openPanel(L, {
              skipSetActive: !K,
              skipSetGroupActive: !0
            });
          }) : A.model.openPanel(L, {
            skipSetActive: !K,
            skipSetGroupActive: !0
          });
        }
        return w.tabGroups && w.tabGroups.length > 0 && A.model.restoreTabGroups(w.tabGroups), !A.activePanel && A.panels.length > 0 && A.model.openPanel(A.panels[A.panels.length - 1], { skipSetGroupActive: !0 }), A;
      };
      this.gridview.deserialize(l, { fromJSON: (w) => M(w.data) }), this._layoutFromShell(y, P), e.edgeGroups && this.deserializeEdgeGroups(e.edgeGroups, h, r, n), this.deserializeFloatingWindows((p = e.floatingGroups) !== null && p !== void 0 ? p : [], M);
      const E = this.deserializePopoutWindows((u = e.popoutGroups) !== null && u !== void 0 ? u : [], M);
      if ((g = this._popoutWindowService) === null || g === void 0 || g.finishRestoration(E), (_ = this._floatingGroupService) === null || _ === void 0 || _.constrainBounds(), typeof v == "string") {
        const w = this.getPanel(v);
        w && this.doSetGroupAndPanelActive(w);
      }
      (C = this._watermarkService) === null || C === void 0 || C.update();
    } catch (y) {
      var k;
      console.error("dockview: failed to deserialize layout. Reverting changes", y);
      for (const P of this.groups) for (const M of P.panels) this.removePanel(M, {
        removeEmptyGroup: !1,
        skipDispose: !1
      });
      for (const P of this.groups)
        P.dispose(), this._groups.delete(P.id), this._onDidRemoveGroup.fire(P);
      throw (k = this._floatingGroupService) === null || k === void 0 || k.disposeAll(), this.clear(), y;
    } finally {
      d();
    }
    this.debouncedUpdateAllPositions(), this._onDidLayoutFromJSON.fire();
  }
  /**
  * Rebuild a floating / popout window's nested gridview from its serialized
  * tree, collecting the member groups (in deserialization order) so the
  * caller can mount or restore the window.
  */
  deserializeNestedGridview(e, t) {
    const i = this.createNestedGridview(e.orientation), o = [];
    return i.deserialize(e, { fromJSON: (r) => {
      const n = t(r.data);
      return o.push(n), n;
    } }), {
      gridview: i,
      members: o
    };
  }
  deserializeEdgeGroups(e, t, i, o) {
    const r = J(this._edgeGroupService, "EdgeGroup", "fromJSON edge restoration");
    if (r) {
      for (const s of [
        "top",
        "bottom",
        "left",
        "right"
      ]) {
        const a = e[s];
        if (a && !r.has(s)) {
          var n;
          const d = a.group, c = (n = d?.id) !== null && n !== void 0 ? n : `${s}-group`;
          this.addEdgeGroup(s, {
            id: c,
            autoReveal: a.autoReveal,
            autoHide: a.autoHide,
            minimumSize: a.minimumSize,
            maximumSize: a.maximumSize,
            collapsedSize: a.collapsedSize
          });
        }
      }
      for (const [s, a] of r.entries()) {
        const d = e[s], c = d?.group;
        if (c) {
          const { views: l, activeView: h } = c, v = [];
          for (const p of l) {
            if (!t[p]) continue;
            const u = i.get(p), g = o.get(p);
            if (g && u)
              this.movingLock(() => {
                g.model.removePanel(u);
              }), v.push(u), u.updateFromStateModel(t[p]);
            else {
              const _ = this._deserializer.fromJSON(t[p], a);
              v.push(_);
            }
          }
          for (const p of v) {
            const u = h === p.id;
            i.has(p.api.id) ? this.movingLock(() => {
              a.model.openPanel(p, {
                skipSetActive: !u,
                skipSetGroupActive: !0
              });
            }) : a.model.openPanel(p, {
              skipSetActive: !u,
              skipSetGroupActive: !0
            });
          }
          c.tabGroups && c.tabGroups.length > 0 && a.model.restoreTabGroups(c.tabGroups), !a.activePanel && a.panels.length > 0 && a.model.openPanel(a.panels[a.panels.length - 1], { skipSetGroupActive: !0 });
        }
      }
      this._shellManager.fromJSON(e);
    }
  }
  deserializeFloatingWindows(e, t) {
    for (const i of e) {
      const { data: o, grid: r, position: n } = i;
      if (r) {
        const { gridview: s, members: a } = this.deserializeNestedGridview(r, t);
        if (a.length === 0) continue;
        this.mountFloatingWindow(s, a[0], a, n, { inDragMode: !1 });
      } else if (o) {
        const s = t(o);
        this.addFloatingGroup(s, {
          position: n,
          width: n.width,
          height: n.height,
          skipRemoveGroup: !0,
          inDragMode: !1
        });
      }
    }
  }
  deserializePopoutWindows(e, t) {
    const i = e.length > 0 ? J(this._popoutWindowService, "PopoutWindow", "fromJSON popout restoration") : this._popoutWindowService;
    return i ? e.flatMap((o, r) => {
      const { data: n, grid: s, position: a, gridReferenceGroup: d, url: c } = o;
      let l, h = [];
      if (s) {
        const p = this.deserializeNestedGridview(s, t);
        if (l = p.gridview, h = p.members, h.length === 0)
          return l.dispose(), [];
      }
      const v = s ? h[0] : t(n);
      return i.scheduleRestoration(r * 100, () => this.addPopoutGroup(v, {
        position: a ?? void 0,
        overridePopoutGroup: d ? v : void 0,
        overridePopoutGridview: l,
        referenceGroup: d ? this.getPanel(d) : void 0,
        popoutUrl: c
      }), () => {
        for (const p of h.length > 0 ? h : [v]) if (!this.isDisposed && this._groups.has(p.id) && p.element.parentElement === null) {
          for (const u of [...p.panels]) this.removePanel(u, { removeEmptyGroup: !1 });
          p.dispose(), this._groups.delete(p.id), this._onDidRemoveGroup.fire(p);
        }
      });
    }) : [];
  }
  clear() {
    this.mutation("clear", () => this._doClear());
  }
  _doClear() {
    const e = Array.from(this._groups.values()).map((o) => o.value), t = !!this.activeGroup;
    for (const o of e) {
      var i;
      if (!((i = this._edgeGroupService) === null || i === void 0) && i.includes(o)) {
        const r = [...o.panels];
        for (const n of r) this.removePanel(n, { removeEmptyGroup: !1 });
        continue;
      }
      this.removeGroup(o, { skipActive: !0 });
    }
    t && this.doSetGroupAndPanelActive(void 0), this.gridview.clear();
  }
  closeAllGroups() {
    this.mutation("remove", () => {
      for (const e of this._groups.entries()) {
        const [t, i] = e;
        i.value.model.closeAllPanels();
      }
    });
  }
  addPanel(e) {
    return this.mutation("add", () => this._doAddPanel(e));
  }
  _doAddPanel(e) {
    if (this.panels.some((l) => l.id === e.id)) throw new Error(`dockview: panel with id ${e.id} already exists`);
    let t;
    if (e.position && e.floating) throw new Error("dockview: you can only provide one of: position, floating as arguments to .addPanel(...)");
    const i = {
      width: e.initialWidth,
      height: e.initialHeight
    };
    let o;
    const r = (l) => !!e.inactive && l.model.size > 0;
    if (e.position) if (dn(e.position)) {
      const l = typeof e.position.referencePanel == "string" ? this.getGroupPanel(e.position.referencePanel) : e.position.referencePanel;
      if (o = e.position.index, !l) {
        var n;
        const h = typeof e.position.referencePanel == "string" ? e.position.referencePanel : (n = e.position.referencePanel) === null || n === void 0 ? void 0 : n.id;
        throw new Error(`dockview: referencePanel '${h}' does not exist`);
      }
      t = this.findGroup(l);
    } else if (ln(e.position)) {
      var s;
      if (t = typeof e.position.referenceGroup == "string" ? (s = this._groups.get(e.position.referenceGroup)) === null || s === void 0 ? void 0 : s.value : e.position.referenceGroup, o = e.position.index, !t) {
        var a;
        const l = typeof e.position.referenceGroup == "string" ? e.position.referenceGroup : (a = e.position.referenceGroup) === null || a === void 0 ? void 0 : a.id;
        throw new Error(`dockview: referenceGroup '${l}' does not exist`);
      }
    } else {
      const l = this.orthogonalize(wi(e.position.direction)), h = this.createPanel(e, l);
      return l.model.openPanel(h, {
        skipSetActive: r(l),
        skipSetGroupActive: e.inactive,
        index: o
      }), e.inactive || this.doSetGroupAndPanelActive(l), l.api.setSize({
        height: i?.height,
        width: i?.width
      }), h;
    }
    else t = this.activeGroup;
    let d;
    if (t) {
      var c;
      const l = fi(((c = e.position) === null || c === void 0 ? void 0 : c.direction) || "within");
      if (e.floating) {
        const h = this.createGroup();
        this._onDidAddGroup.fire(h);
        const v = typeof e.floating == "object" && e.floating !== null ? e.floating : {};
        this.addFloatingGroup(h, O(O({}, v), {}, {
          inDragMode: !1,
          skipRemoveGroup: !0,
          skipActiveGroup: !0
        })), d = this.createPanel(e, h), h.model.openPanel(d, {
          skipSetActive: r(h),
          skipSetGroupActive: e.inactive,
          index: o
        });
      } else if (t.api.location.type === "floating" || t.api.location.type === "edge" || l === "center")
        d = this.createPanel(e, t), t.model.openPanel(d, {
          skipSetActive: r(t),
          skipSetGroupActive: e.inactive,
          index: o
        }), t.api.setSize({
          width: i?.width,
          height: i?.height
        }), e.inactive || this.doSetGroupAndPanelActive(t);
      else {
        const h = H(t.element), v = ve(this.gridview.orientation, h, l), p = this.createGroupAtLocation(v, this.orientationAtLocation(v) === "VERTICAL" ? i?.height : i?.width);
        d = this.createPanel(e, p), p.model.openPanel(d, {
          skipSetActive: r(p),
          skipSetGroupActive: e.inactive,
          index: o
        }), e.inactive || this.doSetGroupAndPanelActive(p);
      }
    } else if (e.floating) {
      const l = this.createGroup();
      this._onDidAddGroup.fire(l);
      const h = typeof e.floating == "object" && e.floating !== null ? e.floating : {};
      this.addFloatingGroup(l, O(O({}, h), {}, {
        inDragMode: !1,
        skipRemoveGroup: !0,
        skipActiveGroup: !0
      })), d = this.createPanel(e, l), l.model.openPanel(d, {
        skipSetActive: r(l),
        skipSetGroupActive: e.inactive,
        index: o
      });
    } else {
      const l = this.createGroupAtLocation([0], this.gridview.orientation === "VERTICAL" ? i?.height : i?.width);
      d = this.createPanel(e, l), l.model.openPanel(d, {
        skipSetActive: r(l),
        skipSetGroupActive: e.inactive,
        index: o
      }), e.inactive || this.doSetGroupAndPanelActive(l);
    }
    return d;
  }
  removePanel(e, t) {
    this.mutation("remove", () => {
      var i;
      return this._doRemovePanel(e, {
        removeEmptyGroup: (i = t?.removeEmptyGroup) !== null && i !== void 0 ? i : !0,
        skipDispose: t?.skipDispose,
        skipSetActiveGroup: t?.skipSetActiveGroup
      });
    });
  }
  _doRemovePanel(e, t) {
    const i = e.group;
    if (!i) throw new Error(`dockview: cannot remove panel ${e.id}. it's missing a group.`);
    i.model.removePanel(e, { skipSetActiveGroup: t.skipSetActiveGroup }), t.skipDispose || (e.group.model.renderContainer.detatch(e), e.dispose()), i.size === 0 && t.removeEmptyGroup && this.removeGroup(i, { skipActive: t.skipSetActiveGroup });
  }
  createWatermarkComponent() {
    return this.options.createWatermarkComponent ? this.options.createWatermarkComponent() : new Tn();
  }
  addGroup(e) {
    return this.mutation("add", () => this._doAddGroup(e));
  }
  _doAddGroup(e) {
    if (e) {
      let r;
      if (cn(e)) {
        var t;
        const l = typeof e.referencePanel == "string" ? this.panels.find((v) => v.id === e.referencePanel) : e.referencePanel, h = typeof e.referencePanel == "string" ? e.referencePanel : (t = e.referencePanel) === null || t === void 0 ? void 0 : t.id;
        if (!l) throw new Error(`dockview: reference panel ${h} does not exist`);
        if (r = this.findGroup(l), !r) throw new Error(`dockview: reference group for reference panel ${h} does not exist`);
      } else if (hn(e)) {
        var i;
        if (r = typeof e.referenceGroup == "string" ? (i = this._groups.get(e.referenceGroup)) === null || i === void 0 ? void 0 : i.value : e.referenceGroup, !r) {
          var o;
          const l = typeof e.referenceGroup == "string" ? e.referenceGroup : (o = e.referenceGroup) === null || o === void 0 ? void 0 : o.id;
          throw new Error(`dockview: reference group ${l} does not exist`);
        }
      } else {
        const l = this.orthogonalize(wi(e.direction), e);
        return e.skipSetActive || this.doSetGroupAndPanelActive(l), l;
      }
      const n = fi(e.direction || "within"), s = H(r.element), a = ve(this.gridview.orientation, s, n), d = this.createGroup(e), c = this.getLocationOrientation(a) === "VERTICAL" ? e.initialHeight : e.initialWidth;
      return this.doAddGroup(d, a, c), e.skipSetActive || this.doSetGroupAndPanelActive(d), d;
    } else {
      const r = this.createGroup(e);
      return this.doAddGroup(r), this.doSetGroupAndPanelActive(r), r;
    }
  }
  getLocationOrientation(e) {
    return e.length % 2 == 0 && this.gridview.orientation === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";
  }
  removeGroup(e, t) {
    this.mutation("remove", () => this.doRemoveGroup(e, t));
  }
  /**
  * Detach a single group from the nested gridview of its floating / popout
  * window, keeping the window and its remaining members alive, and reassign
  * the window's anchor if the detached group was it.
  *
  * @returns `true` if the group was detached from a multi-member window;
  * `false` if `group` is not in a nested window, or is the window's only
  * member, in which case the caller is responsible for disposing the whole
  * window.
  */
  detachFromNestedWindow(e) {
    var t, i;
    const o = (t = this._floatingGroupService) === null || t === void 0 ? void 0 : t.findByGroup(e);
    if (o) {
      const n = this.nestedWindowMembers(e);
      return n.length <= 1 ? !1 : (o.gridview.remove(e), o.group === e && o.setAnchorGroup(n.find((s) => s !== e)), !0);
    }
    const r = (i = this._popoutWindowService) === null || i === void 0 ? void 0 : i.findByGroup(e);
    if (r) {
      const n = this.nestedWindowMembers(e);
      return n.length <= 1 ? !1 : (r.gridview.remove(e), r.popoutGroup === e && r.setAnchorGroup(n.find((s) => s !== e)), !0);
    }
    return !1;
  }
  /**
  * Dispose a group and forget it: remove it from `_groups` and fire the
  * removed event.
  */
  disposeGroupRecord(e) {
    e.dispose(), this._groups.delete(e.id), this._onDidRemoveGroup.fire(e);
  }
  /**
  * When `removed` was the active group, fall the active selection back to
  * the first remaining group (or clear it when none remain).
  */
  activateFallbackGroupIfRemoved(e, t) {
    if (!t && this._activeGroup === e) {
      const i = Array.from(this._groups.values());
      this.doSetGroupAndPanelActive(i.length > 0 ? i[0].value : void 0);
    }
  }
  doRemoveGroup(e, t) {
    var i;
    if (!((i = this._edgeGroupService) === null || i === void 0) && i.includes(e)) return e;
    const o = [...e.panels];
    if (!t?.skipDispose) for (const l of o) {
      var r;
      this.removePanel(l, {
        removeEmptyGroup: !1,
        skipDispose: (r = t?.skipDispose) !== null && r !== void 0 ? r : !1
      });
    }
    const n = this.activePanel;
    if (e.api.location.type === "floating") {
      var s;
      const l = (s = this._floatingGroupService) === null || s === void 0 ? void 0 : s.findByGroup(e);
      if (!l) throw new Error("dockview: failed to find floating group");
      return this.detachFromNestedWindow(e) ? (t?.skipDispose ? e.model.location = { type: "grid" } : this.disposeGroupRecord(e), this.activateFallbackGroupIfRemoved(e, t?.skipActive), e) : (t?.skipDispose || this.disposeGroupRecord(e), l.dispose(), this.activateFallbackGroupIfRemoved(e, t?.skipActive), e);
    }
    if (e.api.location.type === "popout") {
      var a, d;
      const l = (a = this._popoutWindowService) === null || a === void 0 ? void 0 : a.findByGroup(e);
      if (!l) throw new Error("dockview: failed to find popout group");
      if (this.detachFromNestedWindow(e))
        return t?.skipDispose ? e.model.location = { type: "grid" } : this.disposeGroupRecord(e), this.activateFallbackGroupIfRemoved(e, t?.skipActive), e;
      if (!t?.skipDispose) {
        if (!t?.skipPopoutAssociated) {
          const v = l.referenceGroup ? this.getPanel(l.referenceGroup) : void 0;
          v?.panels.length === 0 && this.removeGroup(v);
        }
        l.popoutGroup.dispose(), this._groups.delete(e.id), this._onDidRemoveGroup.fire(e);
      }
      (d = this._popoutWindowService) === null || d === void 0 || d.remove(l);
      const h = l.disposable.dispose();
      return !t?.skipPopoutReturn && h && (this.doAddGroup(h, [0]), this.doSetGroupAndPanelActive(h)), this.activateFallbackGroupIfRemoved(e, t?.skipActive), l.popoutGroup;
    }
    if (!this.gridview.element.contains(e.element)) {
      if (!t?.skipDispose) {
        const l = this._groups.get(e.id);
        l?.disposable.dispose(), this.disposeGroupRecord(e);
      }
      return this.activateFallbackGroupIfRemoved(e, t?.skipActive), e;
    }
    const c = super.doRemoveGroup(e, t);
    return t?.skipActive || this.activePanel !== n && this.fireActivePanelChange(this.activePanel), c;
  }
  debouncedUpdateAllPositions() {
    this._updatePositionsFrameId !== void 0 && cancelAnimationFrame(this._updatePositionsFrameId), this._updatePositionsFrameId = requestAnimationFrame(() => {
      var e, t;
      this._updatePositionsFrameId = void 0, this.overlayRenderContainer.updateAllPositions();
      for (const i of (e = (t = this._popoutWindowService) === null || t === void 0 ? void 0 : t.entries) !== null && e !== void 0 ? e : []) i.overlayRenderContainer.updateAllPositions();
    });
  }
  movingLock(e) {
    const t = this._moving;
    try {
      return this._moving = !0, e();
    } finally {
      this._moving = t;
    }
  }
  /**
  * Bracket a structural mutation with `onWillMutateLayout` /
  * `onDidMutateLayout`. Re-entrant: nested calls (a compound operation such
  * as a drag that relocates a panel) join the outermost transaction, so the
  * events fire exactly once around the whole operation. `kind` reflects the
  * outermost mutation.
  */
  mutation(e, t) {
    const i = this.openMutation(e);
    this._syncMutationDepth++;
    try {
      return t();
    } finally {
      this._syncMutationDepth--, this._syncMutationDepth === 0 && this.releaseDisposedActiveGroup(), i();
    }
  }
  /**
  * `mutation()` for an operation whose work continues after the synchronous
  * call returns. The transaction stays open until the returned promise
  * settles, so everything the operation does - the group it adds, the panels
  * it relocates - lands inside the bracket, matching the synchronous
  * move / float paths.
  */
  mutationAsync(e, t) {
    var i = this;
    return go(function* () {
      const o = i.openMutation(e);
      try {
        return yield t();
      } finally {
        o();
      }
    })();
  }
  /**
  * Open a transaction and return the function that closes it. Shared by the
  * synchronous and asynchronous brackets; the returned function must be
  * called exactly once.
  *
  * Both ends key off the depth counter reaching zero rather than off which
  * bracket opened first. For synchronous nesting the two are the same thing
  * - brackets close in the order they opened - but asynchronous transactions
  * can *overlap* rather than nest (two `addPopoutGroup` calls in flight at
  * once, or a restore staggering several), and there the first to open is
  * not the last to close. Reporting on the opener would fire `didMutate`
  * while the other transaction was still doing structural work, which is the
  * very thing the async bracket exists to prevent. Overlapping transactions
  * therefore report as one, tagged with the kind of the last to finish.
  */
  openMutation(e) {
    const t = this._origin;
    return this._mutationDepth === 0 && this._onWillMutateLayout.fire({
      kind: e,
      origin: t
    }), this._mutationDepth++, () => {
      this._mutationDepth--, this._mutationDepth === 0 && (this.releaseDisposedActiveGroup(), this.flushLocationChanges(), this._onDidMutateLayout.fire({
        kind: e,
        origin: t
      }));
    };
  }
  /** Covers removals with `skipActive` that disposed the active group. */
  releaseDisposedActiveGroup() {
    var e;
    !this.isDisposed && (!((e = this._activeGroup) === null || e === void 0) && e.model.isDisposed) && this.activateFallbackGroupIfRemoved(this._activeGroup);
  }
  /**
  * Coalesce a panel's `onDidLocationChange` to the end of the enclosing
  * transaction, or fire it immediately when no transaction is in flight.
  *
  * Relocating a panel touches its location twice: once as it is reparented
  * into the destination group - which, when that group has just been created
  * for a floating or popout window, has not been told where it lives yet -
  * and once as the group is tagged with its final location. Reporting each
  * signal as it happens therefore leaks an intermediate `grid` location the
  * panel was never in, at a moment when it belongs to neither group's panel
  * list and so is missing from `api.panels`.
  *
  * Deferring collapses those signals into a single event carrying the
  * settled location. Note the signals are deliberately *not* compared
  * against the panel's previous location: a panel can move between two
  * floating windows without its location type changing, and this event is
  * the only signal `OverlayRenderContainer` has to re-resolve the panel's
  * z-index against its new host window.
  */
  deferLocationChange(e, t) {
    if (this._mutationDepth === 0) {
      t();
      return;
    }
    this._pendingLocationChanges.set(e, t);
  }
  /**
  * Report every panel whose location moved during the transaction that has
  * just closed. Each callback reads the panel's location at this point, so
  * what it reports is where the panel ended up.
  */
  flushLocationChanges() {
    if (this._pendingLocationChanges.size === 0) return;
    const e = Array.from(this._pendingLocationChanges.values());
    this._pendingLocationChanges.clear();
    for (const t of e) t();
  }
  /**
  * The origin of the operation currently in progress (`'user'` by default).
  * Read inside a `mutation()` or active-panel change to learn whether the
  * change was driven by application code (via the {@link DockviewApi}) or a
  * user gesture.
  */
  currentOrigin() {
    return this._origin;
  }
  /**
  * Run `func` with the operation origin set to `origin`, restoring the
  * previous value afterwards. Used by the DockviewApi boundary to tag
  * programmatic operations as `'api'`, and by user-gesture handlers to tag
  * `'user'`. Only the outermost caller sets the origin; a nested call (or a
  * call made while a mutation is already in flight) keeps whatever the
  * enclosing operation established, so the trigger always wins.
  */
  withOrigin(e, t) {
    if (this._originDepth > 0 || this._mutationDepth > 0) return t();
    const i = this._origin;
    this._origin = e, this._originDepth++;
    try {
      return t();
    } finally {
      this._originDepth--, this._origin = i;
    }
  }
  /**
  * Fire `onDidActivePanelChange` with the panel and the current operation
  * {@link DockviewOrigin}. Callers keep their own dedupe guards.
  */
  fireActivePanelChange(e) {
    this._onDidActivePanelChange.fire({
      panel: e,
      origin: this._origin
    });
  }
  /**
  * Announce that `panel` has finished relocating. Must be called once the
  * move has settled: `to` is read from the panel's current group, so an
  * early call would report the source group as the destination.
  */
  fireDidMovePanel(e, t) {
    this._onDidMovePanel.fire({
      panel: e,
      from: t,
      to: e.group
    });
  }
  moveGroupOrPanel(e) {
    this.mutation("move", () => this._doMoveGroupOrPanel(e));
  }
  _doMoveGroupOrPanel(e) {
    var t;
    const i = e.to.group, o = e.from.groupId, r = e.from.panelId, n = e.to.position, s = e.to.index, a = o ? (t = this._groups.get(o)) === null || t === void 0 ? void 0 : t.value : void 0;
    if (!a) throw new Error(`dockview: Failed to find group id ${o}`);
    if (r === void 0) {
      e.from.tabGroupId ? this.moveTabGroupToGroup({
        sourceGroup: a,
        tabGroupId: e.from.tabGroupId,
        destinationGroup: i,
        destinationTarget: n,
        destinationIndex: s,
        skipSetActive: e.skipSetActive,
        keepEmptyGroups: e.keepEmptyGroups
      }) : this.moveGroup({
        from: { group: a },
        to: {
          group: i,
          position: n
        },
        skipSetActive: e.skipSetActive
      });
      return;
    }
    if (!n || n === "center") {
      const c = this.movingLock(() => a.model.removePanel(r, {
        skipSetActive: !1,
        skipSetActiveGroup: !0
      }));
      if (!c) throw new Error(`dockview: No panel with id ${r}`);
      !e.keepEmptyGroups && a.model.size === 0 && a !== i && this.doRemoveGroup(a, { skipActive: !0 });
      const l = i.model.size === 0;
      this.movingLock(() => {
        var h;
        return i.model.openPanel(c, {
          index: s,
          skipSetActive: ((h = e.skipSetActive) !== null && h !== void 0 ? h : !1) && !l,
          skipSetGroupActive: !0
        });
      }), e.skipSetActive || this.doSetGroupAndPanelActive(i), this.fireDidMovePanel(c, a);
    } else {
      const c = this.getGridviewForGroup(i), l = H(i.element), h = ve(c.orientation, l, n);
      if (a.size < 2) {
        const [v, p] = de(h);
        if (a.api.location.type === "grid" && c === this.gridview) {
          const [C, k] = de(H(a.element));
          if (bi(C, v)) {
            this.gridview.moveView(C, k, p), this.fireDidMovePanel(this.getGroupPanel(r), a);
            return;
          }
        }
        if (a.api.location.type === "popout" && this.nestedWindowMembers(a).length <= 1) {
          var d;
          const C = (d = this._popoutWindowService) === null || d === void 0 ? void 0 : d.findByGroup(a);
          if (!C) return;
          const k = this.movingLock(() => C.popoutGroup.model.removePanel(C.popoutGroup.panels[0], {
            skipSetActive: !0,
            skipSetActiveGroup: !0
          }));
          this.doRemoveGroup(a, { skipActive: !0 });
          const y = ve(c.orientation, H(i.element), n), P = this.createGroupAtLocation(y, this.dropSizing(H(i.element)), void 0, c);
          this.movingLock(() => P.model.openPanel(k, { skipSetActive: !0 })), this.doSetGroupAndPanelActive(P), this.fireDidMovePanel(this.getGroupPanel(r), a);
          return;
        }
        if (a.api.location.type === "edge") {
          const C = this.movingLock(() => a.model.removePanel(r, {
            skipSetActive: !1,
            skipSetActiveGroup: !0
          }));
          if (!C) throw new Error(`dockview: No panel with id ${r}`);
          const k = this.createGroupAtLocation(h, this.dropSizing(l), void 0, c);
          this.movingLock(() => k.model.openPanel(C, { skipSetGroupActive: !0 })), this.doSetGroupAndPanelActive(k), this.fireDidMovePanel(C, a);
          return;
        }
        const u = this.movingLock(() => this.doRemoveGroup(a, {
          skipActive: !0,
          skipDispose: !0
        })), g = H(i.element), _ = ve(c.orientation, g, n);
        this.movingLock(() => this.doAddGroup(u, _, this.dropSizing(g), c)), this.setGroupLocationForRoot(u, c), this.doSetGroupAndPanelActive(u), this.fireDidMovePanel(this.getGroupPanel(r), a);
      } else {
        const v = this.movingLock(() => a.model.removePanel(r, {
          skipSetActive: !1,
          skipSetActiveGroup: !0
        }));
        if (!v) throw new Error(`dockview: No panel with id ${r}`);
        const p = ve(c.orientation, l, n), u = this.createGroupAtLocation(p, this.dropSizing(l), void 0, c);
        this.movingLock(() => u.model.openPanel(v, { skipSetGroupActive: !0 })), this.doSetGroupAndPanelActive(u), this.fireDidMovePanel(v, a);
      }
    }
  }
  moveTabGroupToGroup(e) {
    const { sourceGroup: t, tabGroupId: i, destinationGroup: o, destinationTarget: r, destinationIndex: n } = e, s = t.model.getTabGroups().find((_) => _.id === i);
    if (!s || s.panelIds.length === 0) return;
    const a = s.label, d = s.color, c = s.collapsed, l = s.componentParams, h = [...s.panelIds], v = r && r !== "center" ? H(o.element) : void 0, p = this.movingLock(() => h.map((_) => t.model.removePanel(_, {
      skipSetActive: !1,
      skipSetActiveGroup: !0
    })).filter((_) => _ !== void 0));
    if (p.length === 0) return;
    const u = (_) => {
      this.movingLock(() => {
        for (const k of p) _.model.openPanel(k, {
          index: n,
          skipSetActive: !0,
          skipSetGroupActive: !0
        });
      });
      const C = _.model.createTabGroup({
        label: a,
        color: d,
        collapsed: c,
        componentParams: l
      });
      for (const k of p) _.model.addPanelToTabGroup(C.id, k.id);
      e.skipSetActive || this.doSetGroupAndPanelActive(_);
      for (const k of p) this.fireDidMovePanel(k, t);
    };
    let g;
    if (!r || r === "center" || !v) g = o;
    else {
      const _ = ve(this.gridview.orientation, v, r);
      g = this.createGroupAtLocation(_, this.dropSizing(v));
    }
    !e.keepEmptyGroups && t.model.size === 0 && t !== g && this.doRemoveGroup(t, { skipActive: !0 }), u(g);
  }
  moveGroup(e) {
    this.mutation("move", () => this._doMoveGroup(e));
  }
  maximizeGroup(e) {
    this.mutation("maximize", () => super.maximizeGroup(e));
  }
  exitMaximizedGroup() {
    this.mutation("maximize", () => super.exitMaximizedGroup());
  }
  _doMoveGroup(e) {
    var t;
    const i = e.from.group, o = e.to.group, r = e.to.position;
    if (r === "center" && i === o) return;
    let n = i, s;
    if (r === "center") {
      const h = i.activePanel, v = i.model.getTabGroups().map((u) => ({
        label: u.label,
        color: u.color,
        collapsed: u.collapsed,
        componentParams: u.componentParams,
        panelIds: [...u.panelIds]
      })), p = this.movingLock(() => [...i.panels].map((u) => i.model.removePanel(u.id, { skipSetActive: !0 })));
      i?.model.size === 0 && this.doRemoveGroup(i, { skipActive: !0 }), this.movingLock(() => {
        for (const u of p) o.model.openPanel(u, {
          skipSetActive: u !== h,
          skipSetGroupActive: !0
        });
      }), s = p;
      for (const u of v) {
        const g = o.model.createTabGroup({
          label: u.label,
          color: u.color,
          collapsed: u.collapsed,
          componentParams: u.componentParams
        });
        for (const _ of u.panelIds) o.model.addPanelToTabGroup(g.id, _);
      }
      e.skipSetActive !== !0 ? this.doSetGroupAndPanelActive(o) : this.activePanel || this.doSetGroupAndPanelActive(o);
    } else {
      const h = (() => {
        if (i.api.location.type === "edge" || o.api.location.type === "edge") return !1;
        const v = this.getGridviewForGroup(i);
        if (v !== this.getGridviewForGroup(o)) return !1;
        let p, u;
        try {
          p = H(i.element), u = H(o.element);
        } catch {
          return !1;
        }
        return p.length === 0 || u.length === 0 ? !1 : bi(de(p)[0], de(u)[0]) && wo(v.orientation, u) === It(r);
      })();
      if (i.api.location.type === "edge") {
        const v = i.activePanel, p = i.model.getTabGroups().map((g) => ({
          label: g.label,
          color: g.color,
          collapsed: g.collapsed,
          componentParams: g.componentParams,
          panelIds: [...g.panelIds]
        })), u = this.movingLock(() => [...i.panels].map((g) => i.model.removePanel(g.id, { skipSetActive: !0 })));
        n = this.createGroup(), this._onDidAddGroup.fire(n), this.movingLock(() => {
          for (const g of u) n.model.openPanel(g, {
            skipSetActive: g !== v,
            skipSetGroupActive: !0
          });
        });
        for (const g of p) {
          const _ = n.model.createTabGroup({
            label: g.label,
            color: g.color,
            collapsed: g.collapsed,
            componentParams: g.componentParams
          });
          for (const C of g.panelIds) n.model.addPanelToTabGroup(_.id, C);
        }
      } else switch (i.api.location.type) {
        case "grid":
          this.gridview.removeView(H(i.element));
          break;
        case "floating": {
          var a;
          const v = (a = this._floatingGroupService) === null || a === void 0 ? void 0 : a.findByGroup(i);
          if (!v) throw new Error("dockview: failed to find floating group");
          this.detachFromNestedWindow(i) || v.dispose();
          break;
        }
        case "popout": {
          var d, c;
          const v = (d = this._popoutWindowService) === null || d === void 0 ? void 0 : d.findByGroup(i);
          if (!v) throw new Error("dockview: failed to find popout group");
          if (this.detachFromNestedWindow(i)) break;
          if ((c = this._popoutWindowService) === null || c === void 0 || c.remove(v), v.referenceGroup) {
            const p = this.getPanel(v.referenceGroup);
            p && !p.api.isVisible && this.doRemoveGroup(p, { skipActive: !0 });
          }
          v.window.dispose();
          break;
        }
      }
      if (o.api.location.type === "grid" || o.api.location.type === "floating" || o.api.location.type === "popout") {
        const v = this.getGridviewForGroup(o), p = H(o.element), u = ve(v.orientation, p, r);
        let g;
        if (h) g = It(r) === "HORIZONTAL" ? i.api.width : i.api.height;
        else {
          var l;
          g = q.Split((l = p[p.length - 1]) !== null && l !== void 0 ? l : 0);
        }
        v.addView(n, g, u), this.setGroupLocationForRoot(n, v);
      }
    }
    if (((t = s) !== null && t !== void 0 ? t : n.panels).forEach((h) => {
      this.fireDidMovePanel(h, i);
    }), this.debouncedUpdateAllPositions(), e.skipSetActive === !1) {
      const h = o ?? i;
      this.doSetGroupAndPanelActive(h);
    } else n !== i && e.skipSetActive !== !0 && this.doSetGroupAndPanelActive(n);
  }
  doSetGroupActive(e) {
    var t;
    super.doSetGroupActive(e);
    const i = this.activePanel;
    !this._moving && i !== ((t = this._onDidActivePanelChange.value) === null || t === void 0 ? void 0 : t.panel) && this.fireActivePanelChange(i);
  }
  doSetGroupAndPanelActive(e) {
    var t;
    super.doSetGroupActive(e);
    const i = this.activePanel;
    e && this.hasMaximizedGroup() && !this.isMaximizedGroup(e) && this.exitMaximizedGroup(), !this._moving && i !== ((t = this._onDidActivePanelChange.value) === null || t === void 0 ? void 0 : t.panel) && this.fireActivePanelChange(i);
  }
  getNextGroupId() {
    let e = this.nextGroupId.next();
    for (; this._groups.has(e); ) e = this.nextGroupId.next();
    return e;
  }
  createGroup(e) {
    var t;
    (t = e) !== null && t !== void 0 || (e = {});
    let i = e?.id;
    if (i && this._groups.has(e.id) && (console.warn(`dockview: Duplicate group id ${e?.id}. reassigning group id to avoid errors`), i = void 0), !i)
      for (i = this.nextGroupId.next(); this._groups.has(i); ) i = this.nextGroupId.next();
    const o = new qe(this, i, e);
    if (o.init({
      params: {},
      accessor: this
    }), !this._groups.has(o.id)) {
      const r = new I(o.model.onTabDragStart((n) => {
        var s;
        (s = this._advancedDnDService) === null || s === void 0 || s.dispatchWillDragPanel(n);
      }), o.model.onGroupDragStart((n) => {
        var s;
        (s = this._advancedDnDService) === null || s === void 0 || s.dispatchWillDragGroup(n);
      }), o.model.onMove((n) => {
        const { groupId: s, itemId: a, target: d, index: c, tabGroupId: l } = n;
        this.moveGroupOrPanel({
          from: {
            groupId: s,
            panelId: a,
            tabGroupId: l
          },
          to: {
            group: o,
            position: d,
            index: c
          }
        });
      }), o.model.onDidDrop((n) => {
        this._onDidDrop.fire(n);
      }), o.model.onWillDrop((n) => {
        var s;
        (s = this._advancedDnDService) === null || s === void 0 || s.dispatchWillDrop(n);
      }), o.model.onWillShowOverlay((n) => {
        var s;
        if (this.options.disableDnd) {
          n.preventDefault();
          return;
        }
        (s = this._advancedDnDService) === null || s === void 0 || s.dispatchWillShowOverlay(n);
      }), o.model.onUnhandledDragOver((n) => {
        this._onUnhandledDragOver.fire(n);
      }), o.model.onDidAddPanel((n) => {
        this._moving || this._onDidAddPanel.fire(n.panel);
      }), o.model.onDidRemovePanel((n) => {
        this._moving || this._onDidRemovePanel.fire(n.panel);
      }), o.model.onDidActivePanelChange((n) => {
        var s;
        this._moving || n.panel === this.activePanel && ((s = this._onDidActivePanelChange.value) === null || s === void 0 ? void 0 : s.panel) !== n.panel && this.fireActivePanelChange(n.panel);
      }), ie.any(o.model.onDidPanelTitleChange, o.model.onDidPanelParametersChange)(() => {
        this._bufferOnDidLayoutChange.fire();
      }));
      this._groups.set(o.id, {
        value: o,
        disposable: r
      });
    }
    return o.initialize(), o;
  }
  createPanel(e, t) {
    var i, o, r;
    const n = e.component, s = (i = e.tabComponent) !== null && i !== void 0 ? i : this.options.defaultTabComponent, a = new Ho(this, e.id, n, s), d = new Ce(e.id, n, s, this, this._api, t, a, {
      renderer: e.renderer,
      minimumWidth: e.minimumWidth,
      minimumHeight: e.minimumHeight,
      maximumWidth: e.maximumWidth,
      maximumHeight: e.maximumHeight
    });
    return d.init({
      title: (o = e.title) !== null && o !== void 0 ? o : e.id,
      params: (r = e?.params) !== null && r !== void 0 ? r : {}
    }), d;
  }
  /**
  * Sizing for a group created by a drop next to `referenceLocation`: half
  * of the group the overlay was drawn over, leaving its siblings alone, so
  * the panel lands in the region the overlay indicated (#1612). Gridview
  * rewrites the index to 0 when a cross-axis drop wraps the reference in a
  * new branch, so one value serves both paths.
  */
  dropSizing(e) {
    return q.Split(e.length === 0 ? 0 : e[e.length - 1]);
  }
  createGroupAtLocation(e, t, i, o = this.gridview) {
    const r = this.createGroup(i);
    return this.doAddGroup(r, e, t, o), this.setGroupLocationForRoot(r, o), r;
  }
  /**
  * Tag a group with the location and render / drop-target containers
  * matching the gridview root it now lives in: the main grid, a floating
  * window (shares the main containers), or a popout window (uses its own
  * window-local containers).
  */
  setGroupLocationForRoot(e, t) {
    var i;
    const o = (i = this._popoutWindowService) === null || i === void 0 ? void 0 : i.entries.find((r) => r.gridview === t);
    if (o) {
      e.model.renderContainer !== o.overlayRenderContainer && (e.model.renderContainer = o.overlayRenderContainer), e.model.dropTargetContainer = o.dropTargetContainer, e.model.location = {
        type: "popout",
        getWindow: o.getWindow,
        popoutUrl: o.popoutUrl
      };
      return;
    }
    e.model.renderContainer !== this.overlayRenderContainer && (e.model.renderContainer = this.overlayRenderContainer), e.model.dropTargetContainer = this.rootDropTargetContainer, e.model.location = t === this.gridview ? { type: "grid" } : { type: "floating" };
  }
  /**
  * Resolve which gridview root currently owns a group: the main grid, or
  * the nested gridview of the floating / popout window it lives in.
  */
  getGridviewForGroup(e) {
    var t, i;
    const o = (t = this._floatingGroupService) === null || t === void 0 ? void 0 : t.findByGroup(e);
    if (o) return o.gridview;
    const r = (i = this._popoutWindowService) === null || i === void 0 ? void 0 : i.findByGroup(e);
    return r ? r.gridview : this.gridview;
  }
  /**
  * The groups that live within the same floating / popout window as `group`
  * (including `group` itself). Empty when `group` is in the main grid.
  */
  nestedWindowMembers(e) {
    const t = this.getGridviewForGroup(e);
    return t === this.gridview ? [] : this.groups.filter((i) => t.element.contains(i.element));
  }
  findGroup(e) {
    var t;
    return (t = Array.from(this._groups.values()).find((i) => i.value.model.containsPanel(e))) === null || t === void 0 ? void 0 : t.value;
  }
  orientationAtLocation(e) {
    const t = this.gridview.orientation;
    return e.length % 2 == 1 ? t : ne(t);
  }
  updateTheme() {
    var e, t, i, o, r, n, s, a;
    const d = (e = this._options.theme) !== null && e !== void 0 ? e : Gn;
    (t = this._shellThemeClassnames) === null || t === void 0 || t.setClassNames(d.className);
    const c = (i = d.gap) !== null && i !== void 0 ? i : 0;
    this.gridview.margin = c;
    for (const p of this.floatingGroups) p.gridview.margin = c;
    for (const p of (o = (r = this._popoutWindowService) === null || r === void 0 ? void 0 : r.entries) !== null && o !== void 0 ? o : []) p.gridview.margin = c;
    if ((n = this._shellManager) === null || n === void 0 || n.updateTheme(c, (s = d.edgeGroupCollapsedSize) !== null && s !== void 0 ? s : 35), d.dndOverlayBorder === void 0) {
      var l;
      this.element.style.removeProperty("--dv-drag-over-border"), (l = this._shellManager) === null || l === void 0 || l.element.style.removeProperty("--dv-drag-over-border");
    } else {
      var h;
      this.element.style.setProperty("--dv-drag-over-border", d.dndOverlayBorder), (h = this._shellManager) === null || h === void 0 || h.element.style.setProperty("--dv-drag-over-border", d.dndOverlayBorder);
    }
    d.dndOverlayMounting === "absolute" ? this.rootDropTargetContainer.disabled = !1 : this.rootDropTargetContainer.disabled = !0;
    const v = ((a = d.tabGroupIndicator) !== null && a !== void 0 ? a : "wrap") === "none";
    z(this.element, "dv-tab-group-indicator-none", v), this._shellManager && z(this._shellManager.element, "dv-tab-group-indicator-none", v);
    for (const p of this.groups) p.model.updateTabGroups();
  }
};
function zs(e, t) {
  return new Ps(e, t).api;
}
var Mi;
(function(e) {
  function t(w, x, f = 0, b = -1) {
    let m = w.length;
    if (m === 0)
      return -1;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S;
    b < f ? S = b + 1 + (m - f) : S = b - f + 1;
    for (let G = 0; G < S; ++G) {
      let A = (f + G) % m;
      if (w[A] === x)
        return A;
    }
    return -1;
  }
  e.firstIndexOf = t;
  function i(w, x, f = -1, b = 0) {
    let m = w.length;
    if (m === 0)
      return -1;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S;
    f < b ? S = f + 1 + (m - b) : S = f - b + 1;
    for (let G = 0; G < S; ++G) {
      let A = (f - G + m) % m;
      if (w[A] === x)
        return A;
    }
    return -1;
  }
  e.lastIndexOf = i;
  function o(w, x, f = 0, b = -1) {
    let m = w.length;
    if (m === 0)
      return -1;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S;
    b < f ? S = b + 1 + (m - f) : S = b - f + 1;
    for (let G = 0; G < S; ++G) {
      let A = (f + G) % m;
      if (x(w[A], A))
        return A;
    }
    return -1;
  }
  e.findFirstIndex = o;
  function r(w, x, f = -1, b = 0) {
    let m = w.length;
    if (m === 0)
      return -1;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S;
    f < b ? S = f + 1 + (m - b) : S = f - b + 1;
    for (let G = 0; G < S; ++G) {
      let A = (f - G + m) % m;
      if (x(w[A], A))
        return A;
    }
    return -1;
  }
  e.findLastIndex = r;
  function n(w, x, f = 0, b = -1) {
    let m = o(w, x, f, b);
    return m !== -1 ? w[m] : void 0;
  }
  e.findFirstValue = n;
  function s(w, x, f = -1, b = 0) {
    let m = r(w, x, f, b);
    return m !== -1 ? w[m] : void 0;
  }
  e.findLastValue = s;
  function a(w, x, f, b = 0, m = -1) {
    let S = w.length;
    if (S === 0)
      return 0;
    b < 0 ? b = Math.max(0, b + S) : b = Math.min(b, S - 1), m < 0 ? m = Math.max(0, m + S) : m = Math.min(m, S - 1);
    let G = b, A = m - b + 1;
    for (; A > 0; ) {
      let V = A >> 1, R = G + V;
      f(w[R], x) < 0 ? (G = R + 1, A -= V + 1) : A = V;
    }
    return G;
  }
  e.lowerBound = a;
  function d(w, x, f, b = 0, m = -1) {
    let S = w.length;
    if (S === 0)
      return 0;
    b < 0 ? b = Math.max(0, b + S) : b = Math.min(b, S - 1), m < 0 ? m = Math.max(0, m + S) : m = Math.min(m, S - 1);
    let G = b, A = m - b + 1;
    for (; A > 0; ) {
      let V = A >> 1, R = G + V;
      f(w[R], x) > 0 ? A = V : (G = R + 1, A -= V + 1);
    }
    return G;
  }
  e.upperBound = d;
  function c(w, x, f) {
    if (w === x)
      return !0;
    if (w.length !== x.length)
      return !1;
    for (let b = 0, m = w.length; b < m; ++b)
      if (f ? !f(w[b], x[b]) : w[b] !== x[b])
        return !1;
    return !0;
  }
  e.shallowEqual = c;
  function l(w, x = {}) {
    let { start: f, stop: b, step: m } = x;
    if (m === void 0 && (m = 1), m === 0)
      throw new Error("Slice `step` cannot be zero.");
    let S = w.length;
    f === void 0 ? f = m < 0 ? S - 1 : 0 : f < 0 ? f = Math.max(f + S, m < 0 ? -1 : 0) : f >= S && (f = m < 0 ? S - 1 : S), b === void 0 ? b = m < 0 ? -1 : S : b < 0 ? b = Math.max(b + S, m < 0 ? -1 : 0) : b >= S && (b = m < 0 ? S - 1 : S);
    let G;
    m < 0 && b >= f || m > 0 && f >= b ? G = 0 : m < 0 ? G = Math.floor((b - f + 1) / m + 1) : G = Math.floor((b - f - 1) / m + 1);
    let A = [];
    for (let V = 0; V < G; ++V)
      A[V] = w[f + V * m];
    return A;
  }
  e.slice = l;
  function h(w, x, f) {
    let b = w.length;
    if (b <= 1 || (x < 0 ? x = Math.max(0, x + b) : x = Math.min(x, b - 1), f < 0 ? f = Math.max(0, f + b) : f = Math.min(f, b - 1), x === f))
      return;
    let m = w[x], S = x < f ? 1 : -1;
    for (let G = x; G !== f; G += S)
      w[G] = w[G + S];
    w[f] = m;
  }
  e.move = h;
  function v(w, x = 0, f = -1) {
    let b = w.length;
    if (!(b <= 1))
      for (x < 0 ? x = Math.max(0, x + b) : x = Math.min(x, b - 1), f < 0 ? f = Math.max(0, f + b) : f = Math.min(f, b - 1); x < f; ) {
        let m = w[x], S = w[f];
        w[x++] = S, w[f--] = m;
      }
  }
  e.reverse = v;
  function p(w, x, f = 0, b = -1) {
    let m = w.length;
    if (m <= 1 || (f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1), f >= b))
      return;
    let S = b - f + 1;
    if (x > 0 ? x = x % S : x < 0 && (x = (x % S + S) % S), x === 0)
      return;
    let G = f + x;
    v(w, f, G - 1), v(w, G, b), v(w, f, b);
  }
  e.rotate = p;
  function u(w, x, f = 0, b = -1) {
    let m = w.length;
    if (m === 0)
      return;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S;
    b < f ? S = b + 1 + (m - f) : S = b - f + 1;
    for (let G = 0; G < S; ++G)
      w[(f + G) % m] = x;
  }
  e.fill = u;
  function g(w, x, f) {
    let b = w.length;
    x < 0 ? x = Math.max(0, x + b) : x = Math.min(x, b);
    for (let m = b; m > x; --m)
      w[m] = w[m - 1];
    w[x] = f;
  }
  e.insert = g;
  function _(w, x) {
    let f = w.length;
    if (x < 0 && (x += f), x < 0 || x >= f)
      return;
    let b = w[x];
    for (let m = x + 1; m < f; ++m)
      w[m - 1] = w[m];
    return w.length = f - 1, b;
  }
  e.removeAt = _;
  function C(w, x, f = 0, b = -1) {
    let m = t(w, x, f, b);
    return m !== -1 && _(w, m), m;
  }
  e.removeFirstOf = C;
  function k(w, x, f = -1, b = 0) {
    let m = i(w, x, f, b);
    return m !== -1 && _(w, m), m;
  }
  e.removeLastOf = k;
  function y(w, x, f = 0, b = -1) {
    let m = w.length;
    if (m === 0)
      return 0;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S = 0;
    for (let G = 0; G < m; ++G)
      f <= b && G >= f && G <= b && w[G] === x || b < f && (G <= b || G >= f) && w[G] === x ? S++ : S > 0 && (w[G - S] = w[G]);
    return S > 0 && (w.length = m - S), S;
  }
  e.removeAllOf = y;
  function P(w, x, f = 0, b = -1) {
    let m, S = o(w, x, f, b);
    return S !== -1 && (m = _(w, S)), { index: S, value: m };
  }
  e.removeFirstWhere = P;
  function M(w, x, f = -1, b = 0) {
    let m, S = r(w, x, f, b);
    return S !== -1 && (m = _(w, S)), { index: S, value: m };
  }
  e.removeLastWhere = M;
  function E(w, x, f = 0, b = -1) {
    let m = w.length;
    if (m === 0)
      return 0;
    f < 0 ? f = Math.max(0, f + m) : f = Math.min(f, m - 1), b < 0 ? b = Math.max(0, b + m) : b = Math.min(b, m - 1);
    let S = 0;
    for (let G = 0; G < m; ++G)
      f <= b && G >= f && G <= b && x(w[G], G) || b < f && (G <= b || G >= f) && x(w[G], G) ? S++ : S > 0 && (w[G - S] = w[G]);
    return S > 0 && (w.length = m - S), S;
  }
  e.removeAllWhere = E;
})(Mi || (Mi = {}));
var Oi;
(function(e) {
  function t(i, o, r) {
    return r === 0 ? 1 / 0 : i > o && r > 0 || i < o && r < 0 ? 0 : Math.ceil((o - i) / r);
  }
  e.rangeLength = t;
})(Oi || (Oi = {}));
function Ts(e) {
  let t = [], i = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Map();
  for (const s of e)
    r(s);
  for (const [s] of o)
    n(s);
  return t;
  function r(s) {
    let [a, d] = s, c = o.get(d);
    c ? c.push(a) : o.set(d, [a]);
  }
  function n(s) {
    if (i.has(s))
      return;
    i.add(s);
    let a = o.get(s);
    if (a)
      for (const d of a)
        n(d);
    t.push(s);
  }
}
var $i;
(function(e) {
  function t(s, a, d = 0) {
    let c = new Array(a.length);
    for (let l = 0, h = d, v = a.length; l < v; ++l, ++h) {
      if (h = s.indexOf(a[l], h), h === -1)
        return null;
      c[l] = h;
    }
    return c;
  }
  e.findIndices = t;
  function i(s, a, d = 0) {
    let c = t(s, a, d);
    if (!c)
      return null;
    let l = 0;
    for (let h = 0, v = c.length; h < v; ++h) {
      let p = c[h] - d;
      l += p * p;
    }
    return { score: l, indices: c };
  }
  e.matchSumOfSquares = i;
  function o(s, a, d = 0) {
    let c = t(s, a, d);
    if (!c)
      return null;
    let l = 0, h = d - 1;
    for (let v = 0, p = c.length; v < p; ++v) {
      let u = c[v];
      l += u - h - 1, h = u;
    }
    return { score: l, indices: c };
  }
  e.matchSumOfDeltas = o;
  function r(s, a, d) {
    let c = [], l = 0, h = 0, v = a.length;
    for (; l < v; ) {
      let p = a[l], u = a[l];
      for (; ++l < v && a[l] === u + 1; )
        u++;
      h < p && c.push(s.slice(h, p)), p < u + 1 && c.push(d(s.slice(p, u + 1))), h = u + 1;
    }
    return h < s.length && c.push(s.slice(h)), c;
  }
  e.highlight = r;
  function n(s, a) {
    return s < a ? -1 : s > a ? 1 : 0;
  }
  e.cmp = n;
})($i || ($i = {}));
var Ri;
(function(e) {
  e.emptyObject = Object.freeze({}), e.emptyArray = Object.freeze([]);
  function t(l) {
    return l === null || typeof l == "boolean" || typeof l == "number" || typeof l == "string";
  }
  e.isPrimitive = t;
  function i(l) {
    return Array.isArray(l);
  }
  e.isArray = i;
  function o(l) {
    return !t(l) && !i(l);
  }
  e.isObject = o;
  function r(l, h) {
    if (l === h)
      return !0;
    if (t(l) || t(h))
      return !1;
    let v = i(l), p = i(h);
    return v !== p ? !1 : v && p ? s(l, h) : a(l, h);
  }
  e.deepEqual = r;
  function n(l) {
    return t(l) ? l : i(l) ? d(l) : c(l);
  }
  e.deepCopy = n;
  function s(l, h) {
    if (l === h)
      return !0;
    if (l.length !== h.length)
      return !1;
    for (let v = 0, p = l.length; v < p; ++v)
      if (!r(l[v], h[v]))
        return !1;
    return !0;
  }
  function a(l, h) {
    if (l === h)
      return !0;
    for (let v in l)
      if (l[v] !== void 0 && !(v in h))
        return !1;
    for (let v in h)
      if (h[v] !== void 0 && !(v in l))
        return !1;
    for (let v in l) {
      let p = l[v], u = h[v];
      if (!(p === void 0 && u === void 0) && (p === void 0 || u === void 0 || !r(p, u)))
        return !1;
    }
    return !0;
  }
  function d(l) {
    let h = new Array(l.length);
    for (let v = 0, p = l.length; v < p; ++v)
      h[v] = n(l[v]);
    return h;
  }
  function c(l) {
    let h = {};
    for (let v in l) {
      let p = l[v];
      p !== void 0 && (h[v] = n(p));
    }
    return h;
  }
})(Ri || (Ri = {}));
class As {
  constructor(t = {}) {
    this._application = null, this._validatePlugin = () => !0, this._plugins = /* @__PURE__ */ new Map(), this._services = /* @__PURE__ */ new Map(), t.validatePlugin && (console.info("Plugins may be rejected by the custom validation plugin method."), this._validatePlugin = t.validatePlugin);
  }
  /**
   * The application object.
   *
   * It will be provided as first argument to the
   * plugins activation and deactivation functions.
   *
   * It can only be set once.
   *
   * By default, it is `null`.
   */
  get application() {
    return this._application;
  }
  set application(t) {
    if (this._application !== null)
      throw Error("PluginRegistry.application is already set. It cannot be overridden.");
    this._application = t;
  }
  /**
   * The list of all the deferred plugins.
   */
  get deferredPlugins() {
    return Array.from(this._plugins).filter(([t, i]) => i.autoStart === "defer").map(([t, i]) => t);
  }
  /**
   * Get a plugin description.
   *
   * @param id - The ID of the plugin of interest.
   *
   * @returns The plugin description.
   */
  getPluginDescription(t) {
    var i, o;
    return (o = (i = this._plugins.get(t)) === null || i === void 0 ? void 0 : i.description) !== null && o !== void 0 ? o : "";
  }
  /**
   * Test whether a plugin is registered with the application.
   *
   * @param id - The ID of the plugin of interest.
   *
   * @returns `true` if the plugin is registered, `false` otherwise.
   */
  hasPlugin(t) {
    return this._plugins.has(t);
  }
  /**
   * Test whether a plugin is activated with the application.
   *
   * @param id - The ID of the plugin of interest.
   *
   * @returns `true` if the plugin is activated, `false` otherwise.
   */
  isPluginActivated(t) {
    var i, o;
    return (o = (i = this._plugins.get(t)) === null || i === void 0 ? void 0 : i.activated) !== null && o !== void 0 ? o : !1;
  }
  /**
   * List the IDs of the plugins registered with the application.
   *
   * @returns A new array of the registered plugin IDs.
   */
  listPlugins() {
    return Array.from(this._plugins.keys());
  }
  /**
   * Register a plugin with the application.
   *
   * @param plugin - The plugin to register.
   *
   * #### Notes
   * An error will be thrown if a plugin with the same ID is already
   * registered, or if the plugin has a circular dependency.
   *
   * If the plugin provides a service which has already been provided
   * by another plugin, the new service will override the old service.
   */
  registerPlugin(t) {
    if (this._plugins.has(t.id))
      throw new TypeError(`Plugin '${t.id}' is already registered.`);
    if (!this._validatePlugin(t))
      throw new Error(`Plugin '${t.id}' is not valid.`);
    const i = Ge.createPluginData(t);
    Ge.ensureNoCycle(i, this._plugins, this._services), i.provides && this._services.set(i.provides, i.id), this._plugins.set(i.id, i);
  }
  /**
   * Register multiple plugins with the application.
   *
   * @param plugins - The plugins to register.
   *
   * #### Notes
   * This calls `registerPlugin()` for each of the given plugins.
   */
  registerPlugins(t) {
    for (const i of t)
      this.registerPlugin(i);
  }
  /**
   * Deregister a plugin with the application.
   *
   * @param id - The ID of the plugin of interest.
   *
   * @param force - Whether to deregister the plugin even if it is active.
   */
  deregisterPlugin(t, i) {
    const o = this._plugins.get(t);
    if (o) {
      if (o.activated && !i)
        throw new Error(`Plugin '${t}' is still active.`);
      this._plugins.delete(t);
    }
  }
  /**
   * Activate the plugin with the given ID.
   *
   * @param id - The ID of the plugin of interest.
   *
   * @returns A promise which resolves when the plugin is activated
   *   or rejects with an error if it cannot be activated.
   */
  async activatePlugin(t) {
    const i = this._plugins.get(t);
    if (!i)
      throw new ReferenceError(`Plugin '${t}' is not registered.`);
    if (i.activated)
      return;
    if (i.promise)
      return i.promise;
    const o = i.requires.map((n) => this.resolveRequiredService(n)), r = i.optional.map((n) => this.resolveOptionalService(n));
    return i.promise = Promise.all([...o, ...r]).then((n) => i.activate.apply(void 0, [this.application, ...n])).then((n) => {
      i.service = n, i.activated = !0, i.promise = null;
    }).catch((n) => {
      throw i.promise = null, n;
    }), i.promise;
  }
  /**
   * Activate all the deferred plugins.
   *
   * @returns A promise which will resolve when each plugin is activated
   * or rejects with an error if one cannot be activated.
   */
  async activatePlugins(t, i = {}) {
    switch (t) {
      case "defer": {
        const o = this.deferredPlugins.filter((r) => this._plugins.get(r).autoStart).map((r) => this.activatePlugin(r));
        await Promise.all(o);
        break;
      }
      case "startUp": {
        const r = Ge.collectStartupPlugins(this._plugins, i).map(async (n) => {
          try {
            return await this.activatePlugin(n);
          } catch (s) {
            console.error(`Plugin '${n}' failed to activate.`, s);
          }
        });
        await Promise.all(r);
        break;
      }
    }
  }
  /**
   * Deactivate the plugin and its downstream dependents if and only if the
   * plugin and its dependents all support `deactivate`.
   *
   * @param id - The ID of the plugin of interest.
   *
   * @returns A list of IDs of downstream plugins deactivated with this one.
   */
  async deactivatePlugin(t) {
    const i = this._plugins.get(t);
    if (!i)
      throw new ReferenceError(`Plugin '${t}' is not registered.`);
    if (!i.activated)
      return [];
    if (!i.deactivate)
      throw new TypeError(`Plugin '${t}'#deactivate() method missing`);
    const o = Ge.findDependents(t, this._plugins, this._services), r = o.map((n) => this._plugins.get(n));
    for (const n of r)
      if (!n.deactivate)
        throw new TypeError(`Plugin ${n.id}#deactivate() method missing (depends on ${t})`);
    for (const n of r) {
      const s = [...n.requires, ...n.optional].map((a) => {
        const d = this._services.get(a);
        return d ? this._plugins.get(d).service : null;
      });
      await n.deactivate(this.application, ...s), n.service = null, n.activated = !1;
    }
    return o.pop(), o;
  }
  /**
   * Resolve a required service of a given type.
   *
   * @param token - The token for the service type of interest.
   *
   * @returns A promise which resolves to an instance of the requested
   *   service, or rejects with an error if it cannot be resolved.
   *
   * #### Notes
   * Services are singletons. The same instance will be returned each
   * time a given service token is resolved.
   *
   * If the plugin which provides the service has not been activated,
   * resolving the service will automatically activate the plugin.
   *
   * User code will not typically call this method directly. Instead,
   * the required services for the user's plugins will be resolved
   * automatically when the plugin is activated.
   */
  async resolveRequiredService(t) {
    const i = this._services.get(t);
    if (!i)
      throw new TypeError(`No provider for: ${t.name}.`);
    const o = this._plugins.get(i);
    return o.activated || await this.activatePlugin(i), o.service;
  }
  /**
   * Resolve an optional service of a given type.
   *
   * @param token - The token for the service type of interest.
   *
   * @returns A promise which resolves to an instance of the requested
   *   service, or `null` if it cannot be resolved.
   *
   * #### Notes
   * Services are singletons. The same instance will be returned each
   * time a given service token is resolved.
   *
   * If the plugin which provides the service has not been activated,
   * resolving the service will automatically activate the plugin.
   *
   * User code will not typically call this method directly. Instead,
   * the optional services for the user's plugins will be resolved
   * automatically when the plugin is activated.
   */
  async resolveOptionalService(t) {
    const i = this._services.get(t);
    if (!i)
      return null;
    const o = this._plugins.get(i);
    if (!o.activated)
      try {
        await this.activatePlugin(i);
      } catch (r) {
        return console.error(r), null;
      }
    return o.service;
  }
}
var Ge;
(function(e) {
  class t {
    constructor(a) {
      var d, c, l, h;
      this._activated = !1, this._promise = null, this._service = null, this.id = a.id, this.description = (d = a.description) !== null && d !== void 0 ? d : "", this.activate = a.activate, this.deactivate = (c = a.deactivate) !== null && c !== void 0 ? c : null, this.provides = (l = a.provides) !== null && l !== void 0 ? l : null, this.autoStart = (h = a.autoStart) !== null && h !== void 0 ? h : !1, this.requires = a.requires ? a.requires.slice() : [], this.optional = a.optional ? a.optional.slice() : [];
    }
    /**
     * Whether the plugin has been activated.
     */
    get activated() {
      return this._activated;
    }
    set activated(a) {
      this._activated = a;
    }
    /**
     * The resolved service for the plugin, or `null`.
     */
    get service() {
      return this._service;
    }
    set service(a) {
      this._service = a;
    }
    /**
     * The pending resolver promise, or `null`.
     */
    get promise() {
      return this._promise;
    }
    set promise(a) {
      this._promise = a;
    }
  }
  function i(s) {
    return new t(s);
  }
  e.createPluginData = i;
  function o(s, a, d) {
    const c = [...s.requires, ...s.optional], l = (v) => {
      if (v === s.provides)
        return !0;
      const p = d.get(v);
      if (!p)
        return !1;
      const u = a.get(p), g = [...u.requires, ...u.optional];
      return g.length === 0 ? !1 : (h.push(p), g.some(l) ? !0 : (h.pop(), !1));
    };
    if (!s.provides || c.length === 0)
      return;
    const h = [s.id];
    if (c.some(l))
      throw new ReferenceError(`Cycle detected: ${h.join(" -> ")}.`);
  }
  e.ensureNoCycle = o;
  function r(s, a, d) {
    const c = new Array(), l = (g) => {
      const _ = a.get(g), C = [..._.requires, ..._.optional];
      c.push(...C.reduce((k, y) => {
        const P = d.get(y);
        return P && k.push([g, P]), k;
      }, []));
    };
    for (const g of a.keys())
      l(g);
    const h = c.filter((g) => g[1] === s);
    let v = 0;
    for (; h.length > v; ) {
      const g = h.length, _ = new Set(h.map((C) => C[0]));
      for (const C of _)
        c.filter((k) => k[1] === C).forEach((k) => {
          h.includes(k) || h.push(k);
        });
      v = g;
    }
    const p = Ts(h), u = p.findIndex((g) => g === s);
    return u === -1 ? [s] : p.slice(0, u + 1);
  }
  e.findDependents = r;
  function n(s, a) {
    const d = /* @__PURE__ */ new Set();
    for (const c of s.keys())
      s.get(c).autoStart === !0 && d.add(c);
    if (a.startPlugins)
      for (const c of a.startPlugins)
        d.add(c);
    if (a.ignorePlugins)
      for (const c of a.ignorePlugins)
        d.delete(c);
    return Array.from(d);
  }
  e.collectStartupPlugins = n;
})(Ge || (Ge = {}));
class Ee {
  /**
   * Construct a new token.
   *
   * @param name - A human readable name for the token.
   * @param description - Token purpose description for documentation.
   */
  constructor(t, i) {
    this.name = t, this.description = i ?? "", this._tokenStructuralPropertyT = null;
  }
}
function Es(e) {
  let t = 0;
  for (let i = 0, o = e.length; i < o; ++i)
    i % 4 === 0 && (t = Math.random() * 4294967295 >>> 0), e[i] = t & 255, t >>>= 8;
}
var Lt;
(function(e) {
  e.getRandomValues = (() => {
    const t = typeof window < "u" && (window.crypto || window.msCrypto) || null;
    return t && typeof t.getRandomValues == "function" ? function(o) {
      return t.getRandomValues(o);
    } : Es;
  })();
})(Lt || (Lt = {}));
function Is(e) {
  const t = new Uint8Array(16), i = new Array(256);
  for (let o = 0; o < 16; ++o)
    i[o] = "0" + o.toString(16);
  for (let o = 16; o < 256; ++o)
    i[o] = o.toString(16);
  return function() {
    return e(t), t[6] = 64 | t[6] & 15, t[8] = 128 | t[8] & 63, i[t[0]] + i[t[1]] + i[t[2]] + i[t[3]] + "-" + i[t[4]] + i[t[5]] + "-" + i[t[6]] + i[t[7]] + "-" + i[t[8]] + i[t[9]] + "-" + i[t[10]] + i[t[11]] + i[t[12]] + i[t[13]] + i[t[14]] + i[t[15]];
  };
}
var Li;
(function(e) {
  e.uuid4 = Is(Lt.getRandomValues);
})(Li || (Li = {}));
const Ms = '.dv-drop-target-container{position:absolute;z-index:9999;top:0;left:0;height:100%;width:100%;pointer-events:none;overflow:hidden;--dv-transition-duration: .3s}.dv-drop-target-container .dv-drop-target-anchor{position:relative;border:var(--dv-drag-over-border);background-color:var(--dv-drag-over-background-color);opacity:1;will-change:transform,opacity;transform:translateZ(0);backface-visibility:hidden;contain:layout paint;transition:opacity var(--dv-transition-duration) ease-in,top var(--dv-transition-duration) ease-out,left var(--dv-transition-duration) ease-out,width var(--dv-transition-duration) ease-out,height var(--dv-transition-duration) ease-out}.dv-drop-target{position:relative;--dv-transition-duration: 70ms}.dv-drop-target>.dv-drop-target-dropzone{position:absolute;left:0;top:0;height:100%;width:100%;z-index:1000;pointer-events:none}.dv-drop-target>.dv-drop-target-dropzone>.dv-drop-target-selection{position:relative;box-sizing:border-box;height:100%;width:100%;border:var(--dv-drag-over-border);background-color:var(--dv-drag-over-background-color);transition:top var(--dv-transition-duration) ease-out,left var(--dv-transition-duration) ease-out,width var(--dv-transition-duration) ease-out,height var(--dv-transition-duration) ease-out,opacity var(--dv-transition-duration) ease-out;will-change:transform;pointer-events:none}.dv-drop-target>.dv-drop-target-dropzone>.dv-drop-target-selection.dv-drop-target-top.dv-drop-target-small-vertical{border-top:1px solid var(--dv-drag-over-border-color)}.dv-drop-target>.dv-drop-target-dropzone>.dv-drop-target-selection.dv-drop-target-bottom.dv-drop-target-small-vertical{border-bottom:1px solid var(--dv-drag-over-border-color)}.dv-drop-target>.dv-drop-target-dropzone>.dv-drop-target-selection.dv-drop-target-left.dv-drop-target-small-horizontal{border-left:1px solid var(--dv-drag-over-border-color)}.dv-drop-target>.dv-drop-target-dropzone>.dv-drop-target-selection.dv-drop-target-right.dv-drop-target-small-horizontal{border-right:1px solid var(--dv-drag-over-border-color)}.dv-dnd-compass{z-index:1001}.dv-dnd-compass-cell{box-sizing:border-box;border-radius:2px;border:1px solid var(--dv-dnd-compass-color, #1f9cf0);background-color:var(--dv-dnd-compass-cell-color, rgba(31, 156, 240, .25))}.dv-dnd-compass-cell-edge{border-style:dashed;background-color:var(--dv-dnd-compass-edge-cell-color, rgba(31, 156, 240, .12))}.dv-dnd-compass-cell-active{background-color:var(--dv-dnd-compass-active-cell-color, rgba(31, 156, 240, .5));border-style:solid}.dv-dnd-compass-edge-preview{z-index:1000;box-sizing:border-box;background-color:var(--dv-drag-over-background-color);border:var(--dv-drag-over-border)}.dv-dragged{transform:translateZ(0)}.dv-tab-ghost-drag{position:relative}.dv-tab-ghost-drag:after{position:absolute;content:"";height:100%;width:100%;top:0;left:0;pointer-events:none;outline:1px solid var(--dv-tab-divider-color)!important;outline-offset:-1px;z-index:5}.dv-tab{flex-shrink:0}.dv-tab:focus-visible,.dv-tab:has(:focus-visible){position:relative}.dv-tab:focus-visible:after,.dv-tab:has(:focus-visible):after{position:absolute;content:"";height:100%;width:100%;top:0;left:0;pointer-events:none;outline:1px solid var(--dv-tab-divider-color)!important;outline-offset:-1px;z-index:5}.dv-tab.dv-tab-dragging .dv-default-tab-action{background-color:var(--dv-activegroup-visiblepanel-tab-color)}.dv-tab.dv-active-tab .dv-default-tab .dv-default-tab-action{visibility:visible}.dv-tab.dv-inactive-tab .dv-default-tab .dv-default-tab-action{visibility:hidden}.dv-tab.dv-inactive-tab .dv-default-tab:hover .dv-default-tab-action{visibility:visible}@media(hover:none){.dv-tab.dv-inactive-tab .dv-default-tab .dv-default-tab-action{visibility:visible}}.dv-tab .dv-default-tab{position:relative;height:100%;width:100%;display:flex;align-items:center;white-space:nowrap;text-overflow:ellipsis}.dv-tab .dv-default-tab .dv-default-tab-content{flex-grow:1;margin-right:4px}.dv-tab .dv-default-tab .dv-default-tab-action{padding:4px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:none;background:none;color:inherit;font:inherit;cursor:pointer}.dv-tab .dv-default-tab .dv-default-tab-action:hover{border-radius:2px;background-color:var(--dv-icon-hover-background-color)}@media(pointer:coarse){.dv-tab .dv-default-tab .dv-default-tab-action{padding:8px}}.dv-tabs-overflow-dropdown-default{height:100%;box-sizing:border-box;color:var(--dv-activegroup-hiddenpanel-tab-color);margin:var(--dv-tab-margin);display:flex;align-items:center;flex-shrink:0;padding:.25rem .5rem;cursor:pointer}.dv-tabs-overflow-dropdown-default>span{padding-left:.25rem}.dv-tabs-overflow-dropdown-default>svg{transform:rotate(90deg)}.dv-tabs-overflow-dropdown-default:hover{border-radius:2px;background-color:var(--dv-icon-hover-background-color)}.dv-tabs-container{display:flex;position:relative;height:100%;overflow:auto;scrollbar-width:thin}.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical){flex-wrap:wrap;height:auto;overflow:visible;align-content:flex-start}.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:var(--dv-tabs-and-actions-container-height)}.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical).dv-tabs-container--wrap-capped{max-height:calc(var(--dv-tabs-and-actions-container-height) * var(--dv-max-tab-rows));overflow:hidden}.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab--reorder-before:after,.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab--reorder-after:after{content:"";position:absolute;top:0;bottom:0;width:2px;z-index:10;pointer-events:none;background-color:var(--dv-drag-over-border-color)}.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab--reorder-before:after{left:0}.dv-tabs-container.dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab--reorder-after:after{right:0}.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical{flex-wrap:wrap;width:auto;height:100%;max-height:100%;overflow:visible;align-content:flex-start}.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:var(--dv-tabs-and-actions-container-height);height:var(--dv-wrap-vertical-tab-height, auto)}.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical.dv-tabs-container--wrap-capped{max-width:calc(var(--dv-tabs-and-actions-container-height) * var(--dv-max-tab-rows));overflow:hidden}.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab--reorder-before:after,.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab--reorder-after:after{content:"";position:absolute;left:0;right:0;height:2px;z-index:10;pointer-events:none;background-color:var(--dv-drag-over-border-color)}.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab--reorder-before:after{top:0}.dv-tabs-container.dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab--reorder-after:after{bottom:0}.dv-tabs-container{will-change:scroll-position;transform:translateZ(0);overscroll-behavior:contain;touch-action:pan-x}.dv-tabs-container.dv-tabs-container-vertical{width:100%;height:fit-content;max-height:100%;writing-mode:vertical-rl;touch-action:pan-y}.dv-tabs-container.dv-horizontal .dv-tab:not(:first-child):before,.dv-tabs-container.dv-vertical .dv-tab:not(:first-child):before{content:" ";position:absolute;top:0;left:0;z-index:5;pointer-events:none;background-color:var(--dv-tab-divider-color)}.dv-tabs-container.dv-horizontal .dv-tab:not(:first-child):before{width:1px;height:100%}.dv-tabs-container.dv-vertical .dv-tab:not(:first-child):before{width:100%;height:1px}.dv-tabs-container::-webkit-scrollbar{height:3px}.dv-tabs-container::-webkit-scrollbar-track{background:transparent}.dv-tabs-container::-webkit-scrollbar-thumb{background:var(--dv-tabs-container-scrollbar-color)}.dv-scrollable>.dv-tabs-container{overflow:hidden}.dv-tab{user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;outline:none;padding:.25rem .5rem;cursor:pointer;position:relative;box-sizing:border-box;font-size:var(--dv-tab-font-size);margin:var(--dv-tab-margin);touch-action:none}.dv-tab.dv-tab--shifting{will-change:transform,margin-left,margin-right,margin-top,margin-bottom;transition:transform var(--dv-transition-duration, .2s) ease-out,margin-left var(--dv-transition-duration, .2s) ease-out,margin-right var(--dv-transition-duration, .2s) ease-out,margin-top var(--dv-transition-duration, .2s) ease-out,margin-bottom var(--dv-transition-duration, .2s) ease-out}.dv-tab.dv-tab--dragging,.dv-tab.dv-tab--group-collapsed{width:0!important;min-width:0!important;padding:0!important;margin:0!important;overflow:hidden;opacity:0;pointer-events:none;transition:width var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tab.dv-tab--group-expanding{transition:width var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tab.dv-tab--pinned:has(.dv-tab-pin){display:flex;align-items:center}.dv-tab.dv-tab--pinned .dv-tab-pin{display:inline-flex;align-items:center;flex-shrink:0;margin-right:4px;opacity:.7;pointer-events:none}.dv-tab.dv-tab--pinned .dv-tab-pin .dv-svg{width:11px;height:11px}.dv-tab.dv-tab--pinned .dv-default-tab{min-width:0}.dv-tab.dv-tab--pinned .dv-default-tab-action,.dv-tab.dv-tab--pinned-compact .dv-default-tab-content{display:none}.dv-tab.dv-tab--pinned-compact .dv-tab-pin{margin-right:0}.dv-tabs-container:not(.dv-tabs-container--wrap):not(.dv-tabs-container-vertical)>.dv-tab.dv-tab--pinned-sticky{position:sticky;left:var(--dv-pinned-sticky-left, 0);z-index:2}.dv-tabs-and-actions-container.dv-tabs-and-actions-container--pinned-row{flex-wrap:wrap;height:auto;min-height:var(--dv-tabs-and-actions-container-height);align-content:flex-start}.dv-tabs-and-actions-container.dv-tabs-and-actions-container--pinned-row .dv-pinned-row{flex:0 0 100%;order:-1}.dv-tabs-and-actions-container.dv-tabs-and-actions-container--pinned-row .dv-tab.dv-tab--pinned{display:none}.dv-pinned-row{display:flex;align-items:center;gap:2px;box-sizing:border-box;width:100%;min-height:var(--dv-tabs-and-actions-container-height);padding:2px 4px;background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom:1px solid var(--dv-tab-divider-color)}.dv-pinned-tab{display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;padding:.25rem .5rem;font-size:var(--dv-tab-font-size);cursor:pointer;-webkit-user-select:none;user-select:none;background-color:var(--dv-activegroup-hiddenpanel-tab-background-color);color:var(--dv-activegroup-hiddenpanel-tab-color)}.dv-pinned-tab.dv-pinned-tab--active{background-color:var(--dv-activegroup-visiblepanel-tab-background-color);color:var(--dv-activegroup-visiblepanel-tab-color)}.dv-pinned-tab .dv-pinned-tab-label{max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dv-pinned-tab .dv-pinned-tab-unpin{flex-shrink:0;opacity:.6}.dv-pinned-tab .dv-pinned-tab-unpin:hover{opacity:1}.dv-pinned-tab.dv-pinned-tab--dragging{opacity:.5}.dv-pinned-tab.dv-pinned-tab--drop-before,.dv-pinned-tab.dv-pinned-tab--drop-after{position:relative}.dv-pinned-tab.dv-pinned-tab--drop-before:after,.dv-pinned-tab.dv-pinned-tab--drop-after:after{content:"";position:absolute;top:0;bottom:0;width:2px;z-index:10;pointer-events:none;background-color:var(--dv-drag-over-border-color)}.dv-pinned-tab.dv-pinned-tab--drop-before:after{left:0}.dv-pinned-tab.dv-pinned-tab--drop-after:after{right:0}@media(prefers-reduced-motion:reduce){.dv-tab,.dv-tab-group-chip{transition:none!important}}.dv-tab-group-chip{display:inline-flex;align-items:center;align-self:center;padding:var(--dv-tab-group-chip-padding);margin:0 8px;border-radius:var(--dv-tab-group-chip-border-radius);font-size:var(--dv-tab-group-chip-font-size);cursor:pointer;-webkit-user-select:none;user-select:none;white-space:nowrap;box-sizing:border-box;line-height:1;touch-action:none;background-color:var(--dv-tab-group-color);color:#fff}.dv-tab-group-chip.dv-tab-group-chip--accent-off{background-color:transparent;color:inherit}.dv-tab-group-chip.dv-tab-group-chip--shifting{will-change:margin-left,margin-top;transition:margin-left var(--dv-transition-duration, .2s) ease-out,margin-top var(--dv-transition-duration, .2s) ease-out}.dv-tab-group-chip.dv-tab-group-chip--dragging{width:0!important;min-width:0!important;padding:0!important;margin:0!important;overflow:hidden;opacity:0;pointer-events:none;transition:width var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tab-group-chip .dv-tab-group-chip-label--empty{display:none}.dv-tab-group-chip:has(.dv-tab-group-chip-label--empty){position:relative;width:12px;height:12px;padding:0;border-radius:50%}.dv-tab-group-chip:has(.dv-tab-group-chip-label--empty):before{content:"";position:absolute;inset:-8px}.dv-tab-group-underline{position:absolute;bottom:0;opacity:var(--dv-tab-group-line-opacity);pointer-events:none;z-index:10}.dv-tab-group-chip-continuation{position:absolute;width:8px;height:8px;border-radius:50%;opacity:var(--dv-tab-group-line-opacity);pointer-events:none;z-index:10}.dv-groupview-header-bottom .dv-tab-group-underline{bottom:auto;top:0}.dv-tabs-container-vertical .dv-tab-group-underline{bottom:auto;left:0}.dv-tabs-container-vertical .dv-tab-group-chip{margin:8px 0}.dv-tabs-container-vertical .dv-tab-group-chip.dv-tab-group-chip--dragging{height:0!important;min-height:0!important;width:auto!important;min-width:initial!important;transition:height var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tabs-container-vertical .dv-tab{padding:.5rem .25rem}.dv-tabs-container-vertical .dv-tab.dv-tab--group-collapsed{height:0!important;min-height:0!important;width:auto!important;min-width:initial!important;transition:height var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tabs-container-vertical .dv-tab.dv-tab--group-expanding{transition:height var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tabs-container-vertical .dv-tab.dv-tab--dragging{height:0!important;min-height:0!important;width:auto!important;min-width:initial!important;transition:height var(--dv-transition-duration, .2s) ease-out,padding var(--dv-transition-duration, .2s) ease-out,margin var(--dv-transition-duration, .2s) ease-out,opacity var(--dv-transition-duration, .2s) ease-out}.dv-tabs-overflow-container{flex-direction:column;height:unset;font-size:var(--dv-tabs-and-actions-container-font-size);max-height:min(50vh,400px);overflow-y:auto;border:1px solid var(--dv-tab-divider-color);background-color:var(--dv-group-view-background-color)}.dv-tabs-overflow-container::-webkit-scrollbar{width:6px}.dv-tabs-overflow-container::-webkit-scrollbar-track{background:transparent}.dv-tabs-overflow-container::-webkit-scrollbar-thumb{background:var(--dv-tabs-container-scrollbar-color);border-radius:3px}.dv-tabs-overflow-container{scrollbar-width:thin}.dv-tabs-overflow-container .dv-tab:not(:last-child){border-bottom:1px solid var(--dv-tab-divider-color)}.dv-tabs-overflow-container .dv-active-tab{background-color:var(--dv-activegroup-visiblepanel-tab-background-color);color:var(--dv-activegroup-visiblepanel-tab-color)}.dv-tabs-overflow-container .dv-inactive-tab{background-color:var(--dv-activegroup-hiddenpanel-tab-background-color);color:var(--dv-activegroup-hiddenpanel-tab-color)}.dv-tabs-overflow-container .dv-tabs-overflow-group-header{display:flex;align-items:center;gap:6px;padding:4px 8px;font-size:.8em;font-weight:600;color:var(--dv-activegroup-hiddenpanel-tab-color);cursor:pointer;border-bottom:1px solid var(--dv-tab-divider-color)}.dv-tabs-overflow-container .dv-tabs-overflow-group-header:hover{background-color:var(--dv-icon-hover-background-color)}.dv-tabs-overflow-container .dv-tabs-overflow-group-color{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;background-color:var(--dv-tab-group-color)}.dv-tabs-overflow-container .dv-tabs-overflow-group-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-tabs-overflow-container .dv-tabs-overflow-group-collapsed-badge{font-size:.75em;font-weight:400;opacity:.7;padding:1px 4px;border-radius:3px;background-color:var(--dv-tab-divider-color)}.dv-tabs-overflow-container .dv-tabs-overflow-pinned-header{cursor:default}.dv-tabs-overflow-container .dv-tabs-overflow-pinned-header:hover{background-color:transparent}.dv-tabs-overflow-container .dv-tabs-overflow-pinned-header .dv-tabs-overflow-pinned-icon{display:inline-flex;align-items:center;flex-shrink:0;opacity:.7}.dv-tabs-overflow-container .dv-tabs-overflow-pinned-header .dv-tabs-overflow-pinned-icon .dv-svg{width:11px;height:11px}.dv-tabs-overflow-container .dv-tab.dv-tab--grouped{padding-left:16px}.dv-tabs-overflow-container.dv-tabs-overflow-advanced{min-width:220px}.dv-tabs-overflow-container.dv-tabs-overflow-advanced .dv-tabs-overflow-search{box-sizing:border-box;width:100%;padding:6px 8px;border:none;border-bottom:1px solid var(--dv-tab-divider-color);outline:none;font-size:inherit;font-family:inherit;color:var(--dv-activegroup-visiblepanel-tab-color);background-color:var(--dv-group-view-background-color)}.dv-tabs-overflow-container.dv-tabs-overflow-advanced .dv-tabs-overflow-list{display:flex;flex-direction:column;outline:none}.dv-tabs-overflow-container.dv-tabs-overflow-advanced .dv-tab.dv-tabs-overflow-option--focused{outline:1px solid var(--dv-tab-divider-color);outline-offset:-1px;background-color:var(--dv-icon-hover-background-color)}.dv-tabs-and-actions-container{display:flex;background-color:var(--dv-tabs-and-actions-container-background-color);flex-shrink:0;box-sizing:border-box;height:var(--dv-tabs-and-actions-container-height);font-size:var(--dv-tabs-and-actions-container-font-size)}.dv-tabs-and-actions-container:has(.dv-tabs-container--wrap){height:auto;min-height:var(--dv-tabs-and-actions-container-height);align-items:flex-start}.dv-tabs-and-actions-container:has(.dv-tabs-container--wrap)>.dv-pre-actions-container,.dv-tabs-and-actions-container:has(.dv-tabs-container--wrap)>.dv-left-actions-container,.dv-tabs-and-actions-container:has(.dv-tabs-container--wrap)>.dv-right-actions-container,.dv-tabs-and-actions-container:has(.dv-tabs-container--wrap)>.dv-void-container{height:var(--dv-tabs-and-actions-container-height)}.dv-tabs-and-actions-container.dv-single-tab.dv-full-width-single-tab .dv-scrollable,.dv-tabs-and-actions-container.dv-single-tab.dv-full-width-single-tab .dv-tabs-container{flex-grow:1}.dv-tabs-and-actions-container.dv-single-tab.dv-full-width-single-tab .dv-tabs-container .dv-tab{flex-grow:1;padding:0}.dv-tabs-and-actions-container.dv-single-tab.dv-full-width-single-tab .dv-void-container{flex-grow:0}.dv-tabs-and-actions-container .dv-void-container{display:flex;flex-grow:1;user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;touch-action:none}.dv-tabs-and-actions-container .dv-void-container.dv-draggable{cursor:grab}.dv-tabs-and-actions-container .dv-right-actions-container{display:flex}.dv-tabs-and-actions-container .dv-right-actions-container.dv-right-actions-container-vertical{flex-direction:column}.dv-tabs-and-actions-container.dv-groupview-header-vertical{flex-direction:column;height:auto;width:var(--dv-tabs-and-actions-container-height)}.dv-tabs-and-actions-container.dv-groupview-header-vertical:has(.dv-tabs-container--wrap){width:auto;min-width:var(--dv-tabs-and-actions-container-height)}.dv-tabs-and-actions-container.dv-groupview-header-vertical:has(.dv-tabs-container--wrap)>.dv-scrollable{align-self:stretch}.dv-watermark{display:flex;height:100%}.dv-dockview{position:relative;background-color:var(--dv-group-view-background-color)}.dv-dockview .dv-watermark-container{position:absolute;top:0;left:0;height:100%;width:100%;z-index:1}.dv-dockview .dv-overlay-render-container{position:relative}.dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{background-color:var(--dv-activegroup-visiblepanel-tab-background-color);color:var(--dv-activegroup-visiblepanel-tab-color)}.dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-inactive-tab{background-color:var(--dv-activegroup-hiddenpanel-tab-background-color);color:var(--dv-activegroup-hiddenpanel-tab-color)}.dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{background-color:var(--dv-inactivegroup-visiblepanel-tab-background-color);color:var(--dv-inactivegroup-visiblepanel-tab-color)}.dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-inactive-tab{background-color:var(--dv-inactivegroup-hiddenpanel-tab-background-color);color:var(--dv-inactivegroup-hiddenpanel-tab-color)}.dv-tab.dv-tab-dragging{background-color:var(--dv-activegroup-visiblepanel-tab-background-color);color:var(--dv-activegroup-visiblepanel-tab-color)}.dv-keyboard-docking-hint{position:absolute;left:50%;bottom:8px;transform:translate(-50%);z-index:100;max-width:90%;padding:4px 10px;border-radius:4px;font-size:12px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;background-color:var(--dv-context-menu-background-color, var(--dv-group-view-background-color));color:var(--dv-activegroup-visiblepanel-tab-color);border:1px solid var(--dv-tab-divider-color);box-shadow:0 2px 8px #00000059}.dv-groupview{display:flex;height:100%;background-color:var(--dv-group-view-background-color);overflow:hidden;flex-direction:column}.dv-groupview:focus{outline:none}.dv-groupview>.dv-content-container{flex-grow:1;min-height:0;outline:none}.dv-groupview.dv-groupview-header-bottom{flex-direction:column-reverse}.dv-groupview.dv-groupview-header-left{flex-direction:row}.dv-groupview.dv-groupview-header-right{flex-direction:row-reverse}.dv-groupview.dv-groupview-edge.dv-edge-collapsed>.dv-content-container{display:none}.dv-root-wrapper,.dv-grid-view,.dv-branch-node{height:100%;width:100%}.dv-debug .dv-resize-container .dv-resize-handle-top{background-color:red}.dv-debug .dv-resize-container .dv-resize-handle-bottom{background-color:green}.dv-debug .dv-resize-container .dv-resize-handle-left{background-color:#ff0}.dv-debug .dv-resize-container .dv-resize-handle-right{background-color:#00f}.dv-debug .dv-resize-container .dv-resize-handle-topleft,.dv-debug .dv-resize-container .dv-resize-handle-topright,.dv-debug .dv-resize-container .dv-resize-handle-bottomleft,.dv-debug .dv-resize-container .dv-resize-handle-bottomright{background-color:#0ff}.dv-floating-overlay-host{position:absolute;pointer-events:none}.dv-floating-overlay-host>.dv-resize-container{pointer-events:auto}.dv-edge-peek{background-color:var(--dv-group-view-background-color);border:1px solid var(--dv-separator-border);box-shadow:0 6px 16px #0006}.dv-edge-peek>*{width:100%;height:100%;overflow:auto}.dv-auto-edge-band{position:absolute;pointer-events:none;z-index:var(--dv-overlay-z-index, 999);background-color:var(--dv-edge-dock-indicator-color);box-shadow:0 0 6px var(--dv-edge-dock-indicator-color)}.dv-edge-peek-header{display:flex;align-items:center;gap:4px;padding:0 4px 0 8px;box-sizing:border-box;background-color:var(--dv-group-view-background-color);border:1px solid var(--dv-separator-border);border-bottom:none;color:var(--dv-activegroup-visiblepanel-tab-color);font-size:12px}.dv-edge-peek-header .dv-edge-peek-pin,.dv-edge-peek-header .dv-edge-peek-close{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;cursor:pointer;border:none;padding:4px;color:inherit;background:transparent;outline:none}.dv-edge-peek-header .dv-edge-peek-pin:hover,.dv-edge-peek-header .dv-edge-peek-close:hover{border-radius:2px;background-color:var(--dv-icon-hover-background-color)}.dv-edge-peek-header .dv-edge-peek-pin:focus-visible,.dv-edge-peek-header .dv-edge-peek-close:focus-visible{border-radius:2px;outline:1px solid var(--dv-tab-divider-color);outline-offset:-1px}.dv-edge-peek-title{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-resize-container>.dv-grid-view{width:100%;height:100%}.dv-resize-container-with-titlebar{display:flex;flex-direction:column}.dv-resize-container-with-titlebar>.dv-floating-titlebar{flex:0 0 auto}.dv-resize-container-with-titlebar>.dv-grid-view{height:auto;flex:1 1 0;min-height:0}.dv-floating-titlebar{box-sizing:border-box;flex-shrink:0;height:var(--dv-floating-titlebar-height, 22px);background-color:var(--dv-floating-titlebar-background-color);border-bottom:var(--dv-floating-titlebar-border-bottom, none);-webkit-user-select:none;user-select:none;touch-action:none}.dv-floating-titlebar.dv-draggable{cursor:grab}.dv-resize-container{--dv-overlay-z-index: var(--dv-overlay-z-index, 999);position:absolute;z-index:calc(var(--dv-overlay-z-index) - 2);background-color:var(--dv-group-view-background-color);border:var(--dv-floating-border);box-shadow:var(--dv-floating-box-shadow);will-change:transform,opacity;transform:translateZ(0);backface-visibility:hidden}.dv-resize-container.dv-hidden{display:none}.dv-resize-container.dv-resize-container-dragging{opacity:var(--dv-floating-group-dragging-opacity);will-change:transform,opacity}.dv-resize-container .dv-resize-handle-top,.dv-resize-container .dv-resize-handle-bottom,.dv-resize-container .dv-resize-handle-left,.dv-resize-container .dv-resize-handle-right,.dv-resize-container .dv-resize-handle-topleft,.dv-resize-container .dv-resize-handle-topright,.dv-resize-container .dv-resize-handle-bottomleft,.dv-resize-container .dv-resize-handle-bottomright{touch-action:none}.dv-resize-container .dv-resize-handle-top{height:4px;width:calc(100% - 8px);left:4px;top:-2px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:ns-resize}.dv-resize-container .dv-resize-handle-bottom{height:4px;width:calc(100% - 8px);left:4px;bottom:-2px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:ns-resize}.dv-resize-container .dv-resize-handle-left{height:calc(100% - 8px);width:4px;left:-2px;top:4px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:ew-resize}.dv-resize-container .dv-resize-handle-right{height:calc(100% - 8px);width:4px;right:-2px;top:4px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:ew-resize}.dv-resize-container .dv-resize-handle-topleft{height:4px;width:4px;top:-2px;left:-2px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:nw-resize}.dv-resize-container .dv-resize-handle-topright{height:4px;width:4px;right:-2px;top:-2px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:ne-resize}.dv-resize-container .dv-resize-handle-bottomleft{height:4px;width:4px;left:-2px;bottom:-2px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:sw-resize}.dv-resize-container .dv-resize-handle-bottomright{height:4px;width:4px;right:-2px;bottom:-2px;z-index:var(--dv-overlay-z-index);position:absolute;cursor:se-resize}@media(pointer:coarse){.dv-resize-container .dv-resize-handle-top,.dv-resize-container .dv-resize-handle-bottom{height:16px;width:calc(100% - 48px);left:24px}.dv-resize-container .dv-resize-handle-top{top:-10px}.dv-resize-container .dv-resize-handle-bottom{bottom:-10px}.dv-resize-container .dv-resize-handle-left,.dv-resize-container .dv-resize-handle-right{width:16px;height:calc(100% - 48px);top:24px}.dv-resize-container .dv-resize-handle-left{left:-10px}.dv-resize-container .dv-resize-handle-right{right:-10px}.dv-resize-container .dv-resize-handle-topleft,.dv-resize-container .dv-resize-handle-topright,.dv-resize-container .dv-resize-handle-bottomleft,.dv-resize-container .dv-resize-handle-bottomright{height:24px;width:24px}.dv-resize-container .dv-resize-handle-topleft{top:-12px;left:-12px}.dv-resize-container .dv-resize-handle-topright{top:-12px;right:-12px}.dv-resize-container .dv-resize-handle-bottomleft{bottom:-12px;left:-12px}.dv-resize-container .dv-resize-handle-bottomright{bottom:-12px;right:-12px}}.dv-smart-guides{pointer-events:none;z-index:calc(var(--dv-overlay-z-index, 999) + 100)}.dv-smart-guide{background-color:var(--dv-smart-guides-color, #1f9cf0)}.dv-smart-guide-preview{box-sizing:border-box;background-color:var(--dv-smart-guides-preview-color, rgba(31, 156, 240, .18));border:1px solid var(--dv-smart-guides-color, #1f9cf0)}.dv-render-overlay{--dv-overlay-z-index: var(--dv-overlay-z-index, 999);position:absolute;z-index:1;width:100%;height:100%;contain:layout paint;isolation:isolate;will-change:transform;transform:translateZ(0);backface-visibility:hidden}.dv-render-overlay.dv-render-overlay-float{z-index:calc(var(--dv-overlay-z-index) - 1)}.dv-debug .dv-render-overlay{outline:1px solid red;outline-offset:-1}.dv-pane-container{height:100%;width:100%}.dv-pane-container.dv-animated .dv-view{will-change:transform;transform:translateZ(0);backface-visibility:hidden;transition:transform .15s ease-out}.dv-pane-container .dv-view{overflow:hidden;display:flex;flex-direction:column;padding:0!important}.dv-pane-container .dv-view:not(:first-child):before{background-color:transparent!important}.dv-pane-container .dv-view:not(:first-child) .dv-pane>.dv-pane-header{border-top:1px solid var(--dv-paneview-header-border-color)}.dv-pane-container .dv-view .dv-default-header{background-color:var(--dv-group-view-background-color);color:var(--dv-activegroup-visiblepanel-tab-color);display:flex;padding:0 8px;cursor:pointer}.dv-pane-container .dv-view .dv-default-header .dv-pane-header-icon{display:flex;justify-content:center;align-items:center}.dv-pane-container .dv-view .dv-default-header>span{padding-left:8px;flex-grow:1}.dv-pane-container:first-of-type>.dv-pane>.dv-pane-header{border-top:none!important}.dv-pane-container .dv-pane{display:flex;flex-direction:column;overflow:hidden;height:100%}.dv-pane-container .dv-pane .dv-pane-header{box-sizing:border-box;-webkit-user-select:none;user-select:none;position:relative;outline:none}.dv-pane-container .dv-pane .dv-pane-header.dv-pane-draggable{cursor:pointer}.dv-pane-container .dv-pane .dv-pane-header:focus-visible:before,.dv-pane-container .dv-pane .dv-pane-header:has(:focus-visible):before{position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;content:"";pointer-events:none;outline:1px solid;outline-width:-1px;outline-style:solid;outline-offset:-1px;outline-color:var(--dv-paneview-active-outline-color)}.dv-pane-container .dv-pane .dv-pane-body{overflow-y:auto;overflow-x:hidden;flex-grow:1;position:relative;outline:none}.dv-pane-container .dv-pane .dv-pane-body:focus-visible:before,.dv-pane-container .dv-pane .dv-pane-body:has(:focus-visible):before{position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;content:"";pointer-events:none;outline:1px solid;outline-width:-1px;outline-style:solid;outline-offset:-1px;outline-color:var(--dv-paneview-active-outline-color)}.dv-scrollable{position:relative;overflow:hidden}.dv-scrollable .dv-scrollbar{position:absolute;border-radius:2px;background-color:transparent;will-change:background-color,transform;transform:translateZ(0);backface-visibility:hidden;transition-property:background-color;transition-timing-function:ease-in-out;transition-duration:1s;transition-delay:0s}.dv-scrollable .dv-scrollbar-horizontal{bottom:0;left:0;height:4px}.dv-scrollable .dv-scrollbar-vertical{right:0;top:0;width:4px}.dv-scrollable:hover .dv-scrollbar,.dv-scrollable.dv-scrollable-resizing .dv-scrollbar,.dv-scrollable.dv-scrollable-scrolling .dv-scrollbar{background-color:var(--dv-scrollbar-background-color, rgba(255, 255, 255, .25))}.dv-debug .dv-split-view-container .dv-sash-container .dv-sash.dv-enabled{background-color:#000}.dv-debug .dv-split-view-container .dv-sash-container .dv-sash.dv-disabled{background-color:orange}.dv-debug .dv-split-view-container .dv-sash-container .dv-sash.dv-maximum{background-color:green}.dv-debug .dv-split-view-container .dv-sash-container .dv-sash.dv-minimum{background-color:red}.dv-split-view-container{position:relative;overflow:hidden;height:100%;width:100%}.dv-split-view-container.dv-splitview-disabled>.dv-sash-container>.dv-sash{pointer-events:none}.dv-split-view-container.dv-animation .dv-view,.dv-split-view-container.dv-animation .dv-sash{will-change:transform;transform:translateZ(0);backface-visibility:hidden;transition:transform .15s ease-out}.dv-split-view-container.dv-horizontal{height:100%}.dv-split-view-container.dv-horizontal>.dv-sash-container>.dv-sash{height:100%;width:4px}.dv-split-view-container.dv-horizontal>.dv-sash-container>.dv-sash.dv-enabled{cursor:ew-resize}.dv-split-view-container.dv-horizontal>.dv-sash-container>.dv-sash.dv-disabled{cursor:default}.dv-split-view-container.dv-horizontal>.dv-sash-container>.dv-sash.dv-maximum{cursor:w-resize}.dv-split-view-container.dv-horizontal>.dv-sash-container>.dv-sash.dv-minimum{cursor:e-resize}.dv-split-view-container.dv-horizontal>.dv-view-container>.dv-view:not(:first-child):before{height:100%;width:1px}.dv-split-view-container.dv-vertical{width:100%}.dv-split-view-container.dv-vertical>.dv-sash-container>.dv-sash{width:100%;height:4px}.dv-split-view-container.dv-vertical>.dv-sash-container>.dv-sash.dv-enabled{cursor:ns-resize}.dv-split-view-container.dv-vertical>.dv-sash-container>.dv-sash.dv-disabled{cursor:default}.dv-split-view-container.dv-vertical>.dv-sash-container>.dv-sash.dv-maximum{cursor:n-resize}.dv-split-view-container.dv-vertical>.dv-sash-container>.dv-sash.dv-minimum{cursor:s-resize}.dv-split-view-container.dv-vertical>.dv-view-container>.dv-view{width:100%}.dv-split-view-container.dv-vertical>.dv-view-container>.dv-view:not(:first-child):before{height:1px;width:100%}.dv-split-view-container .dv-sash-container{height:100%;width:100%;position:absolute}.dv-split-view-container .dv-sash-container .dv-sash{position:absolute;z-index:99;outline:none;user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;touch-action:none;background-color:var(--dv-sash-color, transparent)}.dv-split-view-container .dv-sash-container .dv-sash:not(.disabled):active,.dv-split-view-container .dv-sash-container .dv-sash:not(.disabled):hover{background-color:var(--dv-active-sash-color, transparent);transition-property:background-color;transition-timing-function:ease-in-out;transition-duration:var(--dv-active-sash-transition-duration, .1s);transition-delay:var(--dv-active-sash-transition-delay, .5s)}@media(pointer:coarse){.dv-split-view-container .dv-sash-container>.dv-sash:not(.dv-disabled):before{content:"";position:absolute;background:transparent}.dv-split-view-container.dv-horizontal>.dv-sash-container>.dv-sash:not(.dv-disabled):before{inset:0 -10px}.dv-split-view-container.dv-vertical>.dv-sash-container>.dv-sash:not(.dv-disabled):before{inset:-10px 0}}.dv-split-view-container .dv-view-container{position:relative;height:100%;width:100%}.dv-split-view-container .dv-view-container .dv-view{height:100%;box-sizing:border-box;overflow:auto;position:absolute}.dv-split-view-container.dv-separator-border .dv-view:not(:first-child):before{content:" ";position:absolute;top:0;left:0;z-index:5;pointer-events:none;background-color:var(--dv-separator-border)}.dv-svg{display:inline-block;fill:currentcolor;line-height:1;stroke:currentcolor;stroke-width:0}.dockview-theme-dark{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-dark .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-dark{color-scheme:dark;--dv-group-view-background-color: #1e1e1e;--dv-tabs-and-actions-container-background-color: #252526;--dv-activegroup-visiblepanel-tab-background-color: #1e1e1e;--dv-activegroup-hiddenpanel-tab-background-color: #2d2d2d;--dv-inactivegroup-visiblepanel-tab-background-color: #1e1e1e;--dv-inactivegroup-hiddenpanel-tab-background-color: #2d2d2d;--dv-tab-divider-color: #1e1e1e;--dv-activegroup-visiblepanel-tab-color: white;--dv-activegroup-hiddenpanel-tab-color: #969696;--dv-inactivegroup-visiblepanel-tab-color: #8f8f8f;--dv-inactivegroup-hiddenpanel-tab-color: #626262;--dv-separator-border: rgb(68, 68, 68);--dv-paneview-header-border-color: rgba(204, 204, 204, .2)}.dockview-theme-light{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-light .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-light{color-scheme:light;--dv-group-view-background-color: white;--dv-tabs-and-actions-container-background-color: #f3f3f3;--dv-activegroup-visiblepanel-tab-background-color: white;--dv-activegroup-hiddenpanel-tab-background-color: #ececec;--dv-inactivegroup-visiblepanel-tab-background-color: white;--dv-inactivegroup-hiddenpanel-tab-background-color: #ececec;--dv-tab-divider-color: white;--dv-activegroup-visiblepanel-tab-color: rgb(51, 51, 51);--dv-activegroup-hiddenpanel-tab-color: rgba(51, 51, 51, .7);--dv-inactivegroup-visiblepanel-tab-color: rgba(51, 51, 51, .7);--dv-inactivegroup-hiddenpanel-tab-color: rgba(51, 51, 51, .35);--dv-separator-border: rgba(128, 128, 128, .35);--dv-paneview-header-border-color: rgb(51, 51, 51);--dv-scrollbar-background-color: rgba(0, 0, 0, .25);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .08);--dv-floating-border: 1px solid rgba(0, 0, 0, .1)}.dockview-theme-vs{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-vs .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-vs{color-scheme:dark;--dv-group-view-background-color: #1e1e1e;--dv-tabs-and-actions-container-background-color: #252526;--dv-activegroup-visiblepanel-tab-background-color: #1e1e1e;--dv-activegroup-hiddenpanel-tab-background-color: #2d2d2d;--dv-inactivegroup-visiblepanel-tab-background-color: #1e1e1e;--dv-inactivegroup-hiddenpanel-tab-background-color: #2d2d2d;--dv-tab-divider-color: #1e1e1e;--dv-activegroup-hiddenpanel-tab-color: #969696;--dv-inactivegroup-visiblepanel-tab-color: #8f8f8f;--dv-inactivegroup-hiddenpanel-tab-color: #626262;--dv-separator-border: rgb(68, 68, 68);--dv-paneview-header-border-color: rgba(204, 204, 204, .2);--dv-tabs-and-actions-container-background-color: #2d2d30;--dv-tabs-and-actions-container-height: 20px;--dv-tabs-and-actions-container-font-size: 11px;--dv-activegroup-visiblepanel-tab-background-color: #007acc;--dv-inactivegroup-visiblepanel-tab-background-color: #3f3f46;--dv-activegroup-visiblepanel-tab-color: white;--dv-activegroup-hiddenpanel-tab-color: white;--dv-inactivegroup-visiblepanel-tab-color: white;--dv-inactivegroup-hiddenpanel-tab-color: white}.dockview-theme-vs .dv-groupview.dv-active-group>.dv-tabs-and-actions-container{box-sizing:content-box;border-bottom:2px solid var(--dv-activegroup-visiblepanel-tab-background-color)}.dockview-theme-vs .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tab.dv-active-tab{border-top:2px solid var(--dv-activegroup-visiblepanel-tab-background-color)}.dockview-theme-vs .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tab.dv-inactive-tab{border-top:2px solid var(--dv-activegroup-hiddenpanel-tab-background-color)}.dockview-theme-vs .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container{box-sizing:content-box;border-bottom:2px solid var(--dv-inactivegroup-visiblepanel-tab-background-color)}.dockview-theme-vs .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tab.dv-active-tab{border-top:2px solid var(--dv-inactivegroup-visiblepanel-tab-background-color)}.dockview-theme-vs .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tab.dv-inactive-tab{border-top:2px solid var(--dv-inactivegroup-hiddenpanel-tab-background-color)}.dockview-theme-abyss{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-abyss .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-abyss{color-scheme:dark;--dv-color-abyss-dark: #000c18;--dv-color-abyss: #10192c;--dv-color-abyss-light: #1c1c2a;--dv-color-abyss-lighter: #2b2b4a;--dv-color-abyss-accent: rgb(91, 30, 207);--dv-color-abyss-primary-text: white;--dv-color-abyss-secondary-text: rgb(148, 151, 169);--dv-group-view-background-color: var(--dv-color-abyss-dark);--dv-tabs-and-actions-container-background-color: var( --dv-color-abyss-light );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-abyss-dark );--dv-activegroup-hiddenpanel-tab-background-color: var(--dv-color-abyss);--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-abyss-dark );--dv-inactivegroup-hiddenpanel-tab-background-color: var(--dv-color-abyss);--dv-tab-divider-color: var(--dv-color-abyss-lighter);--dv-activegroup-visiblepanel-tab-color: white;--dv-activegroup-hiddenpanel-tab-color: rgba(255, 255, 255, .5);--dv-inactivegroup-visiblepanel-tab-color: rgba(255, 255, 255, .5);--dv-inactivegroup-hiddenpanel-tab-color: rgba(255, 255, 255, .25);--dv-separator-border: var(--dv-color-abyss-lighter);--dv-paneview-header-border-color: var(--dv-color-abyss-lighter);--dv-paneview-active-outline-color: #596f99}.dockview-theme-dracula{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-dracula .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-dracula{color-scheme:dark;--dv-group-view-background-color: #282a36;--dv-tabs-and-actions-container-background-color: #191a21;--dv-activegroup-visiblepanel-tab-background-color: #282a36;--dv-activegroup-hiddenpanel-tab-background-color: #21222c;--dv-inactivegroup-visiblepanel-tab-background-color: #282a36;--dv-inactivegroup-hiddenpanel-tab-background-color: #21222c;--dv-tab-divider-color: #191a21;--dv-activegroup-visiblepanel-tab-color: rgb(248, 248, 242);--dv-activegroup-hiddenpanel-tab-color: rgb(98, 114, 164);--dv-inactivegroup-visiblepanel-tab-color: rgba(248, 248, 242, .5);--dv-inactivegroup-hiddenpanel-tab-color: rgba(98, 114, 164, .5);--dv-separator-border: #bd93f9;--dv-paneview-header-border-color: #bd93f9;--dv-paneview-active-outline-color: #6272a4}.dockview-theme-dracula .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-dracula .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:1px;background-color:#94527e;z-index:999}.dockview-theme-dracula .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-dracula .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:1px;background-color:#5e3d5a;z-index:999}.dockview-theme-nord{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-nord .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-nord{color-scheme:dark;--dv-color-nord-polar-0: #2e3440;--dv-color-nord-polar-1: #3b4252;--dv-color-nord-polar-2: #434c5e;--dv-color-nord-polar-3: #4c566a;--dv-color-nord-frost: #88c0d0;--dv-color-nord-frost-2: #81a1c1;--dv-color-nord-snow-0: #eceff4;--dv-color-nord-snow-1: #d8dee9;--dv-group-view-background-color: var(--dv-color-nord-polar-0);--dv-tabs-and-actions-container-background-color: var( --dv-color-nord-polar-1 );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-nord-polar-0 );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-nord-polar-2 );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-nord-polar-1 );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-nord-polar-2 );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-nord-snow-0);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-nord-snow-1);--dv-inactivegroup-visiblepanel-tab-color: #8a9bbf;--dv-inactivegroup-hiddenpanel-tab-color: #5e6f8e;--dv-separator-border: var(--dv-color-nord-polar-3);--dv-paneview-active-outline-color: var(--dv-color-nord-frost);--dv-active-sash-color: var(--dv-color-nord-frost);--dv-scrollbar-background-color: rgba(76, 86, 106, .5)}.dockview-theme-nord .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-nord .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:2px;background-color:var(--dv-color-nord-frost);z-index:999}.dockview-theme-nord .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-nord .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:2px;background-color:var(--dv-color-nord-frost-2);z-index:999}.dockview-theme-nord-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-nord-spaced .dv-dockview{padding:0}.dockview-theme-nord-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-nord-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-nord-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-nord-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-nord-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-nord-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-nord-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-nord-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-tabs-overflow-container,.dockview-theme-nord-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-nord-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-nord-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-nord-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-nord-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-nord-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-nord-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-nord-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-nord-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-nord-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-nord-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-nord-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-edge-peek,.dockview-theme-nord-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-nord-spaced{color-scheme:dark;--dv-color-nord-polar-0: #2e3440;--dv-color-nord-polar-1: #3b4252;--dv-color-nord-polar-2: #434c5e;--dv-color-nord-polar-3: #4c566a;--dv-color-nord-frost: #88c0d0;--dv-color-nord-frost-2: #81a1c1;--dv-color-nord-snow-0: #eceff4;--dv-color-nord-snow-1: #d8dee9;--dv-group-view-background-color: var(--dv-color-nord-polar-0);--dv-tabs-and-actions-container-background-color: var( --dv-color-nord-polar-1 );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-nord-polar-2 );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-nord-polar-1 );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-nord-polar-2 );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-nord-polar-1 );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-nord-snow-0);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-nord-snow-1);--dv-inactivegroup-visiblepanel-tab-color: #8a9bbf;--dv-inactivegroup-hiddenpanel-tab-color: #5e6f8e;--dv-separator-border: transparent;--dv-paneview-active-outline-color: var(--dv-color-nord-frost);--dv-active-sash-color: var(--dv-color-nord-frost);--dv-scrollbar-background-color: rgba(76, 86, 106, .5);--dv-floating-group-border: 2px solid var(--dv-color-nord-polar-0)}.dockview-theme-catppuccin-mocha{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-catppuccin-mocha .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-catppuccin-mocha{color-scheme:dark;--dv-color-mocha-crust: #11111b;--dv-color-mocha-mantle: #181825;--dv-color-mocha-base: #1e1e2e;--dv-color-mocha-surface0: #313244;--dv-color-mocha-surface1: #45475a;--dv-color-mocha-text: #cdd6f4;--dv-color-mocha-subtext1: #bac2de;--dv-color-mocha-subtext0: #a6adc8;--dv-color-mocha-mauve: #cba6f7;--dv-color-mocha-lavender: #b4befe;--dv-group-view-background-color: var(--dv-color-mocha-base);--dv-tabs-and-actions-container-background-color: var( --dv-color-mocha-mantle );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-mocha-base );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-mocha-surface0 );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-mocha-mantle );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-mocha-crust );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-mocha-text);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-mocha-subtext1);--dv-inactivegroup-visiblepanel-tab-color: var(--dv-color-mocha-subtext0);--dv-inactivegroup-hiddenpanel-tab-color: rgba(166, 173, 200, .5);--dv-separator-border: var(--dv-color-mocha-surface1);--dv-paneview-active-outline-color: var(--dv-color-mocha-mauve);--dv-active-sash-color: var(--dv-color-mocha-mauve);--dv-scrollbar-background-color: rgba(49, 50, 68, .8)}.dockview-theme-catppuccin-mocha .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-catppuccin-mocha .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:2px;background-color:var(--dv-color-mocha-mauve);z-index:999}.dockview-theme-catppuccin-mocha .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-catppuccin-mocha .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:2px;background-color:#b4befe66;z-index:999}.dockview-theme-catppuccin-mocha-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-catppuccin-mocha-spaced .dv-dockview{padding:0}.dockview-theme-catppuccin-mocha-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-catppuccin-mocha-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-catppuccin-mocha-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-catppuccin-mocha-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-catppuccin-mocha-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-catppuccin-mocha-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-catppuccin-mocha-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-tabs-overflow-container,.dockview-theme-catppuccin-mocha-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-catppuccin-mocha-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-catppuccin-mocha-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-catppuccin-mocha-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-catppuccin-mocha-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-catppuccin-mocha-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-catppuccin-mocha-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-catppuccin-mocha-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-edge-peek,.dockview-theme-catppuccin-mocha-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-catppuccin-mocha-spaced{color-scheme:dark;--dv-color-mocha-crust: #11111b;--dv-color-mocha-mantle: #181825;--dv-color-mocha-base: #1e1e2e;--dv-color-mocha-surface0: #313244;--dv-color-mocha-surface1: #45475a;--dv-color-mocha-text: #cdd6f4;--dv-color-mocha-subtext1: #bac2de;--dv-color-mocha-subtext0: #a6adc8;--dv-color-mocha-mauve: #cba6f7;--dv-color-mocha-lavender: #b4befe;--dv-group-view-background-color: var(--dv-color-mocha-crust);--dv-tabs-and-actions-container-background-color: var( --dv-color-mocha-mantle );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-mocha-surface0 );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-mocha-mantle );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-mocha-surface0 );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-mocha-mantle );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-mocha-text);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-mocha-subtext1);--dv-inactivegroup-visiblepanel-tab-color: var(--dv-color-mocha-subtext0);--dv-inactivegroup-hiddenpanel-tab-color: rgba(166, 173, 200, .5);--dv-separator-border: transparent;--dv-paneview-active-outline-color: var(--dv-color-mocha-mauve);--dv-active-sash-color: var(--dv-color-mocha-mauve);--dv-scrollbar-background-color: rgba(49, 50, 68, .8);--dv-floating-group-border: 2px solid var(--dv-color-mocha-crust)}.dockview-theme-monokai{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-monokai .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-monokai{color-scheme:dark;--dv-color-monokai-bg: #272822;--dv-color-monokai-bg-light: #3e3d32;--dv-color-monokai-comment: #75715e;--dv-color-monokai-fg: #f8f8f2;--dv-color-monokai-green: #a6e22e;--dv-group-view-background-color: var(--dv-color-monokai-bg);--dv-tabs-and-actions-container-background-color: var( --dv-color-monokai-bg-light );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-monokai-bg );--dv-activegroup-hiddenpanel-tab-background-color: #2d2c25;--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-monokai-bg );--dv-inactivegroup-hiddenpanel-tab-background-color: #2d2c25;--dv-activegroup-visiblepanel-tab-color: var(--dv-color-monokai-fg);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-monokai-comment);--dv-inactivegroup-visiblepanel-tab-color: rgba(248, 248, 242, .5);--dv-inactivegroup-hiddenpanel-tab-color: rgba(117, 113, 94, .5);--dv-separator-border: var(--dv-color-monokai-bg-light);--dv-paneview-active-outline-color: var(--dv-color-monokai-green);--dv-active-sash-color: var(--dv-color-monokai-green);--dv-scrollbar-background-color: rgba(117, 113, 94, .5)}.dockview-theme-monokai .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-monokai .dv-groupview.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:2px;background-color:var(--dv-color-monokai-green);z-index:999}.dockview-theme-monokai .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab{position:relative}.dockview-theme-monokai .dv-groupview.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{position:absolute;left:0;bottom:0;content:"";width:100%;height:2px;background-color:#a6e22e59;z-index:999}.dockview-theme-solarized-light{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-solarized-light .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-solarized-light{color-scheme:light;--dv-color-sol-base3: #fdf6e3;--dv-color-sol-base2: #eee8d5;--dv-color-sol-base1: #93a1a1;--dv-color-sol-base00: #657b83;--dv-color-sol-base01: #586e75;--dv-color-sol-blue: #268bd2;--dv-group-view-background-color: var(--dv-color-sol-base3);--dv-tabs-and-actions-container-background-color: var(--dv-color-sol-base2);--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-sol-base3 );--dv-activegroup-hiddenpanel-tab-background-color: #e8e2d0;--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-sol-base3 );--dv-inactivegroup-hiddenpanel-tab-background-color: #e8e2d0;--dv-activegroup-visiblepanel-tab-color: var(--dv-color-sol-base01);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-sol-base00);--dv-inactivegroup-visiblepanel-tab-color: var(--dv-color-sol-base1);--dv-inactivegroup-hiddenpanel-tab-color: rgba(147, 161, 161, .6);--dv-separator-border: var(--dv-color-sol-base2);--dv-paneview-active-outline-color: var(--dv-color-sol-blue);--dv-active-sash-color: var(--dv-color-sol-blue);--dv-scrollbar-background-color: rgba(101, 123, 131, .25);--dv-drag-over-background-color: rgba(38, 139, 210, .15);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .08);--dv-floating-border: 1px solid rgba(0, 0, 0, .1)}.dockview-theme-solarized-light-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-solarized-light-spaced .dv-dockview{padding:0}.dockview-theme-solarized-light-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-solarized-light-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-solarized-light-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-solarized-light-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-solarized-light-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-solarized-light-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-solarized-light-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-solarized-light-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-tabs-overflow-container,.dockview-theme-solarized-light-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-solarized-light-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-solarized-light-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-solarized-light-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-solarized-light-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-solarized-light-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-solarized-light-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-solarized-light-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-solarized-light-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-solarized-light-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-solarized-light-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-solarized-light-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-edge-peek,.dockview-theme-solarized-light-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-solarized-light-spaced{color-scheme:light;--dv-color-sol-base3: #fdf6e3;--dv-color-sol-base2: #eee8d5;--dv-color-sol-base1: #93a1a1;--dv-color-sol-base00: #657b83;--dv-color-sol-base01: #586e75;--dv-color-sol-blue: #268bd2;--dv-drag-over-background-color: rgba(38, 139, 210, .1);--dv-group-view-background-color: var(--dv-color-sol-base2);--dv-tabs-and-actions-container-background-color: var(--dv-color-sol-base3);--dv-activegroup-visiblepanel-tab-background-color: #e8e2d0;--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-sol-base3 );--dv-inactivegroup-visiblepanel-tab-background-color: #e8e2d0;--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-sol-base3 );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-sol-base01);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-sol-base00);--dv-inactivegroup-visiblepanel-tab-color: var(--dv-color-sol-base1);--dv-inactivegroup-hiddenpanel-tab-color: rgba(147, 161, 161, .6);--dv-separator-border: transparent;--dv-paneview-active-outline-color: var(--dv-color-sol-blue);--dv-active-sash-color: var(--dv-color-sol-blue);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .08);--dv-floating-border: 1px solid rgba(0, 0, 0, .1);--dv-scrollbar-background-color: rgba(101, 123, 131, .25);--dv-floating-group-border: 2px solid rgba(238, 232, 213, .5)}.dockview-theme-github-dark{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-github-dark .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-github-dark{color-scheme:dark;--dv-color-gh-canvas-default: #0d1117;--dv-color-gh-canvas-subtle: #161b22;--dv-color-gh-canvas-inset: #010409;--dv-color-gh-border: #30363d;--dv-color-gh-border-muted: #21262d;--dv-color-gh-fg-default: #e6edf3;--dv-color-gh-fg-muted: #8b949e;--dv-color-gh-fg-subtle: #6e7681;--dv-color-gh-accent: #58a6ff;--dv-group-view-background-color: var(--dv-color-gh-canvas-default);--dv-tabs-and-actions-container-background-color: var( --dv-color-gh-canvas-subtle );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-gh-canvas-default );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-canvas-subtle );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-gh-canvas-default );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-canvas-subtle );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-gh-fg-default);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-gh-fg-muted);--dv-inactivegroup-visiblepanel-tab-color: var(--dv-color-gh-fg-subtle);--dv-inactivegroup-hiddenpanel-tab-color: rgba(110, 118, 129, .5);--dv-separator-border: var(--dv-color-gh-border);--dv-paneview-active-outline-color: var(--dv-color-gh-accent);--dv-active-sash-color: var(--dv-color-gh-accent);--dv-scrollbar-background-color: rgba(48, 54, 61, .7);--dv-drag-over-background-color: rgba(88, 166, 255, .15)}.dockview-theme-github-dark-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-github-dark-spaced .dv-dockview{padding:0}.dockview-theme-github-dark-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-github-dark-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-github-dark-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-github-dark-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-github-dark-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-github-dark-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-github-dark-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-github-dark-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-tabs-overflow-container,.dockview-theme-github-dark-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-github-dark-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-github-dark-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-github-dark-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-github-dark-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-github-dark-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-github-dark-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-github-dark-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-github-dark-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-github-dark-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-github-dark-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-github-dark-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-edge-peek,.dockview-theme-github-dark-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-dark-spaced{color-scheme:dark;--dv-color-gh-canvas-default: #0d1117;--dv-color-gh-canvas-subtle: #161b22;--dv-color-gh-canvas-inset: #010409;--dv-color-gh-border: #30363d;--dv-color-gh-border-muted: #21262d;--dv-color-gh-fg-default: #e6edf3;--dv-color-gh-fg-muted: #8b949e;--dv-color-gh-fg-subtle: #6e7681;--dv-color-gh-accent: #58a6ff;--dv-drag-over-background-color: rgba(88, 166, 255, .1);--dv-group-view-background-color: var(--dv-color-gh-canvas-inset);--dv-tabs-and-actions-container-background-color: var( --dv-color-gh-canvas-subtle );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-gh-border );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-canvas-subtle );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-gh-border );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-canvas-subtle );--dv-activegroup-visiblepanel-tab-color: var(--dv-color-gh-fg-default);--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-gh-fg-muted);--dv-inactivegroup-visiblepanel-tab-color: var(--dv-color-gh-fg-subtle);--dv-inactivegroup-hiddenpanel-tab-color: rgba(110, 118, 129, .5);--dv-separator-border: transparent;--dv-paneview-active-outline-color: var(--dv-color-gh-accent);--dv-active-sash-color: var(--dv-color-gh-accent);--dv-scrollbar-background-color: rgba(48, 54, 61, .7);--dv-floating-group-border: 2px solid var(--dv-color-gh-canvas-inset)}.dockview-theme-github-light{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6}.dockview-theme-github-light .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed{opacity:0;transition:none}.dockview-theme-github-light{color-scheme:light;--dv-color-gh-light-canvas-default: #ffffff;--dv-color-gh-light-canvas-subtle: #f6f8fa;--dv-color-gh-light-canvas-inset: #f0f6ff;--dv-color-gh-light-border: #d0d7de;--dv-color-gh-light-fg-default: #1f2328;--dv-color-gh-light-fg-muted: #656d76;--dv-color-gh-light-fg-subtle: #6e7781;--dv-color-gh-light-accent: #0969da;--dv-group-view-background-color: var(--dv-color-gh-light-canvas-default);--dv-tabs-and-actions-container-background-color: var( --dv-color-gh-light-canvas-subtle );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-gh-light-canvas-default );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-light-canvas-subtle );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-gh-light-canvas-default );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-light-canvas-subtle );--dv-activegroup-visiblepanel-tab-color: var( --dv-color-gh-light-fg-default );--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-gh-light-fg-muted);--dv-inactivegroup-visiblepanel-tab-color: var( --dv-color-gh-light-fg-subtle );--dv-inactivegroup-hiddenpanel-tab-color: rgba(110, 118, 129, .4);--dv-separator-border: var(--dv-color-gh-light-border);--dv-paneview-active-outline-color: var(--dv-color-gh-light-accent);--dv-active-sash-color: var(--dv-color-gh-light-accent);--dv-scrollbar-background-color: rgba(208, 215, 222, .5);--dv-drag-over-background-color: rgba(9, 105, 218, .1);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .08);--dv-floating-border: 1px solid rgba(0, 0, 0, .1)}.dockview-theme-github-light-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-github-light-spaced .dv-dockview{padding:0}.dockview-theme-github-light-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-github-light-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-github-light-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-github-light-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-github-light-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-github-light-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-github-light-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-github-light-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-tabs-overflow-container,.dockview-theme-github-light-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-github-light-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-github-light-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-github-light-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-github-light-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-github-light-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-github-light-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-github-light-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-github-light-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-github-light-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-github-light-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-github-light-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-edge-peek,.dockview-theme-github-light-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-github-light-spaced{color-scheme:light;--dv-color-gh-light-canvas-default: #ffffff;--dv-color-gh-light-canvas-subtle: #f6f8fa;--dv-color-gh-light-border: #d0d7de;--dv-color-gh-light-fg-default: #1f2328;--dv-color-gh-light-fg-muted: #656d76;--dv-color-gh-light-fg-subtle: #6e7781;--dv-color-gh-light-accent: #0969da;--dv-drag-over-background-color: rgba(9, 105, 218, .08);--dv-group-view-background-color: var(--dv-color-gh-light-canvas-subtle);--dv-tabs-and-actions-container-background-color: var( --dv-color-gh-light-canvas-default );--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-gh-light-border );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-light-canvas-default );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-gh-light-border );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-gh-light-canvas-default );--dv-activegroup-visiblepanel-tab-color: var( --dv-color-gh-light-fg-default );--dv-activegroup-hiddenpanel-tab-color: var(--dv-color-gh-light-fg-muted);--dv-inactivegroup-visiblepanel-tab-color: var( --dv-color-gh-light-fg-subtle );--dv-inactivegroup-hiddenpanel-tab-color: rgba(110, 118, 129, .4);--dv-separator-border: transparent;--dv-paneview-active-outline-color: var(--dv-color-gh-light-accent);--dv-active-sash-color: var(--dv-color-gh-light-accent);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .08);--dv-floating-border: 1px solid rgba(0, 0, 0, .1);--dv-scrollbar-background-color: rgba(208, 215, 222, .5);--dv-floating-group-border: 2px solid rgba(208, 215, 222, .5)}.dockview-theme-abyss-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-abyss-spaced .dv-dockview{padding:0}.dockview-theme-abyss-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-abyss-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-abyss-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-abyss-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-abyss-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-abyss-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-abyss-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-abyss-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-tabs-overflow-container,.dockview-theme-abyss-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-abyss-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-abyss-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-abyss-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-abyss-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-abyss-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-abyss-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-abyss-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-abyss-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-abyss-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-abyss-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-abyss-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-edge-peek,.dockview-theme-abyss-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-abyss-spaced{color-scheme:dark;--dv-color-abyss-dark: rgb(11, 6, 17);--dv-color-abyss: #16121f;--dv-color-abyss-light: #201d2b;--dv-color-abyss-lighter: #2a2837;--dv-color-abyss-accent: rgb(91, 30, 207);--dv-color-abyss-primary-text: white;--dv-color-abyss-secondary-text: rgb(148, 151, 169);--dv-drag-over-background-color: "";--dv-group-view-background-color: var(--dv-color-abyss-dark);--dv-tabs-and-actions-container-background-color: var(--dv-color-abyss);--dv-activegroup-visiblepanel-tab-background-color: var( --dv-color-abyss-lighter );--dv-activegroup-hiddenpanel-tab-background-color: var( --dv-color-abyss-light );--dv-inactivegroup-visiblepanel-tab-background-color: var( --dv-color-abyss-lighter );--dv-inactivegroup-hiddenpanel-tab-background-color: var( --dv-color-abyss-light );--dv-tab-divider-color: transparent;--dv-activegroup-visiblepanel-tab-color: var(--dv-color-abyss-primary-text);--dv-activegroup-hiddenpanel-tab-color: var( --dv-color-abyss-secondary-text );--dv-inactivegroup-visiblepanel-tab-color: var( --dv-color-abyss-primary-text );--dv-inactivegroup-hiddenpanel-tab-color: var( --dv-color-abyss-secondary-text );--dv-separator-border: transparent;--dv-paneview-header-border-color: rgb(51, 51, 51);--dv-active-sash-color: var(--dv-color-abyss-accent);--dv-floating-group-border: 2px solid var(--dv-color-abyss-dark)}.dockview-theme-light-spaced{--dv-paneview-active-outline-color: dodgerblue;--dv-tabs-and-actions-container-font-size: 13px;--dv-tabs-and-actions-container-height: 35px;--dv-drag-over-background-color: rgba(83, 89, 93, .5);--dv-drag-over-border-color: transparent;--dv-edge-dock-indicator-color: rgba(56, 139, 253, .9);--dv-tabs-container-scrollbar-color: #888;--dv-icon-hover-background-color: rgba(90, 93, 94, .31);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .25);--dv-floating-border: 1px solid rgba(255, 255, 255, .1);--dv-overlay-z-index: 999;--dv-tab-font-size: inherit;--dv-border-radius: 0px;--dv-tab-margin: 0;--dv-sash-color: transparent;--dv-active-sash-color: transparent;--dv-active-sash-transition-duration: .1s;--dv-active-sash-transition-delay: .5s;--dv-spacing-padding: 0px;--dv-tab-border-radius: 0px;--dv-sash-border-radius: 0px;--dv-dropdown-border-radius: 0px;--dv-tab-close-icon-size: inherit;--dv-floating-group-border: none;--dv-drag-over-border: none;--dv-floating-group-dragging-opacity: .5;--dv-floating-titlebar-height: 22px;--dv-floating-titlebar-background-color: var( --dv-tabs-and-actions-container-background-color );--dv-floating-titlebar-border-bottom: var(--dv-floating-border);--dv-tab-group-color-grey: #5f6368;--dv-tab-group-color-blue: #1a73e8;--dv-tab-group-color-red: #d93025;--dv-tab-group-color-yellow: #f9ab00;--dv-tab-group-color-green: #188038;--dv-tab-group-color-pink: #d01884;--dv-tab-group-color-purple: #a142f4;--dv-tab-group-color-cyan: #007b83;--dv-tab-group-color-orange: #e8710a;--dv-tab-group-chip-padding: 4px 8px;--dv-tab-group-chip-border-radius: 6px;--dv-tab-group-chip-font-size: 11px;--dv-tab-group-line-height: 2px;--dv-tab-group-line-opacity: .6;--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-theme-light-spaced .dv-dockview{padding:0}.dockview-theme-light-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-theme-light-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-theme-light-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-theme-light-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-theme-light-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-theme-light-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-theme-light-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-theme-light-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-tabs-overflow-container,.dockview-theme-light-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-theme-light-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-theme-light-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-theme-light-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-light-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-theme-light-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-theme-light-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-theme-light-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-theme-light-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-light-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-theme-light-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-theme-light-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-edge-peek,.dockview-theme-light-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-theme-light-spaced{color-scheme:light;--dv-drag-over-background-color: "";--dv-group-view-background-color: #f6f5f9;--dv-tabs-and-actions-container-background-color: white;--dv-activegroup-visiblepanel-tab-background-color: #ededf0;--dv-activegroup-hiddenpanel-tab-background-color: #f9f9fa;--dv-inactivegroup-visiblepanel-tab-background-color: #ededf0;--dv-inactivegroup-hiddenpanel-tab-background-color: #f9f9fa;--dv-tab-divider-color: transparent;--dv-activegroup-visiblepanel-tab-color: rgb(104, 107, 130);--dv-activegroup-hiddenpanel-tab-color: rgb(148, 151, 169);--dv-inactivegroup-visiblepanel-tab-color: rgb(104, 107, 130);--dv-inactivegroup-hiddenpanel-tab-color: rgb(148, 151, 169);--dv-separator-border: transparent;--dv-paneview-header-border-color: rgb(51, 51, 51);--dv-active-sash-color: rgb(91, 30, 207);--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, .12), 0 2px 8px rgba(0, 0, 0, .08);--dv-floating-border: 1px solid rgba(0, 0, 0, .1);--dv-scrollbar-background-color: rgba(0, 0, 0, .25);--dv-floating-group-border: 2px solid rgba(255, 255, 255, .1)}.dockview-spaced{--dv-spacing-padding: 10px;--dv-tab-font-size: 12px;--dv-border-radius: 12px;--dv-tab-margin-block: .5rem;--dv-tab-margin-inline: .25rem;--dv-tab-margin: var(--dv-tab-margin-block) var(--dv-tab-margin-inline);--dv-tabs-and-actions-container-height: 44px;--dv-tab-border-radius: 8px;--dv-sash-border-radius: 4px;--dv-dropdown-border-radius: 8px;--dv-tab-close-icon-size: 8px;--dv-floating-group-border: 2px solid var(--dv-group-view-background-color);--dv-floating-titlebar-background-color: var( --dv-group-view-background-color );--dv-floating-titlebar-border-bottom: none;box-sizing:border-box;padding:var(--dv-spacing-padding);background-color:var(--dv-group-view-background-color)}.dockview-spaced .dv-dockview{padding:0}.dockview-spaced .dv-resize-container:has(>.dv-groupview){border-radius:8px}.dockview-spaced .dv-sash{border-radius:var(--dv-sash-border-radius)}.dockview-spaced .dv-drop-target-anchor{border-radius:calc(var(--dv-border-radius) / 4)}.dockview-spaced .dv-drop-target-anchor.dv-drop-target-content{border-radius:var(--dv-border-radius)}.dockview-spaced .dv-resize-container{border-radius:var(--dv-border-radius)!important;border:none}.dockview-spaced .dv-resize-container .dv-groupview{border:var(--dv-floating-group-border)}.dockview-spaced .dv-resize-container>.dv-grid-view{box-sizing:border-box;padding:var(--dv-spacing-padding)}.dockview-spaced .dv-resize-container-with-titlebar>.dv-grid-view{padding-top:0}.dockview-spaced .dv-resize-container-with-titlebar>.dv-floating-titlebar{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-tabs-overflow-container,.dockview-spaced .dv-tabs-overflow-dropdown-default{border-radius:var(--dv-dropdown-border-radius);height:unset!important}.dockview-spaced .dv-render-overlay{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-tab{border-radius:var(--dv-tab-border-radius)}.dockview-spaced .dv-tab .dv-svg{height:var(--dv-tab-close-icon-size);width:var(--dv-tab-close-icon-size)}.dockview-spaced .dv-tabs-container--wrap:not(.dv-tabs-container-vertical) .dv-tab{height:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-spaced .dv-tabs-container-vertical .dv-tab{margin:var(--dv-tab-margin-inline) var(--dv-tab-margin-block)}.dockview-spaced .dv-tabs-container--wrap.dv-tabs-container-vertical .dv-tab{width:calc(var(--dv-tabs-and-actions-container-height) - 2 * var(--dv-tab-margin-block))}.dockview-spaced .dv-groupview{border-radius:var(--dv-border-radius)}.dockview-spaced .dv-groupview .dv-tabs-and-actions-container{padding:0px calc(var(--dv-border-radius) / 2);border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-groupview .dv-tabs-and-actions-container.dv-groupview-header-vertical{padding:calc(var(--dv-border-radius) / 2) 0}.dockview-spaced .dv-groupview .dv-content-container{background-color:var(--dv-tabs-and-actions-container-background-color);border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-groupview.dv-groupview-header-bottom>.dv-tabs-and-actions-container{border-radius:0 0 var(--dv-border-radius) var(--dv-border-radius)}.dockview-spaced .dv-groupview.dv-groupview-header-bottom>.dv-content-container{border-radius:var(--dv-border-radius) var(--dv-border-radius) 0 0}.dockview-spaced .dv-groupview.dv-groupview-header-left>.dv-tabs-and-actions-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-spaced .dv-groupview.dv-groupview-header-left>.dv-content-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-spaced .dv-groupview.dv-groupview-header-right>.dv-tabs-and-actions-container{border-radius:0 var(--dv-border-radius) var(--dv-border-radius) 0}.dockview-spaced .dv-groupview.dv-groupview-header-right>.dv-content-container{border-radius:var(--dv-border-radius) 0 0 var(--dv-border-radius)}.dockview-spaced .dv-groupview.dv-edge-tool-window .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-groupview.dv-edge-tool-window .dv-content-container{border-radius:0}.dockview-spaced .dv-groupview.dv-edge-tool-window .dv-tabs-and-actions-container{border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-edge-peek,.dockview-spaced .dv-edge-peek-clip{border-bottom-left-radius:var(--dv-border-radius);border-bottom-right-radius:var(--dv-border-radius)}.dockview-spaced .dv-edge-peek-header{border-top-left-radius:var(--dv-border-radius);border-top-right-radius:var(--dv-border-radius)}.dv-context-menu{min-width:160px;overflow:hidden;background:var(--dv-context-menu-background-color, var(--dv-activegroup-hiddenpanel-tab-background-color));color:var(--dv-context-menu-color, var(--dv-activegroup-hiddenpanel-tab-color));border:1px solid var(--dv-tab-divider-color);border-radius:var(--dv-border-radius);box-shadow:var(--dv-floating-box-shadow);padding:4px 0}.dv-context-menu-item{height:25px;padding:0 12px;display:flex;align-items:center;cursor:pointer;font-size:var(--dv-tabs-and-actions-container-font-size);white-space:nowrap;-webkit-user-select:none;user-select:none}.dv-context-menu-item:hover{background:var(--dv-icon-hover-background-color)}.dv-context-menu-item.dv-context-menu-item--disabled{opacity:.4;cursor:default;pointer-events:none}.dv-context-menu-separator{height:1px;background:var(--dv-tab-divider-color);margin:4px 0}.dv-context-menu-rename{padding:8px 12px 4px}.dv-context-menu-rename-input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dv-tab-divider-color);border-radius:var(--dv-border-radius);background:inherit;color:var(--dv-activegroup-visiblepanel-tab-color);font-size:var(--dv-tabs-and-actions-container-font-size);outline:none}.dv-context-menu-rename-input:focus{border-color:var(--dv-activegroup-visiblepanel-tab-color)}.dv-context-menu-rename-input::placeholder{color:var(--dv-activegroup-hiddenpanel-tab-color)}.dv-context-menu-color-picker{display:flex;flex-direction:row;gap:6px;padding:8px 12px;align-items:center}.dv-context-menu-color-swatch{width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid transparent;flex-shrink:0;background-color:var(--dv-tab-group-color)}.dv-context-menu-color-swatch:hover{opacity:.85}.dv-context-menu-color-swatch.dv-context-menu-color-swatch--selected{outline:2px solid var(--dv-tab-divider-color);outline-offset:2px}.dv-tab-group-indicator-none .dv-groupview-header-bottom .dv-tab-group-underline{top:auto;bottom:0}.dv-groupview.dv-groupview-header-bottom.dv-active-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after,.dv-groupview.dv-groupview-header-bottom.dv-inactive-group>.dv-tabs-and-actions-container .dv-tabs-container>.dv-tab.dv-active-tab:after{top:0;bottom:auto}', Os = ':root{--bg:#2f383e;--bg-alt:#272f34;--fg:#d3c6aa;--muted:#859289;--border:#475258;--v3-ui-bg:#1d2732;--v3-ui-panel:#253343;--v3-ui-fg:#e1e7ef;--v3-ui-border:#475258;--wcp-accent:#83b9f0;--wcp-font-size:14px;--wcp-surface-bg:#1d2732;--wcp-workspace-padding:4px;color-scheme:dark;font-family:var(--laity-ui-font,"Sarasa Fixed SC","Sarasa Mono SC",ui-monospace,monospace);color:var(--v3-ui-fg);background:var(--bg)}*{box-sizing:border-box}html,body,#app{height:100%;width:100%;margin:0;overflow:hidden}body{font-size:var(--wcp-font-size)}button,input,select,textarea{font:inherit}[hidden]{display:none!important}#app{display:flex;flex-direction:column;min-height:0;padding:5px 10px 8px;gap:3px}.app-header{display:flex;align-items:center;min-height:22px;gap:8px}.brand{display:flex;gap:10px;align-items:center;min-width:0;flex-wrap:wrap}.brand strong{font-size:15px;font-weight:650;white-space:nowrap;color:#e1e7ef}.brand-name{font-weight:500}.version{font-size:11px;color:#99acc3;white-space:nowrap}#platform-state{font-size:11px;color:#a4cdff;max-width:min(42vw,500px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v3-top-row{display:flex;align-items:center;gap:8px;flex:0 0 auto;border-bottom:1px solid #3e4b5b;min-height:31px}.top-actions{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}.env-label{font-size:11px;color:#96a9bf;white-space:nowrap}button#swap-plugin,.settings-load-status+button{border:1px solid #52647c;background:#1e2935;color:#edf1f6;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px}button:hover:not(:disabled){background:#324259}button:disabled{opacity:.45;cursor:not-allowed}.workspace{flex:1;min-width:0;min-height:0;overflow:hidden;background:var(--wcp-surface-bg);padding:var(--wcp-workspace-padding)}#dock-root,.full-root{width:100%;height:100%;min-width:0;min-height:0}#dock-root .dv-dockview{height:100%;--dv-background-color:var(--v3-ui-bg);--dv-group-view-background-color:var(--v3-ui-bg);--dv-tabs-and-actions-container-background-color:var(--v3-ui-panel);--dv-activegroup-visiblepanel-tab-background-color:#3b5269;--dv-activegroup-visiblepanel-tab-color:#f0f7ff}.panel-content{height:100%;width:100%;min-height:0;overflow:auto;background:var(--wcp-surface-bg)}.panel-inspector{padding:12px 16px;color:#bdcadd;font-size:12px;line-height:1.7}.panel-inspector h3{margin-top:0;font-size:14px}.panel-inspector .key{color:#89a0bc}.full-root{background:var(--v3-ui-bg);overflow:hidden}.wcp-settings-host{height:100%;min-height:0;overflow:hidden}.wcp-settings-host laity-settings-panel{display:block;height:100%;min-height:0;width:100%;--las-source-font-size:13px;--las-source-line-height:1.5}.settings-load-status{font-size:13px;color:#b4cbe3;padding:16px 12px}.settings-load-status+button{margin:0 12px}@media(max-width:710px){#app{padding:5px 6px 6px}.v3-top-row{flex-wrap:wrap;gap:2px}.top-actions{margin-left:auto}.env-label{display:none}.brand{gap:6px}.brand-name{display:none}#platform-state{max-width:60vw}.workspace{min-height:0}}@media(orientation:portrait)and (min-width:761px)and (max-width:1024px){#wcp-shared-settings[layout=horizontal] .las-shell{flex-direction:column}#wcp-shared-settings[layout=horizontal] .las-grid-col{flex:0 0 40%;min-height:0}#wcp-shared-settings[layout=horizontal] .las-source-col{flex:1;min-height:0}#wcp-shared-settings[layout=horizontal] .las-divider{cursor:row-resize}}@media(pointer:coarse){.v3-top-row{min-height:42px}#app{padding-bottom:max(7px,env(safe-area-inset-bottom))}.workspace{overscroll-behavior:contain}}';
const rt = globalThis, Qt = rt.ShadowRoot && (rt.ShadyCSS === void 0 || rt.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, ei = /* @__PURE__ */ Symbol(), Vi = /* @__PURE__ */ new WeakMap();
let Uo = class {
  constructor(t, i, o) {
    if (this._$cssResult$ = !0, o !== ei) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = i;
  }
  get styleSheet() {
    let t = this.o;
    const i = this.t;
    if (Qt && t === void 0) {
      const o = i !== void 0 && i.length === 1;
      o && (t = Vi.get(i)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), o && Vi.set(i, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
};
const $s = (e) => new Uo(typeof e == "string" ? e : e + "", void 0, ei), ti = (e, ...t) => {
  const i = e.length === 1 ? e[0] : t.reduce((o, r, n) => o + ((s) => {
    if (s._$cssResult$ === !0) return s.cssText;
    if (typeof s == "number") return s;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + s + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(r) + e[n + 1], e[0]);
  return new Uo(i, e, ei);
}, Rs = (e, t) => {
  if (Qt) e.adoptedStyleSheets = t.map((i) => i instanceof CSSStyleSheet ? i : i.styleSheet);
  else for (const i of t) {
    const o = document.createElement("style"), r = rt.litNonce;
    r !== void 0 && o.setAttribute("nonce", r), o.textContent = i.cssText, e.appendChild(o);
  }
}, Ni = Qt ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((t) => {
  let i = "";
  for (const o of t.cssRules) i += o.cssText;
  return $s(i);
})(e) : e;
const { is: Ls, defineProperty: Vs, getOwnPropertyDescriptor: Ns, getOwnPropertyNames: Ws, getOwnPropertySymbols: Hs, getPrototypeOf: Fs } = Object, gt = globalThis, Wi = gt.trustedTypes, Bs = Wi ? Wi.emptyScript : "", Us = gt.reactiveElementPolyfillSupport, Le = (e, t) => e, Vt = { toAttribute(e, t) {
  switch (t) {
    case Boolean:
      e = e ? Bs : null;
      break;
    case Object:
    case Array:
      e = e == null ? e : JSON.stringify(e);
  }
  return e;
}, fromAttribute(e, t) {
  let i = e;
  switch (t) {
    case Boolean:
      i = e !== null;
      break;
    case Number:
      i = e === null ? null : Number(e);
      break;
    case Object:
    case Array:
      try {
        i = JSON.parse(e);
      } catch {
        i = null;
      }
  }
  return i;
} }, Yo = (e, t) => !Ls(e, t), Hi = { attribute: !0, type: String, converter: Vt, reflect: !1, useDefault: !1, hasChanged: Yo };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), gt.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let Se = class extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ??= []).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, i = Hi) {
    if (i.state && (i.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(t) && ((i = Object.create(i)).wrapped = !0), this.elementProperties.set(t, i), !i.noAccessor) {
      const o = /* @__PURE__ */ Symbol(), r = this.getPropertyDescriptor(t, o, i);
      r !== void 0 && Vs(this.prototype, t, r);
    }
  }
  static getPropertyDescriptor(t, i, o) {
    const { get: r, set: n } = Ns(this.prototype, t) ?? { get() {
      return this[i];
    }, set(s) {
      this[i] = s;
    } };
    return { get: r, set(s) {
      const a = r?.call(this);
      n?.call(this, s), this.requestUpdate(t, a, o);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? Hi;
  }
  static _$Ei() {
    if (this.hasOwnProperty(Le("elementProperties"))) return;
    const t = Fs(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(Le("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(Le("properties"))) {
      const i = this.properties, o = [...Ws(i), ...Hs(i)];
      for (const r of o) this.createProperty(r, i[r]);
    }
    const t = this[Symbol.metadata];
    if (t !== null) {
      const i = litPropertyMetadata.get(t);
      if (i !== void 0) for (const [o, r] of i) this.elementProperties.set(o, r);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [i, o] of this.elementProperties) {
      const r = this._$Eu(i, o);
      r !== void 0 && this._$Eh.set(r, i);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t) {
    const i = [];
    if (Array.isArray(t)) {
      const o = new Set(t.flat(1 / 0).reverse());
      for (const r of o) i.unshift(Ni(r));
    } else t !== void 0 && i.push(Ni(t));
    return i;
  }
  static _$Eu(t, i) {
    const o = i.attribute;
    return o === !1 ? void 0 : typeof o == "string" ? o : typeof t == "string" ? t.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t) => this.enableUpdating = t), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t) => t(this));
  }
  addController(t) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t), this.renderRoot !== void 0 && this.isConnected && t.hostConnected?.();
  }
  removeController(t) {
    this._$EO?.delete(t);
  }
  _$E_() {
    const t = /* @__PURE__ */ new Map(), i = this.constructor.elementProperties;
    for (const o of i.keys()) this.hasOwnProperty(o) && (t.set(o, this[o]), delete this[o]);
    t.size > 0 && (this._$Ep = t);
  }
  createRenderRoot() {
    const t = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return Rs(t, this.constructor.elementStyles), t;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((t) => t.hostConnected?.());
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t) => t.hostDisconnected?.());
  }
  attributeChangedCallback(t, i, o) {
    this._$AK(t, o);
  }
  _$ET(t, i) {
    const o = this.constructor.elementProperties.get(t), r = this.constructor._$Eu(t, o);
    if (r !== void 0 && o.reflect === !0) {
      const n = (o.converter?.toAttribute !== void 0 ? o.converter : Vt).toAttribute(i, o.type);
      this._$Em = t, n == null ? this.removeAttribute(r) : this.setAttribute(r, n), this._$Em = null;
    }
  }
  _$AK(t, i) {
    const o = this.constructor, r = o._$Eh.get(t);
    if (r !== void 0 && this._$Em !== r) {
      const n = o.getPropertyOptions(r), s = typeof n.converter == "function" ? { fromAttribute: n.converter } : n.converter?.fromAttribute !== void 0 ? n.converter : Vt;
      this._$Em = r;
      const a = s.fromAttribute(i, n.type);
      this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
    }
  }
  requestUpdate(t, i, o, r = !1, n) {
    if (t !== void 0) {
      const s = this.constructor;
      if (r === !1 && (n = this[t]), o ??= s.getPropertyOptions(t), !((o.hasChanged ?? Yo)(n, i) || o.useDefault && o.reflect && n === this._$Ej?.get(t) && !this.hasAttribute(s._$Eu(t, o)))) return;
      this.C(t, i, o);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(t, i, { useDefault: o, reflect: r, wrapped: n }, s) {
    o && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t) && (this._$Ej.set(t, s ?? i ?? this[t]), n !== !0 || s !== void 0) || (this._$AL.has(t) || (this.hasUpdated || o || (i = void 0), this._$AL.set(t, i)), r === !0 && this._$Em !== t && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t));
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$ES;
    } catch (i) {
      Promise.reject(i);
    }
    const t = this.scheduleUpdate();
    return t != null && await t, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [r, n] of this._$Ep) this[r] = n;
        this._$Ep = void 0;
      }
      const o = this.constructor.elementProperties;
      if (o.size > 0) for (const [r, n] of o) {
        const { wrapped: s } = n, a = this[r];
        s !== !0 || this._$AL.has(r) || a === void 0 || this.C(r, void 0, n, a);
      }
    }
    let t = !1;
    const i = this._$AL;
    try {
      t = this.shouldUpdate(i), t ? (this.willUpdate(i), this._$EO?.forEach((o) => o.hostUpdate?.()), this.update(i)) : this._$EM();
    } catch (o) {
      throw t = !1, this._$EM(), o;
    }
    t && this._$AE(i);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    this._$EO?.forEach((i) => i.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t) {
    return !0;
  }
  update(t) {
    this._$Eq &&= this._$Eq.forEach((i) => this._$ET(i, this[i])), this._$EM();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
};
Se.elementStyles = [], Se.shadowRootOptions = { mode: "open" }, Se[Le("elementProperties")] = /* @__PURE__ */ new Map(), Se[Le("finalized")] = /* @__PURE__ */ new Map(), Us?.({ ReactiveElement: Se }), (gt.reactiveElementVersions ??= []).push("2.1.2");
const ii = globalThis, Fi = (e) => e, ct = ii.trustedTypes, Bi = ct ? ct.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, jo = "$lit$", ue = `lit$${Math.random().toFixed(9).slice(2)}$`, Zo = "?" + ue, Ys = `<${Zo}>`, De = document, Be = () => De.createComment(""), Ue = (e) => e === null || typeof e != "object" && typeof e != "function", oi = Array.isArray, js = (e) => oi(e) || typeof e?.[Symbol.iterator] == "function", yt = `[ 	
\f\r]`, Me = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Ui = /-->/g, Yi = />/g, me = RegExp(`>|${yt}(?:([^\\s"'>=/]+)(${yt}*=${yt}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), ji = /'/g, Zi = /"/g, Xo = /^(?:script|style|textarea|title)$/i, Zs = (e) => (t, ...i) => ({ _$litType$: e, strings: t, values: i }), we = Zs(1), Pe = /* @__PURE__ */ Symbol.for("lit-noChange"), Y = /* @__PURE__ */ Symbol.for("lit-nothing"), Xi = /* @__PURE__ */ new WeakMap(), _e = De.createTreeWalker(De, 129);
function qo(e, t) {
  if (!oi(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return Bi !== void 0 ? Bi.createHTML(t) : t;
}
const Xs = (e, t) => {
  const i = e.length - 1, o = [];
  let r, n = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", s = Me;
  for (let a = 0; a < i; a++) {
    const d = e[a];
    let c, l, h = -1, v = 0;
    for (; v < d.length && (s.lastIndex = v, l = s.exec(d), l !== null); ) v = s.lastIndex, s === Me ? l[1] === "!--" ? s = Ui : l[1] !== void 0 ? s = Yi : l[2] !== void 0 ? (Xo.test(l[2]) && (r = RegExp("</" + l[2], "g")), s = me) : l[3] !== void 0 && (s = me) : s === me ? l[0] === ">" ? (s = r ?? Me, h = -1) : l[1] === void 0 ? h = -2 : (h = s.lastIndex - l[2].length, c = l[1], s = l[3] === void 0 ? me : l[3] === '"' ? Zi : ji) : s === Zi || s === ji ? s = me : s === Ui || s === Yi ? s = Me : (s = me, r = void 0);
    const p = s === me && e[a + 1].startsWith("/>") ? " " : "";
    n += s === Me ? d + Ys : h >= 0 ? (o.push(c), d.slice(0, h) + jo + d.slice(h) + ue + p) : d + ue + (h === -2 ? a : p);
  }
  return [qo(e, n + (e[i] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), o];
};
class Ye {
  constructor({ strings: t, _$litType$: i }, o) {
    let r;
    this.parts = [];
    let n = 0, s = 0;
    const a = t.length - 1, d = this.parts, [c, l] = Xs(t, i);
    if (this.el = Ye.createElement(c, o), _e.currentNode = this.el.content, i === 2 || i === 3) {
      const h = this.el.content.firstChild;
      h.replaceWith(...h.childNodes);
    }
    for (; (r = _e.nextNode()) !== null && d.length < a; ) {
      if (r.nodeType === 1) {
        if (r.hasAttributes()) for (const h of r.getAttributeNames()) if (h.endsWith(jo)) {
          const v = l[s++], p = r.getAttribute(h).split(ue), u = /([.?@])?(.*)/.exec(v);
          d.push({ type: 1, index: n, name: u[2], strings: p, ctor: u[1] === "." ? Ks : u[1] === "?" ? Js : u[1] === "@" ? Qs : bt }), r.removeAttribute(h);
        } else h.startsWith(ue) && (d.push({ type: 6, index: n }), r.removeAttribute(h));
        if (Xo.test(r.tagName)) {
          const h = r.textContent.split(ue), v = h.length - 1;
          if (v > 0) {
            r.textContent = ct ? ct.emptyScript : "";
            for (let p = 0; p < v; p++) r.append(h[p], Be()), _e.nextNode(), d.push({ type: 2, index: ++n });
            r.append(h[v], Be());
          }
        }
      } else if (r.nodeType === 8) if (r.data === Zo) d.push({ type: 2, index: n });
      else {
        let h = -1;
        for (; (h = r.data.indexOf(ue, h + 1)) !== -1; ) d.push({ type: 7, index: n }), h += ue.length - 1;
      }
      n++;
    }
  }
  static createElement(t, i) {
    const o = De.createElement("template");
    return o.innerHTML = t, o;
  }
}
function ze(e, t, i = e, o) {
  if (t === Pe) return t;
  let r = o !== void 0 ? i._$Co?.[o] : i._$Cl;
  const n = Ue(t) ? void 0 : t._$litDirective$;
  return r?.constructor !== n && (r?._$AO?.(!1), n === void 0 ? r = void 0 : (r = new n(e), r._$AT(e, i, o)), o !== void 0 ? (i._$Co ??= [])[o] = r : i._$Cl = r), r !== void 0 && (t = ze(e, r._$AS(e, t.values), r, o)), t;
}
class qs {
  constructor(t, i) {
    this._$AV = [], this._$AN = void 0, this._$AD = t, this._$AM = i;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t) {
    const { el: { content: i }, parts: o } = this._$AD, r = (t?.creationScope ?? De).importNode(i, !0);
    _e.currentNode = r;
    let n = _e.nextNode(), s = 0, a = 0, d = o[0];
    for (; d !== void 0; ) {
      if (s === d.index) {
        let c;
        d.type === 2 ? c = new Ze(n, n.nextSibling, this, t) : d.type === 1 ? c = new d.ctor(n, d.name, d.strings, this, t) : d.type === 6 && (c = new ea(n, this, t)), this._$AV.push(c), d = o[++a];
      }
      s !== d?.index && (n = _e.nextNode(), s++);
    }
    return _e.currentNode = De, r;
  }
  p(t) {
    let i = 0;
    for (const o of this._$AV) o !== void 0 && (o.strings !== void 0 ? (o._$AI(t, o, i), i += o.strings.length - 2) : o._$AI(t[i])), i++;
  }
}
class Ze {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t, i, o, r) {
    this.type = 2, this._$AH = Y, this._$AN = void 0, this._$AA = t, this._$AB = i, this._$AM = o, this.options = r, this._$Cv = r?.isConnected ?? !0;
  }
  get parentNode() {
    let t = this._$AA.parentNode;
    const i = this._$AM;
    return i !== void 0 && t?.nodeType === 11 && (t = i.parentNode), t;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t, i = this) {
    t = ze(this, t, i), Ue(t) ? t === Y || t == null || t === "" ? (this._$AH !== Y && this._$AR(), this._$AH = Y) : t !== this._$AH && t !== Pe && this._(t) : t._$litType$ !== void 0 ? this.$(t) : t.nodeType !== void 0 ? this.T(t) : js(t) ? this.k(t) : this._(t);
  }
  O(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  T(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.O(t));
  }
  _(t) {
    this._$AH !== Y && Ue(this._$AH) ? this._$AA.nextSibling.data = t : this.T(De.createTextNode(t)), this._$AH = t;
  }
  $(t) {
    const { values: i, _$litType$: o } = t, r = typeof o == "number" ? this._$AC(t) : (o.el === void 0 && (o.el = Ye.createElement(qo(o.h, o.h[0]), this.options)), o);
    if (this._$AH?._$AD === r) this._$AH.p(i);
    else {
      const n = new qs(r, this), s = n.u(this.options);
      n.p(i), this.T(s), this._$AH = n;
    }
  }
  _$AC(t) {
    let i = Xi.get(t.strings);
    return i === void 0 && Xi.set(t.strings, i = new Ye(t)), i;
  }
  k(t) {
    oi(this._$AH) || (this._$AH = [], this._$AR());
    const i = this._$AH;
    let o, r = 0;
    for (const n of t) r === i.length ? i.push(o = new Ze(this.O(Be()), this.O(Be()), this, this.options)) : o = i[r], o._$AI(n), r++;
    r < i.length && (this._$AR(o && o._$AB.nextSibling, r), i.length = r);
  }
  _$AR(t = this._$AA.nextSibling, i) {
    for (this._$AP?.(!1, !0, i); t !== this._$AB; ) {
      const o = Fi(t).nextSibling;
      Fi(t).remove(), t = o;
    }
  }
  setConnected(t) {
    this._$AM === void 0 && (this._$Cv = t, this._$AP?.(t));
  }
}
class bt {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t, i, o, r, n) {
    this.type = 1, this._$AH = Y, this._$AN = void 0, this.element = t, this.name = i, this._$AM = r, this.options = n, o.length > 2 || o[0] !== "" || o[1] !== "" ? (this._$AH = Array(o.length - 1).fill(new String()), this.strings = o) : this._$AH = Y;
  }
  _$AI(t, i = this, o, r) {
    const n = this.strings;
    let s = !1;
    if (n === void 0) t = ze(this, t, i, 0), s = !Ue(t) || t !== this._$AH && t !== Pe, s && (this._$AH = t);
    else {
      const a = t;
      let d, c;
      for (t = n[0], d = 0; d < n.length - 1; d++) c = ze(this, a[o + d], i, d), c === Pe && (c = this._$AH[d]), s ||= !Ue(c) || c !== this._$AH[d], c === Y ? t = Y : t !== Y && (t += (c ?? "") + n[d + 1]), this._$AH[d] = c;
    }
    s && !r && this.j(t);
  }
  j(t) {
    t === Y ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class Ks extends bt {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === Y ? void 0 : t;
  }
}
class Js extends bt {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    this.element.toggleAttribute(this.name, !!t && t !== Y);
  }
}
class Qs extends bt {
  constructor(t, i, o, r, n) {
    super(t, i, o, r, n), this.type = 5;
  }
  _$AI(t, i = this) {
    if ((t = ze(this, t, i, 0) ?? Y) === Pe) return;
    const o = this._$AH, r = t === Y && o !== Y || t.capture !== o.capture || t.once !== o.once || t.passive !== o.passive, n = t !== Y && (o === Y || r);
    r && this.element.removeEventListener(this.name, this, o), n && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class ea {
  constructor(t, i, o) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = i, this.options = o;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    ze(this, t);
  }
}
const ta = ii.litHtmlPolyfillSupport;
ta?.(Ye, Ze), (ii.litHtmlVersions ??= []).push("3.3.3");
const ia = (e, t, i) => {
  const o = i?.renderBefore ?? t;
  let r = o._$litPart$;
  if (r === void 0) {
    const n = i?.renderBefore ?? null;
    o._$litPart$ = r = new Ze(t.insertBefore(Be(), n), n, void 0, i ?? {});
  }
  return r._$AI(e), r;
};
const ri = globalThis;
class xe extends Se {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t.firstChild, t;
  }
  update(t) {
    const i = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t), this._$Do = ia(i, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(!0);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(!1);
  }
  render() {
    return Pe;
  }
}
xe._$litElement$ = !0, xe.finalized = !0, ri.litElementHydrateSupport?.({ LitElement: xe });
const oa = ri.litElementPolyfillSupport;
oa?.({ LitElement: xe });
(ri.litElementVersions ??= []).push("4.2.2");
const vt = class vt extends xe {
  constructor() {
    super(...arguments), this.plugins = [], this.active = "";
  }
  render() {
    return we`<nav aria-label="组件标签">${this.plugins.map((t) => we`
    <button data-plugin-id=${t.id} aria-current=${this.active === t.id}
      @click=${() => this.dispatchEvent(new CustomEvent(
      "plugin-select",
      { detail: { id: t.id }, bubbles: !0, composed: !0 }
    ))}>
      ${t.name}<small>${t.version} · ${t.id}</small>
    </button>`)}</nav>`;
  }
};
vt.properties = { plugins: { attribute: !1 }, active: { type: String } }, vt.styles = ti`
    :host{display:block;min-width:0}nav{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    button{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:7px 7px 0 0;
      padding:5px 14px;background:transparent;color:#9cafc3;font:600 13px/1.5 var(--laity-ui-font,ui-monospace,monospace);
      cursor:pointer;white-space:nowrap}
    button:hover{background:#324259;color:#fff}button[aria-current="true"]{
      color:#d7eaff;background:#202d3b;box-shadow:inset 0 -3px var(--wcp-accent,#83b9f0)}
    small{font-size:10px;font-weight:450;color:#91a7bd}
    @media(max-width:710px){button{padding:8px 10px}}
    @media(pointer:coarse){button{min-height:44px}}
  `;
let Nt = vt;
customElements.get("plugin-menu") || customElements.define("plugin-menu", Nt);
const ra = {
  "demo:media:read": [
    { name: "图 01", detail: "figure-01.png", state: "已下载" },
    { name: "图 02", detail: "figure-02.png", state: "待处理" },
    { name: "表 03", detail: "table-03.html", state: "待清洗" }
  ],
  "demo:providers:read": [
    { name: "Provider A", detail: "示例状态 · 模拟数据", state: "就绪" },
    { name: "Provider B", detail: "示例状态 · 模拟数据", state: "待授权" }
  ]
}, qi = "https://agent-link.laity.bid/shared-settings/v1/";
let et;
async function na() {
  const e = await fetch(qi + "manifest.json", { cache: "no-store", credentials: "omit", mode: "cors" });
  if (!e.ok) throw new Error("共享设置清单 HTTP " + e.status);
  const t = await e.json(), i = typeof t == "object" && t !== null && "version" in t ? t.version : void 0;
  if (typeof i != "string" || !/^\d+\.\d+\.\d+$/.test(i))
    throw new Error("共享设置版本无效");
  if (await import(qi + "settings-panel.js?v=" + encodeURIComponent(i)), !customElements.get("laity-settings-panel")) throw new Error("共享设置组件未注册");
  return { version: i };
}
class sa {
  constructor(t, i = () => {
  }) {
    this.allowed = t, this.notifyHost = i;
  }
  forPlugin(t) {
    const i = new Set(t.requiredCapabilities.filter((o) => this.allowed.has(o)));
    return Object.freeze({
      readDemo: (o) => {
        if (!i.has(o) || !t.requiredCapabilities.includes(o))
          throw new Error("CAPABILITY_DENIED: " + o + " for " + t.id);
        return ra[o].map((r) => Object.freeze({ ...r }));
      },
      loadSharedSettings: () => {
        const o = "shared:settings:load";
        if (!i.has(o) || !t.requiredCapabilities.includes(o))
          throw new Error("CAPABILITY_DENIED: " + o + " for " + t.id);
        return et || (et = na().catch((r) => {
          throw et = void 0, r;
        })), et;
      },
      notify: (o) => this.notifyHost(t.id + ": " + o.slice(0, 160))
    });
  }
}
class aa {
  constructor(t) {
    this.registry = new As(), this.hostToken = new Ee("shell:host-services"), this.bundles = /* @__PURE__ */ new Map(), this.registry.application = { id: "web-component-platform" }, this.registry.registerPlugin({
      id: "shell:services",
      provides: this.hostToken,
      activate: () => t
    });
  }
  get activeId() {
    return this.currentId;
  }
  getBundle(t) {
    return this.bundles.get(t);
  }
  list() {
    return [...this.bundles.values()].map((t) => t.manifest).sort((t, i) => (t.order ?? 100) - (i.order ?? 100) || t.name.localeCompare(i.name));
  }
  install(t) {
    if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(t.manifest.id))
      throw new Error("Invalid plugin id");
    if (!/^\d+\.\d+\.\d+$/.test(t.manifest.version))
      throw new Error("Invalid semantic version");
    if (this.bundles.has(t.manifest.id)) throw new Error("Duplicate plugin id");
    const i = t.createPlugin(this.hostToken);
    if (i.id !== t.manifest.id || i.provides !== t.token)
      throw new Error("Manifest and plugin service mismatch");
    this.registry.registerPlugin(i), this.bundles.set(t.manifest.id, t);
  }
  async activate(t, i) {
    const o = this.bundles.get(t);
    if (!o) throw new Error("Unknown plugin: " + t);
    if (this.currentId === t) return;
    await this.disable(), await this.registry.activatePlugin(t);
    const r = await this.registry.resolveRequiredService(o.token);
    try {
      await r.mount(i);
    } catch (n) {
      throw await this.registry.deactivatePlugin(t), n;
    }
    this.currentId = t, this.currentView = r;
  }
  async disable() {
    if (!this.currentId) return;
    const t = this.currentId;
    this.currentView?.unmount(), await this.registry.deactivatePlugin(t), this.currentId = void 0, this.currentView = void 0;
  }
  /** Replace a *trusted, bundled* implementation. No arbitrary remote eval. */
  async replace(t, i) {
    const o = this.bundles.get(t.manifest.id);
    if (!o) throw new Error("Unknown plugin to replace");
    const r = this.currentId === o.manifest.id;
    r && await this.disable(), this.registry.deregisterPlugin(o.manifest.id), this.bundles.delete(o.manifest.id);
    try {
      this.install(t), r && await this.activate(t.manifest.id, i);
    } catch (n) {
      if (this.registry.hasPlugin(t.manifest.id)) {
        try {
          await this.registry.deactivatePlugin(t.manifest.id);
        } catch {
        }
        this.registry.deregisterPlugin(t.manifest.id, !0);
      }
      throw this.bundles.delete(t.manifest.id), this.install(o), r && await this.activate(o.manifest.id, i), n;
    }
  }
}
class F extends Error {
  constructor(t, i = t) {
    super(i), this.code = t, this.name = "RouteError";
  }
}
const Ki = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, da = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/, la = 131072;
function Ve(e, t, i = "$", o = 0) {
  if (o > 14) throw new F("SCHEMA_DEPTH", i);
  const r = Array.isArray(e) ? "array" : e === null ? "null" : typeof e;
  if (r !== t.type && (t.type !== "integer" || r !== "number" || !Number.isInteger(e)))
    throw new F("SCHEMA_INVALID", i + " expected " + t.type);
  if (r === "number" && !Number.isFinite(e)) throw new F("SCHEMA_INVALID", i + " nonfinite");
  if (t.enum && !t.enum.includes(e)) throw new F("SCHEMA_INVALID", i + " enum");
  if (r === "string" && t.maxLength !== void 0 && e.length > t.maxLength) throw new F("SCHEMA_INVALID", i + " length");
  if (r === "array") {
    if (e.length > 2e3) throw new F("SCHEMA_INVALID", i + " too many items");
    t.items && e.forEach((n, s) => Ve(n, t.items, i + "[" + s + "]", o + 1));
  }
  if (r === "object") {
    const n = e;
    for (const s of t.required ?? []) if (!Object.hasOwn(n, s)) throw new F("SCHEMA_INVALID", i + "." + s + " required");
    for (const [s, a] of Object.entries(n)) {
      const d = t.properties?.[s];
      if (d) Ve(a, d, i + "." + s, o + 1);
      else if (t.additionalProperties !== !0) throw new F("SCHEMA_INVALID", i + "." + s + " unknown");
    }
  }
}
function tt(e) {
  let t;
  try {
    t = JSON.stringify(e);
  } catch {
    throw new F("MESSAGE_NOT_SERIALIZABLE");
  }
  if (!t || t.length > la) throw new F("MESSAGE_TOO_LARGE");
  return JSON.parse(t);
}
class ca {
  constructor(t, i = 15e3) {
    this.timeoutMs = i, this.contracts = /* @__PURE__ */ new Map(), this.handlers = /* @__PURE__ */ new Map(), this.listeners = /* @__PURE__ */ new Map(), this.serial = 0;
    for (const o of t) {
      if (!da.test(o.name) || !Number.isInteger(o.version) || o.version < 1 || !["command", "query", "event"].includes(o.kind) || !o.senders.length || !o.receivers.length || [...o.senders, ...o.receivers].some((n) => !Ki.test(n)) || o.kind === "event" && o.response || o.kind !== "event" && (o.receivers.length !== 1 || !o.response))
        throw new F("CONTRACT_INVALID", o.name);
      const r = this.key(o.name, o.version);
      if (this.contracts.has(r)) throw new F("CONTRACT_DUPLICATE", r);
      this.contracts.set(r, Object.freeze({ ...o }));
    }
  }
  key(t, i) {
    return t + "@" + i;
  }
  contract(t, i, o, r, n = !1) {
    const s = this.contracts.get(this.key(o, r));
    if (!s) throw new F("CONTRACT_UNKNOWN", o + "@" + r);
    if (s.kind !== i) throw new F("MESSAGE_KIND_MISMATCH", o);
    if (!(n ? s.receivers : s.senders).includes(t)) throw new F("ROUTE_DENIED", t + " " + o);
    return s;
  }
  endpoint(t) {
    if (!Ki.test(t)) throw new F("ACTOR_INVALID", t);
    const i = /* @__PURE__ */ new Set();
    let o = !0;
    const r = () => {
      if (!o) throw new F("ENDPOINT_DISPOSED", t);
    }, n = (a, d, c, l = 1) => {
      r();
      const h = this.contract(t, a, d, l, !0), v = this.key(d, l);
      if (a === "event") {
        let u = this.listeners.get(v);
        u || (u = /* @__PURE__ */ new Map(), this.listeners.set(v, u));
        let g = u.get(t);
        g || (g = /* @__PURE__ */ new Set(), u.set(t, g)), g.add(c);
        const _ = () => {
          g.delete(c), g.size || u.delete(t);
        };
        return i.add(_), () => {
          _(), i.delete(_);
        };
      }
      if (this.handlers.has(v)) throw new F("ROUTE_HANDLER_EXISTS", v);
      if (h.receivers[0] !== t) throw new F("ROUTE_DENIED", t);
      this.handlers.set(v, { owner: t, handler: c });
      const p = () => {
        this.handlers.get(v)?.handler === c && this.handlers.delete(v);
      };
      return i.add(p), () => {
        p(), i.delete(p);
      };
    }, s = async (a, d, c, l) => {
      r();
      const h = this.contract(t, a, d, l), v = tt(c);
      Ve(v, h.payload);
      const p = this.key(d, l), u = this.handlers.get(p);
      if (!u || u.owner !== h.receivers[0]) throw new F("ROUTE_NO_HANDLER", d);
      const g = Object.freeze({ from: t, to: u.owner, name: d, version: l, kind: a, messageId: String(++this.serial) });
      let _;
      try {
        const C = await Promise.race([
          Promise.resolve().then(() => u.handler(v, g)),
          new Promise((y, P) => {
            _ = setTimeout(() => P(new F("ROUTE_TIMEOUT", d)), this.timeoutMs);
          })
        ]), k = tt(C);
        return Ve(k, h.response), k;
      } finally {
        _ && clearTimeout(_);
      }
    };
    return Object.freeze({
      command: (a, d, c = 1) => s("command", a, d, c),
      query: (a, d, c = 1) => s("query", a, d, c),
      publish: async (a, d, c = 1) => {
        r();
        const l = this.contract(t, "event", a, c), h = tt(d);
        Ve(h, l.payload);
        const v = this.key(a, c), p = this.listeners.get(v), u = [];
        for (const _ of l.receivers)
          for (const C of p?.get(_) ?? []) {
            const k = Object.freeze({ from: t, to: _, name: a, version: c, kind: "event", messageId: String(++this.serial) });
            u.push(Promise.resolve().then(() => C(tt(h), k)));
          }
        const g = await Promise.allSettled(u);
        return {
          delivered: g.filter((_) => _.status === "fulfilled").length,
          failed: g.filter((_) => _.status === "rejected").length
        };
      },
      handle: (a, d, c = 1) => {
        const l = this.contracts.get(this.key(a, c))?.kind;
        if (l === "event") throw new F("MESSAGE_KIND_MISMATCH", a);
        return n(l ?? "command", a, d, c);
      },
      subscribe: (a, d, c = 1) => n("event", a, d, c),
      dispose: () => {
        if (o) {
          o = !1;
          for (const a of i) a();
          i.clear();
        }
      }
    });
  }
}
const Ne = "0.1.4", Wt = "laity-wcp-workbench-v" + Ne.replace(/\./g, "-");
function ha(e, t) {
  const i = {
    id: e.id,
    name: e.name,
    version: e.version,
    description: e.description,
    order: e.order,
    presentation: e.presentation === "full" ? "full" : "dock",
    requiredCapabilities: []
  }, o = new Ee(e.id + ":external:view");
  return { manifest: i, token: o, createPlugin: () => ({
    id: e.id,
    provides: o,
    activate: () => {
      let r;
      return {
        async mount(n) {
          r = n, await e.mount?.(n, t);
        },
        unmount() {
          r && (e.unmount?.(r), r.replaceChildren(), r = void 0);
        }
      };
    },
    deactivate: () => {
    }
  }) };
}
class va extends HTMLElement {
  constructor() {
    super(...arguments), this.active = !1, this.externalModules = [], this.messageContracts = [], this.hostChrome = "internal";
  }
  get releaseVersion() {
    return Ne;
  }
  get dirty() {
    return this.hasAttribute("data-unsaved");
  }
  connectedCallback() {
    if (this.active) return;
    this.active = !0, this.hasAttribute("aria-label") || this.setAttribute("aria-label", "WCP 可组合组件工作台");
    const t = this.attachShadow({ mode: "open" }), i = document.createElement("style");
    i.textContent = Ms + `
` + Os + `
:host{display:block;width:100%;height:100%;min-height:320px;--bg:#2f383e;--v3-ui-bg:#1d2732;--v3-ui-panel:#253343;--v3-ui-fg:#e1e7ef;--wcp-surface-bg:#1d2732;--wcp-workspace-padding:4px;--wcp-accent:#83b9f0;--wcp-font-size:14px;background:#1d2732;color:#e1e7ef}#app{height:100%;width:100%;overflow:hidden}#dock-root,#full-root{height:100%}`;
    const o = document.createElement("div");
    if (o.id = "app", o.innerHTML = '<header class="app-header"><div class="brand"><strong>WCP <span class="brand-name">Web 组件平台</span></strong><span class="version">v' + Ne + '</span><span id="platform-state" role="status">正在初始化…</span></div></header><div class="v3-top-row"><plugin-menu></plugin-menu><div class="top-actions"><span class="env-label">共享平台 · 独立组件</span><button id="swap-plugin" type="button" hidden>替换当前插件</button></div></div><main class="workspace"><section id="full-root" class="full-root" hidden></section><section id="dock-root"></section></main>', t.append(i, o), this.hostChrome === "external") {
      const b = document.createElement("style");
      b.textContent = "#app{padding:0;gap:0}.app-header,.v3-top-row{display:none!important}.workspace{padding:0}", t.append(b);
    }
    const r = /* @__PURE__ */ new WeakSet(), n = () => {
      for (const b of document.head.querySelectorAll("style"))
        r.has(b) || !b.textContent?.includes("laity-settings-panel") || (r.add(b), t.prepend(b.cloneNode(!0)));
    }, s = new MutationObserver(n);
    s.observe(document.head, { childList: !0 }), n();
    const a = (b) => {
      const m = t.querySelector(b);
      if (!m) throw Error("WCP embedded host missing " + b);
      return m;
    }, d = a("#platform-state"), c = a("#dock-root"), l = a("#full-root"), h = a("plugin-menu"), v = a("#swap-plugin"), p = /* @__PURE__ */ new Map();
    class u {
      constructor(m) {
        this.name = m, this.element = document.createElement("section"), this.element.className = m === "inspector" ? "panel-inspector panel-content" : "panel-content", p.set(m, this.element);
      }
      init() {
      }
      dispose() {
        p.delete(this.name);
      }
    }
    const g = zs(c, { createComponent: (b) => new u(b.name) });
    g.addPanel({ id: "module", component: "module", title: "组件工作区" }), g.addPanel({ id: "contract", component: "inspector", title: "插件契约", position: { referencePanel: "module", direction: "right" } });
    const _ = new ResizeObserver(() => g.layout(c.clientWidth, c.clientHeight));
    _.observe(c), g.layout(c.clientWidth, c.clientHeight);
    const C = new aa(new sa(
      /* @__PURE__ */ new Set(["demo:media:read", "demo:providers:read", "shared:settings:load"]),
      (b) => d.textContent = b
    )), k = /* @__PURE__ */ new Map(), y = new ca(this.messageContracts), P = [], M = [];
    let E = !1;
    function w(b) {
      const m = p.get("inspector");
      if (!m) return;
      const S = document.createElement("h3");
      S.textContent = b.name + " · " + b.version;
      const G = document.createElement("p");
      G.textContent = b.description, m.replaceChildren(S, G);
    }
    function x() {
      const b = C.activeId, m = b ? k.get(b) : void 0, S = b ? C.getBundle(b) : void 0;
      v.hidden = !m?.replacement && m === S, v.disabled = !m?.replacement && m === S, v.textContent = m === S ? "替换当前插件" : "恢复原版";
    }
    async function f(b) {
      if (!E) {
        E = !0;
        try {
          const m = C.list().find((A) => A.id === b);
          if (!m) throw Error("未注册组件");
          const S = m.presentation === "full";
          c.hidden = S, l.hidden = !S, S || g.layout(c.clientWidth, c.clientHeight);
          const G = S ? l : p.get("module");
          if (!G) throw Error("无组件容器");
          await C.activate(b, G), h.active = b, w(m), x(), d.textContent = "已加载 " + m.name;
        } catch (m) {
          d.textContent = "插件加载失败：" + String(m);
        } finally {
          E = !1;
        }
      }
    }
    h.addEventListener("plugin-select", (b) => {
      f(b.detail.id);
    }), v.addEventListener("click", () => {
      (async () => {
        const b = C.activeId, m = b ? k.get(b) : void 0, S = b ? C.getBundle(b) : void 0, G = p.get("module");
        if (!(!m || !S || !G || E)) {
          E = !0;
          try {
            const A = m === S ? await m.replacement?.() : m;
            if (!A) return;
            await C.replace(A, G), h.plugins = C.list(), h.active = b, x(), w(A.manifest);
          } catch (A) {
            d.textContent = "替换失败：" + String(A);
          } finally {
            E = !1;
          }
        }
      })();
    }), t.addEventListener("laity-settings-change", (b) => {
      const m = b.detail?.reason;
      m && /^(grid|source|reset|preview|history|undo|redo|format)$/.test(m) && this.setAttribute("data-unsaved", "");
    }), t.addEventListener("laity-settings-saved", () => this.removeAttribute("data-unsaved")), this.cleanup = () => {
      for (const b of M) b();
      for (const b of P) b.dispose();
      s.disconnect(), _.disconnect(), C.disable(), g.dispose(), t.replaceChildren(), this.active = !1;
    }, (async () => {
      const b = /* @__PURE__ */ Object.assign({ "./plugins/media/index.ts": () => Promise.resolve().then(() => pa), "./plugins/providers/index.ts": () => Promise.resolve().then(() => ga), "./plugins/settings/index.ts": () => Promise.resolve().then(() => ma) });
      for (const [m, S] of Object.entries(b).sort(([G], [A]) => G.localeCompare(A))) {
        const G = (await S()).default;
        if (!this.isConnected) return;
        (!this.allowedBuiltinPlugins || this.allowedBuiltinPlugins.includes(G.manifest.id)) && (C.install(G), k.set(G.manifest.id, G));
      }
      for (const m of this.externalModules) {
        if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(m.id) || !/^\d+\.\d+\.\d+$/.test(m.version) || m.presentation !== "service" && typeof m.mount != "function")
          throw Error("WCP_EXTERNAL_MODULE_INVALID " + m.id);
        const S = y.endpoint(m.id);
        if (P.push(S), m.setup) {
          const G = m.setup(S);
          typeof G == "function" && M.push(G);
        }
        if (m.presentation !== "service") {
          const G = ha(m, S);
          C.install(G), k.set(m.id, G);
        }
      }
      h.plugins = C.list(), await f(this.initialModuleId ?? this.externalModules.find((m) => m.presentation !== "service")?.id ?? C.list()[0]?.id ?? ""), this.dispatchEvent(new CustomEvent("wcp-ready", { bubbles: !0, composed: !0, detail: { version: Ne } }));
    })().catch((b) => {
      d.textContent = "组件错误：" + String(b), this.dispatchEvent(new CustomEvent("wcp-error", { bubbles: !0, composed: !0, detail: { message: String(b) } }));
    });
  }
  disconnectedCallback() {
    this.cleanup?.(), this.cleanup = void 0;
  }
}
customElements.get(Wt) || customElements.define(Wt, va);
const ya = Ne, Da = Wt, pt = class pt extends xe {
  constructor() {
    super(...arguments), this.rows = [], this.variant = "original";
  }
  render() {
    return we`<article>
    <h2>${this.variant === "alternate" ? "媒体组件 · 替换实现" : "媒体组件 · 原始实现"}</h2>
    <p>独立 Lit 组件。通过授权服务接口获取模拟数据，不访问真实书籍或文件系统。</p>
    ${this.variant === "alternate" ? we`<div class="alt">模块已热替换：相同插件 ID，更新组件版本与展示方式。</div>` : null}
    <table><thead><tr><th>资源</th><th>文件</th><th>状态</th></tr></thead>
    <tbody>${this.rows.map((t) => we`<tr><td>${t.name}</td><td>${t.detail}</td><td><mark>${t.state}</mark></td></tr>`)}</tbody></table>
    <p>新增模块无需编辑 Shell；独立模块通过 Manifest 声明入口与授权。</p>
  </article>`;
  }
};
pt.properties = { rows: { attribute: !1 }, variant: { type: String } }, pt.styles = ti`
    :host{display:block;height:100%;overflow:auto;color:var(--ink,#e7edf5)}
    article{padding:20px;max-width:850px;margin:auto}
    h2{font-size:19px;margin:0 0 8px}p{color:#a4b3c7;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:12px 10px;text-align:left;border-bottom:1px solid #334054;font-size:13px}
    th{color:#b1becf}mark{background:#283f42;color:#9be5c2;border-radius:6px;padding:4px 8px}
    button{background:#294c68;border:1px solid #436787;border-radius:7px;padding:8px 11px;color:white;cursor:pointer}
    .alt{border-left:4px solid #95baff;padding:12px;background:#1d2a43}
  `;
let je = pt;
customElements.get("demo-media-panel") || customElements.define("demo-media-panel", je);
const nt = {
  id: "demo:media",
  name: "OCR 媒体审阅",
  version: "1.0.0",
  description: "示例媒体审阅插件；不连接 OCR2MD 正式服务",
  requiredCapabilities: ["demo:media:read"]
}, Ji = new Ee("demo:media:component"), Qi = {
  manifest: nt,
  token: Ji,
  replacement: () => Promise.resolve().then(() => _a).then((e) => e.default),
  createPlugin: (e) => ({
    id: nt.id,
    provides: Ji,
    requires: [e],
    activate: (t, i) => {
      const o = i.forPlugin(nt);
      let r;
      return {
        mount(n) {
          r = new je(), r.rows = [...o.readDemo("demo:media:read")], n.replaceChildren(r), o.notify("媒体插件已加载");
        },
        unmount() {
          r?.remove(), r = void 0;
        }
      };
    },
    deactivate: async () => {
    }
  })
}, pa = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  bundle: Qi,
  default: Qi,
  manifest: nt
}, Symbol.toStringTag, { value: "Module" })), ut = class ut extends xe {
  constructor() {
    super(...arguments), this.rows = [];
  }
  render() {
    return we`<article><h2>服务状态组件</h2>
    <p>不同业务领域的独立插件；只使用模拟服务数据，不接触 WAH 或真实 Provider。</p>
    <section>${this.rows.map((t) => we`<div class="provider"><strong>${t.name}</strong>
      <small>${t.detail}</small><output>${t.state}</output></div>`)}</section>
  </article>`;
  }
};
ut.properties = { rows: { attribute: !1 } }, ut.styles = ti`
    :host{display:block;height:100%;overflow:auto;color:var(--ink,#e7edf5)}
    article{padding:20px;max-width:800px;margin:auto}h2{font-size:19px;margin:0 0 6px}
    p{color:#a4b3c7;font-size:13px}
    section{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px;margin-top:18px}
    .provider{background:#1f2c3f;border:1px solid #364965;border-radius:11px;padding:16px}
    strong{display:block;margin-bottom:8px}small{color:#a7b9cf}
    output{color:#a2e0b8;display:block;margin-top:14px}
  `;
let ht = ut;
customElements.get("demo-provider-panel") || customElements.define("demo-provider-panel", ht);
const Dt = {
  id: "demo:providers",
  name: "服务状态",
  version: "1.0.0",
  description: "跨业务域服务状态示例（完全模拟）",
  requiredCapabilities: ["demo:providers:read"]
}, eo = new Ee("demo:providers:component"), ua = {
  manifest: Dt,
  token: eo,
  createPlugin: (e) => ({
    id: Dt.id,
    provides: eo,
    requires: [e],
    activate: (t, i) => {
      const o = i.forPlugin(Dt);
      let r;
      return {
        mount(n) {
          r = new ht(), r.rows = [...o.readDemo("demo:providers:read")], n.replaceChildren(r), o.notify("服务状态插件已激活");
        },
        unmount() {
          r?.remove(), r = void 0;
        }
      };
    },
    deactivate: () => {
    }
  })
}, ga = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: ua
}, Symbol.toStringTag, { value: "Module" })), kt = {
  id: "platform:settings",
  name: "设置",
  version: "1.0.0",
  order: 0,
  presentation: "full",
  description: "网络设施 · Shared App Settings Framework；WCP 仅提供 Schema、宿主主题与插件适配器。",
  requiredCapabilities: ["shared:settings:load"]
}, to = new Ee("platform:settings:view"), ba = {
  manifest: kt,
  token: to,
  createPlugin: (e) => ({
    id: kt.id,
    provides: to,
    requires: [e],
    activate: (t, i) => {
      const o = i.forPlugin(kt);
      let r = !1, n;
      return {
        mount(s) {
          r = !1, n = document.createElement("div"), n.className = "wcp-settings-host";
          const a = document.createElement("div");
          a.className = "settings-load-status", a.setAttribute("role", "status"), n.append(a), s.replaceChildren(n);
          const d = n;
          async function c() {
            a.textContent = "正在加载网络设施发布的通用设置组件…";
            try {
              const { version: l } = await o.loadSharedSettings();
              if (r || !n?.isConnected) return;
              const h = document.createElement("laity-settings-panel");
              h.id = "wcp-shared-settings";
              const v = s.getRootNode(), p = v instanceof ShadowRoot ? v.host : null;
              h.setAttribute("app-id", p?.getAttribute("app-id") || "wcp-debug"), h.setAttribute("title", "WCP 通用设置"), h.setAttribute("layout", "horizontal"), h.setAttribute("source-editor", "codemirror"), h.setAttribute("source-comments", "true"), h.setAttribute("schema-url", p?.getAttribute("settings-schema-url") || "/settings.schema.json"), h.setAttribute("storage", "local"), h.setAttribute("commit-mode", "explicit"), h.setAttribute("data-testid", "shared-settings-panel"), h.style.setProperty("--las-panel-bg", "#1d2732"), h.style.setProperty("--las-control-bg", "#253343"), h.style.setProperty("--las-border", "#475258"), h.style.setProperty("--las-fg", "#e1e7ef"), h.style.setProperty("--las-muted", "#aebdd2"), h.style.setProperty("--las-soft", "#c6d5e7"), h.style.setProperty("--las-accent", "#83b9f0"), d.replaceChildren(h), d.dataset.sharedVersion = l, o.notify("通用设置 v" + l + " 已装载");
            } catch (l) {
              if (r || !n?.isConnected) return;
              a.textContent = "加载失败：" + String(l) + "。";
              const h = document.createElement("button");
              h.textContent = "重试加载", h.type = "button", h.addEventListener("click", () => {
                h.remove(), c();
              }, { once: !0 }), d.replaceChildren(a, h), o.notify("共享设置加载失败");
            }
          }
          c();
        },
        unmount() {
          r = !0, n?.remove(), n = void 0;
        }
      };
    },
    deactivate: () => {
    }
  })
}, ma = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: ba
}, Symbol.toStringTag, { value: "Module" })), Ct = {
  id: "demo:media",
  name: "OCR 媒体审阅（替换版）",
  version: "1.1.0",
  description: "同一插件 ID 的完整替代实现；模拟数据，不动 OCR2MD",
  requiredCapabilities: ["demo:media:read"]
}, io = new Ee("demo:media:replacement"), fa = {
  manifest: Ct,
  token: io,
  createPlugin: (e) => ({
    id: Ct.id,
    provides: io,
    requires: [e],
    activate: (t, i) => {
      const o = i.forPlugin(Ct);
      let r;
      return {
        mount(n) {
          r = new je(), r.variant = "alternate", r.rows = [...o.readDemo("demo:media:read")], n.replaceChildren(r), o.notify("媒体替换版已激活");
        },
        unmount() {
          r?.remove(), r = void 0;
        }
      };
    },
    deactivate: () => {
    }
  })
}, _a = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: fa
}, Symbol.toStringTag, { value: "Module" }));
export {
  Da as elementTag,
  ya as version
};
