'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Clock, Calendar, RefreshCw, Layers, BookOpen, AlertCircle } from 'lucide-react'

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
  week_number?: number
  is_substitute?: boolean
  classes?: ClassItem
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
  total_lessons?: number
}

interface LessonOverride {
  id: string
  class_id: string
  week_number: number
  slot_order_in_week: number
  override_lesson_order: number
}

// MỐC KHAI GIẢNG THỰC TẾ: TUẦN 1 BẮT ĐẦU TỪ 07/09/2026
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

const getSubjectType = (raw?: string): 'TOAN' | 'TRN' | 'GDDP' | 'OTHER' => {
  if (!raw) return 'OTHER'
  const s = raw.trim().toLowerCase()
  if (s === 't' || s.includes('toán')) return 'TOAN'
  if (s === 'trn' || s.includes('hđtn') || s.includes('trải nghiệm')) return 'TRN'
  if (s === 'gdđp' || s.includes('địa phương')) return 'GDDP'
  return 'OTHER'
}

const extractGradeFromCode = (code?: string, defaultGrade?: number): number => {
  if (defaultGrade && defaultGrade >= 10 && defaultGrade <= 12) return defaultGrade
  if (!code) return 12
  if (code.startsWith('12')) return 12
  if (code.startsWith('11')) return 11
  if (code.startsWith('10')) return 10
  return 12
}

const DAY_NAMES: Record<number, string> = {
  2: 'Thứ Hai',
  3: 'Thứ Ba',
  4: 'Thứ Tư',
  5: 'Thứ Năm',
  6: 'Thứ Sáu',
  7: 'Thứ Bảy',
}

export default function ProgressPage() {
  const supabase = createClient()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [overrides, setOverrides] = useState<LessonOverride[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const currentRealWeek = getCurrentRealWeek()

  const loadData = async () => {
    setLoading(true)

    // 1. Tải Templates
    const { data: tData } = await supabase.from('curriculum_templates').select('*')
    if (tData) setTemplates(tData)

    // 2. Chỉ lấy đúng các lớp có mặt trong Thời khóa biểu (Song ánh 1-1)
    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('id, day_of_week, period_number, class_id, week_number, is_substitute, classes(*)')
      .eq('is_substitute', false)
      .eq('week_number', 0)

    if (sData) {
      setSchedule(sData as any)

      // Lọc danh sách lớp duy nhất từ TKB thực tế
      const classMap = new Map<string, ClassItem>()
      sData.forEach((slot: any) => {
        if (slot.classes && slot.classes.id) {
          // Bỏ qua các môn lạ không có trong TKB nếu có
          const subType = getSubjectType(slot.classes.subject)
          if (subType !== 'OTHER') {
            classMap.set(slot.classes.id, slot.classes)
          }
        }
      })

      const uniqueClasses = Array.from(classMap.values())

      // Sắp xếp lớp chuẩn khoa học: Khối 12 -> 11 -> 10, rồi đến môn học
      uniqueClasses.sort((a, b) => {
        const gradeA = extractGradeFromCode(a.code, a.grade)
        const gradeB = extractGradeFromCode(b.code, b.grade)
        if (gradeB !== gradeA) return gradeB - gradeA
        if (a.code !== b.code) return a.code.localeCompare(b.code)
        return a.subject.localeCompare(b.subject)
      })

      setClasses(uniqueClasses)

      if (uniqueClasses.length > 0) {
        if (!selectedClassId || !uniqueClasses.some((c) => c.id === selectedClassId)) {
          setSelectedClassId(uniqueClasses[0].id)
        }
      } else {
        setSelectedClassId(null)
      }
    }

    // 3. Tải Curriculum Items
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

    // 4. Tải Overrides
    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const selectedClass = classes.find((c) => c.id === selectedClassId)

  // TÍNH TIẾN TRÌNH THỰC TẾ CHI TIẾT TỪNG TIẾT CHO LỚP ĐANG CHỌN
  const calculateClassProgressTimeline = () => {
    if (!selectedClass) return { timeline: [], taughtCount: 0, totalCount: 0 }

    const subType = getSubjectType(selectedClass.subject)
    const grade = extractGradeFromCode(selectedClass.code, selectedClass.grade)

    // Lọc các ô TKB của lớp này
    const classSlots = schedule
      .filter((s) => s.class_id === selectedClass.id)
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
        return a.period_number - b.period_number
      })

    const periodsPerWeek = classSlots.length
    if (periodsPerWeek === 0) return { timeline: [], taughtCount: 0, totalCount: 0 }

    // 1. Tìm đúng danh sách bài dạy của môn này
    let validLessons: CurriculumItem[] = []

    // Ưu tiên template_id đã gán
    if (selectedClass.template_id) {
      const tpl = templates.find((t) => t.id === selectedClass.template_id)
      if (tpl && getSubjectType(tpl.subject) === subType) {
        validLessons = curriculum.filter((c) => c.template_id === selectedClass.template_id)
      }
    }

    // Nếu chưa có, tìm template khớp môn và khối
    if (validLessons.length === 0) {
      const matchedTpl = templates.find(
        (t) => getSubjectType(t.subject) === subType && t.grade === grade
      )
      if (matchedTpl) {
        validLessons = curriculum.filter((c) => c.template_id === matchedTpl.id)
      }
    }

    // Nếu vẫn chưa có, tìm theo class_id với bộ lọc chống lẫn bài
    if (validLessons.length === 0) {
      const direct = curriculum.filter((c) => c.class_id === selectedClass.id)
      const isClean = direct.every((d) => {
        const txt = d.lesson_name.toLowerCase()
        if (subType === 'TOAN') return !txt.includes('tọa đàm') && !txt.includes('phú thọ')
        if (subType === 'TRN') return !txt.includes('đạo hàm') && !txt.includes('vecto')
        if (subType === 'GDDP') return !txt.includes('đạo hàm') && !txt.includes('tọa đàm')
        return true
      })
      if (isClean && direct.length > 0) {
        validLessons = direct
      }
    }

    validLessons.sort((a, b) => a.lesson_order - b.lesson_order)
    const totalCount = validLessons.length

    const now = new Date()
    const timeline: any[] = []
    let taughtCount = 0

    // Xây dựng tiến trình giảng dạy qua từng tuần
    const totalWeeksToScan = 35
    const allocatedLessons = new Set<number>()

    for (let w = 1; w <= totalWeeksToScan; w++) {
      for (let sIdx = 0; sIdx < periodsPerWeek; sIdx++) {
        const slot = classSlots[sIdx]

        // Tìm bài dạy
        const ovr = overrides.find(
          (o) => o.class_id === selectedClass.id && o.week_number === w && o.slot_order_in_week === sIdx
        )

        let assignedOrder: number
        if (ovr) {
          assignedOrder = ovr.override_lesson_order
        } else {
          if (validLessons.length > 0) {
            const nextAvail = validLessons.find((l) => !allocatedLessons.has(l.lesson_order))
            assignedOrder = nextAvail ? nextAvail.lesson_order : allocatedLessons.size + 1
          } else {
            assignedOrder = (w - 1) * periodsPerWeek + (sIdx + 1)
          }
        }

        allocatedLessons.add(assignedOrder)

        // Tính ngày giờ thực tế của tiết này
        const dayOffset = slot.day_of_week - 2
        const slotDate = new Date(START_DATE_WEEK_1)
        slotDate.setDate(slotDate.getDate() + (w - 1) * 7 + dayOffset)
        const periodTime = PERIOD_START_HOURS[slot.period_number] || { h: 7, m: 15 }
        slotDate.setHours(periodTime.h, periodTime.m, 0, 0)

        const dateStr = `${String(slotDate.getDate()).padStart(2, '0')}/${String(slotDate.getMonth() + 1).padStart(2, '0')}/${slotDate.getFullYear()}`

        // Trạng thái theo thời gian thực
        let status: 'taught' | 'upcoming' | 'future' = 'future'
        if (slotDate < now) {
          status = 'taught'
          taughtCount++
        } else if (w === currentRealWeek) {
          status = 'upcoming'
        }

        const foundLesson = validLessons.find((l) => l.lesson_order === assignedOrder)

        timeline.push({
          week: w,
          dateStr,
          dayName: DAY_NAMES[slot.day_of_week] || `Thứ ${slot.day_of_week}`,
          period: slot.period_number,
          lessonOrder: assignedOrder,
          lessonName: foundLesson ? foundLesson.lesson_name : `Bài theo PPCT tiết ${assignedOrder}`,
          status,
        })
      }
    }

    return { timeline, taughtCount, totalCount }
  }

  const { timeline, taughtCount, totalCount } = calculateClassProgressTimeline()
  const completionRate = totalCount > 0 ? Math.round((taughtCount / totalCount) * 100) : 0

  // Gom nhóm lớp theo Môn học
  const mathClasses = classes.filter((c) => getSubjectType(c.subject) === 'TOAN')
  const trnClasses = classes.filter((c) => getSubjectType(c.subject) === 'TRN')
  const gddpClasses = classes.filter((c) => getSubjectType(c.subject) === 'GDDP')

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tiến Độ Thực Hiện Chương Trình</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi tiến trình giảng dạy theo thời gian thực — Khai giảng: <strong>07/09/2026</strong> (Hiện tại: <strong>Tuần {currentRealWeek}</strong>)
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

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* CỘT TRÁI (4 CỘT): DANH SÁCH LỚP PHÂN THEO MÔN CHUẨN XÁC TỪ TKB */}
        <div className="md:col-span-4 bg-white rounded-2xl border shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2 border-b pb-2.5">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Danh Sách Lớp Giảng Dạy ({classes.length} lớp)
            </span>
          </div>

          <div className="space-y-4 max-h-[580px] overflow-y-auto pr-1 text-xs">
            {/* NHÓM MÔN TOÁN */}
            {mathClasses.length > 0 && (
              <div>
                <span className="font-bold text-amber-900 block mb-1.5 uppercase text-[10px] tracking-wider">
                  Môn Toán ({mathClasses.length} lớp)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {mathClasses.map((cls) => {
                    const isSelected = selectedClassId === cls.id
                    return (
                      <div
                        key={cls.id}
                        onClick={() => setSelectedClassId(cls.id)}
                        className={`p-2.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/90 shadow-xs ring-1 ring-amber-500/40'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900">{cls.code}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded">
                            {cls.subject}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1">
                          {schedule.filter((s) => s.class_id === cls.id).length} tiết/tuần
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* NHÓM MÔN TRẢI NGHIỆM */}
            {trnClasses.length > 0 && (
              <div>
                <span className="font-bold text-fuchsia-900 block mb-1.5 uppercase text-[10px] tracking-wider">
                  Môn Hoạt Động Trải Nghiệm ({trnClasses.length} lớp)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {trnClasses.map((cls) => {
                    const isSelected = selectedClassId === cls.id
                    return (
                      <div
                        key={cls.id}
                        onClick={() => setSelectedClassId(cls.id)}
                        className={`p-2.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-fuchsia-500 bg-fuchsia-50/90 shadow-xs ring-1 ring-fuchsia-500/40'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900">{cls.code}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-fuchsia-200 text-fuchsia-900 rounded">
                            {cls.subject}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1">
                          {schedule.filter((s) => s.class_id === cls.id).length} tiết/tuần
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* NHÓM MÔN GIÁO DỤC ĐỊA PHƯƠNG */}
            {gddpClasses.length > 0 && (
              <div>
                <span className="font-bold text-emerald-900 block mb-1.5 uppercase text-[10px] tracking-wider">
                  Môn Giáo Dục Địa Phương ({gddpClasses.length} lớp)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {gddpClasses.map((cls) => {
                    const isSelected = selectedClassId === cls.id
                    return (
                      <div
                        key={cls.id}
                        onClick={() => setSelectedClassId(cls.id)}
                        className={`p-2.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/90 shadow-xs ring-1 ring-emerald-500/40'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900">{cls.code}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded">
                            {cls.subject}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1">
                          {schedule.filter((s) => s.class_id === cls.id).length} tiết/tuần
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI (8 CỘT): TIẾN ĐỘ THỰC TẾ CHI TIẾT */}
        <div className="md:col-span-8 bg-white rounded-2xl border shadow-sm p-4 space-y-4">
          {selectedClass ? (
            <>
              {/* Header thống kê tiến độ */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-3.5 rounded-2xl border gap-3">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-black text-slate-900 text-sm block leading-tight">
                      Lớp {selectedClass.code} — Môn {selectedClass.subject}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Đang xếp: {schedule.filter((s) => s.class_id === selectedClass.id).length} tiết/tuần trên TKB
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-slate-500 block">Tiến độ hoàn thành</span>
                    <span className="text-sm font-black text-emerald-700">
                      {taughtCount} / {totalCount > 0 ? totalCount : timeline.length} tiết
                    </span>
                  </div>

                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center font-black text-sm text-emerald-800 border-2 border-emerald-300">
                    {completionRate}%
                  </div>
                </div>
              </div>

              {/* Bảng chi tiết từng tiết theo thời gian thực */}
              <div className="border rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b sticky top-0 uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5 border-r text-center w-16">Tuần</th>
                      <th className="p-2.5 border-r text-center w-24">Ngày dạy</th>
                      <th className="p-2.5 border-r text-center w-24">Thứ / Tiết</th>
                      <th className="p-2.5 border-r text-center w-16">Tiết CT</th>
                      <th className="p-2.5 border-r">Tên bài dạy theo PPCT</th>
                      <th className="p-2.5 text-center w-28">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {timeline.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400">
                          <AlertCircle className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                          Lớp này chưa có tiết trong Thời khóa biểu hoặc chưa được gán Phân phối chương trình.
                        </td>
                      </tr>
                    ) : (
                      timeline.map((row, idx) => {
                        return (
                          <tr
                            key={idx}
                            className={`transition ${
                              row.status === 'taught'
                                ? 'bg-emerald-50/30 text-slate-600'
                                : row.status === 'upcoming'
                                ? 'bg-blue-50/70 font-semibold'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-2 border-r text-center font-bold text-slate-600">
                              Tuần {row.week < 10 ? '0' + row.week : row.week}
                            </td>

                            <td className="p-2 border-r text-center text-slate-700 font-semibold">
                              {row.dateStr}
                            </td>

                            <td className="p-2 border-r text-center font-medium">
                              {row.dayName} (T{row.period})
                            </td>

                            <td className="p-2 border-r text-center font-black text-blue-700 bg-slate-50/30">
                              {row.lessonOrder}
                            </td>

                            <td className="p-2 border-r leading-snug">
                              <span className={row.status === 'taught' ? 'text-slate-700' : row.status === 'upcoming' ? 'text-blue-950 font-bold' : 'text-slate-900 font-medium'}>
                                {row.lessonName}
                              </span>
                            </td>

                            <td className="p-2 text-center whitespace-nowrap">
                              {row.status === 'taught' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Đã dạy
                                </span>
                              ) : row.status === 'upcoming' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white shadow-2xs animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  Sắp dạy
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
              Chọn 1 lớp ở danh sách bên trái để theo dõi tiến độ chi tiết.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}