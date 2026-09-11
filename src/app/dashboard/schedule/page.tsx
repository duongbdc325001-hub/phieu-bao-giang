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
  ChevronDown
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
  { id: 2, name: 'Thứ Hai', date: '07/09' },
  { id: 3, name: 'Thứ Ba', date: '08/09' },
  { id: 4, name: 'Thứ Tư', date: '09/09' },
  { id: 5, name: 'Thứ Năm', date: '10/09' },
  { id: 6, name: 'Thứ Sáu', date: '11/09' },
  { id: 7, name: 'Thứ Bảy', date: '12/09' },
]

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

const CLASSES_K12 = ['12A1', '12A2', '12A3', '12A4', '12TOÁN', '12TIN', '12LÍ', '12HÓA', '12SINH', '12VĂN', '12SỬ', '12ĐỊA', '12ANH', '12NGA']
const CLASSES_K11 = ['11A1', '11A2', '11A3', '11A4', '11TOÁN', '11TIN', '11LÍ', '11HÓA', '11SINH', '11VĂN', '11SỬ', '11ĐỊA', '11ANH', '11NGA']
const CLASSES_K10 = ['10T1', '10T2', '10A1', '10A2', '10A3', '10TOÁN', '10TIN', '10LÍ', '10HÓA', '10SINH', '10VĂN', '10SỬ', '10ĐỊA']

const getSubjectShortCode = (sub: string) => {
  const s = (sub || '').trim().toLowerCase()
  if (s.includes('toán') || s === 't') return 'T'
  if (s.includes('hđtn') || s.includes('trải nghiệm') || s === 'trn') return 'TrN'
  if (s.includes('gdđp') || s.includes('địa phương') || s.includes('gđđ')) return 'GDĐP'
  if (s.includes('ngữ văn') || s === 'văn') return 'Văn'
  if (s.includes('tiếng anh') || s === 'anh') return 'Anh'
  if (s.includes('vật lí') || s === 'lý') return 'Lí'
  if (s.includes('hóa')) return 'Hóa'
  if (s.includes('sinh')) return 'Sinh'
  if (s.includes('lịch sử') || s === 'sử') return 'Sử'
  if (s.includes('địa')) return 'Địa'
  if (s.includes('kinh tế') || s.includes('kt&pl')) return 'KTPL'
  if (s.includes('tin')) return 'Tin'
  if (s.includes('công nghệ')) return 'CN'
  return (sub || '').substring(0, 3).toUpperCase()
}

const getSlotColorTheme = (subject?: string, classCode?: string, isSub?: boolean) => {
  if (isSub) {
    return {
      card: 'bg-amber-50 border-amber-300 text-amber-950 hover:ring-amber-400',
      textMain: 'text-amber-950',
    }
  }

  const s = (subject || '').trim().toLowerCase()
  const c = (classCode || '').trim().toUpperCase()

  if (s.includes('lý') || s.includes('vật lí') || s.includes('hóa') || s.includes('sinh') || s.includes('tin') || c.includes('LÍ') || c.includes('HÓA') || c.includes('SINH') || c.includes('TIN')) {
    return {
      card: 'bg-blue-50/90 border-blue-300 text-blue-950 hover:ring-blue-400 shadow-2xs',
      textMain: 'text-blue-950',
    }
  }

  if (s.includes('hđtn') || s.includes('trải nghiệm') || s === 'trn') {
    return {
      card: 'bg-purple-50/90 border-purple-300 text-purple-950 hover:ring-purple-400 shadow-2xs',
      textMain: 'text-purple-950',
    }
  }

  return {
    card: 'bg-emerald-50/60 border-emerald-300 text-slate-900 hover:ring-emerald-400 shadow-2xs',
    textMain: 'text-slate-900',
  }
}

export default function SchedulePage() {
  const supabase = createClient()
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState<number>(1)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState(2)
  const [modalPeriod, setModalPeriod] = useState(1)
  const [modalClassCode, setModalClassCode] = useState('12SỬ')
  const [modalSubject, setModalSubject] = useState('Toán')
  const [modalApplyAllWeeks, setModalApplyAllWeeks] = useState(true)
  const [modalLessonOrder, setModalLessonOrder] = useState<number>(1)

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
    const sampleTKB = [{ 'Thứ': 2, 'Buổi': 'Sáng', 'Tiết': 1, 'Lớp': '12A1', 'Môn': 'Toán' }]
    const ws = XLSX.utils.json_to_sheet(sampleTKB)
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
      setModalLessonOrder(existingSlot.sub_lesson_order || period)
      setIsSubstitute(!!existingSlot.is_substitute)
      setSubTeacherName(existingSlot.sub_teacher_name || '')
      setSubLessonOrder(existingSlot.sub_lesson_order || period)
      setSubLessonName(existingSlot.sub_lesson_name || '')
    } else {
      setEditingSlotId(null)
      setModalClassCode('12SỬ')
      setModalSubject('Toán')
      setModalApplyAllWeeks(selectedWeek === 0)
      setModalLessonOrder(period)
      setIsSubstitute(false)
      setSubTeacherName('')
      setSubLessonOrder(period)
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
        sub_lesson_order: isSubstitute ? Number(subLessonOrder) : Number(modalLessonOrder),
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

  return (
    <div className="max-w-7xl mx-auto space-y-3 font-sans pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-3 gap-2.5">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Thời Khóa Biểu Giảng Dạy</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Mốc thời gian thực: <strong className="text-slate-700">Tuần {selectedWeek} bắt đầu từ 07/09</strong> — Tự động cập nhật theo ngày hiện tại
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border-2 border-emerald-600 rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-slate-600 uppercase">Xem tuần:</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="font-black text-emerald-700 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              <option value={0}>Lịch Cố Định (Cả năm)</option>
              {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Tuần {w < 10 ? '0' + w : w} {w === 1 ? '(Hiện tại)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleDownloadSampleTKB}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Nhập TKB (Excel / JSON)</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-slate-800 font-bold border-b-2 border-slate-300 uppercase tracking-wider">
              <tr>
                <th className="p-3 border-r-2 border-slate-300 text-center w-16 text-slate-600">TIẾT</th>
                {DAYS.map((d) => {
                  const isCurrentDay = d.id === 5 
                  return (
                    <th 
                      key={d.id} 
                      className={`p-2.5 border-r-2 border-slate-300 text-center w-28 ${
                        isCurrentDay ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950 font-black' : ''
                      }`}
                    >
                      <div>{d.name}</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">{d.date}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-200 text-slate-700">
              {[1, 2, 3, 4, 5].map((period) => (
                <tr key={period} className="hover:bg-slate-50/30 transition">
                  <td className="p-2 border-r-2 border-slate-300 text-center font-black text-slate-800 bg-slate-50">
                    Tiết {period}
                  </td>
                  {DAYS.map((day) => {
                    const slot = getSlot(day.id, period)
                    const isSub = slot?.is_substitute
                    const subject = isSub ? slot.sub_subject : slot?.classes?.subject
                    const classCode = isSub ? slot.sub_class_code : slot?.classes?.code
                    
                    // Lấy chính xác số tiết PPCT riêng biệt được cấu hình trong từng tiết học của lớp đó
                    const lessonNum = slot?.sub_lesson_order ?? period
                    
                    const theme = getSlotColorTheme(subject, classCode, isSub)

                    const shortSub = getSubjectShortCode(subject)
                    const cellText = `${shortSub}-${(classCode || '').toUpperCase()}-${lessonNum}`

                    return (
                      <td key={day.id} className="p-1 border-r-2 border-slate-200 text-center align-middle h-14 relative group">
                        {slot ? (
                          <div 
                            onClick={() => openModal(day.id, period, slot)}
                            className={`px-1.5 py-1.5 rounded-xl border-2 flex items-center justify-center relative shadow-2xs cursor-pointer transition hover:scale-[1.01] ${theme.card}`}
                          >
                            <span className={`font-black text-[11px] tracking-tight ${theme.textMain} truncate`}>
                              {cellText}
                            </span>

                            <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition bg-white/95 p-0.5 rounded shadow-xs">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openModal(day.id, period, slot)
                                }}
                                title="Sửa tiết"
                                className="p-0.5 text-slate-600 hover:text-blue-600 rounded cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSlot(slot.id)
                                }}
                                title="Xóa tiết"
                                className="p-0.5 text-slate-600 hover:text-rose-600 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openModal(day.id, period)}
                            className="w-full h-full min-h-[40px] border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 rounded-xl flex items-center justify-center text-slate-300 hover:text-emerald-600 transition cursor-pointer"
                            title={`Xếp Tiết ${period}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
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

      {/* MODAL THÊM / SỬA TIẾT */}
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mã lớp (Chọn trong 41 lớp):
                </label>
                <div className="relative">
                  <select
                    value={modalClassCode}
                    onChange={(e) => setModalClassCode(e.target.value)}
                    className="w-full appearance-none bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 uppercase focus:outline-none focus:border-emerald-600 cursor-pointer pr-8 shadow-xs"
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
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Phân môn (Chọn trong 15 môn):
                </label>
                <div className="relative">
                  <select
                    value={modalSubject}
                    onChange={(e) => setModalSubject(e.target.value)}
                    className="w-full appearance-none bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer pr-8 shadow-xs"
                  >
                    {ALL_SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {!isSubstitute && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Số Tiết theo PPCT (Phân phối chương trình):
                  </label>
                  <input
                    type="number"
                    value={modalLessonOrder}
                    onChange={(e) => setModalLessonOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-xl font-black text-emerald-700 bg-white"
                  />
                </div>
              )}

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