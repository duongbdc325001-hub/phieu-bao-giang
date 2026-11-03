"use client";
// Danh sách bài chấm lưu trên máy.
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { omr } from "@/lib/omr/engine";
import { createSession, keysFromDaoDe, takeDaoDePayload } from "@/lib/omr/daoDe";
import { type SessionSummary, deleteSession, listSessions, persist } from "@/lib/omr/store";
import { BASE_PATH } from "./SessionView";
import { Badge, Btn, Card } from "./ui";

export function SessionList() {
  const router = useRouter();
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const reload = () => listSessions().then(setList).catch(() => setList([]));
  useEffect(() => {
    // vừa bấm "Chấm bài này" ở trang Đảo đề -> tạo bài chấm có sẵn đáp án rồi mở luôn
    const p = takeDaoDePayload();
    if (p) {
      const { keys, errors } = keysFromDaoDe(p);
      const d = new Date();
      createSession(`${p.name || "Đề"} (${d.getDate()}/${d.getMonth() + 1})`, keys, `Đảo đề: ${p.name || ""}`.trim(), errors)
        .then((id) => router.replace(`${BASE_PATH}/${id}`));
      return;
    }
    reload();
    persist();
    omr().init().catch(() => {}); // tải sẵn lõi chấm (lần đầu ~4 MB, sau đó trình duyệt giữ lại)
  }, [router]);

  const create = async () => {
    const d = new Date();
    const name = prompt("Tên bài chấm (ví dụ: KT 15p Toán 12A1)", `Bài chấm ${d.getDate()}/${d.getMonth() + 1}`)?.trim();
    if (!name) return;
    const id = await createSession(name);
    router.push(`${BASE_PATH}/${id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3 border-b pb-3">
        <ClipboardCheck className="hidden text-emerald-600 sm:block" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black leading-tight text-slate-900 sm:text-2xl">Chấm trắc nghiệm</h1>
          <p className="mt-0.5 text-xs text-slate-500">Chụp phiếu bằng camera điện thoại, chấm ngay trên máy</p>
        </div>
        <Btn tone="primary" className="shrink-0" onClick={create}><Plus size={18} />Bài chấm mới</Btn>
      </div>
      <Card>
        {list == null ? <p className="text-sm text-slate-500">Đang tải…</p>
          : list.length === 0 ? (
            <div className="space-y-2 py-4 text-center text-sm text-slate-600">
              <p>Chưa có bài chấm nào.</p>
              <p className="text-xs text-slate-500">In phiếu: <a className="text-emerald-700 underline" href="/omr/print/phieu_40_8_6_den_trang.pdf" target="_blank">40-8-6</a> · <a className="text-emerald-700 underline" href="/omr/print/phieu_32_6_12_v2_den_trang.pdf" target="_blank">32-6-12</a></p>
            </div>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {list.map((x) => (
                <li key={x.id} className="flex items-center gap-2 py-2">
                  <Link href={`${BASE_PATH}/${x.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{x.name}</div>
                    <div className="text-xs text-slate-500">{x.sheets} phiếu · {x.updated}</div>
                  </Link>
                  {x.graded && <Badge tone="green">Đã chấm</Badge>}
                  <Btn tone="ghost" aria-label="Xoá" onClick={async () => { if (confirm(`Xoá bài chấm “${x.name}” và toàn bộ ảnh?`)) { await deleteSession(x.id); reload(); } }}>
                    <Trash2 size={16} />
                  </Btn>
                </li>
              ))}
            </ul>
          )}
      </Card>
      <p className="text-center text-xs text-slate-500">Bài chấm lưu ngay trên máy này, chấm được cả khi mất mạng.</p>
    </div>
  );
}
