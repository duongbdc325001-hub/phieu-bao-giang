-- ĐÃ CHẠY trên Supabase ngày 25/11/2026.
-- Khoá bảng profiles: bỏ 2 policy mở cho mọi người (đọc/sửa = true), chỉ admin xem/sửa hồ sơ người khác;
-- trigger chặn đổi role/status/expiry_date và xoá hồ sơ từ web (kể cả người chưa đăng nhập), trừ admin.
begin;

drop policy if exists "Cho phép đọc profiles" on public.profiles;
drop policy if exists "Cho phép cập nhật profiles" on public.profiles;

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select to authenticated using (public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.profiles_chan_tu_sua_quyen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Chỉ quản trị viên mới được xóa hồ sơ';
  end if;
  if tg_op = 'INSERT' then
    if new.role is not null and new.role <> 'teacher' then new.role := 'teacher'; end if;
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.expiry_date is distinct from old.expiry_date then
    raise exception 'Chỉ quản trị viên mới được đổi quyền, trạng thái hoặc hạn sử dụng';
  end if;
  return new;
end; $$;

drop trigger if exists profiles_chan_tu_sua_quyen on public.profiles;
create trigger profiles_chan_tu_sua_quyen before insert or update or delete on public.profiles
  for each row execute function public.profiles_chan_tu_sua_quyen();

commit;
