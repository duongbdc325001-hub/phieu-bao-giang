-- Lưu dữ liệu theo NĂM HỌC (giữ lại tất cả các năm học cũ).
-- - Bảng school_years: admin nhập ngày bắt đầu tuần 1 của mỗi năm học (trang Quản trị).
-- - Cột school_year cho schedule_entries, lesson_overrides, class_curriculums.
--   Dữ liệu đang có tự được gán vào năm học 2026-2027 (giá trị mặc định), không mất dòng nào.
-- - Ràng buộc không trùng của lesson_overrides thêm school_year để mỗi năm có cắt/đảo tiết riêng.
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run. Chạy lại nhiều lần cũng không sao.
-- Cần có hàm public.is_admin() (đã tạo ở 20261125_bao_ve_profiles.sql).

begin;

-- 1) Bảng năm học
create table if not exists public.school_years (
  id          text primary key,                                   -- '2026-2027'
  start_date  date not null,                                      -- thứ Hai của tuần 1
  weeks       int  not null default 35 check (weeks between 1 and 60),
  created_at  timestamptz not null default now()
);

alter table public.school_years enable row level security;

drop policy if exists school_years_select on public.school_years;
create policy school_years_select on public.school_years
  for select to authenticated using (true);

drop policy if exists school_years_insert on public.school_years;
create policy school_years_insert on public.school_years
  for insert to authenticated with check (public.is_admin());

drop policy if exists school_years_update on public.school_years;
create policy school_years_update on public.school_years
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.school_years (id, start_date, weeks)
values ('2026-2027', '2026-09-07', 35)
on conflict (id) do nothing;

-- 2) Cột năm học (dòng cũ nhận giá trị mặc định 2026-2027)
alter table public.schedule_entries  add column if not exists school_year text not null default '2026-2027';
alter table public.lesson_overrides  add column if not exists school_year text not null default '2026-2027';
alter table public.class_curriculums add column if not exists school_year text not null default '2026-2027';

-- 3) Cắt/đảo tiết: không trùng trong CÙNG năm học
alter table public.lesson_overrides
  drop constraint if exists lesson_overrides_class_id_week_number_slot_order_in_week_key;
alter table public.lesson_overrides
  drop constraint if exists lesson_overrides_class_year_week_slot_key;
alter table public.lesson_overrides
  add constraint lesson_overrides_class_year_week_slot_key
  unique (class_id, school_year, week_number, slot_order_in_week);

-- 4) Chỉ mục cho truy vấn theo năm học
create index if not exists idx_schedule_entries_user_year_week
  on public.schedule_entries (user_id, school_year, week_number);
create index if not exists idx_class_curriculums_year
  on public.class_curriculums (school_year, class_id);
drop index if exists public.idx_lesson_overrides_lookup;
create index if not exists idx_lesson_overrides_year_lookup
  on public.lesson_overrides (school_year, class_id, week_number);

commit;

-- Kiểm tra sau khi chạy (tuỳ chọn):
-- select school_year, count(*) from public.schedule_entries group by 1;
-- select * from public.school_years;
