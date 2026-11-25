-- Dọn các tiết TKB bị chép trùng (do bản cũ tự chép tuần khi mở trang, mở 2 lần liền là chép 2 lần).
-- Chỉ xoá những dòng TRÙNG HOÀN TOÀN (cùng người, cùng tuần, thứ, tiết, lớp, cùng loại dạy thay),
-- mỗi nhóm giữ lại 1 dòng. Không đụng tới dòng nào khác.
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run.

-- 1) Xem trước sẽ xoá bao nhiêu dòng (chạy riêng câu này nếu muốn kiểm tra):
-- select count(*) from (
--   select ctid, row_number() over (
--     partition by user_id, week_number, day_of_week, period_number, class_id, coalesce(is_substitute, false)
--     order by ctid) as rn
--   from public.schedule_entries) t
-- where rn > 1;

-- 2) Xoá bản trùng
delete from public.schedule_entries
where ctid in (
  select ctid from (
    select ctid, row_number() over (
      partition by user_id, week_number, day_of_week, period_number, class_id, coalesce(is_substitute, false)
      order by ctid) as rn
    from public.schedule_entries
  ) t
  where rn > 1
);
