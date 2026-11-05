/* Service worker chỉ cho phần chấm bài (scope /dashboard/cham-bai/): mở được trang và chấm khi mất mạng.
   - /omr/* (lõi wasm, mẫu phiếu) và /_next/static/*: lấy từ cache trước, cập nhật ngầm.
   - Trang chấm bài: lấy mạng trước, mất mạng thì dùng bản đã lưu. */
const CACHE = "cham-bai-v5";
// Lõi chấm: máy có WebAssembly SIMD dùng omr-simd.wasm (nhanh ~2 lần), máy cũ dùng omr.wasm – chỉ lưu sẵn đúng bản cần.
const SIMD = (() => {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
  catch (e) { return false; }
})();
const CORE = ["/omr/omr.js", SIMD ? "/omr/omr-simd.wasm" : "/omr/omr.wasm", "/omr/omr-worker.js",
  "/omr/templates/phieu_32_6_12_v2_toado.json", "/omr/templates/phieu_40_8_6_toado.json",
  "/omr/templates/phieu_40_8_6_gt_toado.json", "/omr/templates/phieu_toan_12_4_6_toado.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("cham-bai-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const staleWhileRevalidate = async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then((r) => { if (r.ok) e.waitUntil(c.put(req, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  };

  if (url.pathname.startsWith("/omr/") || url.pathname.startsWith("/_next/static/")) {
    e.respondWith(staleWhileRevalidate());
    return;
  }
  if (req.mode === "navigate" && url.pathname.startsWith("/dashboard/cham-bai")) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await fetch(req);
        if (r.ok) {
          const puts = [c.put(req, r.clone())];
          // trang 1 bài chấm có cùng vỏ HTML cho mọi id -> giữ 1 bản dùng chung khi mất mạng
          if (/^\/dashboard\/cham-bai\/[^/]+$/.test(url.pathname)) puts.push(c.put("/dashboard/cham-bai/__bai", r.clone()));
          e.waitUntil(Promise.all(puts));
        }
        return r;
      } catch {
        const isBai = /^\/dashboard\/cham-bai\/[^/]+$/.test(url.pathname);
        return (await c.match(req)) || (isBai && (await c.match("/dashboard/cham-bai/__bai"))) || (await c.match("/dashboard/cham-bai")) || Response.error();
      }
    })());
  }
});
