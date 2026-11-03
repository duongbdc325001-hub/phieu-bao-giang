// Lõi chấm phiếu trắc nghiệm – bản C++ của omr_engine.py (dịch sát từng bước).
// API C ở cuối file (omr_api.h).
#include "omr_api.h"
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/calib3d.hpp>
#include <opencv2/objdetect.hpp>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <numeric>
#include <regex>
#include <set>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>

using json = nlohmann::ordered_json;
using std::string;
using std::vector;

namespace omr {

static const double S = 3.0;
static const bool P3_DARKEST = true;
static const bool DARKEST_RULE = true;
static const double COVER_T[8] = {0.04, 0.06, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30};
static const int NC = 8;

struct SheetError : std::runtime_error {
    explicit SheetError(const string& m) : std::runtime_error(m) {}
};

// ------------------------------------------------------------------ tiện ích số học (giống numpy)
static double percentile(vector<double> v, double q) {
    if (v.empty()) return 0.0;
    std::sort(v.begin(), v.end());
    double idx = q / 100.0 * (v.size() - 1);
    size_t lo = (size_t)std::floor(idx), hi = (size_t)std::ceil(idx);
    double f = idx - lo;
    return v[lo] + (v[hi] - v[lo]) * f;
}
static double median(const vector<double>& v) { return percentile(v, 50.0); }
static double clip(double x, double a, double b) { return std::max(a, std::min(b, x)); }
static int pyround(double x) { return (int)std::nearbyint(x); }   // làm tròn kiểu Python (nửa về số chẵn)
static double hyp(double a, double b) { return std::sqrt(a * a + b * b); }

static cv::Mat inkmap(const cv::Mat& g32) {
    cv::Mat bl;
    cv::GaussianBlur(g32, bl, cv::Size(0, 0), 4 * S);
    cv::Mat d = bl - g32;
    cv::threshold(d, d, 0, 0, cv::THRESH_TOZERO);
    cv::min(d, 255.0, d);
    return d;
}

// ------------------------------------------------------------------ mẫu phiếu
struct Bubble {
    string region, key, value, block;
    double x, y, r;
};

struct Template {
    string id, name;
    int W = 0, H = 0;
    vector<cv::Point2f> corners, local;   // đã nhân S
    double corner_size = 15, local_size = 7;
    std::set<string> digit_groups;
    int part1 = 0, part2 = 0, part3 = 0, sbd_digits = 8, made_digits = 4;
    vector<Bubble> bubbles;
    vector<string> group_names;                   // theo thứ tự xuất hiện
    std::map<string, vector<int>> groups;
    vector<string> block_names;
    std::map<string, vector<int>> blocks;
    bool has_ref = false;
    cv::Mat ref_ink;
    int ref_x0 = 0, ref_y0 = 0;

    bool is_digit(int i) const { return digit_groups.count(bubbles[i].region) > 0; }
};

static Template load_template(const string& text, const unsigned char* ref, int ref_len) {
    json t = json::parse(text);
    Template T;
    T.id = t.value("template", "?");
    T.name = t.value("name", T.id);
    T.W = (int)(t["page"]["w"].get<double>() * S);
    T.H = (int)(t["page"]["h"].get<double>() * S);
    for (const char* k : {"TL", "TR", "BR", "BL"})
        T.corners.emplace_back((float)(t["corner_markers"][k][0].get<double>() * S), (float)(t["corner_markers"][k][1].get<double>() * S));
    for (auto& p : t["local_markers"]) T.local.emplace_back((float)(p[0].get<double>() * S), (float)(p[1].get<double>() * S));
    T.corner_size = t.value("corner_marker_size", 15.0);
    T.local_size = t.value("local_marker_size", 7.0);
    if (t.contains("digit_groups"))
        for (auto& g : t["digit_groups"]) T.digit_groups.insert(g.get<string>());
    auto& L = t["layout"];
    T.part1 = L["part1"]; T.part2 = L["part2"]; T.part3 = L["part3"];
    T.sbd_digits = L["sbd_digits"]; T.made_digits = L["made_digits"];
    for (auto& b : t["bubbles"]) {
        Bubble B;
        B.region = b["region"]; B.key = b["key"]; B.value = b["value"];
        B.x = b["x"]; B.y = b["y"]; B.r = b["r"];
        if (b.contains("block") && b["block"].is_string() && !b["block"].get<string>().empty()) B.block = b["block"];
        T.bubbles.push_back(B);
    }
    for (int i = 0; i < (int)T.bubbles.size(); i++) {
        auto& b = T.bubbles[i];
        if (!T.groups.count(b.key)) T.group_names.push_back(b.key);
        T.groups[b.key].push_back(i);
        string bk;
        if (!b.block.empty()) bk = b.block;
        else if (b.region == "sbd" || b.region == "made") bk = b.region;
        else if (b.region == "part1") {
            int q = std::stoi(b.key.substr(b.key.find("_q") + 2));
            bk = "p1_b" + std::to_string((q - 1) / 8);
        } else if (b.region == "part2") {
            string rest = b.key.substr(b.key.find("_q") + 2);
            int q = std::stoi(rest.substr(0, rest.find('_')));
            bk = "p2_q" + std::to_string(q);
        } else {
            bk = b.key.substr(0, b.key.rfind("_c"));
        }
        if (!T.blocks.count(bk)) T.block_names.push_back(bk);
        T.blocks[bk].push_back(i);
    }
    if (t.contains("digit_ref") && ref && ref_len > 0) {
        cv::Mat buf(1, ref_len, CV_8U, (void*)ref);
        cv::Mat im = cv::imdecode(buf, cv::IMREAD_GRAYSCALE);
        if (!im.empty()) {
            cv::Mat f; im.convertTo(f, CV_32F);
            T.ref_ink = inkmap(f);
            T.ref_x0 = t["digit_ref"]["x0"]; T.ref_y0 = t["digit_ref"]["y0"];
            T.has_ref = true;
        }
    }
    return T;
}

// ------------------------------------------------------------------ 1. tìm ô mốc
struct Sq { float x, y, side; };

static double pct_u8(const cv::Mat& m, double q) {   // phân vị (nội suy tuyến tính như numpy) bằng histogram
    int hist[256] = {0}; size_t n = 0;
    for (int r = 0; r < m.rows; r++) { const uchar* p = m.ptr<uchar>(r); for (int c = 0; c < m.cols; c++) hist[p[c]]++; }
    n = m.total();
    if (!n) return 0.0;
    double idx = q / 100.0 * (n - 1);
    size_t lo = (size_t)std::floor(idx), hi = (size_t)std::ceil(idx);
    auto kth = [&](size_t k) { size_t c = 0; for (int v = 0; v < 256; v++) { c += hist[v]; if (c > k) return (double)v; } return 255.0; };
    double a = kth(lo), b = hi == lo ? a : kth(hi);
    return a + (b - a) * (idx - lo);
}

static cv::Mat crop(const cv::Mat& m, int y0, int y1, int x0, int x1) {   // cắt kiểu numpy (tự kẹp biên)
    y0 = std::max(y0, 0); x0 = std::max(x0, 0);
    y1 = std::min(y1, m.rows); x1 = std::min(x1, m.cols);
    if (y1 <= y0 || x1 <= x0) return cv::Mat();
    return m(cv::Range(y0, y1), cv::Range(x0, x1));
}

static void squares_in(const cv::Mat& th, const cv::Mat& gray, vector<Sq>& out) {
    int h = gray.rows, w = gray.cols;
    double min_side = std::min(h, w) / 260.0;
    vector<vector<cv::Point>> cs;
    cv::findContours(th.clone(), cs, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);
    for (auto& c : cs) {
        cv::RotatedRect rr = cv::minAreaRect(c);
        double rw = rr.size.width, rh = rr.size.height;
        if (rw < min_side || rh < min_side) continue;
        double ar = rw / rh;
        if (!(0.72 < ar && ar < 1.39)) continue;
        double a = cv::contourArea(c);
        if (a / (rw * rh) < 0.86) continue;
        cv::Point2f cc; float rc;
        cv::minEnclosingCircle(c, cc, rc);
        if (a / (CV_PI * rc * rc) > 0.80) continue;
        double side = (rw + rh) / 2;
        int r = (int)(side * 0.3);
        int x = (int)rr.center.x, y = (int)rr.center.y;
        cv::Mat core = crop(gray, y - r, y + r + 1, x - r, x + r + 1);
        if (core.empty()) continue;
        cv::Mat nb = crop(gray, y - 3 * r, y + 3 * r, x - 3 * r, x + 3 * r);
        if (nb.empty()) continue;
        if (pct_u8(core, 80) > 0.6 * pct_u8(nb, 95)) continue;
        out.push_back({rr.center.x, rr.center.y, (float)side});
    }
}

// 4 ảnh nhị phân (đã mở hình thái 3x3) của kênh xám – tính 1 lần trên ảnh gốc, xoay theo hướng thử
static vector<cv::Mat> binarizations(const cv::Mat& gray) {
    int h = gray.rows, w = gray.cols;
    cv::Mat g; cv::GaussianBlur(gray, g, cv::Size(5, 5), 0);
    int k1 = std::max(15, (std::min(h, w) / 40) | 1);
    vector<cv::Mat> ths(4);
    cv::adaptiveThreshold(g, ths[0], 255, cv::ADAPTIVE_THRESH_MEAN_C, cv::THRESH_BINARY_INV, k1, 18);
    {   // ngưỡng thích nghi Gauss cửa sổ rất lớn (~10% bề rộng ảnh): tính nền trên ảnh thu nhỏ 4 lần cho nhanh
        int bs = ((int)(0.1 * w)) | 1;
        double sig = 0.3 * ((bs - 1) * 0.5 - 1) + 0.8;
        cv::Mat sm, bl, up;
        cv::resize(g, sm, cv::Size(), 0.25, 0.25, cv::INTER_AREA);
        sm.convertTo(sm, CV_32F);
        cv::GaussianBlur(sm, bl, cv::Size(0, 0), sig / 4.0, 0, cv::BORDER_REPLICATE);
        cv::resize(bl, up, g.size(), 0, 0, cv::INTER_LINEAR);
        cv::Mat gf; g.convertTo(gf, CV_32F);
        ths[1] = (gf <= up - 18);           // THRESH_BINARY_INV: 255 khi g <= nền - C
    }
    cv::threshold(g, ths[2], 0, 255, cv::THRESH_BINARY_INV + cv::THRESH_OTSU);
    cv::threshold(g, ths[3], 110, 255, cv::THRESH_BINARY_INV);
    cv::Mat k3 = cv::Mat::ones(3, 3, CV_8U);
    for (auto& th : ths) cv::morphologyEx(th, th, cv::MORPH_OPEN, k3);
    return ths;
}

static vector<Sq> squares_from(const vector<cv::Mat>& ths, const cv::Mat& gray) {
    vector<Sq> cands;
    for (auto& th : ths) squares_in(th, gray, cands);
    std::stable_sort(cands.begin(), cands.end(), [](const Sq& a, const Sq& b) { return a.side > b.side; });
    vector<Sq> allc;
    for (auto& c : cands) {
        bool dup = false;
        for (auto& d : allc)
            if (std::fabs(c.x - d.x) < 0.5 * d.side && std::fabs(c.y - d.y) < 0.5 * d.side) { dup = true; break; }
        if (!dup) allc.push_back(c);
    }
    return allc;
}

static vector<Sq> detect_squares(const cv::Mat& gray) { return squares_from(binarizations(gray), gray); }

static bool quad_ok(const vector<cv::Point2f>& q, const Template& T, double max_dev = 25.0) {
    for (int k = 0; k < 4; k++) {
        cv::Point2f a = q[(k + 3) % 4], b = q[k], c = q[(k + 1) % 4];
        cv::Point2f v1 = a - b, v2 = c - b;
        double cosang = (v1.x * v2.x + v1.y * v2.y) / (hyp(v1.x, v1.y) * hyp(v2.x, v2.y) + 1e-9);
        double ang = std::acos(clip(cosang, -1, 1)) * 180.0 / CV_PI;
        if (std::fabs(ang - 90) > max_dev) return false;
    }
    auto nrm = [](cv::Point2f p) { return hyp(p.x, p.y); };
    double top = nrm(q[1] - q[0]), bot = nrm(q[2] - q[3]);
    double lef = nrm(q[3] - q[0]), rig = nrm(q[2] - q[1]);
    if (!(0.7 < top / bot && top / bot < 1.43 && 0.7 < lef / rig && lef / rig < 1.43)) return false;
    auto& t = T.corners;
    double asp_t = nrm(t[1] - t[0]) / nrm(t[3] - t[0]);
    double asp = (top + bot) / (lef + rig);
    return 0.75 * asp_t < asp && asp < 1.33 * asp_t;
}

static vector<cv::Point2f> persp(const vector<cv::Point2f>& pts, const cv::Mat& H) {
    vector<cv::Point2f> out;
    cv::perspectiveTransform(pts, out, H);
    return out;
}

struct Key2 { int n; double d; };
static bool key_gt(const Key2& a, const Key2& b) { return a.n != b.n ? a.n > b.n : a.d > b.d; }

static std::pair<cv::Mat, int> register_sheet(const cv::Mat& img, const Template& T, const vector<Sq>* cached = nullptr) {
    vector<Sq> sq;
    if (cached) sq = *cached;
    else { cv::Mat gray; cv::extractChannel(img, gray, 2); sq = detect_squares(gray); }
    if (sq.size() < 4) throw SheetError("Không thấy đủ ô vuông mốc");
    vector<cv::Point2f> T_all = T.corners;
    T_all.insert(T_all.end(), T.local.begin(), T.local.end());
    int N = (int)T_all.size();
    vector<int> order(sq.size());
    std::iota(order.begin(), order.end(), 0);
    std::stable_sort(order.begin(), order.end(), [&](int a, int b) { return sq[a].side > sq[b].side; });
    vector<Sq> bigc;
    for (auto& s : sq) if (s.side >= 0.75 * sq[order[0]].side) bigc.push_back(s);
    if (bigc.size() < 4) { bigc.clear(); for (size_t k = 0; k < std::min<size_t>(7, order.size()); k++) bigc.push_back(sq[order[k]]); }
    double cx = img.cols / 2.0, cy = img.rows / 2.0;
    vector<int> far(bigc.size());
    std::iota(far.begin(), far.end(), 0);
    std::stable_sort(far.begin(), far.end(), [&](int a, int b) {
        return hyp(bigc[a].x - cx, bigc[a].y - cy) > hyp(bigc[b].x - cx, bigc[b].y - cy); });
    vector<Sq> big;
    for (size_t k = 0; k < std::min<size_t>(7, far.size()); k++) big.push_back(bigc[far[k]]);
    const double tol_rel = 0.018;
    double W_t = T.corners[1].x - T.corners[0].x;
    bool have = false; Key2 bkey{0, 0}; vector<cv::Point2f> bpred; double btol = 0;
    auto min_dist = [&](const cv::Point2f& p, int* jj) {
        double md = 1e18; int j = -1;
        for (int k = 0; k < (int)sq.size(); k++) { double d = hyp(p.x - sq[k].x, p.y - sq[k].y); if (d < md) { md = d; j = k; } }
        if (jj) *jj = j;
        return md;
    };
    // cách 1: 4 ô to nhất -> 4 góc theo vị trí
    if (bigc.size() >= 4) {
        int iminS = 0, imaxS = 0, imaxD = 0, iminD = 0;
        for (int k = 0; k < (int)bigc.size(); k++) {
            double s = bigc[k].x + bigc[k].y, d = bigc[k].x - bigc[k].y;
            if (s < bigc[iminS].x + bigc[iminS].y) iminS = k;
            if (s > bigc[imaxS].x + bigc[imaxS].y) imaxS = k;
            if (d > bigc[imaxD].x - bigc[imaxD].y) imaxD = k;
            if (d < bigc[iminD].x - bigc[iminD].y) iminD = k;
        }
        vector<cv::Point2f> quad = {{bigc[iminS].x, bigc[iminS].y}, {bigc[imaxD].x, bigc[imaxD].y},
                                    {bigc[imaxS].x, bigc[imaxS].y}, {bigc[iminD].x, bigc[iminD].y}};
        std::set<std::pair<float, float>> uq; for (auto& p : quad) uq.insert({p.x, p.y});
        if (uq.size() == 4 && quad_ok(quad, T)) {
            cv::Mat H0 = cv::getPerspectiveTransform(T.corners, quad);
            vector<cv::Point2f> pred = persp(T_all, H0);
            double sc = hyp(quad[1].x - quad[0].x, quad[1].y - quad[0].y) / W_t;
            double tol = tol_rel * sc * W_t;
            int cnt = 0;
            for (auto& p : pred) if (min_dist(p, nullptr) < tol) cnt++;
            if (cnt >= 0.7 * N) { have = true; bkey = {cnt, 0}; bpred = pred; btol = tol; }
        }
    }
    // cách 2: ghép 3 ô to bất kỳ với 3 mốc to của mẫu
    vector<cv::Point2f> T_big = (T.local_size < 0.75 * T.corner_size) ? vector<cv::Point2f>(T_all.begin(), T_all.begin() + 4) : T_all;
    int nb = (int)big.size(), nt = (int)T_big.size();
    if (!have) {
        for (int a = 0; a < nb; a++) for (int b = a + 1; b < nb; b++) for (int c = b + 1; c < nb; c++) {
            int tr[3] = {a, b, c};
            float smin = std::min({big[a].side, big[b].side, big[c].side}), smax = std::max({big[a].side, big[b].side, big[c].side});
            if (smin < 0.6 * smax) continue;
            cv::Point2f P[3]; for (int k = 0; k < 3; k++) P[k] = {big[tr[k]].x, big[tr[k]].y};
            auto dist2 = [](cv::Point2f u, cv::Point2f v) { return hyp(u.x - v.x, u.y - v.y); };
            double dP[3] = {dist2(P[0], P[1]), dist2(P[0], P[2]), dist2(P[1], P[2])};
            for (int i = 0; i < nt; i++) for (int j = 0; j < nt; j++) for (int k = 0; k < nt; k++) {
                if (i == j || i == k || j == k) continue;
                cv::Point2f Tq[3] = {T_big[i], T_big[j], T_big[k]};
                double dT[3] = {dist2(Tq[0], Tq[1]), dist2(Tq[0], Tq[2]), dist2(Tq[1], Tq[2])};
                if (std::min({dT[0], dT[1], dT[2]}) < 1) continue;
                double s3[3] = {dP[0] / dT[0], dP[1] / dT[1], dP[2] / dT[2]};
                if (std::max({s3[0], s3[1], s3[2]}) > 1.15 * std::min({s3[0], s3[1], s3[2]})) continue;
                cv::Mat A = cv::getAffineTransform(Tq, P);
                double a00 = A.at<double>(0, 0), a01 = A.at<double>(0, 1), a10 = A.at<double>(1, 0), a11 = A.at<double>(1, 1);
                double det = a00 * a11 - a01 * a10;
                if (det <= 0) continue;
                double sc = std::sqrt(det);
                if (!(0.1 < sc && sc < 5) || std::fabs(std::atan2(a10, a00) * 180.0 / CV_PI) > 35) continue;
                vector<cv::Point2f> pred(N);
                for (int q = 0; q < N; q++)
                    pred[q] = cv::Point2f((float)(T_all[q].x * a00 + T_all[q].y * a01 + A.at<double>(0, 2)),
                                          (float)(T_all[q].x * a10 + T_all[q].y * a11 + A.at<double>(1, 2)));
                double tol = tol_rel * sc * W_t;
                int cnt = 0; double sum = 0;
                for (auto& p : pred) { double d = min_dist(p, nullptr); if (d < tol) { cnt++; sum += d; } }
                Key2 key{cnt, cnt ? -sum / cnt : 0.0};
                if (!have || key_gt(key, bkey)) { have = true; bkey = key; bpred = pred; btol = tol; }
            }
        }
    }
    if (!have || bkey.n < std::max(5, std::min(8, (int)(0.6 * N))))
        throw SheetError("Không ghép được ô mốc (phiếu bị che hoặc chụp thiếu)");
    vector<cv::Point2f> pred = bpred; double tol = btol;
    cv::Mat Hm;
    for (int it = 0; it < 2; it++) {
        vector<cv::Point2f> src, dst;
        for (int q = 0; q < N; q++) {
            int j; double d = min_dist(pred[q], &j);
            if (d < tol) { src.push_back(T_all[q]); dst.push_back({sq[j].x, sq[j].y}); }
        }
        if (src.size() < 4) throw SheetError("Không căn chỉnh được phiếu");
        Hm = cv::findHomography(src, dst, cv::RANSAC, tol * 0.5);
        if (Hm.empty()) throw SheetError("Không căn chỉnh được phiếu");
        pred = persp(T_all, Hm);
    }
    if (!quad_ok(persp(T.corners, Hm), T)) throw SheetError("Không căn chỉnh được phiếu (hình phiếu bị méo bất thường)");
    int n_ok = 0;
    for (auto& p : pred) if (min_dist(p, nullptr) < 0.5 * tol) n_ok++;
    if (n_ok < 0.6 * N) throw SheetError("Phiếu bị che hoặc mờ, không thấy đủ ô mốc");
    return {Hm.inv(), n_ok};
}

// ------------------------------------------------------------------ 2-3. nắn và chỉnh cục bộ
struct Off { cv::Point2d p, o; };

static vector<Off> local_offsets(const cv::Mat& warped, const Template& T) {
    cv::Mat gray; cv::extractChannel(warped, gray, 2);
    vector<Off> out;
    vector<std::pair<cv::Point2f, double>> pts;
    for (auto& c : T.corners) pts.push_back({c, T.corner_size});
    for (auto& c : T.local) pts.push_back({c, T.local_size});
    for (auto& [p, side_pt] : pts) {
        double side = side_pt * S;
        int rad = (int)(side * 1.4);
        int x0 = (int)(p.x - rad), y0 = (int)(p.y - rad);
        if (x0 < 0 || y0 < 0) continue;
        if (y0 + 2 * rad > gray.rows || x0 + 2 * rad > gray.cols) continue;
        cv::Mat win = gray(cv::Rect(x0, y0, 2 * rad, 2 * rad)), th;
        cv::threshold(win, th, 0, 255, cv::THRESH_BINARY_INV + cv::THRESH_OTSU);
        cv::Mat lab, st, cen;
        int n = cv::connectedComponentsWithStats(th, lab, st, cen);
        bool found = false; double bd = 0, bx = 0, by = 0;
        for (int j = 1; j < n; j++) {
            int area = st.at<int>(j, cv::CC_STAT_AREA);
            if (0.5 * side * side < area && area < 1.6 * side * side) {
                double cx = cen.at<double>(j, 0) + x0, cy = cen.at<double>(j, 1) + y0;
                double d = hyp(cx - p.x, cy - p.y);
                if (d < 0.6 * side && (!found || d < bd)) { found = true; bd = d; bx = cx - p.x; by = cy - p.y; }
            }
        }
        if (found) out.push_back({cv::Point2d(p.x, p.y), cv::Point2d(bx, by)});
    }
    return out;
}

// Thin-plate spline có làm trơn (giống scipy RBFInterpolator, kernel='thin_plate_spline', smoothing=1)
struct OffsetField {
    bool tps = false;
    vector<Off> pts;
    cv::Mat coef;   // (n+3) x 2
    explicit OffsetField(const vector<Off>& p) : pts(p) {
        int n = (int)p.size();
        if (n >= 6) {
            cv::Mat A = cv::Mat::zeros(n + 3, n + 3, CV_64F), B = cv::Mat::zeros(n + 3, 2, CV_64F);
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    double r = hyp(p[i].p.x - p[j].p.x, p[i].p.y - p[j].p.y);
                    A.at<double>(i, j) = r > 0 ? r * r * std::log(r) : 0.0;
                }
                A.at<double>(i, i) += 1.0;
                A.at<double>(i, n) = 1; A.at<double>(i, n + 1) = p[i].p.x; A.at<double>(i, n + 2) = p[i].p.y;
                A.at<double>(n, i) = 1; A.at<double>(n + 1, i) = p[i].p.x; A.at<double>(n + 2, i) = p[i].p.y;
                B.at<double>(i, 0) = p[i].o.x; B.at<double>(i, 1) = p[i].o.y;
            }
            tps = cv::solve(A, B, coef, cv::DECOMP_LU);
        }
    }
    cv::Point2d operator()(double x, double y) const {
        if (tps) {
            int n = (int)pts.size();
            double ox = coef.at<double>(n, 0) + coef.at<double>(n + 1, 0) * x + coef.at<double>(n + 2, 0) * y;
            double oy = coef.at<double>(n, 1) + coef.at<double>(n + 1, 1) * x + coef.at<double>(n + 2, 1) * y;
            for (int i = 0; i < n; i++) {
                double r = hyp(pts[i].p.x - x, pts[i].p.y - y);
                double k = r > 0 ? r * r * std::log(r) : 0.0;
                ox += coef.at<double>(i, 0) * k; oy += coef.at<double>(i, 1) * k;
            }
            return {ox, oy};
        }
        if (pts.empty()) return {0, 0};
        double sw = 0, sx = 0, sy = 0;
        for (auto& q : pts) {
            double w = 1.0 / std::pow(hyp(q.p.x - x, q.p.y - y) + 30.0, 2);
            sw += w; sx += w * q.o.x; sy += w * q.o.y;
        }
        return {sx / sw, sy / sw};
    }
};

// ------------------------------------------------------------------ 4. căn theo viền in
static cv::Mat ring_mask(double r, bool zero_mean) {
    double ro = zero_mean ? r * 1.6 + 2 : r + 3;
    int n = ((int)std::ceil(ro * 2 + 2)) | 1;
    cv::Mat k(n, n, CV_32F, cv::Scalar(0));
    double rs = 0;
    for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
        double d = hyp(x - n / 2, y - n / 2);
        if (d > r - 1.5 && d < r + 1.5) { k.at<float>(y, x) = 1; rs += 1; }
    }
    k /= rs;
    if (zero_mean) {
        cv::Mat o(n, n, CV_32F, cv::Scalar(0)); double os = 0;
        for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
            double d = hyp(x - n / 2, y - n / 2);
            if (d > r + 2.5 && d < ro) { o.at<float>(y, x) = 1; os += 1; }
        }
        k -= o / os;
    }
    return k;
}

struct Shift { int dx, dy; double z; };

static Shift best_shift(const cv::Mat& resp, const vector<cv::Point2d>& pts, int R, double sigma) {
    int H = resp.rows, W = resp.cols, n = 2 * R + 1;
    vector<double> grid(n * n);
    vector<int> xs(pts.size()), ys(pts.size());
    for (int dy = -R; dy <= R; dy++) {
        for (size_t i = 0; i < pts.size(); i++) ys[i] = std::min(std::max(pyround(pts[i].y + dy), 0), H - 1);
        for (int dx = -R; dx <= R; dx++) {
            double s = 0;
            for (size_t i = 0; i < pts.size(); i++) {
                int x = std::min(std::max(pyround(pts[i].x + dx), 0), W - 1);
                s += resp.at<float>(ys[i], x);
            }
            grid[(dy + R) * n + dx + R] = (float)(s / pts.size());
        }
    }
    int best = 0; double bv = -1e300;
    for (int dy = -R; dy <= R; dy++) for (int dx = -R; dx <= R; dx++) {
        int k = (dy + R) * n + dx + R;
        double prior = std::exp(-(double)(dx * dx + dy * dy) / (2.0 * sigma * sigma));
        double e = grid[k] > 0 ? grid[k] * prior : grid[k];
        if (e > bv) { bv = e; best = k; }
    }
    double mean = std::accumulate(grid.begin(), grid.end(), 0.0) / grid.size(), var = 0;
    for (double g : grid) var += (g - mean) * (g - mean);
    double sd = std::sqrt(var / grid.size());
    double z = (grid[best] - median(grid)) / (sd + 1e-6);
    return {best % n - R, best / n - R, z};
}

using Pos = vector<cv::Point2d>;

// Đáp ứng bộ lọc viền ô chỉ tính trên vùng quanh một nhóm điểm (kết quả trùng với lọc cả ảnh)
struct RoiResp {
    cv::Mat r; int x0 = 0, y0 = 0;
    float at(int y, int x) const { return r.at<float>(y - y0, x - x0); }
};

static RoiResp roi_resp(const cv::Mat& ringmap, const cv::Mat& kern, const Pos& pts, int margin) {
    double xa = 1e18, ya = 1e18, xb = -1e18, yb = -1e18;
    for (auto& p : pts) { xa = std::min(xa, p.x); ya = std::min(ya, p.y); xb = std::max(xb, p.x); yb = std::max(yb, p.y); }
    int x0 = std::max(0, (int)std::floor(xa) - margin), y0 = std::max(0, (int)std::floor(ya) - margin);
    int x1 = std::min(ringmap.cols, (int)std::ceil(xb) + margin + 1), y1 = std::min(ringmap.rows, (int)std::ceil(yb) + margin + 1);
    int kh = kern.rows / 2;
    // vùng đệm thêm nửa kernel để lọc giống hệt trên cả ảnh; ở mép ảnh dùng phản xạ 101 như filter2D
    int px0 = std::max(0, x0 - kh), py0 = std::max(0, y0 - kh), px1 = std::min(ringmap.cols, x1 + kh), py1 = std::min(ringmap.rows, y1 + kh);
    cv::Mat src = ringmap(cv::Rect(px0, py0, px1 - px0, py1 - py0)), pad;
    cv::copyMakeBorder(src, pad, y0 - py0 < kh ? kh - (y0 - py0) : 0, py1 - y1 < kh ? kh - (py1 - y1) : 0,
                       x0 - px0 < kh ? kh - (x0 - px0) : 0, px1 - x1 < kh ? kh - (px1 - x1) : 0, cv::BORDER_REFLECT_101);
    // pad bây giờ có đủ kh điểm quanh [x0,x1)x[y0,y1); khi vùng chạm mép ảnh, phần đệm được tạo bằng phản xạ của chính ảnh
    cv::Mat out; cv::filter2D(pad, out, CV_32F, kern, cv::Point(-1, -1), 0, cv::BORDER_REFLECT_101);
    RoiResp R; R.x0 = x0; R.y0 = y0;
    R.r = out(cv::Rect(kh, kh, x1 - x0, y1 - y0)).clone();
    return R;
}

static Shift best_shift_roi(const RoiResp& resp, int W, int H, const Pos& pts, int R, double sigma) {
    int n = 2 * R + 1;
    vector<double> grid(n * n);
    vector<int> ys(pts.size());
    for (int dy = -R; dy <= R; dy++) {
        for (size_t i = 0; i < pts.size(); i++) ys[i] = std::min(std::max(pyround(pts[i].y + dy), 0), H - 1);
        for (int dx = -R; dx <= R; dx++) {
            double s = 0;
            for (size_t i = 0; i < pts.size(); i++) s += resp.at(ys[i], std::min(std::max(pyround(pts[i].x + dx), 0), W - 1));
            grid[(dy + R) * n + dx + R] = (float)(s / pts.size());
        }
    }
    int best = 0; double bv = -1e300;
    for (int dy = -R; dy <= R; dy++) for (int dx = -R; dx <= R; dx++) {
        int k = (dy + R) * n + dx + R;
        double prior = std::exp(-(double)(dx * dx + dy * dy) / (2.0 * sigma * sigma));
        double e = grid[k] > 0 ? grid[k] * prior : grid[k];
        if (e > bv) { bv = e; best = k; }
    }
    double mean = std::accumulate(grid.begin(), grid.end(), 0.0) / grid.size(), var = 0;
    for (double g : grid) var += (g - mean) * (g - mean);
    double sd = std::sqrt(var / grid.size());
    double z = (grid[best] - median(grid)) / (sd + 1e-6);
    return {best % n - R, best / n - R, z};
}

static void align_blocks(const cv::Mat& ringmap, const Template& T, const Pos& base, Pos& pos, std::map<string, double>& quality) {
    pos = base;
    std::map<double, cv::Mat> kerns;
    auto kern_for = [&](double r) -> const cv::Mat& {
        double k = std::round(r * S * 10) / 10.0;
        auto it = kerns.find(k);
        if (it == kerns.end()) it = kerns.emplace(k, ring_mask(k, true)).first;
        return it->second;
    };
    int RB = pyround(4.5 * S), RG = pyround(1.5 * S);
    std::map<string, RoiResp> bresp;
    for (auto& bk : T.block_names) {
        auto& ids = T.blocks.at(bk);
        Pos pts; for (int i : ids) pts.push_back(base[i]);
        bresp[bk] = roi_resp(ringmap, kern_for(T.bubbles[ids[0]].r), pts, RB + RG + 3);
        Shift s = best_shift_roi(bresp[bk], ringmap.cols, ringmap.rows, pts, RB, 3.0 * S);
        for (int i : ids) pos[i] = base[i] + cv::Point2d(s.dx, s.dy);
        quality[bk] = s.z;
    }
    std::map<int, string> blk_of;
    for (auto& bk : T.block_names) for (int i : T.blocks.at(bk)) blk_of[i] = bk;
    for (auto& g : T.group_names) {
        auto& ids = T.groups.at(g);
        Pos pts; for (int i : ids) pts.push_back(pos[i]);
        const string& bk = blk_of[ids[0]];
        bool same_r = true, inside = true;
        for (int i : ids) if (blk_of[i] != bk) inside = false;
        if (T.bubbles[T.blocks.at(bk)[0]].r != T.bubbles[ids[0]].r) same_r = false;
        Shift s;
        if (inside && same_r) s = best_shift_roi(bresp[bk], ringmap.cols, ringmap.rows, pts, RG, 1.5 * S);
        else { RoiResp rr = roi_resp(ringmap, kern_for(T.bubbles[ids[0]].r), pts, RG + 3); s = best_shift_roi(rr, ringmap.cols, ringmap.rows, pts, RG, 1.5 * S); }
        for (int i : ids) pos[i] += cv::Point2d(s.dx, s.dy);
    }
}

static void align_digit_blocks(const cv::Mat& gray32, const Template& T, const Pos& base, Pos& pos, std::map<string, double>& quality, const cv::Mat& ink = cv::Mat()) {
    if (!T.has_ref) return;
    cv::Mat tgt = ink.empty() ? inkmap(gray32) : ink;
    int s = pyround(4.5 * S);
    for (auto& bk : T.block_names) {
        auto& ids = T.blocks.at(bk);
        if (!T.is_digit(ids[0])) continue;
        vector<double> dxs, dys; double nx0 = 1e18, ny0 = 1e18, nx1 = -1e18, ny1 = -1e18;
        for (int i : ids) {
            double nx = T.bubbles[i].x * S, ny = T.bubbles[i].y * S;
            dxs.push_back(base[i].x - nx); dys.push_back(base[i].y - ny);
            nx0 = std::min(nx0, nx); ny0 = std::min(ny0, ny); nx1 = std::max(nx1, nx); ny1 = std::max(ny1, ny);
        }
        double d0x = median(dxs), d0y = median(dys);
        int m = (int)(1.2 * T.bubbles[ids[0]].r * S) + 4;
        int x0 = (int)(nx0 - m), y0 = (int)(ny0 - m), x1 = (int)(nx1 + m), y1 = (int)(ny1 + m);
        int tx0 = x0 - T.ref_x0, ty0 = y0 - T.ref_y0;
        if (tx0 < 0 || ty0 < 0 || tx0 + (x1 - x0) > T.ref_ink.cols || ty0 + (y1 - y0) > T.ref_ink.rows) continue;
        cv::Mat Tm = T.ref_ink(cv::Rect(tx0, ty0, x1 - x0, y1 - y0));
        int X0 = pyround(x0 + d0x) - s, Y0 = pyround(y0 + d0y) - s;
        if (X0 < 0 || Y0 < 0 || Tm.empty()) continue;
        int aw = (x1 - x0) + 2 * s, ah = (y1 - y0) + 2 * s;
        aw = std::min(aw, tgt.cols - X0); ah = std::min(ah, tgt.rows - Y0);
        if (ah < Tm.rows || aw < Tm.cols) continue;
        cv::Mat A = tgt(cv::Rect(X0, Y0, aw, ah)), rr;
        cv::matchTemplate(A, Tm, rr, cv::TM_CCOEFF_NORMED);
        double mx; cv::Point ml;
        cv::minMaxLoc(rr, nullptr, &mx, nullptr, &ml);
        if (mx < 0.15) continue;
        int dx = X0 + ml.x - x0, dy = Y0 + ml.y - y0;
        for (int i : ids) pos[i] = cv::Point2d(T.bubbles[i].x * S + dx, T.bubbles[i].y * S + dy);
        quality[bk] = std::max(quality[bk], 1.0 + 4.0 * (mx - 0.15));
    }
}

// ------------------------------------------------------------------ 5. đo độ đậm
struct Meas {
    vector<float> scores, streak;
    vector<std::array<float, NC>> cover, spread;
};

static Meas measure(const cv::Mat& chan, const Template& T, const Pos& pos, double cover_r, const cv::Mat& lines, double r_in) {
    int nb = (int)T.bubbles.size();
    cv::Mat paper, norm;
    int ks = (int)(9 * S);
    cv::morphologyEx(chan, paper, cv::MORPH_CLOSE, cv::Mat::ones(ks, ks, CV_8U));
    cv::GaussianBlur(paper, paper, cv::Size(0, 0), 6 * S);
    cv::Mat pm; cv::max(paper, 1.0, pm);
    cv::divide(chan, pm, norm);
    cv::threshold(norm, norm, 0, 0, cv::THRESH_TOZERO);
    cv::min(norm, 1.2, norm);
    Meas M;
    M.scores.assign(nb, 0); M.streak.assign(nb, 0);
    std::array<float, NC> z{}, o; o.fill(1.f);
    M.cover.assign(nb, z); M.spread.assign(nb, o);
    vector<int> digit_ids;
    auto line_at = [&](int y, int x) { return !lines.empty() && lines.at<uchar>(y, x) != 0; };
    for (int i = 0; i < nb; i++) {
        auto& b = T.bubbles[i];
        bool dig = T.is_digit(i);
        if (dig) digit_ids.push_back(i);
        double x = pos[i].x, y = pos[i].y, r = b.r * S * (dig ? 0.68 : r_in);
        int x0 = (int)(x - r - 1), x1 = (int)(x + r + 2), y0 = (int)(y - r - 1), y1 = (int)(y + r + 2);
        int ya = std::max(y0, 0), yb = std::min(y1, norm.rows), xa = std::max(x0, 0), xb = std::min(x1, norm.cols);
        vector<float> v; int nm = 0, nl = 0;
        vector<double> dk_ring; vector<int> sec_ring;
        vector<double> dk_m;
        for (int yy = ya; yy < yb; yy++) for (int xx = xa; xx < xb; xx++) {
            double d2 = (xx - x) * (xx - x) + (yy - y) * (yy - y);
            if (d2 > r * r) continue;
            nm++;
            if (line_at(yy, xx)) { nl++; continue; }
        }
        if (nm == 0) continue;
        M.streak[i] = (float)((double)nl / nm);
        if (nl == nm) continue;
        for (int yy = ya; yy < yb; yy++) for (int xx = xa; xx < xb; xx++) {
            double d2 = (xx - x) * (xx - x) + (yy - y) * (yy - y);
            if (d2 > r * r || line_at(yy, xx)) continue;
            float pv = norm.at<float>(yy, xx);
            v.push_back(1.0f - pv);
            dk_m.push_back(1.0 - pv);
            if (!dig && d2 >= (0.3 * r) * (0.3 * r)) {
                double ang = std::atan2(yy - y, xx - x);
                int sct = ((int)((ang + CV_PI) / (2 * CV_PI) * 8)) % 8;
                sec_ring.push_back(sct); dk_ring.push_back(1.0 - pv);
            }
        }
        if (!dig) {
            for (int k = 0; k < NC; k++) {
                double hit[8] = {0}, tot[8] = {0};
                for (size_t q = 0; q < sec_ring.size(); q++) { tot[sec_ring[q]] += 1; if (dk_ring[q] > COVER_T[k]) hit[sec_ring[q]] += 1; }
                double c = 0; for (int s8 = 0; s8 < 8; s8++) c += (hit[s8] / std::max(tot[s8], 1.0)) > 0.3;
                M.spread[i][k] = (float)(c / 8.0);
            }
        }
        if (dig) {
            for (int k = 0; k < NC; k++) {
                double c = 0; for (double d : dk_m) c += d > COVER_T[k];
                M.cover[i][k] = (float)(c / dk_m.size());
            }
        } else {
            double R2 = b.r * S * cover_r;
            int xw0 = std::max((int)(x - R2 - 1), 0), yw0 = std::max((int)(y - R2 - 1), 0);
            int xw1 = std::min((int)(x + R2 + 2), norm.cols), yw1 = std::min((int)(y + R2 + 2), norm.rows);
            vector<double> dk;
            for (int yy = yw0; yy < yw1; yy++) for (int xx = xw0; xx < xw1; xx++) {
                if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > R2 * R2 || line_at(yy, xx)) continue;
                dk.push_back(1.0 - norm.at<float>(yy, xx));
            }
            for (int k = 0; k < NC; k++) {
                if (dk.empty()) { M.cover[i][k] = 0; continue; }
                double c = 0; for (double d : dk) c += d > COVER_T[k];
                M.cover[i][k] = (float)(c / dk.size());
            }
        }
        std::sort(v.begin(), v.end(), std::greater<float>());
        size_t keep = std::max<size_t>(1, (size_t)(v.size() * (dig ? 1.0 : 0.7)));
        double s = 0; for (size_t q = 0; q < keep; q++) s += v[q];
        M.scores[i] = (float)(s / keep);
    }
    if (!digit_ids.empty()) {
        vector<double> sv; for (int i : digit_ids) sv.push_back(M.scores[i]);
        double md = median(sv);
        for (int i : digit_ids) M.scores[i] = (float)std::max(M.scores[i] - md, 0.0);
        for (int k = 0; k < NC; k++) {
            vector<double> cv_; for (int i : digit_ids) cv_.push_back(M.cover[i][k]);
            double mc = median(cv_);
            for (int i : digit_ids) M.cover[i][k] = (float)std::max(M.cover[i][k] - mc, 0.0);
        }
    }
    return M;
}

// ------------------------------------------------------------------ 6. quyết định
struct Thr { double lo, hi, ink, soft; };

static Thr sheet_thresholds(const vector<float>& s, const Template& T) {
    vector<double> all(s.begin(), s.end());
    double p85 = percentile(all, 85);
    vector<double> low; for (double x : all) if (x <= p85) low.push_back(x);
    double med = median(low);
    vector<double> ad; for (double x : low) ad.push_back(std::fabs(x - med));
    double mad = median(ad) * 1.4826;
    double lo = clip(med + std::max(0.04, 6 * mad), 0.05, 0.14);
    vector<double> marks;
    for (auto& g : T.group_names) {
        auto& ids = T.groups.at(g);
        if (T.is_digit(ids[0])) continue;
        double t = -1e9; for (int i : ids) t = std::max(t, (double)s[i]);
        if (t >= std::max(2 * lo, 0.10)) marks.push_back(t);
    }
    double ink = marks.size() >= 5 ? median(marks) : 0.5;
    double hi = clip(0.45 * ink, 0.10, 0.30);
    double soft = med + std::max(0.015, 3 * mad);
    return {lo, std::max(hi, lo + 0.05), ink, soft};
}

struct Dec { string v, st; double s1, s2; };

static vector<int> argsort_desc(const vector<double>& s) {
    vector<int> o(s.size()); std::iota(o.begin(), o.end(), 0);
    std::stable_sort(o.begin(), o.end(), [&](int a, int b) { return s[a] > s[b]; });
    return o;
}

static Dec decide(const vector<double>& s, const vector<string>& values, double lo, double hi) {
    auto order = argsort_desc(s);
    double s1 = s[order[0]], s2 = s.size() > 1 ? s[order[1]] : 0.0;
    int marked = 0; for (int j : order) if (s[j] >= hi) marked++;
    if (s1 <= lo) return {"", "ok", s1, s2};
    if (marked >= 2) return {"*", "nhieu_o", s1, s2};
    double e = 0;
    if (s.size() > 2) { vector<double> r; for (size_t k = 2; k < order.size(); k++) r.push_back(s[order[k]]); e = median(r); }
    bool clean2 = s2 <= lo || ((s2 - e) < 0.35 * (s1 - e) && s2 < 0.85 * hi);
    if (s1 >= hi && clean2) return {values[order[0]], "ok", s1, s2};
    return {values[order[0]], "nghi_ngo", s1, s2};
}

static Dec decide_digit(const vector<double>& s, const vector<string>& values, double lo, double blank) {
    auto order = argsort_desc(s);
    double s1 = s[order[0]], s2 = s[order[1]], med = median(s);
    if (s1 <= std::max(lo, blank)) return {"", "ok", s1, s2};
    if (s2 - med > 0.6 * (s1 - med) && s2 > std::max(lo, blank)) return {"*", "nhieu_o", s1, s2};
    if (s1 - s2 >= std::max(0.10, 0.45 * (s1 - med))) return {values[order[0]], "ok", s1, s2};
    return {values[order[0]], "nghi_ngo", s1, s2};
}

// Mở hình thái bằng đoạn thẳng dài L (giống cv::morphologyEx MORPH_OPEN với kernel 1xL hoặc Lx1, neo ở giữa):
// co (ngoài ảnh coi như 1) rồi giãn (ngoài ảnh coi như 0). Chạy O(n) bằng tổng tích lũy.
static cv::Mat open_line(const cv::Mat& src, int L, bool vertical) {
    cv::Mat s = vertical ? src.t() : src;      // xử lý theo hàng
    cv::Mat er(s.size(), CV_8U), out(s.size(), CV_8U);
    int n = s.cols, a = L / 2;
    vector<int> ps(n + 1), pe(n + 1);
    for (int r = 0; r < s.rows; r++) {
        const uchar* p = s.ptr<uchar>(r); uchar* e = er.ptr<uchar>(r); uchar* o = out.ptr<uchar>(r);
        ps[0] = 0; for (int i = 0; i < n; i++) ps[i + 1] = ps[i] + (p[i] ? 1 : 0);
        for (int i = 0; i < n; i++) {
            int lo = i - a, hi = i - a + L - 1;              // cửa sổ [lo, hi]
            int clo = std::max(lo, 0), chi = std::min(hi, n - 1);
            int need = chi - clo + 1;
            e[i] = (need <= 0 || ps[chi + 1] - ps[clo] == need) ? 1 : 0;
        }
        pe[0] = 0; for (int i = 0; i < n; i++) pe[i + 1] = pe[i] + e[i];
        for (int i = 0; i < n; i++) {
            int lo = i - a, hi = i - a + L - 1;
            int clo = std::max(lo, 0), chi = std::min(hi, n - 1);
            o[i] = (chi >= clo && pe[chi + 1] - pe[clo] > 0) ? 1 : 0;
        }
    }
    return vertical ? cv::Mat(out.t()) : out;
}

static cv::Mat scan_streaks(const cv::Mat& img) {
    vector<cv::Mat> ch; cv::split(img, ch);
    cv::Mat g8 = cv::min(cv::min(ch[0], ch[1]), ch[2]), g, bg;
    g8.convertTo(g, CV_32F);
    int h = g.rows, w = g.cols;
    cv::GaussianBlur(g, bg, cv::Size(0, 0), 8);
    cv::Mat dark = (g < 0.85 * bg) / 255;     // 0/1
    dark.convertTo(dark, CV_8U);
    cv::Mat v = open_line(dark, (int)(0.25 * h), true);
    cv::Mat hz = open_line(dark, (int)(0.25 * w), false);
    cv::Mat t1 = open_line(v, 9, false), t2 = open_line(hz, 9, true);
    v = v & (t1 == 0) / 255; hz = hz & (t2 == 0) / 255;
    cv::Mat m = v | hz;
    if (cv::countNonZero(m) == 0) return cv::Mat();
    cv::dilate(m, m, cv::Mat::ones(3, 3, CV_8U));
    return m;
}

struct Reg { cv::Mat Hinv; int n_mk; cv::Mat w; vector<Off> pts; int q_n; double q_r; };

static Reg registration(const cv::Mat& img, const Template& T, const vector<Sq>* sq = nullptr) {
    auto [Hinv, n_mk] = register_sheet(img, T, sq);
    cv::Mat w;
    cv::warpPerspective(img, w, Hinv, cv::Size(T.W, T.H), cv::INTER_LINEAR, cv::BORDER_REPLICATE);
    auto pts = local_offsets(w, T);
    int n_all = 4 + (int)T.local.size();
    if ((int)pts.size() < std::max(7, (int)std::ceil(0.6 * n_all)))
        throw SheetError("Căn chỉnh không đạt: không tìm lại được đủ ô mốc sau khi nắn");
    double resid = 0; for (auto& o : pts) resid += hyp(o.o.x, o.o.y);
    resid = pts.empty() ? 99.0 : resid / pts.size();
    return {Hinv, n_mk, w, pts, (int)pts.size(), -resid};
}

static bool reg_gt(const Reg& a, const Reg& b) { return a.q_n != b.q_n ? a.q_n > b.q_n : a.q_r > b.q_r; }

struct Result {
    string sbd, made, mode, template_id, template_name;
    int rotation = 0;
    vector<std::pair<string, string>> answers;
    vector<string> flags;
    std::map<int, vector<int>> p3bad;
    std::map<int, vector<string>> p3cols;
    vector<float> scores;
    Pos pos;
    cv::Mat warped;
    double lo = 0, hi = 0, ink = 0, q0 = 0, q1 = 0;
    vector<string> canh_bao;
};

static Result read_oriented(const cv::Mat& img, const Template& T, const Reg& reg, const cv::Mat& lines_src) {
    const cv::Mat& w = reg.w;
    OffsetField field(reg.pts);
    int nb = (int)T.bubbles.size();
    Pos base(nb);
    for (int i = 0; i < nb; i++) {
        double x = T.bubbles[i].x * S, y = T.bubbles[i].y * S;
        cv::Point2d d = field(x, y);
        base[i] = {x + d.x, y + d.y};
    }
    cv::Mat bgr; w.convertTo(bgr, CV_32F);
    vector<cv::Mat> ch; cv::split(bgr, ch);
    cv::Mat redness = ch[2] - ch[1];
    cv::threshold(redness, redness, 0, 0, cv::THRESH_TOZERO);
    cv::min(redness, 255.0, redness);
    cv::Mat rk = ring_mask(T.bubbles[0].r * S, false);
    int kh = rk.rows / 2;
    vector<double> rv;
    for (auto& p : base) {          // đáp ứng bộ lọc viền tại đúng tâm ô (như filter2D, biên phản xạ 101)
        int cx = (int)p.x, cy = (int)p.y; double acc = 0;
        for (int dy = -kh; dy <= kh; dy++) {
            int yy = cv::borderInterpolate(cy + dy, redness.rows, cv::BORDER_REFLECT_101);
            const float* kr = rk.ptr<float>(dy + kh); const float* rp = redness.ptr<float>(yy);
            for (int dx = -kh; dx <= kh; dx++) {
                float kv = kr[dx + kh]; if (kv == 0) continue;
                acc += kv * rp[cv::borderInterpolate(cx + dx, redness.cols, cv::BORDER_REFLECT_101)];
            }
        }
        rv.push_back(acc);
    }
    double ring_red = median(rv);
    vector<double> pv;
    for (int y = 0; y < redness.rows; y += 7) for (int x = 0; x < redness.cols; x += 7) pv.push_back(redness.at<float>(y, x));
    double paper_red = median(pv);
    string mode = ring_red - paper_red > 25 ? "mau" : "den_trang";
    cv::Mat minc = cv::min(cv::min(ch[0], ch[1]), ch[2]);
    cv::Mat chan, ringmap; double cover_r;
    if (mode == "mau") { chan = ch[2]; ringmap = redness; cover_r = 0.92; }
    else {
        chan = minc;
        ringmap = inkmap(chan);
        cover_r = 0.78;
    }
    Pos pos; std::map<string, double> quality;
    align_blocks(ringmap, T, base, pos, quality);
    align_digit_blocks(minc, T, base, pos, quality, mode == "mau" ? cv::Mat() : ringmap);
    std::set<string> dig_blocks;
    for (auto& bk : T.block_names) if (T.is_digit(T.blocks.at(bk)[0])) dig_blocks.insert(bk);
    vector<double> ans_q; for (auto& bk : T.block_names) if (!dig_blocks.count(bk)) ans_q.push_back(quality[bk]);
    double qmed = ans_q.empty() ? 0.0 : median(ans_q);
    std::set<string> weak;
    for (auto& bk : T.block_names) {
        double q = quality[bk];
        if ((dig_blocks.count(bk) && q < 1.0) || (!dig_blocks.count(bk) && q < std::max(2.0, 0.5 * qmed))) weak.insert(bk);
    }
    if (!ans_q.empty()) {
        int nweak = 0; for (auto& bk : T.block_names) if (!dig_blocks.count(bk) && weak.count(bk)) nweak++;
        if (qmed < 2.5 || nweak > 0.3 * ans_q.size())
            throw SheetError("Căn chỉnh không khớp vị trí ô tròn (ảnh méo hoặc nhận nhầm ô mốc)");
    }
    cv::Mat lines;
    if (!lines_src.empty()) {
        cv::warpPerspective(lines_src, lines, reg.Hinv, cv::Size(T.W, T.H), cv::INTER_NEAREST);
        cv::dilate(lines, lines, cv::Mat::ones(3, 3, CV_8U));
    }
    Meas M = measure(chan, T, pos, cover_r, lines, mode == "mau" ? 0.68 : 0.60);
    vector<float>& scores = M.scores;
    if (!T.digit_groups.empty()) {
        vector<const vector<int>*> cols;
        for (auto& g : T.group_names) if (T.is_digit(T.groups.at(g)[0])) cols.push_back(&T.groups.at(g));
        std::set<int> tops;
        for (auto c : cols) { int t = (*c)[0]; for (int i : *c) if (scores[i] > scores[t]) t = i; tops.insert(t); }
        vector<string> vals_order; std::map<string, vector<int>> by_val;
        for (auto c : cols) for (int i : *c) {
            auto& v = T.bubbles[i].value;
            if (!by_val.count(v)) vals_order.push_back(v);
            by_val[v].push_back(i);
        }
        for (auto& val : vals_order) {
            auto& ids = by_val[val];
            vector<double> blanks; for (int i : ids) if (!tops.count(i)) blanks.push_back(scores[i]);
            if (blanks.size() >= 3) {
                double bv = median(blanks);
                for (int i : ids) scores[i] = (float)std::max(scores[i] - bv, 0.0);
            }
        }
    }
    Thr th = sheet_thresholds(scores, T);
    double lo = th.lo, hi = th.hi, ink = th.ink;
    double soft = std::min(th.soft, lo - 0.005);
    auto nearest = [](double target) {
        int bi = 0; double bd = 1e9;
        for (int k = 0; k < NC; k++) { double d = std::fabs(COVER_T[k] - target); if (d < bd) { bd = d; bi = k; } }
        return bi;
    };
    int ci = nearest(clip(0.5 * ink, 0.10, 0.30));
    vector<double> cover(nb), spread(nb), cover_rel(nb);
    for (int i = 0; i < nb; i++) {
        cover[i] = M.cover[i][ci];
        int si = nearest(clip(0.5 * scores[i], 0.04, 0.30));
        spread[i] = M.spread[i][si];
        cover_rel[i] = M.cover[i][si];
    }
    std::map<string, double> hi_blk;
    for (auto& bk : T.block_names) {
        auto& bids = T.blocks.at(bk);
        if (T.is_digit(bids[0])) continue;
        std::set<string> gs; for (int i : bids) gs.insert(T.bubbles[i].key);
        vector<double> tops_b;
        for (auto& g : gs) {
            vector<double> sg; for (int i : T.groups.at(g)) sg.push_back(scores[i]);
            std::sort(sg.begin(), sg.end(), std::greater<double>());
            if (sg.size() < 2 || sg[0] >= 2 * sg[1]) tops_b.push_back(sg[0]);
        }
        vector<double> mk; for (double x : tops_b) if (x >= std::max(2 * lo, 0.06)) mk.push_back(x);
        if (mk.size() >= 3) hi_blk[bk] = std::min(hi, std::max({0.45 * median(mk), lo + 0.04, 0.08}));
    }
    vector<string> blk_of(nb);
    for (auto& bk : T.block_names) for (int i : T.blocks.at(bk)) blk_of[i] = bk;
    auto hib = [&](int i) { auto it = hi_blk.find(blk_of[i]); return it == hi_blk.end() ? hi : it->second; };
    double cover_base = percentile(cover, 75);
    vector<double> dig_marks;
    for (auto& g : T.group_names) {
        auto& ids = T.groups.at(g);
        if (!T.is_digit(ids[0])) continue;
        double t = -1e9; for (int i : ids) t = std::max(t, (double)scores[i]);
        if (t >= 0.2) dig_marks.push_back(t);
    }
    double ink_dig = dig_marks.size() >= 3 ? median(dig_marks) : ink;
    double blank_dig = std::max(0.08, 0.35 * ink_dig);
    std::set<int> weak_ids; for (auto& bk : weak) for (int i : T.blocks.at(bk)) weak_ids.insert(i);

    auto top_of = [&](const vector<int>& ids) { int t = ids[0]; for (int i : ids) if (scores[i] > scores[t]) t = i; return t; };
    auto grp = [&](const string& key) -> Dec {
        auto& ids = T.groups.at(key);
        bool digit = T.is_digit(ids[0]);
        vector<double> s; vector<string> vals;
        for (int i : ids) { s.push_back(scores[i]); vals.push_back(T.bubbles[i].value); }
        Dec d;
        if (digit) d = decide_digit(s, vals, lo, blank_dig);
        else {
            d = decide(s, vals, lo, hib(ids[0]));
            if (d.v.empty() && d.s1 >= soft) {
                vector<double> rest = s; std::sort(rest.begin(), rest.end()); rest.pop_back();
                double base_ = rest.empty() ? 0.0 : median(rest);
                if (d.s1 - base_ >= 2.0 * std::max(d.s2 - base_, 0.008) && d.s1 - base_ >= 0.025) {
                    int am = 0; for (size_t k = 1; k < s.size(); k++) if (s[k] > s[am]) am = (int)k;
                    d.v = vals[am]; d.st = "to_rat_nhat";
                }
            }
        }
        if (d.st == "ok" && !digit) {
            int top = top_of(ids);
            for (int i : ids)
                if ((i != top || d.v.empty()) && scores[i] < hi && cover[i] - cover_base > 0.08) { d.st = "net_la"; break; }
        }
        if (DARKEST_RULE && !digit && (d.st == "nhieu_o" || d.st == "net_la" || d.st == "nghi_ngo") && d.s1 >= lo) {
            d.v = T.bubbles[top_of(ids)].value;
            double thr_ = hib(ids[0]);
            if (d.s1 >= thr_ && d.s2 < 0.6 * thr_ && d.s1 - d.s2 >= std::max(0.05, 0.35 * d.s1)) d.st = "ok";
            else if (d.s2 >= 0.6 * thr_) d.st = "nhieu_o";
            else if (d.st == "nhieu_o") d.st = "hai_o_sat_nhau";
        }
        if (d.st == "nghi_ngo" && !digit && d.v != "" && d.v != "*" && d.s2 <= lo &&
            d.s1 >= std::max(2 * lo, 0.07) && d.s1 >= 5 * std::max(d.s2, 0.012))
            d.st = "ok";
        if (d.st == "ok" && !digit && d.v != "" && d.v != "*") {
            int top = top_of(ids);
            if (spread[top] < 0.5 || cover_rel[top] < 0.35) d.st = "to_khong_kin";
        }
        const string& reg_ = T.bubbles[ids[0]].region;
        if (!digit && reg_ != "sbd" && reg_ != "made" && (d.st == "nghi_ngo" || d.st == "to_rat_nhat") && d.s1 < hib(ids[0]))
            d.v = "";
        if (d.st == "ok") for (int i : ids) if (weak_ids.count(i)) { d.st = "can_chinh_kem"; break; }
        if (d.st == "ok") for (int i : ids) if (M.streak[i] > 0.6) { d.st = "vet_scan"; break; }
        return d;
    };

    Result res;
    res.mode = mode; res.template_id = T.id; res.template_name = T.name;
    res.lo = lo; res.hi = hi; res.ink = ink;
    res.q0 = reg.pts.size() / double(4 + T.local.size());
    { double m = 0; for (auto& o : reg.pts) m += hyp(o.o.x, o.o.y); res.q1 = -(m / reg.pts.size()); }
    for (int pass = 0; pass < 2; pass++) {
        string name = pass == 0 ? "sbd" : "made";
        int n = pass == 0 ? T.sbd_digits : T.made_digits;
        vector<string> digits; vector<double> s1s;
        for (int k = 1; k <= n; k++) {
            Dec d = grp(name + "_" + std::to_string(k));
            s1s.push_back(d.s1);
            if (d.st != "ok" || d.v.empty()) res.flags.push_back(name + "_" + std::to_string(k) + ":" + (d.v.empty() ? "trong" : d.st));
            digits.push_back(d.v.empty() ? "?" : d.v);
        }
        if (name == "sbd") {
            int k = 0; while (k < (int)digits.size() && digits[k] == "?") k++;
            bool rest_ok = true;
            for (int j = k; j < (int)digits.size(); j++) if (digits[j].size() != 1 || !isdigit((unsigned char)digits[j][0])) rest_ok = false;
            bool truly_empty = true;          // chỉ bỏ khi các cột đầu trống thật (không vết nào vượt ngưỡng thấp)
            for (int j = 0; j < k; j++) if (s1s[j] > std::max(lo, 0.25 * ink_dig)) truly_empty = false;
            if (k > 0 && k <= n - 4 && rest_ok && truly_empty) {
                vector<string> nf;
                for (auto& f : res.flags) {
                    bool drop = false;
                    for (int j = 1; j <= k; j++) if (f == "sbd_" + std::to_string(j) + ":trong") drop = true;
                    if (!drop) nf.push_back(f);
                }
                res.flags = nf;
                digits.erase(digits.begin(), digits.begin() + k);
            }
        }
        string s; for (auto& d : digits) s += d;
        (pass == 0 ? res.sbd : res.made) = s;
    }
    for (int q = 1; q <= T.part1; q++) {
        Dec d = grp("p1_q" + std::to_string(q));
        res.answers.push_back({"I." + std::to_string(q), d.v});
        if (d.st != "ok") res.flags.push_back("I." + std::to_string(q) + ":" + d.st);
    }
    for (int q = 1; q <= T.part2; q++) for (char lt : string("abcd")) {
        Dec d = grp("p2_q" + std::to_string(q) + "_" + lt);
        string k = "II." + std::to_string(q) + lt;
        res.answers.push_back({k, d.v});
        if (d.st != "ok") res.flags.push_back(k + ":" + d.st);
    }
    static const std::regex P3RE("-?\\d+(,\\d+)?");
    for (int q = 1; q <= T.part3; q++) {
        vector<string> cols; vector<std::pair<int, string>> badcols;
        for (int c = 1; c <= 4; c++) {
            string g = "p3_q" + std::to_string(q) + "_c" + std::to_string(c);
            Dec d = grp(g);
            if (P3_DARKEST && (d.st == "net_la" || d.st == "nghi_ngo") && d.s1 >= lo && d.s1 - d.s2 >= std::max(0.05, 0.35 * d.s1)) {
                int top_c = top_of(T.groups.at(g));
                if (d.s1 >= hib(top_c)) { d.v = T.bubbles[top_c].value; d.st = "ok"; }
                else { d.v = ""; d.st = "nghi_ngo"; }
            }
            if (d.st != "ok") badcols.push_back({c, d.st});
            cols.push_back(d.v);
        }
        string s; for (auto& c : cols) s += c;
        for (auto& bc : badcols) res.p3bad[q].push_back(bc.first);
        if (!res.p3bad.count(q)) res.p3bad[q] = {};
        string key = "III." + std::to_string(q);
        if (!badcols.empty()) {
            std::set<string> sts; for (auto& bc : badcols) sts.insert(bc.second);
            string why = sts.count("nhieu_o") ? "nhieu_o" : (sts.count("nghi_ngo") ? "nghi_ngo" : *sts.begin());
            res.flags.push_back(key + ":" + why);
        } else if (!s.empty() && !std::regex_match(s, P3RE)) {
            res.flags.push_back(key + ":sai_dinh_dang");
        } else {
            vector<int> filled; for (int i = 0; i < 4; i++) if (!cols[i].empty()) filled.push_back(i);
            bool gap = false;
            for (size_t k = 1; k < filled.size(); k++) if (filled[k] != filled[k - 1] + 1) gap = true;
            if (gap) res.flags.push_back(key + ":o_trong_giua");
        }
        res.answers.push_back({key, s});
        res.p3cols[q] = cols;
    }
    res.scores = scores; res.pos = pos; res.warped = w;
    return res;
}

struct Prepared {                     // ảnh 4 hướng + ô vuông mốc: tính 1 lần, dùng cho mọi mẫu phiếu
    cv::Mat img;
    cv::Mat rot[4];
    vector<Sq> sq[4];
    bool done[4] = {false, false, false, false};
    cv::Mat streaks[4]; bool streak_done[4] = {false, false, false, false};
    vector<cv::Mat> bins; cv::Mat gray0, gmin;
    cv::Mat gray_min() {
        if (gmin.empty()) { vector<cv::Mat> ch; cv::split(img, ch); gmin = cv::min(cv::min(ch[0], ch[1]), ch[2]); }
        return gmin;
    }
    const cv::Mat& get(int k) {
        if (!done[k]) {
            static const int codes[4] = {-1, cv::ROTATE_180, cv::ROTATE_90_CLOCKWISE, cv::ROTATE_90_COUNTERCLOCKWISE};
            if (!done[0]) {
                rot[0] = img;
                cv::extractChannel(img, gray0, 2);
                sq[0] = squares_from(binarizations(gray0), gray0);
                done[0] = true;
            }
            if (k != 0) {
                // ảnh xoay: xoay luôn tọa độ ô mốc đã tìm (không phải dò lại)
                cv::rotate(img, rot[k], codes[k]);
                int W = img.cols, H = img.rows;
                sq[k].clear();
                for (auto q : sq[0]) {
                    Sq r = q;
                    if (k == 1) { r.x = W - 1 - q.x; r.y = H - 1 - q.y; }
                    else if (k == 2) { r.x = H - 1 - q.y; r.y = q.x; }
                    else { r.x = q.y; r.y = W - 1 - q.x; }
                    sq[k].push_back(r);
                }
                done[k] = true;
            }
        }
        return rot[k];
    }
};

struct Cand { const Template* T; Reg reg; int deg; int ri; };

// Thử 4 hướng cho 1 mẫu; trả về hướng khớp tốt nhất (hoặc lỗi)
static bool best_registration(Prepared& P, const Template& T, Cand& out, string& err, bool& err_set) {
    auto note_err = [&](const string& e) {
        bool e_g = e.find("ghép") != string::npos, err_g = err.find("ghép") != string::npos;
        if (!err_set || !e_g) { if (!err_set || err_g) { err = e; err_set = true; } }
    };
    const int rots[4] = {0, 180, 90, 270};
    bool have = false;
    for (int ri = 0; ri < 4; ri++) {
        const cv::Mat& im = P.get(ri);
        Reg reg;
        try { reg = registration(im, T, &P.sq[ri]); }
        catch (const SheetError& e) { note_err(e.what()); continue; }
        catch (const cv::Exception&) { note_err("Không căn chỉnh được phiếu"); continue; }
        if (!have || reg_gt(reg, out.reg)) { have = true; out = {&T, reg, rots[ri], ri}; }
        if (reg.q_n == 4 + (int)T.local.size() && reg.q_r > -1.5 * S) break;
    }
    return have;
}

static Result read_cand(Prepared& P, const Cand& c) {
    if (!P.streak_done[c.ri]) { P.streaks[c.ri] = scan_streaks(P.rot[c.ri]); P.streak_done[c.ri] = true; }
    Result r = read_oriented(P.rot[c.ri], *c.T, c.reg, P.streaks[c.ri]);
    r.rotation = c.deg;
    cv::Mat g = P.gray_min();
    double frac = (double)cv::countNonZero((g > 40) & (g < 215)) / g.total();
    if (frac < 0.01) {
        r.canh_bao.push_back("Ảnh đen trắng (máy scan chế độ Đen trắng hoặc app scan chế độ B&W): vết bút chì nhạt có thể đã mất. Nên scan lại chế độ Xám / Gốc.");
        std::set<string> flagged; for (auto& f : r.flags) flagged.insert(f.substr(0, f.find(':')));
        for (auto& [k, v] : r.answers) {
            string part = k.substr(0, k.find('.'));
            if (!flagged.count(k) && v.empty() && (part == "I" || part == "II")) r.flags.push_back(k + ":trong_anh_1bit");
            else if (!flagged.count(k) && part == "III" && !v.empty()) r.flags.push_back(k + ":so_anh_1bit");
        }
    }
    return r;
}

// ------------------------------------------------------------------ bộ nhớ mẫu + JSON
static std::mutex g_mu;
static vector<std::shared_ptr<Template>> g_tpls;

static const std::map<string, string> REASON_VI = {
    {"nghi_ngo", "Tô nhạt hoặc không rõ"}, {"nhieu_o", "Tô nhiều ô"}, {"net_la", "Có nét lạ (tẩy dở, gạch)"},
    {"can_chinh_kem", "Vùng phiếu căn chỉnh kém"}, {"sai_dinh_dang", "Phần III: số không hợp lệ"},
    {"o_trong_giua", "Phần III: có cột trống ở giữa"}, {"trong", "Cột để trống"},
    {"trong_anh_1bit", "Trống trên ảnh đen trắng"}, {"so_anh_1bit", "Phần III trên ảnh đen trắng"},
    {"vet_scan", "Vệt bụi máy scan"}, {"to_khong_kin", "Ô tô không kín / nét gạch"},
    {"to_rat_nhat", "Tô rất nhạt"}, {"hai_o_sat_nhau", "Hai ô tô gần bằng nhau"}};

static json to_json(const Result& r, const Template& T) {
    json j;
    j["ok"] = true; j["error"] = nullptr;
    j["template_id"] = r.template_id; j["template_name"] = r.template_name;
    j["mode"] = r.mode; j["rotation"] = r.rotation;
    j["sbd"] = r.sbd; j["made"] = r.made;
    json a = json::object(); for (auto& [k, v] : r.answers) a[k] = v;
    j["answers"] = a;
    json fl = json::array(), fc = json::array();
    for (auto& f : r.flags) {
        auto p = f.find(':'); string k = f.substr(0, p), w = f.substr(p + 1);
        auto it = REASON_VI.find(w);
        fl.push_back({{"key", k}, {"reason", w}, {"reason_vi", it == REASON_VI.end() ? w : it->second}});
        fc.push_back(f);
    }
    j["flags"] = fl; j["flag_codes"] = fc;
    j["warped_size"] = {T.W, T.H};
    json bs = json::array();
    for (size_t i = 0; i < T.bubbles.size(); i++) {
        auto& b = T.bubbles[i];
        bs.push_back({{"key", b.key}, {"value", b.value}, {"x", std::round(r.pos[i].x * 10) / 10}, {"y", std::round(r.pos[i].y * 10) / 10},
                      {"r", std::round(b.r * S * 10) / 10}, {"score", std::round(r.scores[i] * 10000) / 10000}});
    }
    j["bubbles"] = bs;
    j["thresholds"] = {{"lo", r.lo}, {"hi", r.hi}};
    j["ink"] = r.ink;
    j["quality"] = {r.q0, r.q1};
    json p3b = json::object(), p3c = json::object();
    for (auto& [q, v] : r.p3bad) p3b[std::to_string(q)] = v;
    for (auto& [q, v] : r.p3cols) p3c[std::to_string(q)] = v;
    j["p3bad"] = p3b; j["p3cols"] = p3c;
    j["canh_bao"] = r.canh_bao;
    return j;
}

static char* dup_str(const string& s) {
    char* p = (char*)std::malloc(s.size() + 1);
    std::memcpy(p, s.c_str(), s.size() + 1);
    return p;
}

}  // namespace omr

// ================================================================== API C
extern "C" {

OMR_API int omr_version(void) { return 3; }

OMR_API int omr_add_template(const char* json_text, const unsigned char* ref_png, int ref_len) {
    try {
        auto t = std::make_shared<omr::Template>(omr::load_template(json_text, ref_png, ref_len));
        std::lock_guard<std::mutex> lk(omr::g_mu);
        for (auto& x : omr::g_tpls) if (x->id == t->id) { x = t; return (int)omr::g_tpls.size(); }
        omr::g_tpls.push_back(t);
        return (int)omr::g_tpls.size();
    } catch (...) { return -1; }
}

OMR_API void omr_clear_templates(void) { std::lock_guard<std::mutex> lk(omr::g_mu); omr::g_tpls.clear(); }

static char* read_mat(cv::Mat img, const char* template_id, unsigned char** warped_jpg, int* warped_len) {
    using namespace omr;
    if (warped_jpg) *warped_jpg = nullptr;
    if (warped_len) *warped_len = 0;
    json out;
    try {
        if (img.empty()) throw SheetError("Không đọc được file ảnh");
        Prepared P;
        vector<std::shared_ptr<Template>> tpls;
        { std::lock_guard<std::mutex> lk(g_mu); tpls = g_tpls; }
        if (tpls.empty()) throw SheetError("Chưa nạp mẫu phiếu");
        if (img.channels() == 1) cv::cvtColor(img, img, cv::COLOR_GRAY2BGR);
        P.img = img;
        // 1) căn chỉnh: thử hướng thẳng với mọi mẫu trước; mẫu nào khớp trọn vẹn thì nhận luôn
        vector<Cand> cands; string err; bool err_set = false;
        vector<std::shared_ptr<Template>> use;
        for (auto& t : tpls) if (!(template_id && *template_id && t->id != template_id)) use.push_back(t);
        bool perfect = false;
        for (auto& t : use) {
            try {
                Reg reg = registration(P.get(0), *t, &P.sq[0]);
                if (reg.q_n == 4 + (int)t->local.size() && reg.q_r > -1.5 * S) { cands = {{t.get(), reg, 0, 0}}; perfect = true; break; }
            } catch (const SheetError&) {} catch (const cv::Exception&) {}
        }
        if (!perfect) {
            // hướng thẳng đã khớp >= 80% mốc với một mẫu: phiếu không bị xoay, khỏi thử 3 hướng còn lại
            bool upright = false;
            for (auto& t : use) {
                try {
                    Reg reg = registration(P.get(0), *t, &P.sq[0]);
                    if (reg.q_n >= 0.8 * (4 + (int)t->local.size())) { cands.push_back({t.get(), reg, 0, 0}); upright = true; }
                } catch (const SheetError& e) { if (!err_set) { err = e.what(); err_set = true; } } catch (const cv::Exception&) {}
            }
            if (upright) goto read_phase;
            for (auto& t : use) {
                Cand c;
                if (best_registration(P, *t, c, err, err_set)) {
                    cands.push_back(c);
                    if (c.reg.q_n == 4 + (int)t->local.size()) break;
                }
            }
        }
        read_phase:
        // 2) đọc mẫu căn chỉnh tốt nhất; lỗi thì sang mẫu kế tiếp
        std::stable_sort(cands.begin(), cands.end(), [](const Cand& a, const Cand& b) { return reg_gt(a.reg, b.reg); });
        bool have = false; Result best; const Template* bt = nullptr;
        for (auto& c : cands) {
            try { best = read_cand(P, c); bt = c.T; have = true; break; }
            catch (const SheetError& e) { if (!err_set) { err = e.what(); err_set = true; } }
            catch (const cv::Exception&) { if (!err_set) { err = "Không căn chỉnh được phiếu"; err_set = true; } }
        }
        if (!have) throw SheetError(err_set ? err : "Không nhận ra mẫu phiếu");
        out = to_json(best, *bt);
        if (warped_jpg && warped_len) {
            vector<uchar> enc;
            cv::imencode(".jpg", best.warped, enc, {cv::IMWRITE_JPEG_QUALITY, 88});
            *warped_jpg = (unsigned char*)std::malloc(enc.size());
            std::memcpy(*warped_jpg, enc.data(), enc.size());
            *warped_len = (int)enc.size();
        }
    } catch (const std::exception& e) {
        out = json::object();
        out["ok"] = false; out["error"] = e.what(); out["template_id"] = nullptr;
    }
    return dup_str(out.dump());
}

OMR_API char* omr_read(const unsigned char* data, int len, const char* template_id,
                       unsigned char** warped_jpg, int* warped_len) {
    cv::Mat img;
    try { cv::Mat buf(1, len, CV_8U, (void*)data); img = cv::imdecode(buf, cv::IMREAD_COLOR); } catch (...) {}
    return read_mat(img, template_id, warped_jpg, warped_len);
}

OMR_API char* omr_read_bgr(const unsigned char* bgr, int width, int height, int stride, const char* template_id,
                           unsigned char** warped_jpg, int* warped_len) {
    cv::Mat img(height, width, CV_8UC3, (void*)bgr, stride);
    return read_mat(img.clone(), template_id, warped_jpg, warped_len);
}

OMR_API void omr_free(void* p) { std::free(p); }

// ------------------------------------------------------------------ bổ sung cho app điện thoại (API v2)
OMR_API void* omr_alloc(int n) { return std::malloc(n > 0 ? (size_t)n : 1); }

OMR_API char* omr_read2(const unsigned char* data, int len, const char* template_id, int max_side,
                        unsigned char** warped_jpg, int* warped_len) {
    cv::Mat img;
    try {
        cv::Mat buf(1, len, CV_8U, (void*)data);
        img = cv::imdecode(buf, cv::IMREAD_COLOR);
        int m = std::max(img.cols, img.rows);
        if (!img.empty() && max_side > 0 && m > max_side) {
            double f = (double)max_side / m;
            cv::resize(img, img, cv::Size(), f, f, cv::INTER_AREA);
        }
    } catch (...) {}
    return read_mat(img, template_id, warped_jpg, warped_len);
}

OMR_API char* omr_detect(const unsigned char* gray, int width, int height, int stride, int rotate_deg, int max_side) {
    using namespace omr;
    json out = json::object();
    out["found"] = false;
    try {
        cv::Mat g(height, width, CV_8UC1, (void*)gray, stride), img;
        if (rotate_deg == 90) cv::rotate(g, img, cv::ROTATE_90_CLOCKWISE);
        else if (rotate_deg == 180) cv::rotate(g, img, cv::ROTATE_180);
        else if (rotate_deg == 270) cv::rotate(g, img, cv::ROTATE_90_COUNTERCLOCKWISE);
        else img = g.clone();
        int m = std::max(img.cols, img.rows);
        if (max_side <= 0) max_side = 1000;
        if (m > max_side) { double f = (double)max_side / m; cv::resize(img, img, cv::Size(), f, f, cv::INTER_AREA); }
        int W = img.cols, H = img.rows;
        out["w"] = W; out["h"] = H;
        {   // độ nét: phương sai Laplacian
            cv::Mat lap; cv::Laplacian(img, lap, CV_64F);
            cv::Scalar mu, sd; cv::meanStdDev(lap, mu, sd);
            out["sharp"] = sd[0] * sd[0];
        }
        vector<Sq> sq0 = detect_squares(img);
        out["squares"] = (int)sq0.size();
        vector<std::shared_ptr<Template>> tpls;
        { std::lock_guard<std::mutex> lk(g_mu); tpls = g_tpls; }
        for (int flip = 0; flip < 2 && !out["found"].get<bool>(); flip++) {
            vector<Sq> sq = sq0;
            if (flip) for (auto& q : sq) { q.x = W - 1 - q.x; q.y = H - 1 - q.y; }
            for (auto& t : tpls) {
                try {
                    auto [Hinv, n_mk] = register_sheet(img, *t, &sq);
                    cv::Mat Hm = Hinv.inv();
                    vector<cv::Point2f> c = persp(t->corners, Hm);
                    json cs = json::array();
                    for (auto& p : c) {
                        double x = p.x, y = p.y;
                        if (flip) { x = W - 1 - x; y = H - 1 - y; }
                        cs.push_back({x / W, y / H});
                    }
                    out["found"] = true; out["corners"] = cs; out["template_id"] = t->id;
                    out["markers"] = n_mk; out["markers_total"] = 4 + (int)t->local.size();
                    out["upside_down"] = flip == 1;
                    break;
                } catch (const SheetError&) {} catch (const cv::Exception&) {}
            }
        }
    } catch (const std::exception& e) {
        out["error"] = e.what();
    }
    return dup_str(out.dump());
}

// Vẽ ảnh đã chấm. spec: {"scale":0.6,"quality":85,"circles":[[x,y,r,B,G,R,w],...],"texts":[[x,y,size,B,G,R,"..."],...]}
OMR_API unsigned char* omr_annotate(const unsigned char* jpg, int len, const char* spec, int* out_len) {
    using namespace omr;
    if (out_len) *out_len = 0;
    try {
        cv::Mat buf(1, len, CV_8U, (void*)jpg);
        cv::Mat img = cv::imdecode(buf, cv::IMREAD_COLOR);
        if (img.empty()) return nullptr;
        json s = json::parse(spec);
        for (auto& c : s.value("circles", json::array())) {
            cv::circle(img, cv::Point((int)c[0].get<double>(), (int)c[1].get<double>()), (int)c[2].get<double>(),
                       cv::Scalar(c[3].get<int>(), c[4].get<int>(), c[5].get<int>()), c[6].get<int>(), cv::LINE_AA);
        }
        for (auto& t : s.value("texts", json::array())) {
            cv::putText(img, t[6].get<string>(), cv::Point((int)t[0].get<double>(), (int)t[1].get<double>()),
                        cv::FONT_HERSHEY_SIMPLEX, t[2].get<double>(), cv::Scalar(t[3].get<int>(), t[4].get<int>(), t[5].get<int>()),
                        2, cv::LINE_AA);
        }
        double sc = s.value("scale", 1.0);
        if (sc > 0 && sc != 1.0) cv::resize(img, img, cv::Size(), sc, sc, cv::INTER_AREA);
        vector<uchar> enc;
        cv::imencode(".jpg", img, enc, {cv::IMWRITE_JPEG_QUALITY, s.value("quality", 85)});
        unsigned char* p = (unsigned char*)std::malloc(enc.size());
        std::memcpy(p, enc.data(), enc.size());
        if (out_len) *out_len = (int)enc.size();
        return p;
    } catch (...) {
        return nullptr;
    }
}

// ------------------------------------------------------------------ QR đáp án (API v3)
static string qr_once(const cv::Mat& g) {
    string t;
#if (CV_VERSION_MAJOR > 4) || (CV_VERSION_MAJOR == 4 && CV_VERSION_MINOR >= 8)
    try { cv::QRCodeDetectorAruco a; t = a.detectAndDecode(g); } catch (...) { t.clear(); }   // bộ đọc mới, chịu ảnh chụp tốt hơn
    if (!t.empty()) return t;
#endif
    try { cv::QRCodeDetector d; t = d.detectAndDecode(g); } catch (...) { t.clear(); }
    return t;
}

static string qr_try(const cv::Mat& gray) {
    string t = qr_once(gray);
    if (!t.empty()) return t;
    // thử thêm: ảnh nhị phân (tương phản kém) và phóng to (QR nhỏ trong khung)
    try {
        cv::Mat b; cv::threshold(gray, b, 0, 255, cv::THRESH_BINARY | cv::THRESH_OTSU);
        t = qr_once(b);
        if (!t.empty()) return t;
        if (std::max(gray.cols, gray.rows) < 1400) {
            cv::Mat up; cv::resize(gray, up, cv::Size(), 2.0, 2.0, cv::INTER_CUBIC);
            t = qr_once(up);
        }
    } catch (...) { t.clear(); }
    return t;
}

static char* qr_json(const string& t) {
    using namespace omr;
    json out = json::object();
    out["found"] = !t.empty();
    out["text"] = t;
    return dup_str(out.dump());
}

OMR_API char* omr_qr_decode(const unsigned char* gray, int width, int height, int stride) {
    try {
        cv::Mat g(height, width, CV_8UC1, (void*)gray, stride);
        return qr_json(qr_try(g.clone()));
    } catch (...) { return qr_json(""); }
}

OMR_API char* omr_qr_decode_image(const unsigned char* data, int len) {
    try {
        cv::Mat buf(1, len, CV_8U, (void*)data);
        cv::Mat g = cv::imdecode(buf, cv::IMREAD_GRAYSCALE);
        if (g.empty()) return qr_json("");
        int m = std::max(g.cols, g.rows);
        if (m > 2400) { double f = 2400.0 / m; cv::resize(g, g, cv::Size(), f, f, cv::INTER_AREA); }
        return qr_json(qr_try(g));
    } catch (...) { return qr_json(""); }
}

OMR_API unsigned char* omr_qr_encode(const char* text, int module_px, int* out_len) {
    if (out_len) *out_len = 0;
    try {
        cv::QRCodeEncoder::Params p;
        p.correction_level = cv::QRCodeEncoder::CORRECT_LEVEL_M;
        auto enc = cv::QRCodeEncoder::create(p);
        cv::Mat q;
        enc->encode(text, q);
        if (q.empty()) return nullptr;
        if (module_px < 1) module_px = 8;
        cv::Mat big;
        cv::resize(q, big, cv::Size(), module_px, module_px, cv::INTER_NEAREST);
        cv::copyMakeBorder(big, big, 4 * module_px, 4 * module_px, 4 * module_px, 4 * module_px, cv::BORDER_CONSTANT, cv::Scalar(255));
        vector<uchar> png;
        cv::imencode(".png", big, png);
        unsigned char* r = (unsigned char*)std::malloc(png.size());
        std::memcpy(r, png.data(), png.size());
        if (out_len) *out_len = (int)png.size();
        return r;
    } catch (...) { return nullptr; }
}

}  // extern "C"
