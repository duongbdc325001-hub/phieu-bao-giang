# Chấm bài trắc nghiệm (menu “Chấm bài”)

Chấm phiếu trắc nghiệm bằng camera điện thoại, ngay trong web. Dùng **nguyên lõi C++ của app Android chấm trắc nghiệm v1.5.3**
(biên dịch sang WebAssembly), nên kết quả **giống hệt app**. Chạy trên Android Chrome, iPhone Safari (iOS 15.2+) và máy tính.
Ảnh phiếu xử lý trên máy người dùng, không gửi lên server, không tốn tài nguyên Vercel.

## Dùng
1. Menu **Chấm bài** → **Bài chấm mới**. Hoặc ở **Đảo đề**, tạo mã đề xong bấm **✅ Chấm bài này** để vào thẳng với đáp án sẵn.
2. 5 bước giống app:
   - ① Đáp án: **nhập tay** (chạm chọn A/B/C/D, Đ/S, gõ số phần III; sửa / chép sang mã khác), dán chữ / Excel / QR, danh sách lớp, thang điểm.
   - ② Chụp: camera tự chụp khi phiếu đứng yên, hoặc chọn ảnh có sẵn.
   - ③ Soát SBD / mã đề.
   - ④ Soát câu lỗi.
   - ⑤ Điểm: xuất Excel 6 trang và ảnh đã chấm.
3. Mẫu phiếu tự nhận khi chấm (`public/omr/templates/`):
   - **Phiếu 40 câu Cục QLCL** (40-8-6, có ô Giám thị 1, 2; `phieu_40_8_6_gt`): đọc được cả bản in màu hồng gốc
     (`print/phieu_40_8_6_cuc_qlcl.pdf`) lẫn bản photo đen trắng. Toạ độ đo từ phiếu quét thật, khớp PDF gốc (lệch < 1,6pt).
   - **Phiếu Toán 12-4-6 thi THPT không phách** (`phieu_toan_12_4_6`, `print/phieu_toan_12_4_6.pdf`): SBD 3 số, mã đề 3 số.
     Mã đề 3 số trên phiếu tự khớp với đáp án dù đáp án ghi 101 hay 0101.
   - 40-8-6 và 32-6-12 của app (PDF để in: `public/omr/print/`).

## Các phần đã thêm
| Đường dẫn | Nội dung |
|---|---|
| `src/app/dashboard/cham-bai/` | Trang danh sách bài chấm và trang chấm `[id]` |
| `src/components/cham-bai/` | Giao diện: camera, soát lỗi, kết quả |
| `src/lib/omr/` | Đọc đáp án, chấm điểm, xuất Excel (dịch sát `session.dart`, `keys.dart`, `export.dart`), gọi lõi, lưu IndexedDB, nối đảo đề |
| `public/omr/` | Lõi `omr.wasm` + `omr.js`, worker, service worker (chấm khi mất mạng), mẫu phiếu, PDF in phiếu, file mẫu |
| `public/dao-de.html` | Thêm nút “✅ Chấm bài này” |
| `src/app/dashboard/layout.tsx` | Thêm mục menu “Chấm bài” |
| `next.config.ts` | Header cho service worker và bộ nhớ đệm lõi |
| `wasm/` | Mã nguồn C++ để build lại lõi (xem `wasm/README_WASM.md`) |
| `test/` | 25 kiểm thử (port từ `core_test.dart` + nối đảo đề): `npm test` |
| `supabase/migrations/` | (tuỳ chọn) bảng `cham_bai` để đồng bộ điểm |

## Theo app v1.7.2
- Lõi C++ 1.7.2 (đã gắn phần tăng tốc, kết quả trùng khít lõi app trên 61 ảnh): tìm ô mốc bị máy scan làm rỗ hạt,
  phiếu mất 1 góc, SBD / mã đề tô nhạt. Đọc thêm được 4 ảnh scan mà lõi cũ không đọc được.
- Mẫu phiếu **50-10-12** (`phieu_50_10_12`): SBD 8 số, mã đề 4 số.
- ① Đáp án → **Mẫu phiếu**: tự nhận ở phiếu đầu rồi khoá (mặc định) / chỉ 1 mẫu / thử tất cả. Phiếu khác mẫu đang khoá
  tự được đọc lại với mọi mẫu (web không giữ ảnh gốc nên không có nút "Đọc lại" như app).
- ① Đáp án → **Mức soát** Nhanh / Vừa / Kỹ (như app 1.6). Bài chấm mới dùng mức chọn gần nhất.
- Xem đáp án: sửa / xoá từng mã đề.
- Camera **đọc xong mới chuyển phiếu** (mặc định bật, biểu tượng ✓ xanh; bấm để chuyển sang ⚡ chụp nhanh):
  đọc được thì bíp 1 tiếng; không đọc được thì kêu 2 tiếng trầm, bỏ ảnh hỏng, tự chụp lại; 3 lần liền lỗi thì giữ phiếu lỗi
  và thôi tự chụp tới khi phiếu được lấy ra.

## Tốc độ
- Lõi bản SIMD (Chrome 91+, Safari 16.4+) nhanh ~2 lần bản thường; trình duyệt tự chọn.
- Máy mạnh (Chrome báo từ 8 GB RAM, từ 6 nhân) chấm **2 phiếu song song** khi có phiếu chờ; luồng phụ rảnh 60 giây thì tắt
  để trả bộ nhớ. Máy 4 GB và iPhone giữ 1 luồng (mỗi luồng ~330 MB bộ nhớ).

## Lưu trữ
Mặc định bài chấm lưu trong trình duyệt (IndexedDB) của máy đã chấm. Chấm được khi mất mạng, nhưng máy khác không thấy.
Muốn đồng bộ lên tài khoản:
1. Chạy `supabase/migrations/20261103_cham_bai.sql` trong Supabase SQL Editor. Bảng có RLS, mỗi giáo viên chỉ thấy bài của mình.
2. Trong `src/app/dashboard/cham-bai/[id]/page.tsx`, đổi thành:
   ```tsx
   import { createClient } from "@/lib/supabase/client";
   import { pushSession } from "@/lib/omr/cloud";
   // ...
   return <SessionView id={id} onSaved={(s) => pushSession(createClient(), s)} />;
   ```
Chỉ gửi kết quả (vài chục KB/bài), không gửi ảnh.

## Lưu ý
- Camera cần **https** (Vercel có sẵn). Thử trên điện thoại khi dev: `next dev --webpack --experimental-https`.
- Lần đầu mở trang tải lõi khoảng 1,4 MB (đã nén), sau đó trình duyệt giữ lại.
- iPhone không bật được đèn flash từ web.
- Safari có thể xoá dữ liệu web lâu không mở, nên chấm xong hãy xuất Excel.
- Sửa lõi C++ ở app thì chép `omr_core.cpp`, `omr_api.h` vào `wasm/` rồi chạy `wasm/build.sh`.
