'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { START_DATE_WEEK_1, MAX_WEEK, buildLessonPlan, buildWeekRows, fetchAllRows } from '@/lib/baoGiang'
import { 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Layers,
  AlertCircle
} from 'lucide-react'

export default function ProgressPage() {
  const supabase = createClient()

  const [classes, setClasses] = useState<any[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [schedule, setSchedule] = useState<any[]>([])
  const [curriculumItems, setCurriculumItems] = useState<any[]>([])
  const [classCurriculums, setClassCurriculums] = useState<any[]>([])
  const [overrides, setOverrides] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      // Lấy đủ mọi dòng (Supabase chỉ trả tối đa 1000 dòng/lần, nhiều khung PPCT sẽ vượt mức này)
      const [cData, sData, ccData, itemsData, ovrData] = await Promise.all([
        fetchAllRows(supabase, 'classes'),
        fetchAllRows(supabase, 'schedule_entries'),
        fetchAllRows(supabase, 'class_curriculums'),
        fetchAllRows(supabase, 'curriculum_items'),
        fetchAllRows(supabase, 'lesson_overrides'),
      ])
      setClasses(cData)
      setSchedule(sData)
      setClassCurriculums(ccData)
      setCurriculumItems(itemsData)
      setOverrides(ovrData)
    } catch (err) {
      console.error('Lỗi tải dữ liệu:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Lọc danh sách lớp: Chỉ lấy những lớp thực sự có tiết trong TKB (giống hệt Lịch Báo Giảng)
  const getAvailableClasses = () => {
    const classMap = new Map<string, any>()
    
    schedule.forEach((slot) => {
      if (slot.class_id) {
        const foundCls = classes.find((c) => c.id === slot.class_id)
        if (foundCls && !classMap.has(foundCls.id)) {
          classMap.set(foundCls.id, foundCls)
        }
      }
    })

    const list = Array.from(classMap.values()).sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    return list
  }

  const activeClassesList = getAvailableClasses()

  // Tự động chọn lớp đầu tiên trong danh sách thực tế nếu chưa chọn
  useEffect(() => {
    if (activeClassesList.length > 0 && !selectedClassId) {
      setSelectedClassId(activeClassesList[0].id)
    }
  }, [activeClassesList, selectedClassId])

  // Lấy số liệu tiến độ: dùng CHUNG hàm tính với Lịch Báo Giảng (src/lib/baoGiang.ts) nên luôn khớp nhau
  const getProgressTimelineForSelectedClass = () => {
    if (!selectedClassId || schedule.length === 0) return []

    const plan = buildLessonPlan(schedule, classes, classCurriculums, curriculumItems, overrides)
    const timelineByWeeks: any[] = []
    const now = new Date()

    for (let w = 1; w <= MAX_WEEK; w++) {
      const weekRows = buildWeekRows(w, plan, classes)
      const weekSlotsForThisClass: any[] = []

      weekRows.forEach((group) => {
        group.slots.forEach((slot: any) => {
          if (!slot.isEmpty && slot.realClassId === selectedClassId) {
            const d = new Date(START_DATE_WEEK_1)
            d.setDate(d.getDate() + (w - 1) * 7 + group.day.offset)
            const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

            let status: 'dada' | 'sapday' | 'chuaday' = 'chuaday'
            const diffDays = (d.getTime() - now.getTime()) / (1000 * 3600 * 24)
            if (diffDays < -0.5) status = 'dada'
            else if (diffDays >= -0.5 && diffDays <= 7) status = 'sapday'
            else status = 'chuaday'

            weekSlotsForThisClass.push({
              lessonOrder: slot.lessonOrder,
              lessonName: slot.hasTemplate ? slot.lessonName : '(Chưa có PPCT)',
              dayName: group.day.name,
              // tiết sáng: (T1)..(T5); tiết chiều: (C-1), (C-2)...
              periodStr: slot.periodNumber <= 5 ? `(T${slot.period})` : `(${slot.period})`,
              dateStr,
              status,
              hasTemplate: slot.hasTemplate,
            })
          }
        })
      })

      if (weekSlotsForThisClass.length > 0) {
        timelineByWeeks.push({ weekNum: w, items: weekSlotsForThisClass })
      }
    }

    return timelineByWeeks
  }

  const timelineWeeks = getProgressTimelineForSelectedClass()

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-10">
      {/* HEADER GIAO DIỆN */}
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
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="font-black text-emerald-700 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              {activeClassesList.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} — {cls.subject}
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
                    Lớp chưa có tiết dạy nào trên thời khóa biểu.
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
                          {!item.hasTemplate ? <span className="text-slate-400 font-bold">—</span> : (item.lessonOrder === 0 ? '—' : item.lessonOrder)}
                        </td>

                        <td className="p-2.5 border-r font-medium text-slate-800">
                          {!item.hasTemplate ? (
                            <Link
                              href="/dashboard/curriculum"
                              className="inline-flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-md font-bold shadow-2xs hover:bg-rose-100 transition"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Chưa có PPCT — Bấm để gán ngay</span>
                            </Link>
                          ) : (
                            item.lessonName
                          )}
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