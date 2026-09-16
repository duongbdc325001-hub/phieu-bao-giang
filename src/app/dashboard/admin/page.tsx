'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, CheckCircle, Clock, AlertTriangle, UserCheck } from 'lucide-react'

export default function AdminPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setUsers(data)
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

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans pb-12">
      {/* HEADER TRANG ADMIN */}
      <div className="border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-600" />
            <span>Quản trị hệ thống (Admin Dashboard)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Quản lý danh sách giáo viên, phê duyệt tài khoản và kiểm soát thời hạn bản quyền phần mềm.</p>
        </div>
        <button 
          onClick={loadUsers} 
          disabled={loading}
          className="px-3.5 py-2 bg-white border hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
        >
          {loading ? 'Đang tải...' : 'Làm mới danh sách'}
        </button>
      </div>

      {/* BẢNG DANH SÁCH NGƯỜI DÙNG */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase text-[11px]">
              <th className="p-3.5">Email tài khoản</th>
              <th className="p-3.5">Họ và tên</th>
              <th className="p-3.5 text-center">Trạng thái</th>
              <th className="p-3.5 text-center">Hạn bản quyền</th>
              <th className="p-3.5 text-right">Thao tác quản trị</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  Chưa có tài khoản nào đăng ký trong hệ thống.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isExpired = u.expiry_date && new Date(u.expiry_date) < new Date()
                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-black text-slate-900">{u.email || 'Chưa cập nhật email'}</td>
                    <td className="p-3.5 font-medium text-slate-600">{u.full_name || '—'}</td>
                    <td className="p-3.5 text-center">
                      {u.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px]">
                          <Clock className="w-3 h-3" /> Chờ duyệt
                        </span>
                      )}
                      {u.status === 'active' && !isExpired && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                          <CheckCircle className="w-3 h-3" /> Đang hoạt động
                        </span>
                      )}
                      {(u.status === 'expired' || isExpired) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full font-bold text-[10px]">
                          <AlertTriangle className="w-3 h-3" /> Hết hạn
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-700">
                      {u.expiry_date ? new Date(u.expiry_date).toLocaleDateString('vi-VN') : 'Chưa cấp hạn'}
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      {u.status === 'pending' && (
                        <button 
                          onClick={() => handleApprove(u.id)} 
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-2xs transition cursor-pointer inline-flex items-center gap-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Phê duyệt</span>
                        </button>
                      )}
                      <button 
                        onClick={() => handleExtendYear(u.id, u.expiry_date)} 
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-2xs transition cursor-pointer"
                      >
                        Gia hạn 1 năm
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
  )
}