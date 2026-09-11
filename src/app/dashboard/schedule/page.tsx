'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { 
  Calendar, 
  Upload, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Download,
  AlertCircle
} from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade?: number
}

interface ScheduleEntry {
  id: string
  day_of_week: number
  period_number: number
  session: string
  class_id?: string
  week_number?: number
  is_substitute?: boolean
  classes?: ClassItem
}

const DAYS = [
  { id: 2, name: 'Thứ Hai' },
  { id: 3, name: 'Thứ Ba' },
  { id: 4, name: 'Thứ Tư' },
  { id: 5, name: 'Thứ Năm' },
  { id: 6, name: 'Thứ Sáu' },
  { id: 7, name: 'Thứ Bảy' },
]

export default function SchedulePage() {
  const supabase = createClient()
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState<number>(0) // 0: Lịch cố định

  // Modal thêm tiết
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalDay, setModalDay] = useState(2)
  const [modalPeriod, setModalPeriod] = useState(1)
  const [modalClassCode, setModalClassCode] = useState('')
  const [modalSubject, setModalSubject] = useState('Toán')
  const [modalApplyAllWeeks, setModalApplyAllWeeks] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const { data: cData } = await supabase.from('classes').select('*')
    if (cData) setClasses(cData)

    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('*, classes(*)')
    if (sData) setSchedule(sData as any)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // HÀM TẢI FILE EXCEL MẪU TKB CHUẨN
  const handleDownloadSampleTKB = () => {
    const sampleTKB = [
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '12A1', 'Môn': 'Toán' },
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '12A1', 'Môn': 'Toán' },
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 3, 'Lớp': '11Sử', 'Môn': 'Toán' },
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 4, 'Lớp': '11Nga', 'Môn': 'Toán' },
      { 'Thứ': 3, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '11Sử', 'Môn': 'Toán' },
      { 'Thứ': 3, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '11Sử', 'Môn': 'Toán' },
      { 'Thứ': 4, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '12A1', 'Môn': 'Toán' },
      { 'Thứ': 5, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '11Nga', 'Môn': 'Toán' },
      { 'Thứ': 6, 'Buổi': 'Sáng', 'Tiết': 3, 'Lớp': '11A1', 'Môn': 'GDĐP' },
    ]

    const ws = XLSX.utils.json_to_sheet(sampleTKB)
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'TKB Mau')
    XLSX.writeFile(wb, 'Mau_Thoi_Khoa_Bieu.xlsx')
  }

  // TÌM TIẾT THEO Ô LƯỚI
  const getSlot = (day: number, period: number) => {
    if (selectedWeek > 0) {
      const weekSlot = schedule.find(
        (s) => s.day_of_week === day && s.period_number === period && s.week_number === selectedWeek
      )
      if (weekSlot) return weekSlot
    }
    return schedule.find(
      (s) => s.day_of_week === day && s.period_number === period && (s.week_number === 0 || !s.week_number)
    )
  }

  // LƯU TIẾT MỚI VÀ TỰ ĐỘNG TẠO LỚP NẾU CHƯA CÓ
  const handleSaveSlot = async () => {
    if (!modalClassCode.trim()) {
      alert('Vui lòng nhập tên lớp!')
      return
    }

    setLoading(true)
    try {
      const code = modalClassCode.trim().toUpperCase()
      const subject = modalSubject.trim()

      let targetClass = classes.find(
        (c) => c.code.toUpperCase() === code && c.subject.toLowerCase() === subject.toLowerCase()
      )

      if (!targetClass) {
        let grade = 12
        if (code.startsWith('10')) grade = 10
        if (code.startsWith('11')) grade = 11

        const { data: newCls, error: cErr } = await supabase
          .from('classes')
          .insert({ code, name: `Lớp ${code}`, subject, grade })
          .select()
          .single()

        if (cErr) throw cErr
        targetClass = newCls
        setClasses((prev) => [...prev, newCls])
      }

      const targetWeek = modalApplyAllWeeks ? 0 : selectedWeek

      await supabase
        .from('schedule_entries')
        .delete()
        .eq('day_of_week', modalDay)
        .eq('period_number', modalPeriod)
        .eq('week_number', targetWeek)

      const { error: sErr } = await supabase.from('schedule_entries').insert({
        day_of_week: modalDay,
        period_number: modalPeriod,
        session: 'Sáng',
        class_id: targetClass.id,
        week_number: targetWeek,
        is_substitute: false,
      })

      if (sErr) throw sErr

      setIsModalOpen(false)
      setModalClassCode('')
      await loadData()
    } catch (err: any) {
      alert('Lỗi lưu tiết TKB: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('Bạn có chắc muốn xóa tiết này khỏi TKB?')) return
    setLoading(true)
    await supabase.from('schedule_entries').delete().eq('id', slotId)
    await loadData()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Thời Khóa Biểu</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý lịch dạy cố định toàn học kỳ và lịch xếp thêm theo từng tuần
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* NÚT TẢI FILE MẪU TKB */}
          <button
            onClick={handleDownloadSampleTKB}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border cursor-pointer"
            title="Tải tệp Excel mẫu để điền Thời khóa biểu"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            Tải Mẫu TKB
          </button>

          {/* BỘ LỌC CHỌN TUẦN */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-500 uppercase">Xem Lịch:</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="font-black text-emerald-700 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              <option value={0}>Lịch Cố Định (Cả năm)</option>
              {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Tuần {w < 10 ? '0' + w : w}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* LƯỚI THỜI KHÓA BIỂU */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b uppercase tracking-wider">
              <tr>
                <th className="p-3 border-r text-center w-20">Tiết</th>
                {DAYS.map((d) => (
                  <th key={d.id} className="p-3 border-r text-center w-40">
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {[1, 2, 3, 4, 5].map((period) => (
                <tr key={period} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 border-r text-center font-black text-slate-800 bg-slate-50/80">
                    Tiết {period}
                  </td>
                  {DAYS.map((day) => {
                    const slot = getSlot(day.id, period)
                    return (
                      <td key={day.id} className="p-2 border-r text-center align-middle h-20 relative group">
                        {slot ? (
                          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col items-center justify-center relative shadow-xs">
                            <span className="font-black text-sm text-slate-900">
                              {slot.classes?.code}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 uppercase mt-0.5">
                              {slot.classes?.subject}
                            </span>

                            <button
                              onClick={() => handleDeleteSlot(slot.id)}
                              title="Xóa tiết này"
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setModalDay(day.id)
                              setModalPeriod(period)
                              setModalApplyAllWeeks(selectedWeek === 0)
                              setIsModalOpen(true)
                            }}
                            className="w-full h-full min-h-[48px] border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-xl flex items-center justify-center text-slate-300 hover:text-emerald-600 transition cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL THÊM TIẾT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                Thêm Tiết Dạy ({DAYS.find((d) => d.id === modalDay)?.name} — Tiết {modalPeriod})
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Mã lớp (vd: 12A1, 11Sử...):</label>
                <input
                  type="text"
                  placeholder="Nhập mã lớp..."
                  value={modalClassCode}
                  onChange={(e) => setModalClassCode(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-xl font-black text-slate-900 uppercase focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Phân môn:</label>
                <select
                  value={modalSubject}
                  onChange={(e) => setModalSubject(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Toán">Toán</option>
                  <option value="HĐTN">HĐTN</option>
                  <option value="GDĐP">GDĐP</option>
                </select>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalApplyAllWeeks}
                    onChange={(e) => setModalApplyAllWeeks(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                  />
                  <span className="font-bold text-slate-700">
                    Áp dụng cố định cho tất cả các tuần
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveSlot}
                disabled={loading}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Lưu Tiết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}