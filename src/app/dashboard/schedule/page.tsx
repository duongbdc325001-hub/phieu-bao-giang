'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { 
  Download, 
  RefreshCw, 
  Plus, 
  Trash2,
  Calendar,
  Search
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
  { id: 2, name: 'THỨ 2' },
  { id: 3, name: 'THỨ 3' },
  { id: 4, name: 'THỨ 4' },
  { id: 5, name: 'THỨ 5' },
  { id: 6, name: 'THỨ 6' },
  { id: 7, name: 'THỨ 7' },
]

export default function SchedulePage() {
  const supabase = createClient()
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(false)

  // Ngày áp dụng TKB
  const [applyDate, setApplyDate] = useState('06/09/2026')
  const [selectedWeek, setSelectedWeek] = useState<number>(0)

  // Modal thêm/sửa tiết
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

  const handleDownloadSampleTKB = () => {
    const sampleTKB = [
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '12SỬ', 'Môn': 'TRN' },
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '12SỬ', 'Môn': 'TRN' },
      { 'Thứ': 3, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '12SỬ', 'Môn': 'T' },
      { 'Thứ': 4, 'Buổi': 'Sáng', 'Tiết': 4, 'Lớp': '10T1', 'Môn': 'T' },
      { 'Thứ': 5, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '11L', 'Môn': 'T' },
      { 'Thứ': 7, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '10T1', 'Môn': 'T' },
    ]

    const ws = XLSX.utils.json_to_sheet(sampleTKB)
    ws['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'TKB Mau')
    XLSX.writeFile(wb, 'Mau_Thoi_Khoa_Bieu.xlsx')
  }

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

  const handleSaveSlot = async () => {
    if (!modalClassCode.trim()) {
      alert('Vui lòng nhập mã lớp!')
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
      alert('Lỗi lưu: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('Xóa tiết này khỏi TKB?')) return
    setLoading(true)
    await supabase.from('schedule_entries').delete().eq('id', slotId)
    await loadData()
  }

  return (
    <div className="max-w-4xl mx-auto font-sans text-slate-800 space-y-3 pb-6">
      {/* THANH ĐIỀU KHIỂN CHỌN NGÀY ÁP DỤNG & GIÁO VIÊN */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* MỤC NGÀY ÁP DỤNG */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ngày áp dụng:
            </label>
            <div className="relative">
              <select
                value={applyDate}
                onChange={(e) => setApplyDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="06/09/2026">06/09/2026 (Học kỳ I)</option>
                <option value="15/01/2027">15/01/2027 (Học kỳ II)</option>
              </select>
            </div>
          </div>

          {/* MỤC GIÁO VIÊN */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Giáo viên:
            </label>
            <input
              type="text"
              readOnly
              value="Bùi Đức Dương"
              className="w-full bg-slate-100 border border-slate-300 rounded-lg py-1.5 px-2.5 text-xs font-bold text-slate-800"
            />
          </div>
        </div>

        {/* NÚT THAO TÁC PHỤ */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Xem:</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="font-bold text-blue-700 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              <option value={0}>Lịch Cố Định</option>
              {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Tuần {w < 10 ? '0' + w : w}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSampleTKB}
              className="text-[11px] font-bold text-slate-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" /> Tải mẫu
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              title="Tải lại"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ================= BẢNG THỜI KHÓA BIỂU VỪA KHÍT 100% MÀN HÌNH ================= */}
      <div className="bg-white border-2 border-slate-400 rounded-sm overflow-hidden shadow-xs">
        <table className="w-full table-fixed border-collapse text-center select-none">
          <thead>
            <tr className="bg-[#3b5998] text-white text-[11px] font-black border-b border-slate-400">
              <th className="w-[10%] p-1 border-r border-slate-300 font-bold tracking-tight">
                BUỔI
              </th>
              <th className="w-[8%] p-1 border-r border-slate-300 font-bold">
                TIẾT
              </th>
              {DAYS.map((d) => (
                <th key={d.id} className="w-[13.6%] p-1 border-r border-slate-300 last:border-r-0 font-bold">
                  {d.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300 text-xs">
            {[1, 2, 3, 4, 5].map((period, idx) => {
              const isFirstRow = idx === 0

              return (
                <tr key={period} className="h-13 min-h-[52px]">
                  {/* CỘT BUỔI: GỘP CẢ 5 TIẾT, CHỮ 'SÁNG' CHẠY DỌC NỀN XANH NHẠT */}
                  {isFirstRow && (
                    <td
                      rowSpan={5}
                      className="bg-[#dbeafe] border-r border-slate-400 font-black text-slate-700 text-xs tracking-widest uppercase align-middle [writing-mode:vertical-rl] rotate-180 p-0"
                    >
                      SÁNG
                    </td>
                  )}

                  {/* CỘT SỐ TIẾT */}
                  <td className="border-r border-slate-300 font-black text-slate-800 bg-slate-50/60 p-0 text-xs">
                    {period}
                  </td>

                  {/* 6 CỘT TỪ THỨ 2 ĐẾN THỨ 7 */}
                  {DAYS.map((day) => {
                    const slot = getSlot(day.id, period)

                    return (
                      <td
                        key={day.id}
                        className="border-r border-slate-300 last:border-r-0 p-0.5 align-middle relative group hover:bg-blue-50/30 transition cursor-pointer"
                        onClick={() => {
                          if (!slot) {
                            setModalDay(day.id)
                            setModalPeriod(period)
                            setModalApplyAllWeeks(selectedWeek === 0)
                            setIsModalOpen(true)
                          }
                        }}
                      >
                        {slot ? (
                          <div className="flex flex-col items-center justify-center leading-tight">
                            {/* DÒNG 1: TÊN PHÂN MÔN VIẾT GỌN (T, TRN, GDĐP...) */}
                            <span className="text-[10px] font-bold text-slate-800">
                              {slot.classes?.subject === 'Toán' ? 'T' : slot.classes?.subject}
                            </span>
                            {/* DÒNG 2: MÃ LỚP MÀU ĐỎ/CAM ĐẬM (VD: 10T1, 12SỬ...) */}
                            <span className="text-[11px] font-black text-[#dc2626] tracking-tight">
                              {slot.classes?.code}
                            </span>

                            {/* NÚT XÓA NHANH KHI CẦN */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteSlot(slot.id)
                              }}
                              className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-rose-500 text-white rounded-full p-0.5"
                              title="Xóa tiết"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-200 group-hover:text-blue-400">
                            <span className="text-[10px] font-light">+</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL THÊM TIẾT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 space-y-3 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="text-xs font-black text-slate-900 uppercase">
                Xếp tiết ({DAYS.find((d) => d.id === modalDay)?.name} — Tiết {modalPeriod})
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Mã lớp (vd: 10T1, 12SỬ, 11L...):</label>
                <input
                  type="text"
                  placeholder="Nhập mã lớp..."
                  value={modalClassCode}
                  onChange={(e) => setModalClassCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 border rounded-lg font-black text-slate-900 uppercase focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Phân môn:</label>
                <select
                  value={modalSubject}
                  onChange={(e) => setModalSubject(e.target.value)}
                  className="w-full px-2.5 py-1.5 border rounded-lg font-bold bg-white focus:ring-2 focus:ring-blue-600"
                >
                  <option value="Toán">Toán (T)</option>
                  <option value="HĐTN">HĐTN (TRN)</option>
                  <option value="GDĐP">GDĐP</option>
                </select>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalApplyAllWeeks}
                    onChange={(e) => setModalApplyAllWeeks(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                  <span className="font-bold text-slate-700 text-[11px]">
                    Cố định cho cả năm học
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1 border rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveSlot}
                disabled={loading}
                className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}