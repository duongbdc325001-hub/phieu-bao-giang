'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  CalendarDays, 
  BookOpen, 
  FileSpreadsheet, 
  TrendingUp, 
  LogOut,
  BookMarked,
  Menu,
  X,
  Download,
  MessageSquare,
  ShieldAlert,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard/schedule', label: 'Thời khóa biểu', icon: CalendarDays },
  { href: '/dashboard/curriculum', label: 'Phân phối chương trình', icon: BookOpen },
  { href: '/dashboard/reports', label: 'Lịch Báo Giảng Tuần', icon: FileSpreadsheet },
  { href: '/dashboard/progress', label: 'Tiến độ thực hiện CT', icon: TrendingUp },
  { href: '/dashboard/contact', label: 'Liên hệ', icon: MessageSquare },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Trạng thái kiểm soát bảo mật và phân quyền
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [accountStatus, setAccountStatus] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('teacher')
  const [userEmail, setUserEmail] = useState<string>('')

  // State lưu thông tin động của người dùng đang đăng nhập
  const [userInfo, setUserInfo] = useState({
    fullName: 'Đang tải...',
    roleOrSubject: 'Giáo viên',
    initial: 'G'
  })

  // Lấy thông tin user, kiểm tra trạng thái duyệt và hạn bản quyền
  useEffect(() => {
    const checkUserAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      setUserEmail(user.email || '')

      // Lấy thông tin từ bảng profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, department, role, status, expiry_date')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        setUserRole(profile.role || 'teacher')
        
        // Kiểm tra xem đã hết hạn bản quyền chưa
        const isExpired = profile.expiry_date && new Date(profile.expiry_date) < new Date()
        if (isExpired && profile.role !== 'admin') {
          setAccountStatus('expired')
        } else {
          setAccountStatus(profile.status || 'pending')
        }

        const name = profile.full_name || user.email?.split('@')[0] || 'Giáo viên'
        const sub = profile.department || (profile.role === 'admin' ? 'Quản trị viên' : 'Giáo viên bộ môn')
        const firstChar = name.charAt(0).toUpperCase()

        setUserInfo({
          fullName: name,
          roleOrSubject: sub,
          initial: firstChar
        })
      } else {
        setAccountStatus('pending')
      }

      setCheckingAuth(false)
    }

    checkUserAccess()
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Hàm tải file nén mẫu (.rar)
  const handleDownloadRar = () => {
    const link = document.createElement('a')
    link.href = '/file-mau.rar'
    link.download = 'file-mau.rar'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Màn hình chờ khi đang kiểm tra quyền
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xs font-bold">
        Đang kiểm tra quyền truy cập hệ thống...
      </div>
    )
  }

  // CHẶN NẾU TÀI KHOẢN CHỜ DUYỆT (PENDING) VÀ KHÔNG PHẢI ADMIN
  if (accountStatus === 'pending' && userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900">Tài khoản đang chờ phê duyệt</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tài khoản <span className="font-bold text-slate-900">{userEmail}</span> của thầy/cô đã được đăng ký thành công nhưng chưa được Quản trị viên kích hoạt.
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl border text-xs text-slate-500 text-left space-y-1">
            <p className="font-bold text-slate-700">Hướng dẫn:</p>
            <p>• Vui lòng liên hệ trực tiếp với Quản trị viên (Thầy Bùi Đức Dương) để được duyệt nhanh chóng.</p>
            <p>• Sau khi được duyệt, hãy bấm nút kiểm tra lại bên dưới.</p>
          </div>
          <div className="pt-2 flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Kiểm tra lại trạng thái
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // CHẶN NẾU TÀI KHOẢN ĐÃ HẾT HẠN (EXPIRED) VÀ KHÔNG PHẢI ADMIN
  if (accountStatus === 'expired' && userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900">Bản quyền phần mềm đã hết hạn</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Thời hạn sử dụng phần mềm của tài khoản <span className="font-bold text-slate-900">{userEmail}</span> đã kết thúc.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất tài khoản</span>
          </button>
        </div>
      </div>
    )
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
            className="md:hidden p-1.5 text-slate-400 hover:text-white cursor-pointer"
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

          {/* HIỂN THỊ NÚT QUẢN TRỊ ADMIN NẾU LÀ ADMIN */}
          {userRole === 'admin' && (
            <Link
              href="/dashboard/admin"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition duration-150 mt-4 border border-emerald-600/50 ${
                pathname === '/dashboard/admin'
                  ? 'bg-emerald-700 text-white shadow-md'
                  : 'text-emerald-400 hover:bg-emerald-950/40'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <span>Quản Trị Admin</span>
            </Link>
          )}
        </nav>

        {/* NÚT TẢI FILE MẪU NGAY TRONG SIDEBAR */}
        <div className="px-3 pt-2">
          <button
            onClick={handleDownloadRar}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black text-xs transition shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải File Mẫu</span>
          </button>
        </div>
      </div>

      {/* FOOTER NGƯỜI DÙNG HIỂN THỊ ĐỘNG */}
      <div className="p-4 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs shrink-0">
            {userInfo.initial}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-200 truncate leading-tight">{userInfo.fullName}</p>
            <p className="text-[10px] text-slate-400 truncate">{userInfo.roleOrSubject}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
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

      {/* KHUNG NỘI DUNG CHÍNH BÊN PHẢI */}
      <div className="flex-1 flex flex-col min-w-0">
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
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        {/* VÙNG NỘI DUNG TRANG */}
        <main className="flex-1 p-3 sm:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}