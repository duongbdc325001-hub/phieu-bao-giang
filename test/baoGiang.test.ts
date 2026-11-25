import { test, expect } from 'vitest'
import { buildLessonPlan, buildWeekRows, buildWeekSlots } from '../src/lib/baoGiang'

const classes = [{ id: 'c1', code: '10A1', subject: 'Toán' }]
const items = Array.from({ length: 10 }, (_, i) => ({ id: i, template_id: 't1', lesson_order: i + 1, lesson_name: `Bài ${i + 1}` }))
const cc = [{ class_id: 'c1', template_id: 't1' }]
const slot = (id: number, w: number, d: number, p: number) => ({ id, week_number: w, day_of_week: d, period_number: p, class_id: 'c1' })

test('tuần trống lấy theo tuần liền trước (không phải tuần 1)', () => {
  const m = buildWeekSlots([slot(1, 1, 2, 1), slot(2, 2, 3, 2), slot(3, 2, 4, 3)])
  expect(m.get(3)!.length).toBe(2)
  expect(m.get(3)!.map((s) => s.day_of_week)).toEqual([3, 4])
})

test('đánh số tiết nối tiếp, cắt tiết thì đánh tiếp từ số đã gán', () => {
  const sched = [slot(1, 1, 2, 1), slot(2, 1, 4, 2)]
  const ovr = [{ class_id: 'c1', week_number: 2, slot_order_in_week: 0, override_lesson_order: 7, override_type: 'cut' }]
  const plan = buildLessonPlan(sched, classes, cc, items, ovr)
  expect(plan.timelines.get('c1')!.slice(0, 4).map((t) => t.assigned)).toEqual([1, 2, 7, 8])
  const rows = buildWeekRows(2, plan, classes)
  expect(rows[0].slots[0]).toMatchObject({ lessonOrder: 7, lessonName: 'Bài 7', noteLabel: 'Cắt tiết' })
})

test('tiết chiều hiện nhãn C-n', () => {
  const plan = buildLessonPlan([slot(1, 1, 2, 7)], classes, cc, items, [])
  expect(buildWeekRows(1, plan, classes)[0].slots[0].period).toBe('C-2')
})
