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

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade?: number
  template_id?: string | null
}

interface CurriculumItem {
  id: string
  class_id?: string
  template_id?: string
  lesson_order: number
  lesson_name: string
}

interface ScheduleEntry {
  id: string
  day_of_week: number
  period_number: number
  class_id?: string
  week_number?: number
  is_substitute?: boolean
  sub_class_code?: string
  sub_subject?: string
  classes?: ClassItem
}

const START_DATE_WEEK_1 = new Date(2026, 8, 7) // 07/09/2026

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
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(false)

  const loadBaseData = async () => {
    setLoading(true)

    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('*, classes(*)')
    if (sData) setSchedule(sData as any)

    // Lấy tất cả các lớp có trong TKB hoặc danh sách classes
    const { data: cData } = await supabase
      .from('classes')
      .select('*')
      .order('code', { ascending: true })

    if (cData && cData.length > 0) {
      setClasses(cData)
      if (!selectedClassId && cData.length > 0) {
        setSelectedClassId(cData[0].id)
      }
    }

    setLoading(false)
  }

  const loadClassCurriculum = async (classId: string) => {
    if (!classId) return
    const cls = classes.find((c) => c.id === classId)
    if (!cls) return

    let items: CurriculumItem[] = []

    // 1. Kiểm tra bảng liên kết nhiều-nhiều class_curriculums kết hợp với tên môn học hoặc template_id
    const { data: ccData } = await supabase
      .from('class_curriculums')
      .select('curriculum_id, curriculums(*)')
      .eq('class_id', classId)

    if (ccData && ccData.length > 0) {
      // Tìm khung PPCT khớp với môn học của lớp này
      const matchedCurr = ccData.find((item: any) => {
        const currSub = (item.curriculums?.subject || '').toLowerCase()
        const clsSub = (cls.subject || '').toLowerCase()
        return currSub.includes(clsSub) || clsSub.includes(currSub) || !currSub
      }) || ccData[0] // Fallback lấy phần tử đầu tiên nếu không khớp tuyệt đối

      if (matchedCurr && matchedCurr.curriculums) {
        const currId = (matchedCurr.curriculums as any).id
        const { data: cItems } = await supabase
          .from('curriculum_items')
          .select('*')
          .eq('template_id', currId)
          .order('lesson_order', { ascending: true })
        if (cItems) items = cItems as any
      }
    }

    // 2. Nếu chưa có, fallback tìm theo template_id của lớp
    if (items.length === 0 && cls?.template_id) {
      const { data } = await supabase
        .from('curriculum_items')
        .select('*')
        .eq('template_id', cls.template_id)
        .order('lesson_order', { ascending: true })
      if (data) items = data as any
    }

    // 3. Fallback cuối cùng theo class_id trực tiếp
    if (items.length === 0) {
      const { data } = await supabase
        .from('curriculum_items')
        .select('*')
        .eq('class_id', classId)
        .order('lesson_order', { ascending: true })
      if (data) items = data as any
    }

    setCurriculum(items)
  }

  useEffect(() => {
    loadBaseData()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadClassCurriculum(selectedClassId)
    }
  }, [selectedClassId, classes])

  // Lập danh sách tiến độ phân phối theo từng tuần
  const buildProgressTimeline = () => {
    if (!selectedClassId || curriculum.length === 0) return []
    const currentClass = classes.find(c => c.id === selectedClassId)
    if (!currentClass) return []

    // Lọc các tiết học trên TKB khớp với lớp và môn học này
    const classSlots = schedule
      .filter((s) => {
        const sCode = (s.sub_class_code || s.classes?.code || '').trim().toUpperCase()
        const sSub = (s.sub_subject || s.classes?.subject || '').trim().toLowerCase()
        const targetCode = currentClass.code.trim().toUpperCase()
        const targetSub = currentClass.subject.trim().toLowerCase()

        return (
          sCode === targetCode &&
          sSub.includes(targetSub) &&
          !s.is_substitute
        )
      })
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
        return a.period_number - b.period_number
      })

    if (classSlots.length === 0) return []

    const periodsPerWeek = classSlots.length
    const now = new Date()

    const weeksList: {
      weekNum: number
      items: Array<{
        lessonOrder: number
        lessonName: string
        dayName: string
        periodStr: string
        dateStr: string
        status: 'dada' | 'sapday' | 'chuaday'
      }>
    }[] = []

    curriculum.forEach((item, index) => {
      const weekIndex = Math.floor(index / periodsPerWeek)
      const slotIndex = index % periodsPerWeek
      const slot = classSlots[slotIndex] || classSlots[0]

      const weekNum = weekIndex + 1

      const d = new Date(START_DATE_WEEK_1)
      const dayOffset = (slot.day_of_week - 2)
      d.setDate(d.getDate() + weekIndex * 7 + dayOffset)

      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      const dateStr = `${dd}/${mm}/${yyyy}`

      let status: 'dada' | 'sapday' | 'chuaday' = 'chuaday'
      const diffTime = d.getTime() - now.getTime()
      const diffDays = diffTime / (1000 * 3600 * 24)

      if (diffDays < -0.5) status = 'dada'
      else if (diffDays >= -0.5 && diffDays <= 7) status = 'sapday'
      else status = 'chuaday'

      let currentWeekGroup = weeksList.find((w) => w.weekNum === weekNum)
      if (!currentWeekGroup) {
        currentWeekGroup = { weekNum, items: [] }
        weeksList.push(currentWeekGroup)
      }

      currentWeekGroup.items.push({
        lessonOrder: item.lesson_order,
        lessonName: item.lesson_name,
        dayName: DAY_NAMES[slot.day_of_week] || `Thứ ${slot.day_of_week}`,
        periodStr: `(T${slot.period_number})`,
        dateStr,
        status,
      })
    })

    return weeksList
  }

  const timelineWeeks = buildProgressTimeline()
  const currentClass = classes.find((c) => c.id === selectedClassId)

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-10">
      {/* HEADER */}
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
            <span className="text-xs font-bold text-slate-500 uppercase">Lớp:</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="font-black text-emerald-700 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.subject}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadBaseData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* BẢNG TIẾN ĐỘ ĐÃ GỘP Ô TUẦN VÀ ĐẶT NGÀY DƯỚI THỨ */}
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
                    Lớp chưa được gán khung PPCT hoặc chưa xếp tiết trên Thời khóa biểu cho môn này.
                  </td>
                </tr>
              ) : (
                timelineWeeks.map((weekGroup) => {
                  const weekTitle = `Tuần ${weekGroup.weekNum < 10 ? '0' + weekGroup.weekNum : weekGroup.weekNum}`

                  return weekGroup.items.map((item, idx) => {
                    const isFirstInWeek = idx === 0

                    return (
                      <tr key={`${weekGroup.weekNum}_${item.lessonOrder}`} className="hover:bg-slate-50/70 transition">
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
                          {item.lessonOrder}
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