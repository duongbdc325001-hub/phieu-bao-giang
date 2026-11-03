"use client";
// Hiện 1 vùng của phiếu đã nắn thẳng; chạm vào ô tròn để chọn / bỏ chọn (như bubble_view.dart).
import { useEffect, useRef, useState } from "react";
import { getImage } from "@/lib/omr/store";
import { type SheetRec, type TplInfo, tplGroups } from "@/lib/omr/session";

const cache = new Map<string, Promise<ImageBitmap | null>>();
export function warpedBitmap(sid: string, sheetId: number): Promise<ImageBitmap | null> {
  const k = `${sid}/${sheetId}`;
  if (!cache.has(k)) {
    cache.set(k, getImage(sid, sheetId).then((b) => (b ? createImageBitmap(b) : null)));
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  }
  return cache.get(k)!;
}
export function forgetBitmap(sid: string, sheetId: number) { cache.delete(`${sid}/${sheetId}`); }

export interface Pad { l: number; t: number; r: number; b: number }

export function BubbleView({ sid, sh, tpl, groups, sel, marks = new Set(), pad = { l: 70, t: 40, r: 25, b: 25 }, onChange, maxZoom = 3 }: {
  sid: string; sh: SheetRec; tpl: TplInfo; groups: string[]; sel: Record<string, string>;
  marks?: Set<number>; pad?: Pad; onChange?: (v: Record<string, string>) => void; maxZoom?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const imgKey = `${sid}/${sh.id}`;
  const [loadedImg, setLoadedImg] = useState<{ key: string; img: ImageBitmap | null } | null>(null);
  const img = loadedImg?.key === imgKey ? loadedImg.img : undefined; // undefined = đang tải
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let alive = true;
    warpedBitmap(sid, sh.id).then((b) => { if (alive) setLoadedImg({ key: `${sid}/${sh.id}`, img: b }); });
    return () => { alive = false; };
  }, [sid, sh.id]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = tplGroups(tpl);
  const ids = groups.flatMap((x) => g[x] ?? []);
  const geo = (() => {
    if (!img || !ids.length || !sh.pos.length || !size.w) return null;
    const xs = ids.map((i) => sh.pos[i][0]), ys = ids.map((i) => sh.pos[i][1]);
    const x0 = Math.max(0, Math.min(...xs) - pad.l), y0 = Math.max(0, Math.min(...ys) - pad.t);
    const x1 = Math.min(img.width, Math.max(...xs) + pad.r), y1 = Math.min(img.height, Math.max(...ys) + pad.b);
    const bw = x1 - x0, bh = y1 - y0;
    const k = Math.min(size.w / bw, size.h / bh, maxZoom);
    return { x0, y0, bw, bh, k, ox: (size.w - bw * k) / 2, oy: (size.h - bh * k) / 2 };
  })();
  const toView = (x: number, y: number) => geo ? [(x - geo.x0) * geo.k + geo.ox, (y - geo.y0) * geo.k + geo.oy] : [0, 0];

  useEffect(() => {
    const c = cv.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#dfe7f2";
    ctx.fillRect(0, 0, size.w, size.h);
    if (!img || !geo) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, geo.x0, geo.y0, geo.bw, geo.bh, geo.ox, geo.oy, geo.bw * geo.k, geo.bh * geo.k);
    for (const i of ids) {
      const [cx, cy] = toView(sh.pos[i][0], sh.pos[i][1]);
      const r = tpl.r[i] * geo.k + 3;
      const on = sel[tpl.key[i]] === tpl.value[i];
      if (!on && !marks.has(i)) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = on ? 3 : 2;
      ctx.strokeStyle = on ? "#16a34a" : "#f59e0b";
      ctx.stroke();
    }
  });

  const tap = (e: React.PointerEvent) => {
    if (!geo || !onChange) return;
    const rc = cv.current!.getBoundingClientRect();
    const px = e.clientX - rc.left, py = e.clientY - rc.top;
    let best = -1, bd = Infinity;
    for (const i of ids) {
      const [vx, vy] = toView(sh.pos[i][0], sh.pos[i][1]);
      const d = (vx - px) ** 2 + (vy - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || Math.sqrt(bd) > Math.max(tpl.r[best] * geo.k * 1.6, 22)) return;
    const key = tpl.key[best], val = tpl.value[best];
    onChange({ ...sel, [key]: sel[key] === val ? "" : val });
  };

  return (
    <div ref={box} className="relative h-full w-full select-none overflow-hidden rounded-xl">
      <canvas ref={cv} onPointerUp={tap} className="h-full w-full touch-manipulation" style={{ width: size.w, height: size.h }} />
      {img === undefined && <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Đang tải ảnh…</div>}
      {img === null && <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Không có ảnh phiếu</div>}
    </div>
  );
}

/** Ô máy nghi ngờ: độ đậm >= ngưỡng thấp và >= 40% ô đậm nhất. */
export function suspectMarks(sh: SheetRec, t: TplInfo, groups: string[]): Set<number> {
  const out = new Set<number>();
  if (!sh.scores.length) return out;
  const lo = sh.thresholds[0];
  const g = tplGroups(t);
  for (const x of groups) {
    const ids = g[x] ?? [];
    if (!ids.length) continue;
    const top = Math.max(...ids.map((i) => sh.scores[i]));
    for (const i of ids) if (sh.scores[i] >= lo && sh.scores[i] >= 0.4 * top) out.add(i);
  }
  return out;
}

/** Ô đậm nhất của các nhóm bị gắn cờ (SBD / mã đề). */
export function flaggedTopMarks(sh: SheetRec, t: TplInfo): Set<number> {
  const out = new Set<number>();
  const g = tplGroups(t);
  for (const f of sh.flags) {
    const ids = g[f.split(":")[0]];
    if (!ids?.length || !sh.scores.length) continue;
    let top = ids[0];
    for (const i of ids) if (sh.scores[i] > sh.scores[top]) top = i;
    out.add(top);
  }
  return out;
}

/** Xem cả phiếu (ảnh đã nắn hoặc ảnh đã chấm). */
export function WholeSheet({ sid, sh, src }: { sid: string; sh: SheetRec; src?: string | null }) {
  const key = `${sid}/${sh.id}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const url = src ?? (loaded?.key === key ? loaded.url : null);
  useEffect(() => {
    if (src) return;
    let u: string | null = null, alive = true;
    getImage(sid, sh.id).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setLoaded({ key: `${sid}/${sh.id}`, url: u }); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [sid, sh.id, src]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={sh.name} className="mx-auto w-full max-w-2xl" /> : <p className="p-6 text-center text-sm text-slate-500">Không có ảnh</p>;
}
