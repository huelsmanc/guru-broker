# Go Broker Hub: setup

Your app now runs on infrastructure you own:

| Piece | Where | What it does |
|---|---|---|
| Website + backend | **Vercel** | The React app, plus `/api/fn/*` (all backend functions, one route) |
| Database, logins, files, live updates | **Supabase** (project `fozmqivnjoghsupnqvod`) | Postgres with per-brokerage security, email logins, file storage, realtime chat |
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
   1. `supabase/migrations/0001_init.sql`: all 57 tables, roles and permissions, security rules, storage buckets (public and private), realtime
   2. `supabase/migrations/0002_automations.sql`: scheduled jobs and database automations
   3. `supabase/migrations/0003_mls.sql`: MLS listings and the 15-minute sync
   4. `supabase/migrations/0004_backoffice.sql`: activity log, live updates for admins, license alerts, monthly statements, payout status sync
   5. `supabase/migrations/0005_default_checklists.sql`: adds "Add automatically" checklists to new deals and new agents
   6. `supabase/migrations/0006_messaging.sql`: unread badges, read receipts, reactions, private channels and call history
   7. `supabase/migrations/0007_files_import.sql`: what the Import page needs, and a private place for keys the app makes itself
   8. `supabase/migrations/0008_contacts.sql`: the Contacts page (each agent's private contact book)
   9. `supabase/migrations/0009_contract_forms.sql`: the Contract forms library (state forms shared with every brokerage, or your own)

   Every file is safe to run again, so after pulling new code just re-run them in order.
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
   | `PAYLOAD_SECRET_KEY` | Payload → Settings → API keys (the secret key) |
   | `PAYLOAD_PROCESSING_ID` | Payload → your processing account id (the account payouts are paid from) |

   Without the two Payload values everything still works except the "Send direct deposit" button; you can still mark payouts paid by check.

   Phone and desktop notifications (messages, mentions, calls, approvals) need no setup: the app makes its own keys the first time and keeps them in the database. On iPhone, people add the app to their Home Screen (Share → Add to Home Screen) and turn notifications on from there; the app shows them how.

   For house photos on CMA comps that don't have MLS photos, add `GOOGLE_MAPS_API_KEY` (Google Cloud → enable "Street View Static API" → Credentials → API key; restrict it to that API). Without it those comps show "Photo Unavailable". Also enable "Places API (New)" on the same key for address suggestions while typing.
   For voice and video calls add `DAILY_API_KEY`: sign up at daily.co, then Developers → API keys. Free for the first 10,000 call minutes each month. Without it everything else works and the call buttons explain what's missing. AI call notes also need Daily's transcription add-on turned on in your Daily account (billed by Daily per minute transcribed); without it the notes button says so.

3. Deploy, then open the preview URL and check that the sign-in page loads.

## 3. Resend

Add and verify the `gurubroker.app` domain (Resend shows the DNS records to add). Until it's verified, emails from `@gurubroker.app` won't send.

## 4. Move your data over (Base44 and Brokermint)

Everything here is on the app's **Import Data** page (in the sidebar for the owner, broker and super admin). Each step can be run again safely.

1. **Sign in once** to the new app with "Email me a sign-in link", so your login exists.
2. **Make yourself super admin** (Supabase SQL editor):
   ```sql
   update public.profiles set role = 'super_admin' where email = 'cody@gurubroker.com';  -- the email you sign in with
   ```
3. **Base44 data.** In Base44, export each data table (Data → table → Export) as CSV or JSON, keeping the table name as the file name (`User.csv`, `Transaction.csv`, `ESignDocument.csv`, …). On **Import Data → Base44 data**, drop all the files in, tick **All brokerages** and **Copy files off Base44**, and click Import. Every record keeps its id and dates, everyone gets a login, and files move into your storage (deal documents and chat files into private storage). Big exports take a few minutes; leave the page open until it finishes.
4. **Make files private.** On **Import Data → Make files private**, click the button once. It moves deal documents, offers, e-sign files and chat attachments that were stored publicly (older uploads and the import) into private storage. From then on, a file link only opens for someone signed in who can see that deal or conversation.
5. **Agents from Brokermint.** Choose your brokerage at the top of the page. In Brokermint, export the users list (Settings → Users → Export) and upload it under **Agents from Brokermint**. It brings over role, phone, birthday, anniversary (starts their cap year), team, address, annual cap, up to 4 licenses, their TC and who recruited them. Tick "Email everyone an invite" if you want them to get a set-password email now.
6. **Cap history from Brokermint**, so agents partway through their cap year don't start back at $0. Export a transactions or commission report from Brokermint covering at least each agent's current cap year, upload it under **Cap history from Brokermint**, match the columns (agent, closing date and the amount paid to the brokerage are required), and import. It shows each agent's total for this cap year before you import, and each import can be undone. No per-deal report? Type each agent's totals into **Starting balances** instead (not both).
7. Assign commission plans under **Manage Users**.

**Passwords:** Base44 can't export them. Everyone signs in the first time with **"Email me a sign-in link"** or **"Forgot password"** on the sign-in page. Send your agents a heads-up.

Imports don't send notifications, emails or activity entries for old records. For very large Base44 exports there are also command-line versions (`scripts/import-base44.mjs`, `scripts/import-brokermint-users.mjs`; run either with no arguments for help).

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

## 6. Back office first run

1. **Commission Plans:** build your plans (split and cap, sliding scale, flat fee, team, downline). Mark one as the default.
2. **Manage Users → Edit:** for each agent, set the plan, cap anniversary, team, recruiter ("Recruited by"), licenses and E&O dates. The Direct deposit tab sends them a Payload bank-link email.
3. **Checklist Templates:** the starter set (Buyer, Listing, Rentals, Dual, Referral, Agent Onboarding) appears the first time you open it. Tick "Add automatically" on the ones every new deal or agent should get.
4. **Settings:** fill in the CEO thank-you (name, message, YouTube link) and whether CDAs pay agents directly.

Payout flow: save the commission on a deal (Finances) → payouts appear in **Payouts** waiting approval → approve → mark funds received from title on the deal → Send direct deposit. Statements email on the 1st of each month; license and E&O reminders go out 60, 30 and 7 days before expiry.

### Messaging after the move
- Channels you had in Base44 stay members-only, like before (except default ones, which become open to everyone). Admins can make any channel public or private from its settings (gear icon).
- Desktop alerts: each person's browser asks once for permission to show notifications.

## 7. Switch the domain

When the preview looks right: Vercel → Settings → Domains → add `gurubroker.app`, update DNS as Vercel shows, then turn off the Base44 app.

---

## E-sign extras (nothing to set up)

- **Seal:** every fully signed PDF is digitally sealed. The app makes its own seal certificate the first time, so Adobe shows the signer as "unknown" but still flags any later change. To show your company name instead, buy a document-signing certificate and put its key and certificate (PEM) in Vercel as `ESIGN_SEAL_KEY` and `ESIGN_SEAL_CERT`.
- **Verify page:** the QR code on each certificate opens `/verify?id=...`, which anyone can use to check a copy.
- **Time zone:** dates for statements and closings use US Eastern. Set `APP_TIMEZONE` (e.g. `America/Chicago`) in Vercel to change it.

## What changed from Base44

- **E-sign rebuilt.** Fields line up everywhere, the editor works with mouse and touch, signing in order is enforced, and a real signed PDF with a certificate page is emailed to everyone and attached to the transaction. Old emailed links still work. DocuSeal is removed.
- **Back office (replaces Brokermint):** transaction workspace (checklists, documents, offers, contacts, finances, shared, activity), commission plans with caps, sliding scales, team splits and multi-level revenue share, payouts with approval and Payload direct deposit, monthly statements, CDAs, 1099 worksheet, reports, a live activity feed, license tracking, role permissions per user, and the CEO closing thank-you.
- **New:** Offer Builder (AI-written offers, "Offer accepted" opens the transaction and assigns the TC), contract scanner, AI-placed signature fields, AI file check, MLS sync with real-sale CMAs.
- **Private files:** deal documents, offers, onboarding paperwork and chat attachments are stored privately. Links only open for signed-in people who can see that deal or conversation, so a forwarded link is useless to anyone else.
- **Import Data page:** Base44 data, Brokermint agents and Brokermint cap history, with no terminal needed.
- **Security fixes found during the move:** functions that let anyone trigger emails or read documents without signing in are now locked; the OpenAI key setting that every agent could read is removed; signing link codes are stored hashed and encrypted; page titles and names are escaped in emails.
- **Bug fixes:** removing a reaction crashed, the notifications button crashed, "delete my account" didn't delete anything, signing reminders pointed to a dead link.

## Checking things work

```bash
npm install
npm run build          # the app compiles
npm run test:esign     # e-sign, AI, MLS, back office, messaging, marketing, private files and imports, with fake email/database
```

## Gear Store (Shopify, per brokerage)

Nothing to set in Vercel. Each brokerage connects its own Shopify store from **Gear Store** in the menu
(brokers and admins only):

1. Shopify admin → Sales channels → add the free **Headless** channel → Create storefront.
2. Copy the **Storefront API public access token**.
3. Publish the products you want agents to see to the Headless channel.
4. In Guru Broker → Gear Store, enter the store address (yourstore.myshopify.com) and the token.

The token is kept server-side (app_secret table, `shopify:<brokerage id>`). Agents check out on
Shopify's own checkout page; orders carry the agent's name and email as order notes/attributes.

## Client portal

Nothing to set up. On a deal, open **Client portal**, then **Invite** each buyer/seller (they must be
added as a client with an email under Users & contacts). Clients open their link, confirm with a
6-digit code sent to their email (once per device, 30 days), and can message the deal team in the
deal's **client chat** (separate from the team's deal chat), see key dates and progress, and upload
documents you request. Uploads land in the deal's Documents under **Client uploads**.
The session signing key is created automatically (app_secret `client_portal`); set
CLIENT_PORTAL_SECRET in Vercel to override.

## Print & mail (Marketing > Print & mail)

Agents order postcards mailed to a list (Lob) or flyers and business cards shipped to them
(Gelato), paying by card (Stripe Checkout). It starts in **test mode** (nothing is charged,
printed or mailed); the platform owner turns it off in **Print settings** when ready.

1. Run `supabase/migrations/0013_print_shop.sql` in the Supabase SQL editor.
2. Vercel environment variables:
   - `STRIPE_SECRET_KEY` (Stripe > Developers > API keys; use the test key first)
   - `STRIPE_WEBHOOK_SECRET`: in Stripe add a webhook endpoint
     `https://YOUR-DOMAIN/api/fn/stripeWebhook` for `checkout.session.completed`, then copy its signing secret
   - `LOB_API_KEY` (Lob dashboard > Settings > API keys; `test_...` never mails)
   - `GELATO_API_KEY` (Gelato dashboard > Developer > API keys)
3. In **Print settings**: set the prices agents pay, check the Gelato product codes, then turn off
   test mode.

Listing kits (postcard + flyer + post + story) are made automatically when a listing-side deal is
added, when any deal closes, and hourly for agents' own new Active MLS listings.
