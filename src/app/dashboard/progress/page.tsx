'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  TrendingUp, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Layers,
  AlertCircle
} from 'lucide-react'

const START_DATE_WEEK_1 = new Date(2026, 8, 7, 0, 0, 0) // 07/09/2026

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

  const [classes, setClasses] = useState<any[]>([])
  const [selectedClassKey, setSelectedClassKey] = useState<string>('')
  const [schedule, setSchedule] = useState<any[]>([])
  const [curriculumItems, setCurriculumItems] = useState<any[]>([])
  const [classCurriculums, setClassCurriculums] = useState<any[]>([])
  const [overrides, setOverrides] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)

    const { data: cData } = await supabase.from('classes').select('*').order('code', { ascending: true })
    if (cData) setClasses(cData)

    const { data: sData } = await supabase.from('schedule_entries').select('*')
    if (sData) setSchedule(sData)

    const { data: ccData } = await supabase.from('class_curriculums').select('*')
    if (ccData) setClassCurriculums(ccData)

    const { data: itemsData } = await supabase.from('curriculum_items').select('*')
    if (itemsData) setCurriculumItems(itemsData)

    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    // Nếu chưa chọn lớp nào, tự động chọn lớp đầu tiên tìm thấy
    const availableList = getAvailableClassSubjects(cData || [], sData || [])
    if (availableList.length > 0 && !selectedClassKey) {
      setSelectedClassKey(availableList[0].key)
    }

    setLoading(false)
  }

  // Hàm tổng hợp danh sách lớp toàn diện từ mọi nguồn dữ liệu
  const getAvailableClassSubjects = (classList: any[], scheduleList: any[]) => {
    const map = new Map<string, { code: string; subject: string; label: string; key: string }>()
    
    // 1. Quét từ danh mục classes
    classList.forEach(c => {
      const code = (c.code || '').trim().toUpperCase()
      const subject = (c.subject || 'Toán').trim()
      if (code) {
        const key = `${code}_${subject}`
        if (!map.has(key)) {
          map.set(key, { code, subject, label: `${code} — ${subject}`, key })
        }
      }
    })

    // 2. Quét từ thời khóa biểu schedule_entries (cả sub_class_code và sub_subject)
    scheduleList.forEach(s => {
      const code = (s.sub_class_code || '').trim().toUpperCase()
      const subject = (s.sub_subject || 'Toán').trim()
      if (code) {
        const key = `${code}_${subject}`
        if (!map.has(key)) {
          map.set(key, { code, subject, label: `${code} — ${subject}`, key })
        }
      }
    })

    return Array.from(map.values())
  }

  useEffect(() => {
    loadData()
  }, [])

  const classSubjectsList = getAvailableClassSubjects(classes, schedule)

  // Thuật toán xây dựng timeline bám sát logic Báo Giảng chính xác tuyệt đối cho mọi lớp
  const buildProgressTimeline = () => {
    if (!selectedClassKey || schedule.length === 0) return []

    const [targetCode, targetSubject] = selectedClassKey.split('_')
    const week1Slots = schedule.filter((s) => Number(s.week_number || 1) === 1 && !s.is_substitute)

    const weeksList: {
      weekNum: number
      items: Array<{
        lessonOrder: number
        lessonName: string
        dayName: string
        periodStr: string
        dateStr: string
        status: 'dada' | 'sapday' | 'chuaday'
        isSkipped?: boolean
      }>
    }[] = []

    const now = new Date()

    for (let w = 1; w <= 35; w++) {
      let wSlots = schedule.filter((s) => Number(s.week_number || 1) === w && !s.is_substitute)
      if (wSlots.length === 0 && w > 1) {
        wSlots = week1Slots.map((slot) => ({ ...slot, week_number: w }))
      }
      wSlots.sort((a, b) => {
        const d1 = Number(a.day_of_week || 2)
        const d2 = Number(b.day_of_week || 2)
        if (d1 !== d2) return d1 - d2
        return Number(a.period_number || 1) - Number(b.period_number || 1)
      })

      const classSlotsMap = new Map<string, any[]>()
      wSlots.forEach((slot) => {
        const classCode = (slot.sub_class_code || '').trim().toUpperCase()
        const subject = (slot.sub_subject || 'Toán').trim()
        const key = `${classCode}_${subject}`
        if (!classSlotsMap.has(key)) classSlotsMap.set(key, [])
        classSlotsMap.get(key)!.push(slot)
      })

      const classKey = `${targetCode}_${targetSubject}`
      const targetSlotsForThisClass = classSlotsMap.get(classKey) || []
      if (targetSlotsForThisClass.length === 0) continue

      let templateId: string | null = null
      const matchedClassRel = classCurriculums.find(
        (cc) => cc.class_id === classKey || cc.class_id === targetSlotsForThisClass[0]?.class_id || cc.class_id === targetCode
      )
      if (matchedClassRel) {
        templateId = matchedClassRel.template_id || matchedClassRel.curriculum_id
      } else {
        const cls = classes.find((c) => (c.code || '').trim().toUpperCase() === targetCode && (c.subject || 'Toán').trim().toLowerCase() === targetSubject.toLowerCase())
        if (cls?.template_id) templateId = cls.template_id
      }

      let lessons: any[] = []
      if (templateId) {
        lessons = curriculumItems.filter((item) => item.template_id === templateId)
      }
      if (lessons.length === 0) {
        lessons = curriculumItems.filter((item) => item.class_id === targetSlotsForThisClass[0]?.class_id)
      }
      lessons.sort((a, b) => Number(a.lesson_order || 1) - Number(b.lesson_order || 1))

      // Dồn con trỏ bài học từ các tuần trước
      let globalLessonPointer = 0
      for (let prevW = 1; prevW < w; prevW++) {
        let prevWSlots = schedule.filter((s) => Number(s.week_number || 1) === prevW && !s.is_substitute)
        if (prevWSlots.length === 0 && prevW > 1) prevWSlots = week1Slots.map(s => ({ ...s, week_number: prevW }))
        
        const prevWClassMap = new Map<string, any[]>()
        prevWSlots.forEach(slot => {
          const cCode = (slot.sub_class_code || '').trim().toUpperCase()
          const sub = (slot.sub_subject || 'Toán').trim()
          const k = `${cCode}_${sub}`
          if (!prevWClassMap.has(k)) prevWClassMap.set(k, [])
          prevWClassMap.get(k)!.push(slot)
        })

        const slotsInPrevW = prevWClassMap.get(classKey) || []
        slotsInPrevW.forEach((slot, sIdx) => {
          const realCId = slot.class_id || classKey
          const ovr = overrides.find(
            (o) => (o.class_id === realCId || o.class_id === classKey) && Number(o.week_number) === prevW && Number(o.slot_order_in_week) === sIdx
          )
          const isSkipped = ovr ? (ovr as any).is_skipped === true : false
          if (!isSkipped) globalLessonPointer++
        })
      }

      const weekGroupItems: any[] = []
      targetSlotsForThisClass.forEach((slot, sIdx) => {
        const realCId = slot.class_id || classKey
        const ovr = overrides.find(
          (o) => (o.class_id === realCId || o.class_id === classKey) && Number(o.week_number) === w && Number(o.slot_order_in_week) === sIdx
        )

        const isSkipped = ovr ? (ovr as any).is_skipped === true : false
        let assignedOrder = globalLessonPointer + 1

        if (ovr && !isSkipped && (ovr as any).override_lesson_order) {
          assignedOrder = Number((ovr as any).override_lesson_order)
        }

        let foundLesson = null
        if (!isSkipped && lessons.length > 0) {
          foundLesson = lessons.find((l) => Number(l.lesson_order) === assignedOrder) || lessons[globalLessonPointer]
        }

        const finalOrder = isSkipped ? 0 : (foundLesson ? Number(foundLesson.lesson_order || assignedOrder) : assignedOrder)
        
        let lessonName = isSkipped ? '(Nghỉ / Bỏ qua tiết)' : (foundLesson ? foundLesson.lesson_name : null)
        if (!lessonName && !isSkipped) {
          lessonName = `Bài học theo phân phối chương trình (Tiết ${finalOrder})`
        }

        const dayOfWeek = Number(slot.day_of_week || 2)
        const d = new Date(START_DATE_WEEK_1)
        d.setDate(d.getDate() + (w - 1) * 7 + (dayOfWeek - 2))

        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        const dateStr = `${dd}/${mm}/${yyyy}`

        let status: 'dada' | 'sapday' | 'chuaday' = 'chuaday'
        const diffDays = (d.getTime() - now.getTime()) / (1000 * 3600 * 24)

        if (diffDays < -0.5) status = 'dada'
        else if (diffDays >= -0.5 && diffDays <= 7) status = 'sapday'
        else status = 'chuaday'

        weekGroupItems.push({
          lessonOrder: finalOrder,
          lessonName,
          dayName: DAY_NAMES[dayOfWeek] || `Thứ ${dayOfWeek}`,
          periodStr: `(T${slot.period_number})`,
          dateStr,
          status,
          isSkipped,
        })

        if (!isSkipped) globalLessonPointer++
      })

      if (weekGroupItems.length > 0) {
        weeksList.push({ weekNum: w, items: weekGroupItems })
      }
    }

    return weeksList
  }

  const timelineWeeks = buildProgressTimeline()

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-10">
      {/* HEADER GIAO DIỆN GỐC */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800">
            Tiến Độ Thực Hiện Chương Trình
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Lịch trình giảng dạy chi tiết theo từng tuần và ngày thực dạy
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border rounded-xl shadow-2xs">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-500 uppercase">LỚP:</span>
            <select
              value={selectedClassKey}
              onChange={(e) => setSelectedClassKey(e.target.value)}
              className="font-black text-emerald-700 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              {classSubjectsList.map((cs) => (
                <option key={cs.key} value={cs.key}>
                  {cs.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* BẢNG TIẾN ĐỘ */}
      <div className="bg-white rounded-2xl border shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b uppercase tracking-wider">
              <tr>
                <th className="p-3 border-r text-center w-24">Tuần</th>
                <th className="p-3 border-r text-center w-36">Thứ / Ngày</th>
                <th className="p-3 border-r text-center w-16">Tiết</th>
                <th className="p-3 border-r">Tên bài / Nội dung bài học</th>
                <th className="p-3 text-center w-28">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {timelineWeeks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    Lớp chưa có tiết dạy trên thời khóa biểu.
                  </td>
                </tr>
              ) : (
                timelineWeeks.map((weekGroup) => {
                  const weekTitle = `Tuần ${weekGroup.weekNum < 10 ? '0' + weekGroup.weekNum : weekGroup.weekNum}`

                  return weekGroup.items.map((item: any, idx: number) => {
                    const isFirstInWeek = idx === 0

                    return (
                      <tr key={`${weekGroup.weekNum}_${idx}`} className="hover:bg-slate-50/70 transition">
                        {isFirstInWeek && (
                          <td
                            rowSpan={weekGroup.items.length}
                            className="p-3 border-r text-center font-black text-sm text-slate-800 bg-slate-50/60 align-middle"
                          >
                            {weekTitle}
                          </td>
                        )}

                        <td className="p-2.5 border-r text-center align-middle">
                          <span className="font-bold text-slate-900 block">
                            {item.dayName} {item.periodStr}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 block mt-0.5">
                            {item.dateStr}
                          </span>
                        </td>

                        <td className="p-2.5 border-r text-center font-black text-blue-700 text-sm">
                          {item.isSkipped ? '—' : item.lessonOrder}
                        </td>

                        <td className="p-2.5 border-r font-medium text-slate-800">
                          {item.lessonName}
                        </td>

                        <td className="p-2.5 text-center">
                          {item.status === 'dada' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Đã dạy
                            </span>
                          ) : item.status === 'sapday' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                              Sắp dạy
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-400 bg-slate-100">
                              Chưa dạy
                            </span>
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
    </div>
  )
}