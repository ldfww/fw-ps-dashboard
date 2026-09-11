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
  target: 'node20',
  format: 'esm',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  minify: true,
  sourcemap: false,
})

const manifest = {
  version: 1,
  routes: [
    { path: '/assets/*', target: { kind: 'Static' }, fallback: { kind: 'Compute', src: 'default' } },
    { path: '/*', target: { kind: 'Compute', src: 'default' } },
  ],
  computeResources: [
    { name: 'default', runtime: 'nodejs20.x', entrypoint: 'index.mjs' },
  ],
  framework: { name: 'tanstack-start', version: '1.168.0' },
}

await writeFile(`${output}/deploy-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
