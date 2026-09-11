'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from 'docx'
import { 
  Calendar, 
  RefreshCw, 
  ArrowLeftRight, 
  X, 
  RotateCcw, 
  FileText, 
  Download,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface ClassItem {
  id: string
  code: string
  name: string
  subject: string
  grade?: number
  template_id?: string | null
}

interface ScheduleEntry {
  id: string
  day_of_week: number
  period_number: number
  class_id?: string
  session: string
  week_number?: number
  is_substitute?: boolean
  sub_class_code?: string
  sub_subject?: string
  sub_teacher_name?: string
  sub_lesson_order?: number
  sub_lesson_name?: string
  classes?: ClassItem
}

interface CurriculumTemplate {
  id: string
  title: string
  subject: string
  grade: number
  total_lessons?: number
}

interface CurriculumItem {
  id?: string
  class_id?: string
  template_id?: string
  lesson_order: number
  lesson_name: string
}

interface LessonOverride {
  id: string
  class_id: string
  week_number: number
  slot_order_in_week: number
  override_lesson_order: number
}

const START_DATE_WEEK_1 = new Date(2026, 8, 7, 0, 0, 0) // 07/09/2026

const DAYS = [
  { id: 2, name: 'Thứ Hai', short: 'T2', offset: 0 },
  { id: 3, name: 'Thứ Ba', short: 'T3', offset: 1 },
  { id: 4, name: 'Thứ Tư', short: 'T4', offset: 2 },
  { id: 5, name: 'Thứ Năm', short: 'T5', offset: 3 },
  { id: 6, name: 'Thứ Sáu', short: 'T6', offset: 4 },
  { id: 7, name: 'Thứ Bảy', short: 'T7', offset: 5 },
]

const getSubjectType = (raw?: string): 'TOAN' | 'TRN' | 'GDDP' | 'OTHER' => {
  if (!raw) return 'OTHER'
  const s = raw.trim().toLowerCase()
  if (s === 't' || s.includes('toán')) return 'TOAN'
  if (s === 'trn' || s.includes('hđtn') || s.includes('trải nghiệm')) return 'TRN'
  if (s === 'gdđp' || s.includes('địa phương')) return 'GDDP'
  return 'OTHER'
}

const extractGradeFromCode = (code?: string, defaultGrade?: number): number => {
  if (code) {
    const trimmed = code.trim()
    if (trimmed.startsWith('10')) return 10
    if (trimmed.startsWith('11')) return 11
    if (trimmed.startsWith('12')) return 12
  }
  if (defaultGrade && defaultGrade >= 10 && defaultGrade <= 12) return defaultGrade
  return 12
}

export default function ReportsPage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [overrides, setOverrides] = useState<LessonOverride[]>([])
  const [loading, setLoading] = useState(false)
  const [exportingWord, setExportingWord] = useState(false)

  const [editingSlot, setEditingSlot] = useState<{
    entry: ScheduleEntry
    slotOrderInWeek: number
    currentLessonOrder: number
    isOverridden: boolean
  } | null>(null)
  const [targetLessonOrder, setTargetLessonOrder] = useState<number>(1)

  const getFormattedDate = (offset: number) => {
    const d = new Date(START_DATE_WEEK_1)
    d.setDate(d.getDate() + (selectedWeek - 1) * 7 + offset)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  const getWeekRangeString = () => {
    const start = new Date(START_DATE_WEEK_1)
    start.setDate(start.getDate() + (selectedWeek - 1) * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 5)
    return `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')} - ${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`
  }

  const loadData = async () => {
    setLoading(true)

    const { data: cData } = await supabase.from('classes').select('*')
    if (cData) setClasses(cData)

    const { data: tData } = await supabase.from('curriculum_templates').select('*')
    if (tData) setTemplates(tData)

    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('id, day_of_week, period_number, session, class_id, week_number, is_substitute, sub_class_code, sub_subject, sub_teacher_name, sub_lesson_order, sub_lesson_name, classes(*)')
    if (sData) setSchedule(sData as any)

    const { data: currData } = await supabase.from('curriculum_items').select('*')
    if (currData) {
      const normalized = currData.map((item: any) => ({
        id: item.id,
        class_id: item.class_id,
        template_id: item.template_id,
        lesson_order: Number(item.lesson_order ?? item.order_number ?? 1),
        lesson_name: item.lesson_name || item.title || '',
      }))
      setCurriculum(normalized)
    }

    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const calculateReportRows = () => {
    const mainSchedule = schedule.filter((s) => !s.is_substitute && (s.week_number === 0 || !s.week_number))

    const sortedSchedule = [...mainSchedule].sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
      return a.period_number - b.period_number
    })

    const groupMap = new Map<string, ScheduleEntry[]>()
    sortedSchedule.forEach((slot) => {
      const code = slot.classes?.code || ''
      const subType = getSubjectType(slot.classes?.subject)
      const groupKey = `${code}__${subType}`

      if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
      groupMap.get(groupKey)!.push(slot)
    })

    const lessonMap: Record<string, { order: number; name: string; isOverridden: boolean; slotOrderInWeek: number }> = {}

    groupMap.forEach((classSlots, groupKey) => {
      const [clsCode, subType] = groupKey.split('__')
      const firstSlot = classSlots[0]
      const actualClass = classes.find(
        (c) => c.code === clsCode && getSubjectType(c.subject) === subType
      ) || firstSlot.classes

      const grade = extractGradeFromCode(clsCode, actualClass?.grade)
      let validLessons: CurriculumItem[] = []

      if (actualClass?.template_id) {
        const tpl = templates.find((t) => t.id === actualClass.template_id)
        if (tpl && getSubjectType(tpl.subject) === subType && tpl.grade === grade) {
          validLessons = curriculum.filter((c) => c.template_id === actualClass.template_id)
        }
      }

      if (validLessons.length === 0 && actualClass?.id) {
        const direct = curriculum.filter((c) => c.class_id === actualClass.id)
        if (direct.length > 0) validLessons = direct
      }

      if (validLessons.length === 0) {
        const matchedTemplate = templates.find(
          (t) => getSubjectType(t.subject) === subType && t.grade === grade
        )
        if (matchedTemplate) {
          validLessons = curriculum.filter((c) => c.template_id === matchedTemplate.id)
        }
      }

      validLessons.sort((a, b) => a.lesson_order - b.lesson_order)
      const periodsPerWeek = classSlots.length
      if (periodsPerWeek === 0) return

      const taughtLessons = new Set<number>()

      for (let w = 1; w <= selectedWeek; w++) {
        for (let sIdx = 0; sIdx < periodsPerWeek; sIdx++) {
          const slot = classSlots[sIdx]
          const ovr = actualClass
            ? overrides.find(
                (o) => o.class_id === actualClass.id && o.week_number === w && o.slot_order_in_week === sIdx
              )
            : undefined

          let assignedOrder: number
          if (ovr) {
            assignedOrder = ovr.override_lesson_order
          } else {
            if (validLessons.length > 0) {
              const nextAvail = validLessons.find((l) => !taughtLessons.has(l.lesson_order))
              assignedOrder = nextAvail ? nextAvail.lesson_order : validLessons.length + 1
            } else {
              assignedOrder = (w - 1) * periodsPerWeek + (sIdx + 1)
            }
          }

          taughtLessons.add(assignedOrder)

          if (w === selectedWeek) {
            const foundItem = validLessons.find((l) => l.lesson_order === assignedOrder)
            const mapKey = `${slot.day_of_week}_${slot.period_number}`
            lessonMap[mapKey] = {
              order: assignedOrder,
              name: foundItem ? foundItem.lesson_name : '',
              isOverridden: !!ovr,
              slotOrderInWeek: sIdx,
            }
          }
        }
      }
    })

    const weekRows: { day: typeof DAYS[0]; slots: any[] }[] = []

    DAYS.forEach((day) => {
      const daySlots: any[] = []

      for (let p = 1; p <= 5; p++) {
        const subEntry = schedule.find(
          (s) => s.day_of_week === day.id && s.period_number === p && s.is_substitute && s.week_number === selectedWeek
        )

        if (subEntry) {
          daySlots.push({
            entry: subEntry,
            day: day.id,
            period: p,
            subject: subEntry.sub_subject || 'Dạy thay',
            classCode: subEntry.sub_class_code || '',
            subjectClass: `${subEntry.sub_subject || 'Dạy thay'} - ${subEntry.sub_class_code}`,
            lessonOrder: subEntry.sub_lesson_order || 1,
            lessonName: subEntry.sub_lesson_name || '',
            isSubstitute: true,
            subTeacher: subEntry.sub_teacher_name,
            isOverridden: false,
            slotOrderInWeek: 0,
          })
          continue
        }

        const weekOnlyEntry = schedule.find(
          (s) => s.day_of_week === day.id && s.period_number === p && !s.is_substitute && s.week_number === selectedWeek
        )

        const defaultEntry = weekOnlyEntry || schedule.find(
          (s) => s.day_of_week === day.id && s.period_number === p && (!s.is_substitute || s.is_substitute === false) && (s.week_number === 0 || !s.week_number)
        )

        if (defaultEntry) {
          const info = lessonMap[`${day.id}_${p}`]
          const subject = defaultEntry.classes?.subject || 'Toán'
          const code = defaultEntry.classes?.code || ''

          daySlots.push({
            entry: defaultEntry,
            day: day.id,
            period: p,
            subject,
            classCode: code,
            subjectClass: `${subject} - ${code}`,
            lessonOrder: info ? info.order : '—',
            lessonName: info?.name || '',
            isSubstitute: false,
            isOverridden: info?.isOverridden || false,
            slotOrderInWeek: info?.slotOrderInWeek ?? 0,
          })
        }
      }

      if (daySlots.length > 0) {
        weekRows.push({
          day,
          slots: daySlots,
        })
      }
    })

    return weekRows
  }

  const reportData = calculateReportRows()
  const totalSlotsCount = reportData.reduce((acc, curr) => acc + curr.slots.length, 0)

  // XUẤT WORD CHUẨN MẪU C2
  const handleExportWord = async () => {
    if (reportData.length === 0) {
      alert('Tuần này chưa có tiết dạy để xuất!')
      return
    }

    setExportingWord(true)
    try {
      const tableRows: TableRow[] = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Thứ, ngày', bold: true, size: 21 })] })],
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Môn - Lớp', bold: true, size: 21 })] })],
            }),
            new TableCell({
              width: { size: 12, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tiết theo TKB', bold: true, size: 21 })] })],
            }),
            new TableCell({
              width: { size: 36, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tên bài dạy', bold: true, size: 21 })] })],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tiết theo CT', bold: true, size: 21 })] })],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Ghi chú', bold: true, size: 21 })] })],
            }),
          ],
        }),
      ]

      reportData.forEach((group) => {
        const dayName = group.day.name
        const dayDate = getFormattedDate(group.day.offset)

        group.slots.forEach((slot, sIdx) => {
          const isFirstSlot = sIdx === 0
          const rowCells: TableCell[] = []

          if (isFirstSlot) {
            rowCells.push(
              new TableCell({
                rowSpan: group.slots.length,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: dayName, bold: true, size: 21 })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: dayDate, italics: true, size: 19 })],
                  }),
                ],
              })
            )
          }

          let noteText = ''
          if (slot.isSubstitute) noteText = `Dạy thay ${slot.subTeacher ? `(${slot.subTeacher})` : ''}`
          else if (slot.isOverridden) noteText = 'Đã đảo tiết'

          rowCells.push(
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: slot.subjectClass, size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(slot.period), size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: slot.lessonName || '', size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(slot.lessonOrder), size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: noteText, italics: true, size: 18 })] })],
            })
          )

          tableRows.push(new TableRow({ children: rowCells }))
        })
      })

      const startDateObj = new Date(START_DATE_WEEK_1)
      startDateObj.setDate(startDateObj.getDate() + (selectedWeek - 1) * 7)
      const fromD = startDateObj.getDate()
      const fromM = startDateObj.getMonth() + 1
      const fromY = startDateObj.getFullYear()

      const endDateObj = new Date(startDateObj)
      endDateObj.setDate(endDateObj.getDate() + 5)
      const toD = endDateObj.getDate()
      const toM = endDateObj.getMonth() + 1
      const toY = endDateObj.getFullYear()

      const doc = new Document({
        sections: [
          {
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideHorizontal: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 52, type: WidthType.PERCENTAGE },
                        children: [
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'SỞ GD&ĐT PHÚ THỌ', size: 19 })] }),
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'TRƯỜNG THPT CHUYÊN HOÀNG VĂN THỤ', bold: true, size: 19 })] }),
                        ],
                      }),
                      new TableCell({
                        width: { size: 48, type: WidthType.PERCENTAGE },
                        children: [
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 19 })] }),
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Độc lập - Tự do - Hạnh phúc', bold: true, size: 19, underline: {} })] }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),

              new Paragraph({ text: '', spacing: { before: 180 } }),

              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `PHIẾU BÁO GIẢNG TUẦN ${selectedWeek < 10 ? '0' + selectedWeek : selectedWeek}`, bold: true, size: 26 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `(Từ ngày ${fromD < 10 ? '0' + fromD : fromD} tháng ${fromM < 10 ? '0' + fromM : fromM} đến ngày ${toD < 10 ? '0' + toD : toD} tháng ${toM < 10 ? '0' + toM : toM} năm ${toY})`,
                    italics: true,
                    size: 20,
                  }),
                ],
              }),

              new Paragraph({ text: '', spacing: { before: 180 } }),

              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: tableRows,
              }),
            ],
          },
        ],
      })

      const blob = await Packer.toBlob(doc)
      saveAs(blob, `Phieu_Bao_Giang_Tuan_${selectedWeek}.docx`)
    } catch (err: any) {
      alert('Lỗi xuất Word: ' + err.message)
    } finally {
      setExportingWord(false)
    }
  }

  // XUẤT EXCEL
  const handleExportExcel = () => {
    if (reportData.length === 0) {
      alert('Tuần này chưa có tiết dạy để xuất!')
      return
    }

    const exportRows: any[] = []
    reportData.forEach((group) => {
      group.slots.forEach((slot) => {
        let noteText = ''
        if (slot.isSubstitute) noteText = `Dạy thay ${slot.subTeacher ? `(${slot.subTeacher})` : ''}`
        else if (slot.isOverridden) noteText = 'Đã đảo tiết'

        exportRows.push({
          'Thứ, ngày': `${group.day.name} (${getFormattedDate(group.day.offset)})`,
          'Môn - Lớp': slot.subjectClass,
          'Tiết theo TKB': slot.period,
          'Tên bài dạy theo PPCT': slot.lessonName || '',
          'Tiết theo CT': slot.lessonOrder,
          'Ghi chú': noteText,
        })
      })
    })

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `Tuan_${selectedWeek}`)
    XLSX.writeFile(workbook, `Phieu_Bao_Giang_Tuan_${selectedWeek}.xlsx`)
  }

  const handleSaveOverride = async () => {
    if (!editingSlot) return
    setLoading(true)

    if (editingSlot.entry.is_substitute) {
      await supabase
        .from('schedule_entries')
        .update({ sub_lesson_order: Number(targetLessonOrder) })
        .eq('id', editingSlot.entry.id)
    } else {
      await supabase.from('lesson_overrides').upsert(
        {
          class_id: editingSlot.entry.class_id,
          week_number: selectedWeek,
          slot_order_in_week: editingSlot.slotOrderInWeek,
          override_lesson_order: Number(targetLessonOrder),
        },
        { onConflict: 'class_id,week_number,slot_order_in_week' }
      )
    }

    setEditingSlot(null)
    await loadData()
  }

  const handleResetOverride = async () => {
    if (!editingSlot || editingSlot.entry.is_substitute) return
    setLoading(true)

    await supabase
      .from('lesson_overrides')
      .delete()
      .eq('class_id', editingSlot.entry.class_id)
      .eq('week_number', selectedWeek)
      .eq('slot_order_in_week', editingSlot.slotOrderInWeek)

    setEditingSlot(null)
    await loadData()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-3 font-sans pb-8">
      {/* THANH ĐIỀU HƯỚNG TUẦN VÀ XUẤT BÁO CÁO NHẸ NHÀNG */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* NÚT LÙI / TIẾN TUẦN NHANH */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))}
              disabled={selectedWeek <= 1}
              className="p-1.5 rounded-lg border bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="font-black text-emerald-900 bg-transparent text-xs focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    Tuần {w < 10 ? '0' + w : w}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setSelectedWeek((w) => Math.min(35, w + 1))}
              disabled={selectedWeek >= 35}
              className="p-1.5 rounded-lg border bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* SỐ TIẾT TRONG TUẦN */}
          <span className="text-[11px] font-bold text-slate-500">
            {totalSlotsCount} tiết dạy
          </span>
        </div>

        {/* THÔNG TIN KHOẢNG NGÀY & NÚT XUẤT */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-2">
          <span className="text-[11px] text-slate-500 font-medium">
            Áp dụng: <strong className="text-slate-700">{getWeekRangeString()}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportWord}
              disabled={exportingWord || loading}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3 h-3" />
              <span>{exportingWord ? 'Đang xuất...' : 'Word'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              <span>Excel</span>
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-1 border rounded-lg hover:bg-slate-50 text-slate-500"
              title="Làm mới"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ================= GIAO DIỆN DI ĐỘNG: KHỚP 100% BỀ NGANG, GỌN ĐẸP ================= */}
      <div className="block md:hidden space-y-2.5">
        {reportData.length === 0 ? (
          <div className="bg-white p-8 text-center text-slate-400 rounded-2xl border text-xs">
            Tuần này chưa có tiết dạy nào trên Thời khóa biểu.
          </div>
        ) : (
          reportData.map((group) => (
            <div key={group.day.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              {/* THANH TIÊU ĐỀ THỨ VÀ NGÀY */}
              <div className="bg-[#f1f5f9] px-3 py-1.5 border-b border-slate-200 flex justify-between items-center">
                <span className="font-black text-xs text-slate-800 tracking-wide uppercase">
                  {group.day.name}
                </span>
                <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {getFormattedDate(group.day.offset)}
                </span>
              </div>

              {/* DANH SÁCH CÁC TIẾT TRONG NGÀY */}
              <div className="divide-y divide-slate-100 text-xs">
                {group.slots.map((slot: any) => {
                  const hasLesson = slot.lessonName && slot.lessonName.trim() !== ''

                  return (
                    <div key={`${slot.day}_${slot.period}`} className="p-2.5 space-y-1.5">
                      {/* DÒNG 1: TIẾT TKB + MÔN LỚP + NÚT ĐIỀU CHỈNH TIẾT */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 font-black text-[11px] flex items-center justify-center border border-slate-200">
                            {slot.period}
                          </span>
                          <span className="font-black text-xs text-slate-900">
                            {slot.classCode}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {slot.subject === 'Toán' ? 'Toán' : slot.subject}
                          </span>
                        </div>

                        {/* NÚT BẤM ĐẢO TIẾT */}
                        <button
                          onClick={() => {
                            setEditingSlot({
                              entry: slot.entry,
                              slotOrderInWeek: slot.slotOrderInWeek,
                              currentLessonOrder: Number(slot.lessonOrder) || 1,
                              isOverridden: slot.isOverridden,
                            })
                            setTargetLessonOrder(Number(slot.lessonOrder) || 1)
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1 cursor-pointer transition ${
                            slot.isOverridden
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          <span>Tiết {slot.lessonOrder}</span>
                          <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      </div>

                      {/* DÒNG 2: TÊN BÀI DẠY */}
                      <div className="pl-6.5 text-[11px] leading-snug">
                        {hasLesson ? (
                          <span className="text-slate-800 font-semibold">{slot.lessonName}</span>
                        ) : (
                          <Link
                            href="/dashboard/curriculum"
                            className="inline-flex items-center gap-1 text-amber-700 font-bold hover:underline"
                          >
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>Chưa có bài dạy (Bấm để gán PPCT)</span>
                          </Link>
                        )}
                      </div>

                      {/* DÒNG 3: HUY HIỆU DẠY THAY / ĐÃ ĐẢO TIẾT NẾU CÓ */}
                      {(slot.isSubstitute || slot.isOverridden) && (
                        <div className="pl-6.5">
                          {slot.isSubstitute ? (
                            <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                              Dạy thay {slot.subTeacher ? `(${slot.subTeacher})` : ''}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              Đã đảo tiết
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ================= GIAO DIỆN LAPTOP: BẢNG 6 CỘT CHUẨN C2 ================= */}
      <div className="hidden md:block bg-white rounded-2xl border shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b uppercase tracking-wider">
              <tr>
                <th className="p-2.5 border-r text-center w-28">Thứ, ngày</th>
                <th className="p-2.5 border-r text-center w-36">Môn - Lớp</th>
                <th className="p-2.5 border-r text-center w-20">Tiết TKB</th>
                <th className="p-2.5 border-r">Tên bài dạy theo PPCT</th>
                <th className="p-2.5 border-r text-center w-24">Tiết theo CT</th>
                <th className="p-2.5 text-center w-28">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {reportData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    Tuần này chưa có tiết dạy nào được xếp trong Thời khóa biểu.
                  </td>
                </tr>
              ) : (
                reportData.map((group) => {
                  return group.slots.map((slot: any, idx: number) => {
                    const isFirst = idx === 0
                    const hasLesson = slot.lessonName && slot.lessonName.trim() !== ''

                    return (
                      <tr key={`${slot.day}_${slot.period}`} className="hover:bg-slate-50/80 transition">
                        {isFirst && (
                          <td
                            rowSpan={group.slots.length}
                            className="p-3 border-r text-center font-black text-slate-800 bg-slate-50/50 align-middle"
                          >
                            <span className="text-sm font-black text-slate-900 block">
                              {group.day.name}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block mt-1">
                              {getFormattedDate(group.day.offset)}
                            </span>
                          </td>
                        )}

                        <td className="p-2.5 border-r text-center font-black text-slate-900">
                          {slot.subjectClass}
                        </td>

                        <td className="p-2.5 border-r text-center font-black text-emerald-700">
                          {slot.period}
                        </td>

                        <td className="p-2.5 border-r font-medium">
                          {hasLesson ? (
                            <span className="text-slate-900 font-bold">{slot.lessonName}</span>
                          ) : (
                            <Link
                              href="/dashboard/curriculum"
                              className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-1 rounded-md transition font-semibold"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Chưa có PPCT — Bấm để gán</span>
                            </Link>
                          )}
                        </td>

                        <td className="p-2.5 border-r text-center font-black">
                          <button
                            onClick={() => {
                              setEditingSlot({
                                entry: slot.entry,
                                slotOrderInWeek: slot.slotOrderInWeek,
                                currentLessonOrder: Number(slot.lessonOrder) || 1,
                                isOverridden: slot.isOverridden,
                              })
                              setTargetLessonOrder(Number(slot.lessonOrder) || 1)
                            }}
                            className={`px-2 py-0.5 rounded-md inline-flex items-center gap-1 hover:ring-2 hover:ring-blue-400 transition cursor-pointer ${
                              slot.isOverridden
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'text-blue-700 bg-blue-50 border border-blue-200'
                            }`}
                          >
                            <span>{slot.lessonOrder}</span>
                            <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        </td>

                        <td className="p-2.5 text-center">
                          {slot.isSubstitute ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                              Dạy thay {slot.subTeacher ? `(${slot.subTeacher})` : ''}
                            </span>
                          ) : slot.isOverridden ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Đã đảo tiết
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
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

      {/* POPUP ĐIỀU CHỈNH TIẾT PPCT */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 space-y-3 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-bold text-slate-800 text-xs uppercase">
                Điều chỉnh số tiết PPCT
              </span>
              <button onClick={() => setEditingSlot(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Hiện tại:</span>
                <span className="font-bold text-slate-800">Tiết {editingSlot.currentLessonOrder}</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={150}
                  value={targetLessonOrder}
                  onChange={(e) => setTargetLessonOrder(Number(e.target.value))}
                  className="w-20 p-2 border rounded-xl font-black text-center text-blue-800 text-base focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveOverride}
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Lưu
                </button>
                {editingSlot.isOverridden && !editingSlot.entry.is_substitute && (
                  <button
                    onClick={handleResetOverride}
                    disabled={loading}
                    title="Về tiến độ gốc"
                    className="p-2 border rounded-xl hover:bg-slate-50 text-slate-600 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}