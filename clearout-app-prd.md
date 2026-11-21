# Clear-out App PRD

**Status:** Draft, 2026-11-21
**Owner:** Maria
**Surface:** New repo. Static SPA on GitHub Pages (`index.html`, `src/`), Supabase project (Postgres, Storage, Auth), one GitHub Action.

## Problem

I'm moving and need to clear out my stuff. Today that means scattered WhatsApp messages, Facebook Marketplace listings and "who wants this?" posts, with no single place to see what's left, who asked first, or what people are willing to pay.

I want one link I can drop in any chat. People open it on their phone, see a photo grid of my things, and either ask to buy at the asking price, make an offer up to their max, or request something for free. I see every request in one admin view, pick who gets it, and sort out cash/collection on WhatsApp.

We want to:
1. List an item from my phone in under a minute (snap, title, price mode, post).
2. Give buyers a no-account way to request, offer or claim an item.
3. Keep a queue of backup requests so a no-show doesn't put the item back to square one.
4. Clear everything before the move.

**Success metric:** Every listed item reaches "Gone" before the move, and median time to list an item is under 60 seconds. Baseline: none needed. Track via the admin stats strip (M4) and a manual stopwatch on the first 5 listings.

## Constraints

- **Freedom:** Free hand. Personal project, any stack within the hosting choice below.
- **Touches:** Buyers' personal data (name + phone/email). No payments, no automated messages to anyone.
- **Data & safety:**
  - Buyer contact details are readable by the admin only, enforced by database row-level security, never by client-side checks.
  - Contact details are wiped 30 days after an item is marked Gone.
  - The app never messages buyers. WhatsApp/email links open on my phone and I send manually.
  - Public pages show amounts only (top offer), never names or contact details.

## Decisions captured (from scoping conversation)

| Question | Decision |
|---|---|
| Why build it | Clearing out before my move |
| Who can see items | Anyone with the link. No sign-up wall, not indexed (`noindex`) |
| Who lists items | Just me (single admin) |
| Buyer identity | Name + contact (phone or email) + optional note. No accounts |
| Offer model | Per item: **Fixed price**, **Open to offers**, or **Free** |
| Asking price | Optional on "Open to offers"; required on "Fixed price"; none on "Free" |
| Original price | Optional field, shown struck-through as an anchor |
| Offer visibility (Open to offers) | Public sees top offer amount only, no names |
| Who gets the item | I always pick, for every mode. No first-come auto-reserve |
| After I accept | Item shows **Reserved**; others can still join as backups; I mark **Gone** after collection, or release and promote a backup |
| Payment & pickup | Off-app. Admin view has WhatsApp / email buttons per request |
| Notifications | None. I check the admin page |
| Deadline | None. Items close when I mark them |
| Currency | GBP, whole pounds |
| Photos | Up to 5 per item, compressed in browser before upload |
| Listing fields | Title, photos, mode, asking price, original price, short description |
| Browse | Single photo grid. No filters, no sorting (newest first) |
| Look | Warm & friendly: soft colours, rounded cards, playful copy |
| Hosting | GitHub Pages (static) + Supabase (DB, storage, auth) |
| Routing | Hash routes (`#/item/:id`, `#/admin`) so deep links work on GitHub Pages without the 404 redirect hack |
| Frontend | Vite + React + TypeScript, plain CSS. No UI library |
| Admin login | One password field. Under the hood it's a single Supabase Auth user (email hardcoded in config), signups disabled. A password checked in client JS would leave buyers' contacts readable by anyone, since the Supabase key ships to the browser |
| Contact data retention | Wiped 30 days after item marked Gone (pg_cron job) |
| Free-tier pause | GitHub Action pings Supabase every 3 days so the project doesn't pause |

## Implementation milestones

Dependency graph: M1 → M2 → (M3 ∥ M4) → M5 → M6. M3 and M4 can run in parallel once M2 lands.

### M1 - Supabase project and schema

Database, storage and security rules. Unblocks everything.

- [ ] Create Supabase project (free plan), region London (`eu-west-2`)
- [ ] Auth: disable public signups; create one user with my email + password
- [ ] Table `items`: `id uuid pk`, `title text not null (≤60 chars)`, `description text (≤500)`, `mode text check in ('fixed','offers','free')`, `asking_price int null`, `original_price int null`, `status text check in ('available','reserved','gone','hidden') default 'available'`, `created_at`, `gone_at timestamptz null`, `sort_order int`
- [ ] Check constraint: `mode='fixed'` requires `asking_price > 0`; `mode='free'` requires `asking_price is null`
- [ ] Table `item_photos`: `id`, `item_id fk on delete cascade`, `path text`, `position int (0-4)`; unique `(item_id, position)`
- [ ] Table `requests`: `id`, `item_id fk`, `name text not null (≤60)`, `contact text not null (≤100)`, `amount int null`, `note text (≤300)`, `status text check in ('pending','accepted','backup','declined') default 'pending'`, `created_at`
- [ ] Check constraint on `requests`: `amount` required and > 0 for offers; must equal item asking price for fixed (enforced via insert trigger); null for free
- [ ] Insert trigger rejects requests on items with status `gone` or `hidden`
- [ ] Storage bucket `photos`: public read, write for authenticated only
- [ ] RLS `items`, `item_photos`: anon `select` where status ≠ `hidden`; authenticated full access
- [ ] RLS `requests`: anon `insert` only (no select/update/delete); authenticated full access
- [ ] View/RPC `public_item_stats(item_id)` (security definer): returns `top_offer` (max amount, offers mode only) and `request_count`. No names, no contacts
- [ ] Enable Cron module; schedule daily job: set `name='(removed)'`, `contact='(removed)'`, `note=null` on requests whose item has `gone_at < now() - interval '30 days'`
- [ ] Commit all SQL as `supabase/schema.sql` so it can be re-run on a fresh project

### M2 - App shell and public grid

Static site skeleton, deploy pipeline and the buyer-facing grid.

- [ ] Vite + React + TS scaffold; `HashRouter`; `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`
- [ ] GitHub Action: build on push to `main`, deploy to GitHub Pages; Vite `base` set to repo name
- [ ] `<meta name="robots" content="noindex">`; Open Graph tags so the link previews nicely in WhatsApp (title, first item photo or a static cover image)
- [ ] Design tokens in `src/styles/tokens.css`: cream background, one warm accent (terracotta), soft green for Free, 16px card radius, system font stack with a rounded display font for headings (illustrative - confirm in implementation)
- [ ] Home `#/`: header "Maria's clear-out" + subline "Everything must go (to a good home). Tap anything you like."
- [ ] 2-column photo grid on phone, 3 on tablet, 4 on desktop; newest first; lazy-loaded images
- [ ] Card shows: first photo (square crop), title, price badge, status ribbon
- [ ] Price badge copy: Fixed → "£40"; Offers with asking → "Offers · ask £40"; Offers without asking → "Make an offer"; Free → "Free"
- [ ] Original price shown struck-through next to badge when set, e.g. ~~£120~~
- [ ] Status ribbon: Reserved → "Reserved (backups welcome)"; Gone → greyed card with "Gone 👋"; Gone items sink to the bottom
- [ ] Empty state: "All gone! Thanks everyone 💛"
- [ ] Loading skeletons for cards; friendly error "Couldn't load the goodies. Try again in a sec." with retry

### M3 - Item page and request form

What buyers see and submit. Depends on M2.

- [ ] `#/item/:id`: swipeable photo carousel (up to 5, dot indicators), title, price badge, original price, description
- [ ] Offers mode: line "Top offer so far: £35" (or "No offers yet, be the first") from `public_item_stats`
- [ ] Any mode: line "3 people have asked" when count > 0
- [ ] Single CTA button per mode: Fixed → "I'll take it for £40"; Offers → "Make an offer"; Free → "I'd love this"; Reserved → "Join the backup list"
- [ ] Bottom-sheet form: Name, "WhatsApp number or email", amount (offers only, £ prefix, whole numbers), note ("Anything I should know? e.g. when you can collect")
- [ ] Offers mode helper text under amount: "Your max price. I'll be in touch if it's yours."
- [ ] Client validation mirrors DB constraints; contact must look like a phone (≥7 digits) or an email
- [ ] Hidden honeypot field; submit disabled for 3s after page load (basic bot friction)
- [ ] Remember name + contact in `localStorage` (try/catch) to prefill next request
- [ ] Success screen: "Got it! I'll message you if it's yours. Fingers crossed 🤞" + "Back to everything"
- [ ] Gone item page: no CTA, banner "This one's found a new home"
- [ ] Share button (Web Share API, fallback copy link)

### M4 - Admin: login and listing

Fast listing from my phone. Depends on M1, M2. Parallel with M3.

- [ ] `#/admin`: single password field + "Let me in"; signs in with `VITE_ADMIN_EMAIL` + password via Supabase Auth; session persists
- [ ] Wrong password copy: "Nope, try again"
- [ ] "Add item" flow on one screen: photo picker (`accept="image/*"`, `capture` allowed, multi-select up to 5), title, mode as 3 big toggle chips (Fixed / Offers / Free), asking price, original price, description (collapsed by default), "Post it" button
- [ ] Client-side compression before upload: longest edge 1600px, WebP ~0.8 quality, strip EXIF (removes location data) (illustrative - confirm in implementation)
- [ ] Upload photos in parallel with a progress bar; item saved only after all uploads succeed; failed upload shows retry per photo
- [ ] Drag/arrow to reorder photos; first photo is the cover
- [ ] After "Post it": toast "Posted ✨" and form resets for the next item (keep mode selection)
- [ ] Edit item: all fields, add/remove photos, change mode, hide/unhide
- [ ] Delete item (confirm dialog) removes rows and storage files
- [ ] Stats strip at top: "12 listed · 4 reserved · 7 gone · £215 agreed"

### M5 - Admin: requests and handover

Pick winners, manage backups, close items. Depends on M3, M4.

- [ ] Admin item list with request count badge; items with pending requests first
- [ ] Item detail shows requests sorted: offers by amount desc, else by time asc; each row shows name, contact, amount, note, time ago
- [ ] Per row buttons: "WhatsApp" (`https://wa.me/<digits>` with prefilled text "Hi <name>! It's Maria about the <title> — it's yours if you still want it 🙂") or "Email" (`mailto:` with same text), "Accept", "Decline"
- [ ] Accept: request → `accepted`, item → `reserved`, other pending requests → `backup`
- [ ] Reserved item: "Mark as gone" (sets `status='gone'`, `gone_at=now()`) and "Fell through" (accepted request → `declined`, item → `available`, backups → `pending`, highest/earliest highlighted as next)
- [ ] New requests arriving on a reserved item land as `backup`
- [ ] Final agreed amount stored on the accepted request (editable, in case we settle on a different price) and summed in the stats strip

### M6 - Verification

Run before sharing the link.

- [ ] `npm run build` and `tsc --noEmit` pass; GitHub Pages deploy green
- [ ] Deep link `…/#/item/<id>` opens correctly in a fresh tab and from a WhatsApp message
- [ ] RLS check: with the anon key, `select * from requests` returns 0 rows; `update items` fails; `public_item_stats` returns no names/contacts
- [ ] Signups disabled: attempting `auth.signUp` with the anon key fails
- [ ] Fixed-price request with wrong amount rejected by DB; request on a Gone item rejected
- [ ] Phone smoke test (iOS Safari + Android Chrome): list 5 real items, time each, median < 60s
- [ ] Submit fixed, offer, free and backup requests from a second phone; all appear in admin
- [ ] Accept → Fell through → backup promoted flow works end to end
- [ ] Uploaded photo has no GPS EXIF (check with an EXIF viewer)
- [ ] Cron job visible in Supabase dashboard; manually backdate a `gone_at` and run it, contacts wiped
- [ ] Keep-alive Action runs successfully once
- [ ] Lighthouse mobile: performance ≥ 85, accessibility ≥ 90 (illustrative - confirm in implementation)

## Out of scope / future additions

- In-app payments (Stripe) - *deliberate; cash/bank transfer on collection is fine for a clear-out*
- Buyer accounts or "my requests" page - *deliberate; name + contact is enough*
- Email/Telegram notifications on new requests - *deferred; add a Supabase webhook → Telegram bot if I start missing requests*
- Categories, filters, search, sorting - *deliberate; grid only for v1*
- Auction end times / countdowns - *deliberate; no deadline*
- Multiple sellers (e.g. David listing his stuff) - *deferred; separate PRD if someone else wants in*
- Auto-messaging buyers - *deliberate; I send every message myself*
- Cloudflare Pages hosting - *deferred; switch if GitHub Pages limits bite. Same build works*
- AI auto-fill of title/description from photo - *deferred; nice-to-have if listing speed misses the 60s target*

## Open questions to resolve during implementation

- App name and URL slug (repo name sets the GitHub Pages path)
- Exact accent colours and display font once seen on a real phone
- Whether a static cover image or the newest item's photo works better as the WhatsApp link preview
- Compression settings: check a 5-photo listing stays fast on mobile data

## Pre-mortem flags

**Technical risks:**
- Supabase free projects pause after 1 week of inactivity; if I stop listing for a week mid-clear-out, the link dies. Caught by the keep-alive Action (M1/M6).
- Anyone with the link can spam the requests table (anon insert). Mitigated by honeypot + length limits (M3); if spam appears, add a per-contact rate limit trigger. Caught in M6 smoke test.
- Phone photos are 3-8MB each; uncompressed, 1GB storage fills at ~150 items and listing on mobile data crawls. Caught by compression in M4.
- Raw phone photos carry GPS EXIF that would publish my home location. Caught by EXIF strip in M4 and checked in M6.
- GitHub Pages refresh on a non-root path 404s. Avoided by hash routing (M2), checked in M6.
- WhatsApp `wa.me` links need international format; UK numbers typed as `07…` must be converted to `447…`. Handle in M5.

**Strategic risks:**
- Success depends on people actually opening the link. If it's only shared once, items stall. Mitigation: share button (M3) and nice link previews (M2) make re-sharing easy.
- "I always pick" means requests sit pending until I check. With no notifications, slow responses could lose interested buyers. If this bites, pull forward the Telegram ping from Out of scope.
- Hidden "top offer" anchoring: showing the top offer may stop people offering above asking. Acceptable for a clear-out where speed beats price.

**Constraints check:** No milestone takes an automated real-world action; all buyer messages are manual. Contact data is admin-only via RLS and auto-wiped. No conflicts.

## Research grounding

Checked 2026-11-21 via web search.

- Supabase Free: 500 MB database per project, 1 GB file storage, 5 GB egress, 2 active projects; free projects pause after 1 week of inactivity - source: https://supabase.com/pricing
- Supabase Cron (pg_cron) can schedule SQL deletes/updates on a cron schedule from the dashboard or SQL - source: https://supabase.com/docs/guides/cron/quickstart
- GitHub Pages has no native SPA routing; fresh loads of client-side paths 404 unless using a 404.html redirect or hash routing - source: https://github.com/rafgraph/spa-github-pages
