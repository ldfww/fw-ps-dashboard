import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { serveStatic } from 'hono/serve-static'
import handler from './dist/server/server.js'

const app = new Hono()

app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.all('*', (c) => handler.fetch(c.req.raw))

const port = Number(process.env.PORT) || 3000
console.log(`Listening on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
