"use client";
// Quét bằng camera trình duyệt: dò phiếu liên tục (lõi C++ omr_detect), tự chụp khi phiếu đứng yên.
// Dịch từ lib/ui/camera_screen.dart. Chế độ "qr" dùng để quét QR đáp án.
import { Camera, Flashlight, FlashlightOff, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { omr } from "@/lib/omr/engine";
import { type Ctl, beep, classify } from "@/lib/omr/controller";
import type { SheetRec } from "@/lib/omr/session";

type Pt = [number, number];
const move = (a: Pt[], b: Pt[]) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
const area = (q: Pt[]) => Math.abs(q.reduce((s, a, i) => { const b = q[(i + 1) % 4]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;

function grab(video: HTMLVideoElement, maxSide: number, cv: HTMLCanvasElement): ImageData {
  const vw = video.videoWidth, vh = video.videoHeight;
  const f = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.round(vw * f), h = Math.round(vh * f);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Mở camera sau; component tự gắn stream vào <video> (xem attach). */
function useCamera(active = true) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (!active) return;
    let st: MediaStream | null = null, alive = true;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        st = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (!alive) { st.getTracks().forEach((t) => t.stop()); return; }
        const track = st.getVideoTracks()[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caps: any = track.getCapabilities?.() ?? {};
        setTorchOk(!!caps.torch);
        if (caps.focusMode?.includes("continuous"))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
        setStream(st);
      } catch (e) {
        const name = (e as Error).name;
        setError(
          (e as Error).message === "insecure"
            ? "Trình duyệt không cho dùng camera. Trang phải mở bằng https://"
            : name === "NotAllowedError"
              ? "Chưa được phép dùng camera. Bấm biểu tượng ổ khoá trên thanh địa chỉ → cho phép Camera, rồi mở lại."
              : `Không mở được camera (${name || (e as Error).message})`,
        );
      }
    };
    start();
    const vis = () => { if (document.hidden) st?.getVideoTracks().forEach((t) => (t.enabled = false)); else st?.getVideoTracks().forEach((t) => (t.enabled = true)); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", vis);
      st?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [active]);

  const toggleTorch = useCallback(async () => {
    const t = stream?.getVideoTracks()[0];
    if (!t) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { await t.applyConstraints({ advanced: [{ torch: !torch } as any] }); setTorch(!torch); } catch { /* máy không hỗ trợ */ }
  }, [stream, torch]);

  return { stream, error, torchOk, torch, toggleTorch };
}

/** Vị trí khung hình thật bên trong <video object-contain>. */
function useVideoRect(video: React.RefObject<HTMLVideoElement | null>) {
  const [r, setR] = useState({ x: 0, y: 0, w: 0, h: 0 });
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const upd = () => {
      const cw = v.clientWidth, ch = v.clientHeight, vw = v.videoWidth || 1, vh = v.videoHeight || 1;
      const k = Math.min(cw / vw, ch / vh);
      setR({ x: (cw - vw * k) / 2, y: (ch - vh * k) / 2, w: vw * k, h: vh * k });
    };
    const ro = new ResizeObserver(upd);
    ro.observe(v);
    v.addEventListener("loadedmetadata", upd);
    v.addEventListener("resize", upd);
    return () => { ro.disconnect(); v.removeEventListener("loadedmetadata", upd); v.removeEventListener("resize", upd); };
  }, [video]);
  return r;
}

export function CameraScan({ ctl, onClose }: { ctl: Ctl; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cam = useCamera();
  useEffect(() => {
    const v = video.current;
    if (v && cam.stream && v.srcObject !== cam.stream) { v.srcObject = cam.stream; v.play().catch(() => {}); }
  }, [cam.stream]);
  const rect = useVideoRect(video);
  const small = useRef<HTMLCanvasElement | null>(null);
  const big = useRef<HTMLCanvasElement | null>(null);
  const [auto, setAuto] = useState(true);
  const [sound, setSound] = useState(true);
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [count, setCount] = useState(0);
  const [results, setResults] = useState<SheetRec[]>([]);
  const st = useRef({ hist: [] as Pt[][], missing: 0, locked: false, capturing: false, auto: true, mine: new Set<number>(), sound: true });
  useEffect(() => { st.current.auto = auto; st.current.sound = sound; }, [auto, sound]);

  useEffect(() => ctl.onRead((sh) => {
    if (!st.current.mine.has(sh.id)) return;
    setResults((l) => [sh, ...l.filter((x) => x !== sh)].slice(0, 4));
    if (st.current.sound && ctl.s && classify(ctl.s, sh) !== "good") beep(classify(ctl.s, sh));
  }), [ctl]);

  const capture = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth || st.current.capturing) return;
    st.current.capturing = true;
    setCapturing(true);
    big.current ??= document.createElement("canvas");
    const img = grab(v, 2600, big.current);
    if (st.current.sound) beep("good"); else navigator.vibrate?.(60);
    const t = new Date();
    const two = (x: number) => `${x}`.padStart(2, "0");
    const name = `Anh_${two(t.getHours())}${two(t.getMinutes())}${two(t.getSeconds())}_${t.getMilliseconds()}.jpg`;
    const sh = ctl.addFrame(name, img);
    st.current.mine.add(sh.id);
    setCount((c) => c + 1);
    st.current.locked = true;
    setLocked(true);
    st.current.hist = [];
    setTimeout(() => { st.current.capturing = false; setCapturing(false); }, 350);
  }, [ctl]);

  // vòng dò phiếu
  useEffect(() => {
    let alive = true, busy = false;
    small.current ??= document.createElement("canvas");
    const tick = async () => {
      const v = video.current;
      if (!alive) return;
      if (!busy && v && v.videoWidth && !document.hidden && !st.current.capturing) {
        busy = true;
        try {
          const r = await omr().detect(grab(v, 900, small.current!));
          if (!alive) return;
          const s = st.current;
          if (r.found && r.corners) {
            const cs = r.corners as Pt[];
            s.missing = 0;
            setCorners(cs);
            s.hist.push(cs);
            if (s.hist.length > 3) s.hist.shift();
            const stable = s.hist.length === 3 && move(s.hist[0], s.hist[2]) < 0.015 && move(s.hist[1], s.hist[2]) < 0.015;
            if (s.auto && !s.locked && stable && area(cs) > 0.22) capture();
          } else {
            s.missing++;
            setCorners(null);
            s.hist = [];
            if (s.missing >= 3) { s.locked = false; setLocked(false); } // phiếu đã rời khung
          }
        } catch { /* bỏ khung lỗi */ }
        busy = false;
      }
      setTimeout(tick, 120);
    };
    tick();
    return () => { alive = false; };
  }, [capture]);

  const hint = capturing ? "Đang chụp…"
    : locked ? "Đã chụp ✓  Đổi sang phiếu tiếp theo"
    : !corners ? "Đưa cả phiếu vào khung, thấy đủ 4 ô vuông đen ở góc"
    : area(corners) <= 0.22 ? "Đưa camera lại gần hơn"
    : auto ? "Giữ yên máy…" : "Đã thấy phiếu – bấm nút chụp";

  const color = locked ? "#0284c7" : "#16a34a";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-1 px-2 py-2" style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Đóng"><X /></button>
        <span className="text-base">Đã chụp {count}</span>
        {ctl.reading > 0 && <span className="ml-2 text-xs text-white/70">· đang đọc {ctl.reading}</span>}
        <div className="flex-1" />
        <button onClick={() => setSound(!sound)} className="rounded-full p-2 hover:bg-white/10" aria-label="Âm báo">{sound ? <Volume2 /> : <VolumeX />}</button>
        <label className="flex items-center gap-2 px-2 text-sm text-white/80">
          Tự chụp
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-emerald-500" />
        </label>
        {cam.torchOk && (
          <button onClick={cam.toggleTorch} className="rounded-full p-2 hover:bg-white/10" aria-label="Đèn">{cam.torch ? <Flashlight /> : <FlashlightOff />}</button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {cam.error ? (
          <p className="grid h-full place-items-center px-8 text-center">{cam.error}</p>
        ) : (
          <>
            <video ref={video} playsInline muted autoPlay className="h-full w-full object-contain" />
            <svg className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} viewBox="0 0 1 1" preserveAspectRatio="none">
              {corners ? (
                <polygon points={corners.map((p) => p.join(",")).join(" ")} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={0.008} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 4 }} />
              ) : (
                <rect x={0.06} y={0.08} width={0.88} height={0.84} rx={0.02} fill="none" stroke="white" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />
              )}
            </svg>
            {capturing && <div className="absolute inset-0 bg-white/25" />}
          </>
        )}
      </div>

      <p className="px-3 py-2 text-center text-[15px]">{hint}</p>
      <div className="flex h-9 gap-1.5 overflow-x-auto px-3">
        {results.map((sh) => {
          const c = ctl.s ? classify(ctl.s, sh) : "good";
          return (
            <span key={sh.id} className={`shrink-0 rounded-full px-3 py-1 text-xs ${c === "good" ? "bg-emerald-600" : c === "warn" ? "bg-amber-500" : "bg-red-600"}`}>
              {sh.ok ? `SBD ${sh.sbd} · ${sh.made}${sh.flags.length ? ` · ${sh.flags.length}⚠` : ""}` : `Lỗi: ${(sh.error ?? "").split("(")[0]}`}
            </span>
          );
        })}
      </div>
      <div className="flex justify-center pb-4 pt-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
        <button
          onClick={capture}
          disabled={capturing || !!cam.error}
          className={`grid h-[74px] w-[74px] place-items-center rounded-full border-4 border-white ${capturing ? "bg-white/50" : "bg-white/20 active:bg-white/40"}`}
          aria-label="Chụp"
        >
          <Camera size={32} />
        </button>
      </div>
    </div>
  );
}

/** Quét QR đáp án bằng camera. */
export function QrScan({ onText, onClose }: { onText: (t: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cam = useCamera();
  useEffect(() => {
    const v = video.current;
    if (v && cam.stream && v.srcObject !== cam.stream) { v.srcObject = cam.stream; v.play().catch(() => {}); }
  }, [cam.stream]);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const done = useRef(false);
  useEffect(() => {
    let alive = true, busy = false;
    cv.current ??= document.createElement("canvas");
    const tick = async () => {
      if (!alive || done.current) return;
      const v = video.current;
      if (!busy && v?.videoWidth) {
        busy = true;
        try {
          const t = await omr().qrFromRgba(grab(v, 1280, cv.current!));
          if (t && alive && !done.current) { done.current = true; beep("good"); onText(t); return; }
        } catch { /* bỏ qua */ }
        busy = false;
      }
      setTimeout(tick, 250);
    };
    tick();
    return () => { alive = false; };
  }, [onText]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 px-2 py-2">
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Đóng"><X /></button>
        <span>Quét QR đáp án</span>
      </div>
      <div className="relative min-h-0 flex-1">
        {cam.error ? <p className="grid h-full place-items-center px-8 text-center">{cam.error}</p>
          : <video ref={video} playsInline muted autoPlay className="h-full w-full object-contain" />}
      </div>
      <p className="px-4 py-4 text-center text-sm text-white/80">Đưa mã QR đáp án (in từ web đảo đề) vào giữa khung hình</p>
    </div>
  );
}
