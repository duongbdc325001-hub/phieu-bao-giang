"use client";
// Bộ điều khiển 1 phiên chấm: giữ Session trong bộ nhớ, đọc ảnh nối tiếp bằng lõi C++, tự lưu IndexedDB.
// Tương đương SessionController (lib/app_state.dart) của app điện thoại.
import { useCallback, useEffect, useRef, useState } from "react";
import { omr } from "./engine";
import type { Loaded } from "./sources";
import { getSession, putImage, putSession } from "./store";
import {
  type Session, type SheetRec, applyRead, confirmId, dropSheet, gradeAll, madeKey, newSheet, nowStr, readyToGrade,
  restoreSheet, setAnswer, setId,
} from "./session";

export type ReadSignal = "good" | "warn" | "bad";

/** Phân loại phiếu vừa đọc để báo tiếng / màu (như AppFeedback.classify). */
export function classify(s: Session, sh: SheetRec): ReadSignal {
  if (!sh.ok) return "bad";
  const badId = (!s.skip_sbd && /[?*]/.test(sh.sbd)) || /[?*]/.test(sh.made) || (Object.keys(s.keys).length > 0 && madeKey(s, sh.made) === undefined);
  if (badId) return "bad";
  return sh.flags.length ? "warn" : "good";
}

let audio: AudioContext | null = null;
export function beep(kind: ReadSignal) {
  try {
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
type Job = { sh: SheetRec; load: () => Promise<Loaded> };

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
  const running = useRef(false);
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

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const job = queue.current.shift()!;
        setReading(queue.current.length + 1);
        let r;
        try {
          let src: Loaded;
          try { src = await job.load(); }
          catch (e) { throw new Error(`Không mở được file ảnh (${(e as Error).message || "định dạng không hỗ trợ"})`); }
          r = "file" in src ? await omr().readFile(src.file) : await omr().readRgba(src.img);
        } catch (e) {
          const m = (e as Error).message;
          r = { json: { ok: false, error: m.startsWith("Không mở") ? m : `Lõi chấm lỗi: ${m}` }, warped: null };
        }
        const s = ref.current;
        if (!s) break;
        if (r.warped) await putImage(s.id, job.sh.id, r.warped);
        mutate((s) => applyRead(s, job.sh, r.json, !!r.warped));
        for (const l of listeners.current) l(job.sh);
      }
    } finally {
      running.current = false;
      setReading(0);
    }
  }, [mutate]);

  /** Thêm 1 phiếu; load() được gọi khi tới lượt chấm. */
  const addSource = useCallback((name: string, load: () => Promise<Loaded>) => {
    let sh!: SheetRec;
    mutate((s) => { sh = newSheet(s, name); });
    queue.current.push({ sh, load });
    pump();
    return sh;
  }, [mutate, pump]);

  const addFrame = useCallback((name: string, img: ImageData) => addSource(name, async () => ({ img })), [addSource]);

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
    remove: (sh: SheetRec) => mutate((s) => { s.sheets = s.sheets.filter((x) => x !== sh); s.graded = false; }),
  };
}

export type Ctl = ReturnType<typeof useSessionController>;
