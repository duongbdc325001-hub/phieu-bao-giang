import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Phần Chấm bài: cho service worker /omr/sw.js điều khiển /dashboard/cham-bai (chấm được khi mất mạng),
  // và cho trình duyệt giữ lõi chấm (omr.wasm ~4 MB) 1 ngày rồi tự kiểm tra bản mới.
  async headers() {
    return [
      {
        source: '/omr/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/dashboard/cham-bai' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
      {
        source: '/omr/:file(omr\\.wasm|omr\\.js|omr-worker\\.js)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ]
  },
}

export default nextConfig
