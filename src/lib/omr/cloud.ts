"use client";
// Đồng bộ bài chấm lên Supabase (tuỳ chọn). Ảnh phiếu KHÔNG gửi lên – chỉ gửi kết quả (~vài chục KB/bài).
// Cách dùng (trong app của bạn):
//   import { createClient } from "@/lib/supabase/client";   // đường dẫn client Supabase sẵn có của bạn
//   <SessionView id={id} onSaved={(s) => pushSession(createClient(), s)} />
import type { Session } from "./session";
import { statsOf } from "./export";

// Kiểu tối thiểu, để không phụ thuộc phiên bản @supabase/supabase-js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/** Lưu/ghi đè 1 bài chấm lên bảng public.cham_bai (xem supabase/migrations). */
export async function pushSession(sb: Sb, s: Session) {
  const st = statsOf(s);
  const { error } = await sb.from("cham_bai").upsert({
    id: s.id, name: s.name, so_phieu: st.n, diem_tb: st.mean, graded_at: s.graded_at,
    data: s, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Danh sách bài chấm đã đồng bộ (để mở lại trên máy khác). */
export async function listCloud(sb: Sb): Promise<{ id: string; name: string; so_phieu: number; diem_tb: number | null; updated_at: string }[]> {
  const { data, error } = await sb.from("cham_bai").select("id,name,so_phieu,diem_tb,updated_at").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Lấy 1 bài chấm từ máy chủ (không kèm ảnh phiếu). */
export async function pullSession(sb: Sb, id: string): Promise<Session | null> {
  const { data, error } = await sb.from("cham_bai").select("data").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const s = data.data as Session;
  for (const sh of s.sheets) sh.has_warped = false; // ảnh chỉ có ở máy đã chụp
  return s;
}
