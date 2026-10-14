// node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// ui-spikes/v3-directory/src/browserCryptoShim.ts
function createHash(algorithm) {
  if (algorithm !== "sha256") throw Error("Only SHA-256 row IDs are supported in the browser");
  const chunks = [];
  const hash = {
    update(input) {
      chunks.push(typeof input === "string" ? new TextEncoder().encode(input) : input);
      return hash;
    },
    digest(encoding) {
      if (encoding !== "hex") throw Error("Expected hex digest");
      const size = chunks.reduce((sum, c) => sum + c.length, 0);
      const payload = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        payload.set(c, offset);
        offset += c.length;
      }
      return bytesToHex(sha256(payload));
    }
  };
  return hash;
}

// src/chapterElementCatalog.ts
var image = /!\[(?:[^\]\\]|\\.)*\]\(\s*(?:<([^>]+)>|([^\s)]+))[^\n)]*\)|!\[\[([^\]\n]+)\]\]|<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
function clip(s) {
  return s.replace(/\s+/g, " ").slice(0, 145);
}
function scanChapterElements(md, sourcePath, module) {
  const text = md.replace(/\r\n?/g, "\n"), lines = text.split("\n"), starts = [];
  for (let i = 0, pos = 0; i < lines.length; i++) {
    starts.push(pos);
    pos += lines[i].length + 1;
  }
  const occupied = [], items = [];
  const record = (from, to, kind, url) => {
    if (from < 0 || to <= from || occupied.some(([a, b]) => from < b && to > a) && kind !== "\u8868\u683C\u5185\u516C\u5F0F") return;
    items.push({ from, to, kind, value: text.slice(from, to), url });
  };
  const within = (pos) => occupied.some(([a, b]) => pos >= a && pos < b);
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})([a-z]*)\s*$/i.exec(lines[i]);
    if (!m) continue;
    let end = i + 1;
    const close = new RegExp(`^ {0,3}${m[1][0]}{${m[1].length},}[ \\t]*$`);
    for (; end < lines.length && !close.test(lines[end]); end++) {
    }
    if (end >= lines.length) continue;
    const content = lines.slice(i + 1, end).join("\n");
    const from = starts[i], to = starts[end] + lines[end].length;
    occupied.push([from, to]);
    if (module === "LaTeX" && /^(math|latex|tex)$/i.test(m[2])) items.push({ from, to, kind: "\u72EC\u7ACB\u516C\u5F0F", value: content });
    if (module === "\u8868\u683C" && m[2].toLowerCase() === "html" && /^\s*<table\b[\s\S]*<\/table>\s*$/i.test(content))
      items.push({ from, to, kind: "HTML \u8868\u683C", value: content });
    i = end;
  }
  if (module === "\u5A92\u4F53") {
    for (const m of text.matchAll(image)) {
      if (within(m.index)) continue;
      const url = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
      record(m.index, m.index + m[0].length, "\u56FE\u7247", url);
    }
    for (const m of text.matchAll(/\[(?:图片|图表|表格图片)(?:来源|图片来源)?[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/g))
      if (!within(m.index)) record(m.index, m.index + m[0].length, "\u56FE\u7247\u6765\u6E90", m[1]);
  } else if (module === "\u8868\u683C") {
    for (const m of text.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi))
      if (!within(m.index)) record(m.index, m.index + m[0].length, "HTML \u8868\u683C");
  } else {
    const math = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\n\\])+?(?<!\\)\$/g;
    for (const m of text.matchAll(math)) if (!within(m.index))
      record(m.index, m.index + m[0].length, m[0].startsWith("$$") || m[0].startsWith("\\[") ? "\u72EC\u7ACB\u516C\u5F0F" : "\u884C\u5185\u516C\u5F0F");
    for (const m of text.matchAll(/<eq(?:\s[^>]*)?>([\s\S]*?)<\/eq>/gi))
      record(m.index, m.index + m[0].length, "\u8868\u683C\u5185\u516C\u5F0F");
    for (const m of text.matchAll(/<code class="ocr2md-latex-pending">([\s\S]*?)<\/code>/gi))
      record(m.index, m.index + m[0].length, "\u8868\u683C\u5185\u516C\u5F0F\uFF08\u5F85\u6E05\u6D17\uFF09");
    for (let i = 0; i < lines.length; i++) {
      if (!/\\(?:frac|dfrac|tfrac|mathsf|sum|int|sqrt|begin)\b/.test(lines[i])) continue;
      if (within(starts[i]) || items.some((x) => x.from < starts[i] + lines[i].length && x.to > starts[i])) continue;
      record(starts[i], starts[i] + lines[i].length, "\u7591\u4F3C\u7F3A\u5931\u6570\u5B66\u5B9A\u754C");
    }
  }
  items.sort((a, b) => a.from - b.from);
  const physicalLine = (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      if (starts[mid] <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, hi);
  };
  const markers = [...text.matchAll(/<!--\s*ocr2md-ir:block=(blk_[a-f0-9]{24})\s*-->/g)].map((m) => ({ offset: m.index, id: m[1] }));
  return items.map((x, i) => {
    const first = physicalLine(x.from), last = physicalLine(Math.max(x.from, x.to - 1));
    const parent = markers.filter((m) => m.offset <= x.from).at(-1)?.id;
    const id = createHash("sha256").update(`${x.from}\0${x.value}`).digest("hex").slice(0, 16);
    const local = !!x.url && /^(?:\.\/)?(?:imgs\/|\.\.\/imgs\/|[^:]+\.(?:png|jpe?g|gif|webp)$)/i.test(x.url);
    return {
      id: `clean-${module}-${i}-${id}`,
      kind: "regex",
      rowId: `clean-${module}-${i}-${id}`,
      label: `${x.kind} \xB7 ${clip(x.value)}`,
      raw: x.value,
      preview: clip(x.value),
      sourcePath,
      sourceLabel: sourcePath.split("/").at(-1),
      typeLabel: module === "\u5A92\u4F53" ? "\u5A92\u4F53" : "\u6587\u672C\u5757",
      lineType: x.kind,
      range: {
        line: first,
        start: x.from - starts[first],
        ...last > first ? { endLine: last } : {},
        end: x.to - starts[last]
      },
      ...module === "\u5A92\u4F53" && x.url ? {
        mediaGroup: local ? "\u5DF2\u91C7\u7528" : "\u672A\u4E0B\u8F7D",
        mediaSourceUrl: !local ? x.url : void 0,
        localPath: local ? x.url : void 0,
        mediaPath: x.url
      } : {},
      ...parent ? { parentBlockId: parent } : {},
      status: "\u5019\u9009"
    };
  });
}
export {
  scanChapterElements
};
