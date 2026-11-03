#!/usr/bin/env bash
# Build lõi chấm C++ -> public/omr/omr.js + omr.wasm
# Cần: emscripten 3.1.50 (LLVM 18) và OpenCV 4.10 build cho wasm (xem README_WASM.md).
set -euo pipefail
cd "$(dirname "$0")"
OCV=${OCV:?Đặt biến OCV = thư mục cài OpenCV wasm, ví dụ OCV=$HOME/ocv-wasm ./build.sh}
OUT=../public/omr
LIBS="$OCV/lib/libopencv_objdetect.a $OCV/lib/libopencv_calib3d.a $OCV/lib/libopencv_features2d.a \
 $OCV/lib/libopencv_flann.a $OCV/lib/libopencv_imgcodecs.a $OCV/lib/libopencv_imgproc.a $OCV/lib/libopencv_core.a \
 $(ls $OCV/lib/opencv4/3rdparty/*.a)"
FUNCS='["_omr_version","_omr_add_template","_omr_clear_templates","_omr_read2","_omr_annotate","_omr_qr_decode_image","_omr_qr_encode","_omr_alloc","_omr_free","_omrw_read_rgba","_omrw_detect_rgba","_omrw_qr_rgba","_malloc","_free"]'
em++ -O3 -std=c++17 -fwasm-exceptions -DOMR_BUILD -I"$OCV/include/opencv4" -Ithird_party omr_web.cpp $LIBS \
  -o "$OUT/omr.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=createOmr -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=1GB -sSTACK_SIZE=2MB \
  -sEXPORTED_FUNCTIONS="$FUNCS" \
  -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8","HEAP32"]' \
  -sFILESYSTEM=0 -sASSERTIONS=0
ls -la "$OUT"/omr.js "$OUT"/omr.wasm
