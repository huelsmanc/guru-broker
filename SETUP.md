# Go Broker Hub: setup

Your app now runs on infrastructure you own:

| Piece | Where | What it does |
|---|---|---|
| Website + backend | **Vercel** | The React app, plus `/api/fn/*` (all backend functions, one route) |
| Database, logins, files, live updates | **Supabase** (project `btiqwmmxkkbaignnokfi`) | Postgres with per-brokerage security, email logins, file storage, realtime chat |
| Scheduled jobs + automations | **Supabase** (pg_cron + pg_net) | Deadline reminders, signing reminders, event reminders, MLS sync, notifications |
| Email | **Resend** | Signing requests, signed PDFs, reminders, TC notices |
| AI | **Claude and/or ChatGPT** | Offer writer, contract scanner, auto-placed signature fields, file check, CMA, chat |
| MLS | **SmartMLS (RETS)**, more later | Listings and sold data every 15 minutes |

Do these in order. Budget about an hour.

---

## 1. Supabase

1. Open your project at supabase.com.
   **Check first:** if the project already has tables from the earlier migration attempt and they only hold test data, it's cleanest to remove them (Database → Tables). The setup SQL only adds what's missing, so an old table with the same name but different columns would cause errors.
2. **Database → Extensions:** turn on `pg_cron` and `pg_net`.
3. **SQL Editor:** open each file below from this repo, paste it in, and click Run, in this order:
   1. `supabase/migrations/0001_init.sql`: all 44 tables, security rules, storage buckets, realtime
   2. `supabase/migrations/0002_automations.sql`: scheduled jobs and database automations
   3. `supabase/migrations/0003_mls.sql`: MLS listings and the 15-minute sync
4. Still in the SQL editor, run this once, with your real domain and a long random secret (you'll use the same secret as `HOOK_SECRET` in Vercel):
   ```sql
   update private.app_config
      set app_url = 'https://gurubroker.app',
          hook_secret = 'PASTE-A-LONG-RANDOM-STRING';
   ```
5. **Authentication → URL Configuration**
   - Site URL: `https://gurubroker.app`
   - Redirect URLs: `https://gurubroker.app/**` and your Vercel preview URL `https://*.vercel.app/**`
6. **Authentication → Emails → SMTP settings:** turn on custom SMTP and use Resend's SMTP (host `smtp.resend.com`, port 465, user `resend`, password = your Resend API key, sender `noreply@gurubroker.app`). Supabase's built-in email only sends a few messages an hour, which isn't enough for invites and sign-in links.
7. **Project Settings → API:** copy the Project URL, the `anon` public key and the `service_role` key for step 2.

## 2. Vercel

1. **Add New → Project**, import the `guru-broker` GitHub repo (branch `go-broker-hub-selfhosted` until it's merged).
   Framework: Vite. Build and output settings come from `vercel.json`.
2. **Settings → Environment Variables:** add everything in `.env.example`. The required ones:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL`, `SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server only, never share) |
   | `APP_URL` | `https://gurubroker.app` |
   | `HOOK_SECRET` | the same random string you put in `private.app_config` |
   | `SIGNING_TOKEN_SECRET` | another long random string (protects signing links) |
   | `RESEND_API_KEY` | from resend.com |
   | `EMAIL_FROM` | `Guru Broker <noreply@gurubroker.app>` |
   | `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` | at least one |
   | `AI_PROVIDER` | `anthropic` or `openai` (the other one is the backup) |

3. Deploy, then open the preview URL and check that the sign-in page loads.

## 3. Resend

Add and verify the `gurubroker.app` domain (Resend shows the DNS records to add). Until it's verified, emails from `@gurubroker.app` won't send.

## 4. Move your data over from Base44

1. In Base44, export each data table (CSV or JSON) into one folder. Name each file after its table: `User.csv`, `Transaction.csv`, `ESignDocument.csv`, and so on.
2. On your computer, in this project folder:
   ```bash
   npm install
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-base44.mjs ./base44-export --copy-files --dry-run
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-base44.mjs ./base44-export --copy-files
   ```
   Every record keeps its id and dates. `--copy-files` moves files off Base44's storage into yours. It's safe to run again.
3. **Make yourself super admin** (SQL editor):
   ```sql
   update public.profiles set role = 'super_admin' where email = 'cody@gurubroker.com';  -- the email you sign in with
   ```

**Passwords:** Base44 can't export them. Everyone signs in the first time with **"Email me a sign-in link"** or **"Forgot password"** on the sign-in page. Send your agents a heads-up.

## 5. SmartMLS

When SmartMLS gives you RETS access, add these in Vercel (don't paste them in chat or email):

```
MLS_SOURCES=smartmls
SMARTMLS_TYPE=rets
SMARTMLS_FEED=vow            # or idx: what your license allows
SMARTMLS_LOGIN_URL=...       # from SmartMLS
SMARTMLS_USERNAME=...
SMARTMLS_PASSWORD=...
SMARTMLS_USER_AGENT=...      # if SmartMLS assigns one
SMARTMLS_UA_PASSWORD=...     # if SmartMLS assigns one
SMARTMLS_CLASS=...           # the property class name SmartMLS gives you
```

The first full download spreads over several 15-minute runs. Progress shows in the `mls_sync_state` table.
Another MLS later: add its id to `MLS_SOURCES` (e.g. `smartmls,njmls`) and the same variables with its prefix. Web API feeds use `<ID>_TYPE=webapi`, `<ID>_API_URL`, `<ID>_TOKEN`.

## 6. Switch the domain

When the preview looks right: Vercel → Settings → Domains → add `gurubroker.app`, update DNS as Vercel shows, then turn off the Base44 app.

---

## What changed from Base44

- **E-sign rebuilt.** Fields line up everywhere, the editor works with mouse and touch, signing in order is enforced, and a real signed PDF with a certificate page is emailed to everyone and attached to the transaction. Old emailed links still work. DocuSeal is removed.
- **New:** Offer Builder (AI-written offers, "Offer accepted" opens the transaction and assigns the TC), contract scanner, AI-placed signature fields, AI file check, MLS sync with real-sale CMAs.
- **Security fixes found during the move:** functions that let anyone trigger emails or read documents without signing in are now locked; the OpenAI key setting that every agent could read is removed; signing link codes are stored hashed and encrypted; page titles and names are escaped in emails.
- **Bug fixes:** removing a reaction crashed, the notifications button crashed, "delete my account" didn't delete anything, signing reminders pointed to a dead link.

## Checking things work

```bash
npm install
npm run build          # the app compiles
npm run test:esign     # e-sign, AI and MLS tests with fake email/database
```
