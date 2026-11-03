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
const TEMPLATES = ["phieu_32_6_12_v2", "phieu_40_8_6", "phieu_40_8_6_gt", "phieu_bgd_2025"];

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

  /** Tải lõi (omr.js + omr.wasm ~4 MB) + 2 mẫu phiếu qua trang rồi khởi động Worker – chỉ 1 lần. */
  init() {
    this.initP ??= (async () => {
      const [glue, worker, wasm, ...tpls] = await Promise.all([
        get("omr.js", "text"), get("omr-worker.js", "text"), get("omr.wasm", "buf"),
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

  /** Chấm file ảnh (JPG/PNG, tự xoay theo EXIF). */
  async readFile(bytes: ArrayBuffer, maxSide = 2600): Promise<ReadResult> {
    await this.init();
    return this.call("read", { file: bytes, maxSide }, [bytes]);
  }

  /** Chấm khung hình RGBA lấy từ canvas. */
  async readRgba(img: ImageData, maxSide = 2600): Promise<ReadResult> {
    await this.init();
    const buf = img.data.buffer as ArrayBuffer;
    return this.call("read", { rgba: buf, w: img.width, h: img.height, maxSide }, [buf]);
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
