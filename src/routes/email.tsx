import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { format, subDays } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchGmailRange } from '~/lib/gmail'

function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

const getGmail = createServerFn({
  method: 'GET',
}).handler(async () => {
  if (!process.env.GMAIL_CLIENT_ID) {
    throw new Error('Gmail OAuth credentials are not configured')
  }
  const to = today()
  const from = format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const counts = await fetchGmailRange(from, to)
  return { from, to, counts }
})

export const Route = createFileRoute('/email')({
  component: EmailPage,
  loader: async () => await getGmail(),
})

function EmailPage() {
  const data = Route.useLoaderData()

  return (
    <div className="font-manrope">
      <h1 className="mb-2 font-sora text-2xl font-semibold text-ink">
        Gmail — Shared Mailbox
      </h1>
      <p className="mb-6 text-sm text-muted">
        These counts reflect reads in this mailbox. Gmail cannot report whether
        external recipients opened mail you sent.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Kpi label="Received" value={data.counts.reduce((s, c) => s + c.received, 0)} />
        <Kpi label="Opened" value={data.counts.reduce((s, c) => s + c.opened, 0)} />
        <Kpi label="Unopened" value={data.counts.reduce((s, c) => s + c.unopened, 0)} accent />
      </div>

      <div className="border border-ink/10 bg-paper p-4">
        <p className="mb-4 text-sm font-semibold text-ink">Daily volume</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.counts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6d3cd" />
              <XAxis dataKey="counted_date" tick={{ fill: '#0a0a0a', fontSize: 12 }} />
              <YAxis tick={{ fill: '#0a0a0a', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#f5f3ee',
                  border: '1px solid #0a0a0a',
                  borderRadius: 0,
                }}
              />
              <Bar dataKey="received" fill="#0a0a0a" />
              <Bar dataKey="opened" fill="#78716c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="border border-ink/10 p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 font-sora text-2xl font-semibold ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
