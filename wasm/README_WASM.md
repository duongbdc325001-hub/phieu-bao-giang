# Build lại lõi chấm C++ sang WebAssembly

Chỉ cần làm khi **sửa `omr_core.cpp`** (lõi dùng chung với app Android / bản máy tính).
File đã build sẵn nằm ở `public/omr/omr.js` + `public/omr/omr.wasm`. Web chỉ cần hai file này, không cần build lại.

`omr_core.cpp` và `omr_api.h` là **bản y nguyên** từ app `omr_app/native/` (v1.5.3).
`omr_web.cpp` chỉ thêm 3 hàm nhận ảnh RGBA từ canvas (`omrw_read_rgba`, `omrw_detect_rgba`, `omrw_qr_rgba`).
Sửa lõi ở app rồi chép đè 2 file đó vào đây, build lại là web chấm giống app.

## Cần (trên Linux / macOS / WSL)
1. emsdk bản **3.1.50**:
   ```bash
   git clone https://github.com/emscripten-core/emsdk && cd emsdk
   ./emsdk install 3.1.50 && ./emsdk activate 3.1.50 && source ./emsdk_env.sh
   ```
2. OpenCV **4.10** build cho wasm (một lần, ~20–40 phút):
   ```bash
   git clone -b 4.10.0 --depth 1 https://github.com/opencv/opencv && mkdir ocv-build && cd ocv-build
   emcmake cmake ../opencv -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=$HOME/ocv-wasm \
     -DBUILD_SHARED_LIBS=OFF -DBUILD_LIST=core,imgproc,imgcodecs,calib3d,objdetect \
     -DCPU_BASELINE= -DCPU_DISPATCH= -DCV_ENABLE_INTRINSICS=OFF -DCV_TRACE=OFF -DWITH_PTHREADS_PF=OFF \
     -DWITH_OPENCL=OFF -DWITH_IPP=OFF -DWITH_ITT=OFF -DWITH_TBB=OFF -DWITH_EIGEN=OFF -DWITH_LAPACK=OFF \
     -DWITH_JPEG=ON -DBUILD_JPEG=ON -DENABLE_LIBJPEG_TURBO_SIMD=OFF -DWITH_PNG=ON -DBUILD_PNG=ON -DBUILD_ZLIB=ON \
     -DWITH_TIFF=OFF -DWITH_WEBP=OFF -DWITH_OPENJPEG=OFF -DWITH_JASPER=OFF -DWITH_OPENEXR=OFF -DWITH_AVIF=OFF \
     -DWITH_IMGCODEC_HDR=OFF -DWITH_IMGCODEC_SUNRASTER=OFF -DWITH_IMGCODEC_PXM=OFF -DWITH_IMGCODEC_PFM=OFF \
     -DWITH_FFMPEG=OFF -DWITH_GSTREAMER=OFF -DWITH_V4L=OFF -DWITH_GTK=OFF -DWITH_QT=OFF -DWITH_PROTOBUF=OFF \
     -DWITH_ADE=OFF -DWITH_QUIRC=ON -DWITH_FLATBUFFERS=OFF -DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF \
     -DBUILD_EXAMPLES=OFF -DBUILD_opencv_apps=OFF -DBUILD_JAVA=OFF -DBUILD_opencv_python3=OFF \
     -DCMAKE_C_FLAGS=-fwasm-exceptions -DCMAKE_CXX_FLAGS=-fwasm-exceptions
   make -j8 && make install
   ```

## Build
```bash
OCV=$HOME/ocv-wasm ./wasm/build.sh      # ra public/omr/omr.js + omr.wasm (~4,3 MB, nén còn ~1,4 MB)
```

## Ghi chú kỹ thuật
- `-fwasm-exceptions`: lõi dùng try/catch nhiều. Cần Safari 15.2+ / Chrome 95+ (iPhone iOS 15.2 trở lên).
- Không bật SIMD / đa luồng để chạy được trên máy cũ và không cần header COOP/COEP.
- Đã đối chiếu với bản native (OpenCV 4.6): 2 ảnh mẫu `vi_du_anh/` ra **giống hệt** từng câu, SBD, mã đề, cờ lỗi.
