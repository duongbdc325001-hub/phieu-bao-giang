'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSchoolYear } from '@/components/school-year'
import { weekOf } from '@/lib/namHoc'
import * as XLSX from 'xlsx'
import { Upload, RefreshCw, Plus, Trash2, X, ArrowRightLeft, Sun, Moon } from 'lucide-react'
import { PageHeader, WeekSelect, BTN_PRIMARY, BTN_DANGER, BTN_ICON, BTN_SECONDARY } from '@/components/ui/page'
import { subjectTone } from '@/lib/mauMon'

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

// DANH SÁCH GỢI Ý MẶC ĐỊNH (không còn bắt buộc – người dùng có thể nhập mã khác)
const DEFAULT_CLASS_CODES = [
  '10T1', '10T2', '10L', '10H', '10S', '10TIN', '10V1', '10V2', '10SỬ', '10Đ', '10A1', '10A2', '10P', '10N', '10TQ',
  '11T', '11L', '11H', '11S', '11TIN', '11V', '11SỬ', '11Đ', '11A1', '11A2', '11P', '11N', '11TQ',
  '12T', '12L', '12H', '12S', '12TIN', '12V', '12SỬ', '12Đ', '12A1', '12A2', '12P', '12N', '12TQ'
]

const DEFAULT_SUBJECTS = [
  'T', 'V', 'A', 'L', 'H', 'S', 'SU', 'Đ', 'Tin', 'CN',
  'KTPL', 'P', 'N', 'TQ', 'QPAN', 'GDTC', 'GDĐP', 'TrN', 'Nâng cao'
]

const MAX_SUBJECT_LEN = 20
const MAX_CLASS_LEN = 15
const FORBIDDEN_CHARS = /[<>"'\\,;]/

// Chuẩn hóa môn: bỏ khoảng trắng thừa; nếu trùng (không phân biệt hoa/thường) với môn đã biết thì dùng đúng cách viết đó
const normalizeSubject = (raw: string, known: string[]): string => {
  const t = raw.trim().replace(/\s+/g, ' ')
  const hit = known.find((k) => k.toLowerCase() === t.toLowerCase())
  return hit ?? t
}

// Chuẩn hóa mã lớp: bỏ khoảng trắng, viết hoa
const normalizeClassCode = (raw: string): string => raw.trim().replace(/\s+/g, '').toUpperCase()

// Trả về thông báo lỗi, hoặc null nếu hợp lệ
const validateSubject = (s: string): string | null => {
  if (!s) return 'Môn học không được để trống.'
  if (s.length > MAX_SUBJECT_LEN) return `Mã môn tối đa ${MAX_SUBJECT_LEN} ký tự.`
  if (FORBIDDEN_CHARS.test(s)) return 'Mã môn chứa ký tự không được phép.'
  return null
}

const validateClassCode = (c: string): string | null => {
  if (!c) return 'Mã lớp không được để trống.'
  if (c.length > MAX_CLASS_LEN) return `Mã lớp tối đa ${MAX_CLASS_LEN} ký tự.`
  if (FORBIDDEN_CHARS.test(c)) return 'Mã lớp chứa ký tự không được phép.'
  return null
}

// Suy ra khối từ mã lớp (lấy số đứng đầu: 10, 11, 12...). Không có số thì mặc định 10
const guessGrade = (classCode: string): number => {
  const m = classCode.match(/^(\d{1,2})/)
  if (!m) return 10
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 12 ? n : 10
}

// Thêm giá trị mới vào danh sách gợi ý nếu chưa có
const addUnique = (list: string[], value: string) =>
  list.some((x) => x.toLowerCase() === value.toLowerCase()) ? list : [...list, value]

export default function SchedulePage() {
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
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(false)

  // Gợi ý = danh sách mặc định + các lớp/môn người dùng đã tạo trước đó
  const [availableClasses, setAvailableClasses] = useState<string[]>(DEFAULT_CLASS_CODES)
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(DEFAULT_SUBJECTS)
  const [movingSlot, setMovingSlot] = useState<{ subject: string; classCode: string } | null>(null)

  const [editingCell, setEditingCell] = useState<{
    dayId: number
    period: number
    subject: string
    classCode: string
    isExisting: boolean
  } | null>(null)

  // NGHỈ TIẾT của tuần đang xem: tiết vẫn hiện trên TKB nhưng không tính vào PPCT
  const [skips, setSkips] = useState<{ class_id: string; slot_order_in_week: number; notes: string | null }[]>([])
  const [skipNote, setSkipNote] = useState('')

  // Nạp các lớp/môn đã có của người dùng để làm gợi ý
  const loadKnownOptions = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('classes')
      .select('code, subject')
      .eq('user_id', user.id)

    if (!data) return

    setAvailableClasses((prev) => {
      let next = prev
      data.forEach((c: any) => { if (c.code) next = addUnique(next, c.code) })
      return next
    })
    setAvailableSubjects((prev) => {
      let next = prev
      data.forEach((c: any) => { if (c.subject) next = addUnique(next, c.subject) })
      return next
    })
  }

  useEffect(() => {
    loadKnownOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tuần chưa sửa riêng thì HIỂN THỊ theo tuần gần nhất trước đó đã có TKB (giống Lịch báo giảng),
  // nhưng KHÔNG ghi gì xuống DB khi chỉ mở xem. Chỉ khi giáo viên sửa một ô của tuần này
  // thì mới chép cả tuần xuống DB (materializeInheritedWeek) rồi sửa.
  // Trước đây mở tuần là tự chép ngay -> sửa TKB tuần trước không lan sang các tuần đã từng mở,
  // và mở 2 lần liền (đổi tuần nhanh) có thể chép trùng.
  const [inheritedFrom, setInheritedFrom] = useState<number | null>(null)
  const [inheritedRows, setInheritedRows] = useState<{ day_of_week: number; period_number: number; class_id: string | null }[]>([])
  const loadSeq = useRef(0)
  const materializing = useRef(false)

  const loadScheduleAndSuggestions = async () => {
    const mySeq = ++loadSeq.current
    const week = selectedWeek
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const selectCols = `
        id,
        week_number,
        day_of_week,
        period_number,
        class_id,
        classes (
          code,
          subject
        )
      `

      const { data: sData } = await supabase
        .from('schedule_entries')
        .select(selectCols)
        .eq('week_number', week)
        .eq('user_id', user.id)
        .eq('school_year', yearId)

      if (mySeq !== loadSeq.current) return // người dùng đã chuyển sang tuần khác

      const { data: skipRows } = await supabase
        .from('lesson_overrides')
        .select('class_id, slot_order_in_week, notes')
        .eq('school_year', yearId)
        .eq('week_number', week)
        .eq('override_type', 'skip')
        .eq('is_skipped', true)
      if (mySeq !== loadSeq.current) return
      setSkips(skipRows || [])

      const format = (item: any, idPrefix = ''): ScheduleItem => ({
        id: `${idPrefix}${item.id}`,
        day_of_week: item.day_of_week,
        period_number: item.period_number,
        class_id: item.class_id,
        week_number: week,
        sub_class_code: item.classes?.code || '',
        sub_subject: item.classes?.subject || ''
      })

      if (sData && sData.length > 0) {
        setSchedule(sData.map((item: any) => format(item)))
        setInheritedFrom(null)
        setInheritedRows([])
        return
      }

      // Tuần chưa có dữ liệu: tìm tuần gần nhất trước đó đã có TKB
      let srcWeek: number | null = null
      if (week > 1) {
        const { data: prev } = await supabase
          .from('schedule_entries')
          .select('week_number')
          .eq('user_id', user.id)
          .eq('school_year', yearId)
          .gte('week_number', 1)
          .lt('week_number', week)
          .order('week_number', { ascending: false })
          .limit(1)
        srcWeek = prev && prev.length > 0 ? Number(prev[0].week_number) : null
      }

      if (srcWeek == null) {
        if (mySeq !== loadSeq.current) return
        setSchedule([])
        setInheritedFrom(null)
        setInheritedRows([])
        return
      }

      const { data: srcData } = await supabase
        .from('schedule_entries')
        .select(selectCols)
        .eq('week_number', srcWeek)
        .eq('user_id', user.id)
        .eq('school_year', yearId)

      if (mySeq !== loadSeq.current) return
      const rows = srcData || []
      setSchedule(rows.map((item: any) => format(item, 'inherited_')))
      setInheritedFrom(rows.length > 0 ? srcWeek : null)
      setInheritedRows(rows.map((r: any) => ({ day_of_week: r.day_of_week, period_number: r.period_number, class_id: r.class_id })))
    } finally {
      if (mySeq === loadSeq.current) setLoading(false)
    }
  }

  // Trước khi sửa một tuần đang "mượn" TKB tuần trước: chép cả tuần đó xuống DB cho tuần hiện tại
  const materializeInheritedWeek = async (userId: string) => {
    if (inheritedFrom == null || inheritedRows.length === 0 || materializing.current) return
    materializing.current = true
    try {
      // Kiểm tra lại: có thể tuần này vừa được ghi ở tab khác
      const { data: existing } = await supabase
        .from('schedule_entries')
        .select('id')
        .eq('week_number', selectedWeek)
        .eq('user_id', userId)
        .eq('school_year', yearId)
        .limit(1)
      if (!existing || existing.length === 0) {
        const { error } = await supabase.from('schedule_entries').insert(
          inheritedRows.map((r) => ({ ...r, week_number: selectedWeek, school_year: yearId, user_id: userId }))
        )
        if (error) throw error
      }
      setInheritedFrom(null)
      setInheritedRows([])
    } finally {
      materializing.current = false
    }
  }

  useEffect(() => {
    loadScheduleAndSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, yearId])

  // Hàm xử lý làm sạch dữ liệu cá nhân
  const handleResetMyData = async () => {
    // Chỉ xóa dữ liệu của NĂM HỌC ĐANG CHỌN; các năm học khác và các khung PPCT đã tải lên được giữ nguyên
    if (!confirm(`CẢNH BÁO NGUY HIỂM:\n\nThao tác này sẽ XÓA SẠCH Thời khóa biểu, việc gán PPCT cho lớp và các lần cắt/đảo tiết của riêng bạn trong NĂM HỌC ${yearId} để làm lại từ đầu.\nCác năm học khác và các khung PPCT đã tải lên vẫn được giữ.\n\nHành động này không thể hoàn tác! Bạn có chắc chắn muốn xóa không?`)) return

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Không tìm thấy thông tin tài khoản đang đăng nhập!')
        setLoading(false)
        return
      }

      for (const table of ['lesson_overrides', 'class_curriculums', 'schedule_entries']) {
        const { error } = await supabase.from(table).delete().eq('user_id', user.id).eq('school_year', yearId)
        if (error) throw error
      }

      alert(`Đã dọn sạch dữ liệu năm học ${yearId}! Hệ thống sẽ tải lại trang để bạn bắt đầu nhập liệu mới.`)
      window.location.reload()
    } catch (err: any) {
      alert('Lỗi khi làm sạch dữ liệu: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCell = async (targetDayId: number, targetPeriod: number, subject: string, classCode: string) => {
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Vui lòng đăng nhập lại!')
        setLoading(false)
        return
      }

      const subSubject = normalizeSubject(subject, availableSubjects)
      const subClassCode = normalizeClassCode(classCode)

      // Kiểm tra định dạng (cho phép nhập mã ngoài danh sách có sẵn)
      const subjectErr = validateSubject(subSubject)
      if (subjectErr) {
        alert(subjectErr)
        setLoading(false)
        return
      }
      const classErr0 = validateClassCode(subClassCode)
      if (classErr0) {
        alert(classErr0)
        setLoading(false)
        return
      }

      let classId = null
      const { data: existingClass } = await supabase
        .from('classes')
        .select('id')
        .eq('code', subClassCode)
        .eq('subject', subSubject)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingClass) {
        classId = existingClass.id
      } else {
        const { data: newClass, error: classErr } = await supabase
          .from('classes')
          .insert({
            code: subClassCode,
            subject: subSubject,
            grade: guessGrade(subClassCode),
            user_id: user.id,
          })
          .select('id')
          .single()

        if (classErr) throw classErr
        classId = newClass?.id
      }

      if (!classId) throw new Error('Không thể tạo hoặc tìm thấy lớp học tương ứng.')

      await materializeInheritedWeek(user.id)

      // Lấy tất cả (không dùng maybeSingle: nếu lỡ có bản trùng thì maybeSingle báo lỗi -> lại chèn thêm bản nữa)
      const { data: currentEntries, error: findErr } = await supabase
        .from('schedule_entries')
        .select('id')
        .eq('week_number', selectedWeek)
        .eq('day_of_week', targetDayId)
        .eq('period_number', targetPeriod)
        .eq('user_id', user.id)
        .eq('school_year', yearId)
      if (findErr) throw findErr

      if (currentEntries && currentEntries.length > 0) {
        const [keep, ...dups] = currentEntries
        const { error: updateErr } = await supabase
          .from('schedule_entries')
          .update({ class_id: classId })
          .eq('id', keep.id)
        if (updateErr) throw updateErr
        if (dups.length > 0) {
          await supabase.from('schedule_entries').delete().in('id', dups.map((d) => d.id))
        }
      } else {
        const { error: insertErr } = await supabase.from('schedule_entries').insert({
          week_number: selectedWeek,
          school_year: yearId,
          day_of_week: targetDayId,
          period_number: targetPeriod,
          class_id: classId,
          user_id: user.id,
        })
        if (insertErr) throw insertErr
      }

      // Ghi nhớ lớp/môn mới vào danh sách gợi ý
      setAvailableSubjects((prev) => addUnique(prev, subSubject))
      setAvailableClasses((prev) => addUnique(prev, subClassCode))

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await materializeInheritedWeek(user.id)

      const { error: delErr } = await supabase
        .from('schedule_entries')
        .delete()
        .eq('week_number', selectedWeek)
        .eq('day_of_week', editingCell.dayId)
        .eq('period_number', editingCell.period)
        .eq('user_id', user.id)
        .eq('school_year', yearId)
      if (delErr) throw delErr

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Vui lòng đăng nhập lại!')
        setLoading(false)
        return
      }

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

        const periodText = String(row[0] || '').trim().toLowerCase()
        let periodNumber = parseInt(periodText, 10)

        if (isNaN(periodNumber)) {
          if (periodText.includes('tiết 1') && (periodText.includes('chiều') || r > 5)) periodNumber = 6
          else if (periodText.includes('tiết 2') && (periodText.includes('chiều') || r > 6)) periodNumber = 7
          else if (periodText.includes('tiết 3') && (periodText.includes('chiều') || r > 7)) periodNumber = 8
        }

        if (isNaN(periodNumber) || periodNumber < 1 || periodNumber > 8) continue

        dayColumns.forEach(({ dayId, colIdx }) => {
          const cellValue = String(row[colIdx] || '').trim()
          if (cellValue && cellValue !== 'NaN' && cellValue !== '-') {
            // Định dạng ô: "MÔN - LỚP". Phần sau dấu '-' đầu tiên là mã lớp
            // (nên mã lớp có chứa '-' vẫn đọc đúng)
            const parts = cellValue.split('-').map((p) => p.trim())
            if (parts.length >= 2) {
              rawEntries.push({
                day_of_week: dayId,
                period_number: periodNumber,
                subject: parts[0],
                classCode: parts.slice(1).join('-')
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

      // Bước 1: kiểm tra + chuẩn hóa từng dòng, KHÔNG còn loại bỏ mã ngoài danh sách có sẵn
      const validEntries: { day_of_week: number; period_number: number; subject: string; classCode: string }[] = []
      const skipped: string[] = []

      for (const entry of rawEntries) {
        const subSubject = normalizeSubject(String(entry.subject), availableSubjects)
        const subClassCode = normalizeClassCode(String(entry.classCode))
        const err = validateSubject(subSubject) || validateClassCode(subClassCode)
        if (err) {
          skipped.push(`${subSubject || '?'} - ${subClassCode || '?'}`)
          continue
        }
        validEntries.push({
          day_of_week: entry.day_of_week,
          period_number: entry.period_number,
          subject: subSubject,
          classCode: subClassCode,
        })
      }

      if (validEntries.length === 0) {
        alert('Không có tiết nào hợp lệ trong file. Dữ liệu cũ được giữ nguyên.')
        setLoading(false)
        return
      }

      // Bước 2: tạo/tìm lớp (có cache để không truy vấn lặp lại cho cùng một lớp-môn)
      const classCache = new Map<string, string>()
      const finalEntriesToInsert: any[] = []

      for (const entry of validEntries) {
        const key = `${entry.classCode}|${entry.subject}`
        let classId = classCache.get(key)

        if (!classId) {
          const { data: existingClass } = await supabase
            .from('classes')
            .select('id')
            .eq('code', entry.classCode)
            .eq('subject', entry.subject)
            .eq('user_id', user.id)
            .maybeSingle()

          classId = existingClass?.id

          if (!classId) {
            const { data: newClass } = await supabase
              .from('classes')
              .insert({
                code: entry.classCode,
                subject: entry.subject,
                grade: guessGrade(entry.classCode),
                user_id: user.id,
              })
              .select('id')
              .single()

            if (newClass) classId = newClass.id
          }

          if (classId) classCache.set(key, classId)
        }

        if (classId) {
          finalEntriesToInsert.push({
            week_number: selectedWeek,
            school_year: yearId,
            day_of_week: entry.day_of_week,
            period_number: entry.period_number,
            class_id: classId,
            user_id: user.id,
          })
        }
      }

      if (finalEntriesToInsert.length === 0) {
        throw new Error('Không tạo được lớp học nào từ file. Dữ liệu cũ được giữ nguyên.')
      }

      // Bước 3: chỉ xóa TKB cũ của tuần sau khi chắc chắn đã có dữ liệu mới để ghi
      await supabase
        .from('schedule_entries')
        .delete()
        .eq('week_number', selectedWeek)
        .eq('user_id', user.id)
        .eq('school_year', yearId)

      const { error: insertErr } = await supabase.from('schedule_entries').insert(finalEntriesToInsert)
      if (insertErr) throw insertErr

      // Cập nhật gợi ý với các lớp/môn mới từ file
      setAvailableSubjects((prev) => validEntries.reduce((acc, e) => addUnique(acc, e.subject), prev))
      setAvailableClasses((prev) => validEntries.reduce((acc, e) => addUnique(acc, e.classCode), prev))

      let msg = `Đã nạp thành công ${finalEntriesToInsert.length} tiết học (bao gồm cả sáng và chiều) cho Tuần ${selectedWeek}!`
      if (skipped.length > 0) {
        msg += `\n\nBỏ qua ${skipped.length} ô không hợp lệ: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`
      }
      alert(msg)
      loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi nhập file Excel: ' + err.message)
    } finally {
      setLoading(false)
      const fileInput = document.getElementById('excel-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    }
  }

  const periodsConfig = [
    { periodNum: 1, label: 'Tiết 1', short: '1', isAfternoonHeader: false },
    { periodNum: 2, label: 'Tiết 2', short: '2', isAfternoonHeader: false },
    { periodNum: 3, label: 'Tiết 3', short: '3', isAfternoonHeader: false },
    { periodNum: 4, label: 'Tiết 4', short: '4', isAfternoonHeader: false },
    { periodNum: 5, label: 'Tiết 5', short: '5', isAfternoonHeader: false },
    { periodNum: 6, label: 'Chiều 1', short: 'C1', isAfternoonHeader: true },
    { periodNum: 7, label: 'Chiều 2', short: 'C2', isAfternoonHeader: false },
    { periodNum: 8, label: 'Chiều 3', short: 'C3', isAfternoonHeader: false },
  ]

  const itemAt = (dayId: number, period: number) =>
    schedule.find((s) => s.day_of_week === dayId && s.period_number === period)

  // Thứ tự của tiết trong tuần đối với lớp đó (giống cách Lịch báo giảng đánh số: theo thứ rồi theo tiết)
  const slotIndexOf = (item: ScheduleItem) =>
    schedule
      .filter((x) => x.class_id && x.class_id === item.class_id)
      .sort((a, b) => a.day_of_week - b.day_of_week || a.period_number - b.period_number)
      .findIndex((x) => x.day_of_week === item.day_of_week && x.period_number === item.period_number)
  const skipOf = (item?: ScheduleItem) =>
    item?.class_id ? skips.find((k) => k.class_id === item.class_id && k.slot_order_in_week === slotIndexOf(item)) : undefined

  const handleToggleSkip = async (on: boolean) => {
    if (!editingCell) return
    const item = itemAt(editingCell.dayId, editingCell.period)
    if (!item?.class_id) return
    const idx = slotIndexOf(item)
    setLoading(true)
    try {
      if (on) {
        const { error } = await supabase.from('lesson_overrides').upsert(
          {
            class_id: item.class_id,
            school_year: yearId,
            week_number: selectedWeek,
            slot_order_in_week: idx,
            is_skipped: true,
            override_lesson_order: null,
            override_type: 'skip',
            notes: skipNote.trim() || null,
          },
          { onConflict: 'class_id,school_year,week_number,slot_order_in_week' }
        )
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('lesson_overrides')
          .delete()
          .eq('class_id', item.class_id)
          .eq('school_year', yearId)
          .eq('week_number', selectedWeek)
          .eq('slot_order_in_week', idx)
          .eq('override_type', 'skip')
        if (error) throw error
      }
      setEditingCell(null)
      await loadScheduleAndSuggestions()
    } catch (err: any) {
      alert('Lỗi lưu nghỉ tiết: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Bấm vào một ô: đang "di chuyển" thì thả vào ô trống, còn lại mở popup sửa
  const onCellClick = (dayId: number, period: number) => {
    const item = itemAt(dayId, period)
    if (movingSlot && !item) {
      handleSaveCell(dayId, period, movingSlot.subject, movingSlot.classCode)
    } else {
      setSkipNote('')
      setEditingCell({
        dayId,
        period,
        subject: item?.sub_subject || '',
        classCode: item?.sub_class_code || '',
        isExisting: !!item,
      })
    }
  }

  // Điện thoại: xem từng ngày. Mặc định là hôm nay nếu đang xem tuần hiện tại.
  const todayId = (() => { const d = new Date().getDay(); return d === 0 ? 2 : d + 1 })()
  const isCurrentWeek = yearId === current.id && selectedWeek === weekOf(year)
  const [mobileDay, setMobileDay] = useState<number>(() => (todayId <= 7 ? todayId : 2))
  const countByDay = (dayId: number) => schedule.filter((s) => s.day_of_week === dayId).length

  // Trong popup: báo cho người dùng biết khi họ nhập mã mới ngoài danh sách
  const isNewSubject =
    !!editingCell?.subject.trim() &&
    !availableSubjects.some((s) => s.toLowerCase() === editingCell.subject.trim().toLowerCase())
  const isNewClass =
    !!editingCell?.classCode.trim() &&
    !availableClasses.includes(normalizeClassCode(editingCell.classCode))

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      <PageHeader
        title="Thời khóa biểu"
        subtitle={
          movingSlot
            ? `Đang di chuyển ${movingSlot.subject} - ${movingSlot.classCode}: bấm vào một ô trống để đặt tiết vào đó.`
            : 'Bấm vào ô để thêm, sửa hoặc xóa tiết. Trên máy tính có thể kéo thả tiết sang ô khác.'
        }
        actions={
          <>
            {movingSlot && (
              <button onClick={() => setMovingSlot(null)} className={BTN_DANGER}>
                <X className="w-4 h-4" /> Hủy di chuyển
              </button>
            )}
            <WeekSelect value={selectedWeek} weeks={year.weeks} onChange={setSelectedWeek} current={yearId === current.id ? weekOf(year) : undefined} />
            <label className={BTN_PRIMARY}>
              <Upload className="w-4 h-4" />
              <span>Nhập Excel</span>
              <input id="excel-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              onClick={handleResetMyData}
              disabled={loading}
              title={`Xóa TKB, gán PPCT và cắt/đảo tiết của năm học ${yearId}`}
              className={BTN_DANGER}
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Làm sạch dữ liệu</span>
              <span className="sm:hidden">Làm sạch</span>
            </button>
            <button onClick={loadScheduleAndSuggestions} disabled={loading} title="Tải lại" className={BTN_ICON}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>
        }
      />

      {inheritedFrom != null && (
        <div className="px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm">
          Tuần {selectedWeek} chưa có TKB riêng nên đang dùng TKB của tuần {inheritedFrom}. Sửa một ô bất kỳ thì tuần này được lưu thành TKB riêng.
        </div>
      )}

      {/* MÁY TÍNH: LƯỚI CẢ TUẦN */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
              <th className="w-20 px-3 py-2.5 text-center">Tiết</th>
              {DAYS.map((d) => (
                <th
                  key={d.id}
                  className={`px-2 py-2.5 text-center border-l border-slate-200 ${isCurrentWeek && d.id === todayId ? 'text-emerald-800 bg-emerald-50' : ''}`}
                >
                  {d.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {periodsConfig.map((pConfig) => (
              <React.Fragment key={`period-row-${pConfig.periodNum}`}>
                {pConfig.isAfternoonHeader && (
                  <tr>
                    <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border-y border-slate-200">
                      <span className="inline-flex items-center gap-1.5"><Moon className="w-3.5 h-3.5" /> Buổi chiều</span>
                    </td>
                  </tr>
                )}

                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 text-center text-xs font-semibold text-slate-500 bg-slate-50/60">
                    {pConfig.label}
                  </td>
                  {DAYS.map((day) => {
                    const item = itemAt(day.id, pConfig.periodNum)
                    const isMovingHere = movingSlot && !item
                    const tone = item ? subjectTone(item.sub_subject || '') : null
                    const skip = skipOf(item)

                    return (
                      <td
                        key={day.id}
                        onClick={() => onCellClick(day.id, pConfig.periodNum)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropSlot(e, day.id, pConfig.periodNum)}
                        className={`h-16 p-1.5 border-l border-slate-100 align-middle cursor-pointer transition group ${
                          isMovingHere ? 'bg-amber-50 outline-2 outline-dashed outline-amber-300 -outline-offset-4' : 'hover:bg-slate-50'
                        } ${isCurrentWeek && day.id === todayId ? 'bg-emerald-50/30' : ''}`}
                      >
                        {item && tone ? (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation()
                              setMovingSlot({ subject: item.sub_subject || '', classCode: item.sub_class_code || '' })
                            }}
                            className={`relative h-full rounded-lg border ${skip ? 'bg-slate-50 border-dashed border-slate-300 text-slate-500' : tone.cell} pl-3 pr-2 py-1.5 flex flex-col justify-center cursor-grab active:cursor-grabbing overflow-hidden`}
                            title={skip ? `Nghỉ tiết${skip.notes ? `: ${skip.notes}` : ''} (không tính PPCT)` : undefined}
                          >
                            <span className={`absolute left-0 top-0 bottom-0 w-1 ${skip ? 'bg-slate-300' : tone.bar}`} />
                            <span className={`text-sm font-bold leading-tight truncate ${skip ? 'line-through decoration-slate-400' : ''}`}>{item.sub_class_code}</span>
                            <span className="text-[11px] font-medium opacity-75 truncate">
                              {skip ? `Nghỉ${skip.notes ? ` · ${skip.notes}` : ''}` : item.sub_subject}
                            </span>
                            <button
                              title="Di chuyển tiết học này sang ô khác"
                              onClick={(e) => {
                                e.stopPropagation()
                                setMovingSlot({ subject: item.sub_subject || '', classCode: item.sub_class_code || '' })
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-white/90 text-slate-700 border border-slate-200 p-1 rounded-md transition"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-300 group-hover:text-emerald-600 text-xs font-semibold">
                            {movingSlot ? 'Đặt vào đây' : <Plus className="w-4 h-4" />}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ĐIỆN THOẠI: TỪNG NGÀY */}
      <div className="md:hidden space-y-3">
        <div className="grid grid-cols-6 gap-1.5" role="tablist" aria-label="Chọn ngày">
          {DAYS.map((d) => {
            const active = d.id === mobileDay
            const n = countByDay(d.id)
            return (
              <button
                key={d.id}
                role="tab"
                aria-selected={active}
                onClick={() => setMobileDay(d.id)}
                className={`relative flex flex-col items-center rounded-lg border py-2 transition ${
                  active ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <span className="text-sm font-bold">{d.id === 8 ? 'CN' : `T${d.id}`}</span>
                <span className={`text-[10px] ${active ? 'text-emerald-100' : 'text-slate-400'}`}>{n ? `${n} tiết` : 'nghỉ'}</span>
                {isCurrentWeek && d.id === todayId && !active && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </button>
            )
          })}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">{DAYS.find((d) => d.id === mobileDay)?.name}</span>
            {isCurrentWeek && mobileDay === todayId && <span className="text-xs font-semibold text-emerald-700">Hôm nay</span>}
          </div>
          {periodsConfig.map((pConfig) => {
            const item = itemAt(mobileDay, pConfig.periodNum)
            const tone = item ? subjectTone(item.sub_subject || '') : null
            const skip = skipOf(item)
            return (
              <React.Fragment key={`m-${pConfig.periodNum}`}>
                {pConfig.periodNum === 1 && (
                  <div className="px-4 pt-2 text-[11px] font-semibold text-slate-400 flex items-center gap-1"><Sun className="w-3 h-3" /> Buổi sáng</div>
                )}
                {pConfig.isAfternoonHeader && (
                  <div className="px-4 pt-3 text-[11px] font-semibold text-slate-400 flex items-center gap-1 border-t border-slate-100"><Moon className="w-3 h-3" /> Buổi chiều</div>
                )}
                <button
                  onClick={() => onCellClick(mobileDay, pConfig.periodNum)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-slate-50"
                >
                  <span className="w-9 shrink-0 text-center text-xs font-semibold text-slate-500">{pConfig.short}</span>
                  {item && tone ? (
                    <span className={`relative flex-1 min-h-11 rounded-lg border ${skip ? 'bg-slate-50 border-dashed border-slate-300 text-slate-500' : tone.cell} pl-3.5 pr-3 py-2 flex items-center justify-between overflow-hidden`}>
                      <span className={`absolute left-0 top-0 bottom-0 w-1 ${skip ? 'bg-slate-300' : tone.bar}`} />
                      <span className={`text-sm font-bold ${skip ? 'line-through decoration-slate-400' : ''}`}>{item.sub_class_code}</span>
                      <span className="text-xs font-medium opacity-75">{skip ? `Nghỉ${skip.notes ? ` · ${skip.notes}` : ''}` : item.sub_subject}</span>
                    </span>
                  ) : (
                    <span className={`flex-1 min-h-11 rounded-lg border border-dashed flex items-center px-3 text-xs ${
                      movingSlot ? 'border-amber-300 bg-amber-50 text-amber-800 font-semibold' : 'border-slate-200 text-slate-400'
                    }`}>
                      {movingSlot ? 'Đặt tiết vào đây' : '+ Thêm tiết'}
                    </span>
                  )}
                </button>
              </React.Fragment>
            )
          })}
          <div className="h-2" />
        </div>
      </div>

      {/* POPUP THÊM / SỬA / XÓA TIẾT HỌC */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setEditingCell(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-slate-900 text-base">
                  {DAYS.find((d) => d.id === editingCell.dayId)?.name}, {editingCell.period <= 5 ? `tiết ${editingCell.period}` : `chiều tiết ${editingCell.period - 5}`}
                </p>
                <p className="text-xs text-slate-500">Tuần {selectedWeek} · năm học {yearId}</p>
              </div>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4"/>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Môn học</label>
                <input
                  type="text"
                  list="subject-options"
                  value={editingCell.subject}
                  maxLength={MAX_SUBJECT_LEN}
                  placeholder="VD: T, Tin, hoặc môn mới..."
                  onChange={(e) => setEditingCell({ ...editingCell, subject: e.target.value })}
                  className="w-full h-11 px-3 border border-slate-300 rounded-lg font-semibold text-slate-900 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <datalist id="subject-options">
                  {availableSubjects.map((sub) => (
                    <option key={sub} value={sub} />
                  ))}
                </datalist>
                {isNewSubject && (
                  <p className="mt-1 text-[11px] text-amber-700 font-medium">
                    Môn mới "{editingCell.subject.trim()}" sẽ được tạo và lưu vào gợi ý.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lớp</label>
                <input
                  type="text"
                  list="class-options"
                  value={editingCell.classCode}
                  maxLength={MAX_CLASS_LEN}
                  placeholder="VD: 10T1, 12A3, hoặc lớp mới..."
                  onChange={(e) => setEditingCell({ ...editingCell, classCode: e.target.value })}
                  className="w-full h-11 px-3 border border-slate-300 rounded-lg font-semibold text-slate-900 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                />
                <datalist id="class-options">
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls} />
                  ))}
                </datalist>
                {isNewClass && (
                  <p className="mt-1 text-[11px] text-amber-700 font-medium">
                    Lớp mới "{normalizeClassCode(editingCell.classCode)}" sẽ được tạo tự động.
                  </p>
                )}
              </div>

              {editingCell.isExisting && (() => {
                const it = itemAt(editingCell.dayId, editingCell.period)
                const sk = skipOf(it)
                return (
                  <div className={`rounded-lg border p-3 space-y-2 ${sk ? 'bg-slate-50 border-slate-300' : 'border-slate-200'}`}>
                    <p className="font-semibold text-slate-800 text-sm">Nghỉ tiết</p>
                    {sk ? (
                      <>
                        <p className="text-slate-600">
                          Tiết này đang nghỉ{sk.notes ? ` (${sk.notes})` : ''}: vẫn hiện trên TKB nhưng không tính vào PPCT.
                        </p>
                        <button onClick={() => handleToggleSkip(false)} disabled={loading} className={`${BTN_SECONDARY} w-full`}>
                          Bỏ nghỉ, tính lại tiết này
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-500">Chỉ áp dụng cho tuần {selectedWeek}. Tiết vẫn hiện nhưng không tính vào PPCT, tiết sau giữ đúng số bài.</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={60}
                            value={skipNote}
                            onChange={(e) => setSkipNote(e.target.value)}
                            placeholder="Lý do: nghỉ lễ, thi..."
                            className="flex-1 min-w-0 h-9 px-2.5 border border-slate-300 rounded-lg text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button onClick={() => handleToggleSkip(true)} disabled={loading} className={BTN_SECONDARY}>
                            Nghỉ tiết này
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

              <div className="flex items-center gap-2 pt-2">
                {editingCell.isExisting && (
                  <>
                    <button onClick={handleDeleteCell} disabled={loading} className={BTN_DANGER} title="Xóa tiết này">
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa</span>
                    </button>
                    <button
                      onClick={() => {
                        setMovingSlot({ subject: editingCell.subject, classCode: editingCell.classCode })
                        setEditingCell(null)
                      }}
                      className={BTN_SECONDARY}
                      title="Chọn ô khác để đặt tiết này vào"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Di chuyển</span>
                    </button>
                  </>
                )}

                <button
                  onClick={async () => {
                    await handleSaveCell(editingCell.dayId, editingCell.period, editingCell.subject, editingCell.classCode)
                  }}
                  disabled={loading}
                  className={`${BTN_PRIMARY} flex-1 h-10 text-sm`}
                >
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
