/* Lõi chấm phiếu trắc nghiệm – API C (dùng chung cho máy tính, Android, iOS). */
#ifndef OMR_API_H
#define OMR_API_H

#ifdef _WIN32
#  ifdef OMR_BUILD
#    define OMR_API __declspec(dllexport)
#  else
#    define OMR_API __declspec(dllimport)
#  endif
#else
#  define OMR_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Phiên bản API. */
OMR_API int omr_version(void);

/* Nạp 1 mẫu phiếu: nội dung file *_toado.json (UTF-8) và (tùy chọn) ảnh *_ref.png.
   Trả về số mẫu đang có, -1 nếu lỗi. Gọi lại với cùng template id thì thay mẫu cũ. */
OMR_API int omr_add_template(const char* json_text, const unsigned char* ref_png, int ref_len);
OMR_API void omr_clear_templates(void);

/* Chấm 1 ảnh (nội dung file JPG/PNG). template_id = NULL/"" -> tự nhận mẫu.
   Trả về chuỗi JSON (giải phóng bằng omr_free). Nếu warped_jpg != NULL: ảnh phiếu đã nắn (JPEG),
   giải phóng bằng omr_free. */
OMR_API char* omr_read(const unsigned char* data, int len, const char* template_id,
                       unsigned char** warped_jpg, int* warped_len);

/* Như omr_read nhưng nhận ảnh BGR 8 bit đã giải mã (stride = số byte mỗi hàng). */
OMR_API char* omr_read_bgr(const unsigned char* bgr, int width, int height, int stride, const char* template_id,
                           unsigned char** warped_jpg, int* warped_len);

OMR_API void omr_free(void* p);

/* ---- API v2 (app điện thoại) ---- */
/* Cấp bộ nhớ để truyền dữ liệu vào lõi; giải phóng bằng omr_free. */
OMR_API void* omr_alloc(int n);

/* Như omr_read, nhưng nếu cạnh dài ảnh > max_side thì thu nhỏ trước khi đọc (max_side <= 0: giữ nguyên). */
OMR_API char* omr_read2(const unsigned char* data, int len, const char* template_id, int max_side,
                        unsigned char** warped_jpg, int* warped_len);

/* Dò nhanh phiếu trong 1 khung hình xám (kênh Y của camera). rotate_deg: 0/90/180/270 (xoay về hướng hiển thị).
   Trả JSON {"found":bool,"corners":[[x,y]x4 TL,TR,BR,BL, tỉ lệ 0..1],"template_id","markers","sharp",...}. */
OMR_API char* omr_detect(const unsigned char* gray, int width, int height, int stride, int rotate_deg, int max_side);

/* Vẽ vòng tròn/chữ lên ảnh JPEG, trả về JPEG mới (giải phóng bằng omr_free). Xem omr_core.cpp cho dạng spec. */
OMR_API unsigned char* omr_annotate(const unsigned char* jpg, int len, const char* spec, int* out_len);

/* ---- API v3: QR đáp án ---- */
/* Đọc QR trên ảnh xám (khung camera) / trên file ảnh. Trả JSON {"found":bool,"text":"..."} (omr_free). */
OMR_API char* omr_qr_decode(const unsigned char* gray, int width, int height, int stride);
OMR_API char* omr_qr_decode_image(const unsigned char* data, int len);
/* Tạo ảnh PNG mã QR (mỗi ô module_px điểm ảnh, có lề trắng). Giải phóng bằng omr_free. */
OMR_API unsigned char* omr_qr_encode(const char* text, int module_px, int* out_len);

#ifdef __cplusplus
}
#endif
#endif
