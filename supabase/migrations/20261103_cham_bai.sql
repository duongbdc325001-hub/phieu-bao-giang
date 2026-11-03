-- Bảng lưu bài chấm (tuỳ chọn – chỉ cần nếu muốn đồng bộ điểm lên tài khoản).
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run.
create table if not exists public.cham_bai (
  id          text primary key,                       -- id bài chấm (sinh trên máy)
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  so_phieu    int  not null default 0,
  diem_tb     numeric,
  graded_at   text,
  data        jsonb not null,                         -- toàn bộ phiên chấm (đáp án, phiếu, điểm, nhật ký sửa)
  updated_at  timestamptz not null default now()
);
create index if not exists cham_bai_owner_idx on public.cham_bai(owner_id, updated_at desc);

alter table public.cham_bai enable row level security;
drop policy if exists "cham_bai_owner" on public.cham_bai;
create policy "cham_bai_owner" on public.cham_bai
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
