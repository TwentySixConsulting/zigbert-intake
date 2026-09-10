# Setting this up

Four steps. Three of them need the Supabase dashboard, because creating a table and
wiring a webhook cannot be done with the anon key the site uses.

Check your progress at any point with:

```bash
python3 test/live_check.py
```

---

## 1. Create the table

Supabase → **SQL Editor** → paste the whole of [`supabase/intake.sql`](supabase/intake.sql) → **Run**.

That creates `public.intake_submissions`, turns on row-level security, and allows the
anon key to INSERT and nothing else. Re-running it is safe.

Verify: `python3 test/live_check.py` should now pass the Table, Security and
Constraints sections.

## 2. Set the email secrets

The two functions send through [Resend](https://resend.com). The waitlist already uses
it, so the key probably exists; set it again only if `functions list` shows nothing.

```bash
supabase login
supabase link --project-ref taveeeeesxlgunibcoov
supabase secrets set RESEND_API_KEY=re_your_key
supabase secrets set FROM_EMAIL="TwentySix Consulting <hello@twentysixconsulting.co.uk>"
```

`FROM_EMAIL` must be a domain you have verified in Resend. If it is not verified yet,
leave it unset: the functions fall back to Resend's test sender, which works for
checking the wiring but will land in spam for a real client.

## 3. Deploy the two functions

```bash
supabase functions deploy intake-confirmation
supabase functions deploy intake-notify
```

- `intake-confirmation` emails the **client**: we have your N roles, here is what happens next.
- `intake-notify` emails **millieharrison@twentysixconsulting.co.uk** only, with the
  submission details and the roles attached as a CSV ready for the dashboard build.

## 4. Point two webhooks at them

Supabase → **Database → Webhooks** → **Create a new hook**, twice:

| | Hook 1 | Hook 2 |
|---|---|---|
| Name | `intake-confirmation` | `intake-notify` |
| Table | `intake_submissions` | `intake_submissions` |
| Events | Insert | Insert |
| Type | Supabase Edge Functions | Supabase Edge Functions |
| Function | `intake-confirmation` | `intake-notify` |

## 5. Prove it works

```bash
python3 test/live_check.py --write
```

This inserts one real row, which fires both webhooks. Check both inboxes. The row is
labelled **TwentySix internal test** so you can find and delete it afterwards.

---

## Sending it to a client

The link is https://twentysixconsulting.github.io/zigbert-intake/ and it needs no
login. It is `noindex`, so it will not turn up in a search, but treat the URL as
semi-public: anyone with it can submit. That is deliberate, so a client can forward it
to whoever actually holds the salary data.

## Reading what comes in

The anon key cannot read submissions, by design. To see them, use the Supabase
dashboard (**Table Editor → intake_submissions**), or the notification email, which
carries the roles as a CSV attachment.

## Changing the template

`build/build_template.py` generates `public/Zigbert-Benchmarking-Template.xlsx`.
Edit the script, run `npm run template`, rebuild, push.

If you change a **column heading**, check `COLUMNS` in `src/lib/parseRoles.ts`. The
parser matches headings by name, so a renamed column is the one change that can break
the upload path silently. `node test/parse.test.mjs` fills the real template and reads
it back, so it will catch it.
