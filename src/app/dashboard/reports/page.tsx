'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useSchoolYear } from '@/components/school-year'
import { weekOf, dateOf, formatDay, isFinished } from '@/lib/namHoc'
import {
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
import { RefreshCw, ArrowLeftRight, X, FileText, Download, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react'
import { PageHeader, WeekSelect, BTN_PRIMARY, BTN_SECONDARY, BTN_ICON } from '@/components/ui/page'
import { subjectTone, splitSubjectClass, periodText } from '@/lib/mauMon'

const subjectStyle = (subject: string) => subjectTone(subject).chip

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
  const { year, current } = useSchoolYear()
  const yearId = year.id
  const [selectedWeek, setSelectedWeek] = useState(() => weekOf(year))
  // Đổi năm học -> về tuần hiện tại (hoặc tuần 1) của năm đó
  const [shownYearId, setShownYearId] = useState(yearId)
  if (shownYearId !== yearId) {
    setShownYearId(yearId)
    setSelectedWeek(weekOf(year))
  }
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
    isSkipped: boolean
    skipNote: string
  } | null>(null)
  const [skipNoteInput, setSkipNoteInput] = useState('')
  const [targetLessonOrder, setTargetLessonOrder] = useState<number>(1)
  const [editMode, setEditMode] = useState<'cut' | 'reorder' | 'skip'>('cut')
  const [reorderNumber, setReorderNumber] = useState<string>('') // số tiết CT người dùng nhập ở tab Đảo tiết

  const getFormattedDate = (offset: number) => {
    const d = dateOf(year, selectedWeek, offset)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  // Supabase mặc định chỉ trả tối đa 1000 dòng mỗi lần. Đọc theo từng trang để không bị cắt mất dữ liệu
  // (ví dụ nhiều khung PPCT x ~105 tiết, hoặc TKB nhiều tuần).
  const fetchAll = (table: string, eq: Record<string, string> = {}) => fetchAllRows(supabase, table, eq)

  const loadSeq = useRef(0)
  const loadData = async () => {
    const mySeq = ++loadSeq.current
    setLoading(true)
    try {
      const [cData, sData, ccData, itemsData, ovrData] = await Promise.all([
        fetchAll('classes'),
        // TKB, gán PPCT và cắt/đảo tiết lưu riêng theo năm học
        fetchAll('schedule_entries', { school_year: yearId }),
        fetchAll('class_curriculums', { school_year: yearId }),
        fetchAll('curriculum_items'),
        fetchAll('lesson_overrides', { school_year: yearId }),
      ])
      if (mySeq !== loadSeq.current) return // đã đổi sang năm học khác trong lúc tải
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
  }, [yearId])

  // Mở hộp thoại cắt tiết / đảo tiết cho một tiết
  const openEditSlot = (slot: any) => {
    setEditingSlot({
      classId: slot.realClassId,
      slotIdx: slot.slotOrderInWeek,
      currentOrder: Number(slot.lessonOrder) || 1,
      isOverridden: slot.isOverridden,
      tIdx: slot.timelineIndex,
      isSkipped: !!slot.isSkipped,
      skipNote: slot.skipNote || '',
    })
    setSkipNoteInput('')
    setEditMode('cut')
    setReorderNumber('')
    setTargetLessonOrder(Number(slot.lessonOrder) || 1)
  }

  // Đánh dấu "hôm nay" khi đang xem tuần hiện tại của năm học hiện tại
  const todayId = (() => { const d = new Date().getDay(); return d === 0 ? 8 : d + 1 })()
  const isCurrentWeek = year.id === current.id && selectedWeek === weekOf(year)

  // Logic tính tiết nằm ở src/lib/baoGiang.ts (dùng chung với trang Tiến độ)
  const calculateReportRows = () => {
    const plan = buildLessonPlan(schedule, classes, classCurriculums, curriculumItems, overrides, year.weeks)
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

  // NGHỈ TIẾT: tiết vẫn hiện nhưng không tính vào PPCT (lưu trong lesson_overrides, loại 'skip')
  const handleSetSkip = async (on: boolean) => {
    if (!editingSlot) return
    setLoading(true)
    try {
      if (on) {
        const { error } = await supabase.from('lesson_overrides').upsert(
          {
            class_id: editingSlot.classId,
            school_year: yearId,
            week_number: Number(selectedWeek),
            slot_order_in_week: Number(editingSlot.slotIdx),
            is_skipped: true,
            override_lesson_order: null,
            override_type: 'skip',
            notes: skipNoteInput.trim() || null,
          },
          { onConflict: 'class_id,school_year,week_number,slot_order_in_week' }
        )
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('lesson_overrides')
          .delete()
          .eq('class_id', editingSlot.classId)
          .eq('school_year', yearId)
          .eq('week_number', Number(selectedWeek))
          .eq('slot_order_in_week', Number(editingSlot.slotIdx))
          .eq('override_type', 'skip')
        if (error) throw error
      }
      setEditingSlot(null)
      await loadData()
    } catch (err: any) {
      alert('Lỗi lưu nghỉ tiết: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveOverride = async () => {
    if (!editingSlot) return
    setLoading(true)

    try {
      const payload = {
        class_id: editingSlot.classId,
        school_year: yearId,
        week_number: Number(selectedWeek),
        slot_order_in_week: Number(editingSlot.slotIdx),
        is_skipped: false,
        override_lesson_order: Number(targetLessonOrder),
        override_type: 'cut',
      }

      const { error } = await supabase.from('lesson_overrides').upsert(
        payload,
        { onConflict: 'class_id,school_year,week_number,slot_order_in_week' }
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
        school_year: yearId,
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
          .eq('school_year', yearId)
          .eq('week_number', t.week)
          .eq('slot_order_in_week', t.idx)
        if (error) throw error
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from('lesson_overrides')
          .upsert(toUpsert, { onConflict: 'class_id,school_year,week_number,slot_order_in_week' })
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
  // ===== XUẤT WORD =====
  // Độ rộng cột cố định (DXA) để Word, WPS, LibreOffice và trình xem trên điện thoại hiển thị giống nhau.
  // Tổng = 9026 = bề rộng nội dung khổ A4 với lề 2,54 cm.
  const COL_W = [1264, 1625, 1083, 3249, 903, 902]
  const TABLE_W = COL_W.reduce((sum, w) => sum + w, 0)

  // Ngày dd/mm của một ngày trong tuần bất kỳ của năm học đang chọn
  const formatDateOfWeek = (week: number, offset: number) => {
    const d = dateOf(year, week, offset)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // Tiêu đề Sở / Trường + Quốc hiệu (dùng cho từng phiếu tuần và trang bìa sổ)
  const buildDocHeaderTable = () => {
    const invisibleBorder = { style: BorderStyle.NIL, size: 0, color: 'auto' }
    const noBorders = { top: invisibleBorder, bottom: invisibleBorder, left: invisibleBorder, right: invisibleBorder }
    const noTableBorders = { ...noBorders, insideHorizontal: invisibleBorder, insideVertical: invisibleBorder }
    return (
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
      })
    )
  }

  // Nội dung Word của MỘT tuần (phiếu 1 tuần và sổ báo giảng nhiều tuần dùng chung)
  const buildWeekDocChildren = (week: number, weekRows: { day: any; slots: any[] }[]) => {
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

    weekRows.forEach((group) => {
      const dayName = group.day.name
      const dayDate = formatDateOfWeek(week, group.day.offset)
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
        const lessonDisplay = slot.isEmpty ? '' : slot.isSkipped ? 'Nghỉ' : (!slot.hasTemplate ? '(Chưa có PPCT)' : (slot.lessonName || ''))
        const orderDisplay = slot.isEmpty ? '' : (slot.isSkipped || !slot.hasTemplate ? '—' : String(slot.lessonOrder))
        const noteText = slot.isEmpty ? '' : slot.isSkipped ? slot.noteLabel : (!slot.hasTemplate ? 'Chưa có PPCT' : slot.noteLabel)

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

    return [
      buildDocHeaderTable(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 60 },
        children: [new TextRun({ text: `PHIẾU BÁO GIẢNG TUẦN ${week < 10 ? '0' + week : week}`, bold: true, size: 26 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: `(Tuần học thứ ${week} của năm học ${yearId})`, italics: true, size: 20 })],
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
    ]
  }

  const handleExportWord = async () => {
    if (reportData.length === 0) {
      alert('Tuần này chưa có dữ liệu để xuất!')
      return
    }

    setExportingWord(true)
    try {
      const doc = new Document({ sections: [{ children: buildWeekDocChildren(selectedWeek, reportData) }] })
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `Phieu_Bao_Giang_Tuan_${selectedWeek}.docx`)
    } catch (err: any) {
      alert('Lỗi xuất Word: ' + err.message)
    } finally {
      setExportingWord(false)
    }
  }

  // ===== XUẤT SỔ BÁO GIẢNG: nhiều tuần trong một file Word (trang bìa + mỗi tuần một trang) =====
  const [bookOpen, setBookOpen] = useState(false)
  const [bookFrom, setBookFrom] = useState(1)
  const [bookTo, setBookTo] = useState(1)
  const [exportingBook, setExportingBook] = useState(false)

  // Mặc định: từ tuần 1 đến tuần hiện tại (năm học đã kết thúc thì lấy hết các tuần)
  const openBookDialog = () => {
    const lastDone = year.id === current.id && !isFinished(year) ? weekOf(year) : year.weeks
    setBookFrom(1)
    setBookTo(Math.max(1, lastDone))
    setBookOpen(true)
  }

  const handleExportBook = async () => {
    const from = Math.min(bookFrom, bookTo)
    const to = Math.max(bookFrom, bookTo)
    setExportingBook(true)
    try {
      const plan = buildLessonPlan(schedule, classes, classCurriculums, curriculumItems, overrides, year.weeks)
      const weekSections: { children: any[] }[] = []
      for (let w = from; w <= to; w++) {
        const rows = buildWeekRows(w, plan, classes)
        // bỏ qua tuần không có tiết nào
        if (!rows.some((g) => g.slots.some((sl: any) => !sl.isEmpty))) continue
        weekSections.push({ children: buildWeekDocChildren(w, rows) })
      }
      if (weekSections.length === 0) {
        alert(`Từ tuần ${from} đến tuần ${to} chưa có tiết dạy nào để xuất.`)
        return
      }

      // Tên giáo viên cho trang bìa
      let teacherName = ''
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
          teacherName = prof?.full_name || user.email?.split('@')[0] || ''
        }
      } catch { /* không lấy được tên thì để trống dòng chấm */ }

      const fullDate = (w: number, offset: number) => formatDay(dateOf(year, w, offset))
      const line = (text: string, opts: { size?: number; bold?: boolean; italics?: boolean; before?: number; after?: number } = {}) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: opts.before ?? 0, after: opts.after ?? 120 },
          children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 24 })],
        })

      const cover = {
        children: [
          buildDocHeaderTable(),
          line('SỔ BÁO GIẢNG', { size: 56, bold: true, before: 3000, after: 240 }),
          line(`NĂM HỌC ${yearId}`, { size: 32, bold: true, after: 1200 }),
          line(`Giáo viên: ${teacherName || '.............................................'}`, { size: 28, after: 240 }),
          line(`Từ tuần ${from} (${fullDate(from, 0)}) đến tuần ${to} (${fullDate(to, 5)})`, { size: 24, italics: true, after: 120 }),
          line(`Gồm ${weekSections.length} phiếu báo giảng tuần`, { size: 24, italics: true }),
        ],
      }

      const doc = new Document({ sections: [cover, ...weekSections] })
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `So_Bao_Giang_${yearId}_Tuan_${from}-${to}.docx`)
      setBookOpen(false)
    } catch (err: any) {
      alert('Lỗi xuất sổ báo giảng: ' + err.message)
    } finally {
      setExportingBook(false)
    }
  }

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
          'Tên bài dạy': slot.isEmpty ? '' : slot.isSkipped ? slot.noteLabel : (!slot.hasTemplate ? 'CHƯA CÓ PPCT' : (slot.lessonName || '')),
          'Tiết CT': slot.isEmpty ? '' : (slot.isSkipped || !slot.hasTemplate ? '—' : slot.lessonOrder),
        })
      })
    })

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `Tuan_${selectedWeek}`)
    XLSX.writeFile(workbook, `Phieu_Bao_Giang_Tuan_${selectedWeek}.xlsx`)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      <PageHeader
        title="Lịch báo giảng"
        subtitle="Bấm vào số tiết CT để cắt tiết hoặc đảo tiết. Phiếu Word luôn in đủ tiết 1–5 mỗi ngày."
        actions={
          <>
            <WeekSelect value={selectedWeek} weeks={year.weeks} onChange={setSelectedWeek} current={year.id === current.id ? weekOf(year) : undefined} />
            <button onClick={handleExportWord} disabled={exportingWord || loading} className={BTN_PRIMARY} title="Xuất phiếu báo giảng tuần này ra Word">
              <FileText className="w-4 h-4" />
              <span>Word</span>
            </button>
            <button onClick={openBookDialog} disabled={loading || exportingBook} className={BTN_SECONDARY} title="Xuất nhiều tuần (các tuần đã dạy) vào một file Word">
              <BookOpen className="w-4 h-4" />
              <span>Xuất sổ</span>
            </button>
            <button onClick={handleExportExcel} disabled={loading} className={BTN_SECONDARY} title="Xuất tuần này ra Excel">
              <Download className="w-4 h-4" />
              <span>Excel</span>
            </button>
            <button onClick={loadData} disabled={loading} title="Tải lại" className={BTN_ICON}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>
        }
      />

      {/* TÓM TẮT TUẦN */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <p className="text-sm text-slate-700">
          <span className="font-bold text-slate-900">Tuần {selectedWeek}</span>
          <span className="ml-2 text-slate-500">{getFormattedDate(0)} – {getFormattedDate(5)}</span>
        </p>
        <p className="text-sm text-slate-500">
          <span className="font-bold text-slate-900 tabular-nums">{totalSlotsCount}</span> tiết dạy
        </p>
      </div>

      {/* MÁY TÍNH: BẢNG BÁO GIẢNG */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[17%]" />
              <col className="w-[9%]" />
              <col className="w-[41%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3 py-2.5 text-center border-r border-slate-200">Thứ, ngày</th>
                <th className="px-3 py-2.5 border-l border-slate-200">Lớp - môn</th>
                <th className="px-3 py-2.5 text-center border-l border-slate-200">Tiết TKB</th>
                <th className="px-4 py-2.5 border-l border-slate-200">Tên bài dạy theo PPCT</th>
                <th className="px-3 py-2.5 text-center border-l border-slate-200">Tiết CT</th>
                <th className="px-3 py-2.5 text-center border-l border-slate-200">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((group) => {
                const isDayOff = group.slots.every((s: any) => s.isEmpty)
                const isToday = isCurrentWeek && group.day.id === todayId

                const dayCell = (rowSpan: number) => (
                  <td
                    rowSpan={rowSpan}
                    className={`px-3 py-2.5 text-center align-middle border-r border-slate-200 ${isToday ? 'bg-emerald-50' : 'bg-slate-50/70'}`}
                  >
                    <span className={`block text-sm font-bold ${isDayOff ? 'text-slate-400' : 'text-slate-900'}`}>{group.day.name}</span>
                    <span className={`block text-xs ${isToday ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      {getFormattedDate(group.day.offset)}{isToday ? ' · hôm nay' : ''}
                    </span>
                  </td>
                )

                if (isDayOff) {
                  return (
                    <tr key={`off_${group.day.id}`} className="border-t-2 border-slate-300">
                      {dayCell(1)}
                      <td colSpan={5} className="px-4 py-2.5 text-sm text-slate-400">Không có tiết dạy</td>
                    </tr>
                  )
                }

                return group.slots.map((slot: any, idx: number) => {
                  const isFirst = idx === 0
                  const { subject, code } = splitSubjectClass(slot.subjectClass || '')
                  const isAfternoon = String(slot.period).toUpperCase().startsWith('C-')
                  const noteStyle = slot.isSkipped
                    ? 'bg-slate-100 text-slate-600 ring-slate-300'
                    : slot.noteLabel === 'Đảo tiết'
                      ? 'bg-violet-50 text-violet-800 ring-violet-200'
                      : 'bg-amber-50 text-amber-800 ring-amber-200'

                  return (
                    <tr
                      key={`${group.day.id}_p${slot.period}_${idx}`}
                      className={`group hover:bg-slate-50/70 ${isFirst ? 'border-t-2 border-slate-300' : 'border-t border-slate-100'} ${slot.isSkipped ? 'bg-slate-50/60' : ''}`}
                    >
                      {isFirst && dayCell(group.slots.length)}

                      <td className="px-3 py-2.5 border-l border-slate-200">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{code}</span>
                          {subject && (
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${subjectStyle(subject)}`}>
                              {subject}
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-center border-l border-slate-200">
                        <span className={`text-sm tabular-nums ${isAfternoon ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
                          {slot.period}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 align-middle border-l border-slate-200">
                        {slot.isSkipped ? (
                          <span className="text-[13px] italic text-slate-400">Nghỉ tiết{slot.skipNote ? ` – ${slot.skipNote}` : ''} (không tính PPCT)</span>
                        ) : !slot.hasTemplate ? (
                          <Link
                            href="/dashboard/curriculum"
                            className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100"
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Chưa có PPCT, bấm để gán</span>
                          </Link>
                        ) : (
                          <span title={slot.lessonName} className="line-clamp-2 text-[13px] leading-snug text-slate-900">
                            {slot.lessonName}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-center border-l border-slate-200">
                        {(slot.hasTemplate || slot.isSkipped) && (
                          <button
                            type="button"
                            onClick={() => openEditSlot(slot)}
                            title="Bấm để cắt tiết, đảo tiết hoặc nghỉ tiết"
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                              slot.isOverridden || slot.isSkipped ? noteStyle : 'bg-white text-slate-900 ring-slate-300 hover:bg-emerald-50 hover:ring-emerald-500'
                            }`}
                          >
                            <span>{slot.isSkipped ? 'Nghỉ' : slot.lessonOrder}</span>
                            <ArrowLeftRight className="h-3 w-3 opacity-40 transition group-hover:opacity-100" />
                          </button>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-center border-l border-slate-200">
                        {slot.isSkipped ? (
                          <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${noteStyle}`}>Nghỉ</span>
                        ) : !slot.hasTemplate ? (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">Thiếu PPCT</span>
                        ) : slot.noteLabel ? (
                          <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${noteStyle}`}>{slot.noteLabel}</span>
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

      {/* ĐIỆN THOẠI: TỪNG NGÀY DẠNG THẺ */}
      <div className="md:hidden space-y-2.5">
        {reportData.map((group) => {
          const real = group.slots.filter((s: any) => !s.isEmpty)
          const isToday = isCurrentWeek && group.day.id === todayId
          if (real.length === 0) {
            return (
              <div key={`moff_${group.day.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/60 px-4 py-2.5">
                <span className="text-sm font-semibold text-slate-400">{group.day.name} <span className="font-normal">{getFormattedDate(group.day.offset)}</span></span>
                <span className="text-xs text-slate-400">Không có tiết</span>
              </div>
            )
          }
          return (
            <div key={`m_${group.day.id}`} className={`rounded-xl border bg-white shadow-sm overflow-hidden ${isToday ? 'border-emerald-300' : 'border-slate-200'}`}>
              <div className={`flex items-center justify-between px-4 py-2 border-b ${isToday ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <span className="text-sm font-bold text-slate-900">{group.day.name} <span className="font-normal text-slate-500">{getFormattedDate(group.day.offset)}</span></span>
                <span className={`text-xs ${isToday ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{isToday ? 'Hôm nay · ' : ''}{real.length} tiết</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {real.map((slot: any, idx: number) => {
                  const { subject, code } = splitSubjectClass(slot.subjectClass || '')
                  const tone = subjectTone(subject)
                  const noteStyle = slot.isSkipped
                    ? 'bg-slate-100 text-slate-600 ring-slate-300'
                    : slot.noteLabel === 'Đảo tiết' ? 'bg-violet-50 text-violet-800 ring-violet-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
                  return (
                    <li key={`m_${group.day.id}_${idx}`} className="relative flex items-start gap-3 pl-4 pr-3 py-2.5">
                      <span className={`absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r ${tone.bar}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{code}</span>
                          {subject && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone.chip}`}>{subject}</span>}
                          <span className="text-xs text-slate-500">{periodText(slot.period)}</span>
                          {(slot.hasTemplate || slot.isSkipped) && slot.noteLabel && (
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${noteStyle}`}>{slot.noteLabel}</span>
                          )}
                        </div>
                        {slot.isSkipped ? (
                          <p className="mt-1 text-[13px] italic text-slate-400">Nghỉ tiết, không tính PPCT</p>
                        ) : slot.hasTemplate ? (
                          <p className="mt-1 text-[13px] leading-snug text-slate-700">{slot.lessonName}</p>
                        ) : (
                          <Link href="/dashboard/curriculum" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                            <AlertCircle className="h-3.5 w-3.5" /> Chưa có PPCT, bấm để gán
                          </Link>
                        )}
                      </div>
                      {(slot.hasTemplate || slot.isSkipped) && (
                        <button
                          type="button"
                          onClick={() => openEditSlot(slot)}
                          title="Cắt tiết, đảo tiết hoặc nghỉ tiết"
                          className={`shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-lg ring-1 ring-inset ${
                            slot.isOverridden || slot.isSkipped ? noteStyle : 'bg-white text-slate-900 ring-slate-300 active:bg-emerald-50'
                          }`}
                        >
                          <span className="text-[10px] font-medium opacity-60 leading-none">Tiết CT</span>
                          <span className={`font-bold tabular-nums leading-tight ${slot.isSkipped ? 'text-xs' : 'text-base'}`}>{slot.isSkipped ? 'Nghỉ' : slot.lessonOrder}</span>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {/* POPUP ĐIỀU CHỈNH TIẾN ĐỘ */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-bold text-slate-900 text-base">{editingSlot.isSkipped ? 'Tiết nghỉ' : `Tiết CT số ${editingSlot.currentOrder}`}</span>
              <button onClick={() => setEditingSlot(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {editingSlot.isSkipped ? (
              <div className="space-y-3 text-sm">
                <p className="text-slate-600">
                  Tiết này đang được đánh dấu <span className="font-semibold text-slate-900">nghỉ</span>
                  {editingSlot.skipNote ? <> ({editingSlot.skipNote})</> : null}: vẫn hiện trên thời khóa biểu nhưng không tính vào PPCT.
                </p>
                <button onClick={() => handleSetSkip(false)} disabled={loading} className={`${BTN_PRIMARY} w-full h-11 text-sm`}>
                  Bỏ nghỉ, tính lại tiết này
                </button>
              </div>
            ) : (
            <>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold" role="tablist">
              {([['cut', 'Cắt tiết'], ['reorder', 'Đảo tiết'], ['skip', 'Nghỉ tiết']] as const).map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={editMode === k}
                  onClick={() => setEditMode(k)}
                  className={`flex-1 py-2 rounded-md cursor-pointer transition ${
                    editMode === k ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {editMode === 'skip' ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-600 text-sm">
                  Tiết vẫn hiện trên thời khóa biểu và phiếu báo giảng (ghi "Nghỉ"), nhưng <span className="font-semibold">không tính vào PPCT</span>:
                  tiết dạy tiếp theo sẽ mang số {editingSlot.currentOrder}.
                </p>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Lý do (không bắt buộc)</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={skipNoteInput}
                    onChange={(e) => setSkipNoteInput(e.target.value)}
                    placeholder="VD: Nghỉ lễ, Thi giữa kỳ, Hoạt động trường"
                    className="w-full h-11 px-3 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button onClick={() => handleSetSkip(true)} disabled={loading} className={`${BTN_PRIMARY} w-full h-11 text-sm`}>
                  Đánh dấu nghỉ tiết
                </button>
              </div>
            ) : (
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
                      className="w-full h-11 border border-slate-300 rounded-lg font-bold text-center text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400">Các tiết CT ở giữa bị bỏ qua, các tiết sau đếm tiếp từ số này.</p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveOverride}
                      disabled={loading}
                      className={`${BTN_PRIMARY} flex-1 h-11 text-sm`}
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
                      className="w-full h-11 border border-slate-300 rounded-lg font-bold text-center text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">Trước:</span>
                        <span className="font-black text-slate-700">{reorderPreview.before.join(', ')}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">Sau khi đảo:</span>
                        <span className="font-bold text-emerald-800">{reorderPreview.after.join(', ')}</span>
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
                      className={`${BTN_PRIMARY} flex-1 h-11 text-sm`}
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>Áp dụng đảo tiết</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {/* HỘP THOẠI XUẤT SỔ BÁO GIẢNG */}
      {bookOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !exportingBook && setBookOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-700" /> Xuất sổ báo giảng
              </h2>
              <button onClick={() => setBookOpen(false)} disabled={exportingBook} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Năm học <span className="font-bold text-slate-700">{yearId}</span>. Một file Word gồm trang bìa và mỗi tuần một phiếu
              (cùng mẫu với nút Word). Tuần không có tiết dạy sẽ được bỏ qua.
            </p>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span>Từ tuần</span>
              <select value={bookFrom} onChange={(e) => setBookFrom(Number(e.target.value))} className="px-2 py-1.5 border rounded-lg">
                {Array.from({ length: year.weeks }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <span>đến tuần</span>
              <select value={bookTo} onChange={(e) => setBookTo(Number(e.target.value))} className="px-2 py-1.5 border rounded-lg">
                {Array.from({ length: year.weeks }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-slate-500">
              {formatDay(dateOf(year, Math.min(bookFrom, bookTo), 0))} – {formatDay(dateOf(year, Math.max(bookFrom, bookTo), 5))}
            </p>
            <button
              onClick={handleExportBook}
              disabled={exportingBook}
              className={`${BTN_PRIMARY} w-full h-11 text-sm`}
            >
              {exportingBook ? 'Đang tạo file...' : 'Xuất file Word'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
