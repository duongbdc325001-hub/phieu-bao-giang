-- Thống kê sử dụng cho trang Quản trị (chỉ admin gọi được, chỉ trả về con số, không lộ nội dung).
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run. Chạy lại nhiều lần cũng không sao.

create or replace function public.admin_usage(p_year text)
returns table (
  user_id uuid,
  last_sign_in_at timestamptz,
  so_lop int,
  so_tiet int,
  so_khung int,
  lop_chua_ppct int,
  so_dieu_chinh int,
  hoat_dong_gan_nhat timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    u.last_sign_in_at,
    (select count(distinct se.class_id)::int from public.schedule_entries se
      where se.user_id = p.id and se.school_year = p_year),
    (select count(*)::int from public.schedule_entries se
      where se.user_id = p.id and se.school_year = p_year),
    (select count(*)::int from public.curriculum_templates ct where ct.user_id = p.id),
    (select count(distinct se.class_id)::int from public.schedule_entries se
      where se.user_id = p.id and se.school_year = p_year and se.class_id is not null
        and not exists (select 1 from public.class_curriculums cc
                        where cc.class_id = se.class_id and cc.school_year = p_year)),
    (select count(*)::int from public.lesson_overrides lo
      where lo.user_id = p.id and lo.school_year = p_year),
    greatest(
      (select max(se.created_at) from public.schedule_entries se where se.user_id = p.id),
      (select max(lo.updated_at) from public.lesson_overrides lo where lo.user_id = p.id),
      (select max(cc.created_at) from public.class_curriculums cc where cc.user_id = p.id)
    )
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.is_admin();   -- không phải admin thì không nhận được dòng nào
$$;

revoke all on function public.admin_usage(text) from public, anon;
grant execute on function public.admin_usage(text) to authenticated;
