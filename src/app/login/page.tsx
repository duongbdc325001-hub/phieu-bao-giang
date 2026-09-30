'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    if (isRegister) {
      // Đăng ký tài khoản giáo viên mới
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      })

      if (error) {
        setErrorMsg(error.message)
      } else {
        setSuccessMsg('Đăng ký thành công! Đang chuyển hướng vào hệ thống...')
        setTimeout(() => {
          router.push('/dashboard/schedule')
          router.refresh()
        }, 1200)
      }
    } else {
      // Đăng nhập
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setErrorMsg('Email hoặc mật khẩu không chính xác: ' + error.message)
      } else {
        router.push('/dashboard/schedule')
        router.refresh()
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 font-sans text-slate-800">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full space-y-6 border border-slate-100">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-emerald-50 rounded-2xl text-emerald-600 mb-1">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Sổ Báo Giảng Điện Tử</h1>
          <p className="text-xs text-slate-500 font-medium">
            {isRegister ? 'Đăng ký tài khoản giáo viên mới' : 'Hệ thống quản lý thời khóa biểu & báo giảng'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl text-xs bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Họ và tên giáo viên:</label>
              <input
                type="text"
                placeholder="vd: Bùi Đức Dương"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email:</label>
            <input
              type="email"
              placeholder="giaovien@truong.edu.vn hoặc gmail..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Mật khẩu:</label>
            <input
              type="password"
              placeholder="Tối thiểu 6 ký tự..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border rounded-xl font-medium focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
          >
            {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            <span>{loading ? 'Đang xử lý...' : isRegister ? 'Đăng Ký Tài Khoản' : 'Đăng Nhập'}</span>
          </button>
        </form>

        <div className="text-center pt-2 border-t text-xs">
          {isRegister ? (
            <p className="text-slate-500">
              Đã có tài khoản?{' '}
              <button
                type="button"
                onClick={() => setIsRegister(false)}
                className="font-bold text-emerald-700 hover:underline"
              >
                Đăng nhập ngay
              </button>
            </p>
          ) : (
            <p className="text-slate-500">
              Chưa có tài khoản?{' '}
              <button
                type="button"
                onClick={() => setIsRegister(true)}
                className="font-bold text-emerald-700 hover:underline"
              >
                Đăng ký tài khoản mới
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}