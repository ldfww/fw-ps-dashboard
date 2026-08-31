import { format, isBefore, isValid, isWithinInterval, parseISO } from 'date-fns'

const FORTH_BASE = 'https://api.forthcrm.com/v1'
const PAGE_LIMIT = 500
const REQUEST_TIMEOUT_MS = 8000
const DEADLINE_MS = 50000
const BATCH_SIZE = 5

export interface ForthUser {
  id: string
  firstname: string
  lastname: string
  user_name?: string
}

export interface ForthTask {
  id: string
  userId: string
  contact_id?: string
  firstname?: string
  lastname?: string
  user_name?: string
  title?: string
  task_note?: string
  task_due_date?: string
  task_status?: string
  task_completed: boolean
  task_completed_date?: string
  task_created_date?: string
}

export interface ForthReportRow {
  userId: string
  firstname?: string
  lastname?: string
  overdue: number
  done: number
}

function normalizeDate(input: string | null | undefined): string | null {
  if (!input || input === '0000-00-00' || input.startsWith('0000-00-00')) {
    return null
  }
  const trimmed = input.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [, y, m, d] = match
  if (Number(y) < 1) return null
  return `${y}-${m}-${d}`
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
  return false
}

function extractArray(response: unknown): unknown[] {
  if (Array.isArray(response)) return response
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>
    if (Array.isArray(obj.users)) return obj.users
    if (Array.isArray(obj.data)) return obj.data
    if (Array.isArray(obj.items)) return obj.items
    if (Array.isArray(obj.tasks)) return obj.tasks
    return Object.values(obj).filter((v) => v && typeof v === 'object')
  }
  return []
}

function normalizeTask(raw: unknown, userId: string): ForthTask | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const assignedTo = (r.assigned_to as Record<string, unknown> | undefined) || {}
  const completed = isTruthy(r.task_completed)
  const due = normalizeDate(r.task_due_date as string | undefined)
  const completedDate = normalizeDate(r.task_completed_date as string | undefined)
  const createdDate = normalizeDate(r.task_created_date as string | undefined)

  return {
    id: String(r.id ?? ''),
    userId,
    contact_id: r.contact_id ? String(r.contact_id) : undefined,
    firstname: assignedTo.firstname ? String(assignedTo.firstname) : r.firstname ? String(r.firstname) : undefined,
    lastname: assignedTo.lastname ? String(assignedTo.lastname) : r.lastname ? String(r.lastname) : undefined,
    user_name: assignedTo.user_name ? String(assignedTo.user_name) : r.user_name ? String(r.user_name) : undefined,
    title: r.title ? String(r.title) : undefined,
    task_note: r.task_note ? String(r.task_note) : undefined,
    task_due_date: due || undefined,
    task_status: r.task_status ? String(r.task_status) : undefined,
    task_completed: completed,
    task_completed_date: completedDate || undefined,
    task_created_date: createdDate || undefined,
  }
}

function parseJsonBody(text: string): unknown {
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

async function safeFetch(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(url, { ...init, signal })
  const body = await response.text()
  return { ok: response.ok, status: response.status, body }
}

function requestSignal(deadlineController: AbortController): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return (AbortSignal as any).any ? (AbortSignal as any).any([timeout, deadlineController.signal]) : timeout
}

export async function fetchForthUsers(
  apiKey: string,
  baseUrl = FORTH_BASE,
  deadlineController?: AbortController,
): Promise<ForthUser[]> {
  const signal = deadlineController ? requestSignal(deadlineController) : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const res = await safeFetch(
    `${baseUrl}/users`,
    {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
    signal,
  )
  if (!res.ok) {
    throw new Error(`Forth /users failed: ${res.status} ${res.body.slice(0, 200)}`)
  }
  const parsed = parseJsonBody(res.body)
  const rows = extractArray(parsed)
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: String(r.id ?? ''),
      firstname: r.firstname ? String(r.firstname) : '',
      lastname: r.lastname ? String(r.lastname) : '',
      user_name: r.user_name ? String(r.user_name) : undefined,
    }))
    .filter((u) => u.id)
  const byId = new Map<string, ForthUser>()
  for (const u of rows) byId.set(u.id, u)
  return Array.from(byId.values())
}

interface UserPullResult {
  userId: string
  user: ForthUser
  tasks: ForthTask[]
  failed?: string
}

async function fetchTasksPage(
  apiKey: string,
  userId: string,
  completed: 0 | 1,
  start: number,
  baseUrl: string,
  signal: AbortSignal,
): Promise<{ tasks: ForthTask[]; status: number }> {
  const res = await safeFetch(
    `${baseUrl}/users/${encodeURIComponent(userId)}/tasks`,
    {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ completed, start, limit: PAGE_LIMIT }),
    },
    signal,
  )
  if (res.status === 404) {
    return { tasks: [], status: 404 }
  }
  if (!res.ok) {
    throw new Error(`Forth /users/${userId}/tasks (completed:${completed}) failed: ${res.status} ${res.body.slice(0, 200)}`)
  }
  const parsed = parseJsonBody(res.body)
  const rows = extractArray(parsed)
  return {
    tasks: rows
      .map((r) => normalizeTask(r, userId))
      .filter((t): t is ForthTask => !!t),
    status: res.status,
  }
}

export async function fetchAllTasksForFilter(
  apiKey: string,
  userId: string,
  completed: 0 | 1,
  baseUrl: string,
  deadlineController: AbortController,
): Promise<ForthTask[]> {
  const tasks: ForthTask[] = []
  const seen = new Set<string>()
  let start = 0
  while (true) {
    const signal = requestSignal(deadlineController)
    const page = await fetchTasksPage(apiKey, userId, completed, start, baseUrl, signal)
    if (page.status === 404) break
    if (page.tasks.length === 0) break

    let newCount = 0
    for (const t of page.tasks) {
      if (!seen.has(t.id)) {
        seen.add(t.id)
        tasks.push(t)
        newCount++
      }
    }
    if (newCount === 0) break // only already-seen ids

    start += PAGE_LIMIT
  }
  return tasks
}

async function pullUser(
  apiKey: string,
  user: ForthUser,
  baseUrl: string,
  deadlineController: AbortController,
): Promise<UserPullResult> {
  try {
    const [open, done] = await Promise.all([
      fetchAllTasksForFilter(apiKey, user.id, 0, baseUrl, deadlineController),
      fetchAllTasksForFilter(apiKey, user.id, 1, baseUrl, deadlineController),
    ])

    const merged = new Map<string, ForthTask>()
    for (const t of open) merged.set(t.id, t)
    for (const t of done) {
      const existing = merged.get(t.id)
      if (!existing) {
        merged.set(t.id, t)
      } else {
        // The account may ignore the filter; trust the record's own completed flag/date.
        const recordCompleted = t.task_completed || existing.task_completed
        const recordCompletedDate = t.task_completed_date ?? existing.task_completed_date
        merged.set(t.id, {
          ...existing,
          firstname: t.firstname ?? existing.firstname,
          lastname: t.lastname ?? existing.lastname,
          task_completed: recordCompleted,
          task_completed_date: recordCompletedDate,
        })
      }
    }
    return { userId: user.id, user, tasks: Array.from(merged.values()) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { userId: user.id, user, tasks: [], failed: message }
  }
}

export async function pullForthTasks(
  apiKey: string,
  baseUrl = FORTH_BASE,
): Promise<{ users: ForthUser[]; allTasks: ForthTask[]; failed: { userId: string; reason: string }[] }> {
  const deadlineController = new AbortController()
  const deadline = setTimeout(() => deadlineController.abort(), DEADLINE_MS)

  try {
    const users = await fetchForthUsers(apiKey, baseUrl, deadlineController)
    const tasksByUser = new Map<string, ForthTask[]>()
    const failed: { userId: string; reason: string }[] = []

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(batch.map((u) => pullUser(apiKey, u, baseUrl, deadlineController)))
      for (const r of results) {
        if (r.failed) {
          failed.push({ userId: r.userId, reason: r.failed })
        } else {
          tasksByUser.set(r.userId, r.tasks)
        }
      }
    }

    // One sequential retry pass for failed users
    if (failed.length > 0) {
      const toRetry = [...failed]
      failed.length = 0
      for (const u of toRetry) {
        const user = users.find((x) => x.id === u.userId)
        if (!user) {
          failed.push({ userId: u.userId, reason: 'User not found during retry' })
          continue
        }
        const retried = await pullUser(apiKey, user, baseUrl, deadlineController)
        if (retried.failed) {
          failed.push({ userId: retried.userId, reason: retried.failed })
        } else {
          tasksByUser.set(retried.userId, retried.tasks)
        }
      }
    }

    if (failed.length > 0) {
      throw new Error(`ForthCRM report incomplete. Failed users: ${failed.map((f) => `${f.userId} (${f.reason})`).join('; ')}`)
    }

    const allTasks: ForthTask[] = []
    for (const [, tasks] of tasksByUser) allTasks.push(...tasks)
    return { users, allTasks, failed: [] }
  } finally {
    clearTimeout(deadline)
  }
}

export function computeForthReport(
  tasks: ForthTask[],
  asOf: string,
  from: string,
  to: string,
): ForthReportRow[] {
  const byUser = new Map<string, ForthReportRow>()
  for (const t of tasks) {
    let row = byUser.get(t.userId)
    if (!row) {
      row = { userId: t.userId, firstname: t.firstname, lastname: t.lastname, overdue: 0, done: 0 }
      byUser.set(t.userId, row)
    }

    const due = t.task_due_date ? parseISO(t.task_due_date) : null
    const completed = t.task_completed_date ? parseISO(t.task_completed_date) : null
    const asOfDate = parseISO(asOf)

    if (
      !t.task_completed &&
      due &&
      isValid(due) &&
      isBefore(due, asOfDate)
    ) {
      row.overdue++
    }

    if (
      t.task_completed &&
      completed &&
      isValid(completed) &&
      isWithinInterval(completed, { start: parseISO(from), end: parseISO(to) })
    ) {
      row.done++
    }
  }
  return Array.from(byUser.values())
}

export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
