'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Upload, X, CheckCircle2, AlertCircle, Calendar, FileSpreadsheet, FileCode, User } from 'lucide-react'

interface ImportScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedSlot {
  day_of_week: number
  period_number: number
  session: 'morning' | 'afternoon'
  raw_subject: string
  class_code: string
}

const DAY_HEADER_MAP: Record<string, number> = {
  'thứ 2': 2, 'thu 2': 2, 't2': 2, 'thứ hai': 2, 'thu hai': 2,
  'thứ 3': 3, 'thu 3': 3, 't3': 3, 'thứ ba': 3, 'thu ba': 3,
  'thứ 4': 4, 'thu 4': 4, 't4': 4, 'thứ tư': 4, 'thu tu': 4,
  'thứ 5': 5, 'thu 5': 5, 't5': 5, 'thứ năm': 5, 'thu nam': 5,
  'thứ 6': 6, 'thu 6': 6, 't6': 6, 'thứ sáu': 6, 'thu sau': 6,
  'thứ 7': 7, 'thu 7': 7, 't7': 7, 'thứ bảy': 7, 'thu bay': 7,
}

export default function ImportScheduleModal({ isOpen, onClose, onSuccess }: ImportScheduleModalProps) {
  const supabase = createClient()
  
  const [activeTab, setActiveTab] = useState<'excel' | 'json'>('excel')
  const [fileName, setFileName] = useState('')
  const [parsedSlots, setParsedSlots] = useState<ParsedSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [rawJsonData, setRawJsonData] = useState<any>(null)
  const [teacherList, setTeacherList] = useState<string[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState<string>('')

  if (!isOpen) return null

  // 1. ĐỌC FILE EXCEL CÁ NHÂN
  const handleFileUploadExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setErrorMsg(null)
    setParsedSlots([])

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

        if (!rows || rows.length === 0) {
          setErrorMsg('File Excel không có dữ liệu')
          return
        }

        let headerRowIdx = -1
        const colToDayMap: Record<number, number> = {}

        for (let r = 0; r < Math.min(rows.length, 5); r++) {
          const row = rows[r]
          let matchCount = 0
          row.forEach((cell: any, cIdx: number) => {
            const cleanText = String(cell).toLowerCase().trim()
            if (DAY_HEADER_MAP[cleanText]) {
              colToDayMap[cIdx] = DAY_HEADER_MAP[cleanText]
              matchCount++
            }
          })
          if (matchCount >= 3) {
            headerRowIdx = r
            break
          }
        }

        if (headerRowIdx === -1) {
          setErrorMsg('Không tìm thấy dòng tiêu đề Thứ 2, Thứ 3... trong file Excel.')
          return
        }

        const slots: ParsedSlot[] = []
        let currentSession: 'morning' | 'afternoon' = 'morning'

        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r]
          if (!row || row.length === 0) continue

          const fullRowText = row.map((c) => String(c)).join(' ').toLowerCase()
          if (fullRowText.includes('chiều') || fullRowText.includes('tkb chiều')) {
            currentSession = 'afternoon'
            continue
          }

          const rawPeriod = parseInt(String(row[0]).trim(), 10)
          if (isNaN(rawPeriod) || rawPeriod < 1 || rawPeriod > 10) continue

          Object.entries(colToDayMap).forEach(([colIdxStr, dayOfWeek]) => {
            const colIdx = Number(colIdxStr)
            const cellValue = String(row[colIdx] || '').trim()

            if (cellValue && cellValue !== '—' && cellValue !== '-') {
              const parts = cellValue.split(/[-–—]/)
              let sub = ''
              let cls = ''

              if (parts.length >= 2) {
                sub = parts[0].trim()
                cls = parts.slice(1).join('-').trim().toUpperCase()
              } else {
                sub = 'Toán'
                cls = cellValue.trim().toUpperCase()
              }

              if (cls) {
                slots.push({
                  day_of_week: dayOfWeek,
                  period_number: rawPeriod,
                  session: currentSession,
                  raw_subject: sub,
                  class_code: cls,
                })
              }
            }
          })
        }

        if (slots.length === 0) {
          setErrorMsg('Không nhận diện được tiết học nào từ bảng biểu!')
          return
        }

        setParsedSlots(slots)
      } catch (err: any) {
        setErrorMsg('Lỗi khi đọc file Excel: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // 2. ĐỌC FILE JSON CẢ TRƯỜNG
  const handleFileUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setErrorMsg(null)
    setParsedSlots([])

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const jsonContent = JSON.parse(event.target?.result as string)
        setRawJsonData(jsonContent)

        const teachers = new Set<string>()
        const entries = Array.isArray(jsonContent) ? jsonContent : jsonContent.schedule || jsonContent.entries || []

        entries.forEach((item: any) => {
          const tName = item.teacher_name || item.teacher || item.gv || item.giao_vien
          if (tName) teachers.add(String(tName).trim())
        })

        const sortedTeachers = Array.from(teachers).sort((a, b) => a.localeCompare(b))
        setTeacherList(sortedTeachers)

        if (sortedTeachers.length > 0) {
          setSelectedTeacher(sortedTeachers[0])
          extractSlotsForTeacher(jsonContent, sortedTeachers[0])
        } else {
          extractDirectJsonSlots(entries)
        }
      } catch (err: any) {
        setErrorMsg('Lỗi cú pháp file JSON: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const extractSlotsForTeacher = (jsonContent: any, teacherName: string) => {
    const entries = Array.isArray(jsonContent) ? jsonContent : jsonContent.schedule || jsonContent.entries || []
    const slots: ParsedSlot[] = []

    entries.forEach((item: any) => {
      const tName = item.teacher_name || item.teacher || item.gv || item.giao_vien
      if (tName && String(tName).trim().toLowerCase() === teacherName.trim().toLowerCase()) {
        const day = Number(item.day_of_week || item.day || item.thu || 2)
        const period = Number(item.period_number || item.period || item.tiet || 1)
        const cls = String(item.class_code || item.class || item.lop || '').trim().toUpperCase()
        const sub = String(item.subject || item.mon || 'Toán').trim()

        if (cls && day >= 2 && day <= 7 && period >= 1 && period <= 10) {
          slots.push({
            day_of_week: day,
            period_number: period,
            session: period <= 5 ? 'morning' : 'afternoon',
            raw_subject: sub,
            class_code: cls,
          })
        }
      }
    })

    setParsedSlots(slots)
  }

  const extractDirectJsonSlots = (entries: any[]) => {
    const slots: ParsedSlot[] = []
    entries.forEach((item: any) => {
      const day = Number(item.day_of_week || item.day || item.thu || 2)
      const period = Number(item.period_number || item.period || item.tiet || 1)
      const cls = String(item.class_code || item.class || item.lop || '').trim().toUpperCase()
      const sub = String(item.subject || item.mon || 'Toán').trim()

      if (cls && day >= 2 && day <= 7 && period >= 1 && period <= 10) {
        slots.push({
          day_of_week: day,
          period_number: period,
          session: period <= 5 ? 'morning' : 'afternoon',
          raw_subject: sub,
          class_code: cls,
        })
      }
    })
    setParsedSlots(slots)
  }

  const handleTeacherChange = (teacherName: string) => {
    setSelectedTeacher(teacherName)
    if (rawJsonData) {
      extractSlotsForTeacher(rawJsonData, teacherName)
    }
  }

  // 3. LƯU THỜI KHÓA BIỂU (ĐÃ LOẠI BỎ TRƯỜNG 'grade' KHỎI INSERT CỦA 'classes')
  const handleSaveSchedule = async () => {
    if (parsedSlots.length === 0) return
    setLoading(true)
    setErrorMsg(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id

      // Lấy danh sách lớp hiện có
      const { data: existingClasses } = await supabase.from('classes').select('id, code, subject')
      const classDict = new Map<string, string>()

      if (existingClasses) {
        existingClasses.forEach((c) => {
          classDict.set(`${c.code.toUpperCase()}__${c.subject.toLowerCase()}`, c.id)
        })
      }

      // Xác định các lớp mới cần tạo (CHỈ DÙNG: code, name, subject, user_id)
      const uniqueNewClasses = new Map<string, { code: string; subject: string }>()
      parsedSlots.forEach((slot) => {
        const key = `${slot.class_code}__${slot.raw_subject.toLowerCase()}`
        if (!classDict.has(key) && !uniqueNewClasses.has(key)) {
          uniqueNewClasses.set(key, {
            code: slot.class_code,
            subject: slot.raw_subject,
          })
        }
      })

      if (uniqueNewClasses.size > 0) {
        const toInsert = Array.from(uniqueNewClasses.values()).map((c) => ({
          code: c.code,
          name: `Lớp ${c.code}`,
          subject: c.subject,
          user_id: userId,
        }))

        const { data: insertedClasses, error: cErr } = await supabase
          .from('classes')
          .insert(toInsert)
          .select('id, code, subject')

        if (cErr) throw cErr

        if (insertedClasses) {
          insertedClasses.forEach((c) => {
            classDict.set(`${c.code.toUpperCase()}__${c.subject.toLowerCase()}`, c.id)
          })
        }
      }

      // Xóa các tiết TKB cũ
      await supabase
        .from('schedule_entries')
        .delete()
        .eq('is_substitute', false)
        .eq('week_number', 0)

      // Chèn toàn bộ tiết TKB mới
      const entriesToInsert = parsedSlots.map((slot) => {
        const classId = classDict.get(`${slot.class_code}__${slot.raw_subject.toLowerCase()}`)
        return {
          day_of_week: slot.day_of_week,
          period_number: slot.period_number,
          session: slot.session,
          week_number: 0,
          is_substitute: false,
          class_id: classId || null,
          user_id: userId,
        }
      })

      const { error: sErr } = await supabase.from('schedule_entries').insert(entriesToInsert)
      if (sErr) throw sErr

      alert(`Đã nạp thành công ${entriesToInsert.length} tiết giảng dạy vào Thời khóa biểu!`)
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg('Lỗi khi lưu thời khóa biểu: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border font-sans">
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-2 text-emerald-700">
            <Calendar className="w-5 h-5" />
            <h2 className="text-base font-bold text-slate-900">Nhập Thời Khóa Biểu</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('excel')
              setParsedSlots([])
              setFileName('')
              setErrorMsg(null)
            }}
            className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'excel'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel (Cá nhân)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('json')
              setParsedSlots([])
              setFileName('')
              setErrorMsg(null)
            }}
            className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'json'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileCode className="w-4 h-4 text-blue-600" />
            JSON (Cả trường)
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-3 text-xs">
          {activeTab === 'excel' ? (
            <div>
              <label className="block font-bold text-slate-600 mb-1">Chọn file Excel TKB dạng bảng tuần:</label>
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-6 text-center transition cursor-pointer bg-slate-50/50 hover:bg-emerald-50/20 relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUploadExcel}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="w-7 h-7 mx-auto text-emerald-600 mb-2" />
                <span className="font-bold text-slate-700 block text-sm">
                  {fileName ? fileName : 'Bấm vào để chọn file Excel TKB'}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">
                  Nhận diện tự động các ô: <strong>Môn - Lớp</strong> (VD: <em>TrN - 12SỬ, Toán - 12N</em>)
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Chọn file JSON thời khóa biểu cả trường:</label>
                <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-5 text-center transition cursor-pointer bg-slate-50/50 hover:bg-blue-50/20 relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUploadJson}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="w-6 h-6 mx-auto text-blue-600 mb-1.5" />
                  <span className="font-bold text-slate-700 block text-sm">
                    {fileName ? fileName : 'Bấm vào để chọn file JSON'}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Hỗ trợ file dữ liệu TKB tổng hợp xuất từ phần mềm xếp thời khóa biểu
                  </span>
                </div>
              </div>

              {teacherList.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Chọn tên giáo viên của bạn trong danh sách:
                  </label>
                  <select
                    value={selectedTeacher}
                    onChange={(e) => handleTeacherChange(e.target.value)}
                    className="w-full p-2.5 border rounded-xl font-black text-slate-800 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    {teacherList.map((t) => (
                      <option key={t} value={t}>
                        Thầy/Cô: {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {parsedSlots.length > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Đã bóc tách: <strong>{parsedSlots.length} tiết học</strong>
                  {activeTab === 'json' && selectedTeacher ? ` (GV: ${selectedTeacher})` : ''}
                </span>
              </div>
              <span className="font-bold text-[11px] text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                Hợp lệ
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={handleSaveSchedule}
            disabled={loading || parsedSlots.length === 0}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
          >
            {loading ? 'Đang lưu CSDL...' : 'Nạp Vào Thời Khóa Biểu'}
          </button>
        </div>
      </div>
    </div>
  )
}