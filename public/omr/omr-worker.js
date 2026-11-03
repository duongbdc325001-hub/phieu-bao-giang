/* Web Worker chạy lõi chấm C++ (omr.wasm) – không làm đứng giao diện.
   Giao tiếp: postMessage({id, type, ...}) -> {id, ok, result | error}. */
/* global createOmr */
// Bình thường trang ghép omr.js + file này thành 1 Worker (blob) và gửi sẵn omr.wasm + mẫu phiếu,
// nên mọi thứ tải qua trang (dùng được cache khi mất mạng). Chạy riêng file này thì tự nạp omr.js.
if (typeof createOmr === "undefined") self.importScripts("./omr.js");
let M = null;
let ready = null;
let info = null;

function cstr(s) {
  const n = M.lengthBytesUTF8(s) + 1;
  const p = M._malloc(n);
  M.stringToUTF8(s, p, n);
  return p;
}
function copyIn(u8) {
  const p = M._malloc(Math.max(1, u8.length));
  M.HEAPU8.set(u8, p);
  return p;
}
function takeStr(p) {
  if (!p) return "";
  const s = M.UTF8ToString(p);
  M._omr_free(p);
  return s;
}
function takeBytes(pp, pl) {
  const ptr = M.HEAP32[pp >> 2], len = M.HEAP32[pl >> 2];
  if (!ptr || len <= 0) return null;
  const out = M.HEAPU8.slice(ptr, ptr + len);
  M._omr_free(ptr);
  return out;
}

/** wasm: ArrayBuffer của omr.wasm ; templates: [{id, json}] nội dung *_toado.json */
async function init(msg) {
  M = await createOmr({ wasmBinary: msg.wasm, locateFile: (f) => msg.base + f });
  const names = [];
  for (const { id: t, json: js } of msg.templates) {
    const p = cstr(js);
    const n = M._omr_add_template(p, 0, 0);
    M._free(p);
    if (n < 0) throw new Error("Không nạp được mẫu " + t);
    const m = /"name"\s*:\s*"([^"]+)"/.exec(js);
    names.push(m ? m[1] : t);
  }
  info = { version: M._omr_version(), templates: names };
  return info;
}

/** Đọc phiếu: rgba (Uint8ClampedArray/ArrayBuffer) + w,h  hoặc  file (bytes JPG/PNG). */
function read(msg) {
  const pp = M._malloc(8), pl = pp + 4;
  M.HEAP32[pp >> 2] = 0; M.HEAP32[pl >> 2] = 0;
  const tid = msg.templateId ? cstr(msg.templateId) : 0;
  let res, data;
  try {
    if (msg.file) {
      const u8 = new Uint8Array(msg.file);
      data = copyIn(u8);
      res = M._omr_read2(data, u8.length, tid, msg.maxSide || 2600, pp, pl);
    } else {
      const u8 = new Uint8Array(msg.rgba);
      data = copyIn(u8);
      res = M._omrw_read_rgba(data, msg.w, msg.h, tid, msg.maxSide || 2600, pp, pl);
    }
    const json = JSON.parse(takeStr(res));
    const warped = takeBytes(pp, pl);
    return { json, warped };
  } finally {
    M._free(data); M._free(pp); if (tid) M._free(tid);
  }
}

function detect(msg) {
  const u8 = new Uint8Array(msg.rgba);
  const p = copyIn(u8);
  try { return JSON.parse(takeStr(M._omrw_detect_rgba(p, msg.w, msg.h, msg.maxSide || 900))); }
  finally { M._free(p); }
}

function annotate(msg) {
  const u8 = new Uint8Array(msg.jpg);
  const p = copyIn(u8), s = cstr(msg.spec), pl = M._malloc(4);
  M.HEAP32[pl >> 2] = 0;
  try {
    const out = M._omr_annotate(p, u8.length, s, pl);
    const len = M.HEAP32[pl >> 2];
    if (!out || len <= 0) return null;
    const r = M.HEAPU8.slice(out, out + len);
    M._omr_free(out);
    return r;
  } finally { M._free(p); M._free(s); M._free(pl); }
}

function qr(msg) {
  let p, res;
  if (msg.file) {
    const u8 = new Uint8Array(msg.file);
    p = copyIn(u8);
    res = M._omr_qr_decode_image(p, u8.length);
  } else {
    const u8 = new Uint8Array(msg.rgba);
    p = copyIn(u8);
    res = M._omrw_qr_rgba(p, msg.w, msg.h);
  }
  try { const j = JSON.parse(takeStr(res)); return j.found ? j.text : null; }
  finally { M._free(p); }
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      ready ??= init(msg);
      self.postMessage({ id: msg.id, ok: true, result: await ready });
      return;
    }
    await ready;
    let result, transfer = [];
    if (msg.type === "read") { result = read(msg); if (result.warped) transfer = [result.warped.buffer]; }
    else if (msg.type === "detect") result = detect(msg);
    else if (msg.type === "annotate") { result = annotate(msg); if (result) transfer = [result.buffer]; }
    else if (msg.type === "qr") result = qr(msg);
    else throw new Error("Lệnh lạ: " + msg.type);
    self.postMessage({ id: msg.id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });
  }
};
