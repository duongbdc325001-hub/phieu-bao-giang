"use client";
// Nhập đáp án thủ công (không cần file): chạm chọn A/B/C/D, Đ/S, gõ số cho phần III. Sửa lại được đáp án đã nạp.
// Chỉ gắn vào trang khi mở (KeysTab render có điều kiện) nên mỗi lần mở là một bản nháp mới.
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { type KeyMap, keyCount, newKey, normMade } from "@/lib/omr/keys";
import { normKeyP3 } from "@/lib/omr/session";
import { Btn, Modal, toast } from "./ui";

/** Cấu trúc đề hay dùng: số câu Phần I / II / III. */
const PRESETS: { label: string; n: [number, number, number] }[] = [
  { label: "Toán 12-4-6", n: [12, 4, 6] },
  { label: "Lý/Hoá/Sinh 18-4-6", n: [18, 4, 6] },
  { label: "24-4-0", n: [24, 4, 0] },
  { label: "40-0-0", n: [40, 0, 0] },
  { label: "40-8-6", n: [40, 8, 6] },
];
const LIM: [number, number, number] = [40, 8, 12];   // nhiều nhất các mẫu phiếu có
const ABCD = ["A", "B", "C", "D"];

type Draft = { made: string; n: [number, number, number]; I: string[]; II: string[][]; III: string[] };

const blank = (n: [number, number, number]): Draft => ({
  made: "", n,
  I: Array(LIM[0]).fill(""), II: Array.from({ length: LIM[1] }, () => ["", "", "", ""]), III: Array(LIM[2]).fill(""),
});

function fromKey(made: string, k: KeyMap): Draft {
  const qs = (m: Record<number, string>) => Object.keys(m).map(Number);
  const top = (m: Record<number, string>, lim: number) => Math.min(lim, Math.max(0, ...qs(m)));
  const d = blank([top(k.I, LIM[0]), top(k.II, LIM[1]), top(k.III, LIM[2])]);
  d.made = made;
  for (const [q, v] of Object.entries(k.I)) if (+q <= LIM[0]) d.I[+q - 1] = v;
  for (const [q, v] of Object.entries(k.II)) if (+q <= LIM[1]) d.II[+q - 1] = v.split("").slice(0, 4);
  for (const [q, v] of Object.entries(k.III)) if (+q <= LIM[2]) d.III[+q - 1] = v;
  return d;
}

/** Bản nháp -> đáp án. Câu bỏ trống thì không chấm câu đó; trả lỗi nếu có ô sai định dạng. */
function toKey(d: Draft): { key: KeyMap; errors: string[] } {
  const key = newKey(), errors: string[] = [];
  for (let q = 1; q <= d.n[0]; q++) if (d.I[q - 1]) key.I[q] = d.I[q - 1];
  for (let q = 1; q <= d.n[1]; q++) {
    const v = d.II[q - 1];
    const set = v.filter(Boolean).length;
    if (set === 4) key.II[q] = v.join("");
    else if (set > 0) errors.push(`Phần II câu ${q}: chưa chọn đủ 4 ý`);
  }
  for (let q = 1; q <= d.n[2]; q++) {
    const raw = d.III[q - 1].trim();
    if (!raw) continue;
    const v = normKeyP3(raw);   // cùng luật với ô soát Phần III: tối đa 4 ký tự, trừ ở cột 1, phẩy ở cột 2-3
    if (v == null) errors.push(`Phần III câu ${q}: "${raw}" không tô được trên phiếu (vd -1,5 hoặc 2024)`);
    else key.III[q] = v;
  }
  return { key, errors };
}

export function ManualKeyModal({ open, onClose, keys, onSave }: {
  open: boolean; onClose: () => void;
  keys: Record<string, KeyMap>;
  onSave: (made: string, key: KeyMap, replace: boolean) => void;
}) {
  const mades = useMemo(() => Object.keys(keys).sort(), [keys]);
  const [d, setD] = useState<Draft>(() => blank([12, 4, 6]));
  const [editing, setEditing] = useState<string | null>(null);

  const up = (fn: (x: Draft) => void) => setD((o) => { const x: Draft = { ...o, n: [...o.n], I: [...o.I], II: o.II.map((r) => [...r]), III: [...o.III] }; fn(x); return x; });
  const setN = (i: number, v: number) => up((x) => { x.n[i] = Math.max(0, Math.min(LIM[i], Math.round(v) || 0)); });
  const { key, errors } = toKey(d);
  const made = d.made.trim() ? normMade(d.made) : "";
  const exists = made !== "" && made in keys && made !== editing;
  const filled = keyCount(key), total = d.n[0] + d.n[1] + d.n[2];

  const load = (m: string, copy: boolean) => {
    const x = fromKey(m, keys[m]);
    if (copy) x.made = "";
    setD(x); setEditing(copy ? null : m);
  };

  const save = (andNext: boolean) => {
    if (!made) { toast("Nhập mã đề", true); return; }
    if (!/^\d{1,6}$/.test(made)) { toast("Mã đề chỉ gồm chữ số", true); return; }
    if (errors.length) { toast(errors[0], true); return; }
    if (!filled) { toast("Chưa nhập câu nào", true); return; }
    if (exists && !confirm(`Mã đề ${made} đã có đáp án. Thay bằng đáp án vừa nhập?`)) return;
    onSave(made, key, exists || made === editing);
    toast(`Đã lưu mã đề ${made} · ${filled} câu`);
    if (andNext) { setD(blank(d.n)); setEditing(null); } else onClose();
  };

  const pill = (on: boolean) => `h-9 min-w-9 rounded-full border text-sm font-semibold transition ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-600 active:bg-slate-100"}`;
  const head = (t: string, i: number) => (
    <div className="mb-2 mt-4 flex items-center justify-between">
      <h4 className="text-sm font-semibold text-slate-800">{t}</h4>
      <label className="flex items-center gap-1 text-xs text-slate-500">số câu
        <input type="number" inputMode="numeric" min={0} max={LIM[i]} value={d.n[i]} onChange={(e) => setN(i, Number(e.target.value))}
          className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
      </label>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} full title={editing ? `Sửa đáp án mã ${editing}` : "Nhập đáp án thủ công"}>
      <div className="p-4 pb-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">Mã đề
            <input value={d.made} onChange={(e) => up((x) => { x.made = e.target.value.replace(/\D/g, "").slice(0, 6); })}
              inputMode="numeric" placeholder="vd 101" autoFocus
              className="mt-1 block w-28 rounded-xl border border-slate-300 px-3 py-2 text-base font-semibold" />
          </label>
          {mades.length > 0 && (
            <label className="text-sm text-slate-600">Sửa / chép từ mã đã có
              <div className="mt-1 flex gap-1">
                <select value="" onChange={(e) => e.target.value && load(e.target.value, false)} className="rounded-xl border border-slate-300 px-2 py-2 text-sm">
                  <option value="">Sửa mã…</option>
                  {mades.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value="" onChange={(e) => e.target.value && load(e.target.value, true)} className="rounded-xl border border-slate-300 px-2 py-2 text-sm" title="Chép đáp án sang mã mới">
                  <option value="">Chép…</option>
                  {mades.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </label>
          )}
        </div>
        {exists && <p className="mt-1 text-xs text-amber-700">Mã {made} đã có đáp án, lưu sẽ thay đáp án cũ.</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => up((x) => { x.n = [...p.n]; })}
              className={`rounded-full border px-2.5 py-1 text-xs ${d.n.join() === p.n.join() ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-600"}`}>
              {p.label}
            </button>
          ))}
        </div>

        {d.n[0] > 0 && (
          <>
            {head("Phần I · chọn A B C D", 0)}
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {Array.from({ length: d.n[0] }, (_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-7 text-right text-sm font-medium text-slate-500">{i + 1}</span>
                  {ABCD.map((L) => (
                    <button key={L} className={pill(d.I[i] === L)} onClick={() => up((x) => { x.I[i] = x.I[i] === L ? "" : L; })}>{L}</button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {d.n[1] > 0 && (
          <>
            {head("Phần II · Đ = Đúng, S = Sai", 1)}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: d.n[1] }, (_, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-2">
                  <div className="mb-1 text-sm font-medium text-slate-600">Câu {i + 1}</div>
                  {"abcd".split("").map((lt, j) => (
                    <div key={lt} className="flex items-center gap-1.5 py-0.5">
                      <span className="w-5 text-sm text-slate-500">{lt})</span>
                      {(["D", "S"] as const).map((v) => (
                        <button key={v} aria-label={v === "D" ? "Đúng" : "Sai"} className={pill(d.II[i][j] === v)} onClick={() => up((x) => { x.II[i][j] = x.II[i][j] === v ? "" : v; })}>
                          {v === "D" ? "Đ" : "S"}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {d.n[2] > 0 && (
          <>
            {head("Phần III · gõ số (dùng dấu phẩy, vd -1,5)", 2)}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: d.n[2] }, (_, i) => (
                <label key={i} className="flex items-center gap-1.5 text-sm text-slate-500">
                  <span className="w-6 text-right font-medium">{i + 1}</span>
                  <input value={d.III[i]} onChange={(e) => up((x) => { x.III[i] = e.target.value; })} inputMode="decimal"
                    className="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-base text-slate-800" />
                </label>
              ))}
            </div>
          </>
        )}
        {errors.length > 0 && (
          <ul className="mt-3 list-disc rounded-lg bg-red-50 py-2 pl-6 pr-3 text-xs text-red-700">{errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>
        )}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3">
        <span className="mr-auto text-xs text-slate-500">Đã nhập {filled}/{total} câu{filled < total ? " · câu trống sẽ không chấm" : ""}</span>
        <Btn onClick={() => save(true)} disabled={!made}><Plus size={16} />Lưu, nhập mã khác</Btn>
        <Btn tone="primary" onClick={() => save(false)} disabled={!made}>Lưu</Btn>
      </div>
    </Modal>
  );
}
