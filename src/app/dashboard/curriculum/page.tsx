'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { BookOpen, RefreshCw, CheckCircle2, Upload, Trash2, Layers, Save } from 'lucide-react'

interface CurriculumTemplate {
  id: string
  title: string
  subject: string
  grade: number
  total_lessons: number
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

  const loadData = async () => {
    setLoading(true)

    // 1. Tải danh sách khung PPCT
    const { data: tData } = await supabase.from('curriculum_templates').select('*')
    if (tData) {
      setTemplates(tData)
      if (tData.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(tData[0].id)
      } else if (tData.length === 0) {
        setSelectedTemplateId('')
      }
    }

    // 2. Bóc tách trực tiếp danh sách lớp từ TKB
    const { data: sData } = await supabase.from('schedule_entries').select('sub_class_code, sub_subject')
    const classMap = new Map<string, ClassItem>()

    if (sData && sData.length > 0) {
      sData.forEach((s: any) => {
        const code = (s.sub_class_code || '').trim().toUpperCase()
        const subject = (s.sub_subject || 'Toán').trim()
        
        if (code) {
          const uniqueKey = `${code}_${subject}`
          if (!classMap.has(uniqueKey)) {
            classMap.set(uniqueKey, {
              id: uniqueKey,
              code: code,
              subject: subject,
              grade: code.startsWith('12') ? 12 : code.startsWith('11') ? 11 : 10,
            })
          }
        }
      })
    }

    const classList = Array.from(classMap.values()).sort((a, b) => a.code.localeCompare(b.code))
    setClasses(classList)

    // 3. Tải bảng liên kết class_curriculums
    const { data: mapData } = await supabase.from('class_curriculums').select('template_id, class_id')
    if (mapData) {
      setClassMappings(mapData)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Khi chọn khung PPCT ở cột trái -> Tự động đánh dấu tick các lớp đã được gán khung này
  useEffect(() => {
    if (selectedTemplateId) {
      const assignedIds = classMappings
        .filter((m) => m.template_id === selectedTemplateId)
        .map((m) => m.class_id)
      setSelectedClassIds(assignedIds)
    }
  }, [selectedTemplateId, classMappings])

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
        const itemsToInsert: any[] = []
        let maxLessonOrder = 0

        for (let r = 0; r < jsonData.length; r++) {
          const row = jsonData[r]
          if (!row || row.length === 0) continue

          const cell0 = String(row[0] || '').trim()
          const cell1 = String(row[1] || '').trim()

          if (r === 0 && (cell0.toLowerCase().includes('tiết') || cell0.toLowerCase().includes('tên bài') || cell1.toLowerCase().includes('tên bài') || cell0.toLowerCase().includes('theo ppct'))) {
            continue
          }

          let lessonName = ''
          let lessonOrderText = ''

          if (/^[\d,\-\s–]+$/.test(cell0) && !cell0.toLowerCase().includes('chương') && !cell0.toLowerCase().includes('bài')) {
            lessonOrderText = cell0
            lessonName = cell1 || `Bài ${r}`
          } else if (/^[\d,\-\s–]+$/.test(cell1) && !cell1.toLowerCase().includes('chương') && !cell1.toLowerCase().includes('bài')) {
            lessonOrderText = cell1
            lessonName = cell0 || `Bài ${r}`
          } else {
            lessonName = cell1 || cell0
            if (lessonName && !lessonName.toLowerCase().includes('chương') && !lessonName.toLowerCase().includes('---') && !lessonName.toLowerCase().includes('lĩnh vực')) {
              maxLessonOrder++
              itemsToInsert.push({
                lesson_order: maxLessonOrder,
                lesson_name: lessonName,
              })
            }
            continue
          }

          if (lessonOrderText) {
            const parts = lessonOrderText.split(/[,–-]/).map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n))
            if (parts.length > 0) {
              const start = parts[0]
              const end = parts.length > 1 ? parts[parts.length - 1] : start
              for (let pNum = start; pNum <= end; pNum++) {
                if (pNum > maxLessonOrder) maxLessonOrder = pNum
                itemsToInsert.push({
                  lesson_order: pNum,
                  lesson_name: lessonName,
                })
              }
            }
          }
        }

        const totalLessons = maxLessonOrder > 0 ? maxLessonOrder : (jsonData.length > 1 ? jsonData.length - 1 : 105)

        const { data: newTpl, error: tplErr } = await supabase
          .from('curriculum_templates')
          .insert({
            title: title,
            subject: title.toLowerCase().includes('gddp') ? 'GDĐP' : title.toLowerCase().includes('hdtn') ? 'HĐTN' : 'Toán',
            grade: title.toLowerCase().includes('11') ? 11 : 12,
            total_lessons: totalLessons,
          })
          .select('id')
          .single()

        if (tplErr) continue

        const templateId = newTpl.id
        const finalItems = itemsToInsert.map((item) => ({
          template_id: templateId,
          lesson_order: item.lesson_order,
          lesson_name: item.lesson_name,
        }))

        if (finalItems.length > 0) {
          await supabase.from('curriculum_items').insert(finalItems)
        }

        successCount++
      }

      alert(`Đã tải lên thành công ${successCount} / ${files.length} khung PPCT!`)
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
                    <div className="flex justify-between items-start">
                      <span className="font-black text-slate-900 text-sm pr-6">{tpl.title}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {tpl.total_lessons} tiết
                        </span>
                        <button
                          onClick={(e) => handleDeleteTemplate(tpl.id, tpl.title, e)}
                          title="Xóa khung PPCT này"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
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
                Chưa có lớp nào từ Thời khóa biểu. Vui lòng nhập TKB trước.
              </div>
            ) : (
              classes.map((cls) => {
                const isSelectedCheckbox = selectedClassIds.includes(cls.id)

                // Kiểm tra xem lớp này đã được gán cho khung PPCT đang chọn chưa
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
    </div>
  )
}