'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, Trash2, X, RefreshCw, Calendar, RotateCcw, UserCheck, Plus, Upload } from 'lucide-react'
import ImportScheduleModal from '@/components/ImportScheduleModal'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  template_id?: string | null
  color_bg?: string
}

interface ScheduleEntry {
  id: string
  day_of_week: number
  period_number: number
  class_id?: string
  session: string
  week_number?: number
  is_substitute?: boolean
  sub_class_code?: string
  sub_subject?: string
  sub_teacher_name?: string
  sub_lesson_order?: number
  sub_lesson_name?: string
  classes?: ClassItem
}

interface CurriculumItem {
  id?: string
  class_id?: string
  template_id?: string
  lesson_order: number
  lesson_name: string
}

interface LessonOverride {
  id: string
  class_id: string
  week_number: number
  slot_order_in_week: number
  override_lesson_order: number
}

const DAYS = [
  { id: 2, name: 'Thứ Hai', offset: 0 },
  { id: 3, name: 'Thứ Ba', offset: 1 },
  { id: 4, name: 'Thứ Tư', offset: 2 },
  { id: 5, name: 'Thứ Năm', offset: 3 },
  { id: 6, name: 'Thứ Sáu', offset: 4 },
  { id: 7, name: 'Thứ Bảy', offset: 5 },
]

const PERIODS = [1, 2, 3, 4, 5]

// DANH SÁCH LỚP TOÀN TRƯỜNG ĐỂ GỢI Ý
const ALL_CLASSES = [
  '10T1', '10T2', '10L', '10H', '10Sinh', '10Tin', '10V', '10Sử', '10Địa', '10A1', '10A2', '10P', '10N',
  '11T1', '11T2', '11L', '11H', '11Sinh', '11Tin', '11V', '11SỬ', '11Đ', '11A1', '11A2', '11P', '11N',
  '12T1', '12T2', '12L', '12H', '12Sinh', '12Tin', '12V', '12SỬ', '12Đ', '12A1', '12A2', '12P', '12N'
]

// DANH SÁCH TẤT CẢ CÁC MÔN HỌC ĐỂ GỢI Ý
const ALL_SUBJECTS = [
  'Toán', 'GDĐP', 'TRN', 'Tin học', 'Vật lí', 'Hóa học', 
  'Sinh học', 'Ngữ văn', 'Lịch sử', 'Địa lí', 'Tiếng Anh', 'Tiếng Nga', 'Tiếng Pháp', 'GDQP-AN', 'GDTC'
]

// MỐC THỜI GIAN: TUẦN 1 BẮT ĐẦU TỪ THỨ HAI 07/09/2026
const START_DATE_WEEK_1 = new Date(2026, 8, 7)

const getCurrentRealWeek = () => {
  const now = new Date()
  const diffTime = now.getTime() - START_DATE_WEEK_1.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 1
  const week = Math.floor(diffDays / 7) + 1
  return Math.min(Math.max(week, 1), 35)
}

const SUBJECT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Toán': { bg: 'bg-amber-100/70', border: 'border-amber-400', text: 'text-amber-900' },
  'T': { bg: 'bg-amber-100/70', border: 'border-amber-400', text: 'text-amber-900' },
  'HĐTN': { bg: 'bg-fuchsia-100/70', border: 'border-fuchsia-400', text: 'text-fuchsia-900' },
  'TRN': { bg: 'bg-fuchsia-100/70', border: 'border-fuchsia-400', text: 'text-fuchsia-900' },
  'TrN': { bg: 'bg-fuchsia-100/70', border: 'border-fuchsia-400', text: 'text-fuchsia-900' },
  'GDĐP': { bg: 'bg-emerald-100/70', border: 'border-emerald-400', text: 'text-emerald-900' },
  'Dạy thay': { bg: 'bg-rose-100/80', border: 'border-rose-400', text: 'text-rose-900' },
  'default': { bg: 'bg-sky-100/70', border: 'border-sky-400', text: 'text-sky-900' },
}

export default function SchedulePage() {
  const supabase = createClient()

  const [selectedWeek, setSelectedWeek] = useState<number>(getCurrentRealWeek)
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [overrides, setOverrides] = useState<LessonOverride[]>([])
  const [loading, setLoading] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // State popup
  const [activeSlot, setActiveSlot] = useState<{
    day: number
    period: number
    entry?: ScheduleEntry
    slotOrderInWeek?: number
    currentLessonOrder?: number
    isOverridden?: boolean
  } | null>(null)

  const [targetLessonOrder, setTargetLessonOrder] = useState<number>(1)
  const [slotType, setSlotType] = useState<'my_class' | 'substitute'>('my_class')

  // State thêm tiết cho lớp của mình
  const [inputClassName, setInputClassName] = useState<string>('')
  const [inputSubject, setInputSubject] = useState<string>('Toán')

  // Form dạy thay
  const [subClassCode, setSubClassCode] = useState('')
  const [subSubject, setSubSubject] = useState('Toán')
  const [subTeacherName, setSubTeacherName] = useState('')
  const [subLessonOrder, setSubLessonOrder] = useState<number>(1)
  const [subLessonName, setSubLessonName] = useState('')

  const loadAll = async () => {
    setLoading(true)

    const { data: cData } = await supabase.from('classes').select('*').order('code')
    if (cData) {
      setClasses(cData)
      if (cData.length > 0 && !inputClassName) {
        setInputClassName(cData[0].code)
        setInputSubject(cData[0].subject || 'Toán')
      }
    }

    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('id, day_of_week, period_number, session, class_id, week_number, is_substitute, sub_class_code, sub_subject, sub_teacher_name, sub_lesson_order, sub_lesson_name, classes(*)')
    if (sData) setSchedule(sData as any)

    const { data: currData } = await supabase
      .from('curriculum_items')
      .select('id, class_id, template_id, lesson_order, lesson_name')
      .order('lesson_order', { ascending: true })
    if (currData) setCurriculum(currData)

    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const getDateOfDay = (dayOffset: number) => {
    const d = new Date(START_DATE_WEEK_1)
    d.setDate(d.getDate() + (selectedWeek - 1) * 7 + dayOffset)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  const isToday = (dayOfWeek: number) => {
    const now = new Date()
    const currentJsDay = now.getDay()
    const mapToDayOfWeek = currentJsDay === 0 ? 8 : currentJsDay + 1
    return selectedWeek === getCurrentRealWeek() && mapToDayOfWeek === dayOfWeek
  }

  const calculateLessonsForWeek = () => {
    const lessonMap: Record<string, { order: number; name: string; isOverridden: boolean; slotOrderInWeek: number } | null> = {}

    const mainSchedule = schedule.filter((s) => !s.is_substitute && (s.week_number === 0 || !s.week_number))

    const sortedSchedule = [...mainSchedule].sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
      return a.period_number - b.period_number
    })

    const uniqueClassIds = Array.from(new Set(sortedSchedule.map((s) => s.class_id).filter(Boolean)))

    uniqueClassIds.forEach((cId) => {
      const currentClass = classes.find((c) => c.id === cId)
      
      let classLessons = curriculum.filter((c) => c.class_id === cId)
      if (classLessons.length === 0 && currentClass?.template_id) {
        classLessons = curriculum.filter((c) => c.template_id === currentClass.template_id)
      }

      const classSlots = sortedSchedule.filter((s) => s.class_id === cId)
      const periodsPerWeek = classSlots.length
      if (periodsPerWeek === 0) return

      const taughtLessons = new Set<number>()

      for (let w = 1; w <= selectedWeek; w++) {
        for (let sIdx = 0; sIdx < periodsPerWeek; sIdx++) {
          const slot = classSlots[sIdx]
          const ovr = overrides.find(
            (o) => o.class_id === cId && o.week_number === w && o.slot_order_in_week === sIdx
          )

          let assignedOrder: number
          if (ovr) {
            assignedOrder = ovr.override_lesson_order
          } else {
            if (classLessons.length > 0) {
              const nextAvailable = classLessons.find((l) => !taughtLessons.has(l.lesson_order))
              assignedOrder = nextAvailable ? nextAvailable.lesson_order : classLessons.length + 1
            } else {
              assignedOrder = (w - 1) * periodsPerWeek + (sIdx + 1)
            }
          }

          taughtLessons.add(assignedOrder)

          if (w === selectedWeek) {
            const foundItem = classLessons.find((l) => l.lesson_order === assignedOrder)
            const key = `${slot.day_of_week}_${slot.period_number}`
            lessonMap[key] = {
              order: assignedOrder,
              name: foundItem ? foundItem.lesson_name : `Bài tiết ${assignedOrder}`,
              isOverridden: !!ovr,
              slotOrderInWeek: sIdx,
            }
          }
        }
      }
    })

    return lessonMap
  }

  const lessonResults = calculateLessonsForWeek()

  const getEntryForCell = (day: number, period: number) => {
    const subEntry = schedule.find(
      (s) => s.day_of_week === day && s.period_number === period && s.is_substitute && s.week_number === selectedWeek
    )
    if (subEntry) return subEntry

    const weekSpecificEntry = schedule.find(
      (s) => s.day_of_week === day && s.period_number === period && !s.is_substitute && s.week_number === selectedWeek
    )
    if (weekSpecificEntry) return weekSpecificEntry

    return schedule.find(
      (s) => s.day_of_week === day && s.period_number === period && !s.is_substitute && (s.week_number === 0 || !s.week_number)
    )
  }

  const handleCellClick = (day: number, period: number, entry?: ScheduleEntry) => {
    const lessonInfo = lessonResults[`${day}_${period}`]

    setActiveSlot({
      day,
      period,
      entry,
      slotOrderInWeek: lessonInfo?.slotOrderInWeek ?? 0,
      currentLessonOrder: entry?.is_substitute ? (entry.sub_lesson_order || 1) : (lessonInfo?.order ?? 1),
      isOverridden: lessonInfo?.isOverridden ?? false,
    })

    setTargetLessonOrder(
      entry?.is_substitute ? (entry.sub_lesson_order || 1) : (lessonInfo ? lessonInfo.order : 1)
    )
    setSlotType('my_class')
    setSubClassCode('')
    setSubTeacherName('')
    setSubLessonName('')
  }

  const handleSaveLessonOverride = async () => {
    if (!activeSlot?.entry) return
    setLoading(true)

    if (activeSlot.entry.is_substitute) {
      await supabase
        .from('schedule_entries')
        .update({ sub_lesson_order: Number(targetLessonOrder) })
        .eq('id', activeSlot.entry.id)
    } else {
      await supabase.from('lesson_overrides').upsert(
        {
          class_id: activeSlot.entry.class_id,
          week_number: selectedWeek,
          slot_order_in_week: activeSlot.slotOrderInWeek ?? 0,
          override_lesson_order: Number(targetLessonOrder),
        },
        { onConflict: 'class_id,week_number,slot_order_in_week' }
      )
    }

    setActiveSlot(null)
    await loadAll()
  }

  const handleResetLessonOverride = async () => {
    if (!activeSlot?.entry) return
    setLoading(true)

    await supabase
      .from('lesson_overrides')
      .delete()
      .eq('class_id', activeSlot.entry.class_id)
      .eq('week_number', selectedWeek)
      .eq('slot_order_in_week', activeSlot.slotOrderInWeek ?? 0)

    setActiveSlot(null)
    await loadAll()
  }

  const handleDeleteSlot = async () => {
    if (!activeSlot?.entry) return
    setLoading(true)
    await supabase.from('schedule_entries').delete().eq('id', activeSlot.entry.id)
    setActiveSlot(null)
    await loadAll()
  }

  const handleCreateSlot = async (isPermanent: boolean = true) => {
    if (!activeSlot) return
    setLoading(true)

    if (slotType === 'my_class') {
      const trimmedClass = inputClassName.trim().toUpperCase()
      const trimmedSubject = inputSubject.trim()

      if (!trimmedClass) {
        alert('Vui lòng chọn hoặc nhập tên lớp!')
        setLoading(false)
        return
      }

      let targetClassId = ''
      const existingClass = classes.find(
        (c) => c.code.toUpperCase() === trimmedClass && c.subject.toLowerCase() === trimmedSubject.toLowerCase()
      )

      if (existingClass) {
        targetClassId = existingClass.id
      } else {
        const { data: newClass, error: insertError } = await supabase
          .from('classes')
          .insert({
            code: trimmedClass,
            name: `Lớp ${trimmedClass}`,
            subject: trimmedSubject,
          })
          .select()
          .single()

        if (insertError || !newClass) {
          alert('Không thể khởi tạo lớp mới: ' + (insertError?.message || 'Lỗi không xác định'))
          setLoading(false)
          return
        }
        targetClassId = newClass.id
      }

      await supabase.from('schedule_entries').insert({
        day_of_week: activeSlot.day,
        period_number: activeSlot.period,
        class_id: targetClassId,
        session: 'morning',
        week_number: isPermanent ? 0 : selectedWeek,
        is_substitute: false,
      })
    } else {
      if (!subClassCode.trim()) {
        alert('Vui lòng nhập tên lớp dạy hộ!')
        setLoading(false)
        return
      }

      await supabase.from('schedule_entries').insert({
        day_of_week: activeSlot.day,
        period_number: activeSlot.period,
        session: 'morning',
        week_number: selectedWeek,
        is_substitute: true,
        sub_class_code: subClassCode.trim().toUpperCase(),
        sub_subject: subSubject.trim(),
        sub_teacher_name: subTeacherName.trim(),
        sub_lesson_order: Number(subLessonOrder) || 1,
        sub_lesson_name: subLessonName.trim() || `Tiết ${subLessonOrder}`,
      })
    }

    setActiveSlot(null)
    await loadAll()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Thời Khóa Biểu Giảng Dạy</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Mốc thời gian thực: <strong>Tuần 1 bắt đầu từ 07/09</strong> — Tự động cập nhật theo ngày hiện tại
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* BỘ CHỌN TUẦN */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-500 uppercase">Xem Tuần:</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="font-black text-emerald-700 bg-transparent text-sm focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Tuần {w < 10 ? '0' + w : w} {w === getCurrentRealWeek() ? '(Hiện tại)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Nhập TKB (Excel / JSON)
          </button>

          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* BẢNG THỜI KHÓA BIỂU */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 border-b text-slate-700 text-xs uppercase tracking-wider">
              <th className="p-2.5 border-r text-center w-20 font-bold">Tiết</th>
              {DAYS.map((d) => {
                const isCurrentToday = isToday(d.id)
                return (
                  <th
                    key={d.id}
                    className={`p-2.5 border-r text-center transition ${
                      isCurrentToday ? 'bg-emerald-100/70 text-emerald-950 font-black ring-2 ring-emerald-500' : 'font-bold'
                    }`}
                  >
                    <span className="block text-sm">{d.name}</span>
                    <span className="text-[11px] font-semibold text-slate-500 block normal-case">
                      {getDateOfDay(d.offset)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period} className="border-b text-center h-20">
                <td className="p-2 border-r font-black text-slate-700 bg-slate-50/60 text-xs w-20">
                  Tiết {period}
                </td>

                {DAYS.map((day) => {
                  const entry = getEntryForCell(day.id, period)
                  const isSelected = activeSlot?.day === day.id && activeSlot?.period === period
                  const isCurrentToday = isToday(day.id)

                  if (!entry) {
                    return (
                      <td
                        key={day.id}
                        onClick={() => handleCellClick(day.id, period)}
                        className={`p-2 border-r cursor-pointer transition relative group ${
                          isCurrentToday ? 'bg-emerald-50/20' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-slate-300 font-bold group-hover:text-emerald-600 transition text-sm">
                          —
                        </span>
                      </td>
                    )
                  }

                  const isSub = !!entry.is_substitute
                  const isWeekOnly = !isSub && entry.week_number && entry.week_number > 0
                  const lessonInfo = lessonResults[`${day.id}_${period}`]
                  const rawSubject = isSub ? (entry.sub_subject || 'Dạy thay') : (entry.classes?.subject || 'Toán')
                  const classCode = isSub ? entry.sub_class_code : entry.classes?.code
                  const lessonNum = isSub ? entry.sub_lesson_order : (lessonInfo ? lessonInfo.order : '—')

                  const colorTheme = isSub
                    ? SUBJECT_COLORS['Dạy thay']
                    : (SUBJECT_COLORS[rawSubject] || SUBJECT_COLORS['default'])

                  return (
                    <td
                      key={day.id}
                      onClick={() => handleCellClick(day.id, period, entry)}
                      className={`p-1.5 border-r cursor-pointer transition relative ${
                        isCurrentToday ? 'bg-emerald-50/20' : ''
                      } ${isSelected ? 'ring-2 ring-emerald-600 shadow-md' : 'hover:brightness-95'}`}
                    >
                      <div
                        className={`h-full w-full rounded-xl border-2 py-2 px-1 flex flex-col justify-center items-center transition shadow-2xs relative ${colorTheme.bg} ${colorTheme.border}`}
                      >
                        {isSub ? (
                          <span className="absolute top-1 right-1 px-1 py-0.2 bg-rose-600 text-white rounded text-[8px] font-black uppercase">
                            Dạy thay
                          </span>
                        ) : isWeekOnly ? (
                          <span className="absolute top-1 right-1 px-1 py-0.2 bg-sky-600 text-white rounded text-[8px] font-black uppercase">
                            Tuần {entry.week_number}
                          </span>
                        ) : (
                          lessonInfo?.isOverridden && (
                            <span className="absolute top-1 right-1 px-1 py-0.2 bg-amber-500 text-white rounded text-[8px] font-black uppercase">
                              Đã đảo
                            </span>
                          )
                        )}

                        <span className="text-[11px] font-black uppercase tracking-wider block text-slate-700 leading-tight">
                          {rawSubject}-{lessonNum}
                        </span>
                        <span className="text-lg font-black text-slate-900 block leading-tight mt-0.5">
                          {classCode}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* POPUP: ĐIỀU CHỈNH HOẶC THÊM TIẾT */}
      {activeSlot && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2.5">
              <div>
                <span className="font-bold text-slate-800 text-sm block">
                  {DAYS.find((d) => d.id === activeSlot.day)?.name} ({getDateOfDay(DAYS.find((d) => d.id === activeSlot.day)?.offset || 0)}) — Tiết {activeSlot.period}
                </span>
                <span className="text-xs font-semibold text-emerald-800">
                  {activeSlot.entry
                    ? activeSlot.entry.is_substitute
                      ? `Dạy thay: ${activeSlot.entry.sub_class_code} (${activeSlot.entry.sub_subject})`
                      : `${activeSlot.entry.classes?.subject} - Lớp ${activeSlot.entry.classes?.code} ${activeSlot.entry.week_number ? `(Tuần ${activeSlot.entry.week_number})` : '(Cố định)'}`
                    : 'Thêm tiết giảng dạy'}
                </span>
              </div>
              <button onClick={() => setActiveSlot(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeSlot.entry ? (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-blue-950">Số tiết PPCT:</label>
                    <span className="text-[11px] font-semibold text-blue-700">
                      Hiện tại: Tiết {activeSlot.currentLessonOrder}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={150}
                      value={targetLessonOrder}
                      onChange={(e) => setTargetLessonOrder(Number(e.target.value))}
                      className="w-20 px-2 py-1.5 border rounded-lg font-black text-blue-800 text-base text-center bg-white focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleSaveLessonOverride}
                      disabled={loading}
                      className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer"
                    >
                      Lưu Số Tiết
                    </button>
                    {!activeSlot.entry.is_substitute && activeSlot.isOverridden && (
                      <button
                        onClick={handleResetLessonOverride}
                        disabled={loading}
                        title="Trở về theo tiến độ gốc"
                        className="p-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={handleDeleteSlot}
                    disabled={loading}
                    className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa Tiết Này
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setSlotType('my_class')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      slotType === 'my_class'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Lớp của mình
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlotType('substitute')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      slotType === 'substitute'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Dạy hộ / Dạy thay
                  </button>
                </div>

                {slotType === 'my_class' ? (
                  <div className="space-y-3 pt-1">
                    {/* KHỐI 2 Ô: LỚP VÀ MÔN TÁCH RỜI */}
                    <div className="grid grid-cols-2 gap-2 text-left">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Lớp học:
                        </label>
                        <input
                          type="text"
                          list="globalClassList"
                          placeholder="vd: 12SỬ, 11N..."
                          value={inputClassName}
                          onChange={(e) => setInputClassName(e.target.value)}
                          className="w-full p-2 border rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Môn học:
                        </label>
                        <input
                          type="text"
                          list="globalSubjectList"
                          placeholder="vd: Toán, GDĐP..."
                          value={inputSubject}
                          onChange={(e) => setInputSubject(e.target.value)}
                          className="w-full p-2 border rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* HAI NÚT LỰA CHỌN: CHỈ TUẦN NÀY HOẶC CỐ ĐỊNH */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleCreateSlot(false)}
                        disabled={loading || !inputClassName.trim()}
                        className="py-2 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                        title={`Chỉ áp dụng riêng cho tuần ${selectedWeek}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Chỉ Tuần Này ({selectedWeek})
                      </button>

                      <button
                        onClick={() => handleCreateSlot(true)}
                        disabled={loading || !inputClassName.trim()}
                        className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                        title="Áp dụng cho tất cả các tuần"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm Cố Định
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Mã lớp dạy hộ:</label>
                        <input
                          type="text"
                          list="globalClassList"
                          placeholder="vd: 11A2, 12SỬ"
                          value={subClassCode}
                          onChange={(e) => setSubClassCode(e.target.value)}
                          className="w-full p-1.5 border rounded-lg text-xs font-black uppercase focus:ring-2 focus:ring-rose-400"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Môn học:</label>
                        <input
                          type="text"
                          list="globalSubjectList"
                          value={subSubject}
                          onChange={(e) => setSubSubject(e.target.value)}
                          className="w-full p-1.5 border rounded-lg text-xs font-semibold focus:ring-2 focus:ring-rose-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Dạy thay thầy / cô:</label>
                      <input
                        type="text"
                        placeholder="vd: Thầy Nam, Cô Lan..."
                        value={subTeacherName}
                        onChange={(e) => setSubTeacherName(e.target.value)}
                        className="w-full p-1.5 border rounded-lg text-xs font-medium focus:ring-2 focus:ring-rose-400"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Tiết PPCT:</label>
                        <input
                          type="number"
                          min={1}
                          max={150}
                          value={subLessonOrder}
                          onChange={(e) => setSubLessonOrder(Number(e.target.value))}
                          className="w-full p-1.5 border rounded-lg text-xs font-black text-center text-blue-700"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Tên bài dạy hộ:</label>
                        <input
                          type="text"
                          placeholder="vd: Ôn tập chương..."
                          value={subLessonName}
                          onChange={(e) => setSubLessonName(e.target.value)}
                          className="w-full p-1.5 border rounded-lg text-xs font-medium"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 italic">
                      * Tiết dạy hộ chỉ áp dụng riêng cho <strong>Tuần {selectedWeek}</strong> và sẽ tự ghi chú "Dạy thay" trên Sổ Báo Giảng.
                    </p>

                    <button
                      onClick={handleCreateSlot}
                      disabled={loading || !subClassCode.trim()}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Lưu Tiết Dạy Thay (Tuần {selectedWeek})
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* NGUỒN GỢI Ý DÙNG CHUNG CHO CẢ HAI TAB */}
            <datalist id="globalClassList">
              {ALL_CLASSES.map((cls) => (
                <option key={cls} value={cls} />
              ))}
            </datalist>

            <datalist id="globalSubjectList">
              {ALL_SUBJECTS.map((sub) => (
                <option key={sub} value={sub} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {/* MODAL NHẬP TKB (EXCEL / JSON) */}
      <ImportScheduleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => loadAll()}
      />
    </div>
  )
}