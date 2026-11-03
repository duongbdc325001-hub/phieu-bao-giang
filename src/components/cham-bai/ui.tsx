"use client";
// Thành phần giao diện nhỏ dùng chung cho phần chấm bài (chỉ Tailwind, không phụ thuộc thư viện UI khác).
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

type Tone = "primary" | "outline" | "ghost" | "danger" | "soft";
const TONE: Record<Tone, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-300",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  soft: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:text-slate-400",
};

export function Btn({ tone = "outline", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${TONE[tone]} ${className}`}
    />
  );
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "orange" | "red" | "blue"; children: ReactNode }) {
  const c = {
    slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", orange: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700", blue: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, full = false }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; full?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className={`flex max-h-[100dvh] w-full flex-col bg-white shadow-xl ${full ? "h-[100dvh] sm:h-[92dvh] sm:max-w-3xl sm:rounded-2xl" : "max-h-[90dvh] rounded-t-2xl sm:max-w-lg sm:rounded-2xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1 text-base font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Đóng"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---- thông báo nhanh
type T = { id: number; msg: string; error?: boolean };
let push: ((t: T) => void) | null = null;
let seq = 0;
export function toast(msg: string, error = false) { push?.({ id: ++seq, msg, error }); }

export function Toaster() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      setList((l) => [...l, t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 2800);
    };
    return () => { push = null; };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div key={t.id} className={`rounded-xl px-4 py-2 text-sm text-white shadow-lg ${t.error ? "bg-red-600" : "bg-slate-800"}`}>{t.msg}</div>
      ))}
    </div>
  );
}

export function downloadBytes(bytes: Uint8Array | Blob, name: string, type = "application/octet-stream") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
