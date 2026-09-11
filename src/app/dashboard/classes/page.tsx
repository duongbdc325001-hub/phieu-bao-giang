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

    // 3. Tải danh sách Lớp học
    const { data: cData } = await supabase
      .from('classes')
      .select('*')
      .order('subject', { ascending: true })
      .order('code', { ascending: true })
    if (cData) setClasses(cData)

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Đếm số tiết cố định trên TKB của lớp
  const getPeriodsCount = (classId: string) => {
    return schedule.filter(
      (s) => s.class_id === classId && !s.is_substitute && (s.week_number === 0 || !s.week_number)
    ).length
  }

  // Thay đổi khung PPCT trực tiếp cho 1 lớp
  const handleUpdateTemplate = async (classId: string, newTemplateId: string) => {
    setUpdatingClassId(classId)
    const tplId = newTemplateId === '' ? null : newTemplateId

    try {
      // Cập nhật bảng classes
      await supabase
        .from('classes')
        .update({ template_id: tplId })
        .eq('id', classId)

      // Đồng bộ bản ghi bài dạy sang curriculum_items
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
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản Lý Lớp Học</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Danh mục các lớp giảng dạy trên TKB — Phân định môn học và gán khung PPCT tương ứng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/curriculum"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            Nạp Thêm Khung PPCT
          </Link>

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

      {/* THẺ CHỈ SỐ TỔNG QUAN */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase block">Tổng Lớp Giảng Dạy</span>
            <span className="text-2xl font-black text-slate-800">{classes.length}</span>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase block">Tổng Tiết Định Kỳ / Tuần</span>
            <span className="text-2xl font-black text-emerald-700">{totalSlots} tiết</span>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <CalendarDays className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase block">Trạng Thái PPCT</span>
            {unassignedCount === 0 ? (
              <span className="text-sm font-bold text-emerald-600 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-4 h-4" /> 100% đã có bài dạy
              </span>
            ) : (
              <span className="text-sm font-bold text-amber-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-4 h-4" /> Còn {unassignedCount} lớp chưa gán
              </span>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${unassignedCount === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* BẢNG QUẢN LÝ DANH MỤC LỚP PHẲNG */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b uppercase tracking-wider">
              <tr>
                <th className="p-3 border-r text-center w-14">STT</th>
                <th className="p-3 border-r text-center w-28">Mã Lớp</th>
                <th className="p-3 border-r text-center w-36">Phân Môn</th>
                <th className="p-3 border-r text-center w-28">Số Tiết TKB</th>
                <th className="p-3 border-r">Khung PPCT Đang Áp Dụng</th>
                <th className="p-3 text-center w-32">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {classes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    Chưa có lớp nào. Hãy vào mục <strong>"Thời khóa biểu"</strong> để nhập lịch trước.
                  </td>
                </tr>
              ) : (
                classes.map((cls, idx) => {
                  const periodsCount = getPeriodsCount(cls.id)
                  const isUpdating = updatingClassId === cls.id
                  const isUnassigned = !cls.template_id

                  return (
                    <tr key={cls.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 border-r text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      <td className="p-3 border-r text-center">
                        <span className="font-black text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border">
                          {cls.code}
                        </span>
                      </td>

                      <td className="p-3 border-r text-center">
                        <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          {cls.subject}
                        </span>
                      </td>

                      <td className="p-3 border-r text-center font-black text-slate-800">
                        {periodsCount > 0 ? (
                          <span>{periodsCount} tiết / tuần</span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa xếp tiết</span>
                        )}
                      </td>

                      <td className="p-3 border-r">
                        <div className="flex items-center gap-2">
                          <select
                            value={cls.template_id || ''}
                            disabled={isUpdating}
                            onChange={(e) => handleUpdateTemplate(cls.id, e.target.value)}
                            className={`w-full max-w-md p-1.5 border rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 cursor-pointer transition ${
                              isUnassigned 
                                ? 'bg-amber-50/80 border-amber-300 text-amber-900' 
                                : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          >
                            <option value="">-- Chưa gán khung PPCT --</option>
                            {templates.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.title} ({tpl.subject} Khối {tpl.grade} — {tpl.total_lessons} tiết)
                              </option>
                            ))}
                          </select>
                          {isUpdating && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />}
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <Link
                          href="/dashboard/progress"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <span>Xem tiến độ</span>
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
    </div>
  )
}