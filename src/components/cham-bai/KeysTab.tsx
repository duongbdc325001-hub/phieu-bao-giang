"use client";
// ① Đáp án + danh sách lớp + thang điểm (như data_tab.dart).
import { ClipboardPaste, FileSpreadsheet, ImageIcon, PencilLine, QrCode, Trash2, Users } from "lucide-react";
import { useRef, useState } from "react";
import { type Ctl } from "@/lib/omr/controller";
import { omr, TEMPLATE_INFO } from "@/lib/omr/engine";
import { decodeKeysText, encodeKeysText, keyCount, loadKeys, loadStudents, mergeKeys } from "@/lib/omr/keys";
import { configWarnings, maxScore, qQueue, idQueue, SOAT_MO_TA, SOAT_TEN, setTplMode, type Scale } from "@/lib/omr/session";
import { QrScan } from "./CameraScan";
import { ManualKeyModal } from "./ManualKey";
import { Badge, Btn, Card, Modal, toast } from "./ui";

const readBytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
const tplName = (id: string) => TEMPLATE_INFO.find((t) => t.id === id)?.name ?? id;

export function KeysTab({ ctl }: { ctl: Ctl }) {
  const s = ctl.s!;
  const fileIn = useRef<HTMLInputElement>(null);
  const qrIn = useRef<HTMLInputElement>(null);
  const classIn = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [qr, setQr] = useState(false);
  const [view, setView] = useState(false);
  const [manual, setManual] = useState<false | true | string>(false);   // true = nhập mới, string = sửa mã đề

  const addKeys = (keys: Record<string, import("@/lib/omr/keys").KeyMap>, source: string, extraErr: string[] = []) => {
    ctl.mutate((s) => {
      const errors = [...extraErr];
      mergeKeys(s.keys, s.key_source, errors, keys, source);
      s.key_errors = errors;
      s.graded = false;
    });
    toast(`Đã nạp ${Object.keys(keys).length} mã đề`);
  };

  const fromText = (t: string, source: string) => {
    try { addKeys(decodeKeysText(t), source); return true; }
    catch (e) { toast((e as Error).message, true); return false; }
  };

  const onFiles = async (fs: FileList | null) => {
    if (!fs?.length) return;
    const files = await Promise.all([...fs].map(async (f) => ({ name: f.name, bytes: await readBytes(f) })));
    const r = await loadKeys(files);
    if (!Object.keys(r.keys).length) { toast(r.errors[0] ?? "Không tìm thấy đáp án trong file", true); return; }
    ctl.mutate((s) => {
      const errors = [...r.errors];
      for (const [m, k] of Object.entries(r.keys)) mergeKeys(s.keys, s.key_source, errors, { [m]: k }, r.source[m]);
      s.key_errors = errors;
      s.graded = false;
    });
    toast(`Đã nạp ${Object.keys(r.keys).length} mã đề`);
  };

  const onQrImage = async (f: File | undefined) => {
    if (!f) return;
    const t = await omr().qrFromFile(await f.arrayBuffer());
    if (!t) { toast("Không đọc được QR trong ảnh", true); return; }
    fromText(t, `QR (${f.name})`);
  };

  const onClass = async (f: File | undefined) => {
    if (!f) return;
    const st = await loadStudents(f.name, await readBytes(f));
    if (!Object.keys(st).length) { toast("Không thấy cột SBD trong file", true); return; }
    ctl.mutate((s) => { s.students = st; s.class_file = f.name; });
    toast(`Đã nạp ${Object.keys(st).length} học sinh`);
  };

  const setScale = (fn: (sc: Scale) => void) => ctl.mutate((s) => { fn(s.scale); s.graded = false; });
  const mades = Object.keys(s.keys).sort();
  const mx = [...new Set(mades.map((m) => maxScore(s, m)))];
  const warns = configWarnings(s);
  const numIn = (v: number | null, on: (x: number | null) => void, ph: string) => (
    <input
      type="number" inputMode="decimal" step="any" min={0} value={v ?? ""} placeholder={ph}
      onChange={(e) => on(e.target.value === "" ? null : Number(e.target.value))}
      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
    />
  );

  return (
    <div className="space-y-4">
      <Card
        title="Đáp án"
        right={mades.length > 0 && (
          <div className="flex gap-1">
            <Btn tone="ghost" onClick={() => setView(true)}>Xem</Btn>
            <Btn tone="ghost" onClick={() => { if (confirm("Xoá toàn bộ đáp án đã nạp?")) ctl.mutate((s) => { s.keys = {}; s.key_source = {}; s.key_errors = []; s.graded = false; }); }}>
              <Trash2 size={16} />
            </Btn>
          </div>
        )}
      >
        {mades.length ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {mades.map((m) => (
              <Badge key={m} tone="green">
                {m} · {Object.keys(s.keys[m].I).length}/{Object.keys(s.keys[m].II).length}/{Object.keys(s.keys[m].III).length}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-sm text-slate-500">Chưa có đáp án. Nhập tay, lấy từ phần đảo đề, file Excel hoặc quét QR.</p>
        )}
        {s.key_errors.length > 0 && (
          <ul className="mb-3 list-disc space-y-0.5 rounded-lg bg-red-50 py-2 pl-6 pr-3 text-xs text-red-700">
            {s.key_errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Btn tone="soft" className="col-span-2 sm:col-span-1" onClick={() => setManual(true)}><PencilLine size={16} />Nhập tay</Btn>
          <Btn tone="soft" onClick={() => setPaste(true)}><ClipboardPaste size={16} />Dán đáp án</Btn>
          <Btn tone="soft" onClick={() => fileIn.current?.click()}><FileSpreadsheet size={16} />File Excel/CSV</Btn>
          <Btn tone="soft" onClick={() => setQr(true)}><QrCode size={16} />Quét QR</Btn>
          <Btn tone="soft" onClick={() => qrIn.current?.click()}><ImageIcon size={16} />Ảnh có QR</Btn>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Mẫu file: <a className="text-emerald-700 underline" href="/omr/Mau_dap_an.xlsx" download>Mau_dap_an.xlsx</a>
        </p>
        <input ref={fileIn} type="file" accept=".xlsx,.xlsm,.csv" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <input ref={qrIn} type="file" accept="image/*" hidden onChange={(e) => { onQrImage(e.target.files?.[0]); e.target.value = ""; }} />
      </Card>

      <Card title="Mẫu phiếu và mức soát">
        <div className="space-y-4 text-sm">
          <label className="block">
            <span className="text-slate-600">Mẫu phiếu của bài chấm này</span>
            <select value={TEMPLATE_INFO.some((t) => t.id === s.tpl_mode) || s.tpl_mode === "*" ? s.tpl_mode : ""}
              onChange={(e) => ctl.mutate((s) => setTplMode(s, e.target.value))}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-2">
              <option value="">{!s.tpl_mode && s.tpl_auto ? `Tự nhận ở phiếu đầu (đã khoá: ${tplName(s.tpl_auto)})` : "Tự nhận ở phiếu đầu rồi khoá (nên dùng)"}</option>
              {TEMPLATE_INFO.map((t) => <option key={t.id} value={t.id}>Chỉ {t.name}</option>)}
              <option value="*">Thử tất cả mẫu (bài trộn nhiều mẫu)</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">Khoá mẫu giúp đọc nhanh hơn và không nhận nhầm mẫu. Phiếu khác mẫu đang khoá sẽ tự được thử lại với mọi mẫu.</span>
          </label>
          <div>
            <span className="text-slate-600">Mức soát (độ nhạy)</span>
            <div className="mt-1 inline-flex overflow-hidden rounded-full border border-slate-300">
              {SOAT_TEN.map((t, i) => (
                <button key={t} onClick={() => { ctl.mutate((s) => { s.soat = i; }); try { localStorage.setItem("cham-bai:soat", String(i)); } catch { /* bỏ qua */ } }}
                  className={`px-4 py-1.5 ${(s.soat ?? 2) === i ? "bg-emerald-600 text-white" : "bg-white text-slate-600"}`}>{t}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{SOAT_MO_TA[s.soat ?? 2]}</p>
            {s.sheets.length > 0 && <p className="mt-1 text-xs text-emerald-700">Hiện cần soát: {idQueue(s).length} phiếu ở bước SBD · {qQueue(s).length} câu ở bước soát câu</p>}
          </div>
        </div>
      </Card>

      <Card title="Danh sách lớp (không bắt buộc)">
        <div className="flex flex-wrap items-center gap-2">
          <Btn onClick={() => classIn.current?.click()}><Users size={16} />Chọn file</Btn>
          {s.class_file ? (
            <>
              <span className="text-sm text-slate-600">{s.class_file} · {Object.keys(s.students).length} HS</span>
              <Btn tone="ghost" onClick={() => ctl.mutate((s) => { s.students = {}; s.class_file = null; })}><Trash2 size={16} /></Btn>
            </>
          ) : (
            <a className="text-xs text-emerald-700 underline" href="/omr/Mau_danh_sach_lop.xlsx" download>Mẫu danh sách</a>
          )}
        </div>
        <input ref={classIn} type="file" accept=".xlsx,.xlsm,.csv" hidden onChange={(e) => { onClass(e.target.files?.[0]); e.target.value = ""; }} />
      </Card>

      <Card title="Thang điểm" right={mx.length > 0 && <Badge tone="blue">Tối đa {mx.join(" / ")}</Badge>}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 text-slate-600">Phần I / câu</span>
            {numIn(s.scale.p1, (x) => setScale((sc) => { sc.p1 = x ?? 0.25; }), "0.25")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 text-slate-600">Phần II</span>
            <select value={s.scale.p2} onChange={(e) => setScale((sc) => { sc.p2 = e.target.value as "bgd" | "deu"; })}
              className="rounded-lg border border-slate-300 px-2 py-1.5">
              <option value="bgd">Theo Bộ (0,1 / 0,25 / 0,5 / 1)</option>
              <option value="deu">Chia đều 0,25 / ý</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 text-slate-600">Phần III / câu</span>
            {numIn(s.scale.p3, (x) => setScale((sc) => { sc.p3 = x ?? 0.5; }), "0.5")}
          </div>
          <details className="rounded-lg bg-slate-50 p-3">
            <summary className="cursor-pointer text-slate-700">Số câu / điểm cả phần (đề không theo cấu trúc Bộ)</summary>
            <table className="mt-2 text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pr-3">Phần</th><th className="pr-3">Số câu chấm</th><th>Điểm cả phần</th></tr></thead>
              <tbody>
                {(["I", "II", "III"] as const).map((p, i) => (
                  <tr key={p}>
                    <td className="py-1 pr-3 font-medium">{p}</td>
                    <td className="py-1 pr-3">{numIn(s.scale.n[i], (x) => setScale((sc) => { sc.n[i] = x == null ? null : Math.round(x); }), "theo ĐA")}</td>
                    <td className="py-1">{numIn(s.scale.t[i], (x) => setScale((sc) => { sc.t[i] = x; }), "tự tính")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Ví dụ đề Bộ 12-4-6 in trên phiếu 40-8-6: số câu 12 / 4 / 6. Để trống = theo đáp án.</p>
          </details>
          {warns.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-700">{warns.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>
      </Card>

      <Modal open={paste} onClose={() => setPaste(false)} title="Dán đáp án">
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">Dán nguyên văn phần “ĐÁP ÁN” từ web đảo đề (Mã 101: / Phần I: 1D 2C… ) hoặc chuỗi QR.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
            placeholder={"ĐÁP ÁN - 4 MÃ ĐỀ\n\nMã 101:\nPhần I: 1D 2C 3D …\nPhần II: 1SĐSĐ …\nPhần III: 1=2 2=96 …"} />
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setPaste(false)}>Huỷ</Btn>
            <Btn tone="primary" disabled={!text.trim()} onClick={() => { if (fromText(text, "Dán từ đảo đề")) { setPaste(false); setText(""); } }}>Nạp đáp án</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={view} onClose={() => setView(false)} title={`Đáp án · ${mades.length} mã đề`}>
        <ul className="divide-y divide-slate-100 px-4 pt-2">
          {mades.map((m) => (
            <li key={m} className="flex items-center gap-2 py-2 text-sm">
              <span className="font-semibold">Mã {m}</span>
              <span className="text-xs text-slate-500">{keyCount(s.keys[m])} câu · {s.key_source[m] ?? ""}</span>
              <span className="ml-auto" />
              <Btn tone="ghost" onClick={() => { setView(false); setManual(m); }} aria-label={`Sửa mã ${m}`}><PencilLine size={16} /></Btn>
              <Btn tone="ghost" aria-label={`Xoá mã ${m}`} onClick={() => {
                if (!confirm(`Xoá đáp án mã đề ${m}?`)) return;
                ctl.mutate((s) => { delete s.keys[m]; delete s.key_source[m]; s.graded = false; });
              }}><Trash2 size={16} /></Btn>
            </li>
          ))}
        </ul>
        <details className="px-4 pb-2"><summary className="cursor-pointer text-xs text-slate-500">Xem dạng chữ</summary>
          <pre className="whitespace-pre-wrap py-2 font-mono text-xs leading-relaxed">{encodeKeysText(s.keys)}</pre>
        </details>
        <p className="px-4 pb-4 text-xs text-slate-500">Tổng: {mades.reduce((a, m) => a + keyCount(s.keys[m]), 0)} câu. Nguồn: {[...new Set(Object.values(s.key_source))].join(", ")}</p>
      </Modal>

      {manual !== false && <ManualKeyModal
        open onClose={() => setManual(false)} keys={s.keys} editMade={typeof manual === "string" ? manual : undefined}
        onSave={(made, key) => ctl.mutate((s) => {
          s.keys[made] = key;
          s.key_source[made] = "Nhập tay";
          s.key_errors = s.key_errors.filter((e) => !e.startsWith(`Mã đề ${made} `));
          s.graded = false;
        })}
      />}

      {qr && <QrScan onClose={() => setQr(false)} onText={(t) => { setQr(false); fromText(t, "QR"); }} />}
    </div>
  );
}
