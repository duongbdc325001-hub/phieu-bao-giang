# Chấm bài trắc nghiệm (menu “Chấm bài”)

Chấm phiếu trắc nghiệm bằng camera điện thoại, ngay trong web. Dùng **nguyên lõi C++ của app Android chấm trắc nghiệm v1.5.3**
(biên dịch sang WebAssembly), nên kết quả **giống hệt app**. Chạy trên Android Chrome, iPhone Safari (iOS 15.2+) và máy tính.
Ảnh phiếu xử lý trên máy người dùng, không gửi lên server, không tốn tài nguyên Vercel.

## Dùng
1. Menu **Chấm bài** → **Bài chấm mới**. Hoặc ở **Đảo đề**, tạo mã đề xong bấm **✅ Chấm bài này** để vào thẳng với đáp án sẵn.
2. 5 bước giống app:
   - ① Đáp án: dán chữ / Excel / QR, danh sách lớp, thang điểm.
   - ② Chụp: camera tự chụp khi phiếu đứng yên, hoặc chọn ảnh có sẵn.
   - ③ Soát SBD / mã đề.
   - ④ Soát câu lỗi.
   - ⑤ Điểm: xuất Excel 6 trang và ảnh đã chấm.
3. Mẫu phiếu tự nhận khi chấm (`public/omr/templates/`):
   - **40-8-6 mẫu phiếu thi có ô Giám thị 1, 2** (`phieu_40_8_6_gt`): đo từ phiếu quét thật của trường; SBD/mã đề in sẵn chữ số trong ô.
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
