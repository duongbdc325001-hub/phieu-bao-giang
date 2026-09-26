'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Shield, CheckCircle, Clock, AlertTriangle, UserCheck, CalendarPlus, RefreshCw, ShieldAlert } from 'lucide-react'

interface UserProfile {
  id: string
  email: string | null
  full_name: string | null
  department: string | null
  role: string | null
  status: string | null
  expiry_date: string | null
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  const verifyAdminAndLoad = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        setIsAdmin(false)
        router.replace('/dashboard/schedule')
        return
      }

      setIsAdmin(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers((data as UserProfile[]) || [])
    } catch (err: any) {
      alert('Lỗi nạp danh sách: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    verifyAdminAndLoad()
  }, [verifyAdminAndLoad])

  // Xử lý id an toàn (chấp nhận string | null | undefined)
  const handleApprove = async (id: string | null | undefined) => {
    if (!id) return
    setProcessingId(id)
    try {
      const expiry = new Date()
      expiry.setFullYear(expiry.getFullYear() + 1)
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active', expiry_date: expiry.toISOString() })
        .eq('id', id)

      if (error) throw error
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: 'active', expiry_date: expiry.toISOString() } : u))
      )
    } catch (err: any) {
      alert('Lỗi phê duyệt: ' + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  // Xử lý currentExpiry an toàn (chấp nhận string | null | undefined)
  const handleExtendYear = async (id: string | null | undefined, currentExpiry: string | null | undefined) => {
    if (!id) return
    setProcessingId(id)
    try {
      let base = currentExpiry ? new Date(currentExpiry) : new Date()
      if (base.getTime() < Date.now()) base = new Date()
      base.setFullYear(base.getFullYear() + 1)

      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active', expiry_date: base.toISOString() })
        .eq('id', id)

      if (error) throw error
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: 'active', expiry_date: base.toISOString() } : u))
      )
    } catch (err: any) {
      alert('Lỗi gia hạn: ' + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  if (loading && isAdmin === null) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold">Đang xác thực quyền Admin...</span>
      </div>
    )
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Từ chối truy cập</h2>
        <p className="text-xs text-slate-500 mt-1">Bạn không có quyền quản trị hệ thống.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-600" />
            <span>Quản trị hệ thống (Admin Dashboard)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Phê duyệt tài khoản giáo viên và kiểm soát thời hạn bản quyền phần mềm.</p>
        </div>
        <button
          onClick={verifyAdminAndLoad}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Họ và tên</th>
                <th className="py-3.5 px-4">Tổ bộ môn</th>
                <th className="py-3.5 px-4 text-center">Trạng thái</th>
                <th className="py-3.5 px-4 text-center">Hạn bản quyền</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chưa có tài khoản nào đăng ký trong hệ thống.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const expired = u.expiry_date ? new Date(u.expiry_date).getTime() < Date.now() : false
                  const isProc = processingId === u.id

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{u.email || '—'}</td>
                      <td className="py-3.5 px-4">{u.full_name || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-600">{u.department || 'Chưa phân tổ'}</td>
                      <td className="py-3.5 px-4 text-center">
                        {u.status === 'pending' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Chờ duyệt
                          </span>
                        )}
                        {u.status === 'active' && !expired && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Hoạt động
                          </span>
                        )}
                        {expired && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Hết hạn
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold">
                        {u.expiry_date ? new Date(u.expiry_date).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {u.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(u.id)}
                            disabled={isProc}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer disabled:opacity-50"
                          >
                            {isProc ? 'Đang duyệt...' : 'Duyệt'}
                          </button>
                        )}
                        <button
                          onClick={() => handleExtendYear(u.id, u.expiry_date)}
                          disabled={isProc}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer disabled:opacity-50"
                        >
                          {isProc ? 'Đang lưu...' : '+1 Năm'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}