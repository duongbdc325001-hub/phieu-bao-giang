'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { Upload, RefreshCw, Calendar, Plus, Trash2, X, Move, ArrowRightLeft } from 'lucide-react'

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

const VALID_CLASS_CODES = [
  '10T1', '10T2', '10L', '10H', '10S', '10TIN', '10V1', '10V2', '10SỬ', '10Đ', '10A1', '10A2', '10P', '10N', '10TQ',
  '11T', '11L', '11H', '11S', '11TIN', '11V', '11SỬ', '11Đ', '11A1', '11A2', '11P', '11N', '11TQ',
  '12T', '12L', '12H', '12S', '12TIN', '12V', '12SỬ', '12Đ', '12A1', '12A2', '12P', '12N', '12TQ'
]

const VALID_SUBJECTS = [
  'T', 'V', 'A', 'L', 'H', 'S', 'SU', 'Đ', 'Tin', 'CN', 
  'KTPL', 'P', 'N', 'TQ', 'QPAN', 'GDTC', 'GDĐP', 'TrN', 'Nâng cao'
]

export default function SchedulePage() {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(false)

  const [availableClasses] = useState<string[]>(VALID_CLASS_CODES)
  const [availableSubjects] = useState<string[]>(VALID_SUBJECTS)
  const [movingSlot, setMovingSlot] = useState<{ subject: string; classCode: string } | null>(null)

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
      .select(`
        id,
        week_number,
        day_of_week,
        period_number,
        class_id,
        classes (
          code,
          subject
        )
      `)
      .eq('week_number', selectedWeek)

    if (sData && sData.length > 0) {
      const formattedEntries = sData.map((item: any) => ({
        id: item.id,
        day_of_week: item.day_of_week,
        period_number: item.period_number,
        class_id: item.class_id,
        week_number: item.week_number,
        sub_class_code: item.classes?.code || '',
        sub_subject: item.classes?.subject || ''
      }))
      setSchedule(formattedEntries)
    } else {
      if (selectedWeek > 1) {
        const { data: week1Data } = await supabase
          .from('schedule_entries')
          .select(`
            id,
            day_of_week,
            period_number,
            class_id,
            classes (
              code,
              subject
            )
          `)
          .eq('week_number', 1)

        if (week1Data && week1Data.length > 0) {
          const inheritedData = week1Data.map((item: any) => ({
            id: `inherited_${item.id}`,
            day_of_week: item.day_of_week,
            period_number: item.period_number,
            class_id: item.class_id,
            week_number: selectedWeek,
            sub_class_code: item.classes?.code || '',
            sub_subject: item.classes?.subject || ''
          }))
          setSchedule(inheritedData)
        } else {
          setSchedule([])
        }
      } else {
        setSchedule([])
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    loadScheduleAndSuggestions()
  }, [selectedWeek])

  const handleSaveCell = async (targetDayId: number, targetPeriod: number, subject: string, classCode: string) => {
    setLoading(true)

    try {
      const subSubject = subject.trim()
      const subClassCode = classCode.trim().toUpperCase()

      if (!subSubject || !subClassCode) {
        alert('Vui lòng chọn đầy đủ Môn học và Mã lớp!')
        setLoading(false)
        return
      }

      if (!VALID_SUBJECTS.includes(subSubject)) {
        alert(`Mã môn học "${subSubject}" không hợp lệ!`)
        setLoading(false)
        return
      }

      let classId = null
      const { data: existingClass } = await supabase
        .from('classes')
        .select('id')
        .eq('code', subClassCode)
        .eq('subject', subSubject)
        .maybeSingle()

      if (existingClass) {
        classId = existingClass.id
      } else {
        let gradeNum = 10
        if (subClassCode.startsWith('12')) gradeNum = 12
        else if (subClassCode.startsWith('11')) gradeNum = 11

        const { data: newClass, error: classErr } = await supabase
          .from('classes')
          .insert({
            code: subClassCode,
            subject: subSubject,
            grade: gradeNum,
          })
          .select('id')
          .single()

        if (classErr) throw classErr
        classId = newClass?.id
      }

      if (!classId) throw new Error('Không thể tạo hoặc tìm thấy lớp học tương ứng.')

      const { data: currentEntry } = await supabase
        .from('schedule_entries')
        .select('id')
        .eq('week_number', selectedWeek)
        .eq('day_of_week', targetDayId)
        .eq('period_number', targetPeriod)
        .maybeSingle()

      if (currentEntry) {
        const { error: updateErr } = await supabase
          .from('schedule_entries')
          .update({ class_id: classId })
          .eq('id', currentEntry.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase.from('schedule_entries').insert({
          week_number: selectedWeek,
          day_of_week: targetDayId,
          period_number: targetPeriod,
          class_id: classId,
        })
        if (insertErr) throw insertErr
      }

      setEditingCell(null)
      setMovingSlot(null)
      await loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi khi lưu tiết học: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

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
      await loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi khi xóa tiết: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDropSlot = async (e: React.DragEvent, targetDayId: number, targetPeriod: number) => {
    e.preventDefault()
    if (!movingSlot) return

    await handleSaveCell(targetDayId, targetPeriod, movingSlot.subject, movingSlot.classCode)
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

      const rawEntries: any[] = []

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
              rawEntries.push({
                day_of_week: dayId,
                period_number: periodNumber,
                subject: parts[0],
                classCode: parts[1]
              })
            }
          }
        })
      }

      if (rawEntries.length === 0) {
        alert('Không tìm thấy tiết học hợp lệ trong file Excel!')
        setLoading(false)
        return
      }

      await supabase.from('schedule_entries').delete().eq('week_number', selectedWeek)

      const finalEntriesToInsert: any[] = []

      for (const entry of rawEntries) {
        const subSubject = entry.subject
        const subClassCode = entry.classCode.toUpperCase()

        if (!VALID_SUBJECTS.includes(subSubject) || !VALID_CLASS_CODES.includes(subClassCode)) {
          continue 
        }

        let gradeNum = 10
        if (subClassCode.startsWith('12')) gradeNum = 12
        else if (subClassCode.startsWith('11')) gradeNum = 11

        let { data: existingClass } = await supabase
          .from('classes')
          .select('id')
          .eq('code', subClassCode)
          .eq('subject', subSubject)
          .maybeSingle()

        let classId = existingClass?.id

        if (!classId) {
          const { data: newClass } = await supabase
            .from('classes')
            .insert({
              code: subClassCode,
              subject: subSubject,
              grade: gradeNum,
            })
            .select('id')
            .single()

          if (newClass) classId = newClass.id
        }

        if (classId) {
          finalEntriesToInsert.push({
            week_number: selectedWeek,
            day_of_week: entry.day_of_week,
            period_number: entry.period_number,
            class_id: classId
          })
        }
      }

      if (finalEntriesToInsert.length > 0) {
        const { error: insertErr } = await supabase.from('schedule_entries').insert(finalEntriesToInsert)
        if (insertErr) throw insertErr
      }

      alert(`Đã nạp thành công ${finalEntriesToInsert.length} tiết học cho Tuần ${selectedWeek}!`)
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
            {movingSlot 
              ? `🎯 Đang chọn [${movingSlot.subject} - ${movingSlot.classCode}]. Click vào ô bất kỳ để di chuyển đến!` 
              : '💡 Mẹo: Bạn có thể kéo thả tiết học giữa các ô, bấm nút "Di chuyển" hoặc click vào ô để sửa/xóa.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {movingSlot && (
            <button
              onClick={() => setMovingSlot(null)}
              className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-200 transition cursor-pointer"
            >
              Hủy di chuyển
            </button>
          )}

          <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 border rounded-xl shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0"/>
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

          <label className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer">
            <Upload className="w-3.5 h-3.5"/>
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
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}/>
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
                  const isMovingHere = movingSlot && !item

                  return (
                    <td
                      key={day.id}
                      onClick={() => {
                        if (movingSlot && !item) {
                          handleSaveCell(day.id, period, movingSlot.subject, movingSlot.classCode)
                        } else {
                          setEditingCell({
                            dayId: day.id,
                            period,
                            subject: item?.sub_subject || '',
                            classCode: item?.sub_class_code || '',
                            isExisting: !!item,
                          })
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropSlot(e, day.id, period)}
                      className={`p-2.5 border-r border-slate-300 text-center align-middle cursor-pointer transition group relative ${
                        isMovingHere ? 'bg-amber-50 border-2 border-dashed border-amber-400' : 'hover:bg-emerald-50/60'
                      }`}
                    >
                      {item ? (
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation()
                            setMovingSlot({ subject: item.sub_subject || '', classCode: item.sub_class_code || '' })
                          }}
                          className="bg-emerald-50 border border-emerald-300 rounded-lg p-1.5 shadow-2xs group-hover:border-emerald-500 cursor-grab active:cursor-grabbing relative flex flex-col items-center"
                        >
                          <span className="font-black text-emerald-950 text-xs block">
                            {item.sub_subject}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 mb-1">
                            {item.sub_class_code}
                          </span>

                          <button
                            title="Di chuyển tiết học này sang ô khác"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMovingSlot({ subject: item.sub_subject || '', classCode: item.sub_class_code || '' })
                            }}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-emerald-700 hover:bg-emerald-800 text-white p-1 rounded transition shadow-xs"
                          >
                            <ArrowRightLeft className="w-3 h-3"/>
                          </button>
                        </div>
                      ) : (
                        <div className="text-slate-300 group-hover:text-emerald-600 font-bold text-base">
                          {movingSlot ? '🎯 Thả vào đây' : '+'}
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
                <X className="w-4 h-4"/>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Môn học chuẩn:</label>
                <select
                  value={editingCell.subject}
                  onChange={(e) => setEditingCell({ ...editingCell, subject: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-bold text-slate-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- Chọn mã môn học --</option>
                  {availableSubjects.map((sub, idx) => (
                    <option key={idx} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã lớp học chuẩn:</label>
                <select
                  value={editingCell.classCode}
                  onChange={(e) => setEditingCell({ ...editingCell, classCode: e.target.value })}
                  className="w-full p-2.5 border rounded-xl font-bold text-slate-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- Chọn mã lớp học --</option>
                  {availableClasses.map((cls, idx) => (
                    <option key={idx} value={cls}>Lớp {cls}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {editingCell.isExisting && (
                  <button
                    onClick={handleDeleteCell}
                    disabled={loading}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4"/>
                    <span>Xóa</span>
                  </button>
                )}

                <button
                  onClick={async () => {
                    await handleSaveCell(editingCell.dayId, editingCell.period, editingCell.subject, editingCell.classCode)
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4"/>
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