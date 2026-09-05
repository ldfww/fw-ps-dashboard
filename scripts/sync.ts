import 'dotenv/config'
import { syncAll } from '../src/lib/sync'

async function main() {
  console.log('Starting sync...')
  const start = Date.now()
  try {
    const counts = await syncAll()
    console.log('Sync completed in', (Date.now() - start) / 1000, 's:', counts)
    process.exit(0)
  } catch (err) {
    console.error('Sync failed:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
