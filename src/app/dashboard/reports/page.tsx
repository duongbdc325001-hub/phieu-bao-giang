'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, RefreshCw, ArrowLeftRight, X, RotateCcw } from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade?: number
  template_id?: string | null
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

interface CurriculumTemplate {
  id: string
  title: string
  subject: string
  grade: number
  total_lessons?: number
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

// MỐC KHAI GIẢNG: TUẦN 1 BẮT ĐẦU TỪ THỨ HAI 07/09/2026
const START_DATE_WEEK_1 = new Date(2026, 8, 7, 0, 0, 0)

const DAYS = [
  { id: 2, name: 'Thứ Hai', offset: 0 },
  { id: 3, name: 'Thứ Ba', offset: 1 },
  { id: 4, name: 'Thứ Tư', offset: 2 },
  { id: 5, name: 'Thứ Năm', offset: 3 },
  { id: 6, name: 'Thứ Sáu', offset: 4 },
  { id: 7, name: 'Thứ Bảy', offset: 5 },
]

const getSubjectType = (raw?: string): 'TOAN' | 'TRN' | 'GDDP' | 'OTHER' => {
  if (!raw) return 'OTHER'
  const s = raw.trim().toLowerCase()
  if (s === 't' || s.includes('toán')) return 'TOAN'
  if (s === 'trn' || s.includes('hđtn') || s.includes('trải nghiệm')) return 'TRN'
  if (s === 'gdđp' || s.includes('địa phương')) return 'GDDP'
  return 'OTHER'
}

const extractGradeFromCode = (code?: string, defaultGrade?: number): number => {
  if (code) {
    const trimmed = code.trim()
    if (trimmed.startsWith('10')) return 10
    if (trimmed.startsWith('11')) return 11
    if (trimmed.startsWith('12')) return 12
  }
  if (defaultGrade && defaultGrade >= 10 && defaultGrade <= 12) return defaultGrade
  return 12
}

export default function ReportsPage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [overrides, setOverrides] = useState<LessonOverride[]>([])
  const [loading, setLoading] = useState(false)

  const [editingSlot, setEditingSlot] = useState<{
    entry: ScheduleEntry
    slotOrderInWeek: number
    currentLessonOrder: number
    isOverridden: boolean
  } | null>(null)
  const [targetLessonOrder, setTargetLessonOrder] = useState<number>(1)

  // Tính chuỗi ngày/tháng cụ thể cho Thứ theo tuần đang chọn
  const getFormattedDate = (offset: number) => {
    const d = new Date(START_DATE_WEEK_1)
    d.setDate(d.getDate() + (selectedWeek - 1) * 7 + offset)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  const loadData = async () => {
    setLoading(true)

    const { data: cData } = await supabase.from('classes').select('*')
    if (cData) setClasses(cData)

    const { data: tData } = await supabase.from('curriculum_templates').select('*')
    if (tData) setTemplates(tData)

    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('id, day_of_week, period_number, session, class_id, week_number, is_substitute, sub_class_code, sub_subject, sub_teacher_name, sub_lesson_order, sub_lesson_name, classes(*)')
    if (sData) setSchedule(sData as any)

    const { data: currData } = await supabase.from('curriculum_items').select('*')
    if (currData) {
      const normalized = currData.map((item: any) => ({
        id: item.id,
        class_id: item.class_id,
        template_id: item.template_id,
        lesson_order: Number(item.lesson_order ?? item.order_number ?? item.order ?? 1),
        lesson_name: item.lesson_name || item.title || item.name || '',
      }))
      setCurriculum(normalized)
    }

    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const calculateReportRows = () => {
    const mainSchedule = schedule.filter((s) => !s.is_substitute && (s.week_number === 0 || !s.week_number))

    const sortedSchedule = [...mainSchedule].sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
      return a.period_number - b.period_number
    })

    const groupMap = new Map<string, ScheduleEntry[]>()
    sortedSchedule.forEach((slot) => {
      const code = slot.classes?.code || ''
      const subType = getSubjectType(slot.classes?.subject)
      const groupKey = `${code}__${subType}`

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, [])
      }
      groupMap.get(groupKey)!.push(slot)
    })

    const lessonMap: Record<string, { order: number; name: string; isOverridden: boolean; slotOrderInWeek: number }> = {}

    groupMap.forEach((classSlots, groupKey) => {
      const [clsCode, subType] = groupKey.split('__')
      const firstSlot = classSlots[0]
      const actualClass = classes.find(
        (c) => c.code === clsCode && getSubjectType(c.subject) === subType
      ) || firstSlot.classes

      const grade = extractGradeFromCode(clsCode, actualClass?.grade)

      let validLessons: CurriculumItem[] = []

      // 1. Kiểm tra template_id
      if (actualClass?.template_id) {
        const tpl = templates.find((t) => t.id === actualClass.template_id)
        if (tpl && getSubjectType(tpl.subject) === subType && tpl.grade === grade) {
          validLessons = curriculum.filter((c) => c.template_id === actualClass.template_id)
        }
      }

      // 2. Kiểm tra theo class_id
      if (validLessons.length === 0 && actualClass?.id) {
        const direct = curriculum.filter((c) => c.class_id === actualClass.id)
        const isClean = direct.every((d) => {
          const txt = d.lesson_name.toLowerCase()
          if (subType === 'TOAN') return !txt.includes('tọa đàm') && !txt.includes('phú thọ') && !txt.includes('hồ chí minh')
          if (subType === 'TRN') return !txt.includes('đạo hàm') && !txt.includes('vecto') && !txt.includes('phú thọ')
          if (subType === 'GDDP') return !txt.includes('đạo hàm') && !txt.includes('tọa đàm')
          return true
        })
        if (isClean && direct.length > 0) {
          validLessons = direct
        }
      }

      // 3. Fallback khớp chuẩn cả Môn lẫn Khối
      if (validLessons.length === 0) {
        const matchedTemplate = templates.find(
          (t) => getSubjectType(t.subject) === subType && t.grade === grade
        )
        if (matchedTemplate) {
          validLessons = curriculum.filter((c) => c.template_id === matchedTemplate.id)
        }
      }

      validLessons.sort((a, b) => a.lesson_order - b.lesson_order)

      const periodsPerWeek = classSlots.length
      if (periodsPerWeek === 0) return

      const taughtLessons = new Set<number>()

      for (let w = 1; w <= selectedWeek; w++) {
        for (let sIdx = 0; sIdx < periodsPerWeek; sIdx++) {
          const slot = classSlots[sIdx]
          const ovr = actualClass
            ? overrides.find(
                (o) => o.class_id === actualClass.id && o.week_number === w && o.slot_order_in_week === sIdx
              )
            : undefined

          let assignedOrder: number
          if (ovr) {
            assignedOrder = ovr.override_lesson_order
          } else {
            if (validLessons.length > 0) {
              const nextAvail = validLessons.find((l) => !taughtLessons.has(l.lesson_order))
              assignedOrder = nextAvail ? nextAvail.lesson_order : validLessons.length + 1
            } else {
              assignedOrder = (w - 1) * periodsPerWeek + (sIdx + 1)
            }
          }

          taughtLessons.add(assignedOrder)

          if (w === selectedWeek) {
            const foundItem = validLessons.find((l) => l.lesson_order === assignedOrder)
            const mapKey = `${slot.day_of_week}_${slot.period_number}`
            lessonMap[mapKey] = {
              order: assignedOrder,
              name: foundItem ? foundItem.lesson_name : '',
              isOverridden: !!ovr,
              slotOrderInWeek: sIdx,
            }
          }
        }
      }
    })

    const weekRows: any[] = []

    DAYS.forEach((day) => {
      const daySlots: any[] = []

      for (let p = 1; p <= 5; p++) {
        const subEntry = schedule.find(
          (s) => s.day_of_week === day.id && s.period_number === p && s.is_substitute && s.week_number === selectedWeek
        )

        if (subEntry) {
          daySlots.push({
            entry: subEntry,
            day: day.id,
            period: p,
            subjectClass: `${subEntry.sub_subject || 'Dạy thay'} - ${subEntry.sub_class_code}`,
            lessonOrder: subEntry.sub_lesson_order || 1,
            lessonName: subEntry.sub_lesson_name || '',
            isSubstitute: true,
            subTeacher: subEntry.sub_teacher_name,
            isOverridden: false,
            slotOrderInWeek: 0,
          })
          continue
        }

        const defaultEntry = schedule.find(
          (s) => s.day_of_week === day.id && s.period_number === p && (!s.is_substitute || s.is_substitute === false)
        )

        if (defaultEntry) {
          const info = lessonMap[`${day.id}_${p}`]
          const subject = defaultEntry.classes?.subject || 'Toán'
          const code = defaultEntry.classes?.code || ''

          daySlots.push({
            entry: defaultEntry,
            day: day.id,
            period: p,
            subjectClass: `${subject} - ${code}`,
            lessonOrder: info ? info.order : '—',
            lessonName: info?.name || '',
            isSubstitute: false,
            isOverridden: info?.isOverridden || false,
            slotOrderInWeek: info?.slotOrderInWeek ?? 0,
          })
        }
      }

      if (daySlots.length > 0) {
        weekRows.push({
          day,
          slots: daySlots,
        })
      }
    })

    return weekRows
  }

  const reportData = calculateReportRows()
  const totalSlotsCount = reportData.reduce((acc, curr) => acc + curr.slots.length, 0)

  const handleSaveOverride = async () => {
    if (!editingSlot) return
    setLoading(true)

    if (editingSlot.entry.is_substitute) {
      await supabase
        .from('schedule_entries')
        .update({ sub_lesson_order: Number(targetLessonOrder) })
        .eq('id', editingSlot.entry.id)
    } else {
      await supabase.from('lesson_overrides').upsert(
        {
          class_id: editingSlot.entry.class_id,
          week_number: selectedWeek,
          slot_order_in_week: editingSlot.slotOrderInWeek,
          override_lesson_order: Number(targetLessonOrder),
        },
        { onConflict: 'class_id,week_number,slot_order_in_week' }
      )
    }

    setEditingSlot(null)
    await loadData()
  }

  const handleResetOverride = async () => {
    if (!editingSlot || editingSlot.entry.is_substitute) return
    setLoading(true)

    await supabase
      .from('lesson_overrides')
      .delete()
      .eq('class_id', editingSlot.entry.class_id)
      .eq('week_number', selectedWeek)
      .eq('slot_order_in_week', editingSlot.slotOrderInWeek)

    setEditingSlot(null)
    await loadData()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lịch Báo Giảng Tuần</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động đồng bộ số tiết PPCT và tên bài dạy theo Thời khóa biểu (Mốc 07/09/2026)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-500 uppercase">Tuần Dạy:</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="font-black text-emerald-700 bg-transparent text-sm focus:outline-none cursor-pointer"
            >
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

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-slate-800 text-sm uppercase tracking-wide">
              PHIẾU BÁO GIẢNG TUẦN {selectedWeek < 10 ? '0' + selectedWeek : selectedWeek}
            </span>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200">
            Tổng: {totalSlotsCount} tiết / tuần
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b uppercase tracking-wider">
              <tr>
                <th className="p-2.5 border-r text-center w-28">Thứ, ngày</th>
                <th className="p-2.5 border-r text-center w-36">Môn - Lớp</th>
                <th className="p-2.5 border-r text-center w-20">Tiết TKB</th>
                <th className="p-2.5 border-r">Tên bài dạy theo PPCT</th>
                <th className="p-2.5 border-r text-center w-24">Tiết theo CT</th>
                <th className="p-2.5 text-center w-28">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {reportData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    Tuần này chưa có tiết dạy nào được xếp trong Thời khóa biểu.
                  </td>
                </tr>
              ) : (
                reportData.map((group) => {
                  return group.slots.map((slot: any, idx: number) => {
                    const isFirst = idx === 0
                    const hasLesson = slot.lessonName && slot.lessonName.trim() !== ''

                    return (
                      <tr key={`${slot.day}_${slot.period}`} className="hover:bg-slate-50/80 transition">
                        {isFirst && (
                          <td
                            rowSpan={group.slots.length}
                            className="p-3 border-r text-center font-black text-slate-800 bg-slate-50/50 align-middle"
                          >
                            <span className="text-sm font-black text-slate-900 block">
                              {group.day.name}
                            </span>
                            {/* Dòng ngày tháng tự động tính toán */}
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block mt-1">
                              {getFormattedDate(group.day.offset)}
                            </span>
                          </td>
                        )}

                        <td className="p-2.5 border-r text-center font-black text-slate-900">
                          {slot.subjectClass}
                        </td>

                        <td className="p-2.5 border-r text-center font-black text-emerald-700">
                          {slot.period}
                        </td>

                        <td className="p-2.5 border-r font-medium">
                          {hasLesson ? (
                            <span className="text-slate-900 font-bold">{slot.lessonName}</span>
                          ) : (
                            <span className="text-slate-400 italic">
                              Chưa có PPCT cho tiết này
                            </span>
                          )}
                        </td>

                        <td className="p-2.5 border-r text-center font-black">
                          <button
                            onClick={() => {
                              setEditingSlot({
                                entry: slot.entry,
                                slotOrderInWeek: slot.slotOrderInWeek,
                                currentLessonOrder: Number(slot.lessonOrder) || 1,
                                isOverridden: slot.isOverridden,
                              })
                              setTargetLessonOrder(Number(slot.lessonOrder) || 1)
                            }}
                            title="Bấm để điều chỉnh (đảo) số tiết"
                            className={`px-2 py-0.5 rounded-md inline-flex items-center gap-1 hover:ring-2 hover:ring-blue-400 transition cursor-pointer ${
                              slot.isOverridden
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'text-blue-700 bg-blue-50 border border-blue-200'
                            }`}
                          >
                            <span>{slot.lessonOrder}</span>
                            <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        </td>

                        <td className="p-2.5 text-center">
                          {slot.isSubstitute ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                              Dạy thay {slot.subTeacher ? `(${slot.subTeacher})` : ''}
                            </span>
                          ) : slot.isOverridden ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Đã đảo tiết
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 space-y-3 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-bold text-slate-800 text-xs uppercase">
                Điều chỉnh số tiết PPCT
              </span>
              <button onClick={() => setEditingSlot(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Hiện tại:</span>
                <span className="font-bold text-slate-800">Tiết {editingSlot.currentLessonOrder}</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={150}
                  value={targetLessonOrder}
                  onChange={(e) => setTargetLessonOrder(Number(e.target.value))}
                  className="w-20 p-1.5 border rounded-lg font-black text-center text-blue-800 text-sm focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveOverride}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs transition"
                >
                  Lưu
                </button>
                {editingSlot.isOverridden && !editingSlot.entry.is_substitute && (
                  <button
                    onClick={handleResetOverride}
                    title="Về tiến độ gốc"
                    className="p-1.5 border rounded-lg hover:bg-slate-50 text-slate-600"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}