import 'dotenv/config'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const output = '.amplify-hosting'
const compute = `${output}/compute/default`
const staticDir = `${output}/static`

await rm(output, { recursive: true, force: true })
await mkdir(compute, { recursive: true })
await mkdir(staticDir, { recursive: true })
await cp('dist/client', staticDir, { recursive: true })

await build({
  entryPoints: ['server.mjs'],
  outfile: `${compute}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  minify: true,
  sourcemap: false,
})

const runtimeVariables = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VICIDIAL_USER',
  'VICIDIAL_PASS',
  'FORTH_API_KEY',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GOOGLE_SHEETS_CLIENT_EMAIL',
  'GOOGLE_SHEETS_PRIVATE_KEY',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
  'GOOGLE_SHEETS_MASTER_SPREADSHEET_ID',
  'GOOGLE_SHEETS_MASTER_RANGE',
  'GOOGLE_SHEETS_CANCEL_SPREADSHEET_ID',
  'GOOGLE_SHEETS_CANCEL_RANGE',
  'GOOGLE_SHEETS_NSF_SPREADSHEET_ID',
  'GOOGLE_SHEETS_NSF_RANGE',
  'SYNC_SECRET',
  'THRESHOLD_OVERDUE',
]
const requiredVariables = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
const missingVariables = requiredVariables.filter((name) => !process.env[name])
if (missingVariables.length > 0) {
  throw new Error(`Missing required Amplify environment variables: ${missingVariables.join(', ')}`)
}
const runtimeEnv = runtimeVariables
  .filter((name) => process.env[name] !== undefined)
  .map((name) => `${name}=${JSON.stringify(process.env[name])}`)
  .join('\n')
await writeFile(`${compute}/.env`, `${runtimeEnv}\n`)

const manifest = {
  version: 1,
  routes: [
    { path: '/assets/*', target: { kind: 'Static' }, fallback: { kind: 'Compute', src: 'default' } },
    { path: '/*', target: { kind: 'Compute', src: 'default' } },
  ],
  computeResources: [
    { name: 'default', runtime: 'nodejs22.x', entrypoint: 'index.mjs' },
  ],
  framework: { name: 'tanstack-start', version: '1.168.0' },
}

await writeFile(`${output}/deploy-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
