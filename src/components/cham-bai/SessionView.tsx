"use client";
// Màn hình 1 bài chấm: 5 bước ① Đáp án ② Chụp ③ SBD ④ Câu lỗi ⑤ Điểm (như session_screen.dart).
import { ArrowLeft, Check, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSessionController } from "@/lib/omr/controller";
import { omr } from "@/lib/omr/engine";
import { persist } from "@/lib/omr/store";
import { type Session, active, idQueue, qQueue } from "@/lib/omr/session";
import { KeysTab } from "./KeysTab";
import { IdTab, QTab } from "./ReviewTabs";
import { ResultsTab } from "./ResultsTab";
import { ScanTab } from "./ScanTab";
import { Toaster, toast } from "./ui";

export const BASE_PATH = "/dashboard/cham-bai";
/** Lựa chọn "bỏ qua soát SBD" gần nhất trên máy này (trang Đảo đề cũng ghi khoá này) – dùng cho bài chấm mới. */
export const SKIP_SBD_PREF = "cham-bai:bo-qua-sbd";

type StepState = "done" | "warn" | "todo";
const CIRCLE: Record<StepState, string> = {
  done: "border-emerald-600 bg-emerald-600 text-white",
  warn: "border-amber-500 bg-amber-50 text-amber-700",
  todo: "border-slate-300 bg-white text-slate-400",
};
const LABEL: Record<StepState, string> = { done: "text-slate-800", warn: "text-amber-700", todo: "text-slate-400" };

export function SessionView({ id, onSaved }: { id: string; onSaved?: (s: Session) => Promise<void> | void }) {
  const ctl = useSessionController(id, onSaved);
  const [tab, setTab] = useState<number | null>(null);
  const [engine, setEngine] = useState<string | null>(null);

  useEffect(() => {
    persist();
    omr().init().then(() => setEngine(null)).catch((e) => setEngine(`Không tải được lõi chấm: ${e.message}`));
  }, []);

  if (ctl.loaded === "loading") return <p className="p-8 text-center text-sm text-slate-500">Đang mở…</p>;
  if (ctl.loaded === "missing" || !ctl.s)
    return (
      <div className="p-8 text-center text-sm">
        <p>Không tìm thấy bài chấm trên máy này.</p>
        <Link href={BASE_PATH} className="text-emerald-700 underline">Về danh sách</Link>
      </div>
    );

  const s = ctl.s;
  const skip = !!s.skip_sbd;
  const nId = idQueue(s).length, nQ = qQueue(s).length;
  const nKeys = Object.keys(s.keys).length, nSheets = active(s).length;
  const steps: { label: string; sub: string; count?: number; state: StepState }[] = [
    { label: "Đáp án", sub: nKeys ? `${nKeys} mã đề` : "Chưa nhập", count: nKeys || undefined, state: nKeys ? "done" : "warn" },
    { label: "Chụp", sub: nSheets ? `${nSheets} phiếu` : "Chưa có phiếu", count: nSheets || undefined, state: nSheets ? "done" : "todo" },
    {
      label: skip ? "Mã đề" : "SBD",
      sub: !nSheets ? (skip ? "Bỏ qua SBD" : "Soát SBD") : nId ? `${nId} cần soát` : skip ? "Bỏ qua SBD" : "Đã ổn",
      count: nId || undefined, state: !nSheets ? "todo" : nId ? "warn" : "done",
    },
    { label: "Câu lỗi", sub: !nSheets ? "Soát câu" : nQ ? `${nQ} cần soát` : "Đã ổn", count: nQ || undefined, state: !nSheets ? "todo" : nQ ? "warn" : "done" },
    { label: "Điểm", sub: s.graded ? "Đã chấm" : "Chưa chấm", state: s.graded ? "done" : "todo" },
  ];
  const toggleSkip = () => {
    const v = !skip;
    ctl.setSkipSbd(v);
    try { localStorage.setItem(SKIP_SBD_PREF, v ? "1" : "0"); } catch { /* chế độ riêng tư: bỏ qua */ }
    toast(v ? "Đã bỏ qua soát SBD: chỉ soát mã đề" : "Đã bật lại soát SBD");
  };
  const cur = tab ?? ctl.initialStep;

  return (
    <div className="mx-auto max-w-3xl pb-24">
      {/* <main> của dashboard có overflow-y-auto nên không dùng sticky; trên điện thoại sát mép như thanh ứng dụng */}
      <header className="-mx-3 -mt-3 border-b border-slate-200 bg-white sm:mx-0 sm:mt-0 sm:rounded-xl sm:border">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Link href={BASE_PATH} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Quay lại"><ArrowLeft size={20} /></Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{s.name}</h1>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Đổi tên"
            onClick={() => { const n = prompt("Tên bài chấm", s.name)?.trim(); if (n) ctl.mutate((s) => { s.name = n; }); }}>
            <Pencil size={16} />
          </button>
          <button role="switch" aria-checked={skip} onClick={toggleSkip}
            title="Chấm bằng điện thoại cá nhân, học sinh không cần tô SBD: chỉ soát mã đề"
            className={`flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              skip ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            <span className={`relative h-4 w-7 rounded-full transition ${skip ? "bg-emerald-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${skip ? "left-3.5" : "left-0.5"}`} />
            </span>
            Bỏ qua SBD
          </button>
        </div>
        <nav aria-label="Các bước chấm" className="border-t border-slate-100 px-1 pb-2 pt-3">
          <ol className="flex">
            {steps.map((st, i) => {
              const on = cur === i;
              const line = steps[i - 1]?.state === "done" ? "bg-emerald-500" : "bg-slate-200";
              return (
                <li key={i} className="relative min-w-0 flex-1">
                  {i > 0 && <span aria-hidden className={`absolute left-[calc(-50%+24px)] right-[calc(50%+24px)] top-[19px] h-[3px] rounded-full ${line}`} />}
                  <button onClick={() => setTab(i)} aria-current={on ? "step" : undefined}
                    className={`flex w-full flex-col items-center gap-1 rounded-xl px-0.5 pb-1.5 pt-0.5 transition ${on ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                    <span className={`relative flex h-10 w-10 items-center justify-center rounded-full border-[3px] text-base font-bold transition ${
                      on ? "scale-110 border-emerald-600 bg-white text-emerald-700 ring-4 ring-emerald-200" : CIRCLE[st.state]}`}>
                      {st.state === "done" && !on ? <Check size={20} strokeWidth={3} /> : i + 1}
                      {st.count != null && (
                        <span className={`absolute -right-2.5 -top-2 min-w-[22px] rounded-full px-1 text-[11px] font-bold leading-[20px] text-white ring-2 ring-white ${
                          st.state === "warn" ? "bg-amber-500" : "bg-slate-600"}`}>{st.count}</span>
                      )}
                    </span>
                    <span className={`max-w-full truncate text-xs font-semibold sm:text-sm ${on ? "font-extrabold text-emerald-700" : LABEL[st.state]}`}>{st.label}</span>
                    <span className={`max-w-full truncate text-[10px] leading-tight sm:text-xs ${st.state === "warn" && !on ? "text-amber-600" : "text-slate-500"}`}>{st.sub}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>
      {engine && <p className="m-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{engine}</p>}
      <main className="py-3">
        {cur === 0 && <KeysTab ctl={ctl} />}
        {cur === 1 && <ScanTab ctl={ctl} />}
        {cur === 2 && <IdTab ctl={ctl} />}
        {cur === 3 && <QTab ctl={ctl} />}
        {cur === 4 && <ResultsTab ctl={ctl} />}
      </main>
      <Toaster />
    </div>
  );
}
