import React from 'react';
import { AlertCircle, Phone } from 'lucide-react';

export default function AccountExpiredView({ expiryDate }: { expiryDate?: string }) {
  const adminZaloPhone = "0989532111";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center border border-gray-100">
        {/* Icon cảnh báo đỏ */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500 mb-4">
          <AlertCircle className="h-8 w-8" />
        </div>

        {/* Tiêu đề */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Tài khoản đã hết hạn</h2>
        
        {/* Nội dung thông báo trạng thái */}
        <p className="text-gray-600 mb-6 text-sm leading-relaxed">
          Tài khoản của bạn đã hết hạn sử dụng vào ngày <span className="font-semibold text-gray-800">{expiryDate || "đã chọn"}</span>. Vui lòng liên hệ quản trị viên để gia hạn và tiếp tục sử dụng hệ thống.
        </p>

        {/* Thông tin liên hệ trực tiếp số Zalo của anh */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left border border-blue-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">Thông tin liên hệ Admin:</p>
          <div className="flex items-center text-gray-700 text-sm font-medium">
            <Phone className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
            <span>Zalo/Điện thoại: </span>
            <a href={`https://zalo.me/${adminZaloPhone}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600 hover:underline font-bold">
              {adminZaloPhone}
            </a>
          </div>
        </div>

        {/* Nút bấm nhanh mở Zalo */}
        <a
          href={`https://zalo.me/${adminZaloPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
        >
          Nhắn tin Zalo yêu cầu gia hạn ngay
        </a>
      </div>
    </div>
  );
}