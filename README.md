# TwentySix benchmarking intake

A standalone sign-up sheet. Send a client the link; they give us their details and the
roles they want benchmarked, either typed straight in or on our spreadsheet. It lands in
Supabase, and two emails go out: a confirmation to them, and a notification to us with
the roles attached as a CSV, ready to build their dashboard.

**Live:** https://twentysixconsulting.github.io/twentysix-intake/
**Setup:** [SETUP.md](SETUP.md) — the table, the emails and the webhooks need doing once.

## How it works

1. **Their details** and **their organisation**, which is what sets the comparator group.
2. **Their roles**, whichever way suits them:
   - typed in, a row at a time, for a handful; or
   - our xlsx template, downloaded, filled in and uploaded back.
3. The file is read **in their browser** and shown back to them before anything is sent,
   so a mangled spreadsheet is caught by the person who can fix it.
4. One INSERT into `public.intake_submissions`. Two webhooks fire the two emails.

## Running it

```bash
npm install
cp .env.example .env.local     # same Supabase project as the waitlist
npm run dev
```

```bash
npm run build                  # typecheck + production build
npm run template               # regenerate the xlsx from build/build_template.py
node test/parse.test.mjs       # parser, against a filled copy of the real template
python3 test/form_test.py      # the whole form in a browser (needs the build served)
python3 test/live_check.py     # the live Supabase wiring
```

`form_test.py` expects the build served at `http://localhost:4200/twentysix-intake/`:

```bash
npm run build && mkdir -p /tmp/serve && cp -R dist /tmp/serve/twentysix-intake \
  && (cd /tmp/serve && python3 -m http.server 4200 &)
```

Use a plain static server rather than `vite preview`, which 404s the hashed entry
chunk under a base path in Chromium.

## The one thing that is safe to publish

The anon key ships in the build. That is what it is for: row-level security allows
INSERT and nothing else, so it cannot read a single submission back. Salaries go in and
never come out through the public site. Read them in the Supabase dashboard or from the
notification email.
