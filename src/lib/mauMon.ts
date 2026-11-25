// Màu theo MÔN HỌC: mỗi môn luôn ra cùng một màu ở mọi trang (TKB, Lịch báo giảng, Tiến độ),
// để giáo viên quét mắt theo môn cho nhanh. Ngoài màu môn, giao diện giữ tông trung tính.
// (Viết đủ tên class để Tailwind nhận ra, không ghép chuỗi động.)

export interface SubjectTone {
  chip: string // nhãn nhỏ: "T", "TrN"...
  cell: string // ô tiết học trong TKB
  bar: string // vạch màu bên trái
  dot: string // chấm tròn
}

// Không dùng đỏ / cam / vàng cho môn học: các màu đó dành cho cảnh báo (thiếu PPCT, cắt tiết...).
const TONES: SubjectTone[] = [
  { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', cell: 'bg-emerald-50 border-emerald-200 text-emerald-950', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { chip: 'bg-sky-50 text-sky-800 ring-sky-200', cell: 'bg-sky-50 border-sky-200 text-sky-950', bar: 'bg-sky-500', dot: 'bg-sky-500' },
  { chip: 'bg-violet-50 text-violet-800 ring-violet-200', cell: 'bg-violet-50 border-violet-200 text-violet-950', bar: 'bg-violet-500', dot: 'bg-violet-500' },
  { chip: 'bg-teal-50 text-teal-800 ring-teal-200', cell: 'bg-teal-50 border-teal-200 text-teal-950', bar: 'bg-teal-500', dot: 'bg-teal-500' },
  { chip: 'bg-indigo-50 text-indigo-800 ring-indigo-200', cell: 'bg-indigo-50 border-indigo-200 text-indigo-950', bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  { chip: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200', cell: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-950', bar: 'bg-fuchsia-500', dot: 'bg-fuchsia-500' },
  { chip: 'bg-lime-50 text-lime-800 ring-lime-200', cell: 'bg-lime-50 border-lime-200 text-lime-950', bar: 'bg-lime-600', dot: 'bg-lime-600' },
]

export function subjectTone(subject: string): SubjectTone {
  const key = (subject || '').trim().toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}

/** "TrN - 12SỬ" -> { subject: 'TrN', code: '12SỬ' } */
export function splitSubjectClass(text: string) {
  const i = text.indexOf(' - ')
  return i === -1 ? { subject: '', code: text } : { subject: text.slice(0, i), code: text.slice(i + 3) }
}

/** Nhãn tiết dễ đọc: 1..5 -> "Tiết 1"; 6..8 hoặc "C-1" -> "Chiều 1" */
export function periodText(p: number | string): string {
  const s = String(p).trim().toUpperCase()
  if (s.startsWith('C-')) return `Chiều ${s.slice(2)}`
  const n = Number(s)
  if (!isNaN(n) && n > 5) return `Chiều ${n - 5}`
  return `Tiết ${s}`
}
