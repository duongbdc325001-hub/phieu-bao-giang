"use client";
// Bộ điều khiển 1 phiên chấm: giữ Session trong bộ nhớ, đọc ảnh nối tiếp bằng lõi C++, tự lưu IndexedDB.
// Tương đương SessionController (lib/app_state.dart) của app điện thoại.
import { useCallback, useEffect, useRef, useState } from "react";
import { idleReader, omrReader, readerCount } from "./engine";
import type { Loaded } from "./sources";
import { getSession, putImage, putSession } from "./store";
import {
  type Session, type SheetRec, applyRead, confirmId, dropSheet, gradeAll, madeKey, newSheet, nowStr, readyToGrade, soatFlags, tplLock,
  restoreSheet, setAnswer, setId,
} from "./session";

export type ReadSignal = "good" | "warn" | "bad";

/** Phân loại phiếu vừa đọc để báo tiếng / màu (như AppFeedback.classify). */
export function classify(s: Session, sh: SheetRec): ReadSignal {
  if (!sh.ok) return "bad";
  const badId = (!s.skip_sbd && /[?*]/.test(sh.sbd)) || /[?*]/.test(sh.made) || (Object.keys(s.keys).length > 0 && madeKey(s, sh.made) === undefined);
  if (badId) return "bad";
  return soatFlags(s, sh).length ? "warn" : "good";
}

let audio: AudioContext | null = null;
/** kind "error": 2 tiếng trầm (đọc lỗi, phải chụp lại – như app 1.7.1). */
export function beep(kind: ReadSignal | "error") {
  try {
    if (kind === "error") {
      navigator.vibrate?.([150, 80, 150]);
      audio ??= new AudioContext();
      for (const t0 of [0, 0.28]) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 260;
        g.gain.setValueAtTime(0.2, audio.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t0 + 0.22);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + t0);
        o.stop(audio.currentTime + t0 + 0.25);
      }
      return;
    }
    navigator.vibrate?.(kind === "good" ? 60 : [80, 60, 80]);
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = kind === "good" ? 1320 : kind === "warn" ? 880 : 330;
    g.gain.setValueAtTime(0.15, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (kind === "good" ? 0.12 : 0.35));
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.4);
  } catch { /* trình duyệt chặn âm thanh: bỏ qua */ }
}

// load: giải mã ảnh khi tới lượt (file scan PDF/TIFF nhiều trang không chiếm bộ nhớ cùng lúc)
type Job = { sh: SheetRec; load: () => Promise<Loaded>; pre?: Promise<Loaded> };
/** Số phiếu tải / giải mã trước trong lúc đang chấm (ảnh chọn từ Google Drive phải tải qua mạng). */
const PREFETCH = 2;
/** Lấy ảnh của phiếu: dùng bản đã tải trước nếu có. */
const loadJob = (j: Job) => (j.pre ??= j.load());

/** onSaved: gọi (chậm 3 giây, khi có mạng) sau mỗi lần lưu – dùng để đồng bộ lên Supabase nếu muốn. */
export function useSessionController(id: string, onSaved?: (s: Session) => Promise<void> | void) {
  // ref: dùng trong các hàm chạy nền; sess: cùng object đó, đưa ra cho giao diện vẽ
  const ref = useRef<Session | null>(null);
  const [sess, setSess] = useState<Session | null>(null);
  const [initialStep, setInitialStep] = useState(0);
  const [ver, setVer] = useState(0);
  const [loaded, setLoaded] = useState<"loading" | "ok" | "missing">("loading");
  const [reading, setReading] = useState(0);
  const queue = useRef<Job[]>([]);
  const busy = useRef<boolean[]>([]);   // luồng chấm i đang chạy
  const inflight = useRef(0);            // số phiếu đang chấm dở
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeners = useRef(new Set<(sh: SheetRec) => void>());
  const cloudT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  useEffect(() => {
    let alive = true;
    getSession(id).then((s) => {
      if (!alive) return;
      if (!s) { setLoaded("missing"); return; }
      // phiếu đang đọc dở lúc đóng trang -> báo lỗi để chụp lại
      for (const sh of s.sheets) if (!sh.ok && sh.error == null) sh.error = "Chưa đọc xong (trang bị đóng) – chụp lại phiếu";
      ref.current = s;
      setSess(s);
      // bước mở đầu: chưa có gì -> ① Đáp án ; đã chấm -> ⑤ Điểm ; còn lại -> ② Chụp
      setInitialStep(Object.keys(s.keys).length || s.sheets.length ? (s.graded ? 4 : 1) : 0);
      setLoaded("ok");
      setVer((v) => v + 1);
    });
    return () => { alive = false; };
  }, [id]);

  const save = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    s.updated = nowStr();
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => { putSession(s).catch(console.error); }, 250);
    if (onSavedRef.current) {
      if (cloudT.current) clearTimeout(cloudT.current);
      cloudT.current = setTimeout(() => {
        if (navigator.onLine) Promise.resolve(onSavedRef.current?.(s)).catch((e) => console.warn("Đồng bộ lỗi:", e));
      }, 3000);
    }
  }, []);

  /** Thay đổi phiên rồi vẽ lại + lưu. */
  const mutate = useCallback((fn: (s: Session) => void) => {
    const s = ref.current;
    if (!s) return;
    fn(s);
    // tự chấm lại khi đủ điều kiện (như gradeIfReady)
    if (!s.graded && Object.keys(s.keys).length && readyToGrade(s) && s.sheets.some((x) => !x.dropped && x.ok)) {
      try { gradeAll(s); } catch { /* chưa đủ điều kiện */ }
    }
    save();
    setVer((v) => v + 1);
  }, [save]);

  /** 1 luồng chấm: lấy phiếu trong hàng đợi cho tới khi hết. */
  const runSlot = useCallback(async (slot: number) => {
    try {
      while (queue.current.length) {
        const job = queue.current.shift()!;
        inflight.current++;
        setReading(queue.current.length + inflight.current);
        let r;
        try {
          let src: Loaded;
          // tải trước các phiếu kế tiếp trong lúc chấm phiếu này (chỉ ảnh/PDF chọn từ máy; ảnh camera đã có sẵn)
          for (const nx of queue.current.slice(0, PREFETCH)) loadJob(nx).catch(() => {});
          try { src = await loadJob(job); }
          catch (e) { throw new Error(`Không mở được file ảnh (${(e as Error).message || "định dạng không hỗ trợ"})`); }
          const eng = omrReader(slot);
          const read = (x: Loaded, tid: string | null) => "file" in x ? eng.readFile(x.file, 2600, tid) : eng.readRgba(x.img, 2600, tid);
          // khoá mẫu (như app 1.6.1): đọc theo mẫu đã nhận ở phiếu đầu -> nhanh hơn, không nhận nhầm mẫu.
          // Đọc lỗi khi đang khoá thì thử lại mọi mẫu (web không giữ ảnh gốc để "Đọc lại" sau).
          const lock = ref.current ? tplLock(ref.current) : null;
          const copy = lock ? ("file" in src ? { file: src.file.slice(0) } : { img: new ImageData(new Uint8ClampedArray(src.img.data), src.img.width, src.img.height) }) : null;
          r = await read(src, lock);
          if (copy && r.json.ok !== true) r = await read(copy, null);
        } catch (e) {
          const m = (e as Error).message;
          r = { json: { ok: false, error: m.startsWith("Không mở") ? m : `Lõi chấm lỗi: ${m}` }, warped: null };
        } finally {
          inflight.current--;
        }
        const s = ref.current;
        if (!s) break;
        if (r.warped) await putImage(s.id, job.sh.id, r.warped);
        mutate((s) => applyRead(s, job.sh, r.json, !!r.warped));
        for (const l of listeners.current) l(job.sh);
        setReading(queue.current.length + inflight.current);
      }
    } finally {
      busy.current[slot] = false;
      idleReader(slot);
      setReading(queue.current.length + inflight.current);
    }
  }, [mutate]);

  /** Chia phiếu cho các luồng chấm: luồng 2 (máy mạnh) chỉ chạy khi còn phiếu chờ trong lúc luồng 1 đang bận. */
  const pump = useCallback(() => {
    const n = readerCount();
    for (let i = 0; i < n && queue.current.length; i++) {
      if (busy.current[i]) continue;
      busy.current[i] = true;
      void runSlot(i);
    }
  }, [runSlot]);

  /** Thêm 1 phiếu; load() được gọi khi tới lượt chấm. front: đọc trước các phiếu đang chờ (camera chờ đọc xong). */
  const addSource = useCallback((name: string, load: () => Promise<Loaded>, front = false) => {
    let sh!: SheetRec;
    mutate((s) => { sh = newSheet(s, name); });
    if (front) queue.current.unshift({ sh, load }); else queue.current.push({ sh, load });
    pump();
    return sh;
  }, [mutate, pump]);

  const addFrame = useCallback((name: string, img: ImageData, front = false) => addSource(name, async () => ({ img }), front), [addSource]);

  const onRead = useCallback((fn: (sh: SheetRec) => void) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  return {
    s: sess, ver, loaded, initialStep, reading, mutate, addSource, addFrame, onRead,
    setAnswer: (sh: SheetRec, key: string, v: string) => mutate((s) => setAnswer(s, sh, key, v)),
    setAnswerCols: (sh: SheetRec, key: string, cols: string[]) => mutate((s) => {
      setAnswer(s, sh, key, cols.join(""));
      sh.p3cols_all[key] = cols;
    }),
    confirmId: (sh: SheetRec, sbd: string, made: string) => {
      let err: string[] = [];
      mutate((s) => { setId(s, sh, { sbd, made }); err = confirmId(s, sh); });
      return err;
    },
    /** Bật/tắt bỏ qua soát SBD (chấm bằng điện thoại cá nhân, chỉ cần mã đề). */
    setSkipSbd: (v: boolean) => mutate((s) => { s.skip_sbd = v; s.graded = false; }),
    drop: (sh: SheetRec, reason?: string) => mutate((s) => dropSheet(s, sh, reason)),
    restore: (sh: SheetRec) => mutate((s) => restoreSheet(s, sh)),
    /** Xoá phiếu (kể cả khi còn trong hàng đợi chưa đọc). */
    remove: (sh: SheetRec) => {
      queue.current = queue.current.filter((j) => j.sh !== sh);
      setReading(queue.current.length + inflight.current);
      mutate((s) => { s.sheets = s.sheets.filter((x) => x !== sh); s.graded = false; });
    },
  };
}

export type Ctl = ReturnType<typeof useSessionController>;
