'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Layers, RefreshCw, Calendar, Check, Clock, AlertTriangle } from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade?: number
  template_id?: string | null
}

interface CurriculumItem {
  id?: string
  class_id?: string
  template_id?: string
  lesson_order: number
  lesson_name: string
}

interface CurriculumTemplate {
  id: string
  title: string
  subject: string
  grade: number
  total_lessons: number
}

interface ScheduleEntry {
  id: string
  class_id?: string
  day_of_week: number
  period_number: number
  week_number?: number
  is_substitute?: boolean
  classes?: ClassItem
}

interface LessonOverride {
  id: string
  class_id: string
  week_number: number
  slot_order_in_week: number
  override_lesson_order: number
}

const START_DATE_WEEK_1 = new Date(2026, 8, 7, 0, 0, 0)

const PERIOD_START_HOURS: Record<number, { h: number; m: number }> = {
  1: { h: 7, m: 15 },
  2: { h: 8, m: 5 },
  3: { h: 9, m: 5 },
  4: { h: 9, m: 55 },
  5: { h: 10, m: 45 },
}

const getCurrentRealWeek = () => {
  const now = new Date()
  const diffTime = now.getTime() - START_DATE_WEEK_1.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 1
  const week = Math.floor(diffDays / 7) + 1
  return Math.min(Math.max(week, 1), 35)
}

// Chuẩn hóa định danh môn học
const normalizeSubjectCategory = (raw?: string): 'TOAN' | 'TRN' | 'GDDP' | 'OTHER' => {
  if (!raw) return 'OTHER'
  const s = raw.trim().toLowerCase()
  if (s === 't' || s.includes('toán')) return 'TOAN'
  if (s === 'trn' || s.includes('hđtn') || s.includes('trải nghiệm')) return 'TRN'
  if (s === 'gdđp' || s.includes('địa phương')) return 'GDDP'
  return 'OTHER'
}

export default function ClassesPage() {
  const supabase = createClient()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [overrides, setOverrides] = useState<LessonOverride[]>([])
  const [loading, setLoading] = useState(false)

  const [currentWeek, setCurrentWeek] = useState<number>(getCurrentRealWeek)

  const loadData = async () => {
    setLoading(true)

    // 1. Tải danh sách templates
    const { data: tData } = await supabase
      .from('curriculum_templates')
      .select('*')
      .order('subject', { ascending: true })
    if (tData) setTemplates(tData)

    // 2. Lấy TKB để trích xuất danh sách lớp duy nhất
    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('id, class_id, day_of_week, period_number, week_number, is_substitute, classes(*)')
      .eq('is_substitute', false)
      .eq('week_number', 0)

    if (sData) {
      setSchedule(sData as any)

      const classMap = new Map<string, ClassItem>()
      sData.forEach((slot: any) => {
        if (slot.classes && slot.classes.id) {
          classMap.set(slot.classes.id, slot.classes)
        }
      })

      const uniqueClasses = Array.from(classMap.values())

      uniqueClasses.sort((a, b) => {
        const gradeA = a.grade || (a.code.startsWith('12') ? 12 : a.code.startsWith('11') ? 11 : 10)
        const gradeB = b.grade || (b.code.startsWith('12') ? 12 : b.code.startsWith('11') ? 11 : 10)
        if (gradeB !== gradeA) return gradeB - gradeA
        if (a.code !== b.code) return a.code.localeCompare(b.code)
        return a.subject.localeCompare(b.subject)
      })

      setClasses(uniqueClasses)

      if (uniqueClasses.length > 0) {
        if (!selectedClassId || !uniqueClasses.some((c) => c.id === selectedClassId)) {
          setSelectedClassId(uniqueClasses[0].id)
        }
      }
    }

    // 3. Tải Overrides
    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    setLoading(false)
  }

  // TẢI VÀ ĐỐI CHIẾU NỘI DUNG BÀI DẠY VỚI RÀNG BUỘC MÔN HỌC
  const loadCurriculum = async (classId: string) => {
    const currentClass = classes.find((c) => c.id === classId)
    if (!currentClass) return

    const currentCat = normalizeSubjectCategory(currentClass.subject)

    // Ưu tiên 1: Lấy theo template_id đã gán nếu template đó đúng môn
    if (currentClass.template_id) {
      const assignedTpl = templates.find((t) => t.id === currentClass.template_id)
      if (assignedTpl && normalizeSubjectCategory(assignedTpl.subject) === currentCat) {
        const { data: tLessons } = await supabase
          .from('curriculum_items')
          .select('id, template_id, lesson_order, lesson_name')
          .eq('template_id', currentClass.template_id)
          .order('lesson_order', { ascending: true })

        if (tLessons && tLessons.length > 0) {
          setCurriculum(tLessons)
          return
        }
      }
    }

    // Ưu tiên 2: Tìm bài học trực tiếp theo class_id
    const { data: directItems } = await supabase
      .from('curriculum_items')
      .select('id, class_id, lesson_order, lesson_name')
      .eq('class_id', classId)
      .order('lesson_order', { ascending: true })

    // Kiểm tra tính hợp lệ về nội dung để tránh gán nhầm môn
    let isContentConflict = false
    if (directItems && directItems.length > 0) {
      const sampleText = directItems.slice(0, 3).map((d) => d.lesson_name.toLowerCase()).join(' ')
      if (currentCat === 'TOAN' && (sampleText.includes('tọa đàm') || sampleText.includes('hồ chí minh') || sampleText.includes('phú thọ'))) {
        isContentConflict = true
      }
      if (currentCat === 'TRN' && (sampleText.includes('đạo hàm') || sampleText.includes('vecto') || sampleText.includes('phú thọ'))) {
        isContentConflict = true
      }
      if (currentCat === 'GDDP' && (sampleText.includes('đạo hàm') || sampleText.includes('tọa đàm') || sampleText.includes('vecto'))) {
        isContentConflict = true
      }
    }

    if (directItems && directItems.length > 0 && !isContentConflict) {
      setCurriculum(directItems)
      return
    }

    // Ưu tiên 3: Tự động ghép Khung mẫu chuẩn theo Khối và Môn tương ứng
    let grade = currentClass.grade
    if (!grade) {
      if (currentClass.code.startsWith('12')) grade = 12
      else if (currentClass.code.startsWith('11')) grade = 11
      else if (currentClass.code.startsWith('10')) grade = 10
    }

    const matchedTemplate = templates.find((t) => {
      const tCat = normalizeSubjectCategory(t.subject)
      return tCat === currentCat && (!grade || t.grade === grade)
    })

    if (matchedTemplate) {
      const { data: fallbackLessons } = await supabase
        .from('curriculum_items')
        .select('id, template_id, lesson_order, lesson_name')
        .eq('template_id', matchedTemplate.id)
        .order('lesson_order', { ascending: true })

      if (fallbackLessons && fallbackLessons.length > 0) {
        setCurriculum(fallbackLessons)
        return
      }
    }

    setCurriculum([])
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedClassId && classes.length > 0) {
      loadCurriculum(selectedClassId)
    } else {
      setCurriculum([])
    }
  }, [selectedClassId, classes, templates])

  // CHỌN LẠI KHUNG PPCT CHUẨN ĐỂ SỬA NHẦM LẪN
  const handleChangeTemplateForCurrentClass = async (tplId: string) => {
    if (!selectedClassId) return
    setLoading(true)

    // Cập nhật template_id cho lớp
    await supabase
      .from('classes')
      .update({ template_id: tplId || null })
      .eq('id', selectedClassId)

    // Xóa bài dạy cũ bị gán nhầm môn trong curriculum_items
    await supabase.from('curriculum_items').delete().eq('class_id', selectedClassId)

    // Nạp lại bài từ template mới đã chọn
    if (tplId) {
      const { data: tLessons } = await supabase
        .from('curriculum_items')
        .select('lesson_order, lesson_name')
        .eq('template_id', tplId)

      if (tLessons && tLessons.length > 0) {
        const items = tLessons.map((l) => ({
          class_id: selectedClassId,
          lesson_order: l.lesson_order,
          lesson_name: l.lesson_name,
        }))
        await supabase.from('curriculum_items').insert(items)
      }
    }

    await loadData()
    setLoading(false)
  }

  // TÍNH TIẾN ĐỘ THỜI GIAN THỰC
  const calculateRealTimeProgress = () => {
    const taughtLessons = new Set<number>()
    const upcomingLessons = new Set<number>()

    if (!selectedClassId) return { taughtLessons, upcomingLessons }

    const classSlots = schedule
      .filter((s) => s.class_id === selectedClassId)
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
        return a.period_number - b.period_number
      })

    const periodsPerWeek = classSlots.length
    if (periodsPerWeek === 0) return { taughtLessons, upcomingLessons }

    const availableLessonOrders = curriculum.map((c) => c.lesson_order).sort((a, b) => a - b)
    const now = new Date()

    for (let w = 1; w <= currentWeek; w++) {
      for (let sIdx = 0; sIdx < periodsPerWeek; sIdx++) {
        const slot = classSlots[sIdx]
        const ovr = overrides.find(
          (o) => o.class_id === selectedClassId && o.week_number === w && o.slot_order_in_week === sIdx
        )

        let assignedOrder: number
        if (ovr) {
          assignedOrder = ovr.override_lesson_order
        } else {
          if (availableLessonOrders.length > 0) {
            const nextAvail = availableLessonOrders.find((ord) => !taughtLessons.has(ord) && !upcomingLessons.has(ord))
            assignedOrder = nextAvail ?? (availableLessonOrders.length + 1)
          } else {
            assignedOrder = (w - 1) * periodsPerWeek + (sIdx + 1)
          }
        }

        const dayOffset = slot.day_of_week - 2
        const slotDate = new Date(START_DATE_WEEK_1)
        slotDate.setDate(slotDate.getDate() + (w - 1) * 7 + dayOffset)
        const periodTime = PERIOD_START_HOURS[slot.period_number] || { h: 7, m: 15 }
        slotDate.setHours(periodTime.h, periodTime.m, 0, 0)

        if (slotDate < now) {
          taughtLessons.add(assignedOrder)
        } else if (w === currentWeek) {
          upcomingLessons.add(assignedOrder)
        }
      }
    }

    return { taughtLessons, upcomingLessons }
  }

  const { taughtLessons, upcomingLessons } = calculateRealTimeProgress()
  const selectedClass = classes.find((c) => c.id === selectedClassId)

  // Danh sách khung mẫu đúng theo môn học của lớp đang chọn
  const matchingTemplates = templates.filter((t) => {
    if (!selectedClass) return true
    return normalizeSubjectCategory(t.subject) === normalizeSubjectCategory(selectedClass.subject)
  })

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản Lý Lớp Học</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Phân định độc lập từng môn học: <strong>12SỬ môn Toán (T)</strong> và <strong>12SỬ môn Trải nghiệm (TrN)</strong>
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1 px-3.5 py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* CỘT TRÁI (4 CỘT): DANH SÁCH LỚP TỪ TKB */}
        <div className="md:col-span-4 bg-white rounded-2xl border shadow-sm p-3.5 space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Lớp Trong TKB ({classes.length} lớp)
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">Song ánh TKB</span>
          </div>

          <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            {classes.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Chưa có lớp nào trong TKB.
              </div>
            ) : (
              classes.map((cls) => {
                const isSelected = selectedClassId === cls.id
                const slotsCount = schedule.filter((s) => s.class_id === cls.id).length
                const isMath = normalizeSubjectCategory(cls.subject) === 'TOAN'
                const isTrN = normalizeSubjectCategory(cls.subject) === 'TRN'

                return (
                  <div
                    key={cls.id}
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`px-3 py-2.5 rounded-xl border-2 transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 shadow-xs ring-1 ring-emerald-500/30'
                        : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-black text-sm ${isSelected ? 'text-emerald-950' : 'text-slate-900'}`}>
                        {cls.code}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          isMath
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : isTrN
                            ? 'bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {cls.subject}
                      </span>
                    </div>

                    <span className="text-[11px] font-semibold text-slate-400">
                      {slotsCount} tiết/tuần
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* CỘT PHẢI (8 CỘT): TIẾN ĐỘ THỜI GIAN THỰC & SỬA MÔN NHANH */}
        <div className="md:col-span-8 bg-white rounded-2xl border shadow-sm p-4 space-y-3">
          {selectedClass ? (
            <>
              {/* THANH CHỌN KHUNG BÀI DẠY VÀ XEM TUẦN */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-3 rounded-xl border gap-2.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-black text-slate-900 text-sm block leading-tight">
                      Lớp {selectedClass.code} — Môn {selectedClass.subject}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Khung bài dạy:</span>
                      <select
                        value={selectedClass.template_id || ''}
                        onChange={(e) => handleChangeTemplateForCurrentClass(e.target.value)}
                        className="text-[11px] font-black text-emerald-900 bg-white border border-emerald-400 rounded-lg px-2 py-0.5 focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                      >
                        <option value="">-- Bấm chọn Khung PPCT chuẩn cho môn này --</option>
                        {matchingTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} ({t.total_lessons} tiết)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border rounded-xl text-xs shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-bold text-slate-500">Xem Tuần:</span>
                    <select
                      value={currentWeek}
                      onChange={(e) => setCurrentWeek(Number(e.target.value))}
                      className="font-black text-emerald-700 bg-transparent focus:outline-none cursor-pointer"
                    >
                      {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                        <option key={w} value={w}>
                          Tuần {w < 10 ? '0' + w : w} {w === getCurrentRealWeek() ? '(Hiện tại)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-xs font-black text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
                    {curriculum.length} tiết PPCT
                  </span>
                </div>
              </div>

              {/* BẢNG BÀI DẠY */}
              <div className="border rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b sticky top-0 uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5 border-r text-center w-16">Tiết</th>
                      <th className="p-2.5 border-r">Tên bài học theo PPCT</th>
                      <th className="p-2.5 text-center w-36">Tiến độ thực tế</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {curriculum.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-10 text-center text-slate-400">
                          Chưa có bài dạy cho lớp này. Hãy bấm chọn khung ở ô <strong>"Khung bài dạy"</strong> phía trên để nạp đúng bài học môn {selectedClass.subject}.
                        </td>
                      </tr>
                    ) : (
                      curriculum.map((item) => {
                        const isTaught = taughtLessons.has(item.lesson_order)
                        const isUpcoming = upcomingLessons.has(item.lesson_order)

                        return (
                          <tr
                            key={item.id || item.lesson_order}
                            className={`transition ${
                              isTaught
                                ? 'bg-emerald-50/40 text-slate-600'
                                : isUpcoming
                                ? 'bg-blue-50/70 font-semibold'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-2.5 border-r text-center font-black text-blue-700 bg-slate-50/40 w-16">
                              {item.lesson_order}
                            </td>
                            <td className="p-2.5 border-r leading-snug">
                              <span className={isTaught ? 'text-slate-700 font-medium' : isUpcoming ? 'text-blue-900 font-bold' : 'text-slate-900 font-bold'}>
                                {item.lesson_name}
                              </span>
                            </td>

                            <td className="p-2.5 text-center whitespace-nowrap">
                              {isTaught ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  Đã dạy
                                </span>
                              ) : isUpcoming ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-xs animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  Sắp dạy (Tuần {currentWeek})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Chưa dạy
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-16 text-center text-slate-400 text-sm">
              Chọn 1 lớp ở danh sách bên trái để xem phân phối chương trình.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}