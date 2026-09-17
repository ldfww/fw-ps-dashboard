import 'dotenv/config'
import { syncQuick } from '../src/lib/sync'

async function main() {
  const started = new Date().toISOString()
  console.log(`[sync-quick] starting at ${started}`)
  const result = await syncQuick()
  console.log('[sync-quick] result:', result)
}

main().catch((err) => {
  console.error('[sync-quick] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
