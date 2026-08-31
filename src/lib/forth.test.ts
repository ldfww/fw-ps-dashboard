import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  computeForthReport,
  fetchAllTasksForFilter,
  fetchForthUsers,
  pullForthTasks,
  today,
} from './forth'

const API_KEY = 'test-key'
const BASE = 'https://api.forthcrm.com/v1'

function makeUser(id: string, first = 'First', last = 'Last') {
  return { id, firstname: first, lastname: last, user_name: `${first}.${last}` }
}

function makeRawTask(id: string, userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    contact_id: 'c1',
    assigned_to: { firstname: 'A', lastname: 'B', user_name: 'ab' },
    title: 'Task',
    task_note: '',
    task_due_date: '2026-08-27 00:00:00',
    task_status: 'Open',
    task_completed: 0,
    task_completed_date: '0000-00-00',
    task_created_date: '2026-08-20 00:00:00',
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('today', () => {
  it('returns yyyy-MM-dd', () => {
    const t = today()
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('fetchForthUsers', () => {
  it('dedupes users by id', async () => {
    const users = [makeUser('u1'), makeUser('u1'), makeUser('u2')]
    ;(fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ users }), { status: 200 }),
    )
    const result = await fetchForthUsers(API_KEY, BASE)
    expect(result).toHaveLength(2)
    expect(result.map((u) => u.id)).toEqual(['u1', 'u2'])
  })
})

describe('fetchAllTasksForFilter pagination', () => {
  it('does not stop on a short page and only stops on an empty page', async () => {
    const controller = new AbortController()
    // Page 1: one record (short page). Page 2: another record. Page 3: empty.
    ;(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify([makeRawTask('t1', 'u1')]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([makeRawTask('t2', 'u1')]), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))

    const tasks = await fetchAllTasksForFilter(API_KEY, 'u1', 0, BASE, controller)
    expect(tasks).toHaveLength(2)
    expect((fetch as any).mock.calls).toHaveLength(3)
  })

  it('stops when a page returns only already-seen ids', async () => {
    const controller = new AbortController()
    const t1 = makeRawTask('t1', 'u1')
    ;(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify([t1]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([t1]), { status: 200 }))

    const tasks = await fetchAllTasksForFilter(API_KEY, 'u1', 0, BASE, controller)
    expect(tasks).toHaveLength(1)
    expect((fetch as any).mock.calls).toHaveLength(2)
  })

  it('treats a 404 as an empty list', async () => {
    const controller = new AbortController()
    ;(fetch as any).mockResolvedValueOnce(new Response('', { status: 404 }))

    const tasks = await fetchAllTasksForFilter(API_KEY, 'u1', 0, BASE, controller)
    expect(tasks).toHaveLength(0)
  })
})

describe('computeForthReport date math', () => {
  it('counts a task as overdue only when due date is strictly before asOf', () => {
    const tasks = [
      { ...makeRawTask('t1', 'u1', { task_due_date: '2026-08-27 00:00:00', task_completed: 0 }), userId: 'u1', firstname: 'A', lastname: 'B', user_name: 'ab' },
      { ...makeRawTask('t2', 'u1', { task_due_date: '2026-08-28 00:00:00', task_completed: 0 }), userId: 'u1', firstname: 'A', lastname: 'B', user_name: 'ab' },
    ]
    const report = computeForthReport(tasks as any, '2026-08-28', '2026-08-20', '2026-08-28')
    expect(report[0].overdue).toBe(1)
  })

  it('counts done only when completed date falls inside the range', () => {
    const tasks = [
      { ...makeRawTask('t1', 'u1', { task_completed: 1, task_completed_date: '2026-08-26 10:00:00' }), userId: 'u1' },
      { ...makeRawTask('t2', 'u1', { task_completed: 1, task_completed_date: '2026-08-19 10:00:00' }), userId: 'u1' },
      { ...makeRawTask('t3', 'u1', { task_completed: 1, task_completed_date: '2026-08-29 10:00:00' }), userId: 'u1' },
    ]
    const report = computeForthReport(tasks as any, '2026-08-28', '2026-08-20', '2026-08-28')
    expect(report[0].done).toBe(1)
  })

  it('rejects 0000-00-00 completed dates and treats the task as open', () => {
    const tasks = [
      { ...makeRawTask('t1', 'u1', { task_completed: 0, task_completed_date: '0000-00-00', task_due_date: '2026-08-27 00:00:00' }), userId: 'u1' },
    ]
    const report = computeForthReport(tasks as any, '2026-08-28', '2026-08-20', '2026-08-28')
    expect(report[0].overdue).toBe(1)
    expect(report[0].done).toBe(0)
  })
})

describe('acceptance', () => {
  it('produces the expected Annie/Edwin overdue counts for 2026-08-28', () => {
    const annie = { userId: 'annie', firstname: 'Annie', lastname: 'Colebrook' }
    const edwin = { userId: 'edwin', firstname: 'Edwin', lastname: 'Miranda' }
    const annieTasks = Array.from({ length: 116 }, (_, i) => ({
      ...makeRawTask(`a${i}`, annie.userId, { task_due_date: '2026-08-27 00:00:00', task_completed: 0 }),
      userId: annie.userId,
      firstname: annie.firstname,
      lastname: annie.lastname,
    }))
    const edwinTasks = Array.from({ length: 58 }, (_, i) => ({
      ...makeRawTask(`e${i}`, edwin.userId, { task_due_date: '2026-08-26 00:00:00', task_completed: 0 }),
      userId: edwin.userId,
      firstname: edwin.firstname,
      lastname: edwin.lastname,
    }))
    const report = computeForthReport([...annieTasks, ...edwinTasks] as any, '2026-08-28', '2026-08-28', '2026-08-28')
    expect(report.find((r) => r.userId === annie.userId)?.overdue).toBe(116)
    expect(report.find((r) => r.userId === edwin.userId)?.overdue).toBe(58)
  })
})

describe('pullForthTasks', () => {
  it('throws an explicit incomplete error when any user fails both attempts', async () => {
    const controller = new AbortController()
    ;(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [makeUser('u1'), makeUser('u2')] }), { status: 200 }))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response(JSON.stringify([makeRawTask('t1', 'u2')]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([makeRawTask('t2', 'u2')]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      // retry for u1
      .mockRejectedValueOnce(new Error('timeout'))

    await expect(pullForthTasks(API_KEY, BASE)).rejects.toThrow(/incomplete/)
  })
})
