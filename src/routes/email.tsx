import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { format, parseISO, subDays } from 'date-fns'
import { fetchGmailRange } from '~/lib/gmail'

const mailbox = 'documents@financialwarranty.com'

function currentDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const getGmail = createServerFn({ method: 'GET' })
  .validator((input: { from: string; to: string }) => input)
  .handler(async ({ data }) => {
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
      return { from: data.from, to: data.to, mailbox, configured: false, counts: [] }
    }
    const counts = await fetchGmailRange(data.from, data.to)
    return { from: data.from, to: data.to, mailbox, configured: true, counts }
  })

export const Route = createFileRoute('/email')({
  validateSearch: (search: Record<string, unknown>) => {
    const to = isDate(search.to) ? search.to : currentDate()
    return {
      from: isDate(search.from) ? search.from : format(subDays(parseISO(to), 6), 'yyyy-MM-dd'),
      to,
    }
  },
  loaderDeps: ({ search }) => search,
  component: EmailPage,
  loader: async ({ deps }) => await getGmail({ data: deps }),
})

function EmailPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const received = data.counts.reduce((sum, count) => sum + count.received, 0)
  const opened = data.counts.reduce((sum, count) => sum + count.opened, 0)
  const unopened = data.counts.reduce((sum, count) => sum + count.unopened, 0)
  const openRate = received ? (opened / received) * 100 : 0
  const maxReceived = Math.max(...data.counts.map((count) => count.received), 1)

  function setPreset(days: number) {
    const to = currentDate()
    navigate({ to: '/email', search: { from: format(subDays(parseISO(to), days - 1), 'yyyy-MM-dd'), to } })
  }

  return (
    <div className="space-y-4 font-manrope">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="RECEIVED" value={received} />
        <Kpi label="OPENED" value={opened} />
        <Kpi label="UNOPENED" value={unopened} />
        <Kpi label="OPEN RATE" value={`${openRate.toFixed(0)}%`} />
      </div>

      <section className="rounded-2xl bg-card shadow-sm">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="font-sora text-sm font-bold text-ink">DAILY VOLUME</h2>
          <p className="text-xs text-muted">{mailbox} · {data.from} → {data.to}</p>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-end gap-3 border-b border-ink/10 pb-4">
            <DateInput
              label="FROM"
              value={search.from}
              onChange={(from) => navigate({ to: '/email', search: { ...search, from } })}
            />
            <DateInput
              label="TO"
              value={search.to}
              onChange={(to) => navigate({ to: '/email', search: { ...search, to } })}
            />
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPreset(days)}
                className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-ink hover:bg-ink/5"
              >
                {days}D
              </button>
            ))}
          </div>

          {!data.configured ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-ink">Gmail connection is not configured.</p>
              <p className="mt-1 text-xs text-muted">Add OAuth credentials for {mailbox} to load mailbox counts.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {data.counts.map((count) => {
                const openedWidth = (count.opened / maxReceived) * 100
                const unopenedWidth = (count.unopened / maxReceived) * 100
                return (
                  <div key={count.counted_date}>
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="font-semibold text-ink">{count.counted_date}</span>
                      <span className="text-right text-muted">
                        {count.received} received · {count.opened} opened · {count.unopened} unopened
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-ink/10">
                      <div className="bg-ink" style={{ width: `${openedWidth}%` }} />
                      <div className="bg-accent" style={{ width: `${unopenedWidth}%` }} />
                    </div>
                  </div>
                )
              })}
              {data.counts.length === 0 && (
                <p className="py-8 text-center text-xs text-muted">No messages found for this period.</p>
              )}
            </div>
          )}

          <p className="mt-5 border-t border-ink/10 pt-4 text-xs text-muted">
            Opened means the message was read in this mailbox. Whether recipients opened mail you sent is not something Gmail reports.
          </p>
        </div>
      </section>
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-muted">
      <span className="mb-1 block">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink"
      />
    </label>
  )
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-sora text-4xl font-bold text-ink">{value}</p>
    </div>
  )
}
