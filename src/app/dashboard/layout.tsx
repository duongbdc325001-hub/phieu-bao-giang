'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  CalendarDays, 
  BookOpen, 
  Users, 
  FileSpreadsheet, 
  TrendingUp, 
  LogOut,
  BookMarked,
  Menu,
  X
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard/schedule', label: 'Thời khóa biểu', icon: CalendarDays },
  { href: '/dashboard/curriculum', label: 'Phân phối chương trình', icon: BookOpen },
  { href: '/dashboard/classes', label: 'Quản lý Lớp học', icon: Users },
  { href: '/dashboard/reports', label: 'Lịch Báo Giảng Tuần', icon: FileSpreadsheet },
  { href: '/dashboard/progress', label: 'Tiến độ thực hiện CT', icon: TrendingUp },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const NavContent = () => (
    <div className="flex flex-col justify-between h-full bg-slate-900 text-slate-100">
      <div>
        {/* LOGO */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 rounded-xl">
              <BookMarked className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-black text-sm tracking-wide text-white">Sổ Báo Giảng</h1>
              <p className="text-[10px] text-slate-400">Trường THPT Chuyên HVT</p>
            </div>
          </div>
          {/* Nút đóng trên mobile */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DANH SÁCH MENU */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
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

      {/* FOOTER NGƯỜI DÙNG */}
      <div className="p-4 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs">
            D
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-200 truncate leading-tight">Bùi Đức Dương</p>
            <p className="text-[10px] text-slate-400 truncate">Giáo viên Toán</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* SIDEBAR CỐ ĐỊNH TRÊN LAPTOP */}
      <aside className="hidden md:flex w-64 shrink-0 h-screen sticky top-0 border-r border-slate-800 z-30">
        <NavContent />
      </aside>

      {/* HEADER DI ĐỘNG (CHỈ HIỆN TRÊN ĐIỆN THOẠI) */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-600 rounded-lg">
            <BookMarked className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">Sổ Báo Giảng</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* MENU TRƯỢT DI ĐỘNG (DRAWER) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          <div className="relative w-64 max-w-[80vw] h-full shadow-2xl z-10">
            <NavContent />
          </div>
        </div>
      )}

      {/* VÙNG NỘI DUNG CHÍNH */}
      <main className="flex-1 p-3 sm:p-6 overflow-y-auto max-w-full">
        {children}
      </main>
    </div>
  )
}