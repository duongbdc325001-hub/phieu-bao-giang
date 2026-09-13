'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { Upload, RefreshCw, Calendar, Plus, Trash2, X, Copy, ClipboardPaste, ArrowRightLeft } from 'lucide-react'

interface ScheduleItem {
  id: string
  day_of_week: number
  period_number: number
  class_id?: string
  week_number?: number
  sub_class_code?: string
  sub_subject?: string
}

const DAYS = [
  { id: 2, name: 'Thứ Hai' },
  { id: 3, name: 'Thứ Ba' },
  { id: 4, name: 'Thứ Tư' },
  { id: 5, name: 'Thứ Năm' },
  { id: 6, name: 'Thứ Sáu' },
  { id: 7, name: 'Thứ Bảy' },
]

export default function SchedulePage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(false)

  // State lưu danh sách gợi ý các lớp và môn học từ CSDL
  const [availableClasses, setAvailableClasses] = useState<string[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])

  // State lưu tiết đang được Copy / Kéo thả
  const [copiedSlot, setCopiedSlot] = useState<{ subject: string; classCode: string } | null>(null)

  // State cho popup thêm/sửa/xóa tiết học từng ô
  const [editingCell, setEditingCell] = useState<{
    dayId: number
    period: number
    subject: string
    classCode: string
    isExisting: boolean
  } | null>(null)

  const loadScheduleAndSuggestions = async () => {
    setLoading(true)
    
    const { data: sData } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('week_number', selectedWeek)

    if (sData && sData.length > 0) {
      setSchedule(sData)
    } else {
      if (selectedWeek > 1) {
        const { data: week1Data } = await supabase
          .from('schedule_entries')
          .select('*')
          .eq('week_number', 1)

        if (week1Data && week1Data.length > 0) {
          const inheritedData = week1Data.map((item) => ({
            ...item,
            id: `inherited_${item.id}`,
            week_number: selectedWeek,
          }))
          setSchedule(inheritedData)
        } else {
          setSchedule([])
        }
      } else {
        setSchedule([])
      }
    }

    const { data: cData } = await supabase.from('classes').select('code')
    if (cData) {
      const uniqueCodes = Array.from(new Set(cData.map((c) => c.code).filter(Boolean))) as string[]
      setAvailableClasses(uniqueCodes)
    }

    const { data: allEntries } = await supabase.from('schedule_entries').select('sub_subject')
    if (allEntries) {
      const uniqueSubjects = Array.from(new Set(allEntries.map((e) => e.sub_subject).filter(Boolean))) as string[]
      if (uniqueSubjects.length === 0) {
        setAvailableSubjects(['T', 'TrN', 'GDĐP'])
      } else {
        setAvailableSubjects(uniqueSubjects)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    loadScheduleAndSuggestions()
  }, [selectedWeek])

  // Xử lý lưu hoặc cập nhật 1 ô tiết học cụ thể
  const handleSaveCell = async (targetDayId: number, targetPeriod: number, subject: string, classCode: string) => {
    setLoading(true)

    try {
      const subSubject = subject.trim()
      const subClassCode = classCode.trim().toUpperCase()

      if (!subSubject || !subClassCode) {
        alert('Vui lòng nhập đầy đủ Môn học và Mã lớp!')
        setLoading(false)
        return
      }

      let classId = null
      const { data: existingClass } = await supabase
        .from('classes')
        .select('id')
        .eq('code', subClassCode)
        .single()

      if (existingClass) {
        classId = existingClass.id
      } else {
        const gradeNum = subClassCode.startsWith('12') ? 12 : subClassCode.startsWith('11') ? 11 : 10
        const { data: newClass } = await supabase
          .from('classes')
          .insert({
            code: subClassCode,
            name: `Lớp ${subClassCode}`,
            subject: subSubject === 'T' ? 'Toán' : subSubject,
            grade: gradeNum,
          })
          .select('id')
          .single()

        if (newClass) classId = newClass.id
      }

      const { data: currentEntry } = await supabase
        .from('schedule_entries')
        .select('id')
        .eq('week_number', selectedWeek)
        .eq('day_of_week', targetDayId)
        .eq('period_number', targetPeriod)
        .single()

      if (currentEntry) {
        await supabase
          .from('schedule_entries')
          .update({
            sub_subject: subSubject,
            sub_class_code: subClassCode,
            class_id: classId,
          })
          .eq('id', currentEntry.id)
      } else {
        await supabase.from('schedule_entries').insert({
          week_number: selectedWeek,
          day_of_week: targetDayId,
          period_number: targetPeriod,
          sub_subject: subSubject,
          sub_class_code: subClassCode,
          class_id: classId,
        })
      }

      loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi khi lưu tiết học: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Xử lý xóa tiết học trong ô
  const handleDeleteCell = async () => {
    if (!editingCell) return
    if (!confirm('Bạn có chắc chắn muốn xóa tiết học này khỏi ô TKB?')) return

    setLoading(true)
    try {
      await supabase
        .from('schedule_entries')
        .delete()
        .eq('week_number', selectedWeek)
        .eq('day_of_week', editingCell.dayId)
        .eq('period_number', editingCell.period)

      setEditingCell(null)
      loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi khi xóa tiết: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Xử lý Thả (Drop) ô được kéo sang ô đích
  const handleDropSlot = async (e: React.DragEvent, targetDayId: number, targetPeriod: number) => {
    e.preventDefault()
    if (!copiedSlot) return

    await handleSaveCell(targetDayId, targetPeriod, copiedSlot.subject, copiedSlot.classCode)
    setCopiedSlot(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 })

      const headerRow = jsonData[0] || []
      const dayColumns: { dayId: number; colIdx: number }[] = []

      headerRow.forEach((h: any, idx: number) => {
        const text = String(h || '').trim().toLowerCase()
        if (text.includes('thứ 2') || text.includes('thứ hai')) dayColumns.push({ dayId: 2, colIdx: idx })
        if (text.includes('thứ 3') || text.includes('thứ ba')) dayColumns.push({ dayId: 3, colIdx: idx })
        if (text.includes('thứ 4') || text.includes('thứ tư')) dayColumns.push({ dayId: 4, colIdx: idx })
        if (text.includes('thứ 5') || text.includes('thứ năm')) dayColumns.push({ dayId: 5, colIdx: idx })
        if (text.includes('thứ 6') || text.includes('thứ sáu')) dayColumns.push({ dayId: 6, colIdx: idx })
        if (text.includes('thứ 7') || text.includes('thứ bảy')) dayColumns.push({ dayId: 7, colIdx: idx })
      })

      const newEntries: any[] = []

      for (let r = 1; r < jsonData.length; r++) {
        const row = jsonData[r]
        if (!row || row.length === 0) continue

        const periodText = String(row[0] || '').trim()
        const periodNumber = parseInt(periodText, 10)

        if (isNaN(periodNumber) || periodNumber < 1 || periodNumber > 5) continue

        dayColumns.forEach(({ dayId, colIdx }) => {
          const cellValue = String(row[colIdx] || '').trim()
          if (cellValue && cellValue !== 'NaN' && cellValue !== '-') {
            const parts = cellValue.split('-').map((p) => p.trim())
            if (parts.length >= 2) {
              const subject = parts[0]
              const classCode = parts[1]

              newEntries.push({
                day_of_week: dayId,
                period_number: periodNumber,
                week_number: selectedWeek,
                sub_class_code: classCode,
                sub_subject: subject,
              })
            }
          }
        })
      }

      if (newEntries.length === 0) {
        alert('Không tìm thấy tiết học nào hợp lệ trong file Excel!')
        setLoading(false)
        return
      }

      await supabase.from('schedule_entries').delete().eq('week_number', selectedWeek)

      for (const entry of newEntries) {
        const { data: existingClass } = await supabase
          .from('classes')
          .select('id')
          .eq('code', entry.sub_class_code)
          .single()

        let classId = existingClass?.id

        if (!classId) {
          const gradeNum = entry.sub_class_code.startsWith('12') ? 12 : entry.sub_class_code.startsWith('11') ? 11 : 10
          const { data: newClass } = await supabase
            .from('classes')
            .insert({
              code: entry.sub_class_code,
              name: `Lớp ${entry.sub_class_code}`,
              subject: entry.sub_subject === 'T' ? 'Toán' : entry.sub_subject,
              grade: gradeNum,
            })
            .select('id')
            .single()

          if (newClass) classId = newClass.id
        }

        entry.class_id = classId
      }

      const { error: insertErr } = await supabase.from('schedule_entries').insert(newEntries)
      if (insertErr) throw insertErr

      alert(`Đã nạp thành công ${newEntries.length} tiết học cho Tuần ${selectedWeek}!`)
      loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi nhập file Excel: ' + err.message)
    } finally {
      setLoading(false)
      const fileInput = document.getElementById('excel-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans pb-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Thời Khóa Biểu</h1>
          <p className="text-xs text-slate-500">
            {copiedSlot 
              ? `🎯 Đang giữ tiết [${copiedSlot.subject} - ${copiedSlot.classCode}]. Thả vào ô bất kỳ để di chuyển sang!` 
              : '💡 Mẹo: Bạn có thể click chuột trái giữ và kéo thả tiết học giữa các ô, hoặc bấm vào ô để sửa/xóa.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* CHỌN TUẦN */}
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

          {/* NÚT NHẬP EXCEL */}
          <label className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập TKB Tuần {selectedWeek} (Excel)</span>
            <input
              id="excel-upload"
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={loadScheduleAndSuggestions}
            disabled={loading}
            className="p-2 border rounded-xl bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* LƯỚI THỜI KHÓA BIỂU */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-tight text-[11px]">
              <th className="w-[10%] p-3 border-r border-slate-300 text-center">TIẾT</th>
              {DAYS.map((d) => (
                <th key={d.id} className="w-[15%] p-3 border-r border-slate-300 text-center">
                  {d.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {[1, 2, 3, 4, 5].map((period) => (
              <tr key={period} className="hover:bg-slate-50/50">
                <td className="p-3 border-r border-slate-300 text-center font-black text-slate-900 bg-slate-50">
                  Tiết {period}
                </td>
                {DAYS.map((day) => {
                  const item = schedule.find(
                    (s) => s.day_of_week === day.id && s.period_number === period
                  )
                  return (
                    <td
                      key={day.id}
                      onClick={() =>
                        setEditingCell({
                          dayId: day.id,
                          period,
                          subject: item?.sub_subject || '',
                          classCode: item?.sub_class_code || '',
                          isExisting: !!item,
                        })
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropSlot(e, day.id, period)}
                      className="p-2.5 border-r border-slate-300 text-center align-middle cursor-pointer hover:bg-emerald-50/60 transition group relative"
                      title="Click để sửa hoặc kéo thả để di chuyển tiết học"
                    >
                      {item ? (
                        <div
                          draggable
                          onDragStart={() =>
                            setCopiedSlot({ subject: item.sub_subject || '', classCode: item.sub_class_code || '' })
                          }
                          className="bg-emerald-50 border border-emerald-300 rounded-lg p-1.5 shadow-2xs group-hover:border-emerald-500 cursor-grab active:cursor-grabbing relative flex flex-col items-center"
                        >
                          <span className="font-black text-emerald-950 text-xs block">
                            {item.sub_subject}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600">
                            {item.sub_class_code}
                          </span>
                        </div>
                      ) : (
                        <div className="text-slate-300 group-hover:text-emerald-600 font-bold text-base">
                          +
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* POPUP THÊM / SỬA / XÓA TIẾT HỌC */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-3">
              <span className="font-black text-slate-800 text-sm uppercase">
                {DAYS.find((d) => d.id === editingCell.dayId)?.name} — Tiết {editingCell.period} (Tuần {selectedWeek})
              </span>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Môn học (Chọn hoặc nhập mới):</label>
                <input
                  type="text"
                  list="subjects-list"
                  value={editingCell.subject}
                  onChange={(e) => setEditingCell({ ...editingCell, subject: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Nhập hoặc chọn môn..."
                  autoFocus
                />
                <datalist id="subjects-list">
                  {availableSubjects.map((sub, idx) => (
                    <option key={idx} value={sub} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã lớp (Chọn từ danh sách hệ thống):</label>
                <select
                  value={availableClasses.includes(editingCell.classCode) ? editingCell.classCode : 'CUSTOM'}
                  onChange={(e) => {
                    if (e.target.value !== 'CUSTOM') {
                      setEditingCell({ ...editingCell, classCode: e.target.value })
                    } else {
                      setEditingCell({ ...editingCell, classCode: '' })
                    }
                  }}
                  className="w-full p-2.5 border rounded-xl font-bold text-slate-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer mb-2"
                >
                  <option value="">-- Chọn lớp học --</option>
                  {availableClasses.map((cls, idx) => (
                    <option key={idx} value={cls}>
                      Lớp {cls}
                    </option>
                  ))}
                  <option value="CUSTOM">✏️ Nhập mã lớp khác...</option>
                </select>

                {(!availableClasses.includes(editingCell.classCode) || editingCell.classCode === '') && (
                  <input
                    type="text"
                    value={editingCell.classCode}
                    onChange={(e) => setEditingCell({ ...editingCell, classCode: e.target.value })}
                    className="w-full p-2.5 border rounded-xl font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Nhập mã lớp mới (VD: 12SỬ)..."
                  />
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                {editingCell.isExisting && (
                  <button
                    onClick={handleDeleteCell}
                    disabled={loading}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                    title="Xóa tiết học này"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa</span>
                  </button>
                )}

                <button
                  onClick={async () => {
                    await handleSaveCell(editingCell.dayId, editingCell.period, editingCell.subject, editingCell.classCode)
                    setEditingCell(null)
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lưu tiết học</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}