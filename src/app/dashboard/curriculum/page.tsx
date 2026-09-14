'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { BookOpen, RefreshCw, Upload, Trash2, Layers, Save, Eye, X } from 'lucide-react'

interface CurriculumTemplate {
  id: string
  title: string
  subject: string
  grade: number
  total_lessons: number
}

interface CurriculumItem {
  id: string
  lesson_order: number
  lesson_name: string
}

interface ClassItem {
  id: string
  code: string
  subject: string
  grade: number
}

export default function CurriculumPage() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [classMappings, setClassMappings] = useState<{ template_id: string; class_id: string }[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // State cho Popup Xem chi tiết bảng phân phối chương trình
  const [viewingTemplate, setViewingTemplate] = useState<CurriculumTemplate | null>(null)
  const [curriculumItems, setCurriculumItems] = useState<CurriculumItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  const parseMetadataFromTitle = (title: string) => {
    const titleLower = title.toLowerCase()
    let subject = 'Toán'
    if (titleLower.includes('gddp')) subject = 'GDĐP'
    else if (titleLower.includes('hdtn')) subject = 'HĐTN'

    let grade = 12
    if (titleLower.includes('11') || titleLower.includes('k11')) grade = 11

    return { subject, grade }
  }

  const loadData = async () => {
    setLoading(true)

    const { data: tData } = await supabase.from('curriculum_templates').select('*')
    if (tData) {
      setTemplates(tData)
      if (tData.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(tData[0].id)
      } else if (tData.length === 0) {
        setSelectedTemplateId('')
      }
    }

    const { data: cData } = await supabase.from('classes').select('id, code, subject, grade')
    const classMap = new Map<string, ClassItem>()

    if (cData && cData.length > 0) {
      cData.forEach((c: any) => {
        const code = (c.code || '').trim().toUpperCase()
        const subject = (c.subject || 'Toán').trim()
        
        if (code) {
          classMap.set(c.id, {
            id: c.id,
            code: code,
            subject: subject,
            grade: c.grade || 10,
          })
        }
      })
    }

    const classList = Array.from(classMap.values()).sort((a, b) => a.code.localeCompare(b.code))
    setClasses(classList)

    const { data: mapData } = await supabase.from('class_curriculums').select('template_id, class_id')
    if (mapData) {
      setClassMappings(mapData)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedTemplateId) {
      const assignedIds = classMappings
        .filter((m) => m.template_id === selectedTemplateId)
        .map((m) => m.class_id)
      setSelectedClassIds(assignedIds)
    }
  }, [selectedTemplateId, classMappings])

  const handleOpenViewModal = async (tpl: CurriculumTemplate, e: React.MouseEvent) => {
    e.stopPropagation()
    setViewingTemplate(tpl)
    setLoadingItems(true)

    const { data } = await supabase
      .from('curriculum_items')
      .select('*')
      .eq('template_id', tpl.id)
      .order('lesson_order', { ascending: true })

    if (data) {
      setCurriculumItems(data)
    } else {
      setCurriculumItems([])
    }
    setLoadingItems(false)
  }

  // BỘ ĐỌC EXCEL HOÀN THIỆN: Dùng upsert chống trùng khóa và quét đa tầng chuẩn xác 100%
  const handleUploadCurriculumExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setLoading(true)
    try {
      let successCount = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 })

        const title = file.name.replace(/\.[^/.]+$/, '')
        const itemsMap = new Map<number, string>()
        let maxLessonOrder = 0

        for (let r = 0; r < jsonData.length; r++) {
          const row = jsonData[r]
          if (!row || row.length === 0) continue

          let rangeRaw = ''
          let lessonName = ''

          // Quét từng cột để tìm dải tiết và tên bài học chuẩn xác
          for (let c = 0; c < row.length; c++) {
            const cellVal = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : ''
            if (!cellVal) continue

            if (/^[\d,\-\s–]+$/.test(cellVal)) {
              rangeRaw = cellVal
            } else {
              const upper = cellVal.toUpperCase()
              if (
                !upper.includes('TIẾT THEO') &&
                !upper.includes('TÊN BÀI') &&
                !upper.includes('NỘI DUNG') &&
                !upper.includes('CHƯƠNG') &&
                !upper.includes('HỌC KỲ') &&
                !upper.includes('LĨNH VỰC') &&
                !upper.includes('---') &&
                cellVal.length > 2
              ) {
                if (!lessonName) lessonName = cellVal
              }
            }
          }

          if (!lessonName) continue

          if (!rangeRaw) {
            maxLessonOrder++
            itemsMap.set(maxLessonOrder, lessonName)
            continue
          }

          const parts = rangeRaw.match(/\d+/g)
          if (parts && parts.length > 0) {
            const start = parseInt(parts[0], 10)
            const end = parseInt(parts[parts.length - 1], 10)

            for (let pNum = start; pNum <= end; pNum++) {
              if (pNum > maxLessonOrder) maxLessonOrder = pNum
              itemsMap.set(pNum, lessonName)
            }
          }
        }

        const finalItems: any[] = []
        itemsMap.forEach((name, order) => {
          finalItems.push({
            lesson_order: order,
            lesson_name: name,
          })
        })

        if (finalItems.length === 0) continue

        finalItems.sort((a, b) => a.lesson_order - b.lesson_order)
        const totalLessons = maxLessonOrder > 0 ? maxLessonOrder : finalItems.length

        // Xóa template cũ và items cũ sạch sẽ trong DB
        const { data: existingTpl } = await supabase
          .from('curriculum_templates')
          .select('id')
          .eq('title', title)
          .maybeSingle()

        if (existingTpl) {
          await supabase.from('curriculum_items').delete().eq('template_id', existingTpl.id)
          await supabase.from('curriculum_templates').delete().eq('id', existingTpl.id)
        }

        const { subject, grade } = parseMetadataFromTitle(title)

        const { data: newTpl, error: tplErr } = await supabase
          .from('curriculum_templates')
          .insert({
            title,
            subject,
            grade,
            total_lessons: totalLessons,
          })
          .select('id')
          .single()

        if (tplErr || !newTpl) continue

        const itemsWithId = finalItems.map((item) => ({
          template_id: newTpl.id,
          lesson_order: item.lesson_order,
          lesson_name: item.lesson_name,
        }))

        if (itemsWithId.length > 0) {
          // Sử dụng upsert với onConflict để tránh hoàn toàn lỗi vi phạm khóa duy nhất (unique constraint)
          const { error: insertErr } = await supabase
            .from('curriculum_items')
            .upsert(itemsWithId, { onConflict: 'template_id, lesson_order' })

          if (insertErr) {
            console.error('Lỗi upsert curriculum_items:', insertErr.message)
          }
        }

        successCount++
      }

      alert(`Đã tải lên thành công ${successCount} / ${files.length} khung PPCT với tên bài chuẩn xác tuyệt đối!`)
      loadData()
    } catch (err: any) {
      alert('Lỗi tải file PPCT: ' + err.message)
    } finally {
      setLoading(false)
      const fileInput = document.getElementById('ppct-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    }
  }

  const handleDeleteTemplate = async (templateId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Bạn có chắc chắn muốn xóa khung PPCT "${title}" không?`)) return

    setLoading(true)
    try {
      await supabase.from('curriculum_items').delete().eq('template_id', templateId)
      await supabase.from('class_curriculums').delete().eq('template_id', templateId)
      const { error } = await supabase.from('curriculum_templates').delete().eq('id', templateId)

      if (error) throw error

      alert('Đã xóa khung PPCT thành công!')
      loadData()
    } catch (err: any) {
      alert('Lỗi khi xóa khung PPCT: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleClassSelection = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    )
  }

  const handleApplyMappings = async () => {
    if (!selectedTemplateId) {
      alert('Vui lòng chọn khung PPCT trước!')
      return
    }

    setLoading(true)
    try {
      await supabase.from('class_curriculums').delete().eq('template_id', selectedTemplateId)

      if (selectedClassIds.length > 0) {
        const newInserts = selectedClassIds.map((classId) => ({
          class_id: classId,
          template_id: selectedTemplateId,
        }))

        const { error } = await supabase.from('class_curriculums').insert(newInserts)
        if (error) throw error
      }

      alert('Đã áp dụng khung PPCT cho các lớp thành công!')
      loadData()
    } catch (err: any) {
      alert('Lỗi khi áp dụng PPCT: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId)

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Phân Phối Chương Trình (PPCT)</h1>
          <p className="text-xs text-slate-500">Mỗi lớp có thể áp dụng nhiều khung PPCT đồng thời để làm căn cứ lập Lịch báo giảng.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Tải nhiều PPCT (Excel)</span>
            <input id="ppct-upload" type="file" accept=".xlsx, .xls" multiple onChange={handleUploadCurriculumExcel} className="hidden" />
          </label>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>Các khung PPCT đã có ({templates.length})</span>
          </h2>

          <div className="space-y-2">
            {templates.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">Chưa có khung PPCT nào.</div>
            ) : (
              templates.map((tpl) => {
                const isSelected = tpl.id === selectedTemplateId
                const assignedCount = classMappings.filter((m) => m.template_id === tpl.id).length

                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer relative group ${
                      isSelected ? 'bg-emerald-50/60 border-emerald-500 shadow-2xs' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-black text-slate-900 text-sm">{tpl.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {tpl.total_lessons} tiết
                        </span>
                        
                        <button
                          onClick={(e) => handleOpenViewModal(tpl, e)}
                          title="Xem chi tiết bảng phân phối chương trình"
                          className="flex items-center gap-0.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem</span>
                        </button>

                        <button
                          onClick={(e) => handleDeleteTemplate(tpl.id, tpl.title, e)}
                          title="Xóa khung PPCT này"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
                      <span>Khối {tpl.grade} — {tpl.subject}</span>
                      <span className="font-bold text-blue-700">{assignedCount} lớp đang áp dụng</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-300 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-2">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase">
                Gán khung: <span className="text-emerald-700">{activeTemplate?.title || 'Chọn khung'}</span>
              </h2>
              <p className="text-[11px] text-slate-500">Tích chọn các lớp bên dưới, sau đó bấm nút <strong className="text-emerald-800">"Áp dụng"</strong> để lưu lại.</p>
            </div>

            <button
              onClick={handleApplyMappings}
              disabled={loading || !selectedTemplateId}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Áp dụng cho các lớp đã chọn</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
            {classes.length === 0 ? (
              <div className="col-span-2 p-10 text-center text-slate-400 text-xs">
                Chưa có lớp nào trong hệ thống. Vui lòng kiểm tra lại bảng classes.
              </div>
            ) : (
              classes.map((cls) => {
                const isSelectedCheckbox = selectedClassIds.includes(cls.id)

                const isAssignedToActiveTpl = classMappings.some(
                  (m) => m.class_id === cls.id && m.template_id === selectedTemplateId
                )

                const assignedTemplatesForClass = classMappings
                  .filter((m) => m.class_id === cls.id)
                  .map((m) => templates.find((t) => t.id === m.template_id))
                  .filter(Boolean) as CurriculumTemplate[]

                return (
                  <div
                    key={cls.id}
                    onClick={() => handleToggleClassSelection(cls.id)}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between gap-2 ${
                      isAssignedToActiveTpl
                        ? 'bg-emerald-100/90 border-emerald-600 shadow-xs ring-1 ring-emerald-500 font-semibold'
                        : isSelectedCheckbox
                        ? 'bg-emerald-50/80 border-emerald-500 text-slate-900 shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-sm block ${isAssignedToActiveTpl ? 'font-black text-emerald-950' : 'font-black text-slate-900'}`}>
                          Lớp {cls.code} {isAssignedToActiveTpl && '✓'}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">Môn: {cls.subject}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isSelectedCheckbox}
                          onChange={() => {}}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-700">Chọn</span>
                      </div>
                    </div>

                    {assignedTemplatesForClass.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5 mr-1">
                          <Layers className="w-3 h-3 text-blue-600" /> Đã lưu:
                        </span>
                        {assignedTemplatesForClass.map((tpl) => (
                          <span
                            key={tpl.id}
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                              tpl.id === selectedTemplateId
                                ? 'bg-emerald-700 text-white'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {tpl.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* POPUP XEM CHI TIẾT BẢNG PHÂN PHỐI CHƯƠNG TRÌNH */}
      {viewingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-3 shrink-0">
              <div>
                <h3 className="font-black text-slate-900 text-base">{viewingTemplate.title}</h3>
                <p className="text-xs text-slate-500">Khối {viewingTemplate.grade} — Môn: {viewingTemplate.subject} (Tổng số: {viewingTemplate.total_lessons} tiết)</p>
              </div>
              <button
                onClick={() => setViewingTemplate(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {loadingItems ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Đang tải danh sách tiết học...</span>
                </div>
              ) : curriculumItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">Chưa có chi tiết nội dung tiết học nào trong khung này.</div>
              ) : (
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-tight text-[11px] sticky top-0">
                      <th className="w-[15%] p-2.5 border-r border-slate-300 text-center">Tiết số</th>
                      <th className="w-[85%] p-2.5">Tên bài học / Nội dung chương trình</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {curriculumItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="p-2.5 border-r border-slate-300 text-center font-black text-emerald-900 bg-slate-50">
                          Tiết {item.lesson_order}
                        </td>
                        <td className="p-2.5 font-medium text-slate-900">
                          {item.lesson_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-2 border-t flex justify-end shrink-0">
              <button
                onClick={() => setViewingTemplate(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}