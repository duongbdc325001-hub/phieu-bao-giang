'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, 
  RefreshCw, 
  BookOpen, 
  CalendarDays, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  Sparkles
} from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade?: number
  template_id?: string | null
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
  week_number?: number
  is_substitute?: boolean
}

export default function ClassesManagementPage() {
  const supabase = createClient()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingClassId, setUpdatingClassId] = useState<string | null>(null)

  const loadAll = async () => {
    setLoading(true)

    // 1. Tải danh sách Khung PPCT
    const { data: tData } = await supabase
      .from('curriculum_templates')
      .select('*')
      .order('subject', { ascending: true })
      .order('grade', { ascending: false })
    if (tData) setTemplates(tData)

    // 2. Tải TKB để tính số tiết / tuần
    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('id, class_id, week_number, is_substitute')
    if (sData) setSchedule(sData)

    // 3. CHỈ LẤY CÁC LỚP THỰC TẾ TRÊN TKB
    const activeClassIds = Array.from(
      new Set((sData || []).map((s) => s.class_id).filter(Boolean))
    )

    if (activeClassIds.length > 0) {
      const { data: cData } = await supabase
        .from('classes')
        .select('*')
        .in('id', activeClassIds)
        .order('subject', { ascending: true })
        .order('code', { ascending: true })
      if (cData) setClasses(cData)
    } else {
      setClasses([])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const getPeriodsCount = (classId: string) => {
    return schedule.filter(
      (s) => s.class_id === classId && !s.is_substitute && (s.week_number === 0 || !s.week_number)
    ).length
  }

  const handleUpdateTemplate = async (classId: string, newTemplateId: string) => {
    setUpdatingClassId(classId)
    const tplId = newTemplateId === '' ? null : newTemplateId

    try {
      await supabase
        .from('classes')
        .update({ template_id: tplId })
        .eq('id', classId)

      await supabase.from('curriculum_items').delete().eq('class_id', classId)

      if (tplId) {
        const { data: templateLessons } = await supabase
          .from('curriculum_items')
          .select('lesson_order, lesson_name')
          .eq('template_id', tplId)

        if (templateLessons && templateLessons.length > 0) {
          const itemsToInsert = templateLessons.map((l) => ({
            class_id: classId,
            lesson_order: l.lesson_order,
            lesson_name: l.lesson_name,
          }))
          await supabase.from('curriculum_items').insert(itemsToInsert)
        }
      }

      setClasses((prev) =>
        prev.map((c) => (c.id === classId ? { ...c, template_id: tplId } : c))
      )
    } catch (err: any) {
      alert('Lỗi cập nhật: ' + err.message)
    } finally {
      setUpdatingClassId(null)
    }
  }

  const unassignedCount = classes.filter((c) => !c.template_id).length
  const totalSlots = classes.reduce((sum, c) => sum + getPeriodsCount(c.id), 0)

  return (
    <div className="max-w-7xl mx-auto space-y-2.5 sm:space-y-4 font-sans pb-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-2 sm:pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">Quản Lý Lớp Học</h1>
          <p className="text-[11px] sm:text-xs text-slate-500">Phân định môn học và gán khung PPCT tương ứng</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end">
          <Link
            href="/dashboard/curriculum"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span>Khung PPCT</span>
          </Link>

          <button
            onClick={loadAll}
            disabled={loading}
            className="p-1.5 sm:px-2.5 sm:py-1.5 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* THẺ CHỈ SỐ TỔNG QUAN RÚT GỌN */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs text-center sm:text-left">
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase block">Tổng Lớp</span>
          <span className="text-base sm:text-2xl font-black text-slate-900">{classes.length}</span>
        </div>

        <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs text-center sm:text-left">
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase block">Tiết / Tuần</span>
          <span className="text-base sm:text-2xl font-black text-emerald-700">{totalSlots}</span>
        </div>

        <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs text-center sm:text-left">
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase block">Chưa Gán</span>
          <span className={`text-base sm:text-2xl font-black ${unassignedCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {unassignedCount}
          </span>
        </div>
      </div>

      {/* BẢNG VỪA KHÍT 100% MÀN HÌNH DI ĐỘNG & LAPTOP */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-tight text-[11px]">
              <th className="w-[10%] sm:w-[8%] p-2 border-r border-slate-300 text-center">
                STT
              </th>
              <th className="w-[18%] sm:w-[15%] p-2 border-r border-slate-300 text-center">
                LỚP
              </th>
              <th className="w-[22%] sm:w-[20%] p-2 border-r border-slate-300 text-center">
                MÔN / TIẾT
              </th>
              <th className="w-[50%] sm:w-[42%] p-2 border-r border-slate-300">
                KHUNG PPCT ÁP DỤNG
              </th>
              <th className="hidden sm:table-cell sm:w-[15%] p-2 text-center">
                THAO TÁC
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {classes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  Chưa có lớp nào trong Thời khóa biểu.
                </td>
              </tr>
            ) : (
              classes.map((cls, idx) => {
                const periodsCount = getPeriodsCount(cls.id)
                const isUpdating = updatingClassId === cls.id
                const isUnassigned = !cls.template_id

                return (
                  <tr key={cls.id} className="hover:bg-slate-50/80 transition">
                    {/* CỘT STT */}
                    <td className="p-1.5 sm:p-2.5 border-r border-slate-300 text-center font-bold text-slate-400 text-[11px] sm:text-xs">
                      {idx + 1}
                    </td>

                    {/* CỘT MÃ LỚP */}
                    <td className="p-1.5 sm:p-2.5 border-r border-slate-300 text-center font-black text-slate-900 text-xs sm:text-sm">
                      {cls.code}
                    </td>

                    {/* CỘT MÔN / TIẾT */}
                    <td className="p-1 sm:p-2 border-r border-slate-300 text-center">
                      <span className="font-bold text-[10px] sm:text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded inline-block">
                        {cls.subject === 'Toán' ? 'Toán' : cls.subject}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                        {periodsCount > 0 ? `${periodsCount} tiết/t` : '0 tiết'}
                      </span>
                    </td>

                    {/* CỘT KHUNG PPCT (SELECT BOX VỪA VẶN) */}
                    <td className="p-1.5 sm:p-2.5 border-r border-slate-300">
                      <div className="flex items-center gap-1">
                        <select
                          value={cls.template_id || ''}
                          disabled={isUpdating}
                          onChange={(e) => handleUpdateTemplate(cls.id, e.target.value)}
                          className={`w-full p-1 sm:p-1.5 border rounded-lg text-[11px] sm:text-xs font-bold focus:outline-none cursor-pointer truncate transition ${
                            isUnassigned 
                              ? 'bg-amber-50 border-amber-300 text-amber-900' 
                              : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        >
                          <option value="">-- Chưa gán PPCT --</option>
                          {templates.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.title} ({tpl.total_lessons}t)
                            </option>
                          ))}
                        </select>
                        {isUpdating && <RefreshCw className="w-3 h-3 animate-spin text-emerald-600 shrink-0" />}
                      </div>
                    </td>

                    {/* THAO TÁC (CHỈ HIỆN TRÊN LAPTOP) */}
                    <td className="hidden sm:table-cell p-2 text-center">
                      <Link
                        href="/dashboard/progress"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <span>Tiến độ</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}