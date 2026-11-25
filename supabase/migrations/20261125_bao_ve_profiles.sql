-- Bảo vệ bảng profiles: giáo viên KHÔNG tự sửa được role / status / expiry_date của mình
-- (trước đây nếu policy cho phép user cập nhật dòng của mình thì có thể tự gia hạn hoặc tự lên admin
--  bằng cách gọi Supabase từ console trình duyệt).
-- Không đổi policy hiện có, chỉ thêm trigger kiểm tra, nên các chức năng khác giữ nguyên:
--   - Admin vẫn phê duyệt / gia hạn bình thường ở trang Quản trị.
--   - Trigger tạo profile khi đăng ký (chạy phía máy chủ, auth.uid() rỗng) không bị ảnh hưởng.
--   - Giáo viên vẫn sửa được các cột khác (họ tên, tổ bộ môn...) nếu policy cho phép.
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run. Chạy lại nhiều lần cũng không sao.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.profiles_chan_tu_sua_quyen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() rỗng = lệnh chạy từ máy chủ / SQL Editor / trigger đăng ký: cho qua
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'teacher' and new.role is not null then
      new.role := 'teacher';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.expiry_date is distinct from old.expiry_date then
    raise exception 'Chỉ quản trị viên mới được đổi quyền, trạng thái hoặc hạn sử dụng tài khoản';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_chan_tu_sua_quyen on public.profiles;
create trigger profiles_chan_tu_sua_quyen
  before insert or update on public.profiles
  for each row execute function public.profiles_chan_tu_sua_quyen();
