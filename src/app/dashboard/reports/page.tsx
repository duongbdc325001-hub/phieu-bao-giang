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
  HeightRule,
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

const getCurrentWeekNumber = () => {
  const startDate = new Date(2026, 8, 7)
  const today = new Date()

  startDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 1
  const currentWeek = Math.floor(diffDays / 7) + 1
  return Math.min(Math.max(currentWeek, 1), 35)
}

const formatPeriodLabel = (periodVal: any) => {
  if (periodVal === undefined || periodVal === null) return '1'
  const str = String(periodVal).trim()
  if (str.toUpperCase().startsWith('C-') || str.toUpperCase().startsWith('S-')) {
    return str.toUpperCase()
  }
  const num = Number(str)
  if (!isNaN(num) && num > 5) {
    return `C-${num - 5}`
  }
  return str
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

const MAX_WEEK = 35

// Một tiết của một lớp trên "dòng thời gian" (tuần 1 -> 35), kèm số tiết CT đang được gán
interface TimelineSlot {
  week: number
  idx: number // thứ tự tiết của lớp này trong tuần (khóa lưu vào lesson_overrides)
  day: number
  period: any
  assigned: number // số tiết CT đang hiển thị cho tiết này
  ovrValue: number | null // giá trị lưu trong lesson_overrides (nếu có)
  ovrType: string | null // 'cut' | 'swap' | 'anchor' | null
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
  const fetchAll = async (table: string): Promise<any[]> => {
    const pageSize = 1000
    let from = 0
    const all: any[] = []
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }
    return all
  }

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

  const calculateReportRows = () => {
    const weekRows: { day: typeof DAYS[0]; slots: any[] }[] = []
    const timelines = new Map<string, TimelineSlot[]>()
    if (schedule.length === 0 || classes.length === 0) return { weekRows, timelines }

    // Dựng TKB từng tuần từ 1 đến 35.
    // Tuần chưa có dữ liệu thì lấy theo tuần liền trước (cùng quy tắc với trang Thời khóa biểu).
    const weekSlotsMap = new Map<number, any[]>()
    let prevSlots: any[] = []
    for (let w = 1; w <= MAX_WEEK; w++) {
      let wSlots = schedule.filter((s) => Number(s.week_number || 1) === w && !s.is_substitute)
      if (wSlots.length === 0 && prevSlots.length > 0) {
        wSlots = prevSlots.map((slot) => ({ ...slot, week_number: w }))
      }
      wSlots = [...wSlots].sort((a, b) => {
        const d1 = Number(a.day_of_week || 2)
        const d2 = Number(b.day_of_week || 2)
        if (d1 !== d2) return d1 - d2
        return Number(a.period_number || 1) - Number(b.period_number || 1)
      })
      weekSlotsMap.set(w, wSlots)
      prevSlots = wSlots
    }

    const allActiveWeeksSlots: any[] = []
    weekSlotsMap.forEach((wSlots) => {
      allActiveWeeksSlots.push(...wSlots)
    })

    const classSlotsMap = new Map<string, any[]>()
    allActiveWeeksSlots.forEach((slot) => {
      const clsId = slot.class_id
      if (clsId) {
        if (!classSlotsMap.has(clsId)) classSlotsMap.set(clsId, [])
        classSlotsMap.get(clsId)!.push(slot)
      }
    })

    // Các khung PPCT thực sự có bài (để bỏ qua bản gán cũ trỏ vào khung đã bị xóa)
    const templatesWithItems = new Set<string>(curriculumItems.map((i) => String(i.template_id)))

    const lessonMapping = new Map<
      string,
      { order: number; name: string; isOverridden: boolean; ovrType: string | null; slotIdx: number; hasTemplate: boolean; timelineIndex: number }
    >()

    classSlotsMap.forEach((slots, classId) => {
      let templateId: string | null = null
      const relations = classCurriculums.filter((cc) => cc.class_id === classId)
      const matchedRel = relations.find((cc) => templatesWithItems.has(String(cc.template_id))) || relations[0]
      if (matchedRel) {
        templateId = String(matchedRel.template_id)
      } else {
        const cls = classes.find((c) => c.id === classId)
        if (cls?.template_id) templateId = String(cls.template_id)
      }

      let lessons: any[] = []
      if (templateId) {
        lessons = curriculumItems.filter((item) => String(item.template_id) === templateId)
      }

      const hasTemplate = !!templateId && lessons.length > 0
      lessons.sort((a, b) => Number(a.lesson_order || 1) - Number(b.lesson_order || 1))

      const slotsByWeek = new Map<number, any[]>()
      slots.forEach((slot) => {
        const wNum = Number(slot.week_number || 1)
        if (!slotsByWeek.has(wNum)) slotsByWeek.set(wNum, [])
        slotsByWeek.get(wNum)!.push(slot)
      })

      // Dòng thời gian của lớp: toàn bộ các tiết từ tuần 1 đến 35, theo đúng thứ tự dạy
      const timeline: TimelineSlot[] = []
      let globalPointer = 1

      for (let w = 1; w <= MAX_WEEK; w++) {
        const wSlots = slotsByWeek.get(w) || []

        wSlots.forEach((slot, weekSlotIdx) => {
          const day = Number(slot.day_of_week || 2)
          const period = slot.period_number

          const ovr = hasTemplate
            ? overrides.find(
                (o) => o.class_id === classId && Number(o.week_number) === w && Number(o.slot_order_in_week) === weekSlotIdx
              )
            : undefined

          let assignedOrder = globalPointer
          let ovrValue: number | null = null
          let ovrType: string | null = null

          if (ovr && ovr.override_lesson_order) {
            assignedOrder = Number(ovr.override_lesson_order)
            ovrValue = assignedOrder
            ovrType = ovr.override_type || 'cut'
          }

          timeline.push({ week: w, idx: weekSlotIdx, day, period, assigned: assignedOrder, ovrValue, ovrType })

          if (w === selectedWeek) {
            const foundLesson = lessons.find((l) => Number(l.lesson_order) === assignedOrder) || lessons[assignedOrder - 1]
            const mapKey = `${w}_${day}_${period}_${classId}`
            lessonMapping.set(mapKey, {
              order: !hasTemplate ? 0 : assignedOrder,
              name: !hasTemplate ? '' : (foundLesson ? foundLesson.lesson_name : `Tiết học số ${assignedOrder}`),
              // 'anchor' là mốc nối kỹ thuật sau khi đảo tiết, không hiện nhãn "Cắt tiết"
              isOverridden: ovrType !== null && ovrType !== 'anchor',
              ovrType,
              slotIdx: weekSlotIdx,
              hasTemplate: hasTemplate,
              timelineIndex: timeline.length - 1,
            })
          }

          globalPointer = assignedOrder + 1
        })
      }

      timelines.set(classId, timeline)
    })

    const currentWeekSlots = weekSlotsMap.get(Number(selectedWeek)) || []

    DAYS.forEach((day) => {
      const dayMatchedSlots = currentWeekSlots.filter((s) => Number(s.day_of_week) === day.id)
      dayMatchedSlots.sort((a, b) => {
        const p1 = String(a.period_number || '1')
        const p2 = String(b.period_number || '1')
        return p1.localeCompare(p2, undefined, { numeric: true })
      })

      const daySlots: any[] = []

      if (dayMatchedSlots.length > 0) {
        dayMatchedSlots.forEach((matchedSlot) => {
          if (matchedSlot && matchedSlot.class_id) {
            const p = matchedSlot.period_number
            const cls = classes.find((c) => c.id === matchedSlot.class_id)
            const classCode = cls ? cls.code : (matchedSlot.sub_class_code || 'Lớp')
            const subjectName = cls ? cls.subject : (matchedSlot.sub_subject || 'Toán')

            const activeWeek = Number(selectedWeek)
            const mapKey = `${activeWeek}_${day.id}_${p}_${matchedSlot.class_id}`
            const lessonInfo = lessonMapping.get(mapKey) || {
              order: 1, name: '', isOverridden: false, ovrType: null, slotIdx: 0, hasTemplate: false, timelineIndex: -1,
            }

            daySlots.push({
              isEmpty: false,
              entry: matchedSlot,
              day: day.id,
              period: formatPeriodLabel(p),
              realClassId: matchedSlot.class_id,
              subjectClass: `${subjectName} - ${classCode}`,
              lessonOrder: lessonInfo.order,
              lessonName: lessonInfo.name,
              isSubstitute: matchedSlot.is_substitute || false,
              isOverridden: lessonInfo.isOverridden,
              noteLabel: lessonInfo.ovrType === 'swap' ? 'Đảo tiết' : (lessonInfo.isOverridden ? 'Cắt tiết' : ''),
              slotOrderInWeek: lessonInfo.slotIdx,
              timelineIndex: lessonInfo.timelineIndex,
              hasTemplate: lessonInfo.hasTemplate,
            })
          }
        })
      } else {
        for (let i = 1; i <= 4; i++) {
          daySlots.push({
            isEmpty: true,
            day: day.id,
            period: String(i),
            subjectClass: '',
            lessonOrder: '',
            lessonName: '',
            noteLabel: '',
            hasTemplate: true,
          })
        }
      }

      if (daySlots.length > 0) {
        weekRows.push({ day, slots: daySlots })
      }
    })

    return { weekRows, timelines }
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
              height: { value: MIN_ROW_H, rule: HeightRule.AT_LEAST },
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
          <p className="text-xs text-slate-500">Ngày nghỉ tự động hiển thị 4 dòng rỗng giữ chỗ. Phiếu Word luôn xuất đủ 5 dòng (Tiết 1–5) mỗi ngày.</p>
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
            {reportData.map((group) => {
              return group.slots.map((slot: any, idx: number) => {
                const isFirst = idx === 0

                return (
                  <tr key={`${group.day.id}_p${slot.period}_${idx}`} className="hover:bg-slate-50/80 transition">
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
                      {slot.isEmpty ? <span className="text-slate-300">—</span> : slot.subjectClass}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-center font-black text-emerald-700 text-sm">
                      {slot.period}
                    </td>
                    <td className="p-3 border-r border-slate-300 align-middle">
                      {slot.isEmpty ? (
                        <span className="text-slate-300 italic">—</span>
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
                      {slot.isEmpty ? (
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
                              tIdx: slot.timelineIndex,
                            })
                            setEditMode('cut')
                            setReorderNumber('')
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
                      {slot.isEmpty ? (
                        <span className="text-slate-300">—</span>
                      ) : !slot.hasTemplate ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Thiếu PPCT</span>
                      ) : slot.noteLabel ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">{slot.noteLabel}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            })}
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
