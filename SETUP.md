# Setting this up

Two steps now, not four. The Resend key is already set on this Supabase project
(the waitlist uses it), so the email side needs no new secrets.

Check progress at any point with:

```bash
python3 test/live_check.py
```

---

## 1. Create the table and the email triggers

One paste. Supabase → **SQL Editor** → paste the whole of
`~/Desktop/zigbert-intake-setup.sql` → **Run**. Safe to re-run.

That file is [`supabase/intake.sql`](supabase/intake.sql) and
[`supabase/webhooks.sql`](supabase/webhooks.sql) joined together with the anon key
filled in. It creates `public.intake_submissions`, turns on row-level security so
the anon key may INSERT and nothing else, and adds the two triggers that fire the
emails on insert.

If it stops with *"Database Webhooks are not enabled on this project yet"*, open
**Database → Webhooks** once (creating and deleting any hook is enough to install
the plumbing), then run the file again.

## 2. Deploy the two functions

```bash
supabase login
supabase link --project-ref taveeeeesxlgunibcoov
supabase functions deploy intake-confirmation
supabase functions deploy intake-notify
```

- `intake-confirmation` emails the **client**: we have your N rows, here is what happens next.
- `intake-notify` emails **millieharrison@twentysixconsulting.co.uk** only, with the
  submission details and the rows attached as a CSV ready for the dashboard build.

They pick up `RESEND_API_KEY` from the project automatically. Set `FROM_EMAIL` too if
you want them sent from a verified domain rather than Resend's test sender:

```bash
supabase secrets set FROM_EMAIL="Zigbert <hello@twentysixconsulting.co.uk>"
```

## 3. Verify the sending domain in Resend

**The one thing still outstanding.** Client confirmations do not send until this is
done. Resend returns:

> The twentysixconsulting.co.uk domain is not verified

Add **twentysixconsulting.co.uk** at [resend.com/domains](https://resend.com/domains)
and put the DNS records it gives you on the domain. No code change is needed after
that; the function already sends from `hello@twentysixconsulting.co.uk`.

Resend's fallback sender (`onboarding@resend.dev`) is **not** a workaround: it only
delivers to the Resend account owner, so a real client would still get nothing.

Until it is verified, a failed confirmation emails **you** instead, saying whose it
was and that their submission was still saved, so nobody is left waiting silently.

The consultant notification is unaffected and already works.

## 4. Prove it works

```bash
python3 test/live_check.py --write
```

Inserts one real row, which fires both triggers. Check both inboxes. The row is
labelled **Zigbert internal test** so you can find and delete it afterwards.

---

## Which Supabase project this uses

`taveeeeesxlgunibcoov`, the same one as the waitlist. The intake is a **table
alongside** `waitlist`, not a project of its own, so there is one place to look for
everything. To move it, change `.env.local` and the two repo secrets
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), update the function URLs in
`supabase/webhooks.sql`, and run the SQL against the new project.

## Sending it to a client

https://twentysixconsulting.github.io/zigbert-intake/ — no login. It is `noindex`, so
it will not turn up in a search, but treat the URL as semi-public: anyone with it can
submit. That is deliberate, so a client can forward it to whoever holds the salary data.

## Reading what comes in

The anon key cannot read submissions, by design. Use the Supabase dashboard
(**Table Editor → intake_submissions**), or the notification email, which carries the
rows as a CSV attachment.

## Changing the template

`build/build_template.py` generates `public/Zigbert-Benchmarking-Template.xlsx`. Edit,
run `npm run template`, rebuild, push.

If you change a **column heading**, check `COLUMNS` in `src/lib/parseRoles.ts`. The
parser matches headings by name, so a renamed column is the one change that can break
the upload path silently. `node test/parse.test.mjs` fills the real template and reads
it back, so it will catch it.

There is deliberately **no sheet protection**: a locked sheet blocks pasting a block,
inserting a row and sorting, and the parser tolerates a mangled sheet anyway.
