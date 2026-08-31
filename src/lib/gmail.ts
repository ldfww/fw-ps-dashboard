import { OAuth2Client } from 'google-auth-library'

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me/messages'

export interface GmailCount {
  counted_date: string
  received: number
  opened: number
  unopened: number
}

function startOfDaySeconds(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
}

function parseJsonBody(text: string): unknown {
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

async function getAuthToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN must be set')
  }

  const auth = new OAuth2Client(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  const res = await auth.getAccessToken()
  const token = typeof res === 'string' ? res : res?.token
  if (!token) {
    throw new Error('Could not retrieve Gmail access token')
  }
  return token
}

async function fetchMessageCount(
  token: string,
  query: string,
  after: number,
  before: number,
): Promise<number> {
  let total = 0
  let pageToken: string | undefined
  while (true) {
    const params = new URLSearchParams({
      q: `${query} after:${after} before:${before}`,
      includeSpamTrash: 'false',
      maxResults: '500',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${GMAIL_API}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Gmail list failed: ${res.status} ${body.slice(0, 200)}`)
    }

    const text = await res.text()
    const data = parseJsonBody(text) as { messages?: { id: string }[]; nextPageToken?: string }
    const messages = data.messages || []
    total += messages.length
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return total
}

export async function fetchGmailCountsForDay(date: string): Promise<GmailCount> {
  const token = await getAuthToken()
  const after = startOfDaySeconds(date)
  const before = after + 86400
  const query = '-in:sent -in:drafts -in:spam -in:trash'

  const received = await fetchMessageCount(token, query, after, before)
  const unopened = await fetchMessageCount(token, `${query} label:unread`, after, before)

  return {
    counted_date: date,
    received,
    opened: received - unopened,
    unopened,
  }
}

export async function fetchGmailRange(
  from: string,
  to: string,
): Promise<GmailCount[]> {
  const results: GmailCount[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    results.push(await fetchGmailCountsForDay(date))
  }
  return results
}
