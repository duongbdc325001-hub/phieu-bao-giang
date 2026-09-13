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
  VerticalAlign,
  BorderStyle,
} from 'docx'
import { Calendar, RefreshCw, ArrowLeftRight, X, FileText, Download, AlertCircle, CheckCircle2 } from 'lucide-react'

const START_DATE_WEEK_1 = new Date(2026, 8, 7, 0, 0, 0) // 07/09/2026

const DAYS = [
  { id: 2, name: 'Thứ Hai', offset: 0 },
  { id: 3, name: 'Thứ Ba', offset: 1 },
  { id: 4, name: 'Thứ Tư', offset: 2 },
  { id: 5, name: 'Thứ Năm', offset: 3 },
  { id: 6, name: 'Thứ Sáu', offset: 4 },
  { id: 7, name: 'Thứ Bảy', offset: 5 },
]

export default function ReportsPage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [schedule, setSchedule] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [curriculum, setCurriculum] = useState<any[]>([])
  const [classCurriculums, setClassCurriculums] = useState<any[]>([])
  const [curriculumItems, setCurriculumItems] = useState<any[]>([])
  const [overrides, setOverrides] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [exportingWord, setExportingWord] = useState(false)

  // State popup chỉnh sửa tiết CT (Đảo tiết & Bỏ qua tiết)
  const [editingSlot, setEditingSlot] = useState<{
    realClassId: string
    slotIdx: number
    currentOrder: number
    isOverridden: boolean
    isSkipped: boolean
  } | null>(null)
  const [targetLessonOrder, setTargetLessonOrder] = useState<number>(1)
  const [isSkippedSlot, setIsSkippedSlot] = useState<boolean>(false)

  const getFormattedDate = (offset: number) => {
    const d = new Date(START_DATE_WEEK_1)
    d.setDate(d.getDate() + (selectedWeek - 1) * 7 + offset)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  const loadData = async () => {
    setLoading(true)

    const { data: cData } = await supabase.from('classes').select('*')
    if (cData) setClasses(cData)

    const { data: sData } = await supabase.from('schedule_entries').select('*')
    if (sData) setSchedule(sData)

    const { data: currData } = await supabase.from('curriculums').select('*')
    if (currData) setCurriculum(currData)

    const { data: ccData } = await supabase.from('class_curriculums').select('*')
    if (ccData) setClassCurriculums(ccData)

    const { data: itemsData } = await supabase.from('curriculum_items').select('*')
    if (itemsData) setCurriculumItems(itemsData)

    const { data: ovrData } = await supabase.from('lesson_overrides').select('*')
    if (ovrData) setOverrides(ovrData)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Thuật toán ánh xạ thông minh: Phân tách độc lập tiến độ theo từng Môn và từng Lớp
  const calculateReportRows = () => {
    if (schedule.length === 0) return []

    const week1Slots = schedule.filter((s) => Number(s.week_number || 1) === 1 && !s.is_substitute)

    const allActiveWeeksSlots: any[] = []
    for (let w = 1; w <= selectedWeek; w++) {
      let wSlots = schedule.filter((s) => Number(s.week_number || 1) === w && !s.is_substitute)
      if (wSlots.length === 0 && w > 1) {
        wSlots = week1Slots.map((slot) => ({
          ...slot,
          week_number: w,
        }))
      }
      wSlots.sort((a, b) => {
        const d1 = Number(a.day_of_week || 2)
        const d2 = Number(b.day_of_week || 2)
        if (d1 !== d2) return d1 - d2
        return Number(a.period_number || 1) - Number(b.period_number || 1)
      })
      allActiveWeeksSlots.push(...wSlots)
    }

    // Phân tách nhóm theo từng (Lớp + Môn) độc lập tuyệt đối
    const classSlotsMap = new Map<string, any[]>()
    allActiveWeeksSlots.forEach((slot) => {
      const classCode = (slot.sub_class_code || '').trim().toUpperCase()
      const subject = (slot.sub_subject || 'Toán').trim()
      const key = `${classCode}_${subject}`

      if (!classSlotsMap.has(key)) classSlotsMap.set(key, [])
      classSlotsMap.get(key)!.push(slot)
    })

    const lessonMapping = new Map<string, { order: number; name: string; isOverridden: boolean; isSkipped: boolean; slotIdx: number }>()

    classSlotsMap.forEach((slots, classKey) => {
      let templateId: string | null = null
      const classCodeOnly = classKey.split('_')[0]
      
      const matchedClassRel = classCurriculums.find(
        (cc) => cc.class_id === classKey || cc.class_id === slots[0]?.class_id || cc.class_id === classCodeOnly
      )
      if (matchedClassRel) {
        templateId = matchedClassRel.template_id || matchedClassRel.curriculum_id
      } else {
        const cls = classes.find(
          (c) => c.id === slots[0]?.class_id || c.code === classCodeOnly
        )
        if (cls?.template_id) templateId = cls.template_id
      }

      let lessons: any[] = []
      if (templateId) {
        lessons = curriculumItems.filter((item) => item.template_id === templateId)
      }
      
      if (lessons.length === 0) {
        lessons = curriculumItems.filter((item) => item.class_id === slots[0]?.class_id)
      }

      lessons.sort((a, b) => Number(a.lesson_order || 1) - Number(b.lesson_order || 1))

      const weekSlotCounters = new Map<number, number>()
      let lessonPointer = 0

      slots.forEach((slot) => {
        const weekNum = Number(slot.week_number || 1)
        const day = Number(slot.day_of_week || 2)
        const period = Number(slot.period_number || 1)
        const realCId = slot.class_id || classKey

        if (!weekSlotCounters.has(weekNum)) {
          weekSlotCounters.set(weekNum, 0)
        }
        const currentWeekSlotIdx = weekSlotCounters.get(weekNum)!

        const ovr = overrides.find(
          (o) => (o.class_id === realCId || o.class_id === classKey) && Number(o.week_number) === weekNum && Number(o.slot_order_in_week) === currentWeekSlotIdx
        )

        const isSkipped = ovr ? (ovr as any).is_skipped === true : false
        let assignedOrder = lessonPointer + 1

        if (ovr && !isSkipped && (ovr as any).override_lesson_order) {
          assignedOrder = Number((ovr as any).override_lesson_order)
        }

        let foundLesson = null
        if (!isSkipped && lessons.length > 0) {
          foundLesson = lessons.find((l) => Number(l.lesson_order) === assignedOrder) || lessons[lessonPointer]
        }

        const mapKey = `${weekNum}_${day}_${period}_${classKey}`
        lessonMapping.set(mapKey, {
          order: isSkipped ? 0 : (foundLesson ? Number(foundLesson.lesson_order || assignedOrder) : assignedOrder),
          name: isSkipped ? '(Nghỉ / Bỏ qua tiết)' : (foundLesson ? foundLesson.lesson_name : ''),
          isOverridden: !!ovr && !isSkipped,
          isSkipped: isSkipped,
          slotIdx: currentWeekSlotIdx,
        })

        weekSlotCounters.set(weekNum, currentWeekSlotIdx + 1)
        
        if (!isSkipped) {
          lessonPointer++
        }
      })
    })

    let currentWeekSlots = schedule.filter((s) => Number(s.week_number || 1) === Number(selectedWeek) && !s.is_substitute)
    if (currentWeekSlots.length === 0 && Number(selectedWeek) > 1) {
      currentWeekSlots = week1Slots.map((slot) => ({
        ...slot,
        week_number: Number(selectedWeek),
      }))
    }

    if (currentWeekSlots.length === 0) {
      return []
    }

    const weekRows: { day: typeof DAYS[0]; slots: any[] }[] = []

    DAYS.forEach((day) => {
      const daySlots: any[] = []

      for (let p = 1; p <= 5; p++) {
        const matchedSlot = currentWeekSlots.find(
          (s) => Number(s.day_of_week) === day.id && Number(s.period_number) === p
        )

        if (matchedSlot) {
          const classCode = (matchedSlot.sub_class_code || '').trim().toUpperCase()
          const subject = (matchedSlot.sub_subject || 'Toán').trim()
          const classKey = `${classCode}_${subject}`
          const realCId = matchedSlot.class_id || classKey

          const activeWeek = Number(selectedWeek)
          const mapKey = `${activeWeek}_${day.id}_${p}_${classKey}`
          const lessonInfo = lessonMapping.get(mapKey) || { order: 1, name: '', isOverridden: false, isSkipped: false, slotIdx: 0 }

          daySlots.push({
            entry: matchedSlot,
            day: day.id,
            period: p,
            realClassId: realCId,
            subjectClass: `${matchedSlot.sub_subject || 'Toán'} - ${matchedSlot.sub_class_code || 'Lớp'}`,
            lessonOrder: lessonInfo.order,
            lessonName: lessonInfo.name,
            isSubstitute: matchedSlot.is_substitute || false,
            isOverridden: lessonInfo.isOverridden,
            isSkipped: lessonInfo.isSkipped,
            slotOrderInWeek: lessonInfo.slotIdx,
          })
        }
      }

      if (daySlots.length > 0) {
        weekRows.push({ day, slots: daySlots })
      }
    })

    return weekRows
  }

  const reportData = calculateReportRows()
  const totalSlotsCount = reportData.reduce((acc, curr) => acc + curr.slots.length, 0)

  // Hàm lưu thay đổi tiết CT chuẩn chỉnh theo kiến trúc UUID quan hệ
  const handleSaveOverride = async (skipStatus?: boolean) => {
    if (!editingSlot) return
    setLoading(true)

    try {
      const targetClassId = editingSlot.realClassId
      const skipVal = skipStatus !== undefined ? skipStatus : isSkippedSlot

      const { error } = await supabase.from('lesson_overrides').upsert(
        {
          class_id: targetClassId,
          week_number: Number(selectedWeek),
          slot_order_in_week: Number(editingSlot.slotIdx),
          override_lesson_order: Number(targetLessonOrder),
          is_skipped: skipVal,
        },
        { onConflict: 'class_id,week_number,slot_order_in_week' }
      )

      if (error) throw error

      setEditingSlot(null)
      await loadData()
    } catch (err: any) {
      alert('Lỗi khi lưu thay đổi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

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
            new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Thứ, ngày', bold: true, size: 21 })] })] }),
            new TableCell({ width: { size: 18, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Môn - Lớp', bold: true, size: 21 })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tiết TKB', bold: true, size: 21 })] })] }),
            new TableCell({ width: { size: 36, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tên bài dạy', bold: true, size: 21 })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tiết CT', bold: true, size: 21 })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Ghi chú', bold: true, size: 21 })] })] }),
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
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dayName, bold: true, size: 21 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dayDate, italics: true, size: 19 })] }),
                ],
              })
            )
          }

          let noteText = slot.isSkipped ? 'Bỏ qua' : (slot.isOverridden ? 'Đảo tiết' : '')
          let lessonDisplay = slot.isSkipped ? '(Nghỉ / Bỏ qua tiết)' : (slot.lessonName || '')
          let orderDisplay = slot.isSkipped ? '—' : String(slot.lessonOrder)

          rowCells.push(
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: slot.subjectClass, size: 20 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(slot.period), size: 20 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: lessonDisplay, size: 20 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: orderDisplay, size: 20 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: noteText, italics: true, size: 18 })] })] })
          )

          tableRows.push(new TableRow({ children: rowCells }))
        })
      })

      const invisibleBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' }
      const noBorders = { top: invisibleBorder, bottom: invisibleBorder, left: invisibleBorder, right: invisibleBorder }

      const doc = new Document({
        sections: [
          {
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 45, type: WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: [
                          new Paragraph({ children: [new TextRun({ text: 'SỞ GD&ĐT PHÚ THỌ', bold: true, size: 20 })] }),
                          new Paragraph({ children: [new TextRun({ text: 'TRƯỜNG THPT CHUYÊN HOÀNG VĂN THỤ', bold: true, size: 20 })] }),
                        ],
                      }),
                      new TableCell({
                        width: { size: 55, type: WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: [
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 20 })] }),
                          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Độc lập - Tự do - Hạnh phúc', bold: true, size: 21 })] }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),

              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 60 },
                children: [new TextRun({ text: `PHIẾU BÁO GIẢNG TUẦN ${selectedWeek < 10 ? '0' + selectedWeek : selectedWeek}`, bold: true, size: 26 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
                children: [new TextRun({ text: `(Tuần học thứ ${selectedWeek} của năm học)`, italics: true, size: 20 })],
              }),

              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),

              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 300 },
                            children: [new TextRun({ text: 'PHÓ HIỆU TRƯỞNG', bold: true, size: 20 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: '(Ký, ghi rõ họ tên và đóng dấu)', italics: true, size: 18 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 1100 },
                            children: [new TextRun({ text: 'Nguyễn Tiến Đức', bold: true, size: 20 })],
                          }),
                        ],
                      }),
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 300 },
                            children: [new TextRun({ text: 'KIỂM TRA CỦA TTCM', bold: true, size: 20 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: '(Ký và ghi rõ họ tên)', italics: true, size: 18 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 1100 },
                            children: [new TextRun({ text: 'Nguyễn Ngọc Xuân', bold: true, size: 20 })],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
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

  const handleExportExcel = () => {
    if (reportData.length === 0) {
      alert('Tuần này chưa có tiết dạy để xuất!')
      return
    }

    const exportRows: any[] = []
    reportData.forEach((group) => {
      group.slots.forEach((slot) => {
        exportRows.push({
          'Thứ, ngày': `${group.day.name} (${getFormattedDate(group.day.offset)})`,
          'Môn - Lớp': slot.subjectClass,
          'Tiết TKB': slot.period,
          'Tên bài dạy': slot.isSkipped ? '(Nghỉ / Bỏ qua tiết)' : (slot.lessonName || ''),
          'Tiết CT': slot.isSkipped ? '—' : slot.lessonOrder,
        })
      })
    })

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `Tuan_${selectedWeek}`)
    XLSX.writeFile(workbook, `Phieu_Bao_Giang_Tuan_${selectedWeek}.xlsx`)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Lịch Báo Giảng</h1>
          <p className="text-xs text-slate-500">Đồng bộ tiến độ chuẩn xác theo thời khóa biểu</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 border rounded-xl shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="font-black text-emerald-800 bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Tuần {w < 10 ? '0' + w : w}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportWord}
            disabled={exportingWord || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Word</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs">
        <span className="font-bold text-emerald-950">Tuần {selectedWeek < 10 ? '0' + selectedWeek : selectedWeek}</span>
        <span className="font-black text-emerald-800">Tổng: {totalSlotsCount} tiết dạy</span>
      </div>

      {/* BẢNG BÁO GIẢNG */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-tight text-[11px]">
              <th className="w-[15%] p-3 border-r border-slate-300 text-center">THỨ, NGÀY</th>
              <th className="w-[16%] p-3 border-r border-slate-300 text-center">MÔN - LỚP</th>
              <th className="w-[9%] p-3 border-r border-slate-300 text-center">TIẾT TKB</th>
              <th className="w-[42%] p-3 border-r border-slate-300">TÊN BÀI DẠY THEO PPCT</th>
              <th className="w-[10%] p-3 border-r border-slate-300 text-center">TIẾT CT</th>
              <th className="w-[8%] p-3 text-center">GHI CHÚ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {reportData.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400">
                  Tuần này chưa có tiết dạy nào được xếp trong Thời khóa biểu.
                </td>
              </tr>
            ) : (
              reportData.map((group) => {
                return group.slots.map((slot: any, idx: number) => {
                  const isFirst = idx === 0
                  const hasLesson = slot.lessonName && slot.lessonName.trim() !== ''

                  return (
                    <tr key={`${slot.day}_${slot.period}_${idx}`} className={`hover:bg-slate-50/80 transition ${slot.isSkipped ? 'bg-slate-100/60 text-slate-400' : ''}`}>
                      {isFirst && (
                        <td
                          rowSpan={group.slots.length}
                          className="p-2.5 border-r border-slate-300 text-center font-black bg-slate-50/60 align-middle"
                        >
                          <span className="text-xs font-black text-slate-900 block">{group.day.name}</span>
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full inline-block mt-1">
                            {getFormattedDate(group.day.offset)}
                          </span>
                        </td>
                      )}
                      <td className="p-2 border-r border-slate-300 text-center font-black text-slate-900">
                        {slot.subjectClass}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-center font-black text-emerald-700 text-sm">
                        {slot.period}
                      </td>
                      <td className="p-2.5 border-r border-slate-300 align-middle">
                        {slot.isSkipped ? (
                          <span className="text-slate-400 italic font-medium">(Tiết nghỉ / Bỏ qua không dạy theo PPCT)</span>
                        ) : hasLesson ? (
                          <span className="text-slate-900 font-medium line-clamp-2">{slot.lessonName}</span>
                        ) : (
                          <Link
                            href="/dashboard/curriculum"
                            className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded font-semibold"
                          >
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>Chưa có PPCT — Gán ngay</span>
                          </Link>
                        )}
                      </td>
                      {/* CỘT TIẾT CT CÓ THỂ BẤM VÀO ĐỂ ĐẢO TIẾT / XÓA BỎ QUA */}
                      <td className="p-2 border-r border-slate-300 text-center align-middle">
                        <button
                          onClick={() => {
                            setEditingSlot({
                              realClassId: slot.realClassId,
                              slotIdx: slot.slotOrderInWeek,
                              currentOrder: Number(slot.lessonOrder) || 1,
                              isOverridden: slot.isOverridden,
                              isSkipped: slot.isSkipped,
                            })
                            setTargetLessonOrder(Number(slot.lessonOrder) || 1)
                            setIsSkippedSlot(slot.isSkipped)
                          }}
                          className={`px-2.5 py-1 rounded-md inline-flex items-center justify-center gap-1 font-black text-xs cursor-pointer transition ${
                            slot.isSkipped
                              ? 'bg-slate-200 text-slate-600 border border-slate-300'
                              : slot.isOverridden
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'
                              : 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100'
                          }`}
                          title="Bấm để đảo tiết hoặc bỏ qua tiết này"
                        >
                          <span>{slot.isSkipped ? 'Bỏ qua' : slot.lessonOrder}</span>
                          <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      </td>
                      <td className="p-2 text-center text-xs font-medium">
                        {slot.isSkipped ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">Đã bỏ qua</span>
                        ) : slot.isOverridden ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Đảo tiết</span>
                        ) : (
                          '—'
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

      {/* POPUP ĐIỀU CHỈNH HOẶC BỎ QUA TIẾT CT */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">Cấu hình tiến độ tiết dạy</span>
              <button onClick={() => setEditingSlot(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border">
                <span className="text-slate-500 font-medium">Trạng thái hiện tại:</span>
                <span className="font-bold text-slate-800">
                  {editingSlot.isSkipped ? 'Đang bỏ qua' : `Tiết CT số ${editingSlot.currentOrder}`}
                </span>
              </div>

              {/* Tùy chọn bỏ qua tiết */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSkippedSlot}
                  onChange={(e) => setIsSkippedSlot(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-800 block">Bỏ qua / Xóa tiết này</span>
                  <span className="text-[11px] text-slate-500">Tiết này sẽ không dạy theo PPCT (các tiết sau tự động đôn lên).</span>
                </div>
              </label>

              {/* Ô nhập số tiết thay thế nếu không bỏ qua */}
              {!isSkippedSlot && (
                <div className="space-y-1 pt-1">
                  <label className="font-medium text-slate-600 block">Hoặc đổi sang số tiết CT mong muốn:</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={targetLessonOrder}
                    onChange={(e) => setTargetLessonOrder(Number(e.target.value))}
                    className="w-full p-2.5 border rounded-xl font-black text-center text-blue-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleSaveOverride(isSkippedSlot)}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}