'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  CalendarDays, 
  BookOpen, 
  Users, 
  FileSpreadsheet, 
  TrendingUp, 
  LogOut,
  BookMarked
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// DANH SÁCH MENU ĐÃ LOẠI BỎ "XUẤT PHIẾU BÁO GIẢNG"
const NAV_ITEMS = [
  { href: '/dashboard/schedule', label: 'Thời khóa biểu', icon: CalendarDays },
  { href: '/dashboard/curriculum', label: 'Phân phối chương trình', icon: BookOpen },
  { href: '/dashboard/classes', label: 'Quản lý Lớp học', icon: Users },
  { href: '/dashboard/reports', label: 'Lịch Báo Giảng Tuần', icon: FileSpreadsheet },
  { href: '/dashboard/progress', label: 'Tiến độ thực hiện chương trình', icon: TrendingUp },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col justify-between h-screen shrink-0 border-r border-slate-800">
      <div>
        {/* LOGO */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
          <div className="p-2 bg-emerald-600 rounded-xl">
            <BookMarked className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-base tracking-wide text-white leading-tight">Sổ Báo Giảng</h1>
            <p className="text-[11px] text-slate-400 font-medium">Hệ thống quản lý thông minh</p>
          </div>
        </div>

        {/* DANH SÁCH MENU CHUẨN 5 MỤC */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs transition duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* THÔNG TIN NGƯỜI DÙNG & ĐĂNG XUẤT */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs">
            D
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-200 truncate leading-tight">Bùi Đức Dương</p>
            <p className="text-[10px] text-slate-400 truncate">buiduong2010@gmail.com</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 rounded-lg transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}