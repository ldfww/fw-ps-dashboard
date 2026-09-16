import 'dotenv/config'
import { syncAll } from '../src/lib/sync'

async function main() {
  const started = new Date().toISOString()
  console.log(`[sync] starting at ${started}`)
  const result = await syncAll()
  console.log('[sync] result:', result)
}

main().catch((err) => {
  console.error('[sync] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
