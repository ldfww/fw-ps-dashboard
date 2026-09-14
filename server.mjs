import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import handler from './dist/server/server.js'

const app = new Hono()

app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.use('*', async (c, next) => {
  await next()
  if (!c.req.path.startsWith('/assets/')) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    c.header('Pragma', 'no-cache')
    c.header('Expires', '0')
  }
})
app.all('*', (c) => handler.fetch(c.req.raw))

const port = Number(process.env.PORT) || 3000
console.log(`Listening on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
