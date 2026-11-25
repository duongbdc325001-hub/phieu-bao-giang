'use client'

// Trang Quản trị: admin thêm năm học mới và nhập ngày bắt đầu tuần 1 cho từng năm.
// Không có nút xoá năm học để không lỡ tay làm mất dữ liệu cả năm của giáo viên.

import { useState } from 'react'
import { CalendarPlus, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSchoolYear } from '@/components/school-year'
import { BTN_PRIMARY } from '@/components/ui/page'
import { DEFAULT_WEEKS, dateOf, formatDay, parseDay, yearIdFromStart } from '@/lib/namHoc'

export default function AdminNamHoc() {
  const supabase = createClient()
  const { years, current, reload, fromDb } = useSchoolYear()
  const [newStart, setNewStart] = useState('')
  const [newWeeks, setNewWeeks] = useState(DEFAULT_WEEKS)
  const [edits, setEdits] = useState<Record<string, { start_date: string; weeks: number }>>({})
  const [busy, setBusy] = useState(false)

  // Chưa chạy SQL tạo bảng school_years thì danh sách chỉ là năm mặc định dựng sẵn trong code
  const usingFallback = !fromDb

  const isMonday = (iso: string) => !!iso && parseDay(iso).getDay() === 1

  const addYear = async () => {
    if (!newStart) return alert('Chọn ngày bắt đầu tuần 1 của năm học mới.')
    if (!isMonday(newStart) && !confirm('Ngày đã chọn không phải thứ Hai. Tuần 1 thường bắt đầu từ thứ Hai. Vẫn lưu?')) return
    const id = yearIdFromStart(newStart)
    if (years.some((y) => y.id === id)) return alert(`Năm học ${id} đã có. Sửa ngày bắt đầu ở bảng bên dưới.`)
    if (!confirm(`Thêm năm học ${id}, tuần 1 bắt đầu ${formatDay(parseDay(newStart))}, ${newWeeks} tuần?`)) return
    setBusy(true)
    const { error } = await supabase.from('school_years').insert({ id, start_date: newStart, weeks: newWeeks })
    setBusy(false)
    if (error) return alert('Lỗi thêm năm học: ' + error.message)
    setNewStart('')
    setNewWeeks(DEFAULT_WEEKS)
    await reload()
    alert(`Đã thêm năm học ${id}. Giáo viên sẽ thấy năm học mới từ ngày bắt đầu.`)
  }

  const saveYear = async (id: string) => {
    const e = edits[id]
    if (!e) return
    if (!isMonday(e.start_date) && !confirm('Ngày đã chọn không phải thứ Hai. Vẫn lưu?')) return
    setBusy(true)
    const { error } = await supabase.from('school_years').update({ start_date: e.start_date, weeks: e.weeks }).eq('id', id)
    setBusy(false)
    if (error) return alert('Lỗi lưu năm học: ' + error.message)
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    await reload()
    alert(`Đã lưu năm học ${id}.`)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <CalendarPlus className="w-5 h-5 text-emerald-600" />
          <span>Năm học</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Mỗi năm học lưu riêng TKB, gán PPCT và cắt/đảo tiết. Năm học mới bắt đầu trống, giáo viên tự nhập lại;
          các năm cũ vẫn xem lại được bằng ô &quot;Năm học&quot; ở menu bên trái.
        </p>
        {usingFallback && (
          <p className="text-xs text-rose-600 mt-2 font-bold">
            Chưa đọc được bảng school_years trên Supabase (chưa chạy SQL tạo bảng). Đang dùng năm học mặc định 2026-2027.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200 text-xs">
              <th className="p-2.5">Năm học</th>
              <th className="p-2.5">Tuần 1 bắt đầu</th>
              <th className="p-2.5">Số tuần</th>
              <th className="p-2.5">Kết thúc</th>
              <th className="p-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {[...years].reverse().map((y) => {
              const e = edits[y.id]
              const shown = e || { start_date: y.start_date, weeks: y.weeks }
              const end = dateOf({ ...y, ...shown }, shown.weeks, 5)
              return (
                <tr key={y.id}>
                  <td className="p-2.5 font-black text-slate-900">
                    {y.id}
                    {y.id === current.id && <span className="ml-2 text-[10px] font-bold text-emerald-700">hiện tại</span>}
                  </td>
                  <td className="p-2.5">
                    <input
                      type="date"
                      value={shown.start_date}
                      disabled={usingFallback}
                      onChange={(ev) => setEdits((p) => ({ ...p, [y.id]: { ...shown, start_date: ev.target.value } }))}
                      className="px-2 py-1 border rounded-lg"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={shown.weeks}
                      disabled={usingFallback}
                      onChange={(ev) => setEdits((p) => ({ ...p, [y.id]: { ...shown, weeks: Math.max(1, Math.min(60, Number(ev.target.value) || DEFAULT_WEEKS)) } }))}
                      className="w-16 px-2 py-1 border rounded-lg"
                    />
                  </td>
                  <td className="p-2.5 text-slate-600">{formatDay(end)}</td>
                  <td className="p-2.5 text-right">
                    {e && (
                      <button
                        onClick={() => saveYear(y.id)}
                        disabled={busy}
                        className={BTN_PRIMARY}
                      >
                        <Save className="w-3.5 h-3.5" /> Lưu
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
        <label className="text-xs font-bold text-slate-600">
          Ngày bắt đầu tuần 1 của năm học mới
          <input
            type="date"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            className="block mt-1 h-9 px-2 border border-slate-300 rounded-lg font-medium"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Số tuần
          <input
            type="number"
            min={1}
            max={60}
            value={newWeeks}
            onChange={(e) => setNewWeeks(Math.max(1, Math.min(60, Number(e.target.value) || DEFAULT_WEEKS)))}
            className="block mt-1 h-9 w-20 px-2 border border-slate-300 rounded-lg font-medium"
          />
        </label>
        <button
          onClick={addYear}
          disabled={busy || usingFallback || !newStart}
          className={BTN_PRIMARY}
        >
          {newStart ? `Thêm năm học ${yearIdFromStart(newStart)}` : 'Thêm năm học'}
        </button>
      </div>
    </div>
  )
}
