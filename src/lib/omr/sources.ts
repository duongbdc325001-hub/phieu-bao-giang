"use client";
// Biến file người dùng chọn thành danh sách "phiếu" để chấm.
// - Ảnh (JPG, PNG, WebP, HEIC trên iPhone…): trình duyệt tự giải mã (đúng hướng xoay EXIF), thu nhỏ còn cạnh dài 2600 px.
// - PDF scan nhiều trang: mỗi trang 1 phiếu (pdf.js).
// - TIFF nhiều trang (máy scan hay lưu kiểu này): mỗi trang 1 phiếu (UTIF).
// Mỗi phiếu chỉ được giải mã khi tới lượt chấm, để file scan hàng chục trang không làm tràn bộ nhớ điện thoại.

export const MAX_SIDE = 2600;
export type Loaded = { img: ImageData } | { file: ArrayBuffer };
export interface Source { name: string; load: () => Promise<Loaded> }

/** Các đuôi file nhận được (dùng cho thuộc tính accept của ô chọn file). */
export const ACCEPT = "image/*,application/pdf,.pdf,.tif,.tiff,.heic,.heif";

function toImageData(src: CanvasImageSource, w: number, h: number): ImageData {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

const ext = (f: File) => (f.name.split(".").pop() ?? "").toLowerCase();
const isPdf = (f: File) => f.type === "application/pdf" || ext(f) === "pdf";
const isTiff = (f: File) => /tiff?/.test(f.type) || ext(f) === "tif" || ext(f) === "tiff";
const stem = (f: File) => f.name.replace(/\.[^.]+$/, "");

/** Ảnh thường: trình duyệt giải mã; trình duyệt không đọc được thì để lõi C++ thử (JPG/PNG/BMP). */
function imageSource(f: File): Source {
  return {
    name: f.name,
    load: async () => {
      try {
        const bmp = await createImageBitmap(f);
        try { return { img: toImageData(bmp, bmp.width, bmp.height) }; } finally { bmp.close(); }
      } catch {
        return { file: await f.arrayBuffer() };
      }
    },
  };
}

async function pdfSources(f: File): Promise<Source[]> {
  // bản "legacy" chạy được cả Safari cũ; worker phục vụ sẵn ở /omr/
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = "/omr/pdf.worker.min.js";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const n = doc.numPages;
  return Array.from({ length: n }, (_, i) => ({
    name: n > 1 ? `${stem(f)} (trang ${i + 1}).pdf` : f.name,
    load: async () => {
      const page = await doc.getPage(i + 1);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: MAX_SIDE / Math.max(v1.width, v1.height) });
      const cv = document.createElement("canvas");
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      return { img: ctx.getImageData(0, 0, cv.width, cv.height) };
    },
  }));
}

interface UtifIfd { width: number; height: number; [k: string]: unknown }
interface Utif {
  decode(b: ArrayBuffer): UtifIfd[];
  decodeImage(b: ArrayBuffer, ifd: UtifIfd): void;
  toRGBA8(ifd: UtifIfd): Uint8Array;
}

async function tiffSources(f: File): Promise<Source[]> {
  const UTIF = ((await import("utif")) as unknown as { default: Utif }).default;
  const buf = await f.arrayBuffer();
  // chỉ lấy các trang ảnh thật (bỏ ảnh thu nhỏ đi kèm)
  const pages = UTIF.decode(buf).filter((d) => d["t256"] && d["t257"]);
  return pages.map((ifd, i) => ({
    name: pages.length > 1 ? `${stem(f)} (trang ${i + 1}).tif` : f.name,
    load: async () => {
      UTIF.decodeImage(buf, ifd);
      const rgba = UTIF.toRGBA8(ifd);
      const px = new Uint8ClampedArray(rgba.byteLength);
      px.set(rgba);
      const full = new ImageData(px, ifd.width, ifd.height);
      if (Math.max(ifd.width, ifd.height) <= MAX_SIDE) return { img: full };
      const cv = document.createElement("canvas");
      cv.width = ifd.width; cv.height = ifd.height;
      cv.getContext("2d")!.putImageData(full, 0, 0);
      return { img: toImageData(cv, ifd.width, ifd.height) };
    },
  }));
}

/** 1 file -> các phiếu (PDF/TIFF nhiều trang thành nhiều phiếu). Ném lỗi nếu file hỏng / không hỗ trợ. */
export async function sourcesFromFile(f: File): Promise<Source[]> {
  if (isPdf(f)) return pdfSources(f);
  if (isTiff(f)) return tiffSources(f);
  return [imageSource(f)];
}
