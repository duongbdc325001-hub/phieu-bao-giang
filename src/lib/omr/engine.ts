"use client";
// Gọi lõi chấm C++ (WebAssembly) chạy trong Web Worker. Chỉ dùng phía trình duyệt.

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReadResult { json: any; warped: Uint8Array | null }
export interface DetectResult {
  found: boolean;
  corners?: [number, number][]; // TL,TR,BR,BL tỉ lệ 0..1
  template_id?: string; sharp?: number; markers?: number; markers_total?: number;
}

const BASE = "/omr/";
// Mẫu phiếu tự nhận khi chấm. Thêm mẫu: đặt file *_toado.json vào public/omr/templates/ rồi thêm tên vào đây (và sw.js).
export const TEMPLATES = ["phieu_32_6_12_v2", "phieu_40_8_6", "phieu_40_8_6_gt", "phieu_toan_12_4_6", "phieu_50_10_12"];
/** Mã mẫu (trường "template" trong *_toado.json, lõi trả về ở template_id) và tên hiển thị – dùng cho ô "Mẫu phiếu". */
export const TEMPLATE_INFO: { id: string; name: string }[] = [
  { id: "PTN-40-8-6-GT", name: "Phiếu 40 câu Cục QLCL (40-8-6, có ô giám thị)" },
  { id: "THPT-TOAN-12-4-6", name: "Phiếu Toán 12-4-6 (không phách)" },
  { id: "TT-PHIEU-50-10-12", name: "Phiếu 50-10-12" },
  { id: "TNTL-40-8-6", name: "Phiếu TNTL 40-8-6" },
  { id: "TNTL-32-6-12-v2", name: "Phiếu TNTL 32-6-12 v2" },
];

/** Trình duyệt có WebAssembly SIMD (Chrome 91+, Safari 16.4+) -> dùng lõi omr-simd.wasm (nhanh ~2 lần), không thì omr.wasm. */
export const hasWasmSimd = (() => {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
})();
const WASM = hasWasmSimd ? "omr-simd.wasm" : "omr.wasm";

async function get(path: string, kind: "text"): Promise<string>;
async function get(path: string, kind: "buf"): Promise<ArrayBuffer>;
async function get(path: string, kind: "text" | "buf") {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Không tải được ${path} (${r.status})`);
  return kind === "text" ? r.text() : r.arrayBuffer();
}

class OmrEngine {
  private w: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  private initP: Promise<{ version: number; templates: string[] }> | null = null;

  private call<T>(type: string, payload: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
    if (!this.w) throw new Error("Lõi chấm chưa khởi động");
    const id = ++this.seq;
    return new Promise<T>((res, rej) => {
      this.pending.set(id, { res, rej });
      this.w!.postMessage({ id, type, ...payload }, transfer);
    });
  }

  /** Tải lõi (omr.js + omr-simd.wasm ~5,5 MB hoặc omr.wasm ~4,3 MB) + mẫu phiếu qua trang rồi khởi động Worker – chỉ 1 lần. */
  init() {
    this.initP ??= (async () => {
      const [glue, worker, wasm, ...tpls] = await Promise.all([
        get("omr.js", "text"), get("omr-worker.js", "text"), get(WASM, "buf"),
        ...TEMPLATES.map((t) => get(`templates/${t}_toado.json`, "text")),
      ]);
      const url = URL.createObjectURL(new Blob([glue, "\n;\n", worker], { type: "text/javascript" }));
      this.w = new Worker(url);
      this.w.onmessage = (e) => {
        const { id, ok, result, error } = e.data;
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (ok) p.res(result); else p.rej(new Error(error));
      };
      this.w.onerror = (e) => {
        for (const p of this.pending.values()) p.rej(new Error(e.message || "Lõi chấm bị lỗi"));
        this.pending.clear();
      };
      return this.call<{ version: number; templates: string[] }>("init", {
        base: new URL(BASE, location.href).href, wasm,
        templates: TEMPLATES.map((t, i) => ({ id: t, json: tpls[i] })),
      }, [wasm as ArrayBuffer]);
    })();
    this.initP.catch(() => { this.initP = null; }); // lỗi mạng: lần sau thử lại
    return this.initP;
  }

  /** Tắt Worker, trả bộ nhớ (~330 MB) cho máy. Gọi lại init() sẽ khởi động lại. */
  close() {
    this.w?.terminate();
    this.w = null;
    this.initP = null;
    for (const p of this.pending.values()) p.rej(new Error("Lõi chấm đã tắt"));
    this.pending.clear();
  }

  /** Chấm file ảnh (JPG/PNG, tự xoay theo EXIF). templateId: chỉ đọc theo mẫu này (khoá mẫu). */
  async readFile(bytes: ArrayBuffer, maxSide = 2600, templateId?: string | null): Promise<ReadResult> {
    await this.init();
    return this.call("read", { file: bytes, maxSide, templateId: templateId || undefined }, [bytes]);
  }

  /** Chấm khung hình RGBA lấy từ canvas. */
  async readRgba(img: ImageData, maxSide = 2600, templateId?: string | null): Promise<ReadResult> {
    await this.init();
    const buf = img.data.buffer as ArrayBuffer;
    return this.call("read", { rgba: buf, w: img.width, h: img.height, maxSide, templateId: templateId || undefined }, [buf]);
  }

  async detect(img: ImageData): Promise<DetectResult> {
    await this.init();
    const buf = img.data.buffer as ArrayBuffer;
    return this.call("detect", { rgba: buf, w: img.width, h: img.height, maxSide: 900 }, [buf]);
  }

  async annotate(jpg: Uint8Array, spec: string): Promise<Uint8Array | null> {
    await this.init();
    const copy = jpg.slice();
    return this.call("annotate", { jpg: copy.buffer, spec }, [copy.buffer]);
  }

  async qrFromRgba(img: ImageData): Promise<string | null> {
    await this.init();
    const buf = img.data.buffer as ArrayBuffer;
    return this.call("qr", { rgba: buf, w: img.width, h: img.height }, [buf]);
  }

  async qrFromFile(bytes: ArrayBuffer): Promise<string | null> {
    await this.init();
    return this.call("qr", { file: bytes }, [bytes]);
  }
}

let inst: OmrEngine | null = null;
let live: OmrEngine | null = null;
/** Lõi dùng để chấm phiếu (mỗi phiếu vài giây). */
export const omr = () => (inst ??= new OmrEngine());
/** Lõi riêng cho camera (dò phiếu / QR mỗi khung hình): không phải xếp hàng chờ phiếu đang chấm. */
export const omrLive = () => (live ??= new OmrEngine());

/** Số luồng chấm song song. Mỗi luồng giữ ~330 MB bộ nhớ, nên chỉ chạy 2 luồng khi Chrome báo máy có
 *  từ 8 GB RAM (navigator.deviceMemory làm tròn theo luỹ thừa 2: máy 6-8 GB thường báo 8) và từ 6 nhân CPU.
 *  Máy 4 GB, iPhone/Safari (không báo RAM) giữ 1 luồng như cũ. */
export function readerCount(): number {
  if (typeof navigator === "undefined") return 1;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cpu = navigator.hardwareConcurrency || 1;
  return mem != null && mem >= 8 && cpu >= 6 ? 2 : 1;
}
const extra: OmrEngine[] = [];
const idleT: (ReturnType<typeof setTimeout> | undefined)[] = [];
/** Lõi chấm của luồng i (0 = lõi chính omr()). Luồng phụ chỉ khởi động khi có từ 2 phiếu chờ. */
export function omrReader(i: number): OmrEngine {
  if (i === 0) return omr();
  clearTimeout(idleT[i]);
  return (extra[i] ??= new OmrEngine());
}
/** Luồng phụ rảnh 60 giây thì tắt để trả bộ nhớ. */
export function idleReader(i: number) {
  if (i === 0 || !extra[i]) return;
  clearTimeout(idleT[i]);
  idleT[i] = setTimeout(() => extra[i]?.close(), 60_000);
}
