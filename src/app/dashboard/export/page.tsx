'use client'

import { useState, useEffect } from 'react'
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
import { FileSpreadsheet, FileText, CheckCircle } from 'lucide-react'

interface ScheduleSlot {
  id: string
  day_of_week: number
  session: string
  period_number: number
  class_id: string
  classes?: { code: string; subject: string }
}

interface CurriculumItem {
  id: string
  class_id: string
  lesson_order: number
  lesson_name: string
}

const DAY_NAMES: Record<number, string> = {
  2: 'Thứ Hai',
  3: 'Thứ Ba',
  4: 'Thứ Tư',
  5: 'Thứ Năm',
  6: 'Thứ Sáu',
  7: 'Thứ Bảy',
}

const DEFAULT_START_DATE = '2026-09-07'

export default function ExportPage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE)
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([])
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const { data: schedData } = await supabase
        .from('schedule_entries')
        .select('id, day_of_week, session, period_number, class_id, classes(code, subject)')
        .eq('week_number', 0)
        .order('day_of_week', { ascending: true })
        .order('period_number', { ascending: true })

      if (schedData) setSchedule(schedData as any)

      const { data: currData } = await supabase
        .from('curriculum_items')
        .select('*')
        .order('lesson_order', { ascending: true })

      if (currData) setCurriculum(currData)
    }
    fetchData()
  }, [])

  const getLessonForSlot = (classId: string, currentSlotIdx: number) => {
    const classLessons = curriculum.filter((c) => c.class_id === classId)
    if (classLessons.length === 0) return null

    const periodsPerWeek = schedule.filter((s) => s.class_id === classId).length
    if (periodsPerWeek === 0) return null

    const currentSlotInWeekOrder = schedule.slice(0, currentSlotIdx).filter((s) => s.class_id === classId).length
    const targetIndex = (selectedWeek - 1) * periodsPerWeek + currentSlotInWeekOrder

    return classLessons[targetIndex] || null
  }

  const getDateOfDay = (dayOfWeek: number) => {
    const base = new Date(startDate)
    const offsetDays = (selectedWeek - 1) * 7 + (dayOfWeek - 2)
    base.setDate(base.getDate() + offsetDays)
    return `${base.getDate()}/${base.getMonth() + 1}`
  }

  const handleExportWord = async () => {
    setDownloading(true)

    const days = [2, 3, 4, 5, 6, 7]
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
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Điều chỉnh', bold: true, size: 21 })] })],
          }),
        ],
      }),
    ]

    days.forEach((dayNum) => {
      const slotsOfDay = schedule.filter((s) => s.day_of_week === dayNum)
      const dayName = DAY_NAMES[dayNum]
      const dayDate = getDateOfDay(dayNum)

      if (slotsOfDay.length === 0) {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dayName, bold: true, size: 20 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dayDate, italics: true, size: 18 })] }),
                ],
              }),
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('')] }),
            ],
          })
        )
      } else {
        slotsOfDay.forEach((slot, sIdx) => {
          const globalIdx = schedule.indexOf(slot)
          const lesson = getLessonForSlot(slot.class_id, globalIdx)
          const isFirstSlot = sIdx === 0

          const rowCells: TableCell[] = []

          if (isFirstSlot) {
            rowCells.push(
              new TableCell({
                rowSpan: slotsOfDay.length,
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

          rowCells.push(
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `${slot.classes?.subject || ''}-${slot.classes?.code || ''}`, size: 20 })],
                }),
              ],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: String(slot.period_number), size: 20 })],
                }),
              ],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [new TextRun({ text: lesson ? lesson.lesson_name : '', size: 20 })],
                }),
              ],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: lesson ? String(lesson.lesson_order) : '', size: 20 })],
                }),
              ],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun('')] })],
            })
          )

          tableRows.push(new TableRow({ children: rowCells }))
        })
      }
    })

    const startDateObj = new Date(startDate)
    const offsetStart = (selectedWeek - 1) * 7
    startDateObj.setDate(startDateObj.getDate() + offsetStart)
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
          properties: {},
          children: [
            // BẢNG TIÊU ĐỀ ĐÃ NỚI RỘNG ĐỂ CHỮ "THỤ" LÊN CÙNG HÀNG
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
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: 'SỞ GD&ĐT PHÚ THỌ', size: 19 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [
                            new TextRun({
                              text: 'TRƯỜNG THPT CHUYÊN HOÀNG VĂN THỤ',
                              bold: true,
                              size: 19,
                            }),
                          ],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 48, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 19 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: 'Độc lập - Tự do - Hạnh phúc', bold: true, size: 19, underline: {} })],
                        }),
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

            new Paragraph({ text: '', spacing: { before: 250 } }),

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
                      width: { size: 50, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: 'KIỂM TRA CỦA HIỆU TRƯỞNG', bold: true, size: 20 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: `Ngày ${fromD < 10 ? '0' + fromD : fromD} tháng ${fromM < 10 ? '0' + fromM : fromM} năm ${fromY}`, size: 18 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: '(Ký, ghi rõ họ tên và đóng dấu)', italics: true, size: 17 })],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 50, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: 'KIỂM TRA CỦA TTCM', bold: true, size: 20 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: `Ngày ${toD < 10 ? '0' + toD : toD} tháng ${toM < 10 ? '0' + toM : toM} năm ${toY}`, size: 18 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: '(Ký và ghi rõ họ tên)', italics: true, size: 17 })],
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
    setDownloading(false)
  }

  const handleExportExcel = () => {
    const rows = schedule.map((slot, idx) => {
      const lesson = getLessonForSlot(slot.class_id, idx)
      return {
        'Thứ, ngày': `${DAY_NAMES[slot.day_of_week]} (${getDateOfDay(slot.day_of_week)})`,
        'Môn - Lớp': `${slot.classes?.subject || ''}-${slot.classes?.code || ''}`,
        'Tiết theo TKB': slot.period_number,
        'Tên bài dạy': lesson ? lesson.lesson_name : '',
        'Tiết theo CT': lesson ? lesson.lesson_order : '',
        'Điều chỉnh': '',
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `Tuan_${selectedWeek}`)
    XLSX.writeFile(workbook, `Lich_Bao_Giang_Tuan_${selectedWeek}.xlsx`)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-800">Xuất Phiếu Báo Giảng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Xuất tệp Word (.docx) chuẩn phôi Mẫu C2 với tiêu đề trường nguyên hàng và cột Thứ liền mạch.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700">Ngày bắt đầu Tuần 1:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700">Chọn tuần:</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="px-4 py-2 border rounded-lg bg-white text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500"
            >
              {Array.from({ length: 35 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Tuần {w < 10 ? '0' + w : w}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <button
            onClick={handleExportWord}
            disabled={downloading || schedule.length === 0}
            className="flex items-center justify-center gap-3 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-sm disabled:opacity-50"
          >
            <FileText className="w-5 h-5 text-blue-200" />
            <span>{downloading ? 'Đang tạo Word...' : 'Xuất File Word Mẫu C2 (.docx)'}</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={downloading || schedule.length === 0}
            className="flex items-center justify-center gap-3 p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-200" />
            <span>Tải Về Tệp Excel (.xlsx)</span>
          </button>
        </div>

        <div className="border-t pt-4 text-xs text-slate-500 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Tiêu đề tên trường đã được nới rộng, chữ "THỤ" nằm trọn vẹn trên cùng 1 hàng.</span>
          </div>
        </div>
      </div>
    </div>
  )
}