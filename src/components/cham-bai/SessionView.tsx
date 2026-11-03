"use client";
// Màn hình 1 bài chấm: 5 bước ① Đáp án ② Chụp ③ SBD ④ Câu lỗi ⑤ Điểm (như session_screen.dart).
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSessionController } from "@/lib/omr/controller";
import { omr } from "@/lib/omr/engine";
import { persist } from "@/lib/omr/store";
import { type Session, idQueue, qQueue } from "@/lib/omr/session";
import { KeysTab } from "./KeysTab";
import { IdTab, QTab } from "./ReviewTabs";
import { ResultsTab } from "./ResultsTab";
import { ScanTab } from "./ScanTab";
import { Toaster } from "./ui";

export const BASE_PATH = "/dashboard/cham-bai";

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
  const nId = idQueue(s).length, nQ = qQueue(s).length;
  const hasKeys = Object.keys(s.keys).length > 0;
  const steps = [
    { label: "Đáp án", badge: hasKeys ? `${Object.keys(s.keys).length}` : "!" },
    { label: "Chụp", badge: `${s.sheets.filter((x) => !x.dropped).length}` },
    { label: "SBD", badge: nId ? `${nId}` : "" },
    { label: "Câu lỗi", badge: nQ ? `${nQ}` : "" },
    { label: "Điểm", badge: s.graded ? "✓" : "" },
  ];
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
        </div>
        <nav className="flex overflow-x-auto px-2">
          {steps.map((st, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${cur === i ? "border-emerald-600 font-semibold text-emerald-700" : "border-transparent text-slate-500"}`}>
              <span>{"①②③④⑤"[i]} {st.label}</span>
              {st.badge && (
                <span className={`rounded-full px-1.5 text-[11px] ${st.badge === "!" || (i >= 2 && i <= 3) ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{st.badge}</span>
              )}
            </button>
          ))}
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
