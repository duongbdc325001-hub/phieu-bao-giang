#!/usr/bin/env bash
# Build lõi chấm C++ -> public/omr/omr.js + omr.wasm (bản thường) + omr-simd.wasm (bản SIMD, nhanh ~2 lần)
# Cần: emscripten 3.1.50 (LLVM 18) và 2 bản OpenCV 4.10 build cho wasm (xem README_WASM.md):
#   OCV      = OpenCV build thường (CV_ENABLE_INTRINSICS=OFF)
#   OCV_SIMD = OpenCV build với -msimd128 và CV_ENABLE_INTRINSICS=ON
# Ví dụ: OCV=$HOME/ocv-wasm OCV_SIMD=$HOME/ocv-wasm-simd ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
OCV=${OCV:?Đặt biến OCV = thư mục cài OpenCV wasm bản thường}
OCV_SIMD=${OCV_SIMD:?Đặt biến OCV_SIMD = thư mục cài OpenCV wasm bản SIMD}
OUT=../public/omr
TMP=$(mktemp -d)
FUNCS='["_omr_version","_omr_add_template","_omr_clear_templates","_omr_read2","_omr_annotate","_omr_qr_decode_image","_omr_qr_encode","_omr_alloc","_omr_free","_omrw_read_rgba","_omrw_detect_rgba","_omrw_qr_rgba","_malloc","_free"]'

build() {   # $1 = thư mục OpenCV, $2 = cờ thêm, $3 = thư mục ra
  local O=$1
  local LIBS="$O/lib/libopencv_objdetect.a $O/lib/libopencv_calib3d.a $O/lib/libopencv_features2d.a \
 $O/lib/libopencv_flann.a $O/lib/libopencv_imgcodecs.a $O/lib/libopencv_imgproc.a $O/lib/libopencv_core.a \
 $(ls $O/lib/opencv4/3rdparty/*.a)"
  mkdir -p "$3"
  em++ -O3 $2 -std=c++17 -fwasm-exceptions -DOMR_BUILD -I"$O/include/opencv4" -Ithird_party omr_web.cpp $LIBS \
    -o "$3/omr.js" \
    -sMODULARIZE=1 -sEXPORT_NAME=createOmr -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=1GB -sSTACK_SIZE=2MB \
    -sEXPORTED_FUNCTIONS="$FUNCS" \
    -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8","HEAP32"]' \
    -sFILESYSTEM=0 -sASSERTIONS=0
}

build "$OCV" "" "$TMP/base"
build "$OCV_SIMD" "-msimd128" "$TMP/simd"
# 2 bản dùng chung 1 file omr.js (cùng cờ build, chỉ khác lệnh SIMD bên trong .wasm)
cmp -s "$TMP/base/omr.js" "$TMP/simd/omr.js" || { echo "omr.js của 2 bản khác nhau – kiểm tra lại cờ build"; exit 1; }
cp "$TMP/base/omr.js" "$OUT/omr.js"
cp "$TMP/base/omr.wasm" "$OUT/omr.wasm"
cp "$TMP/simd/omr.wasm" "$OUT/omr-simd.wasm"
rm -rf "$TMP"
ls -la "$OUT"/omr.js "$OUT"/omr.wasm "$OUT"/omr-simd.wasm
