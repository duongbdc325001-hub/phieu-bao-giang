"use client";
// Quét bằng camera trình duyệt: dò phiếu liên tục (lõi C++ omr_detect), tự chụp khi phiếu đứng yên.
// Dịch từ lib/ui/camera_screen.dart. Chế độ "qr" dùng để quét QR đáp án.
import { Camera, Flashlight, FlashlightOff, ListChecks, Volume2, VolumeX, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DetectResult, omrLive } from "@/lib/omr/engine";
import { type Ctl, beep, classify } from "@/lib/omr/controller";
import { soatFlags, type SheetRec } from "@/lib/omr/session";

type Pt = [number, number];
const move = (a: Pt[], b: Pt[]) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
/** Hai lần chụp cùng 1 phiếu: >= 90% câu đọc giống nhau (cho phép lệch vài ô tô mờ). */
function sameSheet(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (!keys.size) return true;
  let same = 0;
  for (const k of keys) if ((a[k] ?? "") === (b[k] ?? "")) same++;
  return same / keys.size >= 0.9;
}
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

/** Thu nhỏ ảnh vừa chụp (canvas lớn) cho bước kiểm tra nhanh. */
function shrink(src: HTMLCanvasElement, maxSide: number, cv: HTMLCanvasElement): ImageData {
  const f = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.round(src.width * f), h = Math.round(src.height * f);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Kiểm tra nhanh ảnh vừa chụp (~1200px): đủ nét và khớp đủ ô mốc. Ngưỡng đo trên ảnh thật: ảnh còn đọc được
 *  có độ nét >= 70 (ảnh nét 2000-5000), ảnh mờ hỏng <= 5. */
const QC_SIDE = 1200, QC_SHARP = 40, QC_MARKERS = 0.75;
function qcFail(r: DetectResult): string | null {
  if (!r.found) return "Không thấy đủ ô mốc";
  if ((r.sharp ?? 0) < QC_SHARP) return "Ảnh bị mờ";
  if (r.markers != null && r.markers_total && r.markers < QC_MARKERS * r.markers_total) return "Thiếu ô mốc (phiếu bị che / lệch khung)";
  return null;
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
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
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
  const mid = useRef<HTMLCanvasElement | null>(null);
  const [auto, setAuto] = useState(true);
  const [sound, setSound] = useState(true);
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [count, setCount] = useState(0);
  const [results, setResults] = useState<SheetRec[]>([]);
  const [steady, setSteady] = useState(0); // 0..1: giữ yên được bao lâu
  const [skipped, setSkipped] = useState(0);
  // "Kiểm tra ảnh rồi mới chuyển phiếu" (thay cho "đọc xong mới chuyển" của app 1.7.1 – đọc hết phiếu trên điện thoại yếu
  // mất vài giây): chụp xong kiểm tra nhanh độ nét + ô mốc (~0,2 s), đạt thì bíp, phần đọc đáp án chạy ngầm;
  // không đạt thì kêu 2 tiếng trầm, bỏ ảnh, tự chụp lại (3 lần liền không đạt thì giữ ảnh, thôi tự chụp)
  const [waitRead, setWaitRead] = useState(() => { try { return localStorage.getItem("cham-bai:waitRead") !== "0"; } catch { return true; } });
  const [waiting, setWaiting] = useState(false);
  const [retry, setRetry] = useState<string | null>(null);   // lý do phải chụp lại tờ vừa rồi
  const st = useRef({
    hist: [] as Pt[][], missing: 0, locked: false, capturing: false, auto: true, mine: new Set<number>(), sound: true,
    lockQuad: null as Pt[] | null, last: null as SheetRec | null,
    lockId: -1, retried: false, missSince: 0,   // phiếu gây khoá, đã tự chụp lại 1 lần chưa, mất dấu phiếu từ lúc nào
    waitRead: true, waitId: -1, fails: 0,        // ảnh đang kiểm tra, số lần liền không đạt cùng 1 tờ
  });
  useEffect(() => { st.current.auto = auto; st.current.sound = sound; st.current.waitRead = waitRead; }, [auto, sound, waitRead]);

  useEffect(() => ctl.onRead((sh) => {
    const s = st.current;
    if (!s.mine.has(sh.id)) return;
    if (!sh.ok && sh.id === s.lockId && s.locked && !s.retried && s.fails < 3) {
      // ảnh vừa chụp không đọc được mà phiếu vẫn trong khung -> tự chụp lại 1 lần
      s.retried = true; s.locked = false; setLocked(false); s.hist = [];
    }
    // chụp lại đúng phiếu vừa chụp (cùng SBD, mã đề, đáp án) -> bỏ, không tính trùng
    const prev = s.last;
    if (prev && prev.ok && sh.ok && prev.sbd === sh.sbd && prev.made === sh.made && sameSheet(prev.answers, sh.answers)) {
      ctl.remove(sh);
      setCount((c) => c - 1);
      setSkipped((n) => n + 1);
      return;
    }
    if (sh.ok) s.last = sh;
    setResults((l) => [sh, ...l.filter((x) => x !== sh)].slice(0, 4));
  }), [ctl]);

  /** Kết quả kiểm tra nhanh ảnh sh. */
  const onCheck = useCallback((sh: SheetRec, why: string | null) => {
    const s = st.current;
    if (s.waitId !== sh.id) return;
    s.waitId = -1; setWaiting(false);
    if (!why) {
      s.fails = 0; setRetry(null);
      if (s.sound) beep("good"); else navigator.vibrate?.(60);
      return;
    }
    if (s.sound) beep("error"); else navigator.vibrate?.([150, 80, 150]);
    s.fails++;
    if (s.fails < 3) {
      s.mine.delete(sh.id); ctl.remove(sh); setCount((c) => c - 1);
      s.locked = false; setLocked(false); s.hist = [];
      setRetry(why);
    } else {
      setRetry(`${why} (đã thử 3 lần). Kiểm tra phiếu, bỏ phiếu ra rồi đưa lại`);   // giữ ảnh để máy vẫn thử đọc
    }
  }, [ctl]);

  const capture = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth || st.current.capturing || st.current.waitId >= 0) return;
    st.current.capturing = true;
    setCapturing(true);
    big.current ??= document.createElement("canvas");
    const img = grab(v, 2600, big.current);
    const wait = st.current.waitRead;
    const qcImg = wait ? shrink(big.current, QC_SIDE, (mid.current ??= document.createElement("canvas"))) : null;
    if (!wait) { if (st.current.sound) beep("good"); else navigator.vibrate?.(60); }
    setRetry(null);
    const t = new Date();
    const two = (x: number) => `${x}`.padStart(2, "0");
    const name = `Anh_${two(t.getHours())}${two(t.getMinutes())}${two(t.getSeconds())}_${t.getMilliseconds()}.jpg`;
    const sh = ctl.addFrame(name, img);
    if (qcImg) {
      st.current.waitId = sh.id; setWaiting(true);
      omrLive().detect(qcImg, QC_SIDE).then((r) => onCheck(sh, qcFail(r)), () => onCheck(sh, null));
    }
    st.current.mine.add(sh.id);
    setCount((c) => c + 1);
    st.current.locked = true;
    st.current.lockQuad = st.current.hist[st.current.hist.length - 1] ?? null;
    st.current.lockId = sh.id;
    setLocked(true);
    st.current.hist = [];
    setSteady(0);
    setTimeout(() => { st.current.capturing = false; setCapturing(false); }, 350);
  }, [ctl, onCheck]);

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
          const r = await omrLive().detect(grab(v, 800, small.current!));
          if (!alive) return;
          const s = st.current;
          if (r.found && r.corners) {
            const cs = r.corners as Pt[];
            s.missing = 0; s.missSince = 0;
            setCorners(cs);
            // mở khoá chụp phiếu tiếp chỉ khi phiếu bị dịch hẳn chỗ khác (rung tay không tính).
            // Không tự mở theo thời gian: để yên 1 phiếu thì chỉ chụp 1 lần (muốn chụp lại: bấm nút chụp).
            if (s.locked && s.lockQuad && move(s.lockQuad, cs) > 0.2 && s.fails < 3) {
              s.locked = false; s.retried = false; setLocked(false); s.hist = [];
            }
            // giữ yên: so khung hiện tại với 2 khung trước (nới cho cầm tay)
            const prev = s.hist[s.hist.length - 1];
            if (prev && move(prev, cs) > 0.025) s.hist = [];
            s.hist.push(cs);
            if (s.hist.length > 3) s.hist.shift();
            const big = area(cs) > 0.18;
            setSteady(big ? s.hist.length / 3 : 0);
            const stable = s.hist.length >= 3 && move(s.hist[0], cs) < 0.03;
            if (s.auto && !s.locked && s.waitId < 0 && big && stable) capture();
          } else {
            s.missing++;
            s.missSince ||= Date.now();
            setCorners(null);
            s.hist = [];
            setSteady(0);
            // phiếu đã rời khung (mất dấu liên tục 0,5 giây, không phải mờ thoáng qua) -> sẵn sàng phiếu tiếp
            if (s.locked && Date.now() - s.missSince >= 500) {
              s.locked = false; s.retried = false; setLocked(false);
              if (s.fails >= 3) setRetry(null);
              s.fails = 0;
            }
          }
        } catch { /* bỏ khung lỗi */ }
        busy = false;
      }
      setTimeout(tick, 60);
    };
    tick();
    return () => { alive = false; };
  }, [capture]);

  const failHard = retry !== null && locked;          // 3 lần lỗi: thôi tự chụp
  const hint = capturing ? "Đang chụp…"
    : waiting ? "Đang kiểm tra ảnh… giữ nguyên"
    : failHard ? `✗ ${retry}`
    : retry !== null ? `✗ ${retry} – CHỤP LẠI phiếu này`
    : locked ? (waitRead ? "Ảnh đạt ✓  Lấy phiếu ra, đặt phiếu tiếp theo" : "Đã chụp ✓  Lấy phiếu ra, đặt phiếu tiếp theo")
    : !corners ? "Đưa cả phiếu vào khung, thấy đủ 4 ô vuông đen ở góc"
    : area(corners) <= 0.18 ? "Đưa camera lại gần hơn"
    : auto ? "Giữ yên máy…" : "Đã thấy phiếu – bấm nút chụp";

  const color = locked ? "#0284c7" : "#16a34a";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-1 px-2 py-2" style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Đóng"><X /></button>
        <span className="text-base">Đã chụp {count}</span>
        {skipped > 0 && <span className="ml-1 text-xs text-white/60">(bỏ {skipped} ảnh trùng)</span>}
        {ctl.reading > 0 && <span className="ml-2 text-xs text-white/70">· đang đọc {ctl.reading}</span>}
        <div className="flex-1" />
        <button onClick={() => setSound(!sound)} className="rounded-full p-2 hover:bg-white/10" aria-label="Âm báo">{sound ? <Volume2 /> : <VolumeX />}</button>
        <button
          onClick={() => { const v = !waitRead; setWaitRead(v); try { localStorage.setItem("cham-bai:waitRead", v ? "1" : "0"); } catch { /* bỏ qua */ } }}
          className="rounded-full p-2 hover:bg-white/10" aria-label={waitRead ? "Đang bật: kiểm tra ảnh rồi mới chuyển phiếu" : "Đang tắt: chụp nhanh, đọc sau"}
          title={waitRead ? "Đang bật: kiểm tra ảnh rồi mới chuyển phiếu" : "Đang tắt: chụp nhanh, đọc sau"}>
          {waitRead ? <ListChecks className="text-lime-300" /> : <Zap />}
        </button>
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

      <div className="mx-auto mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-150" style={{ width: `${(locked ? 1 : steady) * 100}%` }} />
      </div>
      <p className={`mx-3 my-1 rounded-lg px-3 py-1.5 text-center text-[15px] ${retry !== null && !waiting ? "bg-red-600/85 font-semibold" : ""}`}>{hint}</p>
      <div className="flex h-9 gap-1.5 overflow-x-auto px-3">
        {results.map((sh) => {
          const c = ctl.s ? classify(ctl.s, sh) : "good";
          return (
            <span key={sh.id} className={`shrink-0 rounded-full px-3 py-1 text-xs ${c === "good" ? "bg-emerald-600" : c === "warn" ? "bg-amber-500" : "bg-red-600"}`}>
              {sh.ok ? `SBD ${sh.sbd} · ${sh.made}${ctl.s && soatFlags(ctl.s, sh).length ? ` · ${soatFlags(ctl.s, sh).length}⚠` : ""}` : `Lỗi: ${(sh.error ?? "").split("(")[0]}`}
            </span>
          );
        })}
      </div>
      <div className="flex justify-center pb-4 pt-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
        <button
          onClick={capture}
          disabled={capturing || waiting || !!cam.error}
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
          const t = await omrLive().qrFromRgba(grab(v, 1280, cv.current!));
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
