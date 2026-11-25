// Năm học: mỗi năm có ngày bắt đầu tuần 1 (admin nhập ở trang Quản trị) và số tuần.
// Dữ liệu TKB, cắt/đảo tiết và việc gán PPCT cho lớp được lưu riêng theo từng năm học,
// nên các năm cũ vẫn giữ nguyên để xem lại / xuất Word.

export interface SchoolYear {
  id: string // '2026-2027'
  start_date: string // 'YYYY-MM-DD' = thứ Hai của tuần 1
  weeks: number // số tuần của năm học (mặc định 35)
}

export const DEFAULT_WEEKS = 35

// Dùng tạm khi chưa đọc được bảng school_years (chưa chạy SQL / mất mạng)
export const FALLBACK_YEARS: SchoolYear[] = [{ id: '2026-2027', start_date: '2026-09-07', weeks: DEFAULT_WEEKS }]

/** 'YYYY-MM-DD' -> Date lúc 0h giờ máy (không lệch múi giờ như new Date('YYYY-MM-DD')) */
export function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
}

export function formatDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tên năm học suy từ ngày bắt đầu: bắt đầu từ tháng 7 trở đi -> 'Y-(Y+1)', trước đó -> '(Y-1)-Y' */
export function yearIdFromStart(startIso: string): string {
  const d = parseDay(startIso)
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}-${y + 1}`
}

export function sortYears(years: SchoolYear[]): SchoolYear[] {
  return [...years].sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))
}

/** Năm học đang diễn ra: năm có ngày bắt đầu gần nhất mà <= hôm nay (chưa tới năm nào thì lấy năm sớm nhất) */
export function pickCurrentYear(years: SchoolYear[], today = new Date()): SchoolYear {
  const list = sortYears(years.length ? years : FALLBACK_YEARS)
  let cur = list[0]
  for (const y of list) if (parseDay(y.start_date).getTime() <= today.getTime()) cur = y
  return cur
}

/** Tuần hiện tại trong năm học (giới hạn trong 1..số tuần) */
export function weekOf(year: SchoolYear, today = new Date()): number {
  const start = parseDay(year.start_date)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((t.getTime() - start.getTime()) / 86400000)
  if (diffDays < 0) return 1
  return Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), year.weeks || DEFAULT_WEEKS)
}

/** Ngày cụ thể của (tuần, độ lệch ngày từ thứ Hai: 0 = thứ Hai ... 5 = thứ Bảy) */
export function dateOf(year: SchoolYear, week: number, dayOffset: number): Date {
  const d = parseDay(year.start_date)
  d.setDate(d.getDate() + (week - 1) * 7 + dayOffset)
  return d
}

/** Năm học đã kết thúc chưa (đã qua hết số tuần) */
export function isFinished(year: SchoolYear, today = new Date()): boolean {
  const end = dateOf(year, (year.weeks || DEFAULT_WEEKS) + 1, 0)
  return today.getTime() >= end.getTime()
}

/** Đọc danh sách năm học; lỗi hoặc chưa có bảng thì dùng năm mặc định để web vẫn chạy */
export async function fetchSchoolYears(supabase: { from: (t: string) => any }): Promise<SchoolYear[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const { data, error } = await supabase.from('school_years').select('id, start_date, weeks').order('start_date', { ascending: true })
    if (error || !data || data.length === 0) return FALLBACK_YEARS
    return data.map((r: { id: string; start_date: string; weeks: number | null }) => ({
      id: r.id,
      start_date: String(r.start_date).slice(0, 10),
      weeks: r.weeks || DEFAULT_WEEKS,
    }))
  } catch {
    return FALLBACK_YEARS
  }
}
