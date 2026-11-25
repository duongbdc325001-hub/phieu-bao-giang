'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  START_DATE_WEEK_1,
  MAX_WEEK,
  DAYS,
  formatPeriodLabel,
  type TimelineSlot,
  buildLessonPlan,
  buildWeekRows,
  fetchAllRows,
} from '@/lib/baoGiang'
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
  HeightRule,
} from 'docx'
import { Calendar, RefreshCw, ArrowLeftRight, X, FileText, Download, AlertCircle, CheckCircle2 } from 'lucide-react'

const getCurrentWeekNumber = () => {
  const startDate = new Date(START_DATE_WEEK_1)
  const today = new Date()

  startDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 1
  const currentWeek = Math.floor(diffDays / 7) + 1
  return Math.min(Math.max(currentWeek, 1), 35)
}

// Màu nhãn môn học: mỗi môn luôn ra cùng một màu để quét mắt theo môn cho nhanh
const SUBJECT_STYLES = [
  'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'bg-sky-50 text-sky-800 ring-sky-200',
  'bg-violet-50 text-violet-800 ring-violet-200',
  'bg-amber-50 text-amber-800 ring-amber-200',
  'bg-rose-50 text-rose-800 ring-rose-200',
  'bg-teal-50 text-teal-800 ring-teal-200',
  'bg-indigo-50 text-indigo-800 ring-indigo-200',
  'bg-orange-50 text-orange-800 ring-orange-200',
]
const subjectStyle = (subject: string) => {
  let h = 0
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) >>> 0
  return SUBJECT_STYLES[h % SUBJECT_STYLES.length]
}

// Đường kẻ: ngăn cách NGÀY và CỘT đậm; ngăn cách giữa các TIẾT trong một ngày mảnh (xem ruleInner trong DAY_THEMES)
const DAY_RULE = 'border-t-2 border-slate-400'
const COL_RULE = 'border-l-2 border-slate-300'

// Mỗi thứ một tông màu nhạt riêng: thanh bên trái, ô ngày, nền các dòng trong ngày và đường kẻ.
// (Viết đủ tên class để Tailwind nhận ra, không ghép chuỗi động.)
const DAY_THEMES: Record<number, { bar: string; cell: string; row: string; pill: string; ruleTop: string; ruleInner: string }> = {
  2: { bar: 'border-emerald-500', cell: 'bg-emerald-100/60', row: 'bg-emerald-50/50', pill: 'text-emerald-700 ring-emerald-200', ruleTop: DAY_RULE, ruleInner: 'border-t border-emerald-200' },
  3: { bar: 'border-sky-500', cell: 'bg-sky-100/60', row: 'bg-sky-50/50', pill: 'text-sky-700 ring-sky-200', ruleTop: DAY_RULE, ruleInner: 'border-t border-sky-200' },
  4: { bar: 'border-violet-500', cell: 'bg-violet-100/60', row: 'bg-violet-50/50', pill: 'text-violet-700 ring-violet-200', ruleTop: DAY_RULE, ruleInner: 'border-t border-violet-200' },
  5: { bar: 'border-amber-500', cell: 'bg-amber-100/60', row: 'bg-amber-50/50', pill: 'text-amber-700 ring-amber-200', ruleTop: DAY_RULE, ruleInner: 'border-t border-amber-200' },
  6: { bar: 'border-rose-500', cell: 'bg-rose-100/60', row: 'bg-rose-50/50', pill: 'text-rose-700 ring-rose-200', ruleTop: DAY_RULE, ruleInner: 'border-t border-rose-200' },
  7: { bar: 'border-teal-500', cell: 'bg-teal-100/60', row: 'bg-teal-50/50', pill: 'text-teal-700 ring-teal-200', ruleTop: DAY_RULE, ruleInner: 'border-t border-teal-200' },
}

// "TrN - 12SỬ" -> { subject: 'TrN', code: '12SỬ' }
const splitSubjectClass = (text: string) => {
  const i = text.indexOf(' - ')
  return i === -1 ? { subject: '', code: text } : { subject: text.slice(0, i), code: text.slice(i + 3) }
}

// Dựng danh sách dòng của MỘT NGÀY cho phiếu Word: luôn đủ 5 dòng Tiết 1 -> 5
// (tiết nào không dạy thì để dòng trống nhưng vẫn ghi số tiết); tiết chiều (C-1, C-2...) chỉ thêm khi có dạy.
const buildExportSlots = (slots: any[]): any[] => {
  const real = slots.filter((s) => !s.isEmpty)
  const morningLabels = ['1', '2', '3', '4', '5']
  const rows: any[] = []
  morningLabels.forEach((label) => {
    const matched = real.filter((s) => String(s.period) === label)
    if (matched.length > 0) {
      rows.push(...matched)
    } else {
      rows.push({
        isEmpty: true,
        period: label,
        subjectClass: '',
        lessonOrder: '',
        lessonName: '',
        noteLabel: '',
        hasTemplate: true,
      })
    }
  })
  rows.push(...real.filter((s) => !morningLabels.includes(String(s.period))))
  return rows
}

// Đảo tiết: nhấc tiết ở vị trí `from` ra, đặt vào vị trí `to`, các tiết ở giữa tự dồn.
// Ví dụ dãy 2,3,4: đưa tiết 4 (vị trí 2) lên vị trí đầu (0) -> 4,2,3
const computeReorder = (timeline: TimelineSlot[], from: number, to: number) => {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const before = timeline.slice(lo, hi + 1).map((t) => t.assigned)
  const after = [...before]
  const [moved] = after.splice(from - lo, 1)
  after.splice(to - lo, 0, moved)
  return { lo, hi, before, after }
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

  const [editingSlot, setEditingSlot] = useState<{
    classId: string
    slotIdx: number
    currentOrder: number
    isOverridden: boolean
    tIdx: number
  } | null>(null)
  const [targetLessonOrder, setTargetLessonOrder] = useState<number>(1)
  const [editMode, setEditMode] = useState<'cut' | 'reorder'>('cut')
  const [reorderNumber, setReorderNumber] = useState<string>('') // số tiết CT người dùng nhập ở tab Đảo tiết

  const getFormattedDate = (offset: number) => {
    const d = new Date(START_DATE_WEEK_1)
    d.setDate(d.getDate() + (selectedWeek - 1) * 7 + offset)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  // Supabase mặc định chỉ trả tối đa 1000 dòng mỗi lần. Đọc theo từng trang để không bị cắt mất dữ liệu
  // (ví dụ nhiều khung PPCT x ~105 tiết, hoặc TKB nhiều tuần).
  const fetchAll = (table: string) => fetchAllRows(supabase, table)

  const loadData = async () => {
    setLoading(true)
    try {
      const [cData, sData, ccData, itemsData, ovrData] = await Promise.all([
        fetchAll('classes'),
        fetchAll('schedule_entries'),
        fetchAll('class_curriculums'),
        fetchAll('curriculum_items'),
        fetchAll('lesson_overrides'),
      ])
      setClasses(cData)
      setSchedule(sData)
      setClassCurriculums(ccData)
      setCurriculumItems(itemsData)
      setOverrides(ovrData)
    } catch (err) {
      console.error("Lỗi tải dữ liệu:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Logic tính tiết nằm ở src/lib/baoGiang.ts (dùng chung với trang Tiến độ)
  const calculateReportRows = () => {
    const plan = buildLessonPlan(schedule, classes, classCurriculums, curriculumItems, overrides)
    return { weekRows: buildWeekRows(selectedWeek, plan, classes), timelines: plan.timelines }
  }

  const { weekRows: reportData, timelines } = calculateReportRows()
  const totalSlotsCount = reportData.reduce((acc, curr) => acc + curr.slots.filter(s => !s.isEmpty).length, 0)

  // Dữ liệu cho tab "Đảo tiết": tìm tiết CT mà người dùng nhập trong các tiết của lớp từ tuần đang xem trở đi
  const editTimeline: TimelineSlot[] = editingSlot ? timelines.get(editingSlot.classId) || [] : []
  const reorderNumberVal = reorderNumber.trim() === '' ? null : Number(reorderNumber)
  const reorderMatchIdx =
    editingSlot && reorderNumberVal !== null && Number.isFinite(reorderNumberVal)
      ? editTimeline.findIndex((t, i) => i !== editingSlot.tIdx && t.week >= selectedWeek && t.assigned === reorderNumberVal)
      : -1
  const reorderTarget: number | null = reorderMatchIdx >= 0 ? reorderMatchIdx : null
  const reorderMatchSlot: TimelineSlot | null = reorderTarget !== null ? editTimeline[reorderTarget] : null
  let reorderError = ''
  if (editingSlot && reorderNumberVal !== null && reorderTarget === null) {
    if (reorderNumberVal === editingSlot.currentOrder) {
      reorderError = 'Hãy nhập số tiết CT khác với tiết đang chọn.'
    } else if (editTimeline.some((t) => t.week < selectedWeek && t.assigned === reorderNumberVal)) {
      reorderError = `Tiết CT ${reorderNumberVal} thuộc tuần đã qua, không đảo được từ tuần này.`
    } else {
      reorderError = `Không có tiết CT số ${reorderNumberVal} của lớp này từ tuần ${selectedWeek} trở đi.`
    }
  }
  // Quy tắc: tiết đứng sau (lớn hơn) luôn được đưa lên đúng vị trí của tiết đứng trước (nhỏ hơn)
  const reorderFrom = editingSlot && reorderTarget !== null ? Math.max(editingSlot.tIdx, reorderTarget) : -1
  const reorderTo = editingSlot && reorderTarget !== null ? Math.min(editingSlot.tIdx, reorderTarget) : -1
  const reorderPreview =
    editingSlot && reorderTarget !== null && editTimeline[reorderFrom] && editTimeline[reorderTo]
      ? computeReorder(editTimeline, reorderFrom, reorderTo)
      : null

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
        override_type: 'cut',
      }

      const { error } = await supabase.from('lesson_overrides').upsert(
        payload,
        { onConflict: 'class_id,week_number,slot_order_in_week' }
      )

      if (error) throw error

      setEditingSlot(null)
      await loadData()
      alert('Đã cập nhật tiến độ thành công!')
    } catch (err: any) {
      alert('Lỗi khi lưu: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Đảo tiết: đưa tiết đang chọn tới vị trí của tiết khác, các tiết ở giữa tự dồn.
  // Ghi vào lesson_overrides đúng những tiết có số CT khác với cách đếm tự động,
  // xóa những ghi đè không còn cần, và đặt một "mốc nối" ở tiết ngay sau vùng đảo
  // để các bài phía sau giữ nguyên.
  const handleSaveReorder = async () => {
    if (!editingSlot || reorderTarget === null) return
    const timeline = timelines.get(editingSlot.classId)
    // Tiết đứng sau (lớn hơn) được đưa lên đúng vị trí của tiết đứng trước (nhỏ hơn)
    const from = Math.max(editingSlot.tIdx, reorderTarget)
    const to = Math.min(editingSlot.tIdx, reorderTarget)
    if (!timeline || !timeline[from] || !timeline[to] || from === to) return

    setLoading(true)
    try {
      const { lo, hi, after } = computeReorder(timeline, from, to)

      const toUpsert: any[] = []
      const toDelete: TimelineSlot[] = []
      const makeRow = (t: TimelineSlot, value: number, type: string) => ({
        class_id: editingSlot.classId,
        week_number: t.week,
        slot_order_in_week: t.idx,
        is_skipped: false,
        override_lesson_order: value,
        override_type: type,
      })

      let prevAssigned = lo > 0 ? timeline[lo - 1].assigned : 0
      for (let k = lo; k <= hi; k++) {
        const t = timeline[k]
        const desired = after[k - lo]
        const pointer = prevAssigned + 1
        if (desired !== pointer) {
          if (t.ovrValue !== desired) toUpsert.push(makeRow(t, desired, 'swap'))
        } else if (t.ovrValue !== null) {
          toDelete.push(t)
        }
        prevAssigned = desired
      }

      // Tiết ngay sau vùng đảo: nếu đang đếm tự động mà số tiếp theo bị lệch thì đặt mốc nối
      const next = timeline[hi + 1]
      if (next && next.ovrValue === null && next.assigned !== prevAssigned + 1) {
        toUpsert.push(makeRow(next, next.assigned, 'anchor'))
      }

      for (const t of toDelete) {
        const { error } = await supabase
          .from('lesson_overrides')
          .delete()
          .eq('class_id', editingSlot.classId)
          .eq('week_number', t.week)
          .eq('slot_order_in_week', t.idx)
        if (error) throw error
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from('lesson_overrides')
          .upsert(toUpsert, { onConflict: 'class_id,week_number,slot_order_in_week' })
        if (error) throw error
      }

      setEditingSlot(null)
      setReorderNumber('')
      await loadData()
      alert('Đã đảo tiết thành công!')
    } catch (err: any) {
      alert('Lỗi khi đảo tiết: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // XUẤT FILE WORD (CÓ CHỮ KÝ TỔ TRƯỞNG CHUYÊN MÔN GÓC PHẢI)
  // =========================================================================
  const handleExportWord = async () => {
    if (reportData.length === 0) {
      alert('Tuần này chưa có dữ liệu để xuất!')
      return
    }

    setExportingWord(true)
    try {
      // Độ rộng cột cố định (DXA) để Word, WPS, LibreOffice và trình xem trên điện thoại hiển thị giống nhau.
      // Tổng = 9026 = bề rộng nội dung khổ A4 với lề 2,54 cm.
      const COL_W = [1264, 1625, 1083, 3249, 903, 902]
      const TABLE_W = COL_W.reduce((sum, w) => sum + w, 0)
      const MIN_ROW_H = 240 // chiều cao tối thiểu mỗi dòng (~0,42 cm) để các dòng trống đều với dòng có chữ

      const makeCell = (
        text: string,
        colIdx: number,
        opts: { bold?: boolean; italics?: boolean; size?: number; align?: any } = {}
      ) =>
        new TableCell({
          width: { size: COL_W[colIdx], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: opts.align ?? AlignmentType.CENTER,
              children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 20 })],
            }),
          ],
        })

      const headerTexts = ['Thứ, ngày', 'Môn - Lớp', 'Tiết TKB', 'Tên bài dạy', 'Tiết CT', 'Ghi chú']
      const tableRows: TableRow[] = [
        new TableRow({
          tableHeader: true, // lặp lại dòng tiêu đề nếu bảng sang trang 2
          children: headerTexts.map((t, i) => makeCell(t, i, { bold: true, size: 21 })),
        }),
      ]

      reportData.forEach((group) => {
        const dayName = group.day.name
        const dayDate = getFormattedDate(group.day.offset)
        const exportSlots = buildExportSlots(group.slots)

        exportSlots.forEach((slot, sIdx) => {
          const rowCells: TableCell[] = []

          if (sIdx === 0) {
            rowCells.push(
              new TableCell({
                width: { size: COL_W[0], type: WidthType.DXA },
                rowSpan: exportSlots.length,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dayName, bold: true, size: 21 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dayDate, italics: true, size: 19 })] }),
                ],
              })
            )
          }

          const subjectClassText = slot.isEmpty ? '' : slot.subjectClass
          const periodText = String(slot.period)
          const lessonDisplay = slot.isEmpty ? '' : (!slot.hasTemplate ? '(Chưa có PPCT)' : (slot.lessonName || ''))
          const orderDisplay = slot.isEmpty ? '' : (!slot.hasTemplate ? '—' : String(slot.lessonOrder))
          const noteText = slot.isEmpty ? '' : (!slot.hasTemplate ? 'Chưa có PPCT' : slot.noteLabel)

          rowCells.push(
            makeCell(subjectClassText, 1),
            makeCell(periodText, 2),
            makeCell(lessonDisplay, 3, { align: AlignmentType.LEFT }),
            makeCell(orderDisplay, 4),
            makeCell(noteText, 5, { italics: true, size: 18 })
          )

          tableRows.push(
            new TableRow({
              height: { value: MIN_ROW_H, rule: HeightRule.ATLEAST },
              cantSplit: true,
              children: rowCells,
            })
          )
        })
      })

      const invisibleBorder = { style: BorderStyle.NIL, size: 0, color: 'auto' }
      const noBorders = { top: invisibleBorder, bottom: invisibleBorder, left: invisibleBorder, right: invisibleBorder }
      const noTableBorders = { ...noBorders, insideHorizontal: invisibleBorder, insideVertical: invisibleBorder }

      const doc = new Document({
        sections: [
          {
            children: [
              new Table({
                width: { size: TABLE_W, type: WidthType.DXA },
                columnWidths: [4550, 4476],
                borders: noTableBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 4550, type: WidthType.DXA },
                        borders: noBorders,
                        margins: { left: 60, right: 60 },
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'SỞ GD&ĐT PHÚ THỌ', bold: true, size: 20 })] }),
                          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'TRƯỜNG THPT CHUYÊN HOÀNG VĂN THỤ', bold: true, size: 20 })] }),
                        ],
                      }),
                      new TableCell({
                        width: { size: 4476, type: WidthType.DXA },
                        borders: noBorders,
                        margins: { left: 60, right: 60 },
                        verticalAlign: VerticalAlign.CENTER,
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
              new Table({ width: { size: TABLE_W, type: WidthType.DXA }, columnWidths: COL_W, rows: tableRows }),
              // CHỮ KÝ TỔ TRƯỞNG CHUYÊN MÔN CĂN PHẢI (KHÔNG DÙNG BẢNG PHỤ)
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 360 },
                children: [new TextRun({ text: 'Tổ trưởng chuyên môn', bold: true, size: 22 })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 80, after: 120 },
                children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 19 })],
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

  // =========================================================================
  // XUẤT FILE EXCEL
  // =========================================================================
  const handleExportExcel = () => {
    if (reportData.length === 0) {
      alert('Tuần này chưa có dữ liệu để xuất!')
      return
    }

    const exportRows: any[] = []
    reportData.forEach((group) => {
      group.slots.forEach((slot) => {
        exportRows.push({
          'Thứ, ngày': `${group.day.name} (${getFormattedDate(group.day.offset)})`,
          'Môn - Lớp': slot.isEmpty ? '' : slot.subjectClass,
          'Tiết TKB': slot.period,
          'Tên bài dạy': slot.isEmpty ? '' : (!slot.hasTemplate ? 'CHƯA CÓ PPCT' : (slot.lessonName || '')),
          'Tiết CT': slot.isEmpty ? '' : (!slot.hasTemplate ? '—' : slot.lessonOrder),
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
          <p className="text-xs text-slate-500">Ngày không có tiết hiển thị gọn một dòng. Phiếu Word luôn xuất đủ 5 dòng (Tiết 1–5) mỗi ngày.</p>
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

      {/* TÓM TẮT TUẦN */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
        <p className="text-sm text-emerald-900">
          <span className="font-bold">Tuần {selectedWeek < 10 ? '0' + selectedWeek : selectedWeek}</span>
          <span className="ml-2 text-emerald-700">
            {getFormattedDate(0)} – {getFormattedDate(5)}
          </span>
        </p>
        <p className="text-xs text-slate-600">
          Tổng <span className="mx-0.5 text-base font-bold text-emerald-800">{totalSlotsCount}</span> tiết dạy
        </p>
      </div>

      {/* BẢNG BÁO GIẢNG */}
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[19%]" />
              <col className="w-[9%]" />
              <col className="w-[39%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-slate-400 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3 py-3 text-center">Thứ, ngày</th>
                <th className={`px-3 py-3 text-center ${COL_RULE}`}>Môn - lớp</th>
                <th className={`px-3 py-3 text-center ${COL_RULE}`}>Tiết TKB</th>
                <th className={`px-4 py-3 ${COL_RULE}`}>Tên bài dạy theo PPCT</th>
                <th className={`px-3 py-3 text-center ${COL_RULE}`}>Tiết CT</th>
                <th className={`px-3 py-3 text-center ${COL_RULE}`}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((group) => {
                const isDayOff = group.slots.every((s: any) => s.isEmpty)
                const theme = DAY_THEMES[group.day.id] || DAY_THEMES[2]

                // Ô "Thứ, ngày": thanh xanh bên trái cho ngày có tiết, xám cho ngày không có tiết
                const dayCell = (rowSpan: number) => (
                  <td
                    rowSpan={rowSpan}
                    className={`border-l-4 px-3 py-3 text-center align-middle ${
                      isDayOff ? 'border-slate-200 bg-slate-50' : `${theme.bar} ${theme.cell}`
                    }`}
                  >
                    <span className="block text-sm font-bold text-slate-900">{group.day.name}</span>
                    <span
                      className={`mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        isDayOff ? 'text-slate-500 ring-slate-200' : theme.pill
                      }`}
                    >
                      {getFormattedDate(group.day.offset)}
                    </span>
                  </td>
                )

                if (isDayOff) {
                  return (
                    <tr key={`off_${group.day.id}`} className={DAY_RULE}>
                      {dayCell(1)}
                      <td colSpan={5} className={`px-4 py-3 text-sm italic text-slate-400 ${COL_RULE}`}>
                        Không có tiết dạy
                      </td>
                    </tr>
                  )
                }

                return group.slots.map((slot: any, idx: number) => {
                  const isFirst = idx === 0
                  const { subject, code } = splitSubjectClass(slot.subjectClass || '')
                  const isAfternoon = String(slot.period).toUpperCase().startsWith('C-')
                  const noteStyle =
                    slot.noteLabel === 'Đảo tiết'
                      ? 'bg-violet-50 text-violet-800 ring-violet-200'
                      : 'bg-amber-50 text-amber-800 ring-amber-200'

                  return (
                    <tr
                      key={`${group.day.id}_p${slot.period}_${idx}`}
                      className={`group transition-colors hover:bg-white/70 ${theme.row} ${
                        isFirst ? theme.ruleTop : theme.ruleInner
                      }`}
                    >
                      {isFirst && dayCell(group.slots.length)}

                      <td className={`px-3 py-2.5 text-center ${COL_RULE}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {subject && (
                            <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${subjectStyle(subject)}`}>
                              {subject}
                            </span>
                          )}
                          <span className="text-sm font-bold text-slate-900">{code}</span>
                        </span>
                      </td>

                      <td className={`px-3 py-2.5 text-center ${COL_RULE}`}>
                        {isAfternoon ? (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                            {slot.period}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold tabular-nums text-slate-600">{slot.period}</span>
                        )}
                      </td>

                      <td className={`px-4 py-2.5 align-middle ${COL_RULE}`}>
                        {!slot.hasTemplate ? (
                          <Link
                            href="/dashboard/curriculum"
                            className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Chưa có PPCT, bấm để gán ngay</span>
                          </Link>
                        ) : (
                          <span title={slot.lessonName} className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900">
                            {slot.lessonName}
                          </span>
                        )}
                      </td>

                      <td className={`px-3 py-2.5 text-center ${COL_RULE}`}>
                        {slot.hasTemplate && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSlot({
                                classId: slot.realClassId,
                                slotIdx: slot.slotOrderInWeek,
                                currentOrder: Number(slot.lessonOrder) || 1,
                                isOverridden: slot.isOverridden,
                                tIdx: slot.timelineIndex,
                              })
                              setEditMode('cut')
                              setReorderNumber('')
                              setTargetLessonOrder(Number(slot.lessonOrder) || 1)
                            }}
                            title="Bấm để cắt tiết hoặc đảo tiết"
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                              slot.isOverridden
                                ? noteStyle
                                : 'bg-white text-slate-900 ring-slate-300 hover:bg-emerald-50 hover:ring-emerald-500'
                            }`}
                          >
                            <span>{slot.lessonOrder}</span>
                            <ArrowLeftRight className="h-3 w-3 opacity-40 transition group-hover:opacity-100" />
                          </button>
                        )}
                      </td>

                      <td className={`px-3 py-2.5 text-center ${COL_RULE}`}>
                        {!slot.hasTemplate ? (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                            Thiếu PPCT
                          </span>
                        ) : slot.noteLabel ? (
                          <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${noteStyle}`}>
                            {slot.noteLabel}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>
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

            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setEditMode('cut')}
                className={`flex-1 py-1.5 rounded-lg cursor-pointer transition ${
                  editMode === 'cut' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Cắt tiết
              </button>
              <button
                onClick={() => setEditMode('reorder')}
                className={`flex-1 py-1.5 rounded-lg cursor-pointer transition ${
                  editMode === 'reorder' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Đảo tiết
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border">
                <span className="text-slate-500 font-medium">Tiết CT hiện tại:</span>
                <span className="font-bold text-slate-800">Tiết CT số {editingSlot.currentOrder}</span>
              </div>

              {editMode === 'cut' ? (
                <>
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
                    <p className="text-[11px] text-slate-400">Các tiết CT ở giữa bị bỏ qua, các tiết sau đếm tiếp từ số này.</p>
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
                </>
              ) : (
                <>
                  <div className="space-y-1 pt-1">
                    <label className="font-medium text-slate-600 block">
                      {`Đảo tiết CT ${editingSlot.currentOrder} với tiết CT số:`}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      autoFocus
                      value={reorderNumber}
                      onChange={(e) => setReorderNumber(e.target.value)}
                      placeholder="Nhập số tiết CT, ví dụ 6"
                      className="w-full p-2.5 border rounded-xl font-black text-center text-blue-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {reorderMatchSlot && (
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Tiết CT {reorderNumberVal} đang ở:{' '}
                        {reorderMatchSlot.week === selectedWeek ? '' : `Tuần ${reorderMatchSlot.week} · `}
                        {DAYS.find((d) => d.id === reorderMatchSlot.day)?.name || `Thứ ${reorderMatchSlot.day}`} · Tiết{' '}
                        {formatPeriodLabel(reorderMatchSlot.period)}
                      </p>
                    )}
                    {reorderError && <p className="text-[11px] text-rose-600 font-medium">{reorderError}</p>}
                  </div>

                  {reorderPreview && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">Trước:</span>
                        <span className="font-black text-slate-700">{reorderPreview.before.join(', ')}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">Sau khi đảo:</span>
                        <span className="font-black text-blue-800">{reorderPreview.after.join(', ')}</span>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400">
                    Chỉ cần nhập số tiết CT. Tiết đứng sau được đưa lên đúng vị trí của tiết đứng trước, các tiết nằm giữa dồn xuống. Các tiết còn lại giữ nguyên.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveReorder}
                      disabled={loading || reorderTarget === null}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>Áp dụng đảo tiết</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
