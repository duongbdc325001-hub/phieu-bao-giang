-- Admin xoá vĩnh viễn một giáo viên: dữ liệu của người đó (TKB, gán PPCT, cắt/đảo/nghỉ tiết, lớp, khung PPCT)
-- + hồ sơ + tài khoản đăng nhập. Chỉ admin gọi được, không tự xoá chính mình.
-- (Khoá tài khoản không cần SQL: dùng cột status = 'locked' sẵn có.)
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run. Chạy lại nhiều lần cũng không sao.

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  t text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được xoá thành viên';
  end if;
  if p_user = auth.uid() then
    raise exception 'Không thể tự xoá tài khoản của chính mình';
  end if;

  -- Xoá dữ liệu ở các bảng có cột user_id (theo thứ tự để không vướng khoá ngoại)
  for t in
    select x.tbl
    from unnest(array['lesson_overrides', 'class_curriculums', 'schedule_entries',
                      'curriculum_items', 'classes', 'curriculum_templates', 'cham_bai']) with ordinality as x(tbl, ord)
    where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = x.tbl and c.column_name = 'user_id')
    order by x.ord
  loop
    execute format('delete from public.%I where user_id = $1', t) using p_user;
  end loop;

  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
