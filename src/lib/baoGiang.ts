// Logic dùng chung cho "Lịch Báo Giảng Tuần" và "Tiến độ thực hiện CT".
// Hai trang trước đây mỗi trang tự tính một kiểu nên số tiết có thể lệch nhau
// (tuần trống chép tuần 1 / tuần trước, cách đánh số sau khi cắt tiết, chọn khung PPCT...).
// Giờ cả hai cùng gọi các hàm dưới đây nên luôn ra cùng một kết quả.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const START_DATE_WEEK_1 = new Date(2026, 8, 7, 0, 0, 0) // 07/09/2026
export const MAX_WEEK = 35

export const DAYS = [
  { id: 2, name: 'Thứ Hai', offset: 0 },
  { id: 3, name: 'Thứ Ba', offset: 1 },
  { id: 4, name: 'Thứ Tư', offset: 2 },
  { id: 5, name: 'Thứ Năm', offset: 3 },
  { id: 6, name: 'Thứ Sáu', offset: 4 },
  { id: 7, name: 'Thứ Bảy', offset: 5 },
]
export type Day = (typeof DAYS)[number]

export const formatPeriodLabel = (periodVal: any) => {
  if (periodVal === undefined || periodVal === null) return '1'
  const str = String(periodVal).trim()
  if (str.toUpperCase().startsWith('C-') || str.toUpperCase().startsWith('S-')) {
    return str.toUpperCase()
  }
  const num = Number(str)
  if (!isNaN(num) && num > 5) {
    return `C-${num - 5}`
  }
  return str
}

// Một tiết của một lớp trên "dòng thời gian" (tuần 1 -> 35), kèm số tiết CT đang được gán
export interface TimelineSlot {
  week: number
  idx: number // thứ tự tiết của lớp này trong tuần (khóa lưu vào lesson_overrides)
  day: number
  period: any
  assigned: number // số tiết CT đang hiển thị cho tiết này
  ovrValue: number | null // giá trị lưu trong lesson_overrides (nếu có)
  ovrType: string | null // 'cut' | 'swap' | 'anchor' | null
}

export interface LessonInfo {
  order: number
  name: string
  isOverridden: boolean
  ovrType: string | null
  slotIdx: number
  hasTemplate: boolean
  timelineIndex: number
}

export interface LessonPlan {
  weekSlotsMap: Map<number, any[]>
  timelines: Map<string, TimelineSlot[]>
  /** khóa `${tuần}_${thứ}_${tiết}_${classId}` cho mọi tuần 1..35 */
  lessonMapping: Map<string, LessonInfo>
}

/** TKB từng tuần 1..35. Tuần chưa có dữ liệu lấy theo tuần liền trước (giống trang Thời khóa biểu). */
export function buildWeekSlots(schedule: any[]): Map<number, any[]> {
  const byWeek = new Map<number, any[]>()
  for (const s of schedule) {
    if (s.is_substitute) continue
    const w = Number(s.week_number || 1)
    if (!byWeek.has(w)) byWeek.set(w, [])
    byWeek.get(w)!.push(s)
  }
  const weekSlotsMap = new Map<number, any[]>()
  let prevSlots: any[] = []
  for (let w = 1; w <= MAX_WEEK; w++) {
    let wSlots = byWeek.get(w) || []
    if (wSlots.length === 0 && prevSlots.length > 0) {
      wSlots = prevSlots.map((slot) => ({ ...slot, week_number: w }))
    }
    wSlots = [...wSlots].sort((a, b) => {
      const d1 = Number(a.day_of_week || 2)
      const d2 = Number(b.day_of_week || 2)
      if (d1 !== d2) return d1 - d2
      return Number(a.period_number || 1) - Number(b.period_number || 1)
    })
    weekSlotsMap.set(w, wSlots)
    prevSlots = wSlots
  }
  return weekSlotsMap
}

/** Gán số tiết PPCT cho từng tiết TKB của mọi lớp, tuần 1..35 (có tính cắt / đảo tiết). */
export function buildLessonPlan(
  schedule: any[],
  classes: any[],
  classCurriculums: any[],
  curriculumItems: any[],
  overrides: any[],
): LessonPlan {
  const timelines = new Map<string, TimelineSlot[]>()
  const lessonMapping = new Map<string, LessonInfo>()
  if (schedule.length === 0 || classes.length === 0) {
    return { weekSlotsMap: new Map(), timelines, lessonMapping }
  }

  const weekSlotsMap = buildWeekSlots(schedule)

  // Tiết của từng lớp, giữ đúng thứ tự tuần -> thứ -> tiết
  const classSlotsMap = new Map<string, any[]>()
  weekSlotsMap.forEach((wSlots) => {
    wSlots.forEach((slot) => {
      const clsId = slot.class_id
      if (clsId) {
        if (!classSlotsMap.has(clsId)) classSlotsMap.set(clsId, [])
        classSlotsMap.get(clsId)!.push(slot)
      }
    })
  })

  // Tra cứu nhanh (giữ bản ghi đầu tiên nếu trùng, như .find() trước đây)
  const classById = new Map<string, any>()
  classes.forEach((c) => { if (!classById.has(c.id)) classById.set(c.id, c) })
  const itemsByTpl = new Map<string, any[]>()
  curriculumItems.forEach((i) => {
    const k = String(i.template_id)
    if (!itemsByTpl.has(k)) itemsByTpl.set(k, [])
    itemsByTpl.get(k)!.push(i)
  })
  const ovrByKey = new Map<string, any>()
  overrides.forEach((o) => {
    const k = `${o.class_id}_${Number(o.week_number)}_${Number(o.slot_order_in_week)}`
    if (!ovrByKey.has(k)) ovrByKey.set(k, o)
  })

  classSlotsMap.forEach((slots, classId) => {
    // Chọn khung PPCT: ưu tiên bản gán trỏ vào khung còn bài (bỏ qua bản gán cũ trỏ vào khung đã xóa)
    let templateId: string | null = null
    const relations = classCurriculums.filter((cc) => cc.class_id === classId)
    const matchedRel = relations.find((cc) => itemsByTpl.has(String(cc.template_id))) || relations[0]
    if (matchedRel) {
      templateId = String(matchedRel.template_id)
    } else {
      const cls = classById.get(classId)
      if (cls?.template_id) templateId = String(cls.template_id)
    }

    const lessons = templateId ? [...(itemsByTpl.get(templateId) || [])] : []
    const hasTemplate = !!templateId && lessons.length > 0
    lessons.sort((a, b) => Number(a.lesson_order || 1) - Number(b.lesson_order || 1))
    const lessonByOrder = new Map<number, any>()
    lessons.forEach((l) => { const o = Number(l.lesson_order); if (!lessonByOrder.has(o)) lessonByOrder.set(o, l) })

    const slotsByWeek = new Map<number, any[]>()
    slots.forEach((slot) => {
      const wNum = Number(slot.week_number || 1)
      if (!slotsByWeek.has(wNum)) slotsByWeek.set(wNum, [])
      slotsByWeek.get(wNum)!.push(slot)
    })

    const timeline: TimelineSlot[] = []
    let globalPointer = 1

    for (let w = 1; w <= MAX_WEEK; w++) {
      const wSlots = slotsByWeek.get(w) || []
      wSlots.forEach((slot, weekSlotIdx) => {
        const day = Number(slot.day_of_week || 2)
        const period = slot.period_number

        const ovr = hasTemplate ? ovrByKey.get(`${classId}_${w}_${weekSlotIdx}`) : undefined

        let assignedOrder = globalPointer
        let ovrValue: number | null = null
        let ovrType: string | null = null

        if (ovr && ovr.override_lesson_order) {
          assignedOrder = Number(ovr.override_lesson_order)
          ovrValue = assignedOrder
          ovrType = ovr.override_type || 'cut'
        }

        timeline.push({ week: w, idx: weekSlotIdx, day, period, assigned: assignedOrder, ovrValue, ovrType })

        const foundLesson = lessonByOrder.get(assignedOrder) || lessons[assignedOrder - 1]
        lessonMapping.set(`${w}_${day}_${period}_${classId}`, {
          order: !hasTemplate ? 0 : assignedOrder,
          name: !hasTemplate ? '' : (foundLesson ? foundLesson.lesson_name : `Tiết học số ${assignedOrder}`),
          // 'anchor' là mốc nối kỹ thuật sau khi đảo tiết, không hiện nhãn "Cắt tiết"
          isOverridden: ovrType !== null && ovrType !== 'anchor',
          ovrType,
          slotIdx: weekSlotIdx,
          hasTemplate,
          timelineIndex: timeline.length - 1,
        })

        globalPointer = assignedOrder + 1
      })
    }

    timelines.set(classId, timeline)
  })

  return { weekSlotsMap, timelines, lessonMapping }
}

/** Các dòng của 1 tuần cho bảng báo giảng (mỗi ngày một nhóm). */
export function buildWeekRows(week: number, plan: LessonPlan, classes: any[]): { day: Day; slots: any[] }[] {
  const weekRows: { day: Day; slots: any[] }[] = []
  if (plan.weekSlotsMap.size === 0) return weekRows
  const classById = new Map<string, any>()
  classes.forEach((c) => { if (!classById.has(c.id)) classById.set(c.id, c) })
  const currentWeekSlots = plan.weekSlotsMap.get(Number(week)) || []

  DAYS.forEach((day) => {
    const dayMatchedSlots = currentWeekSlots.filter((s) => Number(s.day_of_week) === day.id)
    dayMatchedSlots.sort((a, b) => {
      const p1 = String(a.period_number || '1')
      const p2 = String(b.period_number || '1')
      return p1.localeCompare(p2, undefined, { numeric: true })
    })

    const daySlots: any[] = []

    if (dayMatchedSlots.length > 0) {
      dayMatchedSlots.forEach((matchedSlot) => {
        if (matchedSlot && matchedSlot.class_id) {
          const p = matchedSlot.period_number
          const cls = classById.get(matchedSlot.class_id)
          const classCode = cls ? cls.code : (matchedSlot.sub_class_code || 'Lớp')
          const subjectName = cls ? cls.subject : (matchedSlot.sub_subject || 'Toán')

          const mapKey = `${Number(week)}_${day.id}_${p}_${matchedSlot.class_id}`
          const lessonInfo = plan.lessonMapping.get(mapKey) || {
            order: 1, name: '', isOverridden: false, ovrType: null, slotIdx: 0, hasTemplate: false, timelineIndex: -1,
          }

          daySlots.push({
            isEmpty: false,
            entry: matchedSlot,
            day: day.id,
            period: formatPeriodLabel(p),
            periodNumber: Number(p),
            realClassId: matchedSlot.class_id,
            subjectClass: `${subjectName} - ${classCode}`,
            lessonOrder: lessonInfo.order,
            lessonName: lessonInfo.name,
            isSubstitute: matchedSlot.is_substitute || false,
            isOverridden: lessonInfo.isOverridden,
            noteLabel: lessonInfo.ovrType === 'swap' ? 'Đảo tiết' : (lessonInfo.isOverridden ? 'Cắt tiết' : ''),
            slotOrderInWeek: lessonInfo.slotIdx,
            timelineIndex: lessonInfo.timelineIndex,
            hasTemplate: lessonInfo.hasTemplate,
          })
        }
      })
    } else {
      for (let i = 1; i <= 4; i++) {
        daySlots.push({
          isEmpty: true,
          day: day.id,
          period: String(i),
          subjectClass: '',
          lessonOrder: '',
          lessonName: '',
          noteLabel: '',
          hasTemplate: true,
        })
      }
    }

    if (daySlots.length > 0) {
      weekRows.push({ day, slots: daySlots })
    }
  })

  return weekRows
}

/** Lấy hết các dòng của một bảng (Supabase trả tối đa 1000 dòng mỗi lần). */
export async function fetchAllRows(supabase: { from: (t: string) => any }, table: string): Promise<any[]> {
  const pageSize = 1000
  let from = 0
  const all: any[] = []
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
