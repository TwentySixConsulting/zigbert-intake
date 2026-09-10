"""Check the live Supabase wiring, end to end.

Run after applying supabase/intake.sql. With --write it inserts a real row so the
INSERT webhooks fire and both emails actually send, which is the only way to prove
the email side works. Without it, nothing is written.

    python3 test/live_check.py            # read-only checks
    python3 test/live_check.py --write     # also insert a real test submission
"""
import json, os, sys, urllib.request, urllib.error, pathlib, re

env = {}
p = pathlib.Path(__file__).resolve().parent.parent / ".env.local"
if p.exists():
    for line in p.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m: env[m.group(1)] = m.group(2).strip().strip('"')
URL = env.get("VITE_SUPABASE_URL", "").rstrip("/")
KEY = env.get("VITE_SUPABASE_ANON_KEY", "")
TABLE = "intake_submissions"
ok = bad = 0

def check(good, msg, detail=""):
    global ok, bad
    if good: ok += 1; print("  ok  ", msg)
    else:    bad += 1; print("  FAIL", msg, ("\n         " + detail) if detail else "")

def call(method, path, body=None):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)

print("Credentials")
check(bool(URL and KEY), "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set")
if not (URL and KEY): sys.exit(1)
print(f"       project: {URL}")

print("\nTable")
status, body = call("GET", f"{TABLE}?select=id&limit=1")
exists = status == 200
check(exists, f"public.{TABLE} exists and the anon key can reach it",
      f"HTTP {status}: {body[:180]}\n         Apply supabase/intake.sql in the SQL editor.")

if exists:
    print("\nSecurity")
    # RLS with no SELECT policy returns 200 and an empty array, never other people's rows.
    check(body.strip() in ("[]", ""), "the anon key cannot read submissions back",
          f"it returned: {body[:160]}")

    print("\nConstraints")
    s, b = call("POST", TABLE, {"contact_name": "x", "contact_email": "not-an-email",
                                "organisation": "x", "roles": []})
    check(s >= 400 and "intake_email_shape" in b, "a malformed email is rejected by the database",
          f"HTTP {s}: {b[:160]}")
    s, b = call("POST", TABLE, {"contact_name": "x", "contact_email": "a@b.co",
                                "organisation": "x", "roles": {"not": "an array"}})
    check(s >= 400, "a roles value that is not an array is rejected", f"HTTP {s}: {b[:160]}")

    if "--write" in sys.argv:
        print("\nReal insert (this fires the webhooks and sends both emails)")
        row = {
            "contact_name": "Intake Test", "contact_email": env.get("TEST_EMAIL", "millieharrison@twentysixconsulting.co.uk"),
            "contact_job_title": "Automated check", "organisation": "TwentySix internal test",
            "industry": "Charity", "employee_count": "40", "main_location": "London",
            "entry_mode": "online", "notes": "Automated live check. Safe to delete.",
            "roles": [
                {"title": "Chief Executive", "salary": 95000, "level": "Experts, Strategists & Leaders",
                 "family": "Leadership", "location": "London", "headcount": 1},
                {"title": "Grants Manager", "salary": 48000, "level": "Mid to Senior",
                 "family": "Programmes", "location": "Remote (UK)", "headcount": 3},
            ],
        }
        s, b = call("POST", TABLE, row)
        check(s in (200, 201, 204), f"a real submission inserts (HTTP {s})", b[:200])
        if s in (200, 201, 204):
            print("       Check both inboxes now:")
            print(f"         client confirmation -> {row['contact_email']}")
            print( "         consultant notice   -> millieharrison@twentysixconsulting.co.uk")
            print( "       Delete the row afterwards: it is labelled 'TwentySix internal test'.")
    else:
        print("\n(Run with --write to insert a real row and test both emails.)")

print(f"\n{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
