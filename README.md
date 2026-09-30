# Go Broker Hub

Real estate brokerage platform: transactions, e-sign, offers, CMA, MLS, chat, compliance and culture tools.
Self-hosted on Vercel + Supabase (migrated from Base44).

- **Set it up:** [SETUP.md](SETUP.md)
- **Run locally:** `npm install`, copy `.env.example` to `.env.local` and fill it in, then `npm run dev`
- **Tests:** `npm run test:esign`

## Layout

| Path | What |
|---|---|
| `src/` | React app (Vite). `src/api/base44Client.js` keeps the old `base44.*` API working on Supabase |
| `api/fn/[name].js` | Single Vercel route for every backend function |
| `api/hooks/db.js` | Database automations (row changes -> functions) |
| `server/functions/` | Backend functions (ported from Base44, plus new ones) |
| `server/lib/` | Data layer, AI (Claude/ChatGPT), e-sign engine, MLS clients |
| `shared/` | Code used by both browser and server (entities, e-sign geometry) |
| `supabase/migrations/` | Database schema, security rules, schedules |
| `scripts/` | Schema generator, function registry, Base44 data import |
