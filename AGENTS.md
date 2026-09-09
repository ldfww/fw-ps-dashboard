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
- Overview, Dialer, CRM, Gmail, and Sales Closing Ratio reporting are connected; the latest build and all 10 tests pass.
- The DIALER report now pulls pause-code data from ViciDial's `AST_agent_time_detail.php` report and displays `BREAK` and `LUNCH` as separate KPIs and stacked-bar segments alongside talk, wait, and pause.
- The Sales Closing Ratio integration reads the `results` tab from the configured spreadsheet, parses `Date Range`, `Agent`, `Booked Sales`, `Paid Sales (Green)`, `Red (NSF)`, `Gray (Pending cancel)`, `Closing Ratio`, `Cancelled Clients`, and `White (Scheduled)`, and persists records to `sales_closing_records`.
- The Google Sheets service-account credentials are configured locally and the `supabase/migrations/001_schema.sql` migration has been applied. The live `results` tab currently parses 17 agent rows + 1 total row and the total closing ratio matches the sheet at 49.27%.
- `server.mjs` was updated to use `@hono/node-server/serve-static` so the production preview correctly serves `dist/client` assets and styles.
- The build, tests, and local parser verification pass; the SALES/DIALER pages and Overview cards should now load live data in the refreshed preview.
- Campaign filtering remains unavailable because the current ViciDial response does not include campaign-level fields.
- The DIALER page now pulls inbound-group drop counts from ViciDial's `call_status_stats` API (filtering `statuses=DROP`) and displays a per-inbound-group table with total calls, drops, and drop rate; users can filter by ViciDial campaign using the `campaigns_list` API.
