'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminNamHoc from '@/components/admin-nam-hoc'
import { PageHeader, BTN_SECONDARY, BTN_PRIMARY } from '@/components/ui/page'
import { CheckCircle, Clock, AlertTriangle, UserCheck, RefreshCw, Search } from 'lucide-react'
import { useSchoolYear } from '@/components/school-year'

interface UserProfile {
  id: string
  email: string | null
  full_name: string | null
  status: string | null
  expiry_date: string | null
  created_at: string
}

// Thống kê sử dụng (hàm admin_usage trên Supabase, xem supabase/migrations/20261125_admin_thong_ke.sql)
interface Usage {
  user_id: string
  last_sign_in_at: string | null
  so_lop: number
  so_tiet: number
  so_khung: number
  lop_chua_ppct: number
  so_dieu_chinh: number
  hoat_dong_gan_nhat: string | null
}

const DAY_MS = 86400000
// "hôm nay", "hôm qua", "5 ngày trước", "3 tháng trước"
function timeAgo(iso: string | null): string {
  if (!iso) return 'Chưa có'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS)
  if (days <= 0) return 'Hôm nay'
  if (days === 1) return 'Hôm qua'
  if (days < 30) return `${days} ngày trước`
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`
  return d.toLocaleDateString('vi-VN')
}
const daysSince = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY_MS : Infinity)

type SortKey = 'moi' | 'hoat_dong' | 'lau_khong_dung' | 'ten'

export default function AdminPage() {
  const supabase = createClient()
  const { year } = useSchoolYear()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState<Record<string, Usage>>({})
  const [usageError, setUsageError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('hoat_dong')

  const loadUsage = async () => {
    const { data, error } = await supabase.rpc('admin_usage', { p_year: year.id })
    if (error) {
      setUsageError(
        error.message.includes('admin_usage') || error.code === 'PGRST202'
          ? 'Chưa bật thống kê: chạy file SQL 20261125_admin_thong_ke.sql trên Supabase.'
          : 'Không tải được thống kê: ' + error.message
      )
      setUsage({})
      return
    }
    setUsageError(null)
    const map: Record<string, Usage> = {}
    for (const r of (data || []) as Usage[]) map[r.user_id] = r
    setUsage(map)
  }

  useEffect(() => {
    loadUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year.id])

  const lastActive = (u: UserProfile) => {
    const us = usage[u.id]
    if (!us) return null
    const a = us.last_sign_in_at, b = us.hoat_dong_gan_nhat
    if (!a) return b
    if (!b) return a
    return a > b ? a : b
  }

  const shownUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = users.filter((u) => !q || (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q))
    const by: Record<SortKey, (a: UserProfile, b: UserProfile) => number> = {
      moi: (a, b) => (a.created_at < b.created_at ? 1 : -1),
      hoat_dong: (a, b) => daysSince(lastActive(a)) - daysSince(lastActive(b)),
      lau_khong_dung: (a, b) => daysSince(lastActive(b)) - daysSince(lastActive(a)),
      ten: (a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'vi'),
    }
    return [...list].sort(by[sortKey])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, usage, query, sortKey])

  const hasUsage = Object.keys(usage).length > 0
  const summary = {
    total: users.length,
    active7: users.filter((u) => daysSince(lastActive(u)) <= 7).length,
    noTkb: users.filter((u) => usage[u.id] && usage[u.id].so_tiet === 0).length,
    missingPpct: users.filter((u) => (usage[u.id]?.lop_chua_ppct || 0) > 0).length,
  }

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
          <button onClick={() => { loadUsers(); loadUsage() }} disabled={loading} className={BTN_SECONDARY}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Đang tải...' : 'Tải lại danh sách'}</span>
          </button>
        }
      />

      {/* NĂM HỌC: thêm năm mới, nhập ngày bắt đầu tuần 1 */}
      <AdminNamHoc />

      {/* TỔNG QUAN SỬ DỤNG */}
      {hasUsage && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Giáo viên', value: summary.total, note: 'tài khoản' },
            { label: 'Hoạt động 7 ngày qua', value: summary.active7, note: 'người' },
            { label: `Chưa nhập TKB ${year.id}`, value: summary.noTkb, note: 'người', warn: summary.noTkb > 0 },
            { label: 'Có lớp chưa gán PPCT', value: summary.missingPpct, note: 'người', warn: summary.missingPpct > 0 },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${c.warn ? 'text-amber-700' : 'text-slate-900'}`}>
                {c.value}<span className="ml-1 text-xs font-medium text-slate-400">{c.note}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* GIÁO VIÊN */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Giáo viên ({shownUsers.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <span className="sr-only">Tìm giáo viên</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm tên hoặc email"
                className="h-9 w-48 pl-8 pr-2 border border-slate-300 rounded-lg text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-9 px-2 border border-slate-300 rounded-lg text-xs bg-white"
              aria-label="Sắp xếp"
            >
              <option value="hoat_dong">Hoạt động gần đây</option>
              <option value="lau_khong_dung">Lâu không dùng</option>
              <option value="moi">Mới đăng ký</option>
              <option value="ten">Theo tên</option>
            </select>
          </div>
        </div>
        {usageError && <p className="mx-4 sm:mx-5 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">{usageError}</p>}

        {users.length === 0 ? (
          <p className="px-5 pb-8 pt-4 text-center text-sm text-slate-400">{loading ? 'Đang tải dữ liệu...' : 'Chưa có tài khoản nào đăng ký.'}</p>
        ) : (
          <>
            {/* máy tính: bảng */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-y border-slate-200">
                    <th className="px-5 py-2.5">Giáo viên</th>
                    <th className="px-3 py-2.5">Trạng thái / hạn</th>
                    <th className="px-3 py-2.5">Đăng nhập</th>
                    <th className="px-3 py-2.5">Hoạt động</th>
                    <th className="px-3 py-2.5 text-center" title={`Năm học ${year.id}`}>Lớp · tiết TKB</th>
                    <th className="px-3 py-2.5 text-center">Khung PPCT</th>
                    <th className="px-3 py-2.5 text-center">Lớp chưa gán</th>
                    <th className="px-3 py-2.5 text-center" title="Cắt / đảo / nghỉ tiết trong năm học">Điều chỉnh</th>
                    <th className="px-5 py-2.5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {shownUsers.map((u) => {
                    const us = usage[u.id]
                    const idle = daysSince(lastActive(u)) > 30
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-900">{u.full_name || '–'}</p>
                          <p className="text-xs text-slate-500">{u.email || 'Chưa có email'}</p>
                        </td>
                        <td className="px-3 py-3">
                          {statusBadge(u)}
                          <p className="mt-1 text-xs text-slate-500 tabular-nums">{expiryText(u)}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">{us ? timeAgo(us.last_sign_in_at) : '–'}</td>
                        <td className={`px-3 py-3 text-xs ${idle ? 'text-amber-700 font-semibold' : 'text-slate-600'}`}>{us ? timeAgo(us.hoat_dong_gan_nhat) : '–'}</td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {us ? (us.so_tiet ? <><span className="font-semibold">{us.so_lop}</span><span className="text-slate-400"> · </span>{us.so_tiet}</> : <span className="text-xs text-amber-700 font-semibold">Chưa nhập</span>) : '–'}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">{us ? us.so_khung : '–'}</td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {us ? (us.lop_chua_ppct ? <span className="font-semibold text-rose-700">{us.lop_chua_ppct}</span> : <span className="text-slate-400">0</span>) : '–'}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">{us ? us.so_dieu_chinh : '–'}</td>
                        <td className="px-5 py-3"><div className="flex justify-end gap-2">{actions(u)}</div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* điện thoại: thẻ */}
            <ul className="md:hidden divide-y divide-slate-100 border-t border-slate-100">
              {shownUsers.map((u) => {
                const us = usage[u.id]
                return (
                  <li key={u.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      </div>
                      {statusBadge(u)}
                    </div>
                    {us && (
                      <dl className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-slate-50 py-1.5">
                          <dt className="text-[10px] text-slate-500">Lớp · tiết</dt>
                          <dd className="text-sm font-semibold tabular-nums">{us.so_tiet ? `${us.so_lop} · ${us.so_tiet}` : <span className="text-amber-700 text-xs">Chưa nhập</span>}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 py-1.5">
                          <dt className="text-[10px] text-slate-500">Chưa gán PPCT</dt>
                          <dd className={`text-sm font-semibold tabular-nums ${us.lop_chua_ppct ? 'text-rose-700' : ''}`}>{us.lop_chua_ppct}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 py-1.5">
                          <dt className="text-[10px] text-slate-500">Hoạt động</dt>
                          <dd className="text-xs font-semibold">{timeAgo(lastActive(u))}</dd>
                        </div>
                      </dl>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">Hạn: <span className="font-semibold text-slate-700">{expiryText(u)}</span></span>
                      <div className="flex gap-2">{actions(u)}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
