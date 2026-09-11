'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { 
  Calendar, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Download,
  Edit3,
  UserCheck,
  X,
  Check
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
  sub_class_code?: string
  sub_subject?: string
  sub_teacher_name?: string
  sub_lesson_order?: number
  sub_lesson_name?: string
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
  const [selectedWeek, setSelectedWeek] = useState<number>(0) // 0: Lịch cố định cả năm

  // Modal thêm/sửa tiết
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState(2)
  const [modalPeriod, setModalPeriod] = useState(1)
  const [modalClassCode, setModalClassCode] = useState('')
  const [modalSubject, setModalSubject] = useState('Toán')
  const [modalApplyAllWeeks, setModalApplyAllWeeks] = useState(true)

  // Chế độ dạy thay
  const [isSubstitute, setIsSubstitute] = useState(false)
  const [subTeacherName, setSubTeacherName] = useState('')
  const [subLessonOrder, setSubLessonOrder] = useState<number>(1)
  const [subLessonName, setSubLessonName] = useState('')

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

  // Tìm tiết ưu tiên: Tuần cụ thể (bao gồm cả dạy thay) -> Lịch cố định
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

  // Mở modal để thêm mới hoặc sửa
  const openEditModal = (day: number, period: number, existingSlot?: ScheduleEntry) => {
    setModalDay(day)
    setModalPeriod(period)

    if (existingSlot) {
      setEditingSlotId(existingSlot.id)
      setModalClassCode(existingSlot.sub_class_code || existingSlot.classes?.code || '')
      setModalSubject(existingSlot.sub_subject || existingSlot.classes?.subject || 'Toán')
      setModalApplyAllWeeks(existingSlot.week_number === 0 || !existingSlot.week_number)
      setIsSubstitute(!!existingSlot.is_substitute)
      setSubTeacherName(existingSlot.sub_teacher_name || '')
      setSubLessonOrder(existingSlot.sub_lesson_order || 1)
      setSubLessonName(existingSlot.sub_lesson_name || '')
    } else {
      setEditingSlotId(null)
      setModalClassCode('')
      setModalSubject('Toán')
      setModalApplyAllWeeks(selectedWeek === 0)
      setIsSubstitute(false)
      setSubTeacherName('')
      setSubLessonOrder(1)
      setSubLessonName('')
    }

    setIsModalOpen(true)
  }

  // Lưu hoặc Cập nhật tiết
  const handleSaveSlot = async () => {
    if (!modalClassCode.trim()) {
      alert('Vui lòng nhập tên lớp!')
      return
    }

    setLoading(true)
    try {
      const code = modalClassCode.trim().toUpperCase()
      const subject = modalSubject.trim()
      const targetWeek = modalApplyAllWeeks ? 0 : selectedWeek

      let classId: string | undefined = undefined

      if (!isSubstitute) {
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
        classId = targetClass.id
      }

      // Xóa slot cũ tại vị trí nếu cùng tuần
      await supabase
        .from('schedule_entries')
        .delete()
        .eq('day_of_week', modalDay)
        .eq('period_number', modalPeriod)
        .eq('week_number', targetWeek)

      const payload: any = {
        day_of_week: modalDay,
        period_number: modalPeriod,
        session: 'Sáng',
        week_number: targetWeek,
        is_substitute: isSubstitute,
      }

      if (isSubstitute) {
        payload.class_id = null
        payload.sub_class_code = code
        payload.sub_subject = subject
        payload.sub_teacher_name = subTeacherName.trim()
        payload.sub_lesson_order = Number(subLessonOrder)
        payload.sub_lesson_name = subLessonName.trim()
      } else {
        payload.class_id = classId
        payload.sub_class_code = null
        payload.sub_subject = null
        payload.sub_teacher_name = null
        payload.sub_lesson_order = null
        payload.sub_lesson_name = null
      }

      const { error: sErr } = await supabase.from('schedule_entries').insert(payload)
      if (sErr) throw sErr

      setIsModalOpen(false)
      await loadData()
    } catch (err: any) {
      alert('Lỗi khi lưu tiết: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('Bạn có chắc muốn xóa tiết này khỏi Thời khóa biểu?')) return
    setLoading(true)
    await supabase.from('schedule_entries').delete().eq('id', slotId)
    await loadData()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-10">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Thời Khóa Biểu</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý lịch dạy cố định cả năm, lịch dạy riêng từng tuần và xếp lịch dạy thay
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* NÚT TẢI MẪU TKB */}
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

      {/* LƯỚI THỜI KHÓA BIỂU ĐẦY ĐỦ TÍNH NĂNG */}
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
                    const isSub = slot?.is_substitute
                    const isWeekSpecific = slot && slot.week_number && slot.week_number > 0

                    return (
                      <td key={day.id} className="p-2 border-r text-center align-middle h-20 relative group">
                        {slot ? (
                          <div 
                            onClick={() => openEditModal(day.id, period, slot)}
                            className={`p-2 rounded-xl border flex flex-col items-center justify-center relative shadow-xs cursor-pointer transition hover:ring-2 ${
                              isSub
                                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:ring-amber-400'
                                : isWeekSpecific
                                ? 'bg-blue-50 border-blue-200 text-blue-900 hover:ring-blue-400'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:ring-emerald-400'
                            }`}
                          >
                            {/* NHÃN ĐẶC BIỆT */}
                            {isSub ? (
                              <span className="text-[9px] font-black bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full mb-0.5 leading-tight">
                                Dạy thay ({slot.sub_teacher_name || 'GV'})
                              </span>
                            ) : isWeekSpecific ? (
                              <span className="text-[9px] font-black bg-blue-200 text-blue-900 px-1.5 py-0.2 rounded-full mb-0.5 leading-tight">
                                Tuần {slot.week_number}
                              </span>
                            ) : null}

                            {/* MÃ LỚP */}
                            <span className="font-black text-sm text-slate-900 leading-tight">
                              {isSub ? slot.sub_class_code : slot.classes?.code}
                            </span>

                            {/* MÔN HỌC */}
                            <span className="text-[10px] font-bold text-slate-600 uppercase mt-0.5">
                              {isSub ? slot.sub_subject : slot.classes?.subject}
                            </span>

                            {/* THANH CÔNG CỤ NHANH KHI RÊ CHUỘT */}
                            <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditModal(day.id, period, slot)
                                }}
                                title="Sửa tiết"
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded transition cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSlot(slot.id)
                                }}
                                title="Xóa tiết này"
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openEditModal(day.id, period)}
                            className="w-full h-full min-h-[48px] border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-xl flex items-center justify-center text-slate-300 hover:text-emerald-600 transition cursor-pointer"
                            title="Bấm để xếp tiết mới"
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

      {/* MODAL THÊM / SỬA TIẾT ĐẦY ĐỦ TÍNH NĂNG */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                {editingSlotId ? 'Cập Nhật Tiết Dạy' : 'Thêm Tiết Dạy'} ({DAYS.find((d) => d.id === modalDay)?.name} — Tiết {modalPeriod})
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* CHUYỂN ĐỔI CHẾ ĐỘ DẠY THAY */}
              <div className="p-2.5 bg-slate-50 border rounded-xl space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-amber-600" />
                    Chế độ dạy thay
                  </span>
                  <input
                    type="checkbox"
                    checked={isSubstitute}
                    onChange={(e) => {
                      setIsSubstitute(e.target.checked)
                      if (e.target.checked) setModalApplyAllWeeks(false)
                    }}
                    className="w-4 h-4 rounded text-amber-600 accent-amber-600 cursor-pointer"
                  />
                </label>
                {isSubstitute && (
                  <p className="text-[10px] text-amber-800 italic">
                    Tiết dạy thay sẽ tự động ghi chú tên giáo viên được thay trên Phiếu Báo Giảng của tuần được chọn.
                  </p>
                )}
              </div>

              {/* MÃ LỚP */}
              <div>
                <label className="block font-bold text-slate-600 mb-1">Mã lớp (vd: 12A1, 11Sử, 10T1...):</label>
                <input
                  type="text"
                  placeholder="Nhập mã lớp..."
                  value={modalClassCode}
                  onChange={(e) => setModalClassCode(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-xl font-black text-slate-900 uppercase focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* PHÂN MÔN */}
              <div>
                <label className="block font-bold text-slate-600 mb-1">Phân môn:</label>
                <select
                  value={modalSubject}
                  onChange={(e) => setModalSubject(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-xl font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Toán">Toán (T)</option>
                  <option value="HĐTN">HĐTN (TrN)</option>
                  <option value="GDĐP">GDĐP</option>
                </select>
              </div>

              {/* THÔNG TIN CHI TIẾT NẾU LÀ DẠY THAY */}
              {isSubstitute && (
                <div className="space-y-2 pt-1 border-t border-slate-200">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Dạy thay cho ai:</label>
                    <input
                      type="text"
                      placeholder="vd: Thầy Tuấn, Cô Lan..."
                      value={subTeacherName}
                      onChange={(e) => setSubTeacherName(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl font-bold text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Tiết PPCT:</label>
                      <input
                        type="number"
                        value={subLessonOrder}
                        onChange={(e) => setSubLessonOrder(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border rounded-xl font-black text-center text-blue-700"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-bold text-slate-600 mb-1">Tên bài dạy:</label>
                      <input
                        type="text"
                        placeholder="Tên bài giảng..."
                        value={subLessonName}
                        onChange={(e) => setSubLessonName(e.target.value)}
                        className="w-full px-3 py-1.5 border rounded-xl font-medium text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PHẠM VI ÁP DỤNG */}
              {!isSubstitute && (
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
                  {!modalApplyAllWeeks && (
                    <p className="text-[10px] text-blue-700 mt-0.5 ml-6">
                      Chỉ áp dụng riêng cho <strong>Tuần {selectedWeek > 0 ? selectedWeek : 1}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* NÚT THAO TÁC */}
            <div className="flex justify-between items-center pt-2 border-t">
              {editingSlotId ? (
                <button
                  onClick={() => handleDeleteSlot(editingSlotId)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                >
                  Xóa tiết này
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveSlot}
                  disabled={loading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingSlotId ? 'Cập Nhật' : 'Lưu Tiết'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}