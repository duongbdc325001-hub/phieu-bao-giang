'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, BookOpen, Clock, Users, FileText, Activity, LogOut, User } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('Giáo viên')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setUserEmail(session.user.email ?? null)
        const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0]
        setUserName(name)
      }
    }
    checkUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { href: '/dashboard/schedule', label: 'Thời khóa biểu', icon: Clock },
    { href: '/dashboard/curriculum', label: 'Phân phối chương trình', icon: BookOpen },
    { href: '/dashboard/classes', label: 'Quản lý Lớp học', icon: Users },
    { href: '/dashboard/reports', label: 'Lịch Báo Giảng Tuần', icon: Calendar },
    { href: '/dashboard/export', label: 'Xuất phiếu báo giảng', icon: FileText },
    { href: '/dashboard/progress', label: 'Tiến độ thực hiện chương trình', icon: Activity },
  ]

  return (
    <div className="flex min-h-screen bg-slate-100 font-sans text-slate-800">
      {/* Menu bên trái */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-4 border-b border-slate-800 flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            <span className="font-bold text-base tracking-wide text-white">Sổ Báo Giảng</span>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-emerald-400'}`} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Thông tin cá nhân & Đăng xuất */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5 px-2 py-2 text-xs">
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-black text-white shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="overflow-hidden leading-tight flex-1">
              <span className="font-bold text-slate-100 block truncate">{userName}</span>
              <span className="text-[10px] text-slate-400 block truncate">{userEmail}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-2 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Vùng nội dung */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}