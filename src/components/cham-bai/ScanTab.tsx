"use client";
// ② Chụp / chọn ảnh phiếu (như scan_tab.dart).
import { Camera, ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { type Ctl, classify } from "@/lib/omr/controller";
import { sbdShown, soatFlags, studentName, type SheetRec } from "@/lib/omr/session";
import { CameraScan } from "./CameraScan";
import { WholeSheet } from "./BubbleView";
import { ACCEPT, sourcesFromFile } from "@/lib/omr/sources";
import { Badge, Btn, Card, Modal, toast } from "./ui";

export function ScanTab({ ctl }: { ctl: Ctl }) {
  const s = ctl.s!;
  const fileIn = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState(false);
  const [show, setShow] = useState<SheetRec | null>(null);
  const noKeys = Object.keys(s.keys).length === 0;

  const [opening, setOpening] = useState(false);
  const onFiles = async (fs: FileList | null) => {
    setOpening(true);
    try {
      for (const f of [...(fs ?? [])]) {
        try {
          const srcs = await sourcesFromFile(f);
          if (!srcs.length) toast(`${f.name}: không có trang nào`, true);
          for (const src of srcs) ctl.addSource(src.name, src.load);
          if (srcs.length > 1) toast(`${f.name}: ${srcs.length} trang`);
        } catch (e) {
          toast(`Không mở được ${f.name}: ${(e as Error).message}`, true);
        }
      }
    } finally { setOpening(false); }
  };

  const list = [...s.sheets].reverse();
  const nOk = s.sheets.filter((x) => !x.dropped && x.ok).length;
  return (
    <div className="space-y-4">
      {noKeys && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Chưa có đáp án – vẫn chụp được, nạp đáp án sau ở bước ①.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Btn tone="primary" className="py-4 text-base" onClick={() => setCam(true)}><Camera size={22} />Chụp bằng camera</Btn>
        <Btn className="py-4 text-base" disabled={opening} onClick={() => fileIn.current?.click()}>
          {opening ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}Chọn ảnh / PDF scan
        </Btn>
      </div>
      <input ref={fileIn} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      <Card
        title={`Phiếu đã thêm · ${nOk} đọc được / ${s.sheets.length}`}
        right={ctl.reading > 0 && <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" />Đang đọc {ctl.reading}</span>}
      >
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có phiếu. Chụp thẳng, đủ sáng, thấy đủ 4 ô vuông đen ở góc phiếu. Hoặc chọn ảnh / file scan (JPG, PNG, PDF, TIFF – PDF/TIFF nhiều trang thì mỗi trang 1 phiếu).</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((sh) => {
              const pending = !sh.ok && sh.error == null;
              const c = classify(s, sh);
              const name = sh.ok && sbdShown(s, sh) ? studentName(s, sh.sbd) : null;
              return (
                <li key={sh.id} className={`flex items-center gap-3 py-2 ${sh.dropped ? "opacity-50" : ""}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${pending ? "bg-slate-300" : c === "good" ? "bg-emerald-500" : c === "warn" ? "bg-amber-500" : "bg-red-500"}`} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => sh.has_warped && setShow(sh)}>
                    <div className="truncate text-sm font-medium">
                      {pending ? "Đang đọc…" : sh.ok ? (sbdShown(s, sh) ? `SBD ${sh.sbd} · Mã ${sh.made}` : `Mã ${sh.made} · ${sh.name}`) : "Không đọc được"}
                      {name && <span className="font-normal text-slate-500"> · {name}</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {sh.ok ? `${sh.tpl_name}${soatFlags(s, sh).length ? ` · ${soatFlags(s, sh).length} chỗ cần soát` : ""}` : sh.error ?? sh.name}
                    </div>
                  </button>
                  {sh.dropped ? (
                    <Btn tone="ghost" title="Khôi phục" onClick={() => ctl.restore(sh)}><RotateCcw size={16} /></Btn>
                  ) : sh.grade ? (
                    <Badge tone="green">{sh.grade.tong.toFixed(2)}</Badge>
                  ) : null}
                  <Btn tone="ghost" title="Xoá ảnh" disabled={pending} onClick={() => { if (confirm(`Xoá phiếu ${sh.ok ? `SBD ${sh.sbd}` : sh.name}?`)) ctl.remove(sh); }}>
                    <Trash2 size={16} />
                  </Btn>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {cam && <CameraScan ctl={ctl} onClose={() => setCam(false)} />}
      <Modal open={!!show} onClose={() => setShow(null)} title={show?.ok && sbdShown(s, show) ? `SBD ${show.sbd} · Mã ${show.made}` : show?.ok ? `Mã ${show.made} · ${show.name}` : show?.name} full>
        {show && <WholeSheet sid={s.id} sh={show} />}
      </Modal>
    </div>
  );
}
