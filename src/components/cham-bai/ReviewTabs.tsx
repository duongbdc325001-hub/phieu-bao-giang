"use client";
// ③ Soát SBD / mã đề và ④ Soát câu bị gắn cờ (như id_review.dart, question_review.dart).
import { Check, ChevronLeft, ChevronRight, CircleCheck, Circle, Play } from "lucide-react";
import { useState } from "react";
import type { Ctl } from "@/lib/omr/controller";
import type { Session } from "@/lib/omr/session";
import {
  type QItem, type SheetRec, answerFromGroups, dispAnswer, groupsFromAnswer, groupsOf, idProblems, idQueue,
  madeDigits, normInput, qItems, reasonVi, sbdDigits, sbdShown, studentName, tplOf, validMade, validP3, validSbd,
} from "@/lib/omr/session";
import { BubbleView, WholeSheet, flaggedTopMarks, suspectMarks } from "./BubbleView";
import { Btn, Modal, toast } from "./ui";

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-600">
      <CircleCheck size={56} className="text-emerald-500" />
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

// ====================================================================== ③ SBD / mã đề
export function IdTab({ ctl }: { ctl: Ctl }) {
  const s = ctl.s!;
  const q = idQueue(s);
  const [cur, setCur] = useState<SheetRec | null>(null);
  const skip = !!s.skip_sbd;
  if (!q.length) return <Empty text={s.sheets.some((x) => !x.dropped) ? (skip ? "Mã đề đều ổn (đang bỏ qua soát SBD)." : "SBD và mã đề đều ổn.") : "Chưa có phiếu nào."} />;
  return (
    <div className="space-y-3">
      <Btn tone="primary" className="w-full py-3" onClick={() => setCur(q[0][0])}><Play size={18} />Soát lần lượt {q.length} phiếu</Btn>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {q.map(([sh, pr]) => (
          <li key={sh.id}>
            <button className="w-full px-4 py-2.5 text-left hover:bg-slate-50" onClick={() => setCur(sh)}>
              <div className="text-sm font-medium">{sh.ok ? (skip ? `Mã đề ${sh.made} · ${sh.name}` : `SBD ${sh.sbd} · Mã đề ${sh.made}`) : sh.name}</div>
              <div className={`text-xs ${pr.some((p) => p.blocking) ? "text-red-600" : "text-amber-700"}`}>{pr.map((p) => p.msg).join(" • ")}</div>
            </button>
          </li>
        ))}
      </ul>
      {cur && <IdReviewer ctl={ctl} first={cur} onClose={() => setCur(null)} />}
    </div>
  );
}

/** Ô chọn SBD / mã đề ban đầu của 1 phiếu (như _show trong id_review.dart). */
function idSel(s: Session, x: SheetRec): Record<string, string> {
  const t = tplOf(s, x);
  const sl: Record<string, string> = {};
  if (x.ok && t) {
    for (const [name, n] of [["sbd", sbdDigits(t)], ["made", madeDigits(t)]] as const) {
      const v = (name === "sbd" ? x.sbd : x.made).padStart(n, "?");
      for (let k = 0; k < n; k++) sl[`${name}_${k + 1}`] = /\d/.test(v[k]) ? v[k] : "";
    }
  }
  return sl;
}

function IdReviewer({ ctl, first, onClose }: { ctl: Ctl; first: SheetRec; onClose: () => void }) {
  const s = ctl.s!;
  const [sh, setSh] = useState(first);
  const [sel, setSel] = useState<Record<string, string>>(() => idSel(s, first));
  const [sbd, setSbd] = useState(first.sbd);
  const [made, setMade] = useState(first.made);
  const [whole, setWhole] = useState(false);
  const t = tplOf(s, sh);
  const skip = !!s.skip_sbd;
  const show = (x: SheetRec) => { setSh(x); setSel(idSel(s, x)); setSbd(x.sbd); setMade(x.made); };

  const selChanged = (v: Record<string, string>) => {
    if (!t) return;
    setSel(v);
    const sb = Array.from({ length: sbdDigits(t) }, (_, k) => v[`sbd_${k + 1}`] || "?").join("");
    const w = sb.replace(/^\?+/, "");
    setSbd(w.length >= 4 && /^\d+$/.test(w) ? w : sb);
    setMade(Array.from({ length: madeDigits(t) }, (_, k) => v[`made_${k + 1}`] || "?").join(""));
  };
  const textChanged = (nsbd: string, nmade: string) => {
    setSbd(nsbd); setMade(nmade);
    if (!t) return;
    const sl = { ...sel };
    for (const [name, val, n] of [["sbd", nsbd, sbdDigits(t)], ["made", nmade, madeDigits(t)]] as const) {
      const v = val.trim().slice(0, n).padStart(n, "?");
      for (let k = 0; k < n; k++) sl[`${name}_${k + 1}`] = /\d/.test(v[k]) ? v[k] : "";
    }
    setSel(sl);
  };

  const next = () => {
    const rest = idQueue(s).map(([x]) => x).filter((x) => x !== sh);
    if (!rest.length) { toast(skip ? "✓ Đã soát xong mã đề" : "✓ Đã soát xong SBD / mã đề"); onClose(); return; }
    show(rest.find((x) => x.id > sh.id) ?? rest[0]);
  };
  const confirmIt = () => {
    if (!t) return;
    const a = sbd.trim(), b = made.trim();
    if (!skip && !validSbd(a, sbdDigits(t))) { toast(`SBD phải có 4–${sbdDigits(t)} chữ số`, true); return; }
    if (!validMade(b, madeDigits(t))) { toast(`Mã đề phải đủ ${madeDigits(t)} chữ số`, true); return; }
    const err = ctl.confirmId(sh, a, b);
    if (err.length) { alert(`Chưa xác nhận được:\n${err.join("\n")}`); return; }
    next();
  };

  const pr = idProblems(s, sh);
  const name = Object.keys(s.students).length && !skip ? studentName(s, sbd.trim()) : null;
  const groups = t ? [...(skip ? [] : Array.from({ length: sbdDigits(t) }, (_, k) => `sbd_${k + 1}`)), ...Array.from({ length: madeDigits(t) }, (_, k) => `made_${k + 1}`)] : [];
  return (
    <Modal open onClose={onClose} full title={`${skip ? "Soát mã đề" : "Soát SBD / Mã đề"} · còn ${idQueue(s).length}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-4 pt-3 text-xs text-slate-500">
          <span className="min-w-0 flex-1 truncate">{sh.name}</span>
          {sh.has_warped && <Btn tone="ghost" onClick={() => setWhole(true)}>Cả phiếu</Btn>}
        </div>
        <ul className="px-4 pt-1 text-sm">
          {pr.map((p) => <li key={p.code} className={p.blocking ? "text-red-600" : "text-amber-700"}>• {p.msg}</li>)}
        </ul>
        {sh.ok && t ? (
          <>
            <div className="min-h-[260px] flex-1 p-3">
              <BubbleView sid={s.id} sh={sh} tpl={t} groups={groups} sel={sel} marks={flaggedTopMarks(sh, t)} pad={{ l: 40, t: 60, r: 30, b: 30 }} onChange={selChanged} />
            </div>
            <div className={`grid gap-3 px-4 ${skip ? "grid-cols-1" : "grid-cols-2"}`}>
              {!skip && <label className="text-xs text-slate-500">SBD
                <input value={sbd} inputMode="numeric" onChange={(e) => textChanged(e.target.value, made)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-lg text-slate-900" />
              </label>}
              <label className="text-xs text-slate-500">Mã đề
                <input value={made} inputMode="numeric" onChange={(e) => textChanged(sbd, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-lg text-slate-900" />
              </label>
            </div>
            <p className="h-5 px-4 pt-1 text-xs text-slate-500">{name ?? ""}</p>
          </>
        ) : (
          <p className="flex-1 p-6 text-center text-sm text-red-600">Phiếu không đọc được. Chụp lại rồi xoá ảnh này, hoặc bỏ phiếu.</p>
        )}
        <div className="flex gap-2 border-t border-slate-100 p-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          <Btn tone="danger" onClick={() => { if (confirm(`Bỏ phiếu ${sh.name}? Không chấm phiếu này (ghi vào nhật ký).`)) { ctl.drop(sh); next(); } }}>Bỏ phiếu</Btn>
          <div className="flex-1" />
          {sh.ok && <Btn tone="primary" className="px-6" onClick={confirmIt}><Check size={18} />Xác nhận</Btn>}
        </div>
      </div>
      <Modal open={whole} onClose={() => setWhole(false)} title={sh.name} full><WholeSheet sid={s.id} sh={sh} /></Modal>
    </Modal>
  );
}

// ====================================================================== ④ câu bị gắn cờ
export function QTab({ ctl }: { ctl: Ctl }) {
  const s = ctl.s!;
  const [onlyPending, setOnly] = useState(true);
  const [start, setStart] = useState<QItem | null>(null);
  const all = qItems(s);
  const items = onlyPending ? all.filter((it) => !it.sh.q_done[it.key]) : all;
  const pending = all.filter((it) => !it.sh.q_done[it.key]).length;
  if (idQueue(s).length && all.length === 0) return <Empty text={"Soát xong SBD / mã đề ở bước ③ trước."} />;
  return (
    <div className="space-y-3">
      <Btn tone="primary" className="w-full py-3" disabled={!items.length} onClick={() => setStart(items[0])}>
        <Play size={18} />{pending ? `Soát lần lượt ${pending} câu` : `Đã soát xong ${all.length} câu`}
      </Btn>
      <label className="flex items-center gap-2 px-1 text-sm text-slate-600">
        <input type="checkbox" checked={onlyPending} onChange={(e) => setOnly(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
        Chỉ hiện câu chưa xong
      </label>
      {items.length === 0 ? (
        <Empty text={all.length === 0 ? "Không có câu nào bị gắn cờ." : "Đã soát xong các câu lỗi.\nChuyển sang ⑤ Điểm."} />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {items.map((it) => {
            const done = !!it.sh.q_done[it.key];
            return (
              <li key={`${it.sh.id}|${it.key}`}>
                <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50" onClick={() => setStart(it)}>
                  {done ? <CircleCheck size={18} className="shrink-0 text-emerald-500" /> : <Circle size={18} className="shrink-0 text-amber-500" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Câu {it.key} · {sbdShown(s, it.sh) ? `SBD ${it.sh.sbd}` : it.sh.name} · Mã {it.sh.made}</span>
                    <span className="block text-xs text-slate-500">{it.why} · máy đọc: {dispAnswer(it.key, it.sh.answers[it.key] ?? "")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {start && <QReviewer ctl={ctl} onlyPending={onlyPending} start={start} onClose={() => setStart(null)} />}
    </div>
  );
}

/** Trạng thái ban đầu khi mở 1 câu (như _load trong question_review.dart). */
function qFields(it: QItem) {
  const g = groupsFromAnswer(it.key, it.sh.answers[it.key] ?? "", it.sh);
  const sel = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v === "*" ? "" : v]));
  const done = !!it.sh.q_done[it.key];
  // tô nhiều ô là sai quy chế: mặc định không chấm
  const voidQ = ((it.sh.answers[it.key] ?? "") === "*" && done) || (!done && it.why === reasonVi.nhieu_o);
  return { sel, voidQ, p3: answerFromGroups(it.key, sel) };
}

function QReviewer({ ctl, onlyPending, start, onClose }: { ctl: Ctl; onlyPending: boolean; start: QItem; onClose: () => void }) {
  const s = ctl.s!;
  const [cur, setCur] = useState({ sheet: start.sh.id, key: start.key });
  const [sel, setSel] = useState<Record<string, string>>(() => qFields(start).sel);
  const [p3, setP3] = useState(() => qFields(start).p3);
  const [voidQ, setVoid] = useState(() => qFields(start).voidQ);
  const [whole, setWhole] = useState(false);
  const isCur = (it: QItem) => it.sh.id === cur.sheet && it.key === cur.key;
  const list = qItems(s).filter((it) => !onlyPending || !it.sh.q_done[it.key] || isCur(it));
  const idx = list.findIndex(isCur);
  const it = idx >= 0 ? list[idx] : null;
  const goTo = (x: QItem) => {
    const f = qFields(x);
    setCur({ sheet: x.sh.id, key: x.key }); setSel(f.sel); setVoid(f.voidQ); setP3(f.p3);
  };

  if (!it) return (
    <Modal open onClose={onClose} title="Soát câu lỗi"><p className="p-6 text-center text-sm">Không còn câu nào cần soát.</p></Modal>
  );

  const key = it.key;
  const t = tplOf(s, it.sh)!;
  const gs = groupsOf(key);
  const isP3 = key.startsWith("III.");
  const opts = key.startsWith("I.") ? ["A", "B", "C", "D"] : key.startsWith("II.") ? ["D", "S"] : [];
  const curAns = answerFromGroups(key, sel);
  const done = !!it.sh.q_done[key];
  const pad = isP3 ? { l: 75, t: 50, r: 30, b: 30 } : { l: 110, t: 120, r: 60, b: 110 };

  const go = (i: number) => { const x = list[Math.max(0, Math.min(list.length - 1, i))]; if (x) goTo(x); };
  const after = (before: QItem[], i: number) => {
    if (onlyPending) {
      const pend = qItems(s).filter((x) => !x.sh.q_done[x.key]);
      if (!pend.length) { toast("✓ Đã soát xong các câu lỗi"); onClose(); return; }
      const rest = before.slice(i + 1).filter((x) => !x.sh.q_done[x.key]);
      goTo(rest[0] ?? pend[0]);
    } else if (i + 1 < before.length) go(i + 1);
    else toast("Đã tới câu cuối");
  };
  const confirmIt = (over?: { sel?: Record<string, string>; voidQ?: boolean }) => {
    const sl = over?.sel ?? sel, vq = over?.voidQ ?? voidQ;
    if (vq) { ctl.setAnswer(it.sh, key, "*"); after(list, idx); return; }
    if (isP3 && !validP3(answerFromGroups(key, sl))) {
      if (!confirm(`“${answerFromGroups(key, sl)}” không phải một số (2 dấu phẩy, dấu trừ không đứng đầu, hoặc cột trống ở giữa). Câu này sẽ bị chấm sai.\n\nVẫn lưu như học sinh đã tô?`)) return;
    }
    if (isP3) ctl.setAnswerCols(it.sh, key, gs.map((g) => sl[g] ?? ""));
    else ctl.setAnswer(it.sh, key, sl[gs[0]] ?? "");
    after(list, idx);
  };
  const pick = (v: string) => { const sl = { [gs[0]]: v }; setSel(sl); setVoid(false); confirmIt({ sel: sl, voidQ: false }); };

  return (
    <Modal open onClose={onClose} full title={`Câu ${idx + 1}/${list.length}`}>
      <div className="flex h-full flex-col">
        <div className="px-4 pt-3">
          <p className="text-lg font-bold">Câu {key} — {it.why}</p>
          <p className="text-xs text-slate-500">{sbdShown(s, it.sh) ? `SBD ${it.sh.sbd} · ` : ""}Mã đề {it.sh.made} · {it.sh.name}{done ? " · đã soát" : ""}</p>
          {it.why === reasonVi.nhieu_o && (
            <p className="mt-1 text-xs text-red-600">Tô nhiều ô là sai quy chế → mặc định KHÔNG CHẤM câu này. Nếu chỉ là vết tẩy, bấm vào ô học sinh chọn rồi Xác nhận.</p>
          )}
        </div>
        <div className="min-h-[220px] flex-1 p-3">
          <BubbleView sid={s.id} sh={it.sh} tpl={t} groups={gs} sel={sel} marks={suspectMarks(it.sh, t, gs)} pad={pad}
            onChange={(v) => { setSel(v); setVoid(false); setP3(answerFromGroups(key, v)); }} />
        </div>
        <div className="flex items-center gap-3 px-4">
          <span className="text-sm">Đáp án chọn:</span>
          {voidQ ? <span className="text-xl font-bold text-red-600">Không chấm</span>
            : !isP3 ? <span className="font-mono text-2xl font-bold">{dispAnswer(key, curAns)}</span>
            : (
              <input value={p3} inputMode="decimal" placeholder="trống"
                onChange={(e) => {
                  setP3(e.target.value);
                  const v = normInput(key, e.target.value);
                  if (v == null) return;
                  setSel(Object.fromEntries(gs.map((g, i) => [g, v[i] ?? ""]))); setVoid(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && confirmIt()}
                className="w-32 rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xl" />
            )}
        </div>
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {opts.map((o) => (
            <Btn key={o} tone="soft" className="h-13 min-w-[60px] text-xl" onClick={() => pick(o)}>{o === "D" && key.startsWith("II.") ? "Đ" : o}</Btn>
          ))}
          <Btn className="h-13 min-w-[70px]" onClick={() => {
            if (isP3) { const sl = Object.fromEntries(gs.map((g) => [g, ""])); setSel(sl); setP3(""); setVoid(false); confirmIt({ sel: sl, voidQ: false }); }
            else pick("");
          }}>Trống</Btn>
          <Btn tone="danger" className="h-13 min-w-[70px]" onClick={() => { setVoid(true); confirmIt({ voidQ: true }); }}>Không chấm</Btn>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 p-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          <Btn disabled={idx <= 0} onClick={() => go(idx - 1)} aria-label="Câu trước"><ChevronLeft size={18} /></Btn>
          <Btn disabled={idx + 1 >= list.length} onClick={() => go(idx + 1)} aria-label="Câu sau"><ChevronRight size={18} /></Btn>
          <Btn tone="ghost" onClick={() => setWhole(true)}>Cả phiếu</Btn>
          <div className="flex-1" />
          <Btn tone="primary" className="px-6" onClick={() => confirmIt()}><Check size={18} />Xác nhận</Btn>
        </div>
      </div>
      <Modal open={whole} onClose={() => setWhole(false)} title={it.sh.name} full><WholeSheet sid={s.id} sh={it.sh} /></Modal>
    </Modal>
  );
}
