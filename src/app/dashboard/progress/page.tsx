'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, BTN_SECONDARY, BTN_ICON } from '@/components/ui/page'
import { periodText } from '@/lib/mauMon'
import { buildLessonPlan, buildWeekRows, fetchAllRows } from '@/lib/baoGiang'
import { useSchoolYear } from '@/components/school-year'
import { dateOf, formatDay } from '@/lib/namHoc'
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
  const { year } = useSchoolYear()
  const yearId = year.id
  const loadSeq = useRef(0)

  const loadData = async () => {
    const mySeq = ++loadSeq.current
    setLoading(true)
    try {
      // Lấy đủ mọi dòng (Supabase chỉ trả tối đa 1000 dòng/lần, nhiều khung PPCT sẽ vượt mức này)
      const [cData, sData, ccData, itemsData, ovrData] = await Promise.all([
        fetchAllRows(supabase, 'classes'),
        // TKB, gán PPCT và cắt/đảo tiết lưu riêng theo năm học
        fetchAllRows(supabase, 'schedule_entries', { school_year: yearId }),
        fetchAllRows(supabase, 'class_curriculums', { school_year: yearId }),
        fetchAllRows(supabase, 'curriculum_items'),
        fetchAllRows(supabase, 'lesson_overrides', { school_year: yearId }),
      ])
      if (mySeq !== loadSeq.current) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId])

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
    // chưa chọn lớp, hoặc lớp đang chọn không có trong năm học vừa đổi sang -> chọn lớp đầu tiên
    if (activeClassesList.length > 0 && !activeClassesList.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(activeClassesList[0].id)
    }
  }, [activeClassesList, selectedClassId])

  // Lấy số liệu tiến độ: dùng CHUNG hàm tính với Lịch Báo Giảng (src/lib/baoGiang.ts) nên luôn khớp nhau
  const getProgressTimelineForSelectedClass = () => {
    if (!selectedClassId || schedule.length === 0) return []

    const plan = buildLessonPlan(schedule, classes, classCurriculums, curriculumItems, overrides, year.weeks)
    const timelineByWeeks: any[] = []
    const now = new Date()

    for (let w = 1; w <= year.weeks; w++) {
      const weekRows = buildWeekRows(w, plan, classes)
      const weekSlotsForThisClass: any[] = []

      weekRows.forEach((group) => {
        group.slots.forEach((slot: any) => {
          if (!slot.isEmpty && slot.realClassId === selectedClassId) {
            const d = dateOf(year, w, group.day.offset)
            const dateStr = formatDay(d)

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
              periodStr: periodText(slot.period),
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

  // Tổng số tiết của khung PPCT đang gán cho lớp, và số tiết đã dạy (theo lịch)
  const allItems = timelineWeeks.flatMap((w: any) => w.items)
  const tplId = (() => {
    const rels = classCurriculums.filter((cc) => cc.class_id === selectedClassId)
    const withItems = rels.find((cc) => curriculumItems.some((i) => String(i.template_id) === String(cc.template_id)))
    return withItems ? String(withItems.template_id) : rels[0] ? String(rels[0].template_id) : null
  })()
  const totalLessons = tplId
    ? curriculumItems.filter((i) => String(i.template_id) === tplId).reduce((m, i) => Math.max(m, Number(i.lesson_order) || 0), 0)
    : 0
  const doneItems = allItems.filter((i: any) => i.status === 'dada' && i.hasTemplate)
  const doneOrder = doneItems.reduce((m: number, i: any) => Math.max(m, Number(i.lessonOrder) || 0), 0)
  const pct = totalLessons ? Math.min(100, Math.round((doneOrder / totalLessons) * 100)) : 0
  const nextItem = allItems.find((i: any) => i.status !== 'dada')
  const currentWeekNum = timelineWeeks.find((w: any) => w.items.some((i: any) => i.status !== 'dada'))?.weekNum
  const selectedClass = activeClassesList.find((c) => c.id === selectedClassId)

  const statusDot = (st: string) =>
    st === 'dada' ? 'bg-emerald-500' : st === 'sapday' ? 'bg-sky-500' : 'bg-slate-300'
  const statusText = (st: string) => (st === 'dada' ? 'Đã dạy' : st === 'sapday' ? 'Sắp dạy' : 'Chưa dạy')

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-10">
      <PageHeader
        title="Tiến độ thực hiện chương trình"
        subtitle={`Từng tiết PPCT của lớp theo ngày dạy trong năm học ${yearId}, tính đúng như Lịch báo giảng.`}
        actions={
          <>
            <label className={`${BTN_SECONDARY} pr-2`}>
              <Layers className="w-4 h-4 text-emerald-700" />
              <span className="sr-only">Chọn lớp</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                {activeClassesList.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.code} – {cls.subject}
                  </option>
                ))}
              </select>
            </label>
            {currentWeekNum && (
              <a href={`#tuan-${currentWeekNum}`} className={BTN_SECONDARY}>
                <Clock className="w-4 h-4" /> Đến tuần đang dạy
              </a>
            )}
            <button onClick={loadData} disabled={loading} title="Tải lại" className={BTN_ICON}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>
        }
      />

      {/* TỔNG QUAN TIẾN ĐỘ */}
      {selectedClass && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-slate-500">Lớp {selectedClass.code} · {selectedClass.subject}</p>
              {totalLessons ? (
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {doneOrder}<span className="text-base font-semibold text-slate-400"> / {totalLessons} tiết PPCT</span>
                </p>
              ) : (
                <p className="text-base font-semibold text-rose-700">Lớp chưa được gán khung PPCT</p>
              )}
            </div>
            {nextItem && nextItem.hasTemplate && (
              <p className="text-xs sm:text-sm text-slate-600 max-w-sm">
                Tiết tiếp theo: <span className="font-semibold text-slate-900">tiết {nextItem.lessonOrder}</span>, {nextItem.dayName.toLowerCase()} {nextItem.dateStr}
              </p>
            )}
          </div>
          {totalLessons > 0 && (
            <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}

      {/* DANH SÁCH THEO TUẦN */}
      {timelineWeeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          Lớp chưa có tiết dạy nào trên thời khóa biểu. Thêm tiết ở trang{' '}
          <Link href="/dashboard/schedule" className="font-semibold text-emerald-700 underline">Thời khóa biểu</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {timelineWeeks.map((weekGroup: any) => {
            const allDone = weekGroup.items.every((i: any) => i.status === 'dada')
            const isNow = weekGroup.weekNum === currentWeekNum
            return (
              <section
                key={weekGroup.weekNum}
                id={`tuan-${weekGroup.weekNum}`}
                className={`scroll-mt-20 rounded-xl border bg-white shadow-sm overflow-hidden ${isNow ? 'border-emerald-300' : 'border-slate-200'}`}
              >
                <header className={`flex items-center justify-between px-4 py-2 border-b ${isNow ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                  <h2 className="text-sm font-bold text-slate-900">Tuần {weekGroup.weekNum}</h2>
                  <span className={`text-xs ${isNow ? 'font-semibold text-emerald-700' : allDone ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {isNow ? 'Đang dạy' : allDone ? 'Đã xong' : `${weekGroup.items.length} tiết`}
                  </span>
                </header>
                <ul className="divide-y divide-slate-100">
                  {weekGroup.items.map((item: any, idx: number) => (
                    <li key={idx} className={`flex items-start gap-3 px-4 py-2.5 ${item.status === 'dada' ? '' : 'bg-white'}`}>
                      <div className="w-20 sm:w-28 shrink-0">
                        <p className="text-xs font-semibold text-slate-800">{item.dayName}</p>
                        <p className="text-[11px] text-slate-500 whitespace-nowrap">{item.dateStr.slice(0, 5)} · {item.periodStr}</p>
                      </div>
                      <div className="w-10 shrink-0 text-center">
                        <span className={`text-sm font-bold tabular-nums ${item.status === 'dada' ? 'text-slate-400' : 'text-slate-900'}`}>
                          {!item.hasTemplate || item.lessonOrder === 0 ? '–' : item.lessonOrder}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {!item.hasTemplate ? (
                          <Link href="/dashboard/curriculum" className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                            <AlertCircle className="w-3.5 h-3.5" /> Chưa có PPCT, bấm để gán
                          </Link>
                        ) : (
                          <p className={`text-[13px] leading-snug ${item.status === 'dada' ? 'text-slate-500' : 'text-slate-900'}`}>{item.lessonName}</p>
                        )}
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-slate-500" title={statusText(item.status)}>
                        <span className={`w-2 h-2 rounded-full ${statusDot(item.status)}`} />
                        <span className="hidden sm:inline">{statusText(item.status)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
