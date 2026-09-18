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

// Hàm tự động tính tuần hiện tại theo thời gian thực (Tuần 1 bắt đầu từ 07/09/2026)
const getCurrentWeekNumber = () => {
  const startDate = new Date(2026, 8, 7) // Tháng 9 là 8 trong JavaScript (0-indexed)
  const today = new Date()
  
  startDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  
  const diffTime = today.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return 1
  const currentWeek = Math.floor(diffDays / 7) + 1
  return Math.min(Math.max(currentWeek, 1), 35)
}

export default function ReportsPage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekNumber())
  const [schedule, setSchedule] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [classCurriculums, setClassCurriculums] = useState<any[]>([])
  const [curriculumItems, setCurriculumItems] = useState<any[]>([])
  const [overrides, setOverrides] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [exportingWord, setExportingWord] = useState(false)

  // State popup chỉnh sửa tiến độ cá nhân
  const [editingSlot, setEditingSlot] = useState<{
    classId: string
    slotIdx: number
    currentOrder: number
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

  const loadData = async () => {
    setLoading(true)

    const { data: cData } = await supabase.from('classes').select('*')
    if (cData) setClasses(cData)

    const { data: sData } = await supabase.from('schedule_entries').select('*')
    if (sData) setSchedule(sData)

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

  // Thuật toán ánh xạ linh hoạt: Tích lũy liên mạch từ tuần trước, ưu tiên tuyệt đối các cấu hình thủ công trong overrides
  const calculateReportRows = () => {
    if (schedule.length === 0 || classes.length === 0) return []

    const week1Slots = schedule.filter((s) => Number(s.week_number || 1) === 1 && !s.is_substitute)

    const allActiveWeeksSlots: any[] = []
    for (let w = 1; w <= selectedWeek; w++) {
      let wSlots = schedule.filter((s) => Number(s.week_number || 1) === w && !s.is_substitute)
      if (wSlots.length === 0 && w > 1) {
        wSlots = week1Slots.map((slot) => ({ ...slot, week_number: w }))
      }
      wSlots.sort((a, b) => {
        const d1 = Number(a.day_of_week || 2)
        const d2 = Number(b.day_of_week || 2)
        if (d1 !== d2) return d1 - d2
        return Number(a.period_number || 1) - Number(b.period_number || 1)
      })
      allActiveWeeksSlots.push(...wSlots)
    }

    const classSlotsMap = new Map<string, any[]>()
    allActiveWeeksSlots.forEach((slot) => {
      const clsId = slot.class_id
      if (clsId) {
        if (!classSlotsMap.has(clsId)) classSlotsMap.set(clsId, [])
        classSlotsMap.get(clsId)!.push(slot)
      }
    })

    const lessonMapping = new Map<string, { order: number; name: string; isOverridden: boolean; slotIdx: number; hasTemplate: boolean }>()

    classSlotsMap.forEach((slots, classId) => {
      let templateId: string | null = null
      const matchedRel = classCurriculums.find((cc) => cc.class_id === classId)
      if (matchedRel) {
        templateId = matchedRel.template_id
      } else {
        const cls = classes.find((c) => c.id === classId)
        if (cls?.template_id) templateId = cls.template_id
      }

      let lessons: any[] = []
      if (templateId) {
        lessons = curriculumItems.filter((item) => item.template_id === templateId)
      }
      
      const hasTemplate = !!templateId && lessons.length > 0

      lessons.sort((a, b) => Number(a.lesson_order || 1) - Number(b.lesson_order || 1))

      const slotsByWeek = new Map<number, any[]>()
      slots.forEach((slot) => {
        const wNum = Number(slot.week_number || 1)
        if (!slotsByWeek.has(wNum)) slotsByWeek.set(wNum, [])
        slotsByWeek.get(wNum)!.push(slot)
      })

      let globalPointer = 1 // Con trỏ mảng tích lũy từ tuần 1

      for (let w = 1; w <= selectedWeek; w++) {
        const wSlots = slotsByWeek.get(w) || []

        wSlots.forEach((slot, weekSlotIdx) => {
          const day = Number(slot.day_of_week || 2)
          const period = Number(slot.period_number || 1)

          const ovr = overrides.find(
            (o) => o.class_id === classId && Number(o.week_number) === w && Number(o.slot_order_in_week) === weekSlotIdx
          )

          let assignedOrder = globalPointer
          let isCustomOverridden = false

          if (hasTemplate) {
            if (ovr && ovr.override_lesson_order) {
              assignedOrder = Number(ovr.override_lesson_order)
              isCustomOverridden = true
            }
          }

          let foundLesson = lessons.find((l) => Number(l.lesson_order) === assignedOrder) || lessons[assignedOrder - 1]

          const mapKey = `${w}_${day}_${period}_${classId}`
          if (w === selectedWeek) {
            lessonMapping.set(mapKey, {
              order: !hasTemplate ? 0 : assignedOrder,
              name: !hasTemplate ? '' : (foundLesson ? foundLesson.lesson_name : `Tiết học số ${assignedOrder}`),
              isOverridden: isCustomOverridden,
              slotIdx: weekSlotIdx,
              hasTemplate: hasTemplate,
            })
          }

          globalPointer = assignedOrder + 1
        })
      }
    })

    let currentWeekSlots = schedule.filter((s) => Number(s.week_number || 1) === Number(selectedWeek) && !s.is_substitute)
    if (currentWeekSlots.length === 0 && Number(selectedWeek) > 1) {
      currentWeekSlots = week1Slots.map((slot) => ({ ...slot, week_number: Number(selectedWeek) }))
    }

    const weekRows: { day: typeof DAYS[0]; slots: any[] }[] = []

    DAYS.forEach((day) => {
      const daySlots: any[] = []

      // Duyệt qua cả 8 tiết (Tiết 1-5 buổi sáng, Tiết 6-8 tương ứng Tiết 1-3 chiều)
      for (let p = 1; p <= 8; p++) {
        const matchedSlot = currentWeekSlots.find(
          (s) => Number(s.day_of_week) === day.id && Number(s.period_number) === p
        )

        if (matchedSlot && matchedSlot.class_id) {
          const cls = classes.find((c) => c.id === matchedSlot.class_id)
          const classCode = cls ? cls.code : (matchedSlot.sub_class_code || 'Lớp')
          const subjectName = cls ? cls.subject : (matchedSlot.sub_subject || 'Toán')

          const classSlotsAll = currentWeekSlots.filter((s) => Number(s.class_id) === Number(matchedSlot.class_id))
          const slotIdxInWeek = classSlotsAll.findIndex((s) => Number(s.day_of_week) === day.id && Number(s.period_number) === p)

          const activeWeek = Number(selectedWeek)
          const mapKey = `${activeWeek}_${day.id}_${p}_${matchedSlot.class_id}`
          const lessonInfo = lessonMapping.get(mapKey) || { order: 1, name: '', isOverridden: false, slotIdx: 0, hasTemplate: false }

          const periodDisplay = p <= 5 ? `${p}` : `Chiều - ${p - 5}`

          daySlots.push({
            entry: matchedSlot,
            day: day.id,
            period: p,
            periodDisplay: periodDisplay,
            realClassId: matchedSlot.class_id,
            subjectClass: `${subjectName} - ${classCode}`,
            lessonOrder: lessonInfo.order,
            lessonName: lessonInfo.name,
            isSubstitute: matchedSlot.is_substitute || false,
            isOverridden: lessonInfo.isOverridden,
            slotOrderInWeek: slotIdxInWeek >= 0 ? slotIdxInWeek : 0,
            hasTemplate: lessonInfo.hasTemplate,
          })
        }
      }

      // NẾU NGÀY ĐÓ KHÔNG CÓ TIẾT NÀO, TẠO ĐÚNG 4 DÒNG TRỐNG
      if (daySlots.length === 0) {
        for (let emptyP = 1; emptyP <= 4; emptyP++) {
          daySlots.push({
            entry: null,
            day: day.id,
            period: emptyP,
            periodDisplay: String(emptyP),
            realClassId: '',
            subjectClass: '',
            lessonOrder: 0,
            lessonName: '',
            isSubstitute: false,
            isOverridden: false,
            slotOrderInWeek: 0,
            hasTemplate: true,
          })
        }
      }

      weekRows.push({ day, slots: daySlots })
    })

    return weekRows
  }

  const reportData = calculateReportRows()
  const totalSlotsCount = reportData.reduce((acc, curr) => acc + curr.slots.length, 0)

  const handleSaveOverride = async () => {
    if (!editingSlot) return
    setLoading(true)

    try {
      const payload = {
        class_id: editingSlot.classId,
        week_number: Number(selectedWeek),
        slot_order_in_week: Number(editingSlot.slotIdx),
        is_skipped: false,
        override_lesson_order: Number(targetLessonOrder),
      }

      const { error } = await supabase.from('lesson_overrides').upsert(
        payload,
        { onConflict: 'class_id,week_number,slot_order_in_week' }
      )

      if (error) throw error

      setEditingSlot(null)
      await loadData()
    } catch (err: any) {
      alert('Lỗi khi lưu thay đổi tiến độ: ' + err.message)
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

          let noteText = !slot.hasTemplate ? 'Chưa có PPCT' : (slot.isOverridden ? 'Tùy chỉnh' : '')
          let lessonDisplay = !slot.hasTemplate ? '(Chưa có PPCT)' : (slot.lessonName || '')
          let orderDisplay = !slot.hasTemplate ? '—' : String(slot.lessonOrder)

          rowCells.push(
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: slot.subjectClass, size: 20 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: slot.periodDisplay, size: 20 })] })] }),
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

              // BẢNG CHỮ KÝ PHÍA DƯỚI (Không khung viền khi in)
              new Paragraph({ spacing: { before: 300 } }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      // Góc trái: P.Hiệu Trưởng Nguyễn Tiến Đức
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: 'PHÓ HIỆU TRƯỞNG', bold: true, size: 20 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 1200 },
                            children: [new TextRun({ text: '(Ký, đóng dấu, ghi rõ họ tên)', italics: true, size: 18 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: 'Nguyễn Tiến Đức', bold: true, size: 20 })],
                          }),
                        ],
                      }),
                      // Góc phải: TTCM Nguyễn Ngọc Xuân
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: 'TỔ TRƯỞNG CHUYÊN MÔN', bold: true, size: 20 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 1200 },
                            children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 18 })],
                          }),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
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
          'Tiết TKB': slot.periodDisplay,
          'Tên bài dạy': !slot.hasTemplate ? 'CHƯƠNG CÓ PPCT' : (slot.lessonName || ''),
          'Tiết CT': !slot.hasTemplate ? '—' : slot.lessonOrder,
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
          <p className="text-xs text-slate-500">Đồng bộ hoàn toàn với Thời khóa biểu cá nhân và Phân phối chương trình chuẩn.</p>
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
              <th className="w-[12%] p-3 border-r border-slate-300 text-center">TIẾT TKB</th>
              <th className="w-[39%] p-3 border-r border-slate-300">TÊN BÀI DẠY THEO PPCT</th>
              <th className="w-[10%] p-3 border-r border-slate-300 text-center">TIẾT CT</th>
              <th className="w-[8%] p-3 text-center">GHI CHÚ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {reportData.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400">
                  Tuần này chưa có tiết dạy cá nhân nào được xếp trong Thời khóa biểu.
                </td>
              </tr>
            ) : (
              reportData.map((group) => {
                return group.slots.map((slot: any, idx: number) => {
                  const isFirst = idx === 0

                  return (
                    <tr key={`${slot.day}_${slot.period}_${idx}`} className="hover:bg-slate-50/80 transition">
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
                      <td className="p-2 border-r border-slate-300 text-center font-black text-slate-900 text-sm">
                        {slot.subjectClass}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-center font-black text-emerald-700 text-xs">
                        {slot.periodDisplay}
                      </td>
                      <td className="p-3 border-r border-slate-300 align-middle">
                        {!slot.subjectClass ? (
                          <span className="text-slate-300">—</span>
                        ) : !slot.hasTemplate ? (
                          <Link
                            href="/dashboard/curriculum"
                            className="inline-flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-md font-bold shadow-2xs hover:bg-rose-100 transition"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Chưa có PPCT — Bấm để gán ngay</span>
                          </Link>
                        ) : (
                          <span className="text-slate-900 font-semibold text-sm leading-relaxed line-clamp-2">{slot.lessonName}</span>
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-center align-middle">
                        {!slot.subjectClass ? (
                          <span className="text-slate-300">—</span>
                        ) : !slot.hasTemplate ? (
                          <span className="text-slate-400 font-bold">—</span>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingSlot({
                                classId: slot.realClassId,
                                slotIdx: slot.slotOrderInWeek,
                                currentOrder: Number(slot.lessonOrder) || 1,
                                isOverridden: slot.isOverridden,
                              })
                              setTargetLessonOrder(Number(slot.lessonOrder) || 1)
                            }}
                            className={`px-2.5 py-1 rounded-md inline-flex items-center justify-center gap-1 font-black text-xs cursor-pointer transition ${
                              slot.isOverridden
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'
                                : 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100'
                            }`}
                            title="Bấm để đổi số tiết CT"
                          >
                            <span>{slot.lessonOrder}</span>
                            <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-center text-xs font-medium">
                        {!slot.subjectClass ? (
                          <span className="text-slate-300">—</span>
                        ) : !slot.hasTemplate ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Thiếu PPCT</span>
                        ) : slot.isOverridden ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Tùy chỉnh</span>
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

      {/* POPUP ĐIỀU CHỈNH TIẾN ĐỘ */}
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
                <span className="text-slate-500 font-medium">Tiết CT hiện tại:</span>
                <span className="font-bold text-slate-800">Tiết CT số {editingSlot.currentOrder}</span>
              </div>

              <div className="space-y-1 pt-1">
                <label className="font-medium text-slate-600 block">Đổi sang số tiết CT mong muốn:</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={targetLessonOrder}
                  onChange={(e) => setTargetLessonOrder(Number(e.target.value))}
                  className="w-full p-2.5 border rounded-xl font-black text-center text-blue-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveOverride}
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