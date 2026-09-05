# Financial Warranty Ops Dashboard — Project Notes

## Stack
- TanStack Start v1 (React 19, Vite 7, SSR), TypeScript, Tailwind v4
- Supabase (Postgres + Auth + RLS)
- Production runner: `server.mjs` with Hono serving `dist/client` static assets and the SSR `fetch` handler from `dist/server/server.js`

## Commands
- `npm install` — install dependencies
- `npm run dev` — Vite dev server
- `npm run build` — production build to `dist/`
- `npm start` — run `node server.mjs` on port 3000 (or `PORT`)
- `npx vitest run` — run tests

## Environment Variables
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (browser)
- `VICIDIAL_USER` / `VICIDIAL_PASS`
- `FORTH_API_KEY` (long-lived; `FORTH_CLIENT_ID` / `FORTH_CLIENT_SECRET` optional)
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN`
- `GOOGLE_SHEETS_CLIENT_EMAIL` / `GOOGLE_SHEETS_PRIVATE_KEY` / `GOOGLE_SHEETS_SPREADSHEET_ID`
- `SYNC_SECRET` (shared secret for `POST /api/public/sync`)
- `THRESHOLD_OVERDUE` (default 30)

## Database
Run `supabase/migrations/001_schema.sql` in your Supabase project. It creates tables, the `app_role` enum, the `has_role()` SECURITY DEFINER helper, and the first-user auto-manager trigger.

## ForthCRM Deploy Requirement
Forth's Cloudflare WAF blocks unknown datacenter egress ranges. Before the live pull will work you must get the outbound IP of your production host (Fly.io, Render, small VPS) allowlisted with Forth support.

## Sync Endpoint
`POST /api/public/sync` with JSON `{ secret, date?, user_group? }`. Use it with a platform cron or `pg_cron` to write nightly `report_snapshots`.

## Verification
- `npm run build` must pass
- `npx vitest run` must pass (10 ForthCRM tests currently)
- `npm start` should render the login page at `http://localhost:3000`

## Current Handoff
- Overview, Dialer, CRM, and Gmail reporting are connected; the latest build and all 10 tests pass.
- Pending: connect and redesign the Supervisor Spreadsheet page, then connect its metrics to Overview.
- The Sheets reader currently expects the tab `Sheet1`, with headers `agent`, `date`, and `tasks_assigned`; dates should use `YYYY-MM-DD`.
- Enable the Google Sheets API, create a read-only service account, share the spreadsheet with its client email, and configure the three Google Sheets environment variables above locally. Never commit the service-account private key.
- After configuration, verify the live Spreadsheet page, run the sync, confirm `sheet_tasks`/snapshot persistence, and rerun the build and tests.
- Campaign filtering remains unavailable because the current ViciDial response does not include campaign-level fields.
