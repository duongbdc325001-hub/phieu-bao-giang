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
  Check,
  BookmarkCheck,
  Layers
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

// 15 MÔN HỌC CHUẨN THPT
const ALL_SUBJECTS = [
  'Toán',
  'GDĐP',
  'HĐTN',
  'Ngữ văn',
  'Tiếng Anh',
  'Vật lí',
  'Hóa học',
  'Sinh học',
  'Lịch sử',
  'Địa lí',
  'GDKT & PL',
  'Tin học',
  'Công nghệ',
  'Giáo dục thể chất',
  'GDQP & AN'
]

// ĐẦY ĐỦ 41 LỚP THEO 3 KHỐI
const CLASSES_K12 = ['12A1', '12A2', '12A3', '12A4', '12TOÁN', '12TIN', '12LÍ', '12HÓA', '12SINH', '12VĂN', '12SỬ', '12ĐỊA', '12ANH', '12NGA']
const CLASSES_K11 = ['11A1', '11A2', '11A3', '11A4', '11TOÁN', '11TIN', '11LÍ', '11HÓA', '11SINH', '11VĂN', '11SỬ', '11ĐỊA', '11ANH', '11NGA']
const CLASSES_K10 = ['10T1', '10T2', '10A1', '10A2', '10A3', '10TOÁN', '10TIN', '10LÍ', '10HÓA', '10SINH', '10VĂN', '10SỬ', '10ĐỊA']

// BẢNG MÀU KHOA HỌC DÀNH CHO CÁC MÔN
const getSlotColorTheme = (subject?: string, isSub?: boolean) => {
  if (isSub) {
    return {
      card: 'bg-amber-50 border-amber-300 text-amber-950 hover:ring-amber-400',
      periodBadge: 'bg-amber-100 text-amber-900',
      classText: 'text-amber-950',
      subjectBadge: 'bg-amber-200/80 text-amber-950',
    }
  }

  const s = (subject || '').trim().toLowerCase()

  if (s.includes('toán') || s === 't') {
    return {
      card: 'bg-emerald-50/80 border-emerald-300 text-emerald-950 hover:ring-emerald-400',
      periodBadge: 'bg-emerald-100 text-emerald-800',
      classText: 'text-emerald-950',
      subjectBadge: 'bg-emerald-200/80 text-emerald-900',
    }
  }

  if (s.includes('gdđp') || s.includes('địa phương')) {
    return {
      card: 'bg-purple-50/80 border-purple-300 text-purple-950 hover:ring-purple-400',
      periodBadge: 'bg-purple-100 text-purple-800',
      classText: 'text-purple-950',
      subjectBadge: 'bg-purple-200/80 text-purple-900',
    }
  }

  if (s.includes('hđtn') || s.includes('trải nghiệm') || s === 'trn') {
    return {
      card: 'bg-sky-50/80 border-sky-300 text-sky-950 hover:ring-sky-400',
      periodBadge: 'bg-sky-100 text-sky-800',
      classText: 'text-sky-950',
      subjectBadge: 'bg-sky-200/80 text-sky-900',
    }
  }

  return {
    card: 'bg-slate-50 border-slate-300 text-slate-800 hover:ring-slate-400',
    periodBadge: 'bg-slate-200 text-slate-700',
    classText: 'text-slate-900',
    subjectBadge: 'bg-slate-200 text-slate-800',
  }
}

export default function SchedulePage() {
  const supabase = createClient()
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState<number>(0)

  // Modal xếp tiết
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState(2)
  const [modalPeriod, setModalPeriod] = useState(1)
  const [modalClassCode, setModalClassCode] = useState('12SỬ')
  const [modalSubject, setModalSubject] = useState('Toán')
  const [modalApplyAllWeeks, setModalApplyAllWeeks] = useState(true)

  // Dạy thay
  const [isSubstitute, setIsSubstitute] = useState(false)
  const [subTeacherName, setSubTeacherName] = useState('')
  const [subLessonOrder, setSubLessonOrder] = useState<number>(1)
  const [subLessonName, setSubLessonName] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data: cData } = await supabase.from('classes').select('*').order('code', { ascending: true })
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
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 3, 'Lớp': '11SỬ', 'Môn': 'Toán' },
      { 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 4, 'Lớp': '11NGA', 'Môn': 'Toán' },
      { 'Thứ': 3, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '11SỬ', 'Môn': 'Toán' },
      { 'Thứ': 3, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '11SỬ', 'Môn': 'Toán' },
      { 'Thứ': 4, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '12A1', 'Môn': 'Toán' },
      { 'Thứ': 5, 'Buổi': 'Sáng', 'Tiết': 2, 'Lớp': '11NGA', 'Môn': 'Toán' },
      { 'Thứ': 6, 'Buổi': 'Sáng', 'Tiết': 3, 'Lớp': '11A1', 'Môn': 'GDĐP' },
    ]

    const ws = XLSX.utils.json_to_sheet(sampleTKB)
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }]
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
      (s) => s.day_of_week === day && s.period_number === period && (!s.week_number || s.week_number === 0)
    )
  }

  const openModal = (day: number, period: number, existingSlot?: ScheduleEntry) => {
    setModalDay(day)
    setModalPeriod(period)

    if (existingSlot) {
      setEditingSlotId(existingSlot.id)
      const code = (existingSlot.sub_class_code || existingSlot.classes?.code || '12SỬ').toUpperCase()
      const sub = existingSlot.sub_subject || existingSlot.classes?.subject || 'Toán'
      setModalClassCode(code)
      setModalSubject(sub)
      setModalApplyAllWeeks(!existingSlot.week_number || existingSlot.week_number === 0)
      setIsSubstitute(!!existingSlot.is_substitute)
      setSubTeacherName(existingSlot.sub_teacher_name || '')
      setSubLessonOrder(existingSlot.sub_lesson_order || 1)
      setSubLessonName(existingSlot.sub_lesson_name || '')
    } else {
      setEditingSlotId(null)
      setModalClassCode('12SỬ')
      setModalSubject('Toán')
      setModalApplyAllWeeks(selectedWeek === 0)
      setIsSubstitute(false)
      setSubTeacherName('')
      setSubLessonOrder(1)
      setSubLessonName('')
    }

    setIsModalOpen(true)
  }

  const handleSaveSlot = async () => {
    if (!modalClassCode.trim()) {
      alert('Vui lòng chọn lớp!')
      return
    }

    setLoading(true)
    try {
      const code = modalClassCode.trim().toUpperCase()
      const subject = modalSubject.trim()
      const targetWeek = modalApplyAllWeeks ? 0 : (selectedWeek > 0 ? selectedWeek : 1)

      let classId: string | null = null

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
        class_id: classId,
        sub_class_code: isSubstitute ? code : null,
        sub_subject: isSubstitute ? subject : null,
        sub_teacher_name: isSubstitute ? subTeacherName.trim() : null,
        sub_lesson_order: isSubstitute ? Number(subLessonOrder) : null,
        sub_lesson_name: isSubstitute ? subLessonName.trim() : null,
      }

      const { error: sErr } = await supabase.from('schedule_entries').insert(payload)
      if (sErr) throw sErr

      setIsModalOpen(false)
      await loadData()
    } catch (err: any) {
      alert('Lỗi lưu tiết: ' + err.message)
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

  const fixedSlots = schedule.filter((s) => !s.week_number || s.week_number === 0)
  const currentWeekSlots = selectedWeek > 0 
    ? [1, 2, 3, 4, 5, 6, 7].flatMap(d => [1, 2, 3, 4, 5].map(p => getSlot(d, p))).filter(Boolean)
    : fixedSlots
  const substituteSlotsCount = currentWeekSlots.filter((s: any) => s.is_substitute).length
  const totalSlotsCount = currentWeekSlots.length

  return (
    <div className="max-w-7xl mx-auto space-y-3 font-sans pb-10">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-2.5">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Thời Khóa Biểu</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Phân loại màu sắc trực quan và xếp lịch dạy học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openModal(2, 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Tiết</span>
          </button>

          <button
            onClick={handleDownloadSampleTKB}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Tải Mẫu TKB</span>
          </button>

          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 border rounded-xl shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-slate-500 uppercase">Xem:</span>
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
            className="p-1.5 sm:px-3 sm:py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* THANH THỐNG KÊ KÈM MÀU MÔN */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 uppercase block">Toán ({currentWeekSlots.filter((s: any) => (s.sub_subject || s.classes?.subject) === 'Toán').length}t)</span>
            <span className="text-lg font-black text-emerald-950">{totalSlotsCount} tiết tổng</span>
          </div>
          <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-xs" />
        </div>

        <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-800 uppercase block">GDĐP</span>
            <span className="text-lg font-black text-purple-950">
              {currentWeekSlots.filter((s: any) => (s.sub_subject || s.classes?.subject) === 'GDĐP').length} tiết
            </span>
          </div>
          <div className="w-4 h-4 rounded-full bg-purple-500 shadow-xs" />
        </div>

        <div className="bg-sky-50 border border-sky-200 p-2.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-sky-800 uppercase block">HĐTN</span>
            <span className="text-lg font-black text-sky-950">
              {currentWeekSlots.filter((s: any) => (s.sub_subject || s.classes?.subject) === 'HĐTN').length} tiết
            </span>
          </div>
          <div className="w-4 h-4 rounded-full bg-sky-500 shadow-xs" />
        </div>

        <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-800 uppercase block">Dạy thay</span>
            <span className="text-lg font-black text-amber-950">{substituteSlotsCount} tiết</span>
          </div>
          <div className="w-4 h-4 rounded-full bg-amber-500 shadow-xs" />
        </div>
      </div>

      {/* BẢNG THỜI KHÓA BIỂU */}
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
                    const subject = isSub ? slot.sub_subject : slot?.classes?.subject
                    const classCode = isSub ? slot.sub_class_code : slot?.classes?.code
                    const theme = getSlotColorTheme(subject, isSub)

                    return (
                      <td key={day.id} className="p-2 border-r text-center align-middle h-24 relative group">
                        {slot ? (
                          <div 
                            onClick={() => openModal(day.id, period, slot)}
                            className={`p-2 rounded-xl border-2 flex flex-col items-center justify-between relative shadow-xs cursor-pointer transition hover:scale-[1.02] hover:shadow-md ${theme.card}`}
                          >
                            <div className="w-full flex items-center justify-between gap-1 mb-1">
                              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded shadow-2xs ${theme.periodBadge}`}>
                                Tiết {period}
                              </span>

                              {isSub ? (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 border border-amber-300">
                                  Dạy thay
                                </span>
                              ) : isWeekSpecific ? (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-blue-200 text-blue-900">
                                  Tuần {slot.week_number}
                                </span>
                              ) : null}
                            </div>

                            <div className="my-0.5">
                              <span className={`font-black text-sm tracking-wide ${theme.classText}`}>
                                {classCode}
                              </span>
                            </div>

                            <div className="w-full flex items-center justify-center">
                              <span className={`text-[10px] font-bold px-2 py-0.2 rounded-md uppercase ${theme.subjectBadge}`}>
                                {subject === 'Toán' ? 'Toán' : subject}
                              </span>
                            </div>

                            <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openModal(day.id, period, slot)
                                }}
                                title="Sửa tiết"
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSlot(slot.id)
                                }}
                                title="Xóa tiết"
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-white rounded transition cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openModal(day.id, period)}
                            className="w-full h-full min-h-[56px] border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-xl flex items-center justify-center text-slate-300 hover:text-emerald-600 transition cursor-pointer"
                            title={`Xếp Tiết ${period}`}
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

      {/* MODAL THÊM / SỬA TIẾT — ĐẢM BẢO CHẮC CHẮN XỔ RA 41 LỚP VÀ 15 MÔN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                {editingSlotId ? 'Cập Nhật Tiết Dạy' : 'Thêm Tiết Dạy'} ({DAYS.find((d) => d.id === modalDay)?.name} — Tiết {modalPeriod})
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* CHỌN HÌNH THỨC DẠY THAY */}
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
              </div>

              {/* 1. HỘP CHỌN MÃ LỚP THUẦN TÚY: BẤM VÀO LÀ BUNG 41 LỚP NGAY */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mã lớp (Chọn trong 41 lớp):
                </label>
                <select
                  value={modalClassCode}
                  onChange={(e) => setModalClassCode(e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl p-2.5 text-xs font-black text-slate-900 uppercase focus:outline-none focus:border-emerald-600 cursor-pointer shadow-xs"
                >
                  <optgroup label="-- KHỐI 12 (14 LỚP) --">
                    {CLASSES_K12.map((code) => (
                      <option key={code} value={code}>Lớp {code}</option>
                    ))}
                  </optgroup>
                  <optgroup label="-- KHỐI 11 (14 LỚP) --">
                    {CLASSES_K11.map((code) => (
                      <option key={code} value={code}>Lớp {code}</option>
                    ))}
                  </optgroup>
                  <optgroup label="-- KHỐI 10 (13 LỚP) --">
                    {CLASSES_K10.map((code) => (
                      <option key={code} value={code}>Lớp {code}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* 2. HỘP CHỌN PHÂN MÔN THUẦN TÚY: BẤM VÀO LÀ BUNG 15 MÔN NGAY */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Phân môn (Chọn trong 15 môn):
                </label>
                <select
                  value={modalSubject}
                  onChange={(e) => setModalSubject(e.target.value)}
                  className="w-full bg-white border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer shadow-xs"
                >
                  {ALL_SUBJECTS.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              {/* THÔNG TIN DẠY THAY */}
              {isSubstitute && (
                <div className="space-y-2 p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Dạy thay cho ai:</label>
                    <input
                      type="text"
                      placeholder="vd: Thầy Tuấn, Cô Lan..."
                      value={subTeacherName}
                      onChange={(e) => setSubTeacherName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-amber-300 rounded-xl font-bold text-slate-800 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-bold text-amber-900 mb-1">Tiết PPCT:</label>
                      <input
                        type="number"
                        value={subLessonOrder}
                        onChange={(e) => setSubLessonOrder(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border border-amber-300 rounded-xl font-black text-center text-blue-700 bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-bold text-amber-900 mb-1">Tên bài dạy:</label>
                      <input
                        type="text"
                        placeholder="Tên bài học..."
                        value={subLessonName}
                        onChange={(e) => setSubLessonName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-amber-300 rounded-xl font-medium text-slate-800 bg-white"
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
                  type="button"
                  onClick={() => handleDeleteSlot(editingSlotId)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                >
                  Xóa tiết này
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveSlot}
                  disabled={loading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
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