'use client'

// Khung chung cho các trang trong dashboard: tiêu đề + mô tả ngắn + hàng nút,
// và 3 kiểu nút duy nhất (chính / phụ / nguy hiểm) để giao diện đồng bộ.

import { Calendar } from 'lucide-react'

export const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1'
export const BTN_PRIMARY = `${BTN_BASE} bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm`
export const BTN_SECONDARY = `${BTN_BASE} bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400`
export const BTN_DANGER = `${BTN_BASE} bg-white text-rose-700 border border-rose-200 hover:bg-rose-50`
export const BTN_ICON = `${BTN_BASE} w-9 px-0 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50`

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-4 border-b border-slate-200">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Ô chọn tuần dùng chung (TKB, Lịch báo giảng) */
export function WeekSelect({
  value,
  weeks,
  onChange,
  current,
}: {
  value: number
  weeks: number
  onChange: (w: number) => void
  current?: number
}) {
  return (
    <label className={`${BTN_SECONDARY} pr-2`}>
      <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
      <span className="sr-only">Chọn tuần</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
      >
        {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
          <option key={w} value={w}>
            Tuần {w < 10 ? '0' + w : w}
            {current === w ? ' (tuần này)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
