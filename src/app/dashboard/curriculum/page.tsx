'use client'

import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { 
  Upload, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Check, 
  Eye, 
  CheckSquare, 
  Square, 
  RefreshCcw,
  AlertTriangle,
  Filter
} from 'lucide-react'

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
  name: string
  subject: string
  grade?: number
  template_id?: string | null
}

interface CurriculumLesson {
  id?: string
  template_id?: string
  lesson_order: number
  lesson_name: string
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

export default function CurriculumPage() {
  const supabase = createClient()

  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [previewLessons, setPreviewLessons] = useState<CurriculumLesson[]>([])
  const [loading, setLoading] = useState(false)
  
  // Bộ lọc hiển thị lớp: 'all' | 'unassigned' | 'assigned'
  const [classFilter, setClassFilter] = useState<'all' | 'unassigned' | 'assigned'>('all')

  // Danh sách các lớp được tích chọn
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [isApplyingBatch, setIsApplyingBatch] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  // State Modal Tải PPCT mới từ Excel
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSubject, setNewSubject] = useState('Toán')
  const [newGrade, setNewGrade] = useState(10)
  const [fileLessons, setFileLessons] = useState<CurriculumLesson[]>([])
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // TẢI KHUNG PPCT VÀ DANH SÁCH LỚP TỪ TKB
  const loadAll = async () => {
    setLoading(true)

    const { data: tData } = await supabase
      .from('curriculum_templates')
      .select('*')
      .order('subject', { ascending: true })
      .order('grade', { ascending: false })

    if (tData && tData.length > 0) {
      setTemplates(tData)
      if (!selectedTemplateId) {
        setSelectedTemplateId(tData[0].id)
      }
    } else {
      setTemplates([])
      setSelectedTemplateId(null)
    }

    const { data: scheduleSlots } = await supabase
      .from('schedule_entries')
      .select('class_id')
      .not('class_id', 'is', null)

    const activeClassIds = Array.from(
      new Set((scheduleSlots || []).map((s) => s.class_id).filter(Boolean))
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

  const loadTemplateLessons = async (tId: string) => {
    const { data } = await supabase
      .from('curriculum_items')
      .select('id, template_id, lesson_order, lesson_name')
      .eq('template_id', tId)
      .order('lesson_order', { ascending: true })

    if (data) setPreviewLessons(data)
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplateLessons(selectedTemplateId)
    } else {
      setPreviewLessons([])
    }
  }, [selectedTemplateId])

  const toggleSelectClass = (cId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    )
  }

  const filteredClasses = classes.filter((c) => {
    if (classFilter === 'unassigned') return !c.template_id
    if (classFilter === 'assigned') return !!c.template_id
    return true
  })

  const handleSelectAll = () => {
    const visibleIds = filteredClasses.map((c) => c.id)
    const isAllVisibleSelected = visibleIds.every((id) => selectedClassIds.includes(id))

    if (isAllVisibleSelected) {
      setSelectedClassIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedClassIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  // ÁP DỤNG ĐỒNG LOẠT CHO CÁC LỚP ĐƯỢC CHỌN
  const handleApplyBatch = async () => {
    if (!selectedTemplateId) {
      alert('Vui lòng chọn 1 khung PPCT ở bên trái trước!')
      return
    }

    if (selectedClassIds.length === 0) {
      alert('Vui lòng tích chọn ít nhất 1 lớp bên phải để áp dụng!')
      return
    }

    const tpl = templates.find((t) => t.id === selectedTemplateId)
    if (!tpl) return

    const confirmMsg = `Áp dụng khung "${tpl.title}" (${previewLessons.length} tiết) cho ${selectedClassIds.length} lớp đã chọn?`
    if (!confirm(confirmMsg)) return

    setIsApplyingBatch(true)

    try {
      for (const cId of selectedClassIds) {
        await supabase.from('curriculum_items').delete().eq('class_id', cId)

        if (previewLessons.length > 0) {
          const itemsToInsert = previewLessons.map((l) => ({
            class_id: cId,
            lesson_order: l.lesson_order,
            lesson_name: l.lesson_name,
          }))
          await supabase.from('curriculum_items').insert(itemsToInsert)
        }

        await supabase
          .from('classes')
          .update({ template_id: selectedTemplateId })
          .eq('id', cId)
      }

      setClasses((prev) =>
        prev.map((c) =>
          selectedClassIds.includes(c.id) ? { ...c, template_id: selectedTemplateId } : c
        )
      )

      alert(`Đã áp dụng thành công cho ${selectedClassIds.length} lớp!`)
      setSelectedClassIds([])
    } catch (err: any) {
      alert('Lỗi khi áp dụng: ' + err.message)
    } finally {
      setIsApplyingBatch(false)
    }
  }

  // GIẢI MÃ TẤT CẢ CÁC ĐỊNH DẠNG Ô TIẾT
  const parsePeriodCell = (raw: any): number[] => {
    if (raw === null || raw === undefined || raw === '') return []
    if (typeof raw === 'number') return [raw]

    const str = String(raw).trim()
    const result: number[] = []

    const dateTextMatch1 = str.match(/^(\d{1,2})[-/]([a-zA-Z]{3,})$/)
    if (dateTextMatch1) {
      const p1 = parseInt(dateTextMatch1[1], 10)
      const mStr = dateTextMatch1[2].toLowerCase().slice(0, 3)
      const p2 = MONTH_MAP[mStr]
      if (p1 && p2) {
        const start = Math.min(p1, p2)
        const end = Math.max(p1, p2)
        for (let i = start; i <= end; i++) result.push(i)
        return result
      }
    }

    const dateTextMatch2 = str.match(/^([a-zA-Z]{3,})[-/](\d{1,2})$/)
    if (dateTextMatch2) {
      const mStr = dateTextMatch2[1].toLowerCase().slice(0, 3)
      const p1 = MONTH_MAP[mStr]
      const p2 = parseInt(dateTextMatch2[2], 10)
      if (p1 && p2) {
        const start = Math.min(p1, p2)
        const end = Math.max(p1, p2)
        for (let i = start; i <= end; i++) result.push(i)
        return result
      }
    }

    const tokens = str.replace(/[\r\n;]+/g, ',').split(',').map((t) => t.trim()).filter(Boolean)

    for (const token of tokens) {
      const rangeMatch = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10)
        const end = parseInt(rangeMatch[2], 10)
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) result.push(i)
          continue
        }
      }

      const num = parseInt(token, 10)
      if (!isNaN(num)) {
        result.push(num)
      }
    }

    return result
  }

  // ĐỌC FILE EXCEL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setErrorMsg(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

        if (!rows || rows.length === 0) {
          setErrorMsg('File Excel không có dữ liệu')
          return
        }

        let nameColIdx = 0
        let periodColIdx = 1

        const headerRow = rows[0] || []
        const h0 = String(headerRow[0] || '').toLowerCase()
        const h1 = String(headerRow[1] || '').toLowerCase()

        if (h0.includes('tiết') || h0.includes('ppct')) {
          periodColIdx = 0
          nameColIdx = 1
        } else if (h1.includes('tiết') || h1.includes('ppct')) {
          nameColIdx = 0
          periodColIdx = 1
        }

        const list: CurriculumLesson[] = []

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex]
          if (!row || row.length === 0) continue

          const rawName = row[nameColIdx] !== undefined ? String(row[nameColIdx]).trim() : ''
          const rawPeriod = row[periodColIdx] !== undefined ? String(row[periodColIdx]).trim() : ''

          const lowerName = rawName.toLowerCase()
          if (lowerName === 'tên bài' || lowerName === 'tên bài/chủ đề' || lowerName.includes('tiết theo ppct')) {
            continue
          }

          if (rawName && !rawPeriod) {
            continue
          }

          if (rawName && rawPeriod) {
            const periods = parsePeriodCell(rawPeriod)
            for (const p of periods) {
              list.push({
                lesson_order: p,
                lesson_name: rawName,
              })
            }
          }
        }

        if (list.length === 0) {
          setErrorMsg('Không tìm thấy dữ liệu tiết hợp lệ trong file Excel')
          return
        }

        list.sort((a, b) => a.lesson_order - b.lesson_order)

        const uniqueLessons: CurriculumLesson[] = []
        const seen = new Set<number>()
        for (const item of list) {
          if (!seen.has(item.lesson_order)) {
            seen.add(item.lesson_order)
            uniqueLessons.push(item)
          }
        }

        setFileLessons(uniqueLessons)

        if (!newTitle) {
          setNewTitle(file.name.replace(/\.[^/.]+$/, ''))
        }
      } catch (err: any) {
        setErrorMsg('Lỗi đọc file Excel: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // LƯU KHUNG MỚI
  const handleSaveNewTemplate = async () => {
    if (!newTitle.trim() || fileLessons.length === 0) {
      alert('Vui lòng nhập tên khung và chọn file Excel!')
      return
    }

    setUploading(true)
    setErrorMsg(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const { data: newTpl, error: tErr } = await supabase
        .from('curriculum_templates')
        .insert({
          title: newTitle.trim(),
          subject: newSubject.trim(),
          grade: Number(newGrade),
          total_lessons: fileLessons.length,
          user_id: session?.user.id,
        })
        .select()
        .single()

      if (tErr || !newTpl) throw tErr

      const itemsToInsert = fileLessons.map((l) => ({
        template_id: newTpl.id,
        lesson_order: l.lesson_order,
        lesson_name: l.lesson_name,
      }))

      const { error: itemsErr } = await supabase.from('curriculum_items').insert(itemsToInsert)
      if (itemsErr) throw itemsErr

      setIsModalOpen(false)
      setNewTitle('')
      setFileLessons([])
      setFileName('')
      await loadAll()
      setSelectedTemplateId(newTpl.id)
    } catch (err: any) {
      setErrorMsg('Lỗi khi lưu khung PPCT: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  // XÓA KHUNG
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa khung PPCT này?')) return
    setLoading(true)
    await supabase.from('curriculum_items').delete().eq('template_id', id)
    await supabase.from('curriculum_templates').delete().eq('id', id)
    if (selectedTemplateId === id) setSelectedTemplateId(null)
    await loadAll()
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
  const appliedCount = classes.filter((c) => c.template_id === selectedTemplateId).length
  const unassignedClassesCount = classes.filter((c) => !c.template_id).length

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Phân Phối Chương Trình</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bấm chọn khung PPCT bên trái, các lớp áp dụng tương ứng bên phải sẽ tự đổi màu nền nổi bật
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setIsModalOpen(true)
              setErrorMsg(null)
              setFileLessons([])
              setFileName('')
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Tải PPCT (Excel)
          </button>

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

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* NỬA TRÁI (5 CỘT): DANH SÁCH KHUNG PPCT */}
        <div className="md:col-span-5 bg-white rounded-2xl border shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Các Khung PPCT Đã Có ({templates.length})
              </span>
            </div>
          </div>

          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {templates.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Chưa có khung nào. Hãy bấm "Tải PPCT (Excel)" để thêm.
              </div>
            ) : (
              templates.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/30'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm">{tpl.title}</span>
                        {isSelected && (
                          <span className="px-1.5 py-0.2 bg-emerald-600 text-white rounded text-[8px] font-black uppercase tracking-wider">
                            Đang chọn
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                        Môn: <strong className="text-slate-700">{tpl.subject}</strong> — Khối {tpl.grade} ({tpl.total_lessons} tiết)
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTemplateId(tpl.id)
                          setShowPreviewModal(true)
                        }}
                        title="Xem trước bài dạy"
                        className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-white rounded-md transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteTemplate(tpl.id)
                        }}
                        title="Xóa khung"
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {selectedTemplate && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-900">
                <span>Đang chọn: {selectedTemplate.title}</span>
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="text-emerald-700 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3 h-3" /> Xem chi tiết ({previewLessons.length} tiết)
                </button>
              </div>
              <div className="text-[11px] text-emerald-700">
                Có <strong>{appliedCount} lớp trong TKB</strong> đang áp dụng khung này.
              </div>
            </div>
          )}
        </div>

        {/* NỬA PHẢI (7 CỘT): DANH SÁCH LỚP TỪ TKB KÈM CẢNH BÁO CHƯA GÁN */}
        <div className="md:col-span-7 bg-white rounded-2xl border shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between border-b pb-2.5 gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                {selectedClassIds.length === filteredClasses.length && filteredClasses.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>
                  {selectedClassIds.length === filteredClasses.length && filteredClasses.length > 0
                    ? 'Bỏ chọn'
                    : 'Chọn tất cả'}
                </span>
              </button>

              {/* BỘ LỌC TRẠNG THÁI LỚP */}
              <div className="inline-flex rounded-lg border bg-slate-50 p-0.5 text-[11px] font-bold">
                <button
                  onClick={() => setClassFilter('all')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    classFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({classes.length})
                </button>
                <button
                  onClick={() => setClassFilter('unassigned')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
                    classFilter === 'unassigned' ? 'bg-amber-500 text-white shadow-xs' : 'text-amber-700 hover:text-amber-900'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Chưa gán ({unassignedClassesCount})
                </button>
                <button
                  onClick={() => setClassFilter('assigned')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    classFilter === 'assigned' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Đã gán ({classes.length - unassignedClassesCount})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadAll}
                disabled={loading}
                title="Quét lại các lớp có trong Thời khóa biểu"
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Lấy từ TKB
              </button>

              <button
                onClick={handleApplyBatch}
                disabled={isApplyingBatch || selectedClassIds.length === 0 || !selectedTemplateId}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                {isApplyingBatch ? (
                  'Đang áp dụng...'
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Áp dụng ({selectedClassIds.length} lớp)
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[560px] overflow-y-auto pr-1">
            {filteredClasses.length === 0 ? (
              <div className="col-span-full p-10 text-center text-xs text-slate-400">
                Không tìm thấy lớp nào phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              filteredClasses.map((cls) => {
                const isChecked = selectedClassIds.includes(cls.id)
                const isMatchedWithSelectedTemplate = cls.template_id === selectedTemplateId
                const isUnassigned = !cls.template_id

                return (
                  <div
                    key={cls.id}
                    onClick={() => toggleSelectClass(cls.id)}
                    className={`px-2 py-2 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between gap-1.5 text-xs ${
                      isMatchedWithSelectedTemplate
                        ? 'border-emerald-500 bg-emerald-100/80 shadow-xs ring-1 ring-emerald-500/40'
                        : isChecked
                        ? 'border-slate-500 bg-slate-100 ring-1 ring-slate-400'
                        : isUnassigned
                        ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-100/60'
                        : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer accent-emerald-600 shrink-0"
                        />
                        <span className={`font-black text-xs shrink-0 ${isMatchedWithSelectedTemplate ? 'text-emerald-950' : 'text-slate-900'}`}>
                          {cls.code}
                        </span>
                      </div>

                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 leading-none ${
                        isMatchedWithSelectedTemplate
                          ? 'bg-emerald-700 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {cls.subject}
                      </span>
                    </div>

                    {/* BADGE TRẠNG THÁI GÁN PPCT */}
                    <div className="text-[10px] font-semibold">
                      {isUnassigned ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-black">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          Chưa gán PPCT
                        </span>
                      ) : (
                        <span className="text-slate-500 truncate block">
                          {templates.find((t) => t.id === cls.template_id)?.title || 'Đã gán khung'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL XEM TRƯỚC BÀI DẠY */}
      {showPreviewModal && selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 space-y-3 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Khung: {selectedTemplate.title}
                </h2>
                <span className="text-[11px] text-slate-500">
                  Môn {selectedTemplate.subject} — {previewLessons.length} tiết
                </span>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="border rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b sticky top-0 uppercase tracking-wider">
                  <tr>
                    <th className="p-2 border-r text-center w-16">Tiết</th>
                    <th className="p-2">Tên bài học theo PPCT</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {previewLessons.map((l) => (
                    <tr key={l.lesson_order} className="hover:bg-slate-50">
                      <td className="p-2 border-r text-center font-black text-blue-700 bg-slate-50/40 w-16">
                        {l.lesson_order}
                      </td>
                      <td className="p-2 font-bold text-slate-900">{l.lesson_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-1 border-t">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TẢI FILE EXCEL PPCT MỚI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="text-sm font-bold text-slate-900">Tải Lên Khung PPCT Mới</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Tên khung PPCT:</label>
                <input
                  type="text"
                  placeholder="vd: Toán 10 (Cơ bản), GDĐP 11..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Môn học:</label>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Khối:</label>
                  <select
                    value={newGrade}
                    onChange={(e) => setNewGrade(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border rounded-xl font-bold bg-white"
                  >
                    <option value={10}>Khối 10</option>
                    <option value={11}>Khối 11</option>
                    <option value={12}>Khối 12</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Chọn file Excel (.xlsx, .xls):</label>
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-4 text-center transition cursor-pointer bg-slate-50/50 hover:bg-emerald-50/20 relative">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
                  <span className="font-bold text-slate-700 block text-xs">
                    {fileName ? fileName : 'Chọn file Excel PPCT'}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Hỗ trợ: <strong>5-Jan, 10-Jun</strong>, <strong>18-22</strong>, và <strong>1, 2, 3</strong>
                  </span>
                </div>
              </div>

              {fileLessons.length > 0 && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Đã nhận diện: <strong>{fileLessons.length} tiết bài dạy</strong></span>
                  </div>
                  <span className="font-semibold text-emerald-700">Hợp lệ</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveNewTemplate}
                disabled={uploading || fileLessons.length === 0}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                {uploading ? 'Đang lưu...' : 'Lưu Khung'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}