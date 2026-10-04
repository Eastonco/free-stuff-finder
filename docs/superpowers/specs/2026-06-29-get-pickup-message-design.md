# GET — AI-drafted pickup message

## Goal

Add a **GET** button to listings in the admin UI. Clicking it generates a short,
human-sounding message the user can send to a free-stuff seller: references the
actual item, says the user can pick it up today, and gives a phone number to
text. The message is AI-generated so each one reads differently — blasting
identical copy to many sellers is what looks like spam / a bot.

## Decisions (locked)

- **Delivery: draft-only.** Button produces text + a **Copy** action and opens
  the listing. The user pastes into the listing's own reply form and sends.
  No server-side email send, no scraping the seller's relay address, no
  ToS automation risk.
- **Config: per-user**, edited in the existing public profile form.
- **Button location: both** the listing detail page (`/admin/listings/[id]`) and
  each row of the listings list (`/admin/listings`).
- **Model: `claude-haiku-4-5`** via the Anthropic Messages API. A 3-sentence
  message is trivial; pennies per click, near-instant.
- **AI call uses plain `fetch`** against the Messages API, reusing the existing
  `ANTHROPIC_API_KEY`. No new npm dependency.
- **Description fetched on-demand at GET time** (not stored). The draft action
  fetches the listing's CL page and extracts the post body. No new column, no
  extra scraper load. Falls back to title-only if the fetch is blocked/fails.
- **"Available today" is not a field** — it is baked into the prompt (always on).

## Data

Two nullable columns on `users`:

| column         | type | meaning                                              |
|----------------|------|------------------------------------------------------|
| `pickup_phone` | text | phone the AI tells the seller to text (optional)     |
| `pickup_note`  | text | free-text the AI weaves in, e.g. "have a truck"      |

- `backend/models.py` owns the real schema (SQLAlchemy). Add both columns there
  and to the typed mirror `web/db/schema.ts`.
- **Migration required:** `init_db` calls `create_all`, which does **not** add
  columns to an existing table. After deploy, run once:
  ```sql
  ALTER TABLE users ADD COLUMN pickup_phone text, ADD COLUMN pickup_note text;
  ```
  Both columns are nullable, so existing rows are unaffected.

## Components

### 1. Config UI — `web/app/profile-form.tsx`
Add two optional inputs after the notify section:
- **Pickup phone** — "the AI tells sellers to text you here".
- **Note for sellers** — textarea, e.g. "I'm flexible on timing, have a truck".

### 2. Persistence — `web/app/actions.ts`
- Extend `FormValues` with `pickupPhone`, `pickupNote`.
- `readForm` reads them; `createProfile` / `updateProfile` persist them (trimmed,
  empty string → null) on the `users` row.

### 3. Validation — `web/lib/validate.ts`
- `pickup_phone` optional; if non-empty it must match the existing E.164 regex.
- `pickup_note` free-text, length-capped (e.g. ≤ 280 chars) to bound prompt size.

### 4. AI generation — `web/app/admin/listings/actions.ts` (new)
`"use server"` module:
- `extractPostingBody(html)` — **pure function**, pulls the description text from
  CL listing HTML (the `#postingbody` section), strips tags/whitespace, caps
  length (e.g. ≤ 1500 chars) to bound prompt size. Returns `""` if not found.
- `fetchDescription(link)` — `fetch`es the CL listing page with a normal
  User-Agent, runs `extractPostingBody`. Returns `""` on any error (blocked,
  timeout, non-200) so drafting always proceeds.
- `buildPrompt({ name, phone, note, title, location, description })` — **pure
  function**, returns the user-message string sent to the model. Instructs:
  short, casual, first-person, reference specifics from the actual item +
  description, ask if it's still available, offer same-day pickup, include the
  phone, sound like a real person — not salesy, not templated, not AI-generated.
  When `description` is empty, the prompt leans on the title only.
- `draftPickupMessage(listingId)` — loads listing + owner (reuse / extend
  `getListing`), calls `fetchDescription(listing.link)`, then the Anthropic
  Messages API via `fetch` with `claude-haiku-4-5`, returns the generated text.
  Throws a friendly error if `ANTHROPIC_API_KEY` is missing or the LLM call
  fails (a failed *description* fetch is non-fatal — see above).

### 5. UI component — `web/app/admin/listings/get-button.tsx` (new, client)
- Radix `Dialog` triggered by a **GET** button.
- On open: calls `draftPickupMessage(listingId)`, shows a loading state, then an
  **editable** textarea with the draft (user can tweak before sending).
- **Copy** button copies the (possibly edited) text and opens the CL listing in
  a new tab.
- Used in **both**:
  - `web/app/admin/listings/[id]/page.tsx` — one button near the CL link.
  - `web/app/admin/listings/page.tsx` — one button per table row (new column).

## Error handling

- Missing `ANTHROPIC_API_KEY` or API failure → dialog shows a readable error,
  not a crash.
- Owner has no `pickup_phone` → still generate (message just omits the text-me
  line); the prompt handles an empty phone gracefully.

## Testing

One assert-based self-check (no framework) covering the only non-trivial pure
logic:
- `buildPrompt()` includes the title, name, phone, note, and description when
  provided, and omits the phone line cleanly when phone is empty.
- `extractPostingBody()` pulls text from a sample `#postingbody` HTML snippet
  and returns `""` when the section is absent.
- `validate` rejects a malformed `pickup_phone` and accepts an empty one.

The Anthropic `fetch` call itself is not unit-tested (network/LLM boundary);
it is exercised manually via the button.

## Explicitly out of scope (YAGNI)

- Saving/storing generated drafts.
- `mailto:` (we don't have the seller's relay address) and server-side auto-send.
- Texting the seller directly (most free listings expose no phone).
- Admin user-form editing of pickup fields (profile form is the chosen surface).
- A per-listing "available today" toggle (always-on in the prompt).
