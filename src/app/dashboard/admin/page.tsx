'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminNamHoc from '@/components/admin-nam-hoc'
import { PageHeader, BTN_SECONDARY, BTN_PRIMARY } from '@/components/ui/page'
import { CheckCircle, Clock, AlertTriangle, UserCheck, RefreshCw } from 'lucide-react'

interface UserProfile {
  id: string
  email: string | null
  full_name: string | null
  status: string | null
  expiry_date: string | null
  created_at: string
}

export default function AdminPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Lỗi tải danh sách profiles:', error.message)
      alert('Lỗi tải danh sách: ' + error.message)
    } else if (data) {
      setUsers(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // Phê duyệt tài khoản và cấp hạn dùng 1 năm từ hôm nay
  const handleApprove = async (userId: string) => {
    const oneYearLater = new Date()
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)

    const { error } = await supabase
      .from('profiles')
      .update({ 
        status: 'active', 
        expiry_date: oneYearLater.toISOString() 
      })
      .eq('id', userId)

    if (error) {
      alert('Lỗi phê duyệt: ' + error.message)
    } else {
      alert('Đã phê duyệt và cấp bản quyền 1 năm thành công!')
      loadUsers()
    }
  }

  // Gia hạn thêm 1 năm cho tài khoản
  const handleExtendYear = async (userId: string, currentExpiry: string) => {
    const baseDate = currentExpiry ? new Date(currentExpiry) : new Date()
    if (baseDate < new Date()) {
      baseDate.setTime(new Date().getTime())
    }
    baseDate.setFullYear(baseDate.getFullYear() + 1)

    const { error } = await supabase
      .from('profiles')
      .update({ 
        status: 'active', 
        expiry_date: baseDate.toISOString() 
      })
      .eq('id', userId)

    if (error) {
      alert('Lỗi gia hạn: ' + error.message)
    } else {
      alert('Đã gia hạn thành công thêm 1 năm!')
      loadUsers()
    }
  }

  const statusBadge = (u: UserProfile) => {
    const isExpired = !!u.expiry_date && new Date(u.expiry_date) < new Date()
    if (u.status === 'pending')
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 rounded-full font-semibold text-[11px]"><Clock className="w-3 h-3" /> Chờ duyệt</span>
    if (u.status === 'expired' || isExpired)
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 rounded-full font-semibold text-[11px]"><AlertTriangle className="w-3 h-3" /> Hết hạn</span>
    if (u.status === 'active')
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 rounded-full font-semibold text-[11px]"><CheckCircle className="w-3 h-3" /> Đang hoạt động</span>
    return null
  }
  const expiryText = (u: UserProfile) => (u.expiry_date ? new Date(u.expiry_date).toLocaleDateString('vi-VN') : 'Chưa cấp hạn')
  const actions = (u: UserProfile) => (
    <>
      {u.status === 'pending' && (
        <button onClick={() => handleApprove(u.id)} className={BTN_PRIMARY}>
          <UserCheck className="w-4 h-4" /> Phê duyệt
        </button>
      )}
      <button onClick={() => handleExtendYear(u.id, u.expiry_date || '')} className={BTN_SECONDARY}>
        Gia hạn 1 năm
      </button>
    </>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <PageHeader
        title="Quản trị"
        subtitle="Năm học, danh sách giáo viên, phê duyệt và thời hạn sử dụng tài khoản."
        actions={
          <button onClick={loadUsers} disabled={loading} className={BTN_SECONDARY}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Đang tải...' : 'Tải lại danh sách'}</span>
          </button>
        }
      />

      {/* NĂM HỌC: thêm năm mới, nhập ngày bắt đầu tuần 1 */}
      <AdminNamHoc />

      {/* GIÁO VIÊN */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <h2 className="px-5 pt-4 pb-3 text-base font-bold text-slate-900">Giáo viên ({users.length})</h2>
        {users.length === 0 ? (
          <p className="px-5 pb-8 pt-4 text-center text-sm text-slate-400">{loading ? 'Đang tải dữ liệu...' : 'Chưa có tài khoản nào đăng ký.'}</p>
        ) : (
          <>
            {/* máy tính: bảng */}
            <table className="hidden md:table w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-y border-slate-200">
                  <th className="px-5 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Họ và tên</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5">Hạn sử dụng</th>
                  <th className="px-5 py-2.5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-900">{u.email || 'Chưa có email'}</td>
                    <td className="px-3 py-3 text-slate-600">{u.full_name || '–'}</td>
                    <td className="px-3 py-3">{statusBadge(u)}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{expiryText(u)}</td>
                    <td className="px-5 py-3"><div className="flex justify-end gap-2">{actions(u)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* điện thoại: thẻ */}
            <ul className="md:hidden divide-y divide-slate-100 border-t border-slate-100">
              {users.map((u) => (
                <li key={u.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </div>
                    {statusBadge(u)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Hạn: <span className="font-semibold text-slate-700">{expiryText(u)}</span></span>
                    <div className="flex gap-2">{actions(u)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
