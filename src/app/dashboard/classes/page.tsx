'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, RefreshCw, BookOpen, ArrowRight } from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade: number
  template_id?: string | null
}

interface CurriculumTemplate {
  id: string
  title: string
  subject: string
  grade: number
  total_lessons: number
}

export default function ClassesManagementPage() {
  const supabase = createClient()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingClassId, setUpdatingClassId] = useState<string | null>(null)

  const loadAll = async () => {
    setLoading(true)

    // 1. Tải danh sách khung PPCT chuẩn
    const { data: tData } = await supabase.from('curriculum_templates').select('*')
    if (tData) setTemplates(tData)

    // 2. Tải danh sách lớp học
    const { data: cData } = await supabase.from('classes').select('*')
    if (cData) {
      setClasses(cData)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Gán khung PPCT và tự động đồng bộ curriculum_items cho lớp
  const handleUpdateTemplate = async (classId: string, newTemplateId: string) => {
    setUpdatingClassId(classId)
    const tplId = newTemplateId === '' ? null : newTemplateId

    try {
      // 1. Cập nhật template_id cho lớp trong bảng classes
      await supabase
        .from('classes')
        .update({ template_id: tplId })
        .eq('id', classId)

      // 2. Xóa các mục bài học cũ riêng của lớp này (nếu có)
      await supabase.from('curriculum_items').delete().eq('class_id', classId)

      // 3. Nếu chọn khung, tự động copy toàn bộ bài học từ khung mẫu sang bảng curriculum_items gắn với class_id
      if (tplId) {
        const { data: templateLessons } = await supabase
          .from('curriculum_items')
          .select('lesson_order, lesson_name')
          .eq('template_id', tplId)
          .is('class_id', null)
          .order('lesson_order', { ascending: true })

        if (templateLessons && templateLessons.length > 0) {
          const itemsToInsert = templateLessons.map((l) => ({
            class_id: classId,
            template_id: tplId,
            lesson_order: l.lesson_order,
            lesson_name: l.lesson_name,
          }))
          await supabase.from('curriculum_items').insert(itemsToInsert)
        }
      }

      // 4. Cập nhật state giao diện
      setClasses((prev) =>
        prev.map((c) => (c.id === classId ? { ...c, template_id: tplId } : c))
      )
      alert('Đã cập nhật khung chương trình và nạp bài học thành công!')
    } catch (err: any) {
      alert('Lỗi cập nhật: ' + err.message)
    } finally {
      setUpdatingClassId(null)
    }
  }

  const unassignedCount = classes.filter((c) => !c.template_id).length

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Quản Lý Lớp Học</h1>
          <p className="text-xs text-slate-500">Gán khung Phân phối chương trình chuẩn xác cho từng lớp</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/curriculum"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span>Khung PPCT</span>
          </Link>

          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* THẺ TỔNG QUAN */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase block">Tổng Lớp</span>
          <span className="text-2xl font-black text-slate-900">{classes.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase block">Đã Gán Khung</span>
          <span className="text-2xl font-black text-emerald-700">{classes.length - unassignedCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase block">Chưa Gán</span>
          <span className={`text-2xl font-black ${unassignedCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {unassignedCount}
          </span>
        </div>
      </div>

      {/* BẢNG LỚP HỌC */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-tight text-[11px]">
              <th className="w-[10%] p-2.5 border-r border-slate-300 text-center">STT</th>
              <th className="w-[20%] p-2.5 border-r border-slate-300 text-center">LỚP</th>
              <th className="w-[20%] p-2.5 border-r border-slate-300 text-center">MÔN HỌC</th>
              <th className="w-[40%] p-2.5 border-r border-slate-300">KHUNG PPCT ÁP DỤNG</th>
              <th className="w-[10%] p-2.5 text-center">THAO TÁC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {classes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  Chưa có dữ liệu lớp học trong cơ sở dữ liệu.
                </td>
              </tr>
            ) : (
              classes.map((cls, idx) => {
                const isUpdating = updatingClassId === cls.id
                const isUnassigned = !cls.template_id

                return (
                  <tr key={cls.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-2.5 border-r border-slate-300 text-center font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="p-2.5 border-r border-slate-300 text-center font-black text-slate-900 text-sm">
                      {cls.code}
                    </td>
                    <td className="p-2.5 border-r border-slate-300 text-center font-bold text-emerald-950 bg-emerald-50/50">
                      {cls.subject}
                    </td>
                    <td className="p-2.5 border-r border-slate-300">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={cls.template_id || ''}
                          disabled={isUpdating}
                          onChange={(e) => handleUpdateTemplate(cls.id, e.target.value)}
                          className={`w-full p-2 border-2 rounded-xl text-xs font-black focus:outline-none cursor-pointer transition ${
                            isUnassigned 
                              ? 'bg-amber-50 border-amber-400 text-amber-950' 
                              : 'bg-emerald-50/50 border-emerald-500 text-slate-900'
                          }`}
                        >
                          <option value="">-- Chọn khung PPCT chuẩn --</option>
                          {templates.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.title} — [{tpl.total_lessons} tiết]
                            </option>
                          ))}
                        </select>
                        {isUpdating && <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />}
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      <Link
                        href="/dashboard/progress"
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline"
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