'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { RefreshCw, BookOpen, ArrowRight, AlertCircle } from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  subject: string
  grade: number
  template_id?: string | null
}

export default function ClassesManagementPage() {
  const supabase = createClient()

  const [classesList, setClassesList] = useState<ClassItem[]>([])
  const [curriculums, setCurriculums] = useState<any[]>([])
  const [classCurriculums, setClassCurriculums] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadAll = async () => {
    setLoading(true)

    // 1. Tải danh sách khung PPCT chuẩn từ bảng curriculums
    const { data: currData } = await supabase.from('curriculums').select('*')
    if (currData) setCurriculums(currData)

    // 2. Tải bảng liên kết class_curriculums
    const { data: ccData } = await supabase.from('class_curriculums').select('*')
    if (ccData) setClassCurriculums(ccData)

    // 3. Tải danh sách lớp chuẩn từ bảng classes
    const { data: cData } = await supabase.from('classes').select('*').order('code', { ascending: true })
    if (cData) {
      // Ánh xạ template_id từ bảng class_curriculums vào state lớp học
      const mapped = cData.map(c => {
        const matched = ccData?.find(cc => cc.class_id === c.id || cc.class_id === `${c.code}_${c.subject}`)
        return {
          ...c,
          template_id: matched?.template_id || c.template_id || null
        }
      })
      setClassesList(mapped)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Gán khung PPCT độc lập qua bảng class_curriculums chỉ sử dụng cột template_id chuẩn
  const handleUpdateTemplate = async (classItem: ClassItem, newTemplateId: string) => {
    setUpdatingId(classItem.id)
    const tplId = newTemplateId === '' ? null : newTemplateId

    try {
      // 1. Lưu vào bảng quan hệ class_curriculums với đúng tên cột template_id
      const { error: ccErr } = await supabase.from('class_curriculums').upsert(
        {
          class_id: classItem.id,
          template_id: tplId,
        },
        { onConflict: 'class_id' }
      )
      if (ccErr) throw ccErr

      // 2. Nạp danh sách bài học từ khung mẫu sang bảng curriculum_items của riêng lớp này
      if (tplId) {
        const { data: templateLessons } = await supabase
          .from('curriculum_items')
          .select('lesson_order, lesson_name')
          .eq('template_id', tplId)
          .is('class_id', null)
          .order('lesson_order', { ascending: true })

        if (templateLessons && templateLessons.length > 0) {
          await supabase.from('curriculum_items').delete().eq('class_id', classItem.id)

          const itemsToInsert = templateLessons.map((l) => ({
            class_id: classItem.id,
            template_id: tplId,
            lesson_order: l.lesson_order,
            lesson_name: l.lesson_name,
          }))
          await supabase.from('curriculum_items').insert(itemsToInsert)
        }
      } else {
        // Nếu hủy chọn khung thì xóa các bài học riêng của lớp
        await supabase.from('curriculum_items').delete().eq('class_id', classItem.id)
      }

      await loadAll()
      alert('Đã gán khung phân phối chương trình thành công!')
    } catch (err: any) {
      alert('Lỗi cập nhật: ' + err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const unassignedCount = classesList.filter((c) => !c.template_id).length

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Quản Lý Lớp Học</h1>
          <p className="text-xs text-slate-500">Gán khung Phân phối chương trình chuẩn xác cho từng lớp và môn học</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/curriculum"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border cursor-pointer"
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
          <span className="text-xs font-bold text-slate-500 uppercase block">Tổng Lớp - Môn</span>
          <span className="text-2xl font-black text-slate-900">{classesList.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase block">Đã Gán Khung</span>
          <span className="text-2xl font-black text-emerald-700">{classesList.length - unassignedCount}</span>
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
            {classesList.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  Chưa có dữ liệu lớp học trong cơ sở dữ liệu.
                </td>
              </tr>
            ) : (
              classesList.map((cls, idx) => {
                const isUpdating = updatingId === cls.id
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
                          onChange={(e) => handleUpdateTemplate(cls, e.target.value)}
                          className={`w-full p-2 border-2 rounded-xl text-xs font-black focus:outline-none cursor-pointer transition ${
                            isUnassigned 
                              ? 'bg-amber-50 border-amber-400 text-amber-950' 
                              : 'bg-emerald-50/50 border-emerald-500 text-slate-900'
                          }`}
                        >
                          <option value="">-- Chọn khung PPCT chuẩn --</option>
                          {curriculums.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.title || tpl.name || tpl.id} {tpl.total_periods ? `— [${tpl.total_periods} tiết]` : ''}
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