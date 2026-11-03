"use client";
// ⑤ Điểm: bảng điểm, thống kê, xuất Excel 6 trang + ảnh đã chấm (như results_tab.dart).
import { Download, FileSpreadsheet, Images, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Ctl } from "@/lib/omr/controller";
import { omr } from "@/lib/omr/engine";
import { buildResultXlsx, gradedImageName, gradedSpec, questionColumns, sortedActive, statsOf } from "@/lib/omr/export";
import { getImage } from "@/lib/omr/store";
import { type Session, type SheetRec, idQueue, qQueue, readyToGrade, studentName } from "@/lib/omr/session";
import { Badge, Btn, Card, Modal, downloadBytes, toast } from "./ui";

// Tên file không dấu: một số trình duyệt đổi tên file có dấu thành "download".
const safeName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "bai_cham";

async function gradedImage(s: Session, sh: SheetRec): Promise<Uint8Array | null> {
  const b = await getImage(s.id, sh.id);
  if (!b || !sh.grade) return null;
  return omr().annotate(new Uint8Array(await b.arrayBuffer()), gradedSpec(s, sh));
}

export function ResultsTab({ ctl }: { ctl: Ctl }) {
  const s = ctl.s!;
  const [busy, setBusy] = useState<string | null>(null);
  const [show, setShow] = useState<SheetRec | null>(null);
  const noKeys = !Object.keys(s.keys).length;
  const nId = idQueue(s).length, nQ = qQueue(s).length;

  if (noKeys || !readyToGrade(s) || !s.graded) {
    return (
      <Card title="Chưa chấm được">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {noKeys && <li>Chưa có đáp án (bước ①)</li>}
          {!s.sheets.some((x) => !x.dropped && x.ok) && <li>Chưa có phiếu đọc được (bước ②)</li>}
          {nId > 0 && <li>Còn {nId} phiếu cần soát SBD / mã đề (bước ③)</li>}
          {nQ > 0 && <li>Còn {nQ} câu cần soát (bước ④)</li>}
        </ul>
      </Card>
    );
  }

  const sheets = sortedActive(s);
  const st = statsOf(s);
  const qcols = questionColumns(s);
  const hard = qcols
    .map((k) => {
      const v = sheets.filter((sh) => sh.grade!.detail[k]).map((sh) => sh.grade!.detail[k][2]);
      return { k, n: v.length, pct: v.length ? (100 * v.filter(Boolean).length) / v.length : 100 };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 8);
  const maxH = Math.max(1, ...st.hist);

  const exportXlsx = async () => {
    setBusy("xlsx");
    try {
      const bytes = await buildResultXlsx(s);
      downloadBytes(bytes, `ket_qua_cham_${safeName(s.name)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (e) { toast(`Lỗi xuất Excel: ${(e as Error).message}`, true); }
    setBusy(null);
  };
  const exportImages = async () => {
    setBusy("zip");
    try {
      const { zipSync } = await import("fflate");
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (const sh of sheets) {
        const jpg = await gradedImage(s, sh);
        if (jpg) files[`anh_da_cham/${gradedImageName(sh)}`] = [jpg, { level: 0 }];
      }
      downloadBytes(zipSync(files), `anh_da_cham_${safeName(s.name)}.zip`, "application/zip");
    } catch (e) { toast(`Lỗi tạo ảnh: ${(e as Error).message}`, true); }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Btn tone="primary" className="py-3" onClick={exportXlsx} disabled={!!busy}>
          {busy === "xlsx" ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}Xuất Excel
        </Btn>
        <Btn className="py-3" onClick={exportImages} disabled={!!busy}>
          {busy === "zip" ? <Loader2 size={18} className="animate-spin" /> : <Images size={18} />}Ảnh đã chấm (.zip)
        </Btn>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[["Phiếu", st.n], ["TB", st.mean?.toFixed(2)], ["Cao", st.max?.toFixed(2)], ["Thấp", st.min?.toFixed(2)]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-slate-200 bg-white py-2">
            <div className="text-lg font-semibold">{v ?? "—"}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      <Card title="Bảng điểm">
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2">SBD · Họ tên</th><th className="py-2">Mã</th>
                <th className="px-1 py-2 text-right">I</th><th className="px-1 py-2 text-right">II</th><th className="px-1 py-2 text-right">III</th>
                <th className="px-4 py-2 text-right">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((sh) => (
                <tr key={sh.id} className="cursor-pointer border-b border-slate-100 hover:bg-emerald-50/50" onClick={() => setShow(sh)}>
                  <td className="px-4 py-2">
                    <div className="font-mono">{sh.sbd}{Object.keys(sh.edits).length > 0 && <span className="ml-1 font-sans text-xs text-amber-600">✎{Object.keys(sh.edits).length}</span>}</div>
                    {studentName(s, sh.sbd) && <div className="max-w-[9rem] truncate text-xs text-slate-500 sm:max-w-none">{studentName(s, sh.sbd)}</div>}
                  </td>
                  <td className="py-2 font-mono">{sh.made}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{sh.grade!.p1.toFixed(2)}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{sh.grade!.p2.toFixed(2)}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{sh.grade!.p3.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-700">{sh.grade!.tong.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Phổ điểm">
        <div className="flex h-28 items-end gap-1">
          {st.hist.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{n || ""}</span>
              <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(n / maxH) * 80}px` }} />
              <span className="text-[10px] text-slate-500">{i}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Câu nhiều học sinh sai">
        <ul className="space-y-1.5 text-sm">
          {hard.map((x) => (
            <li key={x.k} className="flex items-center gap-2">
              <span className="w-14 font-mono">{x.k}</span>
              <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-500" style={{ width: `${x.pct}%` }} /></div>
              <span className="w-12 text-right text-xs text-slate-600">{x.pct.toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={!!show} onClose={() => setShow(null)} full
        title={show && <span>SBD {show.sbd} · Mã {show.made} · <Badge tone="green">{show.grade?.tong.toFixed(2)}</Badge></span>}>
        {show && <GradedView s={s} sh={show} />}
      </Modal>
    </div>
  );
}

function GradedView({ s, sh }: { s: Session; sh: SheetRec }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let u: string | null = null, alive = true;
    gradedImage(s, sh).then((jpg) => {
      if (!alive) return;
      if (!jpg) { setUrl(null); return; }
      u = URL.createObjectURL(new Blob([jpg as BlobPart], { type: "image/jpeg" }));
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [s, sh]);
  return (
    <div className="space-y-2 p-2">
      <p className="px-2 text-xs text-slate-500">Xanh lá: đúng · Đỏ: sai · Vòng xanh dương: đáp án đúng</p>
      {url === undefined ? <p className="p-6 text-center text-sm text-slate-500"><Loader2 className="mx-auto animate-spin" /></p>
        // eslint-disable-next-line @next/next/no-img-element
        : url ? <img src={url} alt="Phiếu đã chấm" className="mx-auto w-full max-w-2xl" />
        : <p className="p-6 text-center text-sm text-slate-500">Không có ảnh</p>}
      {url && <div className="flex justify-center pb-3"><Btn onClick={() => { fetch(url).then((r) => r.blob()).then((b) => downloadBytes(b, gradedImageName(sh))); }}><Download size={16} />Tải ảnh</Btn></div>}
    </div>
  );
}
