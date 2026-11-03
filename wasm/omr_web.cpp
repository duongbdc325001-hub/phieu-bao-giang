// Lớp nối cho bản web (WebAssembly). Dùng nguyên lõi omr_core.cpp của app điện thoại / máy tính,
// chỉ thêm vài hàm nhận ảnh RGBA từ <canvas> (trình duyệt không có kênh Y/BGR như camera điện thoại).
#include "omr_core.cpp"
#include <emscripten/emscripten.h>

static cv::Mat rgba_to_bgr(const unsigned char* rgba, int w, int h, int max_side) {
    cv::Mat m(h, w, CV_8UC4, (void*)rgba), img;
    cv::cvtColor(m, img, cv::COLOR_RGBA2BGR);
    int s = std::max(img.cols, img.rows);
    if (max_side > 0 && s > max_side) {
        double f = (double)max_side / s;
        cv::resize(img, img, cv::Size(), f, f, cv::INTER_AREA);
    }
    return img;
}

extern "C" {

/* Chấm 1 khung hình RGBA (từ canvas). Giống omr_read2 nhưng không cần mã hoá JPEG trước. */
EMSCRIPTEN_KEEPALIVE char* omrw_read_rgba(const unsigned char* rgba, int w, int h, const char* template_id, int max_side,
                                          unsigned char** warped_jpg, int* warped_len) {
    cv::Mat img;
    try { img = rgba_to_bgr(rgba, w, h, max_side); } catch (...) {}
    return read_mat(img, template_id, warped_jpg, warped_len);
}

/* Dò nhanh phiếu trên khung RGBA nhỏ (~900 px). */
EMSCRIPTEN_KEEPALIVE char* omrw_detect_rgba(const unsigned char* rgba, int w, int h, int max_side) {
    cv::Mat g;
    try {
        cv::Mat m(h, w, CV_8UC4, (void*)rgba);
        cv::cvtColor(m, g, cv::COLOR_RGBA2GRAY);
    } catch (...) { return omr::dup_str("{\"found\":false}"); }
    return omr_detect(g.data, g.cols, g.rows, (int)g.step, 0, max_side);
}

/* Đọc QR đáp án trên khung RGBA. */
EMSCRIPTEN_KEEPALIVE char* omrw_qr_rgba(const unsigned char* rgba, int w, int h) {
    cv::Mat g;
    try {
        cv::Mat m(h, w, CV_8UC4, (void*)rgba);
        cv::cvtColor(m, g, cv::COLOR_RGBA2GRAY);
    } catch (...) { return omr_qr_decode(nullptr, 0, 0, 0); }
    return omr_qr_decode(g.data, g.cols, g.rows, (int)g.step);
}

}
