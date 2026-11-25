'use client'

// Năm học đang chọn, dùng chung cho mọi trang trong dashboard.
// Mặc định là năm học đang diễn ra (theo ngày bắt đầu admin đã nhập); người dùng chọn năm cũ để xem lại.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FALLBACK_YEARS, type SchoolYear, fetchSchoolYears, pickCurrentYear, sortYears } from '@/lib/namHoc'

const STORAGE_KEY = 'nam-hoc-dang-chon'

interface Ctx {
  years: SchoolYear[]
  year: SchoolYear
  current: SchoolYear
  setYearId: (id: string) => void
  reload: () => Promise<void>
  /** false = chưa đọc được bảng school_years, đang dùng năm mặc định dựng sẵn */
  fromDb: boolean
}

const SchoolYearContext = createContext<Ctx | null>(null)

export function SchoolYearProvider({ children }: { children: React.ReactNode }) {
  const [years, setYears] = useState<SchoolYear[]>(FALLBACK_YEARS)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [fromDb, setFromDb] = useState(false)

  const reload = useCallback(async () => {
    const list = await fetchSchoolYears(createClient())
    setFromDb(list !== FALLBACK_YEARS)
    setYears(sortYears(list))
  }, [])

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY)
      if (saved) setChosenId(saved)
    } catch { /* trình duyệt chặn lưu trữ: bỏ qua */ }
    reload()
  }, [reload])

  const current = useMemo(() => pickCurrentYear(years), [years])
  const year = useMemo(() => years.find((y) => y.id === chosenId) || current, [years, chosenId, current])

  const setYearId = useCallback((id: string) => {
    setChosenId(id)
    try { window.sessionStorage.setItem(STORAGE_KEY, id) } catch { /* bỏ qua */ }
  }, [])

  return (
    <SchoolYearContext.Provider value={{ years, year, current, setYearId, reload, fromDb }}>
      {children}
    </SchoolYearContext.Provider>
  )
}

export function useSchoolYear(): Ctx {
  const ctx = useContext(SchoolYearContext)
  if (ctx) return ctx
  // Ngoài Provider (không xảy ra trong dashboard): dùng năm mặc định
  const y = pickCurrentYear(FALLBACK_YEARS)
  return { years: FALLBACK_YEARS, year: y, current: y, setYearId: () => {}, reload: async () => {}, fromDb: false }
}

/** Ô chọn năm học (đặt ở thanh menu bên trái) */
export function SchoolYearPicker() {
  const { years, year, current, setYearId } = useSchoolYear()
  return (
    <div className="px-3 pt-3">
      <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700 text-xs">
        <span className="text-slate-400 font-bold whitespace-nowrap">Năm học</span>
        <select
          value={year.id}
          onChange={(e) => setYearId(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-white font-black focus:outline-none cursor-pointer"
        >
          {[...years].reverse().map((y) => (
            <option key={y.id} value={y.id} className="text-slate-900">
              {y.id}{y.id === current.id ? ' (hiện tại)' : ''}
            </option>
          ))}
        </select>
      </label>
      {year.id !== current.id && (
        <p className="mt-1.5 px-1 text-[10px] text-amber-300 leading-snug">Đang xem năm học cũ {year.id}.</p>
      )}
    </div>
  )
}
