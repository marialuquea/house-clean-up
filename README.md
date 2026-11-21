# house-clean-up

Maria's clear-out: one link to drop in any chat. People browse a photo grid of everything for sale, then ask to buy, make an offer or claim free stuff. Every request lands in an admin page, and the buyer can also send Maria a pre-written WhatsApp with their details. Spec: [clearout-app-prd.md](clearout-app-prd.md).

- **Frontend:** plain HTML + JavaScript in `site/` (Preact + htm loaded from a CDN). No Node, no build step.
- **Backend:** Supabase (database, photo storage, admin login).
- **Hosting:** GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

## One-time setup (~15 min)

### 1. Supabase
1. Create a free project at [supabase.com](https://supabase.com), region **London (eu-west-2)**.
2. **SQL Editor → New query**: paste all of [`supabase/schema.sql`](supabase/schema.sql) and **Run**. This creates the tables, security rules, photo bucket and the daily job that wipes buyer contacts 30 days after an item is gone. It's safe to re-run.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
4. **Authentication → Users → Add user → Create new user**: your email + a password (tick "Auto confirm"). This password is what you type on `#/admin`.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. Config
Edit [`site/config.js`](site/config.js) with the URL, anon key and the admin email from step 4. These are safe to commit: the anon key is public by design, and buyers' contact details are protected by the database's row-level security, not by hiding this file. (It does make your admin email visible to anyone who looks at the site's source.)

### 3. GitHub
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. Repo → **Settings → Secrets and variables → Actions**: add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values). These are used only by the keep-alive job, which pings Supabase every 3 days so the free project doesn't pause.
3. Push to `main`. The site appears at `https://marialuquea.github.io/house-clean-up/`.

## Using it

| Who | Where | What |
|---|---|---|
| Buyers | `…/house-clean-up/` | Grid → item → "I'll take it" / "Make an offer" / "I'd love this" → name, contact, offer, pickup dates → saved, then a "Send me a WhatsApp" button opens a pre-written message to +44 7599 973293 |
| You | `…/house-clean-up/#/admin` | Password → **+ Add item** (photos, title, Fixed/Offers/Free, prices) → **Post it**. Tap an item to see requests, WhatsApp/email buyers, **Accept**, **Decline**, **Mark as gone**, **Fell through** (promotes the backups) |

Photos are shrunk to 1600px and re-encoded in your phone's browser before upload, which also strips GPS location.

## Run locally

```bash
python3 -m http.server 8000 --directory site
```

Then open http://localhost:8000. It talks to the real Supabase project in `site/config.js`.

## Verification checklist (PRD M6)

Run these against the real project before sharing the link:

- [ ] With the anon key, `select * from requests` returns 0 rows, and `update items` fails
- [ ] `auth.signUp` with the anon key fails (signups disabled)
- [ ] A fixed-price request with the wrong amount is rejected; a request on a Gone item is rejected
- [ ] Submit fixed, offer, free and backup requests from a second phone; all show in admin
- [ ] Accept → Fell through → the backup is promoted
- [ ] A downloaded uploaded photo has no GPS data in an EXIF viewer
- [ ] Supabase **Integrations → Cron** shows `wipe-old-contacts`
- [ ] The keep-alive Action has run successfully once (Actions tab → "Keep Supabase awake" → Run workflow)
- [ ] Time your first 5 listings: median under 60s
