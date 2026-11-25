import { test, expect } from 'vitest'
import { dateOf, formatDay, isFinished, pickCurrentYear, weekOf, yearIdFromStart, type SchoolYear } from '../src/lib/namHoc'

const y26: SchoolYear = { id: '2026-2027', start_date: '2026-09-07', weeks: 35 }
const y27: SchoolYear = { id: '2027-2028', start_date: '2027-09-06', weeks: 35 }

test('tuần hiện tại và ngày của tuần', () => {
  expect(weekOf(y26, new Date(2026, 10, 25))).toBe(12) // 25/11/2026
  expect(weekOf(y26, new Date(2026, 7, 1))).toBe(1) // chưa tới năm học
  expect(weekOf(y26, new Date(2027, 7, 1))).toBe(35) // quá tuần cuối -> giữ tuần 35
  expect(formatDay(dateOf(y26, 1, 0))).toBe('07/09/2026')
  expect(formatDay(dateOf(y26, 12, 5))).toBe('28/11/2026')
})

test('chọn năm học hiện tại theo ngày bắt đầu', () => {
  expect(pickCurrentYear([y26, y27], new Date(2027, 5, 1)).id).toBe('2026-2027')
  expect(pickCurrentYear([y27, y26], new Date(2027, 8, 6)).id).toBe('2027-2028')
  expect(pickCurrentYear([y27], new Date(2027, 0, 1)).id).toBe('2027-2028')
  expect(isFinished(y26, new Date(2027, 4, 15))).toBe(true)
  expect(isFinished(y26, new Date(2027, 4, 1))).toBe(false)
})

test('tên năm học từ ngày bắt đầu', () => {
  expect(yearIdFromStart('2027-09-06')).toBe('2027-2028')
  expect(yearIdFromStart('2027-08-30')).toBe('2027-2028')
  expect(yearIdFromStart('2028-01-03')).toBe('2027-2028')
})
