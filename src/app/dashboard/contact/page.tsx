'use client'

import { User, School, MessageSquare, ExternalLink } from 'lucide-react'

export default function ContactPage() {
  // Số điện thoại hoặc link Zalo của anh (có thể thay đổi số bên dưới)
  const zaloNumber = '0989532111' 

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans pb-8">
      <div className="border-b pb-3">
        <h1 className="text-2xl font-black text-slate-900 leading-tight">Liên hệ & Hỗ trợ</h1>
        <p className="text-xs text-slate-500">Thông tin hỗ trợ kỹ thuật, giải đáp thắc mắc và kết nối qua Zalo.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* THÔNG TIN TÁC GIẢ & ZALO */}
        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2 border-b pb-2">
            <User className="w-4 h-4 text-emerald-600" />
            <span>Thông tin giáo viên / Tác giả</span>
          </h2>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 w-24">Họ và tên:</span>
              <span className="font-black text-slate-900 text-sm">Bùi Đức Dương</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 w-24">Môn giảng dạy:</span>
              <span className="font-semibold">Môn Toán</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 w-24">Đơn vị:</span>
              <span className="font-semibold">Trường THPT Chuyên HVT</span>
            </div>
            
            {/* NÚT LIÊN HỆ ZALO NHANH */}
            <div className="pt-2">
              <a
                href={`https://zalo.me/${zaloNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Nhắn tin Zalo ({zaloNumber})</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>
            </div>
          </div>
        </div>

        {/* THÔNG TIN HỖ TRỢ KỸ THUẬT */}
        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2 border-b pb-2">
            <School className="w-4 h-4 text-emerald-600" />
            <span>Hỗ trợ hệ thống</span>
          </h2>
          <div className="space-y-2.5 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 w-24">Phần mềm:</span>
              <span className="font-semibold text-emerald-800">Quản lý Sổ Báo Giảng Điện Tử</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 w-24">Phiên bản:</span>
              <span className="font-semibold">Standard v2.0 (2026)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 w-24">Trạng thái:</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">Đang hoạt động ổn định</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}